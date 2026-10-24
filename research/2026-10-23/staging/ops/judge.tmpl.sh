#!/bin/bash
# Caller-crisis judge eval (product/scripts/judge-eval.mjs) for one model, on the India VM, 1 req/s, concurrency 1.
# Keys come from /opt/vp-stage/.env (Azure) or a Vertex token minted here from the service account; nothing is printed.
set -e
S=/opt/vp-stage; LABEL=__LABEL__; ROUTE=__ROUTE__; DEP=__DEP__; PIN=__PIN__; POUT=__POUT__; TMO=__TMO__
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
cd $S/app
set -a; . $S/.env; set +a
export PATH=$S/node/bin:$PATH
unset VP_LLM_SAFETY_JUDGE_KEY_HEADER
if [ "$ROUTE" = azure ]; then
  H=$(echo "$LAB_AI_ENDPOINT" | sed -e 's#^https://##' -e 's#/*$##' -e 's#\.cognitiveservices\.azure\.com#.openai.azure.com#')
  export VP_LLM_SAFETY_JUDGE_URL="https://$H/openai/v1/chat/completions" VP_LLM_SAFETY_JUDGE_KEY="$LAB_AI_KEY" VP_LLM_SAFETY_JUDGE_KEY_HEADER=api-key VP_LLM_SAFETY_JUDGE_MODEL="$DEP"
else
  now=$(date -u +%s); gate=$(date -u -d '2026-10-23 20:00:00' +%s)
  [ "$now" -ge "$gate" ] || { echo "before 20:00 UTC: no Vertex traffic; refusing"; exit 3; }
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
if [ "$TMO" != "contract" ]; then     # supplementary: a VM-only copy of product/ with judge.json timeout_ms raised; the repo contract is unchanged
  rm -rf /tmp/je && mkdir -p /tmp/je && cp -r $S/app/product $S/app/package.json /tmp/je/ && ln -s $S/app/node_modules /tmp/je/node_modules
  $S/venv/bin/python -c "import json; p='/tmp/je/product/shared/safety/judge.json'; d=json.load(open(p)); d['judges']['caller_crisis']['timeout_ms']=$TMO; json.dump(d, open(p,'w'), ensure_ascii=False, indent=1)"
  cd /tmp/je
fi
timeout 1500 node product/scripts/judge-eval.mjs --source heldout-6 --rps 1 --concurrency 1 --price-in $PIN --price-out $POUT \
  --max-cost-inr 50 --max-requests 400 --label $LABEL --out-dir $OUTD 2>&1 | tail -22 | cut -c1-300
for f in report.json summary.md; do
  [ -f $OUTD/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTD/$f "$B/runlogs/vps-judge-$LABEL-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
