// Numbers: the series router (which CLI series a call may present) and the telephony provider seam for search,
// rent, KYC and bring-your-own lines. Tests use FakeTelephony; the real adapter is off unless VP_TELEPHONY_LIVE=1
// and its credentials are set, so no test and no dev server can ever reach a paid carrier API.
import { SetupError } from '../../setup-error.ts';
import { randomUUID } from 'node:crypto';
import type { CallCategory, SectorPack } from '../../../shared/agent-config.ts';

export const SERIES = ['ten_digit', '140', '1600', '1601', 'trial'] as const;
export type Series = (typeof SERIES)[number];

/** Sector packs whose regulator mandates 1600xx for service and transactional calls, even with consent (REG-20, RS-07). */
const MANDATED_1600: readonly SectorPack[] = ['insurance_irdai', 'lending_rbi', 'securities_sebi'];
/** Workspace sectors that move to 1601xx (utilities and logistics, migration about 2026-11-08). */
const SECTORS_1601 = ['utilities', 'logistics'];

export interface RouteInput { category: CallCategory; sectorPacks: readonly string[]; workspaceSector?: string | null; test?: boolean }
export interface Route { series: Series; rule: string; alsoAllowed: Series[] }

/** trust-telephony §4.1. The dial gate refuses any CLI outside the route. Test calls may also use a trial line. */
export function routeSeries(r: RouteInput): Route {
  const also: Series[] = r.test ? ['trial'] : [];
  if (r.category === 'promotional') return { series: '140', rule: 'RS-07/RS-15 promotional on 140xx only', alsoAllowed: also };
  if (r.sectorPacks.some(p => (MANDATED_1600 as readonly string[]).includes(p))) return { series: '1600', rule: 'REG-20 regulated entity: 1600xx for service and transactional', alsoAllowed: also };
  if (r.workspaceSector && SECTORS_1601.includes(r.workspaceSector)) return { series: '1601', rule: 'L1 claim 10: utilities and logistics on 1601xx', alsoAllowed: also };
  return { series: 'ten_digit', rule: 'RS-07 declared 10-digit for everyone else', alsoAllowed: also };
}

// ---- provider seam ----

export interface NumberOffer { e164: string; series: Series; carrier: string; region?: string; monthlyRentInrMilli: number | null; ref: string }
export interface KycDocument { kind: string; ref: string }   // a reference to a stored document, never the document itself

export interface TelephonyProvider {
  readonly name: string;
  search(q: { series?: Series; region?: string; limit: number }): Promise<NumberOffer[]>;
  rent(offerRef: string): Promise<{ e164: string; providerRef: string; series: Series; carrier: string; monthlyRentInrMilli: number | null }>;
  submitKyc(providerRef: string, docs: KycDocument[]): Promise<{ ref: string }>;
  connectByo(input: { e164: string; carrier: string; trunkRef: string }): Promise<{ providerRef: string }>;
  /** A fixed system announcement (no agent, no model): ring `to` from `from` and speak `lines` in order, then hang up. */
  systemCall(input: { to: string; from: string; lines: string[] }): Promise<{ ref: string }>;
}

/** No live carrier on this server. Members read plain words and code telephony_disabled; the operator's hint is logged. */
export class TelephonyDisabled extends SetupError {
  constructor(what: string) {
    super('Phone lines are not switched on for this workspace yet, so numbers cannot be searched, rented or rung from here. Practice callers and browser test calls work without one.',
      'telephony_disabled', `telephony provider is not enabled (${what}); set VP_TELEPHONY_LIVE=1 with the carrier credentials`);
    this.name = 'TelephonyDisabled';
  }
}

/** Synthetic numbers in the 90000000xx test range. Never dials, never charges. */
export class FakeTelephony implements TelephonyProvider {
  readonly name = 'fake';
  rented: string[] = [];
  kyc: { providerRef: string; docs: KycDocument[] }[] = [];
  async search(q: { series?: Series; region?: string; limit: number }): Promise<NumberOffer[]> {
    const series = q.series ?? 'ten_digit';
    return Array.from({ length: Math.min(q.limit, 5) }, (_, i) => ({
      e164: `+9190000000${String(10 + i).padStart(2, '0')}`, series, carrier: 'fake', region: q.region ?? 'IN',
      monthlyRentInrMilli: 59_000, ref: `fake:${series}:${i}`,
    }));
  }
  async rent(ref: string) {
    const [, series, i] = ref.split(':');
    this.rented.push(ref);
    return { e164: `+9190000000${String(10 + Number(i)).padStart(2, '0')}`, providerRef: `fake-num-${randomUUID()}`, series: (series as Series) ?? 'ten_digit', carrier: 'fake', monthlyRentInrMilli: 59_000 };
  }
  async submitKyc(providerRef: string, docs: KycDocument[]) { this.kyc.push({ providerRef, docs }); return { ref: `fake-kyc-${this.kyc.length}` }; }
  async connectByo(i: { e164: string; carrier: string; trunkRef: string }) { return { providerRef: `fake-byo-${i.trunkRef}` }; }
  systemCalls: { to: string; from: string; lines: string[] }[] = [];
  async systemCall(i: { to: string; from: string; lines: string[] }) { this.systemCalls.push(i); return { ref: `fake-sys-${randomUUID()}` }; }
}

/** Plivo India adapter, off by default. Endpoint shapes follow Plivo's public REST API and are NOT verified against a
 *  live India account (KC5: rental in the tenant's name is still in the carrier quote round). */
export class PlivoTelephony implements TelephonyProvider {
  readonly name = 'plivo';
  private readonly id = process.env.PLIVO_AUTH_ID ?? '';
  private readonly token = process.env.PLIVO_AUTH_TOKEN ?? '';
  private enabled(what: string) {
    if (process.env.VP_TELEPHONY_LIVE !== '1' || !this.id || !this.token || process.env.NODE_ENV === 'test') throw new TelephonyDisabled(what);
  }
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const r = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(this.id)}${path}`, {
      method, signal: AbortSignal.timeout(10_000), body: body ? JSON.stringify(body) : undefined,
      headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from(`${this.id}:${this.token}`).toString('base64') },
    });
    if (!r.ok) throw new Error(`plivo ${path} returned ${r.status}`);
    return r.json();
  }
  async search(q: { series?: Series; region?: string; limit: number }): Promise<NumberOffer[]> {
    this.enabled('search');
    const j = await this.call('GET', `/PhoneNumber/?country_iso=IN&limit=${q.limit}${q.region ? `&region=${encodeURIComponent(q.region)}` : ''}`);
    return (j.objects ?? []).map((o: any) => ({ e164: '+' + String(o.number), series: q.series ?? 'ten_digit', carrier: 'plivo', region: o.region,
      monthlyRentInrMilli: o.monthly_rental_rate ? Math.round(Number(o.monthly_rental_rate) * 1000) : null, ref: String(o.number) }));
  }
  async rent(ref: string) {
    this.enabled('rent');
    await this.call('POST', `/PhoneNumber/${encodeURIComponent(ref)}/`, {});
    return { e164: '+' + ref, providerRef: ref, series: 'ten_digit' as Series, carrier: 'plivo', monthlyRentInrMilli: null };
  }
  async submitKyc(): Promise<{ ref: string }> { this.enabled('kyc'); throw new Error('plivo KYC submission is a document upload flow; not wired yet'); }
  async connectByo(): Promise<{ providerRef: string }> { this.enabled('byo'); throw new Error('plivo bring-your-own trunks are not wired yet'); }
  async systemCall(): Promise<{ ref: string }> { this.enabled('system call'); throw new Error('plivo system announcements (Speak XML) are not wired yet'); }
}

let current: TelephonyProvider | null = null;
export function telephony(): TelephonyProvider {
  // Outside tests the real adapter is the default, and it refuses until it is switched on: a dev server never
  // "rents" a fake number that looks real.
  if (!current) current = process.env.NODE_ENV === 'test' ? new FakeTelephony() : new PlivoTelephony();
  return current;
}
export function setTelephony(p: TelephonyProvider | null): void { current = p; }
