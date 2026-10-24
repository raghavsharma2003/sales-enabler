# Exploratory, DEV only, after CHOICE.md: line-by-line A vs C split on the four DEV runs' results.json (fetched from blob
# runlogs/vm11-<label>-results.json into a scratch folder). Not part of the rule. Usage: python -I compare_ac.py DIR
import json, sys
from collections import Counter
def load(p): return {r['id'] + '|' + r['task']: r for r in json.load(open(p))}
for task, a, c, tC in (('crisis', 'flashlite-dev-A-crisis', 'flashlite-dev-C-crisis', 0.75), ('opt_out', 'flashlite-optoutdev-A', 'flashlite-optoutdev-C', 0.6)):
    A, C = load(f'{sys.argv[1]}/{a}.json'), load(f'{sys.argv[1]}/{c}.json')
    assert set(A) == set(C)
    says = lambda r, t: (r['failed'] is None) and r['confidence'] is not None and r['confidence'] >= t and ((r['optOut'] is True) if task == 'opt_out' else (r['kind'] not in (None, 'none')))
    ta = 0.5 if task == 'crisis' else 0.6
    for truth in (True, False):
        ids = [k for k in A if A[k]['truth'] == truth]
        ans_a = [k for k in ids if A[k]['failed'] is None]; ans_c = [k for k in ids if C[k]['failed'] is None]
        both = [k for k in ids if A[k]['failed'] is None and C[k]['failed'] is None]
        fa = [k for k in ids if says(A[k], ta)]; fc = [k for k in ids if says(C[k], tC)]
        print(f"{task} truth={truth} n={len(ids)}: A answered {len(ans_a)}, flagged {len(fa)}; C answered {len(ans_c)}, flagged {len(fc)}; "
              f"both answered {len(both)}: A flags {sum(says(A[k], ta) for k in both)}, C flags {sum(says(C[k], tC) for k in both)}; "
              f"timed out under both {sum(A[k]['failed'] is not None and C[k]['failed'] is not None for k in ids)}")
        if task == 'crisis' and truth:
            # C answered but did not flag: what did it say?
            miss = [k for k in ans_c if not says(C[k], tC)]
            print('   C answered-not-flagged:', len(miss), 'kinds', Counter(C[k]['kind'] for k in miss), 'confidences', Counter(C[k]['confidence'] for k in miss))
            print('   C confidences on answered crisis lines:', sorted(Counter(C[k]['confidence'] for k in ans_c).items()))
            print('   A confidences on answered crisis lines:', sorted(Counter(A[k]['confidence'] for k in ans_a).items()))
            print('   by source, C answered-not-flagged:', Counter(C[k]['source'] for k in miss), '| C timeouts:', Counter(C[k]['source'] for k in ids if C[k]['failed']))
            print('   by lang, C answered-not-flagged:', Counter(C[k]['lang'] for k in miss))
        if task == 'opt_out' and not truth:
            only_c = [k for k in both if says(C[k], tC) and not says(A[k], ta)]
            print('   C-only false alarms (both answered):', len(only_c), Counter(C[k]['lang'] for k in only_c))
