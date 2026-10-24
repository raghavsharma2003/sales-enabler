// The model review of brief text (contract: shared/safety/brief-review.json). The regex door goes first and is never
// weakened: hardFindings (shared/safety T-L1, crisis lines, manipulation) decides alone when it finds anything, and the
// model is only asked about a brief the rules let through. The model can only ADD a refusal. A missing model, a
// timeout, an error or bad output leaves the rules' verdict, and the label says so; nothing is silent.
import type { AgentConfig } from '../../../shared/agent-config.ts';
import contract from '../../../shared/safety/brief-review.json' with { type: 'json' };
import { complete, llmKeysConfigured, type Purpose } from '../../llm.ts';
import { ValidationError } from '../../../shared/validate.ts';
import { affirmsAi } from '../../../shared/safety/disclosure.ts';
import { HARD_RULES, hardFindings, type HardFinding, type HardRule } from './guard.ts';

type Kind = 'human' | 'hide_ai' | 'crisis' | 'manipulation';
interface Contract {
  llm_purpose: string; threshold: number; timeout_ms: number; max_input_chars: number; max_field_chars: number; max_tokens: number;
  temperature: number; kinds: Record<Kind, HardRule>; labels: { model: string; rules_only: string; unavailable: string };
  system_prompt: string; user_template: string; context_template: string;
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
  return llmKeysConfigured(PURPOSE);
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
// Persona and brand settings (name, gender, register, energy, humour, honorific; the brand's names) are not instructions:
// a persona name is allowed while she still says she is an AI. They are given as context, never as fields to judge
// (rejected.2026-10-24.brief-review-flags-persona-names: gpt-4.1 flagged persona.name as a human claim, 12 of 81).
const SETTING = /^(persona\.(name|gender|register|energy|humour|honorific)|brand\.(name|spokenName))$/;
export function reviewFields(c: AgentConfig): [string, string][] {
  return fields(c, '').filter(([p]) => !SKIP.test(p) && !SETTING.test(p));
}

function reviewContext(c: AgentConfig): string {
  const p = c.persona as { name?: string; gender?: string } | undefined;
  const b = c.brand as { name?: string; spokenName?: string } | undefined;
  return BRIEF_REVIEW.context_template.replace('{name}', (p?.name || 'unnamed').slice(0, 60)).replace('{gender}', (p?.gender || 'unspecified').slice(0, 20))
    .replace('{brand}', (b?.spokenName || b?.name || 'the business').slice(0, 80));
}

export function reviewInput(c: AgentConfig): { text: string; fields: [string, string][] } {
  const fs = reviewFields(c);
  const rows: string[] = [];
  let used = 0;
  const facts = (c.facts ?? []) as { key?: string }[];
  for (let i = 0; i < fs.length; i++) {
    // A fact's key is its meaning ("you_cannot: quote final prices"), so it goes with the value as a label
    // (rejected.2026-10-24.brief-review-drops-fact-keys: without it a prohibition read as an instruction).
    const fk = /^facts\[(\d+)\]\.value$/.exec(fs[i][0]);
    const label = fk && facts[Number(fk[1])]?.key ? ` (key: ${String(facts[Number(fk[1])].key).replace(/[^\w .-]/g, '').slice(0, 60)})` : '';
    const row = `${i + 1}. ${fs[i][0]}${label}: ${fs[i][1].replace(/\s+/g, ' ').trim().slice(0, BRIEF_REVIEW.max_field_chars).replace(/(BRIEF)?>>>|<<<(BRIEF)?/g, '')}`;
    if (used + row.length > BRIEF_REVIEW.max_input_chars) break;
    rows.push(row); used += row.length + 1;
  }
  return { text: BRIEF_REVIEW.user_template.replace('{context}', reviewContext(c)).replace('{fields}', rows.join('\n')), fields: fs.slice(0, rows.length) };
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

// open.2026-10-24.brief-review-fp-names-in-notes: a 'human' or 'hide_ai' finding on a field that itself affirms she
// is an AI (the shared lexicon.ai_affirm, as RD1 reads it) and carries no human-claim word contradicts the field's own
// words: an honest opening or note. The regex door has already run on it.
const HUMAN_CLAIM = /\b(human|real person|real woman|real man|staff|employee|team member|colleague|person not|insaan|insan|karmachari|asli)\b|इंसान|असली|कर्मचारी/i;
// Wider than lexicon.ai_affirm (rules.json is frozen while PREREG-10 runs; a candidate for it later): a name or a
// third person between the subject and "AI assistant" ("I am Riya, the AI assistant of ..."; "she is the AI assistant").
const AI_SELF = /\b(i am|i'm|she is|she's|he is|he's|main|mai|woh|wo)\b[^.?!]{0,40}\b(an?|the|our|ek)\s+(ai|a\.i\.|virtual|digital)\s+(assistant|agent|sahayak|sahayika|helper)\b|(मैं|वह|वो)[^.?!।]{0,40}(एआई|\bAI\b)\s?(असिस्टेंट|सहायक|सहायिका)/i;
const NEG_AI = /\b(not|never|nahi|nahin|na)\b[^.?!]{0,12}\b(an? |the )?(ai|bot|virtual)\b|नहीं/i;
function honestAffirmation(f: { kind: string; text: string }): boolean {
  if (f.kind !== 'human' && f.kind !== 'hide_ai') return false;
  return (affirmsAi(f.text) || (AI_SELF.test(f.text) && !NEG_AI.test(f.text))) && !HUMAN_CLAIM.test(f.text);
}

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
    const model = found.filter(f => f.confidence >= th && !honestAffirmation(f)).map(f => ({ ...f, rule: BRIEF_REVIEW.kinds[f.kind], source: 'model' as const }));
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
