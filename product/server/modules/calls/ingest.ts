// POST /hooks/runtime: the voice runtime reports what happened on a call (shared/runtime-protocol.ts).
//
// Trust: the only input is the signed body. The workspace comes from the conversation row the control plane
// created, looked up by the signed conversationId; nothing from the query string or other headers is read.
// Idempotency: every event is recorded once by (conversation_id, seq) in the same transaction as its effects,
// so a retried batch changes nothing. Cost lines may arrive before call.ended; money settles at call.ended at
// the sum of the cost lines (the real cost), or the hold is released when nobody was reached and nothing was spent.
// The route takes the raw body, so the HMAC is checked over the exact bytes the runtime signed, before parsing.
import type pg from 'pg';
import type { Deps } from '../../app.ts';
import { many, one, tx } from '../../db.ts';
import { HttpError, type Req, type Res } from '../../http.ts';
import { release, settle } from '../../ledger.ts';
import { verify } from '../../runtime-client.ts';
import type { Registry } from '../../tools.ts';
import type { EndReason, RunManifest, RuntimeEvent } from '../../../shared/runtime-protocol.ts';
import { any, arr, bool, num, obj, opt, record, str, uuid, ValidationError, type Validator } from '../../../shared/validate.ts';
import { queueAnalysis } from './analysis.ts';
import { codeReason, NOT_CONNECTED } from './taxonomy.ts';

const END_REASONS = ['completed', 'caller_hung_up', 'agent_ended', 'no_answer', 'busy', 'failed', 'voicemail', 'max_duration', 'max_cost',
  'silence_timeout', 'handed_off', 'crisis_handoff', 'opt_out', 'error'] as const;
const RULES = ['RD1', 'RD2', 'RD3', 'RD4', 'RD5', 'RD6', 'RD7', 'RD8', 'RD9', 'RD10', 'RD11'] as const;
const at = str({ pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/ });
const seq = num({ int: true, min: 0, max: 2_000_000_000 });
const ms = num({ int: true, min: 0 });
const speaker = str({ oneOf: ['agent', 'caller'] });
const manifest = obj({
  combinationId: str({ max: 300 }), stackId: str({ max: 100 }), agentVersionHash: str({ max: 128 }),
  components: obj({ stt: opt(str({ max: 200 })), llm: opt(str({ max: 200 })), tts: opt(str({ max: 200 })), s2s: opt(str({ max: 200 })), voice: opt(str({ max: 200 })) }),
  fallbacksUsed: arr(obj({ at_ms: ms, component: str({ max: 50 }), from: str({ max: 200 }), to: str({ max: 200 }), reason: str({ max: 500 }) }), { max: 50 }),
  memory: str({ oneOf: ['loaded', 'none', 'not_loaded_timeout', 'disabled'] }),
  runtimeVersion: str({ max: 100 }),
});

const EVENTS: Record<RuntimeEvent['type'], Validator<unknown>> = {
  'call.started': obj({ seq, type: str(), at, manifest }),
  turn: obj({ seq, type: str(), at, speaker, text: str({ max: 20_000 }), startMs: ms, endMs: ms, interrupted: opt(bool()), latencyMs: opt(ms), tone: opt(str({ max: 50 })) }),
  cost: obj({ seq, type: str(), at, component: str({ oneOf: ['telephony', 'ears', 'brain', 'voice', 'platform'] }), provider: str({ max: 100 }),
    quantity: num({ min: 0 }), unit: str({ oneOf: ['second', 'token', 'char', 'call', 'request'] }), inrMilli: num({ int: true, min: 0 }), detail: opt(record(any())) }),
  safety: obj({ seq, type: str(), at, rule: str({ oneOf: RULES }), action: str({ oneOf: ['blocked', 'replaced', 'flagged', 'redacted', 'suspended_goal'] }), detail: str({ max: 2000 }) }),
  moment: obj({ seq, type: str(), at, kind: str({ oneOf: ['objection', 'question', 'commitment', 'opt_out', 'callback_request', 'confusion', 'laughter'] }), atMs: ms, note: str({ max: 2000 }) }),
  tool: obj({ seq, type: str(), at, name: str({ max: 100 }), args: record(any()), status: str({ oneOf: ['requested', 'done', 'failed'] }) }),
  hand_off: obj({ seq, type: str(), at, reason: str({ max: 500 }), target: str({ max: 200 }), summary: str({ max: 2000 }) }),
  judge: obj({ seq, type: str(), at, judge: str({ oneOf: ['caller_crisis'] }), mode: str({ oneOf: ['shadow', 'raise'] }),
    outcome: str({ oneOf: ['raised', 'shadow', 'unavailable'] }), kind: opt(str({ oneOf: ['direct', 'indirect'] })),
    confidence: opt(num({ min: 0, max: 1 })), reason: opt(str({ oneOf: ['timeout', 'error', 'bad_output'] })), latencyMs: ms }),
  'call.ended': obj({ seq, type: str(), at, endReason: str({ oneOf: END_REASONS }), durationS: num({ min: 0 }), recordingUri: opt(str({ max: 2000 })),
    transcript: arr(obj({ speaker, text: str({ max: 20_000 }), startMs: ms }), { max: 5000 }), manifest }),
};

const event: Validator<RuntimeEvent> = (v, p = '') => {
  const t = (v as { type?: unknown } | null)?.type;
  const val = typeof t === 'string' ? EVENTS[t as RuntimeEvent['type']] : undefined;
  if (!val) throw new ValidationError(p ? `${p}.type` : 'type', 'is not a known event type');
  return val(v, p) as RuntimeEvent;
};
const batch = obj({ protocol: num({ int: true, min: 1, max: 1 }), conversationId: uuid(), events: arr(event, { min: 1, max: 1000 }) });

/** The exact validator /hooks/runtime applies to a parsed batch (throws ValidationError with the field path; exits 1 from
 *  the command line). Exported so the voice runtime's tests can run real emitter output through it instead of a mirror.
 *  An optional field sent as null counts as absent. From product/, outside the test runner (CommonJS interop, hence default):
 *    node --import tsx --input-type=module -e "const m = await import('./server/modules/calls/ingest.ts'); (m.default ?? m).validateRuntimeBatch(JSON.parse(process.argv[1]))" '<json>'  */
export function validateRuntimeBatch(value: unknown): { protocol: number; conversationId: string; events: RuntimeEvent[] } {
  return batch(value);
}

interface Conv { id: string; workspace_id: string; attempt_id: string | null; contact_id: string | null; channel: string; status: string; run_manifest: RunManifest | Record<string, never>; settlement: unknown }

// Test calls are marked in two places learning and memory read: channel = 'test' and run_manifest.test = true.
// A draft test call also keeps the draft hash it was dispatched with (set by test.browser_call).
const stamped = (conv: Conv, m: RunManifest) => {
  const draftHash = (conv.run_manifest as { draftHash?: string }).draftHash;
  return { ...m, test: conv.channel === 'test', ...(draftHash ? { draftHash } : {}) };
};

/** File the call under the agent version that actually ran (manifest.agentVersionHash), preferring the agent the
 *  conversation was created for. If no version in this workspace has that hash, the conversation keeps what it had. */
async function stampVersion(c: pg.PoolClient, conv: Conv, m: RunManifest): Promise<void> {
  const cur = await one<{ v: string | null; agent: string | null }>(c,
    'SELECT cv.agent_version_id AS v, av.agent_id AS agent FROM conversation cv LEFT JOIN agent_version av ON av.id = cv.agent_version_id WHERE cv.id = $1', [conv.id]);
  const ran = await one<{ id: string }>(c, `SELECT v.id FROM agent_version v JOIN agent a ON a.id = v.agent_id AND a.workspace_id = $1
    WHERE v.hash = $2 ORDER BY (v.agent_id = $3) DESC NULLS LAST, v.number DESC LIMIT 1`, [conv.workspace_id, m.agentVersionHash, cur?.agent ?? null]);
  if (!ran || ran.id === cur?.v) return;
  await c.query('UPDATE conversation SET agent_version_id = $2 WHERE id = $1', [conv.id, ran.id]);
  if (cur?.v) await addFlags(c, conv.id, ['version_restamped']);   // the runtime ran another version than the one dispatched
}

const addFlags = (q: pg.PoolClient, id: string, flags: string[]) => flags.length
  ? q.query(`UPDATE conversation SET flagged = true, flags = ARRAY(SELECT DISTINCT unnest(flags || $2::text[]) ORDER BY 1) WHERE id = $1`, [id, flags])
  : Promise.resolve();

const usage = (q: pg.PoolClient, ws: string, when: string, seconds: number, inrMilli: number) => q.query(
  `INSERT INTO usage_period (workspace_id, period_start, connected_seconds, cost_inr_milli)
   VALUES ($1, date_trunc('month', ($2::timestamptz AT TIME ZONE 'Asia/Kolkata'))::date, $3, $4)
   ON CONFLICT (workspace_id, period_start) DO UPDATE SET connected_seconds = usage_period.connected_seconds + EXCLUDED.connected_seconds,
     cost_inr_milli = usage_period.cost_inr_milli + EXCLUDED.cost_inr_milli`, [ws, when, Math.round(seconds), inrMilli]);

export interface IngestResult { accepted: number; duplicates: number; ended: boolean }

/** Apply one verified batch. Exported for tests and for a future queue consumer. */
export async function ingest(pool: pg.Pool, b: { conversationId: string; events: RuntimeEvent[] }, registry?: Registry): Promise<IngestResult & { workspaceId: string }> {
  const conv0 = await one<{ workspace_id: string }>(pool, 'SELECT workspace_id FROM conversation WHERE id = $1', [b.conversationId]);
  if (!conv0) throw new HttpError(404, 'unknown_conversation', 'no such conversation');
  const ws = conv0.workspace_id;
  const events = [...b.events].sort((x, y) => x.seq - y.seq);

  const out = await tx(pool, async c => {
    const conv = (await one<Conv>(c, 'SELECT id, workspace_id, attempt_id, contact_id, channel, status, run_manifest, settlement FROM conversation WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [b.conversationId, ws]))!;
    let accepted = 0, duplicates = 0, ended = false;
    for (const e of events) {
      const fresh = await c.query('INSERT INTO runtime_event_seen (conversation_id, seq, workspace_id, type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING seq', [conv.id, e.seq, ws, e.type]);
      if (!fresh.rowCount) { duplicates++; continue; }
      accepted++;
      if (await apply(c, conv, e)) ended = true;
    }
    return { accepted, duplicates, ended };
  });
  if (out.ended) queueAnalysis(pool, ws, b.conversationId, registry);
  return { ...out, workspaceId: ws };
}

/** Apply one new event. Returns true when it ended the call. */
async function apply(c: pg.PoolClient, conv: Conv, e: RuntimeEvent): Promise<boolean> {
  const ws = conv.workspace_id;
  switch (e.type) {
    case 'call.started':
      { const m = stamped(conv, e.manifest);
        await c.query(`UPDATE conversation SET run_manifest = $2 WHERE id = $1 AND status = 'live'`, [conv.id, m]);
        await stampVersion(c, conv, e.manifest);
        conv.run_manifest = m as RunManifest; }
      return false;
    case 'turn':
      await c.query(`INSERT INTO turn (conversation_id, idx, speaker, text, latency, interrupted, started_ms, ended_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (conversation_id, idx) DO NOTHING`,
        [conv.id, e.seq, e.speaker, e.text, { latencyMs: e.latencyMs ?? null, tone: e.tone ?? null }, e.interrupted ?? false, e.startMs, e.endMs]);
      return false;
    case 'cost': {
      await c.query(`INSERT INTO cost_line (workspace_id, conversation_id, attempt_id, component, provider, quantity, unit, inr_milli, detail, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ws, conv.id, conv.attempt_id, e.component, e.provider, e.quantity, e.unit, e.inrMilli, { ...(e.detail ?? {}), seq: e.seq }, e.at]);
      await c.query('UPDATE conversation SET cost_inr_milli = cost_inr_milli + $2 WHERE id = $1', [conv.id, e.inrMilli]);
      if (conv.settlement) {
        // Money already settled at call.ended. The runtime must flush call.ended last; record the overshoot so it is visible.
        await c.query('UPDATE conversation SET late_cost_inr_milli = late_cost_inr_milli + $2 WHERE id = $1', [conv.id, e.inrMilli]);
        await usage(c, ws, e.at, 0, e.inrMilli);
        await addFlags(c, conv.id, ['cost_after_end']);
      }
      return false;
    }
    case 'safety':
      await c.query('INSERT INTO call_safety_event (workspace_id, conversation_id, seq, rule, action, detail, at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [ws, conv.id, e.seq, e.rule, e.action, e.detail, e.at]);
      await addFlags(c, conv.id, ['safety']);
      return false;
    case 'moment':
      await c.query(`INSERT INTO call_moment (workspace_id, conversation_id, source, kind, at_ms, note) VALUES ($1,$2,'runtime',$3,$4,$5)`,
        [ws, conv.id, e.kind, e.atMs, e.note]);
      if (e.kind === 'opt_out') {
        await c.query(`INSERT INTO call_opt_out (workspace_id, conversation_id, contact_id, status) VALUES ($1,$2,$3,$4) ON CONFLICT (conversation_id) DO NOTHING`,
          [ws, conv.id, conv.contact_id, conv.contact_id ? 'pending' : 'no_contact']);
        await addFlags(c, conv.id, ['opt_out']);
      }
      return false;
    case 'tool':
      await c.query('INSERT INTO call_tool_event (workspace_id, conversation_id, seq, name, args, status, at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [ws, conv.id, e.seq, e.name, e.args, e.status, e.at]);
      if (e.status === 'failed') await addFlags(c, conv.id, ['tool_failed']);
      return false;
    case 'hand_off':
      await c.query(`INSERT INTO hand_off (workspace_id, conversation_id, mode, destination, status, brief) VALUES ($1,$2,'warm',$3,'queued',$4)`,
        [ws, conv.id, e.target, { reason: e.reason, summary: e.summary, seq: e.seq }]);
      await addFlags(c, conv.id, ['hand_off']);
      return false;
    case 'judge':
      // Analysis-only: no flag and no call_safety_event (a real raise arrives separately as a 'safety' event).
      await c.query(`INSERT INTO call_judge_event (workspace_id, conversation_id, seq, judge, mode, outcome, kind, confidence, reason, latency_ms, at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [ws, conv.id, e.seq, e.judge, e.mode, e.outcome, e.kind ?? null, e.confidence ?? null, e.reason ?? null, Math.round(e.latencyMs), e.at]);
      return false;
    case 'call.ended':
      return endCall(c, conv, e);
  }
}

async function endCall(c: pg.PoolClient, conv: Conv, e: Extract<RuntimeEvent, { type: 'call.ended' }>): Promise<boolean> {
  if (conv.status !== 'live') return false;          // a second call.ended (new seq) never re-settles
  const ws = conv.workspace_id;
  const callerTurns = e.transcript.filter(t => t.speaker === 'caller').length;
  const reason = codeReason(e.endReason as EndReason, e.durationS, callerTurns);
  const flags: string[] = [];
  const started = conv.run_manifest as Partial<RunManifest>;
  if (started.combinationId && started.combinationId !== e.manifest.combinationId) flags.push('manifest_changed');
  if (conv.channel === 'test' && e.manifest.fallbacksUsed.length) flags.push('fallback_on_test');
  if (e.endReason === 'crisis_handoff') flags.push('crisis');
  if (e.endReason === 'error') flags.push('engine_error');

  await c.query(`UPDATE conversation SET status = 'ended', end_reason = $2, reason_code = $3, ended_at = $4, duration_s = $5, recording_uri = $6,
      transcript = $7, run_manifest = $8 WHERE id = $1`,
    [conv.id, e.endReason, reason, e.at, Math.round(e.durationS), e.recordingUri ?? null, JSON.stringify(e.transcript), stamped(conv, e.manifest)]);
  await stampVersion(c, conv, e.manifest);
  await addFlags(c, conv.id, flags);

  const connected = !NOT_CONNECTED.has(e.endReason as EndReason);
  const total = Number((await one<{ s: string }>(c, 'SELECT coalesce(sum(inr_milli), 0)::text AS s FROM cost_line WHERE conversation_id = $1 AND workspace_id = $2', [conv.id, ws]))!.s);
  let settlement: { action: 'settled' | 'released' | 'none'; reservationId?: string; inrMilli: number } = { action: 'none', inrMilli: total };
  if (conv.attempt_id) {
    const holds = await many<{ id: string }>(c, `SELECT id FROM reservation WHERE workspace_id = $1 AND attempt_id = $2 AND status = 'held' ORDER BY created_at`, [ws, conv.attempt_id]);
    const spend = connected || total > 0;
    for (const [i, h] of holds.entries()) {
      if (i === 0 && spend) { await settle(c, h.id, total); settlement = { action: 'settled', reservationId: h.id, inrMilli: total }; }
      else { await release(c, h.id); if (i === 0) settlement = { action: 'released', reservationId: h.id, inrMilli: 0 }; }
    }
    const status = e.endReason === 'no_answer' ? 'no_answer' : e.endReason === 'busy' ? 'busy' : e.endReason === 'failed' ? 'failed' : 'connected';
    await c.query('UPDATE attempt SET status = $3 WHERE id = $1 AND workspace_id = $2', [conv.attempt_id, ws, status]);
  }
  await c.query('UPDATE conversation SET settlement = $2 WHERE id = $1', [conv.id, settlement]);
  conv.settlement = settlement;
  conv.status = 'ended';
  await usage(c, ws, e.at, connected ? e.durationS : 0, total);
  return true;
}

/** Send pending opt-outs to the contacts module's A3 verb. Never throws: a missing module leaves them pending. */
export async function flushOptOuts(pool: pg.Pool, registry: Registry, workspaceId: string): Promise<void> {
  const pending = await many<{ id: string; conversation_id: string; contact_id: string }>(pool,
    `SELECT id, conversation_id, contact_id FROM call_opt_out WHERE workspace_id = $1 AND status = 'pending' ORDER BY created_at LIMIT 50`, [workspaceId]);
  for (const p of pending) {
    let status = 'pending', detail: string;
    if (!registry.get('contact.suppress_after_opt_out')) detail = 'contact.suppress_after_opt_out is not registered yet; kept pending';
    else {
      try {
        const r = await registry.execute(pool, 'contact.suppress_after_opt_out', { contactId: p.contact_id, conversationId: p.conversation_id },
          { workspaceId, actor: { type: 'system', id: 'calls.ingest' } });
        if (r.status === 'confirmed') { status = 'applied'; detail = `mode ${r.mode}`; }
        else { status = r.status === 'unknown' ? 'pending' : 'failed'; detail = 'reason' in r ? r.reason : r.status; }
      } catch (err) { detail = err instanceof Error ? err.message : String(err); }
    }
    await pool.query('UPDATE call_opt_out SET status = $2, detail = $3 WHERE id = $1', [p.id, status, detail.slice(0, 500)]);
  }
}

export function hookRoute(deps: Deps) {
  return async (req: Req): Promise<Res> => {
    const secret = process.env.VP_RUNTIME_SECRET;
    if (!secret || secret.length < 32) throw new HttpError(503, 'not_configured', 'the runtime hook is not configured');
    const sig = req.headers['x-vp-signature'];
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!raw || typeof sig !== 'string' || !verify(secret, raw, sig)) {
      throw new HttpError(401, 'bad_signature', 'the signature is missing, stale or wrong');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, 'bad_json', 'the request body is not valid JSON'); }
    const b = batch(parsed);
    const r = await ingest(deps.pool, b, deps.registry);
    await flushOptOuts(deps.pool, deps.registry, r.workspaceId);
    return { body: { accepted: r.accepted, duplicates: r.duplicates } };
  };
}
