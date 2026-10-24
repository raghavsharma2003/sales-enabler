<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

# r2-listener-panel: the panel re-targeted at renewal calls (critic item A13)

Round 2 of the VP research programme, 2026-10-17. Package `r2-listener-panel`. Not committed.

The harness refused `findings.md`, so this write-up exists only here.

**Inputs read:**
- `CRITIC.md` (A13, B10), `SYNTHESIS.md`, `vp-research-brief.md`, `predictions.md`;
- the v1 panel package;
- the l8 report, its verify file, the round-2 latency verify file and the render harness;
- the l4b runbook and agent spec;
- `r2-untouched-raw/trust-fraud-evidence.csv`;
- the r2-econ renewal model.

## 0. Bottom line

1. **The panel now tests the beachhead.**
   - All 8 rated turns are renewal turns:
     - R1, health: the opening, with the AI disclosure;
     - R2: the premium and sum insured;
     - R3, 4-wheeler motor: vehicle digits;
     - R4, 2-wheeler motor: policy already expired;
     - R5, life: lapse revival;
     - R6: the revival deadline and a callback;
     - R7: the payment-link hand-off, plus a safety-line variant;
     - R8: a number read-back.
   - The primary panel is Hindi-belt listeners in two age bands: **60+ (48 analysed)** and 18-59 (36 analysed).
   - Four pre-registered tests make up the confirmatory family:
     - **E1:** older listeners understand the product-default call (comprehension ≥ 0.80);
     - **E2:** slowing to 0.85× speed improves their comprehension;
     - **T1:** the HD voice is preferred to the neural voice at equal pace;
     - **S1:** a fraud-safety line makes the payment link more trusted.
   - The Tamil, Marathi and Bhojpuri arms stay, secondary, on the same turns. Bhojpuri is optional.
2. **210 new clips** were rendered (phone band plus wideband) into `lanes/l8-azure-bench/stimuli-round2/`, with a
   manifest.
   - Each clip got an automatic speech-recognition (ASR) round trip on two engines. The check looked for every key
     token: amounts, dates, digit strings and the AI disclosure.
   - **208 pass and 2 need a listen.** No person has heard any clip yet; that is owner action M1.
3. **The automatic check found a real product defect.**
   - Tamil text normalisation read "4 7 2 9, 28 அக்டோபர்" as "47 September 2,928". This happened in 4 of 4 voices,
     native and HD alike, and both ASR engines agreed.
   - Commas, Tamil digit words, SSML say-as or a reordered sentence each fixed it in a probe.
   - The rule this gives the product: **every locale needs an identifier-format regression test.**
   - HD voices also misread amounts on the first render: 2 of 102 HD clips, against 0 of 50 neural. That is not
     significant on its own (one-sided Fisher p about 0.45), but it agrees with l8.
4. **The human-reference and competitor arms are placeholders with exact specs.**
   - Human: who records, consent, microphone, level, room, takes and file names.
   - Competitor: first-message capture through the l4b harness, which vendors, terms of service, and "keep the first
     complete capture".
   - An ingest tool runs the same processing chain and the same automatic check.
   - The page, plan builder and analysis switch both arms on when the recordings arrive. Until then the panel compares
     only our own voices, and the report says so.
5. **Predictions were pre-registered** in `listener-panel/panel-predictions.md` before any round-2 audio existed.
   - The file as written has sha256 `7a56dc575f96fbf8e77d9e63e3c61710a329c13f6ab8c32fbac7b2dd5984970e`, at 2026-10-17
     20:18 UTC.
   - 7 dated amendments followed, all before recruitment, and none changes a prior or a rule.
   - `predictions.md` was not edited.
6. **Azure spend: about ₹104-177**, against the ₹400 cap. This is usage times list meters; the invoice has not arrived.
   No compute was created. A temporary gpt-6-sol deployment was created for the regional texts and deleted the same
   hour.

## 1. What changed in the design

| | v1 | v2 |
|---|---|---|
| Turns | 1 renewal turn of 6 | R1-R8 all renewal; C1-C4 for the human-or-computer block (Block C) |
| Primary question | Dialect and language matching (H6) | E1, E2, T1, S1 |
| Age | at least a third aged 45+ | A separate 60+ panel with its own links and pid sequence; the page enforces the age band; ≥ 25% aged 70+; 60+ ≥ 30% in the regional panels; hearing difficulty and policy-holder household recorded; kiosk sessions by default; larger-text toggle |
| Human reference | none | Placeholder arm, spec, script, ingest. It appears in Block C, in cell X of the single-call block (Block B), and in human-vs-ours pairs |
| Competitor | an optional owner decision | Arm design: each platform's default Hindi female voice reads the identical line; phone-band pairs against our Swara voice |
| Fraud and trust | not measured | "This call could be a fraud" (1-7) on every card. The safety pairs ask "Which caller would you trust more to send you a payment link?" Consent c3 says no money, OTP or bank details will be asked; the debrief ends with an OTP reminder |
| Pre-registration | promised, not done | `panel-predictions.md` |
| Clip QA | one ASR engine; 95/102 unchecked | Two-engine key-token QA; failures re-rendered (HD voices only) with every attempt logged; a human listen is still required |

**Why these four tests.** SYNTHESIS §8 item 8 puts older listeners' comprehension and trust first. Each test settles
one design choice for the wedge's number-confirmation step:
- **E1 and E2:** whether the read-back works for older listeners, and whether to slow it down.
- **T1:** whether HD is worth its extra latency. Round 2's India-hosted cascade met the 1.5 s bar with the neural voice
  Swara.
- **S1:** the operations-head objection in CRITIC §6 item 3, that customers think renewal calls with payment links are
  scams. The fraud evidence supports it: police busts of fake vehicle-renewal call centres, and IRDAI's warnings.

## 2. Voices, and the evidence for each choice

| voice | role | evidence |
|---|---|---|
| hi-IN Swara (F), Madhur (M), neural | product voices: default and slow pace | 0/20 Indian-format number misreads each in the l8 probe. Swara is the voice of the only India-hosted cascade that met 1.5 s. First audio from Central India: Swara p50 95 ms. Here: 0/50 first-render number misreads |
| en-IN Meera / Arjun DragonHD | HD tier, rate-matched; Tamil Nadu set at the voice's own rate | First audio 188 ms (Meera) vs 95 ms. Here: 2/102 first-render misreads, both Meera, both fixed on the second render |
| ta-IN Pallavi (F), Valluvar (M) | native Tamil | Valluvar was added from today's voice list. Both showed the Tamil identifier defect |
| en-IN AartiIndic / ArjunIndic | Marathi mix vs Hinglish in the same voice | The voice list gives Marathi as a secondary locale. They replace the preview Diya voice |
| mr-IN Aarohi / Manohar | native Marathi | 0 failures in 16 clips |
| not used | hi-IN Diya DragonLatest (misread ₹1,299 in 10/13 renders); MAI-Voice-2.1 (preview, no price meter, trailing junk audio) | |

**Rate matching (measured).** At SSML rate 0 the HD voices finish the same Hinglish text much sooner than the neural
voices:
- median duration ratio 0.75 (Meera vs Swara) and 0.68 (Arjun vs Madhur), over n = 8 texts each;
- the rate changes needed to match pace are −25.2% and −32.0%;
- SSML prosody rate works on the HD voices.

Without matching, a voice-tier preference would be mixed up with speaking speed.

## 3. Clip QA results (automatic only)

| | count | detail |
|---|---|---|
| active clips | 210 | hindi 66 (16 shared with Bihar), Block C 16, Bihar 16, Tamil Nadu 64, Maharashtra 48 |
| pass | 208 | |
| needs a listen | 2 | Marathi R5 in the AartiIndic and ArjunIndic voices: both engines heard the month word "ऑगस्टचा" as "ऑग्स/ऑक्स" |
| superseded, kept for provenance | 34 | 30 Tamil Nadu HD clips at the matched rate ran 15-17 s, so they were re-rendered at the voice's own rate; 4 were the defective Tamil R3 |
| Tamil normaliser defect | 4/4 voices | fixed with commas |
| HD first-render misreads | 2/102 | neural 0/50, Indic 0/28, native 0/30 |
| duration, default pace | 6.6-15.2 s | flagged, not re-rendered: the pace comparisons need constant rates |
| duration, slow pace | 11.7-18.6 s | |

**What the check cannot catch.** It looks at key tokens only. It cannot hear glitches, wrong stress, mispronounced names
or text that does not sound like a real caller. The field build is blocked until M1, the human listen, is done.

The regional texts were written by gpt-6-sol from my hand-written Hinglish. They had two recorded edits and have had no
native review (M3).

## 4. Pre-registration, power and limits

**Power** (`power-v2.md`; 500 simulations per cell, using the same decision rules as the analysis):
- **E1** at n = 48: PASS 0.70 when true comprehension is 0.85. At a true 0.80 the result is mostly INCONCLUSIVE. At a
  true 0.75, FAIL 0.75. So it separates "clearly fine" from "clearly not", but not 0.78 from 0.82.
- **E2:** power 0.75 for an 8-point gain and 0.94 for 10 points.
- **T1** at n = 84: PREFERRED 0.93 when p = 0.65, with false adoption 0.03 at p = 0.50.
- **Competitor:** per-vendor verdicts are weak; the pooled verdict is the one to use.

**Self-test:** 14/14 pass.

**This is not an outcome test.** Renewal conversion is decided only by the holdout-controlled pilot (SYNTHESIS kill
criterion 7).

## 5. Spend

| batch | estimate |
|---|---|
| Text-to-speech, 34.7k characters | $0.64 |
| Speech recognition, 0.85 audio-hours × 2 engines | $0.40-1.16 |
| gpt-6-sol | $0.06 |
| **Total** | **$1.09-1.86 ≈ ₹104-177** |

Every batch was logged before it was spent, and a reconciliation line was added.

## 6. Files

`research/2026-10-17/listener-panel/`:
- `protocol.md` v2.0;
- `panel-predictions.md`;
- `app.js` and `index.html`;
- `build_plan.py`, `analysis.py` and `ingest_external.py`;
- `stimuli-qa.csv`, `plans/`, `catch/` and `power-v2.md`;
- `recruit.md`;
- `recording-specs.md` and `recording-templates/`;
- the v1 versions, kept as `*.round1.*`, `plans.round1/` and `catch.round1/`.

`lanes/l8-azure-bench/`:
- `harness/stimuli_text_round2.py` and `harness/render_stimuli_round2.py`;
- `stimuli-round2/`: phone and wideband audio, `manifest.csv`, `stimuli-text.json`, `calibration.json`,
  `qa-attempts.csv` and `README.md`.

## 7. Verification

- **Headless Chromium:** one session on each of the 6 panels, in English, Hindi, Tamil and Marathi, at 360 px:
  - no page errors;
  - no requests leaving the host;
  - no horizontal overflow;
  - the payment-link trust question appeared on the safety pairs;
  - the larger-text toggle worked;
  - the age and eligibility screen-outs worked;
  - the exports parsed.
- **A bug carried over from v1 was found and fixed:** the welcome screen showed "[object HTMLParagraphElement]" instead
  of its text.
- **Human and competitor paths:** a test tree with 40 stand-in clips exercised them end to end. They were never added to
  the real manifest.
- **The bundle for hosting** contains no manifest, text or QA file.
- **Not verified:**
  - real phones;
  - iOS;
  - any human listening;
  - the Indian-language interface text;
  - any real human or competitor recording.

## 8. What this changes in SYNTHESIS

- **§8 item 8.** The panel v2 is renewal-centred. The 210 clips pass the automatic check, 208 of 210, but none has been
  heard by a person. The primary panel is about 60+ comprehension and trust. The main four panels need about
  ₹1.21-1.54 lakh.
- **§4 number confirmation.** Add two rules:
  - identifiers need explicit separators or SSML say-as in Tamil;
  - each locale needs an automatic number regression test, because HD voices sometimes misread amounts on the first
    render and a live call cannot re-render.
- **Kill criterion 6.** E1 adds a comprehension component to "our quality fails".
- **Deliverable 7.** Status changes to: re-targeted, ready for the owner actions and recruitment.

## 9. Limits

- **Callers are synthetic.** The human and competitor arms are designs, with no data yet.
- **The phone band is simulated.** It is G.711 μ-law, not a real carrier leg.
- **The texts are not from real renewal calls.** They were written by me and by an LLM. Founder interviews start
  2026-10-19, and any real renewal scripts they share should be compared against these (M3).
- **Azure checked Azure.** Azure speech recognition checking Azure voices is a favourable pairing.
- **The priors are one researcher's,** written in one sitting.
