// One way to record an outcome verified by a system of record: a payment, booking or CRM webhook (integrations) or a
// file the business exports from that system (outcome.import). It runs on the caller's Queryable so an import writes all
// its rows in one transaction. Deduplicated on the key {source, ref}: a retried delivery or a re-imported row is a no-op.
// The best grade wins everywhere (refreshOutcome), so learning and calibration read a verified outcome first.
import type { Queryable } from '../../db.ts';
import { one } from '../../db.ts';
import { refreshOutcome } from './analysis.ts';

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
