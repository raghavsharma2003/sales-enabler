# Applies PREREG-9 ("The rule, applied mechanically", research/2026-10-24/judge-prereg9/PREREG.md) to the four DEV crisis
# report.json files from judge-eval.mjs, and prints the chosen (candidate, threshold), the rule step that chose it, and
# the pooled DEV sweep that chose it. Adapted from ../../judge-blind8/ops/prereg_apply.py (rule 8: lowest t with FP <= 5%),
# updated for rule 9. No model calls. Exact fractions, so a tie is a tie and 0.10 is 0.10.
#   Pool: dev-7 + dev-lookalike-9 per candidate (k and n summed per threshold).
#   1. Admissible: every (candidate, t) with F(t) <= 0.10 on pooled DEV (judge alone).
#   2. Choose the admissible pair with the highest R(t); ties: lower F(t), then candidate A, then the higher t.
#   3. If none is admissible: candidate A at the lowest t with F(t) <= 0.15.
#   4. Otherwise: candidate A at 0.5, and record that the rule found nothing.
# Point estimates decide, not CI bounds. Usage:
#   python prereg_apply9.py A_DEV7.json A_DLK9.json B_DEV7.json B_DLK9.json
import json, sys
from fractions import Fraction as Fr
GRID = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]
B_SHA = 'ed63058d5526890a'            # sha256_16 of prompts/caller_crisis.risk100.txt, trimmed, as --prompt-file records it
paths = dict(zip(['A:dev-7', 'A:dev-lookalike-9', 'B:dev-7', 'B:dev-lookalike-9'], sys.argv[1:5]))
assert len(paths) == 4, 'need four report.json paths'
R = {k: json.load(open(p)) for k, p in paths.items()}
for k, r in R.items():
    cand, src = k.split(':')
    assert r['task'] == 'crisis', (k, r['task'])
    assert r['sources'] == (['dev-7'] if src == 'dev-7' else ['dev-lookalike-9.json']), (k, r['sources'])
    assert r['prompt'] == ('judge.json' if cand == 'A' else {'file': 'caller_crisis.risk100.txt', 'sha256_16': B_SHA}), (k, r['prompt'])
    assert r['timeout_ms'] == 1500, (k, r['timeout_ms'])
    assert [w['threshold'] for w in r['tasks']['crisis']['sweep']] == GRID, (k, 'sweep grid')

def pooled(cand):
    out = []
    for i, t in enumerate(GRID):
        ws = [R[f'{cand}:{s}']['tasks']['crisis']['sweep'][i] for s in ('dev-7', 'dev-lookalike-9')]
        add = lambda key: (sum(w[key]['k'] for w in ws), sum(w[key]['n'] for w in ws))
        out.append({'cand': cand, 't': t, 'rec': add('recall_judge'), 'fp': add('fp_judge'),
                    'rec_foj': add('recall_floor_or_judge'), 'fp_foj': add('fp_floor_or_judge')})
    return out
P = {c: pooled(c) for c in 'AB'}
fr = lambda kn: Fr(kn[0], kn[1]) if kn[1] else Fr(0)
pairs = P['A'] + P['B']
step, chosen = None, None
adm = [p for p in pairs if fr(p['fp']) <= Fr(1, 10)]
if adm:
    chosen = sorted(adm, key=lambda p: (-fr(p['rec']), fr(p['fp']), p['cand'] != 'A', -p['t']))[0]; step = 2
    ties = [p for p in adm if fr(p['rec']) == fr(chosen['rec'])]
else:
    a15 = [p for p in P['A'] if fr(p['fp']) <= Fr(15, 100)]
    if a15: chosen = min(a15, key=lambda p: p['t']); step = 3
    else: chosen = {'cand': 'A', 't': 0.5}; step = 4
    ties = []

f = lambda kn: f"{kn[0]}/{kn[1]} ({100 * kn[0] / kn[1]:.1f}%)" if kn[1] else '-'
print(f"CHOSEN: candidate {chosen['cand']} at threshold {chosen['t']} (rule step {step}"
      + {2: ': highest pooled DEV judge recall among the admissible pairs, FP <= 10%)', 3: ': none admissible; A at the lowest t with FP <= 15%)',
         4: ': THE RULE FOUND NOTHING; A at 0.5)'}[step])
if step == 2:
    print(f"  admissible pairs: {len(adm)} of {len(pairs)}; pairs at the chosen recall {f(chosen['rec'])}: "
          + ', '.join(f"{p['cand']}@{p['t']} FP {f(p['fp'])}" for p in sorted(ties, key=lambda p: (p['cand'], p['t']))))
for k, r in R.items():
    print(f"DEV run {k}: {r['label']} {r['date']}, judged {r['n']['judged']}/{r['n']['planned']}, stopped early: {r['stopped_early']}, "
          f"unavailable {r['judge_unavailable']['k']}/{r['judge_unavailable']['n']} {r['unavailable_reasons']}, p50/p95 {r['latency_ms']['p50']}/{r['latency_ms']['p95']} ms, "
          f"INR {r['cost_inr']['spent']:.2f} ({r['cost_inr']['per_1k_turns']:.2f} per 1k)")
for c in 'AB':
    print(f"\nPooled DEV sweep, candidate {c} ({'judge.json as committed' if c == 'A' else 'prompts/caller_crisis.risk100.txt'}): judge alone decides; floor or judge for information")
    print('| Threshold | Recall: judge R(t) | FP: judge F(t) | Admissible (F <= 10%) | Recall: floor or judge | FP: floor or judge |')
    print('|---|---|---|---|---|---|')
    for p in P[c]:
        mark = ' **(chosen)**' if p['cand'] == chosen['cand'] and p['t'] == chosen['t'] else ''
        print(f"| {p['t']}{mark} | {f(p['rec'])} | {f(p['fp'])} | {'yes' if fr(p['fp']) <= Fr(1, 10) else 'no'} | {f(p['rec_foj'])} | {f(p['fp_foj'])} |")
