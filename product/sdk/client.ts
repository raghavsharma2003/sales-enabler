// A small TypeScript client for Vyakti's tools, typed from the generated catalog (tools.gen.ts). Every call goes to
// POST /v1/tools/:name with a workspace API key, so it is held to the key's role and scopes like any other caller.
// Anything that reaches people, spends, deletes or changes policy comes back as an approval card: a person approves it
// in Vyakti, and waitForApproval() reads the outcome. The SDK cannot approve; nothing outside Vyakti can.
import type { ToolInput, ToolName } from './tools.gen.ts';

export type Receipt<O = unknown> =
  | { status: 'confirmed'; mode: 'A1' | 'A2' | 'A3'; result: O; argsHash: string; actionId?: string }
  | { status: 'needs_approval'; actionId: string; argsHash: string; risk: string; summary: string; expiresAt: string }
  | { status: 'not_executed'; reason: string; argsHash?: string; path?: string }
  | { status: 'unknown'; reason: string; argsHash: string; actionId?: string };

export type ApprovalState = { id: string; tool: string; summary: string | null; risk: string;
  status: 'proposed' | 'approved' | 'executed' | 'failed' | 'unknown' | 'cancelled' | 'expired'; result: unknown; executed_at: string | null };

export class VyaktiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'VyaktiError'; }
}

export interface ClientOptions {
  baseUrl: string;              // e.g. https://app.vyakti.example
  apiKey: string;               // vp_<prefix>_<secret>, from Settings -> API keys
  fetch?: typeof fetch;         // injectable for tests and other runtimes
}

export class Vyakti {
  private readonly base: string;
  private readonly f: typeof fetch;
  constructor(private readonly o: ClientOptions) {
    if (!/^vp_[0-9a-f]{8}_/.test(o.apiKey)) throw new Error('apiKey must be a Vyakti API key (vp_...)');
    this.base = o.baseUrl.replace(/\/+$/, '');
    this.f = o.fetch ?? fetch;
  }

  /** Call one tool. Validation and permission refusals come back as not_executed receipts, not exceptions. */
  async call<N extends ToolName, O = unknown>(name: N, args: ToolInput[N]): Promise<Receipt<O>> {
    const res = await this.f(`${this.base}/v1/tools/${encodeURIComponent(name)}`, {
      method: 'POST', headers: { authorization: `Bearer ${this.o.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => null) as any;
    if (body && typeof body.status === 'string') return body as Receipt<O>;
    throw new VyaktiError(res.status, body?.error?.code ?? 'http_error', body?.error?.message ?? `HTTP ${res.status}`);
  }

  /** The state of an approval card (tool action.get). */
  async approval(actionId: string): Promise<ApprovalState> {
    const r = await this.call<'action.get', ApprovalState>('action.get', { id: actionId });
    if (r.status !== 'confirmed') throw new VyaktiError(409, 'not_read', r.status === 'not_executed' || r.status === 'unknown' ? r.reason : r.status);
    return r.result;
  }

  /** Wait until a person decides an approval card, or it expires. Resolves with its final state; never approves. */
  async waitForApproval(actionId: string, opts: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<ApprovalState> {
    const interval = opts.intervalMs ?? 5_000, deadline = Date.now() + (opts.timeoutMs ?? 24 * 3600_000);
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    for (;;) {
      const a = await this.approval(actionId);
      if (a.status !== 'proposed' && a.status !== 'approved') return a;
      if (Date.now() + interval > deadline) return a;
      await sleep(interval);
    }
  }
}
