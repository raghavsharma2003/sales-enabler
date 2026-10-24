// Blueprint decision 9, the live fast lane: harm-class moments on analysed live calls, and the window that throttles a
// script. Pure, so every rule is testable without a database or a model. Quotes come only from what analysis verified
// (its moment quotes and outcome read, each an exact line of the call) or, for a crisis, her own verbatim reply: a
// person in crisis is never quoted.
//   complaint_human      a complaint (reason CONV_COMPLAINT, or an objection) together with a request for a human
//                        (reason CONV_NEEDS_HUMAN, an outcome read of needs_human, or a caller line asking for a person)
//   ignored_opt_out      an opt-out moment, and the call did not end on it (end reason not opt_out, reason not END_OPTED_OUT)
//   crisis_without_line  a crisis (END_CRISIS, a crisis hand-off, a raised judge, or the crisis floor on a caller line),
//                        and no line of hers gives Tele-MANAS 14416 or 112
//   caller_says_lied     a caller's verified moment says she lied
import { callerSignals } from '../../../shared/safety/index.ts';

export const HARM_WINDOW = 15, HARM_MIN = 2, THROTTLE_FACTOR = 0.25;
export type HarmKind = 'complaint_human' | 'ignored_opt_out' | 'crisis_without_line' | 'caller_says_lied';
export interface HarmMoment { kind: HarmKind; quote: string | null; speaker: 'caller' | 'agent' }
export interface AnalysedCall {
  id: string; reason_code: string | null; end_reason: string | null; flags: string[] | null;
  transcript: { speaker: 'agent' | 'caller'; text: string; startMs?: number }[] | null;
  analysis: { outcomeGuess?: { value?: string; quote?: string } | null; judge_raised?: unknown[] } | null;
  moments: { kind: string; quote: string | null; at_ms: number | null }[];
}

const CRISIS_LINE = /14416|(^|[^\d])112([^\d]|$)|tele-?\s?manas|टेली-?मानस/i;
const LIED = /\b(jh(oo|u)th(a|i|e)?|jh(oo|u)t|lie|lied|lies|lying|liar|fib(bed)?|galat\s+(bola|bataya|kaha|bataaya))\b|झूठ/i;

export function harmMoments(c: AnalysedCall): HarmMoment[] {
  const out: HarmMoment[] = [];
  const lines = c.transcript ?? [];
  const caller = lines.filter(l => l.speaker === 'caller');
  const m = (kind: string) => c.moments.filter(x => x.kind === kind);
  const verified = (kind: string) => m(kind).find(x => x.quote)?.quote ?? null;

  const complaint = c.reason_code === 'CONV_COMPLAINT' || m('objection').length > 0;
  const human = c.reason_code === 'CONV_NEEDS_HUMAN' || /human/.test(c.analysis?.outcomeGuess?.value ?? '') || caller.some(l => callerSignals(l.text).wantsHuman);
  if (complaint && human) out.push({ kind: 'complaint_human', quote: verified('objection') ?? c.analysis?.outcomeGuess?.quote ?? null, speaker: 'caller' });

  if (m('opt_out').length && c.end_reason !== 'opt_out' && c.reason_code !== 'END_OPTED_OUT')
    out.push({ kind: 'ignored_opt_out', quote: verified('opt_out') ?? caller.find(l => callerSignals(l.text).optOut)?.text ?? null, speaker: 'caller' });

  const crisisAt = lines.findIndex(l => l.speaker === 'caller' && callerSignals(l.text).crisis);
  const crisis = c.reason_code === 'END_CRISIS' || c.end_reason === 'crisis_handoff' || (c.analysis?.judge_raised?.length ?? 0) > 0 || crisisAt >= 0;
  if (crisis && !lines.some(l => l.speaker === 'agent' && CRISIS_LINE.test(l.text))) {
    const reply = lines.slice(Math.max(0, crisisAt) + 1).find(l => l.speaker === 'agent')?.text ?? null;
    out.push({ kind: 'crisis_without_line', quote: reply, speaker: 'agent' });
  }

  const lie = c.moments.find(x => x.quote && LIED.test(x.quote) && caller.some(l => l.text === x.quote));
  if (lie) out.push({ kind: 'caller_says_lied', quote: lie.quote, speaker: 'caller' });
  return out;
}

/** The calls (oldest first) and their harm moments in the latest window of HARM_WINDOW consecutive calls that holds at
 *  least HARM_MIN moments, or null. */
export function harmWindow(calls: { id: string; harm: HarmMoment[] }[]): { calls: string[]; moments: (HarmMoment & { callId: string })[] } | null {
  for (let end = calls.length; end >= 1; end--) {
    const w = calls.slice(Math.max(0, end - HARM_WINDOW), end);
    const moments = w.flatMap(c => c.harm.map(h => ({ ...h, callId: c.id })));
    if (moments.length >= HARM_MIN) return { calls: [...new Set(moments.map(x => x.callId))], moments };
  }
  return null;
}
