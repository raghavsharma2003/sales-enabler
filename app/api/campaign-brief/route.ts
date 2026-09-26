import { getCampaignBriefProposal, proposeCampaignBrief, recheckCampaignBriefProposal } from '@/lib/campaign-brief/service';
import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    return json({ proposal: await getCampaignBriefProposal(user, new URL(request.url).searchParams.get('requestId')) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    return json({ proposal: body.action === 'recheck' ? await recheckCampaignBriefProposal(user, body) : await proposeCampaignBrief(user, body) });
  } catch (error) { return apiError(error); }
}
