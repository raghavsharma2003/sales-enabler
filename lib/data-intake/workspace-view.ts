import type { ColumnMapping, IntakePreview, IntakeRow, RowDecision } from './contracts';

export type RowFilter = 'all' | 'exceptions' | 'new' | 'existing' | 'undecided';
export function rowBlocked(row: IntakeRow) {
  return row.excluded || !!row.previous || row.issues.some(issue => !issue.startsWith('Ambiguous customer match'));
}
export function validNewRow(row: IntakeRow) {
  return !rowBlocked(row) && row.issues.length === 0 && row.matches.length === 0;
}
/** Name-only matches still require individual review; bulk links need one exact contact channel. */
export function safeExistingRow(row: IntakeRow) {
  return !rowBlocked(row) && row.issues.length === 0 && row.matches.length === 1 && row.matches[0].reasons.some(reason => reason === 'Exact email' || reason === 'Exact phone');
}
export function filteredRows(rows: IntakeRow[], decisions: Record<number, RowDecision>, filter: RowFilter) {
  return rows.filter(row => filter === 'all' || filter === 'exceptions' && row.issues.length > 0 || filter === 'new' && validNewRow(row) || filter === 'existing' && safeExistingRow(row) || filter === 'undecided' && !decisions[row.rowNumber]);
}
export function prepareRows(rows: IntakeRow[], decisions: Record<number, RowDecision>, action: 'create' | 'link' | 'skip') {
  const next = { ...decisions };
  for (const row of rows) {
    if (next[row.rowNumber]) continue;
    if (action === 'create' && validNewRow(row)) next[row.rowNumber] = { rowNumber: row.rowNumber, action };
    if (action === 'link' && safeExistingRow(row)) next[row.rowNumber] = { rowNumber: row.rowNumber, action, contactId: row.matches[0].id };
    if (action === 'skip') next[row.rowNumber] = { rowNumber: row.rowNumber, action };
  }
  return next;
}
export function parseExcludedRows(text: string, totalRows: number): number[] {
  if (!text.trim()) return [];
  const values = text.trim().split(/[\s,]+/).map(value => {
    if (!/^\d+$/.test(value)) throw new Error('Enter source row numbers separated by commas, for example 2, 205.');
    const row = Number(value);
    if (!Number.isSafeInteger(row) || row < 1 || row > totalRows) throw new Error(`Source row numbers must be between 1 and ${totalRows}.`);
    return row;
  });
  return [...new Set(values)].sort((a, b) => a - b);
}
export function reviewFingerprint(mapping: ColumnMapping[], excludedRows: number[], decisions: Record<number, RowDecision>, preview: IntakePreview | null, phase: string) {
  return JSON.stringify({ mapping, excludedRows: [...excludedRows].sort((a, b) => a - b), decisions: Object.values(decisions).sort((a, b) => a.rowNumber - b.rowNumber), previewId: preview?.id, phase });
}
