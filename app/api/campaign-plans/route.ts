import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { generateCampaignPlan, listCampaignPlans } from '@/lib/campaign-planning/engine';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try { return json({ plans: await listCampaignPlans(await requireUser(request)) }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    return json({ plan: await generateCampaignPlan(user, await readBody(request)) }, 201);
  } catch (error) { return apiError(error); }
}
