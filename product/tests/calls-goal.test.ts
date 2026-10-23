// One definition of "goal reached" (calls/goal.ts): analysis, outcomes, the funnel, insight and the reason code agree.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { campaignFunnel } from '../server/modules/calls/stats.ts';
import { GOAL_SQL } from '../server/modules/calls/goal.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end(); });

const m: RunManifest = { combinationId: 'g', stackId: 'g', agentVersionHash: 'g', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'g' };
const LINES = [{ speaker: 'agent' as const, text: 'Renewal ka time aa gaya hai, kar doon?', startMs: 0 }, { speaker: 'caller' as const, text: 'Haan theek hai, kar do renewal.', startMs: 3000 }];

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('goal test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'R','Did they renew?','{renewed,not_now}','{renewed}') RETURNING id`, [ws]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'C','service',$2) RETURNING id", [ws, def]))!.id;
  return { ws, def, campaign, member: { type: 'member', id: owner, role: 'owner' } as Actor };
}
let phone = 9700000000;
/** A campaign call analysed by a model that says `reasonCode` and `outcome`. */
async function call(w: Awaited<ReturnType<typeof workspace>>, reasonCode: string | null, outcome: string | null) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id", [w.ws, `+91${phone++}`]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel) VALUES ($1,$2,$3,'phone') RETURNING id", [w.ws, attempt, contact]))!.id;
  setFakeLlm(() => ({ text: JSON.stringify({ points: [], moments: [], reasonCode, forget: null,
    outcome: outcome ? { value: outcome, quote: 'Haan theek hai, kar do renewal.', confidence: 0.9 } : null }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'f', provider: 'f' }));
  const at = new Date().toISOString();
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'call.ended', at, endReason: 'completed', durationS: 30, transcript: LINES, manifest: m }] as RuntimeEvent[] });
  await analysesSettled();
  return conv;
}
const reason = async (id: string) => (await one<{ reason_code: string }>(pool, 'SELECT reason_code FROM conversation WHERE id = $1', [id]))!.reason_code;

test('the reason code follows the outcome: no "goal done" without a goal outcome, and a goal outcome is "goal done"', { skip }, async () => {
  const w = await workspace();
  assert.equal(await reason(await call(w, 'CONV_GOAL_DONE', 'not_now')), 'CONV_INCOMPLETE', 'the model said goal done, the outcome says not now');
  assert.equal(await reason(await call(w, 'CONV_GOAL_DONE', null)), 'CONV_INCOMPLETE', 'no outcome on a call whose goal is defined is not goal done');
  assert.equal(await reason(await call(w, 'CONV_NOT_INTERESTED', 'renewed')), 'CONV_GOAL_DONE', 'the outcome reached the goal');
});

test('a later verified outcome or a person\'s label moves the reason code with it; engine codes are never rewritten', { skip }, async () => {
  const w = await workspace();
  const conv = await call(w, 'CONV_NOT_INTERESTED', 'not_now');
  assert.equal(await reason(conv), 'CONV_NOT_INTERESTED');
  const v = await registry.execute(pool, 'outcome.record_verified', { conversationId: conv, definitionId: w.def, value: 'renewed', key: { source: 'payment_webhook', ref: `p${phone}` } },
    { workspaceId: w.ws, actor: { type: 'system', id: 'payments' } });
  assert.equal(v.status, 'confirmed');
  assert.equal(await reason(conv), 'CONV_GOAL_DONE', 'the payment arrived: goal reached');
  const conv2 = await call(w, 'CONV_GOAL_DONE', 'renewed');
  await registry.execute(pool, 'outcome.label', { conversationId: conv2, definitionId: w.def, value: 'not_now' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(await reason(conv2), 'CONV_INCOMPLETE', "a person's label outranks the guess");
  await pool.query("UPDATE conversation SET reason_code = 'END_OPTED_OUT' WHERE id = $1", [conv2]);
  await registry.execute(pool, 'outcome.label', { conversationId: conv2, definitionId: w.def, value: 'renewed' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(await reason(conv2), 'END_OPTED_OUT', 'an engine-decided reason stays');
});

test('one answer everywhere: the funnel, the goal predicate, the reason code and insight agree; a call outside a campaign counts too', { skip }, async () => {
  const w = await workspace();
  await call(w, 'CONV_GOAL_DONE', 'renewed'); await call(w, 'CONV_GOAL_DONE', 'not_now'); await call(w, 'CONV_NOT_INTERESTED', 'renewed'); await call(w, null, null);
  const f = await campaignFunnel(pool, w.ws, w.campaign);
  const byCode = (await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM conversation WHERE workspace_id = $1 AND reason_code = 'CONV_GOAL_DONE'", [w.ws]))!.n;
  const byGoal = (await one<{ n: number }>(pool, `SELECT count(*)::int AS n FROM conversation cv WHERE cv.workspace_id = $1 AND ${GOAL_SQL('cv')}`, [w.ws]))!.n;
  assert.equal(byGoal, 2);
  assert.equal(f.total.goalReached, byGoal, 'the funnel counts the same calls');
  assert.equal(byCode, byGoal, 'the reason code says the same');
  // Outside any campaign: the outcome's own definition decides (the operator bench's seeded calls are like this).
  const loose = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel, status, reason_code, end_reason) VALUES ($1,'phone','done','CONV_INCOMPLETE','completed') RETURNING id", [w.ws]))!.id;
  await registry.execute(pool, 'outcome.record_verified', { conversationId: loose, definitionId: w.def, value: 'renewed', key: { source: 'crm', ref: `loose${phone}` } },
    { workspaceId: w.ws, actor: { type: 'system', id: 'crm' } });
  assert.equal(await reason(loose), 'CONV_GOAL_DONE');
  const s = await registry.execute<any>(pool, 'call.search', { reasonCode: 'CONV_GOAL_DONE' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(s.status === 'confirmed' && s.result.calls.length, 3, '"how many calls reached the goal" has one answer');
  const goals = await many<{ goal: boolean }>(pool, `SELECT ${GOAL_SQL('cv')} AS goal FROM conversation cv WHERE cv.workspace_id = $1 AND cv.reason_code = 'CONV_GOAL_DONE'`, [w.ws]);
  assert.ok(goals.every(g => g.goal));
});
