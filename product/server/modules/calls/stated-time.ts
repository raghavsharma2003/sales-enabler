// When a caller says when to call back ("shaam 6 baje", "kal subah 10 baje", "2 ghante baad", "after 6 pm"), the time
// they stated, in India time. Code reads it from their own words; nothing is guessed: no time in the words, no time.
// Returns the instant and the exact words it came from (shown on the callback task). Hinglish and English.
const IST_MS = 330 * 60_000;

export interface StatedTime { at: Date; quote: string }

/** Wall-clock parts of `d` in IST. */
const istParts = (d: Date) => { const x = new Date(d.getTime() + IST_MS); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), min: x.getUTCMinutes() }; };
const istInstant = (y: number, m: number, d: number, h: number, min: number) => new Date(Date.UTC(y, m, d, h, min) - IST_MS);

const NUM: Record<string, number> = { ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const n = (s: string) => /^\d+$/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? NaN;
const WORD = '(?:\\d{1,2}|ek|do|teen|chaa?r|paa?nch|chhe|chhah|saat|aath|nau|das|gyarah|barah|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';  // non-capturing: callers wrap it

export function statedTime(text: string, now: Date = new Date()): StatedTime | null {
  const t = text.toLowerCase();
  // Relative: "2 ghante baad", "aadhe ghante mein", "30 minute baad", "in 2 hours", "after 20 minutes".
  const rel = new RegExp(`(?:in |after )?(aadhe|half an?|${WORD})\\s*(ghante|ghanta|hours?|hrs?|minute|minutes|mins?)\\s*(baad|mein|me|later)?`, 'i').exec(t);
  if (rel && (rel[3] || /^(in|after) /.test(rel[0]))) {
    const amount = /^(aadhe|half)/.test(rel[1]) ? 0.5 : n(rel[1]);
    const hours = /^(ghant|hour|hr)/.test(rel[2]);
    if (Number.isFinite(amount) && amount > 0) return { at: new Date(now.getTime() + amount * (hours ? 3_600_000 : 60_000)), quote: text.slice(rel.index, rel.index + rel[0].length).trim() };
  }
  // Clock time: "6 baje", "shaam 6:30 baje", "6 pm", "10 am", "6 ke baad", "after 6".
  const clock = new RegExp(`(?:(subah|morning|dopahar|afternoon|shaam|sham|evening|raat|night)\\s+)?(?:after\\s+)?(${WORD})(?:[:.](\\d{2}))?\\s*(baje|bajey|o'?clock|am|pm|a\\.m\\.|p\\.m\\.|ke baad|ke bad)`, 'i').exec(t);
  if (!clock) return null;
  let h = n(clock[2]); const min = clock[3] ? Number(clock[3]) : 0;
  if (!Number.isFinite(h) || h < 0 || h > 23 || min > 59) return null;
  const part = clock[1] ?? (/(subah|morning|dopahar|afternoon|shaam|sham|evening|raat|night)/.exec(t)?.[1]);
  const mark = clock[4];
  if (/^p/.test(mark) && h < 12) h += 12;
  else if (/^a/.test(mark) && h === 12) h = 0;
  else if (!/^[ap]/.test(mark) && h <= 12) {
    if (part && /dopahar|afternoon/.test(part)) { if (h < 7) h += 12; }
    else if (part && /shaam|sham|evening|raat|night/.test(part)) { if (h < 12) h += 12; }
    else if (!part && h >= 1 && h <= 7) h += 12;                     // "6 baje" on a working day means the evening
  }
  const p = istParts(now);
  let dayOffset = /\b(parso|parson|day after tomorrow)\b/.test(t) ? 2 : /\b(kal|tomorrow)\b/.test(t) ? 1 : 0;
  let at = istInstant(p.y, p.m, p.d + dayOffset, h, min);
  if (dayOffset === 0 && at.getTime() <= now.getTime()) at = istInstant(p.y, p.m, p.d + 1, h, min);   // "6 baje" said at 7 pm is tomorrow
  return { at, quote: text.slice(clock.index, clock.index + clock[0].length).trim() };
}

// ---- a callback the caller asked for: the time, or a note that they named none ----------------------------------------
// statedCallback reads one caller line. A clock or relative time (statedTime above), optionally on a weekday ("Monday 11
// baje", "somvar shaam 5 baje"), or a part of the day with a day cue ("kal subah", "parso shaam", "tomorrow morning",
// "shaam ko"), gives a time. A callback asked for with no time ("baad mein call karna", "call me later", "kal call karo")
// gives a note and no time: a vague time is never turned into a guess. Devanagari is read too; its quote is the whole line.
// An opt-out ("dobara call mat karna") is not a callback: null.

export type StatedCallback = { at: Date; quote: string } | { note: string; quote: string };

const DEVANAGARI: [RegExp, string][] = [
  [/परसों|परसो/g, 'parso'], [/कल/g, 'kal'], [/आज/g, 'aaj'], [/सुबह/g, 'subah'], [/दोपहर/g, 'dopahar'], [/शाम/g, 'shaam'], [/रात/g, 'raat'],
  [/बजे/g, 'baje'], [/के बाद/g, 'ke baad'], [/घंटे|घण्टे/g, 'ghante'], [/घंटा/g, 'ghanta'], [/मिनट/g, 'minute'], [/बाद/g, 'baad'], [/में/g, 'mein'],
  [/आधे/g, 'aadhe'], [/को/g, 'ko'], [/मत/g, 'mat'], [/नहीं/g, 'nahi'], [/फ़ोन|फोन/g, 'phone'], [/कॉल/g, 'call'], [/करना|करो|कीजिए|करिए/g, 'karna'],
  [/सोमवार/g, 'somvar'], [/मंगलवार/g, 'mangalvar'], [/बुधवार/g, 'budhvar'], [/गुरुवार/g, 'guruvar'], [/शुक्रवार/g, 'shukravar'], [/शनिवार/g, 'shanivar'], [/रविवार|इतवार/g, 'ravivar'],
];
function latin(text: string): string {
  let s = text.replace(/[०-९]/g, d => String('०१२३४५६७८९'.indexOf(d)));
  for (const [re, to] of DEVANAGARI) s = s.replace(re, to);
  return s;
}

// ISO weekday 1 = Monday ... 7 = Sunday.
const WEEKDAYS: [RegExp, number][] = [
  [/\b(monday|somvar|somwar|som)\b/, 1], [/\b(tuesday|mangalvar|mangalwar|mangal)\b/, 2], [/\b(wednesday|budhvar|budhwar|budh)\b/, 3],
  [/\b(thursday|guruvar|guruwar|brihaspativar|veervar)\b/, 4], [/\b(friday|shukravar|shukrawar|shukra)\b/, 5], [/\b(saturday|shanivar|shaniwar|shani)\b/, 6],
  [/\b(sunday|ravivar|raviwar|itwaar|itvaar|itwar)\b/, 7],
];
const PART_HOUR: [RegExp, number][] = [[/\b(subah|morning)\b/, 10], [/\b(dopahar|afternoon)\b/, 14], [/\b(shaam|sham|evening)\b/, 18], [/\b(raat|night)\b/, 20]];
const OPT_OUT = /\b(mat|nahi|nahin|never|don'?t|do not|stop|band)\b/;
const CALLBACK_CUE = /\b(call|phone|fon|callback)\b.*\b(back|karna|karo|kijiye|kariye|kar dena|kar lena|baad|later|again|dobara|phir)\b|\b(baad mein|baad me|later|thodi der|free ho|busy hoon|dobara|phir se)\b/;

const istDow = (d: Date) => { const x = new Date(d.getTime() + IST_MS).getUTCDay(); return x === 0 ? 7 : x; };

export function statedCallback(text: string, now: Date = new Date()): StatedCallback | null {
  const dev = /[ऀ-ॿ]/.test(text);
  const t = (dev ? latin(text) : text).toLowerCase();
  const quoteOf = (q: string) => (dev ? text.trim() : q).slice(0, 160);
  const weekday = WEEKDAYS.find(([re]) => re.test(t))?.[1];
  const moveToWeekday = (at: Date) => {
    if (!weekday) return at;
    const days = (weekday - istDow(now) + 7) % 7 || (at.getTime() > now.getTime() && istDow(at) === weekday ? 0 : 7);
    const p = istParts(at), base = istParts(now);
    return istInstant(base.y, base.m, base.d + days, p.h, p.min);
  };
  // "after 6", "6 ke baad" with no am/pm or baje: the same working-hours reading as "6 baje" (1-7 is the evening).
  const bare = /\bafter\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:am|pm|a\.m|p\.m|baje|o'?clock|minutes?|mins?|hours?|hrs?|ghant))/.exec(t);
  const exact = statedTime(t, now) ?? (bare ? statedTime(`${bare[1]}${bare[2] ? ':' + bare[2] : ''} baje ${/\b(kal|tomorrow|parso|parson)\b/.exec(t)?.[0] ?? ''}`, now) : null);
  if (exact && bare && !statedTime(t, now)) exact.quote = bare[0];
  if (exact) {
    if (OPT_OUT.test(t) && /\bcall|phone\b/.test(t) && !/\b(abhi nahi|not now|abhi mat)\b/.test(t)) return null;
    return { at: moveToWeekday(exact.at), quote: quoteOf(exact.quote) };
  }
  if (OPT_OUT.test(t) && !/\b(abhi nahi|not now|abhi mat)\b/.test(t)) return null;
  const part = PART_HOUR.find(([re]) => re.test(t));
  const dayCue = /\b(parso|parson|day after tomorrow)\b/.test(t) ? 2 : /\b(kal|tomorrow)\b/.test(t) ? 1 : /\b(aaj|today)\b/.test(t) ? 0 : null;
  if (part && new RegExp(`${part[0].source.replace(/\\b/g, '')}\\s+se\\b`).test(t)) {
    return { note: 'They said when they are busy, not when to call, so no time was guessed.', quote: quoteOf(text.trim()) };   // "subah se busy"
  }
  if (part && (dayCue !== null || weekday || /\b(subah|dopahar|shaam|sham|raat)\s+ko\b|\bin the (morning|afternoon|evening)\b|\bthis (morning|afternoon|evening)\b/.test(t))) {
    const p = istParts(now);
    let at = istInstant(p.y, p.m, p.d + (dayCue ?? 0), part[1], 0);
    if (weekday) at = moveToWeekday(at);
    else if (dayCue === null && at.getTime() <= now.getTime()) at = istInstant(p.y, p.m, p.d + 1, part[1], 0);
    if (at.getTime() <= now.getTime()) return { note: 'They asked to be called back at a time that has already passed today; not scheduled.', quote: quoteOf(text.trim()) };
    const m = t.match(new RegExp(`(?:(?:aaj|kal|parso|tomorrow|today|${WEEKDAYS.map(([re]) => re.source.replace(/\\b|\(|\)/g, '')).join('|')})\\s+)?${part[0].source.replace(/\\b/g, '')}(?:\\s+ko)?`));
    return { at, quote: quoteOf(m ? m[0] : text.trim()) };
  }
  if (CALLBACK_CUE.test(t) || dayCue !== null || weekday) {
    return { note: 'They asked to be called back but did not say a clear time, so no time was guessed.', quote: quoteOf(text.trim()) };
  }
  return null;
}
