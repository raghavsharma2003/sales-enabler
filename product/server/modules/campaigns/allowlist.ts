// The telephony allowlist: on a server that can reach a real carrier, the only numbers that may ever be sent to it.
//
//   VP_TELEPHONY_ALLOWED_TO   comma-separated numbers (any Indian shape; normalised to E.164). When set, every number
//                             that would go to the carrier must be in it: the person dialled (campaign, api, single, test,
//                             retry, callback), a verification announcement's target, and an agent's hand-off number.
//   VP_TELEPHONY_ALLOWLIST    'off' is the one explicit switch that opens a live server to every number (production,
//                             later, with the owner's go). Never set on staging (product/ops/STAGING.md).
//
// Without either, a server that may reach a carrier (VP_TELEPHONY_LIVE=1, or a real voice runtime at VP_RUNTIME_URL,
// which is the one that dials) refuses every phone number: live telephony cannot start without a list. A development or
// test server with neither talks only to fakes and is open.
import { normaliseIndianPhone } from '../../../shared/phone.ts';

export type AllowMode = { mode: 'list'; numbers: ReadonlySet<string>; invalid: string[] } | { mode: 'open' } | { mode: 'closed'; why: string };

export function allowMode(env: NodeJS.ProcessEnv = process.env): AllowMode {
  const raw = (env.VP_TELEPHONY_ALLOWED_TO ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (raw.length) {
    const numbers = new Set<string>(), invalid: string[] = [];
    for (const r of raw) {
      const n = normaliseIndianPhone(r);
      if (n.ok) numbers.add(n.e164); else invalid.push(`entry ${invalid.length + 1}: ${n.reason}`);   // never echo the entry
    }
    return { mode: 'list', numbers, invalid };
  }
  if ((env.VP_TELEPHONY_ALLOWLIST ?? '').trim().toLowerCase() === 'off') return { mode: 'open' };
  if (env.VP_TELEPHONY_LIVE === '1' || (env.VP_RUNTIME_URL ?? '').trim())
    return { mode: 'closed', why: 'this server can reach a carrier and VP_TELEPHONY_ALLOWED_TO is not set' };
  return { mode: 'open' };
}

/** Whether `e164` may be sent to the carrier. A number that does not normalise is never allowed under a list. */
export function mayDial(e164: string, env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; why: string } {
  const m = allowMode(env);
  if (m.mode === 'open') return { ok: true };
  if (m.mode === 'closed') return { ok: false, why: m.why };
  const n = normaliseIndianPhone(e164);
  return n.ok && m.numbers.has(n.e164) ? { ok: true } : { ok: false, why: 'the number is not on this server\'s telephony allowlist (VP_TELEPHONY_ALLOWED_TO)' };
}

/** The hand-off number an agent would bridge a caller to, if any: it reaches the carrier too, so it is checked like a dial. */
export function transferTarget(agent: { handOff?: { target?: { kind?: string; value?: string } } } | null | undefined): string | null {
  const t = agent?.handOff?.target;
  return t?.kind === 'phone' && t.value ? t.value : null;
}

export class NotAllowlisted extends Error {
  constructor(public why: string) { super(`refused before the carrier: ${why}`); this.name = 'NotAllowlisted'; }
}

/** Throws NotAllowlisted unless every number may be sent to the carrier. The adapter's last wall before a request leaves. */
export function assertMayDial(...numbers: (string | null | undefined)[]): void {
  for (const n of numbers) {
    if (!n) continue;
    const r = mayDial(n);
    if (!r.ok) throw new NotAllowlisted(r.why);
  }
}
