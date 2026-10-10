import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, HttpError, json, readBody } from '@/lib/server/http';
import { createAudioListeningReview, createSyntheticAudioFixture, listAudioProofData, runAudioProof } from '@/lib/evaluations/audio-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try { return json(await listAudioProofData(await requireUser(request))); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    if (body.action === 'fixture.create') return json(await createSyntheticAudioFixture(user, body), 201);
    if (body.action === 'run') return json(await runAudioProof(user, body), 201);
    if (body.action === 'review') return json(await createAudioListeningReview(user, body), 201);
    throw new HttpError(400, 'Unknown audio proof action.');
  } catch (error) { return apiError(error); }
}
