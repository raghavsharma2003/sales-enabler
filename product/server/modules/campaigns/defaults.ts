// Campaign and dial-gate defaults, from research/2026-10-21/blueprint/modules/campaigns.md (§6, §7) and
// trust-telephony.md (§4-§6). Every number here is a product default [P] to tune on measured campaigns, unless the
// comment names a rule. The JSON defaults files the blueprint cites were not in the repo when this was written, so
// the values are transcribed from the module text.
import type { CallCategory } from '../../../shared/agent-config.ts';

export const GATE_VERSION = 'gate.2026-10-21.1';

/** HH:MM ranges; end < start means the range crosses midnight. Days are ISO weekdays, 1 = Monday .. 7 = Sunday. */
export interface TimeRange { start: string; end: string }
export interface WindowPolicy {
  days: number[];
  ranges: TimeRange[];
  crossMidnightReason?: string;      // required for a range that crosses midnight; set by Compliance
  nationalHolidaysOff?: boolean;     // default true: no calls on the national list
  holidays?: string[];               // extra 'YYYY-MM-DD' dates off for this campaign
}

export const DEFAULT_WINDOWS: Record<CallCategory, WindowPolicy> = {
  service: { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] },
  transactional: { days: [1, 2, 3, 4, 5, 6, 7], ranges: [{ start: '09:00', end: '21:00' }] },
  promotional: { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '21:00' }] },
};

/** Promotional 10:00-21:00, which no role can widen (RS-15). */
export const PROMOTIONAL_BAND: TimeRange = { start: '10:00', end: '21:00' };
/** No outbound attempt on any path, category or role between 22:00 and 07:00. */
export const QUIET_HOURS: TimeRange = { start: '22:00', end: '07:00' };
/** The workspace outer band for service/transactional: default 08:00-21:00; Compliance may set it inside 07:00-22:00. */
export const DEFAULT_OUTER_BAND: TimeRange = { start: '08:00', end: '21:00' };
export const OUTER_BAND_LIMIT: TimeRange = { start: '07:00', end: '22:00' };
/** RBI lending pack: 08:00-19:00 hard (RBI/2026-27/230 from 2027-01-01, applied now, RS-36). */
export const RBI_BAND: TimeRange = { start: '08:00', end: '19:00' };
/** Start cutoff: no new attempt in the last N minutes of a window (p90 connected duration; 8 min until measured). */
export const START_CUTOFF_MIN = 8;

/** National holidays off by default. Diwali moves each year. */
export const NATIONAL_HOLIDAYS_FIXED = ['01-26', '08-15', '10-02'];
export const NATIONAL_HOLIDAYS_DATED = ['2026-11-08', '2027-10-29', '2028-10-17'];

/** The A2P declaration deadline (RS-08): before it, an undeclared CLI is a warning; from it, the gate refuses. */
export const A2P_DUE = '2026-11-17T00:00:00+05:30';

export type OutcomeClass =
  | 'busy' | 'no_answer' | 'switched_off' | 'voicemail' | 'short_call' | 'provider_error' | 'dropped_by_vp'
  | 'callback' | 'relative_answered' | 'unknown' | 'opt_out' | 'wrong_party' | 'invalid' | 'operator_block' | 'completed';
export const OUTCOME_CLASSES: readonly OutcomeClass[] = ['busy', 'no_answer', 'switched_off', 'voicemail', 'short_call', 'provider_error',
  'dropped_by_vp', 'callback', 'relative_answered', 'unknown', 'opt_out', 'wrong_party', 'invalid', 'operator_block', 'completed'];

/** A step: minutes from now, or 'next_day' / 'next_day_other_half' (the gate then defers into the window), or 'stated'. */
export type LadderStep = number | 'next_day' | 'next_day_other_half' | 'stated';
export interface LadderRule { steps: LadderStep[]; countsToBudget: boolean }

/** Service default retry ladder (campaigns.md §7). Unknown is never automatic (HV law 17). */
export const RETRY_LADDER: Record<OutcomeClass, LadderRule> = {
  busy: { steps: [30, 120], countsToBudget: true },
  no_answer: { steps: [180, 'next_day_other_half'], countsToBudget: true },
  switched_off: { steps: [240, 'next_day'], countsToBudget: false },
  voicemail: { steps: [240, 'next_day'], countsToBudget: true },
  short_call: { steps: ['next_day_other_half'], countsToBudget: true },
  provider_error: { steps: [2, 10, 30], countsToBudget: false },
  dropped_by_vp: { steps: [5], countsToBudget: true },
  callback: { steps: ['stated', 'stated'], countsToBudget: true },
  relative_answered: { steps: ['stated'], countsToBudget: true },
  unknown: { steps: [], countsToBudget: true },
  opt_out: { steps: [], countsToBudget: true },
  wrong_party: { steps: [], countsToBudget: true },
  invalid: { steps: [], countsToBudget: true },
  operator_block: { steps: [], countsToBudget: true },
  completed: { steps: [], countsToBudget: true },
};

/** Attempts per person: a day, a week, a run. */
export interface PersonBudget { perDay: number; perWeek: number; perRun: number }
export const BUDGET_PRESETS: Record<string, PersonBudget> = {
  renewal: { perDay: 2, perWeek: 5, perRun: 6 },
  lending: { perDay: 2, perWeek: 6, perRun: 6 },
  subscription: { perDay: 1, perWeek: 3, perRun: 4 },
  promotional: { perDay: 1, perWeek: 3, perRun: 3 },
};
export const DEFAULT_PERSON_BUDGET = BUDGET_PRESETS.renewal;

/** Workspace ceiling (trust-telephony M4): rings per number a day across all campaigns and the API, and the gap. */
export const NUMBER_DAILY_CEILING = 3;
export const NUMBER_GAP_MIN = 120;
/** A declared 10-digit CLI gets 200 dials a day (operators flag short, many-recipient, low-incoming lines). */
export const TEN_DIGIT_CLI_DAILY_CAP = 200;

export const RING_TIMEOUT_S = 40;
/** Most a call may cost per connected minute when the campaign has no measured rate (a conservative ceiling for the hold). */
export const DEFAULT_PER_MINUTE_INR_MILLI = 6_000;
export const DEFAULT_MAX_DURATION_S = 600;
export const DEFAULT_CONCURRENCY = 10;
export const PREDIAL_TIMEOUT_MS = 800;
export const MEMORY_BRIEF_TIMEOUT_MS = 800;
/** A workspace's first campaign stops after this many dials for a person's review. */
export const FIRST_CAMPAIGN_REVIEW_STOP = 20;
/** Dispatch never confirmed after this long: the attempt becomes unknown and is never auto-retried. */
export const DISPATCH_STALE_MS = 2 * 60_000;

/** Estimate priors until a campaign has 50 calls of its own ("assumption, no history"). */
export const ESTIMATE_PRIORS = { attemptsPerPerson: 2.2, pConnect: 0.55, minutesPerConnect: 2.5, gst: 0.18 };
