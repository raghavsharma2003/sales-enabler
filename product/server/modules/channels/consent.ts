// Consent per channel and purpose, in the one consent ledger (consent_record, append-only; intake reads the same rows
// on the contact page). This module appends only channel = 'whatsapp' rows, and only for two events:
//   - an opt-in the person gave (on a call: "WhatsApp pe bhej do", with their exact words as evidence);
//   - an opt-out (STOP on WhatsApp, or "message mat bhejo"), which is a withdrawal for purpose 'all' on this channel.
// The latest row by effective time decides, and a withdrawal wins anything within one second of it (the dial gate's
// G5 rule). An opt-out here stops WhatsApp only; calls keep their own consent and suppression.
import { many, one, type Queryable } from '../../db.ts';

export type ConsentState = { state: 'granted' | 'withdrawn' | 'none'; purpose: string | null; at: Date | null; source: string | null };

/** The person's latest WhatsApp consent for this purpose (or 'all'). */
export async function waConsent(q: Queryable, ws: string, contactId: string, purpose: string): Promise<ConsentState> {
  const r = await one<{ granted: boolean; purpose: string; effective_at: Date; source: string | null }>(q,
    `WITH c AS (SELECT granted, purpose, source, effective_at, created_at, id FROM consent_record
                 WHERE workspace_id = $1 AND contact_id = $2 AND channel = 'whatsapp' AND purpose IN ($3, 'all'))
     SELECT granted, purpose, source, effective_at FROM c
      WHERE effective_at >= (SELECT max(effective_at) FROM c) - interval '1 second'
      ORDER BY granted ASC, effective_at DESC, created_at DESC, id DESC LIMIT 1`, [ws, contactId, purpose]);
  if (!r) return { state: 'none', purpose: null, at: null, source: null };
  return { state: r.granted ? 'granted' : 'withdrawn', purpose: r.purpose, at: r.effective_at, source: r.source };
}

/** Whether the person has stopped WhatsApp altogether (their latest purpose 'all' WhatsApp row is a withdrawal). */
export async function waOptedOut(q: Queryable, ws: string, contactId: string): Promise<ConsentState> {
  const r = await one<{ granted: boolean; effective_at: Date; source: string | null }>(q,
    `WITH c AS (SELECT granted, source, effective_at, created_at, id FROM consent_record
                 WHERE workspace_id = $1 AND contact_id = $2 AND channel = 'whatsapp' AND purpose = 'all')
     SELECT granted, source, effective_at FROM c
      WHERE effective_at >= (SELECT max(effective_at) FROM c) - interval '1 second'
      ORDER BY granted ASC, effective_at DESC, created_at DESC, id DESC LIMIT 1`, [ws, contactId]);
  if (!r || r.granted) return { state: r ? 'granted' : 'none', purpose: 'all', at: r?.effective_at ?? null, source: r?.source ?? null };
  return { state: 'withdrawn', purpose: 'all', at: r.effective_at, source: r.source };
}

/** Every purpose the person said yes or no to on WhatsApp, latest first per purpose (for the contact page). */
export async function waConsentSummary(q: Queryable, ws: string, contactId: string) {
  return many<{ purpose: string; granted: boolean; source: string | null; effective_at: Date }>(q,
    `SELECT DISTINCT ON (purpose) purpose, granted, source, effective_at FROM consent_record
      WHERE workspace_id = $1 AND contact_id = $2 AND channel = 'whatsapp'
      ORDER BY purpose, effective_at DESC, granted ASC, created_at DESC`, [ws, contactId]);
}

export async function appendWaConsent(q: Queryable, ws: string, contactId: string,
  c: { granted: boolean; purpose: string; source: 'in_call' | 'whatsapp' | 'manual'; evidence: Record<string, unknown> }): Promise<string> {
  const row = await one<{ id: string }>(q, `INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, evidence, granted)
    VALUES ($1,$2,$3,'whatsapp',$4,$5,$6,$7) RETURNING id`,
    [ws, contactId, c.purpose, c.granted ? 'consent' : 'withdrawal', c.source, JSON.stringify(c.evidence), c.granted]);
  return row!.id;
}

// What a person types to stop messages. Whole-message keywords (Meta's own opt-out words) plus channel phrases in
// English and Hinglish. "Cancel" alone is not one: on a reminder it usually means the appointment.
const STOP_WORDS = /^\s*(stop|stop all|unsubscribe|opt[ -]?out|band karo|band kar do|बंद करो)\s*[.!।]*\s*$/iu;
const STOP_PHRASES = [
  /\b(whatsapp|message|messages|msg|msgs|sms)\b[^.?!]{0,20}\b(mat|na|nahi|mt)\s+(bhej|bhejo|bhejiye|bhejna|bhejein|karo|kijiye)/iu,
  /\b(don'?t|do not|stop)\s+(send(ing)?|messag(e|ing))\s+(me|us)\b/iu,
  /\b(remove|take)\s+me\s+(off|from)\s+(this|your|the)\s+(list|whatsapp)/iu,
  /मैसेज\s*(मत|ना)\s*भेज/u,
];
export function isOptOutMessage(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 300) return false;
  return STOP_WORDS.test(t) || STOP_PHRASES.some(r => r.test(t));
}

// What a caller says on a call to ask for WhatsApp ("WhatsApp pe bhej do", "send it on WhatsApp"). Only a request for
// this channel counts; "WhatsApp mat bhejo" is the opposite and is read by isOptOutMessage first.
const WANTS_WA = [
  /\bwhats\s?app\b[^.?!]{0,20}\b(pe|par|pr|mein|me)\b[^.?!]{0,15}\b(bhej|bhejo|bhejiye|bhej do|send|daal|dal do|kar do)/iu,
  /\b(send|share|message)\b[^.?!]{0,25}\b(on|over|via|to my)\s+whats\s?app\b/iu,
  /व्हाट्सएप\s*(पे|पर)\s*भेज/u,
];
export function asksForWhatsApp(text: string): boolean {
  const t = text.trim();
  if (!t || isOptOutMessage(t)) return false;
  return WANTS_WA.some(r => r.test(t));
}
