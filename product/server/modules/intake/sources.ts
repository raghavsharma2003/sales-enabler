// Sources and files: register a source, receive a file in parts, map its columns with a per-row preview,
// commit it through the one write path, and accept signed webhook events from CRMs, forms and opt-ins.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../../../shared/approval.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { any, arr, bool, num, obj, opt, record, str, uuid, type Validator } from '../../../shared/validate.ts';
import { appendAudit } from '../../audit.ts';
import { many, one, tx, type Queryable } from '../../db.ts';
import { HttpError, type Req, type Router } from '../../http.ts';
import { inScope, tool, type Registry } from '../../tools.ts';
import type { Deps } from '../../app.ts';
import { DEFAULT_MAX_AGE_S, type Authority } from './authority.ts';
import { detectDelimiter, parseDelimited, type Delimiter } from './csv.ts';
import { attrKey, inferMapping, normLanguage, normTimezone, parseDate, truthy, typedValue, type ColumnMap, type Mapping } from './mapping.ts';
import { applyRows, hashWith, workspaceSalt, type InRow, type SourceRef } from './store.ts';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PART_CHARS = 950_000;                 // inline text in a tool call, under the tool endpoint's 1 MB body limit
const HOOK_SKEW_S = 300;
const FILE_KINDS = ['csv', 'tsv', 'sheet'] as const;
const HOOK_KINDS = ['api_push', 'crm', 'form', 'whatsapp'] as const;
type SourceKind = (typeof FILE_KINDS)[number] | (typeof HOOK_KINDS)[number];

// The person is the authority on what they typed into a form or an opt-in; files are uploads; pushes are declared.
const KIND_AUTHORITY: Record<SourceKind, Authority> = { csv: 'upload', tsv: 'upload', sheet: 'upload', api_push: 'crm', crm: 'crm', form: 'person', whatsapp: 'person' };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

interface SourceRow { id: string; workspace_id: string; kind: SourceKind; name: string; authority: Authority; max_age_s: number | null; hook_secret: string | null; status: string }

export function sourceRef(s: SourceRow): SourceRef {
  return { id: s.id, authority: s.authority, maxAgeS: s.max_age_s ?? DEFAULT_MAX_AGE_S[s.authority], label: `${s.kind}:${s.id}`,
    code: (FILE_KINDS as readonly string[]).includes(s.kind) ? 'upload' : s.kind };
}

async function createSource(q: Queryable, ws: string, i: { kind: SourceKind; name: string; authority?: Authority; maxAgeDays?: number }) {
  const hook = (HOOK_KINDS as readonly string[]).includes(i.kind);
  // Files are uploads and forms are the person; only pushes and CRMs may declare their own authority.
  const authority = (i.kind === 'api_push' || i.kind === 'crm') && i.authority ? i.authority : KIND_AUTHORITY[i.kind];
  const secret = hook ? randomBytes(32).toString('base64url') : null;
  const s = await one<SourceRow>(q, `INSERT INTO intake_source (workspace_id, kind, name, authority, max_age_s, hook_secret)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [ws, i.kind, i.name, authority, i.maxAgeDays != null ? Math.round(i.maxAgeDays * 86400) : null, secret]);
  return { source: s!, secret };
}

async function getSource(q: Queryable, ws: string, id: string): Promise<SourceRow> {
  const s = await one<SourceRow>(q, 'SELECT * FROM intake_source WHERE id = $1 AND workspace_id = $2', [id, ws]);
  if (!s) throw new HttpError(404, 'not_found', 'no such source in this workspace');
  return s;
}

/** Receive one part of a file. Parts arrive in order; re-sending the last part is a no-op. */
export async function receivePart(q: Queryable, ws: string, p: { uploadId?: string; sourceId?: string; filename?: string; text: string; part?: number; final?: boolean }) {
  if (Buffer.byteLength(p.text) > MAX_FILE_BYTES) throw new HttpError(413, 'too_large', 'files are limited to 20 MB');
  let up: { id: string; parts: number; bytes: number; last_part_sha: string | null; status: string; source_id: string | null } | null;
  if (!p.uploadId) {
    const kind: SourceKind = /\.tsv$/i.test(p.filename ?? '') || detectDelimiter(p.text) === '\t' ? 'tsv' : 'csv';
    const src = p.sourceId ? await getSource(q, ws, p.sourceId) : (await createSource(q, ws, { kind, name: p.filename ?? 'upload' })).source;
    if (!(FILE_KINDS as readonly string[]).includes(src.kind)) throw new HttpError(409, 'wrong_source', 'that source takes webhook events, not files');
    up = await one(q, `INSERT INTO intake_upload (workspace_id, source_id, filename, content, bytes, parts, last_part_sha)
      VALUES ($1,$2,$3,$4,$5,1,$6) RETURNING id, parts, bytes, last_part_sha, status, source_id`,
      [ws, src.id, p.filename ?? null, p.text, Buffer.byteLength(p.text), sha(p.text)]);
  } else {
    up = await one(q, 'SELECT id, parts, bytes, last_part_sha, status, source_id FROM intake_upload WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [p.uploadId, ws]);
    if (!up) throw new HttpError(404, 'not_found', 'no such upload');
    const part = p.part ?? up.parts + 1;
    if (part === up.parts && up.last_part_sha === sha(p.text)) { /* a retry of the last part */ }
    else {
      if (up.status !== 'receiving') throw new HttpError(409, 'closed', 'this upload is already complete');
      if (part !== up.parts + 1) throw new HttpError(409, 'out_of_order', `expected part ${up.parts + 1}, got part ${part}`);
      const bytes = up.bytes + Buffer.byteLength(p.text);
      if (bytes > MAX_FILE_BYTES) throw new HttpError(413, 'too_large', 'files are limited to 20 MB');
      up = await one(q, `UPDATE intake_upload SET content = content || $2, bytes = $3, parts = $4, last_part_sha = $5 WHERE id = $1
        RETURNING id, parts, bytes, last_part_sha, status, source_id`, [up.id, p.text, bytes, part, sha(p.text)]);
    }
  }
  if (up!.bytes > MAX_FILE_BYTES) throw new HttpError(413, 'too_large', 'files are limited to 20 MB');
  if (p.final && up!.status === 'receiving') {
    const row = await one<{ content: string; filename: string | null }>(q, 'SELECT content, filename FROM intake_upload WHERE id = $1', [up!.id]);
    const src = await getSource(q, ws, up!.source_id!);
    const r = await one<{ id: string }>(q, "INSERT INTO source_receipt (workspace_id, kind, filename, summary) VALUES ($1,$2,$3,$4) RETURNING id",
      [ws, src.kind, row!.filename, JSON.stringify({ state: 'received', sourceId: src.id })]);
    await q.query("UPDATE intake_upload SET status = 'received', sha256 = $2, receipt_id = $3 WHERE id = $1", [up!.id, sha(row!.content), r!.id]);
    up!.status = 'received';
  }
  return { uploadId: up!.id, sourceId: up!.source_id, parts: up!.parts, bytes: up!.bytes, status: up!.status };
}

// ---- mapping and preview -------------------------------------------------------------------------

const override = obj({ field: str({ oneOf: ['phone', 'name', 'first_name', 'last_name', 'language', 'timezone', 'consent', 'consent_at', 'opt_out', 'observed_at', 'attribute', 'ignore'] }),
  key: opt(str({ pattern: /^[\p{L}\p{N}_]{1,60}$/u })), type: opt(str({ oneOf: ['text', 'number', 'date', 'boolean'] })) });
const overrides = opt(record(override, { maxKeys: 200 })) as Validator<Record<string, Partial<ColumnMap>> | undefined>;

interface Table { rows: string[][]; delimiter: Delimiter; mapping: Mapping }

function table(content: string, given?: Record<string, Partial<ColumnMap>>): Table {
  const delimiter = detectDelimiter(content);
  const rows = parseDelimited(content, delimiter);
  return { rows, delimiter, mapping: inferMapping(rows, given ?? {}) };
}

/** Turn one file row into the write path's shape, plus the cell-level notes the preview shows. */
function toInRow(cells: string[], rowNo: number, m: Mapping, now: Date): { row: InRow; notes: string[] } {
  const attrs: Record<string, unknown> = {};
  const notes: string[] = [];
  let phone = '', first = '', last = '';
  const consent: { granted?: boolean; at?: string } = {};
  let optOut = false, observedAt: Date | undefined;
  for (const c of m.columns) {
    const v = (cells[c.column] ?? '').trim();
    if (!v || c.field === 'ignore') continue;
    switch (c.field) {
      case 'phone': phone = v; break;
      case 'name': attrs.name = v.slice(0, 200); break;
      case 'first_name': first = v; break;
      case 'last_name': last = v; break;
      case 'language': { const l = normLanguage(v); if (l) attrs.language = l; else notes.push(`language "${v.slice(0, 20)}" not recognised`); break; }
      case 'timezone': { const t = normTimezone(v); if (t) attrs.timezone = t; else notes.push('timezone not recognised; India time kept'); break; }
      case 'consent': { const t = truthy(v); if (t !== null) consent.granted = t; else notes.push('consent value is not a yes or no'); break; }
      case 'consent_at': consent.at = parseDate(v) ?? undefined; break;
      case 'opt_out': optOut = truthy(v) === true || /^(dnd|dnc|do not call)$/i.test(v); break;
      case 'observed_at': { const d = parseDate(v); if (d) { const t = new Date(d); if (t.getTime() <= now.getTime()) observedAt = t; } break; }
      case 'attribute': attrs[c.key ?? attrKey(c.header)] = typedValue(v, c.type); break;
    }
  }
  if (!attrs.name && (first || last)) attrs.name = `${first} ${last}`.trim().slice(0, 200);
  if (first) attrs.first_name = first;
  if (last) attrs.last_name = last;
  return { row: { row: rowNo, phone, attrs, optOut, observedAt, consent: consent.granted !== undefined ? [{ granted: consent.granted, at: consent.at }] : undefined }, notes };
}

function fileRows(t: Table, now: Date): { rows: InRow[]; notes: Map<number, string[]> } {
  const start = t.mapping.hasHeader ? 1 : 0;
  const rows: InRow[] = [], notes = new Map<number, string[]>();
  for (let i = start; i < t.rows.length; i++) {
    const r = toInRow(t.rows[i], i + 1, t.mapping, now);
    rows.push(r.row);
    if (r.notes.length) notes.set(i + 1, r.notes);
  }
  return { rows, notes };
}

async function loadUpload(q: Queryable, ws: string, id: string, lock = false) {
  const u = await one<{ id: string; content: string; status: string; source_id: string; receipt_id: string | null; mapping: Mapping | null; sha256: string | null; filename: string | null }>(q,
    `SELECT id, content, status, source_id, receipt_id, mapping, sha256, filename FROM intake_upload WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
  if (!u) throw new Error('no such upload in this workspace');
  if (u.status === 'receiving') throw new Error('this upload is still receiving parts; send the last part with final=true');
  return u;
}

const mask = (e164: string) => e164.slice(0, 3) + '•••••' + e164.slice(-4);

export function registerSourceTools(reg: Registry): void {
  reg.register(tool(obj({
    kind: str({ oneOf: [...FILE_KINDS, ...HOOK_KINDS] }),
    name: str({ min: 1, max: 120 }),
    authority: opt(str({ oneOf: ['system', 'crm', 'upload', 'agent', 'person'] })),
    maxAgeDays: opt(num({ min: 0.01, max: 3650 })),
    text: opt(str({ max: MAX_PART_CHARS })),
    filename: opt(str({ max: 200 })),
  }), {
    name: 'source.upload', risk: 'draft',
    summary: 'Register a source of people: a file (text inline, or parts via POST /v1/uploads/contacts) or a signed webhook for a CRM, form or opt-in',
    // The webhook secret is shown once to the caller and never stored in action.result (A0 workspaces approve drafts).
    redactResult: (out: Record<string, unknown>) => (out.secret ? { ...out, secret: '[shown once]' } : out),
    run: async (ctx, i): Promise<Record<string, unknown>> => {
      const { source, secret } = await createSource(ctx.q, ctx.workspaceId, { kind: i.kind as SourceKind, name: i.name, authority: i.authority as Authority | undefined, maxAgeDays: i.maxAgeDays });
      const out: Record<string, unknown> = { sourceId: source.id, kind: source.kind, authority: source.authority };
      if (secret) Object.assign(out, { hookUrl: `/hooks/contacts/${source.id}`, secret, signing: 'x-vp-timestamp: unix seconds; x-vp-signature: sha256=hex(HMAC-SHA256(secret, timestamp + "." + body))', shownOnce: true });
      if (i.text !== undefined) {
        if (!(FILE_KINDS as readonly string[]).includes(i.kind)) throw new Error('text goes to a file source (csv, tsv, sheet)');
        Object.assign(out, await receivePart(ctx.q, ctx.workspaceId, { sourceId: source.id, filename: i.filename ?? i.name, text: i.text, final: true }));
      }
      return out;
    },
  }));

  reg.register(tool(obj({ uploadId: uuid(), overrides, previewRows: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'source.map', risk: 'draft',
    summary: 'Detect the columns of an uploaded file and preview what each row would do, with a reason for every row that will not be called',
    run: async (ctx, i) => {
      const u = await loadUpload(ctx.q, ctx.workspaceId, i.uploadId);
      const t = table(u.content, i.overrides);
      const now = new Date();
      const { rows, notes } = fileRows(t, now);
      const phoneCol = t.mapping.columns.find(c => c.field === 'phone');
      // Whole-file phone summary (in memory, no writes).
      const reasons: Record<string, number> = {};
      const seen = new Map<string, number>();
      let ok = 0, dup = 0;
      const e164s: (string | null)[] = rows.map(r => {
        const p = normaliseIndianPhone(r.phone);
        if (!p.ok) { reasons[p.reason] = (reasons[p.reason] ?? 0) + 1; return null; }
        if (seen.has(p.e164)) dup++; else { seen.set(p.e164, r.row); ok++; }
        return p.e164;
      });
      // Preview rows: look up existing, suppressed and tombstoned state for just these numbers.
      const n = i.previewRows ?? 20;
      const head = rows.slice(0, n);
      const nums = [...new Set(e164s.slice(0, n).filter((e): e is string => !!e))];
      const salt = await workspaceSalt(ctx.q, ctx.workspaceId);
      const existing = new Set((await many<{ e164: string }>(ctx.q, 'SELECT e164 FROM contact WHERE workspace_id = $1 AND e164 = ANY($2::text[]) AND erased_at IS NULL', [ctx.workspaceId, nums])).map(r => r.e164));
      const suppressed = new Set((await many<{ e164: string }>(ctx.q, `SELECT c.e164 FROM contact c JOIN suppression s ON s.workspace_id = c.workspace_id AND s.scope = 'workspace'
        AND (s.contact_id = c.id OR s.e164 = c.e164) WHERE c.workspace_id = $1 AND c.e164 = ANY($2::text[])
        UNION SELECT e164 FROM suppression WHERE workspace_id = $1 AND e164 = ANY($2::text[])`, [ctx.workspaceId, nums])).map(r => r.e164));
      const hashes = new Map(nums.map(e => [hashWith(salt, e), e]));
      const dead = new Set((await many<{ e164_hash: string }>(ctx.q, 'SELECT e164_hash FROM tombstone WHERE workspace_id = $1 AND e164_hash = ANY($2::text[])', [ctx.workspaceId, [...hashes.keys()]])).map(r => hashes.get(r.e164_hash)!));
      const firstRow = new Map<string, number>();
      const preview = head.map((r, k) => {
        const e = e164s[k];
        const p = normaliseIndianPhone(r.phone);
        let verdict: string;
        if (!e) verdict = p.ok ? 'ok' : p.reason;
        else if (dead.has(e)) verdict = 'tombstoned';
        else if (firstRow.has(e)) verdict = 'duplicate_in_file';
        else verdict = existing.has(e) ? 'update' : 'new';
        if (e && !firstRow.has(e)) firstRow.set(e, r.row);
        const flags = [...(e && (suppressed.has(e) || r.optOut) ? ['suppressed'] : []), ...(r.consent?.length ? [r.consent[0].granted ? 'consent_yes' : 'consent_no'] : [])];
        return { row: r.row, phone: e ? (ctx.actor.role === 'viewer' ? mask(e) : e) : null, verdict, flags, notes: notes.get(r.row) ?? [],
          attributes: ctx.actor.role === 'viewer' ? Object.keys(r.attrs) : r.attrs };
      });
      const questions: string[] = [];
      if (!phoneCol) questions.push('Which column has the phone number?');
      if (t.mapping.columns.some(c => c.field === 'consent')) questions.push('What did people consent to (the purpose)? Consent is recorded only with a purpose.');
      if (reasons.NON_INDIAN) questions.push(`${reasons.NON_INDIAN} numbers are outside India; they are kept but never auto-dialled. Is that right?`);
      await ctx.q.query('UPDATE intake_upload SET mapping = $2 WHERE id = $1', [u.id, JSON.stringify(t.mapping)]);
      return {
        uploadId: u.id, delimiter: t.delimiter === '\t' ? 'tab' : t.delimiter, hasHeader: t.mapping.hasHeader,
        columns: t.mapping.columns, ignoredByDesign: t.mapping.columns.filter(c => c.why === 'pii_by_design').map(c => c.header),
        rowsTotal: rows.length, phones: { ok, duplicatesInFile: dup, rejected: reasons },
        preview, questions: questions.slice(0, 3),
      };
    },
  }));

  reg.register(tool(obj({ uploadId: uuid(), overrides, consentPurpose: opt(str({ min: 2, max: 80 })), audienceName: opt(str({ min: 1, max: 120 })) }), {
    name: 'source.commit', risk: 'draft',
    summary: 'Import a mapped file: dedupe on the number, merge by authority and freshness, append consent, keep every suppression and tombstone',
    run: async (ctx, i) => {
      const u = await loadUpload(ctx.q, ctx.workspaceId, i.uploadId, true);
      if (u.status === 'committed') throw new Error('this upload is already imported; its receipt has the result');
      const t = table(u.content, undefined);
      if (i.overrides || !u.mapping) t.mapping = inferMapping(t.rows, i.overrides ?? {});
      else t.mapping = u.mapping;
      if (!t.mapping.columns.some(c => c.field === 'phone')) throw new Error('no phone column found; map one with overrides');
      const src = await getSource(ctx.q, ctx.workspaceId, u.source_id);
      const started = Date.now();
      const { rows } = fileRows(t, new Date());
      let audienceId: string | undefined;
      if (i.audienceName) audienceId = (await one<{ id: string }>(ctx.q, "INSERT INTO audience (workspace_id, name, kind, definition, source_id) VALUES ($1,$2,'list',$3,$4) RETURNING id",
        [ctx.workspaceId, i.audienceName, JSON.stringify({ fromUpload: u.id }), u.receipt_id]))!.id;
      const res = await applyRows(ctx.q, ctx.workspaceId, rows, { source: sourceRef(src), receiptId: u.receipt_id, consentPurpose: i.consentPurpose, audienceId });
      const ms = Date.now() - started;
      const rowsOk = res.counts.new + res.counts.updated + res.counts.unchanged;
      const summary = { state: 'committed', sourceId: src.id, uploadId: u.id, fileSha256: u.sha256, mappingSha256: createHash('sha256').update(canonicalJson(t.mapping)).digest('hex'),
        delimiter: t.delimiter === '\t' ? 'tab' : t.delimiter, counts: res.counts, issues: res.issues, ms, audienceId: audienceId ?? null };
      await ctx.q.query('UPDATE source_receipt SET rows_total = $2, rows_ok = $3, summary = $4 WHERE id = $1 AND workspace_id = $5',
        [u.receipt_id, rows.length, rowsOk, JSON.stringify(summary), ctx.workspaceId]);
      await ctx.q.query("UPDATE intake_upload SET status = 'committed', committed_at = now(), mapping = $2 WHERE id = $1", [u.id, JSON.stringify(t.mapping)]);
      return { receiptId: u.receipt_id, rowsTotal: rows.length, rowsOk, counts: res.counts, issues: res.issues.slice(0, 50), audienceId: audienceId ?? null, ms };
    },
  }));

  reg.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'source.list', risk: 'read', summary: 'List the sources people come from, with their authority and last receipt',
    run: async (ctx, i) => ({ sources: await many(ctx.q, `SELECT s.id, s.kind, s.name, s.authority, s.max_age_s, s.status, s.created_at, (s.hook_secret IS NOT NULL) AS signed_webhook,
        (SELECT max(r.created_at) FROM intake_upload u JOIN source_receipt r ON r.id = u.receipt_id WHERE u.source_id = s.id) AS last_receipt_at
      FROM intake_source s WHERE s.workspace_id = $1 ORDER BY s.created_at DESC LIMIT $2`, [ctx.workspaceId, i.limit ?? 50]) }),
  }));

  reg.register(tool(obj({ receiptId: uuid() }), {
    name: 'source.receipt', risk: 'read', summary: 'Read an import receipt: counts and the reason for every row not imported or not callable',
    run: async (ctx, i) => {
      const r = await one(ctx.q, 'SELECT id, kind, filename, rows_total, rows_ok, summary, created_at FROM source_receipt WHERE id = $1 AND workspace_id = $2', [i.receiptId, ctx.workspaceId]);
      if (!r) throw new Error('no such receipt in this workspace');
      return r;
    },
  }));
}

// ---- raw routes: file parts and signed webhooks -------------------------------------------------

const partBody = obj({ text: str({ max: MAX_FILE_BYTES }), filename: opt(str({ max: 200 })), sourceId: opt(uuid()), uploadId: opt(uuid()),
  part: opt(num({ int: true, min: 1, max: 1000 })), final: opt(bool()) });

const hookContact = obj({
  phone: str({ min: 1, max: 40 }),
  name: opt(str({ max: 200 })), language: opt(str({ max: 40 })), timezone: opt(str({ max: 60 })),
  externalId: opt(str({ max: 120 })),
  attributes: opt(record(any(), { maxKeys: 50 })),
  consent: opt(obj({ purpose: str({ min: 2, max: 80 }), granted: bool(), basis: opt(str({ max: 40 })), channel: opt(str({ oneOf: ['voice', 'sms', 'whatsapp', 'email'] })), at: opt(str({ max: 40 })) })),
  optOut: opt(bool()),
});
const hookBody = obj({ eventId: str({ min: 1, max: 200 }), occurredAt: opt(str({ max: 40 })), contacts: arr(hookContact, { min: 1, max: 500 }) });

/** HMAC-SHA256(secret, timestamp + "." + exact body bytes), compared in constant time. */
function signatureOk(secret: string, ts: string, raw: Buffer, given: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/.exec(given.trim());
  if (!m) return false;
  const want = createHmac('sha256', secret).update(ts + '.').update(raw).digest();
  return timingSafeEqual(want, Buffer.from(m[1], 'hex'));
}

/** Sign a webhook body the way /hooks/contacts expects (for senders and tests). Send exactly `body`. */
export function signHook(secret: string, body: string, ts = Math.floor(Date.now() / 1000)): { 'x-vp-timestamp': string; 'x-vp-signature': string } {
  return { 'x-vp-timestamp': String(ts), 'x-vp-signature': 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex') };
}

const DRAFT_ROLES = ['owner', 'builder', 'operator'];

export function registerSourceRoutes(router: Router, deps: Deps): void {
  // A whole file (up to 20 MB) or parts of one. JSON {text, filename?, sourceId?, uploadId?, part?, final?} (required over a
  // session cookie), or raw text/csv or text/tab-separated-values with the same fields in the query string (API keys).
  router.add('POST', '/v1/uploads/contacts', async (req: Req) => {
    const c = await deps.auth(req);
    if (!c.actor.role || !DRAFT_ROLES.includes(c.actor.role)) throw new HttpError(403, 'forbidden', `a ${c.actor.role ?? 'caller without a role'} cannot upload people`);
    if (!inScope(c.actor.scopes, 'source.upload')) throw new HttpError(403, 'forbidden', "this API key's scopes do not include source.upload");
    const qp = req.query;
    const raw = (req.body as Buffer | undefined) ?? Buffer.alloc(0);
    let b: ReturnType<typeof partBody>;
    if (String(req.headers['content-type'] ?? '').includes('application/json')) {
      let j: unknown;
      try { j = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'bad_json', 'the request body is not valid JSON'); }
      b = partBody(j ?? {});
    } else {
      b = partBody({ text: raw.toString('utf8'), filename: qp.get('filename') ?? undefined, sourceId: qp.get('sourceId') ?? undefined, uploadId: qp.get('uploadId') ?? undefined,
        part: qp.get('part') ? Number(qp.get('part')) : undefined, final: qp.get('final') ? qp.get('final') === '1' || qp.get('final') === 'true' : undefined });
    }
    const out = await tx(deps.pool, async q => {
      const r = await receivePart(q, c.workspaceId, b);
      await appendAudit(q, { workspaceId: c.workspaceId, actorType: c.actor.type, actorId: c.actor.id, action: 'source.upload_part', objectType: 'intake_upload', objectId: r.uploadId,
        payload: { part: r.parts, bytes: r.bytes, status: r.status } });
      return r;
    });
    return { status: out.status === 'received' ? 201 : 202, body: out };
  }, { rawBody: true, limit: MAX_FILE_BYTES + 64 * 1024 });

  router.add('POST', '/hooks/contacts/:sourceId', async (req: Req) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.sourceId)) throw new HttpError(404, 'not_found', 'no such source');
    const src = await one<SourceRow>(deps.pool, 'SELECT * FROM intake_source WHERE id = $1', [req.params.sourceId]);
    if (!src || !src.hook_secret) throw new HttpError(404, 'not_found', 'no such source');
    const ts = String(req.headers['x-vp-timestamp'] ?? '');
    const sig = String(req.headers['x-vp-signature'] ?? '');
    if (!/^\d{9,11}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > HOOK_SKEW_S) throw new HttpError(401, 'bad_signature', 'missing or stale x-vp-timestamp');
    const raw = (req.body as Buffer | undefined) ?? Buffer.alloc(0);
    if (!signatureOk(src.hook_secret, ts, raw, sig)) throw new HttpError(401, 'bad_signature', 'the signature does not match');
    if (src.status !== 'active') throw new HttpError(423, 'paused', 'this source is paused');
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'bad_json', 'the body is not JSON'); }
    const b = hookBody(parsed);
    const ws = src.workspace_id;
    const occurred = b.occurredAt ? new Date(b.occurredAt) : new Date();
    const observedAt = Number.isNaN(occurred.getTime()) || occurred.getTime() > Date.now() + 60_000 ? new Date() : occurred;
    return tx(deps.pool, async q => {
      const fresh = await one(q, 'INSERT INTO intake_hook_event (source_id, event_id, workspace_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id', [src.id, b.eventId, ws]);
      if (!fresh) {
        const prev = await one<{ result: unknown }>(q, 'SELECT result FROM intake_hook_event WHERE source_id = $1 AND event_id = $2', [src.id, b.eventId]);
        return { status: 200, body: { duplicate: true, eventId: b.eventId, result: prev?.result ?? null } };
      }
      const rows: InRow[] = b.contacts.map((ct, k) => {
        const attrs: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(ct.attributes ?? {})) {
          if (v === null || JSON.stringify(v).length > 2000) continue;
          attrs[attrKey(key)] = v;
        }
        if (ct.externalId) attrs.external_id = ct.externalId;
        if (ct.name) attrs.name = ct.name;
        const l = ct.language ? normLanguage(ct.language) : null; if (l) attrs.language = l;
        const tz = ct.timezone ? normTimezone(ct.timezone) : null; if (tz) attrs.timezone = tz;
        return { row: k + 1, phone: ct.phone, attrs, optOut: ct.optOut, observedAt,
          consent: ct.consent ? [{ granted: ct.consent.granted, purpose: ct.consent.purpose, basis: ct.consent.basis, channel: ct.consent.channel, at: ct.consent.at }] : undefined };
      });
      const res = await applyRows(q, ws, rows, { source: sourceRef(src) });
      const result = { counts: res.counts, issues: res.issues.slice(0, 100) };
      await q.query('UPDATE intake_hook_event SET result = $3 WHERE source_id = $1 AND event_id = $2', [src.id, b.eventId, JSON.stringify(result)]);
      await appendAudit(q, { workspaceId: ws, actorType: 'system', actorId: 'hook:' + src.id, action: 'contact.webhook', objectType: 'intake_source', objectId: src.id,
        argsHash: sha(raw.toString('utf8')), payload: { eventId: b.eventId, counts: res.counts } });
      return { status: 200, body: { duplicate: false, eventId: b.eventId, result } };
    });
  }, { rawBody: true });
}
