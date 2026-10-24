# Verifier report: r2-economics-renewal (round 2)

Date: 2026-10-17. Verifier: adversarial pass, independent of the package author.
Scope: the 8 load-bearing findings handed over by the workflow. No package file was edited; this file is the only write.

## What I did

1. **Re-ran the model.** I copied `renewal_model.py` to the scratchpad and ran it (numpy 2.5.3, seed 20261017, n = 20,000).
   - `renewal-results.csv`, `renewal-pricing-grid.csv`, `renewal-buyers.csv`, `renewal-mde.csv`, `renewal-sensitivity.csv` and `renewal-model.json` came out **byte-identical** to the published files.
   - Charts were skipped (matplotlib is not installed under `python3 -I`).
2. **Read the code line by line.** The algebra is consistent:
   - attempts truncated at K;
   - answered calls = p × E[attempts];
   - holdout applied to revenue, gain and cost alike;
   - floors and ceilings divide by the same renewals base.
   - I found no arithmetic or unit bug. INR stays INR, and minutes are connected minutes throughout.
3. **Ran sensitivity variants**, one input changed per run, same seed:
   - corrected scale COGS;
   - observed life renewal-commission rates;
   - no VP-borne human escalation;
   - billing only renewals collected after the first AI attempt.
4. **Re-read the IRDAI Handbook 2024-25 xlsx myself** with my own reader, not the package's extractor.
   - Source: Part V, Tables 98, 99, 103 and 104; file dates 2026-02-03.
   - The zip is the same file round-1 l3 downloaded (sha256 c4c77d51…).
5. **Re-downloaded the three PB Fintech PDFs** with a browser user-agent (HTTP 200) and converted them to text.
6. **Ran web checks** on commission rates, the motor TP tariff and the Star Health renewal basis.

Scratch scripts (not part of the package): `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/v2econ/` (`variant.sh`, `summ.py`, `alt_billing.py`, `esc_cost.py`, `hb_check.py`, `hb_check2.py`, `hb_grep.py`).

## Verdicts

| # | claim (short) | verdict |
|---|---|---|
| 1 | Value per saved renewal by line; the round-1 gate counted the insurer's premium | **weakened** |
| 2 | ₹6-8/min yield gives launch GM −47% to +1% | **weakened** (conclusion stands; attribution and scale numbers off) |
| 3 | Per-renewal pricing works for 4W, health and life; fails for 2W | **weakened** |
| 4 | Concept-test price card | **weakened** |
| 5 | AI vs desk cost depends on unmeasured desk productivity | **confirmed** |
| 6 | KC1 bridge in due renewals per month | **confirmed** (computed, assumption-driven) |
| 7 | IRDAI FY25 channel shares | **confirmed**, with one denominator correction |
| 8 | Policybazaar health persistency | **confirmed**, with one wording correction |

---

### 1. Value of one incremental saved renewal: weakened

**What holds**
- Every p10/p50/p90 reproduces exactly from the re-run:

  | line | p50 | p10-p90 | 3-year value |
  |---|---|---|---|
  | 2W | ₹265 | 162-413 | ₹458 |
  | 4W | ₹2,415 | 1,440-3,881 | ₹4,623 |
  | health | ₹2,737 | 1,865-3,848 | ₹6,473 |
  | life years 2+ | ₹1,941 | 1,170-3,125 | ₹4,748 |

- The critique of the round-1 gate is right. `lanes/l3-segments/value-gate.csv` gives the basis of ₹1,000-30,000 as the intermediary's commission plus "insurer: the retained premium itself".
- The premium anchors check out:
  - T104 broker average health premium is ₹15,267 (502,089.6 lakh / 3,288,653 policies). I recomputed it.
  - The 2022 TP tariff for cars is ₹2,094 / ₹3,416 / ₹7,890-7,897 (The Week). No later MoRTH revision has been notified; the 2025 proposals of +10% and +18-25% are still pending.

**What is weaker than stated**
- **Commission rate (c) is an assumption, not a measurement, in every line.** It is the input that sets the value of a save.
- **Life is skewed high.**
  - The model draws c from tri(3%, 5%, 7.5%), anchored on pre-2023 *caps*.
  - Observed renewal-commission ratios are lower. Cafemutual's analysis of insurers' public disclosures gives:
    - FY26 industry 3.7% (FY25 4.1%);
    - H1 FY26 3.91%;
    - LIC 5.1%;
    - every private insurer 0-3.2% in FY26 (HDFC Life 1.6%, ICICI Pru 2.1%, Axis Max 2.1%, SBI Life 2.5%, Tata AIA 3.2%).
  - The model's triangle puts P(c < 3.2%) at about 0.4%.
  - Brokers and IMFs mostly sell private life. Re-running with c ~ tri(1%, 2.5%, 5%) gives life value **₹1,039 p50 [569-1,823]**, about half of ₹1,941. The 3-year value becomes ₹2,548.
- **Motor and health c are anchored on T50 net commission / NPE.** That ratio is insurer-wide: all lines, all channels, new and renewal blended, and net of reinsurance commission.
  - It is not a renewal rate by line and channel. Bajaj Allianz at 3.9% shows how distorted it can be.
  - Line-level disclosures (NL-6, L-5) were blocked for the package (sources B01-B03) and for me.
- **Commission cuts since October 2025.** From 2025-10-01, insurers reportedly cut distributor commissions on retail health and individual life by about 15-18%, after the GST exemption removed their input tax credit.
  - Source: Business Standard, read secondary through search snippets; the pages return 403.
  - The FY25 T50 anchors predate this. Health value is probably about 15% lower than modelled.

**Correction:** keep 2W, 4W and health as stated, labelled assumption-anchored. Life years 2+ is about ₹1,040 [570-1,820] this year and ₹2,550 over 3 years at observed private renewal-commission rates. Health is probably about 15% lower after the post-GST cuts.

### 2. Per-minute pricing at ₹6-8: weakened (the decision is unchanged)

**What holds**
- The launch GMs reproduce: −41%/−6% (2W), −32%/+1% (4W), −47%/−10% (health), −39%/−4% (life) at ₹6/₹8.
- The conclusion holds in every variant I ran: no line reaches 40% launch GM at ₹6-8.

**What is wrong in the statement**
- **"At managed COGS MC p50 ₹5.88/min" understates the cost stack.**
  - All-in launch cost per AI minute is p50 ₹7.9-8.8:

    | component | ₹ per AI minute |
    |---|---|
    | COGS | 5.9 |
    | VP-borne human escalation | 1.5-2.2 (19-26% of cost) |
    | WhatsApp | 0.16-0.29 |
    | 1600 adder | 0.15 |

  - The escalation load is an assumption: 5-25% of RPCs, 2-6 min each, at ₹5.5-9/min. It is billed to no one, and it is most of the gap to SYNTHESIS's "2-26%".
  - With escalation set to zero, the launch range is −8% to +21%.
- **The scale figure uses stale COGS.**
  - The model hard-codes scenario B at ₹2.67/3.51 (p50 3.06). CORRECTIONS-round2.md §8.1 corrects this to ₹2.84/3.70 (p50 3.23).
  - Re-run with the corrected values, the 1M-min/month range is **−1% to +35%**, not 2-38%.

**Correction:** at ₹6-8/min, launch GM is −47% to +1% against an all-in cost of about ₹7.9-8.8 per AI minute (COGS ₹5.88 plus about ₹2 of VP-paid escalation, WhatsApp and 1600 carriage). It is −8% to +21% if escalation is the buyer's cost. At 1M min/month it is −1% to +35% with the corrected scale COGS.

### 3. Per-renewal-collected pricing works for 4W, health and life, not 2W: weakened

**What holds**
- Every number reproduces:
  - 4W ₹50: GM 66.5%; P(GM ≥ 40%) 0.991; P(gain vs no-call) 0.989; P(gain vs desk) 0.604 (talk method) / 0.691 (seat method);
  - health ₹15: GM 45.3%, P 0.649, scale 63.1%;
  - life ₹15/₹20: GM 33.0% / 49.8%;
  - 2W ₹20: GM 12.7%, P 0.074; floor ₹29.1, ceiling ₹35.5;
  - yields ₹9.7-23.5 per AI minute.
- 4W is robust to every variant I ran.

**What is fragile**
- **(a) The pricing base includes renewals that happen before any call.** "Per renewal collected on the AI-worked list" bills renewals that arrive before the first AI attempt (b0 × s_pre).
  - These are 19-29% of billed renewals: 2W 21%, 4W 19%, health 29%, life 29%.
  - If a buyer refuses to pay for those, launch GM falls:

    | line | GM as modelled | GM if billed only after first AI attempt |
    |---|---|---|
    | 4W | 66% | 58% |
    | health | 45% | 22% |
    | life | 33% | 5% |
    | 2W | 13% | −11% |

  - The 40%-GM fees would then be: health ₹19, life ₹24, 4W ₹35.
- **(b) Life fails the package's own rule at observed commission rates.** With life c ~ tri(1%, 2.5%, 5%), at ₹15 P(gain vs desk) is 0.40, below the 0.6 bar.
  - The rule then picks ₹10, where launch GM is −0.5% and P(GM ≥ 40%) is 0.02.
  - Life then fails at launch, like 2W.
- **(c) 2W's "floor ≈ ceiling" compares two p50s.** P(a window exists vs no-call at a 40% launch GM) is 0.66, so the window is narrow rather than absent.
  - With zero VP-borne escalation, the 2W 40%-GM floor falls to ₹22 against the ₹35 ceiling.
  - The 2W exclusion is therefore partly an artefact of the unmeasured escalation assumption.
- **(d) Scale COGS.** Health scale GM at ₹15 is 62% with the corrected COGS, not 63%.

**Correction:** per-renewal pricing is robust for 4W. Health at ₹15 clears 40% GM only if renewals made before the first call are billable; otherwise ₹19 is needed. Life at observed private renewal-commission rates (≤3.2%) does not clear the buyer test at ₹15 and is at about 0% GM at ₹10, so treat life like 2W. 2W's exclusion depends on who pays for escalations.

### 4. Concept-test price card: weakened

**What holds**
- The four per-renewal fees follow mechanically from the stated rule. I checked against the grid rows:
  - 4W: ₹60 fails the desk test (0.526);
  - health: ₹20 fails (0.502);
  - life: ₹20 fails (0.483);
  - 2W (exempt from the desk test): ₹25 fails the no-call test (0.748).
- The card applies the rule correctly.

**What the cited source does not support**
- **The ₹15,000 monthly minimum is not derived from the grid.** It is a judgement call.
  - It is below the 1,500-due broker's trough-month usage (₹19.7k), so it is consistent there.
  - It is above the modelled usage of any buyer under about 935 due/month (mixed book, ₹16.05 per due), or about 1,150 in the trough month.
  - For the 150-due agency it is 7× its usage (₹2.1k) and 2.2× its whole commission gain (₹6.7k p50).
  - So the card silently prices out small agencies and IMFs. Say so.
- **The "10% holdout reported quarterly" cannot show lift for most buyers.** These figures come from the package's own `renewal-mde.csv`; I re-checked the arithmetic.
  - At 1,500 due/month and a 10% holdout, detecting the median modelled lift takes 2.9 months for 2W, 5.4 for 4W, 25.8 for health and 20.7 for life.
  - A mixed 1,500-due broker has only about 375 health and 75 life due a month. For those lines that means about 100 and about 400 months.
  - The figures also use the mode baseline, with no seasonality or clustering.
  - A quarterly holdout report will be noise except for 2W and 4W at large brokers and PoSP platforms.
- **Life fee.** At observed renewal-commission rates the rule gives ₹10, not ₹15 (see claim 3).
- **"Per renewal premium" for life is ambiguous.** PB reports monthly-mode plans rising from 11% to 34% of new life policies (FY24 to FY26, AR FY26). The model prices one annual renewal and one annual commission.
  - A per-instalment fee would multiply revenue and buyer cost for modal policies.
- **The Gabor-Granger life ladder is centred on ₹20** while the card says ₹15. This is minor.

### 5. AI vs the buyer's own desk depends on desk productivity: confirmed

- All figures reproduce:
  - talk-method desk cost p50 ₹2.0-6.0k per 1,000 due;
  - VP launch cost ₹7.0-11.0k;
  - P(AI cheaper) 0.000 / 0.034 / 0.013 / 0.021;
  - seat-method desk cost ₹5.4-12.8k;
  - P(AI cheaper) 0.94 / 0.87 / 0.655 / 0.15;
  - implied due worked per seat under the talk method: 6.5k-19.6k a month.
- The claim is correctly hedged at low confidence, and the package itself flags the talk method as implausible.
- Minor points:
  - The model's desk ₹/min is tri(6.0, 7.5, 11.0), so it reaches ₹11, above "l2v ₹6-9".
  - 4W's P is 0.034, which is not ≤ 0.03.
  - The 4,800 talk-min/seat-month basis (200/day) is at the top of l3's 90-210 min/day range. At 150/day the talk method implies 4.9k-14.7k due per seat, still implausible.
- The seat method rests on two assumptions: `due_per_seat` (800/1,500/3,000) and seat cost (₹20/28/40k, from l3 LOADED). Both are as described.

### 6. KC1 bridge: confirmed (computed; every input is an assumption)

- These reproduce exactly:
  - seat-method 3-seat desk: 6,803 / 6,790 / 6,766 / 16,014 due a month;
  - mid broker: ₹24,068/month, trough ₹19,653;
  - 150-due agency: ₹2,103;
  - mixed book: ₹16.05k per 1,000 due.
- ₹1.1-1.5 lakh at ₹16.05 per due needs 6,850-9,350 due, matching "about 7,000-9,000".
- Caveats:
  - The ₹ per 1,000 due depends on the line mix: 2W-only ₹9.4k, health-only ₹11.6k, life-only ₹11.1k, 4W-only ₹29.5k. The due needed for ₹1.1-1.5L therefore ranges from about 3,700 to 16,000.
  - Under the card's ₹15k minimum, the 150-due agency would pay ₹15k, not ₹2.1k (see claim 4).

### 7. IRDAI Handbook FY25 channel data: confirmed, with one correction

- I re-read Part V myself and every share matches:
  - T103 motor OD + TP, brokers ₹23,202.10 + ₹25,849.68 = ₹49,051.78 Cr of ₹99,093.45 Cr = 49.50%;
  - T104 individual health, brokers 3,288,653 / 25,184,542 = 13.06%; individual agents 65.94%;
  - T99 life individual new business, brokers 1,040,922 / 27,021,910 = 3.85%; agents 72.59%;
  - IMF output: 59,809 health and 33,915 life policies.
- **Correction: the IMF count.**
  - "940 IMFs" is the IRDAI register count read on 2026-10-17 (l3). Handbook **T98 gives 799 IMFs as on 31 March 2025**, the right denominator for FY25 output.
  - FY25 output per IMF is therefore about **75 health and 42 life policies**, not 64 and 36.
  - The conclusion is unchanged: IMFs are tiny renewal books, and a 3-4 firm test stratum is right.

### 8. Policybazaar health persistency: confirmed, with one wording correction

- I re-opened the investor presentation (2026-05-11, slide 39). Health renewal persistency by number of policies:

  | measure | FY23 | FY24 | FY25 | FY26 | JFM'26 |
  |---|---|---|---|---|---|
  | overall | 79 | 83 | 85 | 87 | 88.9 |
  | R1 (first renewal) | 71 | 76 | 82 | 85 | 86.6 |
  | R2 (second renewal) | 84 | 88 | 88 | 90 | 90.9 |

- AR FY26 agrees: "Health persistency (NOP basis) … 87% … 85% at first renewal and 90% at second renewal".
- The Q1 FY27 transcript confirms the policy-count basis against "whatever base is due for renewal".
- Star Health's basis is confirmed as premium. Its Q4 FY25 presentation reports a "Retail Health Renewal Premium Ratio (without 1/n on GWP)" of 95% / 98.4% / 97% for FY23 / FY24 / FY25 (read through a search snippet of the NSE filing).
- **Correction:** first-renewal leakage is **13.4-15%** (JFM'26 / FY26). The 11% is *overall*-book leakage (JFM'26 88.9%).
- Caveat: these are PB's own unaudited disclosures.

---

## Items for the main loop

1. Re-run `renewal_model.py` with scale COGS ₹2.84/3.70; CORRECTIONS-round2 §8.1 already flags this. Restate the scale numbers from that run.
2. Replace the life commission triangle with observed renewal-commission ratios (private 1-3.2%, LIC 5.1%). Then re-derive the life price, or drop life from the launch card.
3. Settle who pays for human escalations before quoting any launch GM. It moves launch GM by 7-21 points on the per-renewal card and by 26-39 points under per-minute pricing.
4. Define "renewal collected": all renewals on the list, or only those after the first AI attempt. It moves health and life GM by 23-28 points.
5. State that the ₹15k minimum excludes buyers below about 1,000 due a month. Replace "holdout reported quarterly" with a holdout duration per buyer size from `renewal-mde.csv`, or pool the holdout across buyers.

## Sources re-opened by the verifier (2026-10-17)

- IRDAI Handbook on Indian Insurance Statistics 2024-25, Part V xlsx, Tables 98, 99, 103, 104 (round-1 download, sha256 c4c77d51dc6dbec9be0b2786303525f343d88e9b8d6334a887d14b47b53693e2). Read-primary.
- https://www.pbfintech.in/pdf/investor-presentation-11052026-pbfl.pdf (slides 16 and 39). Read-primary company disclosure.
- https://www.pbfintech.in/pdf/annual-report-fy26-pbfintech.pdf (health and life persistency; monthly-mode share). Read-primary company disclosure.
- https://www.pbfintech.in/pdf/transcript-q1fy27.pdf (renewal measured by number of policies). Read-primary transcript.
- https://cafemutual.com/news/insurance/38077-who-are-the-top-pay-masters-in-first-year-renewal-and-single-premium-policies (FY26 renewal commission ratios; 2026-06-28). Read-secondary analysis of public disclosures.
- https://cafemutual.com/news/insurance/36617-which-life-insurers-paid-the-highest-commission-on-first-year-renewal-and-single-premium-policies (H1 FY26; 2025-12-31). Read-secondary.
- Business Standard on post-GST commission cuts (2025-10-01 and 2025-10-03). Both pages returned 403; read through search snippets only, so low confidence.
  - https://www.business-standard.com/finance/insurance/icici-lombard-care-health-aditya-birla-cut-commissions-post-gst-125100101265_1.html
  - https://www.business-standard.com/amp/finance/insurance/life-insurers-cut-agents-slice-to-give-customers-the-full-gst-pie-125100300965_1.html
- https://nsearchives.nseindia.com/corporate/STARHEALTH_29042025194646_PresentationQ4FY2025.pdf (renewal premium ratio basis). Read through a search snippet only.
- https://www.theweek.in/news/biz-tech/2022/05/26/govt-hikes-third-party-vehicle-insurance-premiums.amp.html (2022 TP tariff; car >1,500cc ₹7,890). Read-secondary.
- `lanes/l3-segments/value-gate.csv`, `lanes/CORRECTIONS-round2.md` §8, `lanes/l2-economics/cost-model.json` (regenerated 19:03: A 5.00/5.88/6.96; B 2.84/3.23/3.70).
