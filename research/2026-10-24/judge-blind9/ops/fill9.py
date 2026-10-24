# Fills judge9.tmpl.sh once per run and concatenates the runs into one Run Command script (runs execute in order; a
# failed pre-check in one stops the rest). No model calls, no secrets.
# Usage: python fill9.py OUT.sh 'LABEL|TREE|MAXREQ|MAXCOST|judge-eval args' ['...' ...]
import os, sys
T = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'judge9.tmpl.sh')).read()
parts = []
for spec in sys.argv[2:]:
    label, tree, maxreq, maxcost, what = spec.split('|')
    assert '__' not in what and "'" not in what and '"' not in what, what
    parts.append(T.replace('__LABEL__', label).replace('__TREE__', tree).replace('__WHAT__', what)
                 .replace('__MAXREQ__', maxreq).replace('__MAXCOST__', maxcost))
out = '\n'.join(parts)
assert '__LABEL__' not in out and '__WHAT__' not in out
open(sys.argv[1], 'w').write(out)
print('wrote', sys.argv[1], 'runs:', [s.split('|')[0] for s in sys.argv[2:]])
