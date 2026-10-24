# Listener panel protocol v2.0: renewal-call comprehension and trust, older listeners first

VP research programme, round 2, 2026-10-17. Package `r2-listener-panel` (critic item A13). Supersedes v1.0, which is kept
as `protocol.round1.md`. Section 14 lists every change and its reason.

**Status: ready for the owner actions in section 3.5. Nothing has been fielded, and no person has listened to any clip.**

## Pre-registration and freeze

- The predictions are registered in `panel-predictions.md`, written before any round-2 audio was rendered. The text of
  `../predictions.md` is not edited.
- **Freeze before the first main-panel listener** (not before the pilot). Run:
  `sha256sum protocol.md analysis.py build_plan.py app.js index.html plans/*.js stimuli-qa.csv ../lanes/l8-azure-bench/stimuli-round2/manifest*.csv`
  and paste the output into `panel-predictions.md` §8.
- The verdict is whatever `analysis.py` prints on the frozen files.

**What this panel is.** A screen of comprehension, stated trust, fraud suspicion, naturalness and preference for renewal
calls heard on a phone line. It is not an outcome test. Renewal conversion is tested only in the consented,
holdout-controlled pilot (section 12; SYNTHESIS kill criterion 7).

**Why v2.** The beachhead is renewal and lapse-revival calls to (often older) retail policy-holders. v1 had one renewal
turn in six, no age-60+ stratum, no human reference and no competitor arm (CRITIC A13). In v2:
- all 8 rated turns are renewal turns: motor, health, life lapse revival, the payment-link hand-off, and number
  read-back;
- the primary panel is Hindi-belt listeners, stratified 60+ and 18-59;
- the regional-language and dialect arms are kept, secondary, on the same renewal turns.

---

## 1. Hypotheses

**Confirmatory family** (Holm-adjusted across the four, one-sided, family alpha 0.05):

| id | hypothesis | panel | rule (frozen in `analysis.py`) |
|---|---|---|---|
| **E1** | Older listeners understand the product-default renewal call: per-question comprehension on neural, default-pace clips is at least 0.80 | `hindi_60plus` | **PASS** if point ≥ 0.80 and the clustering-adjusted Wilson lower bound > 0.70. **FAIL** if the adjusted upper bound < 0.80. Otherwise INCONCLUSIVE |
| **E2** | Slowing to 0.85× speed improves older listeners' comprehension | `hindi_60plus` | **PASS** if the one-sided 95% lower bound of the within-listener (slow − default) comprehension difference is > 0. **WORSE** if the upper bound < 0 |
| **T1** | Listeners prefer the HD voice to the neural voice at equal pace | both Hindi panels, pooled | **PREFERRED** if the adjusted lower bound > 0.50 and p ≥ 0.58. **NOT_PREFERRED** if the upper bound < 0.58 |
| **S1** | A fraud-safety line makes the payment-link hand-off more trusted. Pair question: "Which caller would you trust more to send you a payment link?" | both Hindi panels, pooled | same preference rule as T1 |

If a PASS or PREFERRED verdict does not survive Holm, it is marked "not robust to multiplicity".

**Secondary** (intervals reported; they never decide alone). These are E1b, E1c, E3, E4, P5, T2, S2, F1-F3, H1-H3, K1, K2
and L1-L5/D1-D2, all listed with priors in `panel-predictions.md` §4. They include:
- slow-pace preference and patronising non-inferiority (margin 0.5 on 7 points) at 60+ and at 18-59;
- the fraud-suspicion item;
- the human-reference and competitor arms (when recorded);
- the regional verdicts.

**Regional family** (v1's H6 rule, unchanged, on renewal turns; Holm across L1, L4 and D1): Tamil-English vs neutral
Hinglish in Tamil Nadu (L1), Marathi mix vs neutral Hinglish in Maharashtra (L4), and, in an optional panel, the Bhojpuri
mix in Bihar (D1). Verdict per region: ADOPT / KILL / INCONCLUSIVE, as in v1 §6.6. Preference, patronising,
comprehension and naturalness are tested against the same margins.

## 2. Panels and eligibility

### 2.1 Panels and sample size (justified in section 5)

| panel | stimuli | analysed | recruit (complete sessions) | pid prefix | UI default | priority |
|---|---|---|---|---|---|---|
| `hindi_60plus` (aged 60+) | hindi set | **48** | 56 | E | Hindi | primary |
| `hindi_18to59` (aged 18-59, ≥ 12 aged 45-59) | hindi set | **36** | 42 | H | Hindi | primary |
| `tamilnadu` | Tamil Nadu set | 36 | 42 | T | Tamil | secondary |
| `maharashtra` | Maharashtra set | 36 | 42 | M | Marathi | secondary |
| `bihar` (Bhojpuri) | Bihar set | 30 | 36 | B | Hindi | optional: run only after the four above |
| `outgroup` (non-Bhojpuri Hindi) | Bihar set | 24 | 28 | O | Hindi | optional: only together with `bihar` |
| **Main four** | | **156** | **182** | | | |

**Strata are recruited through separate links.** The page enforces the age band for `hindi_60plus` and `hindi_18to59`
(screen-out code `age_stratum`), so each stratum keeps its own consecutive pid sequence and its own counterbalancing.

**Stopping rule.** Recruit until the analysed target passes the exclusion rules, or 1.25× the target has completed,
whichever comes first. Exclusions depend only on catch trials, timing and screening, never on effects.
`analysis.py --quality-only` shows the count without effects.

**No verdict below 24 analysed listeners.** A pilot-sized panel never decides.

### 2.2 Eligibility (enforced by the page; re-checked by `analysis.py`)

| panel | rule |
|---|---|
| `hindi_60plus` / `hindi_18to59` | Age band as named. Mother tongue Hindi or a Hindi-belt language (Bhojpuri, Maithili, Magahi, Haryanvi, Rajasthani, Awadhi). Home state in the Hindi belt: UP, MP, Bihar, Delhi, Haryana, Rajasthan, Jharkhand, Chhattisgarh, Uttarakhand or Himachal. Hindi spoken at home or understood well |
| `tamilnadu`, `maharashtra`, `bihar`, `outgroup` | As v1 §2.2 |

Every panel screens out:
- anyone under 18 (nothing is stored);
- anyone who worked in the last 12 months in telecalling, a call centre or BPO, or for an AI or voice-software company;
- anyone who knows the study team;
- repeat participants.

### 2.3 Quotas (tracked daily; `analysis.py` reports misses)

| panel | quota |
|---|---|
| `hindi_60plus` | At least 25% aged 70+. At least 40% women. At least 35% village or small town. At least 30% schooling below graduation. **At least 60% from a household holding a health, vehicle or life policy** |
| `hindi_18to59` | At least 12 listeners aged 45-59. Same women, place, schooling and policy-holder quotas |
| regional panels | **At least 30% aged 60+** (the elderly stratum within each region). At least 40% women. At least 35% village or small town. At least 30% below graduation. At least 20% migrants |

New screening items in v2, each recorded and used as a covariate, not as an exclusion:
- difficulty hearing on phone calls (no / a little / a lot / hearing aid);
- a household policy-holder (yes / no / don't know);
- a renewal call received in the last 12 months.

Hearing difficulty is **not** an exclusion: such listeners are real renewal customers. The sound check (section 4.1)
remains the only playback gate.

### 2.4 Procedures for older listeners

- **Kiosk sessions** (`recruit.md` §6) are the default route for 60+. The coordinator brings phones and wired
  earphones and uses `&mode=kiosk&assisted=1`. In assisted mode the coordinator reads on-screen text aloud word for word
  and never comments on the voices.
- **Larger text:** an "A+" toggle on the welcome screen, or `&big=1` in the link. It is recorded in the session.
- **Payment safety.** The consent says the study never asks for money, an OTP, bank details or policy numbers, and that
  no payment link will be sent. The debrief ends with an OTP-safety reminder. This matters because the stimuli are
  exactly the shape of a renewal scam call (the fraud evidence in `../lanes/r2-untouched-raw/`).
- **Session length** target: 25 minutes or less. If the pilot's median at 60+ is over 30 minutes, apply the cut in
  section 9.

## 3. Stimuli

### 3.1 What exists

The clips are at `../lanes/l8-azure-bench/stimuli-round2/`:
- 210 active blind clips in phone-band and wideband versions;
- `manifest.csv` holds the key;
- `stimuli-text.json` holds the texts and their authors;
- `calibration.json` holds the HD rate-matching;
- `qa-attempts.csv` logs every render attempt.

Rendering used `../lanes/l8-azure-bench/harness/render_stimuli_round2.py` and `stimuli_text_round2.py`. The companies
are fictional (Saathi Insurance), and the personas are Asha (F) and Amit (M).

**Turns.** All 8 rated turns are renewal turns, 8-15 s at default pace:

| turn | line | content | key tokens (checked by ASR) | comprehension questions (4 options, near-miss distractors) |
|---|---|---|---|---|
| R1 | health | opening, **AI disclosure**, due date | AI disclosure; 15 November | who was speaking (AI assistant); due date |
| R2 | health | premium incl. GST, sum insured, confirmation question | ₹24,850; 5 lakh | premium (vs ₹28,450 / ₹24,580 / ₹2,485); sum insured |
| R3 | 4W motor | vehicle-number digits "4 7 2 9", expiry, premium with NCB | 4729; 28 October; ₹11,240 | expiry date; premium (vs ₹12,140 / ₹11,420 / ₹1,124) |
| R4 | 2W motor | policy already expired, premium if renewed today | 12 October; ₹1,538 | expiry; premium (vs ₹1,583 / ₹1,358 / ₹15,380) |
| R5 | life | lapse revival: missed instalment, revival amount, late fee | 15 August; ₹18,600; ₹420 | revival amount; late fee |
| R6 | life | revival deadline, advisor callback | 31 December; 6 pm | deadline; callback time |
| R7 | health | payment-link hand-off on WhatsApp (plain). The **safety variant** adds "we never ask for an OTP on a call; you can also pay in the company's app" | WhatsApp; 24 hours (+ OTP) | where the link comes; how long it works |
| R8 | life | number read-back: instalment, date, phone-number digits "4 3 2 1" | ₹7,365; 5 January; 4321 | instalment; last digits (vs 4312 / 3421 / 1234) |
| C1-C4 | | Block C texts without AI disclosure: instalment option, callback promise, adding a parent, "already renewed" close | one number each (C4 none) | none (human-or-computer judgement) |

The AI disclosure is spoken in R1 in every register, as the product always discloses.

**Text authorship.**
- The neutral-Hinglish texts and the safety variant were written by hand, to control number formats and product rules:
  - a short telephone register;
  - no promotion or cross-sell;
  - identifiers read digit by digit;
  - amounts and dates as digits.
- The Bhojpuri, Tamil-English, Marathi and Indian-English registers were written by gpt-6-sol (a temporary DataZone
  deployment, deleted after use) from those texts. Two edits were then made, each recorded with its reason in
  `stimuli-text.json`.
- No native speaker has reviewed any text (M3).

**Voices** (all Azure; the evidence for each choice is in the role column):

| set | voices | tier, rate | role |
|---|---|---|---|
| hindi (primary) | hi-IN **Swara** (F), **Madhur** (M) | neural, default rate; slow = 0.85× | product voices: 0/20 Indian-format number misreads each in the l8 probe; Swara was the TTS in the only round-2 India cascade that met the 1.5 s latency bar |
| hindi | en-IN **Meera**, **Arjun** DragonHD | HD, **rate-matched** to Swara/Madhur (−25.2% / −32.0%, from a calibration render of R1-R8); slow = 0.85× of that | the tier contrast compares voice quality at equal pace. At rate 0 the HD voices finish the same text 18-36% sooner (median duration ratio 0.75 / 0.68) |
| Bihar | Swara, Madhur (Bhojpuri mix and neutral; the neutral clips are shared with the hindi set) | neural, default | within-voice register contrast |
| Tamil Nadu | Meera, Arjun HD (Tamil-English, Indian English, neutral Hinglish) at their own default rate; native ta-IN **Pallavi** (F), **Valluvar** (M) on Tamil-English | HD and native, rate 0 | register contrast within voice; native vs HD = which Tamil voice to ship |
| Maharashtra | en-IN **AartiIndic** (F), **ArjunIndic** (M) speak Marathi mix and neutral Hinglish; native mr-IN **Aarohi**, **Manohar** on the Marathi mix | multilingual neural and native, rate 0 | within-voice register contrast; replaces v1's preview Diya voice, which misread numbers |

Not used:
- hi-IN-Diya DragonLatest: misread ₹1,299 in 10/13 round-1 renders;
- MAI-Voice-2.1: preview, no meter, and trailing junk audio in 7/20 and 11/20 l8 renders.

### 3.2 Channel and processing

Same chain as round 1:
1. synthesis at 24 kHz;
2. leading and trailing silence trimmed to about 150 ms;
3. loudness normalised to −16 LUFS;
4. two outputs: a wideband mp3 (96 kbps) and a phone-band mp3 (300-3,400 Hz, 8 kHz G.711 μ-law round trip).

Playback:
- **Primary channel:** phone band, for all of Block B and three quarters of Block A.
- About 20-25% of pairs play wideband, but never competitor pairs, whose captures are 16 kHz WebRTC.
- External recordings (human, competitor) go through the identical chain (`ingest_external.py`).

### 3.3 Catch stimuli (`catch/catch_<set>.mp3`, made by `build_plan.py`)

One degraded clip per stimulus set, made from an R1 clip:
- about 0.45 s of speech silenced mid-utterance, plus hard clipping;
- then −16 LUFS and the phone chain.

Sources: hindi = Swara R1; Bihar = Madhur R1; Tamil Nadu = Tamil-English Meera R1; Maharashtra = Marathi-mix
AartiIndic R1.

### 3.4 Automatic QA and its findings (`stimuli-qa.csv`, `manifest.csv`, `qa-attempts.csv`)

**Method.** Every phone-band clip was transcribed by MAI-Transcribe-2 and by fast transcription pinned to the clip's
locale. Each key token (amounts, dates, digit strings, the AI disclosure, "WhatsApp", "OTP") was looked for in both
transcripts. Status:
- **pass:** every token heard by at least one engine, and no engine heard a conflicting number;
- **fail:** a token heard by neither engine while a conflicting or truncated number was heard;
- **needs_listen:** otherwise.

Tamil number words written out by MAI-2 are not parsed, so for Tamil the fast-transcription digits carry the check.

**Result: 210 active clips, 208 pass and 2 need a listen.**
- **A text-normalisation defect, found and fixed.** In the Tamil-English R3, "நம்பர் 4 7 2 9, 28 அக்டோபர்ல" was read
  as "47 September 2,928 October" by **4 of 4 voices** (native Pallavi and Valluvar, and HD Meera and Arjun). Both ASR
  engines agreed. A probe of 4 formats × 2 voices fixed it: commas ("4, 7, 2, 9"), Tamil digit words, SSML say-as and a
  reordered sentence all passed. The Tamil R3 was re-rendered with commas, and the old clips are kept as superseded.
  **Product rule:** identifiers in Tamil need explicit separators. The Hinglish and other registers read the spaced
  digits correctly.
- **HD number misreads on the first render: 2 of 102** HD clips with numeric tokens (both Meera, in Hinglish):
  - ₹1,538 heard as "538" by both engines;
  - ₹11,240 heard as "11,340" and "11,000 to 140".

  Both passed on a second render, which is the clip in use (`render_attempts=2`; the first attempts are in
  `qa-attempts.csv`). Neural voices: **0 of 50**. This agrees with l8 (generative 3/99 vs neural 0/80) and is not
  significant on its own. A product that ships HD cannot re-render live, so this is a reliability cost of HD.
- **needs_listen (2):** the Marathi R5 in AartiIndic and ArjunIndic. Both engines heard the month word ऑगस्टचा as
  "ऑग्स/ऑक्स". This is a possible mispronunciation by the multilingual voices. The native Marathi voices passed.
- **Durations.**
  - Default clips: 6.6-15.2 s (median 10-12 s by set).
  - Slow clips: 11.7-18.6 s (median 14.2 s).
  - The HD R7 and Tamil-Nadu-HD R6/R7 clips are short (6.6-7.5 s).
  - Arjun HD R3 slow is 18.6 s and R8 default is 15.2 s.

  These are flagged in the QA sheet, not re-rendered: pace comparisons require constant SSML rates.
- **Nobody has listened yet.** The automatic check reads the key tokens only. It cannot hear glitches, wrong stress,
  unnatural prosody or a mispronounced name. M1 (section 3.5) is still required before the field build.

### 3.5 Owner actions (exactly what is missing)

| id | needed before | what, exactly | why |
|---|---|---|---|
| **M1** | field build | One native listener per language (Hindi, Tamil, Marathi; Bhojpuri if the optional panel runs) plays every clip in `stimuli-qa.csv` and sets `status` to `use` or `exclude`, with `checked_by` and `checked_at`. Check the `listen_for` column and the 5 noted clips first. About 30 min for Hindi (66 clips) and about 25 min each for Tamil (64) and Marathi (48). Then run `python3 build_plan.py --field`, which refuses while any used clip is unchecked | Comprehension answers are valid only if the clip says the right number. ASR cannot hear naturalness defects |
| **M3** | main panel (the pilot may run without it) | Two native speakers per language review the texts in `stimuli-text.json`: the hand-written Hinglish, and the LLM-written Tamil, Marathi, Bhojpuri and Indian English. They reconcile, and re-render if wording changes (the render script keeps old clips as superseded) | A KILL caused by unnatural text would be a verdict on our writing |
| **M4** | Block C and the human arm | Record the human references per `recording-specs.md` §2 (2 Hindi talents; script in `recording-templates/human-script-hi.md`), then ingest | Without them H1-H3 and the AUC cannot be computed |
| **M6** | the competitor arm | Capture competitor voices per `recording-specs.md` §3 (first-message capture through the l4b harness, up to 4 vendors × 8 lines) | Brief §6 asks for our demo rated against competitors |
| **M7** | pilot | A native speaker per language reviews and back-translates the UI text in `app.js` (`I18N`, `OPT`, `COMP`). The v2 additions (consent c3, fraud-suspicion item, hearing, policy and renewal-call questions, debrief, OTP tip, renewal comprehension questions) are drafts written for this package | The consent and the scales must mean the same in every language |
| **M8** | pilot | Fill `CONFIG` in `app.js`: the study owner's legal name, the contact, the amount. The page refuses to start (except in test mode) while these are placeholders | A DPDP-style notice needs a named data fiduciary |

v1's M2 (Marathi re-renders) and M5 (light Bhojpuri) are obsolete. The new Maharashtra design uses multilingual Indic
voices for the within-voice contrast.

### 3.6 Human-reference arm (placeholder; owner records)

- The spec is in `recording-specs.md` §2. It covers: 2 talents, written consent (never used to train or clone a voice),
  48 kHz/24-bit mono WAV, 15-20 cm from a cardioid mic, peaks −12 to −6 dBFS, no editing, no recording over a phone
  line, and a "first word-exact take".
- When present, the human clips enter in three places:
  - Block C, with 4 cards: 2 human and 2 TTS, the human texts rotating by pid;
  - Block B cell X, one card per listener in place of HD slow;
  - Block A "ours vs human" pairs, 2 per listener.

### 3.7 Competitor arm (design; owner captures from the runbook)

- The spec is in `recording-specs.md` §3:
  - Sarvam, Smallest, Gnani and ElevenLabs first;
  - each platform's default Hindi female voice;
  - the agent's first message set to the exact panel line;
  - captured through `../lanes/l4b-measured/harness/vp_harness.mjs` in owner mode, then cut with
    `ingest_external.py --first-message`;
  - the first complete capture is kept, mistakes included;
  - from an Indian connection; terms of service checked.
- When present: Block A "ours (Swara, default) vs competitor", 3 pairs per listener rotating vendors and turns, phone
  band only. The verdict per vendor and pooled is OURS_PREFERRED / OTHER_PREFERRED / PARITY_OR_INCONCLUSIVE.

## 4. Session design

### 4.1 Order (the page enforces all of it)

| step | content | estimate (the pilot measures it) |
|---|---|---|
| 0 | Language and larger-text choice; consent c3; screening (section 2) | 4-5 min |
| 1 | Sound check: count 1 kHz beeps; two correct rounds needed, 4 attempts at most | 1 min |
| 2 | **Block C** (only if human recordings exist): 4 clips, each played once. Real person or computer, confidence, naturalness 1-5, continue 1-5 | 2.5 min |
| 3 | **Block B, single calls, first hearing:** 8 cards (one per turn R1-R8) plus the hidden degraded catch, each played once. Per card: 2 comprehension questions, then naturalness (ACR 1-5), trust (1-7), **"This call could be a fraud" (1-7, new)**, patronising (1-7; renewal wording "talking down to me, as if I could not understand"), accent fit (1-7, regional panels only), continue (1-5) | 9-12 min |
| 4 | **Block A, pairs:** the same text in two versions, A then B, 0.7 s apart, replays allowed. "Which caller would you rather keep talking to?" For the safety pairs the question is "Which caller would you trust more to send you a payment link?" Five-point choice with "no difference". Plus the identical-pair catch | 5-9 min |
| 5 | Open question: what felt off (optional) | 1 min |
| 6 | Debrief, an OTP-safety reminder, completion code, send answers | 1 min |

**Total.** About 22-25 minutes without the external arms. About 28-30 minutes for a 60+ listener with both arms (15
pairs).

**Block order.** Block B comes before Block A so that comprehension is always a first hearing. Block C comes first so
that the human-or-computer judgement happens before any product voice is familiar.

### 4.2 Trials per listener

| panel | Block B cells (8 cards) | Block A pairs (+ 1 identical catch) |
|---|---|---|
| `hindi_60plus`, `hindi_18to59` | neural default ×3, neural slow ×3, HD default ×1, X ×1 (X = human if recorded, else HD slow). Each cell mixes F and M voices | HD vs neural ×4 (same turn, gender, default pace); slow vs default ×3 (neural, same voice and turn); safety vs plain ×2 (R7, neural F and M); human vs ours ×2 (if recorded); competitor vs ours ×3 (if captured). That is 9 to 14 pairs |
| `tamilnadu` | Tamil-English / Indian English / neutral Hinglish, rotating 3-3-2 within the HD voices | Tamil vs Hinglish ×5 (L1); Tamil vs Indian English ×5 (L2); native vs HD on Tamil ×2 (L3). 12 pairs |
| `maharashtra` | Marathi mix / neutral Hinglish 4-4, within the Indic voices | Marathi vs Hinglish ×8 (L4); native vs Indic on Marathi ×2. 10 pairs |
| `bihar`, `outgroup` | Bhojpuri mix / neutral Hinglish 4-4, within Swara and Madhur | Bhojpuri vs Hinglish ×8. 8 pairs |

### 4.3 Counterbalancing and randomisation

All assignment is computed offline by `build_plan.py` (seed 20261017) for pids 1-160 per panel. It is logged in
`plans/schedules.csv` before anyone listens, and the page only executes the schedule for its pid.

- **Renewal Block B.** For card position p = (turn index + row) mod 8, the cell sequence is
  [Nd, Ns, Nd, Ns, Nd, Ns, Hd, X]. The gender sequence `FMFFMFMM` is shifted every 8 pids. That sequence was chosen by
  exhaustive search, so that neither the neural-default nor the neural-slow cards are ever all one gender within a
  listener.
- **Measured over the first 48 pids** (`plans/balance.txt`):
  - every listener gets exactly the 3/3/1/1 cells;
  - every (cell, gender) count is equal (72/72 for the neural cells, 24/24 for HD and X);
  - the target plays first in 0.50 of trials for every contrast;
  - every turn is used equally within each pair contrast.
- **Regional Block B:** the Latin rotation of v1, with voices rotating in blocks.
- **Pairs.** A/B positions alternate within each contrast and flip with the row. Order is shuffled with no two adjacent
  pairs from the same turn.
- **Issue pids sequentially within a panel** (E001, E002, ...). Recruiting in multiples of 8 keeps the renewal
  rotations complete.

### 4.4 Catch trials and exclusions (pre-registered; unchanged from v1)

There are three hidden catches:
1. an identical pair (pass = "no difference");
2. the degraded clip (pass = naturalness 2 or lower);
3. an instructed row (pass = 2).

A listener is excluded if any of these hold:
- they fail 2 or more catches;
- their median Block B answer time is below 40% of the panel median;
- they fail screening when re-checked;
- the coordinator flags them, judging blind to their answers.

Other data rules:
- Only the first completed session per pid is used.
- Shared devices are flagged, not excluded.
- Comprehension answers on a card re-shown after a reload are dropped.

### 4.5 Test-retest

About 10% per panel repeat Block A about a week later (`&retest=1`). Reported as directional agreement with a Wilson
interval.

## 5. Sample size by power calculation

Run `python3 analysis.py --power --sims 500` (output in `power-v2.md`; seed 20261017; about 2 minutes).

- The simulation feeds the same decision functions the analysis uses.
- Assumed: comprehension listener sd 0.8 and item sd 0.5 (logit); preference listener sd 0.5 or 1.0 and item sd 0.3;
  15% "no difference"; rating slope sd 0.6, residual sd 1.3.
- The pilot measures these, and the power run is repeated before the freeze.

| test | design | result |
|---|---|---|
| E1 floor, 60+, n = 48, 6 items per listener | P(PASS) / P(FAIL) at true accuracy 0.70 / 0.75 / 0.80 / 0.85 / 0.90 | 0.00/0.98, 0.01/0.75, 0.20/0.23, 0.70/0.02, 0.98/0.00 |
| E2 slow pace, 60+, n = 48, 6 vs 6 items | P(PASS) at true gain 0 / +5 / +8 / +10 / +15 points | 0.04, 0.37, 0.75, 0.94, 1.00 |
| T1 HD vs neural, pooled n = 84, 4 pairs | P(PREFERRED) at p 0.50 / 0.58 / 0.65 (sd_u 0.5; sd_u 1.0) | 0.03 / 0.43 / 0.93; 0.03 / 0.36 / 0.88. Kill at p = 0.50: 0.66 (0.62) |
| S1 safety, pooled n = 84, 2 pairs | P(PREFERRED) at p 0.50 / 0.58 / 0.65 | 0.03 / 0.42 / 0.87 (sd_u 0.5); 0.05 / 0.30 / 0.77 (sd_u 1.0) |
| E3 slow preference, 60+, n = 48, 3 pairs | P(PREFERRED) at p 0.65 / 0.70 | 0.82 / 0.98 (sd_u 0.5) |
| L1 Tamil vs Hinglish, n = 36, 5 pairs | P(PREFERRED) at p 0.65 / 0.70 | 0.85 / 0.98 (sd_u 0.5); 0.66 / 0.88 (sd_u 1.0) |
| L4 Marathi, D1 Bhojpuri, n = 30-36, 8 pairs | P(PREFERRED) at p 0.65 | 0.88-0.92 (sd_u 0.5) |
| K1 ours vs competitor, n = 84 | P(OTHER_PREFERRED) at p(ours) 0.30 / 0.42 with 1 pair per vendor per listener | 0.88 / 0.25 (pooled over 3 pairs: 1.00 / 0.42) |
| P5 patronising non-inferiority, 60+, n = 48 | P(PASS) when equal / P(FAIL) when 1 point worse | 0.90 / 0.91 (18-59, n = 36: 0.72 / 0.76) |

**What this buys, stated plainly:**
- **E1 is strict by design.** A true 0.85 passes 70% of the time. A true 0.80 is usually INCONCLUSIVE. A true 0.75 or
  lower almost never passes and usually FAILs. The panel can tell "clearly fine" from "clearly not fine", but not 0.78
  from 0.82.
- **E2 detects a gain of 8 points 75% of the time** and a gain of 10 points 94% of the time at n = 48. A 5-point gain
  is mostly missed.
- **Preferences of p ≥ 0.65 are found reliably. p = 0.58 is found less than half the time.** False adoption at p = 0.50
  stays at 2-5%.
- **Per-vendor competitor verdicts are weak** (about 84 trials each). Only a clear loss, p(ours) ≈ 0.30, is reliably
  seen per vendor. The pooled verdict is the stronger one.
- **Why 48 at 60+ and 36 at 18-59.** The wedge decision rests on the 60+ stratum (E1, E2). Moving 60+ from 36 to 48
  raises E2 power at +8 points from 0.61 to 0.75.

## 6. Analysis plan (`analysis.py`; standard-library Python)

- **Preference.** Ties are dropped. p is the ratio estimator with listener-cluster variance.
  - Intervals: the naive Wilson, the Wilson adjusted for clustering (which decides, with a t quantile at listeners − 1
    degrees of freedom), and a listener bootstrap.
  - Also shown: a ties-split sensitivity, and the results by channel, by turn and by age group (regional panels).
- **Pair contrasts are classified from the manifest attributes**, never from labels on the page:
  - human or competitor vs ours (target = ours);
  - safety vs plain;
  - slow vs default (same voice);
  - register (same voice);
  - HD vs neural (same register and pace);
  - native vs other tier.
- **Ratings and comprehension.** Means of listener means, per cell. Tests run on within-listener differences, with
  one-sided 95% t bounds.
- **E1** uses the clustered proportion correct in the `neural-default` cell of `hindi_60plus`. For the Holm family, the
  p-value tests H1: p > 0.70. **E2** uses the within-listener (slow − default) difference in comprehension. **T1** and
  **S1** use the pooled preference. Holm runs across E1, E2, T1 and S1.
- **Secondary.** All items in panel-predictions §4, including:
  - F1: mean fraud suspicion on R7 among 60+;
  - F2: the within-listener correlation of fraud suspicion with continue-intent;
  - F3: fraud suspicion on the money turns (R5/R7) against R1/R6;
  - E1c: the 60+ vs 18-59 comprehension gap;
  - H1-H3 and K1 when the arms exist.
- **Regional verdicts.** v1's rule (§6.6 of `protocol.round1.md`) on the renewal turns, with Holm across L1, L4 and D1.
  The Bhojpuri expected-value rule is kept (`--p-correct-inference`).
- **No peeking.** The sizes are fixed. The one interim look is `--quality-only`, which shows counts, catches,
  exclusions and quotas, and no effects. Pilot sessions are never pooled.
- **Self-test.** `python3 analysis.py --selftest` builds 6 synthetic panels (210 listeners) from the real schedules and
  manifests, with known truth, and checks that:
  - E1 never passes at 0.66;
  - E2 passes at +16 points;
  - T1 is PREFERRED at 0.75, and S1 is not PREFERRED at 0.50;
  - E1b passes at 0.93;
  - Tamil at 0.80 is PREFERRED;
  - Maharashtra at naturalness −0.9 is KILL;
  - Bihar at 0.50 is not ADOPT, and the out-group is below 0.5;
  - the speeder and the catch-failer are excluded;
  - the checksums verify and all clips join.

  **14/14 pass on this build.** The human and competitor paths, and Block C, were exercised in a separate test tree with
  stand-in clips.

## 7. Ethics, consent and data

Unchanged from v1 §7 except as stated:
- adults only;
- voluntary participation;
- no deception beyond blinding;
- no voice recorded;
- names and payment details kept by the coordinator, separate from the answers, and deleted after payment;
- 12-month retention;
- withdrawal by pid;
- the owner is the data fiduciary, and each coordinator signs a processing agreement (`recruit.md` §5).

v2 changes:
- **Consent c3** says:
  - the calls are about insurance renewals from made-up companies;
  - **the study never asks for money, an OTP, bank details or policy numbers, and no payment link will be sent**;
  - the new screening items (hearing, insurance, recent renewal calls) are recorded.

  The English text is in `app.js`. The Hindi, Tamil and Marathi drafts await M7.
- **Debrief:**
  - it states the study question (voices, pace, the safety sentence);
  - it says which voices were computer-generated;
  - it ends with: "Remember: never share an OTP or PIN with anyone on a phone call, even if they know your policy
    details."
- **Gentle content.** Lapse revival (R5/R6) mentions a missed instalment and a late fee. It is factual, carries no
  threat, deadline pressure or penalty language, and contains no collections script.
- **Human talents and competitor clips** (`recording-specs.md`): written consent, and no use for training or cloning.
  Competitor audio stays inside the blind panel, follows each vendor's terms, and is never published.

## 8. Compensation and budget (estimates, not quotes)

The pay rules are as v1:
- ₹250 per completed session, paid within 72 hours;
- every completed session is paid, including those excluded later;
- ₹20 recharge for a failed sound check;
- pilot ₹350; retest ₹100.

| item | estimate |
|---|---|
| Listeners, main four panels (182 × ₹250) | ₹45,500 |
| Optional Bihar and out-group (64 × ₹250) | ₹16,000 |
| Pilot (16 × ₹350: 4 per main panel) and retest (about 20 × ₹100) | ₹7,600 |
| Coordinators (4 main panels; the kiosk-heavy 60+ panel ₹15-20k) | ₹43-62k |
| Kiosk phones and earphones, recharge tokens, data | ₹9,000 |
| Native reviewers (M1, M3, M7) | ₹10-20k |
| Two Hindi voice talents (M4) | ₹6-10k |
| **Total, main four panels** | **about ₹1.21-1.54 lakh** (itemised in `recruit.md` §8); about ₹1.5-1.9 lakh with the optional Bihar panels |

The Azure spend for this package (texts, renders, two-engine ASR QA) is estimated at ₹104-177 from usage × list meters (not yet invoiced), against a package cap of ₹400 (logged in the programme spend log).

## 9. Pilot (before freezing)

- **Who.** 16 listeners: 4 per main panel (at least 2 of the 4 hindi_60plus pilots in assisted kiosk mode), with
  `&mode=pilot`. Their pids are the panel's first; the main panel restarts at 1.
- **What it checks:**
  - playback on low-end Android phones and on one iPhone;
  - session length by age;
  - questions that confuse people (feedback calls);
  - catch behaviour, stalls and resumes;
  - the within-listener SDs.
- **Then** re-run `--power` with the observed SDs.
- **Change triggers:**
  - a median session over 30 minutes;
  - more than 20% failing a catch;
  - more than 10% failing the sound check;
  - any question misunderstood by 2 or more pilot listeners.
- **Pre-registered cut if 60+ sessions run long:** drop tier pairs from 4 to 3 and pace pairs from 3 to 2 in the
  renewal panels. Record it in `panel-predictions.md` §7 before the freeze.

## 10. Fielding runbook

**Before:**
1. Complete M1 and M8, and M3, M4, M6 and M7 if possible.
2. Ingest any human or competitor recordings (`recording-specs.md`), then run `build_plan.py --qa-sheet`.
3. Run `python3 build_plan.py --field`. It refuses while any used clip is unchecked.
4. Run `python3 analysis.py --selftest` (14/14).
5. Run `python3 build_plan.py --bundle /folder/outside/repo`. It copies the page, the plans, the catch clips and the used
   audio only, never the manifests or texts. Host that folder on static HTTPS (for example an Azure Storage static
   website). The page sets `noindex`.
6. Make the link sheets per stratum, for example
   `python3 build_plan.py --links hindi_60plus 1 70 --base https://HOST/listener-panel/`.
7. Freeze (the hashes go into `panel-predictions.md` §8).

**During:** single-use links sent by direct message; daily quota sheets; `--quality-only` at about 20%; kiosk export
via `index.html?coordinator=1`.

**After:**
`python3 analysis.py answers/ --exclusions coordinator-exclusions.csv --md results.md --out results.json --tidy trials.csv`.
Then score `panel-predictions.md` §9.

## 11. Timeline (indicative)

| week | step |
|---|---|
| 1 | M1, M3, M7 and M8; record the human references (M4); competitor captures (M6); hire coordinators |
| 2 | Pilot (16), feedback calls, power re-run, fixes, amendments, freeze |
| 3-4 | Field the four main panels (60+ kiosk sessions throughout); daily quota and quality checks |
| 5 | Retest, analysis, scoring. Optional Bihar panels only if the budget remains |

## 12. Stage 2: the outcome test

Unchanged in principle from v1 §12.
- In the first consented, holdout-controlled renewal pilot, randomise per call whichever design choices the panel left
  open: pace (if E2 is INCONCLUSIVE), the safety line (if S1 is INCONCLUSIVE) and the voice tier (if T1 is PREFERRED).
- Outcomes:
  - early hang-up within 10 s of the disclosure;
  - payment-link opened;
  - renewal paid within 7 days.
- Sizes per arm come from `../lanes/l6-self-learning/` (`power-n-per-arm.csv`, corrected in round 2). For example,
  early hang-up 15% → 10% needs about 686 calls per arm.

## 13. Files in this package

| file | role |
|---|---|
| `protocol.md` | this document (v2.0); `protocol.round1.md` is v1.0 |
| `panel-predictions.md` | pre-registered predictions, amendments, freeze hashes, scoring |
| `index.html`, `app.js` | the static test page. No network calls (CSP `connect-src 'none'`). Four UI languages, larger-text toggle, resume, coordinator export, test mode |
| `plans/<panel>.js`, `plans/schedules.csv`, `plans/balance.txt` | generated schedules (no condition labels), the assignment log, the measured balance |
| `catch/catch_<set>.mp3` | the degraded catch clips |
| `build_plan.py` | builds the plans and catch clips; `--field`, `--qa-sheet`, `--links`, `--bundle` |
| `stimuli-qa.csv` | listen-check sheet for the 210 active clips: automatic QA status, what to listen for, notes |
| `analysis.py` | the analysis; `--quality-only`, `--power`, `--selftest` |
| `power-v2.md` | the power output behind section 5 |
| `ingest_external.py` | ingests human and competitor recordings; `--first-message` cuts a harness capture |
| `recording-specs.md`, `recording-templates/` | exact specs, the talent script, the competitor first-message sheet, the CSV template |
| `recruit.md` | how to recruit, including the 60+ stratum |
| `*.round1.*`, `plans.round1/`, `catch.round1/` | v1 files, kept unchanged |
| `../lanes/l8-azure-bench/stimuli-round2/` | clips, `manifest.csv`, `manifest-external.csv` (after ingest), `stimuli-text.json`, `calibration.json`, `qa-attempts.csv` |

**Verified in this build.**
- Headless Chromium completed sessions on all 6 panels (en, hi, ta, mr) at 360 px:
  - no page errors;
  - no request leaving the host;
  - no horizontal overflow;
  - the "trust to send a payment link" question appeared on the safety pairs;
  - the larger-text toggle worked;
  - the exports parsed in `analysis.py`.
- The age-stratum and panel-mismatch screen-outs worked.
- A test tree with 40 stand-in external clips exercised Block C, the human X cell, and the human and competitor pairs
  end to end.
- The self-test passes 14/14.

**Not verified.** Real phones; iOS audio unlock; slow networks; the Indian-language UI text; any human listening to any
clip; any real human or competitor recording.

## 14. Changes from v1.0 and why

| # | v1.0 | v2.0 | reason |
|---|---|---|---|
| 1 | 6 turns: car EMI sales ×3, COD, NDR, 1 renewal | 8 renewal turns R1-R8 (health, 4W and 2W motor, life lapse revival, payment link, number read-back) plus Block C texts | CRITIC A13: the panel must test the beachhead |
| 2 | Primary question: dialect and language matching (H6) | Primary: older listeners' comprehension (E1), pace (E2), voice tier (T1), fraud-safety line (S1). H6 regional arms secondary; Bhojpuri optional | SYNTHESIS §8 item 8 ranks elderly comprehension and trust first; CRITIC C says not to spend on Bhojpuri first |
| 3 | 45+ about a third; 60+ only reported | Separate 60+ stratum panel (48 analysed), 70+ quota; 60+ ≥ 30% in regional panels; hearing and policy-holder covariates; kiosk default; larger text | the wedge's customers are older |
| 4 | No human reference | Human-reference arm (placeholder, exact spec, ingest tool, automatic plan integration) | brief §6; S5 headroom |
| 5 | No competitor arm (M6 "optional, owner decision") | Competitor arm design: first-message capture via the l4b harness, phone-band pairs vs our product voice | brief §6: rated against competitors |
| 6 | Predictions to go in `predictions.md` (not done) | `panel-predictions.md`, written before rendering, with amendment and freeze sections | pre-registration; `predictions.md` text not edited |
| 7 | Voices: Diya Dragon preview (number misreads), mr-IN voices dropping Latin "EMI" | Neural Swara/Madhur as product voices; HD rate-matched; Indic multilingual voices for Marathi; no Diya, no MAI-Voice | l8 number probe; v1 exclusions |
| 8 | ASR round trip on one engine; 95/102 clips "unchecked" | Two-engine key-token QA on every clip; 208/210 pass, 2 need a listen; per-attempt log; a Tamil normaliser defect found and fixed | automatic QA demanded by A13; human M1 still required |
| 9 | Rating items: naturalness, trust, patronising, accent fit, continue | Adds "This call could be a fraud"; renewal panels drop accent fit and use renewal wording for patronising; the safety pairs ask about trusting a payment link | fake renewal calls are the ops-head objection (CRITIC §6 item 3) |
| 10 | Consent c2 | Consent c3: no money, OTP, bank details or policy numbers asked; OTP reminder in the debrief | the stimuli have the shape of a scam call |
| 11 | Panels 48/48/48/36 analysed | 48 (60+) / 36 (18-59) / 36 / 36, plus optional 30/24 | budget held near v1 while adding the 60+ stratum |
| 12 | `screen()` rendered array children as text ("[object HTMLParagraphElement]" on the welcome screen) | fixed (children flattened) | bug found by the v2 screenshots; v1 had it too |
