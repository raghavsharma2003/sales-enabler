// Plivo's request signature, X-Plivo-Signature-V3 with X-Plivo-Signature-V3-Nonce, on every Plivo-facing route of the
// control plane. The algorithm is Plivo's own SDK's (plivo-python plivo/utils/signature_v3.py, read 2026-10-24; concept
// page https://www.plivo.com/docs/voice/concepts/signature-validation, same date):
//   base (GET, or POST without body params) = scheme://host[:port]/path + ('?' + sorted query, when there is one)
//   base (POST with body params)            = scheme://host[:port]/path + '?' + sorted query + ('.' when there is a query)
//                                             + key1value1key2value2... (keys sorted, a repeated key's values sorted)
//   sorted query = 'k=v&k=v2&...' over the decoded query, keys sorted, a key's values sorted
//   signature    = base64(hmac_sha256(auth token, base + '.' + nonce)); the header may carry several, comma-separated
// The URL is the PUBLIC one Plivo was given (VP_PUBLIC_URL + path + query), not the address the proxy forwards to.
// tests/fixtures/plivo-v3-vectors.json (scripts/plivo-v3-vectors.py, a transcription of the SDK) pins it.
// A nonce is accepted once (plivo_nonce): a captured request replayed later is refused even with a good signature.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Queryable } from '../../db.ts';
import { HttpError, type Req } from '../../http.ts';

type Params = Map<string, string[]>;

function addAll(m: Params, entries: Iterable<[string, string]>): Params {
  for (const [k, v] of entries) m.set(k, [...(m.get(k) ?? []), v]);
  return m;
}
const keys = (m: Params) => [...m.keys()].sort();
const vals = (m: Params, k: string) => [...m.get(k)!].sort();

export function plivoBase(method: string, url: string, body: Params = new Map()): string {
  const noFrag = url.split('#')[0];
  const at = noFrag.indexOf('?');
  const head = at < 0 ? noFrag : noFrag.slice(0, at);
  const query = addAll(new Map(), new URLSearchParams(at < 0 ? '' : noFrag.slice(at + 1)));
  if (method.toUpperCase() === 'GET') for (const [k, v] of body) query.set(k, [...(query.get(k) ?? []), ...v]);
  const q = keys(query).map(k => vals(query, k).map(v => `${k}=${v}`).join('&')).join('&');
  if (method.toUpperCase() === 'GET' || body.size === 0) return q ? `${head}?${q}` : head;
  return `${head}?${q}${q ? '.' : ''}${keys(body).map(k => vals(body, k).map(v => k + v).join('')).join('')}`;
}

export function plivoSign(token: string, base: string, nonce: string): string {
  return createHmac('sha256', token).update(`${base}.${nonce}`).digest('base64');
}

/** True when any comma-separated signature in `header` was made with one of `tokens` over this request. */
export function plivoValid(o: { method: string; url: string; body?: Params; nonce: string; header: string; tokens: string[] }): boolean {
  const base = plivoBase(o.method, o.url, o.body);
  const given = o.header.split(',').map(s => s.trim()).filter(Boolean);
  for (const t of o.tokens.filter(Boolean)) {
    const want = Buffer.from(plivoSign(t, base, o.nonce));
    if (given.some(g => { const b = Buffer.from(g); return b.length === want.length && timingSafeEqual(b, want); })) return true;
  }
  return false;
}

/** The form body Plivo posts (application/x-www-form-urlencoded), or none. */
export function formParams(req: Req): Params {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const ct = String(req.headers['content-type'] ?? '');
  return raw && /x-www-form-urlencoded/i.test(ct) ? addAll(new Map(), new URLSearchParams(raw)) : new Map();
}

export function publicBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
}

/** Refuses (401, no XML: Plivo then ends the call) unless the request carries a fresh, valid V3 signature. The account's
 *  token (PLIVO_AUTH_TOKEN, a sub-account's when the number lives there) signs X-Plivo-Signature-V3; the main account's
 *  (PLIVO_MAIN_AUTH_TOKEN, optional) signs X-Plivo-Signature-Ma-V3. Returns the form body. */
export async function requirePlivo(q: Queryable, req: Req, env: NodeJS.ProcessEnv = process.env): Promise<Params> {
  const base = publicBase(env), token = env.PLIVO_AUTH_TOKEN ?? '', main = env.PLIVO_MAIN_AUTH_TOKEN ?? '';
  if (!base || !token) throw new HttpError(503, 'not_configured', 'carrier callbacks are not configured on this server');
  const nonce = req.headers['x-plivo-signature-v3-nonce'];
  const v3 = req.headers['x-plivo-signature-v3'], ma = req.headers['x-plivo-signature-ma-v3'];
  if (typeof nonce !== 'string' || !nonce || nonce.length > 200) throw new HttpError(401, 'bad_signature', 'the carrier signature is missing');
  const qs = req.query.toString();
  const url = base + req.path + (qs ? '?' + qs : '');
  const body = formParams(req);
  const ok = (typeof v3 === 'string' && plivoValid({ method: req.method, url, body, nonce, header: v3, tokens: [token] }))
    || (typeof ma === 'string' && !!main && plivoValid({ method: req.method, url, body, nonce, header: ma, tokens: [main] }));
  if (!ok) throw new HttpError(401, 'bad_signature', 'the carrier signature is missing or wrong');
  const fresh = await q.query('INSERT INTO plivo_nonce (nonce) VALUES ($1) ON CONFLICT DO NOTHING', [nonce]);
  if (!fresh.rowCount) throw new HttpError(401, 'replayed', 'this carrier request was already received');
  return body;
}
