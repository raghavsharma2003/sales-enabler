import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { runAiTask } from '../lib/ai/task-router';
import type { RegressionCaseWriteInput } from '../lib/regression/contracts';
import { checkRegressionSuite, compileTextRehearsalContext, createRegressionCase, listRegressionData, previewRegressionCase, reviewTextRehearsal, runTextRehearsal } from '../lib/regression/service';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { createRecord } from '../lib/platform/records';
import { GET, POST } from '../app/api/regression/route';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'regression-')), 'test.sqlite');
delete process.env.DATABASE_URL;

const config = {
  name: 'Guide', role: 'Customer advisor', objective: 'Help the customer understand one practical next step.', disclosure: 'I am an AI assistant.',
  primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm, brief and specific.', memoryScope: 'none' as const,
  escalation: 'Offer an operator-controlled human handoff when requested.', knowledgeIds: [], systemPrompt: 'Answer the customer directly.', openingMessage: 'Hello, I am an AI assistant.',
  voiceProfile: 'provider-default' as const, enabledTools: ['request_follow_up'] as const,
};

async function user(label = 'regression'): Promise<AuthUser> {
  const store = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  await store.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, label, now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, `${id}@example.test`, 'x', organizationId, now] },
  ]);
  return { id, organizationId, email: `${id}@example.test` };
}

async function fixture(owner: AuthUser) {
  const agent = await createRecord(owner, 'agent_definition', config, 'draft');
  const version = await createRecord(owner, 'agent_version', { agentId: agent.id, number: 1, config, knowledgeDigests: {}, sourceRevision: 1 }, 'versioned');
  const release = await createRecord(owner, 'release', { agentId: agent.id, versionId: version.id, testRunId: 'configuration-check', channel: 'browser' }, 'active');
  const sessionId = randomUUID(), now = new Date().toISOString();
  const transcript = [
    { role: 'assistant', text: 'Hello, I am an AI assistant.' },
    { role: 'user', text: 'My name is Sample Person and my email is sample.person@example.test.' },
    { role: 'assistant', text: 'How can I help?' },
    { role: 'user', text: 'Call me at +91 98765 43210. I need a short explanation of the next step.' },
  ];
  await (await db()).run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [sessionId, owner.organizationId, 'session', null,
    JSON.stringify({ source: 'browser_voice', agentId: agent.id, agentVersionId: version.id, releaseId: release.id, provider: 'azure', inputMode: 'text', transcript }), now]);
  return { agent, version, release, sessionId, transcript };
}

const writeInput = (preview: Awaited<ReturnType<typeof previewRegressionCase>>): RegressionCaseWriteInput => ({
  sourceSessionId: preview.source.sessionId, sourceTranscriptDigest: preview.source.transcriptDigest,
  selectedCallerTurnIndex: preview.source.selectedCallerTurnIndex, prefixStartIndex: preview.source.prefixStartIndex,
  turns: [
    { role: 'assistant', text: 'Hello, I am an AI assistant.' },
    { role: 'user', text: 'My name is [PERSON_1] and my email is [EMAIL_1].' },
    { role: 'assistant', text: 'How can I help?' },
    { role: 'user', text: 'Call me at [PHONE_1]. I need a short explanation of the next step.' },
  ],
  name: 'Brief practical response', language: 'English', expectedOutcome: 'The assistant acknowledges the request and gives one concise next step.',
  criteria: [{ text: 'The assistant briefly acknowledges the request and offers one practical next step.', blocking: true }],
  required: true, redactionConfirmed: true,
});

test('preview is tenant scoped and returns transient redaction suggestions with exact source bindings', async () => {
  const owner = await user('preview-owner'), outsider = await user('preview-outsider');
  const f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  assert.equal(preview.source.agentId, f.agent.id);
  assert.equal(preview.source.agentVersionId, f.version.id);
  assert.equal(preview.source.releaseId, f.release.id);
  assert.equal(preview.sourceTurns.at(-1)?.sourceTurnIndex, 3);
  assert.match(preview.suggestedDerivative[1].text, /\[EMAIL_1\]/);
  assert.match(preview.suggestedDerivative[3].text, /\[PHONE_1\]/);
  await assert.rejects(previewRegressionCase(outsider, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3 }), /not found/);
});

test('approved cases persist only the minimized derivative and immutable lineage, then revise by version', async () => {
  const owner = await user('case-owner'), f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  const first = await createRegressionCase(owner, writeInput(preview));
  assert.equal(first.data.version, 1);
  assert.equal(first.data.executionMode, 'text_rehearsal');
  const stored = await (await db()).all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [first.id, owner.organizationId, 'regression:case']);
  assert.doesNotMatch(stored[0].data, /sample\.person@example\.test|98765 43210|Sample Person/);
  const revised = await createRegressionCase(owner, { ...writeInput(preview), previousCaseId: first.id, expectedOutcome: 'The assistant gives one brief next step.' });
  assert.equal(revised.data.familyId, first.data.familyId);
  assert.equal(revised.data.version, 2);
  const listed = await listRegressionData(owner);
  assert.equal(listed.cases.find(item => item.id === first.id)?.status, 'superseded');
  assert.equal(listed.cases.find(item => item.id === revised.id)?.status, 'approved');
});

test('case approval rejects changed sources, residual identifiers and every acoustic or timing rubric', async () => {
  const owner = await user('case-guards'), f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  await assert.rejects(createRegressionCase(owner, { ...writeInput(preview), turns: preview.sourceTurns.map(({ role, text }) => ({ role, text })) }), /identifiers remain/);
  await assert.rejects(createRegressionCase(owner, { ...writeInput(preview), criteria: [{ text: 'The assistant has natural prosody and low latency.', blocking: true }] }), /cannot score audio/);
  const row = await (await db()).all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [f.sessionId, owner.organizationId, 'session']);
  const changed = JSON.parse(row[0].data); changed.transcript[3].text = 'The saved caller turn changed.';
  await (await db()).run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify(changed), f.sessionId, owner.organizationId, 'session']);
  await assert.rejects(createRegressionCase(owner, writeInput(preview)), /changed/);
});

test('suite check blocks legacy text cases whose criteria now cross the acoustic boundary', async () => {
  const owner = await user('legacy-acoustic'), f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  const rehearsalCase = await createRegressionCase(owner, writeInput(preview));
  const store = await db();
  const [row] = await store.all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [rehearsalCase.id, owner.organizationId, 'regression:case']);
  const legacy = JSON.parse(row.data); legacy.rubric.criteria[0].text = 'The assistant responds within 200 ms.';
  await store.run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify(legacy), rehearsalCase.id, owner.organizationId, 'regression:case']);
  const suite = await checkRegressionSuite(owner, f.version.id);
  assert.equal(suite.passing, false);
  assert.equal(suite.cases[0].status, 'stale');
});

test('text rehearsal runs the exact candidate with compiled guidance and no tools, then preserves exact-quote model evidence', async () => {
  const owner = await user('run-owner'), outsider = await user('run-outsider'), f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  const rehearsalCase = await createRegressionCase(owner, writeInput(preview));
  const calls: Parameters<typeof runAiTask>[1][] = [];
  const ai = (async (_user, input) => {
    calls.push(input);
    if (input.task === 'answer') {
      assert.match(input.system, /No action tools are connected/);
      assert.match(input.system, /surrogate text rehearsal/i);
      assert.match(input.system, /CURRENT-CALL RELATIONAL BEHAVIOR/);
      assert.doesNotMatch(input.input, /sample\.person@example\.test|98765 43210/);
      return { text: 'I hear your request. The next step is to review the short checklist.', model: 'fast-slot', usage: { inputTokens: 20, outputTokens: 10 }, runId: 'airun:response', cached: false };
    }
    return { text: JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'The reply acknowledges the request and gives a next step.', evidence: [{ entryIndex: 3, quote: 'I need a short explanation of the next step' }, { entryIndex: 4, quote: 'The next step is to review the short checklist' }] }] }),
      model: 'evaluation-slot', usage: { inputTokens: 30, outputTokens: 20 }, runId: 'airun:evaluation', cached: false };
  }) as typeof runAiTask;
  const run = await runTextRehearsal(owner, { requestId: 'rehearsal-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai });
  assert.equal(run.status, 'complete');
  assert.equal(run.data.agentVersionId, f.version.id);
  assert.deepEqual(run.data.judgments[0].evidence.map(item => item.entryIndex), [3, 4]);
  assert.equal(run.data.responseAiRunId, 'airun:response');
  assert.equal(calls.length, 2);
  assert.equal((await runTextRehearsal(owner, { requestId: 'rehearsal-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai })).id, run.id);
  assert.equal(calls.length, 2);
  await assert.rejects(runTextRehearsal(owner, { requestId: 'rehearsal-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai, compiler: input => {
    const compiled = compileTextRehearsalContext(input);
    return { ...compiled, system: `${compiled.system}\nChanged policy.` };
  } }), /different inputs/);
  assert.equal(calls.length, 2);
  await assert.rejects(reviewTextRehearsal(owner, { runId: run.id, criterionId: 'c1', verdict: 'met', reason: 'This review targets the obsolete runtime.' }, undefined, { compiler: input => {
    const compiled = compileTextRehearsalContext(input);
    return { ...compiled, system: `${compiled.system}\nChanged policy.` };
  } }), /runtime policy changed/);
  await assert.rejects(runTextRehearsal(outsider, { requestId: 'outsider-run', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai }), /not found/);
  await assert.rejects(reviewTextRehearsal(outsider, { runId: run.id, criterionId: 'c1', verdict: 'met', reason: 'Cross-tenant attempt.' }), /not found/);
  const persisted = await (await db()).all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [run.id, owner.organizationId, 'regression:run']);
  assert.doesNotMatch(persisted[0].data, /sample\.person@example\.test|98765 43210|Sample Person/);
});

test('invalid and uncertain runs never pass, and uncertain requests cannot automatically replay', async () => {
  const owner = await user('run-failure'), f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  const rehearsalCase = await createRegressionCase(owner, writeInput(preview));
  let calls = 0;
  const uncertain = (async () => { calls++; throw new Error('provider unavailable'); }) as typeof runAiTask;
  await assert.rejects(runTextRehearsal(owner, { requestId: 'uncertain-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai: uncertain }), /provider unavailable/);
  await assert.rejects(runTextRehearsal(owner, { requestId: 'uncertain-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai: uncertain }), /uncertain outcome/);
  assert.equal(calls, 1);
  assert.equal((await listRegressionData(owner)).runs.find(item => item.id.includes('regression-run:'))?.status, 'uncertain');
  const suite = await checkRegressionSuite(owner, f.version.id);
  assert.equal(suite.passing, false);
  assert.equal(suite.cases[0].status, 'uncertain');
  const prefixOnlyAi = (async (_user, input) => input.task === 'answer'
    ? ({ text: 'I understand. Here is one next step.', model: 'fast', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'prefix-response', cached: false })
    : ({ text: JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'The historical caller asked for a next step.', evidence: [{ entryIndex: 3, quote: 'I need a short explanation of the next step' }] }] }), model: 'eval', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'prefix-eval', cached: false })) as typeof runAiTask;
  const prefixOnly = await runTextRehearsal(owner, { requestId: 'prefix-only-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai: prefixOnlyAi });
  assert.equal(prefixOnly.status, 'invalid');
  assert.match(prefixOnly.data.invalidReason || '', /newly generated candidate reply/);
  const invalidAi = (async (_user, input) => input.task === 'answer'
    ? ({ text: 'I understand. Here is one next step.', model: 'fast', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'invalid-response', cached: false })
    : ({ text: JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'Fabricated quote.', evidence: [{ entryIndex: 4, quote: 'words not present anywhere' }] }] }), model: 'eval', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'invalid-eval', cached: false })) as typeof runAiTask;
  const invalid = await runTextRehearsal(owner, { requestId: 'invalid-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai: invalidAi });
  assert.equal(invalid.status, 'invalid');
  const afterInvalid = await checkRegressionSuite(owner, f.version.id);
  assert.equal(afterInvalid.passing, false);
  assert.equal(afterInvalid.cases[0].status, 'invalid');
});

test('append-only human review is required for every blocking criterion before a suite passes', async () => {
  const owner = await user('review-owner'), f = await fixture(owner);
  const preview = await previewRegressionCase(owner, { sourceSessionId: f.sessionId, selectedCallerTurnIndex: 3, prefixStartIndex: 0 });
  const rehearsalCase = await createRegressionCase(owner, writeInput(preview));
  const ai = (async (_user, input) => input.task === 'answer'
    ? ({ text: 'I understand. The next step is to review the checklist.', model: 'fast', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'response', cached: false })
    : ({ text: JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'uncertain', rationale: 'Human review should decide whether the next step is sufficiently practical.', evidence: [] }] }), model: 'eval', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'evaluation', cached: false })) as typeof runAiTask;
  const run = await runTextRehearsal(owner, { requestId: 'reviewed-one', caseId: rehearsalCase.id, agentVersionId: f.version.id }, { ai });
  assert.equal((await checkRegressionSuite(owner, f.version.id)).cases[0].status, 'review_needed');
  const first = await reviewTextRehearsal(owner, { runId: run.id, criterionId: 'c1', verdict: 'not_met', reason: 'The operator found the response too generic.' });
  assert.equal((await checkRegressionSuite(owner, f.version.id)).cases[0].status, 'failed');
  const revised = await reviewTextRehearsal(owner, { runId: run.id, criterionId: 'c1', verdict: 'met', reason: 'The latest review confirms one bounded next step.' });
  assert.notEqual(revised.id, first.id);
  const suite = await checkRegressionSuite(owner, f.version.id);
  assert.equal(suite.passing, true);
  assert.equal(suite.cases[0].status, 'passed');
  const changedPolicy = await checkRegressionSuite(owner, f.version.id, undefined, { compiler: input => {
    const compiled = compileTextRehearsalContext(input);
    return { ...compiled, system: `${compiled.system}\nA newer relational response policy applies.` };
  } });
  assert.equal(changedPolicy.passing, false);
  assert.equal(changedPolicy.cases[0].status, 'stale');
  const revisedCase = await createRegressionCase(owner, { ...writeInput(preview), previousCaseId: rehearsalCase.id, expectedOutcome: 'A revised reviewed expectation.' });
  assert.equal(revisedCase.data.version, 2);
  const staleSuite = await checkRegressionSuite(owner, f.version.id);
  assert.equal(staleSuite.passing, false);
  assert.equal(staleSuite.cases[0].status, 'missing');
});

test('regression API requires authentication and same-origin writes', async () => {
  assert.equal((await GET(new Request('http://localhost:3000/api/regression'))).status, 401);
  assert.equal((await POST(new Request('http://localhost:3000/api/regression', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))).status, 403);
});
