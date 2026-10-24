// Money, walkthrough follow-ups (2026-10-23): the Vyakti staff credit path, the trial credit at workspace creation,
// user-facing copy that says Vyakti (S3), and blockers that name the wallet (S6). Postgres; synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, many, one, tx } from '../server/db.ts';
import { Registry } from '../server/tools.ts';
import { verifyAudit } from '../server/audit.ts';
import { register as registerMoney } from '../server/modules/money/index.ts';
import { module as campaigns, launchBlockers } from '../server/modules/campaigns/index.ts';
import { FakeTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import type { CampaignRow } from '../server/modules/campaigns/gate.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;

before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  reg = new Registry();
  registerMoney(reg);
  campaigns.register(reg);
  setTelephony(new FakeTelephony());
});
after(async () => { await pool?.end(); });

const email = () => `w${Math.random().toString(36).slice(2)}@example.test`;
/** A workspace made the way signup makes one: workspace, owner, then the wallet row. */
async function signupLike(ownerEmail = email()) {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('wallet test (synthetic)') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, ownerEmail]))!.id;
    await c.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
    return { ws, owner, ownerEmail };
  });
}
const bal = async (ws: string) => Number((await one<{ b: string }>(pool, 'SELECT balance_inr_milli::text AS b FROM wallet WHERE workspace_id = $1', [ws]))!.b);
const setTrial = (m: number) => pool.query('UPDATE money_config SET trial_credit_inr_milli = $1', [m]);
const staff = { type: 'vp_success' as const, id: 'staff-asha (synthetic)' };

// ---------------------------------------------------------------- 1. staff credit path

test('staff credit: Vyakti staff only, runs at once, audited with the reason, idempotent on its key', { skip }, async () => {
  const { ws, owner } = await signupLike();
  const args = { inrMilli: 250_000, reason: 'goodwill after a dropped call (synthetic)', idempotencyKey: 'ticket-4411-credit' };
  const byOwner = await reg.execute(pool, 'wallet.credit', args, { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } });
  assert.equal(byOwner.status, 'not_executed', 'no workspace role may credit a wallet');
  const noKey = await reg.execute(pool, 'wallet.credit', { inrMilli: 1000, reason: 'missing key here' }, { workspaceId: ws, actor: staff });
  assert.equal(noKey.status, 'not_executed', 'a staff credit needs an idempotency key');
  const first = await reg.execute(pool, 'wallet.credit', args, { workspaceId: ws, actor: staff });
  assert.equal(first.status === 'confirmed' && first.mode, 'A1', 'runs at once: no approval card');
  const retry = await reg.execute(pool, 'wallet.credit', args, { workspaceId: ws, actor: staff });
  assert.equal(retry.status === 'confirmed' && (retry.result as { status: string }).status, 'already_credited');
  const clash = await reg.execute(pool, 'wallet.credit', { ...args, inrMilli: 999_000 }, { workspaceId: ws, actor: staff });
  assert.equal(clash.status, 'not_executed', 'the same key with a different amount is refused, not applied');
  assert.equal(await bal(ws), 250_000, 'credited once');
  const au = await many<{ payload: { reason: string } }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'wallet.credit.manual'", [ws]);
  assert.deepEqual(au.map(a => a.payload.reason), [args.reason]);
  // another workspace may reuse the same ticket key
  const other = await signupLike();
  assert.equal((await reg.execute(pool, 'wallet.credit', args, { workspaceId: other.ws, actor: staff })).status, 'confirmed');
  assert.equal(await verifyAudit(pool, ws), null);
});

// ---------------------------------------------------------------- 2. trial credit at workspace creation

test('trial credit: default 0 adds nothing', { skip }, async () => {
  await setTrial(0);
  const { ws } = await signupLike();
  assert.equal(await bal(ws), 0);
  assert.equal((await many(pool, "SELECT 1 FROM wallet_topup WHERE workspace_id = $1", [ws])).length, 0);
});

test('trial credit: the configured amount is applied once per workspace, ledgered as trial credit', { skip }, async () => {
  await setTrial(500_000);                                  // ₹500, the blueprint's suggestion; the owner decides
  try {
    const { ws, ownerEmail } = await signupLike();
    assert.equal(await bal(ws), 500_000);
    const rows = await many<{ kind: string; inr: string }>(pool, "SELECT kind, inr_milli::text AS inr FROM wallet_topup WHERE workspace_id = $1", [ws]);
    assert.deepEqual(rows, [{ kind: 'trial_credit', inr: '500000' }]);
    const w = await reg.execute(pool, 'invoice.get', {}, { workspaceId: ws, actor: { type: 'system' } });
    assert.ok(w.status === 'confirmed' && (w.result as any).moneyIn.some((m: any) => m.kind === 'trial_credit' && m.label === 'Trial credit'));
    // a member joining adds nothing; the wallet row being written again adds nothing
    await pool.query("INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'operator')", [ws, email()]);
    await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
    await pool.query('UPDATE wallet SET updated_at = now() WHERE workspace_id = $1', [ws]);
    assert.equal(await bal(ws), 500_000);
    // re-creating a workspace for the same owner (after closing the first) gets no second trial
    await pool.query('DELETE FROM workspace WHERE id = $1', [ws]);
    const again = await signupLike(ownerEmail);
    assert.equal(await bal(again.ws), 0, 'one trial per owner, even across re-creation');
    assert.equal((await signupLike(ownerEmail.toUpperCase())).ws.length > 0 && await bal((await signupLike(' ' + ownerEmail)).ws), 0, 'case and spaces do not make a new owner');
  } finally { await setTrial(0); }
});

// ---------------------------------------------------------------- 3. copy says Vyakti (walkthrough S3)

test('copy: no "VP" in money\'s user-facing text', { skip }, async () => {
  const { ws } = await signupLike();
  const as = { workspaceId: ws, actor: { type: 'system' as const } };
  const outs = await Promise.all([
    reg.execute(pool, 'money.estimate', { stackId: 'v2-flashlite', minutes: 10, calls: 2 }, as),
    reg.execute(pool, 'money.card', { stackId: 'v2-flashlite' }, as),
    reg.execute(pool, 'wallet.get', {}, as),
    reg.execute(pool, 'invoice.get', {}, as),
    reg.execute(pool, 'wallet.check', { purpose: 'number_rent', needInrMilli: 59_000 }, as),
  ]);
  const summaries = reg.list().filter(t => /^(money|wallet|usage|invoice|cap|plan)\./.test(t.name)).map(t => t.summary);
  for (const text of [...outs.map(o => JSON.stringify(o)), ...summaries]) assert.doesNotMatch(text, /\bVP\b/, text.slice(0, 200));
  assert.match(JSON.stringify(outs[0]), /What Vyakti pays its providers/);
});

// ---------------------------------------------------------------- 4. blockers name the wallet (walkthrough S6)

test('wallet.check names the amount needed and the balance, with "Add money"', { skip }, async () => {
  const { ws } = await signupLike();
  const as = { workspaceId: ws, actor: { type: 'system' as const } };
  const r = await reg.execute(pool, 'wallet.check', { purpose: 'number_rent', needInrMilli: 59_000 }, as);
  if (r.status !== 'confirmed') return assert.fail('expected a result');
  const b = (r.result as any).blocker;
  assert.equal(b.code, 'wallet_short');
  assert.equal(b.message, 'Renting a number costs ₹59 a month; the wallet has ₹0.');
  assert.deepEqual(b.fix, { tool: 'wallet.topup', label: 'Add money', role: 'owner' });
  await pool.query('UPDATE wallet SET balance_inr_milli = 100000 WHERE workspace_id = $1', [ws]);
  const ok = await reg.execute(pool, 'wallet.check', { purpose: 'number_rent', needInrMilli: 59_000 }, as);
  assert.equal(ok.status === 'confirmed' && (ok.result as any).blocker, null);
});

test('number.search says when the wallet cannot pay the rent', { skip }, async () => {
  const { ws } = await signupLike();
  const r = await reg.execute(pool, 'number.search', { series: '1600' }, { workspaceId: ws, actor: { type: 'system' } });
  if (r.status !== 'confirmed') return assert.fail('expected offers');
  const res = r.result as { offers: unknown[]; walletBlocker?: { message: string; fix: { label: string } } | null };
  assert.ok(res.offers.length > 0);
  assert.equal(res.walletBlocker?.message, 'Renting a number costs ₹59 a month; the wallet has ₹0.');
  assert.equal(res.walletBlocker?.fix.label, 'Add money');
});

test('number.rent refuses on an empty wallet and names the wallet', { skip }, async () => {
  const { ws, owner } = await signupLike();
  const card = await reg.execute(pool, 'number.rent', { offerRef: 'fake:1600:0' }, { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } });
  if (card.status !== 'needs_approval') return assert.fail('expected a card');
  const a = await reg.approve(pool, card.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(a.status, 'not_executed');
  assert.match(a.status === 'not_executed' ? a.reason : '', /the wallet has ₹0.*Add money/);
  assert.equal((await many(pool, 'SELECT 1 FROM phone_number WHERE workspace_id = $1', [ws])).length, 0, 'nothing rented');
});

test('the launch blockers include the wallet, with the hold one call needs', { skip }, async () => {
  const { ws } = await signupLike();
  const c = (await one<CampaignRow>(pool, "INSERT INTO campaign (workspace_id, name, call_category, policy) VALUES ($1,'Renewals (synthetic)','service','{\"capInrMilli\": 1000000}') RETURNING *", [ws]))!;
  const blockers = await launchBlockers(pool, ws, c);
  const w = blockers.find(b => b.code === 'wallet_short');
  assert.ok(w, 'an empty wallet is a launch blocker: ' + blockers.map(b => b.code).join(','));
  assert.match(w!.message, /the wallet has ₹0/);
  assert.equal(w!.fix?.label, 'Add money');
  await pool.query('UPDATE wallet SET balance_inr_milli = 50000000 WHERE workspace_id = $1', [ws]);
  assert.equal((await launchBlockers(pool, ws, c)).find(b => b.code === 'wallet_short'), undefined);
});
