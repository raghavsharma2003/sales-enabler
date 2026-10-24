#!/bin/bash
# Task 2 (2026-10-24, staging at e9fdde3): 3 test calls each on v2-flashlite and v2-mai through the product
# (tools/verify_calls.py with the reply-gap sim caller: test.browser_call, never dials a phone; synthetic Hinglish clips
# into the runtime's browser media socket), one at a time, Vertex paced by the runtime's pacer (>= 1 s between request
# starts). The judge is off (no judge model configured). Then: RD1 / RD11 safety events and turn counts from the DB
# (read-only), refused event batches since the deploy, pacing during the calls, the RD1 hold probe, lab health.
# Prints no secrets.
set -e
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
SINCE="$(systemctl show vp-stage-control -p ActiveEnterTimestamp --value | sed 's/^[A-Za-z]* //; s/ UTC$//')"
echo "== pre $(date -u)"; systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping || true
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env; echo "since: $SINCE"
echo "judge env lines: $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env)"
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
mkdir -p $S/data/verify && chown vpstage:vpstage $S/data/verify
OUT=$S/data/verify/verify-e9fdde3.jsonl; rm -f $OUT
P0=$(wc -l < $S/data/vertex-pace.jsonl 2>/dev/null || echo 0)
for STACK in v2-flashlite v2-mai; do
  cd $S/tools && timeout 1500 runuser -u vpstage -- env VPS_AGENT_PREFIX="Verify e9fdde3" $S/venv/bin/python verify_calls.py $STACK 3 $OUT 2>&1 | tail -4 | cut -c1-1500 || echo "verify $STACK exit $?"
done
echo "== vertex pacing during these calls"
tail -n +$((P0+1)) $S/data/vertex-pace.jsonl 2>/dev/null | $S/venv/bin/python -c "
import json,sys,collections
r=[json.loads(l) for l in sys.stdin if l.strip()]; r=[x for x in r if 't' in x]
w=[x['wait_ms'] for x in r]; print('vertex requests', len(r), 'by kind', dict(collections.Counter(x['kind'] for x in r)), 'paced', sum(1 for x in w if x>0), 'max wait ms', max(w or [0]))
ts=sorted(x['t'] for x in r); g=[round(b-a,3) for a,b in zip(ts,ts[1:])]; print('min spacing s', min(g or [0]))" || true
echo "== DB: RD1 / RD11 safety events, turns per speaker, status (read-only)"
IDS=$($S/venv/bin/python -c "import json; print(','.join(\"'\"+json.loads(l)['conversationId']+\"'\" for l in open('$OUT') if 'conversationId' in json.loads(l)))")
cd /tmp
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT left(conversation_id::text,8), seq, rule, action, left(regexp_replace(detail,'\s+',' ','g'),100) FROM call_safety_event WHERE conversation_id IN ($IDS) ORDER BY conversation_id, seq"
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT left(conversation_id::text,8), speaker, count(*) FROM turn WHERE conversation_id IN ($IDS) GROUP BY 1,2 ORDER BY 1,2"
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT left(id::text,8), status, end_reason FROM conversation WHERE id IN ($IDS) ORDER BY 1"
echo "== RD1 opening hold probe"
grep '"k": "hold"' $S/data/probes.jsonl 2>/dev/null | tail -12 || echo "no hold lines"
echo "== event batches since the deploy"
echo "runtime 'answered' non-2xx lines: $(journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -c 'control plane answered' || true)"
echo "runtime 'gave up' lines: $(journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -c 'gave up' || true)"
echo "control 422 lines: $(journalctl -u vp-stage-control --since "$SINCE" --no-pager | grep -c ' 422' || true)"
journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -E 'ERROR|Traceback' | grep -v aiohttp.access | tail -6 | cut -c1-240 || true
for f in $OUT $S/data/probes.jsonl $S/data/vertex-pace.jsonl; do
  curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$f "$B/runlogs/vps4-open-$(basename $f)?$SAS" -o /dev/null -w "upload $(basename $f) %{http_code}\n"
done
echo "== post $(date -u)"; systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping || true
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
