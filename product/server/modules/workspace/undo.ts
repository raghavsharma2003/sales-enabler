// action.undo: restore the "before" of a draft-class change that kept a revision. Anything else is refused with the reason.
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { num, obj, opt, uuid } from '../../../shared/validate.ts';
import { BRAND_FIELDS } from './brand.ts';

/** What a person is told when they try to undo a change that keeps no history. */
const NOT_UNDOABLE: [RegExp, string][] = [
  [/^member\./, 'Changes to who is in the workspace and what they can do are not undone automatically; change the role or invite again.'],
  [/^apikey\./, 'An API key cannot be un-created or un-revoked; revoke it, or create a new one.'],
  [/^(integration|webhook|share)\./, 'Connections, webhooks and share links are not undone automatically; disconnect or delete them, or create them again.'],
  [/^brand\.cnap_name/, 'The caller name is a policy change; set the previous name again with brand.cnap_name.set.'],
  [/^knowledge\./, 'Reviewing passages is not undone automatically; approve or strike them again.'],
  [/^(campaign|call|number|wallet|money)\./, 'This reached people or money, which cannot be taken back; the receipt says what can be stopped.'],
];

interface Rev { id: string; object_type: string; object_id: string; tool: string; before: Record<string, unknown> | null; after: unknown; summary: string; undone_at: Date | null; created_at: Date }

export function registerUndo(r: Registry) {
  r.register(tool(obj({ revisionId: opt(uuid()), auditEventId: opt(uuid()) }), {
    name: 'action.undo', risk: 'draft', summary: 'Undo a recent brand or offering change by restoring how it was before',
    run: async (ctx, i) => {
      if (!i.revisionId && !i.auditEventId) throw new Error('say which change to undo (a revision id from revision.list, or an audit event id from the activity list)');
      if (i.auditEventId && !i.revisionId) {
        const ev = await one<{ action: string }>(ctx.q, 'SELECT action FROM audit_event WHERE id = $1 AND workspace_id = $2', [i.auditEventId, ctx.workspaceId]);
        if (!ev) throw new Error('no such activity in this workspace');
        const why = NOT_UNDOABLE.find(([re]) => re.test(ev.action));
        throw new Error(why ? why[1] : 'that change keeps no version history, so it cannot be undone; use revision.list to see what can be');
      }
      const rev = await one<Rev>(ctx.q, 'SELECT * FROM workspace_revision WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.revisionId, ctx.workspaceId]);
      if (!rev) throw new Error('no such change in this workspace');
      if (rev.undone_at) throw new Error('that change was already undone');
      const newer = await one<{ summary: string }>(ctx.q,
        `SELECT summary FROM workspace_revision WHERE workspace_id = $1 AND object_type = $2 AND object_id = $3 AND undone_at IS NULL
           AND created_at > (SELECT created_at FROM workspace_revision WHERE id = $4) ORDER BY created_at LIMIT 1`,
        [ctx.workspaceId, rev.object_type, rev.object_id, rev.id]);
      if (newer) throw new Error(`a newer change was made after this one ("${newer.summary}"); undo that first`);

      if (rev.object_type === 'brand') {
        if (!rev.before) throw new Error('this change created the brand; a brand is not removed by undo, edit it instead');
        const cols = Object.keys(BRAND_FIELDS);
        await ctx.q.query(`UPDATE brand SET ${cols.map((c, n) => `${c} = $${n + 3}`).join(', ')}, updated_at = now() WHERE id = $1 AND workspace_id = $2`,
          [rev.object_id, ctx.workspaceId, ...cols.map(c => rev.before![c] ?? null)]);
      } else if (rev.object_type === 'offering') {
        if (!rev.before) await ctx.q.query('UPDATE offering SET archived_at = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2', [rev.object_id, ctx.workspaceId]);
        else await ctx.q.query('UPDATE offering SET name = $3, facts = $4, never_say = $5, archived_at = $6, updated_at = now() WHERE id = $1 AND workspace_id = $2',
          [rev.object_id, ctx.workspaceId, rev.before.name, JSON.stringify(rev.before.facts), JSON.stringify(rev.before.never_say), rev.before.archived_at ?? null]);
      } else throw new Error(`${rev.object_type} changes cannot be undone`);
      await ctx.q.query('UPDATE workspace_revision SET undone_at = now() WHERE id = $1', [rev.id]);
      return { undone: rev.summary, revisionId: rev.id, restored: rev.before ? 'the previous version' : 'nothing (the offering is archived)' };
    },
  }));

  r.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'revision.list', risk: 'read', summary: 'List recent changes that can be undone',
    run: async (ctx, i) => ({
      revisions: await many(ctx.q, `SELECT id, object_type AS "objectType", object_id AS "objectId", tool, summary, actor_id AS "actorId", undone_at AS "undoneAt", created_at AS "createdAt"
        FROM workspace_revision WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`, [ctx.workspaceId, i.limit ?? 30]),
    }),
  }));
}
