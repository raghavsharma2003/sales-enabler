import { requireUser } from '@/lib/server/auth';
import { apiError, assertSameOrigin, field, json, readBody, HttpError } from '@/lib/server/http';
import { requireWorkspaceOwner } from '@/lib/integrations/vault';
import { startOAuth } from '@/lib/integrations/oauth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await requireWorkspaceOwner(user);
    const body = await readBody(request);
    const integrationId = field(body, 'integrationId', 80);
    if (body.allowSend !== undefined && typeof body.allowSend !== 'boolean') throw new HttpError(400, 'allowSend must be a boolean.');
    return json(await startOAuth(user, integrationId, body.allowSend === true));
  } catch (error) { return apiError(error); }
}
