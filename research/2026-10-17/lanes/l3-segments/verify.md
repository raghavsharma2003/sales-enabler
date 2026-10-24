# Lane l3-segments: adversarial verification

Verifier pass on 2026-10-17. Brief: `research/2026-10-17/vp-research-brief.md`, H3 and section 6.

**Method.**
- I re-ran the lane's scripts (`score_segments.py`, `sizing.py`, `triangulate.py`) on a scratch copy. All five outputs reproduce byte for byte: `scorecard.csv`, `scorecard-sensitivity.csv`, `sizing.csv`, `sizing-crosschecks.csv` and `sizing-triangulated.csv`.
- I recomputed the job-post aggregates from `job-posts-classified.csv`.
- I re-opened the cited primary sources: the IRDAI Handbook 2024-25 zip (Tables 9, 27, 28 and 58 parsed with openpyxl), the TRAI PR 111/2026 PDF, the TRAI 1600 Directions of 19-11-2025 and 16-12-2025, the Scalysis Shopify listing, the Meta INR rate-card xlsx effective 2026-10-01, the CREDAI home page, the IRDAI broker list and the DPDP Act gazette.

**Limits.**
- The shared web-search budget for this run was used up before this pass. I could not run independent searches, so independent checks rely on primary pages fetched directly.
- rbi.org.in redirects or shows a CAPTCHA, so the RBI recovery and penalty facts rest on the lane's secondary source plus my prior knowledge.
- Business Standard (the RERA counts) returned 403.

## Verdict table

| # | Claim (short) | Verdict | Corrected statement |
|---|---|---|---|
| 1 | Insurance renewals #1 (3.85), P(top1) 0.92, #1 in S3/S4, robust to any single ±1 | **weakened** | The numbers reproduce exactly. But the claim leaves out that the segment is **#3 on the pre-declared S1 multiplicative form**, behind D2C and real estate. Its whole 0.40 lead over real estate comes from **post_sales_share** (weight 10; 5 vs 1). The brief's H3 list does not include that criterion, and it overlaps regulatory_safety. With its weight at 0, insurance renewals and real estate **tie at 3.72**. |
| 2 | Persistency by policy count, 31-03-2025: LIC 64.1% (13th) and 50.3% (61st); private median 77% and 50.6% (n=21); LIC 68.6 lakh lapses or forfeitures in FY25 | **confirmed** | Table 28 gives LIC 64.12 / 50.31 and a private median of 77.0 / 50.64 (n=21; Acko and Go Digit are shown as "100 ##", which is non-numeric). Table 27 gives LIC 6,862.55 thousand. Caveats: that is a 2.55% lapse ratio on LIC's in-force book, and **LIC is excluded from the in-reach pool**. |
| 3 | In-reach insurance-renewal pool ~INR 94 Cr/yr (range 18-1,118); methods 122 / 40 / 169; up to 4.3x apart | **weakened** | The arithmetic reproduces. But the job-post leg rescales renewals by the share of **all insurance** postings, and those are 52% pre-sales. Rescaling by the renewal or post-sales part gives 89-183 (119 at a pre/post split). The triangulated central becomes **~INR 76-96 Cr/yr (≈83)**. The event leg is not scoped to "in reach": it counts all private life policies and all retail health. "Small" holds, and more strongly. |
| 4 | Real estate #2 (3.45; P(top3) 0.67; #2 multiplicative); largest pool 830; firm 846 vs job-post 813 within 1.0x; largest B2C telecaller employer (14.0%, n=3,372) | **weakened** | The scorecard and pool numbers reproduce. The two leg values are 1.04x apart, but the legs are **not independent**: the job-post leg is the firm model times a seat-share ratio, with total seats held constant. The "largest employer" margin is 388 vs 375 lending-origination postings in the generic sample. It **reverses in the full sample (430 vs 457)** and is inside classifier error (82% out-of-sample segment accuracy, n=60). The 14.0% is 388/2,765 classified postings, not n=3,372. Counting lending as one industry (origination plus collections), lending is much larger (694 vs 388). |
| 5 | D2C fails a price-floor gate: Scalysis INR 2.375-3.3/min, WhatsApp utility INR 0.115, l2 COGS p50 5.9 / 3.1 / 2.1, value INR 10-75 per call, two independent checks 50-64 vs 215 Cr | **weakened** | The prices are confirmed. Scalysis plans are USD 79 / 199 / 499 at "starts at" ₹3.3 / 2.85 / 2.375; if the minutes are included in the subscription, that is about ₹2.2-2.6 effective. WhatsApp India utility is ₹0.115 (rate card effective 2026-10-01). l2 MC p50 is ₹5.88 / 3.06 / 2.09. Problems: the gate was **added after scoring** and is not among the four checks declared in `weights.json`. It is **applied asymmetrically**: other segments pass on outcome pricing although the market p50 (₹4.5) is also below the ₹5.9 COGS. At ~0.94 min per call, managed COGS is ~₹5.5 per call against ₹10-75 value. The "independent" checks are an event model built on assumed AOV and COD share, plus a job-post rescale of the same firm model based on **n=31** D2C postings. Scalysis is a single app listed 2026-08-21 with 1 review. |
| 6 | Lending pre-due / early-bucket is a contested #3 (3.35, tied); P(top3) 0.41; collections 10.2% of posts and 100% post-sales; ticket ~₹2.1 lakh/month; #13 multiplicative, #8 with regulatory doubled; RBI/TRAI constraints; 8+ vendors | **weakened** | On the frozen scorecard lending is **#4**: D2C is #3 at 3.40. Lending becomes #3 only after the post-hoc D2C gate, and it ties with fintech onboarding at 3.35. The 10.2% includes 69 postings from the recovery-executive slug; the generic-slug share is 9.5% (319/3,372). "100% post-sales" is **set by a classifier rule** (`seg == lending_collections`), not measured. ₹2.1 lakh/month is a modelled output (assumed 5-150 seats), not observed. 1600-only is confirmed from the TRAI primary. The recovery rules (08:00-19:00, recording, 2027-01-01) are confirmed only in a secondary source. S1 #13 and S4 #8 reproduce. |
| 7 | Bottom-up reconciles with TRAI within 1.35x: 1600 series 1.15 bn calls/qtr → ~2.6 bn connected min/yr vs 3.5 bn bottom-up; 140 series 13.16 bn/qtr → 15.4 vs 20.9 bn | **weakened** | The TRAI figures are confirmed (PR 111/2026, 04-08-2026, Q1 FY27). But this is a **subset compared with a total**. The bottom-up numbers cover in-reach firms only (giants excluded), yet they **exceed** the national totals. The 1600 series also carries large banks and **Government-to-citizen** calls. Of the 140-series calls, **1.48 bn were blocked**: using the 11.68 bn delivered raises the ratio to 1.52x. The same PR shows **22.99 bn AI-flagged suspected-spam calls per quarter**, which is where unregistered 10-digit telecalling sits. The result shows the bottom-up model is the same order of magnitude as the designated series and is probably high. It is not a reconciliation. |

## Reasoning by claim

### 1. Insurance renewals ranks #1

- **Reproduced.** The weighted score is 385/100 = 3.85. In the sensitivity output, P(top1)=0.92 and P(top3)=1.00 (seed 17), S3 is #1 and S4 is #1.
- **Single ±1 moves.** No single ±1 change to an insurance sub-score can move it below 3.70, which is above real estate's 3.45. The robustness file is right.
- **What the claim omits: S1.** S1, the H3 prediction's own multiplicative form, was pre-declared in `weights.json`. On S1, insurance renewals ranks #3 (20.0), behind D2C (30.0) and real estate (21.3).
- **Where the lead comes from.** Insurance scores 5 on post_sales_share and real estate scores 1, at weight 10. That is 40 points, exactly the 0.40 gap. Setting that weight to 0 gives insurance 3.722 and real estate 3.722. The brief's H3 lists pain, spend, volume, regulatory risk, integration, sales cycle, and payment/WTP; post_sales_share is not on that list. It also overlaps regulatory_safety, whose anchor 5 is "service/transactional calls to existing customers". The weights were frozen before data (`frozen_at_utc` 09:02:54Z), which is good discipline. But the #1 depends on this one added criterion.
- **Weakly evidenced sub-scores:**
  - current_spend = 3, while the lane's own human-spend p50 for the segment is ₹437 Cr. That is below the anchor's ₹500 Cr floor, so the 3 rests on the "5-25 seats" branch, which is an assumed lognormal(2, 80).
  - integration_ease = 4 rests on "renewal lists come as spreadsheets", which has no source.
  - sales_cycle_short = 4, although the segment includes mid-size insurers' renewal desks, which work under board-approved outsourcing policies.
- **The lane's own caveat holds.** It states that the robustness is to the weights and not to the evidence. That is accurate.

### 2. IRDAI persistency and lapses

- **Sources parsed.** I downloaded `Handbook on Indian Insurance Statistics 2024-25.zip` from irdai.gov.in and parsed Part I.
- **Table 28 (by number of policies, as on 31 March 2025):**
  - LIC: 13th month 64.12, 61st month 50.31.
  - 21 private insurers with numeric values: median 77.0 (13th) and 50.64 (61st).
- **Table 27:** LIC lapses and forfeitures in individual non-linked business, 2024-25, were 6,862.55 thousand, i.e. 68.6 lakh. The lapse ratio is 2.55%.
- **Table 9:** private new individual policies were 92.39 lakh. This is the input to the event model, and it is confirmed.
- **Context.** The money-loss evidence for "pain = 5" is life persistency at insurers, mostly at LIC. LIC is excluded from in-reach, and life-renewal commission accrues to the original agent. The in-reach intermediaries (791 of 874 brokers are direct brokers, which are largely commercial lines; corporate agents are mostly banks) mainly renew motor and health. For health, the lane's own value-gate note shows a 94-98% renewal ratio at Star Health.

### 3. Insurance-renewal pool size

- **Arithmetic.** The geometric mean of 122.1, 39.7 and 169.6 is 93.7. The range is min(18, 22, 25) = 18 to max(805, 69, 1,118) = 1,118. The spread is 169.6/39.7 = 4.27x. All correct.
- **The job-post leg mixes sales and renewals.**
  - The family "insurance" includes insurance sales.
  - Insurance postings are 51.9% pre-sales, 23.5% post-sales and 24.7% unclear (n=162).
  - The model gives renewals 44% of insurance seats.
  - Rescaling only the renewal part gives 89 (post-sales only), 119 (post vs pre split) or 183 (post plus unclear).
  - The triangulated central becomes 76 / 83 / 96.
- **The event leg's scope is broader than "in reach".** It counts all private life policies in premium-paying status, all retail health (which I checked: Table 58 shows 2.52 crore individual health policies in 2024-25, matching the lane's 1.5-3.5 crore assumption), and motor via intermediaries. It still yields the lowest number, which suggests the firm leg is high.
- **Confidence.** Lowering "low" confidence is not needed; it is already low.

### 4. Real estate ranks #2

- **Confirmed.** 3.45, P(top3) 0.668, S1 #2, triangulated central 830 (geometric mean of 846 and 813). CREDAI's home page says "13000+ Developers across 230 city chapters in 20 states". DPDP s.7(a) Illustration II is indeed a real-estate broker; the cited "DPDT_11082024.pdf" on trai.gov.in is the DPDP Act gazette.
- **Not re-opened.** The RERA 1,16,117 projects and 82,755 agents (Business Standard returned 403).
- **The legs are not independent.** `triangulate.py` defines the job-post leg as firm p50 divided by (model seat share / Apna share), with total seats held constant. A 1.04x agreement only says the model gives real estate about the same share of seats as Apna postings do. It is not an independent pool estimate.
- **"Largest B2C employer" is fragile.**
  - Recomputed from `job-posts-classified.csv`, generic slugs: real estate 388, lending origination 375, lending collections 319, from 2,765 industry-classified postings (607 more are unspecified; 3,372 in total).
  - All slugs: lending origination 457 > real estate 430.
  - Classifier v2 out-of-sample accuracy is 49/60 for segment and 43/60 for phase.
  - The crawl is a single-month snapshot: 99.7% of postings are dated 2026-10, which falls in the festive real-estate push.
- **The value evidence is vendor claims.** Real estate's value per outcome (₹2k-50k per visit) comes from vendor blogs (Sell.Do, Caller.Digital, CallSphere). The brief allows these only as a cross-check.

### 5. D2C fails the price-floor gate

- **Scalysis listing (fetched 2026-10-17).**
  - Growth: $79, "Starts at ₹3.3/min", 2,828 min/month.
  - Scale: $199, ₹2.85, 6,633 min.
  - Enterprise: $499, ₹2.375, 19,960 min.
  - Billed per second. Launched 2026-08-21. One review.
- **WhatsApp.** Meta's INR rate-card xlsx, "effective October 1, 2026", India row: marketing ₹0.8631, utility ₹0.115, authentication ₹0.115, authentication-international ₹2.4971.
- **l2 COGS.** `cost-model.json` gives MC p50s of A 5.88 at 100k min/month, B 3.06 at 1M and D 2.09 at 5M. l2's own verifier notes that D omits the NVIDIA AI Enterprise licence.
- **The gate was added after the frozen checks.** `value-gate.csv` was written at 09:45, the weights were frozen at 09:03, and the gate is not one of S1-S4. It removes the segment that ranks #1 on the H3 prediction's own form (S1) and #3 on the frozen scorecard.
- **The gate is asymmetric.**
  - Collections gets "PASS on value; FAIL risk on price competition".
  - Insurance renewals and real estate pass on "outcome pricing possible", although the market per-minute p50 (₹4.5) is below managed COGS for them too.
  - D2C gets an outright FAIL on the per-minute comparison.
  - At ~0.94 min per call, managed COGS is about ₹5.5 per call (₹2.9 optimised), against ₹10-75 value per call. That value range is itself an assumption (RTO ₹100-250 times a 10-30% save rate).
- **The "two independent checks" are not independent.**
  - The event model uses an assumed AOV of ₹700-1,500 ("no primary D2C AOV found") and an assumed COD share of 40-70%.
  - The job-post leg is the firm model rescaled on 31 postings; D2C brands rarely hire telecallers directly on Apna.
- **What survives.** "Against today's managed COGS, D2C's going per-minute price leaves no margin" holds. "D2C fails" as a pre-registered, symmetric gate does not.

### 6. Lending collections, early bucket

- **Ranking.** On `scorecard.csv`, lending_collections is rank 4. D2C at 3.40 is rank 3. Calling lending "#3" assumes the post-hoc D2C exclusion.
- **Confirmed values.** P(top3) 0.407, S1 #13 and S4 #8 are confirmed.
- **The 10.2% share.** It is 393/3,855 over all slugs and includes 69 postings from the targeted recovery-executive slug. The generic share is 319/3,372 = 9.5%.
- **"100% post-sales" is by construction.** `classify_jobs.py` sets `phase = "post_sales"` whenever the segment is lending_collections.
- **The ticket is modelled.** The ₹2.1 lakh/month ticket is `sizing.csv` monthly_ticket_inr_p50 = 207,724, which comes from assumed seats of lognormal(5, 150), 40% automatable, at ₹5/min.
- **Regulatory facts.**
  - The TRAI Direction of 19-11-2025 (primary) confirms the 1600 deadlines: 2026-01-01 / 02-01 / 03-01 for RBI entities. It also bars service calls from other numbers "even with the explicit or inferred consent of customers".
  - corplawupdates (secondary) states that the RBI Amendment Directions (press release 2026-08-06) take effect 2027-01-01. They require contact only between 08:00 and 19:00 hrs, recording plus 6-month retention, and IIBF certification for agents. The RBI primary is CAPTCHA-blocked.
  - The 08:00-19:00 rule already existed (RBI 2022 circular).
  - Not re-opened, RBI blocked: the Bajaj Finance ₹2.5 Cr penalty (2021) and the IT-outsourcing scope (NBFC-ML and above). Both are consistent with my prior knowledge.

### 7. Top-down reconciliation with TRAI

- **Confirmed from the OCR'd text layer of PR 111/2026** (04-08-2026, Q1 FY2026-27, 1 April to 30 June 2026):
  - "Total Promotional calls originated using 140 Series 13.16 billion".
  - "140 Series calls blocked after verification with registered [preferences] 1.48 billion".
  - "Total Calls originated from 1600 Series numbers 1.15 billion".
  - The PR also says the 1600 series is "for service and transactional calls by the entities in [BFSI], and for Government to citizen communication".
- **The comparison runs the wrong way.**
  - A subset (in-reach firms only, with the top banks, NBFCs and insurers excluded) should be well below the national total. Here it is 1.35x above.
  - Using the 140-series calls actually delivered (11.68 bn) gives 1.52x.
  - Either the bottom-up seat model is high, or the designated series under-capture calling. The PR's own 22.99 bn AI-flagged suspected-spam calls per quarter point to large 10-digit calling. Both readings make "reconciles within 1.35x" the wrong summary.
  - The bottom-up 1600 basket also includes fintech/SaaS onboarding, which is not all regulated entities, and the 140 basket assumes all pre-sales calling is registered promotion.

## Lane-quality notes

- **Good.**
  - Weights were frozen before data.
  - Scripts are seeded and fully reproducible.
  - The classifier was validated out of sample.
  - The lane discloses its blocked sources (Naukri, Indeed, foundit).
  - Method disagreement is reported rather than hidden.
- **Skipped or weak.**
  1. The brief asked for firm counts from MCA, GST or Udyam. The lane used sector registries and associations (IRDAI, CREDAI, FADA, AISHE, UDISE); seats per firm, phone share and automatable share are all assumptions.
  2. Section 6 asks for reconciliation against incumbent revenues (SquadStack, Exotel, Gnani and others from MCA filings). This was not done.
  3. The value gate is post hoc and asymmetric (see claim 5).
  4. post_sales_share is not in the brief's list and decides #1 vs #2 (see claim 1).
  5. The job-post rescale uses the slug-biased full sample and family-level shares that mix sales with renewals.
  6. Real estate's value per outcome rests on vendor blogs.
  7. The buyer behind the insurance pain evidence (insurers, mainly LIC, on life persistency) differs from the in-reach buyer (intermediaries renewing mostly motor and health).
  8. Apna postings are not seats: `no_of_openings` defaults to 10 on 99.3% of postings. The crawl is a one-month snapshot of a blue-collar board.
- **No sign of fabricated numbers.** Every number I checked against a primary source or the lane's files matched.
