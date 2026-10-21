// Memory write gates: pure code, no model. A proposed fact becomes memory only if every gate passes;
// each drop is counted by reason so the "Memory from this call" panel can say what was refused and why.
// Inherited laws: a model never grades (the gates are code); a quote must be the caller's own words.

export const KINDS = ['preference', 'commitment', 'context', 'objection'] as const;
export type Kind = (typeof KINDS)[number];

/** Closed vocabulary. A key that is not here cannot be written, whatever the model says. */
export const KEYS: Record<Kind, readonly string[]> = {
  preference: ['language', 'script', 'address', 'name_to_use', 'pace', 'best_time', 'channel', 'brevity'],
  commitment: ['callback', 'pay_by', 'send_info', 'visit', 'decide_by'],
  context: ['work_hours', 'relocation', 'life_event', 'already_has', 'decision_maker'],
  objection: ['price', 'trust', 'timing', 'need', 'competitor', 'process'],
};

/** Purpose families match TRAI call categories: service memory never feeds a promotional call. */
export const PURPOSES = ['service', 'transactional', 'promotional'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const BASES = ['contract', 'consent', 'legitimate_use', 'legal_obligation'] as const;
export type Basis = (typeof BASES)[number];

export const RETENTIONS = ['ephemeral', 'call_to_call', 'durable'] as const;
export type Retention = (typeof RETENTIONS)[number];
export const RETENTION_DAYS: Record<Exclude<Retention, 'ephemeral'>, number> = { call_to_call: 30, durable: 365 };

export const REFUSED = ['health', 'religion', 'caste', 'politics', 'sex_life', 'biometrics', 'financial_account', 'children'] as const;
export type Refused = (typeof REFUSED)[number];

/** Self subjects: the person is the authority on themselves (blueprint §2). */
export const AUTHORITY = { caller: 100, operator: 60, upload: 50, observed: 30 } as const;
export type Source = keyof typeof AUTHORITY;

/** Review tier: unused until a person approves it. Everything else is auto, usable after the undo window. */
export function writeTier(kind: Kind): 'auto' | 'review' {
  return kind === 'commitment' ? 'review' : 'auto';
}

// Detectors run on quote AND value, so a model that forgets to label a category cannot slip one through.
// Hindi, Hinglish and English, Latin and Devanagari. Word-bounded where a short stem would over-match.
const DETECT: Record<Refused, RegExp> = {
  health: /\b(hospital|doctor|daktar|bimari|beemari|bimaar|beemar|ill(ness)?|sick|disease|diabet\w*|sugar ki|bp ki|cancer|surgery|operation|pregnan\w*|medicine|dawai|dawa|therapy|depress\w*|anxiety|covid|tablet)\b|अस्पताल|बीमार|डॉक्टर|दवा|इलाज/i,
  religion: /\b(hindu|muslim|musalman|sikh|christian|isai|jain|buddhist|parsi|mandir|masjid|church|gurudwara|namaz|puja|pooja|roza|religion|dharam|dharm|mazhab)\b|धर्म|मंदिर|मस्जिद|मुसलमान/i,
  caste: /\b(caste|jaati|jati|brahmin|dalit|obc|sc\/st|scheduled caste|kshatriya|vaishya|shudra|yadav|baniya)\b|जाति|ब्राह्मण|दलित/i,
  politics: /\b(bjp|congress|aap party|party ko vote|vote (diya|denge|karunga)|election|chunav|modi|rahul gandhi|politic\w*|neta)\b|चुनाव|वोट/i,
  sex_life: /\b(sex\w*|girlfriend|boyfriend|affair|gay|lesbian|lgbt\w*|dating)\b/i,
  biometrics: /\b(fingerprint|thumb ?print|face ?id|iris|retina|biometric\w*|voice ?print|angootha)\b/i,
  financial_account: /\b(account (number|no)|a\/c|ifsc|card (number|no)|cvv|otp|upi pin|atm pin|aadhaa?r|pan (card|number|no))\b|\d(?:\s?\d){8,}|आधार|खाता संख्या/i,
  children: /\b(beta|beti|bete|bachch?[aeo]|bachche|bachhe|kids?|child(ren)?|son|daughter|school|baby|munna|munni)\b|बच्च|बेटा|बेटी/i,
};

export function detectRefused(...texts: string[]): Refused[] {
  const hit = new Set<Refused>();
  for (const t of texts) for (const c of REFUSED) if (DETECT[c].test(t)) hit.add(c);
  return [...hit];
}

// Memory-poisoning fence: a value that reads like an instruction to the agent is never stored.
const INSTRUCTION = /\b(ignore|disregard|instruction|system prompt|prompt|assistant|you (must|should|are)|always|never|pretend|forget (all|previous|everything)|say that|tell (him|her|them|the caller))\b|[<>{}\[\]`]|\n/i;
export const VALUE_MAX = 60;

/** Typed, short, and not instruction-shaped. */
export function valueOk(v: string): boolean {
  return Boolean(v) && v.length <= VALUE_MAX && !INSTRUCTION.test(v);
}

export interface Proposed {
  kind: string; key: string; value: string; quote: string;
  purpose?: string; basis?: string; retention?: string; category?: string;
}

export type Drop =
  | 'bad_shape' | 'bad_kind' | 'bad_key' | 'value_lint' | 'quote_not_caller'
  | 'purpose_mismatch' | 'no_basis' | 'no_consent' | 'refused_category' | 'ephemeral';

export interface Accepted {
  kind: Kind; key: string; value: string; quote: string; quoteAt: number;
  purpose: Purpose; basis: Basis; retention: Exclude<Retention, 'ephemeral'>; category: Refused | null; tier: 'auto' | 'review';
}

export interface GateCtx {
  callerTurns: string[];                       // caller turns of the transcript of record, in order
  purpose: Purpose;                            // the call's purpose family
  allowedCategories: Record<string, string>;   // workspace policy: {category: basis}
  hasConsent: boolean;                         // a granted consent_record exists for this contact and purpose
}

/** Where in the caller's speech the quote sits (turn index * 1e6 + offset), or -1 if it is not an exact substring. */
export function quotePosition(quote: string, callerTurns: string[]): number {
  if (quote.trim().length < 3) return -1;
  for (let i = 0; i < callerTurns.length; i++) {
    const at = callerTurns[i].indexOf(quote);
    if (at >= 0) return i * 1_000_000 + at;
  }
  return -1;
}

export function gate(p: unknown, g: GateCtx): { ok: true; fact: Accepted } | { ok: false; drop: Drop } {
  if (!p || typeof p !== 'object') return { ok: false, drop: 'bad_shape' };
  const f = p as Record<string, unknown>;
  for (const k of ['kind', 'key', 'value', 'quote'] as const) if (typeof f[k] !== 'string') return { ok: false, drop: 'bad_shape' };
  const kind = f.kind as string, key = f.key as string, value = (f.value as string).trim(), quote = f.quote as string;
  if (!(KINDS as readonly string[]).includes(kind)) return { ok: false, drop: 'bad_kind' };
  if (!KEYS[kind as Kind].includes(key)) return { ok: false, drop: 'bad_key' };
  if (!valueOk(value)) return { ok: false, drop: 'value_lint' };

  const quoteAt = quotePosition(quote, g.callerTurns);
  if (quoteAt < 0) return { ok: false, drop: 'quote_not_caller' };

  const purpose = f.purpose === undefined ? g.purpose : f.purpose;
  if (purpose !== g.purpose) return { ok: false, drop: 'purpose_mismatch' };
  const basis = f.basis as string | undefined;
  if (!basis || !(BASES as readonly string[]).includes(basis)) return { ok: false, drop: 'no_basis' };
  if (basis === 'consent' && !g.hasConsent) return { ok: false, drop: 'no_consent' };

  const retention = (f.retention ?? 'call_to_call') as string;
  if (!(RETENTIONS as readonly string[]).includes(retention)) return { ok: false, drop: 'bad_shape' };
  if (retention === 'ephemeral') return { ok: false, drop: 'ephemeral' };   // data minimisation: this call only, never stored

  // Refused categories: the model's label OR the code's detector. Each one found must be explicitly allowed by
  // the workspace policy, and the fact must carry the very basis the policy names for it.
  const labelled = typeof f.category === 'string' && (REFUSED as readonly string[]).includes(f.category) ? [f.category as Refused] : [];
  const found = [...new Set([...labelled, ...detectRefused(quote, value)])];
  for (const c of found) if (g.allowedCategories[c] !== basis) return { ok: false, drop: 'refused_category' };

  return { ok: true, fact: { kind: kind as Kind, key, value, quote, quoteAt, purpose: purpose as Purpose, basis: basis as Basis,
    retention: retention as Accepted['retention'], category: found[0] ?? null, tier: writeTier(kind as Kind) } };
}
