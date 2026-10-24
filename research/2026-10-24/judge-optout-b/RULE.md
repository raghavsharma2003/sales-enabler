# Opt-out DEV under prompt B: decision bounds (written 2026-10-24T05:00:11Z, before any request of this run)

**Written 2026-10-24T05:00:11Z (UTC) by the VM measurement worker.** At this time no request of this run had been
made. The bounds come from `decision.2026-10-24.judge-prompt-b-ships-after-optout-dev` and are copied here unchanged.

## What runs, once

- **Tree:** origin head 7c17724 (7c1772489be8be10fecd662efd517e60b0f81a0b), bundled to a VM-only copy `/tmp/je10` on
  `vl-vm-cin`. Staging is not redeployed.
- **Command:**

  ```
  node product/scripts/judge-eval.mjs --task opt_out --source optout-dev \
    --prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt \
    --rps 1 --concurrency 1 --price-in 28.5 --price-out 237.5 --max-cost-inr 15 --max-requests 270
  ```

  - `--source optout-dev` is what A's run used (`measure.2026-10-24.judge-optoutdev-flashlite-1500`). It is the same
    260 lines as `sets/optout-dev.json` (150 opt-out requests, 110 look-alikes; 260 of 260 texts match, checked by
    script on the counts and texts of this DEV set).
  - Model: Gemini 3.5 Flash-Lite (`google/gemini-3.5-flash-lite`) on the Vertex global OpenAI-compatible endpoint,
    from the India VM only, at most 1 request a second, one at a time.
  - judge.json as committed, except the system prompt, which `--prompt-file` replaces with prompt B trimmed
    (sha256_16 `ed63058d5526890a`). `timeout_ms` 1,500, `max_tokens` 80, temperature 0.
  - `opt_out_threshold` as shipped: **0.6**.

## The bounds (judge alone, at 0.6)

| Measure | A (`measure.2026-10-24.judge-optoutdev-flashlite-1500`) | Bound for B |
|---|---|---|
| Opt-out recall, judge alone | 144/150 | **at least 141/150** |
| Opt-out FP on the 110 look-alikes, judge alone | 14/110 | **at most 17/110** |

- **B is within the bounds only if both hold.** Otherwise it is outside them.
- Counts are over all 150 and 110 planned lines. A line that was not judged (a timeout, an error, bad output, or a cap
  reached) counts as not flagged, as the harness counts it.
- Point estimates decide. Wilson 95% intervals are reported but do not decide.
- The floor is in-sample on this set (A: 150/150, 0/110) and is reported, but the bounds are on the judge alone.
- The threshold sweep is printed for information only. It is never used to move the threshold or to judge the bounds.
- **One run.** If it fails for an infrastructure reason (no complete report), it may be re-run once, and the README
  says so. It is never re-run for a score.

Also reported: p50/p95 latency of answered calls, the timeout count, and ₹ per 1,000 turns at $0.30 / $2.50 per 1M
tokens × 95 (₹28.5 / ₹237.5 per 1M), the prices the judge9 runs used.
