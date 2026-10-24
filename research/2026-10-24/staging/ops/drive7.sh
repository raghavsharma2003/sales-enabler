#!/bin/bash
# The remeasure at 6b0d859, driven from the sandbox: one Run Command per run (run7.tmpl.sh), one at a time, in this
# order, stopping at the first run that does not succeed or would pass the job cap; then final_health7.sh; then the
# outputs are fetched from blob for analyze7.py. Run it only after 18:30 UTC (midnight IST): before that the product's
# daily test budget (INR 200 per workspace, INR 50 reserved per call) refuses test calls (INR 150.18 spent on 24 Oct IST).
#   drive7.sh WORKTREE SCRATCH_DIR
# Uses ../../judge-blind9/ops/ops9.py (the Run Command wrapper: SAS + vp-stage.env as protected parameters only, refuses to
# start while another Run Command is active, prunes by each record's own start time). Prints no secret values.
set -e
WT=$1; W=$2; mkdir -p $W/data
OPS=$WT/research/2026-10-24/judge-blind9/ops; HERE=$WT/research/2026-10-24/staging/ops
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
cd $OPS
# a SAS that outlives the job (lab_ops.sas writes a new 24 h one; the old one stays valid until it expires)
python3 - <<EOF
import urllib.parse, datetime, subprocess, sys
q = urllib.parse.parse_qs(open('$SP/voicelab/sas.txt').read().strip())
se = datetime.datetime.strptime(q['se'][0], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.UTC)
left = (se - datetime.datetime.now(datetime.UTC)).total_seconds() / 3600
print(f'SAS hours left: {left:.1f}')
if left < 4: subprocess.run([sys.executable, '$WT/research/2026-10-24/staging/ops/ops.py', 'sas'], check=True)
EOF
tar czf $W/vps7-kit.tgz -C $HERE/tools7 bargein.py
timeout 300 python3 ops9.py put $W/vps7-kit.tgz vps7-kit.tgz
JOBSTART=$(date -u '+%Y-%m-%d %H:%M:%S+00'); echo "$JOBSTART" > $W/job-start.txt
RUNS="gap:v2-flashlite:4:r1:0 gap:v2-mai:4:r1:0 gap:v2-54mini:4:r1:0 barge:v2-flashlite:4:b1:0 barge:v2-mai:3:b1:0 barge:v2-54mini:3:b1:0 barge:v2-flashlite:2:b2:4"
for R in $RUNS; do
  IFS=: read MODE STACK N RUN OFF <<< "$R"
  NAME=vps7-$MODE-$STACK-$RUN
  python3 - "$HERE/run7.tmpl.sh" "$W/$NAME.sh" <<EOF
import sys
s = open(sys.argv[1]).read()
for k, v in {'__MODE__': '$MODE', '__STACK__': '$STACK', '__N__': '$N', '__RUN__': '$RUN', '__OFF__': '$OFF', '__JOBSTART__': '$JOBSTART',
             '__JOBCAP__': '120000', '__EST__': str(int('$N') * 4500)}.items(): s = s.replace(k, v)
assert '__' not in s.replace('__main__', ''), 'unfilled placeholder'
open(sys.argv[2], 'w').write(s)
EOF
  echo "== $NAME start $(date -u +%H:%M:%S)"
  timeout 2100 python3 ops9.py run $NAME $W/$NAME.sh 1900 > $W/$NAME.out 2>&1 || true
  timeout 120 python3 ops9.py get runlogs/$NAME.out $W/$NAME.full.out > /dev/null 2>&1 || true
  echo "== $NAME $(grep -m1 STATE $W/$NAME.out) $(grep -m1 JOBSPEND $W/$NAME.full.out) $(date -u +%H:%M:%S)"
  grep -q "STATE Succeeded exit 0" $W/$NAME.out || { echo "STOP: $NAME did not succeed (see $W/$NAME.full.out)"; break; }
  for f in $STACK-$RUN.jsonl probes.jsonl vertex-pace.jsonl; do timeout 300 python3 ops9.py get runlogs/$NAME-$f $W/data/$NAME-$f > /dev/null 2>&1 || true; done
done
timeout 900 python3 ops9.py run vps7-final-health $HERE/final_health7.sh 600 > $W/final.out 2>&1 || true
timeout 120 python3 ops9.py get runlogs/vps7-final-health.out $W/final.full.out > /dev/null 2>&1 || true
echo "== final $(grep -m1 STATE $W/final.out) $(date -u +%H:%M:%S)"
mkdir -p $W/an; python3 $HERE/analyze7.py $W/data $W/an > $W/an.out 2>&1 && echo "analysis in $W/an" || echo "analysis failed (see $W/an.out)"
