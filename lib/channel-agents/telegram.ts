import { timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db } from '../server/db';
import { HttpError } from '../server/http';
import { getConnection, openCredentials } from '../integrations/vault';
import { ownerMembershipFence } from '../team/service';
import type { SendResult } from '../messaging/contracts';

export function verifyTelegramSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received), b = Buffer.from(expected);
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}
export type TelegramIncoming = { update_id: number; message: { message_id: number; date: number; text: string; chat: { id: number; type: 'private' }; from: { id: number; is_bot: false } } };
export function parseTelegramIncoming(value: unknown): TelegramIncoming | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as TelegramIncoming, m = v.message;
  if (!Number.isSafeInteger(v.update_id) || v.update_id < 0 || !m || !Number.isSafeInteger(m.message_id) || m.message_id < 1 ||
      !Number.isSafeInteger(m.date) || m.date * 1000 < Date.UTC(2020, 0, 1) || m.date * 1000 > Date.now() + 60_000 ||
      m.chat?.type !== 'private' || !Number.isSafeInteger(m.chat.id) || m.chat.id < 1 || m.from?.id !== m.chat.id || m.from.is_bot !== false ||
      typeof m.text !== 'string' || !m.text.trim() || m.text.length > 4096) return;
  return v;
}
async function telegramCall(token: string, method: 'getMe' | 'getWebhookInfo' | 'setWebhook', body: object, fetcher = fetch) {
  let response: Response;
  try { response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(12_000) }); }
  catch { throw new HttpError(502, 'Telegram did not return a response. Check the bot webhook before trying again.'); }
  if (!response.ok) throw new HttpError(502, `Telegram rejected the operation (HTTP ${response.status}).`);
  const payload = await response.json() as { ok?: boolean; result?: Record<string, unknown> };
  if (payload.ok !== true || !payload.result) throw new HttpError(502, 'Telegram returned an invalid response.');
  return payload.result;
}
/** Explicit operator activation only. Never called by webhook handling or background workers. */
export async function installTelegramWebhook(user: AuthUser, input: { acknowledgeReplace?: boolean }, fetcher = fetch) {
  const member = await ownerMembershipFence(user), connection = await getConnection(user, 'telegram');
  const credentials = openCredentials(user.organizationId, connection.id, connection.sealed);
  if (connection.status !== 'connected' || !credentials.webhookSecret) throw new HttpError(409, 'Configure and check the Telegram connection first.');
  let origin: URL;
  try { origin = new URL(process.env.APP_URL || ''); } catch { throw new HttpError(503, 'A public HTTPS APP_URL is required.'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.hostname === 'localhost' || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(origin.hostname)) throw new HttpError(503, 'A public HTTPS APP_URL is required.');
  const url = `${origin.origin}/api/integrations/telegram/webhook/${connection.id}`;
  const me = await telegramCall(credentials.token, 'getMe', {}, fetcher);
  if (me.is_bot !== true || String(me.id) !== connection.settings.botId) throw new HttpError(409, 'Telegram bot identity changed. Check and republish the deployment.');
  const info = await telegramCall(credentials.token, 'getWebhookInfo', {}, fetcher);
  if (typeof info.url !== 'string') throw new HttpError(502, 'Telegram webhook ownership could not be verified.');
  if (info.url && info.url !== url && input.acknowledgeReplace !== true) throw new HttpError(409, 'This bot already has another webhook. Explicitly acknowledge replacing it before activation.');
  await (await db()).batch([member, { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [connection.id, user.organizationId, 'integration:vault', JSON.stringify(connection), 'connected'], expectedChanges: 1 }]);
  // setWebhook returns a boolean result, unlike getMe/getWebhookInfo.
  let response: Response;
  try { response = await fetcher(`https://api.telegram.org/bot${credentials.token}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, secret_token: credentials.webhookSecret, allowed_updates: ['message'], max_connections: 5, drop_pending_updates: false }), cache: 'no-store', signal: AbortSignal.timeout(12_000) }); }
  catch { throw new HttpError(502, 'Webhook installation is uncertain. Check Telegram before activating again.'); }
  const result = await response.json() as { ok?: boolean; result?: boolean };
  if (!response.ok || result.ok !== true || result.result !== true) throw new HttpError(502, 'Telegram did not confirm webhook installation.');
  return { webhookUrl: url, botUsername: typeof me.username === 'string' ? me.username : undefined };
}
export async function sendTelegramText(input: { token: string; participant: string; text: string }, fetcher = fetch): Promise<SendResult> {
  let response: Response;
  try { response = await fetcher(`https://api.telegram.org/bot${input.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: input.participant, text: input.text, link_preview_options: { is_disabled: true } }), cache: 'no-store', signal: AbortSignal.timeout(12_000) }); }
  catch { return { state: 'uncertain', reason: 'Telegram send ended without a response. Do not resend automatically.' }; }
  if (!response.ok) return { state: response.status >= 500 || response.status === 429 ? 'uncertain' : 'rejected', reason: `Telegram returned HTTP ${response.status}.` };
  try {
    const payload = await response.json() as { ok?: boolean; result?: { message_id?: number; chat?: { id?: number } } };
    if (payload.ok === true && Number.isSafeInteger(payload.result?.message_id) && String(payload.result?.chat?.id) === input.participant) return { state: 'accepted', providerId: String(payload.result!.message_id) };
  } catch { /* success without usable receipt is uncertain */ }
  return { state: 'uncertain', reason: 'Telegram returned success without a matching message receipt.' };
}
