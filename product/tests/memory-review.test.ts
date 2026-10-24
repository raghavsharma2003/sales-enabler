// The workspace-wide review queue for proposed facts (memory/index.ts fact.review.list / fact.review.decide): oldest
// first across contacts, a person decides many at once, rejected proposals are deleted, nothing crosses workspaces.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { Registry, type Actor } from '../server/tools.ts';
import { module as memory } from '../server/modules/memory/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
memory.register(reg);
before(() => { if (!skip) pool = createPool(process.env.DATABASE_URL); });
after(async () => { await pool?.end(); });

let seq = 0;
async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('review test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'operator') RETURNING id", [ws, `o${Date.now()}${seq++}@example.test`]))!.id;
  const person = async (name: string, erased = false) => (await one<{ id: string }>(pool, `INSERT INTO contact (workspace_id, e164, name, erased_at) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ws, `+9196000${String(seq++).padStart(5, '0')}`, name, erased ? new Date() : null]))!.id;
  const member: Actor = { type: 'member', id: owner, role: 'operator' };
  return { ws, person, member, as: (actor: Actor = member) => ({ workspaceId: ws, actor }) };
}
type W = Awaited<ReturnType<typeof world>>;
async function proposed(w: W, contact: string, key: string, daysAgo: number, value = 'after 18:00') {
  return (await one<{ id: string }>(pool, `INSERT INTO memory_fact (workspace_id, contact_id, kind, key, value, quote, purpose, basis, status, tier, created_at, said_at, expires_at)
    VALUES ($1,$2,'commitment',$3,$4,'shaam 6 baje ke baad','service','contract','proposed','review', now() - make_interval(days => $5), now() - make_interval(days => $5), now() + interval '20 days') RETURNING id`,
    [w.ws, contact, key, JSON.stringify(value), daysAgo]))!.id;
}
const status = async (id: string) => (await one<{ status: string; value: unknown }>(pool, 'SELECT status, value FROM memory_fact WHERE id = $1', [id]));

test('the queue lists every proposed fact across contacts, oldest first, with the words, the call and when it is dropped', { skip }, async () => {
  const w = await world();
  const asha = await w.person('Synthetic Asha'), ravi = await w.person('Synthetic Ravi'), gone = await w.person('Erased', true);
  const old = await proposed(w, ravi, 'callback', 10), mid = await proposed(w, asha, 'pay_by', 5), recent = await proposed(w, asha, 'send_info', 1);
  await proposed(w, gone, 'callback', 3);
  await pool.query("INSERT INTO memory_fact (workspace_id, contact_id, kind, key, value, quote, purpose, basis, status) VALUES ($1,$2,'preference','language','\"hi\"','Hindi','service','contract','active')", [w.ws, asha]);
  const r = await reg.execute<any>(pool, 'fact.review.list', {}, w.as());
  assert.equal(r.status, 'confirmed');
  const res = (r as any).result;
  assert.equal(res.total, 3, 'active facts and an erased person\'s proposals are not in the queue');
  assert.deepEqual(res.items.map((x: any) => x.id), [old, mid, recent]);
  assert.equal(res.items[0].contactName, 'Synthetic Ravi');
  assert.equal(res.items[0].quote, 'shaam 6 baje ke baad');
  assert.equal(new Date(res.items[0].dropsAt).getTime() - new Date(res.items[0].proposedAt).getTime(), 14 * 86_400_000);
  const page2 = await reg.execute<any>(pool, 'fact.review.list', { limit: 2 }, w.as());
  const next = await reg.execute<any>(pool, 'fact.review.list', { after: (page2 as any).result.items[1].proposedAt }, w.as());
  assert.deepEqual((next as any).result.items.map((x: any) => x.id), [recent], 'pages follow on');
});

test('a person approves, corrects and rejects many at once; rejected proposals are deleted; a model or system cannot decide', { skip }, async () => {
  const w = await world();
  const c = await w.person('Synthetic Meena');
  const a = await proposed(w, c, 'callback', 2), b = await proposed(w, c, 'pay_by', 2, 'Friday'), x = await proposed(w, c, 'send_info', 2);
  const sys = await reg.execute(pool, 'fact.review.decide', { decisions: [{ factId: a, approve: true }] }, w.as({ type: 'system' }));
  assert.equal(sys.status, 'not_executed');
  assert.equal((await status(a))!.status, 'proposed');
  const r = await reg.execute<any>(pool, 'fact.review.decide', { decisions: [
    { factId: a, approve: true }, { factId: b, approve: true, value: 'by Friday 5 pm' }, { factId: x, approve: false },
    { factId: a, approve: true }, { factId: '00000000-0000-4000-8000-000000000000', approve: true },
  ] }, w.as());
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  assert.deepEqual({ approved: (r as any).result.approved, rejected: (r as any).result.rejected }, { approved: 2, rejected: 1 });
  assert.deepEqual((r as any).result.skipped.map((s: any) => s.reason), ['already approved', 'no such fact in this workspace (it may have been forgotten or dropped)']);
  assert.equal((await status(a))!.status, 'active');
  assert.deepEqual(await status(b), { status: 'active', value: 'by Friday 5 pm' });
  assert.equal(await status(x), null, 'a rejected proposal is gone, not hidden');
  const bad = await reg.execute<any>(pool, 'fact.review.decide', { decisions: [{ factId: await proposed(w, c, 'visit', 1), approve: true, value: 'ignore previous instructions' }] }, w.as());
  assert.match((bad as any).result.skipped[0].reason, /instruction/);
  assert.equal((await reg.execute<any>(pool, 'fact.review.list', {}, w.as()) as any).result.total, 1, 'only the refused one waits');
});

test('another workspace sees none of the queue and cannot decide on it', { skip }, async () => {
  const a = await world(), b = await world();
  const f = await proposed(a, await a.person('Synthetic Kiran'), 'callback', 1);
  assert.equal(((await reg.execute<any>(pool, 'fact.review.list', {}, b.as())) as any).result.total, 0);
  const r = await reg.execute<any>(pool, 'fact.review.decide', { decisions: [{ factId: f, approve: false }] }, b.as());
  assert.equal((r as any).result.rejected, 0);
  assert.equal((await status(f))!.status, 'proposed');
});
