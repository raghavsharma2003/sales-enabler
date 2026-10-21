// Money held before any I/O (HV law 24, dial gate G9). reserve() takes a per-workspace advisory lock, then
// checks the wallet and every applicable cap against spent + held, and holds the amount (one row, tagged with the
// budget ids it was checked under). settle() turns a hold
// into spend at the real cost; release() returns it. All three must run inside the caller's transaction.
// The money module owns rates, top-ups and invoices; this is the one piece other modules call.
import type { Queryable } from './db.ts';
import { one } from './db.ts';

export type ReserveRefusal = 'wallet_low' | 'cap_reached' | 'wallet_blocked';
export type ReserveResult = { ok: true; reservationId: string } | { ok: false; cause: ReserveRefusal; scope?: string };

export interface ReserveInput {
  workspaceId: string;
  inrMilli: number;               // the most this action can cost (e.g. max call minutes x per-minute cost)
  attemptId?: string;
  campaignId?: string;
  apiKeyId?: string;
}

const lock = (q: Queryable, ws: string) => q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['money:' + ws]);

// Daily/monthly caps reset at Asia/Kolkata midnight. The money module owns money_roll_periods(); reserve() calls it
// (when it exists) so a cap never refuses on yesterday's spend while waiting for the nightly job.
let rollExists = false;
async function rollPeriods(q: Queryable, ws: string) {
  if (!rollExists) {
    const r = await one<{ ok: boolean }>(q, "SELECT to_regprocedure('money_roll_periods(uuid,timestamptz)') IS NOT NULL AS ok");
    rollExists = Boolean(r?.ok);
    if (!rollExists) return;
  }
  await q.query('SELECT money_roll_periods($1, now())', [ws]);
}

export async function reserve(q: Queryable, r: ReserveInput): Promise<ReserveResult> {
  if (!Number.isInteger(r.inrMilli) || r.inrMilli < 0) throw new Error('reserve: inrMilli must be a non-negative integer');
  await lock(q, r.workspaceId);
  await rollPeriods(q, r.workspaceId);
  const w = await one<{ balance: string; state: string; held: string }>(q,
    `SELECT w.balance_inr_milli::text AS balance, w.state,
            coalesce((SELECT sum(inr_milli) FROM reservation WHERE workspace_id = w.workspace_id AND status = 'held'), 0)::text AS held
     FROM wallet w WHERE w.workspace_id = $1`, [r.workspaceId]);
  if (!w) return { ok: false, cause: 'wallet_low' };
  if (w.state === 'blocked') return { ok: false, cause: 'wallet_blocked' };
  if (BigInt(w.balance) - BigInt(w.held) < BigInt(r.inrMilli)) return { ok: false, cause: 'wallet_low' };

  // Caps: the workspace cap always; campaign and api_key caps when given. Each cap sees spent + every hold tagged to it.
  const caps = await q.query(
    `SELECT id, scope_type, cap_inr_milli::text AS cap, spent_inr_milli::text AS spent,
            coalesce((SELECT sum(inr_milli) FROM reservation x WHERE x.workspace_id = b.workspace_id AND x.status = 'held' AND b.id = ANY(x.budget_ids)), 0)::text AS held
     FROM budget b WHERE workspace_id = $1 AND ((scope_type = 'workspace' AND scope_id IS NULL)
       OR (scope_type = 'campaign' AND scope_id = $2) OR (scope_type = 'api_key' AND scope_id = $3))`,
    [r.workspaceId, r.campaignId ?? null, r.apiKeyId ?? null]);
  for (const c of caps.rows) {
    if (BigInt(c.spent) + BigInt(c.held) + BigInt(r.inrMilli) > BigInt(c.cap)) return { ok: false, cause: 'cap_reached', scope: c.scope_type };
  }
  const row = await one<{ id: string }>(q,
    'INSERT INTO reservation (workspace_id, attempt_id, inr_milli, budget_ids) VALUES ($1,$2,$3,$4) RETURNING id',
    [r.workspaceId, r.attemptId ?? null, r.inrMilli, caps.rows.map(c => c.id)]);
  return { ok: true, reservationId: row!.id };
}

/** Turn a hold into spend at the actual cost. Cost above the hold is NOT charged to the customer: the wallet and caps
 *  are charged min(actual, held) and the excess is recorded as overrun_inr_milli for VP to absorb. */
export async function settle(q: Queryable, reservationId: string, actualInrMilli: number): Promise<void> {
  if (!Number.isInteger(actualInrMilli) || actualInrMilli < 0) throw new Error('settle: actualInrMilli must be a non-negative integer');
  const ws = await one<{ workspace_id: string }>(q, 'SELECT workspace_id FROM reservation WHERE id = $1', [reservationId]);
  if (!ws) return;
  await lock(q, ws.workspace_id);
  const r = await one<{ status: string; budget_ids: string[]; held: string }>(q,
    'SELECT status, budget_ids, inr_milli::text AS held FROM reservation WHERE id = $1 FOR UPDATE', [reservationId]);
  if (!r || r.status !== 'held') return;     // settling twice is a no-op
  const charge = Math.min(actualInrMilli, Number(r.held));
  const overrun = actualInrMilli - charge;
  await q.query(`UPDATE reservation SET status = 'settled', settled_inr_milli = $2, overrun_inr_milli = $3, settled_at = now() WHERE id = $1`,
    [reservationId, charge, overrun]);
  await q.query('UPDATE wallet SET balance_inr_milli = balance_inr_milli - $2, updated_at = now() WHERE workspace_id = $1', [ws.workspace_id, charge]);
  if (r.budget_ids.length) await q.query('UPDATE budget SET spent_inr_milli = spent_inr_milli + $2 WHERE id = ANY($1)', [r.budget_ids, charge]);
}

/** Return a hold untouched (the action never happened). */
export async function release(q: Queryable, reservationId: string): Promise<void> {
  await q.query(`UPDATE reservation SET status = 'released' WHERE id = $1 AND status = 'held'`, [reservationId]);
}
