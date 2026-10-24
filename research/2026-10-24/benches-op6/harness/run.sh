#!/bin/sh
# run.sh operator <deployment> <label> <cap_inr> [extra bench args...]
# op6 copy of the op5 harness run.sh (research/2026-10-24/benches-op5/harness/run.sh). Changes from op5, paths and the
#   cap only: worktree /dev/shm/wt-op6, outputs /dev/shm/bench-out-op6, cluster /dev/shm/vp-pgbench-op6:55441, its own
#   fresh ledger, global cap 300 (the op6 budget). Everything below is op5's header, unchanged.
# op5 copy of the r4 harness run.sh (research/2026-10-24/benches-r4/harness/run.sh). Changes from r4:
#   - paths: worktree /dev/shm/wt-op5, outputs /dev/shm/bench-out-op5, cluster /dev/shm/vp-pgbench6:55438;
#   - its own fresh ledger; global cap 280 (the op5 budget);
#   - the cap: <cap_inr> is this run's HARD cap, enforced per request by azure-guard.mjs (BENCH_CAP_INR, as in r4). The
#     bench's own stop rule (VP_BENCH_MAX_INR) is set so the bench stops starting tasks once its own priced spend passes
#     cap - STOP_MARGIN, instead of r4's cap - 52.9 (the bench prices every task at the Operator's worst case, 69.6k tokens:
#     Rs 52.9 at gpt-4.1 rates, Rs 11.6 at mini's; the dearest real r4 task was Rs 7.3 / Rs 1.7). STOP_MARGIN (default
#     gpt-4.1 Rs 25, mini Rs 5) also covers the model requests the bench does not price (brief review, draft-from-description,
#     memory: no cost_line), which the guard does count;
#   - harness/recorder.mjs preloaded in every scored run (r4 used it only in a re-run): it observes request bodies and, for
#     tool-less requests, the reply; it never changes a request and never records a URL, header or key.
# Maps the scratchpad Azure env onto the product's VP_LLM_DEFAULT_* and runs one bench on a fresh DB (tmpfs cluster).
# VP_LLM_BRIEF_REVIEW_* is left unset, so the brief review (d5e1f8a, agents/review.ts) falls back to VP_LLM_DEFAULT_*:
# it runs in mode "model" on this run's own deployment. Prints no secret: values are only exported into the child process.
set -e
B=$1; DEP=$2; LABEL=$3; CAP=$4; shift 4
[ "$B" = operator ] || { echo "op6 runs the operator bench only"; exit 1; }
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
T=$SP/bench-tools-op6
WT=/dev/shm/wt-op6
OUT=/dev/shm/bench-out-op6; mkdir -p $OUT
set -a; . $SP/voicelab.env; set +a
export VP_LLM_DEFAULT_URL="${LAB_AI_ENDPOINT%/}/openai/v1/chat/completions"
export VP_LLM_DEFAULT_KEY="$LAB_AI_KEY"
export VP_LLM_DEFAULT_KEY_HEADER=api-key
unset LAB_AI_KEY LAB_SPEECH_KEY LAB_AI_ENDPOINT LAB_SPEECH_ENDPOINT LAB_SPEECH_REGION
unset VP_LLM_BRIEF_REVIEW_URL VP_LLM_BRIEF_REVIEW_KEY VP_LLM_BRIEF_REVIEW_MODEL VP_LLM_BRIEF_REVIEW_KEY_HEADER
case $DEP in
  lab-gpt41mini-in) PIN=41.8; POUT=167.2; TPM=40000; GAP=1500; PRICES="{\"$DEP\": [$PIN, $POUT]}"; MARGIN=${STOP_MARGIN:-5} ;;
  lab-gpt41)        PIN=190;  POUT=760;   TPM=240000; GAP=1000; PRICES="{\"$DEP\": [$PIN, $POUT]}"; MARGIN=${STOP_MARGIN:-25} ;;
  *) echo "no price for $DEP"; exit 1 ;;
esac
export VP_LLM_DEFAULT_MODEL="$DEP"
export BENCH_PRICES="$PRICES" BENCH_TPM=$TPM BENCH_MIN_GAP_MS=$GAP
export BENCH_LEDGER=$T/ledger.jsonl BENCH_RUN="$B-$LABEL" BENCH_CAP_INR=$CAP BENCH_GLOBAL_CAP_INR=300
export BENCH_RECORD=$T/record-$LABEL.jsonl
DB="vp_bench_${B}_$(echo $LABEL | tr -c 'a-z0-9\n' '_')_$(date +%s)"
eval $(sh $T/mkdb.sh $DB)
# The bench's worst-case task at this rate (operator/loop.ts CAPS: 60,000 tokens + 8 x 1,200 reply tokens), in rupees.
W=$(python3 -c "print(round((60000 + 8 * 1200) * max($PIN, $POUT) / 1e6, 3))")
BENCHMAX=$(python3 -c "print(round($CAP - $MARGIN + $W, 3))")
echo "db=$DB deployment=$DEP cap=₹$CAP (hard, guard) bench-stop=₹$BENCHMAX (stops starting tasks past ₹$(python3 -c "print(round($CAP - $MARGIN, 2))") bench-priced) brief-review=default-fallback"
echo "$DB" > $OUT/db-$LABEL.txt
cd $WT
export VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN=$(echo "$PIN*1000" | bc) VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_OUT=$(echo "$POUT*1000" | bc)
export VP_BENCH_RPS=1 VP_BENCH_MAX_INR=$BENCHMAX
exec node --import tsx --import $T/azure-guard.mjs --import $T/recorder.mjs product/scripts/operator-bench.ts --out $OUT/operator-$LABEL.json "$@"
