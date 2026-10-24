// The model-based judges behind the deterministic floor. The contract (prompt, schema, modes, threshold, timeout,
// events) is data in judge.json, shared with the Python runtime. One rule above all: a judge can only ADD a signal.
// The floor's verdict always stands; a missing model, a timeout, an error or bad output leaves it unchanged.
import { complete, type LlmReply, type Purpose } from '../../server/llm.ts';
import { callerSignals, redact } from './index.ts';
import judgeData from './judge.json' with { type: 'json' };

export type JudgeMode = 'off' | 'shadow' | 'raise';
interface CrisisJudgeSpec {
  llm_purpose: string; modes: JudgeMode[]; mode_default: JudgeMode; mode_env: string; threshold: number; opt_out_threshold: number; timeout_ms: number;
  hedge_after_ms: number | null;
  max_input_chars: number; max_tokens: number; temperature: number; skip_when_floor_fires: boolean;
  system_prompt: string; user_template: string;
}
export const CRISIS_JUDGE = (judgeData as unknown as { judges: { caller_crisis: CrisisJudgeSpec } }).judges.caller_crisis;
// judge.json names the purpose so the env name (VP_LLM_SAFETY_JUDGE_*) stays the contract's; it must be a kernel Purpose.
const PURPOSE = CRISIS_JUDGE.llm_purpose as Purpose;
if (PURPOSE !== ('safety_judge' satisfies Purpose)) throw new Error(`judge.json llm_purpose ${PURPOSE} is not the kernel's 'safety_judge'`);

/** The model's verdict. optOut is present only when the reply carried a well-formed opt_out pair (it is optional). */
export interface JudgeVerdict { crisis: boolean; confidence: number; kind: 'direct' | 'indirect' | 'none'; optOut?: { value: boolean; confidence: number } }
export type JudgeEvent =
  | { type: 'judge_unavailable'; reason: 'timeout' | 'error' | 'bad_output' }
  | { type: 'judge_raised'; kind: JudgeVerdict['kind']; confidence: number }
  | { type: 'judge_shadow'; kind: JudgeVerdict['kind']; confidence: number };

export interface CrisisJudgeResult {
  crisis: boolean;               // the signal to act on: floor OR (mode raise AND the judge says so)
  floor: boolean;                // what the deterministic floor said
  optOut: boolean;               // the same for opt-out: floor OR (mode raise AND the judge says so AND no crisis)
  floorOptOut: boolean;
  optOutEvent: { type: 'judge_raised' | 'judge_shadow'; confidence: number } | null;
  mode: JudgeMode;
  called: boolean;               // false when off, not configured, or skipped because the floor already fired
  judge: JudgeVerdict | null;
  event: JudgeEvent | null;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
  requests?: number;                   // model requests sent (2 when the hedge fired); usage covers all of them
}

export interface CrisisJudgeCtx {
  mode?: JudgeMode;              // default: VP_SAFETY_JUDGE_MODE, else judge.json mode_default
  prev?: string;                 // the previous caller turn, as context
  timeoutMs?: number;
  /** Override judge.json hedge_after_ms (null = no hedge). */
  hedgeAfterMs?: number | null;
  /** Tests and the eval harness: treat the judge as configured even without env keys (e.g. with setFakeLlm). */
  assumeConfigured?: boolean;
}

/** A judge runs only when a real model is configured for its purpose (or the caller says so explicitly): no keys,
 *  no call, no spend. A test fake installed for another purpose does not switch it on. */
export function judgeConfigured(): boolean {
  const P = PURPOSE.toUpperCase();
  const get = (k: string) => process.env[`VP_LLM_${P}_${k}`] ?? process.env[`VP_LLM_DEFAULT_${k}`];
  return Boolean(get('URL') && get('KEY') && get('MODEL'));
}

export function judgeMode(override?: JudgeMode): JudgeMode {
  const m = override ?? (process.env[CRISIS_JUDGE.mode_env] as JudgeMode | undefined) ?? CRISIS_JUDGE.mode_default;
  return CRISIS_JUDGE.modes.includes(m) ? m : 'off';
}

/** The text a judge may see: redacted first, whitespace folded, cut to the contract's length. */
export function judgeInput(text: string): string {
  return redact(text).replace(/\s+/g, ' ').trim().slice(0, CRISIS_JUDGE.max_input_chars);
}

export function parseVerdict(raw: string): JudgeVerdict | null {
  let j: unknown;
  try { j = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  // An optional 0-100 risk score (finer than the model's stepped confidences) stands for confidence when that is absent.
  if (o.confidence === undefined && Number.isInteger(o.risk) && (o.risk as number) >= 0 && (o.risk as number) <= 100) o.confidence = (o.risk as number) / 100;
  if (typeof o.crisis !== 'boolean' || typeof o.confidence !== 'number' || !Number.isFinite(o.confidence)) return null;
  if (o.confidence < 0 || o.confidence > 1 || !['direct', 'indirect', 'none'].includes(o.kind as string)) return null;
  if ((o.kind === 'none') === o.crisis) return null;           // crisis and kind must agree
  const v: JudgeVerdict = { crisis: o.crisis, confidence: o.confidence, kind: o.kind as JudgeVerdict['kind'] };
  // opt_out is optional: a malformed or half pair is ignored (it can never raise), the crisis label still counts.
  const oc = o.opt_out_confidence;
  if (typeof o.opt_out === 'boolean' && typeof oc === 'number' && Number.isFinite(oc) && oc >= 0 && oc <= 1) v.optOut = { value: o.opt_out, confidence: oc };
  return v;
}

/** Read one caller utterance with the floor and, when configured and on, the crisis judge. Raise-only by construction:
 *  the result's crisis is floor || raised, and nothing in this function can set it false once the floor said true. */
export async function judgeCallerCrisis(text: string, ctx: CrisisJudgeCtx = {}): Promise<CrisisJudgeResult> {
  const sig = callerSignals(text);
  const floor = sig.crisis, floorOptOut = sig.optOut;
  const mode = judgeMode(ctx.mode);
  const base: CrisisJudgeResult = { crisis: floor, floor, optOut: floorOptOut, floorOptOut, optOutEvent: null, mode, called: false, judge: null, event: null, latencyMs: 0, usage: null };
  if (mode === 'off' || !(ctx.assumeConfigured || judgeConfigured())) return base;
  if (floor && CRISIS_JUDGE.skip_when_floor_fires) return base;

  const user = judgeUserText(text, ctx.prev);
  const timeoutMs = ctx.timeoutMs ?? judgeTimeoutMs();
  const t0 = performance.now();
  try {
    const { reply, requests } = await hedgedCall(user, timeoutMs, ctx.hedgeAfterMs === undefined ? judgeHedgeMs() : ctx.hedgeAfterMs);
    const latencyMs = performance.now() - t0;
    // A hedged second request is billed too, and its prompt is identical: meter the winning reply's tokens once per request
    // sent (an upper bound for a request cancelled mid-answer), so the judge's cost is never understated.
    const usage = reply.usage ? { inputTokens: reply.usage.inputTokens * requests, outputTokens: reply.usage.outputTokens * requests } : null;
    const v = parseVerdict(reply.text);
    if (!v) return { ...base, called: true, latencyMs, usage, requests, event: { type: 'judge_unavailable', reason: 'bad_output' } };
    const says = v.crisis && v.kind !== 'none' && v.confidence >= CRISIS_JUDGE.threshold;
    const raised = says && mode === 'raise' && !floor;
    const event: JudgeEvent | null = !says || floor ? null
      : mode === 'raise' ? { type: 'judge_raised', kind: v.kind, confidence: v.confidence }
      : { type: 'judge_shadow', kind: v.kind, confidence: v.confidence };
    // Opt-out, the second label: raise-only too, and never while the call is in crisis (a crisis call is never ended).
    const crisisNow = floor || raised;
    const optSays = Boolean(v.optOut?.value) && (v.optOut?.confidence ?? 0) >= CRISIS_JUDGE.opt_out_threshold && !crisisNow && !says;
    const optRaised = optSays && mode === 'raise' && !floorOptOut;
    const optOutEvent = !optSays || floorOptOut ? null : { type: mode === 'raise' ? 'judge_raised' as const : 'judge_shadow' as const, confidence: v.optOut!.confidence };
    return { ...base, crisis: crisisNow, optOut: floorOptOut || optRaised, optOutEvent, called: true, judge: v, event, latencyMs, usage, requests };
  } catch (e) {
    return { ...base, called: true, latencyMs: performance.now() - t0, event: { type: 'judge_unavailable', reason: e instanceof JudgeTimeout ? 'timeout' : 'error' } };
  }
}

/** The judge's model request for one utterance (user already built from user_template): the same for the live judge
 *  and scripts/judge-latency.mjs, so the latency run measures exactly what calls send. */
export function judgeRequest(user: string) {
  return { purpose: PURPOSE, json: true, temperature: CRISIS_JUDGE.temperature, maxTokens: CRISIS_JUDGE.max_tokens,
    messages: [{ role: 'system' as const, content: CRISIS_JUDGE.system_prompt }, { role: 'user' as const, content: user }] };
}

export function judgeUserText(text: string, prev = ''): string {
  return CRISIS_JUDGE.user_template.replace('{prev}', prev ? judgeInput(prev) : '').replace('{text}', judgeInput(text));
}

/** judge.json timeout_ms, or VP_SAFETY_JUDGE_TIMEOUT_MS clamped to 500-3000 (as the Python door's judge.timeout_ms). */
export function judgeTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number.parseInt(env.VP_SAFETY_JUDGE_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(v) ? Math.max(500, Math.min(3000, v)) : CRISIS_JUDGE.timeout_ms;
}

/** judge.json hedge_after_ms, or VP_SAFETY_JUDGE_HEDGE_MS clamped to 200-3000 ('0' or 'off' turns it off). null = off. */
export function judgeHedgeMs(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.VP_SAFETY_JUDGE_HEDGE_MS ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'off') return null;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) ? Math.max(200, Math.min(3000, v)) : CRISIS_JUDGE.hedge_after_ms;
}

/** One call, plus ONE identical second call when the first has not answered validly after hedgeMs (slow, failed or
 *  unreadable). The first valid reply wins; each is judged exactly as it would be alone, so raise-only holds
 *  (open.2026-10-24.judge-timeout-budget). Rejects with JudgeTimeout when nothing arrives within timeoutMs. */
async function hedgedCall(user: string, timeoutMs: number, hedgeMs: number | null): Promise<{ reply: LlmReply; requests: number }> {
  const aborts: AbortController[] = [];
  const call = () => {
    const a = new AbortController(); aborts.push(a);
    return complete({ ...judgeRequest(user), signal: a.signal });
  };
  let timer: ReturnType<typeof setTimeout> | undefined, hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise((resolve, reject) => {
      let settled = false, running = 0, last: LlmReply | null = null, lastErr: unknown = null, hedged = false;
      const finish = (f: () => void) => { if (!settled) { settled = true; f(); } };
      const launch = () => {
        running++;
        call().then(r => {
          running--;
          if (parseVerdict(r.text)) return finish(() => resolve({ reply: r, requests: aborts.length }));
          last = r; next();
        }, e => { running--; lastErr = e; next(); });
      };
      const next = () => {                         // a failed or unreadable answer: hedge now if not yet, else wait or give up
        if (settled) return;
        if (!hedged && hedgeMs !== null && hedgeMs < timeoutMs) { hedged = true; clearTimeout(hedgeTimer); launch(); return; }
        if (running === 0) finish(() => (last ? resolve({ reply: last, requests: aborts.length }) : reject(lastErr ?? new JudgeTimeout())));
      };
      timer = setTimeout(() => finish(() => (last ? resolve({ reply: last, requests: aborts.length }) : reject(new JudgeTimeout()))), timeoutMs);
      if (hedgeMs !== null && hedgeMs < timeoutMs) hedgeTimer = setTimeout(() => { if (!settled && !hedged) { hedged = true; launch(); } }, hedgeMs);
      launch();
    });
  } finally {
    clearTimeout(timer); clearTimeout(hedgeTimer);
    for (const a of aborts) a.abort();
  }
}

class JudgeTimeout extends Error { constructor() { super('judge timed out'); this.name = 'JudgeTimeout'; } }

/** Post-call use (calls analysis): judge every caller line of a stored transcript that the floor did not flag, in
 *  order, with the previous caller line as context. Returns only the lines where the judge would add a signal
 *  (crisis or opt-out). */
export async function judgeTranscriptCrisis(lines: { speaker: 'agent' | 'caller'; text: string }[], ctx: Omit<CrisisJudgeCtx, 'prev'> = {}):
  Promise<{ index: number; result: CrisisJudgeResult }[]> {
  const out: { index: number; result: CrisisJudgeResult }[] = [];
  let prev = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].speaker !== 'caller') continue;
    const result = await judgeCallerCrisis(lines[i].text, { ...ctx, prev });
    if ((result.event && result.event.type !== 'judge_unavailable') || result.optOutEvent) out.push({ index: i, result });
    prev = lines[i].text;
  }
  return out;
}
