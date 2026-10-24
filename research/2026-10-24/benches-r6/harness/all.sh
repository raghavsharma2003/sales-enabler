#!/bin/sh
# r6 copy of research/2026-10-24/benches-r5/harness/all.sh: the real-model runs, strictly one after another (never two
# benches at once). Changes from r5: paths, the ledger, global cap Rs 60 (guard; the same figure as r5), and the stages:
#   dev        - gpt-4.1-mini single on DEV, two passes per contract arm (current, and 95339a6's r5-short-objection,
#                r5-outcome-first, r5-moment-not-outcome): pass 1 of each arm, then pass 2 of each, each pass its own
#                process on a fresh DB. --model pins single (95339a6 made tiered the default for a workspace that never
#                chose). The winner is read against dev-select-rule.txt, written before the first request.
#   test <arm> - the DEV winner only: gpt-4.1-mini single, two TEST passes, then tiered once (mini then gpt-4.1,
#                threshold 0.6) with the same arm. A non-current arm runs through the harness copy zz-r6-analysis-bench.ts
#                (the product bench refuses an ablation on TEST; see dev-select-rule.txt and test-bench.diff).
# Per-run caps are r4's (analysis mini 9.4, tiered 18.8), each lowered to what remains of Rs 60 if less.
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r6
L=/dev/shm/bench-out-r6/logs; mkdir -p $L
GCAP=60
spent() { python3 -c "import json,os;p='$T/ledger.jsonl';print(round(sum(json.loads(l).get('inr',0) for l in open(p)),2) if os.path.exists(p) else 0)"; }
cap() { python3 -c "print(round(min($1, $GCAP - $(spent)), 2))"; }
MINI="--model lab-gpt41mini-in"
TIER="--model lab-gpt41mini-in --escalate-model lab-gpt41 --threshold 0.6"
echo "stage $1 $2 start $(date -u +%FT%TZ) spent=₹$(spent)"
case $1 in
dev)
  for p in p1 p2; do
    for arm in current r5-short-objection r5-outcome-first r5-moment-not-outcome; do
      sh $T/run.sh analysis lab-gpt41mini-in dev-gpt-4.1-mini.$arm-$p $(cap 9.4) --split dev $MINI --prompt-variant $arm > $L/analysis-dev-mini.$arm-$p.log 2>&1
      echo "analysis-dev-mini.$arm-$p exit=$? spent=₹$(spent) $(date -u +%T)"
    done
  done ;;
test)
  ARM=$2; [ -n "$ARM" ] || { echo "usage: all.sh test <arm>"; exit 1; }
  if [ "$ARM" != current ]; then
    [ -f /dev/shm/wt-bench6/product/scripts/zz-r6-analysis-bench.ts ] || { echo "no harness copy for a non-current arm"; exit 1; }
    export BENCH_SCRIPT=zz-r6-analysis-bench.ts BENCH_R6_TEST_ARM=$ARM
  fi
  for p in p1 p2; do
    sh $T/run.sh analysis lab-gpt41mini-in gpt-4.1-mini.$ARM-$p $(cap 9.4) --split test $MINI --prompt-variant $ARM > $L/analysis-mini.$ARM-$p.log 2>&1
    echo "analysis-mini.$ARM-$p exit=$? spent=₹$(spent) $(date -u +%T)"
  done
  sh $T/run.sh analysis tiered tiered.$ARM-p1 $(cap 18.8) --split test $TIER --prompt-variant $ARM > $L/analysis-tiered.$ARM-p1.log 2>&1
  echo "analysis-tiered.$ARM-p1 exit=$? spent=₹$(spent) $(date -u +%T)" ;;
*) echo "usage: all.sh dev | test <arm>"; exit 1 ;;
esac
echo "stage $1 $2 done $(date -u +%FT%TZ)"
