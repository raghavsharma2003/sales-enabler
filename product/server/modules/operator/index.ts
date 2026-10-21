// The Operator module: "Talk to VP". Threads and messages, the tool loop (loop.ts) and the Operator's own
// tools (tools.ts). The reply streams as Server-Sent Events: message, delta, step, card, notice, error, done.
import type { Module } from '../../app.ts';
import type { Role } from '../../../shared/approval.ts';
import { arr, obj, opt, str } from '../../../shared/validate.ts';
import { one } from '../../db.ts';
import { HttpError, type Req } from '../../http.ts';
import { runTurn, type OperatorEvent } from './loop.ts';
import { getThread, registerOperatorTools } from './tools.ts';

const newThread = obj({ title: opt(str({ min: 1, max: 120 })) });
const postMessage = obj({
  text: str({ min: 1, max: 4_000 }),
  uploads: opt(arr(obj({ name: str({ min: 1, max: 120 }), content: str({ max: 20_000 }) }), { max: 3 })),
});

/** One SSE frame. */
export function sse(e: OperatorEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

export const module: Module = {
  name: 'operator',
  register: registerOperatorTools,
  routes(router, { pool, registry, auth }) {
    // The Operator works for a signed-in person, with that person's role; an API key has no Operator.
    const member = async (req: Req) => {
      const c = await auth(req);
      if (!c.memberId || c.via === 'key' || !c.actor.role) throw new HttpError(403, 'human_only', 'the Operator works for a signed-in member');
      return { workspaceId: c.workspaceId, memberId: c.memberId, role: c.actor.role as Role };
    };

    router.add('POST', '/v1/operator/threads', async req => {
      const m = await member(req);
      const b = newThread(req.body ?? {});
      const t = await one(pool, 'INSERT INTO thread (workspace_id, member_id, title) VALUES ($1,$2,$3) RETURNING id, title, created_at',
        [m.workspaceId, m.memberId, b.title ?? null]);
      return { status: 201, body: { thread: t } };
    });

    router.add('GET', '/v1/operator/threads/:id', async req => {
      const m = await member(req);
      const t = await getThread(pool, m.workspaceId, req.params.id);
      if (!t) throw new HttpError(404, 'not_found', 'no such thread');
      return { body: t };
    });

    // Input and the thread are checked before the stream opens, so those failures are plain JSON errors.
    // Frames are written as runTurn emits them; the turn stops before its next model call if the client leaves.
    router.add('POST', '/v1/operator/threads/:id/messages', async req => {
      const m = await member(req);
      const b = postMessage(req.body);
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !(await one(pool, 'SELECT 1 FROM thread WHERE id = $1 AND workspace_id = $2', [req.params.id, m.workspaceId]))) {
        throw new HttpError(404, 'not_found', 'no such thread');
      }
      return {
        stream: (write, closed) => runTurn({ pool, registry, workspaceId: m.workspaceId, member: { id: m.memberId, role: m.role }, threadId: req.params.id,
          text: b.text, uploads: b.uploads, emit: e => write(sse(e)), signal: closed }),
      };
    });
  },
};
