<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

<!-- The harness refused the Write of findings.md for this subagent; the coordinator should save this text as lanes/l8-azure-bench/round2/findings.md -->

# r2-latency-india: can a gateable Azure cascade meet kill criterion 6 from inside India?

Package `r2-latency-india` for critic item A6. Date: 2026-10-17 (Saturday). Author: round-2 research agent.

Everything here was measured today from a Linux VM in Azure **Central India (Pune)**, unless a row says otherwise.
- All measurements ran between **17:06 and 18:31 UTC (22:36 to 00:01 IST, Saturday night)**. That is off-peak for India, and
  load at Indian business hours is untested (section 9).
- No telephone leg was measured. Its cost comes from vendor documents (section 6).
- Every resource this package created has been deleted (section 11).

---

## 0. Bottom line (answer to A6)

1. **Kill criterion 6 is met on the server side, by a gateable cascade hosted in India.** The criterion is clean-turn p50
   ≤ 1.5 s from the caller's end of speech to the first agent audio byte.
   - **Configuration A** (n=58 turns, Hindi, Hinglish and elderly personas):
     - streaming STT in Central India with 500 ms segmentation;
     - an India-region LLM (gpt-4.1-mini, Standard deployment in South India);
     - a reply that opens with a short clause, with each clause passed through a code gate;
     - neural TTS in Central India.

     **p50 is 1.00 s** (95% CI 0.98-1.02; session-clustered CI 0.98-1.03). **p90 is 1.10 s.** All 58 turns were
     ≤ 1.5 s, and the elderly persona alone had p50 1.01 s.
   - **The speculative variant E** (start the LLM and TTS on the partial transcript and hold the audio until the STT
     final) gives **p50 0.82 s** (0.73-0.87), p90 1.03 s.
2. **With the telephone leg the margin is real but not proven.** Twilio's published budget puts the media and carrier leg
   at about **0.23-0.30 s** (mouth-to-ear 1,115-1,400 ms against a platform gap of 885-1,100 ms). For an Indian CPaaS the
   leg is unmeasured; I assume 0.25-0.45 s. On that assumption the estimated caller-perceived p50 is:
   - A: 1.25-1.45 s;
   - E: 1.07-1.27 s;
   - B (800 ms segmentation, no speculation): 1.60-1.80 s, which **fails**;
   - D (gpt-6-sol in the EU data zone as the speaking model): 1.80-2.00 s, which **fails**;
   - F (gpt-5.4-nano, Global Standard via Southeast Asia): 1.61-1.81 s, which **fails**.
3. **The architecture expected to pass:** an India-resident streaming cascade.
   - Azure real-time STT in Central India, hi-IN, segmentation about 500 ms.
   - The fastest India-region LLM on a Standard deployment, with the asynchronous content filter and a short first clause.
   - A per-clause code gate. It costs about 22 µs.
   - Central India neural TTS (Swara, 8 kHz μ-law, warm websocket pool).
   - Speculation is optional headroom: it buys 0.22 s (paired median, CI 0.15-0.26).

   **The AI-only cost is about ₹2.4 per connected minute** at list price, ₹95 to the dollar and the measured turn shape:
   - STT ₹1.58 (66%);
   - TTS ₹0.64;
   - LLM ₹0.18.

   Telephony of ₹0.4-0.5 per minute (from l2) comes on top.
4. **Latency is no longer the binding problem. Turn-taking is.**
   - On caller turns with no internal pause of 0.5 s or more, no configuration cut in on any of 30 turns.
   - On turns with a 0.9-1.3 s sentence pause, the agent started talking before the caller finished in:
     - 72% of turns for A;
     - 17% for B;
     - 78% for C (800 ms segmentation plus speculation);
     - 100% for E.
   - On the elderly caller's 2.4 s mid-sentence pause, every configuration took the turn, 12/12 each.
   - The quality model (gpt-6-sol) answered that pause with a "go on" prompt in 11 of 12 cases. The fast models answered
     with content in 12 of 12.
   - The elderly caller's quiet "हम्म…" was never transcribed, in 0/12 cascade runs and in 0 of 4 Voice Live arms, so the
     agent stayed silent.

   Lower latency comes directly at the cost of more cut-ins. That trade-off, not raw speed, is what the pilot must tune.
5. **Round 1 overstated our own latency, by a factor of 2-5 on the LLM.** Round 1 measured from Ohio through a TLS
   re-terminating proxy. From India:
   - gpt-5.4-nano time to first token: 0.58 s against round 1's 1.32-1.64 s "server-side" estimate;
   - Voice Live gpt-4.1-mini first audio: 1.38 s against 2.27 s.

   The likely causes are the proxy, the region and the time of day; this package cannot separate them. Round 1's latency
   figures should not be used for planning.
6. **Residency.** The fastest path is also the only one processed entirely in India. Round 1 framed India-only as a latency
   penalty (DeepSeek in SEA took 2.58 s against 1.11 s in DZ-EU [l8v]). That framing is reversed for this path.
   - The catch: **gpt-4.1-mini is "Legacy" and retires on 2027-04-14** on the South India Standard SKU (Azure Models API).
   - Which replacement will exist on a Standard SKU in India is unknown.

## 1. What was measured, where and how

**Host and services**
- **Host:** Standard_D4s_v5, Ubuntu 24.04. IMDS confirmed location `CentralIndia`. Python 3.12, Speech SDK 1.52.0.
- **Why a VM:** the `Microsoft.ContainerInstance` provider is not registered on the subscription. Registering it is a
  subscription-level change, so a VM was used instead.
- **How jobs ran:** through the ARM managed Run Command API. Keys were passed as protected parameters at runtime.
  Results went back through a transient blob container.
- **Services created for this package:**
  - AIServices accounts `vp-r2lat-cin` (Central India: STT, TTS, Voice Live) and `vp-r2lat-sin` (South India: India-region
    LLM deployments);
  - LLM deployments on the existing `vp-research-ai-sea` (Global Standard and APAC data zone) and `vp-research-ai-frc`
    (EU data zone) accounts.
  - All LLM deployments used the asynchronous content filter. Round 1 showed it saves 0.19-0.30 s.

**Caller audio:** the l4b battery personas.
- P1: Neha, urban Hinglish.
- P2: Ramesh, Bhojpuri-Hindi.
- P4: Shanti Devi, 68, elderly slow Hindi, with pauses of 0.56-0.92 s and one 2.42 s mid-sentence pause (P4_t03).
- **Phone channel:** every clip was rendered through a phone channel (300-3,400 Hz, 8 kHz G.711 μ-law round trip). It was
  pushed at real-time pace in 20 ms frames into a continuous line per session.
- **Caveat:** the audio is synthetic Azure TTS, not real callers.

**Metric (cascade):** the wall time from pushing the clip's last speech frame to the first TTS audio chunk arriving at the
VM, for the response that is released after the caller finishes.
- A response released earlier while the caller was in a pause, after which the caller resumed, counts as a **premature
  cut-in**.
- A response cancelled before any audio was released costs only compute.

**Cascade logic** (`harness/cascade.py`)
- STT commits a turn on each final result.
- The LLM streams its reply. The prompt is round 1's renewal agent with a "reply shape" note appended last: open with a
  2-4 word clause.
- A clause splitter feeds each clause to the code gate (`harness/gate.py`): no claim to be human, no request for card,
  OTP or Aadhaar details, and every number must be a policy fact or something the caller said. Then the clause goes to
  TTS.
- **Speculative configurations** start the LLM and TTS once the energy VAD sees 250 ms of silence. They use the finals so
  far plus the latest partial, and restart when the partial changes. The audio is held until the STT final arrives and
  matches (normalised similarity ≥ 0.85 and identical digits). Otherwise the response is discarded and rebuilt.
- **Turn n:** 3 personas × 10 turns × 2 passes = 60 turns per configuration, plus 12 repeats per configuration of the
  elderly-pause clip.

**Harness versions and invalid runs**
- **v1 harness** (configs A and B, 30 turns each) is reported as a check.
- **A rate-limited attempt** is kept only as a documented failure mode (section 8). The 50k-TPM Standard deployment
  returned 429 under three concurrent speculative streams, so 13 of 35 turns got no reply.
- **The reported run is the "main" run.** It used harness v2:
  - Devanagari digits normalised in the gate;
  - no clause split inside "24,500";
  - a synthesizer that was cancelled mid-stream is never reused;
  - deployment capacity raised to 400k TPM (South India) and 300k TPM (SEA, EU).
- **v1 and the main run agree.** A was 1,028 ms in v1 against 1,004 ms; B was 1,359 against 1,348.

## 2. Network floor from Central India (n=30 cold and 30 warm per host; `results/netprobe_summary.csv`)

| target | TCP connect p50 | TLS handshake p50 | cold request total p50 | warm keep-alive request p50 |
|---|---|---|---|---|
| Central India speech (STT and TTS hosts) | 2.6-2.7 ms | 21-22 ms | 41-75 ms | 2.7-3.3 ms |
| Central India AIServices (Voice Live host) | 2.4 ms | 25 ms | 676 ms (slow 401 path) | 1.3 ms |
| South India Azure OpenAI | 26 ms | 69 ms | 140 ms | 27 ms |
| Southeast Asia (speech and Azure OpenAI) | 54-56 ms | 71-130 ms | 239-295 ms | 50-58 ms |
| France Central Azure OpenAI | 124 ms | 266 ms | 636 ms | 127 ms |

- These match Microsoft's inter-region table: Central India to SEA 53 ms; Central India to France Central 135 ms (l8v).
- **Implications:**
  - A cold connection to France Central costs about 0.5 s more than a warm one, so keep-alive and pre-warming are
    mandatory.
  - Using the EU data zone puts about 0.13 s of pure network on every LLM call.

## 3. Components (from India)

### 3.1 LLM time to first token (n=33 per arm, warm cache, async filter; round 1's 1.6k-token Hinglish renewal prompt; `results/llm_india_summary.csv`)

| arm (processing scope) | served in | TTFT p50 (95% CI) | p90 | cached share |
|---|---|---|---|---|
| **gpt-4.1-mini, Standard, South India (India geography)** | South India | **304 ms (298-322)** | 387 | 0.91 |
| gpt-5.4-nano, Global Standard via SEA account | Southeast Asia | 577 (571-583) | 610 | 0.85 |
| gpt-5.4-nano, Global Standard via South India account | South India | 745 (736-752) | 781 | 0.82 |
| gpt-5.4-mini, Global Standard (SEA) | Southeast Asia | 773 (757-795) | 918 | 0.76 |
| gpt-4.1-mini, Global Standard (SEA) | Southeast Asia | 774 (766-793) | 962 | 0.91 |
| gpt-5.4-mini, Data Zone APAC (SEA) | Southeast Asia | 784 (765-803) | 885 | 0.78 |
| DeepSeek-V4-Flash, Data Zone EU | France Central | 816 (764-839) | 964 | 0.92 |
| gpt-6-luna, Data Zone EU | France Central | 883 (879-894) | 929 | 0.96 |
| gpt-5.4-mini, Global Standard, **priority tier** (SEA) | Southeast Asia | 903 (890-976) | 1,588 | 0.78 |
| gpt-6-sol, Data Zone EU | France Central | 1,005 (970-1,023) | 1,222 | 0.96 |
| gpt-6.1-sol, Data Zone APAC (reasoning "low" is the minimum it accepts) | Southeast Asia | 1,814 (1,651-1,937) | 2,819 | 0.96 |

- **The India Standard deployment is about 2× faster than any Global or data-zone deployment from India.** The likely
  reason is a short path with no global routing, though that is not proven.
- **Priority processing did not lower time to first token** (903 against 773 ms; `service_tier=priority` was confirmed in
  the responses). Microsoft's latency target for it is decode speed (tokens per second), not TTFT.
- **gpt-6.1-sol** rejects `reasoning_effort` none or minimal, so it cannot be a speaking model for live turns.

### 3.2 Real-time STT endpointing (Central India and SEA, hi-IN, phone band; n=30 clips per arm; `results/stt_india_summary.csv`)

| region / segmentation | final after speech end p50 (CI) | p90 | clips with a final mid-turn | elderly clips with a final mid-turn |
|---|---|---|---|---|
| Central India 300 ms | 450 (411-473) | 522 | 20/30 | 8/10 |
| Central India 500 ms | 622 (608-632) | 680 | 15/30 | 8/10 |
| Central India 800 ms | 985 (981-1,000) | 1,023 | 13/30 | 6/10 |
| Central India "Semantic" strategy | 848 (824-905) | 1,609 | 15/30 | 8/10 |
| Southeast Asia 500 ms | 677 (666-704) | 743 | 15/30 | 8/10 |

- **The final arrives at about the segmentation timeout plus 120-190 ms.** The 300 ms result matches round 1's 0.44 s.
- **The timeout is not a floor.** At 800 ms, Azure still issued finals inside 0.7-0.9 s elderly pauses on 6/10 clips.
- **The first partial** came about 925 ms after speech started. That limits how early speculation can begin.
- **Semantic segmentation** is slower and has a long tail. Microsoft's documentation also says it "shouldn't be used in
  interactive scenarios".

### 3.3 TTS time to first audio (warm websocket, n=30 per arm, sentences of about 116 characters; `results/tts_india_summary.csv`)

| voice | Central India p50 (CI) | Southeast Asia p50 |
|---|---|---|
| hi-IN-SwaraNeural (16 kHz PCM / 8 kHz μ-law) | 95 (84-104) / 93 (81-102) | 164 |
| hi-IN-KavyaNeural | 99 (91-116) | 115 |
| en-IN-Meera:DragonHDLatestNeural (HD) | 188 (186-191) | 293 |
| hi-IN-Kavya:MAI-Voice-2.1-Flash (preview) | 363 (352-376) | 401 |

- In the cascade, the short opening clause ("जी," or "समझ गई,") reached first audio in **19-29 ms median**, against about
  95 ms for a full sentence. The say-first shape therefore pays off in TTS as well as in the LLM.

### 3.4 Voice Live from India (Central India resource; 3 sessions × 10 turns per arm; semantic multilingual VAD, 500 ms; `results/voicelive_india_summary.csv`)

| arm | gateable? | first audio after speech end p50 (CI) | p90 | notes |
|---|---|---|---|---|
| gpt-4.1-mini (Regional/India) + azure-speech hi-IN + Swara | no | 1,377 (1,283-1,414) | 1,496 | 3/30 turns got no reply (P2 "हँ।", elderly "हम्म…", one mis-heard opener) |
| **gpt-4.1-mini in text mode → our code gate → our Central India TTS** | **yes** | **1,175 (1,121-1,195)** | 1,241 | same 3 misses; 0 cut-ins |
| gpt-realtime-2.1-regional (speech-to-speech, India processing per Microsoft's table) | no | 1,414 (1,171-1,502) | 1,667 | 7/29 replies mostly English |
| azure-realtime (speech-to-speech, Global) | no | 1,616 (1,520-1,781) | 2,272 | 5/28 replies mostly English |

- The semantic VAD stop came about 0.71 s after speech end. Sessions were ready in 0.11-0.81 s, against 1.4-2.2 s from
  Ohio in round 1.
- **Voice Live is now viable from India, but it is not better than our own cascade.** The gated text-mode variant (1.18 s)
  is 0.17 s slower than cascade A (1.00 s).
- **The two speech-to-speech models still drift into English.** This confirms round 1's 6/16.

## 4. End to end: the gateable cascade (main run, from the Central India VM, no telephone leg)

`results/cascade_main_summary.csv`, `cascade_main_paired.csv`, `cascade_main_cutins_by_pause.csv`, `cascade_main_by_persona.csv`

| config | segmentation / speculation / LLM | turns (with reply) | p50 ms (95% CI turn; session-cluster) | p90 | clean-turn p50 / p90 | ≤ 1.5 s |
|---|---|---|---|---|---|---|
| **A** | 500 / no / India gpt-4.1-mini | 60 (58) | **1,004** (984-1,017; 979-1,030) | 1,100 | 1,004 / 1,105 | 58/58 |
| B | 800 / no / India gpt-4.1-mini | 60 (57) | 1,348 (1,333-1,368; 1,333-1,363) | 1,454 | 1,344 / 1,434 | 56/57 |
| C | 800 / yes / India gpt-4.1-mini | 60 (58) | 1,011 (1,002-1,031; 1,000-1,018) | 1,310 | 1,015 / 1,326 | 57/58 |
| D | 800 / yes / gpt-6-sol, EU data zone | 60 (58) | 1,546 (1,450-1,617; 1,383-1,606) | 1,960 | 1,591 / 1,966 | 26/58 |
| **E** | 500 / yes / India gpt-4.1-mini | 60 (58) | **823** (733-865; 729-880) | 1,029 | 826 / 1,044 | 58/58 |
| F | 800 / yes / gpt-5.4-nano, Global Standard via SEA | 60 (59) | 1,360 (1,258-1,419; 1,281-1,407) | 1,631 | 1,384 / 1,644 | 41/59 |

**Medians of the components** (A, B, C, E):
- STT final relative to speech end: 648-659 ms at 500 ms segmentation, 992-1,004 ms at 800 ms.
- LLM time to first token: 306-316 ms.
- Open-clause TTS: 19-28 ms.
- Gate: 21-24 µs.

**By persona** (A): P1 975, P2 1,044, P4 (elderly) 1,009 ms p50. The configuration ranking holds for every persona.

**Paired differences on identical clips** (median, 95% CI):
- E − A = −224 ms (−259 to −150).
- B − A = +346 ms (+332 to +368).
- C − B = −329 ms (−361 to −313).
- D − C = +549 ms (+445 to +604).
- F − C = +300 ms (+252 to +348).

**Turn-taking and the cost of speed**

| config | turns with a premature cut-in | cut-in when the longest pause is 0.5-0.9 s | 0.9-1.3 s | elderly 2.4 s pause | responses per turn (wasted) |
|---|---|---|---|---|---|
| A | 15/60 (25%) | 0/10 | 13/18 (72%) | 12/12 | 1.87 (0.90) |
| B | 9/60 (15%) | 4/10 | 3/18 (17%) | 12/12 | 1.50 (0.55) |
| C | 20/60 (33%) | 4/10 | 14/18 (78%) | 12/12 | 3.77 (2.80) |
| D | 11/60 (18%) | 5/10 | 4/18 (22%) | 12/12 | 3.82 (2.85) |
| E | 30/60 (50%) | 10/10 | 18/18 (100%) | 12/12 | 3.65 (2.68) |
| F | 12/60 (20%) | 6/10 | 4/18 (22%) | 12/12 | 3.80 (2.82) |

- **No configuration cut in on any of the 30 turns without an internal pause of 0.5 s or more** (CI 0-11%).
- **Every cut-in fell in a pause the caller made mid-turn:**
  - a 1.0-1.1 s break after "हाँ hello?" or "…बताईं?";
  - the elderly 0.7-0.9 s "…" pauses;
  - the 2.4 s mid-sentence pause.

  A human telecaller would answer some of these too. l4bv makes the same point for the 2.4 s pause.
- **What the agent says into the pause differs by model.** In the 2.4 s pause, gpt-6-sol (D) replied with a "go on"
  prompt ("जी, आपकी policy… आगे बताइए") in 11/12 cases. gpt-4.1-mini and gpt-5.4-nano answered the half-question in 12/12.
  Often their answer was right: the renewal date.
- **The elderly "हम्म…" (P4_t08, 0.45 s, quiet) never produced an STT final** in any configuration or pass. The agent
  stayed silent.

**Gate.**
- The gate added 21-24 µs per clause, a negligible amount.
- **The trivial gate had false positives.** They replaced a clause with the safe fallback in 3/60 (A), 0 (B, C, E), 12/60
  (F) and 14/60 (D) turns. Causes:
  - "3:30" split at the colon by the clause splitter;
  - "मैं human advisor…" read as a claim to be human;
  - "1 लाख 50 हज़ार" not normalised.
- In v1, before Devanagari digit normalisation, 8-12 of 30 turns were hit.
- **A production gate needs** number canonicalisation (lakh, hazaar, Devanagari digits, times), call-level slot memory
  (numbers confirmed earlier in the call) and a time-aware splitter. That is engineering, not a latency cost.

## 5. Cost per connected minute (AI only, list price, ₹95 per dollar; `results/cascade_main_cost_per_min.csv`)

- **Measured turn shape:** caller clip 4.1 s, latency about 1 s, agent reply about 12.3 s (106 characters). That gives
  **about 3.5 turns a minute**, inside round 1's 3-8 range.
- **Billed items:** STT streamed for the whole call at $1/h (Central India S1). LLM tokens as measured, including
  speculative waste and imputed usage for cancelled streams. TTS characters including waste, at $15/1M.
- **Meters** (Azure Retail Prices API, 2026-10-17): gpt-4.1-mini regional in South India costs $0.44 input, $0.11 cached
  and $1.76 output per 1M tokens (10% over global).

| config | STT | LLM | TTS | AI total ₹/min at 3.5 turns (range at 3-5 turns) |
|---|---|---|---|---|
| A | 1.58 | 0.18 | 0.64 | **2.41** (2.21-2.76) |
| B | 1.58 | 0.15 | 0.56 | 2.30 |
| C | 1.58 | 0.39 | 0.83 | 2.80 |
| E | 1.58 | 0.39 | 0.75 | 2.72 |
| D (gpt-6-sol) | 1.58 | 1.54 | 0.52 | 3.64 |
| F (gpt-5.4-nano) | 1.58 | 0.17 | 0.77 | 2.52 |
| Voice Live gpt-4.1-mini (estimate from response usage at Central India Std meters; check on the invoice) | | | | about 3.8 at 5 turns |

- **STT is about two thirds of the cost.** The levers are the same as in round 1: commitment tiers (Central India: 10K
  h/month at $0.6175/h, 50K at $0.50/h, 100K at $0.38/h), VAD-gated streaming (its billing behaviour is unverified) and
  shorter replies.
- **Speculation adds ₹0.3-0.4 a minute.**
- **All-in with telephony at ₹0.4-0.5:** about ₹2.8-2.9 per minute for A.

## 6. The telephone leg (estimated from vendor documents, not measured)

| source | what it says | method |
|---|---|---|
| Twilio, "A Guide to Core Latency in AI Voice Agents (Cascaded Edition)", 2025-11-17 | Platform turn gap target 885 ms (upper 1,100). Mouth-to-ear turn gap target 1,115 ms (upper 1,400). Device to media edge 40 ms, inbound buffering 30 ms, decoding 25 ms. "Telephony is the slowest and least reliable part of this path". So the media and carrier overhead is about **230-300 ms**. | vendor doc (US network) |
| Plivo audio streaming guide (last updated January 2026) | Inbound media in ~20 ms chunks. Network round trip target "< 100ms". Deploy near callers, "Singapore or Mumbai" for APAC. Routes "through the edge location closest to the caller". clearAudio for interruption. | vendor doc |
| Exotel AgentStream developer guide | 16-bit 8 kHz mono PCM, base64 (16 and 24 kHz optional). Bot-to-Exotel chunks at least 3.2 KB (**100 ms**) and at most 100 KB, in multiples of 320 bytes. "Clear" only removes unplayed audio. No latency figures. Press release (2025-08-13) claims "sub-20ms latency", undefined. | vendor doc / press |

**Estimate.** An Indian CPaaS leg would add **0.25-0.45 s** to the caller-perceived gap:
- uplink from handset to media server;
- CPaaS to Azure Central India at 5-30 ms;
- Exotel's 100 ms minimum chunk;
- playout jitter buffer and downlink.

That gives caller-perceived p50 of about A 1.25-1.45 s, E 1.07-1.27 s, C 1.26-1.46 s and B 1.60-1.80 s. **This is an
estimate.** The test plan in section 9 replaces it with a measurement.

## 7. Prediction and claim check

| item | before this package | now |
|---|---|---|
| Kill criterion 6 (clean-turn p50 ≤ 1.5 s) | "no gateable Azure path meets it" (critic §0.2, from Ohio numbers) | **Met on the server side from India** by A (1.00 s), C (1.01 s) and E (0.82 s). The caller-side estimate passes for A, C and E if the Indian telephone leg is ≤ about 0.45 s. **Not yet measured end to end on a real call.** |
| Round 1's "own cascade ≈ 2.1-3.6 s, India-hosted (estimate)" and l8v's "about 2.2-4 s" | estimate | **Refuted by measurement**: 1.00 s p50 (A). |
| Round 1's "only azure-realtime is under 1.5 s" | measured from Ohio | Superseded. From India, azure-realtime was 1.62 s p50, slower than our gated cascade and Voice Live text-gated. |
| "India-only processing costs latency" (critic B5 / l8v) | DeepSeek SEA against DZ-EU | **Reversed** for the India Standard gpt-4.1-mini deployment (304 ms, the fastest of 11 arms), and for Central India STT and TTS. |
| H9 "full-duplex S2S not production-grade for Indic" | supported (n=16) | Still supported. English-dominant replies on 5/28 (azure-realtime) and 7/29 (gpt-realtime-2.1-regional). |
| Round 1 kill criterion "real-time outbound dies if India-hosted p50 > 3.5 s" | open | Not triggered: 0.82-1.55 s. |

## 8. Failure modes found (each one changes a design rule)

1. **Rate limits are a latency failure.**
   - A 50k-TPM Standard deployment returned HTTP 429 to 13 of 35 turns under three concurrent speculative streams. The
     caller then hears nothing.
   - Each concurrent call needs about 1.9k prompt tokens × 1.9-3.8 LLM calls per turn × 3.5 turns a minute, which is
     **about 13-25k TPM per concurrent call**.
   - At 100 concurrent calls that is 1.3-2.5M TPM. This subscription's South India Standard gpt-4.1-mini quota is 5,000
     units.
   - Size quota per concurrent call, and alert on 429s as a quality incident.
2. **Speculation trades cut-ins for speed.** E is 0.22 s faster than A but cuts in on every mid-turn pause of 0.5 s or
   more. It also doubles the LLM and TTS calls. Use speculation only together with a pause-aware release rule (open
   design).
3. **The segmentation timeout is not a guarantee.** Azure issued finals inside 0.7-0.9 s elderly pauses at 800 ms. Do not
   rely on raising the timeout to protect elderly callers. Test adaptive policies: CRM age, speaking rate, or a
   continuation prompt when the transcript is incomplete.
4. **Quiet elderly backchannels vanish.** "हम्म…" was missed every time. Add a silence-timer continuer, for example a
   gated, prerecorded "जी?" after about 2 s with VAD speech but no final.
5. **Never reuse a TTS stream that was cut off**, and keep a warm pool. Cold TLS to France Central costs 0.64 s and to
   Central India 41-75 ms.
6. **The gate needs number canonicalisation and call memory** (section 4). The trivial gate's false positives were 0-23%
   of turns.

## 9. Dated test plan for the real telephone leg

| when | who | what | pass / fail |
|---|---|---|---|
| Mon 2026-10-19 to Fri 10-23, at 11:00-13:00 and 17:00-19:00 IST | research. About ₹250 per session. Recreate the VM, accounts and deployments from `harness/` (about 15 minutes) | Re-run LLM TTFT (India gpt-4.1-mini, SEA nano), STT 500 and 800 ms, and cascades A, C and E. n ≥ 60 turns per configuration, **at Indian business hours** | A clean-turn p50 ≤ 1.2 s on the server side at peak. If India Standard TTFT p50 is above 0.6 s at peak, re-rank the LLMs. |
| by Fri 2026-10-24 | **owner** (B8) | Open trial accounts with 2 CPaaS that offer bidirectional media streaming in India: Exotel AgentStream, Plivo, Vobiz. KYC is needed. Ask each for its media point-of-presence city and whether it carries the 1600 series (A1). | accounts live |
| week of 2026-10-26 | research plus owner (owner places the calls) | Gateway on a Central India VM bridging CPaaS WebSocket media to cascade A or E. (1) **Echo-bot loopback**: the bot replays a chirp the moment it detects one. Record the handset with a second recorder to measure the round trip U + D, n ≥ 30 per carrier (Jio, Airtel, Vi). (2) **Battery calls**: play the l4b clips into the handset and record the earpiece. Measure caller end of speech to agent audio onset at the handset, n ≥ 60 turns per configuration per CPaaS. | **Kill criterion 6 passes if the handset-measured clean-turn p50 is ≤ 1.5 s on at least 2 carriers at business hours.** At 1.5-1.8 s: adopt E plus a pause-aware release and re-test. Above 1.8 s: investigate the CPaaS media region and SIP against WebSocket before building further. |
| by 2026-11-15 | research | Elderly turn-taking pilot set: 10 real, consented elderly speakers, or a licensed elderly corpus (B11 gating). Tune the release policy against cut-ins. | cut-in on mid-turn pauses ≤ 10% at clean-turn p50 ≤ 1.5 s |
| before 2027-01-14 (90 days before the 2027-04-14 retirement) | research | Re-benchmark the replacement for India Standard gpt-4.1-mini once Microsoft names it. Check its India Standard availability and TTFT. | India Standard TTFT p50 ≤ 0.5 s, or fall back to E with SEA nano and re-test |

## 10. What this changes in SYNTHESIS

- **§1.2 and §9 item 3.** Replace "our cascade 2.2-4 s, kill criterion 6 effectively tripped" with the following. On
  2026-10-17 an India-hosted gateable cascade measured clean-turn p50 1.00 s (speculative 0.82 s) server-side. With an
  estimated Indian telephone leg of 0.25-0.45 s, it is expected to pass kill criterion 6. It is not yet measured on a real
  call, and the dated test is in section 9.
- **Kill criterion 6.** Add "measured at the handset, at Indian business hours". Add a turn-taking companion criterion:
  premature cut-ins on mid-turn pauses ≤ 10%, plus elderly "हम्म" handled. That is now the harder bar.
- **Owner item B5 (residency).** The fastest measured path is India-processed end to end: STT and TTS in Central India
  (regional) and the LLM on a South India Standard deployment. The residency choice no longer costs latency for this
  path. The open risk is model retirement (gpt-4.1-mini, 2027-04-14).
- **Owner item B3 (benchmark budget).** The India probe is done. This package's spend is about ₹600 at list price
  (estimate; see the spend section).
- **Gap map and thesis.** "Our own stack misses our own latency bar" (critic §7.4) no longer holds on the server side.
  The competitive question moves to turn-taking quality on elderly and pausing callers. That was already the l4b gap, so
  it is now a gap for us as well as for incumbents.
- **Interview kit (low impact).** No question changes. The latency story for the founder is now "about 1 second from
  India, being verified on real calls".

## 11. Resources created and their deletion (`resources-created.csv`)

**Created inside `vp-research-rg`:**
- AIServices accounts `vp-r2lat-cin` (Central India) and `vp-r2lat-sin` (South India), with the RAI policy
  `r2-async-filter`.
- Network and compute: NSG `vp-r2lat-nsg`, VNet `vp-r2lat-vnet`, public IP `vp-r2lat-pip`, NIC `vp-r2lat-nic`, VM
  `vp-r2lat-vm` (D4s_v5) and its OS disk, and its run commands.
- Blob container `r2lat-transfer` in the existing `vpresearchraw1017`.
- 10 model deployments:
  - `vp-research-ai-sea`: r2-gpt-5-4-nano-async, r2-gpt-4-1-mini-async, r2-gpt-5-4-mini-async,
    r2-gpt-5-4-mini-dzapac-async, r2-gpt-6-1-sol-dzapac-async;
  - `vp-research-ai-frc`: r2-gpt-6-luna-dz-async, r2-gpt-6-sol-dz-async, r2-deepseek-v4-flash-dz-async;
  - `vp-r2lat-sin`: r2-gpt-4-1-mini-std-async, r2-gpt-5-4-nano-async.

**Deletion, verified 2026-10-17 at about 18:35 UTC by ARM listing:**
- The VM, NIC, public IP, disk, VNet and NSG are gone.
- The container is gone; only `research-2026-10-17` remains.
- All 10 deployments are deleted. Both deployment lists on SEA and FRC are empty.
- Both new accounts are deleted **and purged**; the soft-deleted list holds no `r2lat` entries.
- `vp-research-rg` now holds only what existed before: `vp-research-ai-sea`, `vp-research-ai-frc` and
  `vpresearchraw1017`.
- Nothing outside `vp-research-rg` was touched.
- The `Microsoft.ContainerInstance` provider was **not** registered.
- The local SAS token and the throwaway SSH public key were deleted from the scratchpad.

## 12. Spend (`vp-spend.jsonl`)

| | amount |
|---|---|
| Estimates logged before spending | ₹160 (VM) + ₹330 (components) + ₹330 (cascade) + ₹280 (re-runs) = ₹1,100, within the ₹1,500 cap |
| Usage × meter reconciliation | about $6.1-6.4 = **about ₹600** |

The reconciliation breaks down as:
- VM: about $0.35;
- STT: about 2.0 audio-hours, $2.0;
- LLM: about $1.0;
- TTS: about 118k characters, ≤ $2.0;
- Voice Live: about $0.7-1.0, estimated.

It is not invoiced. Check Cost Management, filtered on `vp-research-rg`, after 2026-10-19.

## 13. Caveats

- **Synthetic callers.** Clean, read-style TTS voices through a simulated phone channel. There is no real line noise,
  packet loss or Indian PSTN jitter. The market-babble bed (P2) was **not** mixed in.
- **One time window.** Saturday 22:36 to 00:01 IST. Peak-hour behaviour is unknown, especially for Standard-SKU India
  capacity.
- **The speculation trigger is idealised.** It uses an energy VAD on known-clean audio. A real VAD (Silero, WebRTC) on
  phone audio will be noisier.
- **The cut-in rule is mechanical.** "Cut-in" counts any agent audio released before the caller's last speech frame,
  including turns a human would also take. The 2.4 s and 1.0 s sentence pauses are TTS artefacts of the battery.
- **Reply quality was not scored**, apart from the language check and the content-versus-continuation check on the pause
  clip. gpt-4.1-mini wrote Devanagari Hinglish with correct policy facts in the turns inspected. A blind quality
  comparison against gpt-6-sol is still owed.
- **Voice Live cost** is estimated from per-response usage, and the audio-token split is assumed.
- **The round 1 versus round 2 gap** (2-5×) is unexplained in detail. Hypothesis: the proxy buffered streaming responses,
  plus time of day. Not tested.

## 14. Files (under `lanes/l8-azure-bench/round2/`)

- `harness/`:
  - `vmrun.py`: runs jobs on the VM through ARM Run Command, with secrets as protected parameters;
  - `r2common.py`, `netprobe.py`, `llm_bench_india.py`, `tts_bench_india.py`, `stt_bench_india.py`;
  - `voicelive_india.py`, `cascade.py`, `gate.py`, `vadutil.py`;
  - `analyze_r2.py`;
  - `llm_prompt.py` and `tts_texts.py` (round 1's) and `battery.json` (l4b's).
- `results/`:
  - raw CSVs for every bench;
  - `*_summary.csv`, `cascade_main_*.csv` (the turns and responses for streams s1-s7, plus summary, paired differences,
    cut-ins by pause, cost and by-persona tables);
  - `cascade_v1_*` (check run);
  - `cascade_v2rl429_*` (the rate-limited failure, kept as evidence);
  - `azure-retail-prices-r2.csv`;
  - `clip_pauses.csv`;
  - `analysis_output.txt` (every table printed by the analysis).
- `resources-created.csv`.
