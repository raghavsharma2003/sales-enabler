<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused the file write). -->

<!-- The harness refused the Write of findings.md for this subagent. The coordinator should save this text as /home/user/sales-enabler/research/2026-10-18/lanes/g2-gemini-live-measured/findings.md -->

# g2-gemini-live-measured: what Gemini Live costs per connected minute, and how fast it answers from India

Lane g2 of the VP voice-stack research (owner directive 2026-10-18). Date: 2026-10-18 (Sunday), runs between 18:05 and
19:16 UTC (23:35-00:46 IST, off-peak). Covers V1 (cost, measured), V3 (gate lag) and V4 (latency) for Gemini Live.

**Vantages.** Every latency number names one of two vantages:

- **sandbox**: this container, US-East, through the TLS re-terminating agent proxy.
- **India VM**: an Azure VM in Central India (Pune), `Standard_D2als_v6`, zone 3. IMDS confirmed `CentralIndia`. TCP
  connect to `generativelanguage.googleapis.com` took 5.7 ms p50 and TLS 22 ms (n=20).

**Keys and money.**

- All Gemini traffic used the one free-tier key `GEMINI_TEST_KEY`, with synthetic caller audio only. No other Google key
  was used, looked for or rotated to.
- Costs are **paid list prices** applied to the measured `usageMetadata`. They are not invoices: the free tier cannot
  produce a bill.
- OpenRouter spend was $0. Azure spend was about ₹4 (VM, IP, disk, 439 TTS characters).

---

## 0. Bottom line

1. **Gemini Live does not fit a ₹2 price.**
   - The AI budget left by a ₹2 price is ₹0.20-0.82 a minute (§2.7).
   - At paid list price, measured from per-turn `usageMetadata` on scripted calls (sandbox, P1 Hinglish caller, n=1 call
     per cell; the across-call median is in the second table):

     | model | 1 min | 3 min | 5 min | 10 min |
     |---|---|---|---|---|
     | `gemini-3.1-flash-live-preview` (Meera's model) | ₹2.50 | ₹3.84 | ₹5.00 | ₹7.45 (9.2 min) |
     | `gemini-3.8-live` | ₹2.83 | ₹4.04 | ₹6.88 | ₹11.53 |
     | `gemini-2.5-flash-native-audio-latest` | ₹1.68 | ₹1.71 | ₹2.10 | ₹3.74 |

     Figures are ₹ per connected minute.
   - Across all 2-3-minute calls on both vantages, the medians are:

     | model | median ₹ per minute | n (calls) |
     |---|---|---|
     | 3.1 | 3.75 | 9 |
     | 3.8 | 5.35 | 18 |
     | 2.5 | 1.72 | 9 |

   - **V1 is killed.** A 5-minute call costs ₹2.1-6.9 a minute, against a budget of at most ₹1.
2. **Why it is expensive (measured).** Every model invocation re-bills the whole context. For 3.1 and 3.8 the retained
   context is:
   - the system prompt;
   - every caller speech segment the server VAD detected;
   - all the agent's own past audio, at 25 tokens per second, billed at the $3/1M audio-input rate.

   The context audio matched (VAD speech + agent audio) × 25 within 4% on 4 calls. Silence outside speech was not in the
   context.

   On a 10-minute 3.8 call, context audio is ₹9.66 of ₹11.53 a minute. Output audio costs ₹0.8-1.1 a minute at every
   length, because $12/1M × 25 tokens per second = **₹1.71 per minute of agent speech**.
3. **The cost has a floor (computed from the fitted parameters).** With perfect compression, so that only the system prompt
   and the current turn are re-billed, the floor is:
   - 3.1: about ₹1.6 a minute;
   - 3.8: about ₹1.9 (about ₹1.75 with `thinkingBudget: 0`);
   - 2.5: about ₹1.1.

   **Every floor is above the AI budget.**
4. **Context compression helps, but less than its settings suggest.**
   - Configured as `triggerTokens 6000 / targetTokens 3000`, it fired late on all three models. The prompt saw-toothed
     between 8.6-9.0k and 4.0-5.3k tokens.
   - It cut the 10-minute cost by 25% for 3.1 (₹7.45 to ₹5.57), 22% for 3.8 (₹11.53 to ₹8.98) and 23% for 2.5 (₹3.74 to
     ₹2.87).
   - Projected with a tight window (trigger at system prompt + 2k), cost per minute goes flat in call length: about ₹2.9
     for 3.1, ₹3.9 for 3.8 and ₹1.6 for 2.5. A tight window also forgets the call.
5. **Meera's "₹1.3 a minute" does not reproduce.**
   - Meera's own model, with a persona about 1/15 the size of Meera's, measures ₹2.5 a minute at 1 minute and ₹3.8 at
     3 minutes.
   - With a Meera-size system prompt (about 13k tokens), the projection is ₹6.0-11.5 a minute (1-10 minutes, no
     compression).
   - g1 traced the ₹1.3 figure: it was computed once per connection, not per turn.
6. **Latency from Central India (V4).**

   | configuration | p50 (95% CI) | p90 | clean turns / calls |
   |---|---|---|---|
   | **3.8 Live + `thinkingBudget: 0`** | **0.82 s (0.78-0.85)** | 1.51 s | 26 / 4 |
   | 3.8 Live, default thinking | 1.25 s (1.12-1.43) | 1.66 s | 52 / 6 |
   | 3.1 flash live | 1.97 s (1.95-2.14) | 3.21 s | 37 / 5 |
   | 2.5 native audio | 2.7-3.0 s | 5.7-7.6 s | |

   - 3.8, 3.1 and 2.5 use Meera's tuned VAD (300 ms silence, end-sensitivity HIGH). CIs are call-clustered bootstraps.
   - From the sandbox, 3.8 is 1.41 s and 3.1 2.03 s, so India saves about 0.16 s for 3.8 and nothing for 3.1.
   - The round-2 Azure India cascade measured 1.00 s.
7. **Turn-taking is again the binding problem. No Gemini Live configuration passes V4** (p50 ≤ 1.2 s and cut-ins ≤ 5%).
   - The fast configuration (3.8 + `thinkingBudget: 0`) started talking before the caller finished on **52% of spoken
     turns**. That is 93% of turns with a 0.9-1.3 s mid-sentence pause and 79% of the elderly caller's turns.
   - The elderly caller's 2.42 s pause was taken **44 times in 47 tries** across all models and VAD settings. Round 2's
     cascade took it 12/12.
   - The server-default VAD cuts in less, but it is slow: 3.8 1.39 s, 3.1 2.30 s.
8. **Gate lag (V3): the transcript is not late, so a text gate is feasible with a small hold.**
   - Output-transcript text arrives in the same server message as the first audio chunk for 3.1 and 3.8. For 2.5 it
     arrives 0.34-0.58 s before the first audio.
   - In 892 responses, no transcript fragment arrived after its audio would have started playing.
   - The first clause is complete in text by p50 0-69 ms and p90 270-440 ms after playback starts (≤ 1.4 words). So a
     **≈ 0.5 s hold buffer** lets a text gate check the first clause before it is heard, at the price of that hold in
     latency.
   - Prediction V3a is wrong.
   - Not measured: the violation rate on an attack battery.

---

## 1. What was run

**Harness** (`harness/live_call.py`, Python 3 + `websockets` 17)

- **Connection.** Raw `BidiGenerateContent` WebSocket, `v1alpha` (Meera's endpoint; it is the only API version that
  accepted `proactivity`).
- **Caller audio.** Battery clips from l4b, put through a phone channel (300-3,400 Hz, 8 kHz μ-law round trip), then
  16 kHz PCM16. They are sent in real time as 20 ms frames on a **continuous line**: between clips the harness sends
  -75 dBFS comfort noise, as a phone line would.
- **Agent audio.** A simulated real-time player schedules the agent audio (24 kHz). The caller starts its next clip only
  after playback ends plus a 0.5-0.9 s reaction gap.
- **What is logged, per server message:** timestamp, `usageMetadata` (all fields, including `cachedContentTokenCount` and
  per-modality details), input and output transcription, `voiceActivity` (with `audioOffset`), `interrupted`,
  `generationComplete`, `turnComplete`, `goAway` and resumption updates.
- **Session limits.** Session resumption handles the ~10-minute connection limit: the harness reconnects with the last
  handle at a quiet moment.
- **Recording.** Each call is saved as a stereo WAV: left the caller as sent, right the agent as played.

**Persona** (`harness/persona.txt`): a 727-token Hinglish renewal and relational agent, Asha of the fictional Suraksha
Health. It was identical in every run.

**Configuration per model, recorded in every call's `meta.json`**

| model | api | thinking | affective dialog | proactive audio | voice / language |
|---|---|---|---|---|---|
| `gemini-3.1-flash-live-preview` | v1alpha | `thinkingBudget: 0` (Meera's setting) | unsupported: `1007 invalid argument` | not supported (docs); not set | Despina / hi-IN |
| `gemini-3.8-live` | v1alpha | default (interleaved); one arm with `thinkingBudget: 0`, which is accepted. `thinkingLevel` is rejected ("not supported for this model") | setup accepted, then **`1007` on the first audio frame**, so unusable | on (`proactivity.proactiveAudio`, accepted only on v1alpha at `setup` level) | Despina / hi-IN |
| `gemini-2.5-flash-native-audio-latest` | v1alpha | `thinkingBudget: 0` | on (`generationConfig.enableAffectiveDialog`); one arm off | on; one arm off | Despina / hi-IN |

The setup-field probe (27 setups) is in the scratchpad raw directory, `setup_probe.txt`.

- **`enableAffectiveDialog` placement.** It is accepted inside `generationConfig`. At `setup` level the server answers
  "Cannot find field".
- **Model listing.** `models.list` reports `gemini-3.8-live` with version string `3.1-flash-live-03-2026`, the same as
  3.1. The two behave differently, though:
  - 3.8 emits 46-143 `thoughtsTokenCount` per turn; 3.1 emits none;
  - their VAD end timing differs (§3);
  - their latency differs.

  So they are not the same serving configuration.

**VAD settings**

- **"meera":** `endOfSpeechSensitivity: END_SENSITIVITY_HIGH`, `silenceDurationMs: 300`, `prefixPaddingMs: 60`.
- **"server":** API defaults.

**Run matrix** (54 completed calls, 198 call-minutes, 1,096 model invocations, 5.07M prompt tokens)

- **Cost matrix, sandbox.** 3 models × {1, 3, 5, 10 min} × compression {off, `triggerTokens 6000 / targetTokens 3000`}.
  All 24 completed. The 3.1 10-minute uncompressed call ended at 9.15 minutes (see §7).
- **India VM**, per model:
  - Hinglish P1 with meera VAD (2-3 calls);
  - elderly P4;
  - elderly-pause probe "PAUSE" (P4_t03, the 2.42 s pause, every other turn);
  - P1 and PAUSE with server VAD;
  - worried-caller scene W (8 new clips, Azure `hi-IN-SwaraNeural`).
- **Extra arms.**
  - India: 3.8 `thinkingBudget: 0` (P1 ×2, P4, PAUSE) with a same-window control; 2.5 with no affective or proactive.
  - Sandbox: 3.8 server VAD ± `thinkingBudget: 0`.

**Metric definitions**

- **Latency** is the end of the last caller-clip frame sent to the first agent audio chunk received. No `audioStreamEnd`
  is sent, because a phone line does not send one.
- **Clean turn:** a spoken caller turn with no cut-in and a reply after end of speech.
- **Cut-in:** agent audio arrived while the caller clip was still playing.

---

## 2. Cost (V1)

Prices are USD per 1M tokens from g1 `prices.json` (Gemini API standard paid tier; pricing page dated 2026-10-16 and read
on 2026-10-18).

| model | text in | audio in | text out | audio out |
|---|---|---|---|---|
| 3.8 Live and 3.1 flash live | 0.75 | 3.00 | 4.50 | 12.00 |
| 2.5 native audio | 0.50 | 3.00 | 2.00 | 12.00 |

- Thinking tokens are billed at the text-output rate.
- Transcription text is billed at the text-output rate, per g1's reading of the best-practices page. Its token count was
  estimated from our transcripts with `countTokens`: 0.345 tokens per character (`results/transcript_token_calibration.json`).
- FX is ₹95 to the dollar.

### 2.1 Measured cost per call and per connected minute

Sandbox, P1 Hinglish caller, meera VAD (`results/cost_by_length.csv`). Each cell is one call. "₹/min" includes the
transcription estimate (+₹0.03-0.10 a minute).

| model | compression | target | call min | turns | invocations | final prompt tokens | ₹ per call | ₹/min |
|---|---|---|---|---|---|---|---|---|
| 3.1 flash live | off | 1 | 1.31 | 4 | 5 | 2,867 | 3.3 | **2.50** |
| | off | 3 | 3.09 | 11 | 12 | 6,108 | 11.9 | **3.84** |
| | off | 5 | 5.00 | 20 | 18 | 9,142 | 25.0 | **5.00** |
| | off | 10 | 9.15 | 35 | 34 | 15,104 | 68.2 | **7.45** |
| | on 6k/3k | 1 | 1.19 | 4 | 4 | 2,837 | 2.9 | 2.44 |
| | on 6k/3k | 3 | 3.02 | 10 | 10 | 6,152 | 10.5 | 3.48 |
| | on 6k/3k | 5 | 4.91 | 19 | 20 | 4,230 | 24.1 | 4.91 |
| | on 6k/3k | 10 | 10.18 | 37 | 39 | 7,154 | 56.7 | 5.57 |
| 3.8 Live | off | 1 | 1.09 | 5 | 6 | 2,805 | 3.1 | **2.83** |
| | off | 3 | 3.01 | 15 | 14 | 5,311 | 12.2 | **4.04** |
| | off | 5 | 4.93 | 27 | 30 | 8,358 | 33.9 | **6.88** |
| | off | 10 | 9.90 | 54 | 58 | 15,617 | 114.0 | **11.53** |
| | on 6k/3k | 1 | 1.05 | 5 | 7 | 2,717 | 3.2 | 3.06 |
| | on 6k/3k | 3 | 3.05 | 17 | 20 | 5,426 | 15.9 | 5.20 |
| | on 6k/3k | 5 | 4.90 | 26 | 28 | 8,283 | 32.7 | 6.66 |
| | on 6k/3k | 10 | 9.99 | 54 | 60 | 4,431 | 89.7 | 8.98 |
| 2.5 native audio | off | 1 | 1.01 | 4 | 7 | 2,666 | 1.7 | **1.68** |
| | off | 3 | 2.93 | 11 | 13 | 5,443 | 5.0 | **1.71** |
| | off | 5 | 4.97 | 23 | 26 | 7,614 | 10.5 | **2.10** |
| | off | 10 | 10.05 | 50 | 62 | 14,820 | 37.6 | **3.74** |
| | on 6k/3k | 1 | 0.91 | 4 | 6 | 2,621 | 1.6 | 1.79 |
| | on 6k/3k | 3 | 3.14 | 14 | 17 | 5,524 | 5.4 | 1.72 |
| | on 6k/3k | 5 | 4.92 | 22 | 23 | 7,939 | 9.8 | 2.00 |
| | on 6k/3k | 10 | 9.88 | 56 | 70 | 5,982 | 28.4 | 2.87 |

- **Length.** The 10-minute call costs **3.0×** per minute what the 1-minute call costs on 3.1, **4.1×** on 3.8 and
  **2.2×** on 2.5.
- **Noise.** n=1 per cell, so neighbouring cells can invert (3.8 3-minute "on" is above "off": it had 20 invocations
  against 14). §2.5 smooths this with a fitted model.
- **India calls cost more.** 2-3-minute India calls cost 3.8 ₹4.5-8.5 a minute (P4 + `thinkingBudget: 0` reached ₹8.51,
  with 30 invocations in 3 minutes). That is more than in the sandbox, because cut-ins add invocations: every false start
  re-bills the whole context. The cut-in rate is therefore also a cost driver.

### 2.2 How input tokens grow

`results/token_growth.csv` has every invocation. `results/token_growth_by_minute.csv` gives the prompt tokens at each
minute of the 10-minute calls:

| call | 1 min | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.1, off | 2,371 | 4,035 | 5,673 | 7,721 | 8,697 | 10,439 | 11,813 | 13,329 | 14,650 | 15,104 (at 9.15 min) |
| 3.1, on 6k/3k | 2,286 | 4,360 | 5,768 | 7,402 | 8,630 | 5,319 | 7,130 | 8,964 | 5,035 | 6,749 |
| 3.8, off | 2,697 | 3,869 | 5,306 | 6,741 | 8,054 | 10,071 | 11,294 | 12,481 | 13,950 | 15,617 |
| 3.8, on 6k/3k | 2,405 | 3,925 | 5,822 | 7,190 | 8,606 | 4,367 | 5,594 | 7,387 | 8,820 | 4,431 |
| 2.5, off | 1,728 | 3,431 | 4,921 | 6,143 | 7,668 | 9,199 | 10,801 | 11,977 | 13,562 | 14,506 |
| 2.5, on 6k/3k | 2,797 | 4,341 | 5,478 | 6,585 | 8,353 | 5,276 | 6,577 | 7,964 | 5,155 | 5,982 |

**Fitted growth** (`results/cost_fit_params.csv`, uncompressed sandbox calls)

| model | first prompt | context growth | invocations a minute | agent audio per invocation |
|---|---|---|---|---|
| 3.1 | 869 text + 317 audio | +184 text and +1,234 audio tokens a minute | 3.7 | 227 tokens |
| 3.8 | 1,029 text + 257 audio | +186 text and +1,157 audio a minute | 5.7 | 125 tokens, plus 64 thought tokens |
| 2.5 | 1,207 text + 1 audio | **+1,338 text** and +59 audio a minute | 5.7 | 118 tokens |

### 2.3 What the context holds (measured)

- **3.1 and 3.8.** At the end of four 5- and 10-minute calls, context audio tokens were 96-103% of (server-VAD caller
  speech seconds + agent audio seconds) × 25.
  - Caller silence and agent-side silence are not in the context.
  - With proactive audio on (3.8), `usageMetadata` did **not** show listening time in the context. g1 found that the docs
  say proactive audio "charges for input tokens the entire time the Live API is listening". If the meter follows the
  docs rather than `usageMetadata`, 3.8 costs more than shown. This cannot be checked on the free tier.
- **The first invocation has an extra block of audio.** It carries about 140-190 AUDIO tokens beyond the caller's first
  utterance, which then stays in context. This matches Meera's earlier finding that declaring `speechConfig.voiceConfig`
  adds about 201 audio tokens.
- **No cache discount.** `cachedContentTokenCount` was **never present** in 1,096 invocations.
- **2.5 native audio labels its history as TEXT.** By minute 10 the context holds about 14k TEXT tokens and 574 AUDIO
  tokens. Our cost uses the label, so history is billed at $0.50/1M.
  - If Google instead meters that history as audio input ($3/1M), 2.5 costs ₹2.5 (1 minute), ₹3.6 (3), ₹6.2 (5) and
    ₹14.1 (10) a minute.
  - This column is in `cost_by_length.csv`. **The 2.5 advantage rests on an unverified billing assumption.**
- **One user turn can bill several times.** Invocations exceed turns because a VAD false start (the model begins during a
  mid-sentence pause and is interrupted) produces its own `usageMetadata` and re-bills the whole context.

### 2.4 Where the money goes

Source: `results/cost_components.csv`, sandbox, ₹ per minute.

| call | system prompt | context audio | history text | output audio | thoughts | transcripts | total |
|---|---|---|---|---|---|---|---|
| 3.1, 1 min, off | 0.24 | 1.06 | 0.02 | 1.09 | 0 | 0.09 | 2.50 |
| 3.1, 10 min, off | 0.23 | **5.99** | 0.21 | 0.93 | 0 | 0.09 | 7.45 |
| 3.8, 1 min, off | 0.41 | 1.20 | 0.03 | 0.93 | 0.16 | 0.10 | 2.83 |
| 3.8, 10 min, off | 0.43 | **9.66** | 0.37 | 0.82 | 0.15 | 0.10 | 11.53 |
| 2.5, 1 min, off | 0.40 | 0.05 | 0.17 | 1.02 | 0 | 0.04 | 1.68 |
| 2.5, 10 min, off | 0.35 | 0.56 | **2.08** | 0.71 | 0 | 0.04 | 3.74 |

Agent speech was 20-41 seconds per connected minute. Output audio costs ₹1.71 per minute of agent speech, so it alone is
₹0.6-1.2 a minute. That is the whole AI budget before any context is re-billed.

### 2.5 Projection: lengths, compression and persona size

Computed from the fitted per-invocation parameters (`results/cost_projection.csv`, ₹ per minute). The fit reproduced the
measured uncompressed calls within -15% to +18%.

| model | persona | compression | 1 min | 3 | 5 | 10 | 15 |
|---|---|---|---|---|---|---|---|
| 3.1 | measured (727-token persona) | off | 2.5 | 3.6 | 5.2 | 8.3 | 11.9 |
| 3.1 | measured | trigger S+2k / target S+1k | 2.5 | 2.7 | 2.9 | 2.9 | 2.9 |
| 3.1 | Meera-size (13k) | off | 6.0 | 6.7 | 8.5 | 11.5 | 15.1 |
| 3.1 | Meera-size (13k) | trigger S+2k | 6.0 | 5.9 | 6.2 | 6.1 | 6.1 |
| 3.8 | measured | off | 3.1 | 4.8 | 7.0 | 11.7 | 16.7 |
| 3.8 | measured | trigger S+2k | 3.1 | 3.6 | 3.9 | 3.9 | 4.0 |
| 2.5 | measured | off | 1.4 | 1.8 | 2.2 | 3.4 | 4.6 |
| 2.5 | measured | trigger S+2k | 1.4 | 1.5 | 1.5 | 1.6 | 1.6 |

S is the first-invocation prompt.

**Floor** (computed: only the system prompt and the first-turn audio are re-billed, plus output audio and transcripts):

| model | floor ₹/min | breakdown |
|---|---|---|
| 3.1 | ≈ 1.6 | output 0.96 + prompt 0.57 + transcripts 0.09 |
| 3.8 | ≈ 1.9 | output 0.82 + prompt 0.84 + thoughts 0.16 + transcripts 0.10 |
| 2.5 | ≈ 1.1 | output 0.77 + prompt 0.33 + transcripts 0.04 |

### 2.6 Meera's ₹1.3 a minute, re-derived

- **The claim** (g1 archaeology): $0.0142 per minute, computed on 2026-08-23 from list prices, with the 44.8k-character
  system prompt billed once per connection.
- **Measured here** on Meera's model and settings (3.1, `thinkingBudget: 0`, Despina, hi-IN, VAD 300 ms / HIGH): ₹2.50 at
  1 minute and ₹3.84 at 3 minutes, with a 727-token persona.
- **With Meera's persona size**, the projection is ₹6.0 (1 minute), ₹6.7 (3) and ₹11.5 (10).
- **The gap** is the per-turn re-billing of the system prompt and of all past audio, which the claim left out.
- **Mitigation, and its limit.** Meera rotated to a fresh session on `goAway` without resumption. That resets the
  compounding about every 9-10 minutes, but it never brings cost below the floor.

### 2.7 The AI budget a ₹2 price leaves

Computed (`results/ai_budget.csv`): net revenue × (1 - gross margin) - telephony (₹0.38-0.48). Platform and hosting
overhead are not included.

| GST treatment | margin 40% | margin 50% | margin 60% |
|---|---|---|---|
| ₹2 includes 18% GST (net ₹1.695) | ₹0.54-0.64 | ₹0.37-0.47 | ₹0.20-0.30 |
| GST charged on top (net ₹2.00) | ₹0.72-0.82 | ₹0.52-0.62 | ₹0.32-0.42 |

**The cheapest measured Gemini Live call** (2.5, 1-3 minutes, ₹1.68-1.79) **is 2-8× this budget. 3.1 is 3-19×.**

**Price changes.** No change to Live pricing is announced on the 2026-10-18 page (g1). The 3.6-3.8 Flash text models and
3.8 TTS double on 2027-01-01 (g1 `prices.json`). Live is listed at the same $3 and $12 that Meera used in August.

---

## 3. Latency (V4)

Source: `results/latency_summary.csv` and `results/latency_by_script.csv`. Latency covers clean turns only: spoken turns
with no cut-in and a reply after end of speech. p50 and p90 are in ms, with call-clustered bootstrap 95% CIs (2,000
resamples of calls).

| vantage | model / configuration | VAD | calls | clean / spoken turns | p50 (CI) | p90 (CI) | share ≤ 1.2 s | cut-in (all spoken turns) | no reply | VAD end after end of speech, p50 | first audio after VAD end, p50 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| India | 3.8 + `thinkingBudget: 0` | meera | 4 | 26/54 | **819 (784-847)** | 1514 (1013-1537) | 85% | **52%** | 0% | 499 | 345 |
| India | 3.8 (default thinking) | meera | 6 | 52/79 | 1250 (1122-1428) | 1656 (1564-1802) | 44% | 34% | 0% | 519 | 606 |
| India | 3.8 | server | 2 | 19/24 | 1386 (1187-1942) | 2239 (1763-3218) | 47% | 21% | 0% | 1119 | 86 |
| India | 3.1 flash live | meera | 5 | 37/47 | 1970 (1949-2135) | 3214 (2793-5831) | 8% | 19% | 2% | 1359 | 625 |
| India | 3.1 | server | 2 | 13/17 | 2303 (2303-2688) | 7104 | 0% | 18% | 6% | 2039 | 266 |
| India | 2.5 (affective + proactive) | meera | 4 | 23/52 | 2977 (2029-5656) | 7604 | 17% | 48% | 8% | n/a | n/a |
| India | 2.5 | server | 2 | 12/29 | 2666 (1825-3297) | 5668 | 17% | 45% | 14% | n/a | n/a |
| India | 2.5, no flags | meera | 1 | 8/13 | 5052 | 8946 | 0% | 23% | 15% | n/a | n/a |
| sandbox | 3.8 | meera | 8 | 158/182 | 1409 (1346-1529) | 1974 (1828-2053) | 31% | 13% | 0.5% | 456 | 914 |
| sandbox | 3.8 + `thinkingBudget: 0` | server | 3 | 23/39 | 1434 (1408-2027) | 2698 | 17% | 31% | 10% | 1211 | 183 |
| sandbox | 3.8 | server | 1 | 10/13 | 1654 | 6660 | 20% | 15% | 8% | 1132 | 342 |
| sandbox | 3.1 | meera | 8 | 124/126 | 2026 (1959-2148) | 3832 (2408-4946) | 10% | 1% | 1% | 1306 | 672 |
| sandbox | 2.5 (affective + proactive) | meera | 8 | 138/167 | 2061 (1836-2285) | 3376 (2853-4249) | 14% | 5% | 12% | n/a | n/a |

Notes on the table:

- **"VAD end"** is decomposed from the server's `voiceActivity` `ACTIVITY_END` `audioOffset`, mapped to wall time through
  the connection's first frame. 2.5 sends no `voiceActivity` events.
- **3.1 is slow because its VAD is slow, even when tuned.** End-of-speech is declared 1.3 s after the caller stops, with
  `silenceDurationMs: 300`. A turn can then begin 0.6 s later.
- **3.8 declares end of speech in about 0.5 s** with meera VAD.
  - With default thinking it adds 0.6-0.9 s.
  - With `thinkingBudget: 0` it adds 0.35 s. Thought tokens fell from 74 to 0 per invocation. This is a same-window A/B:
    P1 p50 811 ms over 2 calls against 1,122 ms in the control.
  - On server VAD, 3.8 starts audio only about 86 ms after `ACTIVITY_END`. It is apparently generating before the server
    commits the turn.
- **Vantage.**
  - India against sandbox: 3.8 is 1.25 against 1.41 s; 3.1 is 1.97 against 2.03 s.
  - The model's serving location is not visible. The Agent Platform (Vertex) lists Live 3.8 only in the US and EU and in
    us-central1 (g1), so there is **no India region for Live**.
- **2.5 native audio is unstable on this battery.** Its input transcription and replies drift a turn behind the caller.
  Several "latencies" of 0-120 ms are replies the model started during the caller's speech. That held both with and
  without affective and proactive. Meera's code comment had already recorded 2.5 as slower and higher-variance than 3.1.
- **By persona** (India, meera VAD):
  - 3.8 default: P1 Hinglish 1,101 ms, elderly P4 1,488, PAUSE 1,558, worried W 1,354.
  - 3.8 `thinkingBudget: 0`: P1 811, P4 827.
  - 3.1: P1 1,964, P4 1,946.
- **Telephone leg.** Not measured. Round 2 assumed 0.25-0.45 s. Adding it, 3.8 + `thinkingBudget: 0` would be about
  1.07-1.27 s caller-perceived; default 3.8 1.5-1.7 s; 3.1 2.2-2.4 s.

---

## 4. Cut-ins and turn-taking

Source: `results/cutins.csv`. Rates are on spoken caller turns, with Wilson 95% intervals. Pause classes come from round
2's `clip_pauses.csv`.

| vantage | model | VAD | no pause ≥ 0.5 s | pause 0.5-0.9 s | pause 0.9-1.3 s | P4_t03 (2.42 s pause) |
|---|---|---|---|---|---|---|
| India | 3.8 + `thinkingBudget: 0` | meera | 0/25 | 8/8 | 14/15 (0.70-0.99) | 6/6 |
| India | 3.8 | meera | 0/36 | 0/7 | 16/20 (0.58-0.92) | 7/7 |
| India | 3.8 | server | 0/12 | 0/2 | 1/6 | 4/4 |
| India | 3.1 | meera | 0/19 | 1/7 | 2/10 | 5/5 |
| India | 3.1 | server | 0/8 | 0/2 | 0/4 | 3/3 |
| India | 2.5 | meera | 6/26 | 2/7 | 7/13 | 6/8 |
| India | 2.5 | server | 2/14 | 2/2 | 2/6 | 7/7 |
| sandbox | 3.8 | meera | 0/129 | n/a | 23/53 (0.31-0.57) | n/a |
| sandbox | 3.8 + `thinkingBudget: 0` | server | 1/15 | 1/7 | 4/10 | 6/7 |
| sandbox | 3.1 | meera | 0/88 | n/a | 1/38 | n/a |

- **The elderly 2.42 s pause was taken 44 times in 47 tries**, by every model under every VAD setting. In each case the
  agent began speaking 2.1-2.9 s into the clip.
- **Cut-ins depend on the vantage.** The same model and VAD cut in more often from India (3.8: 80% against 43% on
  0.9-1.3 s pauses). From India the agent's first audio lands before the caller resumes; through the US proxy the caller
  is often already talking again when it arrives. **The India number is the realistic one**, and it means the sandbox
  understates cut-ins.
- **Speed against politeness.**
  - `thinkingBudget: 0` makes 3.8 roughly 0.35 s faster and raises cut-ins. On elderly P4 turns they rose from 38% to 79%.
  - The server-default VAD lowers cut-ins on 3.8, to 7% on P1 and 1/6 on 0.9-1.3 s pauses, but costs 0.5-0.6 s of VAD
    wait. Its p50 is 1.39 s.
  - **No setting reaches both p50 ≤ 1.2 s and cut-ins ≤ 5%** on the Hinglish and elderly personas.
- **Cut-ins also cost money.** Each false start is an extra invocation that re-bills the whole context (§2.1).
- **Not measured: barge-in recovery quality.** That is whether the agent resumes sensibly after it is interrupted. The
  transcripts show restarts such as "इस बार का प्रीमियम चौबीसइस साल का प्रीमियम…". They are left for the listener panel.

---

## 5. Gate lag (V3)

Source: `results/gate_lag_summary.csv` and `results/gate_lag_responses.csv`. There are 892 agent responses.

**Method**

- The harness replays each call's message stream through a real-time player. Playback starts at the first audio chunk
  and runs without gaps unless the stream under-runs.
- Each output-transcript fragment is placed in the response audio by proportional character alignment. This is an
  approximation, good to about ±300 ms; word-level timestamps were not available.
- **lead** = when that audio offset plays - when the fragment's text arrived. A negative lead means the words were
  already audible when their text arrived.
- **clause gate** = the moment the first clause (first clause punctuation, or 6 words) is complete in text.

| vantage | model | responses | first text minus first audio, p50 / p90 | audio already played when the first clause is complete, p50 / p90 | words played by then, p90 | share of words whose text arrived after they began playing |
|---|---|---|---|---|---|---|
| India | 3.8 | 223 | 0 / 0 ms (same message) | 69 / 268 ms | 0.83 | 0.0% |
| India | 3.1 | 72 | -5 / 0 ms | 0 / 382 ms | 1.13 | 0.0% |
| India | 2.5 | 109 | **-448 / -344 ms (text first)** | 0 / 305 ms | 0.82 | 0.0% |
| sandbox | 3.8 | 204 | 0 / 0 ms | 38 / 275 ms | 0.90 | 0.0% |
| sandbox | 3.1 | 126 | -1 / 0 ms | 0 / 441 ms | 1.42 | 0.2% (worst hold needed: 704 ms) |
| sandbox | 2.5 | 158 | -581 / -329 ms | 0 / 376 ms | 1.11 | 0.0% |

**What this means**

- **A text gate is not structurally too late.** Transcript text arrives with the first audio, or before it.
- **Audio arrives in bursts much faster than real time**, so the text of later words is in hand well before those words
  play.
- **With no hold buffer, the first word or so plays before the first clause can be checked.** With about 0.5 s of hold,
  the gate sees the first clause before it is heard in p90 of responses on every model.
- **The cost is latency.** For 3.8 + `thinkingBudget: 0`, a 0.3-0.5 s hold moves p50 from 0.82 s to about 1.1-1.3 s, back
  to the round-2 cascade's speed.
- **An honesty side-check** (a regex on transcripts, not a rubric) on the "are you a robot / human" turns:
  - 3.8 disclosed being an AI in 32/32 turns;
  - 3.1 in 18/18;
  - 2.5 in 18/23, where the misses were turn-desync replies;
  - no reply claimed to be human.
- **Not measured.** The attack battery (wrong numbers, invented prices, denial of being an AI) and its violation rate
  remain for the safety lane. Neither the hybrid modes nor Live in text mode followed by TTS was tested.

---

## 6. Recordings for the listener panel

`samples/` holds stereo mp3s at 48 kbps: left the synthetic caller as sent, right the agent as a real-time player would
play it. They come from India VM runs with meera VAD and are not rated. `samples/manifest.csv` gives each file's
configuration and full agent transcript.

| file | scene | length |
|---|---|---|
| `g31-flash-live_worried-caller_meeravad_india.mp3` | worried caller (husband in hospital, renewal due) | 2.2 min |
| `g38-live_worried-caller_meeravad_india.mp3` | worried caller | 2.1 min |
| `g25-native-audio_worried-caller_meeravad_india.mp3` | worried caller | 2.1 min |
| `g31-flash-live_confused-elderly-caller_meeravad_india.mp3` | confused elderly caller (P4) | 3.0 min |
| `g38-live_confused-elderly-caller_meeravad_india.mp3` | confused elderly caller | 3.2 min |
| `g25-native-audio_confused-elderly-caller_meeravad_india.mp3` | confused elderly caller | 3.0 min |
| `g38-live_thinkingBudget0_confused-elderly-caller_meeravad_india.mp3` | confused elderly caller, fastest configuration | 3.0 min |

---

## 7. What could not be measured, and limitations

1. **Billing reconciliation.** Free-tier traffic produces no invoice. Every ₹ figure is `usageMetadata` × list price.
   Three items in g1's reading of the docs may bill differently from `usageMetadata`:
   - 3.8's proactive listening time;
   - 2.5's TEXT-labelled history;
   - transcription tokens.

   Confirming them needs a paid key and the billing export (owner action; the g5 lane may cover it).
2. **Free-tier quota refusals.**
   - 9 of 29 India session starts were refused with `1011 "You exceeded your current quota"`. All came between 18:41 and
     18:56 UTC, while 5-6 sessions were open at once on the project (sandbox and India together). All succeeded on
     retry after 30-210 s of back-off.
   - Two live calls were closed mid-call with the same 1011:
     - the 3.1 10-minute compressed call at 300 s, which resumed by session resumption in 659 ms;
     - the 3.1 10-minute uncompressed call during its `goAway` rotation at 549 s, which therefore ends at 9.15 minutes.
   - Limits are not published (AI Studio only), so the exact limit (concurrent sessions or tokens per minute) is unknown.
   - Nothing in the planned matrix was left unmeasured.
3. **Synthetic callers.** All callers are Azure neural TTS voices put through a simulated phone band. There was no real
   telephone leg and no real Indian handset. The noise was a -75 dBFS comfort floor only; P2's market noise and Tamil P3
   were not run.
4. **Sample sizes.**
   - The cost matrix has n=1 call per cell.
   - India latency rests on 2-6 calls per configuration (13-52 clean turns).
   - The 3.8 `thinkingBudget: 0` result comes from 4 India calls in one late-Saturday-night IST window.
   - Load at Indian business hours is untested.
5. **Gate-lag alignment.** Proportional, not word-timestamped. It can mis-place a fragment by about ±300 ms.
6. **Quality.** Human-likeness, warmth and behaviour are not scored here. The samples are for the panel.
   `thinkingBudget: 0` may change answer quality; that is unmeasured.
7. **Not run.**
   - `gemini-3.8-live-extended-thinking`;
   - Vertex AI / Agent Platform endpoints (no GCP project);
   - Live in text-output mode with TTS;
   - compression with Meera's default `slidingWindow: {}` (by the documented default trigger of 104.9k tokens it cannot
     fire in calls under 15 minutes; g1);
   - 3.8 with server VAD and `thinkingBudget: 0` from India (only the sandbox: 1.43 s).

---

## 8. Predictions scored (register of 2026-10-18)

| id | prediction | outcome | evidence |
|---|---|---|---|
| V1a | 3-minute 3.1 Live call costs more than ₹1.3 a minute of AI | **held** | ₹3.84 (sandbox, off) and ₹3.48 (on); India 2-3-minute calls ₹3.15-4.75; median ₹3.75 (n=9) |
| V1b | 10-minute call is at least 1.5× per minute the 1-minute call, without compression | **held** | 3.1 ×3.0; 3.8 ×4.1; 2.5 ×2.2 |
| V1c | with compression on, the 10-minute per-minute cost is within 1.3× of the 1-minute cost | **failed** (as configured) | trigger 6k / target 3k: 3.1 ×2.3, 3.8 ×2.9, 2.5 ×1.6. A projected tight window (S+2k) gives ×1.1-1.3, but that setting was not measured |
| V2a | cheapest Gemini path fits ₹1.0 a minute at 3-minute calls | **failed for Live** | cheapest Live measured is 2.5 at ₹1.71; floor about ₹1.1. The flash-lite cascade + Gemini TTS half was not tested here (g3) |
| V4a | from a Central India VM, Gemini Live p50 is at most 1.2 s | **held only for 3.8 + `thinkingBudget: 0`** | 0.82 s (CI 0.78-0.85, n=26 turns / 4 calls). Default 3.8 is 1.25 s (CI 1.12-1.43), 3.1 1.97 s, 2.5 2.7-3.0 s. As registered (for "Gemini Live", Meera's 3.1): **failed** |
| V4b | Gemini Live p50 is below the round-2 cascade's 1.0 s | **held only for 3.8 + `thinkingBudget: 0`** (0.82 s) | that configuration cuts in on 52% of turns; every other configuration is slower than 1.0 s |
| V3a | the output transcript arrives after the first audio chunk on most turns | **failed** | 0% of 892 responses. The text arrives in the same message (3.x) or 0.34-0.58 s earlier (2.5) |
| V5a | at least one non-Gemini stack costs less AI per minute than Gemini Live | held against 3.x Live; not against 2.5 | round-2 India cascade ₹2.29-2.76 a minute (SYNTHESIS-v2 ECO-12) against 3.1 ₹3.75 and 3.8 ₹5.35 at 3 minutes; 2.5 is ₹1.72 |
| V7a | the Live models are preview or recently released, with no deprecation-free guarantee beyond 12 months | held (from g1's sources) | 3.1 flash live is a legacy preview with earliest shutdown 2026-11-17; 2.5 native audio is a preview with the same date; 3.8 Live went GA on 2026-09-15 and its Agent Platform retirement is "2027-09-25 or later", about 11 months away |

**Kill conditions**

- **V1** (5-minute paid cost above the AI budget): **met**. ₹2.1-6.9 a minute against ₹0.2-0.8.
- **V4** (p50 above 1.2 s, or a cut-in rate above 5% on the elderly and Hinglish personas): **met** for every Gemini Live
  configuration. The fast one fails on cut-ins; the polite ones fail on p50.

---

## 9. Spend and resources

| item | amount |
|---|---|
| Gemini | free tier, `GEMINI_TEST_KEY` only. About 105 Live sessions (54 scripted calls, 13 smoke calls, 27 setup probes, plus retries), 9 `countTokens` calls, 1 `models.list` call. Paid-price equivalent of the scripted calls: about ₹974 (~$10.2) |
| OpenRouter | $0. Key usage read at $0.062 total, from other lanes |
| Azure | about ₹4.3, logged in `vp-spend.jsonl` before spending and reconciled after |

Azure breakdown: `Standard_D2als_v6` for about 0.6 h, a Standard public IP for about 0.9 h, a 30 GB StandardSSD disk, and
439 neural TTS characters for the worried-caller scene.

**Resources** (`results/resources-created.csv`), all deleted with 404 verified at about 19:09 UTC:

- VM `g2-vm-cin`, disk `g2-osdisk`, NIC `g2-nic`, IP `g2-ip`, vnet `g2-vnet` and NSG `g2-nsg`;
- the transfer container `vpresearchraw1017/g2-transfer`.

Resources tagged g3-* and g5-* belong to other lanes and were not touched.

**Two provisioning problems:**

- B-series sizes are `NotAvailableForSubscription` in centralindia.
- Seven v7 sizes failed allocation for capacity, at no charge.

---

## 10. Files

All paths are under `/home/user/sales-enabler/research/2026-10-18/lanes/g2-gemini-live-measured/`.

- **`harness/`**
  - `live_call.py`: the Live client and call simulator.
  - `matrix.py`: the plan runner, with back-off.
  - `analyze.py`: produces the cost, latency, cut-in and gate CSVs.
  - `cost_model.py`: the fit, projection and budget.
  - `calib_tx.py`, `make_samples.py`, `netprobe.py`, `render_worried.py`.
  - `vm_ops.py`: ARM VM lifecycle and Run Command; secrets are read at runtime.
  - `persona.txt`.
  - the plans: `plan_*.json`.
  - `audio_phone16k/`: the phone-band 16 kHz caller clips, including the new `W_t01`-`W_t08`.
- **`results/`**
  - `cost_by_length.csv`, `cost_components.csv`, `cost_projection.csv`, `cost_fit_params.csv`, `ai_budget.csv`;
  - `calls_cost.csv`, `token_growth.csv`, `token_growth_by_minute.csv`;
  - `turns.csv`, `latency_summary.csv`, `latency_by_script.csv`, `cutins.csv`;
  - `gate_lag_summary.csv`, `gate_lag_responses.csv`;
  - `transcript_token_calibration.json`, `resources-created.csv`;
  - `calls/<tag>/{meta.json, turns.jsonl, usage.jsonl}` and the plan logs.
- **`samples/`**: 7 mp3s and `manifest.csv`.
- **Raw data** (full message streams and call WAVs) in the scratchpad:
  `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw-1018/g2-gemini-live-measured/`.
  It also holds the archived pricing, rate-limit and Live-guide pages fetched on 2026-10-18.
- **`findings.md` is not on disk.** The harness refused the Write, so this text must be saved there by the coordinator.
