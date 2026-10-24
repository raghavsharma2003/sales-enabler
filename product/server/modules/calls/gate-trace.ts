// "Why this call was allowed" (must-be decision 5): the dial gate's own record for the attempt that placed this call
// (attempt.precheck, written by campaigns' worker in the claim transaction), in plain words, on call.get, call.explain
// and the call page. Read only: nothing here re-runs a check. Rule ids stay in the stored trace for developers; people
// read sentences. A browser test call placed from the builder never passes the dial gate (it rings nobody), and says so.
import type { Queryable } from '../../db.ts';
import { one } from '../../db.ts';

type Check = { gate: string; ok: boolean; code?: string; detail?: string };
export interface AllowedBy {
  /** null: no dial-gate record for this call (a browser test call, or one placed before the gate recorded its trace). */
  allowed: boolean | null;
  at: string | null; gateVersion: string | null;
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

/** A gate warning in plain words: no number ids or rule names. */
function warningWords(w: string): string {
  const due = /from (\d{4}-\d{2}-\d{2}) the gate refuses it/.exec(w)?.[1];
  if (/not A2P-declared/.test(w)) return `The number it called from is not yet declared for automated calls with the telecom operator${due ? `; from ${new Date(due + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })} such calls will be refused` : ''}.`;
  return 'A note for the team that runs this server was recorded with this call.';
}

export function allowedByWords(precheck: Record<string, any> | null, test: boolean): AllowedBy {
  const trace: Check[] = Array.isArray(precheck?.trace) ? precheck!.trace : [];
  if (!precheck || !trace.length) return { allowed: null, at: null, gateVersion: null, checks: [], warnings: [],
    summary: test ? 'A practice call from the agent builder: it rang no one, so it did not pass the dial gate.' : 'No dial-gate record is stored for this call.' };
  const checks = trace.map(t => ({ gate: t.gate, ok: !!t.ok,
    text: t.ok ? ((test ? PASSED[t.gate]?.[1] : undefined) ?? PASSED[t.gate]?.[0] ?? 'A check passed.') : (precheck.explain?.message ?? 'A check refused the call.') }));
  const allowed = precheck.allowed === true;
  return { allowed, at: precheck.at ?? null, gateVersion: precheck.gateVersion ?? null, checks,
    warnings: Array.isArray(precheck.warnings) ? precheck.warnings.filter((w: unknown): w is string => typeof w === 'string').map(warningWords) : [],
    summary: allowed ? `Every one of the ${checks.length} checks before dialling passed.` : (precheck.explain?.message ?? 'A check before dialling refused it.') };
}

/** The dial-gate record of the attempt that placed this conversation, in the workspace. */
export async function allowedByFor(q: Queryable, workspaceId: string, c: { id: string; attempt_id: string | null; channel: string }): Promise<AllowedBy> {
  const a = c.attempt_id ? await one<{ precheck: Record<string, any> | null; kind: string }>(q,
    'SELECT precheck, kind FROM attempt WHERE id = $1 AND workspace_id = $2', [c.attempt_id, workspaceId]) : null;
  return allowedByWords(a?.precheck ?? null, (a?.kind ?? (c.channel === 'test' ? 'test' : '')) === 'test');
}
