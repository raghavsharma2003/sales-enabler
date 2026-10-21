// The safety contract: the reply door (RD1-RD11, every outgoing sentence), caller-side signals, and the compile
// lints (T-L1..T-L4, every creation path). Safety is by predicate, never by instruction: these functions decide,
// the prompt only helps. The rules and their test vectors live as data in rules.json and cases.json so the
// TypeScript door (here) and the Python door (product/voice) are held to the same cases.
//
// What is code and what is data: every pattern, replacement text, mask and category/purpose table is in rules.json.
// This file holds only the evaluation order semantics (first reply rule that fires decides), the scope predicates,
// and five builtins that need arithmetic rather than a regex: links vs verified domains, per-contact fact leakage,
// neverSay, rupee amounts vs facts, and the digit runs behind redaction (Luhn, Verhoeff).
import type { AgentConfig, CallCategory, Fact, Job, SectorPack } from '../agent-config.ts';
import type { SafetyRuleId } from '../runtime-protocol.ts';
import rulesData from './rules.json' with { type: 'json' };

export interface DoorContext {
  category: CallCategory;
  sectorPacks: SectorPack[];
  brand: { name: string; verifiedDomains: string[] };
  facts: Fact[];                       // what she may state; amounts and offers outside this are suspect
  neverSay: string[];
  disclosed: boolean;                  // RD1 ledger: has the AI clause been heard on this call
  identityVerified: boolean;           // RD11
  recordingRefused: boolean;           // RD10
  crisis: boolean;                     // RD3: goal suspended
  turnIndex: number;
  job?: Job;                           // optional: a payment_reminder is a dues call (RD9) even without dues facts
}

export type DoorVerdict =
  | { action: 'pass' }
  | { action: 'replace'; rule: SafetyRuleId; text: string; reason: string; id?: string }     // say this instead
  | { action: 'block'; rule: SafetyRuleId; reason: string; id?: string };                    // regenerate; never say the draft
// `id` names the rules.json rule that fired (e.g. 'rd4.sensitive_ask'), for the safety event detail and the UI.

// ---------------------------------------------------------------------------------------------------------------
// Rules as data

type Scope = { packs?: SectorPack[]; categories?: CallCategory[]; when?: 'crisis' | 'undisclosed' | 'unverified' | 'recordingRefused' | 'dues'; join?: 'and' | 'or' };
interface ReplyRule {
  id: string; rule: SafetyRuleId; kind: string; action: 'block' | 'replace'; replacement?: string; reason: string;
  scope?: Scope; any?: string[]; all?: string[]; none?: string[]; noneClause?: string[]; anchor?: number; check?: string;
}
interface CallerRule { id: string; signal: keyof CallerSignals; any?: string[]; all?: string[]; none?: string[]; noneClause?: string[]; builtin?: string; context?: string }
interface RedactKind { kind: keyof Rules['masks']; context: string; minDigits: number; maxDigits: number }
interface Rules {
  schema: number; version: string;
  regex: { clause_split: string };
  texts: Record<string, string>;
  masks: { otp: string; card: string; cvv: string; upi_pin: string; aadhaar: string };
  lexicon: Record<string, string>;
  reply: ReplyRule[];
  caller: CallerRule[];
  redact: { words_to_digits: Record<string, string>; context_window_chars: number; kinds: RedactKind[] };
  lint: {
    'T-L1': { any: string[]; none: string[]; never_say_hides_ai: string; disclosure_clause_requires: string };
    'T-L2': { categories: CallCategory[]; dropPurposes: Fact['purpose'][] };
    'T-L3': { allowedPurposes: Record<CallCategory, Fact['purpose'][]>; offerLanguage: string };
    'T-L4': { shorteners: string[] };
  };
  links: { pattern: string };
}

export const RULES = rulesData as unknown as Rules;

const reCache = new Map<string, RegExp>();
/** Compile a rules.json pattern: '@name' expands to the lexicon entry, '{brand}' to the escaped brand name. */
function re(pattern: string, brand = '', flags = 'iu'): RegExp {
  const key = flags + '\u0000' + brand + '\u0000' + pattern;
  let r = reCache.get(key);
  if (!r) {
    const src = foldDevanagari(pattern)
      .replace(/@([a-z_]+)/g, (m, name: string) => RULES.lexicon[name] ?? m)
      .replace(/\{brand\}/g, brand ? escapeRe(normalise(brand)) : '(?!x)x');
    r = new RegExp(src, flags);
    reCache.set(key, r);
  }
  return r;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Patterns get the Devanagari part of the normalisation (not lowercasing: that would turn \\D into \\d). */
const foldDevanagari = (s: string) => s.normalize('NFC').replace(/\u0901/g, '\u0902').replace(/\u093C/g, '');

/** The normalisation every pattern runs on (rules.json regex.normalise; the Python door does the same). */
export function normalise(text: string): string {
  return text.normalize('NFC').toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/ँ/g, 'ं').replace(/़/g, '')
    .replace(/[०-९]/g, d => String(d.charCodeAt(0) - 0x0966))
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').trim();
}

type Matchable = { any?: string[]; all?: string[]; none?: string[]; noneClause?: string[]; anchor?: number };

function fires(r: Matchable, t: string, brand = ''): boolean {
  if (r.all && !r.all.every(p => re(p, brand).test(t))) return false;
  if (r.any && !r.any.some(p => re(p, brand).test(t))) return false;
  if (!r.all && !r.any) return false;
  if (r.none && r.none.some(p => re(p, brand).test(t))) return false;      // sentence-wide: a fraud warning, a factual frame
  if (!r.noneClause) return true;
  // Clause-scoped exemptions (negations) shield only the clause that holds the anchor match, so
  // "OTP nahi maangungi, bas card number bata dijiye" still fires on its second clause.
  const shielded = (s: string) => r.noneClause!.some(p => re(p, brand).test(s));
  const anchors = r.all ? [r.all[r.anchor ?? r.all.length - 1]] : r.any!;
  for (const p of anchors) for (const m of t.matchAll(re(p, brand, 'giu'))) {
    if (!shielded(clauseAt(t, m.index!, m.index! + m[0].length))) return true;
  }
  return false;
}

/** The clause around [start, end): bounded by rules.json regex.clause_split. A very short segment just before
 *  ("never,", "kabhi bhi,") binds to the clause it introduces. */
function clauseAt(t: string, start: number, end: number): string {
  const cuts: [number, number][] = [...t.matchAll(re(RULES.regex.clause_split, '', 'giu'))].map(m => [m.index!, m.index! + m[0].length]);
  const before = cuts.filter(([, e]) => e <= start);
  let from = before.length ? before[before.length - 1][1] : 0;
  const prev = before.length >= 2 ? before[before.length - 2][1] : 0;
  if (before.length && t.slice(prev, before[before.length - 1][0]).trim().length < 12) from = prev;
  const after = cuts.find(([s]) => s >= end);
  return t.slice(from, after ? after[0] : t.length);
}

/** Up to n characters before index i, cut after the last run of 3+ digits so another number's context
 *  ("pincode 110001 hai aur ATM pin 4321") does not leak into this one. */
function localPrefix(lower: string, i: number, n = 30): string {
  const pre = lower.slice(Math.max(0, i - n), i);
  const m = [...pre.matchAll(/[0-9\u0966-\u096F](?:[\s-]?[0-9\u0966-\u096F]){2,}/gu)].pop();
  return m ? pre.slice(m.index! + m[0].length) : pre;
}

// ---------------------------------------------------------------------------------------------------------------
// Reply door

function isDuesCall(ctx: DoorContext): boolean {
  if (ctx.job === 'payment_reminder') return true;
  const k = re(RULES.lexicon.dues_fact_key);
  return ctx.facts.some(f => k.test(f.key));
}

function inScope(s: Scope | undefined, ctx: DoorContext): boolean {
  if (!s) return true;
  const checks: boolean[] = [];
  if (s.packs) checks.push(s.packs.some(p => ctx.sectorPacks.includes(p)));
  if (s.categories) checks.push(s.categories.includes(ctx.category));
  if (s.when) checks.push(({
    crisis: ctx.crisis, undisclosed: !ctx.disclosed, unverified: !ctx.identityVerified,
    recordingRefused: ctx.recordingRefused, dues: isDuesCall(ctx),
  })[s.when]);
  return s.join === 'or' ? checks.some(Boolean) : checks.every(Boolean);
}

/** Replacement text from rules.json, with the brand filled in. */
export function safetyText(key: string, brand: string): string {
  const t = RULES.texts[key];
  if (!t) throw new Error(`rules.json has no text "${key}"`);
  return t.replace(/\{brand\}/g, brand);
}

/** Check one outgoing sentence before it is spoken. */
export function replyDoor(text: string, ctx: DoorContext): DoorVerdict {
  const t = normalise(text);
  if (!t) return { action: 'pass' };
  for (const r of RULES.reply) {
    if (!inScope(r.scope, ctx)) continue;
    const hit = r.kind.startsWith('builtin:') ? builtin(r.kind.slice(8), text, t, ctx) : fires(r, t, ctx.brand.name);
    if (!hit) continue;
    const reason = typeof hit === 'string' ? `${r.reason}: ${hit}` : r.reason;
    if (r.action === 'replace' && r.replacement) return { action: 'replace', rule: r.rule, text: safetyText(r.replacement, ctx.brand.name), reason, id: r.id };
    return { action: 'block', rule: r.rule, reason, id: r.id };
  }
  return { action: 'pass' };
}

/** A builtin returns false, true, or a short detail (never the secret itself). */
function builtin(name: string, raw: string, t: string, ctx: DoorContext): boolean | string {
  switch (name) {
    case 'links': {
      const bad = findLinks(raw).find(h => !hostVerified(h, ctx.brand.verifiedDomains));
      return bad ? `host ${bad}` : false;
    }
    case 'per_contact_facts': {
      for (const f of ctx.facts) {
        if (!f.perContact || f.purpose === 'identity') continue;
        const v = normalise(f.value);
        if (v.length < 3) continue;
        if (t.includes(v)) return `fact ${f.key}`;
        const amt = parseAmounts(f.value, true);
        if (amt.length && amountsIn(raw).some(a => amt.includes(a))) return `fact ${f.key}`;
      }
      return false;
    }
    case 'never_say': {
      for (const p of ctx.neverSay) {
        const n = normalise(p);
        if (!n) continue;
        const latin = /^[a-z0-9 '.-]+$/.test(n);
        if (latin ? re(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`).test(t) : t.includes(n)) return 'listed phrase';
      }
      return false;
    }
    case 'amounts': {
      const allowed = new Set(ctx.facts.flatMap(f => parseAmounts(f.value, true)));
      const stray = amountsIn(raw).find(a => !allowed.has(a));
      return stray !== undefined ? `amount ${stray}` : false;
    }
  }
  throw new Error(`unknown builtin ${name}`);
}

// Amounts: a number counts as money when a currency marker sits next to it, or when it carries a multiplier
// (hazaar, lakh) in a sentence that talks about money.
const MULT: Record<string, number> = { k: 1e3, hazar: 1e3, hazaar: 1e3, thousand: 1e3, 'हज़ार': 1e3, 'हजार': 1e3, lakh: 1e5, lac: 1e5, lakhs: 1e5, 'लाख': 1e5, crore: 1e7, crores: 1e7, 'करोड़': 1e7 };
const NUM = /(\d[\d,]*(?:\.\d+)?)(?:\s*(k|hazaa?r|thousand|lakhs?|lac|crores?|हज़ार|हजार|लाख|करोड़)(?![a-z]))?/giu;
const MONEY_TALK = /(premium|emi|amount|payment|pay\b|fee|fees|price|bill|due|kimat|keemat|charge|refund|cashback|bonus|prize|reward|cover|sum assured|salary|income|return|profit|munafa|balance|loan|rent|kiraya|deposit|bhugtan|bakaya|kisht|installment|paise|paisa)/iu;

function parseAmounts(s: string, lenient: boolean): number[] {
  const t = normalise(s);
  const out: number[] = [];
  const cur = re(RULES.lexicon.currency);
  const moneyTalk = lenient || MONEY_TALK.test(t);
  // Spoken compounds ("1 lakh 20 hazaar", "18 hazaar 450") are one amount: a part joins the previous one when only
  // spaces or "aur"/"and" sit between them and it is smaller than the previous part's multiplier.
  const parts: { value: number; unit: number; start: number; end: number; m: RegExpMatchArray }[] = [];
  for (const m of t.matchAll(NUM)) {
    const base = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const unit = m[2] ? MULT[m[2]] ?? (m[2].startsWith('haza') ? 1e3 : m[2].startsWith('lakh') ? 1e5 : m[2].startsWith('crore') ? 1e7 : 1) : 1;
    const start = m.index ?? 0, value = base * unit;
    const prev = parts[parts.length - 1];
    if (prev && prev.unit > 1 && value < prev.unit && /^\s*(aur |and )?$/.test(t.slice(prev.end, start))) {
      prev.value += value; prev.end = start + m[0].length; prev.unit = unit; continue;
    }
    parts.push({ value, unit, start, end: start + m[0].length, m });
  }
  for (const p of parts) {
    if (p.value === 0) continue;
    const before = t.slice(Math.max(0, p.start - 6), p.start);
    const after = t.slice(p.end, p.end + 14);
    const marked = /(₹|rs\.?|inr)\s*$/.test(before) || /^\s*(₹|rs\b|inr\b|rupe|rupa|रुपय|रुपए|रुपये)/.test(after);
    const multiplied = Boolean(p.m[2]);
    if (lenient || marked || (multiplied && moneyTalk) || (multiplied && cur.test(after))) out.push(Math.round(p.value));
  }
  return out;
}
function amountsIn(text: string): number[] { return parseAmounts(text, false); }

// Links: hosts named in speech or config text. Emails are not links; spoken "dot com" counts.
function findLinks(text: string): string[] {
  const t = normalise(text).replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/g, ' ').replace(/\s+dot\s+/g, '.').replace(/\s+slash\s+/g, '/');
  const out: string[] = [];
  for (const m of t.matchAll(re(RULES.links.pattern, '', 'giu'))) {
    const host = m[0].replace(/^https?:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '').replace(/\.$/, '');
    // A decimal or an abbreviation with a dot ("rs.500", "e.g.") never reaches here: the pattern needs a TLD.
    out.push(host);
  }
  return out;
}
function hostVerified(host: string, verified: string[]): boolean {
  if (RULES.lint['T-L4'].shorteners.some(s => host === s || host.endsWith('.' + s))) return false;
  return verified.some(d => {
    const v = d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    return v.length > 0 && (host === v || host.endsWith('.' + v));
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Caller signals

export interface CallerSignals {
  crisis: boolean;                     // self-harm or danger language -> RD3
  asksIfAi: boolean;                   // "aap AI ho?" -> honest answer (RD2)
  refusesRecording: boolean;           // "record mat karo" -> RD10
  optOut: boolean;                     // "call mat karna" -> suppression (A3 contact.suppress_after_opt_out)
  readingSensitiveDigits: boolean;     // OTP / card / PIN digits -> stop kindly and redact (RD4)
  wantsHuman: boolean;
}

/** Read one caller utterance (transcript text) for signals the runtime must act on. */
export function callerSignals(text: string): CallerSignals {
  const s: CallerSignals = { crisis: false, asksIfAi: false, refusesRecording: false, optOut: false, readingSensitiveDigits: false, wantsHuman: false };
  const t = normalise(text);
  if (!t) return s;
  for (const r of RULES.caller) {
    if (s[r.signal]) continue;
    if (r.builtin === 'sensitive_digits') s[r.signal] = sensitiveDigits(text, t, r);
    else s[r.signal] = fires(r, t);
  }
  return s;
}

function sensitiveDigits(raw: string, _t: string, r: CallerRule): boolean {
  const lower = raw.toLowerCase();
  for (const run of digitRuns(raw)) {
    const n = run.digits.length;
    // Context and exemptions are read next to this run only, so a pin code elsewhere in the line cannot hide a PIN.
    const local = normalise(localPrefix(lower, run.start) + lower.slice(run.start, Math.min(lower.length, run.end + 25)));
    if (r.none?.some(p => re(p).test(local))) continue;
    if (r.context && n >= 3 && re(r.context).test(normalise(localPrefix(lower, run.start, 60) + ' ' + lower.slice(run.end, run.end + 25)))) return true;
    if (n >= 12 && !looksLikePhone(run.digits)) return true;
    if (n >= 13 && n <= 19 && luhn(run.digits)) return true;
  }
  return false;
}

/** +91 / 0 prefixed Indian mobile written as one run. */
const looksLikePhone = (d: string) => (d.length === 12 && /^91[6-9]/.test(d)) || (d.length === 11 && /^0[6-9]/.test(d));

// ---------------------------------------------------------------------------------------------------------------
// Redaction

interface Run { start: number; end: number; digits: string }

let runRe: RegExp | null = null;
/** Digit runs in the ORIGINAL text (indexes preserved). Spoken digit words count as digits. */
function digitRuns(text: string): Run[] {
  if (!runRe) {
    const keys = Object.keys(RULES.redact.words_to_digits).sort((a, b) => b.length - a.length);
    const latin = keys.filter(k => /^[a-z]+$/.test(k)).join('|');
    const deva = keys.filter(k => !/^[a-z]+$/.test(k)).join('|');
    // \b only knows Latin letters, so Devanagari number words get explicit script lookarounds.
    const tok = `(?:[0-9\\u0966-\\u096F]|\\b(?:${latin})\\b|(?<![\\u0900-\\u0963\\u0970-\\u097F])(?:${deva})(?![\\u0900-\\u0963\\u0970-\\u097F]))`;
    runRe = new RegExp(`${tok}(?:[\\s\\-\\u2013.,]{0,3}${tok})*`, 'giu');
  }
  const out: Run[] = [];
  for (const m of text.matchAll(runRe)) {
    const digits = (m[0].toLowerCase().match(/[0-9०-९]|[a-z]+|[ऀ-ॣ॰-ॿ]+/gu) ?? [])
      .map(x => /[0-9]/.test(x) ? x : /[०-९]/.test(x) ? String(x.charCodeAt(0) - 0x0966) : RULES.redact.words_to_digits[x] ?? '')
      .join('');
    // A run made only of number words needs 3+ of them, or ordinary speech ("ek do din") turns into digits.
    if (!/[0-9०-९]/.test(m[0]) && digits.length < 3) continue;
    out.push({ start: m.index!, end: m.index! + m[0].length, digits });
  }
  return out;
}

const notSecretCode = () => re((RULES.redact as unknown as { not_secret_code: string }).not_secret_code);

/** Mask spans that must never be stored (OTP, card, CVV, UPI PIN, full Aadhaar). */
export function redact(text: string): string {
  const w = RULES.redact.context_window_chars;
  const lower = text.toLowerCase();
  const spans: { start: number; end: number; mask: string }[] = [];
  for (const run of digitRuns(text)) {
    const n = run.digits.length;
    const near = localPrefix(lower, run.start, w) + lower.slice(run.start, Math.min(lower.length, run.end + w));
    const before = localPrefix(lower, run.start, 20);
    let kind: keyof Rules['masks'] | null = null;
    for (const k of RULES.redact.kinds) {
      if (n < k.minDigits || n > k.maxDigits) continue;
      if ((k.kind === 'otp' || k.kind === 'upi_pin') && notSecretCode().test(before)) continue;
      if (re(k.context).test(near)) { kind = k.kind; break; }
    }
    if (!kind && n >= 13 && n <= 19 && luhn(run.digits)) kind = 'card';
    if (!kind && n === 12 && !looksLikePhone(run.digits) && /^[2-9]/.test(run.digits) && verhoeff(run.digits)) kind = 'aadhaar';
    if (kind) spans.push({ start: run.start, end: run.end, mask: RULES.masks[kind] });
  }
  let out = text;
  for (const s of spans.sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.mask + out.slice(s.end);
  return out;
}

export function luhn(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
/** Verhoeff check (the Aadhaar check digit is the last digit). */
export function verhoeff(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = VD[c][VP[i % 8][rev[i]]];
  return c === 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Compile lints

export interface LintFinding { rule: 'T-L1' | 'T-L2' | 'T-L3' | 'T-L4'; path: string; message: string; effect: 'refuse' | 'drop' }

const SKIP_PATHS = new Set(['agentId', 'versionHash', 'voice.stackId', 'voice.voiceId']);

function* strings(v: unknown, path: string): Generator<[string, string]> {
  if (typeof v === 'string') { if (!SKIP_PATHS.has(path)) yield [path, v]; return; }
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    const p = path ? `${path}.${k}` : k;
    if (p === 'brand.verifiedDomains') continue;
    yield* strings(x, p);
  }
}

/** Lint an agent config on every creation path (form, chat, API, import, learning proposal). A 'refuse' blocks
 *  publishing; a 'drop' removes the offending fact from the compiled brief. */
export function lintAgentConfig(cfg: AgentConfig): LintFinding[] {
  const out: LintFinding[] = [];
  const L = RULES.lint;

  // T-L1: no text anywhere may tell her to claim to be human, hide being an AI, or deny it.
  for (const [path, s] of strings(cfg, '')) {
    const t = normalise(s);
    if (path.startsWith('neverSay')) {
      if (re(L['T-L1'].never_say_hides_ai).test(t)) out.push({ rule: 'T-L1', path, message: 'neverSay would stop her saying she is an AI', effect: 'refuse' });
      continue;
    }
    if (fires(L['T-L1'], t)) out.push({ rule: 'T-L1', path, message: 'tells the agent to claim to be human or hide being an AI', effect: 'refuse' });
  }
  const clause = cfg.opening?.disclosureClause ?? '';
  if (!re(L['T-L1'].disclosure_clause_requires).test(normalise(clause)))
    out.push({ rule: 'T-L1', path: 'opening.disclosureClause', message: 'the disclosure clause must say she is an AI', effect: 'refuse' });

  // T-L2 / T-L3: facts that do not belong on this call category are dropped from the brief.
  const offerish = re(L['T-L3'].offerLanguage);
  (cfg.facts ?? []).forEach((f, i) => {
    const path = `facts[${i}]`;
    if (L['T-L2'].categories.includes(cfg.category) && L['T-L2'].dropPurposes.includes(f.purpose)) {
      out.push({ rule: 'T-L2', path, message: `offer fact "${f.key}" dropped from a ${cfg.category} brief`, effect: 'drop' });
      return;
    }
    const allowed = L['T-L3'].allowedPurposes[cfg.category] ?? [];
    if (!allowed.includes(f.purpose)) {
      out.push({ rule: 'T-L3', path, message: `fact "${f.key}" is for ${f.purpose}, not a ${cfg.category} call`, effect: 'drop' });
      return;
    }
    if (L['T-L2'].categories.includes(cfg.category) && f.purpose !== 'offer' && offerish.test(normalise(`${f.key.replace(/_/g, ' ')} ${f.value}`)))
      out.push({ rule: 'T-L3', path, message: `fact "${f.key}" reads as an offer but is tagged ${f.purpose}`, effect: 'drop' });
  });

  // T-L4: every link must sit on a verified domain of the brand (shorteners never do).
  const verified = cfg.brand?.verifiedDomains ?? [];
  for (const [path, s] of strings(cfg, '')) for (const host of findLinks(s)) {
    if (!hostVerified(host, verified)) out.push({ rule: 'T-L4', path, message: `link to ${host} is not on a verified domain`, effect: 'refuse' });
  }
  verified.forEach((d, i) => {
    if (L['T-L4'].shorteners.some(s => d.toLowerCase() === s)) out.push({ rule: 'T-L4', path: `brand.verifiedDomains[${i}]`, message: `${d} is a link shortener, not a brand domain`, effect: 'refuse' });
  });
  return out;
}

/** The facts that survive the lints (what the compiled brief may carry). */
export function lintedFacts(cfg: AgentConfig, findings = lintAgentConfig(cfg)): Fact[] {
  const dropped = new Set(findings.filter(f => f.effect === 'drop').map(f => f.path));
  return cfg.facts.filter((_, i) => !dropped.has(`facts[${i}]`));
}

/** The rule list and counts, for the safety.cases read tool and the UI. */
export function rulesSummary() {
  return {
    version: RULES.version,
    reply: RULES.reply.map(r => ({ id: r.id, rule: r.rule, kind: r.kind, action: r.action, reason: r.reason, scope: r.scope ?? null })),
    caller: RULES.caller.map(r => ({ id: r.id, signal: r.signal })),
    redact: RULES.redact.kinds.map(k => k.kind),
    lint: ['T-L1', 'T-L2', 'T-L3', 'T-L4'] as const,
  };
}
