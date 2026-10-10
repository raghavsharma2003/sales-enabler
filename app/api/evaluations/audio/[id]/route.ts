import { requireUser } from '@/lib/server/auth';
import { readEvaluationAudioArtifact } from '@/lib/evaluations/audio-artifacts';
import { apiError, HttpError } from '@/lib/server/http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

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
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= length || end < start) throw new HttpError(416, 'Audio range is outside this artifact.');
  return { start, end: Math.min(end, length - 1) };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireUser(request), { id } = await context.params;
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(id)) throw new HttpError(404, 'Audio artifact was not found.');
    const artifact = await readEvaluationAudioArtifact(user, id), range = boundedRange(request.headers.get('range'), artifact.bytes.length);
    const headers = new Headers({
      'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'Content-Type': artifact.metadata.mimeType,
      'Content-Disposition': 'inline; filename="audio-proof.wav"', 'X-Content-Type-Options': 'nosniff',
      'ETag': `"sha256-${artifact.metadata.sha256}"`,
    });
    if (!range) {
      headers.set('Content-Length', String(artifact.bytes.length));
      return new Response(new Uint8Array(artifact.bytes), { status: 200, headers });
    }
    const body = artifact.bytes.subarray(range.start, range.end + 1);
    headers.set('Content-Length', String(body.length)); headers.set('Content-Range', `bytes ${range.start}-${range.end}/${artifact.bytes.length}`);
    return new Response(new Uint8Array(body), { status: 206, headers });
  } catch (error) { return apiError(error); }
}
