import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAudioListeningReview, createSyntheticAudioFixture, listAudioProofData, runAudioProof } from '../lib/evaluations/audio-service';
import { AUDIO_PROOF_SCENARIOS } from '../lib/evaluations/audio-schema';
import { SyntheticCallerFailure } from '../lib/evaluations/audio-runner';
import { createRecord } from '../lib/platform/records';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'audio-proof-')), 'test.sqlite');
delete process.env.DATABASE_URL;

function wave(pcm = Buffer.alloc(12_000, 1)) {
  const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const config = {
  name: 'Guide', role: 'Customer advisor', objective: 'Help the caller understand one practical next step.', disclosure: 'I am an AI assistant.',
  primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm, unhurried and specific.', memoryScope: 'none' as const,
  escalation: 'Offer an operator-controlled human handoff when requested.', knowledgeIds: [] as string[], systemPrompt: 'Answer directly and use one point at a time.',
  openingMessage: 'Hello, I am an AI assistant.', voiceProfile: 'provider-default' as const, enabledTools: [],
};
const env = { NODE_ENV: 'test', VOICE_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: 'https://fictional.openai.azure.com', AZURE_OPENAI_API_KEY: 'fake-key', AZURE_OPENAI_REALTIME_DEPLOYMENT: 'realtime-slot', AZURE_OPENAI_REALTIME_VOICE: 'marin', AZURE_SPEECH_KEY: 'fake-speech-key', AZURE_SPEECH_REGION: 'eastus2' };

async function fixture(overrides: Partial<Omit<typeof config, 'voiceProfile'>> & { voiceProfile?: 'provider-default' | 'maya-despina' } = {}) {
  const database = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  const user: AuthUser = { id, organizationId, email: `${id}@example.test` };
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Audio proof', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'x', organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  const candidate = { ...config, ...overrides };
  const agent = await createRecord(user, 'agent_definition', candidate, 'draft');
  const version = await createRecord(user, 'agent_version', { agentId: agent.id, number: 1, config: candidate, knowledgeDigests: {}, sourceRevision: 1 }, 'versioned');
  return { database, user, version };
}

function mocks() {
  let syntheses = 0, runs = 0, begins = 0, closes = 0; const closeOutcomes: string[] = [];
  const admission = {
    begin: async () => { begins++; return { id: `attempt-${begins}`, deadlineAt: new Date(Date.now() + 45_000).toISOString(), state: 'reserved' as const, replayed: false }; },
    mark: async () => true,
    close: async (...args: unknown[]) => { closes++; closeOutcomes.push(String((args[2] as { outcome?: unknown } | undefined)?.outcome)); return null; },
  };
  return { counts: () => ({ syntheses, runs, begins, closes, closeOutcomes }), dependencies: { env, admission: admission as never,
    synthesize: async () => { syntheses++; return { wave: wave(), voice: 'en-IN-NeerjaNeural', durationMs: 250 }; },
    realtime: async () => { runs++; return { status: 'complete' as const, providerClosed: true as const, recognizedCallerText: AUDIO_PROOF_SCENARIOS[0].callerText, assistantText: 'I can help. Start with one small step.', outputWave: wave(Buffer.alloc(9_600, 2)), outputDurationMs: 200,
      runtimePolicyDigest: 'a'.repeat(64), trace: [{ sequence: 1, kind: 'socket_open' as const, atMs: 0 }, { sequence: 2, kind: 'response_done' as const, atMs: 200 }],
      measurements: { inputAudioDurationMs: 250, outputAudioDurationMs: 200, responseRequestedToFirstServerAudioMs: 40, responseRequestedToDoneMs: 180 } }; },
  } };
}

test('one synthetic fixture and idempotent run retain playable hash-bound evidence without benchmark statistics', async () => {
  const f = await fixture(), m = mocks(), scenarioId = AUDIO_PROOF_SCENARIOS[0].id;
  const created = await createSyntheticAudioFixture(f.user, { requestId: 'fixture-request-1', scenarioId, consent: true }, m.dependencies);
  const reused = await createSyntheticAudioFixture(f.user, { requestId: 'fixture-request-1', scenarioId, consent: true }, m.dependencies);
  assert.equal(created.status, 'complete'); assert.equal(reused.id, created.id); assert.equal(m.counts().syntheses, 1);
  assert.equal(created.data.provenance.synthetic, true); assert.equal(created.data.provenance.participantConsent, 'not_applicable_synthetic');

  const request = { requestId: 'audio-run-request-1', scenarioId, fixtureId: created.id, agentVersionId: f.version.id, consent: true };
  const run = await runAudioProof(f.user, request, m.dependencies);
  const replay = await runAudioProof(f.user, request, m.dependencies);
  assert.equal(run.status, 'complete'); assert.equal(replay.id, run.id); assert.equal(m.counts().runs, 1);
  assert.equal(run.data.manifest?.tools, 'disabled'); assert.equal(run.data.manifest?.memory, 'disabled_no_contact');
  assert.equal(run.data.manifest?.modelReferenceDigest.length, 64); assert.equal(JSON.stringify(run).includes('realtime-slot'), false);
  assert.equal(run.data.outputArtifact?.playbackUrl, `/api/evaluations/audio/${run.data.outputArtifact?.id}`);
  assert.deepEqual(Object.keys(run.data.measurements || {}).sort(), ['inputAudioDurationMs', 'outputAudioDurationMs', 'responseRequestedToDoneMs', 'responseRequestedToFirstServerAudioMs'].sort());

  const review = await createAudioListeningReview(f.user, { runId: run.id, criterionId: 'pacing', verdict: 'met', reason: 'The stored response presented one point at an unhurried pace.', heardOutput: true }, m.dependencies);
  assert.equal(review.data.outputSha256, run.data.outputArtifact?.sha256); assert.equal(review.data.manifestDigest, run.data.manifestDigest);
  await assert.rejects(createAudioListeningReview(f.user, { runId: run.id, criterionId: 'pacing', verdict: 'met', reason: 'No listen.', heardOutput: false }, m.dependencies), /Confirm/);

  const listed = await listAudioProofData(f.user, m.dependencies);
  assert.equal(listed.runs.length, 1); assert.equal(listed.reviews.length, 1); assert.equal('bytes' in JSON.parse(JSON.stringify(listed)), false);
  assert.match(listed.evidenceBoundary, /no benchmark|no.*superiority/i);
});

test('unconfirmed Speech cleanup retains an uncertain attempt while confirmed Realtime socket close releases capacity', async () => {
  const f = await fixture(), scenarioId = AUDIO_PROOF_SCENARIOS[0].id, speech = mocks();
  await assert.rejects(createSyntheticAudioFixture(f.user, { requestId: 'fixture-uncertain-1', scenarioId, consent: true }, {
    ...speech.dependencies, synthesize: async () => { throw new SyntheticCallerFailure('fixture transport ended', false); },
  }), /fixture transport ended/);
  assert.equal((await listAudioProofData(f.user, speech.dependencies)).fixtures[0].status, 'uncertain');
  assert.equal(speech.counts().closeOutcomes.at(-1), 'uncertain');

  const ready = mocks(), fixtureRecord = await createSyntheticAudioFixture(f.user, { requestId: 'fixture-ready-1', scenarioId, consent: true }, ready.dependencies);
  const uncertain = await runAudioProof(f.user, { requestId: 'run-closed-uncertain-1', scenarioId, fixtureId: fixtureRecord.id, agentVersionId: f.version.id, consent: true }, {
    ...ready.dependencies, realtime: async () => ({ status: 'uncertain', providerClosed: true, failureCode: 'deadline_exceeded', recognizedCallerText: '', assistantText: '', trace: [{ sequence: 1, kind: 'socket_closed', atMs: 45_000 }], measurements: { inputAudioDurationMs: 250, outputAudioDurationMs: 0 } }),
  });
  assert.equal(uncertain.status, 'uncertain');
  assert.equal(ready.counts().closeOutcomes.at(-1), 'failed', 'confirmed socket closure releases capacity without upgrading uncertain evidence');
});

test('changed request input conflicts and unsupported profile is rejected before Realtime allocation', async () => {
  const f = await fixture(), m = mocks(), scenarioId = AUDIO_PROOF_SCENARIOS[0].id;
  const caller = await createSyntheticAudioFixture(f.user, { requestId: 'fixture-request-3', scenarioId, consent: true }, m.dependencies);
  const request = { requestId: 'audio-run-request-2', scenarioId, fixtureId: caller.id, agentVersionId: f.version.id, consent: true };
  await runAudioProof(f.user, request, m.dependencies);
  await assert.rejects(runAudioProof(f.user, { ...request, fixtureId: 'different-fixture' }, m.dependencies), /different input/);

  const maya = await fixture({ voiceProfile: 'maya-despina' }), before = m.counts().begins;
  const mayaFixture = await createSyntheticAudioFixture(maya.user, { requestId: 'fixture-request-4', scenarioId, consent: true }, m.dependencies);
  const afterFixture = m.counts().begins;
  await assert.rejects(runAudioProof(maya.user, { requestId: 'audio-run-request-3', scenarioId, fixtureId: mayaFixture.id, agentVersionId: maya.version.id, consent: true }, m.dependencies), /Azure voice profile/);
  assert.equal(afterFixture, before + 1); assert.equal(m.counts().begins, afterFixture, 'unsupported profile must stop before Realtime admission');

  const invalidRegion = mocks(), regionBegins = invalidRegion.counts().begins;
  await assert.rejects(createSyntheticAudioFixture(f.user, { requestId: 'fixture-bad-region', scenarioId, consent: true }, { ...invalidRegion.dependencies, env: { ...env, AZURE_SPEECH_REGION: 'East US 2' } }), /not configured/);
  assert.equal(invalidRegion.counts().begins, regionBegins, 'invalid provider configuration must fail before admission');
  const invalidModel = mocks(), modelBegins = invalidModel.counts().begins;
  await assert.rejects(runAudioProof(f.user, { requestId: 'run-bad-model', scenarioId, fixtureId: caller.id, agentVersionId: f.version.id, consent: true }, { ...invalidModel.dependencies, env: { ...env, AZURE_OPENAI_REALTIME_DEPLOYMENT: 'bad model name' } }), /not configured/);
  assert.equal(invalidModel.counts().begins, modelBegins, 'invalid Realtime deployment must fail before admission');
});
