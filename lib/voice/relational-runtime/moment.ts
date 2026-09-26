/** Port of moment.ts's authored priority/whole-word gates and current-turn
 * deixis contract, html-portfolio f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21.
 * Business vocabulary replaces companion vocabulary; empty normalized keys,
 * hypothetical/quoted/negated clauses are excluded before matching. */
export type MomentShape = 'conflict' | 'vulnerable' | 'stress' | 'silence' | 'celebration' | 'planning' | 'teasing' | 'boredom' | 'none';
const padT = (s: string) => ' ' + s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
const MOMENT_KEYS: Record<Exclude<MomentShape, 'none'>, string[]> = {
  conflict: ['you are not listening', 'you missed my point', 'you got that wrong', 'not what i asked', 'not what i meant', 'aap meri baat nahi sun rahe'],
  vulnerable: ['i am worried', 'i am scared', 'i am anxious', 'i am nervous', 'i feel nervous', 'mujhe dar lag raha', 'i feel anxious'],
  stress: ['i am stressed', 'i feel overwhelmed', 'i am overwhelmed', 'this is too much', 'too much information', 'i am exhausted', 'i am under pressure'],
  silence: ['nothing to say', 'give me a moment', 'i need a moment', 'abhi ruko'],
  celebration: ['i am excited', 'i am so happy', 'i got selected', 'we did it', 'i got accepted', 'good news'],
  planning: ['plan', 'planning', 'schedule', 'book', 'next step', 'appointment'],
  teasing: ['just kidding', 'haha', 'lol', 'mazak'],
  boredom: ['i am bored', 'this is boring'],
};
const SHAPE_PRIORITY: Array<Exclude<MomentShape, 'none'>> = ['conflict', 'vulnerable', 'stress', 'silence', 'celebration', 'planning', 'teasing', 'boredom'];
const MOMENT_KEY_ENTRIES = SHAPE_PRIORITY.map(shape => ({ shape, keys: MOMENT_KEYS[shape].map(padT).filter(key => key.trim()) }));

/** Preserves offsets, so every resulting match can cite the exact caller text. */
export function directText(text: string): string {
  return text.replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|(?<!\p{L})'[^'\n]*'(?!\p{L})/gu, match => ' '.repeat(match.length));
}
export function directMatch(text: string, pattern: RegExp): RegExpExecArray | null {
  const masked = directText(text);
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const matcher = new RegExp(pattern.source, flags);
  let latest: RegExpExecArray | null = null;
  for (let match = matcher.exec(masked); match; match = matcher.exec(masked)) {
    const prefix = masked.slice(0, match.index).split(/[.!?;\n]/u).at(-1) ?? '';
    if (/\b(?:if|suppose|imagine|example|said|says|saying|wrote|reads?|asks?|asked|means?)\b/iu.test(prefix)) continue;
    if (/\b(?:not|never|don['’]t|do not)\s+$/iu.test(prefix)) continue;
    latest = match;
  }
  // A later explicit correction in the same finalized turn wins.
  return latest;
}

export function detectMomentShape(userText: string): MomentShape {
  if (!userText.trim()) return 'none';
  // Moment is a presentation hint only. Persistent repair uses explicit
  // caller-directed evidence separately, never a broad sentiment label.
  const clauses = directText(userText).split(/[.!?;\n]/u).filter(clause => !/\b(?:if|suppose|imagine|example|said|says|wrote|not|never|don['’]t|do not)\b/iu.test(clause));
  const hay = padT(clauses.join(' ').replace(/\bi['’]m\b/giu, 'i am'));
  if (!hay.trim()) return 'none';
  for (const entry of MOMENT_KEY_ENTRIES) if (entry.keys.some(key => hay.includes(key))) return entry.shape;
  return 'none';
}
const DEIXIS_PHRASES = ['remember when', 'remember that', 'remember how', 'woh wala', 'wo wala', 'us din', 'uss din', 'wahi wala', 'yaad hai', 'yaad dila', 'jaisa humne', 'jaise humne', 'wahi baat', 'like last time', 'like that time', 'last time we discussed', 'our previous conversation'].map(padT);
export function hasDeixis(userText: string): boolean {
  const text = directText(userText).split(/[.!?;\n]/u).filter(clause => !/\b(?:if|suppose|imagine|example|said|says|not|never|don['’]t|do not)\b/iu.test(clause)).join(' ');
  const hay = padT(text);
  return !!hay.trim() && DEIXIS_PHRASES.some(key => hay.includes(key));
}
export function momentGate(userText: string): { moment: MomentShape; pulled: boolean } {
  return userText.trim() ? { moment: detectMomentShape(userText), pulled: hasDeixis(userText) } : { moment: 'none', pulled: false };
}
