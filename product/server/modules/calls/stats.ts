// Numbers the calls module reports: judge calibration (Wilson score interval) and the campaign funnel.
// Test calls never enter either (CallTicket.test: they never count toward outcomes or learning).
import type { Queryable } from '../../db.ts';
import { many } from '../../db.ts';
import { EARLY_HANGUP_S } from './taxonomy.ts';
import { GOAL_GRADE_SQL, GOAL_SQL } from './goal.ts';

/** Lower bound of the Wilson score interval for k successes in n trials (95% by default). */
export function wilsonLower(k: number, n: number, z = 1.959964): number {
  if (n <= 0) return 0;
  const p = k / n, z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / (1 + z2 / n));
}

// A label is trusted at 0.90 agreement with a Wilson 95% lower bound of 0.80 on 50+ paired calls (blueprint F4).
export const TRUST = { minN: 50, agreement: 0.9, lower: 0.8 } as const;

export type CalibrationStatus = 'uncalibrated' | 'calibrating' | 'trusted' | 'not_trusted';

export function calibrationStatus(n: number, agreement: number, lower: number): CalibrationStatus {
  if (n === 0) return 'uncalibrated';
  if (n < TRUST.minN) return 'calibrating';
  return agreement >= TRUST.agreement && lower >= TRUST.lower ? 'trusted' : 'not_trusted';
}

// The outcome that counts for a conversation: verified beats a manager's label beats an AI guess.
export const BEST_OUTCOME = `(SELECT o.value FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id
   ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1)`;
export const BEST_GRADE = `(SELECT o.grade FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id
   ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1)`;

export interface FunnelRow {
  agentVersionId: string | null;
  dialled: number; connected: number; talked: number; goalReached: number;
  goalByGrade: { verified: number; manager: number; ai_guess: number };
}

/** Dialled -> connected (a person) -> talked (10 s+ and a caller turn) -> goal reached, per agent version. */
export async function campaignFunnel(q: Queryable, workspaceId: string, campaignId: string): Promise<{ total: FunnelRow; byVersion: FunnelRow[]; goalValues: string[] }> {
  const rows = await many<{ v: string | null; dialled: string; connected: string; talked: string; goal_verified: string; goal_manager: string; goal_ai: string; goals: string[] | null }>(q,
    `WITH def AS (SELECT d.goal_values FROM campaign c JOIN outcome_definition d ON d.id = c.outcome_definition_id AND d.workspace_id = c.workspace_id
                  WHERE c.id = $2 AND c.workspace_id = $1),
     a AS (
       SELECT at.id, cv.id AS conv, cv.agent_version_id AS v, cv.duration_s, cv.end_reason, cv.status AS conv_status, at.status,
              (SELECT count(*) FROM turn t WHERE t.conversation_id = cv.id AND t.speaker = 'caller') AS caller_turns,
              ${GOAL_SQL('cv')} AS goal, ${GOAL_GRADE_SQL('cv')} AS grade
       FROM attempt at
       LEFT JOIN LATERAL (SELECT * FROM conversation x WHERE x.attempt_id = at.id AND x.workspace_id = at.workspace_id AND x.channel <> 'test'
                          ORDER BY x.started_at DESC LIMIT 1) cv ON true
       WHERE at.workspace_id = $1 AND at.campaign_id = $2 AND at.status NOT IN ('created','blocked','queued'))
     SELECT v,
       count(*) AS dialled,
       -- A call that has not reported its end (still live, or dispatched and silent) is not counted as connected yet.
       count(*) FILTER (WHERE conv IS NOT NULL AND conv_status <> 'live' AND end_reason IS NOT NULL AND end_reason NOT IN ('no_answer','busy','failed')
                              OR (conv IS NULL AND status = 'connected')) AS connected,
       count(*) FILTER (WHERE conv_status <> 'live' AND duration_s >= ${EARLY_HANGUP_S} AND caller_turns > 0) AS talked,
       -- Goal reached: calls/goal.ts, the one definition (best outcome in its own definition's goal values), by grade.
       count(*) FILTER (WHERE goal AND grade = 'verified') AS goal_verified,
       count(*) FILTER (WHERE goal AND grade = 'manager') AS goal_manager,
       count(*) FILTER (WHERE goal AND grade = 'ai_guess') AS goal_ai,
       (SELECT goal_values FROM def) AS goals
     FROM a GROUP BY v ORDER BY v NULLS LAST`, [workspaceId, campaignId]);
  const toRow = (r: typeof rows[number]): FunnelRow => {
    const g = { verified: Number(r.goal_verified), manager: Number(r.goal_manager), ai_guess: Number(r.goal_ai) };
    return { agentVersionId: r.v, dialled: Number(r.dialled), connected: Number(r.connected), talked: Number(r.talked),
      goalReached: g.verified + g.manager + g.ai_guess, goalByGrade: g };
  };
  const byVersion = rows.map(toRow);
  const total = byVersion.reduce<FunnelRow>((t, r) => ({
    agentVersionId: null, dialled: t.dialled + r.dialled, connected: t.connected + r.connected, talked: t.talked + r.talked,
    goalReached: t.goalReached + r.goalReached,
    goalByGrade: { verified: t.goalByGrade.verified + r.goalByGrade.verified, manager: t.goalByGrade.manager + r.goalByGrade.manager, ai_guess: t.goalByGrade.ai_guess + r.goalByGrade.ai_guess },
  }), { agentVersionId: null, dialled: 0, connected: 0, talked: 0, goalReached: 0, goalByGrade: { verified: 0, manager: 0, ai_guess: 0 } });
  return { total, byVersion, goalValues: rows[0]?.goals ?? [] };
}
