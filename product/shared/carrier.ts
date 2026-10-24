// What the carrier says happened to a phone call, in our words: the hang-up cause (Plivo's code, name and source, from
// the hang-up callback or the CDR), whether the person's phone ever rang, whether the attempt counts against the
// person's budget, the reason a buyer reads on the call page and the retry class. Pure, shared by the calls module's
// ingest (call.ended.carrier from the runtime), the control plane's carrier hang-up hook and the CDR sweep.
//
// Plivo hang-up causes: https://www.plivo.com/docs/voice/troubleshooting/hangup-causes (read 2026-10-24). The numeric
// code is the most precise; the name is the fallback. A refusal of a carrier TRIAL account (it may ring only numbers
// verified in its sandbox) has no documented code: it is recognised from the Call API's error text, and from a
// barred/forbidden cause while the account is a trial (VP_CARRIER_TRIAL=1). Not yet seen on a live call.

export type CarrierReason =
  | 'answered' | 'busy' | 'no_answer' | 'rejected' | 'invalid_number' | 'switched_off' | 'machine' | 'cancelled'
  | 'trial_restricted' | 'carrier_rejected' | 'network' | 'out_of_credit' | 'carrier_capacity' | 'our_error' | 'unknown';

export interface CarrierFacts {
  provider?: string; callUuid?: string; requestUuid?: string;
  hangupCauseName?: string; hangupCauseCode?: number | string; hangupSource?: string;
  durationS?: number; billDurationS?: number; ringS?: number; answeredBy?: 'human' | 'machine';
  dialError?: string;            // the Call API's refusal text when the dial never left (e.g. 'Plivo 400: ...')
  costInrMilli?: number;         // from the CDR's total_amount, when known
}

export interface CarrierOutcome {
  reason: CarrierReason;
  /** The person's phone rang (or was answered). False: the attempt never reached them and does not use their budget. */
  rang: boolean;
  /** The calls taxonomy code for the call page, for a call that did not reach her (null: the conversation decides). */
  reasonCode: string | null;
  /** The campaigns retry class (OutcomeClass) for a call that did not reach her, else null. */
  retryClass: string | null;
  /** One plain sentence for a buyer. */
  words: string;
}

const BY_CODE: Record<number, CarrierReason> = {
  4000: 'answered', 4010: 'answered', 4020: 'answered', 4030: 'answered', 6000: 'answered',
  3010: 'busy', 3100: 'busy',
  3000: 'no_answer', 6010: 'no_answer',
  3020: 'rejected', 3110: 'rejected',
  2000: 'invalid_number', 3050: 'invalid_number', 3120: 'invalid_number',
  2010: 'switched_off',
  9100: 'machine',
  1000: 'cancelled', 9000: 'cancelled',
  1010: 'out_of_credit',
  1020: 'carrier_capacity', 5030: 'carrier_capacity',
  2030: 'carrier_rejected', 2040: 'carrier_rejected', 2050: 'carrier_rejected', 2060: 'carrier_rejected', 2070: 'carrier_rejected',
  3030: 'carrier_rejected', 3040: 'carrier_rejected', 3130: 'carrier_rejected', 3140: 'carrier_rejected',
  3070: 'network', 3080: 'network', 3090: 'network', 5000: 'network', 5010: 'network', 5020: 'network', 6020: 'network', 2020: 'network',
  0: 'unknown',
};

const TRIAL_TEXT = /\b(trial|sandbox)\b|not (a )?verified|unverified|verify (the|this) (number|destination)/i;

function byName(name: string): CarrierReason | null {
  const c = name.toLowerCase().replace(/_/g, ' ');
  if (!c) return null;
  if (/machine/.test(c)) return 'machine';
  if (/busy/.test(c)) return 'busy';
  if (/reject|declin/.test(c)) return 'rejected';
  if (/unallocated|invalid destination|not exist|no route/.test(c)) return 'invalid_number';
  if (/out of service|absent|switched off|unreachable/.test(c)) return 'switched_off';
  if (/no answer|ring timeout|no user response/.test(c)) return 'no_answer';
  if (/out of credits?|insufficient credit/.test(c)) return 'out_of_credit';
  if (/barred|forbidden|caller id|spam|dno|media anchoring/.test(c)) return 'carrier_rejected';
  if (/network|timeout|congestion|internal|routing/.test(c)) return 'network';
  if (/answer url|action url|xml|redirect url|transfer url/.test(c)) return 'our_error';
  if (/cancel|lost race/.test(c)) return 'cancelled';
  if (/normal|end of xml|scheduled hangup|multiparty/.test(c)) return 'answered';
  return null;
}

const WORDS: Record<CarrierReason, string> = {
  answered: 'The call connected.',
  busy: 'The line was busy.',
  no_answer: 'The phone rang but nobody picked up.',
  rejected: 'They declined the call.',
  invalid_number: 'The number does not exist or is not in service.',
  switched_off: 'The phone was switched off or out of coverage.',
  machine: 'An answering machine or voicemail picked up.',
  cancelled: 'The call was cancelled before anyone answered.',
  trial_restricted: 'Our phone carrier is on a trial account and may ring only phones verified with it, so this phone was not rung.',
  carrier_rejected: 'The phone network refused the call (caller ID, barring or spam rules), so the phone did not ring.',
  network: 'The phone network failed to connect the call; the phone did not ring.',
  out_of_credit: 'The carrier account is out of credit, so the call was not placed.',
  carrier_capacity: 'The carrier refused the call because too many calls were running at once.',
  our_error: 'Vyakti could not answer the carrier in time, so the call ended; we look into these.',
  unknown: 'The carrier did not say why the call ended.',
};

/** reasonCode and retryClass for an ending that did not reach her. answered: null for both. */
const CODES: Record<CarrierReason, [string | null, string | null, boolean]> = {   // [taxonomy code, retry class, rang]
  answered: [null, null, true],
  busy: ['DIAL_BUSY', 'busy', true],
  no_answer: ['DIAL_NO_ANSWER', 'no_answer', true],
  rejected: ['DIAL_REJECTED', 'busy', true],
  invalid_number: ['DIAL_INVALID_NUMBER', 'invalid', false],
  switched_off: ['DIAL_SWITCHED_OFF', 'switched_off', false],
  machine: ['CONN_VOICEMAIL', 'voicemail', true],
  cancelled: ['DIAL_FAILED', 'provider_error', false],
  trial_restricted: ['DIAL_TRIAL_RESTRICTED', 'carrier_refused', false],
  carrier_rejected: ['DIAL_CARRIER_REJECTED', 'carrier_refused', false],
  network: ['DIAL_NETWORK', 'provider_error', false],
  out_of_credit: ['DIAL_FAILED', 'carrier_refused', false],
  carrier_capacity: ['DIAL_NETWORK', 'provider_error', false],
  our_error: ['DIAL_FAILED', 'provider_error', false],
  unknown: ['DIAL_FAILED', 'provider_error', false],
};

export function carrierOutcome(f: CarrierFacts, o: { trialAccount?: boolean } = {}): CarrierOutcome {
  const code = f.hangupCauseCode === undefined || f.hangupCauseCode === '' ? null : Number(f.hangupCauseCode);
  let reason: CarrierReason | null = null;
  if (f.dialError) reason = TRIAL_TEXT.test(f.dialError) ? 'trial_restricted' : byName(f.dialError) ?? 'carrier_rejected';
  else if (code !== null && Number.isFinite(code) && code in BY_CODE) reason = BY_CODE[code];
  else if (code !== null && code >= 7000 && code < 9000) reason = 'our_error';
  reason ??= byName(f.hangupCauseName ?? '') ?? 'unknown';
  if (o.trialAccount && (reason === 'carrier_rejected' || (reason === 'unknown' && !f.billDurationS))) reason = 'trial_restricted';
  if (f.answeredBy === 'machine' && reason === 'answered') reason = 'machine';
  // A billed call that the carrier closes "normally" was answered, whatever else; an unbilled "answered" never rang.
  if (reason === 'answered' && f.billDurationS === 0 && f.durationS === 0) reason = 'unknown';
  const [reasonCode, retryClass, rang] = CODES[reason];
  return { reason, rang, reasonCode, retryClass, words: WORDS[reason] };
}

/** What the call page shows from conversation.carrier: the carrier's own numbers and its reason in words. No carrier ids. */
export function carrierView(stored: unknown): {
  reason: CarrierReason; words: string; phoneRang: boolean; hangupCause: string | null; hangupSource: string | null;
  durationS: number | null; billedS: number | null; carrierCostInrMilli: number | null; from: string;
} | null {
  const s = stored as { facts?: CarrierFacts; outcome?: CarrierOutcome; cdr?: { billDurationS?: number | null; durationS?: number | null; totalInrMilli?: number | null; hangupCauseName?: string | null; hangupSource?: string | null }; source?: string } | null;
  if (!s || (!s.facts && !s.cdr)) return null;
  const f = s.facts ?? {}, o = s.outcome ?? carrierOutcome(f), cdr = s.cdr ?? {};
  return { reason: o.reason, words: o.words, phoneRang: o.rang, hangupCause: cdr.hangupCauseName ?? f.hangupCauseName ?? null, hangupSource: cdr.hangupSource ?? f.hangupSource ?? null,
    durationS: cdr.durationS ?? f.durationS ?? null, billedS: cdr.billDurationS ?? f.billDurationS ?? null,
    carrierCostInrMilli: cdr.totalInrMilli ?? f.costInrMilli ?? null, from: s.cdr ? 'carrier record' : s.source === 'runtime' ? 'carrier hang-up report (via the voice engine)' : 'carrier hang-up report' };
}
