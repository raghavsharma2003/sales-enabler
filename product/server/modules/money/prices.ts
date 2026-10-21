// What VP pays providers, per stack and component. Unit prices are copied from voicelab/server/catalog.py (USD list
// prices with their sources, FX INR 95/$) and voicelab/server/phone.py (Plivo India). A per-minute figure needs a
// usage assumption (how much caller audio the ears hear, how many replies, how much she speaks): that is MINUTE below,
// labelled as an assumption on every row until the meter replaces it with measured per-stack averages.
// Amounts are micro-rupees (INR x 1e6) so sub-paisa per-minute lines keep their precision; totals round to milli.
import { STACKS } from '../../../shared/stacks.ts';

export const FX = 95;                 // the research programme's INR per USD (catalog.py)
export const AS_OF = '2026-10-20';    // the date the catalog prices were read

/** One connected minute, as assumed (not measured). */
export const MINUTE = {
  callerShareGated: 0.5,      // gated ears hear only caller speech: about half the minute
  replies: 4,                 // agent replies per minute
  inTokens: 2000,             // prompt tokens per reply (brief v2 + ledger + recent turns)
  outTokens: 60,              // tokens per spoken reply
  agentSpeechSec: 30,         // she speaks about half the minute
  charsPerSec: 15,            // Hinglish characters per spoken second
  audioTokensPerSec: 25,      // Gemini audio tokens per second (catalog.py)
} as const;

const usageText = {
  ears: (gated: boolean) => `${gated ? MINUTE.callerShareGated * 60 : 60} s of caller audio per connected minute${gated ? ' (gated)' : ''} [assumption]`,
  brain: `${MINUTE.replies} replies/min x (${MINUTE.inTokens} in + ${MINUTE.outTokens} out tokens) [assumption]`,
  voiceChars: `${MINUTE.agentSpeechSec} s speech x ${MINUTE.charsPerSec} chars/s = ${MINUTE.agentSpeechSec * MINUTE.charsPerSec} chars/min [assumption]`,
  voiceAudio: `${MINUTE.agentSpeechSec} s of synthesised audio per minute [assumption]`,
};

const CAT = 'voicelab/server/catalog.py';
type Ears = { provider: string; usdMin: number; price: string; src: string };
type Brain = { provider: string; inUsd1m: number; outUsd1m: number; src: string };
type Voice = { provider: string; usd1mChars?: number; usdAudioMin?: number; price: string; src: string };

// Copied from catalog.py; keep the source text so the card shows where every number came from.
export const EARS: Record<string, Ears> = {
  gemini: { provider: 'Gemini 3.5 transcribe-live', usdMin: 0.005 + 0.0005, price: '$0.0055/audio min', src: `${CAT} STT.gemini: audio in $3.5/1M (25 tok/s) + text out` },
  sarvam: { provider: 'Sarvam Saaras v4', usdMin: 0.5 / FX, price: '₹30/audio hour', src: `${CAT} STT.sarvam: Sarvam docs, billed per second` },
};
export const BRAINS: Record<string, Brain> = {
  'gemini-3.5-flash-lite': { provider: 'Gemini 3.5 Flash-Lite', inUsd1m: 0.30, outUsd1m: 2.50, src: `${CAT} BRAINS` },
  'gpt-5.4-mini': { provider: 'GPT-5.4 mini (Azure)', inUsd1m: 0.75, outUsd1m: 4.50, src: `${CAT} BRAINS: OpenAI list price (2026-10-20 sweep); Azure meter not read` },
  'gemini-3.8-flash': { provider: 'Gemini 3.8 Flash', inUsd1m: 0.75, outUsd1m: 3.75, src: `${CAT} BRAINS` },
  'gpt-6-luna@or': { provider: 'GPT-6 Luna via OpenRouter', inUsd1m: 0.10, outUsd1m: 0.50, src: `${CAT} BRAINS: OpenAI pricing page via the 2026-10-20 sweep` },
  'sarvam-105b': { provider: 'Sarvam-105B', inUsd1m: 15 / FX, outUsd1m: 60 / FX, src: `${CAT} BRAINS: ₹15 in / ₹60 out per 1M tokens` },
};
export const VOICES: Record<string, Voice> = {
  'gemini-lite': { provider: 'Gemini 3.8 Flash-Lite TTS', usdAudioMin: 6.0 * 25 * 60 / 1e6, price: '$6/1M audio tokens', src: `${CAT} TTS.gemini-lite: g1` },
  'azure-mai': { provider: 'Azure MAI-Voice-2.1', usd1mChars: 22.0, price: '$22/1M chars (unverified: priced like HD until the meter is read)', src: `${CAT} TTS.azure-mai` },
  sarvam: { provider: 'Sarvam Bulbul v4 Flash', usd1mChars: 20 * 100 / FX, price: '₹20 per 10K chars', src: `${CAT} TTS.sarvam: Sarvam pricing page` },
};
// Plivo India outbound, console read 2026-10-19, 60 s pulse. The pulse rounds each call up; on average half a pulse.
export const TELEPHONY = { provider: 'Plivo India outbound', inrMin: 0.38, pulseSec: 60, price: '₹0.38/min, 60 s pulse', src: 'voicelab/server/phone.py RATE_INR_MIN (console 2026-10-19)' };
export const PLATFORM = { inrMin: 0.03, src: 'research/2026-10-21/blueprint/modules/economics-platform.md 2.2 COGS: infra 0.03 [I]' };
export const ANALYSIS = { inrMin: 0.06, src: 'research/2026-10-21/blueprint/modules/economics-platform.md 2.2 COGS: analysis 0.06' };
// Speech-to-speech has no component price in the catalog: the report's measured AI rupees per minute stand in.
export const S2S: Record<string, { provider: string; inrMin: number; src: string }> = {
  'gemini-3.8-live': { provider: 'Gemini 3.8 Live', inrMin: 5.72, src: `${CAT} PRESETS gemini-3.8-live ref: ₹5.72 AI/min (report)` },
};

export interface CardRow {
  stackId: string; component: 'telephony' | 'ears' | 'brain' | 'voice' | 'platform' | 'analysis';
  provider: string; inrMicroPerMin: number; inrMicroPerCall: number; unitPrice: string; usage: string;
  grade: 'computed' | 'report'; source: string; asOf: string;
}

const micro = (inr: number) => Math.round(inr * 1e6);

/** The provider cost card for every stack in shared/stacks.ts. Throws if a stack names a component with no price. */
export function computeCard(): CardRow[] {
  const rows: CardRow[] = [];
  for (const s of STACKS) {
    const c = s.components;
    const add = (r: Omit<CardRow, 'stackId' | 'asOf' | 'inrMicroPerCall'> & { inrMicroPerCall?: number }) =>
      rows.push({ stackId: s.id, asOf: AS_OF, inrMicroPerCall: 0, ...r });
    if (s.kind === 's2s') {
      const p = S2S[c.s2s!];
      if (!p) throw new Error(`no price for speech-to-speech engine ${c.s2s}`);
      add({ component: 'brain', provider: p.provider, inrMicroPerMin: micro(p.inrMin), unitPrice: `₹${p.inrMin}/min all-in AI`, usage: 'per connected minute (speech-to-speech: ears, brain and voice in one)', grade: 'report', source: p.src });
    } else {
      const e = EARS[c.ears!], b = BRAINS[c.brain!], v = VOICES[c.voice!];
      if (!e || !b || !v) throw new Error(`stack ${s.id}: a component has no price (${c.ears}, ${c.brain}, ${c.voice})`);
      const share = c.gatedEars ? MINUTE.callerShareGated : 1;
      add({ component: 'ears', provider: e.provider, inrMicroPerMin: micro(e.usdMin * share * FX), unitPrice: e.price, usage: usageText.ears(!!c.gatedEars), grade: 'computed', source: e.src });
      const brainUsd = MINUTE.replies * (MINUTE.inTokens * b.inUsd1m + MINUTE.outTokens * b.outUsd1m) / 1e6;
      add({ component: 'brain', provider: b.provider, inrMicroPerMin: micro(brainUsd * FX), unitPrice: `$${+b.inUsd1m.toFixed(4)} in / $${+b.outUsd1m.toFixed(4)} out per 1M tokens`, usage: usageText.brain, grade: 'computed', source: b.src });
      const voiceUsd = v.usd1mChars !== undefined
        ? v.usd1mChars * MINUTE.agentSpeechSec * MINUTE.charsPerSec / 1e6
        : v.usdAudioMin! * MINUTE.agentSpeechSec / 60;
      add({ component: 'voice', provider: v.provider, inrMicroPerMin: micro(voiceUsd * FX), unitPrice: v.price, usage: v.usd1mChars !== undefined ? usageText.voiceChars : usageText.voiceAudio, grade: 'computed', source: v.src });
    }
    add({ component: 'telephony', provider: TELEPHONY.provider, inrMicroPerMin: micro(TELEPHONY.inrMin),
      inrMicroPerCall: micro(TELEPHONY.inrMin * 0.5), unitPrice: TELEPHONY.price,
      usage: 'per connected minute, plus half a 60 s pulse per call for the carrier rounding up [assumption]', grade: 'computed', source: TELEPHONY.src });
    add({ component: 'platform', provider: 'VP infra', inrMicroPerMin: micro(PLATFORM.inrMin), unitPrice: '₹0.03/min', usage: 'per connected minute [inferred]', grade: 'computed', source: PLATFORM.src });
    add({ component: 'analysis', provider: 'VP default analysis', inrMicroPerMin: micro(ANALYSIS.inrMin), unitPrice: '₹0.06/min', usage: 'per connected minute (about ₹0.17 per 3-min call)', grade: 'computed', source: ANALYSIS.src });
  }
  return rows;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** The seed migration's INSERT, generated from computeCard() (tests check the two never drift). */
export function seedSql(): string {
  const vals = computeCard().map(r => `  (${[q(r.stackId), q(r.component), q(r.provider), r.inrMicroPerMin, r.inrMicroPerCall, q(r.unitPrice), q(r.usage), q(r.grade), q(r.source), q(r.asOf)].join(', ')})`);
  return 'INSERT INTO cost_card (stack_id, component, provider, inr_micro_per_min, inr_micro_per_call, unit_price, usage, grade, source, as_of) VALUES\n' + vals.join(',\n') + ';\n';
}
