// The calls module's tools: test calls, the call record, search, explanation, outcomes, judges, issues,
// reports, the campaign funnel and live control. Every query filters by ctx.workspaceId.
import { randomUUID } from 'node:crypto';
import { many, one } from '../../db.ts';
import { runtime } from '../../runtime-client.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import type { AgentConfig } from '../../../shared/agent-config.ts';
import type { CallTicket } from '../../../shared/runtime-protocol.ts';
import { combinationId, requireStack } from '../../../shared/stacks.ts';
import { arr, bool, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { DEFAULT_MONITORS, ensureDefaultMonitors, refreshOutcome, type AnalysisRecord } from './analysis.ts';
import { BEST_GRADE, BEST_OUTCOME, calibrationStatus, campaignFunnel, wilsonLower } from './stats.ts';
import { REASON_CODES, reasonFor } from './taxonomy.ts';

// Test calls run inside a daily test budget (workspace blueprint: ₹200 a day, proposed) and a per-call cap.
export const TEST_BUDGET_PER_DAY_INR_MILLI = 200_000;
export const TEST_CALL_MAX_COST_INR_MILLI = 50_000;

const date = str({ pattern: /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/ });
const reasonCode = str({ oneOf: REASON_CODES.map(r => r.code) });

async function conversation(ctx: ToolCtx, id: string) {
  const c = await one<Record<string, any>>(ctx.q, `SELECT cv.*, a.campaign_id FROM conversation cv LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
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

const SYSTEM = { type: 'system' as const, id: 'calls.test_call' };

/** The runtime's admission cap: POST /v1/calls answers 503 {error:'at_capacity', retryAfterS} and places nothing.
 *  Read from StartReply.retryable/retryAfterS when the kernel client sets them, else from the reason text it carries today. */
export function atCapacity(rep: { accepted: boolean; reason?: string; retryable?: boolean; retryAfterS?: number }): { retryAfterS: number } | null {
  if (rep.accepted) return null;
  if (rep.retryable) return { retryAfterS: Math.max(1, Math.round(rep.retryAfterS ?? 5)) };
  if (!/\b503\b/.test(rep.reason ?? '') || !/at_capacity/.test(rep.reason ?? '')) return null;
  const n = Number(/"retryAfterS"\s*:\s*(\d+)/.exec(rep.reason ?? '')?.[1] ?? 5);
  return { retryAfterS: Math.max(1, n) };
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
           WHERE v.agent_id = $1 ${i.versionId ? 'AND v.id = $3' : ''} ORDER BY v.number DESC LIMIT 1`,
          i.versionId ? [i.agentId, ctx.workspaceId, i.versionId] : [i.agentId, ctx.workspaceId]);
        if (!v) throw new Error(i.versionId ? 'no such version of this agent' : 'this agent has no version yet; test its draft with useDraft');
        cfg = v.config; versionId = v.id;
      }
      if (!cfg?.agent || !cfg?.brief?.text || !cfg.brief.hash) throw new Error('this agent has no compiled brief yet; compile the draft first');
      const stack = requireStack(cfg.agent.voice?.stackId);

      const spent = await one<{ s: string }>(ctx.pool, `SELECT coalesce(sum(cost_inr_milli), 0)::text AS s FROM conversation
        WHERE workspace_id = $1 AND channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`, [ctx.workspaceId]);
      if (Number(spent!.s) + TEST_CALL_MAX_COST_INR_MILLI > TEST_BUDGET_PER_DAY_INR_MILLI) throw new Error("today's test budget is used up; it resets at midnight IST");

      const id = randomUUID();
      await ctx.pool.query(`INSERT INTO conversation (id, workspace_id, agent_version_id, channel, direction, status, run_manifest) VALUES ($1,$2,$3,'test','outbound','live',$4)`,
        [id, ctx.workspaceId, versionId, { test: true, ...(draftHash ? { draftHash } : {}) }]);
      const ticket: CallTicket = {
        protocol: 1, conversationId: id, attemptId: null, workspaceId: ctx.workspaceId, direction: 'outbound',
        transport: { kind: 'webrtc', offerUrl: `/v1/test-calls/${id}/offer` },
        agent: cfg.agent, brief: cfg.brief, stack: { id: stack.id, combinationId: combinationId(stack, cfg.agent.voice.voiceId) },
        contact: { displayName: '', timezone: 'Asia/Kolkata', facts: {}, memoryBrief: '', memoryStatus: 'disabled' },
        consent: { basis: 'consent' },
        limits: { maxDurationS: Math.min(cfg.agent.limits?.maxDurationS ?? 300, 900), maxCostInrMilli: TEST_CALL_MAX_COST_INR_MILLI },
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
    run: async (ctx, i) => {
      const c = await conversation(ctx, i.conversationId);
      // One after another: a transaction client runs one query at a time (pg deprecates queued parallel queries on a client).
      const read = (sql: string, params: unknown[]) => many(ctx.q, sql, params);
      const turns = await read('SELECT idx, speaker, text, latency, interrupted, started_ms, ended_ms FROM turn WHERE conversation_id = $1 ORDER BY idx', [c.id]);
      const moments = await read('SELECT source, kind, at_ms, note, quote FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY at_ms NULLS LAST', [c.id, ctx.workspaceId]);
      const safety = await read('SELECT seq, rule, action, detail, at FROM call_safety_event WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [c.id, ctx.workspaceId]);
      const tools = await read('SELECT seq, name, args, status, at FROM call_tool_event WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY seq', [c.id, ctx.workspaceId]);
      const handOffs = await read('SELECT mode, destination, status, brief, created_at FROM hand_off WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
      const costs = await read('SELECT component, provider, quantity::float AS quantity, unit, inr_milli::int AS inr_milli, detail FROM cost_line WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
      const outcomes = await read('SELECT value, grade, source, evidence, definition_id, created_at FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
      const rc = reasonFor(c.reason_code);
      return {
        id: c.id, channel: c.channel, test: c.channel === 'test', status: c.status, direction: c.direction, campaignId: c.campaign_id, attemptId: c.attempt_id,
        contactId: c.contact_id, agentVersionId: c.agent_version_id, startedAt: c.started_at, endedAt: c.ended_at, durationS: c.duration_s,
        endReason: c.end_reason, reason: rc ? { code: rc.code, label: rc.label, action: rc.action } : null, outcome: c.outcome,
        recordingUri: c.recording_uri, runManifest: c.run_manifest, transcript: c.transcript, flagged: c.flagged, flags: c.flags,
        cost: { totalInrMilli: Number(c.cost_inr_milli), lateInrMilli: Number(c.late_cost_inr_milli), settlement: c.settlement, lines: costs },
        turns, moments, safety, tools, handOffs, outcomes, analysis: c.analysis,
      };
    },
  }));

  // ---- call.search --------------------------------------------------------------------------------------
  r.register(tool(obj({
    campaignId: opt(uuid()), agentVersionId: opt(uuid()), outcome: opt(str({ max: 80 })), reasonCode: opt(reasonCode),
    from: opt(date), to: opt(date), flagged: opt(bool()), includeTest: opt(bool()), limit: opt(num({ int: true, min: 1, max: 200 })), before: opt(date),
  }), {
    name: 'call.search', risk: 'read', summary: 'Find calls by campaign, outcome, reason code, date or flag; test calls only when asked',
    run: async (ctx, i) => {
      const where = ['cv.workspace_id = $1'], p: unknown[] = [ctx.workspaceId];
      const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', '$' + p.length)); };
      if (!i.includeTest) where.push(`cv.channel <> 'test'`);
      if (i.campaignId) add('a.campaign_id = ?', i.campaignId);
      if (i.agentVersionId) add('cv.agent_version_id = ?', i.agentVersionId);
      if (i.reasonCode) add('cv.reason_code = ?', i.reasonCode);
      if (i.outcome) add(`${BEST_OUTCOME} = ?`, i.outcome);
      if (i.from) add('cv.started_at >= ?::timestamptz', i.from);
      if (i.to) add('cv.started_at < ?::timestamptz', i.to);
      if (i.before) add('cv.started_at < ?::timestamptz', i.before);
      if (i.flagged !== undefined) add('cv.flagged = ?', i.flagged);
      p.push(i.limit ?? 50);
      const rows = await many<Record<string, any>>(ctx.q,
        `SELECT cv.id, cv.channel, cv.status, cv.started_at, cv.ended_at, cv.duration_s, cv.end_reason, cv.reason_code, cv.flagged, cv.flags,
                cv.cost_inr_milli::int AS cost_inr_milli, cv.contact_id, cv.agent_version_id, a.campaign_id, ${BEST_OUTCOME} AS outcome, ${BEST_GRADE} AS grade
         FROM conversation cv LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
         WHERE ${where.join(' AND ')} ORDER BY cv.started_at DESC LIMIT $${p.length}`, p);
      return { calls: rows.map(x => ({ ...x, reasonLabel: reasonFor(x.reason_code)?.label ?? null })), next: rows.length === (i.limit ?? 50) ? rows[rows.length - 1].started_at : null };
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
      if (c.end_reason) because.push({ point: `The call ended: ${c.end_reason.replaceAll('_', ' ')} after ${c.duration_s ?? 0} s.`, evidence: { event: 'call.ended', endReason: c.end_reason, durationS: c.duration_s } });
      const moments = await many<{ source: string; kind: string; at_ms: number | null; note: string | null; quote: string | null }>(ctx.q,
        'SELECT source, kind, at_ms, note, quote FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY at_ms NULLS LAST', [c.id, ctx.workspaceId]);
      for (const m of moments) {
        if (m.source === 'analysis' && m.quote) because.push({ point: `${m.kind.replaceAll('_', ' ')}${m.note ? ': ' + m.note : ''}`, evidence: { quote: m.quote, atMs: m.at_ms } });
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
  });
  r.register(tool(defineIn, {
    name: 'outcome.define', risk: 'draft', summary: 'Define (or change) what counts as an outcome and which values reach the goal',
    describe: i => `${i.id ? 'Change' : 'Create'} the outcome "${i.name}": ${i.allowedValues.join(', ')}; goal = ${i.goalValues.join(', ')}; verified by ${i.verifiedBy ?? 'nothing yet (outcomes stay AI guesses)'}`,
    version: async (ctx, i) => i.id ? String((await one<{ version: number }>(ctx.q, 'SELECT version FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]))?.version ?? 'missing') : 'new',
    run: async (ctx, i) => {
      for (const g of i.goalValues) if (!i.allowedValues.includes(g)) throw new Error(`goal value "${g}" is not one of the allowed values`);
      if (new Set(i.allowedValues).size !== i.allowedValues.length) throw new Error('allowed values must be distinct');
      let id = i.id;
      if (id) {
        const u = await ctx.q.query(`UPDATE outcome_definition SET name = $3, question = $4, allowed_values = $5, goal_values = $6, verified_by = $7, version = version + 1
          WHERE id = $1 AND workspace_id = $2`, [id, ctx.workspaceId, i.name, i.question, i.allowedValues, i.goalValues, i.verifiedBy ?? null]);
        if (!u.rowCount) throw new Error('no such outcome definition in this workspace');
      } else {
        id = (await one<{ id: string }>(ctx.q, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values, verified_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.workspaceId, i.name, i.question, i.allowedValues, i.goalValues, i.verifiedBy ?? null]))!.id;
      }
      if (i.campaignId) {
        const u = await ctx.q.query('UPDATE campaign SET outcome_definition_id = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId, id]);
        if (!u.rowCount) throw new Error('no such campaign in this workspace');
      }
      return { outcomeDefinitionId: id, verified: Boolean(i.verifiedBy), note: i.verifiedBy ? null : 'No verified source: outcomes stay "AI guess" until one is wired or a person labels them.' };
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
      const c = await conversation(ctx, i.conversationId);
      if (c.channel === 'test') throw new Error('test calls do not take outcomes');
      await checkValue(ctx, i.definitionId, i.value);
      const dup = await one(ctx.q, `SELECT 1 FROM outcome WHERE workspace_id = $1 AND grade = 'verified' AND evidence->'key' = $2::jsonb`, [ctx.workspaceId, JSON.stringify(i.key)]);
      if (dup) return { ok: true, duplicate: true };
      await ctx.q.query(`INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence) VALUES ($1,$2,$3,$4,$5,'verified',$6,$7)`,
        [ctx.workspaceId, c.id, c.contact_id, i.definitionId, i.value, i.key.source, { key: i.key }]);
      await refreshOutcome(ctx.q, ctx.workspaceId, c.id);
      return { ok: true, grade: 'verified' };
    },
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
  r.register(tool(obj({ conversationId: uuid(), text: str({ min: 1, max: 500 }) }), {
    name: 'live.whisper', risk: 'external', summary: 'Whisper context to the agent on a live call; the caller does not hear it',
    describe: i => `Whisper to the agent on call ${i.conversationId.slice(0, 8)}: "${i.text}"`,
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
}
