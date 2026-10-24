// India-default phone normalisation to E.164. Never rejects a whole file for one row and never
// guesses a foreign country: a number is Indian by default only when its shape is Indian.
// Returns a reason code for every row it cannot safely normalise (these feed the import receipt).

export type PhoneKind = 'mobile' | 'landline';
export type PhoneReason =
  | 'EMPTY'
  | 'SCI_NOTATION'         // Excel turned the number into e.g. 9.1E+11; the digits are lost
  | 'NON_INDIAN'           // a + country code other than +91: kept, not auto-dialled
  | 'LANDLINE_TRUNCATED'   // a landline with too few digits
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_PREFIX'       // national number starts 0 or 1 after normalising
  | 'NOT_A_NUMBER';

export type PhoneResult =
  | { ok: true; e164: string; kind: PhoneKind; national: string }
  | { ok: false; reason: PhoneReason; raw: string; national?: string };

const DEVANAGARI = '०१२३४५६७८९';

function asciiDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const i = DEVANAGARI.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

export function normaliseIndianPhone(input: unknown): PhoneResult {
  const raw = input == null ? '' : String(input).trim();
  if (!raw) return { ok: false, reason: 'EMPTY', raw };

  const ascii = asciiDigits(raw);
  if (/^[0-9.]+e\+?[0-9]+$/i.test(ascii.replace(/\s/g, ''))) return { ok: false, reason: 'SCI_NOTATION', raw };

  const hasPlus = /^\s*\+/.test(ascii);
  const digits = ascii.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'NOT_A_NUMBER', raw };

  // An explicit + with a country code other than 91 is foreign: keep it, flag it, never convert it.
  if (hasPlus && !digits.startsWith('91')) return { ok: false, reason: 'NON_INDIAN', raw };

  let national = digits;
  if (hasPlus) national = digits.slice(2);                                  // +91XXXXXXXXXX
  else if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2);  // 91XXXXXXXXXX
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);   // 0XXXXXXXXXX
  else if (digits.length === 13 && digits.startsWith('091')) national = digits.slice(3); // 091XXXXXXXXXX

  if (national.length < 10) {
    // A short number that starts like a landline STD code is truncated, not merely short.
    return { ok: false, reason: /^[2-5]/.test(national) ? 'LANDLINE_TRUNCATED' : 'TOO_SHORT', raw, national };
  }
  if (national.length > 10) return { ok: false, reason: 'TOO_LONG', raw, national };
  if (/^[01]/.test(national)) return { ok: false, reason: 'INVALID_PREFIX', raw, national };

  const kind: PhoneKind = /^[6-9]/.test(national) ? 'mobile' : 'landline';
  return { ok: true, e164: '+91' + national, kind, national };
}
