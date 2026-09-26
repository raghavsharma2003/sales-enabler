import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { applyConversationAnalysis } from '@/lib/learning/engine';
import type { LearningReview } from '@/lib/learning/contracts';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    if (field(body, 'action', 20) !== 'apply') throw new HttpError(400, 'Unknown analysis action.');
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400, 'Current analysis revision required.');
    if (!Array.isArray(body.candidateIds) || body.candidateIds.some(value => typeof value !== 'string')) throw new HttpError(400, 'candidateIds must be an array of IDs.');
    return json(await applyConversationAnalysis(user, (await context.params).id, Number(body.revision), body.candidateIds, body.reviews as LearningReview[] | undefined));
  } catch (error) { return apiError(error); }
}
