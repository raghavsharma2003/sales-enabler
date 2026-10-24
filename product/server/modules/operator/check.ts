// Checks on the Operator's final reply against what actually happened this turn. The reply has already streamed, so
// a failed check appends a plain correction and gives the model one repair turn; nothing is ever silently false.
// Bench r4 (research/2026-10-24/benches-r4/): the first claim check fired once in 107 runs, falsely ("To set up a
// campaign, I need some details"), and missed every real false statement:
//   - "Tap to confirm deployment." with no card shown            -> tapWithoutCard
//   - "120 seconds" after reading 180 s                          -> numbers (durations)
//   - "₹9,608-24,021" for an estimate of ₹9.61-₹24.02 (2 of 2)   -> numbers (money)
// Bench op5 (research/2026-10-24/benches-op5/): gpt-4.1 made 21 claimed writes after zero tool calls, in reduced
// passives the subject rule missed ("Draft agent created for EMI due reminders", "now set to speak Hindi"); the checks
// misread "covers 5 people" as ₹5, "Nothing has been deleted yet" as a claim, and a clarifying question as a request for
// permission; and a reply was never held to its own card (₹2,000 said, ₹200 on the card).
// Each check is narrow on purpose: a false correction costs the member's trust as much as a false claim.

export type Problem = { kind: 'claim' | 'tap' | 'number' | 'confirm_first'; notice?: string; repair: string };

// ---- a past-tense change, in the assistant's voice --------------------------------------------------------------
const VERBS = 'added|updated|published|created|saved|changed|launched|imported|renamed|removed|deleted|scheduled|attached|edited|switched|moved|raised|lowered|replaced|drafted|set up|turned (?:on|off)|enabled|disabled|uploaded|connected|configured|built|made|set|applied|suppressed|paused|stopped|deployed';
// Verbs that also describe the member's own activity or a state ("20 calls have been made", "You have made 20 calls",
// "a suggested cap set at ₹100") count only in the first person ("I've made the change"). op6: "made" misfired on
// read answers in 4 of 4 runs.
const GENERIC = new Set(['made', 'set', 'built', 'applied']);
const CHANGE_VERBS = VERBS.split('|').filter(v => !GENERIC.has(v)).join('|');
// "to set up", "need to add": an infinitive is a plan, not a claim.
const CLAIM_VERB = new RegExp(`(?<!\\bto )(?<!\\bto be )\\b(${CHANGE_VERBS})\\b`, 'i');
const FIRST_PERSON_GENERIC = /\b(i|we)(?:'ve| have)?\s+(?:just\s+)?(made|set|built|applied)\b/i;
// A count or a period marks a read answer about what already happened ("5 contacts were imported so far").
const READ_ANSWER = /\b(so far|in total|to date|till now|until now|this (week|month|year)|today|yesterday|last (week|month))\b|^\s*(you|your)\b|^\s*\d[\d,]*\s+\w+\s+(have|has|were|was)\s+been\b/i;
const CLAIM_SUBJECT = /\b(i|i've|i have|i'm|we|we've|we have)\b|\b(has|have) been\b|\b(is|are) now\b/i;
// A reduced passive: the verb within the first few words, with no "was/were" before it ("Draft agent created for ...").
const REDUCED_PASSIVE = new RegExp(`^\\s*(?:[\\w'’-]+\\s+){0,4}?(${CHANGE_VERBS})\\b`, 'i');
const NOW_STATE = /\b(is|are)?\s*now (on|set|using|live|active|called|named|in|configured|switched|speaks|uses|runs)\b|^\s*(done|all set)\b/i;
// What turns a sentence into a non-claim: a question, or a negation, modal or condition BEFORE the verb (not after:
// "Draft created; it can be undone" is still a claim). "Nothing has been deleted yet" is a negation.
const GOVERNED = new RegExp(`\\b(not|never|no|nothing|none|neither|cannot|unable|failed to|can|could|will|would|shall|should|may|might|want|wants|once|after|if|when|before|let me|need|needs|please|going to|ready to|about to)\\b[^.!?;]{0,40}?\\b(${VERBS})\\b|n't\\b[^.!?;]{0,40}?\\b(${VERBS})\\b|'ll\\b[^.!?;]{0,40}?\\b(${VERBS})\\b`, 'i');
// "I made no changes", "changed nothing".
const NEGATED_AFTER = new RegExp(`\\b(${VERBS})\\s+(no|nothing|none)\\b`, 'i');
const PAST_FACT = /\b(was|were)\s+(\w+\s+)?(created|added|made|set up|published|launched|imported)\b[^.!?]*\b(on|in|at|ago|yesterday|last|earlier|previously|before)\b/i;
const sentences = (text: string) => text.split(/(?<=[.!?…])\s+|\n+|(?<=…)/).filter(s => s.trim());

/** True when a sentence states, in the assistant's voice or as a bare passive, that a change was made. */
export function claimsChange(text: string, proposed: boolean): boolean {
  return sentences(text).some(sen => {
    if (/\?\s*$/.test(sen) || GOVERNED.test(sen) || PAST_FACT.test(sen) || NEGATED_AFTER.test(sen) || READ_ANSWER.test(sen)) return false;
    if (FIRST_PERSON_GENERIC.test(sen)) return true;
    if (proposed && /approv|tap|waiting|pending|card/i.test(sen)) return false;
    return NOW_STATE.test(sen) || (CLAIM_VERB.test(sen) && (CLAIM_SUBJECT.test(sen) || (REDUCED_PASSIVE.test(sen) && !/\b(was|were|been|is|are)\b/i.test(sen.slice(0, sen.search(CLAIM_VERB) + 1)))));
  });
}

// ---- "tap to confirm" with nothing to tap --------------------------------------------------------------------------
const TAP_ASK = /\b(tap|hold|press|click)\b[^.!?\n]*\b(confirm|approv\w*|launch|deploy\w*|publish|continue|go ahead)\b|\b(confirm|approve)\b[^.!?\n]*\b(card|tap|button)\b/i;
export const tapsWithoutCard = (text: string) => TAP_ASK.test(text);

// ---- asking to confirm a draft the member already asked for ---------------------------------------------------------
const CONFIRM_ASK = /\b(shall i|should i|do you want me to|would you like me to|want me to (go ahead|proceed)|can you confirm|please confirm|confirm (that|if|whether)|is that (ok|okay|correct|right|fine)|ok to proceed|go ahead\?|proceed\?)/i;
// A question that offers a choice or asks for a missing fact is a clarification, never a permission ask (op5: nudging
// one made gpt-4.1 draft a campaign nobody specified).
const CLARIFYING = /\b(which|what|who|whom|when|where|how many|how much|or|specific|specify|details?|prefer|preference|default|instead|name|times?|window|audience|budget|cap)\b/i;
export const asksToConfirm = (text: string) => sentences(text).some(s => CONFIRM_ASK.test(s) && !CLARIFYING.test(s));
/** The member's message asks for a draft-type change in so many words ("create an agent", "make it calmer"). */
const ASKS_FOR_DRAFT = /^\s*(please\s+)?(create|make|draft|add|build|set up|edit|change|update|rename|switch|put|use)\b/i;

// ---- numbers: money and durations against the turn's tool results -----------------------------------------------------
export interface Known { money: number[]; plain: number[] }

const num = (s: string) => Number(s.replace(/,/g, ''));
/** Every number the turn's tool results and the member's message hold. Fields ending in InrMilli count as money in
 *  rupees (value / 1000), never as a rupee amount themselves; a number written after ₹ in a string counts as money. */
export function knownNumbers(facts: unknown[], userText: string): Known {
  const k: Known = { money: [], plain: [] };
  let memberMoney = true;
  const fromText = (t: string, member = false) => {
    for (const m of t.matchAll(/(?:₹|\brs\.?|\binr)\s?([\d,]+(?:\.\d+)?)/gi)) k.money.push(num(m[1]!));
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
  // When an approval CARD this turn carries an amount, the reply is held to it, not to what the member typed: the card
  // is what will happen (op5: "₹2,000" said, ₹200 on the card). A read result carrying money (a wallet balance) does not
  // drop the member's own figures (op6 multi-cap-balance: the member's ₹200 was flagged). The card's amount is itself
  // checked against the member's words before it exists (loop.ts, spendMismatch), so a card cannot be wrong here.
  const cardMoney = facts.some(f => f && typeof f === 'object' && (f as { card?: boolean }).card && JSON.stringify(f).match(/InrMilli"\s*:\s*\d/i));
  memberMoney = !cardMoney;
  const before = k.money.length;
  fromText(userText, memberMoney);
  if (!memberMoney) k.money.length = before;
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
  for (const m of text.matchAll(/(?:₹|\brs\.?\s|\binr\s)\s?([\d,]+(?:\.\d+)?)\s*(lakhs?|crores?|k\b)?(?:\s*(?:-|–|—|to)\s*(?:₹\s?)?([\d,]+(?:\.\d+)?)\s*(lakhs?|crores?|k\b)?)?/gi)) {
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
      repair: `Check failed: your reply states ${bad.join(', ')}, which matches no amount or duration in this turn's tool results or the client's message. Fields ending in InrMilli are thousandths of a rupee (9608 is ₹9.61); where a result has a display string, quote it. Reply again with every figure exactly as the tools give it. If a figure the client gave differs from a tool's, say so plainly; never change the client's figure to match.` };
  }
  if (!o.proposed && !o.pendingInThread && tapsWithoutCard(text)) return { kind: 'tap',
    notice: 'Correction: nothing from this message is waiting for your tap.',
    repair: 'Check failed: your reply asks the client to tap, hold or confirm, but no approval card was made in this turn and none is waiting in this thread. Call the tool that makes the change (it creates the approval card itself when one is needed), or say plainly what is still needed.' };
  if (!o.wrote && claimsChange(text, o.proposed)) return { kind: 'claim',
    notice: 'Correction: nothing was changed by this message. No tool confirmed the change described above.',
    repair: 'Check failed: your reply says something was changed, but no tool changed anything in this turn (every write was NOT DONE, or none was called). Either make the change now with the tools, or reply again stating plainly what was not done and why. Do not claim a change without a DONE result.' };
  if (!o.wrote && !o.proposed && o.toolCalls === 0 && ASKS_FOR_DRAFT.test(o.userText) && asksToConfirm(text)) return { kind: 'confirm_first',
    repair: 'The client already asked for this. If you have every fact the tool needs, call the tool now instead of asking permission; if a fact is missing, ask for that fact. The draft exists only once its tool returns DONE in this turn: never describe it before then. Anything that reaches people, spends, deletes or changes policy becomes an approval card on its own.' };
  return null;
}
