// The hard safety guard on every draft write. A lint finding at the hard level is never saved, even as a draft: the
// Operator bench (rejected.2026-10-23.brief-edit-saves-lint-refused-draft) saw brief.edit save "say she is a human" and
// report it done. Hard means: denying being an AI or hiding it, weakening the disclosure, switching off the crisis lines,
// manipulation. Softer findings (links, offer facts, shape wording) still save and come back as lint to fix.
// shared/safety's lint decides all of it (rules.json lint T-L1 AI honesty, T-L6 crisis lines, T-L7 manipulation; both doors).
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { lintAgentConfig } from '../../../shared/safety/index.ts';
import { ValidationError } from '../../../shared/validate.ts';

export type HardRule = 'ai_honesty' | 'disclosure' | 'crisis_lines' | 'manipulation';
export interface HardFinding { rule: HardRule; path: string; text: string }

export const HARD_RULES: Record<HardRule, { rule: string; fix: string }> = {
  ai_honesty: { rule: 'she never claims to be human, and never denies or hides being an AI',
    fix: 'remove that instruction; she says once, lightly, that she is an AI assistant, and answers honestly whenever asked' },
  disclosure: { rule: 'her opening must say she is an AI assistant',
    fix: "keep the disclosure clause saying she is the business's AI assistant, mentioned in passing" },
  crisis_lines: { rule: 'the crisis lines always stay: anyone in danger hears Tele-MANAS 14416 and 112',
    fix: 'remove that instruction; the crisis lines are built in and cannot be switched off' },
  manipulation: { rule: 'no manipulation: no false urgency, fear, guilt, threats or pressure',
    fix: 'give the honest reason to act from the facts rows instead, or remove it' },
};


function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, path ? `${path}.${k}` : k, out);
  return out;
}

/** Hard findings on a config: T-L1 from the shared safety lint, plus crisis-line and manipulation instructions. */
export function hardFindings(c: AgentConfig): HardFinding[] {
  const at = new Map(strings(c, ''));
  const out: HardFinding[] = [];
  for (const f of lintAgentConfig(c)) {
    if (f.effect !== 'refuse') continue;
    const rule: HardRule | null = f.rule === 'T-L1' ? (f.path === 'opening.disclosureClause' && /must say she is an AI/.test(f.message) ? 'disclosure' : 'ai_honesty')
      : f.rule === 'T-L6' ? 'crisis_lines' : f.rule === 'T-L7' ? 'manipulation' : null;
    if (rule) out.push({ rule, path: f.path, text: at.get(f.path) ?? '' });
  }
  return out;
}

const key = (f: HardFinding) => `${f.rule}|${f.path}|${f.text}`;

/** The plain-English refusal: which rule, where, and how to fix it. Nothing has been saved when this is thrown. */
export function refusalText(f: HardFinding): string {
  const r = HARD_RULES[f.rule];
  return `refused, nothing was saved: ${r.rule}. ${f.path}${f.text ? ` ("${f.text.slice(0, 80)}")` : ''} breaks it; to fix: ${r.fix}`;
}

/** Throw if `next` carries a hard finding that `prev` did not (a legacy draft can still take unrelated edits). */
export function guardDraft(prev: AgentConfig | null, next: AgentConfig): void {
  const before = new Set(prev ? hardFindings(prev).map(key) : []);
  const added = hardFindings(next).filter(f => !before.has(key(f)));
  if (added.length) throw new ValidationError(added[0].path, refusalText(added[0]) + (added.length > 1 ? ` (and ${added.length - 1} more)` : ''));
}
