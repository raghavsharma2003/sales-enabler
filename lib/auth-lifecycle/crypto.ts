import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function lifecycleKey(): Buffer {
  const value = process.env.AUTH_LIFECYCLE_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Account email configuration is unavailable.');
  return Buffer.from(value, 'hex');
}
export function privateDigest(value: string): string { return createHmac('sha256', lifecycleKey()).update(value).digest('hex'); }
export function seal(value: unknown): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', lifecycleKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString('base64')).join('.');
}
export function unseal<T>(value: string): T {
  const [iv, tag, encrypted] = value.split('.').map(item => Buffer.from(item, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', lifecycleKey(), iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8')) as T;
}
