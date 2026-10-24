#!/bin/bash
# BLIND 9, part 1 of 2 (sent as one Run Command with judge9.tmpl.sh). Adapted from ../../judge-blind8/ops/mk_je8t.sh.
# /tmp/je9t = /tmp/je9 with judge.json's caller_crisis set to the (candidate, threshold) PREREG-9 chose on DEV
# (CHOICE.md): threshold __THRESH__, and for candidate B the system prompt replaced by prompts/caller_crisis.risk100.txt
# trimmed (exactly what judge-eval's --prompt-file does on DEV; --prompt-file itself refuses a heldout set). PREREG-9:
# "If B is chosen, B's text becomes judge.json system_prompt". No other field changes; checked by diffing the parsed
# JSON. The files PREREG-9 names are checked by sha256 again. BLIND 9 is hashed here, not read.
set -e
S=/opt/vp-stage; CAND=__CAND__
rm -rf /tmp/je9t && mkdir -p /tmp/je9t && cp -r /tmp/je9/product /tmp/je9/package.json /tmp/je9/BUNDLE_SHA /tmp/je9t/ && ln -s $S/app/node_modules /tmp/je9t/node_modules
CAND=$CAND $S/venv/bin/python - <<'PY'
import json, hashlib, os
cand = os.environ['CAND']; assert cand in ('A', 'B'), cand
p = '/tmp/je9t/product/shared/safety/judge.json'
a = json.load(open('/tmp/je9/product/shared/safety/judge.json')); d = json.load(open(p))
d['judges']['caller_crisis']['threshold'] = __THRESH__
if cand == 'B':
    d['judges']['caller_crisis']['system_prompt'] = open('/tmp/je9/product/shared/safety/prompts/caller_crisis.risk100.txt', encoding='utf-8').read().strip()
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
b = json.load(open(p)); ca, cb = a['judges']['caller_crisis'], b['judges']['caller_crisis']
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()[:16]
print('je9t candidate', cand, '| threshold', cb['threshold'], '| system_prompt sha256_16', sha(cb['system_prompt']),
      '(A', sha(ca['system_prompt']) + ', B ed63058d5526890a)')
want = sha(ca['system_prompt']) if cand == 'A' else 'ed63058d5526890a'
assert sha(cb['system_prompt']) == want, 'system prompt is not the chosen candidate'
for k in ('threshold', 'system_prompt'): ca.pop(k); cb.pop(k)
print('every other field identical to the contract:', a == b)
assert a == b
PY
cd /tmp/je9t && sha256sum product/shared/safety/sets/heldout-9.json product/scripts/judge-eval.mjs product/shared/safety/cases.json product/shared/safety/rules.json product/shared/safety/judge.ts | cut -c1-16,65-
chmod -R go-w /tmp/je9t
