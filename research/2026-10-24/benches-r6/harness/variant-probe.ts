// r6: (1) does the tree under test (839292d) build the same prompts as round 5's tree (ab5dade) for the arms that
// existed then? 95339a6 says the refactor is byte-identical for current, r4-table, r3-stance and no-outcome-rules.
// (2) What does each of 95339a6's three r5 arms change against current? Lines only in the arm, lines only in current,
// and whether the shared lines keep their order. The tie-break in dev-select-rule.txt reads (2).
// Inputs: the bench's outcome definition (analysis-bench.ts setup: 'What did the person decide on this call?' over
// OUTCOME_VALUES) and a call with no outcome question. No model. ab5dade's analysis.ts is copied next to analysis.ts as
// zz-r5probe.ts for the import and removed after. Writes the bench-input prompts to argv[2] (scratch) for difflib.
import { writeFileSync } from 'node:fs';
import { analysisPrompt, PROMPT_VARIANTS } from '/dev/shm/wt-bench6/product/server/modules/calls/analysis.ts';
import { analysisPrompt as r5 } from '/dev/shm/wt-bench6/product/server/modules/calls/zz-r5probe.ts';
import { OUTCOME_VALUES } from '/dev/shm/wt-bench6/product/scripts/analysis-bench/cases.ts';
const inputs = new Map<string, any>([['bench', { question: 'What did the person decide on this call?', values: [...OUTCOME_VALUES] }], ['noq', { question: null, values: [] }]]);
const res: Record<string, any> = { inputs: inputs.size, variants: [...PROMPT_VARIANTS] };
for (const v of ['current', 'r4-table', 'r3-stance', 'no-outcome-rules'] as const) {
  let same = 0; const diff: string[] = [];
  for (const [k, o] of inputs) { if (analysisPrompt(o, v) === r5(o, v as any)) same++; else diff.push(k); }
  res[`${v} 839292d == ab5dade`] = { same, differ: diff.length, firstDiff: diff[0] ?? null };
}
const q = inputs.get('bench');
const lines = (s: string) => s.split('\n');
const C = lines(analysisPrompt(q, 'current'));
const prompts: Record<string, string> = {};
for (const v of PROMPT_VARIANTS) prompts[v] = analysisPrompt(q, v);
for (const v of ['r5-short-objection', 'r5-outcome-first', 'r5-moment-not-outcome'] as const) {
  const A = lines(prompts[v]);
  const shared = A.filter(l => C.includes(l));
  res[`${v} vs current`] = {
    onlyArm: A.filter(l => !C.includes(l)), onlyCurrent: C.filter(l => !A.includes(l)),
    sharedLinesInCurrentOrder: JSON.stringify(shared) === JSON.stringify(C.filter(l => A.includes(l))),
    noQuestionPromptSameAsCurrent: analysisPrompt(inputs.get('noq'), v) === analysisPrompt(inputs.get('noq'), 'current'),
  };
}
res.chars = Object.fromEntries(PROMPT_VARIANTS.map(v => [v, prompts[v].length]));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(prompts, null, 1));
console.log(JSON.stringify(res, null, 1));
