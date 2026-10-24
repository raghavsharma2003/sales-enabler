// activity.list: the hash-chained audit log, newest first, one plain-words line per event.
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many } from '../../db.ts';
import { num, obj, opt, str } from '../../../shared/validate.ts';

// [what happened, what was asked for]. Anything not listed falls back to the tool's own words.
const PHRASE: Record<string, [string, string]> = {
  'workspace.create': ['created the workspace', 'create the workspace'],
  'member.invite': ['invited a teammate', 'invite a teammate'], 'member.role.set': ['changed a teammate\'s role', 'change a teammate\'s role'],
  'member.remove': ['removed a teammate', 'remove a teammate'], 'member.accept_invite': ['joined the workspace', 'join the workspace'],
  'apikey.create': ['created an API key', 'create an API key'], 'apikey.revoke': ['revoked an API key', 'revoke an API key'],
  'secret.reveal': ['looked at a new secret (it can be shown only once)', 'look at a new secret'],
  'brand.update': ['edited the brand details', 'edit the brand details'], 'brand.cnap_name.set': ['changed the caller name shown on calls', 'change the caller name shown on calls'],
  'knowledge.ingest': ['added a document to the knowledge base', 'add a document to the knowledge base'],
  'knowledge.span.approve': ['reviewed passages of the knowledge base', 'review passages of the knowledge base'],
  'offering.edit': ['edited an offering', 'edit an offering'], 'action.undo': ['undid a change', 'undo a change'],
  'integration.stage_secrets': ['handed over credentials for an integration', 'hand over credentials for an integration'],
  'integration.connect': ['connected an integration', 'connect an integration'], 'integration.disconnect': ['disconnected an integration', 'disconnect an integration'],
  'webhook.create': ['added a webhook', 'add a webhook'], 'webhook.delete': ['deleted a webhook', 'delete a webhook'], 'webhook.replay': ['sent a webhook event again', 'send a webhook event again'],
  'share.link.create': ['made a share link', 'make a share link'], 'share.link.revoke': ['turned off a share link', 'turn off a share link'],
  'action.decline': ['declined a proposed change', 'decline a proposed change'],
  'version.restore': ['approved a rollback of an agent', 'roll an agent back to an earlier version'],
};

const words = (a: string) => a.replace(/[._]/g, ' ');
const happened = (a: string) => PHRASE[a]?.[0] ?? `ran ${words(a)}`;
// A row may carry its own plain line (e.g. 'rolled back Asha to version 3 (as version 6)'), written by the tool that knew it.
const lineOf = (r: { action: string; payload: Record<string, unknown> }) => (typeof r.payload?.line === 'string' && r.payload.line.trim() ? r.payload.line : happened(r.action));
const asked = (a: string) => PHRASE[a]?.[1] ?? `run ${words(a)}`;

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

      // Each row's subject (stored as {type, id} only) gets its name here, inside this workspace; a deleted thing has none.
      const subj = page.map(r => r.payload?.subject as { type: string; id: string } | undefined).filter((x): x is { type: string; id: string } => !!x?.id && /^[0-9a-f-]{36}$/i.test(x.id));
      const ids = (t: string) => [...new Set(subj.filter(x => x.type === t).map(x => x.id))];
      const NAMES: Record<string, string> = {
        agent: 'SELECT id, name FROM agent WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        campaign: 'SELECT id, name FROM campaign WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        audience: 'SELECT id, name FROM audience WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        contact: "SELECT id, coalesce(nullif(name, ''), 'a contact') AS name FROM contact WHERE workspace_id = $1 AND id = ANY($2::uuid[])",
        call: `SELECT cv.id, 'a call' || coalesce(' with ' || nullif(c.name, ''), '') AS name FROM conversation cv LEFT JOIN contact c ON c.id = cv.contact_id AND c.workspace_id = cv.workspace_id
               WHERE cv.workspace_id = $1 AND cv.id = ANY($2::uuid[])`,
        outcome: 'SELECT id, name FROM outcome_definition WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        judge: 'SELECT id, name FROM judge_version WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        member: 'SELECT id, coalesce(name, email) AS name FROM member WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        issue: "SELECT id, category || ' issue' AS name FROM issue WHERE workspace_id = $1 AND id = ANY($2::uuid[])",
        attempt: `SELECT a.id, 'a call to ' || coalesce(nullif(c.name, ''), 'a contact') AS name FROM attempt a LEFT JOIN contact c ON c.id = a.contact_id AND c.workspace_id = a.workspace_id
                  WHERE a.workspace_id = $1 AND a.id = ANY($2::uuid[])`,
        version: `SELECT v.id, a.name || ' (version ' || v.number || ')' AS name FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE a.workspace_id = $1 AND v.id = ANY($2::uuid[])`,
        offering: 'SELECT id, name FROM offering WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        source: "SELECT id, coalesce(nullif(title, ''), 'a document') AS name FROM knowledge_source WHERE workspace_id = $1 AND id = ANY($2::uuid[])",
        tool: 'SELECT id, name FROM tool WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
        fact: `SELECT f.id, 'a memory about ' || coalesce(nullif(c.name, ''), 'a contact') AS name FROM memory_fact f LEFT JOIN contact c ON c.id = f.contact_id AND c.workspace_id = f.workspace_id
               WHERE f.workspace_id = $1 AND f.id = ANY($2::uuid[])`,
        number: "SELECT id, 'the line ending ' || right(e164, 4) AS name FROM phone_number WHERE workspace_id = $1 AND id = ANY($2::uuid[])",
        experiment: "SELECT e.id, 'a test on ' || a.name AS name FROM experiment e JOIN agent a ON a.id = e.agent_id WHERE e.workspace_id = $1 AND e.id = ANY($2::uuid[])",
        proposal: "SELECT p.id, 'a suggested change to ' || a.name AS name FROM proposal p JOIN agent a ON a.id = p.agent_id WHERE p.workspace_id = $1 AND p.id = ANY($2::uuid[])",
      };
      const names = new Map<string, string>();
      for (const [type, sql] of Object.entries(NAMES)) {
        const want = ids(type);
        if (want.length) for (const x of await many<{ id: string; name: string }>(ctx.q, sql, [ctx.workspaceId, want])) names.set(`${type}:${x.id}`, x.name);
      }
      const subjectFor = (r: Row) => {
        const s = r.payload?.subject as { type: string; id: string } | undefined;
        if (!s?.id) return null;
        const name = names.get(`${s.type}:${s.id}`);
        return { type: s.type, id: s.id, name: name ?? null };
      };
      const scimIds = page.map(r => r.actor_id).filter((x): x is string => !!x && x.startsWith('scim:')).map(x => x.slice(5));
      const scim = new Map((await many<{ id: string; name: string }>(ctx.q, 'SELECT id, name FROM scim_token WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ctx.workspaceId, scimIds])).map(k => [k.id, k.name]));
      const who = (r: Row) => r.actor_id?.startsWith('key:') ? `The API key "${keys.get(r.actor_id.slice(4)) ?? 'unknown'}"`
        : r.actor_id?.startsWith('scim:') ? `The provisioning token "${scim.get(r.actor_id.slice(5)) ?? 'unknown'}"`
        : r.actor_id === 'sso' ? 'Single sign-on'
        : r.actor_type === 'member' ? (members.get(r.actor_id ?? '') ?? 'A teammate')
        : r.actor_type === 'agent' ? 'An agent' : r.actor_type === 'vp_success' ? 'The Vyakti team' : 'Vyakti';
      const items = page.map(r => {
        const proposed = r.action === 'action.propose' ? String(r.payload.tool ?? '') : '';
        const subject = subjectFor(r);
        const about = subject?.name ? ` (${subject.name})` : '';
        const line = proposed ? `${who(r)} asked to ${asked(proposed)}${about} and is waiting for approval`
          : `${who(r)} ${lineOf(r)}${typeof r.payload?.line === 'string' ? '' : about}${r.payload.mode === 'A2' ? ' (approved)' : ''}${r.payload.outcome === 'unknown' ? ' (outcome not confirmed)' : ''}`;
        return { id: r.id, at: r.at, line, action: r.action, ...(proposed ? { tool: proposed } : {}), actor: { type: r.actor_type, id: r.actor_id },
          object: r.object_type ? { type: r.object_type, id: r.object_id } : null, subject };
      });
      const last = page[page.length - 1];
      return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ t: last.t, id: last.id })).toString('base64url') : null };
    },
  }));
}
