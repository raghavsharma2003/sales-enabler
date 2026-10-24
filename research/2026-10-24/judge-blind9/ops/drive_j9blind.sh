#!/bin/bash
# PREREG-9 BLIND 9, from the sandbox: ONE Run Command (mk_je9t.sh + one judge9.tmpl.sh run), scored once.
# Refuses unless research/2026-10-24/judge-prereg9/CHOICE.md exists and names this (candidate, threshold), and unless
# no BLIND 9 scoring exists yet (no report in blob for this label, no blind/ in the workdir). Fetches only report.json and summary.md (ids and aggregates);
# results.json, which holds the lines, stays on the VM and in blob and is never downloaded.
# Usage: drive_j9blind.sh WORKDIR CAND THRESH
set -u
W=$1; CAND=$2; T=$3; OPS=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd $OPS/../../../.. && pwd)
CH=$ROOT/research/2026-10-24/judge-prereg9/CHOICE.md
[ -f $CH ] || { echo "STOP: no CHOICE.md"; exit 2; }
grep -q "^CHOSEN: candidate $CAND at threshold $T " $CH || { echo "STOP: CHOICE.md does not name candidate $CAND at threshold $T"; exit 2; }
LABEL=flashlite-blind9-$CAND-t$(echo $T | tr -d .)
[ -e $W/blind ] && { echo "STOP: $W/blind exists (BLIND 9 was already scored from this workdir)"; exit 3; }
timeout 120 python3 $OPS/ops9.py get runlogs/vps6-j9-$LABEL-report.json $W/blind-precheck.json | grep -q " 404 " || { echo "STOP: a BLIND 9 report already exists in blob for $LABEL"; exit 3; }
sed -e "s/__THRESH__/$T/" -e "s/__CAND__/$CAND/" $OPS/mk_je9t.sh > $W/j9-blind-part1.sh
python3 $OPS/fill9.py $W/j9-blind-part2.sh "$LABEL|/tmp/je9t|210|9|--task crisis --set product/shared/safety/sets/heldout-9.json"
cat $W/j9-blind-part1.sh $W/j9-blind-part2.sh > $W/j9-blind.sh; bash -n $W/j9-blind.sh || exit 4
N=vps6-j9-blind9
echo "== $N ($LABEL) start $(date -u +%H:%M:%S)"
timeout 3000 python3 $OPS/ops9.py run $N $W/j9-blind.sh 2400 > $W/$N.out 2>&1
timeout 120 python3 $OPS/ops9.py get runlogs/$N.out $W/$N.full.out > /dev/null 2>&1
mkdir -p $W/blind/$LABEL
for f in report.json summary.md; do timeout 120 python3 $OPS/ops9.py get runlogs/vps6-j9-$LABEL-$f $W/blind/$LABEL/$f; done
echo "== $N $(grep -m1 STATE $W/$N.out) $(date -u +%H:%M:%S)"
