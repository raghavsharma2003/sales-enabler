#!/bin/bash
# Sequential runs from an explicit list of "demo persona tag" triples (one per argument, quoted).
cd "$(dirname "$0")"
LOG=${VP_REC_DIR:-/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/runs}/batch.log
while pgrep -f "[v]p_harness.mjs run" > /dev/null; do sleep 3; done
for item in "$@"; do
  set -- $item; d=$1; p=$2; rep=$3
  echo "$(date -u +%FT%TZ) START $d $p $rep" >> "$LOG"
  timeout 720 node vp_harness.mjs run "$d" "$p" "$rep" > "${LOG%.log}-$d-$p-$rep.log" 2>&1
  echo "$(date -u +%FT%TZ) END $d $p $rep exit=$?" >> "$LOG"
  sleep 20
done
echo "$(date -u +%FT%TZ) BATCH DONE" >> "$LOG"
