// Forget everything remembered about one contact, on the caller's Queryable so it joins the caller's transaction
// (intake's DPDP erasure, contact.memory.forget). Rows are deleted, not hidden. superseded_by has no FK, so nothing
// can resurface, and the brief reads only rows that exist, so the next brief excludes them.
import type { Queryable } from '../../db.ts';

export async function forgetContactMemory(q: Queryable, workspaceId: string, contactId: string): Promise<{ facts: number }> {
  const r = await q.query('DELETE FROM memory_fact WHERE workspace_id = $1 AND contact_id = $2', [workspaceId, contactId]);
  return { facts: r.rowCount ?? 0 };
}
