// Signing and transport for the control plane <-> voice runtime seam (shared/runtime-protocol.ts).
// sign()/verify() implement "x-vp-signature: t=<unix_ms>,v1=<hex hmac_sha256(secret, t + '.' + body)>".
// RuntimeClient posts CallTickets; tests and the dev server use FakeRuntime, which records tickets instead.
import { SetupError } from './setup-error.ts';
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
  if (!s || s.length < 32) throw new SetupError('The voice runtime is not connected to this server yet, so calls cannot be placed.', 'runtime_not_configured',
    'VP_RUNTIME_SECRET must be set (at least 32 characters)');
  return s;
}

/** How to join the call, as the runtime returns it. sim and webrtc carry url + token (webrtc adds offerUrl and audio);
 *  sip carries the trunk and the carrier answer/hangup URLs and no url or token. */
export type Join =
  | { kind: 'sim' | 'webrtc'; url: string; token: string; expiresAtMs: number; offerUrl?: string; audio?: unknown }
  | { kind: 'sip'; trunk: unknown; expiresAtMs: number; answerUrl: string; hangupUrl: string; [k: string]: unknown };

/** retryable: the runtime placed nothing and asks to be tried again after retryAfterS (its admission cap, 503 at_capacity).
 *  The caller must not count that as a failed attempt. */
export interface StartReply { accepted: boolean; join?: Join; reason?: string; retryable?: boolean; retryAfterS?: number }

/** Per stack, as the runtime's GET /v1/health reports it: whether it can run on this runtime and, when not, its plain reason
 *  ("This voice isn't offered on our Google Cloud route yet") or the credentials it lacks. */
export interface StackHealth { available: boolean; reason: string | null; missing: unknown[] }
/** components: per part ('ears' | 'brain' | 'voice' | 's2s') and part id, the same shape as a stack's. Absent from a runtime
 *  that does not report parts yet, which reads as unknown, never unavailable. */
export interface RuntimeHealth { stacks: Record<string, StackHealth>; components?: Record<string, Record<string, StackHealth>>;
  /** true once the runtime runs tickets whose stack.id is 'custom' (built from parts); absent or false means it does not. */
  customStacks?: boolean }

export interface Runtime {
  start(ticket: CallTicket): Promise<StartReply>;
  control(conversationId: string, action: 'end' | 'whisper' | 'takeover' | 'listen', body?: Record<string, unknown>): Promise<{ ok: boolean; detail?: unknown }>;
  /** null when no runtime has reported (the fake, or the runtime unreachable): availability is then unknown, never assumed.
   *  Optional so a stand-in runtime in a test need not implement it; absent means unknown. */
  health?(): Promise<RuntimeHealth | null>;
  /** Delete a call's recording on the runtime for good (POST /v1/recordings/{id}/purge, signed). ok: the file is gone
   *  (deleted now, or already). refused: the runtime said no (another workspace's recording). Optional: absent = cannot purge. */
  purgeRecording?(conversationId: string, workspaceId: string, reason: 'retention' | 'erased'): Promise<{ ok: boolean; deleted?: boolean; reason?: string }>;
}

export class HttpRuntime implements Runtime {
  constructor(private base = process.env.VP_RUNTIME_URL ?? '', private secret = runtimeSecret()) {
    if (!base) throw new SetupError('The voice runtime is not connected to this server yet, so calls cannot be placed.', 'runtime_not_configured', 'VP_RUNTIME_URL is not set');
  }
  private async post(path: string, payload: unknown): Promise<Response> {
    const body = JSON.stringify(payload);
    return fetch(new URL(path, this.base), { method: 'POST', body, signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'x-vp-signature': sign(this.secret, body) } });
  }
  async start(ticket: CallTicket): Promise<StartReply> {
    const r = await this.post('/v1/calls', ticket);
    if (r.status === 202 || r.ok) return { accepted: true, ...(await r.json() as object) };
    const text = (await r.text()).slice(0, 500);
    if (r.status === 503) {
      let j: { error?: unknown; retryAfterS?: unknown } | null = null;
      try { j = JSON.parse(text); } catch { /* not JSON: an ordinary refusal */ }
      if (j?.error === 'at_capacity') {
        const s = Number(j.retryAfterS);
        return { accepted: false, retryable: true, retryAfterS: Number.isFinite(s) && s > 0 ? Math.round(s) : 5, reason: 'the voice engine is at capacity' };
      }
    }
    return { accepted: false, reason: `runtime returned ${r.status}: ${text.slice(0, 200)}` };
  }
  /** The body always carries conversationId: the signature covers only the body, so the id there is the runtime's replay guard. */
  async control(id: string, action: string, body: Record<string, unknown> = {}) {
    const r = await this.post(`/v1/calls/${encodeURIComponent(id)}/${action}`, { ...body, conversationId: id });
    return { ok: r.ok, detail: await r.json().catch(() => null) };
  }
  async purgeRecording(id: string, workspaceId: string, reason: 'retention' | 'erased') {
    try {
      const r = await this.post(`/v1/recordings/${encodeURIComponent(id)}/purge`, { conversationId: id, workspaceId, reason });
      const j = await r.json().catch(() => null) as { deleted?: unknown; message?: unknown } | null;
      return r.ok ? { ok: true, deleted: j?.deleted === true } : { ok: false, reason: `runtime returned ${r.status}${typeof j?.message === 'string' ? ': ' + j.message : ''}` };
    } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
  }
  /** GET /v1/health carries no secrets and is not signed. The launcher answers 503 when no worker is up: that is "unknown". */
  async health(): Promise<RuntimeHealth | null> {
    try {
      const r = await fetch(new URL('/v1/health', this.base), { signal: AbortSignal.timeout(3_000) });
      if (!r.ok) return null;
      const j = await r.json() as { stacks?: Record<string, { available?: unknown; reason?: unknown; missing?: unknown }> };
      if (!j.stacks || typeof j.stacks !== 'object') return null;
      const one = (v: { available?: unknown; reason?: unknown; missing?: unknown } | undefined): StackHealth =>
        ({ available: v?.available === true, reason: typeof v?.reason === 'string' && v.reason ? v.reason : null, missing: Array.isArray(v?.missing) ? v.missing : [] });
      const stacks: Record<string, StackHealth> = {};
      for (const [id, v] of Object.entries(j.stacks)) stacks[id] = one(v);
      const raw = (j as { components?: unknown }).components;
      const customStacks = (j as { customStacks?: unknown }).customStacks === true;
      if (!raw || typeof raw !== 'object') return { stacks, ...(customStacks ? { customStacks } : {}) };
      const components: Record<string, Record<string, StackHealth>> = {};
      for (const [part, ids] of Object.entries(raw as Record<string, unknown>)) {
        if (!ids || typeof ids !== 'object') continue;
        components[part] = {};
        for (const [id, v] of Object.entries(ids as Record<string, never>)) components[part][id] = one(v);
      }
      return { stacks, components, ...(customStacks ? { customStacks } : {}) };
    } catch { return null; }
  }
}

/** Records tickets in memory. Used by tests and by the dev server when VP_RUNTIME_URL is unset. */
export class FakeRuntime implements Runtime {
  tickets: CallTicket[] = [];
  controls: { id: string; action: string; body?: Record<string, unknown> }[] = [];
  async start(ticket: CallTicket): Promise<StartReply> {
    this.tickets.push(ticket);
    return { accepted: true, join: { kind: 'sim', url: `/dev/call/${ticket.conversationId}`, token: 'fake', expiresAtMs: Date.now() + 600_000 } };
  }
  async control(id: string, action: string, body?: Record<string, unknown>) { this.controls.push({ id, action, body }); return { ok: true }; }
  purged: { id: string; workspaceId: string; reason: string }[] = [];
  /** Tests set it to make the next purges fail (the runtime unreachable). */
  purgeFails = false;
  async purgeRecording(id: string, workspaceId: string, reason: 'retention' | 'erased') {
    if (this.purgeFails) return { ok: false, reason: 'runtime unreachable' };
    const deleted = !this.purged.some(p => p.id === id);
    this.purged.push({ id, workspaceId, reason });
    return { ok: true, deleted };
  }
  /** What health() returns; tests set it. null by default: the fake runtime reports nothing about stacks. */
  healthReply: RuntimeHealth | null = null;
  async health() { return this.healthReply; }
}

let current: Runtime | null = null;
/** The process-wide runtime. HttpRuntime when VP_RUNTIME_URL is set, else a FakeRuntime (dev and tests). */
export function runtime(): Runtime {
  if (!current) current = process.env.VP_RUNTIME_URL ? new HttpRuntime() : new FakeRuntime();
  return current;
}
export function setRuntime(r: Runtime | null): void { current = r; }
