import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { previewClone } from '@/lib/voice/cloning/service';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    const audio = await previewClone(user, (await context.params).id, body.text);
    return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="personal-voice-preview.wav"' } });
  } catch (error) { return apiError(error); }
}
