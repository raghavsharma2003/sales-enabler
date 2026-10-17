# l7-tech-frontier: adversarial verification

Verifier run on 2026-10-17. Scope: the 7 load-bearing claims in the lane's final response. I did not edit the lane's other files and made no git commit.

**Method.** I re-read the cited primary pages and pulled the Azure Retail Prices API myself: all 1,847 `Foundry Models` meters plus the `Azure Speech` meters in eastus2, and the `Neural HD` meters in every region. I cloned `simonw/llm-prices` independently and read its commit diffs. I also read:

- the Hugging Face API records and model cards;
- the raw Microsoft Learn release notes;
- the TRAI Third Amendment PDF (Regulation_18092026.pdf, 20 pages);
- the live Plivo and Tata Smartflo pages;
- two FX feeds: open.er-api.com gave 95.11 and the ECB-based Frankfurter feed gave 94.96 INR/USD.

I also re-ran the lane's ASR probe counts from `res_*.jsonl` and re-implemented the cut-process forecast to test how sensitive it is.

**Limits.** The shared WebSearch budget was used up before this verifier ran, so I used no search engine. Wayback and `index.commoncrawl.org` are blocked by the egress policy. For history from Common Crawl, I therefore read the lane's saved capture texts instead of re-fetching them. My scratch files are in `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/verify-l7/`.

## Verdict table

| # | Claim (short) | Verdict | Correction / note |
|---|---|---|---|
| 1 | ACS standalone retired 2028-09-30, announced 2026-09-23; DR/PSTN/SMS/Email/WhatsApp retired; Call Automation + Audio Streaming Teams-only; no new PSTN numbers from 2026-10-23 | **confirmed** | The guide says all of this verbatim (updated 2026-10-08), and the audio-streaming page carries the warning banner and the Teams-only note. Nuances below. |
| 2 | Managed quality-bar stack: $0.579/min (2023-04), $0.056 (2024-10-17), $0.033 = INR 3.14 (2026-10-17); 1.7x in 24 months; flat $0.033-0.039 since 2025-09 | **confirmed** | The arithmetic reproduces exactly and every 2026 input price matches a live Azure meter. Labelling and omission caveats below; none of them moves the numbers out of the stated band. |
| 3 | Forecast: end-2027 P50 INR 1.89 (1.41-2.84), end-2028 1.52 (1.05-2.04); P(<1.0 by 2027) ~0.01; regime-mixture 2.43 (1.61-3.33); budget stack 1.24 (0.95-1.37), P(<0.5 by 2028) ~0.01 | **weakened** | All the numbers reproduce from `fit-results.json`. However, the headline P50 of INR 1.89 assumes the LLM line keeps falling at the 2024-25 pace, which contradicts the lane's own claim 4. If the LLM line is held flat, end-2027 P50 is about INR 3.0 (2.6-3.1); a recent-regime jump process gives about 2.7 (1.9-4.6). FX is held at 95.11 throughout. |
| 4 | Frontier tier stopped falling after 2025-04; the stated prices; $0.012-0.022 per reference minute; 18-month multiplier 1.02 | **weakened** | Every quoted price is correct. Two parts are wrong: by the lane's own per-minute metric the fall stopped after **2025-08** (GPT-5 was 41% cheaper per minute than GPT-4.1), and the first rise was **GPT-5.2 on 2025-12-11 ($1.75/$14)**, which the lane left out, not GPT-5.4. The 1.02 multiplier has a 90% CI of 0.57-1.35 (n=8). |
| 5 | Both open ASR models invented text on 30/30 non-speech clips; Qwen gave 'हाँ' on 24/25 non-babble clips; whisper gave 'झाल' on 23/25 | **confirmed** (count fix) | Whisper output 'झाल' on **22/25**, not 23/25; the other 3 were 'अजय को' (2) and 'अजय' (1). The rest is exact. Method caveats below; the conclusion (VAD, a probe and a second check before any CRM write) stands. |
| 6 | No gateable Indic full-duplex S2S; PersonaPlex, VoiceChat 11B and Moshi are English-only; Azure Realtime GA 2026-07-25 with Aarti, Diya and Meera; S2S emits audio before any text gate | **confirmed** | The HF metadata and cards match (VoiceChat card: release 2026-08-03, ~450 ms, tool calling, `language: en`). The Speech release notes match on the GA date and voice names. That Azure Realtime cannot be gated is an architectural inference, not a measurement. |
| 7 | Indian PSTN carriage does not fall: Plivo INR 0.40 (2024-02 to 2025-03), 0.74 (2026-03), 0.38/30 s live; Tata INR 0.22; TRAI A2P up to INR 0.05/min from 2026-11-17 | **weakened** | Tata and TRAI are confirmed. The Plivo trend is mis-stated. At the same 30 s pulse the 2024-02 capture lists **INR 0.48**, against **INR 0.38** live today: a 21% fall. The INR 0.40 figure was the **60 s** pulse. The 2026-03 capture that shows 0.74 also shows "India All Networks from Plivo-IN numbers INR 0.40/min". Corrected statement: carriage has fallen slowly (about 8%/yr at a 30 s pulse) and is now a small, flat line; TRAI adds a small new cost. |

## Reasoning per claim

### 1. ACS retirement (confirmed)

The retirement guide (`ms.date` 2026-08-18, `updated_at` 2026-10-08) says:

- "On September 23, 2026, Microsoft announced the retirement of Azure Communication Services (ACS) as a standalone offering, effective September 30, 2028."
- In the impacted-services table, these are **Retired**: Email, SMS, Advanced Messaging with WhatsApp, Chat, Rooms, Number Management (Direct Offer), Direct Routing, Job Router and the UI Library.
- These are **Breaking Changes**: Calling SDK, Call Automation, Audio Streaming, Call Recording and Closed Captions. They stay available after 2028 but "supported only when used with a supported Teams-aligned service".
- "customers without an Azure Communication Services resource created before October 23, 2026 ... will not be able to acquire phone numbers for retiring telephony workloads, including PSTN calling and SMS."

The audio-streaming concept page (updated 2026-09-23) carries the warning banner. It adds that after the Product Terms update, Call Automation, Call Recording and Audio Streaming "support only Microsoft Teams interoperability scenarios". That could take effect **before** 2028.

Nuances the lane should carry:

- The FAQ is stricter than the 10-23 date: "for new ACS resources created after the announcement, phone number capabilities are intentionally disabled".
- A Teams-aligned path still exists: Teams Phone Extensibility with Call Automation, plus Teams Direct Routing or Operator Connect, with Teams Phone licences. "Dead end" is right for the harvest's standalone ACS plan, not for every Microsoft telephony route.
- ACS never sold Indian numbers (harvest tx-voice), so the plan depended only on Direct Routing, which is now retired.

### 2. Stack cost history (confirmed, with caveats)

I re-derived each point from the workload in `fit.py`: 4.8 calls/min, 3,720 input and 70 output tokens per call, 85% of a 3,000-token system prompt cached, 440 TTS characters per minute, and 1 audio minute of ASR.

| Date | ASR | LLM | TTS | Total |
|---|---|---|---|---|
| 2023-04 | S1 STT $1/h | GPT-4-8K ($30/$60, no cache): 0.5558 | S1 Neural: 0.0066 | **$0.5791** |
| 2024-10-17 | 0.01667 | gpt-4o-0806 with 50% cached: 0.0327 | 0.0066 | **$0.05597** |
| 2026-10-17 | Voice Live BYO standard input: 0.0075 | gpt-6.1-sol ($2 / $0.10 cached / $10): 0.015816 | Neural HD: 0.00968 | **$0.032996** |

How the 2026-10-17 component prices were checked:

- **ASR:** $0.0125/1K tokens, meter effective 2025-11-01. The Voice Live doc confirms "~10 tokens" per second of input audio, which gives $0.0075/min.
- **LLM:** meters `6.1-sol ShortCo Inp/Cd Inp/Opt Std Gl`, effective 2026-10-01.
- **TTS:** $22/1M characters, effective 2026-03-01 in Global, centralindia and eastus. In eastus2 and some other regions the same price shows an effective date of 2026-09-01.

The 2026-10-17 total converts to INR 3.138 at 95.11, and the FX feed is confirmed. 0.05597/0.0330 gives 1.70x. The history values since 2025-09 run 0.0326-0.0393. Lane l2's scenario A AI components sum to INR 3.072 (ASR 0.855 + LLM 1.297 + TTS 0.920), which is consistent with this result.

Caveats, none of which moves the claim outside its band:

- **(a) "Flagship" is a misnomer.** The series tracks the mid tier: 5.6 Terra, then 6 Sol. The true flagships cost more: GPT-6 Astra is $10/$50 (llm-prices commit bf05b93, 2026-09-04) and GPT-5.6 Sol launched at $5/$30.
- **(b) GPT-5.1 and GPT-5.2 are missing from `prices.csv`.** With GPT-5.2 as the newest model at 2026-01-01, the stack would be about $0.0374 rather than $0.0326. That is still inside the band.
- **(c) Cache-write meters are not modelled.** The 5.6 and 6 families have `Cd Wr` meters at 1.25x input, which adds roughly 3% to the LLM line.
- **(d) Reasoning-token output is not modelled for the GPT-5 family.**

### 3. Forecasts (weakened)

The `fit-results.json` stack A `forecast_cut_process` values reproduce exactly:

- end-2027: 1.409 / 1.895 / 2.837, with P(<1.0) = 0.008;
- end-2028: 1.054 / 1.516 / 2.045.

The regime-mixture values for 2027 also reproduce (1.606 / 2.426 / 3.335), as do stack B's cut-process values (2027: 0.951 / 1.239 / 1.367; P(<0.5) at 2028 = 0.008). The class rates also check out: 11 LLM cuts over 5.58 component-years gives 1.97, with a median of -48.9%; 3 speech cuts give 0.358 at a median of -26.7%; 2 realtime cuts give 0.358 at a median of -32.8%.

**The problem is that the LLM cut process contradicts claim 4.** Eight of the 11 LLM "cuts" fall in 2024-01 to 2025-08. The three 2026 "cuts" (-20%, -4%, -7%) only partly reverse the +86% GPT-5.4 rise, which the method ignores because it simulates cuts only. The frontier line is **+33% net since 2025-08**, and the small tier has had no new low in 14 months. Even so, the forecast draws about 2.4 more LLM cuts (median -49%) before end-2027.

I re-ran the method with 20,000 draws (`verify-l7/sens.py`):

| LLM assumption | end-2027 P10 / P50 / P90 (INR) | end-2028 P50 |
|---|---|---|
| lane (2024-25 cut rate) | 1.40 / 1.90 / 2.84 | 1.51 |
| LLM flat (the lane's own 18-month multiplier of 1.02) | 2.63 / 2.99 / 3.14 | 2.81 |
| recent-regime jumps, rise included | 1.88 / 2.69 / 4.59 | 2.36 |

In addition, the INR price is held at a fixed 95.11, although the rupee moved from about 88 to about 95 per USD in a year. That makes the INR forecast optimistic as well.

Corrected statement: INR 1.89 is the optimistic case. A forecast conditioned on the 2025-26 regime puts end-2027 P50 at about INR 2.7-3.0. Stack B's forecast is robust to this, because B is dominated by speech components.

### 4. Frontier LLM tier (weakened)

Azure meters confirm:

| Model | Input | Cached | Output | Effective |
|---|---|---|---|---|
| gpt 4.1 | $2 | $0.5 | $8 | 2025-04-01 |
| GPT 5 | $1.25 | $0.125 | $10 | 2025-08-01 |
| 5.4 | $2.5 | $0.25 | $15 | 2026-03-01 |
| 5.6 terra | $2.0 | $0.2 | $12 | 2026-08-01 |
| 6-sol | $2 | $0.2 | $10 | 2026-09-01 |
| 6.1-sol | $2 | $0.1 | $10 | 2026-10-01 |

llm-prices commits confirm the dates: 48f2ed0 2026-03-05 (5.4), 763c97d 2026-06-26 (5.6 Terra launch at $2.5/$15), b163763 2026-07-30 (Terra cut to $2/$12) and 708e851 2026-09-22 (GPT-6 Sol).

Errors and omissions:

1. **"Stopped falling after 2025-04" is wrong by the lane's own measure.** GPT-5 cost $0.0119 per reference minute against $0.0200 for GPT-4.1. The floor was set in **2025-08**.
2. **The first rise was missed.** It was GPT-5.2 at $1.75/$14 (llm-prices b953cca, 2025-12-11; Azure `GPT 5.2 inp/opt Gl`, effective 2025-12-01). GPT-5.1 (2025-11, $1.25/$10, flat) is also missing.
3. **The 1.02 multiplier is not a meaningful "flat" signal.** The 18-month fit rests on 8 points with a 90% CI of 0.57-1.35.

Corrected statement: the mid-tier price per reference minute bottomed at $0.012 in 2025-08, rose from 2025-12 to a $0.022 peak in 2026-03, and has since eased to $0.016.

### 5. ASR non-speech probe (confirmed; count corrected)

I counted directly from the result files:

- **Qwen3-ASR-0.6B:** 30/30 clips non-empty. On the 25 non-babble clips it output 'हाँ' 24 times and 'हैं' once.
- **whisper-large-v3-turbo:** 30/30 clips non-empty. On the 25 non-babble clips it output **'झाल' 22 times**, 'अजय को' twice and 'अजय' once.

So 23/25 is wrong; the correct count is 22/25. The method matches the claim: n=30 clips of 4 s each, and `asr_bench.py` forces Hindi and uses no VAD.

Caveats:

- The whisper run used HF `generate` without the no-speech or log-prob thresholds or the timestamp mode that openai-whisper uses to suppress output on silence.
- The "silence" clips are digital zero, which is a worst case.
- Only two small open models were tested.

None of these caveats weakens the operational conclusion, which matches harvest law 27.

### 6. Full-duplex survey (confirmed)

The Hugging Face API returns:

- `nvidia/personaplex-7b-v1`: createdAt 2025-12-31, card language `[en]`, audio-to-audio.
- `nvidia/NVIDIA-NemotronLabs-VoiceChat-11B`: card "Release Date: August 3, 2026", "~450 ms response", "first open full-duplex model to support tool calling", `language: [en]`, and a default system prompt that says "in English".
- `kyutai/moshiko-pytorch-bf16`: `[en]`.

The Speech release notes say: "July 2026 release 2026-07-25 The Azure Realtime Speech-to-Speech model is now generally available ... 34 ... voices across 11 major languages". They also list native voices "Aarti, ..., Diya, ..., Meera" for `azure-realtime` (Voice Live API 2026-07-15).

HF API queries for duplex and speech-to-speech models in Hindi found no Indic full-duplex model. The search did not cover closed or non-Azure systems, because of the search budget.

One nuance: VoiceChat-11B predicts text tokens before its TTS decoder, so it could in principle be gated. It is English-only, though, so the claim holds.

### 7. PSTN carriage (weakened)

The live Plivo page shows domestic outbound and inbound at INR 0.38/min, "Pulse is 30 seconds", with audio streaming included.

The lane's saved Common Crawl captures show:

- **2024-02-26:** "60 seconds INR 0.40 /min ... 30 seconds INR 0.48 /min ... 15 seconds INR 0.62 /min".
- **2024-06 to 2025-03:** INR 0.40/min, with the pulse not stated (60 s per the 2024-02 table).
- **2026-03-16:** "Local Calls INR 0.74/min" and also "India All Networks from Plivo-IN numbers INR 0.40/min".

So at a like-for-like 30 s pulse, carriage fell 21%. At a 60 s pulse it fell 5%, and the finer pulse also lowers the effective cost of short calls.

The rest of the claim is confirmed:

- **Tata Smartflo:** "Monthly Rental INR 1,100 Per-Concurrency", "5000 mins per user per month (pooled)" and a one-time INR 20,000. That works out to INR 0.22/min only at full FUP.
- **TRAI:** Regulation 18 of the TCCCPR (Third Amendment) Regulations 2026 inserts 35A: the TAP "may charge the OAP upto Rs. 0.05 ... per minute on per minute pulse basis for A2P calls". The charge is capped at the TAP's lowest tariff and exempts the 140xx, 1600xx and 1601xx series. Regulation 18 comes into force 60 days after Gazette publication; publication dated 18 Sep 2026 gives about 2026-11-17.

## Lane-quality notes

**Gaps in the data:**

- `prices.csv` leaves out GPT-5.1 (2025-11) and GPT-5.2 (2025-12-11, $1.75/$14). GPT-5.2 is the actual start of the frontier-price rise.
- The tier labels "frontier" and "flagship" actually track the mid tier. GPT-6 Astra ($10/$50) and GPT-5.6 Sol ($5/$30 at launch) are not in the series.

**Modelling choices:**

- The forecasts' cut-only process imports the 2024-25 LLM cut rate. That contradicts the lane's own 18-month evidence, and the size of the bias (P50 1.9 vs 2.7-3.0) is not reported.
- FX is fixed at 95.11 with no depreciation path. `prices.csv` meanwhile converts Sarvam, Ringg and Samvaad at 88, so for example Ringg's INR 6 is $0.063 at today's rate, not $0.068.
- Cache-write meters (`Cd Wr`, 1.25x input) on the 5.6 and 6 families, and hidden reasoning tokens, are not modelled.

**Telephony:**

- Plivo prices are compared across different pulse bases (60 s vs 30 s). The 2026-03 "contradiction" is a page-section mismatch, since the same capture lists INR 0.40.

**ASR benchmark:**

- WER uses n=20 utterances, although the manifest lists 60.
- Whisper was run without its built-in no-speech suppression.
- The whisper count of 23/25 is a miscount; it is 22/25.

**Questions the lane skipped:**

- **(i)** The 6-day window: an ACS resource created before 2026-10-23 keeps existing-customer status through 2028. The lane did not flag this as an owner action.
- **(ii)** The cost and feasibility of the remaining Microsoft path: Teams Phone Extensibility with Teams Direct Routing in India, with per-resource-account Teams Phone licences.
- **(iii)** The cost of the non-Microsoft replacement (a Plivo or Tata SIP or WebSocket media leg into Azure Container Apps), and whether third-party telephony fits the Azure-only directive.

**Provenance:**

- I found no fabricated numbers. Every price I spot-checked matched a primary meter, page, commit or regulation.
- The lane ran 0 WebSearches (budget exhausted) and listed its blocked sources honestly.
