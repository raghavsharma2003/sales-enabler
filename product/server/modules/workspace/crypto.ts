// Encryption and signing for the workspace module. Secrets (integration credentials, webhook signing
// secrets, one-time reveals) are AES-256-GCM under VP_SECRET_KEY and bound to the workspace they belong
// to (the workspace id is the GCM additional data), so a ciphertext copied into another workspace fails to open.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function secretKey(): Buffer {
  const raw = process.env.VP_SECRET_KEY ?? '';
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, 'hex');
  else if (raw) { const b = Buffer.from(raw, 'base64'); if (b.length === 32) key = b; }
  if (!key) throw new Error('VP_SECRET_KEY must be set to 32 random bytes as 64 hex characters or base64');
  return key;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. `purpose` and the workspace id are authenticated, not encrypted. */
export function seal(workspaceId: string, purpose: string, plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', secretKey(), iv);
  c.setAAD(Buffer.from(`${workspaceId}|${purpose}`));
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function open(workspaceId: string, purpose: string, sealed: string): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('unreadable secret');
  const d = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(`${workspaceId}|${purpose}`));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');

export interface ShareClaims { l: string; w: string; t: string; o: string; e: number }

function shareMac(body: string): Buffer {
  const k = createHmac('sha256', secretKey()).update('vp-share-link-v1').digest();
  return createHmac('sha256', k).update(body).digest();
}

/** A share token is `<claims>.<mac>`; the link row can still revoke it before it expires. */
export function signShare(c: ShareClaims): string {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url');
  return `${body}.${shareMac(body).toString('base64url')}`;
}

export function verifyShare(token: string, now = Date.now()): ShareClaims | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = shareMac(body), got = Buffer.from(mac, 'base64url');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ShareClaims;
    return typeof c.e === 'number' && c.e > now && c.l && c.w && c.t && c.o ? c : null;
  } catch { return null; }
}
