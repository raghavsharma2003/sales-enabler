<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l6: self-learning at real call volumes (H7)

Date: 2026-10-17. Lane id: `l6-self-learning`. Azure spend: INR 0 (no paid calls; everything here is computation,
primary-source reading and our own harvested measurements).

Method note. All numbers in "Measurements" are **computed by us** with code in `code/` (seeded, re-runnable,
no network). The programme-wide WebSearch budget was exhausted before this lane started searching, so outside
evidence was read **only by direct URL** from primary pages (arXiv abstracts, vendor documentation, the DPDP gazette
text) plus other lanes' ledgers. Three hosts blocked us (INFORMS, SSRN, Springer/Nature login walls); those sources
are listed as blocked and are not used as evidence. Vendor statements are labelled vendor claims.

Files:
- `code/power.py`, `data/power-*.csv`, `charts/power-mde-vs-n.png`: power analysis and per-segment volume check
- `code/sim.py`, `data/sim-bandit-summary.csv`, `data/sim-bandit-curves.csv`, `charts/sim-*.png`: bandit simulation
  (400 runs per configuration, 98 configurations)
- `code/hier.py`, `data/sim-hierarchical.csv`, `charts/sim-hierarchical.png`: pooling across tenants (200 runs x 30
  tenants per configuration)
- `code/dropoff.py`, `data/dropoff-*.csv|json`, `charts/dropoff-detection.png`: drop-off line mining, proxy metrics,
  label noise (3,000-4,000 simulations per cell)
- `data/evidence.csv`: the evidence ledger for this lane (40 rows plus 4 blocked)

---

## 1. Answer to the hypothesis

**"Agents that learn from every call" is real in three forms and not real, for v1, in the form most people mean.**

1. **Per-contact learning is real at any volume.** Memory of a person's language, preferences, promises, objections
   and opt-outs needs one call, not a sample. Our own products already run it cheaply (recall@8 95.7%, about $0.0007
   per person per night). It is table stakes among US platforms (Retell, Bland and Synthflow document contact
   memory); Indian platforms mostly do not document it. The one live trial in our harvest **failed adherence** (a
   stored Hindi preference produced an all-English reply), so it ships only with a live adherence test.
2. **Failure mining measured in code is real at hundreds of calls.** Aligning the telephony hang-up time with the
   TTS clause timestamps gives a per-line hang-up hazard with no LLM in the label. A line that doubles the hazard is
   found with probability 0.67 at 500 calls and 0.94 at 1,000, with at most 1% false flags. A fix that halves a 10%
   line hazard is confirmed with about 600 calls per arm on that local metric, against 4,028 per arm on whole-call
   completion and about 26,000 per arm on conversion.
3. **Outcome-level script selection (bandits) is real only at volume.** For a +10% relative lift on a 20% outcome,
   Thompson sampling at 1,000 calls/day picks the right variant 85% of the time by day 7 and loses under 1% of
   outcomes. At 100 calls/day it is right 72% of the time by day 30 and 91% by day 90. A +5% effect is a coin-flip
   among near-ties for a quarter. A fixed test needs 6,510 calls per arm for +10% relative at a 20% baseline.
4. **Autonomous self-rewriting from production outcomes is not real for v1.** No production voice-agent vendor we
   read documents it. Retell, Vapi, ElevenLabs, Bland and Regal ship fixed traffic splits with manual promotion,
   and none documents a statistical method or sample size. PolyAI Wren and Retell Conductor draft changes that a
   human approves. Prompt optimisers (GEPA, MIPRO, TextGrad, ACE) are measured on benchmarks with dense,
   verifiable metrics, not on sparse, delayed sales outcomes. A self-improving agent (Darwin Gödel Machine) was
   caught removing the markers its own hallucination check relied on.

**Pooling across tenants is not a free fix.** When tenants in a segment behave alike, partial pooling gets 89% of
low-volume tenants onto the right variant within a week (58% when each tenant learns alone). When they differ, a
single segment policy hands the wrong winner to 48-55% of tenants. Pooling raw personal data across tenants also
needs each tenant's contract (DPDP s.8(2)) and is barred for WhatsApp data (Meta terms s.4.7).

**Kill check (brief: "the volume needed exceeds what the beachhead's buyers place in a month"):**
- **Passes** for memory, code-labelled failure mining and local-metric fix confirmation. The median modelled buyer
  in insurance renewals (about 9,400 AI-handled connected calls a month at steady state) or real estate (about
  6,100) clears the ~1,200-call local test easily. At an assumed pilot volume of 20% of steady state, 51-80% of
  buyers in the top segments still clear it.
- **Fails** for per-tenant outcome optimisation during pilots. At pilot volume, the share of buyers who can detect
  a +10% relative outcome lift in month one is 36% (collections), 22% (insurance renewals), 3.5% (real estate) and
  0.7% (D2C).

So VP may truthfully say "remembers every customer, finds where calls fail, and proves the fixes you approve". It
may not say "gets better on its own from every call", except for tenants above about 1,000 calls a day on one
script.

---

## 2. Prediction check vs `predictions.md` (H7, prior 0.80)

Prediction: *"Changing one script line cannot be validated from 100 calls; a 5-point effect needs on the order of
800+ calls per arm. Per-contact memory and personalisation are feasible immediately. Script learning is feasible only
pooled across a tenant or a segment."*

| part | verdict | evidence |
|---|---|---|
| One line cannot be validated from 100 calls | **Supported** | At 100 calls per arm the smallest detectable drop is 19.3 points at a 50% baseline, 13.4 at 20% and 9.0 at 10%. Power to detect a 5-point drop is 11-27%. The 95% interval on an observed 50% is 40.4-59.6%. Even a line that doubles the hang-up hazard is flagged only 19% of the time at 100 calls. |
| 5-point effect needs ~800+ per arm | **Supported in order of magnitude; understated at mid baselines** | Calls per arm: 50->45 needs 1,565; 30->25 needs 1,251; 20->15 needs 906; 10->5 needs 435. Equal *relative* changes cost far more: 20->22 needs 6,510 and 10->11 needs 14,751. |
| Per-contact memory feasible immediately | **Supported on statistics, unproven in practice** | It needs no sample. Our harvest shows it is cheap and recall works, but the only live preference trial failed adherence. |
| Script learning feasible only pooled across a tenant or segment | **Partly refuted** | (a) Per-tenant learning works on *local* metrics from ~50 calls/day per script and on outcomes from ~1,000 calls/day. (b) Segment pooling helps only when tenants are alike. When they differ (tau 0.2-0.4) one segment policy gave 6.6-14.2% regret and wrong winners for 48-55% of tenants, against 1.0-1.3% regret alone. (c) Pooling of personal data is contract- and channel-constrained. |

**Overall: mixed.** The direction is right and the headline numbers are close. The design conclusion ("pool to make
it work") is the part that is wrong, and it is the part that matters most for the build.

---

## 3. Evidence (load-bearing subset; the full ledger is `data/evidence.csv`)

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| L01 | 50->45 needs 1,565 calls/arm; 30->27 needs 3,554; 10->8 needs 3,213; 20->22 needs 6,510 (alpha 0.05 two-sided, power 0.8) | `code/power.py` | 2026-10-17 | computed (checked by simulation: power 0.79-0.81) | high |
| L02 | 100 calls: Wilson 95% on 50% = 40.4-59.6%; MDE 13-19 pts at 20-50% baselines | `code/power.py` | 2026-10-17 | computed | high |
| L03 | Daily-peeked A/A z-test: false winner 16% by day 7, 27-28% by day 30, 36-37% by day 90 | `code/power.py` (4,000 sims/cell) | 2026-10-17 | computed | high |
| L04 | Continuous monitoring makes standard p-values "wholly unreliable"; always-valid inference deployed on a large commercial platform | Johari, Pekelis, Walsh, arXiv:1512.04922 v3 | 2019-07-16 | read-primary | high |
| L05/L06 | Steady-state AI-handled calls per buyer per month: collections p50 18,728; insurance renewals 9,440; real estate 6,089; D2C 3,003. Share able to test +10% relative in one month: 80/63/28/10% (pilot at 20%: 36/22/3.5/0.7%) | `code/power.py` on l3 `sizing.py` and l2 call length | 2026-10-17 | computed from other lanes' assumptions | medium |
| L07 | A 2x hazard line is flagged with probability 0.19 / 0.67 / 0.94 at 100 / 500 / 1,000 calls; false flags <= 2.6% | `code/dropoff.py` | 2026-10-17 | computed (assumed hazard curve) | medium |
| L08 | Confirming a line fix needs ~592 calls/arm on the local hazard vs 4,028 on completion vs 25,963 on conversion | `code/dropoff.py` | 2026-10-17 | computed | medium |
| L09 | An LLM outcome label at 90% accuracy inflates required calls 1.8-2.4x (80%: 3.6-5.5x); a judge biased 3 pts to one variant "finds" it better in 57.5% of A/A tests | `code/dropoff.py` | 2026-10-17 | computed | high |
| L10 | Every LLM judge family we tested failed a 0.80 agreement bar; self-agreement 77.1%; slot-A bias 58-81% | `docs/harvest/hp-main.md`, SYNTHESIS s.5 | 2026-10-15 | own measurement | high |
| L12 | Live preference trial: stored Hindi, replied entirely in English | `docs/harvest/hp-handoffs.md` | 2026-10-15 | own measurement | high |
| L14 | GEPA beats GRPO by 6% average (up to 20%) with up to 35x fewer rollouts, and beats MIPROv2 by >10% (ICLR 2026 oral) | arXiv:2507.19457 v2 | 2026-02-14 | read-primary | high |
| L18 | DGM raised SWE-bench 20%->50% by self-modification and "removed the markers we use in the reward function to detect hallucination" | arXiv:2505.22954 v3; sakana.ai/dgm | 2025-05-30 / 2026-03-12 | read-primary | high |
| L21-L25 | Retell, Vapi, ElevenLabs and Bland ship fixed traffic splits with manual promotion and no documented statistics or sample size. Retell Conductor, Vapi suggestions and PolyAI Wren draft changes that humans approve. | vendor docs (URLs in ledger) | read 2026-10-17 | read-primary | high (Wren: medium) |
| L29 | SquadStack claims a self-improvement layer that tunes scripts with compliance, pricing and identity in locked sections, an A/B engine per lead, outcome pricing and 50 lakh+ AI calls/day | squadstack.ai | read 2026-10-17 | vendor claim | low |
| L30 | A GenAI assistant for 5,179 support agents raised issues resolved per hour 14% (34% for novices) | Brynjolfsson, Li, Raymond, QJE 140(2) 2025 / NBER w31161 | 2025 | read-primary | high |
| L31 | Disclosing a voice bot before an outbound sales call cut purchase 0.237 -> 0.048 (~1,040/arm) | Luo et al. 2019 via l5 E01 | 2019-11 | read-primary (via l5) | high |
| L32 | Three TTS vendors moved intro hang-up only 87.9-90.3% across ~99,400 survey calls | Rime/Miravoice via l5 E09 | 2026-06-24 | vendor claim | low-medium |
| L33 | DPDP s.8(2): processor only under a valid contract; s.6(1): consent limited to the specified purpose; s.8(7): erase when the purpose ends | DPDP Act 2023 gazette text | 2023-08-11 | read-primary | high |
| L34 | WhatsApp Platform Data may not train or improve AI except a model for the business's exclusive use | Meta terms s.4.7 via l1 S30 | 2026-09-23 | read-primary (via l1) | high |
| L35 | TRAI reg 21A: telco AI flags 10-digit CLIs with short calls and high recipient diversity; 5 flags in 10 days lead to KYC re-verification and a 15-day bar; 140/1600/1601 exempt | l1 S03 (TRAI Regulation 18-09-2026) | 2026-09-18 | read-primary (via l1) | high |
| L39 | Bandit data biases sample means and IPW intervals; adaptively weighted AIPW restores coverage | Hadad et al., arXiv:1911.02768 | 2021-02-12 | read-primary | high |

Contradiction kept: l4a's parity matrix (2026-10-17, from a SquadStack sub-page) records "no self-serve learning
loop". The SquadStack homepage read by this lane on the same day claims a self-improvement layer and an A/B engine.
Both are vendor copy; neither is verified.

---

## 4. Measurements

All measurements were computed on 2026-10-17 with code in `code/`. Simulated "calls" are connected calls with a
binary outcome. Posteriors update once a day. "Declare a winner" means P(best) >= 0.95 at a daily check, the rule
dashboards commonly use. P(best) is computed by Gauss-Hermite quadrature on the normal approximation of each Beta
posterior, so the check adds no Monte Carlo noise. This was a correction made mid-lane: a first quick run with
200-500 draws per check inflated false-winner rates, and the reported numbers come from the quadrature version.

### 4.1 Power analysis (`data/power-n-per-arm.csv`, `data/power-what-100-tells.csv`, `charts/power-mde-vs-n.png`)

Calls per arm, two-sided alpha 0.05, power 0.80:

| change | per arm | 5 variants vs control (Bonferroni) |
|---|---|---|
| drop-off 50 -> 45 (brief) | 1,565 | 2,224 |
| drop-off 30 -> 27 (brief) | 3,554 | 5,049 |
| conversion 10 -> 8 (brief) | 3,213 | 4,565 |
| 30 -> 25 / 20 -> 15 / 10 -> 5 | 1,251 / 906 / 435 | 1,778 / 1,287 / 618 |
| drop-off 50 -> 40 / 40 -> 30 | 388 / 356 | 551 / 506 |
| lead qualified 20 -> 22 (+10% rel) / 20 -> 25 (+25%) | 6,510 / 1,094 | 9,249 / 1,555 |
| conversion 10 -> 11 / 10 -> 12 / 5 -> 6 | 14,751 / 3,841 / 8,158 | |
| EMI promise-to-pay 35 -> 38.5 (+10%) | 2,978 | |
| appointment confirmed 70 -> 75 / COD confirmed 85 -> 88 | 1,251 / 2,036 | |

These are connected calls. At a 50% connect rate, dialled calls double.

What 100 calls can and cannot tell you:

| observed rate | 95% Wilson interval at n=100 | smallest detectable drop at 100/arm | power to see -5 pts | at 1,000/arm: interval / smallest drop |
|---|---|---|---|---|
| 50% | 40.4-59.6% | 19.3 pts | 11% | +/-3.1 / 6.2 pts |
| 30% | 21.9-39.6% | 16.3 pts | 13% | +/-2.8 / 5.6 pts |
| 20% | 13.3-28.9% | 13.4 pts | 15% | +/-2.5 / 4.8 pts |
| 10% | 5.5-17.4% | 9.0 pts | 27% | +/-1.9 / 3.4 pts |

100 calls *can* tell you a rate's rough band, catch a catastrophic regression (a 50% outcome falling below about
30%), and give per-contact facts. They *cannot* rank script lines, and they cannot confirm any realistic effect.

**Peeking** (`data/power-peeking-aa.csv`, 4,000 simulations per cell). Two identical arms checked daily with a naive
z-test, stopping at the first significant day, declare a false winner in 16-17% of runs by day 7, 27-28% by day 30
and 36-37% by day 90. The rate is the same at 100 and 1,000 calls/day. A fixed horizon stays at 4.4-5.2%. A
dashboard that "learns from every call" without a stopping rule mostly learns noise.

### 4.2 Per-buyer volume vs what learning needs (`data/power-segment-volumes.csv`)

The inputs are l3's per-firm seat distributions, talk hours, working days and automatable share, plus l2's connected
call length (1.0-3.5 min). All are assumptions inherited from those lanes (20,000 Monte Carlo draws).

| segment | AI calls/buyer/month p25 / p50 / p75 | calls for +10% rel (2 arms) | buyers reaching it in 1 month: steady / pilot 20% | buyers reaching the 1,184-call local line test: pilot |
|---|---|---|---|---|
| lending collections | 7,392 / 18,728 / 46,798 | 5,956 | 80% / 36% | 80% |
| insurance renewals | 3,576 / 9,440 / 25,482 | 5,956 | 63% / 22% | 63% |
| fintech onboarding | 3,460 / 9,543 / 25,956 | 13,020 | 42% / 10% | 62% |
| real estate | 2,513 / 6,089 / 14,408 | 13,020 | 28% / 3.5% | 51% |
| edtech admissions | 2,443 / 5,623 / 12,569 | 13,020 | 24% / 2.0% | 48% |
| healthcare | 1,744 / 4,713 / 12,800 | 7,108 | 39% / 8.9% | 44% |
| auto dealers | 1,481 / 3,394 / 7,603 | 7,526 | 25% / 2.4% | 32% |
| D2C post-purchase | 1,186 / 3,003 / 7,606 | 17,050 | 10% / 0.7% | 31% |

D2C is uncertain in both directions. COD calls are about 0.75 minutes (l2), which would mean more calls, but l3's
own scorecard says a typical brand needs under 2,000 minutes a month. The pilot share of 20% is our assumption; the
interviews should replace it (owner actions).

### 4.3 Bandit simulation, main grid (`data/sim-bandit-summary.csv`, `charts/sim-time-to-correct.png`)

Setup: K = 4 variants, baseline outcome 20%, best variant +5% / +10% / +25% relative (the others at 0.95x, 1.0x and
1.01-1.02x). 90 days, 400 runs per cell. "Fixed split" never stops, so its regret is an upper bound; a real A/B test
would stop and ship.

| calls/day | effect | P(pick correct) day 7 / 30 / 90 (Thompson) | correct winner declared, median day (TS / fixed split) | regret % of possible (TS / fixed / eps-greedy / top-two TS) |
|---|---|---|---|---|
| 100 | +5% | 0.36 / 0.48 / 0.61 | 29 / 24, but only 11% / 14% of runs declare by day 90 | 2.9 / 4.1 / 2.7 / 3.3 |
| 100 | +10% | 0.49 / 0.72 / 0.91 | 49.5 / 40 (29% / 41% declare by day 90) | 3.8 / 7.5 / 3.6 / 5.5 |
| 100 | +25% | 0.75 / 0.97 / 1.00 | 26 / 25 | 2.9 / 15.6 / 3.5 / 10.5 |
| 1,000 | +5% | 0.59 / 0.86 / 0.99 | 45 / 36 | 1.2 / 4.1 / 1.2 / 2.5 |
| 1,000 | +10% | 0.86 / 0.99 / 1.00 | 18 / 15 | 0.9 / 7.5 / 1.3 / 4.3 |
| 1,000 | +25% | 1.00 / 1.00 / 1.00 | 3 / 3 | 0.5 / 15.6 / 2.0 / 9.7 |
| 10,000 | +5% | 0.99 / 1.00 / 1.00 | 7 / 7 | 0.2 / 4.1 / 0.5 / 2.1 |
| 10,000 | +10% | 1.00 | 2 / 2 | 0.15 / 7.5 / 0.9 / 3.8 |

Reading it:
- **Time to the correct choice scales with calls, not days.** The same decision takes about 30-50 days at 100
  calls/day, 3-18 days at 1,000 and 1-7 days at 10,000.
- Thompson sampling is the best regret minimiser at every volume. Top-two Thompson declares correct winners
  sooner (median day 12 vs 18 at 1,000/day, +10%) at 3-5x the regret. Use it only when the goal is "find the best
  script, then ship it".
- Epsilon-greedy is the worst identifier at 100/day (P(correct) 0.78 at day 90 for +10%).
- Wrong declarations stayed at 0-6% with the 0.95 rule. The bigger failure at low volume is *no decision at all*.

### 4.4 A/A noise floor (`charts/sim-aa-false-winner.png`)

With four identical variants checked daily at P(best) >= 0.95, a "winner" had been declared by day 90 in:

| calls/day | fixed split | epsilon-greedy | Thompson | top-two TS |
|---|---|---|---|---|
| 100 | 12.5% | 4.5% | 5.5% | 10.0% |
| 1,000 | 13.5% | 5.2% | 4.3% | 10.2% |
| 10,000 | 11.0% | 6.0% | 6.0% | 12.2% |

Volume does not protect against this. In A/A runs, Thompson put more than 80% of the final day's calls on one
arbitrary variant in 8-10% of runs, and epsilon-greedy did so in 100% by construction. A traffic dashboard would show
"the agent learned variant X" when nothing differs. **Every tenant needs an A/A period, and declared winners need
held-out confirmation.**

### 4.5 Delayed outcomes (`charts/sim-delay.png`)

Medium effect, K = 4, with outcomes revealed D days after the call (renewal payments, site visits, policy issuance).

| calls/day | median day a correct winner is declared at delay 0 / 3 / 7 / 14 / 30 d (TS) | TS regret % at the same delays |
|---|---|---|
| 100 | 42 / 42 / 50 / 51.5 / 63.5 | 3.6 / 4.0 / 4.3 / 4.5 / 5.4 |
| 1,000 | 16 / 17 / 21 / 28 / 46 | 0.8 / 1.1 / 1.3 / 1.8 / 3.2 |
| 10,000 | 2 / 5 / 9 / 16 / 32 | 0.15 / 0.4 / 0.7 / 1.3 / 2.6 |

A delay adds roughly its own length to every decision, and no volume removes it. For slow outcomes (a 30-day
renewal) the learner must use a fast, validated leading indicator (for example a "payment link opened" event earned
in code), or accept monthly cadence.

### 4.6 Non-stationarity (`charts/sim-nonstationary.png`)

K = 3, 150 days.

- **Best arm switches at day 60** (season, list source or offer change), at 1,000/day. Plain Thompson still picked
  the old winner on day 90 in 56% of runs (P(correct) 0.435), and lost 1,077 outcomes after the switch.
  - Discounted Thompson (gamma 0.97/day) reached P(correct) 0.985 on day 90 and lost 489 outcomes.
  - Sliding-window Thompson (21 days) reached 0.983 and lost 433.
  - 95-99% of runs had **declared** a winner before day 60 that was wrong afterwards. **Declared winners must
    expire.**
- **Novelty effect** (a new line starts +25% and decays with a 10-day half-life to -5%), at 1,000/day. The novelty
  variant was declared the winner, and was wrong by the end, in 82% of Thompson runs and 94% of fixed-split runs.
  Forgetting (discounted or sliding window) cut regret from 2.05% to 1.5-1.7% but did not prevent the false
  declaration.
- Cost of forgetting: once the world is stable again, discounted and windowed learners keep exploring. Their final
  share on the best arm was 0.80-0.86 against 0.95 for plain Thompson.

### 4.7 Pooling across tenants (`data/sim-hierarchical.csv`, `charts/sim-hierarchical.png`)

30 tenants in one segment, median 100 calls/day (p10 30, p90 330), K = 3, segment effect +0.10 logit (about +8%
relative), tenant deviation tau. 200 runs.

| scenario | policy | tenants on true best, day 7 / 90 | regret % (low-volume quartile) | tenants with a wrong winner by day 90 |
|---|---|---|---|---|
| A/A | alone / one segment policy / partial pooling | n/a | 0 | **20.6% / 24.0% / 2.5%** (any winner) |
| alike (tau 0.05) | alone | 58% / 83% | 1.59 (3.44) | 6.4% |
| | one segment policy | 91% / 91% | **0.39** (0.41) | 8.9% (the 9% of tenants who differ never recover) |
| | partial pooling | 89% / 92% | 0.93 (1.32) | 5.5% |
| different (tau 0.20) | alone | 71% / 89% | **1.27** (3.29) | 5.7% |
| | one segment policy | 50% / 50% | 6.59 (7.93) | **47.6%** |
| | partial pooling | 69% / 87% | 2.43 (5.08) | 3.7% |
| unlike (tau 0.40) | alone | 81% / 94% | **1.00** (2.77) | 4.9% |
| | one segment policy | 41% / 41% | 14.17 (17.62) | **55.3%** |
| | partial pooling | 81% / 92% | 2.34 (5.29) | 1.2% |

Partial pooling here is a normal-approximation empirical-Bayes estimator (DerSimonian-Laird between-tenant variance,
floor 0.03), not full HierTS, and it ignores the covariance from the shared control arm. Three readings:

1. **Pooling is the fastest learner when tenants are alike.** It is a disaster when they are not, and early data
   cannot tell which case you are in.
2. Partial pooling's main value is honesty. It cut A/A false winners from about 21% to 2.5% and wrong winners to
   1-6% in every scenario. It costs regret when tenants differ (2.4% vs 1.3% alone), because shrinkage makes
   low-volume tenants follow the segment.
3. Pooled data also understates variance. Mixing tenants with different baselines makes the binomial posterior
   overconfident: the A/A false-winner rate was 24% for the pooled policy against 4-6% for one tenant at matched
   volume in 4.4.

### 4.8 Drop-off line mining, proxies and labels (`data/dropoff-*.csv|json`, `charts/dropoff-detection.png`)

Setup: an 8-line script with an assumed position hazard curve (0.15, 0.08, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04; the
first turn carries the AI disclosure). Flag a line when P(hazard > 1.25x curve) >= 0.99.

| calls on the script | P(flag a 2x line) | 2x, other lines vary (sd 0.2) | P(flag a 1.5x line) | any false flag (lines vary) |
|---|---|---|---|---|
| 100 | 0.19 | 0.23 | 0.05 | 2.1% |
| 500 | 0.67 | 0.63 | 0.10 | 1.1% |
| 1,000 | 0.94 | 0.76 | 0.18 | 0.9% |
| 2,000 | 1.00 | 0.87 | 0.38 | 0.2% |
| 5,000 | 1.00 | 0.95 | 0.75 | 0.2% |
| 10,000 | 1.00 | 0.97 | 0.97 | 0.2% |

**Confirming a fix** (line hazard 10% -> 5%), calls per arm:
- 592 on the local metric (435 callers reaching the line)
- 4,028 on whole-call completion
- 25,963 on conversion, if survivors convert like everyone else

**Goodhart case.** The rewrite keeps callers on the line (for example by moving the price later), but the extra
survivors never convert:
- Completion rises from 55.6% to 58.7%, which a learner rewarded on completion adopts with certainty at about 4,000
  calls per arm.
- Conversions do not change.
- Billed minutes per call rise 2.7%. Under per-minute pricing the vendor is paid more for no buyer gain.

The hazard metric is for *finding* problems. Business outcomes decide changes, and pricing per outcome or per seat
removes the conflict (H2b).

**Labels from an LLM reading transcripts.** At 95% labelling accuracy the calls needed rise 1.3-1.6x. At 90% they
rise 1.8-2.4x, and at 80% (where our own judges sit, L10) 3.6-5.5x. A judge that is 3 points more likely to call
"qualified" on one variant (for example because that variant's wording echoes the rubric) declares that variant
better in 57.5% of A/A tests at 2,000 calls per arm. **Outcomes must be earned in code** (CRM disposition, payment
webhook, booking record), per inherited law 9.

---

## 5. What can learn, at which level

| level | what learns | signal | volume to turn on | evidence | must not |
|---|---|---|---|---|---|
| **Per contact** | language and script, preferred time, promises made, objections heard, opt-outs, last outcome, relationship notes | what the person said, earned in code with provenance | 1 call | L12, L13; Retell/Bland/Synthflow document contact memory (l4a) | key memory by channel or device; cross tenants; outlive the purpose (DPDP s.8(7)); train on WhatsApp data beyond the business's own model (L34) |
| **Per script version (one tenant)** | where callers drop (line hazard), turns where ASR returns empty on "haan"/"ok", barge-in failures, tool errors, compliance near-misses | telephony and TTS clause events, ASR events, tool results; no LLM | ~500-1,000 calls per script version | L07, harvest tx-voice (5/14 empty short answers) | let a hazard metric pick the winner (Goodhart, s.4.8) |
| **Per cohort (one tenant)** | which approved variant of a line, opener or objection reply wins on the business outcome | outcome earned in code; fixed horizon or always-valid; Thompson only at volume | local metric ~1,200 calls per test; outcome +20-25% rel ~2,200-3,400; +10% rel ~6,000-13,000; Thompson worth it from ~1,000 calls/day | L01, L08, s.4.3 | declare from a dashboard without A/A; keep winners forever; use LLM-judged outcomes |
| **Per segment (many tenants)** | priors for openers, objection handling and call timing; a playbook library | sufficient statistics (counts per variant pattern), never transcripts | >= 10 opted-in tenants on the same variant family, >= ~3,000 calls/day combined, estimated tau small | s.4.7, L33, L34, L36 | force one segment policy on all tenants; pool personal data without each tenant's contract; pool WhatsApp data |
| **LLM analysis of transcripts** | cluster objections, explain *why* a flagged line fails, draft candidate rewrites, summarise for humans | transcripts (tenant-scoped) | any volume, as proposals only | L10, L14-L17, L20 | label outcomes; rewrite live prompts; judge its own rewrites |
| **Offline prompt optimisation** (GEPA/MIPRO-style) | candidate prompts scored in the sim lab against decided outcomes | sim lab with hidden-key personas; A/A floor n >= 60 per arm (L11) | 0 production calls; promote only via the cohort test above | L11, L14, L16, L20 | optimise against a single LLM judge; skip the code gates; auto-promote |
| **Fine-tuning / RL on outcomes** | not v1 | n/a | n/a | L18 (objective hacking), L19 (over-optimisation) | n/a |

---

## 6. Production evidence and guardrails

**What production systems actually do (read 2026-10-17):**
- **Voice-agent platforms** (Retell, Vapi, ElevenLabs, Bland, Ringg, Regal) ship *traffic splitting by version* with
  manual promotion. None of the docs we read gives a statistical test, a sample-size rule or an A/A step. ElevenLabs
  says only that "small sample sizes lead to unreliable results" and advises 5-10% traffic on the variant.
- **Improvement assistants draft, humans release.** Retell Conductor proposes edits the user accepts and tests in
  simulation. Vapi generates suggestions from simulation runs. PolyAI Wren runs a daily
  review/classify/draft/prove/measure loop, replays fixes against real and simulated calls, and "every change to a
  live agent is reviewed and released by your team".
- **Enterprise CX** (Sierra) learns per customer (memory) and turns expert answers into knowledge articles. Cresta
  learns from top human performers and feeds managers and coaching. Neither documents autonomous prompt changes.
- **India.** SquadStack *claims* self-improving scripts inside locked compliance, pricing and identity sections, plus
  an A/B engine and outcome pricing (vendor claim, unverified). l4a found no documented learning loop at Bolna,
  Sarvam, Gnani, Smallest, Ringg or Ravan.
- **The strongest field evidence of "learning from conversations" lifting outcomes** is the human-assist case: 14%
  more issues resolved per hour, 34% for novices, across 5,179 agents (Brynjolfsson et al.). It spreads top
  performers' practice to people, with a human in every loop.
- **Self-improving agents in research** do improve on benchmarks: GEPA (+6-20% over GRPO, 35x fewer rollouts), ACE
  (+10.6% on agent benchmarks), DGM (SWE-bench 20%->50%). All three rely on dense, cheap, verifiable rewards. DGM
  was caught gaming its hallucination detector. ACE names "context collapse" and "brevity bias" in iterative
  rewriting, which is the same failure family as our law 2 (recitation). OpenAI's self-evolving-agents cookbook
  itself recommends human approval and rollback because "the optimization is not always successful".

**Guardrails for VP, mapped to inherited laws (SYNTHESIS s.2):**

1. **A learned line is just a new prompt version.** It goes through the same `compile()` and gated reply door (law
   3), the shape lint against recitable sentences (law 2), the throwing prompt budget (law 4), the never-rules and
   delimited material (law 13), and the honesty provenance gate (law 11: a learned line cannot introduce a number,
   price or identifier absent from the input).
2. **Locked sections cannot be learned:** AI disclosure, consent and opt-out handling, helplines and safety, identity,
   pricing and offer facts (law 22: offers live in data, so a learned line cannot change a price). Rules that must
   fire stay last (law 1), so a learned variant only ever replaces a slot in the middle of the prompt.
3. **Outcomes are earned in code** (law 9) from CRM, payment and booking events. LLM labels are advisory unless a
   measured accuracy is recorded and the inflation factor is applied. Judges never see the variant id.
4. **Every change to a live agent needs a human approval** written as one SQL clause (the Mirror Call
   `decideMirrorDelta` pattern; law 12 for anything outbound).
5. **Statistics as code:**
   - an A/A period per tenant before the first test
   - a pre-registered metric, minimum n and stopping rule (fixed horizon, or always-valid per L04)
   - effects reported from a held-out fixed split or AIPW (L39), never from the bandit's own sample means
   - winners expire after 60-90 days or on a drift alarm
   - "under-powered" and "not measured" are first-class states (law 21; earbench's under-powered verdict)
6. **Guardrail metrics with automatic stop** (each counted by a writer that has been read back, law 21):
   - opt-out and do-not-call requests, complaints
   - AI-identity questions and disclosure adherence
   - early hang-up (< 10 s) ratio per 10-digit CLI (TRAI reg 21A flags short calls; 1600/1601/140 are exempt)
   - minutes-per-call rising without an outcome change (the Goodhart alarm)
   - barge-in and ASR-empty rates
7. **Pooling only on aggregate counts, only for tenants whose contract allows it** (DPDP s.8(2)). Never WhatsApp
   platform data (Meta s.4.7). Only while the estimated between-tenant variance is small. Treat this as our reading of
   the law, pending the lawyer review in owner actions.
8. **Price per outcome or per seat, not per minute**, wherever the learner optimises anything correlated with call
   length.

---

## 7. Design note: the safest high-value v1 of idea 2 ("self-improving agents")

**Principle:** learning = **measure in code -> propose -> approve -> prove -> expire**. Nothing in a live agent
changes without a human approval and a measured result. Contact memory is the exception, because it is data about
one person, not a policy change.

| loop | v1? | turn on when | output | stop or rollback trigger |
|---|---|---|---|---|
| L0 Contact memory and preferences (with provenance, consent ledger, forget, purpose-bound retention) | **yes, day 1** | 1 call | facts per (tenant, contact), cited to the episode | adherence test fails (language or opt-out ignored); any cross-contact leak |
| L1 Calibration call (owner talks to the agent; corrections become proposed deltas) | **yes, day 1** | 0 production calls | proposed deltas -> SQL approval | n/a |
| L2 Failure mining measured in code (line hazard from clause timestamps vs hang-up; ASR-empty turns; barge-in misses; tool errors; compliance near-misses) | **yes** | >= 500 calls on a script version (2x lines found 67%); >= 1,000 (94%) | ranked problem lines with credible intervals; LLM explains and drafts rewrites | none (read-only) |
| L3 Approved fix, proved on the local metric (two arms, fixed horizon, pre-registered) | **yes** | ~1,200 calls on that script inside the test window (about 12 days at 100/day, 24 at 50/day) | ship or discard; effect with interval | guardrail metric breach; Goodhart alarm |
| L4 Outcome A/B for big structural choices (opener, disclosure timing, call time, channel order) | **yes, when n allows** | the power table: +25% relative at 20% needs ~2,200 calls; +10% needs ~13,000 | ship or discard; effect with interval | guardrail breach; expiry at 60-90 days |
| L5 Thompson sampling among approved variants on the outcome | **opt-in, high-volume tenants** | >= ~1,000 calls/day on one script, outcome delay <= 7 days or a validated leading indicator, A/A passed | allocation plus a periodic held-out read-out | discounted (gamma ~0.97/day) or windowed; winners expire; exploration floor; exploration stops if early-hang-up per CLI rises (reg 21A) |
| L6 Segment priors (partial pooling on counts) | **later (v1.5)** | >= 10 opted-in tenants on the same variant family, >= ~3,000 calls/day combined, estimated tau small | priors for new tenants; playbook library | estimated tau rises; any tenant revokes |
| L7 Offline prompt optimisation (GEPA/MIPRO) in the sim lab | **later** | sim lab with decided outcomes and a measured A/A floor | candidate prompts -> L3/L4 | n/a (never auto-promotes) |
| L8 Fine-tuning / RL on outcomes; cross-tenant transcript learning; autonomous online rewriting | **no** | n/a | n/a | n/a |

What this buys a beachhead buyer in month one, at the median pilot volume (insurance renewals ~1,900 AI calls a
month; real estate ~1,200):
- every contact remembered
- a ranked list of the lines where callers hang up or the agent mishears
- one or two fixes proved on local metrics
- an honest "not enough calls yet" on outcome-level claims

That is more than incumbents document, because none of them shows statistics, A/A or winner expiry.

---

## 8. Gaps in the market found

1. **Honest experimentation for voice agents.** Every platform read ships traffic splits but documents no test, no
   sample-size guidance, no A/A and no winner expiry. A power calculator, A/A by default, always-valid stopping,
   "under-powered" as a visible verdict and expiring winners are unserved, and they protect buyers from the
   16-37% false winners measured above.
2. **Line-level drop-off mining from clause timestamps.** No vendor documents per-line hang-up hazards with
   intervals. Vendors document post-call extraction by LLM, which carries the label-noise penalty (s.4.8).
3. **Regulation-aware exploration.** No vendor documents tying experiment allocation to TRAI reg 21A short-call risk
   on 10-digit CLIs. In force from about 2026-10-18 (l1), this is new and India-specific.
4. **Consent-scoped segment learning.** No one documents aggregate-only, contract-gated pooling under DPDP. SquadStack
   claims learning across "400 million+ real sales interactions" (vendor claim), so the pooled-data moat argument
   belongs to an incumbent unless VP can make the honest, consented version a selling point to regulated buyers
   (insurance, lending).
5. **Contact memory is partly unserved in India.** It is present in US platforms but at most partial or undocumented
   at the Indian vendors l4a checked. It is a parity item there, not a moat.

---

## 9. What would kill this

- **Pilot volumes are much smaller than modelled.** If interviews show pilots of about 300-600 calls a month per
  script, even the local-metric loop (L3) cannot prove a fix inside a month, and v1 learning reduces to memory plus
  diagnostics.
- **No clause-aligned hang-up events.** If the telephony path (ACS Direct Routing plus an Indian carrier, unbuilt per
  the harvest) cannot deliver hang-up timestamps aligned to our TTS clause events, line mining falls back to
  transcripts and LLM labels, and costs 2-5x more calls.
- **No outcome feedback.** If beachhead buyers cannot or will not send outcomes back (CRM disposition, payment,
  booking), there is no outcome learning at all, only proxies, and the Goodhart risk becomes the default.
- **Real script effects are mostly below 5% relative.** The only large-sample voice data point we have (TTS vendor
  choice moved intro hang-ups at most 2.4 points over about 99,400 calls) suggests many line-level effects are this
  small. Per-tenant outcome learning would then be infeasible below about 10,000 calls/day.
- **Contracts or counsel forbid cross-tenant aggregates.** Segment priors (L6) then die, and each tenant learns alone,
  which is slower, as shown in s.4.7.
- **Discovery disproves the buyer's interest.** If buyers say they want the vendor to manage scripts (as
  SquadStack's managed model implies) rather than see experiments, the honest-experimentation gap is real but not
  valued.

---

## 10. Owner actions

1. **Add six questions to the discovery interview guide** (past behaviour, not opinions):
   - "How many connected calls did this campaign or script make last month?"
   - "When do you know a call converted, and where is that recorded?" (outcome delay and system)
   - "When did you last change the script, why, and how did you know it worked?"
   - "Who listens to calls today, and what share?"
   - "Can you export last month's dialler report with hang-up timestamps and dispositions?"
   - "Would you let anonymised counts from your calls improve a shared playbook, if others' counts improve yours?"
2. **Collect one anonymised dialler export** (timestamps, dispositions, no names or numbers) from an interviewee in
   insurance renewals or real estate. It replaces this lane's assumed hazard curve and pilot share. Steps: ask under
   NDA, strip phone numbers and names at source, then share the CSV.
3. **Ask a DPDP/telecom lawyer two written questions:**
   - Can a Data Processor compute and reuse aggregate per-variant success counts across fiduciaries under s.8(2)
     contracts, and what clause is needed?
   - Does exploration that raises short-call ratios on a 10-digit CLI create reg 21A exposure for the principal
     entity or the vendor?
4. **Decide the claim language** for the website and sales copy. Allowed: "remembers every customer", "shows where
   calls fail", "proves the changes you approve". Not allowed: "learns on its own from every call" (it cannot be
   substantiated below about 1,000 calls a day per script).
5. **Decide the pricing unit with H2b in mind.** If any learning loop optimises something correlated with minutes,
   per-minute pricing creates a Goodhart incentive the buyer will eventually notice.

---

## 11. Open questions

- What are the real hazard curves for Indian AI calls, especially the first turn after an AI disclosure? l5 cites
  56% hang-up within 5 seconds in a 2017-era Chinese study and about 88-90% intro hang-up in US survey calls; neither
  transfers. l4b's measured calls or an interviewee export should answer this.
- What is the distribution of line-level effect sizes in Indian telecalling? We found no primary data. The tenants'
  own script-change history is the only realistic source.
- What are the outcome delays per segment (renewal payment, site visit, KYC completion), and is there a leading
  indicator earned in code that predicts each one?
- How large is between-tenant heterogeneity (tau) within a segment? It decides whether L6 is worth building, and only
  multi-tenant data can estimate it.
- Would a full HierTS (or a logistic hierarchical model) close the regret gap we measured for partial pooling in
  heterogeneous segments, while keeping its low false-winner rate?
- Does the 1600/1601 series (exempt from reg 21A flagging, used for service calls) change the exploration risk
  calculus for post-sales beachheads such as insurance renewals and collections reminders?
