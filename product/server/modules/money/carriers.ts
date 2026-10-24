// Carrier billing pulses (blueprint decision 10, "one honest price per connected second"). A carrier bills a call in
// whole pulses from answer, so a 61 s call on a 30 s pulse is billed as 90 s. Every figure here is copied from a public
// page saved under research/2026-10-24/carrier-pulse/ (URL and fetch date in sources.json); a pulse no saved page states
// is null and reads "not published". A path whose pulse is over 30 s is marked not recommended, never blocked.
import { formatInr } from '../../../shared/money.ts';

export const RECOMMENDED_MAX_PULSE_S = 30;

export interface CarrierPath {
  id: string;                    // matches phone_number.carrier / the telephony provider name where one is wired
  label: string;
  wired: boolean;                // does Vyakti have an adapter for it today
  outboundInrPerMin: number | null;
  pulseSec: number | null;       // null: not published
  pulseSource: string;           // what the saved page says, in its words
  urls: string[];
  conflict?: string;             // a different figure we hold, and how it gets settled
}

export const CARRIERS: readonly CarrierPath[] = [
  { id: 'plivo', label: 'Plivo India', wired: true, outboundInrPerMin: 0.38, pulseSec: 30,
    pulseSource: 'India voice pricing: "Domestic Calls ₹0.38/min ... Pulse is 30 seconds"; billing concepts: "In the India data region, Voice API and SIP Trunking calls are billed at a standard 30/30 (30-second pulse)"',
    urls: ['https://www.plivo.com/voice/pricing/in/', 'https://www.plivo.com/docs/faq/billing-and-invoices/billing-concepts.md'],
    conflict: 'Our voice lab read a 60-second pulse on the Plivo console on 19 Oct 2026; the first invoice settles which applies.' },  // the lab read: voicelab phone.py
  { id: 'exotel', label: 'Exotel', wired: false, outboundInrPerMin: null, pulseSec: null,
    pulseSource: 'Developer FAQ: "Billed per second after a minimum billing duration (typically 1 second or per-pulse as per plan)"; no pulse figure stated',
    urls: ['https://developer.exotel.com/docs/faqs/pricing-plans.md', 'https://exotel.com/pricing/'] },
  { id: 'twilio', label: 'Twilio (India)', wired: false, outboundInrPerMin: null, pulseSec: null,
    pulseSource: 'India voice pricing lists per-minute rates ($0.0699/min local, $0.0496/min mobile) with no pulse stated',
    urls: ['https://www.twilio.com/en-us/voice/pricing/in'] },
  { id: 'knowlarity', label: 'Knowlarity', wired: false, outboundInrPerMin: null, pulseSec: null,
    pulseSource: 'Pricing page could not be fetched (TLS failure through our proxy, 24 Oct 2026)', urls: [] },
  { id: 'tata', label: 'Tata Tele Business (Smartflo)', wired: false, outboundInrPerMin: null, pulseSec: null,
    pulseSource: 'Pricing page could not be fetched (502 through our proxy, 24 Oct 2026)', urls: [] },
  { id: 'airtel-iq', label: 'Airtel IQ', wired: false, outboundInrPerMin: null, pulseSec: null,
    pulseSource: 'Pricing page renders in the browser only; the saved page states no rate or pulse',
    urls: ['https://www.airtel.in/business/b2b/airtel-iq/pricing'] },
];

/** The carrier estimates use today: the one wired path. */
export const DEFAULT_CARRIER = CARRIERS.find(c => c.id === 'plivo')!;

export const carrierById = (id: string | null | undefined): CarrierPath | undefined => CARRIERS.find(c => c.id === id);

/** Seconds a carrier bills for a call of `seconds` connected: whole pulses from answer. 0 s (not connected) bills 0. */
export function pulseRoundedSeconds(seconds: number, pulseSec: number): number {
  if (!(seconds > 0)) return 0;
  return Math.ceil(seconds / pulseSec - 1e-9) * pulseSec;
}

/** The carrier's charge for one call, in micro-rupees, at its per-minute rate on pulse-rounded seconds. */
export function callTelephonyMicro(seconds: number, c: Pick<CarrierPath, 'outboundInrPerMin' | 'pulseSec'> = DEFAULT_CARRIER): number {
  const rate = c.outboundInrPerMin ?? 0;
  return Math.round(pulseRoundedSeconds(seconds, c.pulseSec ?? 1) / 60 * rate * 1e6);
}

/** What rounding adds to a typical call: half a pulse at the per-minute rate (calls end at random within a pulse). */
export function pulseExtraPerCallMilli(c: CarrierPath = DEFAULT_CARRIER): number | null {
  if (c.pulseSec === null || c.outboundInrPerMin === null) return null;
  return Math.round(c.outboundInrPerMin * 1000 * (c.pulseSec / 2) / 60);
}

export interface PulseView {
  carrier: string; pulseSec: number | null; recommended: boolean | null;
  extraPerCallInrMilli: number | null; text: string; note: string | null;
}

/** The pulse in plain words, for estimates, stack cards and Billing. */
export function pulseView(c: CarrierPath = DEFAULT_CARRIER): PulseView {
  if (c.pulseSec === null) return { carrier: c.label, pulseSec: null, recommended: null, extraPerCallInrMilli: null,
    text: `${c.label}: billing pulse not published.`, note: null };
  const extra = pulseExtraPerCallMilli(c);
  const recommended = c.pulseSec <= RECOMMENDED_MAX_PULSE_S;
  return { carrier: c.label, pulseSec: c.pulseSec, recommended, extraPerCallInrMilli: extra,
    text: `${c.pulseSec}-second pulse: about ${formatInr(extra ?? 0, { paise: true })} per call on top`
      + (recommended ? '' : ` (not recommended: ${c.pulseSec}-second billing)`),
    note: c.conflict ?? null };
}

/** A carrier path as a buyer sees it when choosing one. Over 30 s is marked, never blocked. */
export function carrierChoice(c: CarrierPath) {
  const p = pulseView(c);
  return { id: c.id, label: c.label, wired: c.wired, outboundInrPerMin: c.outboundInrPerMin, pulseSec: c.pulseSec,
    recommended: p.recommended, status: p.recommended === false ? `not recommended: ${c.pulseSec}-second billing` : p.recommended ? 'recommended' : 'pulse not published',
    pulse: p.text, note: p.note, source: c.pulseSource, urls: c.urls };
}
