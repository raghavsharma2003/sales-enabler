// Money, must-be audit gap C (bounded spend defaults): the default daily workspace cap refuses past the line and
// releases at IST midnight; campaign burst is off by default and turns on only by an owner's approval whose card names
// the line count and the ceiling, which the ledger then enforces.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, many, one, tx } from '../server/db.ts';
import { reserve, settle } from '../server/ledger.ts';
import { Registry } from '../server/tools.ts';
import { register as registerMoney } from '../server/modules/money/index.ts';
import { burstOf } from '../server/modules/money/burst.ts';
import { rollPeriods } from '../server/modules/money/money.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); reg = new Registry(); registerMoney(reg); });
after(async () => { await pool?.end(); });

async function signupLike(balance = 100_000_000) {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('burst (synthetic)') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `b${Math.random()}@example.test`]))!.id;
    await c.query('INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1,$2)', [ws, balance]);
    const camp = (await one<{ id: string }>(c, "INSERT INTO campaign (workspace_id, name, call_category, state) VALUES ($1,'Renewals (synthetic)','service','draft') RETURNING id", [ws]))!.id;
    return { ws, owner, camp };
  });
}
const asOwner = (ws: string, owner: string) => ({ workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } });

test('the default daily cap refuses a reservation over the line and releases at IST midnight', { skip }, async () => {
  const { ws } = await signupLike();
  const daily = await one<{ id: string; cap: string }>(pool, "SELECT id, cap_inr_milli::text AS cap FROM budget WHERE workspace_id = $1 AND period = 'daily'", [ws]);
  assert.equal(daily!.cap, '5000000', '₹5,000 a day by default');
  for (const amt of [1_900_000, 1_900_000]) {
    const h = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: amt }));
    if (!h.ok) return assert.fail('expected a hold');
    await tx(pool, c => settle(c, h.reservationId, amt));
  }
  const over = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 1_300_000 }));
  assert.equal(!over.ok && over.cause, 'cap_reached', '₹3,800 spent + ₹1,300 would pass ₹5,000');
  // the day ends in India: the cap's spend belongs to yesterday and the same hold now fits
  await pool.query("UPDATE budget SET period_start = period_start - 1 WHERE id = $1", [daily!.id]);
  assert.equal(await rollPeriods(pool, ws, new Date()), 1);
  const next = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 1_300_000 }));
  assert.ok(next.ok, 'after IST midnight the daily cap starts again');
  const raise = await reg.execute(pool, 'cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 15_000_000 }, asOwner(ws, (await one<{ id: string }>(pool, "SELECT id FROM member WHERE workspace_id = $1", [ws]))!.id));
  assert.equal(raise.status, 'needs_approval', 'raising it is an owner approval');
  assert.equal(raise.status === 'needs_approval' && raise.summary, 'Raise the daily workspace cap to ₹15,000');
});

test('burst is off by default and needs an approval whose card shows the lines and the ceiling', { skip }, async () => {
  const { ws, owner, camp } = await signupLike();
  const c0 = await one<{ policy: unknown; v: number }>(pool, 'SELECT policy, policy_version AS v FROM campaign WHERE id = $1', [camp]);
  assert.equal(burstOf(c0!.policy), null, 'off by default');
  assert.equal((await many(pool, "SELECT 1 FROM budget WHERE scope_type = 'campaign' AND scope_id = $1", [camp])).length, 0);
  const card = await reg.execute(pool, 'campaign.burst.set', { campaignId: camp, lines: 20, ceilingInrMilli: 1_500_000 }, asOwner(ws, owner));
  if (card.status !== 'needs_approval') return assert.fail('expected an approval card');
  assert.equal(card.risk, 'spend');
  assert.equal(card.summary, 'Let the campaign Renewals (synthetic) use up to 20 lines at once, holding at most ₹1,500 for its calls in progress');
  assert.equal(burstOf((await one<{ policy: unknown }>(pool, 'SELECT policy FROM campaign WHERE id = $1', [camp]))!.policy), null, 'nothing changes before the tap');
  const a = await reg.approve(pool, card.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(a.status, 'confirmed', JSON.stringify(a));
  const c1 = await one<{ policy: unknown; v: number }>(pool, 'SELECT policy, policy_version AS v FROM campaign WHERE id = $1', [camp]);
  assert.deepEqual([burstOf(c1!.policy)?.lines, burstOf(c1!.policy)?.ceilingInrMilli, c1!.v], [20, 1_500_000, c0!.v + 1]);
  // the ledger enforces the ceiling on this campaign's holds
  const h = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 1_000_000, campaignId: camp }));
  assert.ok(h.ok);
  const over = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 600_000, campaignId: camp }));
  assert.equal(!over.ok && over.cause, 'cap_reached', '₹1,000 + ₹600 held would pass the ₹1,500 ceiling');
  // off runs at once and removes the ceiling
  const off = await reg.execute<any>(pool, 'campaign.burst.off', { campaignId: camp }, asOwner(ws, owner));
  assert.equal(off.status === 'confirmed' && off.result.changed, true);
  assert.equal(burstOf((await one<{ policy: unknown }>(pool, 'SELECT policy FROM campaign WHERE id = $1', [camp]))!.policy), null);
});

test('a burst must go past the steady lines, within the factor, and under the workspace in-flight limit', { skip }, async () => {
  const { ws, owner, camp } = await signupLike();
  await pool.query('INSERT INTO dial_policy (workspace_id, concurrency) VALUES ($1, 10)', [ws]);
  const tryBurst = async (lines: number, ceil: number) => {
    const card = await reg.execute(pool, 'campaign.burst.set', { campaignId: camp, lines, ceilingInrMilli: ceil }, asOwner(ws, owner));
    if (card.status !== 'needs_approval') return card;
    return reg.approve(pool, card.actionId, { workspaceId: ws, memberId: owner });
  };
  const atSteady = await tryBurst(10, 1_000_000);
  assert.match(atSteady.status === 'not_executed' ? atSteady.reason : '', /steady limit is already 10 lines/);
  const tooMany = await tryBurst(31, 1_000_000);
  assert.match(tooMany.status === 'not_executed' ? tooMany.reason : '', /up to 30 lines/);
  const tooRich = await tryBurst(20, 3_000_000);
  assert.match(tooRich.status === 'not_executed' ? tooRich.reason : '', /in-flight limit of ₹2,000/);
  const other = await signupLike();
  const cross = await reg.execute(pool, 'campaign.burst.set', { campaignId: other.camp, lines: 20, ceilingInrMilli: 1_000_000 }, asOwner(ws, owner));
  if (cross.status === 'needs_approval') {
    const a = await reg.approve(pool, cross.actionId, { workspaceId: ws, memberId: owner });
    assert.equal(a.status, 'not_executed', 'another workspace\'s campaign cannot be burst');
  }
});
