import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { requestVoiceStopByRequest } from '@/lib/usage/service';
import { stopPrivateVoiceAttempt } from '@/lib/voice/supervisor';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    if (body.action !== 'end') throw new HttpError(400, 'Choose a supported voice control action.');
    const receipt = await requestVoiceStopByRequest(user, field(body, 'requestId', 160));
    if (receipt.state === 'closed') return json({ requested: true, state: 'closed' });
    const result = await stopPrivateVoiceAttempt({ id: receipt.id, organizationId: user.organizationId }, { waitForClaimMs: 11_000 });
    return json({ requested: true, state: result.state });
  } catch (error) { return apiError(error); }
}
