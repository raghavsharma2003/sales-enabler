import { resolvePublicSession } from '@/lib/deployments/engine';
import { publicChat } from '@/lib/public-agent/service';
import { publicBody, publicError, publicJson, publicOptions, publicOrigin } from '@/lib/public-agent/http';
import { HttpError } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await context.params, origin = publicOrigin(request), body = await publicBody(request);
    if (typeof body.token !== 'string' || typeof body.nonce !== 'string' || typeof body.requestId !== 'string' || typeof body.message !== 'string') throw new HttpError(400, 'Session, request ID and message are required.');
    const authority = await resolvePublicSession(body.token, { origin, purpose: 'chat' });
    if (authority.deployment.data.publicId !== publicId) throw new HttpError(403, 'Session does not belong to this assistant.');
    return publicJson(await publicChat({ token: body.token, nonce: body.nonce, requestId: body.requestId, message: body.message, origin, signal: request.signal }), origin);
  } catch (error) { return publicError(error); }
}
export async function OPTIONS(request: Request, context: { params: Promise<{ publicId: string }> }) { return publicOptions(request, (await context.params).publicId); }
