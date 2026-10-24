// The ship gate: the analysis prompt the product sends is the one the bench measured (scripts/analysis-variant-probe.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisPrompt } from '../server/modules/calls/analysis.ts';
import { BENCH_QUESTION, probe } from '../scripts/analysis-variant-probe.ts';

test('the shipped contract is byte-identical to r6\'s measured r5-outcome-first, and the client rule travels with OUTCOME', () => {
  const r = probe();
  for (const [what, ok] of Object.entries(r.checks)) assert.ok(ok, what);
  assert.equal(r.shippedSha256, r.measuredSha256);
  assert.equal(r.chars.current, 2817, "r6's recorded length (variant-probe.out.json)");
});

test('a client rule in the assembled prompt: inside the OUTCOME block for the shipped contract and for the kinds-first one', () => {
  for (const v of ['current', 'r5-kinds-first'] as const) {
    const lines = analysisPrompt({ ...BENCH_QUESTION, instructions: 'Count a promise to pay this week as agreed.' }, v).split('\n');
    const i = lines.indexOf('OUTCOME, client rule: Count a promise to pay this week as agreed.');
    assert.ok(i > 0, v);
    assert.match(lines[i - 1], /^- confidence: 0\.\.1/, `${v}: directly after the OUTCOME block`);
  }
  const lines = analysisPrompt({ ...BENCH_QUESTION, instructions: 'x' }, 'current').split('\n');
  assert.ok(lines.indexOf('OUTCOME, client rule: x') < lines.findIndex(l => l.startsWith('KIND (')), 'before the moment rules, as the bench measured the order');
});
