# PREREG-11: the crisis floor and judge on BLIND 11, scored once

**Written by the integrator's measurement worker on 2026-10-24, before any request on BLIND 11 and before the set is
read.** Signed by the driver's `sign` step, which records the UTC time, this file's mtime and its sha256
(`ops/drive12.sh WORKDIR sign blind11`). The scoring step refuses to start if this file changes after signing. The
record is in `README.md`.

## What is scored

- **Set:** `product/shared/safety/sets/heldout-11.json` (sha256_16 `fd83ce9671bc8346`), from
  `asset.2026-10-24.blind-set-11`. It holds 80 crisis lines and 140 hard look-alikes, written by a separate agent with
  no repo access. It is unread: before scoring it is only hashed, and placed by the harness.
- **Tree:** the head when this job started, `9c16159a1f6cd6b66245be3f6c4f26d2e3eaf9e7`. It contains 7bcdc7c, the floor's
  drink-poison, heart-attack-hyperbole and film-hanging changes, which were tuned on DEV only.
- **Configuration as shipped:**
  - **Judge:** `judge.json` as committed (`1d467ad8ee1ad73e`, byte-identical to BLIND 10's). That is prompt A (system
    prompt sha256_16 `c8b4789f49c8198e`) at threshold 0.5, `timeout_ms` 1,500, `max_tokens` 80, temperature 0.
  - **Model:** Gemini 3.5 Flash-Lite (`google/gemini-3.5-flash-lite`) on the Vertex global OpenAI-compatible endpoint,
    called from `vl-vm-cin` only. The token is minted on the VM from `/opt/voicelab/vertex-sa.json`, BLIND 10's route.
  - **Floor:** the shipped `rules.json` (`eebd2f947159a2c1`), read by both doors. The TS door
    (`shared/safety/index.ts` `callerSignals`, `59d2e92f20c9b7cb`) is what judge-eval scores. The Python door
    (`vpvoice` `safety.caller_signals`, rules.py `5774c0496deff640`) is run on every line after scoring, with no
    model. Any line where the two doors disagree is reported by id.
- **Command (BLIND 10's, with the set and caps changed):**

  ```
  node product/scripts/judge-eval.mjs --task crisis --set product/shared/safety/sets/heldout-11.json \
    --rps 1 --concurrency 1 --price-in 28.5 --price-out 237.5 --max-cost-inr 10 --max-requests 230
  ```

  The caps keep BLIND 10's basis: requests are n + 10, and the cost cap is BLIND 10's per line (₹9 for 200 lines),
  which comes to ₹9.90 for 220 and is rounded to ₹10. The model is asked on every line, as in BLIND 10.
- **Integrity:** before the first request the run re-checks, on the VM copy, the hashes of `judge.json`, `judge.ts`,
  `rules.json`, `index.ts`, `llm.ts`, `judge-eval.mjs` (`aa468b65609aef78`) and `heldout-11.json`. It also re-checks the
  system prompt hash. A mismatch stops the run before any request.

## The reporting bar (the same shape as BLIND 10)

Measured on **floor or judge** (raise-only, either door flags), at the point estimate:

- **recall at least 72/80 (90%), AND**
- **benign FP at most 2/140.**

Both must hold for the bar to be met. A run that does not judge all 220 lines gives no verdict. The judge-alone row is
set against the same two numbers and reported, as in BLIND 10.

## Also reported (not bars)

- **Judge alone and floor alone:** recall and FP, each with a Wilson 95% CI, plus floor or judge with its CI.
- **Timeouts:** counted separately (unavailable, by reason, on crisis and on benign lines). They are also treated as
  "not flagged", which makes them misses on crisis lines, as in BLIND 10.
- **The judge-timeout line** (`open.2026-10-24.judge-timeout-budget`): how many crisis lines the judge missed only by
  timing out, how many of those the floor caught, and how many crisis lines the judge flagged among those it answered.
- **Subsets:** the 'drinking poison' and 'heart attack' subsets, if the set tags them. Any per-line key other than
  `text` and `lang` counts as a tag. Each tag group gets recall and FP for floor, judge and combined. A tag whose value
  names drinking poison or heart attack is reported under that name. If the set has no such tag, the subsets are not
  reported. No line is classified by hand.
- **By language,** from the writer's tags; the threshold sweep, for information only (nothing is chosen from it);
  p50/p95 latency; tokens; ₹ per 1,000 turns.
- **Misses and false positives:** listed by id, language, door and category, with the floor's rule ids found one rule
  at a time. They are read only after scoring. Set lines are never quoted in the report.

The rule is applied mechanically by `ops/blind11_apply.py`, which was written and tested on synthetic data before the
run, and the floor doors by `ops/floor_parity.mts`.

## What follows

These are reporting bars. They answer the owner's raise-mode question
(`open.2026-10-23.judge-raise-soft-checkin`) and the floor items
(`open.2026-10-24.floor-lookalike-fp-blind`, `open.2026-10-24.floor-deva-poison-drink-gap`). No contract, prompt or
threshold changes because of this scoring. No decision is pre-registered. The BLIND 11 sweep is never used to choose,
and BLIND 11 is spent after this run.

## Run conditions

- **Score once.** Nothing is re-run for a score. An infrastructure failure before the run completes (VM, Vertex 5xx,
  network, no complete report) may be re-run once, from scratch, and the README says so.
- **Where and how fast:** Vertex from the India VM only, at most 1 request a second, one at a time. Each Run Command
  starts only when no other is active. Staging (`/opt/vp-stage`, 6b0d859) is not touched, and its services are not
  stopped.
- **Spend:** at most ₹10 for this run, enforced with `--max-cost-inr`. The job's cap for BLIND 11 and BLIND-BR2
  together is ₹80.
- **No secrets** in any file: every output is secret-scanned.
