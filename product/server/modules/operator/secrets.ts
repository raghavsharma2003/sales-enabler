// Credential-shaped text in chat. The person may paste a key or password into the Operator; it must never be
// stored in a message or sent to the model. Digit secrets (OTP, card, Aadhaar) are masked by shared/safety redact();
// this adds keys, tokens and "password: ..." pairs. Masks are applied before the message is saved or sent anywhere.
import { redact } from '../../../shared/safety/index.ts';

export const CREDENTIAL_MASK = '[hidden credential]';

// Well-known key prefixes.
const PREFIXED = /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|rk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abposr]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{16,})/g;
// "password: x", "api key = x", "token hai x" (Hinglish), quoted or bare value.
const PAIR = /\b(password|passwd|pwd|passcode|pass|token|secret|api[ _-]?key|access[ _-]?key|secret[ _-]?key|client[ _-]?secret|auth[ _-]?token|bearer)(\s*(?:[:=]|\bis\b|\bhai\b|\bhe\b)\s*)("[^"\n]{1,200}"|'[^'\n]{1,200}'|[^\s"',;]{4,200})/gi;
// Long opaque tokens: 24+ chars, at least three character classes, high entropy. UUIDs and plain hex are ids, not secrets.
const TOKEN = /[A-Za-z0-9_\-+/=.]{24,}/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entropy(s: string): number {
  const f = new Map<string, number>();
  for (const c of s) f.set(c, (f.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of f.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

function opaqueToken(s: string): boolean {
  if (UUID.test(s) || /^https?:/i.test(s) || /^[0-9a-f]+$/i.test(s) || s.includes('..')) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[_\-+/=.]/].filter(r => r.test(s)).length;
  return classes >= 3 && /[0-9]/.test(s) && entropy(s) >= 3.5;
}

/** Mask credential-shaped strings. Returns the masked text and how many were hidden. */
export function maskCredentials(text: string): { text: string; hidden: number } {
  let hidden = 0;
  let out = text.replace(PREFIXED, () => { hidden++; return CREDENTIAL_MASK; });
  out = out.replace(PAIR, (m, k: string, sep: string, v: string) => {
    if (v === CREDENTIAL_MASK || v.startsWith('[hidden')) return m;
    hidden++;
    return k + sep + CREDENTIAL_MASK;
  });
  out = out.replace(TOKEN, t => { if (!opaqueToken(t)) return t; hidden++; return CREDENTIAL_MASK; });
  return { text: out, hidden };
}

/** Everything the person sends goes through this before it is stored or reaches the model. */
export function cleanIncoming(text: string): { text: string; hidden: number } {
  return maskCredentials(redact(text));
}

export const HID_NOTICE = 'I hid what looked like a password or key. Put credentials in Settings → Integrations, never in chat.';
