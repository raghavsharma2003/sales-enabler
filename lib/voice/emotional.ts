/**
 * Business adaptation of html-portfolio f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21:
 * moment.ts (current-turn gate), relstate.ts (caller-led repair), compiler.ts
 * (no turn means no moment), Maya's speech/identity separation. No affect score,
 * voice inference, trust model, database writer, or companion persona is used.
 */
export const CONVERSATION_BEHAVIOR_INSTRUCTIONS = `Adapt to what the caller explicitly says, not an assumed emotion or a voice-based diagnosis. Keep your AI identity clear; natural speech never permits a fabricated human identity or shared personal history.
When the caller says this is too much, slow the conversational pace, offer one manageable next step, and ask permission before continuing. Ask at most one question per turn; leave space for the answer.
When they say they are confused, rephrase the specific point in plain language and check which part needs explaining. Do not repeat the same pitch more loudly or add a list of questions.
When they express frustration or say you missed their point, briefly acknowledge the specific miss, address it, and check whether the proposed next step helps. Your own apology never proves repair or restored trust.
When they say they have little time, give the essential answer first in a short turn and offer a choice to stop or continue. Never exploit urgency to pressure a decision.
When they correct themselves or a stored fact, use their stated correction for this conversation, clarify ambiguity with one question, and keep any permanent change as a proposal for operator review. Never claim a record was updated.
If they ask to pause or stop, stop the pitch and leave continuation to them; do not keep asking qualification questions. Permission to continue talking never grants recording, contact, memory, or external-action authorization.
Follow their explicit communication preferences within the agent's allowed languages. Hindi or English switching is not evidence of stress, closeness, or trust. Do not manufacture fillers, laughter, self-corrections, affection, or claims that you know how they feel.`;

export type ConversationCueKind = 'overwhelmed' | 'frustrated' | 'confused' | 'time-pressure' | 'brevity-request' | 'self-correction' | 'pause-request';
export type ConversationEvidence = { entryId: string; entryIndex: number; start: number; end: number; text: string };
export type ConversationCue = { kind: ConversationCueKind; evidence: ConversationEvidence };
export type ConversationCorrectionCandidate = {
  id: string;
  status: 'requires-review';
  kind: 'communication-preference' | 'stated-correction';
  evidence: ConversationEvidence;
};
export type ConversationBehaviorState = {
  scope: 'current-call';
  observedCues: ConversationCue[];
  behavior: {
    pace: 'normal' | 'unhurried' | 'brief';
    questionLimit: 1;
    acknowledgeConcern: boolean;
    repair: 'none' | 'acknowledge-and-check' | 'confirm-correction';
    askPermission: boolean;
    pauseRequested: boolean;
  };
  repairPending: boolean;
  correctionCandidates: ConversationCorrectionCandidate[];
  instructions: string;
};
export type ConversationEntry = { id?: string; role: string; text: string };

// Deliberately narrow authored cues, not a sentiment classifier. Missing an
// idiom leaves the baseline instructions in charge; it never fabricates state.
const cuePatterns: Record<ConversationCueKind, RegExp> = {
  overwhelmed: /\b(?:i(?:['’]m| am| feel) (?:really |very |so )?overwhelmed|overwhelm(?:ed|s|ing)? me|this is (?:all )?too much(?: for me)?|too much information|(?:please )?(?:slow down|one (?:thing|step) at a time)|mujhe (?:bahut |bohot )?overwhelm(?:ed)? (?:ho raha|lag raha)|ek ek karke)\b|(?:एक एक करके|धीरे बोलिए|धीरे बोलो)/iu,
  frustrated: /\b(?:i(?:['’]m| am| feel) (?:really |very |so )?(?:frustrated|annoyed)|this is (?:really |very |so )?frustrating|you(?:['’]re| are) not listening|you (?:missed my point|didn['’]t listen|got (?:that|it) wrong)|that(?:['’]s| is) not what i (?:said|meant|asked)|i(?:['’]ve| have) (?:already )?(?:told|explained) (?:you|this)|aap meri baat nahi (?:sun rahe|samajh rahe))\b|(?:आप मेरी बात नहीं सुन रहे|मैंने ऐसा नहीं कहा)/iu,
  confused: /\b(?:i(?:['’]m| am| feel) (?:really |very |so )?confused|i (?:don['’]t|do not) understand|(?:could|can) you (?:explain that again|rephrase that)|what do you mean(?: by that)?|mujhe samajh nahi (?:aa raha|aaya)|samajh nahi (?:aa raha|aaya))\b|(?:मुझे समझ नहीं (?:आ रहा|आया)|फिर से समझाइए)/iu,
  'time-pressure': /\b(?:i(?:['’]m| am) (?:in a (?:rush|hurry)|short on time)|i (?:only have|have only) (?:a |one |two |five |ten |\d+ )?(?:minute|minutes|second|seconds)|i (?:don['’]t|do not) have (?:much )?time|(?:please )?keep (?:it|this) (?:short|brief)|mere paas (?:zyada )?time nahi (?:hai)?|jaldi bata(?:o|iye))\b|(?:मेरे पास (?:ज़्यादा |ज्यादा )?समय नहीं|जल्दी बताइए)/iu,
  'brevity-request': /\b(?:please (?:ask (?:me )?(?:just |only )?one (?:short )?question(?: at a time)?|(?:give me|use) (?:a |one )?(?:short|brief) (?:answer|reply)|(?:answer|reply) briefly|keep (?:your|the) (?:answer|reply) (?:short|brief))|(?:can|could|would) you (?:please )?(?:ask (?:me )?(?:just |only )?one (?:short )?question(?: at a time)?|(?:give me|use) (?:a |one )?(?:short|brief) (?:answer|reply)|(?:answer|reply) briefly)|i (?:want|need|prefer|would like) (?:a |one )?(?:short|brief) (?:answer|reply))\b/iu,
  'self-correction': /\b(?:actually[,]? i (?:meant|said|prefer)|(?:no[,]? )?i meant|no[,]? (?:that(?:['’]s| is) (?:not right|wrong)|i said)|(?:please )?(?:correct|update) (?:that|my (?:name|number|email|preference))|please (?:call me|speak (?:in )?|use (?:English|Hindi|Hinglish))|i prefer (?:English|Hindi|Hinglish|formal|informal|casual|professional)|nahi[,]? mera matlab|maine (?:yeh|aisa) nahi kaha)\b|(?:नहीं[,]? मेरा मतलब|मैंने ऐसा नहीं कहा|मुझे .{1,40} बुलाइए)/iu,
  'pause-request': /^(?:please )?(?:stop|pause)[.!\s]*$|\b(?:(?:please )?(?:stop (?:the call|talking|this|for now)|pause (?:the call|for now)|give me a (?:moment|minute)|let(?:['’]s| us) (?:stop|pause)|i need a (?:break|moment)|i (?:don['’]t|do not) want to continue)|abhi (?:ruko|ruk jaiye)|baad mein baat karte)\b|(?:अभी रुकिए|अभी रुको|बाद में बात करते)/iu,
};
const repairResolved = /\b(?:that (?:helps|answers my question|makes sense|clears it up)|(?:yes|okay|ok)[, ]+(?:you got it|that(?:['’]s| is) (?:right|correct))|ab samajh aa gaya|haan[,]? (?:ab )?sahi hai)\b|(?:अब समझ आ गया|हाँ[,]? सही है)/iu;
const repairRequested = /\b(?:you(?:['’]re| are) not listening|you (?:missed my point|didn['’]t listen|got (?:that|it) wrong)|that(?:['’]s| is) not what i (?:said|meant|asked)|i(?:['’]ve| have) (?:already )?(?:told|explained) (?:you|this)|aap meri baat nahi (?:sun rahe|samajh rahe))\b|(?:आप मेरी बात नहीं सुन रहे|मैंने ऐसा नहीं कहा)/iu;
const preferenceCue = /\b(?:call me|speak|use (?:English|Hindi|Hinglish)|i prefer)\b|बुलाइए/iu;
const MAX_RECENT_USER_TURNS = 12;
const MAX_TURN_CHARACTERS = 6000;

/** Mask quoted examples without moving evidence offsets. Apostrophes in I'm
 * are not quotation delimiters. This is intentionally conservative. */
function directText(text: string): string {
  return text.replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|(?<!\p{L})'[^'\n]*'(?!\p{L})/gu, match => ' '.repeat(match.length));
}

function directMatch(text: string, pattern: RegExp): RegExpExecArray | null {
  const masked = directText(text);
  const matcher = new RegExp(pattern.source, `${pattern.flags}g`);
  for (let match = matcher.exec(masked); match; match = matcher.exec(masked)) {
    const prefix = masked.slice(0, match.index).split(/[.!?;\n]/u).at(-1) ?? '';
    // Do not turn hypothetical or attributed examples into caller state.
    if (/\b(?:if|suppose|imagine|example|said|says|saying|told|reported|reports|claimed|claims|thinks?|thought|believes?|believed|wrote|reads?|asks?|asked|requested|requests|means?)\b/iu.test(prefix)) continue;
    if (/\b(?:not|never|don['’]t|do not)\s+$/iu.test(prefix)) continue;
    // Object-form self-reports need their own clause guard: "messages have
    // not really overwhelmed me" must not become a positive observation.
    if (/^overwhelm(?:ed|s|ing)? me$/iu.test(match[0])) {
      if (!prefix.trim() || /\b(?:not|never|no longer|hardly|barely|may|might|could|would|whether|wonder|used to|to)\b|\b\w+n['’]t\b/iu.test(prefix) || /^\s*\?/u.test(masked.slice(match.index + match[0].length))) continue;
    }
    // An embedded or negated request is not a direct preference, even if a
    // politeness word separates it from the negation.
    if (/^(?:please|can you|could you|would you|i (?:want|need|prefer|would like))\b/iu.test(match[0]) && /\b(?:not|never|don['’]t|do not|doesn['’]t|didn['’]t)\b/iu.test(prefix)) continue;
    return match;
  }
  return null;
}

function evidenceFor(entry: ConversationEntry, entryIndex: number, start: number, length: number): ConversationEvidence {
  return { entryId: entry.id || `turn-${entryIndex}`, entryIndex, start, end: start + length, text: entry.text.slice(start, start + length) };
}

/** Pure, deterministic, transient analysis of caller-authored transcript text.
 * The caller must supply only entries from this call. Nothing is persisted.
 * Cue labels describe observed wording, never an established personal trait. */
export function analyzeConversation(entries: readonly ConversationEntry[]): ConversationBehaviorState {
  const recent: { entry: ConversationEntry; index: number }[] = [];
  const seen = new Set<string>();
  for (let index = entries.length - 1; index >= 0 && recent.length < MAX_RECENT_USER_TURNS; index--) {
    const entry = entries[index];
    if (entry.role !== 'user' || !entry.text.trim() || (entry.id && seen.has(entry.id))) continue;
    if (entry.id) seen.add(entry.id);
    recent.unshift({ entry, index });
  }
  let observedCues: ConversationCue[] = [];
  let repairPending = false;
  const correctionCandidates: ConversationCorrectionCandidate[] = [];
  for (const { entry, index } of recent) {
    const text = entry.text.slice(0, MAX_TURN_CHARACTERS);
    const cues: ConversationCue[] = [];
    for (const kind of Object.keys(cuePatterns) as ConversationCueKind[]) {
      const match = directMatch(text, cuePatterns[kind]);
      if (match) {
        let start = match.index;
        if (kind === 'overwhelmed' && /^overwhelm(?:ed|s|ing)? me$/iu.test(match[0])) {
          const before = text.slice(0, match.index);
          const clause = before.split(/[.!?;\n]/u).at(-1) || '';
          start = match.index - clause.length + (clause.length - clause.trimStart().length);
        }
        cues.push({ kind, evidence: evidenceFor(entry, index, start, match.index + match[0].length - start) });
      }
    }
    if (directMatch(text, repairResolved)) repairPending = false;
    if (directMatch(text, repairRequested)) repairPending = true;
    const correction = cues.find(cue => cue.kind === 'self-correction');
    if (correction) {
      const start = correction.evidence.start;
      const rest = text.slice(start).match(/^[^.!?;\n]{1,300}(?:[.!?;\n]|$)/u)?.[0];
      // A fragment without its replacement is not a reviewable correction.
      const containsPreferenceValue = /\b(?:i prefer|please use) (?:English|Hindi|Hinglish|formal|informal|casual|professional)\b/iu.test(rest ?? '');
      if (rest && (rest.trim().replace(/[.!?;]+$/, '').length > correction.evidence.text.trim().length || containsPreferenceValue)) {
        correctionCandidates.push({
          id: `${correction.evidence.entryId}:correction:${start}`,
          status: 'requires-review',
          kind: preferenceCue.test(rest) ? 'communication-preference' : 'stated-correction',
          evidence: evidenceFor(entry, index, start, rest.trimEnd().length),
        });
      }
    }
    observedCues = cues; // Current user turn only, never the assistant's reply.
  }
  const has = (kind: ConversationCueKind) => observedCues.some(cue => cue.kind === kind);
  const pauseRequested = has('pause-request');
  const behavior: ConversationBehaviorState['behavior'] = {
    pace: has('time-pressure') || has('brevity-request') ? 'brief' : has('overwhelmed') || has('confused') ? 'unhurried' : 'normal',
    questionLimit: 1,
    acknowledgeConcern: has('overwhelmed') || has('frustrated') || has('confused'),
    repair: has('self-correction') ? 'confirm-correction' : repairPending ? 'acknowledge-and-check' : 'none',
    askPermission: has('overwhelmed') || has('time-pressure') || pauseRequested,
    pauseRequested,
  };
  const guidance = ['Current-call guidance only. These cues come from explicit caller wording, not inferred emotions. Ask at most one question per turn.'];
  if (pauseRequested) guidance.push('The caller asked for a pause: stop the pitch, briefly acknowledge, and wait for them to resume.');
  else {
    if (has('time-pressure')) guidance.push('Give the essential answer first in one short turn; offer to stop or continue without pressure.');
    if (has('brevity-request')) guidance.push('The caller explicitly requested a short reply or one question. Keep the reply concise and ask at most one short question, then wait. This is a communication preference, not evidence of urgency or an emotion.');
    if (has('overwhelmed')) guidance.push('Offer one manageable next step; use an unhurried pace and ask permission before more detail.');
    if (has('confused')) guidance.push('Rephrase the specific point in plain language, then check understanding with one question.');
    if (has('frustrated')) guidance.push('Acknowledge the concern in the caller\'s words and offer a practical next step; do not assume you caused it or that you know their private feelings.');
    if (repairPending) guidance.push('A caller-stated concern is unresolved in the recent call: acknowledge the specific miss and check the next step. Do not claim your apology repaired trust.');
    if (has('self-correction')) guidance.push('Use the stated correction in this conversation; clarify ambiguity once. A permanent correction requires operator review, and no record has been updated.');
  }
  return { scope: 'current-call', observedCues, behavior, repairPending, correctionCandidates: correctionCandidates.slice(-4), instructions: guidance.join('\n') };
}
