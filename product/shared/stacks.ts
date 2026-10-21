// The voice stacks a user can choose for an agent. These are the round-2 curated stacks from the
// voice lab (voicelab/server/catalog.py), plus the owner's pick and the all-Indian stack.
// There is deliberately NO default yet (decision.2026-10-21.stack-choice-no-default): the user picks.
// Measured figures carry their grade and source so the picker never shows an unlabelled number.

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
    id: 'v2-flashlite', label: 'Gemini ears + Gemini 3.5 Flash-Lite + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '0.70 s, reply text starts', grade: 'measured', source: LAB },
    note: 'The fastest of the well-judged models in our tests.', requires: ['GEMINI'], status: 'available',
    risks: ['Google’s voice price doubles on 1 Jan 2027'],
  },
  {
    id: 'v2-54mini', label: 'Gemini ears + GPT-5.4 mini + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gpt-5.4-mini', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '0.96 s, reply text starts', grade: 'measured', source: LAB },
    note: 'OpenAI’s fast model.', requires: ['GEMINI', 'AZURE_OPENAI'], status: 'available',
  },
  {
    id: 'v2-38flash', label: 'Gemini ears + Gemini 3.8 Flash + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.8-flash', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '2.0 s, reply text starts', grade: 'measured', source: LAB },
    note: 'The best-judged model, but slow to answer from India.', requires: ['GEMINI'], status: 'available',
  },
  {
    id: 'v2-mai', label: 'Gemini ears + Gemini 3.5 Flash-Lite + Azure MAI-Voice (emotion styles)', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.5-flash-lite', voice: 'azure-mai', gatedEars: true },
    replyGap: { value: '0.43 s, voice starts after the text', grade: 'measured', source: 'Measured in our voice lab from a server in India, 20 Oct 2026. This is how soon the voice starts once the reply text is ready; the whole reply gap was not measured for this stack.' },
    note: 'The fastest voice to start, with an emotion style for each reply. Its price has not been checked against a real bill yet.',
    requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
  },
  {
    id: 'v2-flashlite-or', label: 'Gemini ears + Flash-Lite + Gemini voice, via OpenRouter', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.5-flash-lite@or', voice: 'gemini-lite-or', gatedEars: true },
    replyGap: { value: 'about 1.5 s slower to start', grade: 'measured', source: 'Measured in our voice lab from a server in India, 20 Oct 2026. The voice clip arrives whole instead of streaming, so she starts later.' },
    note: 'A more expressive voice, but each clip arrives whole, so she starts about 1.5 s later.', requires: ['GEMINI', 'OPENROUTER'], status: 'available',
  },
  {
    id: 'v2-luna', label: 'Gemini ears + GPT-6 Luna + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gpt-6-luna@or', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '1.4 s, reply text starts', grade: 'measured', source: LAB },
    note: 'Judged last of these in our written tests; not yet tried on a call.', requires: ['GEMINI', 'OPENROUTER'], status: 'available',
  },
  {
    id: 'sarvam-india', label: 'All-Sarvam: Saaras + Sarvam-105B + Bulbul (Indian stack)', kind: 'cascade', brief: 'v2',
    components: { ears: 'sarvam', brain: 'sarvam-105b', voice: 'sarvam', gatedEars: true },
    replyGap: { value: '0.97 to 1.18 s on Sarvam’s servers', grade: 'measured', source: 'Measured on 9 replies in an earlier test, on Sarvam’s servers, before the phone line.' },
    note: 'Runs in India end to end. Sarvam may train on your call data unless you opt out with them.', requires: ['SARVAM'], status: 'beta',
  },
];

export function getStack(id: string): VoiceStack | undefined {
  return STACKS.find(s => s.id === id);
}

/** A stack id is valid for an agent only if it is in the catalog. There is no fallback default. */
export function requireStack(id: string | undefined | null): VoiceStack {
  if (!id) throw new StackError('choose a voice stack: there is no default yet');
  const s = getStack(id);
  if (!s) throw new StackError(`unknown voice stack "${id}"`);
  return s;
}

export class StackError extends Error {
  constructor(message: string) { super(message); this.name = 'StackError'; }
}

/** Canonical identity of the combination that ran, so results are filed under what actually ran. */
export function combinationId(stack: VoiceStack, voiceName?: string): string {
  const c = stack.components;
  const core = stack.kind === 's2s' ? c.s2s : `${c.ears}${c.gatedEars ? '' : '/ungated'}+${c.brain}+${c.voice}`;
  return `${stack.brief}|${core}${voiceName ? '~' + voiceName : ''}`;
}
