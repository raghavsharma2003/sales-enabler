// WhatsApp Cloud API as a transport: the four functions and nothing else. The webhook is signed with the app secret
// (X-Hub-Signature-256, HMAC-SHA256 of the exact bytes); the GET handshake echoes hub.challenge only for the verify
// token this connection was given. Sends go through graph() so tests use the fake Graph API.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { graph, GraphTimeout } from './graph.ts';
import { SendRefused, SendUnknown, type ChannelEvent, type Credentials, type Outbound, type Transport, type WebhookRequest } from './transport.ts';

const header = (h: WebhookRequest['headers'], k: string) => { const v = h[k]; return Array.isArray(v) ? v[0] : v; };
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** The signature header Meta sends, for tests and for the fake. */
export function signWebhook(appSecret: string, raw: Buffer | string): string {
  return 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
}

const STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);
const TEMPLATE_EVENTS: Record<string, 'approved' | 'rejected' | 'pending' | 'paused' | 'disabled'> = {
  APPROVED: 'approved', REJECTED: 'rejected', PENDING: 'pending', PAUSED: 'paused', DISABLED: 'disabled', FLAGGED: 'paused',
};
const at = (ts: unknown) => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date(); };

export const whatsapp: Transport = {
  channel: 'whatsapp',

  verify(req, s) {
    if (req.method === 'GET') {
      const mode = req.query.get('hub.mode'), token = req.query.get('hub.verify_token') ?? '', challenge = req.query.get('hub.challenge') ?? '';
      if (mode !== 'subscribe') return { ok: false, reason: 'not a subscribe handshake' };
      const a = Buffer.from(sha256(token)), b = Buffer.from(s.verifyTokenHash);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'the verify token does not match this connection' };
      return { ok: true, challenge };
    }
    const sig = header(req.headers, 'x-hub-signature-256') ?? '';
    if (!sig.startsWith('sha256=')) return { ok: false, reason: 'unsigned' };
    const want = Buffer.from(signWebhook(s.appSecret, req.raw)), got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'the signature does not match' };
    return { ok: true };
  },

  parse(raw) {
    let body: any;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return []; }
    if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];
    const out: ChannelEvent[] = [];
    for (const entry of body.entry) {
      for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
        const v = ch?.value ?? {};
        if (ch?.field === 'message_template_status_update') {
          const st = TEMPLATE_EVENTS[String(v.event ?? '').toUpperCase()];
          if (st && v.message_template_id) out.push({ kind: 'template', wabaId: String(entry.id ?? ''), providerTemplateId: String(v.message_template_id),
            name: String(v.message_template_name ?? ''), language: v.message_template_language ? String(v.message_template_language) : null,
            status: st, reason: v.reason && v.reason !== 'NONE' ? String(v.reason) : null, at: new Date() });
          continue;
        }
        if (ch?.field !== 'messages') continue;
        const phoneNumberId = String(v.metadata?.phone_number_id ?? '');
        const names = new Map<string, string>();
        for (const c of Array.isArray(v.contacts) ? v.contacts : []) if (c?.wa_id) names.set(String(c.wa_id), String(c.profile?.name ?? ''));
        for (const m of Array.isArray(v.messages) ? v.messages : []) {
          if (!m?.id || !m?.from) continue;
          const type = m.type === 'text' ? 'text' : m.type === 'button' || m.type === 'interactive' ? 'button' : 'other';
          const text = m.type === 'text' ? String(m.text?.body ?? '')
            : m.type === 'button' ? String(m.button?.text ?? '')
            : m.type === 'interactive' ? String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '') : '';
          out.push({ kind: 'message', providerId: String(m.id), phoneNumberId, from: String(m.from).replace(/\D/g, ''), profileName: names.get(String(m.from)) || null,
            at: at(m.timestamp), type, text: text.slice(0, 4096) });
        }
        for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
          if (!s?.id || !STATUSES.has(s.status)) continue;
          const err = Array.isArray(s.errors) ? s.errors[0] : null;
          out.push({ kind: 'status', providerId: String(s.id), phoneNumberId, status: s.status, at: at(s.timestamp),
            errorCode: err?.code != null ? String(err.code) : null, errorTitle: err?.title ? String(err.title) : null,
            billable: typeof s.pricing?.billable === 'boolean' ? s.pricing.billable : null, pricingCategory: s.pricing?.category ? String(s.pricing.category) : null });
        }
      }
    }
    return out;
  },

  async send(creds: Credentials, o: Outbound) {
    const body = o.kind === 'text'
      ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: o.to, type: 'text', text: { preview_url: false, body: o.text } }
      : { messaging_product: 'whatsapp', recipient_type: 'individual', to: o.to, type: 'template',
          template: { name: o.name, language: { code: o.language },
            components: o.params.length ? [{ type: 'body', parameters: o.params.map(text => ({ type: 'text', text })) }] : [] } };
    let res;
    try { res = await graph().request({ method: 'POST', path: `/${creds.phoneNumberId}/messages`, token: creds.accessToken, body }); }
    catch (e) {
      if (e instanceof GraphTimeout) throw new SendUnknown(`no answer from WhatsApp (${e.message}); the message may have been delivered`);
      throw new SendRefused(e instanceof Error ? e.message : String(e), null);
    }
    const id = res.json?.messages?.[0]?.id;
    if (res.status >= 200 && res.status < 300 && id) return { providerId: String(id) };
    if (res.status >= 500 && res.json?.error?.code !== 'vp_not_live') throw new SendUnknown(`WhatsApp answered ${res.status}; the message may have been delivered`);
    const err = res.json?.error ?? {};
    throw new SendRefused(String(err.message ?? `WhatsApp refused the message (${res.status})`).slice(0, 300), err.code != null ? String(err.code) : null);
  },

  render(o) {
    if (o.kind === 'text') return o.text;
    return o.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => o.params[Number(n) - 1] ?? '');
  },
};

/** What a Cloud API error code means, in words a person reads (the codes Meta documents for sends). */
export const ERROR_WORDS: Record<string, string> = {
  '131047': 'More than 24 hours have passed since the person last wrote; only an approved template can reach them now',
  '131049': 'WhatsApp held back this marketing message to protect the person from too many business messages',
  '131050': 'The person has stopped marketing messages from this business on WhatsApp',
  '131026': 'The message could not be delivered (the number may not be on WhatsApp)',
  '131051': 'WhatsApp does not support this kind of message',
  '132000': 'The template expects a different number of values',
  '132001': 'The template does not exist in this language or is not approved',
  '131056': 'Too many messages to this person in a short time',
  '190': 'The access token is not valid any more; connect the account again',
  vp_not_live: 'WhatsApp sending is not switched on for this deployment',
};
