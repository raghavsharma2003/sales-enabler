// The analysis contract and the per-workspace analysis model (single or tiered), against a real Postgres with a fake LLM
// that answers by model id. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled, analysisPrompt, MODEL_CODES } from '../server/modules/calls/analysis.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
const savedModels = process.env.VP_ANALYSIS_MODELS;

before(() => { if (skip) return; process.env.VP_ANALYSIS_MODELS = 'small-model,big-model'; pool = createPool(URL_); registry = buildApp(pool, [calls]).registry; });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end();
  if (savedModels === undefined) delete process.env.VP_ANALYSIS_MODELS; else process.env.VP_ANALYSIS_MODELS = savedModels; });

const m: RunManifest = { combinationId: 't', stackId: 't', agentVersionHash: 't', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 't' };
const LINES = [
  { speaker: 'agent' as const, text: 'Namaste, main Asha bol rahi hoon Saral Finance se, ek AI assistant.' },
  { speaker: 'caller' as const, text: 'Main unka bhai bol raha hoon, Ramesh ji ghar par nahi hain.' },
  { speaker: 'agent' as const, text: 'Koi baat nahi, main baad mein unse baat kar lungi.' },
];

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('tier test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'Result','What did the person decide?','{agreed,callback,not_interested,needs_human,wrong_person}','{agreed}') RETURNING id`, [ws]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'C','service',$2) RETURNING id", [ws, def]))!.id;
  return { ws, owner, campaign, member: { type: 'member', id: owner, role: 'owner' } as Actor };
}
let phone = 9400000000;
async function analysedCall(w: Awaited<ReturnType<typeof workspace>>) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id", [w.ws, `+91${phone++}`]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel) VALUES ($1,$2,$3,'phone') RETURNING id", [w.ws, attempt, contact]))!.id;
  const at = new Date().toISOString();
  const events: RuntimeEvent[] = [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'call.ended', at, endReason: 'completed', durationS: 30, transcript: LINES.map((l, i) => ({ ...l, startMs: i * 3000 })), manifest: m }];
  await ingest(pool, { conversationId: conv, events });
  await analysesSettled();
  return (await one<any>(pool, 'SELECT reason_code, analysis FROM conversation WHERE id = $1', [conv])) as { reason_code: string; analysis: any } & { id?: string };
}
const answer = (o: Record<string, unknown>) => JSON.stringify({ points: [], moments: [], reasonCode: 'CONV_WRONG_PERSON', forget: null, ...o });
const wrongPerson = (confidence: number) => ({ value: 'wrong_person', quote: 'Main unka bhai bol raha hoon', confidence });
/** A fake that answers per model id and records which models were asked. */
function byModel(table: Record<string, string | Error>, seen: string[]) {
  return (req: LlmRequest) => {
    const id = req.model ?? 'deployment-default'; seen.push(id);
    const r = table[id] ?? table.default;
    if (r instanceof Error) throw r;
    return { text: r, toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: id, provider: 'fake' };
  };
}

test('the contract is written as shapes; the model may name CONV_* codes only and is told when null is allowed', () => {
  const p = analysisPrompt({ question: 'What did the person decide?', values: ['agreed', 'wrong_person'] });
  assert.match(p, /^TASK: /);
  assert.match(p, /- commitment: PERSON agrees to do something/);
  assert.match(p, /- is not the person called \(relative, colleague, wrong number\) -> wrong-person VALUE; never null/);
  assert.match(p, /- complains AND asks for a human, person or manager -> needs-human VALUE; never null/);
  assert.match(p, /- asks never to be called again -> refusing VALUE; never the call-later VALUE/);
  assert.match(p, /- null: no shape above; or cannot follow the language; or hangs up before the question; or distress/);
  assert.doesNotMatch(p, /decided only when the PERSON takes a stance/, 'the stance sentence is gone (rejected.2026-10-23.analysis-stance-rule-mini-false-nulls)');
  assert.doesNotMatch(p, /null only when no PERSON line bears/, 'the rejected rule is gone (rejected.2026-10-23.analysis-outcome-null-only-rule)');
  assert.match(p, /"confidence":number/);
  assert.ok(MODEL_CODES.length > 0 && MODEL_CODES.every(c => c.startsWith('CONV_')));
  assert.doesNotMatch(p, /END_HANDED_OFF|END_OPTED_OUT|END_CRISIS/, 'engine codes are never offered to the model');
  assert.match(analysisPrompt({ question: null, values: [] }), /OUTCOME: always null\./);
});

test('a model that names an engine code (END_HANDED_OFF) does not change the reason; the code keeps CONV_INCOMPLETE', { skip }, async () => {
  const w = await workspace();
  setFakeLlm(byModel({ default: answer({ reasonCode: 'END_HANDED_OFF', outcome: wrongPerson(0.9) }) }, []));
  const c = await analysedCall(w);
  assert.equal(c.reason_code, 'CONV_INCOMPLETE');
  assert.equal(c.analysis.modelReasonCode, null);
});

test('analysis.model.set: owner approval, curated models only, and tiered needs a second model', { skip }, async () => {
  const w = await workspace();
  const ctx = { workspaceId: w.ws, actor: w.member };
  const bad = await registry.execute(pool, 'analysis.model.set', { mode: 'single', model: 'not-curated' }, ctx);
  assert.equal(bad.status, 'needs_approval', 'spend: a person approves the change');
  if (bad.status !== 'needs_approval') return;
  const badRun = await registry.approve(pool, bad.actionId, { workspaceId: w.ws, memberId: w.owner });
  assert.equal(badRun.status, 'not_executed');
  assert.match(badRun.status === 'not_executed' ? badRun.reason : '', /not one of the curated analysis models/);
  const noSecond = await registry.execute(pool, 'analysis.model.set', { mode: 'tiered', model: 'small-model' }, ctx);
  if (noSecond.status !== 'needs_approval') return assert.fail('expected a proposal');
  assert.equal((await registry.approve(pool, noSecond.actionId, { workspaceId: w.ws, memberId: w.owner })).status, 'not_executed');
  const ok = await registry.execute(pool, 'analysis.model.set', { mode: 'tiered', model: 'small-model', escalateModel: 'big-model', threshold: 0.7 }, ctx);
  if (ok.status !== 'needs_approval') return assert.fail('expected a proposal');
  assert.match(ok.summary, /read unclear calls again with "big-model"/);
  const done = await registry.approve<any>(pool, ok.actionId, { workspaceId: w.ws, memberId: w.owner });
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  const got = await registry.execute<any>(pool, 'analysis.settings.get', {}, ctx);
  assert.equal(got.status, 'confirmed');
  if (got.status !== 'confirmed') return;
  assert.deepEqual({ mode: got.result.mode, model: got.result.model, escalateModel: got.result.escalateModel, threshold: got.result.threshold },
    { mode: 'tiered', model: 'small-model', escalateModel: 'big-model', threshold: 0.7 });
  assert.deepEqual(got.result.models, ['small-model', 'big-model']);
});

async function tiered(w: Awaited<ReturnType<typeof workspace>>, threshold = 0.6) {
  await pool.query("INSERT INTO call_analysis_setting (workspace_id, mode, model, escalate_model, threshold) VALUES ($1,'tiered','small-model','big-model',$2)", [w.ws, threshold]);
}
const costs = (ws: string) => many<{ model: string; tier: string | null }>(pool,
  "SELECT detail->>'model' AS model, detail->>'tier' AS tier FROM cost_line WHERE workspace_id = $1 AND component = 'analysis' ORDER BY created_at", [ws]);

test('tiered: no outcome from the first model escalates; the second model decides; both passes are cost lines', { skip }, async () => {
  const w = await workspace();
  await tiered(w);
  const seen: string[] = [];
  setFakeLlm(byModel({ 'small-model': answer({ outcome: null }), 'big-model': answer({ outcome: wrongPerson(0.95) }) }, seen));
  const c = await analysedCall(w);
  assert.deepEqual(seen, ['small-model', 'big-model']);
  assert.equal(c.analysis.outcomeGuess.value, 'wrong_person');
  assert.deepEqual(c.analysis.tier, { escalated: true, why: 'no outcome', firstModel: 'small-model', secondModel: 'big-model', secondFailed: false });
  assert.deepEqual(await costs(w.ws), [{ model: 'small-model', tier: 'first' }, { model: 'big-model', tier: 'escalated' }]);
});

test('tiered: a clear first answer is not escalated (one cost line); low confidence is escalated', { skip }, async () => {
  const w = await workspace();
  await tiered(w, 0.6);
  const seen: string[] = [];
  setFakeLlm(byModel({ 'small-model': answer({ outcome: wrongPerson(0.9) }), 'big-model': answer({ outcome: wrongPerson(0.99) }) }, seen));
  const clear = await analysedCall(w);
  assert.deepEqual(seen, ['small-model']);
  assert.deepEqual(clear.analysis.tier, { escalated: false, why: null, firstModel: 'small-model', secondModel: null, secondFailed: false });
  assert.equal((await costs(w.ws)).length, 1);

  seen.length = 0;
  setFakeLlm(byModel({ 'small-model': answer({ outcome: wrongPerson(0.3) }), 'big-model': answer({ outcome: wrongPerson(0.97) }) }, seen));
  const unsure = await analysedCall(w);
  assert.deepEqual(seen, ['small-model', 'big-model']);
  assert.equal(unsure.analysis.tier.why, 'low confidence');
  assert.equal(unsure.analysis.outcomeConfidence, 0.97);
});

test('tiered: when the second model fails, the first answer stands and the failure is recorded; single mode uses the chosen model only', { skip }, async () => {
  const w = await workspace();
  await tiered(w);
  const seen: string[] = [];
  setFakeLlm(byModel({ 'small-model': answer({ outcome: wrongPerson(0.2) }), 'big-model': new Error('model down') }, seen));
  const c = await analysedCall(w);
  assert.equal(c.analysis.status, 'done');
  assert.equal(c.analysis.outcomeGuess.value, 'wrong_person', 'the first pass still counts');
  assert.equal(c.analysis.tier.secondFailed, true);
  assert.equal((await costs(w.ws)).length, 1, 'a call that never answered is not a cost line');

  const s = await workspace();
  await pool.query("INSERT INTO call_analysis_setting (workspace_id, mode, model) VALUES ($1,'single','big-model')", [s.ws]);
  const seen2: string[] = [];
  setFakeLlm(byModel({ 'small-model': answer({ outcome: null }), 'big-model': answer({ outcome: null }) }, seen2));
  const one_ = await analysedCall(s);
  assert.deepEqual(seen2, ['big-model'], 'single mode never escalates');
  assert.equal(one_.analysis.tier, null);
});
