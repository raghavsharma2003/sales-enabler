// What the business offers, as facts. Every fact stands on an approved knowledge span; never_say is a hard list
// and a fact that contains a banned phrase is refused.
import { randomUUID } from 'node:crypto';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { arr, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { recordRevision } from './common.ts';
import { proseExclusion } from '../../../shared/company-facts.ts';

const tag = str({ pattern: /^[a-z][a-z0-9_]{1,23}$/, desc: 'purpose tag, e.g. opening, explain, objection, price, eligibility, next_step' });
const factIn = obj({ id: opt(uuid()), text: str({ min: 1, max: 600 }), spanId: uuid(), purposes: arr(tag, { min: 1, max: 6 }) });
type Row = { id: string; name: string; facts: unknown[]; never_say: string[]; archived_at: Date | null; updated_at: Date };
const snap = (o: Row | null) => o ? { name: o.name, facts: o.facts, never_say: o.never_say, archived_at: o.archived_at } : null;
const view = (o: Row) => ({ id: o.id, name: o.name, facts: o.facts, neverSay: o.never_say, archived: !!o.archived_at, updatedAt: o.updated_at });

export function registerOffering(r: Registry) {
  r.register(tool(obj({ offeringId: opt(uuid()), name: opt(str({ min: 1, max: 160 })), facts: opt(arr(factIn, { max: 200 })), neverSay: opt(arr(str({ min: 1, max: 200 }), { max: 100 })) }), {
    name: 'offering.edit', risk: 'draft', summary: 'Create or edit an offering: its facts (each from an approved source), their purposes and what must never be said',
    run: async (ctx, i) => {
      let before: Row | null = null;
      if (i.offeringId) {
        before = await one<Row>(ctx.q, 'SELECT * FROM offering WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL FOR UPDATE', [i.offeringId, ctx.workspaceId]);
        if (!before) throw new Error('no such offering in this workspace');
      } else if (!i.name) throw new Error('a new offering needs a name');
      if (i.name === undefined && i.facts === undefined && i.neverSay === undefined) throw new Error('nothing to change');

      let facts = before?.facts ?? [];
      if (i.facts) {
        const ids = [...new Set(i.facts.map(f => f.spanId))];
        const spans = await many<{ id: string; source_id: string; text: string; location: unknown; status: string; kind: string }>(ctx.q,
          'SELECT p.id, p.source_id, p.text, p.location, p.status, s.kind FROM knowledge_span p JOIN knowledge_source s ON s.id = p.source_id WHERE p.workspace_id = $1 AND p.id = ANY($2::uuid[])', [ctx.workspaceId, ids]);
        const byId = new Map(spans.map(s => [s.id, s]));
        facts = i.facts.map(f => {
          const s = byId.get(f.spanId);
          if (!s) throw new Error(`source span ${f.spanId} is not in this workspace`);
          if (s.status !== 'approved') throw new Error(`source span ${f.spanId} is ${s.status}; approve it in Knowledge before it can back a fact`);
          // HV law 22: a price or a date stands only on an offerings sheet row, never on prose that can go stale.
          const why = s.kind === 'sheet' ? null : proseExclusion(f.text);
          if (why) throw new Error(`the fact "${f.text.slice(0, 60)}" cannot stand on a document or web page. ${why}`);
          return { id: f.id ?? randomUUID(), text: f.text, purposes: f.purposes, spanId: s.id, sourceId: s.source_id, location: s.location, quote: s.text.slice(0, 300) };
        });
      }
      const neverSay = i.neverSay ?? before?.never_say ?? [];
      const banned = neverSay.map(p => p.toLowerCase());
      for (const f of facts as { text: string }[]) {
        const hit = banned.find(p => f.text.toLowerCase().includes(p));
        if (hit) throw new Error(`the fact "${f.text.slice(0, 60)}" contains "${hit}", which is on the never-say list`);
      }

      let after: Row;
      if (before) {
        after = (await one<Row>(ctx.q, `UPDATE offering SET name = $3, facts = $4, never_say = $5, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *`,
          [before.id, ctx.workspaceId, i.name ?? before.name, JSON.stringify(facts), JSON.stringify(neverSay)]))!;
      } else {
        const brand = await one<{ id: string }>(ctx.q, 'SELECT id FROM brand WHERE workspace_id = $1 ORDER BY created_at, id LIMIT 1', [ctx.workspaceId]);
        after = (await one<Row>(ctx.q, `INSERT INTO offering (workspace_id, brand_id, name, facts, never_say) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [ctx.workspaceId, brand?.id ?? null, i.name, JSON.stringify(facts), JSON.stringify(neverSay)]))!;
      }
      const revisionId = await recordRevision(ctx, { objectType: 'offering', objectId: after.id, tool: 'offering.edit', before: snap(before), after: snap(after),
        summary: before ? `Edited the offering "${after.name}"` : `Added the offering "${after.name}"` });
      return { offering: view(after), revisionId };
    },
  }));

  r.register(tool(obj({ id: opt(uuid()) }), {
    name: 'offering.list', risk: 'read', summary: 'List offerings with their facts and never-say lists',
    run: async ctx => ({ offerings: (await many<Row>(ctx.q, 'SELECT * FROM offering WHERE workspace_id = $1 AND archived_at IS NULL ORDER BY created_at, id', [ctx.workspaceId])).map(view) }),
  }));
}
