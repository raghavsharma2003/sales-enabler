import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { handleAgentAction } from '../lib/platform/agents';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { createRecord, listRecords, type PlatformRecord } from '../lib/platform/records';
import { createRegressionCase, previewRegressionCase, reviewTextRehearsal, runTextRehearsal } from '../lib/regression/service';
import type { ReleaseReviewPacket, RegressionReleaseEvidence } from '../lib/regression/contracts';
import type { runAiTask } from '../lib/ai/task-router';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const config = { name: 'Gate Guide', role: 'Customer advisor', objective: 'Help a customer understand the next practical step.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief and specific.', memoryScope: 'none', escalation: 'Offer an operator-controlled human handoff when requested.', knowledgeIds: [] as string[] };
const conflict = (error: unknown) => error instanceof HttpError && error.status === 409;
const ai: typeof runAiTask = async (_user, input) => {
  const reply = 'The next step is to review the checklist.';
  const parsed = input.task === 'evaluation' ? JSON.parse(input.input) : null;
  return { text: parsed ? JSON.stringify({ judgments: parsed.rubric.criteria.map((criterion: { id: string }) => ({ criterionId: criterion.id, verdict: 'met', rationale: 'The reply gives one practical next step.', evidence: [{ entryIndex: parsed.transcript.length - 1, quote: reply }] })) }) : reply, runId: randomUUID(), model: 'synthetic', usage: { inputTokens: 1, outputTokens: 1 }, cached: false };
};

async function fixture(required = true, withKnowledge = false) {
  const user = (await authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password: 'fictional password', organization: 'Fictional gate workspace' }, new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } }))).user;
  const action = (name: string, body: Record<string, unknown>) => handleAgentAction(user, name, body) as Promise<PlatformRecord>;
  let source: PlatformRecord | undefined;
  if (withKnowledge) {
    const draft = await handleCustomerAction(user, 'brain.create', { title: 'Checklist', content: 'Start with the reviewed checklist.', sourceLabel: 'Synthetic policy' }) as PlatformRecord;
    source = await handleCustomerAction(user, 'brain.approve', { sourceId: draft.id, revision: draft.revision }) as PlatformRecord;
  }
  const settings = { ...config, knowledgeIds: source ? [source.id] : [] };
  const agent = await action('agent.create', settings);
  const version = await action('agent.version', { agentId: agent.id, revision: agent.revision });
  const check = await action('test.run', { versionId: version.id });
  const sessionId = randomUUID();
  await (await db()).run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [sessionId, user.organizationId, 'session', null, JSON.stringify({ source: 'internal_preview', agentId: agent.id, agentVersionId: version.id, transcript: [{ role: 'user', text: 'Please explain the next step.' }] }), new Date().toISOString()]);
  const preview = await previewRegressionCase(user, { sourceSessionId: sessionId, selectedCallerTurnIndex: 0 });
  const input = { sourceSessionId: sessionId, sourceTranscriptDigest: preview.source.transcriptDigest, selectedCallerTurnIndex: 0, turns: preview.suggestedDerivative, name: 'Practical step', language: 'English', expectedOutcome: 'Give one practical next step.', criteria: [{ text: 'The assistant gives one practical next step.', blocking: true }], required: true, redactionConfirmed: true as const };
  const rehearsalCase = required ? await createRegressionCase(user, input) : undefined;
  const run = rehearsalCase ? await runTextRehearsal(user, { requestId: randomUUID(), caseId: rehearsalCase.id, agentVersionId: version.id }, { ai }) : undefined;
  const review = run ? await reviewTextRehearsal(user, { runId: run.id, criterionId: run.data.rubric.criteria[0].id, verdict: 'met', reason: 'The fictional reply gives a clear next step.' }) : undefined;
  const packet = (operation: 'publish' | 'rollback' = 'publish') => handleAgentAction(user, 'release.review', { versionId: version.id, testRunId: check.id, operation }) as Promise<ReleaseReviewPacket>;
  const publish = (reviewPacketDigest?: string, operation = 'publish') => action(`release.${operation}`, { versionId: version.id, testRunId: check.id, currentReleaseId: null, ...(reviewPacketDigest ? { reviewPacketDigest } : {}) });
  return { user, action, agent, version, check, source, settings, input, rehearsalCase, run, review, packet, publish };
}

test('required reviewed text publishes exact bounded evidence only after explicit packet review', async () => {
  const f = await fixture();
  const packet = await f.packet();
  assert.equal(packet.publishable, true);
  assert.equal(packet.mode, 'reviewed_text_regression');
  assert.match(packet.disclaimer, /does not measure Realtime audio/);
  await assert.rejects(f.publish(), conflict);
  await assert.rejects(f.publish('forged'), conflict);
  const release = await f.publish(packet.reviewPacketDigest);
  const evidence = release.data.regressionEvidence as RegressionReleaseEvidence;
  assert.equal(evidence.caseSetDigest, packet.suite.caseSetDigest);
  assert.deepEqual(evidence.cases[0].reviewIds, [f.review!.id]);
  assert.equal(evidence.cases[0].runId, f.run!.id);
  assert.equal(evidence.cases[0].runtimeInstructionDigest, f.run!.data.runtimeInstructionDigest);
  assert.doesNotMatch(JSON.stringify(release.data), /checklist|fictional reply|transcript"|rationale/);
});

test('zero required cases preserve legacy configuration-only release and never claim a text pass', async () => {
  const f = await fixture(false);
  const packet = await f.packet();
  assert.equal(packet.publishable, true);
  assert.equal(packet.suite.passing, false);
  assert.equal(packet.mode, 'configuration_only');
  const release = await f.publish();
  assert.equal((release.data.regressionEvidence as RegressionReleaseEvidence).mode, 'configuration_only');
});

test('server rejects explicitly supplied historical configuration pass after a newer failure for publish and rollback', async () => {
  for (const required of [true, false]) {
    const f = await fixture(required);
    const oldPacket = await f.packet();
    const failed = await createRecord(f.user, 'test_run', { ...f.check.data, passed: false }, 'failed');
    await (await db()).run('UPDATE entities SET created_at=? WHERE id=?', [new Date(Date.parse(f.check.createdAt) + 1).toISOString(), failed.id]);
    for (const operation of ['publish', 'rollback'] as const) {
      const packet = await f.packet(operation);
      assert.equal(packet.configurationPassed, false);
      assert.equal(packet.publishable, false);
      assert.match(packet.blockers.join(' '), /latest configuration check/);
      await assert.rejects(f.publish(packet.reviewPacketDigest, operation), conflict);
      await assert.rejects(f.publish(oldPacket.reviewPacketDigest, operation), conflict);
      await assert.rejects(f.publish(undefined, operation), conflict);
    }
  }
});

test('any failed or nonpassing same-timestamp latest check blocks selecting a passing peer', async () => {
  for (const status of ['failed', 'pending']) {
    const f = await fixture(false);
    const other = await createRecord(f.user, 'test_run', { ...f.check.data, passed: false }, status);
    await (await db()).run('UPDATE entities SET created_at=? WHERE id=?', [f.check.createdAt, other.id]);
    assert.equal((await f.packet()).configurationPassed, false);
    await assert.rejects(f.publish(), conflict);
    await assert.rejects(f.publish(undefined, 'rollback'), conflict);
  }
});

test('a new exact-version configuration check invalidates the reviewed packet even when it passes', async () => {
  const f = await fixture(false);
  const packet = await f.packet();
  const next = await f.action('test.run', { versionId: f.version.id });
  await assert.rejects(f.publish(packet.reviewPacketDigest), conflict);
  const reviewed = await handleAgentAction(f.user, 'release.review', { versionId: f.version.id, testRunId: next.id }) as ReleaseReviewPacket;
  assert.equal(reviewed.publishable, true);
  await f.action('release.publish', { versionId: f.version.id, testRunId: next.id, currentReleaseId: null, reviewPacketDigest: reviewed.reviewPacketDigest });
});

test('latest attempts and latest human reviews defeat previously reviewed passing packets', async () => {
  const f = await fixture();
  const packet = await f.packet();
  await reviewTextRehearsal(f.user, { runId: f.run!.id, criterionId: f.run!.data.rubric.criteria[0].id, verdict: 'not_met', reason: 'The operator rejects the current reply.' });
  assert.equal((await f.packet()).suite.cases[0].status, 'failed');
  await assert.rejects(f.publish(packet.reviewPacketDigest), conflict);
  await reviewTextRehearsal(f.user, { runId: f.run!.id, criterionId: f.run!.data.rubric.criteria[0].id, verdict: 'met', reason: 'Corrected explicit review.' });
  const restored = await f.packet();
  await assert.rejects(f.publish(packet.reviewPacketDigest), conflict);
  await runTextRehearsal(f.user, { requestId: randomUUID(), caseId: f.rehearsalCase!.id, agentVersionId: f.version.id }, { ai });
  assert.equal((await f.packet()).suite.cases[0].status, 'review_needed');
  await assert.rejects(f.publish(restored.reviewPacketDigest), conflict);
});

test('packets bind operation and exact workspace/version and rollback cannot bypass required review', async () => {
  const f = await fixture();
  const packet = await f.packet();
  await assert.rejects(f.publish(packet.reviewPacketDigest, 'rollback'), conflict);
  await assert.rejects(f.publish(undefined, 'rollback'), conflict);
  const outsider = await fixture(false);
  await assert.rejects(handleAgentAction(outsider.user, 'release.review', { versionId: f.version.id, testRunId: f.check.id }), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(outsider.publish(packet.reviewPacketDigest), conflict);
  const rollback = await f.packet('rollback');
  assert.equal(rollback.operation, 'rollback');
  assert.equal((await f.publish(rollback.reviewPacketDigest, 'rollback')).status, 'active');
});

test('changed runtime digest and revised or newly required cases invalidate publication', async () => {
  const f = await fixture();
  const packet = await f.packet();
  const store = await db();
  await store.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...f.run!.data, runtimeInstructionDigest: 'old-policy' }), f.run!.id]);
  assert.equal((await f.packet()).suite.cases[0].status, 'stale');
  await assert.rejects(f.publish(packet.reviewPacketDigest), conflict);
  await createRegressionCase(f.user, { ...f.input, previousCaseId: f.rehearsalCase!.id, expectedOutcome: 'Give a revised practical step.' });
  assert.equal((await f.packet()).suite.cases[0].status, 'missing');
  await assert.rejects(f.publish(packet.reviewPacketDigest), conflict);
});

async function raceRelease(f: Awaited<ReturnType<typeof fixture>>, mutate: () => Promise<unknown>) {
  const store = await db(), original = store.batch;
  const packet = await f.packet();
  let injected = false;
  store.batch = async statements => {
    if (!injected && statements.some(item => item.sql.startsWith('INSERT INTO entities') && item.params?.includes('platform:release'))) {
      injected = true;
      store.batch = original;
      await mutate();
    }
    return original.call(store, statements);
  };
  try { await assert.rejects(f.publish(packet.reviewPacketDigest), conflict); }
  finally { store.batch = original; }
  assert.equal(injected, true);
  assert.equal((await listRecords(f.user.organizationId, 'release')).length, 0);
}

test('atomic release fence rejects a newly added case after the final check, including zero-case mode', async () => {
  for (const required of [true, false]) {
    const f = await fixture(required);
    await raceRelease(f, () => createRegressionCase(f.user, f.input));
  }
});

test('atomic release fence rejects latest attempt and latest review insertions after check', async () => {
  const runFixture = await fixture();
  await raceRelease(runFixture, () => runTextRehearsal(runFixture.user, { requestId: randomUUID(), caseId: runFixture.rehearsalCase!.id, agentVersionId: runFixture.version.id }, { ai }));
  const reviewFixture = await fixture();
  await raceRelease(reviewFixture, () => reviewTextRehearsal(reviewFixture.user, { runId: reviewFixture.run!.id, criterionId: reviewFixture.run!.data.rubric.criteria[0].id, verdict: 'not_met', reason: 'Changed review during publication.' }));
});

test('atomic release fence rejects a configuration check inserted after final packet assembly', async () => {
  for (const required of [true, false]) {
    const f = await fixture(required);
    await raceRelease(f, () => f.action('test.run', { versionId: f.version.id }));
  }
});

test('atomic release fence rejects source, draft, version, test and operator changes after check', async () => {
  const sourceFixture = await fixture(true, true);
  await raceRelease(sourceFixture, () => handleCustomerAction(sourceFixture.user, 'brain.revoke', { sourceId: sourceFixture.source!.id, revision: sourceFixture.source!.revision, reason: 'Synthetic source withdrawal.' }));
  const draftFixture = await fixture();
  await raceRelease(draftFixture, () => draftFixture.action('agent.update', { ...draftFixture.settings, name: 'Changed draft', agentId: draftFixture.agent.id, revision: draftFixture.agent.revision }));
  const versionFixture = await fixture();
  await raceRelease(versionFixture, async () => {
    const edited = await versionFixture.action('agent.update', { ...versionFixture.settings, name: 'New version', agentId: versionFixture.agent.id, revision: versionFixture.agent.revision });
    await versionFixture.action('agent.version', { agentId: edited.id, revision: edited.revision });
  });
  const testFixture = await fixture();
  await raceRelease(testFixture, async () => { await (await db()).run('UPDATE entities SET status=? WHERE id=?', ['failed', testFixture.check.id]); });
  const operatorFixture = await fixture();
  await raceRelease(operatorFixture, async () => { await (await db()).run('UPDATE entities SET status=? WHERE id=?', ['removed', `team:member:${operatorFixture.user.id}`]); });
});
