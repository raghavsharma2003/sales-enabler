// The ship gate for the analysis contract (no model): the prompt the product sends, on the bench's own outcome
// definition, must be byte-identical to the one the bench measured (scripts/analysis-bench/contracts/*.bench.txt, here
// r6's r5-outcome-first: DEV 42/42 twice, TEST 42/42 twice, objections 52/52). Pattern from
// research/2026-10-24/benches-r6/harness/variant-probe.ts. Also: the workspace's client rule sits inside, or directly
// after, the OUTCOME block. A contract change ships only with a new measured file and a new bench round.
//   node --import tsx product/scripts/analysis-variant-probe.ts      # exit 1 when the gate fails
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisPrompt, PROMPT_VARIANTS } from '../server/modules/calls/analysis.ts';
import { OUTCOME_VALUES } from './analysis-bench/cases.ts';

export const MEASURED = join(dirname(fileURLToPath(import.meta.url)), 'analysis-bench', 'contracts', 'r6-outcome-first.bench.txt');
/** The bench's outcome definition (analysis-bench.ts setup). */
export const BENCH_QUESTION = { question: 'What did the person decide on this call?', values: [...OUTCOME_VALUES] };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function probe(): { ok: boolean; checks: Record<string, boolean>; shippedSha256: string; measuredSha256: string; chars: Record<string, number> } {
  const measured = readFileSync(MEASURED, 'utf8');
  const shipped = analysisPrompt(BENCH_QUESTION, 'current');
  const ruled = analysisPrompt({ ...BENCH_QUESTION, instructions: 'A payment link sent counts as agreed.' }, 'current').split('\n');
  const rule = ruled.findIndex(l => l.startsWith('OUTCOME, client rule:'));
  const outcomeStart = ruled.findIndex(l => l.startsWith('OUTCOME: question'));
  const outcomeEnd = ruled.findIndex(l => l.startsWith('- confidence: 0..1'));
  const checks = {
    'shipped prompt is byte-identical to the measured one': shipped === measured,
    'r5-outcome-first names the shipped prompt': analysisPrompt(BENCH_QUESTION, 'r5-outcome-first') === shipped,
    'the client rule sits directly after the OUTCOME block': outcomeStart >= 0 && outcomeEnd > outcomeStart && rule === outcomeEnd + 1,
    'the OUTCOME block comes before KIND': ruled.findIndex(l => l.startsWith('KIND (')) > rule,
    'a client rule changes nothing else': ruled.filter((_, i) => i !== rule).join('\n') === shipped,
  };
  return { ok: Object.values(checks).every(Boolean), checks, shippedSha256: sha(shipped), measuredSha256: sha(measured),
    chars: Object.fromEntries(PROMPT_VARIANTS.map(v => [v, analysisPrompt(BENCH_QUESTION, v).length])) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = probe();
  console.log(JSON.stringify(r, null, 1));
  if (!r.ok) process.exitCode = 1;
}
