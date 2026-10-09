import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { endContinuousSpeechGrant, issueContinuousSpeechGrant } from '@/lib/voice/continuous-speech-authority';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    return json(await issueContinuousSpeechGrant(user, await readBody(request), request.headers.get('origin')!));
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await endContinuousSpeechGrant(user, await readBody(request), request.headers.get('origin')!);
    return json({ ended: true });
  } catch (error) { return apiError(error); }
}
