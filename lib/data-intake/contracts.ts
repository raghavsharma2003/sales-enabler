export const INTAKE_TARGETS = ['unknown', 'skip', 'name', 'email', 'phone', 'stage', 'notes', 'date', 'context', 'doNotContact'] as const;
export type IntakeTarget = typeof INTAKE_TARGETS[number];
export type ColumnMapping = { column: number; target: IntakeTarget };
export type MappingSuggestion = ColumnMapping & { reason: string; candidates: IntakeTarget[] };
export type IntakeTable = { headers: string[]; rows: string[][] };
export type IntakeInspection = { sourceId: string; sourceDigest: string; title: string; headers: string[]; samples: string[][]; totalRows: number; batchSize: number };
export type IntakeIdentity = { id: string; name: string; email: string; phone: string };
export type IntakeRow = {
  rowNumber: number; name: string; email: string; phone: string; stage: string; notes: string;
  doNotContact: boolean; context: Array<{ column: string; value: string; type: 'text' | 'date' }>;
  evidence: Array<{ column: string; value: string; target: IntakeTarget }>;
  issues: string[]; matches: Array<IntakeIdentity & { reasons: string[] }>; excluded: boolean;
  previous?: { contactId: string; action: 'create' | 'link' };
};
export type IntakePreview = {
  id: string; hash: string; sourceId: string; sourceDigest: string; actorId: string; directoryHash: string;
  mapping: ColumnMapping[]; excludedRows: number[]; cursor: number; nextCursor: number | null;
  totalRows: number; rows: IntakeRow[]; createdAt: string;
};
export type RowDecision = { rowNumber: number; action: 'create' | 'link' | 'skip'; contactId?: string };
export type IntakeReceipt = { id: string; previewId: string; previewHash: string; sourceId: string; created: number; linked: number; skipped: number; rows: Array<{ rowNumber: number; action: 'create' | 'link' | 'skip'; contactId?: string }>; replayed: boolean };
