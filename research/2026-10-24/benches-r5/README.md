# Analysis bench, round 5 (after 2cdf64b's objection fix), real Azure models, 2026-10-24

What ran: round 4's analysis bench (`../benches-r4/`), through a copy of its harness, on the same two Azure deployments.
Every run was strictly sequential, at most 1 request a second. This is analysis only: no Operator runs.

- `product/scripts/analysis-bench.ts --split dev`, gpt-4.1-mini, **one pass per contract arm** of 2cdf64b's
  `--prompt-variant`, as its commit message asks ("please run the DEV ablation (4 arms)"):
  - `current`: the product contract. It is the gate, read against a stop rule written before the run;
  - `r4-table`: b1a80cf exactly;
  - `r3-stance`: bfa7ee7's outcome sentence;
  - `no-outcome-rules`.
- `product/scripts/analysis-bench.ts --split test` on `current`, the 42 TEST calls and the 16-call TEST cross slice,
  **two passes each**:
  - gpt-4.1-mini single;
  - tiered (mini first, escalating to gpt-4.1, threshold 0.6);
  - gpt-4.1 single, the reference only. It ran because the cap allowed it after the others.

| | |
|---|---|
| Date | 2026-10-24. DEV 02:10:52-02:19:03 UTC, TEST 02:19:29-02:28:24, gpt-4.1 reference 02:28:39-02:33:44 |
| Tree | **`ab5dade4726174f32ce195959613bc7dfa11ab5c`** (origin/claude/serene-franklin-9w7f1v), a detached worktree, unmodified. It contains `2cdf64b`. `node_modules` was symlinked from the main checkout: `package.json` and `package-lock.json` are byte-identical (`cmp`) |
| Models | **gpt-4.1-mini** (served `gpt-4.1-mini-2025-04-14`, Azure Standard, regional South India). **gpt-4.1** (served `gpt-4.1-2025-04-14`, Azure GlobalStandard). The same deployments as rounds 1-4 |
| Purposes | As in round 4: every purpose uses the deployment in `VP_LLM_DEFAULT_*`, and `VP_ANALYSIS_MODELS` is unset. In tiered mode, `call_analysis_setting` names both models, and the cross-call insight runs on mini. The crisis judge was off (the bench default) |
| Prices | prices.ts list prices at ₹95/$. gpt-4.1-mini: ₹41.8 in / ₹167.2 out per 1M tokens. gpt-4.1: ₹190 in / ₹760 out per 1M tokens |
| Spend | **₹40.10** against a cap of ₹60: 404 successful requests, 0 HTTP errors, 0 retries on 429, 0 refusals by the cap |

## What changed since round 4 (`8e3440a` → `ab5dade`)

| Commit | Change |
|---|---|
| `2cdf64b` | **Analysis contract.** The KIND header becomes "one entry per PERSON line that shows it, whatever the OUTCOME; one line can show two kinds". The objection line becomes "PERSON gives a reason against, complains or raises a concern. Every complaining PERSON line is an objection, even when the PERSON agrees later: then list both, the objection and the commitment." (`calls/analysis.ts:60-63`). The outcome table is kept. The bench gains `--prompt-variant`, which is refused on TEST |

Nothing else in the window touches the analysis prompt, the cases or the scoring:
- `analysis-bench/cases.ts` is byte-identical to `8e3440a`;
- `analysis-bench.ts` differs only by the `--prompt-variant` plumbing;
- `analysis.ts` at `2cdf64b^` is byte-identical to `8e3440a`;
- `llm.ts` changed only the wording of a missing-model error (`0250867`).

The DEV/TEST split is identical: `splits.json` was regenerated at `ab5dade` and `cmp`'d against round 4's.

**The ablation arms reproduce the contracts they name.** `harness/variant-probe.ts` (no model; output in
`harness/variant-probe.out.json`) compares `analysisPrompt()` at `ab5dade` with the same function at `8e3440a` and at
`bfa7ee7`. It checks the bench's outcome definition and a call with no outcome question:
- `r4-table` is byte-identical to round 4's prompt (2/2 inputs);
- `r3-stance` is byte-identical to round 3's (2/2);
- `current` differs from round 4's in exactly the two lines above.

Input tokens per call: 714.6 → **754.6** (+40, +5.6%).

## Stop rule and how the results would be read (written before the first request)

`harness/dev-stop-rule.txt`: its mtime is 02:10:46 UTC, and the first ledger request is 02:10:55 UTC.
- **Stop** if DEV `current` outcome is ≤ 38/42, or its objection recall is below round 4's 9/11. Kept from rounds 3-4:
  also stop if moments < 32/36 or commitments < 7/11.
- **"Regression fixed"**: objection recall over the mini-first runs is ≥ 50/51, and each of round 4's 5 loss calls keeps
  its objection in every run.
- **"Outcome gains kept"**: each mini-first TEST pass is ≥ 40/42, and no pass shows a loss against round 4 with
  p < 0.05.
- **"The table crowds out objections"**: claimed only if `r4-table` misses ≥ 2 objections that both `r3-stance` and
  `no-outcome-rules` keep.

## DEV: the four contract arms (gpt-4.1-mini, n = 42 calls, one pass each)

| Field | **current** (product) | r4-table (b1a80cf) | r3-stance (bfa7ee7) | no-outcome-rules | r4 DEV (8e3440a) | r3 DEV (cd94b63) |
|---|---|---|---|---|---|---|
| **Outcome** | **40/42** (CI 84.2-98.7) | **42/42** (CI 91.6-100) | 38/42 | 37/42 | 42/42 | 38/42 |
| Outcome misses | wrong_person → null ×1, complaint → null ×1 | none | wrong_person → null ×3, opt_out → callback ×1 | wrong_person → null ×3, complaint → null ×2 | none | wrong_person → null ×2, complaint → null ×1, opt_out → callback ×1 |
| **Objections** | **11/11** | **11/11** | 11/11 | 9/11 | 9/11 | 11/11 |
| Moments | 36/36 | 36/36 | 36/36 | 34/36 | 34/36 | 36/36 |
| Commitments | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 |
| Every moment found | 42/42 | 42/42 | 42/42 | 40/42 | 40/42 | 42/42 |
| Reason code / grounded quotes | 42/42 / 108/108 | 42/42 / 111/111 | 42/42 / 105/105 | 42/42 / 105/105 | 42/42 / 108/108 | |
| Input tokens per call | 755.2 | 715.2 | 655.2 | 568.2 | 714.6 | 654.6 |
| Run spend (ledger) | ₹2.15 | ₹2.09 | ₹2.00 | ₹1.83 | ₹2.12 | |

**Stop rule: not met.** `current` scored outcome 40 (the bar is ≤ 38), objections 11/11, moments 36/36 and commitments
11/11, so TEST ran.

Exact McNemar, same 42 DEV ids. Each cell gives (left right only, right right only, p):

| Pair | Outcome | Objection, per call |
|---|---|---|
| r4 DEV → current | 2 lost, 0 gained, p = 0.5 | 0 lost, 2 gained, p = 0.5 |
| **r4 DEV → r4-table (same prompt, a new run)** | **0 discordant** | **0 lost, 2 gained, p = 0.5** |
| r3 DEV → r3-stance (same prompt, a new run) | 1 vs 1, p = 1.0 | 0 discordant |
| current vs r4-table (same round) | current 0, r4-table 2 (complaint.telecom, wrong_person.telecom), p = 0.5 | 0 discordant |
| current vs r3-stance | current 3, r3-stance 1, p = 0.625 | 0 discordant |
| current vs no-outcome-rules | current 4, no-rules 1, p = 0.375 | current 2, no-rules 0, p = 0.5 |
| r4-table vs r3-stance | r4-table 4, r3-stance 0, p = 0.125 | 0 discordant |

**What the ablation shows:**
- **Round 4's DEV objection losses did not reproduce with round 4's own prompt.** `r4-table` kept complaint.lending and
  objection_resolved.telecom, and found 11/11. Its outcome matched round 4 call for call. So on DEV, the round 4 loss
  of 2 objections is within run-to-run variance.
- **The pre-registered "table crowds out objections" claim is not shown.** `r4-table` missed 0 objections.
  `no-outcome-rules` was the only arm to lose objections (complaint.healthcare, objection_resolved.lending).
- Both old contracts reproduce their own rounds' outcome patterns:
  - `r3-stance` repeats round 3's wrong_person → null and opt_out → callback;
  - `r4-table` repeats round 4's 42/42.
- The table is what fixes wrong_person: 0 misses with it, against 3 in each arm without it.
- **On DEV this pass, `current` cost 2 outcomes against `r4-table` (p = 0.5) and gained no objections.** Both
  outcome misses were false nulls. The same pattern is larger on TEST (below).
- **`decision.2026-10-24.objection-always-a-moment`, its `reverse_if` on DEV:**
  - "current still drops objections": no, 11/11;
  - "the loss is noise against r3-stance": yes. r4-table and r3-stance are both 11/11, and round 4's DEV loss did not
    reproduce.

  DEV cannot test the systematic case. objection_resolved.realestate, lost in 4/4 round 4 runs, is a TEST call, and
  ablations are refused on TEST.

## TEST (n = 42 calls; 39 reach the model; 16-call cross slice), two passes per design, contract `current`

| Field | **gpt-4.1-mini p1 / p2** | **tiered p1 / p2** | gpt-4.1 p1 / p2 (reference) | mini r4 | tiered r4 | gpt-4.1 r4 |
|---|---|---|---|---|---|---|
| **Outcome** | **38/42 (CI 77.9-96.2) / 39/42 (CI 81.0-97.5)** | **42/42 / 42/42** (CI 91.6-100) | 42/42 / 42/42 | 42 / 41 | 42 / 42 | 42 / 42 |
| Outcome, mean of passes | **38.5/42, 91.7% (CI 79.4-96.9)** | 42/42, 100% | 42/42, 100% | 41.5 | 42.0 | 42.0 |
| Outcome misses | p1: complaint → null ×3, wrong_person → null ×1; p2: complaint → null ×2, wrong_person → null ×1 | none | none | p2: complaint → null ×1 | none | none |
| **Objections** | **10/10 / 10/10** | **10/10 / 10/10** | 10/10 / 10/10 | 9 / 8 | 8 / 9 | 10 / 10 |
| Moments | 36/36 / 36/36 | 36/36 / 36/36 | 36/36 / 36/36 | 35 / 34 | 34 / 35 | 36 / 36 |
| Commitments | 10/10 / 10/10 | 10/10 / 10/10 | 10/10 / 10/10 | 10 / 10 | 10 / 10 | 10 / 10 |
| Every moment found | 42/42 / 42/42 | 42/42 / 42/42 | 42/42 / 42/42 | 41 / 40 | 40 / 41 | 42 / 42 |
| Reason code, follow-ups owed, opt-out recall (analysis and floor) | 42/42, 42/42, 5/5 both | same | same | same | same | same |
| Grounded quotes | 108/108, 108/108 | 113/113, 112/112 | 130/130, 126/126 | 100/100, 99/99 | 99/99, 102/102 | 136/136, 135/135 |
| Off-key moments proposed (precision not measured) | 9, 8 | 10, 8 | 7, 9 | 5, 5 | 5, 5 | 13, 12 |
| Cross slice: planted themes | 3/3, **2/3** (already_have missed) | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 |
| Pass-to-pass outcome disagreement | 1/42 (complaint.realestate) | 0/42 | 0/42 | 1/42 | 0/42 | 0/42 |
| Pass-to-pass, any field | 4/42 | 4/42 | 3/42 | 5/42 | 4/42 | 3/42 |
| Escalated | | **2/39, 5.1% (CI 1.4-16.9), both passes** | | | 0/39, 1/39 | |
| Input / output tokens per model-analysed call | 754.6 / 111.9 | 754.7 / 116.4 (incl. escalations) | 754.6 / 162.5 | 714.6 / 104.9 | | 714.6 / 175.5 |
| **Cost per model-analysed call** (bench cost lines; tiered priced per model) | **₹0.0503 / ₹0.0502** | **₹0.0654 / ₹0.0651** | ₹0.265 / ₹0.269 | ₹0.047 | ₹0.047 / ₹0.056 | ₹0.269 / ₹0.270 |
| 3-minute call, `ANALYSIS-COST.md`'s token model [inference] | ₹0.073 | 0.073 + 0.051 × 0.38 = **₹0.093** | ₹0.38 (over the ₹0.17 budget) | ₹0.073 | ₹0.078 | ₹0.38 |
| 3-minute call, re-based on this round's prompt [inference] | ₹0.075 | ₹0.095 | ₹0.381 | ₹0.073 | ₹0.077 | ₹0.383 |
| Run spend (ledger, incl. the insight request) | ₹2.10 / ₹2.13 | ₹2.69 / ₹2.70 | ₹11.13 / ₹11.28 | ₹1.99 / ₹2.01 | ₹2.01 / ₹2.34 | ₹11.14 / ₹11.31 |

### The regression under test: objection recall over the mini-first runs

The mini-first runs are DEV (`current` in round 5), mini p1, mini p2, tiered p1 and tiered p2: 51 (run, call) pairs.
Every objection call has exactly one objection moment, so per-call recall and per-moment recall are the same.

| | Round 3 (cd94b63) | Round 4 (8e3440a) | **Round 5 (ab5dade)** |
|---|---|---|---|
| Objection recall, (run, call) pairs | 51/51 | 43/51 | **51/51** |
| r4 → r5, exact McNemar on the 51 pairs | | | **8 gained, 0 lost, p = 0.0078** |
| r4 → r5, mini's own records only (pairs escalated to gpt-4.1 in either round excluded) | | 39/47 | **47/47; 8 gained, 0 lost, p = 0.0078** |
| r4 → r5, distinct calls (sign test) | | | 5 better, 0 worse, p = 0.0625 |
| r3 → r5 | | | 0 discordant |

**Round 4's 5 loss calls, run by run (✓ = objection listed):**

| Call | Runs | r3 | r4 | **r5** |
|---|---|---|---|---|
| complaint.lending.hinglish | DEV | ✓ | ✗ | **✓** |
| objection_resolved.telecom.hinglish | DEV | ✓ | ✗ | **✓** |
| objection_resolved.realestate.hinglish | mini p1, mini p2, tiered p1, tiered p2 | ✓✓✓✓ | ✗✗✗✗ | **✓✓✓✓** |
| objection_resolved.ecommerce.hinglish | mini p1, p2, tiered p1, p2 | ✓✓✓✓ | ✓✗✓✓ | **✓✓✓✓** |
| complaint.realestate.hinglish | mini p1, p2, tiered p1, p2 | ✓✓✓✓ | ✓✓✗✓ | **✓✓✓✓** |

**All 5 came back in every run, with no new objection miss.** The pre-registered "regression fixed" condition is met:
51/51 ≥ 50/51, and every loss call recovered.
- objection_resolved.realestate is the systematic one: lost in 4/4 round 4 runs, kept in 4/4 here.
- The two DEV calls also came back under `r4-table` in this round (above), so for them the DEV evidence is variance,
  not the fix.

### What it cost: mini's false nulls are back on complaint and wrong-person calls

| mini single, DEV (`current`) + TEST p1 + p2 | Round 4 | **Round 5** |
|---|---|---|
| Outcome, (run, call) pairs | 125/126 | **117/126** |
| r4 → r5, exact McNemar [exploratory: not pre-registered; pairs share call ids across passes] | | **0 gained, 8 lost, p = 0.0078** |
| Distinct calls (sign test) | | 0 better, 6 worse (complaint.ecommerce, .education, .realestate, .telecom; wrong_person.realestate, .telecom), p = 0.031 |
| complaint template | 8/9 | **3/9** |
| wrong_person template | 9/9 | **6/9** |

Per pass, r4 → r5, exact McNemar on outcome:
- p1: 4 lost, 0 gained, p = 0.125;
- p2: 2 lost, 0 gained, p = 0.5;
- crossed (r4 p2 → r5 p1 and r4 p1 → r5 p2): 3 lost each, p = 0.25.

**No single pass reaches p < 0.05, but both passes are below the pre-registered 40/42 (38 and 39), so "outcome gains
kept" is not met for mini single.**

What the misses look like (from each run's database):
- On every complaint-template call, in every `current` run, mini now names `CONV_NEEDS_HUMAN`; under `r4-table` it named
  `CONV_COMPLAINT`. The key accepts both, so reason codes stay 42/42.
- On 6 of 9 such (run, call) pairs it then records no outcome. It still lists the objection.
- `outcomeUnclear` is empty on every miss, so the quote check dropped nothing: the model returned no outcome, or a value
  outside the list.
- wrong_person.realestate → null in both passes, and wrong_person.telecom → null on DEV.

**Cause [inference].** The new KIND and objection lines are the only prompt change. On DEV in the same round,
`r4-table` got both of `current`'s misses right (p = 0.5). TEST cannot be ablated, so this is not confirmed.

### Tiered's escalations (2/39 in each pass; round 4: 0, 1)

| Pass | Call | Why | Key | Final | Did |
|---|---|---|---|---|---|
| p1 | complaint.ecommerce.hinglish | first pass gave no outcome | needs_human | needs_human | fixed a wrong null |
| p1 | complaint.education.hinglish | first pass gave no outcome | needs_human | needs_human | fixed a wrong null |
| p2 | wrong_person.realestate.hinglish | first pass gave no outcome | wrong_person | wrong_person | fixed a wrong null |
| p2 | complaint.ecommerce.hinglish | first pass gave no outcome | needs_human | needs_human | fixed a wrong null |

- **All 4 escalations fixed a wrong null.** None was on low confidence, and no second pass failed.
- Skipped, per pass:
  - 11 engine-decided calls;
  - 3 language-mismatch calls ("the first pass found a reason on which no outcome is recorded").
- The escalated pass's whole record counts, moments included (`calls/analysis.ts:370-371`). The 3 escalated complaint
  call-passes therefore carry gpt-4.1's moments. The "mini's own records only" row above excludes them, and recall is
  still 47/47.
- Tiered's first passes were mini on `current`. They got some of mini single's same-pass misses right without
  escalating: wrong_person.realestate and complaint.realestate in p1, complaint.education in p2. This is pass-to-pass
  variance. Every call mini single missed was right in tiered, escalated or not.

### Paired tests, design against design (exact McNemar on outcome, same 42 TEST ids)

| Pair | p1 | p2 |
|---|---|---|
| mini vs tiered | 0 vs 4, p = 0.125 | 0 vs 3, p = 0.25 |
| mini vs gpt-4.1 | 0 vs 4, p = 0.125 | 0 vs 3, p = 0.25 |
| tiered vs gpt-4.1 | 0 discordant | 0 discordant |
| tiered r4 → r5, gpt-4.1 r4 → r5 | 0 discordant | 0 discordant |

On moments, objections and commitments, every design pair is identical in both passes (0 discordant).

## `decision.2026-10-23.analysis-default-mini-single`: does it stand?

Its `reverse_if`: two TEST passes per design show gpt-4.1 or tiered ahead of mini by more than 4/42 on outcome (or on
moments/commitments), at a cost inside the ₹0.17 budget for a 3-minute call.

| Against mini | Outcome ahead by, p1 / p2 / mean | Moments / objections / commitments ahead by | Cost for a 3-minute call | Reverse condition met? |
|---|---|---|---|---|
| tiered | **4 / 3 / 3.5** | 0 / 0 / 0 | ₹0.093 (a), ₹0.095 (b) [inference]: inside | **No, by 0.5**: 3.5 is not more than 4 |
| gpt-4.1 | 4 / 3 / 3.5 | 0 / 0 / 0 | about ₹0.38: over budget | No |

**By its letter it stands, but only just.**
- In round 4, tiered was ahead by 0.5. This round it is ahead by 3.5, 0.5 short of the bar: on p1 it is ahead by
  exactly 4, and the rule needs more than 4.
- The gap reopened because 2cdf64b brought back mini's false nulls, not because tiered or gpt-4.1 changed (0
  discordant against round 4 for both).
- Mini at 38.5/42 is close to round 3's 37.0, the level at which this decision was first taken at the line.

## Recommendations

**(a) The objection regression is fixed: keep that part of 2cdf64b.**
- Objection recall over the mini-first runs is 51/51 (round 4: 43/51; p = 0.0078).
- All 5 loss calls are back in every run.
- Moments, objections and commitments are now equal across all three designs.

**(b) On mini single, 2cdf64b also costs outcome, and that is not acceptable for the default as it stands.**
- Mini single outcome on TEST is 38/39 (round 4: 42/41), from false nulls on complaint (3/9) and wrong_person (6/9).
- Next is a contract that keeps the objection line but does not move complaint calls to a null outcome. Two candidates
  [inference]:
  - drop "whatever the OUTCOME" from the KIND header;
  - put the moment rules after OUTCOME, the alternative `decision.2026-10-24.objection-always-a-moment` itself names.
- Measure it on DEV with **at least two passes per arm**: one pass per arm could not separate round 4's DEV loss from
  variance.
- Then run two TEST passes.

**(c) `decision.2026-10-23.analysis-default-mini-single` stands by its `reverse_if` (tiered ahead by 3.5, the bar is
more than 4), with a margin of 0.5.**
- Tiered is the design that is unaffected: 42/42 both passes, all four escalations fixed a wrong null, about ₹0.093 for
  a 3-minute call, inside the budget.
- If (b) is not fixed before the next ship, tiered is the cheaper hedge against mini's false nulls. That is a decision
  for the integrator, not something this round measured as a reversal.

**(d) `decision.2026-10-24.objection-always-a-moment`, its `reverse_if` clause "the loss is noise against r3-stance"
is met on DEV.** r4-table found 11/11, and round 4's DEV loss did not reproduce with the same prompt. On TEST, the
systematic loss (objection_resolved.realestate, 0/4 → 4/4) did come back, which supports the fix there.

## Method

The harness is a copy of round 4's (`../benches-r4/harness/`), in `harness/`. `azure-guard.mjs` is byte-identical to
`../../2026-10-23/benches/harness/azure-guard.mjs` (checked with `cmp`) and is not copied again.

| Setting | Round 5 |
|---|---|
| Worktree | `/dev/shm/wt-bench5`, detached at `ab5dade` |
| Postgres cluster | private, `/dev/shm/vp-pgbench5:55437` (tmpfs; `fsync=off`; `initdb -U vp --auth=trust` as in `product/scripts/pg-test.sh`), a fresh migrated DB per run |
| Ledger | its own, fresh |
| Global cap | ₹60 (round 4: ₹220) |
| Per-run caps | round 4's (mini ₹9.4, gpt-4.1 ₹31.3, tiered ₹18.8), each lowered to what remains of ₹60 if less |

Changes to the scripts:
- `run.sh`, `mkdb.sh`, `splits.ts`: paths, the ledger and the cap only.
- `post.py`: destination and paths. It also strips a DEV arm suffix from the label (`dev-gpt-4.1-mini.<arm>`) before
  the design lookup.
- `all.sh`, stages for an analysis-only round:
  - `dev`: the four arms, `current` first;
  - `test`: mini and tiered, p1 of each, then p2 of each;
  - `ref`: gpt-4.1, each pass only if ₹13 of the cap remains;
  - no operator stage.
- `stats.py`: rewritten for round 4 → round 5. It reuses round 4's `wilson`, `mcnemar`, `amet` and `disagree`, and
  adds:
  - per-call objection McNemar;
  - the DEV arm comparisons;
  - the mini-first objection pool and the 5 calls run by run;
  - the exploratory pooled outcome view.
- New (no model calls): `variant-probe.ts`, which checks that each arm reproduces the contract it names.

Run order: DEV `current`, r4-table, r3-stance, no-outcome-rules; TEST mini p1, tiered p1, mini p2, tiered p2; gpt-4.1
p1, p2.

Other method notes:
- `harness/post.py` copies outputs, scrubs hostnames and deployment names, then asserts that none remain.
- `harness/stats.py` writes `comparison.json`.
- Run logs stay in the scratchpad.
- The run databases were read for `outcomeUnclear` and reason codes, then removed with the cluster.

### Spend (harness ledger, ₹ at prices.ts list rates)

| Run | Requests | ₹ |
|---|---|---|
| analysis DEV, gpt-4.1-mini: current / r4-table / r3-stance / no-outcome-rules | 40 / 40 / 40 / 40 | 2.15 / 2.09 / 2.00 / 1.83 |
| analysis TEST, gpt-4.1-mini p1 / p2 | 40 / 40 | 2.10 / 2.13 |
| analysis TEST, tiered p1 / p2 | 42 / 42 | 2.69 / 2.70 |
| analysis TEST, gpt-4.1 p1 / p2 (reference) | 40 / 40 | 11.13 / 11.28 |
| **Total** | **404** | **40.10** |

The DEV ablation and the mini and tiered TEST passes cost ₹17.69. The gpt-4.1 reference cost ₹22.41.

## Not verified

- **The cause of mini's false nulls.** The contract lines are the only prompt change, and on DEV the same-round
  r4-table control was right where current was wrong (2 vs 0, p = 0.5). TEST cannot be ablated, and one DEV pass per
  arm is small.
- **The cause of round 4's objection loss.** On DEV it did not reproduce with round 4's prompt. On TEST the fix
  restored the systematic call, but no TEST control exists.
- **Run-to-run variance on DEV arms:** one pass each.
- **Moment precision.** Off-key moments are 8-10 per pass on mini and tiered, against 5 in round 4.
- **The crisis judge:** off.
- **Real-traffic escalation rate and 3-minute cost.** These use `ANALYSIS-COST.md`'s token model with the bench's e.
- **The Azure meter**, as opposed to list prices.
