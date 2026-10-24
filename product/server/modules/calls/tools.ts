// The calls module's tools: test calls, the call record, search, explanation, outcomes, judges, issues,
// reports, the campaign funnel and live control. Every query filters by ctx.workspaceId.
import { label } from '../../labels.ts';
import { randomUUID } from 'node:crypto';
import { many, one, type Queryable } from '../../db.ts';
import { runtime } from '../../runtime-client.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import type { AgentConfig } from '../../../shared/agent-config.ts';
import type { CallTicket } from '../../../shared/runtime-protocol.ts';
import { combinationId, resolveStack } from '../../../shared/stacks.ts';
import { arr, bool, num, obj, opt, str, uuid, ValidationError } from '../../../shared/validate.ts';
import { analysisSetting, analysisSettingText, curatedAnalysisModels, DEFAULT_MONITORS, ensureDefaultMonitors, refreshOutcome, type AnalysisRecord } from './analysis.ts';
import { BEST_GRADE, BEST_OUTCOME, calibrationStatus, campaignFunnel, TRUST, wilsonLower, type CalibrationStatus } from './stats.ts';
import { FIELD_TYPES, MAX_FIELDS, validateFields, type FieldDef } from './fields.ts';
import { REASON_CODES, reasonFor } from './taxonomy.ts';
import { recordingLink } from '../../recording-url.ts';
import { allowedByFor } from './gate-trace.ts';
import { retentionPolicy } from '../intake/retention.ts';
import { flagJudgeRecheck, outcomeReadings, recordVerified } from './verified.ts';
import { transcriptRemovedWhy } from '../memory/transcript-purge.ts';
import { computeInsight, latestInsight, presentInsight, storeInsight, type Computed, type Scope } from './insights.ts';
import { lineCheck } from './line-watch.ts';
import { turnCauses } from '../../../shared/call-trace.ts';
import { appendAudit } from '../../audit.ts';

// Test calls run inside a daily test budget (workspace blueprint: ₹200 a day, proposed) and a per-call cap.
export const TEST_BUDGET_PER_DAY_INR_MILLI = 200_000;
export const TEST_CALL_MAX_COST_INR_MILLI = 50_000;

const date = str({ pattern: /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/ });
const reasonCode = str({ oneOf: REASON_CODES.map(r => r.code) });

// The agent and version a call ran, in the same query as the call (one join, never a read per row): "Asha, version 3".
// agent_version has no workspace_id; the agent's does, so a version of another workspace's agent never names an agent here.
const AGENT_JOIN = `LEFT JOIN agent_version av ON av.id = cv.agent_version_id
  LEFT JOIN agent ag ON ag.id = av.agent_id AND ag.workspace_id = cv.workspace_id`;
const AGENT_COLS = 'ag.id AS agent_id, ag.name AS agent_name, av.number AS agent_version_number';
// Each call's reply gap for the log (must-be 13): the median and the slowest of her replies the voice runtime timed
// (turn.latency.latencyMs), in the list's own query. No timed reply gives nulls, never 0.
const REPLY_JOIN = `LEFT JOIN LATERAL (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (t.latency->>'latencyMs')::numeric) AS reply_median_ms,
    max((t.latency->>'latencyMs')::numeric)::int AS reply_slowest_ms, count(*)::int AS reply_timed
  FROM turn t WHERE t.conversation_id = cv.id AND t.speaker = 'agent' AND jsonb_typeof(t.latency->'latencyMs') = 'number') rg ON true`;
/** The call's agent as the call log shows it, or null for a call no published version made (a draft test call). */
const agentOf = (x: Record<string, any>) => x.agent_id ? { id: x.agent_id as string, name: x.agent_name as string, version: Number(x.agent_version_number),
  label: `${x.agent_name}, version ${x.agent_version_number}` } : null;

async function conversation(ctx: ToolCtx, id: string) {
  const c = await one<Record<string, any>>(ctx.q, `SELECT cv.*, a.campaign_id, ${AGENT_COLS} FROM conversation cv LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id ${AGENT_JOIN}
    WHERE cv.id = $1 AND cv.workspace_id = $2`, [id, ctx.workspaceId]);
  if (!c) throw new Error('no such call in this workspace');
  return c;
}

/** The runtime answers control actions with {ok, join?} on success and {ok:false, reason} (404 unknown, 409 not live). */
const runtimeReason = (detail: unknown) => {
  const r = (detail as { reason?: unknown } | null)?.reason;
  return typeof r === 'string' && r ? `: ${r.slice(0, 200)}` : '';
};
const joinOf = (detail: unknown) => (detail as { join?: unknown } | null)?.join ?? null;

async function liveCall(ctx: ToolCtx, id: string) {
  const c = await conversation(ctx, id);
  if (c.status !== 'live') throw new Error('this call is not live');
  return c;
}

export const WHISPER_MAX_CHARS = 300;
const SYSTEM = { type: 'system' as const, id: 'calls.test_call' };

// What a person did on the live call (runtime moments). Never what a whisper said: the runtime never sends it.
const SUPERVISOR_MOMENTS: Record<string, string> = {
  live_listen_started: 'A supervisor started listening.', live_listen_ended: 'The supervisor stopped listening.',
  whisper: 'A supervisor sent the agent a note.', takeover: 'A person took over the call; the agent stopped.',
};

/** The runtime's admission cap: POST /v1/calls answers 503 {error:'at_capacity', retryAfterS} and places nothing.
 *  Read from StartReply.retryable/retryAfterS when the kernel client sets them, else from the reason text it carries today. */
export function atCapacity(rep: { accepted: boolean; reason?: string; retryable?: boolean; retryAfterS?: number }): { retryAfterS: number } | null {
  if (rep.accepted) return null;
  if (rep.retryable) return { retryAfterS: Math.max(1, Math.round(rep.retryAfterS ?? 5)) };
  if (!/\b503\b/.test(rep.reason ?? '') || !/at_capacity/.test(rep.reason ?? '')) return null;
  const n = Number(/"retryAfterS"\s*:\s*(\d+)/.exec(rep.reason ?? '')?.[1] ?? 5);
  return { retryAfterS: Math.max(1, n) };
}

/** Whether this call's recording may be played now, and a fresh signed link when it may (server/recording-url.ts). The
 *  runtime records only when the agent's recording setting is on and the caller did not refuse (it then reports no
 *  recording at all); here the workspace's retention (policy.retention.get, recordings_days) and an erase request for the
 *  person close it. There is no separate per-workspace recording switch to respect. */
export async function recordingFor(ctx: ToolCtx, c: Record<string, any>): Promise<{ url: string | null; expiresAt: string | null; why: string | null }> {
  const no = (why: string) => ({ url: null, expiresAt: null, why });
  if (c.recording_purged_at) return no(c.recording_purge_reason === 'erased'
    ? 'The recording was deleted because the person asked to be erased.'
    : 'The recording was deleted when this workspace\'s recordings retention ended.');
  const uri: string | null = c.recording_uri;
  if (!uri) return no('No recording was made on this call.');
  const pending = c.recording_purge_tries > 0
    ? ` Deleting it is pending: the voice runtime has not confirmed after ${c.recording_purge_tries} ${c.recording_purge_tries === 1 ? 'try' : 'tries'}; it is retried every 10 minutes.` : '';
  const { policy } = await retentionPolicy(ctx.q, ctx.workspaceId);
  const at = c.ended_at ?? c.started_at;
  if (at && Date.now() - new Date(at).getTime() > policy.recordings_days * 86_400_000) return no(`The recording is past this workspace's retention of ${policy.recordings_days} days.` + pending);
  if (c.contact_id && await one(ctx.q, "SELECT 1 FROM forget_request WHERE workspace_id = $1 AND contact_id = $2 AND scope = 'erase_me' UNION ALL SELECT 1 FROM contact WHERE id = $2 AND workspace_id = $1 AND erased_at IS NOT NULL LIMIT 1", [ctx.workspaceId, c.contact_id]))
    return no('The person asked to be erased, so the recording is not played.' + pending);
  if (/^https?:\/\//i.test(uri)) return { url: uri, expiresAt: null, why: null };      // already an address a browser can open
  const link = recordingLink(c.id, ctx.workspaceId);
  return link ? { ...link, why: null } : no('The voice runtime\'s public address is not set on this server, so the recording cannot be played here.');
}

/** The call page's verified outcome beside the AI's reading: "Verified: paid, from renewals-oct.csv row 41" next to
 *  "AI read: agreed", and whether they disagree. null when no system of record has spoken for this call. */
export function verifiedView(outcomes: Record<string, any>[], analysis: any): { value: string; from: string; at: string; aiRead: string | null; disagree: boolean } | null {
  const v = [...outcomes].reverse().find(o => o.grade === 'verified');
  if (!v) return null;
  const e = v.evidence ?? {};
  const from = e.file ? `${e.file} row ${e.row}` : String(e.key?.source ?? v.source ?? 'a system of record');
  const ai = [...outcomes].reverse().find(o => o.grade === 'ai_guess' && o.definition_id === v.definition_id)?.value ?? analysis?.outcomeGuess?.value ?? null;
  return { value: v.value, from, at: v.created_at, aiRead: ai, disagree: ai !== null && ai !== v.value };
}

export interface JudgeRow { label: 'crisis' | 'opt_out'; mode: 'shadow' | 'raise'; outcome: 'raised' | 'shadow' | 'unavailable'; kind: string | null; confidence: number | null; reason: string | null }
/** The call page's safety mark for one live judge verdict, in plain English. A shadow verdict says what the checker
 *  would have done and that nothing changed; the confidence is shown as a percentage. */
export function judgeMarkText(j: JudgeRow): string {
  const pct = j.confidence === null ? '' : ` (${Math.round(j.confidence * 100)}% sure)`;
  if (j.outcome === 'unavailable') return `The safety checker did not answer here (${j.reason === 'timeout' ? 'it timed out' : 'it failed'}); the fixed safety rules still applied.`;
  const what = j.label === 'opt_out' ? 'a request not to be called again' : `signs of distress${j.kind === 'indirect' ? ', said indirectly' : ''}`;
  return j.outcome === 'shadow'
    ? `The safety checker would have flagged ${what} here${pct}. ${j.mode === 'shadow' ? 'It is in trial mode, so nothing was changed.' : 'It was already being handled, so nothing more was changed.'}`
    : `The safety checker flagged ${what} here${pct}${j.label === 'opt_out' ? '; the agent confirmed it and ended the call.' : '; the agent paused the goal and offered help.'}`;
}

/** One call, everything about it: what call.get returns and what the staff review export carries, from one place. */
async function callRecord(ctx: ToolCtx, conversationId: string) {
  const c = await conversation(ctx, conversationId);
  // One after another: a transaction client runs one query at a time (pg deprecates queued parallel queries on a client).
  const read = (sql: string, params: unknown[]) => many(ctx.q, sql, params);
  const turns = await read('SELECT idx, speaker, text, latency, interrupted, started_ms, ended_ms FROM turn WHERE conversation_id = $1 ORDER BY idx', [c.id]);
  const moments = await read('SELECT source, kind, at_ms, note, quote FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY at_ms NULLS LAST', [c.id, ctx.workspaceId]);
  const safety = await read('SELECT seq, rule, action, detail, at FROM call_safety_event WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [c.id, ctx.workspaceId]);
  const tools = await read('SELECT seq, name, args, status, at FROM call_tool_event WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [c.id, ctx.workspaceId]);
  const handOffs = await read('SELECT mode, destination, status, brief, created_at FROM hand_off WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
  const costs = await read('SELECT component, provider, quantity::float AS quantity, unit, inr_milli::int AS inr_milli, detail FROM cost_line WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
  const outcomes = await read('SELECT value, grade, source, evidence, definition_id, created_at FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
  const judged = await read('SELECT seq, label, mode, outcome, kind, confidence::float AS confidence, reason, at FROM call_judge_event WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [c.id, ctx.workspaceId]);
  const judgeMarks = judged.map(j => ({ seq: j.seq, at: j.at, label: j.label, outcome: j.outcome, confidence: j.confidence, text: judgeMarkText(j as unknown as JudgeRow) }));
  const rc = reasonFor(c.reason_code);
  const recording = await recordingFor(ctx, c);
  const verified = verifiedView(outcomes, c.analysis);
  const allowedBy = await allowedByFor(ctx.q, ctx.workspaceId, c as { id: string; attempt_id: string | null; channel: string });
  const transcriptRemoved = transcriptRemovedWhy(c, (await retentionPolicy(ctx.q, ctx.workspaceId)).policy.transcripts_days);
  return {
    id: c.id, channel: c.channel, test: c.channel === 'test', status: c.status, direction: c.direction, campaignId: c.campaign_id, attemptId: c.attempt_id,
    contactId: c.contact_id, agentVersionId: c.agent_version_id, agent: agentOf(c), startedAt: c.started_at, endedAt: c.ended_at, durationS: c.duration_s,
    endReason: c.end_reason, reason: rc ? { code: rc.code, label: rc.label, action: rc.action } : null, outcome: c.outcome,
    recordingUri: c.recording_uri, recording, transcriptRemoved, verified, allowedBy, runManifest: c.run_manifest, transcript: c.transcript, flagged: c.flagged, flags: c.flags,
    cost: { totalInrMilli: Number(c.cost_inr_milli), lateInrMilli: Number(c.late_cost_inr_milli), settlement: c.settlement, lines: costs },
    turns, moments, safety, judgeMarks, tools, handOffs, outcomes, analysis: c.analysis,
    trace: (c as { trace?: unknown }).trace ?? null,         // the runtime's turn-by-turn trace (CallTrace), or null
  };
}

export function registerTools(r: Registry): void {
  // ---- test.browser_call --------------------------------------------------------------------------------
  r.register(tool(obj({ agentId: uuid(), versionId: opt(uuid()), useDraft: opt(bool()) }), {
    name: 'test.browser_call', risk: 'test',
    summary: 'Start a test call in the browser with an agent (its draft or a version); never dials a phone and never counts toward outcomes',
    // prepare() runs outside any transaction: the conversation row must be committed before the runtime starts,
    // because the runtime may post events at once, and no transaction is held open across the runtime request.
    prepare: async (ctx, i) => {
      const agent = await one<{ id: string; draft: any }>(ctx.pool, 'SELECT id, draft FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ctx.workspaceId]);
      if (!agent) throw new Error('no such agent in this workspace');
      let cfg: { agent?: AgentConfig; brief?: CallTicket['brief'] } | null, versionId: string | null = null, draftHash: string | null = null;
      if (i.useDraft) {
        // The agents module stores the draft as a bare AgentConfig and compiles only at publish; a draft test call
        // compiles it through the one compile() (agents' brief.compile) and is filed under the draft's hash.
        if (!r.get('agent.get') || !r.get('brief.compile')) throw new Error('the agents module is not loaded, so a draft cannot be compiled for a test call');
        const sys = { workspaceId: ctx.workspaceId, actor: SYSTEM };
        const got = await r.execute<{ draft: AgentConfig; draftHash: string }>(ctx.pool, 'agent.get', { agentId: i.agentId }, sys);
        if (got.status !== 'confirmed') throw new Error(`could not read the draft: ${'reason' in got ? got.reason : got.status}`);
        const compiled = await r.execute<CallTicket['brief']>(ctx.pool, 'brief.compile', { config: got.result.draft }, sys);
        if (compiled.status !== 'confirmed') {
          const why = compiled.status === 'not_executed' ? `${compiled.reason}` : compiled.status;
          throw new Error(`the draft does not compile yet: ${why}`);
        }
        draftHash = got.result.draftHash;
        cfg = { agent: { ...got.result.draft, versionHash: draftHash }, brief: compiled.result };
      } else {
        const v = await one<{ id: string; config: any }>(ctx.pool,
          `SELECT v.id, v.config FROM agent_version v JOIN agent a ON a.id = v.agent_id AND a.workspace_id = $2
           WHERE v.agent_id = $1 ${i.versionId ? 'AND v.id = $3' : "AND v.kind = 'published'"} ORDER BY v.number DESC LIMIT 1`,
          i.versionId ? [i.agentId, ctx.workspaceId, i.versionId] : [i.agentId, ctx.workspaceId]);
        if (!v) throw new Error(i.versionId ? 'no such version of this agent' : 'this agent has no version yet; test its draft with useDraft');
        cfg = v.config; versionId = v.id;
      }
      if (!cfg?.agent || !cfg?.brief?.text || !cfg.brief.hash) throw new Error('this agent has no compiled brief yet; compile the draft first');
      const stack = resolveStack(cfg.agent.voice);

      // The daily test budget is money's cap (money.test_budget, owner-raisable by approval); the constants are the fallback
      // when the money module is not loaded. Same count either way: test-call cost since IST midnight.
      let perCallHold = TEST_CALL_MAX_COST_INR_MILLI;
      const budget = r.get('money.test_budget') ? await r.execute<{ allowed: boolean; reason?: string; perCallInrMilli: number }>(ctx.pool, 'money.test_budget', {}, { workspaceId: ctx.workspaceId, actor: SYSTEM }) : null;
      if (budget?.status === 'confirmed') {
        if (!budget.result.allowed) throw new Error(budget.result.reason ?? "today's test budget is used up; it resets at midnight IST");
        perCallHold = budget.result.perCallInrMilli;
      } else {
        const spent = await one<{ s: string }>(ctx.pool, `SELECT coalesce(sum(cost_inr_milli), 0)::text AS s FROM conversation
          WHERE workspace_id = $1 AND channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`, [ctx.workspaceId]);
        if (Number(spent!.s) + TEST_CALL_MAX_COST_INR_MILLI > TEST_BUDGET_PER_DAY_INR_MILLI) throw new Error("today's test budget is used up; it resets at midnight IST");
      }

      const member = ctx.actor.type === 'member' && ctx.actor.id
        ? await one<{ name: string | null }>(ctx.pool, 'SELECT name FROM member WHERE id = $1 AND workspace_id = $2', [ctx.actor.id, ctx.workspaceId]) : null;
      const tester = (member?.name ?? '').trim().split(/\s+/)[0] ?? '';
      const id = randomUUID();
      await ctx.pool.query(`INSERT INTO conversation (id, workspace_id, agent_version_id, channel, direction, status, run_manifest) VALUES ($1,$2,$3,'test','outbound','live',$4)`,
        [id, ctx.workspaceId, versionId, { test: true, ...(draftHash ? { draftHash } : {}) }]);
      const ticket: CallTicket = {
        protocol: 1, conversationId: id, attemptId: null, workspaceId: ctx.workspaceId, direction: 'outbound',
        transport: { kind: 'webrtc', offerUrl: `/v1/test-calls/${id}/offer` },
        agent: cfg.agent, brief: cfg.brief, stack: { id: stack.id, combinationId: combinationId(stack, cfg.agent.voice.voiceId), components: stack.components },
        // The person testing is the caller: their first name lets her open as she would on a real call (staging
        // 2026-10-23: with no name she said "क्या मैं ___ से…"). No member name: '' and the runtime opens without one.
        contact: { displayName: tester, timezone: 'Asia/Kolkata', facts: {}, memoryBrief: '', memoryStatus: 'disabled' },
        consent: { basis: 'consent' },
        limits: { maxDurationS: Math.min(cfg.agent.limits?.maxDurationS ?? 300, 900), maxCostInrMilli: perCallHold },
        test: true,
      };
      let rep;
      try { rep = await runtime().start(ticket); } catch (e) { rep = { accepted: false, reason: e instanceof Error ? e.message : String(e) } as const; }
      if (!rep.accepted) {
        const busy = atCapacity(rep);
        if (busy) {
          // Nothing was placed (the runtime creates no call at capacity), so no call record stays behind either.
          await ctx.pool.query('DELETE FROM conversation WHERE id = $1 AND workspace_id = $2 AND channel = $3', [id, ctx.workspaceId, 'test']);
          throw new Error(`the voice engine is busy right now; try again in ${busy.retryAfterS} seconds`);
        }
        await ctx.pool.query(`UPDATE conversation SET status = 'failed', end_reason = 'error', ended_at = now() WHERE id = $1 AND workspace_id = $2`, [id, ctx.workspaceId]);
        throw new Error(`the voice runtime did not start the call: ${rep.reason ?? 'no reason given'}`);
      }
      return { conversationId: id, source: i.useDraft ? 'draft' : 'version', versionId, draftHash, combinationId: ticket.stack.combinationId, join: rep.join ?? null };
    },
    run: async (_ctx, _i, prepared) => prepared as { conversationId: string; source: string; versionId: string | null; draftHash: string | null; combinationId: string; join: unknown },
  }));

  // ---- call.get -----------------------------------------------------------------------------------------
  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'call.get', risk: 'read', summary: 'Everything about one call: transcript, turns, moments, safety, tools, hand-offs, cost lines, outcomes and analysis',
    run: (ctx, i) => callRecord(ctx, i.conversationId),
  }));

  // ---- the staff review export ------------------------------------------------------------------------------
  // directive.2026-10-24.calling-first-build-all: Vyakti staff (actor vp_success, never a workspace role) read one
  // workspace's calls in a time window as one JSON, to find where a long test call went wrong. Each call is call.get's
  // own record (transcript with every per-turn field the runtime stored, turns, moments, safety, judge marks, tools,
  // hand-offs, outcomes, cost lines, analysis, the gate record) plus the runtime events seen; the recording is said to
  // exist or not, never a signed link. Test calls are in by default (the owner reviews mostly on them). Audited.
  r.register(tool(obj({ from: date, to: date, includeTest: opt(bool()), limit: opt(num({ int: true, min: 1, max: 500 })) }), {
    name: 'review.export', risk: 'read', summary: "Vyakti staff: one workspace's calls in a time window, with transcripts, traces, flags, outcomes, costs and errors, as one JSON",
    roles: [],                                   // no member role may call it; only the vp_success (Vyakti staff) actor
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'vp_success' || !ctx.actor.id) throw new Error('only Vyakti staff can export calls for review');
      const from = new Date(i.from), to = new Date(i.to);
      if (!(to > from)) throw new ValidationError('to', 'the window must end after it starts');
      if (to.getTime() - from.getTime() > 7 * 86400_000) throw new ValidationError('to', 'export at most 7 days at a time');
      const limit = i.limit ?? 200;
      const ids = await many<{ id: string }>(ctx.q, `SELECT id FROM conversation WHERE workspace_id = $1 AND coalesce(started_at, ended_at) >= $2 AND coalesce(started_at, ended_at) < $3
          AND ($4::boolean OR channel <> 'test') ORDER BY coalesce(started_at, ended_at), id LIMIT $5`, [ctx.workspaceId, from, to, i.includeTest ?? true, limit + 1]);
      const calls = [];
      for (const { id } of ids.slice(0, limit)) {
        const { recording, recordingUri: _uri, ...rec } = await callRecord(ctx, id);
        const events = await many<{ seq: number; type: string; received_at: Date }>(ctx.q, 'SELECT seq, type, received_at FROM runtime_event_seen WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [id, ctx.workspaceId]);
        calls.push({ ...rec, recording: { available: !!recording.url, why: recording.why }, runtimeEvents: events,
          errors: [
            ...(rec.endReason === 'error' || rec.endReason === 'failed' ? [{ where: 'runtime', what: `the call ended with end reason ${rec.endReason}` }] : []),
            ...(rec.analysis?.status === 'failed' ? [{ where: 'analysis', what: String(rec.analysis.reason ?? 'analysis failed') }] : []),
            ...(rec.analysis?.judge_unavailable ? [{ where: 'safety judge', what: `the judge was unavailable ${rec.analysis.judge_unavailable} time(s)` }] : []),
            ...rec.tools.filter((t: any) => t.status === 'failed').map((t: any) => ({ where: 'tool', what: `${t.name}: ${t.status}` })),
          ] });
      }
      await appendAudit(ctx.q, { workspaceId: ctx.workspaceId, actorType: 'vp_success', actorId: ctx.actor.id, action: 'review.export',
        objectType: 'workspace', objectId: ctx.workspaceId, payload: { from: from.toISOString(), to: to.toISOString(), calls: calls.length, includeTest: i.includeTest ?? true } });
      return { workspaceId: ctx.workspaceId, from: from.toISOString(), to: to.toISOString(), generatedAt: new Date().toISOString(),
        truncated: ids.length > limit, counts: { calls: calls.length, test: calls.filter(c => c.test).length, flagged: calls.filter(c => c.flagged).length,
          withErrors: calls.filter(c => c.errors.length).length }, calls };
    },
  }));

  // ---- call.search --------------------------------------------------------------------------------------
  r.register(tool(obj({
    campaignId: opt(uuid()), agentVersionId: opt(uuid()),
    outcome: opt(str({ max: 80, desc: "one of this workspace's outcome values (an outcome definition's allowed values, e.g. 'agreed'); never a reason code" })),
    reasonCode: opt(str({ oneOf: REASON_CODES.map(r => r.code), desc: 'why the call ended the way it did, e.g. CONV_GOAL_DONE or END_CRISIS; a separate filter from outcome' })),
    from: opt(date), to: opt(date), flagged: opt(bool()), includeTest: opt(bool()), limit: opt(num({ int: true, min: 1, max: 200 })), before: opt(date),
  }), {
    name: 'call.search', risk: 'read', summary: 'Find calls by campaign, outcome value, reason code, date or flag, with the total that match; test calls only when asked',
    run: async (ctx, i) => {
      // An outcome is one of the workspace's defined values. A wrong one is refused with the valid values (a model once
      // passed a reason code as the outcome, got 0 rows and answered "no calls": rejected.2026-10-23.call-search-free-text-outcome).
      if (i.outcome !== undefined) {
        const defs = await many<{ v: string }>(ctx.q, `SELECT DISTINCT unnest(d.allowed_values) AS v FROM outcome_definition d
          WHERE d.workspace_id = $1 AND ($2::uuid IS NULL OR d.id = (SELECT outcome_definition_id FROM campaign WHERE id = $2 AND workspace_id = $1)) ORDER BY 1`,
          [ctx.workspaceId, i.campaignId ?? null]);
        const valid = defs.map(d => d.v);
        if (!valid.includes(i.outcome)) {
          const asCode = REASON_CODES.some(r => r.code === i.outcome) ? ` "${i.outcome}" is a reason code: pass it as reasonCode.` : '';
          throw new ValidationError('outcome', `"${i.outcome}" is not an outcome value here.${asCode} ${valid.length ? `Valid outcome values${i.campaignId ? ' for this campaign' : ''}: ${valid.join(', ')}.` : 'No outcome is defined in this workspace yet.'}`);
        }
      }
      const where = ['cv.workspace_id = $1'], p: unknown[] = [ctx.workspaceId];
      const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', '$' + p.length)); };
      if (!i.includeTest) where.push(`cv.channel <> 'test'`);
      if (i.campaignId) add('a.campaign_id = ?', i.campaignId);
      if (i.agentVersionId) add('cv.agent_version_id = ?', i.agentVersionId);
      if (i.reasonCode) add('cv.reason_code = ?', i.reasonCode);
      if (i.outcome) add(`${BEST_OUTCOME} = ?`, i.outcome);
      if (i.from) add('cv.started_at >= ?::timestamptz', i.from);
      if (i.to) add('cv.started_at < ?::timestamptz', i.to);
      if (i.flagged !== undefined) add('cv.flagged = ?', i.flagged);
      const FROM = `FROM conversation cv LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id`;
      // The total counts every match, whatever page this is ("how many" has one answer).
      const total = (await one<{ n: number }>(ctx.q, `SELECT count(*)::int AS n ${FROM} WHERE ${where.join(' AND ')}`, [...p]))!.n;
      if (i.before) add('cv.started_at < ?::timestamptz', i.before);
      p.push(i.limit ?? 50);
      const rows = await many<Record<string, any>>(ctx.q,
        `SELECT cv.id, cv.channel, cv.direction, cv.inbound_note, cv.status, cv.started_at, cv.ended_at, cv.duration_s, cv.end_reason, cv.reason_code, cv.flagged, cv.flags,
                cv.cost_inr_milli::int AS cost_inr_milli, cv.contact_id, cv.agent_version_id, a.campaign_id, ${AGENT_COLS}, ${BEST_OUTCOME} AS outcome, ${BEST_GRADE} AS grade,
                rg.reply_median_ms, rg.reply_slowest_ms, rg.reply_timed
         ${FROM} ${AGENT_JOIN} ${REPLY_JOIN} WHERE ${where.join(' AND ')} ORDER BY cv.started_at DESC LIMIT $${p.length}`, p);
      return { total, calls: rows.map(({ agent_id, agent_name, agent_version_number, reply_median_ms, reply_slowest_ms, reply_timed, ...x }) => ({ ...x, agent: agentOf({ agent_id, agent_name, agent_version_number }),
        reply: reply_timed ? { medianMs: Math.round(Number(reply_median_ms)), slowestMs: Number(reply_slowest_ms), timed: reply_timed } : null,
        reasonLabel: reasonFor(x.reason_code)?.label ?? null })), next: rows.length === (i.limit ?? 50) ? rows[rows.length - 1].started_at : null };
    },
  }));

  // ---- call.explain -------------------------------------------------------------------------------------
  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'call.explain', risk: 'read', summary: 'Why this call went the way it did, in plain words, each point backed by an event or an exact quote',
    run: async (ctx, i) => {
      const c = await conversation(ctx, i.conversationId);
      const lines: { speaker: string; text: string; startMs: number }[] = c.transcript ?? [];
      const said = (ms: number | null) => {
        if (ms === null || ms === undefined) return null;
        const l = [...lines].reverse().find(x => x.startMs <= ms) ?? null;
        return l ? { speaker: l.speaker, text: l.text, startMs: l.startMs } : null;
      };
      const because: { point: string; evidence: Record<string, unknown> }[] = [];
      const rc = reasonFor(c.reason_code);
      // Why it was allowed first: the dial gate's record, before anything that happened on the call.
      const gate = await allowedByFor(ctx.q, ctx.workspaceId, c as { id: string; attempt_id: string | null; channel: string });
      because.push({ point: `Why this call was allowed: ${gate.summary}`, evidence: { event: 'dial_gate', allowed: gate.allowed, gateVersion: gate.gateVersion, at: gate.at, checks: gate.checks.length } });
      if (c.end_reason) because.push({ point: `The call ended: ${c.end_reason.replaceAll('_', ' ')} after ${c.duration_s ?? 0} s.`, evidence: { event: 'call.ended', endReason: c.end_reason, durationS: c.duration_s } });
      const moments = await many<{ source: string; kind: string; at_ms: number | null; note: string | null; quote: string | null }>(ctx.q,
        'SELECT source, kind, at_ms, note, quote FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY at_ms NULLS LAST', [c.id, ctx.workspaceId]);
      for (const m of moments) {
        if (m.source === 'analysis' && m.quote) because.push({ point: `${m.kind.replaceAll('_', ' ')}${m.note ? ': ' + m.note : ''}`, evidence: { quote: m.quote, atMs: m.at_ms } });
        else if (m.source === 'runtime' && SUPERVISOR_MOMENTS[m.kind]) because.push({ point: SUPERVISOR_MOMENTS[m.kind], evidence: { event: 'moment', kind: m.kind, atMs: m.at_ms } });
        else if (m.source === 'runtime') because.push({ point: `${m.kind.replaceAll('_', ' ')} (noted live)${m.note ? ': ' + m.note : ''}`, evidence: { event: 'moment', atMs: m.at_ms, said: said(m.at_ms) } });
      }
      for (const s of await many<{ rule: string; action: string; detail: string; seq: number }>(ctx.q, 'SELECT rule, action, detail, seq FROM call_safety_event WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [c.id, ctx.workspaceId])) {
        because.push({ point: `A safety rule (${s.rule}) ${s.action.replaceAll('_', ' ')} a reply: ${s.detail}`, evidence: { event: 'safety', seq: s.seq, rule: s.rule } });
      }
      for (const t of await many<{ name: string; seq: number }>(ctx.q, `SELECT name, seq FROM call_tool_event WHERE conversation_id = $1 AND workspace_id = $2 AND status = 'failed' ORDER BY seq`, [c.id, ctx.workspaceId])) {
        because.push({ point: `The tool "${t.name}" failed during the call.`, evidence: { event: 'tool', seq: t.seq, name: t.name } });
      }
      for (const h of await many<{ destination: string; brief: any }>(ctx.q, 'SELECT destination, brief FROM hand_off WHERE conversation_id = $1 AND workspace_id = $2', [c.id, ctx.workspaceId])) {
        because.push({ point: `Handed to ${h.destination}: ${h.brief?.reason ?? ''}`.trim(), evidence: { event: 'hand_off', seq: h.brief?.seq ?? null } });
      }
      const a = (c.analysis ?? null) as AnalysisRecord | null;
      for (const p of a?.points ?? []) because.push({ point: p.claim, evidence: { quote: p.quote, atMs: p.startMs, speaker: p.speaker } });
      const best = await one<{ value: string; grade: string; evidence: unknown }>(ctx.q,
        `SELECT value, grade, evidence FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY CASE grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, created_at DESC LIMIT 1`, [c.id, ctx.workspaceId]);
      return {
        conversationId: c.id, test: c.channel === 'test',
        headline: rc ? rc.label : c.status === 'live' ? 'The call is still live' : 'Not analysed yet',
        reason: rc ? { code: rc.code, stage: rc.stage, action: rc.action } : null,
        outcome: best ? { value: best.value, grade: best.grade, evidence: best.evidence, note: best.grade === 'ai_guess' ? 'AI guess: not verified by a system of record or a person' : null } : null,
        because,
        // What went wrong turn by turn, from the runtime's stored trace only (shared/call-trace.ts); [] when there is none.
        turnCauses: turnCauses(lines, c.trace),
        analysis: a ? { status: a.status, quotesProposed: a.quotesProposed ?? 0, quotesDropped: a.quotesDropped ?? 0 } : { status: 'not_measured' },
        cost: { totalInrMilli: Number(c.cost_inr_milli) },
        notes: c.channel === 'test' ? ['Test call: excluded from outcomes, funnels, monitors and learning.'] : [],
      };
    },
  }));

  // ---- outcome.define (draft per the tool registry: everyday work, kept in version history) ----------------------
  const defineIn = obj({
    id: opt(uuid()), name: str({ min: 1, max: 80 }), question: str({ min: 3, max: 300 }),
    allowedValues: arr(str({ min: 1, max: 60, pattern: /^[a-z0-9_]+$/ }), { min: 2, max: 20 }),
    goalValues: arr(str({ min: 1, max: 60 }), { min: 1, max: 20 }),
    verifiedBy: opt(str({ max: 60, desc: 'the system of record that verifies it, e.g. payment_webhook, crm_field, booking' })),
    campaignId: opt(uuid()),
    fields: opt(arr(obj({ key: str({ min: 1, max: 40, pattern: /^[a-z][a-z0-9_]*$/ }), label: opt(str({ max: 80 })), type: str({ oneOf: FIELD_TYPES }),
      // Typed values the analysis fills from what the caller said, each quoted from their words or left empty; sentiment is a five-point scale.
      values: opt(arr(str({ min: 1, max: 60, pattern: /^[a-z0-9_]+$/ }), { max: 20 })) }), { max: MAX_FIELDS })),
  });
  r.register(tool(defineIn, {
    name: 'outcome.define', risk: 'draft', summary: 'Define (or change) what counts as an outcome and which values reach the goal',
    describe: i => `${i.id ? 'Change' : 'Create'} the outcome "${i.name}": ${i.allowedValues.join(', ')}; goal = ${i.goalValues.join(', ')}; verified by ${i.verifiedBy ?? 'nothing yet (outcomes stay AI guesses)'}${i.fields?.length ? `; fields: ${i.fields.map(f => f.label ?? f.key).join(', ')}` : ''}`,
    version: async (ctx, i) => i.id ? String((await one<{ version: number }>(ctx.q, 'SELECT version FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]))?.version ?? 'missing') : 'new',
    run: async (ctx, i) => {
      for (const g of i.goalValues) if (!i.allowedValues.includes(g)) throw new Error(`goal value "${g}" is not one of the allowed values`);
      if (new Set(i.allowedValues).size !== i.allowedValues.length) throw new Error('allowed values must be distinct');
      // Fields are kept as they were when an edit leaves them out; [] removes them.
      const fields = i.fields ? JSON.stringify(validateFields(i.fields as FieldDef[])) : null;
      let id = i.id;
      if (id) {
        const u = await ctx.q.query(`UPDATE outcome_definition SET name = $3, question = $4, allowed_values = $5, goal_values = $6, verified_by = $7,
            fields = coalesce($8::jsonb, fields), version = version + 1
          WHERE id = $1 AND workspace_id = $2`, [id, ctx.workspaceId, i.name, i.question, i.allowedValues, i.goalValues, i.verifiedBy ?? null, fields]);
        if (!u.rowCount) throw new Error('no such outcome definition in this workspace');
      } else {
        id = (await one<{ id: string }>(ctx.q, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values, verified_by, fields) VALUES ($1,$2,$3,$4,$5,$6,coalesce($7::jsonb, '[]'::jsonb)) RETURNING id`,
          [ctx.workspaceId, i.name, i.question, i.allowedValues, i.goalValues, i.verifiedBy ?? null, fields]))!.id;
      }
      if (i.campaignId) {
        const u = await ctx.q.query('UPDATE campaign SET outcome_definition_id = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId, id]);
        if (!u.rowCount) throw new Error('no such campaign in this workspace');
      }
      return { outcomeDefinitionId: id, verified: Boolean(i.verifiedBy), note: i.verifiedBy ? null : 'No verified source: outcomes stay "AI guess" until one is wired or a person labels them.' };
    },
  }));

  // ---- outcome.list: what counts as an outcome, how it is judged, and whether that judge is trusted yet ----------------
  r.register(tool(obj({}), {
    name: 'outcome.list', risk: 'read', summary: 'The outcomes this workspace measures: allowed and goal values, typed fields, the judge (instructions and model) and its calibration',
    run: async ctx => {
      const defs = await many<{ id: string; name: string; question: string; allowed_values: string[]; goal_values: string[]; verified_by: string | null; fields: FieldDef[]; version: number }>(ctx.q,
        `SELECT id, name, question, allowed_values, goal_values, verified_by, fields, version FROM outcome_definition WHERE workspace_id = $1 ORDER BY created_at`, [ctx.workspaceId]);
      const setting = await analysisSetting(ctx.q, ctx.workspaceId);
      const out = [];
      for (const d of defs) {
        const campaigns = await many<{ id: string; name: string }>(ctx.q, 'SELECT id, name FROM campaign WHERE workspace_id = $1 AND outcome_definition_id = $2 ORDER BY name', [ctx.workspaceId, d.id]);
        const j = await one<{ id: string; name: string; model: string; config: { instructions?: string }; number: number; created_at: string }>(ctx.q,
          'SELECT id, name, model, config, number, created_at FROM judge_version WHERE workspace_id = $1 AND outcome_definition_id = $2 ORDER BY number DESC LIMIT 1', [ctx.workspaceId, d.id]);
        const k = j ? await one<{ n: number; agreement: string; wilson_lower: string; status: string; created_at: string }>(ctx.q,
          'SELECT n, agreement::text, wilson_lower::text, status, created_at FROM calibration WHERE judge_version_id = $1 ORDER BY created_at DESC LIMIT 1', [j.id]) : null;
        const labelled = await one<{ n: number }>(ctx.q, `SELECT count(DISTINCT conversation_id)::int AS n FROM outcome WHERE workspace_id = $1 AND definition_id = $2 AND grade IN ('verified','manager')`, [ctx.workspaceId, d.id]);
        out.push({ id: d.id, name: d.name, question: d.question, allowedValues: d.allowed_values, goalValues: d.goal_values, verifiedBy: d.verified_by, fields: d.fields ?? [], version: d.version,
          campaigns,
          judge: j ? { judgeVersionId: j.id, name: j.name, model: j.model, instructions: j.config?.instructions ?? '', number: j.number, since: j.created_at } : null,
          // With no judge of its own, the workspace's analysis model guesses the outcome; such a guess is never trusted.
          judgedBy: j ? null : analysisSettingText(setting),
          calibration: k ? { status: k.status as CalibrationStatus, n: k.n, agreement: Number(k.agreement), lower: Number(k.wilson_lower), at: k.created_at }
            : { status: 'uncalibrated' as const, n: 0, agreement: null, lower: null, at: null },
          labelledCalls: labelled!.n, trust: { minLabelled: TRUST.minN, agreement: TRUST.agreement, lower: TRUST.lower } });
      }
      return { definitions: out };
    },
  }));

  // ---- outcome.label (a person's label) and outcome.record_verified (a system of record) ------------------
  const labelIn = obj({ conversationId: uuid(), definitionId: uuid(), value: str({ min: 1, max: 60 }), note: opt(str({ max: 300 })) });
  const checkValue = async (ctx: ToolCtx, definitionId: string, value: string) => {
    const d = await one<{ allowed_values: string[] }>(ctx.q, 'SELECT allowed_values FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [definitionId, ctx.workspaceId]);
    if (!d) throw new Error('no such outcome definition in this workspace');
    if (!d.allowed_values.includes(value)) throw new Error(`"${value}" is not an allowed value (${d.allowed_values.join(', ')})`);
  };
  r.register(tool(labelIn, {
    name: 'outcome.label', risk: 'draft', summary: "Record a manager's outcome label for a call (used to calibrate judges)",
    roles: ['owner', 'builder', 'operator', 'compliance'],
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'member') throw new Error('only a person can label an outcome');
      const c = await conversation(ctx, i.conversationId);
      if (c.channel === 'test') throw new Error('test calls do not take outcomes');
      await checkValue(ctx, i.definitionId, i.value);
      await ctx.q.query(`DELETE FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 AND definition_id = $3 AND grade = 'manager'`, [c.id, ctx.workspaceId, i.definitionId]);
      await ctx.q.query(`INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence) VALUES ($1,$2,$3,$4,$5,'manager',$6,$7)`,
        [ctx.workspaceId, c.id, c.contact_id, i.definitionId, i.value, `member:${ctx.actor.id}`, { note: i.note ?? null }]);
      await refreshOutcome(ctx.q, ctx.workspaceId, c.id);
      return { ok: true, grade: 'manager' };
    },
  }));
  r.register(tool(obj({ conversationId: uuid(), definitionId: uuid(), value: str({ min: 1, max: 60 }), key: obj({ source: str({ min: 1, max: 60 }), ref: str({ min: 1, max: 200 }) }) }), {
    name: 'outcome.record_verified', risk: 'draft', roles: [],
    summary: 'Record an outcome verified by a system of record (payment, booking or CRM webhook). Called by integrations, never by a person or model',
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'system') throw new Error('verified outcomes come only from a verified key delivered by an integration');
      return recordVerified(ctx.q, ctx.workspaceId, i);
    },
  }));

  // ---- shared readings for other modules (system only): learning's experiment rewards and the judge re-check ----------
  r.register(tool(obj({ conversationIds: arr(uuid(), { max: 5000 }) }), {
    name: 'outcome.readings', risk: 'read', roles: [],
    summary: 'For other modules: per live call, the outcome that counts and its grade (verified, manager or a trusted AI read), the AI read, and its judge status',
    run: (ctx, i) => outcomeReadings(ctx.q, ctx.workspaceId, i.conversationIds),
  }));
  r.register(tool(obj({ judgeVersionId: uuid(), n: num({ int: true, min: 1 }), agreement: num({ min: 0, max: 1 }), reason: str({ min: 3, max: 300 }) }), {
    name: 'judge.flag_recheck', risk: 'draft', roles: [],
    summary: "For other modules: a judge whose reads disagree with verified outcomes needs a re-check; its reads stop counting until it is calibrated again",
    run: (ctx, i) => { if (ctx.actor.type !== 'system') throw new Error('only a system check flags a judge'); return flagJudgeRecheck(ctx.q, ctx.workspaceId, i); },
  }));

  // ---- judge.edit (draft per the tool registry; each edit is a new pinned version) and judge.calibrate ---------------
  const judgeIn = obj({ outcomeDefinitionId: uuid(), name: str({ min: 1, max: 80 }), model: str({ min: 1, max: 120, desc: 'dated model id the judge is pinned to' }),
    instructions: str({ max: 2000 }) });
  const judgeNumber = async (ctx: ToolCtx, def: string) => (await one<{ n: number }>(ctx.q,
    'SELECT coalesce(max(number), 0) AS n FROM judge_version WHERE workspace_id = $1 AND outcome_definition_id = $2', [ctx.workspaceId, def]))!.n;
  r.register(tool(judgeIn, {
    name: 'judge.edit', risk: 'draft', summary: 'Create a new pinned version of the judge that guesses an outcome; it starts uncalibrated',
    describe: i => `New version of judge "${i.name}" pinned to ${i.model}, temperature 0. It is uncalibrated until it agrees with verified or human labels.`,
    version: async (ctx, i) => String(await judgeNumber(ctx, i.outcomeDefinitionId)),
    run: async (ctx, i) => {
      const d = await one(ctx.q, 'SELECT 1 FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [i.outcomeDefinitionId, ctx.workspaceId]);
      if (!d) throw new Error('no such outcome definition in this workspace');
      const n = (await judgeNumber(ctx, i.outcomeDefinitionId)) + 1;
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO judge_version (workspace_id, name, model, config, outcome_definition_id, number) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.workspaceId, i.name, i.model, { instructions: i.instructions, temperature: 0, kind: 'llm_extraction' }, i.outcomeDefinitionId, n]);
      return { judgeVersionId: row!.id, number: n, status: 'uncalibrated' };
    },
  }));
  r.register(tool(obj({ judgeVersionId: uuid() }), {
    name: 'judge.calibrate', risk: 'draft', summary: "Measure a judge's agreement with verified and human labels (Wilson 95% lower bound) and record it",
    run: async (ctx, i) => {
      const j = await one<{ id: string; outcome_definition_id: string }>(ctx.q, 'SELECT id, outcome_definition_id FROM judge_version WHERE id = $1 AND workspace_id = $2', [i.judgeVersionId, ctx.workspaceId]);
      if (!j) throw new Error('no such judge in this workspace');
      // Pairs: this judge's guess against the best human truth on the same call (verified first, then manager). Test calls never pair.
      const pairs = await many<{ guess: string; truth: string }>(ctx.q,
        `SELECT g.value AS guess, t.value AS truth FROM outcome g
         JOIN conversation cv ON cv.id = g.conversation_id AND cv.workspace_id = g.workspace_id AND cv.channel <> 'test'
         JOIN LATERAL (SELECT value FROM outcome t WHERE t.conversation_id = g.conversation_id AND t.workspace_id = g.workspace_id AND t.definition_id = g.definition_id
                       AND t.grade IN ('verified','manager') ORDER BY CASE t.grade WHEN 'verified' THEN 0 ELSE 1 END, t.created_at DESC LIMIT 1) t ON true
         WHERE g.workspace_id = $1 AND g.judge_version_id = $2 AND g.grade = 'ai_guess'`, [ctx.workspaceId, j.id]);
      const n = pairs.length, k = pairs.filter(p => p.guess === p.truth).length;
      const agreement = n ? k / n : 0, lower = wilsonLower(k, n), status = calibrationStatus(n, agreement, lower);
      const confusion: Record<string, Record<string, number>> = {};
      for (const p of pairs) (confusion[p.truth] ??= {})[p.guess] = (confusion[p.truth][p.guess] ?? 0) + 1;
      await ctx.q.query('INSERT INTO calibration (judge_version_id, workspace_id, n, agreement, wilson_lower, status, confusion) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [j.id, ctx.workspaceId, n, agreement, lower, status, confusion]);
      // Trust changed, so the outcome that counts may change on every call this judge guessed.
      for (const r of await many<{ id: string }>(ctx.q, `SELECT DISTINCT conversation_id AS id FROM outcome WHERE workspace_id = $1 AND judge_version_id = $2`, [ctx.workspaceId, j.id])) {
        await refreshOutcome(ctx.q, ctx.workspaceId, r.id);
      }
      return { judgeVersionId: j.id, n, agreed: k, agreement, wilsonLower: lower, status, confusion };
    },
  }));

  // ---- issues and monitors ----------------------------------------------------------------------------------
  // Blueprint decision 9's per-line fast lane (calls/line-watch.ts): run after every analysed live call, next to learning's
  // script.harm_check. Draft: it slows a script through learning's script_throttle and opens an issue; restoring is a member's tap.
  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'script.line_check', risk: 'draft', summary: "Check whether one of the agent's lines keeps being followed by a hang-up, an opt-out or a complaint, and slow the script if so",
    describe: () => 'Check the script for a line people keep reacting badly to',
    run: (ctx, i) => lineCheck(ctx.q, ctx.workspaceId, i.conversationId),
  }));
  r.register(tool(obj({ status: opt(str({ oneOf: ['open', 'acknowledged', 'resolved'] })) }), {
    name: 'issue.list', risk: 'read', summary: 'List issues opened by monitors, with their evidence calls',
    run: async (ctx, i) => ({ issues: await many(ctx.q, `SELECT id, category, severity, status, detail, monitor_id, created_at, resolved_at, resolution FROM issue
      WHERE workspace_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC LIMIT 100`, [ctx.workspaceId, i.status ?? null]) }),
  }));
  r.register(tool(obj({ issueId: uuid(), resolution: str({ min: 3, max: 1000 }) }), {
    name: 'issue.resolve', risk: 'draft', summary: 'Mark an issue resolved, saying what fixed it',
    run: async (ctx, i) => {
      const u = await ctx.q.query(`UPDATE issue SET status = 'resolved', resolved_at = now(), resolution = $3 WHERE id = $1 AND workspace_id = $2 AND status <> 'resolved'`,
        [i.issueId, ctx.workspaceId, i.resolution]);
      if (!u.rowCount) throw new Error('no open issue with that id in this workspace');
      return { ok: true };
    },
  }));
  r.register(tool(obj({}), {
    name: 'monitor.list', risk: 'read', summary: 'List monitors and when each was last read; "not read yet" is never shown as all good',
    run: async ctx => {
      const rows = await many<{ id: string; name: string; config: unknown; enabled: boolean; last_read_at: Date | null }>(ctx.q,
        'SELECT id, name, config, enabled, last_read_at FROM monitor WHERE workspace_id = $1 ORDER BY name', [ctx.workspaceId]);
      return { monitors: rows, defaults: rows.length ? undefined : DEFAULT_MONITORS, health: rows.some(r => r.enabled && r.last_read_at) ? 'monitored' : 'not_monitored_yet' };
    },
  }));
  r.register(tool(obj({ name: str({ min: 1, max: 80 }), signal: str({ oneOf: ['early_hangup_rate', 'tool_failure_rate', 'safety_event_rate', 'opt_out_rate', 'engine_error_rate', 'quotes_dropped_rate'] }),
    threshold: num({ min: 0, max: 1 }), windowCalls: num({ int: true, min: 1, max: 1000 }), minCalls: num({ int: true, min: 1, max: 1000 }),
    severity: str({ oneOf: ['critical', 'warning', 'info'] }), category: str({ min: 1, max: 40 }) }), {
    name: 'monitor.create', risk: 'draft', summary: 'Add a monitor: a signal over the last N calls that opens an issue when it crosses a threshold',
    run: async (ctx, i) => {
      await ensureDefaultMonitors(ctx.q, ctx.workspaceId);
      const { name, ...config } = i;
      return { monitorId: (await one<{ id: string }>(ctx.q, 'INSERT INTO monitor (workspace_id, name, config) VALUES ($1,$2,$3) RETURNING id', [ctx.workspaceId, name, config]))!.id };
    },
  }));

  // ---- campaign.funnel and report.create --------------------------------------------------------------------
  r.register(tool(obj({ campaignId: uuid() }), {
    name: 'campaign.funnel', risk: 'read', summary: 'Dialled, connected, talked and goal reached for a campaign, per agent version, with outcome grades',
    run: async (ctx, i) => {
      if (!(await one(ctx.q, 'SELECT 1 FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]))) throw new Error('no such campaign in this workspace');
      return campaignFunnel(ctx.q, ctx.workspaceId, i.campaignId);
    },
  }));
  r.register(tool(obj({ title: str({ min: 1, max: 120 }), campaignId: opt(uuid()), from: opt(date), to: opt(date) }), {
    name: 'report.create', risk: 'draft', summary: 'Build and save a report of calls: reasons, outcomes by grade, cost and the funnel; test calls excluded',
    run: async (ctx, i) => {
      if (i.campaignId && !(await one(ctx.q, 'SELECT 1 FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]))) throw new Error('no such campaign in this workspace');
      const p = [ctx.workspaceId, i.campaignId ?? null, i.from ?? null, i.to ?? null];
      const scope = `FROM conversation cv LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
        WHERE cv.workspace_id = $1 AND cv.channel <> 'test' AND ($2::uuid IS NULL OR a.campaign_id = $2)
          AND ($3::timestamptz IS NULL OR cv.started_at >= $3) AND ($4::timestamptz IS NULL OR cv.started_at < $4)`;
      const totals = await one<{ calls: string; cost: string; seconds: string; flagged: string }>(ctx.q,
        `SELECT count(*)::text AS calls, coalesce(sum(cv.cost_inr_milli), 0)::text AS cost, coalesce(sum(cv.duration_s), 0)::text AS seconds,
                count(*) FILTER (WHERE cv.flagged)::text AS flagged ${scope}`, p);
      const reasons = await many<{ code: string | null; n: string }>(ctx.q, `SELECT cv.reason_code AS code, count(*)::text AS n ${scope} GROUP BY 1 ORDER BY 2 DESC`, p);
      const outcomes = await many<{ value: string | null; grade: string | null; n: string }>(ctx.q,
        `SELECT ${BEST_OUTCOME} AS value, ${BEST_GRADE} AS grade, count(*)::text AS n ${scope} GROUP BY 1, 2 ORDER BY 3 DESC`, p);
      const content = {
        calls: Number(totals!.calls), flagged: Number(totals!.flagged), costInrMilli: Number(totals!.cost), seconds: Number(totals!.seconds),
        reasons: reasons.map(r => ({ code: r.code, label: reasonFor(r.code)?.label ?? 'not analysed', n: Number(r.n) })),
        outcomes: outcomes.filter(o => o.value).map(o => ({ value: o.value, grade: o.grade, n: Number(o.n) })),
        noOutcome: outcomes.filter(o => !o.value).reduce((s, o) => s + Number(o.n), 0),
        funnel: i.campaignId ? await campaignFunnel(ctx.q, ctx.workspaceId, i.campaignId) : null,
        excluded: 'test calls',
      };
      const row = await one<{ id: string; created_at: Date }>(ctx.q, 'INSERT INTO call_report (workspace_id, title, scope, content, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at',
        [ctx.workspaceId, i.title, { campaignId: i.campaignId, from: i.from, to: i.to }, content, ctx.actor.id ?? ctx.actor.type]);
      return { reportId: row!.id, createdAt: row!.created_at, content };
    },
  }));

  // ---- live control (runtime().control) ------------------------------------------------------------------------
  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'live.listen', risk: 'draft', summary: 'Listen to a live call (audited)',
    prepare: async (ctx, i) => {
      await liveCall({ q: ctx.pool, workspaceId: ctx.workspaceId, actor: ctx.actor }, i.conversationId);
      const rep = await runtime().control(i.conversationId, 'listen', { by: ctx.actor.id ?? ctx.actor.type });
      if (!rep.ok) throw new Error(`the voice runtime refused to open a listen session${runtimeReason(rep.detail)}`);
      return joinOf(rep.detail);
    },
    // join: {kind:'listen', url, token, expiresAtMs}, receive-only; closing it never touches the call.
    run: async (_ctx, _i, join) => ({ ok: true, join }),
  }));
  // 300 characters: the runtime's own cap (it would truncate silently), so a longer note is refused here, in words.
  r.register(tool(obj({ conversationId: uuid(), text: str({ min: 1, max: WHISPER_MAX_CHARS, desc: `at most ${WHISPER_MAX_CHARS} characters` }) }), {
    name: 'live.whisper', risk: 'external', summary: 'Whisper context to the agent on a live call; the caller does not hear it',
    describe: async (i, ctx) => `Whisper to the agent on ${await label(ctx, 'call', i.conversationId)}: "${i.text}"`,
    // The runtime request stays in run(), not prepare(): on the approval path prepare() runs before the approver's role,
    // the args hash and the object version are checked, and a whisper reaches a live call.
    run: async (ctx, i) => {
      const c = await liveCall(ctx, i.conversationId);
      const rep = await runtime().control(c.id, 'whisper', { text: i.text, by: ctx.actor.id ?? ctx.actor.type });
      if (!rep.ok) throw new Error(`the voice runtime refused the whisper${runtimeReason(rep.detail)}`);
      return { ok: true };
    },
  }));
  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'live.takeover', risk: 'draft', roles: ['owner', 'operator', 'compliance'],
    summary: 'A person takes over a live call; the agent leaves for good. Human only, never a model',
    prepare: async (ctx, i) => {
      if (ctx.actor.type !== 'member' || !ctx.actor.id) throw new Error('only a signed-in person can take over a call');
      await liveCall({ q: ctx.pool, workspaceId: ctx.workspaceId, actor: ctx.actor }, i.conversationId);
      const rep = await runtime().control(i.conversationId, 'takeover', { memberId: ctx.actor.id });
      if (!rep.ok) throw new Error(`the voice runtime refused the take-over${runtimeReason(rep.detail)}`);
      return joinOf(rep.detail);
    },
    // join: {kind:'takeover', url, token, expiresAtMs}, a two-way socket for the person. The runtime then reports
    // hand_off {reason:'takeover', target:'member:<id>'}; she never speaks on this call again.
    run: async (ctx, i, join) => {
      const c = await conversation(ctx, i.conversationId);
      await ctx.q.query(`UPDATE conversation SET flagged = true, flags = ARRAY(SELECT DISTINCT unnest(flags || '{human_joined}'::text[]) ORDER BY 1) WHERE id = $1 AND workspace_id = $2`, [c.id, ctx.workspaceId]);
      return { ok: true, join };
    },
  }));

  // ---- cross-call insight (insights.ts) ---------------------------------------------------------------------------
  const scopeIn = { agentId: opt(uuid()), campaignId: opt(uuid()) };
  const scopeOf = async (q: Queryable, ws: string, i: { agentId?: string; campaignId?: string }): Promise<Scope> => {
    if (i.agentId && i.campaignId) throw new Error('give an agent or a campaign, not both');
    if (i.agentId) {
      if (!(await one(q, 'SELECT 1 FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ws]))) throw new Error('no such agent in this workspace');
      return { type: 'agent', id: i.agentId };
    }
    if (i.campaignId) {
      if (!(await one(q, 'SELECT 1 FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ws]))) throw new Error('no such campaign in this workspace');
      return { type: 'campaign', id: i.campaignId };
    }
    return { type: 'workspace', id: null };
  };
  r.register(tool(obj(scopeIn), {
    name: 'insight.get', risk: 'read',
    summary: 'Themes across recent calls (objections, drop-offs, unanswered questions, what came before a reached goal), each with verbatim quotes',
    run: async (ctx, i) => { const s = await scopeOf(ctx.q, ctx.workspaceId, i); return presentInsight(s, await latestInsight(ctx.q, ctx.workspaceId, s)); },
  }));
  r.register(tool(obj({ ...scopeIn, force: opt(bool()) }), {
    name: 'insight.refresh', risk: 'draft',
    summary: 'Rebuild the themes across recent calls now (skipped when no call has ended since the last one, unless forced)',
    // The model call runs in prepare(), outside any transaction; run() only stores.
    prepare: async (ctx, i) => {
      const s = await scopeOf(ctx.pool, ctx.workspaceId, i);
      return { s, c: await computeInsight(ctx.pool, ctx.workspaceId, s, { force: i.force }) };
    },
    run: async (ctx, _i, prepared) => {
      const { s, c } = prepared as { s: Scope; c: Computed };
      if (c.ran) await storeInsight(ctx.q, ctx.workspaceId, s, c.result);
      return { ran: c.ran, ...(c.ran ? {} : { reason: c.reason, skipped: c.status }), ...presentInsight(s, await latestInsight(ctx.q, ctx.workspaceId, s)) };
    },
  }));

  // ---- which model analyses calls (per workspace) -----------------------------------------------------------------
  r.register(tool(obj({}), {
    name: 'analysis.settings.get', risk: 'read',
    summary: 'Which model analyses calls in this workspace (one model, or a cheaper first pass that escalates unclear calls) and the models to choose from',
    run: async ctx => { const s = await analysisSetting(ctx.q, ctx.workspaceId);
      // Calls read by one model, and how many of them tiered would have read again (open.2026-10-24.analysis-escalation-path-unexercised).
      const w = (await one<{ calls: number; would: number }>(ctx.q, `SELECT count(*)::int AS calls, count(*) FILTER (WHERE analysis->>'wouldEscalate' IS NOT NULL)::int AS would
        FROM conversation WHERE workspace_id = $1 AND channel <> 'test' AND analysis ? 'wouldEscalate'`, [ctx.workspaceId]))!;
      return { ...s, models: curatedAnalysisModels(), text: analysisSettingText(s), wouldEscalate: { calls: w.would, ofSinglePassCalls: w.calls },
      note: 'Tiered: the first model reads every call; a call with no clear outcome, or one below the confidence threshold, is read again by the second model.' }; },
  }));
  const modelId = str({ min: 1, max: 80, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, desc: 'a curated model id from analysis.settings.get' });
  r.register(tool(obj({ mode: str({ oneOf: ['single', 'tiered'] }), model: opt(modelId), escalateModel: opt(modelId), threshold: opt(num({ min: 0, max: 1 })) }), {
    name: 'analysis.model.set', risk: 'spend',
    summary: 'Choose the model that analyses calls, or a tiered pair; it changes what each call\'s analysis costs, never what is checked',
    describe: i => i.mode === 'tiered'
      ? `Analyse calls with "${i.model ?? 'the default model'}" first, and read unclear calls again with "${i.escalateModel}" (threshold ${i.threshold ?? 0.6}). Each call is billed at the models it used.`
      : `Analyse calls with "${i.model ?? 'the default model'}". Each call is billed at that model's rate.`,
    version: async ctx => JSON.stringify(await analysisSetting(ctx.q, ctx.workspaceId)),
    run: async (ctx, i) => {
      const curated = curatedAnalysisModels();
      for (const m of [i.model, i.escalateModel]) if (m && !curated.includes(m)) throw new Error(`"${m}" is not one of the curated analysis models`);
      if (i.mode === 'tiered' && !i.escalateModel) throw new Error('a tiered setting needs a second model to escalate to');
      if (i.mode === 'single' && i.escalateModel) throw new Error('one model only: leave the second model out, or choose tiered');
      await ctx.q.query(`INSERT INTO call_analysis_setting (workspace_id, mode, model, escalate_model, threshold) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (workspace_id) DO UPDATE SET mode = $2, model = $3, escalate_model = $4, threshold = $5, updated_at = now()`,
        [ctx.workspaceId, i.mode, i.model ?? null, i.escalateModel ?? null, i.threshold ?? 0.6]);
      return analysisSetting(ctx.q, ctx.workspaceId);
    },
  }));
}
