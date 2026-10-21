import type { Queryable } from '../../db.ts';
import { many, one } from '../../db.ts';
import type { ToolCtx } from '../../tools.ts';
import { open, seal } from './crypto.ts';

/** Keys act as builders and cannot approve; an actor id of `key:<id>` marks them. */
export const isKey = (ctx: ToolCtx) => !!ctx.actor.id?.startsWith('key:');
export const actorLabel = (ctx: ToolCtx) => ctx.actor.id ?? ctx.actor.type;

export const REVEAL_TTL_MS = 15 * 60_000;
export const STASH_TTL_MS = 24 * 3600_000;

/** Park a secret for the approving member to read exactly once. The kernel stores an approved action's
 *  result in action.result, so a token must never be in a tool result; the result carries this id instead. */
export async function holdForReveal(ctx: ToolCtx, secret: Record<string, unknown>, label: string): Promise<string> {
  const row = await one<{ id: string }>(ctx.q,
    `INSERT INTO secret_box (workspace_id, member_id, purpose, ciphertext, meta, expires_at)
     VALUES ($1, $2, 'reveal', $3, $4, now() + ($5 || ' milliseconds')::interval) RETURNING id`,
    [ctx.workspaceId, isKey(ctx) ? null : ctx.actor.id ?? null, seal(ctx.workspaceId, 'reveal', JSON.stringify(secret)), { label }, String(REVEAL_TTL_MS)]);
  return row!.id;
}

export async function takeReveal(ctx: ToolCtx, id: string): Promise<{ label: string; secret: Record<string, unknown> } | null> {
  if (isKey(ctx) || !ctx.actor.id) return null;
  const row = await one<{ ciphertext: string; meta: { label?: string } }>(ctx.q,
    `DELETE FROM secret_box WHERE id = $1 AND workspace_id = $2 AND purpose = 'reveal' AND member_id = $3 AND expires_at > now()
     RETURNING ciphertext, meta`, [id, ctx.workspaceId, ctx.actor.id]);
  if (!row) return null;
  return { label: row.meta.label ?? 'secret', secret: JSON.parse(open(ctx.workspaceId, 'reveal', row.ciphertext)) };
}

export type Snapshot = Record<string, unknown> | null;

/** Record a before/after pair for an object so action.undo can restore it. Returns the revision id. */
export async function recordRevision(ctx: ToolCtx, r: { objectType: string; objectId: string; tool: string; before: Snapshot; after: Snapshot; summary: string }): Promise<string> {
  const row = await one<{ id: string }>(ctx.q,
    `INSERT INTO workspace_revision (workspace_id, object_type, object_id, tool, actor_type, actor_id, before, after, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ctx.workspaceId, r.objectType, r.objectId, r.tool, ctx.actor.type, ctx.actor.id ?? null,
      r.before ? JSON.stringify(r.before) : null, r.after ? JSON.stringify(r.after) : null, r.summary]);
  return row!.id;
}

export async function memberName(q: Queryable, workspaceId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uuids = ids.filter(i => /^[0-9a-f-]{36}$/i.test(i));
  if (!uuids.length) return out;
  for (const m of await many<{ id: string; name: string | null; email: string }>(q,
    'SELECT id, name, email FROM member WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [workspaceId, uuids])) out.set(m.id, m.name || m.email);
  return out;
}

/** Escape LIKE wildcards so a search for "50%" does not match everything. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, c => '\\' + c);
