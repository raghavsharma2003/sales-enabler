// Who is calling. Three ways in, checked in this order:
//   1. API key "vp_<prefix>_<secret>": only sha256(secret) is stored, compared in constant time. Keys act
//      as builders and can never approve: approval_token.approver_id must be a real member.
//   2. Session cookie "vp_session": a random token; only its sha256 is stored. Mutations over a cookie
//      must be application/json, which a cross-site form cannot send without a CORS preflight we never grant.
//   3. x-vp-dev-member: only when VP_DEV_AUTH=1 and NODE_ENV is not production. For local tests.
// Passwords are scrypt(N=2^15) with a per-member salt.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Role } from '../shared/approval.ts';
import type { Actor } from './tools.ts';
import { one, type Queryable } from './db.ts';
import { HttpError, type Req } from './http.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 14 * 24 * 3600_000;

export interface Caller { workspaceId: string; actor: Actor; memberId?: string; apiKeyId?: string; via: 'key' | 'session' | 'dev' }

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function newApiKey(): { token: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  return { token: `vp_${prefix}_${secret}`, prefix, hash: sha(secret) };
}

export async function hashPassword(pw: string): Promise<string> {
  if (pw.length < 10) throw new HttpError(422, 'weak_password', 'use at least 10 characters');
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function checkPassword(pw: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  // Spend the same time whether or not the member exists, so login timing does not reveal accounts.
  const salt = parts.length === 3 ? Buffer.from(parts[1], 'base64url') : randomBytes(16);
  const key = await scrypt(pw, salt, 32, SCRYPT);
  if (parts.length !== 3) return false;
  const want = Buffer.from(parts[2], 'base64url');
  return want.length === key.length && timingSafeEqual(want, key);
}

export async function createSession(q: Queryable, memberId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await q.query('INSERT INTO session (member_id, token_hash, expires_at) VALUES ($1,$2,$3)', [memberId, sha(token), expiresAt]);
  return { token, expiresAt };
}

export async function endSession(q: Queryable, token: string): Promise<void> {
  await q.query('DELETE FROM session WHERE token_hash = $1', [sha(token)]);
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `vp_session=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expiresAt.toUTCString()}${secure}`;
}

function cookie(req: Req, name: string): string | undefined {
  for (const part of String(req.headers['cookie'] ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

export async function resolveCaller(q: Queryable, req: Req): Promise<Caller> {
  const auth = String(req.headers['authorization'] ?? '');
  const m = /^Bearer vp_([0-9a-f]{8})_([A-Za-z0-9_-]+)$/.exec(auth);
  if (m) {
    const row = await one<{ id: string; workspace_id: string; hash: string; revoked_at: Date | null; expires_at: Date | null; scopes: string[] }>(
      q, 'SELECT id, workspace_id, hash, revoked_at, expires_at, scopes FROM api_key WHERE prefix = $1', [m[1]]);
    const given = Buffer.from(sha(m[2]), 'hex');
    const stored = Buffer.from(row?.hash ?? '0'.repeat(64), 'hex');
    const match = stored.length === given.length && timingSafeEqual(stored, given);
    if (!row || !match || row.revoked_at || (row.expires_at && row.expires_at.getTime() < Date.now())) {
      throw new HttpError(401, 'unauthorised', 'that API key is not valid');
    }
    await q.query('UPDATE api_key SET last_used_at = now() WHERE id = $1', [row.id]);
    // Spend by a key is capped through budget rows with scope_type 'api_key' (server/ledger.ts reserve with apiKeyId).
    return { workspaceId: row.workspace_id, actor: { type: 'member', id: 'key:' + row.id, role: 'builder', scopes: row.scopes ?? [] }, apiKeyId: row.id, via: 'key' };
  }

  const tok = cookie(req, 'vp_session');
  if (tok) {
    const s = await one<{ member_id: string; workspace_id: string; role: Role }>(q,
      `SELECT s.member_id, m.workspace_id, m.role FROM session s JOIN member m ON m.id = s.member_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND m.status = 'active'`, [sha(tok)]);
    if (s) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // A cookie rides along on requests other sites make, so a cookie mutation must be one a browser preflights:
        // the media type's essence must be exactly application/json ('text/plain; x=application/json' is not), and a
        // browser that says the request came from another site is refused outright.
        const essence = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (essence !== 'application/json') throw new HttpError(415, 'json_only', 'send application/json');
        const site = String(req.headers['sec-fetch-site'] ?? '');
        if (site === 'cross-site' || site === 'same-site') throw new HttpError(403, 'cross_site', 'this request came from another site');
      }
      await q.query('UPDATE session SET last_seen_at = now() WHERE token_hash = $1', [sha(tok)]);
      return { workspaceId: s.workspace_id, actor: { type: 'member', id: s.member_id, role: s.role }, memberId: s.member_id, via: 'session' };
    }
  }

  const dev = req.headers['x-vp-dev-member'];
  if (dev && process.env.VP_DEV_AUTH === '1' && process.env.NODE_ENV !== 'production') {
    const mem = await one<{ id: string; workspace_id: string; role: Role }>(
      q, "SELECT id, workspace_id, role FROM member WHERE id = $1::uuid AND status = 'active'", [String(dev)]);
    if (mem) return { workspaceId: mem.workspace_id, actor: { type: 'member', id: mem.id, role: mem.role }, memberId: mem.id, via: 'dev' };
  }
  throw new HttpError(401, 'unauthorised', 'sign in or send an API key');
}
