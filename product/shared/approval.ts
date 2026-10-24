// Who may do what without asking. VP's agents act only through tools; each tool has a risk class.
// Autonomy: A1 drafts and tests inside a budget; A2 needs a human approval bound to the exact args;
// A3 may act at once, but only from a closed list of risk-LOWERING verbs. This lives in code, never
// in a prompt, so no agent can talk its way past it.
import { createHash } from 'node:crypto';

export const RISK_CLASSES = ['read', 'draft', 'test', 'external', 'spend', 'destructive', 'policy'] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

export const ROLES = ['owner', 'builder', 'operator', 'compliance', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Risk classes that always need a human tap (A2). Everything else runs at A1 inside a test budget. */
const NEEDS_HUMAN: ReadonlySet<RiskClass> = new Set(['external', 'spend', 'destructive', 'policy']);

export function needsHumanApproval(risk: RiskClass): boolean {
  return NEEDS_HUMAN.has(risk);
}

/** The closed list of A3 verbs: actions VP may take on its own because they only lower risk or spend. */
export const A3_VERBS = [
  'campaign.pause',
  'campaign.stop',
  'contact.suppress_after_opt_out',
  'contact.suppress',                 // a person saying "stop calling this one" never waits for a card
  'call.end_runaway',
  'campaign.stop_at_cap',
  'number.pause_flagged',
  'attempt.retry_per_ladder',
  'deployment.revert_to_last_good',
] as const;
export type A3Verb = (typeof A3_VERBS)[number];

export function isA3(verb: string): verb is A3Verb {
  return (A3_VERBS as readonly string[]).includes(verb);
}

/** Which roles may approve each risk class. Viewers approve nothing. */
const APPROVERS: Record<RiskClass, readonly Role[]> = {
  read: ['owner', 'builder', 'operator', 'compliance', 'viewer'],
  draft: ['owner', 'builder', 'operator'],
  test: ['owner', 'builder', 'operator'],
  external: ['owner', 'builder', 'operator'],
  spend: ['owner'],
  destructive: ['owner'],
  policy: ['owner', 'compliance'],
};

export function canApprove(role: Role, risk: RiskClass): boolean {
  return APPROVERS[risk].includes(role);
}

/** Stable JSON: object keys sorted at every depth, so equal args always hash equal. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}';
}

export function argsHash(tool: string, args: unknown): string {
  return createHash('sha256').update(tool + '\n' + canonicalJson(args)).digest('hex');
}

export interface ApprovalCheck {
  tool: string;
  args: unknown;
  risk: RiskClass;
  approver?: { role: Role };
  tokenArgsHash?: string;      // the hash the approval token was minted against
}

export type ApprovalVerdict = { allowed: true; mode: 'A1' | 'A2' } | { allowed: false; reason: string };

/** Decide whether an action may execute now. A2 requires a matching token from a role allowed to approve. */
export function authorise(c: ApprovalCheck): ApprovalVerdict {
  if (!needsHumanApproval(c.risk)) return { allowed: true, mode: 'A1' };
  if (!c.approver) return { allowed: false, reason: `${c.tool} reaches people, spends, deletes or changes policy: it needs your approval` };
  if (!canApprove(c.approver.role, c.risk)) return { allowed: false, reason: `a ${c.approver.role} cannot approve ${c.risk} actions` };
  if (!c.tokenArgsHash) return { allowed: false, reason: 'no approval token for this action' };
  if (c.tokenArgsHash !== argsHash(c.tool, c.args)) return { allowed: false, reason: 'the action changed after it was approved; approve it again' };
  return { allowed: true, mode: 'A2' };
}
