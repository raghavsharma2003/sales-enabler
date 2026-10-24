# Fills judge12.tmpl.sh once per run (adapted from ../../judge-blind10/ops/fill11.py; adds MODE). No model calls, no
# secrets. Usage: python fill12.py OUT.sh 'LABEL|TREE|MAXREQ|MAXCOST|WALL|PSHA|MODE|judge-eval args'
# The job's caps: BLIND 11 INR 10 / 230 requests, BLIND-BR2 INR 15 / 170 requests (sum 25, under the job's INR 80).
import os, re, sys
T = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'judge12.tmpl.sh')).read()
label, tree, maxreq, maxcost, wall, psha, mode, what = sys.argv[2].split('|')
assert tree == '/tmp/je12', tree
assert mode in ('judge', 'review'), mode
assert re.fullmatch(r'[0-9a-f]{16}', psha), psha
assert '__' not in what and "'" not in what and '"' not in what, what
assert float(maxcost) <= 15, 'per-run cap is INR 15'
assert '--rps' not in what and '--concurrency' not in what and '--prompt-file' not in what, 'rps/concurrency are fixed by the template (1, 1); no prompt variants'
out = (T.replace('__LABEL__', label).replace('__TREE__', tree).replace('__WHAT__', what).replace('__MAXREQ__', maxreq)
        .replace('__MAXCOST__', maxcost).replace('__WALL__', wall).replace('__PSHA__', psha).replace('__MODE__', mode))
assert not re.search(r'__(LABEL|TREE|WHAT|MAXREQ|MAXCOST|WALL|PSHA|MODE)__', out)
open(sys.argv[1], 'w').write(out)
print('wrote', sys.argv[1], 'run:', label, 'mode', mode)
