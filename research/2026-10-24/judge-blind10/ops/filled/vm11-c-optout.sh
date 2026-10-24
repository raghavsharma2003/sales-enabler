#!/bin/bash
# One judge-eval run for the vm11 job (PREREG-10). Adapted from ../../judge-optout-b/ops/judge10.tmpl.sh. What differs:
# - labels and blob names (vm11-); judge mode only (VP_LLM_SAFETY_JUDGE_*, no _KEY_HEADER, VP_LLM_DEFAULT_* unset);
# - before the first request, the five PREREG-10 files are re-checked by sha256 on the VM tree this run reads, and
#   judge.json's caller_crisis system prompt must hash to c8b4789f49c8198e (a mismatch stops the run, no request is made);
# - the service account file is /opt/voicelab/vertex-sa.json (staging's copy only if that is absent).
# Gemini 3.5 Flash-Lite on the Vertex global OpenAI-compatible endpoint, from the India VM, --rps 1 --concurrency 1. The
# Vertex token is minted here from the service account file; nothing secret is printed. Waits while the lab used Vertex
# in the last 180 s and while staging has active calls. Uploads report.json, summary.md and results.json to blob.
set -e
S=/opt/vp-stage; LABEL=flashlite-optoutdev-C; TREE=/tmp/je11; WHAT="--task opt_out --source optout-dev --prompt-file product/shared/safety/prompts/caller_crisis.c.txt"; MAXREQ=270; MAXCOST=10; WALL=1500; PSHA=c8b4789f49c8198e
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
PIN=28.5; POUT=237.5        # prices.ts gemini-3.5-flash-lite $0.30 / $2.50 per 1M x 95
echo "== start $LABEL $(date -u)"; echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://$FQDN/api/ping || true
export PATH=$S/node/bin:$PATH
cd $TREE
TREE=$TREE PSHA=$PSHA $S/venv/bin/python - <<'PY'
import hashlib, json, os
t = os.environ['TREE']
want = {'product/shared/safety/prompts/caller_crisis.c.txt': '272fa8494de3cff0', 'product/shared/safety/sets/heldout-10.json': 'aae1d6019dabf339',
        'product/scripts/judge-eval.mjs': 'a790b0a86d705963', 'product/shared/safety/rules.json': '8108de0b7641ad0a'}
if t == '/tmp/je11': want['product/shared/safety/judge.json'] = '1d467ad8ee1ad73e'     # je11t's judge.json is checked by mk_je11t.sh
bad = [p for p, h in want.items() if hashlib.sha256(open(os.path.join(t, p), 'rb').read()).hexdigest()[:16] != h]
j = json.load(open(os.path.join(t, 'product/shared/safety/judge.json')))['judges']['caller_crisis']
psha = hashlib.sha256(j['system_prompt'].encode()).hexdigest()[:16]
print(f'integrity: {len(want)} files', 'all match' if not bad else f'MISMATCH {bad}', f'| judge.json system_prompt sha256_16 {psha} (expect {os.environ["PSHA"]})')
raise SystemExit(7 if bad or psha != os.environ['PSHA'] else 0)
PY
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
SA=/opt/voicelab/vertex-sa.json; [ -f $SA ] || SA=$S/vertex-sa.json
PROJ=$($S/venv/bin/python -c "import json; print(json.load(open('$SA'))['project_id'])")
TOK=$(cd $S/app/product/voice && $S/venv/bin/python -c "
import asyncio, json, aiohttp
from vpvoice.providers.google import VertexToken
async def m():
    async with aiohttp.ClientSession() as h: print(await VertexToken(json.load(open('$SA'))).get(h))
asyncio.run(m())")
URL="https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions"
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER VP_LLM_SAFETY_JUDGE_KEY_HEADER
export VP_LLM_SAFETY_JUDGE_URL="$URL" VP_LLM_SAFETY_JUDGE_KEY="$TOK" VP_LLM_SAFETY_JUDGE_MODEL="google/gemini-3.5-flash-lite"
unset TOK URL PROJ
OUTD=/tmp/judge-eval/$LABEL; rm -rf $OUTD
cd $TREE
echo "tree $TREE ($(cat BUNDLE_SHA)): $($S/venv/bin/python -c "
import json, hashlib
j = json.load(open('product/shared/safety/judge.json'))['judges']['caller_crisis']
print('judge threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'], 'system_prompt sha256_16', hashlib.sha256(j['system_prompt'].encode()).hexdigest()[:16])")"
echo "env set (names only): $(env | cut -d= -f1 | grep -E '^VP_LLM_' | sort | tr '\n' ' ')"
echo "args: $WHAT"
set +e
timeout $WALL node product/scripts/judge-eval.mjs $WHAT --rps 1 --concurrency 1 --price-in $PIN --price-out $POUT --max-cost-inr $MAXCOST \
  --max-requests $MAXREQ --label $LABEL --out-dir $OUTD 2>&1 | grep -vE '^\| (lang|source)' | tail -40 | cut -c1-260
echo "judge-eval exit ${PIPESTATUS[0]}"
set -e
for f in report.json summary.md results.json; do
  [ -f $OUTD/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTD/$f "$B/runlogs/vm11-$LABEL-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
echo "== end $LABEL $(date -u)"; echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
