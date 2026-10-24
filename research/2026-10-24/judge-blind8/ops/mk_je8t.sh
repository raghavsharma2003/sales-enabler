#!/bin/bash
# BLIND 8, part 1 of 2 (sent as one Run Command with judge8.tmpl.sh): /tmp/je8t = /tmp/je8 with judge.json's crisis
# threshold set to the value PREREG.md chose on DEV (__THRESH__). No other field changes; checked by diffing the parsed
# JSON. The other files the harness imports are checked by sha256 against PREREG.md.
set -e
S=/opt/vp-stage
rm -rf /tmp/je8t && mkdir -p /tmp/je8t && cp -r /tmp/je8/product /tmp/je8/package.json /tmp/je8t/ && ln -s $S/app/node_modules /tmp/je8t/node_modules
$S/venv/bin/python - <<'PY'
import json
p = '/tmp/je8t/product/shared/safety/judge.json'
a = json.load(open('/tmp/je8/product/shared/safety/judge.json')); d = json.load(open(p))
d['judges']['caller_crisis']['threshold'] = __THRESH__
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
b = json.load(open(p)); a['judges']['caller_crisis'].pop('threshold'); t = b['judges']['caller_crisis'].pop('threshold')
print('je8t threshold', t, '| every other field identical to the contract:', a == b)
PY
cd /tmp/je8t && sha256sum product/shared/safety/sets/heldout-8.json product/scripts/judge-eval.mjs product/shared/safety/cases.json product/shared/safety/judge.ts | cut -c1-16,65-
chmod -R go-w /tmp/je8t
