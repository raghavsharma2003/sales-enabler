import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, HttpError, json, readBody } from '@/lib/server/http';
import { createAudioComparison, listAudioComparisons, openAudioComparison, readAudioComparisonClip, reviewAudioComparison } from '@/lib/evaluations/audio-comparison';

export const runtime = 'nodejs';

function boundedRange(value: string | null, length: number): { start: number; end: number } | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, 'Invalid audio range.');
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) throw new HttpError(416, 'Invalid audio range.');
    start = Math.max(0, length - suffix); end = length - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : length - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= length || end < start) throw new HttpError(416, 'Audio range is outside this recording.');
  return { start, end: Math.min(end, length - 1) };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request), url = new URL(request.url);
    if (url.searchParams.has('clip')) {
      const bytes = await readAudioComparisonClip(user, url.searchParams.get('comparisonId') || '', url.searchParams.get('clip') || '');
      // Authenticate and revalidate this reviewer's exact retained assignment
      // before revealing even a byte length or satisfying a range request.
      const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="recording.wav"', 'X-Content-Type-Options': 'nosniff' });
      let range: ReturnType<typeof boundedRange>;
      try { range = boundedRange(request.headers.get('range'), bytes.length); }
      catch (error) {
        if (!(error instanceof HttpError) || error.status !== 416) throw error;
        headers.set('Content-Range', `bytes */${bytes.length}`); headers.set('Content-Length', '0');
        return new Response(null, { status: 416, headers });
      }
      if (!range) {
        headers.set('Content-Length', String(bytes.length));
        return new Response(new Uint8Array(bytes), { status: 200, headers });
      }
      const body = bytes.subarray(range.start, range.end + 1);
      headers.set('Content-Length', String(body.length)); headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.length}`);
      return new Response(new Uint8Array(body), { status: 206, headers });
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
