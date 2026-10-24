// How she changed: the fields a learned change sets, and its effect on the compiled brief, line by line. Pure functions;
// index.ts reads the rows and the agents module compiles.
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { applyOps, type ChangeOp } from './gates.ts';

export interface Field { path: string; from: unknown; to: unknown }

/** Each field the change sets, with what the base holds there now (agents' version.adopt checks `from` before writing).
 *  A facts reorder is the whole facts list, as adoption after a test writes it too. */
export function fieldsFor(base: AgentConfig, ops: ChangeOp[]): Field[] {
  const at = (path: string): unknown => path.split('.').reduce<any>((n, k) => (n == null ? undefined : n[k]), base);
  return ops.map(o => o.op === 'reorder_facts'
    ? { path: 'facts', from: base.facts, to: applyOps(base, [o]).facts }
    : { path: o.path, from: at(o.path) ?? null, to: o.value });
}

/** The same fields, taken back: from and to swapped. */
export const reverseFields = (fields: Field[]): Field[] => fields.map(f => ({ path: f.path, from: f.to, to: f.from }));

export interface BriefLine { kind: 'same' | 'removed' | 'added'; text: string }

/** The brief before and after, as the changed lines with `context` unchanged lines around each run (a longest common
 *  subsequence over lines; briefs are a few hundred lines at most). '...' marks lines left out. */
export function briefDiff(before: string, after: string, context = 1): BriefLine[] {
  const a = before.split('\n'), b = after.split('\n');
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const all: BriefLine[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { all.push({ kind: 'same', text: a[i]! }); i++; j++; }
    else if (j < m && (i >= n || L[i]![j + 1]! >= L[i + 1]![j]!)) { all.push({ kind: 'added', text: b[j]! }); j++; }
    else { all.push({ kind: 'removed', text: a[i]! }); i++; }
  }
  const keep = all.map((l, k) => l.kind !== 'same' || all.slice(Math.max(0, k - context), k + context + 1).some(x => x.kind !== 'same'));
  const out: BriefLine[] = [];
  for (const [k, l] of all.entries()) {
    if (keep[k]) out.push(l);
    else if (out.length && out[out.length - 1]!.text !== '...') out.push({ kind: 'same', text: '...' });
  }
  if (out.length && out[out.length - 1]!.text === '...') out.pop();
  return out;
}
