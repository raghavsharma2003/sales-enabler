// Per-row overrides: a list may carry a `voice` and a `first_message` per person. Both stay inside the agent's rules.
//   voice          must be a voice the agent's stack offers (checked again at dial time against that agent's stack).
//   first_message  replaces only opening.usefulFirst: what she opens with after the brand and the AI clause. It passes the
//                  same lints as the agent's own opening (the recitable-line lint and T-L1/T-L6/T-L7), so it is a note about
//                  what to lead with, never a script and never a way round the disclosure. opening.disclosureClause is not
//                  touched, and the runtime still prefixes the fixed AI line when her first turn does not say it (RD1).
// rowOverrides() is the one function the ticket builder calls (campaigns), so the import and the dial apply one rule.
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { COMPONENTS, getComponent } from '../../../shared/components.ts';
import { lintAgentConfig } from '../../../shared/safety/index.ts';
import { stackOf } from '../../../shared/stacks.ts';
// The agents module's recitable-line lint, imported by name so the opening rule has one source (a pure function).
import { shapeLint } from '../agents/lint.ts';

export const OVERRIDE_KEYS = ['voice', 'first_message'] as const;
export type OverrideKey = (typeof OVERRIDE_KEYS)[number];
const FIRST_MESSAGE_MAX = 300;

export type Check = { ok: true; value: string } | { ok: false; why: string };

const ALL_VOICES = new Set(COMPONENTS.flatMap(c => c.voices ?? []));

/** Import-time: a voice any VP voice part offers (the agent's own stack is checked at dial time). */
export function checkVoice(raw: string): Check {
  const v = raw.trim();
  if (!v) return { ok: false, why: 'empty' };
  const exact = [...ALL_VOICES].find(x => x.toLowerCase() === v.toLowerCase());
  return exact ? { ok: true, value: exact } : { ok: false, why: `"${v.slice(0, 40)}" is not a voice Vyakti offers` };
}

/** Findings of the agent's own opening lints on a first_message, as if it were opening.usefulFirst. */
function openingFindings(cfg: AgentConfig): string[] {
  const path = 'opening.usefulFirst';
  return [
    ...shapeLint(cfg).filter(f => f.path === path).map(f => f.message),
    ...lintAgentConfig(cfg).filter(f => f.path === path && f.effect === 'refuse').map(f => f.message),
  ];
}

const PROBE = (usefulFirst: string): AgentConfig => ({
  jobDescription: '', persona: { notes: [] }, goals: [], objections: [], facts: [], neverSay: [],
  opening: { disclosureClause: 'that she is an AI assistant', usefulFirst },
} as unknown as AgentConfig);

/** Import-time: a first_message the agent's opening rules accept. */
export function checkFirstMessage(raw: string): Check {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (!v) return { ok: false, why: 'empty' };
  if (v.length > FIRST_MESSAGE_MAX) return { ok: false, why: `longer than ${FIRST_MESSAGE_MAX} characters` };
  const found = openingFindings(PROBE(v));
  return found.length ? { ok: false, why: found[0] } : { ok: true, value: v };
}

export interface Applied { agent: AgentConfig; applied: OverrideKey[]; refused: { key: OverrideKey; why: string }[] }

/** Dial-time: the agent for this person, with the row's voice and first_message applied when the agent's rules allow.
 *  Never changes anything else; the disclosure clause and every other field are the agent's own. */
export function rowOverrides(agent: AgentConfig, attrs: Record<string, unknown>): Applied {
  let out: AgentConfig = agent;
  const applied: OverrideKey[] = [], refused: Applied['refused'] = [];
  const voice = typeof attrs.voice === 'string' ? attrs.voice.trim() : '';
  if (voice) {
    const stack = stackOf(agent.voice);
    const speaker = stack ? (stack.components.s2s ? getComponent('s2s', stack.components.s2s) : stack.components.voice ? getComponent('voice', stack.components.voice) : undefined) : undefined;
    const match = speaker?.voices?.find(x => x.toLowerCase() === voice.toLowerCase());
    if (match) { out = { ...out, voice: { ...out.voice, voiceId: match } }; applied.push('voice'); }
    else refused.push({ key: 'voice', why: `not a voice of ${speaker?.label ?? 'this agent\'s stack'}` });
  }
  const fm = typeof attrs.first_message === 'string' ? attrs.first_message.trim().replace(/\s+/g, ' ') : '';
  if (fm) {
    const next: AgentConfig = { ...out, opening: { ...out.opening, usefulFirst: fm } };
    const found = fm.length > FIRST_MESSAGE_MAX ? [`longer than ${FIRST_MESSAGE_MAX} characters`] : openingFindings(next);
    if (found.length) refused.push({ key: 'first_message', why: found[0] });
    else { out = next; applied.push('first_message'); }
  }
  // Belt and braces: whatever was applied, the disclosure clause is the agent's own.
  if (out.opening.disclosureClause !== agent.opening.disclosureClause) throw new Error('row overrides must never change the disclosure clause');
  return { agent: out, applied, refused };
}
