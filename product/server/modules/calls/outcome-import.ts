// Verified outcomes from a file, no developer needed (blueprint decision 7: results are earned from systems of record).
// The business exports what happened from its own system (paid, renewed, booked) and uploads it:
//   outcome.import.preview  (draft)   parse and match every row to exactly one call; nothing is written to outcomes
//   outcome.import          (policy)  a person approves the preview; each matched row becomes a verified outcome
//   outcome.import.list     (read)    past imports with their counts, including how often the AI's reading disagreed
// A row matches a call of the same contact (by phone, or by the contact's external id attribute) that started within the
// window before the row's date (default 14 days). No contact, no call, two calls, two rows for one call, an erased person
// a call that already holds a verified outcome, or a value the outcome does not allow: the row is shown with its reason and never written. The approval is bound to the
// match: if any row would match differently when it is approved (a new call, an erasure), the approval is void.
import { createHash } from 'node:crypto';
import { many, one, type Queryable } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { parseDelimited } from '../intake/csv.ts';
import { recordVerified } from './verified.ts';

const MAX_ROWS = 5000;
const norm = (h: string) => h.normalize('NFKC').toLowerCase().replace(/[_\-./#:()]+/g, ' ').replace(/\s+/g, ' ').trim();
const HEADERS: Record<'phone' | 'externalId' | 'value' | 'date' | 'amount' | 'reference', string[]> = {
  phone: ['phone', 'phone no', 'phone number', 'mobile', 'mobile no', 'mobile number', 'contact number', 'number', 'msisdn', 'customer phone', 'customer mobile'],
  externalId: ['external id', 'customer id', 'crm id', 'client id', 'record key', 'lead id', 'contact id'],
  value: ['outcome', 'result', 'status', 'value', 'outcome value', 'disposition'],
  date: ['date', 'outcome date', 'paid on', 'paid date', 'payment date', 'renewed on', 'renewal date', 'booked on', 'closed on', 'converted on'],
  amount: ['amount', 'amount paid', 'paid amount', 'amount inr', 'premium paid'],
  reference: ['reference', 'ref', 'reference no', 'txn id', 'transaction id', 'payment id', 'receipt', 'receipt no', 'order id', 'invoice no'],
};

export interface ImportRow {
  row: number;                   // the line in the file (the header is line 1)
  phone?: string; externalId?: string; value: string; date: string | null; amount?: string; reference?: string;
}
type Status = 'matched' | 'unmatched' | 'ambiguous' | 'invalid';
export interface RowResult { row: number; status: Status; reason: string | null; value: string; contactId: string | null; conversationId: string | null; aiRead: string | null; disagree: boolean }

/** Parse the file: a header row, then one outcome per row. Throws, in plain words, when a needed column is missing. */
export function parseOutcomeFile(text: string): ImportRow[] {
  const table = parseDelimited(text.replace(/^﻿/, '')).filter(r => r.some(c => c.trim()));
  if (table.length < 2) throw new Error('the file needs a header row and at least one row of outcomes');
  if (table.length - 1 > MAX_ROWS) throw new Error(`the file has ${table.length - 1} rows; import at most ${MAX_ROWS} at a time`);
  const head = table[0].map(norm);
  const col = (k: keyof typeof HEADERS) => head.findIndex(h => HEADERS[k].includes(h));
  const at = { phone: col('phone'), externalId: col('externalId'), value: col('value'), date: col('date'), amount: col('amount'), reference: col('reference') };
  const missing = [at.phone < 0 && at.externalId < 0 ? 'a phone or external id column' : null, at.value < 0 ? 'an outcome column' : null, at.date < 0 ? 'a date column' : null].filter(Boolean);
  if (missing.length) throw new Error(`the file needs ${missing.join(', ')}; its columns are: ${table[0].join(', ')}`);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '') || undefined;
  return table.slice(1).map((r, i) => ({
    row: i + 2, phone: cell(r, at.phone), externalId: cell(r, at.externalId),
    value: (cell(r, at.value) ?? '').toLowerCase().replace(/[\s-]+/g, '_'), date: parseDay(cell(r, at.date) ?? ''),
    amount: cell(r, at.amount), reference: cell(r, at.reference),
  }));
}

/** YYYY-MM-DD from ISO or the Indian DD/MM/YYYY order; null when it cannot be read. */
export function parseDay(s: string): string | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  return m ? valid(+m[3], +m[2], +m[1]) : null;
}
function valid(y: number, mo: number, d: number): string | null {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
}

interface MatchOpts { definitionId: string; allowed: string[]; windowDays: number; campaignId: string | null; idKey: string }

/** Match every row. Reads only this workspace's contacts and calls. */
export async function matchRows(q: Queryable, ws: string, rows: ImportRow[], o: MatchOpts): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const r of rows) {
    const res = (status: Status, reason: string | null, extra: Partial<RowResult> = {}): RowResult =>
      ({ row: r.row, status, reason, value: r.value, contactId: null, conversationId: null, aiRead: null, disagree: false, ...extra });
    if (!o.allowed.includes(r.value)) { out.push(res('invalid', `"${r.value}" is not one of this outcome's values (${o.allowed.join(', ')})`)); continue; }
    if (!r.date) { out.push(res('invalid', 'the date cannot be read (use YYYY-MM-DD or DD/MM/YYYY)')); continue; }
    let contacts: { id: string; erased: boolean }[] = [];
    if (r.phone) {
      const p = normaliseIndianPhone(r.phone);
      if (!p.ok) { out.push(res('invalid', 'the phone number cannot be read')); continue; }
      contacts = await many(q, `SELECT DISTINCT c.id, c.erased_at IS NOT NULL AS erased FROM contact c LEFT JOIN contact_identifier ci ON ci.contact_id = c.id AND ci.kind = 'phone_e164'
        WHERE c.workspace_id = $1 AND (c.e164 = $2 OR ci.raw = $2)`, [ws, p.e164]);
    } else if (r.externalId) {
      contacts = await many(q, `SELECT c.id, c.erased_at IS NOT NULL AS erased FROM contact c JOIN attribute a ON a.contact_id = c.id
        WHERE c.workspace_id = $1 AND a.key = $2 AND a.value #>> '{}' = $3`, [ws, o.idKey, r.externalId]);
    } else { out.push(res('invalid', 'the row has no phone and no external id')); continue; }
    if (!contacts.length) { out.push(res('unmatched', 'no contact in this workspace has that phone or id')); continue; }
    if (contacts.length > 1) { out.push(res('ambiguous', `${contacts.length} contacts share that id`)); continue; }
    const contact = contacts[0];
    if (contact.erased) { out.push(res('unmatched', 'the person was erased', { contactId: contact.id })); continue; }
    const calls = await many<{ id: string; ai: string | null }>(q, `SELECT cv.id,
        coalesce((SELECT o.value FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id AND o.definition_id = $5 AND o.grade = 'ai_guess'
                  ORDER BY o.created_at DESC LIMIT 1), cv.analysis->'outcomeGuess'->>'value') AS ai
      FROM conversation cv LEFT JOIN attempt at ON at.id = cv.attempt_id AND at.workspace_id = cv.workspace_id
      WHERE cv.workspace_id = $1 AND cv.contact_id = $2 AND cv.channel <> 'test' AND cv.status <> 'live'
        AND cv.started_at >= ($3::date - make_interval(days => $4))::timestamp AT TIME ZONE 'Asia/Kolkata'
        AND cv.started_at < ($3::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
        AND ($6::uuid IS NULL OR at.campaign_id = $6::uuid)
      ORDER BY cv.started_at`, [ws, contact.id, r.date, o.windowDays, o.definitionId, o.campaignId]);
    if (!calls.length) { out.push(res('unmatched', `no call with this person in the ${o.windowDays} days up to ${r.date}`, { contactId: contact.id })); continue; }
    if (calls.length > 1) { out.push(res('ambiguous', `${calls.length} calls with this person in the ${o.windowDays} days up to ${r.date}; not written`, { contactId: contact.id })); continue; }
    const prior = await one<{ src: string }>(q, `SELECT coalesce(evidence->>'file', source) AS src FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 AND definition_id = $3 AND grade = 'verified' LIMIT 1`,
      [calls[0].id, ws, o.definitionId]);
    if (prior) { out.push(res('unmatched', `the call already has a verified outcome (from ${prior.src}); not written again`, { contactId: contact.id, conversationId: calls[0].id })); continue; }
    const ai = calls[0].ai;
    out.push(res('matched', null, { contactId: contact.id, conversationId: calls[0].id, aiRead: ai, disagree: ai !== null && ai !== r.value }));
  }
  // Two rows for one call: neither is written.
  const byCall = new Map<string, RowResult[]>();
  for (const x of out) if (x.conversationId && x.status === 'matched') byCall.set(x.conversationId, [...(byCall.get(x.conversationId) ?? []), x]);
  for (const xs of byCall.values()) if (xs.length > 1) for (const x of xs) Object.assign(x, { status: 'ambiguous', reason: `rows ${xs.map(y => y.row).join(' and ')} match the same call; not written`, aiRead: null, disagree: false });
  return out;
}

export function counts(rs: RowResult[]) {
  const n = (s: Status) => rs.filter(r => r.status === s).length;
  return { rows: rs.length, matched: n('matched'), unmatched: n('unmatched'), ambiguous: n('ambiguous'), invalid: n('invalid'),
    disagreements: rs.filter(r => r.status === 'matched' && r.disagree).length };
}
const matchHash = (rs: RowResult[]) => createHash('sha256').update(JSON.stringify(rs.map(r => [r.row, r.status, r.conversationId, r.value]))).digest('hex');

async function loadImport(ctx: ToolCtx, id: string) {
  const imp = await one<{ id: string; file_name: string; definition_id: string; window_days: number; status: string; rows: any[]; counts: any; campaign_id: string | null; id_key: string; allowed: string[] }>(ctx.q,
    `SELECT i.id, i.file_name, i.definition_id, i.window_days, i.status, i.rows, i.counts, i.counts->>'campaignId' AS campaign_id, coalesce(i.counts->>'idKey', 'external_id') AS id_key, d.allowed_values AS allowed
     FROM outcome_import i JOIN outcome_definition d ON d.id = i.definition_id AND d.workspace_id = i.workspace_id WHERE i.id = $1 AND i.workspace_id = $2`, [id, ctx.workspaceId]);
  if (!imp) throw new Error('no such outcome import in this workspace');
  return imp;
}
const optsOf = (imp: Awaited<ReturnType<typeof loadImport>>): MatchOpts =>
  ({ definitionId: imp.definition_id, allowed: imp.allowed, windowDays: imp.window_days, campaignId: imp.campaign_id, idKey: imp.id_key });

const PEOPLE = ['owner', 'builder', 'operator', 'compliance'] as const;

export function registerOutcomeImport(r: Registry): void {
  r.register(tool(obj({
    fileName: str({ min: 1, max: 200 }), csv: str({ min: 1, max: 3_000_000, desc: 'the file text: a header row, then one outcome per row' }),
    definitionId: opt(uuid()), campaignId: opt(uuid()),
    windowDays: opt(num({ int: true, min: 1, max: 90, desc: 'how many days before the row date a call may be (default 14)' })),
    idKey: opt(str({ min: 1, max: 60, pattern: /^[a-z0-9_]+$/, desc: "the contact attribute holding the external id (default external_id)" })),
  }), {
    name: 'outcome.import.preview', risk: 'draft', roles: PEOPLE,
    summary: 'Read a file of results from your own system (paid, renewed, booked) and show which call each row matches; nothing is recorded yet',
    run: async (ctx, i) => {
      let definitionId = i.definitionId ?? null;
      if (i.campaignId) {
        const c = await one<{ d: string | null }>(ctx.q, 'SELECT outcome_definition_id AS d FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]);
        if (!c) throw new Error('no such campaign in this workspace');
        if (definitionId && c.d && definitionId !== c.d) throw new Error("that outcome is not this campaign's outcome");
        definitionId ??= c.d;
      }
      if (!definitionId) throw new Error('say which outcome the file records: pass the campaign, or the outcome definition');
      const d = await one<{ allowed_values: string[]; name: string }>(ctx.q, 'SELECT allowed_values, name FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [definitionId, ctx.workspaceId]);
      if (!d) throw new Error('no such outcome definition in this workspace');
      const rows = parseOutcomeFile(i.csv);
      const opts: MatchOpts = { definitionId, allowed: d.allowed_values, windowDays: i.windowDays ?? 14, campaignId: i.campaignId ?? null, idKey: i.idKey ?? 'external_id' };
      const results = await matchRows(ctx.q, ctx.workspaceId, rows, opts);
      const c = counts(results);
      const id = (await one<{ id: string }>(ctx.q, `INSERT INTO outcome_import (workspace_id, file_name, definition_id, window_days, rows, counts, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [ctx.workspaceId, i.fileName, definitionId, opts.windowDays,
          JSON.stringify(rows.map((x, k) => ({ ...x, contactId: results[k].contactId }))), JSON.stringify({ ...c, campaignId: opts.campaignId, idKey: opts.idKey }), ctx.actor.id ?? ctx.actor.type]))!.id;
      return { importId: id, outcome: d.name, windowDays: opts.windowDays, counts: c, rows: results.slice(0, 500).map(({ contactId, ...x }) => x),
        note: c.matched ? `Approve to record ${c.matched} verified ${c.matched === 1 ? 'outcome' : 'outcomes'}; unmatched, ambiguous and invalid rows are not written.` : 'No row matched a call, so there is nothing to record.' };
    },
  }));

  r.register(tool(obj({ importId: uuid() }), {
    name: 'outcome.import', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Record the matched rows of a previewed file as verified outcomes',
    describe: async (i, ctx) => {
      const imp = await loadImport(ctx, i.importId).catch(() => null);
      if (!imp) return `Record verified outcomes from import ${i.importId.slice(0, 8)}`;
      const c = imp.counts;
      return `Record ${c.matched} verified outcomes from ${imp.file_name} (${c.unmatched + c.ambiguous + c.invalid} rows not written; the AI's reading disagrees on ${c.disagreements})`;
    },
    // Bound to the match itself: a new call or an erasure since the preview changes the hash and voids the approval.
    version: async (ctx, i) => {
      const imp = await loadImport(ctx, i.importId).catch(() => null);
      if (!imp || imp.status !== 'previewed') return imp ? imp.status : null;
      return matchHash(await matchRows(ctx.q, ctx.workspaceId, imp.rows, optsOf(imp)));
    },
    run: async (ctx, i) => {
      const imp = await loadImport(ctx, i.importId);
      if (imp.status !== 'previewed') throw new Error('this file was already recorded');
      const rows: ImportRow[] = imp.rows;
      const results = await matchRows(ctx.q, ctx.workspaceId, rows, optsOf(imp));
      let written = 0, duplicates = 0;
      for (const [k, x] of results.entries()) {
        if (x.status !== 'matched') continue;
        const src = rows[k];
        const v = await recordVerified(ctx.q, ctx.workspaceId, { conversationId: x.conversationId!, definitionId: imp.definition_id, value: x.value,
          key: { source: 'file', ref: `${imp.id}:${x.row}` },
          evidence: { file: imp.file_name, row: x.row, importId: imp.id, date: src.date, ...(src.amount ? { amount: src.amount } : {}), ...(src.reference ? { reference: src.reference } : {}),
            aiRead: x.aiRead, disagree: x.disagree } });
        if (v.duplicate) duplicates++; else written++;
      }
      const c = { ...counts(results), written, duplicates };
      // Keep only what the import page needs: no phone, external id, reference or amount stays on the import.
      await ctx.q.query(`UPDATE outcome_import SET status = 'committed', committed_at = now(), rows = $3, counts = counts || $4::jsonb WHERE id = $1 AND workspace_id = $2`,
        [imp.id, ctx.workspaceId, JSON.stringify(results.map(({ aiRead, ...x }) => x)), JSON.stringify(c)]);
      return { importId: imp.id, file: imp.file_name, counts: c };
    },
  }));

  r.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'outcome.import.list', risk: 'read', summary: 'Files of verified results imported, with matched, unmatched and ambiguous rows and how often the AI read disagreed',
    run: async (ctx, i) => ({ imports: await many(ctx.q, `SELECT i.id, i.file_name AS "fileName", d.name AS outcome, i.window_days AS "windowDays", i.status, i.counts - 'idKey' - 'campaignId' AS counts,
        i.created_at AS "createdAt", i.committed_at AS "committedAt"
      FROM outcome_import i JOIN outcome_definition d ON d.id = i.definition_id AND d.workspace_id = i.workspace_id
      WHERE i.workspace_id = $1 ORDER BY i.created_at DESC LIMIT $2`, [ctx.workspaceId, i.limit ?? 20]) }),
  }));
}
