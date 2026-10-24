#!/bin/sh
# op6 (new): brief.sh <deployment> <label> <cap_inr> <rps> - one BLIND brief-review score (judge-eval.mjs --task brief-review
# on product/shared/safety/sets/heldout-brief-review.json), through the same ledger guard as the Operator runs.
# - Env as product/shared/safety/README.md "Brief review": VP_LLM_BRIEF_REVIEW_URL/KEY/KEY_HEADER=api-key, built from
#   voicelab.env the way run.sh builds VP_LLM_DEFAULT_*; the model is judge-eval's first argument (it sets
#   VP_LLM_BRIEF_REVIEW_MODEL). VP_LLM_DEFAULT_URL is set to the same URL only because azure-guard.mjs paces, prices and
#   caps requests to that URL (llm.ts reads every BRIEF_REVIEW_* field first, so the default is never used). No other
#   VP_LLM_DEFAULT_* is set. Prints no secret: values are only exported into the child process.
# - azure-guard.mjs (byte-identical to op5's) is preloaded: the hard cap for this run is <cap_inr> (BENCH_CAP_INR) and the
#   global cap Rs 300 across the op6 ledger. judge-eval's own --max-cost-inr is <cap_inr> minus one request's worst case
#   (600 output tokens plus ~1k input: gpt-4.1 Rs 0.7, mini Rs 0.2), so judge-eval stops itself before the guard would
#   refuse a request (a guard refusal would be scored as an unavailable review, not a stop).
# - Rate: at most <rps> requests a second, concurrency 1. gpt-4.1: rps 1. gpt-4.1-mini (regional, shared, 50 RPM / 50k
#   TPM): rps 0.4, because the harness's 40k TPM pacing (op5's mini setting) at 1 rps would hold a request past the
#   review's 20 s timeout (brief-review.json timeout_ms), scoring a row as unavailable for a harness reason.
# - Output and log stay in /dev/shm/bench-out-op6/brief-blind-<label> (results.json holds the set's lines).
set -e
DEP=$1; LABEL=$2; CAP=$3; RPS=$4
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
T=$SP/bench-tools-op6
WT=/dev/shm/wt-op6
OUTD=/dev/shm/bench-out-op6/brief-blind-$LABEL
[ ! -e "$OUTD/report.json" ] || { echo "already scored: $OUTD (the blind set is scored once)"; exit 3; }
mkdir -p $OUTD
set -a; . $SP/voicelab.env; set +a
export VP_LLM_BRIEF_REVIEW_URL="${LAB_AI_ENDPOINT%/}/openai/v1/chat/completions"
export VP_LLM_BRIEF_REVIEW_KEY="$LAB_AI_KEY"
export VP_LLM_BRIEF_REVIEW_KEY_HEADER=api-key
export VP_LLM_DEFAULT_URL="$VP_LLM_BRIEF_REVIEW_URL"
unset LAB_AI_KEY LAB_SPEECH_KEY LAB_AI_ENDPOINT LAB_SPEECH_ENDPOINT LAB_SPEECH_REGION VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_BRIEF_REVIEW_MODEL
case $DEP in
  lab-gpt41mini-in) PIN=41.8; POUT=167.2; TPM=40000; GAP=1500; WORST=0.2 ;;
  lab-gpt41)        PIN=190;  POUT=760;   TPM=240000; GAP=1000; WORST=0.7 ;;
  *) echo "no price for $DEP"; exit 1 ;;
esac
export BENCH_PRICES="{\"$DEP\": [$PIN, $POUT]}" BENCH_TPM=$TPM BENCH_MIN_GAP_MS=$GAP
export BENCH_LEDGER=$T/ledger.jsonl BENCH_RUN="brief-blind-$LABEL" BENCH_CAP_INR=$CAP BENCH_GLOBAL_CAP_INR=300
JCAP=$(python3 -c "print(round($CAP - $WORST, 2))")
echo "brief-blind $LABEL deployment=$DEP guard-cap=Rs $CAP judge-eval-cap=Rs $JCAP rps=$RPS start=$(date -u +%FT%TZ)"
cd $WT
node --import tsx --import $T/azure-guard.mjs product/scripts/judge-eval.mjs $DEP --task brief-review \
  --set product/shared/safety/sets/heldout-brief-review.json --rps $RPS --concurrency 1 --price-in $PIN --price-out $POUT \
  --max-cost-inr $JCAP --label $LABEL --out-dir $OUTD > $OUTD/run.log 2>&1 && RC=0 || RC=$?
echo "brief-blind $LABEL exit=$RC end=$(date -u +%FT%TZ)"
