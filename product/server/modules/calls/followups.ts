// What other modules need after a non-test call is analysed, called by registry tool name as the system actor:
//   memory.extract {conversationId}         (memory: remembers what the caller said)
//   experiment.check {experimentId}         (learning: guardrails on every connected call, for each running experiment
//                                            on the agent whose version actually ran)
//   script.harm_check {conversationId}     (learning: blueprint decision 9's fast lane; 2 harm moments in 15 consecutive
//                                            calls of a script slow it to 25%; every analysed live call on an agent version)
//   script.line_check {conversationId}     (calls: decision 9's per-line lane; one of her lines followed by a hang-up,
//                                            opt-out or complaint across the window slows the script the same way)
//   attempt.retry_per_ladder {attemptId, outcome}  (campaigns, A3: after every non-final outcome of a campaign attempt;
//                                            runs after analysis so a callback request is known; final outcomes and
//                                            unknown are never sent, so nothing here can start an automatic retry of them)
// A tool that is not registered (a sibling not loaded) is reported as 'not_loaded', never an error.
import type pg from 'pg';
import { many, one } from '../../db.ts';
import type { Actor, Registry } from '../../tools.ts';
import type { EndReason } from '../../../shared/runtime-protocol.ts';
import { NOT_CONNECTED } from './taxonomy.ts';
import { statedCallback, type StatedCallback } from './stated-time.ts';

/** The callback time the caller stated on this call: a mark_callback tool's words first, then their own lines, newest
 *  first. A line with a time wins over a line that only asks for a callback. Read against when the call happened. */
export async function statedFromCall(pool: pg.Pool, ws: string, conversationId: string): Promise<StatedCallback | null> {
  const cv = await one<{ at: Date }>(pool, 'SELECT coalesce(ended_at, started_at) AS at FROM conversation WHERE id = $1 AND workspace_id = $2', [conversationId, ws]);
  if (!cv) return null;
  const marks = await many<{ text: string | null }>(pool, `SELECT coalesce(args->>'when', args->>'time', args->>'text') AS text FROM call_tool_event
    WHERE conversation_id = $1 AND workspace_id = $2 AND name = 'mark_callback' ORDER BY seq DESC`, [conversationId, ws]);
  const lines = await many<{ text: string }>(pool, "SELECT text FROM turn WHERE conversation_id = $1 AND speaker = 'caller' AND text <> '' ORDER BY idx DESC LIMIT 8", [conversationId]);
  let note: StatedCallback | null = null;
  for (const t of [...marks.map(m => m.text).filter((x): x is string => !!x), ...lines.map(l => l.text)]) {
    const s = statedCallback(t, cv.at);
    if (s && 'at' in s) return s;
    note ??= s;
  }
  return note;
}

const SYSTEM: Actor = { type: 'system', id: 'calls.followups' };

async function call(pool: pg.Pool, r: Registry, ws: string, name: string, args: unknown): Promise<string> {
  if (!r.get(name)) return 'not_loaded';
  try {
    const out = await r.execute(pool, name, args, { workspaceId: ws, actor: SYSTEM });
    return out.status === 'confirmed' ? 'done' : `${out.status}: ${'reason' in out ? out.reason : ''}`.slice(0, 200);
  } catch (e) { return `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200); }
}

/** The campaigns ladder class for a non-final ending, or null when the outcome is final (completed, opted out, crisis,
 *  hand-off, limits reached, wrong person) or unknown. Short calls are early hang-ups and silent connections. */
export function retryClass(end: EndReason | null, reasonCode: string | null): string | null {
  if (reasonCode === 'CONV_CALLBACK') return 'callback';
  // The carrier's reason (shared/carrier.ts) is more precise than the engine's end reason for a call that never connected.
  if (reasonCode === 'DIAL_TRIAL_RESTRICTED' || reasonCode === 'DIAL_CARRIER_REJECTED') return 'carrier_refused';
  if (reasonCode === 'DIAL_INVALID_NUMBER') return 'invalid';
  if (reasonCode === 'DIAL_NETWORK') return 'provider_error';
  if (reasonCode === 'DIAL_REJECTED') return 'busy';
  switch (end) {
    case 'no_answer': return 'no_answer';
    case 'busy': return 'busy';
    case 'failed': return 'provider_error';
    case 'voicemail': return 'voicemail';
    case 'switched_off': return 'switched_off';
    case 'invalid_number': return 'invalid';             // the number does not exist: no automatic retry
    case 'error': return 'dropped_by_vp';
    default: break;
  }
  if (reasonCode === 'END_EARLY_HANGUP' || reasonCode === 'CONN_SILENCE') return 'short_call';
  return null;
}

export async function afterCall(pool: pg.Pool, r: Registry, ws: string, conversationId: string): Promise<Record<string, string>> {
  const cv = await one<{ channel: string; end_reason: EndReason | null; reason_code: string | null; attempt_id: string | null; agent_id: string | null; test: boolean }>(pool,
    `SELECT cv.channel, cv.end_reason, cv.reason_code, cv.attempt_id, v.agent_id, coalesce(cv.run_manifest->>'test', 'false') = 'true' AS test
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
  if (cv.agent_id) out['script.harm_check'] = await call(pool, r, ws, 'script.harm_check', { conversationId });
  if (cv.agent_id) out['script.line_check'] = await call(pool, r, ws, 'script.line_check', { conversationId });
  const cls = cv.attempt_id ? retryClass(cv.end_reason, cv.reason_code) : null;
  if (cls) {
    // A callback they asked for: the time from their own words beats the ladder; no clear time gives a note, never a guess.
    const stated = cls === 'callback' ? await statedFromCall(pool, ws, conversationId) : null;
    out['attempt.retry_per_ladder'] = await call(pool, r, ws, 'attempt.retry_per_ladder', { attemptId: cv.attempt_id, outcome: cls,
      ...(stated && 'at' in stated ? { stated: { at: stated.at.toISOString(), quote: stated.quote, conversationId } } : {}),
      ...(stated && 'note' in stated ? { statedNote: { note: stated.note, quote: stated.quote, conversationId } } : {}) });
  }
  return out;
}
