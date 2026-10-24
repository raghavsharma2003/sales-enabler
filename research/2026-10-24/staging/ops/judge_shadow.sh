#!/bin/bash
# Task 3b (2026-10-24, staging at e9fdde3): the crisis judge in SHADOW on Gemini 3.5 Flash-Lite through Vertex
# (judge.json model_recommended), for one bounded batch of test calls, then off again.
# Why bounded: the runtime's judge takes a static key (VP_LLM_SAFETY_JUDGE_KEY) and Vertex wants an OAuth token that
# expires in about an hour, so a token minted here keeps the judge working for one batch only (the runtime mints its own
# token for brain and voice; the judge has no such path yet).
# How: a runtime-only systemd drop-in (vp-stage-runtime.service.d/judge-shadow.conf -> /opt/vp-stage/judge-shadow.env,
# mode 600), so the control plane never sees it and stage_setup.sh is untouched; removed on exit whatever happens.
# The judge's requests go through the runtime's pacer like every Vertex request (>= 1 s between starts).
# Calls: the reply-gap caller on the same agents as the judge-off runs ("Reply gap e9fdde3 <stack>"). First on the shipped
# latency defaults (run label 'js': v2-flashlite 4, v2-mai 2, v2-54mini 2), then v2-flashlite 4 more with
# VP_SPECULATE_PARTIAL=0 VP_PREWARM=0 (run label 'jsnf', a second drop-in arm.conf), which separates the judge's own
# share of the pacer from the latency flags' share. Both drop-ins are removed on exit.
# Prints no secret values; the token is never printed.
set -e
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
D=/etc/systemd/system/vp-stage-runtime.service.d; JE=$S/judge-shadow.env
cleanup() {
  rm -f $D/judge-shadow.conf $D/arm.conf; [ -f $JE ] && shred -u $JE 2>/dev/null; rm -f $JE
  rmdir $D 2>/dev/null || true
  systemctl daemon-reload; systemctl restart vp-stage-runtime; sleep 8
  echo "== judge off again $(date -u): drop-in $(ls $D 2>/dev/null | wc -l) file(s), env file $( [ -f $JE ] && echo present || echo removed )"
  curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime ok', d['ok'], 'activeCalls', d['activeCalls'])"
  cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ 2>/dev/null | tr '\0' '\n' | grep -c '^VP_LLM_SAFETY_JUDGE_' | sed 's/^/judge env vars in the runtime process now: /'
}
echo "== start $(date -u)"; echo "deployed: $(cat $S/app/BUNDLE_SHA)"
echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
trap cleanup EXIT
PROJ=$($S/venv/bin/python -c "import json; print(json.load(open('$S/vertex-sa.json'))['project_id'])")
TOK=$(cd $S/app/product/voice && $S/venv/bin/python -c "
import asyncio, json, aiohttp
from vpvoice.providers.google import VertexToken
async def m():
    async with aiohttp.ClientSession() as h: print(await VertexToken(json.load(open('$S/vertex-sa.json'))).get(h))
asyncio.run(m())")
umask 077
{
  echo "VP_LLM_SAFETY_JUDGE_URL=https://aiplatform.googleapis.com/v1/projects/$PROJ/locations/global/endpoints/openapi/chat/completions"
  echo "VP_LLM_SAFETY_JUDGE_KEY=$TOK"
  echo "VP_LLM_SAFETY_JUDGE_MODEL=google/gemini-3.5-flash-lite"
  echo "VP_LLM_SAFETY_JUDGE_USD_IN_1M=0.30"
  echo "VP_LLM_SAFETY_JUDGE_USD_OUT_1M=2.50"
  echo "VP_SAFETY_JUDGE_MODE=shadow"
} > $JE
umask 022
chown vpstage:vpstage $JE; chmod 600 $JE; unset TOK
mkdir -p $D; printf '[Service]\nEnvironmentFile=%s\n' "$JE" > $D/judge-shadow.conf
systemctl daemon-reload; systemctl restart vp-stage-runtime; sleep 8
echo "judge env names in the runtime process: $(cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | tr '\0' '\n' | grep -E '^VP_(LLM_SAFETY_JUDGE|SAFETY_JUDGE)_' | cut -d= -f1 | tr '\n' ' ')"
echo "control plane judge env vars: $(cat /proc/$(systemctl show vp-stage-control -p MainPID --value)/environ | tr '\0' '\n' | grep -c '^VP_LLM_SAFETY_JUDGE_')"
echo "== judge smoke: one request through the runtime's own judge code (a synthetic benign line; no text printed)"
sleep 2
cd $S/app/product/voice && set -a && . $JE && set +a && $S/venv/bin/python -c "
import asyncio, aiohttp
from vpvoice import judge
async def m():
    async with aiohttp.ClientSession() as h:
        r = await judge.judge_caller_crisis('Haan ji, renewal ke baare mein bataiye, premium kitna hai?', judge.http_complete(h))
        print('smoke: mode', r['mode'], 'called', r['called'], 'event', (r.get('event') or {}).get('type'), (r.get('event') or {}).get('reason'),
              'verdict', None if not r.get('judge') else {k: r['judge'][k] for k in ('crisis', 'kind')}, 'latency ms', int(r['latencyMs']), 'usage', r.get('usage'))
asyncio.run(m())"
unset VP_LLM_SAFETY_JUDGE_KEY VP_LLM_SAFETY_JUDGE_URL
sleep 2
mkdir -p $S/data/replygap && chown vpstage:vpstage $S/data/replygap
P0=$(wc -l < $S/data/vertex-pace.jsonl 2>/dev/null || echo 0); Q0=$(wc -l < $S/data/probes.jsonl 2>/dev/null || echo 0)
T0=$(date -u '+%Y-%m-%d %H:%M:%S')
for SN in v2-flashlite:4:js v2-mai:2:js v2-54mini:2:js v2-flashlite:4:jsnf; do
  STACK=${SN%%:*}; R=${SN##*:}; N=${SN#*:}; N=${N%%:*}; OUT=$S/data/replygap/$STACK-$R.jsonl
  if [ "$R" = jsnf ] && [ ! -f $D/arm.conf ]; then
    printf '[Service]\nEnvironment=VP_SPECULATE_PARTIAL=0\nEnvironment=VP_PREWARM=0\n' > $D/arm.conf; systemctl daemon-reload; systemctl restart vp-stage-runtime; sleep 8
  fi
  echo "-- $STACK $R x$N $(date -u +%H:%M:%S); runtime env: $(cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | tr '\0' '\n' | grep -E '^VP_(SPECULATE_PARTIAL|PREWARM|SAFETY_JUDGE_MODE|LLM_SAFETY_JUDGE_MODEL)=' | tr '\n' ' ')"
  cd $S/tools && timeout 1500 runuser -u vpstage -- env VPS_AGENT_PREFIX="Reply gap e9fdde3" $S/venv/bin/python replygap.py "$STACK" $N $OUT 0 2>&1 | tail -6 | cut -c1-600 || echo "replygap $STACK exit $?"
  curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUT "$B/runlogs/vps4-$R-$STACK.jsonl?$SAS" -o /dev/null -w "upload $STACK $R %{http_code}\n"
done
tail -n +$((P0+1)) $S/data/vertex-pace.jsonl 2>/dev/null | $S/venv/bin/python -c "
import json,sys,collections
r=[json.loads(l) for l in sys.stdin if l.strip()]; r=[x for x in r if 't' in x]
w=[x['wait_ms'] for x in r]; print('vertex requests in the batch', len(r), 'by kind', dict(collections.Counter(x['kind'] for x in r)), 'paced', sum(1 for x in w if x>0), 'max wait ms', max(w or [0]))
print('paced by kind', dict(collections.Counter(x['kind'] for x in r if x['wait_ms']>0)))
ts=sorted(x['t'] for x in r); g=[round(b-a,3) for a,b in zip(ts,ts[1:])]; print('min spacing s', min(g or [0]))" || true
tail -n +$((Q0+1)) $S/data/probes.jsonl | $S/venv/bin/python -c "
import json,sys,collections
r=[json.loads(l) for l in sys.stdin if l.strip()]; j=[x for x in r if x['k']=='judge']
print('judge calls (probe)', len(j), 'events', dict(collections.Counter(str(x['event']) for x in j)), 'reasons', dict(collections.Counter(str(x['reason']) for x in j if x['reason'])), 'crisis true', sum(1 for x in j if x['crisis']), 'optOut true', sum(1 for x in j if x['optOut']))"
cd /tmp && runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT label, mode, outcome, count(*), percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM call_judge_event WHERE at >= '$T0'::timestamptz GROUP BY 1,2,3 ORDER BY 1,2,3"
for f in $S/data/probes.jsonl $S/data/vertex-pace.jsonl; do
  curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$f "$B/runlogs/vps4-js-$(basename $f)?$SAS" -o /dev/null -w "upload $(basename $f) %{http_code}\n"
done
journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -E 'ERROR|Traceback|judge' | grep -v aiohttp.access | tail -8 | cut -c1-240
echo "== end $(date -u)"; systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping || true
