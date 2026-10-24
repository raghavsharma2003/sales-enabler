// "Goal reached", defined once (closes open.2026-10-23.q-goal-key-vs-goal-semantics). A call reached its goal when its
// best outcome (verified, then a person's label, then an AI guess) is one of the goal values of that outcome's own
// definition (outcome.definition_id), so calls outside a campaign count too. The grade travels beside the answer and is
// never folded into it: the funnel shows goals by grade, and learning additionally requires a trusted grade
// (conversation.outcome). The reason code follows the outcome: CONV_GOAL_DONE exactly when the goal is reached, wherever
// the goal is knowable (the call has an outcome on a definition with goal values). Code the engine decided (no answer,
// opt-out, crisis, an early hang-up) is never rewritten.
import type { Queryable } from '../../db.ts';

const BEST = (a: string) => `FROM outcome o LEFT JOIN outcome_definition d ON d.id = o.definition_id AND d.workspace_id = o.workspace_id
  WHERE o.conversation_id = ${a}.id AND o.workspace_id = ${a}.workspace_id
  ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1`;

/** SQL boolean: the call (alias a) reached its goal. */
export const GOAL_SQL = (a = 'cv') => `coalesce((SELECT o.value = ANY(coalesce(d.goal_values, '{}'::text[])) ${BEST(a)}), false)`;
/** SQL: the grade of the outcome that decided GOAL_SQL (null when the call has no outcome). */
export const GOAL_GRADE_SQL = (a = 'cv') => `(SELECT o.grade ${BEST(a)})`;
/** SQL boolean: whether the goal is knowable for this call at all: an outcome on a definition that names goal values, or a
 *  campaign whose outcome definition names them (then no outcome means the goal was not reached). */
export const GOAL_KNOWN_SQL = (a = 'cv') => `(EXISTS (SELECT 1 FROM outcome o JOIN outcome_definition d ON d.id = o.definition_id AND d.workspace_id = o.workspace_id
    WHERE o.conversation_id = ${a}.id AND o.workspace_id = ${a}.workspace_id AND cardinality(d.goal_values) > 0)
  OR EXISTS (SELECT 1 FROM attempt at JOIN campaign c ON c.id = at.campaign_id AND c.workspace_id = at.workspace_id
    JOIN outcome_definition d ON d.id = c.outcome_definition_id AND d.workspace_id = c.workspace_id
    WHERE at.id = ${a}.attempt_id AND at.workspace_id = ${a}.workspace_id AND cardinality(d.goal_values) > 0))`;

/** Reason codes the goal may rewrite: the model's conversation codes and the two the engine leaves open. */
const FOLLOWS_GOAL = `(cv.reason_code LIKE 'CONV\\_%' OR cv.reason_code = 'END_HUNG_UP_MID')`;

/** Make the reason code agree with the outcome. Call whenever a call's outcomes change. */
export async function syncGoalReason(q: Queryable, workspaceId: string, conversationId: string): Promise<void> {
  await q.query(`UPDATE conversation cv SET reason_code = CASE WHEN ${GOAL_SQL()} THEN 'CONV_GOAL_DONE'
        WHEN cv.reason_code = 'CONV_GOAL_DONE' THEN 'CONV_INCOMPLETE' ELSE cv.reason_code END
      WHERE cv.id = $1 AND cv.workspace_id = $2 AND ${FOLLOWS_GOAL} AND ${GOAL_KNOWN_SQL()}`, [conversationId, workspaceId]);
}
