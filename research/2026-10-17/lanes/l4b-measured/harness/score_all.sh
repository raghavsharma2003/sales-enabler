#!/bin/bash
# Score every finished harness run (json + wav) that is not yet in measurements.csv. Usage: score_all.sh <tag-glob>
cd "$(dirname "$0")"
RUNS=${VP_REC_DIR:-/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/runs}
DONE=../data/.scored
touch $DONE
declare -A VENDOR=([vapi]="Vapi" [elevenlabs]="ElevenLabs Agents" [ultravox]="Ultravox" [vyora]="Vyora AI" [ravan_hi]="Ravan.ai" [smallest]="Smallest.ai")
for j in $RUNS/*__${1:-r1}.json; do
  b=$(basename $j .json); d=${b%%__*}
  [ -f "$RUNS/$b.wav" ] || continue
  grep -qx "$b" $DONE && continue
  rest=${b#*__}; p=${rest%%__*}; tag=${rest#*__}
  pgrep -f "[v]p_harness.mjs run $d $p $tag" > /dev/null && continue   # still recording
  [ $(( $(date +%s) - $(stat -c %Y "$j") )) -lt 20 ] && continue
  python3 score.py run "$j" --vendor "${VENDOR[$d]:-$d}" --out ../data/measurements.csv > ../data/.score-$b.log 2>&1 && echo "$b" >> $DONE && echo "scored $b" || echo "FAILED $b"
done
