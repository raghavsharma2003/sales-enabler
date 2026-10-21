// The model-based judges behind the deterministic floor. The contract (prompt, schema, modes, threshold, timeout,
// events) is data in judge.json, shared with the Python runtime. One rule above all: a judge can only ADD a signal.
// The floor's verdict always stands; a missing model, a timeout, an error or bad output leaves it unchanged.
import { complete, type Purpose } from '../../server/llm.ts';
import { callerSignals, redact } from './index.ts';
import judgeData from './judge.json' with { type: 'json' };

export type JudgeMode = 'off' | 'shadow' | 'raise';
interface CrisisJudgeSpec {
  llm_purpose: string; modes: JudgeMode[]; mode_default: JudgeMode; mode_env: string; threshold: number; timeout_ms: number;
  max_input_chars: number; max_tokens: number; temperature: number; skip_when_floor_fires: boolean;
  system_prompt: string; user_template: string;
}
export const CRISIS_JUDGE = (judgeData as unknown as { judges: { caller_crisis: CrisisJudgeSpec } }).judges.caller_crisis;
// The kernel's Purpose union does not list 'safety_judge' yet; the door reads VP_LLM_<PURPOSE>_* by name, so the
// purpose works at runtime. Narrowed here so the env name stays the contract's.
const PURPOSE = CRISIS_JUDGE.llm_purpose as Purpose;

export interface JudgeVerdict { crisis: boolean; confidence: number; kind: 'direct' | 'indirect' | 'none' }
export type JudgeEvent =
  | { type: 'judge_unavailable'; reason: 'timeout' | 'error' | 'bad_output' }
  | { type: 'judge_raised'; kind: JudgeVerdict['kind']; confidence: number }
  | { type: 'judge_shadow'; kind: JudgeVerdict['kind']; confidence: number };

export interface CrisisJudgeResult {
  crisis: boolean;               // the signal to act on: floor OR (mode raise AND the judge says so)
  floor: boolean;                // what the deterministic floor said
  mode: JudgeMode;
  called: boolean;               // false when off, not configured, or skipped because the floor already fired
  judge: JudgeVerdict | null;
  event: JudgeEvent | null;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface CrisisJudgeCtx {
  mode?: JudgeMode;              // default: VP_SAFETY_JUDGE_MODE, else judge.json mode_default
  prev?: string;                 // the previous caller turn, as context
  timeoutMs?: number;
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
  if (typeof o.crisis !== 'boolean' || typeof o.confidence !== 'number' || !Number.isFinite(o.confidence)) return null;
  if (o.confidence < 0 || o.confidence > 1 || !['direct', 'indirect', 'none'].includes(o.kind as string)) return null;
  if ((o.kind === 'none') === o.crisis) return null;           // crisis and kind must agree
  return { crisis: o.crisis, confidence: o.confidence, kind: o.kind as JudgeVerdict['kind'] };
}

/** Read one caller utterance with the floor and, when configured and on, the crisis judge. Raise-only by construction:
 *  the result's crisis is floor || raised, and nothing in this function can set it false once the floor said true. */
export async function judgeCallerCrisis(text: string, ctx: CrisisJudgeCtx = {}): Promise<CrisisJudgeResult> {
  const floor = callerSignals(text).crisis;
  const mode = judgeMode(ctx.mode);
  const base: CrisisJudgeResult = { crisis: floor, floor, mode, called: false, judge: null, event: null, latencyMs: 0, usage: null };
  if (mode === 'off' || !(ctx.assumeConfigured || judgeConfigured())) return base;
  if (floor && CRISIS_JUDGE.skip_when_floor_fires) return base;

  const user = CRISIS_JUDGE.user_template.replace('{prev}', ctx.prev ? judgeInput(ctx.prev) : '').replace('{text}', judgeInput(text));
  const timeoutMs = ctx.timeoutMs ?? CRISIS_JUDGE.timeout_ms;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t0 = performance.now();
  try {
    const reply = await Promise.race([
      complete({ purpose: PURPOSE, json: true, temperature: CRISIS_JUDGE.temperature, maxTokens: CRISIS_JUDGE.max_tokens, signal: abort.signal,
        messages: [{ role: 'system', content: CRISIS_JUDGE.system_prompt }, { role: 'user', content: user }] }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new JudgeTimeout()); }, timeoutMs); }),
    ]);
    const latencyMs = performance.now() - t0;
    const v = parseVerdict(reply.text);
    if (!v) return { ...base, called: true, latencyMs, usage: reply.usage, event: { type: 'judge_unavailable', reason: 'bad_output' } };
    const says = v.crisis && v.kind !== 'none' && v.confidence >= CRISIS_JUDGE.threshold;
    const raised = says && mode === 'raise' && !floor;
    const event: JudgeEvent | null = !says || floor ? null
      : mode === 'raise' ? { type: 'judge_raised', kind: v.kind, confidence: v.confidence }
      : { type: 'judge_shadow', kind: v.kind, confidence: v.confidence };
    return { ...base, crisis: floor || raised, called: true, judge: v, event, latencyMs, usage: reply.usage };
  } catch (e) {
    return { ...base, called: true, latencyMs: performance.now() - t0, event: { type: 'judge_unavailable', reason: e instanceof JudgeTimeout ? 'timeout' : 'error' } };
  } finally {
    clearTimeout(timer);
  }
}

class JudgeTimeout extends Error { constructor() { super('judge timed out'); this.name = 'JudgeTimeout'; } }

/** Post-call use (calls analysis): judge every caller line of a stored transcript that the floor did not flag, in
 *  order, with the previous caller line as context. Returns only the lines where the judge would add the signal. */
export async function judgeTranscriptCrisis(lines: { speaker: 'agent' | 'caller'; text: string }[], ctx: Omit<CrisisJudgeCtx, 'prev'> = {}):
  Promise<{ index: number; result: CrisisJudgeResult }[]> {
  const out: { index: number; result: CrisisJudgeResult }[] = [];
  let prev = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].speaker !== 'caller') continue;
    const result = await judgeCallerCrisis(lines[i].text, { ...ctx, prev });
    if (result.event && result.event.type !== 'judge_unavailable') out.push({ index: i, result });
    prev = lines[i].text;
  }
  return out;
}
