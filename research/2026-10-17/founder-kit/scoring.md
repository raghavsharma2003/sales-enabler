# Scoring interviews against the hypotheses

Date: 2026-10-17, round 2. **Pre-registered.** These rules are fixed before the first interview (Mon 2026-10-19). The round-1
rules are kept in `scoring.round1.md`.

**Why the rules changed before any interview.** Round 2 restated three kill criteria from new evidence: critic A12 (sampling),
the per-renewal model (A4) and the IRDAI intermediary layer (A1/A2). Every change is logged under "Deviations" at the bottom.
Results are reported under **both** the round-1 and the round-2 rules, so nobody can pick the rule after seeing the data.

**After interviews start, the rules freeze.** If a rule changes after that, keep the old rule. Log the change with the date and
reason, and report results under both. Changing a threshold after seeing the data is how a beachhead survives its own kill
criteria.

**Where things live:**
- the criteria: `../SYNTHESIS.md` §1.2 (KC1-KC7) and §2 (RE-K1 to K5, LEN-K1 to K5);
- the questions: `interview-guide.md`;
- the one-page mapping: `kc-answer-sheet.md`.

Interviews can **fire** some criteria and only **feed** others:
- counsel decides KC5 and LEN-K1;
- the battery decides KC6;
- the pilot decides KC7.

§8 says which is which.

---

## 1. Who counts: the qualification rules (the denominators)

Decide qualification from the facts in the note, before scoring anything else.

| segment | in scope when ALL hold | qualified (for KC2, KC3 and pilot asks) when also |
|---|---|---|
| **[INS]** | 1. IRDAI-registered IMF, direct or composite broker, corporate agent (non-bank) or PoSP platform. 2. Retail (individual) motor, health or life is ≥50% of the book. 3. The interviewee decides on renewals or reports directly to whoever does. | 4. ≥300 retail renewals fall due per month. |
| **[RE]** | 1. A developer selling its own projects, or a channel partner with mandated developer inventory. 2. The interviewee owns pre-sales or sales, or reports to whoever does. | 3. ≥300 inquiries a month. |
| **[LEN]** | 1. An RBI-registered NBFC or NBFC-MFI, or a collection agency working NBFC or bank portfolios. 2. The interviewee owns collections or reports to whoever does. | 3. ≥1,000 accounts due a month, or ≥300 entering 1-30 DPD. |

**Two denominators, and why.**
- **KC1 asks how common the buyer is in the pool.** So it is scored over **in-scope** interviews, without the volume floor. A
  small firm is the finding, not a reason to drop the interview.
- **KC2 and KC3 need meaningful numbers.** They are scored over **qualified** interviews (with the floor).
- Report every count both with and without the floor, as round 1 required.

Evidence for conditions 2-4 may be grade C; record it.

---

## 2. Beachhead kill criteria [INS], restated for round 2

### 2.1 Strata, and how they are weighted back to the pool

Each insurance target carries a stratum in `targets.csv`. Score each interview under the stratum it **actually** belongs to (the
`interview-guide.md` §5 item 4 check), and log any mismatch with `targets.csv`.

| stratum | who | firms in reach (low / mode / high) | firm weight W (mode) | volume share among these three channels (brokers, non-bank CAs, IMFs), FY25 |
|---|---|---|---|---|
| **A** | small/mid retail brokers | 130 / 200 / 260 (assumption) | 0.21 | brokers (A+D): motor premium 89%, individual health policies 87%, life new business 57% |
| **B** | non-bank corporate agents | 175 / 250 / 391 (register, computed) | 0.26 | motor 11%, health 12%, life 41% |
| **C** | IMFs | 496 / 496 / 799 (register validity; Handbook T98) | 0.52 | motor not reported separately; health 1.6%, life 1.9% |
| **D** | large brokers and PoSP platforms | 12 / 20 / 30 (assumption) | excluded from firm weights | inside the broker share |

Notes:
- **Sources.** `strata.csv` and `code/strata.py`. The register counts come from the IRDAI register pages fetched on
  2026-10-17. Volume shares are from the IRDAI Handbook 2024-25, T103/T104/T99, as re-read by the l2 round-2 verifier.
- **The IMF count is uncertain.**
  - 940 IMFs are listed, but only 496 show a validity date on or after today. The Handbook counts 799 at 31-03-2025.
  - FY25 output per IMF was about 75 health and 42 life policies (verifier, on the 799 denominator).
- **Two weightings, two answers.** Weighted by firm count, IMFs are half the pool. Weighted by renewal volume, they are about 2%.
  The rules below report both.

### 2.2 KC1: too few buyers (I1)

**Firm-level score (A/B evidence only):**

| sub-score | +1 when | −1 when | role |
|---|---|---|---|
| **I1** (round-2 form, decisive) | Retail due renewals a month ≥ 3 × the firm's own due renewals worked per caller. If they can't say, use the default: ≥ 6,800 | Below that | Counts for KC1 |
| I1-desk (round-1 form) | ≥3 FTE make renewal calls, or there is a named renewal desk | Renewals happen only through PoSPs, branches or the insurer, or fewer than 3 people make occasional calls | Reported, not decisive |
| I1-rev | The card bill (`interview-guide.md` Appendix A2) ≥ ₹1.1 lakh a month, about 7,000-9,000 due on a mixed book | Below | Reported against SYNTHESIS's ₹1.1-1.5 lakh revenue line |

Where the thresholds come from:
- **6,800 due a month.** The seat-method equivalent of a 3-seat desk at an assumed 1,500 due per seat (car 6,803, health
  6,790, life 6,766; two-wheeler-only books 16,014). Source: `renewal-model.json`, `kc1_due_per_month_for_3_seat_desk`.
- **Due per seat** is the unmeasured input. The interview measures it, so the firm's own number replaces 1,500.

**Segment rule (decisive, round 2):**
1. For each stratum s in A, B and C, compute k_s / n_s:
   - k_s = in-scope interviews scoring I1 = +1;
   - n_s = in-scope interviews held.
   - C-graded answers count in n_s but never as +1.
2. Compute **p̂_firm = Σ W_s × k_s / n_s** with the mode weights above.
3. **KC1 fires if p̂_firm < 1/3.** That is the same line as "5 of 15".
   - It is computed only when each of A, B and C has n_s ≥ 3. Otherwise the result is "incomplete" and the plan (§8) adds
     interviews in the missing stratum.
4. **Also report, without changing the decision:**
   - the round-1 rule: a raw count of I1-desk = +1 among the first 15 qualified, D included; it fires below 5;
   - **p̂_vol**: the volume-weighted share, using health-policy shares (A+D pooled 0.87, B 0.115, C 0.016) and again with motor
     shares (0.89 / 0.11 / C omitted);
   - p̂_firm under the low and high firm counts.
5. **Reading.** If KC1 fires on p̂_firm but p̂_vol ≥ 1/3, the buyer exists only among larger brokers, CAs and platforms.
   - The beachhead **moves**: it narrows to those strata, and the pool is re-sized to them.
   - It does not simply die.
   - Log this as a decision with its own reversal condition.

**Stratum drop rule.** After ≥3 in-scope interviews in a stratum, the stratum is dropped from the ICP if both hold:
- none scores I1 = +1;
- at least 2 have fewer than 300 due renewals a month.

When a stratum is dropped, the in-reach pool is re-sized without it (l1 round 2 asked for exactly this sensitivity for IMFs).
Stratum C is also dropped if counsel holds that IMF reg 3(d) bars the service.

### 2.3 KC2: price too low (I3)

**What changed.**
- The ₹150-per-save floor is passed trivially by every line except two-wheeler (model p50 values per save: 2W ₹265, car
  ₹2,415, health ₹2,737, life ₹1,941), so it tests the wrong thing.
- Per-minute pricing at ₹6-8 loses money at launch costs in every line, with gross margin −47% to +1%
  (`../lanes/l2-economics/round2/verify.md` §2).
- KC2 is therefore restated as: **does the buyer accept a per-renewal price at or above VP's 40%-gross-margin launch floor on
  its main line?**

**Firm-level score.**
- **I3 +1** if GG-max on the main line (A/B evidence of the volumes behind it; the price answer itself is hypothetical) is ≥ the
  floor below.
- **I3 −1** if it is below the floor.

Choose the floor column from the firm's two answers in `interview-guide.md` §13.3:

| line | card | floor: all renewals billable, VP takes hand-offs (default) | floor: only renewals after the first call billable | floor: buyer takes hand-offs |
|---|---|---|---|---|
| car (4W) | ₹50 | ₹28 | ₹35 | below ₹28 (not computed) |
| health | ₹15 | ₹14 | ₹19 | below ₹14 (not computed) |
| life (yr 2+) | ₹15 | ₹17 | ₹24 | below ₹17 (not computed) |
| two-wheeler | ₹20 | ₹29 | above ₹35 (not computed) | ₹22 |

Floors are `vp_min_fee_per_renewal_gm40_launch` p50 from `renewal-results.csv`, and the l2 round-2 verifier's variants.

**Additional life rule.** If the firm's actual life renewal commission is ≤3.2%, life at ₹15 fails the buyer test. The verifier
measured P(gain vs desk) = 0.40 at observed rates. Score life I3 = −1 regardless of GG.

**Segment rule (decisive, round 2):** **KC2 fires if fewer than 3** qualified firms in A or B score I3 = +1. Three is the brief's
proof bar of 3 pilots from 15.
- C counts only after counsel clears IMFs.
- D is reported separately.

**Also report:**
- the round-1 rule: GG-max ≥ ₹6/AI-min-equivalent **and** stated value per save ≥ ₹150;
- the count per line;
- the count that accepted the card's definition of "renewal collected".

**Sense check (soft −1, as in round 1).** Compute the fee per incremental save: monthly fee ÷ (due a month × Δ), at Δ = 2, 5 and
10 percentage points.
- If that exceeds the firm's own stated value per save at Δ = 5 pp, score a soft −1 on I3, even if GG said "probably".
- Model incremental saves per 1,000 due (p50): 2W 71, car 51, health 17, life 21. That is Δ ≈ 7.1, 5.1, 1.7 and 2.1 pp.

### 2.4 KC3: no leakage (I2)

**What changed.** The round-1 line of "≥90% renewal without calling" is replaced by **each line's break-even**. That is the
no-call renewal ratio above which the buyer's maximum per-renewal fee falls below VP's 40%-margin floor (mode case,
`renewal-model.json`, `kc3_breakeven_baseline_mode_case`):

| line | two-wheeler | car | health | life (yr 2+) |
|---|---|---|---|---|
| break-even no-call renewal ratio | 63% | 96% | 97% | 93% |

**Firm-level score, on the main line, A/B evidence:**
- **I2 −1** if any of these holds:
  - the no-call ratio ≥ the line's break-even;
  - the firm loses no commission on a lapse (the original agent keeps it, or nothing is at risk);
  - the firm's overall renewal ratio, *with* its current calling, is already ≥ the break-even.
- **I2 +1** if the ratio is below break-even **and** the firm names commission it loses on lapses.

**How to measure the no-call ratio.** Use the share of never-reached customers who renewed anyway (`interview-guide.md` §7
item 3). If that is missing, use the overall ratio as an upper bound.

**Segment rule (decisive, round 2):** **KC3 fires if the firm-weighted share of I2 = −1 is ≥ 1/2** among qualified A, B and C
interviews (the majority line). Use the same weights as KC1.

**Also report:**
- the round-1 rule: ≥8 of 15 at the 90% line;
- the per-line counts;
- how many firms say the insurer, an aggregator or the dealer reaches their customer first (competition), which is leakage of a
  different kind.

### 2.5 KC5 input: the number they call from (I8)

Interviews never fire KC5; counsel does. Score I8 for the record:
- **+1**: on 1600 through a CPaaS.
- **−1**: personal mobiles or 10-digit numbers.

On every −1, also mark which of these applies:
- **trigger**: they are worried, or have been asked to move;
- **not enforced**: they know of the rule and nothing has happened.

IRDAI made 1600 mandatory for all insurers and intermediaries from 2026-02-15 (circular of 06-01-2026; l1 round 2), so a −1
means non-compliance since that date. Report both marks to counsel, together with the IMF answers on reg 3(d) (ISPs only, prior
approval, no telemarketers).

**Side reading for the market model.** The TRAI cross-check put the l3 bottom-up insurance-renewal minutes at about 4.4×
(p50; p10-p90 0.6-31×) the in-reach share of 1600 traffic (`trai-reconciliation.csv`). Either the seat model is high, or
in-reach calling runs off-series on 10-digit numbers.
- If most A-C firms score I8 = +1, the seat model is high, by about 3-6× in minutes.
- If most score −1, the comparison says little.

---

## 3. Evidence grades

From `note-template.md`:

| grade | meaning | weight |
|---|---|---|
| **A** | shown | 1.0 |
| **B** | specific past figure | 0.7 |
| **C** | estimate | 0.3 |
| **D** | opinion or hypothetical | 0 |

**Rule: a kill criterion can only fire on A or B evidence.** C evidence can only trigger a follow-up request for the artefact.
Price answers (GG, VW) are hypothetical by nature. They are allowed in I3 because the brief's proof bar (paid pilots or LOIs at a
stated price) tests them later.

For each hypothesis, record one value per interview:
- **+1**: the evidence supports it;
- **−1**: the evidence contradicts it;
- **0**: no evidence.

Record the grade next to it.

---

## 4. Other [INS] hypotheses (design and context; none fires a kill criterion)

| id | hypothesis | +1 when (A/B) | −1 when (A/B) | rule | feeds |
|---|---|---|---|---|---|
| I4 | Buyers compare against cost per outcome | Picks per-renewal or per-extra-renewal at an equal bill (§13.7), or already pays per outcome | Picks per minute or per seat | ≥8 of 15 at −1 reopens the pricing unit | H2b |
| I5 | Renewal lists are spreadsheets or exports | Spreadsheet, CSV or portal export | Only inside a CRM with no export, or paper | Majority confirms or refutes the unsourced claim | integration |
| I6 | Founder- or ops-led buying in weeks | Last purchase approved by founder, PO or ops head in ≤8 weeks | Procurement, IT or compliance sign-off, or >8 weeks | Report counts per stratum | H10, KC4 realism |
| I7 | A point tool is acceptable | Added a tool beside the CRM before | "Must live inside a new CRM" (past example required) | ≥5 of the first 15 at −1 revisits the command centre | H8 |
| I9 | Quality is salient | Names language, older-customer or call-quality failures | "Any voice is fine" | Feeds battery personas | KC6 input |
| **I10** | A holdout is acceptable | Accepts 10% (or names a share ≥5%) after hearing its commission cost | Refuses any holdout | Majority −1 means KC7 needs a quasi-experimental fallback (staggered start, matched months) | KC7 design |
| **I11** | Renewal is a service call, not a sale | Most motor renewals are same-insurer, same-cover reminders | Most motor renewal value comes from re-quotes, switches or add-on upsell | Majority −1 means re-testing KC2/KC3 on a reminder-only role, and a counsel question | U6-INS-3 |
| **I12** | The intermediary reaches the customer first | Insurer, aggregator or dealer contact is rare before theirs | The customer has usually been contacted, or has renewed elsewhere, before their call | Report counts. Majority −1 means calling must start earlier than the insurer | competition |
| **I13** | Hand-offs are the buyer's | A named person or team takes callbacks, including evenings | Nobody, or they expect VP to | Sets the KC2 floor column | economics |
| **I14** | The premium is on the list | The insurer's renewal notice figure is in the list | A fresh portal quote per policy is needed | Majority −1 means a quote integration is on the build list | integration, mis-quote risk |
| **I15** | Seasonality fits a flat minimum | Trough month ≥ about 70% of average | Trough below 70%, or a big dead season | Majority −1 means a seasonal minimum (e.g. 12-month averaging) | pricing |
| **I16** | Attrition hurts | Attrition ≥ about 50% a year, or ramp-up ≥ 1 month, with cost named | Stable team, quick ramp-up | Pain context | pain |
| **I17** | Fear of fake calls is manageable | Rare, with a working way to prove identity | Frequent refusals or scam suspicion; customers told not to click links | Majority −1 means no cold payment links in the design; a listener-panel item | trust design |
| **I18** | The buyer runs QA and grievance handling | Recordings kept and sampled; named grievance owner | No recordings, no QA, ad-hoc complaints | Majority −1 means VP must supply QA and grievance routing | product |

---

## 5. Model inputs, recorded as numbers (not ±1)

Record these per interview, with grades, in the score row (§9). They replace the round-2 model's assumptions. The model is
re-run once 8 A/B values exist for an input (owner or research action).

| field | model assumption (low / mode / high) | question |
|---|---|---|
| `due_per_caller_month` | 800 / 1,500 / 3,000 | `interview-guide.md` §7.1 |
| `answer_rate_per_attempt` | 0.30 / 0.42 / 0.55 | §7.2 |
| `max_attempts` | (model K) | §7.2 |
| `reachable_share` | 0.75 / 0.88 / 0.95 | §7.2 |
| `renewed_before_first_call_share` | 2W 0.10-0.40; car 0.10-0.35; health and life 0.15-0.45 | §7.3 |
| `never_reached_renewed_share` | (proxy for the no-call baseline b0: 2W 0.30-0.60; car 0.45-0.75; health 0.75-0.92; life 0.70-0.90) | §7.3 |
| `renewal_ratio_by_line` and its basis (policies or premium) | as above | §7.4 |
| `trough_month_share` | motor 0.70-0.90; health 0.85-0.97; life 0.55-0.85 | §7.5 |
| `best_vs_avg_caller_save` | (anchors AI-human parity 0.5 / 0.8 / 1.05) | §7.6 |
| `commission_pct_by_line` | 2W 8-25%; car 10-28%; health 10-20%; life 3-7.5% (observed private life 1-3.2%) | §8.4 |
| `attrition_per_year`, `ramp_weeks` | not modelled | §8.2 |
| `escalation_owner`, `escalation_share` | VP pays; 5-25% of reached customers, 2-6 min | §6, §13.3 |
| `billing_base_accepted` | all renewals on the list | §13.3 |
| `holdout_accepted_share` | 10% | §13.4 |

---

## 6. Pain and commitment (Mom-Test currency)

Score both for every interview. They decide who gets the pilot ask (`plan.md` §6).

**Pain (0-3), from the failures section:**

| score | meaning |
|---|---|
| 0 | No pain described |
| 1 | Pain acknowledged, nothing done |
| 2 | Time or people already spent trying to fix it in the last 6 months |
| 3 | **Money** spent on it in the last 6 months (a hire, vendor, tool or campaign) |

**Commitment (0-5):** the highest level reached.

| score | meaning |
|---|---|
| 0 | Compliments only |
| 1 | A follow-up meeting with a date |
| 2 | Intro to their boss or a peer |
| 3 | Artefact shared |
| 4 | LOI at a stated price |
| 5 | Paid pilot or purchase order |

A "yes, sounds great" with commitment 0 is a **no** for every decision in this file.

**Pilot-ask eligibility. All of these must hold:**
- qualified;
- stratum A or B (C only after counsel clears IMFs; D only as a platform conversation);
- pain ≥ 2;
- commitment ≥ 2;
- I3 not −1 on the main line.

---

## 7. Price arithmetic (the KC2 and per-line calculations)

Use the interviewee's own figures. Fall back to `interview-guide.md` Appendix A only when a figure is missing, and mark the
result "default-based".

```
[INS], per line L:
due_L          = policies falling due per month on line L                    (section 1/3)
renew_L        = renewal rate on the AI-worked list                         (their figure; default: model p50)
bill           = max(15000, Σ_L  due_L × 0.9 × renew_L × fee_L)              (0.9 = list minus the 10% holdout)
holdout_cost   = Σ_L  (due_L / 1000) × holdout_cost_per_1000_L               (Appendix A1)
value_per_save = premium_L × commission_pct_L                               (their figures)
yield_per_min  = bill / AI-connected minutes   (reported only; ₹6/min is no longer a test for [INS])

[RE] and [LEN] (unchanged):
fee           = max(Min, p × outcomes);  yield_per_min = fee / (list_items × k × m) ≥ ₹6;  break_even_p = 6 × k × m / r
```

**Van Westendorp with n ≈ 10-15.** Don't compute crossing points; there are too few answers. Report the median and range of
each of the four answers per line.

---

## 8. Decision rules: when to look, and what can fire

| checkpoint | when | what to compute | what can happen |
|---|---|---|---|
| **Stratum check** | After the first 3 held in-scope interviews in each stratum | k_s/n_s for I1; volume floor | Apply the stratum drop rule (§2.2). Replace a no-show from the seeded draw order (`register-sample-frame.csv`), never by convenience |
| **Interim** | After 8 qualified [INS] (planned about Thu 2026-10-29) | I1 per stratum, I2, I3 so far | Keep going if I1 has +1s in at least two strata and I2 is not majority −1. If p̂_firm ≤ 0.15 **and** I2 ≥ 5 of 8 at −1, move the remaining insurance slots to [RE] early; log a deviation |
| **Beachhead decision** | After 15 qualified [INS], with each of A, B, C at n_s ≥ 3 in-scope | KC1 (p̂_firm), KC2, KC3, plus the round-1 rules and p̂_vol | Any firing means the beachhead "dies or moves" (SYNTHESIS §1.2). A KC1 firing with p̂_vol ≥ 1/3 means it moves (narrowed strata, re-sized pool) |
| **Switch test** | After 10 qualified [RE] | R1, R2 | **Switch to alternate 1** if KC1, KC3 or KC5 fired **and** R1 is majority +1 **and** R2 has ≥3 of 10 at ₹300-500 |
| **Alternate 2 read** | After 5-10 qualified [LEN] | L1-L7 | No firing from interviews alone. Hand L5 and L7 to counsel, L3 to the battery's price comparison |
| **Channel (KC4, RE-K4)** | Week 10 of outreach | Funnel per stratum (`plan.md` §4) | **Fires** if, of the first 60 targeted intermediaries, fewer than 10 took a discovery call **or** fewer than 3 accepted a paid pilot. Report the funnel per stratum and per selection type |
| **Not decided here** | — | KC5, LEN-K1/K4 (counsel); KC6, RE-K3 (battery); KC7 (pilot); LEN-K5 (Azure pricing) | Interviews only supply inputs (I8, I10, I13, I18, IMF reg 3(d) answers) |

**Small samples: report counts and intervals, never bare percentages.** 90% Wilson intervals for reference:

| result | 90% interval for the true share |
|---|---|
| 1 of 3 | 0.08-0.75 |
| 3 of 15 | 0.08-0.41 |
| 5 of 15 | 0.17-0.54 |
| 8 of 15 | 0.33-0.72 |
| 10 of 15 | 0.46-0.83 |
| 3 of 10 | 0.13-0.56 |
| 5 of 10 | 0.27-0.73 |

**Per-stratum reads at n = 3-6 are very wide.** The decision lines are pre-registered decision rules, not market-share estimates.

---

## 9. The score row (one per interview)

Append to `data/discovery/scores.csv` (gitignored). Columns:

```
target_id,date,segment,stratum_targets,stratum_true,selection,company_type,role,in_scope,qualified,qual_reason,pain,commitment,
I1,I1_grade,I1_desk,I1_rev,I2,I2_grade,I2_line,I3,I3_grade,I3_line,I3_floor_used,I4,I5,I6,I7,I8,I8_mark,I9,I10,I11,I12,I13,I14,I15,I16,I17,I18,
R1,R1_grade,R2,R2_grade,R3,R4,R5,
L1,L2,L3,L4,L5,L6,L7,
due_2w,due_4w,due_health,due_life,main_line,due_per_caller_month,answer_rate_per_attempt,max_attempts,reachable_share,
renewed_before_first_call_share,never_reached_renewed_share,renewal_ratio_main,renewal_ratio_basis,trough_month_share,
best_vs_avg_caller_save,comm_2w,comm_4w,comm_health,comm_life,attrition_per_year,ramp_weeks,escalation_owner,
billing_base_accepted,holdout_accepted_share,unit_choice_equal_bill,imf_isp_only,imf_dm_approval,
gg_max_inr,gg_unit,card_bill_month_inr,value_per_outcome_inr,vw_too_cheap,vw_bargain,vw_expensive,vw_too_expensive,
artefacts_received,pilot_ask_eligible,scorer,second_scorer,notes_file
```

- `targets.csv` holds no personal data, so `target_id` is safe to keep.
- `role` holds a title only.
- The anonymised roll-up for `research/` and `context/` drops `target_id` and reports by stratum, not by firm (`plan.md` §7).

---

## 10. Keeping the scoring honest

1. **Score from the note, not from memory.** If a fact isn't in the note, it scores 0.
2. **Use a second scorer for every [INS] interview, if one is available.**
   - The second scorer reads only the note and scores blind.
   - Settle disagreements with the grade rules, not by discussing what the person "meant".
   - If an AI model is the second scorer, give it the redacted note only. Record `second_scorer: model` and treat it as a check,
     not a vote.
3. **Count disconfirming interviews out loud.** At each checkpoint, write one paragraph headed "What would have to be true for
   this to be wrong?"
4. **Watch the selection bias, by design.** Report I1 within each stratum separately for:
   - `selection = random` (the register draw);
   - `signal` (a phone-team job post);
   - `website` (visible renewal flows).

   Round 1 selected mostly on signals, and the critic's point was that this over-states desks. If random and signal disagree,
   the random read is the pool estimate.
5. **Watch the warm-intro bias.** Report I1-I3 separately for cold-sourced and warm-sourced interviews.
6. **Watch the referral bias.** Referrals cluster. Cap them at 3 per seed firm in the qualified [INS] count. A referral is scored
   in its own true stratum.

---

## 11. Priors registered before the first interview (package author, not evidence)

These are written so the outcome can be scored against them later, as `predictions.md` does for the hypotheses. They are
judgements from desk evidence, not measurements.

| prediction | prior | basis |
|---|---|---|
| KC1 fires on p̂_firm (round-2 form) | 0.60 | IMFs average about 75 health + 42 life policies a year; the l3 seat model reads about 3-6× high in minutes against TRAI 1600 traffic |
| KC1 fires on p̂_vol | 0.30 | Brokers carry 49.5% of all FY25 motor premium (89% of the broker + non-bank-CA total) and 87% of the three channels' individual health policies |
| Stratum C meets the drop rule | 0.65 | Same IMF output figures; `stratum_rule` |
| A majority of in-scope A-C firms call from personal or 10-digit numbers (I8 −1) | 0.70 | TRAI 1600 volume is small relative to the modelled calling; job posts describe ordinary telecalling floors |
| Car is the main line at a majority of qualified firms | 0.35 | Two-wheeler is the larger count in most motor books |
| KC2 passes on the car line (≥3 firms at GG-max ≥ ₹28) | 0.60 | Car value per save p50 ₹2,415 against a ₹50 card |
| A majority accept a 10% holdout once its cost is stated | 0.40 | Critic §6 item 7: "I'm not holding out 15% of my book" |

---

## 12. What goes into `context/` when the programme ends

Following the repo's logging rules (`AGENTS.md`):
- **Measurements**, with n, method and date. For example: "I1 (round-2 form): stratum A 3 of 5, B 1 of 4, C 0 of 4; p̂_firm
  0.20, p̂_vol 0.57 (A/B evidence; interviews 2026-10-19 to 11-06)".
- **Decisions**, each with its reversal condition. For example: "Beachhead narrowed to strata A and D (KC1 fired on firms, not
  on volume). Reverse if a second 15-firm round shows p̂_firm ≥ 1/3".
- **Rejections.** For example: "IMF stratum dropped: 3 of 3 held IMFs below 300 due a month".
- **Deviations** from this file.
- **Model-input updates.** The §5 numbers, so the per-renewal model can be re-run.

Never write personal data, verbatim artefacts or recordings into `context/`.

---

## Deviations

All rows dated 2026-10-17 were made **before any interview**, on round-2 evidence. Results are reported under both rules.

| date | rule changed | old (round 1) | new (round 2) | why | results reported under both? |
|---|---|---|---|---|---|
| 2026-10-17 | KC1 measure | ≥3 renewal telecallers or a desk, ≥5 of the first 15 qualified | Due renewals ≥ 3 × own due-per-caller (default 6,800), firm-weighted across strata A-C; p̂_firm < 1/3 fires | The 20 targets over-sampled brokers and platforms (critic A12). A desk is not a buyer unless the book pays for it (A4) | yes |
| 2026-10-17 | KC1 denominator | qualified (≥300 due a month) | in-scope (no volume floor) | Small firms are the finding for pool size | yes (both floors) |
| 2026-10-17 | KC2 test | GG-max ≥ ₹6/min-equivalent and value ≥ ₹150 a save | GG-max ≥ the line's 40%-GM launch floor; life fails at ≤3.2% commission | ₹150 passes trivially; ₹6-8/min loses money at launch (l2 round 2) | yes |
| 2026-10-17 | KC3 line | ≥90% renewal without calling | Per-line break-even: 2W 63%, car 96%, health 97%, life 93% | The value at risk differs by line; 90% mixed lines | yes |
| 2026-10-17 | I8 meaning | "is a compliant path available" | Compliance probe: 1600 mandatory for intermediaries since 2026-02-15; mark trigger vs not enforced | IRDAI circular 06-01-2026 (l1 round 2) | n/a (new reading) |
| 2026-10-17 | Pilot eligibility | qualified, pain ≥2, commitment ≥2, price not −1 | Adds: stratum A or B (C after counsel) | IMF reg 3(d) (l1 round 2, U6-INS-2) | n/a |
| 2026-10-17 | New hypotheses | I1-I9 | Adds I10-I18 and the §5 model inputs | Critic A12 missing probes; A4 unmeasured inputs | n/a |
| | | | | | |
