// .xlsx to rows, server-side, with no dependency: a small zip reader (stored and deflate entries, via node:zlib) and an
// OOXML reader for the first sheet. Formulas are never evaluated: a formula cell contributes its cached value (what Excel
// last showed), or nothing when the file carries none. Date-styled numbers become ISO dates; numbers keep all their
// digits (a phone saved as a number is 9000000001, not 9E+09). Bounded against zip bombs: entry count, per-entry and
// total inflated size.
import { inflateRawSync } from 'node:zlib';

export class XlsxError extends Error {
  constructor(message: string) { super(message); this.name = 'XlsxError'; }
}

const MAX_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_ROWS = 1_048_576, MAX_COLS = 16_384;

export const looksLikeXlsx = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

// ---- zip ---------------------------------------------------------------------------------------

interface Entry { name: string; method: number; compSize: number; size: number; offset: number }

function entries(buf: Buffer): Map<string, Entry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new XlsxError('this is not an Excel (.xlsx) file: no zip directory found');
  const count = buf.readUInt16LE(eocd + 10), cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new XlsxError('this .xlsx uses zip64, which is not supported; save it again from Excel or as CSV');
  if (count > MAX_ENTRIES) throw new XlsxError('this .xlsx has too many parts');
  const out = new Map<string, Entry>();
  let p = cdOffset;
  for (let k = 0; k < count; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new XlsxError('this .xlsx is damaged (zip directory)');
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const n = buf.readUInt16LE(p + 28), e = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + n);
    out.set(name.replace(/^\/+/, ''), { name, method, compSize, size, offset });
    p += 46 + n + e + c;
  }
  return out;
}

function read(buf: Buffer, e: Entry, budget: { left: number }): string {
  if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new XlsxError('this .xlsx is damaged (zip entry)');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const raw = buf.subarray(start, start + e.compSize);
  const limit = Math.min(MAX_ENTRY_BYTES, budget.left);
  let data: Buffer;
  if (e.method === 0) data = raw;
  else if (e.method === 8) {
    try { data = inflateRawSync(raw, { maxOutputLength: limit }); } catch (err) {
      throw new XlsxError(/maxOutputLength|buffer|ERR_BUFFER/i.test(String(err)) ? 'this .xlsx expands to more than VP reads; split it' : 'this .xlsx is damaged (could not decompress)');
    }
  } else throw new XlsxError(`this .xlsx uses an unsupported compression (${e.method})`);
  if (data.length > limit) throw new XlsxError('this .xlsx expands to more than VP reads; split it');
  budget.left -= data.length;
  return data.toString('utf8');
}

// ---- xml helpers -------------------------------------------------------------------------------

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescape(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, m: string) =>
    m[0] === '#' ? String.fromCodePoint(m[1] === 'x' || m[1] === 'X' ? parseInt(m.slice(2), 16) : parseInt(m.slice(1), 10)) : ENT[m.toLowerCase()])
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));   // Excel's escaped control characters
}
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : undefined; };
/** All text in <t> elements, skipping phonetic runs (<rPh>). */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map(m => unescape(m[1] ?? '')).join('');

// ---- styles: which cells are dates -------------------------------------------------------------

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function dateStyles(xml: string | null): Set<number> {
  const out = new Set<number>();
  if (!xml) return out;
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\s[^>]*\/?>/g)) {
    const id = Number(attr(m[0], 'numFmtId')), code = attr(m[0], 'formatCode') ?? '';
    custom.set(id, code);
  }
  const isDateCode = (code: string) => /[dmyhs]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"|\\./g, '')) && !/^(general|@|0+(\.0+)?%?|#.*)$/i.test(code.trim());
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  let i = 0;
  for (const m of xfs.matchAll(/<xf\s[^>]*?(\/>|>)/g)) {
    const id = Number(attr(m[0], 'numFmtId') ?? 0);
    if (BUILTIN_DATE.has(id) || (custom.has(id) && isDateCode(custom.get(id)!))) out.add(i);
    i++;
  }
  return out;
}

/** Excel serial day to ISO (date, or date-time when there is a time part). 1900 system, with Excel's 1900 leap bug. */
export function serialToIso(serial: number, date1904 = false): string {
  const days = date1904 ? serial + 1462 : serial;
  const ms = Math.round((days - 25569) * 86_400_000);       // 25569 = 1970-01-01 in the 1900 system
  const d = new Date(ms);
  const iso = d.toISOString();
  return Math.abs(days - Math.round(days)) < 1e-9 ? iso.slice(0, 10) : iso.slice(0, 19);
}

const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** A number as it should read in a cell: every digit of an integer (no exponent), at most 15 significant digits. */
function numberText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  const r = Number(n.toPrecision(15));
  return Number.isInteger(r) && Math.abs(r) < 1e21 ? BigInt(r).toString() : String(r);
}

export interface XlsxResult {
  sheet: string;
  rows: string[][];
  formulaCells: number;          // cells whose value came from a formula's cached result
  formulaWithoutValue: number;   // formula cells with no cached result (read as empty; never evaluated)
  errorCells: number;            // #N/A, #REF! and the like (read as empty)
}

/** Read the first sheet of an .xlsx. */
export function readXlsx(buf: Buffer): XlsxResult {
  if (!looksLikeXlsx(buf)) throw new XlsxError('this is not an Excel (.xlsx) file');
  const zip = entries(buf);
  const budget = { left: MAX_TOTAL_BYTES };
  const get = (name: string) => { const e = zip.get(name); return e ? read(buf, e, budget) : null; };
  const wb = get('xl/workbook.xml');
  if (!wb) throw new XlsxError(zip.has('word/document.xml') ? 'this is a Word file, not Excel' : 'this zip is not an Excel workbook (no xl/workbook.xml); .xls (Excel 97) is not supported, save as .xlsx or CSV');
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(wb);
  const first = /<sheet\s[^>]*\/?>/.exec(wb)?.[0];
  if (!first) throw new XlsxError('this workbook has no sheets');
  const sheetName = attr(first, 'name') ?? 'Sheet1';
  const rid = attr(first, 'r:id') ?? attr(first, 'id');
  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  let target = 'worksheets/sheet1.xml';
  for (const m of rels.matchAll(/<Relationship\s[^>]*\/?>/g)) if (attr(m[0], 'Id') === rid) target = attr(m[0], 'Target') ?? target;
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  const sheet = get(path);
  if (!sheet) throw new XlsxError('the first sheet is missing from this workbook');
  const shared = (get('xl/sharedStrings.xml') ?? '').match(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g)?.map(textOf) ?? [];
  const dates = dateStyles(get('xl/styles.xml'));

  const out: XlsxResult = { sheet: sheetName, rows: [], formulaCells: 0, formulaWithoutValue: 0, errorCells: 0 };
  const data = /<sheetData\b[^>]*>([\s\S]*)<\/sheetData>/.exec(sheet)?.[1] ?? '';
  for (const rm of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (out.rows.length >= MAX_ROWS) throw new XlsxError('this sheet has more rows than Excel allows');
    const row: string[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = cm[1], body = cm[2] ?? '';
      const ref = attr(head, 'r');
      const col = ref ? colIndex(ref) : next;
      if (col >= MAX_COLS) continue;
      next = col + 1;
      const t = attr(head, 't') ?? 'n';
      const s = Number(attr(head, 's') ?? -1);
      const hasF = /<f\b/.test(body);
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = '';
      if (t === 'inlineStr') text = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else if (v === undefined) { if (hasF) out.formulaWithoutValue++; }
      else if (t === 's') text = shared[Number(v)] ?? '';
      else if (t === 'str') text = unescape(v);
      else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'e') { out.errorCells++; text = ''; }
      else if (t === 'd') text = unescape(v);
      else text = dates.has(s) && Number.isFinite(Number(v)) ? serialToIso(Number(v), date1904) : numberText(v);
      if (hasF && v !== undefined) out.formulaCells++;
      while (row.length < col) row.push('');
      row[col] = text;
    }
    out.rows.push(row);
  }
  return out;
}

/** Rows to CSV text (RFC 4180), the shape the rest of intake reads. Values are kept as they are; no formula escaping. */
export function rowsToCsv(rows: string[][]): string {
  const cell = (s: string) => /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}
