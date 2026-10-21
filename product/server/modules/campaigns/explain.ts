// Plain words for people. Launch blockers and dial-gate refusals keep a stable machine `code`; the page shows `message`
// (one sentence a business owner understands, no tool ids or rule codes), an optional `why`, and a `fix` button.
// Developer detail (rule ids, raw reasons) stays in the precheck trace, never in these strings.
import type { CallCategory } from '../../../shared/agent-config.ts';
import type { GateCode } from './gate.ts';
import type { Series } from './telephony.ts';

export type Role = 'owner' | 'builder' | 'operator' | 'compliance';
export interface Fix { tool: string; label: string; role: Role }
export interface Explained { code: string; message: string; why?: string; fix?: Fix }

const GET_NUMBER: Fix = { tool: 'number.search', label: 'Get a number', role: 'owner' };
const CATEGORY_WORDS: Record<CallCategory, string> = { service: 'service', transactional: 'transaction', promotional: 'sales' };

export function lineNeeded(series: Series): Pick<Explained, 'message' | 'why'> {
  switch (series) {
    case '1600': return { message: 'You need a 1600-series number. Regulated businesses must call customers from one.',
      why: 'Banks, lenders, insurers and investment firms have to make service calls from 1600 numbers under TRAI rules.' };
    case '1601': return { message: 'You need a 1601-series number for these calls.', why: 'Utilities and logistics companies call customers from 1601 numbers.' };
    case '140': return { message: 'You need a 140-series number for sales calls.', why: 'TRAI requires promotional calls to come from 140 numbers.' };
    default: return { message: 'You need a phone number to call from.', why: 'It must be declared with your telecom operator for automated calls.' };
  }
}

/** A window validation error ("M3.<rule>: ...") in plain words. */
export function windowProblem(raw: string): Pick<Explained, 'message' | 'why'> {
  const rule = /^(?:[\w.[\]]+: )?(M3\.\w+)/.exec(raw)?.[1] ?? '';
  switch (rule) {
    case 'M3.promotional_band': return { message: 'Sales calls can only be made between 10 am and 9 pm.', why: 'This limit comes from TRAI and no setting can widen it.' };
    case 'M3.promotional_cross_midnight': return { message: 'Sales calls cannot run past midnight.', why: 'TRAI allows promotional calls only between 10 am and 9 pm.' };
    case 'M3.cross_midnight_role':
    case 'M3.cross_midnight_reason': return { message: 'Calling hours that run past midnight need approval from your compliance lead, with a reason.' };
    case 'M3.outer_band': return { message: 'Calling hours must stay between 7 am and 10 pm.', why: 'Nobody is called during the night, on any kind of call.' };
    default: return { message: 'These calling hours are not allowed for this kind of call.', why: 'Indian rules limit when businesses may call people.' };
  }
}

const fmtWhen = (d: Date, tz: string) => {
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d); }
  catch { return d.toISOString(); }
};

/** One gate refusal in plain words, for the call page, attempt lists and test results. */
export function explainRefusal(code: GateCode, detail: string | undefined, o: { next?: Date | null; tz?: string; category?: CallCategory; series?: Series } = {}): Explained {
  const d = detail ?? '';
  const when = o.next ? fmtWhen(o.next, o.tz ?? 'Asia/Kolkata') : null;
  if (code.startsWith('suppressed:')) {
    const campaignOnly = code === 'suppressed:campaign';
    return { code, message: campaignOnly ? 'This person asked not to be called for this campaign.' : 'This person asked not to be called.',
      why: campaignOnly ? undefined : 'We never call them again from this workspace unless your compliance lead lifts it with evidence.' };
  }
  switch (code) {
    case 'workspace_not_verified': return { code, message: 'Your business is not verified for real calls yet.', why: 'Add your company\'s DLT registration; test calls to your own phone work meanwhile.',
      fix: { tool: 'brand.update', label: 'Add DLT registration', role: 'owner' } };
    case 'identifier_invalid': return { code, message: 'This phone number is not a valid Indian number.', fix: undefined };
    case 'destination_blocked': return /test calls/.test(d)
      ? { code, message: 'Test calls only ring a phone you have verified.', fix: { tool: 'member.phone.verify_start', label: 'Verify your phone', role: 'operator' } }
      : { code, message: 'We do not call this number.', why: 'Only Indian numbers can be called; international, premium-rate and short-code numbers are blocked.' };
    case 'erased': return { code, message: 'This person asked to be forgotten, so they are never called.' };
    case 'no_basis':
      if (/withdrawn/.test(d)) return { code, message: 'This person withdrew their permission to be called.' };
      if (/stale/.test(d)) return { code, message: 'This person\'s Do Not Disturb check is out of date, so the sales call waits.', why: 'We check the national list again before calling.' };
      if (/DND status/.test(d)) return { code, message: 'We could not confirm this number is off the Do Not Disturb list, so the sales call is on hold.',
        why: 'Sales calls need a fresh check against the national Do Not Disturb list.' };
      return o.category === 'promotional'
        ? { code, message: 'You do not have this person\'s permission for sales calls.', why: 'Sales calls need clear, recorded consent.' }
        : { code, message: 'There is no record that this person is your customer or agreed to be called.', why: 'Service calls are for people who already have a relationship with you.' };
    case 'consent_expired': return /unreadable/.test(d)
      ? { code, message: 'This person\'s consent has an expiry date we cannot read, so we did not call.', why: 'Re-record the consent with a clear date.' }
      : { code, message: 'This person\'s consent has expired.' };
    case 'dnd_blocked_by_operator': return { code, message: 'This number is on the national Do Not Disturb list.', why: 'Sales calls to it need consent registered with the telecom operator.' };
    case 'out_of_window': return { code, message: when ? `It is outside calling hours for this person. We will try again ${when}.` : 'It is outside calling hours for this person, and no calling time is left in this campaign.',
      why: 'Calls happen only inside the campaign\'s hours in the person\'s own time, never at night.' };
    case 'budget_exhausted': return { code, message: when ? `This person has been called enough for now. The next try is ${when}.` : 'This person has been called as many times as this campaign allows.',
      why: 'Limiting repeat calls protects people\'s patience and your number\'s reputation.' };
    case 'cli_wrong_series': return { code, ...(o.series ? lineNeeded(o.series) : { message: 'You need a different kind of number for these calls.' }), fix: GET_NUMBER };
    case 'cli_undeclared': return { code, message: 'Your number is not declared for automated calls yet.', why: 'From 17 November 2026 every number making AI calls must be declared on DLT.',
      fix: { tool: 'number.a2p.declare', label: 'Record the declaration', role: 'compliance' } };
    case 'cli_paused': return { code, message: 'Your calling number is paused.', why: 'Calls wait until someone checks the number and resumes it.' };
    case 'kyc_lapsed': return { code, message: 'Your number\'s KYC is not verified yet.', why: 'The telecom operator must verify your documents before the number can call customers; this usually takes 7 to 14 business days.' };
    case 'cap_reached': return { code, message: 'This campaign reached its spending limit, so it paused.', fix: { tool: 'cap.raise', label: 'Raise the limit', role: 'owner' } };
    case 'wallet_low': return { code, message: 'Your wallet balance is too low for this call.', fix: { tool: 'wallet.topup', label: 'Add money', role: 'owner' } };
    case 'version_not_publishable': return /beta/.test(d)
      ? { code, message: 'The voice this agent uses is still in beta, so it can only make test calls.', fix: { tool: 'stack.set', label: 'Choose a voice', role: 'builder' } }
      : /built for/.test(d)
        ? { code, message: 'This agent was built for a different kind of call than this one.', fix: { tool: 'version.publish', label: 'Publish a matching version', role: 'builder' } }
        : { code, message: 'This agent is not ready to make calls yet.', fix: { tool: 'version.publish', label: 'Publish the agent', role: 'builder' } };
    case 'pack_missing': return { code, message: 'This agent needs industry rules your workspace has not turned on yet.' };
    case 'predial_veto': return { code, message: 'Your own system asked us not to call this person.' };
    case 'predial_timeout': return { code, message: 'Your system did not answer in time, so we did not call.', why: 'We only call when your check says yes.' };
    case 'deferred_concurrency': return { code, message: 'All your lines are busy right now. We will call shortly.' };
    case 'check_unavailable': return { code, message: 'A safety check could not run, so we did not call. We will try again in a few minutes.' };
    default: return { code, message: 'This call was not placed.' };
  }
}

export const categoryWord = (c: CallCategory) => CATEGORY_WORDS[c];
