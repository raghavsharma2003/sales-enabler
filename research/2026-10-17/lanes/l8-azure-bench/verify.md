# l8-azure-bench: adversarial verification

Verifier pass, 2026-10-17. I re-derived every number I could from the lane's raw files (`results/*.csv`, `stimuli/manifest.csv`, `cost-inputs.json`, `harness/*.py`, and the raw scratch dir the harness names). I checked prices and facts against primary sources the lane did not cite: the Azure pricing-calculator API, the Azure Retail Prices API (queried live), Microsoft Learn pages, ECB reference FX via Frankfurter, and NCBI for the turn-taking baseline.

**Limit on this pass:** WebSearch was unavailable, because the shared per-turn search budget had run out. External checks therefore used WebFetch, direct API calls and known primary URLs. I found no independent public benchmark of these specific Azure engines on Indian telephone audio, so the ASR, TTS and latency numbers stand or fall on the lane's own data and method, which I audited.

## Verdict table

| # | Claim (short) | Verdict | One-line reason |
|---|---|---|---|
| 1 | MAI-Transcribe-2 lowest WER on every Indian set at phone band; pooled Kathbath 15.1 / 18.1 / 18.0 / 30.2 / 30.2; phone band costs at most ~2 points | **weakened** | The pooled numbers reproduce exactly. "At most ~2 points" is false per set: real-time Bengali +3.5, gpt-4o Marathi +5.4, gpt-4o NPTEL +7.3. On Marathi and code-switched audio, MAI-2's lead is inside the CI. |
| 2 | gpt-4o-transcribe invents text on non-speech: 29/49 phone band, 24/49 wideband; Azure engines 0/49 | **weakened** | The counts reproduce, but 12/29 and 10/24 are sound labels such as "[Dial tone]", "[Laughter]", "Beep" or "Achoo!". Invented words are about 17/49 and 14/49. gpt-4o ran with no language hint, while the Azure engines were pinned to hi-IN. |
| 3 | Pin the language: Azure LID labelled Kathbath Hindi as Marathi (14/60, WER 41%); gpt-4o 16/32 and mini 14/32 on short answers; pinned engines 30–32/32 | **weakened** | All counts reproduce. Only 4/16 (gpt-4o) and 7/18 (mini) failures are wrong-script output; the rest are romanisations or mishearings. gpt-4o was left unpinned by harness choice. MAI-2 on auto-detect was nearly as good as pinned. |
| 4 | LLM server-side TTFT (DeepSeek-V4-Flash 1.11 s … Phi-4 3.11 s); async filter saves 188–304 ms | **confirmed** | Every TTFT and A/B number reproduces from `llm_summary.csv` and `llm_filter_ab.csv`. Minor issue: the RTTs actually subtracted were 252 and 118 ms, not the 246 and 115 ms stated. Caveats below. |
| 5 | Voice Live 2.27 s / 2.63 s / 1.44 s; S2S answered in English 6/16; cascade 2.1–3.6 s | **confirmed** (with caveats) | The measured values reproduce, and caller_2 is "हाँ". "Not human-like" holds: humans gap about 0.2 s. The cascade low end mixes an EU-hosted LLM with the Central India to SEA backbone, and the high end excludes the generative voices. |
| 6 | AI-only cost ₹1.80–₹2.54 per connected minute; STT ₹1.47 (58–82%); LLM ₹0.02–0.12 | **weakened** | The USD figures and arithmetic check out, but FX is stale. ₹88/USD was used; the ECB reference was ₹94.96 on 2026-10-16. Corrected figures are ₹1.94–₹2.74 per minute, with STT at ₹1.58. "Not listed" for MAI-Transcribe-2 is wrong: the Azure calculator lists it at $0.10/h. |
| 7 | Diya Dragon misread ₹1,299 in 10/13 renders; generative voices 3/99 vs neural 0/80 | **weakened** | 10/13 reproduces from the manifest. "Two ASR engines agree" has no stored evidence. 3/99 vs 0/80 is not significant (Fisher p=0.25). A garbled Meera-HD render was dropped from the denominator, and MAI-Voice trailing-junk audio was not counted. |

## Claim-by-claim reasoning

### 1. ASR accuracy (weakened)
- **Reproduced.** Pooled phone-band Kathbath WER from `asr_per_utt.csv` (summed edits / summed reference words, n=300): MAI-2 15.12, real-time 18.07, fast 18.01, gpt-4o-transcribe 30.17, gpt-4o-mini-transcribe 30.20. Hindi: MAI-2 8.25 vs real-time 11.00. NPTEL: 13.08 vs 18.11. Clip counts: 300 + 80 + 80 + 49 = 509.
- **The phone-band penalty is overstated.** The largest phone-band minus wideband deltas per set:

  | Engine and set | Penalty (WER points) |
  |---|---|
  | gpt-4o, NPTEL | +7.27 |
  | fast_llm, NPTEL | +5.60 |
  | gpt-4o, Marathi | +5.42 |
  | rt_lid, Bengali | +4.26 |
  | gpt-4o-mini, Telugu | +3.91 |
  | Azure real-time, Bengali | +3.50 |

  "At most ~2 points" holds only for pooled Kathbath (max +2.4) and for MAI-2 (at most +0.6 on any set).
- **"Lowest on every set" is true at phone band, but not distinguishable everywhere.** Marathi: MAI-2 17.89 [13.4–22.8] vs real-time 18.20 [13.1–23.5]. MUCS code-switched: 54.36 vs gpt-4o 55.43. Every engine is at 54–61% WER on MUCS because of script mismatch. Skeleton CER is MAI-2 28.2 vs fast 28.6.
- **Method caveats:**
  - The headline `mai2` arm ran on auto language detection; the `rt` and `fast` arms were locale-pinned.
  - Kathbath is clean read speech. The "phone band" is simulated: 300–3400 Hz plus a G.711 μ-law round trip, with no noise, AMR codec, packet loss or conversational speech. Real-call WER will be higher for every engine.
  - MAI-Transcribe-2 is a file-based fast-transcription or Voice Live model, not a streaming SDK recogniser (Microsoft Learn, *MAI-Transcribe-2*, 2026-09-22). Its WER says nothing about streaming partials.
  - The Microsoft page warns not to set `locales` unless you are certain of the language.

### 2. Non-speech fabrication (weakened)
- **Counts reproduce:** gpt-4o-transcribe 29/49 phone band and 24/49 wideband. Real-time, fast and gpt-4o-mini are 0/49. MAI-2 is 1/49 ("Right." on a sneeze). LLM speech is 1/49.
- **The scorer flags any letter or digit** (`score_asr.py` line 77). Among gpt-4o's phone-band hits are "[Dial tone]" (×2), "[tooting]", "[Phone ringing]", "[beep]", "Beep." (×2), "Ha ha ha.", "[alarm ringing]", "[Baby crying]", "[typing]" and "[Laughter]". These are sound-event labels or onomatopoeia, not invented speech.
- **Invented words:** 17/49 at phone band and 14/49 at wideband. The digital-silence clips are 5/5 in both bands ("Futebol.", "PINECONE", Sinhala, Tamil, Polish). The direction of the finding is robust.
- **Confound:** `asr_bench.py` passes `language` to gpt-4o only for the Kathbath and NPTEL sets. The non-speech probe therefore ran gpt-4o unpinned, while the Azure engines ran with locale hi-IN.
- **Corroboration** is internal only: `docs/harvest/SYNTHESIS.md` §27 reports gpt-transcribe inventing on 7/12 non-speech clips in another project.

### 3. Language pinning (weakened)
- **Azure LID on Kathbath Hindi, reproduced.** `rt_lid` `lid_correct` is 14/60 and WER is 41.24. The dominant detected locale per utterance at phone band was mr-IN 32, hi-IN 21, bn-IN 6 and en-IN 1, so "labelled Hindi as Marathi" is fair.
- **Short-answer probe, reproduced.** gpt-4o 16/32, gpt-4o-mini 14/32, real-time 30/32, fast 30/32, MAI-2 pinned 32/32, MAI-2 auto 28/32. The two real-time and fast misses are only "2:00 बजे" written for "दो बजे".
- **"Wrong scripts" overstated.** Non-Latin, non-Devanagari outputs account for only 4 of gpt-4o's 16 failures (Urdu, Chinese) and 7 of mini's 18. The rest are romanisations or mishearings ("G" for जी, "Hallo", "Tike", "Gone", "Huh?"). Some marked-wrong outputs are arguably right: "हाजी।" for हाँ जी, "Hallo" for हैलो.
- **gpt-4o was not tested pinned.** The API accepts `language`, and the harness uses it elsewhere. The finding is "unpinned or continuous LID fails", not "gpt-4o fails".
- **MAI-2 on auto-detect** got 60/60 LID and 15.1% WER on Kathbath, against 15.3% pinned. Pinning matters per engine.
- **In-family audio.** All 32 short-answer clips are Azure neural voices (Madhur, Swara, Aarav, Ananya), which may favour Azure recognisers. The harness comment concedes this is an upper bound.

### 4. LLM TTFT and async filter (confirmed)
- **TTFT reproduces.** `llm_summary.csv` main/warm/default, n=33: DeepSeek-V4-Flash(DZ-EU) 1106 ms, gpt-6-luna 1357, gpt-6-sol 1490, gpt-5.4-nano 1638, gpt-5.4-mini 1722, gpt-4.1-mini 1807, Llama-3.3-70B 2539, Phi-4 3107.
- **Filter A/B reproduces.** Paired n=32: −304, −298, −242, −208, −188 ms with CIs excluding 0. Llama is −318 with CI [−468, +105].
- **Prices reproduce.** The 6-luna/6-sol DZ meters (0.11/0.011/0.55 and 2.2/0.22/11) and V4 Flash DZ (0.21/0.031/0.56) match the retail CSV.
- **Corrections and caveats:**
  1. The subtracted RTTs were 252 ms (SEA, invalid-key 401 probe) and 118 ms (FRC), not 246 and 115. The valid-key 404 probe to SEA took 338–428 ms, so "server-side" includes about 100+ ms of gateway authentication.
  2. The three fastest models were Data Zone EU deployments in France Central. Central India to France Central is 134–135 ms in Microsoft's July 2026 table, against 53 ms to Southeast Asia. DeepSeek-V4.1-Flash in SEA was 2.58 s.
  3. Default streaming buffers output (Microsoft Learn, *Content Streaming*, 2026-09-08). Default-mode first-to-last is 0–18 ms, so default TTFT is roughly the full-reply time. Async lowers time to first token but not total time (luna 1465 vs 1445 ms).
  4. Async filter is GA for all customers. Microsoft states the policy signal can lag up to ~1,000 characters and "harmful content … could be displayed". In voice it would already be spoken and cannot be retracted.

### 5. Voice Live and cascade latency (confirmed, with caveats)
- **Reproduced** from `voicelive_summary.csv` (first audio minus RTT, p50): gpt-4.1-mini + azure-speech 2268 ms, gpt-4.1-mini + MAI-2 + Meera HD 2634 ms, azure-realtime 1436 ms.
- **Missed "haan".** caller_2 is "हाँ" (`make_probe_audio.py`), and the azure-speech arm had no transcript and no response in both sessions.
- **English replies.** azure-realtime gave fully English replies on 6/16 turns, all of them in session 2 (0/8 in session 1). That is a session-level effect, with n=2 sessions.
- **The VAD stop accounts for about 0.94 s** of each figure (semantic VAD, 500 ms silence).
- **Human baseline.** Gaps sit within about 250 ms of a cross-language mean around 0.2 s (Stivers et al., PNAS 2009, PMID 19553212), so "not human-like" holds.
- **Cascade estimate:**
  - Its 0.93 s LLM figure is gpt-6-luna async in France Central. That needs the 135 ms Central India to France Central RTT, not the 53 ms backbone, which adds about 0.08 s.
  - The 0.44 s STT figure uses a 300 ms segmentation timeout whose mid-utterance cut-off risk was not measured. MUCS and NPTEL finals were 0.53–0.94 s.
  - The 0.10–0.42 s TTS figure excludes Diya Dragon (0.81 s) and MAI-Voice-2.1 (0.58–1.08 s) service latency.
  - A fair restatement: Voice Live 1.4–2.6 s measured; own cascade about 2.2–4 s.
- Caller audio is Azure TTS (MadhurNeural), so recognition is a best case.

### 6. Cost per minute (weakened)
- **USD inputs check.**
  - Retail API and calculator: S1 STT $1.00/h in centralindia, neural $15/1M chars, HD $22/1M chars.
  - Stack arithmetic: $0.02046 (luna + Swara) and $0.02884 (sol + Meera HD) per minute. Shares: 57.8% and 81.5%.
- **FX is stale.** The lane used ₹88. ECB reference USD/INR was 94.96 on 2026-10-16 and ranged 94.96–96.78 from 2026-09-15 to 10-16 (Frankfurter). open.er-api gave 95.11 on 2026-10-17. Corrected at ₹94.96:

  | Item | Lane (₹88) | Corrected (₹94.96) |
  |---|---|---|
  | Total, luna + neural voice | ₹1.80/min | ₹1.94/min |
  | Total, sol + DragonHD | ₹2.54/min | ₹2.74/min |
  | STT | ₹1.47/min | ₹1.58/min |
  | LLM, luna | ₹0.02/min | ₹0.025/min |
  | LLM, gpt-4.1-mini | ₹0.12/min | ₹0.13/min |
  | LLM, gpt-6-sol (inside the top stack) | not stated | ₹0.47/min |

  Every INR figure in `cost-inputs.json`, `llm_summary.csv`, `tts_summary.csv` and `voicelive_summary.csv` is about 7.3% low.
- **Omitted.** The Azure pricing calculator (azure.microsoft.com/api/v2/pricing/cognitive-services/calculator) lists `speech-services-mai-transcribe-2-speech-to-text` at **$0.10/h** in central-india and asia-pacific-southeast. The pricing page footnotes it as a "Limited-time promotional offer till 12/31/2026". The lane's "not listed" is true only of the Retail Prices API.
- **Standard STT commitment tiers** (calculator): $0.80, $0.65 and $0.50/h at 2k, 10k and 50k h/month, i.e. ₹0.79–1.27/min. "List price" is a ceiling, not the expected cost.

### 7. TTS number misreads (weakened)
- **10/13 reproduces** from `manifest.csv` render attempts and panel notes: B_d8eec6 1 render, correct; B_2ead44 3 wrong then correct; M_adcaf6 5/5 wrong; M_d175fd 2 wrong then correct.
- **Numbers heard.** The notes record 199/299/199 and 1999/799/699/1899. "899" appears only in a harness comment.
- **"Two ASR engines agree" is unbacked.** `fix_numbers.py` and `tts_numbers.py` call only MAI-Transcribe-2, and no second-engine transcript is stored. There was no human listening check, so ASR error is not excluded.
- **Probe counts reproduce** from `tts_numbers.csv` `result_adj`: 3/99 generative (Diya 1/20 "₹699", Aarti HD 1/20 "₹55,500", Kavya MAI-Flash 1/20 "600") and 0/80 neural.
- **What the probe under-counts:**
  - The one "unchecked" render was en-IN-Meera:DragonHD producing garbled nonsense for "आपका order ₹1,299 का है". Counted as a failure, the rate is 4/100.
  - MAI-Voice-2.1 and its Flash version had trailing junk audio, transcribed as "डॉ.", "Doctor." and so on, in 7/20 and 11/20 renders.
- **Not significant.** 3/99 vs 0/80 gives Fisher p=0.25; 4/100 vs 0/80 gives p=0.13. Diya read ₹1,299 correctly in 1 of 2 probe renders.
- **Supportable statement:** one preview generative voice (Diya Dragon) is unreliable on prices, and generative voices show more defects of several kinds. Generative vs neural misread rates are not yet separable at this n.

## Lane quality notes
- **No fabricated numbers found.**
  - Every load-bearing figure traces to a CSV row, and the CSVs trace to harness code with HTTP-200 responses and stored replies.
  - Model names I could not know independently (gpt-6-luna/sol, gpt-5.4-*, DeepSeek-V4-Flash) have matching Retail Prices meters.
  - The Kathbath URL resolves: 200, 3.59 GB tar ("testkn" = test-known).
  - MAI-Transcribe-2 exists, with hi, bn, mr, ta, te supported, per Microsoft Learn (2026-09-22).
- **Factual errors to fix:**
  1. FX ₹88 should be about ₹95.
  2. MAI-Transcribe-2 is priced at $0.10/h promo.
  3. `cost-inputs.json` gives `central_india_to_france_central_rtt_p50: 118`. Microsoft's table says 135 (134 in reverse); 118 is Central India to France South.
  4. The RTTs quoted in the claim text (246/115) differ from those subtracted (252/118).
- **Confounds not disclosed in the claims:**
  - gpt-4o models ran unpinned on the non-speech, short-answer and MUCS sets.
  - Azure-TTS audio was used to test Azure ASR (short answers, Voice Live caller).
  - All latency was measured from Ohio via an egress proxy with one-RTT subtraction; India-hosted latency was not measured.
- **Questions skipped:**
  - Real Indian telephone audio: noise, AMR-NB, packet loss, conversational speech, or any Kannada, Gujarati or Malayalam test.
  - MAI-2 accuracy inside Voice Live or any streaming path.
  - Barge-in and interruption handling, false end-of-turn rates with 300 ms segmentation, and tail latency under concurrency or TPM quota.
  - Whether the fastest LLMs (gpt-6-*, DeepSeek-V4-Flash) can be deployed in an India or SEA region rather than DZ-EU.
  - Voice Live per-minute cost at corrected FX, compared with a cascade using MAI-2 at $0.10/h.
  - Human listening for the TTS number check.
- **Statistics.** CIs are used well for WER and the filter A/B, but not applied to the TTS 3/99 vs 0/80 claim or the Voice Live 6/16.
