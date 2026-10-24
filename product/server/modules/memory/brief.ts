// The pre-call memory brief: notes and shapes, never lines (sentence-shaped text gets recited; quoted lines were
// recited 4 of 5 times). key=value per fact with its age, groups in a fixed usefulness order, newest value per key.
// It must fit BRIEF_MAX_BYTES; if it does not, compile throws. It is never sliced.
import { BRIEF_MAX_BYTES } from '../../../shared/agent-config.ts';
import { PERSONAL_KEYS, type Kind } from './gates.ts';

export interface BriefFact { id: string; kind: Kind; key: string; value: string; saidAt: Date }

export class BriefTooLarge extends Error {
  constructor(public bytes: number) { super(`memory brief is ${bytes} bytes, over the ${BRIEF_MAX_BYTES}-byte cap; it is never truncated`); this.name = 'BriefTooLarge'; }
}

/** Fixed usefulness order and a per-group cap (whole entries only).
 *  'last' (the last call's outcome) sits after 'open'; a personal detail they agreed to have kept is at most one, so she
 *  has one natural thing to acknowledge, never a list of what she knows about them. */
const GROUPS: { kind: Kind; label: string; max: number; personal?: boolean }[] = [
  { kind: 'preference', label: 'prefs', max: 8 },
  { kind: 'commitment', label: 'open', max: 3 },
  { kind: 'objection', label: 'heard', max: 4 },
  { kind: 'context', label: 'personal', max: 1, personal: true },
  { kind: 'context', label: 'context', max: 3, personal: false },
];

export function age(saidAt: Date, now: Date): string {
  const d = Math.floor((now.getTime() - saidAt.getTime()) / 86_400_000);
  if (d <= 0) return 'said today';
  if (d === 1) return 'said yesterday';
  if (d < 14) return `said ${d} days ago`;
  if (d < 60) return `said ${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `said ${Math.round(d / 30)} months ago`;
  return 'said over a year ago';
}

// Values are already linted at write; this keeps the shape (no quotes, separators or line breaks inside a value).
const shape = (v: string) => v.replace(/["'“”‘’|;=\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A note that is not a remembered fact but leads the brief when it applies: a callback the person asked for on this call. */
export interface BriefLead { label: string; key: string; value: string; saidAt: Date }

/** The last real call's outcome: a system record, never their words. */
export interface BriefLast { outcome: string; at: Date }

/** Compile the brief. Returns the text and the fact ids it used (for the run manifest). Throws BriefTooLarge. */
export function compileBrief(facts: BriefFact[], now: Date = new Date(), lead?: BriefLead, last?: BriefLast): { text: string; factIds: string[]; bytes: number } {
  const newest = new Map<string, BriefFact>();
  for (const f of [...facts].sort((a, b) => b.saidAt.getTime() - a.saidAt.getTime())) {
    const k = `${f.kind}.${f.key}`;
    if (!newest.has(k)) newest.set(k, f);       // within a key the newest value wins; contradictions never both appear
  }
  const parts: string[] = lead ? [`${lead.label}: ${lead.key}=${shape(lead.value)} (${age(lead.saidAt, now)})`] : [], ids: string[] = [];
  for (const g of GROUPS) {
    if (g.label === 'heard' && last) parts.push(`last: outcome=${shape(last.outcome)} (${age(last.at, now).replace(/^said /, '')})`);
    const rows = [...newest.values()].filter(f => f.kind === g.kind && (g.personal === undefined || PERSONAL_KEYS.includes(f.key) === g.personal))
      .sort((a, b) => b.saidAt.getTime() - a.saidAt.getTime()).slice(0, g.max);
    if (!rows.length) continue;
    const items = rows.map(f => `${f.key}=${shape(f.value)} (${age(f.saidAt, now)})`);
    parts.push(`${g.label}: ${items.join('; ')}`);
    ids.push(...rows.map(f => f.id));
  }
  const text = parts.join(' | ');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > BRIEF_MAX_BYTES) throw new BriefTooLarge(bytes);
  return { text, factIds: ids, bytes };
}
