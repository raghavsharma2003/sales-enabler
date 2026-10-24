// A campaign's retry pattern, the one its form shows (P7: what you see is what runs). A pattern says how many calls a
// person gets in all, how far apart, and after which endings she tries again. Only endings where the person simply did
// not pick up can retry (busy, no answer, switched off, voicemail, a call cut short); a wrong or invalid number, an
// opt-out, a completed call and an unknown ending never do, whatever the pattern says. Platform faults (a provider
// error, a call VP dropped) keep the service ladder and do not count against the person. Every retry is a new attempt,
// so the dial gate (DND, window, consent, budgets) decides it again.
//
// A time the caller stated ("shaam 6 baje", "kal subah") beats the pattern for that person, clamped into the
// campaign's calling window and TRAI's hours with the gate's own window rules, so what the page shows is when she calls.
import type { CallCategory } from '../../../shared/agent-config.ts';
import { arr, num, obj, opt, str } from '../../../shared/validate.ts';
import { DEFAULT_WINDOWS, type OutcomeClass, type WindowPolicy } from './defaults.ts';
import { eligibility } from './windows.ts';
import type { DialPolicy } from './gate.ts';

export const RETRYABLE = ['busy', 'no_answer', 'switched_off', 'voicemail', 'short_call'] as const;
export type Retryable = (typeof RETRYABLE)[number];
export const NEVER_RETRY: readonly OutcomeClass[] = ['invalid', 'opt_out', 'wrong_party', 'completed', 'unknown', 'operator_block'];

export interface RetryPolicy { pattern: string; maxAttempts: number; gapsMin: number[]; retryOn: Retryable[] }

/** Bounded: at most 6 calls in all, gaps between 15 minutes and 3 days. */
export const RETRY_BOUNDS = { maxAttempts: [1, 6], gapMin: [15, 4320] } as const;
export const RETRY_PATTERNS: Record<string, RetryPolicy & { label: string }> = {
  standard: { label: 'Standard: up to 3 calls, 2 hours then a day apart', pattern: 'standard', maxAttempts: 3, gapsMin: [120, 1440], retryOn: ['busy', 'no_answer', 'switched_off'] },
  gentle: { label: 'Gentle: up to 2 calls, a day apart', pattern: 'gentle', maxAttempts: 2, gapsMin: [1440], retryOn: ['busy', 'no_answer', 'switched_off'] },
  persistent: { label: 'Persistent: up to 4 calls, 1 hour, 4 hours, then a day apart', pattern: 'persistent', maxAttempts: 4, gapsMin: [60, 240, 1440], retryOn: ['busy', 'no_answer', 'switched_off', 'voicemail'] },
  none: { label: 'No retries: one call each', pattern: 'none', maxAttempts: 1, gapsMin: [], retryOn: [] },
};

export const retryInput = opt(obj({
  pattern: opt(str({ oneOf: Object.keys(RETRY_PATTERNS), desc: 'standard, gentle, persistent or none' })),
  maxAttempts: opt(num({ int: true, min: RETRY_BOUNDS.maxAttempts[0], max: RETRY_BOUNDS.maxAttempts[1], desc: 'calls per person in all, the first included' })),
  gapsMin: opt(arr(num({ int: true, min: RETRY_BOUNDS.gapMin[0], max: RETRY_BOUNDS.gapMin[1] }), { max: 5 })),
  retryOn: opt(arr(str({ oneOf: RETRYABLE }), { max: RETRYABLE.length })),
}));

/** The pattern a draft asked for, filled from its named pattern (standard when none is named). */
export function resolveRetry(i: { pattern?: string; maxAttempts?: number; gapsMin?: number[]; retryOn?: string[] } | undefined, prev?: RetryPolicy): RetryPolicy {
  const base = RETRY_PATTERNS[i?.pattern ?? prev?.pattern ?? 'standard'] ?? RETRY_PATTERNS.standard;
  const p: RetryPolicy = { pattern: i?.pattern ?? prev?.pattern ?? 'standard', maxAttempts: i?.maxAttempts ?? (i?.pattern ? base.maxAttempts : prev?.maxAttempts ?? base.maxAttempts),
    gapsMin: i?.gapsMin ?? (i?.pattern ? base.gapsMin : prev?.gapsMin ?? base.gapsMin), retryOn: (i?.retryOn ?? (i?.pattern ? base.retryOn : prev?.retryOn ?? base.retryOn)) as Retryable[] };
  if (p.maxAttempts > 1 && !p.gapsMin.length) throw new Error('a retry pattern with more than one call needs at least one gap');
  if (i?.maxAttempts !== undefined || i?.gapsMin !== undefined || i?.retryOn !== undefined) p.pattern = 'custom';
  return p;
}

export function describeRetry(p: RetryPolicy): string {
  if (p.maxAttempts <= 1 || !p.retryOn.length) return 'No retries: one call each.';
  const gap = (m: number) => m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`;
  return `Up to ${p.maxAttempts} calls each, ${p.gapsMin.map(gap).join(', then ')} apart, after ${p.retryOn.map(r => r.replace('_', ' ')).join(', ')}. Never after a wrong or invalid number or an opt-out.`;
}

/** The next try under a campaign pattern: { at } or why not. `tries` counts the calls this person already had in the chain. */
export function nextByPattern(p: RetryPolicy, outcome: OutcomeClass, tries: number, from: Date): { at: Date } | { reason: string } {
  if (NEVER_RETRY.includes(outcome)) return { reason: `no retry after ${outcome.replace('_', ' ')}` };
  if (!(p.retryOn as string[]).includes(outcome)) return { reason: `this campaign does not retry after ${outcome.replace('_', ' ')}` };
  if (tries >= p.maxAttempts) return { reason: `this person has had all ${p.maxAttempts} calls the campaign allows` };
  const gap = p.gapsMin[Math.min(tries - 1, p.gapsMin.length - 1)];
  return { at: new Date(from.getTime() + gap * 60_000) };
}

/** Clamp a wanted time into the calling window, the outer band and TRAI's hours (the gate's own rule), in the person's zone. */
export function clampToWindow(want: Date, tz: string, category: CallCategory, window: WindowPolicy | undefined, dp: Pick<DialPolicy, 'outer_band' | 'holidays'>, rbiBand = false): Date | null {
  const e = eligibility(want, tz, { category, window: window ?? DEFAULT_WINDOWS[category], outerBand: dp.outer_band, rbiBand, holidays: dp.holidays });
  return e.ok ? want : e.nextEligibleAt;
}

/** "Sat 6:10 pm" in a zone, the same on every platform (Intl's own joining varies). */
export function dayTime(at: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(at).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toLowerCase()}`.trim();
}

/** "Calling back Sat 6:10 pm, as they asked" in the person's zone. */
export function callbackText(at: Date, tz: string, clamped: boolean): string {
  const when = dayTime(at, tz);
  return clamped ? `Calling back ${when}, the first time the calling hours allow after the time they asked` : `Calling back ${when}, as they asked`;
}
