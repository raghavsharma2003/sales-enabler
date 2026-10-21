// Cross-call insight: one bounded LLM pass over a scope's recent analysed calls (a workspace, an agent or a campaign)
// that names themes: top objections, why people dropped off, questions she could not answer, and what preceded a
// reached goal. The same law as per-call analysis: a model never invents evidence. Every quote a theme keeps is an
// exact substring of one line of THAT call's stored transcript (caller lines only for objections and unanswered
// questions; goal-reaching calls only for success drivers). A theme with fewer than two verified quotes is dropped, and
// a theme's count is the number of distinct sampled calls it was really seen in, not a number the model wrote.
// Bounded: a sample cap, a character budget for the model's input, a completion cap, and no run when nothing is newer
// than the last insight. Test calls never enter. The model's tokens are a cost line, like the analysis lines.
import type pg from 'pg';
import { many, one, tx, type Queryable } from '../../db.ts';
import { complete, llmConfigured, LlmError } from '../../llm.ts';
import { findQuote } from './analysis.ts';

export const THEME_KINDS = ['objection', 'drop_off', 'unanswered_question', 'success_driver'] as const;
export type ThemeKind = (typeof THEME_KINDS)[number];

export const INSIGHT_DEFAULTS = {
  sampleCalls: 40,          // at most this many recent calls per run
  inputTokens: 12_000,      // character budget for the model's input is 4x this
  outputTokens: 1_500,      // completion cap
  windowDays: 30,           // calls older than this are not considered
  quotesPerTheme: 3,
  minQuotes: 2,
};

export type Scope = { type: 'workspace'; id: null } | { type: 'agent'; id: string } | { type: 'campaign'; id: string };

type Line = { speaker: 'agent' | 'caller'; text: string; startMs: number };
interface SampledCall { id: string; label: string; ended_at: Date; transcript: Line[]; reason_code: string | null; outcome: string | null; goal: boolean }

export interface Theme {
  kind: ThemeKind; title: string;
  count: number;                          // distinct sampled calls the theme was seen in (labels the model cited that exist)
  of: number;                             // calls sampled
  quotes: { conversationId: string; text: string; speaker: 'agent' | 'caller'; startMs: number }[];
}

export interface InsightResult {
  status: 'done' | 'failed';
  themes: Theme[];
  callsSampled: number; callsInScope: number; newestCallAt: Date | null;
  quotesProposed: number; quotesDropped: number; themesDropped: number;
  reason?: string;
  model?: string; provider?: string; usage?: { inputTokens: number; outputTokens: number };
}

export type Computed = { ran: false; reason: string; status: 'skipped' | 'not_configured' | 'no_calls' } | { ran: true; result: InsightResult };

/** The grounding check, separate so a test can prove what it stops. Returns only themes whose evidence is real. */
export function groundThemes(raw: unknown, calls: SampledCall[], o = INSIGHT_DEFAULTS):
  { themes: Theme[]; quotesProposed: number; quotesDropped: number; themesDropped: number } {
  const byLabel = new Map(calls.map(c => [c.label, c]));
  let quotesProposed = 0, quotesDropped = 0, themesDropped = 0;
  const themes: Theme[] = [];
  const list = Array.isArray((raw as { themes?: unknown })?.themes) ? (raw as { themes: unknown[] }).themes.slice(0, 12) : [];
  for (const t of list as Record<string, unknown>[]) {
    const kind = t?.kind as ThemeKind;
    const title = typeof t?.title === 'string' ? t.title.trim().slice(0, 120) : '';
    const quotes = Array.isArray(t?.quotes) ? (t.quotes as Record<string, unknown>[]).slice(0, 6) : [];
    quotesProposed += quotes.length;
    if (!THEME_KINDS.includes(kind) || !title) { quotesDropped += quotes.length; themesDropped++; continue; }
    const kept: Theme['quotes'] = [];
    for (const q of quotes) {
      const c = byLabel.get(String(q?.call ?? ''));
      const needCaller = kind === 'objection' || kind === 'unanswered_question';
      const line = c && (kind !== 'success_driver' || c.goal) ? findQuote(c.transcript, q?.text, needCaller ? 'caller' : undefined) : null;
      if (!c || !line || kept.length >= o.quotesPerTheme || kept.some(k => k.conversationId === c.id && k.text === String(q.text).trim())) { quotesDropped++; continue; }
      kept.push({ conversationId: c.id, text: String(q.text).trim(), speaker: line.speaker, startMs: line.startMs });
    }
    if (kept.length < o.minQuotes) { themesDropped++; quotesDropped += kept.length; continue; }   // its quotes go with it
    const seen = new Set<string>(kept.map(k => k.conversationId));
    for (const l of Array.isArray(t.calls) ? t.calls : []) {
      const c = byLabel.get(String(l));
      if (c && (kind !== 'success_driver' || c.goal)) seen.add(c.id);
    }
    themes.push({ kind, title, count: seen.size, of: calls.length, quotes: kept });
  }
  themes.sort((a, b) => b.count - a.count);
  return { themes, quotesProposed, quotesDropped, themesDropped };
}

const scopeSql = (s: Scope, p: number) => s.type === 'agent' ? `AND v.agent_id = $${p}` : s.type === 'campaign' ? `AND a.campaign_id = $${p}` : '';
const FROM = `FROM conversation cv
  LEFT JOIN agent_version v ON v.id = cv.agent_version_id
  LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
  LEFT JOIN campaign cp ON cp.id = a.campaign_id AND cp.workspace_id = cv.workspace_id
  LEFT JOIN outcome_definition d ON d.id = cp.outcome_definition_id AND d.workspace_id = cv.workspace_id
  WHERE cv.workspace_id = $1 AND cv.channel <> 'test' AND coalesce(cv.run_manifest->>'test', 'false') <> 'true'
    AND cv.status = 'done' AND cv.analysis->>'status' = 'done' AND cv.ended_at > now() - make_interval(days => $2)`;

export async function latestInsight(q: Queryable, ws: string, s: Scope) {
  return one<{ id: string; status: string; themes: Theme[]; calls_sampled: number; calls_in_scope: number; newest_call_at: Date | null;
    quotes_proposed: number; quotes_dropped: number; themes_dropped: number; detail: Record<string, unknown>; created_at: Date }>(q,
    `SELECT * FROM call_insight WHERE workspace_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3::uuid ORDER BY created_at DESC LIMIT 1`,
    [ws, s.type, s.id]);
}

/** Read the calls, ask the model once, ground the answer. No writes: the caller stores the result in its transaction. */
export async function computeInsight(pool: pg.Pool, ws: string, s: Scope,
  opts: { force?: boolean; caps?: Partial<typeof INSIGHT_DEFAULTS>; ground?: typeof groundThemes } = {}): Promise<Computed> {
  const o = { ...INSIGHT_DEFAULTS, ...opts.caps };
  const params: unknown[] = [ws, o.windowDays, ...(s.id ? [s.id] : [])];
  const total = await one<{ n: number; newest: Date | null }>(pool, `SELECT count(*)::int AS n, max(cv.ended_at) AS newest ${FROM} ${scopeSql(s, 3)}`, params);
  if (!total!.n) return { ran: false, status: 'no_calls', reason: 'no analysed calls in this scope yet' };
  const last = await latestInsight(pool, ws, s);
  if (!opts.force && last?.status === 'done' && last.newest_call_at && total!.newest && last.newest_call_at.getTime() >= total!.newest.getTime()) {
    return { ran: false, status: 'skipped', reason: 'no call has ended since the last insight' };
  }
  if (!llmConfigured('analysis')) return { ran: false, status: 'not_configured', reason: 'no model is configured for analysis' };

  const rows = await many<Omit<SampledCall, 'label'>>(pool,
    `SELECT cv.id, cv.ended_at, cv.transcript, cv.reason_code,
            (SELECT o.value FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id
               ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1) AS outcome,
            coalesce((SELECT o.value FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id
               ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1) = ANY(d.goal_values), false) AS goal
     ${FROM} ${scopeSql(s, 3)} ORDER BY cv.ended_at DESC LIMIT $${params.length + 1}`, [...params, o.sampleCalls]);

  // Fill the character budget newest first; a call that does not fit whole is left out (no half transcripts).
  const budget = o.inputTokens * 4;
  const calls: SampledCall[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const r of rows) {
    const label = `C${calls.length + 1}`;
    const block = [`### ${label} (reason: ${r.reason_code ?? 'unknown'}; outcome: ${r.outcome ?? 'none'}; goal reached: ${r.goal ? 'yes' : 'no'})`,
      ...(r.transcript ?? []).map(l => `${l.speaker === 'agent' ? 'AGENT' : 'PERSON'}: ${l.text}`)].join('\n');
    if (used + block.length > budget) { if (calls.length) break; else continue; }
    used += block.length;
    calls.push({ ...r, label });
    blocks.push(block);
  }
  const newestCallAt = total!.newest;
  if (!calls.length) return { ran: true, result: { status: 'failed', themes: [], callsSampled: 0, callsInScope: total!.n, newestCallAt, quotesProposed: 0, quotesDropped: 0, themesDropped: 0, reason: 'no call fits the input budget' } };

  const system = [
    'You find patterns across phone calls between an AI agent and people. You report what was said; you never grade.',
    'Reply with one JSON object: {"themes":[{"kind":string,"title":string,"calls":[string],"quotes":[{"call":string,"text":string}]}]}.',
    `kind is one of: objection (a reason the person gave for not going ahead), drop_off (what was happening when people left or lost`,
    'interest), unanswered_question (something the person asked that the agent could not answer), success_driver (what came just',
    'before a reached goal; use only calls marked "goal reached: yes").',
    'title: a short plain-English name for the theme. calls: the labels (C1, C2, ...) of every call where the theme appears.',
    `quotes: 2 or 3 per theme, each copied exactly, character for character, from ONE line of the named call (without the speaker label).`,
    'For objection and unanswered_question, quote the PERSON. Themes without such quotes are discarded. At most 8 themes, most common first.',
  ].join('\n');

  let reply;
  try {
    reply = await complete({ purpose: 'analysis', json: true, temperature: 0, maxTokens: o.outputTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: blocks.join('\n\n') }] });
  } catch (e) {
    return { ran: true, result: { status: 'failed', themes: [], callsSampled: calls.length, callsInScope: total!.n, newestCallAt, quotesProposed: 0, quotesDropped: 0, themesDropped: 0,
      reason: e instanceof LlmError ? e.message : 'the analysis model failed' } };
  }
  let parsed: unknown = null;
  try { parsed = JSON.parse(reply.text); } catch { /* handled below */ }
  const base = { callsSampled: calls.length, callsInScope: total!.n, newestCallAt, model: reply.model, provider: reply.provider, usage: reply.usage };
  if (!parsed || typeof parsed !== 'object') return { ran: true, result: { ...base, status: 'failed', themes: [], quotesProposed: 0, quotesDropped: 0, themesDropped: 0, reason: 'the model did not return JSON' } };
  const g = (opts.ground ?? groundThemes)(parsed, calls, o);
  return { ran: true, result: { ...base, status: 'done', ...g } };
}

/** Store a computed insight and its cost line. Call inside a transaction. */
export async function storeInsight(q: Queryable, ws: string, s: Scope, r: InsightResult, caps: Partial<typeof INSIGHT_DEFAULTS> = {}): Promise<string> {
  const row = await one<{ id: string }>(q,
    `INSERT INTO call_insight (workspace_id, scope_type, scope_id, status, themes, calls_sampled, calls_in_scope, newest_call_at, quotes_proposed, quotes_dropped, themes_dropped, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [ws, s.type, s.id, r.status, JSON.stringify(r.themes), r.callsSampled, r.callsInScope, r.newestCallAt, r.quotesProposed, r.quotesDropped, r.themesDropped,
      { reason: r.reason ?? null, model: r.model ?? null, usage: r.usage ?? null, caps: { ...INSIGHT_DEFAULTS, ...caps } }]);
  if (r.usage) {
    // Nothing here guesses a price (priced:false), as with every analysis line; the money module rates it.
    await q.query(`INSERT INTO cost_line (workspace_id, component, provider, quantity, unit, inr_milli, detail) VALUES ($1,'analysis',$2,$3,'token',0,$4)`,
      [ws, r.provider ?? 'unknown', r.usage.inputTokens + r.usage.outputTokens, { ...r.usage, purpose: 'insight', scopeType: s.type, scopeId: s.id, insightId: row!.id, priced: false }]);
  }
  return row!.id;
}

/** What the Insights page and the Operator read. */
export function presentInsight(s: Scope, row: Awaited<ReturnType<typeof latestInsight>>) {
  if (!row) return { scope: s, status: 'none' as const, note: 'No insight yet. It is built nightly, or on request, from analysed calls (test calls never count).' };
  return {
    scope: s, status: row.status, generatedAt: row.created_at, themes: row.themes,
    callsSampled: row.calls_sampled, callsInScope: row.calls_in_scope, newestCallAt: row.newest_call_at,
    quotesDropped: row.quotes_dropped, themesDropped: row.themes_dropped,
    reason: (row.detail?.reason as string | null) ?? null,
    note: `Seen across ${row.calls_sampled} of ${row.calls_in_scope} recent calls. Observed, not causal. Every quote is word for word from a call.`,
  };
}

/** Nightly: the workspace scope plus each agent and campaign with calls in the window, bounded per run. */
export async function runNightlyInsights(pool: pg.Pool, opts: { workspaceId?: string; maxWorkspaces?: number; maxScopesPerWorkspace?: number } = {}): Promise<{ built: number; skipped: number }> {
  const wss = await many<{ workspace_id: string }>(pool,
    `SELECT DISTINCT workspace_id FROM conversation WHERE status = 'done' AND channel <> 'test' AND ended_at > now() - interval '7 days'
       AND ($1::uuid IS NULL OR workspace_id = $1::uuid) LIMIT $2`, [opts.workspaceId ?? null, opts.maxWorkspaces ?? 100]);
  let built = 0, skipped = 0;
  for (const { workspace_id: ws } of wss) {
    const scoped = await many<{ type: 'agent' | 'campaign'; id: string }>(pool,
      `(SELECT DISTINCT 'agent' AS type, v.agent_id AS id FROM conversation cv JOIN agent_version v ON v.id = cv.agent_version_id
         WHERE cv.workspace_id = $1 AND cv.status = 'done' AND cv.channel <> 'test' AND cv.ended_at > now() - interval '7 days')
       UNION ALL
       (SELECT DISTINCT 'campaign', a.campaign_id FROM conversation cv JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
         WHERE cv.workspace_id = $1 AND cv.status = 'done' AND cv.channel <> 'test' AND a.campaign_id IS NOT NULL AND cv.ended_at > now() - interval '7 days')
       LIMIT $2`, [ws, opts.maxScopesPerWorkspace ?? 10]);
    const scopes: Scope[] = [{ type: 'workspace', id: null }, ...scoped.map(x => ({ type: x.type, id: x.id }) as Scope)];
    for (const s of scopes) {
      try {
        const c = await computeInsight(pool, ws, s);
        if (!c.ran) { skipped++; continue; }
        await tx(pool, q => storeInsight(q, ws, s, c.result));
        built++;
      } catch (e) { console.error('[vp] calls insight', ws, s.type, e instanceof Error ? e.message : e); }
    }
  }
  return { built, skipped };
}
