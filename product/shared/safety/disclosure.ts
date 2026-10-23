// The speakable AI disclosure (disclosure.json): what the runtime's RD1 first-breath fallback says when her first sentence
// does not already say she is an AI. agent.opening.disclosureClause is guidance for the brief compiler and is never
// spoken. The Python runtime reads the same file (product/voice/vpvoice/safety.py disclosure_line).
import data from './disclosure.json' with { type: 'json' };
import { expandLexicon, normalise, replyDoor, type DoorContext } from './index.ts';

interface Disclosure { fallback: string; lines: Record<string, { brand: string; nobrand: string }> }
export const DISCLOSURE = data as unknown as Disclosure & { version: string };

export function disclosureLine(brand = '', language?: string | null): string {
  const l = DISCLOSURE.lines[language ?? ''] ?? DISCLOSURE.lines[DISCLOSURE.fallback];
  const b = brand.trim();
  return b ? l.brand.replace('{brand}', b) : l.nobrand;
}

const NEUTRAL = { category: 'service', sectorPacks: ['base'], brand: { name: '', verifiedDomains: [] }, facts: [], neverSay: [],
  disclosed: true, identityVerified: true, recordingRefused: false, crisis: false, turnIndex: 1 } as unknown as DoorContext;
let affirmRe: RegExp | null = null;

/** A disclosure is a first-person affirmation that she is an AI: the text carries lexicon.ai_affirm (or the agent's own
 *  disclosure clause, verbatim) and no RD2 rule fires on it. A mention or a denial never counts (Python affirms_ai). */
export function affirmsAi(text: string, clause = ''): boolean {
  const t = normalise(text ?? '');
  if (!t) return false;
  if (replyDoor(text, NEUTRAL, new Set(['RD2'])).action !== 'pass') return false;
  const c = normalise(clause ?? '');
  affirmRe ??= new RegExp(expandLexicon('@ai_affirm'), 'iu');
  return Boolean((c && t.includes(c)) || affirmRe.test(t));
}

/** RD1 decides on the whole opening turn, not its first sentence: the fixed line is prefixed only when no sentence of
 *  the opening affirms she is an AI (rejected.2026-10-23.rd1-first-sentence-window-double-disclosure). The joined
 *  opening is judged too, with an ellipsis that ends a sentence read as the pause it is; a full stop, question or
 *  exclamation still ends the clause. Vectors: disclosure.json opening_vectors (Python safety.opening_discloses). */
export function openingDiscloses(sentences: string[], clause = ''): boolean {
  const s = sentences.map(x => x.trim()).filter(Boolean);
  const joined = s.map(x => x.replace(/(\.{2,}|…)$/u, ',')).join(' ');
  return s.some(x => affirmsAi(x, clause)) || affirmsAi(joined, clause);
}
