// The voice stacks a user can choose for an agent: the round-2 curated stacks from the voice lab
// (voicelab/server/catalog.py), plus the owner's pick and the all-Indian stack, or a stack the user builds part by part
// from shared/components.ts (directive.2026-10-22.full-stack-selection). New agents start on DEFAULT_STACK_ID, a
// provisional default (decision.2026-10-22.default-stack) the user can change; the runtime never substitutes one.
// Measured figures carry their grade and source so the picker never shows an unlabelled number.

import { getComponent, type Component, type Part } from './components.ts';
import { LANGUAGES, type Language } from './agent-config.ts';
import { MEASURES } from './stack-gate.ts';

export type Grade = 'measured' | 'computed' | 'vendor' | 'not_measured';

export interface Figure {
  value: string;      // human-readable, e.g. '0.70 s' or '~1.2 s'
  grade: Grade;
  source: string;     // where the number came from
}

export interface StackComponents {
  ears?: string;      // speech-to-text id (catalog STT key)
  brain?: string;     // LLM id (catalog BRAINS key)
  voice?: string;     // text-to-speech id (catalog TTS key)
  s2s?: string;       // speech-to-speech engine id, when the stack is not a cascade
  gatedEars?: boolean;
}

export interface VoiceStack {
  id: string;
  label: string;
  kind: 'cascade' | 's2s';
  components: StackComponents;
  brief: 'v2';
  replyGap: Figure;        // time from caller finishing to her first audio
  note: string;            // the honest one-liner a user sees
  requires?: string[];     // provider credentials this stack needs at runtime
  /** 'beta' stacks run test calls only: the dial gate refuses them for any call to a real person until their risks
   *  are cleared and the stack is marked available. */
  status: 'available' | 'beta';
  risks?: string[];        // known dependency risks (shutdowns, quota)
}

// Provenance for engineers: voicelab/server/catalog.py round-2 presets, India VM, 2026-10-20. The strings below are
// shown to people as they are, so they stay in plain words (decision.2026-10-21.no-developer-text-in-ui).
// Text-start times: the 2026-10-20 lab presets. Whole gaps taken with the earlier speech recognition: measure.2026-10-20.round2-smoke.
const UNTIMED = (textStarts: string, earlier: string) => `Not measured with these parts yet. In our voice lab (a server in India, 20 Oct 2026) `
  + `the reply text started after about ${textStarts}; with the earlier speech recognition the whole gap was ${earlier}.`;
// Product runtime (not the lab): measure.2026-10-23.product-reply-gap-* (private staging on the India VM, research/2026-10-23/staging).
const PRODUCT = (replies: number, calls: number, p90: string) => `Measured on our own voice engine from a server in India on 23 Oct 2026: `
  + `the median of ${replies} replies over ${calls} test calls, from the caller finishing to her first audio; 9 in 10 replies came within ${p90}. `
  + `Not yet timed on a phone line.`;

// The reply gap a stack card shows comes from the same measurements the gate reads (stack-measures.json), so the two
// can never disagree; a stack with no entry keeps its written figure.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function measuredGap(id: string, written: Figure): Figure {
  const m = MEASURES[id]?.replyGapP50Ms;
  if (!m) return written;
  const [y, mo, d] = m.date.split('-').map(Number);
  return { value: `${(m.value / 1000).toFixed(1)} s`, grade: 'measured',
    source: `Measured on our own voice engine from a server in India on ${d} ${MONTHS[mo - 1]} ${y}: the median of ${m.n} replies` +
      (m.calls ? ` over ${m.calls} test calls` : '') + `, from the caller finishing to her first audio` +
      (m.p90Ms ? `; 9 in 10 replies came within ${(m.p90Ms / 1000).toFixed(1)} s` : '') + '. Not yet timed on a phone line.' };
}

const WRITTEN: readonly VoiceStack[] = [
  {
    id: 'v2-live', label: 'Gemini 3.8 Live (speech-to-speech)', kind: 's2s', brief: 'v2',
    components: { s2s: 'gemini-3.8-live' },
    replyGap: { value: 'not measured', grade: 'not_measured',
      source: 'Not measured yet. She now waits until every sentence of a reply has passed the safety check, and the lab figure of 0.8 to 1.6 s was taken before that.' },
    note: 'The best-judged model family. She speaks only after the whole reply is written and checked. In the lab she talked over callers on about 40% of turns.',
    requires: ['GEMINI'], status: 'beta',
    risks: ['Must pass the full safety attack test before calls to real people', 'Reply gap not measured since the safety check was added'],
  },
  {
    id: 'v2-flashlite', label: 'Azure speech recognition + Gemini 3.5 Flash-Lite + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '2.5 s', grade: 'measured', source: PRODUCT(21, 4, '2.7 s') },
    note: 'The fastest of the well-judged models in our tests.', requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
    risks: ['Google’s voice price doubles on 1 Jan 2027'],
  },
  {
    id: 'v2-54mini', label: 'Azure speech recognition + GPT-5.4 mini + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gpt-5.4-mini', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '3.0 s', grade: 'measured', source: PRODUCT(23, 4, '3.6 s') },
    note: 'OpenAI’s fast model.', requires: ['GEMINI', 'AZURE_SPEECH', 'AZURE_OPENAI'], status: 'available',
  },
  {
    id: 'v2-38flash', label: 'Azure speech recognition + Gemini 3.8 Flash + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gemini-3.8-flash', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: 'not measured', grade: 'not_measured', source: 'Not measured on our own voice engine: on 23 Oct 2026 its model did not answer on our Google Cloud route (8 of 8 test calls failed). Our voice lab measured 2.6 to 2.7 s on 2 replies on 22 Oct.' },
    note: 'The best-judged model, but slow to answer from India.', requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
    risks: ['Its model did not answer on our Google Cloud route on 23 Oct 2026 (8 of 8 test calls failed); not yet re-checked'],
  },
  {
    id: 'v2-mai', label: 'Azure speech recognition + Gemini 3.5 Flash-Lite + Azure MAI-Voice (emotion styles)', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'azure-mai', gatedEars: true },
    replyGap: { value: '2.2 s', grade: 'measured', source: PRODUCT(24, 5, '2.7 s') },
    note: 'The fastest voice to start, with an emotion style for each reply. Its price has not been checked against a real bill yet.',
    requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
  },
  {
    id: 'v2-luna', label: 'Azure speech recognition + GPT-6 Luna + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gpt-6-luna@or', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: 'not measured', grade: 'not_measured', source: UNTIMED('1.4 s', '1.9 to 3.3 s') },
    note: 'Judged last of these in our written tests; not yet tried on a call.', requires: ['GEMINI', 'AZURE_SPEECH', 'OPENROUTER'], status: 'available',
  },
  {
    id: 'sarvam-india', label: 'All-Sarvam: Saaras + Sarvam-105B + Bulbul (Indian stack)', kind: 'cascade', brief: 'v2',
    components: { ears: 'sarvam', brain: 'sarvam-105b', voice: 'sarvam', gatedEars: true },
    replyGap: { value: '0.97 to 1.18 s on Sarvam’s servers', grade: 'measured', source: 'Measured on 9 replies in an earlier test, on Sarvam’s servers, before the phone line.' },
    note: 'Runs in India end to end. Sarvam may train on your call data unless you opt out with them.', requires: ['SARVAM'], status: 'beta',
  },
];

export const STACKS: readonly VoiceStack[] = WRITTEN.map(s => ({ ...s, replyGap: measuredGap(s.id, s.replyGap) }));

/** Provisional: new agents start here, and the user may change it (decision.2026-10-22.default-stack). */
export const DEFAULT_STACK_ID = 'v2-flashlite';
/** The stack id of a combination the user built part by part; its parts travel in voice.components. */
export const CUSTOM_STACK_ID = 'custom';

export function getStack(id: string): VoiceStack | undefined {
  return STACKS.find(s => s.id === id);
}

/** A curated stack id is valid for an agent only if it is in the catalog. Nothing is ever substituted. */
export function requireStack(id: string | undefined | null): VoiceStack {
  if (!id) throw new StackError('choose a voice stack');
  if (id === CUSTOM_STACK_ID) throw new StackError('a stack you build yourself needs its parts: speech recognition, a language model and a voice, or one speech-to-speech model');
  const s = getStack(id);
  if (!s) throw new StackError(`unknown voice stack "${id}"`);
  return s;
}

/** The stack an agent's voice settings name: a curated one, or one built from its parts. Throws StackError with a plain
 *  sentence for anything that cannot run as asked. A built stack is always beta (test calls only) until it is measured. */
export function resolveStack(voice: { stackId?: string | null; components?: StackComponents | null } | undefined | null): VoiceStack {
  if (voice?.stackId !== CUSTOM_STACK_ID) {
    if (voice?.components) throw new StackError('a curated stack has fixed parts: choose "build your own" to pick them');
    return requireStack(voice?.stackId);
  }
  const c = voice.components;
  if (!c) throw new StackError('a stack you build yourself needs its parts: speech recognition, a language model and a voice, or one speech-to-speech model');
  const need = (part: Part, id: string | undefined): Component => {
    if (!id) throw new StackError(`choose the ${PART_WORD[part]}`);
    const x = getComponent(part, id);
    if (!x) throw new StackError(`"${id}" is not a ${PART_WORD[part]} we offer`);
    return x;
  };
  let parts: Component[]; let components: StackComponents; let kind: VoiceStack['kind'];
  if (c.s2s) {
    if (c.ears || c.brain || c.voice) throw new StackError('a speech-to-speech model hears, thinks and speaks by itself: choose it alone, or choose speech recognition, a language model and a voice');
    parts = [need('s2s', c.s2s)]; components = { s2s: c.s2s }; kind = 's2s';
  } else {
    parts = [need('ears', c.ears), need('brain', c.brain), need('voice', c.voice)];
    components = { ears: c.ears, brain: c.brain, voice: c.voice, gatedEars: c.gatedEars ?? true }; kind = 'cascade';
  }
  return {
    id: CUSTOM_STACK_ID, kind, components, brief: 'v2',
    label: parts.map(p => p.label).join(' + '),
    replyGap: { value: 'not measured', grade: 'not_measured', source: 'A stack you build yourself is measured on its first test calls.' },
    note: 'Built by you from our parts. It runs test calls only until it has been measured.',
    requires: [...new Set(parts.flatMap(p => p.requires))],
    status: 'beta',
    risks: parts.filter(p => p.status === 'beta').map(p => `${p.label} is in beta`),
  };
}

/** resolveStack without the throw, for code that only needs to know whether the settings name a stack. */
export function stackOf(voice: Parameters<typeof resolveStack>[0]): VoiceStack | undefined {
  try { return resolveStack(voice); } catch (e) { if (e instanceof StackError) return undefined; throw e; }
}

const PART_WORD: Record<Part, string> = { ears: 'speech recognition', brain: 'language model', voice: 'voice', s2s: 'speech-to-speech model' };

export class StackError extends Error {
  constructor(message: string) { super(message); this.name = 'StackError'; }
}

/** Canonical identity of the combination that ran, so results are filed under what actually ran. */
export function combinationId(stack: VoiceStack, voiceName?: string): string {
  const c = stack.components;
  const core = stack.kind === 's2s' ? c.s2s : `${c.ears}${c.gatedEars ? '' : '/ungated'}+${c.brain}+${c.voice}`;
  return `${stack.brief}|${core}${voiceName ? '~' + voiceName : ''}`;
}

// ---------------------------------------------------------------- languages (2026-10-24)
// A stack serves a language only if every part does: the ears hear it, the brain understands and writes it, the voice
// speaks it (or one speech-to-speech engine does all three). The grade is the weakest part's: 'measured' only when every
// part ran in that language in our own tests, else 'stated' (the makers say so). Never upgraded by inference.

export type LanguageGrade = 'measured' | 'stated';
export interface PartLanguage { part: Part; id: string; label: string; grade: LanguageGrade | null }
export interface StackLanguage { language: Language; ok: boolean; grade: LanguageGrade | null; parts: PartLanguage[]; missing: PartLanguage[] }

const LANG_PART_WORD: Record<Part, string> = { ears: 'speech recognition', brain: 'language model', voice: 'voice', s2s: 'speech-to-speech engine' };
export const partWord = (p: Part) => LANG_PART_WORD[p];

function partsOf(stack: VoiceStack): { part: Part; id: string }[] {
  const c = stack.components;
  if (stack.kind === 's2s') return [{ part: 's2s', id: c.s2s ?? '' }];
  return [{ part: 'ears', id: c.ears ?? '' }, { part: 'brain', id: c.brain ?? '' }, { part: 'voice', id: c.voice ?? '' }];
}

export function stackLanguage(stack: VoiceStack, language: Language): StackLanguage {
  const parts = partsOf(stack).map(({ part, id }) => {
    const comp = getComponent(part, id);
    const grade: LanguageGrade | null = !comp ? null : comp.languages.measured.includes(language) ? 'measured' : comp.languages.stated.includes(language) ? 'stated' : null;
    return { part, id, label: comp?.label ?? id, grade };
  });
  const missing = parts.filter(p => !p.grade);
  return { language, ok: !missing.length, grade: missing.length ? null : parts.every(p => p.grade === 'measured') ? 'measured' : 'stated', parts, missing };
}

/** Every VP language against this stack: what the picker shows and agent validation checks. */
export function stackLanguages(stack: VoiceStack): StackLanguage[] {
  return LANGUAGES.map(l => stackLanguage(stack, l));
}
