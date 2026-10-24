// Memory keeps a person's words only as long as it says it does (DPDP storage limitation). The nightly memory.retention
// sweep deletes, for good:
//   expired facts       past expires_at (call_to_call 30 days, durable 365 days from when they were said)
//   unreviewed facts    review-tier facts nobody approved within 14 days of being proposed
//   extraction rows     memory_extraction receipts older than the workspace's transcripts window (counts only, but
//                       they name the conversation; nothing needs them once its words are gone)
// Deleting is final: a superseded older value keeps pointing at the deleted winner, so it never resurfaces (the same
// rule as fact.forget). Each workspace gets one audit row per run that says how many of each went, never what.
import type pg from 'pg';
import { many, tx, type Queryable } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import { retentionPolicy } from '../intake/retention.ts';
import { RETENTION_DAYS } from './gates.ts';

export const UNREVIEWED_DAYS = 14;

export interface SweepCounts { expired: number; unreviewed: number; extractions: number }

export async function sweepMemory(pool: pg.Pool, opts: { workspaceId?: string; now?: Date } = {}): Promise<Record<string, SweepCounts>> {
  const now = opts.now ?? new Date();
  const wss = await many<{ id: string }>(pool, `SELECT DISTINCT workspace_id AS id FROM (
      SELECT workspace_id FROM memory_fact UNION SELECT workspace_id FROM memory_extraction) w
    WHERE $1::uuid IS NULL OR workspace_id = $1::uuid`, [opts.workspaceId ?? null]);
  const out: Record<string, SweepCounts> = {};
  for (const { id: ws } of wss) {
    const { policy } = await retentionPolicy(pool, ws);
    const c = await tx(pool, async q => {
      const expired = (await q.query('DELETE FROM memory_fact WHERE workspace_id = $1 AND expires_at IS NOT NULL AND expires_at <= $2', [ws, now])).rowCount ?? 0;
      const unreviewed = (await q.query(`DELETE FROM memory_fact WHERE workspace_id = $1 AND status = 'proposed' AND created_at <= $2::timestamptz - make_interval(days => $3)`,
        [ws, now, UNREVIEWED_DAYS])).rowCount ?? 0;
      const extractions = (await q.query('DELETE FROM memory_extraction WHERE workspace_id = $1 AND created_at <= $2::timestamptz - make_interval(days => $3)',
        [ws, now, policy.transcripts_days])).rowCount ?? 0;
      const counts = { expired, unreviewed, extractions };
      if (expired || unreviewed || extractions)
        await appendAudit(q, { workspaceId: ws, actorType: 'system', actorId: 'memory.retention', action: 'memory.retention_sweep', payload: counts });
      return counts;
    });
    out[ws] = c;
  }
  return out;
}

/** For memory.policy.get: what the retention rules are, what is due now, and what the last sweep removed. */
export async function retentionStatus(q: Queryable, ws: string) {
  const { policy } = await retentionPolicy(q, ws);
  const due = (await many<{ expired: number; unreviewed: number }>(q, `SELECT
      count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= now())::int AS expired,
      count(*) FILTER (WHERE status = 'proposed' AND created_at <= now() - make_interval(days => $2))::int AS unreviewed
    FROM memory_fact WHERE workspace_id = $1`, [ws, UNREVIEWED_DAYS]))[0];
  const last = (await many<{ at: Date; payload: SweepCounts }>(q, `SELECT created_at AS at, payload FROM audit_event
    WHERE workspace_id = $1 AND action = 'memory.retention_sweep' ORDER BY created_at DESC LIMIT 1`, [ws]))[0];
  return {
    rules: { callToCallDays: RETENTION_DAYS.call_to_call, durableDays: RETENTION_DAYS.durable, unreviewedDays: UNREVIEWED_DAYS, extractionReceiptsDays: policy.transcripts_days },
    dueNow: due ?? { expired: 0, unreviewed: 0 },
    lastSweep: last ? { at: last.at.toISOString(), ...last.payload } : null,
  };
}
