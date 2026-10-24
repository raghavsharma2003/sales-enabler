// "Why this call was allowed" (must-be decision 5): the dial gate's own record for the attempt that placed this call
// (attempt.precheck, written by campaigns' worker in the claim transaction), in plain words, on call.get, call.explain
// and the call page. Read only: nothing here re-runs a check. Rule ids stay in the stored trace for developers; people
// read sentences. A browser test call placed from the builder never passes the dial gate (it rings nobody), and says so.
import type { Queryable } from '../../db.ts';
import { one } from '../../db.ts';

type Check = { gate: string; ok: boolean; code?: string; detail?: string; note?: Record<string, any> };
export interface AllowedBy {
  /** null: no dial-gate record for this call (a browser test call, or one placed before the gate recorded its trace). */
  allowed: boolean | null;
  at: string | null; gateVersion: string | null;
  /** The gate version in words for the page ('the dial gate of 21 October 2026, revision 1'); gateVersion stays for developers. */
  gateText: string | null;
  checks: { gate: string; ok: boolean; text: string }[];
  warnings: string[];
  summary: string;
}

const PASSED: Record<string, [real: string, test?: string]> = {
  G1: ['The business is verified for real calls (its DLT registration is on file).', 'A test call: it could only ring a phone a team member verified.'],
  G2: ['The number is a valid Indian number that may be called.'],
  G3: ['The person has not asked to be erased.'],
  G4: ['The person has not asked not to be called.'],
  G5: ['There is a basis to call them for this kind of call, and Do Not Disturb does not block it.', 'The phone belongs to the team member who verified it.'],
  G6: ['It was inside the calling hours allowed for this kind of call.', 'It was inside the hours when nobody is called at night.'],
  G7: ['It stayed within the limits on how often one person and one number are called.', 'Test calls do not count towards how often a person is called.'],
  G8: ['It went out from a declared number of the right series for this kind of call.'],
  G9: ['Money for the call was held in the wallet, within the spend caps.'],
  G10: ['A published version of the agent, which passed its checks, made the call.'],
  G11: ['Your own pre-dial check, if one is set, did not object.'],
  G12: ['A calling line was free.'],
};

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CATEGORY: Record<string, string> = { service: 'a service call', transactional: 'a transactional call', promotional: 'a promotional call' };
const BASIS: Record<string, string> = { consent: 'their consent', contract: 'an existing relationship with the business', legitimate_use: 'a legitimate use the business declared' };
const DND: Record<string, string> = { not_registered: 'not registered on the Do Not Disturb list', registered: 'registered on the Do Not Disturb list, with consent registered for it' };
const istDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
/** A zone id in words: India time for Asia/Kolkata, else the zone's own long name. */
function zoneWords(z: string): string {
  if (z === 'Asia/Kolkata') return 'India time';
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: z, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? 'their own time zone'; }
  catch { return 'their own time zone'; }
}
/** 'gate.2026-10-21.1' -> 'the dial gate of 21 October 2026, revision 1'. */
export function gateWords(v: string | null): string | null {
  const m = v ? /(\d{4}-\d{2}-\d{2})(?:\.(\d+))?/.exec(v) : null;
  return m ? `the dial gate of ${istDate(m[1] + 'T12:00:00+05:30')}${m[2] ? `, revision ${m[2]}` : ''}` : v ? 'the dial gate' : null;
}
const rupees = (milli: number) => `Rs ${(milli / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
function days(d: number[]): string {
  const s = [...new Set(d)].filter(x => x >= 1 && x <= 7).sort();
  if (s.length === 7) return 'every day';
  const run = s.length > 1 && s.every((x, i) => i === 0 || x === s[i - 1] + 1);
  return run ? `${DAY[s[0]]} to ${DAY[s[s.length - 1]]}` : s.map(x => DAY[x]).join(', ');
}

/** A passing check's stored note in words. Only what the gate wrote is read; a trace from before notes keeps the fixed sentence. */
function noteWords(gate: string, n: Record<string, any> | undefined, test: boolean): string | null {
  if (!n || test) return null;
  if (gate === 'G4' && Array.isArray(n.lists))
    return `The number is on no do-not-call list: the workspace's${n.lists.includes('campaign') ? ', the campaign\'s' : ''}${n.ownDnd ? ' and the business\'s own' : ''}.`;
  if (gate === 'G5' && n.basis && CATEGORY[n.category]) {
    const dnd = n.dnd === 'not_required' ? 'Do Not Disturb does not apply to it'
      : `the number was ${DND[n.dnd] ?? 'checked on the Do Not Disturb list'}${n.dndCheckedAt ? ` (checked ${istDate(n.dndCheckedAt)})` : ''}`;
    return `It was ${CATEGORY[n.category]}, on the basis of ${BASIS[n.basis] ?? 'a record on file'}${n.purpose ? ` (recorded for: ${String(n.purpose).replace(/_/g, ' ')})` : ''}; ${dnd}.`;
  }
  if (gate === 'G6' && Array.isArray(n.ranges) && Array.isArray(n.days)) {
    const hours = n.ranges.map((r: { start: string; end: string }) => `${r.start} to ${r.end}`).join(' and ');
    const zones = (n.zones ?? []) as string[];
    return `It was inside the calling hours for ${CATEGORY[n.category] ?? 'this kind of call'}: ${hours}, ${days(n.days)}${n.holidaysOff ? ', not on national holidays' : ''}, in the person's time (${zoneWords(zones[0] ?? 'Asia/Kolkata')})${zones.includes('Asia/Kolkata') && zones[0] !== 'Asia/Kolkata' ? ', and inside the hours the telecom rules allow in India time' : ''}.`;
  }
  if (gate === 'G7' && typeof n.numberToday === 'number')
    return `The number had been rung ${n.numberToday} time${n.numberToday === 1 ? '' : 's'} today, under the limit of ${n.numberCeiling}${n.person ? `; this campaign had called the person ${n.person.day} time${n.person.day === 1 ? '' : 's'} today and ${n.person.week} in 7 days, under its limits of ${n.person.budget?.perDay} and ${n.person.budget?.perWeek}` : ''}.`;
  if (gate === 'G9' && typeof n.heldInrMilli === 'number') {
    const caps = ((n.caps ?? []) as string[]).map(c => c === 'api_key' ? "the API key's" : `the ${c}'s`);
    return `${rupees(n.heldInrMilli)} was held in the wallet for up to ${Math.round((n.maxDurationS ?? 0) / 60)} minutes, within ${caps.length > 1 ? caps.slice(0, -1).join(', ') + ' and ' + caps[caps.length - 1] : caps[0] ?? 'the'} spend cap${caps.length > 1 ? 's' : ''}.`;
  }
  return null;
}

/** A gate warning in plain words: no number ids or rule names. */
function warningWords(w: string): string {
  const due = /from (\d{4}-\d{2}-\d{2}) the gate refuses it/.exec(w)?.[1];
  if (/not A2P-declared/.test(w)) return `The number it called from is not yet declared for automated calls with the telecom operator${due ? `; from ${new Date(due + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })} such calls will be refused` : ''}.`;
  return 'A note for the team that runs this server was recorded with this call.';
}

export function allowedByWords(precheck: Record<string, any> | null, test: boolean): AllowedBy {
  const trace: Check[] = Array.isArray(precheck?.trace) ? precheck!.trace : [];
  if (!precheck || !trace.length) return { allowed: null, at: null, gateVersion: null, gateText: null, checks: [], warnings: [],
    summary: test ? 'A practice call from the agent builder: it rang no one, so it did not pass the dial gate.' : 'No dial-gate record is stored for this call.' };
  const checks = trace.map(t => ({ gate: t.gate, ok: !!t.ok,
    text: t.ok ? (noteWords(t.gate, t.note, test) ?? (test ? PASSED[t.gate]?.[1] : undefined) ?? PASSED[t.gate]?.[0] ?? 'A check passed.') : (precheck.explain?.message ?? 'A check refused the call.') }));
  const allowed = precheck.allowed === true;
  return { allowed, at: precheck.at ?? null, gateVersion: precheck.gateVersion ?? null, gateText: gateWords(precheck.gateVersion ?? null), checks,
    warnings: Array.isArray(precheck.warnings) ? precheck.warnings.filter((w: unknown): w is string => typeof w === 'string').map(warningWords) : [],
    summary: allowed ? `Every one of the ${checks.length} checks before dialling passed.` : (precheck.explain?.message ?? 'A check before dialling refused it.') };
}

/** The dial-gate record of the attempt that placed this conversation, in the workspace. */
export async function allowedByFor(q: Queryable, workspaceId: string, c: { id: string; attempt_id: string | null; channel: string }): Promise<AllowedBy> {
  const a = c.attempt_id ? await one<{ precheck: Record<string, any> | null; kind: string }>(q,
    'SELECT precheck, kind FROM attempt WHERE id = $1 AND workspace_id = $2', [c.attempt_id, workspaceId]) : null;
  return allowedByWords(a?.precheck ?? null, (a?.kind ?? (c.channel === 'test' ? 'test' : '')) === 'test');
}
