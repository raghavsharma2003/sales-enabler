import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { checkAzureRealtimeDeployment } from '@/lib/voice/check';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(request);
    return json(await checkAzureRealtimeDeployment());
  } catch (error) { return apiError(error); }
}
