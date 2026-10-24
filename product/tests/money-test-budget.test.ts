// Money, owner directive 2026-10-24 (calling-first-build-all): the daily test-call budget is a workspace cap. It defaults
// to ₹200 a day with ₹50 held per test call (a deployment may set the daily default), is respected at the line, resets at
// IST midnight, is raised only by an owner's approval, and calls reads it instead of its constant.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one, tx } from '../server/db.ts';
import { Registry } from '../server/tools.ts';
import { register as registerMoney } from '../server/modules/money/index.ts';
import { deploymentDefaultMilli, ensureTestCap, testBudget } from '../server/modules/money/test-budget.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); reg = new Registry(); registerMoney(reg); });
after(async () => { await pool?.end(); });

async function ws() {
  return tx(pool, async c => {
    const id = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('test budget (synthetic)') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [id, `t${Math.random()}@example.test`]))!.id;
    await c.query('INSERT INTO wallet (workspace_id) VALUES ($1)', [id]);
    return { ws: id, owner };
  });
}
/** A finished test call with its recorded cost, started at `at`. */
const testCall = (w: string, cost: number, at: string) => pool.query(
  "INSERT INTO conversation (workspace_id, channel, direction, status, cost_inr_milli, started_at, duration_s) VALUES ($1,'test','outbound','ended',$2,$3,120)", [w, cost, at]);

test('defaults: ₹200 a day and ₹50 held per test call; a deployment default applies to new workspaces only when set', { skip }, async () => {
  const a = await ws();
  const b = await testBudget(pool, a.ws);
  assert.deepEqual([b.capInrMilli, b.perCallInrMilli, b.spentTodayInrMilli, b.allowed], [200_000, 50_000, 0, true]);
  assert.equal(deploymentDefaultMilli({}), null, 'unset in production: the code default holds');
  assert.equal(deploymentDefaultMilli({ VP_TEST_BUDGET_DEFAULT_INR: '5000' }), 5_000_000);
  assert.equal(deploymentDefaultMilli({ VP_TEST_BUDGET_DEFAULT_INR: 'lots' }), null, 'nonsense is ignored, never zero');
  const staging = await ws();
  const c = await ensureTestCap(pool, staging.ws, { VP_TEST_BUDGET_DEFAULT_INR: '5000' });
  assert.deepEqual([c.cap, c.hold], [5_000_000, 50_000]);
  assert.equal((await ensureTestCap(pool, staging.ws, {})).cap, 5_000_000, 'set once, on first use; never rewritten');
});

test('the cap is respected at the line, and the hold respects the cap', { skip }, async () => {
  const { ws: w } = await ws();
  const noon = new Date('2026-10-24T06:30:00Z');                 // 12:00 IST
  await testCall(w, 100_000, '2026-10-24T04:00:00Z');              // 09:30 IST
  await testCall(w, 50_000, '2026-10-24T05:00:00Z');
  let b = await testBudget(pool, w, noon);
  assert.deepEqual([b.spentTodayInrMilli, b.remainingInrMilli, b.allowed], [150_000, 50_000, true], '₹150 + a ₹50 hold = ₹200: exactly at the line is allowed');
  await testCall(w, 1, '2026-10-24T05:30:00Z');
  b = await testBudget(pool, w, noon);
  assert.equal(b.allowed, false, 'one paisa over the line once the hold is counted');
  assert.match(b.reason!, /test budget is used up: ₹150\.00 of ₹200 spent.*holds? up to ₹50.*midnight IST/);
  assert.equal(b.calls.length, 3);
  assert.deepEqual(b.calls.map(c => c.display), ['₹0.00', '₹50.00', '₹100.00']);
});

test('it resets at IST midnight', { skip }, async () => {
  const { ws: w } = await ws();
  await testCall(w, 200_000, '2026-10-24T18:29:00Z');              // 23:59 IST on 24 Oct
  assert.equal((await testBudget(pool, w, new Date('2026-10-24T18:29:59Z'))).allowed, false, '23:59:59 IST: still used up');
  const next = await testBudget(pool, w, new Date('2026-10-24T18:30:00Z'));   // 00:00 IST on 25 Oct
  assert.deepEqual([next.spentTodayInrMilli, next.allowed], [0, true]);
  assert.equal(next.resetsAt, '2026-10-25T18:30:00.000Z');
});

test('raising it is an owner approval naming the amounts; lowering runs at once; a hold above the cap is refused', { skip }, async () => {
  const { ws: w, owner } = await ws();
  const me = { workspaceId: w, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const card = await reg.execute(pool, 'cap.raise', { scope: 'test', period: 'daily', capInrMilli: 2_000_000, perCallInrMilli: 150_000 }, me);
  if (card.status !== 'needs_approval') return assert.fail('expected a card');
  assert.equal(card.risk, 'spend');
  assert.equal(card.summary, 'Raise the daily test budget to ₹2,000, with up to ₹150 held per test call');
  assert.equal((await testBudget(pool, w)).capInrMilli, 200_000, 'nothing changes before the tap');
  const a = await reg.approve(pool, card.actionId, { workspaceId: w, memberId: owner });
  assert.equal(a.status, 'confirmed', JSON.stringify(a));
  assert.deepEqual([(await testBudget(pool, w)).capInrMilli, (await testBudget(pool, w)).perCallInrMilli], [2_000_000, 150_000]);
  const low = await reg.execute(pool, 'cap.lower', { scope: 'test', period: 'daily', capInrMilli: 1_000_000 }, me);
  assert.equal(low.status === 'confirmed' && low.mode, 'A1');
  const bad = await reg.execute(pool, 'cap.lower', { scope: 'test', period: 'daily', capInrMilli: 100_000, perCallInrMilli: 150_000 }, me);
  assert.equal(bad.status, 'not_executed', 'a test call cannot hold more than the day');
  const noScope = await reg.execute(pool, 'cap.lower', { scope: 'workspace', period: 'daily', capInrMilli: 1, perCallInrMilli: 2000 }, me);
  assert.equal(noScope.status, 'not_executed', 'a per-call hold is only for the test budget');
});

test('wallet.get shows the test budget beside the other caps with today\'s use; the ledger never counts it against real calls', { skip }, async () => {
  const { ws: w, owner } = await ws();
  await testCall(w, 12_340, new Date().toISOString());
  const r = await reg.execute<any>(pool, 'wallet.get', {}, { workspaceId: w, actor: { type: 'member', id: owner, role: 'owner' } });
  if (r.status !== 'confirmed') return assert.fail('expected the wallet');
  const t = r.result.caps.find((c: any) => c.scope === 'test');
  assert.deepEqual([t.label, t.capInrMilli, t.spentInrMilli], ['Daily test budget', 200_000, 12_340]);
  assert.equal(t.text, '₹12.34 of ₹200 used today on test calls; each test call holds up to ₹50. It resets at midnight India time.');
  assert.equal(r.result.testBudget.calls[0].display, '₹12.34');
  const inLedger = await one<{ n: string }>(pool, "SELECT count(*)::text AS n FROM budget WHERE workspace_id = $1 AND scope_type IN ('workspace','campaign','api_key') AND per_call_inr_milli IS NOT NULL", [w]);
  assert.equal(inLedger!.n, '0');
});
