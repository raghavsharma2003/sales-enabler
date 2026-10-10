import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { AgentConfig } from '../platform/agents';
import type { AuthUser } from '../server/auth';
import { db, type Database, WriteConflictError } from '../server/db';
import { field, HttpError } from '../server/http';
import { getActiveMembership, operatorMembershipFence } from '../team/service';
import { readEvaluationAudioArtifact } from './audio-artifacts';
import { audioProofScenario, type AudioProofRunData, type SyntheticFixtureData } from './audio-schema';
import type { SpeechDeliveryProfile } from '../voice/speech-delivery';

export const AUDIO_COMPARISON_DIMENSIONS = ['naturalness', 'pacing', 'intelligibility', 'warmth'] as const;
export type AudioComparisonDimension = typeof AUDIO_COMPARISON_DIMENSIONS[number];
export type AudioComparisonPreference = 'A' | 'B' | 'tie' | 'neither';
export type AudioComparisonKind = 'speech_delivery_pair' | 'identical_repeat';
export const AUDIO_COMPARISON_BOUNDARY = 'Label masking only, not scientific double-blinding. These are descriptive judgments of two exact synthetic-scenario recordings; generated wording can differ. No benchmark, win rate, causal improvement, promotion, or publication follows. Attestation and player events do not independently prove human listening.';
export type AudioComparisonRunOption = { id: string; createdAt: string; scenarioId: string; scenarioName: string; agentId: string; agentVersionId: string; versionNumber: number; speechDelivery: SpeechDeliveryProfile | null; outputExpiresAt: string };
export type AudioComparisonSummary = { id: string; createdAt: string; runIds: [string, string]; kind: AudioComparisonKind };
export type AudioComparisonReviewView = { dimension: AudioComparisonDimension; preference: AudioComparisonPreference; reason: string; createdAt: string };
export type AudioComparisonPacket = {
  comparisonId: string; assignmentId: string; scenario: { name: string; callerText: string };
  clips: Record<'A' | 'B', { playbackUrl: string; durationMs: number }>;
  reviews: AudioComparisonReviewView[]; evidenceBoundary: string;
  reveal?: Record<'A' | 'B', { runId: string; speechDelivery: SpeechDeliveryProfile | null }>;
};
type Dependencies = { database?: Database };
type Row = { id: string; data: string; status: string; created_at: string; kind: string };
type Statement = Parameters<Database['batch']>[0][number];
type Source = { runId: string; runDigest: string; manifestDigest: string; outputArtifactId: string; outputSha256: string; inputSha256: string; versionDigest: string };
type Comparison = { schemaVersion: 1; requestHash: string; kind: AudioComparisonKind; sources: [Source, Source]; creatorId: string };
type Assignment = { schemaVersion: 1; id: string; comparisonId: string; reviewerId: string; order: [0 | 1, 0 | 1]; sourceDigest: string };
type Review = AudioComparisonReviewView & { schemaVersion: 1; comparisonId: string; assignmentId: string; reviewerId: string; sourceDigest: string; sources: [Source, Source]; heardBoth: true; attestation: 'operator_reports_listening' };
const kinds = { comparison: 'eval:audio_comparison', request: 'eval:audio_comparison_request', assignment: 'eval:audio_comparison_assignment', review: 'eval:audio_comparison_review' };
const sha = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value, (_key, current) => current && typeof current === 'object' && !Array.isArray(current) ? Object.fromEntries(Object.keys(current).sort().map(key => [key, current[key]])) : current);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const storeFor = (deps: Dependencies) => deps.database ? Promise.resolve(deps.database) : db();
const unavailable = () => new HttpError(409, 'Choose two comparable complete runs with retained, verified audio and current comparison provenance.');
async function rowFor(user: AuthUser, kind: string, id: string, database: Database): Promise<Row> {
  const [row] = await database.all<Row>('SELECT id,data,status,created_at,kind FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, kind]);
  if (!row) throw new HttpError(404, 'Comparison evidence was not found in this workspace.');
  return row;
}
function rowFence(user: AuthUser, row: Row): Statement {
  return { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?', params: [row.data, row.id, user.organizationId, row.kind, row.status, row.data], expectedChanges: 1 };
}
async function insertOnce(user: AuthUser, id: string, kind: string, data: object, database: Database, guards: Statement[] = [], finalExpiryGuards: Statement[] = []) {
  const now = new Date().toISOString();
  try {
    await database.batch([await operatorMembershipFence(user, database), ...guards,
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, kind, 'recorded', JSON.stringify(data), now], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, `${kind}.recorded`, now] },
      // Every source, artifact, mutation and audit lock is now owned. Recheck
      // expiry last: waiting on a later lock may have invalidated an earlier
      // artifact check. These artifact rows are already locked by our guards.
      ...finalExpiryGuards,
    ]);
  } catch (error) {
    await operatorMembershipFence(user, database);
    if (error instanceof WriteConflictError) throw unavailable();
    if (!/UNIQUE constraint|duplicate key/i.test(String(error))) throw error;
  }
  return rowFor(user, kind, id, database);
}
async function verifiedRun(user: AuthUser, id: string, database: Database) {
  const row = await rowFor(user, 'eval:audio_run', id, database), run = JSON.parse(row.data) as AudioProofRunData, manifest = run.manifest;
  if (row.status !== 'complete' || !manifest || !run.manifestDigest || sha(manifest) !== run.manifestDigest || !run.outputArtifact || !run.inputArtifact
    || manifest.runnerVersion !== 2 || !manifest.runtimeVersion || !manifest.sessionBaseDigest || !manifest.runtimePolicyDigest || !manifest.providerEndpointDigest
    || !manifest.speechDelivery?.providerAcknowledgement.initial || !manifest.speechDelivery.providerAcknowledgement.final || !manifest.speechDelivery.finalDecision) throw unavailable();
  const scenario = audioProofScenario(run.scenarioId);
  if (!scenario || manifest.scenario.source !== 'built_in_fictional' || !same(manifest.scenario, scenario) || manifest.scenarioDigest !== sha(scenario)) throw unavailable();
  const versionRow = await rowFor(user, 'platform:agent_version', run.agentVersionId, database);
  const version = (JSON.parse(versionRow.data) as { data: { agentId: string; number: number; sourceRevision: number; config: AgentConfig; knowledgeDigests: Record<string, string> } }).data;
  if (versionRow.status !== 'versioned' || !version?.config || manifest.agent.versionId !== versionRow.id || manifest.agent.id !== version.agentId || manifest.agent.versionNumber !== version.number
    || manifest.agent.sourceRevision !== version.sourceRevision || manifest.agent.configDigest !== sha(version.config) || !same(manifest.knowledgeDigests, version.knowledgeDigests)
    || !same(manifest.speechDelivery.configuredProfile, version.config.speechDelivery || null)) throw unavailable();
  const fixtureRow = await rowFor(user, 'eval:audio_fixture', run.fixtureId, database), fixture = JSON.parse(fixtureRow.data) as SyntheticFixtureData;
  if (fixtureRow.status !== 'complete' || !fixture.artifact || fixture.scenarioId !== scenario.id || fixture.scenarioDigest !== manifest.scenarioDigest
    || fixture.provenance.synthetic !== true || fixture.artifact.id !== manifest.fixture.id || run.inputArtifact.id !== fixture.artifact.id
    || fixture.artifact.sha256 !== manifest.fixture.sha256 || run.inputArtifact.sha256 !== manifest.fixture.sha256) throw unavailable();
  const input = await readEvaluationAudioArtifact(user, run.inputArtifact.id, database), output = await readEvaluationAudioArtifact(user, run.outputArtifact.id, database);
  if (input.metadata.sha256 !== manifest.fixture.sha256 || output.metadata.sha256 !== run.outputArtifact.sha256) throw unavailable();
  const guards: Statement[] = [rowFence(user, row), rowFence(user, versionRow), rowFence(user, fixtureRow)];
  // Database wall clock is evaluated when this statement executes, after the
  // preceding membership/source locks. PostgreSQL CURRENT_TIMESTAMP is only
  // transaction-start time and cannot enforce a deadline after waiting.
  const unexpired = database.dialect === 'postgres' ? 'CAST(expires_at AS timestamptz)>clock_timestamp()' : "julianday(expires_at)>julianday('now')";
  for (const artifact of [input, output]) guards.push({
    sql: `UPDATE evaluation_audio_artifacts SET sha256=? WHERE id=? AND organization_id=? AND sha256=? AND bytes=? AND expires_at=? AND ${unexpired}`,
    params: [artifact.metadata.sha256, artifact.metadata.id, user.organizationId, artifact.metadata.sha256, artifact.bytes, artifact.metadata.expiresAt], expectedChanges: 1,
  });
  const finalExpiryGuards: Statement[] = [input, output].map(artifact => ({
    sql: `UPDATE evaluation_audio_artifacts SET sha256=sha256 WHERE id=? AND organization_id=? AND ${unexpired}`,
    params: [artifact.metadata.id, user.organizationId], expectedChanges: 1,
  }));
  const source: Source = { runId: id, runDigest: sha(row.data), manifestDigest: run.manifestDigest, outputArtifactId: output.metadata.id, outputSha256: output.metadata.sha256, inputSha256: input.metadata.sha256, versionDigest: sha(versionRow.data) };
  const option: AudioComparisonRunOption = { id, createdAt: row.created_at, scenarioId: scenario.id, scenarioName: scenario.name, agentId: version.agentId, agentVersionId: versionRow.id, versionNumber: version.number, speechDelivery: version.config.speechDelivery || null, outputExpiresAt: output.metadata.expiresAt };
  return { run, manifest, version, source, option, guards, finalExpiryGuards, output };
}
async function verifiedPair(user: AuthUser, runIds: [string, string], kind: AudioComparisonKind, database: Database) {
  if (runIds[0] === runIds[1]) throw new HttpError(400, 'Select two distinct audio runs.');
  const pair = await Promise.all(runIds.map(id => verifiedRun(user, id, database)));
  const [a, b] = pair;
  const withoutDelivery = (config: AgentConfig) => { const { speechDelivery: _ignored, ...rest } = config; return rest; };
  const comparable = (item: typeof a) => ({
    scenario: item.manifest.scenarioDigest, fixture: item.manifest.fixture.sha256, agent: item.manifest.agent.id,
    config: withoutDelivery(item.version.config), knowledge: item.manifest.knowledgeDigests,
    context: item.manifest.contextDigest, prompt: item.manifest.promptDigest, sessionBase: item.manifest.sessionBaseDigest,
    runtime: item.manifest.runtimeVersion, policy: item.manifest.runtimePolicyDigest, runner: item.manifest.runnerVersion,
    provider: item.manifest.provider, api: item.manifest.apiSurface, model: item.manifest.modelReferenceDigest, endpoint: item.manifest.providerEndpointDigest, voice: item.manifest.voice,
    protocol: item.manifest.protocol, transcription: item.manifest.inputTranscription, tools: item.manifest.tools, memory: item.manifest.memory, actions: item.manifest.businessActions,
  });
  if (!same(comparable(a), comparable(b))) throw unavailable();
  const identical = same(a.version.config.speechDelivery || null, b.version.config.speechDelivery || null);
  if (identical && kind !== 'identical_repeat') throw new HttpError(409, 'Identical delivery settings require an explicit identical-repeat comparison.');
  if (!identical && kind !== 'speech_delivery_pair') throw new HttpError(409, 'These runs have different speech delivery settings.');
  return pair;
}
function summary(row: Row): AudioComparisonSummary { const data = JSON.parse(row.data) as Comparison; return { id: row.id, createdAt: row.created_at, runIds: data.sources.map(item => item.runId) as [string, string], kind: data.kind }; }
export async function listAudioComparisons(user: AuthUser, deps: Dependencies = {}) {
  const database = await storeFor(deps), membership = await getActiveMembership(user);
  const candidates = await database.all<{ id: string }>('SELECT id FROM entities WHERE organization_id=? AND kind=? AND status=? ORDER BY created_at DESC,id DESC LIMIT 100', [user.organizationId, 'eval:audio_run', 'complete']);
  const runs: AudioComparisonRunOption[] = [];
  for (const candidate of candidates) {
    try { runs.push((await verifiedRun(user, candidate.id, database)).option); }
    catch (error) { if (!(error instanceof HttpError)) throw error; }
  }
  const comparisons = (await database.all<Row>('SELECT id,data,status,created_at,kind FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 100', [user.organizationId, kinds.comparison])).map(summary);
  return { runs, comparisons, permissions: { canWrite: membership.role !== 'viewer' }, evidenceBoundary: AUDIO_COMPARISON_BOUNDARY };
}
export async function createAudioComparison(user: AuthUser, body: Record<string, unknown>, deps: Dependencies = {}) {
  const database = await storeFor(deps); await operatorMembershipFence(user, database);
  if (!Array.isArray(body.runIds) || body.runIds.length !== 2 || body.runIds.some(id => typeof id !== 'string' || id.length > 160 || !id)) throw new HttpError(400, 'Select two audio runs.');
  const runIds = [...body.runIds].sort() as [string, string], requestId = field(body, 'requestId', 100);
  if (!/^[A-Za-z0-9:_.-]{8,100}$/.test(requestId)) throw new HttpError(400, 'Use a bounded comparison request ID.');
  const kind = body.kind === undefined ? 'speech_delivery_pair' : body.kind;
  if (kind !== 'speech_delivery_pair' && kind !== 'identical_repeat') throw new HttpError(400, 'Choose a supported comparison type.');
  const requestHash = sha([runIds, kind]), requestKey = `audio-comparison-request:${sha([user.organizationId, requestId])}`;
  const id = `audio-comparison:${sha([user.organizationId, runIds, kind])}`;
  const prior = await database.all<Row>('SELECT id,data,status,created_at,kind FROM entities WHERE id=? AND organization_id=? AND kind=?', [requestKey, user.organizationId, kinds.request]);
  if (prior[0]) {
    const request = JSON.parse(prior[0].data) as { requestHash: string; comparisonId: string };
    if (request.requestHash !== requestHash) throw new HttpError(409, 'This comparison request ID was used for different input.');
    return summary(await rowFor(user, kinds.comparison, request.comparisonId, database));
  }
  const pair = await verifiedPair(user, runIds, kind, database);
  const data: Comparison = { schemaVersion: 1, requestHash, kind, sources: pair.map(item => item.source) as [Source, Source], creatorId: user.id };
  const savedRequest = await insertOnce(user, requestKey, kinds.request, { requestHash, comparisonId: id }, database, [...pair.flatMap(item => item.guards), {
    sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING',
    params: [id, user.organizationId, kinds.comparison, 'recorded', JSON.stringify(data), new Date().toISOString()],
  }], pair.flatMap(item => item.finalExpiryGuards));
  if ((JSON.parse(savedRequest.data) as { requestHash: string }).requestHash !== requestHash) throw new HttpError(409, 'This comparison request ID was used for different input.');
  const saved = await rowFor(user, kinds.comparison, id, database);
  if (!same((JSON.parse(saved.data) as Comparison).sources, data.sources)) throw unavailable();
  return summary(saved);
}
async function loadComparison(user: AuthUser, id: string, database: Database) {
  const row = await rowFor(user, kinds.comparison, id, database), comparison = JSON.parse(row.data) as Comparison;
  const pair = await verifiedPair(user, comparison.sources.map(item => item.runId) as [string, string], comparison.kind, database);
  if (!same(comparison.sources, pair.map(item => item.source))) throw unavailable();
  return { row, comparison, pair };
}
const assignmentKey = (user: AuthUser, id: string) => `audio-assignment:${sha([user.organizationId, id, user.id])}`;
async function loadAssignment(user: AuthUser, id: string, sourceDigest: string, database: Database) {
  const row = await rowFor(user, kinds.assignment, assignmentKey(user, id), database), assignment = JSON.parse(row.data) as Assignment;
  if (assignment.reviewerId !== user.id || assignment.comparisonId !== id || assignment.sourceDigest !== sourceDigest || !same([...assignment.order].sort(), [0, 1])) throw unavailable();
  return { row, assignment };
}
async function packet(user: AuthUser, loaded: Awaited<ReturnType<typeof loadComparison>>, assignment: Assignment, database: Database): Promise<AudioComparisonPacket> {
  const ownRows = await database.all<Row>('SELECT id,data,status,created_at,kind FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at,id', [user.organizationId, kinds.review]);
  const reviews = ownRows.map(row => JSON.parse(row.data) as Review).filter(review => review.reviewerId === user.id && review.assignmentId === assignment.id && review.comparisonId === loaded.row.id)
    .map(({ dimension, preference, reason, createdAt }) => ({ dimension, preference, reason, createdAt }));
  const clip = (label: 'A' | 'B', index: 0 | 1) => ({ playbackUrl: `/api/evaluations/audio/comparisons?comparisonId=${encodeURIComponent(loaded.row.id)}&clip=${label}`, durationMs: loaded.pair[assignment.order[index]].output.metadata.durationMs });
  const reveal = (index: 0 | 1) => { const item = loaded.pair[assignment.order[index]]; return { runId: item.source.runId, speechDelivery: item.option.speechDelivery }; };
  return { comparisonId: loaded.row.id, assignmentId: assignment.id, scenario: { name: loaded.pair[0].manifest.scenario.name, callerText: loaded.pair[0].manifest.scenario.callerText },
    clips: { A: clip('A', 0), B: clip('B', 1) }, reviews, evidenceBoundary: AUDIO_COMPARISON_BOUNDARY,
    ...(AUDIO_COMPARISON_DIMENSIONS.every(dimension => reviews.some(review => review.dimension === dimension)) ? { reveal: { A: reveal(0), B: reveal(1) } } : {}) };
}
export async function openAudioComparison(user: AuthUser, body: Record<string, unknown>, deps: Dependencies = {}) {
  const database = await storeFor(deps); await operatorMembershipFence(user, database);
  const id = field(body, 'comparisonId', 160), loaded = await loadComparison(user, id, database), sourceDigest = sha(loaded.comparison.sources);
  const first = randomInt(2) as 0 | 1;
  const data: Assignment = { schemaVersion: 1, id: randomUUID(), comparisonId: id, reviewerId: user.id, order: [first, first === 0 ? 1 : 0], sourceDigest };
  await insertOnce(user, assignmentKey(user, id), kinds.assignment, data, database, [rowFence(user, loaded.row), ...loaded.pair.flatMap(item => item.guards)], loaded.pair.flatMap(item => item.finalExpiryGuards));
  const { assignment } = await loadAssignment(user, id, sourceDigest, database);
  return packet(user, loaded, assignment, database);
}
export async function reviewAudioComparison(user: AuthUser, body: Record<string, unknown>, deps: Dependencies = {}) {
  const database = await storeFor(deps); await operatorMembershipFence(user, database);
  if (body.heardBoth !== true) throw new HttpError(400, 'Confirm that you listened to both recordings.');
  const dimension = body.dimension as AudioComparisonDimension, preference = body.preference as AudioComparisonPreference;
  if (!AUDIO_COMPARISON_DIMENSIONS.includes(dimension) || !['A', 'B', 'tie', 'neither'].includes(preference)) throw new HttpError(400, 'Choose a supported dimension and preference.');
  const reason = field(body, 'reason', 1000), comparisonId = field(body, 'comparisonId', 160), loaded = await loadComparison(user, comparisonId, database);
  const { row, assignment } = await loadAssignment(user, comparisonId, sha(loaded.comparison.sources), database);
  // Keyed by the source pair as well as reviewer and criterion: recreating the
  // same pair cannot manufacture independent votes under a fresh assignment.
  const id = `audio-comparison-review:${sha([user.organizationId, user.id, loaded.comparison.sources.map(source => source.runId).sort(), dimension])}`;
  const data: Review = { schemaVersion: 1, dimension, preference, reason, createdAt: new Date().toISOString(), comparisonId, assignmentId: assignment.id, reviewerId: user.id,
    sourceDigest: assignment.sourceDigest, sources: loaded.comparison.sources, heardBoth: true, attestation: 'operator_reports_listening' };
  const saved = await insertOnce(user, id, kinds.review, data, database, [rowFence(user, row), rowFence(user, loaded.row), ...loaded.pair.flatMap(item => item.guards)], loaded.pair.flatMap(item => item.finalExpiryGuards));
  const existing = JSON.parse(saved.data) as Review;
  if (existing.assignmentId !== data.assignmentId || existing.preference !== preference || existing.reason !== reason || existing.sourceDigest !== data.sourceDigest) throw new HttpError(409, 'Your review of this pair and dimension is already recorded and cannot be changed or counted again.');
  return packet(user, loaded, assignment, database);
}
export async function readAudioComparisonClip(user: AuthUser, comparisonId: string, label: string, deps: Dependencies = {}) {
  const database = await storeFor(deps); await operatorMembershipFence(user, database);
  if (label !== 'A' && label !== 'B') throw new HttpError(400, 'Choose recording A or B.');
  const loaded = await loadComparison(user, comparisonId, database), { assignment } = await loadAssignment(user, comparisonId, sha(loaded.comparison.sources), database);
  await operatorMembershipFence(user, database);
  return loaded.pair[assignment.order[label === 'A' ? 0 : 1]].output.bytes;
}
