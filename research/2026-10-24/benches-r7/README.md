# Analysis bench, round 7 (gpt-4.1-mini single against tiered on the shipped outcome-first contract), real Azure models, 2026-10-24

What ran: round 6's analysis bench (`../benches-r6/`), through a copy of its harness, on the same two Azure deployments.
It ran on TEST only, two passes per arm, and answers `open.2026-10-24.analysis-outcome-first-second-round`:

> Does gpt-4.1-mini single on the shipped outcome-first contract match tiered again in a second round?

Every run was strictly sequential, at most 1 request a second. This is analysis only: no Operator runs.

- `product/scripts/analysis-bench.ts --split test --prompt-variant current` (the product bench, unchanged), with:
  - **mini**: `--model <gpt-4.1-mini>`, which pins single;
  - **tiered**: `--model <gpt-4.1-mini> --escalate-model <gpt-4.1> --threshold 0.6`.
- The order was mini p1, tiered p1, mini p2, tiered p2: round 5's interleave, so each same-pass pair ran minutes apart.
- The verdict comes from a rule written before the first request (`harness/rule.txt`).

| | |
|---|---|
| Date | 2026-10-24, 06:41:28-06:50:53 UTC |
| Tree | **`6d69a85febaf9f605ccf8178ab99ad245ec1b03f`** (origin/claude/serene-franklin-9w7f1v), a detached worktree. It contains `6245d4e`, the shipped contract. `node_modules` was symlinked from the main checkout: `package-lock.json` is byte-identical (`cmp`); `package.json` differs only by one `scripts` entry (`gen`) that this tree has and the main checkout does not, with no dependency difference |
| Contract | `current`, which `6245d4e` made round 6's `r5-outcome-first` (the OUTCOME block before KIND). **The byte-identity gate passed before any request** (below) |
| Models | **gpt-4.1-mini** (served `gpt-4.1-mini-2025-04-14`, Azure Standard, regional South India). **gpt-4.1** (Azure GlobalStandard), tiered's second reader. It was **never called**: 0 escalations |
| Purposes | As in rounds 5 and 6: every purpose uses the deployment in `VP_LLM_DEFAULT_*`, and `VP_ANALYSIS_MODELS` is unset. `--model` writes `call_analysis_setting`. The cross-call insight runs on mini. The crisis judge was off (the bench default) |
| Prices | prices.ts list prices at ₹95/$. gpt-4.1-mini: ₹41.8 in / ₹167.2 out per 1M tokens. gpt-4.1: ₹190 in / ₹760 out |
| Spend | **₹8.70** against a cap of ₹40: 160 successful requests (all gpt-4.1-mini), 0 HTTP errors, 0 retries on 429, 0 network errors, 0 refusals by the cap |

## Answer

**Yes. Under the pre-registered rule, mini single matches tiered, for the second consecutive round.** The two arms
gave the same answer on every field of every call.

| TEST, 42 calls | **gpt-4.1-mini single p1 / p2** | **tiered p1 / p2** | Rule clause | Met |
|---|---|---|---|---|
| **Outcome** | **42 / 42** | **42 / 42** | mini ≥ tiered − 1 on each pass | yes (42 ≥ 41, 42 ≥ 41) |
| **Objections** | 10/10 / 10/10 | 10/10 / 10/10 | mini ≥ tiered on each pass | yes |
| **Moments** | 36/36 / 36/36 | 36/36 / 36/36 | mini ≥ tiered on each pass | yes |
| **Commitments** | 10/10 / 10/10 | 10/10 / 10/10 | mini ≥ tiered on each pass | yes |
| **Crisis** | 42/42 / 42/42 | 42/42 / 42/42 | 0 errors on both mini passes | yes |

**Verdict: MATCHES.** Round 6 matched as well (mini 42, 42 against tiered 42), so this is the second consecutive round.
By the rule:
- the per-call analysis default should switch to **gpt-4.1-mini single**, the cheaper option;
- tiered and gpt-4.1 stay selectable.

The decision's own reverse_if (within 1/42 on the mean of two passes, with no moment or objection loss, in two
consecutive rounds) is met as well. The rule is the stricter reading, and the two agree.

**What this does not show (read before acting on it):**
- **Tiered escalated nothing: 0/39 calls in each pass.** Every tiered request was the same mini request as mini single
  sends. With round 6 that makes 0/117 analysed TEST calls on this contract.
- So on this bench the arms could only differ by mini's own run-to-run variance, and that was 0. The match shows that
  mini single is as good as tiered **where tiered does nothing**. It does not show what tiered's second reader is worth.
- The saving is not measured either. With no escalations, tiered cost what mini single cost (₹0.0514-0.0521 against
  ₹0.0515-0.0519 per model-analysed call). Tiered spends more only on the calls it escalates, the same calls where it
  could be better. The bench no longer has such calls, so a new open question is proposed (below).

## The contract gate (no model, before the first request)

`node --import tsx product/scripts/analysis-variant-probe.ts` printed `ok: true` (exit 0). The output is in
`harness/variant-probe.out.json`. Its five checks:
- the shipped `current` prompt, on the bench's outcome definition, is **byte-identical** to
  `product/scripts/analysis-bench/contracts/r6-outcome-first.bench.txt`. Both are 2,817 characters, sha256
  `ba7656b71f84c22073e2ec04683957640710b8011262af55bc163fbcfc642fbb`;
- `r5-outcome-first` builds the same prompt as `current`;
- the client rule sits directly after the OUTCOME block;
- the OUTCOME block comes before KIND;
- a client rule changes nothing else.

Since round 6's tree (`839292d`):
- `analysis-bench.ts`, `analysis-bench/cases.ts` and `llm.ts` are unchanged (`git diff`, empty);
- the DEV/TEST split map is byte-identical to round 6's (`cmp`);
- `calls/analysis.ts` has changed twice:
  - `6245d4e`, the ship itself: covered by the gate;
  - `0e2d692` (typed outcome fields): adds prompt lines only when a definition has `fields`. The column defaults to
    `[]` (`0607_outcome_fields.sql`), and the bench sets none, so the bench's prompt is the gated one;
- `taxonomy.ts` maps two new end reasons (`switched_off`, `invalid_number`) to existing DIAL_ codes. The model names
  CONV_ codes only (`MODEL_CODES`), and the gate covers the prompt;
- `shared/safety/rules.json` changed, and crisis is 42/42 in every run.

A no-model `--fake` run on a throwaway database checked the database path before the real runs. It wrote nothing to the
ledger, and its database was dropped.

## The rule (written before the first request)

`harness/rule.txt`:
- its mtime is **06:41:00 UTC**;
- the first ledger request is **06:41:32 UTC**;
- the ledger did not exist before.

| Clause | Bar |
|---|---|
| (1) Outcome | mini ≥ tiered − 1 on the same pass, on both passes |
| (2) Objections, moments, commitments | mini ≥ tiered on the same pass, on both passes |
| (3) Crisis | 0 crisis-field errors on both mini passes |

- **On a match:** recommend switching the default to mini single, with tiered selectable. This is written as a decision
  node that supersedes `decision.2026-10-24.analysis-default-tiered`.
- **Otherwise:** tiered stays.

The file also fixes the order, the caps and the rerun policy: one rerun for a transport failure only, never for a
score. No rerun was needed.

## TEST, per pass (n = 42 calls; 39 reach the model; 16-call cross slice)

| Field | gpt-4.1-mini p1 | gpt-4.1-mini p2 | tiered p1 | tiered p2 | r6 mini p1 / p2 (same prompt) | r6 tiered (1 pass) |
|---|---|---|---|---|---|---|
| **Outcome** | **42/42** | **42/42** | **42/42** | **42/42** | 42 / 42 | 42 |
| Outcome, mean of passes | **42.0 (CI 91.6-100)** | | **42.0** | | 42.0 | |
| Outcome misses | none | none | none | none | none | none |
| Complaint template | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 / 3/3 | 3/3 |
| Wrong-person template | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 / 3/3 | 3/3 |
| **Objections** | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 / 10/10 | 10/10 |
| **Moments** | 36/36 | 36/36 | 36/36 | 36/36 | 36/36 / 36/36 | 36/36 |
| **Commitments** | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 / 10/10 | 10/10 |
| Every moment found | 42/42 | 42/42 | 42/42 | 42/42 | 42/42 / 42/42 | 42/42 |
| **Crisis** | 42/42 | 42/42 | 42/42 | 42/42 | 42/42 | 42/42 |
| Reason code, follow-ups owed, opt-out recall (analysis and floor) | 42/42, 42/42, 5/5, 5/5 | same | same | same | same | same |
| Reason code on the 3 complaint calls | CONV_NEEDS_HUMAN ×3 | ×3 | ×3 | ×3 | ×3 | ×3 |
| **Grounded quotes** | 117/117 | 115/115 | 118/118 | 115/115 | 117/117, 120/120 | 119/119 |
| Off-key moments proposed (precision not measured) | 6 (objection 3, confusion 3) | 6 | 6 | 6 | 6, 6 | 6 |
| Cross slice: planted themes | 3/3 | 3/3 | 3/3 | 3/3 | 3/3, 3/3 | 3/3 |
| **Escalated** | | | **0/39 (CI 0.0-9.0)** | **0/39** | | 0/39 |
| Input / output tokens per model-analysed call | 754.6 / 121.6 | 754.6 / 119.3 | 754.6 / 122.9 | 754.6 / 118.8 | 754.6 / 121.6, 124.9 | 754.6 / 122.5 |
| **₹ per model-analysed call** (bench cost lines; tiered priced per model) | **0.0519** | **0.0515** | **0.0521** | **0.0514** | 0.0519 / 0.0524 | 0.0520 |
| Run spend (ledger, incl. the insight request) | ₹2.21 | ₹2.15 | ₹2.19 | ₹2.15 | ₹2.21 / ₹2.21 | ₹2.17 |

### Pass-to-pass disagreement (same arm)

| Arm | Outcome value | Reason code | Moment set | Any field |
|---|---|---|---|---|
| gpt-4.1-mini, p1 vs p2 | 0/42 | 0/42 | 0/42 | **0/42** |
| tiered, p1 vs p2 | 0/42 | 0/42 | 0/42 | **0/42** |

## Exact McNemar, mini against tiered (same 42 TEST ids)

Each cell is (right under tiered only, right under mini only, p).

| Pair | Outcome | Per-call objection (10) | Every moment | Commitments (10) | Any-field disagreement |
|---|---|---|---|---|---|
| mini p1 vs tiered p1 | 0, 0, p = 1.0 | 0, 0, p = 1.0 | 0, 0, p = 1.0 | 0, 0, p = 1.0 | 0/42 |
| mini p2 vs tiered p2 | 0, 0, p = 1.0 | 0, 0, p = 1.0 | 0, 0, p = 1.0 | 0, 0, p = 1.0 | 0/42 |
| mini p1 vs tiered p2 (crossed) | 0, 0, p = 1.0 | 0, 0 | 0, 0 | 0, 0 | |
| mini p2 vs tiered p1 (crossed) | 0, 0, p = 1.0 | 0, 0 | 0, 0 | 0, 0 | |
| Pooled (pass, call) pairs [exploratory: pairs share call ids] | 0 of 84 discordant, p = 1.0 | | | | |

With no discordant pair, the test has nothing to work with. The equality is exact on this set, but McNemar cannot bound
a difference smaller than this bench resolves.

### Against earlier rounds (same 42 ids)

| r7 run | vs r6, same prompt bytes | vs r5, the previous contract (kinds-first) |
|---|---|---|
| mini p1 | vs r6 mini p1: 0 discordant on any field | vs r5 mini p1: outcome 0 lost, 4 gained, p = 0.125 |
| mini p2 | vs r6 mini p2: 0 discordant on any field | vs r5 mini p2: outcome 0 lost, 3 gained, p = 0.25 |
| tiered p1 | vs r6 tiered: 0 discordant on any field | vs r5 tiered p1: 0 discordant |
| tiered p2 | vs r6 tiered: 0 discordant on any field | vs r5 tiered p2: 0 discordant |

Round 7 reproduces round 6 call for call: the same outcome value, reason code and moment set on every call, and equal
counts on every scored field. This is the reproducibility read that round 6 lacked:
- it fits a deployment that did not drift between rounds, about 2 hours apart, but does not show it;
- round 6's 42, 42 replicated on the same ids with the same prompt bytes.

### Objection recall over this round's runs

All four runs are mini-first: **40/40** (run, call) pairs, all mini's own records, since nothing escalated. Round 6
was 52/52 and round 5 51/51.

## The run databases (`db-reads.json`)

`harness/misses.py` reads every run database back. It is round 6's script with paths changed, plus moment, crisis and
confidence reads. **There was no miss to read**: 0 outcome, objection, moment, commitment or crisis misses in all 4
runs. Every database was still read, and on each run:
- stored outcome, reason code and analysis moment kinds match the bench JSON on 42/42 calls;
- 39 analyses are `done` and 3 `skipped` (calls that never reach the model);
- **every recorded outcome has `outcomeConfidence` ≥ 0.9.** That holds for all 30 calls with an outcome in each run:
  - the minimum is 0.9;
  - none is under the 0.6 threshold;
  - the histograms are, mini p1 / p2: 0.9 ×10 / 10, 0.95 ×2 / 1, 1.0 ×18 / 19; tiered p1 / p2: 0.9 ×6 / 9,
    0.95 ×2 / 1, 1.0 ×22 / 20.

**Why tiered never escalated** (tier records, both passes the same):
- 25 calls: neither trigger fired. Each had an outcome at confidence ≥ 0.9;
- 11 calls: the engine decided the reason, so they are never escalated;
- 3 calls: the first pass named a no-decision reason, so they are never escalated;
- 3 calls: not analysed by the model.

So no call came near the low-confidence trigger, and no refinable call came back without an outcome.

Confidence varies between passes (e.g. 18 against 22 calls at 1.0) while every outcome, code and moment stays the same.
At temperature 0 the stated confidence is noisier than the answer [observation; n = 4 runs].

## `decision.2026-10-24.analysis-default-tiered`: its reverse_if

> tiered's measured cost exceeds ₹0.17 per 3-minute call, or a mini-single contract matches tiered on outcome (within
> 1/42 on the mean of two TEST passes) in two consecutive rounds with no moment or objection loss.

| Clause | Round 6 | Round 7 | Met? |
|---|---|---|---|
| Mini single within 1/42 of tiered, mean of two TEST passes | 42.0 vs 42 (one tiered pass) | **42.0 vs 42.0** | yes |
| No moment or objection loss against tiered | 36/36, 10/10 both | 36/36, 10/10 on both passes, equal to tiered | yes |
| Two consecutive rounds | first | **second** | **yes** |
| Tiered cost per 3-minute call > ₹0.17 | ₹0.073-0.077 [inference] | ₹0.073 (ANALYSIS-COST.md model) / ₹0.077 (re-based on this round's tokens), 0 escalations [inference] | no |

**The reverse_if is met** by its outcome clause. The proposed replacement is
`decision.2026-10-24.analysis-default-mini-single-outcome-first`, status `proposed`, in the inbox file:
- its rationale states the caveat above;
- its reverse_if names three triggers:
  - a later TEST round in which mini falls more than 1 call below tiered on a pass, or loses an objection, moment or
    commitment;
  - a slice where tiered actually escalates and beats mini by 2 or more calls per 42, or with p < 0.05;
  - a contract change that brings back mini's complaint or wrong-person false nulls.

The code default (`defaultAnalysisSetting`, `decision.2026-10-24.analysis-default-tiered-in-code`) is the
integrator's to change. Nothing in product code was touched here.

## Recommendations

**(a) By the pre-registered rule: make gpt-4.1-mini single the per-call analysis default on the shipped contract, with
tiered and gpt-4.1 selectable.** Two consecutive rounds match: 42, 42 against tiered 42 in round 6, and 42, 42 against
42, 42 in round 7. That is 0 discordant pairs on any field, with no objection, moment, commitment or crisis loss.

**(b) Before, or alongside, the switch: measure what is being given up.**
- The bench cannot show the value of tiered's escalation. It has not fired on this contract (0/117), because mini is
  now right and sure on every bench call.
- Proposed `open.2026-10-24.analysis-escalation-path-unexercised` asks for a slice on which the first pass really
  escalates. That means consented real-traffic calls, or a pre-registered synthetic hard-case set: hedged outcomes,
  mixed language, long calls.
- That slice would run mini single against tiered.
- On real traffic, the escalation rate is the number that turns tiered's "same cost here" into a real cost difference
  [inference].

**(c) Close `open.2026-10-24.analysis-outcome-first-second-round`.** Its `closes_when` is met: two TEST passes each,
mini within 1/42 of tiered on the mean, no moment or objection loss.

## Method

The harness is a copy of round 6's (`../benches-r6/harness/`), in `harness/`. `azure-guard.mjs` is byte-identical to
`../../2026-10-23/benches/harness/azure-guard.mjs` and to round 6's copy (checked with `cmp`) and is not copied again.

| Setting | Round 7 |
|---|---|
| Worktree | `/dev/shm/wt-bench7`, detached at `6d69a85` |
| Postgres cluster | private, `/dev/shm/vp-pgbench-r7:55447` (tmpfs; `fsync=off`; `initdb -U vp --auth=trust` as in `product/scripts/pg-test.sh`), a fresh migrated DB per run |
| Ledger | its own, fresh (it did not exist before the first request) |
| Global cap | ₹40 |
| Per-run caps | round 4's (mini ₹9.4, tiered ₹18.8), each lowered to what remains of ₹40 if less. None was reached |

Changes to the scripts:
- `run.sh`, `mkdb.sh`, `post.py`, `splits.ts`, `count.ts`: paths, the ledger and the cap only. `BENCH_SCRIPT` was not
  set: every run is the product bench.
- `all.sh`: paths and cap, and one run per invocation (`all.sh <mini|tiered> <p1|p2>`). It was called in the order
  above, so each run finished before the next began. It refuses to start while another bench process runs on the
  machine.
- `stats.py`: rewritten for round 7. It copies round 6's `wilson`, `fmt`, `mcnemar`, `sign`, `amet`, `disagree`,
  `pairs` and `runEntry` unchanged, and reuses the 3-minute cost model. It adds:
  - the mini-against-tiered pairs;
  - the reproducibility pairs against round 6;
  - the rule;
  - the reverse_if.
- `misses.py`: paths, plus the moment, crisis and confidence reads described above.
- `mkinbox.py`: rewritten for round 7. It writes `context/inbox/main-2026-10-24-benches-r7.json` and asserts every number
  in its titles against `comparison.json` and `db-reads.json`.
  - It was validated by merging into a scratch copy of the tree (`context/` and `scripts/` copied, the rest symlinked).
  - `check-context` passed before and after the merge: 1,950 nodes, 3,439 edges and 338 events before; 1,955, 3,471
    and 339 after (5 nodes, 32 edges, 1 event).
  - The worktree's own `graph.json` was unchanged (sha256 checked).

Other method notes:
- **Passes.** Each pass is its own process on its own database (round 5's method). `--passes 2` was not used.
- **The TEST guard.** The product bench allows `current` on TEST, so no harness copy of the bench was needed, unlike
  round 6. Each JSON records `promptVariant: current` and `split: test`.
- **Outputs.** `harness/post.py` copies outputs, scrubs hostnames and deployment names, then asserts that none remain.
  `harness/stats.py` writes `comparison.json`, and `harness/misses.py` writes `db-reads.json`.
- **Cleanup.** The run logs and raw bench outputs stay in `/dev/shm/bench-out-r7`, and the ledger in the scratchpad; none
  of them is committed. The run databases were removed with the cluster.

### Spend (harness ledger, ₹ at prices.ts list rates)

| Run | Requests | ₹ |
|---|---|---|
| TEST, gpt-4.1-mini single, p1 | 40 | 2.21 |
| TEST, tiered, p1 (0 gpt-4.1 requests) | 40 | 2.19 |
| TEST, gpt-4.1-mini single, p2 | 40 | 2.15 |
| TEST, tiered, p2 (0 gpt-4.1 requests) | 40 | 2.15 |
| **Total** | **160** | **8.70** |

## Not verified

- **Tiered's escalation path.** It has not been exercised on this contract: 0/117 analysed calls over rounds 6-7, and
  gpt-4.1 read no call in either round. How tiered and mini single differ where tiered acts is unmeasured.
- **The saving.** On the bench the two arms cost the same. A real saving needs a real-traffic escalation rate, which is
  not measured; the 3-minute costs use `ANALYSIS-COST.md`'s token model.
- **Small n, ceiling.** Both arms score 42/42 on every pass. The bench has 6 complaint and wrong-person calls per pass,
  and a ceiling cannot show a difference smaller than one call in 42. The Wilson interval on 42/42 is 91.6-100.
- **Coverage.** Not exercised on this prompt:
  - the client-rule line (`open.2026-10-24.analysis-outcome-first-client-rule`);
  - typed outcome fields (`0e2d692`);
  - any outcome definition other than the bench's five values;
  - the no-question prompt.
- **Not run this round:** DEV, gpt-4.1 single, and the crisis judge.
- **Moment precision.** Off-key moments are 6 per run, the same as round 6.
- **Other load on the deployment.** The harness refuses to start while another bench runs on this machine. Other
  sessions elsewhere could share the deployment's quota; there were 0 429s.
- **The Azure meter**, as opposed to list prices.
