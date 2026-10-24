#!/bin/sh
# r3: the real-model runs, strictly one after another (never two benches at once). Global cap ₹250 (guard).
# all.sh <dev|test|operator>: one stage per invocation, so the DEV result can be read before any TEST spend.
# Per-run caps are round 2's caps × 250/400 (round 2's ratios): analysis mini 15 → 9.4, gpt-4.1 50 → 31.3,
# tiered 30 → 18.8, operator mini 70 → 43.8, operator gpt-4.1 250 → 156.3. Two TEST passes per design, interleaved
# (p1 of each design, then p2 of each).
# As run on 2026-10-23: `dev`, then `test`, then the two `operator` lines one at a time (the same run.sh commands and
# caps), so mini's token use could be checked before the gpt-4.1 run.
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r3
L=/dev/shm/bench-out-r3/logs; mkdir -p $L
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
  sh $T/run.sh operator lab-gpt41mini-in gpt-4.1-mini 43.8 > $L/operator-mini.log 2>&1; echo "operator-mini exit=$? spent=₹$(spent) $(date -u +%T)"
  sh $T/run.sh operator lab-gpt41 gpt-4.1 ${OP41_CAP:-156.3} > $L/operator-41.log 2>&1;  echo "operator-41 exit=$? spent=₹$(spent) $(date -u +%T)" ;;
*) echo "usage: all.sh dev|test|operator"; exit 1 ;;
esac
echo "stage $1 done $(date -u +%FT%TZ)"
