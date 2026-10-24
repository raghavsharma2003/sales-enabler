# Opt-out DEV, prompt A against prompt B, line by line on the same 260 optout-dev lines (DEV; results.json from blob:
# runlogs/vps4-j8-flashlite-optoutdev-results.json for A, runlogs/vm10-flashlite-optoutdev-B-results.json for B).
# Splits each prompt's misses and false alarms into timeouts and answered verdicts, and compares on the lines both
# answered. Exploratory: the bounds in ../RULE.md are judged on the harness's own counts (a timeout is "not flagged").
# Usage: python compare_ab.py A-results.json B-results.json
import collections, json, sys
A = {x['id']: x for x in json.load(open(sys.argv[1]))}; B = {x['id']: x for x in json.load(open(sys.argv[2]))}
assert set(A) == set(B) and len(A) == 260
pos = [i for i in A if A[i]['truth']]; neg = [i for i in A if not A[i]['truth']]
for nm, D in (('A', A), ('B', B)):
    print(nm, 'timeouts: opt-out lines', sum(bool(D[i]['failed']) for i in pos), 'look-alikes', sum(bool(D[i]['failed']) for i in neg),
          '| recall', sum(D[i]['judge'] is True for i in pos), '/ 150, of answered', sum(D[i]['judge'] is True for i in pos), '/', sum(not D[i]['failed'] for i in pos),
          '| FP', sum(D[i]['judge'] is True for i in neg), '/ 110, of answered', sum(D[i]['judge'] is True for i in neg), '/', sum(not D[i]['failed'] for i in neg))
both = [i for i in A if not A[i]['failed'] and not B[i]['failed']]
p2 = [i for i in both if A[i]['truth']]; n2 = [i for i in both if not A[i]['truth']]
print('lines both answered: opt-out', len(p2), 'A', sum(A[i]['judge'] is True for i in p2), 'B', sum(B[i]['judge'] is True for i in p2),
      '| look-alikes', len(n2), 'A FP', sum(A[i]['judge'] is True for i in n2), 'B FP', sum(B[i]['judge'] is True for i in n2))
fa = {i for i in neg if A[i]['judge'] is True}; fb = {i for i in neg if B[i]['judge'] is True}
print('false alarms: both', len(fa & fb), '| A only', len(fa - fb), f'(B timed out on {sum(bool(B[i]["failed"]) for i in fa - fb)})',
      '| B only', len(fb - fa), f'(A timed out on {sum(bool(A[i]["failed"]) for i in fb - fa)})')
print('B-only false alarms by language:', dict(collections.Counter(B[i]['lang'] for i in fb - fa)))
print('lines that timed out under both prompts:', len({i for i in A if A[i]['failed']} & {i for i in B if B[i]['failed']}))
print('B false alarms (ids):', sorted(fb))
