import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { listCampaignDelivery, parseSendInput, sendCampaignEmail } from '@/lib/delivery/engine';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const runId = new URL(request.url).searchParams.get('runId') || '';
    if (!runId || runId.length > 100) return json({ error: 'A run ID is required.' }, 400);
    return json(await listCampaignDelivery(user, runId));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const input = parseSendInput(await readBody(request));
    return json({ receipt: await sendCampaignEmail(user, input) });
  } catch (error) { return apiError(error); }
}
