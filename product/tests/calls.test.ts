// Calls module tests against a real Postgres (skipped when DATABASE_URL is unset). Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type pg from 'pg';
import { buildApp, type Module } from '../server/app.ts';
import { createPool, many, one, tx } from '../server/db.ts';
import { reserve } from '../server/ledger.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { FakeRuntime, setRuntime, sign } from '../server/runtime-client.ts';
import { tool, type Actor, type Registry } from '../server/tools.ts';
import { obj, opt, str, uuid } from '../shared/validate.ts';
import type { RunManifest, RuntimeEvent } from '../shared/runtime-protocol.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { analysesSettled, findQuote, refreshOutcome, sweep } from '../server/modules/calls/analysis.ts';
import { wilsonLower, calibrationStatus } from '../server/modules/calls/stats.ts';
import { REASON_CODES } from '../server/modules/calls/taxonomy.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
const SECRET = 'test-secret-'.padEnd(40, 'x');
let pool: pg.Pool, server: Server, registry: Registry, base: string;
const fakeRuntime = new FakeRuntime();

// A stand-in for the contacts module's A3 verb, registered only in the second app below.
const suppressed: string[] = [], extracted: string[] = [], checked: string[] = [];
const retried: { attemptId: string; outcome: string }[] = [];
const experiments = new Map<string, { id: string; state: string }[]>();
const contactsStub: Module = { name: 'siblings-stub', register: r => {
  r.register(tool(obj({ contactId: uuid(), conversationId: uuid() }), { name: 'contact.suppress_after_opt_out', risk: 'policy', summary: 'suppress after an opt-out',
    run: async (_ctx, i) => { suppressed.push(i.contactId); return { ok: true }; } }));
  r.register(tool(obj({ conversationId: uuid() }), { name: 'memory.extract', risk: 'draft', summary: 'stub', run: async (_ctx, i) => { extracted.push(i.conversationId); return {}; } }));
  r.register(tool(obj({ agentId: opt(uuid()) }), { name: 'experiment.list', risk: 'read', summary: 'stub', run: async (_ctx, i) => experiments.get(i.agentId ?? '') ?? [] }));
  r.register(tool(obj({ attemptId: uuid(), outcome: str(), at: opt(str()) }), { name: 'attempt.retry_per_ladder', risk: 'external', summary: 'stub',
    run: async (_ctx, i) => { retried.push({ attemptId: i.attemptId, outcome: i.outcome }); return {}; } }));
  r.register(tool(obj({ experimentId: uuid() }), { name: 'experiment.check', risk: 'draft', summary: 'stub', run: async (_ctx, i) => { checked.push(i.experimentId); return {}; } }));
} };
let server2: Server, base2: string;

before(async () => {
  if (skip) return;
  process.env.VP_RUNTIME_SECRET = SECRET;
  delete process.env.VP_LLM_FAKE;
  pool = createPool(URL_);
  setRuntime(fakeRuntime);
  const app = buildApp(pool, [calls]);
  registry = app.registry; server = app.server;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const app2 = buildApp(pool, [calls, contactsStub]);
  server2 = app2.server;
  await new Promise<void>(r => server2.listen(0, '127.0.0.1', r));
  base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
});
after(async () => {
  setFakeLlm(null); setRuntime(null);
  await analysesSettled();
  await new Promise(r => server?.close(r)); await new Promise(r => server2?.close(r));
  await pool?.end();
});

// ---- fixtures ------------------------------------------------------------------------------------------------
const manifest = (over: Partial<RunManifest> = {}): RunManifest => ({ combinationId: 'v2|ears+brain+voice', stackId: 'v2-flashlite', agentVersionHash: 'h1',
  components: { stt: 'ears-x', llm: 'brain-x', tts: 'voice-x' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 't', ...over });
const now = () => new Date().toISOString();

async function workspace(balance = 1_000_000) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('calls test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  await pool.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1,$2,'ok')", [ws, balance]);
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,$2,$3) RETURNING id',
    [agent, 'h1', { agent: { schema: 1, agentId: agent, version: 1, versionHash: 'h1', voice: { stackId: 'v2-flashlite' }, limits: { maxDurationS: 240, maxSilenceS: 8, maxTurns: 40 } },
      brief: { text: 'You are Asha from Example Co.', hash: 'b1', bytes: 30 } }]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,'Renewals','service') RETURNING id", [ws]))!.id;
  const member: Actor = { type: 'member', id: owner, role: 'owner' };
  return { ws, owner, agent, version, campaign, member };
}

let phone = 9000000000;
async function call(w: Awaited<ReturnType<typeof workspace>>, opts: { reserveInrMilli?: number; channel?: string } = {}) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Test Person') RETURNING id", [w.ws, `+91${phone++}`]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [w.ws, attempt, contact, w.version, opts.channel ?? 'phone']))!.id;
  let reservationId: string | null = null;
  if (opts.reserveInrMilli) {
    const r = await tx(pool, c => reserve(c, { workspaceId: w.ws, inrMilli: opts.reserveInrMilli!, attemptId: attempt, campaignId: w.campaign }));
    assert.ok(r.ok);
    reservationId = r.ok ? r.reservationId : null;
  }
  return { contact, attempt, conv, reservationId };
}

async function post(conversationId: string, events: RuntimeEvent[], o: { secret?: string; t?: number; tamper?: boolean; respace?: boolean; header?: string | null; to?: string } = {}) {
  const body = JSON.stringify({ protocol: 1, conversationId, events });
  const sent = o.tamper ? body.replace('"seq":1', '"seq":7') : o.respace ? body.replace('"seq":', '"seq": ') : body;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.header !== null) headers['x-vp-signature'] = o.header ?? sign(o.secret ?? SECRET, body, o.t);
  const r = await fetch((o.to ?? base) + '/hooks/runtime', { method: 'POST', headers, body: sent });
  return { status: r.status, body: await r.json() as any };
}

const lines = [
  { speaker: 'agent' as const, text: 'Namaste, main Asha bol rahi hoon, Example Co. ki AI assistant.', startMs: 0 },
  { speaker: 'caller' as const, text: 'Haan boliye, kya baat hai?', startMs: 4000 },
  { speaker: 'agent' as const, text: 'Aapki policy agle hafte renew honi hai.', startMs: 7000 },
  { speaker: 'caller' as const, text: 'Theek hai, main kal payment kar dunga.', startMs: 12000 },
];
const fullCall = (o: { endReason?: string; durationS?: number; costs?: number[]; startSeq?: number } = {}): RuntimeEvent[] => {
  let s = o.startSeq ?? 1;
  const ev: RuntimeEvent[] = [{ seq: s++, type: 'call.started', at: now(), manifest: manifest() }];
  for (const l of lines) ev.push({ seq: s++, type: 'turn', at: now(), speaker: l.speaker, text: l.text, startMs: l.startMs, endMs: l.startMs + 2500 });
  for (const c of o.costs ?? [3000, 4500]) ev.push({ seq: s++, type: 'cost', at: now(), component: 'telephony', provider: 'carrier-x', quantity: 30, unit: 'second', inrMilli: c });
  ev.push({ seq: s++, type: 'call.ended', at: now(), endReason: (o.endReason ?? 'completed') as any, durationS: o.durationS ?? 30, recordingUri: 'rec://synthetic/1', transcript: lines, manifest: manifest() });
  return ev;
};

const llmReply = (json: unknown) => (_req: LlmRequest) => ({ text: JSON.stringify(json), toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'fake-analyst', provider: 'fake' });

// ---- pure ------------------------------------------------------------------------------------------------------
test('the reason catalogue has 35 distinct codes; Wilson lower bound matches the trust bar', () => {
  assert.equal(REASON_CODES.length, 35);
  assert.equal(new Set(REASON_CODES.map(r => r.code)).size, 35);
  assert.ok(Math.abs(wilsonLower(46, 50) - 0.8124) < 0.002, String(wilsonLower(46, 50)));
  assert.equal(wilsonLower(0, 0), 0);
  assert.equal(calibrationStatus(46, 0.92, wilsonLower(46, 50)), 'calibrating');
  assert.equal(calibrationStatus(50, 46 / 50, wilsonLower(46, 50)), 'trusted');
  assert.equal(calibrationStatus(50, 0.8, wilsonLower(40, 50)), 'not_trusted');
  assert.ok(findQuote(lines, 'kal payment kar dunga'));
  assert.equal(findQuote(lines, 'main payment kal kar dunga'), null, 'a paraphrase is not a quote');
  assert.equal(findQuote(lines, 'kya baat hai? Aapki policy'), null, 'no stitching across lines');
});

// ---- signature -------------------------------------------------------------------------------------------------
test('the hook rejects a missing, wrong, stale or tampered signature and an unknown conversation', { skip }, async () => {
  const w = await workspace();
  const c = await call(w);
  const ev: RuntimeEvent[] = [{ seq: 1, type: 'call.started', at: now(), manifest: manifest() }];
  assert.equal((await post(c.conv, ev, { header: null })).status, 401);
  assert.equal((await post(c.conv, ev, { secret: 'another-secret'.padEnd(40, 'y') })).status, 401);
  assert.equal((await post(c.conv, ev, { t: Date.now() - 6 * 60_000 })).status, 401, 'a replay outside the 5-minute window is refused');
  assert.equal((await post(c.conv, ev, { tamper: true })).status, 401, 'the body must be the one that was signed');
  assert.equal((await post(c.conv, ev, { respace: true })).status, 401, 'the HMAC covers the exact bytes, whitespace included');
  assert.equal((await post('00000000-0000-4000-8000-00000000abcd', ev)).status, 404);
  const seen = await one<{ n: string }>(pool, 'SELECT count(*)::text AS n FROM runtime_event_seen WHERE conversation_id = $1', [c.conv]);
  assert.equal(seen!.n, '0', 'nothing was applied');
  const bad = await post(c.conv, [{ ...ev[0], workspaceId: 'x' } as any]);
  assert.equal(bad.status, 422, 'unknown fields are refused, not ignored');
});

// ---- idempotency, ordering, money --------------------------------------------------------------------------------
test('a replayed batch changes nothing; cost before call.ended settles at the real cost', { skip }, async () => {
  setFakeLlm(llmReply({ points: [], moments: [], reasonCode: null, outcome: null }));
  const w = await workspace(1_000_000);
  const c = await call(w, { reserveInrMilli: 100_000 });
  const ev = fullCall({ costs: [3000, 4500] });
  const costs = ev.filter(e => e.type === 'cost'), rest = ev.filter(e => e.type !== 'cost' && e.type !== 'call.ended'), end = ev.filter(e => e.type === 'call.ended');

  const r1 = await post(c.conv, [...costs].reverse());              // cost lines first, out of order
  assert.equal(r1.status, 200); assert.equal(r1.body.accepted, 2);
  const r2 = await post(c.conv, rest);
  assert.equal(r2.body.accepted, rest.length);
  const again = await post(c.conv, [...rest, ...costs]);             // a full retry
  assert.deepEqual(again.body, { accepted: 0, duplicates: rest.length + costs.length });
  const mid = await one<{ status: string }>(pool, 'SELECT status FROM reservation WHERE id = $1', [c.reservationId]);
  assert.equal(mid!.status, 'held', 'nothing settles before call.ended');

  assert.equal((await post(c.conv, end)).body.accepted, 1);
  assert.equal((await post(c.conv, end)).body.duplicates, 1);
  await analysesSettled();

  const conv = await one<any>(pool, 'SELECT status, end_reason, reason_code, cost_inr_milli::int AS cost, settlement, recording_uri, jsonb_array_length(transcript) AS n FROM conversation WHERE id = $1', [c.conv]);
  assert.equal(conv.cost, 7500); assert.equal(conv.settlement.action, 'settled'); assert.equal(conv.recording_uri, 'rec://synthetic/1'); assert.equal(conv.n, 4);
  const res = await one<any>(pool, 'SELECT status, settled_inr_milli::int AS s FROM reservation WHERE id = $1', [c.reservationId]);
  assert.deepEqual(res, { status: 'settled', s: 7500 });
  const wallet = await one<any>(pool, 'SELECT balance_inr_milli::int AS b FROM wallet WHERE workspace_id = $1', [w.ws]);
  assert.equal(wallet.b, 1_000_000 - 7500, 'the wallet is debited the real cost, not the hold');
  const lines_ = await one<any>(pool, "SELECT count(*)::int AS n FROM cost_line WHERE conversation_id = $1 AND component = 'telephony'", [c.conv]);
  assert.equal(lines_.n, 2, 'replays wrote no duplicate cost lines');
  const turns = await one<any>(pool, 'SELECT count(*)::int AS n FROM turn WHERE conversation_id = $1', [c.conv]);
  assert.equal(turns.n, 4);
  const usage = await one<any>(pool, 'SELECT connected_seconds::int AS s, cost_inr_milli::int AS c FROM usage_period WHERE workspace_id = $1', [w.ws]);
  assert.deepEqual(usage, { s: 30, c: 7500 });
  const at = await one<any>(pool, 'SELECT status FROM attempt WHERE id = $1', [c.attempt]);
  assert.equal(at.status, 'connected');
});

test('a call nobody answered with no spend releases its hold', { skip }, async () => {
  const w = await workspace(500_000);
  const c = await call(w, { reserveInrMilli: 100_000 });
  await post(c.conv, [{ seq: 1, type: 'call.ended', at: now(), endReason: 'no_answer', durationS: 0, transcript: [], manifest: manifest() }]);
  await analysesSettled();
  assert.equal((await one<any>(pool, 'SELECT status FROM reservation WHERE id = $1', [c.reservationId])).status, 'released');
  assert.equal((await one<any>(pool, 'SELECT balance_inr_milli::int AS b FROM wallet WHERE workspace_id = $1', [w.ws])).b, 500_000);
  const conv = await one<any>(pool, 'SELECT reason_code, settlement FROM conversation WHERE id = $1', [c.conv]);
  assert.equal(conv.reason_code, 'DIAL_NO_ANSWER'); assert.equal(conv.settlement.action, 'released');
  assert.equal((await one<any>(pool, 'SELECT status FROM attempt WHERE id = $1', [c.attempt])).status, 'no_answer');
});

// ---- analysis: quotes ----------------------------------------------------------------------------------------------
test('quotes not in the transcript are dropped and counted; the outcome is an AI guess', { skip }, async () => {
  const w = await workspace();
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'Renewal','Did they agree to pay?','{will_pay,not_interested}','{will_pay}') RETURNING id`, [w.ws]))!.id;
  await pool.query('UPDATE campaign SET outcome_definition_id = $2 WHERE id = $1', [w.campaign, def]);
  let seen: LlmRequest | null = null;
  setFakeLlm(req => { seen = req; return llmReply({
    points: [{ claim: 'They agreed to pay tomorrow.', quote: 'main kal payment kar dunga' }, { claim: 'They praised the agent.', quote: 'aap bahut acchi hain' }],
    moments: [{ kind: 'commitment', quote: 'kal payment kar dunga', note: 'payment tomorrow' }, { kind: 'objection', quote: 'bahut mehenga hai', note: 'price' }],
    reasonCode: 'CONV_GOAL_DONE', outcome: { value: 'will_pay', quote: 'Theek hai, main kal payment' } })(req); });
  const c = await call(w);
  await post(c.conv, fullCall());
  await analysesSettled();
  assert.equal(seen!.purpose, 'analysis'); assert.equal(seen!.json, true);

  const conv = await one<any>(pool, 'SELECT analysis, reason_code, outcome, flags FROM conversation WHERE id = $1', [c.conv]);
  assert.equal(conv.analysis.status, 'done');
  assert.equal(conv.analysis.quotesProposed, 5);
  assert.equal(conv.analysis.quotesDropped, 2);
  assert.deepEqual(conv.analysis.points.map((p: any) => p.quote), ['main kal payment kar dunga']);
  assert.equal(conv.analysis.summary, 'They agreed to pay tomorrow.');
  assert.equal(conv.reason_code, 'CONV_GOAL_DONE');
  assert.ok(conv.flags.includes('quotes_dropped'));
  const moments = await many<any>(pool, "SELECT kind, quote, at_ms FROM call_moment WHERE conversation_id = $1 AND source = 'analysis'", [c.conv]);
  assert.deepEqual(moments, [{ kind: 'commitment', quote: 'kal payment kar dunga', at_ms: 12000 }]);
  for (const m of moments) assert.ok(lines.some(l => l.text.includes(m.quote)));
  const out = await many<any>(pool, 'SELECT value, grade, evidence FROM outcome WHERE conversation_id = $1', [c.conv]);
  assert.deepEqual(out, [{ value: 'will_pay', grade: 'ai_guess', evidence: { quote: 'Theek hai, main kal payment' } }]);
  assert.equal((await one<any>(pool, 'SELECT outcome FROM conversation WHERE id = $1', [c.conv])).outcome, null, 'an uncalibrated guess never becomes the outcome that counts');
  assert.equal(conv.analysis.safety_violation, false);
  assert.deepEqual(conv.analysis.judge, { judgeVersionId: null, value: 'will_pay', quote: 'Theek hai, main kal payment', calibration: 'uncalibrated' });
  const ac = await one<any>(pool, "SELECT quantity::int AS q FROM cost_line WHERE conversation_id = $1 AND component = 'analysis'", [c.conv]);
  assert.equal(ac.q, 120, 'the analysis tokens are a cost line');

  // An outcome whose quote is invented is not recorded at all, and a model cannot override an engine-known reason.
  setFakeLlm(llmReply({ points: [], moments: [], reasonCode: 'CONV_GOAL_DONE', outcome: { value: 'will_pay', quote: 'haan main pakka dunga' } }));
  const c2 = await call(w);
  await post(c2.conv, fullCall({ endReason: 'caller_hung_up', durationS: 6 }));
  await analysesSettled();
  assert.equal((await one<any>(pool, 'SELECT count(*)::int AS n FROM outcome WHERE conversation_id = $1', [c2.conv])).n, 0);
  assert.equal((await one<any>(pool, 'SELECT reason_code FROM conversation WHERE id = $1', [c2.conv])).reason_code, 'END_EARLY_HANGUP');

  const ex = await registry.execute<any>(pool, 'call.explain', { conversationId: c.conv }, { workspaceId: w.ws, actor: w.member });
  assert.equal(ex.status, 'confirmed');
  if (ex.status !== 'confirmed') return;
  assert.equal(ex.result.reason.code, 'CONV_GOAL_DONE');
  assert.equal(ex.result.outcome.grade, 'ai_guess');
  for (const b of ex.result.because) {
    assert.ok(b.evidence.event || b.evidence.quote, `every point has evidence: ${b.point}`);
    if (b.evidence.quote) assert.ok(lines.some(l => l.text.includes(b.evidence.quote)), `quote is a transcript substring: ${b.evidence.quote}`);
  }
});

test('analysis degrades without a model: not_configured, never a crash', { skip }, async () => {
  setFakeLlm(null);
  const w = await workspace();
  const c = await call(w);
  await post(c.conv, fullCall());
  await analysesSettled();
  const conv = await one<any>(pool, 'SELECT analysis, reason_code FROM conversation WHERE id = $1', [c.conv]);
  assert.equal(conv.analysis.status, 'not_configured');
  assert.equal(conv.reason_code, 'CONV_INCOMPLETE');
});

// ---- test calls ----------------------------------------------------------------------------------------------------
test('test.browser_call dispatches a test ticket; test calls stay out of outcomes, search, funnels and monitors', { skip }, async () => {
  const w = await workspace();
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'R','Pay?','{will_pay,no}','{will_pay}') RETURNING id`, [w.ws]))!.id;
  await pool.query('UPDATE campaign SET outcome_definition_id = $2 WHERE id = $1', [w.campaign, def]);
  const r = await registry.execute<any>(pool, 'test.browser_call', { agentId: w.agent }, { workspaceId: w.ws, actor: w.member });
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  if (r.status !== 'confirmed') return;
  assert.ok(r.result.join?.url);
  const ticket = fakeRuntime.tickets.find(t => t.conversationId === r.result.conversationId)!;
  assert.equal(ticket.test, true); assert.equal(ticket.attemptId, null); assert.equal(ticket.transport.kind, 'webrtc');
  assert.equal(ticket.brief.hash, 'b1'); assert.equal(ticket.stack.id, 'v2-flashlite');

  setFakeLlm(llmReply({ points: [{ claim: 'Will pay.', quote: 'kal payment kar dunga' }], moments: [], reasonCode: 'CONV_GOAL_DONE', outcome: { value: 'will_pay', quote: 'kal payment kar dunga' } }));
  const ev = fullCall();
  (ev[ev.length - 1] as any).manifest = manifest({ fallbacksUsed: [{ at_ms: 100, component: 'voice', from: 'a', to: 'b', reason: 'timeout' }] });
  await post(r.result.conversationId, ev);
  await analysesSettled();
  const conv = await one<any>(pool, 'SELECT channel, analysis, flags FROM conversation WHERE id = $1', [r.result.conversationId]);
  assert.equal(conv.channel, 'test'); assert.equal(conv.analysis.status, 'done');
  assert.ok(conv.flags.includes('fallback_on_test'), 'a fallback on a test call is flagged');
  assert.equal((await one<any>(pool, 'SELECT count(*)::int AS n FROM outcome WHERE conversation_id = $1', [r.result.conversationId])).n, 0);
  const s = await registry.execute<any>(pool, 'call.search', {}, { workspaceId: w.ws, actor: w.member });
  assert.equal(s.status === 'confirmed' && s.result.calls.length, 0);
  const s2 = await registry.execute<any>(pool, 'call.search', { includeTest: true }, { workspaceId: w.ws, actor: w.member });
  assert.equal(s2.status === 'confirmed' && s2.result.calls.length, 1);
  assert.equal((await one<any>(pool, 'SELECT count(*)::int AS n FROM monitor WHERE workspace_id = $1', [w.ws])).n, 0, 'monitors never read test calls');
  const lbl = await registry.execute(pool, 'outcome.label', { conversationId: r.result.conversationId, definitionId: def, value: 'will_pay' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(lbl.status, 'not_executed');

  setRuntime({ start: async () => ({ accepted: false, reason: 'stack not loaded' }), control: async () => ({ ok: true }) });
  const refused = await registry.execute(pool, 'test.browser_call', { agentId: w.agent }, { workspaceId: w.ws, actor: w.member });
  setRuntime(fakeRuntime);
  assert.equal(refused.status, 'not_executed');
  assert.equal((await one<any>(pool, "SELECT count(*)::int AS n FROM conversation WHERE workspace_id = $1 AND channel = 'test' AND status = 'live'", [w.ws])).n, 0, 'a refused start leaves no live test call behind');

  const noVersion = await registry.execute(pool, 'test.browser_call', { agentId: w.agent, useDraft: true }, { workspaceId: w.ws, actor: w.member });
  assert.equal(noVersion.status, 'not_executed', 'a draft with no compiled brief cannot be test-called');
});

// ---- tenancy -------------------------------------------------------------------------------------------------------
test('another workspace cannot read or change these calls', { skip }, async () => {
  setFakeLlm(llmReply({ points: [], moments: [], reasonCode: null, outcome: null }));
  const a = await workspace(), b = await workspace();
  const c = await call(a);
  await post(c.conv, fullCall());
  await analysesSettled();
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'R','Pay?','{yes,no}','{yes}') RETURNING id`, [b.ws]))!.id;
  for (const [name, args] of [['call.get', { conversationId: c.conv }], ['call.explain', { conversationId: c.conv }], ['outcome.label', { conversationId: c.conv, definitionId: def, value: 'yes' }],
    ['campaign.funnel', { campaignId: a.campaign }], ['live.listen', { conversationId: c.conv }]] as const) {
    const r = await registry.execute(pool, name, args, { workspaceId: b.ws, actor: b.member });
    assert.equal(r.status, 'not_executed', name);
  }
  const s = await registry.execute<any>(pool, 'call.search', { includeTest: true }, { workspaceId: b.ws, actor: b.member });
  assert.equal(s.status === 'confirmed' && s.result.calls.length, 0);
  const own = await registry.execute<any>(pool, 'call.get', { conversationId: c.conv }, { workspaceId: a.ws, actor: a.member });
  assert.equal(own.status === 'confirmed' && own.result.turns.length, 4);
});

// ---- opt-out -------------------------------------------------------------------------------------------------------
test('an opt_out moment reaches contact.suppress_after_opt_out as A3, or stays pending when it is not registered', { skip }, async () => {
  const w = await workspace();
  const c1 = await call(w);
  const optOut: RuntimeEvent = { seq: 2, type: 'moment', at: now(), kind: 'opt_out', atMs: 9000, note: 'asked not to be called' };
  await post(c1.conv, [optOut]);
  assert.equal((await one<any>(pool, 'SELECT status FROM call_opt_out WHERE conversation_id = $1', [c1.conv])).status, 'pending');
  const c2 = await call(w);
  await post(c2.conv, [optOut], { to: base2 });
  assert.ok(suppressed.includes(c2.contact));
  assert.ok(suppressed.includes(c1.contact), 'the earlier pending opt-out is flushed too');
  const rows = await many<any>(pool, 'SELECT status, detail FROM call_opt_out WHERE workspace_id = $1', [w.ws]);
  assert.deepEqual(rows.map(r => r.status), ['applied', 'applied']);
  assert.ok(rows.every(r => r.detail === 'mode A3'));
});

// ---- outcomes, judges, calibration, funnel -------------------------------------------------------------------------
test('outcome.define and judge.edit run as drafts and are audited; verified outcomes only from a system key; judges calibrate on human labels; funnel counts by grade', { skip }, async () => {
  const w = await workspace();
  const a = await registry.execute<any>(pool, 'outcome.define', { name: 'Renewal', question: 'Did they renew?', allowedValues: ['renewed', 'later', 'no'], goalValues: ['renewed'], verifiedBy: 'payment_webhook', campaignId: w.campaign },
    { workspaceId: w.ws, actor: w.member });
  assert.equal(a.status, 'confirmed', JSON.stringify(a));
  if (a.status !== 'confirmed') return;
  assert.equal(a.mode, 'A1', 'defining success is everyday work (draft), kept in version history');
  const def = a.result.outcomeDefinitionId;
  const viewer = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'viewer') RETURNING id", [w.ws, `v${Math.random()}@example.test`]);
  const byViewer = await registry.execute(pool, 'outcome.define', { name: 'X', question: 'Did they?', allowedValues: ['a', 'b'], goalValues: ['a'] },
    { workspaceId: w.ws, actor: { type: 'member', id: viewer!.id, role: 'viewer' } });
  assert.equal(byViewer.status, 'not_executed', 'a viewer cannot define outcomes');

  const ja = await registry.execute<any>(pool, 'judge.edit', { outcomeDefinitionId: def, name: 'Renewal judge', model: 'analyst-2026-10-01', instructions: 'Renewed only if they say they paid.' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(ja.status, 'confirmed');
  const judgeId = ja.status === 'confirmed' ? ja.result.judgeVersionId : '';
  const audited = await one<any>(pool, "SELECT count(*)::int AS n FROM audit_event WHERE workspace_id = $1 AND action IN ('outcome.define','judge.edit')", [w.ws]);
  assert.equal(audited.n, 2, 'both changes are in the audit trail');

  // Four calls: the judge guesses each; a webhook verifies two, a manager labels one, one stays a guess.
  const guesses = ['renewed', 'renewed', 'later', 'no'];
  const ids: string[] = [];
  for (const g of guesses) {
    setFakeLlm(llmReply({ points: [], moments: [], reasonCode: null, outcome: { value: g, quote: 'main kal payment kar dunga' } }));
    const c = await call(w);
    await post(c.conv, fullCall());
    await analysesSettled();
    ids.push(c.conv);
  }
  const jv = await one<any>(pool, 'SELECT judge_version_id, source FROM outcome WHERE conversation_id = $1', [ids[0]]);
  assert.equal(jv.judge_version_id, judgeId); assert.equal(jv.source, `judge:${judgeId}`);

  const sys: Actor = { type: 'system', id: 'payments' };
  const v1 = await registry.execute(pool, 'outcome.record_verified', { conversationId: ids[0], definitionId: def, value: 'renewed', key: { source: 'payment_webhook', ref: 'pay_001' } }, { workspaceId: w.ws, actor: sys });
  assert.equal(v1.status, 'confirmed');
  const v2 = await registry.execute(pool, 'outcome.record_verified', { conversationId: ids[1], definitionId: def, value: 'later', key: { source: 'payment_webhook', ref: 'pay_002' } }, { workspaceId: w.ws, actor: sys });
  assert.equal(v2.status, 'confirmed');
  const byMember = await registry.execute(pool, 'outcome.record_verified', { conversationId: ids[2], definitionId: def, value: 'renewed', key: { source: 'x', ref: 'y' } }, { workspaceId: w.ws, actor: w.member });
  assert.equal(byMember.status, 'not_executed', 'a person cannot mint a verified outcome');
  const byAgent = await registry.execute(pool, 'outcome.record_verified', { conversationId: ids[2], definitionId: def, value: 'renewed', key: { source: 'x', ref: 'y' } }, { workspaceId: w.ws, actor: { type: 'agent', id: 'operator' } });
  assert.equal(byAgent.status, 'not_executed', 'nor can a model');
  const lab = await registry.execute(pool, 'outcome.label', { conversationId: ids[2], definitionId: def, value: 'later' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(lab.status, 'confirmed');
  const bad = await registry.execute(pool, 'outcome.label', { conversationId: ids[2], definitionId: def, value: 'maybe' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(bad.status, 'not_executed');

  const cal = await registry.execute<any>(pool, 'judge.calibrate', { judgeVersionId: judgeId }, { workspaceId: w.ws, actor: w.member });
  assert.equal(cal.status, 'confirmed');
  if (cal.status !== 'confirmed') return;
  assert.equal(cal.result.n, 3); assert.equal(cal.result.agreed, 2);
  assert.equal(cal.result.status, 'calibrating');
  assert.ok(Math.abs(cal.result.wilsonLower - wilsonLower(2, 3)) < 1e-9);
  assert.equal((await one<any>(pool, 'SELECT n, status FROM calibration WHERE judge_version_id = $1', [judgeId])).status, 'calibrating');

  // A no-answer attempt and a blocked attempt complete the funnel picture.
  const na = await call(w);
  await post(na.conv, [{ seq: 1, type: 'call.ended', at: now(), endReason: 'no_answer', durationS: 0, transcript: [], manifest: manifest() }]);
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id", [w.ws, `+91${phone++}`]))!.id;
  await pool.query("INSERT INTO attempt (workspace_id, campaign_id, contact_id, status, blocked_by) VALUES ($1,$2,$3,'blocked','PRE_WINDOW')", [w.ws, w.campaign, contact]);
  await analysesSettled();
  const f = await registry.execute<any>(pool, 'campaign.funnel', { campaignId: w.campaign }, { workspaceId: w.ws, actor: w.member });
  assert.equal(f.status, 'confirmed', JSON.stringify(f));
  if (f.status !== 'confirmed') return;
  // ids[0]: verified renewed (goal); ids[1]: verified later; ids[2]: manager later; ids[3]: guess no.
  assert.deepEqual({ ...f.result.total, agentVersionId: undefined }, { agentVersionId: undefined, dialled: 5, connected: 4, talked: 4, goalReached: 1, goalByGrade: { verified: 1, manager: 0, ai_guess: 0 } });
  assert.equal(f.result.byVersion[0].agentVersionId, w.version);

  const rep = await registry.execute<any>(pool, 'report.create', { title: 'Week 1', campaignId: w.campaign }, { workspaceId: w.ws, actor: w.member });
  assert.equal(rep.status, 'confirmed');
  if (rep.status === 'confirmed') {
    assert.equal(rep.result.content.calls, 5);
    assert.deepEqual(rep.result.content.outcomes.find((o: any) => o.value === 'renewed'), { value: 'renewed', grade: 'verified', n: 1 });
  }
  const srch = await registry.execute<any>(pool, 'call.search', { campaignId: w.campaign, outcome: 'later' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(srch.status === 'confirmed' && srch.result.calls.length, 2);
  const byReason = await registry.execute<any>(pool, 'call.search', { reasonCode: 'DIAL_NO_ANSWER' }, { workspaceId: w.ws, actor: w.member });
  assert.equal(byReason.status === 'confirmed' && byReason.result.calls[0].id, na.conv);
});

// ---- monitors and issues -------------------------------------------------------------------------------------------
test('a monitor crossing its threshold opens one issue with evidence calls; issue.resolve closes it', { skip }, async () => {
  setFakeLlm(llmReply({ points: [], moments: [], reasonCode: null, outcome: null }));
  const w = await workspace();
  const m = await registry.execute<any>(pool, 'monitor.create', { name: 'Tool down', signal: 'tool_failure_rate', threshold: 0.5, windowCalls: 10, minCalls: 3, severity: 'critical', category: 'Integration' },
    { workspaceId: w.ws, actor: w.member });
  assert.equal(m.status, 'confirmed');
  const failing: string[] = [];
  for (let k = 0; k < 4; k++) {
    const c = await call(w);
    const ev = fullCall();
    ev.splice(1, 0, { seq: 100, type: 'tool', at: now(), name: 'policy_lookup', args: { id: 'P-1' }, status: 'failed' });
    await post(c.conv, ev);
    await analysesSettled();
    failing.push(c.conv);
  }
  const issues = await many<any>(pool, "SELECT id, severity, detail, status FROM issue WHERE workspace_id = $1 AND detail->>'signal' = 'tool_failure_rate'", [w.ws]);
  assert.equal(issues.length, 1, 'one open issue, not one per call');
  assert.equal(issues[0].severity, 'critical');
  assert.ok(issues[0].detail.evidenceCalls.length >= 3);
  for (const id of issues[0].detail.evidenceCalls) assert.ok(failing.includes(id));
  const ml = await registry.execute<any>(pool, 'monitor.list', {}, { workspaceId: w.ws, actor: w.member });
  assert.equal(ml.status === 'confirmed' && ml.result.health, 'monitored');
  const flagged = await registry.execute<any>(pool, 'call.search', { flagged: true }, { workspaceId: w.ws, actor: w.member });
  assert.equal(flagged.status === 'confirmed' && flagged.result.calls.length, 4);

  const other = await workspace();
  assert.equal((await registry.execute(pool, 'issue.resolve', { issueId: issues[0].id, resolution: 'fixed the url' }, { workspaceId: other.ws, actor: other.member })).status, 'not_executed');
  assert.equal((await registry.execute(pool, 'issue.resolve', { issueId: issues[0].id, resolution: 'fixed the url' }, { workspaceId: w.ws, actor: w.member })).status, 'confirmed');
  assert.equal((await one<any>(pool, 'SELECT status FROM issue WHERE id = $1', [issues[0].id])).status, 'resolved');
});

// ---- live control --------------------------------------------------------------------------------------------------
test('live control: listen runs, whisper needs approval, take-over is for a person only', { skip }, async () => {
  const w = await workspace();
  const c = await call(w);
  const ctx = { workspaceId: w.ws, actor: w.member };
  assert.equal((await registry.execute(pool, 'live.listen', { conversationId: c.conv }, ctx)).status, 'confirmed');
  assert.equal((await registry.execute(pool, 'live.whisper', { conversationId: c.conv, text: 'They paid yesterday' }, ctx)).status, 'needs_approval');
  assert.equal((await registry.execute(pool, 'live.takeover', { conversationId: c.conv }, { workspaceId: w.ws, actor: { type: 'agent', id: 'operator' } })).status, 'not_executed');
  assert.equal((await registry.execute(pool, 'live.takeover', { conversationId: c.conv }, { workspaceId: w.ws, actor: { type: 'agent', id: 'operator', role: 'owner' } })).status, 'not_executed');
  assert.equal((await registry.execute(pool, 'live.takeover', { conversationId: c.conv }, ctx)).status, 'confirmed');
  assert.deepEqual(fakeRuntime.controls.filter(x => x.id === c.conv).map(x => x.action), ['listen', 'takeover']);
  await post(c.conv, [{ seq: 1, type: 'call.ended', at: now(), endReason: 'agent_ended', durationS: 3, transcript: [], manifest: manifest() }]);
  await analysesSettled();
  assert.equal((await registry.execute(pool, 'live.listen', { conversationId: c.conv }, ctx)).status, 'not_executed', 'an ended call cannot be joined');
});

// ---- what memory and learning expect -----------------------------------------------------------------------------
test('after a non-test call: memory.extract, experiment.check on running experiments, the version that ran, forget requests', { skip }, async () => {
  const w = await workspace();
  const v2 = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,2,'h2','{}') RETURNING id", [w.agent]))!.id;
  const exp = '00000000-0000-4000-8000-0000000000e1';
  experiments.set(w.agent, [{ id: exp, state: 'running' }, { id: '00000000-0000-4000-8000-0000000000e2', state: 'decided' }]);
  setFakeLlm(llmReply({ points: [], moments: [], reasonCode: null, outcome: null, forget: { quote: 'Theek hai, main kal payment' } }));

  const c = await call(w);
  const ev = fullCall();
  for (const e of ev) if (e.type === 'call.started' || e.type === 'call.ended') e.manifest = manifest({ agentVersionHash: 'h2' });
  await post(c.conv, ev, { to: base2 });
  await analysesSettled();
  const conv = await one<any>(pool, 'SELECT agent_version_id, flags, run_manifest, analysis FROM conversation WHERE id = $1', [c.conv]);
  assert.equal(conv.agent_version_id, v2, 'filed under the version that actually ran');
  assert.ok(conv.flags.includes('version_restamped'));
  assert.equal(conv.run_manifest.test, false);
  assert.ok(extracted.includes(c.conv));
  assert.deepEqual(checked, [exp], 'only running experiments are checked');
  assert.equal(conv.analysis.followups['memory.extract'], 'done');
  const fr = await many<any>(pool, 'SELECT contact_id, requested_via, evidence FROM forget_request WHERE workspace_id = $1', [w.ws]);
  assert.deepEqual(fr, [{ contact_id: c.contact, requested_via: 'caller', evidence: { quote: 'Theek hai, main kal payment', conversationId: c.conv } }]);

  // A no-answer call is not extracted as connected and checks no experiment; a test call reaches neither.
  checked.length = 0;
  const na = await call(w);
  await post(na.conv, [{ seq: 1, type: 'call.ended', at: now(), endReason: 'no_answer', durationS: 0, transcript: [], manifest: manifest() }], { to: base2 });
  await analysesSettled();
  assert.deepEqual(checked, []);
  const t = await registry.execute<any>(pool, 'test.browser_call', { agentId: w.agent, versionId: w.version }, { workspaceId: w.ws, actor: w.member });
  assert.equal(t.status, 'confirmed');
  if (t.status !== 'confirmed') return;
  await post(t.result.conversationId, fullCall(), { to: base2 });
  await analysesSettled();
  assert.ok(!extracted.includes(t.result.conversationId), 'memory never reads a test call');
  assert.equal((await one<any>(pool, 'SELECT run_manifest FROM conversation WHERE id = $1', [t.result.conversationId])).run_manifest.test, true);
  assert.equal((await one<any>(pool, 'SELECT count(*)::int AS n FROM forget_request WHERE workspace_id = $1', [w.ws])).n, 1, 'no forget request from a test call');
});

test('an AI guess counts only once its judge is trusted; the sweep analyses calls the queue lost', { skip }, async () => {
  const w = await workspace();
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'R','Pay?','{yes,no}','{yes}') RETURNING id`, [w.ws]))!.id;
  const judge = (await one<{ id: string }>(pool, `INSERT INTO judge_version (workspace_id, name, model, config, outcome_definition_id) VALUES ($1,'j','m','{}',$2) RETURNING id`, [w.ws, def]))!.id;
  const c = await call(w);
  await pool.query(`INSERT INTO outcome (workspace_id, conversation_id, definition_id, value, grade, judge_version_id) VALUES ($1,$2,$3,'yes','ai_guess',$4)`, [w.ws, c.conv, def, judge]);
  await refreshOutcome(pool, w.ws, c.conv);
  assert.equal((await one<any>(pool, 'SELECT outcome FROM conversation WHERE id = $1', [c.conv])).outcome, null);
  await pool.query(`INSERT INTO calibration (judge_version_id, workspace_id, n, agreement, wilson_lower, status) VALUES ($1,$2,60,0.95,0.86,'trusted')`, [judge, w.ws]);
  await refreshOutcome(pool, w.ws, c.conv);
  assert.equal((await one<any>(pool, 'SELECT outcome FROM conversation WHERE id = $1', [c.conv])).outcome, 'yes');

  setFakeLlm(llmReply({ points: [{ claim: 'Will pay.', quote: 'kal payment kar dunga' }], moments: [], reasonCode: null, outcome: null }));
  const lost = await call(w);
  await pool.query(`UPDATE conversation SET status = 'ended', ended_at = now() - interval '10 minutes', transcript = $2 WHERE id = $1`, [lost.conv, JSON.stringify(lines)]);
  const r = await sweep(pool, registry, { workspaceId: w.ws });
  assert.equal(r.analysed, 1, 'only this workspace is swept');
  assert.equal((await one<any>(pool, 'SELECT analysis FROM conversation WHERE id = $1', [lost.conv])).analysis.status, 'done');
});

test('non-final campaign outcomes go to attempt.retry_per_ladder as A3; final ones and test calls never do', { skip }, async () => {
  const w = await workspace();
  const send = async (end: string, durationS: number, llm: Record<string, unknown> = {}) => {
    setFakeLlm(llmReply({ points: [], moments: [], reasonCode: null, outcome: null, ...llm }));
    const c = await call(w);
    const ev: RuntimeEvent[] = end === 'busy' || end === 'no_answer'
      ? [{ seq: 1, type: 'call.ended', at: now(), endReason: end as any, durationS: 0, transcript: [], manifest: manifest() }]
      : fullCall({ endReason: end, durationS });
    await post(c.conv, ev, { to: base2 });
    await analysesSettled();
    return c.attempt;
  };
  const busy = await send('busy', 0), noAnswer = await send('no_answer', 0), early = await send('caller_hung_up', 4);
  const callback = await send('completed', 40, { reasonCode: 'CONV_CALLBACK' });
  const done = await send('completed', 60, { reasonCode: 'CONV_GOAL_DONE' }), optedOut = await send('opt_out', 30);
  const mine = (id: string) => retried.filter(x => x.attemptId === id).map(x => x.outcome);
  assert.deepEqual(mine(busy), ['busy']); assert.deepEqual(mine(noAnswer), ['no_answer']);
  assert.deepEqual(mine(early), ['short_call']); assert.deepEqual(mine(callback), ['callback']);
  assert.deepEqual(mine(done), [], 'a completed call is final');
  assert.deepEqual(mine(optedOut), [], 'an opt-out is never retried');
  const followups = (await one<any>(pool, 'SELECT analysis FROM conversation WHERE attempt_id = $1', [busy])).analysis.followups;
  assert.equal(followups['attempt.retry_per_ladder'], 'done');
  const ac = await one<any>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'attempt.retry_per_ladder' LIMIT 1", [w.ws]);
  assert.equal(ac.payload.mode, 'A3', 'VP retries on its own only through the A3 verb');
});
