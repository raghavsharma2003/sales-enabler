import { requireUser } from '@/lib/server/auth';
import { apiError, assertSameOrigin, field, HttpError, json, readBody } from '@/lib/server/http';
import { channelOverview, resolveChannelDeployment, saveChannelActivation, sendChannelOperatorReply, setChannelHandoff } from '@/lib/channel-agents/service';
import { installTelegramWebhook } from '@/lib/channel-agents/telegram';
import { getConnection } from '@/lib/integrations/vault';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await channelOverview(await requireUser(request), new URL(request.url).searchParams.get('threadId') || undefined)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request), action = field(body, 'action', 40);
    if (action === 'activateTelegram') {
      const connection = await getConnection(user, 'telegram');
      await resolveChannelDeployment(user.organizationId, 'telegram', connection.id, field(body, 'deploymentId', 100));
      const receipt = await installTelegramWebhook(user, { acknowledgeReplace: body.acknowledgeReplace === true });
      await saveChannelActivation(user, field(body, 'deploymentId', 100), receipt, connection.authorizationVersion);
      return json(receipt);
    }
    if (action === 'handoff') {
      const mode = field(body, 'mode', 20);
      if (mode !== 'ai' && mode !== 'human') throw new HttpError(400, 'Choose AI or human handoff.');
      await setChannelHandoff(user, field(body, 'threadId', 100), mode); return json({ saved: true });
    }
    if (action === 'reply') return json(await sendChannelOperatorReply(user, { threadId: field(body, 'threadId', 100), requestId: field(body, 'requestId', 50), text: field(body, 'text', 3500) }));
    throw new HttpError(400, 'Unknown channel action.');
  } catch (error) { return apiError(error); }
}
