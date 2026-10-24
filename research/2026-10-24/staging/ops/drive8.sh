#!/bin/bash
# Stage 8 job driver (2026-10-24: staging test build at 9b34ff7), from the sandbox. One step per call, one Run Command at a
# time, through ops8.py (ops9.py's guard: refuses while another Run Command is active). Every request to :8443 and to a
# model runs on vl-vm-cin inside a Run Command; the sandbox reaches only ARM and blob.
#   drive8.sh WORKDIR preflight   preflight8.sh (read-only)                                  -> WORKDIR/preflight.out
#   drive8.sh WORKDIR bundle      git archive at 9b34ff7 (6b0d859's recipe) + BUNDLE_SHA      -> WORKDIR/vp-stage-bundle.tgz
#   drive8.sh WORKDIR deploy      put the bundle; ONE Run Command of deploy_pre.sh + ../../2026-10-23/staging/ops/
#                                 stage_setup.sh (verbatim) + deploy_post.sh + deploy_post7.sh (byte-identical to the
#                                 script 6b0d859's deploy sent; the tools archive in blob is reused unchanged)
#   drive8.sh WORKDIR credit      credit8.sh: money_config.trial_credit_inr_milli = 5,000,000 on vp_stage only
#   drive8.sh WORKDIR kit         smoke8.py + owner8.py -> blob vps8-kit.tgz
#   drive8.sh WORKDIR smoke       smoke8.sh (guards, smoke8.py, spend, journal); fetches smoke8.json
#   drive8.sh WORKDIR owner       owner8.sh with OPS8_OWNER=1 (the owner's login as protected parameters); refuses
#                                 unless the smoke ran; fetches owner8.json
#   drive8.sh WORKDIR judgelat    judgelat8.sh; fetches report.json and summary.md into research/2026-10-24/judge-latency
#   drive8.sh WORKDIR smoke8b WS CALL   smoke8b.sh: the :8443 checks and a read-only DB read-back of the smoke workspace
#                                 (run once on 2026-10-24 because smoke8.py stopped before them; see testbuild-9b34ff7.md)
#   drive8.sh WORKDIR final WS OWS CALL   final8.sh: health, spend and the workspaces left, read-only
# On 2026-10-24 preflight, deploy, credit, smoke8b and final were sent by hand with exactly these commands (and the
# read-only preflight8.sh once more after the deploy, as vps8-envcheck-after).
set -u
W=$1; STEP=$2; OPS=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd $OPS/../../../.. && pwd)
O8="python3 $OPS/ops8.py"; SHA=9b34ff78930d5fc77e846b540d4c87dfdb47d313
mkdir -p $W
run() {  # NAME SCRIPT TIMEOUT
  echo "== $1 start $(date -u +%H:%M:%S)"
  timeout $(($3 + 300)) $O8 run $1 $2 $3 > $W/$1.out 2>&1
  timeout 120 $O8 get runlogs/$1.out $W/$1.full.out > /dev/null 2>&1
  echo "== $1 $(grep -m1 STATE $W/$1.out) $(date -u +%H:%M:%S)"; }
case $STEP in
preflight)
  [ -e $W/job-start.txt ] || date -u '+%Y-%m-%d %H:%M:%S' > $W/job-start.txt
  run vps8-preflight $OPS/preflight8.sh 300;;
bundle)
  [ "$(git -C $ROOT rev-parse HEAD)" = $SHA ] || { echo "STOP: worktree is not at $SHA"; exit 2; }
  git -C $ROOT archive --format=tar $SHA product package.json package-lock.json voicelab/server/models/silero_vad.onnx \
    research/2026-10-18/lanes/g5-gemini-paid/harness/audio_phone16k > $W/bundle.tar
  mkdir -p $W/bs && echo ${SHA:0:7} > $W/bs/BUNDLE_SHA && tar rf $W/bundle.tar -C $W/bs BUNDLE_SHA
  gzip -n -9 -c $W/bundle.tar > $W/vp-stage-bundle.tgz && rm -f $W/bundle.tar
  echo "bundle $(du -h $W/vp-stage-bundle.tgz | cut -f1) $(tar tzf $W/vp-stage-bundle.tgz | grep -vc '/$') files sha256_16 $(sha256sum $W/vp-stage-bundle.tgz | cut -c1-16)";;
deploy)
  cat $OPS/deploy_pre.sh $ROOT/research/2026-10-23/staging/ops/stage_setup.sh $OPS/deploy_post.sh $OPS/deploy_post7.sh > $W/deploy8.sh
  bash -n $W/deploy8.sh || exit 4
  timeout 600 $O8 put $W/vp-stage-bundle.tgz vp-stage-bundle.tgz
  run vps8-deploy-9b34ff7 $W/deploy8.sh 1800;;
credit)
  run vps8-credit $OPS/credit8.sh 300;;
kit)
  rm -rf $W/kit && mkdir -p $W/kit && cp $OPS/smoke8.py $OPS/owner8.py $W/kit/ && tar czf $W/vps8-kit.tgz -C $W/kit . && rm -rf $W/kit
  timeout 120 $O8 put $W/vps8-kit.tgz vps8-kit.tgz
  echo "kit sha256 $(sha256sum $W/vps8-kit.tgz | cut -c1-64)";;
smoke)
  [ -e $W/done-smoke ] && { echo "STOP: the smoke already ran from this workdir (one smoke workspace only)"; exit 3; }
  sed -e "s/__KIT_SHA__/$(sha256sum $W/vps8-kit.tgz | cut -c1-64)/" -e "s/__JOB__/$(cat $W/job-start.txt)/" $OPS/smoke8.sh > $W/vps8-smoke.sh; bash -n $W/vps8-smoke.sh || exit 4
  touch $W/done-smoke
  run vps8-smoke $W/vps8-smoke.sh 1800
  timeout 120 $O8 get runlogs/vps8-smoke8.json $W/smoke8.json;;
owner)
  [ -s $W/smoke8.json ] || { echo "STOP: the smoke has not run"; exit 2; }
  [ -e $W/done-owner ] && { echo "STOP: the owner's account step already ran"; exit 3; }
  sed -e "s/__KIT_SHA__/$(sha256sum $W/vps8-kit.tgz | cut -c1-64)/" $OPS/owner8.sh > $W/vps8-owner.sh; bash -n $W/vps8-owner.sh || exit 4
  touch $W/done-owner
  export OPS8_OWNER=1; run vps8-owner $W/vps8-owner.sh 600; unset OPS8_OWNER
  timeout 120 $O8 get runlogs/vps8-owner8.json $W/owner8.json;;
judgelat)
  [ -s $W/owner8.json ] || { echo "STOP: run order: the owner's account step first"; exit 2; }
  [ -e $W/done-judgelat ] && { echo "STOP: the judge-latency run already ran"; exit 3; }
  sed -e "s/__JOB__/$(cat $W/job-start.txt)/" $OPS/judgelat8.sh > $W/vps8-judgelat.sh; bash -n $W/vps8-judgelat.sh || exit 4
  touch $W/done-judgelat
  run vps8-judgelat $W/vps8-judgelat.sh 1800
  mkdir -p $ROOT/research/2026-10-24/judge-latency
  for f in report.json summary.md; do timeout 120 $O8 get runlogs/vps8-judgelat-$f $ROOT/research/2026-10-24/judge-latency/$f; done;;
smoke8b)
  sed -e "s/__WS__/$3/g" -e "s/__CALL__/$4/g" $OPS/smoke8b.sh > $W/vps8-smoke8b.sh; bash -n $W/vps8-smoke8b.sh || exit 4
  run vps8-smoke8b $W/vps8-smoke8b.sh 300;;
final)
  sed -e "s/__JOB__/$(cat $W/job-start.txt)/" -e "s/__WS__/$3/" -e "s/__OWS__/$4/" -e "s/__CALL__/$5/" $OPS/final8.sh > $W/vps8-final.sh; bash -n $W/vps8-final.sh || exit 4
  run vps8-final-health $W/vps8-final.sh 300;;
*) echo "unknown step $STEP"; exit 2;;
esac
