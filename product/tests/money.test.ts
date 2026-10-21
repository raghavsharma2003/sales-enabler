// Money module tests against a real Postgres (skipped without DATABASE_URL). Fresh workspaces per test, so the suite
// is safe to repeat on the same database. All data is synthetic.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, many, one, tx } from '../server/db.ts';
import { release, reserve, settle } from '../server/ledger.ts';
import { Registry } from '../server/tools.ts';
import { verifyAudit } from '../server/audit.ts';
import { jobs, module as moneyModule, register, runMoneyJobs } from '../server/modules/money/index.ts';
import { computeCard } from '../server/modules/money/prices.ts';
import { FakeGateway, RazorpayGateway, setGateway, type PaymentGateway } from '../server/modules/money/gateway.ts';
import { resolveTopups } from '../server/modules/money/topup.ts';
import { sweepHolds } from '../server/modules/money/sweep.ts';
import { reconcileStale } from '../server/modules/campaigns/worker.ts';
import { estimate, margin, marginCheck, reconcile, rollPeriods, setWalletBlocked, walletView } from '../server/modules/money/money.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;

before(async () => {
  if (skip) return;
  process.env.PG_POOL_MAX ??= '20';
  pool = createPool(URL_);
  reg = new Registry();
  register(reg);
});
after(async () => { await pool?.end(); });

async function workspace(balance = 0) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('money test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  await pool.query('INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1,$2)', [ws, balance]);
  return { ws, owner };
}
const ownerActor = (id: string) => ({ type: 'member' as const, id, role: 'owner' as const });
const bal = async (ws: string) => one<{ b: string; state: string }>(pool, 'SELECT balance_inr_milli::text AS b, state FROM wallet WHERE workspace_id = $1', [ws]);
const run = <T>(fn: (c: pg.PoolClient) => Promise<T>) => tx(pool, fn);

async function attempt(ws: string, campaignName?: string) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1, $2) RETURNING id", [ws, '+91900000' + String(Math.floor(Math.random() * 1e4)).padStart(4, '0')]))!.id;
  const campaign = campaignName
    ? (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,$2,'service') RETURNING id", [ws, campaignName]))!.id
    : null;
  const a = (await one<{ id: string }>(pool, 'INSERT INTO attempt (workspace_id, campaign_id, contact_id) VALUES ($1,$2,$3) RETURNING id', [ws, campaign, contact]))!.id;
  return { attemptId: a, campaignId: campaign };
}

// ---------------------------------------------------------------- cost card and estimate

test('the seeded cost card equals the code that generated it (no drift)', { skip }, async () => {
  const db = await many<{ stack_id: string; component: string; m: string; c: string; source: string }>(pool,
    'SELECT stack_id, component, inr_micro_per_min::text AS m, inr_micro_per_call::text AS c, source FROM cost_card WHERE active ORDER BY stack_id, component');
  const code = computeCard().map(r => ({ stack_id: r.stackId, component: r.component, m: String(r.inrMicroPerMin), c: String(r.inrMicroPerCall), source: r.source }))
    .sort((a, b) => (a.stack_id + a.component).localeCompare(b.stack_id + b.component));
  assert.deepEqual(db.map(r => ({ ...r })).sort((a, b) => (a.stack_id + a.component).localeCompare(b.stack_id + b.component)), code);
  assert.ok(db.every(r => r.source.length > 10), 'every row names its source');
});

test('estimate matches hand-computed values from catalog prices', { skip }, async () => {
  // v2-flashlite, by hand (INR/min): ears (Azure Speech) $1/60 per min x 0.5 gated x 95 = 0.791667; brain 4 x (2000 x 0.30 + 60 x 2.50)/1e6 $ x 95 = 0.285;
  // voice 6 $/1M x 25 tok/s x 30 s / 1e6 x 95 = 0.4275; telephony 0.38; platform 0.03; analysis 0.06  =>  1.974167/min.
  // Per call: half a 60 s pulse at 0.38 = 0.19.  100 min over 50 calls = 197.4167 + 9.50 = 206.9167 => 206917 milli.
  const e = await estimate(pool, { stackId: 'v2-flashlite', minutes: 100, calls: 50 });
  assert.equal(e.perMinuteInrMilli, 1974);
  assert.equal(e.totalInrMilli, 206917);
  assert.equal(e.price.status, 'not_set');
  assert.match(e.basis, /not a customer price/);
  // sarvam-india: ears 0.5 x 0.5 = 0.25; brain 4 x (2000 x 15 + 60 x 60)/1e6 = 0.1344; voice 450 chars x ₹2000/1M = 0.90;
  // + 0.38 + 0.03 + 0.06 = 1.7544/min; 10 min, 0 calls = 17.544 => 17544 milli.
  const s = await estimate(pool, { stackId: 'sarvam-india', minutes: 10, calls: 0 });
  assert.equal(s.perMinuteInrMilli, 1754);
  assert.equal(s.totalInrMilli, 17544);
  // v2-mai voice: 450 chars x $22/1M x 95 = 0.9405; total 0.791667 + 0.285 + 0.9405 + 0.47 = 2.487167 => 2487 milli/min.
  assert.equal((await estimate(pool, { stackId: 'v2-mai', minutes: 1, calls: 0 })).perMinuteInrMilli, 2487);
  // v2-live: the report's 5.72 AI/min + 0.47 = 6.19/min.
  assert.equal((await estimate(pool, { stackId: 'v2-live', minutes: 1, calls: 0 })).perMinuteInrMilli, 6190);
});

test('money.estimate as a tool: read, unknown stacks refused, no default stack', { skip }, async () => {
  const { ws, owner } = await workspace();
  const ok = await reg.execute(pool, 'money.estimate', { stackId: 'v2-54mini', minutes: 3, calls: 1 }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(ok.status, 'confirmed');
  // by hand: 0.791667 + 4 x (1500 + 270)/1e6 x 95 = 0.6726 + 0.4275 + 0.47 = 2.361767/min; x3 + 0.19 = 7.275301 => 7275 milli
  assert.equal(ok.status === 'confirmed' && (ok.result as { totalInrMilli: number }).totalInrMilli, 7275);
  const bad = await reg.execute(pool, 'money.estimate', { stackId: 'nope', minutes: 1, calls: 1 }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(bad.status, 'not_executed');
  const none = await reg.execute(pool, 'money.estimate', { stackId: '', minutes: 1, calls: 1 }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(none.status, 'not_executed');
});

test('price card is empty by default; margin logic is ready but inactive', { skip }, async () => {
  const n = await one<{ n: string }>(pool, 'SELECT count(*)::text AS n FROM price_card WHERE active');
  assert.equal(n!.n, '0');
  const plans = await many<{ id: string; p: string | null }>(pool, 'SELECT id, per_min_inr_milli::text AS p FROM money_plan ORDER BY id');
  assert.deepEqual(plans.map(p => p.p), [null, null, null]);
  // 3.49 price, 2.10 COGS, 2% fee: (3.49 x 0.98 - 2.10)/3.49 = 0.3783
  assert.ok(Math.abs(margin(3490, 2100) - 0.3783) < 0.0005);
  const m = marginCheck(3490, 2100, 2460);
  assert.equal(m.active, false);
  assert.equal(m.passes, true);
});

// ---------------------------------------------------------------- the ledger under the money module

test('50 parallel reservations under one cap never overrun it', { skip }, async () => {
  const { ws } = await workspace(100_000_000);               // ₹1,00,000 in the wallet
  await pool.query("INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli) VALUES ($1,'workspace','total',1000000)", [ws]);   // ₹1,000 cap
  const each = 27_920;                                       // 480 s at ₹3.49/min
  const results = await Promise.all(Array.from({ length: 50 }, () => run(c => reserve(c, { workspaceId: ws, inrMilli: each }))));
  const ok = results.filter(r => r.ok).length;
  assert.equal(ok, Math.floor(1_000_000 / each), '35 fit, the 36th would overrun');
  assert.ok(results.filter(r => !r.ok).every(r => !r.ok && r.cause === 'cap_reached'));
  const held = await one<{ s: string }>(pool, "SELECT sum(inr_milli)::text AS s FROM reservation WHERE workspace_id = $1 AND status = 'held'", [ws]);
  assert.ok(Number(held!.s) <= 1_000_000);
});

test('50 parallel reservations against a small wallet never overdraw it', { skip }, async () => {
  const { ws } = await workspace(100_000);                   // ₹100
  const results = await Promise.all(Array.from({ length: 50 }, () => run(c => reserve(c, { workspaceId: ws, inrMilli: 7_000 }))));
  assert.equal(results.filter(r => r.ok).length, 14);        // 14 x 7,000 = 98,000 <= 100,000
  assert.ok(results.filter(r => !r.ok).every(r => !r.ok && r.cause === 'wallet_low'));
});

test('settling twice is a no-op', { skip }, async () => {
  const { ws } = await workspace(5_000_000);
  const b = (await one<{ id: string }>(pool, "INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli) VALUES ($1,'workspace','monthly',3000000) RETURNING id", [ws]))!.id;
  const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 27_920 }));
  assert.ok(r.ok);
  if (!r.ok) return;
  await run(c => settle(c, r.reservationId, 6_000));
  await run(c => settle(c, r.reservationId, 6_000));
  await Promise.all([run(c => settle(c, r.reservationId, 9_999)), run(c => settle(c, r.reservationId, 9_999))]);
  assert.equal((await bal(ws))!.b, String(5_000_000 - 6_000));
  const spent = await one<{ s: string }>(pool, 'SELECT spent_inr_milli::text AS s FROM budget WHERE id = $1', [b]);
  assert.equal(spent!.s, '6000');
});

test('release returns the hold; nothing is spent', { skip }, async () => {
  const { ws } = await workspace(50_000);
  const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 40_000 }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal((await walletView(pool, ws)).availableInrMilli, 10_000);
  const blocked = await run(c => reserve(c, { workspaceId: ws, inrMilli: 20_000 }));
  assert.equal(!blocked.ok && blocked.cause, 'wallet_low');
  await run(c => release(c, r.reservationId));
  await run(c => release(c, r.reservationId));
  const w = await walletView(pool, ws);
  assert.equal(w.availableInrMilli, 50_000);
  assert.equal(w.heldInrMilli, 0);
  assert.equal((await bal(ws))!.b, '50000');
  assert.ok((await run(c => reserve(c, { workspaceId: ws, inrMilli: 20_000 }))).ok);
});

// ---------------------------------------------------------------- periods (IST)

test('daily caps reset at IST midnight, monthly at the IST month boundary, total never', { skip }, async () => {
  const { ws } = await workspace(10_000_000);
  const mk = (period: string, start: string) => one<{ id: string }>(pool,
    "INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli, spent_inr_milli, period_start) VALUES ($1,'workspace',$2,100000,100000,$3) RETURNING id", [ws, period, start]);
  const daily = (await mk('daily', '2026-10-31'))!.id, monthly = (await mk('monthly', '2026-10-01'))!.id, total = (await mk('total', '2026-10-01'))!.id;
  const spent = async (id: string) => (await one<{ s: string; p: string }>(pool, "SELECT spent_inr_milli::text AS s, to_char(period_start,'YYYY-MM-DD') AS p FROM budget WHERE id = $1", [id]))!;

  assert.equal(await rollPeriods(pool, ws, new Date('2026-10-31T18:29:59Z')), 0, '23:59:59 IST: nothing resets');
  assert.equal((await spent(daily)).s, '100000');
  // at the cap, a new hold is refused
  const refused = await run(c => reserve(c, { workspaceId: ws, inrMilli: 1 }));
  assert.equal(!refused.ok && refused.cause, 'cap_reached');

  assert.equal(await rollPeriods(pool, ws, new Date('2026-10-31T18:30:00Z')), 2, '00:00 IST on 1 Nov: daily and monthly reset');
  assert.deepEqual(await spent(daily), { s: '0', p: '2026-11-01' });
  assert.deepEqual(await spent(monthly), { s: '0', p: '2026-11-01' });
  assert.equal((await spent(total)).s, '100000');
  assert.equal(await rollPeriods(pool, ws, new Date('2026-11-01T10:00:00Z')), 0, 'rolling again the same IST day is a no-op');

  await pool.query('UPDATE budget SET spent_inr_milli = 50 WHERE id = ANY($1)', [[daily, monthly]]);
  assert.equal(await rollPeriods(pool, ws, new Date('2026-11-01T18:30:00Z')), 1, 'next IST midnight: only the daily cap');
  assert.equal((await spent(monthly)).s, '50');
  assert.equal((await spent(daily)).s, '0');
});

// ---------------------------------------------------------------- wallet states and issues

test('wallet states follow the balance; low raises one issue; ok resolves it; blocked is sticky', { skip }, async () => {
  const { ws } = await workspace(0);
  const st = async () => (await bal(ws))!.state;
  const issues = () => many<{ status: string; severity: string }>(pool, "SELECT status, severity FROM issue WHERE workspace_id = $1 AND category = 'wallet_low' ORDER BY created_at", [ws]);
  assert.equal(await st(), 'empty');
  await pool.query('UPDATE wallet SET balance_inr_milli = 500000 WHERE workspace_id = $1', [ws]);         // ₹500 < ₹1,000
  assert.equal(await st(), 'low');
  await pool.query('UPDATE wallet SET balance_inr_milli = 400000 WHERE workspace_id = $1', [ws]);
  assert.equal((await issues()).length, 1, 'one open issue, not one per change');
  await pool.query('UPDATE wallet SET balance_inr_milli = 2000000 WHERE workspace_id = $1', [ws]);
  assert.equal(await st(), 'ok');
  assert.deepEqual((await issues()).map(i => i.status), ['resolved']);
  // settle never charges above the hold (the kernel records the excess as VP's overrun), so a settle empties the
  // wallet at most; overdrawn comes from an adjustment such as a chargeback
  const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 2_000_000 }));
  assert.ok(r.ok);
  if (r.ok) await run(c => settle(c, r.reservationId, 2_100_000));
  assert.equal(await st(), 'empty');
  await pool.query('UPDATE wallet SET balance_inr_milli = -100000 WHERE workspace_id = $1', [ws]);
  assert.equal(await st(), 'overdrawn');
  assert.equal((await issues()).at(-1)!.severity, 'critical');
  await run(c => setWalletBlocked(c, ws, true));
  await pool.query('UPDATE wallet SET balance_inr_milli = 9000000 WHERE workspace_id = $1', [ws]);
  assert.equal(await st(), 'blocked', 'a top-up does not lift a block');
  const refused = await run(c => reserve(c, { workspaceId: ws, inrMilli: 1 }));
  assert.equal(!refused.ok && refused.cause, 'wallet_blocked');
  assert.equal(await run(c => setWalletBlocked(c, ws, false)), 'ok');
  // a workspace-specific threshold
  await pool.query('INSERT INTO money_settings (workspace_id, low_threshold_inr_milli) VALUES ($1, 10000000)', [ws]);
  await pool.query('UPDATE wallet SET updated_at = now() WHERE workspace_id = $1', [ws]);
  assert.equal(await st(), 'low');
});

// ---------------------------------------------------------------- tools

test('wallet.topup is A2: proposed, owner approves, the fake gateway captures, the wallet is credited', { skip }, async () => {
  const fake = new FakeGateway();
  setGateway(fake);
  const { ws, owner } = await workspace(0);
  const p = await reg.execute(pool, 'wallet.topup', { inrMilli: 1_234_567_890 }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(p.status, 'not_executed', 'over the per-top-up limit');
  const card = await reg.execute(pool, 'wallet.topup', { inrMilli: 123_456_780 }, { workspaceId: ws, actor: { type: 'agent', id: 'treasurer' } });
  assert.equal(card.status, 'needs_approval');
  if (card.status !== 'needs_approval') return;
  assert.equal(card.summary, 'Add ₹1,23,456.78 to the prepaid wallet');
  assert.equal((await bal(ws))!.b, '0', 'nothing moves before approval');
  const a = await reg.approve(pool, card.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(a.status, 'confirmed');
  assert.deepEqual((await bal(ws)), { b: '123456780', state: 'ok' });
  assert.equal(fake.charges.length, 1);

  fake.failNext = true;
  const c2 = await reg.execute(pool, 'wallet.topup', { inrMilli: 5000 }, { workspaceId: ws, actor: ownerActor(owner) });
  if (c2.status !== 'needs_approval') return assert.fail('expected a card');
  const f = await reg.approve(pool, c2.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(f.status === 'confirmed' && (f.result as { status: string }).status, 'failed');
  assert.equal((await bal(ws))!.b, '123456780');

  setGateway(new RazorpayGateway());
  const c3 = await reg.execute(pool, 'wallet.topup', { inrMilli: 5000 }, { workspaceId: ws, actor: ownerActor(owner) });
  if (c3.status !== 'needs_approval') return assert.fail('expected a card');
  const off = await reg.approve(pool, c3.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(off.status, 'not_executed');
  assert.match(off.status === 'not_executed' ? off.reason : '', /not switched on/);
  setGateway(fake);
  assert.equal(await verifyAudit(pool, ws), null);
});

test('wallet.credit: VP success only, with a reason, audited', { skip }, async () => {
  const { ws, owner } = await workspace(0);
  const byOwner = await reg.execute(pool, 'wallet.credit', { inrMilli: 1000, reason: 'goodwill credit' }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(byOwner.status, 'not_executed');
  const byAgent = await reg.execute(pool, 'wallet.credit', { inrMilli: 1000, reason: 'goodwill credit' }, { workspaceId: ws, actor: { type: 'agent' } });
  assert.equal(byAgent.status, 'not_executed');
  const noReason = await reg.execute(pool, 'wallet.credit', { inrMilli: 1000, reason: 'x' }, { workspaceId: ws, actor: { type: 'vp_success', id: 'vs-1' } });
  assert.equal(noReason.status, 'not_executed');
  const ok = await reg.execute(pool, 'wallet.credit', { inrMilli: 250_000, reason: 'VP-fault call credited (synthetic test)' }, { workspaceId: ws, actor: { type: 'vp_success', id: 'vs-1' } });
  assert.equal(ok.status, 'confirmed');
  assert.equal((await bal(ws))!.b, '250000');
  const au = await one<{ payload: { reason: string } }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'wallet.credit.manual'", [ws]);
  assert.equal(au!.payload.reason, 'VP-fault call credited (synthetic test)');
  assert.equal(await verifyAudit(pool, ws), null);
});

test('cap.raise is A2 and version-bound; cap.lower runs at once and only lowers', { skip }, async () => {
  const { ws, owner } = await workspace(0);
  const me = { workspaceId: ws, actor: ownerActor(owner) };
  const low = await reg.execute(pool, 'cap.lower', { scope: 'workspace', period: 'daily', capInrMilli: 500_000 }, me);
  assert.equal(low.status === 'confirmed' && low.mode, 'A1');
  const up = await reg.execute(pool, 'cap.lower', { scope: 'workspace', period: 'daily', capInrMilli: 900_000 }, me);
  assert.equal(up.status, 'not_executed', 'cap.lower cannot raise');
  const card = await reg.execute(pool, 'cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 2_000_000 }, me);
  if (card.status !== 'needs_approval') return assert.fail('expected a card');
  assert.equal(card.summary, 'Raise the daily workspace cap to ₹2,000');
  const stale = await reg.execute(pool, 'cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 3_000_000 }, me);
  await reg.execute(pool, 'cap.lower', { scope: 'workspace', period: 'daily', capInrMilli: 400_000 }, me);   // the cap changed under the card
  if (stale.status !== 'needs_approval') return assert.fail('expected a card');
  const s = await reg.approve(pool, stale.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(s.status, 'not_executed', 'a changed cap voids the approval');
  const card2 = await reg.execute(pool, 'cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 2_000_000 }, me);
  if (card2.status !== 'needs_approval') return assert.fail('expected a card');
  assert.equal((await reg.approve(pool, card2.actionId, { workspaceId: ws, memberId: owner })).status, 'confirmed');
  const caps = (await walletView(pool, ws)).caps;
  assert.equal(caps.length, 1);
  assert.equal(caps[0].capInrMilli, 2_000_000);
  const noScope = await reg.execute(pool, 'cap.lower', { scope: 'campaign', period: 'total', capInrMilli: 1 }, me);
  assert.equal(noScope.status, 'not_executed');
});

test('plan.change is A2 and the price stays honestly "not set"', { skip }, async () => {
  const { ws, owner } = await workspace(0);
  const card = await reg.execute(pool, 'plan.change', { planId: 'plus' }, { workspaceId: ws, actor: ownerActor(owner) });
  if (card.status !== 'needs_approval') return assert.fail('expected a card');
  const a = await reg.approve(pool, card.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(a.status, 'confirmed');
  const res = a.status === 'confirmed' ? a.result as { plan: string; was: string; price: { status: string } } : null;
  assert.deepEqual([res?.plan, res?.was, res?.price.status], ['plus', 'base', 'not_set']);
  const bogus = await reg.execute(pool, 'plan.change', { planId: 'gold' }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(bogus.status, 'not_executed');
});

test('invoice.get: cost lines by component, campaign and IST day, Indian grouping, price not set', { skip }, async () => {
  const { ws, owner } = await workspace(0);
  const { attemptId } = await attempt(ws, 'Renewal reminders (synthetic)');
  const ins = (component: string, milli: number, at: string, att: string | null = attemptId) => pool.query(
    "INSERT INTO cost_line (workspace_id, attempt_id, component, quantity, unit, inr_milli, created_at) VALUES ($1,$2,$3,60,'second',$4,$5)", [ws, att, component, milli, at]);
  await ins('telephony', 123_456_780, '2026-10-20T18:29:00Z');      // 23:59 IST on 20 Oct
  await ins('brain', 1_000, '2026-10-20T18:31:00Z');                // 00:01 IST on 21 Oct
  await ins('voice', 2_500, '2026-10-21T06:00:00Z', null);
  const r = await reg.execute(pool, 'invoice.get', { from: '2026-10-20', to: '2026-10-21' }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.equal(r.status, 'confirmed');
  if (r.status !== 'confirmed') return;
  const s = r.result as any;
  assert.equal(s.costInrMilli, 123_460_280);
  assert.equal(s.display.cost, '₹1,23,460.28');
  assert.deepEqual(s.byDay.map((d: any) => [d.key, d.costInrMilli]), [['2026-10-20', 123_456_780], ['2026-10-21', 3_500]]);
  assert.deepEqual(s.byCampaign.map((d: any) => [d.key, d.costInrMilli]).sort(), [['no campaign', 2_500], ['Renewal reminders (synthetic)', 123_457_780]].sort());
  assert.deepEqual(s.byComponent.map((d: any) => d.key), ['brain', 'telephony', 'voice']);
  assert.equal(s.price.status, 'not_set');
  assert.match(s.note, /not a tax invoice/);
  const only21 = await reg.execute(pool, 'usage.get', { groupBy: 'component', from: '2026-10-21', to: '2026-10-21' }, { workspaceId: ws, actor: ownerActor(owner) });
  assert.deepEqual(only21.status === 'confirmed' && (only21.result as any[]).map(x => x.key), ['brain', 'voice']);
});

test('reconciliation: matching charges pass; drift opens one issue per attempt', { skip }, async () => {
  const { ws } = await workspace(10_000_000);
  const good = await attempt(ws), bad = await attempt(ws), orphan = await attempt(ws), live = await attempt(ws);
  const hold = async (a: string, settleAt?: number) => {
    const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 30_000, attemptId: a }));
    if (r.ok && settleAt !== undefined) await run(c => settle(c, r.reservationId, settleAt));
  };
  const line = (a: string, m: number) => pool.query("INSERT INTO cost_line (workspace_id, attempt_id, component, quantity, unit, inr_milli) VALUES ($1,$2,'brain',1,'call',$3)", [ws, a, m]);
  await hold(good.attemptId, 7_000); await line(good.attemptId, 3_000); await line(good.attemptId, 4_000);
  await hold(bad.attemptId, 7_000); await line(bad.attemptId, 6_000);
  await line(orphan.attemptId, 500);
  await hold(live.attemptId); await line(live.attemptId, 100);       // still held: not judged yet
  const r = await run(c => reconcile(c, ws));
  assert.deepEqual(r.drift.map(d => [d.attemptId, d.cause]).sort(), [[bad.attemptId, 'mismatch'], [orphan.attemptId, 'cost_without_settle']].sort());
  assert.equal(r.issuesOpened, 2);
  assert.equal((await run(c => reconcile(c, ws))).issuesOpened, 0, 'a second run does not duplicate issues');
  const job = await runMoneyJobs(pool);
  assert.ok(job.drift >= 2);
});

test('tenancy: another workspace cannot read or change these rows', { skip }, async () => {
  const a = await workspace(1_000_000), b = await workspace(0);
  const { campaignId } = await attempt(a.ws, 'A only');
  await pool.query("INSERT INTO cost_line (workspace_id, component, quantity, unit, inr_milli) VALUES ($1,'voice',1,'call',777)", [a.ws]);
  await pool.query("INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli) VALUES ($1,'workspace','daily',5000)", [a.ws]);
  const asB = { workspaceId: b.ws, actor: ownerActor(b.owner) };
  const w = await reg.execute(pool, 'wallet.get', {}, asB);
  assert.equal(w.status === 'confirmed' && (w.result as any).balanceInrMilli, 0);
  assert.equal(w.status === 'confirmed' && (w.result as any).caps.length, 0);
  const u = await reg.execute(pool, 'invoice.get', {}, asB);
  assert.equal(u.status === 'confirmed' && (u.result as any).costInrMilli, 0);
  const steal = await reg.execute(pool, 'cap.lower', { scope: 'campaign', scopeId: campaignId, period: 'total', capInrMilli: 1 }, asB);
  assert.equal(steal.status, 'not_executed', "B cannot cap A's campaign");
  const aCaps = (await walletView(pool, a.ws)).caps;
  assert.deepEqual(aCaps.map(c => c.capInrMilli), [5000]);
  // B's owner cannot approve A's action
  const card = await reg.execute(pool, 'wallet.topup', { inrMilli: 5000 }, { workspaceId: a.ws, actor: ownerActor(a.owner) });
  if (card.status !== 'needs_approval') return assert.fail('expected a card');
  assert.equal((await reg.approve(pool, card.actionId, { workspaceId: b.ws, memberId: b.owner })).status, 'not_executed');
  assert.equal((await bal(a.ws))!.b, '1000000');
  assert.equal((await run(c => reconcile(c, b.ws))).checked, 0);
});

// ---------------------------------------------------------------- ledger gaps, proven here, fixed by the kernel (STATUS.json)
// Marked todo so the gate stays green while they wait on the kernel; each fails today.

test('ledger: settle above the hold never pushes a cap over its limit', { skip }, async () => {
  const { ws } = await workspace(10_000_000);
  const b = (await one<{ id: string }>(pool, "INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli) VALUES ($1,'workspace','total',30000) RETURNING id", [ws]))!.id;
  const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 27_920 }));
  if (!r.ok) return assert.fail('expected a hold');
  await run(c => settle(c, r.reservationId, 40_000));          // the runtime ran past the max duration it reserved for
  const s = await one<{ s: string }>(pool, 'SELECT spent_inr_milli::text AS s FROM budget WHERE id = $1', [b]);
  assert.ok(Number(s!.s) <= 30_000, `cap 30000 overrun: spent ${s!.s}`);
});

test('ledger: reserve sees a daily cap reset at IST midnight without waiting for the job', { skip }, async () => {
  const { ws } = await workspace(10_000_000);
  await pool.query("INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli, spent_inr_milli, period_start) VALUES ($1,'workspace','daily',1000,1000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 1)", [ws]);
  const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 500 }));
  assert.ok(r.ok, "yesterday's spend still counts against today's cap");
});

test('reconcile opens an overrun issue when a call cost more than its hold', { skip }, async () => {
  const { ws } = await workspace(10_000_000);
  const a = await attempt(ws);
  const r = await run(c => reserve(c, { workspaceId: ws, inrMilli: 30_000, attemptId: a.attemptId }));
  if (!r.ok) return assert.fail('expected a hold');
  await run(c => settle(c, r.reservationId, 40_000));              // charged 30,000; 10,000 is VP's overrun
  await pool.query("INSERT INTO cost_line (workspace_id, attempt_id, component, quantity, unit, inr_milli) VALUES ($1,$2,'telephony',600,'second',40000)", [ws, a.attemptId]);
  const out = await run(c => reconcile(c, ws));
  assert.deepEqual(out.drift.map(d => [d.cause, d.settledInrMilli, d.overrunInrMilli]), [['overrun', 30_000, 10_000]]);
  const iss = await one<{ detail: { cause: string; fix: string } }>(pool, "SELECT detail FROM issue WHERE workspace_id = $1 AND category = 'money_drift'", [ws]);
  assert.equal(iss!.detail.cause, 'overrun');
  assert.match(iss!.detail.fix, /reserved maximum/);
  assert.equal((await bal(ws))!.b, String(10_000_000 - 30_000), 'the customer pays only the hold');
});

test('the nightly job is returned from jobs(): IST midnight, runs roll + reconcile', { skip }, async () => {
  const js = jobs();
  assert.equal(moneyModule.jobs, jobs);
  assert.deepEqual(js.map(j => [j.name, j.dailyAtIst, j.everyMs]), [['money.nightly', '00:00', undefined], ['money.sweep', undefined, 300_000]]);
  for (const j of js) await j.run({ pool, registry: reg, auth: async () => { throw new Error('unused'); } });
});

// ---------------------------------------------------------------- review MA-08: a top-up reaches the gateway once per approval

test('MA-08: a gateway error after capture never leads to a second charge', { skip }, async () => {
  const { ws, owner } = await workspace(0);
  const charges: string[] = [];
  // captured at the gateway, then the response is lost: the adapter throws, and it cannot be asked afterwards
  const flaky: PaymentGateway = { name: 'review_flaky', enabled: true, charge: async c => { charges.push(c.idempotencyKey); throw new Error('socket hang up'); } };
  setGateway(flaky);
  try {
    const p = await reg.execute(pool, 'wallet.topup', { inrMilli: 500_000 }, { workspaceId: ws, actor: ownerActor(owner) });
    if (p.status !== 'needs_approval') return assert.fail('expected a card');
    const first = await reg.approve(pool, p.actionId, { workspaceId: ws, memberId: owner });
    assert.equal(first.status, 'unknown', 'the kernel records a lost gateway response as unknown');
    const second = await reg.approve(pool, p.actionId, { workspaceId: ws, memberId: owner });
    assert.notEqual(second.status, 'confirmed');
    assert.equal(charges.length, 1, 'one approval, one charge');
    assert.equal(charges[0], 'topup:' + p.actionId, 'the key is the action, not a fresh random one');
    const a = await one<{ status: string }>(pool, 'SELECT status FROM action WHERE id = $1', [p.actionId]);
    assert.equal(a!.status, 'unknown');
    const t = await one<{ status: string; credited_at: Date | null }>(pool, 'SELECT status, credited_at FROM wallet_topup WHERE action_id = $1', [p.actionId]);
    assert.deepEqual([t!.status, t!.credited_at], ['unknown', null]);
    assert.equal((await bal(ws))!.b, '0', 'nothing credited while the outcome is unknown');
    // the resolver cannot ask this gateway: it opens one issue, charges nothing
    const r1 = await resolveTopups(pool); const r2 = await resolveTopups(pool);
    assert.ok(r1.flagged >= 1); assert.equal(r2.flagged, 0);
    assert.equal(charges.length, 1);
  } finally { setGateway(new FakeGateway()); }
});

test('MA-08: an unknown capture is resolved against the gateway and credited once', { skip }, async () => {
  const fake = new FakeGateway();
  setGateway(fake);
  const { ws, owner } = await workspace(0);
  fake.loseNextResponse = true;
  const p = await reg.execute(pool, 'wallet.topup', { inrMilli: 700_000 }, { workspaceId: ws, actor: ownerActor(owner) });
  if (p.status !== 'needs_approval') return assert.fail('expected a card');
  const first = await reg.approve(pool, p.actionId, { workspaceId: ws, memberId: owner });
  assert.notEqual(first.status, 'confirmed');
  assert.equal((await reg.approve(pool, p.actionId, { workspaceId: ws, memberId: owner })).status, 'not_executed');
  assert.equal(fake.charges.length, 1);
  await resolveTopups(pool, new Date(), 0);                  // looks the key up (captured), then credits it
  await resolveTopups(pool, new Date(), 0);                  // a second pass changes nothing
  assert.equal((await bal(ws))!.b, '700000');
  assert.equal(fake.charges.length, 1, 'resolving never re-charges');
});

test('MA-08: a capture whose credit failed is credited by the resolver, and a re-tap does not charge again', { skip }, async () => {
  const fake = new FakeGateway();
  setGateway(fake);
  const { ws, owner } = await workspace(0);
  const p = await reg.execute(pool, 'wallet.topup', { inrMilli: 300_000 }, { workspaceId: ws, actor: ownerActor(owner) });
  if (p.status !== 'needs_approval') return assert.fail('expected a card');
  // the approval transaction fails after the capture (a later DB error): a registry whose wallet.topup throws after run()
  const real = reg.get('wallet.topup')!;
  const broken = new Registry();
  broken.register({ ...real, run: async (ctx, i, prep) => { await real.run(ctx, i, prep); throw new Error('db: connection lost after credit'); } });
  const first = await broken.approve(pool, p.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(first.status, 'not_executed');
  const t = await one<{ status: string; credited_at: Date | null }>(pool, 'SELECT status, credited_at FROM wallet_topup WHERE action_id = $1', [p.actionId]);
  assert.deepEqual([t!.status, t!.credited_at], ['captured', null], 'the capture is recorded even though the credit rolled back');
  const again = await reg.approve(pool, p.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(again.status, 'confirmed');
  assert.equal(fake.charges.length, 1, 'the re-tap reused the recorded capture');
  assert.equal((await bal(ws))!.b, '300000');
  assert.equal((await resolveTopups(pool, new Date(), 0)).credited, 0, 'already credited');
  assert.equal((await bal(ws))!.b, '300000');
});

// ---------------------------------------------------------------- review MA-09: holds that would never be released

test('MA-09: a hold whose dial was never confirmed is released and flagged once; late cost is charged, not dropped', { skip }, async () => {
  const { ws } = await workspace(1_000_000);                 // ₹1,000
  const { attemptId } = await attempt(ws);
  const b = (await one<{ id: string }>(pool, "INSERT INTO budget (workspace_id, scope_type, period, cap_inr_milli) VALUES ($1,'workspace','total',800000) RETURNING id", [ws]))!.id;
  const held = await run(c => reserve(c, { workspaceId: ws, inrMilli: 600_000, attemptId }));
  if (!held.ok) return assert.fail('expected a hold');
  // the worker claimed it two days ago and died before runtime.start: no call.ended will ever come
  await pool.query(`UPDATE attempt SET status = 'dialing', claimed_at = now() - interval '2 days', dialed_at = now() - interval '2 days', reservation_id = $2 WHERE id = $1`, [attemptId, held.reservationId]);
  assert.equal(await reconcileStale({ pool, registry: reg, workspaceId: ws }), 1, 'control: the attempt is now unknown');
  const swept = await run(c => sweepHolds(c, ws));
  assert.deepEqual(swept.map(s => [s.attemptId, s.reason]), [[attemptId, 'dispatch_unconfirmed']]);
  const r = await one<{ status: string; released_reason: string }>(pool, 'SELECT status, released_reason FROM reservation WHERE id = $1', [held.reservationId]);
  assert.deepEqual([r!.status, r!.released_reason], ['released', 'sweep:dispatch_unconfirmed']);
  assert.equal((await walletView(pool, ws)).availableInrMilli, 1_000_000, 'the money is usable again');
  assert.equal((await run(c => sweepHolds(c, ws))).length, 0);
  const iss = await many(pool, "SELECT 1 FROM issue WHERE workspace_id = $1 AND category = 'money_hold_released' AND subject_id = $2", [ws, attemptId]);
  assert.equal(iss.length, 1);
  // the call did happen after all: its cost arrives later and is charged under a new hold against the same cap
  await pool.query("INSERT INTO cost_line (workspace_id, attempt_id, component, quantity, unit, inr_milli) VALUES ($1,$2,'telephony',60,'second',4200)", [ws, attemptId]);
  const rec = await run(c => reconcile(c, ws));
  assert.deepEqual(rec.drift.map(d => d.cause), ['late_cost']);
  assert.equal((await bal(ws))!.b, String(1_000_000 - 4200));
  assert.equal((await one<{ s: string }>(pool, 'SELECT spent_inr_milli::text AS s FROM budget WHERE id = $1', [b]))!.s, '4200');
  assert.equal((await run(c => reconcile(c, ws))).drift.length, 0, 'charged once; the next run is clean');
});

test('MA-09: a runtime that goes silent past the longest call releases its hold; a live, recent call keeps it', { skip }, async () => {
  const { ws } = await workspace(5_000_000);
  const silent = await attempt(ws), live = await attempt(ws);
  const h1 = await run(c => reserve(c, { workspaceId: ws, inrMilli: 60_000, attemptId: silent.attemptId }));
  const h2 = await run(c => reserve(c, { workspaceId: ws, inrMilli: 60_000, attemptId: live.attemptId }));
  if (!h1.ok || !h2.ok) return assert.fail('expected holds');
  await pool.query("UPDATE attempt SET status = 'connected' WHERE id = ANY($1)", [[silent.attemptId, live.attemptId]]);
  await pool.query("INSERT INTO conversation (workspace_id, attempt_id, status) VALUES ($1,$2,'live'), ($1,$3,'live')", [ws, silent.attemptId, live.attemptId]);
  await pool.query("UPDATE reservation SET created_at = now() - interval '2 hours' WHERE id = $1", [h1.reservationId]);
  const later = new Date();
  assert.equal((await run(c => sweepHolds(c, ws, later))).length, 1);
  const st = await many<{ id: string; status: string }>(pool, 'SELECT id, status FROM reservation WHERE id = ANY($1)', [[h1.reservationId, h2.reservationId]]);
  assert.deepEqual(Object.fromEntries(st.map(x => [x.id, x.status])), { [h1.reservationId]: 'released', [h2.reservationId]: 'held' });
  // a campaign with a short max duration is judged by its own limit (30 s + 15 min grace)
  const { attemptId: shortA, campaignId } = await attempt(ws, 'short calls');
  await pool.query(`UPDATE campaign SET policy = '{"maxDurationS": 30}' WHERE id = $1`, [campaignId]);
  const h3 = await run(c => reserve(c, { workspaceId: ws, inrMilli: 1_000, attemptId: shortA }));
  if (!h3.ok) return assert.fail('expected a hold');
  await pool.query("UPDATE reservation SET created_at = now() - interval '20 minutes' WHERE id = $1", [h3.reservationId]);
  assert.equal((await run(c => sweepHolds(c, ws))).map(s => s.attemptId).join(), shortA);
});

test('a stack built from parts is priced from the same list prices: the default stack\'s parts cost the same as the default; every part is priceable', { skip }, async () => {
  const { customLines } = await import('../server/modules/money/money.ts');
  const { COMPONENTS } = await import('../shared/components.ts');
  const { requireStack, DEFAULT_STACK_ID } = await import('../shared/stacks.ts');
  const curated = await estimate(pool, { stackId: DEFAULT_STACK_ID, minutes: 100, calls: 50 });
  const built = await estimate(pool, { stackId: 'custom', minutes: 100, calls: 50, components: requireStack(DEFAULT_STACK_ID).components });
  assert.equal(built.perMinuteInrMilli, curated.perMinuteInrMilli, 'the same parts cost the same, built or curated');
  assert.equal(built.totalInrMilli, curated.totalInrMilli);
  const pick = (part: string) => COMPONENTS.filter(c => c.part === part).map(c => c.id);
  for (const ears of pick('ears')) for (const brain of pick('brain')) for (const voice of pick('voice')) {
    assert.doesNotThrow(() => customLines({ ears, brain, voice, gatedEars: true }), `${ears} + ${brain} + ${voice} must have a price`);
  }
  for (const s2s of pick('s2s')) assert.doesNotThrow(() => customLines({ s2s }), `${s2s} must have a price`);
  assert.throws(() => customLines({ ears: 'azure', brain: 'nope', voice: 'azure' }), /not a brain .* we offer/);
});
