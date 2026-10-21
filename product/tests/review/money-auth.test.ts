// Adversarial review: approvals (A2), money, tenancy, secrets and hooks. Findings are in money-auth.md beside this file.
// Each test reproduces one finding and FAILS on the code it was written against; it is marked `todo` so CI stays green
// until the owning module fixes it (then drop the todo). Postgres tests skip without DATABASE_URL. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');
delete process.env.VP_WEBHOOK_ALLOW_PRIVATE;               // the SSRF check must run as in production
delete process.env.VP_WEBHOOK_ALLOW_HTTP;

import { obj } from '../../shared/validate.ts';
import { buildApp } from '../../server/app.ts';
import { createSession, newApiKey, resolveCaller } from '../../server/auth.ts';
import { createPool, one, tx } from '../../server/db.ts';
import type { Req } from '../../server/http.ts';
import { reserve } from '../../server/ledger.ts';
import { Registry, tool, type Actor } from '../../server/tools.ts';
import { register as registerMoney, module as moneyModule } from '../../server/modules/money/index.ts';
import { setGateway, type PaymentGateway } from '../../server/modules/money/gateway.ts';
import { reconcile } from '../../server/modules/money/money.ts';
import { reconcileStale } from '../../server/modules/campaigns/worker.ts';
import { registerApiKeys } from '../../server/modules/workspace/apikeys.ts';
import { registerMembers } from '../../server/modules/workspace/members.ts';
import { checkUrlShape, isPrivateAddress } from '../../server/modules/workspace/webhooks.ts';

const DB = process.env.DATABASE_URL;
const noDb = !DB ? 'DATABASE_URL not set' : false;
/** A finding's test: skipped without Postgres when it needs it, else a todo that names the finding. */
const finding = (todo: string, needsDb = true) => (needsDb && noDb ? { skip: noDb } : { todo });

let pool: pg.Pool;
let reg: Registry;

before(async () => {
  if (noDb) return;
  pool = createPool(DB);
  reg = new Registry();
  registerMoney(reg);
  registerApiKeys(reg);
  registerMembers(reg);
  // Stands in for the campaigns module's tool of the same name and risk class (campaigns/index.ts:581): the defect is in
  // the kernel's A3 rule, which keys on the tool name and the actor type only.
  reg.register(tool(obj({}), { name: 'attempt.retry_per_ladder', risk: 'external', summary: 're-dial a person per the retry ladder', run: async () => ({ dialled: true }) }));
});
after(async () => { await pool?.end(); });

async function workspace(balance = 0) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('review money-auth') RETURNING id"))!.id;
  const owner = await member(ws, 'owner');
  await pool.query('INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1,$2)', [ws, balance]);
  return { ws, owner };
}
async function member(ws: string, role: string) {
  return (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,$3,'active') RETURNING id",
    [ws, `${role}-${randomUUID().slice(0, 8)}@example.test`, role]))!.id;
}
const as = (id: string, role: Actor['role']): Actor => ({ type: 'member', id, role });

// ---------------------------------------------------------------- A2

test('MA-01: an Operator turn runs attempt.retry_per_ladder at once; a member asking directly gets an approval card', finding('MA-01: agent actor with a member role gets A3 on retry_per_ladder'), async () => {
  const { ws } = await workspace();
  const builder = await member(ws, 'builder');
  const direct = await reg.execute(pool, 'attempt.retry_per_ladder', {}, { workspaceId: ws, actor: as(builder, 'builder') });
  assert.equal(direct.status, 'needs_approval', 'control: the member path is held for a tap');
  // The Operator acts for that same member as { type: 'agent', id: 'operator:<member>', role } (operator/loop.ts:134).
  const viaOperator = await reg.execute(pool, 'attempt.retry_per_ladder', {}, { workspaceId: ws, actor: { type: 'agent', id: 'operator:' + builder, role: 'builder' } });
  assert.equal(viaOperator.status, 'needs_approval', `the Operator re-dialled a person without a tap (got ${viaOperator.status})`);
});

test('MA-02: member.remove runs on a stale card after the target was made an owner', {}, async () => {
  const { ws, owner } = await workspace();
  const op = await member(ws, 'operator');
  const target = await member(ws, 'builder');
  const proposed = await reg.execute(pool, 'member.remove', { memberId: target }, { workspaceId: ws, actor: as(op, 'operator') });
  assert.equal(proposed.status, 'needs_approval');
  const promote = await reg.execute(pool, 'member.role.set', { memberId: target, role: 'owner' }, { workspaceId: ws, actor: as(owner, 'owner') });
  assert.equal(promote.status, 'needs_approval');
  assert.equal((await reg.approve(pool, (promote as { actionId: string }).actionId, { workspaceId: ws, memberId: owner })).status, 'confirmed');
  // The card the owner now taps was shown for removing a builder; the person is an owner now.
  const r = await reg.approve(pool, (proposed as { actionId: string }).actionId, { workspaceId: ws, memberId: owner });
  assert.equal(r.status, 'not_executed', 'what was approved changed since it was proposed; the approval must be void');
});

test('MA-03: a viewer can cancel any pending approval, including an owner-only spend', finding('MA-03: decline has no role check'), async () => {
  const { ws, owner } = await workspace();
  const viewer = await member(ws, 'viewer');
  const p = await reg.execute(pool, 'plan.change', { planId: 'plus' }, { workspaceId: ws, actor: as(owner, 'owner') });
  assert.equal(p.status, 'needs_approval');
  const declined = await reg.decline(pool, (p as { actionId: string }).actionId, { workspaceId: ws, memberId: viewer });
  assert.equal(declined, false, 'a viewer approves nothing, so a viewer must not be able to decide (decline) either');
});

// ---------------------------------------------------------------- auth

test('MA-04: a session cookie accepts a CORS-safelisted text/plain body as JSON', finding('MA-04: json-only check is includes(), passes text/plain; x=application/json'), async () => {
  const { ws, owner } = await workspace();
  const s = await createSession(pool, owner);
  // A browser sends this content type from another origin with no preflight: its essence is text/plain.
  const req: Req = { method: 'POST', path: '/v1/tools/plan.change', params: {}, query: new URLSearchParams(), body: { args: { planId: 'plus' } },
    headers: { cookie: `vp_session=${s.token}`, 'content-type': 'text/plain; charset=application/json' } };
  await assert.rejects(resolveCaller(pool, req), (e: { status?: number }) => e.status === 415, `a cookie mutation passed with a text/plain body (workspace ${ws.slice(0, 8)})`);
});

test('MA-05: login throttling is keyed on the client-supplied x-forwarded-for, so rotating it never throttles', finding('MA-05: login throttle bypass by rotating x-forwarded-for'), async () => {
  const { server } = buildApp(pool, []);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const email = `victim-${randomUUID().slice(0, 8)}@example.test`;
    const s = await fetch(base + '/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
      body: JSON.stringify({ workspace: 'Throttle Co', name: 'Asha', email, password: 'correct horse battery' }) });
    assert.equal(s.status, 201);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch(base + '/v1/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${i}` },
        body: JSON.stringify({ email, password: 'wrong password ' + i }) });
      codes.push(r.status);
      await r.arrayBuffer();
    }
    assert.ok(codes.includes(429), `12 wrong passwords for one account were never throttled: ${codes.join(',')}`);
  } finally { await closeServer(server); }
});

test('MA-06: GET /v1/actions ignores API-key scopes', finding('MA-06: /v1/actions readable by any key regardless of scopes'), async () => {
  const { ws, owner } = await workspace();
  const p = await reg.execute(pool, 'plan.change', { planId: 'premium' }, { workspaceId: ws, actor: as(owner, 'owner') });
  assert.equal(p.status, 'needs_approval');
  const k = newApiKey();
  await pool.query("INSERT INTO api_key (workspace_id, name, prefix, hash, scopes) VALUES ($1,'narrow key',$2,$3,$4)", [ws, k.prefix, k.hash, ['wallet.get']]);
  const { server } = buildApp(pool, [moneyModule]);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const r = await fetch(base + '/v1/actions', { headers: { authorization: `Bearer ${k.token}` } });
    const body = await r.json() as { actions?: unknown[] };
    assert.ok(r.status === 403 || (body.actions ?? []).length === 0,
      `a key scoped to wallet.get read ${body.actions?.length} pending action(s) with their args`);
  } finally { await closeServer(server); }
});

// ---------------------------------------------------------------- money

test('MA-07: an API key\'s daily cap is stored but never enforced by the ledger', {}, async () => {
  const { ws, owner } = await workspace(10_000_000);        // ₹10,000 in the wallet
  const p = await reg.execute(pool, 'apikey.create', { name: 'capped key', dailyCapInrMilli: 1_000 }, { workspaceId: ws, actor: as(owner, 'owner') });
  assert.equal(p.status, 'needs_approval');
  const made = await reg.approve<{ id: string }>(pool, (p as { actionId: string }).actionId, { workspaceId: ws, memberId: owner });
  assert.equal(made.status, 'confirmed');
  const keyId = (made as { result: { id: string } }).result.id;
  const cap = await one<{ c: string }>(pool, 'SELECT daily_cap_inr_milli::text AS c FROM api_key WHERE id = $1', [keyId]);
  assert.equal(cap!.c, '1000', 'control: the ₹1 daily cap was stored on the key');
  // A ₹50 hold for an attempt made through that key (ledger.reserve with apiKeyId, as campaigns/gate.ts:279 calls it).
  const r = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 50_000, apiKeyId: keyId }));
  assert.equal(r.ok, false, 'a ₹50 hold passed under a key whose daily cap is ₹1');
});

test('MA-08: a gateway error after capture leaves the top-up approvable again, so the customer is charged twice', finding('MA-08: wallet.topup charges inside run(); a thrown charge rolls back and re-approval re-charges'), async () => {
  const { ws, owner } = await workspace();
  const charges: string[] = [];
  // The charge is captured at the gateway, then the response is lost (timeout, reset): the adapter throws.
  const flaky: PaymentGateway = { name: 'review_flaky', enabled: true, charge: async c => { charges.push(c.idempotencyKey); throw new Error('socket hang up'); } };
  setGateway(flaky);
  const p = await reg.execute(pool, 'wallet.topup', { inrMilli: 500_000 }, { workspaceId: ws, actor: as(owner, 'owner') });
  assert.equal(p.status, 'needs_approval');
  const id = (p as { actionId: string }).actionId;
  const first = await reg.approve(pool, id, { workspaceId: ws, memberId: owner });
  assert.notEqual(first.status, 'confirmed');
  const second = await reg.approve(pool, id, { workspaceId: ws, memberId: owner });
  assert.notEqual(second.status, 'confirmed');
  assert.equal(charges.length, 1, `the owner tapped approve twice and the gateway was charged ${charges.length} times, with different idempotency keys`);
});

test('MA-09: a hold whose dial was never confirmed is never released or flagged', finding('MA-09: reservations of unknown attempts leak; reconcile skips held'), async () => {
  const { ws } = await workspace(1_000_000);               // ₹1,000
  const contact = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id', [ws, '+9190000000' + String(Math.floor(Math.random() * 90) + 10)]))!.id;
  const attemptId = (await one<{ id: string }>(pool, 'INSERT INTO attempt (workspace_id, contact_id) VALUES ($1,$2) RETURNING id', [ws, contact]))!.id;
  const held = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 600_000, attemptId }));
  assert.ok(held.ok);
  const reservationId = (held as { reservationId: string }).reservationId;
  // The worker claimed it two days ago and died before runtime.start: no call.ended will ever come (worker.ts:250).
  await pool.query(`UPDATE attempt SET status = 'dialing', claimed_at = now() - interval '2 days', dialed_at = now() - interval '2 days', reservation_id = $2 WHERE id = $1`, [attemptId, reservationId]);
  const marked = await reconcileStale({ pool, registry: reg, workspaceId: ws });
  assert.equal(marked, 1, 'control: the attempt is now unknown');
  const rec = await reconcile(pool, ws);                   // what the nightly money job runs
  const r = await one<{ status: string }>(pool, 'SELECT status FROM reservation WHERE id = $1', [reservationId]);
  const flagged = rec.drift.some(d => d.attemptId === attemptId);
  assert.ok(r!.status !== 'held' || flagged, `₹600 stays held forever against the wallet and every cap, and no issue is opened (status ${r!.status})`);
});

// ---------------------------------------------------------------- webhooks

test('MA-10: an IPv4-mapped IPv6 address passes the webhook private-network check', {}, () => {
  // WHATWG URL rewrites [::ffff:169.254.169.254] to [::ffff:a9fe:a9fe]; isPrivateAddress only strips a dotted ::ffff: prefix.
  assert.equal(isPrivateAddress('::ffff:a9fe:a9fe'), true, 'cloud metadata address, IPv4-mapped');
  assert.throws(() => checkUrlShape('https://[::ffff:169.254.169.254]/latest/meta-data/'), /private network/);
  assert.throws(() => checkUrlShape('https://[::ffff:127.0.0.1]:5432/'), /private network/);
});

async function closeServer(server: Server) {
  await new Promise<void>(res => { server.close(() => res()); server.closeAllConnections?.(); });
}
