import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/server/db';
import { apiError, HttpError, json } from '@/lib/server/http';
import { connectionKey, openCredentials } from '@/lib/integrations/vault';
import { saveInbound, saveStatus } from '@/lib/messaging/service';

export const runtime = 'nodejs';
const MAX_BYTES = 1_048_576;
const attempts = new Map<string, { count: number; until: number }>();
function limited(id: string): void {
  const now = Date.now();
  if (attempts.size > 1000) for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const prior = attempts.get(id);
  const next = prior && prior.until > now ? prior : { count: 0, until: now + 60_000 };
  next.count++; attempts.set(id, next);
  if (next.count > 120) throw new HttpError(429, 'Webhook rate limit exceeded.');
}
async function connection(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpError(404, 'Webhook not found.');
  const [row] = await (await db()).all('SELECT organization_id,data FROM entities WHERE id=? AND kind=?', [id, 'integration:vault']);
  if (!row) throw new HttpError(404, 'Webhook not found.');
  const tenantId = String(row.organization_id);
  if (connectionKey(tenantId, 'whatsapp_cloud') !== id) throw new HttpError(404, 'Webhook not found.');
  const value = JSON.parse(String(row.data)) as { id: string; integrationId: string; status: string; sealed: string };
  if (value.id !== id || value.integrationId !== 'whatsapp_cloud') throw new HttpError(404, 'Webhook not found.');
  const credentials = openCredentials(tenantId, id, value.sealed);
  return { tenantId, value, credentials };
}
function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function GET(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await context.params;
    const { credentials } = await connection(connectionId);
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode') || '';
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (mode !== 'subscribe' || !credentials.verifyToken || !token || !equalSecret(credentials.verifyToken, token) || !/^\d{1,200}$/.test(challenge)) throw new HttpError(403, 'Webhook verification failed.');
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await context.params;
    const { tenantId, value, credentials } = await connection(connectionId);
    if (value.status !== 'connected' || !credentials.appSecret || !credentials.verifyToken || !credentials.phoneNumberId) throw new HttpError(404, 'Webhook not configured.');
    const signature = request.headers.get('x-hub-signature-256') || '';
    if (!/^sha256=[0-9a-fA-F]{64}$/.test(signature)) throw new HttpError(401, 'Webhook signature is required.');
    if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) throw new HttpError(413, 'Webhook payload is too large.');
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Webhook payload is required.');
    const chunks: Uint8Array[] = []; let count = 0;
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      count += next.value.byteLength;
      if (count > MAX_BYTES) { await reader.cancel(); throw new HttpError(413, 'Webhook payload is too large.'); }
      chunks.push(next.value);
    }
    const raw = Buffer.concat(chunks);
    const expected = createHmac('sha256', credentials.appSecret).update(raw).digest();
    const received = Buffer.from(signature.slice(7), 'hex');
    if (!timingSafeEqual(expected, received)) throw new HttpError(401, 'Webhook signature is invalid.');
    limited(connectionId);
    let payload: unknown;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Webhook payload must be JSON.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError(400, 'Webhook payload must be an object.');
    const envelope = payload as { object?: unknown; entry?: unknown };
    if (envelope.object !== 'whatsapp_business_account' || !Array.isArray(envelope.entry) || envelope.entry.length > 20) throw new HttpError(400, 'Unsupported WhatsApp webhook payload.');
    let accepted = 0, duplicates = 0;
    for (const item of envelope.entry) {
      const changes = item && typeof item === 'object' ? (item as { changes?: unknown }).changes : undefined;
      if (!Array.isArray(changes) || changes.length > 20) continue;
      for (const change of changes) {
        if (!change || typeof change !== 'object' || (change as { field?: unknown }).field !== 'messages') continue;
        const value = (change as { value?: unknown }).value;
        if (!value || typeof value !== 'object') continue;
        const body = value as { metadata?: { phone_number_id?: unknown }; messaging_product?: unknown; messages?: unknown; statuses?: unknown };
        if (body.messaging_product !== 'whatsapp' || body.metadata?.phone_number_id !== credentials.phoneNumberId) continue;
        const messages = Array.isArray(body.messages) ? body.messages.slice(0, 100) : [];
        const statuses = Array.isArray(body.statuses) ? body.statuses.slice(0, 100) : [];
        for (const message of messages) {
          if (!message || typeof message !== 'object') continue;
          const saved = await saveInbound(tenantId, connectionId, credentials.phoneNumberId, message as { id: string; from: string; timestamp: string; type?: string; text?: { body?: string } });
          saved ? accepted++ : duplicates++;
        }
        for (const status of statuses) {
          if (!status || typeof status !== 'object') continue;
          const saved = await saveStatus(tenantId, connectionId, status as { id: string; status: string; timestamp?: string; recipient_id?: string });
          saved ? accepted++ : duplicates++;
        }
      }
    }
    return json({ accepted, duplicates }, 200);
  } catch (error) { return apiError(error); }
}
