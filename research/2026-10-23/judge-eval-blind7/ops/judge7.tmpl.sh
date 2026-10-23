#!/bin/bash
# BLIND 7 judge eval for one model (adapted from ../../staging/ops/judge.tmpl.sh): heldout-6 (120 caller lines) plus
# blind set 7's 200 caller lines = 320 lines, at most 1 req/s (RPS), concurrency 1, from the VM-only tree that prep.sh built
# (/tmp/je7 = judge.json contract, 800 ms; /tmp/je7v = timeout_ms 3000). Keys come from /opt/vp-stage/.env (Azure) or a
# Vertex token minted here from the service account; nothing secret is printed. Uploads report/summary/results to blob.
set -e
S=/opt/vp-stage; LABEL=__LABEL__; ROUTE=__ROUTE__; DEP=__DEP__; PIN=__PIN__; POUT=__POUT__; TREE=__TREE__; RPS=__RPS__
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== start $(date -u)"; echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://$FQDN/api/ping || true
set -a; . $S/.env; set +a
export PATH=$S/node/bin:$PATH
unset VP_LLM_SAFETY_JUDGE_KEY_HEADER
if [ "$ROUTE" = azure ]; then
  H=$(echo "$LAB_AI_ENDPOINT" | sed -e 's#^https://##' -e 's#/*$##' -e 's#\.cognitiveservices\.azure\.com#.openai.azure.com#')
  export VP_LLM_SAFETY_JUDGE_URL="https://$H/openai/v1/chat/completions" VP_LLM_SAFETY_JUDGE_KEY="$LAB_AI_KEY" VP_LLM_SAFETY_JUDGE_KEY_HEADER=api-key VP_LLM_SAFETY_JUDGE_MODEL="$DEP"
else
  for i in $(seq 1 20); do
    last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
    age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
  done
  [ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
  [ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
  PROJ=$($S/venv/bin/python -c "import json; print(json.load(open('$S/vertex-sa.json'))['project_id'])")
  TOK=$(cd $S/app/product/voice && $S/venv/bin/python -c "
import asyncio, json, aiohttp
from vpvoice.providers.google import VertexToken
async def m():
    async with aiohttp.ClientSession() as h: print(await VertexToken(json.load(open('$S/vertex-sa.json'))).get(h))
asyncio.run(m())")
  export VP_LLM_SAFETY_JUDGE_URL="https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions" VP_LLM_SAFETY_JUDGE_KEY="$TOK" VP_LLM_SAFETY_JUDGE_MODEL="$DEP"
fi
OUTD=/tmp/judge-eval/$LABEL; rm -rf $OUTD
cd $TREE
echo "tree $TREE timeout_ms $($S/venv/bin/python -c "import json; print(json.load(open('product/shared/safety/judge.json'))['judges']['caller_crisis']['timeout_ms'])")"
set +e
timeout 1500 node product/scripts/judge-eval.mjs --source heldout-6 --set product/shared/safety/sets/heldout-7.json --rps $RPS --concurrency 1 \
  --price-in $PIN --price-out $POUT --max-cost-inr 120 --max-requests 400 --label $LABEL --out-dir $OUTD 2>&1 | grep -vE '^\| lang' | tail -14 | cut -c1-260
set -e
for f in report.json summary.md results.json; do
  [ -f $OUTD/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTD/$f "$B/runlogs/vps-j7-$LABEL-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
echo "== end $(date -u)"; echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
