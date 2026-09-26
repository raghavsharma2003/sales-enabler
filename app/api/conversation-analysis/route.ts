import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { analyzeConversation, listConversationAnalyses } from '@/lib/learning/engine';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const sessionId = new URL(request.url).searchParams.get('sessionId');
    if (!sessionId || sessionId.length > 120) throw new HttpError(400, 'A sessionId is required.');
    return json({ analyses: await listConversationAnalyses(await requireUser(request), sessionId) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    return json({ analysis: await analyzeConversation(user, field(body, 'sessionId', 120), field(body, 'requestId', 100)) });
  } catch (error) { return apiError(error); }
}
