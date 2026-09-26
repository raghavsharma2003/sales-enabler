import type { IngestionCandidate, IngestionSource } from './contracts';

/** Conservative warning for structured personal or CRM records, not generic support addresses. */
export function possibleCustomerRecord(candidate: Pick<IngestionCandidate, 'quote' | 'title' | 'sourceRef'>, source: Pick<IngestionSource, 'text'>): boolean {
  const lineStart = source.text.lastIndexOf('\n', Math.max(0, candidate.sourceRef.start - 1)) + 1;
  const nextLine = source.text.indexOf('\n', candidate.sourceRef.end);
  const lineEnd = nextLine < 0 ? source.text.length : nextLine;
  const evidence = source.text.slice(lineStart, Math.min(lineEnd, lineStart + 1_200));
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(evidence);
  const hasPhone = /\b(?:phone|mobile|whats?app|telephone|tel)\s*[:=]\s*\+?[\d\s().-]{7,}/i.test(evidence);
  if (!hasEmail && !hasPhone) return false;
  const labeledName = evidence.match(/(?:^|[\n;,|])\s*(?:full\s+name|customer\s+name|student\s+name|lead\s+name|contact\s+name|name)\s*[:=]\s*([^;,|\n]{2,80})/i)?.[1]?.trim() || '';
  const organizationalName = /\b(?:pvt|private|ltd|limited|llp|inc|corp|corporation|company|services|support|team|office|department)\b/i.test(labeledName);
  if (labeledName && !organizationalName) return true;
  const priorLineStart = source.text.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1;
  const header = source.text.slice(priorLineStart, Math.max(priorLineStart, lineStart - 1));
  if (/^\s*(?:full_?name|name)\s*[,|\t]\s*(?:email|phone|mobile|stage)\b/i.test(header) && /\b(?:new enquiry|lead|student|customer|applicant|prospect)\b/i.test(evidence)) return true;
  return /\b(?:customer|student|lead|applicant|prospect)\s+(?:record|profile|name|id)\s*[:=]/i.test(evidence) && /\b(?:name|email|phone|mobile|stage)\s*[:=]/i.test(evidence);
}
