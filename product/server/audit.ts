// Hash-chained audit log. Each row's hash covers the previous row's hash and this row's payload,
// so any edit or deletion in the middle of a workspace's history breaks the chain and is detectable.
// Appends are serialised per workspace with a transaction-scoped advisory lock.
import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/approval.ts';
import type { Queryable } from './db.ts';

export interface AuditInput {
  workspaceId: string;
  actorType: 'member' | 'agent' | 'vp_success' | 'system';
  actorId?: string;
  action: string;
  objectType?: string;
  objectId?: string;
  argsHash?: string;
  payload?: Record<string, unknown>;
}

function rowHash(prev: string | null, a: AuditInput): string {
  const body = canonicalJson({
    actorType: a.actorType, actorId: a.actorId ?? null, action: a.action,
    objectType: a.objectType ?? null, objectId: a.objectId ?? null, argsHash: a.argsHash ?? null, payload: a.payload ?? {},
  });
  return createHash('sha256').update((prev ?? '') + '\n' + body).digest('hex');
}

/** Append one event. Must be called inside a transaction (the lock is transaction-scoped). */
export async function appendAudit(q: Queryable, a: AuditInput): Promise<string> {
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['audit:' + a.workspaceId]);
  const last = await q.query('SELECT hash FROM audit_event WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [a.workspaceId]);
  const prev: string | null = last.rows[0]?.hash ?? null;
  const hash = rowHash(prev, a);
  await q.query(
    `INSERT INTO audit_event (workspace_id, actor_type, actor_id, action, object_type, object_id, args_hash, payload, prev_hash, hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, clock_timestamp())`,
    [a.workspaceId, a.actorType, a.actorId ?? null, a.action, a.objectType ?? null, a.objectId ?? null, a.argsHash ?? null, a.payload ?? {}, prev, hash],
  );
  return hash;
}

/** Re-walk a workspace's chain; returns the first broken row id, or null if intact. */
export async function verifyAudit(q: Queryable, workspaceId: string): Promise<string | null> {
  const r = await q.query(
    'SELECT id, actor_type, actor_id, action, object_type, object_id, args_hash, payload, prev_hash, hash FROM audit_event WHERE workspace_id = $1 ORDER BY created_at, id',
    [workspaceId],
  );
  let prev: string | null = null;
  for (const row of r.rows) {
    const expect = rowHash(prev, {
      workspaceId, actorType: row.actor_type, actorId: row.actor_id ?? undefined, action: row.action,
      objectType: row.object_type ?? undefined, objectId: row.object_id ?? undefined, argsHash: row.args_hash ?? undefined, payload: row.payload,
    });
    if (row.prev_hash !== prev || row.hash !== expect) return row.id;
    prev = row.hash;
  }
  return null;
}
