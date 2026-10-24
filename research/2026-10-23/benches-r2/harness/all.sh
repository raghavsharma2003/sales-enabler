#!/bin/sh
# r2: the five real-model runs, strictly one after another (never two benches at once). Global cap ₹400 (guard).
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r2
L=/dev/shm/bench-out-r2/logs; mkdir -p $L
spent() { python3 -c "import json;print(round(sum(json.loads(l).get('inr',0) for l in open('$T/ledger.jsonl')),2))"; }
echo "start $(date -u +%FT%TZ) spent=₹$(spent)"
sh $T/run.sh analysis lab-gpt41mini-in gpt-4.1-mini 15 --split test > $L/analysis-mini.log 2>&1; echo "analysis-mini exit=$? spent=₹$(spent) $(date -u +%T)"
sh $T/run.sh analysis lab-gpt41 gpt-4.1 50 --split test         > $L/analysis-41.log 2>&1;   echo "analysis-41 exit=$? spent=₹$(spent) $(date -u +%T)"
sh $T/run.sh analysis tiered tiered 30 --split test --model lab-gpt41mini-in --escalate-model lab-gpt41 --threshold 0.6 > $L/analysis-tiered.log 2>&1; echo "analysis-tiered exit=$? spent=₹$(spent) $(date -u +%T)"
sh $T/run.sh operator lab-gpt41mini-in gpt-4.1-mini 70          > $L/operator-mini.log 2>&1; echo "operator-mini exit=$? spent=₹$(spent) $(date -u +%T)"
sh $T/run.sh operator lab-gpt41 gpt-4.1 250                     > $L/operator-41.log 2>&1;   echo "operator-41 exit=$? spent=₹$(spent) $(date -u +%T)"
echo "done $(date -u +%FT%TZ)"
