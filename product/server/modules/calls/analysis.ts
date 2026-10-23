// The post-call pass. Code first, model second: the reason code for anything the engine knows was set at
// ingest; one LLM pass (purpose 'analysis', JSON out) then classifies — points with quotes, moments, a
// refined business reason for a normally-ended call, and an outcome guess — and code checks every quote.
// A quote that is not an exact substring of a stored transcript line is dropped and counted; a point, moment
// or outcome whose quote was dropped goes with it. The model never grades: its outcome is an 'ai_guess', and
// only a verified key or a person upgrades it. Test calls are analysed for the builder but write no outcome
// and are never evaluated by monitors.
import type pg from 'pg';
import { many, one, tx, type Queryable } from '../../db.ts';
import type { Registry } from '../../tools.ts';
import { afterCall } from './followups.ts';
import { syncGoalReason } from './goal.ts';
import { judgeCallerCrisis, type CrisisJudgeCtx } from '../../../shared/safety/judge.ts';
import { complete, llmConfigured, LlmError, type LlmReply } from '../../llm.ts';
import { CONVERSATION_CODES, REASON_CODES, REFINABLE, EARLY_HANGUP_S } from './taxonomy.ts';

/** Codes the model may name: conversation codes only (CONV_*). END_* codes are the engine's (hang-up, hand-off, crisis, opt-out). */
export const MODEL_CODES = CONVERSATION_CODES.filter(c => c.startsWith('CONV_'));

type Ok = { reply: LlmReply; model: string; points: NonNullable<AnalysisRecord['points']>; moments: { kind: string; quote: string; note: string; atMs: number }[];
  outcomeGuess: AnalysisRecord['outcomeGuess']; outcomeUnclear: AnalysisRecord['outcomeUnclear']; outcomeTurn: number; outcomeConfidence: number | null;
  forgetRequested: AnalysisRecord['forgetRequested']; modelCode: string | null; proposed: number; dropped: number };
type Pass = Ok | { error: string; model?: string; reply?: LlmReply };

/** The analysis contract, written as shapes (fields, allowed values, one rule per line), not as prose to recite. */
export function analysisPrompt(o: { question: string | null; values: string[]; instructions?: string }): string {
  const codes = REASON_CODES.filter(r => MODEL_CODES.includes(r.code));
  return [
    'TASK: classify one phone call between an AI agent (AGENT) and a person (PERSON). Report what was said. Never grade.',
    'OUTPUT: one JSON object:',
    '{"points":[{"claim":string,"quote":string}],"moments":[{"kind":KIND,"quote":string,"note":string}],"reasonCode":CODE|null,',
    ' "outcome":{"value":VALUE,"quote":string,"confidence":number}|null,"forget":{"quote":string}|null}',
    'QUOTE: copied character for character from ONE transcript line, without the speaker label. Anything without such a quote is discarded.',
    'KIND (one entry per line that shows it):',
    '- commitment: PERSON agrees to do something (pay, come, confirm, buy, renew, fill, send). Every agreeing PERSON line is a commitment.',
    '- objection: PERSON gives a reason against, or a complaint',
    '- question: PERSON asks something',
    '- opt_out: PERSON asks not to be called again',
    '- callback_request: PERSON asks to be called at another time',
    '- confusion: PERSON does not understand or cannot follow the language',
    '- laughter: PERSON laughs',
    `CODE (or null): ${codes.map(r => `${r.code} = ${r.label}`).join('; ')}`,
    ...(o.question ? [
      `OUTCOME: question "${o.question}"; VALUE one of ${JSON.stringify(o.values)}`,
      '- decided by the PERSON\'s words; quote the PERSON line that decides it',
      '- decided only when the PERSON takes a stance on the question: agreeing, refusing, asking to stop calls, asking for a human about it, "not the right person", "call later". Each decides it when a VALUE fits',
      '- null when the PERSON never took a stance: they could not follow the language, hung up before the question, or spoke of distress or crisis (distress is not a request for a human)',
      '- confidence: 0..1, how clearly that line decides it',
    ] : ['OUTCOME: always null.']),
    ...(o.instructions ? [`OUTCOME, client rule: ${o.instructions}`] : []),
    'FORGET: PERSON asks the business to forget or delete what it knows about them: quote that line. Otherwise null.',
  ].join('\n');
}

// ---- which model analyses this workspace's calls (call_analysis_setting) ------------------------------------------
export interface AnalysisSetting { mode: 'single' | 'tiered'; model?: string; escalateModel?: string; threshold: number }
/** Curated analysis model ids, set per deployment (VP_ANALYSIS_MODELS, comma-separated). No model is chosen in code: without a
 *  setting, analysis uses the deployment's VP_LLM_ANALYSIS_MODEL. */
export const curatedAnalysisModels = () => (process.env.VP_ANALYSIS_MODELS ?? '').split(',').map(s => s.trim()).filter(Boolean);
/** The product default (decision.2026-10-23.analysis-default-mini-single): one pass, gpt-4.1-mini, when the deployment curates
 *  it. VP_ANALYSIS_DEFAULT_MODEL overrides the id (a deployment may name it differently). When the default is not curated
 *  here, analysis uses the deployment's VP_LLM_ANALYSIS_MODEL. Tiered stays available per workspace, never the default. */
export const DEFAULT_ANALYSIS_MODEL = 'gpt-4.1-mini';
export function defaultAnalysisModel(): string | undefined {
  const id = process.env.VP_ANALYSIS_DEFAULT_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
  return curatedAnalysisModels().includes(id) ? id : undefined;
}
export async function analysisSetting(q: Queryable, ws: string): Promise<AnalysisSetting> {
  const r = await one<{ mode: 'single' | 'tiered'; model: string | null; escalate_model: string | null; threshold: string }>(q,
    'SELECT mode, model, escalate_model, threshold::text FROM call_analysis_setting WHERE workspace_id = $1', [ws]);
  return r ? { mode: r.mode, model: r.model ?? defaultAnalysisModel(), escalateModel: r.escalate_model ?? undefined, threshold: Number(r.threshold) }
    : { mode: 'single', model: defaultAnalysisModel(), threshold: 0.6 };
}

const MOMENT_KINDS = ['objection', 'question', 'commitment', 'opt_out', 'callback_request', 'confusion', 'laughter'] as const;

type Line = { speaker: 'agent' | 'caller'; text: string; startMs: number };

/** A quote counts only as an exact substring of one stored transcript line (no paraphrase, no stitching across turns). */
export function findQuote(lines: Line[], quote: unknown, speaker?: Line['speaker']): Line | null {
  if (typeof quote !== 'string') return null;
  const q = quote.trim();
  if (q.length < 3) return null;
  return lines.find(l => (!speaker || l.speaker === speaker) && l.text.includes(q)) ?? null;
}

/** Reason codes on which no outcome is recorded, with why (shown on the call as outcomeUnclear). */
export const NO_DECISION: ReadonlyMap<string, string> = new Map([
  ['END_CRISIS', 'the call turned to a crisis and the goal was suspended'],
  ['END_EARLY_HANGUP', 'the person hung up in the first seconds'],
  ['CONV_LANGUAGE_MISMATCH', 'the person could not follow the language'],
]);

// Post-call analysis is not latency-bound; the live door's judge budget (judge.json timeout_ms) is far tighter.
export const POST_CALL_JUDGE_TIMEOUT_MS = 5000;

export interface CrisisPass {
  raised: { index: number; kind: string; confidence: number }[];
  shadow: { index: number; kind: string; confidence: number }[];
  // The same model call's second label. Post-call these are recorded only: the live door owns the opt-out path.
  optOut: { raised: { index: number; confidence: number }[]; shadow: { index: number; confidence: number }[] };
  unavailable: number; calls: number; usage: { inputTokens: number; outputTokens: number };
}

/** Judge every caller line the floor did not flag, in order, with the previous caller line as context. This is
 *  judgeTranscriptCrisis's loop, kept here so calls also sees judge_unavailable and the usage of every call, hit or
 *  not (both are needed for the outage rate and for cost lines). The per-line rules (floor first, raise-only, skip when
 *  the floor fires, no keys means no call) stay in safety's judgeCallerCrisis. */
export async function crisisPass(lines: Line[], ctx: Omit<CrisisJudgeCtx, 'prev'> = {}): Promise<CrisisPass> {
  const out: CrisisPass = { raised: [], shadow: [], optOut: { raised: [], shadow: [] }, unavailable: 0, calls: 0, usage: { inputTokens: 0, outputTokens: 0 } };
  let prev = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].speaker !== 'caller') continue;
    const r = await judgeCallerCrisis(lines[i].text, { timeoutMs: POST_CALL_JUDGE_TIMEOUT_MS, ...ctx, prev });
    prev = lines[i].text;
    if (!r.called) continue;
    out.calls++;
    if (r.usage) { out.usage.inputTokens += r.usage.inputTokens; out.usage.outputTokens += r.usage.outputTokens; }
    const ev = r.event;
    if (ev?.type === 'judge_unavailable') out.unavailable++;
    else if (ev?.type === 'judge_raised') out.raised.push({ index: i, kind: ev.kind, confidence: ev.confidence });
    else if (ev?.type === 'judge_shadow') out.shadow.push({ index: i, kind: ev.kind, confidence: ev.confidence });
    const o = r.optOutEvent;
    if (o) (o.type === 'judge_raised' ? out.optOut.raised : out.optOut.shadow).push({ index: i, confidence: o.confidence });
  }
  return out;
}

/** Tests: pass judge options (e.g. assumeConfigured with setFakeLlm). Production leaves it unset. */
let judgeOpts: Omit<CrisisJudgeCtx, 'prev'> = {};
export function setCrisisJudgeOptions(o: Omit<CrisisJudgeCtx, 'prev'>): void { judgeOpts = o; }

const inflight = new Set<Promise<void>>();

/** Run the analysis in the background after the ingest transaction commits. */
export function queueAnalysis(pool: pg.Pool, workspaceId: string, conversationId: string, registry?: Registry): void {
  const p: Promise<void> = analyse(pool, workspaceId, conversationId, registry)
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
  // An outcome the model proposed but the person never evidenced (no caller line holds its quote): not recorded.
  outcomeUnclear?: { value: string; reason: string } | null;
  outcomeConfidence?: number | null;          // the model's own 0..1 for its outcome; used only to decide escalation
  // Tiered analysis: whether a second, stronger model ran and why. null when the workspace runs one model.
  tier?: { escalated: boolean; why: string | null; firstModel: string | null; secondModel: string | null; secondFailed: boolean } | null;
  judgeVersionId?: string | null;
  // Read by learning: any reply-door intervention on the call, and the judge's guess with its calibration status.
  safety_violation?: boolean;
  judge?: { judgeVersionId: string | null; value: string; quote: string; calibration: string } | null;
  forgetRequested?: { quote: string } | null;
  // The post-call caller-crisis judge (shared/safety/judge.ts). Shadow hits are recorded here ONLY: they are never a
  // call_safety_event, a flag, safety_violation or a monitor input. Raise hits become RD3 'flagged' safety events.
  judge_shadow?: { index: number; kind: string; confidence: number }[];
  judge_raised?: { index: number; kind: string; confidence: number }[];
  judge_unavailable?: number;
  judge_calls?: number;
  // One story for the caller-crisis judge: live (runtime 'judge' events) plus post-call. Not 'judge', which is the
  // outcome judge's guess that learning reads.
  crisis_judge?: { shadow: number; raised: number; unavailable: number;
    runtime: { shadow: number; raised: number; unavailable: number }; postCall: { shadow: number; raised: number; unavailable: number } };
  // The same story for the judge's opt-out label. Counts only: a shadow opt-out never suppresses, flags or monitors; a live
  // raise suppresses through its own 'moment' opt_out; a post-call raise is recorded, never acted on after the call.
  opt_out_judge?: { shadow: number; raised: number; runtime: { shadow: number; raised: number }; postCall: { shadow: number; raised: number } };
  followups?: Record<string, string>;
  model?: string;
  reason?: string;
}

/** The outcome value that counts (conversation.outcome, which learning reads): verified, then a person's label, then an
 *  AI guess only when the judge that made it is trusted by its latest calibration. An untrusted guess stays visible on
 *  the call with its grade, but never feeds experiments or the north star (blueprint F4). */
export async function refreshOutcome(q: Queryable, workspaceId: string, conversationId: string): Promise<void> {
  await q.query(`UPDATE conversation SET outcome = (SELECT o.value FROM outcome o WHERE o.conversation_id = $1 AND o.workspace_id = $2
      AND (o.grade IN ('verified','manager') OR (o.grade = 'ai_guess' AND o.judge_version_id IS NOT NULL AND
           (SELECT k.status FROM calibration k WHERE k.judge_version_id = o.judge_version_id ORDER BY k.created_at DESC LIMIT 1) = 'trusted'))
      ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1)
    WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId]);
  await syncGoalReason(q, workspaceId, conversationId);   // one definition of "goal reached": the reason code follows the outcome
}

export async function analyse(pool: pg.Pool, workspaceId: string, conversationId: string, registry?: Registry): Promise<AnalysisRecord> {
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

  // The crisis judge reads what the caller said, whatever the analysis model does (it has its own purpose and keys).
  const crisis = lines.some(l => l.speaker === 'caller') ? await crisisPass(lines, judgeOpts) : null;

  const store = async (rec: AnalysisRecord, extra?: (c: pg.PoolClient) => Promise<void>) => {
    if (crisis) {
      rec.judge_shadow = crisis.shadow; rec.judge_raised = crisis.raised; rec.judge_unavailable = crisis.unavailable; rec.judge_calls = crisis.calls;
      if (crisis.raised.length || crisis.calls) await tx(pool, async c => {
        // Raise only: an RD3 'flagged' safety event per raised line. The detail never carries the caller's words.
        for (const h of crisis.raised) {
          await c.query(`INSERT INTO call_safety_event (workspace_id, conversation_id, seq, rule, action, detail, at) VALUES ($1,$2,$3,'RD3','flagged',$4,now())`,
            [workspaceId, conversationId, -1 - h.index, `judge_raised kind=${h.kind} confidence=${h.confidence}`]);
        }
        if (crisis.raised.length) await c.query(`UPDATE conversation SET flagged = true, flags = ARRAY(SELECT DISTINCT unnest(flags || '{safety}'::text[]) ORDER BY 1) WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId]);
        // Every judge call costs; nothing here guesses a price (priced:false), as with the analysis line.
        if (crisis.calls) await c.query(`INSERT INTO cost_line (workspace_id, conversation_id, component, provider, quantity, unit, inr_milli, detail) VALUES ($1,$2,'analysis','safety_judge',$3,'token',0,$4)`,
          [workspaceId, conversationId, crisis.usage.inputTokens + crisis.usage.outputTokens, { ...crisis.usage, purpose: 'safety_judge', calls: crisis.calls, priced: false }]);
      });
    }
    const byLabel = await many<{ label: string; shadow: number; raised: number; unavailable: number }>(pool,
      `SELECT label, count(*) FILTER (WHERE outcome = 'shadow')::int AS shadow, count(*) FILTER (WHERE outcome = 'raised')::int AS raised,
              count(*) FILTER (WHERE outcome = 'unavailable')::int AS unavailable FROM call_judge_event WHERE conversation_id = $1 AND workspace_id = $2 GROUP BY label`, [conversationId, workspaceId]);
    const count = (label: string) => byLabel.find(r => r.label === label) ?? { shadow: 0, raised: 0, unavailable: 0 };
    const live = count('crisis'), liveOpt = count('opt_out');
    const post = { shadow: crisis?.shadow.length ?? 0, raised: crisis?.raised.length ?? 0, unavailable: crisis?.unavailable ?? 0 };
    rec.crisis_judge = { shadow: live.shadow + post.shadow, raised: live.raised + post.raised, unavailable: live.unavailable + post.unavailable,
      runtime: { shadow: live.shadow, raised: live.raised, unavailable: live.unavailable }, postCall: post };
    const postOpt = { shadow: crisis?.optOut.shadow.length ?? 0, raised: crisis?.optOut.raised.length ?? 0 };
    rec.opt_out_judge = { shadow: liveOpt.shadow + postOpt.shadow, raised: liveOpt.raised + postOpt.raised,
      runtime: { shadow: liveOpt.shadow, raised: liveOpt.raised }, postCall: postOpt };
    const safety = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM call_safety_event WHERE conversation_id = $1 AND workspace_id = $2', [conversationId, workspaceId]);
    rec.safety_violation = safety!.n > 0;
    rec.judge ??= null;
    await tx(pool, async c => {
      await c.query(`UPDATE conversation SET analysis = $3, status = 'done' WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId, rec]);
      if (extra) await extra(c);
    });
    if (!isTest) {
      await evaluateMonitors(pool, workspaceId);
      if (registry) {
        const followups = await afterCall(pool, registry, workspaceId, conversationId);
        rec.followups = followups;
        await pool.query(`UPDATE conversation SET analysis = jsonb_set(analysis, '{followups}', $3::jsonb) WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId, JSON.stringify(followups)]);
      }
    }
    return rec;
  };

  if (!lines.some(l => l.speaker === 'caller')) return store({ status: 'skipped', reason: 'no caller speech to analyse', reasonCode: cv.reason_code ?? undefined });
  if (!llmConfigured('analysis')) return store({ status: 'not_configured', reason: 'no model is configured for analysis', reasonCode: cv.reason_code ?? undefined });

  await pool.query(`UPDATE conversation SET status = 'processing' WHERE id = $1 AND workspace_id = $2`, [conversationId, workspaceId]);
  const judge = cv.def_id ? await one<{ id: string; model: string; config: { instructions?: string } }>(pool,
    `SELECT id, model, config FROM judge_version WHERE workspace_id = $1 AND outcome_definition_id = $2 ORDER BY number DESC LIMIT 1`, [workspaceId, cv.def_id]) : null;

  const setting = await analysisSetting(pool, workspaceId);
  const system = analysisPrompt({ question: cv.def_id ? cv.def_question : null, values: cv.allowed_values ?? [], instructions: judge?.config?.instructions });
  const user = lines.map(l => `${l.speaker === 'agent' ? 'AGENT' : 'PERSON'}: ${l.text}`).join('\n');
  const callerSpoke = lines.some(l => l.speaker === 'caller');

  // One pass: a model call, then code grounds everything it said. Run once, or twice when the workspace is tiered.
  const runPass = async (model: string | undefined): Promise<Pass> => {
    let reply: LlmReply;
    try {
      reply = await complete({ purpose: 'analysis', model, json: true, temperature: 0, maxTokens: 1200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    } catch (e) {
      return { error: e instanceof LlmError ? e.message : 'the analysis model failed', model };
    }
    let parsed: any;
    try { parsed = JSON.parse(reply.text); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object') return { error: 'the analysis model did not return JSON', model: reply.model, reply };

    let proposed = 0, dropped = 0;
    const check = (q: unknown) => { proposed++; const l = findQuote(lines, q); if (!l) dropped++; return l; };
    const points: NonNullable<AnalysisRecord['points']> = [];
    for (const p of Array.isArray(parsed.points) ? parsed.points.slice(0, 12) : []) {
      const l = check(p?.quote);
      if (l && typeof p.claim === 'string' && p.claim.trim()) points.push({ claim: p.claim.trim().slice(0, 300), quote: String(p.quote).trim(), startMs: l.startMs, speaker: l.speaker });
    }
    const moments: Ok['moments'] = [];
    for (const m of Array.isArray(parsed.moments) ? parsed.moments.slice(0, 20) : []) {
      const l = check(m?.quote);
      if (l && MOMENT_KINDS.includes(m.kind)) moments.push({ kind: m.kind, quote: String(m.quote).trim(), note: typeof m.note === 'string' ? m.note.slice(0, 300) : '', atMs: l.startMs });
    }
    // An outcome is what the PERSON said or did: its quote must be in a caller line (checked by the line's index in the
    // stored transcript). If the only match is the agent's own words, the outcome is unclear and is not recorded.
    let outcomeGuess: AnalysisRecord['outcomeGuess'] = null, outcomeUnclear: AnalysisRecord['outcomeUnclear'] = null, outcomeTurn = -1;
    let outcomeConfidence: number | null = null;
    if (parsed.outcome && typeof parsed.outcome === 'object' && cv.allowed_values?.includes(parsed.outcome.value)) {
      proposed++;
      const c = parsed.outcome.confidence;
      outcomeConfidence = typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1 ? c : null;
      const l = findQuote(lines, parsed.outcome.quote, 'caller');
      if (l) { outcomeGuess = { value: parsed.outcome.value, quote: String(parsed.outcome.quote).trim() }; outcomeTurn = lines.indexOf(l); }
      else {
        dropped++;
        outcomeUnclear = { value: parsed.outcome.value, reason: findQuote(lines, parsed.outcome.quote)
          ? "unclear: the only evidence is the agent's own words, not the person's"
          : 'unclear: the quoted evidence is not in the transcript' };
      }
    }
    let forgetRequested: AnalysisRecord['forgetRequested'] = null;
    if (parsed.forget && typeof parsed.forget === 'object') {
      const l = check(parsed.forget.quote);
      if (l && l.speaker === 'caller') forgetRequested = { quote: String(parsed.forget.quote).trim() };
    }
    // The model may only name a conversation code (CONV_*); codes the engine decides are never the model's to pick.
    const modelCode = typeof parsed.reasonCode === 'string' && MODEL_CODES.includes(parsed.reasonCode) ? parsed.reasonCode : null;
    return { reply, model: reply.model, points, moments, outcomeGuess, outcomeUnclear, outcomeTurn, outcomeConfidence, forgetRequested, modelCode, proposed, dropped };
  };

  const passes: Pass[] = [await runPass(setting.model)];
  let tier: AnalysisRecord['tier'] = null;
  // Never escalate a call whose reason the engine already decided (crisis, opt-out, early hang-up, hand-off, ...): there the
  // right answer is usually "no outcome", and a second model only finds one (rejected.2026-10-23.tiered-escalate-on-no-outcome).
  const engineDecided = !REFINABLE.has(cv.reason_code ?? 'CONV_INCOMPLETE');
  if (setting.mode === 'tiered' && setting.escalateModel && !engineDecided) {
    const first = passes[0];
    const why = 'error' in first ? 'the first pass failed'
      : cv.def_id && callerSpoke && !first.outcomeGuess ? 'no outcome'
      : first.outcomeConfidence !== null && first.outcomeConfidence < setting.threshold ? 'low confidence'
      : null;
    if (why) passes.push(await runPass(setting.escalateModel));
    tier = { escalated: Boolean(why), why, firstModel: passes[0].model ?? null, secondModel: passes[1]?.model ?? null,
      secondFailed: passes[1] ? 'error' in passes[1] : false };
  } else if (setting.mode === 'tiered' && setting.escalateModel) {
    tier = { escalated: false, why: 'the engine decided this call\'s reason; it is never escalated', firstModel: passes[0].model ?? null, secondModel: null, secondFailed: false };
  }
  // The pass that counts: the escalated one when it succeeded, else the first.
  const done = [...passes].reverse().find((x): x is Ok => !('error' in x));
  const costLines = async (c: pg.PoolClient) => {
    for (const [n, x] of passes.entries()) if (x.reply) {
      // The model's token use is a cost line; nothing here guesses a price, so inr_milli is 0 until the money module rates it.
      await c.query(`INSERT INTO cost_line (workspace_id, conversation_id, component, provider, quantity, unit, inr_milli, detail) VALUES ($1,$2,'analysis',$3,$4,'token',0,$5)`,
        [workspaceId, conversationId, x.reply.provider, x.reply.usage.inputTokens + x.reply.usage.outputTokens,
          { ...x.reply.usage, model: x.reply.model, priced: false, ...(passes.length > 1 ? { tier: n === 0 ? 'first' : 'escalated' } : {}) }]);
    }
  };
  if (!done) {
    const err = passes[passes.length - 1] as Extract<Pass, { error: string }>;
    return store({ status: 'failed', reason: err.error, reasonCode: cv.reason_code ?? undefined, model: err.model, tier }, costLines);
  }
  const { points, moments, outcomeTurn, outcomeConfidence, forgetRequested, modelCode, proposed, dropped } = done;
  let { outcomeGuess, outcomeUnclear } = done;
  const reply = done.reply;
  let reasonCode = cv.reason_code ?? 'CONV_INCOMPLETE';
  if (modelCode && REFINABLE.has(reasonCode) && !(reasonCode === 'END_HUNG_UP_MID' && (cv.duration_s ?? 0) < EARLY_HANGUP_S)) reasonCode = modelCode;
  // Calls on which the person cannot have decided anything get no outcome, whatever the model guessed: a crisis (the goal
  // was suspended), an early hang-up, a language they could not follow (rejected.2026-10-23.analysis-outcome-null-only-rule).
  if (outcomeGuess && NO_DECISION.has(reasonCode)) {
    outcomeUnclear = { value: outcomeGuess.value, reason: `not recorded: ${NO_DECISION.get(reasonCode)}` };
    outcomeGuess = null;
  }

  const rec: AnalysisRecord = {
    status: 'done', summary: points.map(p => p.claim).join(' '), points,
    quotes: points.map(p => ({ text: p.quote, startMs: p.startMs, speaker: p.speaker })),
    quotesProposed: proposed, quotesDropped: dropped, reasonCode, modelReasonCode: modelCode, outcomeGuess,
    judgeVersionId: judge?.id ?? null, model: reply.model, forgetRequested, outcomeUnclear, outcomeConfidence, tier,
    judge: outcomeGuess ? { judgeVersionId: judge?.id ?? null, value: outcomeGuess.value, quote: outcomeGuess.quote,
      calibration: judge ? (await one<{ status: string }>(pool, 'SELECT status FROM calibration WHERE judge_version_id = $1 ORDER BY created_at DESC LIMIT 1', [judge.id]))?.status ?? 'uncalibrated' : 'uncalibrated' } : null,
  };

  return store(rec, async c => {
    await c.query('UPDATE conversation SET reason_code = $3 WHERE id = $1 AND workspace_id = $2', [conversationId, workspaceId, reasonCode]);
    await syncGoalReason(c, workspaceId, conversationId);
    if (dropped) await c.query(`UPDATE conversation SET flagged = true, flags = ARRAY(SELECT DISTINCT unnest(flags || '{quotes_dropped}'::text[]) ORDER BY 1) WHERE id = $1`, [conversationId]);
    await c.query(`DELETE FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 AND source = 'analysis'`, [conversationId, workspaceId]);
    for (const m of moments) {
      await c.query(`INSERT INTO call_moment (workspace_id, conversation_id, source, kind, at_ms, note, quote) VALUES ($1,$2,'analysis',$3,$4,$5,$6)`,
        [workspaceId, conversationId, m.kind, m.atMs, m.note, m.quote]);
    }
    await costLines(c);
    if (outcomeGuess && !isTest && cv.def_id) {
      await c.query(`DELETE FROM outcome WHERE conversation_id = $1 AND workspace_id = $2 AND grade = 'ai_guess'`, [conversationId, workspaceId]);
      await c.query(`INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence, judge_version_id)
        VALUES ($1,$2,$3,$4,$5,'ai_guess',$6,$7,$8)`,
        [workspaceId, conversationId, cv.contact_id, cv.def_id, outcomeGuess.value, judge ? `judge:${judge.id}` : 'analysis', { quote: outcomeGuess.quote, turn: outcomeTurn, speaker: 'caller' }, judge?.id ?? null]);
      await refreshOutcome(c, workspaceId, conversationId);
    }
    // A caller's own request to be forgotten goes to memory as a forget_request (memory completes it). Never from a test call.
    if (forgetRequested && !isTest && cv.contact_id) {
      await c.query(`INSERT INTO forget_request (workspace_id, contact_id, scope, requested_via, evidence) VALUES ($1,$2,'forget_memory','caller',$3)`,
        [workspaceId, cv.contact_id, { quote: forgetRequested.quote, conversationId }]);
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

/** Analyse ended calls the in-process queue lost (a restart between ingest and analysis), and retry pending opt-outs. */
export async function sweep(pool: pg.Pool, registry: Registry, opts: { olderThanMs?: number; workspaceId?: string } = {}): Promise<{ analysed: number }> {
  const due = await many<{ id: string; workspace_id: string }>(pool,
    `SELECT id, workspace_id FROM conversation WHERE status = 'ended' AND analysis IS NULL AND ended_at < now() - make_interval(secs => $1::float / 1000)
       AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
     ORDER BY ended_at LIMIT 20`, [opts.olderThanMs ?? 120_000, opts.workspaceId ?? null]);
  for (const d of due) await analyse(pool, d.workspace_id, d.id, registry).catch(e => console.error('[vp] calls sweep', d.id, e instanceof Error ? e.message : e));
  const { flushOptOuts } = await import('./ingest.ts');
  for (const w of await many<{ workspace_id: string }>(pool, `SELECT DISTINCT workspace_id FROM call_opt_out WHERE status = 'pending' AND ($1::uuid IS NULL OR workspace_id = $1::uuid) LIMIT 50`, [opts.workspaceId ?? null])) {
    await flushOptOuts(pool, registry, w.workspace_id);
  }
  return { analysed: due.length };
}
