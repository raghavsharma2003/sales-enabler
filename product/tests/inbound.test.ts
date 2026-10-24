// Inbound calls (must-be brief 8, the control-plane half): a number bound to a published agent version answers through
// POST /hooks/telephony/inbound (signed). A fake runtime records the tickets; no carrier. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { numberHash } from '../server/identity.ts';
import { FakeRuntime, setRuntime, sign } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import type { CallTicket, RuntimeEvent } from '../shared/runtime-protocol.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { module as money } from '../server/modules/money/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
const SECRET = 'inbound-test-telephony-secret-'.padEnd(40, 'x');
let pool: pg.Pool, registry: Registry, server: Server, base = '', rt: FakeRuntime;
const saved = process.env.VP_TELEPHONY_WEBHOOK_SECRET;
before(async () => {
  if (skip) return;
  process.env.VP_TELEPHONY_WEBHOOK_SECRET = SECRET;
  pool = createPool(process.env.DATABASE_URL);
  const app = buildApp(pool, [agents, campaigns, calls, money]);
  registry = app.registry; server = app.server;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rt = new FakeRuntime(); setRuntime(rt);
});
after(async () => {
  setRuntime(null); await analysesSettled();
  await new Promise(r => server?.close(r)); await pool?.end();
  if (saved === undefined) delete process.env.VP_TELEPHONY_WEBHOOK_SECRET; else process.env.VP_TELEPHONY_WEBHOOK_SECRET = saved;
});

let n = 0;
async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('inbound test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  await pool.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, 5000000, 'ok')", [ws]);
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  // A published version made the way the agents module makes one: its own draft and its own compile().
  const made = await registry.execute<any>(pool, 'agent.create', { name: 'Order help', templateId: 'd2c-inbound-support' }, ctx);
  if (made.status !== 'confirmed') throw new Error(JSON.stringify(made));
  const got = await registry.execute<any>(pool, 'agent.get', { agentId: made.result.agentId }, ctx);
  if (got.status !== 'confirmed') throw new Error(JSON.stringify(got));
  const cfg = { ...got.result.draft, facts: [...(got.result.draft.facts ?? []), { key: 'order_id', value: 'from the contact record', purpose: 'service', source: 'contact.attribute', perContact: true }] };
  const brief = await registry.execute<any>(pool, 'brief.compile', { config: cfg }, ctx);
  if (brief.status !== 'confirmed') throw new Error(JSON.stringify(brief));
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config, kind) VALUES ($1, 1, $2, $3, 'published') RETURNING id",
    [made.result.agentId, `h${n}`, { agent: cfg, brief: brief.result }]))!.id;
  const candidate = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config, kind) VALUES ($1, 2, $2, $3, 'candidate') RETURNING id",
    [made.result.agentId, `c${n}`, { agent: cfg, brief: brief.result }]))!.id;
  const e164 = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`; n++;
  const number = (await one<{ id: string }>(pool, "INSERT INTO phone_number (workspace_id, e164, carrier, status) VALUES ($1,$2,'fake','active') RETURNING id", [ws, e164]))!.id;
  return { ws, owner, ctx, version, candidate, number, e164 };
}
type W = Awaited<ReturnType<typeof workspace>>;
async function bind(w: W, versionId = w.version) {
  const r = await registry.execute<any>(pool, 'inbound.route.set', { numberId: w.number, agentVersionId: versionId }, w.ctx);
  if (r.status !== 'needs_approval') return r;
  return registry.approve<any>(pool, r.actionId, { workspaceId: w.ws, memberId: w.owner });
}
async function ring(to: string, from: string, callId = `call-${Math.random()}`) {
  const body = JSON.stringify({ provider: 'fake', callId, to, from });
  const r = await fetch(base + '/hooks/telephony/inbound', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) } });
  return { status: r.status, body: await r.json() as any, callId };
}
const lastTicket = (): CallTicket => rt.tickets[rt.tickets.length - 1];

test('binding: a published version on your own number (a policy change, approved); a candidate or another workspace\'s number is refused', { skip }, async () => {
  const a = await workspace(), b = await workspace();
  const card = await registry.execute<any>(pool, 'inbound.route.set', { numberId: a.number, agentVersionId: a.version }, a.ctx);
  assert.equal(card.status, 'needs_approval', 'a policy change asks for approval');
  assert.match(card.summary, /^Answer calls to \+9198\d{8} with Order help, version 1$/);
  const done = await registry.approve<any>(pool, card.actionId, { workspaceId: a.ws, memberId: a.owner });
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  const list = await registry.execute<any>(pool, 'inbound.route.list', {}, a.ctx);
  assert.deepEqual(list.status === 'confirmed' && [list.result.routes[0].agentName, list.result.routes[0].versionNumber], ['Order help', 1]);
  const cand = await bind(a, a.candidate);
  assert.equal(cand.status, 'not_executed'); assert.match(cand.reason, /only a published version answers calls/);
  const theirs = await registry.execute<any>(pool, 'inbound.route.set', { numberId: b.number, agentVersionId: a.version }, a.ctx);
  const t = theirs.status === 'needs_approval' ? await registry.approve<any>(pool, theirs.actionId, { workspaceId: a.ws, memberId: a.owner }) : theirs;
  assert.equal(t.status, 'not_executed'); assert.match(t.reason, /no such number in this workspace/);
});

test('an unbound number, and a number that is not ours, get a plain refusal; no ticket, no hold', { skip }, async () => {
  const w = await workspace();
  const before = rt.tickets.length;
  const unbound = await ring(w.e164, '+919811111111');
  assert.equal(unbound.status, 409);
  assert.deepEqual(unbound.body, { accepted: false, code: 'not_answering', message: 'This number is not set up to answer calls yet.' });
  const stranger = await ring('+919000000001', '+919811111111');
  assert.equal(stranger.status, 404); assert.equal(stranger.body.code, 'not_our_number');
  assert.equal(rt.tickets.length, before);
  const forged = await fetch(base + '/hooks/telephony/inbound', { method: 'POST', body: '{"provider":"fake","callId":"x","to":"' + w.e164 + '"}', headers: { 'content-type': 'application/json', 'x-vp-signature': sign('wrong-secret-'.padEnd(40, 'y'), '{}') } });
  assert.equal(forged.status, 401, 'unsigned or wrongly signed');
});

test('a known caller: their facts, an inbound ticket, a hold on the wallet only, the stream back; a retry is the same call', { skip }, async () => {
  const w = await workspace();
  assert.equal((await bind(w)).status, 'confirmed');
  const contact = (await one<{ id: string }>(pool, `INSERT INTO contact (workspace_id, e164, name, custom) VALUES ($1,'+919822222222','Ravi Kumar','{"order_id":"KK-4471"}') RETURNING id`, [w.ws]))!.id;
  const r = await ring(w.e164, '98222 22222');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.accepted, true); assert.ok(r.body.stream?.url, 'the runtime\'s stream URL comes back');
  const t = lastTicket();
  assert.equal(t.direction, 'inbound'); assert.equal(t.attemptId, null); assert.deepEqual(t.consent, { basis: 'inbound' });
  assert.deepEqual(t.transport, { kind: 'sip_inbound', from: '+919822222222', to: w.e164, carrierCallId: r.callId, trunk: 'fake' });
  assert.equal(t.contact.displayName, 'Ravi Kumar'); assert.equal(t.contact.facts.order_id, 'KK-4471', 'a known caller gets their facts');
  assert.notEqual(t.contact.memoryStatus, 'disabled');
  assert.deepEqual(t.inbound, { who: 'known', noMarketing: false, calledNumber: w.e164 });
  const conv = await one<any>(pool, 'SELECT direction, contact_id, carrier_call_id, caller_e164, inbound_note, agent_version_id, attempt_id FROM conversation WHERE id = $1', [r.body.conversationId]);
  assert.deepEqual(conv, { direction: 'inbound', contact_id: contact, carrier_call_id: r.callId, caller_e164: '+919822222222', inbound_note: 'known', agent_version_id: w.version, attempt_id: null });
  const hold = await one<{ inr_milli: string; attempt_id: string | null }>(pool, "SELECT inr_milli::text, attempt_id FROM reservation WHERE conversation_id = $1 AND status = 'held'", [r.body.conversationId]);
  assert.ok(hold && Number(hold.inr_milli) > 0 && hold.attempt_id === null, 'a hold on the wallet, tied to the call');
  const again = await ring(w.e164, '+919822222222', r.callId);
  assert.deepEqual([again.status, again.body.duplicate, again.body.conversationId], [200, true, r.body.conversationId], 'a carrier retry answers the same call');
  assert.equal(rt.tickets.filter(x => x.conversationId === r.body.conversationId).length, 1);

  // The call ends: the hold settles at the real cost; no campaign cap is touched; the log says Inbound.
  const at = new Date().toISOString(), m = { combinationId: 'i', stackId: 'i', agentVersionHash: 'i', components: {}, fallbacksUsed: [], memory: 'none' as const, runtimeVersion: 'i' };
  await ingest(pool, { conversationId: r.body.conversationId, events: [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'cost', at, component: 'telephony', provider: 'fake', quantity: 60, unit: 'second', inrMilli: 1200 },
    { seq: 3, type: 'call.ended', at, endReason: 'caller_hung_up', durationS: 60, transcript: [{ speaker: 'caller', text: 'Mera order kab aayega?', startMs: 0 }], manifest: m }] as RuntimeEvent[] });
  const settled = await one<any>(pool, 'SELECT settlement FROM conversation WHERE id = $1', [r.body.conversationId]);
  assert.equal(settled.settlement.action, 'settled'); assert.equal(settled.settlement.inrMilli, 1200);
  const s = await registry.execute<any>(pool, 'call.search', {}, w.ctx);
  assert.equal(s.status === 'confirmed' && s.result.calls.find((c: any) => c.id === r.body.conversationId).direction, 'inbound');
});

test('an erased caller still reaches the agent: no memory, no facts, no name, their number not stored, no marketing', { skip }, async () => {
  const w = await workspace();
  await bind(w);
  await pool.query("INSERT INTO contact (workspace_id, e164, name, custom) VALUES ($1,'+919833333333','Old Name','{\"order_id\":\"KK-1\"}')", [w.ws]);
  await pool.query('INSERT INTO tombstone (workspace_id, e164_hash) VALUES ($1,$2)', [w.ws, await numberHash(pool, w.ws, '+919833333333')]);
  const r = await ring(w.e164, '+919833333333');
  assert.equal(r.body.accepted, true, JSON.stringify(r.body));
  const t = lastTicket();
  assert.deepEqual([t.contact.memoryStatus, t.contact.memoryBrief, t.contact.facts, t.contact.displayName, t.transport.kind === 'sip_inbound' && t.transport.from], ['disabled', '', {}, '', '']);
  assert.deepEqual(t.inbound, { who: 'erased', noMarketing: true, calledNumber: w.e164 });
  const conv = await one<any>(pool, 'SELECT contact_id, caller_e164, inbound_note FROM conversation WHERE id = $1', [r.body.conversationId]);
  assert.deepEqual(conv, { contact_id: null, caller_e164: null, inbound_note: 'erased' });
});

test('an opted-out caller is answered with no memory and no marketing; an unknown caller gets nothing of anyone else\'s', { skip }, async () => {
  const w = await workspace();
  await bind(w);
  const c = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,'+919844444444','Sunita') RETURNING id", [w.ws]))!.id;
  await pool.query("INSERT INTO suppression (workspace_id, e164, contact_id, scope, reason) VALUES ($1,'+919844444444',$2,'workspace','asked not to be called')", [w.ws, c]);
  const r = await ring(w.e164, '+919844444444');
  const t = lastTicket();
  assert.equal(r.body.accepted, true);
  assert.deepEqual([t.inbound?.who, t.inbound?.noMarketing, t.contact.memoryStatus, t.contact.displayName], ['suppressed', true, 'disabled', 'Sunita']);
  // Another workspace's contact with this caller's number is never read.
  const other = await workspace();
  await bind(other);
  await pool.query("INSERT INTO contact (workspace_id, e164, name, custom) VALUES ($1,'+919855555555','Their customer','{\"order_id\":\"THEIRS\"}')", [w.ws]);
  const u = await ring(other.e164, '+919855555555');
  const tu = lastTicket();
  assert.equal(u.body.accepted, true);
  assert.deepEqual([tu.workspaceId, tu.inbound?.who, tu.contact.displayName, tu.contact.facts], [other.ws, 'unknown_caller', '', {}]);
});

test('an empty wallet: a plain refusal, nothing opened', { skip }, async () => {
  const w = await workspace();
  await bind(w);
  await pool.query("UPDATE wallet SET balance_inr_milli = 0 WHERE workspace_id = $1", [w.ws]);
  const r = await ring(w.e164, '+919866666666');
  assert.equal(r.status, 402);
  assert.deepEqual(r.body, { accepted: false, code: 'wallet_low', message: 'Calls cannot be answered right now: the wallet has no balance for them.' });
  assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM conversation WHERE workspace_id = $1 AND direction = 'inbound'", [w.ws]))!.n, 0);
});

test('telephony allowlist: an agent whose hand-off number is not listed does not answer; nothing reaches the runtime', { skip }, async () => {
  const before = process.env.VP_TELEPHONY_ALLOWED_TO;
  try {
    const w = await workspace();
    const cfg = (await one<{ config: { agent: Record<string, unknown>; brief: unknown } }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [w.version]))!.config;
    const bridge = '+919000004321';
    await pool.query('UPDATE agent_version SET config = $2 WHERE id = $1', [w.version,
      { ...cfg, agent: { ...cfg.agent, handOff: { when: ['asks_for_human'], target: { kind: 'phone', value: bridge }, warmSummary: true } } }]);
    assert.equal((await bind(w)).status, 'confirmed');
    process.env.VP_TELEPHONY_ALLOWED_TO = '+919000004322';          // a list without the hand-off number
    const n0 = rt.tickets.length;
    const r = await ring(w.e164, '+919000004323');
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.code ?? r.body.error, 'transfer_not_allowlisted', JSON.stringify(r.body));
    assert.equal(rt.tickets.length, n0, 'no ticket, so the runtime never sees the number');
    process.env.VP_TELEPHONY_ALLOWED_TO = `+919000004322,${bridge}`;
    const ok = await ring(w.e164, '+919000004323');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(rt.tickets.length, n0 + 1);
  } finally { if (before === undefined) delete process.env.VP_TELEPHONY_ALLOWED_TO; else process.env.VP_TELEPHONY_ALLOWED_TO = before; }
});
