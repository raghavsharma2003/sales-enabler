// The strict AgentConfig validator: every creation path (template, plain words, brief.edit, publish) goes through it,
// so a stored draft can never hold a field the compiler does not know. Unknown fields fail with their path.
import { createHash } from 'node:crypto';
import { canonicalJson, RISK_CLASSES } from '../../../shared/approval.ts';
import { CALL_CATEGORIES, JOBS, LANGUAGES, SECTOR_PACKS, type AgentConfig } from '../../../shared/agent-config.ts';
import { arr, bool, num, obj, opt, record, str, any, ValidationError, type Validator } from '../../../shared/validate.ts';

const id = str({ min: 1, max: 60, pattern: /^[a-z][a-z0-9_]*$/ });
const shape = (max = 300) => str({ min: 1, max });

const HANDOFF_WHEN = ['asks_for_human', 'crisis', 'complaint', 'legal_threat', 'out_of_scope', 'payment_dispute', 'repeated_misunderstanding'] as const;

const lit = <T extends number>(vals: readonly T[]): Validator<T> => Object.assign((v: unknown, p = '') => {
  if (!vals.includes(v as T)) throw new ValidationError(p, `must be one of: ${vals.join(', ')}`);
  return v as T;
}, { schema: { enum: [...vals] } });

export const agentConfigV = obj({
  schema: lit([1] as const),
  agentId: str({ max: 40 }),
  version: num({ int: true, min: 0 }),
  versionHash: str({ max: 64 }),
  brand: obj({ name: str({ min: 1, max: 80 }), spokenName: str({ min: 1, max: 80 }), verifiedDomains: arr(str({ max: 120 }), { max: 10 }) }),
  job: str({ oneOf: JOBS }),
  jobDescription: opt(shape(600)),
  category: str({ oneOf: CALL_CATEGORIES }),
  sectorPacks: arr(str({ oneOf: SECTOR_PACKS }), { max: 4 }),
  languages: obj({ primary: str({ oneOf: LANGUAGES }), allowed: arr(str({ oneOf: LANGUAGES }), { min: 1, max: 6 }), mirrorCaller: bool() }),
  persona: obj({
    name: str({ min: 1, max: 40 }),
    gender: str({ oneOf: ['female', 'male', 'neutral'] }),
    register: str({ oneOf: ['warm_peer', 'polite_professional', 'crisp_efficient', 'gentle_elder_respect'] }),
    energy: lit([1, 2, 3, 4, 5] as const),
    humour: lit([0, 1, 2] as const),
    honorific: str({ oneOf: ['aap', 'tum', 'mirror'] }),
    notes: arr(shape(200), { max: 8 }),
  }),
  goals: arr(obj({ id, description: shape(300), outcome: id, required: bool() }), { min: 1, max: 5 }),
  facts: arr(obj({
    key: id, value: str({ min: 1, max: 300 }),
    purpose: str({ oneOf: ['service', 'offer', 'identity', 'logistics'] }),
    source: str({ min: 1, max: 120 }), perContact: opt(bool()),
  }), { max: 40 }),
  neverSay: arr(str({ min: 1, max: 120 }), { max: 20 }),
  opening: obj({ disclosureClause: shape(200), usefulFirst: shape(300) }),
  objections: arr(obj({ trigger: shape(120), approach: shape(300) }), { max: 10 }),
  tools: arr(obj({ name: id, risk: str({ oneOf: RISK_CLASSES }), config: opt(record(any())) }), { max: 12 }),
  handOff: obj({
    when: arr(str({ oneOf: HANDOFF_WHEN }), { max: HANDOFF_WHEN.length }),
    target: obj({ kind: str({ oneOf: ['phone', 'queue', 'callback'] }), value: opt(str({ max: 40 })) }),
    warmSummary: bool(),
  }),
  memory: obj({ read: bool(), write: bool(), briefMaxBytes: lit([1200] as const) }),
  limits: obj({ maxDurationS: num({ int: true, min: 30, max: 1800 }), maxSilenceS: num({ int: true, min: 3, max: 60 }), maxTurns: num({ int: true, min: 4, max: 200 }) }),
  // stackId '' in a draft means "not chosen" (older drafts). New drafts start on DEFAULT_STACK_ID. Publishing requires a
  // stack resolveStack() accepts: a curated id, or 'custom' with its parts.
  voice: obj({ stackId: str({ max: 60 }), components: opt(obj({ ears: opt(str({ max: 60 })), brain: opt(str({ max: 60 })), voice: opt(str({ max: 60 })),
    s2s: opt(str({ max: 60 })), gatedEars: opt(bool()) })), voiceId: opt(str({ max: 80 })), speed: opt(num({ min: 0.7, max: 1.3 })) }),
  recording: obj({ enabled: bool(), announce: bool() }),
}) as unknown as Validator<AgentConfig>;

/** Validate and add the cross-field rules the plain shape cannot express. */
export function validateConfig(raw: unknown): AgentConfig {
  const c = agentConfigV(raw);
  if (c.job === 'custom' && !c.jobDescription) throw new ValidationError('jobDescription', "is required when job is 'custom'");
  if (!c.languages.allowed.includes(c.languages.primary)) throw new ValidationError('languages.allowed', 'must include the primary language');
  const keys = new Set<string>();
  for (const [i, f] of c.facts.entries()) {
    if (keys.has(f.key)) throw new ValidationError(`facts[${i}].key`, `"${f.key}" appears twice`);
    keys.add(f.key);
  }
  const goals = new Set<string>();
  for (const [i, g] of c.goals.entries()) {
    if (goals.has(g.id)) throw new ValidationError(`goals[${i}].id`, `"${g.id}" appears twice`);
    goals.add(g.id);
  }
  if (!c.goals.some(g => g.required)) throw new ValidationError('goals', 'at least one goal must be required');
  if (c.handOff.target.kind === 'phone' && !/^\+[1-9]\d{7,14}$/.test(c.handOff.target.value ?? '')) throw new ValidationError('handOff.target.value', 'a phone hand-off needs an E.164 number the workspace owns');
  if (c.recording.enabled && !c.recording.announce) throw new ValidationError('recording.announce', 'a recorded call must announce the recording');
  return c;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** The draft's identity: what an approval card is bound to. Version bookkeeping is excluded so it names content only. */
export function draftHash(c: AgentConfig): string {
  const { version: _v, versionHash: _h, ...rest } = c;
  return sha(canonicalJson(rest));
}

/** The published version's hash (AgentConfig.versionHash): the canonical config minus this field. */
export function versionHashOf(c: AgentConfig): string {
  const { versionHash: _h, ...rest } = c;
  return sha(canonicalJson(rest));
}
