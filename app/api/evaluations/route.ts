import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody, HttpError } from '@/lib/server/http';
import { assess, createScenario, importTrial, listEvaluationData, rate, reviewAssessment } from '@/lib/evaluations/service';

export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  try { return json(await listEvaluationData(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    let result;
    if (body.action === 'scenario.create') result = await createScenario(user, body);
    else if (body.action === 'trial.import') result = await importTrial(user, body);
    else if (body.action === 'assessment.run') result = await assess(user, body);
    else if (body.action === 'assessment.review') result = await reviewAssessment(user, body);
    else if (body.action === 'rating.create') result = await rate(user, body);
    else throw new HttpError(400, 'Unknown evaluation action.');
    return json(result, 201);
  } catch (error) { return apiError(error); }
}
