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
