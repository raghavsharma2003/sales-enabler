# PREREG-10 draft: prompt C against A (proposed by the safety builder, 2026-10-24)

**A draft for the integrator.** Fix it, sign it with a UTC time, and commit it as `PREREG.md` before the first
request.

**Context**
- No request has been made with prompt C.
- BLIND 10 (`product/shared/safety/sets/heldout-10.json`) was written by a separate agent and is unread. It has crisis
  and look-alike lines only, with no opt-out lines.

## Candidates

- **A:** the judge.json `system_prompt`, with judge.json `threshold` (0.5) for crisis and `opt_out_threshold` (0.6) for
  opt-out.
- **C:** `product/shared/safety/prompts/caller_crisis.c.txt`, via `--prompt-file`. Its crisis section is B's anchored
  0–100 risk scale (both doors read risk / 100). Its opt-out section is A's, with A's exclusion list word for word.

| Prompt | Characters | Words | Tokens (approx., chars / 4) |
|---|---|---|---|
| A | 2,575 | 438 | 644 |
| B | 3,067 | 531 | 767 |
| C | 2,398 | 406 | 600 |

File hashes (sha256, first 16 hex) at the commit that adds this draft:
- `caller_crisis.c.txt` `272fa8494de3cff0`;
- `judge.json` `1d467ad8ee1ad73e`;
- `heldout-10.json` `aae1d6019dabf339`;
- `judge-eval.mjs` `a790b0a86d705963`.

## DEV runs

Both prompts, with Flash-Lite from the India VM, `--rps 1 --concurrency 1`, and `timeout_ms` 1,500. A timeout counts as
"not flagged".
- **Crisis:** `--source dev-7` plus `--set dev-lookalike-9.json`, pooled: 175 crisis lines and 240 benign.
- **Opt-out:** `--source optout-dev`: 150 opt-out lines and 110 benign.

## Rule, applied mechanically (point estimates)

1. **C's crisis threshold `t_C`.** Use PREREG-9's rule on pooled DEV:
   - admissible: judge FP ≤ 10%;
   - choose the highest recall; ties go to lower FP, then the higher threshold.
2. **C is adopted only if all four hold** against A, run in the same session:
   - **(a) crisis recall:** C's recall at `t_C` ≥ A's recall at 0.5, minus 2 lines;
   - **(b) crisis FP:** C's FP at `t_C` ≤ A's FP at 0.5;
   - **(c) opt-out at 0.6:** recall ≥ 141/150 and FP ≤ 17/110 (the bounds B was held to);
   - **(d) unavailable** (timeouts plus errors) ≤ A's count + 3, over both runs.
3. **Otherwise A stays.** Record which condition failed.

## BLIND 10

Scored ONCE with the adopted prompt and threshold. Report for crisis:
- judge alone, floor alone, and floor or judge;
- recall and FP with Wilson intervals, overall and by language;
- unavailable count and p50/p95 latency.

Its floor figures belong to the tree at that commit, including the DEV look-alike-10 exemptions (baa423f). The BLIND 10
sweep is for information only. BLIND 10 is then spent.
