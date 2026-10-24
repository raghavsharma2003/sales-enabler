// Delimited text (CSV, TSV, semicolon or pipe) to rows. RFC 4180 quoting: quoted fields may hold the
// delimiter, newlines and doubled quotes. A BOM is dropped; CRLF and LF both end a row; blank rows are skipped.

export type Delimiter = ',' | '\t' | ';' | '|';

/** Pick the delimiter that splits the first lines most consistently (quotes respected). */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 64_000);
  const lines: string[] = [];
  let cur = '', q = false;
  for (const ch of sample) {
    if (ch === '"') q = !q;
    if ((ch === '\n') && !q) { if (cur.trim()) lines.push(cur); cur = ''; if (lines.length >= 20) break; continue; }
    cur += ch;
  }
  if (cur.trim() && lines.length < 20) lines.push(cur);
  let best: Delimiter = ',', bestScore = -1;
  for (const d of [',', '\t', ';', '|'] as Delimiter[]) {
    const counts = lines.map(l => countOutsideQuotes(l, d));
    if (!counts.length || counts[0] === 0) continue;
    const same = counts.filter(c => c === counts[0]).length / counts.length;
    const score = same * 10 + Math.min(counts[0], 50) / 50;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0, q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
  return n;
}

/** Parse all rows. Each row is its cells, untrimmed except for the surrounding whitespace of unquoted cells. */
export function parseDelimited(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, wasQuoted = false;
  const endCell = () => { row.push(wasQuoted ? cell : cell.trim()); cell = ''; wasQuoted = false; };
  const endRow = () => { endCell(); if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') { quoted = true; wasQuoted = true; cell = ''; continue; }
    if (ch === delimiter) { endCell(); continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); continue; }
    if (ch === '\n') { endRow(); continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/** Escape a value for a CSV export, neutralising spreadsheet formulas (=, +, -, @, tab, CR at the start). */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
