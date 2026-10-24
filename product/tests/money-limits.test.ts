// Money, bounded defaults (must-be audit gap 17): every workspace gets a daily spend cap and a burst limit (money held
// at once) from config, enforced by the kernel's reserve(), and wallet.get states each in plain words.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, many, one, tx } from '../server/db.ts';
import { reserve, release, settle } from '../server/ledger.ts';
import { Registry } from '../server/tools.ts';
import { register as registerMoney } from '../server/modules/money/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); reg = new Registry(); registerMoney(reg); });
after(async () => { await pool?.end(); });

async function signupLike(balance = 0) {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('limits (synthetic)') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `l${Math.random()}@example.test`]))!.id;
    await c.query('INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1,$2)', [ws, balance]);
    return { ws, owner };
  });
}
const cfg = async () => (await one<{ d: string; b: string }>(pool, 'SELECT default_daily_cap_inr_milli::text AS d, default_burst_inr_milli::text AS b FROM money_config'))!;

test('a new workspace starts with the configured daily cap and burst limit, once', { skip }, async () => {
  const c = await cfg();
  assert.deepEqual([c.d, c.b], ['5000000', '2000000'], 'defaults: ₹5,000 a day, ₹2,000 held at once');
  const { ws } = await signupLike();
  const rows = await many<{ period: string; cap: string }>(pool, "SELECT period, cap_inr_milli::text AS cap FROM budget WHERE workspace_id = $1 AND scope_type = 'workspace' ORDER BY period", [ws]);
  assert.deepEqual(rows, [{ period: 'burst', cap: c.b }, { period: 'daily', cap: c.d }]);
  await pool.query('SELECT money_default_limits($1)', [ws]);
  assert.equal((await many(pool, 'SELECT 1 FROM budget WHERE workspace_id = $1', [ws])).length, 2, 'never doubled');
});

test('the burst limit bounds money held at once, and frees up as calls finish', { skip }, async () => {
  const { ws } = await signupLike(100_000_000);
  const r = (n: number) => tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: n }));
  const a = await r(1_500_000), b = await r(600_000);
  assert.ok(a.ok);
  assert.equal(!b.ok && b.cause, 'cap_reached', '₹1,500 + ₹600 held would pass the ₹2,000 burst limit');
  if (a.ok) await tx(pool, c => settle(c, a.reservationId, 400_000));
  const burst = await one<{ spent: string }>(pool, "SELECT spent_inr_milli::text AS spent FROM budget WHERE workspace_id = $1 AND period = 'burst'", [ws]);
  assert.equal(burst!.spent, '0', 'a burst limit never accumulates spend');
  const c2 = await r(1_900_000);
  assert.ok(c2.ok, 'once the first call settled, a large hold fits again');
  if (c2.ok) await tx(pool, c => release(c, c2.reservationId));
});

test('the daily default cap stops spend past ₹5,000 in an IST day', { skip }, async () => {
  const { ws } = await signupLike(100_000_000);
  for (let i = 0; i < 3; i++) {
    const h = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 1_500_000 }));
    if (!h.ok) return assert.fail('expected a hold at ' + i);
    await tx(pool, c => settle(c, h.reservationId, 1_500_000));
  }
  const over = await tx(pool, c => reserve(c, { workspaceId: ws, inrMilli: 600_000 }));
  assert.equal(!over.ok && over.cause, 'cap_reached', '₹4,500 spent + ₹600 would pass ₹5,000');
});

test('wallet.get states each limit in plain words; owners change them with cap tools', { skip }, async () => {
  const { ws, owner } = await signupLike(10_000_000);
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const w = await reg.execute<any>(pool, 'wallet.get', {}, as);
  if (w.status !== 'confirmed') return assert.fail('expected the wallet');
  const byPeriod = Object.fromEntries(w.result.caps.map((c: any) => [c.period, c]));
  assert.equal(byPeriod.daily.label, 'Workspace daily cap');
  assert.equal(byPeriod.daily.text, '₹0 of ₹5,000 spent today. New calls stop at the cap; calls already running finish. It resets at midnight India time.');
  assert.equal(byPeriod.burst.label, 'Workspace burst limit');
  assert.equal(byPeriod.burst.text, 'At most ₹2,000 can be held at once for calls in progress (₹0 now). New calls wait until running calls finish.');
  const lower = await reg.execute<any>(pool, 'cap.lower', { scope: 'workspace', period: 'burst', capInrMilli: 1_000_000 }, as);
  assert.equal(lower.status, 'confirmed');
  const raise = await reg.execute<any>(pool, 'cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 20_000_000 }, as);
  assert.equal(raise.status, 'needs_approval', 'raising stays an owner approval');
  assert.match(raise.status === 'needs_approval' ? raise.summary : '', /daily workspace cap to ₹20,000/);
});
