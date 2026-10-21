// Share links: an expiring, signed, read-only view of one object. The token is the whole credential (shown once to the
// approver); the share_link row lets it be revoked early. The public GET route never reveals why a link failed.
import type pg from 'pg';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { holdForReveal } from './common.ts';
import { signShare, verifyShare } from './crypto.ts';

const TYPES = ['agent', 'campaign', 'call', 'offering'] as const;
type ShareType = (typeof TYPES)[number];

/** Read-only views: only fields that are safe for an outsider; never prompts' secrets, numbers or transcripts of other people. */
const VIEWS: Record<ShareType, string> = {
  agent: "SELECT id, name, job, status, updated_at AS \"updatedAt\" FROM agent WHERE id = $1 AND workspace_id = $2",
  campaign: "SELECT id, name, state, call_category AS \"callCategory\", created_at AS \"createdAt\" FROM campaign WHERE id = $1 AND workspace_id = $2",
  call: "SELECT id, channel, direction, status, outcome, started_at AS \"startedAt\", ended_at AS \"endedAt\", transcript FROM conversation WHERE id = $1 AND workspace_id = $2",
  offering: "SELECT id, name, facts, never_say AS \"neverSay\" FROM offering WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL",
};

export async function viewShared(pool: pg.Pool, token: string): Promise<{ type: ShareType; object: unknown; expiresAt: string } | null> {
  const c = verifyShare(token);
  if (!c || !(TYPES as readonly string[]).includes(c.t)) return null;
  const link = await one<{ expires_at: Date }>(pool, 'SELECT expires_at FROM share_link WHERE id = $1 AND workspace_id = $2 AND object_type = $3 AND object_id = $4 AND revoked_at IS NULL AND expires_at > now()', [c.l, c.w, c.t, c.o]);
  if (!link) return null;
  const object = await one(pool, VIEWS[c.t as ShareType], [c.o, c.w]);
  return object ? { type: c.t as ShareType, object, expiresAt: link.expires_at.toISOString() } : null;
}

export function registerShare(r: Registry) {
  r.register(tool(obj({ objectType: str({ oneOf: TYPES }), objectId: uuid(), ttlHours: opt(num({ int: true, min: 1, max: 720 })) }), {
    name: 'share.link.create', risk: 'policy', summary: 'Make a link that lets anyone who has it read one item, until it expires',
    describe: i => `Share one ${i.objectType} read-only with anyone who has the link, for ${i.ttlHours ?? 72} hours`,
    run: async (ctx, i) => {
      const exists = await one(ctx.q, VIEWS[i.objectType as ShareType], [i.objectId, ctx.workspaceId]);
      if (!exists) throw new Error(`no such ${i.objectType} in this workspace`);
      const ttl = (i.ttlHours ?? 72) * 3600_000, exp = Date.now() + ttl;
      const row = await one<{ id: string }>(ctx.q, 'INSERT INTO share_link (workspace_id, object_type, object_id, expires_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [ctx.workspaceId, i.objectType, i.objectId, new Date(exp), ctx.actor.id ?? ctx.actor.type]);
      const token = signShare({ l: row!.id, w: ctx.workspaceId, t: i.objectType, o: i.objectId, e: exp });
      const revealId = await holdForReveal(ctx, { path: `/v1/share/${token}` }, 'share link');
      return { id: row!.id, objectType: i.objectType, expiresAt: new Date(exp).toISOString(), revealId };
    },
  }));

  r.register(tool(obj({}), {
    name: 'share.link.list', risk: 'read', summary: 'List share links and when they expire (not the links themselves)',
    run: async ctx => ({ links: await many(ctx.q, `SELECT id, object_type AS "objectType", object_id AS "objectId", expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"
      FROM share_link WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`, [ctx.workspaceId]) }),
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'share.link.revoke', risk: 'draft', summary: 'Turn a share link off at once',
    run: async (ctx, i) => {
      const n = await ctx.q.query('UPDATE share_link SET revoked_at = coalesce(revoked_at, now()) WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]);
      if (!n.rowCount) throw new Error('no such share link in this workspace');
      return { id: i.id, revoked: true };
    },
  }));
}
