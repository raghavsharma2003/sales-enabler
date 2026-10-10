import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, HttpError, json, readBody } from '@/lib/server/http';
import { createAudioComparison, listAudioComparisons, openAudioComparison, readAudioComparisonClip, reviewAudioComparison } from '@/lib/evaluations/audio-comparison';

export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request), url = new URL(request.url);
    if (url.searchParams.has('clip')) {
      const bytes = await readAudioComparisonClip(user, url.searchParams.get('comparisonId') || '', url.searchParams.get('clip') || '');
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="recording.wav"', 'X-Content-Type-Options': 'nosniff' } });
    }
    return json(await listAudioComparisons(user));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    if (body.action === 'create') return json(await createAudioComparison(user, body), 201);
    if (body.action === 'open') return json(await openAudioComparison(user, body));
    if (body.action === 'review') return json(await reviewAudioComparison(user, body), 201);
    throw new HttpError(400, 'Unknown comparison action.');
  } catch (error) { return apiError(error); }
}
