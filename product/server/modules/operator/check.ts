// Checks on the Operator's final reply against what actually happened this turn. The reply has already streamed, so
// a failed check appends a plain correction and gives the model one repair turn; nothing is ever silently false.
// Bench r4 (research/2026-10-24/benches-r4/): the first claim check fired once in 107 runs, falsely ("To set up a
// campaign, I need some details"), and missed every real false statement:
//   - "Tap to confirm deployment." with no card shown            -> tapWithoutCard
//   - "120 seconds" after reading 180 s                          -> numbers (durations)
//   - "₹9,608-24,021" for an estimate of ₹9.61-₹24.02 (2 of 2)   -> numbers (money)
// Each check is narrow on purpose: a false correction costs the member's trust as much as a false claim.

export type Problem = { kind: 'claim' | 'tap' | 'number' | 'confirm_first'; notice?: string; repair: string };

// ---- a past-tense change, in the assistant's voice --------------------------------------------------------------
const VERBS = 'added|updated|published|created|saved|changed|launched|imported|renamed|removed|deleted|scheduled|attached|edited|switched|moved|raised|lowered|replaced|drafted|set up|turned (?:on|off)|enabled|disabled|uploaded|connected';
// "to set up", "need to add": an infinitive is a plan, not a claim.
const CLAIM_VERB = new RegExp(`(?<!\\bto )(?<!\\bto be )\\b(${VERBS})\\b`, 'i');
const CLAIM_SUBJECT = /\b(i|i've|i have|i'm|we|we've|we have)\b|\b(has|have) been\b|\b(is|are) now\b|^\s*(done|added|updated|published|created|saved|changed|launched|imported|renamed|removed|deleted|scheduled|attached|edited)\b/i;
const NOT_A_CLAIM = /\?\s*$|\b(not|never|no|cannot|unable|failed|couldn't|wasn't|didn't|haven't|hasn't|won't|can|could|will|would|shall|should|may|might|want|once|after|if|when|let me|need|needs|please|before)\b|'ll\b|n't\b/i;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).filter(s => s.trim());

/** True when a sentence states, in the assistant's voice, that it changed something. */
export function claimsChange(text: string, proposed: boolean): boolean {
  return sentences(text).some(sen =>
    (/^\s*(done|all set)\b/i.test(sen) || /\b(is|are) now (on|set|using|live|active|called|named|in)\b/i.test(sen) || (CLAIM_VERB.test(sen) && CLAIM_SUBJECT.test(sen)))
    && !NOT_A_CLAIM.test(sen) && !(proposed && /approv|tap|waiting|pending|card/i.test(sen)));
}

// ---- "tap to confirm" with nothing to tap --------------------------------------------------------------------------
const TAP_ASK = /\b(tap|hold|press|click)\b[^.!?\n]*\b(confirm|approv\w*|launch|deploy\w*|publish|continue|go ahead)\b|\b(confirm|approve)\b[^.!?\n]*\b(card|tap|button)\b/i;
export const tapsWithoutCard = (text: string) => TAP_ASK.test(text);

// ---- asking to confirm a draft the member already asked for ---------------------------------------------------------
const CONFIRM_ASK = /\b(shall i|should i|do you want me to|would you like me to|want me to (go ahead|proceed)|can you confirm|please confirm|confirm (that|if|whether)|is that (ok|okay|correct|right|fine)|ok to proceed|go ahead\?|proceed\?)/i;
const OPEN_QUESTION = /\b(which|what|who|whom|when|where|how many|how much)\b/i;
export const asksToConfirm = (text: string) => sentences(text).some(s => CONFIRM_ASK.test(s) && !OPEN_QUESTION.test(s));

// ---- numbers: money and durations against the turn's tool results -----------------------------------------------------
export interface Known { money: number[]; plain: number[] }

const num = (s: string) => Number(s.replace(/,/g, ''));
/** Every number the turn's tool results and the member's message hold. Fields ending in InrMilli count as money in
 *  rupees (value / 1000), never as a rupee amount themselves; a number written after ₹ in a string counts as money. */
export function knownNumbers(facts: unknown[], userText: string): Known {
  const k: Known = { money: [], plain: [] };
  const fromText = (t: string, member = false) => {
    for (const m of t.matchAll(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)/gi)) k.money.push(num(m[1]!));
    // Any figure the member typed may be money ("cap it at 500"); a tool's bare number is not.
    for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) { k.plain.push(num(m[0])); if (member) k.money.push(num(m[0])); }
  };
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'number') { if (/inrmilli$/i.test(key)) k.money.push(v / 1000); else { k.plain.push(v); if (/inr|rupee|amount|price|cost|balance/i.test(key)) k.money.push(v); } }
    else if (typeof v === 'string') fromText(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, kk);
  };
  facts.forEach(f => walk(f));
  fromText(userText, true);
  k.plain.push(24);                                        // approval cards expire after 24 hours
  return k;
}

// Within 1%, or the same figure rounded to whole rupees (₹10 for ₹9.61). Never a factor of 1000 off.
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.01) || (Number.isInteger(a) && Math.abs(a - b) < 1);
const UNIT_S: Record<string, number> = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, min: 60, mins: 60, minute: 60, minutes: 60, hr: 3600, hrs: 3600, hour: 3600, hours: 3600 };

/** Amounts and durations in the reply that no tool result and nothing the member said supports. */
export function unsupportedNumbers(text: string, k: Known): string[] {
  const bad: string[] = [];
  const LAKH = { lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7, k: 1e3 } as Record<string, number>;
  for (const m of text.matchAll(/(?:₹|rs\.?\s|inr\s)\s?([\d,]+(?:\.\d+)?)\s*(lakhs?|crores?|k\b)?(?:\s*(?:-|–|—|to)\s*(?:₹\s?)?([\d,]+(?:\.\d+)?)\s*(lakhs?|crores?|k\b)?)?/gi)) {
    for (const [v, u] of [[m[1], m[2]], [m[3], m[4] ?? m[2]]] as [string | undefined, string | undefined][]) {
      if (!v) continue;
      const a = num(v) * (u ? LAKH[u.toLowerCase()] ?? 1 : 1);
      if (!k.money.some(b => close(a, b))) bad.push(`₹${v}${u ? ' ' + u : ''}`);
    }
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|hours?|hrs?)\b/gi)) {
    const v = Number(m[1]), secs = v * (UNIT_S[m[2]!.toLowerCase()] ?? 1);
    if (!k.plain.some(b => close(v, b) || close(secs, b) || close(secs, b * 60))) bad.push(m[0]);
  }
  return [...new Set(bad)];
}

/** The first problem with a final reply, or null. `pendingInThread`: an approval card from an earlier turn still waits. */
export function checkReply(o: { text: string; wrote: boolean; proposed: boolean; pendingInThread: boolean; facts: unknown[]; userText: string; toolCalls: number }): Problem | null {
  const { text } = o;
  if (!text.trim()) return null;
  if (o.facts.length) {
    const bad = unsupportedNumbers(text, knownNumbers(o.facts, o.userText));
    if (bad.length) return { kind: 'number',
      notice: `Correction: ${bad.join(', ')} in the reply above does not match what the tools returned for this message. The corrected reply follows.`,
      repair: `Check failed: your reply states ${bad.join(', ')}, which matches no amount or duration in this turn's tool results or the client's message. Fields ending in InrMilli are thousandths of a rupee (9608 is ₹9.61); where a result has a display string, quote it. Reply again with every figure exactly as the tools give it.` };
  }
  if (!o.proposed && !o.pendingInThread && tapsWithoutCard(text)) return { kind: 'tap',
    notice: 'Correction: nothing from this message is waiting for your tap.',
    repair: 'Check failed: your reply asks the client to tap, hold or confirm, but no approval card was made in this turn and none is waiting in this thread. Call the tool that makes the change (it creates the approval card itself when one is needed), or say plainly what is still needed.' };
  if (!o.wrote && claimsChange(text, o.proposed)) return { kind: 'claim',
    notice: 'Correction: nothing was changed by this message. No tool confirmed the change described above.',
    repair: 'Check failed: your reply says something was changed, but no tool changed anything in this turn (every write was NOT DONE, or none was called). Either make the change now with the tools, or reply again stating plainly what was not done and why. Do not claim a change without a DONE result.' };
  if (!o.wrote && !o.proposed && o.toolCalls === 0 && asksToConfirm(text)) return { kind: 'confirm_first',
    repair: 'The client already asked for this. Drafts, edits and tests are free and reversible: do it now with the tools, then say what you did and that it can be undone. Ask only if a fact you need is missing, and then ask for that fact, not for permission. Anything that reaches people, spends, deletes or changes policy becomes an approval card on its own.' };
  return null;
}
