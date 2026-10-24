// Brand details (draft, undoable) and the CNAP name shown on the callee's phone (policy: it is how people are identified to the callee).
import type { Registry, ToolCtx } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { one } from '../../db.ts';
import { obj, opt, str } from '../../../shared/validate.ts';
import { recordRevision } from './common.ts';

export const BRAND_FIELDS = { legal_name: 'legalName', sector: 'sector', dlt_entity_id: 'dltEntityId', website: 'website', tone: 'tone', logo_uri: 'logoUri' } as const;
type Row = Record<string, unknown> & { id: string };

export async function primaryBrand(ctx: ToolCtx, lock = false): Promise<Row | null> {
  return one<Row>(ctx.q, `SELECT * FROM brand WHERE workspace_id = $1 ORDER BY created_at, id LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [ctx.workspaceId]);
}

const snap = (b: Row | null) => b ? Object.fromEntries(Object.keys(BRAND_FIELDS).map(k => [k, b[k] ?? null])) : null;
const view = (b: Row) => ({ id: b.id, legalName: b.legal_name, cnapName: b.cnap_name, dltEntityId: b.dlt_entity_id, sector: b.sector, website: b.website, tone: b.tone, logoUri: b.logo_uri, updatedAt: b.updated_at });
export const brandView = view;

const CNAP = /^[A-Za-z0-9][A-Za-z0-9 &.'-]{0,29}$/;

export function registerBrand(r: Registry) {
  r.register(tool(obj({
    legalName: opt(str({ min: 1, max: 200 })), sector: opt(str({ min: 1, max: 80 })), dltEntityId: opt(str({ min: 1, max: 40 })),
    website: opt(str({ pattern: /^https?:\/\/[^\s]+$/, max: 300 })), tone: opt(str({ max: 500, desc: 'How the business likes to sound, in plain words' })), logoUri: opt(str({ pattern: /^https?:\/\/[^\s]+$/, max: 300 })),
  }), {
    name: 'brand.update', risk: 'draft', summary: 'Edit the business name, sector, tone and other brand details',
    run: async (ctx, i) => {
      const before = await primaryBrand(ctx, true);
      const given = Object.entries(BRAND_FIELDS).filter(([, k]) => (i as Record<string, unknown>)[k] !== undefined);
      if (!given.length) throw new Error('nothing to change; send at least one brand field');
      let after: Row;
      if (!before) {
        if (!i.legalName) throw new Error('set the legal name first; a brand needs one');
        after = (await one<Row>(ctx.q, `INSERT INTO brand (workspace_id, legal_name, sector, dlt_entity_id, website, tone, logo_uri) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [ctx.workspaceId, i.legalName, i.sector ?? null, i.dltEntityId ?? null, i.website ?? null, i.tone ?? null, i.logoUri ?? null]))!;
      } else {
        const sets = given.map(([col], n) => `${col} = $${n + 3}`);
        after = (await one<Row>(ctx.q, `UPDATE brand SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *`,
          [before.id, ctx.workspaceId, ...given.map(([, k]) => (i as Record<string, unknown>)[k])]))!;
      }
      const revisionId = await recordRevision(ctx, { objectType: 'brand', objectId: after.id, tool: 'brand.update', before: snap(before), after: snap(after),
        summary: before ? `Changed brand ${given.map(([, k]) => k).join(', ')}` : `Set up the brand "${after.legal_name}"` });
      return { brand: view(after), revisionId };
    },
  }));

  r.register(tool(obj({}), {
    name: 'brand.get', risk: 'read', summary: 'Read the brand details',
    run: async ctx => { const b = await primaryBrand(ctx); return { brand: b ? view(b) : null }; },
  }));

  r.register(tool(obj({ cnapName: str({ pattern: CNAP, desc: 'Up to 30 characters: letters, digits, spaces, & . \' -' }) }), {
    name: 'brand.cnap_name.set', risk: 'policy', summary: 'Set the name that shows on the phone of the person we call',
    describe: i => `Show "${i.cnapName}" as the caller name on calls`,
    version: async ctx => { const b = await primaryBrand(ctx); return b ? String(b.cnap_name ?? '') : null; },
    run: async (ctx, i) => {
      const b = await primaryBrand(ctx, true);
      if (!b) throw new Error('set up the brand first (brand.update), then choose its caller name');
      await ctx.q.query('UPDATE brand SET cnap_name = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2', [b.id, ctx.workspaceId, i.cnapName]);
      return { brandId: b.id, cnapName: i.cnapName, note: 'Phone networks may take time to show a new name.' };
    },
  }));
}
