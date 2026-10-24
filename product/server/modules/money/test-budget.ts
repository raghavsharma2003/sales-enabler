// The daily test-call budget as a workspace cap (owner directive 2026-10-24). One 'test' row per workspace: the daily
// cap and the most one test call may hold. Spend is what the calls module records on test conversations since IST
// midnight (the same query calls used), so the budget resets at midnight India time by construction. The calls module
// reads `money.test_budget` through the registry before it starts a test call, and caps the call at the per-call hold.
import { formatInr } from '../../../shared/money.ts';
import { many, one, type Queryable } from '../../db.ts';

/** A deployment's default for new workspaces (staging sets it; production leaves it unset), in rupees. */
export function deploymentDefaultMilli(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.VP_TEST_BUDGET_DEFAULT_INR?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? Math.round(n * 1000) : null;
}

/** The workspace's test cap, created on first use from the deployment default, else money_config's. */
export async function ensureTestCap(q: Queryable, ws: string, env: NodeJS.ProcessEnv = process.env): Promise<{ id: string; cap: number; hold: number }> {
  const read = () => one<{ id: string; cap: string; hold: string | null }>(q,
    "SELECT id, cap_inr_milli::text AS cap, per_call_inr_milli::text AS hold FROM budget WHERE workspace_id = $1 AND scope_type = 'test' ORDER BY created_at, id LIMIT 1", [ws]);
  let r = await read();
  if (!r) {
    await q.query(`INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli, per_call_inr_milli, period_start)
      SELECT $1, 'test', NULL, 'daily', coalesce($2::bigint, c.default_test_budget_inr_milli), least(c.default_test_hold_inr_milli, coalesce($2::bigint, c.default_test_budget_inr_milli)),
             (now() AT TIME ZONE 'Asia/Kolkata')::date
      FROM money_config c WHERE NOT EXISTS (SELECT 1 FROM budget WHERE workspace_id = $1 AND scope_type = 'test')`, [ws, deploymentDefaultMilli(env)]);
    r = await read();
  }
  return { id: r!.id, cap: Number(r!.cap), hold: Number(r!.hold ?? 50_000) };
}

export interface TestCall { conversationId: string; startedAt: string; durationS: number | null; costInrMilli: number; status: string; display: string }

export async function testBudget(q: Queryable, ws: string, now: Date = new Date()) {
  const c = await ensureTestCap(q, ws);
  const dayStart = `date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;
  const spent = Number((await one<{ s: string }>(q, `SELECT coalesce(sum(cost_inr_milli), 0)::text AS s FROM conversation
    WHERE workspace_id = $1 AND channel = 'test' AND started_at >= ${dayStart} AND started_at <= $2::timestamptz`, [ws, now]))!.s);
  const calls = await many<{ id: string; started_at: Date; duration_s: number | null; cost: string; status: string }>(q,
    `SELECT id, started_at, duration_s, cost_inr_milli::text AS cost, status FROM conversation
     WHERE workspace_id = $1 AND channel = 'test' AND started_at >= ${dayStart} AND started_at <= $2::timestamptz ORDER BY started_at DESC LIMIT 50`, [ws, now]);
  const remaining = c.cap - spent;
  const allowed = spent + c.hold <= c.cap;
  const resetsAt = new Date(Math.floor((now.getTime() + 330 * 60_000) / 86_400_000) * 86_400_000 + 86_400_000 - 330 * 60_000).toISOString();
  return {
    capInrMilli: c.cap, perCallInrMilli: c.hold, spentTodayInrMilli: spent, remainingInrMilli: remaining, allowed, resetsAt,
    ...(allowed ? {} : { reason: `today's test budget is used up: ${formatInr(spent, { paise: true })} of ${formatInr(c.cap)} spent, and a test call can hold up to ${formatInr(c.hold)}. It resets at midnight IST; an owner can raise it in Billing.` }),
    calls: calls.map(r => ({ conversationId: r.id, startedAt: r.started_at.toISOString(), durationS: r.duration_s, costInrMilli: Number(r.cost), status: r.status,
      display: formatInr(Number(r.cost), { paise: true }) } satisfies TestCall)),
    text: `${formatInr(spent, { paise: true })} of ${formatInr(c.cap)} used today on test calls; each test call holds up to ${formatInr(c.hold)}. It resets at midnight India time.`,
  };
}
