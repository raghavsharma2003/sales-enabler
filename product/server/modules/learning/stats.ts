// Statistics for the learning loop: pure functions, no I/O, known-answer tested (tests/learning.stats.test.ts).
// The Learner is an engine, not an LLM: power, intervals, the fixed-horizon test, the peeking guard, the always-valid
// harm test for guardrails and the shadow A/A all live here so they can be checked by hand.
//
// Choices (blueprint learning.md §5):
//   power   Fleiss two-proportion formula without continuity correction; reproduces L6's 1,565/arm for 50% -> 45%.
//   test    pooled two-proportion z test, two-sided, decided once at the pre-registered horizon.
//   peeking the verdict is hidden until both arms reach the horizon (and the minimum days): no early winners.
//   harm    mixture SPRT (Johari et al.), always valid, one-sided, used only to STOP a harmful arm early.

/** Standard normal CDF. erfc from Numerical Recipes (fractional error < 1.2e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const erfc = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - erfc / 2 : erfc / 2;
}

/** Inverse standard normal CDF (Acklam, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Units (contacts) per arm to detect p1 -> p2 with a two-sided test at alpha and the given power (Fleiss, no CC). */
export function sampleSizePerArm(p1: number, p2: number, alpha = 0.05, power = 0.8): number {
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1)) throw new RangeError('rates must be in (0, 1)');
  if (p1 === p2) throw new RangeError('the rates must differ');
  const za = normalQuantile(1 - alpha / 2), zb = normalQuantile(power);
  const pbar = (p1 + p2) / 2;
  const num = za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((num * num) / ((p1 - p2) ** 2));
}

export interface PowerPlan { baseline: number; target: number; alpha: number; power: number; perArm: number; total: number }

/** The plan shown before launch: calls to prove = both arms. mde is absolute (0.05 = five points). */
export function powerPlan(baseline: number, mdeAbs: number, alpha = 0.05, power = 0.8): PowerPlan {
  const target = baseline + mdeAbs;
  const perArm = sampleSizePerArm(baseline, target, alpha, power);
  return { baseline, target, alpha, power, perArm, total: perArm * 2 };
}

/** Wilson score interval for k successes in n. */
export function wilson(k: number, n: number, z = 1.959963984540054): { lo: number; hi: number; p: number } {
  if (n <= 0) return { lo: 0, hi: 1, p: 0 };
  const p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), p };
}

export interface Arm { k: number; n: number }

export interface ZTest { z: number; p: number; diff: number; ci: { lo: number; hi: number } }

/** Pooled two-proportion z test, two-sided; diff = treatment - control with an unpooled 95% Wald interval. */
export function twoProportionZ(control: Arm, treatment: Arm, alpha = 0.05): ZTest {
  const { k: k1, n: n1 } = control, { k: k2, n: n2 } = treatment;
  if (n1 <= 0 || n2 <= 0) return { z: 0, p: 1, diff: 0, ci: { lo: -1, hi: 1 } };
  const p1 = k1 / n1, p2 = k2 / n2, diff = p2 - p1;
  const pool = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  const z = se === 0 ? 0 : diff / se;
  const p = se === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(z)));
  const za = normalQuantile(1 - alpha / 2);
  const seU = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  return { z, p, diff, ci: { lo: diff - za * seU, hi: diff + za * seU } };
}

export interface GuardInput { control: number; treatment: number; horizonPerArm: number; startedAt: Date; minDays: number; now?: Date }

/** The peeking guard: a verdict exists only once both arms reach the pre-registered horizon and the minimum days.
 *  Before that the meter fills but the effect stays hidden, so watching cannot create false winners. */
export function sequentialGuard(g: GuardInput): { mayDecide: boolean; remainingCalls: number; reason: string } {
  const remaining = Math.max(0, g.horizonPerArm - g.control) + Math.max(0, g.horizonPerArm - g.treatment);
  const days = ((g.now ?? new Date()).getTime() - g.startedAt.getTime()) / 86_400_000;
  if (remaining > 0) return { mayDecide: false, remainingCalls: remaining, reason: `under-powered: about ${remaining} more calls before a verdict` };
  if (days < g.minDays) return { mayDecide: false, remainingCalls: 0, reason: `horizon reached; waiting for the ${g.minDays}-day minimum so weekdays wash out` };
  return { mayDecide: true, remainingCalls: 0, reason: 'horizon reached' };
}

export type Verdict = 'win' | 'loss' | 'inconclusive';

/** The one fixed-horizon decision. Call only when sequentialGuard says mayDecide. */
export function decide(control: Arm, treatment: Arm, alpha = 0.05): ZTest & { verdict: Verdict } {
  const t = twoProportionZ(control, treatment, alpha);
  const verdict: Verdict = t.p < alpha ? (t.diff > 0 ? 'win' : 'loss') : 'inconclusive';
  return { ...t, verdict };
}

/** Always-valid one-sided harm test (mixture SPRT, normal approximation, mixing variance tau^2).
 *  "Harm" = the treatment's bad-event rate exceeds control's. Safe to evaluate after every call. */
export function harmSprt(control: Arm, treatment: Arm, alpha = 0.05, tau = 0.05): { lambda: number; harmful: boolean } {
  if (control.n <= 0 || treatment.n <= 0) return { lambda: 1, harmful: false };
  // Laplace-smoothed rates keep the variance positive when an arm has no events yet.
  const p1 = (control.k + 0.5) / (control.n + 1), p2 = (treatment.k + 0.5) / (treatment.n + 1);
  const theta = treatment.k / treatment.n - control.k / control.n;
  const v = p1 * (1 - p1) / control.n + p2 * (1 - p2) / treatment.n;
  const t2 = tau * tau;
  const lambda = Math.sqrt(v / (v + t2)) * Math.exp((t2 * theta * theta) / (2 * v * (v + t2)));
  return { lambda, harmful: theta > 0 && lambda >= 1 / alpha };
}

/** 32-bit FNV-1a with a final avalanche; deterministic unit hashing for arms and shadow splits. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** Sticky arm for a unit: the same contact always meets the same version for the life of the experiment. */
export function armFor(experimentId: string, unitId: string, treatmentShare = 0.5): 'control' | 'treatment' {
  return hash32(experimentId + ':' + unitId) / 0x1_0000_0000 < treatmentShare ? 'treatment' : 'control';
}

export interface AaUnit { id: string; success: boolean; hasOutcome: boolean }
export interface AaResult {
  units: number; runs: number; falseWinners: number; falseWinnerRate: number;
  coverage: number; coverageImbalanceP: number; plumbingOk: boolean; passed: boolean; reasons: string[];
}

/** Shadow A/A: re-randomise the tenant's own units into two shadow arms `runs` times and run the production test on
 *  each split. Both arms ran the same version, so every "winner" is false; the rate estimates the procedure's real
 *  false-winner rate on this tenant's data. The plumbing check fails when outcomes are missing too often or unevenly
 *  (an outcome writer that writes for some calls only). */
export function shadowAA(units: AaUnit[], o: { runs?: number; alpha?: number; salt?: string; minUnits?: number; maxFalseRate?: number; minCoverage?: number } = {}): AaResult {
  const runs = o.runs ?? 1000, alpha = o.alpha ?? 0.05, salt = o.salt ?? 'aa';
  const minUnits = o.minUnits ?? 100, maxFalse = o.maxFalseRate ?? 0.065, minCoverage = o.minCoverage ?? 0.8;
  const reasons: string[] = [];
  let falseWinners = 0;
  for (let r = 0; r < runs; r++) {
    const a = { k: 0, n: 0 }, b = { k: 0, n: 0 };
    for (const u of units) {
      const arm = hash32(`${salt}:${r}:${u.id}`) & 1 ? a : b;
      arm.n++; if (u.success) arm.k++;
    }
    if (a.n && b.n && twoProportionZ(a, b, alpha).p < alpha) falseWinners++;
  }
  const covA = { k: 0, n: 0 }, covB = { k: 0, n: 0 };
  for (const u of units) { const arm = hash32(`${salt}:cov:${u.id}`) & 1 ? covA : covB; arm.n++; if (u.hasOutcome) arm.k++; }
  const coverage = units.length ? (covA.k + covB.k) / units.length : 0;
  const coverageImbalanceP = covA.n && covB.n ? twoProportionZ(covA, covB).p : 1;
  const falseWinnerRate = runs ? falseWinners / runs : 0;
  if (units.length < minUnits) reasons.push(`only ${units.length} eligible contacts; the shadow A/A needs ${minUnits}`);
  if (coverage < minCoverage) reasons.push(`outcomes recorded for ${(coverage * 100).toFixed(1)}% of calls (need ${minCoverage * 100}%): check the outcome writer`);
  if (coverageImbalanceP < 0.01) reasons.push('outcomes are recorded unevenly across shadow arms: check the outcome writer');
  if (falseWinnerRate > maxFalse) reasons.push(`false-winner rate ${(falseWinnerRate * 100).toFixed(1)}% exceeds ${maxFalse * 100}%`);
  const plumbingOk = coverage >= minCoverage && coverageImbalanceP >= 0.01;
  return { units: units.length, runs, falseWinners, falseWinnerRate, coverage, coverageImbalanceP, plumbingOk, passed: reasons.length === 0, reasons };
}
