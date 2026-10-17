# Listener panel v2: pre-registered predictions

**Written 2026-10-17 (Saturday), before any round-2 audio was rendered and before any listener was recruited.**
Package `r2-listener-panel` (critic item A13). The protocol is `protocol.md` v2.0. The decision code is `analysis.py`:
its constants are the pre-registration, and the verdict is whatever it prints on the frozen files.

The project-wide register is `../predictions.md`. Its existing text is not edited; the panel's predictions live here
instead. Each prediction below is scored after the main panel, in the `outcome` column, and wrong predictions stay.

Probabilities are the researcher's prior that the stated outcome occurs. They were written without listener data:
none exists. They are informed by:
- round-1 desk evidence;
- the l8 number-reading probe: neural voices misread 0/80 Indian-format numbers, generative voices 3/99;
- the fraud evidence in `../lanes/r2-untouched-raw/trust-fraud-evidence.csv`;
- the round-1 power model, which assumed 85% comprehension.

---

## 1. What changed from v1, and why the predictions are new

v1 asked one question: do Hindi-belt, Tamil and Marathi listeners prefer their own register? Only 1 of its 6 turns was
a renewal (critic A13).

v2 asks what the beachhead needs:
- Can an **older (60+) policy-holder** understand our renewal call on a phone line?
- Does slowing down help?
- Is the more expensive HD voice worth its latency?
- Does a fraud-safety line make the payment-link hand-off more trustworthy?
- How far are we from a human, and from competitors' voices?

Language and dialect matching are kept as secondary arms, on the same renewal turns.

All 8 rated turns (R1-R8) are renewal calls:

| turn | line | content |
|---|---|---|
| R1 | health | opening with AI disclosure, due date |
| R2 | health | premium and sum insured, a confirmation question |
| R3 | 4W motor | vehicle-number digits, expiry, premium with NCB |
| R4 | 2W motor | policy already expired, premium if renewed today |
| R5 | life | lapse revival: missed instalment, amount, late fee |
| R6 | life | revival deadline, advisor callback time |
| R7 | health | payment-link hand-off on WhatsApp; a safety-line variant exists |
| R8 | life | number-confirmation read-back: instalment, date, phone-number digits |

## 2. Design facts the predictions refer to

The protocol gives the details. These facts are fixed now, and may change only through section 6.

- **Panels.**
  - `hindi_60plus`: Hindi mother tongue, aged 60+. **48 analysed**, 56 recruited.
  - `hindi_18to59`: Hindi mother tongue, aged 18-59, at least 12 aged 45-59. **36 analysed**, 42 recruited.
  - `tamilnadu`, 36 analysed; `maharashtra`, 36 analysed; each with at least 30% aged 60+.
  - Optional, run only after the primary panels: `bihar` (30) and `outgroup` (24).
- **Voices.** All are Azure.
  - Neural: hi-IN Swara (F) and Madhur (M), the product voices of the only latency configuration that met the 1.5 s
    bar in round 2.
  - HD: en-IN Meera and Arjun DragonHD, rate-matched to the neural voice of the same gender, so the tier contrast
    compares voice quality at equal pace.
  - Tamil: native ta-IN Pallavi and Valluvar.
  - Marathi: native mr-IN Aarohi and Manohar, plus the multilingual en-IN AartiIndic and ArjunIndic.
- **Pace.** "Slow" is the same voice at 0.85 times its default speed (SSML prosody).
- **Channel.** Every Block B clip and three quarters of Block A pairs play phone band (300-3,400 Hz, 8 kHz G.711
  μ-law).
- **Blocks.**
  - **Block B, single calls, first hearing.** Each listener hears all 8 turns once. In the hindi panels the cells are:
    neural default ×3, neural slow ×3, HD default ×1, and X ×1. X is the human reference once it exists; until then it
    is HD slow.
  - **Block A, pairs.** HD vs neural ×4; slow vs default ×3; safety line vs plain ×2 (question: "Which caller would
    you trust more to send you a payment link?"). When those arms exist, add human vs ours ×2 and competitor vs ours ×3.
- **Comprehension.** Two 4-option questions per card, with near-miss distractors, answered on first hearing only.

## 3. Confirmatory family (Holm-adjusted across these four, one-sided, family alpha 0.05)

| id | hypothesis | panel | rule in `analysis.py` | prior: outcome probabilities | what the result changes |
|---|---|---|---|---|---|
| **E1** | Older listeners understand the product-default renewal call: per-question comprehension on neural default-pace clips ≥ 0.80 | hindi_60plus | **PASS** if point ≥ 0.80 and clustering-adjusted lower bound > 0.70; **FAIL** if adjusted upper bound < 0.80; else INCONCLUSIVE | PASS 0.40, INCONCLUSIVE 0.40, FAIL 0.20. Point prior: 0.78 (90% interval 0.65-0.88) | FAIL: number confirmation must change before any pilot (slower read-back, repetition, a WhatsApp written confirmation sent before the amount is spoken). It becomes a product requirement under SYNTHESIS kill criterion 6 ("our quality fails") |
| **E2** | Slowing to 0.85× improves older listeners' comprehension | hindi_60plus | **PASS** if the one-sided 95% lower bound of (slow − default), within listener, is > 0 | PASS 0.30. Point prior: +4 points (90% interval −3 to +12) | PASS, plus P5 not failing: ship age-adaptive pace (slow when the CRM age is 60+ or on request). Otherwise keep one pace |
| **T1** | Listeners prefer the HD voice to the neural voice at equal pace | hindi panels pooled | the preference rule: **PREFERRED** if adjusted lower bound > 0.50 and p ≥ 0.58; **NOT_PREFERRED** if upper bound < 0.58 | PREFERRED 0.40, NOT_PREFERRED 0.35, INCONCLUSIVE 0.25. Point prior p(HD) 0.57 | PREFERRED: HD's extra first-byte time (about +90-200 ms service-side, l8 and r2) is worth testing in the cascade. Otherwise ship neural, which is cheaper and faster |
| **S1** | The fraud-safety line makes the payment-link hand-off more trustworthy | hindi panels pooled | preference rule on the safety-vs-plain pairs | PREFERRED 0.65, NOT_PREFERRED 0.15, INCONCLUSIVE 0.20. Point prior p(safety) 0.66 | PREFERRED: the line goes into every payment-link turn. NOT_PREFERRED: drop it (it costs about 2-3 s) |

## 4. Secondary predictions (intervals reported; they never decide alone)

| id | prediction | prior | note |
|---|---|---|---|
| E1b | hindi_18to59 comprehension floor (same rule as E1) is PASS | 0.75 | point prior 0.86 |
| E1c | The 60+ minus 18-59 comprehension gap on neural default is at least 5 points | 0.60 | descriptive, with interval |
| E3 | 60+ listeners prefer slow in the pace pairs (PREFERRED) | 0.30 | point prior p(slow) 0.55; NOT_PREFERRED 0.30 |
| E4 | 18-59 listeners prefer default pace over slow (p(slow) < 0.5) | 0.65 | |
| P5 | Slow pace is not rated more patronising than default in 60+ (non-inferiority, margin 0.5 on 7 points): PASS | 0.70 | also reported for 18-59 (PASS 0.60) |
| T2 | HD minus neural naturalness (Block B, 5-point ACR) is greater than 0 | 0.60 | point prior +0.2 |
| S2 | Safety line preferred more strongly at 60+ than at 18-59 | 0.55 | descriptive |
| F1 | Mean "this call could be a fraud" (1-7) on the payment-link turn among 60+ is 4.0 or higher | 0.45 | the scam-suspicion item is new in v2 |
| F2 | Within listener, fraud suspicion lowers "would continue" (repeated-measures r ≤ −0.3) | 0.60 | |
| F3 | Fraud suspicion is higher on R5/R7 (money asked) than on R1/R6 (no money asked) | 0.65 | descriptive |
| H1 | (if the human arm runs) Listeners prefer the human reading to ours: p(ours) upper bound < 0.5 | 0.70 | point prior p(ours) 0.33 |
| H2 | (if the human arm runs) Block C AUC for telling TTS from human: adjusted lower bound > 0.6 | 0.75 | point prior 0.75 |
| H3 | (if the human arm runs) Our comprehension is within 10 points of the human reading's, among 60+ (non-inferiority PASS) | 0.45 | few human items per listener, so expect INCONCLUSIVE |
| K1 | (if the competitor arm runs) Ours vs the best Indian competitor voice: the competitor is preferred (upper bound of p(ours) < 0.5 and p ≤ 0.42) | 0.35 | ours preferred 0.20; parity or inconclusive 0.45 |
| K2 | (if the competitor arm runs) Some competitor clip fails the automatic number check | 0.40 | competitor clips are kept as captured and flagged |
| L1 | Tamil Nadu: Tamil-English mix preferred to neutral Hinglish (PREFERRED) | 0.85 | v1's P2 |
| L2 | Tamil Nadu: Tamil-English mix preferred to Indian English (PREFERRED) | 0.45 | |
| L3 | Tamil Nadu: native ta-IN voice preferred to multilingual HD on the same Tamil text | 0.50 | producibility: which voice to ship |
| L4 | Maharashtra: Marathi mix preferred to neutral Hinglish (PREFERRED) | 0.60 | |
| L5 | Language-matching preference is stronger at 60+ than under 60 (Tamil Nadu and Maharashtra) | 0.60 | descriptive |
| D1 | (optional panel) Bihar: Bhojpuri mix PREFERRED | 0.30 | NOT_PREFERRED 0.40; H6 dialect stays deferred whatever happens |
| D2 | (optional panel) Out-group trusts the Bhojpuri mix less than neutral Hinglish | 0.50 | |
| Q1 | At least 1 of the 4 main panels misses the 60+ quota in the first week of fielding | 0.60 | recruitment risk, not an effect |
| Q2 | Median 60+ session length is over 25 minutes in the pilot | 0.55 | above 30 minutes triggers the cut in protocol 9 |

## 5. How each outcome feeds the decision

- **E1 and E2 are the wedge's comprehension gate.** The beachhead is renewal calls to (often older) retail
  policy-holders.
  - E1 FAIL, or E1 INCONCLUSIVE with a point estimate below 0.75, means the number-confirmation design is not ready.
    That design is SYNTHESIS §4's read-back of "premiums, dates and policy numbers".
  - Fix it before the concierge pilot.
- **T1 informs the latency trade.** The round-2 India cascade met the 1.5 s latency bar with a neural voice (Swara).
  HD would add time.
- **S1 tests one cheap answer to the ops-head objection** that customers think renewal calls with payment links are
  scams (CRITIC §6 item 3).
- **The human and competitor arms are the brief's §6 proof** ("a blind listener panel ... rating our demo against
  competitors"). Without them the panel is a screen of our own variants only, and the report must say so.
- **None of this is an outcome test.** Renewal conversion is tested only in the consented, holdout-controlled pilot
  (SYNTHESIS kill criterion 7).

## 6. Amendment rules (before the freeze)

- Any change to the constants, the sample sizes, the cells or the rules is entered below with a date and a reason.
  This must happen **before** the first main-panel listener.
- Allowed reasons:
  - the pilot (session length, misunderstood questions, SDs);
  - the automatic or human clip QA;
  - the arrival of the human or competitor clips.
- The priors above are never edited after they are written. A changed belief is added as a new dated line.
- **Freeze.** Before the first main-panel listener, run
  `sha256sum protocol.md analysis.py build_plan.py app.js index.html plans/*.js stimuli-qa.csv ../lanes/l8-azure-bench/stimuli-round2/manifest.csv`
  and paste the output into section 8.

## 7. Amendments

All amendments below were made on 2026-10-17, after the predictions were written (sha256 of the file as written:
`7a56dc575f96fbf8e77d9e63e3c61710a329c13f6ab8c32fbac7b2dd5984970e`, 20:18 UTC) and before any recruitment. None
changes a prior or a decision rule.

| date | change | reason |
|---|---|---|
| 2026-10-17 | Tamil Nadu HD voices (Meera, Arjun) speak all three registers at their own default rate, not the hindi set's rate-matched rate. Their neutral-Hinglish clips are therefore rendered separately for the Tamil Nadu set and not shared with the hindi set | Automatic QA: rate-matched (−25%/−32%) Tamil and English clips ran 15-17 s. The register contrast is within voice, so one rate per voice is what matters. The T1 tier contrast (hindi set) keeps rate matching |
| 2026-10-17 | Tamil-English R3 text: "4 7 2 9" → "4, 7, 2, 9" | Automatic QA: the ta-IN normaliser read the spaced digits plus the following date as "47 September 2,928" in 4/4 voices; commas fixed it in a probe |
| 2026-10-17 | Two HD clips (Meera R4 and Meera R3, Tamil Nadu set) re-rendered once after first-render number misreads; the passing render is used; both attempts are logged | Automatic QA. Reported as an HD reliability cost (2/102 vs neural 0/50); K2 and T1 are unaffected |
| 2026-10-17 | Pilot: 4 listeners per main panel (16), at least 2 of the 60+ pilots in assisted kiosk mode | Older-listener procedures (protocol 2.4) |
| 2026-10-17 | Pre-registered pilot cut: if the 60+ median session exceeds 30 minutes, tier pairs drop from 4 to 3 and pace pairs from 3 to 2 | Session length with both external arms is about 28-30 min |
| 2026-10-17 | Competitor pairs always play phone band, never wideband | Harness captures are 16 kHz WebRTC; at phone band the bandwidth difference disappears |
| 2026-10-17 | Power run (`power-v2.md`, 500 simulations per cell): E1 PASS 0.70 / FAIL 0.02 at a true 0.85; at a true 0.80 mostly INCONCLUSIVE. E2 PASS 0.75 at +8 points. T1 PREFERRED 0.93 at p = 0.65. Sample sizes unchanged | Recorded so the "INCONCLUSIVE" outcomes in section 3 are read correctly |

## 8. Freeze hashes

Not frozen. To be filled before the first main-panel listener.

## 9. Scoring (after the main panel)

| id | outcome (verdict and estimate from `analysis.py`) | prediction held? |
|---|---|---|
| E1 | | |
| E2 | | |
| T1 | | |
| S1 | | |
