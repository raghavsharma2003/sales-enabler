// The money module's tools. Risk classes follow the blueprint registry (workspace.md section 5): top-ups, cap
// raises and plan changes are spend (A2, owner approves); lowering a cap only lowers risk, so it runs at once;
// reads are A1. A manual credit is VP success's alone, carries a reason, and is audited with it.
import { randomUUID } from 'node:crypto';
import { formatInr } from '../../../shared/money.ts';
import { num, obj, opt, str, uuid, ValidationError } from '../../../shared/validate.ts';
import type { Module } from '../../app.ts';
import type { Job } from '../../jobs.ts';
import { appendAudit } from '../../audit.ts';
import { many, one, type Queryable } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { gateway } from './gateway.ts';
import { caps, costLines, credit, defaultRange, estimate, priceFor, reconcile, rollPeriods, statement, usage, walletView } from './money.ts';

const MAX_TOPUP = 1_000_000_000;          // ₹10 lakh per top-up
const MAX_CAP = 100_000_000_000;          // ₹10 crore
const date = () => str({ pattern: /^\d{4}-\d{2}-\d{2}$/, desc: 'IST date, YYYY-MM-DD' });
const scopeV = str({ oneOf: ['workspace', 'campaign', 'api_key'] });
const periodV = str({ oneOf: ['total', 'daily', 'monthly'] });
const capInput = obj({ scope: scopeV, scopeId: opt(uuid()), period: periodV, capInrMilli: num({ int: true, min: 0, max: MAX_CAP }) });
type CapInput = ReturnType<typeof capInput>;
const PLANS = ['base', 'plus', 'premium'] as const;

async function findCap(q: Queryable, ws: string, i: CapInput) {
  if ((i.scope === 'workspace') !== (i.scopeId === undefined)) throw new ValidationError('scopeId', i.scope === 'workspace' ? 'is not used for a workspace cap' : 'is required for this scope');
  if (i.scope === 'campaign' && !(await one(q, 'SELECT 1 FROM campaign WHERE id = $1 AND workspace_id = $2', [i.scopeId, ws]))) throw new ValidationError('scopeId', 'no such campaign');
  if (i.scope === 'api_key' && !(await one(q, 'SELECT 1 FROM api_key WHERE id = $1 AND workspace_id = $2', [i.scopeId, ws]))) throw new ValidationError('scopeId', 'no such API key');
  return one<{ id: string; cap: string }>(q,
    `SELECT id, cap_inr_milli::text AS cap FROM budget WHERE workspace_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3 AND period = $4
     ORDER BY created_at LIMIT 1 FOR UPDATE`, [ws, i.scope, i.scopeId ?? null, i.period]);
}

async function setCap(ctx: ToolCtx, i: CapInput, dir: 'raise' | 'lower') {
  await rollPeriods(ctx.q, ctx.workspaceId);
  const cur = await findCap(ctx.q, ctx.workspaceId, i);
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
  r.register(tool(obj({ stackId: str({ max: 60 }), minutes: num({ min: 0, max: 1e8 }), calls: num({ int: true, min: 0, max: 1e7 }) }), {
    name: 'money.estimate', risk: 'read', summary: 'estimate what VP pays providers for minutes and calls on a stack',
    run: (ctx, i) => estimate(ctx.q, i),
  }));

  r.register(tool(obj({ stackId: str({ max: 60 }) }), {
    name: 'money.card', risk: 'read', summary: 'show the provider cost card for a stack, with sources and dates',
    run: async (ctx, i) => ({ stackId: i.stackId, lines: await costLines(ctx.q, i.stackId), price: await priceFor(ctx.q, ctx.workspaceId, i.stackId) }),
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
    run: async (ctx, i) => {
      const gw = gateway();
      if (!gw.enabled) throw new Error('online top-up is not switched on yet; ask VP success for a manual credit');
      const key = randomUUID();
      const res = await gw.charge({ inrMilli: i.inrMilli, workspaceId: ctx.workspaceId, idempotencyKey: key });
      const ins = await one<{ id: string }>(ctx.q,
        `INSERT INTO wallet_topup (workspace_id, kind, inr_milli, gateway, gateway_ref, status, actor) VALUES ($1,'payment',$2,$3,$4,$5,$6)
         ON CONFLICT (gateway, gateway_ref) DO NOTHING RETURNING id`,
        [ctx.workspaceId, i.inrMilli, gw.name, res.gatewayRef, res.status, ctx.actor.id ?? ctx.actor.type]);
      if (res.status !== 'captured') return { status: 'failed', reason: res.reason };
      if (!ins) return { status: 'duplicate', reason: 'this payment was already credited' };
      const w = await credit(ctx.q, ctx.workspaceId, i.inrMilli);
      return { status: 'credited', topupId: ins.id, balanceInrMilli: Number(w!.balance), state: w!.state, display: formatInr(Number(w!.balance), { paise: true }) };
    },
  }));

  r.register(tool(obj({ inrMilli: num({ int: true, min: 1, max: MAX_TOPUP }), reason: str({ min: 5, max: 400 }) }), {
    name: 'wallet.credit', risk: 'draft', summary: 'VP success: credit the wallet by hand, with a reason (audited)',
    roles: [],                                   // no member role may call it; only the vp_success actor
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'vp_success') throw new Error('only VP success can credit a wallet by hand');
      const t = await one<{ id: string }>(ctx.q,
        `INSERT INTO wallet_topup (workspace_id, kind, inr_milli, status, reason, actor) VALUES ($1,'manual_credit',$2,'captured',$3,$4) RETURNING id`,
        [ctx.workspaceId, i.inrMilli, i.reason, ctx.actor.id ?? 'vp_success']);
      const w = await credit(ctx.q, ctx.workspaceId, i.inrMilli);
      await appendAudit(ctx.q, { workspaceId: ctx.workspaceId, actorType: 'vp_success', actorId: ctx.actor.id, action: 'wallet.credit.manual',
        objectType: 'wallet_topup', objectId: t!.id, payload: { inrMilli: i.inrMilli, reason: i.reason } });
      return { status: 'credited', topupId: t!.id, balanceInrMilli: Number(w!.balance), state: w!.state };
    },
  }));

  r.register(tool(capInput, {
    name: 'cap.raise', risk: 'spend', summary: 'raise (or set) a spend cap',
    describe: i => `Raise the ${i.period} ${i.scope.replace('_', ' ')} cap to ${formatInr(i.capInrMilli)}`,
    version: async (ctx, i) => (await findCap(ctx.q, ctx.workspaceId, i))?.cap ?? 'none',
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

/** The nightly job (IST midnight): roll period caps everywhere, then reconcile each workspace. */
export async function runMoneyJobs(q: Queryable, at: Date = new Date()) {
  const rolled = await rollPeriods(q, null, at);
  const wss = await many<{ id: string }>(q, "SELECT id FROM workspace WHERE status = 'active'");
  let drift = 0;
  for (const w of wss) drift += (await reconcile(q, w.id)).drift.length;
  return { rolled, workspaces: wss.length, drift };
}

export { caps };
/** Nightly at IST midnight: roll period caps, then reconcile every workspace (server/jobs.ts runs it, one replica at a time). */
export const jobs = (): Job[] => [{ name: 'money.nightly', dailyAtIst: '00:00', run: async deps => { await runMoneyJobs(deps.pool); } }];

export const module: Module = { name: 'money', register, jobs };
