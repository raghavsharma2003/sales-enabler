// What VP pays providers, per stack and component. Unit prices are copied from voicelab/server/catalog.py (USD list
// prices with their sources, FX INR 95/$) and voicelab/server/phone.py (Plivo India). A per-minute figure needs a
// usage assumption (how much caller audio the ears hear, how many replies, how much she speaks): that is MINUTE below,
// labelled as an assumption on every row until the meter replaces it with measured per-stack averages.
// Amounts are micro-rupees (INR x 1e6) so sub-paisa per-minute lines keep their precision; totals round to milli.
import { DEFAULT_CARRIER } from './carriers.ts';
import { STACKS, type StackComponents } from '../../../shared/stacks.ts';

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
  azure: { provider: 'Azure Speech hi-IN (Central India)', usdMin: 1.0 / 60, price: '$1.00/audio hour', src: `${CAT} STT.azure: Azure S1 real-time STT $1.00/audio hour` },
  sarvam: { provider: 'Sarvam Saaras v4', usdMin: 0.5 / FX, price: '₹30/audio hour', src: `${CAT} STT.sarvam: Sarvam docs, billed per second` },
};
export const BRAINS: Record<string, Brain> = {
  'gemini-3.5-flash-lite': { provider: 'Gemini 3.5 Flash-Lite', inUsd1m: 0.30, outUsd1m: 2.50, src: `${CAT} BRAINS` },
  'gpt-5.4-mini': { provider: 'GPT-5.4 mini (Azure)', inUsd1m: 0.75, outUsd1m: 4.50, src: `${CAT} BRAINS: OpenAI list price (2026-10-20 sweep); Azure meter not read` },
  'gemini-3.8-flash': { provider: 'Gemini 3.8 Flash', inUsd1m: 0.75, outUsd1m: 3.75, src: `${CAT} BRAINS` },
  'gpt-6-luna@or': { provider: 'GPT-6 Luna via OpenRouter', inUsd1m: 0.10, outUsd1m: 0.50, src: `${CAT} BRAINS: OpenAI pricing page via the 2026-10-20 sweep` },
  'sarvam-105b': { provider: 'Sarvam-105B', inUsd1m: 15 / FX, outUsd1m: 60 / FX, src: `${CAT} BRAINS: ₹15 in / ₹60 out per 1M tokens` },
  // The rest of the parts a stack can be built from (shared/components.ts), same source.
  'gemini-3.6-flash': { provider: 'Gemini 3.6 Flash', inUsd1m: 0.75, outUsd1m: 3.75, src: `${CAT} BRAINS` },
  'gpt-4.1-mini-in': { provider: 'GPT-4.1 mini (Azure, India)', inUsd1m: 0.44, outUsd1m: 1.76, src: `${CAT} BRAINS` },
  'gpt-4.1': { provider: 'GPT-4.1 (Azure)', inUsd1m: 2.0, outUsd1m: 8.0, src: `${CAT} BRAINS` },
  'gpt-oss-120b': { provider: 'gpt-oss-120b (Azure)', inUsd1m: 0.15, outUsd1m: 0.60, src: `${CAT} BRAINS` },
  'llama-4-maverick': { provider: 'Llama 4 Maverick (Azure)', inUsd1m: 0.25, outUsd1m: 1.0, src: `${CAT} BRAINS` },
  'kimi-k2.6': { provider: 'Kimi K2.6 (Azure)', inUsd1m: 0.95, outUsd1m: 4.0, src: `${CAT} BRAINS` },
  'gpt-6-sol@or': { provider: 'GPT-6 Sol via OpenRouter', inUsd1m: 2.0, outUsd1m: 10.0, src: `${CAT} BRAINS: OpenAI pricing page via the 2026-10-20 sweep` },
};
export const VOICES: Record<string, Voice> = {
  'gemini-lite': { provider: 'Gemini 3.8 Flash-Lite TTS', usdAudioMin: 6.0 * 25 * 60 / 1e6, price: '$6/1M audio tokens', src: `${CAT} TTS.gemini-lite: g1` },
  'azure-mai': { provider: 'Azure MAI-Voice-2.1', usd1mChars: 22.0, price: '$22/1M chars (unverified: priced like HD until the meter is read)', src: `${CAT} TTS.azure-mai` },
  sarvam: { provider: 'Sarvam Bulbul v4 Flash', usd1mChars: 20 * 100 / FX, price: '₹20 per 10K chars', src: `${CAT} TTS.sarvam: Sarvam pricing page` },
  gemini: { provider: 'Gemini 3.8 Flash TTS', usdAudioMin: 9.0 * 25 * 60 / 1e6, price: '$9/1M audio tokens (doubles 2027-01-01)', src: `${CAT} TTS.gemini: g1` },
  azure: { provider: 'Azure neural voice', usd1mChars: 15.0, price: '$15/1M chars', src: `${CAT} TTS.azure: Azure S1 neural TTS` },
  'azure-hd': { provider: 'Azure HD voice', usd1mChars: 22.0, price: '$22/1M chars', src: `${CAT} TTS.azure-hd: Azure Neural HD` },
};
// The wired carrier path (carriers.ts): Plivo India outbound at its published rate and pulse. The pulse's rounding is
// not folded into the per-minute line; the estimate bills each call's pulse-rounded seconds (money.ts).
export const TELEPHONY = { provider: 'Plivo India outbound', inrMin: DEFAULT_CARRIER.outboundInrPerMin!, pulseSec: DEFAULT_CARRIER.pulseSec!,
  price: `₹${DEFAULT_CARRIER.outboundInrPerMin}/min, ${DEFAULT_CARRIER.pulseSec}-second pulse`, src: `${DEFAULT_CARRIER.urls[0]} (fetched 2026-10-24)` };
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
  return STACKS.flatMap(s => partLines(s.id, s.components));
}

/** The cost lines for one set of parts: a curated stack's, or one a user built ('custom'). Throws if a part has no price. */
export function partLines(stackId: string, c: StackComponents): CardRow[] {
  const rows: CardRow[] = [];
  {
    const s = { id: stackId, kind: c.s2s ? 's2s' : 'cascade' };
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
      inrMicroPerCall: 0, unitPrice: TELEPHONY.price,
      usage: `per connected minute; each call is billed in whole ${TELEPHONY.pulseSec}-second pulses, which the estimate adds per call`, grade: 'computed', source: TELEPHONY.src });
    add({ component: 'platform', provider: 'Vyakti infrastructure', inrMicroPerMin: micro(PLATFORM.inrMin), unitPrice: '₹0.03/min', usage: 'per connected minute [inferred]', grade: 'computed', source: PLATFORM.src });
    add({ component: 'analysis', provider: 'Vyakti call analysis', inrMicroPerMin: micro(ANALYSIS.inrMin), unitPrice: '₹0.06/min', usage: 'per connected minute (about ₹0.17 per 3-min call)', grade: 'computed', source: ANALYSIS.src });
  }
  return rows;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** The seed migration's INSERT, generated from computeCard() (tests check the two never drift). */
export function seedSql(): string {
  const vals = computeCard().map(r => `  (${[q(r.stackId), q(r.component), q(r.provider), r.inrMicroPerMin, r.inrMicroPerCall, q(r.unitPrice), q(r.usage), q(r.grade), q(r.source), q(r.asOf)].join(', ')})`);
  return 'INSERT INTO cost_card (stack_id, component, provider, inr_micro_per_min, inr_micro_per_call, unit_price, usage, grade, source, as_of) VALUES\n' + vals.join(',\n') + ';\n';
}

export interface PartPrice { part: 'ears' | 'brain' | 'voice' | 's2s'; id: string; inrMicroPerMin: number; basis: string }

/** What one part of a built stack costs Vyakti per connected minute, by the same rates and minute profile as the cost
 *  card (ears gated, as a built stack runs them), so a stack's parts plus EXTRAS add up to money.estimate's figure.
 *  `listPrice` is the part's published price (shared/components.ts), quoted in the basis; null when no rate is on file. */
export function partPrice(part: PartPrice['part'], id: string, listPrice: string): PartPrice | null {
  const usd = (s: string) => /\$/.test(s) ? `${s}, at ₹${FX} to the US dollar` : s;
  if (part === 's2s') {
    const p = S2S[id];
    return p ? { part, id, inrMicroPerMin: micro(p.inrMin), basis: `About ₹${p.inrMin} a minute for hearing, thinking and speaking together, from an earlier test report. Also on file: ${listPrice}.` } : null;
  }
  const lines = (() => {
    const probe = { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite', gatedEars: true, [part]: id };
    try { return partLines('custom', probe); } catch { return null; }
  })();
  const row = lines?.find(r => r.component === part);
  if (!row) return null;
  const typical = part === 'ears' ? `the caller speaking for about ${MINUTE.callerShareGated * 60} seconds of each minute`
    : part === 'brain' ? `about ${MINUTE.replies} replies a minute`
    : `her speaking for about ${MINUTE.agentSpeechSec} seconds of each minute`;
  return { part, id, inrMicroPerMin: row.inrMicroPerMin, basis: `List price ${usd(listPrice)}, for a typical minute of talk (${typical}). An estimate, not an average of real calls.` };
}

/** Per-minute costs every stack carries besides its parts: the phone line, Vyakti's infrastructure and call analysis. */
export const EXTRAS_INR_MICRO_PER_MIN = micro(TELEPHONY.inrMin) + micro(PLATFORM.inrMin) + micro(ANALYSIS.inrMin);
