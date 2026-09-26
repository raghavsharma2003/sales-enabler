import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { applyAgentRevision, proposeAgentRevision, recheckAgentRevision } from '@/lib/agent-revision/service';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    const action = field(body, 'action', 20);
    if (action === 'propose') return json(await proposeAgentRevision(user, body));
    if (action === 'recheck') return json(await recheckAgentRevision(user, body));
    if (action === 'apply') return json(await applyAgentRevision(user, body));
    throw new HttpError(400, 'Choose propose, recheck or apply.');
  } catch (error) { return apiError(error); }
}
