// Children's-data gate: is this contact possibly under 18? Reads the contact's imported attribute rows (intake writes
// columns there, keyed by the normalised header: "Age" -> age, "Date of Birth" -> date_of_birth) and contact.custom.
// Fails closed: any age-like value that cannot be read with certainty counts as unclear, and unclear blocks memory.
import { many, one, type Queryable } from '../../db.ts';

export type MinorStatus = 'adult' | 'minor' | 'unclear' | 'unknown';   // unknown = no age data at all

const AGE = /^(age|age_years|age_in_years|customer_age|client_age|lead_age|umar|umra|umr|उम्र|आयु)$/;
const DOB = /^(dob|d_o_b|date_of_birth|birth_date|birthdate|birthday|born_on|janm_tithi|janam_tithi|जन्म_तिथि|जन्मतिथि)$/;
const FLAG = /^(minor|is_minor|under_18|under18|is_under_18|child|is_child|nabalig|नाबालिग)$/;
const asciiDigits = (s: string) => s.replace(/[०-९]/g, ch => String('०१२३४५६७८९'.indexOf(ch)));
const YES = /^(true|yes|y|1|haan|ha|han|हाँ|हां)$/i, NO = /^(false|no|n|0|nahi|nahin|नहीं)$/i;

function ageFrom(dob: string, now: Date): number | null {
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(dob);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(dob))) [d, m, y] = [+r[1], +r[2], +r[3]];   // Indian order: DD/MM/YYYY
  else if ((r = /^(\d{4})$/.exec(dob))) return now.getUTCFullYear() - +r[1] - 1;                       // year only: assume the younger age
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

/** Pure: the verdict over every age-like field. Any minor wins; otherwise any unclear wins; adult only if all read adult. */
export function minorStatus(fields: { key: string; value: unknown }[], now: Date = new Date()): MinorStatus {
  const verdicts: MinorStatus[] = [];
  for (const f of fields) {
    const key = f.key.normalize('NFKC').toLowerCase().trim();
    const raw = asciiDigits(f.value === null || f.value === undefined ? '' : String(f.value).trim());
    if (FLAG.test(key)) verdicts.push(f.value === true || YES.test(raw) ? 'minor' : f.value === false || NO.test(raw) ? 'adult' : 'unclear');
    else if (AGE.test(key)) {
      // A plain number of years is read; anything else ("17-19", "teen", "approx 30") is a minor if any number is under 18, else unclear.
      const plain = /^(\d{1,3})(?:\.\d+)?\s*(years?|yrs?|y|saal|sal|वर्ष|साल)?$/i.exec(raw);
      verdicts.push(plain ? (+plain[1] < 18 ? 'minor' : 'adult') : [...raw.matchAll(/\d+/g)].some(x => +x[0] < 18) ? 'minor' : 'unclear');
    } else if (DOB.test(key)) {
      const age = ageFrom(raw, now);
      verdicts.push(age === null ? 'unclear' : age < 18 ? 'minor' : 'adult');
    }
  }
  if (!verdicts.length) return 'unknown';
  if (verdicts.includes('minor')) return 'minor';
  if (verdicts.includes('unclear')) return 'unclear';
  return 'adult';
}

/** The contact's current attribute rows plus contact.custom, scoped to the workspace. */
export async function contactMinorStatus(q: Queryable, workspaceId: string, contactId: string): Promise<MinorStatus> {
  const c = await one<{ custom: Record<string, unknown> }>(q, 'SELECT custom FROM contact WHERE id = $1 AND workspace_id = $2', [contactId, workspaceId]);
  if (!c) return 'unknown';
  const attrs = await many<{ key: string; value: unknown }>(q, 'SELECT a.key, a.value FROM attribute a JOIN contact ct ON ct.id = a.contact_id WHERE a.contact_id = $1 AND ct.workspace_id = $2', [contactId, workspaceId]);
  return minorStatus([...attrs, ...Object.entries(c.custom ?? {}).map(([key, value]) => ({ key, value }))]);
}
