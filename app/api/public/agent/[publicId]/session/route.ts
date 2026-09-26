import { closePublicSession, issuePublicSession, resolvePublicSession } from '@/lib/deployments/engine';
import { publicBody, publicError, publicGatewayUrl, publicJson, publicOptions, publicOrigin } from '@/lib/public-agent/http';
import { azureRealtimeConnection } from '@/lib/public-agent/protocol';
import { HttpError } from '@/lib/server/http';
import { closePublicChatHistory } from '@/lib/public-agent/service';
export const runtime = 'nodejs';
type Context = { params: Promise<{ publicId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { publicId } = await context.params, origin = publicOrigin(request), body = await publicBody(request);
    if (body.action === 'close') {
      if (typeof body.token !== 'string') throw new HttpError(400, 'Session token is required.');
      // Revoke inference capability before retaining history or enqueueing optional learning.
      // Historical retention authenticates the token hash/origin even after closure or expiry.
      await closePublicSession(body.token, origin);
      await closePublicChatHistory(body.token, origin, publicId);
      return publicJson({ closed: true }, origin);
    }
    if (body.purpose !== 'voice' && body.purpose !== 'chat') throw new HttpError(400, 'Choose voice or chat.');
    if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(body.requestId)) throw new HttpError(400, 'A unique request ID is required.');
    if (body.purpose === 'voice') { azureRealtimeConnection(); if (!publicGatewayUrl()) throw new HttpError(503, 'Voice is unavailable. Please use text chat.'); }
    // Only use an explicitly configured, ingress-overwritten header. Otherwise share the safe unknown bucket.
    const ipHeader = process.env.PUBLIC_TRUSTED_IP_HEADER;
    const ipAddress = ipHeader && /^[a-z0-9-]{1,80}$/.test(ipHeader) ? request.headers.get(ipHeader)?.split(',')[0]?.trim() : undefined;
    const session = await issuePublicSession(publicId, { origin, ipAddress, requestId: body.requestId, purpose: body.purpose });
    return publicJson({ token: session.token, nonce: session.nonce, expiresAt: session.expiresAt, deployment: session.deployment, voiceGatewayUrl: publicGatewayUrl() }, origin, 201);
  } catch (error) { return publicError(error); }
}
export async function OPTIONS(request: Request, context: Context) { return publicOptions(request, (await context.params).publicId); }
