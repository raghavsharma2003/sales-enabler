<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l5: human-likeness and dialect matching (H5, H6)

Vyakti Platform research programme. Researcher: lane l5. Date: 2026-10-17.

Azure spend: an estimated ₹51, logged in `vp-spend.jsonl` (cap ₹200).

**Search budget.** The shared WebSearch budget for this run (200 calls across all agents) ran out partway through the
lane. After that, only known primary URLs and DOI lookups (OpenAlex) were fetched, with no searching. The items this left
unchecked are listed under Open questions. They are not filled in from memory.

## Files in this lane

| file | what it is |
|---|---|
| `report.md` | this report |
| `panel-protocol.md` | listener-panel protocol (ABX/MOS/preference, power, recruitment, analysis plan) |
| `evidence.csv` | 33 evidence rows: claim, source, date, method, confidence |
| `azure-voices-indic-2026-10-17.csv` | 369 Azure voices that are Indian-locale or list an Indian secondary locale (from the live voices/list call) |
| `job-language-requirements-by-city.csv` | language requirements in 6,454 telecalling job posts, by city |
| `vaani-dialect-hours.json` | Vaani audio and transcribed hours by dialect |
| `panel-power.json` | power-analysis output |
| `samples/` | stimuli text, 20 rendered clips plus 6 probe clips (wideband MP3 and phone-band 8 kHz μ-law WAV), and the ASR round-trip JSON/CSV |
| `code/` | gen_text.py, synth.py, asr_roundtrip.py, asr_bho.py, probe_ta.py, score_roundtrip.py, job_lang.py, panel_power.py |

---

## 1. Answer to the hypotheses

### H5: does human-likeness or emotional/relational behaviour lift a business outcome?

**The verdict is mixed, and it is more specific than "warmth sells".**

The rigorous outcome evidence (randomised field experiments on real calls) says three things.

**1. The large human-vs-AI gaps are about commitment and process, not voice warmth.**

- **Collections.** In Chinese consumer-loan collections, AI callers collected 9 pp less NPV than humans at about one month in the regression-discontinuity sample, and the randomised gap reached 12 pp by day 5.
  - Borrowers were *not* more likely to hang up on the AI within 10 s.
  - The difference was in commitment: 21 pp fewer promises to pay, and promises to the AI were kept less often (Choi et al., NBER w33669, 2025; E03).
- **Sales.** A 2026 field experiment finds AI voice agents "substantially underperform" human sales agents (n = 366). It attributes the gap to weak sales-process discipline: qualification, persistence and next-step orchestration (Habel et al., SSRN 2026; E02, abstract only).
- The owner's ideas about "emotion" therefore matter less than the agent's ability to obtain a binding, specific next step.

**2. Voice likeability and humanising cues show small-to-moderate measured lifts, on thin samples.**

- **German bank collections.** A two-way phone call beat a letter by +34.4 pp in timely repayment. Within the calls, the 4 agents with likeable voices got 84.5% of borrowers paying within 45 days, against 71.6% for the other 4 agents. One standard deviation of likeability is worth about +4 pp (Laudenbach et al., Journal of Finance 2025; E04). That rests on only 8 agents.
- **Text chatbot, US.** Humanising cues raised conversion by +10.8 pp from a 2.6% base (n = 323, MSI working-paper version) but also made customers more price-sensitive (Schanke et al., ISR 2021; E05).
- **TTS vendor choice.** In a vendor-funded study of about 99,400 disclosed AI survey calls in the US, the choice of TTS vendor moved intro hang-ups by at most about 2.4 pp (87.9% vs 90.3%) (E09, vendor claim).

**3. Disclosure used to be catastrophic and may no longer be.**

- **2017-era China.** Saying "I am the AI voice chatbot" up front cut loan-renewal purchases from 23.7% to 4.8%, and 56.3% of those callees hung up within 5 s (Luo et al., Marketing Science 2019, Table 3; E01).
- **2026.** A randomised experiment with 1,337 customers found disclosure no longer reduces conversion, and an online study found people recognise AI voices whether or not they are told (E02).
- The product implication: **realism is not for passing as human.** The owner's law "never deny being an AI" and the 2026 IT Rules' audio-disclosure requirement for synthetic audio (lane l1, S20) make passing off moot anyway. Realism has to earn its keep through competence: turn-taking, short turns, correct numbers and an accent the listener trusts.

**Where warmth hurts or is restricted.**

- Anthropomorphic bots lower satisfaction and purchase intent for customers who arrive **angry** (Crolic et al., Journal of Marketing; E06). That describes complaints, NDR (failed delivery) and collections calls.
- Humanising raises negotiation and **price sensitivity** (E05).
- In collections, human presence matters most for the outcome (E03, E04), and RBI recovery-conduct rules apply from 2027-01-01: contact only 08:00–19:00 and calls recorded and retained for 6 months (l1, S22). The CCPA dark-pattern guidelines (false urgency, nagging) also apply (l1, S21). Warmth used as pressure on a delinquent or elderly borrower is the scenario a regulator will read as manipulation.
- No study of elderly or vulnerable callees and AI voice was found before the search budget ran out (gap).

**Owner's own evidence.** The owner's products measured realism by ear and by register, not by outcome:

- Meera's Azure TTS was rejected as "not human and not Indian" despite winning every metric (E33).
- Recitation, monologue length (41–53 words per turn on realtime) and register were measured.
- No conversion or retention effect of realism was ever measured. Vyakti's paid conversion is listed as unmeasured.

**A new link to the regulatory lane.** Early hang-ups are not only lost sales. Under TCCCPR Schedule-IV and the Third
Amendment's reg 21A, telcos' AI flags 10-digit CLIs that show many short calls and high recipient diversity. Five flagged
CLIs in 10 days trigger KYC re-verification and then a 15-day bar; 140, 1600 and 1601 numbers are exempt (l1; E31). So
anything that cuts sub-10-second hang-ups also protects the sender's numbers. That makes early hang-up a cheap leading
indicator worth A/B testing from the first pilot.

**H5 kill status: not triggered.**

- Outcome evidence exists for human-vs-AI, disclosure and voice likeability.
- A cheap test exists: early-hang-up A/B in a pilot, at about 686 calls per arm for a 15% → 10% effect (`panel-power.json`).
- But there is **no outcome evidence at all for "emotional/relational" behaviour in voice sales calls**. That specific claim should not be in the pitch until a pilot measures it.

### H6: is dialect or accent matching preferred and producible?

**(a) Preference.**

- **Language matching is strongly revealed in employer behaviour.**
  - L3's anonymous crawl of 6,454 telecalling-type Apna postings (2026-10-17) was re-analysed here (E15).
  - Tamil is required in 82.8% of Chennai postings (n = 360), 91.0% in Coimbatore (n = 78) and 92.6% in Trichy (n = 27).
  - Telugu is required in 39.8% of Hyderabad postings and Kannada in 34.3% of Bengaluru postings.
- **Dialect matching is not.**
  - Across about 460 postings in Hindi-belt cities (Patna 48, Lucknow 103, Jaipur 197, Kanpur 35, Ranchi 23, Prayagraj 24, Varanasi 18, Gorakhpur 12), exactly one asks for a sub-Hindi variety: Marwari, for an NBFC collections role in Jaipur.
  - "Bhojpuri" appears in no telecaller posting. Its only occurrence is in a data-annotation job.
  - Caveat: local hiring may supply dialect without anyone writing it down. A Patna call team speaks Bhojpuri because it *is* from Bihar. The postings show what employers screen for, not what callers do on the phone.
- **Lab evidence supports similarity-attraction for accent:**
  - same-accent speakers judged more knowledgeable (Dahlbäck et al., CHI 2007, N = 96; E10);
  - accent alone triggers in-group preference (E11);
  - foreign accent lowers credibility (E12, metadata verified only).
- No India-specific study of dialect-matched calls was found before the search budget ran out.
- **Patronising and uncanny risk is untested.** The uncanny-valley evidence measures trust (E13), but on robot faces. The panel protocol tests patronising-ness and the cost to an out-group directly.

**(b) Producibility on Azure.** The ear side is better than predicted, the mouth side is untested by ear, and a custom voice is gated.

- **Azure STT supports Bhojpuri (bho-IN)** for fast transcription and custom speech. This is verified in the docs dated 2026-09-09 and in the live locale list (E17). No other Hindi-belt dialect has a locale.
- **Azure TTS has no dialect locale.**
  - There are 72 Indian-locale voices: hi-IN 30, en-IN 20, and 2 each for 11 other languages.
  - None is for Bhojpuri, Maithili, Magahi, Awadhi, Rajasthani, Haryanvi or Chhattisgarhi (E16).
  - **Tamil is thin:** two standard voices with no styles. The richer options are multilingual en-IN DragonHD and IndicNeural voices with ta-IN as a secondary locale.
- **The quick test** was 6 voices × 2 registers for Hindi and 4 voices × 2 scripts for Tamil, using synthetic audio and one script each (E18–E21). Results:
  - A Bhojpuri-dominant turn read by hi-IN and multilingual voices came back through **bho-IN ASR with 11–12 of 13 Bhojpuri marker words intact**.
    - Devanagari token recall was 0.90–0.95, against 1.00 for the same content in neutral Hinglish.
    - Under **hi-IN** ASR only 7–11 of 13 survived. The Hindi model "corrects" Bhojpuri into Hindi (बोलत→बोलद, एह→यह, के→की), so hi-IN round-trips overstate mispronunciation. The harvest found the same thing (hp-voice-cloning, n = 20).
    - One systematic miss: दोसरा came back as दूसरा in 6/6 voices under both ASRs. That is probably read with Hindi phonology.
    - **The ASR checks intelligibility of the words, not accent, prosody or authenticity. Whether it sounds like a Bhojpuri speaker or a Hindi speaker reading Bhojpuri is for the listener panel to decide.**
  - **Tamil-English:** English words written in Latin script and glued to a Tamil suffix ("Motors-ல", "Plus-க்கு", "monthsக்கு") are **silently dropped** by both the ta-IN and DragonHD voices.
    - The probe confirmed it: 6.66 s vs 7.72 s audio, and the words were missing from the ASR (E19).
    - Writing the loanwords in Tamil script fixes it (CER 0.09–0.14 vs 0.54–0.58). This needs a text normaliser, not a new voice.
  - "11 am" became a word-like token in 18 of 20 clips. Write times as words.
- **Custom voice.** Azure Custom Neural Voice is Limited Access, and "only customers managed by Microsoft … working directly with Microsoft account teams are eligible" (page dated 2026-03-31; E23). The harvest notes "no Professional CNV on a grant". A Bhojpuri-native CNV is not available to VP today without a Microsoft account-team relationship.
- **The open path exists but is unproven.**
  - No open model ships Bhojpuri TTS:
    - IndicF5 covers 11 languages.
    - Indic Parler-TTS covers 21, including Maithili, with unofficial Chhattisgarhi.
    - Indic-Speak covers 23, including Maithili.
  - AI4Bharat's **bhili-tts** fine-tuned Indic Parler-TTS on **10 hours of studio speech** for a dialect (E25). That is the template for a Bhojpuri voice: record about 10 h from one consenting native voice talent and fine-tune on Azure GPUs.
  - Vaani has 490 h of Bhojpuri (26.6 h transcribed) for ASR adaptation, but it is spontaneous phone audio, not TTS-grade (E24).
  - Serving cost and latency are the blocker. The harvest measured IndicF5 at RTF 2.87 on a T4 (slower than real time) and serverless T4 cold starts of 161–293 s (E26). Nobody in this programme has measured Parler-family streaming on A100/H100. ACA consumption A100 lists at $0.000741/s, about $2.67/h (l2 data).

**(c) Region inference: number series cannot pick a dialect, and LID cannot either (on this evidence).**

- **Series → LSA.** A mobile number's series maps to the licensed service area (LSA) where it was first issued, and MNP keeps the series.
  - Porting is common: 15.83 M requests in August 2026, of which Bihar LSA had 1.47 M, about 1.35% of its ~109 M wireless subscribers per month (TRAI PR 125/2026; E29).
  - Intra-LSA porting does not change the LSA inference. Inter-LSA porting (allowed since 2015-07-03) does, and TRAI does not publish its share.
  - Migrants keep their home numbers. This is good for inferring *origin* dialect and bad for inferring *location*.
- **The real limit is LSA → dialect.**
  - The Bihar LSA includes Jharkhand and, in Vaani's own data, contains Bhojpuri, Maithili, Magahi, Angika, Bajjika, Khortha and Sadri speakers. UP East mixes Bhojpuri and Awadhi.
  - So the precision of "this number speaks Bhojpuri" is capped by Bhojpuri's share of the LSA, and that share was not measured here (Census mother-tongue tables not fetched; gap).
- **First-turn LID** with Azure among {hi-IN, en-IN, ta-IN, bn-IN} was right on 20/20 clips. Among {hi-IN, bho-IN} it labelled only 2 of 6 Bhojpuri clips as bho-IN (E21). That is synthetic speech and a tiny n, but it is consistent with dialect ID being much harder than language ID.
- **Lawful route.**
  - Under DPDP s.5–6, the notice must name the data and the purpose, and consent is limited to what that purpose needs.
  - Using a phone number or the first utterance to pick the *language of the call* fits a purpose like "to talk to you in your preferred language", stated in the notice.
  - Storing an inferred "Bhojpuri" label as a profile attribute goes further. If it drives decisions, s.8(3) requires it to be accurate.
  - Safest design:
    1. Ask or offer the choice: a WhatsApp button, an IVR prompt, or the agent asking once.
    2. Store the *stated* preference.
    3. Let the customer override.
    4. Never infer ethnicity or caste.
    5. Default to neutral Hinglish (or the state language in the south) when unsure.
  - Bhojpuri is not an Eighth Schedule language, so a DPDP notice cannot be required in Bhojpuri. Maithili is (E30).

**H6 kill status: open.**

- The "listeners don't prefer it" arm needs the panel, which is ready to run.
- The "can't produce it" arm is partly passed on objective intelligibility but untested on accent authenticity.
- Inference accuracy is a likely kill for *automatic* dialect matching. Opt-in matching survives.
- Language matching (Tamil, Telugu, Kannada, Bengali, Marathi) is low-risk and producible on Azure today. For Tamil that requires the normaliser fix.

---

## 2. Prediction check against `predictions.md`

| H | prediction (prior) | outcome | why |
|---|---|---|---|
| H5 (0.65) | Little rigorous outcome evidence that emotional/relational voice lifts conversion; some evidence that naturalness reduces early hang-ups; overall mixed; warmth risky in collections | **Supported, with two corrections** | Supported: no outcome study of "emotional/relational" voice agents exists in what was read. **Correction 1:** the naturalness → early-hang-up link is weak. Choi found AI was *not* hung up more within 10 s, and the Rime study found about 2.4 pp between TTS vendors; the big hang-up effect was disclosure in 2017 (56%), which may have vanished by 2026. **Correction 2:** collections is where human presence has the *largest* measured outcome value (+34 pp call vs letter; 9–12 pp human vs AI) as well as the largest conduct risk. "Warmth is a risk in collections" is true, but incomplete. |
| H6 (0.55) | Language matching strongly preferred; dialect matching inside the Hindi belt weak or mixed, with patronising risk; Azure cannot produce acceptable Bhojpuri-mix speech today | **Mixed** | Language matching: supported by revealed hiring practice (83–93% of Tamil Nadu postings require Tamil), not yet by listeners. Dialect weak/mixed: **untestable yet**, though indirect evidence (dialect absent from about 460 Hindi-belt postings) is consistent. "Azure cannot produce": **partly wrong as stated.** Azure has Bhojpuri STT, which was not expected, and stock hi-IN voices render Bhojpuri text that a Bhojpuri ASR recovers at 11–12/13 marker words. "Acceptable" is untested until the panel runs. A native custom voice is gated (CNV Limited Access). |

---

## 3. Evidence

The full list, with notes, is in `evidence.csv`. The rows below carry the decision.

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| E01 | Disclosure before an outbound AI sales call: purchase 0.237 → 0.048; 56.3% hung up within 5 s; undisclosed bot ≈ proficient human (0.251) | Luo et al., Marketing Science 38(6), doi:10.1287/mksc.2019.1192, Table 3 | 2019 | read-primary | high |
| E02 | 2026: disclosure no longer lowers conversion (n = 1,337); AI trails humans on sales-process discipline (n = 366); people recognise AI voice regardless (n = 238) | Habel, Zawadzki, Freise, SSRN 7013259 | 2026-07/08 | read-secondary (abstract) | medium |
| E03 | AI collectors: −9 pp NPV (RD), −12 pp by day 5 (RCT); not hung up more within 10 s; calls 31 s shorter; 21 pp fewer promises | Choi et al., NBER w33669 | 2025-04 | read-primary | high |
| E04 | Call vs letter: +34.4 pp repayment; likeable-voice agents 84.5% vs 71.6% paid; +1 SD likeability ≈ +4 pp (8 agents) | Laudenbach et al., JF 2025 / CESifo WP 7295 | 2021/2025 | read-primary | high / medium |
| E05 | Humanised chatbot: conversion up (+10.8 pp, n = 323 WP), price sensitivity up | Schanke et al., ISR 2021 | 2021 | read-primary | medium |
| E06 | Anthropomorphism hurts angry customers' satisfaction and purchase intent | Crolic et al., Journal of Marketing | 2021/22 | read-secondary | high |
| E09 | TTS vendor choice moved intro hang-up by ≤ 2.4 pp across ~99,400 disclosed US survey calls | Rime / Miravoice (vendor-funded) | 2026-06-24 | vendor-claim | low-medium |
| E10 | Same-accent speakers judged more knowledgeable than experts with another accent (N = 96) | Dahlbäck et al., CHI 2007 | 2007 | read-secondary | medium |
| E15 | Postings: 82.8% Chennai / 91.0% Coimbatore require Tamil; 1 of ~460 Hindi-belt postings requires a dialect | l3 Apna crawl, re-analysed (`code/job_lang.py`) | 2026-10-17 | computed | medium |
| E16 | Azure TTS: 72 Indian-locale voices; no Hindi-belt dialect locale; ta-IN has 2 standard voices | Azure voices/list, vp account | 2026-10-17 | measured | high |
| E17 | Azure STT supports bho-IN (fast transcription + custom speech) | MS Learn language-support (2026-09-09) + live locales API | 2026-10-17 | read-primary + measured | high |
| E18 | Bhojpuri round-trip: 11–12/13 markers via bho-IN ASR (7–11 via hi-IN); Hinglish control recall 1.00 | this lane, `samples/roundtrip-summary.csv` | 2026-10-17 | measured | medium |
| E19 | Tamil: Latin English words glued to Tamil suffixes are dropped by Azure TTS | this lane, `samples/probe-tamil-glued-tokens.json` | 2026-10-17 | measured | high |
| E21 | LID: language-level 20/20; Bhojpuri vs Hindi 2/6 | this lane | 2026-10-17 | measured | low |
| E23 | CNV is Limited Access, for Microsoft-managed customers only | MS Learn limited-access page (2026-03-31) | 2026-10-17 | read-primary | high |
| E24 | Vaani: Bhojpuri 490 h audio / 26.6 h transcribed; Maithili 466 / 20.8; Chhattisgarhi 407 / 17.7 | HF dataset card | 2026-09-17 | computed | high |
| E25 | No open Bhojpuri TTS; Indic Parler-TTS has Maithili; Bhili TTS from 10 h of studio data | HF model pages | 2026-09/10 | read-primary | high |
| E26 | IndicF5 RTF 2.87 on T4; cold start 161–293 s | harvest hp-private-voice (owner-measured) | 2026-08 | measured (owner) | high |
| E29 | 15.83 M MNP requests in Aug 2026; Bihar LSA 1.47 M (~1.35%/month); inter-LSA MNP since 2015 | TRAI PR 125/2026 | 2026-09 | read-primary | high |
| E30 | DPDP: purpose-specific consent; notice names data and purpose; accuracy duty when used for decisions | DPDP Act 2023 ss.5, 6, 8(3) | 2023 | read-primary | high |
| E31 | No TRAI AI-disclosure rule; IT Rules SGI audio disclosure; telco AI flags short-call CLIs (reg 21A) | lane l1 (S03, S02, S20) | 2026-09-18 | read-primary (via l1) | high |
| E33 | Owner: Azure TTS rejected by ear "not human, not Indian"; realism's business effect never measured | harvest hp-main, hp-voice-cloning, hp-vyakti-latest | 2026-08 | measured (owner) | high |

**Contradictions kept, not smoothed:**

- **E01 vs E02 on disclosure:** −80% in 2017 China against no effect in 2026. The likely reasons are AI familiarity and recognisability. A vendor-funded study (E09) still saw 88–90% intro hang-ups with a 20–30 s disclosure, but that was cold survey calls to landlines, which is not comparable.
- **Laudenbach (likeable voice helps) vs Choi (no early-hang-up difference for an obviously synthetic voice):** these measure different stages, persuasion and pickup.
- **Schanke vs Crolic:** humanising helps conversion in calm transactions and hurts with angry customers.

---

## 4. Measurements (this lane)

| id | what | n | method | date | result |
|---|---|---|---|---|---|
| M1 | Azure voice inventory | 958 voices / 154 locales | GET voices/list, southeastasia, vp key | 2026-10-17 | 72 Indian-locale voices (51 GA / 21 preview). HD: en-IN DragonHD ×6 (GA, 91 secondary locales); hi-IN MAI-Voice-2/2.1 (preview, 13–18 emotion styles); hi-IN Diya DragonLatest (preview). en-IN *IndicNeural ×4 with 12 Indian secondary locales. No dialect locale. |
| M2 | Stimuli generation | 1 call, 2,115 tokens | gpt-5.4 (2026-03-05) deployment created in vp-research-rg and deleted after use | 2026-10-17 | Bhojpuri-mix, neutral Hinglish and Tamil-English (Latin and Tamil script) turns, 57–73 words, in `samples/stimuli-text.json`. **Not reviewed by native speakers.** |
| M3 | TTS render | 20 clips + 6 probes, ~7.8k chars | REST v1, riff-24khz-16bit | 2026-10-17 | 22.5–36 s per turn. Speaking rate: hi-IN neural 117–124 wpm; MAI-Voice-2.1 137–155; DragonHD Aarti 164–195 (fast); Tamil 96–117 wpm. DragonHD over REST delivered its first 4 KB after 10.9–14.8 s, because REST is non-streaming; use the WebSocket stream, where the harvest measured 228/287 ms. |
| M4 | ASR round-trip hi-IN / ta-IN | 20 clips | Azure fast transcription 2024-11-15 | 2026-10-17 | Hinglish Devanagari recall 1.00 (6/6 voices); Bhojpuri recall 0.73–0.90, markers 7–11/13; Tamil CER 0.54–0.58 (Latin mix) vs 0.09–0.14 (Tamil script). Every transcript came back in the correct script (Devanagari or Tamil). |
| M5 | ASR round-trip bho-IN | 12 clips | Azure fast transcription, locale bho-IN (one 429, retried) | 2026-10-17 | Bhojpuri recall 0.90–0.95, markers 11–12/13 (दोसरा lost 6/6; एह 2/6; काल्हे 2/6); Hinglish 0.97–1.00 |
| M6 | Tamil glued-token probe | 6 clips (3 spellings × 2 voices) | TTS + ta-IN ASR | 2026-10-17 | Glued spelling drops "Motors / Plus / months" in both voices; spaced Latin spelling restores them in Pallavi but DragonHD returned a garbled ASR (possible artefact, listening check needed); Tamil script works |
| M7 | Language ID | 20 + 12 clips | fast transcription, multi-locale | 2026-10-17 | {hi, en, ta, bn}: 20/20 correct. {hi, bho}: Bhojpuri clips labelled bho-IN on the first phrase in 2/6; Hinglish 0/6 |
| M8 | Language requirements in job posts | 6,454 postings | regex over L3's anonymous Apna crawl (`code/job_lang.py`) | crawl 2026-10-17 | See E15 and `job-language-requirements-by-city.csv`. Phrases: "regional language" in 1,052 postings, "local language" in 111. |
| M9 | Vaani hours by dialect | 165 districts | parse of the HF dataset card table | 2026-10-17 | `vaani-dialect-hours.json`; totals reconcile exactly (31,278.4 h audio / 2,122.2 h transcribed) |
| M10 | Panel power | 1,500 simulations per cell | logit random-intercept simulation, seed 20261017 | 2026-10-17 | 75 analysed listeners per primary panel give power 0.82–0.94 for p = 0.60 (sd_u = 0.5, α = 0.0125–0.05) and cover d_z = 0.4 at α = 0.0125 |
| M11 | Pilot A/B sizing | analytic | two-proportion, α = 0.05, power 0.8 | 2026-10-17 | early hang-up 15 → 10%: 686 per arm; booking 10 → 13%: 1,774 per arm |

The phone-band copies were made with
`ffmpeg -af "highpass=f=300,lowpass=f=3400" -ar 8000 -ac 1 -c:a pcm_mulaw`. That simulates the channel; it is not a
network-path measurement.

**What the objective tests cannot tell you.** The ASR checks whether the words survive. They cannot tell whether a
Bhojpuri speaker hears a fellow Bhojpuri speaker or a Hindi newsreader reading Bhojpuri. Meera's history is the warning
here: Azure won 15/15 on pronunciation and lost by ear. Nobody in the team has listened to these clips as a judge, by
design. The panel is the instrument for that.

---

## 5. Gaps in the market

1. **Dialect controls.** No voice-AI vendor documents dialect selection. Lane l4a's parity matrix shows "dialects" as unknown or marketing-only for all of about 23 vendors, and Gnani, Sarvam and Ravan claim it only in marketing copy (E28). If the panel shows a preference, an *opt-in* dialect register (Bhojpuri, Maithili, Marwari, Haryanvi) with a measured effect would be differentiated and defensible.
2. **Bhojpuri and Maithili TTS.** No Bhojpuri TTS exists in Azure, Sarvam (11 languages), IndicF5 or Indic Parler-TTS. Maithili exists in Indic Parler-TTS and Indic-Speak but not in any commercial streaming API checked. Azure now *hears* Bhojpuri (bho-IN STT) but cannot speak it. A fine-tuned voice built from about 10 h of studio data (the Bhili precedent) is a plausible in-house asset, in line with the owner's preference for in-house components, if latency on Azure GPUs can be made streaming-grade.
3. **Tamil on Azure is under-served:** 2 standard voices, no HD, no styles. Code-mixed Tamil text silently loses English words. A Tamil-English normaliser plus voice selection among multilingual HD voices is a concrete, testable engineering edge for Tamil Nadu buyers, where 83–93% of telecalling jobs require Tamil.
4. **Nobody publishes outcome data on vernacular or dialect calls in India.** Vendor claims exist, for example SquadStack's experiments on "timing, language, framing" (via l4c; vendor claim), but no public A/B does. A measured, published result from VP's first pilot would be a sales asset.
5. **Number-health as a product feature.** Early-hang-up reduction protects CLIs from TCCCPR AI flagging. No vendor frames realism this way.

## 6. What would kill this

- **H5:**
  - A pilot A/B with at least ~700 calls per arm shows no reduction in early hang-ups (15 → 10% detectable) and no lift in qualified rate from the more natural or more human configuration. Realism then drops from wedge to hygiene.
  - Or, if competitors already match our realism at a lower price, realism is not the wedge either (H4 lane).
- **H6, preference:**
  - The panel lower bound for matched preference is ≤ 0.50 in Bihar/East UP. Or matched patronising is not non-inferior. Or the out-group trust loss times the misclassification rate exceeds the in-group gain. Then automatic dialect matching is dropped and only *language* matching (and opt-in dialect) remains.
- **H6, production:**
  - Native listeners rate the best Azure Bhojpuri-mix rendering below 3.5 MOS on naturalness, or below neutral on accent fit.
  - And the fine-tune path cannot reach streaming latency (time to first audio ≤ ~300 ms, RTF < 0.5) on an Azure GPU at an acceptable ₹/min (H2 lane).
- **H6, inference:**
  - If automatic dialect inference cannot reach precision ≥ 0.8 from the available signals (number LSA, CRM field, first-turn ASR), it is not used. Only opt-in remains.

## 7. Owner actions (exact steps)

1. **Approve and fund the listener panel** (`panel-protocol.md`). Budget about ₹77.5k for listener pay plus ₹30–50k for coordinators. These are estimates, outside the ₹10k Azure cap.
   1. Pick a recruitment channel per region: a local coordinator, Karya, or a field agency.
   2. Sign a simple contract.
   3. Freeze the protocol hash in `predictions.md`.
2. **Native-speaker review of the stimuli.** Hire 2 Bhojpuri and 2 Tamil native speakers, about ₹1–2k each. They edit `samples/stimuli-text.json` independently and reconcile; the text is then frozen and re-rendered.
3. **Record the human reference.**
   1. Engage one native Bhojpuri telecaller and one native Tamil telecaller as voice talent.
   2. Obtain written consent for research use (a template can be adapted from the Azure talent disclosure).
   3. Record the frozen scripts in a quiet room on a phone app at 48 kHz.
4. **Hugging Face access.** Accept the gated terms for `ARTPARK-IISc/Vaani` and `ai4bharat/IndicVoices` with the owner's HF account, then share a read token in the scratchpad env. This lets the next run test **bho-IN ASR on real human Bhojpuri speech** (26.6 h transcribed), which separates TTS quality from ASR bias.
5. **Microsoft account team.** If a custom Indic voice is wanted, ask the Azure startup or account contact whether VP can become a "Microsoft-managed customer" for CNV Limited Access (https://aka.ms/customneural). Ask also about Personal Voice approval. Do not record any talent before that answer and a consent template are in place.
6. **Discovery interviews (H3 lane).** Add three questions:
   - "Do you assign callers by customer language or region?"
   - "Do your Bihar/UP teams speak Bhojpuri to customers, and is it written in any SOP or hiring brief?"
   - "Can you share dialler reports split by caller language (connect, talk time, conversion)?"
7. **Legal review** (alongside the l1 lawyer review). Two items:
   - DPDP notice wording for "we will talk to you in your preferred language" and for storing a stated language preference.
   - Whether the IT Rules 2026 SGI prefixed-audio-disclosure duty applies to VP as a tool provider.

## 8. Open questions

- **Setting of Habel et al. (2026).** Country, industry and effect sizes are unknown because SSRN returned 403. It is load-bearing for "disclosure no longer matters" and needs the full text.
- **Real-speech accuracy of bho-IN ASR**, especially on narrowband phone audio and on code-mixed Bhojpuri-Hindi. This needs Vaani or IndicVoices-style real data (owner action 4).
- **Within-LSA dialect shares**, from Census 2011 C-16 mother-tongue tables by district, and the **inter-LSA share of MNP**. Together they bound automatic dialect-inference precision. Neither was fetched: search budget exhausted, and dot.gov.in returned a 4.4 KB stub.
- **India-specific evidence on dialect or accent trust in calls**, and evidence on **elderly or vulnerable** callees and AI voice. Not searched (budget). Needed before any collections or insurance-renewal pitch that leans on warmth.
- **The DSS 2025 paper "Emotion vs. information"** (AI-powered call systems at a securities company). Known only from a search snippet that says informational advantages raise intention while empathy gaps suppress it; ScienceDirect returned 403. Read it before relying on it.
- **Streaming RTF and time to first audio** for Indic Parler-TTS, Indic-Speak or a Bhojpuri fine-tune on Azure A100/H100. These are unmeasured, and they decide whether the in-house dialect voice is viable at the ₹/min target.
- **Whether hi-IN HD voices can carry Bhojpuri prosody**, or only its words. Only listeners can say.
- **A possible DragonHD artefact in Tamil** (garbled or extra tokens in 2 probe clips). It needs a listening check before DragonHD is used for Tamil.

## 9. Product-thesis notes for synthesis (from this lane only)

- **Matters for the wedge:**
  - competence realism: short turns, barge-in, number accuracy, a clear next step and a commitment-securing close;
  - language matching in the south and east;
  - one likeable, accent-appropriate voice per language, chosen by blind panel and never by metrics alone (inherited law 26);
  - early hang-up as the leading metric.
- **Later:**
  - opt-in dialect registers (Bhojpuri first, if the panel says so);
  - an in-house fine-tuned dialect voice once streaming latency is measured;
  - per-contact language memory.
- **Not at all for the wedge:**
  - "emotional/relational" as a selling claim, which has no outcome evidence;
  - automatic dialect inference from phone numbers, which is too coarse;
  - warmth-heavy collections scripts, where the conduct and regulatory risk is highest.
