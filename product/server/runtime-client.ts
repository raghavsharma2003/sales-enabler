// Signing and transport for the control plane <-> voice runtime seam (shared/runtime-protocol.ts).
// sign()/verify() implement "x-vp-signature: t=<unix_ms>,v1=<hex hmac_sha256(secret, t + '.' + body)>".
// RuntimeClient posts CallTickets; tests and the dev server use FakeRuntime, which records tickets instead.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CallTicket } from '../shared/runtime-protocol.ts';

const SKEW_MS = 5 * 60_000;

export function sign(secret: string, body: string, t: number = Date.now()): string {
  const mac = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${mac}`;
}

export function verify(secret: string, body: string, header: string | undefined, now: number = Date.now()): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!m) return false;
  const t = Number(m[1]);
  if (!Number.isFinite(t) || Math.abs(now - t) > SKEW_MS) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'), 'hex');
  const got = Buffer.from(m[2], 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

export function runtimeSecret(): string {
  const s = process.env.VP_RUNTIME_SECRET;
  if (!s || s.length < 32) throw new Error('VP_RUNTIME_SECRET must be set (at least 32 characters)');
  return s;
}

export interface StartReply { accepted: boolean; join?: { url: string; token: string; expiresAt: string }; reason?: string }

export interface Runtime {
  start(ticket: CallTicket): Promise<StartReply>;
  control(conversationId: string, action: 'end' | 'whisper' | 'takeover' | 'listen', body?: Record<string, unknown>): Promise<{ ok: boolean; detail?: unknown }>;
}

export class HttpRuntime implements Runtime {
  constructor(private base = process.env.VP_RUNTIME_URL ?? '', private secret = runtimeSecret()) {
    if (!base) throw new Error('VP_RUNTIME_URL is not set');
  }
  private async post(path: string, payload: unknown): Promise<Response> {
    const body = JSON.stringify(payload);
    return fetch(new URL(path, this.base), { method: 'POST', body, signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'x-vp-signature': sign(this.secret, body) } });
  }
  async start(ticket: CallTicket): Promise<StartReply> {
    const r = await this.post('/v1/calls', ticket);
    if (r.status === 202 || r.ok) return { accepted: true, ...(await r.json() as object) };
    return { accepted: false, reason: `runtime returned ${r.status}: ${(await r.text()).slice(0, 200)}` };
  }
  async control(id: string, action: string, body: Record<string, unknown> = {}) {
    const r = await this.post(`/v1/calls/${encodeURIComponent(id)}/${action}`, body);
    return { ok: r.ok, detail: await r.json().catch(() => null) };
  }
}

/** Records tickets in memory. Used by tests and by the dev server when VP_RUNTIME_URL is unset. */
export class FakeRuntime implements Runtime {
  tickets: CallTicket[] = [];
  controls: { id: string; action: string; body?: Record<string, unknown> }[] = [];
  async start(ticket: CallTicket): Promise<StartReply> {
    this.tickets.push(ticket);
    return { accepted: true, join: { url: `/dev/call/${ticket.conversationId}`, token: 'fake', expiresAt: new Date(Date.now() + 600_000).toISOString() } };
  }
  async control(id: string, action: string, body?: Record<string, unknown>) { this.controls.push({ id, action, body }); return { ok: true }; }
}

let current: Runtime | null = null;
/** The process-wide runtime. HttpRuntime when VP_RUNTIME_URL is set, else a FakeRuntime (dev and tests). */
export function runtime(): Runtime {
  if (!current) current = process.env.VP_RUNTIME_URL ? new HttpRuntime() : new FakeRuntime();
  return current;
}
export function setRuntime(r: Runtime | null): void { current = r; }
