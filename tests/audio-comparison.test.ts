import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createAudioComparison, listAudioComparisons, openAudioComparison, readAudioComparisonClip, reviewAudioComparison, AUDIO_COMPARISON_DIMENSIONS } from '../lib/evaluations/audio-comparison';
import { createSyntheticAudioFixture, runAudioProof, type AudioProofDependencies } from '../lib/evaluations/audio-service';
import { AUDIO_PROOF_SCENARIOS, type AudioProofRunData } from '../lib/evaluations/audio-schema';
import { pcm24ToWave } from '../lib/evaluations/audio-runner';
import { createRecord } from '../lib/platform/records';
import type { AgentConfig } from '../lib/platform/agents';
import type { AuthUser } from '../lib/server/auth';
import { db, type Database, WriteConflictError } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { resolveSpeechDelivery } from '../lib/voice/speech-delivery';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'audio-comparison-')), 'test.sqlite');
delete process.env.DATABASE_URL;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const env = { NODE_ENV: 'test', VOICE_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: 'https://fictional.openai.azure.com', AZURE_OPENAI_API_KEY: 'fake-key', AZURE_OPENAI_REALTIME_DEPLOYMENT: 'realtime-slot', AZURE_OPENAI_REALTIME_VOICE: 'marin', AZURE_SPEECH_KEY: 'fake-speech-key', AZURE_SPEECH_REGION: 'eastus2' };
const config: AgentConfig = { name: 'Guide', role: 'Customer advisor', objective: 'Help with one practical next step.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm and specific.', memoryScope: 'none', escalation: 'Offer human handoff when requested.', knowledgeIds: [], systemPrompt: 'Answer one point at a time.', openingMessage: 'Hello, I am an AI assistant.', voiceProfile: 'provider-default', enabledTools: [] };
async function member(organizationId?: string) {
  const database = await db(), id = randomUUID(), user: AuthUser = { id, organizationId: organizationId || randomUUID(), email: `${id}@example.test` }, now = new Date().toISOString();
  await database.batch([
    ...(!organizationId ? [{ sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Comparisons', now] }] : []),
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'x', user.organizationId, now] },
    ...ownerRegistrationStatements(user).slice(organizationId ? 1 : 0),
  ]);
  return user;
}
async function fixture() {
  const database = await db(), user = await member(), scenarioId = AUDIO_PROOF_SCENARIOS[0].id;
  let calls = 0;
  const dependencies: AudioProofDependencies = { database, env,
    admission: { begin: async () => ({ id: randomUUID(), deadlineAt: new Date(Date.now() + 45_000).toISOString(), state: 'reserved', replayed: false }), mark: async () => true, close: async () => null } as never,
    synthesize: async () => ({ wave: pcm24ToWave(Buffer.alloc(12_000, 1)), voice: 'test', durationMs: 250 }),
    realtime: async input => { calls++; const initialDecision = resolveSpeechDelivery(input.speechDelivery, []); return { status: 'complete', providerClosed: true, recognizedCallerText: scenarioId, assistantText: 'One small step.', outputWave: pcm24ToWave(Buffer.alloc(12_000, calls + 1)), outputDurationMs: 250, runtimePolicyDigest: 'a'.repeat(64), trace: [], measurements: { inputAudioDurationMs: 250, outputAudioDurationMs: 250 }, speechDelivery: { configuredProfile: input.speechDelivery || null, initialDecision, finalDecision: initialDecision, providerAcknowledgement: { initial: true, final: true } } }; },
  };
  const agent = await createRecord(user, 'agent_definition', config, 'draft');
  const makeVersion = async (config: AgentConfig, number: number) => createRecord(user, 'agent_version', { agentId: agent.id, number, config, knowledgeDigests: {}, sourceRevision: number }, 'versioned');
  const versions = await Promise.all([
    makeVersion({ ...config, speechDelivery: { version: 1, pace: 'standard', adaptToRequests: false } }, 1),
    makeVersion({ ...config, speechDelivery: { version: 1, pace: 'unhurried', adaptToRequests: false } }, 2),
  ]);
  const caller = await createSyntheticAudioFixture(user, { requestId: randomUUID(), scenarioId, consent: true }, dependencies);
  const caller2 = await createSyntheticAudioFixture(user, { requestId: randomUUID(), scenarioId, consent: true }, dependencies);
  const run = (versionId: string, fixtureId = caller.id) => runAudioProof(user, { requestId: randomUUID(), scenarioId, fixtureId, agentVersionId: versionId, consent: true }, dependencies);
  const runs = [await run(versions[0].id), await run(versions[1].id, caller2.id)];
  return { database, user, dependencies, runs, run, versions, makeVersion, calls: () => calls };
}

test('real stored pair is idempotent, assigned stably, hash-bound, neutral and only revealed after four immutable ratings', async () => {
  const f = await fixture(), body = { runIds: f.runs.map(run => run.id), requestId: randomUUID() };
  const [created, replay] = await Promise.all([
    createAudioComparison(f.user, body),
    createAudioComparison(f.user, { ...body, runIds: [...body.runIds].reverse(), requestId: randomUUID() }),
  ]);
  assert.equal(created.id, replay.id);
  assert.equal((await createAudioComparison(f.user, body)).id, created.id);
  await assert.rejects(createAudioComparison(f.user, { ...body, kind: 'identical_repeat' }), /different input/);
  const [a, b] = await Promise.all([openAudioComparison(f.user, { comparisonId: created.id }), openAudioComparison(f.user, { comparisonId: created.id })]);
  assert.equal(a.assignmentId, b.assignmentId); assert.deepEqual(a.clips, b.clips);
  const neutral = JSON.stringify(a);
  for (const run of f.runs) {
    assert.ok(!neutral.includes(run.id)); assert.ok(!neutral.includes(run.data.outputArtifact!.id));
    assert.ok(!neutral.includes(run.data.manifest!.voice)); assert.ok(!neutral.includes(run.data.manifest!.modelReferenceDigest));
  }
  assert.ok(!neutral.includes('speechDelivery')); assert.ok(!neutral.includes('unhurried')); assert.equal(a.reveal, undefined);
  const audio = await Promise.all(['A', 'B'].map(label => readAudioComparisonClip(f.user, created.id, label)));
  assert.deepEqual(audio.map(bytes => createHash('sha256').update(bytes).digest('hex')).sort(), f.runs.map(run => run.data.outputArtifact!.sha256).sort());
  const review = { comparisonId: created.id, dimension: 'pacing', preference: 'A', reason: 'A sounded more comfortably paced.', heardBoth: true };
  const [first, again] = await Promise.all([reviewAudioComparison(f.user, review), reviewAudioComparison(f.user, review)]);
  assert.equal(first.reviews.length, 1); assert.equal(again.reviews.length, 1); assert.equal(first.reveal, undefined);
  await assert.rejects(reviewAudioComparison(f.user, { ...review, preference: 'B' }), /cannot be changed/);
  for (const dimension of AUDIO_COMPARISON_DIMENSIONS.filter(d => d !== 'pacing')) await reviewAudioComparison(f.user, { ...review, dimension });
  const completed = await openAudioComparison(f.user, { comparisonId: created.id });
  assert.equal(completed.reviews.length, 4); assert.ok(completed.reveal);
  const reviewRows = await f.database.all<{ data: string }>('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'eval:audio_comparison_review']);
  for (const row of reviewRows) { const stored = JSON.parse(row.data); assert.equal(stored.sources.length, 2); assert.equal(stored.sources[0].manifestDigest, f.runs.find(run => run.id === stored.sources[0].runId)!.data.manifestDigest); }
  const [duplicate, concurrentDuplicate] = await Promise.all([
    createAudioComparison(f.user, { ...body, runIds: [...body.runIds].reverse(), requestId: randomUUID() }),
    createAudioComparison(f.user, { ...body, requestId: randomUUID() }),
  ]);
  assert.equal(duplicate.id, created.id); assert.equal(concurrentDuplicate.id, created.id);
  const resumed = await openAudioComparison(f.user, { comparisonId: duplicate.id });
  assert.equal(resumed.assignmentId, a.assignmentId); assert.equal(resumed.reviews.length, 4);
  assert.equal((await reviewAudioComparison(f.user, { ...review, comparisonId: duplicate.id })).reviews.length, 4);
  assert.equal((await listAudioComparisons(f.user)).comparisons.length, 1);
  assert.equal(f.calls(), 2, 'comparison and listening operations invoke no provider');
});

test('comparison rejects unmatched configuration, inputs, provider/runtime provenance, expired and corrupt artifacts', async () => {
  const f = await fixture(), create = () => createAudioComparison(f.user, { runIds: f.runs.map(run => run.id), requestId: randomUUID() });
  const changed = await f.makeVersion({ ...config, systemPrompt: 'Different behavior', speechDelivery: { version: 1, pace: 'unhurried', adaptToRequests: false } }, 3), changedRun = await f.run(changed.id);
  await assert.rejects(createAudioComparison(f.user, { runIds: [f.runs[0].id, changedRun.id], requestId: randomUUID() }), /comparable/);
  const otherEndpointRun = await runAudioProof(f.user, { requestId: randomUUID(), scenarioId: AUDIO_PROOF_SCENARIOS[0].id, fixtureId: f.runs[0].data.fixtureId, agentVersionId: f.versions[1].id, consent: true }, {
    ...f.dependencies, env: { ...env, AZURE_OPENAI_ENDPOINT: 'https://different.openai.azure.com' },
  });
  assert.equal(otherEndpointRun.data.manifest!.modelReferenceDigest, f.runs[0].data.manifest!.modelReferenceDigest);
  assert.notEqual(otherEndpointRun.data.manifest!.providerEndpointDigest, f.runs[0].data.manifest!.providerEndpointDigest);
  await assert.rejects(createAudioComparison(f.user, { runIds: [f.runs[0].id, otherEndpointRun.id], requestId: randomUUID() }), /comparable/);
  const repeat = await f.run(f.versions[0].id);
  await assert.rejects(createAudioComparison(f.user, { runIds: [f.runs[0].id, repeat.id], requestId: randomUUID() }), /explicit identical-repeat/);
  assert.equal((await createAudioComparison(f.user, { runIds: [f.runs[0].id, repeat.id], requestId: randomUUID(), kind: 'identical_repeat' })).kind, 'identical_repeat');
  const target = f.runs[1], original = JSON.stringify(target.data);
  for (const mutation of [
    (data: AudioProofRunData) => { data.manifest!.modelReferenceDigest = 'b'.repeat(64); },
    (data: AudioProofRunData) => { data.manifest!.providerEndpointDigest = 'b'.repeat(64); },
    (data: AudioProofRunData) => { data.manifest!.runtimeVersion = 'different'; },
    (data: AudioProofRunData) => { data.manifest!.sessionBaseDigest = 'b'.repeat(64); },
    (data: AudioProofRunData) => { data.manifest!.fixture.sha256 = 'b'.repeat(64); },
    (data: AudioProofRunData) => { delete data.manifest!.speechDelivery; },
  ]) {
    const data = JSON.parse(original) as AudioProofRunData; mutation(data); data.manifestDigest = hash(data.manifest);
    await f.database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(data), target.id]);
    await assert.rejects(create(), /comparable/);
  }
  await f.database.run('UPDATE entities SET data=? WHERE id=?', [original, target.id]);
  const comparison = await create(); await openAudioComparison(f.user, { comparisonId: comparison.id });
  await f.database.run('UPDATE evaluation_audio_artifacts SET bytes=? WHERE id=?', [Buffer.alloc(100), target.data.outputArtifact!.id]);
  await assert.rejects(openAudioComparison(f.user, { comparisonId: comparison.id }), /integrity/);
  await assert.rejects(reviewAudioComparison(f.user, { comparisonId: comparison.id, dimension: 'pacing', preference: 'A', reason: 'test', heardBoth: true }), /integrity/);
  const expired = f.runs[0].data.outputArtifact!;
  await f.database.run('UPDATE evaluation_audio_artifacts SET expires_at=? WHERE id=?', [new Date(0).toISOString(), expired.id]);
  await assert.rejects(create(), /expired|integrity/);
  assert.equal((await listAudioComparisons(f.user)).runs.some(run => run.id === target.id || run.id === f.runs[0].id), false);
});

test('reviewer assignment isolation, tenant access, current membership and transactional source fences', async () => {
  const f = await fixture(), comparison = await createAudioComparison(f.user, { runIds: f.runs.map(run => run.id), requestId: randomUUID() });
  const own = await openAudioComparison(f.user, { comparisonId: comparison.id });
  const other = await member(f.user.organizationId), foreign = await member();
  await assert.rejects(readAudioComparisonClip(other, comparison.id, 'A'), /not found/);
  const otherPacket = await openAudioComparison(other, { comparisonId: comparison.id });
  assert.notEqual(otherPacket.assignmentId, own.assignmentId);
  assert.equal(otherPacket.reviews.length, 0);
  await assert.rejects(openAudioComparison(foreign, { comparisonId: comparison.id }), /not found/);
  await assert.rejects(readAudioComparisonClip(foreign, comparison.id, 'A'), /not found/);
  await assert.rejects(reviewAudioComparison(f.user, { comparisonId: comparison.id, dimension: 'warmth', preference: 'tie', reason: 'test', heardBoth: false }), /listened to both/);
  const [memberRow] = await f.database.all<{ data: string }>('SELECT data FROM entities WHERE id=?', [`team:member:${other.id}`]);
  const viewerData = { ...JSON.parse(memberRow.data), role: 'viewer' };
  await f.database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(viewerData), `team:member:${other.id}`]);
  assert.equal((await listAudioComparisons(other)).permissions.canWrite, false);
  await assert.rejects(openAudioComparison(other, { comparisonId: comparison.id }), /role/);
  await f.database.run('UPDATE entities SET status=? WHERE id=?', ['removed', `team:member:${other.id}`]);
  await assert.rejects(readAudioComparisonClip(other, comparison.id, 'A'), /access.*removed/);
  const racing: Database = { ...f.database, batch: async statements => {
    await f.database.run('UPDATE entities SET status=? WHERE id=?', ['uncertain', f.runs[1].id]);
    await f.database.batch(statements);
  } };
  await assert.rejects(reviewAudioComparison(f.user, { comparisonId: comparison.id, dimension: 'warmth', preference: 'tie', reason: 'Both sounded respectful.', heardBoth: true }, { database: racing }), /comparable/);
  assert.equal((await f.database.all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'eval:audio_comparison_review'])).length, 0);
});

test('expiry crossing while a validated review waits to write rejects the transaction without a vote', async () => {
  const f = await fixture(), comparison = await createAudioComparison(f.user, { runIds: f.runs.map(run => run.id), requestId: randomUUID() });
  await openAudioComparison(f.user, { comparisonId: comparison.id });
  const expiresAt = new Date(Date.now() + 750).toISOString();
  await f.database.run('UPDATE evaluation_audio_artifacts SET expires_at=? WHERE id=?', [expiresAt, f.runs[0].data.outputArtifact!.id]);
  let reachedWrite = false;
  const delayed: Database = { ...f.database, batch: async statements => {
    reachedWrite = true;
    await new Promise(resolve => setTimeout(resolve, Math.max(1, Date.parse(expiresAt) - Date.now() + 80)));
    await f.database.batch(statements);
  } };
  await assert.rejects(reviewAudioComparison(f.user, { comparisonId: comparison.id, dimension: 'pacing', preference: 'A', reason: 'A sounded comfortably paced.', heardBoth: true }, { database: delayed }), /comparable/);
  assert.equal(reachedWrite, true, 'the pair passed validation before its unchanged expiry elapsed');
  assert.equal((await f.database.all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'eval:audio_comparison_review'])).length, 0);
});

test('expiry after earlier artifact guards but during later transaction writes rolls back review and audit', async () => {
  const f = await fixture(), comparison = await createAudioComparison(f.user, { runIds: f.runs.map(run => run.id), requestId: randomUUID() });
  await openAudioComparison(f.user, { comparisonId: comparison.id });
  const expiresAt = new Date(Date.now() + 750).toISOString();
  const firstRun = f.runs.find(run => run.id === comparison.runIds[0])!;
  await f.database.run('UPDATE evaluation_audio_artifacts SET expires_at=? WHERE id=?', [expiresAt, firstRun.data.outputArtifact!.id]);
  const beforeAudit = (await f.database.all('SELECT id FROM audit_events WHERE organization_id=?', [f.user.organizationId])).length;
  const sqlite = new DatabaseSync(process.env.SQLITE_PATH!);
  let pausedAfterEarlierCheck = false;
  const delayed: Database = { ...f.database, batch: async statements => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of statements) {
        const result = sqlite.prepare(statement.sql).run(...(statement.params || []));
        if (statement.expectedChanges !== undefined && Number(result.changes) !== statement.expectedChanges) throw new WriteConflictError();
        // Delay after all byte/hash guards and both durable inserts. Only a
        // final expiry pass can now reject the otherwise successful review.
        if (statement.sql.startsWith('INSERT INTO audit_events')) {
          assert.ok(Date.now() < Date.parse(expiresAt), 'all earlier artifact expiry checks passed before expiry');
          pausedAfterEarlierCheck = true;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, Date.parse(expiresAt) - Date.now() + 80));
        }
      }
      sqlite.exec('COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  try {
    await assert.rejects(reviewAudioComparison(f.user, { comparisonId: comparison.id, dimension: 'warmth', preference: 'tie', reason: 'Both sounded respectful.', heardBoth: true }, { database: delayed }), /comparable/);
    assert.equal(pausedAfterEarlierCheck, true);
    assert.equal((await f.database.all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'eval:audio_comparison_review'])).length, 0);
    assert.equal((await f.database.all('SELECT id FROM audit_events WHERE organization_id=?', [f.user.organizationId])).length, beforeAudit);
  } finally { sqlite.close(); }
});
