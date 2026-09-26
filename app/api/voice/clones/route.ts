import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, HttpError, json } from '@/lib/server/http';
import { MAX_REQUEST } from '@/lib/voice/cloning/audio';
import { enrollClone, listClones } from '@/lib/voice/cloning/service';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await listClones(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) throw new HttpError(415, 'Send a multipart audio upload.');
    if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST) throw new HttpError(413, 'Audio upload exceeds 21 MiB.');
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Audio upload is required.');
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_REQUEST) { await reader.cancel(); throw new HttpError(413, 'Audio upload exceeds 21 MiB.'); }
      chunks.push(part.value);
    }
    const bounded = new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type')! }, body: Buffer.concat(chunks) });
    return json(await enrollClone(user, await bounded.formData()), 201);
  } catch (error) { return apiError(error); }
}
