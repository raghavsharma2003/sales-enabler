import { requireUser } from '../../../lib/server/auth';
import { apiError, assertSameOrigin, field, HttpError, json, readBody } from '../../../lib/server/http';
import { automationDashboard, controlAutomation, enableAutomation, previewAutomation } from '../../../lib/automation/engine';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await automationDashboard(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    const action = field(body, 'action', 30);
    if (action === 'preview') return json(await previewAutomation(user, field(body, 'runId', 100)));
    if (action === 'enable') return json(await enableAutomation(user, { runId: field(body, 'runId', 100), reviewToken: field(body, 'reviewToken', 100), scheduledAt: field(body, 'scheduledAt', 60), timezone: field(body, 'timezone', 100) }), 201);
    if (action === 'pause' || action === 'cancel' || action === 'resume') return json(await controlAutomation(user, field(body, 'id', 100), action, action === 'resume' ? { scheduledAt: field(body, 'scheduledAt', 60), timezone: field(body, 'timezone', 100), reviewToken: field(body, 'reviewToken', 100) } : undefined));
    throw new HttpError(400, 'Unknown schedule action.');
  } catch (error) { return apiError(error); }
}
