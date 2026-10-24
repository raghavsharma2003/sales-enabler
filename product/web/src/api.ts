// The only network door of the UI. Every page action is one tool: POST /v1/tools/:name {args}.
// The kernel answers with a Receipt (confirmed / needs_approval / not_executed / unknown); the UI never guesses a status.
import { plainReason } from './labels.ts';
export type Risk = 'read' | 'draft' | 'test' | 'external' | 'spend' | 'destructive' | 'policy';

export type Receipt<T = unknown> =
  | { status: 'confirmed'; mode: 'A1' | 'A2' | 'A3'; result: T; argsHash: string; actionId?: string }
  | { status: 'needs_approval'; actionId: string; argsHash: string; risk: Risk; summary: string; expiresAt: string }
  | { status: 'not_executed'; reason: string; argsHash?: string; path?: string }
  | { status: 'unknown'; reason: string; argsHash: string; actionId?: string };

export interface ToolInfo { name: string; risk: Risk; summary: string; needsApproval: boolean; roles: string[] }
export interface Me {
  workspace: { id: string; name: string; region?: string; plan?: string; status?: string; settings?: Record<string, unknown> };
  member: { id: string; email: string; name: string; role: 'owner' | 'builder' | 'operator' | 'compliance' | 'viewer' } | null;
  via: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public path?: string) { super(message); this.name = 'ApiError'; }
}
/** The tool is not registered on this server yet (a sibling module has not landed). */
export class ToolMissing extends Error {
  constructor(public tool: string) { super(`${tool} is not available on this server yet`); this.name = 'ToolMissing'; }
}
/** The tool ran and refused (validation, role, policy). `reason` is plain words for the person. */
export class ToolRefused extends Error {
  constructor(public tool: string, public reason: string, public path?: string) { super(reason); this.name = 'ToolRefused'; }
}

type Unauth = () => void;
let onUnauth: Unauth = () => {};
export const setUnauthHandler = (f: Unauth) => { onUnauth = f; };

async function http(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> {
  let res: Response;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'offline', 'Could not reach the server. Check your connection and try again.');
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && !url.startsWith('/v1/login') && !url.startsWith('/v1/signup')) onUnauth();
  return { status: res.status, json };
}

function fail(r: { status: number; json: any }): never {
  const e = r.json?.error;
  throw new ApiError(r.status, e?.code ?? 'error', e?.message ?? `The server answered ${r.status}.`, e?.path);
}

export async function signup(b: { workspace: string; name: string; email: string; password: string }) {
  const r = await http('POST', '/v1/signup', b); if (r.status >= 300) fail(r); return r.json;
}
export async function login(b: { email: string; password: string }) {
  const r = await http('POST', '/v1/login', b); if (r.status >= 300) fail(r); return r.json;
}
export async function logout() { await http('POST', '/v1/logout', {}); }
export async function getMe(): Promise<Me> {
  const r = await http('GET', '/v1/me'); if (r.status >= 300) fail(r); return r.json;
}
export async function listTools(): Promise<ToolInfo[]> {
  const r = await http('GET', '/v1/tools'); if (r.status >= 300) fail(r); return r.json.tools;
}

/** Call a tool and return the raw receipt. Network and HTTP-level errors throw ApiError. */
export async function callTool<T = unknown>(name: string, args: unknown = {}, threadId?: string): Promise<Receipt<T>> {
  const r = await http('POST', '/v1/tools/' + encodeURIComponent(name), { args, ...(threadId ? { threadId } : {}) });
  if (r.json && typeof r.json.status === 'string') return r.json as Receipt<T>;
  fail(r);
}

/** Call a tool that should simply return data. Unknown tool -> ToolMissing; refusal -> ToolRefused. */
export async function run<T = unknown>(name: string, args: unknown = {}, threadId?: string): Promise<T> {
  const r = await callTool<T>(name, args, threadId);
  if (r.status === 'confirmed') return r.result;
  if (r.status === 'needs_approval') throw new ToolRefused(name, 'This needs your approval first.');
  if (r.status === 'not_executed' && /^unknown tool/.test(r.reason)) throw new ToolMissing(name);
  throw new ToolRefused(name, plainReason(r.reason), (r as { path?: string }).path);
}

export interface ActionRow { id: string; tool: string; args: unknown; risk_class: Risk; status: string; summary: string; proposed_by: string; created_at: string; expires_at: string | null; executed_at: string | null; result: unknown }
export async function listActions(status = 'proposed'): Promise<ActionRow[]> {
  const r = await http('GET', '/v1/actions?status=' + encodeURIComponent(status)); if (r.status >= 300) fail(r); return r.json.actions;
}
export async function decide(actionId: string, approve: boolean): Promise<Receipt | { declined: boolean }> {
  const r = await http('POST', `/v1/actions/${encodeURIComponent(actionId)}/decide`, { approve });
  if (r.json && (typeof r.json.status === 'string' || 'declined' in r.json)) return r.json;
  fail(r);
}

/** The Operator (server/modules/operator): POST /v1/operator/threads, then POST .../messages answers as text/event-stream
 *  with frames message, delta, step, card, notice, error, done. The body may arrive buffered or incrementally; both parse. */
export type OperatorFrame =
  | { type: 'message'; id: string; role: 'user'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'step'; tool: string; status: 'running' | 'done'; outcome?: string }
  | { type: 'card'; id: string; card: ApiCard }
  | { type: 'notice'; text: string }
  | { type: 'error'; text: string }
  | { type: 'done'; llmCalls: number; toolCalls: number; stoppedBy?: string };
export type ApiCard =
  | { type: 'approval'; actionId: string; tool: string; summary: string; risk: { risk: Risk; label: string }; mode: 'A2' | 'A0'; diff: { field: string; to: unknown }[]; approvers: string[]; expiresAt: string; status: 'proposed' }
  | { type: 'receipt'; tool: string; status: 'confirmed' | 'not_executed' | 'unknown'; mode?: string; text: string; result?: unknown; actionId?: string }
  | { type: 'plan'; goal: string; steps: { n: number; tool: string; why?: string; risk?: Risk; runs: 'now' | 'tap' | 'refused'; status: string; reason?: string; actionId?: string }[]; footer: string };

export async function createThread(): Promise<string> {
  const r = await http('POST', '/v1/operator/threads', {});
  if (r.status >= 300) fail(r);
  return r.json.thread.id;
}

/** Send one message to a thread and hand every frame to onEvent as it is parsed. */
export async function sendOperator(threadId: string, text: string, onEvent: (e: OperatorFrame) => void, signal?: AbortSignal, page?: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/v1/operator/threads/${encodeURIComponent(threadId)}/messages`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(page ? { text, page } : { text }), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'offline', 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 401) { onUnauth(); throw new ApiError(401, 'unauthorised', 'Please sign in again.'); }
  if (!res.ok) { let j: any = null; try { j = await res.json(); } catch { /* none */ } throw new ApiError(res.status, j?.error?.code ?? 'error', j?.error?.message ?? `The server answered ${res.status}.`); }
  if (!res.body) return;
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  const flush = (block: string) => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
    if (data) { try { onEvent(JSON.parse(data)); } catch { /* ignore a torn frame */ } }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) { flush(buf.slice(0, i)); buf = buf.slice(i + 2); }
  }
  if (buf.trim()) flush(buf);
}
