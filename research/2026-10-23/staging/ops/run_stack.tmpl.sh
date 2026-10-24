#!/bin/bash
# Product-runtime reply gap for one stack (__STACK__, __N__ calls), sequential, Vertex paced at >= 1 s per request start.
set -e
S=/opt/vp-stage; STACK=__STACK__; N=__N__; RUN=__RUN__; OFF=__OFF__
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
now=$(date -u +%s); gate=$(date -u -d '2026-10-23 20:00:00' +%s)
[ "$now" -ge "$gate" ] || { echo "before 20:00 UTC: no Vertex traffic; refusing"; exit 3; }
curl -fsS -o $S/tools.tgz -H "x-ms-version: 2022-11-02" "$B/vp-stage-tools.tgz?$SAS" && tar xzf $S/tools.tgz -C $S/tools && chown -R vpstage:vpstage $S/tools
if grep -q '^VERTEX_OFF=1' $S/.env; then
  sed -i 's/^VERTEX_OFF=1$/VERTEX_OFF=0/' $S/.env; systemctl restart vp-stage-runtime; sleep 8; echo "VERTEX_OFF flipped to 0, runtime restarted"
fi
grep '^VERTEX_OFF=' $S/.env
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
systemctl restart vp-stage-runtime; sleep 8      # load the current tools/pace.py
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); [print(' ', k, v['available'], v['missing'], (v['reason'] or '')[:100]) for k, v in d['stacks'].items() if k in ('v2-flashlite','v2-mai','v2-38flash','v2-54mini')]; print('activeCalls', d['activeCalls'])"
# the lab shares the Vertex project: wait while the lab itself is making Vertex requests (owner testing)
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last ))
  [ $age -gt 180 ] && break
  echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
mkdir -p $S/data/replygap && chown vpstage:vpstage $S/data/replygap
OUT=$S/data/replygap/$STACK-$RUN.jsonl
P0=$(wc -l < $S/data/vertex-pace.jsonl 2>/dev/null || echo 0)
cd $S/tools && timeout 3000 runuser -u vpstage -- $S/venv/bin/python replygap.py "$STACK" $N $OUT ${OFF:-0} 2>&1 | tail -30 | cut -c1-400
tail -n +$((P0+1)) $S/data/vertex-pace.jsonl 2>/dev/null | $S/venv/bin/python -c "
import json,sys
r=[json.loads(l) for l in sys.stdin if l.strip()]; r=[x for x in r if 't' in x]
w=[x['wait_ms'] for x in r]; print('vertex requests this run', len(r), 'paced', sum(1 for x in w if x>0), 'max wait ms', max(w or [0]))
ts=sorted(x['t'] for x in r); g=[round(b-a,3) for a,b in zip(ts,ts[1:])]; print('min spacing s', min(g or [0]))" || true
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUT "$B/runlogs/vps-replygap-$STACK-$RUN.jsonl?$SAS" -o /dev/null -w "upload %{http_code}\n"
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$S/data/vertex-pace.jsonl "$B/runlogs/vps-vertex-pace.jsonl?$SAS" -o /dev/null -w "upload pace %{http_code}\n"
journalctl -u vp-stage-runtime --since "-50min" --no-pager | grep -E 'ERROR|Traceback|WARNING' | grep -v aiohttp.access | tail -8 | cut -c1-260
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
