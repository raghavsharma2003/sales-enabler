#!/bin/bash
# vm12 job driver (BLIND 11 crisis floor and judge, then BLIND-BR2 brief review), from the sandbox. Adapted from
# ../../judge-blind10/ops/drive11.sh. One step per call, one Run Command at a time, through
# ../../judge-blind9/ops/ops9.py (refuses while another Run Command is active; prunes by each record's own start time at
# 24 records). Google is never called from here: every model request runs on vl-vm-cin.
#   drive12.sh WORKDIR bundle        git archive of HEAD's product/ + package files (HEAD must be 9c16159, containing
#                                    7bcdc7c), plus BUNDLE_SHA and ops12/fetch_spy.mjs
#   drive12.sh WORKDIR prep          put the bundle in blob, then prep12.sh (no model traffic)
#   drive12.sh WORKDIR sign blind11|br2
#                                    records the PREREG's UTC time, mtime and sha256 (once; refuses a second signing)
#   drive12.sh WORKDIR blind11       BLIND 11 scored ONCE (refuses without a signed, unchanged PREREG, or a second time)
#   drive12.sh WORKDIR br2           BLIND-BR2 scored ONCE (also refuses before BLIND 11 has a report, or without the
#                                    no-model probe's PROBE OK)
#   drive12.sh WORKDIR final         final_health12.sh: health after, removes this job's VM copies
# An infrastructure failure (no complete report: VM, Vertex 5xx, network) may be re-run ONCE from scratch, by hand, with
# RERUN_INFRA=1 and the reason in WORKDIR/rerun-<step>.txt; the README must say so. Nothing is re-run for a score.
set -u
W=$1; STEP=$2; OPS=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd $OPS/../../../.. && pwd)
O9="python3 $ROOT/research/2026-10-24/judge-blind9/ops/ops9.py"
B11=$ROOT/research/2026-10-24/judge-blind11; BR2=$ROOT/research/2026-10-24/brief-review-blind2
HEAD_WANT=9c16159a1f6cd6b66245be3f6c4f26d2e3eaf9e7
A_SHA=c8b4789f49c8198e; BR_SHA=7165388451e36819
L11=flashlite-blind11-A-t05; LBR=flashlite-brief-review-blind2
mkdir -p $W
runone() {  # N LABEL SCRIPT TIMEOUT OUTDIR FILES
  local N=$1 L=$2 SC=$3 TO=$4 OUT=$5 FILES=$6
  echo "== $N ($L) start $(date -u +%H:%M:%S)"
  timeout $((TO + 300)) $O9 run $N $SC $TO > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  mkdir -p $OUT
  for f in $FILES; do timeout 120 $O9 get runlogs/vm12-$L-$f $OUT/$f; done
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)"; }
signed() {  # NAME PREREG: the PREREG must be signed and unchanged since
  local X=$1 P=$2
  [ -s $W/prereg-$X.stamp ] || { echo "STOP: $X PREREG not signed"; exit 2; }
  [ "$(sha256sum $P | cut -c1-64)" = "$(grep '^sha256 ' $W/prereg-$X.stamp | cut -d' ' -f2)" ] || { echo "STOP: $P changed since it was signed"; exit 2; }; }
once() {  # STEP LABEL RESEARCHDIR: refuse a second scoring unless an infra re-run is declared
  local S=$1 L=$2 R=$3
  if [ -e $W/done-$S ] || [ -e $R/report.json ]; then
    [ "${RERUN_INFRA:-0}" = 1 ] && [ -s $W/rerun-$S.txt ] && [ ! -e $W/rerun-$S.used ] && [ ! -e $R/report.json ] || { echo "STOP: $S already ran (no re-runs)"; exit 3; }
    touch $W/rerun-$S.used; echo "infra re-run of $S: $(cat $W/rerun-$S.txt)"
  else
    timeout 120 $O9 get runlogs/vm12-$L-report.json $W/$S-precheck.json | grep -q " 404 " || { echo "STOP: a report already exists in blob for $L"; exit 3; }
  fi; }
case $STEP in
bundle)
  [ -e $W/je12-bundle.tgz ] && { echo "bundle exists: $(sha256sum $W/je12-bundle.tgz | cut -c1-64)"; exit 0; }
  H=$(git -C $ROOT rev-parse HEAD); [ "$H" = $HEAD_WANT ] || { echo "STOP: worktree HEAD $H is not 9c16159"; exit 2; }
  git -C $ROOT merge-base --is-ancestor 7bcdc7c $H || { echo "STOP: HEAD does not contain 7bcdc7c"; exit 2; }
  rm -rf $W/bundle && mkdir -p $W/bundle/ops12 && git -C $ROOT archive $H product package.json package-lock.json | tar x -C $W/bundle && echo $H > $W/bundle/BUNDLE_SHA
  cp $BR2/ops/fetch_spy.mjs $W/bundle/ops12/
  tar czf $W/je12-bundle.tgz -C $W/bundle . && rm -rf $W/bundle
  echo "bundle $(du -h $W/je12-bundle.tgz | cut -f1) $(tar tzf $W/je12-bundle.tgz | grep -vc '/$') files sha256 $(sha256sum $W/je12-bundle.tgz | cut -c1-64)";;
prep)
  [ -e $W/done-prep ] && [ "${RERUN_INFRA:-0}" != 1 ] && { echo "STOP: prep already ran from this workdir"; exit 3; }
  [ -e $W/job-start.txt ] || date -u '+%Y-%m-%d %H:%M:%S' > $W/job-start.txt
  BSHA=$(sha256sum $W/je12-bundle.tgz | cut -c1-64)
  [ -e $W/done-prep ] || { timeout 120 $O9 get vm12-je12-bundle.tgz $W/bundle-precheck.tgz | grep -q " 404 " || { echo "STOP: blob vm12-je12-bundle.tgz exists"; exit 3; }; }
  timeout 600 $O9 put $W/je12-bundle.tgz vm12-je12-bundle.tgz
  sed -e "s/__BUNDLE_SHA256__/$BSHA/g" $OPS/prep12.sh > $W/vm12-prep.sh; bash -n $W/vm12-prep.sh || exit 4
  touch $W/done-prep; N=vm12-prep; echo "== $N start $(date -u +%H:%M:%S)"
  timeout 1300 $O9 run $N $W/vm12-prep.sh 1200 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
sign)
  X=$3; P=$([ "$X" = blind11 ] && echo $B11/PREREG.md || echo $BR2/PREREG.md)
  [ -s $P ] || { echo "STOP: no $P"; exit 2; }
  [ -e $W/prereg-$X.stamp ] && { echo "STOP: $X already signed: $(cat $W/prereg-$X.stamp | tr '\n' ' ')"; exit 3; }
  { echo "signed $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "mtime $(date -u -d @$(stat -c %Y $P) +%Y-%m-%dT%H:%M:%SZ)"; echo "sha256 $(sha256sum $P | cut -c1-64)"; } > $W/prereg-$X.stamp
  cat $W/prereg-$X.stamp;;
blind11)
  signed blind11 $B11/PREREG.md; [ -e $W/done-prep ] || { echo "STOP: prep has not run"; exit 2; }
  once blind11 $L11 $B11
  python3 $OPS/fill12.py $W/vm12-blind11.sh "$L11|/tmp/je12|230|10|1500|$A_SHA|judge|--task crisis --set product/shared/safety/sets/heldout-11.json"
  bash -n $W/vm12-blind11.sh || exit 4
  touch $W/done-blind11
  runone vm12-blind11 $L11 $W/vm12-blind11.sh 1800 $W/blind11 "report.json summary.md results.json";;
br2)
  signed br2 $BR2/PREREG.md; [ -e $W/done-prep ] || { echo "STOP: prep has not run"; exit 2; }
  [ -s $W/blind11/report.json ] || { echo "STOP: run order: BLIND 11 has no report yet"; exit 2; }
  grep -q '^PROBE OK' $W/probe-br2.out || { echo "STOP: the no-model probe did not pass"; exit 2; }
  once br2 $LBR $BR2
  python3 $OPS/fill12.py $W/vm12-br2.sh "$LBR|/tmp/je12|170|15|2700|$BR_SHA|review|--task brief-review --set product/shared/safety/sets/heldout-brief-review-2.json"
  bash -n $W/vm12-br2.sh || exit 4
  touch $W/done-br2
  runone vm12-br2 $LBR $W/vm12-br2.sh 3000 $W/br2 "report.json summary.md results.json spy.jsonl";;
final)
  JOB=$(cat $W/job-start.txt)
  sed -e "s/__JOB__/$JOB/g" $OPS/final_health12.sh > $W/vm12-final.sh; bash -n $W/vm12-final.sh || exit 4
  N=vm12-final-health; echo "== $N start $(date -u +%H:%M:%S)"
  timeout 700 $O9 run $N $W/vm12-final.sh 600 > $W/$N.out 2>&1
  timeout 120 $O9 get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)";;
*) echo "unknown step $STEP"; exit 2;;
esac
