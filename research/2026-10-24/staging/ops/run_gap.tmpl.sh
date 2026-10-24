#!/bin/bash
# Task 3 (2026-10-24, staging at e9fdde3): product-runtime reply gap for one stack (__STACK__, __N__ calls, run __RUN__),
# the 23 Oct method (../../2026-10-23/staging/ops/run_stack.tmpl.sh): the same sim caller, clips and waits, calls one at
# a time, the runtime restarted first, Vertex paced at >= 1 s per request start. New agents at this head
# ("Reply gap e9fdde3 <stack>", renewal template). Each call also records the runtime's own per-stage timing and partial
# lag (GET /v1/calls/{id} -> timing, signed on the VM). Judge mode: __JUDGE__ (off = no judge model configured).
# Arm env: "__ARMENV__". Empty = the shipped defaults (VP_SPECULATE_PARTIAL on, VP_PREWARM on, VP_FIRST_CLAUSE off,
# VP_BARGE_NOD on). Otherwise those overrides go into a runtime-only systemd drop-in for this run, which is removed on
# exit whatever happens (the runtime is restarted on its defaults).
set -e
S=/opt/vp-stage; STACK=__STACK__; N=__N__; RUN=__RUN__; OFF=__OFF__; ARMENV="__ARMENV__"
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; D=/etc/systemd/system/vp-stage-runtime.service.d
if [ -n "$ARMENV" ]; then
  arm_off() { rm -f $D/arm.conf; rmdir $D 2>/dev/null || true; systemctl daemon-reload; systemctl restart vp-stage-runtime; sleep 8
              echo "== arm removed $(date -u): drop-ins $(ls $D 2>/dev/null | wc -l); runtime VP_ flags now: $(cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | tr '\0' '\n' | grep -cE '^VP_(SPECULATE_PARTIAL|PREWARM)=')"; }
  trap arm_off EXIT
  mkdir -p $D; { echo '[Service]'; for kv in $ARMENV; do echo "Environment=$kv"; done; } > $D/arm.conf; systemctl daemon-reload
fi
echo "== start $(date -u)"; echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
echo "judge env lines: $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env); runtime drop-ins: $(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | tr '\n' ' ')"
echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
systemctl restart vp-stage-runtime; sleep 8
echo "runtime latency flags in env: $(cat /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | tr '\0' '\n' | grep -E '^VP_(SPECULATE_PARTIAL|PREWARM|FIRST_CLAUSE|BARGE_NOD|BARGE_LONG_MS)=' | tr '\n' ' ') (none = code defaults)"
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); [print(' ', k, v['available'], v['missing'], (v['reason'] or '')[:100]) for k, v in d['stacks'].items() if k in ('v2-flashlite','v2-mai','v2-54mini')]; print('activeCalls', d['activeCalls'])"
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
cd $S/tools && timeout 1500 runuser -u vpstage -- env VPS_AGENT_PREFIX="Reply gap e9fdde3" $S/venv/bin/python replygap.py "$STACK" $N $OUT ${OFF:-0} 2>&1 | tail -30 | cut -c1-700
tail -n +$((P0+1)) $S/data/vertex-pace.jsonl 2>/dev/null | $S/venv/bin/python -c "
import json,sys,collections
r=[json.loads(l) for l in sys.stdin if l.strip()]; r=[x for x in r if 't' in x]
w=[x['wait_ms'] for x in r]; print('vertex requests this run', len(r), 'by kind', dict(collections.Counter(x['kind'] for x in r)), 'paced', sum(1 for x in w if x>0), 'max wait ms', max(w or [0]))
print('paced by kind', dict(collections.Counter(x['kind'] for x in r if x['wait_ms']>0)))
ts=sorted(x['t'] for x in r); g=[round(b-a,3) for a,b in zip(ts,ts[1:])]; print('min spacing s', min(g or [0]))" || true
for f in $OUT $S/data/probes.jsonl $S/data/vertex-pace.jsonl; do
  curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$f "$B/runlogs/vps4-gap-$STACK-$RUN-$(basename $f)?$SAS" -o /dev/null -w "upload $(basename $f) %{http_code}\n"
done
echo "runtime 'answered' non-2xx / 'gave up' lines (this run): $(journalctl -u vp-stage-runtime --since "-50min" --no-pager | grep -c 'control plane answered' || true) / $(journalctl -u vp-stage-runtime --since "-50min" --no-pager | grep -c 'gave up' || true)"
journalctl -u vp-stage-runtime --since "-50min" --no-pager | grep -E 'ERROR|Traceback|WARNING' | grep -v aiohttp.access | tail -8 | cut -c1-260
echo "== end $(date -u)"; systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping || true
