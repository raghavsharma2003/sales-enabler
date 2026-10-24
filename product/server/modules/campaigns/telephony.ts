// Numbers: the series router (which CLI series a call may present) and the telephony provider seam for search,
// rent, KYC and bring-your-own lines. Tests use FakeTelephony; the real adapter is off unless VP_TELEPHONY_LIVE=1
// and its credentials are set, so no test and no dev server can ever reach a paid carrier API.
//
// Who calls the carrier (decision.2026-10-24.telephony-one-dial-path): the voice RUNTIME is the one caller of Plivo's
// Call API for every agent call (test.ring_member_phone, call.place_single, campaign, retry and callback attempts):
// dial gate -> claim -> CallTicket (transport sip: to, from, trunk) -> runtime POST /v1/calls -> plivo_dial -> Plivo
// fetches the runtime's answer URL -> <Stream> -> the runtime's media socket -> hang-up URL -> call.ended -> calls'
// ingest (cost, call log, analysis, retry ladder). The runtime owns the answer, hang-up, stream and transfer endpoints
// and already needs the credentials for transfer, keys and hang-up; the lab rang real phones that way
// (voicelab/server/phone.py). This adapter never places an agent call. It calls Plivo for account work only (numbers,
// the inbound application, CDRs) and for the one fixed announcement with no agent (systemCall, phone verification).
// Every number either path would send to the carrier passes the allowlist first (allowlist.ts).
//
// Plivo request shapes below were checked on 2026-10-24 against Plivo's docs and the lab's working code:
//   Call API      https://www.plivo.com/docs/voice/api/call/make-a-call (POST Account/{id}/Call/: from, to, answer_url,
//                 answer_method, hangup_url, hangup_method, ring_timeout, time_limit; reply request_uuid, api_id,
//                 message 'call fired'); the lab sent digits without '+', which Plivo accepted on live India calls.
//   India rule    the same page: a call from an Indian number needs that number rented on this account with an
//                 accepted compliance application, else 400.
import { SetupError } from '../../setup-error.ts';
import { allowMode, assertMayDial } from './allowlist.ts';
import { randomBytes, randomUUID } from 'node:crypto';
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

// ---- what each series needs, said before any search (open.2026-10-24.numbers-kyc-before-search) ----
// Every figure is copied from the carrier's public pages, saved under research/2026-10-24/numbers-kyc/ with URL and
// fetch date (24 Oct 2026). What a page does not state reads "not published": nothing here is estimated.

export interface SeriesGuide {
  series: Series | 'mobile';
  label: string;
  who: string;                 // who may use it, in plain words
  checklist: string[];         // what the business must provide or do, in order
  typicalTime: string;         // as the carrier states it, or 'not published'
  monthlyPrice: string;        // as the carrier states it, or 'not published'
  monthlyRentInrMilli: number | null;
  source: { carrier: string; urls: string[]; fetched: string };
}

const NOT_PUBLISHED = 'not published';
const FETCHED = '2026-10-24';
const PLIVO_KYC = 'https://www.plivo.com/docs/numbers/rent-india-numbers.md';
const PLIVO_PRICES = 'https://www.plivo.com/virtual-phone-numbers/pricing/in/';

export const SERIES_GUIDE: readonly SeriesGuide[] = [
  { series: 'ten_digit', label: 'Landline (city) number, such as 080 or 022', who: 'Businesses outside banking, finance and insurance, for service and transaction calls',
    checklist: ['One business document: GST certificate, Certificate of Incorporation, or Udyam registration (business PAN alone is not accepted)',
      'Your first application signed by an authorised signatory and stamped with the company seal'],
    typicalTime: 'About 5 minutes for the automated review', monthlyPrice: '₹200 a month', monthlyRentInrMilli: 200_000,
    source: { carrier: 'Plivo', urls: [PLIVO_KYC, PLIVO_PRICES], fetched: FETCHED } },
  { series: '1600', label: '1600-series number (banking, finance and insurance)', who: 'Banks, NBFCs, insurers, fund houses and other entities licensed by RBI, SEBI, IRDAI or PFRDA, for service and transaction calls',
    checklist: ['Your regulator and licence number', 'Registration as a principal entity on the Tata DLT portal (and the calling partner as telemarketer, if different)',
      'The carrier\'s BFSI customer application form and telemarketer declaration, signed and sealed',
      'Voice header and voice template approval on the Tata DLT portal'],
    typicalTime: 'About 7 to 14 business days', monthlyPrice: NOT_PUBLISHED, monthlyRentInrMilli: null,
    source: { carrier: 'Plivo', urls: ['https://plivo.com/docs/voice/concepts/160-series-provisioning.md', PLIVO_KYC], fetched: FETCHED } },
  { series: '140', label: '140-series number (sales and promotional calls)', who: 'Any business making promotional calls, only to people who gave digital consent',
    checklist: ['Registration as principal entity and telemarketer on the Tata DLT portal', 'An active GST registration',
      'The carrier\'s telemarketer declaration, signed and sealed', 'Voice header approval on the Tata DLT portal'],
    typicalTime: 'About 5 to 10 business days', monthlyPrice: NOT_PUBLISHED, monthlyRentInrMilli: null,
    source: { carrier: 'Plivo', urls: ['https://www.plivo.com/docs/voice/concepts/140-series-provisioning.md', PLIVO_KYC], fetched: FETCHED } },
  { series: '1601', label: '1601-series number (utilities and logistics)', who: 'Utilities and logistics companies, for service calls',
    checklist: [NOT_PUBLISHED], typicalTime: NOT_PUBLISHED, monthlyPrice: NOT_PUBLISHED, monthlyRentInrMilli: null,
    source: { carrier: 'Plivo', urls: [PLIVO_KYC], fetched: FETCHED } },
  { series: 'mobile', label: 'Mobile number', who: 'Not offered by our carrier for business calling',
    checklist: [NOT_PUBLISHED], typicalTime: NOT_PUBLISHED, monthlyPrice: NOT_PUBLISHED, monthlyRentInrMilli: null,
    source: { carrier: 'Plivo', urls: [PLIVO_KYC, PLIVO_PRICES], fetched: FETCHED } },
];

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
  private readonly id: string;
  private readonly token: string;
  private readonly apiBase: string;
  private readonly publicBase: string;
  /** opts are for tests only: an apiBase on this machine (a fake Plivo) is the one way past the live switch. */
  constructor(opts: { apiBase?: string; authId?: string; authToken?: string; publicBase?: string } = {}) {
    this.id = opts.authId ?? process.env.PLIVO_AUTH_ID ?? '';
    this.token = opts.authToken ?? process.env.PLIVO_AUTH_TOKEN ?? '';
    this.apiBase = (opts.apiBase ?? 'https://api.plivo.com').replace(/\/+$/, '');
    this.publicBase = (opts.publicBase ?? process.env.VP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  }
  private enabled(what: string) {
    if (isLoopback(this.apiBase) && this.id && this.token) return;          // a fake carrier on this machine: never a real call
    if (process.env.VP_TELEPHONY_LIVE !== '1' || !this.id || !this.token || process.env.NODE_ENV === 'test') throw new TelephonyDisabled(what);
    const m = allowMode();
    if (m.mode === 'closed') throw new TelephonyDisabled(`${what}: ${m.why}`);
  }
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${this.apiBase}/v1/Account/${encodeURIComponent(this.id)}${path}`, {
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
  /** Ring `to` and speak `lines` (no agent, no model), then hang up. Plivo fetches what to say from our answer URL, so the
   *  lines wait here under a one-off token for 15 minutes; the hook (campaigns routes) answers with Speak XML. */
  async systemCall(i: { to: string; from: string; lines: string[] }): Promise<{ ref: string }> {
    this.enabled('system call');
    assertMayDial(i.to);                    // the last wall before the request leaves (allowlist.ts)
    if (!/^https:\/\//.test(this.publicBase) && !isLoopback(this.publicBase)) {
      throw new TelephonyDisabled('system call: no public https address for the carrier to fetch the announcement from');
    }
    const token = queueAnnouncement(i.lines);
    const digits = (n: string) => n.replace(/\D/g, '');
    const j = await this.call('POST', '/Call/', {
      from: digits(i.from), to: digits(i.to), answer_url: `${this.publicBase}${SPEAK_PATH}${token}`, answer_method: 'POST',
      ring_timeout: 45, time_limit: 120,
    });
    const ref = String(j.request_uuid ?? j.api_id ?? '');
    if (!ref) throw new Error('plivo accepted the call request without a reference');
    return { ref };
  }
}

// ---- system announcements: lines waiting for the carrier to fetch them ----

export const SPEAK_PATH = '/hooks/telephony/plivo/speak/';
const ANNOUNCE_TTL_MS = 15 * 60_000;
const announcements = new Map<string, { lines: string[]; until: number }>();

/** Hold the lines under a random token until the carrier asks for them (one process; a second replica would need a shared store). */
export function queueAnnouncement(lines: string[], now = Date.now()): string {
  for (const [k, v] of announcements) if (v.until < now) announcements.delete(k);
  const token = randomBytes(24).toString('base64url');
  announcements.set(token, { lines, until: now + ANNOUNCE_TTL_MS });
  return token;
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** The Speak XML for a token, or null when it is unknown or expired. The lines are spoken in Indian English, then the call ends. */
export function announcementXml(token: string, now = Date.now()): string | null {
  const a = announcements.get(token);
  if (!a || a.until < now) return null;
  return '<?xml version="1.0" encoding="UTF-8"?><Response>'
    + a.lines.map(l => `<Speak voice="WOMAN" language="en-IN">${xmlEscape(l)}</Speak><Wait length="1"/>`).join('')
    + '<Hangup/></Response>';
}

function isLoopback(url: string): boolean {
  try { const h = new URL(url).hostname; return h === '127.0.0.1' || h === 'localhost' || h === '[::1]'; } catch { return false; }
}

let current: TelephonyProvider | null = null;
export function telephony(): TelephonyProvider {
  // Outside tests the real adapter is the default, and it refuses until it is switched on: a dev server never
  // "rents" a fake number that looks real.
  if (!current) current = process.env.NODE_ENV === 'test' ? new FakeTelephony() : new PlivoTelephony();
  return current;
}
export function setTelephony(p: TelephonyProvider | null): void { current = p; }
