import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, type Database, WriteConflictError } from '../server/db';
import { field, HttpError } from '../server/http';
import type { AgentConfig } from '../platform/agents';
import type { PlatformRecord } from '../platform/contracts';
import { compileAgentContext } from '../voice/context';
import { getVoiceConfiguration, normalizeAzureRealtimeEndpoint } from '../voice/config';
import { buildVoiceSession } from '../voice/session-config';
import { resolveSpeechDelivery } from '../voice/speech-delivery';
import { RELATIONAL_SOURCE_REVISION } from '../voice/relational-runtime';
import { getActiveMembership, operatorMembershipFence } from '../team/service';
import { beginVoiceAttempt, closeOwnedVoiceAttempt, markAttemptProvisioning } from '../usage/service';
import type { UsageDependencies } from '../usage/contracts';
import { createEvaluationAudioArtifact, readEvaluationAudioArtifact } from './audio-artifacts';
import { parseProofWave, runAzureRealtimeAudioProof, synthesizeSyntheticCaller, SyntheticCallerFailure, type RealtimeProofInput, type RealtimeProofResult, type SyntheticCallerInput, type SyntheticCallerResult } from './audio-runner';
import {
  AUDIO_PROOF_DISCLAIMER,
  AUDIO_PROOF_SCENARIOS,
  audioProofScenario,
  type AudioArtifactRef,
  type AudioListeningReviewData,
  type AudioProofRecord,
  type AudioProofRunData,
  type AudioProofRunManifest,
  type SyntheticFixtureData,
} from './audio-schema';

type Row = { id: string; data: string; status: string; created_at: string };
type AgentVersion = { agentId: string; number: number; config: AgentConfig; knowledgeDigests: Record<string, string>; sourceRevision: number };
type Admission = {
  begin: typeof beginVoiceAttempt;
  mark: typeof markAttemptProvisioning;
  close: typeof closeOwnedVoiceAttempt;
};
export type AudioProofDependencies = {
  database?: Database;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  synthesize?: (input: SyntheticCallerInput) => Promise<SyntheticCallerResult>;
  realtime?: (input: RealtimeProofInput) => Promise<RealtimeProofResult>;
  admission?: Admission;
};

const kinds = { fixture: 'eval:audio_fixture', run: 'eval:audio_run', review: 'eval:listening_review' } as const;
const sha = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const safeRequest = (body: Record<string, unknown>) => {
  const requestId = field(body, 'requestId', 100);
  if (!/^[A-Za-z0-9:_.-]{8,100}$/.test(requestId)) throw new HttpError(400, 'Use a bounded audio proof request ID.');
  return requestId;
};
const artifactRef = (metadata: Awaited<ReturnType<typeof createEvaluationAudioArtifact>>): AudioArtifactRef => ({
  id: metadata.id, sha256: metadata.sha256, mimeType: metadata.mimeType, bytes: metadata.byteLength,
  durationMs: metadata.durationMs, sampleRate: metadata.sampleRate, channels: metadata.channels,
  expiresAt: metadata.expiresAt, playbackUrl: `/api/evaluations/audio/${encodeURIComponent(metadata.id)}`,
});
const decode = <T>(row: Row): AudioProofRecord<T> => ({ id: row.id, status: row.status as AudioProofRecord<T>['status'], createdAt: row.created_at, data: JSON.parse(row.data) as T });
const storeFor = (dependencies: AudioProofDependencies) => dependencies.database ? Promise.resolve(dependencies.database) : db();
const instant = (dependencies: AudioProofDependencies) => (dependencies.now?.() || new Date()).toISOString();
const admissionFor = (dependencies: AudioProofDependencies): Admission => dependencies.admission || { begin: beginVoiceAttempt, mark: markAttemptProvisioning, close: closeOwnedVoiceAttempt };
const usageDeps = (dependencies: AudioProofDependencies, database: Database): UsageDependencies => ({ database, env: dependencies.env || process.env, now: dependencies.now });

async function rows<T>(user: AuthUser, kind: string, database: Database): Promise<AudioProofRecord<T>[]> {
  return (await database.all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC,id DESC', [user.organizationId, kind])).map(decode<T>);
}
async function one<T>(user: AuthUser, kind: string, id: string, database: Database): Promise<AudioProofRecord<T>> {
  const [row] = await database.all<Row>('SELECT id,data,status,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, kind]);
  if (!row) throw new HttpError(404, 'Audio proof evidence was not found in this workspace.');
  return decode<T>(row);
}
async function insertPending<T extends object>(user: AuthUser, id: string, kind: string, data: T, database: Database, now: string): Promise<boolean> {
  try {
    await database.batch([await operatorMembershipFence(user, database),
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, kind, 'pending', JSON.stringify(data), now], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, `${kind}.pending`, now] },
    ]);
    return true;
  } catch (error) {
    if ((error instanceof WriteConflictError || /UNIQUE constraint|duplicate key/i.test(String(error))) && (await database.all('SELECT id FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, kind])).length) return false;
    throw error;
  }
}
async function finish<T extends object>(user: AuthUser, record: AudioProofRecord<T>, data: T, status: AudioProofRecord<T>['status'], database: Database, now: string) {
  try {
    await database.batch([await operatorMembershipFence(user, database),
      { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind IN (?,?) AND status=? AND data=?', params: [JSON.stringify(data), status, record.id, user.organizationId, kinds.fixture, kinds.run, 'pending', JSON.stringify(record.data)], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, record.id, `audio_proof.${status}`, now] },
    ]);
  } catch (error) {
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Audio proof evidence or operator access changed while the attempt was running.');
    throw error;
  }
  return { ...record, status, data };
}

async function platformRecord<T>(user: AuthUser, kind: string, id: string, database: Database): Promise<PlatformRecord<T>> {
  const [row] = await database.all<{ id: string; data: string; status: string; created_at: string }>('SELECT id,data,status,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, `platform:${kind}`]);
  if (!row) throw new HttpError(404, 'Agent version was not found in this workspace.');
  const stored = JSON.parse(row.data) as { revision: number; updatedAt: string; data: T };
  return { id: row.id, kind, status: row.status, createdAt: row.created_at, revision: stored.revision, updatedAt: stored.updatedAt, data: stored.data };
}
async function currentVersion(user: AuthUser, versionId: string, database: Database) {
  const version = await platformRecord<AgentVersion>(user, 'agent_version', versionId, database);
  if (version.status !== 'versioned' || !version.data.config || version.data.agentId === undefined || !Number.isSafeInteger(version.data.number) || !Number.isSafeInteger(version.data.sourceRevision) || !version.data.knowledgeDigests || typeof version.data.knowledgeDigests !== 'object') throw new HttpError(409, 'Choose an immutable reviewed agent version.');
  if (version.data.config.voiceProfile === 'maya-despina') throw new HttpError(409, 'This audio proof slice supports the approved Azure voice profile only.');
  if (version.data.config.liveVoice?.engine === 'azure-voice-live') throw new HttpError(409, 'This audio proof runner supports Azure OpenAI Realtime only. Azure Voice Live requires its own exact-engine proof runner.');
  const knowledge: PlatformRecord[] = [], current: Record<string, string> = {};
  for (const id of version.data.config.knowledgeIds) {
    const source = await platformRecord<Record<string, unknown>>(user, 'brain_source', id, database);
    if (source.status !== 'approved') throw new HttpError(409, 'Agent knowledge changed. Capture a new agent version before running audio proof.');
    const { title, content, sourceLabel, approvedAt } = source.data;
    current[id] = sha({ title, content, sourceLabel, revision: source.revision, approvedAt, status: source.status });
    knowledge.push(source);
  }
  if (JSON.stringify(current) !== JSON.stringify(version.data.knowledgeDigests)) throw new HttpError(409, 'Agent knowledge changed. Capture a new agent version before running audio proof.');
  return { version, knowledge, current };
}

export async function listAudioProofData(user: AuthUser, dependencies: AudioProofDependencies = {}) {
  const database = await storeFor(dependencies);
  const membership = await getActiveMembership(user);
  const [fixtures, runs, reviews] = await Promise.all([
    rows<SyntheticFixtureData>(user, kinds.fixture, database), rows<AudioProofRunData>(user, kinds.run, database), rows<AudioListeningReviewData>(user, kinds.review, database),
  ]);
  return { scenarios: AUDIO_PROOF_SCENARIOS, fixtures, runs, reviews, permissions: { canWrite: membership.role !== 'viewer' },
    evidenceBoundary: 'Audio artifacts and reviews are exact-run evidence. Counts remain descriptive; no benchmark or superiority statistic is computed.' };
}

export async function createSyntheticAudioFixture(user: AuthUser, body: Record<string, unknown>, dependencies: AudioProofDependencies = {}) {
  if (body.consent !== true) throw new HttpError(400, 'Confirm storage of the synthetic caller artifact for audio proof.');
  const requestId = safeRequest(body), scenario = audioProofScenario(field(body, 'scenarioId', 160));
  if (!scenario) throw new HttpError(404, 'Audio proof scenario was not found.');
  const database = await storeFor(dependencies), env = dependencies.env || process.env, now = instant(dependencies);
  await operatorMembershipFence(user, database);
  const voice = (env.AUDIO_PROOF_SYNTHESIS_VOICE || 'en-IN-NeerjaNeural').trim();
  if (!/^[A-Za-z0-9._-]{2,100}$/.test(voice)) throw new HttpError(503, 'Audio proof synthesis voice is misconfigured.');
  const requestHash = sha([scenario, voice]), id = `audio-fixture:${sha([user.organizationId, requestId])}`;
  const pending: SyntheticFixtureData = {
    schemaVersion: 1, requestHash, scenarioId: scenario.id, scenarioVersion: scenario.version, scenarioDigest: sha(scenario),
    provenance: { sourceKind: 'synthetic_azure_speech', synthetic: true, participantConsent: 'not_applicable_synthetic', generator: 'azure_speech_sdk', synthesisVoice: voice, sourceText: scenario.callerText, sourceTextDigest: sha(scenario.callerText) },
    captureConsent: { actorId: user.id, confirmedAt: now, scope: 'store_synthetic_input_for_audio_proof' }, disclaimer: AUDIO_PROOF_DISCLAIMER,
  };
  const inserted = await insertPending(user, id, kinds.fixture, pending, database, now);
  if (!inserted) {
    const prior = await one<SyntheticFixtureData>(user, kinds.fixture, id, database);
    if (prior.data.requestHash !== requestHash) throw new HttpError(409, 'This synthetic fixture request ID was already used for different input.');
    return prior;
  }
  const record = await one<SyntheticFixtureData>(user, kinds.fixture, id, database), admission = admissionFor(dependencies), usage = usageDeps(dependencies, database);
  let attemptId: string | undefined, providerClosed = false;
  try {
    const speechKey = env.AZURE_SPEECH_KEY, speechRegion = env.AZURE_SPEECH_REGION;
    if (!speechKey || !speechRegion || !/^[a-z][a-z0-9-]{1,40}$/.test(speechRegion)) throw new HttpError(503, 'Azure Speech synthetic caller generation is not configured.');
    const reserved = await admission.begin(user, { requestId: `audio-proof-fixture:${requestId}`, provider: 'azure', purpose: 'audio_proof', maxSeconds: 20 }, usage);
    attemptId = reserved.id;
    if (reserved.replayed || !await admission.mark(user, reserved.id, usage)) {
      return await finish(user, record, { ...pending, failureCode: 'transport_uncertain' }, 'uncertain', database, instant(dependencies));
    }
    const result = await (dependencies.synthesize || synthesizeSyntheticCaller)({ text: scenario.callerText, voice, key: speechKey, region: speechRegion });
    providerClosed = true;
    const parsed = parseProofWave(result.wave, 1_000_000);
    const artifact = await createEvaluationAudioArtifact(user, { bytes: result.wave, mimeType: 'audio/wav', durationMs: parsed.durationMs, sampleRate: parsed.sampleRate, channels: parsed.channels }, database);
    await admission.close(user, reserved.id, { outcome: 'complete' }, usage);
    return await finish(user, record, { ...pending, artifact: artifactRef(artifact) }, 'complete', database, instant(dependencies));
  } catch (error) {
    const cleanupConfirmed = providerClosed || (error instanceof SyntheticCallerFailure && error.closureConfirmed);
    const outcome = !attemptId || cleanupConfirmed ? 'failed' : 'uncertain';
    if (attemptId) await admission.close(user, attemptId, { outcome }, usage).catch(() => undefined);
    const code = !attemptId && error instanceof HttpError ? 'configuration_unavailable' : cleanupConfirmed ? 'provider_rejected' : 'transport_uncertain';
    await finish(user, record, { ...pending, failureCode: code }, outcome, database, instant(dependencies));
    throw error;
  }
}

export async function runAudioProof(user: AuthUser, body: Record<string, unknown>, dependencies: AudioProofDependencies = {}) {
  if (body.consent !== true) throw new HttpError(400, 'Confirm storage of synthetic input and AI output for this audio proof attempt.');
  const requestId = safeRequest(body), scenario = audioProofScenario(field(body, 'scenarioId', 160));
  if (!scenario) throw new HttpError(404, 'Audio proof scenario was not found.');
  const fixtureId = field(body, 'fixtureId', 160), agentVersionId = field(body, 'agentVersionId', 160);
  const database = await storeFor(dependencies), env = dependencies.env || process.env, now = instant(dependencies);
  await operatorMembershipFence(user, database);
  const requestHash = sha([scenario.id, fixtureId, agentVersionId]), id = `audio-run:${sha([user.organizationId, requestId])}`;
  const pending: AudioProofRunData = { schemaVersion: 1, requestHash, scenarioId: scenario.id, fixtureId, agentVersionId,
    uncertainty: ['The caller is synthetic and does not represent a human accent, microphone, device, room, or spontaneous conversation.', 'Azure does not expose the serving model weights revision or regional serving build.', 'Server timing does not measure browser playback or what a reviewer heard.'], disclaimer: AUDIO_PROOF_DISCLAIMER };
  const inserted = await insertPending(user, id, kinds.run, pending, database, now);
  if (!inserted) {
    const prior = await one<AudioProofRunData>(user, kinds.run, id, database);
    if (prior.data.requestHash !== requestHash) throw new HttpError(409, 'This audio proof request ID was already used for different input.');
    return prior;
  }
  const record = await one<AudioProofRunData>(user, kinds.run, id, database), admission = admissionFor(dependencies), usage = usageDeps(dependencies, database);
  let attemptId: string | undefined, providerStarted = false, providerClosed = false;
  try {
    const fixture = await one<SyntheticFixtureData>(user, kinds.fixture, fixtureId, database);
    if (fixture.status !== 'complete' || fixture.data.scenarioId !== scenario.id || !fixture.data.artifact) throw new HttpError(409, 'Choose the completed synthetic fixture for this exact scenario version.');
    const inputArtifact = await readEvaluationAudioArtifact(user, fixture.data.artifact.id, database);
    if (inputArtifact.metadata.sha256 !== fixture.data.artifact.sha256) throw new HttpError(409, 'Synthetic fixture integrity check failed.');
    const { version, knowledge, current } = await currentVersion(user, agentVersionId, database);
    const providerConfiguration = getVoiceConfiguration(env);
    const realtimeModel = env.AZURE_OPENAI_REALTIME_DEPLOYMENT;
    if (!providerConfiguration.configured || providerConfiguration.provider !== 'azure' || !normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT) || !env.AZURE_OPENAI_API_KEY || !realtimeModel || !/^[A-Za-z0-9._-]{2,120}$/.test(realtimeModel))
      throw new HttpError(503, 'The approved Azure Realtime path is not configured for audio proof.');
    const voice = (env.AZURE_OPENAI_REALTIME_VOICE || 'marin').trim();
    const context = await compileAgentContext(user, version.data.config, knowledge);
    const labInstructions = `${context.instructions}\n<audio_proof_protocol>Evaluation-only fictional synthetic caller. No contact identity, customer memory, tools, business actions, writes, or external side effects are available. Answer one caller turn.</audio_proof_protocol>`;
    const profile = version.data.config.speechDelivery;
    const session = buildVoiceSession(realtimeModel, labInstructions, voice, 'provider-default', [], context.speechVocabulary, { speechDelivery: profile });
    const sessionBase = JSON.parse(JSON.stringify(session));
    delete sessionBase.audio.output.speed;
    const manifest: AudioProofRunManifest = {
      schemaVersion: 1, protocol: 'azure_realtime_synthetic_audio_proof_v1', scenario, scenarioDigest: sha(scenario),
      fixture: { id: fixture.data.artifact.id, sha256: fixture.data.artifact.sha256, durationMs: fixture.data.artifact.durationMs, sampleRate: fixture.data.artifact.sampleRate, channels: fixture.data.artifact.channels },
      agent: { id: version.data.agentId, versionId: version.id, versionNumber: version.data.number, configDigest: sha(version.data.config), sourceRevision: version.data.sourceRevision },
      knowledgeDigests: current, contextDigest: context.contextDigest, promptDigest: sha(labInstructions), sessionConfigDigest: sha(session),
      provider: 'azure', apiSurface: 'azure_openai_realtime_websocket', modelReferenceDigest: sha(realtimeModel), providerEndpointDigest: sha(normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT)), voice,
      inputTranscription: 'gpt-4o-mini-transcribe', tools: 'disabled', memory: 'disabled_no_contact', businessActions: 'disabled',
      captureConsent: { actorId: user.id, confirmedAt: now, scope: 'store_synthetic_input_and_ai_output_for_audio_proof' }, startedAt: now, runnerVersion: 2,
      runtimeVersion: `speech-delivery-v1:${RELATIONAL_SOURCE_REVISION}`, sessionBaseDigest: sha(sessionBase),
      speechDelivery: { configuredProfile: profile || null, initialDecision: resolveSpeechDelivery(profile, []), providerAcknowledgement: { initial: false, final: false } },
      unknownProviderInternals: ['model_weights_revision', 'regional_serving_build'],
    };
    const reserved = await admission.begin(user, { requestId: `audio-proof-run:${requestId}`, provider: 'azure', purpose: 'audio_proof', maxSeconds: 45 }, usage);
    attemptId = reserved.id;
    if (reserved.replayed || !await admission.mark(user, reserved.id, usage)) return await finish(user, record, { ...pending, manifest, manifestDigest: sha(manifest), failureCode: 'transport_uncertain' }, 'uncertain', database, instant(dependencies));
    providerStarted = true;
    const result = await (dependencies.realtime || runAzureRealtimeAudioProof)({ wave: inputArtifact.bytes, session: session as unknown as Record<string, unknown>, settings: version.data.config, speechDelivery: profile,
      expectedCallerText: scenario.callerText, endpoint: env.AZURE_OPENAI_ENDPOINT!, apiKey: env.AZURE_OPENAI_API_KEY!, model: realtimeModel, deadlineMs: 45_000 });
    providerClosed = result.providerClosed;
    // Evidence may remain uncertain after a timeout or early close, while the
    // runner's confirmed socket-close receipt still releases owned capacity.
    await admission.close(user, reserved.id, { outcome: result.providerClosed ? (result.status === 'complete' ? 'complete' : 'failed') : 'uncertain' }, usage);
    const finalManifest = { ...manifest, ...(result.runtimePolicyDigest ? { runtimePolicyDigest: result.runtimePolicyDigest } : {}), ...(result.speechDelivery ? { speechDelivery: result.speechDelivery } : {}) };
    if (!result.providerClosed) return await finish(user, record, { ...pending, manifest: finalManifest, manifestDigest: sha(finalManifest), trace: result.trace, measurements: result.measurements, failureCode: 'transport_uncertain' }, 'uncertain', database, instant(dependencies));
    if (result.status !== 'complete' || !result.outputWave || !result.outputDurationMs) {
      return await finish(user, record, { ...pending, manifest: finalManifest, manifestDigest: sha(finalManifest), trace: result.trace, measurements: result.measurements, failureCode: result.failureCode || 'transport_uncertain' }, result.status, database, instant(dependencies));
    }
    const output = await createEvaluationAudioArtifact(user, { bytes: result.outputWave, mimeType: 'audio/wav', durationMs: result.outputDurationMs, sampleRate: 24000, channels: 1 }, database);
    const manifestDigest = sha(finalManifest);
    return await finish(user, record, { ...pending, manifest: finalManifest, manifestDigest, inputArtifact: artifactRef(inputArtifact.metadata), outputArtifact: artifactRef(output),
      transcript: { expectedCallerText: scenario.callerText, recognizedCallerText: result.recognizedCallerText, assistantText: result.assistantText }, trace: result.trace, measurements: result.measurements }, 'complete', database, instant(dependencies));
  } catch (error) {
    const outcome = providerStarted && !providerClosed ? 'uncertain' : 'failed';
    if (attemptId) await admission.close(user, attemptId, { outcome }, usage).catch(() => undefined);
    const failureCode = providerClosed ? 'audio_unavailable' : providerStarted ? 'transport_uncertain' : error instanceof HttpError && error.status < 500 ? 'authority_changed' : 'configuration_unavailable';
    await finish(user, record, { ...pending, failureCode }, outcome === 'uncertain' ? 'uncertain' : 'failed', database, instant(dependencies)).catch(() => undefined);
    throw error;
  }
}

export async function createAudioListeningReview(user: AuthUser, body: Record<string, unknown>, dependencies: AudioProofDependencies = {}) {
  if (body.heardOutput !== true) throw new HttpError(400, 'Confirm that you listened to the stored output before reviewing it.');
  const database = await storeFor(dependencies); await operatorMembershipFence(user, database);
  const run = await one<AudioProofRunData>(user, kinds.run, field(body, 'runId', 160), database);
  if (run.status !== 'complete' || !run.data.outputArtifact || !run.data.manifestDigest) throw new HttpError(409, 'Only a complete hash-verified audio proof run can be reviewed.');
  const scenario = audioProofScenario(run.data.scenarioId), criterionId = field(body, 'criterionId', 80);
  if (!scenario?.criteria.some(item => item.id === criterionId)) throw new HttpError(400, 'Choose a criterion from the run scenario.');
  const verdict = body.verdict;
  if (verdict !== 'met' && verdict !== 'not_met' && verdict !== 'uncertain') throw new HttpError(400, 'Choose met, not met, or uncertain.');
  const artifact = await readEvaluationAudioArtifact(user, run.data.outputArtifact.id, database);
  if (artifact.metadata.sha256 !== run.data.outputArtifact.sha256) throw new HttpError(409, 'The reviewed audio artifact no longer matches the run.');
  const data: AudioListeningReviewData = { schemaVersion: 1, runId: run.id, scenarioId: scenario.id, criterionId, verdict, reason: field(body, 'reason', 1000), operatorId: user.id,
    heardOutput: true, outputArtifactId: artifact.metadata.id, outputSha256: artifact.metadata.sha256, manifestDigest: run.data.manifestDigest,
    attestation: 'operator_reports_listening', disclaimer: 'The operator reports listening to this exact artifact. A player event or checkbox does not independently prove human listening.' };
  const id = randomUUID(), now = instant(dependencies);
  await database.batch([await operatorMembershipFence(user, database),
    { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, kinds.review, 'recorded', JSON.stringify(data), now] },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'audio_proof.review.recorded', now] },
  ]);
  return { id, status: 'recorded' as const, createdAt: now, data };
}
