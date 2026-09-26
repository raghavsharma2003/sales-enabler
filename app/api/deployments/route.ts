import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { changeDeploymentStatus, createDeployment, listDeployments } from '@/lib/deployments/engine';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json({ deployments: await listDeployments(await requireUser(request)) }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    if (body.action === 'create') return json({ deployment: await createDeployment(user, body) }, 201);
    if (!['publish', 'pause', 'stop'].includes(String(body.action))) throw new HttpError(400, 'Choose create, publish, pause, or stop.');
    if (!Number.isSafeInteger(body.revision)) throw new HttpError(400, 'A current deployment revision is required.');
    return json({ deployment: await changeDeploymentStatus(user, { deploymentId: field(body, 'deploymentId', 120), revision: Number(body.revision), action: body.action as 'publish' | 'pause' | 'stop', publicationAcknowledgement: typeof body.publicationAcknowledgement === 'string' ? body.publicationAcknowledgement : undefined }) });
  } catch (error) { return apiError(error); }
}
