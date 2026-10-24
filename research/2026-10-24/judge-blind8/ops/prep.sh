#!/bin/bash
# BLIND 8 judge eval, step 1 (no model traffic). Checks lab and staging health, then builds a VM-only copy of the
# staging tree (/opt/vp-stage/app, now at e9fdde3, which already holds judge-eval.mjs with the sweep, dev-7, optout-dev
# and sets/heldout-8.json) in /tmp/je8, for the contract judge.json. Then it checks the files PREREG.md names by
# sha256 and does dry runs with a scripted fake model (no network) on the DEV sets only.
# BLIND 8 is not touched here: no dry run on it, so the one scored run is the first time any tool reads it.
# The running staging services are not touched. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql || true
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
echo "lab ping local: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth /v1/health %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'])"
echo "runtime judge env vars: $(cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | tr '\0' '\n' | grep -c '^VP_LLM_SAFETY_JUDGE_')"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
set -e
echo "== build /tmp/je8 (contract judge.json) from the staging tree $(cat $S/app/BUNDLE_SHA)"
rm -rf /tmp/je8 && mkdir -p /tmp/je8 && cp -r $S/app/product $S/app/package.json /tmp/je8/ && ln -s $S/app/node_modules /tmp/je8/node_modules
cd /tmp/je8 && sha256sum product/shared/safety/sets/heldout-8.json product/shared/safety/judge.json product/scripts/judge-eval.mjs product/shared/safety/cases.json | cut -c1-16,65-
$S/venv/bin/python -c "import json; j=json.load(open('/tmp/je8/product/shared/safety/judge.json'))['judges']['caller_crisis']; print('je8 threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'])"
chmod -R go-w /tmp/je8
echo "== dry runs: scripted fake model, no network, DEV sets only"
export PATH=$S/node/bin:$PATH
cat > /tmp/je8-fake.mjs <<'EOF'
export default () => ({ text: '{"crisis": false, "confidence": 0.1, "kind": "none", "opt_out": false, "opt_out_confidence": 0.1}', toolCalls: [], usage: { inputTokens: 600, outputTokens: 30 }, model: 'fake', provider: 'fake' });
EOF
for T in "crisis --source dev-7" "opt_out --source optout-dev"; do
  cd /tmp/je8 && VP_JUDGE_EVAL_FAKE=/tmp/je8-fake.mjs VP_LLM_SAFETY_JUDGE_URL=http://127.0.0.1:9 VP_LLM_SAFETY_JUDGE_KEY=x VP_LLM_SAFETY_JUDGE_MODEL=fake \
    timeout 300 node product/scripts/judge-eval.mjs --task $T --rps 0 --concurrency 4 --label dry --out-dir /tmp/judge-eval/j8-dry 2>&1 | grep -E "^Sources|^\| overall" | cut -c1-240
done
rm -rf /tmp/judge-eval/j8-dry /tmp/je8-fake.mjs
echo "== done $(date -u)"
