#!/bin/bash
# Remeasure at 6b0d859 (2026-10-24), one run = one stack, one mode, N test calls, one at a time. Filled by drive7.sh.
#   gap    the reply-gap method of reply-gap.md, unchanged: ../staging/ops/tools/verify_calls.py (replygap.py's sim caller,
#          clips and waits, plus the opening checks), the runtime restarted first, Vertex paced at >= 1 s per request
#          start, on the shipped defaults (no drop-in, no env override).
#   barge  tools7/bargein.py: nods and barge-ins played over her, same caller and agents.
# Every call is test.browser_call (never dials a phone) with synthetic clips. Guards, all before the first call:
#   - staging must be at 6b0d859 with no runtime drop-in and no judge model;
#   - no active staging call; the lab has not used Vertex in the last 180 s;
#   - spend: this job's test spend since __JOBSTART__ plus this run's estimate must stay within the job cap (INR __JOBCAP__),
#     and today's (IST) test spend must leave the product's own per-call reservation (else it would refuse anyway).
# Prints no secret values.
set -e
S=/opt/vp-stage; MODE=__MODE__; STACK=__STACK__; N=__N__; RUN=__RUN__; OFF=__OFF__
JOBSTART='__JOBSTART__'; JOBCAP=__JOBCAP__; EST=__EST__; WANT=6b0d859; PREFIX="Remeasure 6b0d859"
B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
units() { for u in postgresql@16-main voicelab vp-stage-control vp-stage-runtime; do echo "  $u since $(systemctl show $u -p ActiveEnterTimestamp --value) restarts $(systemctl show $u -p NRestarts --value)"; done; }
q() { (cd /tmp && runuser -u vpstage -- psql -d vp_stage -At -c "$1"); }
echo "== start $MODE $STACK $RUN $(date -u)"
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; [ "$(cat $S/app/BUNDLE_SHA)" = "$WANT" ] || { echo "staging is not at $WANT; not starting"; exit 6; }
grep '^VERTEX_OFF=' $S/.env
echo "judge env lines: $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env); runtime drop-ins: $(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | wc -l)"
[ "$(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | wc -l)" = 0 ] || { echo "runtime drop-in present; not starting"; exit 6; }
echo "needrestart effective restart mode: $(perl -e 'our %nrconf = (restart => "i"); for my $f ("/etc/needrestart/needrestart.conf", sort glob("/etc/needrestart/conf.d/*.conf")) { do $f; } print $nrconf{restart}')"
echo "units before:"; units
echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://$FQDN/api/ping || true
[ "$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')" = 0 ] || { echo "staging calls active; not starting"; exit 5; }
TODAY=$(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'")
JOB=$(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE channel = 'test' AND started_at >= '$JOBSTART'")
echo "spend before (INR milli): today (IST) $TODAY, this job since $JOBSTART $JOB, this run's estimate $EST, job cap $JOBCAP"
[ $((JOB + EST)) -le $JOBCAP ] || { echo "job cap would be passed; not starting"; exit 7; }
[ $((TODAY + 50000)) -le 200000 ] || { echo "today's test budget leaves no room for a call; not starting"; exit 8; }
systemctl restart vp-stage-runtime; sleep 8
P=$(systemctl show vp-stage-runtime -p MainPID --value)
echo "runtime turn-taking / latency overrides in env: $(tr '\0' '\n' < /proc/$P/environ | grep -cE '^VP_(SPECULATE_PARTIAL|SPECULATE_STABLE_MS|PREWARM|FIRST_CLAUSE|BARGE_[A-Z_]+|RESUME_MS|PACED_PROVIDERS|LISTEN_FIRST)=') (0 = code defaults)"
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break
  echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "lab still active on Vertex; not starting"; exit 4; }
mkdir -p $S/data/remeasure && chown vpstage:vpstage $S/data/remeasure
OUT=$S/data/remeasure/$STACK-$RUN.jsonl; rm -f $OUT
P0=$(wc -l < $S/data/vertex-pace.jsonl 2>/dev/null || echo 0); T0=$(date -u '+%Y-%m-%d %H:%M:%S')
if [ "$MODE" = gap ]; then
  cd $S/tools && timeout 1700 runuser -u vpstage -- env VPS_AGENT_PREFIX="$PREFIX" $S/venv/bin/python verify_calls.py "$STACK" $N $OUT 2>&1 | tail -12 | cut -c1-900 || echo "driver exit $?"
else
  rm -rf /tmp/vps7-kit && mkdir -p /tmp/vps7-kit
  curl -fsS -o /tmp/vps7-kit.tgz -H "x-ms-version: 2022-11-02" "$B/vps7-kit.tgz?$SAS" && tar xzf /tmp/vps7-kit.tgz -C /tmp/vps7-kit && chmod -R a+rX /tmp/vps7-kit
  sha256sum /tmp/vps7-kit/bargein.py | cut -c1-16 | sed 's/^/bargein.py sha256_16 /'
  cd /tmp/vps7-kit && timeout 1700 runuser -u vpstage -- env VPS_AGENT_PREFIX="$PREFIX" VPS_TOOLS=$S/tools $S/venv/bin/python bargein.py "$STACK" $N $OUT ${OFF:-0} 2>&1 | tail -12 | cut -c1-1500 || echo "driver exit $?"
  rm -rf /tmp/vps7-kit /tmp/vps7-kit.tgz
fi
echo "brand respellings the runtime repaired this run (sentences, per call):"
journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -oE 'brand respelled [0-9a-f]{8}' | sort | uniq -c || echo "  none"
tail -n +$((P0+1)) $S/data/vertex-pace.jsonl 2>/dev/null | $S/venv/bin/python -c "
import json,sys,collections
r=[json.loads(l) for l in sys.stdin if l.strip()]; r=[x for x in r if 't' in x]
w=[x['wait_ms'] for x in r]; print('vertex requests this run', len(r), 'by kind', dict(collections.Counter(x['kind'] for x in r)), 'paced', sum(1 for x in w if x>0), 'max wait ms', max(w or [0]))
print('paced by kind', dict(collections.Counter(x['kind'] for x in r if x['wait_ms']>0)))
ts=sorted(x['t'] for x in r); g=[round(b-a,3) for a,b in zip(ts,ts[1:])]; print('min spacing s', min(g or [0]))" || true
for f in $OUT $S/data/probes.jsonl $S/data/vertex-pace.jsonl; do
  [ -f $f ] && curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$f "$B/runlogs/vps7-$MODE-$STACK-$RUN-$(basename $f)?$SAS" -o /dev/null -w "upload $(basename $f) %{http_code}\n"
done
echo "this run: runtime 'answered' non-2xx $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -c 'control plane answered' || true), 'gave up' $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -c 'gave up' || true), tracebacks $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -c Traceback || true), control 422 $(journalctl -u vp-stage-control --since "$T0" --no-pager | grep -c ' 422' || true)"
journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -E 'ERROR|Traceback' | grep -v aiohttp.access | tail -6 | cut -c1-260 || true
TODAY=$(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'")
JOB=$(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE channel = 'test' AND started_at >= '$JOBSTART'")
echo "JOBSPEND $JOB TODAYSPEND $TODAY (INR milli)"
echo "== end $(date -u)"; echo "units after:"; units
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://$FQDN/api/ping || true
