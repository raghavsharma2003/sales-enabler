// Outcomes a buyer can see and shape (must-be brief 7): typed fields filled only from quoted caller words, a sentiment
// scale, the judge and its calibration on outcome.list, and the web's words for calibration. Synthetic data only.
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
import { analysesSettled, analysisPrompt } from '../server/modules/calls/analysis.ts';
import { groundFields, validateFields, type FieldDef } from '../server/modules/calls/fields.ts';
import { calibrationWords } from '../web/src/outcome-text.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end(); });

const FIELDS: FieldDef[] = [{ key: 'emi_amount', label: 'EMI amount', type: 'number' }, { key: 'pay_by', type: 'date' },
  { key: 'reason', type: 'enum', values: ['salary_late', 'dispute', 'other'] }, { key: 'mood', type: 'sentiment' }, { key: 'note', type: 'text' }];
const CALLER = ['Haan, 4,500 rupaye ki EMI 5 November tak bhar dunga.', 'Salary late aayi thi is baar, isliye der hui.'];

test('a field is kept only with the right type and an exact caller quote; anything else is dropped and counted', () => {
  const g = groundFields({
    emi_amount: { value: '4,500', quote: '4,500 rupaye ki EMI' },                 // kept: digits, quoted
    pay_by: { value: '2026-11-05', quote: '5 November tak bhar dunga' },           // kept
    reason: { value: 'salary_late', quote: 'Salary late aayi thi' },               // kept
    mood: { value: 'positive', quote: 'yeh mera paraphrase hai' },                 // dropped: not the caller's words
    note: { value: 'will pay', quote: '' },                                        // dropped: no quote
    surprise: { value: 'x', quote: 'Haan' },                                       // dropped: not a field
  }, FIELDS, CALLER);
  assert.deepEqual(g.values, { emi_amount: { value: 4500, quote: '4,500 rupaye ki EMI', type: 'number' }, pay_by: { value: '2026-11-05', quote: '5 November tak bhar dunga', type: 'date' },
    reason: { value: 'salary_late', quote: 'Salary late aayi thi', type: 'enum' } });
  assert.equal(g.proposed, 6);
  assert.deepEqual(g.dropped.map(d => [d.key, d.reason]), [['mood', 'no exact quote from the caller'], ['note', 'no exact quote from the caller'], ['surprise', 'not a field of this outcome']]);
  const bad = groundFields({ pay_by: { value: '2026-02-30', quote: '5 November' }, reason: { value: 'angry', quote: 'Salary late' }, mood: { value: 'happy', quote: 'Haan' } }, FIELDS, CALLER);
  assert.deepEqual(bad.dropped.map(d => d.reason), ['not a valid date', 'not a valid enum', 'not a valid sentiment']);
  assert.deepEqual(groundFields({ pay_by: null }, FIELDS, CALLER), { values: {}, dropped: [], proposed: 0 }, 'left empty: nothing proposed, nothing dropped');
});

test('fields are validated in code before they are stored', () => {
  assert.throws(() => validateFields([{ key: 'r', type: 'enum' }]), /at least two values/);
  assert.throws(() => validateFields([{ key: 'a', type: 'text' }, { key: 'a', type: 'number' }]), /used twice/);
  assert.throws(() => validateFields([{ key: 'a', type: 'number', values: ['x'] }]), /only a choice field/);
  assert.throws(() => validateFields([{ key: 'a', type: 'sentiment' }, { key: 'b', type: 'sentiment' }]), /one sentiment field/);
});

test('the contract: no fields sends the measured prompt unchanged; fields add their lines inside OUTCOME', () => {
  const q = { question: 'Will they pay?', values: ['agreed', 'not_interested'] };
  assert.equal(analysisPrompt({ ...q, fields: [] }), analysisPrompt(q));
  const p = analysisPrompt({ ...q, fields: FIELDS }).split('\n');
  const at = p.findIndex(l => l.startsWith('FIELDS:'));
  assert.ok(at > p.findIndex(l => l.startsWith('- confidence: 0..1')) && at < p.findIndex(l => l.startsWith('KIND (')), 'with the OUTCOME block');
  assert.ok(p.includes('- mood: one of ["very_negative","negative","neutral","positive","very_positive"], how the PERSON feels'));
  assert.ok(p.includes('- reason: one of ["salary_late","dispute","other"]'));
});

test('a call: kept fields are stored with their quotes, a field without a verifiable quote is dropped and counted', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('fields test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,'EMI','service') RETURNING id", [ws]))!.id;
  const def = await registry.execute<any>(pool, 'outcome.define', { name: 'EMI', question: 'Will they pay?', allowedValues: ['agreed', 'not_interested'], goalValues: ['agreed'], campaignId: campaign, fields: FIELDS }, ctx);
  assert.equal(def.status, 'confirmed', JSON.stringify(def));
  const refused = await registry.execute<any>(pool, 'outcome.define', { name: 'x', question: 'Will they?', allowedValues: ['a', 'b'], goalValues: ['a'], fields: [{ key: 'r', type: 'enum' }] }, ctx);
  assert.equal(refused.status, 'not_executed'); assert.match(refused.reason, /at least two values/);
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,'+919100000777') RETURNING id", [ws]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel) VALUES ($1,$2,$3,'phone') RETURNING id", [ws, attempt, contact]))!.id;
  let system = '';
  setFakeLlm((req: LlmRequest) => { system = String(req.messages[0].content);
    return { text: JSON.stringify({ points: [], moments: [], reasonCode: 'CONV_GOAL_DONE', forget: null, outcome: { value: 'agreed', quote: CALLER[0], confidence: 0.9 },
      fields: { emi_amount: { value: 4500, quote: '4,500 rupaye' }, pay_by: { value: '2026-11-05', quote: 'the agent said so' }, mood: { value: 'neutral', quote: 'Haan' } } }),
      toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'f', provider: 'f' }; });
  const m: RunManifest = { combinationId: 'f', stackId: 'f', agentVersionHash: 'f', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'f' };
  const lines = [{ speaker: 'agent' as const, text: 'Namaste, aapki EMI ke baare mein call kiya hai.', startMs: 0 }, ...CALLER.map((t, i) => ({ speaker: 'caller' as const, text: t, startMs: 3000 * (i + 1) }))];
  const at = new Date().toISOString();
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m }, { seq: 2, type: 'call.ended', at, endReason: 'completed', durationS: 30, transcript: lines, manifest: m }] as RuntimeEvent[] });
  await analysesSettled();
  assert.match(system, /^FIELDS: add "fields"/m, 'the model was asked for the fields');
  const row = await one<any>(pool, 'SELECT analysis, flags FROM conversation WHERE id = $1', [conv]);
  assert.deepEqual(row.analysis.fields, { emi_amount: { value: 4500, quote: '4,500 rupaye', type: 'number' }, mood: { value: 'neutral', quote: 'Haan', type: 'sentiment' } });
  assert.equal(row.analysis.fieldsProposed, 3);
  assert.deepEqual(row.analysis.fieldsDropped, [{ key: 'pay_by', reason: 'no exact quote from the caller' }]);
  assert.ok(row.flags.includes('quotes_dropped'), 'a dropped field flags the call like a dropped quote');

  // outcome.list: the definition, its fields, how it is judged, and calibration ("uncalibrated" until it passes).
  const l = await registry.execute<any>(pool, 'outcome.list', {}, ctx);
  if (l.status !== 'confirmed') return assert.fail(JSON.stringify(l));
  const d = l.result.definitions.find((x: any) => x.id === def.result.outcomeDefinitionId);
  assert.deepEqual(d.goalValues, ['agreed']); assert.equal(d.fields.length, 5); assert.deepEqual(d.campaigns.map((c: any) => c.name), ['EMI']);
  assert.equal(d.judge, null); assert.match(d.judgedBy, /reads every call/);
  assert.equal(d.calibration.status, 'uncalibrated');
  const j = await registry.execute<any>(pool, 'judge.edit', { outcomeDefinitionId: d.id, name: 'EMI judge', model: 'gpt-4.1-mini', instructions: 'A payment link sent counts as agreed.' }, ctx);
  assert.equal(j.status, 'confirmed', JSON.stringify(j));
  const audited = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM audit_event WHERE workspace_id = $1 AND action IN ('outcome.define','judge.edit')", [ws]);
  assert.ok(audited!.n >= 2, 'edits are audited');
  const after = (await registry.execute<any>(pool, 'outcome.list', {}, ctx)) as any;
  const d2 = after.result.definitions.find((x: any) => x.id === d.id);
  assert.deepEqual([d2.judge.model, d2.judge.instructions, d2.judge.number, d2.calibration.status], ['gpt-4.1-mini', 'A payment link sent counts as agreed.', 1, 'uncalibrated']);
  await pool.query("INSERT INTO calibration (judge_version_id, workspace_id, n, agreement, wilson_lower, status) VALUES ($1,$2,60,0.95,0.86,'trusted')", [j.result.judgeVersionId, ws]);
  const d3 = ((await registry.execute<any>(pool, 'outcome.list', {}, ctx)) as any).result.definitions.find((x: any) => x.id === d.id);
  assert.deepEqual([d3.calibration.status, d3.calibration.n], ['trusted', 60]);
  // Editing the outcome without fields keeps them; [] removes them.
  await registry.execute(pool, 'outcome.define', { id: d.id, name: 'EMI', question: 'Will they pay?', allowedValues: ['agreed', 'not_interested'], goalValues: ['agreed'] }, ctx);
  assert.equal((await one<{ n: number }>(pool, 'SELECT jsonb_array_length(fields) AS n FROM outcome_definition WHERE id = $1', [d.id]))!.n, 5);
  await registry.execute(pool, 'outcome.define', { id: d.id, name: 'EMI', question: 'Will they pay?', allowedValues: ['agreed', 'not_interested'], goalValues: ['agreed'], fields: [] }, ctx);
  assert.equal((await one<{ n: number }>(pool, 'SELECT jsonb_array_length(fields) AS n FROM outcome_definition WHERE id = $1', [d.id]))!.n, 0);
  void many;
});

test('the web says "Uncalibrated" until calibration passes', () => {
  const t = { minLabelled: 50, agreement: 0.9, lower: 0.8 };
  for (const k of [{ status: 'uncalibrated' as const, n: 0, agreement: null, lower: null }, { status: 'calibrating' as const, n: 12, agreement: 1, lower: 0.7 },
    { status: 'not_trusted' as const, n: 60, agreement: 0.8, lower: 0.68 }]) assert.match(calibrationWords(k, t).label, /^Uncalibrated/, k.status);
  assert.match(calibrationWords({ status: 'calibrating', n: 12, agreement: 1, lower: 0.7 }, t).detail, /12 of the 50 labelled calls/);
  assert.equal(calibrationWords({ status: 'trusted', n: 60, agreement: 0.95, lower: 0.86 }, t).label, 'Calibrated: trusted');
});
