# Fills judge10.tmpl.sh once per run (adapted from ../../judge-blind9/ops/fill9.py; adds MODE and WALL). Several runs
# concatenate into one Run Command script, in order; a failed pre-check in one stops the rest. No model calls, no secrets.
# Usage: python fill10.py OUT.sh 'LABEL|TREE|MAXREQ|MAXCOST|MODE|WALL|judge-eval args' ['...' ...]
import os, sys
T = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'judge10.tmpl.sh')).read()
parts = []
for spec in sys.argv[2:]:
    label, tree, maxreq, maxcost, mode, wall, what = spec.split('|')
    assert mode in ('judge', 'review'), mode
    assert '__' not in what and "'" not in what and '"' not in what, what
    assert float(maxcost) <= 15, 'per-run cap is INR 15'
    parts.append(T.replace('__LABEL__', label).replace('__TREE__', tree).replace('__WHAT__', what).replace('__MAXREQ__', maxreq)
                 .replace('__MAXCOST__', maxcost).replace('__MODE__', mode).replace('__WALL__', wall))
out = '\n'.join(parts)
assert '__LABEL__' not in out and '__WHAT__' not in out and '__MODE__' not in out and '__WALL__' not in out
open(sys.argv[1], 'w').write(out)
print('wrote', sys.argv[1], 'runs:', [s.split('|')[0] for s in sys.argv[2:]])
