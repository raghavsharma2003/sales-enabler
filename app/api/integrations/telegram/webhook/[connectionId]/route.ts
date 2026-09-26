import { db } from '@/lib/server/db';
import { apiError, HttpError, json, readBody } from '@/lib/server/http';
import { connectionKey, openCredentials } from '@/lib/integrations/vault';
import { enqueueChannelIncoming } from '@/lib/channel-agents/service';
import { parseTelegramIncoming, verifyTelegramSecret } from '@/lib/channel-agents/telegram';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(connectionId)) throw new HttpError(404, 'Webhook not found.');
    const [row] = await (await db()).all('SELECT organization_id,data,status FROM entities WHERE id=? AND kind=?', [connectionId, 'integration:vault']);
    if (!row || row.status !== 'connected') throw new HttpError(404, 'Webhook not available.');
    const org = String(row.organization_id);
    const connection = JSON.parse(String(row.data)) as { integrationId: string; sealed: string; status: string };
    if (connectionKey(org, 'telegram') !== connectionId || connection.integrationId !== 'telegram' || connection.status !== 'connected') throw new HttpError(404, 'Webhook not found.');
    const credentials = openCredentials(org, connectionId, connection.sealed);
    if (!credentials.webhookSecret || !verifyTelegramSecret(request.headers.get('x-telegram-bot-api-secret-token') || '', credentials.webhookSecret)) throw new HttpError(401, 'Telegram webhook authentication failed.');
    const incoming = parseTelegramIncoming(await readBody(request));
    if (!incoming) return json({ accepted: false, ignored: true });
    const accepted = await enqueueChannelIncoming({ org, channel: 'telegram', connectionId, providerEventId: String(incoming.update_id), participant: String(incoming.message.chat.id), text: incoming.message.text, providerAt: new Date(incoming.message.date * 1000).toISOString() });
    return json({ accepted });
  } catch (error) { return apiError(error); }
}
