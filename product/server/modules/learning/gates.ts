// What a learning proposal may change, how a change is applied, and the gates it must pass (throw, never warn).
// A learned change only ever touches an editable component: the opening's useful-first shape, objection approaches,
// goal descriptions (brief sections), persona notes, the ORDER of facts, tool guidance, and timing limits. Everything
// else — disclosure, facts' content, identity, hand-off, recording, never-say, voice, tools granted — is locked and
// checked as an empty diff on the resolved config, not trusted from the op list (blueprint learning.md §3.5).
import { canonicalJson } from '../../../shared/approval.ts';
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { lintAgentConfig, replyDoor, type DoorContext } from '../../../shared/safety/index.ts';

export const PROPOSAL_KINDS = ['opening', 'brief_section', 'objection', 'facts_order', 'tool_guidance', 'timing'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export type ChangeOp =
  | { op: 'set'; path: string; value: unknown }
  | { op: 'reorder_facts'; order: string[] };

const EDITABLE: { re: RegExp; check(v: unknown): string | null }[] = [
  { re: /^opening\.usefulFirst$/, check: v => text(v) },
  { re: /^objections$/, check: v => Array.isArray(v) && v.length <= 20 && v.every(o => o && typeof o === 'object' && Object.keys(o).sort().join() === 'approach,trigger' && !text((o as any).trigger) && !text((o as any).approach)) ? null : 'objections must be up to 20 {trigger, approach} notes' },
  { re: /^objections\.\d+\.approach$/, check: v => text(v) },
  { re: /^goals\.\d+\.description$/, check: v => text(v) },
  { re: /^persona\.notes$/, check: v => Array.isArray(v) && v.length <= 8 && v.every(n => !text(n)) ? null : 'persona notes must be up to 8 short strings' },
  { re: /^tools\.\d+\.config\.guidance$/, check: v => text(v) },
  { re: /^limits\.maxSilenceS$/, check: v => int(v, 2, 30) },
  { re: /^limits\.maxTurns$/, check: v => int(v, 4, 200) },
];

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 400 ? null : 'must be a non-empty string of at most 400 characters';
}
function int(v: unknown, lo: number, hi: number): string | null {
  return Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? null : `must be a whole number from ${lo} to ${hi}`;
}

export function isEditablePath(path: string): boolean { return EDITABLE.some(e => e.re.test(path)); }

/** Parse the model's op list. Unknown shapes throw; locked paths are reported by the gates, not silently dropped. */
export function parseOps(raw: unknown): ChangeOp[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) throw new Error('change must be a list of 1-12 operations');
  return raw.map((o: any) => {
    if (o?.op === 'set' && typeof o.path === 'string' && 'value' in o) return { op: 'set', path: o.path, value: o.value };
    if (o?.op === 'reorder_facts' && Array.isArray(o.order) && o.order.every((k: unknown) => typeof k === 'string')) return { op: 'reorder_facts', order: o.order };
    throw new Error('each operation is {op:"set", path, value} or {op:"reorder_facts", order:[fact keys]}');
  });
}

/** Apply ops to a deep copy of the config. Throws on a path that does not exist. Does not judge lockedness. */
export function applyOps(base: AgentConfig, ops: ChangeOp[]): AgentConfig {
  const cfg = structuredClone(base) as any;
  for (const op of ops) {
    if (op.op === 'reorder_facts') {
      const keys = cfg.facts.map((f: { key: string }) => f.key);
      if (op.order.length !== keys.length || [...op.order].sort().join('\u0000') !== [...keys].sort().join('\u0000'))
        throw new Error('reorder_facts must list every existing fact key exactly once');
      cfg.facts = op.order.map(k => cfg.facts.find((f: { key: string }) => f.key === k));
      continue;
    }
    const parts = op.path.split('.');
    let node = cfg;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      if (node[p] === undefined && p === 'config' && i === parts.length - 2) node[p] = {};
      node = node[p];
      if (node === null || typeof node !== 'object') throw new Error(`path ${op.path} does not exist on this agent`);
    }
    const last = parts[parts.length - 1]!;
    if (Array.isArray(node) && !(Number(last) < node.length)) throw new Error(`path ${op.path} does not exist on this agent`);
    node[last] = structuredClone(op.value);
  }
  return cfg as AgentConfig;
}

/** Everything a proposal may not touch, as one canonical string. Facts compare as a set (order is editable). */
function lockedView(cfg: AgentConfig): string {
  const c = structuredClone(cfg) as any;
  delete c.version; delete c.versionHash;
  if (c.opening) delete c.opening.usefulFirst;
  delete c.objections;
  for (const g of c.goals ?? []) delete g.description;
  if (c.persona) delete c.persona.notes;
  for (const t of c.tools ?? []) if (t.config) { delete t.config.guidance; if (!Object.keys(t.config).length) delete t.config; }
  if (c.limits) { delete c.limits.maxSilenceS; delete c.limits.maxTurns; }
  c.facts = [...(c.facts ?? [])].sort((a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key));
  return canonicalJson(c);
}

export interface GateResult { passed: boolean; failures: { gate: string; detail: string }[]; checked: string[] }

const MANIPULATION: [RegExp, string][] = [
  [/\b(last chance|only today|today only|limited time|offer ends|hurry|act now|before it'?s too late)\b/i, 'urgency or scarcity'],
  [/\b(sirf aaj|aaj hi|abhi nahi to|warna|jaldi karo|baad mein pachtaoge|mauka nikal)\b/i, 'urgency or scarcity (Hinglish)'],
  [/\b(legal action|police|court|arrest|blacklist|jail|case file)\b/i, 'fear or threat'],
  [/\b(everyone (else )?(has|is)|sab log|all your neighbours|aapke sab dost)\b/i, 'false social proof'],
  [/\b(you will regret|shame|disappoint(ed)? your family|guilt)\b/i, 'guilt'],
  [/\b(government (says|mandates)|rbi (says|orders)|official order)\b/i, 'false authority'],
];

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const URLISH = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|org|net|co\.in|io)\b/gi;

/** All string leaves a set of ops writes. */
export function changedStrings(ops: ChangeOp[]): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') out.push({ path: p, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}.${i}`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
  };
  for (const op of ops) if (op.op === 'set') walk(op.value, op.path);
  return out;
}

export function doorContext(cfg: AgentConfig): DoorContext {
  return {
    category: cfg.category, sectorPacks: cfg.sectorPacks, brand: { name: cfg.brand.name, verifiedDomains: cfg.brand.verifiedDomains },
    facts: cfg.facts, neverSay: cfg.neverSay, disclosed: true, identityVerified: false, recordingRefused: false, crisis: false, turnIndex: 1,
  };
}

/** Run every gate on a proposal. Gates never warn: any failure blocks it. */
export function runGates(base: AgentConfig, ops: ChangeOp[]): GateResult & { proposed?: AgentConfig } {
  const failures: GateResult['failures'] = [];
  const checked = ['editable_paths', 'apply', 'locked_sections', 'provenance', 'manipulation', 'never_say', 'safety_lint', 'reply_door'];
  for (const op of ops) {
    if (op.op !== 'set') continue;
    const rule = EDITABLE.find(e => e.re.test(op.path));
    if (!rule) { failures.push({ gate: 'editable_paths', detail: `${op.path} is locked; learning may not change it` }); continue; }
    const bad = rule.check(op.value);
    if (bad) failures.push({ gate: 'editable_paths', detail: `${op.path} ${bad}` });
  }
  if (failures.length) return { passed: false, failures, checked };

  let proposed: AgentConfig;
  try { proposed = applyOps(base, ops); } catch (e) {
    return { passed: false, failures: [{ gate: 'apply', detail: e instanceof Error ? e.message : String(e) }], checked };
  }
  if (lockedView(base) !== lockedView(proposed)) failures.push({ gate: 'locked_sections', detail: 'the change alters a locked part of the agent' });

  const factText = base.facts.map(f => f.value).join(' ').replace(/,/g, '');
  const allowedDomains = base.brand.verifiedDomains.map(d => d.toLowerCase());
  for (const s of changedStrings(ops)) {
    for (const n of s.text.match(NUMBER) ?? []) {
      if (!factText.includes(n.replace(/,/g, ''))) failures.push({ gate: 'provenance', detail: `"${n}" in ${s.path} is not one of the business's facts` });
    }
    for (const u of s.text.match(URLISH) ?? []) {
      if (!allowedDomains.some(d => u.toLowerCase().includes(d))) failures.push({ gate: 'provenance', detail: `"${u}" in ${s.path} is not a verified domain` });
    }
    if (/[₹%]|\brs\.?\s/i.test(s.text) && !(s.text.match(NUMBER) ?? []).length) failures.push({ gate: 'provenance', detail: `${s.path} names money or a percentage without a fact` });
    for (const [re, why] of MANIPULATION) if (re.test(s.text)) failures.push({ gate: 'manipulation', detail: `${s.path}: ${why}` });
    for (const ns of base.neverSay) if (ns && s.text.toLowerCase().includes(ns.toLowerCase())) failures.push({ gate: 'never_say', detail: `${s.path} uses "${ns}"` });
  }

  for (const f of lintAgentConfig(proposed)) if (f.effect === 'refuse') failures.push({ gate: 'safety_lint', detail: `${f.rule} ${f.path}: ${f.message}` });
  const ctx = doorContext(proposed);
  for (const s of changedStrings(ops)) {
    const v = replyDoor(s.text, ctx);
    if (v.action !== 'pass') failures.push({ gate: 'reply_door', detail: `${s.path}: ${v.rule} ${v.reason}` });
  }
  return { passed: failures.length === 0, failures, checked, proposed };
}

/** A change in words, for the page: which part of the agent, what it says now, what it would say. */
export function describeChange(base: AgentConfig | null, ops: ChangeOp[]): { part: string; before: string | null; after: string }[] {
  const text = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(x => (typeof x === 'object' && x ? Object.values(x).join(': ') : String(x))).join('; ') : v == null ? '' : String(v));
  const at = (path: string): unknown => path.split('.').reduce<any>((n, k) => (n == null ? undefined : n[k]), base);
  return ops.map(o => {
    if (o.op === 'reorder_facts') return { part: 'The order of the facts she can share', before: base ? base.facts.map(f => f.key.replace(/_/g, ' ')).join(', ') : null, after: o.order.map(k => k.replace(/_/g, ' ')).join(', ') };
    const m = /^(\w+)(?:\.(\d+))?(?:\.(.+))?$/.exec(o.path)!;
    const idx = m[2] !== undefined ? Number(m[2]) : -1;
    const part = o.path === 'opening.usefulFirst' ? 'What she says first, after saying she is an AI assistant'
      : o.path === 'objections' ? 'How she answers objections'
      : m[1] === 'objections' ? `How she answers "${base?.objections[idx]?.trigger ?? 'an objection'}"`
      : m[1] === 'goals' ? 'What counts as done'
      : o.path === 'persona.notes' ? 'Notes on how she speaks'
      : m[1] === 'tools' ? `When she uses ${(base?.tools[idx]?.name ?? 'a tool').replace(/_/g, ' ')}`
      : o.path === 'limits.maxSilenceS' ? 'How long she waits in silence (seconds)'
      : o.path === 'limits.maxTurns' ? 'The most turns in one call'
      : 'Another part of her brief';
    const before = base ? at(o.path) : undefined;
    return { part, before: before === undefined ? null : text(before), after: text(o.value) };
  });
}
