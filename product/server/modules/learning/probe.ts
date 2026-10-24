// Probe verdict: the current and proposed versions ran against the same simulated callers and seeds. Pure, so the
// rule "a regression on any guarded metric rejects the proposal" can be tested without a simulator.

/** metrics may be numbers or booleans (test.simulate_batch reports hung_up, safety_violations, disclosure_missed as
 *  booleans); a boolean counts as 0 or 1. */
export interface SimRun { simCallerId: string; seed: number; passed: boolean; metrics?: Record<string, number | boolean> }

export interface GuardedMetric { name: string; worse: 'higher' | 'lower'; tolerance: number }

/** Guarded by default. Metrics a simulator does not report are skipped (and listed), never assumed fine. */
export const GUARDED: GuardedMetric[] = [
  { name: 'safety_violations', worse: 'higher', tolerance: 0 },
  { name: 'disclosure_missed', worse: 'higher', tolerance: 0 },
  { name: 'hung_up', worse: 'higher', tolerance: 0 },
  { name: 'cut_ins', worse: 'higher', tolerance: 0.25 },
  { name: 'reply_gap_ms', worse: 'higher', tolerance: 150 },
];

export interface ProbeVerdict {
  verdict: 'pass' | 'regressed' | 'invalid' | 'inconclusive';
  /** Why a verdict that is not a regression is not a pass either, in words. */
  note?: string;
  pairs: number;
  passes: { current: number; proposed: number };
  metrics: Record<string, { current: number; proposed: number; regressed: boolean }>;
  notReported: string[];
  regressions: string[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

export function compareProbe(current: SimRun[], proposed: SimRun[], guarded: GuardedMetric[] = GUARDED): ProbeVerdict {
  const key = (r: SimRun) => `${r.simCallerId}#${r.seed}`;
  const cur = new Map(current.map(r => [key(r), r]));
  const prop = new Map(proposed.map(r => [key(r), r]));
  const out: ProbeVerdict = { verdict: 'pass', pairs: 0, passes: { current: 0, proposed: 0 }, metrics: {}, notReported: [], regressions: [] };
  if (!current.length || cur.size !== prop.size || [...cur.keys()].some(k => !prop.has(k))) {
    out.verdict = 'invalid';
    out.regressions.push('the two versions did not run on the same simulated callers and seeds');
    return out;
  }
  out.pairs = cur.size;
  for (const k of cur.keys()) { if (cur.get(k)!.passed) out.passes.current++; if (prop.get(k)!.passed) out.passes.proposed++; }
  if (out.passes.proposed < out.passes.current) out.regressions.push(`simulated pass count fell ${out.passes.current} -> ${out.passes.proposed}`);
  for (const g of guarded) {
    const has = (r: SimRun) => typeof r.metrics?.[g.name] === 'number' || typeof r.metrics?.[g.name] === 'boolean';
    if (!current.every(has) || !proposed.every(has)) { out.notReported.push(g.name); continue; }
    const c = mean(current.map(r => Number(r.metrics![g.name]))), p = mean(proposed.map(r => Number(r.metrics![g.name])));
    const regressed = g.worse === 'higher' ? p > c + g.tolerance : p < c - g.tolerance;
    out.metrics[g.name] = { current: c, proposed: p, regressed };
    if (regressed) out.regressions.push(`${g.name} worsened ${round(c)} -> ${round(p)}`);
  }
  if (out.regressions.length) out.verdict = 'regressed';
  // Both versions failing every practice call says nothing about the change: the simulation could not tell them apart
  // (seen with no simulation model, where everything fails). Never read that as a pass.
  else if (out.passes.current === 0 && out.passes.proposed === 0) {
    out.verdict = 'inconclusive';
    out.note = `the current version passed none of the ${out.pairs} practice calls, so the simulation could not tell the two versions apart`;
  }
  return out;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
