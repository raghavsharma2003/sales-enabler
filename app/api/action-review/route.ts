import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, json, readBody } from '@/lib/server/http';
import { inspectAction, reviewAction } from '@/lib/platform/action-review';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const actionId = field({ actionId: new URL(request.url).searchParams.get('actionId') }, 'actionId', 160);
    return json(await inspectAction(user, actionId));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return json(await reviewAction(await requireUser(request), await readBody(request)));
  } catch (error) { return apiError(error); }
}
