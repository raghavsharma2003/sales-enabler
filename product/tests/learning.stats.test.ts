// Known-answer tests for the learning statistics. Expected values are the blueprint's computed tables
// (learning.md §2: Fleiss power) and hand calculations written out in the comments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armFor, decide, harmSprt, hash32, normalCdf, normalQuantile, powerPlan, sampleSizePerArm, sequentialGuard, shadowAA, twoProportionZ, wilson } from '../server/modules/learning/stats.ts';
import { compareProbe, type SimRun } from '../server/modules/learning/probe.ts';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('normal quantile and CDF', () => {
  close(normalQuantile(0.975), 1.959963985, 1e-8);
  close(normalQuantile(0.8), 0.841621234, 1e-8);
  close(normalQuantile(0.01), -2.326347874, 1e-8);
  close(normalCdf(1.959963985), 0.975, 1e-6);
  close(normalCdf(-1), 0.158655254, 1e-6);
});

test('power: Fleiss two-proportion reproduces the blueprint table (alpha 0.05, power 0.8)', () => {
  assert.equal(sampleSizePerArm(0.5, 0.45), 1565);      // L6's 1,565 for 50% -> 45%
  assert.equal(sampleSizePerArm(0.15, 0.10), 686);      // opening 15% -> 10%
  assert.equal(sampleSizePerArm(0.15, 0.12), 2036);
  assert.equal(sampleSizePerArm(0.20, 0.25), 1094);     // outcome 20 -> 25%
  assert.equal(sampleSizePerArm(0.20, 0.22), 6510);
  assert.equal(sampleSizePerArm(0.10, 0.11), 14751);
  const p = powerPlan(0.2, 0.05);
  assert.deepEqual([p.perArm, p.total, p.target], [1094, 2188, 0.25]);
  assert.throws(() => sampleSizePerArm(0.2, 0.2));
});

test('Wilson interval: 10 of 100 is 5.52% to 17.44%', () => {
  // centre (0.1 + 1.92/100)/(1.038416) = 0.114790; half 1.96*sqrt(0.0009 + 0.00009604)/1.038416 = 0.059570
  const w = wilson(10, 100);
  close(w.lo, 0.055229, 1e-5); close(w.hi, 0.174366, 1e-5);
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 1, p: 0 });
  close(wilson(0, 20).lo, 0, 1e-12);
});

test('two-proportion z: 30/100 vs 50/100', () => {
  // pooled 0.4, se sqrt(0.4*0.6*0.02) = 0.069282, z = 0.2/0.069282 = 2.886751, p = 0.003892
  const t = twoProportionZ({ k: 30, n: 100 }, { k: 50, n: 100 });
  close(t.z, 2.886751, 1e-6); close(t.p, 0.003892, 2e-6); close(t.diff, 0.2, 1e-12);
  // unpooled Wald: se sqrt(.21/100 + .25/100) = 0.067823, 1.959964 * se = 0.132931
  close(t.ci.lo, 0.067069, 1e-5); close(t.ci.hi, 0.332931, 1e-5);
  assert.equal(decide({ k: 30, n: 100 }, { k: 50, n: 100 }).verdict, 'win');
  assert.equal(decide({ k: 50, n: 100 }, { k: 30, n: 100 }).verdict, 'loss');
  assert.equal(decide({ k: 30, n: 100 }, { k: 36, n: 100 }).verdict, 'inconclusive');
});

test('sequential guard: no verdict before the horizon or the minimum days', () => {
  const startedAt = new Date('2026-10-01T00:00:00Z');
  const g1 = sequentialGuard({ control: 900, treatment: 1000, horizonPerArm: 1094, startedAt, minDays: 7, now: new Date('2026-10-20T00:00:00Z') });
  assert.equal(g1.mayDecide, false); assert.equal(g1.remainingCalls, 194 + 94);
  const g2 = sequentialGuard({ control: 1094, treatment: 1100, horizonPerArm: 1094, startedAt, minDays: 7, now: new Date('2026-10-05T00:00:00Z') });
  assert.equal(g2.mayDecide, false); assert.equal(g2.remainingCalls, 0);
  const g3 = sequentialGuard({ control: 1094, treatment: 1100, horizonPerArm: 1094, startedAt, minDays: 7, now: new Date('2026-10-09T00:00:00Z') });
  assert.equal(g3.mayDecide, true);
});

test('always-valid harm test (mixture SPRT)', () => {
  // smoothed p1 = 10.5/101, p2 = 30.5/101, V = 0.0030394, tau^2 = 0.0025:
  // sqrt(V/(V+t2)) = 0.74074, exp(t2*0.04/(2V(V+t2))) = exp(2.96974) = 19.4866 -> lambda 14.4345 < 20
  const a = harmSprt({ k: 10, n: 100 }, { k: 30, n: 100 });
  close(a.lambda, 14.4345, 1e-3); assert.equal(a.harmful, false);
  assert.equal(harmSprt({ k: 5, n: 200 }, { k: 40, n: 200 }).harmful, true);
  assert.equal(harmSprt({ k: 40, n: 200 }, { k: 5, n: 200 }).harmful, false, 'one-sided: fewer bad events is never harm');
});

test('sticky arms are deterministic and roughly balanced', () => {
  assert.equal(armFor('e1', 'contact-7'), armFor('e1', 'contact-7'));
  let t = 0;
  for (let i = 0; i < 4000; i++) if (armFor('exp-x', 'c' + i) === 'treatment') t++;
  close(t / 4000, 0.5, 0.03);
  assert.equal(hash32('abc'), hash32('abc'));
});

test('shadow A/A: clean data passes, miscounted units and missing outcomes fail', () => {
  const clean = Array.from({ length: 300 }, (_, i) => ({ id: 'u' + i, success: hash32('s' + i) % 100 < 30, hasOutcome: true }));
  const ok = shadowAA(clean, { salt: 'fixed' });
  assert.equal(ok.passed, true, ok.reasons.join('; '));
  close(ok.falseWinnerRate, 0.05, 0.02);
  // The same 60 contacts counted ten times each (calls as units): clustered, so false winners explode.
  const clustered = Array.from({ length: 600 }, (_, i) => ({ id: 'c' + (i % 60), success: hash32('s' + (i % 60)) % 100 < 30, hasOutcome: true }));
  const bad = shadowAA(clustered, { salt: 'fixed' });
  assert.equal(bad.passed, false); assert.ok(bad.falseWinnerRate > 0.3);
  const holes = shadowAA(clean.map((u, i) => ({ ...u, hasOutcome: i % 2 === 0 })), { salt: 'fixed' });
  assert.equal(holes.plumbingOk, false);
  assert.equal(shadowAA(clean.slice(0, 50), { salt: 'fixed' }).passed, false, 'too few contacts');
});

test('probe verdict: a regression on any guarded metric rejects; unmatched runs are invalid', () => {
  const run = (id: string, seed: number, passed: boolean, hung: number): SimRun => ({ simCallerId: id, seed, passed, metrics: { hung_up: hung, safety_violations: 0 } });
  const cur = [run('a', 1, true, 0), run('b', 1, true, 1)];
  assert.equal(compareProbe(cur, [run('a', 1, true, 0), run('b', 1, true, 0)]).verdict, 'pass');
  const worse = compareProbe(cur, [run('a', 1, true, 1), run('b', 1, true, 1)]);
  assert.equal(worse.verdict, 'regressed'); assert.match(worse.regressions[0]!, /hung_up/);
  assert.equal(compareProbe(cur, [run('a', 1, false, 0), run('b', 1, true, 0)]).verdict, 'regressed');
  assert.equal(compareProbe(cur, [run('a', 2, true, 0), run('b', 1, true, 0)]).verdict, 'invalid');
  assert.ok(compareProbe(cur, [run('a', 1, true, 0), run('b', 1, true, 0)]).notReported.includes('reply_gap_ms'));
});

test('probe: boolean metrics from the simulator (hung_up, safety_violations, disclosure_missed) are guarded, not skipped', () => {
  // test.simulate_batch reports these as booleans; reading only numbers silently switched the guardrails off.
  const run = (id: string, hung: boolean, safety: boolean): SimRun => ({ simCallerId: id, seed: 1, passed: true, metrics: { hung_up: hung, safety_violations: safety, disclosure_missed: false } as any });
  const v = compareProbe([run('a', false, false), run('b', false, false)], [run('a', false, true), run('b', false, false)]);
  assert.equal(v.verdict, 'regressed', JSON.stringify(v));
  assert.ok(!v.notReported.includes('safety_violations'));
  assert.match(v.regressions.join(' '), /safety_violations/);
});

test('probe: when the current version passes no practice call, the simulation cannot tell the versions apart: inconclusive, never pass', () => {
  // Seen on the dev walk: with no simulation model both versions scored 0 of 12, and "no regression" read as a pass.
  const run = (id: string, seed: number, passed: boolean): SimRun => ({ simCallerId: id, seed, passed, metrics: { hung_up: false, safety_violations: false } as any });
  const none = [run('a', 1, false), run('b', 1, false), run('a', 2, false)];
  const v = compareProbe(none, none.map(r => ({ ...r })));
  assert.equal(v.verdict, 'inconclusive', JSON.stringify(v));
  assert.match(v.note!, /passed none of the 3 practice calls/);
  // The proposed version passing some is a real difference, not inconclusive; a guarded regression still rejects.
  assert.equal(compareProbe(none, [run('a', 1, true), run('b', 1, false), run('a', 2, false)]).verdict, 'pass');
  const worse = compareProbe(none, [{ ...run('a', 1, false), metrics: { hung_up: true, safety_violations: false } as any }, run('b', 1, false), run('a', 2, false)]);
  assert.equal(worse.verdict, 'regressed');
});


test('power accounts for where outcomes come from: AI reads at agreement a count as (2a-1)^2 of a true label', async () => {
  const { labelAdjustedPlan, powerPlan } = await import('../server/modules/learning/stats.ts');
  const base = powerPlan(0.4, 0.08);
  const allTrue = labelAdjustedPlan(base, { trueShare: 1, aiAgreement: null });
  assert.equal(allTrue.perArm, base.perArm, 'all verified or person-labelled: as planned');
  const half = labelAdjustedPlan(base, { trueShare: 0.5, aiAgreement: 0.9 });
  const factor = 0.5 + 0.5 * (2 * 0.9 - 1) ** 2;
  assert.equal(half.perArm, Math.ceil(base.perArm / factor));
  assert.ok(half.perArm > base.perArm, 'fewer true labels need more calls');
  assert.equal(half.total, half.perArm * 2);
  assert.ok(Math.abs(half.labelFactor - factor) < 1e-9);
  assert.ok(labelAdjustedPlan(base, { trueShare: 0.2, aiAgreement: 0.9 }).perArm > half.perArm);
});
