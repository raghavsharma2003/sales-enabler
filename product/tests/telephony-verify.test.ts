// Phone verification in the product, end to end on the real Plivo adapter against a fake Plivo on this machine: a
// member asks, the adapter posts one Call API request, "Plivo" fetches the signed answer URL and hears the code in Speak
// XML, the member confirms it, and a test call then rings that phone. And the staff-only way (actor vp_success) to mark a
// phone the carrier itself verified: refused to every workspace role and to the system, audited without the number.
// Skipped without DATABASE_URL. Synthetic 90000000xx numbers and tokens only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one, tx } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { PlivoTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { setVerifyClock } from '../server/modules/campaigns/verify.ts';
import { plivoFetch } from './fixtures/plivo-sign.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
const TOKEN = 'synthetic-plivo-token-verify';
const KEYS = ['VP_PUBLIC_URL', 'PLIVO_AUTH_TOKEN', 'VP_TELEPHONY_ALLOWED_TO'] as const;
const saved: Record<string, string | undefined> = {};
let pool: pg.Pool, registry: Registry, server: Server, local = '';
let carrier: Server, carrierBase = '';
const seen: { url: string; body: Record<string, unknown> }[] = [];
const synth = () => `+91900000${String(randomInt(0, 10_000)).padStart(4, '0')}`;

before(async () => {
  for (const k of KEYS) saved[k] = process.env[k];
  if (skip) return;
  pool = createPool(URL_);
  const app = buildApp(pool, [campaigns]);
  registry = app.registry; server = app.server;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  carrier = createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => { seen.push({ url: req.url ?? '', body: JSON.parse(b || '{}') }); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'call fired', request_uuid: `req-${seen.length}`, api_id: 'api' })); });
  });
  await new Promise<void>(r => carrier.listen(0, '127.0.0.1', r));
  carrierBase = `http://127.0.0.1:${(carrier.address() as AddressInfo).port}`;
  process.env.VP_PUBLIC_URL = local; process.env.PLIVO_AUTH_TOKEN = TOKEN;
  setTelephony(new PlivoTelephony({ apiBase: carrierBase, authId: 'MAFAKEAUTHID', authToken: TOKEN, publicBase: local }));
  setRuntime(new FakeRuntime());
  setVerifyClock(() => new Date(Date.UTC(2032, 0, 1) + randomInt(0, 20_000) * 864e5 + 6.5 * 3600_000));   // 12:00 IST, a day of its own
});
after(async () => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setVerifyClock(null); setTelephony(null); setRuntime(null);
  await new Promise(r => carrier?.close(r)); await new Promise(r => server?.close(r)); await pool?.end();
});

async function workspace() {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('verify ws') RETURNING id"))!.id;
    const mk = async (role: string) => (await one<{ id: string }>(c, 'INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,$3) RETURNING id', [ws, `${role}${Math.random()}@example.test`, role]))!.id;
    const owner = await mk('owner'), compliance = await mk('compliance');
    await c.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, 10000000, 'ok')", [ws]);
    const line = synth();
    await c.query(`INSERT INTO phone_number (workspace_id, e164, series, carrier, kyc_status, a2p_status, status) VALUES ($1,$2,'trial','plivo','none','undeclared','active')`, [ws, line]);
    const agentId = (await one<{ id: string }>(c, "INSERT INTO agent (workspace_id, name, status) VALUES ($1, 'Riya', 'live') RETURNING id", [ws]))!.id;
    return { ws, owner, compliance, line, agentId };
  });
}
const member = (ws: string, id: string, role: 'owner' | 'compliance') => ({ workspaceId: ws, actor: { type: 'member', id, role } as Actor });

test('a member verifies their phone in the product: one Call API request, the signed answer URL speaks the code, confirm', { skip }, async () => {
  const w = await workspace();
  const mine = synth();
  process.env.VP_TELEPHONY_ALLOWED_TO = mine;
  const before = seen.length;
  const s = await registry.execute<{ ringing: boolean }>(pool, 'member.phone.verify_start', { phone: mine }, member(w.ws, w.owner, 'owner'));
  assert.ok(s.status === 'confirmed' && s.result.ringing, JSON.stringify(s));
  assert.equal(seen.length, before + 1, 'exactly one request to the carrier');
  const call = seen.at(-1)!;
  assert.equal(call.url, '/v1/Account/MAFAKEAUTHID/Call/');
  assert.deepEqual([call.body.to, call.body.from], [mine.slice(1), w.line.slice(1)], 'to the member, from the workspace\'s trial line, digits only');
  const answer = String(call.body.answer_url);
  assert.ok(answer.startsWith(local + '/hooks/telephony/plivo/speak/'));

  // Plivo fetches the answer URL, signed for the URL it was given.
  const xml = await (await plivoFetch(TOKEN, answer, answer, { CallUUID: 'cu-1', From: w.line, To: mine, CallStatus: 'in-progress', Direction: 'outbound' })).text();
  const code = /code is: ((?:\d ){5}\d)/.exec(xml)?.[1].replace(/ /g, '');
  assert.match(code ?? '', /^\d{6}$/, xml);
  const ok = await registry.execute<{ verified: boolean }>(pool, 'member.phone.verify_confirm', { phone: mine, code: code! }, member(w.ws, w.owner, 'owner'));
  assert.ok(ok.status === 'confirmed' && ok.result.verified, JSON.stringify(ok));
  assert.ok(await one(pool, 'SELECT 1 FROM verified_test_phone WHERE workspace_id = $1 AND member_id = $2 AND e164 = $3 AND verified_at IS NOT NULL', [w.ws, w.owner, mine]));
});

test('staff mark a carrier-verified phone: no workspace role and no system path can; audited without the number; a test call then rings it', { skip }, async () => {
  const w = await workspace();
  const phone = synth();
  process.env.VP_TELEPHONY_ALLOWED_TO = phone;
  const args = { memberId: w.owner, phone, evidence: 'verified in the carrier sandbox console, ticket SYN-1' };
  for (const ctx of [member(w.ws, w.owner, 'owner'), member(w.ws, w.compliance, 'compliance'), { workspaceId: w.ws, actor: { type: 'system', id: 'x' } as Actor },
    { workspaceId: w.ws, actor: { type: 'agent', id: 'operator' } as Actor }]) {
    const r = await registry.execute(pool, 'member.phone.mark_verified', args, ctx);
    assert.notEqual(r.status, 'confirmed', `${ctx.actor.type}/${ctx.actor.role}: ${JSON.stringify(r)}`);
  }
  assert.equal((await many(pool, 'SELECT 1 FROM verified_test_phone WHERE workspace_id = $1', [w.ws])).length, 0);
  const before = seen.length;
  const staff = { workspaceId: w.ws, actor: { type: 'vp_success', id: 'staff-synthetic-1' } as Actor };
  const r = await registry.execute<{ verified: boolean }>(pool, 'member.phone.mark_verified', args, staff);
  assert.ok(r.status === 'confirmed' && r.result.verified, JSON.stringify(r));
  assert.equal(seen.length, before, 'no call is placed');
  const audit = await many<{ actor_type: string; actor_id: string; payload: unknown }>(pool,
    "SELECT actor_type, actor_id, payload FROM audit_event WHERE workspace_id = $1 AND action = 'member.phone.marked_verified'", [w.ws]);
  assert.equal(audit.length, 1);
  assert.deepEqual([audit[0].actor_type, audit[0].actor_id], ['vp_success', 'staff-synthetic-1']);
  assert.ok(!JSON.stringify(audit[0].payload).includes(phone.slice(3)), 'the number is not in the audit payload');
  const other = await registry.execute(pool, 'member.phone.mark_verified', { ...args, memberId: w.compliance }, staff);
  assert.notEqual(other.status, 'confirmed', 'another member\'s phone stays theirs');

  // The marked phone now takes a test call: "Call my phone" queues an attempt to exactly that number.
  const v = (await one<{ id: string }>(pool, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, $2, $3) RETURNING id',
    [w.agentId, 'h-' + Math.random(), JSON.stringify({ agent: { category: 'service' } })]))!.id;
  const ring = await registry.execute<{ attemptId: string }>(pool, 'test.ring_member_phone', { agentVersionId: v, phone }, member(w.ws, w.owner, 'owner'));
  assert.ok(ring.status === 'confirmed', JSON.stringify(ring));
  const a = await one<{ to_e164: string; kind: string }>(pool, 'SELECT to_e164, kind FROM attempt WHERE id = $1', [ring.result.attemptId]);
  assert.deepEqual([a!.to_e164, a!.kind], [phone, 'test']);
});
