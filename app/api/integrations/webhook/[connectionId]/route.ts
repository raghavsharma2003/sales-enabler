import { createHmac, timingSafeEqual } from 'node:crypto';
import { apiError, HttpError, json } from '@/lib/server/http';
import { openCredentials, webhookConnection } from '@/lib/integrations/vault';
import { stageWebhook, webhookActor } from '@/lib/integrations/service';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await context.params;
    const { tenantId, value } = await webhookConnection(connectionId);
    const eventId = request.headers.get('x-integration-event-id') || '';
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(eventId)) throw new HttpError(400, 'A unique event ID is required.');
    const signature = request.headers.get('x-integration-signature') || '';
    if (!/^sha256=[a-fA-F0-9]{64}$/.test(signature)) throw new HttpError(401, 'Webhook signature is required.');
    if (Number(request.headers.get('content-length') || 0) > 1_048_576) throw new HttpError(413, 'Webhook payload is too large.');
    const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'Webhook payload is required.');
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > 1_048_576) { await reader.cancel(); throw new HttpError(413, 'Webhook payload is too large.'); }
      chunks.push(next.value);
    }
    const raw = Buffer.concat(chunks);
    const secret = openCredentials(tenantId, value.id, value.sealed).token;
    const expected = createHmac('sha256', secret).update(raw).digest();
    const received = Buffer.from(signature.slice(7), 'hex');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new HttpError(401, 'Webhook signature is invalid.');
    const content = raw.toString('utf8');
    try { const parsed = JSON.parse(content); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); }
    catch { throw new HttpError(400, 'Webhook payload must be a JSON object.'); }
    const bounded = content.length <= 200_000 ? content : JSON.stringify({ truncated: true, contentExcerpt: content.slice(0, 180_000) });
    const result = await stageWebhook(await webhookActor(tenantId), value.id, value.revision, eventId, bounded);
    return json(result, result.accepted ? 202 : 200);
  } catch (error) { return apiError(error); }
}
