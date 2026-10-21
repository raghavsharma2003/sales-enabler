// Column mapping: deterministic Hindi/English header synonyms first, then value shapes. No LLM and no
// personal values leave this file. Identity-document and banking columns are ignored by design.
import { normaliseIndianPhone } from '../../../shared/phone.ts';

export type Field =
  | 'phone' | 'name' | 'first_name' | 'last_name' | 'language' | 'timezone'
  | 'consent' | 'consent_at' | 'opt_out' | 'observed_at' | 'attribute' | 'ignore';

export interface ColumnMap {
  column: number;            // 0-based index in the header row
  header: string;
  field: Field;
  key?: string;              // attribute key (field = attribute)
  type?: 'text' | 'number' | 'date' | 'boolean';
  why: 'header' | 'values' | 'given' | 'pii_by_design' | 'default';
  confidence: number;        // 0..1
}

export interface Mapping { columns: ColumnMap[]; hasHeader: boolean }

const DEVANAGARI = '०१२३४५६७८९';
export const asciiDigits = (s: string) => [...s].map(ch => { const i = DEVANAGARI.indexOf(ch); return i >= 0 ? String(i) : ch; }).join('');

const norm = (h: string) => h.normalize('NFKC').toLowerCase().replace(/[_\-./#:()]+/g, ' ').replace(/\s+/g, ' ').trim();

// Order matters: the first field whose synonym matches wins.
const SYNONYMS: [Field, string[]][] = [
  ['ignore', ['aadhaar', 'aadhar', 'aadhaar no', 'aadhaar number', 'uid', 'pan', 'pan no', 'pan number', 'pan card', 'bank account', 'account number',
    'account no', 'a c no', 'ifsc', 'ifsc code', 'card number', 'card no', 'credit card', 'debit card', 'cvv', 'upi pin', 'pin code otp', 'otp', 'password',
    'passport', 'passport no', 'voter id', 'आधार', 'पैन']],
  ['opt_out', ['dnd', 'do not call', 'dnc', 'opt out', 'optout', 'opted out', 'unsubscribe', 'unsubscribed', 'call mat karo', 'no call', 'block']],
  ['consent_at', ['consent date', 'consent at', 'consented at', 'opt in date', 'opted in at', 'optin date', 'consent time']],
  ['consent', ['consent', 'opt in', 'optin', 'opted in', 'consented', 'permission', 'sahmati', 'सहमति', 'call consent', 'marketing consent']],
  ['phone', ['phone', 'phone no', 'phone number', 'mobile', 'mobile no', 'mobile number', 'mob', 'mob no', 'contact', 'contact no', 'contact number',
    'cell', 'cell no', 'whatsapp', 'whatsapp no', 'whatsapp number', 'number', 'msisdn', 'tel', 'telephone', 'फ़ोन', 'फोन', 'मोबाइल', 'मोबाइल नंबर', 'नंबर', 'संपर्क']],
  ['first_name', ['first name', 'firstname', 'given name', 'fname']],
  ['last_name', ['last name', 'lastname', 'surname', 'family name', 'lname']],
  ['name', ['name', 'full name', 'customer name', 'customer', 'client name', 'lead name', 'contact name', 'naam', 'नाम', 'ग्राहक का नाम']],
  ['language', ['language', 'lang', 'preferred language', 'bhasha', 'भाषा']],
  ['timezone', ['timezone', 'time zone', 'tz']],
  ['observed_at', ['updated at', 'last updated', 'modified', 'modified at', 'last modified', 'as of']],
];

export function headerField(h: string): Field | null {
  const n = norm(h);
  if (!n) return null;
  for (const [field, words] of SYNONYMS) if (words.includes(n)) return field;
  // Partial matches for the identity-document guard only: "customer aadhaar", "pan_card_no".
  if (/\b(aadhaa?r|pan( card)?( no| number)?|ifsc|cvv|upi pin|password|otp)\b/.test(n)) return 'ignore';
  return null;
}

const rawKey = (h: string) => norm(h).replace(/[^\p{L}\p{M}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'column';

/** Age-like keys are canonicalised so the children's-data gate (memory) reads one name per meaning, whatever the header
 *  said ("Customer DOB", "Year of Birth", "Age Group", "Umar", "Is Minor?"). Token rules over the snake-cased key;
 *  exported for memory. birth_year gives the younger possible age; age_group fails closed when any bound is under 18. */
// Order matters: the first key whose rule matches wins (birth_year before date_of_birth, age_group before age).
export const AGE_KEY_SYNONYMS = {
  birth_year: { tokens: ['yob', 'birthyear', 'janmvarsh', 'जन्मवर्ष'], pairs: [['year', 'of', 'birth'], ['birth', 'year'], ['janm', 'varsh'], ['janam', 'varsh'], ['जन्म', 'वर्ष'], ['y', 'o', 'b']] },
  date_of_birth: { tokens: ['dob', 'birthday', 'birthdate', 'janmtithi', 'जन्मतिथि'], pairs: [['date', 'birth'], ['birth', 'date'], ['born', 'on'], ['janm', 'tithi'], ['janam', 'tithi'], ['जन्म', 'तिथि'], ['d', 'o', 'b']] },
  age_group: { tokens: ['agegroup', 'ageband'], pairs: [['age', 'group'], ['age', 'band'], ['age', 'range'], ['age', 'bracket'], ['umar', 'varg'], ['umra', 'varg'], ['आयु', 'वर्ग'], ['उम्र', 'वर्ग']] },
  age: { tokens: ['age', 'umar', 'umra', 'umr', 'उम्र', 'आयु'], pairs: [] },        // only when it names the person (personAge)
  is_minor: { tokens: ['minor', 'under18', 'nabalig', 'नाबालिग'], pairs: [['under', '18'], ['is', 'child']] },
} as const;
export type AgeKey = keyof typeof AGE_KEY_SYNONYMS;

/** The canonical age key for a snake-cased attribute key, or null when it is not age-like. */
export function canonicalAgeKey(key: string): AgeKey | null {
  const t = key.normalize('NFKC').toLowerCase().split('_').filter(Boolean);
  const has = (seq: readonly string[]) => t.some((_, i) => seq.every((w, j) => t[i + j] === w));
  for (const k of Object.keys(AGE_KEY_SYNONYMS) as AgeKey[]) {
    const s = AGE_KEY_SYNONYMS[k];
    if (s.pairs.some(p => has(p))) return k;
    if (k === 'age') { if (personAge(t)) return k; continue; }
    if ((s.tokens as readonly string[]).some(w => t.includes(w))) return k;
  }
  return null;
}

// "Age", "Customer Age", "Age (years)", "Umar" are the person's age; "Vehicle Age" or "Policy Age" are not.
const PERSON = ['customer', 'client', 'lead', 'contact', 'person', 'member', 'patient', 'student', 'applicant', 'borrower', 'policyholder', 'insured', 'caller', 'user'];
const UNITS = ['years', 'year', 'yrs', 'yr', 'in', 'y', 'saal', 'sal'];
function personAge(t: string[]): boolean {
  const i = t.findIndex(w => (AGE_KEY_SYNONYMS.age.tokens as readonly string[]).includes(w));
  if (i < 0) return false;
  const before = t.slice(0, i), after = t.slice(i + 1);
  return before.every(w => PERSON.includes(w)) && before.length <= 1 && after.every(w => UNITS.includes(w));
}

export const attrKey = (h: string) => { const k = rawKey(h); return canonicalAgeKey(k) ?? k; };

const looksPhone = (v: string) => normaliseIndianPhone(v).ok;
const looksNumber = (v: string) => /^-?\d{1,3}(,\d{2,3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(v.trim()) && !/^0\d/.test(v.trim());
const looksBool = (v: string) => truthy(v) !== null;

/** Infer the mapping from a header row and up to 200 sample rows. Explicit overrides win. */
export function inferMapping(rows: string[][], overrides: Partial<Record<string, Partial<ColumnMap>>> = {}): Mapping {
  const first = rows[0] ?? [];
  const sample = rows.slice(1, 201);
  // A header row exists unless the first row already looks like data (a phone in it, no known header).
  const known = first.filter(h => headerField(h) !== null).length;
  const hasHeader = known > 0 || !first.some(looksPhone);
  const body = hasHeader ? sample : rows.slice(0, 200);
  const width = Math.max(first.length, ...body.map(r => r.length));
  const columns: ColumnMap[] = [];
  for (let c = 0; c < width; c++) {
    const header = hasHeader ? (first[c] ?? '') : `column ${c + 1}`;
    const vals = body.map(r => (r[c] ?? '').trim()).filter(Boolean);
    const share = (f: (v: string) => boolean) => vals.length ? vals.filter(f).length / vals.length : 0;
    const hf = hasHeader ? headerField(header) : null;
    let m: ColumnMap;
    if (hf === 'ignore') m = { column: c, header, field: 'ignore', why: 'pii_by_design', confidence: 1 };
    else if (hf) m = { column: c, header, field: hf, why: 'header', confidence: 0.95 };
    else if (share(looksPhone) >= 0.6) m = { column: c, header, field: 'phone', why: 'values', confidence: share(looksPhone) };
    else {
      const type = share(looksNumber) >= 0.9 ? 'number' : share(v => parseDate(v) !== null) >= 0.9 ? 'date' : share(looksBool) >= 0.95 ? 'boolean' : 'text';
      m = { column: c, header, field: 'attribute', key: attrKey(header), type, why: 'default', confidence: 0.6 };
    }
    if ((m.field === 'attribute') && !m.type) m.type = 'text';
    const o = overrides[header] ?? overrides[String(c)];
    if (o) m = { ...m, ...o, column: c, header, why: 'given', confidence: 1, ...(o.field === 'attribute' ? { key: o.key ?? attrKey(header), type: o.type ?? m.type ?? 'text' } : {}) };
    columns.push(m);
  }
  // Exactly one phone column: keep the most confident; any others become attributes.
  const phones = columns.filter(m => m.field === 'phone').sort((a, b) => b.confidence - a.confidence || a.column - b.column);
  for (const p of phones.slice(1)) Object.assign(p, { field: 'attribute', key: attrKey(p.header), type: 'text', confidence: 0.5 });
  return { columns, hasHeader };
}

/** yes/no in English, Hinglish and Hindi; null when the value is not a yes or a no. */
export function truthy(v: string): boolean | null {
  const n = v.normalize('NFKC').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'haan', 'han', 'ha', 'हाँ', 'हां', 'ok', '✓', 'opted in', 'granted', 'given'].includes(n)) return true;
  if (['no', 'n', 'false', '0', 'nahi', 'nahin', 'na', 'नहीं', 'नही', 'withdrawn', 'denied', '✗'].includes(n)) return false;
  return null;
}

const LANG: Record<string, string> = {
  hindi: 'hi', hi: 'hi', 'हिंदी': 'hi', 'हिन्दी': 'hi', english: 'en', en: 'en', angrezi: 'en', hinglish: 'hi-en', 'hi-en': 'hi-en',
  tamil: 'ta', ta: 'ta', telugu: 'te', te: 'te', kannada: 'kn', kn: 'kn', malayalam: 'ml', ml: 'ml', marathi: 'mr', mr: 'mr',
  bengali: 'bn', bangla: 'bn', bn: 'bn', gujarati: 'gu', gu: 'gu', punjabi: 'pa', pa: 'pa', odia: 'or', oriya: 'or', or: 'or', urdu: 'ur', ur: 'ur', assamese: 'as',
};
export function normLanguage(v: string): string | null {
  const n = v.normalize('NFKC').trim().toLowerCase();
  if (!n) return null;
  return LANG[n] ?? (/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(n) ? n : null);
}

export function normTimezone(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^ist$/i.test(t) || /^(utc|gmt)\s*\+\s*5:?30$/i.test(t)) return 'Asia/Kolkata';
  try { new Intl.DateTimeFormat('en', { timeZone: t }); return t; } catch { return null; }
}

/** ISO dates and the Indian day-first forms (dd/mm/yyyy, dd-mm-yyyy). Returns an ISO string or null. */
export function parseDate(v: string): string | null {
  const t = asciiDigits(v.trim());
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(t);
  if (m) {
    const d = new Date(m[4] ? t.replace(' ', 'T') + (m[7] ? '' : '+05:30') : `${m[1]}-${m[2]}-${m[3]}T00:00:00+05:30`);
    return Number.isNaN(d.getTime()) ? null : m[4] ? d.toISOString() : `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) {
    const dd = +m[1], mm = +m[2];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${m[3]}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return null;
}

export function typedValue(v: string, type: ColumnMap['type']): unknown {
  const t = v.trim();
  if (type === 'number') { const n = Number(asciiDigits(t).replace(/,/g, '')); return Number.isFinite(n) ? n : t; }
  if (type === 'date') return parseDate(t) ?? t;
  if (type === 'boolean') return truthy(t) ?? t;
  return t;
}
