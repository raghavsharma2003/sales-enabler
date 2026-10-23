#!/bin/bash
# After the e95ebc2+ redeploy: 3 test calls each on v2-flashlite and v2-mai through the product (tools/verify_calls.py,
# the reply-gap sim caller), sequential, Vertex paced by the runtime's pacer (>= 1 s between request starts).
# Then: 422 / gave-up lines in the runtime journal since the deploy, pacing stats, lab health. Prints no secrets.
set -e
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; SINCE="2026-10-23 22:30:40"
echo "== pre $(date -u)"; systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping || true
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
curl -fsS -o $S/tools.tgz -H "x-ms-version: 2022-11-02" "$B/vp-stage-tools.tgz?$SAS" && tar xzf $S/tools.tgz -C $S/tools && chown -R vpstage:vpstage $S/tools
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
mkdir -p $S/data/verify && chown vpstage:vpstage $S/data/verify
OUT=$S/data/verify/verify-f2b27d4.jsonl; rm -f $OUT
P0=$(wc -l < $S/data/vertex-pace.jsonl 2>/dev/null || echo 0)
for STACK in v2-flashlite v2-mai; do
  cd $S/tools && timeout 1500 runuser -u vpstage -- $S/venv/bin/python verify_calls.py $STACK 3 $OUT 2>&1 | tail -6 | cut -c1-1200 || echo "verify $STACK exit $?"
done
echo "== vertex pacing during these calls"
tail -n +$((P0+1)) $S/data/vertex-pace.jsonl 2>/dev/null | $S/venv/bin/python -c "
import json,sys
r=[json.loads(l) for l in sys.stdin if l.strip()]; r=[x for x in r if 't' in x]
w=[x['wait_ms'] for x in r]; print('vertex requests', len(r), 'paced', sum(1 for x in w if x>0), 'max wait ms', max(w or [0]))
ts=sorted(x['t'] for x in r); g=[round(b-a,3) for a,b in zip(ts,ts[1:])]; print('min spacing s', min(g or [0]))" || true
echo "== event batches since the deploy"
echo "runtime 'answered' non-2xx lines: $(journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -c 'control plane answered' || true)"
journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -E 'control plane answered|gave up' | cut -c1-200 | tail -5 || true
echo "runtime 'gave up' lines: $(journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -c 'gave up' || true)"
echo "control 422 lines: $(journalctl -u vp-stage-control --since "$SINCE" --no-pager | grep -c ' 422' || true)"
journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -E 'ERROR|Traceback' | grep -v aiohttp.access | tail -6 | cut -c1-240 || true
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$OUT "$B/runlogs/vps-verify-f2b27d4.jsonl?$SAS" -o /dev/null -w "upload %{http_code}\n"
echo "== post $(date -u)"; systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping || true
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
