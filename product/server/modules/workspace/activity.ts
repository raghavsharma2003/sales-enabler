// activity.list: the hash-chained audit log, newest first, one plain-words line per event.
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many } from '../../db.ts';
import { num, obj, opt, str } from '../../../shared/validate.ts';

const PHRASE: Record<string, string> = {
  'workspace.create': 'created the workspace',
  'member.invite': 'invited a teammate', 'member.role.set': 'changed a teammate\'s role', 'member.remove': 'removed a teammate', 'member.accept_invite': 'joined the workspace',
  'apikey.create': 'created an API key', 'apikey.revoke': 'revoked an API key', 'secret.reveal': 'looked at a new secret (it can be shown only once)',
  'brand.update': 'edited the brand details', 'brand.cnap_name.set': 'changed the caller name shown on calls',
  'knowledge.ingest': 'added a document to the knowledge base', 'knowledge.span.approve': 'reviewed passages of the knowledge base',
  'offering.edit': 'edited an offering', 'action.undo': 'undid a change',
  'integration.stage_secrets': 'handed over credentials for an integration', 'integration.connect': 'connected an integration', 'integration.disconnect': 'disconnected an integration',
  'webhook.create': 'added a webhook', 'webhook.delete': 'deleted a webhook', 'webhook.replay': 'sent a webhook event again',
  'share.link.create': 'made a share link', 'share.link.revoke': 'turned off a share link',
  'action.decline': 'declined a proposed change',
};

const humanise = (a: string) => PHRASE[a] ?? `ran ${a.replace(/[._]/g, ' ')}`;

type Row = { id: string; actor_type: string; actor_id: string | null; action: string; object_type: string | null; object_id: string | null; payload: Record<string, unknown>; at: string; t: string };

export function registerActivity(r: Registry) {
  r.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 100 })), cursor: opt(str({ max: 200 })), actionPrefix: opt(str({ max: 60, pattern: /^[a-z0-9_.]+$/ })), actorId: opt(str({ max: 80 })) }), {
    name: 'activity.list', risk: 'read', summary: 'See who did what in this workspace, in plain words',
    run: async (ctx, i) => {
      const limit = i.limit ?? 30;
      let after: { t: string; id: string } | null = null;
      if (i.cursor) {
        try { after = JSON.parse(Buffer.from(i.cursor, 'base64url').toString('utf8')); } catch { throw new Error('that page marker is not valid'); }
        if (!after || typeof after.t !== 'string' || !/^[0-9a-f-]{36}$/i.test(String(after.id))) throw new Error('that page marker is not valid');
      }
      const rows = await many<Row>(ctx.q, `SELECT id, actor_type, actor_id, action, object_type, object_id, payload,
          to_char(created_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t, created_at AS at
        FROM audit_event WHERE workspace_id = $1
          AND ($2::text IS NULL OR action LIKE $2 || '%') AND ($3::text IS NULL OR actor_id = $3)
          AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
        ORDER BY created_at DESC, id DESC LIMIT $6`, [ctx.workspaceId, i.actionPrefix ?? null, i.actorId ?? null, after?.t ?? null, after?.id ?? null, limit + 1]);
      const page = rows.slice(0, limit);

      const memberIds = page.map(r => r.actor_id).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x));
      const keyIds = page.map(r => r.actor_id).filter((x): x is string => !!x && x.startsWith('key:')).map(x => x.slice(4));
      const members = new Map((await many<{ id: string; label: string }>(ctx.q, "SELECT id, coalesce(name, email) AS label FROM member WHERE workspace_id = $1 AND id = ANY($2::uuid[])", [ctx.workspaceId, memberIds])).map(m => [m.id, m.label]));
      const keys = new Map((await many<{ id: string; name: string }>(ctx.q, 'SELECT id, name FROM api_key WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ctx.workspaceId, keyIds])).map(k => [k.id, k.name]));

      const who = (r: Row) => r.actor_id?.startsWith('key:') ? `The API key "${keys.get(r.actor_id.slice(4)) ?? 'unknown'}"`
        : r.actor_type === 'member' ? (members.get(r.actor_id ?? '') ?? 'A teammate')
        : r.actor_type === 'agent' ? 'An agent' : r.actor_type === 'vp_success' ? 'The VP team' : 'VP';
      const items = page.map(r => {
        const proposed = r.action === 'action.propose' ? String(r.payload.tool ?? '') : '';
        const line = proposed ? `${who(r)} asked to ${humanise(proposed).replace(/^ran /, 'run ')} and is waiting for approval`
          : `${who(r)} ${humanise(r.action)}${r.payload.mode === 'A2' ? ' (approved)' : ''}${r.payload.outcome === 'unknown' ? ' (outcome not confirmed)' : ''}`;
        return { id: r.id, at: r.at, line, action: r.action, actor: { type: r.actor_type, id: r.actor_id }, object: r.object_type ? { type: r.object_type, id: r.object_id } : null };
      });
      const last = page[page.length - 1];
      return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ t: last.t, id: last.id })).toString('base64url') : null };
    },
  }));
}
