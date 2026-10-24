#!/bin/sh
# r7 copy of research/2026-10-24/benches-r6/harness/all.sh: the real-model runs, strictly one after another (never two
# benches at once). Changes from r6: paths, the ledger, global cap Rs 40 (guard), one run per invocation, and the runs:
#   the shipped contract (prompt variant current, which 6245d4e made r6's r5-outcome-first; the byte-identity gate
#          passes on this tree), TEST split, two passes per arm, interleaved as round 5 ran them so that each pass pair
#          sits close in time: mini p1, tiered p1, mini p2, tiered p2. Each pass is its own process on a fresh DB.
#          mini   = --model <gpt-4.1-mini> (pins single; tiered is the product default for a workspace that never chose)
#          tiered = --model <gpt-4.1-mini> --escalate-model <gpt-4.1> --threshold 0.6
#          The product bench runs current on TEST unchanged: no harness copy of the bench (BENCH_SCRIPT unset).
# Per-run caps are r4's (analysis mini 9.4, tiered 18.8), each lowered to what remains of Rs 40 if less.
# The selection rule is rule.txt, written before the first request.
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r7
L=/dev/shm/bench-out-r7/logs; mkdir -p $L
GCAP=40
spent() { python3 -c "import json,os;p='$T/ledger.jsonl';print(round(sum(json.loads(l).get('inr',0) for l in open(p)),2) if os.path.exists(p) else 0)"; }
cap() { python3 -c "print(round(min($1, $GCAP - $(spent)), 2))"; }
busy() { ps -eo args | grep -E 'azure-guard\.mjs|(analysis|operator)-bench\.ts' | grep -v grep | grep -c . ; }
MINI="--model lab-gpt41mini-in"
TIER="--model lab-gpt41mini-in --escalate-model lab-gpt41 --threshold 0.6"
ARM=current
# Usage: all.sh <mini|tiered> <p1|p2>, one run per invocation, called in the order mini p1, tiered p1, mini p2, tiered p2.
D=$1; p=$2
case "$D:$p" in mini:p1|mini:p2|tiered:p1|tiered:p2) ;; *) echo "usage: all.sh <mini|tiered> <p1|p2>"; exit 1 ;; esac
[ "$(busy)" = 0 ] || { echo "another bench is running on this machine: not starting $D $p"; exit 1; }
echo "run $D.$ARM-$p start $(date -u +%FT%TZ) spent=₹$(spent)"
if [ "$D" = mini ]; then
  sh $T/run.sh analysis lab-gpt41mini-in gpt-4.1-mini.$ARM-$p $(cap 9.4) --split test $MINI --prompt-variant $ARM > $L/analysis-mini.$ARM-$p.log 2>&1
  echo "analysis-mini.$ARM-$p exit=$? spent=₹$(spent) $(date -u +%T)"
else
  sh $T/run.sh analysis tiered tiered.$ARM-$p $(cap 18.8) --split test $TIER --prompt-variant $ARM > $L/analysis-tiered.$ARM-$p.log 2>&1
  echo "analysis-tiered.$ARM-$p exit=$? spent=₹$(spent) $(date -u +%T)"
fi
