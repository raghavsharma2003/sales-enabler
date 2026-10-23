#!/bin/sh
# run.sh <operator|analysis> <deployment> <label> <cap_inr> [extra bench args...]
# Maps the scratchpad Azure env onto the product's VP_LLM_DEFAULT_* and runs one bench on a fresh DB (tmpfs cluster).
# Prints no secret: values are only exported into the child process.
set -e
B=$1; DEP=$2; LABEL=$3; CAP=$4; shift 4
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
WT=/dev/shm/wt-bench
OUT=/dev/shm/bench-out; mkdir -p $OUT
set -a; . $SP/voicelab.env; set +a
export VP_LLM_DEFAULT_URL="${LAB_AI_ENDPOINT%/}/openai/v1/chat/completions"
export VP_LLM_DEFAULT_KEY="$LAB_AI_KEY"
export VP_LLM_DEFAULT_MODEL="$DEP"
export VP_LLM_DEFAULT_KEY_HEADER=api-key
unset LAB_AI_KEY LAB_SPEECH_KEY LAB_AI_ENDPOINT LAB_SPEECH_ENDPOINT
case $DEP in
  lab-gpt41mini-in) PIN=41.8; POUT=167.2; TPM=40000; GAP=1500 ;;
  lab-gpt41)        PIN=190;  POUT=760;   TPM=240000; GAP=1000 ;;
  *) echo "no price for $DEP"; exit 1 ;;
esac
export BENCH_PRICES="{\"$DEP\": [$PIN, $POUT]}" BENCH_TPM=$TPM BENCH_MIN_GAP_MS=$GAP
export BENCH_LEDGER=$SP/bench-tools/ledger.jsonl BENCH_RUN="$B-$LABEL" BENCH_CAP_INR=$CAP BENCH_GLOBAL_CAP_INR=780
DB="vp_bench_${B}_$(echo $LABEL | tr -c 'a-z0-9\n' '_')_$(date +%s)"
eval $(sh $SP/bench-tools/mkdb.sh $DB)
echo "db=$DB deployment=$DEP cap=₹$CAP"
cd $WT
if [ "$B" = operator ]; then
  export VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN=$(echo "$PIN*1000" | bc) VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_OUT=$(echo "$POUT*1000" | bc)
  export VP_BENCH_RPS=1 VP_BENCH_MAX_INR=$CAP
  exec node --import tsx --import $SP/bench-tools/azure-guard.mjs product/scripts/operator-bench.ts --out $OUT/operator-$LABEL.json "$@"
else
  export VP_BENCH_INR_PER_1K_INPUT=$(echo "scale=6; $PIN/1000" | bc) VP_BENCH_INR_PER_1K_OUTPUT=$(echo "scale=6; $POUT/1000" | bc)
  exec node --import tsx --import $SP/bench-tools/azure-guard.mjs product/scripts/analysis-bench.ts --out $OUT/analysis-$LABEL "$@"
fi
