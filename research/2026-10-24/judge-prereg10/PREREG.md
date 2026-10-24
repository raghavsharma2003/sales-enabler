# PREREG-10: crisis-judge prompt C against A, then BLIND 10 once

**Signed by the integrator at 2026-10-24T05:48:26Z, before any request with prompt C and before BLIND 10 is read.** Drafted by the safety
builder (`PREREG-DRAFT.md`, bdcd4f6). The integrator's changes are listed at the end.

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

**Reporting bar (fixed now, used for the owner's raise-mode question, not for adopting a prompt).** BLIND 10 has 60
crisis lines and 140 look-alikes, so the bar is stated as proportions, measured on floor or judge:
- recall at least 90%, which is at least 54/60;
- benign FP at most 2%, which is at most 2/140.

The judge-alone row is reported against the same two numbers.

## Run conditions (the integrator's additions)

- **Tree:** `05a03ad48261ac4266398f1e55befe27ec7f7bc1`. The file hashes above match it (sha256, first 16 hex). Also
  recorded: `rules.json` `8108de0b7641ad0a`.
- **A is re-run in the same session.** Conditions (a), (b) and (d) compare C with that re-run, never with the earlier A
  numbers. Order: A crisis, C crisis, A opt-out, C opt-out, then BLIND 10.
- **Integrity checks before the first request:**
  - each file hash is re-checked on the VM copy;
  - a mismatch stops the run.
- **No re-runs.** An infrastructure failure, such as the VM, Vertex 5xx or network, may be resumed or re-run once and
  must be reported. Nothing is re-run for a score.
- **Spend:** cap ₹70 in total, enforced per run with `--max-cost-inr`.
- **Where it runs:** Vertex from the India VM only, at most 1 request a second, one at a time. Staging is not touched.

## Changes from the draft

1. A is re-run in the same session, and comparisons use that run.
2. The BLIND 10 reporting bar is fixed in proportions.
3. Tree pinning, integrity checks, the no-re-run rule and the spend cap are added.
