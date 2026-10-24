#!/bin/sh
# r5 copy of research/2026-10-24/benches-r4/harness/all.sh: the real-model runs, strictly one after another (never two
# benches at once). Changes from r4: paths, the ledger, global cap ₹60 (guard; r4 had ₹220), and the stages of an
# analysis-only round:
#   dev  — gpt-4.1-mini on DEV, one pass per contract arm of 2cdf64b's --prompt-variant: current (the product) first,
#          then the ablations r4-table (b1a80cf exactly), r3-stance (bfa7ee7's outcome sentence), no-outcome-rules.
#          The stop rule (dev-stop-rule.txt) is read on the current arm before any TEST spend.
#   test — two TEST passes each of gpt-4.1-mini single and tiered (mini then gpt-4.1, threshold 0.6), interleaved
#          (p1 of each, then p2 of each), on the current contract.
#   ref  — gpt-4.1 single, two TEST passes, the reference only: a pass starts only if what remains of ₹60 covers it
#          (₹13: r4's dearest pass ₹11.31 plus 15%).
# Per-run caps are r4's (analysis mini 9.4, gpt-4.1 31.3, tiered 18.8), each lowered to what remains of ₹60 if less.
# No operator stage.
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r5
L=/dev/shm/bench-out-r5/logs; mkdir -p $L
GCAP=60
spent() { python3 -c "import json,os;p='$T/ledger.jsonl';print(round(sum(json.loads(l).get('inr',0) for l in open(p)),2) if os.path.exists(p) else 0)"; }
cap() { python3 -c "print(round(min($1, $GCAP - $(spent)), 2))"; }
TIER="--model lab-gpt41mini-in --escalate-model lab-gpt41 --threshold 0.6"
echo "stage $1 start $(date -u +%FT%TZ) spent=₹$(spent)"
case $1 in
dev)
  sh $T/run.sh analysis lab-gpt41mini-in dev-gpt-4.1-mini $(cap 9.4) --split dev --prompt-variant current > $L/analysis-dev-mini.log 2>&1
  echo "analysis-dev-mini (current) exit=$? spent=₹$(spent) $(date -u +%T)"
  for arm in r4-table r3-stance no-outcome-rules; do
    sh $T/run.sh analysis lab-gpt41mini-in dev-gpt-4.1-mini.$arm $(cap 9.4) --split dev --prompt-variant $arm > $L/analysis-dev-mini.$arm.log 2>&1
    echo "analysis-dev-mini.$arm exit=$? spent=₹$(spent) $(date -u +%T)"
  done ;;
test)
  for p in p1 p2; do
    sh $T/run.sh analysis lab-gpt41mini-in gpt-4.1-mini-$p $(cap 9.4) --split test > $L/analysis-mini-$p.log 2>&1; echo "analysis-mini-$p exit=$? spent=₹$(spent) $(date -u +%T)"
    sh $T/run.sh analysis tiered tiered-$p $(cap 18.8) --split test $TIER       > $L/analysis-tiered-$p.log 2>&1; echo "analysis-tiered-$p exit=$? spent=₹$(spent) $(date -u +%T)"
  done ;;
ref)
  for p in p1 p2; do
    left=$(python3 -c "print(round($GCAP - $(spent), 2))")
    if python3 -c "import sys; sys.exit(0 if $left >= 13 else 1)"; then
      sh $T/run.sh analysis lab-gpt41 gpt-4.1-$p $(cap 31.3) --split test > $L/analysis-41-$p.log 2>&1; echo "analysis-41-$p exit=$? spent=₹$(spent) $(date -u +%T)"
    else
      echo "analysis-41-$p skipped: ₹$left left of ₹$GCAP, under ₹13"
    fi
  done ;;
*) echo "usage: all.sh dev|test|ref"; exit 1 ;;
esac
echo "stage $1 done $(date -u +%FT%TZ)"
