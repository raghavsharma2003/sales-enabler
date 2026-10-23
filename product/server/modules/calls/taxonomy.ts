// The fixed reason-code catalogue: every attempt and call gets exactly one business reason, in Indian
// terms, with the action that fixes it. Code decides the reason for anything the engine already knows
// (no answer, busy, max cost, crisis hand-off); the analysis model may only pick a `conversation` code,
// and only for a call that connected. Codes are stable identifiers; labels may be reworded.
import type { EndReason } from '../../../shared/runtime-protocol.ts';

export type Stage = 'precheck' | 'dial' | 'connected' | 'conversation';

export interface ReasonCode { code: string; stage: Stage; label: string; action: string; charged: boolean }

export const REASON_CODES: readonly ReasonCode[] = [
  { code: 'PRE_NUMBER_INVALID', stage: 'precheck', label: 'The number is not a valid Indian phone number', action: 'Fix the number in the contact list', charged: false },
  { code: 'PRE_DND', stage: 'precheck', label: 'The person is on the DND register for this category', action: 'Only service or transactional calls may go; check the category', charged: false },
  { code: 'PRE_SUPPRESSED', stage: 'precheck', label: 'The person asked not to be called', action: 'None; the opt-out is respected', charged: false },
  { code: 'PRE_WINDOW', stage: 'precheck', label: 'Outside the allowed calling hours', action: 'It will be tried at the next allowed slot', charged: false },
  { code: 'PRE_NO_CONSENT', stage: 'precheck', label: 'No consent or contract on record for this purpose', action: 'Add the consent basis for this contact', charged: false },
  { code: 'PRE_WALLET_LOW', stage: 'precheck', label: 'The wallet did not have enough balance', action: 'Top up the wallet', charged: false },
  { code: 'PRE_CAP_REACHED', stage: 'precheck', label: 'A spend cap was reached', action: 'Raise the cap or wait for the next period', charged: false },
  { code: 'PRE_ATTEMPTS_EXHAUSTED', stage: 'precheck', label: 'All allowed attempts were used', action: 'None; the retry ladder is complete', charged: false },
  { code: 'DIAL_NO_ANSWER', stage: 'dial', label: 'The phone rang but nobody picked up', action: 'Retried per the ladder at a different hour', charged: false },
  { code: 'DIAL_BUSY', stage: 'dial', label: 'The line was busy', action: 'Retried per the ladder', charged: false },
  { code: 'DIAL_SWITCHED_OFF', stage: 'dial', label: 'The phone was switched off or out of coverage', action: 'Retried later; check the number if it repeats', charged: false },
  { code: 'DIAL_CARRIER_REJECTED', stage: 'dial', label: 'The carrier refused the call (caller ID or DLT)', action: 'Check the caller ID series and DLT registration', charged: false },
  { code: 'DIAL_OPERATOR_ANNOUNCEMENT', stage: 'dial', label: 'An operator announcement played instead of a person', action: 'Check the number; retried per the ladder', charged: false },
  { code: 'DIAL_FAILED', stage: 'dial', label: 'The call could not be placed', action: 'Look at the carrier code; retried once', charged: false },
  { code: 'CONN_VOICEMAIL', stage: 'connected', label: 'Voicemail or an answering machine picked up', action: 'Retried per the ladder', charged: true },
  { code: 'CONN_SILENCE', stage: 'connected', label: 'Connected, but nobody spoke', action: 'Retried later', charged: true },
  { code: 'CONN_ENGINE_ERROR', stage: 'connected', label: 'Our voice engine failed during the call', action: 'Vyakti investigates; the call is not charged as an outcome', charged: true },
  { code: 'CONN_MAX_DURATION', stage: 'connected', label: 'The call reached its time limit', action: 'Raise the limit or shorten the agenda', charged: true },
  { code: 'CONN_MAX_COST', stage: 'connected', label: 'The call reached its cost limit', action: 'Raise the per-call cost limit', charged: true },
  { code: 'END_EARLY_HANGUP', stage: 'conversation', label: 'The person hung up in the first seconds', action: 'Listen to the opening; consider a test of a new opener', charged: true },
  { code: 'END_HUNG_UP_MID', stage: 'conversation', label: 'The person hung up partway through', action: 'Play the moment they left', charged: true },
  { code: 'END_TOOL_ERROR', stage: 'conversation', label: 'A tool the agent needed failed', action: 'Fix and test the named tool', charged: true },
  { code: 'END_HANDED_OFF', stage: 'conversation', label: 'Handed to a human as configured', action: 'Check the human picked up', charged: true },
  { code: 'END_CRISIS', stage: 'conversation', label: 'Crisis words were heard; help lines given and a human alerted', action: 'Follow up as the issue says', charged: true },
  { code: 'END_OPTED_OUT', stage: 'conversation', label: 'The person asked not to be called again', action: 'None; they are suppressed', charged: true },
  { code: 'CONV_GOAL_DONE', stage: 'conversation', label: 'The agenda was completed', action: 'None', charged: true },
  { code: 'CONV_CALLBACK', stage: 'conversation', label: 'The person asked to be called back', action: 'A callback is scheduled', charged: true },
  { code: 'CONV_NOT_INTERESTED', stage: 'conversation', label: 'The person said they are not interested', action: 'None; read the objection', charged: true },
  { code: 'CONV_WRONG_PERSON', stage: 'conversation', label: 'Someone other than the intended person answered', action: 'Check the contact record', charged: true },
  { code: 'CONV_LANGUAGE_MISMATCH', stage: 'conversation', label: 'The person could not follow the language', action: 'Add their language to the agent', charged: true },
  { code: 'CONV_CONFUSED', stage: 'conversation', label: 'The person was confused by what she said', action: 'Read the turn where it went wrong', charged: true },
  { code: 'CONV_OBJECTION_UNRESOLVED', stage: 'conversation', label: 'An objection was raised and not resolved', action: 'Add an approach for this objection', charged: true },
  { code: 'CONV_COMPLAINT', stage: 'conversation', label: 'The person complained about the call or the business', action: 'Read the complaint; a person follows up', charged: true },
  { code: 'CONV_NEEDS_HUMAN', stage: 'conversation', label: 'The person needs a human to finish this', action: 'Route to the team', charged: true },
  { code: 'CONV_INCOMPLETE', stage: 'conversation', label: 'The call ended before the agenda was done', action: 'Read the summary', charged: true },
];

const BY_CODE = new Map(REASON_CODES.map(r => [r.code, r]));
export const reasonFor = (code: string | null | undefined): ReasonCode | undefined => (code ? BY_CODE.get(code) : undefined);
export const CONVERSATION_CODES = REASON_CODES.filter(r => r.stage === 'conversation').map(r => r.code);

/** End reasons where no person was reached: the call never connected. */
export const NOT_CONNECTED: ReadonlySet<EndReason> = new Set(['no_answer', 'busy', 'failed']);

export const EARLY_HANGUP_S = 10;

/** The reason code decided by code alone from what the engine reported. */
export function codeReason(end: EndReason, durationS: number, callerTurns: number): string {
  switch (end) {
    case 'no_answer': return 'DIAL_NO_ANSWER';
    case 'busy': return 'DIAL_BUSY';
    case 'failed': return 'DIAL_FAILED';
    case 'voicemail': return 'CONN_VOICEMAIL';
    case 'silence_timeout': return callerTurns ? 'CONV_INCOMPLETE' : 'CONN_SILENCE';
    case 'error': return 'CONN_ENGINE_ERROR';
    case 'max_duration': return 'CONN_MAX_DURATION';
    case 'max_cost': return 'CONN_MAX_COST';
    case 'handed_off': return 'END_HANDED_OFF';
    case 'crisis_handoff': return 'END_CRISIS';
    case 'opt_out': return 'END_OPTED_OUT';
    case 'caller_hung_up': return durationS < EARLY_HANGUP_S ? 'END_EARLY_HANGUP' : 'END_HUNG_UP_MID';
    case 'completed': case 'agent_ended': return 'CONV_INCOMPLETE';   // the analysis may refine this from the transcript
  }
}

/** Codes the analysis may replace: the engine knows the call ended normally but not why in business terms. */
export const REFINABLE: ReadonlySet<string> = new Set(['CONV_INCOMPLETE', 'END_HUNG_UP_MID']);
