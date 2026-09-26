import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, field, json, readBody } from '@/lib/server/http';
import { previewVoiceContext } from '@/lib/voice/context';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    return json(await previewVoiceContext(user, { draft: body.draft, agentId: field(body, 'agentId', 100, false) || undefined, contactId: field(body, 'contactId', 100, false) || undefined }));
  } catch (error) { return apiError(error); }
}
