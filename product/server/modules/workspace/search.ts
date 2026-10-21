// search.global: one box over contacts, agents, campaigns and calls, by name or number, inside the caller's workspace only.
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many } from '../../db.ts';
import { arr, num, obj, opt, str } from '../../../shared/validate.ts';
import { likeEscape } from './common.ts';

const TYPES = ['contact', 'agent', 'campaign', 'call'] as const;

export function registerSearch(r: Registry) {
  r.register(tool(obj({ q: str({ min: 2, max: 80 }), types: opt(arr(str({ oneOf: TYPES }), { min: 1, max: 4 })), limit: opt(num({ int: true, min: 1, max: 25 })) }), {
    name: 'search.global', risk: 'read', summary: 'Find contacts, agents, campaigns and calls by name or phone number',
    run: async (ctx, i) => {
      const want = new Set<string>(i.types ?? TYPES), limit = i.limit ?? 8;
      const like = `%${likeEscape(i.q.trim())}%`;
      const digits = i.q.replace(/\D/g, '');
      const phone = digits.length >= 3 ? `%${digits}%` : null;
      const results: { type: string; id: string; title: string; subtitle: string | null; matchedOn: string }[] = [];
      const add = (type: string, rows: { id: string; title: string | null; subtitle: string | null; matched: string }[]) =>
        rows.forEach(r => results.push({ type, id: r.id, title: r.title || '(unnamed)', subtitle: r.subtitle, matchedOn: r.matched }));

      if (want.has('contact')) add('contact', await many(ctx.q, `SELECT id, name AS title, e164 AS subtitle, CASE WHEN name ILIKE $2 THEN 'name' ELSE 'number' END AS matched
        FROM contact WHERE workspace_id = $1 AND (name ILIKE $2 OR ($3::text IS NOT NULL AND e164 LIKE $3)) ORDER BY name NULLS LAST, id LIMIT $4`, [ctx.workspaceId, like, phone, limit]));
      if (want.has('agent')) add('agent', await many(ctx.q, `SELECT id, name AS title, coalesce(job, '') || ' · ' || status AS subtitle, 'name' AS matched
        FROM agent WHERE workspace_id = $1 AND status <> 'archived' AND name ILIKE $2 ORDER BY name, id LIMIT $3`, [ctx.workspaceId, like, limit]));
      if (want.has('campaign')) add('campaign', await many(ctx.q, `SELECT id, name AS title, state AS subtitle, 'name' AS matched
        FROM campaign WHERE workspace_id = $1 AND name ILIKE $2 ORDER BY created_at DESC, id LIMIT $3`, [ctx.workspaceId, like, limit]));
      if (want.has('call')) add('call', await many(ctx.q, `SELECT v.id, 'Call with ' || coalesce(c.name, c.e164) AS title, v.direction || ' · ' || v.status || ' · ' || to_char(v.started_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') AS subtitle,
          CASE WHEN c.name ILIKE $2 THEN 'name' ELSE 'number' END AS matched
        FROM conversation v JOIN contact c ON c.id = v.contact_id AND c.workspace_id = v.workspace_id
        WHERE v.workspace_id = $1 AND (c.name ILIKE $2 OR ($3::text IS NOT NULL AND c.e164 LIKE $3)) ORDER BY v.started_at DESC, v.id LIMIT $4`, [ctx.workspaceId, like, phone, limit]));
      return { query: i.q, results };
    },
  }));
}
