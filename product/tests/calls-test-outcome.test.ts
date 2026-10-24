// A browser test call shows whether she got the outcome (the owner's testing is all test calls), and never moves a metric.
// With no campaign, the outcome question is the newest campaign's on this agent, else the workspace's only definition,
// else one read from the agent's own goals. The outcome stays in the call's analysis; no outcome row is written.
// Synthetic, fictional data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { analysesSettled, PURPOSE_VALUES } from '../server/modules/calls/analysis.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import type { RunManifest, RuntimeEvent } from '../shared/runtime-protocol.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; process.env.VP_ANALYSIS_MODELS ??= 'gpt-4.1-mini,gpt-4.1'; pool = createPool(URL_); registry = buildApp(pool, [calls]).registry; });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end(); });

const m: RunManifest = { combinationId: 'r', stackId: 'r', agentVersionHash: 'r', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'r', test: true } as RunManifest;
const YES = 'Haan, renewal kar dijiye, link bhej do.';

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('test outcome') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name, status) VALUES ($1,'Riya','live') RETURNING id", [ws]))!.id;
  const config = { agent: { job: 'renewal_reminder', goals: [{ id: 'renew', description: 'the person agrees to renew the policy', outcome: 'renewal_intent', required: true }] } };
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h',$2) RETURNING id", [agent, JSON.stringify(config)]))!.id;
  return { ws, version, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
}
/** A browser test call on the version, analysed with a fake model that answers `value`; returns the analysis and what the model was asked. */
async function testCall(w: Awaited<ReturnType<typeof world>>, value: string) {
  const asked: string[] = [];
  setFakeLlm((req: LlmRequest) => {
    asked.push(req.messages.map(x => x.content).join('\n'));
    return { text: JSON.stringify({ points: [], moments: [], reasonCode: null, forget: null, outcome: { value, quote: YES, confidence: 0.9 } }),
      toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: req.model ?? 'fake', provider: 'fake' };
  });
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, agent_version_id, channel, run_manifest) VALUES ($1,$2,'test',$3) RETURNING id", [w.ws, w.version, JSON.stringify(m)]))!.id;
  const at = new Date().toISOString();
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'call.ended', at, endReason: 'completed', durationS: 40, manifest: m,
      transcript: [{ speaker: 'agent', text: 'Namaste, main Riya, ek AI assistant. Aapki policy ki renewal ke baare mein call kiya.', startMs: 0 }, { speaker: 'caller', text: YES, startMs: 5000 }] }] as RuntimeEvent[] });
  await analysesSettled();
  const row = (await one<{ analysis: any }>(pool, 'SELECT analysis FROM conversation WHERE id = $1', [conv]))!;
  return { conv, analysis: row.analysis, asked: asked.join('\n') };
}
const outcomeRows = (ws: string) => one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM outcome WHERE workspace_id = $1', [ws]).then(r => r!.n);

test('no definition anywhere: the question comes from the agent\'s own goals; the outcome shows on the call and is never recorded', { skip }, async () => {
  const w = await world();
  const c = await testCall(w, 'goal_reached');
  assert.match(c.asked, /Did the call reach its goal \(the person agrees to renew the policy\)\?/);
  assert.equal(c.analysis.outcomeGuess?.value, 'goal_reached');
  assert.equal(c.analysis.outcomeGuess?.quote, YES);
  assert.deepEqual(c.analysis.testOutcomeFrom, { from: 'agent', name: 'Goal of the call' });
  assert.ok(PURPOSE_VALUES.includes('goal_reached'));
  // Never a metric: no outcome row, not in call search, not in the single-pass escalation count.
  assert.equal(await outcomeRows(w.ws), 0);
  const s = await registry.execute<any>(pool, 'call.search', {}, { workspaceId: w.ws, actor: w.actor });
  assert.equal(s.status === 'confirmed' ? s.result.total : s.status, 0, 'call search leaves test calls out');
  const st = await registry.execute<any>(pool, 'analysis.settings.get', {}, { workspaceId: w.ws, actor: w.actor });
  assert.equal(st.status === 'confirmed' && st.result.wouldEscalate.ofSinglePassCalls, 0, 'test calls are not counted');
  const g = await registry.execute<any>(pool, 'call.get', { conversationId: c.conv }, { workspaceId: w.ws, actor: w.actor });
  assert.deepEqual(g.status === 'confirmed' && [g.result.test, g.result.outcomes.length, g.result.analysis.outcomeGuess.value], [true, 0, 'goal_reached']);
});

test('the workspace\'s only definition is used next; the newest campaign on this agent wins over it', { skip }, async () => {
  const w = await world();
  const def = (await one<{ id: string }>(pool, "INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'Renewal','Will they renew?','{will_renew,later,no}','{will_renew}') RETURNING id", [w.ws]))!.id;
  const a = await testCall(w, 'will_renew');
  assert.match(a.asked, /Will they renew\?/);
  assert.deepEqual([a.analysis.outcomeGuess?.value, a.analysis.testOutcomeFrom], ['will_renew', { from: 'workspace', name: 'Renewal' }]);
  const other = (await one<{ id: string }>(pool, "INSERT INTO outcome_definition (workspace_id, name, question, allowed_values) VALUES ($1,'Payment','Did they promise to pay?','{promised,refused}') RETURNING id", [w.ws]))!.id;
  await pool.query("INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id, agent_version_id) VALUES ($1,'Dues','service',$2,$3)", [w.ws, other, w.version]);
  const b = await testCall(w, 'promised');
  assert.match(b.asked, /Did they promise to pay\?/);
  assert.deepEqual([b.analysis.outcomeGuess?.value, b.analysis.testOutcomeFrom], ['promised', { from: 'campaign', name: 'Payment' }]);
  assert.equal(await outcomeRows(w.ws), 0, 'still nothing recorded');
  void def;
});
