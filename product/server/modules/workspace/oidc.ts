// OpenID Connect, the relying-party half: discovery, JWKS (fetched and cached), the code exchange and ID token checks.
// No library: node:crypto verifies RS256, PS256 and ES256 from JWKs. Anything else, `none` and every HMAC alg included,
// is refused before a key is looked at, so a token cannot pick a weaker check than the IdP's published keys allow.
// Every outbound request goes to a vetted public address (the webhook resolver's rules), never follows a redirect and
// reads at most 256 KB. VP_OIDC_ALLOW_PRIVATE=1 (tests only) allows a local fake IdP over http.
import { createPublicKey, verify as cryptoVerify, constants, type JsonWebKey, type KeyObject } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { isPrivateAddress } from './webhooks.ts';

export class OidcError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'OidcError'; }
}

const allowPrivate = () => process.env.VP_OIDC_ALLOW_PRIVATE === '1' && process.env.NODE_ENV !== 'production';
const MAX_BYTES = 256 * 1024, TIMEOUT_MS = 8000;
/** Clock skew allowed on exp, iat and nbf. */
export const SKEW_S = 60;
const ALGS = new Set(['RS256', 'PS256', 'ES256']);

/** An issuer or endpoint must be https on a public host (http and private hosts only under VP_OIDC_ALLOW_PRIVATE). */
export function checkOidcUrl(raw: string, what = 'the address'): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new OidcError('bad_url', `${what} is not a valid web address`); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && allowPrivate())) throw new OidcError('bad_url', `${what} must use https`);
  if (u.username || u.password || u.hash) throw new OidcError('bad_url', `${what} must not carry credentials or a fragment`);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate() && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && isPrivateAddress(host)))) {
    throw new OidcError('bad_url', `${what} is on a private network`);
  }
  return u;
}

async function vetted(u: URL): Promise<{ address: string; family: 4 | 6 }> {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs: { address: string; family: number }[];
  try { addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }); }
  catch { throw new OidcError('unreachable', `${u.host} did not resolve`); }
  if (!addrs.length) throw new OidcError('unreachable', `${u.host} did not resolve`);
  if (!allowPrivate() && addrs.some(a => isPrivateAddress(a.address))) throw new OidcError('bad_url', `${u.host} resolves to a private network`);
  return { address: addrs[0].address, family: addrs[0].family as 4 | 6 };
}

/** One request to a vetted address. Returns the status and parsed JSON (or null when the body is not JSON). */
export async function oidcRequest(raw: string, o: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; what?: string } = {}): Promise<{ status: number; json: any }> {
  const u = checkOidcUrl(raw, o.what);
  const ip = await vetted(u);
  return new Promise((resolve, reject) => {
    const headers = { accept: 'application/json', 'user-agent': 'vyakti-sso/1', ...(o.headers ?? {}), ...(o.body !== undefined ? { 'content-length': String(Buffer.byteLength(o.body)) } : {}) };
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, {
      method: o.method ?? 'GET', headers, signal: AbortSignal.timeout(TIMEOUT_MS),
      lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => (opts?.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family))) as never,
    }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BYTES) { req.destroy(); reject(new OidcError('too_large', `${u.host} sent more than 256 KB`)); } else chunks.push(c); });
      res.on('end', () => {
        let json: any = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
        resolve({ status: res.statusCode ?? 0, json });
      });
      res.on('error', () => reject(new OidcError('unreachable', `${u.host} closed the connection`)));
    });
    req.on('error', e => reject(e instanceof OidcError ? e : new OidcError('unreachable', `could not reach ${u.host}`)));
    req.end(o.body);
  });
}

export interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; [k: string]: unknown }

const discoveryCache = new Map<string, { at: number; doc: Discovery }>();
const DISCOVERY_TTL_MS = 3600_000;

export const discoveryUrl = (issuer: string) => issuer.replace(/\/+$/, '') + '/.well-known/openid-configuration';

/** Fetch and check the discovery document. Its issuer must equal the configured one exactly (OIDC Discovery 1.0 §4.3). */
export async function discover(issuer: string, o: { fresh?: boolean } = {}): Promise<Discovery> {
  const hit = discoveryCache.get(issuer);
  if (hit && !o.fresh && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.doc;
  checkOidcUrl(issuer, 'the issuer');
  const r = await oidcRequest(discoveryUrl(issuer), { what: 'the discovery address' });
  if (r.status !== 200 || !r.json || typeof r.json !== 'object') throw new OidcError('discovery_failed', `the discovery address answered ${r.status} without a configuration`);
  const d = r.json as Discovery;
  if (d.issuer !== issuer) throw new OidcError('issuer_mismatch', `the provider calls itself "${String(d.issuer).slice(0, 120)}", not the issuer you entered`);
  for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof d[k] !== 'string') throw new OidcError('discovery_incomplete', `the configuration has no ${k}`);
    checkOidcUrl(d[k], k);
  }
  discoveryCache.set(issuer, { at: Date.now(), doc: d });
  return d;
}

// ---- JWKS ---------------------------------------------------------------------------------------------------------

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string; kty?: string };
const jwksCache = new Map<string, { at: number; keys: Jwk[]; refetchedAt: number }>();
const JWKS_TTL_MS = 3600_000;
/** An unknown kid refetches the set (the IdP may have rotated), but at most once per this many ms per set. */
const JWKS_REFETCH_MIN_MS = 30_000;

async function fetchJwks(uri: string): Promise<Jwk[]> {
  const r = await oidcRequest(uri, { what: 'the key set address' });
  const keys = r.json?.keys;
  if (r.status !== 200 || !Array.isArray(keys)) throw new OidcError('jwks_failed', `the key set address answered ${r.status} without keys`);
  return keys.filter((k: unknown) => k && typeof k === 'object') as Jwk[];
}

export async function jwks(uri: string, o: { fresh?: boolean } = {}): Promise<Jwk[]> {
  const hit = jwksCache.get(uri);
  if (hit && !o.fresh && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys;
  const keys = await fetchJwks(uri);
  jwksCache.set(uri, { at: Date.now(), keys, refetchedAt: Date.now() });
  return keys;
}

/** For tests: forget cached discovery documents and key sets. */
export function clearOidcCaches() { discoveryCache.clear(); jwksCache.clear(); }

const familyOf = (alg: string) => (alg === 'ES256' ? 'EC' : 'RSA');

function pickKey(keys: Jwk[], kid: string | undefined, alg: string): Jwk | null {
  const usable = keys.filter(k => k.kty === familyOf(alg) && (!k.use || k.use === 'sig') && (!k.alg || k.alg === alg));
  if (kid !== undefined) return usable.find(k => k.kid === kid) ?? null;
  return usable.length === 1 ? usable[0] : null;      // no kid: only an unambiguous set is acceptable
}

async function keyFor(uri: string, kid: string | undefined, alg: string): Promise<KeyObject> {
  let k = pickKey(await jwks(uri), kid, alg);
  if (!k) {
    const hit = jwksCache.get(uri);
    if (!hit || Date.now() - hit.refetchedAt >= JWKS_REFETCH_MIN_MS) {
      const keys = await fetchJwks(uri);
      jwksCache.set(uri, { at: Date.now(), keys, refetchedAt: Date.now() });
      k = pickKey(keys, kid, alg);
    }
  }
  if (!k) throw new OidcError('unknown_kid', 'the token was signed with a key the provider does not publish');
  try { return createPublicKey({ key: k, format: 'jwk' }); } catch { throw new OidcError('bad_key', 'the provider published a key that cannot be read'); }
}

// ---- ID token -----------------------------------------------------------------------------------------------------

export interface IdClaims { iss: string; sub: string; aud: string | string[]; exp: number; iat?: number; nbf?: number; nonce?: string; azp?: string;
  email?: string; email_verified?: boolean | string; name?: string; [k: string]: unknown }

const b64json = (s: string, what: string) => {
  try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); } catch { throw new OidcError('malformed', `the token ${what} is not readable`); }
};

/** Verify an ID token: allowed alg, a published key, the signature, then iss, aud (and azp), exp, iat, nbf and nonce. */
export async function verifyIdToken(token: string, want: { issuer: string; clientId: string; nonce: string; jwksUri: string; now?: number }): Promise<IdClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]*$/.test(p))) throw new OidcError('malformed', 'the ID token is not a signed JWT');
  const header = b64json(parts[0], 'header');
  const alg = String(header?.alg ?? '');
  if (!ALGS.has(alg)) throw new OidcError('bad_alg', `the ID token uses ${alg === 'none' ? 'no signature' : `the ${alg.slice(0, 12) || 'unnamed'} algorithm`}, which is not accepted`);
  if (header.crit !== undefined) throw new OidcError('bad_alg', 'the ID token asks for extensions this server does not support');
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const key = await keyFor(want.jwksUri, kid, alg);
  const data = Buffer.from(`${parts[0]}.${parts[1]}`), sig = Buffer.from(parts[2], 'base64url');
  const ok = alg === 'RS256' ? cryptoVerify('sha256', data, key, sig)
    : alg === 'PS256' ? cryptoVerify('sha256', data, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, sig)
    : cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) throw new OidcError('bad_signature', 'the ID token signature does not match');

  const c = b64json(parts[1], 'body') as IdClaims;
  const now = Math.floor((want.now ?? Date.now()) / 1000);
  if (c.iss !== want.issuer) throw new OidcError('wrong_iss', 'the ID token was issued by a different provider');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(want.clientId)) throw new OidcError('wrong_aud', 'the ID token was issued for a different application');
  if (aud.length > 1 && c.azp !== want.clientId) throw new OidcError('wrong_aud', 'the ID token names several applications but not this one as its party');
  if (c.azp !== undefined && c.azp !== want.clientId) throw new OidcError('wrong_aud', 'the ID token was requested by a different application');
  if (typeof c.exp !== 'number' || c.exp + SKEW_S <= now) throw new OidcError('expired', 'the ID token has expired');
  if (c.iat !== undefined && (typeof c.iat !== 'number' || c.iat - SKEW_S > now)) throw new OidcError('bad_iat', 'the ID token says it was issued in the future');
  if (c.nbf !== undefined && (typeof c.nbf !== 'number' || c.nbf - SKEW_S > now)) throw new OidcError('bad_nbf', 'the ID token is not valid yet');
  if (typeof c.nonce !== 'string' || c.nonce !== want.nonce) throw new OidcError('wrong_nonce', 'the ID token does not belong to this sign-in');
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) throw new OidcError('malformed', 'the ID token has no subject');
  return c;
}

/** Exchange the authorization code (client_secret_basic + PKCE verifier) and return the raw ID token. */
export async function exchangeCode(d: Discovery, o: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }): Promise<string> {
  const basic = Buffer.from(`${encodeURIComponent(o.clientId)}:${encodeURIComponent(o.clientSecret)}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, code_verifier: o.verifier }).toString();
  const r = await oidcRequest(d.token_endpoint, { method: 'POST', body, what: 'the token address',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` } });
  if (r.status !== 200 || typeof r.json?.id_token !== 'string') {
    const err = typeof r.json?.error === 'string' ? r.json.error.replace(/[^a-z_]/g, '').slice(0, 40) : String(r.status);
    throw new OidcError('token_exchange_failed', `the provider refused the sign-in code (${err})`);
  }
  return r.json.id_token;
}
