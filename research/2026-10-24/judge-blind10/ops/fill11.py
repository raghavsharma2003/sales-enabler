# Fills judge11.tmpl.sh once per run (adapted from ../../judge-optout-b/ops/fill10.py; adds the expected system-prompt
# hash PSHA, drops MODE: judge only). No model calls, no secrets.
# Usage: python fill11.py OUT.sh 'LABEL|TREE|MAXREQ|MAXCOST|WALL|PSHA|judge-eval args'
# The job's caps: crisis DEV 15 each, opt-out DEV 10 each, BLIND 10 9 (sum 59, under PREREG-10's INR 70).
import os, re, sys
T = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'judge11.tmpl.sh')).read()
parts = []
for spec in sys.argv[2:]:
    label, tree, maxreq, maxcost, wall, psha, what = spec.split('|')
    assert tree in ('/tmp/je11', '/tmp/je11t'), tree
    assert re.fullmatch(r'[0-9a-f]{16}', psha), psha
    assert '__' not in what and "'" not in what and '"' not in what, what
    assert float(maxcost) <= 15, 'per-run cap is INR 15'
    assert '--rps' not in what and '--concurrency' not in what, 'rps/concurrency are fixed by the template (1, 1)'
    parts.append(T.replace('__LABEL__', label).replace('__TREE__', tree).replace('__WHAT__', what).replace('__MAXREQ__', maxreq)
                 .replace('__MAXCOST__', maxcost).replace('__WALL__', wall).replace('__PSHA__', psha))
out = '\n'.join(parts)
assert not re.search(r'__(LABEL|TREE|WHAT|MAXREQ|MAXCOST|WALL|PSHA)__', out)
open(sys.argv[1], 'w').write(out)
print('wrote', sys.argv[1], 'runs:', [s.split('|')[0] for s in sys.argv[2:]])
