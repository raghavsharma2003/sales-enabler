import { HttpError } from '../server/http';
import { getPublicDeployment } from '../deployments/engine';

export function publicOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(403, 'An allowed browser origin is required.');
  return new URL(process.env.APP_URL || request.url).origin;
}

export async function publicBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Send JSON content.');
  if (Number(request.headers.get('content-length') || 0) > 8192) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'Request body is required.');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 8192) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); } chunks.push(next.value); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; } catch { throw new HttpError(400, 'A JSON object is required.'); }
}

export function publicJson(data: unknown, origin?: string, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}) } });
}
export function publicError(error: unknown) {
  return publicJson({ error: error instanceof HttpError ? error.message : 'This assistant is temporarily unavailable. No automatic retry was made.' }, undefined, error instanceof HttpError ? error.status : 503);
}
export async function publicOptions(request: Request, publicId: string) {
  try {
    const origin = publicOrigin(request); await getPublicDeployment(publicId, origin);
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '300', vary: 'Origin', 'cache-control': 'no-store' } });
  } catch (error) { return publicError(error); }
}
export function publicGatewayUrl() {
  const raw = process.env.PUBLIC_VOICE_GATEWAY_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/voice' || (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return null;
    return url.toString();
  } catch { return null; }
}
