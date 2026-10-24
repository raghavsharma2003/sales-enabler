// Company facts: what can be proposed from a company's own material, and which of its facts a sentence she said used.
// HV law 22: prices and dates come only from an offerings sheet, never from prose (a brochure line "now just ₹999 till
// 31 March" goes stale silently; a sheet row is the business's own current number). Pure functions, no I/O, so the
// server, the practice chat and the call page read the same answer.

const PRICE = /(₹|\brs\.?(?=\s?\d)|\binr\b|\brupees?\b|\brupaye\b|\blakhs?\b|\bcrores?\b|\d\s?(%|percent\b)|\bper (month|year|annum)\b|\/-)/iu;
const MONTHS = 'jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?';
const DATE = new RegExp(`\\b\\d{1,2}[/.-]\\d{1,2}([/.-]\\d{2,4})?\\b|\\b\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})\\b|\\b(${MONTHS})\\s+\\d{1,2}(st|nd|rd|th)?\\b|\\b(19|20)\\d{2}\\b|\\b(till|until|valid (up )?to|last date|deadline|expires?|before)\\s+(today|tomorrow|this (week|month)|${MONTHS})\\b`, 'iu');

/** Why a prose statement may not become a fact, or null when it may. */
export function proseExclusion(text: string): string | null {
  if (PRICE.test(text)) return 'It states a price or an amount. Prices come only from an offerings sheet.';
  if (DATE.test(text)) return 'It states a date. Dates come only from an offerings sheet.';
  return null;
}
export const hasPriceOrDate = (text: string) => proseExclusion(text) !== null;

/** Purpose tags (offering.edit's vocabulary) a statement or a sheet column suggests. */
export function purposesFor(text: string): string[] {
  const t = text.toLowerCase();
  if (/\b(price|cost|fee|fees|premium|amount|mrp|emi|charges?|rate|tariff)\b/.test(t)) return ['price'];
  if (/\b(discount|offer|cashback|coupon|scheme|deal|free)\b/.test(t)) return ['discount'];
  if (/\b(date|valid|validity|until|till|expiry|expires|deadline|from|starts?|ends?)\b/.test(t)) return ['timing'];
  if (/\b(hours|open|timings?|monday|sunday|weekdays?|saturday)\b/.test(t)) return ['hours'];
  if (/\b(eligib|who can|age|documents?|kyc|requirement)/.test(t)) return ['eligibility'];
  if (/\b(call|visit|book|appointment|whatsapp|email|branch|address|next step)\b/.test(t)) return ['next_step'];
  if (/\b(return|refund|warranty|guarantee|replace|cancel|policy|claim)\b/.test(t)) return ['objection'];
  return ['explain'];
}

/** Statements in a passage that could stand as facts: whole sentences of 5 to 45 words, not questions, not menus. */
export function statements(passage: string): string[] {
  const out: string[] = [];
  for (const raw of passage.replace(/\s*\n+\s*/g, '\n').split(/(?<=[.!।])\s+|\n/u)) {
    const s = raw.trim().replace(/\s+/g, ' ');
    const words = s.split(' ').filter(Boolean);
    if (words.length < 5 || words.length > 45 || s.length > 300) continue;
    if (s.endsWith('?') || !/[a-zऀ-ॿ]/i.test(s)) continue;
    // A row of links or a heading strip: mostly capitalised words, no verb-ish lowercase run.
    const caps = words.filter(w => /^[A-Z]/.test(w)).length;
    if (caps / words.length > 0.7) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// What makes a fact read as a line to say (server/modules/agents/lint.ts LINE_CHECKS for facts): the brief refuses it.
const QUOTED = /["“”«»„]|(^|\s)'[^']*\s[^']*'/;
const SINGULAR_ME = /(^|[^\p{L}'])(I|I'm|I'd|I'll|I've|me|my|mine)(?![\p{L}'])/u;
const FIRST_PERSON_HI = /(?<![\p{L}\p{M}])(mai|mera|meri|mere|hum|hamara|hamari|hamare|मैं|मेरा|मेरी|मेरे|हम|हमारा|हमारी|हमारे)(?![\p{L}\p{M}])/iu;
const GREETING = /^\s*(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|dear|thank you|thanks|welcome)\b|नमस्ते|नमस्कार/i;
const WE: Record<string, string> = { we: 'they', "we're": "they're", "we'll": "they'll", "we've": "they've", "we'd": "they'd", our: 'their', ours: 'theirs', us: 'them' };

/** A company statement as a fact she can use, not a line she recites: the business's "we" and "our" become "they" and
 *  "their" (the brief says whom she calls for); a testimonial (I, my), Hindi first person, a quote or a greeting is not a
 *  company fact and gives null. The passage keeps the original words for "why she said this". */
export function asFact(sentence: string): string | null {
  const t = sentence.replace(/(?<![\p{L}'])(we're|we'll|we've|we'd|we|ours|our|us)(?![\p{L}'])/giu, m => {
    const r = WE[m.toLowerCase()];
    return m[0] === m[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
  if (QUOTED.test(t) || SINGULAR_ME.test(t) || FIRST_PERSON_HI.test(t) || GREETING.test(t)) return null;
  return t;
}

// ------------------------------------------------------------------------------------------------ fact uses

const STOP = new Set(('the and for with you your our are was were this that from have has will can not but all any per '
  + 'aap aapka aapki aapke main hum hai hain hoon kya nahi bhi toh aur yeh woh hamari hamara hamare liye karna karte karein '
  + 'ji please also more just very into about only them they their there what when which who how').split(' '));
const words = (s: string) => new Set(s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length >= 4 && !STOP.has(w)));
const numbers = (s: string) => new Set((s.replace(/(\d),(?=\d)/g, '$1').match(/\d{2,}/g) ?? []).filter(n => !/^0+$/.test(n)));

export interface FactLike { key: string; value: string; source: string }

/** The facts a sentence used: it repeats a number from the fact (an amount, a date, a count), or most of the fact's
 *  content words. Conservative on purpose: "why she said this" must never point at a fact she did not use. */
export function factUses<F extends FactLike>(sentence: string, facts: F[]): F[] {
  const sn = numbers(sentence), sw = words(sentence);
  const hits: F[] = [];
  for (const f of facts) {
    const fn = numbers(f.value);
    if ([...fn].some(n => sn.has(n))) { hits.push(f); continue; }
    const fw = words(f.value);
    if (fw.size >= 3) {
      let shared = 0;
      for (const w of fw) if (sw.has(w)) shared++;
      if (shared >= 3 && shared / fw.size >= 0.5) hits.push(f);
    }
  }
  return hits;
}
