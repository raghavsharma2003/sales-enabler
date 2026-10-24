#!/bin/bash
# Sequential battery runs (one browser at a time: parallel runs garble tapped audio and skew latency).
# usage: run_batch.sh "<demo ids>" "<persona ids>" "<rep tags>"
cd "$(dirname "$0")"
LOG=${VP_REC_DIR:-/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/runs}/batch.log
for rep in $3; do for p in $2; do for d in $1; do
  echo "$(date -u +%FT%TZ) START $d $p $rep" >> "$LOG"
  timeout 720 node vp_harness.mjs run "$d" "$p" "$rep" > "${LOG%.log}-$d-$p-$rep.log" 2>&1
  echo "$(date -u +%FT%TZ) END $d $p $rep exit=$?" >> "$LOG"
  sleep 20
done; done; done
echo "$(date -u +%FT%TZ) BATCH DONE" >> "$LOG"
