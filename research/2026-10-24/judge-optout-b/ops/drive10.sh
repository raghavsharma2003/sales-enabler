#!/bin/bash
# vm10 job driver, from the sandbox (adapted from ../../judge-blind9/ops/drive_j9dev.sh and drive_j9blind.sh). One step
# per call, one Run Command at a time, through ../../judge-blind9/ops/ops9.py (refuses while another Run Command is
# active; prunes by each record's own start time at 24 records). Google is never called from here: every model request
# runs on vl-vm-cin.
#   drive10.sh WORKDIR prep     put the bundle in blob, then prep10.sh (no model traffic)
#   drive10.sh WORKDIR optout   eval 1: opt-out DEV under prompt B (refuses without RULE.md, or a second time)
#   drive10.sh WORKDIR brief    eval 2: brief review on the blind set, scored ONCE (refuses a second time)
#   drive10.sh WORKDIR final    final_health10.sh: health after, removes this job's VM copies
# Each eval fetches the run log, report.json and summary.md; the brief run also fetches results.json into WORKDIR (it
# holds the lines, for the miss analysis after scoring; it is not copied into the research folder).
set -u
W=$1; STEP=$2; OPS=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd $OPS/../../../.. && pwd)
O9="python3 $ROOT/research/2026-10-24/judge-blind9/ops/ops9.py"
BR=$ROOT/research/2026-10-24/brief-review-blind/flashlite
PB=product/shared/safety/prompts/caller_crisis.risk100.txt
LO=flashlite-optoutdev-B; LB=flashlite-brief-review-blind
mkdir -p $W
case $STEP in
prep)
  BSHA=$(sha256sum $W/je10-bundle.tgz | cut -c1-64)
  timeout 600 $O9 put $W/je10-bundle.tgz vm10-je10-bundle.tgz
  sed -e "s/__BUNDLE_SHA256__/$BSHA/g" $OPS/prep10.sh > $W/vm10-prep.sh; bash -n $W/vm10-prep.sh || exit 4
  N=vm10-prep; echo "== $N start $(date -u +%H:%M:%S)"
  timeout 1300 $O9 run $N $W/vm10-prep.sh 1200 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
optout)
  [ -f $OPS/../RULE.md ] || { echo "STOP: no RULE.md"; exit 2; }
  grep -q "at least 141/150" $OPS/../RULE.md && grep -q "at most 17/110" $OPS/../RULE.md || { echo "STOP: RULE.md does not state the bounds"; exit 2; }
  [ -e $W/optout ] && { echo "STOP: $W/optout exists (already run from this workdir)"; exit 3; }
  timeout 120 $O9 get runlogs/vm10-$LO-report.json $W/optout-precheck.json | grep -q " 404 " || { echo "STOP: a report already exists in blob for $LO"; exit 3; }
  python3 $OPS/fill10.py $W/vm10-optout.sh "$LO|/tmp/je10|270|15|judge|1500|--task opt_out --source optout-dev --prompt-file $PB"
  bash -n $W/vm10-optout.sh || exit 4
  N=vm10-optout-b; echo "== $N ($LO) start $(date -u +%H:%M:%S)"
  timeout 2000 $O9 run $N $W/vm10-optout.sh 1800 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  mkdir -p $W/optout
  for f in report.json summary.md; do timeout 120 $O9 get runlogs/vm10-$LO-$f $W/optout/$f; done
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
brief)
  [ -e $W/brief ] && { echo "STOP: $W/brief exists (the blind set was already scored from this workdir)"; exit 3; }
  [ -e $BR/report.json ] && { echo "STOP: $BR/report.json exists (the blind set was already scored)"; exit 3; }
  timeout 120 $O9 get runlogs/vm10-$LB-report.json $W/brief-precheck.json | grep -q " 404 " || { echo "STOP: a report already exists in blob for $LB"; exit 3; }
  python3 $OPS/fill10.py $W/vm10-brief.sh "$LB|/tmp/je10|170|15|review|2700|--task brief-review --set product/shared/safety/sets/heldout-brief-review.json"
  bash -n $W/vm10-brief.sh || exit 4
  N=vm10-brief-blind; echo "== $N ($LB) start $(date -u +%H:%M:%S)"
  timeout 3200 $O9 run $N $W/vm10-brief.sh 3000 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  mkdir -p $W/brief
  for f in report.json summary.md results.json; do timeout 120 $O9 get runlogs/vm10-$LB-$f $W/brief/$f; done
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
final)
  JOB=$(cat $W/job-start.txt)
  sed -e "s/__JOB__/$JOB/g" -e "s#__OUTDIRS__#/tmp/judge-eval/$LO /tmp/judge-eval/$LB#" $OPS/final_health10.sh > $W/vm10-final.sh; bash -n $W/vm10-final.sh || exit 4
  N=vm10-final-health; echo "== $N start $(date -u +%H:%M:%S)"
  timeout 700 $O9 run $N $W/vm10-final.sh 600 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
*) echo "unknown step $STEP"; exit 2;;
esac
