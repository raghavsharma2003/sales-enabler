// Money module core: the estimate, the wallet view, period caps, the usage statement and reconciliation.
// The kernel ledger (server/ledger.ts) holds and settles money; this file reads around it and never re-implements it.
// No customer price exists yet (decision.2026-10-21.pricing-deferred): every figure here is provider cost, and the
// customer price is reported as 'not_set' until an active price_card row exists.
import { formatInr } from '../../../shared/money.ts';
import { requireStack } from '../../../shared/stacks.ts';
import { ValidationError } from '../../../shared/validate.ts';
import { many, one, type Queryable } from '../../db.ts';
import { settle } from '../../ledger.ts';

export const TZ = 'Asia/Kolkata';
export const GST_BP = 1800;
/** The blueprint's pricing rule (2.2), ready but INACTIVE until the owner sets a rate card. */
export const MARGIN_RULE = { active: false, floor2026: 0.30, floor2027: 0.25, paymentFeeBp: 200 } as const;

// ------------------------------------------------------------------ estimate

export interface EstimateLine { component: string; provider: string; inrMicroPerMin: number; inrMicroPerCall: number; grade: string; source: string; asOf: string }
export interface Estimate {
  stackId: string; perMinuteInrMilli: number; totalInrMilli: number; basis: string;
  lines: EstimateLine[]; price: PriceView; display: { perMinute: string; total: string };
}

export async function costLines(q: Queryable, stackId: string): Promise<EstimateLine[]> {
  requireStack(stackId);
  const rows = await many<{ component: string; provider: string; m: string; c: string; grade: string; source: string; as_of: string }>(q,
    `SELECT component, provider, inr_micro_per_min::text AS m, inr_micro_per_call::text AS c, grade, source, to_char(as_of, 'YYYY-MM-DD') AS as_of
     FROM cost_card WHERE stack_id = $1 AND active ORDER BY component`, [stackId]);
  if (!rows.length) throw new ValidationError('stackId', `no provider cost card for stack "${stackId}" yet`);
  return rows.map(r => ({ component: r.component, provider: r.provider, inrMicroPerMin: Number(r.m), inrMicroPerCall: Number(r.c), grade: r.grade, source: r.source, asOf: r.as_of }));
}

/** Provider cost for `minutes` connected minutes across `calls` calls on a stack. Integer milli-rupees. */
export async function estimate(q: Queryable, i: { stackId: string; minutes: number; calls: number }): Promise<Estimate> {
  const lines = await costLines(q, i.stackId);
  const perMinMicro = lines.reduce((s, l) => s + l.inrMicroPerMin, 0);
  const perCallMicro = lines.reduce((s, l) => s + l.inrMicroPerCall, 0);
  const totalMicro = perMinMicro * i.minutes + perCallMicro * i.calls;
  const perMinuteInrMilli = Math.round(perMinMicro / 1000);
  const totalInrMilli = Math.round(totalMicro / 1000);
  const asOf = lines.map(l => l.asOf).sort().at(-1);
  const grades = [...new Set(lines.map(l => l.grade))].join('+');
  const basis = `provider cost only (${grades}), cost card as of ${asOf}: list prices from voicelab/server/catalog.py at ₹95/$ with an assumed `
    + `minute profile, plus half a carrier pulse per call; not a measured average and not a customer price (price not set)`;
  return { stackId: i.stackId, perMinuteInrMilli, totalInrMilli, basis, lines, price: await priceFor(q, null, i.stackId),
    display: { perMinute: formatInr(perMinuteInrMilli, { paise: true }) + '/min', total: formatInr(totalInrMilli, { paise: true }) } };
}

// ------------------------------------------------------------------ price card (empty by default)

export type PriceView =
  | { status: 'not_set'; text: string }
  | { status: 'set'; perMinuteInrMilli: number; gstBp: number; withGstInrMilli: number; text: string };

const NOT_SET: PriceView = { status: 'not_set', text: 'Customer price not set yet: amounts shown are what VP pays providers.' };

/** The active customer price for a plan (or the workspace's plan) and stack; 'not_set' when the card is empty. */
export async function priceFor(q: Queryable, workspaceId: string | null, stackId: string | null, planId?: string): Promise<PriceView> {
  const plan = planId ?? (workspaceId ? (await one<{ plan: string }>(q, 'SELECT plan FROM workspace WHERE id = $1', [workspaceId]))?.plan : 'base') ?? 'base';
  const p = await one<{ m: string; gst_bp: number }>(q,
    `SELECT per_min_inr_milli::text AS m, gst_bp FROM price_card WHERE active AND plan_id = $1 AND (stack_id = $2 OR stack_id IS NULL)
     ORDER BY stack_id NULLS LAST, created_at DESC LIMIT 1`, [plan, stackId]);
  if (!p) return NOT_SET;
  const m = Number(p.m), withGst = Math.round(m * (10000 + p.gst_bp) / 10000);
  return { status: 'set', perMinuteInrMilli: m, gstBp: p.gst_bp, withGstInrMilli: withGst,
    text: `${formatInr(m, { paise: true })}/min + GST = ${formatInr(withGst, { paise: true })}` };
}

/** Gross margin after the payment fee, for a price and a provider cost per minute (both milli). */
export function margin(priceMilli: number, costMilli: number, feeBp: number = MARGIN_RULE.paymentFeeBp): number {
  if (priceMilli <= 0) return 0;
  const net = priceMilli * (1 - feeBp / 10000);
  return (net - costMilli) / priceMilli;
}

/** Would this price pass the blueprint's floor? Reported, never enforced, while MARGIN_RULE is inactive. */
export function marginCheck(priceMilli: number, costMilli: number, cost2027Milli = costMilli) {
  const m = margin(priceMilli, costMilli), m27 = margin(priceMilli, cost2027Milli);
  return { active: MARGIN_RULE.active, margin: m, margin2027: m27, passes: m >= MARGIN_RULE.floor2026 && m27 >= MARGIN_RULE.floor2027 };
}

// ------------------------------------------------------------------ periods (IST)

/** Reset daily/monthly caps whose IST period has ended. ws = null rolls every workspace (the midnight job). */
export async function rollPeriods(q: Queryable, ws: string | null, at: Date = new Date()): Promise<number> {
  const r = await one<{ n: number }>(q, 'SELECT money_roll_periods($1, $2) AS n', [ws, at]);
  return r?.n ?? 0;
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
export function istDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

// ------------------------------------------------------------------ wallet

export interface CapView { id: string; scope: string; scopeId: string | null; period: string; periodStart: string; capInrMilli: number; spentInrMilli: number; heldInrMilli: number; usedShare: number; near: boolean; reached: boolean }

export async function caps(q: Queryable, ws: string): Promise<CapView[]> {
  const rows = await many<{ id: string; scope_type: string; scope_id: string | null; period: string; ps: string; cap: string; spent: string; held: string }>(q,
    `SELECT b.id, b.scope_type, b.scope_id, b.period, to_char(b.period_start, 'YYYY-MM-DD') AS ps, b.cap_inr_milli::text AS cap, b.spent_inr_milli::text AS spent,
            coalesce((SELECT sum(inr_milli) FROM reservation x WHERE x.workspace_id = b.workspace_id AND x.status = 'held' AND b.id = ANY(x.budget_ids)), 0)::text AS held
     FROM budget b WHERE b.workspace_id = $1 ORDER BY b.scope_type, b.period, b.created_at`, [ws]);
  return rows.map(r => {
    const cap = Number(r.cap), used = Number(r.spent) + Number(r.held), share = cap > 0 ? used / cap : 1;
    return { id: r.id, scope: r.scope_type, scopeId: r.scope_id, period: r.period, periodStart: r.ps, capInrMilli: cap, spentInrMilli: Number(r.spent),
      heldInrMilli: Number(r.held), usedShare: share, near: share >= 0.8, reached: share >= 1 };
  });
}

export async function walletView(q: Queryable, ws: string, at: Date = new Date()) {
  await rollPeriods(q, ws, at);
  const w = await one<{ balance: string; state: string; held: string; th: string | null; spent7: string }>(q,
    `SELECT w.balance_inr_milli::text AS balance, w.state,
            coalesce((SELECT sum(inr_milli) FROM reservation WHERE workspace_id = w.workspace_id AND status = 'held'), 0)::text AS held,
            (SELECT low_threshold_inr_milli::text FROM money_settings WHERE workspace_id = w.workspace_id) AS th,
            coalesce((SELECT sum(settled_inr_milli) FROM reservation WHERE workspace_id = w.workspace_id AND status = 'settled'
                      AND settled_at > $2::timestamptz - interval '7 days'), 0)::text AS spent7
     FROM wallet w WHERE w.workspace_id = $1`, [ws, at]);
  const balance = Number(w?.balance ?? 0), held = Number(w?.held ?? 0), available = balance - held;
  const perDay = Number(w?.spent7 ?? 0) / 7;
  const runwayDays = perDay > 0 ? Math.max(0, available) / perDay : null;
  const c = await caps(q, ws);
  return {
    state: w?.state ?? 'empty', balanceInrMilli: balance, heldInrMilli: held, availableInrMilli: available,
    lowThresholdInrMilli: Number(w?.th ?? 1000000), runwayDays: runwayDays === null ? null : Math.round(runwayDays * 10) / 10,
    display: { balance: formatInr(balance, { paise: true }), held: formatInr(held, { paise: true }), available: formatInr(available, { paise: true }) },
    caps: c, warnings: [
      ...(available <= 0 ? ['no money available: new attempts wait; live calls always finish'] : []),
      ...(runwayDays !== null && runwayDays < 3 ? [`runway under 3 days at the last 7 days' pace`] : []),
      ...c.filter(x => x.near).map(x => `${x.scope} ${x.period} cap ${x.reached ? 'reached' : 'at ' + Math.floor(x.usedShare * 100) + '%'}`),
    ],
    price: await priceFor(q, ws, null),
  };
}

/** Block or unblock a wallet (VP success, or a dispute). Unblocking recomputes the state from the balance. */
export async function setWalletBlocked(q: Queryable, ws: string, blocked: boolean): Promise<string> {
  const r = await one<{ state: string }>(q, `UPDATE wallet SET state = $2, updated_at = now() WHERE workspace_id = $1 RETURNING state`, [ws, blocked ? 'blocked' : 'ok']);
  if (!r) throw new Error('this workspace has no wallet');
  return r.state;
}

export async function credit(q: Queryable, ws: string, inrMilli: number) {
  return one<{ balance: string; state: string }>(q,
    `INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1, $2)
     ON CONFLICT (workspace_id) DO UPDATE SET balance_inr_milli = wallet.balance_inr_milli + EXCLUDED.balance_inr_milli, updated_at = now()
     RETURNING balance_inr_milli::text AS balance, state`, [ws, inrMilli]);
}

// ------------------------------------------------------------------ usage and statements

export interface Range { from: string; to: string }   // IST dates, inclusive

export function defaultRange(at: Date = new Date()): Range {
  const d = istDate(at);
  return { from: d.slice(0, 8) + '01', to: d };
}

const WHERE = `cl.workspace_id = $1 AND (cl.created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date`;

export type GroupBy = 'component' | 'campaign' | 'day';

export async function usage(q: Queryable, ws: string, by: GroupBy, r: Range) {
  const key = by === 'component' ? 'cl.component'
    : by === 'day' ? `to_char((cl.created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`
    : `coalesce(c.name, 'no campaign')`;
  const rows = await many<{ k: string; campaign_id: string | null; n: string; m: string; secs: string }>(q,
    `SELECT ${key} AS k, ${by === 'campaign' ? 'c.id' : 'NULL::uuid'} AS campaign_id, count(*)::text AS n, sum(cl.inr_milli)::text AS m,
            coalesce(sum(cl.quantity) FILTER (WHERE cl.unit = 'second' AND cl.component = 'telephony'), 0)::text AS secs
     FROM cost_line cl
     LEFT JOIN attempt a ON a.id = cl.attempt_id AND a.workspace_id = cl.workspace_id
     LEFT JOIN campaign c ON c.id = a.campaign_id AND c.workspace_id = cl.workspace_id
     WHERE ${WHERE} GROUP BY 1, 2 ORDER BY 1`, [ws, r.from, r.to]);
  return rows.map(x => ({ key: x.k, ...(by === 'campaign' ? { campaignId: x.campaign_id } : {}), lines: Number(x.n),
    costInrMilli: Number(x.m), connectedSeconds: Number(x.secs), display: formatInr(Number(x.m), { paise: true }) }));
}

/** The usage statement (invoice.get): provider cost lines by component, campaign and day; money in; price honestly 'not set'. */
export async function statement(q: Queryable, ws: string, r: Range) {
  if (r.from > r.to) throw new ValidationError('from', 'must be on or before to');
  const byComponent = await usage(q, ws, 'component', r);      // sequential: q may be one client inside a transaction
  const byCampaign = await usage(q, ws, 'campaign', r);
  const byDay = await usage(q, ws, 'day', r);
  const total = byComponent.reduce((s, x) => s + x.costInrMilli, 0);
  const topups = await many<{ kind: string; m: string; n: string }>(q,
    `SELECT kind, sum(inr_milli)::text AS m, count(*)::text AS n FROM wallet_topup
     WHERE workspace_id = $1 AND status = 'captured' AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date GROUP BY kind`, [ws, r.from, r.to]);
  const price = await priceFor(q, ws, null);
  return {
    kind: 'usage_statement', period: r, currency: 'INR', timezone: TZ,
    costInrMilli: total, display: { cost: formatInr(total, { paise: true }) },
    byComponent, byCampaign, byDay,
    moneyIn: topups.map(t => ({ kind: t.kind, count: Number(t.n), inrMilli: Number(t.m), display: formatInr(Number(t.m), { paise: true }) })),
    price,
    note: price.status === 'not_set'
      ? 'This is a usage statement, not a tax invoice: no customer price is set yet, so it shows what VP paid providers. GST is not computed.'
      : 'Customer price is set; a GST invoice is produced by the billing run.',
  };
}

// ------------------------------------------------------------------ reconciliation

export interface Drift { attemptId: string; settledInrMilli: number | null; costLinesInrMilli: number; cause: 'mismatch' | 'cost_without_settle' | 'overrun' | 'late_cost'; overrunInrMilli?: number; lateReservationId?: string }

/** Compare each settled reservation with the cost lines metered for its attempt; open one issue per drifting attempt. */
export async function reconcile(q: Queryable, ws: string): Promise<{ checked: number; drift: Drift[]; issuesOpened: number }> {
  const rows = await many<{ attempt_id: string; settled: string | null; lines: string; overrun: string; status: string | null }>(q,
    `WITH r AS (SELECT attempt_id, sum(settled_inr_milli) AS settled, bool_or(status = 'held') AS held, sum(overrun_inr_milli) AS overrun
                FROM reservation WHERE workspace_id = $1 AND attempt_id IS NOT NULL AND status IN ('settled','held') GROUP BY attempt_id),
          l AS (SELECT attempt_id, sum(inr_milli) AS lines FROM cost_line WHERE workspace_id = $1 AND attempt_id IS NOT NULL GROUP BY attempt_id)
     SELECT coalesce(r.attempt_id, l.attempt_id) AS attempt_id, r.settled::text AS settled, coalesce(l.lines, 0)::text AS lines,
            coalesce(r.overrun, 0)::text AS overrun,
            CASE WHEN r.held THEN 'held' END AS status
     FROM r FULL JOIN l ON l.attempt_id = r.attempt_id`, [ws]);
  const drift: Drift[] = [];
  for (const x of rows) {
    if (x.status === 'held') continue;                  // still in flight: the call has not settled yet
    const settled = x.settled === null ? null : Number(x.settled), lines = Number(x.lines);
    if (settled === null) {
      if (lines <= 0) continue;
      // The sweep released this attempt's hold and the cost came in afterwards: charge it now under a new hold tagged
      // to the same caps (late_of), and say so. Without a swept hold it stays a plain drift for a person.
      const swept = await one<{ id: string; budget_ids: string[] }>(q,
        `SELECT id, budget_ids FROM reservation WHERE workspace_id = $1 AND attempt_id = $2 AND status = 'released' AND released_reason LIKE 'sweep:%'
         ORDER BY created_at DESC LIMIT 1`, [ws, x.attempt_id]);
      if (swept) {
        const late = await one<{ id: string }>(q,
          'INSERT INTO reservation (workspace_id, attempt_id, inr_milli, budget_ids, late_of) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [ws, x.attempt_id, lines, swept.budget_ids, swept.id]);
        await settle(q, late!.id, lines);
        drift.push({ attemptId: x.attempt_id, settledInrMilli: lines, costLinesInrMilli: lines, cause: 'late_cost', lateReservationId: late!.id });
      } else drift.push({ attemptId: x.attempt_id, settledInrMilli: null, costLinesInrMilli: lines, cause: 'cost_without_settle' });
      continue;
    }
    // A call that ran past its hold was charged only the hold (kernel settle); the excess is VP's to absorb or dispute,
    // so settled + overrun should equal the metered cost lines.
    const overrun = Number(x.overrun);
    if (overrun > 0) drift.push({ attemptId: x.attempt_id, settledInrMilli: settled, costLinesInrMilli: lines, cause: 'overrun', overrunInrMilli: overrun });
    else if (settled !== lines) drift.push({ attemptId: x.attempt_id, settledInrMilli: settled, costLinesInrMilli: lines, cause: 'mismatch' });
  }
  let opened = 0;
  for (const d of drift) {
    const r = await q.query(
      `INSERT INTO issue (workspace_id, category, severity, subject_type, subject_id, detail)
       SELECT $1, 'money_drift', 'warning', 'attempt', $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM issue WHERE workspace_id = $1 AND category = 'money_drift' AND subject_id = $2 AND status <> 'resolved')`,
      [ws, d.attemptId, { ...d, fix: d.cause === 'overrun'
        ? 'the call ran past the most it reserved; the customer was charged only the hold. Check why the runtime did not end it at the reserved maximum'
        : d.cause === 'late_cost'
        ? 'this call reported its cost after its hold was released; the cost was charged now, against the same caps'
        : 'the charge and the metered cost lines disagree; check the call manifest before the next statement' }]);
    opened += r.rowCount ?? 0;
  }
  return { checked: rows.length, drift, issuesOpened: opened };
}
