// The post-call pass. Code first, model second: the reason code for anything the engine knows was set at
// ingest; one LLM pass (purpose 'analysis', JSON out) then classifies — points with quotes, moments, a
// refined business reason for a normally-ended call, and an outcome guess — and code checks every quote.
// A quote that is not an exact substring of a stored transcript line is dropped and counted; a point, moment
// or outcome whose quote was dropped goes with it. The model never grades: its outcome is an 'ai_guess', and
// only a verified key or a person upgrades it. Test calls are analysed for the builder but write no outcome
// and are never evaluated by monitors.
import type pg from 'pg';
import { many, one, tx, type Queryable } from '../../db.ts';
import { complete, llmConfigured, LlmError } from '../../llm.ts';
import { CONVERSATION_CODES, REASON_CODES, REFINABLE, EARLY_HANGUP_S } from './taxonomy.ts';

const MOMENT_KINDS = ['objection', 'question', 'commitment', 'opt_out', 'callback_request', 'confusion', 'laughter'] as const;

type Line = { speaker: 'agent' | 'caller'; text: string; startMs: number };

/** A quote counts only as an exact substring of one stored transcript line (no paraphrase, no stitching across turns). */
export function findQuote(lines: Line[], quote: unknown): Line | null {
  if (typeof quote !== 'string') return null;
  const q = quote.trim();
  if (q.length < 3) return null;
  return lines.find(l => l.text.includes(q)) ?? null;
}

const inflight = new Set<Promise<void>>();

/** Run the analysis in the background after the ingest transaction commits. */
export function queueAnalysis(pool: pg.Pool, workspaceId: string, conversationId: string): void {
  const p: Promise<void> = analyse(pool, workspaceId, conversationId)
    .then(() => undefined, e => { console.error('[vp] calls analysis failed', conversationId, e instanceof Error ? e.message : e); })
    .finally(() => inflight.delete(p));
  inflight.add(p);
}

/** Tests: wait until every queued analysis has finished. */
export async function analysesSettled(): Promise<void> {
  while (inflight.size) await Promise.all([...inflight]);
}

interface ConvRow { id: string; channel: string; transcript: Line[]; reason_code: string | null; end_reason: string | null; duration_s: number | null;
  contact_id: string | null; def_id: string | null; def_name: string | null; def_question: string | null; allowed_values: string[] | null }

export interface AnalysisRecord {
  status: 'done' | 'failed' | 'not_configured' | 'skipped';
  summary?: string;
  points?: { claim: string; quote: string; startMs: number; speaker: string }[];
  quotes?: { text: string; startMs: number; speaker: string }[];
  quotesProposed?: number;
  quotesDropped?: number;
  reasonCode?: string;
  modelReasonCode?: string | null;
  outcomeGuess?: { value: string; quote: string } | null;
  judgeVersionId?: string | null;
  model?: string;
  reason?: string;
}

export async function analyse(pool: pg.Pool, workspaceId: string, conversationId: string): Promise<AnalysisRecord> {
  const cv = await one<ConvRow>(pool,
    `SELECT cv.id, cv.channel, cv.transcript, cv.reason_code, cv.end_reason, cv.duration_s, cv.contact_id,
            d.id AS def_id, d.name AS def_name, d.question AS def_question, d.allowed_values
     FROM conversation cv
     LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
     LEFT JOIN campaign c ON c.id = a.campaign_id AND c.workspace_id = cv.workspace_id
     LEFT JOIN outcome_definition d ON d.id = c.outcome_definition_id AND d.workspace_id = cv.workspace_id
     WHERE cv.id = $1 AND cv.workspace_id = $2`, [conversationId, workspaceId]);
  if (!cv) throw new Error('no such conversation');
  const lines = cv.transcript ?? [];
  const isTest = cv.channel === 'test';

  const store = async (rec: AnalysisRecord, extra?: (c: pg.PoolClient) => Promise<void>) => {
    await tx(pool, async c => {
      await c.query(`UPDATE conversation SET analysis = $3, status = 'done' WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId, rec]);
      if (extra) await extra(c);
    });
    if (!isTest) await evaluateMonitors(pool, workspaceId);
    return rec;
  };

  if (!lines.some(l => l.speaker === 'caller')) return store({ status: 'skipped', reason: 'no caller speech to analyse', reasonCode: cv.reason_code ?? undefined });
  if (!llmConfigured('analysis')) return store({ status: 'not_configured', reason: 'no model is configured for analysis', reasonCode: cv.reason_code ?? undefined });

  await pool.query(`UPDATE conversation SET status = 'processing' WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId]);
  const judge = cv.def_id ? await one<{ id: string; model: string; config: { instructions?: string } }>(pool,
    `SELECT id, model, config FROM judge_version WHERE workspace_id = $1 AND outcome_definition_id = $2 ORDER BY number DESC LIMIT 1`, [workspaceId, cv.def_id]) : null;

  const system = [
    'You classify one phone call between an AI agent and a person. You never grade; you report what was said.',
    'Reply with one JSON object: {"points":[{"claim":string,"quote":string}],"moments":[{"kind":string,"quote":string,"note":string}],',
    '"reasonCode":string|null,"outcome":{"value":string,"quote":string}|null}.',
    'Every quote must be copied exactly, character for character, from ONE transcript line (without the speaker label). Claims without such a quote are discarded.',
    `moment kinds: ${MOMENT_KINDS.join(', ')}.`,
    `reasonCode: one of ${CONVERSATION_CODES.join(', ')}, or null if unsure. Meanings: ${REASON_CODES.filter(r => r.stage === 'conversation').map(r => `${r.code} = ${r.label}`).join('; ')}.`,
    cv.def_id ? `outcome: answer "${cv.def_question}" with one of ${JSON.stringify(cv.allowed_values)}, or null when the call does not show it.` : 'outcome: always null.',
    judge?.config?.instructions ? `Client instructions for the outcome: ${judge.config.instructions}` : '',
  ].filter(Boolean).join('\n');
  const user = lines.map(l => `${l.speaker === 'agent' ? 'AGENT' : 'PERSON'}: ${l.text}`).join('\n');

  let reply;
  try {
    reply = await complete({ purpose: 'analysis', json: true, temperature: 0, maxTokens: 1200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
  } catch (e) {
    return store({ status: 'failed', reason: e instanceof LlmError ? e.message : 'the analysis model failed', reasonCode: cv.reason_code ?? undefined });
  }

  let parsed: any;
  try { parsed = JSON.parse(reply.text); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object') return store({ status: 'failed', reason: 'the analysis model did not return JSON', reasonCode: cv.reason_code ?? undefined, model: reply.model });

  let proposed = 0, dropped = 0;
  const check = (q: unknown) => { proposed++; const l = findQuote(lines, q); if (!l) dropped++; return l; };

  const points: NonNullable<AnalysisRecord['points']> = [];
  for (const p of Array.isArray(parsed.points) ? parsed.points.slice(0, 12) : []) {
    const l = check(p?.quote);
    if (l && typeof p.claim === 'string' && p.claim.trim()) points.push({ claim: p.claim.trim().slice(0, 300), quote: String(p.quote).trim(), startMs: l.startMs, speaker: l.speaker });
  }
  const moments: { kind: string; quote: string; note: string; atMs: number }[] = [];
  for (const m of Array.isArray(parsed.moments) ? parsed.moments.slice(0, 20) : []) {
    const l = check(m?.quote);
    if (l && MOMENT_KINDS.includes(m.kind)) moments.push({ kind: m.kind, quote: String(m.quote).trim(), note: typeof m.note === 'string' ? m.note.slice(0, 300) : '', atMs: l.startMs });
  }
  let outcomeGuess: AnalysisRecord['outcomeGuess'] = null;
  if (parsed.outcome && typeof parsed.outcome === 'object') {
    const l = check(parsed.outcome.quote);
    if (l && cv.allowed_values?.includes(parsed.outcome.value)) outcomeGuess = { value: parsed.outcome.value, quote: String(parsed.outcome.quote).trim() };
  }

  // The model may only refine a reason the engine could not know, and only with a conversation code.
  const modelCode = typeof parsed.reasonCode === 'string' && CONVERSATION_CODES.includes(parsed.reasonCode) ? parsed.reasonCode : null;
  let reasonCode = cv.reason_code ?? 'CONV_INCOMPLETE';
  if (modelCode && REFINABLE.has(reasonCode) && !(reasonCode === 'END_HUNG_UP_MID' && (cv.duration_s ?? 0) < EARLY_HANGUP_S)) reasonCode = modelCode;

  const rec: AnalysisRecord = {
    status: 'done', summary: points.map(p => p.claim).join(' '), points,
    quotes: points.map(p => ({ text: p.quote, startMs: p.startMs, speaker: p.speaker })),
    quotesProposed: proposed, quotesDropped: dropped, reasonCode, modelReasonCode: modelCode, outcomeGuess,
    judgeVersionId: judge?.id ?? null, model: reply.model,
  };

  return store(rec, async c => {
    await c.query('UPDATE conversation SET reason_code = $3 WHERE id = $1 AND workspace_id = $2', [conversationId, workspaceId, reasonCode]);
    if (dropped) await c.query(`UPDATE conversation SET flagged = true, flags = ARRAY(SELECT DISTINCT unnest(flags || '{quotes_dropped}'::text[]) ORDER BY 1) WHERE id = $1`, [conversationId]);
    await c.query(`DELETE FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 AND source = 'analysis'`, [conversationId, workspaceId]);
    for (const m of moments) {
      await c.query(`INSERT INTO call_moment (workspace_id, conversation_id, source, kind, at_ms, note, quote) VALUES ($1,$2,'analysis',$3,$4,$5,$6)`,
        [workspaceId, conversationId, m.kind, m.atMs, m.note, m.quote]);
    }
    // The model's token use is a cost line; nothing here guesses a price, so inr_milli is 0 until the money module rates it.
    await c.query(`INSERT INTO cost_line (workspace_id, conversation_id, component, provider, quantity, unit, inr_milli, detail) VALUES ($1,$2,'analysis',$3,$4,'token',0,$5)`,
      [workspaceId, conversationId, reply.provider, reply.usage.inputTokens + reply.usage.outputTokens, { ...reply.usage, model: reply.model, priced: false }]);
    if (outcomeGuess && !isTest && cv.def_id) {
      await c.query(`DELETE FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 AND grade = 'ai_guess'`, [conversationId, workspaceId]);
      await c.query(`INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence, judge_version_id)
        VALUES ($1,$2,$3,$4,$5,'ai_guess',$6,$7,$8)`,
        [workspaceId, conversationId, cv.contact_id, cv.def_id, outcomeGuess.value, judge ? `judge:${judge.id}` : 'analysis', { quote: outcomeGuess.quote }, judge?.id ?? null]);
      await c.query(`UPDATE conversation SET outcome = coalesce((SELECT value FROM outcome WHERE conversation_id = $1 AND workspace_id = $2
          ORDER BY CASE grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, created_at DESC LIMIT 1), outcome) WHERE id = $1`, [conversationId, workspaceId]);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------
// Monitors: a signal over the last N non-test calls; crossing the threshold opens one issue with evidence calls.

export type Signal = 'early_hangup_rate' | 'tool_failure_rate' | 'safety_event_rate' | 'opt_out_rate' | 'engine_error_rate' | 'quotes_dropped_rate';
export const SIGNALS: readonly Signal[] = ['early_hangup_rate', 'tool_failure_rate', 'safety_event_rate', 'opt_out_rate', 'engine_error_rate', 'quotes_dropped_rate'];

export interface MonitorConfig { signal: Signal; threshold: number; windowCalls: number; minCalls: number; severity: 'critical' | 'warning' | 'info'; category: string }

export const DEFAULT_MONITORS: { name: string; config: MonitorConfig }[] = [
  { name: 'Early hang-ups', config: { signal: 'early_hangup_rate', threshold: 0.35, windowCalls: 50, minCalls: 20, severity: 'warning', category: 'Conversation' } },
  { name: 'Tool failures', config: { signal: 'tool_failure_rate', threshold: 0.05, windowCalls: 50, minCalls: 10, severity: 'critical', category: 'Integration' } },
  { name: 'Safety interventions', config: { signal: 'safety_event_rate', threshold: 0.1, windowCalls: 50, minCalls: 10, severity: 'warning', category: 'Safety' } },
  { name: 'Opt-out spike', config: { signal: 'opt_out_rate', threshold: 0.1, windowCalls: 50, minCalls: 20, severity: 'warning', category: 'Compliance' } },
  { name: 'Engine errors', config: { signal: 'engine_error_rate', threshold: 0.03, windowCalls: 50, minCalls: 10, severity: 'critical', category: 'Telephony' } },
  { name: 'Unverifiable quotes', config: { signal: 'quotes_dropped_rate', threshold: 0.2, windowCalls: 50, minCalls: 10, severity: 'info', category: 'Analysis' } },
];

const SIGNAL_SQL: Record<Signal, string> = {
  early_hangup_rate: `cv.reason_code = 'END_EARLY_HANGUP'`,
  tool_failure_rate: `'tool_failed' = ANY(cv.flags)`,
  safety_event_rate: `'safety' = ANY(cv.flags)`,
  opt_out_rate: `'opt_out' = ANY(cv.flags)`,
  engine_error_rate: `cv.end_reason = 'error'`,
  quotes_dropped_rate: `'quotes_dropped' = ANY(cv.flags)`,
};

/** Seed the default monitors once per workspace. Call inside a transaction (the lock is transaction-scoped). */
export async function ensureDefaultMonitors(q: Queryable, workspaceId: string): Promise<void> {
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['calls-monitors:' + workspaceId]);
  const n = await one<{ n: string }>(q, 'SELECT count(*)::text AS n FROM monitor WHERE workspace_id = $1', [workspaceId]);
  if (Number(n!.n) > 0) return;
  for (const m of DEFAULT_MONITORS) await q.query('INSERT INTO monitor (workspace_id, name, config) VALUES ($1,$2,$3)', [workspaceId, m.name, m.config]);
}

export async function evaluateMonitors(pool: pg.Pool, workspaceId: string): Promise<{ opened: string[] }> {
  return tx(pool, async c => {
    await ensureDefaultMonitors(c, workspaceId);
    const mons = await many<{ id: string; name: string; config: MonitorConfig }>(c, 'SELECT id, name, config FROM monitor WHERE workspace_id = $1 AND enabled ORDER BY name', [workspaceId]);
    const opened: string[] = [];
    for (const m of mons) {
      const cond = SIGNAL_SQL[m.config.signal];
      if (!cond) continue;
      const win = Math.max(1, Math.min(1000, Math.floor(m.config.windowCalls)));
      const r = await one<{ n: string; hit: string; evidence: string[] | null }>(c,
        `WITH w AS (SELECT cv.id, (${cond}) AS hit FROM conversation cv
                    WHERE cv.workspace_id = $1 AND cv.channel <> 'test' AND cv.status IN ('ended','processing','done')
                    ORDER BY cv.ended_at DESC NULLS LAST LIMIT $2)
         SELECT count(*)::text AS n, count(*) FILTER (WHERE hit)::text AS hit, (array_agg(id) FILTER (WHERE hit))[1:10]::text[] AS evidence FROM w`, [workspaceId, win]);
      await c.query('UPDATE monitor SET last_read_at = now() WHERE id = $1', [m.id]);
      const n = Number(r!.n), hit = Number(r!.hit);
      if (n < m.config.minCalls || hit / n <= m.config.threshold) continue;
      const open = await one(c, `SELECT 1 FROM issue WHERE workspace_id = $1 AND monitor_id = $2 AND status <> 'resolved'`, [workspaceId, m.id]);
      if (open) continue;
      const row = await one<{ id: string }>(c,
        `INSERT INTO issue (workspace_id, category, severity, subject_type, detail, monitor_id) VALUES ($1,$2,$3,'monitor',$4,$5) RETURNING id`,
        [workspaceId, m.config.category, m.config.severity,
          { monitor: m.name, signal: m.config.signal, value: hit / n, threshold: m.config.threshold, calls: n, hits: hit, evidenceCalls: r!.evidence ?? [] }, m.id]);
      opened.push(row!.id);
    }
    return { opened };
  });
}
