/** Operator settings are deliberately finite; this is not an emotion or voice model. */
export type SpeechDeliveryProfile = {
  version: 1;
  pace: 'standard' | 'unhurried';
  adaptToRequests: boolean;
};

export type SpeechDeliveryDecision = {
  speed: 1 | 0.9;
  pace: 'standard' | 'unhurried';
  basis: 'agent_default' | 'caller_request';
  sourceTurnId?: string;
};

export type SpeechDeliveryEntry = { id: string; role: string; text: string };

export class SpeechDeliveryValidationError extends Error {
  constructor() {
    super('Invalid speech delivery configuration.');
    this.name = 'SpeechDeliveryValidationError';
  }
}

/** Absent stays absent so existing configuration snapshots and hashes do not change. */
export function parseSpeechDeliveryProfile(value: unknown): SpeechDeliveryProfile | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SpeechDeliveryValidationError();
  const profile = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(profile);
  if (keys.length !== 3 || keys.some(key => typeof key !== 'string' || !['version', 'pace', 'adaptToRequests'].includes(key))
    || profile.version !== 1 || !['standard', 'unhurried'].includes(profile.pace as string)
    || typeof profile.adaptToRequests !== 'boolean') throw new SpeechDeliveryValidationError();
  return { version: 1, pace: profile.pace as SpeechDeliveryProfile['pace'], adaptToRequests: profile.adaptToRequests };
}

export const normalizeSpeechDeliveryProfile = parseSpeechDeliveryProfile;

// Match complete direct requests, not a keyword embedded in someone else's story.
// Unknown wording deliberately leaves the previous explicit decision unchanged.
const PREFIX = '(?:(?:please|kindly|can you|could you|would you|will you|i want you to|i need you to|i would like you to|aap|tum|आप|तुम|कृपया|kripya|zara|ज़रा|जरा)\\s+)*';
const SUFFIX = '(?:\\s+(?:please|thanks|thank you|a bit|a little|for me|now|again|ab|अब|जी))*';
const SLOW = [
  '(?:speak|talk|read)(?: a (?:bit|little))? (?:slower|slowly|more slowly)',
  'slow down(?: your (?:speech|speaking|voice))?',
  '(?:speak|talk) at (?:a )?slower (?:pace|speed)',
  '(?:thoda |thodi |थोड़ा |थोड़ा |थोड़ी |थोड़ी )?(?:dheere|dhire|dheere dheere|dhire dhire|धीरे|धीरे धीरे|धीमे)(?: se| से)? (?:bolo|boliye|bolna|bol|बोलो|बोलिए|बोलिये|बोलें)',
  '(?:thoda |थोड़ा )?slow(?:ly)? (?:bolo|boliye|बोलो|बोलिए)',
];
const STANDARD = [
  '(?:speak|talk|read) normally',
  '(?:speak|talk|read)(?: at)? (?:the |a |your )?(?:normal|standard|regular)(?: speaking)? (?:pace|speed)',
  '(?:go|switch|return)(?: back)? to (?:the |your )?(?:normal|standard|regular) (?:pace|speed)',
  '(?:normal|standard|regular) (?:pace|speed)',
  '(?:normal|standard)(?: speed| pace)?(?: pe| par| se)? (?:bolo|boliye|बोलो|बोलिए)',
  '(?:सामान्य|नॉर्मल|नार्मल) (?:गति|स्पीड)(?: से| पर| में)? (?:बोलो|बोलिए|बोलिये|बोलें)',
];
const slowRequest = new RegExp(`^${PREFIX}(?:${SLOW.join('|')})${SUFFIX}$`, 'u');
const standardRequest = new RegExp(`^${PREFIX}(?:${STANDARD.join('|')})${SUFFIX}$`, 'u');
// A bounded proof-scenario form: the explicit delivery instruction, never the
// optional self-report, supplies pace authority. Keep the whole utterance bound.
const slowExplanationRequest = new RegExp(
  `^(?:(?:i'm|i’m|i am) feeling overwhelmed\\. )?${PREFIX}explain (?:this|that|it|the next steps?) slowly(?: one point at a time)?${SUFFIX}$`,
  'u',
);

function requestedPace(text: string): SpeechDeliveryProfile['pace'] | undefined {
  if (text.length > 4000) return undefined;
  const normalized = text.normalize('NFKC').toLowerCase().trim().replace(/[.!?।]+$/u, '').replace(/,/gu, ' ').replace(/\s+/gu, ' ').trim();
  // Quote, negation, hypothetical and third-party language cannot match the
  // complete direct-request grammar above. Do not strip them to find keywords.
  if (slowRequest.test(normalized) || slowExplanationRequest.test(normalized)) return 'unhurried';
  if (standardRequest.test(normalized)) return 'standard';
  return undefined;
}

/**
 * Pure replay over the CURRENT ordered, committed final transcript only.
 * The caller owns finality: never supply sidecar/interim/partial transcripts.
 * Recompute after revision/deletion; do not append a cached prior decision.
 */
export function resolveSpeechDelivery(
  profile: SpeechDeliveryProfile | undefined,
  entries: readonly SpeechDeliveryEntry[],
): SpeechDeliveryDecision {
  const parsed = parseSpeechDeliveryProfile(profile);
  const pace = parsed?.pace ?? 'standard';
  let decision: SpeechDeliveryDecision = { speed: pace === 'unhurried' ? 0.9 : 1, pace, basis: 'agent_default' };
  if (!parsed?.adaptToRequests) return decision;
  const lastIndexById = new Map<string, number>();
  entries.forEach((entry, index) => lastIndexById.set(entry.id, index));
  entries.forEach((entry, index) => {
    if (lastIndexById.get(entry.id) !== index || entry.role !== 'user' || typeof entry.id !== 'string' || !entry.id.trim() || typeof entry.text !== 'string') return;
    const requested = requestedPace(entry.text);
    if (requested) decision = { speed: requested === 'unhurried' ? 0.9 : 1, pace: requested, basis: 'caller_request', sourceTurnId: entry.id };
  });
  return decision;
}
