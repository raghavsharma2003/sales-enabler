import { HttpError } from '../server/http';
import { customerPhone } from '../platform/phone';
import { INTAKE_TARGETS, type ColumnMapping, type IntakeTable, type IntakeRow, type IntakeIdentity } from './contracts';

export const MAX_TABLE_BYTES = 524_288;
export const MAX_TABLE_ROWS = 1000;
export const INTAKE_BATCH_SIZE = 200;
const MAX_COLUMNS = 50;
const MAX_CELL = 10_000;
export const identityKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** RFC-style quoted fields including embedded newlines; malformed or oversized input is rejected, never truncated. */
function csv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { if (cell.length > MAX_CELL) throw new HttpError(413, 'A table cell exceeds 10,000 characters.'); row.push(cell); cell = ''; closed = false; if (row.length > MAX_COLUMNS) throw new HttpError(413, 'Use at most 50 columns.'); };
  const finishRow = () => { finishCell(); rows.push(row); row = []; if (rows.length > MAX_TABLE_ROWS + 1) throw new HttpError(413, 'Use at most 1,000 data rows per source. Split larger files into sources.'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += char; continue; }
    if (char === ',') { finishCell(); continue; }
    if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); continue; }
    if (closed) throw new HttpError(400, 'Unexpected text after a quoted CSV field.');
    if (char === '"') { if (cell) throw new HttpError(400, 'Quote an entire CSV field and escape internal quotes.'); quoted = true; }
    else cell += char;
  }
  if (quoted) throw new HttpError(400, 'A CSV quoted field is not closed.');
  if (row.length || cell || closed) finishRow();
  return rows;
}

export function parseIntakeTable(raw: string, format: string): IntakeTable {
  if (Buffer.byteLength(raw, 'utf8') > MAX_TABLE_BYTES) throw new HttpError(413, 'Table exceeds the 512 KB limit.');
  if (raw.includes('\0')) throw new HttpError(400, 'Table contains invalid text.');
  const text = raw.replace(/^\uFEFF/, '');
  let headers: string[], rows: string[][];
  if (format === 'csv') {
    const matrix = csv(text); headers = matrix.shift() || []; rows = matrix;
  } else if (format === 'json') {
    let value: unknown; try { value = JSON.parse(text); } catch { throw new HttpError(400, 'The JSON table is not valid JSON.'); }
    if (!Array.isArray(value) || !value.length || value.length > MAX_TABLE_ROWS || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new HttpError(400, 'Use a JSON array of 1–1,000 objects with scalar fields.');
    headers = [...new Set(value.flatMap(item => Object.keys(item)))];
    rows = value.map(item => headers.map(header => {
      const cell: unknown = item[header];
      if (cell === undefined || cell === null) return '';
      if (!['string', 'number', 'boolean'].includes(typeof cell)) throw new HttpError(400, 'Nested JSON fields need a separate flat export.');
      return String(cell);
    }));
  } else throw new HttpError(415, 'Choose a CSV or JSON table source.');
  if (!headers.length || headers.length > MAX_COLUMNS || !rows.length) throw new HttpError(400, 'Use 1–50 columns and at least one data row.');
  headers = headers.map(header => header.trim());
  if (headers.some(header => !header || header.length > 160) || new Set(headers.map(identityKey)).size !== headers.length) throw new HttpError(400, 'Column headers must be nonempty, unique, and at most 160 characters.');
  if (rows.length > MAX_TABLE_ROWS) throw new HttpError(413, 'Use at most 1,000 rows per source; larger files need separate sources.');
  if (rows.some(row => row.length !== headers.length)) throw new HttpError(400, 'Every CSV row must have the same number of fields as its header.');
  if (rows.some(row => row.some(cell => cell.length > MAX_CELL))) throw new HttpError(413, 'A table cell exceeds 10,000 characters.');
  return { headers, rows };
}

export function validateMapping(value: unknown, headers: string[]): ColumnMapping[] {
  if (!Array.isArray(value) || value.length !== headers.length) throw new HttpError(400, 'Review every source column, including columns to skip.');
  const mapping = value.map(item => {
    if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.column) || item.column < 0 || item.column >= headers.length || !INTAKE_TARGETS.includes(item.target) || item.target === 'unknown') throw new HttpError(400, 'Choose a known field, customer context, or skip for every column.');
    return { column: item.column as number, target: item.target as ColumnMapping['target'] };
  }).sort((a, b) => a.column - b.column);
  if (new Set(mapping.map(item => item.column)).size !== headers.length) throw new HttpError(400, 'Each source column must be mapped once.');
  for (const target of ['name', 'email', 'phone', 'stage', 'notes']) {
    const count = mapping.filter(item => item.target === target).length;
    if (count > 1 || target === 'name' && count !== 1) throw new HttpError(400, target === 'name' ? 'Choose exactly one known customer name column.' : `Choose at most one ${target} column. Resolve competing columns explicitly.`);
  }
  return mapping;
}

const denyHeader = (value: string) => /^(donotcontact|optout|optedout|unsubscribed)$/.test(value.toLowerCase().replace(/[\s_-]/g, ''));
const isTrue = (value: string) => /^(true|yes|1|y)$/i.test(value.trim());
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value); return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function normalizeIntakeRows(table: IntakeTable, mapping: ColumnMapping[], excludedRows: number[], directory: IntakeIdentity[]): IntakeRow[] {
  const excluded = new Set(excludedRows);
  const rows: IntakeRow[] = table.rows.map((values, index) => {
    const result: IntakeRow = { rowNumber: index + 1, name: '', email: '', phone: '', stage: 'New', notes: '', context: [], evidence: [], doNotContact: false, issues: [], matches: [], excluded: excluded.has(index + 1) };
    for (const item of mapping) {
      const raw = values[item.column], value = raw.trim(), header = table.headers[item.column];
      result.evidence.push({ column: header, value: raw, target: item.target });
      // A recognized source restriction survives even when the user skips its column.
      if ((denyHeader(header) || item.target === 'doNotContact') && isTrue(value)) result.doNotContact = true;
      if (item.target === 'name') { result.name = value.normalize('NFKC').replace(/\s+/g, ' '); if (result.name.length > 160) result.issues.push('Name exceeds 160 characters'); }
      if (item.target === 'email') { result.email = value.normalize('NFKC').toLowerCase(); if (value && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) || result.email.length > 254)) result.issues.push('Invalid email'); }
      if (item.target === 'phone') { try { result.phone = customerPhone(value); } catch { result.issues.push('Invalid phone: explicit country code required'); } }
      if (item.target === 'stage' && value) { result.stage = value; if (value.length > 80) result.issues.push('Stage exceeds 80 characters'); }
      if (item.target === 'notes') result.notes = value;
      if (item.target === 'context' || item.target === 'date') {
        result.context.push({ column: header, value, type: item.target === 'date' ? 'date' : 'text' });
        if (item.target === 'date' && value && !validDate(value)) result.issues.push(`Invalid date in ${header}: use YYYY-MM-DD or map as text`);
      }
    }
    if (!result.name) result.issues.push('Empty customer name');
    result.matches = directory.flatMap(contact => {
      const reasons: string[] = [];
      if (result.email && identityKey(contact.email) === identityKey(result.email)) reasons.push('Exact email');
      if (result.name && identityKey(contact.name) === identityKey(result.name)) reasons.push('Exact name');
      if (result.phone && contact.phone === result.phone) reasons.push('Exact phone');
      return reasons.length ? [{ ...contact, reasons }] : [];
    });
    if (result.matches.length > 1) result.issues.push('Ambiguous customer match: explicitly choose a listed record or skip');
    return result;
  });
  const emailCounts = new Map<string, number>();
  for (const row of rows) if (!row.excluded && row.email) emailCounts.set(row.email, (emailCounts.get(row.email) || 0) + 1);
  for (const row of rows) if (!row.excluded && row.email && emailCounts.get(row.email)! > 1) row.issues.push('Duplicate email in source: exclude duplicate rows and preview again');
  return rows;
}
