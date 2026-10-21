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

const LAB = 'voicelab/server/catalog.py round-2 presets, India VM, 2026-10-20';

export const STACKS: readonly VoiceStack[] = [
  {
    id: 'v2-live', label: 'Gemini 3.8 Live (speech-to-speech)', kind: 's2s', brief: 'v2',
    components: { s2s: 'gemini-3.8-live' },
    replyGap: { value: 'not measured', grade: 'not_measured',
      source: 'the runtime now holds each turn until the reply door passes every sentence (review M3); the lab smoke of 0.8-1.6 s was without that hold' },
    note: 'Judges’ best brain family; talks over callers on about 40% of turns ungated. She starts only after the whole turn is generated and checked.',
    requires: ['GEMINI'], status: 'beta',
    risks: ['speech-to-speech must pass the reply-door attack battery before live calls', 'reply gap with the door hold is unmeasured'],
  },
  {
    id: 'v2-flashlite', label: 'Gemini ears + Gemini 3.5 Flash-Lite + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '0.70 s first token', grade: 'measured', source: LAB },
    note: 'Fastest good brain in the bake-off.', requires: ['GEMINI'], status: 'available',
    risks: ['Gemini TTS price doubles 2027-01-01'],
  },
  {
    id: 'v2-54mini', label: 'Gemini ears + GPT-5.4 mini + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gpt-5.4-mini', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '0.96 s first token', grade: 'measured', source: LAB },
    note: 'OpenAI fast tier.', requires: ['GEMINI', 'AZURE_OPENAI'], status: 'available',
  },
  {
    id: 'v2-38flash', label: 'Gemini ears + Gemini 3.8 Flash + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.8-flash', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '2.0 s first token', grade: 'measured', source: LAB },
    note: 'Best judged brain, but slow from India.', requires: ['GEMINI'], status: 'available',
  },
  {
    id: 'v2-mai', label: 'Gemini ears + Gemini 3.5 Flash-Lite + Azure MAI-Voice (emotion styles)', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.5-flash-lite', voice: 'azure-mai', gatedEars: true },
    replyGap: { value: '0.43 s voice first audio', grade: 'measured', source: LAB },
    note: 'Fastest voice; emotion styles per reply. Voice price not yet read from the meter.',
    requires: ['GEMINI', 'AZURE_SPEECH'], status: 'available',
  },
  {
    id: 'v2-flashlite-or', label: 'Gemini ears + Flash-Lite + Gemini voice, via OpenRouter', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gemini-3.5-flash-lite@or', voice: 'gemini-lite-or', gatedEars: true },
    replyGap: { value: '~1.5 s later start', grade: 'measured', source: LAB },
    note: 'Styled voice; the clip arrives whole, so she starts about 1.5 s later.', requires: ['GEMINI', 'OPENROUTER'], status: 'available',
  },
  {
    id: 'v2-luna', label: 'Gemini ears + GPT-6 Luna + Gemini voice', kind: 'cascade', brief: 'v2',
    components: { ears: 'gemini', brain: 'gpt-6-luna@or', voice: 'gemini-lite', gatedEars: true },
    replyGap: { value: '1.4 s first token', grade: 'measured', source: LAB },
    note: 'The owner’s pick; judged last in the text bake-off, not yet confirmed by ear.', requires: ['GEMINI', 'OPENROUTER'], status: 'available',
  },
  {
    id: 'sarvam-india', label: 'All-Sarvam: Saaras + Sarvam-105B + Bulbul (Indian stack)', kind: 'cascade', brief: 'v2',
    components: { ears: 'sarvam', brain: 'sarvam-105b', voice: 'sarvam', gatedEars: true },
    replyGap: { value: '0.97-1.18 s server', grade: 'measured', source: 'blueprint section 8.2, n=9 replies' },
    note: 'India-hosted end to end; Sarvam trains on data unless opted out.', requires: ['SARVAM'], status: 'beta',
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
