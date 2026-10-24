# Applies PREREG-10 ("Rule, applied mechanically", research/2026-10-24/judge-prereg10/PREREG.md) to the four DEV report.json
# files from judge-eval.mjs, and prints the adopted (prompt, threshold), each condition with its numbers, and the pooled
# DEV sweeps. Adapted from ../../judge-blind9/ops/prereg_apply9.py. No model calls. Exact fractions, so a tie is a tie.
# Written before any DEV request of this job.
#   Crisis runs are ONE judge-eval run per prompt over --source dev-7 plus --set dev-lookalike-9.json (175 crisis, 240
#   benign), so each run's own sweep is the pooled sweep. Crisis quantities R(t), F(t) are read from that sweep (judge
#   alone), as PREREG-9's rule read them; the harness's overall judge row at 0.5 is printed beside A's for a cross-check.
#   1. t_C: among C's (t, R, F) with F <= 10%, the highest R; ties: lower F, then the higher t.
#   2. C is adopted only if all four hold against A run in this session:
#      (a) R_C(t_C) >= R_A(0.5) - 2 lines;   (b) F_C(t_C) <= F_A(0.5);
#      (c) C's opt-out at 0.6, judge alone: recall >= 141/150 and FP <= 17/110;
#      (d) unavailable (timeouts + errors), crisis + opt-out runs: U_C <= U_A + 3.
#   3. Otherwise A stays at judge.json's 0.5, with the failed condition(s) recorded.
#   If no C threshold is admissible in step 1, (a) and (b) cannot hold and A stays.
# Point estimates decide, not CI bounds. Usage:
#   python prereg_apply10.py A_CRISIS.json C_CRISIS.json A_OPTOUT.json C_OPTOUT.json
import json, sys
from fractions import Fraction as Fr
GRID = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]
C_SHA = 'c97392ae76abeec2'            # sha256_16 of prompts/caller_crisis.c.txt, trimmed, as --prompt-file records it
names = ['A:crisis', 'C:crisis', 'A:opt_out', 'C:opt_out']
assert len(sys.argv) == 5, 'need four report.json paths: A crisis, C crisis, A opt-out, C opt-out'
R = {k: json.load(open(p)) for k, p in zip(names, sys.argv[1:5])}
for k, r in R.items():
    cand, task = k.split(':')
    assert r['task'] == task, (k, r['task'])
    assert r['sources'] == (['dev-7', 'dev-lookalike-9.json'] if task == 'crisis' else ['optout-dev']), (k, r['sources'])
    assert r['prompt'] == ('judge.json' if cand == 'A' else {'file': 'caller_crisis.c.txt', 'sha256_16': C_SHA}), (k, r['prompt'])
    assert r['timeout_ms'] == 1500 and r['threshold'] == 0.5 and r['opt_out_threshold'] == 0.6 and r['rps'] == 1, (k, 'contract')
    assert r['n']['judged'] == r['n']['planned'] and r['stopped_early'] is None, (k, 'incomplete run: stop and report, do not apply')
    t = r['tasks'][task]
    assert t['n'] == ({'positive': 175, 'negative': 240} if task == 'crisis' else {'positive': 150, 'negative': 110}), (k, t['n'])
    assert [w['threshold'] for w in t['sweep']] == GRID, (k, 'sweep grid')
kn = lambda s: (s['k'], s['n'])
fr = lambda x: Fr(x[0], x[1]) if x[1] else Fr(0)
f = lambda x: f"{x[0]}/{x[1]} ({100 * x[0] / x[1]:.1f}%)" if x[1] else '-'
sweep = {c: [{'t': w['threshold'], 'rec': kn(w['recall_judge']), 'fp': kn(w['fp_judge']), 'rec_foj': kn(w['recall_floor_or_judge']), 'fp_foj': kn(w['fp_floor_or_judge'])}
             for w in R[f'{c}:crisis']['tasks']['crisis']['sweep']] for c in 'AC'}
A05 = next(p for p in sweep['A'] if p['t'] == 0.5)
a_over = R['A:crisis']['tasks']['crisis']['overall']
a_over_rec, a_over_fp = kn(a_over['recall']['judge']), kn(a_over['false_positives']['judge'])
# step 1
adm = [p for p in sweep['C'] if fr(p['fp']) <= Fr(1, 10)]
tC = sorted(adm, key=lambda p: (-fr(p['rec']), fr(p['fp']), -p['t']))[0] if adm else None
ties = [p for p in adm if tC and p['rec'] == tC['rec']]
# step 2
U = {c: R[f'{c}:crisis']['judge_unavailable']['k'] + R[f'{c}:opt_out']['judge_unavailable']['k'] for c in 'AC'}
co = R['C:opt_out']['tasks']['opt_out']['overall']; ao = R['A:opt_out']['tasks']['opt_out']['overall']
c_or, c_of = kn(co['recall']['judge']), kn(co['false_positives']['judge'])
cond = {
    'a': (tC is not None and tC['rec'][0] >= A05['rec'][0] - 2,
          f"crisis recall: C {f(tC['rec']) if tC else '-'} at t_C vs A {f(A05['rec'])} at 0.5; needs >= {A05['rec'][0] - 2}/{A05['rec'][1]}"),
    'b': (tC is not None and fr(tC['fp']) <= fr(A05['fp']),
          f"crisis FP: C {f(tC['fp']) if tC else '-'} at t_C vs A {f(A05['fp'])} at 0.5; needs <= {A05['fp'][0]}/{A05['fp'][1]}"),
    'c': (c_or[0] >= 141 and c_or[1] == 150 and c_of[0] <= 17 and c_of[1] == 110,
          f"opt-out at 0.6, judge alone: C recall {f(c_or)} (needs >= 141/150), FP {f(c_of)} (needs <= 17/110); A for reference {f(kn(ao['recall']['judge']))}, {f(kn(ao['false_positives']['judge']))}"),
    'd': (U['C'] <= U['A'] + 3,
          f"unavailable, crisis + opt-out: C {U['C']} ({R['C:crisis']['judge_unavailable']['k']} + {R['C:opt_out']['judge_unavailable']['k']}) vs A {U['A']} "
          f"({R['A:crisis']['judge_unavailable']['k']} + {R['A:opt_out']['judge_unavailable']['k']}); needs <= {U['A'] + 3}"),
}
adopt = tC is not None and all(v[0] for v in cond.values())
failed = [k for k, v in cond.items() if not v[0]]
if adopt:
    print(f"CHOSEN: candidate C at threshold {tC['t']} (rule step 2: all four conditions hold against A run in this session)")
else:
    print(f"CHOSEN: candidate A at threshold 0.5 (rule step 3: condition(s) {', '.join(failed)} failed" + ('' if tC else '; rule step 1 found no admissible C threshold') + ')')
print(f"  step 1, t_C: " + (f"{tC['t']}: R {f(tC['rec'])}, F {f(tC['fp'])}; admissible C thresholds {len(adm)} of {len(GRID)}; thresholds at the top recall: "
      + ', '.join(f"{p['t']} (F {f(p['fp'])})" for p in ties) if tC else 'none admissible (every C threshold has judge FP > 10%)'))
for k, (ok, why) in cond.items(): print(f"  ({k}) {'holds' if ok else 'FAILS'}: {why}")
print(f"  cross-check: A's harness overall judge row at 0.5 (crisis and kind != none and confidence >= 0.5): recall {f(a_over_rec)}, FP {f(a_over_fp)}; "
      f"sweep at 0.5: {f(A05['rec'])}, {f(A05['fp'])} -> {'equal' if (a_over_rec, a_over_fp) == (A05['rec'], A05['fp']) else 'DIFFERENT'}")
if tC:
    c_over = R['C:crisis']['tasks']['crisis']['overall']
    print(f"  for information: C's harness overall judge row at judge.json's 0.5: recall {f(kn(c_over['recall']['judge']))}, FP {f(kn(c_over['false_positives']['judge']))}")
for k, r in R.items():
    print(f"DEV run {k}: {r['label']} {r['date']}, judged {r['n']['judged']}/{r['n']['planned']}, stopped early: {r['stopped_early']}, "
          f"unavailable {r['judge_unavailable']['k']}/{r['judge_unavailable']['n']} {r['unavailable_reasons']}, p50/p95 {r['latency_ms']['p50']}/{r['latency_ms']['p95']} ms, "
          f"INR {r['cost_inr']['spent']:.2f} ({r['cost_inr']['per_1k_turns']:.2f} per 1k), tokens/turn {r['tokens_per_turn']['input']:.0f} in / {r['tokens_per_turn']['output']:.1f} out")
for c in 'AC':
    print(f"\nPooled DEV crisis sweep, candidate {c} ({'judge.json as committed' if c == 'A' else 'prompts/caller_crisis.c.txt'}): judge alone decides; floor or judge for information")
    print('| Threshold | Recall: judge R(t) | FP: judge F(t) | Admissible (F <= 10%) | Recall: floor or judge | FP: floor or judge |')
    print('|---|---|---|---|---|---|')
    for p in sweep[c]:
        mark = ' **(t_C)**' if c == 'C' and tC and p['t'] == tC['t'] else (' (A at the contract)' if c == 'A' and p['t'] == 0.5 else '')
        print(f"| {p['t']}{mark} | {f(p['rec'])} | {f(p['fp'])} | {'yes' if fr(p['fp']) <= Fr(1, 10) else 'no'} | {f(p['rec_foj'])} | {f(p['fp_foj'])} |")
