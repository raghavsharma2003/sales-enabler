# Listener panel protocol v1.0: dialect and language matching (H6), human-likeness screen (H5)

VP research programme, 2026-10-17. Supersedes the lane l5 draft (`../lanes/l5-human-dialect/panel-protocol.md`, v0.1);
section 14 lists every change and the reason for it. Status: **ready to run once the owner actions in section 3.5 are done.**
Nothing has been fielded and no listener has rated a clip.

**Freeze before the first main-panel listener** (not before the pilot): run
`sha256sum protocol.md analysis.py build_plan.py app.js index.html plans/*.js stimuli-qa.csv` and write the hashes into
`../predictions.md` under H6. The analysis script is part of the pre-registration: the verdict is whatever
`analysis.py` prints, run on the frozen files.

**What this panel is.** A screen of stated preference, trust, comprehension, patronising-ness and perceived naturalness.
It is not an outcome test. Conversion effects are tested only in the Stage-2 in-pilot A/B (section 12). Do not cite a
panel result as an outcome result.

**Priority for the wedge.** SYNTHESIS section 8 item 8 puts *older listeners' comprehension and trust, and
regional-language matching* ahead of Bhojpuri dialect preference, because the beachhead is renewal calls to (often older)
retail policyholders. This version therefore treats Tamil Nadu and Maharashtra (language matching) as full panels,
oversamples listeners aged 45+, and reports an older-listener breakdown. The renewal turn (T6) is one of the six items.

---

## 1. Hypotheses

Prior from `../predictions.md` H6 (0.55): language matching strongly preferred; dialect matching weak or mixed with a
patronising risk. The prior does not change any test.

**Confirmatory family** (Holm-adjusted across the four, one-sided, family alpha 0.05; `analysis.py` prints both raw and
adjusted p):

| id | hypothesis | panel | measure |
|---|---|---|---|
| P1 | Bhojpuri-native listeners prefer the Bhojpuri mix to neutral Hinglish | Bihar / East UP | paired choice, p(matched) > 0.5 |
| P2 | Tamil-native listeners prefer the Tamil-English mix to neutral Hinglish | Tamil Nadu | paired choice, p(matched) > 0.5 |
| P3 | The matched register is not rated more patronising than neutral (margin 0.5 on 7 points); must hold in both panels (intersection-union: the larger p counts) | Bihar and Tamil Nadu | patronising rating |
| P4 | Out-group cost: non-Bhojpuri Hindi speakers trust the Bhojpuri mix less than neutral Hinglish | out-group | trust rating, matched < neutral |

**Secondary** (intervals reported; used in the region verdicts as stated in section 6.6, never alone):

- **S2.** Tamil Nadu: Tamil-English mix vs Indian English. This is the *product* comparison for Tamil Nadu (nobody would
  call Madurai in Hinglish), so it gets as many trials as P2.
- **S3.** Comprehension of the matched register is non-inferior (margin 10 percentage points).
- **S4 (H5).** Within a listener, naturalness predicts "would continue this call"; with Block C, the share of TTS clips
  judged to be a computer, the AUC for telling TTS from a human, and whether a "computer" judgement lowers continue-intent.
- **S5 (H5).** The gap between our TTS and a native human reading the same text, on naturalness and continue-intent
  (Block C only).
- **S6.** Maharashtra: Marathi mix vs neutral Hinglish (same design as P1; a full panel in this version).
- **S7.** Tamil Nadu: native-locale voice (ta-IN Pallavi) vs multilingual HD voice (en-IN Meera) on the same Tamil text.
  This is a producibility question: which Azure voice to ship for Tamil.
- **S1 (deferred).** Light vs full Bhojpuri mix. Not runnable: no light-mix clips exist (section 3.5, item M5).

## 2. Panels and eligibility

### 2.1 Panels and sample size (justified in section 5)

| panel | stimuli | target analysed | recruit (complete sessions) | pid prefix | default UI language |
|---|---|---|---|---|---|
| Bihar / East UP (Bhojpuri) | Bihar set | 48 | 56 | B | Hindi |
| Tamil Nadu | Tamil Nadu set | 48 | 56 | T | Tamil |
| Maharashtra | Maharashtra set | 48 | 56 | M | Marathi |
| Out-group Hindi (not Bhojpuri) | Bihar set | 36 | 42 | O | Hindi |
| **Total** | | **180** | **210** | | |

Recruit until 48 (36 for the out-group) listeners **pass the exclusion rules** or 60 (45) have completed, whichever comes
first. Exclusions depend only on catch trials, timing and screening, never on effects, so recruiting past an exclusion
does not bias the estimates. `analysis.py --quality-only` reports the count without showing any effect.

Minimum viable version, if budget is cut: 30 analysed per region panel and 24 for the out-group. Section 5 shows what
that can and cannot detect. Below 24 analysed listeners the script issues no verdict at all.

### 2.2 Eligibility (enforced by the page; re-checked by `analysis.py`)

| panel | mother tongue | language at home | home state (family's state) | other rules |
|---|---|---|---|---|
| Bihar / East UP | Bhojpuri | Bhojpuri | Bihar or Uttar Pradesh | home district tracked by the coordinator: Siwan, Gopalganj, Saran, Bhojpur, Buxar, Rohtas; Ballia, Deoria, Gorakhpur, Ghazipur, Varanasi |
| Tamil Nadu | Tamil | any | Tamil Nadu | districts tracked: Madurai, Coimbatore, Tiruchirappalli, Salem, Chennai |
| Maharashtra | Marathi | any | Maharashtra | districts tracked: Pune, Nashik, Chhatrapati Sambhajinagar (Aurangabad), Kolhapur |
| Out-group | Hindi or Haryanvi | not Bhojpuri, Maithili or Magahi | Delhi, Haryana, Uttar Pradesh or Madhya Pradesh | must not list Bhojpuri among languages understood well; west-UP districts preferred (coordinator) |

All panels screen out, at the start: anyone under 18 (nothing is stored); anyone who worked in the last 12 months in
telecalling, a call centre or BPO, or for an AI or voice-software company; anyone who knows the study team; anyone who
took part before, including the pilot. A screened-out session keeps only its reason code, for screen-out counts.

### 2.3 Soft quotas per panel (tracked daily; composition reported by `analysis.py`)

- Age: 18-29, 30-44 and 45+ roughly a third each, **with at least 33% aged 45+** and the 60+ share reported (wedge priority).
- At least 40% women.
- At least 35% living in a village or small town.
- At least 30% with schooling below graduation.
- At least 20% currently living outside their home state (migrants; a Bihar-series number often belongs to a migrant in
  Delhi, Mumbai or Surat).

## 3. Stimuli

### 3.1 What exists

The 102 blind clips rendered by lane l8 (`../lanes/l8-azure-bench/stimuli/`, `manifest.csv` holds the key). Text was
written by gpt-6-sol (`stimuli-text.json`); voices were chosen from objective l5 round-trip data, not by ear.

| region | conditions | voices (every comparison is made within a voice) | clips |
|---|---|---|---|
| Bihar | neutral Hinglish; Bhojpuri-dominant mix | hi-IN Diya (DragonLatest, preview, F); hi-IN Madhur (neural, M) | 24 |
| Tamil Nadu | Tamil-English mix (Tamil script); neutral Hinglish; Indian English | en-IN Meera and Arjun (DragonHD multilingual) speak all three; ta-IN Pallavi (neural) speaks the Tamil mix only | 42 |
| Maharashtra | Marathi mix; neutral Hinglish | mr-IN Aarohi (F), mr-IN Manohar (M), hi-IN Diya (F) | 36 |

Six single turns, each 8-15 s, identical content across registers:

| turn | content | comprehension questions (4 options; option order shuffled per listener) |
|---|---|---|
| T1 sales opening | Priya, an **AI assistant**, from Shree Ram Motors; enquiry form for a Hero Splendor on EMI; two minutes? | who was speaking (AI assistant); what the call was about |
| T2 price | on-road ₹82,500; EMI about ₹2,950 a month for 24 months | price; EMI and tenure |
| T3 objection | 36-month plan, EMI about ₹2,200; free test ride Saturday 11 am | EMI; day and time |
| T4 COD | ₹1,299 pressure cooker, cash on delivery, tomorrow 10 am to 2 pm | amount; delivery window |
| T5 NDR | delivery partner could not reach you; try tomorrow evening or change address | what happened; options offered |
| T6 renewal | health policy renewal due 15 November; premium ₹24,500 a year; payment link on WhatsApp | due date; premium |

Distractors are near-misses (₹85,200, ₹2,590, ₹1,999, 15 December, ₹24,500 *a month*), so the questions also catch a
voice that misreads a number: Diya misread ₹1,299 as 1999 in 5/5 renders of one Marathi clip.

The AI disclosure is spoken only in T1, identically in every register (the product will always disclose). Block C uses
new disclosure-free texts, so nothing has to be trimmed.

### 3.2 Channel and processing

As rendered by l8 (`harness/render_stimuli.py`): 24 kHz synthesis, leading and trailing silence trimmed to about
150 ms, −16 LUFS, then a wideband MP3 and a phone-band MP3 (300-3,400 Hz, 8 kHz G.711 μ-law round trip). **Primary
channel: phone band** (all of Block B and three quarters of Block A). **Secondary:** a quarter of Block A pairs play
wideband, to show whether conclusions depend on the channel.

### 3.3 Catch stimuli (made by `build_plan.py`, in `catch/`)

One degraded clip per stimulus region, from a T1 clip the listener understands (Bihar: neutral Hinglish, Madhur;
Tamil Nadu: Tamil mix, Meera; Maharashtra: Marathi mix, Aarohi): about 450 ms of speech silenced in the middle of the
longest voiced stretch (so it removes a word, not a pause), hard clipping (+24 dB into 16-bit), back to −16 LUFS, then
the same phone chain. Measured: crest factor fell from 7.2 to 3.7-4.7; the dropout appears as an isolated 0.45 s silence
at the planned time in all three files.

### 3.4 Quality status of the clips (`stimuli-qa.csv`)

- **Excluded (7).** `M_adcaf6` (Diya misread ₹1,299 in 5/5 renders; from the manifest). `M_84d420`, `M_566dff`,
  `M_aa8518`, `M_3bc6eb`, `M_dd4fbf`, `M_a12e2f`: **new finding in this package.** The mr-IN voices (Aarohi, Manohar)
  reading the neutral-Hinglish text drop the Latin-script "EMI" in T1-T3 (6/6 clips, per the manifest's own ASR
  round-trip), and in T1 read the "AI" of the disclosure as "आई" (Marathi for "mother"). Content then differs between
  conditions, and the neutral arm would sound broken, which would inflate the Marathi preference. A human listen-check may
  reinstate them if the word is in fact audible.
- `M_d175fd` is usable but its within-voice partner is excluded, so it drops out of the design automatically.
- **Unchecked (95).** No human has listened to any clip (the l8 verifier noted this). The field build refuses to run
  until every clip is marked `use` or `exclude` (section 3.5, M1).
- The Maharashtra design is thinner until M2 is done: 11 instead of 12 pairs per listener, and T1-T3 can only be
  compared in Diya's voice (Block B voice mix over 48 pids: Diya 88 of 144 uses per condition). The Bihar and Tamil Nadu designs are complete.

### 3.5 What is missing, exactly (owner actions)

| id | needed before | what, exactly | why |
|---|---|---|---|
| **M1** | field build | One native listener per language (Hindi/Bhojpuri, Tamil, Marathi) plays every clip in `stimuli-qa.csv` and sets `status` to `use` or `exclude`, with `checked_by` and `checked_at`. Check every amount, date and time in the `listen_for` column, the AI disclosure in T1, and these flagged clips: `T_0d794c` (Pallavi, T3: ASR heard the EMI word as "இயமே" and the amount garbled), `B_2ead44` (correct only on the 4th render), `M_c93f2a`, `T_bbf870` (5 render attempts), and all 14 `unchecked_asr_wrote_words` rows. About 25 minutes per language. Then `python3 build_plan.py --field`. | Comprehension answers are only valid if the clip says the right number. |
| **M2** | Maharashtra field build (or run with the thinner design) | Re-render 7 Maharashtra clips with the l8 harness: neutral Hinglish T1, T2, T3 in mr-IN Aarohi and mr-IN Manohar, with "EMI" written ईएमआई and "AI" written एआई; and T4 Marathi mix in hi-IN Diya with ₹1,299 written as words (एक हजार दोनशे नव्याण्णव रुपये) or swapped to a neural voice. ASR round-trip each, add the rows to `manifest.csv` and `stimuli-qa.csv`, rebuild. Azure cost: under ₹10. | Restores the full within-voice Maharashtra design (12 pairs, balanced voices). |
| **M3** | main panel (pilot may run without it) | Two native speakers per language independently review the Bhojpuri, Tamil-English and Marathi texts in `stimuli-text.json`, then reconcile. If they change wording, re-render the affected clips. If they accept the text, record that in `stimuli-qa.csv` notes. | The Bhojpuri text is LLM-written and unreviewed (l5 verifier). A KILL caused by unnatural text would be a verdict on our writing, not on dialect matching. |
| **M4** | Block C (H5 S4/S5). Optional for H6 | Per region (Bihar, Tamil Nadu, Maharashtra): 4 new renewal-call texts, 10-15 s, no AI disclosure, one number each, in the matched register, reviewed by the M3 reviewers. Render each in the region's two product TTS voices, and record each once by a native voice talent (one per language, written consent for research use, same processing chain). That is 12 texts, 24 TTS clips and 12 human recordings. List them in a CSV (`file_code,region,turn,source,voice,voice_role,duration_s,phone_mp3,wideband_mp3`, turn ids `C1`-`C4`, source `human` or `tts`) and run `build_plan.py --blockc FILE`. | Without human references the AUC and the realism headroom cannot be measured. Block C then runs first, before the listener has heard any product voice. |
| **M5** | S1 only (optional) | Light Bhojpuri mix (Hindi grammar with Bhojpuri address forms and discourse markers): 6 turns × Diya and Madhur = 12 clips, plus M3 review. | Tests whether the patronising risk comes from the full mix. |
| **M6** | never for builds | Optional competitor voice per language (for example Sarvam Bulbul), research only, to benchmark the Azure-only ceiling. | Owner decision; builds cannot use it. |
| **M7** | pilot | A native speaker per language reviews the UI text in `app.js` (`I18N`, `OPT`, `COMP`), back-translates the consent and the rating questions, and fixes them. Hindi, Tamil and Marathi are drafts written for this package. | The consent and the scales must mean the same thing in every language. |
| **M8** | pilot | Fill `CONFIG` at the top of `app.js`: the legal name of the study owner, a contact for questions, withdrawal and complaints, the payment amount. The page refuses to start (except in test mode) while these are placeholders. | DPDP-style notice needs a named data fiduciary and a contact. |

## 4. Session design

### 4.1 Order and content (the page enforces all of it)

| step | content | time (estimate; the pilot measures it) |
|---|---|---|
| 0 | Language choice (English, Hindi, Tamil, Marathi), consent (section 7.2), screening (section 2.2) | 4 min |
| 1 | Sound check: a run of 1 kHz beeps (3-7, irregular gaps) generated in the browser; the listener counts them. Two correct rounds needed; 4 attempts at most, else the session ends (`playback_check_failed`). The answer buttons appear only after the beeps have played. | 1 min |
| 2 | **Block C, if M4 exists:** 4 clips (2 human, 2 TTS; which text is human rotates by pid), each played once: real person or computer, confidence 1-3, naturalness 1-5, continue 1-5 | 2.5 min |
| 3 | **Block B, single calls, first hearing:** 6 clips, one per turn, each played **once** (a replay is allowed only if the audio stalls; it is logged). Per clip: 2 comprehension questions, then naturalness (ACR 1-5, every category labelled), trust (1-7), patronising (1-7), accent fit (1-7), continue (1-5). Plus the degraded catch clip (same card, so it looks like any other). | 7 min |
| 4 | **Block A, pairs:** two clips with the same text and voice in different registers (or, for S7, the same text in two voices), played A then B with a 0.7 s gap; replays allowed and logged. "Which caller would you rather keep talking to?" A clearly / A slightly / no difference / B slightly / B clearly. Plus the identical-pair catch. | 7-8 min |
| 5 | Open question: "What, if anything, felt off about these callers?" (optional, any language; coded afterwards into a taxonomy) | 1 min |
| 6 | Debrief, completion code, send answers (section 10.3) | 1 min |

Total about 21 minutes without Block C, 24 with it. Pay assumes 25.

**Why Block B comes before Block A.** Comprehension is valid only on the first hearing of a turn's content. In v0.1
the pairs came first, so every comprehension answer would have been a second or third hearing.

**Why "ABX/MOS" is implemented as paired preference plus ratings.** The brief asks for "ABX/MOS". A true ABX
(discrimination) test is uninformative here: the registers differ in words, so everyone can tell them apart. The
decision needs preference, so Block A is an AB preference test with a "no difference" option; the ABX idea survives as
the identical-pair catch, and MOS is the ACR naturalness scale in Blocks B and C.

### 4.2 Trials per listener

| panel | Block B | Block A | catches (hidden) |
|---|---|---|---|
| Bihar, out-group | 3 Bhojpuri mix + 3 neutral (voices balanced within condition) | 12 pairs: every turn × both voices, Bhojpuri vs neutral | identical pair, degraded clip, instructed row |
| Tamil Nadu | 2 Tamil mix + 2 neutral + 2 Indian English (one per voice each) | 6 Tamil mix vs neutral (P2) + 6 Tamil mix vs Indian English (S2) + 2 Pallavi vs Meera (S7) | same |
| Maharashtra | 3 Marathi mix + 3 neutral | 11 pairs now (12 after M2) | same |

### 4.3 Counterbalancing and randomisation

All assignment is computed offline by `build_plan.py` (seed 20261017) for pids 1-160 per panel and logged in
`plans/schedules.csv` before anyone listens. The page only executes the schedule for its pid. There is no server.

- **Block B (Latin rotation):** for pid row r and turn index t, condition = `conds[(t + r) mod k]`; the voice rotates
  in blocks of k turns, so within a listener every condition gets the same voice mix. Presentation order is shuffled.
- **Block A:** pair positions are alternated *within voice* and the alternation flips with r, so the target plays first
  in exactly half the trials for each voice across listeners (the harvest lesson `alternating-is-not-counterbalanced`).
  A quarter of pairs, rotated by r, play wideband. Order is shuffled with no two adjacent pairs from the same turn.
- **Measured balance over the first 48 pids** (`plans/balance.txt`): Block B gives every listener exactly 3/3 (Tamil
  Nadu 2/2/2) conditions; every (turn, condition) cell is used equally often (Bihar 24 each, Tamil Nadu 16 each); the
  target plays first in 0.50 of trials for every contrast; wideband share 0.25.
- Issue pids **sequentially within a panel** (B001, B002, ...): the balance holds over consecutive pids. Recruiting in
  multiples of 12 keeps every rotation complete.

### 4.4 Catch trials and exclusions (pre-registered)

Three catch trials are hidden among the others:

1. **Identical pair** in Block A (the same file as A and B). Pass: "no difference".
2. **Degraded clip** in Block B, always placed after the real T1 card. Pass: naturalness 2 or lower.
3. **Instructed row** on one Block B card (never the first): "please tap 2 on this row". Pass: 2.

A listener is excluded from analysis if any of these hold:

- they fail **2 or more** of the 3 catches;
- their median Block B answer time (from the end of the clip to "Next") is **below 40%** of their panel's median;
- they fail the screening rule when re-checked;
- the coordinator flags them in an exclusions CSV (`panel,pid,reason`), for example a stated mother tongue contradicted by
  the open text, judged blind to the listener's other answers.

Other data-quality rules:

- Only the first completed session per pid is used.
- Several pids from one device (outside kiosk mode) are flagged for review, not excluded automatically: shared phones are
  common, and excluding them would bias against poorer households.
- A comprehension answer on a card that was re-shown after a page reload (`after_resume`) is dropped; its ratings are kept.

### 4.5 Test-retest

10% of listeners per panel (5 or 6) repeat Block A about a week later with `&retest=1` (same pid; same pairs in a new
order; about 8 minutes). Reported as agreement in direction among non-tie pairs, with a Wilson interval. This is the
ceiling for how stable a preference can look (harvest: the trusted judge agreed with itself 77% of the time).

## 5. Sample size by power calculation

Code: `python3 analysis.py --power --sims 1000` (seed 20261017; about 6 minutes). The simulation feeds the **same
decision function** that the real analysis uses (section 6), so the table describes the rule that will be applied, not
a textbook test.

Model: each listener's preference on the logit scale ~ N(logit p, sd_u), with sd_u 0.5 (moderate heterogeneity) or 1.0
(strong: some listeners love the matched register and some hate it). Item effects (sd 0.3 on the logit scale) are shared
across listeners. 15% of answers are "no difference" and dropped. Rating differences: listener-by-condition slope sd 0.6
and residual sd 1.3 (7-point), 0.3 and 0.9 (5-point ACR). Comprehension: 85% baseline with listener sd 0.8 (logit).
These SDs are assumptions; the pilot measures them, and the power run is repeated with the pilot's values before the
main fielding.

**Preference, primary contrast. P = share of simulated panels reaching PREFERRED; K = share reaching NOT_PREFERRED (kill).**

| panel (pairs per listener) | true p | sd_u | n = 36 | n = 48 | n = 60 |
|---|---|---|---|---|---|
| Bihar / Maharashtra (12 / 11) | 0.50 | 0.5 | P 0.01, K 0.66 | P 0.01, K 0.75 | P 0.01, K 0.83 |
| | 0.60 | 0.5 | P 0.65 | P 0.65 | P 0.65 |
| | 0.65 | 0.5 | P 0.95 | P 0.97 | P 0.97 |
| | 0.65 | 1.0 | P 0.81 | P 0.87 | P 0.89 |
| | 0.70 | 1.0 | P 0.98 | P 0.99 | P 0.99 |
| Tamil Nadu (6) | 0.50 | 0.5 | P 0.05, K 0.49 | P 0.04, K 0.60 | P 0.03, K 0.69 |
| | 0.65 | 0.5 | P 0.86 | P 0.93 | P 0.92 |
| | 0.65 | 1.0 | P 0.70 | P 0.77 | P 0.85 |
| | 0.70 | 1.0 | P 0.91 | P 0.96 | P 0.98 |

**Non-inferiority at n = 48, P(PASS) when the truth is "no difference" / P(FAIL) when the truth is clearly worse:**

| test | Bihar (3 clips per condition) | Tamil Nadu (2) | Maharashtra (3) |
|---|---|---|---|
| patronising, margin 0.5 (truth +1.0 for FAIL) | 0.88 / 0.89 | 0.80 / 0.82 | 0.88 / 0.90 |
| naturalness, margin 0.3 (truth −0.6) | 0.84 / 0.81 | 0.70 / 0.67 | 0.78 / 0.80 |
| comprehension, margin 10 points (truth −20) | 0.93 / 0.83 | 0.86 / 0.68 | 0.96 / 0.84 |

**What this buys, stated plainly.**

- **False adoption is controlled.** At a true p of 0.50, PREFERRED occurs in 1-5% of panels at every n.
- **48 analysed listeners reliably detect a preference of 0.65 or more** (0.84-0.97 for Bihar and Maharashtra, 0.77-0.93
  for Tamil Nadu). That is the effect size this panel is built for.
- **A true preference of 0.60 is detected only about half the time** (0.47-0.68 at n = 48), even at n = 60, because the rule also
  requires the point estimate to reach 0.58 and the item effects move it. A panel of 30-60 listeners per region cannot
  resolve p = 0.60 from p = 0.55. v0.1 planned 75 analysed per panel for that. Within the owner's 30-60 range,
  INCONCLUSIVE is the honest outcome for a small true preference.
- **Killing works.** At a true p of 0.50, NOT_PREFERRED is reached 46-75% of the time at n = 48, depending on the
  panel and the heterogeneity. Almost all of the rest are INCONCLUSIVE; PREFERRED stays at 1-5%.
- **Tamil Nadu's Block B has only 2 clips per condition** (three conditions share six turns), so its naturalness and
  comprehension tests are weaker (0.70 and 0.86). The l5 prior says the Tamil preference is strong, and the decision
  there rests on preference.
- **Moving from 48 to 60** adds 2-12 points of power to the non-inferiority tests and 0-8 points to the preference
  tests. Hence 48 analysed, 56 recruited.
- **Minimum viable (30 analysed):** PREFERRED at p = 0.70 with probability 0.85-1.00. Patronising non-inferiority passes
  only 0.59-0.76 of the time, so expect more INCONCLUSIVE verdicts. A null at this size is "under-powered", not "no preference".

## 6. Analysis plan (implemented in `analysis.py`; standard-library Python)

### 6.1 Preference

For every pair, "target" is the first-named condition: the matched register for P1, P2 and S6; the Tamil mix for S2;
the native-locale voice for S7.

- **Main estimate.** Ties ("no difference") are dropped. p = target choices / non-tie trials, using the ratio estimator
  with listener-cluster variance.
- **Intervals reported.**
  - The naive Wilson 95% interval (the task's requested statistic).
  - **The Wilson interval adjusted for listener clustering. The decisions use this one.** The effective n is trials /
    DEFF, where DEFF is the estimated design effect (floored at 1), and the z value is replaced by the t quantile with
    listeners − 1 degrees of freedom.
  - A listener-cluster bootstrap (10,000 resamples).
- **Sensitivity.** A ties-split version counts each tie as half a target choice.
- **Where reported.** Per panel × condition pair, then by channel, by turn (a reversal in any script is flagged by
  inspection) and by age group (45+ vs under 45).
- **Heterogeneity.** The SD of per-listener preference, and the counts of listeners favouring each side.

### 6.2 Ratings and comprehension

- **Ratings.** Means of listener means with t intervals, per panel × condition.
- **Comprehension.** The share of questions answered correctly, with naive and adjusted Wilson intervals.
- **Tests.** Every test runs on the **within-listener difference** (matched − neutral, averaged over that listener's
  clips): a one-sided 95% t bound against the margin.

### 6.3 Non-inferiority margins (pre-registered)

| test | margin | PASS | FAIL |
|---|---|---|---|
| patronising (P3) | +0.5 on 7 points | upper bound of (matched − neutral) < 0.5 | lower bound > 0.5 |
| comprehension (S3) | −10 percentage points | lower bound > −0.10 | upper bound < −0.10 |
| naturalness (producibility) | −0.3 on the 5-point ACR | lower bound > −0.3 | upper bound < −0.3 |

Anything between PASS and FAIL is INCONCLUSIVE. v0.1 had a 5-point comprehension margin. The simulation shows that is
almost never resolvable at 30-60 listeners, so this version widens it to 10 (section 14).

### 6.4 Preference verdict

- **PREFERRED:** adjusted lower bound > 0.50 **and** p ≥ 0.58 (the smallest preference worth acting on).
- **NOT_PREFERRED (kill):** adjusted upper bound < 0.58, meaning even the most favourable reading is below a preference
  worth acting on. This includes "prefers neutral".
- **INCONCLUSIVE** otherwise.
- **No verdict below 24 analysed listeners**, because a design effect estimated from fewer clusters is unreliable. The
  pilot can never produce a verdict.

### 6.5 Exclusions

As in section 4.4. They are applied before any estimate, and `--quality-only` shows them without effects.

### 6.6 H6 kill criterion: verdict per region

The brief's H6 kill: *listeners do not prefer it, or we cannot produce it at our quality bar.* `analysis.py` applies
this, in order, per region (Bihar, Tamil Nadu, Maharashtra; matched register vs neutral Hinglish):

1. Preference NOT_PREFERRED → **KILL (not preferred).**
2. Naturalness FAIL or comprehension FAIL → **KILL (not producible at our quality bar):** the matched register is clearly
   less natural or less understood than what we would otherwise ship.
3. Patronising FAIL → **KILL (patronising).**
4. PREFERRED, and patronising, comprehension and naturalness all PASS → **ADOPT**, with a condition:
   - **Bihar (dialect).** Expected value EV = P(correct region inference) × (2·p_in − 1) − (1 − P) ×
     max(0, 1 − 2·p_out), where p_in and p_out are the Bihar and out-group preferences for the Bhojpuri mix. Supply
     P with `--p-correct-inference`, from the region-inference analysis. If EV > 0, adopt with an inferred region. If
     EV ≤ 0 or P is unknown, **adopt on customer opt-in only** (a language button on WhatsApp, or the customer's
     first turn).
   - **Tamil Nadu, Maharashtra (language).** Adopt when the customer's language is known: a CRM field, the customer's
     choice, or first-turn language ID. No out-group cost is measured for these.
5. Anything else → **INCONCLUSIVE.** Under-powered is its own verdict, never "no preference".

The summary line states the dialect verdict (Bihar) and the language verdicts separately. **H6 as a whole is killed only
if all three regions are KILL.** If an ADOPT verdict does not survive the Holm correction for P1-P4, it is marked "not
robust to multiplicity". The tidy CSV (`--tidy`) is provided for a mixed-model sensitivity check in R, which is reported
but does not decide:

```r
glmer(chosen_target ~ 1 + (1 | pid) + (1 | item), family = binomial,
      data = subset(tidy, kind == "pair" & panel == "bihar" & contrast == "bhojpuri_mix vs neutral_hinglish"))
clmm(factor(patr) ~ condition + (1 | pid) + (1 | item), data = subset(tidy, kind == "rate" & panel == "bihar"))
```

### 6.7 No peeking

The sample size is fixed (section 2.1). There is one interim look at about 20% of each panel, and it is
`analysis.py --quality-only`: completions, screen-outs, catch pass rates, exclusions, session length and quota
composition. It shows no effects. Pilot sessions (`mode=pilot`) are never pooled; `--include-pilot` exists only for
checking the pipeline.

### 6.8 H5 screen (S4, S5)

- **Within-listener naturalness → continue.** A repeated-measures correlation over Block B clips, with a Fisher-z
  interval, per panel and pooled; trust → continue likewise.
- **With Block C:**
  - the AUC of the computer-likeness score (computer = +confidence, human = −confidence) separating TTS from human, with
    a listener bootstrap (0.5 means listeners could not tell);
  - the share of TTS judged "computer";
  - naturalness and continue for TTS vs human, which is the S5 headroom;
  - within listener, continue-intent when a clip is judged "computer" minus when it is judged "human".
- **Limit.** The H5 kill condition (no outcome evidence and no cheap test) is not decided by this panel. The panel
  provides the screen and points to Stage 2 (section 12).

### 6.9 Self-test

`python3 analysis.py --selftest` runs 4 synthetic panels of 48 listeners, built from the real schedules with known truth,
through the whole pipeline. Bihar with p = 0.50 must not be ADOPT. Tamil Nadu with p = 0.78 must be PREFERRED.
Maharashtra with naturalness −0.9 must be KILL (not producible). Out-group with p = 0.30 must come out below 0.5. One
speeder and one catch-failer must be excluded. Checksums must verify. All 9 checks pass on this build.

## 7. Ethics, consent and data

### 7.1 Principles

- **Adults only.** Under-18 answers end the session and nothing is stored.
- **Voluntary.** A listener can stop at any time. Incomplete sessions are never analysed.
- **Deception and debrief.** There is no deception beyond blinding: the consent says some voices are computer-generated
  and the businesses are made up. The debrief states the dialect question and, without Block C, that every voice was
  computer-generated.
- **No voice is recorded.** No name or phone number is stored with the answers. Payment details stay with the
  coordinator, separate from the answers, and are deleted after payment.
- **Retention.** 12 months after the study ends, then deletion. Results are published only as group totals.
- **Withdrawal.** By pid via the contact named in `CONFIG`.
- **Gentle content.** The scripts carry no debt or health stress. No collections script is used; collections needs its
  own protocol, because warmth there is the most regulated (RBI recovery conduct) and the most likely to read as pressure.
- **Roles.** The owner is the data fiduciary under DPDP. Each coordinator processes data on the owner's behalf and signs
  a one-page agreement covering scope, no coaching, the quota sheet, payment-data handling and deletion (`recruit.md`).
- **WhatsApp.** Sending answers over WhatsApp exposes the sender's number to the coordinator and the message to Meta.
  The answer code contains no name or number. The consent says the coordinator sees the number. The coordinator saves
  the code into a file named by pid and deletes the chat after payment.

### 7.2 Consent text (version `c2-2026-10-17`; `{owner}`, `{contact}`, `{amount}`, `{months}`, `{pid}` filled by the page)

English (the Tamil and Marathi versions are in `app.js`; all three Indian-language versions are drafts pending M7):

> This is a research study run by {owner}. We want to learn how people feel about different phone callers.
>
> What you will do: listen to about 30 short recordings (10 to 15 seconds each) and answer questions. It takes about 25 minutes.
>
> What we record: your answers, age group, gender, home state and district, the state you live in now, the languages you speak, your education level, and what kind of phone and earphones you use. We do not record your name, phone number or voice with your answers. Your coordinator sees your phone number and UPI details when you send answers or get paid; they keep these separately from the answers, use them only to pay you, and delete them after payment.
>
> Payment: ₹{amount} by UPI after you finish.
>
> Your choice: taking part is voluntary. You can stop at any time by closing this page; if you stop before the end, your answers are not used. To withdraw answers you have already sent, contact {contact} with your participant code {pid} within {months} months and we will delete them.
>
> We keep the answers for {months} months after the study ends, then delete them. Results are published only as group totals. For questions or complaints about your data, contact {contact}.
>
> Some voices you will hear are computer-generated, and the shops and companies in the calls are made up. There are no right or wrong answers, except a few questions that check you are listening.
>
> [I am 18 or older and I agree to take part] [I do not want to take part]

Hindi (draft):

> यह {owner} द्वारा किया जा रहा एक शोध अध्ययन है। हम जानना चाहते हैं कि लोगों को अलग-अलग फ़ोन कॉल करने वाले कैसे लगते हैं।
>
> आपको क्या करना है: लगभग 30 छोटी रिकॉर्डिंग (हर एक 10 से 15 सेकंड की) सुनकर सवालों के जवाब देने हैं। इसमें लगभग 25 मिनट लगेंगे।
>
> हम क्या दर्ज करते हैं: आपके जवाब, उम्र का समूह, लिंग, आपका गृह राज्य और ज़िला, आप अभी किस राज्य में रहते हैं, आप कौन-सी भाषाएँ बोलते हैं, आपकी पढ़ाई, और आप कौन-सा फ़ोन और ईयरफ़ोन इस्तेमाल करते हैं। हम आपके जवाबों के साथ आपका नाम, फ़ोन नंबर या आवाज़ दर्ज नहीं करते। जवाब भेजते या भुगतान लेते समय आपके कोऑर्डिनेटर आपका फ़ोन नंबर और UPI जानकारी देखते हैं; वे इन्हें जवाबों से अलग रखते हैं, सिर्फ़ भुगतान के लिए इस्तेमाल करते हैं, और भुगतान के बाद मिटा देते हैं।
>
> भुगतान: पूरा करने के बाद UPI से ₹{amount}।
>
> आपकी मर्ज़ी: भाग लेना आपकी इच्छा पर है। आप यह पेज बंद करके कभी भी रुक सकते हैं; अगर आप बीच में रुकते हैं तो आपके जवाब इस्तेमाल नहीं होंगे। भेजे जा चुके जवाब वापस लेने के लिए {months} महीनों के अंदर अपने प्रतिभागी कोड {pid} के साथ {contact} से संपर्क करें, हम उन्हें मिटा देंगे।
>
> अध्ययन खत्म होने के बाद हम जवाब {months} महीने तक रखते हैं, फिर मिटा देते हैं। नतीजे सिर्फ़ समूह के कुल आँकड़ों के रूप में छपते हैं। अपने डेटा के बारे में सवाल या शिकायत के लिए {contact} से संपर्क करें।
>
> आप जो कुछ आवाज़ें सुनेंगे वे कंप्यूटर से बनी हैं, और कॉल में आने वाली दुकानें और कंपनियाँ काल्पनिक हैं। कोई जवाब सही या गलत नहीं है, सिवाय कुछ सवालों के जो यह जाँचते हैं कि आप ध्यान से सुन रहे हैं।
>
> [मेरी उम्र 18 साल या उससे ज़्यादा है और मैं भाग लेने के लिए सहमत हूँ] [मैं भाग नहीं लेना चाहता/चाहती]

**Debrief (shown after the last answer).** It explains the study question: whether people prefer callers who speak their
own language or local way of speaking, and whether that sounds respectful. It also says which voices were
computer-generated and that answers are used only for this research.

## 8. Compensation

| item | suggestion | note |
|---|---|---|
| Completed session (about 25 min) | **₹250 by UPI** (about ₹10/min) within 72 hours of the answers arriving | Pay **every** completed session, including those later excluded by catch trials or timing. Exclusion is an analysis rule, not a penalty. Withhold only for a duplicate pid or an impossible session (finished faster than its audio can play). |
| Screened out in the first 2 minutes | nothing, stated in the invitation | The screen is short by design. |
| Sound check failed | ₹20 mobile recharge (optional) | They tried in good faith. Budget about 5%. |
| Pilot listener | ₹250 + ₹100 for a 10-minute feedback call | The pilot's job is to find what confuses people. |
| Retest (about 8 min) | ₹100 | 10% of listeners. |
| Regional coordinator | ₹10-15k per panel (recruitment, quota tracking, payments, kiosk sessions) | Estimate, not quoted. Agreement per `recruit.md`. |
| Native reviewers (M1, M3, M7) | ₹1,500-3,000 per language per task | Estimate. |
| Human voice talent (M4) | ₹3-5k per language for 4 short scripts, with written research-use consent | Estimate. Owner action. |

**Budget at target size.**

- Listeners: 210 × ₹250 = ₹52,500.
- Pilot: 12 × ₹350 = ₹4,200.
- Retest: about 20 × ₹100 = ₹2,000.
- Coordinators: ₹40-60k.
- Reviewers and voice talent: about ₹20-35k.
- **Total: about ₹1.04-1.23 lakh** for listeners, coordinators, pilot and retest (itemised in `recruit.md` section 8),
  **or about ₹1.25-1.6 lakh** with reviewers and voice talent bought in. Minimum viable (36 recruited per region panel):
  about ₹80-90k.
- These are estimates, not vendor quotes. They fall outside the Azure cap, so the owner approves them. The ₹10/min rate
  is deliberately generous relative to local daily wages (compare with the current state MGNREGA rate). That keeps
  attention high, so screening and single-use links matter (`recruit.md`).

## 9. Pilot (before freezing)

- **Who.** 12 listeners: 3 per panel, recruited the same way, using links with `&mode=pilot`. Pilot pids are the
  first pids of each panel. The main panel restarts at pid 1, because pilot data is never pooled.
- **What it checks:**
  - playback on low-end Android phones over mobile data, and on one iPhone;
  - session length (target ≤ 25 min);
  - translation problems and confusing questions, from the feedback call;
  - catch-trial behaviour;
  - stalls and resumes;
  - the within-listener SDs of the rating differences.
- **Re-run.** `analysis.py --power` is re-run with the observed SDs. If they are much larger than assumed, raise n
  towards 60 before freezing.
- **Change triggers.** A median session over 30 minutes, more than 20% failing a given catch, more than 10% failing the
  sound check, or any question misunderstood by 2 or more pilot listeners. Fix, rebuild, and pilot again if the change
  is material.

## 10. Fielding runbook

### 10.1 Before

1. Complete M1 and M8 (and M2, M3 and M7 if possible).
2. Run `python3 build_plan.py --field`. It refuses while any used clip is unchecked.
3. Run `python3 analysis.py --selftest`; all 9 checks should pass.
4. Run `python3 build_plan.py --bundle /some/folder/outside/the/repo`. This copies only `index.html`, `app.js`, `plans/*.js`,
   `catch/*.mp3` and the used audio, and never `manifest.csv`, `stimuli-text.json` or the QA sheet, which would unblind.
   Upload that folder to any static HTTPS host, for example an Azure Storage static website (`$web` container, fits the
   Azure-only rule, costs very little). HTTPS is needed for the Share button and for reliable audio on phones. The page
   sets `noindex`. Do not post the base URL publicly.
5. Generate one link per pid: `python3 build_plan.py --links bihar 1 60 --base https://HOST/listener-panel/` (add
   `--lang en` to override the default language). Give each coordinator only their panel's sheet.
6. Freeze the protocol (hashes, top of this file).

### 10.2 During

- **Single-use links.** Each pid goes to one person, by direct message, never a group post. The page keys its schedule
  and its duplicate check on the pid.
- **Daily.** The coordinator updates the quota sheet. The owner runs `--quality-only` on the answers received.
- **Kiosk sessions** for older or low-literacy listeners. The coordinator brings phones and wired earphones and uses
  `&mode=kiosk&assisted=1`. The coordinator may read on-screen text aloud verbatim and must never comment on the voices.
  `assisted` is recorded and reported. At the end of the day, open `index.html?coordinator=1` on each kiosk phone,
  "Export all (JSON)", then delete.

### 10.3 Getting answers back (no server)

At the end, the listener chooses "Send (WhatsApp or email)". This uses the phone's share sheet, sending a JSON file
where supported, or the answer code as text. Other options are "Download answer file", "Download table (CSV)" and
"Copy answer code". Answers also stay in the phone's local storage until sent. The coordinator saves everything into
one folder: `.json`, `.csv`, and `.txt` files of pasted WhatsApp messages are all read; answer codes are found
anywhere in a text file. The completion code shown to the listener is the session checksum. The coordinator checks it
before paying, and `analysis.py` re-verifies it.

### 10.4 After

```
python3 analysis.py answers/ --exclusions coordinator-exclusions.csv --md report.md --out results.json --tidy trials.csv
```

For Bhojpuri, add `--p-correct-inference P` once the region-inference accuracy is known. Score `../predictions.md` H6
from `report.md`.

## 11. Timeline (indicative)

| week | step |
|---|---|
| 1 | M1 listen-checks, M3 and M7 reviews, M8 config; M2 re-renders; M4 recordings if wanted; hire coordinators |
| 2 | Pilot (12), feedback calls, power re-run, fixes; freeze and hash |
| 3-4 | Field the four panels; daily quota and quality checks; pay within 72 h |
| 5 | Retest (10%), analysis, report; score H6 |

## 12. Stage 2: the outcome test (unchanged from v0.1 section 10)

The panel cannot show conversion. The first consented pilot campaign randomises register **per call** (matched, where
the region is known from a CRM field or the customer's choice, vs neutral), stratified by region. Outcomes:

- early hang-up within 10 s after the disclosure;
- qualified rate;
- booking or payment rate.

Sizes per arm from `../lanes/l5-human-dialect/panel-power.json`:

| effect | n per arm |
|---|---|
| early hang-up 15% → 10% | 686 |
| qualified 20% → 25% | 1,094 |
| booking 10% → 13% | 1,774 |

Pool across tenants, or use early hang-up as the leading indicator.

## 13. Files in this package

| file | role |
|---|---|
| `protocol.md` | this document |
| `index.html`, `app.js` | the static test page (no server, no network calls: CSP `connect-src 'none'`). Four UI languages, resume after reload, coordinator export view, test mode for automation |
| `plans/<panel>.js` | generated schedules for pids 1-160 per panel; no condition or voice labels (checked) |
| `plans/schedules.csv`, `plans/balance.txt` | the logged assignment and its measured balance |
| `catch/catch_<region>.mp3` | degraded catch clips |
| `build_plan.py` | builds plans and catch clips; `--field`, `--blockc`, `--links`, `--bundle` |
| `stimuli-qa.csv` | listen-check sheet for all 102 clips (7 excluded with reasons, 95 to check) |
| `analysis.py` | analysis, `--quality-only`, `--power`, `--selftest`; standard library only |
| `recruit.md` | how to recruit 30-60 listeners per region cheaply and ethically |

**Verified in this build.** Headless Chromium ran 40 complete sessions plus a retest across the four panels, in
English, Hindi, Tamil and Marathi, at 360 px. These checks passed:

- no page errors;
- no request leaving the host;
- every clip played in those sessions reached its end;
- JSON, CSV and pasted-code exports all parsed;
- JS and Python checksums agreed;
- flow tests passed for file://, unconfigured field mode, bad links, the four screen-out kinds, a failed sound check,
  hidden-until-played answers, resume after a reload, retest, coordinator export, Block C with stand-in clips, and the
  bundle served alone, which returns 404 for the manifest.

**Not verified.**

- Real phones, iOS Safari's audio unlock for the A-then-B sequence, and slow mobile networks: the pilot checks these.
- The Tamil and Marathi UI text.
- Any human listening to any clip.

## 14. Changes from v0.1 and why

| # | v0.1 | v1.0 | reason |
|---|---|---|---|
| 1 | Block A (pairs) before Block B (ratings) | Block B first; Block C (if any) before both | Comprehension must be a first hearing; human-or-computer judgements must come before any product voice is familiar |
| 2 | 3 scripts × 3 turns; light and full Bhojpuri; human reference D | The rendered set: 6 single turns; full Bhojpuri only; no human reference yet | Designed around stimuli that exist; missing ones listed as M2-M5 |
| 3 | Maharashtra secondary, 60 analysed | Full region panel, 48 analysed | It is language matching, which SYNTHESIS ranks ahead of dialect |
| 4 | 75 analysed per primary panel | 48 per region panel, 36 out-group | The owner's range is 30-60 per region; the simulation shows what 48 buys (p ≥ 0.65) and what it cannot (p = 0.60) |
| 5 | Logistic mixed model primary | Clustering-adjusted Wilson + listener bootstrap, frozen as code; mixed model as a sensitivity check | Runnable by the owner with no packages; the code is the pre-registration |
| 6 | "Preferred" threshold only | Adds NOT_PREFERRED (kill), producibility (naturalness non-inferiority), and no verdict below 24 listeners | Makes the brief's H6 kill criterion decidable in both directions; a pilot-sized sample must never decide |
| 7 | Comprehension margin 5 points | 10 points | 5 points is unresolvable at 30-60 listeners |
| 8 | 45+ about a third | ≥ 33% aged 45+, 60+ reported, older-listener breakdown | The wedge's customers are older (SYNTHESIS) |
| 9 | Server-side randomisation | Offline schedules, logged before fielding; static page | No server; reproducible; auditable |
| 10 | Pay after quality checks | Pay every complete; exclusion is not a penalty | Fairness, and no incentive to dispute catch trials |
| 11 | Stimulus QA by ASR only | 7 clips excluded with reasons; a human listen-check gates the field build | New finding: mr-IN voices drop "EMI" and garble "AI" in Hinglish text |
| 12 | Tamil Nadu: S2 = Hinglish vs Indian English | S2 = Tamil mix vs Indian English (6 trials); Hinglish vs Indian English kept only in the Block B ratings; S7 voice comparison added | The product question in Tamil Nadu is Tamil vs English, and which Tamil voice to ship |
