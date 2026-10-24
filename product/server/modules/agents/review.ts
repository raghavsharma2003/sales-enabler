// The model review of brief text (contract: shared/safety/brief-review.json). The regex door goes first and is never
// weakened: hardFindings (shared/safety T-L1, crisis lines, manipulation) decides alone when it finds anything, and the
// model is only asked about a brief the rules let through. The model can only ADD a refusal. A missing model, a
// timeout, an error or bad output leaves the rules' verdict, and the label says so; nothing is silent.
import type { AgentConfig } from '../../../shared/agent-config.ts';
import contract from '../../../shared/safety/brief-review.json' with { type: 'json' };
import { complete, type Purpose } from '../../llm.ts';
import { ValidationError } from '../../../shared/validate.ts';
import { HARD_RULES, hardFindings, type HardFinding, type HardRule } from './guard.ts';

type Kind = 'human' | 'hide_ai' | 'crisis' | 'manipulation';
interface Contract {
  llm_purpose: string; threshold: number; timeout_ms: number; max_input_chars: number; max_field_chars: number; max_tokens: number;
  temperature: number; kinds: Record<Kind, HardRule>; labels: { model: string; rules_only: string; unavailable: string };
  system_prompt: string; user_template: string;
}
export const BRIEF_REVIEW = contract as unknown as Contract;
const PURPOSE = BRIEF_REVIEW.llm_purpose as Purpose;
if (PURPOSE !== ('brief_review' satisfies Purpose)) throw new Error(`brief-review.json llm_purpose ${PURPOSE} is not the kernel's 'brief_review'`);

export interface ModelFinding extends HardFinding { kind: Kind; confidence: number; reason: string; source: 'model' }
export interface BriefReview {
  mode: 'rules' | 'model' | 'rules_only' | 'unavailable';   // rules: the regex refused first, so the model was not asked
  label: string;                                             // said on the publish card and in the save result
  rules: HardFinding[];                                      // the regex door's hard findings
  model: ModelFinding[];                                     // what the model added (at or above threshold)
  reason?: 'timeout' | 'error' | 'bad_output';
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs?: number;
}

/** Real keys for the purpose (or the caller says so, as tests and the eval do). A test fake installed for another
 *  purpose does not switch the review on. */
export function reviewConfigured(): boolean {
  const get = (k: string) => process.env[`VP_LLM_BRIEF_REVIEW_${k}`] ?? process.env[`VP_LLM_DEFAULT_${k}`];
  return Boolean(get('URL') && get('KEY') && get('MODEL'));
}

// The fields the model reads: every string a caller could hear the effect of. Ids, hashes, voice parts and domains are
// not instructions.
function fields(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') { if (v.trim()) out.push([path, v]); }
  else if (Array.isArray(v)) v.forEach((x, i) => fields(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) fields(x, path ? `${path}.${k}` : k, out);
  return out;
}
const SKIP = /^(agentId|versionHash|job|category|voice\.|brand\.verifiedDomains|sectorPacks|languages\.|goals\[\d+\]\.id$|facts\[\d+\]\.(key|purpose|source)$)/;
export function reviewFields(c: AgentConfig): [string, string][] {
  return fields(c, '').filter(([p]) => !SKIP.test(p));
}

export function reviewInput(c: AgentConfig): { text: string; fields: [string, string][] } {
  const fs = reviewFields(c);
  const rows: string[] = [];
  let used = 0;
  for (let i = 0; i < fs.length; i++) {
    const row = `${i + 1}. ${fs[i][0]}: ${fs[i][1].replace(/\s+/g, ' ').trim().slice(0, BRIEF_REVIEW.max_field_chars).replace(/(BRIEF)?>>>|<<<(BRIEF)?/g, '')}`;
    if (used + row.length > BRIEF_REVIEW.max_input_chars) break;
    rows.push(row); used += row.length + 1;
  }
  return { text: BRIEF_REVIEW.user_template.replace('{fields}', rows.join('\n')), fields: fs.slice(0, rows.length) };
}

/** The model's findings, validated against the fields it was shown. null when the reply is not the schema. */
export function parseReview(raw: string, fs: [string, string][]): Omit<ModelFinding, 'rule' | 'source'>[] | null {
  let j: unknown;
  try { j = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  const list = (j as { findings?: unknown })?.findings;
  if (!Array.isArray(list)) return null;
  const out: Omit<ModelFinding, 'rule' | 'source'>[] = [];
  for (const f of list) {
    const o = f as Record<string, unknown>;
    const n = o.field, kind = o.kind as Kind, conf = o.confidence;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > fs.length) return null;     // only fields it was shown
    if (!(kind in BRIEF_REVIEW.kinds) || typeof conf !== 'number' || !(conf >= 0 && conf <= 1)) return null;
    const reason = typeof o.reason === 'string' ? o.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    out.push({ kind, confidence: conf, reason, path: fs[n - 1][0], text: fs[n - 1][1] });
  }
  return out;
}

class ReviewTimeout extends Error {}

/** Review one config: the rules first, then (only if they found nothing, and a model is configured) the model.
 *  alwaysAsk is for judge-eval only: it asks the model even when the rules refused, so its own recall is measured. */
export async function reviewBrief(c: AgentConfig, opts: { assumeConfigured?: boolean; timeoutMs?: number; threshold?: number; alwaysAsk?: boolean } = {}): Promise<BriefReview> {
  const rules = hardFindings(c);
  if (rules.length && !opts.alwaysAsk) return { mode: 'rules', label: BRIEF_REVIEW.labels.rules_only.replace(' (no model configured)', ' (they refused first)'), rules, model: [] };
  if (!(opts.assumeConfigured || reviewConfigured())) return { mode: 'rules_only', label: BRIEF_REVIEW.labels.rules_only, rules, model: [] };
  const { text, fields: fs } = reviewInput(c);
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t0 = performance.now();
  const unavailable = (reason: BriefReview['reason'], usage?: BriefReview['usage']): BriefReview =>
    ({ mode: 'unavailable', label: BRIEF_REVIEW.labels.unavailable.replace('{reason}', reason!), rules, model: [], reason, usage, latencyMs: performance.now() - t0 });
  try {
    const reply = await Promise.race([
      complete({ purpose: PURPOSE, json: true, temperature: BRIEF_REVIEW.temperature, maxTokens: BRIEF_REVIEW.max_tokens, signal: abort.signal,
        messages: [{ role: 'system', content: BRIEF_REVIEW.system_prompt }, { role: 'user', content: text }] }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new ReviewTimeout()); }, opts.timeoutMs ?? BRIEF_REVIEW.timeout_ms); }),
    ]);
    const found = parseReview(reply.text, fs);
    if (!found) return unavailable('bad_output', reply.usage);
    const th = opts.threshold ?? BRIEF_REVIEW.threshold;
    const model = found.filter(f => f.confidence >= th).map(f => ({ ...f, rule: BRIEF_REVIEW.kinds[f.kind], source: 'model' as const }));
    return { mode: 'model', label: BRIEF_REVIEW.labels.model, rules, model, usage: reply.usage, latencyMs: performance.now() - t0 };
  } catch (e) {
    return unavailable(e instanceof ReviewTimeout ? 'timeout' : 'error');
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-English refusal for a model finding: the rule, the field, the model's reason, and the fix. */
export function modelRefusalText(f: ModelFinding, saved: boolean): string {
  const r = HARD_RULES[f.rule];
  return `refused, ${saved ? 'the draft is saved but ' : ''}nothing was published: ${r.rule}. ${f.path} ("${f.text.slice(0, 80)}") breaks it` +
    (f.reason ? ` (review: ${f.reason})` : '') + `; to fix: ${r.fix}`;
}

/** Publish gate: throw on any hard finding, the rules' first. Returns the review for the receipt. */
export async function assertPublishable(c: AgentConfig): Promise<BriefReview> {
  const r = await reviewBrief(c);
  if (r.rules.length) throw new ValidationError(r.rules[0].path, `refused, nothing was published: ${HARD_RULES[r.rules[0].rule].rule}. ${r.rules[0].path} breaks it; to fix: ${HARD_RULES[r.rules[0].rule].fix}`);
  if (r.model.length) throw new ValidationError(r.model[0].path, modelRefusalText(r.model[0], true) + (r.model.length > 1 ? ` (and ${r.model.length - 1} more)` : ''));
  return r;
}

/** What a save returns about the review: advisory, never blocking (the rules already refused anything hard). */
export function reviewSummary(r: BriefReview) {
  return { mode: r.mode, label: r.label, findings: r.model.map(f => ({ path: f.path, rule: f.rule, kind: f.kind, confidence: f.confidence, reason: f.reason,
    fix: HARD_RULES[f.rule].fix, publish: 'blocked until fixed' })) };
}
