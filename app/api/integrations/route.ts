import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, field, json, readBody } from '@/lib/server/http';
import { integrationCatalog } from '@/lib/integrations/catalog';
import { check, configure, disconnect, sync } from '@/lib/integrations/service';
import { listConnections, requireWorkspaceOwner } from '@/lib/integrations/vault';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await requireWorkspaceOwner(user);
    return json({ catalog: integrationCatalog, connections: await listConnections(user) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await requireWorkspaceOwner(user);
    const body = await readBody(request), action = field(body, 'action', 20), integrationId = field(body, 'integrationId', 80);
    if (action === 'configure') return json({ connection: await configure(user, integrationId, body.credentials) });
    if (action === 'check') return json({ connection: await check(user, integrationId) });
    if (action === 'sync') return json(await sync(user, integrationId));
    if (action === 'disconnect') return json(await disconnect(user, integrationId));
    return json({ error: 'Unknown integration action.' }, 400);
  } catch (error) { return apiError(error); }
}
