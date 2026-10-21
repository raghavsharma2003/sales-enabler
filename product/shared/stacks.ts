// The voice stacks a user can choose for an agent: the round-2 curated stacks from the voice lab
// (voicelab/server/catalog.py), plus the owner's pick and the all-Indian stack, or a stack the user builds part by part
// from shared/components.ts (directive.2026-10-22.full-stack-selection). New agents start on DEFAULT_STACK_ID, a
// provisional default (decision.2026-10-22.default-stack) the user can change; the runtime never substitutes one.
// Measured figures carry their grade and source so the picker never shows an unlabelled number.

import { getComponent, type Component, type Part } from './components.ts';

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
const LAB = 'Measured in our voice lab from a server in India, 20 Oct 2026. This is how soon the reply text starts; the time until she is heard also includes listening and the voice, and was not measured for this stack.';

export const STACKS: readonly VoiceStack[] = [
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
    id: 'v2-flashlite', label: 'Azure ears + Gemini 3.5 Flash-Lite + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '0.70 s, reply text starts', grade: 'measured', source: LAB },
    note: 'The fastest of the well-judged models in our tests.', requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
    risks: ['Google’s voice price doubles on 1 Jan 2027'],
  },
  {
    id: 'v2-54mini', label: 'Azure ears + GPT-5.4 mini + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gpt-5.4-mini', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '0.96 s, reply text starts', grade: 'measured', source: LAB },
    note: 'OpenAI’s fast model.', requires: ['GEMINI', 'AZURE_SPEECH', 'AZURE_OPENAI'], status: 'available',
  },
  {
    id: 'v2-38flash', label: 'Azure ears + Gemini 3.8 Flash + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gemini-3.8-flash', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '2.0 s, reply text starts', grade: 'measured', source: LAB },
    note: 'The best-judged model, but slow to answer from India.', requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
  },
  {
    id: 'v2-mai', label: 'Azure ears + Gemini 3.5 Flash-Lite + Azure MAI-Voice (emotion styles)', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'azure-mai', gatedEars: true },
    replyGap: { value: '0.43 s, voice starts after the text', grade: 'measured', source: 'Measured in our voice lab from a server in India, 20 Oct 2026. This is how soon the voice starts once the reply text is ready; the whole reply gap was not measured for this stack.' },
    note: 'The fastest voice to start, with an emotion style for each reply. Its price has not been checked against a real bill yet.',
    requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
  },
  {
    id: 'v2-luna', label: 'Azure ears + GPT-6 Luna + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'azure', brain: 'gpt-6-luna@or', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '1.4 s, reply text starts', grade: 'measured', source: LAB },
    note: 'Judged last of these in our written tests; not yet tried on a call.', requires: ['GEMINI', 'AZURE_SPEECH', 'OPENROUTER'], status: 'available',
  },
  {
    id: 'sarvam-india', label: 'All-Sarvam: Saaras + Sarvam-105B + Bulbul (Indian stack)', kind: 'cascade', brief: 'v2',
    components: { ears: 'sarvam', brain: 'sarvam-105b', voice: 'sarvam', gatedEars: true },
    replyGap: { value: '0.97 to 1.18 s on Sarvam’s servers', grade: 'measured', source: 'Measured on 9 replies in an earlier test, on Sarvam’s servers, before the phone line.' },
    note: 'Runs in India end to end. Sarvam may train on your call data unless you opt out with them.', requires: ['SARVAM'], status: 'beta',
  },
];

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
  if (id === CUSTOM_STACK_ID) throw new StackError('a stack you build yourself needs its parts: ears, brain and voice, or one speech-to-speech engine');
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
  if (!c) throw new StackError('a stack you build yourself needs its parts: ears, brain and voice, or one speech-to-speech engine');
  const need = (part: Part, id: string | undefined): Component => {
    if (!id) throw new StackError(`choose the ${PART_WORD[part]}`);
    const x = getComponent(part, id);
    if (!x) throw new StackError(`"${id}" is not a ${PART_WORD[part]} we offer`);
    return x;
  };
  let parts: Component[]; let components: StackComponents; let kind: VoiceStack['kind'];
  if (c.s2s) {
    if (c.ears || c.brain || c.voice) throw new StackError('a speech-to-speech engine hears, thinks and speaks by itself: choose it alone, or choose ears, brain and voice');
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

const PART_WORD: Record<Part, string> = { ears: 'ears (speech to text)', brain: 'brain (language model)', voice: 'voice', s2s: 'speech-to-speech engine' };

export class StackError extends Error {
  constructor(message: string) { super(message); this.name = 'StackError'; }
}

/** Canonical identity of the combination that ran, so results are filed under what actually ran. */
export function combinationId(stack: VoiceStack, voiceName?: string): string {
  const c = stack.components;
  const core = stack.kind === 's2s' ? c.s2s : `${c.ears}${c.gatedEars ? '' : '/ungated'}+${c.brain}+${c.voice}`;
  return `${stack.brief}|${core}${voiceName ? '~' + voiceName : ''}`;
}
