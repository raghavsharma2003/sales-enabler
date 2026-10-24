// Words for the Outcomes and checks tab: whether a judge's outcome guesses can be trusted yet. Until calibration passes
// (n >= 50 labelled calls, agreement >= 90%, Wilson lower bound >= 80%), every status reads as "Uncalibrated" first.
export interface Calibration { status: 'uncalibrated' | 'calibrating' | 'trusted' | 'not_trusted' | 'needs_recheck'; n: number; agreement: number | null; lower: number | null }
export interface Trust { minLabelled: number; agreement: number; lower: number }

export function calibrationWords(k: Calibration, t: Trust): { label: string; tone: 'leaf' | 'marigold' | 'brick'; detail: string } {
  const pct = (x: number | null) => x === null ? '' : `${Math.round(x * 100)}%`;
  switch (k.status) {
    case 'trusted': return { label: 'Calibrated: trusted', tone: 'leaf',
      detail: `Agrees with people on ${pct(k.agreement)} of ${k.n} labelled calls (at least ${pct(k.lower)} with 95% confidence). Its guesses count towards results and learning.` };
    case 'not_trusted': return { label: 'Uncalibrated: not trusted', tone: 'brick',
      detail: `Agrees with people on ${pct(k.agreement)} of ${k.n} labelled calls, below the ${pct(t.agreement)} needed. Its guesses are shown but never counted.` };
    case 'needs_recheck': return { label: 'Needs a re-check', tone: 'brick',
      detail: `Its guesses disagreed with outcomes your own system confirmed (${pct(k.agreement)} agreement on ${k.n} calls with both). They are shown but no longer counted until it is calibrated again.` };
    case 'calibrating': return { label: 'Uncalibrated', tone: 'marigold',
      detail: `${k.n} of the ${t.minLabelled} labelled calls needed so far. Until then its guesses are shown as AI guesses and never counted.` };
    default: return { label: 'Uncalibrated', tone: 'marigold',
      detail: `Not measured yet. Label ${t.minLabelled} calls (or connect a system that confirms results) and check agreement. Until then its guesses are shown as AI guesses and never counted.` };
  }
}

export const FIELD_TYPE_WORDS: Record<string, string> = { text: 'Text', number: 'Number', date: 'Date', enum: 'Choice', sentiment: 'Sentiment (five-point scale)' };
