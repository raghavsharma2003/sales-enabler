#!/bin/bash
# vm11 job driver (PREREG-10), from the sandbox. Adapted from ../../judge-optout-b/ops/drive10.sh and
# ../../judge-blind9/ops/drive_j9blind.sh. One step per call, one Run Command at a time, through
# ../../judge-blind9/ops/ops9.py (refuses while another Run Command is active; prunes by each record's own start time at
# 24 records). Google is never called from here: every model request runs on vl-vm-cin.
#   drive11.sh WORKDIR bundle           git archive of the worktree's product/ + package files at HEAD, plus BUNDLE_SHA
#   drive11.sh WORKDIR prep             put the bundle in blob, then prep11.sh (no model traffic)
#   drive11.sh WORKDIR a-crisis|c-crisis|a-optout|c-optout
#                                       the four DEV runs, in that order (each refuses unless the one before it has a
#                                       report, and refuses a second time: no re-runs)
#   drive11.sh WORKDIR apply            prereg_apply10.py on the four DEV reports (no model calls)
#   drive11.sh WORKDIR blind CAND T     BLIND 10, scored ONCE (refuses without a CHOICE.md naming CAND at T, or a second time)
#   drive11.sh WORKDIR final            final_health11.sh: health after, removes this job's VM copies
# An infrastructure failure (no complete report: VM, Vertex 5xx, network) may be resumed or re-run ONCE, by hand, with
# RERUN_INFRA=1 and the reason in WORKDIR/rerun-<step>.txt; the README must say so. Nothing is re-run for a score.
set -u
W=$1; STEP=$2; OPS=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd $OPS/../../../.. && pwd)
O9="python3 $ROOT/research/2026-10-24/judge-blind9/ops/ops9.py"
P10=$ROOT/research/2026-10-24/judge-prereg10; DEV=$P10/dev; BL=$ROOT/research/2026-10-24/judge-blind10
DLK=product/shared/safety/sets/dev-lookalike-9.json; PC=product/shared/safety/prompts/caller_crisis.c.txt
A_SHA=c8b4789f49c8198e; C_SHA=c97392ae76abeec2
mkdir -p $W
runone() {  # N LABEL SCRIPT TIMEOUT [results]
  local N=$1 L=$2 SC=$3 TO=$4 OUT=$5
  echo "== $N ($L) start $(date -u +%H:%M:%S)"
  timeout $((TO + 300)) $O9 run $N $SC $TO > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  mkdir -p $OUT
  for f in report.json summary.md ${6:-}; do timeout 120 $O9 get runlogs/vm11-$L-$f $OUT/$f; done
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)"; }
dev() {  # STEP LABEL PREV_LABEL MAXREQ MAXCOST ARGS
  local S=$1 L=$2 PREV=$3 MAXREQ=$4 MAXCOST=$5 ARGS=$6
  [ -f $P10/PREREG.md ] && grep -q "Signed by the integrator at 2026-10-24T05:48:26Z" $P10/PREREG.md || { echo "STOP: no signed PREREG.md"; exit 2; }
  [ -z "$PREV" ] || [ -f $DEV/$PREV/report.json ] || { echo "STOP: run order: $PREV has no report yet"; exit 2; }
  if [ -e $DEV/$L/report.json ] || [ -e $W/done-$S ]; then
    [ "${RERUN_INFRA:-0}" = 1 ] && [ -s $W/rerun-$S.txt ] && [ ! -e $W/rerun-$S.used ] || { echo "STOP: $L already ran (no re-runs)"; exit 3; }
    touch $W/rerun-$S.used; echo "infra re-run of $S: $(cat $W/rerun-$S.txt)"
  else
    timeout 120 $O9 get runlogs/vm11-$L-report.json $W/$S-precheck.json | grep -q " 404 " || { echo "STOP: a report already exists in blob for $L"; exit 3; }
  fi
  python3 $OPS/fill11.py $W/vm11-$S.sh "$L|/tmp/je11|$MAXREQ|$MAXCOST|1500|$A_SHA|$ARGS"; bash -n $W/vm11-$S.sh || exit 4
  touch $W/done-$S
  runone vm11-dev-$S $L $W/vm11-$S.sh 1800 $DEV/$L; }
case $STEP in
bundle)
  [ -e $W/je11-bundle.tgz ] && { echo "bundle exists: $(sha256sum $W/je11-bundle.tgz | cut -c1-64)"; exit 0; }
  H=$(git -C $ROOT rev-parse HEAD); [ "$H" = 0e77e47dc0a71efdaca0c8a279d34f22ad0a32e7 ] || { echo "STOP: worktree HEAD $H is not 0e77e47"; exit 2; }
  git -C $ROOT diff --quiet 05a03ad48261ac4266398f1e55befe27ec7f7bc1 $H -- product package.json package-lock.json || { echo "STOP: product/ differs from 05a03ad"; exit 2; }
  rm -rf $W/bundle && mkdir -p $W/bundle && git -C $ROOT archive $H product package.json package-lock.json | tar x -C $W/bundle && echo $H > $W/bundle/BUNDLE_SHA
  tar czf $W/je11-bundle.tgz -C $W/bundle . && rm -rf $W/bundle
  echo "bundle $(du -h $W/je11-bundle.tgz | cut -f1) sha256 $(sha256sum $W/je11-bundle.tgz | cut -c1-64)";;
prep)
  [ -e $W/done-prep ] && { echo "STOP: prep already ran from this workdir"; exit 3; }
  date -u '+%Y-%m-%d %H:%M:%S' > $W/job-start.txt
  BSHA=$(sha256sum $W/je11-bundle.tgz | cut -c1-64)
  timeout 600 $O9 put $W/je11-bundle.tgz vm11-je11-bundle.tgz
  sed -e "s/__BUNDLE_SHA256__/$BSHA/g" $OPS/prep11.sh > $W/vm11-prep.sh; bash -n $W/vm11-prep.sh || exit 4
  touch $W/done-prep; N=vm11-prep; echo "== $N start $(date -u +%H:%M:%S)"
  timeout 1300 $O9 run $N $W/vm11-prep.sh 1200 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
a-crisis) dev a-crisis flashlite-dev-A-crisis "" 425 15 "--task crisis --source dev-7 --set $DLK";;
c-crisis) dev c-crisis flashlite-dev-C-crisis flashlite-dev-A-crisis 425 15 "--task crisis --source dev-7 --set $DLK --prompt-file $PC";;
a-optout) dev a-optout flashlite-optoutdev-A flashlite-dev-C-crisis 270 10 "--task opt_out --source optout-dev";;
c-optout) dev c-optout flashlite-optoutdev-C flashlite-optoutdev-A 270 10 "--task opt_out --source optout-dev --prompt-file $PC";;
apply)
  python3 $OPS/prereg_apply10.py $DEV/flashlite-dev-A-crisis/report.json $DEV/flashlite-dev-C-crisis/report.json \
    $DEV/flashlite-optoutdev-A/report.json $DEV/flashlite-optoutdev-C/report.json | tee $DEV/prereg_apply10.out;;
blind)
  CAND=$3; T=$4; CH=$P10/CHOICE.md
  [ -f $CH ] || { echo "STOP: no CHOICE.md"; exit 2; }
  grep -q "^CHOSEN: candidate $CAND at threshold $T " $CH || { echo "STOP: CHOICE.md does not name candidate $CAND at threshold $T"; exit 2; }
  grep -q "^CHOSEN: candidate $CAND at threshold $T " $DEV/prereg_apply10.out || { echo "STOP: prereg_apply10.out does not name candidate $CAND at threshold $T"; exit 2; }
  LABEL=flashlite-blind10-$CAND-t$(echo $T | tr -d .)
  [ -e $W/done-blind ] && { echo "STOP: BLIND 10 was already scored from this workdir"; exit 3; }
  [ -e $BL/report.json ] && { echo "STOP: $BL/report.json exists (BLIND 10 was already scored)"; exit 3; }
  timeout 120 $O9 get runlogs/vm11-$LABEL-report.json $W/blind-precheck.json | grep -q " 404 " || { echo "STOP: a BLIND 10 report already exists in blob for $LABEL"; exit 3; }
  BW="--task crisis --set product/shared/safety/sets/heldout-10.json"
  if [ "$CAND $T" = "A 0.5" ]; then
    # A at judge.json's own 0.5 is the contract itself: BLIND 10 runs on /tmp/je11, whose judge.json is byte-identical to
    # the committed file (the template's integrity check asserts 1d467ad8ee1ad73e and prompt A's hash). Nothing is edited.
    python3 $OPS/fill11.py $W/vm11-blind.sh "$LABEL|/tmp/je11|210|9|1500|$A_SHA|$BW"
  else
    PSHA=$([ $CAND = C ] && echo $C_SHA || echo $A_SHA)
    sed -e "s/__THRESH__/$T/g" -e "s/__CAND__/$CAND/" $OPS/mk_je11t.sh > $W/vm11-blind-part1.sh
    python3 $OPS/fill11.py $W/vm11-blind-part2.sh "$LABEL|/tmp/je11t|210|9|1500|$PSHA|$BW"
    cat $W/vm11-blind-part1.sh $W/vm11-blind-part2.sh > $W/vm11-blind.sh
  fi
  bash -n $W/vm11-blind.sh || exit 4
  touch $W/done-blind
  runone vm11-blind10 $LABEL $W/vm11-blind.sh 1800 $W/blind results.json;;
final)
  JOB=$(cat $W/job-start.txt)
  sed -e "s/__JOB__/$JOB/g" -e "s#__OUTDIRS__#/tmp/judge-eval/flashlite-dev-A-crisis /tmp/judge-eval/flashlite-dev-C-crisis /tmp/judge-eval/flashlite-optoutdev-A /tmp/judge-eval/flashlite-optoutdev-C /tmp/judge-eval/flashlite-blind10-*#" \
    $OPS/final_health11.sh > $W/vm11-final.sh; bash -n $W/vm11-final.sh || exit 4
  N=vm11-final-health; echo "== $N start $(date -u +%H:%M:%S)"
  timeout 700 $O9 run $N $W/vm11-final.sh 600 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
*) echo "unknown step $STEP"; exit 2;;
esac
