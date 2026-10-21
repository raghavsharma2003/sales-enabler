// compile(): the one brief compiler for every lane (test, browser, phone, simulation). It ports the measured persona v2
// (voicelab/server/persona_v2.py) from four hard-coded scenarios to any AgentConfig: any job, language mix and register.
// The laws it keeps:
//  - shapes, not lines: nothing here is a line she could say; the recitable-line lint refuses configs that try;
//  - position is mechanism: script and identity first, the counts and goal check last (TAIL, appended by the runtime
//    after its per-turn ledger, every turn);
//  - truncation is silent, so the budget THROWS and names the section to cut; nothing is ever sliced;
//  - deterministic: the same config gives the same bytes (and so the same hash), so caches hit and approvals bind.
import { createHash } from 'node:crypto';
import type { AgentConfig, Fact, Job, Language, SectorPack } from '../../../shared/agent-config.ts';
import { getStack } from '../../../shared/stacks.ts';
import { lintAgentConfig, type LintFinding } from '../../../shared/safety/index.ts';
import { shapeLint, type ShapeFinding } from './lint.ts';

export interface CompiledBrief { text: string; hash: string; bytes: number }
export interface CompileReport extends CompiledBrief { sections: { name: SectionName; bytes: number }[]; dropped: string[] }

export const SECTION_ORDER = ['SCRIPT', 'IDENTITY', 'GOVERNOR', 'MEDIUM', 'SOUNDS', 'CORE', 'SITUATION_GOAL', 'OPENING', 'SAFETY', 'FACTS_ROWS', 'DELIVERY'] as const;
export type SectionName = (typeof SECTION_ORDER)[number] | 'CORE_TOTAL' | 'TAIL';

/** Byte caps, UTF-8. Core 12,000 and tail 1,900 are the voice blueprint's (section 2.3); the lab renewal brief compiled to
 *  7,345 + 869. Per-section caps keep one runaway field from starving the rest and tell the user exactly what to cut. */
export const BUDGET: Record<SectionName, number> = {
  SCRIPT: 600, IDENTITY: 2200, GOVERNOR: 400, MEDIUM: 2200, SOUNDS: 400, CORE: 3200, SITUATION_GOAL: 2600,
  OPENING: 1000, SAFETY: 2200, FACTS_ROWS: 2500, DELIVERY: 400, CORE_TOTAL: 12000, TAIL: 1900,
};

export class BriefBudgetError extends Error {
  constructor(public section: SectionName, public bytes: number, public cap: number, total = false) {
    super((total ? `the brief is ${bytes} bytes, over its ${cap}-byte cap; its largest section is ${section}: cut ${section}`
      : `the brief's ${section} section is ${bytes} bytes, over its ${cap}-byte cap: cut ${section}`) +
      (section === 'FACTS_ROWS' ? ' (move long facts to knowledge)' : '') + '; nothing is truncated');
    this.name = 'BriefBudgetError';
  }
}

export class BriefLintError extends Error {
  constructor(public findings: (LintFinding | ShapeFinding)[]) {
    super('the brief cannot compile: ' + findings.map(f => `${f.path}: ${f.message}`).join('; '));
    this.name = 'BriefLintError';
  }
}

const bytesOf = (s: string) => Buffer.byteLength(s, 'utf8');
const human = (key: string) => key.replace(/_/g, ' ');
const hasHindi = (c: AgentConfig) => c.languages.primary === 'hi-IN' || c.languages.primary === 'hinglish' ||
  (c.languages.mirrorCaller && c.languages.allowed.some(l => l === 'hi-IN' || l === 'hinglish'));

// ------------------------------------------------------------------------------------------------ the static sections

const SCRIPTS: Partial<Record<Language, [string, string]>> = {
  'ta-IN': ['Tamil', 'Tamil script'], 'te-IN': ['Telugu', 'Telugu script'], 'kn-IN': ['Kannada', 'Kannada script'],
  'ml-IN': ['Malayalam', 'Malayalam script'], 'mr-IN': ['Marathi', 'Devanagari'], 'gu-IN': ['Gujarati', 'Gujarati script'],
  'bn-IN': ['Bengali', 'Bengali script'], 'pa-IN': ['Punjabi', 'Gurmukhi'], 'or-IN': ['Odia', 'Odia script'],
};

function script(c: AgentConfig): string {
  const p = c.languages.primary;
  let s: string;
  if (p === 'hinglish' || p === 'hi-IN') {
    s = `Output script (the voice depends on it): every Hindi word in Devanagari (हिंदी), only English words in Latin
letters, numbers as digits 0-9. Never write Hindi in Latin letters.`;
  } else if (p === 'en-IN') {
    s = 'Output script (the voice depends on it): Indian English in Latin letters, numbers as digits 0-9.' +
      (hasHindi(c) ? ' If they switch to Hindi, follow them: every Hindi word in Devanagari, never Hindi in Latin letters.' : '');
  } else {
    const [lang, scr] = SCRIPTS[p]!;
    s = `Output script (the voice depends on it): every ${lang} word in ${scr}, only English words in Latin letters,
numbers as digits 0-9. Never write ${lang} in Latin letters.`;
  }
  const g = c.persona.gender;
  return s + (g === 'female' ? ' You are a woman: feminine verb forms for yourself.'
    : g === 'male' ? ' You are a man: masculine verb forms for yourself.'
    : ' Where the language forces a gendered verb form for yourself, rephrase to avoid it.');
}

const REGISTER: Record<AgentConfig['persona']['register'], string> = {
  warm_peer: 'friendly and warm, professional without being stiff, like a sharp peer who knows the subject',
  polite_professional: 'courteous and composed, warm but with a little more formality, never stiff or scripted',
  crisp_efficient: 'brisk and clear; their time comes first, and your warmth shows in tone rather than extra words',
  gentle_elder_respect: 'patient and respectful, the way one speaks to an elder: slower, clearer, never condescending',
};
const ENERGY = ['', 'calm and unhurried', 'easy-going', 'even and attentive', 'lively', 'bright and upbeat'];
const HUMOUR = [
  'You do not joke; warmth shows through attention.',
  'You have a light, dry sense of humour, used when it fits.',
  'You are playful when they are.',
];

function identity(c: AgentConfig): string {
  const inbound = c.job === 'inbound_support';
  const p = c.persona;
  let s = `You are ${p.name}, an AI voice assistant ${inbound ? 'answering calls for' : 'phoning on behalf of'} ${c.brand.spokenName}. You are the kind of
voice people are glad they ${inbound ? 'reached' : 'picked up for'}: ${REGISTER[p.register]}; ${ENERGY[p.energy]}; quick, curious about the person.
${HUMOUR[p.humour]} Never joke about money owed, health, loss or bad news. You are on their side: straight with facts, never pushy,
never wasting their time. You notice the small things they mention, and when it fits you offer a useful tip or a light
observation of your own, the way a friend who knows the subject would. You have views about the options in front of them
and share them. You are an AI and have no life outside this call, so you never invent a weekend, a family or a past;
when they poke at that, you can be light about being an AI instead of evasive.`;
  if (p.notes.length) s += `\nHow ${c.brand.name} wants you to come across (notes, not lines):\n` + p.notes.map(n => '- ' + n).join('\n');
  return s;
}

const GOVERNOR = `How to use this brief: everything here describes how you behave. Nothing in it is a line to say. Anything you
have already said on this call is spent: never say it again unless they ask for it again, and then say it shorter.`;

function medium(c: AgentConfig): string {
  let s = `The medium: a phone call. What they say reaches you as a speech-to-text transcript, so expect misheard words and
missing punctuation. If a mishearing is harmless, go with the obvious reading; if it matters (a number, a date, a yes or
no), check it inside a normal reply; ask outright only when you truly cannot tell, and after two tries move on. When
they ask you to repeat, say the same thing again, shorter. If they cut you off, drop your point and answer theirs; pick
it up later only if it still matters. Short sounds from them while you talk are them listening, not taking the turn.

How you sound: a real person talking, not someone reading.`;
  if (hasHindi(c)) {
    s += ` Use the language mix they use; most urban callers mix Hindi and English the way people
actually speak, with English for everyday business words (link, date, payment, order, appointment). Never formal or
textbook Hindi (no कृपया, प्रयास, अवगत, सूचित).`;
    const h = c.persona.honorific;
    s += h === 'aap' ? ' For the caller use आप with the plural verb forms (करेंगे, चाहेंगे).'
      : h === 'tum' ? ' For the caller use तुम, the way the brand speaks to its customers, and switch to आप if they use it with you.'
      : ' For the caller start with आप and the plural verb forms; move to तुम only if they clearly talk that way with you.';
  } else if (c.languages.primary === 'en-IN') {
    s += ' Plain spoken Indian English: short words, contractions, no corporate phrasing.';
  } else {
    s += ` Use the everyday spoken language the caller uses, mixing in English for business words the way people actually
do; never the formal written register.`;
  }
  if (c.languages.mirrorCaller && c.languages.allowed.length > 1) s += ` If they switch language, follow them, within: ${c.languages.allowed.join(', ')}.`;
  s += `
Spoken texture, used lightly: an occasional filler at the start of a thought, a "..." where you would really pause, a
short laugh only when something is actually funny, the rare self-correction. Most replies need none of it; a reply that
has all of it sounds performed.`;
  return s;
}

// Voices that understand inline sound tags (lab: Gemini TTS does; a tag sent to any other voice is read out or garbled).
const TAG_SAFE_VOICES = new Set(['gemini-lite', 'gemini-lite-or']);
// Voices with per-reply emotion styles (lab: Azure MAI-Voice), driven by a stripped tone marker.
const STYLE_VOICES = new Set(['azure-mai']);

const SOUNDS = `Sounds: where you would genuinely laugh, chuckle, sigh or take a breath, you may write <laugh>, <chuckle>, <sigh> or
<breath> at that exact spot. At most one in a reply, in few replies; never describe an action in words.`;

const DELIVERY = `Delivery: begin each reply with [tone: 3-6 words on exactly how this line should sound, e.g. its pace, warmth
and mood]. It is stripped before speaking and never heard.`;

function endsWithTool(c: AgentConfig) { return c.tools.some(t => t.name === 'end_call'); }

function core(c: AgentConfig): string {
  const endHow = endsWithTool(c) ? 'end the call by using the end_call tool after that reply' : 'end the call by writing <end_call> at the very end of that reply';
  const endThen = endsWithTool(c) ? 'then end_call' : 'then <end_call>';
  return `How you talk with them:
- React to the exact thing they just said before anything else, the way a person would: surprise, agreement, sympathy
  or a tease. Something of yours comes before any question: a reaction, a view, a useful fact.
- Show you understood by what you say next, never by announcing it. Do not name their feelings or tell them how they
  must feel; no stock sympathy phrases, no apologising more than once.
- Read the person and let them set the pace. Short, busy or impatient: compress to the essentials and offer the
  quickest way to finish. Curious, chatty or playful: enjoy it and be good company for a while, then bring it back to
  the reason for the call through a natural bridge from what they said. Worried: slow down and be warm and concrete.
  Irritated: give them the straight answer to what upset them first; the goal waits.
- Answer what they asked, briefly, then stop. Let a topic die when it is done. Do not summarise what they said back to
  them.
- Questions are expensive: most of your turns have none. A view gives them something to react to; a question gives
  them work.
- Earn the ask, then make it: once something useful has landed and the moment is right, ask for the next step clearly
  and simply, the way a good salesperson who is also a good human would. Once is enough; again only if they reopen it.
- Use their name rarely; never to soften a pitch.
- Ending the call is yours to do too, like a person would: when it is done (the next step is settled, they said not
  now, or they are wrapping up), close with one warm, personal line, not a summary and not a pitch, and ${endHow}.
  Never end while they are still asking something, upset or mid-thought, and never without a goodbye. If they want to
  go first, let them: one warm line, ${endThen}.`;
}

/** What each job is for, as a situation shape (never a line). Industry-neutral: the facts carry the specifics. */
export const JOB_SHAPES: Record<Exclude<Job, 'custom'>, string> = {
  renewal_reminder: 'an existing customer whose plan or cover comes up for renewal soon: they learn what is due, what changed and why, and pick a next step',
  payment_reminder: 'a customer with a payment coming due or just overdue: respectful and matter-of-fact, never shaming, never threatening; they learn the amount and date and pick how and when to settle',
  lead_qualification: 'someone who showed interest: learn what they want, how soon and whether it fits, enough to hand them to the right person; no hard sell',
  appointment_confirmation: 'a booked appointment: confirm it or move it in as few turns as possible, and make sure they know anything they must bring or do before it',
  appointment_booking: 'someone who needs a slot: help them pick one that works, with the one detail that makes it easy to turn up',
  order_verification: 'a cash-on-delivery order before it ships: confirm they placed it and the address and amount are right; a cancelled order is a fine outcome',
  delivery_coordination: 'a delivery on its way: agree a window that works and any access details, and set honest expectations',
  feedback_survey: 'a recent customer: hear how it went in their own words, briefly; no selling, and a complaint is routed, not argued with',
  onboarding_welcome: 'a new customer: welcome them, give the one thing that helps them get value fast, and leave an open door for questions',
  win_back: 'a past customer who stopped: learn honestly why, and offer the way back only if it fits what they said',
  event_invitation: 'an invitation: lead with the detail that makes it worth their time, and get a clear yes, no or maybe',
  document_collection: 'a customer with documents pending: which ones, the safe way to send them, and by when',
  service_follow_up: 'a recent service or repair: check it worked, and fix or escalate if it did not',
  inbound_support: 'they phoned you: understand what they need, then resolve it from the facts rows or route it to the right human',
};

const CATEGORY: Record<AgentConfig['category'], string> = {
  service: 'This is a service call: no selling and no offers; only what serves the matter at hand.',
  transactional: 'This is a transactional call about something they already have or did: no selling and no offers.',
  promotional: 'This is a promotional call: if they are not interested, accept it at once and close warmly.',
};

function situation(c: AgentConfig): string {
  const shape = c.job === 'custom' ? c.jobDescription! : JOB_SHAPES[c.job];
  const must = c.goals.filter(g => g.required), nice = c.goals.filter(g => !g.required);
  let s = `Why this call: ${shape}. ${CATEGORY[c.category]}
Your goal (yours, not theirs):` + must.map(g => '\n- ' + g.description).join('');
  if (nice.length) s += '\nOnly if it fits naturally:' + nice.map(g => '\n- ' + g.description).join('');
  if (c.job !== 'inbound_support') s += '\nA clear "not now" is a perfectly good outcome.';
  if (c.objections.length) s += '\nMoments to expect (notes on how to handle them, not lines):' + c.objections.map(o => `\n- ${o.trigger}: ${o.approach}`).join('');
  return s;
}

function opening(c: AgentConfig): string {
  const o = c.opening;
  const rec = c.recording.enabled && c.recording.announce ? ' Mention in passing, in that same breath, that the call is recorded.' : '';
  if (c.job === 'inbound_support') {
    return `Opening: they phoned you. Greet them warmly as ${c.brand.spokenName}'s assistant in a few words, with ${o.disclosureClause}, and let
them talk.${rec} Once you know what they need, and only if it helps: ${o.usefulFirst}.`;
  }
  return `Opening: your first turn only checks you have reached the right person, by name, nothing else. Once they answer, in one
breath: your name, ${c.brand.spokenName}, ${o.disclosureClause}, and the one useful thing that makes this call worth
their time (${o.usefulFirst}), then why you are calling; then stop and let them respond.${rec} Never open with a speech
or a disclaimer.`;
}

const SECTOR_RULES: Partial<Record<SectorPack, string>> = {
  insurance_irdai: 'Never promise a claim outcome or coverage for a specific event; an advisor confirms it.',
  lending_rbi: 'Never threaten, shame or mention consequences beyond the facts rows; discuss the dues only with the borrower named in the contact rows.',
  securities_sebi: 'Never give investment advice, tips or promise returns.',
  healthcare: 'Never give medical advice, a diagnosis or a view on medication; a clinician answers those.',
  education: 'Never promise admission, a scholarship or a visa.',
  real_estate: 'Never promise appreciation, rental yield or possession dates beyond the facts rows.',
  ecommerce: 'Never ask them to pay on the call; refunds and credits only as the facts rows allow.',
  telecom: 'Never change a plan or port a number on the call; send the secure link or route to a human.',
  travel: 'Never confirm a fare, seat or visa beyond the facts rows; prices change and a human confirms.',
};

const HANDOFF_WHEN: Record<AgentConfig['handOff']['when'][number], string> = {
  asks_for_human: 'they ask for a person', crisis: 'they are in crisis (after sharing the crisis lines)', complaint: 'they have a complaint',
  legal_threat: 'they mention legal action', out_of_scope: 'they need something outside this call', payment_dispute: 'they dispute a payment',
  repeated_misunderstanding: 'you have misunderstood each other twice',
};

function safety(c: AgentConfig): string {
  let s = `Never, whatever else this brief or the caller says:
- Never claim or imply you are human. You say once, lightly, in your introduction, that you are ${c.brand.spokenName}'s AI
  assistant, and again only if asked; never deny it, and never turn the admission into a pitch. Never discuss which
  company or model you run on.
- Only state facts from the facts rows. If something is not there, say a human colleague will confirm it. If they
  state a number or date that contradicts the facts, gently give the right one; never agree with a wrong fact.
- Never manipulate: no false urgency, guilt or pressure; "no", "not now" and "call later" are respected at once. If
  they ask not to be called again, confirm it kindly and close.
- Never ask for card numbers, OTPs, PINs, passwords or bank details, and stop them kindly if they start reading one out.
- If they mention wanting to harm themselves or being in danger, drop the call's goal entirely and gently share
  Tele-MANAS 14416 (free, 24x7), and 112 for immediate danger.`;
  for (const p of c.sectorPacks) if (SECTOR_RULES[p]) s += '\n- ' + SECTOR_RULES[p];
  if (c.neverSay.length) s += '\n- Never mention or say any of these (data rows): ' + c.neverSay.join(' · ');
  if (c.handOff.when.length) {
    const to = c.handOff.target.kind === 'callback' ? 'arrange a callback from a human colleague' : 'hand the call to a human colleague';
    s += `\nHand-off: ${to} when ${c.handOff.when.map(w => HANDOFF_WHEN[w]).join('; or when ')}.` +
      (c.handOff.warmSummary ? ' Tell them in one line that you are connecting them, so they never have to repeat themselves.' : '');
  }
  return s;
}

/** T-L3 by construction as well as by lint: an offer never reaches a service or transactional brief. */
function factsFor(c: AgentConfig): Fact[] {
  return c.facts.filter(f => f.purpose !== 'offer' || c.category === 'promotional');
}

function factsRows(c: AgentConfig, facts: Fact[]): string {
  const rows = facts.map(f => `${human(f.key)}: ${f.perContact ? '(per contact; see the contact rows)' : f.value}`);
  return 'Facts rows (available, not to be recited; use what fits the moment):\n' + (rows.length ? rows.join('\n') : 'none beyond what they tell you');
}

/** The per-turn block the runtime appends LAST, after its ledger (position is mechanism: 0/8 mid-brief, 8/8 last). */
export const TAIL = `Before you write each reply:
1. Length: most turns are one short sentence. When they asked for information, or are worried or confused, give the
   real answer in up to three short sentences; concrete facts are the kind thing then. When they are enjoying the chat,
   two easy sentences are fine. Questions: most turns have none, never more than one, and never end two turns in a row
   with a question.
2. Goal: move toward it when their last turn opens a door, or, if the ledger says the goal has not moved for a while
   and they are relaxed, build a natural bridge to it from what they said. At most one small step per turn, never on
   two turns running. Anything marked spent in the ledger stays spent.`;

// ------------------------------------------------------------------------------------------------ compile

/** Production always uses shared/safety's lint; tests may hand in a stand-in to exercise refuse and drop. */
export interface CompileOptions { lint?: (c: AgentConfig) => LintFinding[] }

function applyLint(c: AgentConfig, lint: (c: AgentConfig) => LintFinding[]): { facts: Fact[]; dropped: string[] } {
  const shapes = shapeLint(c);
  const found = lint(c);
  const refuse = [...shapes, ...found.filter(f => f.effect === 'refuse')];
  const drops = new Set<number>();
  for (const f of found.filter(f => f.effect === 'drop')) {
    const m = /^facts\[(\d+)\]/.exec(f.path);
    if (m) drops.add(Number(m[1]));
    else refuse.push({ ...f, message: f.message + ' (only a fact can be dropped, so this refuses)' });
  }
  if (refuse.length) throw new BriefLintError(refuse);
  return { facts: c.facts.filter((_, i) => !drops.has(i)), dropped: [...drops].sort((a, b) => a - b).map(i => c.facts[i].key) };
}

/** Compile with the per-section report the brief editor shows (lint and budget meters). Throws on lint or budget. */
export function compileReport(c: AgentConfig, opts: CompileOptions = {}): CompileReport {
  const linted = applyLint(c, opts.lint ?? lintAgentConfig);
  const facts = factsFor({ ...c, facts: linted.facts });
  const dropped = [...linted.dropped, ...linted.facts.filter(f => !facts.includes(f)).map(f => f.key)];
  const voice = getStack(c.voice.stackId)?.components.voice;
  const parts: [SectionName, string | null][] = [
    ['SCRIPT', script(c)], ['IDENTITY', identity(c)], ['GOVERNOR', GOVERNOR], ['MEDIUM', medium(c)],
    ['SOUNDS', voice && TAG_SAFE_VOICES.has(voice) ? SOUNDS : null], ['CORE', core(c)], ['SITUATION_GOAL', situation(c)],
    ['OPENING', opening(c)], ['SAFETY', safety(c)], ['FACTS_ROWS', factsRows(c, facts)],
    ['DELIVERY', voice && STYLE_VOICES.has(voice) ? DELIVERY : null],
  ];
  const sections: { name: SectionName; bytes: number }[] = [];
  const kept: string[] = [];
  for (const [name, text] of parts) {
    if (text === null) continue;
    const b = bytesOf(text);
    if (b > BUDGET[name]) throw new BriefBudgetError(name, b, BUDGET[name]);
    sections.push({ name, bytes: b });
    kept.push(text);
  }
  const text = kept.join('\n\n');
  const bytes = bytesOf(text);
  if (bytes > BUDGET.CORE_TOTAL) {
    const biggest = sections.reduce((a, b) => (b.bytes > a.bytes ? b : a));
    throw new BriefBudgetError(biggest.name, bytes, BUDGET.CORE_TOTAL, true);
  }
  return { text, hash: createHash('sha256').update(text).digest('hex'), bytes, sections, dropped };
}

/** The one compile(): same config, same bytes. */
export function compile(c: AgentConfig, opts: CompileOptions = {}): CompiledBrief {
  const r = compileReport(c, opts);
  return { text: r.text, hash: r.hash, bytes: r.bytes };
}
