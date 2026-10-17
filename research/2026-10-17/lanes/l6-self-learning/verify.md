# l6-self-learning: adversarial verification

Verifier pass, 2026-10-17. Lane brief: `research/2026-10-17/vp-research-brief.md` (H7).

**Scope note.** The cited `report.md` does not exist on disk. No lane in `research/2026-10-17/lanes/` has a
`report.md`. I checked the eight load-bearing claims as the workflow passed them, against:

- the lane's code (`code/*.py`) and data (`data/*.csv`, `data/*.json`, `data/evidence.csv`);
- my own re-implementations of each calculation, in the verifier scratchpad (not in this lane);
- reruns of the lane's own `sim.py` `run()` and of a copy of `hier.py` with its output redirected to the
  scratchpad (no lane file was modified);
- the cited primary sources, re-read on 2026-10-17;
- other vendor pages reached by direct URL.

WebSearch was unavailable for the whole turn because the programme-wide search budget had run out. The lane hit
the same limit (`evidence.csv` B04). Attempts to refute claims through the web were limited to direct URL fetches.

## Verdict table

| # | Claim (short) | Verdict | One-line reason |
|---|---|---|---|
| 1 | Calls per arm (1,565 / 3,554 / 3,213 / 906 / 6,510 / 1,094); Wilson 40.4-59.6%; MDE at 100/arm 19.3 / 13.4 pts | **confirmed** | Exact binomial enumeration gives power 0.800-0.803 at every stated n. Wilson and MDE reproduce. |
| 2 | Steady-state p50 volumes; pilot share for a +10% relative lift 36 / 22 / 10 / 3.5 / 2 / 0.7%; "51-80% of top-segment buyers clear the local test" | **weakened** | The numbers reproduce. "51-80%" leaves out D2C, which is #3 on the frozen l3 scorecard, at 31%. The inputs are l3 assumptions that l3's verifier judged probably high. D2C's "+10%" is a lift on the miss rate. |
| 3 | Thompson, 4 variants, +10% relative: 86% / 99% correct (1,000/day); median correct declaration day 18; regret 0.9%; 100/day 49 / 72 / 91%, 29% declare; +5% at 100/day 61%; 10,000/day 1-7 days | **confirmed** | An independent re-implementation and lane-code reruns agree within Monte Carlo noise. |
| 4 | A/A with daily P(best) >= 0.95: 4-14% false winners "at any volume"; naive daily z-test 16% / 27-28% / 36-37%; Thompson >80% traffic on one arm in 8-10% | **weakened** | Peeking figures confirmed. The 4-14% holds only for K = 4. With K = 2, the baseline-vs-variant split every vendor ships, the same rule gives **52-62%** false winners by day 90. With K = 3 it gives ~20-24%. Epsilon-greedy's "100%" is true by construction. |
| 5 | Pooling across 30 tenants: pooled vs alone vs partial-pooling regret and false-winner numbers | **weakened** | The numbers reproduce (quick rerun of a copy). The cost of partial pooling comes from one approximate empirical-Bayes estimator, not from partial pooling in general. "9% never recover" is true by construction. The A/A comparison favours pooling by construction. |
| 6 | Line mining: 0.19 / 0.67 / 0.94 detection; ~1% false flags; 1.5x needs 5-10k calls; 592 vs 4,028 vs 25,963 per arm; proxy learner +2.7% minutes with zero outcome gain | **weakened** | Every number reproduces exactly. "Works at hundreds of calls" overstates: at 100-200 calls detection is 19-37%. The reference hazard curve is assumed known. "Zero outcome gain" is an input to the scenario, not a result. |
| 7 | No vendor read documents autonomous, outcome-driven self-rewriting; Retell / Vapi / ElevenLabs / Bland ship fixed splits with manual promotion and no statistics; Conductor / Vapi / Wren draft changes for humans | **weakened** | The pages for Retell, Vapi, ElevenLabs, Bland experiments and Wren say what is claimed. But SquadStack, which the lane itself read (evidence L29), markets "the self-improvement layer that continuously tunes agent scripts" using outcome data. Bland documents an autonomous "Tornado" loop that "applies fixes". The Vapi suggestions page does not say a human approves. |
| 8 | LLM outcome labels too noisy: 1.8-2.4x at 90%, 3.6-5.5x at 80%; biased judge 57.5%; own judges failed 0.80 (77.1% self-agreement, 58-81% slot-A bias) | **weakened** | The arithmetic is confirmed and the inherited numbers are in the harvest docs. But those judges scored Hinglish companion replies by holistic and pairwise preference, not binary outcome extraction from sales transcripts. Outcome-label accuracy for this task was never measured, so "too noisy to drive learning" is not established. |

## Reasoning per claim

### 1. Power arithmetic: confirmed

- I re-derived the Fleiss two-proportion n (no continuity correction):
  - 1,564.7 → 1,565
  - 3,553.1 → 3,554
  - 3,212.9 → 3,213
  - 905.4 → 906
  - 6,509.5 → 6,510
  - 1,093.7 → 1,094
- Exact power, by full binomial enumeration of the two-sided pooled z-test (not simulation), is 0.803, 0.800,
  0.801, 0.802, 0.800 and 0.801 at those n. The lane's "simulation 0.79-0.81" is consistent.
- Wilson 50/100 = 0.4038-0.5962 by hand. The minimum detectable drop at 100/arm is 19.35 pts (50% baseline) and
  13.40 pts (20%) closed form, or 19.3 and 13.2 pts by exact power.
- The brief's "±10 points at 100 calls" is confirmed: Wilson half-width 9.6 pts.
- Side defect, not in the claim: the column `n_per_arm_cohen_h` in `data/power-n-per-arm.csv` is **half** the
  correct per-arm n. `power.py` `n_cohen_h` omits the factor 2 (per-arm n = 2·((zα+zβ)/h)²). For 50→45, h = 0.1002
  gives ~1,566 per arm, not 783. Do not quote that column.

### 2. Segment volumes and pilot share: weakened

- Every figure is in `data/power-segment-volumes.csv`:
  - p50: 18,728 / 9,440 / 6,089 / 3,003;
  - pilot shares: 0.363 / 0.22 / 0.096 / 0.035 / 0.02 / 0.007;
  - local-line test: 1,184 = 2 × 592.
- The segment inputs match `l3-segments/sizing.py` SEGMENTS (seats p10/p90, automatable share), TALK_H
  (1.5, 2.5, 3.5) and DAYS (22, 24, 26). They also match l2 `avg_call_min` (1.0, 2.0, 3.5).
- A hand check of the medians (seats median √(p10·p90) × 150 talk-min × 24 days × auto ÷ ~2.1 min) gives
  ~9,800 (insurance) and ~18,800 (collections). Consistent.
- **Overstatement 1.** "51-80% of top-segment buyers still clear the local-metric test" (pilot volume) covers
  insurance renewals 62.9%, real estate 51.0%, collections 79.9% and fintech 62.4%. It skips
  **d2c_ecom_post_purchase, rank 3 on `l3-segments/scorecard.csv`, at 31.0%**. The full set is:

  | Segment | Clears local test at pilot volume |
  |---|---|
  | Collections | 80% |
  | Insurance renewals | 63% |
  | Fintech | 62% |
  | Real estate | 51% |
  | Edtech | 48% |
  | Healthcare | 44% |
  | Auto dealers | 32% |
  | D2C | 31% |

  Corrected: "31-80% across the scorecard's top 5; 51-80% excluding D2C."
- **Overstatement 2.** For D2C and healthcare (base rates > 0.5), `power.py` defines "+10% relative" as a 10% cut
  in the *miss* rate (85% → 86.5% for COD). That is a different and smaller effect than the label suggests.
- **Inherited uncertainty.** Seats per firm, phone share and automatable share are all assumptions
  (`l3-segments/verify.md`, items 130 and 7). The l3 verifier found the bottom-up seat model "probably high"
  against TRAI series totals. If so, per-buyer volumes are lower and the feasibility shares are optimistic. The
  20% pilot share is a stated assumption.

### 3. Thompson sampling at 100 / 1,000 / 10,000 calls a day: confirmed

My own batched Beta-Bernoulli implementation differs from the lane's in three ways:

- P(best) is computed by exact numerical integration of the Beta posteriors, not the lane's normal approximation.
- Allocation uses 1,000 posterior draws.
- It uses different seeds.

| Calls/day | Measure | Lane | Mine | Lane code rerun (2 seeds, 800 runs each) |
|---|---|---|---|---|
| 1,000 | correct by day 7 / 30 | 0.855 / 0.988 | 0.877 / 1.000 | - |
| 1,000 | median day of correct declaration | 18 | 18 | - |
| 1,000 | regret | 0.91% | 0.86% | - |
| 100 | correct by day 7 / 30 / 90 | 0.49 / 0.715 / 0.91 | 0.415 / 0.67 / 0.87 (R=400); 0.458 / 0.705 / 0.895 (R=800) | 0.46-0.48 / 0.70-0.71 / 0.88-0.89 |
| 100 | declared by day 90 | 0.29 | 0.205 (R=400); 0.251 (R=800) | 0.31-0.34 |
| 100, +5% effect | correct by day 90 | 0.61 | 0.66 | - |
| 10,000 | median correct declaration day (+10% / +5% / +25%) | 2 / 7 / 1 | 2 / - / - | - |

- The lane's 100/day values sit at the favourable end of the noise band. With exact posteriors, declarations are
  a few points lower, because the normal approximation understates the tails of starved arms. That makes the
  conclusion (100/day learns slowly) slightly *stronger*.
- Best reading at 100/day: right ~42-49% by day 7, ~67-72% by day 30, ~87-91% by day 90; 20-34% declare by day 90.

### 4. A/A false winners and peeking: weakened

**Peeking, confirmed.** My own simulation (20,000 runs per cell) of a naive daily two-sided z-test, stopped at the
first p < 0.05:

| Looks | False-winner rate |
|---|---|
| 7 | 16.5-17.3% |
| 30 | 28% |
| 90 | 36.5-37.7% |

The lane's 16% / 27-28% / 36-37% matches within noise (its 30% base-rate cells run 17.4% / 29.2% / 36.8%). The
rates match the classical repeated-significance result (Armitage, McPherson & Rowe 1969: roughly 37% at 100
looks). Evan Miller's "How Not To Run an A/B Test" (2010) also needs 1% nominal significance at 10 peeks to hold 5%.

**Johari et al., confirmed.** arXiv 1512.04922, v3 dated 2019-07-16. The abstract says standard inferences "are
wholly unreliable if users endogenously choose samples sizes by continuously monitoring their tests".

**The "4-14% at any volume" figure is specific to K = 4.** The P(best) >= 0.95 rule is much easier to trip with
fewer arms. False winners by day 90 under A/A at a 20% base rate:

| Arms | Policy | My code (100/day; 1,000/day) | Lane's own `run()` (100/day) |
|---|---|---|---|
| K = 2 | uniform | 57.8%; 59.3% | 52.2% |
| K = 2 | Thompson | 56.8%; 59.3% | 62.5% |
| K = 3 | uniform | 24.0%; 23.3% | 21.5% |
| K = 3 | Thompson | 22.0%; 19.5% | 21.2% |
| K = 4 | uniform | 9.0%; 12.2% | 12.5% (lane CSV) |
| K = 4 | Thompson | 3.5%; 6.0% | 5.5% (lane CSV) |

My K = 4 runs reproduce the lane's 4-14%, so the difference is the number of arms, not the code.

- Retell, Vapi, ElevenLabs and Bland all ship a baseline-vs-variant (K = 2) split. The relevant noise-floor figure
  for a "winner at 95%" dashboard is therefore **~52-62% false winners within 90 days**, not 4-14%.
- This also reconciles claim 5's 20.6% false-winner rate at K = 3 with claim 4's 4-6% Thompson rate at K = 4.
- Thompson put >80% of the final day's traffic on one arbitrary arm in 7.7-9.8% of K = 4 runs (lane CSV), which
  rounds to "8-10%"; mine gives 9-10%. At K = 3 it did so in 21-26% of runs and at K = 2 in 52-57% (mine).
- "Epsilon-greedy 100%" is true by construction: ε = 0.1 always gives 92.5% to the current leader.
- Corrected statement: the "dashboard shows learning where none exists" conclusion is **stronger** than claimed.
  The specific rate depends on the number of variants: ~4-14% at K = 4, ~20-24% at K = 3, ~52-62% at K = 2.

### 5. Pooling across tenants: weakened

- Every figure in the claim is in `data/sim-hierarchical.csv`:
  - pooled vs alone: 0.911 vs 0.583, regret 0.39 vs 1.59;
  - share of tenants whose best differs: 0.089, and those tenants are on their best at day 90 in 0.0;
  - regret 6.59 / 14.17; wrong winners 0.476 / 0.553;
  - A/A false winners 0.206 / 0.24 / 0.025;
  - partial-pooling regret 2.43 vs 1.27.
- A redirected copy of `hier.py --quick` (60 runs) reproduced them within noise: 0.591, regret 6.36 / 13.88,
  partial-pooling regret 2.30 vs 1.34, A/A partial-pooling false winners 0.6%.

Caveats the claim does not carry:

- **"Never recover" is built into the pooled policy.** Every tenant gets the segment's choice, so a tenant whose
  best differs can never be on its best. This is not an empirical finding.
- **The regret cost of partial pooling comes from one estimator.** `hier.py` uses DerSimonian-Laird on log-odds
  contrasts with a tau floor of 0.03. Its own docstring says it ignores the covariance from the shared control arm,
  and it treats the control contrast as known (sd 0). A correctly specified hierarchical model is not shown to pay
  this cost. The cited Hong et al. (arXiv 2111.06929, AISTATS 2022) proves regret falls with a more informative
  prior for properly specified hierarchical TS. It does not support the 2.4% vs 1.3% penalty.
- **The A/A comparison favours partial pooling by construction.** All 30 tenants share a true zero effect, so
  shrinkage helps as much as it ever can.

Corrected statement: "Under this approximate empirical-Bayes estimator, partial pooling cut A/A false winners to
2.5% but doubled regret in heterogeneous segments. Whether a full hierarchical model pays the same cost is untested."

### 6. Line mining, local metric and proxy trap: weakened

- I recomputed the whole of section B/C independently:
  - completion 0.55605 → 0.58694;
  - 435 per arm reach line 4, ÷ 0.73508 reach probability = 591.8 → 592 calls/arm;
  - 4,027.1 → 4,028 on completion;
  - 25,962.5 → 25,963 on conversion;
  - minutes 1.8726 → 1.9235 = **+2.72%**.
- Detection probabilities match `data/dropoff-mining.csv`: 0.193 / 0.67 / 0.935, and 0.763 with natural variation.
  False flags are 0.4% (exact curve) and 1.1% (varying lines) at 500 calls. A 1.5x line is caught 0.751 at 5,000
  and 0.967 at 10,000.
- **Overstatement.** "Works at hundreds of calls" holds only from about 500 calls: two-thirds detection, 0.63 with
  natural variation. At 100 and 200 calls detection is 0.19 and 0.34.
- **Assumption 1: the reference is known.** `flags()` compares each line against the *true* segment curve `H0`. In
  production that reference must itself be estimated, which adds noise beyond the "lines vary" scenario.
- **Assumption 2: the hazard curve.** It is an assumed shape (labelled so in the code).
- **"Zero outcome gain" is an input.** The Goodhart scenario assumes retained callers never convert, and the
  billed-minutes figure rests on an assumed 20 s per line. It shows the size of the trap if that happens, not that
  it happens.

Corrected: "a line that doubles hang-ups is found about two-thirds of the time at 500 calls and 76-94% at 1,000,
against a known reference curve."

### 7. Vendors: weakened

Each cited page re-read on 2026-10-17 (all undated):

- **Retell A/B testing:** "random percentage-based split"; you compare analytics per version. No statistical test,
  sample size or A/A step, and no automatic promotion.
- **Retell Conductor:** "Ask Conductor to build or adjust something, then accept the proposal". Simulation only,
  and the only metric named is the test pass rate.
- **Vapi traffic splitting:** "no other share ever moves on its own"; promotion is manual; no statistics.
- **ElevenLabs Experiments:** manual merge "once a variant demonstrates measurable improvement". Only qualitative
  advice ("Small sample sizes lead to unreliable results"); no test or rule.
- **Bland experiments API:** `traffic_percentage`, `variant_call_quota`, `ends_at`. `completed_reason` is one of
  manual / date_ended / quota_reached / baseline_changed. There are no significance, winner or promotion fields,
  so the claim's characterisation is right.
- **PolyAI Wren:** the quote "Every change to a live agent is reviewed and released by your team" is verified.

Where the claim is incomplete:

- **SquadStack** (squadstack.ai, read 2026-10-17; also lane evidence L29) markets:
  - "the self-improvement layer that continuously tunes agent scripts", with compliance language in "locked
    sections";
  - "an A/B testing engine that tunes voice, script, channel and timing per lead";
  - "a continuous optimisation loop" built on "your own outcome data".

  That is a production vendor (an Indian competitor in the beachhead) *claiming* autonomous, outcome-driven script
  tuning. It gives no documented mechanism, statistics or approval step. The lane recorded it but the load-bearing
  claim leaves it out.
- **Bland documents "Tornado"** (docs.bland.ai/api-v1/post/agent-testing-tornado-start.md): "an iterative fix loop
  that runs tests, analyzes failures, applies fixes, and retests until all scenarios pass". No approval step is
  documented. That is autonomous self-rewriting, driven by test scenarios rather than outcomes.
- **Vapi's generate-suggestions endpoint** works from simulation runs. Its page does not say whether suggestions are
  applied or approved, so "draft changes that humans approve" overstates what Vapi documents.

Corrected statement: "No vendor we read *documents* an outcome-driven self-rewriting loop with a statistical
guard. SquadStack *markets* continuous outcome-driven script tuning without documenting how. Bland documents an
autonomous test-driven fix loop. Retell Conductor and PolyAI Wren require human acceptance."

### 8. LLM outcome labels: weakened

- **Arithmetic, confirmed.** Under symmetric misclassification, inflation is 1.85 / 1.81 / 2.44 at 90% and
  3.68 / 3.55 / 5.54 at 80%. With asymmetric errors at roughly the same accuracy (sens/spec 0.95/0.85 or
  0.80/0.95) I get 1.8-2.9x, so the range is roughly robust.
- **Biased-judge A/A, confirmed.** Analytically, 0.26 vs 0.29 at 2,000/arm declares B in 56.5% of tests, against
  the lane's simulated 57.5%.
- **Inherited numbers, present.** `docs/harvest/hp-main.md` line 213-215 (27-54% agreement, "58–81% slot-A bias",
  self-agreement 77.1%), `hp-maya-latest.md` ("all 8 judge families fail the 0.80 bar") and `SYNTHESIS.md` §5
  row 9 all contain them.
- **The inherited evidence measures a different task.** Those judges did holistic and pairwise quality judgement of
  Hinglish companion replies (Meera/Maya). Slot-A bias is a pairwise-preference artefact. None of it measures
  binary *outcome extraction* from a sales transcript ("did the caller promise to pay on date X?"). That is a far
  easier, checkable extraction task.
- SYNTHESIS row 9 itself prescribes "judges extract beliefs and code scores them against a hidden key" as the
  acceptable pattern.
- The 80% and 90% accuracies in the model are hypothetical. No extraction-accuracy backtest on labelled call
  transcripts exists.
- "Outcomes must be earned in code (CRM, payment, booking events)" is a sound design rule. But "LLM outcome labels
  are too noisy to drive learning" is asserted, not measured.

Corrected: "Each 10 points of label error roughly doubles the calls needed, and a 3-point differential bias
manufactures winners. Our judge failures were on preference judging, not outcome extraction. Prefer code-earned
outcomes and measure LLM extraction accuracy against CRM ground truth before using it."

## Lane quality notes

1. **`report.md` is missing** at the cited path, as for every lane in this run. The verification is against code,
   data and `evidence.csv`.
2. **No fabricated numbers found.** Every load-bearing number traces to a script output. Lane-code reruns and my
   independent re-implementations agree within Monte Carlo noise.
3. **The Cohen's h column is wrong by a factor of 2.** `power-n-per-arm.csv` `n_per_arm_cohen_h` is half the
   correct per-arm n.
4. **The normal approximation inflates P(best) for starved arms** in `sim.py` and `hier.py` (`pbest_beta`). At
   100/day Thompson declares ~20-25% with exact Beta posteriors, against 29-34% under the approximation.
5. **The A/A noise floor depends on the number of variants.** The report should give K = 2 numbers (~52-62% false
   winners in 90 days with daily P(best) >= 0.95), because that is the configuration vendors ship.
6. **Questions the lane did not answer:**
   - The brief asks to separate per-contact, per-cohort and per-segment learning. That is only partly covered
     (L12, L13 memory evidence plus the pooling sim).
   - The fix the lane recommends for peeking (always-valid or mSPRT sequential tests, Johari) is cited but not
     simulated. Nothing shows the false-winner rate it would achieve at 100/day, or its power cost.
   - No empirical prior on how large real script-change effects are. The +5/+10/+25% relative lifts are assumed,
     and the field sources that would anchor them (Berman & Van den Bulte; Kohavi) were blocked (B01, B02).
   - Delayed outcomes are simulated, but not tied to the actual lag of each segment's outcome (collections
     promise-to-pay vs payment; insurance renewal paid).
   - No measured outcome-extraction accuracy (see claim 8).
7. **SquadStack contradicts the claim's own evidence.** The lane's L29 shows a vendor marketing outcome-driven
   self-tuning, yet claim 7 says no vendor was read that does this. The lane flagged the contradiction with l4a but
   did not carry it into the claim.
