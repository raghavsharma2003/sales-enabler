// One way to record an outcome verified by a system of record: a payment, booking or CRM webhook (integrations) or a
// file the business exports from that system (outcome.import). It runs on the caller's Queryable so an import writes all
// its rows in one transaction. Deduplicated on the key {source, ref}: a retried delivery or a re-imported row is a no-op.
// The best grade wins everywhere (refreshOutcome), so learning and calibration read a verified outcome first.
import type { Queryable } from '../../db.ts';
import { many, one } from '../../db.ts';
import { refreshOutcome } from './analysis.ts';
import { wilsonLower } from './stats.ts';

export interface VerifiedInput {
  conversationId: string;
  definitionId: string;
  value: string;
  key: { source: string; ref: string };
  evidence?: Record<string, unknown>;     // shown on the call page; never a quote of the person
}

export async function recordVerified(q: Queryable, workspaceId: string, i: VerifiedInput): Promise<{ ok: true; grade?: 'verified'; duplicate?: true }> {
  const c = await one<{ id: string; channel: string; contact_id: string | null }>(q, 'SELECT id, channel, contact_id FROM conversation WHERE id = $1 AND workspace_id = $2', [i.conversationId, workspaceId]);
  if (!c) throw new Error('no such call in this workspace');
  if (c.channel === 'test') throw new Error('test calls do not take outcomes');
  const d = await one<{ allowed_values: string[] }>(q, 'SELECT allowed_values FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [i.definitionId, workspaceId]);
  if (!d) throw new Error('no such outcome definition in this workspace');
  if (!d.allowed_values.includes(i.value)) throw new Error(`"${i.value}" is not an allowed value (${d.allowed_values.join(', ')})`);
  const dup = await one(q, `SELECT 1 FROM outcome WHERE workspace_id = $1 AND grade = 'verified' AND evidence->'key' = $2::jsonb`, [workspaceId, JSON.stringify(i.key)]);
  if (dup) return { ok: true, duplicate: true };
  await q.query(`INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence) VALUES ($1,$2,$3,$4,$5,'verified',$6,$7)`,
    [workspaceId, c.id, c.contact_id, i.definitionId, i.value, i.key.source, { ...(i.evidence ?? {}), key: i.key }]);
  await refreshOutcome(q, workspaceId, c.id);
  return { ok: true, grade: 'verified' };
}

// ---- Shared readings for other modules (learning's rewards; called through the registry, never by reading tables) ----

export interface OutcomeReading {
  conversationId: string;
  counted: string | null;                                 // the outcome that counts (conversation.outcome)
  grade: 'verified' | 'manager' | 'ai_guess' | null;      // where the counted outcome came from
  aiRead: string | null;                                  // the AI's latest read, counted or not
  judgeVersionId: string | null;
  judgeStatus: string | null;                             // that judge's latest calibration status
  judgeAgreement: number | null;
  verified: string | null;                                // the verified value, when one exists
}

/** One row per live call asked about (a test call is never returned). The counted outcome follows refreshOutcome's rule:
 *  verified, then a manager's label, then an AI read only when its judge's latest calibration is trusted. */
export async function outcomeReadings(q: Queryable, workspaceId: string, ids: string[]): Promise<OutcomeReading[]> {
  if (!ids.length) return [];
  const rows = await many<any>(q, `SELECT cv.id AS conversation_id, cv.outcome AS counted,
      (SELECT o.grade FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id AND o.value = cv.outcome
         AND (o.grade IN ('verified','manager') OR (o.grade = 'ai_guess' AND o.judge_version_id IS NOT NULL AND
              (SELECT k.status FROM calibration k WHERE k.judge_version_id = o.judge_version_id ORDER BY k.created_at DESC LIMIT 1) = 'trusted'))
       ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1) AS grade,
      ai.value AS ai_read, ai.judge_version_id,
      (SELECT k.status FROM calibration k WHERE k.judge_version_id = ai.judge_version_id ORDER BY k.created_at DESC LIMIT 1) AS judge_status,
      (SELECT k.agreement::float FROM calibration k WHERE k.judge_version_id = ai.judge_version_id ORDER BY k.created_at DESC LIMIT 1) AS judge_agreement,
      (SELECT o.value FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id AND o.grade = 'verified' ORDER BY o.created_at DESC LIMIT 1) AS verified
    FROM conversation cv
    LEFT JOIN LATERAL (SELECT o.value, o.judge_version_id FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id AND o.grade = 'ai_guess'
                       ORDER BY o.created_at DESC LIMIT 1) ai ON true
    WHERE cv.workspace_id = $1 AND cv.id = ANY($2::uuid[]) AND cv.channel <> 'test' AND coalesce(cv.run_manifest->>'test', 'false') <> 'true'`, [workspaceId, ids]);
  return rows.map(r => ({ conversationId: r.conversation_id, counted: r.counted, grade: r.counted ? r.grade : null, aiRead: r.ai_read, judgeVersionId: r.judge_version_id,
    judgeStatus: r.judge_status, judgeAgreement: r.judge_agreement, verified: r.verified }));
}

/** A judge whose reads disagree with verified outcomes is set to 'needs_recheck' (a new calibration row; history kept), and
 *  every call it read is refreshed, so its reads stop counting until a person calibrates it again (judge.calibrate). */
export async function flagJudgeRecheck(q: Queryable, workspaceId: string, i: { judgeVersionId: string; n: number; agreement: number; reason: string }): Promise<{ flagged: boolean; refreshed: number }> {
  const j = await one<{ id: string }>(q, 'SELECT id FROM judge_version WHERE id = $1 AND workspace_id = $2', [i.judgeVersionId, workspaceId]);
  if (!j) throw new Error('no such judge in this workspace');
  const last = await one<{ status: string }>(q, 'SELECT status FROM calibration WHERE judge_version_id = $1 ORDER BY created_at DESC LIMIT 1', [j.id]);
  if (last?.status === 'needs_recheck') return { flagged: false, refreshed: 0 };
  await q.query(`INSERT INTO calibration (judge_version_id, workspace_id, n, agreement, wilson_lower, status, confusion) VALUES ($1,$2,$3,$4,$5,'needs_recheck',$6)`,
    [j.id, workspaceId, i.n, i.agreement, wilsonLower(Math.round(i.agreement * i.n), i.n), JSON.stringify({ reason: i.reason, against: 'verified outcomes' })]);
  const convs = await many<{ id: string }>(q, `SELECT DISTINCT conversation_id AS id FROM outcome WHERE workspace_id = $1 AND judge_version_id = $2 AND grade = 'ai_guess' LIMIT 5000`, [workspaceId, j.id]);
  for (const c of convs) await refreshOutcome(q, workspaceId, c.id);
  return { flagged: true, refreshed: convs.length };
}
