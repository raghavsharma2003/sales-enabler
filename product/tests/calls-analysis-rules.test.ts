// Round 2 of the analysis bench (research/2026-10-23/benches-r2) found three faults; each has a test here that failed on
// the code before the fix. Synthetic data only, a fake LLM.
//  - rejected.2026-10-23.analysis-outcome-null-only-rule: outcomes forced onto crisis, language-mismatch and early hang-up calls;
//  - rejected.2026-10-23.tiered-escalate-on-no-outcome: tiered escalated calls the engine had already decided;
//  - rejected.2026-10-23.call-search-free-text-outcome: a reason code passed as the outcome found 0 calls, silently.
// And decision.2026-10-23.analysis-default-mini-single: the product default is one pass on gpt-4.1-mini.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import type { EndReason, RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
const saved = { models: process.env.VP_ANALYSIS_MODELS, def: process.env.VP_ANALYSIS_DEFAULT_MODEL };
before(() => { if (skip) return; process.env.VP_ANALYSIS_MODELS = 'gpt-4.1-mini,gpt-4.1'; delete process.env.VP_ANALYSIS_DEFAULT_MODEL;
  pool = createPool(URL_); registry = buildApp(pool, [calls]).registry; });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end();
  for (const [k, v] of [['VP_ANALYSIS_MODELS', saved.models], ['VP_ANALYSIS_DEFAULT_MODEL', saved.def]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

const m: RunManifest = { combinationId: 'r', stackId: 'r', agentVersionHash: 'r', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'r' };
const OPEN = 'Namaste, main Riya bol rahi hoon Kirana Kart se, ek AI assistant. Aapke kal wale order ke baare mein call kiya hai.';

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('rules test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'Result','What did the person decide?','{agreed,callback,not_interested,needs_human,wrong_person}','{agreed}') RETURNING id`, [ws]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'C','service',$2) RETURNING id", [ws, def]))!.id;
  return { ws, campaign, member: { type: 'member', id: owner, role: 'owner' } as Actor };
}
let phone = 9300000000;
async function analysed(w: Awaited<ReturnType<typeof workspace>>, caller: string[], endReason: EndReason = 'completed', durationS = 40) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id", [w.ws, `+91${phone++}`]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel) VALUES ($1,$2,$3,'phone') RETURNING id", [w.ws, attempt, contact]))!.id;
  const lines = [{ speaker: 'agent' as const, text: OPEN, startMs: 0 }, ...caller.map((t, i) => ({ speaker: 'caller' as const, text: t, startMs: 3000 * (i + 1) }))];
  const at = new Date().toISOString();
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'call.ended', at, endReason, durationS, transcript: lines, manifest: m }] as RuntimeEvent[] });
  await analysesSettled();
  const row = (await one<any>(pool, 'SELECT reason_code, analysis FROM conversation WHERE id = $1', [conv]))!;
  const outcomes = (await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM outcome WHERE conversation_id = $1', [conv]))!.n;
  return { conv, reason: row.reason_code as string, analysis: row.analysis, outcomes };
}
/** A fake model that always finds an outcome (as gpt-4.1-mini did on these calls in round 2), and records the models asked. */
function guesser(value: string | null, reasonCode: string | null, quote: string, seen: string[] = []) {
  return (req: LlmRequest) => {
    seen.push(req.model ?? 'deployment-default');
    return { text: JSON.stringify({ points: [], moments: [], reasonCode, forget: null, outcome: value ? { value, quote, confidence: 0.9 } : null }),
      toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: req.model ?? 'deployment-default', provider: 'fake' };
  };
}

test('no outcome on calls where the person decided nothing: crisis, a language they could not follow, an early hang-up', { skip }, async () => {
  const w = await workspace();
  const CRISIS = 'Sab khatam ho gaya hai, ab jeene ka mann nahi karta.';
  setFakeLlm(guesser('needs_human', null, CRISIS));
  const c = await analysed(w, [CRISIS], 'crisis_handoff');
  assert.equal(c.reason, 'END_CRISIS');
  assert.equal(c.outcomes, 0, 'distress is not a request for a human: no outcome');
  assert.equal(c.analysis.outcomeGuess, null);
  assert.match(c.analysis.outcomeUnclear.reason, /not recorded: the call turned to a crisis/);

  const TAMIL = 'Enakku Hindi theriyadhu, Tamil-la pesunga please.';
  setFakeLlm(guesser('wrong_person', 'CONV_LANGUAGE_MISMATCH', TAMIL));
  const l = await analysed(w, [TAMIL, 'Puriyala, sorry.']);
  assert.equal(l.reason, 'CONV_LANGUAGE_MISMATCH');
  assert.equal(l.outcomes, 0, 'they could not follow the language: no outcome');

  setFakeLlm(guesser('not_interested', null, 'Kaun?'));
  const e = await analysed(w, ['Kaun?'], 'caller_hung_up', 5);
  assert.equal(e.reason, 'END_EARLY_HANGUP');
  assert.equal(e.outcomes, 0, 'hung up in the first seconds: no outcome');

  // Control: a call on which the person did decide keeps its outcome, opt-out included.
  setFakeLlm(guesser('agreed', 'CONV_GOAL_DONE', 'Haan, order confirm kar do.'));
  assert.equal((await analysed(w, ['Haan, order confirm kar do.'])).outcomes, 1);
  setFakeLlm(guesser('not_interested', null, 'Mujhe dobara call mat karna'));
  assert.equal((await analysed(w, ['Mujhe dobara call mat karna, mera number list se hata do.'], 'opt_out')).outcomes, 1, 'an opt-out still decides it');
});

test('tiered never escalates a call whose reason the engine decided; it still escalates an open one', { skip }, async () => {
  const w = await workspace();
  const set = await registry.execute(pool, 'analysis.model.set', { mode: 'tiered', model: 'gpt-4.1-mini', escalateModel: 'gpt-4.1' }, { workspaceId: w.ws, actor: w.member });
  if (set.status !== 'needs_approval') return assert.fail('expected a proposal');
  assert.equal((await registry.approve(pool, set.actionId, { workspaceId: w.ws, memberId: w.member.id! })).status, 'confirmed');
  for (const [lines, end, dur] of [[['Sab khatam ho gaya hai, ab jeene ka mann nahi karta.'], 'crisis_handoff', 40], [['Kaun?'], 'caller_hung_up', 5],
    [['Mujhe dobara call mat karna, mera number list se hata do.'], 'opt_out', 40]] as const) {
    const seen: string[] = [];
    setFakeLlm(guesser(null, null, '', seen));
    const c = await analysed(w, [...lines], end, dur);
    assert.deepEqual(seen, ['gpt-4.1-mini'], `${c.reason}: one pass only`);
    assert.equal(c.analysis.tier?.escalated, false, JSON.stringify(c.analysis));
  }
  const lang: string[] = [];
  setFakeLlm(guesser(null, 'CONV_LANGUAGE_MISMATCH', '', lang));
  const l = await analysed(w, ['Enakku Hindi theriyadhu, Tamil-la pesunga please.']);
  assert.deepEqual(lang, ['gpt-4.1-mini'], 'the first pass names a no-decision reason: a second outcome would be discarded, so no second pass');
  assert.match(l.analysis.tier.why, /no outcome is recorded/);
  const seen: string[] = [];
  setFakeLlm(guesser(null, null, '', seen));
  await analysed(w, ['Main abhi soch raha hoon, dekhte hain.']);
  assert.deepEqual(seen, ['gpt-4.1-mini', 'gpt-4.1'], 'an open call with no outcome is still read again');
});

test('the product default is one pass on gpt-4.1-mini when the deployment curates it', { skip }, async () => {
  const w = await workspace();
  const s = await registry.execute<any>(pool, 'analysis.settings.get', {}, { workspaceId: w.ws, actor: w.member });
  assert.equal(s.status === 'confirmed' && s.result.mode, 'single');
  assert.equal(s.status === 'confirmed' && s.result.model, 'gpt-4.1-mini');
  const seen: string[] = [];
  setFakeLlm(guesser(null, null, '', seen));
  await analysed(w, ['Main abhi soch raha hoon, dekhte hain.']);
  assert.deepEqual(seen, ['gpt-4.1-mini']);
  process.env.VP_ANALYSIS_MODELS = 'other-model';
  try {
    const s2 = await registry.execute<any>(pool, 'analysis.settings.get', {}, { workspaceId: w.ws, actor: w.member });
    assert.equal(s2.status === 'confirmed' && s2.result.model, undefined, 'not curated here: the deployment\'s own analysis model');
  } finally { process.env.VP_ANALYSIS_MODELS = 'gpt-4.1-mini,gpt-4.1'; }
});

test('call.search: an outcome is one of the defined values (a reason code is refused with the right filter named); the total is given', { skip }, async () => {
  const w = await workspace();
  setFakeLlm(guesser('agreed', 'CONV_GOAL_DONE', 'Haan, order confirm kar do.'));
  for (let i = 0; i < 3; i++) await analysed(w, ['Haan, order confirm kar do.']);
  const ctx = { workspaceId: w.ws, actor: w.member };
  const bad = await registry.execute<any>(pool, 'call.search', { outcome: 'CONV_GOAL_DONE' }, ctx);
  assert.equal(bad.status, 'not_executed', 'never a silent 0 rows');
  assert.match(bad.reason, /is a reason code: pass it as reasonCode/);
  assert.match(bad.reason, /agreed, callback, needs_human, not_interested, wrong_person/);
  const typo = await registry.execute<any>(pool, 'call.search', { outcome: 'agree' }, ctx);
  assert.equal(typo.status, 'not_executed'); assert.doesNotMatch(typo.reason, /reason code/);
  const ok = await registry.execute<any>(pool, 'call.search', { outcome: 'agreed', limit: 1 }, ctx);
  assert.equal(ok.status, 'confirmed');
  assert.equal(ok.result.calls.length, 1); assert.equal(ok.result.total, 3, 'the total counts every match, not the page');
  const byCode = await registry.execute<any>(pool, 'call.search', { reasonCode: 'CONV_GOAL_DONE', campaignId: w.campaign }, ctx);
  assert.equal(byCode.status === 'confirmed' && byCode.result.total, 3);
  assert.equal((await registry.execute<any>(pool, 'call.search', { reasonCode: 'agreed' }, ctx)).status, 'not_executed', 'and the other way round');
});
