#!/bin/bash
W=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/stage4
cd /dev/shm/wt-stage3/research/2026-10-24/staging/ops
for x in v2-flashlite-r1 v2-flashlite-nf v2-mai-r1 v2-mai-nf v2-54mini-r1 v2-54mini-nf; do
  echo "== $x start $(date -u +%H:%M:%S)"
  timeout 2000 python3 ops.py run vps4-gap-$x $W/gap-$x.sh 1800 > $W/gap-$x.out 2>&1
  timeout 120 python3 ops.py get runlogs/vps4-gap-$x.out $W/gap-$x.full.out > /dev/null 2>&1
  echo "== $x $(grep -m1 STATE $W/gap-$x.out) $(date -u +%H:%M:%S)"
  grep -q "STATE Succeeded exit 0" $W/gap-$x.out || { echo "STOP: $x did not succeed"; exit 1; }
done
echo "== all done"
