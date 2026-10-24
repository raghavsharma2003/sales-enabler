// The product's language model (integrator task, 2026-10-24): which languages an agent speaks, whether its voice stack
// can hear and speak them, and which agent version serves a contact who prefers a given language. Pure, so campaigns
// (routing at claim, the launch warning) and agents (validation, variants) share one rule.
import { LANGUAGES, type AgentConfig, type Language } from '../../../shared/agent-config.ts';
import { partWord, stackLanguage, stackOf, type PartLanguage, type VoiceStack } from '../../../shared/stacks.ts';

export const LANGUAGE_NAMES: Record<Language, string> = {
  'hi-IN': 'Hindi', 'en-IN': 'English', hinglish: 'Hinglish', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi', 'gu-IN': 'Gujarati', 'bn-IN': 'Bengali', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};
const BY_WORD: Record<string, Language> = {
  hindi: 'hi-IN', english: 'en-IN', hinglish: 'hinglish', tamil: 'ta-IN', telugu: 'te-IN', kannada: 'kn-IN', malayalam: 'ml-IN', marathi: 'mr-IN',
  gujarati: 'gu-IN', bengali: 'bn-IN', bangla: 'bn-IN', punjabi: 'pa-IN', odia: 'or-IN', oriya: 'or-IN',
};

/** A contact's stated language as a VP language: 'kn', 'kn-IN', 'Kannada' -> kn-IN; anything else -> null. */
export function toLanguage(v: string | null | undefined): Language | null {
  const t = (v ?? '').trim().toLowerCase();
  if (!t) return null;
  if (BY_WORD[t]) return BY_WORD[t];
  const m = /^([a-z]{2})(?:[-_][a-z]{2})?$/.exec(t);
  return m ? (LANGUAGES as readonly string[]).find(l => l.startsWith(m[1] + '-')) as Language | undefined ?? null : null;
}

export const languageName = (l: Language) => LANGUAGE_NAMES[l];

/** The languages an agent speaks: its primary, plus the others it may switch to. */
export function agentLanguages(a: Pick<AgentConfig, 'languages'>): Language[] {
  return [...new Set([a.languages.primary, ...(a.languages.allowed ?? [])])];
}

/** Hindi and Hinglish speakers are served by either; an English speaker by English or Hinglish. */
const SERVED_BY: Partial<Record<Language, Language[]>> = { 'hi-IN': ['hi-IN', 'hinglish'], hinglish: ['hinglish', 'hi-IN'], 'en-IN': ['en-IN', 'hinglish'] };
export function serves(a: Pick<AgentConfig, 'languages'>, want: Language): boolean {
  const speaks = new Set(agentLanguages(a));
  return (SERVED_BY[want] ?? [want]).some(l => speaks.has(l));
}

export interface LanguageProblem { language: Language; stack: string; missing: PartLanguage[]; message: string }

/** Every agent language its voice stack cannot hear, understand or speak, named with the stack and the part. */
export function languageProblems(a: Pick<AgentConfig, 'languages' | 'voice'>, stack: VoiceStack | undefined = stackOf(a.voice)): LanguageProblem[] {
  if (!stack) return [];
  return agentLanguages(a).flatMap(l => {
    const s = stackLanguage(stack, l);
    if (s.ok) return [];
    const parts = s.missing.map(m => `its ${partWord(m.part)} (${m.label})`).join(' and ');
    return [{ language: l, stack: stack.label, missing: s.missing,
      message: `${languageName(l)} is not supported by the voice stack ${stack.label}: ${parts} does not support ${languageName(l)}. Choose a stack that supports ${languageName(l)}, or remove ${languageName(l)} from the agent's languages.` }];
  });
}

export interface RouteChoice<V> { version: V; servedBy: 'main' | 'variant' | 'fallback' | 'unknown_language'; language: Language | null; reason?: string }

/** Which version a contact meets, by the language they prefer: the main version if it speaks it, else the first
 *  variant (or routed version) that does, else the main version with the reason recorded. */
export function routeContact<V extends { agent: Pick<AgentConfig, 'languages'> }>(contactLanguage: string | null | undefined, main: V, others: V[]): RouteChoice<V> {
  const want = toLanguage(contactLanguage);
  if (!want) return { version: main, servedBy: 'unknown_language', language: null };
  if (serves(main.agent, want)) return { version: main, servedBy: 'main', language: want };
  const v = others.find(o => serves(o.agent, want));
  if (v) return { version: v, servedBy: 'variant', language: want };
  return { version: main, servedBy: 'fallback', language: want, reason: `no version of this agent speaks ${languageName(want)}; called in ${languageName(main.agent.languages.primary)}` };
}
