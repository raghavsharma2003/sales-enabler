// Knowledge: ingest text, PDF (pdf-parse) or DOCX (mammoth) into spans with source locations. Spans start pending;
// only a person approving a span lets it back an offering fact.
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { num, obj, opt, str, uuid, arr } from '../../../shared/validate.ts';
import { sha256 } from './crypto.ts';
import { chunkPages, chunkText, clean, type RawSpan } from './chunk.ts';
import { isKey } from './common.ts';
import { proposeFacts } from './company.ts';

const MAX_BYTES = 9_000_000, MAX_SPANS = 600, MAX_PAGES = 300, PARSE_MS = 30_000;

type Format = 'text' | 'pdf' | 'docx';
function detect(b: Buffer): Format {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'docx';
  return 'text';
}

const timeout = <T>(p: Promise<T>, what: string) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} took too long to read; try a smaller file`)), PARSE_MS).unref())]);

async function extract(buf: Buffer, format: Format): Promise<{ spans: RawSpan[]; pages?: number }> {
  if (format === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const r = await timeout(parser.getText(), 'the PDF').catch(e => { throw e instanceof Error && /too long/.test(e.message) ? e : new Error('could not read this PDF; it may be damaged, locked or scanned images'); });
      if (r.pages.length > MAX_PAGES) throw new Error(`this PDF has ${r.pages.length} pages; split it into parts of at most ${MAX_PAGES}`);
      return { spans: chunkPages(r.pages.map(p => ({ num: p.num, text: p.text }))), pages: r.pages.length };
    } finally { await parser.destroy().catch(() => {}); }
  }
  if (format === 'docx') {
    const mammoth = (await import('mammoth')).default;
    const r = await timeout(mammoth.extractRawText({ buffer: buf }), 'the Word file').catch(e => { throw e instanceof Error && /too long/.test(e.message) ? e : new Error('could not read this Word file; save it as .docx and try again'); });
    return { spans: chunkText(r.value) };
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { throw new Error('this file is not plain text, PDF or DOCX'); }
  return { spans: chunkText(text) };
}

export function registerKnowledge(r: Registry) {
  r.register(tool(obj({
    title: opt(str({ min: 1, max: 200 })), filename: opt(str({ max: 200 })),
    text: opt(str({ max: 2_000_000 })), contentBase64: opt(str({ max: 12_500_000 })),
  }), {
    name: 'knowledge.ingest', risk: 'draft', summary: 'Add a document (text, PDF or Word) to the knowledge base; its passages wait for your approval',
    run: async (ctx, i) => {
      if ((i.text === undefined) === (i.contentBase64 === undefined)) throw new Error('send either text or a file (contentBase64), not both and not neither');
      const buf = i.text !== undefined ? Buffer.from(i.text, 'utf8') : Buffer.from(i.contentBase64!, 'base64');
      if (!buf.length) throw new Error('the document is empty');
      if (buf.length > MAX_BYTES) throw new Error('the document is larger than 9 MB');
      const hash = sha256(buf);
      const dup = await one<{ id: string; title: string | null }>(ctx.q, 'SELECT id, title FROM knowledge_source WHERE workspace_id = $1 AND sha256 = $2', [ctx.workspaceId, hash]);
      if (dup) {
        const n = await one<{ n: string }>(ctx.q, 'SELECT count(*) AS n FROM knowledge_span WHERE source_id = $1', [dup.id]);
        return { sourceId: dup.id, title: dup.title, duplicate: true, spanCount: Number(n!.n) };
      }
      const format = i.text !== undefined ? 'text' : detect(buf);
      const { spans, pages } = await extract(buf, format);
      if (!spans.length) throw new Error('no readable text was found in this document');
      if (spans.length > MAX_SPANS) throw new Error(`this document makes ${spans.length} passages; split it into smaller documents (limit ${MAX_SPANS})`);
      const title = i.title ?? (i.filename ? i.filename.replace(/\.[A-Za-z0-9]{1,5}$/, '') : `Pasted text ${new Date().toISOString().slice(0, 10)}`);
      const brand = await one<{ id: string }>(ctx.q, 'SELECT id FROM brand WHERE workspace_id = $1 ORDER BY created_at, id LIMIT 1', [ctx.workspaceId]);
      const src = await one<{ id: string }>(ctx.q,
        `INSERT INTO knowledge_source (workspace_id, brand_id, kind, uri, status, meta, title, sha256) VALUES ($1,$2,$3,$4,'indexed',$5,$6,$7) RETURNING id`,
        [ctx.workspaceId, brand?.id ?? null, i.text !== undefined ? 'text' : 'file', i.filename ?? null, { format, bytes: buf.length, pages: pages ?? null, spanCount: spans.length }, title, hash]);
      await ctx.q.query(
        `INSERT INTO knowledge_span (workspace_id, source_id, ordinal, text, location)
         SELECT $1, $2, o, t, l::jsonb FROM unnest($3::int[], $4::text[], $5::text[]) AS u(o, t, l)`,
        [ctx.workspaceId, src!.id, spans.map((_, n) => n + 1), spans.map(s => clean(s.text)), spans.map(s => JSON.stringify(s.location))]);
      const proposed = await proposeFacts(ctx, src!.id);   // company.ts: statements with their passage; prices and dates in prose excluded
      return { sourceId: src!.id, title, format, pages: pages ?? null, spanCount: spans.length, duplicate: false, ...proposed,
        next: 'Review the proposed facts and approve the ones she may say (knowledge.fact.decide).' };
    },
  }));

  r.register(tool(obj({ sourceId: opt(uuid()), status: opt(str({ oneOf: ['pending', 'approved', 'rejected'] })), after: opt(num({ int: true, min: 0 })), limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'knowledge.list', risk: 'read', summary: 'List knowledge sources, or the passages of one source',
    run: async (ctx, i) => {
      if (!i.sourceId) {
        return { sources: await many(ctx.q, `SELECT s.id, s.title, s.kind, s.uri AS filename, s.status, s.meta, s.created_at AS "createdAt",
            count(p.id)::int AS spans, count(p.id) FILTER (WHERE p.status = 'approved')::int AS approved, count(p.id) FILTER (WHERE p.status = 'pending')::int AS pending
          FROM knowledge_source s LEFT JOIN knowledge_span p ON p.source_id = s.id WHERE s.workspace_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`, [ctx.workspaceId]) };
      }
      const limit = i.limit ?? 50;
      const spans = await many<{ ordinal: number }>(ctx.q, `SELECT id, ordinal, text, location, status, decided_at AS "decidedAt" FROM knowledge_span
        WHERE workspace_id = $1 AND source_id = $2 AND ordinal > $3 AND ($4::text IS NULL OR status = $4) ORDER BY ordinal LIMIT $5`,
        [ctx.workspaceId, i.sourceId, i.after ?? 0, i.status ?? null, limit + 1]);
      const more = spans.length > limit;
      return { spans: spans.slice(0, limit), nextAfter: more ? spans[limit - 1].ordinal : null };
    },
  }));

  r.register(tool(obj({ spanIds: arr(uuid(), { min: 1, max: 200 }), decision: opt(str({ oneOf: ['approved', 'rejected'] })) }), {
    name: 'knowledge.span.approve', risk: 'draft', summary: 'Approve (or strike) passages so the agent may (or may not) state them as facts',
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'member' || isKey(ctx)) throw new Error('approving what the agent may say needs a signed-in person, not an agent or an API key');
      const decision = i.decision ?? 'approved';
      const ids = [...new Set(i.spanIds)];
      const found = await many<{ id: string }>(ctx.q, 'SELECT id FROM knowledge_span WHERE workspace_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE', [ctx.workspaceId, ids]);
      if (found.length !== ids.length) throw new Error(`${ids.length - found.length} of ${ids.length} passages are not in this workspace`);
      if (decision === 'rejected') {
        for (const id of ids) {
          const used = await one<{ name: string }>(ctx.q, 'SELECT name FROM offering WHERE workspace_id = $1 AND archived_at IS NULL AND facts @> $2::jsonb LIMIT 1', [ctx.workspaceId, JSON.stringify([{ spanId: id }])]);
          if (used) throw new Error(`a passage you picked backs a fact in the offering "${used.name}"; edit that offering first`);
        }
      }
      await ctx.q.query('UPDATE knowledge_span SET status = $3, decided_by = $4, decided_at = now() WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ctx.workspaceId, ids, decision, ctx.actor.id ?? null]);
      return { updated: ids.length, decision };
    },
  }));
}
