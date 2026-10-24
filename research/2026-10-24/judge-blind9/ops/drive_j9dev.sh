#!/bin/bash
# PREREG-9 DEV, from the sandbox (adapted from ../../judge-blind8/ops/drive_j8dev.sh). Two Run Commands, strictly one
# at a time: prompt A (judge.json as committed), then prompt B (--prompt-file prompts/caller_crisis.risk100.txt). Each
# runs dev-7 and then dev-lookalike-9 as separate judge-eval runs, which PREREG-9 pools. Fetches each run's full log,
# report.json and summary.md (DEV only; results.json stays in blob).
# Usage: drive_j9dev.sh WORKDIR
set -u
W=$1; OPS=$(cd "$(dirname "$0")" && pwd)
SETDLK=product/shared/safety/sets/dev-lookalike-9.json
PB=product/shared/safety/prompts/caller_crisis.risk100.txt
python3 $OPS/fill9.py $W/j9-dev-A.sh \
  "flashlite-dev7-A|/tmp/je9|200|8|--task crisis --source dev-7" \
  "flashlite-dlk9-A|/tmp/je9|235|9.5|--task crisis --set $SETDLK"
python3 $OPS/fill9.py $W/j9-dev-B.sh \
  "flashlite-dev7-B|/tmp/je9|200|8|--task crisis --source dev-7 --prompt-file $PB" \
  "flashlite-dlk9-B|/tmp/je9|235|9.5|--task crisis --set $SETDLK --prompt-file $PB"
for x in "vps6-j9-dev-A:A:flashlite-dev7-A flashlite-dlk9-A" "vps6-j9-dev-B:B:flashlite-dev7-B flashlite-dlk9-B"; do
  N=${x%%:*}; R=${x#*:}; P=${R%%:*}; LABELS=${R#*:}
  echo "== $N start $(date -u +%H:%M:%S)"
  timeout 3700 python3 $OPS/ops9.py run $N $W/j9-dev-$P.sh 3600 > $W/$N.out 2>&1
  timeout 120 python3 $OPS/ops9.py get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
  for L in $LABELS; do
    mkdir -p $W/dev/$L
    for f in report.json summary.md; do timeout 120 python3 $OPS/ops9.py get runlogs/vps6-j9-$L-$f $W/dev/$L/$f; done
  done
  echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)"
  grep -q "STATE Succeeded exit 0" $W/$N.out || { echo "STOP: $N did not succeed"; exit 1; }
done
echo "== all done $(date -u +%H:%M:%S)"
