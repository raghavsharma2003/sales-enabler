// The voice runtime's per-call trace (CallTrace, runtime-protocol.ts) read turn by turn, for the call page's timeline and
// for call.explain's turnCauses. Pure: the same reading on the server and in the browser. Nothing here is estimated; a
// turn with no figure has none recorded. The trace holds no words: `i` indexes the transcript.
import type { CallTrace } from './runtime-protocol.ts';

export const SLOW_GAP_MS = 1500;          // a reply slower than this, or than twice the call's median, is marked
export const LOW_ASR = 0.6;               // speech recognition below this was unsure what the caller said

export type CauseKind = 'reply_gap' | 'asr_low' | 'door_held' | 'cut_off' | 'error' | 'fallback' | 'tool_failed';
export interface TurnCause {
  kind: CauseKind;
  turn: number;                           // transcript index
  atMs: number | null;
  text: string;                           // plain words for a person
  evidence: Record<string, unknown>;      // the trace's own figures
  fix: { tool: string; why: string } | null;   // a suggestion only; nothing runs it
}
export interface TraceTurn { turn: number; speaker: 'agent' | 'caller'; startMs: number | null; gapMs: number | null; asrConfidence: number | null;
  tts: string | null; causes: TurnCause[] }

const DOOR: Record<string, string> = { replaced: 'replaced a line before she said it', blocked: 'stopped a line before she said it', redacted: 'removed private details from a line', held: 'held a line back' };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const msWords = (n: number) => `${Math.round(n).toLocaleString('en-IN')} ms`;

/** Each transcript turn with its trace figures and what went wrong on it, in transcript order. */
export function traceTurns(transcript: { speaker: string; startMs?: number | null }[], trace: CallTrace | null | undefined): TraceTurn[] {
  if (!trace || trace.schema !== 1 || !Array.isArray(trace.turns)) return [];
  const rows = new Map(trace.turns.filter(t => Number.isInteger(t.i) && t.i >= 0 && t.i < transcript.length).map(t => [t.i, t]));
  const gaps = [...rows.values()].flatMap(t => (t.speaker === 'agent' && typeof t.gapMs === 'number' && t.gapMs > 0 ? [t.gapMs] : []));
  const mid = median(gaps);
  const out: TraceTurn[] = transcript.map((l, i) => {
    const r = rows.get(i);
    const startMs = (r?.startMs ?? l.startMs ?? null) as number | null;
    const base: TraceTurn = { turn: i, speaker: l.speaker === 'agent' ? 'agent' : 'caller', startMs, gapMs: null, asrConfidence: null, tts: null, causes: [] };
    if (!r) return base;
    const cause = (kind: CauseKind, text: string, evidence: Record<string, unknown>) => base.causes.push({ kind, turn: i, atMs: startMs, text, evidence, fix: null });
    if (r.speaker === 'caller') {
      base.asrConfidence = typeof r.asrConfidence === 'number' ? r.asrConfidence : null;
      if (base.asrConfidence !== null && base.asrConfidence < LOW_ASR)
        cause('asr_low', `Speech recognition was unsure what the caller said (confidence ${base.asrConfidence.toFixed(2)}), so she may have misheard.`, { asrConfidence: base.asrConfidence });
    } else {
      base.gapMs = typeof r.gapMs === 'number' && r.gapMs > 0 ? r.gapMs : null;
      base.tts = r.tts ? [r.tts.provider, r.tts.voice, r.tts.style].filter(Boolean).join(' · ') : null;
      if (base.gapMs !== null && (base.gapMs > SLOW_GAP_MS || (mid !== null && gaps.length >= 3 && base.gapMs > 2 * mid)))
        cause('reply_gap', `Slow reply: ${msWords(base.gapMs)} from the caller finishing to her first audio${mid !== null ? ` (the call's median was ${msWords(mid)})` : ''}.`, { gapMs: base.gapMs, medianMs: mid, stages: r.stages ?? null });
      for (const d of r.door ?? []) cause('door_held', `The reply door ${DOOR[d.action] ?? 'acted on a line'}.`, { rule: d.rule, action: d.action });
      if (r.interrupted) cause('cut_off', 'The caller spoke over her and she stopped.', { interrupted: true });
    }
    return base;
  });
  // Events carry a time, not a turn: each goes to the turn that was under way when it happened.
  const at = (ms: number) => { let k = -1; for (const t of out) if (t.startMs !== null && t.startMs <= ms) k = t.turn; return k; };
  for (const e of trace.events ?? []) {
    if (typeof e.atMs !== 'number') continue;
    const k = at(e.atMs);
    if (k < 0) continue;
    const add = (kind: CauseKind, text: string) => out[k].causes.push({ kind, turn: k, atMs: e.atMs, text, evidence: { ...e }, fix: null });
    if (e.kind === 'error') add('error', 'The voice runtime recorded an error here.');
    else if (e.kind === 'fallback') add('fallback', 'A part of the voice stack failed here and a backup took over.');
    else if (e.kind === 'tool' && e.status === 'failed') add('tool_failed', 'A tool she used failed here.');
  }
  return out;
}

/** Every cause on the call, in order: what call.explain returns as turnCauses. */
export const turnCauses = (transcript: { speaker: string; startMs?: number | null }[], trace: CallTrace | null | undefined): TurnCause[] =>
  traceTurns(transcript, trace).flatMap(t => t.causes);
