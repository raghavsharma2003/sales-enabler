// The money module's tools. Risk classes follow the blueprint registry (workspace.md section 5): top-ups, cap
// raises and plan changes are spend (A2, owner approves); lowering a cap only lowers risk, so it runs at once;
// reads are A1. A manual credit is VP success's alone, carries a reason, and is audited with it.
import { formatInr } from '../../../shared/money.ts';
import { bool, num, obj, opt, str, uuid, ValidationError } from '../../../shared/validate.ts';
import type { Module } from '../../app.ts';
import type { Job } from '../../jobs.ts';
import { appendAudit } from '../../audit.ts';
import type pg from 'pg';
import { many, one, tx, type Queryable } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { prepareTopup, resolveTopups, runTopup, type Prepared } from './topup.ts';
import { sweepHolds } from './sweep.ts';
import { walletBlocker, type WalletPurpose } from './blockers.ts';
import { EXTRAS_INR_MICRO_PER_MIN, partPrice } from './prices.ts';
import { CARRIERS, carrierChoice, RECOMMENDED_MAX_PULSE_S } from './carriers.ts';
import { registerBurst } from './burst.ts';
import { ensureTestCap, testBudget } from './test-budget.ts';
import { COMPONENTS } from '../../../shared/components.ts';
import { caps, costLines, credit, defaultRange, estimate, priceFor, reconcile, rollPeriods, statement, usage, walletView } from './money.ts';

const MAX_TOPUP = 1_000_000_000;          // ₹10 lakh per top-up
const MAX_CAP = 100_000_000_000;          // ₹10 crore
const date = () => str({ pattern: /^\d{4}-\d{2}-\d{2}$/, desc: 'IST date, YYYY-MM-DD' });
const scopeV = str({ oneOf: ['workspace', 'campaign', 'api_key', 'test'] });
const periodV = str({ oneOf: ['total', 'daily', 'monthly', 'in_flight'] });
const capInput = obj({ scope: scopeV, scopeId: opt(uuid()), period: periodV, capInrMilli: num({ int: true, min: 0, max: MAX_CAP }),
  perCallInrMilli: opt(num({ int: true, min: 1000, max: 10_000_000, desc: 'test scope only: the most one test call may hold' })) });
type CapInput = ReturnType<typeof capInput>;
const PLANS = ['base', 'plus', 'premium'] as const;

async function findCap(q: Queryable, ws: string, i: CapInput) {
  if (i.scope === 'test') {
    // The daily test-call budget: one row per workspace, created on first use (test-budget.ts).
    if (i.scopeId !== undefined) throw new ValidationError('scopeId', 'is not used for the test budget');
    if (i.period !== 'daily') throw new ValidationError('period', 'the test budget is daily');
    await ensureTestCap(q, ws);
  } else if (i.perCallInrMilli !== undefined) throw new ValidationError('perCallInrMilli', 'is only for the test budget');
  if (i.scope !== 'test' && (i.scope === 'workspace') !== (i.scopeId === undefined)) throw new ValidationError('scopeId', i.scope === 'workspace' ? 'is not used for a workspace cap' : 'is required for this scope');
  if (i.scope === 'campaign' && !(await one(q, 'SELECT 1 FROM campaign WHERE id = $1 AND workspace_id = $2', [i.scopeId, ws]))) throw new ValidationError('scopeId', 'no such campaign');
  if (i.scope === 'api_key' && !(await one(q, 'SELECT 1 FROM api_key WHERE id = $1 AND workspace_id = $2', [i.scopeId, ws]))) throw new ValidationError('scopeId', 'no such API key');
  return one<{ id: string; cap: string; hold: string | null }>(q,
    `SELECT id, cap_inr_milli::text AS cap, per_call_inr_milli::text AS hold FROM budget WHERE workspace_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3 AND period = $4
     ORDER BY created_at LIMIT 1 FOR UPDATE`, [ws, i.scope, i.scopeId ?? null, i.period]);
}

async function setCap(ctx: ToolCtx, i: CapInput, dir: 'raise' | 'lower') {
  await rollPeriods(ctx.q, ctx.workspaceId);
  const cur = await findCap(ctx.q, ctx.workspaceId, i);
  if (cur && i.scope === 'test') {
    // The test budget moves its cap and its per-call hold together: a raise may lift either and lower neither; a lower
    // the reverse. The hold never exceeds the cap.
    const was = Number(cur.cap), wasHold = Number(cur.hold ?? 50_000), hold = i.perCallInrMilli ?? Math.min(wasHold, i.capInrMilli);
    if (hold > i.capInrMilli) throw new ValidationError('perCallInrMilli', `a test call cannot hold more than the day's budget of ${formatInr(i.capInrMilli)}`);
    if (dir === 'raise' && (i.capInrMilli < was || hold < wasHold || (i.capInrMilli === was && hold === wasHold)))
      throw new ValidationError('capInrMilli', `a raise lifts the budget (now ${formatInr(was)}) or the per-call hold (now ${formatInr(wasHold)}) and lowers neither; use cap.lower to lower`);
    if (dir === 'lower' && (i.capInrMilli > was || hold > wasHold || (i.capInrMilli === was && hold === wasHold)))
      throw new ValidationError('capInrMilli', `a lower reduces the budget (now ${formatInr(was)}) or the per-call hold (now ${formatInr(wasHold)}) and raises neither; raising needs cap.raise`);
    await ctx.q.query('UPDATE budget SET cap_inr_milli = $2, per_call_inr_milli = $3 WHERE id = $1', [cur.id, i.capInrMilli, hold]);
    return { budgetId: cur.id, wasInrMilli: was, capInrMilli: i.capInrMilli, wasPerCallInrMilli: wasHold, perCallInrMilli: hold };
  }
  if (cur) {
    const was = Number(cur.cap);
    if (dir === 'raise' && i.capInrMilli <= was) throw new ValidationError('capInrMilli', `must be above the current ${formatInr(was)}; use cap.lower to lower it`);
    if (dir === 'lower' && i.capInrMilli >= was) throw new ValidationError('capInrMilli', `must be below the current ${formatInr(was)}; raising needs cap.raise`);
    await ctx.q.query('UPDATE budget SET cap_inr_milli = $2 WHERE id = $1', [cur.id, i.capInrMilli]);
    return { budgetId: cur.id, wasInrMilli: was, capInrMilli: i.capInrMilli };
  }
  const row = await one<{ id: string }>(ctx.q,
    `INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli, period_start)
     VALUES ($1, $2, $3, $4, $5, CASE $4 WHEN 'monthly' THEN date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date
                                          ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date END) RETURNING id`,
    [ctx.workspaceId, i.scope, i.scopeId ?? null, i.period, i.capInrMilli]);
  return { budgetId: row!.id, wasInrMilli: null, capInrMilli: i.capInrMilli };
}

export function register(r: Registry): void {
  registerBurst(r);
  r.register(tool(obj({ stackId: str({ max: 60 }), minutes: num({ min: 0, max: 1e8 }), calls: num({ int: true, min: 0, max: 1e7 }),
    components: opt(obj({ ears: opt(str({ max: 60 })), brain: opt(str({ max: 60 })), voice: opt(str({ max: 60 })), s2s: opt(str({ max: 60 })), gatedEars: opt(bool()) })) }), {
    name: 'money.estimate', risk: 'read', summary: "estimate what Vyakti pays providers for minutes and calls on a stack, or on parts a user built (stackId 'custom' with components)",
    run: (ctx, i) => estimate(ctx.q, i as Parameters<typeof estimate>[1]),
  }));

  r.register(tool(obj({ stackId: str({ max: 60 }) }), {
    name: 'money.card', risk: 'read', summary: 'show the provider cost card for a stack, with sources and dates',
    run: async (ctx, i) => ({ stackId: i.stackId, lines: await costLines(ctx.q, i.stackId), price: await priceFor(ctx.q, ctx.workspaceId, i.stackId) }),
  }));

  r.register(tool(obj({}), {
    name: 'money.test_budget', risk: 'read', summary: "today's test-call budget: the cap, the most one test call may hold, what is spent and whether one more call fits",
    run: ctx => testBudget(ctx.q, ctx.workspaceId),
  }));

  r.register(tool(obj({}), {
    name: 'money.carriers', risk: 'read', summary: 'each phone carrier path with its billing pulse, what the pulse adds per call, and whether it is recommended',
    run: async () => ({ carriers: CARRIERS.map(carrierChoice), rule: `A pulse over ${RECOMMENDED_MAX_PULSE_S} seconds is marked not recommended; it is never blocked.` }),
  }));

  r.register(tool(obj({}), {
    name: 'money.parts', risk: 'read', summary: 'what each part a voice stack can be built from costs per minute, in rupees, with its list price as the basis',
    run: async () => ({
      parts: COMPONENTS.flatMap(c => { const p = partPrice(c.part, c.id, c.price); return p ? [{ ...p, display: `${formatInr(Math.round(p.inrMicroPerMin / 1000), { paise: true })} a minute` }] : []; }),
      extrasInrMicroPerMin: EXTRAS_INR_MICRO_PER_MIN,
      note: 'What Vyakti pays its providers, not a customer price. A built stack also carries the phone line, infrastructure and call analysis.',
    }),
  }));

  r.register(tool(obj({}), {
    name: 'wallet.get', risk: 'read', summary: 'show the wallet: balance, holds, state, runway and caps',
    run: ctx => walletView(ctx.q, ctx.workspaceId),
  }));

  r.register(tool(obj({ groupBy: str({ oneOf: ['component', 'campaign', 'day'] }), from: opt(date()), to: opt(date()) }), {
    name: 'usage.get', risk: 'read', summary: 'show metered provider cost grouped by component, campaign or day',
    run: (ctx, i) => { const d = defaultRange(); return usage(ctx.q, ctx.workspaceId, i.groupBy as 'component', { from: i.from ?? d.from, to: i.to ?? d.to }); },
  }));

  r.register(tool(obj({ from: opt(date()), to: opt(date()) }), {
    name: 'invoice.get', risk: 'read', summary: 'show the usage statement for a period (customer price not set yet)',
    run: (ctx, i) => { const d = defaultRange(); return statement(ctx.q, ctx.workspaceId, { from: i.from ?? d.from, to: i.to ?? d.to }); },
  }));

  r.register(tool(obj({ inrMilli: num({ int: true, min: 1000, max: MAX_TOPUP }) }), {
    name: 'wallet.topup', risk: 'spend', summary: 'add money to the prepaid wallet through the payment gateway',
    describe: i => `Add ${formatInr(i.inrMilli)} to the prepaid wallet`,
    prepare: (ctx, i) => prepareTopup(ctx, i),                 // the one gateway call, under the action's own key
    run: (ctx, _i, p) => runTopup(ctx, p as Prepared | undefined),
  }));

  // Vyakti staff (actor 'vp_success', never a workspace role) credit a wallet by hand. It runs at once, carries a
  // reason, is audited, and applies once per caller key: a retried call answers 'already_credited'.
  r.register(tool(obj({ inrMilli: num({ int: true, min: 1, max: MAX_TOPUP }), reason: str({ min: 5, max: 400 }), idempotencyKey: str({ min: 6, max: 80 }) }), {
    name: 'wallet.credit', risk: 'draft', summary: 'Vyakti staff: credit the wallet by hand, with a reason (audited)',
    roles: [],                                   // no member role may call it; only the vp_success (Vyakti staff) actor
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'vp_success' || !ctx.actor.id) throw new Error('only Vyakti staff can credit a wallet by hand');
      const key = `credit:${ctx.workspaceId}:${i.idempotencyKey}`;
      const t = await one<{ id: string }>(ctx.q,
        `INSERT INTO wallet_topup (workspace_id, kind, inr_milli, status, reason, actor, idempotency_key, credited_at)
         VALUES ($1,'manual_credit',$2,'captured',$3,$4,$5, now()) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [ctx.workspaceId, i.inrMilli, i.reason, ctx.actor.id, key]);
      if (!t) {
        const prior = await one<{ id: string; inr: string }>(ctx.q, 'SELECT id, inr_milli::text AS inr FROM wallet_topup WHERE idempotency_key = $1', [key]);
        if (Number(prior!.inr) !== i.inrMilli) throw new ValidationError('idempotencyKey', `was already used for a credit of ${formatInr(Number(prior!.inr))}; use a new key for a different amount`);
        return { status: 'already_credited', topupId: prior!.id };
      }
      const w = await credit(ctx.q, ctx.workspaceId, i.inrMilli);
      await appendAudit(ctx.q, { workspaceId: ctx.workspaceId, actorType: 'vp_success', actorId: ctx.actor.id, action: 'wallet.credit.manual',
        objectType: 'wallet_topup', objectId: t.id, payload: { inrMilli: i.inrMilli, reason: i.reason, idempotencyKey: i.idempotencyKey } });
      return { status: 'credited', topupId: t.id, balanceInrMilli: Number(w!.balance), state: w!.state };
    },
  }));

  r.register(tool(obj({ purpose: str({ oneOf: ['launch', 'number_rent'] }), needInrMilli: opt(num({ int: true, min: 0, max: MAX_CAP })) }), {
    name: 'wallet.check', risk: 'read', summary: 'say whether the wallet can pay for a launch or a number, with the amount and the balance',
    run: async (ctx, i) => ({ blocker: await walletBlocker(ctx.q, ctx.workspaceId, { purpose: i.purpose as WalletPurpose, needInrMilli: i.needInrMilli ?? null }) }),
  }));

  r.register(tool(capInput, {
    name: 'cap.raise', risk: 'spend', summary: 'raise (or set) a spend cap',
    describe: i => i.scope === 'test'
      ? `Raise the daily test budget to ${formatInr(i.capInrMilli)}${i.perCallInrMilli ? `, with up to ${formatInr(i.perCallInrMilli)} held per test call` : ''}`
      : i.period === 'in_flight' ? `Raise the ${i.scope.replace('_', ' ')} in-flight limit (money held at once for calls in progress) to ${formatInr(i.capInrMilli)}` : `Raise the ${i.period} ${i.scope.replace('_', ' ')} cap to ${formatInr(i.capInrMilli)}`,
    version: async (ctx, i) => { const c = await findCap(ctx.q, ctx.workspaceId, i); return c ? `${c.cap}/${c.hold ?? ''}` : 'none'; },
    run: (ctx, i) => setCap(ctx, i, 'raise'),
  }));

  r.register(tool(capInput, {
    name: 'cap.lower', risk: 'draft', summary: 'lower (or add) a spend cap; only ever reduces what can be spent',
    run: (ctx, i) => setCap(ctx, i, 'lower'),
  }));

  r.register(tool(obj({ planId: str({ oneOf: PLANS }) }), {
    name: 'plan.change', risk: 'spend', summary: 'change the workspace plan',
    describe: i => `Move this workspace to the ${i.planId} plan (customer price not set yet)`,
    version: async ctx => (await one<{ plan: string }>(ctx.q, 'SELECT plan FROM workspace WHERE id = $1', [ctx.workspaceId]))?.plan ?? null,
    run: async (ctx, i) => {
      const p = await one<{ id: string }>(ctx.q, 'SELECT id FROM money_plan WHERE id = $1 AND active', [i.planId]);
      if (!p) throw new ValidationError('planId', 'that plan is not offered');
      const was = await one<{ plan: string }>(ctx.q, 'SELECT plan FROM workspace WHERE id = $1 FOR UPDATE', [ctx.workspaceId]);
      await ctx.q.query('UPDATE workspace SET plan = $2 WHERE id = $1', [ctx.workspaceId, i.planId]);
      return { plan: i.planId, was: was?.plan ?? null, price: await priceFor(ctx.q, ctx.workspaceId, null) };
    },
  }));

  r.register(tool(obj({}), {
    name: 'money.reconcile', risk: 'draft', summary: 'compare settled charges with metered cost lines; open an issue on drift',
    run: ctx => reconcile(ctx.q, ctx.workspaceId),
  }));
}

/** The nightly job (IST midnight): roll period caps everywhere, release holds that will never report, resolve
 *  unconfirmed top-ups, then reconcile each workspace. */
export async function runMoneyJobs(pool: pg.Pool, at: Date = new Date()) {
  const rolled = await rollPeriods(pool, null, at);
  const swept = (await tx(pool, c => sweepHolds(c, null, at))).length;
  const topups = await resolveTopups(pool, at);
  const wss = await many<{ id: string }>(pool, "SELECT id FROM workspace WHERE status = 'active'");
  let drift = 0;
  for (const w of wss) drift += (await tx(pool, c => reconcile(c, w.id))).drift.length;
  return { rolled, swept, topups, workspaces: wss.length, drift };
}

/** Every 5 minutes: release leaked holds and resolve unconfirmed top-ups, so a wallet is not stuck until midnight. */
export async function runMoneySweep(pool: pg.Pool, at: Date = new Date()) {
  const swept = (await tx(pool, c => sweepHolds(c, null, at))).length;
  return { swept, topups: await resolveTopups(pool, at) };
}

export const jobs = (): Job[] => [
  { name: 'money.nightly', dailyAtIst: '00:00', run: async deps => { await runMoneyJobs(deps.pool); } },
  { name: 'money.sweep', everyMs: 5 * 60_000, run: async deps => { await runMoneySweep(deps.pool); } },
];

export const module: Module = { name: 'money', register, jobs };
