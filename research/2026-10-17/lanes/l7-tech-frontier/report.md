<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l7-tech-frontier: what is real now in voice AI, and the dated cost curve (H9, desk side)

Date: 2026-10-17. Lane spend: INR 0 (no Azure calls; all compute was local CPU). Files in this folder:
`prices.csv` (113 dated price rows with sources), `fit.py` (curves and forecasts; re-runnable),
`fit-results.json`, `series-per-minute.csv`, `curves.png`, `radar.csv` (21 items), `timeline.csv`
(25 releases plus one upcoming rule), `asr_bench/` (CPU ASR mini-benchmark code, manifest and scores).

**Search limits.** This lane ran **zero WebSearch queries**. The programme's shared search budget
was already used up when the lane started. Everything below therefore comes from primary material
fetched directly:
- the Azure Retail Prices API (effective dates of every meter);
- 115 Common Crawl captures of vendor price pages, 2023-03 to 2026-09;
- Microsoft Learn release notes and docs;
- Hugging Face model cards and API metadata;
- git history of the framework repositories;
- the llm-prices dataset's git history;
- the owner's harvest and the other lanes' files.

Blocked: web.archive.org (connection reset), github.com web and API (403, repo-scoped session),
index.commoncrawl.org (reset; data.commoncrawl.org worked), gated Hugging Face datasets and models
(IndicVoices, IndicConformer; no sign-ups allowed), and JS-only price pages (AWS, Google Cloud,
openai.com live).

---

## 1. Answer to the hypothesis (H9)

H9 asks for the frontier as dated curves rather than slogans. The answers:

1. **"Voice AI cost goes to zero" is false for the stack VP would actually buy on Azure.**
   - At one fixed workload (lane l2's base case), the AI-only cost of a managed Azure cascade at
     our quality bar fell **17.5x in 3.5 years**:
     - $0.579/min in April 2023 (GPT-4 era) to $0.033/min (**INR 3.14**) today;
     - almost all of that happened by 2024-11;
     - over the **last 24 months it fell only 1.7x** ($0.056 to $0.033), and it has sat in a
       **$0.033-0.039 band since 2025-09**.
   - The budget managed stack (cheapest small LLM, Neural TTS) fell 1.7x in two years, to **INR 1.39**.
   - Realtime speech-to-speech fell 4.3x in two years, to $0.050 (INR 4.79). It has been flat for
     13.6 months.
2. **What stopped falling, with dates:**
   - **Frontier LLM tier, per token.** It bottomed with GPT-5 in 2025-08 and rose with GPT-5.4
     ($2.50/$15) in 2026-03. Today's GPT-6 Sol ($2/$10) costs the same per reference minute as
     GPT-4.1 did in 2025-04.
   - **Azure STT list price.** $1 per audio hour has not changed since 2018-11-01. The only drops
     came from new SKUs: Voice Live speech input at $0.009/min and BYO at $0.0075/min (2025-10/11).
   - **Azure Neural TTS.** $15 per 1M characters since 2024-02-01. The quality-bar voice (Neural HD)
     costs *more*: $30, then $22 from 2026-03-01.
   - **Premium third-party TTS.** ElevenLabs Flash at ~$50-60 per 1M characters and Cartesia at
     ~$37 per 1M characters were flat across 21-25 months of captures. Deepgram's newer models
     cost *more* (Nova-3 $0.0077 vs Nova-2 $0.0059 per minute; Aura-2 $30 vs Aura $15).
   - **US platform fees.** Vapi's $0.05/min is unchanged for 28 months.
3. **What is still falling fast:**
   - small LLMs at fixed capability (x0.26 per year over the full history);
   - Indian voice-agent list prices: Ringg $0.20 to INR 6 (x2.9), Bolna $0.10 to $0.06;
   - self-hostable open models (Nemotron 3.5 ASR, Magpie TTS, PhoneLLM) on rented GPUs.
4. **Forecast, dated and falsifiable** (INR per connected minute, AI only, excluding telephony, at
   INR 95.11/$):

   | stack | today | end-2026 | end-2027 | end-2028 |
   |---|---|---|---|---|
   | A. Managed Azure, quality bar | 3.14 | P50 3.14 | **P50 1.89 (P10 1.41, P90 2.84)** | P50 1.52 (1.05-2.04) |
   | B. Managed Azure, budget | 1.39 | P50 1.39 | P50 1.24 (0.95-1.37) | P50 1.06 (0.76-1.35) |

   - Probabilities: P(A < INR 1.0 by end-2027) = 0.01; P(B < INR 1.0 by end-2027) = 0.13;
     P(B < INR 0.5 by end-2028) = 0.01.
   - A second method (log-linear regime mixture) gives end-2027 A at P50 2.43 (1.61-3.33) and B at
     P50 1.22 (0.76-1.38).
   - Both methods allow only price cuts, never rises, so they lean toward "cheap".
   - The **only** route to about INR 0.5/min is **self-hosting** open ASR, TTS and a small LLM on
     Azure GPUs at ≥50% utilisation. That is a computed INR 0.49/min today, built from vendor
     throughput claims. It is **not yet at the quality bar**: the open voice-agent LLM is English-only
     and the open multilingual TTS has no published Hindi quality metric.
5. **Real now vs coming** (section 4):
   - **Production-ready inside the directive:** the harvest's cascade, "Voice Live as the ear, our
     LLM as the voice":
     - Voice Live has been GA since 2025-11;
     - Live-Reference AEC is GA in API 2026-07-15;
     - Azure added a 13-locale Indic multilingual STT model in 2026-10;
     - MAI-Transcribe-2 arrived in 2026-09.
   - **Not production-grade for Indic at our bar:** full-duplex speech-to-speech.
     - Every open full-duplex model card (Moshi, PersonaPlex, NemotronLabs VoiceChat) is
       English-only.
     - Azure's realtime models (gpt-realtime-2.1, GPT-Live-1, and the new azure-realtime with Indian
       voices, GA 2026-07-25) still speak before any text gate can run (harvest law 25).
6. **One new fact changes the architecture.** On 2026-09-23 Microsoft announced it is retiring
   standalone **Azure Communication Services**:
   - ACS Direct Routing, PSTN numbers, SMS, Email and WhatsApp are retired on 2028-09-30;
   - Call Automation and Audio Streaming become Teams-only;
   - **from 2026-10-23, customers without an ACS resource cannot acquire PSTN numbers.**

   The harvest's planned telephony leg (ACS Call Automation plus Direct Routing) is therefore a dead
   end. VP's PSTN leg must be an Indian CPaaS or telco SIP or WebSocket stream into a gateway we run
   on Azure. ACS Email, which the harvest planned as the outbox, is also retiring.

**Verdict on H9: mixed.**
- The technology frontier is moving fast: 25 consequential releases in 18 months.
- The list-price cost of the managed Azure stack VP would ship has largely stopped falling.
- The cost floor is now set by vendor pricing, by the quality bar (newest LLM, HD voice), and by
  telephony, not by model efficiency.

---

## 2. Prediction check against predictions.md (H9, prior 0.50)

| part of the H9 prediction | outcome | why |
|---|---|---|
| "AI cost per minute of a voice stack fell roughly 5-10x over the last 2 years" | **refuted for cascades; borderline for S2S** | Measured on dated list prices at a fixed workload, 2024-10-17 to 2026-10-17: managed Azure quality-bar cascade 1.7x; budget cascade 1.7x; realtime S2S 4.3x (9x if the uncached Oct-2024 preview price is used); Indian platform list prices 2.5-2.9x. A 5-10x fall holds only over 3.5 years (17.5x since 2023-04). |
| "Full-duplex speech-to-speech is not production-grade for Indic languages at our quality bar today" | **supported** | No open full-duplex model card lists Hindi conversation. Azure realtime is GA but ungateable (harvest: 41-53 words/turn, 38% pause takeovers for GPT-Live-1). Azure realtime's Indian voices (2026-07-25) change the voice, not the gating. |
| "AI cost (excluding telephony) reaches about INR 0.5/min by the end of 2027" | **refuted for managed Azure; possible only self-hosted** | Managed P(<INR 0.5 by end-2027) is about 0 for A and B under both methods. Self-hosting computes to INR 0.49 today, but not at the quality bar and before an N+1 minimum fleet, which dominates below about 1M min/month (lane l2). |

Overall: **mixed, leaning refuted**. The prior of 0.50 was about right in confidence and wrong on the
two cost parts.

---

## 3. Cost curves: method and results

**Workload** (fixed, so 2023 and 2026 prices are comparable; lane l2's base case). Per connected
minute:
- **LLM:** 4.8 calls of 3,720 input tokens and 70 output tokens; 85% of a 3,000-token system prompt
  is billed at the cached rate where caching exists.
- **ASR:** 1.0 streamed audio minute.
- **TTS:** 440 characters.
- **Realtime:** 300 fresh audio-in tokens, 600 audio-out tokens, and 3,000 audio plus 3,000 text
  context tokens re-read at the cached rate.

Telephony is excluded and shown separately.

**Series** (`series-per-minute.csv`). For each component:
- the **cheapest-available envelope**: old SKUs stay purchasable, so the level only steps down;
- or, for the quality bar, the **newest flagship** (LLM) and the **best Azure voice** (TTS).

| series | first point | today | total fall | annual multiplier, full history [90% CI] | last 18 months | months since last cut |
|---|---|---|---|---|---|---|
| LLM, newest flagship (GPT-4 to GPT-6.1 Sol) | 2023-03 $0.556 | $0.0158 | 35x | 0.43 [0.37, 0.66] | **1.02** [0.57, 1.35] | 0.6 (small cached-price cut) |
| LLM, cheapest small (3.5-turbo to 5-nano) | 2023-03 $0.0364 | $0.0005 | 76x | 0.26 [0.14, 0.37] | 0.70 [0.09, 1.00] | 14.3 |
| ASR, Azure streaming (excl. 100k-hour commitment) | 2018-11 $0.0167 | $0.0075 | 2.2x | 0.90 | 0.64 | 11.5 |
| ASR, any vendor streaming | 2018-11 $0.0167 | $0.0025 (AssemblyAI) | 6.7x | 0.77 | 0.70 | 16.0 |
| TTS, Azure Neural | 2024-02 $0.0066 | $0.0066 | 1.0x | 1.00 | 1.00 | 43.6 |
| TTS, Azure quality bar (Neural, then HD) | $0.0066 | $0.0097 | **0.7x (rose)** | 1.16 | 1.15 | 7.6 |
| TTS, premium third party (ElevenLabs, Cartesia) | 2024-09 $0.0165 | $0.0165 | 1.0x | 1.00 | 1.00 | 25.0 |
| Realtime S2S flagship (gpt-4o-realtime to gpt-realtime-2.1) | 2024-10 $0.2175 | $0.0504 | 4.3x | 0.58 | 0.82 | 13.6 |
| Realtime S2S mini | 2024-12 $0.0161 | $0.0161 | 1.0x | 1.00 | 1.00 | 22.0 |
| Platform fee, US (Vapi) | 2024-06 $0.05 | $0.05 | 1.0x | 1.00 | 1.00 | 27.8 |
| Platform, India all-in (Ringg, VoiceGenie) | 2024-06 $0.20 | $0.068 | 2.9x | 0.64 | 0.49 | 0 |

**Price-cut process** (`fit-results.json` → `cut_process`). Over 2024-01-01 to 2026-10-17, the
Azure-relevant components recorded 16 downward steps:

| class | cuts | rate | median cut |
|---|---|---|---|
| LLM | 11 in 5.6 component-years | 1.97/yr | 49% |
| Speech (ASR, TTS) | 3 in 8.4 component-years | 0.36/yr | 27% |
| Realtime | 2 in 5.6 component-years | 0.36/yr | 33% |

LLM prices are the only line still being cut often. Speech prices are cut rarely and by less. This
asymmetry is why the managed stack has flattened: in stack A, ASR plus TTS is now about 52% of AI
cost.

**Forecast method.** Monte Carlo with 20,000 draws per stack and date.
- **Method 1:** a log-linear trend whose slope is drawn half the time from the full-history fit and
  half from the last-18-month fit, with a residual shock; slopes are capped at 0.
- **Method 2:** class-specific Poisson price cuts with empirically drawn sizes; no increases.
- Both methods lean toward cheapness: they never model a price rise, although rises happened
  (GPT-5.4, Neural HD, Nova-3, Aura-2, Gemini 2.5 Live).

**Stack history** (USD per connected minute, AI only):

| date | A, managed Azure quality bar | B, managed Azure budget | C, realtime S2S flagship |
|---|---|---|---|
| 2023-04-01 | 0.579 | 0.060 | n/a |
| 2023-12-01 | 0.212 | 0.042 | n/a |
| 2024-06-01 | 0.118 | 0.033 | n/a |
| 2024-10-17 | 0.056 | 0.025 | 0.218 |
| 2025-05-01 | 0.043 | 0.024 | 0.075 |
| 2025-09-01 | 0.035 | 0.024 | 0.050 |
| 2026-01-01 | 0.033 | 0.015 | 0.050 |
| 2026-04-01 | 0.039 (GPT-5.4 raised it) | 0.015 | 0.050 |
| 2026-10-17 | **0.033 (INR 3.14)** | **0.015 (INR 1.39)** | **0.050 (INR 4.79)** |

**Cross-checks:**
- Harvest BAKEOFF §5b (Retail API, 2026-10-11) gives $0.027/min for "Voice Live front end plus
  cascade" and $0.035 for a plain cascade. Lane l2's scenario A gives INR 3.07 of AI components at
  INR 95/$. Stack A's $0.033 sits between them, so they agree.
- Harvest gives **$0.088/min for gpt-realtime-2.1**; this lane models **$0.050**. The difference is
  the context re-read assumption: Taxila's model re-reads more context. **Contradiction kept.**
  Either way, realtime costs more than the cascade.

**The falsifiable statements**, to score on 2027-12-31 by re-running `fit.py` with new rows:
- **F1.** The managed Azure quality-bar cascade (stack A, as defined) costs **INR 1.4-2.9 per
  connected minute** at list price on 2027-12-31 (80% interval; median INR 1.9). It is **not below
  INR 1.0** (≥95%).
- **F2.** The managed Azure budget cascade (stack B) costs INR 0.95-1.37 on 2027-12-31.
  P(< INR 0.5) is below 1%.
- **F3.** Before 2029, below INR 0.5 per minute AI cost at our quality bar is reached only by
  self-hosting open models on Azure GPUs, at ≥50% utilisation and roughly ≥1M min/month. It also
  requires an open Hindi/Hinglish-capable small LLM that ties GPT-6 Sol on our sales sim-lab.
- **F4.** Indian PSTN carriage stays **≥ INR 0.22/min** through 2028. Captured CPaaS rates were
  INR 0.38-0.74/min from 2024-02 to 2026-10, with no decline. A regulatory A2P termination charge of
  up to INR 0.05/min is added from 2026-11-17 (lane l1, S03).
- **F5.** The Azure flagship realtime audio price stays at $32 in / $64 out per 1M tokens until
  2027-06 (better than even odds; it has been flat for 13.6 months).

**What does not fall:**
- **Telephony:** INR 0.22-0.74/min, flat, plus the new A2P charge. It is the same size as the whole
  budget AI stack.
- **Compliance:**
  - DLT registration;
  - 140/1600/1601 number series;
  - consent ledgers;
  - recording retention, e.g. RBI recovery calls recorded and kept 6 months from 2027-01-01 (lane l1).
- **Distribution:** cost to acquire a customer (lanes l4c, l10).
- **Human QA and support:** lane l2 assumes INR 0.15/min.
- **Minimum self-host fleet:** N+1 GPUs whatever the volume.
- **The quality bar:** the newest flagship LLM and HD voices cost the same as or more than the
  previous generation.
- **Platform pricing power:** platform list prices track competition, not cost. Vapi's fee is flat
  while Indian vendors cut 2-3x within 12 months.

---

## 4. Frontier survey (what it is, Azure path, Indic support, evidence quality)

The ring for each item is in `radar.csv`. Dates are release or first-public dates from primary
sources.

### 4.1 Speech-to-speech and full-duplex

| item | date | what | Azure path | Indic | evidence |
|---|---|---|---|---|---|
| OpenAI gpt-realtime family | preview 2024-10-01 ($100/$200 per 1M audio tokens); GA 2025-08-28 ($32/$64); 1.5 2026-02-23; 2 2026-05-07; 2.1 and 2.1-mini 2026-07-07 | S2S API | **Azure direct** (meters listed) | Hindi via LLM; harvest saw Urdu, Chinese or Korean script on short Hindi | Azure Retail API (read); harvest bake-off (measured, simulated phone) |
| GPT-Live-1 | Azure meter 2026-09-01, $3/hour | duration-billed S2S | Azure direct | as above | API (read); harvest: takes the floor in ~38% of natural Hindi pauses |
| Azure Realtime (azure-realtime) | GA 2026-07-25 | Microsoft S2S; 34 voices, 11 languages; ~100 ms faster than GPT Realtime 1.5 (vendor) | Azure direct (Voice Live Pro tier) | native voices include Aarti, Diya, Meera | release notes (vendor claim) |
| Gemini Live (2.0 to 3.8) | $2.10/$8.50 (2025-06); $3/$12 (2025-09 to 2026-10) | S2S | **non-Azure** (benchmark only) | yes | CC captures (read) |
| Kyutai Moshi / Unmute | Moshi weights 2024-09-11; Unmute repo 2025-06-11; RL variants 2026-06 | open full-duplex; Unmute is a cascade around any LLM | self-host | English (and French) | HF and git (read) |
| Sesame CSM-1B | 2025-03-06 (HF) | open conversational TTS | self-host | English | HF card |
| NVIDIA PersonaPlex 7B | 2025-12-31 | open full-duplex persona model | self-host | English | HF card |
| NVIDIA NemotronLabs VoiceChat 11B | 2026-08-03 | open full-duplex with tool calling, ~450 ms turn-taking (vendor) | self-host (A100/H100) | English | HF card (vendor claim) |
| Qwen3-Omni 30B-A3B | 2025-09-20 | open omni (speech in and out) | self-host | Hindi output not listed | HF card |
| Step-Audio 2 mini | 2025-08-28 | open audio LLM | self-host | en, zh | HF card |
| Ultravox v0.7 | 2025-12-02 | open speech-in LLM (text out) | self-host | lists hi, ta, mr, bn | HF card |

### 4.2 Turn-taking and end-of-turn

| item | date | Azure path | Indic | evidence |
|---|---|---|---|---|
| Voice Live azure_semantic_vad(_multilingual) | GA with Voice Live (2025-11); filler removal is English-only | Azure direct | hi-IN in the multilingual model | docs (read); harvest: EOT p50 1,480 ms vs a 900 ms bar; continuer stop list English-only |
| LiveKit turn detector (multilingual) | 2024-12-07 (HF); 14 languages | self-host; LiveKit licence | Hindi TPR 99.4% / TNR 96.3% (vendor's own set) | HF card (vendor claim) |
| Pipecat Smart Turn v3.x | v3 2025-09-11; repo updated 2026-01-29 | self-host, CPU 10-100 ms | 23 languages incl. Hindi, Marathi, Bengali | README (vendor); harvest measured 34/72 (chance) on child Hinglish |
| Deepgram Flux | priced by 2026-03-05 at $0.0077/min | non-Azure | 10 languages in multi mode (list not read) | docs, CC capture |
| Voice Activity Projection (VAP) | research line since 2022 | research | none known | not re-read this session (search budget) |

### 4.3 Indic ASR

| item | date | Azure path | evidence |
|---|---|---|---|
| Azure STT S1 real-time | $1/h since 2018-11-01 | Azure direct | API (read). 2025-05: ta/te/en-IN models 5-10% better, 20x fewer ghost words (vendor) |
| Azure multilingual Indic STT model | 2026-10 | Azure direct (Fast Transcription + Voice Live) | 13 Indic locales, code-mixing, ~10% TERR gain (vendor claim; not measured by us) |
| MAI-Transcribe-2 | 2026-09 (Speech); preview in Voice Live 2026-04 | Azure direct | covers hi bn ta te mr gu kn ml pa or as ur ne (read). Harvest: southindia stream-final 68 ms vs 753 ms for live-transcribe in eastus2 |
| gpt-live-transcribe / gpt-realtime-whisper | 2026-07-29 / 2026-05-06; $1.02/h | Azure direct | harvest: no logprobs; writes English in Devanagari |
| gpt-4o-(mini-)transcribe, gpt-transcribe | 2025-03-20; 2025-12-15; 2026-08 | Azure direct | harvest: fabricates on silence (7/12); vendor says up to 4x fewer silence hallucinations in the 2025-12-15 model |
| AI4Bharat IndicConformer 600M multilingual | 2025-03-15 | self-host (MIT; gated) | 22 languages; could not test (gated) |
| NVIDIA Nemotron 3.5 ASR streaming 0.6B | 2026-05-15 | self-host | FLEURS-hi WER 7.41% at 320 ms chunk with language ID, 9.88% auto-detect (vendor-normalised) |
| Riva Conformer-CTC Hindi | Riva 2.15 docs | self-host (NVAIE licence) | 233 streams/A100 (vendor; lane l2) |
| Whisper large-v3-turbo | 2024-10-01 | self-host (MIT) | **our CPU benchmark** (section 5) |
| Qwen3-ASR 0.6B / 1.7B | 2026-01-28 | self-host (Apache) | harvest: "हम्म" on silence 29-30/30 (1.7B, hi); **our CPU benchmark** (0.6B) |
| Meta MMS / Omnilingual ASR | 2023-05 / 2025-11-27 | self-host | 1,600+ languages; not tested |
| Voxtral Mini 4B Realtime | 2026-01-21 | self-host (Apache) | lists hi; harvest: earlier Voxtral romanised Hindi |
| Sarvam Saarika / Saaras v4 | v4 realtime keyterms 2026-09 | **non-Azure** | INR 24.6-29.4/h (lane l2) |
| Vistaar benchmark | 2023 (AI4Bharat) | data | Hindi average WER: IndicWhisper 13.6 vs Azure STT 20.0 vs Google 23.9 (2023 snapshot; stale for 2026 Azure models) |

### 4.4 TTS

| item | date | Azure path | Indic | evidence |
|---|---|---|---|---|
| Azure Neural (hi-IN 9 voices; 11 other Indian locales with 2 each) | $15/1M since 2024-02-01 | Azure direct | no dialect locales (lane l5 E16) | API, docs |
| Azure DragonHD (en-IN Aarti, Arjun, Diya, Lavanya, Meera, Neerja) | $30 (2025-09) then $22 (2026-03-01) | Azure direct | speaks Hindi as multilingual | API, CC capture; harvest first byte 228-287 ms |
| MAI-Voice-1 / MAI-Voice-2-Flash / 2.1-Flash | preview 2026-03 / 2026-07 / (2.1 seen by lane l2) | Azure direct (preview) | 2-Flash: 15 languages without hi; 2.1-Flash hi-IN-Kavya used by lane l2 | release notes; meter unknown |
| gpt-4o-mini-tts | 2025-03-20; 2025-12-15 update | Azure direct | multilingual | API |
| ElevenLabs Flash v2.5 / v3 / v4 | Flash ~$50-60/1M flat 2024-12 to 2026-06; v3/v4 70-90+ languages | **non-Azure** | hi, ta and more | CC captures, docs |
| Cartesia Sonic 3.6 | 2026-08-27; adds Hinglish (Latin-script Hindi) | **non-Azure** | 44 languages incl. hi, ta, bn, or, ur | docs |
| Sarvam Bulbul V4 | Voice Agents 2026-10-06; V3 end of life 2026-11-10 | **non-Azure** | 11 codes | changelog |
| Indic Parler-TTS / IndicF5 | 2024-10-28 / 2025-03-11 | self-host | 21 / 11 languages | lane l5 E25; harvest IndicF5 RTF 2.87 on T4 |
| NVIDIA Magpie TTS Multilingual 357M | 2025-12-11 | self-host | includes hi | 64 streams/H100, TTFA 275 ms (vendor); no Hindi metric |
| VoxCPM2 / Higgs TTS 3 / Fish S2-pro and drama-3 / Chatterbox multilingual | 2026-04-03 / 2026-06-04 / 2026-03-09 and 2026-10-01 / 2025 | self-host | all list hi (Fish also ta, bn, ur) | HF cards |
| Orpheus 3B / Kokoro-82M / Qwen3-TTS | 2025-03-17 / 2024-12-26 / 2026-01-21 | self-host | Orpheus card en; Kokoro card en; Qwen3-TTS no hi | HF cards |

### 4.5 Emotion and paralinguistics

**Hume.**
- Its site (2026-10-17) now sells "infrastructure to improve voice AI": evaluation of tone, timing,
  interruption, accent and language, Hindi included. EVI is no longer the headline.
- It is non-Azure.
- No Azure emotion-recognition service for audio was found in the docs read this session. Azure
  TTS supports emotion and style through SSML `express-as`.

### 4.6 Frameworks (git history, read 2026-10-17)

| framework | release | activity |
|---|---|---|
| **Pipecat** | v1.0.0 on 2026-04-14; v1.12.0 on 2026-09-25 | 8,103 commits in 12 months. Daily also ships PhoneLLM and Smart Turn. |
| **LiveKit Agents** | 1.0.x from 2025-04-15; 1.8.8 on 2026-10-15; 2.0.0b1 on 2026-10-12 | 1,893 commits in 12 months. Has SIP trunks and dispatch rules. |
| **Bolna** | v0.10.303 on 2026-10-16 | 1,047 commits in 12 months. Indian CPaaS plumbing: Exotel, Plivo, FreeSWITCH. |
| **TEN** | 0.11.73 on 2026-09-22 | active |
| **Vocode** | last commit 2024-11-15 | dormant |

### 4.7 Voice-agent testing and evaluation

| tool | what it offers | evidence |
|---|---|---|
| Azure **Voice Live evaluation harness** | Runs pre-recorded audio through session configurations, scored with Foundry evaluators. | Preview 2026-05. |
| **Coval** | Testing, evals and QA loop. | Site banner says $28M Series A (undated). |
| **Hamming** | Testing, red-teaming and production monitoring, with phone scenarios. | Vendor site. |
| **Cekura** | Simulation, monitoring, and cross-platform benchmarks of Vapi, Retell and ElevenLabs. | Vendor site. |
| **Hume** | Evaluation. | Vendor site. |

All of these are vendor claims. None was measured.

### 4.8 Telephony

- **Azure Communication Services:**
  - retirement announced 2026-09-23, effective 2028-09-30;
  - onboarding limits start 2026-10-23: no PSTN numbers for customers without an existing ACS
    resource;
  - Direct Routing retired; Call Automation and Audio Streaming become Teams-only;
  - ACS never sold Indian numbers (harvest).
- **Azure OpenAI Realtime over SIP:** available from 2025-10. It is for S2S only.
- **LiveKit SIP:**
  - phone numbers are US-only in LiveKit Cloud;
  - third-party SIP trunks are supported, and the server is self-hostable.
- **Indian CPaaS rates:**
  - Plivo INR 0.40/min (60 s pulse) in captures from 2024-02 to 2025-03;
  - Plivo INR 0.74 in the 2026-03 capture, against INR 0.38 (30 s pulse) live on 2026-10-17
    (contradiction kept);
  - Tata Smartflo INR 0.22/min at full fair-use;
  - Sarvam/Vobiz INR 0.40.

### 4.9 On-device

These are irrelevant to PSTN agents, because nothing runs on the callee's phone:
- Kokoro ONNX;
- Kyutai Pocket TTS (2025-12-29);
- Neuphonic NeuTTS (2025-09 to 2026-07);
- VibeVoice-ASR-BitNet (2026-07-24).

The only on-device piece VP needs is a browser VAD, for the web widget.

---

## 5. Measurements (by this lane)

**M1. CPU ASR mini-benchmark on open models.** `asr_bench/`, run 2026-10-17.
- **Data:** FLEURS hi_in test (CC-BY-4.0), n=20 utterances sampled with seed 20261017, one per
  sentence ID.
- **Conditions:**
  - wb: 16 kHz original;
  - nb: phone-channel proxy (300-3,400 Hz band-pass, 8 kHz μ-law, resampled to 16 kHz);
  - non-speech probe, n=30 clips of 4 s: silence, white noise, brown noise, mains hum, ringback-like
    tone, reversed-speech babble.
- **Models:** openai/whisper-large-v3-turbo and Qwen/Qwen3-ASR-0.6B-hf. Language forced to Hindi;
  fp32 on CPU. The CPU was shared with another lane's browser harness, so the real-time factors are
  indicative only.
- **Scoring:** text normalised keeping combining marks (harvest law 29); corpus-level WER and CER.

RESULTS_PLACEHOLDER

**M2. Price series.** 113 dated price rows: 49 from Common Crawl captures (115 captures fetched
across 31 URLs and 14 crawls), 40 from the Azure Retail Prices API meters, and the rest from other
lanes and the llm-prices git history. These were fitted per component with n = 2 to 12 change
points (table in section 3). Method: computed. Date: 2026-10-17.

---

## 6. Evidence

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| E1 | Azure S1 real-time STT list price is $1/audio hour, meter effective since 2018-11-01, unchanged in page captures 2024-02 and 2025-09 | prices.azure.com retail API; CC captures of azure.microsoft.com speech pricing | 2026-10-17 (read) | read-primary | high |
| E2 | Voice Live speech-input meters: Std $0.015/1K tokens (2025-10-01), BYO $0.0125/1K (2025-11-01); about 10 audio tokens/s, so $0.009 and $0.0075 per minute | Azure Retail API; Voice Live doc token table | 2026-10-17 | read-primary + computed | high |
| E3 | Azure Neural TTS $15/1M chars (meter 2024-02-01); Neural HD $30 (page 2025-09-10) then $22 (meter 2026-03-01) | Azure Retail API; CC capture | 2026-10-17 | read-primary | high |
| E4 | Realtime audio prices (Azure, global): $100/$200 (2024-10), $40/$80 (2024-12-17), $32/$64 (2025-08-28 GA), unchanged for 1.5, 2 and 2.1 (to 2026-07); mini $10/$20 since 2024-12; GPT-Live-1 $3/hour (2026-09) | Azure Retail API; OpenAI pricing CC captures 2024-12-05 and 2025-03-17 | 2026-10-17 | read-primary | high |
| E5 | Frontier LLM tier per token: GPT-4 $30/$60 (2023-03), 4o $5/$15 (2024-05), 4.1 $2/$8 (2025-04), GPT-5 $1.25/$10 (2025-08), 5.4 $2.50/$15 (2026-03), 5.6 Terra $2/$12 after a 2026-07-30 cut, GPT-6 Sol $2/$10 (2026-09) | CC captures of openai.com/pricing; Azure Retail API; github.com/simonw/llm-prices git log | 2026-10-17 | read-primary | high |
| E6 | Managed Azure quality-bar cascade AI cost: $0.579/min (2023-04) → $0.056 (2024-10-17) → $0.033 (2026-10-17) at a fixed workload (1.7x in 24 months) | fit.py on prices.csv; workload from lane l2 | 2026-10-17 | computed | medium-high (workload assumptions) |
| E7 | End-2027 forecast for stack A: P50 INR 1.89 (P10 1.41, P90 2.84) by cut-process; P50 2.43 (1.61-3.33) by regime mixture; P(<INR 1.0) about 0.01 | fit-results.json | 2026-10-17 | computed (Monte Carlo) | medium |
| E8 | Price cuts 2024-01 to 2026-10: LLM 1.97 per component-year (median -49%); speech 0.36 (median -27%); realtime 0.36 (median -33%) | fit-results.json `cut_process` | 2026-10-17 | computed | medium (small n) |
| E9 | ElevenLabs Flash about $50-60 per 1M chars and Cartesia about $37 per 1M chars were flat across 2024-09/12 to 2026-06; Deepgram's new models cost more (Nova-3 $0.0077 vs Nova-2 $0.0059 per minute; Aura-2 $30 vs Aura $15 per 1M) | CC captures of elevenlabs.io, cartesia.ai, deepgram.com pricing | 2023-04 to 2026-06 | read-primary (archived) | high |
| E10 | Microsoft announced the retirement of standalone ACS on 2026-09-23, effective 2028-09-30. Onboarding limits start 2026-10-23 (no PSTN numbers without an existing resource). Direct Routing, PSTN, SMS, Email and WhatsApp are retired; Call Automation and Audio Streaming become Teams-only | learn.microsoft.com/azure/communication-services/acs-retirement-and-breaking-changes-guide; audio-streaming-concept page banner | read 2026-10-17 | read-primary | high |
| E11 | Voice Live API 2026-07-15 is GA and includes Live-Reference AEC (stereo mic plus playback reference). Azure Realtime S2S GA on 2026-07-25 with 34 voices incl. Aarti, Diya, Meera | learn.microsoft.com speech releasenotes; voice-live-how-to | 2026-07-25 | read-primary | high |
| E12 | Azure shipped a multilingual Indic STT model (13 Indic locales; code-mixing; ~10% TERR gain) in Fast Transcription and Voice Live in 2026-10, and MAI-Transcribe-2 (60 languages, keyword biasing) in 2026-09 | Speech release notes | 2026-10 | read-primary (vendor claim on accuracy) | high (exists) / low (accuracy) |
| E13 | Open full-duplex models are English-only on their cards: PersonaPlex 7B (2025-12-31), NemotronLabs VoiceChat 11B (2026-08-03, ~450 ms, tool calling), Moshi | HF API and model cards | 2026-10-17 | read-primary | high |
| E14 | PhoneLLM Alpha 1 (2026-08-24) claims GPT-5.6 Terra parity at -94% cost. Its self-host figure of $0.00025/min is an arithmetic slip: $0.2232 / 88 = $0.0025/min. English-only | huggingface.co/pipecat-ai/phonellm-alpha-1 | 2026-08-24 | read-primary + computed | medium (vendor claim) |
| E15 | Nemotron 3.5 ASR streaming 0.6B (2026-05-15): FLEURS-hi WER 7.41% (320 ms chunk, language ID), 9.88% auto-detect | HF model card | 2026-05-15 | vendor-claim | medium |
| E16 | Smart Turn v3 lists Hindi, Marathi and Bengali among 23 languages; LiveKit's multilingual detector claims Hindi TPR 99.4% and TNR 96.3%; Taxila measured Smart Turn v3.2 at 34/72 on child Hinglish | GitHub README (raw); HF card; harvest tx-voice §7 | 2025-09 to 2026-10 | vendor-claim + measured (owner) | medium |
| E17 | Indian CPaaS carriage: Plivo INR 0.40/min (2024-02 to 2025-03 captures), INR 0.74 (2026-03 capture) vs INR 0.38 live; Tata INR 0.22 at full fair-use; A2P termination charge up to INR 0.05/min from 2026-11-17 | CC captures of plivo.com; lane l2; lane l1 S03 | 2024-02 to 2026-10 | read-primary | high (contradiction noted) |
| E18 | US platform fees are flat: Vapi $0.05 (2024-06 to 2026-10), Retell about $0.07; Indian list prices fell 2-3x (Ringg $0.20 → INR 6; Bolna $0.10 → $0.06) | lane l4a pricing-history.json | 2024-06 to 2026-10 | read-primary (other lane) | high |
| E19 | Self-hosted stack on Azure GPUs computes to about $0.0051/min (INR 0.49) at 50% utilisation, using vendor throughput claims; not at the quality bar | fit.py `selfhost`; lane l2 gpu-throughput.csv | 2026-10-17 | computed from vendor claims | low |
| E20 | Framework activity: Pipecat 8,103 commits/12 months (v1.0 2026-04-14); LiveKit Agents 1,893 (1.0 2025-04); Bolna 1,047; Vocode none since 2024-11-15 | git clone (blobless) of each repository | 2026-10-17 | read-primary | high |

---

## 7. Gaps in the market (technology side)

1. **No gateable Indic speech-to-speech.**
   - No Azure or open model offers Hindi or Hinglish full-duplex conversation together with a text
     channel that can be checked before audio is played.
   - Whoever ships "S2S latency with a pre-audio gate" for Indic owns the realism frontier.
   - Today the cascade is the only compliant design.
2. **No public end-of-turn or short-answer benchmark for adult Hinglish phone speech.**
   - Vendors publish Hindi end-of-turn numbers on their own sets.
   - Nobody publishes recall on "haan / ok / hmm / theek hai" at 8 kHz, which is the commonest
     sales answer. The harvest saw 5 of 14 dropped by Voice Live.
   - A small, honest benchmark of this kind is both a product asset and a sales asset.
3. **No Hindi-capable open voice-agent LLM.**
   - PhoneLLM shows that a fine-tuned 30B-A3B model can match a frontier tier on phone tasks at a
     fraction of the cost, but it is English-only.
   - LLM is the largest managed AI cost line, and the only one still being cut often.
4. **No Azure-native Indian PSTN path.**
   - ACS never sold Indian numbers and is now retiring.
   - Packaging "Indian telco or CPaaS SIP ↔ a self-hosted bridge on Azure ↔ Voice Live" is
     undifferentiated plumbing, but every Azure-only Indian builder now needs it.
5. **Dialect voices.** Azure has no TTS locale for Bhojpuri, Maithili or other Hindi-belt dialects
   (lane l5). Open data exists (Vaani, 490 h of Bhojpuri); open models do not.
6. **Cost-base arbitrage.**
   - US platform list prices are flat at $0.05-0.08/min before models and telephony.
   - The AI cost of a managed Azure cascade is INR 1.4-3.1/min today.
   - Indian incumbents already price at INR 3-6/min all-in.
   - So margin is thin for anyone not self-hosting. This matches lane l2.

---

## 8. What would kill this lane's conclusions

- **The managed stack drops further than forecast.** A ≥50% cut to the Azure flagship LLM tier or
  the realtime audio price before 2027-06, or Azure STT/TTS list cuts that put stack A below INR 1.4
  by end-2027, falsify F1/F5. In that case the "cost is no longer the moat" argument weakens.
- **Azure ships a gateable realtime mode.** A text-first or pre-audio moderation hook in Voice Live
  or azure-realtime, with Hindi words per turn ≤25 on a sales battery, would move realtime from hold
  to trial.
- **Our own benchmark fails the new Azure Indic models.** If the 2026-10 Indic model or
  MAI-Transcribe-2 fabricates text on the non-speech probe, or misses more than 10% of short answers
  at 8 kHz, then "adopt Voice Live as the ear" needs a second ear before CRM writes.
- **The PSTN bridge adds too much latency.** If an Indian CPaaS WebSocket or SIP leg into Azure adds
  more than 300 ms over the browser path, the latency target fails for telephony.
- **An open Hindi voice-agent LLM ties GPT-6 Sol on our battery.** Then F3 is wrong in a good way:
  the managed-cost floor stops mattering, and self-hosting becomes the default at volume.

---

## 9. Owner actions (exact steps)

1. **By 2026-10-22: decide on an ACS placeholder.**
   - The question is whether to create one Azure Communication Services resource in the VP
     subscription. The resource is free; nothing is billed until it is used.
   - It would keep ACS Email and other retiring ACS services onboardable during the transition, to
     2028-09-30.
   - Recommendation: **do not build VP's PSTN on ACS**.
   - Also tell the build team that ACS Email, the harvest's planned outbox, retires on 2028-09-30.
   - This lane did not create anything (the lane is read-only).
2. **Accept gated dataset and model terms** on a Hugging Face account. Only the owner can sign up.
   - Datasets: ai4bharat/IndicVoices, ai4bharat/Lahaja, ai4bharat/Svarah.
   - Model: ai4bharat/indic-conformer-600m-multilingual.
   - Then share a read token through the secrets mechanism, not in chat. That lets IndicConformer
     join the benchmark on Indic conversational data, not only on FLEURS read speech.
3. **Approve about INR 500 of Azure spend** in vp-research-rg for an Indic STT bake-off on 8 kHz
   audio. Candidates:
   - the 2026-10 multilingual Indic model, via Fast Transcription and Voice Live;
   - MAI-Transcribe-2;
   - gpt-live-transcribe.

   Test sets:
   - the non-speech probe from `asr_bench/` (n=30);
   - a short-answer set of ≥100 clips ("haan", "ok", "hmm", "theek hai", "nahi", Indian numbers);
   - 200 IndicVoices or Kathbath clips.

   Gate: 0 fabrications, and short-answer recall ≥95%.
4. **Open one Indian CPaaS test account** (Plivo, Exotel or Tata Smartflo). This needs Indian entity
   KYC and phone OTP. Then:
   - Run one consented test call, owner to owner, through a self-hosted LiveKit or Pipecat SIP
     bridge on Azure into the D5 cascade.
   - Record p50/p95 first-sound latency, echo false barge-in and barge-in success.
5. **Ask the Microsoft account team three questions:**
   - the meter and price for MAI-Voice-2.1-Flash hi-IN voices;
   - whether the stereo Live-Reference AEC channel is billed as audio input (harvest flags up to
     $0.54/hour);
   - Personal Voice / Custom Neural Voice Limited Access, if cloning is in scope.
6. **Re-run `python3 fit.py`** after appending new dated rows to `prices.csv` each quarter. Score
   F1-F5 on 2027-12-31.
7. **Raise the search budget** if a deeper sweep is wanted. VAP turn-taking papers, the Deepgram Flux
   language list, and the ElevenLabs and Cartesia 2023 price points were not reachable without web
   search.

---

## 10. Open questions

- What does Voice Live actually bill per telephony minute? The stereo reference may count as audio
  input, and a non-responding session's billing is unverified (harvest risk 3).
- Does the October 2026 Azure Indic model close the empty-transcript gap on short answers that the
  harvest measured (5 of 14)?
- How much does an 8 kHz PSTN channel cost in accuracy compared with 16 kHz browser audio, per
  model? Section 5 shows the open-model delta on read speech only.
- Will OpenAI or Azure keep pricing new flagship tiers at or above the old tier (GPT-5.4, Neural HD,
  Nova-3 and Aura-2 all rose)? If so, the quality bar will keep the managed floor flat however fast
  small models fall.
- Which Indian CPaaS offers bidirectional WebSocket media at 16 kHz rather than 8 kHz, and at what
  per-minute rate? This sets both the ASR quality and the telephony line.
