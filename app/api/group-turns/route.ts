import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, json, readBody } from '@/lib/server/http';
import { createGroupTurn, listGroupTurns } from '@/lib/platform/group-turns';
import { runAiTask } from '@/lib/ai/task-router';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const roomId = field({ roomId: new URL(request.url).searchParams.get('roomId') }, 'roomId', 120);
    return json({ turns: await listGroupTurns(user, roomId) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request);
    const turn = await createGroupTurn(user, body, async (input) => (await runAiTask(user, { task: 'answer', requestId: `group:${field(body, 'requestId', 120)}`, system: input.system, input: input.user, maxOutputTokens: 400 })).text);
    return json({ turn }, 201);
  } catch (error) { return apiError(error); }
}
