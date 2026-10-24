// Holds that would otherwise leak (review MA-09). A hold is money the wallet and every tagged cap keep counting until
// the call settles or releases it. When the dial was never confirmed, or the runtime went silent past the longest call
// it could have made, nothing else will ever do that, so the sweep releases it and opens one issue per attempt.
// If cost for that attempt arrives later, reconcile() charges it under a new hold (late_of) with an issue: never dropped.
import { release } from '../../ledger.ts';
import { many, type Queryable } from '../../db.ts';

/** The longest call a campaign may make when its policy does not say (campaigns' validator allows up to 3600 s). */
export const MAX_CALL_S = 3600;
/** Time past the longest call before a silent runtime counts as gone (late events, clock skew, slow hang-up). */
export const GRACE_S = 15 * 60;

export interface Swept { reservationId: string; attemptId: string; inrMilli: number; reason: 'dispatch_unconfirmed' | 'runtime_silent' }

/** Release holds whose dial will never report. ws = null sweeps every workspace (the job). */
export async function sweepHolds(q: Queryable, ws: string | null, now: Date = new Date()): Promise<Swept[]> {
  const rows = await many<{ id: string; workspace_id: string; attempt_id: string; inr: string; reason: Swept['reason'] }>(q,
    `SELECT r.id, r.workspace_id, r.attempt_id, r.inr_milli::text AS inr,
            CASE WHEN a.status = 'unknown' AND a.carrier_code = 'dispatch_unconfirmed' THEN 'dispatch_unconfirmed' ELSE 'runtime_silent' END AS reason
     FROM reservation r
     JOIN attempt a ON a.id = r.attempt_id AND a.workspace_id = r.workspace_id
     LEFT JOIN campaign c ON c.id = a.campaign_id AND c.workspace_id = a.workspace_id
     WHERE r.status = 'held' AND ($1::uuid IS NULL OR r.workspace_id = $1::uuid)
       AND (
         -- the runtime never had the ticket: release at once
         (a.status = 'unknown' AND a.carrier_code = 'dispatch_unconfirmed')
         -- the call cannot still be running: older than its longest possible call plus a grace, with no ended call
         OR (r.created_at < $2::timestamptz - make_interval(secs => coalesce((c.policy->>'maxDurationS')::int, ${MAX_CALL_S}) + ${GRACE_S})
             AND NOT EXISTS (SELECT 1 FROM conversation v WHERE v.attempt_id = a.id AND v.workspace_id = a.workspace_id AND v.status <> 'live'))
       )
     FOR UPDATE OF r SKIP LOCKED`, [ws, now]);
  const out: Swept[] = [];
  for (const r of rows) {
    await release(q, r.id);
    await q.query("UPDATE reservation SET released_reason = $2, released_at = $3 WHERE id = $1 AND status = 'released'", [r.id, 'sweep:' + r.reason, now]);
    await q.query(`INSERT INTO issue (workspace_id, category, severity, subject_type, subject_id, detail)
       SELECT $1, 'money_hold_released', 'warning', 'attempt', $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM issue WHERE workspace_id = $1 AND category = 'money_hold_released' AND subject_id = $2)`,
      [r.workspace_id, r.attempt_id, { reservationId: r.id, inrMilli: Number(r.inr), reason: r.reason,
        fix: r.reason === 'dispatch_unconfirmed'
          ? 'the dial was never confirmed, so the held money was returned; if the call did happen its cost is charged when it is reported'
          : 'the runtime never reported this call past its longest possible length, so the held money was returned; check the runtime; late cost is still charged' }]);
    out.push({ reservationId: r.id, attemptId: r.attempt_id, inrMilli: Number(r.inr), reason: r.reason });
  }
  return out;
}
