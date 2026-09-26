import { answerCompanyQuestion } from '@/lib/brain/answer';
import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    return json(await answerCompanyQuestion(user, field(body, 'question', 1000), field(body, 'requestId', 100)));
  } catch (error) { return apiError(error); }
}
