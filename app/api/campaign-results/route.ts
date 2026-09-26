import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, json, readBody } from '@/lib/server/http';
import { campaignAnswersCsv, extractCampaignResult, getCampaignResult, listReviewedCampaignAnswers, revalidateCampaignResult, reviewCampaignResult } from '@/lib/campaign-results/service';
import type { AnswerReview } from '@/lib/campaign-results/contracts';

export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request), params = new URL(request.url).searchParams;
    if (params.get('format') === 'csv') return new Response(campaignAnswersCsv(await listReviewedCampaignAnswers(user, params.get('offeringId') || '')), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reviewed-campaign-answers.csv"', 'Cache-Control': 'no-store' } });
    return json(await getCampaignResult(user, params.get('sessionId') || ''));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request): Promise<Response> {
  try { assertSameOrigin(request); const user = await requireUser(request), body = await readBody(request); return json({ result: body.action === 'revalidate' ? await revalidateCampaignResult(user, field(body, 'id', 160), body.revision as number) : await extractCampaignResult(user, field(body, 'sessionId', 160)) }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request): Promise<Response> {
  try { assertSameOrigin(request); const user = await requireUser(request), body = await readBody(request); return json({ result: await reviewCampaignResult(user, field(body, 'id', 160), body.revision as number, body.reviews as AnswerReview[]) }); }
  catch (error) { return apiError(error); }
}
