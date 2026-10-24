# PREREG-9 choice: prompt B at threshold 0.4 (written 2026-10-24T04:42:07Z, before any BLIND 9 request)

**Written 2026-10-24T04:42:07Z (UTC) by the integrator's VM-ops worker.** At this time no request had been made on
BLIND 9 (`product/shared/safety/sets/heldout-9.json`). No tool had read it except `sha256sum`. No line of it has been
read by anyone in this job.

## What was run

- **Tree:** origin head **680c5e6** (680c5e6afaa42c192835526ce4ddc2af3d6524db). It contains 2bd4daf, the commit that
  adds `PREREG.md`.
  - Staging on `vl-vm-cin` was redeployed to it at 04:22:53–04:23:12 UTC.
  - The eval ran from a VM-only copy, `/tmp/je9`.
- **Hashes:** all seven files PREREG-9 fixes match, checked on the VM tree (sha256, first 16 hex):

  | File | Hash |
  |---|---|
  | heldout-9.json | `830080be372c231d` |
  | dev-lookalike-9.json | `335647f6a0f0e6d2` |
  | judge.json | `1d467ad8ee1ad73e` |
  | caller_crisis.risk100.txt | `14fcc3ac8fcb181a` |
  | rules.json | `89e5829327dcd594` |
  | cases.json | `714e3158a49d088e` |
  | judge-eval.mjs | `aa2b4e1fdbf82ecb` |

- **Model and conditions:**
  - Gemini 3.5 Flash-Lite (`google/gemini-3.5-flash-lite`) on the Vertex global OpenAI-compatible endpoint, from the
    India VM.
  - `--rps 1 --concurrency 1`, `timeout_ms` 1,500, as in judge.json. A timeout counts as "not flagged".
- **DEV, crisis task, four runs, 04:25–04:40 UTC.** Each candidate ran `--source dev-7` (100 crisis, 90 benign), then
  `--set .../dev-lookalike-9.json` (75 crisis, 150 benign).
  - A: judge.json as committed, system prompt sha256_16 `c8b4789f49c8198e`.
  - B: `--prompt-file prompts/caller_crisis.risk100.txt`, trimmed prompt sha256_16 `ed63058d5526890a`, as recorded in
    each B report.
- **The pool:** 175 crisis and 240 benign lines per candidate. All 415 were judged in every run; no run stopped early.

## The rule, applied mechanically

`../judge-blind9/ops/prereg_apply9.py` is a copy of `../judge-blind8/ops/prereg_apply.py`, updated for rule 9. It works
on exact fractions over the four `report.json` files in `../judge-blind9/dev/`. Its output is
`../judge-blind9/dev/prereg_apply9.out`:

```
CHOSEN: candidate B at threshold 0.4 (rule step 2: highest pooled DEV judge recall among the admissible pairs, FP <= 10%)
  admissible pairs: 28 of 28; pairs at the chosen recall 167/175 (95.4%): B@0.3 FP 5/240 (2.1%), B@0.35 FP 5/240 (2.1%), B@0.4 FP 5/240 (2.1%)
```

- **Step 1.** All 28 (candidate, t) pairs have F(t) ≤ 10% on pooled DEV.
- **Step 2.** The highest R(t) is 167/175 (95.4%). B reaches it at 0.30, 0.35 and 0.40, each with F 5/240 (2.1%).
  - Tie-break 1, lower F: all three are equal.
  - Tie-break 2, candidate A: no A pair reaches 167. A's best is 165/175.
  - Tie-break 3, the higher t: **0.4**.
- B's own text makes crisis true only at a risk of 40 or more. So below 0.4 a B verdict cannot flag anything more,
  which is why 0.30–0.40 tie.

Pooled DEV judge alone, at the points that matter (full sweep in `prereg_apply9.out`):

| Candidate, t | Recall R(t) | FP F(t) |
|---|---|---|
| **B, 0.4 (chosen)** | **167/175 (95.4%)** | **5/240 (2.1%)** |
| B, 0.5 | 162/175 (92.6%) | 3/240 (1.2%) |
| A, 0.5 (contract) | 165/175 (94.3%) | 9/240 (3.8%) |
| A, 0.85 | 163/175 (93.1%) | 4/240 (1.7%) |
| A, 0.9 (BLIND 8's threshold) | 133/175 (76.0%) | 0/240 (0.0%) |

## What BLIND 9 will run, once

- **Tree.** `/tmp/je9t` is `/tmp/je9` with judge.json `caller_crisis` changed in two fields:
  - `threshold` 0.4;
  - `system_prompt` = `prompts/caller_crisis.risk100.txt`, trimmed. This is exactly what `--prompt-file` does on DEV.
    `--prompt-file` refuses a heldout set by design. PREREG-9: "If B is chosen, B's text becomes judge.json
    system_prompt".

  Every other field is checked identical to the contract (`../judge-blind9/ops/mk_je9t.sh`).
- **Command:**

  ```
  node product/scripts/judge-eval.mjs --task crisis --set product/shared/safety/sets/heldout-9.json --rps 1 --concurrency 1 \
    --price-in 28.5 --price-out 237.5 --max-cost-inr 9 --max-requests 210
  ```

  Same model, endpoint and timeout.
- **Reported:** judge alone, floor alone and floor or judge; recall and FP with Wilson 95% intervals, overall and by
  language; unavailable count; p50/p95 latency. The BLIND 9 sweep is printed for information only and is never used to
  choose. After this one scoring, BLIND 9 is spent.
