// Objection handling from recurring insight themes. Pure, so each rule is testable without a model:
//   recurring      an objection theme grounded by calls' insight (2+ verified caller quotes) heard on at least 3 calls and
//                  5% of the calls sampled
//   answeredBy     an existing objection note whose trigger already names it (most of the theme's content words); the
//                  model is asked only when no note does, and may still answer "covered by note N"
//   copiedQuote    a learned note may not reuse the caller's own words (4 consecutive words, or 12+ characters): a note
//                  is a shape about behaviour, and caller words in a brief get recited back at the next caller
//   appendOnly     an objection proposal adds exactly one note and leaves every existing note as the business wrote it
import { canonicalJson } from '../../../shared/approval.ts';
import type { AgentConfig } from '../../../shared/agent-config.ts';
import type { ChangeOp } from './gates.ts';

export const RECURRING = { minCalls: 3, minShare: 0.05, minQuotedCalls: 2 };

export interface ThemeLike { kind: string; title: string; count: number; quotedCalls: number; of: number }
export const isRecurringObjection = (t: ThemeLike) =>
  t.kind === 'objection' && t.quotedCalls >= RECURRING.minQuotedCalls && t.count >= RECURRING.minCalls && t.of > 0 && t.count / t.of >= RECURRING.minShare;

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'for', 'and', 'or', 'it', 'its', 'too', 'very', 'they', 'them',
  'their', 'this', 'that', 'with', 'on', 'in', 'at', 'by', 'as', 'not', 'no', 'do', 'does', 'did', 'say', 'says', 'said', 'when', 'about', 'from', 'than',
  'then', 'feel', 'feels', 'felt', 'so', 'just', 'now', 'right', 'people', 'caller', 'callers', 'customer', 'customers', 'person', 'want', 'wants']);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');
export function contentWords(s: string): string[] {
  return [...new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOP.has(w)).map(stem))];
}

/** The index of an existing objection note whose trigger already names this objection (at least half its content words,
 *  and at least one), else null. */
export function answeredBy(title: string, objections: AgentConfig['objections']): number | null {
  const want = contentWords(title);
  if (!want.length) return null;
  for (const [i, o] of objections.entries()) {
    const have = new Set(contentWords(o.trigger));
    const hit = want.filter(w => have.has(w)).length;
    if (hit >= 1 && hit >= Math.ceil(want.length / 2)) return i;
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/** The first caller quote whose words a note reuses, else null. */
export function copiedQuote(note: string, quotes: string[]): string | null {
  const n = ` ${norm(note)} `;
  for (const q of quotes) {
    const words = norm(q).split(' ').filter(Boolean);
    if (norm(q).length >= 12 && n.includes(` ${norm(q)} `)) return q;
    for (let i = 0; i + 4 <= words.length; i++) if (n.includes(` ${words.slice(i, i + 4).join(' ')} `)) return q;
  }
  return null;
}

/** null when the ops add exactly one {trigger, approach} note after the existing ones, unchanged; else why not. */
export function appendOnly(base: AgentConfig, ops: ChangeOp[]): string | null {
  const why = 'an objection proposal adds one note and leaves the existing notes as the business wrote them';
  if (ops.length !== 1 || ops[0]!.op !== 'set' || ops[0]!.path !== 'objections' || !Array.isArray(ops[0]!.value)) return why;
  const v = ops[0]!.value as unknown[];
  if (v.length !== base.objections.length + 1) return why;
  return canonicalJson(v.slice(0, base.objections.length)) === canonicalJson(base.objections) ? null : why;
}
