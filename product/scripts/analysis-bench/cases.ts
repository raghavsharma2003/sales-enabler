// Synthetic, fictional calls for the analysis-quality bench, each with a hand-written key. Templates are written by
// hand once; each is expanded across six industries (horizontal, not one sector) and, for four of them, Tamil-,
// Bengali- and Marathi-English callers. Every name, brand, number and amount is invented. No real person's words.
//
// A key says what a careful human reading the transcript would record:
//   outcome      the outcome value, or null when the call does not show one
//   reasonCode   the catalogue code (taxonomy.ts); reasonAlt lists codes a careful reader could also defend
//   moments      kinds that must be found, each with the transcript line that shows it
//   crisis/optOut  whether the person said either
//   followUps    what the business owes after the call: 'callback' (a call back was asked for), 'human' (a person must take it)
import type { EndReason } from '../../shared/runtime-protocol.ts';

export const OUTCOME_VALUES = ['agreed', 'callback', 'not_interested', 'needs_human', 'wrong_person'] as const;
export const GOAL_VALUES = ['agreed'];
export type MomentKind = 'objection' | 'question' | 'commitment' | 'opt_out' | 'callback_request' | 'confusion';

export interface Line { speaker: 'agent' | 'caller'; text: string }
export interface Key {
  outcome: (typeof OUTCOME_VALUES)[number] | null; outcomeLine?: number;
  reasonCode: string; reasonAlt?: string[];
  moments: { kind: MomentKind; line: number }[];
  crisis: boolean; optOut: boolean; followUps: ('callback' | 'human')[];
}
export type Split = 'dev' | 'test';
export interface Case { id: string; split: Split; template: string; industry: string; language: string; lines: Line[]; endReason: EndReason; durationS: number; key: Key }

interface Industry { id: string; brand: string; about: string; ask: string; agree: string }
export const INDUSTRIES: Industry[] = [
  { id: 'lending', brand: 'Saral Finance', about: 'Aapki loan ki EMI ke baare mein call kiya hai.', ask: 'Kya aap is mahine ki EMI 5 tareekh tak bhar denge?', agree: 'Haan, 5 tareekh tak EMI bhar dunga.' },
  { id: 'ecommerce', brand: 'Kirana Kart', about: 'Aapke kal wale order ke baare mein call kiya hai.', ask: 'Order confirm kar doon? Cash on delivery 1,299 rupaye hoga.', agree: 'Haan, order confirm kar do.' },
  { id: 'healthcare', brand: 'Sehat Clinic', about: 'Aapke appointment ke baare mein call kiya hai.', ask: 'Kal subah 10 baje ka appointment confirm kar doon?', agree: 'Haan, kal 10 baje aa jaungi.' },
  { id: 'education', brand: 'Udaan Academy', about: 'Aapke bachche ke admission ke baare mein call kiya hai.', ask: 'Kya aap admission form is hafte bhar denge?', agree: 'Haan, is hafte form bhar denge.' },
  { id: 'telecom', brand: 'Jhatpat Mobile', about: 'Aapka plan kal khatam ho raha hai, isliye call kiya hai.', ask: 'Kya main 299 wala recharge abhi kar doon?', agree: 'Haan, 299 wala recharge kar do.' },
  { id: 'realestate', brand: 'Nivas Homes', about: 'Aapne naye flat ke baare mein poochha tha, isliye call kiya hai.', ask: 'Kya Saturday ko site visit fix kar doon?', agree: 'Haan, Saturday ko aa jayenge.' },
];

const A = (text: string): Line => ({ speaker: 'agent', text });
const C = (text: string): Line => ({ speaker: 'caller', text });
const open = (i: Industry) => A(`Namaste, main Asha bol rahi hoon ${i.brand} se, ek AI assistant. ${i.about}`);

interface Template { id: string; build(i: Industry): { lines: Line[]; endReason?: EndReason; durationS?: number; key: Key } }

const TEMPLATES: Template[] = [
  { id: 'agreed', build: i => ({ lines: [open(i), C('Haan boliye.'), A(i.ask), C(i.agree), A('Dhanyavaad, main confirmation bhej deti hoon.')],
    key: { outcome: 'agreed', outcomeLine: 3, reasonCode: 'CONV_GOAL_DONE', moments: [{ kind: 'commitment', line: 3 }], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'callback', build: i => ({ lines: [open(i), C('Abhi main gaadi chala raha hoon, shaam 6 baje ke baad call karna.'), A('Ji zaroor, main shaam 6 baje ke baad call karungi.')],
    key: { outcome: 'callback', outcomeLine: 1, reasonCode: 'CONV_CALLBACK', moments: [{ kind: 'callback_request', line: 1 }], crisis: false, optOut: false, followUps: ['callback'] } }) },
  { id: 'not_interested', build: i => ({ lines: [open(i), C('Haan boliye.'), A(i.ask), C('Nahi, mujhe abhi iski zaroorat nahi hai, bahut mehenga hai.'), A('Samajh gayi, aapka samay dene ke liye dhanyavaad.')],
    key: { outcome: 'not_interested', outcomeLine: 3, reasonCode: 'CONV_NOT_INTERESTED', reasonAlt: ['CONV_OBJECTION_UNRESOLVED'], moments: [{ kind: 'objection', line: 3 }], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'wrong_person', build: i => ({ lines: [open(i), C('Main unka bhai bol raha hoon, Ramesh ji ghar par nahi hain.'), A('Koi baat nahi, main baad mein unse baat kar lungi.')],
    key: { outcome: 'wrong_person', outcomeLine: 1, reasonCode: 'CONV_WRONG_PERSON', moments: [], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'opt_out', build: i => ({ lines: [open(i), C('Mujhe dobara call mat karna, mera number list se hata do.'), A('Ji, main aapka number hata deti hoon. Maafi chahti hoon.')], endReason: 'opt_out',
    key: { outcome: 'not_interested', outcomeLine: 1, reasonCode: 'END_OPTED_OUT', moments: [{ kind: 'opt_out', line: 1 }], crisis: false, optOut: true, followUps: [] } }) },
  { id: 'complaint', build: i => ({ lines: [open(i), C('Pichhli baar bhi galat charge kiya tha, mujhe kisi insaan se baat karni hai.'), A('Main samajh sakti hoon, main aapki baat team tak pahuncha deti hoon.')],
    key: { outcome: 'needs_human', outcomeLine: 1, reasonCode: 'CONV_COMPLAINT', reasonAlt: ['CONV_NEEDS_HUMAN'], moments: [{ kind: 'objection', line: 1 }], crisis: false, optOut: false, followUps: ['human'] } }) },
  { id: 'question_then_agreed', build: i => ({ lines: [open(i), C('Pehle yeh batao, kya iska koi extra charge lagega?'), A('Nahi, koi extra charge nahi lagega.'), C(i.agree), A('Dhanyavaad, main confirmation bhej deti hoon.')],
    key: { outcome: 'agreed', outcomeLine: 3, reasonCode: 'CONV_GOAL_DONE', moments: [{ kind: 'question', line: 1 }, { kind: 'commitment', line: 3 }], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'language_mismatch', build: i => ({ lines: [open(i), C('Enakku Hindi theriyadhu, Tamil-la pesunga please.'), A('Maaf kijiye, main abhi sirf Hindi aur English mein baat kar sakti hoon.'), C('Puriyala, sorry.')],
    key: { outcome: null, reasonCode: 'CONV_LANGUAGE_MISMATCH', reasonAlt: ['CONV_CONFUSED'], moments: [{ kind: 'confusion', line: 3 }], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'crisis', build: i => ({ lines: [open(i), C('Sab khatam ho gaya hai, ab jeene ka mann nahi karta.'), A('Aap akele nahi hain. Tele-MANAS 14416 par abhi baat kar sakte hain, main ek insaan ko bhi jod rahi hoon.')], endReason: 'crisis_handoff',
    key: { outcome: null, reasonCode: 'END_CRISIS', moments: [], crisis: true, optOut: false, followUps: ['human'] } }) },
  { id: 'early_hangup', build: i => ({ lines: [open(i), C('Kaun?')], endReason: 'caller_hung_up', durationS: 5,
    key: { outcome: null, reasonCode: 'END_EARLY_HANGUP', moments: [], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'no_answer', build: () => ({ lines: [], endReason: 'no_answer', durationS: 0,
    key: { outcome: null, reasonCode: 'DIAL_NO_ANSWER', moments: [], crisis: false, optOut: false, followUps: [] } }) },
  { id: 'objection_resolved', build: i => ({ lines: [open(i), C('Pichhli baar aap logon ne bahut der kar di thi.'), A('Maafi chahti hoon, is baar hum isse priority par rakhenge.'), C(i.agree), A('Dhanyavaad, main confirmation bhej deti hoon.')],
    key: { outcome: 'agreed', outcomeLine: 3, reasonCode: 'CONV_GOAL_DONE', moments: [{ kind: 'objection', line: 1 }, { kind: 'commitment', line: 3 }], crisis: false, optOut: false, followUps: [] } }) },
];

// Regional callers for four templates. The agent opens in Hinglish and then mirrors in simple English.
const REGIONAL: Record<string, { agree: string; callback: string; notInterested: string; optOut: string }> = {
  'tamil-english': { agree: 'Sari, naan kandippa pannidaren.', callback: 'Ippo busy-a irukken, saayangalam 6 manikku call pannunga.',
    notInterested: 'Illa, enakku idhu venam, romba costly-a irukku.', optOut: 'Thirumba call pannaadheenga, en number-a list-la irundhu remove pannunga.' },
  'bengali-english': { agree: 'Haan, ami kore debo, thik ache.', callback: 'Ekhon ami office-e achi, sondhe 6-tar pore phone korun.',
    notInterested: 'Na, amar eta lagbe na, khub expensive.', optOut: 'Amake ar phone korben na, amar number ta list theke bad din.' },
  'marathi-english': { agree: 'Ho, mi nakki karto.', callback: 'Atta mi busy aahe, sandhyakali 6 nantar call kara.',
    notInterested: 'Nako, mala he nako, khup mahag aahe.', optOut: 'Mala parat call karu naka, maza number list madhun kadha.' },
};

function regional(lang: string, i: Industry, langIndex: number): Case[] {
  const r = REGIONAL[lang];
  const opening = open(i);
  let n = 0;
  // Stratified: each regional template is DEV in some languages and TEST in others, and each language has 2 of each.
  const base = (template: string, lines: Line[], key: Key, endReason: EndReason = 'completed'): Case =>
    ({ id: `${template}.${i.id}.${lang}`, split: (n++ + langIndex) % 2 === 0 ? 'dev' : 'test', template, industry: i.id, language: lang, lines, endReason, durationS: 40, key });
  return [
    base('agreed', [opening, C('Yes, sollunga / boliye.'), A(`${i.ask} (Can you confirm?)`), C(r.agree), A('Thank you, I will send the confirmation.')],
      { outcome: 'agreed', outcomeLine: 3, reasonCode: 'CONV_GOAL_DONE', moments: [{ kind: 'commitment', line: 3 }], crisis: false, optOut: false, followUps: [] }),
    base('callback', [opening, C(r.callback), A('Sure, I will call you after 6 in the evening.')],
      { outcome: 'callback', outcomeLine: 1, reasonCode: 'CONV_CALLBACK', moments: [{ kind: 'callback_request', line: 1 }], crisis: false, optOut: false, followUps: ['callback'] }),
    base('not_interested', [opening, C('Yes?'), A(`${i.ask} (Can you confirm?)`), C(r.notInterested), A('Understood, thank you for your time.')],
      { outcome: 'not_interested', outcomeLine: 3, reasonCode: 'CONV_NOT_INTERESTED', reasonAlt: ['CONV_OBJECTION_UNRESOLVED'], moments: [{ kind: 'objection', line: 3 }], crisis: false, optOut: false, followUps: [] }),
    base('opt_out', [opening, C(r.optOut), A('Understood, I will remove your number. Sorry for the trouble.')],
      { outcome: 'not_interested', outcomeLine: 1, reasonCode: 'END_OPTED_OUT', moments: [{ kind: 'opt_out', line: 1 }], crisis: false, optOut: true, followUps: [] }, 'opt_out'),
  ];
}

/** 72 Hinglish cases (12 templates x 6 industries) plus 12 regional ones (4 templates x 3 languages), split DEV/TEST
 *  half and half, stratified by call type and language: each Hinglish template has 3 industries in DEV and 3 in TEST.
 *  Tune prompts on DEV only; TEST is for the number you report. */
export function perCallCases(): Case[] {
  const out: Case[] = [];
  for (const t of TEMPLATES) for (const [k, i] of INDUSTRIES.entries()) {
    const b = t.build(i);
    out.push({ id: `${t.id}.${i.id}.hinglish`, split: k % 2 === 0 ? 'dev' : 'test', template: t.id, industry: i.id, language: 'hinglish', lines: b.lines,
      endReason: b.endReason ?? 'completed', durationS: b.durationS ?? 40, key: b.key });
  }
  const langs = Object.keys(REGIONAL);
  langs.forEach((lang, n) => out.push(...regional(lang, INDUSTRIES[(n * 2) % INDUSTRIES.length], n)));
  return out;
}

// ---- cross-call slice: planted objection themes ---------------------------------------------------------------------
export const PLANTED = {
  price: ['Yeh bahut mehenga hai, mere budget mein nahi hai.', 'Itna paisa main abhi nahi de sakta, kaafi costly hai.', 'Rate zyada hai, doosri jagah sasta mil raha hai.'],
  already_have: ['Mere paas pehle se ek le rakha hai, doosra nahi chahiye.', 'Yeh service main pehle se kisi aur company se le raha hoon.', 'Ghar mein already ek hai, abhi zaroorat nahi hai.'],
  trust: ['Mujhe kaise pata aap asli company se ho? Fraud lagta hai.', 'Aajkal bahut scam calls aati hain, main bharosa nahi kar sakta.', 'Pehle apni company ki website bhejo, phone pe kuch confirm nahi karunga.'],
} as const;
export type PlantedTheme = keyof typeof PLANTED;
export interface CrossCall { id: string; split: Split; theme: PlantedTheme | null; lines: Line[]; outcome: string | null; outcomeLine: number }

/** perTheme calls for each planted objection theme, plus perTheme neutral calls that agree. 36 by default. */
export function crossCallCases(perTheme = 9): CrossCall[] {
  const out: CrossCall[] = [];
  for (const theme of Object.keys(PLANTED) as PlantedTheme[]) {
    for (let k = 0; k < perTheme; k++) {
      const i = INDUSTRIES[k % INDUSTRIES.length];
      out.push({ id: `${theme}.${k}`, split: k % 2 === 0 ? 'dev' : 'test', theme, outcome: 'not_interested', outcomeLine: 3,
        lines: [open(i), C('Haan boliye.'), A(i.ask), C(PLANTED[theme][k % 3]), A('Samajh gayi, aapka samay dene ke liye dhanyavaad.')] });
    }
  }
  for (let k = 0; k < perTheme; k++) {
    const i = INDUSTRIES[k % INDUSTRIES.length];
    out.push({ id: `neutral.${k}`, split: k % 2 === 0 ? 'dev' : 'test', theme: null, outcome: 'agreed', outcomeLine: 3, lines: [open(i), C('Haan boliye.'), A(i.ask), C(i.agree), A('Dhanyavaad.')] });
  }
  return out;
}
