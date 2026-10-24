# VP research synthesis v2: the wedge decision after round 2

Date: 2026-10-17 (Saturday). Author: round-2 synthesis lead. Founder discovery interviews start Monday 2026-10-19.

**What this document is.** The decision after round 2. `SYNTHESIS.md` (round 1) stays untouched as history; §13 lists
exactly which of its sections and lines this version supersedes.

**Inputs read.**
- Round 1: `SYNTHESIS.md`, `CRITIC.md`, `vp-research-brief.md`, `predictions.md`, every `lanes/*/verify.md`.
- Round 2 packages and their verifiers:
  - regulation: `lanes/l1-regulation/round2/` (`verify.md`, `sources.csv`, `usecase-map-insurance.csv`);
  - renewal economics: `lanes/l2-economics/round2/` (`verify.md`, model, CSVs);
  - India latency: `lanes/l8-azure-bench/round2/` (`verify.md`, results);
  - competition: `lanes/l4b-measured/round2/` (measurements, `competition-intermediary.csv`, IRDAI consultation excerpts);
  - model corrections: `lanes/CORRECTIONS-round2.md`;
  - untouched raw material: `lanes/r2-untouched-raw/`;
  - `founder-kit/` and `listener-panel/` (round-2 versions).
- The harness refused every package's `findings.md`, so their write-ups exist only in the workflow digest. Where this
  document relies on a package's own summary rather than a file on disk, it says so.

**How to read the tags.** `[REG-20]`-style ids point to `ledger.json` / `ledger.md`, which hold the source URL, date,
method, n, confidence and verifier verdict of each claim. `[l2v]`-style tags are round-1 lanes and verifiers, as in
round 1. `[calc]` is arithmetic done here. "Assumption" marks a modelled input nobody observed.

**Limits that still apply to everything below.**
- No buyer has been interviewed, no listener has rated a clip, and no competitor has been configured with our renewal spec.
- Every caller in every measurement was a synthetic Azure voice. No call has crossed an Indian telephone network.
- Three round-2 packages (competition, untouched raw, founder kit) and the listener panel had no adversarial verifier.

---

## 0. The answer

**The beachhead holds, narrowed. It does not swap with an alternate.** It changes in four ways: who VP sells to, which
lines it prices, how VP operates, and how it is priced.

**Beachhead v2: renewal service calls for retail insurance intermediaries, starting with private-car (4W) motor and
health.**
- **Buyers first:** small and mid retail brokers and non-bank corporate agents with roughly 1,000 or more due renewals a
  month, plus the renewal books of large brokers and PoSP platforms.
- **IMFs:** interviewed, but not offered a pilot until counsel answers [REG-29].
- **Operating model:** VP is **software the intermediary operates on its own 1600 number** [REG-20]. It is not a managed
  telemarketer or the sender [REG-27, REG-28].
- **The call: inform, confirm, hand off.**
  - Inform: the due date and the insurer's renewal premium as held in the data.
  - Confirm: amount, date and intent, read back.
  - Hand off: a WhatsApp utility payment link, and any re-quote, objection or persuasion to a certified human [REG-26,
    REG-35].
- **Price:** per renewal collected. ₹50 per car and ₹15 per health renewal, with a ₹15k monthly minimum credited against
  usage and a 10% holdout that is never billed [FK-05].
- **Life and two-wheeler** are tested for willingness to pay but not sold at launch: life fails at observed private
  renewal commission, and two-wheeler fails at launch cost [REN-09, REN-10].

**What changed from round 1, in one list.**
1. **The 1600 question is closed.** IRDAI's own circular makes 1600 mandatory for all insurance intermediaries from
   2026-02-15, whatever the consent [REG-20]. Numbers are obtainable in principle, in about 7-14 business days. No price
   is published, and no provider documents AI audio streaming on 1600 [REG-22..25].
2. **Persuading a renewal is regulated solicitation**, at medium confidence: it is in IRDAI's PPHI definitions [REG-26].
   In the telemarketing channel only certified humans with insurer-approved scripts may solicit [REG-27], and IMFs may not
   use telemarketers at all [REG-29]. The wedge rule tightens from "never promote" to "inform, confirm, hand off".
3. **Data location now binds the beachhead.** Intermediary records, including renewal and call records, must be held in
   India for at least 10 years [REG-31].
4. **Per-minute pricing is dead at launch in every line** (gross margin −47% to +1% at ₹6-8 a minute) [REN-06].
   Per-renewal pricing works robustly only for car, and for health under one billing definition [REN-07, REN-08].
5. **Competition is not thin at this job.** At least 10 Indian voice-AI offers sell insurance renewal calling, and
   insurers automate renewals themselves [CMP-13, CMP-17]. What is unoffered is narrow: a managed, per-renewal service for
   small and mid intermediaries. "Thinner competition" is dropped as a tie-breaker.
6. **IRDAI has proposed capping renewal commission** (comments due Sun 2026-10-25). Under the caps, value per save falls
   to 0.33-0.49 of the modelled value [REN-24, REN-25]. That is a dated new risk to the whole beachhead.
7. **Our own latency is now inside the bar server-side from India:** clean-turn p50 1.0 s [LAT-02]. But every
   configuration fails the turn-taking parts of kill criterion 6 (collisions 18-50% against ≤ 5%) [LAT-05]. The binding
   problem is turn-taking, not speed.
8. **The pool at the price card is ₹107 Cr a year** (₹58 Cr excluding the big platforms) [SEG-12]. A venture-scale path
   exists only through other BFSI service calls (₹166 Cr) and then non-BFSI post-sales (₹1,980 Cr, the weakest evidence).

**Why not swap.** Real estate (alternate 1) still ties on the scorecard once the added criterion is removed [SEG-02].
But round 2 did not research it, and it carries its own known problems: record-owning incumbents, pre-sales 140-series
and DND rules, AI not cheaper per minute, and value per visit taken from vendor blogs. Swapping now would trade a
beachhead whose problems are measured and designable for one whose problems are unmeasured, two days before an interview
programme built for insurance. The switch rules in §1.4 say exactly what interview evidence moves the decision, and when.

**Confidence: moderate to low**, unchanged in level but better founded. The gates are:
- the interviews (kill criteria 1-3, by about Fri 2026-11-13);
- counsel (kill criteria 5 and 8, answer requested by about Fri 2026-11-13);
- a turn-taking redesign tested on an Indian handset (kill criterion 6, by about Fri 2026-11-06);
- the fate of IRDAI's commission proposal (kill criterion 9).

---

## 1. The decision and why

### 1.1 Beachhead, round 1 against round 2

| dimension | round 1 (`SYNTHESIS.md` §1) | **round 2 decision** | main evidence |
|---|---|---|---|
| Industry | Retail insurance distribution: IMFs, retail brokers, non-bank CAs, PoSP platforms | **Same industry; buyer order changed.** First: small/mid retail brokers (A) and non-bank CAs (B) with ≥ ~1,000 due a month, plus large brokers and platforms (D). IMFs (C) interview-only | IMFs average ~75 health and ~42 life policies a year [REN-17]; IMF reg 3(d) [REG-29]; brokers hold 49.5% of motor premium [REN-16]; the ₹15k minimum exceeds usage below ~935 due a month [REN-12] |
| Lines | Motor, health, life renewals; lapse revival | **4W motor first, health second.** Life (including lapse revival) and 2W as willingness-to-pay probes only | 4W robust at ₹50 [REN-07]; health ₹15 is margin-thin [REN-08]; life fails at observed commission [REN-09]; 2W fails at launch [REN-10] |
| Call content | Service only; no promotion or cross-sell | **Inform, confirm, hand off.** No persuasion, no re-quote, no alternative plan or insurer; a code gate on solicitation drift | Solicitation includes "to renew" in PPHI Part A (medium confidence) [REG-26]; AV-only solicitation [REG-27]; re-quote = promotional [REG-35] |
| Operating model | A managed, compliance-carrying renewal caller | **Software the intermediary operates on its own 1600 number**, with numbers, DLT registration and records in the tenant's name. VP is processor, not sender or telemarketer | Telemarketer regime survives [REG-28]; brokers' core functions are not outsourceable [REG-30]; CPaaS is liable as sender [REG-12] |
| Number path | Unknown whether 1600 covers intermediaries | **1600 is mandatory**; obtainable in principle via 8 access providers or Plivo/Vobiz; price and streaming unconfirmed | [REG-20..25] |
| Data location | Not a beachhead issue | **Records in India for ≥ 10 years**; default to India-resident processing | [REG-31]; the fastest path is India-processed anyway [LAT-02, LAT-07] |
| Pricing unit | Per renewal collected, at an effective ₹6-8 per AI minute | **Per renewal collected, priced per line**: ₹50 car, ₹15 health (₹19 if only renewals after the first call are billable); ₹15k minimum credited; 10% holdout never billed, reported per line only once powered | [REN-06..13, FK-05] |
| Revenue per buyer | ~₹1.1-1.5 lakh a month for a median modelled buyer | **₹24k a month for a 1,500-due mixed broker** (p50); ₹1.1-1.5 lakh needs ~7,000-9,000 due a month on a mixed book | [REN-14] |
| Pool | ~₹76-96 Cr a year | **₹107 Cr a year at the card (₹58 Cr excluding big platforms)** | [SEG-12] |

### 1.2 Evidence chain v2

1. **Regulation permits the call, on a narrow path.**
   - A neutral renewal reminder is a TRAI service call [REG-35]. For IRDAI entities it must come from 1600, "irrespective
     of explicit or inferred customer consent" [REG-20].
   - 1600 numbers cannot be flagged as spam by operators or tagged by caller-ID apps [RAW-03]. CNAP from 2026-11-01 can
     show a verified business name [RAW-08].
   - **But** persuasion is solicitation (medium confidence) [REG-26]. All AI calls are A2P and must be pre-declared, from
     2026-11-18 on a strict reading [RAW-01, REG-36]. IMFs cannot use telemarketers [REG-29].
   - This is a designable path, not a free one. Every remaining question is in the lawyer brief (§3.7).
2. **Pain exists at the buyer, on desk evidence, line by line.**
   - **Health:** Policybazaar, probably the best-run intermediary, still loses 13.4-15% at first renewal by policy count
     (overall persistency 87-88.9%) [REN-18]. That is below the 97% no-call break-even [FK-03]. Star Health's 95-98% is a
     premium ratio, not a policy count [REN-19].
   - **Motor:** about 56% of registered vehicles are uninsured [REN-20]. That is a stock measure, not a renewal ratio by
     insurer; those ratios are undisclosed and the disclosure pages are blocked.
   - **Life:** LIC's 64.1% 13th-month persistency is the wrong buyer and line [REN-21].
   - Value to the intermediary of one saved renewal (p50): 2W ₹265, 4W ₹2,415, health ₹2,737, life ₹1,941 (about ₹1,040
     at observed private commission) [REN-01, REN-02].
   - Pain at the actual buyer is still unmeasured. Kill criterion 3 tests it.
3. **The scorecard no longer breaks the tie.** With `post_sales_share` at 0, insurance and real estate tie at 3.722
   (P(top1) 0.46 against 0.48) [SEG-02]. Insurance is #3 on S1 [SEG-03]. Of round 1's three tie-breakers:
   - "thinner competition" is refuted at the job level [CMP-13];
   - "lower regulatory risk" is now known risk with a design (item 1), plus the new commission proposal (item 8);
   - "an enumerable buyer list" survives [SEG-06, FK-01].
   Two new reasons favour insurance. Its economics are now modelled per outcome with a concrete card [REN-07]. The
   interview kit is stratified and ready for Monday [FK-01]. Real estate has neither.
4. **The pool is small, so the beachhead is a door, not a market.** S0 is ₹107 Cr a year at the price card, ₹58 Cr
   without the platforms that run renewals in house [SEG-12]. The path beyond it is sized in §7.
5. **Competition is real at the job, thin only in one narrow, unverified sense** (§6) [CMP-13..17].
6. **Distribution is founder-led and paperwork-gated.** The earliest live pilot call is about 2026-11-24 to 2026-12-03:
   counsel by about Fri 2026-11-13, then 7-14 business days of 1600 provisioning [REG-23; calc]. See
   `notes-H5-H7-H10.md`, H10.
7. **Learning stays scoped.** Holdouts detect lift in months for motor, in years for health and life, at a 1,500-due
   broker [REN-13]. See `notes-H5-H7-H10.md`, H7.
8. **The call class favours AI only in the right lines and units.**
   - Per-renewal fees equal ₹10-23 per AI minute [REN-07].
   - Whether AI beats the buyer's own desk depends on desk productivity, which nobody has measured (P 0.00-0.94
     depending on the costing method) [REN-15].
   - AI-human persuasion parity is an assumption (0.5-1.05).
9. **Quality differences are a design target, not a measured advantage.**
   - Seven homepage demos showed wrong-language replies, cut-ins at a ~2.4 s pause, silence or loops under babble, and one
     agent claiming to be human [CMP-03..11].
   - Our own India-hosted cascade also fails the turn-taking bar [LAT-05].
   - "Policyholders skew older and Hindi-belt" is still unsourced, and is relabelled an assumption [HUM-11].
10. **Payments support the use case, but the call has the shape of a known scam.**
    - RBI allows autopay up to ₹1 lakh without additional authentication for insurance premiums [REG-15].
    - Fake renewal and "lapsed, pay to revive" calls are documented [RAW-09..11]. Trust design is therefore product scope:
      1600 plus the CNAP business name, a verifiable callback, no cold payment links, and the listener panel's S1 test.

### 1.3 Why the alternates did not overtake

| | insurance renewals (beachhead) | real estate (alternate 1) | BFSI pre-due reminders (alternate 2) |
|---|---|---|---|
| Scorecard V1 / S1 | 1= / #3 [SEG-02, SEG-03] | 1= / #2 | lending #8 / #13 [SEG-02] |
| Researched in round 2? | Yes: regulation, per-renewal economics, competition, latency, fraud, interview kit | No | Only the RBI 2027-01-01 rules re-confirmed [REG-13] |
| Number path | 1600 mandatory; obtainable in principle [REG-20, REG-22] | 140 series; promotional 7-day window from 2026-10-19; DND needs registered consent [REG-09, REG-36] | Lender's 1600; whether an agency or vendor may use it is open |
| Per-outcome economics | Car robust at ₹50 [REN-07] | Not modelled (₹300-500 per qualified visit is an assumption; value from vendor blogs) | Not modelled |
| Competition | ≥ 10 offers at the job [CMP-13] | Record-owning incumbents ship voice (Sell.Do, LSQ Invorto, Agentforce) [l4cv] | ≥ 8 AI incumbents [SEG-10] |
| Dated risk | IRDAI commission caps proposal [REN-24] | DPDP core obligations about 2027-05-13 [REG-05] | RBI conduct rules 2027-01-01 (a trigger, not only a risk) |

Alternate 2 is reframed from "lending collections" to **BFSI 1600 pre-due and EMI service reminders**. The scorecard no
longer supports it (#8 and #13). It stays because it is the beachhead's natural first expansion: the same 1600 plumbing,
the same compliance router, and a dated trigger. It becomes stage S2 in §7.

### 1.4 Switch rules (pre-registered in `founder-kit/scoring.md`; dated)

- **Move within insurance, to the larger strata.** Kill criterion 1 fires on firm count (p̂_firm < 1/3) while the
  volume-weighted share is at least 1/3. The beachhead then becomes large brokers, PoSP platforms and the biggest A/B firms
  [FK-04]. Read at the interim check on Thu 2026-10-29 and finally by about Fri 2026-11-13.
- **Switch to alternate 1 (real estate)** if any of these fire on interview evidence by about 2026-11-13:
  - kill criterion 1 on both firm count and volume;
  - kill criterion 3 (no leakage at the per-line break-even);
  - kill criterion 5 or 8 (no lawful operating model);

  **and** real-estate interviews show that most leads are the developer's own digital inquiries and that developers
  accept ₹300-500 per qualified site visit (RE-K1/K2).
- **Re-price, not switch,** if IRDAI adopts the commission caps as drafted. Re-run the renewal model with the caps and
  re-test kill criterion 9.

---

## 2. Kill criteria: status after round 2

Status key: **not-yet-tested** (no evidence that can decide it yet), **passing** (current evidence clears it),
**at-risk** (current evidence points toward firing), **tripped** (fired as written).

| # | criterion (round-2 form) | status | evidence | decided by, when |
|---|---|---|---|---|
| KC1 | **Too few buyers.** Firm-weighted share of in-scope firms with due renewals a month ≥ 3 × their own due-per-caller (≥ ~6,800 if unknown) is below 1/3 (weights A/B/C 0.21/0.26/0.52; ≥ 3 interviews per stratum). If the volume-weighted share is ≥ 1/3, the beachhead moves to the larger strata | **at-risk** | Stratum C carries 52% of the firm weight, and IMFs average ~75 health and ~42 life policies a year [REN-17]. Desk evidence predicts C fails, and the plan's own prior is 0.65 that most C firms fall below 300 due a month. Brokers carry 49.5% of motor premium, so the volume-weighted reading may pass [REN-16]. Restated from "≥ 3 telecallers" [FK-04, REN-14] | Interviews; interim Thu 2026-10-29, final ~Fri 2026-11-13 |
| KC2 | **Price too low.** Fewer than 3 qualified A/B firms accept a fee at or above their main line's 40%-launch-margin floor (2W ₹29, car ₹28, health ₹14, life ₹17; car ₹35, health ₹19, life ₹24 if only post-first-call renewals are billable). The ₹150-per-save floor is retired | **not-yet-tested** | Desk: the car card (₹50) clears its floor with room against the buyer's ceilings (₹186 against no calling, ₹63-75 against the desk). Health ₹15 sits ₹1 above its floor. Life and 2W fail on desk numbers [REN-07..10, FK-02] | Interviews (Gabor-Granger max) by ~2026-11-13 |
| KC3 | **No leakage.** The firm-weighted majority renews its main line at or above the break-even without calling (2W 63%, car 96%, health 97%, life 93%), or loses no commission on lapses | **not-yet-tested** | Desk leans toward passing: health first-renewal leakage is 13-15% even at Policybazaar [REN-18], and ~56% of vehicles are uninsured [REN-20]. Unknown: whether commission is credited when the customer renews directly with the insurer [REG-34]. Insurers and aggregators compete for the same renewal [CMP-17] | Interviews by ~2026-11-13; counsel on direct renewals |
| KC4 | **Channel fails.** From the first 60 targeted intermediaries, fewer than 10 discovery calls or fewer than 3 paid pilots within 10 weeks | **not-yet-tested** | Outreach starts Mon 2026-10-19. The only measured cold funnel (a different ICP) was 0 wins in 8,784 sends [CMP-26] | Tracker; 10 weeks ends ~2026-12-28 |
| KC5 | **No compliant number path.** Intermediaries cannot obtain 1600 numbers, or no CPaaS will carry 1600 with media streaming into VP's gateway | **at-risk** | Mandatory, confirmed [REG-20]. Obtainable in principle via 8 access providers or Plivo/Vobiz in ~7-14 business days [REG-22, REG-23]. No published price [REG-24]. No provider documents AI streaming on 1600 [REG-25]. Plivo requires a telemarketer registered in Mumbai or Karnataka [REG-22]. TRAI may later exempt small BFSI players [RAW-04] | Telephony quotes by ~Fri 2026-10-30; counsel ~2026-11-13 |
| KC6 | **Our quality fails** on the elderly and Hinglish personas: clean-turn p50 ≤ 1.5 s, collisions ≤ 5%, barge-in handled on ≥ 90%, correct language on ≥ 95% of turns, no loop or drop under babble. Separately, an incumbent **configured with our renewal spec** passing all five at ≤ ₹4-6/min all-in moves the wedge | **at-risk** (the collision clause is tripped by every build tested so far) | Latency clause **passing** server-side from India: config A clean-turn p50 1.00 s, p90 1.1 s [LAT-02]; estimated 1.25-1.45 s at the handset, unmeasured [LAT-13]. Collision clause failing in all 6 configs (18-50%) [LAT-05]. The elderly 2.4 s pause was taken 12/12. A quiet "hmm" was never transcribed (2/60 turns unanswered) [LAT-06]. Language and babble on our stack untested. Incumbent clause untested: homepage demos cannot trip or clear it [CMP-11] | Turn-taking redesign plus handset test by ~Fri 2026-11-06; competitor Mode B weeks 2-3 |
| KC7 | **Concierge pilot underperforms.** The AI cohort's renewal rate is worse than the buyer's human baseline on a consented, holdout-controlled pilot (non-inferiority fails) | **not-yet-tested** | No pilot yet. Holdouts are slow for health and life [REN-13] | Pilot, earliest calls ~2026-11-24 to 2026-12-03 |
| KC8 (new) | **No lawful operating model.** Counsel rules that a neutral software renewal reminder on the intermediary's own 1600 number is itself solicitation or telemarketing needing IRDAI-certified humans, or that VP must register as an IRDAI telemarketer, with no workable route | **not-yet-tested** | Desk reading: a neutral reminder is servicing (Brokers Code of Conduct para 6 obliges the renewal notice) [REG-30]; persuasion is solicitation (medium confidence) [REG-26]; the AV and telemarketer regime survives [REG-27, REG-28] | Counsel ~2026-11-13 |
| KC9 (new) | **Commission compression closes the fee window.** IRDAI adopts caps such that, for buyers with a working desk, no car fee both clears VP's 40% launch-margin floor and stays below the buyer's ceiling against its desk | **at-risk** | Proposal of 2026-09-23, comments due Sun 2026-10-25 [REN-24]. Under the caps the car desk ceiling falls to ~₹27-32 against a ₹28 floor; health, life and 2W fees exceed the desk ceiling [REN-25]. The window against no calling stays (~₹80 for car) | IRDAI's final regulation (date unknown); re-run the model on adoption |
| KC10 (new) | **No India-resident fast model.** Counsel requires India-resident processing, and no India-geography model that the production subscription can deploy meets the latency clause | **at-risk** | The fastest India model is gpt-4.1-mini on a South India Standard deployment (304 ms TTFT) [LAT-07]. Microsoft lists it Deprecated, retiring 2027-04-14, and possibly closed to subscriptions that never deployed it. The only other India-geography Standard model (gpt-4o) retires the same day [LAT-08] | Deployability test on the grant subscription by ~Fri 2026-10-30; re-benchmark by 2027-01-14 |

**Note on kill criterion 6.** The latency verifier proposed relaxing the collision clause to "≤ 10% on mid-turn pauses".
This synthesis does **not** relax it. A relaxation decided after seeing our own numbers would be the post-hoc change
the brief forbids. The clause stays at ≤ 5% until the owner records a reasoned deviation **before** the next test.

---

## 3. Regulatory verdict

### 3.1 1600 numbers: mandatory, obtainable in principle, commercially unconfirmed
- IRDAI's circular of 2026-01-06 is addressed to "All Insurers and Insurance Intermediaries" and requires 1600 for all
  service and transactional calls from 2026-02-15, "irrespective of explicit or inferred customer consent". TRAI's IRDAI
  direction has no carve-out [REG-20, REG-21].
- **A renewal desk that calls from mobiles has been non-compliant since 2026-02-15.** The interview question "what number
  do you call from?" is therefore a compliance probe. Score the answer either as a buying trigger or as evidence the rule
  is not enforced (`kc-answer-sheet.md`).
- **How to obtain numbers.** The intermediary registers on DLT and uploads its IRDAI registration certificate, with one
  NOC per number. Plivo states about 7-14 business days and requires the telemarketer to be registered in Mumbai or
  Karnataka. Vobiz lists LOI, GST, PAN, KYC and DLT IDs [REG-22, REG-23].
- **Not published anywhere:** the price per number, circle or minute, and whether audio streaming to a third-party AI
  works on 1600 lines [REG-24, REG-25]. These are telephony-quote questions (§11).
- **1600 protects the call.** It cannot be spam-flagged or app-tagged [RAW-03]. Calls from personal SIMs at desk volumes
  sit in the slice that TRAI's UCC_Detect flags [RAW-15]. Truecaller's "79% of 1600 calls ignored" comes from an
  interested party with no method and no baseline [RAW-12]. No neutral pickup comparison exists [RAW-13]. Interviews must
  collect buyers' dialler data from before and after migration.
- **CNAP** starts 2026-11-01 on 4G-and-above networks only. A personal SIM shows the caller's own KYC name. A firm's name
  shows only through a verified preferred name. Whether SIP/PRI 1600 calls display a name is unstated [RAW-08].

### 3.2 Solicitation: "inform, confirm, hand off"
- PPHI reg 5(13) (Part A) includes persuading a policyholder "to renew" in solicitation. The intermediary regulations'
  own definitions say purchase only. "Renewal persuasion needs a certified human" is therefore a conservative reading at
  **medium** confidence, not settled text [REG-26].
- In the telemarketing channel only Authorised Verifiers solicit, with insurer-approved scripts, explicit consent, their
  name, IRDAI certificate number, a language choice and a recording notice [REG-27].
- Stating the insurer's renewal premium is information. Offering a different plan, insurer or discount is promotional
  [REG-35].
- **Product rule.** The agent informs, confirms and hands off. A code gate blocks persuasion, alternatives and discounts
  and routes them to a named certified person. The agent never quotes beyond the policy facts in data.

### 3.3 Telemarketer and outsourcing
- The IRDAI telemarketer regime survives the July 2026 amendment. The register's 38 certificates are all stale
  [REG-28].
- Brokers' core functions (advice, quotations, help paying the premium) cannot be outsourced; telemarketing outsourcing
  is allowed only "to the extent of tele-calling" [REG-30].
- **IMFs may not use telemarketers** and may phone-sell only through their own ISPs, with prior IRDAI approval [REG-29].
- **Design consequence.** VP sells software the intermediary operates: its own numbers, DLT registration, scripts,
  records and escalation staff. VP does not act as a managed telemarketer. Whether a managed AI calling service counts
  as outsourcing or as buying technology is a lawyer question.

### 3.4 Data location
- Intermediary records, including renewal-business records, telecaller names and "all phone numbers used for
  solicitation", are kept in India for at least 10 years [REG-31].
- ICT logs are kept 180 days within Indian jurisdiction. No general processing-localisation clause was found, but the
  2026 cyber guidelines' annexure was not retrieved [REG-32].
- **Default:** store recordings, transcripts and call records in India, and process in India where a deployable model
  allows. The India-hosted path is also the fastest [LAT-02, LAT-07]. Whether brief inference outside India is
  acceptable is a lawyer question.
- LIC's RFP shows where large insurers are heading: self-hosted in India, no GPT, Claude or Gemini, no foreign-hosted
  APIs [RAW-05].

### 3.5 Commission
- Rates are set by each insurer's board policy within overall expense caps; product-wise caps were removed in 2023
  [REG-33].
- No rule entitles the intermediary to commission when the customer renews directly with the insurer [REG-34]. This
  defines kill criterion 3's baseline. Interviews and counsel must test it.
- IRDAI's 2026-09-23 consultation proposes IDE caps: health renewal 5%, old-vehicle motor OD 10% and TP 2.5%, life
  renewal 2-3%, with PoSP pay-outs coming out of the IDE's share. Comments are due Sun 2026-10-25 [REN-24].

### 3.6 Dates (strict readings)

| date | event | ledger |
|---|---|---|
| 2026-10-19 | 7-day digital-inquiry window commences (strict reading; affects alternate 1) | REG-36 |
| 2026-10-25 (Sun) | IRDAI distribution consultation comments due | REN-24 |
| 2026-11-01 | CNAP on 4G+ wireless | RAW-08 |
| ~2026-11-08 | 1601 migration (utilities, logistics) | l1 |
| ~2026-11-13 | DPDP Rule 4 (consent managers) | l1 |
| 2026-11-18 | A2P pre-declaration and ₹0.05/min termination charge (1600 exempt from the charge); Gazette date unconfirmed | REG-36, RAW-02 |
| 2027-01-01 | RBI recovery-conduct rules; IRDAI policy tagging to functional identity | REG-13, REG-38 |
| 2027-01-31 | Fresh CoR applications due for existing intermediaries | REG-38 |
| 2027-04-14 | gpt-4.1-mini and gpt-4o (India Standard) retire | LAT-08 |
| ~2027-05-13 | DPDP core obligations | REG-05 |

ACS needs no action: phone numbers are disabled for resources created after the announcement, and India was never
eligible [REG-37].

### 3.7 Lawyer brief, in priority order

The numbers in brackets are the regulation package's question numbers, where the digest gives them.
1. Is a neutral renewal reminder by software, on the intermediary's own 1600 number, "solicitation" under each
   intermediary regulation, and does VP become a "telemarketer"? Does an AI agent count as the intermediary's "digital
   platform"? [Q1-Q3]
2. May an IMF use AI software for neutral renewal reminders at all under reg 3(d)? [Q4]
3. Is a managed AI calling service outsourcing or buying technology? [Q5]
4. Data: may inference run briefly outside India while records stay in India? What does the 2026 cyber annexure say? [Q6]
5. Who earns renewal commission when the customer renews directly with the insurer? [Q8]
6. Must PoSPs and individual agents call from 1600? [Q10]
7. Does reg 4 A2P pre-declaration apply to AI calls on 1600? Do small IRDAI intermediaries fall under the possible
   sender-class exemption? [r2-untouched-raw]
8. From round 1: the recording notice; the DPDP processor contract; whether the IT Rules' synthetic-audio duty applies;
   for alternate 2, whether a vendor-run AI is a recovery agent.

---

## 4. Per-renewal economics and the interview price

### 4.1 What one saved renewal is worth to the buyer

| line | value per save, p50 [p10-p90] | under the proposed IRDAI caps | basis |
|---|---|---|---|
| 2W motor | ₹265 [162-413] | ~₹116 | [REN-01, REN-25] |
| 4W motor | ₹2,415 [1,440-3,881] | ~₹1,060 | same |
| Health | ₹2,737 [1,865-3,848]; probably ~15% lower after the post-GST commission cuts | ~₹915 | [REN-01, REN-04] |
| Life, years 2+ | ₹1,941 modelled; **~₹1,040 [570-1,820] at observed private renewal commission (≤ 3.2%)** | ~₹955 | [REN-02, REN-03] |

Commission rates are anchored on assumptions in every line. Line-level disclosures (NL-6, L-5) were blocked [REN-01].

### 4.2 Pricing results

- **Per-minute pricing loses money at launch in every line**: gross margin −47% to +1% at ₹6-8 a minute. The all-in
  cost is ₹7.9-8.8 per AI minute once VP-borne escalation, WhatsApp and 1600 carriage are added to the ₹5.88 COGS
  [REN-06].
- **Per renewal collected, at launch scale** (100k aggregate minutes a month):

| line | fee | launch GM | if only post-first-call renewals are billed | buyer gains vs no calling / vs own desk | verdict |
|---|---|---|---|---|---|
| 4W | ₹50 | 66.5% | 58% | P 0.99 / 0.60-0.69 | **robust** [REN-07] |
| Health | ₹15 | 45.3% | 22% (₹19 needed) | P 0.99 / 0.64 | **sell, after defining "collected"** [REN-08] |
| Life | ₹15 | 33% | 5% | fails the desk test at observed commission | **probe only** [REN-09] |
| 2W | ₹20 | 12.7% | −11% | P 0.86 / 0.77 | **probe only**, unless the buyer staffs escalations (floor ₹22) [REN-10] |

- **Two definitions move margin most:**
  - which renewals count as "collected": 19-29% of billed renewals arrive before the first AI attempt [REN-11];
  - who staffs escalations: it moves launch GM by 7-21 points on the card.
- **The minimum.** ₹15k is a judgement call. It prices out buyers below ~935 due renewals a month [REN-12].
- **The holdout.** A quarterly report is noise for health and life below ~25k due a month [REN-13]. Report per line only
  once powered, or pool across buyers.
- **Unmeasured, and decisive for "AI beats the desk":** due renewals per telecaller and AI-human persuasion parity
  [REN-15].
- **Stale input.** `renewal_model.py` still uses round-1 scale COGS (₹2.67-3.51, against the corrected 2.84-3.70). Scale
  figures are slightly optimistic until it is re-run; launch figures are unaffected.

### 4.3 The interview price (Monday)

Use the pre-registered card exactly as built in `founder-kit/interview-guide.md` §13. Do not change it on the call.
- **Concept-test card:** ₹50 per car renewal, ₹15 per health renewal, ₹15 per life renewal and ₹20 per bike renewal
  collected on the AI-worked list. ₹15k monthly minimum, credited against usage. 10% holdout, never billed. Quote the
  live monthly bill from the buyer's own due numbers (table A2).
- **Pilot and LOI asks: car and health only**, on the card. Life and bike stay as willingness-to-pay probes. Exceptions:
  life where the buyer's renewal commission is above 3.2%; bike where the buyer's team takes the escalations.
- **Ask both definitions on every call:** billable renewals (all, or only those after the first call) and who takes the
  hand-offs. They switch the floors in `scoring.md` §2.3.
- **Ask the IRDAI-caps question in every insurance interview.** It is optional in the kit; log the change as a deviation
  before the first call. "If health renewal commission were capped at 5% and old-vehicle motor OD at 10%, what happens
  to your renewal desk: cut it, automate it, keep it, or stop chasing renewals?"
- **A wording fix to make before Monday** (owner, in `interview-guide.md` §13.2 caveat 4). Under the caps, the car fee
  stays below the buyer's ceiling against no calling (~₹80) but **above** its ceiling against its own desk (~₹27-32). The
  sentence currently reads as if it stayed below both.

### 4.4 Cost of the stack (corrected model files)

- **Managed Azure COGS:** ₹5.88 a minute at 100k minutes a month (p10-p90 5.00-6.96) [ECO-01], and ₹3.23 at 1M
  (2.84-3.70) [ECO-03].
- **The managed stack never reaches ₹2** [ECO-04]. The only robust path to ₹2 or less is D-lite (6-luna plus self-hosted
  speech): ₹1.19 from about 1.6M minutes a month [ECO-05].
- **Our own stacks at list price.** AI-only cost is ₹1.94-2.74 a minute [ECO-11]; the India cascade is ₹2.29-2.76, about
  two thirds of it STT [ECO-12].
- **Forecast.** On the current regime the managed-stack end-2027 P50 is ₹2.98. ₹1.89 is the optimistic case [ECO-19,
  ECO-20]. GPT-5.2 was the first price rise in the frontier series [ECO-21].
- **₹2 a minute stays a scale-stage COGS target**, not a price and not a launch prerequisite. It is irrelevant to a buyer
  who pays per renewal.

---

## 5. Latency verdict for kill criterion 6

**Verdict: the latency clause is met server-side from inside India. Kill criterion 6 as a whole is at-risk, because
every configuration fails its collision clause. The binding problem is turn-taking, not speed.**

1. **Measured from a Central India VM**, config A: Central India STT at 500 ms segmentation, gpt-4.1-mini on a South
   India Standard deployment, a say-first clause with a ~22 µs code gate, and Central India neural TTS.
   - Clean-turn p50 1,004 ms (CI 989-1,017), p90 1,105 ms, n = 48 clean turns.
   - 58 of 60 turns were answered, all within 1.5 s [LAT-02].
   - Speculation reached 823 ms. Its release matcher accepted truncated transcripts on 3 of 58 turns and passed negation
     flips on 4 of 4 constructed pairs, so it is unsafe as built [LAT-03].
   - Config B (800 ms segmentation, no speculation) also passes server-side: p50 1,348, p90 1,454. It has only ~150 ms of
     headroom for the telephone leg [LAT-04].
2. **What fails.**
   - Collisions on main turns: 18-50% by configuration [LAT-05].
   - Every configuration took the turn in the elderly caller's 2.4 s pause (12/12).
   - A quiet elderly "hmm" was never transcribed [LAT-06].
   - The first clause timed is mostly a one- or two-word acknowledgement. Time to substantive content was not measured.
   - Callers were synthetic Azure voices, measured in one Saturday-night window.
3. **The telephone leg is unmeasured.** The estimated caller-perceived p50 is 1.25-1.45 s for config A [LAT-13].
4. **Round 1's Ohio-through-proxy numbers overstated our latency 2-5x.** Do not plan on them. Voice Live from India
   measured 1.38 s, or 1.18 s in gated text mode [LAT-09].
5. **"India-only costs latency" is reversed for this window.** The India-processed path was the fastest of 11 LLM arms
   (304 ms TTFT) [LAT-07]. Its risk is model lifecycle: gpt-4.1-mini is Legacy or Deprecated and retires 2027-04-14, and
   India has no later-dated Standard chat model [LAT-08]. That is kill criterion 10.
6. **What must happen next.**
   - Design a pause-aware release policy with a negation- and semantics-aware matcher, never string similarity alone.
   - Add a quiet-backchannel detector, or a continuation prompt after about 1.5 s of silence.
   - Run the battery on config A or B over a CPaaS trial number from an Indian handset, in weekday business hours.
   - Blind-score reply quality of gpt-4.1-mini against gpt-6-sol. gpt-6-sol handled the incomplete utterance 12/12 by the
     verifier's reading; gpt-4.1-mini 0/12.

---

## 6. The corrected competitor thesis

**Thesis.** On headline features the platforms are at parity: 10-12 of 12 document campaigns, inbound, transfer,
knowledge base, tools, extraction and analytics [CMP-01].

What we measured is narrower than "incumbents fail". It is the **public homepage demo agents of seven platforms**:
- three US demos in round 1 (Vapi, ElevenLabs, Ultravox);
- in round 2, Sarvam (Indian) plus Smallest, Cartesia and Deepgram (English-only).

Each demo had its own prompt and settings, 8 calls each (Deepgram 2), from a US-East sandbox through a proxy, with
synthetic callers [CMP-02..12]. **No platform was configured with our renewal spec.** The H4 kill test (owner runbook
Mode B) has not run. These are design targets, not proof that the platforms cannot do them.

1. **Language.**
   - Demos relying on automatic detection drifted. Vapi answered in Gujarati on 17/18 turns and in Punjabi to an elderly
     Hindi caller; ElevenLabs answered Hindi callers in English [CMP-03].
   - Sarvam's Hindi-first demo held the caller's language: 38 of 40 Hindi turns, Tamil 20/20. Its ASR understood
     Bhojpuri [CMP-08].
   - Azure continuous language ID read Kathbath Hindi as Marathi; only 14 of 60 clips were labelled correctly [LAT-14].
2. **Turn-taking.**
   - 12 of 13 demo calls cut into the elderly ~2.4 s pause, where many humans would also take the turn [CMP-04].
   - Under babble, Ultravox looped and Sarvam fell silent [CMP-05, CMP-09]. Babble is confounded with dialect at n = 2.
3. **Latency.** Clean-turn p50 ranged from 1.54 s to 3.75 s. Sarvam was 3.12 s from US-East, probably ~0.3 s less from
   India. None met 1.5 s with a call-clustered CI [CMP-02, CMP-06, CMP-10, CMP-11].
4. **Identity honesty.**
   - Sarvam's EMI-reminder persona claimed to be human in 6 of 6 calls where it was asked [CMP-07].
   - Smallest evaded every time; ElevenLabs disclosed 7 of 7 times [CMP-10].
   - It is a vendor prompt, but it shows that "never deny being AI" must be enforced in code and can be shown in the
     pitch.
5. **Number and consent integrity** stays a **design rule, not a claim about competitors.**
   - The fabrication evidence comes from open models, unpinned gpt-4o and one preview voice [LAT-15..17].
   - Azure real-time and fast transcription fabricated on 0/49 non-speech clips.
   - Generative and neural number misreads do not differ significantly (p = 0.25).
6. **Market structure.**
   - **Not thin at the job.** At least 10 Indian offers sell insurance renewal calling, three publish insurer cases, and
     Policybazaar is a Ringg client [CMP-13, CMP-14].
   - **Self-serve starts at ~₹4-10 per connected minute** [CMP-16].
   - **The upstream competitors** are the insurers' own automated renewal outreach and the aggregators' in-house renewal
     at ~80% contribution margin [CMP-17, REN-22].
   - The "+10% renewal ratio" attributed to LeadSquared plus Invorto is a 2018 CRM case with no voice AI [CMP-15].
   - **Thin only in one narrow, vendor-page-only sense:** nobody packages a managed, per-renewal-priced service for small
     and mid intermediaries. That gap may exist because the segment is hard to serve profitably. The ₹15k minimum and IMF
     reg 3(d) point the same way [REN-12, REG-29].
7. **The same gaps are ours.** Our own India cascade cuts in on 18-50% of turns [LAT-05]. "Competence" is what VP must
   build and prove on the battery, not an advantage it holds.

**Kill criterion 6, second sentence (restated):** if any platform at ≤ ₹4-6 a minute all-in, **configured with our
renewal spec**, passes all five sub-criteria, the "demos fail measurably" part of the wedge moves. Homepage demos alone
cannot trip or clear it.

**Gap map, rows that change:**

| gap | evidence now | who is closest |
|---|---|---|
| Indian telephone conversation competence (language lock, elderly endpointing, backchannels, babble, short replies, identity honesty) | As above, on seven homepage demos and on our own cascade [CMP-02..11, LAT-05] | Sarvam on language [CMP-08]; Ultravox on barge-in [l4bv]; configured agents on any platform are unmeasured |
| Renewal calling for insurance intermediaries | ≥ 10 offers at the job; nobody packages a managed per-renewal service for small and mid intermediaries [CMP-13] | Caller.digital and Edesy (renewal pages); Gnani Renewal365 (insurers); LSQ (CRM at Alliance Insurance Brokers) [CMP-13, HUM-12] |
| Compliance as product, now including 1600 onboarding, A2P declaration, solicitation-drift gating and India records | Self-serve platforms leave compliance to the buyer [CMP-27]; the IRDAI layer is new [REG-26..31] | SquadStack (managed enterprise); Exotel (1600 plus DLT onboarding, a vendor claim) [REG-25] |
| Trust design against renewal scams | Fake renewal and lapse-revival calls with correct policy data [RAW-09..11] | Nobody found |
| Spam-flag hygiene | Moot on 1600: no flagging or tagging [RAW-03]. The round-1 hang-up-to-flag rationale is withdrawn [HUM-13] | n/a for the beachhead; still relevant to alternate 1 on 140 |
| Self-serve "try it in your language" demo | Sarvam (anonymous, measured); Arrowhead (anonymous in code, broken by a vendor CORS bug); Vyora; HuskyVoice [CMP-12] | Sarvam |

---

## 7. Expansion sizing

All figures are p50 (p10-p90), ₹ Cr a year, as of 2026-10 [SEG-12]. The model is computed from assumptions and has no
verifier.

| stage | what | size | trigger to move on (dated where possible) |
|---|---|---|---|
| S0 | Intermediaries' renewal books, per renewal at the card | **107 (89-127)**; 58 (46-73) excluding the largest brokers and PoSP platforms | Kill criteria 1-3 pass by ~2026-11-13; 3 paid pilots or LOIs |
| S1 | Insurers' renewal desks, excluding LIC (per renewal, insurer fees) | 51 (36-72) | Two intermediary pilots non-inferior (KC7). An India-resident stack that meets insurer residency; LIC-type buyers bar foreign-hosted models [RAW-05] |
| S2 | Other BFSI 1600 service calls, mid-market (per minute) | 166 (94-283) | Same plumbing. RBI conduct rules from 2027-01-01 are the buying trigger [REG-13] |
| S3 | The rest of post-sales outside BFSI (l3, after a haircut) | 1,980 (751-6,163), weakest evidence | A2P and 1601/10-digit paths proven; per-outcome pricing proven in S0-S2 |
| Ceiling context | All insurance renewal calling including LIC, per minute | 211 (154-288) | n/a |
| Cumulative | S0 to S3 | 2,316 (1,089-6,484) | n/a |

**Cross-checks.**
- Implied Indian voice-agent revenue today is about ₹148 Cr, roughly 1.5% of the l3 SAM [SEG-13].
- The corrected TRAI comparison says the bottom-up seat model is ~3-6x high in minutes, or that intermediaries call from
  ordinary 10-digit numbers [SEG-14]. The interview question "which number do you call from" tells the two apart.

**Investor framing.** The beachhead alone is a feature-sized market. The venture case rests on S2 and S3, which share
the compliance router and the competence layer, priced per outcome.

---

## 8. Product build list and idea triage, with reversal conditions (critic A18)

### 8.1 What we build for the wedge, in order

| # | build | why | reverse or change if |
|---|---|---|---|
| 1 | **Tenant-held 1600 telephony through a CPaaS bring-your-own-bot path** (Exotel AgentStream, Plivo Stream, Vobiz) into an India-hosted gateway | 1600 is mandatory [REG-20]; VP must not be the sender [REG-12] | Quotes by ~2026-10-30 show no provider will stream 1600 audio to a third-party AI. Then use the CPaaS's own bot runtime with our policy layer, or partner with a registered telemarketer if counsel allows |
| 2 | **Compliance router as a code gate**: classify service, promotion and solicitation; block persuasion, alternatives and discounts; enforce the 1600 series, hours and A2P declaration; consent ledger; AI disclosure at the start of the call and never deny | Solicitation and promotional drift are the regulatory failure modes [REG-26, REG-35, RAW-01] | Counsel says the intermediary's compliance officer must approve every script. The router then becomes a script-approval and audit workflow |
| 3 | **Competence layer**: language pinned from CRM or the first turn; pause-aware release with a negation-aware matcher; quiet-backchannel handling; number read-back; non-speech probe; per-locale number regression tests | KC6 collision and elderly clauses fail today [LAT-05, LAT-06]; Tamil number normalisation broke [HUM-15] | Mode B shows an incumbent configured with our spec passing all five KC6 sub-criteria at ≤ ₹4-6 a minute. Then buy that layer and differentiate on compliance and outcomes |
| 4 | **Per-policy context and memory with provenance** | Context lifts outcomes in field experiments [CMP-20] | The pilot's live adherence test fails (more than 1 in 20 replies ignore a stored preference). Then drop cross-call memory and keep per-call context |
| 5 | **Payment hand-off and trust design**: WhatsApp utility link only after the customer confirms; autopay option; 1600 plus a CNAP business name; a verifiable callback number; human escalation path | The call resembles known scams [RAW-09..11] | The listener panel's S1 test or interviews show links in calls lower trust. Then direct the customer to the insurer's own portal and send no link |
| 6 | **Honest attribution**: holdout never billed; per-line reporting only once powered; pooled across buyers where allowed | Health and life lift is undetectable quarterly [REN-13] | Buyers refuse any holdout. Then use a staggered or matched-month design and say what it cannot show |
| 7 | **Thin operator console**: due list, outcomes, escalations, attribution | H8 point-tool evidence [CMP-21, CMP-22] | 5 or more of 15 buyers need disposition editing or dialler features in the product. Then extend the console, or integrate their CRM |
| 8 | **Escalation desk policy**: who answers hand-offs, including at 8 pm; written into every LOI | It moves launch GM by 7-21 points [REN-10] | n/a; it is a contract term, decided per buyer |

### 8.2 What we explicitly do not build, and what would reverse it

| not building | reverse if |
|---|---|
| Self-hosted ASR or TTS | Aggregate volume approaches ~1.6M minutes a month **and** self-hosted Indic ASR passes a VAD-gated non-speech probe **and** open Hindi TTS passes a blind ear test [ECO-05]. Or counsel or buyers require self-hosted models (LIC-type) [RAW-05] |
| Dialect TTS | The Bihar panel arm shows preference ≥ 0.65 with no patronising penalty, **and** 3 or more of 15 buyers ask for dialect |
| Realtime speech-to-speech as the speaker | A gateable Indic full-duplex model exists (text gate before audio) and passes the battery [LAT-19] |
| Cross-tenant pooled learning | Tenants prove similar on measured effects, **and** DPDP contracts and Meta's terms permit it |
| CRM or ERP modules; the command centre | 5 or more of the first 15 qualified prospects would buy voice only inside a replacement CRM |
| Lead scraping or cold lists | Never for the beachhead (DPDP) [REG-05] |
| Feature parity with Vapi, Bolna or ElevenLabs | 5 or more of 15 prospects reject VP over a specific missing feature the renewal job needs |
| A managed telemarketing service (VP as the IRDAI telemarketer) | Counsel finds a registered-telemarketer route workable and cheaper, and buyers prefer managed |

### 8.3 Triage of the owner's eight ideas

| # | idea | verdict | why (round 2 additions in bold) | reversal condition |
|---|---|---|---|---|
| 1 | Emotional, relational, extremely human-like voice | **reframe** to human-competent | No outcome evidence for warmth; the collections gap is about commitments, not hang-ups [HUM-01..05]. **A leading Indian showcase agent claims to be human [CMP-07]; the call has the shape of a renewal scam [RAW-09]** | A holdout pilot shows a warmer variant lifts saves beyond its MDE without raising complaints, or the 60+ panel both prefers and understands a warmer register better |
| 2 | Self-evolving agents ("fix the line where 90/100 dropped") | **reframe** to scoped learning | 100 calls cannot validate a line; K=2 daily dashboards give 52-62% false winners [LRN-01, LRN-02]. **Renewal holdouts take months (motor) to years (health and life) [REN-13]** | A script reaches ~1,000 calls a day **and** LLM outcome extraction is ≥ 95% accurate on 200 hand-labelled renewal calls. Then enable outcome-level optimisation for that script |
| 3 | Hyper-personalisation (accent, dialect, per-person memory, cross-source data) | **reframe**: language matching and memory core; dialect later and opt-in; drop cross-source pooling | 1 dialect ask in 828 postings [HUM-07]; no Hindi-belt dialect TTS [HUM-08]; the memory trial failed [LRN-08] | Dialect: as §8.2. Memory: the pilot adherence test passes 19 of 20 or better |
| 4 | Company context at onboarding | **core, narrow**: policy and customer fields plus a small approved fact base | Specific context beats generic [CMP-20] | More than 10% of pilot escalations come from questions about missing company facts. Then widen the fact base |
| 5 | Price under ₹2 a minute, components in-house | **reframe**: the unit is per renewal; ₹2 is a scale COGS target; build the compliance and competence layers in-house, buy ASR and TTS | Managed never reaches ₹2 [ECO-04]; **per-minute pricing loses money at launch [REN-06]** | ~1.6M aggregate minutes a month with D-lite passing quality gates, or a buyer or regulator requires self-hosting |
| 6 | Feature parity with Bolna, Vapi, ElevenLabs | **drop** as a strategy | Parity already exists [CMP-01]; **self-serve renewal calling from ~₹4-10 a minute [CMP-16]** | As §8.2 |
| 7 | Whole-company AI command centre | **later** | Point tools first [CMP-21, CMP-22] | 5 or more of the first 15 qualified prospects would buy voice only inside a replacement CRM |
| 8 | Voice AI will be a large future domain | **reframe**: right direction, but plan on flat cost curves | 1.7x cost fall in 24 months; end-2027 LLM-flat P50 ₹2.98 [ECO-18, ECO-19]; first frontier price rise [ECO-21] | Live Azure meters put the managed stack at or below ₹2.5 a minute at 1M minutes a month (check quarterly; next 2027-01-15). Then plan on the cut process |

---

## 9. Predictions scored

Full table in `predictions.md` ("Scored after research"). Summary:
- **Outcomes:** H5 supported with corrections; H8 supported on desk evidence only; H1, H2, H3, H4, H6, H7, H9 and H10
  mixed; H2b untestable yet.
- **Brier score:** 0.0415 with mixed scored as 0.5 (all-0.5 reference 0.050). Scored strictly, where every part must
  hold, it is **0.357** against 0.250: worse than a coin flip, because multi-part predictions rarely hold whole.
- Misses cluster on mechanisms (DPDP against TRAI, 140 against 160, IRDAI solicitation) and magnitudes.

---

## 10. Sourcing and relabelling of unsourced lines (critic A17)

| round-1 line | status now | what v2 says instead |
|---|---|---|
| "Policyholders skew older and Hindi-belt" (§1.1 item 9) | **No source in either round** [HUM-11] | An assumption. The elderly-first panel design is justified by the risk (cut-ins at elderly pauses, scam exposure), not by a measured age mix. Interview probe: the age band of the due list |
| "Renewal lists come as spreadsheets" | Weak vendor evidence only [HUM-12] | An assumption; integration_ease 4 is unsourced. Interview probe: which CRM, dialler or file holds the list, and where the premium comes from |
| The ₹150-per-save floor | **Retired**; its basis mixed in the insurer's premium [REN-05] | Per-line 40%-margin fee floors [FK-02] |
| "4-10 weeks to first paid customer" | An estimate [l4c] | Earliest live pilot call ~2026-11-24 to 2026-12-03, gated by counsel and 1600 provisioning [calc; REG-23] |
| Spam-flag row: "fewer sub-10-s hang-ups means fewer flags" | Weak link [HUM-13] | Withdrawn for the beachhead (1600 cannot be flagged) [RAW-03]; kept as a hypothesis for 10-digit and 140 paths |
| "Competition is thin at this buyer" | Refuted at the job level [CMP-13] | §6 |
| LSQ plus Invorto "+10% renewal ratio" | A CRM case with no voice AI [CMP-15] | Dropped as voice-AI evidence |
| "9,440 calls a month per median buyer"; "~50 buyers reach 1M minutes" | Assumption-driven [SEG-08] | Replaced by due renewals a month: ~6,800 equals a 3-seat desk; ₹24k a month for a 1,500-due broker [REN-14] |
| "Effective competitor prices ₹2-2.5 at volume" | Unverified secondary [ECO-16] | Kept only as a flagged risk |
| "Incumbents' complaints are 68% about support" | Round-1 l4c figure, weakened [l4av] | Round-2 coding of 459 Indian complaints: support 114, billing 107, account/UI 99, reliability 71; voice-quality categories 1-5 each [RAW-17] |
| "Incumbents fail in four places, all of which we measured" | Overstated [critic §4 row 1] | "The homepage demos of seven platforms show these gaps; our own cascade shows the turn-taking gap too" (§6) |

---

## 11. Owner actions, in order, with dates

| # | action | by | why |
|---|---|---|---|
| 1 | Accept `founder-kit/scoring.md` as written, or log deviations **before** the first call. Recommended deviations: ask the IRDAI-caps question in every insurance interview; pilot and LOI asks on car and health only; keep kill criterion 6's collision clause at ≤ 5%. Fix the §13.2 caveat 4 wording (§4.3) | Sun 2026-10-18 | Pre-registration only works if changes come before the data |
| 2 | Brief counsel with §3.7 (solicitation and telemarketer status, IMF reg 3(d), outsourcing, data location, direct-renewal commission, PoSPs on 1600, A2P on 1600) and ask for an answer by about Fri 2026-11-13 | Mon 2026-10-19 | Kill criteria 5 and 8 are decided here; no pilot starts, and no IMF pilot is asked for, without it |
| 3 | Set up the VP mailbox, LinkedIn headline, calendar link and `data/discovery/` tracker; run two timed mock interviews with the price card | Sun 2026-10-18 | The kit assumes them |
| 4 | Send wave 1 (15 insurance contacts: A5, B4, C4, D2) and ask for warm intros through insurers' channel managers for IMFs and CAs | Mon 2026-10-19 | Starts KC1-KC4 |
| 5 | Reconcile the Azure invoice for 2026-10-17/18 against the spend log (logged estimates ~₹3,316 against the ₹10,000 cap; round-2 latency logged ₹1,100, actual about ₹600) | Tue 2026-10-20 | Programme cap discipline |
| 6 | Send wave 2 and screen 40 more insurance targets from the register frame by stratum quota | Wed-Fri 2026-10-21 to 10-23 | KC4 cohort of 60 |
| 7 | Decide whether to file a comment on IRDAI's distribution consultation (optional). Confirm "no action" on ACS [REG-37] | Fri 2026-10-23 (comments due Sun 10-25) | A dated regulatory risk to the beachhead's value per save |
| 8 | Get telephony quotes from Exotel, Plivo, Vobiz, Tata, Jio and Ozonetel. Ask: 1600 for a small intermediary; price per number, circle and minute; audio streaming to a third-party AI on 1600; CNAP name display on SIP/PRI 1600 from 11-01; telemarketer-location rules; provisioning time. Ask for a trial number for the handset test | Fri 2026-10-30 | Decides KC5 and the pilot's cost |
| 9 | Residency ruling (B5): default to India-resident processing. Test that the production (grant) subscription can still deploy gpt-4.1-mini Standard in South India, and name the fallback if it cannot | Fri 2026-10-30 | KC10; the fastest path is India-processed but its model is deprecated |
| 10 | Interim interview check (strata counts, early KC1 reading, artefacts). Decide whether to fund listener-panel recruitment (~₹1.21-1.54 lakh for the main four panels) | Thu 2026-10-29 | Do not spend on the panel if the beachhead is moving |
| 11 | Turn-taking redesign (pause-aware release, negation-aware matcher, quiet-backchannel handling), then the battery on config A or B over the CPaaS trial number from an Indian handset, on weekday business hours. Blind-score 4.1-mini against 6-sol replies | Fri 2026-11-06 | KC6 |
| 12 | Competitor Mode B from an Indian network: our renewal spec on Sarvam, Ringg, Bolna and Gnani; Arrowhead once its CORS bug is fixed; Millis (port 8080). Capture invoices. Listen to the Sarvam denial recordings | Weeks 2-3, by Fri 2026-11-06 | The real H4 kill test; KC6 second clause |
| 13 | Listener panel: owner listen-checks of the 210 clips, native reviews, CONFIG, human reference recordings, then recruitment if item 10 says go | After 2026-10-29 | E1/S1 test elderly comprehension and scam-trust |
| 14 | Final scoring under both rule sets; the hold / move-to-larger-strata / switch decision (§1.4); log decisions, measurements and rejections to `context/` | ~Fri 2026-11-13 | The decision gate |
| 15 | With the first signed LOI: start the 1600 paperwork in the buyer's name, in parallel with counsel | From the first LOI | 7-14 business days of provisioning [REG-23] |
| 16 | Concierge pilot (car and health, consented, holdout never billed); measure LLM outcome-extraction accuracy on 200 hand-labelled calls before any learning loop | Earliest calls ~2026-11-24 to 12-03 | KC7; brief §6 proof bar of 3 paid pilots or LOIs |
| 17 | Find outside reviewers: an insurance renewal-ops head, an ex-employee of a voice-AI company, a CPaaS salesperson | By ~2026-11-13 | None consulted yet |
| 18 | Re-benchmark India-resident models | By 2027-01-14 (90 days before retirement) | KC10 |

Research tasks (not owner-only) to queue:
- re-run `renewal_model.py` with the corrected scale COGS and the IRDAI-caps scenario, and with life at observed
  commission;
- weekday-peak latency repeat;
- ask IRDAI and CERT-In about fake-renewal advisories;
- read the two scanned TRAI responses not yet read (Tanla 2024, Go2market 2026).

---

## 12. Risks, updated

1. **Commission compression.** IRDAI's proposed caps cut value per save to 0.33-0.49x. At a working desk, the car fee
   window nearly closes [REN-25]. Insurers gain reason to automate renewals themselves [CMP-17].
2. **The buyer mix is thin where the gap is.** Small and mid intermediaries are unserved partly because they are small:
   IMFs average ~75 health and ~42 life policies a year [REN-17], and the ₹15k minimum excludes buyers below ~935 due a
   month [REN-12].
3. **Regulatory interpretation.** The solicitation reading is medium confidence [REG-26]. IMFs may be out entirely
   [REG-29]. A2P declaration applies to every AI call [RAW-01].
4. **Number path economics.** The 1600 price and streaming support are unknown [REG-24, REG-25]. Pickup on 1600 compared
   with known mobiles is unmeasured [RAW-13].
5. **Turn-taking quality.** Collisions are 18-50% [LAT-05] and elderly speech is unmeasured on real phones. Speculation
   can release replies on negated transcripts [LAT-03].
6. **Model lifecycle and residency.** The fastest India model retires 2027-04-14 and may not deploy on a new
   subscription [LAT-08].
7. **Trust and fraud.** The call resembles documented scams [RAW-09..11]. A single complaint about a payment link could
   end a pilot.
8. **Thin margins until scale.** Launch economics work for car and, conditionally, health. FX and flat-to-rising LLM
   prices work against us [ECO-19, ECO-21]. Effective competitor prices may be lower [ECO-16].
9. **Measurement honesty.** Health and life lift is unmeasurable monthly below ~25k due renewals [REN-13]. Over-claiming
   learning or warmth is a trust and regulatory risk (the TCCCPR deception clause).
10. **Evidence base.** Several key inputs are still assumptions: commission rates by line, desk productivity, AI-human
    parity, seasonality [REN-01, REN-15, REN-26]. Three round-2 packages had no verifier.
11. **Distribution is unproven.** There is no CAC or churn data [CMP-25].

---

## 13. What v2 supersedes in `SYNTHESIS.md`

`SYNTHESIS.md` stays as written. These parts are superseded:

| `SYNTHESIS.md` | superseded by | change |
|---|---|---|
| §0 (lines 26-47): price "effective ₹6-8 per AI-connected minute, ₹1.1-1.5 lakh a month"; "managed, compliance-carrying renewal caller"; "never promotes" | v2 §0, §4 | Per-line per-renewal card; software on the tenant's 1600 number; "inform, confirm, hand off" |
| §1 table (lines 53-60) | v2 §1.1 | Buyer order, lines, operating model, number path, residency, price |
| §1.1 items 1, 3, 5, 9 (lines 64-98) | v2 §1.2 | 1600 closed; tie-breakers; competition; quality evidence restated |
| §1.2 kill criteria (lines 103-111) | v2 §2 | KC1-KC3 restated per the founder kit; KC5 at-risk; KC6 at-risk; new KC8-KC10 |
| §2 alternate 2 (lines 157-183) | v2 §1.3, §7 | Reframed as BFSI 1600 service reminders; scorecard support weakened (#8 and #13) |
| §3 thesis and gap map (lines 198-221, 269-286) | v2 §6 | Seven homepage demos; "design targets, not proof"; competition not thin |
| §3.1 idea triage (lines 254-265) | v2 §8.3 | Reversal conditions added; round-2 evidence |
| §5 economics (lines 290-337), including lines 296, 308-311, 335 and 568 | v2 §4.4, `lanes/CORRECTIONS-round2.md` | ₹3.23 at 1M minutes (not ₹3.06); paths re-costed; margin ~46-60% at scale; per-minute pricing unprofitable at launch |
| §6 items 2 and 11-12 (lines 349-395) | v2 §3 | IRDAI layer; India records; strict dates |
| §7 prediction table (lines 399-417) | `predictions.md` scored section; v2 §9 | Brier scores added |
| §8 owner list (lines 421-463), including the ACS item | v2 §11 | Dated order; ACS moot |
| §9 risks (lines 467-494) | v2 §12 | Commission caps, IMF bar, turn-taking, model lifecycle, fraud |
| Appendix (lines 554-596) | v2 appendix | Corrected numbers |

---

## Appendix: key numbers (round 2)

| label | value | ledger |
|---|---|---|
| 1600 mandate for insurance intermediaries | from 2026-02-15, irrespective of consent | REG-20 |
| 1600 provisioning time (Plivo, stated) | ~7-14 business days; no published price | REG-23, REG-24 |
| 1600-series calls, Q1 FY27 | 1.15 bn | REG-03 |
| Intermediary records in India | ≥ 10 years | REG-31 |
| IRDAI telemarketer certificates on register | 38, all stale (2020-2023) | REG-28 |
| CNAP start | 2026-11-01 (4G+ wireless) | RAW-08 |
| A2P pre-declaration (strict reading) | 2026-11-18 | REG-36 |
| Value per saved renewal, p50 (2W / 4W / health / life) | ₹265 / ₹2,415 / ₹2,737 / ₹1,941 (life ~₹1,040 at observed commission) | REN-01, REN-02 |
| Per-minute pricing at ₹6-8, launch GM | −47% to +1% | REN-06 |
| Card: car / health / life / bike per renewal collected | ₹50 / ₹15 / ₹15 / ₹20; ₹15k minimum; 10% holdout | FK-05 |
| Launch GM at the card (car / health / life / bike) | 66.5% / 45.3% / 33% / 12.7% | REN-07..10 |
| 40%-margin fee floors (2W / car / health / life) | ₹29 / ₹28 / ₹14 / ₹17 | FK-02 |
| Break-even no-call renewal (2W / car / health / life) | 63% / 96% / 97% / 93% | FK-03 |
| 3-seat desk equivalent | ~6,800 due renewals a month | REN-14 |
| Policybazaar health persistency (NOP) | 87% FY26; 88.9% JFM'26; first renewal 85-86.6% | REN-18 |
| IMF output per firm, FY25 | ~75 health, ~42 life policies | REN-17 |
| Brokers' share of motor premium | 49.5% | REN-16 |
| IRDAI proposed caps (health renewal / old motor OD / TP / life renewal) | 5% / 10% / 2.5% / 2-3%; comments due 2026-10-25 | REN-24 |
| Value per save under caps | 0.33-0.49x modelled | REN-25 |
| Pool S0 / S1 / S2 / S3 | ₹107 / 51 / 166 / 1,980 Cr a year | SEG-12 |
| India cascade (config A) clean-turn p50 / p90 | 1,004 / 1,105 ms (server-side) | LAT-02 |
| Collisions across configs | 18-50% (bar ≤ 5%) | LAT-05 |
| South India Standard gpt-4.1-mini TTFT | 304 ms; retires 2027-04-14 | LAT-07, LAT-08 |
| India cascade AI-only cost | ₹2.29-2.76 a minute (STT ₹1.58) | ECO-12 |
| Managed COGS at 100k / 1M minutes a month (MC p50) | ₹5.88 / ₹3.23 | ECO-01, ECO-03 |
| Managed-stack end-2027 forecast (LLM flat) | ₹2.98 | ECO-19 |
| Sarvam demo clean-turn p50; AI denial | 3,116 ms; claimed human 6/6 | CMP-06, CMP-07 |
| Indian voice-AI offers selling insurance renewal calling | ≥ 10 | CMP-13 |
| Indian complaint mix (459 coded) | support 114, billing 107, account/UI 99, reliability 71 | RAW-17 |
| Prediction Brier (mixed = 0.5 / strict) | 0.0415 / 0.357 | §9 |
