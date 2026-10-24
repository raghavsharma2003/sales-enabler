#!/bin/bash
# BLIND 10, part 1 of 2 (sent as one Run Command with one judge11.tmpl.sh run). Adapted from ../../judge-blind9/ops/mk_je9t.sh.
# /tmp/je11t = /tmp/je11 with judge.json's caller_crisis set to what PREREG-10 adopted on DEV (../../judge-prereg10/CHOICE.md):
# threshold __THRESH__, and for candidate C the system prompt replaced by prompts/caller_crisis.c.txt trimmed (exactly what
# judge-eval's --prompt-file does on DEV; --prompt-file itself refuses a heldout set). For candidate A the prompt stays and
# the threshold is judge.json's 0.5. No other field changes (opt_out_threshold stays 0.6); checked by diffing the parsed
# JSON. The PREREG-10 files are checked by sha256 again. BLIND 10 is hashed here, not read.
set -e
S=/opt/vp-stage; CAND=__CAND__
rm -rf /tmp/je11t && mkdir -p /tmp/je11t && cp -r /tmp/je11/product /tmp/je11/package.json /tmp/je11/BUNDLE_SHA /tmp/je11t/ && ln -s $S/app/node_modules /tmp/je11t/node_modules
CAND=$CAND $S/venv/bin/python - <<'PY'
import json, hashlib, os
cand = os.environ['CAND']; assert cand in ('A', 'C'), cand
p = '/tmp/je11t/product/shared/safety/judge.json'
a = json.load(open('/tmp/je11/product/shared/safety/judge.json')); d = json.load(open(p))
assert hashlib.sha256(open('/tmp/je11/product/shared/safety/judge.json', 'rb').read()).hexdigest()[:16] == '1d467ad8ee1ad73e', 'contract judge.json hash'
d['judges']['caller_crisis']['threshold'] = __THRESH__
if cand == 'C':
    d['judges']['caller_crisis']['system_prompt'] = open('/tmp/je11/product/shared/safety/prompts/caller_crisis.c.txt', encoding='utf-8').read().strip()
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
b = json.load(open(p)); ca, cb = a['judges']['caller_crisis'], b['judges']['caller_crisis']
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()[:16]
print('je11t candidate', cand, '| threshold', cb['threshold'], '| opt_out_threshold', cb['opt_out_threshold'], '| system_prompt sha256_16', sha(cb['system_prompt']),
      '(A', sha(ca['system_prompt']) + ', C c97392ae76abeec2)')
want = sha(ca['system_prompt']) if cand == 'A' else 'c97392ae76abeec2'
assert sha(cb['system_prompt']) == want, 'system prompt is not the adopted candidate'
assert cb['threshold'] == (0.5 if cand == 'A' else __THRESH__)
for k in ('threshold', 'system_prompt'): ca.pop(k); cb.pop(k)
print('every other field identical to the contract:', a == b)
assert a == b
PY
cd /tmp/je11t && sha256sum product/shared/safety/sets/heldout-10.json product/scripts/judge-eval.mjs product/shared/safety/rules.json product/shared/safety/cases.json product/shared/safety/judge.ts product/shared/safety/prompts/caller_crisis.c.txt | cut -c1-16,65-
chmod -R go-w /tmp/je11t
