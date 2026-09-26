import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { assess, comparison, createScenario, importTrial, listEvaluationData, rate, reviewAssessment } from '../lib/evaluations/service';
import { parseJudgments, seedScenarios, type AssessmentReview } from '../lib/evaluations/schema';
import type { runAiTask } from '../lib/ai/task-router';
import { GET, POST } from '../app/api/evaluations/route';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'evaluations-')), 'test.sqlite');
async function user(): Promise<AuthUser> {
  const store = await db(); const id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  await store.batch([
    { sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', params: [organizationId, 'Evaluation test', now] },
    { sql: 'INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, `${id}@example.test`, 'none', organizationId, now] },
  ]);
  return { id, organizationId, email: `${id}@example.test` };
}
async function session(owner: AuthUser) {
  const id = randomUUID();
  await (await db()).run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, owner.organizationId, 'session', null,
    JSON.stringify({ provider: 'Azure', inputMode: 'text', transcript: [{ role: 'user', text: 'What is the deadline?' }, { role: 'assistant', text: 'The deadline is Friday.' }] }), new Date().toISOString()]);
  return id;
}
const rubric = { name: 'Deadline answer', language: 'English', scenario: 'A customer asks the deadline.', expectedOutcome: 'Assistant answers Friday.', criteria: ['Assistant says Friday.'] };
const fakeAi = (text: string) => (async () => ({ text, model: 'evaluation-slot', usage: { inputTokens: 100, outputTokens: 20 }, runId: 'airun:test', cached: false })) as typeof runAiTask;

test('scenario revisions are immutable, tenant scoped, and seeded cases remain available', async () => {
  const a = await user(), b = await user();
  await assert.rejects(createScenario(a, { ...rubric, criteria: [] }), /observable criteria/);
  const v1 = await createScenario(a, rubric); const v2 = await createScenario(a, { ...rubric, previousId: v1.id, expectedOutcome: 'Assistant gives a verified date.' });
  assert.equal(v1.version, 1); assert.equal(v2.version, 2); assert.notEqual(v1.id, v2.id);
  const all = await listEvaluationData(a); const other = await listEvaluationData(b);
  assert.equal(all.scenarios.find(s => s.id === v1.id)?.expectedOutcome, 'Assistant answers Friday.');
  assert.equal(other.scenarios.some(s => s.id === v1.id), false);
  assert.equal(other.scenarios.length, seedScenarios().length);
  await assert.rejects(createScenario(b, { ...rubric, previousId: v1.id }), /not found/);
});

test('exact bounded quote validation rejects fabricated sources and acoustic scores', () => {
  const scenario = { ...seedScenarios()[0], criteria: [{ id: 'c1', text: 'Assistant says Friday.' }] };
  const turns = [{ role: 'assistant' as const, text: 'The deadline is Friday.' }];
  const good = JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'The stated date matches.', evidence: [{ entryIndex: 0, quote: 'deadline is Friday' }] }] });
  assert.equal(parseJudgments(good, scenario, turns)[0].verdict, 'met');
  assert.throws(() => parseJudgments(good.replace('deadline is Friday', 'deadline is Monday'), scenario, turns), /quote/);
  assert.throws(() => parseJudgments(good.replace('"entryIndex":0', '"entryIndex":3'), scenario, turns), /quote/);
  assert.throws(() => parseJudgments('{broken', scenario, turns), /malformed JSON/);
  assert.throws(() => parseJudgments(good, { ...scenario, criteria: [{ id: 'c1', text: 'Playback mutes promptly after interruption.' }] }, turns), /Transcript-only/);
});

test('saved call assessment captures model receipt, rubric, snapshot and validated quotes', async () => {
  const owner = await user(); const sourceId = await session(owner); const scenario = await createScenario(owner, rubric);
  const judgment = JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'The answer states Friday.', evidence: [{ entryIndex: 1, quote: 'deadline is Friday' }] }] });
  let calls = 0;
  const ai = (async (...args: Parameters<typeof runAiTask>) => { calls++; assert.equal(args[1].task, 'evaluation'); assert.equal(args[1].responseFormat, 'json_object'); return fakeAi(judgment)(...args); }) as typeof runAiTask;
  const body = { requestId: randomUUID(), sourceType: 'session', sourceId, scenarioId: scenario.id };
  const first = await assess(owner, body, { ai });
  const replay = await assess(owner, body, { ai });
  assert.equal(calls, 1); assert.equal(first.status, 'complete'); assert.equal(replay.id, first.id);
  assert.equal(first.rubricVersion, 1); assert.equal(first.provider, 'Azure'); assert.equal(first.usage.outputTokens, 20);
  assert.equal(first.judgments[0].evidence[0].entryIndex, 1);
  assert.equal(first.rawAiText, judgment);
  assert.equal(first.measurement.assistantEntries, 1);
  const other = await user();
  await assert.rejects(assess(other, { ...body, requestId: randomUUID() }, { ai }), /not found/);
  assert.equal((await listEvaluationData(other)).assessments.length, 0);
});

test('malformed model evidence is saved invalid without an automatic score', async () => {
  const owner = await user(); const sourceId = await session(owner); const scenario = await createScenario(owner, rubric);
  const bad = JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'Looks right.', evidence: [{ entryIndex: 1, quote: 'made up words' }] }] });
  const result = await assess(owner, { requestId: randomUUID(), sourceType: 'session', sourceId, scenarioId: scenario.id }, { ai: fakeAi(bad) });
  assert.equal(result.status, 'invalid'); assert.deepEqual(result.judgments, []); assert.equal(result.rawAiText, bad);
  assert.match(result.invalidReason || '', /quote/);
});

test('operator review corrects a contradictory model verdict without rewriting it', async () => {
  const owner = await user(); const sourceId = await session(owner);
  const scenario = await createScenario(owner, { ...rubric, expectedOutcome: 'No false claim.', criteria: ['Assistant does not claim the counsellor follow-up has already happened.'] });
  const raw = JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'not_met', rationale: 'The assistant only offers future help, so the criterion is met.', evidence: [{ entryIndex: 1, quote: 'deadline is Friday' }] }] });
  const assessment = await assess(owner, { requestId: randomUUID(), sourceType: 'session', sourceId, scenarioId: scenario.id }, { ai: fakeAi(raw) });
  assert.equal(assessment.status, 'complete');
  const reviewed = await reviewAssessment(owner, { assessmentId: assessment.id, criterionId: 'c1', verdict: 'met', reason: 'The model inverted this negated criterion; the saved text does not claim a completed follow-up.' });
  assert.equal(reviewed.rawVerdict, 'not_met'); assert.equal(reviewed.verdict, 'met'); assert.equal(reviewed.sourceId, sourceId); assert.equal(reviewed.operatorId, owner.id);
  const listed = await listEvaluationData(owner);
  assert.equal(listed.assessments.find(item => item.id === assessment.id)?.judgments[0].verdict, 'not_met');
  assert.equal(listed.assessments.find(item => item.id === assessment.id)?.rawAiText, raw);
  assert.equal(listed.reviews.find(item => item.id === reviewed.id)?.verdict, 'met');
  const other = await user();
  await assert.rejects(reviewAssessment(other, { assessmentId: assessment.id, criterionId: 'c1', verdict: 'met', reason: 'Other tenant' }), /not found/);
  await assert.rejects(reviewAssessment(owner, { assessmentId: assessment.id, criterionId: 'absent', verdict: 'met', reason: 'Bad criterion' }), /Criterion is not present/);
  await (await db()).run('DELETE FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [sourceId, owner.organizationId, 'session']);
  await assert.rejects(reviewAssessment(owner, { assessmentId: assessment.id, criterionId: 'c1', verdict: 'met', reason: 'Source missing' }), /not found/);
});

test('older assessments recover their exact raw response from the tenant AI receipt', async () => {
  const owner = await user(); const sourceId = await session(owner); const scenario = await createScenario(owner, rubric);
  const raw = JSON.stringify({ judgments: [{ criterionId: 'c1', verdict: 'met', rationale: 'Friday is stated.', evidence: [{ entryIndex: 1, quote: 'deadline is Friday' }] }] });
  const runId = `airun:${randomUUID()}`;
  const ai = (async () => ({ text: raw, model: 'evaluation-slot', usage: { inputTokens: 10, outputTokens: 5 }, runId, cached: false })) as typeof runAiTask;
  const assessment = await assess(owner, { requestId: randomUUID(), sourceType: 'session', sourceId, scenarioId: scenario.id }, { ai });
  const store = await db();
  const [row] = await store.all<{ data: string }>('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [assessment.id, owner.organizationId, 'eval:assessment']);
  const old = JSON.parse(row.data); delete old.rawAiText;
  await store.run('UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ?', [JSON.stringify(old), assessment.id, owner.organizationId, 'eval:assessment']);
  await store.run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [runId, owner.organizationId, 'ai:run', 'complete', JSON.stringify({ text: raw }), new Date().toISOString()]);
  assert.equal((await listEvaluationData(owner)).assessments.find(item => item.id === assessment.id)?.rawAiText, raw);
  assert.equal((await listEvaluationData(await user())).assessments.some(item => item.id === assessment.id), false);
});

test('imported trial and human rating preserve unverified source and audio scope', async () => {
  const owner = await user(); const scenario = await createScenario(owner, rubric);
  const conditions = { language: 'English', scriptVersion: '1', network: 'wifi', device: 'headset', knowledgeSnapshot: 'kb-1', components: 'declared by operator' };
  const trial = await importTrial(owner, { vendor: 'Example vendor', scenarioId: scenario.id, transcript: [{ role: 'assistant', text: 'The deadline is Friday.' }], sourceLabel: 'test recording 1', inputMode: 'microphone', notes: '', pairId: 'pair-1', conditions });
  assert.equal(trial.verification, 'operator_imported_unverified');
  const rating = await rate(owner, { sourceType: 'trial', sourceId: trial.id, scenarioId: scenario.id, criterionId: 'c1', score: 4, heardAudio: false, note: 'Text only' });
  assert.equal(rating.heardAudio, false); assert.equal(rating.operatorId, owner.id);
  await assert.rejects(importTrial(await user(), { vendor: 'X', scenarioId: scenario.id, transcript: [{ role: 'assistant', text: 'X' }], sourceLabel: 'X', inputMode: 'text', conditions }), /not found/);
});

test('comparison exposes missing baseline and gates differences below three matched pairs', () => {
  const base = { id: 'a', status: 'complete' as const, scenarioId: 's:v1', rubricVersion: 1, sourceType: 'session' as const, sourceId: 's1', inputMode: 'text', pairId: 'p1',
    conditions: { language: 'English', scriptVersion: '1', network: 'wifi', device: 'headset', knowledgeSnapshot: 'k', components: 'same' },
    judgments: [{ criterionId: 'c1', verdict: 'met' as const, rationale: 'r', evidence: [] }], createdAt: '', transcript: [], provider: 'Ours', configSnapshot: null,
    model: 'm', usage: { inputTokens: 1, outputTokens: 1 }, aiRunId: 'x', measurement: { transcriptEntries: 0, assistantEntries: 0, userEntries: 0 } };
  const missing = comparison([base], []);
  assert.equal(missing.pairedN, 0); assert.equal(missing.missing.unmatchedOwn, 1);
  const competitor = { ...base, id: 'b', sourceType: 'trial' as const, sourceId: 't1', judgments: [{ ...base.judgments[0], verdict: 'not_met' as const }] };
  const modelOnly = comparison([base, competitor], []);
  assert.equal(modelOnly.pairedN, 1); assert.equal(modelOnly.criteria[0].n, 0); assert.equal(modelOnly.missing.unreviewedCriterionSides, 2);
  const aReview: AssessmentReview = { id: 'review-a', createdAt: '2026-01-01T00:00:00Z', assessmentId: 'a', criterionId: 'c1', verdict: 'met', reason: 'Checked quote.', operatorId: 'operator-1', scenarioId: 's:v1', rubricVersion: 1, sourceType: 'session', sourceId: 's1', transcriptDigest: 'digest', rawVerdict: 'met', rawRationale: 'r' };
  const bReview = { ...aReview, id: 'review-b', assessmentId: 'b', verdict: 'not_met' as const };
  const one = comparison([base, competitor], [], [aReview, bReview]);
  assert.equal(one.pairedN, 1); assert.equal(one.criteria[0].n, 1); assert.equal(one.criteria[0].differencePercentagePoints, null);
  const partial = comparison([base, competitor], [], [aReview]);
  assert.equal(partial.criteria[0].n, 0); assert.equal(partial.missing.unreviewedCriterionSides, 1);
  const mismatched = comparison([base, { ...competitor, conditions: { ...base.conditions, network: 'cellular' } }], []);
  assert.equal(mismatched.pairedN, 0);
  const duplicate = comparison([base, { ...base, id: 'a2' }, competitor], []);
  assert.equal(duplicate.pairedN, 0); assert.equal(duplicate.missing.ambiguousPairGroups, 1);
});

test('comparison uses latest explicit reviews and decisive per-criterion denominators', () => {
  const conditionSet = { language: 'English', scriptVersion: '1', network: 'wifi', device: 'headset', knowledgeSnapshot: 'k', components: 'same' };
  const assessments = [1, 2, 3].flatMap(n => ([
    { id: `own-${n}`, sourceType: 'session' as const, pairId: `pair-${n}`, judgments: [{ criterionId: 'c1', verdict: 'not_met' as const, rationale: 'raw model', evidence: [] }] },
    { id: `trial-${n}`, sourceType: 'trial' as const, pairId: `pair-${n}`, judgments: [{ criterionId: 'c1', verdict: 'met' as const, rationale: 'raw model', evidence: [] }] },
  ].map(item => ({ ...item, status: 'complete' as const, scenarioId: 's:v1', rubricVersion: 1, sourceId: item.id, inputMode: 'text', conditions: conditionSet,
    createdAt: '', transcript: [], provider: 'p', configSnapshot: null, model: 'm', usage: { inputTokens: 1, outputTokens: 1 }, aiRunId: 'x', measurement: { transcriptEntries: 0, assistantEntries: 0, userEntries: 0 } }))));
  const reviews: AssessmentReview[] = assessments.map((item, index) => ({ id: `review-${index}`, createdAt: '2026-01-01T00:00:00Z', assessmentId: item.id, criterionId: 'c1', verdict: item.sourceType === 'session' ? 'met' : 'not_met', reason: 'Operator checked transcript.', operatorId: 'operator', scenarioId: 's:v1', rubricVersion: 1, sourceType: item.sourceType, sourceId: item.id, transcriptDigest: 'digest', rawVerdict: item.judgments[0].verdict, rawRationale: 'raw model' }));
  const first = comparison(assessments, [], reviews);
  assert.equal(first.criteria[0].n, 3); assert.equal(first.criteria[0].differencePercentagePoints, 100);
  const revised = { ...reviews[0], id: 'later', createdAt: '2026-01-02T00:00:00Z', verdict: 'not_met' as const };
  assert.equal(comparison(assessments, [], [...reviews, revised]).criteria[0].differencePercentagePoints, 67);
  const uncertain = { ...reviews[1], id: 'uncertain', createdAt: '2026-01-02T00:00:00Z', verdict: 'uncertain' as const };
  const reduced = comparison(assessments, [], [...reviews, uncertain]);
  assert.equal(reduced.criteria[0].n, 2); assert.equal(reduced.criteria[0].differencePercentagePoints, null);
});

test('evaluation routes require authentication and same origin', async () => {
  const read = await GET(new Request('http://localhost:3000/api/evaluations'));
  assert.equal(read.status, 401);
  const write = await POST(new Request('http://localhost:3000/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(write.status, 403);
});
