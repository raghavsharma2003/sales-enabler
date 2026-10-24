// r5: does each 2cdf64b --prompt-variant arm reproduce the contract it names? Compares analysisPrompt() at the tree under
// test against the same function at 8e3440a (round 4, b1a80cf's table) and at bfa7ee7 (round 3's stance sentence), on
// the bench's outcome definition (analysis-bench.ts:79, 'What did the person decide on this call?' over OUTCOME_VALUES)
// and on a call with no outcome question. No model. The two old files are copied next to analysis.ts for the import
// and removed after.
import { analysisPrompt } from '/dev/shm/wt-bench5/product/server/modules/calls/analysis.ts';
import { analysisPrompt as r4 } from '/dev/shm/wt-bench5/product/server/modules/calls/zz-r4probe.ts';
import { analysisPrompt as r3 } from '/dev/shm/wt-bench5/product/server/modules/calls/zz-r3probe.ts';
import { OUTCOME_VALUES } from '/dev/shm/wt-bench5/product/scripts/analysis-bench/cases.ts';
const inputs = new Map<string, any>([['bench', { question: 'What did the person decide on this call?', values: [...OUTCOME_VALUES] }], ['noq', { question: null, values: [] }]]);
const res: Record<string, any> = { inputs: inputs.size };
const cmp = (name: string, a: (o: any) => string, b: (o: any) => string) => {
  let same = 0, diff: string[] = [];
  for (const [k, o] of inputs) { if (a(o) === b(o)) same++; else diff.push(k); }
  res[name] = { same, differ: diff.length, firstDiff: diff[0] ?? null };
};
cmp('r4-table == 8e3440a', o => analysisPrompt(o, 'r4-table'), o => r4(o));
cmp('r3-stance == bfa7ee7', o => analysisPrompt(o, 'r3-stance'), o => r3(o));
cmp('current == 8e3440a', o => analysisPrompt(o, 'current'), o => r4(o));
const q = [...inputs.values()].find(o => o.question);
const lines = (s: string) => s.split('\n');
const A = lines(analysisPrompt(q, 'current')), B = lines(r4(q));
res.currentVsR4_changedLines = { onlyCurrent: A.filter(l => !B.includes(l)), onlyR4: B.filter(l => !A.includes(l)) };
const N = lines(analysisPrompt(q, 'no-outcome-rules')), R = lines(r4(q));
res.noOutcomeRulesVsR4 = { onlyR4: R.filter(l => !N.includes(l)), onlyNoRules: N.filter(l => !R.includes(l)) };
res.chars = Object.fromEntries((['current', 'r4-table', 'r3-stance', 'no-outcome-rules'] as const).map(v => [v, analysisPrompt(q, v).length]));
console.log(JSON.stringify(res, null, 1));
