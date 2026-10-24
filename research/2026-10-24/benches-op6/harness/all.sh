#!/bin/sh
# op6 copy of the op5 harness all.sh. Changes from op5: paths; caps Rs 110 per gpt-4.1 run and Rs 35 per mini run (the op6
# brief), global cap Rs 300; STOP_MARGIN=18 on the gpt-4.1 runs (op5's default 25 never bound under op5's Rs 150 cap, but
# under Rs 110 it would stop starting tasks at Rs 85 bench-priced, below op5's own full-run Rs 88.7-91.5; 18 = the
# unpriced overhead op5 measured (<= Rs 8.6) + op5's dearest task (Rs 6.6) + one request's worst case (~Rs 2.2)).
# The gpt-4.1 r2 cap keeps op5's mini reserve (it cannot bind: 110 + 35 + 110 + 35 = 290 <= 300). Below: op5's header.
# op5 copy of the r4 harness all.sh: the Operator bench only, two runs per model, strictly one after another (never two
# benches at once), at most 1 request a second. Global cap Rs 280 (guard). all.sh <pair1|pair2>: one stage per
# invocation, so pair 1's spend is read before pair 2's caps are set.
#   pair1: gpt-4.1 run 1 (cap Rs 150 hard, or OP41_CAP), then gpt-4.1-mini run 1 (cap min(43.8, what remains)).
#   pair2: gpt-4.1 run 2 with a cap of what remains minus a reserve for mini run 2 (1.25 x mini run 1's ledger spend,
#          at least Rs 30), so the mini run is never left without budget (runs stay paired); then gpt-4.1-mini run 2
#          (cap min(43.8, what remains)).
# Caps are hard per request (azure-guard.mjs); the bench stops starting tasks STOP_MARGIN before the cap (run.sh).
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op6
L=/dev/shm/bench-out-op6/logs; mkdir -p $L
spent() { python3 -c "import json,os;p='$T/ledger.jsonl';print(round(sum(json.loads(l).get('inr',0) for l in open(p)) if os.path.exists(p) else 0,2))"; }
runspent() { python3 -c "import json,os;p='$T/ledger.jsonl';print(round(sum(json.loads(l).get('inr',0) for l in open(p) if json.loads(l)['run']=='$1') if os.path.exists(p) else 0,2))"; }
echo "stage $1 start $(date -u +%FT%TZ) spent=₹$(spent)"
case $1 in
pair1)
  CAP41=${OP41_CAP:-110}; echo "operator-gpt-4.1-r1 cap=₹$CAP41"
  STOP_MARGIN=18 sh $T/run.sh operator lab-gpt41 gpt-4.1-r1 $CAP41 > $L/operator-41-r1.log 2>&1;  echo "operator-41-r1 exit=$? spent=₹$(spent) $(date -u +%T)"
  CAPM=$(python3 -c "print(round(min(35, 300 - $(spent)), 1))"); echo "operator-gpt-4.1-mini-r1 cap=₹$CAPM"
  sh $T/run.sh operator lab-gpt41mini-in gpt-4.1-mini-r1 $CAPM > $L/operator-mini-r1.log 2>&1; echo "operator-mini-r1 exit=$? spent=₹$(spent) $(date -u +%T)" ;;
pair2)
  RES=$(python3 -c "print(round(max(30, 1.25 * $(runspent operator-gpt-4.1-mini-r1)), 1))")
  CAP41=${OP41_CAP:-$(python3 -c "print(round(min(110, 300 - $(spent) - $RES), 1))")}; echo "operator-gpt-4.1-r2 cap=₹$CAP41 (mini reserve ₹$RES)"
  STOP_MARGIN=18 sh $T/run.sh operator lab-gpt41 gpt-4.1-r2 $CAP41 > $L/operator-41-r2.log 2>&1;  echo "operator-41-r2 exit=$? spent=₹$(spent) $(date -u +%T)"
  CAPM=$(python3 -c "print(round(min(35, 300 - $(spent)), 1))"); echo "operator-gpt-4.1-mini-r2 cap=₹$CAPM"
  sh $T/run.sh operator lab-gpt41mini-in gpt-4.1-mini-r2 $CAPM > $L/operator-mini-r2.log 2>&1; echo "operator-mini-r2 exit=$? spent=₹$(spent) $(date -u +%T)" ;;
*) echo "usage: all.sh pair1|pair2"; exit 1 ;;
esac
echo "stage $1 done $(date -u +%FT%TZ)"
