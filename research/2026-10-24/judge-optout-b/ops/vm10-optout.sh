#!/bin/bash
# One judge-eval run for the vm10 job (adapted from ../../judge-blind9/ops/judge9.tmpl.sh). What differs:
# - labels and blob names (vm10-);
# - MODE picks the env the run sets: judge -> VP_LLM_SAFETY_JUDGE_* (crisis / opt-out judge), review ->
#   VP_LLM_BRIEF_REVIEW_* (agents/review.ts), each with no _KEY_HEADER (authorization: Bearer); VP_LLM_DEFAULT_* is
#   unset so nothing falls back to another model;
# - WALL is the overall timeout in seconds (the brief review's per-call window is 20 s, not 1.5 s);
# - the service-account file falls back to /opt/voicelab/vertex-sa.json if staging's copy is absent;
# - the tree line prints the contract the task reads (judge.json or brief-review.json).
# Gemini 3.5 Flash-Lite on the Vertex global OpenAI-compatible endpoint, from the India VM, --rps 1 --concurrency 1,
# from the VM-only tree /tmp/je10. The Vertex token is minted here from the service account file; nothing secret is
# printed. Waits while the lab used Vertex in the last 180 s and while staging has active calls. Uploads report.json,
# summary.md and results.json to blob.
set -e
S=/opt/vp-stage; LABEL=flashlite-optoutdev-B; TREE=/tmp/je10; WHAT="--task opt_out --source optout-dev --prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt"; MAXREQ=270; MAXCOST=15; MODE=judge; WALL=1500
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
SA=$S/vertex-sa.json; [ -f $SA ] || SA=/opt/voicelab/vertex-sa.json
PROJ=$($S/venv/bin/python -c "import json; print(json.load(open('$SA'))['project_id'])")
TOK=$(cd $S/app/product/voice && $S/venv/bin/python -c "
import asyncio, json, aiohttp
from vpvoice.providers.google import VertexToken
async def m():
    async with aiohttp.ClientSession() as h: print(await VertexToken(json.load(open('$SA'))).get(h))
asyncio.run(m())")
URL="https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions"
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER
if [ "$MODE" = review ]; then
  unset VP_LLM_BRIEF_REVIEW_KEY_HEADER
  export VP_LLM_BRIEF_REVIEW_URL="$URL" VP_LLM_BRIEF_REVIEW_KEY="$TOK" VP_LLM_BRIEF_REVIEW_MODEL="google/gemini-3.5-flash-lite"
else
  unset VP_LLM_SAFETY_JUDGE_KEY_HEADER
  export VP_LLM_SAFETY_JUDGE_URL="$URL" VP_LLM_SAFETY_JUDGE_KEY="$TOK" VP_LLM_SAFETY_JUDGE_MODEL="google/gemini-3.5-flash-lite"
fi
unset TOK URL
OUTD=/tmp/judge-eval/$LABEL; rm -rf $OUTD
cd $TREE
echo "tree $TREE ($(cat BUNDLE_SHA)), mode $MODE: $(MODE=$MODE $S/venv/bin/python -c "
import json, hashlib, os
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()[:16]
if os.environ['MODE'] == 'review':
    j = json.load(open('product/shared/safety/brief-review.json'))
    print('brief-review threshold', j['threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'], 'system_prompt sha256_16', sha(j['system_prompt']))
else:
    j = json.load(open('product/shared/safety/judge.json'))['judges']['caller_crisis']
    print('judge threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'system_prompt sha256_16', sha(j['system_prompt']))")"
echo "env set (names only): $(env | cut -d= -f1 | grep -E '^VP_LLM_' | sort | tr '\n' ' ')"
echo "args: $WHAT"
set +e
timeout $WALL node product/scripts/judge-eval.mjs $WHAT --rps 1 --concurrency 1 --price-in $PIN --price-out $POUT --max-cost-inr $MAXCOST \
  --max-requests $MAXREQ --label $LABEL --out-dir $OUTD 2>&1 | grep -vE '^\| (lang|source)' | tail -40 | cut -c1-260
echo "judge-eval exit ${PIPESTATUS[0]}"
set -e
for f in report.json summary.md results.json; do
  [ -f $OUTD/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTD/$f "$B/runlogs/vm10-$LABEL-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
echo "== end $LABEL $(date -u)"; echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
