# Analysis bench, round 6 (95339a6's contract arms for mini single's false nulls), real Azure models, 2026-10-24

What ran: round 5's analysis bench (`../benches-r5/`), through a copy of its harness, on the same two Azure deployments.
Every run was strictly sequential, at most 1 request a second. This is analysis only: no Operator runs.

- `product/scripts/analysis-bench.ts --split dev --model <gpt-4.1-mini> --prompt-variant <arm>`, **two passes per arm**,
  as 95339a6's commit message asks ("Ready for DEV, two passes per arm"). The arms:
  - `current`: the product as shipped;
  - 95339a6's three candidates: `r5-short-objection`, `r5-outcome-first` and `r5-moment-not-outcome`.
- The winner is chosen by a selection rule written before the first request (`harness/dev-select-rule.txt`). It is
  **`r5-outcome-first`**.
- `--split test` on the winner only:
  - gpt-4.1-mini single, two passes;
  - tiered once (mini first, gpt-4.1 at threshold 0.6), with the winner's prompt, to check that tiered still scores
    42/42.

| | |
|---|---|
| Date | 2026-10-24. DEV 04:15:14-04:32:39 UTC, TEST 04:33:10-04:39:49 |
| Tree | **`839292db0bff5e5669beab2f5307e9ac9b213eeb`** (origin/claude/serene-franklin-9w7f1v), a detached worktree. It contains `95339a6`. `node_modules` was symlinked from the main checkout: `package.json` and `package-lock.json` are byte-identical (`cmp`). The only file added to the tree was a TEST harness copy (below), removed after the runs |
| Models | **gpt-4.1-mini** (served `gpt-4.1-mini-2025-04-14`, Azure Standard, regional South India). **gpt-4.1** (served `gpt-4.1-2025-04-14`, Azure GlobalStandard), used only as tiered's second reader. The same deployments as rounds 1-5 |
| Purposes | As in round 5: every purpose uses the deployment in `VP_LLM_DEFAULT_*`, and `VP_ANALYSIS_MODELS` is unset. `--model` writes `call_analysis_setting` (single, or tiered with `--escalate-model`). The cross-call insight runs on mini. The crisis judge was off (the bench default) |
| Prices | prices.ts list prices at ₹95/$. gpt-4.1-mini: ₹41.8 in / ₹167.2 out per 1M tokens. gpt-4.1: ₹190 in / ₹760 out per 1M tokens |
| Spend | **₹23.91** against a cap of ₹60: 440 successful requests, 0 HTTP errors, 0 retries on 429, 0 network errors, 0 refusals by the cap |

## Answer

**Yes: `r5-outcome-first` keeps the objection line and removes mini single's false nulls.** That arm is current's lines,
unchanged, with the OUTCOME block moved before KIND.

| gpt-4.1-mini single | DEV, 2 passes | TEST, 2 passes | Objections, mini-first runs |
|---|---|---|---|
| `current` (round 6 DEV; round 5 TEST) | 41, 40 (mean 40.5) | round 5: 38, 39 (mean 38.5) | round 5: 51/51 |
| **`r5-outcome-first`** | **42, 42 (mean 42.0)** | **42, 42 (mean 42.0, CI 91.6-100)** | **52/52** |
| Complaint and wrong_person false nulls | current 3 of 12 (pass, call) pairs; outcome-first 0 of 12 | round 5 current 7 of 12; outcome-first 0 of 12 | |

## What changed since round 5 (`ab5dade` → `839292d`)

| Commit | Change |
|---|---|
| `95339a6` | **Contract arms.** `PROMPT_VARIANTS` gains `r5-short-objection`, `r5-outcome-first` and `r5-moment-not-outcome` (`calls/analysis.ts:33-87`). **Default.** Tiered becomes the product default for a workspace that never chose (`defaultAnalysisSetting`), so `--model` now pins single. **Bench.** Gains `--passes N` and the fields `objectionRecall`, `outcomeComplaint` and `outcomeWrongPerson` |

Nothing else in the window touches the analysis prompt, the cases or the scoring:
- `analysis-bench/` (cases) is byte-identical to `ab5dade`;
- `analysis-bench.ts` differs only by `--passes` and the three fields;
- `llm.ts` only adds a purpose name (`brief_review`);
- `shared/safety/rules.json` changed crisis-floor patterns, and the crisis field is 42/42 in every run;
- the rest of `analysis.ts`'s diff is the default setting and monitor hysteresis, which are outside the bench's path.

The DEV/TEST split is identical: `splits.json` was regenerated at `839292d` and `cmp`'d against round 5's.

**The four arms that existed in round 5 build byte-identical prompts.** `harness/variant-probe.ts` (no model; output in
`harness/variant-probe.out.json`) checks this for `current`, `r4-table`, `r3-stance` and `no-outcome-rules`. Each matches
round 5's tree `ab5dade` on 2/2 inputs: the bench's outcome definition, and a call with no outcome question. 95339a6's
claim is confirmed for those arms.

Each new arm against `current`, on the bench's outcome definition:

| Arm | Lines only in the arm | Lines only in current | Line-diff distance | Input tokens per call |
|---|---|---|---|---|
| `current` | | | 0 | 755.2 |
| `r5-moment-not-outcome` | "- a moment never decides or blocks the OUTCOME: a complaint that asks for a human is an objection AND the needs-human VALUE" | none | 1 | 782.2 |
| `r5-short-objection` | the old KIND header; "- objection: PERSON gives a reason against, or a complaint, also when they agree later" | 2cdf64b's KIND header and objection line | 4 | 721.2 |
| `r5-outcome-first` | none (the same 26 lines) | none | 18 (one 9-line block moved) | 755.2 |

## Selection rule (written before the first request)

`harness/dev-select-rule.txt`: its mtime is 04:14:17 UTC. The first ledger request is 04:15:14 UTC, and the ledger did not
exist before.
- **Eligible:** on both DEV passes, objections 11/11, moments ≥ 35/36 and commitments 11/11.
- **Winner:** the eligible arm with the highest mean DEV outcome over its two passes.
- **Ties:** go to the arm closest to current, by the line-diff distance above (current < moment-not-outcome <
  short-objection < outcome-first).
- **No eligible arm:** stop before TEST.

The same file fixes, before TEST:
- how TEST is read;
- the replace criteria: the `closes_when` of `open.2026-10-24.analysis-contract-objections-and-outcome`, plus moments,
  commitments and no loss against round 5;
- how `decision.2026-10-24.analysis-default-tiered` is read.

## DEV: two passes per arm (gpt-4.1-mini single, n = 42 calls; 39 reach the model)

| Field | current (product) p1 / p2 | r5-short-objection p1 / p2 | **r5-outcome-first p1 / p2** | r5-moment-not-outcome p1 / p2 | r5 DEV current (1 pass) | r5 DEV r4-table (1 pass) |
|---|---|---|---|---|---|---|
| **Outcome** | 41 / 40 | 40 / 41 | **42 / 42** | 41 / 41 | 40 | 42 |
| **Mean of passes** | 40.5 | 40.5 | **42.0** | 41.0 | | |
| Outcome misses (every one a false null) | p1 wrong_person.telecom; p2 wrong_person.healthcare, complaint.healthcare | p1 complaint.lending, complaint.healthcare; p2 complaint.telecom | **none** | p1 complaint.healthcare; p2 wrong_person.healthcare | wrong_person.telecom, complaint.telecom | none |
| Complaint template | 3/3 / 2/3 | 1/3 / 2/3 | **3/3 / 3/3** | 2/3 / 3/3 | 2/3 | 3/3 |
| Wrong-person template | 2/3 / 2/3 | 3/3 / 3/3 | **3/3 / 3/3** | 3/3 / 2/3 | 2/3 | 3/3 |
| **Objections** | 11/11 / 11/11 | **9/11** / 11/11 (p1 missed objection_resolved.lending, .telecom) | 11/11 / 11/11 | 11/11 / 11/11 | 11/11 | 11/11 |
| Moments | 36/36 / 36/36 | **34/36** / 36/36 | 36/36 / 36/36 | 36/36 / 36/36 | 36/36 | 36/36 |
| Commitments | 11/11 both | 11/11 both | 11/11 both | 11/11 both | 11/11 | 11/11 |
| Every moment found | 42/42 both | 40/42 / 42/42 | 42/42 both | 42/42 both | 42/42 | 42/42 |
| Reason code on the 3 complaint calls | CONV_NEEDS_HUMAN 3, 3 | CONV_NEEDS_HUMAN 2 + CONV_COMPLAINT 1, both | CONV_NEEDS_HUMAN 3, 3 | CONV_NEEDS_HUMAN 3, 3 | NEEDS_HUMAN 3 | COMPLAINT 3 |
| Reason code, follow-ups, crisis | 42/42 each, every arm and pass | | | | | |
| Grounded quotes | 113/113, 108/108 | 104/104, 106/106 | 117/117, 115/115 | 108/108, 109/109 | 108/108 | 111/111 |
| Off-key moments proposed (precision not measured) | 7, 6 | 5, 4 | 6, 5 | 6, 6 | | |
| Cross slice: planted themes | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 | | |
| Pass-to-pass outcome disagreement | 3/42 | 3/42 | **0/42** | 2/42 | | |
| Pass-to-pass, any field | 6/42 | 8/42 | 1/42 (crisis.lending moment set) | 2/42 | | |
| Output tokens per call | 118.2, 114.9 | 112.6, 113.8 | 123.7, 122.9 | 114.3, 115.1 | | |
| Cost per model-analysed call | ₹0.0513, ₹0.0508 | ₹0.0490, ₹0.0492 | ₹0.0523, ₹0.0521 | ₹0.0518, ₹0.0519 | | |
| Run spend (ledger) | ₹2.17, ₹2.15 | ₹2.08, ₹2.09 | ₹2.22, ₹2.21 | ₹2.20, ₹2.22 | | |
| **Eligible** | yes | **no** (p1: objections 9/11, moments 34/36) | **yes** | yes | | |

**Selection: `r5-outcome-first`.** Eligible arms: current (40.5), r5-outcome-first (42.0), r5-moment-not-outcome
(41.0). There was no tie, so the tie-break was not used.

- The run databases were read for every miss (`db-misses.json`). On every false null, `outcomeUnclear` and
  `outcomeConfidence` are empty, so the model gave no outcome and the quote check dropped nothing (as in round 5).
- Under outcome-first, mini still names `CONV_NEEDS_HUMAN` on every complaint call, as current does. It records the
  `needs_human` outcome as well.
- So the reason-code switch that round 5 saw (`CONV_COMPLAINT` → `CONV_NEEDS_HUMAN`) is not what leaves the outcome
  null.

Exact McNemar on outcome, same 42 DEV ids. Each cell is (left right only, right right only, p):

| Pair | p1 | p2 | Both passes pooled [exploratory: pairs share call ids] |
|---|---|---|---|
| current → r5-outcome-first | 0, 1, p = 1.0 | 0, 2, p = 0.5 | **0, 3, p = 0.25** |
| current → r5-moment-not-outcome | 1, 1, p = 1.0 | 0, 1, p = 1.0 | 1, 2, p = 1.0 |
| current → r5-short-objection | 2, 1, p = 1.0 | 1, 2, p = 1.0 | 3, 3, p = 1.0 |
| r5 DEV current → r6 current (same prompt, new runs) | 0, 1, p = 1.0 | 2, 2, p = 1.0 | |
| r5 DEV r4-table → r6 r5-outcome-first | 0 discordant | 0 discordant | |

Objections per call against current, same pass: every arm and pass has 0 discordant, except r5-short-objection p1 (2
lost, p = 0.5).

## TEST (n = 42 calls; 39 reach the model; 16-call cross slice), the winner `r5-outcome-first`

| Field | **gpt-4.1-mini, r5-outcome-first p1 / p2** | **tiered, r5-outcome-first (1 pass)** | r5 mini, current p1 / p2 | r5 tiered, current p1 / p2 | r4 mini p1 / p2 |
|---|---|---|---|---|---|
| **Outcome** | **42/42 / 42/42** | **42/42** | 38 / 39 | 42 / 42 | 42 / 41 |
| Outcome, mean of passes | **42.0/42, 100% (CI 91.6-100)** | | 38.5 | 42.0 | 41.5 |
| Outcome misses | none | none | p1: complaint → null ×3, wrong_person → null ×1; p2: complaint → null ×2, wrong_person → null ×1 | none | p2: complaint.ecommerce → null |
| **Complaint template** | **3/3 / 3/3** | 3/3 | 0/3 / 1/3 | 3/3 / 3/3 | 3/3 / 2/3 |
| **Wrong-person template** | **3/3 / 3/3** | 3/3 | 2/3 / 2/3 | 3/3 / 3/3 | 3/3 / 3/3 |
| **Objections** | **10/10 / 10/10** | 10/10 | 10/10 / 10/10 | 10/10 / 10/10 | 9 / 8 |
| Moments | 36/36 / 36/36 | 36/36 | 36/36 / 36/36 | 36/36 / 36/36 | 35 / 34 |
| Commitments | 10/10 / 10/10 | 10/10 | 10/10 / 10/10 | 10/10 / 10/10 | 10 / 10 |
| Every moment found | 42/42 / 42/42 | 42/42 | 42/42 / 42/42 | 42/42 / 42/42 | 41 / 40 |
| Reason code, follow-ups owed, opt-out recall (analysis and floor), crisis | 42/42, 42/42, 5/5, 42/42 both | same | same | same | same |
| Grounded quotes | 117/117, 120/120 | 119/119 | 108/108, 108/108 | 113/113, 112/112 | 100/100, 99/99 |
| Off-key moments proposed (precision not measured) | 6, 6 | 6 | 9, 8 | 10, 8 | 5, 5 |
| Cross slice: planted themes | 3/3, 3/3 | 3/3 | 3/3, 2/3 | 3/3, 3/3 | 3/3, 3/3 |
| Pass-to-pass outcome disagreement | **0/42** | | 1/42 | 0/42 | 1/42 |
| Pass-to-pass, any field | **0/42** | | 4/42 | 4/42 | 5/42 |
| Escalated | | **0/39, 0% (CI 0.0-9.0)** | | 2/39, 2/39 | |
| Input / output tokens per model-analysed call | 754.6 / 121.6, 124.9 | 754.6 / 122.5 | 754.6 / 111.9 | 754.7 / 116.4 | 714.6 / 104.9 |
| **Cost per model-analysed call** (bench cost lines) | **₹0.0519 / ₹0.0524** | **₹0.0520** (all mini) | ₹0.0503 / ₹0.0502 | ₹0.0654 / ₹0.0651 | ₹0.047 |
| 3-minute call, `ANALYSIS-COST.md`'s token model [inference] | ₹0.073 | 0.073 + 0 × 0.38 = **₹0.073** | ₹0.073 | ₹0.093 | ₹0.073 |
| 3-minute call, re-based on this round's tokens [inference] | ₹0.077 | ₹0.077 | ₹0.075 | ₹0.095 | ₹0.073 |
| Run spend (ledger, incl. the insight request) | ₹2.21 / ₹2.21 | ₹2.17 | ₹2.10 / ₹2.13 | ₹2.69 / ₹2.70 | ₹1.99 / ₹2.01 |

### Exact McNemar against rounds 5 and 4 (mini single TEST, same 42 ids)

Each cell is (earlier round right only, round 6 right only, p).

| Round 6 pass | vs r5 mini, same pass | vs r5 mini, crossed | vs r4 mini, same pass | vs r4 mini, crossed |
|---|---|---|---|---|
| **Outcome** p1 | 0, 4, p = 0.125 | (r5 p2) 0, 3, p = 0.25 | 0 discordant | (r4 p2) 0, 1, p = 1.0 |
| **Outcome** p2 | 0, 3, p = 0.25 | (r5 p1) 0, 4, p = 0.125 | 0, 1, p = 1.0 | (r4 p1) 0 discordant |
| Objection per call, p1 / p2 | 0 discordant / 0 discordant | 0 / 0 | 0, 1, p = 1.0 / 0, 2, p = 0.5 | 0, 2, p = 0.5 / 0, 1, p = 1.0 |
| Every moment, p1 / p2 | 0 / 0 | 0 / 0 | 0, 1 / 0, 2 | 0, 2 / 0, 1 |
| Commitments | 0 discordant everywhere | | | |

Pooled over both passes, (pass, call) pairs [exploratory: not pre-registered; pairs share call ids]:
- **r5 → r6: 7 gained, 0 lost, p = 0.0156.** Over distinct calls, 4 better and 0 worse (sign p = 0.125). The 4 calls
  are complaint.ecommerce, .education and .realestate, and wrong_person.realestate.
- r4 → r6: 1 gained, 0 lost, p = 1.0 (complaint.ecommerce, round 4's one miss).

**No pass loses anything against round 5 or round 4, on any field.** No single-pass gain reaches p < 0.05 (4 and 3
discordant).

**The complaint and wrong_person templates, call by call (TEST):**

| Call | r4 mini p1, p2 | r5 mini (current) p1, p2 | **r6 mini (outcome-first) p1, p2** | r6 tiered |
|---|---|---|---|---|
| complaint.ecommerce | ✓ ✗ | ✗ ✗ | **✓ ✓** | ✓ |
| complaint.education | ✓ ✓ | ✗ ✗ | **✓ ✓** | ✓ |
| complaint.realestate | ✓ ✓ | ✗ ✓ | **✓ ✓** | ✓ |
| wrong_person.ecommerce | ✓ ✓ | ✓ ✓ | **✓ ✓** | ✓ |
| wrong_person.education | ✓ ✓ | ✓ ✓ | **✓ ✓** | ✓ |
| wrong_person.realestate | ✓ ✓ | ✗ ✗ | **✓ ✓** | ✓ |

(✗ is a false null each time.) On all three complaint calls in both passes, mini named `CONV_NEEDS_HUMAN`, recorded
`needs_human` and listed the objection.

### Objection recall over this round's mini-first runs

The runs are DEV winner p1 and p2, TEST mini p1 and p2, and tiered: 52 (run, call) pairs. Recall is **52/52**, against
round 5's 51/51 and round 4's 43/51.
- Tiered escalated nothing, so every pair is mini's own record.
- The pre-registered bar (≥ 51/52, at most one miss) is met.

### Tiered with the winner's prompt

- **42/42, with 0/39 escalated.** It is 0 discordant against round 5's tiered p1 and p2, and against round 6's mini p1
  and p2, on every field.
- Mini's first pass found an outcome on every call, so gpt-4.1 read nothing. Escalation was skipped for:
  - 25 calls, because neither trigger fired: each had an outcome, at confidence 0.9 or more (read from the run
    database);
  - 11 calls, because the engine decided the reason;
  - 3 calls, because the first pass named a no-decision reason.
- The check passes, but **the escalation path on this prompt was not exercised.**

## The replace criteria (pre-registered)

| Criterion | Bar | r5-outcome-first | Met |
|---|---|---|---|
| Mini single TEST outcome, mean of two passes | ≥ 41/42 | 42.0 | yes |
| False nulls on complaint or wrong_person, both TEST passes | none in 12 pairs | 0 | yes |
| Objections, both TEST passes | 10/10 | 10/10, 10/10 | yes |
| Objection recall, this round's mini-first runs | ≥ 51/52 | 52/52 | yes |
| Moments / commitments, both TEST passes | ≥ 35/36 / 10/10 | 36/36, 10/10 both | yes |
| A TEST pass losing against round 5 mini single with p < 0.05 | none | none (0 lost anywhere) | yes |

**All met.** This is also the `closes_when` of `open.2026-10-24.analysis-contract-objections-and-outcome`, so that
question can close.

## `decision.2026-10-24.analysis-default-tiered`: does it stand?

Its `reverse_if`: tiered's measured cost exceeds ₹0.17 per 3-minute call, or a mini-single contract matches tiered on
outcome (within 1/42 on the mean of two TEST passes) in two consecutive rounds with no moment or objection loss.

| Clause | Round 5 | Round 6 | Met? |
|---|---|---|---|
| Mini single within 1/42 of tiered, mean of two TEST passes | 38.5 vs 42.0: no | **42.0 vs 42 (this round's one tiered pass) and 42.0 (round 5's tiered mean): yes** | first round only |
| No moment or objection loss against tiered | | 36/36 and 10/10 on both mini passes, equal to tiered | yes |
| Two consecutive rounds | | round 5 did not match | **no** |
| Tiered cost per 3-minute call > ₹0.17 | ₹0.093-0.095 | ₹0.073-0.077 (0 escalations) [inference] | no |

**It stands.** Round 6 is the first round in which a mini-single contract matched tiered.
- If round 7 runs two TEST passes of mini single on the shipped outcome-first contract, and they match tiered again with
  no moment or objection loss, the reverse_if is met.
- With outcome-first, tiered escalated nothing in this pass. Its bench cost per call was mini's (₹0.0520 against
  ₹0.0519-0.0524), so on this bench tiered no longer costs more [inference: one pass].

## Why it works [inference; one arm]

- `r5-outcome-first` contains exactly current's 26 lines. Only their order changes: the OUTCOME block comes before KIND.
- That alone removed every complaint and wrong_person false null:
  - DEV, same round: 0 of 12 pairs, against current's 3 of 12;
  - TEST, against round 5: 0 of 12, against 7 of 12.
- So the false nulls came from where the outcome rules sit, not from what the KIND and objection lines say. This is the
  project's "position is mechanism" again.
- `r5-moment-not-outcome` says the same thing in words (one added line) and did not remove them: 2 of 12 DEV pairs.
- `r5-short-objection` reverts the wording and brought back round 4's objection loss on DEV p1. The two calls,
  objection_resolved.lending and .telecom, are complain-then-agree calls. It also kept complaint nulls (3 of 6
  complaint pairs).

## Recommendations

**(a) Replace current's mini-single contract with `r5-outcome-first`: every pre-registered criterion is met.**
- Mini single on TEST: 42/42 in both passes, with no pass-to-pass disagreement on any field.
- Objections: 10/10 in both passes, and 52/52 over the mini-first runs.
- DEV: 42/42 in both passes, the only arm without a false null.
- Cost: ₹0.052 per model-analysed call, +4% on current (more outcome quotes), so about ₹0.073-0.077 per 3-minute call.

The product has one prompt for both tiered passes, so this changes tiered too. On TEST, tiered stayed 42/42.

**Before shipping, mind the client rule.** In `analysisPrompt`, the arm moves the OUTCOME block but leaves the
`OUTCOME, client rule: ...` line where it was, after CODE. A workspace's client rule would then sit two blocks away from
the outcome rules it qualifies. The bench sets no client rule, so this is not measured. Moving the client rule with the
OUTCOME block is the obvious fix [inference]. The no-question prompt ("OUTCOME: always null.") also moves before KIND;
the bench always has a question, so that is not measured either.

**(b) `decision.2026-10-24.analysis-default-tiered` stands by its reverse_if.** The criterion is now one round from
being met. Round 7 should be two TEST passes each of mini single and tiered on the shipped contract.

**(c) Close `open.2026-10-24.analysis-contract-objections-and-outcome`.** Its `closes_when` is met in full.

**(d) Reject the other two arms.**
- `r5-short-objection` fails the floors: objections 9/11 and moments 34/36 on DEV p1, with the complaint nulls still
  there.
- `r5-moment-not-outcome` passes the floors but does not remove the nulls. Its added line also names "the needs-human
  VALUE", a value of the bench's outcome definition [inference: inert or misleading where a workspace has no such value].

## Method

The harness is a copy of round 5's (`../benches-r5/harness/`), in `harness/`. `azure-guard.mjs` is byte-identical to
`../../2026-10-23/benches/harness/azure-guard.mjs` (checked with `cmp`) and is not copied again.

| Setting | Round 6 |
|---|---|
| Worktree | `/dev/shm/wt-bench6`, detached at `839292d` |
| Postgres cluster | private, `/dev/shm/vp-pgbench7:55439` (tmpfs; `fsync=off`; `initdb -U vp --auth=trust` as in `product/scripts/pg-test.sh`), a fresh migrated DB per run |
| Ledger | its own, fresh (it did not exist before the first request) |
| Global cap | ₹60 (round 5: ₹60) |
| Per-run caps | round 4's (mini ₹9.4, tiered ₹18.8), each lowered to what remains of ₹60 if less |

Changes to the scripts:
- `run.sh`, `mkdb.sh`, `splits.ts`: paths, the ledger and the cap. `run.sh` also takes an optional `BENCH_SCRIPT`,
  which defaults to the product bench. It was set only for the winner's TEST runs.
- `post.py`: destination and paths, and round 6's labels (`<design>.<arm>-p<n>`).
- `all.sh`, two stages:
  - `dev`: pass 1 of each arm, then pass 2, in the order current, short-objection, outcome-first, moment-not-outcome;
  - `test <arm>`: mini p1, mini p2, then tiered.
- `stats.py`: rewritten for round 6. It reuses round 5's `wilson`, `mcnemar`, `amet`, `disagree` and the 3-minute cost
  model, and adds:
  - the templates;
  - the selection rule;
  - the replace criteria;
  - the tiered reverse_if.
- New, with no model calls:
  - `variant-probe.ts` (rewritten), which checks the arms against `ab5dade` and against current;
  - `count.ts`, the template and moment counts per split;
  - `misses.py`, which reads each run database for its misses;
  - `mkinbox.py`, which writes `context/inbox/main-2026-10-24-benches-r6.json` and asserts every number in its titles
    against `comparison.json`. It was validated by merging into a scratch copy of the tree (`check-context` valid
    before and after; 8 nodes, 38 edges, 1 event).

Other method notes:
- **Passes.** Each pass is its own process on its own database (round 5's method). `--passes 2` was not used: it loops
  `runBench` in one process against one database.
- **`--model`.** `--model <gpt-4.1-mini>` pins single. It sends the same endpoint and body as round 5's mini single,
  which passed no `--model` (`llm.ts`: the override changes only the `model` field, and it was the same deployment).
- **The TEST guard.** The product bench refuses a non-current arm on TEST ("a prompt ablation runs on DEV only").
  - The winner's TEST runs used `product/scripts/zz-r6-analysis-bench.ts`, a copy that differs only in that guard.
  - The guard also lets through the one arm named in `BENCH_R6_TEST_ARM`, the DEV winner. The diff is
    `harness/test-bench.diff`, 1 line.
  - The copy was `cmp`'d against the prepared file and removed after the runs. `git status` then showed only the
    untracked `node_modules` symlink and this directory.
  - Each TEST JSON records `promptVariant: r5-outcome-first` and `split: test`.
  - The guard exists so that contracts are not tuned on TEST. Here the arm was chosen on DEV by the pre-registered
    rule, and only the winner ran on TEST.
- **Database names** longer than 63 characters are truncated by Postgres, on create and on connect alike. Every label
  stays unique inside the 63 characters.
- **Outputs.** `harness/post.py` copies outputs, scrubs hostnames and deployment names, then asserts that none remain.
  `harness/stats.py` writes `comparison.json`. `harness/misses.py` wrote `db-misses.json`; it maps conversations to
  items by contact number and asserts that the stored outcome and reason code match the bench JSON.
- **Cleanup.** Run logs stay in the scratchpad. The run databases were removed with the cluster.

### Spend (harness ledger, ₹ at prices.ts list rates)

| Run | Requests | ₹ |
|---|---|---|
| DEV p1: current / r5-short-objection / r5-outcome-first / r5-moment-not-outcome | 40 / 40 / 40 / 40 | 2.17 / 2.08 / 2.22 / 2.20 |
| DEV p2: same order | 40 / 40 / 40 / 40 | 2.15 / 2.09 / 2.21 / 2.22 |
| TEST, gpt-4.1-mini on r5-outcome-first, p1 / p2 | 40 / 40 | 2.21 / 2.21 |
| TEST, tiered on r5-outcome-first (0 gpt-4.1 requests) | 40 | 2.17 |
| **Total** | **440** | **23.91** |

## Not verified

- **No same-round TEST control.** By the rule, only the winner ran on TEST, so the TEST comparison to `current` is
  across rounds (round 5; same ids, same deployment).
  - The same-round evidence is DEV: 84/84 against 81/84 (p = 0.25, pooled, exploratory).
  - Round 6's `current` DEV passes reproduced round 5's DEV `current` (1 and 4 discordant, both p = 1.0). That fits a
    deployment that did not drift between rounds, but does not show it.
- **Significance.** No single TEST pass gains against round 5 with p < 0.05 (p = 0.125 and 0.25). The pooled 7 to 0
  (p = 0.0156) is exploratory.
- **Small n.** The false-null result rests on 6 complaint and wrong_person calls per split, two passes each.
- **The cause.** That position causes the false nulls is an inference from one arm.
- **Coverage.** Not exercised on this prompt:
  - the client-rule line (above);
  - any outcome definition other than the bench's five values;
  - the no-question prompt;
  - tiered's escalation path (0 escalations; one tiered pass).
- **gpt-4.1 single:** not run this round.
- **Moment precision.** Off-key moments are 6 per pass, against round 5's 8-10 and round 4's 5.
- **The crisis judge:** off.
- **Real-traffic escalation rate and 3-minute cost.** These use `ANALYSIS-COST.md`'s token model.
- **The Azure meter**, as opposed to list prices.
