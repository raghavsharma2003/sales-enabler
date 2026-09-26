import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody, field, HttpError } from '@/lib/server/http';
import { listRecords } from '@/lib/platform/records';
import { handleAgentAction } from '@/lib/platform/agents';
import { handleCampaignAction } from '@/lib/platform/campaigns';
import { handleGroupAction } from '@/lib/platform/groups';
import { handleCustomerAction } from '@/lib/platform/customer-ops';
import { createMemory, createAction, transition } from '@/lib/server/store';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { const user = await requireUser(request); return json({ records: await listRecords(user.organizationId) }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request), action = field(body, 'action', 80);
    if (/^(agent|test|release)\./.test(action)) return json(await handleAgentAction(user, action, body));
    if (action.startsWith('campaign.')) return json(await handleCampaignAction(user, action, body));
    if (action.startsWith('group.')) return json(await handleGroupAction(user, action, body));
    if (/^(customer|brain|commitment)\./.test(action)) return json(await handleCustomerAction(user, action, body));
    if (action === 'memory.create' || action === 'legacy.memory.create') return json(await createMemory(user, body), 201);
    if (action === 'action.create' || action === 'legacy.action.create') return json(await createAction(user, body), 201);
    if (action === 'memory.transition') return json(await transition(user, 'memory', field(body, 'id', 100), field(body, 'status', 30)));
    if (action === 'action.transition') return json(await transition(user, 'action', field(body, 'id', 100), field(body, 'status', 30)));
    throw new HttpError(400, 'Unknown workspace action.');
  } catch (error) { return apiError(error); }
}
