import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { runAiTask } from '../lib/ai/task-router';
import type { RegressionCaseWriteInput } from '../lib/regression/contracts';
import { checkRegressionSuite, createRegressionCase, previewRegressionCase, reviewTextRehearsal, runTextRehearsal } from '../lib/regression/service';
import { createRecord } from '../lib/platform/records';
import type { AuthUser } from '../lib/server/auth';
import { db, type Database } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'regression-oct09-review-')), 'test.sqlite');
delete process.env.DATABASE_URL;
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const config = {
  name: 'Guide', role: 'Customer advisor', objective: 'Help the customer understand one practical next step.', disclosure: 'I am an AI assistant.',
  primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm, brief and specific.', memoryScope: 'none' as const,
  escalation: 'Offer an operator-controlled human handoff when requested.', knowledgeIds: [] as string[], systemPrompt: 'Answer the customer directly.',
  openingMessage: 'Hello, I am an AI assistant.', voiceProfile: 'provider-default' as const, enabledTools: [],
};
const goodAi = (async (_user, input) => input.task === 'answer'
  ? { text: 'The next step is to review the checklist.', model: 'fake', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'fake-answer', cached: false }
  : { text: JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'One next step is given.', evidence: [{ entryIndex: 1, quote: 'review the checklist' }] }] }), model: 'fake', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'fake-evaluation', cached: false }) as typeof runAiTask;

async function fixture(knowledge = false) {
  const store = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  const owner: AuthUser = { id, organizationId, email: `${id}@example.test` };
  await store.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Synthetic review', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, owner.email, 'x', organizationId, now] },
    ...ownerRegistrationStatements(owner),
  ]);
  const source = knowledge ? await createRecord(owner, 'brain_source', { title: 'Checklist', content: 'Review the fictional checklist.', sourceLabel: 'Synthetic handbook', approvedAt: now }, 'approved') : undefined;
  const candidateConfig = { ...config, knowledgeIds: source ? [source.id] : [] };
  const knowledgeDigests = source ? { [source.id]: sha({ title: source.data.title, content: source.data.content, sourceLabel: source.data.sourceLabel, revision: source.revision, approvedAt: source.data.approvedAt, status: source.status }) } : {};
  const agent = await createRecord(owner, 'agent_definition', candidateConfig, 'draft');
  const version = await createRecord(owner, 'agent_version', { agentId: agent.id, number: 1, config: candidateConfig, knowledgeDigests, sourceRevision: 1 }, 'versioned');
  const sessionId = randomUUID();
  await store.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [sessionId, organizationId, 'session', null, JSON.stringify({ source: 'browser_voice', agentId: agent.id, agentVersionId: version.id, transcript: [{ role: 'user', text: 'Explain one next step.' }] }), now]);
  const preview = await previewRegressionCase(owner, { sourceSessionId: sessionId, selectedCallerTurnIndex: 0 });
  const input: RegressionCaseWriteInput = { sourceSessionId: sessionId, sourceTranscriptDigest: preview.source.transcriptDigest, selectedCallerTurnIndex: 0, turns: preview.suggestedDerivative,
    name: 'One next step', language: 'English', expectedOutcome: 'Give one concise next step.', criteria: [{ text: 'The reply offers one concrete next step.', blocking: true }], required: true, redactionConfirmed: true };
  const rehearsalCase = await createRegressionCase(owner, input);
  return { store, owner, source, agent, version, input, rehearsalCase };
}

test('authority read and CAS use the same approved source preimage', async () => {
  const f = await fixture(true); let changed = false, calls = 0;
  const store: Database = { ...f.store, async all<T extends Record<string, unknown>>(sql: string, params?: Parameters<Database['all']>[1]) {
    if (!changed && params?.includes(f.source!.id) && params.includes('platform:brain_source')) {
      changed = true;
      await f.store.run('UPDATE entities SET status=? WHERE id=?', ['revoked', f.source!.id]);
    }
    return f.store.all<T>(sql, params);
  } };
  await assert.rejects(runTextRehearsal(f.owner, { requestId: 'source-preimage', caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { database: store, ai: (async (...args) => { calls++; return goodAi(...args); }) as typeof runAiTask }));
  assert.equal(changed, true);
  assert.equal(calls, 0, 'revoked source must stop before paid generation');
});

test('actor revocation after generation stops the grading request and completion', async () => {
  const f = await fixture(); let calls = 0;
  const ai = (async (...args) => {
    calls++;
    const result = await goodAi(...args);
    if (args[1].task === 'answer') await f.store.run('UPDATE entities SET status=? WHERE id=?', ['removed', `team:member:${f.owner.id}`]);
    return result;
  }) as typeof runAiTask;
  await assert.rejects(runTextRehearsal(f.owner, { requestId: 'actor-revocation', caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { ai }));
  assert.equal(calls, 1, 'membership revocation must block the second paid leg');
});

test('concurrent identical requests make at most one response and one grading attempt', async () => {
  const f = await fixture(); let calls = 0;
  let responseStarted!: () => void, finishResponse!: () => void;
  const started = new Promise<void>(resolve => { responseStarted = resolve; });
  const waiting = new Promise<void>(resolve => { finishResponse = resolve; });
  const ai = (async (...args) => {
    calls++;
    if (args[1].task === 'answer') { responseStarted(); await waiting; }
    return goodAi(...args);
  }) as typeof runAiTask;
  const input = { requestId: 'concurrent-identical', caseId: f.rehearsalCase.id, agentVersionId: f.version.id };
  const first = runTextRehearsal(f.owner, input, { ai });
  await started;
  try { await assert.rejects(runTextRehearsal(f.owner, input, { ai }), /pending|claimed|uncertain/i); }
  finally { finishResponse(); }
  assert.equal((await first).status, 'complete');
  assert.equal(calls, 2);
});

test('newer run defeats an older reviewed pass even at the identical timestamp', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-09T12:00:00.000Z') });
  const f = await fixture();
  const requests = ['same-time-run-a', 'same-time-run-b'].sort((a, b) => sha([f.owner.organizationId, b]).localeCompare(sha([f.owner.organizationId, a])));
  const first = await runTextRehearsal(f.owner, { requestId: requests[0], caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { ai: goodAi });
  await reviewTextRehearsal(f.owner, { runId: first.id, criterionId: 'c1', verdict: 'met', reason: 'The first run offers one next step.' });
  const second = await runTextRehearsal(f.owner, { requestId: requests[1], caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { ai: goodAi });
  assert.equal(first.createdAt, second.createdAt);
  const suite = await checkRegressionSuite(f.owner, f.version.id);
  assert.equal(suite.passing, false, 'the latest run has not received human review');
  assert.equal(suite.cases[0].runId, second.id);
});

test('newer human rejection defeats a pass at the identical timestamp regardless of UUID order', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-09T12:00:00.000Z') });
  const f = await fixture();
  const run = await runTextRehearsal(f.owner, { requestId: 'same-time-review', caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { ai: goodAi });
  let count = 0;
  const store: Database = { ...f.store, batch: async statements => {
    const insertion = statements.find(item => item.sql.startsWith('INSERT INTO entities') && item.params?.includes('regression:review'));
    if (insertion?.params) {
      const original = insertion.params[0], ordered = count++ === 0 ? 'ffffffff-ffff-4fff-afff-ffffffffffff' : '00000000-0000-4000-a000-000000000000';
      statements = statements.map(item => ({ ...item, params: item.params?.map(value => value === original ? ordered : value) }));
    }
    return f.store.batch(statements);
  } };
  await reviewTextRehearsal(f.owner, { runId: run.id, criterionId: 'c1', verdict: 'met', reason: 'Initial approval.' }, store);
  await reviewTextRehearsal(f.owner, { runId: run.id, criterionId: 'c1', verdict: 'not_met', reason: 'Correction: the reply does not meet the expectation.' }, store);
  const suite = await checkRegressionSuite(f.owner, f.version.id);
  assert.equal(suite.passing, false);
  assert.equal(suite.cases[0].status, 'failed');
});

test('plain numeric response-time and cadence criteria cannot become text-only passing claims', async () => {
  const f = await fixture();
  for (const text of ['The assistant responds within 200 ms.', 'The assistant speaks with a natural cadence.']) {
    await assert.rejects(createRegressionCase(f.owner, { ...f.input, criteria: [{ text, blocking: true }] }), /cannot score|text.only|timing/i);
  }
});

test('a previously saved and reviewed numeric timing case is blocked by the current suite policy', async () => {
  const f = await fixture();
  const run = await runTextRehearsal(f.owner, { requestId: 'legacy-timing-claim', caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { ai: goodAi });
  const review = await reviewTextRehearsal(f.owner, { runId: run.id, criterionId: 'c1', verdict: 'met', reason: 'Historical review fixture.' });
  // Reconstruct the internally consistent records the previous policy allowed.
  const rubric = { ...f.rehearsalCase.data.rubric, criteria: [{ id: 'c1', text: 'The assistant responds within 200 ms.', blocking: true }] };
  const caseData = { ...f.rehearsalCase.data, rubric }, caseDigest = sha(caseData);
  await f.store.batch([
    { sql: 'UPDATE entities SET data=? WHERE id=?', params: [JSON.stringify(caseData), f.rehearsalCase.id] },
    { sql: 'UPDATE entities SET data=? WHERE id=?', params: [JSON.stringify({ ...run.data, rubric, caseDigest }), run.id] },
    { sql: 'UPDATE entities SET data=? WHERE id=?', params: [JSON.stringify({ ...review.data, caseDigest }), review.id] },
  ]);
  const suite = await checkRegressionSuite(f.owner, f.version.id);
  assert.equal(suite.passing, false);
});

test('a case revision observed during suite assembly prevents an old reviewed pass', async () => {
  const f = await fixture();
  const run = await runTextRehearsal(f.owner, { requestId: 'suite-snapshot', caseId: f.rehearsalCase.id, agentVersionId: f.version.id }, { ai: goodAi });
  await reviewTextRehearsal(f.owner, { runId: run.id, criterionId: 'c1', verdict: 'met', reason: 'Reviewed initial case.' });
  let revised = false;
  const store: Database = { ...f.store, async all<T extends Record<string, unknown>>(sql: string, params?: Parameters<Database['all']>[1]) {
    const rows = await f.store.all<T>(sql, params);
    if (!revised && params?.includes('regression:case') && sql.includes('ORDER BY')) {
      revised = true;
      await createRegressionCase(f.owner, { ...f.input, previousCaseId: f.rehearsalCase.id, expectedOutcome: 'A revised expectation needs a new run.' });
    }
    return rows;
  } };
  let suite;
  try { suite = await checkRegressionSuite(f.owner, f.version.id, store); }
  catch (error) { assert.match(String(error), /changed|concurrent|refresh/i); }
  assert.equal(revised, true);
  if (suite) assert.equal(suite.passing, false, 'revision during suite reads must invalidate the old pass');
});
