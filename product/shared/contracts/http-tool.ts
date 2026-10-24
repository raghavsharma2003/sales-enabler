// The in-call HTTP tool contract (must-be audit, brief 3, control-plane half). A workspace defines a tool once (agents
// module: tool.create / tool.edit / tool.test); a published agent version carries a snapshot of each granted tool's
// spec in agent.tools[].config.spec, so the call ticket holds exactly what was approved. The voice runtime builds the
// in-call half against this file:
//
//  1. Offer each spec to the brain as a function: name, description, input (a small JSON Schema object).
//  2. When the brain calls one, validate the arguments with validateArgs(); on failure tell the brain, never call out.
//  3. Ask the CONTROL PLANE to run it (it holds the integration's secret; the runtime never sees secrets):
//       POST {control}/hooks/runtime/tools  body { conversationId, toolName, args }  signed like every runtime hook.
//     The control plane builds the request with buildRequest(), sends it with the spec's timeout (at most 2.5 s), and
//     answers { ok, status, result } where result is readResult() of the response: only the listed fields, at most
//     RESULT_MAX_BYTES. A timeout or error answers { ok: false, reason } and she says she could not check right now.
//  4. While waiting she may say one short holding line of her own; she never reads the raw result aloud.
//
// Only 'read' and 'draft' tools run in a call: nothing can be approved mid-call, so a tool that reaches people,
// spends or changes policy is refused at creation (A2 actions stay outside calls). Hosts must be public https.
export const HTTP_TOOL_CONTRACT = 1;
export const MAX_TIMEOUT_MS = 2500;
export const RESULT_MAX_BYTES = 2000;
export const IN_CALL_RISKS = ['read', 'draft'] as const;
export type InCallRisk = (typeof IN_CALL_RISKS)[number];

export type ArgType = 'string' | 'number' | 'integer' | 'boolean';
export interface ArgSchema { type: ArgType; description?: string; enum?: (string | number)[]; maxLength?: number; minimum?: number; maximum?: number }
export interface InputSchema { type: 'object'; properties: Record<string, ArgSchema>; required?: string[] }

export interface HttpToolSpec {
  contract: 1;
  kind: 'http';
  name: string;                       // the brain's function name: snake_case, unique in the workspace
  description: string;                // when to use it, in plain words (a note, not a line to say)
  input: InputSchema;                 // at most 8 flat arguments
  request: {
    method: 'GET' | 'POST';
    url: string;                      // https; {arg} placeholders are filled from the arguments, URL-encoded
    query?: string[];                 // GET: arguments sent as query parameters
    body?: string[];                  // POST: arguments sent as a JSON body
  };
  auth: { integrationId: string; header: string; secretKey: string; prefix?: string } | null;   // secret from the integration
  timeoutMs: number;                  // at most MAX_TIMEOUT_MS
  risk: InCallRisk;
  result: { fields: string[] };       // dotted paths she may use from a JSON response; everything else is dropped
}

export class HttpToolError extends Error {
  constructor(public path: string, message: string) { super(`${path}: ${message}`); this.name = 'HttpToolError'; }
}

const NAME = /^[a-z][a-z0-9_]{1,39}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,40}(\.[A-Za-z_][A-Za-z0-9_]{0,40}){0,3}$/;
const HEADER = /^[A-Za-z][A-Za-z0-9-]{0,40}$/;
// Hosts that point back inside a network: refused so a tool can never reach VP's own services or a cloud metadata
// endpoint. Literal IPs are refused outright (a public API has a name). DNS rebinding is the executor's job (it must
// re-check the resolved address before connecting).
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost|metadata\.google\.internal)$/i;
const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/** Check a spec as it will run: refuses with the field path and a plain reason. */
export function checkSpec(s: HttpToolSpec): HttpToolSpec {
  if (s.contract !== HTTP_TOOL_CONTRACT || s.kind !== 'http') throw new HttpToolError('kind', 'only HTTP tools are defined here');
  if (!NAME.test(s.name)) throw new HttpToolError('name', 'use lowercase letters, digits and underscores, starting with a letter (2 to 40 characters)');
  if (!s.description.trim() || s.description.length > 300) throw new HttpToolError('description', 'say in a sentence when she should use it (at most 300 characters)');
  if (!(IN_CALL_RISKS as readonly string[]).includes(s.risk)) throw new HttpToolError('risk', 'only tools that read, or write a note, can run during a call; anything that reaches people or spends needs an approval, which cannot happen mid-call');
  if (!Number.isInteger(s.timeoutMs) || s.timeoutMs < 100 || s.timeoutMs > MAX_TIMEOUT_MS) throw new HttpToolError('timeoutMs', `must be between 100 and ${MAX_TIMEOUT_MS} ms: she cannot leave a caller waiting longer`);
  const props = Object.entries(s.input?.properties ?? {});
  if (s.input?.type !== 'object' || props.length > 8) throw new HttpToolError('input', 'an object with at most 8 arguments');
  for (const [k, a] of props) {
    if (!NAME.test(k)) throw new HttpToolError(`input.properties.${k}`, 'argument names use lowercase letters, digits and underscores');
    if (!['string', 'number', 'integer', 'boolean'].includes(a.type)) throw new HttpToolError(`input.properties.${k}.type`, 'must be string, number, integer or boolean');
  }
  for (const r of s.input.required ?? []) if (!s.input.properties[r]) throw new HttpToolError('input.required', `"${r}" is not an argument`);
  let url: URL;
  try { url = new URL(s.request.url.replace(/\{[a-z][a-z0-9_]*\}/g, 'x')); } catch { throw new HttpToolError('request.url', 'is not a URL'); }
  if (url.protocol !== 'https:') throw new HttpToolError('request.url', 'must use https');
  if (PRIVATE_HOST.test(url.hostname) || IP_LITERAL.test(url.hostname)) throw new HttpToolError('request.url', 'must be a public host name, not an internal address or an IP');
  if (url.username || url.password) throw new HttpToolError('request.url', 'must not carry a user name or password; use an integration');
  if (!['GET', 'POST'].includes(s.request.method)) throw new HttpToolError('request.method', 'must be GET or POST');
  const placeholders = [...s.request.url.matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map(m => m[1]);
  for (const p of [...placeholders, ...(s.request.query ?? []), ...(s.request.body ?? [])]) if (!s.input.properties[p]) throw new HttpToolError('request', `"${p}" is not an argument`);
  if (s.request.method === 'GET' && s.request.body?.length) throw new HttpToolError('request.body', 'a GET request has no body');
  if (s.auth && (!HEADER.test(s.auth.header) || !s.auth.secretKey || !s.auth.integrationId)) throw new HttpToolError('auth', 'needs the integration, a header name and which of its secrets to send');
  if (!s.result?.fields?.length || s.result.fields.length > 12 || s.result.fields.some(f => !FIELD.test(f))) throw new HttpToolError('result.fields', 'list 1 to 12 response fields she may use, as dotted names');
  return s;
}

/** Validate the brain's arguments against the spec. Returns the clean arguments or throws with the reason. */
export function validateArgs(s: HttpToolSpec, args: unknown): Record<string, string | number | boolean> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new HttpToolError('args', 'must be an object');
  const a = args as Record<string, unknown>, out: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(a)) if (!s.input.properties[k]) throw new HttpToolError(`args.${k}`, 'is not an argument of this tool');
  for (const r of s.input.required ?? []) if (a[r] === undefined || a[r] === null || a[r] === '') throw new HttpToolError(`args.${r}`, 'is required');
  for (const [k, p] of Object.entries(s.input.properties)) {
    const v = a[k];
    if (v === undefined || v === null) continue;
    const ok = p.type === 'string' ? typeof v === 'string' : p.type === 'boolean' ? typeof v === 'boolean' : typeof v === 'number' && Number.isFinite(v) && (p.type !== 'integer' || Number.isInteger(v));
    if (!ok) throw new HttpToolError(`args.${k}`, `must be ${p.type === 'integer' ? 'a whole number' : `a ${p.type}`}`);
    if (p.enum && !p.enum.includes(v as string | number)) throw new HttpToolError(`args.${k}`, `must be one of: ${p.enum.join(', ')}`);
    if (typeof v === 'string' && v.length > (p.maxLength ?? 200)) throw new HttpToolError(`args.${k}`, 'is too long');
    if (typeof v === 'number' && ((p.minimum !== undefined && v < p.minimum) || (p.maximum !== undefined && v > p.maximum))) throw new HttpToolError(`args.${k}`, 'is out of range');
    out[k] = v as string | number | boolean;
  }
  return out;
}

export interface BuiltRequest { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string }

/** The exact request, with the secret filled in by the caller (the control plane); pass a mask to show it safely. */
export function buildRequest(s: HttpToolSpec, args: Record<string, string | number | boolean>, secret: string | null): BuiltRequest {
  let url = s.request.url.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, k) => encodeURIComponent(String(args[k] ?? '')));
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'Vyakti-Tool/1' };
  if (s.auth && secret !== null) headers[s.auth.header.toLowerCase()] = (s.auth.prefix ?? '') + secret;
  if (s.request.method === 'GET') {
    const u = new URL(url);
    for (const k of s.request.query ?? []) if (args[k] !== undefined) u.searchParams.set(k, String(args[k]));
    url = u.toString();
    return { method: 'GET', url, headers };
  }
  const body: Record<string, unknown> = {};
  for (const k of s.request.body ?? []) if (args[k] !== undefined) body[k] = args[k];
  return { method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

/** What she may use from a response: only the listed fields, flattened, at most RESULT_MAX_BYTES of JSON. */
export function readResult(s: HttpToolSpec, status: number, text: string): { ok: boolean; status: number; result: Record<string, unknown> } {
  if (status < 200 || status >= 300) return { ok: false, status, result: {} };
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, status, result: {} }; }
  const out: Record<string, unknown> = {};
  for (const f of s.result.fields) {
    let v: unknown = j;
    for (const part of f.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
    if (v === undefined || (typeof v === 'object' && v !== null)) continue;     // scalars only: no nested blobs reach the brain
    out[f] = typeof v === 'string' ? v.slice(0, 300) : v;
  }
  while (Buffer.byteLength(JSON.stringify(out)) > RESULT_MAX_BYTES) delete out[Object.keys(out).pop()!];
  return { ok: true, status, result: out };
}

/** The tool specs a ticket's agent carries (snapshots from its version's grants). */
export function ticketTools(agent: { tools: { name: string; config?: Record<string, unknown> }[] }): HttpToolSpec[] {
  return agent.tools.map(t => t.config?.spec as HttpToolSpec | undefined).filter((x): x is HttpToolSpec => !!x && x.kind === 'http');
}

