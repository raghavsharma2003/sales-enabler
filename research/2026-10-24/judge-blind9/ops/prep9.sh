#!/bin/bash
# BLIND 9 judge eval, step 1, part 4 of 4 (no model traffic). Sent in ONE Run Command after the staging redeploy:
#   ../../staging/ops/deploy_pre.sh + ../../../2026-10-23/staging/ops/stage_setup.sh (verbatim) + ../../staging/ops/deploy_post.sh + this
# Adapted from ../../judge-blind8/ops/prep.sh. Builds a VM-only copy of the redeployed staging tree (/opt/vp-stage/app,
# now at the recorded commit) in /tmp/je9 with the contract judge.json, checks the seven files PREREG-9 names by
# sha256 (first 16 hex), and does dry runs with a scripted fake model (no network) on the DEV sets only, for prompt A
# and for prompt B (--prompt-file). BLIND 9 is hashed, never run here: the one scored run is the first time a tool
# reads it. The running staging services are not touched after the redeploy. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== prep9 $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql || true
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
echo "lab ping local: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth /v1/health %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'])"
echo "runtime judge env vars: $(cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | tr '\0' '\n' | grep -c '^VP_LLM_SAFETY_JUDGE_')"
set -e
echo "== build /tmp/je9 (contract judge.json) from the staging tree $(cat $S/app/BUNDLE_SHA)"
rm -rf /tmp/je9 && mkdir -p /tmp/je9 && cp -r $S/app/product $S/app/package.json $S/app/BUNDLE_SHA /tmp/je9/ && ln -s $S/app/node_modules /tmp/je9/node_modules
cd /tmp/je9
echo "PREREG-9 hashes (expect 830080be372c231d 335647f6a0f0e6d2 1d467ad8ee1ad73e 14fcc3ac8fcb181a 89e5829327dcd594 714e3158a49d088e aa2b4e1fdbf82ecb):"
sha256sum product/shared/safety/sets/heldout-9.json product/shared/safety/sets/dev-lookalike-9.json product/shared/safety/judge.json \
  product/shared/safety/prompts/caller_crisis.risk100.txt product/shared/safety/rules.json product/shared/safety/cases.json product/scripts/judge-eval.mjs | cut -c1-16,65-
$S/venv/bin/python - <<'PY'
import hashlib
want = {'product/shared/safety/sets/heldout-9.json': '830080be372c231d', 'product/shared/safety/sets/dev-lookalike-9.json': '335647f6a0f0e6d2',
        'product/shared/safety/judge.json': '1d467ad8ee1ad73e', 'product/shared/safety/prompts/caller_crisis.risk100.txt': '14fcc3ac8fcb181a',
        'product/shared/safety/rules.json': '89e5829327dcd594', 'product/shared/safety/cases.json': '714e3158a49d088e',
        'product/scripts/judge-eval.mjs': 'aa2b4e1fdbf82ecb'}
bad = [p for p, h in want.items() if hashlib.sha256(open('/tmp/je9/' + p, 'rb').read()).hexdigest()[:16] != h]
print('PREREG-9 hash check:', 'all 7 match' if not bad else f'MISMATCH {bad}')
b = open('/tmp/je9/product/shared/safety/prompts/caller_crisis.risk100.txt', encoding='utf-8').read().strip()
print('prompt B trimmed sha256_16 (what --prompt-file records):', hashlib.sha256(b.encode()).hexdigest()[:16])
raise SystemExit(1 if bad else 0)
PY
$S/venv/bin/python -c "import json; j=json.load(open('/tmp/je9/product/shared/safety/judge.json'))['judges']['caller_crisis']; print('je9 threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'])"
chmod -R go-w /tmp/je9
echo "== dry runs: scripted fake model, no network, DEV sets only"
export PATH=$S/node/bin:$PATH
cat > /tmp/je9-fake-a.mjs <<'EOF'
export default () => ({ text: '{"crisis": false, "confidence": 0.1, "kind": "none", "opt_out": false, "opt_out_confidence": 0.1}', toolCalls: [], usage: { inputTokens: 600, outputTokens: 30 }, model: 'fake', provider: 'fake' });
EOF
cat > /tmp/je9-fake-b.mjs <<'EOF'
export default () => ({ text: '{"crisis": true, "risk": 72, "kind": "indirect", "opt_out": false, "opt_out_confidence": 0.1}', toolCalls: [], usage: { inputTokens: 700, outputTokens: 32 }, model: 'fake', provider: 'fake' });
EOF
dry() {  # $1 fake, $2 label, rest: judge-eval args
  F=$1; L=$2; shift 2
  cd /tmp/je9 && VP_JUDGE_EVAL_FAKE=$F VP_LLM_SAFETY_JUDGE_URL=http://127.0.0.1:9 VP_LLM_SAFETY_JUDGE_KEY=x VP_LLM_SAFETY_JUDGE_MODEL=fake \
    timeout 300 node product/scripts/judge-eval.mjs --task crisis "$@" --rps 0 --concurrency 4 --label $L --out-dir /tmp/judge-eval/j9-dry-$L 2>&1 | grep -E "^Sources|^\| overall|^\| 0\.(4|7|75) " | cut -c1-240
  $S/venv/bin/python -c "import json; r=json.load(open('/tmp/judge-eval/j9-dry-$L/report.json')); print('  $L prompt', r['prompt'], 'n', r['n'], 'unavailable', r['judge_unavailable']['k'])"
}
dry /tmp/je9-fake-a.mjs A-dev7 --source dev-7
dry /tmp/je9-fake-a.mjs A-dlk9 --set product/shared/safety/sets/dev-lookalike-9.json
dry /tmp/je9-fake-b.mjs B-dev7 --source dev-7 --prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt
dry /tmp/je9-fake-b.mjs B-dlk9 --set product/shared/safety/sets/dev-lookalike-9.json --prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt
rm -rf /tmp/judge-eval/j9-dry-* /tmp/je9-fake-a.mjs /tmp/je9-fake-b.mjs
echo "== prep9 done $(date -u)"
