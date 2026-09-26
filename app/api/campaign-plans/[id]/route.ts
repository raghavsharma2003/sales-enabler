import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { applyCampaignPlan } from '@/lib/campaign-planning/engine';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    return json(await applyCampaignPlan(user, id, await readBody(request)));
  } catch (error) { return apiError(error); }
}
