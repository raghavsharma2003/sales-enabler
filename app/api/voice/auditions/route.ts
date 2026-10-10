import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { createSpeechAudition, listSpeechAuditions } from '@/lib/voice/speech-audition';

export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  try { return json(await listSpeechAuditions(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    return json(await createSpeechAudition(user, await readBody(request)), 201);
  } catch (error) { return apiError(error); }
}
