// Kernel tests against a real Postgres. Skipped when DATABASE_URL is unset.
// Each run uses fresh workspaces, so the suite is safe to repeat on the same database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { appendAudit, verifyAudit } from '../server/audit.ts';
import { Registry, UnknownOutcome, tool } from '../server/tools.ts';
import { buildApp } from '../server/app.ts';
import { num, obj, str, uuid } from '../shared/validate.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;

async function workspace(role: string = 'owner') {
  const ws = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('test ws') RETURNING id");
  const m = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, $3) RETURNING id", [ws!.id, `t${Math.random()}@example.test`, role]);
  return { ws: ws!.id, member: m!.id };
}

function registry() {
  const r = new Registry();
  r.register(tool(obj({ text: str({ max: 50 }) }), { name: 'note.add', risk: 'draft', summary: 'add a note',
    run: async (ctx, i) => (await ctx.q.query('INSERT INTO lesson (workspace_id, text) VALUES ($1,$2) RETURNING id', [ctx.workspaceId, i.text])).rows[0] }));
  r.register(tool(obj({ inrMilli: num({ int: true, min: 1 }) }), { name: 'wallet.topup', risk: 'spend', summary: 'add money',
    describe: i => `Add ₹${i.inrMilli / 1000} to the wallet`,
    version: async ctx => (await one<{ v: string }>(ctx.q, "SELECT coalesce(settings->>'v','0') AS v FROM workspace WHERE id = $1", [ctx.workspaceId]))!.v,
    run: async (ctx, i) => { await ctx.q.query('UPDATE wallet SET balance_inr_milli = balance_inr_milli + $2 WHERE workspace_id = $1', [ctx.workspaceId, i.inrMilli]); return { ok: true }; } }));
  r.register({ name: 'campaign.pause', risk: 'external', summary: 'pause', input: obj({ id: uuid() }), run: async () => ({ paused: true }) });
  r.register({ name: 'carrier.dial', risk: 'draft', summary: 'x', input: obj({}), run: async () => { throw new UnknownOutcome('carrier timed out'); } });
  return r;
}

before(async () => { if (!skip) pool = createPool(URL_); });
after(async () => { await pool?.end(); });

test('audit chain verifies and detects tampering', { skip }, async () => {
  const { ws } = await workspace();
  for (let i = 0; i < 3; i++) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); await appendAudit(c, { workspaceId: ws, actorType: 'system', action: 't.' + i, payload: { i } }); await c.query('COMMIT'); } finally { c.release(); }
  }
  assert.equal(await verifyAudit(pool, ws), null);
  await pool.query("UPDATE audit_event SET payload = '{\"i\":99}' WHERE workspace_id = $1 AND action = 't.1'", [ws]);
  assert.ok(await verifyAudit(pool, ws), 'an edited row breaks the chain');
});

test('A1 runs, rejects unknown fields, audits the change', { skip }, async () => {
  const { ws, member } = await workspace();
  const r = registry();
  const ok = await r.execute(pool, 'note.add', { text: 'hi' }, { workspaceId: ws, actor: { type: 'member', id: member, role: 'operator' } });
  assert.equal(ok.status, 'confirmed');
  const bad = await r.execute(pool, 'note.add', { text: 'hi', extra: 1 }, { workspaceId: ws, actor: { type: 'member', id: member, role: 'operator' } });
  assert.equal(bad.status, 'not_executed');
  assert.equal(bad.status === 'not_executed' && bad.path, 'extra');
  const n = await one<{ n: string }>(pool, "SELECT count(*) AS n FROM audit_event WHERE workspace_id = $1 AND action = 'note.add'", [ws]);
  assert.equal(n!.n, '1');
});

test('A2 is proposed, then runs once on a human approval; replays are refused', { skip }, async () => {
  const { ws, member } = await workspace('owner');
  const r = registry();
  const p = await r.execute(pool, 'wallet.topup', { inrMilli: 500000 }, { workspaceId: ws, actor: { type: 'agent', id: 'operator' } });
  assert.equal(p.status, 'needs_approval');
  if (p.status !== 'needs_approval') return;
  assert.match(p.summary, /₹500/);
  const before = await one<{ b: string }>(pool, 'SELECT balance_inr_milli AS b FROM wallet WHERE workspace_id = $1', [ws]);
  assert.equal(before, null, 'nothing ran yet (no wallet row was even needed)');
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1)', [ws]);
  const a = await r.approve(pool, p.actionId, { workspaceId: ws, memberId: member });
  assert.equal(a.status, 'confirmed');
  assert.equal(a.status === 'confirmed' && a.mode, 'A2');
  const again = await r.approve(pool, p.actionId, { workspaceId: ws, memberId: member });
  assert.equal(again.status, 'not_executed');
  const w = await one<{ b: string }>(pool, 'SELECT balance_inr_milli::text AS b FROM wallet WHERE workspace_id = $1', [ws]);
  assert.equal(w!.b, '500000');
  assert.equal(await verifyAudit(pool, ws), null);
});

test('A2 refuses a role that cannot approve, a tampered action, and a changed object', { skip }, async () => {
  const { ws } = await workspace();
  const op = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,'op@example.test','operator') RETURNING id", [ws]);
  const owner = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,'own@example.test','owner') RETURNING id", [ws]);
  const r = registry();
  const p1 = await r.execute(pool, 'wallet.topup', { inrMilli: 1000 }, { workspaceId: ws, actor: { type: 'agent' } });
  assert.equal(p1.status, 'needs_approval');
  if (p1.status !== 'needs_approval') return;
  const byOp = await r.approve(pool, p1.actionId, { workspaceId: ws, memberId: op!.id });
  assert.equal(byOp.status, 'not_executed', 'an operator cannot approve spend');

  await pool.query("UPDATE action SET args = '{\"inrMilli\": 99999999}' WHERE id = $1", [p1.actionId]);
  const tampered = await r.approve(pool, p1.actionId, { workspaceId: ws, memberId: owner!.id });
  assert.equal(tampered.status, 'not_executed');
  assert.match(tampered.status === 'not_executed' ? tampered.reason : '', /hash/);

  const p2 = await r.execute(pool, 'wallet.topup', { inrMilli: 2000 }, { workspaceId: ws, actor: { type: 'agent' } });
  if (p2.status !== 'needs_approval') return assert.fail('expected a proposal');
  await pool.query(`UPDATE workspace SET settings = '{"v":"2"}' WHERE id = $1`, [ws]);
  const changed = await r.approve(pool, p2.actionId, { workspaceId: ws, memberId: owner!.id });
  assert.equal(changed.status, 'not_executed');
  const st = await one<{ status: string }>(pool, 'SELECT status FROM action WHERE id = $1', [p2.actionId]);
  assert.equal(st!.status, 'cancelled');
});

test('A3 verbs run at once only for VP itself; a member still needs approval', { skip }, async () => {
  const { ws, member } = await workspace();
  const r = registry();
  const id = '00000000-0000-4000-8000-000000000001';  // campaign.pause here is 'external', so a member gets a card
  const sys = await r.execute(pool, 'campaign.pause', { id }, { workspaceId: ws, actor: { type: 'system' } });
  assert.equal(sys.status === 'confirmed' && sys.mode, 'A3');
  const mem = await r.execute(pool, 'campaign.pause', { id }, { workspaceId: ws, actor: { type: 'member', id: member, role: 'owner' } });
  assert.equal(mem.status, 'needs_approval');
});

test('roles gate who may call a tool', { skip }, async () => {
  const { ws, member } = await workspace('viewer');
  const r = registry();
  const v = await r.execute(pool, 'note.add', { text: 'x' }, { workspaceId: ws, actor: { type: 'member', id: member, role: 'viewer' } });
  assert.equal(v.status, 'not_executed');
  const noRole = await r.execute(pool, 'note.add', { text: 'x' }, { workspaceId: ws, actor: { type: 'member', id: member } });
  assert.equal(noRole.status, 'not_executed');
});

test('an unknown outcome is reported as unknown and still audited', { skip }, async () => {
  const { ws } = await workspace();
  const r = registry();
  const u = await r.execute(pool, 'carrier.dial', {}, { workspaceId: ws, actor: { type: 'system' } });
  assert.equal(u.status, 'unknown');
  const n = await one<{ n: string }>(pool, "SELECT count(*) AS n FROM audit_event WHERE workspace_id = $1 AND payload->>'outcome' = 'unknown'", [ws]);
  assert.equal(n!.n, '1');
});

test('HTTP: signup, session, tool call, approval card, decide', { skip }, async () => {
  const reg = registry();
  const { server } = buildApp(pool, [{ name: 't', register: (r: Registry) => { for (const t of reg.list()) r.register(reg.get(t.name)!); } }]);
  await new Promise<void>(res => server.listen(0, res));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const email = `owner${Date.now()}@example.test`;
    const s = await fetch(base + '/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace: 'Acme', name: 'A', email, password: 'correct horse battery' }) });
    assert.equal(s.status, 201);
    const cookie = s.headers.get('set-cookie')!.split(';')[0];
    const h = { 'content-type': 'application/json', cookie };

    const me = await (await fetch(base + '/v1/me', { headers: { cookie } })).json();
    assert.equal(me.member.role, 'owner');

    const unknownField = await fetch(base + '/v1/tools/note.add', { method: 'POST', headers: h, body: JSON.stringify({ args: { text: 'x', nope: 1 } }) });
    assert.equal(unknownField.status, 422);

    const formPost = await fetch(base + '/v1/tools/note.add', { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'args=1' });
    assert.equal(formPost.status, 415, 'cookie-authenticated mutations must be JSON');

    const card = await fetch(base + '/v1/tools/wallet.topup', { method: 'POST', headers: h, body: JSON.stringify({ args: { inrMilli: 7000 } }) });
    assert.equal(card.status, 202);
    const c = await card.json();
    const d = await fetch(base + `/v1/actions/${c.actionId}/decide`, { method: 'POST', headers: h, body: JSON.stringify({ approve: true }) });
    assert.equal(d.status, 200);

    const v = await (await fetch(base + '/v1/audit/verify', { headers: { cookie } })).json();
    assert.equal(v.intact, true);

    const bad = await fetch(base + '/v1/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong password!' }) });
    assert.equal(bad.status, 401);
    const anon = await fetch(base + '/v1/tools');
    assert.equal(anon.status, 401);
  } finally { server.close(); }
});

test('ledger: holds count against the wallet and caps; settle spends once', { skip }, async () => {
  const { reserve, settle, release } = await import('../server/ledger.ts');
  const { ws } = await workspace();
  await pool.query('INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, 10000, $2)', [ws, 'ok']);
  const camp = '00000000-0000-4000-8000-0000000000c1';
  await pool.query("INSERT INTO budget (workspace_id, scope_type, scope_id, cap_inr_milli) VALUES ($1,'campaign',$2,5000)", [ws, camp]);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const a = await reserve(c, { workspaceId: ws, inrMilli: 4000, campaignId: camp });
    assert.equal(a.ok, true);
    const b = await reserve(c, { workspaceId: ws, inrMilli: 2000, campaignId: camp });
    assert.deepEqual(b, { ok: false, cause: 'cap_reached', scope: 'campaign' });
    const d = await reserve(c, { workspaceId: ws, inrMilli: 7000 });
    assert.deepEqual(d, { ok: false, cause: 'wallet_low' }, 'held 4000 of 10000 leaves 6000');
    if (!a.ok) return;
    await settle(c, a.reservationId, 3000);
    await settle(c, a.reservationId, 3000);
    const e = await reserve(c, { workspaceId: ws, inrMilli: 2000, campaignId: camp });
    assert.equal(e.ok, true, 'cap 5000 - spent 3000 leaves 2000');
    if (e.ok) await release(c, e.reservationId);
    await c.query('COMMIT');
  } finally { c.release(); }
  const w = await one<{ b: string }>(pool, 'SELECT balance_inr_milli::text AS b FROM wallet WHERE workspace_id = $1', [ws]);
  assert.equal(w!.b, '7000');
});

test('a held draft (A0) cannot be approved by a role that may not approve drafts', { skip }, async () => {
  const { argsHash } = await import('../shared/approval.ts');
  const { ws } = await workspace();
  const viewer = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,'v@example.test','viewer') RETURNING id", [ws]);
  const r = registry();
  const args = { text: 'held' };
  const a = await one<{ id: string }>(pool, `INSERT INTO action (workspace_id, tool, args, args_hash, risk_class, status, expires_at)
    VALUES ($1,'note.add',$2,$3,'draft','proposed', now() + interval '1 hour') RETURNING id`, [ws, JSON.stringify(args), argsHash('note.add', args)]);
  const v = await r.approve(pool, a!.id, { workspaceId: ws, memberId: viewer!.id });
  assert.equal(v.status, 'not_executed');
});

test('jobs: next IST wall-clock time and single-runner locking', { skip }, async () => {
  const { msUntilIst, runOnce } = await import('../server/jobs.ts');
  const now = Date.UTC(2026, 9, 21, 18, 0);               // 23:30 IST
  assert.equal(msUntilIst('00:00', now), 30 * 60_000);
  assert.equal(msUntilIst('23:00', now), 23.5 * 3600_000);
  let n = 0;
  const job = { name: 'test.lock', run: async () => { n++; await new Promise(r => setTimeout(r, 50)); } };
  const deps = { pool, registry: new Registry(), auth: async () => { throw new Error('x'); } };
  const [a, b] = await Promise.all([runOnce(job, deps), runOnce(job, deps)]);
  assert.deepEqual([a, b].sort(), ['locked', 'ran']);
  assert.equal(n, 1);
});
