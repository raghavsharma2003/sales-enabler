# BLIND 8 pre-registration: how the crisis threshold is chosen (2026-10-24)

## Part 1: the rule, written before any DEV or BLIND 8 request

**Written 2026-10-24T00:31:38Z (UTC)**, before the DEV runs and before BLIND 8 is scored. No judge request of this job
had been sent when it was written.

**What is fixed here**
- Tree: branch head `e9fdde3` (e9fdde38dcf7f779935750af27e067178158b206), the same tree the staging redeploy ships.
- File hashes (sha256, first 16 hex):
  - `product/shared/safety/sets/heldout-8.json` `df4dc75eae953686`;
  - `product/shared/safety/judge.json` `6e0eed066863e395`;
  - `product/scripts/judge-eval.mjs` `f7c334281154c6e3`;
  - `product/shared/safety/cases.json` `714e3158a49d088e`.
- Model: Gemini 3.5 Flash-Lite (`google/gemini-3.5-flash-lite`) on the Vertex global OpenAI-compatible endpoint. Calls
  come from the India VM `vl-vm-cin` only, at most 1 request per second, with concurrency 1.
- Prompt: the system prompt in `judge.json`. No `--prompt-file`.
- Timeout: `timeout_ms` 1,500 from `judge.json`, unchanged.
- The only `judge.json` field that may change for BLIND 8 is `threshold`. It changes in a VM-only copy of the tree.

**The DEV set for the choice.** The crisis task on `dev-7`: the caller lines of source `dev-7` in `cases.json`. Run
as `judge-eval.mjs --task crisis --source dev-7`. The opt-out DEV run (`--task opt_out --source optout-dev`) is
reported for information only and plays no part in the choice.

**The measure.** It comes from the DEV run's threshold sweep (`report.json` → `tasks.crisis.sweep`), on the grid
0.3, 0.35, … 0.9.
- **"DEV benign false-positive rate"** means the **judge-alone** FP: the sweep's `fp_judge`, the k/n of dev-7's
  non-crisis lines the judge flags at that threshold. The threshold is the judge's own parameter. The floor's FP does
  not move with it, so the floor-or-judge figure is recorded beside it but does not decide.
- **"Recall"** in the fallback means judge-alone recall, the sweep's `recall_judge`, for the same reason.
- **Point estimates decide**, not CI bounds.
  - "At most 5%" means k/n ≤ 0.05.
  - "At least 95%" means k/n ≥ 0.95.

**The rule, applied mechanically**
1. Take the lowest grid threshold whose `fp_judge` k/n ≤ 0.05.
2. If none qualifies, take the thresholds whose `recall_judge` k/n ≥ 0.95. Among them, choose the one with the
   fewest `fp_judge` false positives. A tie goes to the lowest threshold.
3. If no threshold reaches a recall of 0.95, keep the contract's 0.5. Record that the rule found nothing.

**What happens after the choice**
- The chosen threshold is written into `/tmp/je8t/product/shared/safety/judge.json` on the VM.
- BLIND 8 (`product/shared/safety/sets/heldout-8.json`, `--task crisis --set …`) is scored **once**, at that
  threshold. It runs with the same model, rate and timeout.
- The BLIND 8 sweep is reported for information only and is never used to choose.
- The builder has not read BLIND 8's lines and will not read them. Only the tool's aggregate output (slices, ids of
  misses and false alarms) is reported.

**Not allowed**
- Re-running BLIND 8.
- Changing the prompt or threshold after seeing BLIND 8.
- Choosing on any heldout set.

## Part 2: the DEV numbers and the chosen threshold

**Written 2026-10-24T01:58:23Z (UTC)**, after the DEV crisis run and before any BLIND 8 request. BLIND 8 had not been
read, dry-run or scored by any tool in this job.

**The DEV run.** Label `flashlite-dev7-crisis`, from the VM, 2026-10-24 01:54:20–01:57:44 UTC.
- Command: `judge-eval.mjs --task crisis --source dev-7 --rps 1 --concurrency 1 --price-in 28.5 --price-out 237.5
  --max-cost-inr 30 --max-requests 250`, in `/tmp/je8` (the contract `judge.json`).
- Judged 190 of 190 lines: 100 crisis, 90 non-crisis.
- Unavailable 5/190 (2.6%; all timeouts at 1,500 ms).
- p50 1,001 ms, p95 1,212 ms. ₹5.35 in all, ₹28.14 per 1,000 turns.
- The floor is in-sample on dev-7: recall 100/100, FP 0/90. So on this set, floor-or-judge FP equals judge FP.

**The sweep that chose** (`ops/prereg_apply.py` applied to `dev/flashlite-dev7-crisis/report.json`):

| Threshold | Recall: judge | FP: judge | Recall: floor or judge | FP: floor or judge |
|---|---|---|---|---|
| 0.3–0.6 (each) | 88/100 (88.0%, CI 80.2-93.0) | 8/90 (8.9%, CI 4.6-16.6) | 100/100 | 8/90 (8.9%) |
| 0.65 | 88/100 (88.0%, CI 80.2-93.0) | 7/90 (7.8%, CI 3.8-15.2) | 100/100 | 7/90 (7.8%) |
| 0.7 | 88/100 (88.0%, CI 80.2-93.0) | 7/90 (7.8%, CI 3.8-15.2) | 100/100 | 7/90 (7.8%) |
| 0.75 | 87/100 (87.0%, CI 79.0-92.2) | 7/90 (7.8%, CI 3.8-15.2) | 100/100 | 7/90 (7.8%) |
| 0.8 | 87/100 (87.0%, CI 79.0-92.2) | 7/90 (7.8%, CI 3.8-15.2) | 100/100 | 7/90 (7.8%) |
| 0.85 | 84/100 (84.0%, CI 75.6-89.9) | 6/90 (6.7%, CI 3.1-13.8) | 100/100 | 6/90 (6.7%) |
| **0.9** | **60/100 (60.0%, CI 50.2-69.1)** | **0/90 (0.0%, CI 0.0-4.1)** | 100/100 | 0/90 (0.0%) |

**Chosen threshold: 0.9, by rule step 1.** Its judge FP is 0/90 = 0.0% ≤ 5%. It is the only grid threshold at or below
5%: the next lower one, 0.85, has 6/90 = 6.7%. So step 2 (the recall ≥ 95% fallback) does not apply.
- No threshold reached a judge recall of 95% on DEV anyway: at most 88/100. The 12 crisis lines missed at every
  threshold are 7 "kind none" verdicts and 5 timeouts; all 5 timeouts were crisis lines.

**The cost of this choice on DEV, stated before BLIND 8.** Moving from the contract's 0.5 to 0.9 drops judge-alone
recall from 88/100 to 60/100 and removes all 8 false positives.
- Flash-Lite's confidences come in steps.
  - On crisis lines, its 88 crisis verdicts are: 0.7 (1), 0.8 (3), 0.85 (24), 0.9 (2), 0.95 (44), 0.98 (1) and 1.0
    (13).
  - On benign lines, its 8 false positives are: 0.6 (1), 0.8 (1) and 0.85 (6).
- So 0.9 cuts every false positive, and the 28 true crisis verdicts at 0.85 or below go with them. That is the cliff
  in the sweep.

This is recorded, not acted on: the rule was fixed in part 1 and is applied as written. (This paragraph was corrected
at 2026-10-24T01:59:08Z, still before any BLIND 8 request. The first wording said the confidences sat "at or just below
0.9"; the counts above are read from DEV `results.json`. The rule, the threshold and the numbers in the table did not
change.)

**BLIND 8 will run** in `/tmp/je8t`, a copy of `/tmp/je8` with only `judges.caller_crisis.threshold` set to 0.9
(`ops/mk_je8t.sh` checks that no other field differs). It runs once:
`--task crisis --set product/shared/safety/sets/heldout-8.json --rps 1 --concurrency 1`, with the same prices and
caps.
