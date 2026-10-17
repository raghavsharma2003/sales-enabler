<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l3-segments (H3): which Indian B2C segment has acute pain, real spend and a short path to buy?

Date: 2026-10-17. Lane spend: INR 0 (no paid Azure calls). Scorecard weights and anchors were frozen at
2026-10-17T09:02:54Z, before any count, job post or pain evidence was collected (`weights.json`).
Everything here is reproducible from the scripts in this folder. Raw crawl data is in the scratchpad
(`research-raw/l3-segments/`), not in this folder.

---

## 1. Answer to the hypothesis

**H3 holds, but only narrowly, and the binding constraint is the "short path to buy" part, not pain or
spend.** The segments with the largest phone spend (lending, large insurers, hospital chains) are the slowest
and most regulated buyers. The segments that are fastest to buy (D2C brands, small consultancies) spend little
per buyer and are already being served at prices below our likely cost.

1. **Insurance renewals sold through intermediaries is the only robust #1.** It ranks first on the frozen
   weights (3.85 / 5). It also ranks first or near-first on every pre-declared sensitivity check: #3 on the
   prediction's multiplicative form, #1 with the regulatory weight at 0 or doubled, P(top 3) = 1.00 and
   P(top 1) = 0.92 over 10,000 random weightings. It stays #1 when any one of its eight sub-scores moves by ±1.
   - **Pain is primary and money-denominated** (IRDAI Handbook 2024-25, counted by policies). 13th-month
     persistency is 64.1% at LIC and has a median of 77% across 21 private insurers. 61st-month persistency is
     about 50%. LIC alone recorded 68.6 lakh lapsed or forfeited non-linked policies in FY25.
   - **The calls are post-sales service calls to existing policyholders.**
   - **The buyers exist and are countable.** On the IRDAI registry today: 874 brokers, 689 corporate agents,
     940 IMFs and 23 web aggregators.
   - **Weakness: size.** With LIC and the large private insurers excluded (they run renewals in-house), the
     in-reach pool is about **INR 94 Cr/yr** (triangulated central; range INR 18–1,118 Cr).
   - **Health renewals at the biggest standalone insurer barely leak.** Star Health reports a renewal ratio of
     94–98% by premium (secondary source). The pain is concentrated in life and motor renewals.
2. **Real-estate inquiry qualification and site-visit booking is a solid #2.**
   - **Scores:** 3.45 on the frozen weights; P(top 3) = 0.67; #2 on the multiplicative form.
   - **Largest triangulated pool of any segment:** INR 830 Cr/yr, and the firm-based and job-post methods agree
     within 1.0×.
   - **Largest B2C employer of telecallers in our measured job data:** 14.0% of industry-classified generic
     telecalling postings on Apna (n = 3,372).
   - **It is pre-sales, so it is lawful only on consented inquiries.** Bought-list calling loses its legal basis
     when DPDP core obligations start in May 2027 (lane l1).
3. **D2C post-purchase (COD confirmation, NDR) is the frozen-weights #3, and #1 on the prediction's own
   multiplicative formula, but it fails a price-floor test.**
   - **Why it ranks high:** regulatory safety, plug-in integration and a fast sale.
   - **Market price is already below our likely cost.** A Shopify voice-AI app for Indian D2C lists INR
     2.375–3.3 per minute. A WhatsApp utility message costs INR 0.115. Lane l2's in-progress cost model puts our
     managed-Azure cost at INR 3.1–5.9 per minute (p50, by scenario).
   - **Value per call is small:** about INR 10–75.
   - **Spend per buyer is small.** A typical brand needs fewer than 2,000 minutes a month, and two independent
     checks (event-based, job-post-based) put the pool at about INR 50–65 Cr/yr, a quarter of the firm-based
     estimate.
4. **The contested third is lending pre-due and early-bucket reminders.**
   - **Scores:** 3.35, tied with consumer-fintech onboarding; P(top 3) = 0.41.
   - **Real spend:** collections is 10.2% of phone-role postings, plus another 11.9% for loan and credit-card
     telesales.
   - **Largest ticket per buyer:** about INR 2 lakh/month at p50.
   - **Why it is contested:** an RBI conduct overlay (calling hours, recording, agency rules from 2027-01-01),
     1600-series-only calling for RBI entities, IT-outsourcing due diligence for middle-layer NBFCs, at least 8
     AI vendors already selling, and negative "realism leverage". Warmth in a collection call reads as
     manipulation, which is a problem for a product built on emotional realism.

**Provisional top 3 (and why):**

1. **Insurance renewals and lapse-revival, via brokers, IMFs, corporate agents and mid-size insurers' renewal
   desks.** Robust under every weighting, with primary pain evidence and post-sales calls. Its pool is small,
   so it is a beachhead, not a market.
2. **Real-estate inquiry qualification and site-visit booking.** Biggest triangulated pool, strongest demand
   signal, high value per outcome (vendor claims put paid-media cost per site visit at INR 2k–50k), and founder
   or sales-head buyers.
3. **Lending pre-due and early-bucket reminders (contested).** Volume and spend are real, but regulation,
   competition and the realism mismatch make it the most likely of the three to be killed by lanes l1, l4 or
   l5.
   - **Pre-registered #3:** D2C post-purchase, which fails the price-floor gate (`value-gate.csv`).
   - **Next alternates:** hospitals and clinics (second-largest pool at INR 643 Cr, safest regulatory profile,
     thin pain evidence) and edtech admissions (high realism leverage, pay risk).

---

## 2. Prediction check against predictions.md

Prediction (H3, prior 0.50): *"The top 3 segments by (pain × spend × ease) ÷ regulatory risk will come from:
real-estate / edtech speed-to-lead qualification, D2C post-purchase, and insurance renewals. Lending
collections has the highest spend but ranks lower on regulatory and reputational risk."*

| Part of the prediction | Result | Verdict |
|---|---|---|
| Top 3 on the prediction's own multiplicative formula (sensitivity S1) | D2C 30.0, real estate 21.3, insurance renewals 20.0; edtech is #4 (16.0) | **Supported** (exact set) |
| Top 3 on the frozen weighted scorecard | Insurance renewals, real estate, D2C | **Supported** |
| Collections ranks lower on regulatory and reputational risk | #4 base, #13 on S1, #8 with the regulatory weight doubled | **Supported** |
| Collections has the highest spend | Not among in-reach mid-market buyers. Firm-based human spend: real estate INR 3,769 Cr vs collections INR 983 Cr (p50). Triangulated pool: real estate 830, healthcare 643, edtech 505, collections 473. On job posts, lending as a family (collections plus origination, 22.1% of phone-role posts) is the largest B2C employer, ahead of real estate (11.2%). | **Refuted** for collections alone; true only for lending as a family |
| (Implicit) the top 3 are all viable wedges | D2C passes the scorecard but fails a price-floor gate that the prediction did not anticipate | **Not anticipated** |

**Overall: mixed.** The ranking claim held in both scoring forms. The spend claim was wrong for the in-reach
market, and the D2C economics surprise was not foreseen.

---

## 3. Method

1. **Weights frozen first** (`weights.json`, 09:02:54Z).
   - **Weights:** pain 15, current spend 15, call volume 10, regulatory safety 15, integration ease 10, short
     sales cycle 10, willingness and ability to pay 15, post-sales share 10.
   - **Anchors:** each sub-score is 1–5 with written anchors, and 5 is always better for us.
   - **Sensitivity checks declared in advance:** S1 is the prediction's multiplicative form; S2 is 10,000
     Dirichlet weight draws; S3 sets the regulatory weight to 0; S4 doubles it. A sub-score ±1 robustness check
     was added afterwards and is labelled post-hoc.
2. **Registry counts** (`firm-counts.csv`).
   - **Read directly:** IRDAI registry pages (parsed tables), the IRDAI Handbook 2024-25 xlsx, TRAI PR 111/2026,
     CRIF MicroLend Jun-2026, MFIN Micrometer Q2 FY26, the Shiprocket UDRHP and Meesho RHP (BSE filings), FADA
     and CREDAI self-reports.
   - **Secondary:** RBI NBFC counts, RERA counts, HFR, NABH, UDISE+ and AISHE.
   - **Blocked:** RBI (CAPTCHA), MCA (403), data.gov.in, dashboard.msme.gov.in and rera.mohua.gov.in
     (connection failed). Company-registry counts by NIC code were therefore not available.
3. **Demand signal** (measured).
   - **Crawl:** an anonymous crawl of Apna's public listings for 11 phone-role slugs gave 6,454 job URLs. Of
     these, 6,300 job pages were parsed (154 fetch errors) and 3,855 are unique phone-role postings (97% posted
     in October 2026).
   - **Classifier** (`classify_jobs.py`): rules assign each posting to a segment and to pre-sales or post-sales.
   - **Validation by hand-labelling:** v1 scored 45/60 in-sample. The final v2 scored **49/60 (81.7%, Wilson 95%
     CI 70.1–89.4%) on a fresh out-of-sample set**. Pre/post tagging scored 43/60 (71.7%) and is biased towards
     "post-sales".
   - **Known classifier bias:** it over-assigns B2B (5 of 11 errors) and under-assigns consumer investing and
     fintech (3 of 11).
   - **Other boards** (`job-board-signals.csv`): headline counts from Apna's SEO pages, WorkIndia and LinkedIn
     guest pages. Naukri, foundit and Indeed blocked us.
4. **Sizing** (`sizing.py`, Monte Carlo, n = 20,000, seed 20261017).
   - **Formula:** firms in reach × share that runs phone work × seats per firm × connected minutes per seat ×
     share automatable × price.
   - **Seat productivity:** talk time 1.5/2.5/3.5 hours/day over 22–26 days. The seat-time and loaded-cost
     assumptions are copied from lane l2's telecaller model for consistency.
   - **Price:** INR 3–8/min from l2's vendor price list, and INR 2.375–4 for D2C.
   - **Cross-checks:** three event-based (D2C orders, insurance renewals due, vehicle service reminders), two
     top-down against TRAI call volumes, and a rescale to measured job-post shares.
   - **Triangulation rule** (`triangulate.py`): the central estimate is the geometric mean of the available
     methods; the range spans all of them.
5. **Pain, current workflow, and pre-sales vs post-sales** per segment, from filings, regulator data and the job
   posts (section 7).

---

## 4. Scorecard (frozen weights)

Full table with rationale and evidence links: `scorecard.csv`. Sensitivity results: `scorecard-sensitivity.csv`
and `scorecard-subscore-robustness.csv`.

| # | Segment | Pain | Spend | Vol | Reg-safe | Integ | Cycle | WTP | Post | **Score /5** | S1 rank | P(top3) S2 | S3 | S4 | ±1 worst |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Insurance renewals | 5 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | **3.85** | 3 | 1.00 | 1 | 1 | 1 |
| 2 | Real-estate qualification | 4 | 4 | 3 | 3 | 4 | 4 | 4 | 1 | **3.45** | 2 | 0.67 | 3 | 3 | 5 |
| 3 | D2C post-purchase | 3 | 2 | 1 | 5 | 5 | 5 | 2 | 5 | **3.40** | 1 | 0.50 | 7 | 2 | 6 |
| 4 | Lending early-bucket collections | 4 | 3 | 4 | 2 | 3 | 2 | 4 | 5 | **3.35** | 13 | 0.41 | 2 | 8 | 6 |
| 5 | Consumer fintech/app onboarding | 3 | 3 | 3 | 3 | 4 | 3 | 4 | 4 | **3.35** | 9 | 0.20 | 4 | 6 | 6 |
| 6 | Hospitals and clinics (appointments) | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 4 | 3.25 | 5 | 0.01 | 6 | 5 | 9 |
| 7 | Edtech/college admissions | 4 | 3 | 3 | 3 | 4 | 4 | 3 | 1 | 3.15 | 4 | 0.03 | 5 | 9 | 10 |
| 8 | Auto dealers | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 3 | 3.15 | 6 | 0.00 | 10 | 7 | 10 |
| 9 | Utilities billing (state-owned) | 3 | 2 | 5 | 5 | 1 | 1 | 3 | 5 | 3.15 | 16 | 0.17 | 14 | 4 | 12 |
| 10 | Rooftop solar (PM Surya Ghar vendors) | 3 | 3 | 2 | 3 | 4 | 5 | 3 | 2 | 3.10 | 8 | 0.01 | 8 | 11 | — |
| 11 | Diagnostics | 3 | 2 | 2 | 4 | 3 | 3 | 3 | 4 | 3.00 | 10 | 0 | 13 | 10 | — |
| 12 | Study-abroad consultancies | 3 | 3 | 2 | 3 | 4 | 5 | 3 | 1 | 3.00 | 7 | 0 | 11 | 13 | — |
| 13 | Insurance telesales | 3 | 3 | 3 | 2 | 4 | 3 | 4 | 1 | 2.90 | 12 | 0 | 9 | 15 | — |
| 14 | Telecom/ISP retention | 3 | 1 | 2 | 4 | 3 | 4 | 2 | 5 | 2.90 | 17 | 0 | 17 | 12 | — |
| 15 | Loan/credit-card origination | 3 | 3 | 3 | 2 | 3 | 3 | 4 | 1 | 2.80 | 15 | 0 | 12 | 17 | — |
| 16 | Travel and hospitality | 2 | 3 | 2 | 3 | 3 | 4 | 3 | 2 | 2.75 | 14 | 0 | 16 | 16 | — |
| 17 | K-12 schools (admissions, fees) | 2 | 3 | 1 | 4 | 3 | 3 | 2 | 3 | 2.65 | 11 | 0 | 18 | 14 | — |
| 18 | Political/government outreach | 2 | 3 | 5 | 1 | 4 | 2 | 2 | 2 | 2.50 | 18 | 0 | 15 | 19 | — |
| 19 | Matrimony, gyms, wellness | 2 | 1 | 1 | 3 | 4 | 5 | 2 | 2 | 2.40 | 19 | 0 | 19 | 18 | — |

Unweighted flags recorded beside each row in `scorecard.csv`:

- **Realism leverage** (input to H5): high for insurance renewals, real estate, edtech and study abroad; low for
  D2C; low to negative for collections and political outreach.
- **Incumbent density** (input to H4): high for collections and D2C; medium-high for real estate and edtech;
  medium for insurance renewals, where incumbents sell to insurers and intermediaries are thinly served.

**Positions 2–6 are close.** Real estate drops to #5 if any one of its sub-scores falls by 1. **Only the #1 is
robust.**

---

## 5. Sizing: bottom-up Monte Carlo, reconciled

### 5.1 Triangulated pools for in-reach buyers (large consumer-internet firms and the largest in-house operators excluded)

From `sizing-triangulated.csv`. INR Cr per year at today's market list prices; this is the AI-addressable
portion of today's phone work, not total spend.

| Segment | Firm-based p50 | Event-based p50 | Job-post-rescaled p50 | **Triangulated central** | Range (all methods) | Max disagreement |
|---|---|---|---|---|---|---|
| Real estate | 846 | — | 813 | **830** | 152–4,684 | 1.0× |
| Hospitals and clinics | 856 | — | 484 | **643** | 70–5,780 | 1.8× |
| Edtech admissions | 595 | — | 428 | **505** | 88–2,913 | 1.4× |
| Lending collections | 259 | — | 863 | **473** | 43–5,113 | 3.3× |
| Loan/card origination | 181 | — | 754 | **369** | 37–3,796 | 4.2× |
| Travel and hospitality | 177 | — | 201 | 189 | 32–1,116 | 1.1× |
| K-12 schools | 207 | — | 149 | 176 | 47–666 | 1.4× |
| Fintech onboarding | 98 | — | 158 | 124 | 14–1,106 | 1.6× |
| Auto dealers | 538 | 32 (service only) | 106 | 122 | 20–2,558 | 16.7× |
| Insurance telesales | 101 | — | 140 | 119 | 16–869 | 1.4× |
| Rooftop solar | 215 | — | 58 | 112 | 14–917 | 3.7× |
| Diagnostics | 244 | — | 42 | 101 | 7–1,485 | 5.8× |
| **Insurance renewals** | 122 | 40 | 169 | **94** | 18–1,118 | 4.3× |
| D2C post-purchase | 215 | 50 | 64 | 88 | 11–1,236 | 4.3× |
| Study abroad | 135 | — | 47 | 80 | 9–738 | 2.9× |
| Telecom/ISP | 18 | — | 129 | 48 | 3–771 | 7.1× |
| Matrimony, fitness | 39 | — | 51 | 44 | 10–190 | 1.3× |
| Utilities | 29 | — | — | 29 | 5–171 | — |
| **Sum of centrals** | | | | **≈ 4,150** | | |

- **Firm-based total:** INR 9,618 Cr/yr at p50 (p10 5,127, p90 20,524).
- **In-reach phone time behind it:** about 47 bn human connected minutes a year, roughly 1.1 million seats at
  about 3,600 connected minutes per seat per month.
- **Why the triangulated sum is less than half the firm-based total:** two independent checks show that the
  firm-based method overstates auto, diagnostics, D2C and solar, and understates lending.

### 5.2 Cross-checks (`sizing-crosschecks.csv`, `sizing-vs-jobposts.csv`)

- **Top-down, BFSI service calls.** TRAI PR 111/2026 reports 1.15 bn calls from the 1600 series in Q1 FY27,
  about 4.6 bn a year.
  - At a 35–65% connect rate and 0.5–2 minutes per call, that is 2.58 bn connected minutes a year (p10–p90:
    1.7–3.8).
  - Bottom-up post-sales human minutes for collections, insurance renewals and fintech onboarding: 3.50 bn.
  - **Ratio 1.35×: within the factor-of-2 bar.**
- **Top-down, promotional calls.** 13.16 bn calls in the quarter, about 52.6 bn a year, gives 15.4 bn connected
  minutes a year (9.3–23.4).
  - Bottom-up pre-sales human minutes (seven pre-sales segments): 20.9 bn.
  - **Ratio 1.35×.** Caveat: consented follow-up may not ride the 140 series, so this check is loose.
- **Event-based checks.** These count only one use case each, so they are lower bounds for the segment.
  - **D2C:** direct-commerce GMV INR 58.8k–74.7k Cr (Redseer, quoted in the Shiprocket UDRHP) ÷ AOV, × COD share
    × share of orders needing a call, × 0.94 minutes per call (implied by Scalysis's plan). Result: INR 50 Cr
    vs 215 Cr firm-based (**4.3×**).
  - **Insurance renewals:** private new policies of 92.4 lakh/yr × years in premium-paying status, plus health
    and motor renewals handled by intermediaries. Result: INR 40 Cr vs 122 Cr (**3.1×**).
  - **Auto service reminders:** vehicle parc from FADA 2025 retail × retention × reminders. Result: INR 32 Cr vs
    538 Cr (**16.7×**). The firm-based figure also counts dealers' sales follow-up.
- **Job-post shares vs modelled seat shares, family by family.**
  - **Agree within 2×:** real estate (1.04), insurance (0.72), edtech (1.39), healthcare (1.77), travel (0.88),
    fintech (0.62) and matrimony (0.77).
  - **Disagree by more than 2×:** lending origination (0.24) and collections (0.30), where the model is too
    low. The model excludes banks and large NBFCs, but their outsourced telesales (for example SBI cards via
    Randstad, HGS) appear in the job posts. The model is too high for auto (5.1), diagnostics (5.8), solar
    (3.7), D2C (3.4) and study abroad (2.9).
  - **Caveat:** job-post flow is headcount × attrition, and attrition is highest in collections and loan sales.
    Apna is also skewed to SMB, Hindi-belt employers.
- **Per-buyer ticket** (`sizing.csv`, ARPA p50; this informs H10):
  - collections about INR 2.1 lakh/month;
  - insurance renewals about INR 1.0 lakh/month;
  - real estate about INR 64k/month;
  - edtech about INR 59k/month;
  - hospitals about INR 52k/month;
  - auto about INR 36k/month;
  - D2C about INR 19k/month.
  
  These sit inside the H10 prediction of INR 25k–2 lakh/month, except D2C, which is below it.

---

## 6. Demand signal: measured job posts

Source: `job-posts-by-segment.csv` (all slugs, n = 3,855 unique phone-role postings) and
`job-posts-by-segment-generic.csv` (only the generic slugs telecalling / tele-caller / telecaller /
voice-process / customer-care, n = 3,372). Crawled anonymously 2026-10-17 09:21–09:49 UTC.

| Segment (classifier) | Share of all phone-role posts | Share of classified, generic slugs | Pre-sales / post-sales / unclear (all) |
|---|---|---|---|
| B2B telesales (out of H3 scope) | 22.0% | 27.8% | 60 / 22 / 18 |
| Unclassified or BPO | 16.8% | — | 24 / 30 / 46 |
| Loan and card origination | 11.9% | 13.6% | 57 / 15 / 27 |
| Real estate | 11.2% | 14.0% | 82 / 9 / 9 |
| Collections | 10.2% | 11.5% | 0 / 100 / 0 |
| Edtech and admissions | 7.5% | 7.9% | 81 / 7 / 12 |
| Healthcare | 5.4% | 7.1% | 37 / 32 / 32 |
| Insurance | 4.2% | 4.1% | 52 / 23 / 25 |
| Travel and hospitality | 3.1% | 3.9% | 42 / 32 / 25 |
| Fintech/investing | 1.8% | 2.4% | 62 / 15 / 24 |
| Telecom/ISP | 1.5% | 1.8% | 37 / 37 / 26 |
| Auto | 1.2% | 1.5% | 38 / 38 / 24 |
| D2C/e-commerce | 0.8% | 1.1% | 29 / 48 / 23 |
| Solar, study abroad, diagnostics, matrimony, fitness | 0.2–0.7% each | 0.25–0.9% | — |

- **Pay:** fixed-salary midpoint p50 INR 20,000/month (p10 13,500, p90 30,000; n = 3,811). This is consistent
  with lane l2's sample of 1,234 Apna postings (median band midpoint INR 17,000).
- **Cities:** Delhi-NCR 23%, Mumbai 14%, Bengaluru 13%, Hyderabad 6%, Chennai 6%.
- **Openings field is not usable:** Apna's `no_of_openings` is 10 on 99.3% of jobs, a default, so it cannot
  serve as a seat count.
- **Headline counts on other boards** (capped or fuzzy, so used only for scale): Apna "Telecalling Jobs – 8,656
  verified vacancies"; WorkIndia "10,000 telecalling job openings"; LinkedIn guest "8,000–9,000+ telecaller
  jobs in India".
  - **LinkedIn could not be split by segment:** guest pages ignore the industry filter, and quoted phrases are
    not honoured.
  - **Blocked:** Naukri (reCAPTCHA on the API, Akamai on pages), foundit (Akamai) and Indeed (HTTP 403).

**What the job data says:**

- **Telecaller hiring is mostly pre-sales.** The exceptions are collections, and to some extent healthcare,
  travel, auto and D2C.
- **B2B telesales is the single largest pool.** Its buyers are SMBs selling to SMBs (Just Dial-style listings,
  software, building materials). It is out of scope for H3 but should be noted in the synthesis.
- **Healthcare surprise:** hospitals and clinics hire telecallers as much for patient acquisition (IVF,
  aesthetics, hair transplants, preventive packages) as for appointments.

---

## 7. Pain, current workflow, and pre-sales vs post-sales, by segment

**Insurance renewals (post-sales).**

- **Pain** (IRDAI Handbook 2024-25, Table 28, by number of policies):
  - 13th-month persistency is 64.1% at LIC and has a median of 77% across private insurers (n = 21). So 23–36% of
    policies miss the first renewal.
  - 61st-month persistency is about 50% at LIC and a median of 50.6% for private insurers.
  - Table 27: LIC forfeited or lapsed 68.6 lakh non-linked policies in FY25.
  - IRDAI's long-standing guidance that 13th-month persistency should be at least 90% (stated in 2020) is far
    from being met. *(Secondary source.)*
- **Motor** is a second leak: about 56% of 30.48 crore registered vehicles are uninsured. This is a 2026 Supreme
  Court judgment citing a parliamentary committee (secondary source).
  - **Structural headwind:** the same judgment directs longer third-party tenures for new vehicles (4 years for
    cars, 6 for two-wheelers), which reduces annual renewal events for new vehicles.
- **Health renewals at Star Health** run at 94–98% by premium (secondary source), so health is not where the
  leak is.
- **Current workflow:**
  - insurers' in-house or BPO call centres (for example a Bharti AXA "renewal process" BPO posting in our sample);
  - agents;
  - bancassurance partners (the corporate agents);
  - brokers and IMFs with small telecaller teams working from spreadsheets.
- **Regulation:**
  - 1600 series mandatory for IRDAI entities from 2026-02-15 (TRAI direction; lane l1);
  - IRDAI distance-marketing rules require recording notices and approved scripts.
- **Where the gap is:** incumbents (Gnani, SquadStack) sell to insurers, so the 2,500-odd intermediaries are
  thinly served.

**Real estate (pre-sales on inquiries).**

- **Buyers:** developers (CREDAI claims 13,000+ members; RERA had 1,16,117 projects and 82,755 agents in
  November 2023) and channel partners.
- **Lead spend is real:** 99acres earned about INR 488 Cr in FY26 standalone revenue (secondary source).
- **Vendor claims, cross-check only:** cost per lead INR 150–2,500; lead-to-site-visit conversion 3–8%; leads
  untouched for 24 hours lose most of their value.
- **Current workflow:** in-house "presales" telecallers and BPO lead-generation desks (for example PlatinumOne
  in our sample), with follow-up on WhatsApp.
- **Regulation:**
  - follow-up on a portal inquiry is consented;
  - the DPDP Act's s.7(a) illustration on voluntarily provided data is literally a real-estate broker
    (lane l1);
  - bought or scraped lists become unlawful to process from about 2027-05-13 (lane l1).

**Lending collections (post-sales).**

- **Stress is uneven:**
  - fintech small-ticket personal-loan defaults reached 6.4% in March 2026 (RBI FSR June 2026, via news);
  - microfinance stress has eased: CRIF MicroLend shows PAR 1–180 at 2.3% in June 2026, down from 7.1%, with
    10.3 crore active loans.
- **Current workflow:** in-house teams plus DRA-certified agencies. Small agencies hire heavily on Apna. Lenders
  also use AI vendors: Saarthi, Gnani, Credgenics, DPDzero, RevRag, SquadStack, CredResolve, Exotel.
- **Regulation:**
  - RBI recovery conduct amendments in force from 2027-01-01: calls only 08:00–19:00, recordings retained 6
    months, agency rules (lane l1; secondary source);
  - RBI fined Bajaj Finance INR 2.5 Cr in 2021 over recovery-agent harassment;
  - 1600-only calling for RBI entities;
  - RBI's IT-outsourcing Master Direction (April 2023) applies in full to middle-layer NBFCs and above.
- **Open legal question:** whether an AI caller counts as a "recovery agent" that needs certification.

**D2C post-purchase (post-sales).**

- **Pain is primary but small per event.** Meesho's RHP: COD was 76.95% of 1,588 M shipped orders in FY25, and
  COD orders were delivered 77.7% of the time vs 97.3% for prepaid.
- **Buyer pool:** Shiprocket had 10,005 "Power Merchants" (more than 100 orders per active month) in FY25.
- **Current workflow:**
  - first touch over WhatsApp or IVR (Shiprocket Engage);
  - courier NDR desks;
  - Shopify AI-calling apps already live: Scalysis at INR 2.375–3.3/min with an Indian number and DLT handled;
    Ringg at USD 99 for 1,000 minutes.
- **Regulation is easy:** these are service calls about the buyer's own order. Logistics and couriers moved to
  the 1601 series from 2026-08-10.

**Hospitals and clinics.**

- **Pool:** 5.47 lakh Health Facility Registry (HFR) facilities (August 2026) and 4,650 NABH hospitals.
- **No primary Indian no-show rate found.** The widely quoted 32% is vendor-sourced. One Indian tertiary-hospital
  study names forgetfulness and missing reminders as the top causes.
- **Job posts show acquisition calling** (IVF, aesthetics) as much as service calling.

**Edtech admissions.**

- **Pool:** 46,468 colleges responding to AISHE 2023-24, 70% of them private unaided, plus coaching institutes
  and edtechs.
- **Current workflow:** counsellors working inbound leads (for example Simplilearn, an aviation academy, PrepMed
  in our sample).
- **Pay risk** after the 2023–25 edtech downturn.

**Study abroad.**

- **Shrinking:** Bureau of Immigration figures show outbound students falling from 9.08 lakh (2023) to 7.7 lakh
  (2024) to 6.26 lakh (2025), a fall of 31%.
- **Note:** this was sales-enabler's first configuration (AGENTS.md). The evidence argues against it as a
  wedge.

**Telecom/ISP.**

- **Concentrated:** the top 5 providers hold 98.6% of broadband subscribers (TRAI, March 2026), so the
  in-reach pool is tiny.

**Rooftop solar.**

- **Time-limited:** PM Surya Ghar vendors (8,000+ in 2024) chase scheme applications, but the scheme ends in
  FY2026-27.

**Utilities.**

- **Hard to buy for:** they got the 1601 series from 2026-08-10, but buyers are state-owned and buy through
  tenders.

---

## 8. Evidence table

| # | Claim | Source | Date | Method | Confidence |
|---|---|---|---|---|---|
| E1 | 13th-month persistency: LIC 64.1%, private median 77% (n = 21); 61st month: LIC 50.3%, private median 50.6% | IRDAI Handbook 2024-25, Table 28 (xlsx) https://irdai.gov.in/handbook-of-indian-insurance | FY2024-25, read 2026-10-17 | read-primary (parsed) | high |
| E2 | LIC lapsed or forfeited 68.6 lakh non-linked policies in FY25; 270.2 lakh new individual life policies (private 92.4 lakh) | IRDAI Handbook 2024-25, Tables 27 and 9 | FY2024-25 | read-primary | high |
| E3 | IRDAI registry: 26 life, 28 general, 8 health insurers; 874 brokers; 689 corporate agents; 940 IMFs; 23 web aggregators | https://irdai.gov.in/list-of-brokers (and sibling list pages) | read 2026-10-17 | read-primary (parsed tables) | high |
| E4 | Q1 FY27: 13.16 bn promotional calls on the 140 series; 1.15 bn calls on the 1600 series; 224 M DND preferences out of 1.348 bn subscribers | TRAI PR 111/2026 https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf | 2026-08-04 | read-primary | high |
| E5 | Meesho FY25: COD 76.95% of 1,587.94 M shipped orders; COD delivery success 77.70% vs prepaid 97.28% | Meesho RHP https://www.bseindia.com/corporates/download/381966/IPO%20Open/6RHP_20251201135547.pdf | 2025-12 | read-primary | high |
| E6 | Shiprocket Power Merchants 10,005 (FY25), 8,596 (H1 FY26); 164.35 M unique transactions in FY25 | Shiprocket UDRHP-I https://www.bseindia.com/corporates/download/384619/IPO%20Prior/UDRHP1_20251212214115.pdf | 2025-12-12 | read-primary | high |
| E7 | Direct-commerce GMV INR 581–747 bn (CY2024) | Redseer, quoted in the Shiprocket UDRHP | 2025-11-30 | read-primary (commissioned report) | medium |
| E8 | D2C voice-AI app list price INR 2.375–3.3/min (2,828–19,960 min/month plans) | https://apps.shopify.com/scalysis-ai-calling | read 2026-10-17 | read-primary (price page) | high |
| E9 | WhatsApp utility message INR 0.115; marketing INR 0.8631 (India, from 2026-10-01) | https://developers.facebook.com/docs/whatsapp/pricing/ (lane l1, S31) | 2026-10-01 | measured by l1 | high |
| E10 | Microfinance June 2026: 10.3 crore active loans, 6.6 crore borrowers, GLP INR 3.33 lakh Cr, PAR 1–180 2.3% (7.1% a year earlier) | CRIF MicroLend https://www.crifhighmark.com/media/7364/microlend-quarterly-report-august-2026.pdf | 2026-08 | read-primary | high |
| E11 | Fintech small-ticket personal-loan defaults 6.4% in March 2026 | RBI FSR June 2026, via https://www.loansjagat.com/news/fintech-small-ticket-personal-loan-defaults-rose-to-6-4-percent-by-march-2026-rbi-fsr-warns | 2026-06/07 | read-secondary (rbi.org.in CAPTCHA) | medium |
| E12 | About 9,291 NBFCs (December 2024); layers by number: UL 0.2%, ML 7.0%, BL 92.8% | RBI list and Trend & Progress 2024-25 (via search snippets; PDF fetch redirected) | 2024-12 / 2025-03 | read-secondary | medium |
| E13 | RBI recovery conduct from 2027-01-01: calls 08:00–19:00, recordings retained 6 months, agency rules | lane l1 S22 (corplawupdates summary; RBI primary CAPTCHA-blocked) | 2026-08-06 | read-secondary | medium |
| E14 | 1600 series mandatory: RBI entities 2026-01-01 to 03-01; IRDAI entities 2026-02-15; 1601 for utilities and logistics from 2026-08-10 | TRAI directions (lane l1 S06, S07, S08) | 2025-11 to 2026-08 | read-primary (l1) | high |
| E15 | RBI fined Bajaj Finance INR 2.5 Cr for recovery-agent harassment | https://website.rbi.org.in/web/rbi/-/press-releases/reserve-bank-of-india-imposes-monetary-penalty-on-bajaj-finance-limited-50918 | 2021-01 | read-secondary (indexed RBI release) | high |
| E16 | Collections voice-AI vendors active: Saarthi (claims USD 400 M collected), Gnani, Credgenics, DPDzero, RevRag, SquadStack, CredResolve, Exotel | vendor press and blogs (for example cxotoday) | 2025–2026 | vendor-claim | medium (existence) / low (numbers) |
| E17 | FADA: 15,000+ dealerships, 30,000+ outlets, about 5 M employed | https://fada.in/about-us.php | read 2026-10-17 (undated page) | read-primary (self-report) | medium |
| E18 | CREDAI 13,000+ developers; RERA 1,16,117 projects and 82,755 agents (November 2023) | https://credai.org/ ; Business Standard citing MoHUA | 2023-11 / 2026 | self-report / read-secondary | medium |
| E19 | 99acres FY26 standalone revenue about INR 488 Cr | propnewstime (Info Edge results) | 2026-05 | read-secondary | medium |
| E20 | Real-estate CPL INR 150–2,500; lead-to-visit 3–8% | Sell.Do, Caller.Digital, CallSphere blogs | 2025–2026 | vendor-claim | low |
| E21 | HFR 5.47 lakh facilities (2026-08-12); NABH 4,650 hospitals (2024-12-31) | digitalhealthnews; Rajya Sabha answer via search | 2026-08 / 2025-02 | read-secondary | medium |
| E22 | 339,583 private unaided schools (UDISE+ 2024-25); 46,468 colleges responding to AISHE 2023-24, 70% private unaided | MoE annexure RSUQ 533; Deccan Herald | 2025–2026 | read-secondary | medium-high / medium |
| E23 | Outbound students (BoI): 9.08 lakh (2023), 7.7 lakh (2024), 6.26 lakh (2025) | Rajya Sabha answer via Greater Kashmir | 2026 | read-secondary | medium |
| E24 | Top 5 broadband providers hold 98.60% of 1,065.88 M subscribers (March 2026) | TRAI PR 76/2026 (figure via search summary; PDF text unreadable) | 2026-06-22 | read-secondary | medium |
| E25 | About 56% of 30.48 crore vehicles uninsured; longer TP tenures ordered for new vehicles | SC judgment 2026 via verdictum.in | 2026 | read-secondary | medium |
| E26 | Star Health renewal ratio 94–98% (by GWP) | brokerage note and company presentation via search | H1 FY25–FY26 | read-secondary | medium-low |
| E27 | PM Surya Ghar: 8,000+ vendors (2024); scheme ends FY2026-27; MNRE deactivated 66 vendors in August 2026 | solarquarter; powerpeakdigest | 2024 / 2026-08 | read-secondary | low-medium |
| E28 | Telecaller fixed pay p50 INR 20,000/month (n = 3,811); Delhi-NCR 23% of postings | Apna crawl (this lane) | 2026-10-17 | measured | high (for Apna) |
| E29 | Lending (collections plus origination) is 22.1% and real estate 11.2% of phone-role postings; collections postings are 100% post-sales | Apna crawl and classifier (this lane) | 2026-10-17 | measured (classifier 81.7% accurate) | medium |
| E30 | Lane l2's in-progress managed-Azure COGS: p50 INR 5.9/min today, 3.1 optimised, 2.1 self-hosted at scale | ../l2-economics/cost-model.json | 2026-10-17 | computed by l2 (in progress) | medium |

---

## 9. Measurements

| What | n | Method | Date | Result |
|---|---|---|---|---|
| Apna phone-role postings crawled | 6,454 URLs; 6,300 parsed; 3,855 unique phone-role | anonymous HTTP crawl of public listing and job pages, 4–8 workers (`apna_crawl.py`, `apna_detail.py`) | 2026-10-17 09:13–09:49 UTC | `job-posts-classified.csv`, `job-posts-by-segment*.csv` |
| Segment classifier accuracy (out of sample) | 60 | hand-labelled random sample B (seed 2026) | 2026-10-17 | 49/60 = 81.7% (95% CI 70.1–89.4%) |
| Classifier v1 accuracy (in sample, before fixes) | 60 | hand-labelled sample A (seed 7) | 2026-10-17 | 45/60 = 75% (insurance precision 1/5 before fix) |
| Pre/post-sales tagging accuracy | 60 | sample B | 2026-10-17 | 43/60 = 71.7% (59.2–81.5%), biased towards post-sales |
| IRDAI registry rows | 4 lists | HTML table parse | 2026-10-17 | 874 / 689 / 940 / 23 |
| IRDAI persistency | 22 insurers | xlsx parse, Table 28 | FY2024-25 | as in E1 |
| Sizing Monte Carlo | 20,000 draws × 18 segments | numpy, seed 20261017 | 2026-10-17 | `sizing.csv`, `sizing.json` |
| Scorecard sensitivity | 10,000 Dirichlet weight draws | numpy, seed 17 | 2026-10-17 | `scorecard-sensitivity.csv` |

---

## 10. Gaps in the market

1. **Renewal and lapse-revival calling for insurance intermediaries.** The 874 brokers, 940 IMFs and 689
   corporate agents hold renewal books in spreadsheets and small telecaller teams, while vendors sell to
   insurers. Life persistency of 64–77% at month 13 is the money.
2. **Inquiry-to-site-visit qualification for mid-size developers and channel partners**, priced per qualified
   visit, in regional languages. Vendors sell per minute or as dialers. The buyer thinks in cost per site
   visit.
3. **Patient-acquisition and follow-up calling for specialty clinics and hospitals** (IVF, aesthetics, dental,
   hair). Healthcare job posts are about one-third acquisition, one-third service, and no AI vendor stood out
   in this lane's search. This is the least-crowded large pool, but its evidence is thin.
4. **Early-bucket reminders for base-layer NBFCs and DRA collection agencies.** Agencies hire on Apna in
   volume and decide fast. Today's AI collection vendors target large lenders. The open regulatory question is
   whether an AI caller can act for a certified agency.
5. **B2B SMB telesales** (22–28% of phone-role postings) is outside H3's B2C scope but is the single largest
   telecalling pool in the data. The synthesis should note it.
6. **Data gap:** no primary national count of telecallers exists in what we could reach. PLFS unit data (NCO
   codes 4222, 5244) would give one; see the owner actions.

---

## 11. What would kill this

**Insurance renewals (#1):**

- Kill if fewer than 5 of 15 qualified intermediaries interviewed (brokers, IMFs, corporate agents) run at least
  3 renewal telecallers or own the renewal relationship. That would mean insurers hold the calls and the buyer
  is enterprise.
- Kill if they cannot legally or practically share renewal lists.
- Kill if insurers contractually bar intermediaries from AI calling to policyholders.
- Kill if accepted price is below INR 6/min-equivalent or INR 150 per renewal saved. That is below our managed
  COGS plus margin (lane l2).
- Weakens if the IRDAI 2024 operations regulations treat intermediary renewal calling as outsourcing that needs
  insurer approval (lawyer question).

**Real estate (#2):**

- Kill if discovery shows most volume is bought or cold lists rather than portal or own-media inquiries, because
  that loses its legal basis in May 2027.
- Kill if developers will not pay at least INR 300–500 per qualified site visit.
- Kill if speed-to-lead does not move site-visit rates in a 4-week concierge test.

**Lending early-bucket (#3, contested):**

- Kill if counsel says an AI caller is a "recovery agent" that needs certification, or that the 1600 series
  cannot be used through a vendor platform.
- Kill if the best incumbent is at or below INR 3/min with acceptable quality (lane l4).
- Kill if H5 finds warmth reduces outcomes or raises complaints in collections.

**The whole lane:** Kill if the job-post and registry picture is unrepresentative. Apna is skewed to SMB,
Hindi-belt employers and the classifier is about 82% accurate; a Naukri or foundit pass by the owner could
change shares by ±5 points.

---

## 12. Owner actions (things this lane could not do)

1. **Discovery calls**, 8 insurance intermediaries plus 8 developers or channel partners, using a Mom-Test guide.
   Pick targets from the IRDAI broker and IMF lists (`irdai.gov.in/list-of-brokers`, `list-of-imfs`) and from
   real-estate postings in `job-posts-classified.csv` (filter `segment=real_estate`; employer names are in the
   scratchpad raw file). Ask:
   - How many renewal or presales telecallers do you have?
   - What are their monthly calls and connect rate?
   - What is your persistency or site-visit rate?
   - What CRM or dialer do you use?
   - What did you pay per lead last month?
   - Who signed the last software contract, and how long did it take?
2. **Job-board counts we were blocked from.** In a normal logged-in browser, run these searches on Naukri and
   foundit: "telecaller", "telesales", "collection telecaller", "insurance renewal telecaller", "real estate
   telecaller", "admission counsellor", "hospital telecaller", "service advisor CRE". Record the result count
   and the "industry" facet counts, with a screenshot of each page. About 20 minutes.
3. **PLFS unit-level data.** Register on the MoSPI microdata portal (needs an account), download PLFS 2024-25
   unit data, and send it to the next session to count workers in NCO-2015 codes 4222 and 5244 by industry. This
   gives a primary national telecaller count to replace the firm-based seat estimate.
4. **Lawyer questions**, to add to lane l1's list:
   - Can an AI caller lawfully make RBI-regulated pre-due and recovery calls on behalf of a lender or agency? Does
     it need the IIBF DRA certification route?
   - Under the IRDAI 2024 operations regulations and master circular, can a broker or IMF use an AI vendor for
     renewal calls to policyholders?
5. **One paid-pilot ask in each of the top 2 segments**, priced per outcome (renewal saved; site visit booked).
   This is the H3 proof standard in brief §6.

---

## 13. Open questions

- What share of private life renewals is serviced by intermediaries rather than by insurers directly? This
  decides whether segment #1 is an SMB sale or an enterprise sale.
- Does auto-debit (eNACH/UPI AutoPay) penetration of life premiums cap the calls needed? The IRDAI handbook does
  not report it.
- Real cost per site visit and booking for mid-size developers. Only vendor claims are available now.
- Hospital no-show and lead-conversion rates in India. No primary source was found.
- How much 1600-series volume is human telecalling and how much is IVR/OBD? That would tighten the top-down
  check.
- Firm-based sizing over-counts minutes in segments where phone staff do mixed work (auto, diagnostics, D2C). A
  time-use measurement from 3–5 discovery interviews would fix the "automatable share" input.
- Lane l2's COGS is still in progress. If the managed stack lands at or below INR 2.5/min, re-run the D2C
  price gate; D2C would then re-enter the top 3.

---

## 14. Files in this lane

- `weights.json`: frozen weights and anchors.
- `scorecard.csv`, `scorecard-sensitivity.csv`, `scorecard-subscore-robustness.csv`, `score_segments.py`.
- `firm-counts.csv`: registry counts with sources.
- `sizing.py`, `sizing.csv`, `sizing.json`, `sizing-crosschecks.csv`, `sizing-vs-jobposts.csv`,
  `triangulate.py`, `sizing-triangulated.csv`.
- `value-gate.csv`: value per outcome vs market price vs our COGS.
- `apna_crawl.py`, `apna_detail.py`, `classify_jobs.py`, `job-posts-classified.csv` (employer names hashed),
  `job-posts-by-segment.csv`, `job-posts-by-segment-generic.csv`, `classifier-validation.csv`,
  `job-board-signals.csv`.
