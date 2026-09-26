import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { analyzeIngestion, classifyIngestionCandidate, getIngestionDetail, reviewIngestion } from '@/lib/ingestion/engine';
import type { CandidateType } from '@/lib/ingestion/contracts';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try { return json(await getIngestionDetail(await requireUser(request), (await context.params).id)); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    const { id } = await context.params;
    const action = field(body, 'action', 20);
    if (action === 'analyze') return json(await analyzeIngestion(user, id, field(body, 'requestId', 100)));
    if (action === 'classify') {
      if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400, 'Current proposal revision required.');
      return json(await classifyIngestionCandidate(user, id, Number(body.revision), field(body, 'candidateId', 100), field(body, 'type', 40) as CandidateType, field(body, 'reason', 300)));
    }
    if (action === 'apply' || action === 'reject') {
      if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400, 'Current proposal revision required.');
      if (body.candidateIds !== undefined && (!Array.isArray(body.candidateIds) || body.candidateIds.some(value => typeof value !== 'string'))) throw new HttpError(400, 'candidateIds must be an array of IDs.');
      return json(await reviewIngestion(user, id, action, Number(body.revision), body.candidateIds as string[] | undefined));
    }
    throw new HttpError(400, 'Unknown ingestion action.');
  } catch (error) { return apiError(error); }
}
