<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l8-azure-bench: our own Azure benchmarks for VP (H9, H2, H6 inputs)

Date: 2026-10-17. Author: research lane l8 (subagent). Everything in the Measurements section was measured by us today on
Azure resources inside `vp-research-rg`, unless a row says otherwise. Vendor statements are labelled as such.

## 1. Answer to the hypothesis

The lane had to answer one question for H9, H2 and H6: what can an Azure-only stack actually do today for an Indian
voice agent, measured by us on Indian speech, in latency, accuracy and rupees per minute?

1. **Accuracy is good enough to build on, and the best recogniser is batch-only.** MAI-Transcribe-2, called through
   Azure fast transcription, gave the lowest error on every set:
   - Kathbath read speech in Hindi, Bengali, Marathi, Tamil and Telugu: pooled WER 15.1% at telephone band (n=300).
     The real-time Azure Speech recogniser scored 18.1% on the same clips.
   - Hindi alone: 8.2% vs 11.0%.
   - Indian-accented English (NPTEL): 13.1% vs 18.1%.
   - Hinglish code-switching (MUCS 2021), on a script-neutral consonant-skeleton CER: 28.2% vs 30.4%.

   Going from wideband to the G.711 phone channel cost at most about 2 WER points for any Azure engine.
   gpt-4o-transcribe was the worst engine we tested. It reached 30% pooled WER and invented text on 29 of 49
   non-speech clips: "Futebol.", "PINECONE", Sinhala text on digital silence. This confirms harvest law 27.
2. **A cascade cannot reach a human-like turn gap today.** Measured from our container and corrected for network
   round trip, the server-side blocks are:

   | block | measured |
   |---|---|
   | end-of-speech to final transcript (real-time STT) | 0.44 s with 300 ms segmentation; 0.83 s at default |
   | LLM time to first token, ~1.6k-token prompt | 1.05 s to 1.9 s for the fast models |
   | TTS first audio | 0.1 to 0.23 s for neural voices; 0.42 s for DragonHD; 0.58 to 1.08 s for MAI-Voice |

   - **Voice Live with gpt-4.1-mini (n=32 turns):** first audio came 2.3 to 2.6 s after the caller stopped speaking,
     server-side.
   - **The `azure-realtime` speech-to-speech model:** 1.4 s, but it answered a Hinglish caller in English on 6 of 16
     turns.
   - **An India-hosted cascade:** we estimate 2.3 to 3.2 s at p50 (section 4.6). Without tricks such as continuers,
     speculation or prefetch, that is not human-like.
3. **AI-only cost is ₹1.8 to ₹2.5 per connected minute at list price, and speech recognition is about 80% of it.**
   Real-time recognition streamed for the whole call costs ₹1.47 a minute at $1/hour. The other parts are small:
   - **LLM:** ₹0.02 to ₹0.07 a minute for gpt-6-luna, gpt-5.4-nano, DeepSeek-V4-Flash or gpt-4.1-mini with prompt
     caching. gpt-6-sol costs ₹0.43 a minute.
   - **Neural TTS:** about ₹0.31 a minute. DragonHD: about ₹0.64 a minute.

   So ₹2 all-in, including telephony, is out of reach at list price with full-call streaming recognition. It becomes
   plausible only by:
   - cutting the recognition bill, through VAD-gated streaming or a commitment tier (both derived, not measured); or
   - self-hosting recognition, which is the l2-economics lane's lever.
4. **Several "obviously fine" Azure defaults turned out to be measurable defects for this product:**
   - **Default content filter.** It holds back the whole short reply. An async filter policy with the same thresholds
     cut time to first token by 188 to 304 ms, paired n=32, with the 95% CI excluding 0 for 5 of 6 models.
   - **Continuous language ID.** Across six Indian locales it labelled Hindi as Marathi on 46 of 60 Hindi clips, which
     pushed Hindi WER to 41%.
   - **Auto-language LLM transcribers.** They wrote "haan" and "hmm" in Korean, Japanese or Urdu script. Pinning the
     locale fixed it: MAI-Transcribe-2 with the locale set got 32 of 32 short answers right.
   - **Generative voices misread prices.** The preview generative voice `hi-IN-Diya:DragonLatestNeural` misread
     "₹1,299" in 10 of 13 renders. The probe in section 4.4b quantifies this across voices.
5. **H6 inputs are ready but not rated.**
   - **Stimuli.** 102 blind-coded stimuli cover three regions, the regional register vs neutral, 6 turns, and 2 to 3
     voices per region. Each is an mp3 in wideband and phone band, 101 of 102 are 8 to 15 s long, and every one is
     round-trip transcribed.
   - **Voices.** Azure can render Bhojpuri-, Marathi- and Tamil-mixed scripts intelligibly, by machine round trip.
     Whether listeners find them acceptable is untested; the panel decides.
   - **Data blocked by gating.** We could not get dialect-labelled ASR data. Lahaja, Svarah, IndicVoices and Vaani are
     gated on Hugging Face, so per-dialect WER is an owner action.

## 2. Prediction check vs predictions.md

| H | prediction (prior) | what this lane found | verdict for this lane's input |
|---|---|---|---|
| H2 | Fully managed Azure cascade cannot reach < ₹2 all-in at the quality bar today; self-hosted can reach ₹1.2–2.0 (0.60) | Managed AI-only is ₹1.80–2.54/min at list price (computed from measured tokens, characters and published meters). Speech recognition is ₹1.47 of that. Adding telephony (~₹0.4–0.5/min per l2) gives ₹2.2–3.0. At list price and full-call recognition the prediction holds. VAD-gating or a commitment tier on recognition would take managed AI-only under ₹1 (derived), so "cannot" is not robust. | **mixed** |
| H9 | Full-duplex S2S is not production-grade for Indic at our quality bar; AI cost reaches ~₹0.5/min by end 2027 (0.50) | The one S2S option deployable on our account (`azure-realtime`, native voice diya) was fastest at 1.44 s server-side. It replied in English to a Hinglish caller on 6/16 turns and opened 3 replies with English filler ("Okay, let me line that up…"). The cost-curve part is l7's; today's floor is set by recognition pricing, not LLM pricing. | **supported** for S2S (n=16, small); cost forecast untestable here |
| H6 | Dialect matching weak or mixed; Azure cannot produce acceptable Bhojpuri-mix speech (0.55) | Not rated, by design. Round trip: Bhojpuri-mix clips were recognised as Hindi with Bhojpuri forms (बानी, बा, रउआ) mostly intact. The generative Hindi voice had a price-reading defect (10/13 renders wrong on ₹1,299). | **untestable-yet** (needs the listener panel) |
| H4 (context) | Incumbents p50 ≥ 1.0 s | Our own Azure baseline is itself ≥ 2.3 s to first audio in a cascade (Voice Live measured). Incumbents beating 1 s would be a real gap for us to close, not just a claim to check. | context only |

## 3. Evidence (claim | source | date | method | confidence)

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| E1 | MAI-Transcribe-2 (fast transcription, auto-LID) pooled Kathbath WER 15.1% (nb) / 15.1% (wb); Azure real-time 18.1/16.3; fast transcription 18.0/16.9; gpt-4o-transcribe 30.2/27.9; gpt-4o-mini-transcribe 30.2/27.8 (n=300 utterances, 5 languages) | `results/asr_summary.csv`, `results/asr_per_utt.csv`, harness `asr_bench.py`, `score_asr.py` | 2026-10-17 | measured | high (CIs in file; single read-speech domain) |
| E2 | Per-language nb WER, MAI-2 vs real-time: hi 8.2 vs 11.0; bn 13.5 vs 17.6; mr 17.9 vs 18.2; ta 17.6 vs 21.8; te 18.7 vs 22.1; Indian English (NPTEL) 13.1 vs 18.1 | same | 2026-10-17 | measured | high |
| E3 | Hinglish code-switched (MUCS 2021, n=80) skeleton CER: MAI-2 28.2, fast 28.6, real-time 30.4, gpt-4o-mini 31.2, LLM-speech 31.4, real-time+LID 35.2, gpt-4o 38.8. Raw WER is 54–77% for all engines because the references mix scripts and segment boundaries are loose. | same | 2026-10-17 | measured | medium (references are noisy) |
| E4 | Non-speech fabrication (n=49 clips per band: silence, room tone, noise, hum, ring/busy/DTMF tones, synthetic music, 16 ESC-50 sounds): gpt-4o-transcribe 29/49 nb and 24/49 wb; MAI-2 1/49 (sneeze → "Right."); LLM-speech 1/49 (Portuguese news text on room tone, wb); real-time, fast, gpt-4o-mini 0/49 | `results/asr_summary.csv` | 2026-10-17 | measured | high |
| E5 | Continuous LID over hi/en/ta/bn/mr/te mislabelled Kathbath Hindi as mr-IN on 45 segments, with only 14/60 utterances fully hi-IN; Hindi WER 41%. MAI-2 auto-LID chose the right language 60/60 for each of 5 languages. | `results/asr_summary.csv` (lid_correct), `asr_per_utt.csv` | 2026-10-17 | measured | high |
| E6 | Short answers (n=32 synthetic clips of 16 words such as हाँ / जी / ओके / हम्म / नहीं, 4 voices, phone band): real-time hi-IN 30/32, fast hi-IN 30/32, MAI-2 auto 28/32, MAI-2 locale-pinned 32/32, LLM-speech 20/32, gpt-4o 16/32, gpt-4o-mini 14/32 (wrong scripts such as 하?, ہاں جی, ハンマ) | `results/short_answer_summary.csv`, `short_answer_per_clip.csv` | 2026-10-17 | measured (synthetic speech, so an upper bound) | medium-high |
| E7 | LLM speech (fast transcription enhanced mode) does not handle Bengali, Marathi, Tamil or Telugu: WER 91–132%, often a translation or empty | `results/asr_summary.csv`; MS Learn LLM-speech page lists Hindi and English only among Indian languages | 2026-10-17 | measured + read-primary | high |
| E8 | Real-time STT turn latency (S1, phone band, pushed at 1x pace, n=20 Kathbath hi/ta): final result after speech end p50 1077 ms (default segmentation) and 694 ms (300 ms) from Ohio. Minus 252 ms RTT this is 825 and 442 ms. | `results/rt_latency.csv`, `rt_latency_summary.csv` | 2026-10-17 | measured | medium (n=20/arm; small Indic-specific sample) |
| E9 | LLM server-side TTFT estimates (warm prompt cache, default filter, n=33 each, ~1.62–1.69k-token prompt, ~40-token reply): DeepSeek-V4-Flash DZ 1.11 s; gpt-6-luna DZ 1.36; gpt-6-sol DZ 1.49; gpt-5.4-nano 1.64; gpt-5.4-mini 1.72; gpt-4.1-mini 1.81; gpt-4.1-nano 1.91; gpt-oss-120b 2.33; Llama-3.3-70B 2.54; DeepSeek-V4.1-Flash (preview) 2.58; Phi-4 3.11 | `results/llm_bench.csv`, `llm_summary.csv` | 2026-10-17 | measured, RTT-subtracted | medium-high (RTT subtraction ±10 ms; one prompt shape) |
| E10 | Async content-filter policy (same thresholds as DefaultV2) cuts TTFT by a median 188–304 ms vs the default filter, paired over 32 identical turns. The 95% CI excludes 0 for gpt-4.1-mini, gpt-5.4-mini, gpt-5.4-nano, gpt-6-luna and DeepSeek-V4-Flash, but not for Llama-3.3-70B. The default filter delivers short replies in one burst (first-to-last token 0–18 ms vs 194–419 ms async). | `results/llm_bench_async.csv`, `llm_filter_ab.csv` | 2026-10-17 | measured | high |
| E11 | Prompt caching on Azure: cached share 0.84–0.94 for OpenAI models and DeepSeek-V4-Flash on a ~1.6k prefix; 0 reported for Llama-3.3-70B, Phi-4 and gpt-oss-120b. A warm cached turn costs ₹0.005 (gpt-6-luna) to ₹0.087 (gpt-6-sol); uncached ₹0.018–₹0.354. | `results/llm_summary.csv` | 2026-10-17 | measured tokens × Retail API prices | high |
| E12 | TTS service-side first-byte latency (SDK-reported, websocket, warm, n=30 per voice): mr-IN Aarohi 98 ms; ta-IN Pallavi 110; hi-IN Kavya 189; Swara 229; Madhur 229; en-IN AartiIndic 482; Meera DragonHD 420; Aarti DragonHD 421; Kavya MAI-Voice-2.1-Flash 579; hi-IN Diya DragonLatest 806; Kavya MAI-Voice-2.1 1080. All voices synthesise faster than real time (client RTF 0.11–0.48). | `results/tts_bench.csv`, `tts_summary.csv` | 2026-10-17 | measured | high |
| E13 | Voice Live (southeastasia, n=16 turns per arm): first audio after caller speech end p50 2520 ms (gpt-4.1-mini + azure-speech + Swara), 2886 ms (gpt-4.1-mini + mai-transcribe-2 + Meera DragonHD), 1688 ms (azure-realtime + native diya), all from Ohio with RTT 252 ms. The "हाँ" turn got no transcript and no response in 2/2 sessions with azure-speech. | `results/voicelive.csv`, `voicelive_summary.csv` | 2026-10-17 | measured | medium (small n) |
| E14 | Generative voice `hi-IN-Diya:DragonLatestNeural` (preview) misread "₹1,299" in 10 of 13 renders (heard as 199, 299, 699, 799, 899, 1899, 1999 by MAI-2 and by fast transcription). DragonHD en-IN Meera/Arjun read it correctly in all stimulus renders. | `stimuli/manifest.csv` (number_check, panel_note), harness `fix_numbers.py` | 2026-10-17 | measured (two ASR engines agree) | medium-high |
| E15 | Azure retail prices (USD): real-time STT $1.00/h; fast transcription $0.36/h (a $0.10/h promo meter effective 2026-09-01); batch $0.18/h; neural TTS $15/1M chars; Neural HD $22/1M; gpt-6-luna $0.10/$0.01/$0.50 per 1M (in/cached/out; DZ ×1.1); gpt-5.4-nano $0.20/$0.02/$1.25; gpt-4.1-mini $0.40/$0.10/$1.60; gpt-6-sol $2/$0.20/$10; DeepSeek-V4-Flash $0.19/$0.028/$0.51. MAI-Transcribe-2 and MAI-Voice have no meter in the Retail API. | `results/azure-retail-prices-l8.csv` (prices.azure.com API) | fetched 2026-10-17 | read-primary | high |
| E16 | Azure inter-region P50 RTT: Central India↔Southeast Asia 53 ms; South India↔SEA 37 ms; Central India↔France Central 118 ms; Central India↔East US 201 ms | https://learn.microsoft.com/en-us/azure/networking/azure-network-latency (dataset to 2026-07-30) | page 2026-07-30, read 2026-10-17 | read-primary | high |
| E17 | Region availability: MAI-Transcribe and LLM speech are available in southeastasia and centralindia. HD and MAI voices are available in southeastasia. mai-transcribe-2-streaming through Voice Live is listed for southindia (Global scope) but not centralindia or southeastasia. Voice Live LLMs in southeastasia include gpt-4.1-mini, gpt-5.6-luna, gpt-realtime-2.1 and azure-realtime. | https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions | page 2026-10-08, read 2026-10-17 | read-primary | high |
| E18 | GlobalStandard quotas for gpt-6-luna, gpt-6-sol, grok-4-1-fast-non-reasoning, DeepSeek-V4-Flash, gpt-transcribe, gpt-live-transcribe, MAI-Transcribe-2-Streaming and gpt-realtime-2.1 are fully used subscription-wide (they show the same in every region), so we could not deploy them on GlobalStandard. The EU DataZone was free for gpt-6-luna, gpt-6-sol and DeepSeek-V4-Flash. | ARM `locations/*/usages`, deployment errors (`InsufficientQuota`) | 2026-10-17 | read-primary (our subscription) | high |
| E19 | Harvest cross-checks: Taxila measured gpt-6-sol first clause p50 1475 ms (n=30); we measured 1490 ms server-side. Taxila found gpt-transcribe fabricated on 7/12 non-speech clips; our gpt-4o-transcribe did on 29/49. Taxila saw Voice Live return empty transcripts on 5/14 short answers; our azure-speech arm missed "हाँ" 2/2. | `docs/harvest/tx-voice.md`, `docs/harvest/SYNTHESIS.md` laws 26–29 | 2026-10-15 harvest | read-secondary (our own earlier measurements) | high |

## 4. Measurements

### 4.0 Setup and network location (read this before any latency number)

**Where we measured from.**
- **Test client:** a container whose egress IP geolocates to Columbus, Ohio (GCP), with all HTTPS through a TLS
  re-terminating proxy.
- **RTT to the front doors:** we measured warm keep-alive RTT to the Azure front doors every ~5 minutes all session.
  The results are in `results/rtt.csv` (n ≈ 530 probes):

  | target | median RTT |
  |---|---|
  | southeastasia, OpenAI 401 path | 246 ms |
  | southeastasia, Speech host | 252 ms |
  | francecentral | 112–115 ms |

- **How latencies are reported:** as measured from Ohio, plus a "server-side estimate" with that median RTT
  subtracted. TTS service latency needs no subtraction, because the Speech SDK reports it.
- **India-hosted serving:** add the Azure backbone RTT, Central India↔SEA 53 ms (E16).

**Accounts and deployments.**
- **southeastasia, `vp-research-ai-sea` (existing):** GlobalStandard deployments of gpt-4.1-mini, gpt-4.1-nano,
  gpt-5.4-mini, gpt-5.4-nano, Llama-3.3-70B-Instruct v9, Phi-4 v7, gpt-oss-120b and DeepSeek-V4.1-Flash (preview).
- **francecentral, `vp-research-ai-frc` (created by this lane, inside vp-research-rg):** francecentral is not used by
  Taxila or Vyakti. It offers the gpt-4o(-mini)-transcribe models, and the EU DataZone had free quota for gpt-6-luna,
  gpt-6-sol and DeepSeek-V4-Flash.
- **Why not eastus or northcentralus:** neither offers any gpt-*-transcribe model.
- **Content-filter policy `l8-async-filter`:** created on both accounts, mode Asynchronous_filter with thresholds
  identical to Microsoft.DefaultV2. It is used by six `*-async` deployments.

**Blocked or substituted.**
- **Not deployable on GlobalStandard,** because the subscription's global quota is fully used (E18): grok-4-1-fast-non-reasoning,
  DeepSeek-V4-Flash, gpt-6-luna and gpt-6-sol. The last three were benchmarked through the EU DataZone instead.
- **gpt-transcribe, gpt-live-transcribe and MAI-Transcribe-2-Streaming:** blocked the same way and not tested. The
  harvest already measured them.

**Workload.**
- **Agent:** the l4b "Suraksha Health" renewal agent, extended with a CRM block, objection notes, compliance and a
  glossary to a ~1.5k-token system prompt (`harness/llm_prompt.py`).
- **Caller turns:** 36 Hinglish, Bhojpuri-Hindi, Tamil-English and English turns, including short answers.
- **Run order:** sequential (concurrency 1), models interleaved round-robin. Every 4th round was a "cold" arm with a
  cache-busting nonce.

**ASR data**, all non-gated:

| set | content | n | licence |
|---|---|---|---|
| Kathbath clean test-known | 60 utterances per language for hi, bn, mr, ta, te, spread across speakers | 300 | CC0 per IndicSUPERB README |
| MUCS 2021 Hindi-English code-switched test | segments 3–12 s | 80 | CC BY-SA 4.0 (OpenSLR 104) |
| NPTEL2020 pure set | Indian-accented English lecture chunks, 3–15 s | 80 | YouTube Creative Commons per its README |
| Non-speech probe | 30 synthetic clips (silence, pink/white/brown noise, 50 Hz hum, Indian ringback, busy, DTMF, 3 synthetic music clips) and 16 ESC-50 clips (cough, sneeze, laugh, breathing, keyboard, traffic and others) | 49 | ESC-50 is CC BY-NC 3.0 |

- **Bands:** every clip was run wideband (16 kHz) and as a telephone channel: 300–3,400 Hz band-pass, 8 kHz G.711
  μ-law round trip.
- **Totals:** 54.7 audio-minutes per band, about 13.6 engine-audio-hours in all.
- **Gated sets:** Lahaja (Hindi dialects), Svarah (accented English), IndicVoices and Vaani all returned HTTP 401
  without a Hugging Face login, so they were not used.

**Scoring** (`harness/score_asr.py`).
- **Normalisation:** NFC, lowercase, punctuation and symbols to space, format characters dropped. Combining marks
  (`\p{M}`) are kept, per harvest law 29.
- **WER and CER:** corpus-level, with 1,000-resample utterance-bootstrap 95% CIs. A "lenient" variant folds nukta and
  chandrabindu.
- **Hinglish:** a script-agnostic consonant-skeleton CER, so that "स्लाइड" and "slide" match.
- **Numbers:** digits-vs-words sensitivity (WER on utterances where no engine wrote digits) changed nothing material.
  For example, MAI-2 Hindi was 8.0 vs 8.2.

### 4.1 ASR accuracy (n per cell = 60 per Kathbath language, 80 MUCS, 80 NPTEL; WER %, telephone band)

| set | real-time (locale) | real-time + continuous LID | fast (locale) | LLM speech | MAI-Transcribe-2 auto | MAI-2 locale | gpt-4o-transcribe | gpt-4o-mini-transcribe |
|---|---|---|---|---|---|---|---|---|
| Kathbath hi | 11.0 | 41.2 | 10.0 | 10.7 | **8.2** | 8.5 | 20.3 | 12.9 |
| Kathbath bn | 17.6 | 18.4 | 16.6 | 113 | **13.5** | 13.1 | 24.2 | 29.0 |
| Kathbath mr | 18.2 | 19.1 | 18.8 | 96 | **17.9** | 17.9 | 38.2 | 31.7 |
| Kathbath ta | 21.8 | 21.8 | 23.0 | 125 | **17.6** | 18.0 | 36.9 | 42.3 |
| Kathbath te | 22.1 | 27.3 | 22.1 | 119 | **18.7** | 19.1 | 31.9 | 36.1 |
| Kathbath pooled (WER / CER) | 18.1 / 4.5 | 25.7 / 8.4 | 18.0 / 4.4 | 92 / 74 | **15.1 / 3.6** | 15.3 / 3.6 | 30.2 / 10.6 | 30.2 / 10.4 |
| NPTEL Indian English | 18.1 | 18.7 | 18.2 | 22.5 | **13.1** | 12.9 | 46.4 | 16.9 |
| MUCS Hinglish, skeleton CER | 30.4 | 35.2 | 28.6 | 31.4 | **28.2** | 28.3 | 38.8 | 31.2 |
| Wideband, Kathbath pooled WER | 16.3 | 23.6 | 16.9 | 93 | 15.1 | – | 27.9 | 27.8 |

- **Kathbath is read speech.** Expect higher WER on spontaneous phone speech. The dialect sets that would show this
  were blocked.
- **MUCS references.** They mix scripts inconsistently, and the official segment times include words from neighbouring
  segments, so read the skeleton CER comparatively only.
- **Telephone band** costs real-time recognition 1.8 points pooled, and MAI-2 nothing.

### 4.2 ASR robustness

| probe | real-time | fast | LLM speech | MAI-2 auto | MAI-2 locale | gpt-4o-tx | gpt-4o-mini-tx |
|---|---|---|---|---|---|---|---|
| Non-speech fabrication, nb (n=49) | 0 | 0 | 1 | 1 | 1 | **29** | 0 |
| Non-speech fabrication, wb (n=49) | 0 | 0 | 1 | 1 | – | **24** | 0 |
| Short answers correct (n=32, nb) | 30 | 30 | 20 | 28 | **32** | 16 | 14 |
| LID correct, Kathbath hi (n=60) | 14 (continuous LID) | n/a | 60 | 60 | n/a | – | – |

- **gpt-4o-transcribe fabrications** included "spring.", "Futebol.", "PINECONE", "Covid", "Wynagrodzenie." and a
  Sinhala word on digital silence; "I know.", "Hello" and "Logan" on room tone; and "[Dial tone]" on ringback.
- **Real-time and fast recognisers:** their only short-answer misses were formatting ("दो बजे" written as "2:00 बजे").
- **MAI-2 in auto mode** wrote "Huh?" for हाँ, Japanese katakana for हम्म, and "Hallo." for हैलो. Pinning the locale
  fixed all of them.

### 4.3 ASR processing time (batch engines, per request, from Ohio, new TLS connection per request)

| engine | fixed overhead | per audio-second | p50 for a 2–4 s clip |
|---|---|---|---|
| fast transcription | ≈ 1.98 s | + 0.07 s | 2.05 s |
| MAI-2 | ≈ 2.02 s | + 0.065 s | 2.18 s |
| gpt-4o(-mini)-transcribe | ≈ 1.5 s | – | 1.5 s |

About 0.75–1 s of the overhead is connection setup through the proxy. Even server-side, a per-turn batch call adds
more than 1 s, so batch MAI-2 is a "second ear" for short answers and post-call records, not the live turn recogniser.

### 4.4 TTS (southeastasia, Speech SDK websocket, warm connection, raw 16 kHz PCM, n=30 per voice, Hinglish text 18–30 words; Tamil and Marathi voices with native text)

| voice | type | service first byte p50 / p90 (ms) | client TTFB from Ohio p50 | client RTF | chars per audio-s | ₹ per agent-audio minute |
|---|---|---|---|---|---|---|
| mr-IN-AarohiNeural | neural | 98 / 229 | 396 | 0.12 | 10.2 | 0.81 |
| ta-IN-PallaviNeural | neural | 110 / 293 | 444 | 0.14 | 12.0 | 0.95 |
| hi-IN-KavyaNeural | neural | 189 / 322 | 462 | 0.14 | 11.1 | 0.88 |
| hi-IN-SwaraNeural | neural | 229 / 238 | 502 | 0.11 | 9.8 | 0.78 |
| hi-IN-MadhurNeural | neural | 229 / 239 | 497 | 0.11 | 10.0 | 0.79 |
| en-IN-AartiIndicNeural | neural (multilingual) | 482 / 624 | 755 | 0.14 | 11.2 | 0.89 |
| en-IN-Meera:DragonHDLatestNeural | HD | 420 / 468 | 690 | 0.48 | 13.7 | 1.59 |
| en-IN-Aarti:DragonHDLatestNeural | HD | 421 / 450 | 684 | 0.48 | 15.7 | 1.83 |
| hi-IN-Diya:DragonLatestNeural (preview) | generative | 806 / 1016 | 1070 | 0.22 | 13.1 | 1.52 (if billed as HD) |
| hi-IN-Kavya:MAI-Voice-2.1-Flash (preview) | MAI | 579 / 721 | 842 | 0.18 | 11.9 | no meter |
| hi-IN-Kavya:MAI-Voice-2.1 (preview) | MAI | 1080 / 1229 | 1362 | 0.24 | 11.2 | no meter |

- **REST vs websocket.** Plain REST with a streamed response gave the same first byte as a warm websocket (±50 ms) for
  neural voices.
- **Comparison with the harvest.** Taxila's earlier DragonHD first byte of 228/287 ms was measured from a closer
  region (eastus2). Our 420 ms is service-side in southeastasia.

### 4.4b TTS number reading (generative-voice defect)

The first finding came from the stimuli. Of 13 renders by hi-IN-Diya:DragonLatestNeural of a sentence containing
"₹1,299", 10 were heard as a different amount by MAI-2, and fast transcription agreed: 199, 299, 699, 799, 899, 1899,
1999. A follow-up probe (`harness/tts_numbers.py`, `results/tts_numbers.csv`) used 10 sentences × 9 voices × 2 renders
with Indian-format amounts, dates and times, each checked by a locale-pinned MAI-2 round trip. Results are in the
table below.

TTS_NUMBERS_TABLE

### 4.5 LLM (warm prompt cache, default content filter, n=33 per model; cold arm n=11 in `results/llm_summary.csv`)

| model (deployment) | served in | TTFT p50 from Ohio | server-side TTFT p50 / p90 | output tokens p50 | cached share | ₹ per turn (cached) | ₹ per turn (uncached) |
|---|---|---|---|---|---|---|---|
| DeepSeek-V4-Flash (EU DZ) | France Central | 1224 | **1106** / 1783 | 42 | 0.92 | 0.009 | 0.033 |
| gpt-6-luna (EU DZ) | France Central | 1475 | 1357 / 1619 | 44 | 0.94 | **0.005** | 0.018 |
| gpt-6-sol (EU DZ) | France Central | 1608 | 1490 / 1840 | 39 | 0.94 | 0.087 | 0.354 |
| gpt-5.4-nano | Southeast Asia | 1890 | 1638 / 1837 | 45 | 0.81 | 0.013 | 0.034 |
| gpt-5.4-mini | Southeast Asia | 1974 | 1722 / 1966 | 43 | 0.74 | 0.054 | 0.125 |
| gpt-4.1-mini | Southeast Asia | 2059 | 1807 / 2093 | 38 | 0.88 | 0.025 | 0.063 |
| gpt-4.1-nano | Southeast Asia | 2157 | 1905 / 2087 | 33 | 0.84 | 0.007 | 0.016 |
| gpt-oss-120b (reasoning low) | Southeast Asia | 2578 | 2326 / 2427 | 67 | 0 | 0.026 | 0.026 |
| Llama-3.3-70B | Southeast Asia | 2792 | 2539 / 2933 | 27 | 0 | 0.107 | 0.107 |
| DeepSeek-V4.1-Flash (preview) | Southeast Asia | 2833 | 2581 / 3464 | 40 | 0.92 | 0.009 | 0.048 |
| Phi-4 | Southeast Asia | 3359 | 3107 / 3590 | 44 | 0 | 0.020 | 0.020 |

- **Cold vs warm.** Cold (cache-busted) TTFT differed little from warm. The cache saves money (2.5–4×) more than
  latency.
- **Decode tokens/s cannot be measured under the default filter.** Whole replies arrive in one burst, with first-to-last
  token at 0–18 ms. This is why the async-filter result below matters.
- **Content-filter A/B (paired, n=32 identical turns per model).** Median async-minus-default TTFT, with 95% bootstrap
  CI:

  | model | async − default TTFT, median (95% CI) |
  |---|---|
  | gpt-6-luna | −304 ms (−377, −256) |
  | gpt-5.4-nano | −298 ms (−364, −214) |
  | DeepSeek-V4-Flash | −242 ms (−320, −183) |
  | gpt-4.1-mini | −208 ms (−274, −134) |
  | gpt-5.4-mini | −188 ms (−234, −146) |
  | Llama-3.3-70B | −318 ms (−468, +105), CI includes 0 |

  With the async filter, gpt-6-luna's server-side TTFT is about 0.93 s, and replies then stream over 0.2–0.4 s.
- **What the async filter costs.** Azure's documentation says a harmful completion can be partly streamed before it is
  flagged. That fits harvest laws 10 and 25: our own text gate must run before TTS anyway.

### 4.6 End-to-end latency: what we measured and what it implies

| path | measured (from Ohio) | server-side or India-hosted estimate |
|---|---|---|
| Voice Live, gpt-4.1-mini + azure-speech + Swara (n=16) | first audio p50 2520 ms after speech end (p90 2858) | 2268 ms server-side; ≈ 2.3 s India-hosted |
| Voice Live, gpt-4.1-mini + mai-transcribe-2 + Meera DragonHD (n=16) | 2886 ms (p90 3044) | 2634 ms; ≈ 2.7 s |
| Voice Live, azure-realtime (S2S, native "diya") (n=16) | 1688 ms (p90 1981) | 1436 ms; ≈ 1.5 s, with the language failures in E13 |
| Own cascade, estimate | – | VAD end 0.3–0.5 s + STT final 0.44–0.83 s + LLM 0.93–1.6 s + TTS first byte 0.1–0.42 s + 3 × 53 ms backbone + telephony ~0.1–0.2 s ≈ **2.1–3.6 s p50** |

Voice Live session setup took 1.4–2.2 s (p50) from the websocket open to `session.updated`. In a real call this has to
be prewarmed before the callee answers.

### 4.7 Cost per connected minute, AI only (`cost-inputs.json`)

**Assumptions** (ranges are in the JSON):
- 5 LLM turns per minute (range 3–8).
- 24 s of agent speech per minute (range 15–35).
- Recognition streamed for the whole call at $1/h.
- ₹88 per USD.

| stack | ASR | LLM | TTS | total ₹/min |
|---|---|---|---|---|
| real-time STT + gpt-6-luna + Swara (neural) | 1.47 | 0.02 | 0.31 | **1.80** |
| real-time STT + DeepSeek-V4-Flash + Swara | 1.47 | 0.04 | 0.31 | 1.82 |
| real-time STT + gpt-5.4-nano + Swara | 1.47 | 0.06 | 0.31 | 1.84 |
| real-time STT + gpt-4.1-mini + Swara | 1.47 | 0.12 | 0.31 | 1.90 |
| real-time STT + gpt-6-luna + Meera DragonHD | 1.47 | 0.02 | 0.64 | 2.13 |
| real-time STT + gpt-6-sol + Meera DragonHD | 1.47 | 0.43 | 0.64 | 2.54 |
| Voice Live (Std meters, from response usage), gpt-4.1-mini arms | – | – | – | 2.1–2.5 (estimate; check the invoice) |

These figures exclude telephony (₹0.4–0.5/min per l2), infrastructure and margin. Recognition is 58–82% of AI cost.

### 4.8 H6 listener-panel stimuli (`stimuli/`)

**Regions, conditions and voices.**

| region | conditions | voices |
|---|---|---|
| Bihar | neutral Hinglish vs Bhojpuri-dominant mix | hi-IN-Diya:DragonLatestNeural (F), hi-IN-MadhurNeural (M); both speak both conditions |
| Tamil Nadu | Tamil-English (loanwords in Tamil script, per l5's glued-Latin finding) vs neutral Hinglish vs Indian English | en-IN-Meera and en-IN-Arjun DragonHD (multilingual, all three conditions), plus ta-IN-PallaviNeural on the Tamil condition as a native-locale reference |
| Maharashtra | Marathi-Hindi mix vs neutral Hinglish | mr-IN-AarohiNeural (F), mr-IN-ManoharNeural (M), hi-IN-Diya (F); all speak both conditions |

**Content and files.**
- **Turns:** 6 per condition, all fictional brands. T1 opening with AI disclosure, T2 price/EMI, T3 objection, T4 COD
  confirmation, T5 failed delivery (NDR), T6 renewal.
- **Text:** written by gpt-6-sol with the same content in every register. T2 was regenerated once, shorter, after the
  first version ran 15.8–17.6 s; the old text is kept as `superseded` in `stimuli-text.json`.
- **Clips:** 102 in total, each as `wideband/<code>.mp3` (24 kHz, 96 kbps) and `phone/<code>.mp3` (G.711 channel).
  Silence is trimmed to ~150 ms and loudness normalised to −16 LUFS (l5 protocol §3.4).
- **File names:** blind (region letter plus a hash); the key is `manifest.csv`.

**Length control.**
- 12 clips first came out at 15.2–16.9 s. Each affected (region, turn, voice) group was re-rendered with a single SSML
  rate (+5% to +15%) applied to all of its conditions, so within-voice comparisons stay matched.
- Now 101 of 102 clips are 8–15 s; one is 7.99 s.

**QA columns in the manifest.**
- **Round-trip transcript:** each clip was transcribed by MAI-2 at phone band. It detected the intended language on
  102/102 clips: hi for Bhojpuri, mr, ta and en.
- **`number_check`:** 69 ok (3 only after re-render), 2 heard as words, 14 unchecked because the recogniser wrote
  words, and 17 with no numbers.
- **`panel_note`:** one clip to exclude (M_adcaf6: Diya misread ₹1,299 in 5/5 renders) and one to listen-check
  (T_0d794c: Pallavi, ₹2,200).
- **Not rated by us, by design.** Machine CER on these clips is confounded by script choice (Latin vs Devanagari
  loanwords) and must not be read as quality.

## 5. Gaps in the market found

1. **No Azure recogniser that is both best-accuracy and streaming in an India-near region.**
   - MAI-Transcribe-2 was the most accurate on every set, but here only as batch.
   - The streaming variant is listed only for southindia, and only through Voice Live (E17).
   - Its global quota on this subscription is held by Taxila.
   - Whoever gets streaming MAI-class accuracy with Indic locale pinning into a phone pipeline gets 3–4 WER points over
     the standard real-time recogniser.
2. **Price and number safety in TTS.**
   - Generative voices misread amounts without warning (E14, 4.4b). A seller quoting ₹199 for a ₹1,299 order is
     worse than a robotic voice.
   - A "number-safe speech" layer would close this gap: verbalise amounts per language in code, then verify with a
     round trip on new templates (harvest law 29).
   - We found no evidence that competitors do this. That is not verified; l4b's battery has number probes.
3. **Short-answer and language-ID robustness is a configuration problem, not a model problem.**
   - Locale-pinned recognisers get "haan/ok/hmm" right.
   - Auto-language LLM transcribers and continuous LID fail on Hindi, writing it in the wrong script or labelling it
     Marathi.
   - So region and language inference should come from CRM fields and a first-turn classifier, not from Azure LID
     (input to l5's region-inference work).
4. **Cost is set by recognition, not the LLM.**
   - At list prices, LLM spend is ₹0.02–0.12/min for good models, against ₹1.47 for streaming recognition.
   - Every per-minute competitor priced off LLM cost is mis-modelled. The lever is recognition: VAD gating,
     commitment tiers, self-hosting, or a cheaper streaming MAI meter.
5. **The default content filter removes ~0.2–0.3 s and makes streaming pointless for short replies.**
   - It is fixable in configuration.
   - It is a tangible latency edge over teams that deploy Azure with defaults.

## 6. What would kill this (kill criteria for the claims this lane supports)

- **"Cascade p50 ≈ 2.1–3.6 s India-hosted".** If an India-hosted probe (Central India client → SEA models, real G.711
  call leg) measures p50 to first audio above 3.5 s with the async filter and a continuer, real-time outbound
  conversation on Azure is not viable at the quality bar.
  - Then the wedge moves to tasks that tolerate latency (confirmations, reminders, short scripted flows) or to S2S
    with a text gate.
- **"MAI-Transcribe-2 is the best Azure ASR for Indian speech".** Overturned if WER on the gated dialect sets (Lahaja
  Bhojpuri/Maithili districts, IndicVoices spontaneous phone speech) goes above about 25% for MAI-2. The same applies if
  its published price lands above about $1/h with no streaming meter in India.
- **"AI-only ₹1.8/min managed today".** The basis is wrong if the invoice for today's runs disagrees with our
  usage-times-meter estimate by more than 25%. Check Cost Management on 2026-10-18 or 19.
- **"Dialect stimuli are producible on Azure".** Disproved if the panel rates the Bhojpuri- or Marathi-mix clips
  significantly lower than neutral Hinglish on naturalness, or flags them as patronising, with the voice held constant.
- **"Async filter is a free 0.2–0.3 s".** Reversed if a compliance review rules out partial streaming of unfiltered
  text to TTS, even with our own pre-TTS text gate.

## 7. Owner actions

1. **Gated speech data (10 minutes).**
   - Create or log into a Hugging Face account and accept the terms on: `ai4bharat/Lahaja`, `ai4bharat/Svarah`,
     `ai4bharat/IndicVoices`, `ARTPARK-IISc/Vaani` (and `Vaani-transcription-part`).
   - Create a read token and put it in the scratchpad as `HF_TOKEN`, never in the repo.
   - Then rerun:
     1. `harness/prep_asr_data.py` (add a loader for the parquet sets).
     2. `harness/asr_bench.py` for `rt`, `mai2_loc` and `fast`.
     3. `harness/score_asr.py`, for per-district or per-accent WER.
2. **Quota.**
   - Request GlobalStandard quota for VP for MAI-Transcribe-2-Streaming, gpt-6-luna, grok-4-1-fast-non-reasoning and
     DeepSeek-V4-Flash. Ideally use a separate VP subscription, so research and production never share quota (harvest
     law 24).
   - With it, benchmark streaming MAI-2 through Voice Live in southindia.
3. **Invoice check (2026-10-18 or later).**
   - Open Cost Management → Cost analysis, filtered on resource group `vp-research-rg`, grouped by meter.
   - Compare with our estimate of ~₹1,070 (~$12.2). Log the MAI-Transcribe-2 and MAI-Voice meters, which have no
     public price.
4. **India-hosted latency probe.**
   - Approve registering `Microsoft.ContainerInstance` on the subscription (a subscription-level change we did not
     make), or approve a small B-series VM in Central India inside vp-research-rg.
   - Then rerun `llm_bench.py`, `tts_bench.py`, `rt_latency.py` and `voicelive_bench.py` from there.
5. **Listener panel.** Run the l5 panel protocol on `stimuli/`. Before playing, exclude M_adcaf6 and listen-check
   T_0d794c (see `panel_note`).
6. **Decide on prompt caching and the filter.** Approve, in principle, the `Asynchronous_filter` content-filter mode
   for the speaking model, paired with our own pre-TTS gate.
7. **Clean-up decision.** The two accounts, the async filter policy and the deployments cost nothing while idle. This
   lane deleted its model deployments at the end (section 9); the accounts and policy remain for reruns.

## 8. Open questions

- What does a real G.711/AMR phone leg add (jitter buffer, carrier transcoding), and how do recognition WER and
  short-answer detection degrade on real PSTN audio rather than our simulation?
- Is VAD-gated streaming billing on Azure Speech per second of audio sent? If so, a local VAD that sends only caller
  speech halves the dominant cost. This needs one controlled run plus an invoice line.
- Does `mai-transcribe-2-streaming` keep MAI-2's accuracy and locale behaviour at streaming latency? Taxila saw
  68 ms finals in southindia.
- MAI-Voice-2.1 has the richest emotional styles but 1.1 s first byte. Is MAI-Voice-2.1-Flash (0.58 s) good enough by
  ear for the relational register? Panel question.
- How does TTFT grow with a 6–10-turn history (2.5–4k tokens) and with tool calls? Our prompt was 1.6k tokens.

## 9. Files

- **`harness/`** — all code.
  - Setup: `deploy.sh`, `rtt_probe.py`, `azure_prices.py`.
  - LLM: `llm_prompt.py`, `llm_bench.py`.
  - ASR: `prep_asr_data.py`, `asr_bench.py`, `score_asr.py`, `rt_latency.py`.
  - TTS: `tts_texts.py`, `tts_bench.py`, `tts_numbers.py`, `make_probe_audio.py`.
  - Voice Live: `voicelive_bench.py`.
  - Stimuli: `stimuli_text.py`, `render_stimuli.py`, `rerender_long.py`, `fix_numbers.py`.
  - Summaries: `analyze.py`.
- **`results/`** — raw CSVs and summaries.
  - Raw: `llm_bench.csv`, `llm_bench_async.csv`, `tts_bench.csv`, `tts_numbers.csv`, `rt_latency.csv`,
    `voicelive.csv`, `rtt.csv`, `asr_per_utt.csv`.
  - Summaries: `asr_summary.csv`, `llm_summary.csv`, `llm_filter_ab.csv`, `tts_summary.csv`,
    `short_answer_summary.csv`, `rt_latency_summary.csv`, `voicelive_summary.csv`.
  - Prices: `azure-retail-prices-l8.csv`.
- **`cost-inputs.json`** — measured inputs and example stacks for l2-economics.
- **`stimuli/`** — `manifest.csv`, `stimuli-text.json`, `wideband/*.mp3` and `phone/*.mp3` (102 + 102).
- **Raw audio and downloads** (not in the repo) are under
  `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l8-azure-bench/`.

### Spend

- Estimates were logged before each paid batch in `vp-spend.jsonl`; the lane total of estimates is ₹1,490, against a
  ₹4,000 cap.
- The reconciliation from logged usage × Retail API meters is about $12.2 (≈ ₹1,070). It assumes $1/h for MAI-2,
  which has no public meter.
- To be verified on the invoice (owner action 3).
