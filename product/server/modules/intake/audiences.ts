// Audiences: a saved filter over attributes (kind 'query') or a fixed list (kind 'list'). A filter is data,
// compiled here into parameterised SQL; keys and operators come from closed sets, values are always bound.
import { any, arr, num, obj, opt, str, uuid, ValidationError, type Validator } from '../../../shared/validate.ts';
import { many, one, type Queryable } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';

const OPS = ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing', 'contains'] as const;
type Op = (typeof OPS)[number];
export interface Cond { key: string; op: Op; value?: unknown }
export interface Filter { all?: Cond[]; any?: Cond[] }

const cond = obj({ key: str({ pattern: /^[\p{L}\p{M}\p{N}_]{1,60}$/u, desc: 'a contact field key: letters, digits or underscore in any script, 1-60 characters' }), op: str({ oneOf: OPS }), value: opt(any()) }) as Validator<Cond>;
export const filterV = obj({ all: opt(arr(cond, { max: 30 })), any: opt(arr(cond, { max: 30 })) }) as Validator<Filter>;

const CMP: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' };

function condSql(c: Cond, params: unknown[]): string {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const has = (pred: string) => `EXISTS (SELECT 1 FROM attribute a WHERE a.contact_id = c.id AND a.key = ${p(c.key)}${pred ? ' AND ' + pred : ''})`;
  const need = () => { if (c.value === undefined) throw new Error(`${c.key} ${c.op} needs a value`); return c.value; };
  switch (c.op) {
    case 'exists': return has('');
    case 'missing': return 'NOT ' + has('');
    case 'eq': return has(`a.value = ${p(JSON.stringify(need()))}::jsonb`);
    case 'neq': return 'NOT ' + has(`a.value = ${p(JSON.stringify(need()))}::jsonb`);
    case 'in': {
      const v = need();
      if (!Array.isArray(v) || v.length === 0 || v.length > 500) throw new Error(`${c.key} in needs a list of 1 to 500 values`);
      return has(`a.value = ANY(${p(v.map(x => JSON.stringify(x)))}::jsonb[])`);
    }
    case 'contains': {
      const v = need();
      if (typeof v !== 'string') throw new Error(`${c.key} contains needs text`);
      return has(`a.value #>> '{}' ILIKE ${p('%' + v.replace(/[\\%_]/g, m => '\\' + m) + '%')} ESCAPE '\\'`);
    }
    default: {
      const v = need();
      if (typeof v === 'number') return has(`jsonb_typeof(a.value) = 'number' AND (a.value #>> '{}')::numeric ${CMP[c.op]} ${p(v)}::numeric`);
      // Byte order, not the database locale: ISO dates and codes must compare the same on every server.
      if (typeof v === 'string') return has(`jsonb_typeof(a.value) = 'string' AND (a.value #>> '{}') COLLATE "C" ${CMP[c.op]} ${p(v)}::text COLLATE "C"`);
      throw new Error(`${c.key} ${c.op} needs a number or a date`);
    }
  }
}

export function filterSql(f: Filter, params: unknown[]): string {
  const parts: string[] = [];
  if (f.all?.length) parts.push(f.all.map(c => condSql(c, params)).join(' AND '));
  if (f.any?.length) parts.push('(' + f.any.map(c => condSql(c, params)).join(' OR ') + ')');
  return parts.length ? '(' + parts.join(' AND ') + ')' : 'true';
}

/** A predicate on contact alias `c` for an audience (by id, in this workspace) or an inline filter. */
export async function audienceWhere(q: Queryable, ws: string, i: { audienceId?: string; filter?: Filter }, params: unknown[]): Promise<string> {
  if (i.audienceId) {
    const a = await one<{ id: string; kind: string; definition: { filter?: Filter } }>(q, 'SELECT id, kind, definition FROM audience WHERE id = $1 AND workspace_id = $2', [i.audienceId, ws]);
    if (!a) throw new Error('no such audience in this workspace');
    if (a.kind === 'list') { params.push(a.id); return `c.id IN (SELECT contact_id FROM audience_member WHERE audience_id = $${params.length})`; }
    return filterSql(filterV(a.definition.filter ?? {}), params);
  }
  return filterSql(i.filter ?? {}, params);
}

const SUPP = `EXISTS (SELECT 1 FROM suppression s WHERE s.workspace_id = c.workspace_id AND s.scope = 'workspace' AND (s.contact_id = c.id OR s.e164 = c.e164))`;

async function preview(q: Queryable, ws: string, i: { audienceId?: string; filter?: Filter }, limit: number, viewer: boolean) {
  const params: unknown[] = [ws];
  const where = 'c.workspace_id = $1 AND c.erased_at IS NULL AND ' + await audienceWhere(q, ws, i, params);
  const n = await one<{ matched: string; suppressed: string; dnd_unknown: string; dnd_registered: string }>(q, `SELECT count(*) AS matched,
      count(*) FILTER (WHERE ${SUPP}) AS suppressed,
      count(*) FILTER (WHERE d.ncpr_status IS NULL OR d.ncpr_status = 'unknown' OR d.checked_at IS NULL) AS dnd_unknown,
      count(*) FILTER (WHERE d.ncpr_status = 'registered') AS dnd_registered
    FROM contact c LEFT JOIN dnd_status d ON d.contact_id = c.id WHERE ${where}`, params);
  params.push(limit);
  const sample = await many<{ id: string; e164: string; name: string | null; suppressed: boolean }>(q,
    `SELECT c.id, c.e164, c.name, ${SUPP} AS suppressed FROM contact c WHERE ${where} ORDER BY c.id LIMIT $${params.length}`, params);
  const matched = Number(n!.matched), suppressed = Number(n!.suppressed);
  return {
    matched, suppressed, callable: matched - suppressed, dndUnknown: Number(n!.dnd_unknown), dndRegistered: Number(n!.dnd_registered),
    note: 'suppressed people stay in the audience and are never called; unknown DND blocks promotional calls only',
    sample: sample.map(s => ({ id: s.id, e164: viewer ? s.e164.slice(0, 3) + '•••••' + s.e164.slice(-4) : s.e164, name: viewer ? null : s.name, suppressed: s.suppressed })),
  };
}

export function registerAudienceTools(reg: Registry): void {
  // Either-or is stated in the description, not as a JSON Schema oneOf: not every provider's tool endpoint accepts oneOf.
  reg.register(tool(obj({ name: str({ min: 1, max: 120 }), filter: opt(filterV), contactIds: opt(arr(uuid(), { min: 1, max: 50000 })) },
    'Give exactly one of filter (a rule over contact fields, e.g. {"all":[{"key":"city","op":"eq","value":"Pune"}]}) or contactIds (ids from contact.list), never both.'), {
    name: 'audience.create', risk: 'draft', summary: 'Save an audience: a filter over attributes (re-evaluated each time) or a fixed list of people',
    run: async (ctx, i) => {
      if (!!i.filter === !!i.contactIds) throw new ValidationError(i.filter ? 'contactIds' : 'filter',
        `give exactly one of filter (e.g. {"all":[{"key":"city","op":"eq","value":"Pune"}]}; ops: ${OPS.join(', ')}) or contactIds (ids from contact.list), ${i.filter ? 'not both' : 'not neither'}`);
      if (i.filter) {
        filterSql(i.filter, []);              // reject a bad filter now, not at launch
        const a = await one<{ id: string }>(ctx.q, "INSERT INTO audience (workspace_id, name, kind, definition) VALUES ($1,$2,'query',$3) RETURNING id",
          [ctx.workspaceId, i.name, JSON.stringify({ filter: i.filter })]);
        return { audienceId: a!.id, kind: 'query', ...(await preview(ctx.q, ctx.workspaceId, { audienceId: a!.id }, 5, ctx.actor.role === 'viewer')) };
      }
      const ok = await many<{ id: string }>(ctx.q, 'SELECT id FROM contact WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND erased_at IS NULL', [ctx.workspaceId, i.contactIds]);
      if (ok.length !== new Set(i.contactIds).size) throw new Error('some of those people are not in this workspace');
      const a = await one<{ id: string }>(ctx.q, "INSERT INTO audience (workspace_id, name, kind, definition) VALUES ($1,$2,'list','{}') RETURNING id", [ctx.workspaceId, i.name]);
      await ctx.q.query('INSERT INTO audience_member (audience_id, contact_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [a!.id, ok.map(r => r.id)]);
      return { audienceId: a!.id, kind: 'list', members: ok.length };
    },
  }));

  reg.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'audience.list', risk: 'read', summary: 'List saved audiences',
    run: async (ctx, i) => ({ audiences: await many(ctx.q, 'SELECT id, name, kind, definition, source_id AS receipt_id, created_at FROM audience WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2',
      [ctx.workspaceId, i.limit ?? 50]) }),
  }));

  reg.register(tool(obj({ id: uuid() }), {
    name: 'audience.get', risk: 'read', summary: 'One audience with its definition and current counts',
    run: async (ctx, i) => {
      const a = await one(ctx.q, 'SELECT id, name, kind, definition, source_id AS receipt_id, created_at FROM audience WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]);
      if (!a) throw new Error('no such audience in this workspace');
      return { ...a, ...(await preview(ctx.q, ctx.workspaceId, { audienceId: i.id }, 0, ctx.actor.role === 'viewer')) };
    },
  }));

  reg.register(tool(obj({ audienceId: opt(uuid()), filter: opt(filterV), limit: opt(num({ int: true, min: 0, max: 100 })) }), {
    name: 'audience.preview', risk: 'read', summary: 'Who an audience or a draft filter reaches now: matched, suppressed, callable, DND unknown, and a sample',
    run: async (ctx, i) => {
      if (!!i.audienceId === !!i.filter) throw new Error('give audienceId or filter');
      return preview(ctx.q, ctx.workspaceId, i, i.limit ?? 10, ctx.actor.role === 'viewer');
    },
  }));
}
