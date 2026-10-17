<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

# r2-founder-kit: findings

Date: 2026-10-17 (Saturday), round 2 of the VP research programme. Package: critic items **A12**, and A4's interview price.

Scope: the founder kit for the discovery interviews that start **Monday 2026-10-19**. Nothing was sent, nobody was contacted, nothing was committed, and no Azure money was spent (₹0).

The harness refused the `findings.md` write, so this text exists only here.

---

## 0. What changed in the decision because of this package

1. **The kit now samples the pool it is meant to measure.**
   - The round-1 insurance list was 13 brokers, 4 PoSP platforms, 2 corporate agents and 1 IMF.
   - The active 20 are now:
     - 6 small/mid retail brokers (A);
     - 5 non-bank corporate agents (B);
     - 6 IMFs (C);
     - 3 large brokers or platforms (D).
   - Five of the A-C rows come from a **seeded random register draw** and were not selected on any phone-team signal. They are the unbiased read of how common renewal desks are.
   - Every new company was found in the IRDAI register pages fetched live today.
2. **Kill criteria 1-3 are restated per stratum and per line, and pre-registered before any interview.**
   - **KC1** is now due renewals a month against a 3-seat-desk equivalent: about 6,800, or 3 × the firm's own due-per-caller. It is weighted back to the pool by firm count and also reported by volume.
   - **KC2** is now each line's 40%-margin launch floor. The ₹150-per-save floor tested nothing.
   - **KC3** is now each line's break-even no-call renewal ratio, not a flat 90%.
   - Results will be reported under both the round-1 and the round-2 rules.
3. **The concept test has a real price.**
   - The card: ₹50 per car, ₹15 per health or life and ₹20 per bike renewal collected, with a ₹15k monthly minimum and a 10% holdout reported quarterly and never billed.
   - It comes with the two definitions that move margin most: whether renewals before the first call are billable, and who takes hand-offs.
   - It also carries the verifier's warnings: life fails at observed commission rates, and the minimum prices out IMFs and small agencies.
4. **Eleven missing probes are in the guide.** Each is tied to a criterion or to a model input nobody has measured. "What number do you call from?" is now a 1600 compliance probe, scored both as a buying trigger and as evidence of non-enforcement.
5. **New risk surfaced while pricing: IRDAI's own consultation.**
   - The proposed commission caps of 23-09-2026 are a proposal; comments are due 25-10-2026.
   - They would cut the intermediary's value per saved renewal to about 0.33-0.49 of the modelled value.
   - At that level, the card's health, life and two-wheeler fees exceed what the buyer gains against its own desk. Only the car line survives.
   - This bears on KC2 and KC3. The interview asks about it as context, never as a firing input.
6. **IMFs are interview-only.** IMF Regs reg 3(d) allows IMF distance marketing only without telemarketers, only through ISPs and with prior IRDAI approval (l1 round 2). No pilot or LOI ask goes to an IMF until counsel answers.

---

## 1. Re-stratifying the insurance targets (critic A12)

### 1.1 Why

By firm count the in-reach pool is IMF-heavy; by renewal volume it is broker-heavy. The round-1 list sampled neither shape. Its brokers and platforms were picked mostly for websites with renewal flows or for telecaller job posts. Both select on the very outcome KC1 tests.

| stratum | register count (2026-10-17) | firms in reach, low / mode / high | firm weight (mode) | FY25 volume share among brokers, non-bank CAs and IMFs |
|---|---|---|---|---|
| A small/mid retail brokers | 874 listed, 696 with current validity | 130 / 200 / 260 (assumption: 15-30% retail-focused) | 0.21 | brokers (A+D): 89% of motor premium; 87% of individual health policies; 57% of life new business |
| B non-bank corporate agents | 448 listed (198 other plus 250 NBFC/finance, by name), 391 valid; banks 241 | 175 / 250 / 391 | 0.26 | 11% motor, 11.5% health, 41% life |
| C IMFs | 940 listed, **496** with current validity | 496 / 496 / 799 | 0.52 | 1.6% health, 1.9% life (motor not separate) |
| D large brokers and PoSP platforms | inside the broker count | 12 / 20 / 30 (assumption) | excluded | inside the broker share |

**Sources and caveats:**
- The register counts were parsed from the IRDAI list pages fetched at 2026-10-17 20:08 UTC, using company-level fields only (`code/strata.py`, `strata.csv`). The volume shares come from IRDAI Handbook 2024-25 T103/T104/T99, as re-read by the l2 round-2 verifier.
- **The "940 IMFs" in SYNTHESIS is a listing count.**
  - Only 496 show a validity date on or after today. Handbook T98 counts **799 at 31-03-2025**.
  - FY25 output per IMF was about **75 health and 42 life policies** (verifier, on the 799 denominator). The brief's 64 and 36 used 940.
  - The validity semantics are not verified.

### 1.2 The active 20

| stratum | wave 1 (Mon 19 Oct) | wave 2 (Wed-Fri) | selection mix |
|---|---|---|---|
| A (6) | INS-03 Square, INS-05 RMIB, INS-11 Clarion, INS-12 BYR, INS-21 **Saggio** (new) | INS-01 Probus | website 3, signal 3 |
| B (5) | INS-14 Mihit, INS-15 Golden Arm, INS-27 **NLVD Assurance** (new), INS-28 **S. Sood Corporate Advisors** (new, random #1) | INS-29 **DGV Digital Insurance** (new, random #2) | signal 3, random 2 |
| C (6) | INS-13 RB IMF, INS-22 **Raising Group IMF** (new), INS-24 **Riskcovery IMF** (new, random #1), INS-25 **Uniqver IMF** (new, random #2) | INS-23 **Planway Futuristic IMF** (new), INS-26 **Metroxone IMF** (new, random #3) | signal 3, random 3 |
| D (3) | INS-10 Hero Insurance Broking, INS-18 Turtlemint | INS-17 PolicyBoss | size 3 |

**Reserve.** INS-02, 04, 06, 07, 08, 09, 16, 19 and 20, with stable IDs.

**Verification:**
- Every new row was found in the live register by its registration code.
- Saggio's own site names Saggio Insurance Broking Pvt Ltd and says "Regulated by IRDAI" (CoR 1049).
- The four new Apna evidence URLs exist in the l3 crawl.

**The random draw:**
- Seed 20261019.
- The IMF frame is the 496 currently valid IMFs.
- The CA frame is the 66 currently valid, non-bank, non-NBFC corporate agents with insurance or advisory names, composite or general.
- `code/strata.py` reproduces the draw.
- `register-sample-frame.csv` holds the frames in draw order: 1,432 rows, company-level only. It serves replacements and the next 40 screens.

**Wrong-entity traps found this round:**
- `dgvdigital.com` is a Vietnamese software firm.
- `planway.in` is a Tamil Nadu construction firm.
- `riskcovery.com` is a 114-byte placeholder.
- `nlvd.in` returns a WordPress error page.

**Privacy.** No personal names, phones or e-mails are stored anywhere in the kit.

### 1.3 Sampling rules, pre-registered

- **Weighting.** KC1 is computed per stratum, weighted back with the firm weights, and reported with volume weights too. It needs ≥3 in-scope interviews in each of A, B and C.
- **Firing by firm count only.** If KC1 fires on firm count but not on volume, the beachhead **moves** to the larger strata.
- **Dropping a stratum.** A stratum is dropped, and the pool re-sized, after ≥3 in-scope interviews in which none counts for KC1 and ≥2 are below 300 due a month.
- **Selection types.** Results are reported separately for random, signal and website selection. Where they disagree, the random read wins.
- **Replacements.** These follow the draw order only.

---

## 2. Kill criteria restated with the round-2 economics

All figures come from the per-renewal Monte Carlo in `lanes/l2-economics/round2/` (seed 20261017, n = 20,000). Its verifier reproduced the outputs byte-identical. The inputs are assumptions.

| criterion | round 1 | round 2 (decisive) | basis |
|---|---|---|---|
| KC1 buyers exist | ≥5 of 15 run ≥3 renewal telecallers | Due renewals a month ≥ 3 × own due-per-caller (default **6,800**); firm-weighted share ≥ 1/3 across A, B and C | Seat method, 3-seat desk: car 6,803, health 6,790, life 6,766, 2W-only 16,014. SYNTHESIS's ₹1.1-1.5 lakh a month needs **7,000-9,000** due on a mixed book (₹16.05 per due), or 3,700-16,000 depending on the mix |
| KC2 price | GG-max ≥ ₹6/min-equivalent and value ≥ ₹150 a save | GG-max on the main line ≥ the line's 40%-GM launch floor: **2W ₹29, car ₹28, health ₹14, life ₹17** | Higher floors if only post-first-call renewals are billable (car ₹35, health ₹19, life ₹24); 2W ₹22 if the buyer staffs hand-offs |
| KC3 leakage | ≥90% renewal without calling, or no commission lost | Main-line no-call ratio ≥ the line's break-even: **2W 63%, car 96%, health 97%, life 93%**, or no commission lost | Mode case only |

**Why the ₹150-per-save floor tests nothing.** The value of one saved renewal is now measured at the line's commission, not the insurer's premium. At p50:
- 2W ₹265 [162-413];
- car ₹2,415 [1,440-3,881];
- health ₹2,737 [1,865-3,848];
- life years 2+ ₹1,941 [1,170-3,125].

This replaces the round-1 gate of ₹1,000-30,000. Every line clears ₹150, except 2W at the margin (P = 0.93).

**Why per-minute pricing fails.** At ₹6-8 per minute, launch gross margin is −47% to +1% in every line. The all-in cost is about ₹7.9-8.8 per AI minute: COGS of ₹5.88, plus about ₹2 for VP-paid escalation, WhatsApp and 1600. If the buyer carries escalations, the range is −8% to +21%.

**Two unmeasured inputs decide whether AI beats the buyer's own desk:**
- due renewals worked per telecaller (assumed 800-3,000 a month);
- AI-human persuasion parity (assumed 0.5-1.05).

The guide measures the first and anchors the second.

**The TRAI cross-check, corrected.** It puts the l3 bottom-up insurance-renewal minutes at about 4.4× (p50) the in-reach share of 1600 traffic.
- Either the seat model is about 3-6× high, or in-reach calling runs off-series on 10-digit numbers.
- The number question tells the two apart.

---

## 3. The concept-test price card for Monday

**The card:**
- ₹50 per car renewal collected;
- ₹15 per health renewal;
- ₹15 per life (year 2+) renewal premium;
- ₹20 per two-wheeler renewal;
- a ₹15,000 monthly minimum, credited against usage;
- a random 10% holdout, reported quarterly, never billed.

| | car | health | life | 2W |
|---|---|---|---|---|
| ₹ per AI-connected minute | 23.5 | 16.1 | 12.4 | 9.7 |
| VP launch GM | 67% | 45% | 33% (50% at ₹20) | 13% |
| P(launch GM ≥ 40%) | 0.99 | 0.65 | 0.33 | 0.07 |
| Buyer ceiling vs no calling / vs own desk | ₹186 / ₹63 | ₹55 / ₹20 | ₹49 / ₹19 | ₹36 / ₹29 |
| Bill per 1,000 due a month | ₹29.5k | ₹11.6k | ₹11.1k | ₹9.4k |

**The rule behind it.** Each fee is the highest rung at which the buyer gains with P ≥ 0.8 against no calling and P ≥ 0.6 against its own desk. 2W is exempt from the desk test.

**The verifier weakened the card. Each weakness is handled in the kit:**

1. **Life.**
   - At observed private renewal commission (≤3.2%), life value is about ₹1,040, and life fails the buyer test at ₹15.
   - Handling: ask the actual commission. Score life −1 if it is ≤3.2%.
2. **Billing base.** Renewals that arrive before the first AI attempt are 19-29% of billed renewals. If the buyer won't pay for them, launch gross margin falls:

   | line | car | health | life | 2W |
   |---|---|---|---|---|
   | launch GM | 66% → 58% | 45% → 22% | 33% → 5% | 13% → −11% |

   Handling: ask explicitly. The answer switches the KC2 floor.
3. **Escalation.**
   - VP-borne hand-offs are 19-26% of launch cost, and that share is unmeasured.
   - Handling: ask who answers at 8 pm and who takes hand-offs.
4. **The ₹15k minimum.**
   - It is a judgement call. It exceeds modelled usage below about 935-1,150 due a month, and is 7× usage for a 150-due agency.
   - Handling: record the reaction and never discount on the call. Seasonality tests the case for averaging.
5. **Quarterly holdout reads are noise, except for car and 2W on large books.**
   - At 1,500 due a month with a 10% holdout, detecting the median modelled lift takes 2.9 months (2W), 5.4 (car), 25.8 (health) and 20.7 (life).
   - Handling: the founder says so plainly, and states the holdout's commission cost first (about ₹8,600 a month for a mixed 1,500-due broker).
6. **Health** is probably about 15% lower after the post-GST commission cuts (secondary source, low confidence).

**H2b unit test at an equal bill.** The same expected bill, priced three ways:
- per renewal collected;
- per extra renewal above the holdout: about ₹640 car, ₹740 health, ₹580 life, ₹150 2W;
- per AI minute: ₹10-23.

---

## 4. New: the IRDAI distribution consultation and the card

The consultation paper "Recalibrating Economics of Insurance Distribution" is at IRDAI document 9852848 (comments due **25-10-2026**). It proposes maximum commission for Distribution Entities:
- motor, old vehicle: TP 2.5%, OD 10%;
- individual health renewal: 5%;
- life renewal: 2-3%.

The source is Box 4A/4B, read-primary in the r2-competition excerpts.

**Computed here** (`code/caps_sensitivity.py`). The model's premium triangles are multiplied by the capped rates. The motor TP share comes from the 2022 tariff, which is an assumption.

| line | model p50 | under caps p50 [p10-p90] | ratio |
|---|---|---|---|
| 2W | ₹264 | ₹116 [60-188]; P(≥ ₹150) = 0.27 | 0.42 |
| car | ₹2,418 | ₹1,063 [593-1,718] | 0.43 |
| health | ₹2,726 | ₹915 [655-1,238] | 0.33 |
| life | ₹1,949 | ₹955 [603-1,473] | 0.49 |

**What happens to the card's fees.** Buyer ceilings were scaled linearly (an approximation, not a re-run):
- the car fee stays inside both ceilings (about ₹80 against no calling, ₹27-32 against the desk);
- the health and life fees exceed the desk ceiling (₹7-11 and ₹9-15);
- the 2W fee exceeds even the no-call ceiling (about ₹15).

This is a proposal, not a rule. If it is adopted, the value case narrows to car-motor books. The kit asks about it as grade-D context only. Re-running the model with capped commissions is a research action that has not been done.

---

## 5. Probes added to the interview guide

| probe | where | decides | prompted by |
|---|---|---|---|
| Telecaller attrition | §8.2 | I16 pain; desk cost | brief; critic §6.8 |
| Connect rate, attempts, wrong numbers | §7.2 | model answer rate, attempts and reachability | anchor was a vendor blog |
| Insurer-direct and aggregator renewals | §6 | I12; KC3 context | Gnani and SquadStack insurer cases (vendor claims) |
| Fear of fake renewal calls and links | §10.3 | I17; trust design | Navi Mumbai: 145 complaints, ₹14.08 lakh; Delhi: ₹5 a record; IRDAI AR 2024-25 |
| Who answers at 8 pm | §6, §13.3 | I13; KC2 floor | escalation is 19-26% of launch cost |
| Premium source | §9.2 | I14; mis-quote risk | critic §6.5 |
| Seasonality | §7.5 | I15; minimum fit | model trough 0.55-0.97 |
| Holdout that forgoes commission | §13.4 | I10; KC7 design | critic §6.7; MDE table |
| Number they call from (1600) | §11.1 | I8, marked trigger or not enforced; TRAI check | IRDAI circular 06-01-2026; CNAP from 2026-11-01 |
| QA and Bima Bharosa | §11.5 | I18; product requirement | 2,57,790 grievances in 2024-25 |
| Re-quote or sell at renewal | §6 | I11; solicitation question to counsel | l1 round 2 U6-INS-3 |
| Due worked per caller | §7.1 | KC1 threshold; AI vs desk | unmeasured input 1 |
| Best vs average caller save rate | §7.6 | parity anchor | unmeasured input 2 |
| Renewals before the first call | §7.3, §13.3 | billing base | moves health and life GM 23-28 points |
| Actual renewal commission by line | §8.4 | value per save; life rule | assumption in every line |
| IMF distance-marketing practice | §11.6 | counsel; stratum C | IMF reg 3(d) |

---

## 6. Contradictions kept

1. **IMF output per firm.** 75 health and 42 life policies (799 denominator) against 64 and 36 (940). Both are kept; the verifier's figures are used.
2. **Life price.** The card says ₹15. The verifier says life fails at observed commission. Scoring uses the firm's actual commission.
3. **The life Gabor-Granger ladder** was centred on ₹20 in the l2 package and on ₹15 here.
4. **1600 pickup.** Vendors claim higher pickup. Truecaller says its users ignored 79% (interested party, no baseline). Consultation responses assert lower pickup without numbers. The kit asks only for an opinion.
5. **Solicitation.** The l1 verifier lowered confidence to medium. The intermediary regulations define solicitation as *purchase*, and the PPHI definition is reg 5(13) and scoped to Part A. The kit treats re-quotes as the risky part.
6. **Pool size.** l3's mode of about 1,300 firms against the register-based estimate here of about 950 (A+B+C) plus about 20 (D). Both rest on assumptions.

---

## 7. What the interviews can and cannot settle

**They can:**
- fire KC1, KC2 and KC3 per stratum and per line;
- measure the model's unmeasured inputs;
- collect artefacts.

**They cannot:**
- decide KC5 (counsel), KC6 (the battery) or KC7 (the pilot);
- measure AI-human parity;
- give tight per-stratum estimates: at n = 3-6, the 90% Wilson interval spans about 0.08-0.75.

**Expansion context, from `expansion-sizing.csv` (p50):**
- beachhead pool: ₹107 Cr a year at the card (₹58 Cr excluding the big platforms);
- all insurance renewal calling, including LIC: ₹211 Cr;
- BFSI 1600 service calls: an extra ₹166 Cr;
- non-BFSI post-sales: about ₹1,980 Cr after a haircut, the weakest evidence.

---

## 8. Not done or blocked

- **No web search was used.** The work drew on the registers, the l3 Apna crawl, live register fetches and direct site fetches.
- **Websites.** None was found for the random-draw rows, or for several signal rows (Mihit, Golden Arm, RB, Raising Group, Planway, NLVD). Their contact route is LinkedIn or warm intros, often through insurer channel managers. The register's principal-officer contacts must not be used.
- **No l1 round-2 `findings.md` exists on disk.** I used its `verify.md` and `usecase-map-insurance.csv` instead.
- **Model re-runs are still to do:**
  - scale COGS at ₹2.84/3.70;
  - the observed life commission triangle;
  - the capped-commission scenario;
  - the interview-measured inputs.
- **IMF register validity semantics** are unverified.
- **`findings.md` was refused by the harness.** This text is returned instead.

## 9. Files

All under `/home/user/sales-enabler/research/2026-10-17/founder-kit/`:
- **Kit documents:** `interview-guide.md`, `scoring.md`, `plan.md`, `kc-answer-sheet.md` (new), `note-template.md`, `outreach.md`.
- **Targets:** `targets.csv` and `build_targets.py`.
- **Strata and sampling:** `strata.csv` and `register-sample-frame.csv`. Both sit outside `data/` because the repo's `.gitignore` excludes `data/`.
- **Code:** `code/strata.py` and `code/caps_sensitivity.py`.
- **Round-1 originals:** `*.round1.*` copies of interview-guide, scoring, plan, note-template, outreach, targets and build_targets.

## 10. Sources

**Primary (IRDAI, DoT):**
- **IRDAI registers**, fetched live 2026-10-17 20:08 UTC: https://irdai.gov.in/list-of-imfs , https://irdai.gov.in/list-of-corporate-agents , https://irdai.gov.in/list-of-brokers (read-primary, company-level fields only).
- **IRDAI circular IRDAI/PP&GR/CIR/MISC/02/01/2026** and **IMF Regs reg 3(d)**, via `lanes/l1-regulation/round2/verify.md` (read-primary by the verifier).
- **IRDAI distribution consultation**, Part 1 Box 4A/4B: https://irdai.gov.in/web/guest/document-detail?documentId=9852848 (excerpts in `lanes/l4b-measured/round2/`), plus the Khaitan & Co note of 2026-09-29.
- **IRDAI Handbook 2024-25**, T98/T99/T103/T104, via `lanes/l2-economics/round2/` (read-primary by the verifier).
- **IRDAI Annual Report 2024-25**, and the **DoT CNAP circular** of 13-10-2026 (https://www.dot.gov.in/static/uploads/2026/10/d86da4092d50f052becd6113de83d37e.pdf), via `lanes/r2-untouched-raw/trust-fraud-evidence.csv`.

**Secondary and vendor:**
- Free Press Journal, 2026-07-19.
- PTI via The Week, 2025-11-22.
- TechCrunch, 2026-07-08 (Truecaller).
- `lanes/l4b-measured/round2/competition-intermediary.csv` (vendor claims).

**Models:** `lanes/l2-economics/round2/` — `renewal_model.py`, `renewal-model.json`, `renewal-results.csv`, `renewal-pricing-grid.csv`, `renewal-mde.csv`, `renewal-buyers.csv`, `trai-reconciliation.csv`, `expansion-sizing.csv` and `verify.md`.

**Other fetches:**
- https://www.saggioinsurance.com/ (HTTP 200).
- Wrong-entity checks: dgvdigital.com, dgv.in, planway.in, riskcovery.com, nlvd.in.
- The l3 Apna crawl, for INS-21, 22, 23 and 27.
