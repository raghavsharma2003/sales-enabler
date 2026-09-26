import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, HttpError, json, readBody } from '@/lib/server/http';
import { inboxOverview, inboxThread, linkInboxCustomer, parseInboxAction, sendInboxReply, setInboxHandoff } from '@/lib/messaging/service';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const threadId = new URL(request.url).searchParams.get('threadId');
    return json(threadId ? await inboxThread(user, threadId) : await inboxOverview(user));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const action = parseInboxAction(await readBody(request));
    if (action.action === 'reply') return json({ message: await sendInboxReply(user, action) });
    if (action.action === 'link') { await linkInboxCustomer(user, action.threadId, action.customerId); return json({ linked: true }); }
    if (action.action === 'handoff') { await setInboxHandoff(user, action.threadId, action.handoff); return json({ handoff: action.handoff }); }
    throw new HttpError(400, 'Unknown inbox action.');
  } catch (error) { return apiError(error); }
}
