// What other modules need after a non-test call is analysed, called by registry tool name as the system actor:
//   memory.extract {conversationId}         (memory: remembers what the caller said)
//   experiment.check {experimentId}         (learning: guardrails on every connected call, for each running experiment
//                                            on the agent whose version actually ran)
// A tool that is not registered (a sibling not loaded) is reported as 'not_loaded', never an error.
import type pg from 'pg';
import { one } from '../../db.ts';
import type { Actor, Registry } from '../../tools.ts';
import type { EndReason } from '../../../shared/runtime-protocol.ts';
import { NOT_CONNECTED } from './taxonomy.ts';

const SYSTEM: Actor = { type: 'system', id: 'calls.followups' };

async function call(pool: pg.Pool, r: Registry, ws: string, name: string, args: unknown): Promise<string> {
  if (!r.get(name)) return 'not_loaded';
  try {
    const out = await r.execute(pool, name, args, { workspaceId: ws, actor: SYSTEM });
    return out.status === 'confirmed' ? 'done' : `${out.status}: ${'reason' in out ? out.reason : ''}`.slice(0, 200);
  } catch (e) { return `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200); }
}

export async function afterCall(pool: pg.Pool, r: Registry, ws: string, conversationId: string): Promise<Record<string, string>> {
  const cv = await one<{ channel: string; end_reason: EndReason | null; agent_id: string | null; test: boolean }>(pool,
    `SELECT cv.channel, cv.end_reason, v.agent_id, coalesce(cv.run_manifest->>'test', 'false') = 'true' AS test
     FROM conversation cv LEFT JOIN agent_version v ON v.id = cv.agent_version_id
     WHERE cv.id = $1 AND cv.workspace_id = $2`, [conversationId, ws]);
  if (!cv || cv.channel === 'test' || cv.test) return { skipped: 'test call' };
  const out: Record<string, string> = { 'memory.extract': await call(pool, r, ws, 'memory.extract', { conversationId }) };
  if (cv.end_reason && !NOT_CONNECTED.has(cv.end_reason) && cv.agent_id) {
    if (!r.get('experiment.list')) out['experiment.check'] = 'not_loaded';
    else {
      const list = await r.execute<{ id: string; state: string }[]>(pool, 'experiment.list', { agentId: cv.agent_id }, { workspaceId: ws, actor: SYSTEM });
      const running = list.status === 'confirmed' ? list.result.filter(e => e.state === 'running') : [];
      for (const e of running) out[`experiment.check:${e.id}`] = await call(pool, r, ws, 'experiment.check', { experimentId: e.id });
      if (!running.length) out['experiment.check'] = 'no running experiment';
    }
  }
  return out;
}
