import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import type { RegressionCaseReviseInput, RegressionCaseWriteInput, RegressionReviewInput, RegressionRunInput } from '@/lib/regression/contracts';
import { checkRegressionSuite, createRegressionCase, listRegressionData, previewRegressionCase, reviewTextRehearsal, runTextRehearsal } from '@/lib/regression/service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try { return json(await listRegressionData(await requireUser(request))); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    if (body.action === 'case.preview') return json({ preview: await previewRegressionCase(user, body as unknown as Parameters<typeof previewRegressionCase>[1]) });
    if (body.action === 'case.create') return json({ case: await createRegressionCase(user, body as unknown as RegressionCaseWriteInput) }, 201);
    if (body.action === 'case.revise') return json({ case: await createRegressionCase(user, body as unknown as RegressionCaseReviseInput) }, 201);
    if (body.action === 'run.start') return json({ run: await runTextRehearsal(user, body as unknown as RegressionRunInput) }, 201);
    if (body.action === 'review.create') return json({ review: await reviewTextRehearsal(user, body as unknown as RegressionReviewInput) }, 201);
    if (body.action === 'suite.check') return json({ suite: await checkRegressionSuite(user, field(body, 'agentVersionId', 120)) });
    throw new HttpError(400, 'Unknown text rehearsal action.');
  } catch (error) { return apiError(error); }
}
