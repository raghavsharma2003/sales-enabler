import { createHash, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { userInfo } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { db } from '../server/db';
import { lifecycleKey, unseal } from './crypto';

export type AccountMail = { email: string; url: string; purpose: 'reset' | 'verify' };
type DeliveryConfig = { mode: 'azure'; endpoint: URL; key: string; sender: string } | { mode: 'local'; path: string };
export function deliveryConfig(): DeliveryConfig {
  lifecycleKey();
  const app = new URL(process.env.APP_URL || '');
  if (app.username || app.password || app.search || app.hash || app.pathname !== '/') throw new Error('Account email configuration is unavailable.');
  const path = process.env.AUTH_DEV_MAIL_OUTBOX;
  if (path && process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname) && isAbsolute(path)) return { mode: 'local', path };
  if (app.protocol !== 'https:') throw new Error('Account email configuration is unavailable.');
  const endpoint = new URL(process.env.AZURE_COMMUNICATION_EMAIL_ENDPOINT || '');
  const key = process.env.AZURE_COMMUNICATION_EMAIL_ACCESS_KEY || '', sender = process.env.AZURE_COMMUNICATION_EMAIL_SENDER || '';
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.communication[s]?\.azure\.com$/.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || !/^[A-Za-z0-9+/]+={0,2}$/.test(key) || Buffer.from(key, 'base64').length < 32 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) throw new Error('Account email configuration is unavailable.');
  return { mode: 'azure', endpoint, key, sender };
}
export function deliveryReadiness(): 'azure-configured' | 'local-outbox' | 'setup-required' {
  try { return deliveryConfig().mode === 'azure' ? 'azure-configured' : 'local-outbox'; } catch { return 'setup-required'; }
}
// Microsoft ACS HMAC contract: method LF path+query LF date;host;SHA256(body).
export function azureHeaders(url: URL, body: string, key: string, date = new Date().toUTCString()): Record<string, string> {
  const hash = createHash('sha256').update(body).digest('base64');
  const signature = createHmac('sha256', Buffer.from(key, 'base64')).update(`POST\n${url.pathname}${url.search}\n${date};${url.host};${hash}`).digest('base64');
  return { 'content-type': 'application/json', 'x-ms-date': date, 'x-ms-content-sha256': hash, Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}` };
}
/** Claim once, before any external action. A crash/timeout leaves uncertain work; never auto-resend it. */
export async function dispatchAccountMail(id: string): Promise<void> {
  const database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND kind = ? AND status = ?', [id, 'auth:mail', 'queued']);
  if (!row) return;
  let mail: AccountMail, config: DeliveryConfig;
  try { mail = unseal<AccountMail>(JSON.parse(String(row.data)) as string); config = deliveryConfig(); }
  catch { await database.run('UPDATE entities SET status = ? WHERE id = ? AND status = ?', ['setup-required', id, 'queued']); return; }
  if (await database.run('UPDATE entities SET status = ? WHERE id = ? AND status = ?', ['uncertain', id, 'queued']) !== 1) return;
  let status = 'uncertain';
  try {
    // Keep the filesystem transport behind a literal build-time NODE_ENV guard as well as
    // deliveryConfig's runtime checks. Production tracing must never enumerate the outbox.
    if (process.env.NODE_ENV === 'development' && config.mode === 'local') {
      await mkdir(config.path, { recursive: true, mode: 0o700 });
      const directory = join(/* turbopackIgnore: true */ config.path, id.replace(/:/g, '-'));
      await mkdir(directory, { mode: 0o700 });
      if (process.platform === 'win32') await promisify(execFile)('icacls.exe', [directory, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { windowsHide: true });
      await writeFile(join(/* turbopackIgnore: true */ directory, 'message.json'), JSON.stringify(mail), { flag: 'wx', mode: 0o600 });
      status = 'local-outbox';
    } else if (config.mode === 'azure') {
      const url = new URL('/emails:send?api-version=2023-03-31', config.endpoint);
      const body = JSON.stringify({ senderAddress: config.sender, recipients: { to: [{ address: mail.email }] }, content: { subject: mail.purpose === 'reset' ? 'Reset your workspace password' : 'Verify your workspace email', plainText: `${mail.purpose === 'reset' ? 'Reset your password' : 'Verify your email'} using this single-use link:\n${mail.url}\nIf you did not request this, ignore this message.` } });
      const response = await fetch(url, { method: 'POST', headers: { ...azureHeaders(url, body, config.key), 'Operation-Id': id.slice('auth:mail:'.length) }, body, redirect: 'error', signal: AbortSignal.timeout(12000) });
      // No provider body is needed or logged; cancel it to bound memory and avoid reflecting secrets.
      await response.body?.cancel();
      status = response.status === 202 ? 'provider-accepted' : response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429 ? 'rejected' : 'uncertain';
    } else status = 'setup-required';
  } catch { /* Provider may have accepted the operation. Keep the durable uncertain reservation. */ }
  await database.run('UPDATE entities SET status = ?, data = ? WHERE id = ? AND status = ?', [status, '{}', id, 'uncertain']);
}
