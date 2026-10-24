// The Graph API client the WhatsApp transport talks through. Two implementations:
//   - the real one (fetch to graph.facebook.com), which refuses to send unless VP_WHATSAPP_LIVE=1. Nobody has Meta
//     credentials yet and the owner has not created a WhatsApp Business account, so no environment sets it today
//     (product/ops/STAGING.md has the steps that will).
//   - FakeGraph, an in-process stand-in that answers like the Cloud API (message ids, error codes, template review),
//     records every request, and can be told to refuse or time out. Tests install it with setGraph().
import { createHash } from 'node:crypto';

export interface GraphResponse { status: number; json: any }
export interface GraphRequest { method: 'GET' | 'POST'; path: string; token: string; body?: unknown; query?: Record<string, string> }
export interface GraphClient { request(r: GraphRequest): Promise<GraphResponse> }

/** A request that may have reached Meta but whose answer never came back. */
export class GraphTimeout extends Error {
  constructor(message: string) { super(message); this.name = 'GraphTimeout'; }
}

const GRAPH_BASE = () => process.env.VP_WHATSAPP_GRAPH_URL ?? 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 10_000;

export const liveGraph: GraphClient = {
  async request(r) {
    if (process.env.VP_WHATSAPP_LIVE !== '1') {
      // Not a network failure: nothing left this process.
      return { status: 503, json: { error: { code: 'vp_not_live', message: 'WhatsApp sending is not switched on for this deployment' } } };
    }
    const url = new URL(GRAPH_BASE() + r.path);
    for (const [k, v] of Object.entries(r.query ?? {})) url.searchParams.set(k, v);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: r.method, signal: ac.signal,
        headers: { authorization: `Bearer ${r.token}`, ...(r.body ? { 'content-type': 'application/json' } : {}) },
        body: r.body ? JSON.stringify(r.body) : undefined });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    } catch (e) {
      // An abort after the request was sent, or a reset mid-flight: the message may have gone out.
      if (r.method === 'POST') throw new GraphTimeout(e instanceof Error ? e.message : String(e));
      throw e;
    } finally { clearTimeout(t); }
  },
};

let current: GraphClient = liveGraph;
/** Tests: install a fake Graph API. Pass null to restore the live client. */
export function setGraph(c: GraphClient | null): void { current = c ?? liveGraph; }
export function graph(): GraphClient { return current; }

// ---------------------------------------------------------------------------------------------------------------
// The fake

export interface FakeTemplate { id: string; wabaId: string; name: string; language: string; category: string; status: string; reason: string | null; body: string }

export class FakeGraph implements GraphClient {
  requests: GraphRequest[] = [];
  templates: FakeTemplate[] = [];
  /** When set, a pending template is decided this way the next time anyone asks for its status (the dev server). */
  constructor(private o: { autoDecide?: 'APPROVED' | 'REJECTED' } = {}) {}
  private queue: ({ kind: 'refuse'; code: number; message: string; http?: number } | { kind: 'timeout' })[] = [];
  private n = 0;

  /** The next send is refused with this Cloud API error code (e.g. 131047 outside the window, 131049 marketing). */
  refuseNext(code: number, message = 'refused', http = 400) { this.queue.push({ kind: 'refuse', code, message, http }); }
  /** The next send times out after leaving (its outcome is unknown). */
  timeoutNext() { this.queue.push({ kind: 'timeout' }); }
  /** Messages sent (POST /{phone}/messages), in order. */
  sent(): { to: string; type: string; text?: string; template?: string; params?: string[] }[] {
    return this.requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages')).map(r => {
      const b = r.body as any;
      return { to: b.to, type: b.type, text: b.text?.body, template: b.template?.name,
        params: b.template?.components?.[0]?.parameters?.map((p: { text: string }) => p.text) };
    });
  }
  /** Meta's reviewer decides a template. */
  decide(name: string, status: 'APPROVED' | 'REJECTED' | 'PAUSED', reason: string | null = null) {
    for (const t of this.templates) if (t.name === name) { t.status = status; t.reason = reason; }
  }

  async request(r: GraphRequest): Promise<GraphResponse> {
    this.requests.push(r);
    if (!r.token) return { status: 401, json: { error: { code: 190, message: 'Invalid OAuth access token' } } };
    const parts = r.path.split('/').filter(Boolean);
    if (r.method === 'POST' && parts[1] === 'messages') {
      const next = this.queue.shift();
      if (next?.kind === 'timeout') throw new GraphTimeout('fake: no answer');
      if (next?.kind === 'refuse') return { status: next.http ?? 400, json: { error: { code: next.code, message: next.message } } };
      const b = r.body as any;
      if (b?.messaging_product !== 'whatsapp' || !b?.to) return { status: 400, json: { error: { code: 100, message: 'Invalid parameter' } } };
      this.n++;
      return { status: 200, json: { messaging_product: 'whatsapp', contacts: [{ input: b.to, wa_id: b.to }],
        messages: [{ id: 'wamid.FAKE' + createHash('sha256').update(String(this.n) + b.to).digest('hex').slice(0, 24) }] } };
    }
    if (parts[1] === 'message_templates') {
      const wabaId = parts[0];
      if (r.method === 'POST') {
        const b = r.body as any;
        if (this.templates.some(t => t.wabaId === wabaId && t.name === b.name && t.language === b.language)) {
          return { status: 400, json: { error: { code: 100, error_subcode: 2388024, message: 'A template with this name and language already exists' } } };
        }
        const t: FakeTemplate = { id: String(1000 + this.templates.length), wabaId, name: b.name, language: b.language, category: b.category,
          status: 'PENDING', reason: null, body: b.components?.find((c: { type: string }) => c.type === 'BODY')?.text ?? '' };
        this.templates.push(t);
        return { status: 200, json: { id: t.id, status: t.status, category: t.category } };
      }
      const name = r.query?.name;
      if (this.o.autoDecide) for (const t of this.templates) if (t.wabaId === wabaId && t.status === 'PENDING' && (!name || t.name === name)) t.status = this.o.autoDecide;
      return { status: 200, json: { data: this.templates.filter(t => t.wabaId === wabaId && (!name || t.name === name))
        .map(t => ({ id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, rejected_reason: t.reason ?? 'NONE' })) } };
    }
    return { status: 404, json: { error: { code: 803, message: 'Unknown path' } } };
  }
}
