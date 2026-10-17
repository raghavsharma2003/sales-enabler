# Listener panel protocol (draft v0.1): dialect matching and human-likeness in Indian sales calls

Lane l5-human-dialect, Vyakti Platform research, 2026-10-17. Status: draft for owner approval. Nothing here has been
fielded. Once the owner approves, freeze this file, hash it (`sha256sum panel-protocol.md`) and write the hash into
`predictions.md` **before** the first listener is recruited.

This panel is a **screen, not an outcome test**. It measures stated preference, trust, comprehension, patronising-ness
and perceived humanness. Whether any of that moves conversion is tested only by the Stage-2 in-pilot A/B in section 10.
Do not cite a panel result as an outcome result.

---

## 1. Questions and pre-registered hypotheses

The primary tests are corrected with Holm-Bonferroni across the four of them (family alpha 0.05, so the first test is run at 0.0125).

| id | hypothesis | panel | primary measure | direction |
|---|---|---|---|---|
| **P1** | Bhojpuri-native listeners prefer a Bhojpuri-Hindi mix to neutral Hinglish | Bihar / East UP | paired choice | p(matched) > 0.5 |
| **P2** | Tamil-native listeners prefer a Tamil-English mix to neutral Hinglish | Tamil Nadu | paired choice | p(matched) > 0.5 |
| **P3** | The matched register is **not** rated more patronising than neutral (non-inferiority, margin 0.5 on a 7-point scale) | Bihar / East UP and Tamil Nadu | patronising rating | difference < 0.5 |
| **P4** | Out-group cost: Hindi speakers who are not Bhojpuri speakers trust the Bhojpuri mix less than neutral Hinglish | out-group | trust rating | matched < neutral |

The secondary tests are reported with intervals and are not used for decisions on their own:

- **S1:** Light mix (Hindi grammar with Bhojpuri address forms and discourse markers) vs full Bhojpuri mix, compared on preference and patronising-ness.
- **S2:** In Tamil Nadu, neutral Hinglish vs Indian English. This is the size of the language-mismatch penalty.
- **S3:** Comprehension is non-inferior for matched registers (two factual questions per clip, margin 5 pp).
- **S4 (H5):** Within a listener, naturalness MOS predicts "would continue this call". Also, what share of TTS clips are judged to be AI, and does that judgement lower the intent to continue?
- **S5:** The gap between the best Azure voice and a human native reading the same script, on every scale. This is the realism headroom.
- **S6:** Maharashtra. Marathi-Hindi mix vs Hinglish (the same design as P1, at lower power).

**What we expect.** These priors come from `predictions.md` H6 (0.55) and do not change the tests:

- P2: supported strongly.
- P1: weak or null.
- P3: at risk for the full mix.
- P4: a measurable cost.

## 2. Panels and recruitment

| panel | where (home district, self-reported) | screen | n recruited | n analysed (target) |
|---|---|---|---|---|
| Bihar / East UP (Bhojpuri) | Siwan, Gopalganj, Saran, Bhojpur, Buxar, Rohtas (Bihar); Ballia, Deoria, Gorakhpur, Ghazipur, Varanasi (UP) | mother tongue Bhojpuri; speaks Bhojpuri at home | 85 | 75 |
| Tamil Nadu | Madurai, Coimbatore, Tiruchirappalli, Salem, Chennai | mother tongue Tamil | 85 | 75 |
| Out-group Hindi | Delhi NCR, Haryana, west UP, MP | mother tongue Hindi (Khari Boli) or Haryanvi; **not** Bhojpuri | 70 | 60 |
| Maharashtra (secondary) | Pune, Nashik, Aurangabad, Kolhapur | mother tongue Marathi | 70 | 60 |
| **Total** | | | **310** | **270** |

**Quotas within each panel.** These are soft quotas, and composition is reported:

- Age: 18–29, 30–44 and 45+, roughly a third each.
- Gender: at least 40% women.
- Place: at least 35% rural or small-town.
- Education: at least 30% with schooling below graduation.
- Migrants: at least 20% currently living outside their home state. This matters because a Bihar-series number often belongs to a migrant in Delhi or Mumbai (see the lane l5 report, returned inline to the coordinator, section 1, H6(c)).

**Exclusions at screening:**

- Anyone working in telecalling, a BPO or an AI or voice company.
- Anyone who knows the team.
- Anyone who took part in a pilot round.

These are listeners from outside the team, which section 6 of the brief requires.

**Recruitment channels.** Owner action: each needs a contract or payment, so this lane did not contact any of them.

1. A paid local coordinator per region (a college lecturer or an NGO field coordinator) who shares a link through
   WhatsApp community groups. This is the cheapest option and the hardest to control, so quotas are tracked live.
2. A digital-work platform with a rural Indian workforce, for example Karya (it pays workers and runs Indian-language
   data tasks). Check its terms and whether it can recruit by district before relying on it.
3. A small field market-research agency in Patna, Madurai and Pune as the fallback for quotas.
4. Online panel vendors only to top up urban cells. They skew urban and English-speaking.

**Pay.** ₹250 for a 25-minute session (≈ ₹10/min), sent by UPI after completion and quality checks. Budget: 310 × ₹250 = ₹77,500, plus coordinators at about ₹30–50k. This is an estimate, not quoted by any vendor, and it falls outside the INR 10,000 Azure cap, so the owner must approve it.

## 3. Stimuli

### 3.1 Scripts

There are three scripts, each with three short turns. Each turn is 12–25 s of agent speech, and every script opens with the AI
disclosure:

1. **Two-wheeler EMI follow-up (consented lead).** This is the script already produced in
   `samples/stimuli-text.json`: price ₹82,500, down payment ₹15,000, EMI ₹2,950 × 24, test ride booking.
2. **D2C COD order confirmation (transactional).** Order value, delivery date, a confirm or cancel question.
3. **Insurance renewal reminder (existing customer).** Premium, due date, renewal link on WhatsApp.

Each turn exists in every register for its panel (3.2). All registers carry identical content, numbers and order.

**Authoring rule.** Inherited law: write shapes, not lines. The LLM drafts each register. **Two native speakers per
language** then edit it independently and reconcile, and the text is frozen. The LLM-drafted Bhojpuri in
`samples/stimuli-text.json` is a draft and has not been reviewed by a native speaker.

**Text normalisation before TTS.** This rule comes from this lane's measurements:

- Write times and amounts as spoken words in the target register, for example "सुबह 11 बजे" rather than "11 am". "11 am" came back as a word-like token in 18 of 20 clips.
- In Tamil, never glue a Latin-script English word to a Tamil suffix ("Motors-ல"). Azure silently drops the English word. Write the loanword in Tamil script.
- Check every rendered clip by ASR round-trip with the matching locale: bho-IN for Bhojpuri, hi-IN for Hindi, ta-IN for Tamil. If any content word is missing, re-render or fix the text.

### 3.2 Registers (conditions) per panel

| panel | A | B | C | D (human reference) |
|---|---|---|---|---|
| Bihar / East UP | neutral Hinglish | light Bhojpuri mix (Hindi grammar, Bhojpuri address forms such as रउआ/बानी and discourse markers) | full Bhojpuri-dominant mix | native Bhojpuri telecaller reading C |
| Tamil Nadu | neutral Hinglish | Indian English | colloquial Tamil-English mix (loanwords in Tamil script) | native Tamil telecaller reading the C text |
| Out-group | neutral Hinglish | light Bhojpuri mix | full Bhojpuri mix | none |
| Maharashtra | neutral Hinglish | Marathi-Hindi-English mix | colloquial Marathi | native Marathi reader of B |

The human reference recordings need one native voice talent per language, with written consent for research use
(owner action). They are processed exactly like the TTS clips.

### 3.3 Voices

- Two Azure voices per locale (one female and one male), chosen by a 10-person pre-screen on naturalness only.
  Candidates come from `azure-voices-indic-2026-10-17.csv`:
  - hi-IN: SwaraNeural, MadhurNeural, Kavya/Arjun MAI-Voice-2.1 (preview), Diya DragonLatest (preview), en-IN Aarti/Arjun DragonHD (multilingual).
  - ta-IN: PallaviNeural, ValluvarNeural, en-IN Meera DragonHD, en-IN AartiIndicNeural.
- Voice is a **nuisance factor**. Every register comparison is made **within the same voice**, so a voice difference cannot pose as a register difference.
- Optional arm (owner decision): one competitor voice per language (for example Sarvam Bulbul) to benchmark the Azure-only ceiling. This is for research only. Builds cannot use it.

### 3.4 Channel and processing

- **Primary:** narrowband phone simulation. Band-pass 300–3,400 Hz, 8 kHz, G.711 μ-law, decoded back to PCM for playback. The clips are in `samples/phone-8k/`, made with `ffmpeg -af "highpass=f=300,lowpass=f=3400" -ar 8000 -ac 1 -c:a pcm_mulaw`. Real calls in India are mostly narrowband or AMR-WB, and listeners judge accent differently through the band limit.
- **Secondary:** a wideband 24 kHz subset (a quarter of trials) to show whether the conclusions depend on the channel.
- Loudness is normalised to −16 LUFS integrated, with leading and trailing silence trimmed to 150 ms.
- **Disclosure handling** (harvest lesson `disclosure-announces-the-clone`):
  - In register-comparison trials, every arm keeps the identical AI-disclosure sentence, because this is how the product will really sound.
  - In the AI-vs-human judgement block, the disclosure is trimmed identically from all arms, including the human reference.
  - A second person verifies the trim with a waveform diff. The listener-operator never verifies it by ear.

## 4. Tasks, per listener session (about 25 minutes, on the listener's own phone)

0. **Consent and screening.** Show a DPDP-style notice in the panel language plus English. Collect only age band, gender, home district, current state, mother tongue, other languages, education band and phone type. Do not record the listener's voice.
1. **Playback check.** Two short clips with a counting task confirm that audio plays and that the listener uses an earpiece or earphones. A headphone-only antiphase test is not usable on phone speakers, so the counting check is the gate.
2. **Block A: paired preference (8 trials).** Two clips with the same script, turn and voice, in different registers, play in random A/B order: "Which caller would you rather keep talking to?" The listener answers A, B or no difference, then says how strongly (slightly or clearly). The register pairs are balanced across listeners with a Latin square.
3. **Block B: single-clip ratings (6 clips).** After each clip:
   - **Naturalness.** ACR 1–5, worded as in ITU-T P.800, translated.
   - **Trust:** "I would believe what this caller says" (1–7).
   - **Patronising:** "This caller is talking down to me / making fun of how people here speak" (1–7).
   - **Accent fit:** "Sounds like someone from my area" (1–7).
   - **Comprehension.** Two factual multiple-choice questions with 4 options each: an amount and a date or time.
   - **Continue:** "Would you continue this call?" (1–5).
4. **Block C: human or AI (4 clips, disclosure trimmed).** The listener answers "Is this a real person or a computer voice?" and gives confidence 1–3. The clips mix TTS and the human reference.
5. **Catch trials (3, hidden among the others):**
   - an identical-clip pair, where the expected answer is "no difference";
   - a deliberately degraded clip with clipping and a dropped word, where the expected naturalness is 2 or lower;
   - one instructed-response item.
6. **Close.** One open question: "What, if anything, felt off about these callers?" This is coded afterwards into a taxonomy.

All file names are hashed, and the mapping is kept outside the repository (the earbench rule). Assignment is randomised on
the server with a fixed seed per listener and logged.

## 5. Sample size (power analysis)

Code: `code/panel_power.py`. Output: `panel-power.json` (seed 20261017).

**Preference (P1, P2).** Each listener makes 8 paired choices. Listeners differ in their underlying preference, modelled as
a random intercept on the logit scale with standard deviation `sd_u`. The test is a one-sample t-test on per-listener
preference proportions vs 0.5. With moderate heterogeneity (`sd_u` = 0.5), simulated power is:

| true p(matched) | listeners | α = 0.05 | α = 0.0125 (Holm, first test) |
|---|---|---|---|
| 0.60 | 40 | 0.82 | 0.61 |
| 0.60 | 60 | 0.94 | 0.82 |
| 0.60 | 80 | 0.98 | 0.94 |
| 0.65 | 40 | 0.99 | 0.96 |

With strong heterogeneity (`sd_u` = 1.0, where some listeners love the matched register and some hate it), detecting p = 0.60 at α = 0.0125
needs more than 80 listeners (power 0.65 at 80). That is the reason to analyse 75 per primary panel and report the
heterogeneity estimate.

Without clustering, the binomial would need 194 trials (α = 0.05) or 276 trials (α = 0.0125) for p = 0.60. 75 listeners × 8 trials = 600
trials, which covers it with room for the design effect.

**Ratings (P3, P4, S-tests).** For a paired within-listener difference, n = ((z_α + z_β)/d_z)² + z_α²/2:

| d_z | α = 0.05 | α = 0.0125 |
|---|---|---|
| 0.3 | 90 | 128 |
| 0.4 | 51 | 73 |
| 0.5 | 34 | 48 |

So 75 analysed listeners detect d_z = 0.4 at the corrected level. A d_z of 0.4 corresponds to about 0.5 scale points when the
within-listener SD of differences is about 1.2 on a 7-point scale. That SD is an assumption; the pilot (section 8) measures it.

**Minimal viable version.** If the budget is cut, use 40 analysed listeners per primary panel. This detects only large
preferences (p ≥ 0.65) and d_z ≥ 0.5. A null at this size is "under-powered", not "no preference".

## 6. Analysis plan

- **Primary (P1, P2).** Fit a logistic mixed model of choice (matched = 1, with "no difference" split 0.5/0.5 in a
  sensitivity run and dropped in the main run), with random intercepts for listener and item (script × turn ×
  voice). The test is that the intercept is greater than 0.
  - Also report the raw proportion with its Wilson interval and a listener-cluster bootstrap interval (10,000 resamples).
  - Decision threshold for "preferred": the lower bound of the 95% CI is above 0.50 **and** the point estimate is at least 0.58.
- **P3 (non-inferiority).** Cumulative-link mixed model for the ordinal ratings, plus the paired mean difference with
  a one-sided 95% CI. The register is non-inferior if the upper bound of (matched − neutral) patronising is below 0.5.
- **P4.** The same model run in the out-group panel. The cost is the matched − neutral trust difference with its CI.
- **Comprehension.** Logistic mixed model on correct answers, with a 5 pp non-inferiority margin.
- **H5 link (S4).** Within-listener correlation (repeated-measures correlation) between naturalness MOS and continue-intent. Also an AUC for the human-vs-AI judgement: an AUC of 0.5 means listeners could not tell.
- **Heterogeneity.** Interactions with age band, education, rural/urban and migrant status. These are exploratory and labelled as such.
- **Exclusions** (pre-registered):
  - failing 2 or more of the 3 catch trials;
  - a median trial time below 40% of the panel median;
  - a failed playback check;
  - a screening mismatch, meaning the stated mother tongue is contradicted by the open-text answers (judged by the coordinator blind to responses).
- **No peeking.** The sample size is fixed. One interim look at 20% of the sample checks data quality only (completion and catch-trial rates), never effects.
- **Test-retest.** 10% of listeners repeat Block A a week later. This gives the ceiling for agreement, as with the harvest rule that the trusted judge agreed with itself only 77%.
- **Software.** R (`lme4`, `ordinal`) or Python (`statsmodels`). The analysis script is committed before fielding.

**Decision rule.** This feeds the H6 kill criterion. Dialect matching is adopted for a region only if all four hold:

1. P1 or P2 passes the preference threshold.
2. P3 passes non-inferiority.
3. Comprehension is non-inferior.
4. Expected value > 0, where EV = P(correct inference) × (matched − neutral gain) − P(wrong inference) × (out-group loss, from P4).

P(correct inference) comes from the region-inference analysis in the lane l5 report (section 1, H6(c)). If it cannot be estimated, matching is used
only when the customer opts in, for example by choosing a language on a WhatsApp button or saying it in the first turn.

## 7. Ethics, consent and data

- **Notice.** A notice in the panel language and English gives the purpose, the data collected, retention (12 months, then delete) and a contact for withdrawal. Consent is a clear affirmative tap.
- Listeners are told the voices may be computer-generated and that the businesses are fictional.
- **No deception about the study's purpose beyond blinding conditions.** A debrief text after completion explains the dialect question.
- **No personal identifiers** in the analysis data. UPI payout details are held separately by the coordinator and deleted after payment.
- The material is not sensitive. Content avoids debt or health stress.
  - No collections script is used in this panel. Collections is where warmth is most regulated (RBI recovery conduct) and most likely to be read as pressure. If collections is ever tested, it needs its own protocol and review.

## 8. Pilot round (before the main fielding)

Run 12 listeners, 4 per primary panel plus 4 out-group, recruited through the same channels. The pilot checks:

- that playback works on low-end Android phones;
- the session length;
- question translation;
- catch-trial behaviour;
- the within-listener SD of rating differences, used to re-run the power numbers.

Pilot data is **not** pooled into the main analysis.

## 9. Timeline (indicative)

| week | step |
|---|---|
| 1 | Native-speaker editing of scripts. Human reference recordings. TTS render plus ASR round-trip QA. Build the mobile listening page (adapt earbench: `hp-gurukul-early scripts/earbench.mjs`, four-cell counterbalance, catch trials, Wilson). |
| 2 | Pilot round. Freeze this protocol and record its hash. Brief coordinators. |
| 3–4 | Field the main panels. Monitor quotas daily. Pay listeners within 72 h. |
| 5 | Analysis and report. Score `predictions.md` H6. |

## 10. Stage 2: the outcome test (in a consented pilot campaign)

The panel cannot show conversion. The first real campaign (the brief's concierge pilot) should randomise register
**per call**. The two arms are:

- matched register, where the region is known from a CRM field or the customer's choice;
- neutral register.

Calls are stratified by region. Outcomes, pre-registered:

1. Early hang-up: the call ends within 10 s after the disclosure.
2. Qualified rate.
3. Booking or payment rate.

Two-proportion sample sizes per arm (α = 0.05, power 0.8; `panel-power.json`):

| effect | n per arm |
|---|---|
| early hang-up 15% → 10% | 686 |
| early hang-up 30% → 25% | 1,251 |
| qualified 20% → 25% | 1,094 |
| booking 10% → 13% | 1,774 |
| booking 10% → 12% | 3,841 |

So a single small business will not show a booking-rate effect in a month. Pool across tenants in the segment (H7) or
use early hang-up as the leading indicator. Early hang-ups also matter for compliance: TCCCPR Schedule-IV signals flag
CLIs with many short calls (lane l1, TCCCPR Third Amendment reg 21A).

## 11. Files

- `samples/stimuli-text.json`: the draft scripts (LLM-written, not yet reviewed by native speakers).
- `samples/wideband-mp3/` and `samples/phone-8k/`: 20 rendered clips, plus 6 probe clips in each.
- `samples/roundtrip-summary.csv`: objective QA of the clips.
- `azure-voices-indic-2026-10-17.csv`: the candidate voices.
- `code/panel_power.py` and `panel-power.json`: the sample-size work.
