// A person who complains and then agrees raised an objection: it is a moment, with the commitment (benches round 4:
// mini's objection recall fell from 51/51 to 43/51 on complain-then-agree calls after b1a80cf's outcome table). The fix is
// in the contract; whether a model obeys it is measured by the bench on DEV (--prompt-variant runs the ablation), not here.
// Here: the contract says it, the old contracts are reproducible for the ablation, and a reply that lists both is stored
// as both. Synthetic data only, a fake LLM.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled, analysisPrompt } from '../server/modules/calls/analysis.ts';
import { runBench } from '../scripts/analysis-bench.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
before(() => { if (!skip) pool = createPool(process.env.DATABASE_URL); });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end(); });

const Q = { question: 'What did the person decide?', values: ['agreed', 'callback', 'not_interested', 'needs_human', 'wrong_person'] };
const COMPLAINT = 'Pichhli baar aap logon ne bahut der kar di thi.';
const AGREED = 'Haan, kal 10 baje aa jaungi.';

test('the contract: every complaining line is an objection, even when the person agrees later; moments whatever the outcome', () => {
  const p = analysisPrompt(Q);
  assert.match(p, /- objection: PERSON gives a reason against, complains or raises a concern\. Every complaining PERSON line is an objection, even when the PERSON agrees later: then list both, the objection and the commitment\./);
  assert.match(p, /KIND \(one entry per PERSON line that shows it, whatever the OUTCOME; one line can show two kinds\):/);
  assert.match(p, /OUTCOME shapes: PERSON line -> the VALUE that names it/, 'the outcome table that fixed round 3 stays');
});

test('the ablation arms reproduce the contracts being compared', () => {
  const r4 = analysisPrompt(Q, 'r4-table'), r3 = analysisPrompt(Q, 'r3-stance'), bare = analysisPrompt(Q, 'no-outcome-rules');
  for (const p of [r4, r3, bare]) {
    assert.match(p, /- objection: PERSON gives a reason against, or a complaint\n/, 'the old objection line');
    assert.match(p, /KIND \(one entry per line that shows it\):/);
  }
  assert.match(r4, /OUTCOME shapes:/); assert.doesNotMatch(r4, /takes a stance/);
  assert.match(r3, /decided only when the PERSON takes a stance/); assert.doesNotMatch(r3, /OUTCOME shapes:/);
  assert.doesNotMatch(bare, /OUTCOME shapes:|takes a stance/);
  assert.notEqual(analysisPrompt(Q, 'current'), r4);
});

test('complain then agree: both moments are stored, the objection on the complaint and the commitment on the agreement', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('objection test') RETURNING id"))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'R',$2,$3,'{agreed}') RETURNING id`, [ws, Q.question, Q.values]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'C','service',$2) RETURNING id", [ws, def]))!.id;
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,'+919200000001') RETURNING id", [ws]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel) VALUES ($1,$2,$3,'phone') RETURNING id", [ws, attempt, contact]))!.id;
  let system = '';
  setFakeLlm((req: LlmRequest) => {
    system = String(req.messages.find(m => m.role === 'system')?.content ?? '');
    return { text: JSON.stringify({ points: [], reasonCode: 'CONV_GOAL_DONE', forget: null, outcome: { value: 'agreed', quote: AGREED, confidence: 0.9 },
      moments: [{ kind: 'objection', quote: COMPLAINT, note: 'late last time' }, { kind: 'commitment', quote: AGREED, note: '' }] }),
      toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'f', provider: 'f' };
  });
  const lines = [{ speaker: 'agent' as const, text: 'Namaste, main Sehat Clinic se AI assistant bol rahi hoon.', startMs: 0 },
    { speaker: 'caller' as const, text: COMPLAINT, startMs: 3000 }, { speaker: 'agent' as const, text: 'Maafi chahti hoon, is baar hum isse priority par rakhenge.', startMs: 6000 },
    { speaker: 'caller' as const, text: AGREED, startMs: 9000 }];
  const m: RunManifest = { combinationId: 'o', stackId: 'o', agentVersionHash: 'o', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'o' };
  const at = new Date().toISOString();
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'call.ended', at, endReason: 'completed', durationS: 30, transcript: lines, manifest: m }] as RuntimeEvent[] });
  await analysesSettled();
  assert.match(system, /Every complaining PERSON line is an objection, even when the PERSON agrees later/, 'the model analysing calls is given the rule');
  const moments = await many<{ kind: string; quote: string }>(pool, "SELECT kind, quote FROM call_moment WHERE conversation_id = $1 AND source = 'analysis' ORDER BY at_ms", [conv]);
  assert.deepEqual(moments, [{ kind: 'objection', quote: COMPLAINT }, { kind: 'commitment', quote: AGREED }]);
  assert.equal((await one<{ value: string }>(pool, 'SELECT value FROM outcome WHERE conversation_id = $1', [conv]))!.value, 'agreed', 'the objection does not change the outcome');
});

test('an ablation runs on DEV only, never TEST', { skip }, async () => {
  await assert.rejects(runBench({ pool, fake: true, split: 'test', promptVariant: 'r4-table', cross: false, limit: 1 }), /DEV only/);
});

test('the round 5 candidate arms: each keeps an objection rule and changes one thing against the kinds-first contract they were drawn from', () => {
  const cur = analysisPrompt(Q, 'r5-kinds-first');
  const short = analysisPrompt(Q, 'r5-short-objection'), first = analysisPrompt(Q, 'r5-outcome-first'), note = analysisPrompt(Q, 'r5-moment-not-outcome');
  assert.match(short, /- objection: PERSON gives a reason against, or a complaint, also when they agree later\n/);
  assert.match(short, /KIND \(one entry per line that shows it\):/);
  assert.match(short, /OUTCOME shapes:/);
  assert.ok(first.indexOf('OUTCOME:') < first.indexOf('KIND ('), 'outcome before moments');
  assert.deepEqual(first.split('\n').sort(), cur.split('\n').sort(), 'the same lines as current, reordered');
  assert.match(note, /- a moment never decides or blocks the OUTCOME: a complaint that asks for a human is an objection AND the needs-human VALUE/);
  assert.equal(note.replace(/\n- a moment never decides or blocks the OUTCOME[^\n]*/, ''), cur, 'current plus that one line');
});

test('since r6 the shipped contract is the outcome-first arm; the kinds-first one stays named for A/B', () => {
  assert.equal(analysisPrompt(Q, 'current'), analysisPrompt(Q, 'r5-outcome-first'));
  assert.notEqual(analysisPrompt(Q, 'current'), analysisPrompt(Q, 'r5-kinds-first'));
  const p = analysisPrompt(Q);
  assert.ok(p.indexOf('OUTCOME: question') < p.indexOf('KIND ('), 'the product sends OUTCOME first');
  assert.match(p, /Every complaining PERSON line is an objection, even when the PERSON agrees later/, 'and keeps the objection rule');
});
