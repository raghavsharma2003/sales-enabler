#!/bin/bash
# One judge-eval run for PREREG-9 (adapted from ../../judge-blind8/ops/judge8.tmpl.sh; only the labels, the blob names
# and the optional prompt file differ): Gemini 3.5 Flash-Lite on the Vertex global OpenAI-compatible endpoint, from the
# India VM, --rps 1 --concurrency 1, from a VM-only tree (/tmp/je9 = contract judge.json at the recorded commit;
# /tmp/je9t = the (prompt, threshold) PREREG-9 chose on DEV, BLIND 9 only). The Vertex token is minted here from the
# service account file; nothing secret is printed. Waits while the lab used Vertex in the last 180 s and while staging
# has active calls. Uploads report.json, summary.md and results.json to blob (results.json holds the lines: it is
# never downloaded for a blind set).
set -e
S=/opt/vp-stage; LABEL=__LABEL__; TREE=__TREE__; WHAT="__WHAT__"; MAXREQ=__MAXREQ__; MAXCOST=__MAXCOST__
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
PIN=28.5; POUT=237.5        # prices.ts gemini-3.5-flash-lite $0.30 / $2.50 per 1M x 95
echo "== start $LABEL $(date -u)"; echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://$FQDN/api/ping || true
export PATH=$S/node/bin:$PATH
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
unset VP_LLM_SAFETY_JUDGE_KEY_HEADER
export VP_LLM_SAFETY_JUDGE_URL="https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions" VP_LLM_SAFETY_JUDGE_KEY="$TOK" VP_LLM_SAFETY_JUDGE_MODEL="google/gemini-3.5-flash-lite"
unset TOK
OUTD=/tmp/judge-eval/$LABEL; rm -rf $OUTD
cd $TREE
echo "tree $TREE ($(cat BUNDLE_SHA)): $($S/venv/bin/python -c "import json, hashlib; j=json.load(open('product/shared/safety/judge.json'))['judges']['caller_crisis']; print('threshold', j['threshold'], 'timeout_ms', j['timeout_ms'], 'system_prompt sha256_16', hashlib.sha256(j['system_prompt'].encode()).hexdigest()[:16])")"
echo "args: $WHAT"
set +e
timeout 1500 node product/scripts/judge-eval.mjs $WHAT --rps 1 --concurrency 1 --price-in $PIN --price-out $POUT --max-cost-inr $MAXCOST \
  --max-requests $MAXREQ --label $LABEL --out-dir $OUTD 2>&1 | grep -vE '^\| (lang|source)' | tail -40 | cut -c1-260
set -e
for f in report.json summary.md results.json; do
  [ -f $OUTD/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTD/$f "$B/runlogs/vps6-j9-$LABEL-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
echo "== end $LABEL $(date -u)"; echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
