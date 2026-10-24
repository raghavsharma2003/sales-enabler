# BLIND 9 pre-registration: prompt and crisis threshold (2026-10-24)

**Written 2026-10-24T02:39:58Z (UTC) by the safety module builder.** At this time there had been no DEV run of the candidate prompt,
and no request on BLIND 9. BLIND 9 (`product/shared/safety/sets/heldout-9.json`) was written by a separate agent with
no repo access. The builder checked its counts and its overlap with earlier sets by script, and has not read a line.

## Why a new rule

On DEV (research/2026-10-24/judge-blind8), Flash-Lite's confidences come in steps:
- 6 of the 8 DEV false positives sit at exactly 0.85, alongside 24 true crisis lines;
- recall falls from 84/100 at ≥0.85 to 60/100 at ≥0.9;
- no threshold separates the two.

The check-in changes the cost of a false positive:
- with `VP_SAFETY_JUDGE_CHECKIN=1`, a judge-only raise costs one gentle check-in, not the crisis script;
- a missed crisis can cost a life.

So the rule favours recall, within a cap on false positives.

## Fixed here (sha256, first 16 hex, at the commit that adds this file)

| File | Hash |
|---|---|
| `product/shared/safety/sets/heldout-9.json` | `830080be372c231d` |
| `product/shared/safety/sets/dev-lookalike-9.json` | `335647f6a0f0e6d2` |
| `product/shared/safety/judge.json` (prompt A) | `1d467ad8ee1ad73e` |
| `product/shared/safety/prompts/caller_crisis.risk100.txt` (prompt B) | `14fcc3ac8fcb181a` |
| `product/shared/safety/rules.json` (floor) | `89e5829327dcd594` |
| `product/shared/safety/cases.json` | `714e3158a49d088e` |
| `product/scripts/judge-eval.mjs` | `aa2b4e1fdbf82ecb` |

**Model and run conditions**
- Model: Gemini 3.5 Flash-Lite (`google/gemini-3.5-flash-lite`), Vertex global OpenAI-compatible endpoint.
- Calls only from the India VM, at most 1 request per second, concurrency 1.
- `timeout_ms` is 1,500 as in judge.json. A timed-out line counts as "the judge did not flag it".

**Candidates**
- A: the system prompt in judge.json, as committed.
- B: `prompts/caller_crisis.risk100.txt`, via `--prompt-file`. It asks for an anchored integer risk score from 0 to
  100; both doors read `risk / 100` as the confidence.

**DEV**, crisis task only. Both candidates run on:
1. `--source dev-7` (100 crisis, 90 benign);
2. `--set product/shared/safety/sets/dev-lookalike-9.json` (75 crisis, 150 look-alike benign).

The two are pooled into one measure: 175 crisis and 240 benign lines.

**Measure.** Judge-alone figures from the sweep, at each threshold `t` on the grid 0.30, 0.35, … 0.95:
- `R(t)`, recall: crisis lines with confidence ≥ t;
- `F(t)`, false positives: benign lines with confidence ≥ t.

Point estimates decide, not CI bounds.

## The rule, applied mechanically

1. **Admissible:** every (candidate, t) with `F(t) ≤ 0.10` on pooled DEV.
2. **Choose** the admissible pair with the highest `R(t)`. Break ties in this order:
   1. lower `F(t)`;
   2. candidate A;
   3. the higher `t`.
3. **If none is admissible:** candidate A at the lowest `t` with `F(t) ≤ 0.15`.
4. **Otherwise:** candidate A at 0.5, and record that the rule found nothing.

## BLIND 9

Scored ONCE with the chosen (candidate, t). Report:
- judge alone, floor alone, and floor or judge;
- recall and FP, with Wilson 95% intervals, overall and by language;
- unavailable count and p50/p95 latency.

The BLIND 9 sweep may be printed for information but never used to choose. After that, BLIND 9 is spent.

## What the decision applies to

- The chosen `t` becomes judge.json `threshold`. If B is chosen, B's text becomes judge.json `system_prompt`, with
  the Python port in the same push.
- Raise mode and the check-in remain the owner's call: `open.2026-10-23.judge-raise-soft-checkin`.

## Amendment 1 (2026-10-24T04:18:33Z, before any BLIND 9 request and before any candidate DEV run)

Two fixed files changed for work unrelated to the crisis judge (brief review and the T-L1 lint). The rule, the
candidates, the DEV sets and BLIND 9 are unchanged.

| File | New hash (sha256, first 16 hex) | What changed | Effect on this measurement |
|---|---|---|---|
| `product/shared/safety/rules.json` | `846bab6697b31ad2` | Only the `lint` section: the T-L1 honest-disclosure exemption no longer applies after a negation | None. These sections are unchanged (canonical JSON sha256, first 16 hex): `caller` `dd62d45c5980fdbf`, `lexicon` `5e6c579b3359bd69`, `normalisation` `a74f790f10632b1a` |
| `product/scripts/judge-eval.mjs` | `a790b0a86d705963` | `--task brief-review` rows may carry a persona object | None. Crisis rows carry no persona |

## Amendment 2 (2026-10-24T04:57:13Z, after BLIND 9 scoring had started on the tree registered by Amendment 1)

The scoring run uses the registered tree, and nothing below changes it. These edits come later, for
open.2026-10-24.crisis-manipulation-lint-in-safety. They touch config lint only:
- `rules.json` gains `lint.T-L6` and `lint.T-L7`;
- `cases.json` gains 17 `lintAgentConfig` vectors.

Unchanged (canonical JSON sha256, first 16 hex):
- `caller` `dd62d45c5980fdbf`;
- `lexicon` `5e6c579b3359bd69`;
- `normalisation` `a74f790f10632b1a`;
- `cases.json` `callerSignals` vectors `75101afbd4964e8f`.

New file hashes:
- `rules.json` `b60165821358c654`;
- `cases.json` `cee3c0441af5f4dd`.
