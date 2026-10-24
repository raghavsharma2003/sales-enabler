#!/bin/sh
# run.sh <operator|analysis> <deployment|tiered> <label> <cap_inr> [extra bench args...]
# r7 copy of research/2026-10-24/benches-r6/harness/run.sh. Changes from r6: paths only (worktree /dev/shm/wt-bench7,
#   outputs /dev/shm/bench-out-r7, cluster /dev/shm/vp-pgbench-r7:55447), its own fresh ledger, global cap 40 (the r7
#   budget). DEP=tiered prices both deployments and defaults to mini (the first pass), as in r2. BENCH_SCRIPT stays
#   optional and is NOT set in r7: every r7 run is the product bench on the shipped contract (current).
# Maps the scratchpad Azure env onto the product's VP_LLM_DEFAULT_* and runs one bench on a fresh DB (tmpfs cluster).
# Prints no secret: values are only exported into the child process.
set -e
B=$1; DEP=$2; LABEL=$3; CAP=$4; shift 4
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
T=$SP/bench-tools-r7
WT=/dev/shm/wt-bench7
OUT=/dev/shm/bench-out-r7; mkdir -p $OUT
set -a; . $SP/voicelab.env; set +a
export VP_LLM_DEFAULT_URL="${LAB_AI_ENDPOINT%/}/openai/v1/chat/completions"
export VP_LLM_DEFAULT_KEY="$LAB_AI_KEY"
export VP_LLM_DEFAULT_KEY_HEADER=api-key
unset LAB_AI_KEY LAB_SPEECH_KEY LAB_AI_ENDPOINT LAB_SPEECH_ENDPOINT
case $DEP in
  lab-gpt41mini-in) PIN=41.8; POUT=167.2; TPM=40000; GAP=1500; PRICES="{\"$DEP\": [$PIN, $POUT]}" ;;
  lab-gpt41)        PIN=190;  POUT=760;   TPM=240000; GAP=1000; PRICES="{\"$DEP\": [$PIN, $POUT]}" ;;
  tiered)           DEP=lab-gpt41mini-in; PIN=41.8; POUT=167.2; TPM=40000; GAP=1500
                    PRICES='{"lab-gpt41mini-in": [41.8, 167.2], "lab-gpt41": [190, 760]}' ;;
  *) echo "no price for $DEP"; exit 1 ;;
esac
export VP_LLM_DEFAULT_MODEL="$DEP"
export BENCH_PRICES="$PRICES" BENCH_TPM=$TPM BENCH_MIN_GAP_MS=$GAP
export BENCH_LEDGER=$T/ledger.jsonl BENCH_RUN="$B-$LABEL" BENCH_CAP_INR=$CAP BENCH_GLOBAL_CAP_INR=40
DB="vp_bench_${B}_$(echo $LABEL | tr -c 'a-z0-9\n' '_')_$(date +%s)"
eval $(sh $T/mkdb.sh $DB)
echo "db=$DB deployment=$DEP cap=₹$CAP"
cd $WT
if [ "$B" = operator ]; then
  export VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN=$(echo "$PIN*1000" | bc) VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_OUT=$(echo "$POUT*1000" | bc)
  export VP_BENCH_RPS=1 VP_BENCH_MAX_INR=$CAP
  exec node --import tsx --import $T/azure-guard.mjs product/scripts/operator-bench.ts --out $OUT/operator-$LABEL.json "$@"
else
  export VP_BENCH_INR_PER_1K_INPUT=$(echo "scale=6; $PIN/1000" | bc) VP_BENCH_INR_PER_1K_OUTPUT=$(echo "scale=6; $POUT/1000" | bc)
  exec node --import tsx --import $T/azure-guard.mjs product/scripts/${BENCH_SCRIPT:-analysis-bench.ts} --out $OUT/analysis-$LABEL "$@"
fi
