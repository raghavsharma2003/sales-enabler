import { createHash } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import type { Database } from '../server/db';
import { HttpError } from '../server/http';

/** A source binding is checked again before a saved answer is shown. No source text is copied into it. */
export type SourceBinding = { id: string; kind: string; status: string | null; dataHash: string };
export type BrainChunk = {
  id: string; sourceId: string; sourceKind: 'brain_source' | 'reviewed_ingestion'; sourceRevision: number;
  title: string; sourceLabel: string; text: string; approvedSummary?: string;
  start: number; end: number; bindings: SourceBinding[];
};
type StoredRow = { id: string; kind: string; status: string | null; data: string };
type Source = Omit<BrainChunk, 'id' | 'text' | 'start' | 'end'> & { content: string };

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const binding = (row: StoredRow): SourceBinding => ({ id: row.id, kind: row.kind, status: row.status, dataHash: sha(row.data) });
const stored = (row: StoredRow): Record<string, unknown> | null => {
  try { const value = JSON.parse(row.data); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
};
const dataOf = (row: StoredRow): Record<string, unknown> | null => {
  const value = stored(row)?.data;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
};
const text = (value: unknown, max: number): string => typeof value === 'string' ? value.slice(0, max) : '';

/** Only company-wide, reviewed evidence is eligible. GroupAI and contact memory never enter this query. */
export async function loadApprovedCompanySources(user: AuthUser, database: Database): Promise<Source[]> {
  const rows = await database.all<StoredRow>(
    "SELECT id,kind,status,data FROM entities WHERE organization_id=? AND kind IN ('platform:brain_source','knowledge','platform:ingestion_source','platform:ingestion_proposal')",
    [user.organizationId],
  );
  const byId = new Map(rows.map(row => [row.id, row]));
  const sources: Source[] = [];
  for (const row of rows) {
    if (row.kind === 'platform:brain_source') {
      const wrapper = stored(row), data = dataOf(row);
      if (row.status !== 'approved' || !data || !Number.isSafeInteger(wrapper?.revision) ||
          typeof data.approvedAt !== 'string' || data.revokedAt || !text(data.title, 200).trim() || !text(data.content, 50000).trim()) continue;
      sources.push({ sourceId: row.id, sourceKind: 'brain_source', sourceRevision: Number(wrapper!.revision),
        title: text(data.title, 200), sourceLabel: text(data.sourceLabel, 300), content: text(data.content, 50000), bindings: [binding(row)] });
      continue;
    }
    if (row.kind !== 'knowledge' || row.status !== null || !row.id.startsWith('ingestion-knowledge:')) continue;
    const data = stored(row);
    if (!data || typeof data.sourceArtifactId !== 'string' || typeof data.proposalId !== 'string' || typeof data.candidateId !== 'string' ||
        typeof data.sourceDigest !== 'string' || typeof data.sourceQuote !== 'string' || !data.sourceQuote.trim()) continue;
    const origin = byId.get(data.sourceArtifactId), proposal = byId.get(data.proposalId);
    if (!origin || !proposal || origin.kind !== 'platform:ingestion_source' || proposal.kind !== 'platform:ingestion_proposal' ||
        origin.status !== 'ready' || !['completed', 'partially_applied'].includes(String(proposal.status))) continue;
    const originData = dataOf(origin), proposalData = dataOf(proposal), originWrapper = stored(origin);
    if (!originData || !proposalData || originData.digest !== data.sourceDigest || proposalData.sourceDigest !== data.sourceDigest ||
        proposalData.sourceId !== origin.id || !Number.isSafeInteger(originWrapper?.revision)) continue;
    const candidate = Array.isArray(proposalData.candidates) ? proposalData.candidates.find((item: unknown) =>
      item && typeof item === 'object' && (item as Record<string, unknown>).id === data.candidateId) as Record<string, unknown> | undefined : undefined;
    if (!candidate || candidate.status !== 'applied' || candidate.appliedKnowledgeId !== row.id ||
        !['offer', 'company_fact', 'faq'].includes(String(candidate.type)) || candidate.quote !== data.sourceQuote ||
        candidate.content !== data.content || candidate.title !== data.title) continue;
    const ref = candidate.sourceRef as Record<string, unknown> | undefined;
    const sourceText = text(originData.text, 240000);
    if (!ref || !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end) || Number(ref.start) < 0 || Number(ref.end) > sourceText.length ||
        sourceText.slice(Number(ref.start), Number(ref.end)) !== data.sourceQuote) continue;
    sources.push({ sourceId: row.id, sourceKind: 'reviewed_ingestion', sourceRevision: Number(originWrapper!.revision),
      title: text(data.title, 200), sourceLabel: `Reviewed ingestion: ${text(originData.title, 200)}`, content: text(data.sourceQuote, 600),
      approvedSummary: text(data.content, 5000), bindings: [binding(row), binding(origin), binding(proposal)] });
  }
  return sources;
}

const WINDOW = 850;
const OVERLAP = 100;
export function chunksFromSources(sources: Source[]): BrainChunk[] {
  const chunks: BrainChunk[] = [];
  for (const source of sources) {
    for (let start = 0; start < source.content.length && chunks.length < 5000;) {
      const end = Math.min(source.content.length, start + WINDOW);
      const piece = source.content.slice(start, end);
      chunks.push({ id: `chunk:${sha(JSON.stringify([source.sourceId, source.sourceRevision, start, end, piece])).slice(0, 24)}`,
        sourceId: source.sourceId, sourceKind: source.sourceKind, sourceRevision: source.sourceRevision,
        title: source.title, sourceLabel: source.sourceLabel, text: piece,
        ...(source.approvedSummary ? { approvedSummary: source.approvedSummary } : {}), start, end, bindings: source.bindings });
      if (end === source.content.length) break;
      start = end - OVERLAP;
    }
  }
  return chunks;
}

const STOP = new Set(['a','an','and','are','as','at','be','by','can','company','do','does','for','from','how','i','in','is','it','me','my','of','on','or','our','the','their','there','to','us','we','what','when','where','which','who','why','with','you','your','hai','hain','ka','ki','ke','kya','aur','mein','me','se','ye','wo']);
export function recallTokens(input: string): string[] {
  const words = String(input || '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(words.filter(word => word.length >= 2 && !STOP.has(word)))].slice(0, 12);
}

/** Adapted from html-portfolio main api/memory.js:rrfFuse (RRF_K=60), keyed by scoped chunk ID. */
export function rrfFuse<T extends { id: string }>(legs: Array<{ rows: T[] }>, slots = 8): T[] {
  const score = new Map<string, number>();
  const rows = new Map<string, T>();
  for (const leg of legs) leg.rows.forEach((row, index) => {
    score.set(row.id, (score.get(row.id) || 0) + 1 / (60 + index + 1));
    if (!rows.has(row.id)) rows.set(row.id, row);
  });
  return [...score.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, slots).map(([id]) => rows.get(id)!);
}

function hits(haystack: string, tokens: string[]): number {
  const words = new Set((haystack.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
  return tokens.reduce((n, token) => n + (words.has(token) ? 1 : 0), 0);
}
export function retrieveChunks(question: string, chunks: BrainChunk[], slots = 8): BrainChunk[] {
  const tokens = recallTokens(question);
  if (!tokens.length) return [];
  const rank = (field: (chunk: BrainChunk) => string) => chunks
    .map(chunk => ({ chunk, n: hits(field(chunk), tokens) }))
    .filter(item => item.n > 0)
    .sort((a,b) => b.n - a.n || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, 24).map(item => item.chunk);
  return rrfFuse([{ rows: rank(chunk => chunk.title) }, { rows: rank(chunk => `${chunk.text} ${chunk.approvedSummary || ''}`) }], slots);
}

export async function currentBindings(user: AuthUser, database: Database, bindings: SourceBinding[]): Promise<Array<{ binding: SourceBinding; raw: string }>> {
  const checked: Array<{ binding: SourceBinding; raw: string }> = [];
  for (const anchor of bindings) {
    const [row] = await database.all<StoredRow>('SELECT id,kind,status,data FROM entities WHERE id=? AND organization_id=? AND kind=?',
      [anchor.id, user.organizationId, anchor.kind]);
    if (!row || row.status !== anchor.status || sha(row.data) !== anchor.dataHash) throw new HttpError(409, 'A cited source changed or was revoked. Ask again with current knowledge.');
    checked.push({ binding: anchor, raw: row.data });
  }
  return checked;
}
