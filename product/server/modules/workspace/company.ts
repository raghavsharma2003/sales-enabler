// Company data end to end: a website read into knowledge, an offerings or price sheet (CSV or Excel), and facts proposed
// from every source with the passage they came from, for a person to approve or reject singly or in bulk. An approved
// fact joins an offering (a sheet row's own offering; prose goes to the offering chosen, by default "Company
// information"), which an agent links; agents/knowledge.ts then puts it on calls. HV law 22: prices and dates are
// proposed only from sheets; a prose statement with one is shown as excluded, with the reason, and cannot be approved.
import type { Registry, ToolCtx } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { arr, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { asFact, proseExclusion, purposesFor, statements } from '../../../shared/company-facts.ts';
import { sha256 } from './crypto.ts';
import { chunkText, clean } from './chunk.ts';
import { isKey, recordRevision } from './common.ts';
import { crawl, SITE_LIMITS, SiteError } from './site.ts';
import { looksLikeXlsx, readXlsx, XlsxError } from '../intake/xlsx.ts';
import { parseDelimited } from '../intake/csv.ts';

export const COMPANY_OFFERING = 'Company information';
const MAX_PROPOSALS = 300, MAX_ROWS = 500, MAX_COLS = 30;

interface SpanRow { id: string; text: string }

/** Propose facts from a source's passages (idempotent: a source is proposed once). Returns counts. */
export async function proposeFacts(ctx: ToolCtx, sourceId: string): Promise<{ proposed: number; excluded: number }> {
  const done = await one<{ n: string }>(ctx.q, 'SELECT count(*) AS n FROM knowledge_fact WHERE source_id = $1', [sourceId]);
  if (Number(done!.n) > 0) return counts(ctx, sourceId);
  const spans = await many<SpanRow>(ctx.q, 'SELECT id, text FROM knowledge_span WHERE workspace_id = $1 AND source_id = $2 ORDER BY ordinal', [ctx.workspaceId, sourceId]);
  const rows: [string, string, string, string, string, string | null][] = [];   // span, fact, quote, purposes, status, reason
  const seen = new Set<string>();
  for (const s of spans) {
    for (const st of statements(s.text)) {
      const fact = asFact(st);                       // a testimonial, a quote or a greeting is not a company fact
      if (!fact || seen.has(fact) || rows.length >= MAX_PROPOSALS) continue;
      seen.add(fact);
      const why = proseExclusion(st);
      rows.push([s.id, fact, st, JSON.stringify(purposesFor(st)), why ? 'excluded' : 'pending', why]);
    }
  }
  if (rows.length) await ctx.q.query(
    `INSERT INTO knowledge_fact (workspace_id, source_id, span_id, text, quote, purposes, origin, status, reason)
     SELECT $1, $2, s, t, q, p::jsonb, 'prose', st, r FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]) AS u(s, t, q, p, st, r)`,
    [ctx.workspaceId, sourceId, rows.map(r => r[0]), rows.map(r => r[1]), rows.map(r => r[2]), rows.map(r => r[3]), rows.map(r => r[4]), rows.map(r => r[5])]);
  return counts(ctx, sourceId);
}

async function counts(ctx: ToolCtx, sourceId: string) {
  const r = await one<{ p: string; e: string }>(ctx.q, "SELECT count(*) FILTER (WHERE status <> 'excluded') AS p, count(*) FILTER (WHERE status = 'excluded') AS e FROM knowledge_fact WHERE source_id = $1", [sourceId]);
  return { proposed: Number(r!.p), excluded: Number(r!.e) };
}

async function brandId(ctx: ToolCtx) {
  return (await one<{ id: string }>(ctx.q, 'SELECT id FROM brand WHERE workspace_id = $1 ORDER BY created_at, id LIMIT 1', [ctx.workspaceId]))?.id ?? null;
}

// ------------------------------------------------------------------------------------------------ sheets

/** Rows of a CSV or the first sheet of an .xlsx, as a header and its data rows. */
export function readSheet(buf: Buffer): { sheet: string; header: string[]; rows: string[][] } {
  let sheet = 'CSV', all: string[][];
  if (looksLikeXlsx(buf)) {
    try { const x = readXlsx(buf); sheet = x.sheet; all = x.rows; } catch (e) { throw new Error(e instanceof XlsxError ? e.message : 'could not read this Excel file'); }
  } else {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { throw new Error('this file is not a CSV or an Excel (.xlsx) file'); }
    all = parseDelimited(text);
  }
  const rows = all.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
  if (rows.length < 2) throw new Error('the sheet needs a header row and at least one offering');
  if (rows.length - 1 > MAX_ROWS) throw new Error(`the sheet has ${rows.length - 1} rows; the limit is ${MAX_ROWS}`);
  const header = rows[0].slice(0, MAX_COLS).map((h, i) => h || `Column ${i + 1}`);
  return { sheet, header, rows: rows.slice(1).map(r => r.slice(0, MAX_COLS)) };
}

const NAME_COL = /^(name|offering|product|plan|item|service|scheme|course|model|package)\b/i;

export function registerCompanyData(r: Registry) {
  r.register(tool(obj({ url: str({ min: 3, max: 500 }), maxPages: opt(num({ int: true, min: 1, max: SITE_LIMITS.maxPages })), title: opt(str({ min: 1, max: 200 })) }), {
    name: 'knowledge.ingest_site', risk: 'draft',
    summary: `Read the business's website (same site only, robots.txt obeyed, up to ${SITE_LIMITS.maxPages} pages); facts are proposed for your approval`,
    run: async (ctx, i) => {
      let res;
      try { res = await crawl(i.url, { maxPages: i.maxPages }); } catch (e) { throw new Error(e instanceof SiteError ? e.message : 'the website could not be read'); }
      if (!res.pages.length) {
        const why = res.skipped[0]?.reason ?? 'no readable pages';
        throw new Error(`no page of ${new URL(res.start).host} could be read: ${why}`);
      }
      const spans = res.pages.flatMap(p => chunkText(p.text).map(s => ({ text: clean(s.text), location: { url: p.url, title: p.title, ...s.location } })));
      const hash = sha256(Buffer.from(res.pages.map(p => p.url + '\n' + p.text).join('\n\n')));
      const dup = await one<{ id: string; title: string | null }>(ctx.q, 'SELECT id, title FROM knowledge_source WHERE workspace_id = $1 AND sha256 = $2', [ctx.workspaceId, hash]);
      if (dup) return { sourceId: dup.id, title: dup.title, duplicate: true, ...(await counts(ctx, dup.id)) };
      const title = i.title ?? (res.pages[0].title || new URL(res.start).host);
      const meta = { format: 'site', pages: res.pages.map(p => ({ url: p.url, title: p.title })), skipped: res.skipped.slice(0, 50), robots: res.robots, stoppedBy: res.stoppedBy, spanCount: spans.length };
      const src = (await one<{ id: string }>(ctx.q, `INSERT INTO knowledge_source (workspace_id, brand_id, kind, uri, status, meta, title, sha256) VALUES ($1,$2,'url',$3,'indexed',$4,$5,$6) RETURNING id`,
        [ctx.workspaceId, await brandId(ctx), res.start, meta, title, hash]))!;
      await ctx.q.query(`INSERT INTO knowledge_span (workspace_id, source_id, ordinal, text, location) SELECT $1, $2, o, t, l::jsonb FROM unnest($3::int[], $4::text[], $5::text[]) AS u(o, t, l)`,
        [ctx.workspaceId, src.id, spans.map((_, n) => n + 1), spans.map(s => s.text), spans.map(s => JSON.stringify(s.location))]);
      const c = await proposeFacts(ctx, src.id);
      return { sourceId: src.id, title, duplicate: false, pagesRead: res.pages.length, pages: meta.pages, skipped: res.skipped.length, robots: res.robots, stoppedBy: res.stoppedBy,
        spanCount: spans.length, ...c, next: 'Review the proposed facts and approve the ones she may say.' };
    },
  }));

  r.register(tool(obj({ filename: opt(str({ max: 200 })), title: opt(str({ min: 1, max: 200 })), text: opt(str({ max: 2_000_000 })), contentBase64: opt(str({ max: 12_500_000 })) }), {
    name: 'offering.import', risk: 'draft',
    summary: 'Import an offerings or price sheet (CSV or Excel): one offering per row, each cell proposed as a fact for your approval',
    run: async (ctx, i) => {
      if ((i.text === undefined) === (i.contentBase64 === undefined)) throw new Error('send either the CSV text or the file (contentBase64)');
      const buf = i.text !== undefined ? Buffer.from(i.text, 'utf8') : Buffer.from(i.contentBase64!, 'base64');
      if (!buf.length) throw new Error('the sheet is empty');
      if (buf.length > 9_000_000) throw new Error('the sheet is larger than 9 MB');
      const hash = sha256(buf);
      const dup = await one<{ id: string; title: string | null }>(ctx.q, 'SELECT id, title FROM knowledge_source WHERE workspace_id = $1 AND sha256 = $2', [ctx.workspaceId, hash]);
      if (dup) return { sourceId: dup.id, title: dup.title, duplicate: true, ...(await counts(ctx, dup.id)) };
      const { sheet, header, rows } = readSheet(buf);
      const nameAt = Math.max(0, header.findIndex(h => NAME_COL.test(h)));
      const items = rows.map((r, n) => ({ row: n + 2, name: r[nameAt] ?? '', cells: header.map((h, c) => [h, r[c] ?? ''] as const).filter(([, v], c) => c !== nameAt && v) }))
        .filter(x => x.name && x.cells.length);
      if (!items.length) throw new Error(`no row has an offering name (column "${header[nameAt]}") and a value beside it`);
      const title = i.title ?? (i.filename ? i.filename.replace(/\.[A-Za-z0-9]{1,5}$/, '') : `Offerings sheet ${new Date().toISOString().slice(0, 10)}`);
      const src = (await one<{ id: string }>(ctx.q, `INSERT INTO knowledge_source (workspace_id, brand_id, kind, uri, status, meta, title, sha256) VALUES ($1,$2,'sheet',$3,'indexed',$4,$5,$6) RETURNING id`,
        [ctx.workspaceId, await brandId(ctx), i.filename ?? null, { format: looksLikeXlsx(buf) ? 'xlsx' : 'csv', sheet, columns: header, nameColumn: header[nameAt], rows: items.length }, title, hash]))!;
      const spanIds = (await many<{ id: string }>(ctx.q, `INSERT INTO knowledge_span (workspace_id, source_id, ordinal, text, location)
        SELECT $1, $2, o, t, l::jsonb FROM unnest($3::int[], $4::text[], $5::text[]) AS u(o, t, l) RETURNING id`,
        [ctx.workspaceId, src.id, items.map((_, n) => n + 1), items.map(x => `${x.name}: ` + x.cells.map(([h, v]) => `${h}: ${v}`).join('; ')),
          items.map(x => JSON.stringify({ sheet, row: x.row }))])).map(r => r.id);
      const facts = items.flatMap((x, n) => x.cells.map(([h, v]) => ({ span: spanIds[n], text: `${x.name}, ${h.toLowerCase()}: ${v}`.slice(0, 300), quote: `${h}: ${v}`, purposes: purposesFor(h), offering: x.name })));
      await ctx.q.query(`INSERT INTO knowledge_fact (workspace_id, source_id, span_id, text, quote, purposes, origin, offering_name)
        SELECT $1, $2, s, t, q, p::jsonb, 'sheet', o FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[]) AS u(s, t, q, p, o)`,
        [ctx.workspaceId, src.id, facts.map(f => f.span), facts.map(f => f.text), facts.map(f => f.quote), facts.map(f => JSON.stringify(f.purposes)), facts.map(f => f.offering)]);
      return { sourceId: src.id, title, duplicate: false, sheet, nameColumn: header[nameAt], offerings: [...new Set(items.map(x => x.name))], proposed: facts.length, excluded: 0,
        next: 'Review the proposed facts and approve the ones she may say. Each row becomes its own offering.' };
    },
  }));

  r.register(tool(obj({ sourceId: opt(uuid()), status: opt(str({ oneOf: ['pending', 'approved', 'rejected', 'excluded'] })), limit: opt(num({ int: true, min: 1, max: 500 })) }), {
    name: 'knowledge.fact.list', risk: 'read', summary: 'List the facts proposed from company sources, with the passage each came from and its decision',
    run: async (ctx, i) => ({ facts: await many(ctx.q, `SELECT f.id, f.text, f.quote, f.purposes, f.origin, f.status, f.reason, f.offering_name AS "offeringName",
        o.name AS offering, f.source_id AS "sourceId", s.title AS "sourceTitle", s.kind AS "sourceKind", p.location, f.decided_at AS "decidedAt"
      FROM knowledge_fact f JOIN knowledge_source s ON s.id = f.source_id JOIN knowledge_span p ON p.id = f.span_id LEFT JOIN offering o ON o.id = f.offering_id
      WHERE f.workspace_id = $1 AND ($2::uuid IS NULL OR f.source_id = $2) AND ($3::text IS NULL OR f.status = $3)
      ORDER BY f.seq LIMIT $4`, [ctx.workspaceId, i.sourceId ?? null, i.status ?? null, i.limit ?? 200]) }),
  }));

  r.register(tool(obj({ factIds: arr(uuid(), { min: 1, max: 300 }), decision: str({ oneOf: ['approved', 'rejected'] }), offeringId: opt(uuid()) }), {
    name: 'knowledge.fact.decide', risk: 'draft',
    summary: 'Approve proposed facts (they join an offering, so a linked agent may say them) or reject them, one or many at once',
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'member' || isKey(ctx)) throw new Error('deciding what the agent may say needs a signed-in person, not an agent or an API key');
      const ids = [...new Set(i.factIds)];
      type F = { id: string; text: string; quote: string; purposes: string[]; origin: string; offering_name: string | null; status: string; offering_id: string | null; span_id: string; source_id: string; location: unknown };
      const facts = await many<F>(ctx.q, `SELECT f.*, p.location FROM knowledge_fact f JOIN knowledge_span p ON p.id = f.span_id
        WHERE f.workspace_id = $1 AND f.id = ANY($2::uuid[]) ORDER BY f.seq FOR UPDATE OF f`, [ctx.workspaceId, ids]);
      if (facts.length !== ids.length) throw new Error(`${ids.length - facts.length} of ${ids.length} facts are not in this workspace`);
      const ex = facts.find(f => f.status === 'excluded');
      if (ex) throw new Error(`"${ex.text.slice(0, 60)}" states a price or a date in prose; those come only from an offerings sheet`);
      // Offerings this decision touches, by id: the change to each is one revision, so it can be undone.
      const touched = new Map<string, { add: F[]; remove: Set<string> }>();
      const at = (id: string) => { if (!touched.has(id)) touched.set(id, { add: [], remove: new Set() }); return touched.get(id)!; };
      const named = async (name: string) => {
        const o = await one<{ id: string }>(ctx.q, 'SELECT id FROM offering WHERE workspace_id = $1 AND name = $2 AND archived_at IS NULL ORDER BY created_at LIMIT 1', [ctx.workspaceId, name]);
        if (o) return o.id;
        const n = (await one<{ id: string }>(ctx.q, 'INSERT INTO offering (workspace_id, brand_id, name) VALUES ($1,$2,$3) RETURNING id', [ctx.workspaceId, await brandId(ctx), name]))!;
        await recordRevision(ctx, { objectType: 'offering', objectId: n.id, tool: 'knowledge.fact.decide', before: null, after: { name, facts: [], never_say: [], archived_at: null }, summary: `Added the offering "${name}"` });
        return n.id;
      };
      if (i.offeringId && !(await one(ctx.q, 'SELECT 1 FROM offering WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL', [i.offeringId, ctx.workspaceId]))) throw new Error('no such offering in this workspace');
      const target = new Map<string, string>();
      for (const f of facts) {
        if (f.offering_id) at(f.offering_id).remove.add(f.id);            // re-deciding moves or drops it
        if (i.decision === 'approved') {
          const to = f.origin === 'sheet' ? await named(f.offering_name!) : i.offeringId ?? await named(COMPANY_OFFERING);
          at(to).add.push(f); target.set(f.id, to);
        }
      }
      for (const [oid, ch] of touched) {
        const o = (await one<{ name: string; facts: Record<string, unknown>[]; never_say: string[]; archived_at: Date | null }>(ctx.q, 'SELECT name, facts, never_say, archived_at FROM offering WHERE id = $1 FOR UPDATE', [oid]))!;
        const banned = o.never_say.map(p => p.toLowerCase());
        for (const f of ch.add) {
          const hit = banned.find(p => f.text.toLowerCase().includes(p));
          if (hit) throw new Error(`"${f.text.slice(0, 60)}" contains "${hit}", which is on the never-say list of "${o.name}"`);
        }
        const addIds = new Set(ch.add.map(f => f.id));
        // A sheet row is the business's current number: a newer sheet's value for the same offering and column replaces the older one.
        const column = (text: string) => text.slice(0, text.indexOf(': ') + 2);
        const replaced = new Set(ch.add.filter(f => f.origin === 'sheet').map(f => column(f.text)));
        const next = [...o.facts.filter(x => !ch.remove.has(String(x.id)) && !addIds.has(String(x.id)) && !(x.origin === 'sheet' && replaced.has(column(String(x.text))))),
          ...ch.add.map(f => ({ id: f.id, text: f.text, purposes: f.purposes, spanId: f.span_id, sourceId: f.source_id, location: f.location, quote: f.quote.slice(0, 300), origin: f.origin }))];
        await ctx.q.query('UPDATE offering SET facts = $2, updated_at = now() WHERE id = $1', [oid, JSON.stringify(next)]);
        await recordRevision(ctx, { objectType: 'offering', objectId: oid, tool: 'knowledge.fact.decide',
          before: { name: o.name, facts: o.facts, never_say: o.never_say, archived_at: o.archived_at }, after: { name: o.name, facts: next, never_say: o.never_say, archived_at: o.archived_at },
          summary: ch.add.length ? `Approved ${ch.add.length} fact${ch.add.length === 1 ? '' : 's'} into "${o.name}"` : `Took ${ch.remove.size} fact${ch.remove.size === 1 ? '' : 's'} out of "${o.name}"` });
      }
      if (i.decision === 'approved') {
        await ctx.q.query(`UPDATE knowledge_span SET status = 'approved', decided_by = $3, decided_at = now() WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status <> 'approved'`,
          [ctx.workspaceId, [...new Set(facts.map(f => f.span_id))], ctx.actor.id ?? null]);
      }
      for (const f of facts) {
        await ctx.q.query('UPDATE knowledge_fact SET status = $2, offering_id = $3, decided_by = $4, decided_at = now() WHERE id = $1',
          [f.id, i.decision, i.decision === 'approved' ? target.get(f.id) : null, ctx.actor.id ?? null]);
      }
      const names = await many<{ id: string; name: string }>(ctx.q, 'SELECT id, name FROM offering WHERE id = ANY($1::uuid[])', [[...new Set(target.values())]]);
      return { updated: facts.length, decision: i.decision, offerings: names };
    },
  }));

  r.register(tool(obj({ sourceId: uuid() }), {
    name: 'knowledge.propose', risk: 'draft', summary: 'Propose facts from a source added before facts were proposed automatically',
    run: async (ctx, i) => {
      if (!(await one(ctx.q, 'SELECT 1 FROM knowledge_source WHERE id = $1 AND workspace_id = $2', [i.sourceId, ctx.workspaceId]))) throw new Error('no such source in this workspace');
      return { sourceId: i.sourceId, ...(await proposeFacts(ctx, i.sourceId)) };
    },
  }));
}
