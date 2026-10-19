<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused the file write). -->

# g3-cascade-measured: India-hosted cascades, latency and cost per connected minute

Lane g3 of the VP voice-stack research (owner directive 2026-10-18). Finished on 2026-10-19 after a container restart.

**Where the numbers come from**
- **Measurements.** All of them were taken on 2026-10-18 between 19:11 and 19:51 UTC (00:41-01:21 IST), outside Indian business hours. The host was a Central India VM (Standard_D4s_v5). There was no telephone leg and no playback.
- **The VM.** The coordinator deleted the VM and every g3 Azure resource after the restart, and this run created none.
- **This run.** It worked only from the raw rows pulled back from the VM. They are byte-identical to the blob copy.
- **Re-derivation.** `harness/rederive.py` recomputes the metrics independently of `analyze.py`. Its latency results match the pre-restart analysis on every checked metric (`results/rederived_check_vs_pre_restart.csv`: 0 mismatches).
- **FX:** ₹95 per US dollar.
- **The write-up.** The harness refused the findings.md write, so the full text is here.

## Summary

- **Fast cascades give a reply in about 1.0-1.1 s from India.** The time runs from the caller's end of speech to the first agent audio.
  - Four configurations reach a p50 of 1,026-1,133 ms, with p90 at 1,143-1,404 ms.
  - Each uses Azure STT or gemini-3.5-transcribe-live, then gpt-4.1-mini or gpt-oss-120b on Groq, then Azure neural or DragonHD TTS.
  - This repeats round 2's 1.0 s.
- **A Gemini LLM adds about 0.5 s.** gemini-3.5-flash-lite takes about 0.8 s to its first token from India, so p50 rises to 1,568-1,688 ms.
- **Gemini TTS makes a cascade too slow.** It was not measured end-to-end, because the free tier allows 10 TTS requests a day. The computed figures use g5's paid-tier first-byte times from India: p50 1.84 s at best (Azure STT + gpt-oss + 3.8-flash-lite-tts) and 2.5-2.8 s all-Gemini. No configuration meets 1.2 s.
- **Every cascade fails the V4 cut-in clause.**
  - In the elderly caller's 2.42 s mid-sentence pause, every configuration started talking: 12 of 12 times, 0.94-1.58 s into the pause.
  - On ordinary turns, the fast configurations cut in on 15-32% of turns, all of them turns with an internal pause of 0.7 s or more.
  - The cause is the 500 ms end-of-turn rule, not the provider.
  - gpt-oss-120b used its pause turns well: 18 of 18 were a short "please go on" prompt. gpt-4.1-mini answered the half-asked question 30 of 30 times.
- **Cost per connected minute, AI only, list price** (3-minute reference call; caller and agent each speak 24 s, 5 exchanges a minute):
  - all-Azure C1: ₹2.19;
  - with DragonHD: ₹2.66-2.70;
  - transcribe-live + gpt-oss + Azure neural (C6): ₹1.19;
  - the same with VAD-gated STT: **₹0.89**, the cheapest stack measured end-to-end;
  - all-Gemini with flash-lite TTS: ₹1.56, rising to ₹1.92 at the 2027 TTS price.
  - Gemini Live, from g5, costs ₹4.19-5.72 for a 3-minute call.
  - Cascade cost barely grows with call length: a 10-minute call costs 1.05-1.15 times a 1-minute call per minute. Gemini Live without compression costs 3.8-4.4 times.
- **What a ₹2 price allows.** After GST treatment, telephony (₹0.38-0.48) and a 40-60% gross margin, the AI budget is ₹0.20-0.82 a minute. The central case is **₹0.57**: price ex-GST, 50% margin, ₹0.43 telephony.
  - No stack measured here fits ₹0.57 at pay-as-you-go prices.
  - With commitment tiers that need about 10 million minutes a month, the computed floor is ₹0.67-0.75, and those voices are non-expressive.
  - An expressive voice adds ₹0.16 (DragonHD) or ₹0.06 (Gemini flash TTS) a minute against Azure neural for the same text. From 2027 the Gemini figure is ₹0.46.
  - So **₹2 a minute with expressive voice and a 50% margin does not close on managed services today.** It needs some mix of a lower margin, a price of about ₹2.5-3, cheaper STT (self-hosted, lane g4) or commitments at scale.
- **Samples.** There are 27 matched expressive samples for the listener panel, all rendered from the sandbox: 6 lines × Gemini 3.8-flash-tts, DragonHD Aarti, DragonHD OmniIndic Diya and MAI-Voice-2.1 Kavya, plus 3 of 6 lines on 3.8-flash-lite-tts. The free-tier daily cap blocked the other 3. None are rated.

## 1. What ran, and what is complete

The configurations are defined in `harness/cascade3.py`. Turn completeness is in `results/config_status.csv`.

| config | STT | LLM | TTS | status |
|---|---|---|---|---|
| C1 | Azure real-time hi-IN, centralindia, 500 ms segmentation | gpt-4.1-mini, Azure South India Standard | Azure neural hi-IN-SwaraNeural, WebSocket, clause-streamed | complete: 60 main turns + 12 pause repeats |
| C2 | Azure | gpt-4.1-mini | Azure DragonHD en-IN-Aarti | complete |
| C3 | Azure | gpt-oss-120b on Groq via OpenRouter, reasoning low | DragonHD Aarti | complete |
| C6 | gemini-3.5-transcribe-live, free tier, 500 ms hybrid VAD | gpt-oss-120b on Groq | Azure neural Swara | complete |
| C7 | Azure | gemini-3.5-flash-lite, free tier, thinking minimal | Azure neural Swara | complete; 1 turn lost to a free-tier 429 |
| C8 | transcribe-live | gemini-3.5-flash-lite | Azure neural Swara | complete; 1 turn lost to a 429 |
| C1+gated, C6+gated | the same, with STT audio sent only around caller speech | | | partial: 1 pass, 30 turns + 6 pause repeats (validation) |
| C4: Azure STT + flash-lite + 3.8-flash-lite-TTS | | | | **not run**: free-tier TTS cap of 10 requests a day (429 on smoke turns, `runlogs/smoke1.out`) |
| C5: all-Gemini with 3.8-flash TTS | | | | **not run**; computed composites below |

**Caveats**
- **Battery.** Personas P1 (urban Hinglish), P2 (Bhojpuri-Hindi with market babble) and P4 (elderly slow Hindi) are synthetic Azure voices. Each persona has 10 timed clips per pass, 2 passes, giving 6 call clusters per configuration.
- **Not run.** P3 (Tamil-English) was not run, because the STT locale was hi-IN.
- **Concurrency.** C1, C2, C3, C6 and C7 ran at the same time on one 4-vCPU VM. C8 ran alone.
- **Free tier.** Gemini LLM and transcribe-live latency is free-tier latency. g5 found no reliable paid-versus-free difference for Live from India, but generateContent was not compared.

## 2. Latency: caller end of speech to first agent audio byte (ms)

Vantage: Central India VM. Intervals are 95% bootstraps clustered by call (6 calls; 3 for the gated runs). Source: `results/rederived_latency.csv`.

| config | answered | p50 (CI) | p90 (CI) | ≤1.2 s | clean-turn p50 | cut-ins, main turns (Wilson CI) | elderly pause cut-ins |
|---|---|---|---|---|---|---|---|
| C1 Azure / 4.1-mini / neural | 58/60 | 1,026 (1,017-1,035) | 1,143 (1,099-1,277) | 95% | 1,034 | 16/60 (17-39%) | 12/12 |
| C2 Azure / 4.1-mini / DragonHD | 58/60 | 1,133 (1,118-1,140) | 1,231 (1,177-1,233) | 83% | 1,119 | 9/60 (8-26%) | 12/12 |
| C3 Azure / gpt-oss@Groq / DragonHD | 57/60 | 1,044 (1,029-1,077) | 1,230 (1,098-1,382) | 86% | 1,088 | 16/60 (17-39%) | 12/12 |
| C6 transcribe-live / gpt-oss / neural | 60/60 | 1,031 (1,010-1,052) | 1,404 (1,121-1,540) | 82% | 1,067 | 19/60 (21-44%) | 12/12 |
| C7 Azure / 3.5-flash-lite / neural | 56/60 | 1,568 (1,514-1,602) | 1,790 (1,679-1,920) | 0% | 1,500 | 2/60 (1-11%) | 12/12 |
| C8 transcribe-live / 3.5-flash-lite / neural | 59/60 | 1,688 (1,654-1,718) | 1,789 (1,770-1,796) | 0% | 1,657 | 2/60 (1-11%) | 12/12 |
| C1 + gated STT | 28/30 | 989 (967-994) | 1,072 (1,048-1,103) | 100% | 968 | 9/30 | 6/6 |
| C6 + gated STT | 30/30 | 1,038 (990-1,163) | 1,453 (1,298-1,557) | 60% | 1,241 | 7/30 | 6/6 |

**Unanswered turns**
- Azure STT never transcribed the quiet elderly "हम्म…" (P4_t08): 9 of 9 passes across the Azure-STT configurations. It missed P2's "हँ।" in 3 of 9.
- transcribe-live caught both, 5 of 5.
- The remaining gaps are one free-tier 429 each in C7 and C8.

**Stages** (medians, `results/rederived_latency_stages.csv`)

| stage | Azure STT | transcribe-live | notes |
|---|---|---|---|
| STT final after end of speech | 640-662 ms | 753-771 ms | |
| LLM time to first token | | | gpt-oss on Groq 208 ms; gpt-4.1-mini 301-308 ms; gemini-3.5-flash-lite 794-824 ms |
| TTS first byte | | | Azure neural 29-48 ms; DragonHD 160-164 ms. Pooled warm WebSockets and a short first clause, against 107-113 ms and 169-302 ms in the sentence bench |

- **The LLM decides the speed tier.** The Central India LLM bench (n = 30 per arm, `results/llm_india_summary.csv`) gives these p50 times to first token:
  - gpt-oss-120b on Groq: 253 ms;
  - gpt-4.1-mini on South India Standard: 526 ms;
  - gpt-oss-120b on Cerebras: 642 ms;
  - Gemini flash-lite models: 743-899 ms, whether direct or via OpenRouter;
  - deepseek-v4-flash on DeepInfra: 1,258 ms;
  - gemini-3.8-flash: 3,279 ms.
  - qwen3.7-flash on Alibaba returned no content in 30 of 30 calls.
- **Gated STT is safe with Azure** (989 against 1,026 ms). It may hurt transcribe-live: the clean-turn p50 was 1,241 against 1,067 ms, but with n = 15 the CI is wide.

**Cut-ins** (`results/rederived_latency_by_persona.csv`, `results/rederived_pause_cutins.csv`, `results/rederived_pause_reply_kind.csv`)
- **Where they happen.** Every main-turn cut-in fell on a clip with an internal pause of 0.72-2.42 s: 30 of the 60 turns. Clean turns had 0 cut-ins in every configuration.
- **By persona,** for the fast configurations C1, C3 and C6:
  - P1 Hinglish: 3-5 of 20 (15-25%);
  - P2: 8 of 20 (40%);
  - P4 elderly: 3-8 of 20 (15-40%).
  - The V4 kill line is 5%.
  - C7 and C8 cut in less (P1 0 of 20, Wilson upper 16%) only because they are slower.
- **The 2.42 s pause in P4_t03.** The fast configurations started talking a median 0.94-1.09 s into the pause, and C7 and C8 at 1.52-1.58 s. All answered again after the true end of the question.
- **What the agent said in the pause.** This was classified by pattern on the first 80 characters, n = 12 per configuration:
  - gpt-oss-120b: a short "कृपया आगे बताइए?" in 18 of 18 cases, which follows the prompt's "unfinished → prompt to continue" rule;
  - gpt-4.1-mini: a substantive answer to the half-asked question in 30 of 30;
  - flash-lite: 21 of 24 substantive.

**Gemini TTS cascades (computed, not measured end-to-end)** (`results/composite_gemini_tts_latency.csv`)
- **Method.** Take the measured per-turn time from end of speech to "LLM done" (or to the first clause), then add an independent draw of g5's paid-tier first-byte time from India: 3.8-flash-lite-tts n = 40, p50 857 ms; 3.8-flash-tts n = 40, p50 1,094 ms. The figures exclude Gemini's 0.14-0.36 s of leading silence.

| design | p50 (CI) | p90 | first clause sent alone (lower bound) |
|---|---|---|---|
| G-D Azure STT + gpt-oss@Groq + flash-lite-TTS | 1,842 (1,782-1,901) | 2,180 | 1,752 |
| G-E transcribe-live + gpt-oss + flash-lite-TTS | 1,978 (1,922-2,024) | 2,405 | 1,897 |
| G-F Azure STT + gpt-oss + flash-TTS | 2,052 (1,994-2,118) | 2,388 | 1,972 |
| G-C Azure STT + 3.5-flash-lite + flash-lite-TTS | 2,413 (2,362-2,468) | 2,708 | 2,388 |
| G-A all-Gemini lite | 2,532 (2,498-2,566) | 2,722 | 2,505 |
| G-B all-Gemini, flash-TTS | 2,755 (2,699-2,791) | 2,972 | 2,729 |

- **No design answers within 1.2 s on any turn** (0% ≤ 1.2 s). The slowness moves some pause cut-ins past the caller's resumption (`composite_gemini_tts_pause_counterfactual.csv`, low confidence): G-A 5 of 12, G-B 0 of 12, gpt-oss designs 11-12 of 12. That is avoidance by being slow, not a fix.

## 3. Cost per connected minute (₹, AI only, paid list price)

**Method**
- **Usage.** Measured usage per exchange (`results/rederived_usage_per_exchange.csv`) is multiplied by list prices: `results/cost_inputs.csv`, re-read on 2026-10-19 in `results/price_reread_2026-10-19.csv`, and Gemini prices from `g1-gemini-desk/prices.json`.
- **Billed LLM work.** The cascade fires about 1.85 LLM requests per turn, because superseded streams are billed. The billed prompt is 1.78-1.86 times the used prompt.
- **Imputed usage.** Prompts of cancelled streams were imputed: 19-50 per configuration.
- **Cached share,** as measured: Azure 94%, Groq 82-85%, Gemini 0% on the free tier.
- **History** grows by 36-70 prompt tokens per exchange.
- **Cross-check.** OpenRouter's own `usage.cost` equals tokens × list price exactly (ratio 1.000 on 255 responses).
- **Call shapes.** Rows use the reference shape. The battery-measured shape is in `results/rederived_cost_per_min.csv`; in it the agent talks 57-73% of the time, TTS costs more, and C6 + gated comes to ₹0.93 at 3 minutes.

| stack | kind | 1 min | 3 min | 5 min | 10 min |
|---|---|---|---|---|---|
| C1 Azure STT + gpt-4.1-mini + Azure neural | measured | 2.16 | 2.19 | 2.22 | 2.29 |
| C1 + gated STT | measured (1 pass) | 1.33 | 1.36 | 1.39 | 1.46 |
| C2 Azure + gpt-4.1-mini + DragonHD | measured | 2.67 | 2.70 | 2.73 | 2.81 |
| C3 Azure + gpt-oss@Groq + DragonHD | measured | 2.63 | 2.66 | 2.69 | 2.75 |
| C6 transcribe-live + gpt-oss + neural | measured | 1.16 | 1.19 | 1.21 | 1.28 |
| **C6 + gated STT** | measured (1 pass) | **0.88** | **0.89** | **0.91** | **0.95** |
| C7 Azure + 3.5-flash-lite + neural | measured | 2.41 | 2.46 | 2.50 | 2.62 |
| C8 transcribe-live + 3.5-flash-lite + neural | measured | 1.46 | 1.51 | 1.55 | 1.67 |
| G-A all-Gemini lite (2026 / 2027 TTS price) | computed | 1.51 / 1.88 | 1.56 / 1.92 | 1.60 / 1.97 | 1.72 / 2.09 |
| G-B all-Gemini, flash-TTS (2026 / 2027) | computed | 1.69 / 2.24 | 1.74 / 2.28 | 1.78 / 2.33 | 1.90 / 2.45 |
| G-D Azure STT + gpt-oss + flash-lite-TTS | computed | 2.12 | 2.15 | 2.17 | 2.24 |
| G-E transcribe-live gated + gpt-oss + flash-lite-TTS (2026 / 2027) | computed | 0.92 / 1.28 | 0.94 / 1.31 | 0.97 / 1.34 | 1.03 / 1.40 |
| L-1 C6 gated + Azure neural 2,000M-char commitment | computed lever | 0.73 | 0.75 | 0.78 | 0.84 |
| L-2 Azure STT 100K-h commitment, gated + gpt-oss + neural commitment | computed lever | 0.65 | 0.67 | 0.70 | 0.76 |
| Gemini Live 3.1-flash-live, compression off / on (g5) | measured, paid | 2.47 / 2.55 | 4.71 / 4.19 | 6.85 / 5.34 | 10.74 / 6.38 |
| Gemini Live 3.8-live, compression off / on (g5) | measured, paid | 3.31 / 3.34 | 5.72 / 5.72 | 8.05 / 7.94 | 12.70 / 9.05 |

**What drives it, for a 3-minute call**
- **STT is the biggest line.** Azure real-time STT streamed for the whole call costs ₹1.58 a minute, 72% of C1.
  - transcribe-live costs ₹0.64, or ₹0.38 gated.
  - Gating sends 1.19 seconds of audio per second of caller clip (measured).
  - If transcription text is billed at Google's published $0.004/min instead of our counted tokens, C6 rises to ₹1.42 (row U-1).
- **LLM:** gpt-oss on Groq ₹0.18-0.20; gpt-4.1-mini ₹0.26; gemini-3.5-flash-lite ₹0.55, because no cache hits were seen on the free tier.
  - gpt-oss on DeepInfra lists $0.037 / $0.17 per 1M tokens, which would make about ₹0.08. That is untested: its latency from India was not measured, and DeepInfra's llama-3.3 was 2.6 s p50.
- **TTS for the same text** (240 characters of agent text a minute, `results/tts_cost_equal_content.csv`):

  | TTS | ₹ per minute |
  |---|---|
  | Azure neural, pay-as-you-go | 0.34 |
  | Azure neural, 2,000M-character commitment | 0.17 |
  | DragonHD | 0.50 |
  | Gemini 3.8-flash-lite-TTS | 0.33 (0.65 from 2027-01-01) |
  | Gemini 3.8-flash-TTS | 0.40 (0.80 from 2027) |

  These Gemini figures use the speaking rate measured on our matched samples: 11.4 and 14.0 characters a second, n = 3 and n = 6.
- **Gemini TTS in 2026.** It is about cost-neutral against Azure neural, but it costs about 0.8 s of latency. From 2027 it also costs ₹0.3-0.45 a minute more.
- **Scale for the levers.** L-1 and L-2 need a $15,000-a-month TTS commitment and, for L-2, a $40,000-a-month STT commitment. That is roughly 10 million or more connected minutes a month.

**AI budget at a ₹2 price** (`results/ai_budget.csv`)

| price treatment | 40% margin | 50% margin | 60% margin |
|---|---|---|---|
| ex-GST | ₹0.72-0.82 | ₹0.52-0.62 | ₹0.32-0.42 |
| GST-inclusive | ₹0.54-0.64 | ₹0.37-0.47 | ₹0.20-0.30 |

- Each range covers telephony of ₹0.38-0.48.
- Platform hosting is not included.
- The cheapest stack measured end-to-end (₹0.89) fits only if the price is ₹2.6 or more ex-GST at a 50% margin, or ₹2.2 at 40%.

## 4. Side by side with Gemini Live (g5, paid tier, Central India VM)

`results/side_by_side_g5.csv`

| stack | p50 / p90 (ms) | talks over the caller | elderly pause | ₹/min at 3 / 10 min | text gate before audio |
|---|---|---|---|---|---|
| Fast cascades (C1, C3, C6) | 1,026-1,044 / 1,143-1,404 | 16-19 of 60 | 12/12 | 1.19-2.66 / 1.28-2.75 | yes, every clause |
| Cascade C6 + gated | 1,038 / 1,453 | 7 of 30 | 6/6 | 0.89 / 0.95 | yes |
| Gemini-TTS cascades (computed) | 1,842-2,755 / 2,180-2,972 | not measured | see the counterfactual | 0.94-2.15 / 1.03-2.24 | yes |
| Gemini Live 3.8 (g5) | 1,006 / 1,524 | 22 of 53 | 8/8 | 5.72 / 9.05-12.70 | the transcript arrives with the first audio; a gate needs a buffer |
| Gemini Live 3.1 (g5) | 1,950 / 5,299 | 4 of 37 | 6/6 | 4.19-4.71 / 6.38-10.74 | same |

- **On latency,** the fast cascades tie Gemini Live 3.8 and beat 3.1 by about 0.9 s.
- **On cost,** they are 1.6-6.4 times cheaper at 3 minutes and 2.3-13 times cheaper at 10 minutes.
- **Both fail turn-taking:** every stack replied into the elderly caller's pause.
- **Turn rates differ.** g5's costs come from its own scripted calls, at 3.7-7.3 billed turns a minute. Compare them by call length, not exchange for exchange.

## 5. Expressive samples (for the listener panel; not rated)

`samples/` holds 27 mp3 files (64 kbps mono, 1.6 MB in total). `samples/manifest.csv` records engine, voice, style, text, duration, tokens and a new `render_vantage` column. All were rendered from the **sandbox**, so they support no latency claim.

- **The six lines.** Worried, confused elderly, angry, relieved, celebratory and rushed, in Devanagari Hindi with English words.
- **Engines:**
  - gemini-3.8-flash-tts, voice Despina, with a `speech_metadata.style` prompt: 6 lines;
  - Azure DragonHD en-IN-Aarti and hi-in-diya OmniIndic, which has no style control and infers emotion from the text: 6 lines each;
  - Azure MAI-Voice-2.1 Kavya with `mstts:express-as` styles: 6 lines;
  - **gemini-3.8-flash-lite-tts: L1-L3 rendered 2026-10-19.** L4-L6 returned 429 ("limit: 10 requests per day on Free Tier... retry in 20h35m"), so they can be retried after about 2026-10-20 00:05 UTC with the same key. No other key was used.
- **Levels.** All samples are audible (mean −14 to −31 dB). L5 on DragonHD OmniIndic is quiet (mean −30.8 dB) and should be loudness-normalised before the panel.
- **Speaking rate:** DragonHD Aarti 15.3 characters a second, OmniIndic Diya 13.5, Gemini flash 14.0 (range 8.3-25 by style), Gemini lite 11.4, MAI 11.9.

## 6. Predictions this lane bears on

| id | outcome | evidence |
|---|---|---|
| V2a | **failed** | The cheapest flash-lite cascade with Gemini TTS (G-A) costs ₹1.56 a minute at 3 minutes (₹1.92 at 2027 prices), and Gemini Live ₹4.19-5.72. It reaches about ₹0.87 only with two unmeasured levers: paid-tier cache hits of 90% or more, and gated STT (`cost_levers.csv`). |
| V5a | **held** | All-Azure C1 costs ₹2.16-2.29 at 1-10 minutes against Gemini Live 3.1 at ₹2.47-10.74, and C6 + gated ₹0.88-0.95. |
| V4b | **failed** (cascade side) | Cascade C1 re-measured at 1,026 ms (1,017-1,035). Live 3.8 at 1,006 (950-1,253) overlaps it, and Live 3.1 is slower at 1,950. |
| V4 kill, for cascades | **killed** on cut-ins | Pause 12/12 in every configuration, and 15-25% on P1 Hinglish in the fast configurations. The p50 clause passes for C1, C2, C3 and C6 and fails for C7 and C8 and every Gemini-TTS design. |

## 7. Spend

- **This resumed run:**
  - OpenRouter $0. The key showed $0.176805 used both before (03:23Z) and after (03:35Z), so about $5.82 of the $6 programme cap remains.
  - Azure ₹0. Only free reads were made: the Retail Prices API, Cost Management and the resource list.
  - Gemini: 4 free-tier TTS requests on synthetic text (3 succeeded, 1 returned 429).
- **The lane in total:**
  - OpenRouter: $0.177.
  - Azure: Cost Management shows ₹272.2 for the g3 resources on 2026-10-18 (g3-cin ₹254.6, g3-sin ₹7.8, VM ₹8.1, disk and IP ₹1.6). The ledger estimate had been ₹860. Billing can lag, so this may rise.
  - The whole of vp-research-rg from 2026-10-16 to 2026-10-19 shows ₹2,381.6 (about $25).
  - Resource group check (2026-10-19): only vp-research-ai-sea, vp-research-ai-frc and vpresearchraw1017 remain.

## 8. Blocked or not measured

- **Gemini-TTS cascades.** C4 and C5 were not run end-to-end because of the free-tier TTS cap and the no-new-compute instruction. They appear only as computed composites.
- **Paid-tier Gemini LLM and transcribe-live latency,** and paid-tier implicit cache hits for 3.5-flash-lite.
- **Coverage gaps:** the P3 Tamil-English persona, a telephone leg, Indian business-hours load, and the gemini-3.8-flash-lite-tts samples L4-L6.
- **Human-likeness** of any stack. The samples are only ready for the panel.
- **The time to substantive content.** The latency measured is the first-clause acknowledgement.
- **gpt-oss on DeepInfra.** Its latency from India is not measured; only its price was read.

## Files

All paths are under `research/2026-10-18/lanes/g3-cascade-measured/`.

- **Harness:** `harness/` holds `cascade3.py`, `backends.py`, `analyze.py`, `levers.py`, `samples.py` (now writes `render_vantage`), and **`rederive.py`**, which is new in this run.
- **Re-derived results** (`results/`):
  - `rederived_latency.csv`, `rederived_latency_stages.csv`, `rederived_latency_by_persona.csv`, `rederived_pause_cutins.csv`, `rederived_pause_reply_kind.csv`, `rederived_check_vs_pre_restart.csv`;
  - `composite_gemini_tts_latency.csv`, `composite_gemini_tts_pause_counterfactual.csv`;
  - `rederived_usage_per_exchange.csv`, `rederived_cost_per_min.csv`, `rederived_openrouter_crosscheck.csv`;
  - `tts_cost_equal_content.csv`, `ai_budget.csv`, `side_by_side_g5.csv`, `config_status.csv`, `price_reread_2026-10-19.csv`, `rederive_output.txt`.
- **Original results:** the raw `casc_turns_*` and `casc_resp_*` files, the pre-restart summaries, `cost_inputs.csv`, `cost_levers.csv`, `openrouter_usage.jsonl`, and `samples/`.
- **Raw copies:** the scratchpad folder `research-raw-1018/g3-cascade-measured/`, which holds `blob-recovered/`, `bundle-x/audio8k/` (the battery audio as played) and `price-reads-1019/`.
