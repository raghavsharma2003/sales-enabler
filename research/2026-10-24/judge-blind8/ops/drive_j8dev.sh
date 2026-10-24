#!/bin/bash
W=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/stage4
cd /dev/shm/wt-stage3/research/2026-10-24/staging/ops
for x in "vps4-j8-prep:/dev/shm/wt-stage3/research/2026-10-24/judge-blind8/ops/prep.sh:600" "vps4-j8-dev-crisis:$W/j8-dev-crisis.sh:1800" "vps4-j8-dev-optout:$W/j8-dev-optout.sh:1800"; do
  N=${x%%:*}; R=${x#*:}; F=${R%%:*}; T=${R##*:}
  echo "== $N start $(date -u +%H:%M:%S)"
  timeout 2000 python3 ops.py run $N $F $T > $W/$N.out 2>&1
  timeout 120 python3 ops.py get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)"
  grep -q "STATE Succeeded exit 0" $W/$N.out || { echo "STOP: $N did not succeed"; exit 1; }
done
echo "== all done"
