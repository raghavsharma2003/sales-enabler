import { createHash } from 'node:crypto';
import type { LearningCandidate, LearningDestination, LearningType } from './contracts';

export type SavedTurn = { role: 'user' | 'assistant'; text: string; receivedAt?: string };
const types = new Set<LearningType>(['feedback_theme', 'practical_concern', 'explicit_preference', 'correction', 'commitment_request']);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Adapted from Vyakti Room's validateRoomMemoryProposal: bind every proposed claim to a real user-origin source ID and an exact contiguous quote. */
export function validateLearningProposal(output: string | unknown, turns: SavedTurn[], includedTurnIndexes: number[], contactId?: string): { candidates: LearningCandidate[]; notes: string[] } {
  let parsed: unknown;
  try { parsed = typeof output === 'string' ? JSON.parse(output) : output; }
  catch { return { candidates: [], notes: ['The model returned invalid JSON. No evidence was accepted.'] }; }
  const proposed = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).candidates : undefined;
  if (!Array.isArray(proposed)) return { candidates: [], notes: ['The model did not return a candidate list. No evidence was accepted.'] };
  const candidates: LearningCandidate[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const value of proposed.slice(0, 8)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { notes.push('Invalid candidate omitted.'); continue; }
    const item = value as Record<string, unknown>;
    const type = item.type as LearningType;
    const turnIndex = item.turnIndex;
    const quote = item.quote;
    const title = item.title;
    const content = item.content;
    const why = item.why;
    const turn = Number.isSafeInteger(turnIndex) && includedTurnIndexes.includes(turnIndex as number) ? turns[turnIndex as number] : undefined;
    if (!types.has(type) || !turn || turn.role !== 'user' || typeof quote !== 'string' || quote.length < 3 || quote.length > 400 ||
      typeof title !== 'string' || !title.trim() || title.length > 160 || typeof content !== 'string' || !content.trim() || content.length > 1000 ||
      typeof why !== 'string' || !why.trim() || why.length > 500 || !turn.text.includes(quote)) {
      notes.push('Unsupported or ungrounded candidate omitted.'); continue;
    }
    const start = turn.text.indexOf(quote), end = start + quote.length;
    if (turn.text.slice(start, end) !== quote) { notes.push('Source span mismatch omitted.'); continue; }
    const key = `${turnIndex}:${quote}:${type}:${content.trim()}`;
    if (seen.has(key)) { notes.push('Duplicate evidence omitted.'); continue; }
    seen.add(key);
    const destination: LearningDestination = type === 'explicit_preference' || type === 'correction'
      ? contactId ? 'customer_memory_review' : 'feedback_evidence'
      : type === 'commitment_request' ? 'manual_action_review' : 'feedback_evidence';
    candidates.push({ id: `c-${digest(JSON.stringify([type, turnIndex, quote, title, content])).slice(0, 24)}`, type,
      title: title.trim(), content: content.trim(), why: why.trim(), quote, sourceRef: { turnIndex: turnIndex as number, start, end }, destination, status: 'pending' });
  }
  if (proposed.length > 8) notes.push(`${proposed.length - 8} candidates omitted by limit.`);
  return { candidates, notes };
}
