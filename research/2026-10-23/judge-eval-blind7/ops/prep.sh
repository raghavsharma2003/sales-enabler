#!/bin/bash
# BLIND 7 judge eval, step 1 (no model traffic): lab + staging health, VM headroom, then a VM-only copy of the staging
# product tree (/opt/vp-stage/app is at 46dbbe7, older than blind set 7) with four files from the branch head laid over
# it: product/scripts/judge-eval.mjs (--set), shared/safety/rules.json (the floor scored 37/100 on blind 7),
# shared/safety/cases.json and shared/safety/sets/heldout-7.json. The running staging services are not touched.
# Ends with a dry run on a scripted fake model (no network) that must reproduce the floor's recorded numbers.
# Prints no secret values. SAS and the staging passcode arrive as Run Command protected parameters.
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql || true
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
echo "lab ping local: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth /v1/health %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'])"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
echo "lab vertex last use: $(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys,time; print(int(time.time()-json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']),'s ago')" 2>/dev/null)"

echo "== staging copy (unchanged files the harness imports)"
cd $S/app && sha256sum product/shared/safety/index.ts product/shared/safety/judge.ts product/shared/safety/judge.json product/server/llm.ts
ls product/shared/safety/sets 2>/dev/null || echo "no sets/ in the staging copy"
grep -c -- "--set" product/scripts/judge-eval.mjs || true

set -e
echo "== build /tmp/je7 (contract judge.json) and /tmp/je7v (timeout_ms 3000, Vertex supplementary)"
curl -fsS -o /tmp/vps-judge7-overlay.tgz -H "x-ms-version: 2022-11-02" "$B/vps-judge7-overlay.tgz?$SAS"
for D in /tmp/je7 /tmp/je7v; do
  rm -rf $D && mkdir -p $D && cp -r $S/app/product $S/app/package.json $D/ && ln -s $S/app/node_modules $D/node_modules
  tar xzf /tmp/vps-judge7-overlay.tgz -C $D
done
$S/venv/bin/python -c "import json; p='/tmp/je7v/product/shared/safety/judge.json'; d=json.load(open(p)); d['judges']['caller_crisis']['timeout_ms']=3000; json.dump(d, open(p,'w'), ensure_ascii=False, indent=1)"
cd /tmp/je7 && sha256sum product/scripts/judge-eval.mjs product/shared/safety/rules.json product/shared/safety/cases.json product/shared/safety/sets/heldout-7.json product/shared/safety/judge.json
$S/venv/bin/python -c "import json; print('je7 timeout', json.load(open('/tmp/je7/product/shared/safety/judge.json'))['judges']['caller_crisis']['timeout_ms'], 'je7v timeout', json.load(open('/tmp/je7v/product/shared/safety/judge.json'))['judges']['caller_crisis']['timeout_ms'])"
chmod -R go-w /tmp/je7 /tmp/je7v

echo "== dry run: scripted fake model, no network"
export PATH=$S/node/bin:$PATH
cat > /tmp/je7-fake.mjs <<'EOF'
export default () => ({ text: '{"crisis": false, "confidence": 0.1, "kind": "none"}', toolCalls: [], usage: { inputTokens: 440, outputTokens: 18 }, model: 'fake', provider: 'fake' });
EOF
cd /tmp/je7 && VP_JUDGE_EVAL_FAKE=/tmp/je7-fake.mjs VP_LLM_SAFETY_JUDGE_URL=http://127.0.0.1:9 VP_LLM_SAFETY_JUDGE_KEY=x VP_LLM_SAFETY_JUDGE_MODEL=fake \
  timeout 300 node product/scripts/judge-eval.mjs --source heldout-6 --set product/shared/safety/sets/heldout-7.json --rps 0 --concurrency 4 \
  --label dry --out-dir /tmp/judge-eval/j7-dry 2>&1 | grep -E "^Sources|^\| (overall|source)" | cut -c1-220
rm -rf /tmp/judge-eval/j7-dry /tmp/je7-fake.mjs
echo "== done $(date -u)"
