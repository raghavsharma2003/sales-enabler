import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { endVoiceTools, executeVoiceTool } from '@/lib/voice/tools/service';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    return json(body.action === 'end' ? await endVoiceTools(user, body) : await executeVoiceTool(user, body));
  } catch (error) { return apiError(error); }
}
