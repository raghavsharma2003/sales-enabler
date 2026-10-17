# Prediction register (written before any research, 2026-10-17)

These were written and committed before the research lanes started. Each one is scored after the research. Wrong
predictions stay here; they are the point.

Probabilities are the researcher's prior confidence that the prediction holds.

| H | Prediction | Prior |
|---|---|---|
| H1 | AI calling without consent for promotion, to numbers that never opted in, is not viable in India: the 140 series, DLT registration, DND scrubbing and disconnection penalties make it a losing game. Lead follow-up with consent, inbound calls, and service/transactional calls (160 series) are viable. Post-sales has less regulatory friction than pre-sales. | 0.80 |
| H2 | A fully managed Azure cascade (managed ASR, LLM and TTS) cannot reach an all-in cost under ₹2 per connected minute at our quality bar today. Self-hosted ASR and TTS plus a small LLM on Azure GPUs at high utilisation can reach about ₹1.2–2.0. Indian voice-AI list prices cluster around ₹4–10 per minute. | 0.60 |
| H2b | Indian buyers compare against a telecaller's cost per outcome, not price per minute. At least one strong segment prefers paying per outcome or per seat. | 0.65 |
| H3 | The top 3 segments by (pain × spend × ease) ÷ regulatory risk will come from: real-estate / edtech speed-to-lead qualification, D2C post-purchase (COD confirmation, NDR, reorders), and insurance renewals. Lending collections has the highest spend but ranks lower on regulatory and reputational risk. | 0.50 |
| H4 | Measured incumbents show p50 response latency ≥ 1.0 s on Hinglish, mishandle short answers ("haan", "ok") and interruptions, and none offers dialect-matched voices beyond the major languages. US platforms cost $0.07–0.15 per minute all-in; Indian platforms ₹3–8 per minute. | 0.60 |
| H5 | There is little rigorous outcome evidence that "emotional/relational" voice lifts conversion. There is some evidence that naturalness reduces early hang-ups. Overall verdict: mixed. Warmth is a risk in collections. | 0.65 |
| H6 | Language matching (Hindi vs Tamil vs Bengali) is strongly preferred. Dialect or accent matching inside the Hindi belt (for example a Bhojpuri-Hindi mix) gives a weak or mixed preference and carries a patronising risk. Azure cannot produce acceptable Bhojpuri-mix speech today. | 0.55 |
| H7 | Changing one script line cannot be validated from 100 calls; a 5-point effect needs on the order of 800+ calls per arm. Per-contact memory and personalisation are feasible immediately. Script learning is feasible only pooled across a tenant or a segment. | 0.80 |
| H8 | Beachhead buyers will want a point solution that plugs into their existing CRM, telephony and WhatsApp (Zoho, LeadSquared, Exotel, Interakt and similar). The full command centre is an expansion path, not the wedge. | 0.70 |
| H9 | The AI cost per minute of a voice stack fell roughly 5–10× over the last 2 years. Full-duplex speech-to-speech is not production-grade for Indic languages at our quality bar today. AI cost (excluding telephony) reaches about ₹0.5/min by the end of 2027. | 0.50 |
| H10 | Mid-market Indian B2C buyers buy through founders or ops heads, at ₹25k–2L per month, with a 2–8 week sales cycle. CPaaS and telephony vendors and CRM partner ecosystems are major channels. | 0.50 |

---

## Scored after research (2026-10-17)

Scored by the round-2 synthesis after both research rounds (`SYNTHESIS.md` §7 for round 1, `SYNTHESIS-v2.md` §9 for
round 2). The text above is unchanged. Ledger ids in brackets point to `ledger.json`.

**Scoring rule.** Each prediction is scored as written, as a whole: **supported** = 1, **mixed** (some parts hold, some
fail) = 0.5, **refuted** = 0. **Untestable yet** is left out of the score and listed. The Brier score is the mean of
(prior − outcome)², lower is better; a forecaster who wrote 0.5 for everything is the reference.

| H | prior | outcome | score used | note |
|---|---|---|---|---|
| H1 | 0.80 | mixed | 0.5 | Direction right, mechanism wrong. Cold promotional calls are lawful today from 140 to non-DND numbers [REG-01]; bought B2C lists die with DPDP around 2027-05-13, not TRAI [REG-05]. Round 2: TRAI refused any AI carve-out, so every AI call is A2P and must be pre-declared [RAW-01]; "post-sales has less friction" holds for neutral service calls on 1600 but persuading a renewal is IRDAI solicitation [REG-26]. |
| H2 | 0.60 | mixed | 0.5 | Part 1 supported: managed Azure never reaches ₹2 (P ≈ 0.001 at 10M min/month) [ECO-04]. Part 2 mostly refuted: only D-lite is robust (₹1.19) and the single self-hosted paths have P(≤₹2) 0.00-0.15 [ECO-05, ECO-06, ECO-07]. Part 3 refuted: Indian all-in list prices are ₹3.5-7, below ₹4-10 [ECO-15]. |
| H2b | 0.65 | untestable yet | excluded | No buyer data. Desk evidence leans towards it: per-minute pricing loses money and per-renewal pricing works for 4W [REN-06, REN-07]. Interviews from 2026-10-19 test it (§13.7 of the interview guide). |
| H3 | 0.50 | mixed | 0.5 | The predicted three are the top 3 on the frozen scorecard and on S1 [SEG-01, SEG-03]. Without the added criterion, edtech replaces D2C in the top 3 [SEG-02]. "Collections has the highest spend" is refuted (real estate ₹3,769 Cr) [SEG-05]. |
| H4 | 0.60 | mixed | 0.5 | Latency ≥ 1.0 s supported on 7 homepage demos (p50 1.54-3.75 s, none met 1.5 s) [CMP-02, CMP-06, CMP-11]. Short answers and interruptions mixed (Sarvam handled most short answers). No dialect voices: supported. US price refuted, India price partly held [ECO-15, ECO-17]. The kill test (our spec on each platform) is still not run. |
| H5 | 0.65 | supported, with corrections | 1 | No outcome evidence for "emotional/relational" voice [HUM-01, HUM-02, HUM-05]. The naturalness-to-early-hang-up part is weak: AI was not hung up on more within 10 s, and TTS choice moved hang-ups by at most 2.4 pp in a vendor-funded test [HUM-03, HUM-04]. Warmth risk in collections holds [HUM-05]. |
| H6 | 0.55 | mixed (mostly untested) | 0.5 | Language matching has indirect support only (hiring asks; Sarvam's language lock) [HUM-06, CMP-08]; listener preference is untested; dialect asks are rare (1/828) [HUM-07]. "Azure cannot produce Bhojpuri-mix" is partly wrong (markers recovered 8-10/13 strict) but acceptability is unrated [HUM-09]. |
| H7 | 0.80 | mixed | 0.5 | 100 calls cannot validate a line (MDE 13-19 points) [LRN-01]; "800+" understated (906-3,554 per arm). Memory feasible statistically but the only live adherence trial failed [LRN-08]. "Only pooled" refuted: per-tenant learning works on local metrics; pooling across dissimilar tenants picked the wrong winner for 48-55% [LRN-06]. |
| H8 | 0.70 | supported (desk only) | 1 | Point-first adoption, CRMs and CPaaS bundling voice, no CRM switch for voice found [CMP-20, CMP-21, CMP-22, CMP-23]. Weakened by 24% of Zoho One buyers starting on the suite. Interviews pending; provisional. |
| H9 | 0.50 | mixed (2 of 3 parts refuted) | 0.5 | 5-10x refuted: 1.7x in 24 months [ECO-18]. Full-duplex Indic not production-grade: supported [LAT-19]. ₹0.5/min by end-2027 refuted: LLM-flat P50 ₹2.98 [ECO-19]. |
| H10 | 0.50 | mixed | 0.5 | Ticket band holds for sales-led sellers, not self-serve (~₹4.9k) [CMP-19]; pilots 2-8 weeks, production 8-12+ [CMP-24]; "partners are major channels" refuted [CMP-22]; no CAC or churn data [CMP-25]. |

**Calibration.**
- **Brier score (10 scored predictions, mixed = 0.5): 0.0415.** The all-0.5 reference scores 0.050, so the priors did
  slightly better than a coin flip. Counting H2b as 0.5 instead of excluding it gives 0.0398.
- Mean prior 0.62 against a mean scored outcome of 0.60: no large average over-confidence on this rule.
- **The rule flatters the register.** Scoring "mixed" as 0.5 rewards any prior near 0.5 on a multi-part prediction. Scored
  strictly (a prediction counts as held only if every part held), only H8 held, and the Brier score is **0.357** against
  0.250 for the all-0.5 reference: worse than a coin flip. Both numbers are reported; the strict one is the more honest
  reading of predictions written as conjunctions.
- **Where the misses cluster:** mechanisms (DPDP vs TRAI; 140 vs 160; solicitation under IRDAI), magnitudes (cost curves,
  list prices) and the "only pooled" learning claim. The largest Brier contributors were H5 (0.12, a supported prediction
  held at only 0.65) and H1, H7 and H8 (0.09 each); H1 and H7 were the two highest priors (0.80) and both came out mixed.
- **Lesson for the next register:** write single-claim predictions with a stated measurement, so each can be scored 0 or 1.
