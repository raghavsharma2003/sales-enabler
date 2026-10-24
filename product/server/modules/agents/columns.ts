// Which of an agent's per-contact facts a list can fill. At dial time a perContact fact is filled only from a contact
// attribute (or custom field) whose key equals the fact's key (campaigns/worker.ts ticketFacts), so a CSV column "Due
// date" stored as due_date never fills emi_due. This names every unfilled fact and suggests likely columns by name;
// it never maps one: the member confirms a mapping in source.map (walkthrough round 2, R3). Pure, so campaigns and
// intake can import it.
import type { AgentConfig, Fact } from '../../../shared/agent-config.ts';

export interface FactColumn {
  key: string;                       // the fact's key, e.g. emi_due
  label: string;                     // plain words, e.g. "emi due"
  status: 'matched' | 'name' | 'missing';
  column?: string;                   // the matching attribute key or header, when matched
  suggestions: string[];             // likely columns (headers when known), best first; empty when nothing is close
}

// Facts that are the person's name come from the contact's name, which every list has.
const NAME_KEYS = new Set(['name', 'customer', 'customer_name', 'policyholder', 'patient', 'borrower', 'applicant', 'enquirer', 'traveller', 'traveler', 'student', 'member', 'guest', 'caller']);
const SYNONYMS: Record<string, string> = {
  amt: 'amount', value: 'amount', rs: 'amount', inr: 'amount', rupees: 'amount', due: 'date', deadline: 'date', dt: 'date', on: 'date',
  instalment: 'emi', installment: 'emi', mobile: 'phone', number: 'no', num: 'no', id: 'no', addr: 'address', appt: 'appointment',
};
const tokens = (s: string) => s.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(t => SYNONYMS[t] ?? t);
const keyOf = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');

function similarity(a: string, b: string): number {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter(t => y.has(t)).length;
  return shared / (x.size + y.size - shared);
}

/** The facts a call needs from each person's record, minus offers a service or transactional call never carries. */
export function perContactFacts(agent: Pick<AgentConfig, 'facts' | 'category'>): Fact[] {
  return (agent.facts ?? []).filter(f => f.perContact && !(f.purpose === 'offer' && agent.category !== 'promotional'));
}

/** Match each per-contact fact to the list's columns: { key: attribute key, header?: the file's header text }. */
export function factColumns(agent: Pick<AgentConfig, 'facts' | 'category'>, columns: { key: string; header?: string }[]): FactColumn[] {
  const facts = perContactFacts(agent);
  // A column that already fills one fact is never suggested for another.
  const taken = new Set(columns.filter(c => facts.some(f => keyOf(f.key) === keyOf(c.key))).map(c => keyOf(c.key)));
  return facts.map(f => {
    const label = f.key.replace(/_/g, ' ');
    const exact = columns.find(c => keyOf(c.key) === keyOf(f.key));
    if (exact) return { key: f.key, label, status: 'matched', column: exact.header ?? exact.key, suggestions: [] };
    if (f.purpose === 'identity' && (NAME_KEYS.has(f.key) || /\bname\b/i.test(f.value))) return { key: f.key, label, status: 'name', suggestions: [] };
    const scored = columns.filter(c => !taken.has(keyOf(c.key))).map(c => ({ c, s: Math.max(similarity(f.key, c.key), c.header ? similarity(f.key, c.header) : 0) }))
      .filter(x => x.s >= 0.25).sort((p, q) => q.s - p.s || (p.c.header ?? p.c.key).localeCompare(q.c.header ?? q.c.key));
    return { key: f.key, label, status: 'missing', suggestions: scored.slice(0, 2).map(x => x.c.header ?? x.c.key) };
  });
}

/** "emi due (maybe the \"Due date\" column), loan", each likely column named: one plain sentence for a check or a preview. */
export function missingFactsSentence(missing: FactColumn[]): string {
  return missing.map(m => m.suggestions.length ? `${m.label} (maybe the "${m.suggestions[0]}" column)` : m.label).join(', ');
}
