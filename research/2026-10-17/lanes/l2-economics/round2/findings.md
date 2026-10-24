<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

# Round 2, package r2-economics-renewal: per-renewal economics, buyer-level pain, expansion sizing

Date: 2026-10-17 (Saturday). Critic items: **A3, A4, A14, A15** and the **H2b buyer-baseline gap**. Azure spend: **INR 0**
(no paid calls). Nothing committed. Files are in `lanes/l2-economics/round2/`. The harness refused a Write of `findings.md`,
so this text is the write-up of record.

**How to read the numbers.**
- Each number carries a tag: `[prim]` primary, `[comp]` computed by me from the IRDAI Handbook 2024-25, `[sec]` secondary,
  `[vend]` vendor claim, `[asm]` assumption, `[model]` output of `renewal_model.py`.
- Model outputs are Monte Carlo medians with the p10-p90 range in brackets (n = 20,000, seed 20261017).
- **AI-versus-human outcome parity is an assumption** (0.5-1.05, mode 0.8). No renewal call by any AI has been measured.
  Every buyer-side conclusion below inherits that.

---

## 0. What changes before Monday's interviews

1. **The buyer-side value is real but small, and it differs by line.** One incremental save is worth this year's
   commission to the intermediary [model]:

   | line | value per save | 3-year commission value |
   |---|---|---|
   | 2W motor | ₹265 [162-413] | ₹458 |
   | 4W motor | ₹2,415 [1,440-3,881] | ₹4,623 |
   | health | ₹2,737 [1,865-3,848] | ₹6,473 |
   | life, years 2+ | ₹1,941 [1,170-3,125] | ₹4,748 |

   The round-1 value gate (₹1,000-30,000) counted the insurer's premium as the intermediary's value, and it should not.
   The ₹150-per-save floor in kill criterion 2 is passed trivially by everything except 2W. It tests the wrong thing.
2. **Per-renewal pricing works for 4W motor, health and life. It does not work for 2W at launch. Per-minute pricing at
   ₹6-8 does not work at all at launch COGS.**

   | scheme | launch gross margin (p50) |
   |---|---|
   | per minute at ₹6-8 (any line) | −47% to +1% (2-38% at 1M min/month) |
   | per renewal collected, at the price card below | 4W 67%, health 45%, life 33%, 2W 13% |

   Those per-renewal fees yield ₹10-23 per AI-connected minute, well above the ₹6-8 in SYNTHESIS.
3. **The concept-test price to put in front of the buyer:**
   - per renewal collected on the list we call: **₹50 per car (4W) renewal, ₹15 per health renewal, ₹15 per life
     renewal-premium collected, ₹20 per two-wheeler renewal** (the 2W fee is flagged as loss-making at launch);
   - a **₹15,000 monthly minimum, credited against usage**, offered only to firms with about 1,500 or more due renewals a
     month;
   - **a 10% holdout reported quarterly as proof, not used for billing.** Section 2.4 has the Gabor-Granger ladders.
4. **Ask for due renewals per month, not telecaller headcount.**
   - Kill criterion 1 ("≥3 renewal telecallers") is a weak proxy. Under the seat-capacity costing, a 3-seat desk works
     about 6,800 due renewals a month in 4W, health or life [model].
   - SYNTHESIS's ₹1.1-1.5 lakh a month per buyer needs about 7,000-9,000 due renewals a month at the price card.
   - A typical IMF is far below that. The 940 IMFs sourced **59,809 individual health policies and 33,915 life policies in
     all of FY25**, about **64 health and 36 life policies per IMF per year** [comp, Handbook T104/T99]. A small agency with
     150 due a month yields about ₹2,100 a month of revenue to VP.
   - Weight the interview sample by renewal volume, not by firm count. That cuts against critic item A12's proposal to add
     6-8 IMFs: keep 3-4 IMFs as a test stratum and expect kill criterion 1 to fire there.
5. **The deciding unknown for H2b is how many due renewals one of the buyer's telecallers works per month.** It decides
   whether AI is cheaper than the buyer's own desk:
   - **talk-minute costing (l2v ₹6-9/min):** a desk costs ₹2.0-6.0k per 1,000 due renewals, below VP's launch cost of
     ₹7.0-11.0k. AI is costlier in every line (P(AI cheaper) ≤ 0.03).
   - **seat-capacity costing (₹28k a seat, 1,500 due renewals per seat per month, both assumed):** a desk costs ₹5.4-12.8k.
     AI is cheaper in health (P 0.94), life (0.87) and 4W (0.66), but not 2W (0.15).

   The talk-minute method implies one telecaller works 6,000-20,000 due renewals a month, which is implausible. So the
   truth is probably closer to the seat method, but nobody has measured it.
6. **Pain signals at the buyer (desk sources):**
   - **Health:** the best-run intermediary in India loses 11-15% of policies at first renewal by number of policies.
     Policybazaar's first-renewal retention was 71% in FY23 and 85-87% in FY26-JFM'26 [prim]. Star Health's 94-98% is by
     premium, a different and flattering basis.
   - **Motor:** leakage is large but measured only as a stock. 16.54 of 30.48 crore vehicles were uninsured (MoRTH data in
     a 2023 Lok Sabha reply) [sec]. **No insurer discloses a motor renewal ratio.** The "retention ratio" in IRDAI and
     Statista series is reinsurance retention, not renewal.
7. **Expansion is not venture-scale inside insurance.** All insurance renewal calling, including LIC, at today's per-minute
   prices is about **₹211 Cr a year [154-288]**. The beachhead's per-renewal pool is ₹107 Cr [89-127], or ₹58 Cr [46-73] if
   the largest broker and PoSP platforms keep renewals in-house.
   - BFSI 1600 service calls add about ₹166 Cr [94-283].
   - Scale depends on the non-BFSI post-sales stage, ₹1,980 Cr [751-6,163] after a haircut. That is the weakest-evidenced
     stage, and per-minute price competition there is strongest.

---

## 1. A3: pain and value at the actual buyer

### 1.1 Where the in-reach renewal volume actually sits (IRDAI Handbook 2024-25, FY25) [comp]

| line | brokers | non-bank corporate agents | IMFs | PoSP / web aggregators | individual agents | other |
|---|---|---|---|---|---|---|
| Motor, gross direct premium (OD ₹40,135 Cr + TP ₹58,958 Cr) | **49.5%** (₹49,052 Cr) | 5.9% | not separately reported | not separately reported | 29.1% | "Others" 10.6%, direct 3.3%, banks 1.6% |
| Individual health, policies (2.52 crore; premium ₹46,611 Cr) | 13.1% (32.9 lakh) | 1.7% | **0.24% (59,809)** | 0.7% / 0.1% | **65.9%** (72% of premium) | direct 10.0%, banks 8.1% |
| Life individual new business, policies (2.70 crore) | 3.9% (10.4 lakh) | 2.8% | **0.13% (33,915)** | 0.01% / 0.02% | 72.6% | banks 15.6%, direct incl. online 4.0% |

Source tables: T103 (motor), T104 (health), T99 (life). Extracts are in `data/irdai-handbook-2024-25-extracts.csv`.

- **Motor at brokers is the in-reach volume.** Most of it sits at a few large online and PoSP brokers. Policybazaar alone
  reports an 8.6% NOP share of private cars (14% including PoSP) and 11.8% of two-wheelers in FY26 [prim, PB Analyst Day
  2026-05-11].
- **IMFs are numerous (940) but tiny** in every line that IRDAI reports.
- Health is overwhelmingly an individual-agent book. Those renewals go through the insurer and the agent, not through our
  buyer.

### 1.2 Leakage signals by line

**Motor**
- **Uninsured stock.** 30.48 crore vehicles, of which 16.54 crore are uninsured.
  - The source is MoRTH data excluding MP, AP and Lakshadweep, quoted in a Lok Sabha reply reported 2023-03-20 [sec].
  - The Supreme Court (2026-08-04) cited the same numbers as "nearly 56%" [sec, LiveLaw]. The arithmetic gives **54.3%**.
    Both are kept.
  - It is a stock of mostly lapsed two-wheelers, not a renewal rate, and it is about 3 years old.
- **Structural headwind.** The same judgment raised third-party tenure for new vehicles to 4 years (cars) and 6 years
  (two-wheelers). That defers TP renewal events for new vehicles, although OD renewals stay annual.
- **Tailwind.** ANPR cameras linked to IIB and VAHAN, plus e-challans for uninsured vehicles [sec]. Enforcement raises 2W
  renewal demand.
- **Distributor interest.** ICICI Lombard's blog attributes low 2W renewal to "limited distributor interest" because of the
  small ticket [vend, snippet; host 403]. That matches the model: 2W commission per save is about ₹265.
- **Motor renewal ratio by insurer: not found in any accessible primary source.**
  - NL-6 and NL-forms do not carry it.
  - ICICI Lombard's and other insurers' disclosure pages returned 403 or 404.
  - The "motor retention ratio 86-88%" found by search is **reinsurance retention**. It is logged in `sources.csv` (E18) so
    nobody uses it as a renewal rate.

**Health**
- **Policybazaar (a listed broker, so an intermediary-level primary source)** reports persistency by number of policies
  [prim, PB Analyst Day 2026-05-11; Annual Report FY26]:

  | measure | FY23 | FY26 | JFM'26 |
  |---|---|---|---|
  | overall | 79% | 87% | 88.9% |
  | first renewal | 71% | 85% | 86.6% |
  | second renewal | 84% | 90% | 90.9% |

  PB says it measures renewal "by number of policies" against "whatever base is due for renewal" [prim, Q1 FY27 call]. This
  is an intermediary with large servicing operations. A small firm without calling is unlikely to do better.
- **Star Health: 94-98% by GWP** [sec, round 1]. By premium, which includes sum-insured upgrades and multi-year policies, so
  it overstates retention by count.
- **Average individual health premium FY25:** ₹18,508 overall [comp, T104]; brokers ₹15,267; IMFs ₹22,541; PoS ₹13,144;
  agents ₹20,262.

**Life (years 2+)**
- 13th-month persistency: private-insurer median 77% (T28, round 1).
- Policybazaar: 88% at the 13th month, 73% at the 61st [prim, AR FY26].
- In-reach intermediaries hold only about 6.9% of new life policies [comp]. Life is a minor line for this buyer.

### 1.3 The commission regime and actual commission ratios

- **The rule** [prim, IRDAI (Expenses of Management, including Commission, of Insurers) Regulations 2024, notified
  2024-01-22]:
  - Total expenses of management are capped at **30% of gross premium written (general insurers)** and **35% (standalone
    health insurers)**.
  - Commission must fit inside that cap under a board-approved policy (reg. 6 and 12).
  - **There are no line-level commission caps.** The 2023 commission regulations removed them, and the 2024 regulations
    repealed those (l1 round 2 R31/R32 reads the same).
  - For life, the renewal-premium allowance is 17.5% (25% for pure-risk products). That caps all expenses, not the
    commission rate.
- **Actual FY25 net commission ÷ net earned premium** [comp, Handbook T50]. These are blended across new and renewal
  business and all lines, net of reinsurance commission.

  | group | insurers |
  |---|---|
  | motor-heavy private insurers (23-28%) | Go Digit 27.7%, Tata AIG 26.3%, Shriram 24.6%, Cholamandalam 24.1%, Liberty 23.5%, Royal Sundaram 23.2%, Magma 22.9% |
  | other large private | ICICI Lombard 19.4%; private total 17.1% |
  | standalone health insurers (total 17.2%) | Star 15.1%, Care 21.4%, Niva Bupa 21.8%, ManipalCigna 19.9%, Aditya Birla 10.6% |

- **Life renewal commission by year is not in the Handbook**: T13 gives totals only, and L-5 disclosures were blocked.
  - The pre-2023 caps (7.5% in years 2-3, 5% from year 4) are a remembered anchor, not re-read this session.
  - The model uses 3-7.5%.
- **Who earns the commission when a customer renews directly with the insurer** is still a legal and contractual question
  (A2(e)). The model defines the baseline renewal rate as "renews *with commission credited to this intermediary*". The
  interview must ask it per line.

### 1.4 The corrected value gate: what one incremental save is worth to the intermediary [model]

| line | premium (mode) | commission share (range) | value per save, p50 [p10-p90] | 3-year value | P(≥ ₹150) |
|---|---|---|---|---|---|
| 2W motor | ₹1,500 (TP ₹714 for 75-150 cc [sec]) | 8-25% | **₹265 [162-413]** | ₹458 | 0.93 |
| 4W motor | ₹11,000 (TP ₹2,094-7,897 [sec]) | 10-28% | **₹2,415 [1,440-3,881]** | ₹4,623 | 1.00 |
| health | ₹17,000 (T104 avg ₹18,508) | 10-20% | **₹2,737 [1,865-3,848]** | ₹6,473 | 1.00 |
| life, years 2+ | ₹30,000 | 3-7.5% | **₹1,941 [1,170-3,125]** | ₹4,748 | 1.00 |

**How a renewal's value splits between the intermediary and the insurer.** The insurer's "retained premium" is not its
value:
- FY25 incurred claims ratios were 85.5% for motor (private 74.6%, public 107.9%) and 85.3% for health (standalone health
  insurers 68.1%, public 99.8%) [comp, T44].
- Commission takes another 15-28%, plus operating expenses.

So on a typical retail renewal the intermediary's 15-25% commission is of the same order as, or larger than, the insurer's
underwriting margin. The intermediary's economic interest in the renewal is real, and it is bounded by the commission.

---

## 2. A4: per-renewal unit economics (`renewal_model.py`, `renewal-model.xlsx`)

### 2.1 The chain, and the inputs that carry it

The chain, per due policy: some customers renew before any call. The rest are called, with retries (AI up to 3-6 attempts,
mode 4; the desk 1-3). Some calls are answered, and some of those reach the right party. That produces minutes and
incremental renewals, then the buyer's commission gained, then the fee, then VP's cost and gross margin, the buyer's net
gain, the holdout cost and how measurable the lift is.

| input | range (mode) | basis |
|---|---|---|
| answered per attempt | 0.30-0.55 (0.42) | Callyzer 46-48% connect rate [vend] |
| right party, given answered | 0.75-0.95 (0.88) | [asm] |
| reachable at all | 0.75-0.95 (0.88) | [asm] |
| pickup multiplier for AI on 1600xx vs status-quo caller ID | 0.70-1.05 (0.90) | [asm; unmeasured, critic §6.4] |
| would-lapse customer saved, given reached by a human | 0.08-0.40 by line | [asm]; anchor: two-way bank call LATE +34.4 pp on timely repayment (Laudenbach et al., JF 2025) [prim via l4cv] |
| AI persuasion ÷ human persuasion | 0.50-1.05 (0.80) | [asm]; AI collectors −9 to −12 pp NPV, NBER w33669 [l5v] |
| baseline renewal with no calling | 2W 0.30-0.60; 4W 0.45-0.75; health 0.75-0.92; life 0.70-0.90 | §1.2 anchors + [asm] |
| minutes per right-party conversation | 1.0-4.0 by line; plus 1-4 follow-up minutes per saved customer | Callyzer 1.6-min average [vend] + [asm] |
| managed COGS per connected minute | lognormal fitted to p10/p90: **₹5.00/6.96 at 100k min/month** (p50 5.88) and **₹2.67/3.51 at 1M** (p50 3.06) | l2v / l2, verifier-corrected |
| 1600 carriage adder | ₹0-0.40/min | [asm]; no CPaaS publishes a 1600 price (l1 round 2) |
| WhatsApp utility messages | 1-3 per due policy at ₹0.115 | [prim] |
| unanswered attempt (ring time) | ₹0-0.15 | [asm] |
| escalation to a human | 5-25% of right-party calls × 2-6 min at ₹5.5-9/min | l2v |
| buyer desk, talk-minute method | ₹6.0-11.0 per talk-minute | l2 8.86, l2v 6.3, plus quoting work [asm] |
| buyer desk, seat method | ₹20-40k per seat per month ÷ 800-3,000 due renewals per seat | l3 loaded cost; **due/seat is [asm] and must be asked** |
| holdout | 10% | design choice |
| seasonality, trough month ÷ mean | motor 0.7-0.9; health 0.85-0.97; life 0.55-0.85 | [asm] |

The spreadsheet's `Calc` sheet evaluates the same chain with live formulas at the mode values. After a LibreOffice
recalculation it matches Python to 5e-15. The `MC_results`, `Pricing_grid`, `Buyers`, `MDE`, `Sensitivity`, `Expansion`,
`TRAI_check`, `Incumbents` and `IRDAI_extracts` sheets are labelled values.

### 2.2 Results per 1,000 due renewals [model; p50 with p10-p90]

| | 2W motor | 4W motor | health | life yrs 2+ |
|---|---|---|---|---|
| incremental renewals, AI vs no calling | 71 [44-107] | 51 [31-79] | 17 [10-28] | 21 [12-35] |
| incremental renewals, human desk vs no calling | 20 [10-37] | 34 [18-58] | 11 [6-20] | 14 [7-25] |
| AI-connected minutes | 1,077 | 1,391 | 794 | 995 |
| AI minutes per renewal collected | 2.1 | 2.1 | 0.9 | 1.2 |
| VP cost, launch COGS | ₹9,092 | ₹10,967 | ₹7,005 | ₹8,271 |
| VP cost, 1M min/month COGS | ₹6,012 | ₹6,987 | ₹4,723 | ₹5,404 |
| buyer desk cost, talk method | ₹1,987 | ₹6,017 | ₹3,422 | ₹4,278 |
| buyer desk cost, seat method | ₹5,432 | ₹12,813 | ₹12,809 | ₹12,839 |
| VP cost per incremental save, launch | ₹128 | ₹213 | ₹402 | ₹388 |
| **buyer's max fee per renewal collected vs no calling** | ₹35.5 [18-66] | ₹186 [90-364] | ₹54.9 [28-102] | ₹49.2 [23-100] |
| same, 3-year commission value | ₹62 | ₹357 | ₹130 | ₹121 |
| **buyer's max fee vs own desk, talk / seat method** | ₹28.6 / ₹36.2 | ₹63.4 / ₹74.8 | ₹20.1 / ₹31.9 | ₹19.4 / ₹30.9 |
| **VP minimum fee per renewal, 40% GM at launch** | ₹29.1 [21-40] | ₹27.9 [20-39] | ₹13.7 [10-18] | ₹16.7 [12-23] |
| VP minimum fee per renewal, 50% GM at 1M min/month | ₹23.0 | ₹21.5 | ₹11.1 | ₹13.2 |
| VP minimum fee per incremental save, 40% GM at launch | ₹212 | ₹356 | ₹671 | ₹647 |
| P(pricing window exists vs no calling, launch, 40% GM) | 0.66 | 1.00 | 1.00 | 0.97 |
| P(pricing window exists vs own desk, talk method, launch) | 0.48 | 0.79 | 0.68 | 0.58 |

### 2.3 Where per-renewal pricing works and where it does not

- **4W motor: works comfortably.** The buyer's ceiling against no calling is about ₹186 per renewal; VP's floor is about
  ₹28. At ₹50:
  - VP launch gross margin is 67% (P(≥40%) = 0.99);
  - the buyer gains with P 0.99 against no calling and P 0.60/0.69 against its own desk;
  - the fee takes about 27% of the buyer's extra commission.
- **Health: works only at a low fee, ₹15-20.** The baseline is high, so most renewals collected would have happened anyway,
  which is the critic's concern. The ceiling against no calling is about ₹55, but against a desk only ₹20-32.
  - At ₹15: VP launch GM 45% (P(≥40%) = 0.65), scale GM 63%; the buyer gains with P 0.99 against no calling and 0.64/0.89
    against its desk.
  - At ₹20: GM 59%, but P(buyer gains vs desk, talk method) falls to 0.50.
- **Life, years 2+: marginal at launch, fine at scale.** At ₹15: launch GM 33% (P(≥40%) = 0.33), scale GM 56%. At ₹20:
  launch GM 50%, but buyer gains vs desk only 0.48/0.79.
- **2W motor: per-renewal pricing does not work at launch.** The value per save is about ₹265.
  - VP's 40%-GM floor (₹29) is about equal to the buyer's ceiling against no calling (₹35). P(window) is 0.66, and 0.48
    against a desk.
  - At ₹20: launch GM 13% (P(≥40%) = 0.07); scale GM 42%.
  - 2W makes sense only as an add-on to a 4W/health book, WhatsApp-first with AI calls only to non-responders, or after
    reaching 1M min/month.
- **Per minute at ₹6-8 (SYNTHESIS's yield): launch GM is −47% to +1% in every line**; at 1M min/month it is 2-38%.
  Per-minute selling is confirmed dead at launch for this use case.
- **Per incremental save** prices that clear a 40% launch GM:

  | line | price per save | share of the buyer's extra commission |
  |---|---|---|
  | 4W | about ₹500 | 21% |
  | health | ₹750-1,000 | 27-37% |
  | life | ₹750-1,000 | 39-51% |
  | 2W | ₹300 or more | more than the save is worth |

  This is commercially plausible for 4W and health, **but it cannot be billed monthly** (section 2.6).

### 2.4 The price card for the concept test (interview guide §13)

The rule for choosing it: the highest fee on the grid where P(buyer gains vs no calling) ≥ 0.8 and P(buyer gains vs its
own desk, talk method) ≥ 0.6. 2W was judged against no calling only.

| line | anchor fee per renewal collected | Gabor-Granger ladder | VP launch GM at anchor | yield per AI minute | buyer keeps of extra commission |
|---|---|---|---|---|---|
| car (4W) | **₹50** | ₹25 / ₹50 / ₹100 | 67% | ₹23 | about 73% |
| health | **₹15** | ₹10 / ₹15 / ₹30 | 45% | ₹16 | about 73% |
| life renewal premium | **₹15** | ₹10 / ₹20 / ₹40 | 33% | ₹12 | about 70% |
| two-wheeler | **₹20** (flag: below cost at launch) | ₹10 / ₹20 / ₹30 | 13% | ₹10 | about 44% |
| monthly minimum | **₹15,000, credited against usage** | ₹10k / ₹15k / ₹25k | | | |

**The sentence to say:** "₹50 for each car renewal, ₹15 for each health or life renewal and ₹20 for each bike renewal that
comes in from the list we call; minimum ₹15,000 a month, adjusted against those fees; we keep 10% of your list uncalled so
you can see the lift every quarter."

**An alternative to show for comparison only:** "₹500 per extra car renewal / ₹1,000 per extra health renewal, against a
10% uncalled control group." Expect it to be preferred in principle and unworkable in practice; record which one the buyer
picks and why.

**What this means for SYNTHESIS:**
- For a mixed book of 40% 2W, 30% 4W, 25% health and 5% life, the card yields about ₹16.1k per 1,000 due renewals a month.
- SYNTHESIS's ₹1.1-1.5 lakh a month therefore needs about **7,000-9,000 due renewals a month**.
- A mid-size broker or non-bank corporate agent with 1,500 due a month pays about **₹24k a month** (trough month about
  ₹19.7k). The buyer's commission gain is ₹81k [p10 ₹50k], and VP's GM is 49% at launch and 66% at scale [model,
  `renewal-buyers.csv`].
- SYNTHESIS's ₹25-50k pilot fee needs about 1,600-3,100 due renewals a month, and at least about 2,000 to hold a ₹25k
  minimum through the trough month.

### 2.5 Buyer size, the minimum fee, seasonality, and kill criterion 1

| archetype [asm sizes] | due per month | VP revenue per month (trough) | buyer commission gain per month | desk seats (talk / seat method) |
|---|---|---|---|---|
| small IMF or agency | 150 | ₹2,103 (₹1,704) | ₹6,714 | 0.01 / 0.05 |
| mid retail broker or non-bank corporate agent | 1,500 | ₹24,068 (₹19,653) | ₹81,195 | 0.15 / 0.51 |
| large PoSP platform | 25,000 | ₹3.96 lakh (₹3.20 lakh) | ₹12.8 lakh | 2.4 / 7.9 |

- **The minimum must sit at or below trough-month usage revenue** for the target buyer size. Otherwise it is a fixed fee in
  disguise, and seasonality turns it into a dispute.
  - ₹15k fits a buyer with 1,500 due a month.
  - ₹25k does not; it needs about 2,000 or more.
  - Life due lists concentrate in January-March (trough ÷ mean 0.55-0.85 [asm]), so a life-heavy book needs either a lower
    minimum or a quarterly true-up.
- **The bridge to kill criterion 1** (3 renewal telecallers) [model]:

  | costing | due renewals a month for a 3-seat desk |
  |---|---|
  | seat method | about 6,800 (4W, health, life); about 16,000 (2W, because desks work only 10-60% of 2W lists) |
  | talk-minute method | 19,000-59,000 |

  The talk-minute figure is implausible, which is itself evidence that talk-minute costing understates desk cost.
- **Proposed rewording of kill criterion 1:** fewer than 5 of 15 qualified intermediaries have 1,500 or more due renewals a
  month on lines VP serves (4W, health, life), or fewer than 2 have 7,000 or more.

### 2.6 The holdout: what it costs and whether it can be measured

- **Cost to the buyer.** A 10% holdout gives up about 1/9 of the AI gain. Per 1,000 due renewals: 2W ₹1.8k, 4W ₹12.1k,
  health ₹4.7k, life ₹4.0k a month [model].
- **Measurability.** Minimum detectable lift (80% power, two-sided 5%) against the median modelled lift
  [`renewal-mde.csv`], at a 10% holdout:

| line | median lift | months needed at 1,500 due/month | at 5,000 | at 25,000 |
|---|---|---|---|---|
| 2W | 7.1 pp | 2.9 | 0.9 | 0.2 |
| 4W | 5.1 pp | 5.4 | 1.6 | 0.3 |
| health | 1.7 pp | **25.8** | 7.8 | 1.6 |
| life | 2.1 pp | **20.7** | 6.2 | 1.2 |

  **Billing per incremental save is unmeasurable month to month** for health and life below about 25,000 due a month, and
  for 4W below about 5,000. That settles the pricing unit:
  - bill per renewal collected, which can be checked against the payment record;
  - report the holdout lift quarterly as proof of value;
  - for health and life at mid-size buyers, use a staggered-start (stepped-wedge) design or pool quarters. Do not promise a
    monthly lift number.

### 2.7 What drives the answer (Spearman rank correlation, `renewal-sensitivity.csv`), and the matching interview questions

- **The buyer's net gain against its own desk** is driven, in every line, by:

  | driver | correlation |
  |---|---|
  | AI/human persuasion parity | +0.47-0.48 |
  | the desk's attempts per customer | −0.44 to −0.48 |
  | the desk's coverage of the due list | −0.26 to −0.29 |
  | AI attempts | +0.27-0.28 |

  Questions: "How many times do you try each due customer? What share of the list does your team actually call?"
- **VP's launch gross margin** is driven by:

  | driver | correlation |
  |---|---|
  | minutes per right-party conversation | −0.46 to −0.51 |
  | baseline renewal rate | +0.29 to +0.57 |
  | COGS | −0.34 to −0.36 |
  | escalation share | −0.22 to −0.32 |

  Questions: "How long is a renewal call? What share needs a senior person? What is your renewal ratio by line, by number of
  policies, with and without calling?"
- **Kill criterion 3 restated in model terms** (mode case, `renewal-model.json`): per-renewal pricing against no calling
  fails when the baseline renewal rate exceeds **63% (2W), 96% (4W), 97% (health) or 93% (life)**. "≥90% without calling"
  therefore does not kill health or 4W on its own. For health the binding comparison is the buyer's own desk, not leakage.

---

## 3. A14: the expansion path, sized (`expansion_sizing.py`, `expansion-sizing.csv`)

Serviceable market at today's prices, **as of 2026-10**, INR crore per year [model; p50 with p10-p90]:

| stage | p50 [p10-p90] | method | earliest dated trigger |
|---|---|---|---|
| S0 beachhead: in-reach intermediaries' renewal books, at the price card | **107 [89-127]** | renewal events (Handbook universe × in-reach channel shares) × renewal rate × fee | now |
| S0 excluding the largest broker and PoSP platforms (in-house renewal operations) | **58 [46-73]** | × (1 − 30-60% top-platform share) [asm anchored on PB shares] | now |
| S1 insurers' own renewal desks, excluding LIC | **51 [36-72]** | non-intermediary renewal events × 30-70% put on outbound × insurer fees at 0.4-1.0× the card | after 3 paying intermediaries; insurer procurement 3-9 months (l4c), so about 2027-H2 |
| S2 other BFSI 1600 service calls, mid-market, excluding insurance | **166 [94-283]** | TRAI 1600 calls 1.15 bn/qtr [prim] × 20-50% conversational × 35-65% connected × 1.0-2.5 min × ₹3-8/min × 15-50% mid-market | RBI recovery-conduct rules 2027-01-01 (l1) |
| S3 rest of post-sales outside BFSI (D2C, clinics, diagnostics, auto service, ISP, utilities, school fees) | **1,980 [751-6,163]** | l3 bottom-up SAM × 0.25-1.0 haircut (l3v: "probably high"; event checks 3-17× lower) | 1601 migration ~2026-11; DPDP 2027-05-13 |
| **cumulative S0-S3** | **2,316 [1,089-6,484]** | | 2027-2029 |
| context: S0+S1 at per-minute list prices | 99 [72-136] | events × 0.8-1.4 AI min per due × ₹3-8 | |
| context: all insurance renewal calling including LIC, per minute | **211 [154-288]** | LIC adds 26.89 crore policies in force [comp, T10] | |

**Reading.**
- Insurance renewals, including insurers' desks, are a ₹100-300 Cr a year market at most. That confirms the investor
  objection "₹83 Cr is a feature".
- BFSI service calls on 1600 roughly double it.
- A venture-scale path (₹1,000 Cr or more) exists only if the product generalises to non-BFSI post-sales. There per-minute
  prices are ₹2.4-4.5 and D2C sits below VP's managed COGS (round 1).
- So the expansion thesis rests on two things: winning in BFSI renewals on compliance and competence, then carrying that
  to post-sales at scale COGS (₹3.06/min at 1M min/month, about ₹2.1-2.3 with commitment tiers).
- Dating: S1 and S2 are reachable from about 2027-H2. S3 at a margin needs the about 1M-min/month aggregate, which on
  current SYNTHESIS assumptions needs about 50 median buyers. On this package's buyer sizes it needs more.

---

## 4. A15: reconciling against incumbent revenue, and fixing the TRAI comparison

### 4.1 Incumbent revenue (`incumbent-reconciliation.csv`)

- **Inputs.** MCA-derived revenue (read-secondary: Inc42, Entrackr, MediaNama, via l4a and l4c) for:
  - Exotel ₹490.5 Cr FY25;
  - Gnani ₹54-57 Cr FY25;
  - Sarvam ₹29.1 Cr FY25;
  - SquadStack ₹26.5 Cr FY24;
  - Yellow.ai ₹234-236 Cr FY25;
  - Haptik ₹157-231 Cr (FY24 Inc42 / FY25 unverified);
  - Ozonetel ₹110 Cr FY24;
  - Knowlarity ₹88 Cr FY25;
  - Uniphore India ₹194 Cr FY24;
  - LeadSquared ₹326 Cr FY25;
  - Bolna about ₹6 Cr run-rate;
  - Ringg ₹0.9 Cr;
  - smallest.ai India ₹0.9 Cr;
  - Convin ₹9.1 Cr.
- **Method.** Each revenue is multiplied by an **assumed** share that is Indian voice-agent revenue, for example Exotel 2-10%,
  Gnani 50-90% and SquadStack 10-50%.
- **Result.** Implied Indian voice-agent revenue of about **₹148 Cr [132-165]**. The narrow band reflects only the share
  assumptions; the true uncertainty is wider, with mixed fiscal years and revenue recognition.
- **Against the l3 total SAM** (₹9,618 Cr p50, all 19 segments), that is an **implied AI penetration of about 1.5%**.
  - That is plausible for an early market, so incumbent revenue does not contradict the bottom-up SAM.
  - It also cannot validate it within better than about a factor of 5, because penetration is unknown.
- **Insurance renewals specifically cannot be reconciled.** Neither Gnani nor SquadStack discloses an insurance or renewal
  split, and both sell mainly to insurers.

### 4.2 The TRAI comparison, corrected (`trai-reconciliation.csv`; l3v §7)

Round 1 compared an in-reach subset with the national total and called 1.35× a reconciliation. The right comparison is the
bottom-up in-reach minutes against national designated-series minutes × the in-reach share of those minutes (10-40% [asm]
for 1600):

| comparison | ratio p50 [p10-p90] | P(> 1) |
|---|---|---|
| as published: BFSI post-sales bottom-up ÷ all 1600 minutes | 1.36 [0.39-5.16] | 0.62 |
| **corrected: ÷ (1600 minutes × in-reach share)** | **5.6 [1.5-22]** | 0.96 |
| **corrected, insurance renewals only** (IRDAI entities had to be on 1600 by 2026-02-15; Q1 FY27 is after that) | **4.4 [0.6-31]** | 0.83 |
| as published: pre-sales ÷ all 140 minutes (originated) | 1.39 [0.56-3.86] | 0.67 |
| **corrected: ÷ (delivered 140 minutes, 11.68 bn/qtr, × in-reach share)** | **5.1 [2.0-15]** | 0.99 |

**Reading.** Either the l3 seat model overstates in-reach calling by about 4-6×, or most in-reach calling still runs on
ordinary 10-digit numbers outside the designated series. TRAI's 22.99 bn AI-flagged suspected-spam calls a quarter [prim]
supports the second reading, at least for pre-sales.

For insurance renewals three signals now point the same way:
- the l3 event check was 3.1× below the seat model;
- the corrected TRAI ratio is 4.4×;
- this package's Handbook-based renewal-event universe gives about ₹35-40 Cr at per-minute prices for the in-reach books
  [computed approximately: 37.5% of the ₹99 Cr S0+S1 per-minute pool by event share], against l3's ₹122 Cr.

**So the seat model is about 3-4× high in minutes.** The rupee pool survives only because per-renewal pricing earns ₹10-23
per minute: S0 is ₹107 Cr at the price card. The l3 seat-based in-reach SAM should be read as an upper bound.

---

## 5. The H2b buyer-baseline gap: what desk evidence can and cannot settle

- **Settled by the model.** It identifies the two comparators a buyer will use and computes both:
  - **"Against doing nothing (or WhatsApp only)":** the buyer compares the fee with commission gained. At the card it keeps
    about 73% of the extra commission in 4W and health, about 70% in life and about 44% in 2W [pricing grid].
  - **"Against my telecaller":** the buyer compares the fee with its desk cost per renewal, ₹4-10 per renewal collected
    under talk-minute costing and ₹12-20 under seat costing [model]. The card's ₹15-50 per renewal is above the
    talk-method desk cost. The AI earns its fee only through extra saves: more attempts, full coverage, out-of-hours reach,
    no attrition.
- **Not settled.** Which comparator buyers actually use, their real desk productivity, and their renewal ratio by line. H2b
  stays **untestable without interviews**. The critic's "zero buyer conversations" stands.

---

## 6. Proposed changes to SYNTHESIS (for the main loop to adopt or reject)

- **§0 price.** Replace "₹6-8 per AI-connected minute effective yield" with the per-renewal card in §2.4. It is equivalent
  to ₹10-23 per AI minute, and per-minute pricing gives a negative launch margin.
- **Kill criterion 1.** Use due renewals a month: ≥1,500 on 4W/health/life at 5 of 15, or ≥7,000 at 2 of 15. Do not use
  telecaller headcount.
- **Kill criterion 2.** Replace "₹150 per save" with the accepted per-renewal price falling below VP's launch floor: **₹30
  car / ₹15 health / ₹17 life**. 2W is excluded from the wedge unless the price is ₹30 or more or the book is WhatsApp-first.
- **Kill criterion 3.** Keep it as a pain probe. Add the model thresholds: the per-renewal case against no calling fails
  above 96% (4W), 97% (health) and 93% (life) baseline renewal, and for health the binding comparison is the buyer's desk.
- **New kill criterion.** If the median qualified buyer's telecaller works 3,000 or more due renewals a month, AI is not
  cheaper than the desk at launch COGS; the case then rests entirely on extra saves.
- **§1.1 item 4 and §9 risk 1.** The pool is about ₹107 Cr (₹58 Cr excluding the big platforms) at per-renewal prices,
  against about ₹35-40 Cr at per-minute prices. All insurance renewal calling is about ₹211 Cr. The expansion path is sized
  in §3.
- **Founder kit.**
  - Weight the sample by renewal volume: brokers and PoSP platforms carry the motor volume, and IMFs average about 64 health
    and 36 life policies a year.
  - Keep a small IMF test stratum.
  - Add the questions in §2.7. Also ask whether renewal commission is credited if the customer renews directly with the
    insurer, per line.

## 7. Contradictions kept on purpose

- Uninsured share: 56% (Supreme Court) against 54.3% (arithmetic on the same 16.54 / 30.48 crore). The stock data dates
  from 2023.
- Health retention: Star Health 94-98% (by GWP) against Policybazaar 85-87% at first renewal (by number of policies). The
  bases differ.
- Desk cost: talk-minute costing (₹2-6k per 1,000 due) against seat costing (₹5-13k). The truth is unmeasured, and the
  talk method implies an implausible desk throughput.
- Insurance pool: l3 seat model ₹122 Cr in minutes; event and Handbook checks about ₹35-40 Cr in minutes; this package's
  ₹107 Cr at per-renewal prices.
- "Motor retention ratio 86-88%" exists in secondary sources but is reinsurance retention, so it is not used.
- Round-1 l2 COGS at 1M min/month uses 6.1-sol. l2v says that with the faster 6-sol model the base is ₹2.50, which would
  raise the scale-stage COGS slightly; this package keeps the l2 distribution as given.

## 8. Limits and blocked sources

- **No buyer data.** Every behavioural input is an assumption: renewal ratios at the buyer, persuasion, parity, desk
  productivity, minutes per call and due-list size.
- **Line-level commission by channel (NL-6) and life renewal commission (L-5) were not obtained:**
  - icicilombard.com and iciciprulife.com returned 403;
  - Star Health, Niva Bupa, Go Digit and HDFC Life disclosure and investor pages returned 404, or 502 at CONNECT;
  - morth.nic.in and iib.gov.in failed to connect;
  - pbfintech.in needs a browser user-agent.
- **Secondary sources:** the TP tariff (2022) and uninsured-vehicle figures are press reports; the MoRTH gazette and the
  Lok Sabha primary were not reached.
- **1600 carriage cost** is an assumption (₹0-0.40/min); no CPaaS publishes it.
- Web search was used six times; primary pages were fetched directly where possible.
- The l3 sizing module was imported read-only. A stray `__pycache__` it created in the l3 folder was removed, and bytecode
  writing is now disabled.

## 9. Files (all in `/home/user/sales-enabler/research/2026-10-17/lanes/l2-economics/round2/`)

- `renewal_model.py`: the Monte Carlo model. It writes:
  - `renewal-results.csv`, `renewal-pricing-grid.csv`, `renewal-buyers.csv`, `renewal-mde.csv`, `renewal-sensitivity.csv`,
    `renewal-model.json`;
  - `charts/value-per-save.png`, `charts/pricing-window.png`, `charts/cost-per-1000-due.png`.
- `build_xlsx.py` writes `renewal-model.xlsx`:
  - `Calc` has live formulas;
  - the other sheets are labelled values;
  - the build was recalculated in LibreOffice and checked against Python.
- `expansion_sizing.py` writes `expansion-sizing.csv`, `trai-reconciliation.csv`, `incumbent-reconciliation.csv` and
  `charts/expansion.png`. It imports l3's `sizing.py` read-only.
- `extract_irdai_handbook.py` writes `data/irdai-handbook-2024-25-extracts.csv`.
- `sources.csv` lists every source, with the blocked hosts.
