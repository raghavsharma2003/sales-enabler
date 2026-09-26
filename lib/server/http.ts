export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'HttpError'; }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next may normalize request.url to localhost in development. The actual Host
  // header retains the browser's origin; deployed APP_URL remains authoritative.
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : `${url.protocol}//${request.headers.get('host') || url.host}`;
  if (!origin || origin !== expected) throw new HttpError(403, 'Request origin is not allowed.');
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new HttpError(415, 'Send JSON content.');
  if (Number(request.headers.get('content-length') || 0) > 524288) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Request body is required.');
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > 524288) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); }
    chunks.push(chunk.value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, 'A valid JSON object is required.'); }
}

export function field(body: Record<string, unknown>, key: string, max = 1000, required = true): string {
  const value = body[key];
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, `${key} must be text between 1 and ${max} characters.`);
  return value.trim();
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('Workspace request failed', error instanceof Error ? error.message : 'unknown error');
  return json({ error: 'The request could not be completed. Please try again.' }, 500);
}
