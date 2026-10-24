#!/bin/bash
# Stage 8, step 4c: judge latency for the safety builder (one Run Command, after 4b), on the India VM, from the DEPLOYED
# tree /opt/vp-stage/app (9b34ff7):
#   node product/scripts/judge-latency.mjs --source dev-7,optout-dev --limit 300 --rps 1 --out-dir research/2026-10-24/judge-latency
# Its header: it sends exactly the live judge's request (shared/safety/judge.ts judgeRequest) for DEV caller lines, one at a
# time at most --rps per second, with a 10 s cap, and refuses blind (heldout) sets; it needs a judge model configured
# (VP_LLM_SAFETY_JUDGE_URL/KEY/MODEL, or _AUTH=vertex with a usable Vertex route, server/llm.ts). Route here: Gemini 3.5
# Flash-Lite on the Vertex global OpenAI-compatible endpoint (judge.json model_recommended), BLIND 10/11's judge route
# (../../judge-blind11/ops/judge12.tmpl.sh, MODE judge): a token minted here from the LAB's service-account file
# (/opt/voicelab/vertex-sa.json) with the voice runtime's VertexToken, passed as VP_LLM_SAFETY_JUDGE_KEY (no _KEY_HEADER,
# VP_LLM_DEFAULT_* and VERTEX_OFF unset), with VP_REGION=centralindia. A minted token lasts about an hour; the run takes
# about 6 minutes. (_AUTH=vertex alone does not work here: shared/safety/judge.ts judgeConfigured() wants URL, KEY and
# MODEL.) These variables exist only in this script's process: staging's .env and its units are not touched, so the
# runtime judge stays unconfigured. The token is never printed.
# Guards: staging at 9b34ff7, no active staging call, the lab idle on Vertex for 180 s, and the job's spend + this run's
# estimate (INR 8.66: 300 x BLIND 11's measured INR 28.85 per 1k judge requests, same request shape and model) within INR 80.
# Uploads report.json and summary.md to blob; removes its out-dir from the deployed tree afterwards. Prints no secret.
set -e
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
JOB="__JOB__"; OUTREL=research/2026-10-24/judge-latency
echo "== judgelat8 $(date -u) (job start $JOB UTC)"
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -c "$1" 2>&1; }
D=$(cat $S/app/BUNDLE_SHA); echo "deployed tree: $D"; [ "$D" = 9b34ff7 ] || { echo "STOP: staging is not at 9b34ff7"; exit 3; }
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "STOP: staging calls active"; exit 5; }
JS=$(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE started_at >= '$JOB+00'"); CL=$(q "SELECT coalesce(sum(inr_milli),0) FROM cost_line WHERE conversation_id IS NULL AND created_at >= '$JOB+00'")
echo "job spend in the DB so far: calls $JS milli, other cost lines $CL milli; + this run's estimate 8660 = $((JS + CL + 8660)) milli"
[ $((JS + CL + 8660)) -le 80000 ] || { echo "STOP: would pass the job's INR 80"; exit 4; }
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "STOP: the lab is still on Vertex"; exit 4; }
echo "lab Vertex idle ${age}s; lab ping $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
SA=/opt/voicelab/vertex-sa.json; [ -f $SA ] || { echo "STOP: no lab service-account file"; exit 6; }
cd $S/app
echo "provenance (sha256_16): judge-latency.mjs $(sha256sum product/scripts/judge-latency.mjs | cut -c1-16), judge.json $(sha256sum product/shared/safety/judge.json | cut -c1-16), judge.ts $(sha256sum product/shared/safety/judge.ts | cut -c1-16), llm.ts $(sha256sum product/server/llm.ts | cut -c1-16), vertex-token.ts $(sha256sum product/server/vertex-token.ts | cut -c1-16), cases.json $(sha256sum product/shared/safety/cases.json | cut -c1-16)"
$S/venv/bin/python -c "
import json, hashlib
j = json.load(open('product/shared/safety/judge.json'))['judges']['caller_crisis']
print('judge contract: timeout_ms', j['timeout_ms'], 'hedge_after_ms', j.get('hedge_after_ms'), 'max_tokens', j['max_tokens'], 'temperature', j['temperature'], 'system_prompt sha256_16', hashlib.sha256(j['system_prompt'].encode()).hexdigest()[:16])
d = json.load(open('product/shared/safety/cases.json'))
n = [c for c in d['cases'] if c['fn'] == 'callerSignals' and c['source'] in ('dev-7', 'optout-dev') and isinstance(c['input'], str)]
print('DEV lines available:', len(n), '(dev-7', sum(c['source'] == 'dev-7' for c in n), '+ optout-dev', sum(c['source'] == 'optout-dev' for c in n), '); the first 300 are sent:', sum(c['source'] == 'dev-7' for c in n[:300]), 'dev-7 +', sum(c['source'] == 'optout-dev' for c in n[:300]), 'optout-dev')"
PROJ=$($S/venv/bin/python -c "import json; print(json.load(open('$SA'))['project_id'])")
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER VP_LLM_DEFAULT_AUTH VP_LLM_SAFETY_JUDGE_KEY_HEADER VERTEX_OFF VP_JUDGE_EVAL_FAKE
unset VP_LLM_SAFETY_JUDGE_AUTH
TOK=$(cd $S/app/product/voice && $S/venv/bin/python -c "
import asyncio, json, aiohttp
from vpvoice.providers.google import VertexToken
async def m():
    async with aiohttp.ClientSession() as h: print(await VertexToken(json.load(open('$SA'))).get(h))
asyncio.run(m())")
[ -n "$TOK" ] || { echo "STOP: no Vertex token"; exit 6; }
export VP_LLM_SAFETY_JUDGE_URL="https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions"
export VP_LLM_SAFETY_JUDGE_KEY="$TOK" VP_LLM_SAFETY_JUDGE_MODEL="google/gemini-3.5-flash-lite" VP_REGION=centralindia
unset TOK PROJ
export PATH=$S/node/bin:$PATH
echo "env set (names only): $(env | cut -d= -f1 | grep -E '^(VP_LLM_|VERTEX_|VP_REGION|VP_JUDGE)' | sort | tr '\n' ' ')"
rm -rf $OUTREL
echo "start $(date -u +%H:%M:%S)"
set +e
timeout 1500 node product/scripts/judge-latency.mjs --source dev-7,optout-dev --limit 300 --rps 1 --out-dir $OUTREL 2>&1 | grep -vE '^[0-9]+/300$' | tail -40 | cut -c1-260
echo "judge-latency exit ${PIPESTATUS[0]} $(date -u +%H:%M:%S)"
set -e
for f in report.json summary.md; do
  [ -f $OUTREL/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTREL/$f "$B/runlogs/vps8-judgelat-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
rm -rf $S/app/research/2026-10-24/judge-latency; rmdir $S/app/research/2026-10-24 2>/dev/null || true
echo "deployed tree left as deployed: research/2026-10-24 in it: $(ls -d $S/app/research/2026-10-24 2>/dev/null || echo none)"
echo "staging .env judge lines: $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env) (unchanged: the runtime judge stays unconfigured)"
echo "== judgelat8 done $(date -u)"; echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime | tr '\n' ' '; echo
