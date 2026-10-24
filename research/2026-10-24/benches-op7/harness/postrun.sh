#!/bin/sh
# op7 (new, no model): after one run, the reads op6 ran by hand, in one place. postrun.sh <label>
# post.py (scrubbed copy + ledger), opdb.py (DB cards, NOT DONE follow-ups, check firings), rec.py (recorder per task),
# actions.py (kernel action rows of each turn), money-probe.mts (kind D pointers). Outputs stay in the scratchpad.
set -e
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op7; L=$1
DB=$(cat /dev/shm/bench-out-op7/db-$L.txt)
python3 $T/post.py operator $L
python3 $T/opdb.py $DB $T/opdb-$L.json /dev/shm/bench-out-op7/operator-$L.json > $T/opdb-$L.summary.txt
python3 $T/rec.py $L $DB $T/rec-$L.json > $T/rec-$L.summary.txt
python3 $T/actions.py $DB $T/actions-$L.json > $T/actions-$L.summary.txt
cd /dev/shm/wt-op7 && node --import tsx $T/money-probe.mts $L=$DB > $T/money-$L.jsonl
echo "postrun $L done: $(wc -l < $T/money-$L.jsonl) money lines"
