// POST /hooks/runtime/tools: the control-plane half of an in-call HTTP tool run (shared/contracts/http-tool.ts). The
// voice runtime asks, signed like every runtime hook, with { conversationId, toolName, args }; the control plane runs
// the tool from the call's OWN published agent version (never a spec the runtime sends), with the integration's
// secret (which never leaves here), the spec's timeout (at most 2.5 s), no redirects (node:https does not follow
// them), a 64 KB response cap, and a public address checked after DNS resolution and again at connect time. It answers { ok, status, result } with
// only the listed fields, or { ok: false, reason } in plain words. Only a live call may run tools, at most
// MAX_RUNS_PER_CALL times.
import { lookup as dnsLookup } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { Deps } from '../../app.ts';
import { one } from '../../db.ts';
import { HttpError, type Req, type Res } from '../../http.ts';
import { verify } from '../../runtime-client.ts';
import { obj, record, any, str, uuid } from '../../../shared/validate.ts';
import { buildRequest, checkSpec, readResult, ticketTools, validateArgs, HttpToolError, type HttpToolSpec } from '../../../shared/contracts/http-tool.ts';
import { open } from '../workspace/crypto.ts';

export const MAX_RUNS_PER_CALL = 12;
const body = obj({ conversationId: uuid(), toolName: str({ min: 1, max: 40 }), args: record(any(), { maxKeys: 8 }) });
const runs = new Map<string, number>();          // conversationId -> runs so far (this process; the cap is a guard, not billing)

export type ToolFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect: 'manual' }) =>
  Promise<{ status: number; text: () => Promise<string> }>;
/** The real request: node:https with a lookup that refuses an internal address AT CONNECT TIME, so a name that
 *  re-resolves between the check below and the connection (DNS rebinding) still cannot reach inside a network. */
const httpsFetch: ToolFetch = (url, init) => new Promise((ok, fail) => {
  const req = httpsRequest(url, {
    method: init.method, headers: init.headers, signal: init.signal,
    lookup: (host, opts, cb) => dnsLookup(host, { ...(opts as object), all: false }, (err, address, family) => {
      if (!err && privateAddress(String(address))) return cb(new Error('internal address'), '', 4);
      cb(err, address as string, family as number);
    }),
  }, res => {
    const chunks: Buffer[] = []; let size = 0;
    res.on('data', (c: Buffer) => { size += c.length; if (size <= 64_000) chunks.push(c); else req.destroy(new Error('response too large')); });
    res.on('end', () => ok({ status: res.statusCode ?? 0, text: async () => Buffer.concat(chunks).toString('utf8') }));
    res.on('error', fail);
  });
  req.on('error', fail);
  if (init.body) req.write(init.body);
  req.end();
});
let doFetch: ToolFetch = httpsFetch;
let resolve: (host: string) => Promise<string[]> = async host => (await lookup(host, { all: true })).map(a => a.address);
/** Tests: a fake network. */
export function setToolNetwork(f: ToolFetch | null, r?: ((host: string) => Promise<string[]>) | null): void {
  doFetch = f ?? httpsFetch;
  resolve = r ?? (async host => (await lookup(host, { all: true })).map(a => a.address));
}

/** An address inside a network: loopback, private, link-local (cloud metadata), CGNAT, unique-local, unspecified. */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return privateAddress(s.slice(7));
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80');
}

export async function runTool(deps: Deps, conversationId: string, toolName: string, args: unknown): Promise<Record<string, unknown>> {
  const cv = await one<{ workspace_id: string; status: string; config: { tools?: { name: string; config?: Record<string, unknown> }[] } | null }>(deps.pool,
    `SELECT cv.workspace_id, cv.status, v.config FROM conversation cv LEFT JOIN agent_version v ON v.id = cv.agent_version_id WHERE cv.id = $1`, [conversationId]);
  if (!cv) throw new HttpError(404, 'not_found', 'no such call');
  if (cv.status !== 'live') return { ok: false, reason: 'the call has ended' };
  const spec = ticketTools({ tools: cv.config?.tools ?? [] }).find(t => t.name === toolName);
  if (!spec) return { ok: false, reason: `this agent has no tool "${toolName}"` };
  const n = (runs.get(conversationId) ?? 0) + 1; runs.set(conversationId, n);
  if (n > MAX_RUNS_PER_CALL) return { ok: false, reason: 'too many tool runs on this call' };
  let clean: Record<string, string | number | boolean>;
  try { checkSpec(spec); clean = validateArgs(spec, args); }
  catch (e) { return { ok: false, reason: e instanceof HttpToolError ? e.message : 'the tool is not valid' }; }
  let secret: string | null = null;
  if (spec.auth) {
    const ig = await one<{ secret_ciphertext: string | null; status: string }>(deps.pool,
      'SELECT secret_ciphertext, status FROM integration WHERE id = $1 AND workspace_id = $2', [spec.auth.integrationId, cv.workspace_id]);
    if (!ig || ig.status !== 'connected' || !ig.secret_ciphertext) return { ok: false, reason: 'the tool\'s integration is not connected' };
    const secrets = JSON.parse(open(cv.workspace_id, 'integration', ig.secret_ciphertext)) as Record<string, string>;
    secret = secrets[spec.auth.secretKey] ?? null;
    if (secret === null) return { ok: false, reason: 'the tool\'s integration has no such secret' };
  }
  return execute(spec, clean, secret);
}

export async function execute(spec: HttpToolSpec, args: Record<string, string | number | boolean>, secret: string | null): Promise<Record<string, unknown>> {
  const req = buildRequest(spec, args, secret);
  const host = new URL(req.url).hostname;
  try {
    const addrs = await resolve(host);
    if (!addrs.length || addrs.some(privateAddress)) return { ok: false, reason: 'the tool\'s host resolves to an internal address' };
  } catch { return { ok: false, reason: 'the tool\'s host could not be found' }; }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), spec.timeoutMs);
  try {
    const r = await doFetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctl.signal, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) return { ok: false, status: r.status, reason: 'the tool answered with a redirect, which is not followed' };
    const out = readResult(spec, r.status, await r.text());
    return out.ok ? out : { ok: false, status: out.status, reason: out.status >= 200 && out.status < 300 ? 'the tool did not answer with JSON' : `the tool answered ${out.status}` };
  } catch (e) {
    if (e instanceof Error && e.message === 'internal address') return { ok: false, reason: 'the tool\'s host resolves to an internal address' };
    return { ok: false, reason: ctl.signal.aborted ? `the tool took longer than ${spec.timeoutMs} ms` : 'the tool could not be reached' };
  } finally { clearTimeout(timer); }
}

export function toolHookRoute(deps: Deps) {
  return async (req: Req): Promise<Res> => {
    const secret = process.env.VP_RUNTIME_SECRET;
    if (!secret || secret.length < 32) throw new HttpError(503, 'not_configured', 'the runtime hook is not configured');
    const sig = req.headers['x-vp-signature'];
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!raw || typeof sig !== 'string' || !verify(secret, raw, sig)) throw new HttpError(401, 'bad_signature', 'the signature is missing, stale or wrong');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, 'bad_json', 'the request body is not valid JSON'); }
    const b = body(parsed);
    return { body: await runTool(deps, b.conversationId, b.toolName, b.args) };
  };
}
