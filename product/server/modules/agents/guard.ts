// The hard safety guard on every draft write. A lint finding at the hard level is never saved, even as a draft: the
// Operator bench (rejected.2026-10-23.brief-edit-saves-lint-refused-draft) saw brief.edit save "say she is a human" and
// report it done. Hard means: denying being an AI or hiding it, weakening the disclosure, switching off the crisis lines,
// manipulation. Softer findings (links, offer facts, shape wording) still save and come back as lint to fix.
// shared/safety's T-L1 decides the AI rules; crisis lines and manipulation are checked here until the safety lint covers them.
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

const CRISIS = /\b(never|don'?t|do not|must not|should not|avoid|skip|no need to|without|stop)\b[^.?!]{0,40}\b(helpline|help line|crisis (line|number)s?|tele-?manas|14416|112|emergency (line|number)s?|suicide)\b|\b(remove|drop|delete|disable|turn off|switch off|leave out)\b[^.?!]{0,25}\b(helpline|crisis|tele-?manas|14416|112|emergency (line|number))|\b(helpline|tele-?manas|14416|112)\b[^.?!]{0,20}\b(mat|nahi|na)\b[^.?!]{0,12}\b(batana|batao|bolna|bolo|dena|do)\b/i;
const MANIPULATION = /\b(create|use|add|build|invent|fake|manufacture)\b[^.?!]{0,15}\b(false |fake |artificial )?(urgency|scarcity|fear|panic|guilt|pressure)\b|\b(scare|frighten|threaten|intimidate|guilt[- ]trip|shame|harass|pressuri[sz]e|pressure|bully)\b[^.?!]{0,12}\b(them|the caller|callers|customers?|people|him|her|into)\b|\b(fake|false|made[- ]up|invented)\b[^.?!]{0,12}\b(deadline|expiry|last chance|limited[- ]time)|\b(don'?t|never|do not)\b[^.?!]{0,10}\b(take|accept)\b[^.?!]{0,6}\bno\b|\b(keep|continue)\b[^.?!]{0,15}\b(pushing|pitching|insisting)\b[^.?!]{0,30}\b(even if|after|until)\b|\b(darao|dara do|dhamki|dhamkao|sharminda karo)\b/i;
// "never pressure them", "no false urgency" describe the rule, not a breach of it.
const NEGATED = /\b(never|no|not|don'?t|do not|without|avoid|mat|nahi)\b[^.?!]{0,20}$/i;

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
    if (f.rule !== 'T-L1' || f.effect !== 'refuse') continue;
    out.push({ rule: f.path === 'opening.disclosureClause' && /must say she is an AI/.test(f.message) ? 'disclosure' : 'ai_honesty', path: f.path, text: at.get(f.path) ?? '' });
  }
  for (const [path, s] of at) {
    if (path === 'agentId' || path === 'versionHash' || path.startsWith('voice.') || path.startsWith('brand.verifiedDomains')) continue;
    if (CRISIS.test(s)) out.push({ rule: 'crisis_lines', path, text: s });
    const m = MANIPULATION.exec(s);
    if (m && !NEGATED.test(s.slice(0, m.index))) out.push({ rule: 'manipulation', path, text: s });
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
