#!/bin/sh
# r4 copy of research/2026-10-23/benches-r3/harness/all.sh: the real-model runs, strictly one after another (never two
# benches at once). Global cap ₹220 (guard; round 3 had ₹250). all.sh <dev|test|operator>: one stage per invocation, so
# the DEV result can be read before any TEST spend. Per-run caps are round 3's (analysis mini 9.4, gpt-4.1 31.3, tiered
# 18.8, operator mini 43.8, lowered to what remains of ₹220 if less), except the operator gpt-4.1 cap: by default it is whatever remains of the ₹220 when that run
# starts, and that run goes first. The bench stops starting tasks once its spend plus a worst-case task (₹52.9 at gpt-4.1
# rates) would pass its cap. At a fixed cap of ₹156.3, a gpt-4.1 run 10% dearer than round 3 would have lost its last
# tasks. Two TEST passes per design, interleaved (p1 of each design, then p2 of each).
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r4
L=/dev/shm/bench-out-r4/logs; mkdir -p $L
spent() { python3 -c "import json;print(round(sum(json.loads(l).get('inr',0) for l in open('$T/ledger.jsonl')),2))"; }
TIER="--model lab-gpt41mini-in --escalate-model lab-gpt41 --threshold 0.6"
echo "stage $1 start $(date -u +%FT%TZ) spent=₹$(spent)"
case $1 in
dev)
  sh $T/run.sh analysis lab-gpt41mini-in dev-gpt-4.1-mini 9.4 --split dev > $L/analysis-dev-mini.log 2>&1; echo "analysis-dev-mini exit=$? spent=₹$(spent) $(date -u +%T)" ;;
test)
  for p in p1 p2; do
    sh $T/run.sh analysis lab-gpt41mini-in gpt-4.1-mini-$p 9.4 --split test > $L/analysis-mini-$p.log 2>&1; echo "analysis-mini-$p exit=$? spent=₹$(spent) $(date -u +%T)"
    sh $T/run.sh analysis lab-gpt41 gpt-4.1-$p 31.3 --split test           > $L/analysis-41-$p.log 2>&1;   echo "analysis-41-$p exit=$? spent=₹$(spent) $(date -u +%T)"
    sh $T/run.sh analysis tiered tiered-$p 18.8 --split test $TIER         > $L/analysis-tiered-$p.log 2>&1; echo "analysis-tiered-$p exit=$? spent=₹$(spent) $(date -u +%T)"
  done ;;
operator)
  CAP41=${OP41_CAP:-$(python3 -c "print(round(220 - $(spent), 1))")}; echo "operator-41 cap=₹$CAP41"
  sh $T/run.sh operator lab-gpt41 gpt-4.1 $CAP41 > $L/operator-41.log 2>&1;  echo "operator-41 exit=$? spent=₹$(spent) $(date -u +%T)"
  CAPM=$(python3 -c "print(round(min(43.8, 220 - $(spent)), 1))"); echo "operator-mini cap=₹$CAPM"
  sh $T/run.sh operator lab-gpt41mini-in gpt-4.1-mini $CAPM > $L/operator-mini.log 2>&1; echo "operator-mini exit=$? spent=₹$(spent) $(date -u +%T)" ;;
*) echo "usage: all.sh dev|test|operator"; exit 1 ;;
esac
echo "stage $1 done $(date -u +%FT%TZ)"
