#!/bin/bash
# One judge-eval run for the vm12 job. Adapted from ../../judge-blind10/ops/judge11.tmpl.sh (judge mode, unchanged in
# substance) and ../../brief-review-blind/flashlite/ops/vm10-brief.sh (review mode). What differs:
# - labels and blob names (vm12-); tree /tmp/je12 (head 9c16159);
# - MODE judge: exactly BLIND 10's route. Token minted here from /opt/voicelab/vertex-sa.json with the voice runtime's
#   VertexToken and passed as VP_LLM_SAFETY_JUDGE_KEY (no _KEY_HEADER, VP_LLM_DEFAULT_* unset);
# - MODE review: the shipped brief-review route, brief-review.json model_recommended: VP_LLM_BRIEF_REVIEW_AUTH=vertex,
#   so server/llm.ts mints its own token from VERTEX_SA_FILE=/opt/voicelab/vertex-sa.json (VP_REGION=centralindia);
#   no _KEY, no _KEY_HEADER, VP_LLM_DEFAULT_* unset. The passive attribution spy (ops12/fetch_spy.mjs) is loaded with
#   --import and writes spy.jsonl (field paths, kinds, confidences, hashes; no text);
# - before the first request the pinned files are re-checked by sha256 on the VM tree, and the mode's contract system
#   prompt must hash to __PSHA__ (a mismatch stops the run, no request is made).
# Gemini 3.5 Flash-Lite on the Vertex global OpenAI-compatible endpoint, from the India VM, --rps 1 --concurrency 1.
# Nothing secret is printed. Waits while the lab used Vertex in the last 180 s and while staging has active calls.
# Uploads report.json, summary.md, results.json (and spy.jsonl in review mode) to blob.
set -e
S=/opt/vp-stage; LABEL=__LABEL__; TREE=__TREE__; WHAT="__WHAT__"; MAXREQ=__MAXREQ__; MAXCOST=__MAXCOST__; WALL=__WALL__; PSHA=__PSHA__; MODE=__MODE__
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
PIN=28.5; POUT=237.5        # prices.ts gemini-3.5-flash-lite $0.30 / $2.50 per 1M x 95
echo "== start $LABEL mode $MODE $(date -u)"; echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://$FQDN/api/ping || true
export PATH=$S/node/bin:$PATH
cd $TREE
TREE=$TREE PSHA=$PSHA MODE=$MODE $S/venv/bin/python - <<'PY'
import hashlib, json, os
t = os.environ['TREE']; mode = os.environ['MODE']
common = {'product/scripts/judge-eval.mjs': 'aa468b65609aef78', 'product/shared/safety/rules.json': 'eebd2f947159a2c1',
          'product/shared/safety/index.ts': '59d2e92f20c9b7cb', 'product/server/llm.ts': 'a54159bdca32094d'}
want = dict(common, **({'product/shared/safety/judge.json': '1d467ad8ee1ad73e', 'product/shared/safety/judge.ts': 'fdce56943ff4a6f5',
                        'product/shared/safety/sets/heldout-11.json': 'fd83ce9671bc8346'} if mode == 'judge' else
                       {'product/shared/safety/brief-review.json': '674194ac08790e9a', 'product/server/modules/agents/review.ts': 'ddc2047bb1c8dfad',
                        'product/server/modules/agents/guard.ts': '1d2260c2daa0af4a', 'product/server/modules/agents/templates.ts': '10674c3840044586',
                        'product/server/vertex-token.ts': '0beadb37530183bb', 'product/shared/safety/sets/heldout-brief-review-2.json': '136eba412f14a5f0',
                        'ops12/fetch_spy.mjs': 'a7d874dc1db1ad28'}))
bad = [p for p, h in want.items() if hashlib.sha256(open(os.path.join(t, p), 'rb').read()).hexdigest()[:16] != h]
if mode == 'judge': sp = json.load(open(os.path.join(t, 'product/shared/safety/judge.json')))['judges']['caller_crisis']['system_prompt']
else: sp = json.load(open(os.path.join(t, 'product/shared/safety/brief-review.json')))['system_prompt']
psha = hashlib.sha256(sp.encode()).hexdigest()[:16]
print(f'integrity ({mode}): {len(want)} files', 'all match' if not bad else f'MISMATCH {bad}', f'| contract system_prompt sha256_16 {psha} (expect {os.environ["PSHA"]})')
raise SystemExit(7 if bad or psha != os.environ['PSHA'] else 0)
PY
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
SA=/opt/voicelab/vertex-sa.json; [ -f $SA ] || { echo "no /opt/voicelab/vertex-sa.json; not starting"; exit 6; }
PROJ=$($S/venv/bin/python -c "import json; print(json.load(open('$SA'))['project_id'])")
URL="https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions"
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER VP_LLM_DEFAULT_AUTH
unset VP_LLM_SAFETY_JUDGE_KEY_HEADER VP_LLM_SAFETY_JUDGE_AUTH VP_LLM_BRIEF_REVIEW_KEY VP_LLM_BRIEF_REVIEW_KEY_HEADER VP_LLM_BRIEF_REVIEW_AUTH
OUTD=/tmp/judge-eval/$LABEL; rm -rf $OUTD; mkdir -p $OUTD
if [ "$MODE" = judge ]; then
  TOK=$(cd $S/app/product/voice && $S/venv/bin/python -c "
import asyncio, json, aiohttp
from vpvoice.providers.google import VertexToken
async def m():
    async with aiohttp.ClientSession() as h: print(await VertexToken(json.load(open('$SA'))).get(h))
asyncio.run(m())")
  export VP_LLM_SAFETY_JUDGE_URL="$URL" VP_LLM_SAFETY_JUDGE_KEY="$TOK" VP_LLM_SAFETY_JUDGE_MODEL="google/gemini-3.5-flash-lite"
  unset TOK
  RUN="node product/scripts/judge-eval.mjs"
else
  export VP_LLM_BRIEF_REVIEW_URL="$URL" VP_LLM_BRIEF_REVIEW_MODEL="google/gemini-3.5-flash-lite" VP_LLM_BRIEF_REVIEW_AUTH=vertex VERTEX_SA_FILE=$SA VP_REGION=centralindia
  unset VERTEX_OFF
  export VP_FETCH_SPY_OUT=$OUTD/spy.jsonl
  RUN="node --import tsx --import $TREE/ops12/fetch_spy.mjs product/scripts/judge-eval.mjs"
fi
unset URL PROJ
cd $TREE
echo "tree $TREE ($(cat BUNDLE_SHA)), mode $MODE: $(MODE=$MODE $S/venv/bin/python -c "
import json, hashlib, os
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()[:16]
if os.environ['MODE'] == 'review':
    j = json.load(open('product/shared/safety/brief-review.json'))
    print('brief-review threshold', j['threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'], 'system_prompt sha256_16', sha(j['system_prompt']))
else:
    j = json.load(open('product/shared/safety/judge.json'))['judges']['caller_crisis']
    print('judge threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'], 'system_prompt sha256_16', sha(j['system_prompt']))")"
echo "env set (names only): $(env | cut -d= -f1 | grep -E '^(VP_LLM_|VERTEX_|VP_REGION|VP_FETCH)' | sort | tr '\n' ' ')"
echo "args: $WHAT"
set +e
timeout $WALL $RUN $WHAT --rps 1 --concurrency 1 --price-in $PIN --price-out $POUT --max-cost-inr $MAXCOST \
  --max-requests $MAXREQ --label $LABEL --out-dir $OUTD 2>&1 | grep -vE '^\| (lang|source)' | tail -40 | cut -c1-260
echo "judge-eval exit ${PIPESTATUS[0]}"
set -e
[ "$MODE" = review ] && echo "spy records: $( [ -f $OUTD/spy.jsonl ] && wc -l < $OUTD/spy.jsonl || echo 0 )"
for f in report.json summary.md results.json spy.jsonl; do
  [ -f $OUTD/$f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUTD/$f "$B/runlogs/vm12-$LABEL-$f?$SAS" -o /dev/null -w "upload $f %{http_code}\n"
done
echo "== end $LABEL $(date -u)"; echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
