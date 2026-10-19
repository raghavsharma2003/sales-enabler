# Verification: lane g3-cascade-measured

- **Verifier:** adversarial verifier subagent.
- **Date:** 2026-10-19 (the lane's run date is 2026-10-18).
- **Scope:** the 8 load-bearing claims handed to this verifier.
- **No paid calls were made.**

## Method

- **Latency recomputed from raw rows.** I re-read `results/casc_turns_*.csv` and `casc_resp_*.csv` with my own code; I did not import `rederive.py`. Main turns exclude the `P4pause-*` sessions. Percentiles use linear interpolation.
- **Call-cluster CIs re-bootstrapped.** 5,000 resamples of the 6 sessions, seed 7.
- **Clip pauses recomputed from the audio.** I re-implemented the energy VAD (20 ms frames, threshold 35 dB below the clip maximum) on the actual 8 kHz battery clips (`scratchpad/g3/bundle/audio8k/`). The scripts are in `scratchpad/verify_g3/` (`gaps.py`, `boot.py`, `cost.py`).
- **Cost per minute recomputed independently from raw response rows.** I imputed prompt tokens for cancelled streams the way the lane did, then priced everything at today's re-read list prices.
- **Prices re-read on 2026-10-19:**
  - **Azure Retail Prices API:**
    - centralindia Azure Speech: S1 Speech To Text $1.00 per audio hour; S1 Neural TTS $15 per 1M characters; Neural HD TTS $22 per 1M characters.
    - southindia gpt-4.1-mini regional: input $0.44, cached input $0.11, output $1.76 per 1M tokens.
  - **OpenRouter endpoints API:** gpt-oss-120b on Groq at $0.15 input, $0.075 cache read and $0.60 output per 1M tokens.
  - **Gemini API pricing page:**
    - gemini-3.5-transcribe-live: $3.50 per 1M audio tokens in ($0.005/min) and $21.00 per 1M text tokens out ($0.004/min). Google's blended estimate is about $0.009/min, at 25 audio tokens/s and 175 text tokens/min.
    - gemini-3.5-flash-lite: $0.30 input, $0.03 cached, $2.50 output per 1M tokens.
    - gemini-3.8-flash-tts: $0.50 text in / $9 audio out per 1M tokens to 2026-12-31, then $1 / $18 from 2027-01-01.
    - gemini-3.8-flash-lite-tts: $0.50 / $6 to 2026-12-31, then $1 / $12 from 2027-01-01.
    - Audio is 25 tokens per second.
  - **Azure billable-characters rule (Microsoft Learn TTS overview):** every Unicode code point counts, as does markup inside `<voice>`. Cancelled requests are billed.
  - **Result:** every price the lane used matches today's pages. Units are correct throughout: per 1M tokens, per audio hour and per 1M characters.

## Verdicts

| # | claim | verdict |
|---|---|---|
| 1 | C1 first audio p50 1,026 ms, p90 1,143 ms, 95% within 1.2 s | confirmed, with caveats |
| 2 | C6 same p50 as C1, longer tail | confirmed (the tail difference is marginal) |
| 3 | gemini-3.5-flash-lite TTFT of about 0.8 s pushes C7/C8 above 1.2 s | confirmed (free tier only) |
| 4 | Gemini-TTS cascades computed to miss 1.2 s on every turn | confirmed (computed) |
| 5 | Every cascade starts talking in the 2.42 s elderly pause | confirmed |
| 6 | Cut-ins only on clips with pauses of 0.72 s or more; above 5% on P1/P4 | confirmed |
| 7 | C6 with gated STT is the cheapest: ₹0.88-0.95/min | **weakened**: ranking holds, the values are a floor |
| 8 | C1 costs ₹2.2/min and 72% of that is STT | confirmed |

### 1. C1 p50 1,026 ms: confirmed, with caveats

**Reproduced exactly from the rows:**
- 60 main turns, 58 answered, 6 sessions (3 personas x 2 passes).
- p50 1,025.75 ms, which rounds to 1,026. p90 1,143 ms.
- 55 of 58 answered turns within 1.2 s (0.948).
- Call-cluster CIs: p50 1,017-1,035 and p90 1,099-1,277, the same as the lane's.
- The vantage is stated in the CSV: Central India VM, Standard_D4s_v5, no telephone leg.

**Caveats the claim text omits:**
- **What the metric measures.** It runs from the caller's last speech frame being pushed to the first TTS byte arriving at the VM. It is not first audible speech, and it excludes any telephony or CPaaS leg and playout buffering. A real phone call will be slower.
- **Denominator.** "95% of turns" counts answered turns only. The 2 unanswered turns are P4_t08 short elderly replies that Azure STT never transcribed, so the agent stayed silent. Over all 60 turns, 55 of 60 (91.7%) were answered within 1.2 s.
- **Synthetic callers.** The battery is Azure-TTS-rendered caller audio with mixed-in noise, so this is Azure STT hearing Azure TTS.
- **Few clusters.** There are only 6 clusters, and they are confounded with persona, so the CIs are optimistic.
- **Shared VM.** C1, C2, C3, C6 and C7 ran concurrently on one 4-vCPU VM.

**TTS first byte is plausible.** The cascade's 32 ms p50 TTS first byte is consistent with the component bench for short text on SwaraNeural (46 ms p50).

### 2. C6 has the same p50 and a longer tail: confirmed (tail difference is marginal)

**Reproduced exactly:**
- 60 of 60 turns answered, p50 1,031 ms and p90 1,404 ms.
- Call-cluster CIs: p50 1,010-1,052 and p90 1,121-1,540.

**The p50s are the same.** The p50 CI overlaps C1's.

**The longer tail is weaker than the claim implies:**
- The call-cluster p90 CIs overlap (C1 1,099-1,277; C6 1,121-1,540).
- At turn level, 11 of 60 C6 turns are above 1.2 s, against 3 of 58 for C1 (Fisher two-sided p = 0.044, which ignores clustering).

**Free-tier STT.** gemini-3.5-transcribe-live ran on the free tier, so paid-tier latency was not measured.

### 3. gemini-3.5-flash-lite TTFT of about 0.8 s pushes C7/C8 above 1.2 s: confirmed (free tier)

**Reproduced:**
- C7: p50 1,568 ms (cluster CI 1,514-1,592/1,602, which is bootstrap noise), 56 answered.
- C8: p50 1,688 ms (1,654-1,718), 59 answered. 0% of turns within 1.2 s for both.
- In-cascade TTFT p50 is 824 ms (C7) and 794 ms (C8).
- In the bench `llm_india.csv`, gm:gemini-3.5-flash-lite has n=30 and TTFT p50 783 ms.

**The attribution holds.** The C7 minus C1 gap in first audio (542 ms) is about the TTFT gap (516 ms).

**The limit is the tier.** These are all free-tier measurements; the claim says so. Paid-tier 3.5-flash-lite TTFT was never measured. One weak support: the paid OpenRouter route to google/gemini-3.1-flash-lite on AI Studio had a 743 ms p50, which suggests the paid tier would not rescue it.

**Policy note.** Using a free-tier key departs from brief §0 ("paid tiers only"). It was one key with no rotation, and the battery is synthetic.

### 4. Gemini-TTS cascades miss 1.2 s on every turn: confirmed (computed)

**Reproduced every design** by pairing all measured turns with the g5 paid-tier stream first-byte samples:
- G-D whole reply: p50 1,842 ms. G-D first clause alone: 1,752 ms.
- G-B: 2,755 ms.
- g5 first byte p50, n=40 each: 857 ms for flash-lite-tts and 1,094 ms for flash-tts.
- 0% of pairings within 1.2 s. The minimum of any pairing is 1,322 ms (G-D, first clause).

**The direction is conservative.** The composite leaves out Gemini TTS's 0.14-0.36 s of leading silence.

**Caveats:**
- The g5 first-byte samples were taken on the streamGenerateContent path (24 kHz L16, with a style prompt), not the Interactions API path that the C4/C5 harness used.
- Only the Gemini API global endpoint was tested; Vertex asia-south1 was not.
- The STT and LLM timings in G-A, G-B and G-C come from free-tier runs.
- The method assumes the components are independent.

### 5. Every cascade starts talking in the 2.42 s elderly pause: confirmed

**Reproduced from the audio.** P4_t03 has a 2,420 ms gap starting at 1,340 ms.
- 12/12 cut-ins for each of C1, C2, C3, C6, C7 and C8; 6/6 in each gated run.
- Wilson intervals 0.757-1.0 and 0.61-1.0.
- p50 time into the pause: 939-1,091 ms for the fast configs (C3 individual values reach 1,440 ms); 1,523 ms for C7 and 1,582 ms for C8.

**Caveats:**
- The 12 repeats are the same clip in one session, so they measure repeatability, not 12 independent pauses.
- **What the agent says differs by LLM** (`rederived_pause_reply_kind.csv`):
  - C3 and C6 (gpt-oss) gave a two-word "please continue" prompt in 12/12. The prompt asks for exactly that.
  - C1, C2 and C7 answered the half-finished question substantively in 12/12.
- The claim is true for every cascade that was measured. The computed slow Gemini-TTS designs would not cut in: G-B 0/12 and G-A 5/12 in the counterfactual.

### 6. Cut-ins only on clips with pauses of 0.72 s or more, above 5% on P1/P4: confirmed

**Independently reproduced.** I re-ran VAD on the clips:
- The smallest internal gap on any cut-in clip is 720 ms (C6 on P4_t11); for C1 it is 780 ms.
- No clip with a maximum gap under 500 ms had a cut-in in any config (0/30 per config).
- C1: 16/60, Wilson 0.171-0.390.
- Per persona: P1 had 5, 5 and 3 of 20 (C1, C3, C6); P4 had 3, 3 and 8 of 20.

**The cut-ins are real replies.** The main-turn cut-ins are mostly substantive (C6: 20 of 22 longer than 4 words), not backchannels.

**The margin is thin.** The lowest cell (3/20) has a Wilson lower bound of 5.2%, just above the 5% line.

### 7. C6 with gated STT is the cheapest measured stack at ₹0.88-0.95/min: weakened (ranking holds, values are a floor)

**The arithmetic reproduces exactly** from raw rows at list prices, FX 95.

| | ₹/min at 1 / 3 / 5 / 10 min |
|---|---|
| total | 0.879 / 0.893 / 0.908 / 0.945 |
| STT | 0.382 |
| LLM | 0.166-0.233 |
| TTS | 0.330 |

- Battery-measured shape at 3 minutes: ₹0.933.
- **The ranking holds** against everything else measured:
  - C1 gated: ₹1.33-1.46
  - C6 ungated: ₹1.16-1.28
  - C8: ₹1.46-1.67
  - Gemini Live (g5): ₹2.47 and up

**Why the values are a floor:**
- **(a) The OpenRouter account ledger is higher than the model.**
  - In the window 19:38-19:57Z, only the C6-gated run used OpenRouter. The account usage rose by $0.01733.
  - The per-response `usage.cost` sums to $0.00979 there (1.77x below the ledger). Even with the lane's prompt-only imputation for 25 cancelled streams, the model gives about $0.0143 (about 1.2x below).
  - The C3/C6 window from 19:15 to 19:38Z shows the same gap: 1.74x and 1.23x.
  - Most likely cause: cancelled streams are billed for prompt plus generated tokens (including reasoning), and the model imputes the prompt only.
  - The windows cannot be fully attributed (other probes may share the key). If they hold, the LLM line is about 20% low, which gives about ₹0.91-0.99.
- **(b) The STT line (43% of the total) rests on unverified billing assumptions:**
  - that gemini-3.5-transcribe-live bills only the audio actually sent when VAD-gated;
  - that text output is 14.6 tokens per utterance (from countTokens on flash-lite, not metered);
  - that interim transcripts are free. The Live Transcribe doc and the pricing page are silent on all three.
  - Transcribe-live ran on the free tier with no usage metadata captured. Google's published blended $/min does support linear, non-rebilled pricing.
- **(c) The n is mis-stated.** The C6-gated row uses the gated run's own 30 exchanges for the LLM and TTS lines, and C1-gated's sent-seconds ratio (1.187, identical to C6-gated's) for the STT line. It does not use "usage of 60 ungated exchanges".
- **(d) FX 95 is an assumption** from the task instructions, not a read rate.
- **(e) Not modelled:** OpenRouter's platform fee on credit purchases.

### 8. C1 costs ₹2.2/min and 72% of that is STT: confirmed

**Reproduced exactly:**
- ₹2.158 / 2.187 / 2.216 / 2.289 at 1 / 3 / 5 / 10 minutes.
- STT is $1.00 per audio hour x 60 s x 95 = ₹1.583 per minute. Re-read today from the Retail Prices API (centralindia, S1 Speech To Text, effective 2018-11-01).

**STT share:**
- 72.4% at 3 minutes.
- Across call lengths it ranges from 73.4% (1 minute) to 69.2% (10 minutes).

**Inputs checked:**
- **LLM** at gpt-4.1-mini regional prices from the API, with the measured 94% cached share.
- **TTS** at $15 per 1M characters, about 241 characters per minute.

**Caveats:**
- Cancelled Azure OpenAI streams are imputed for prompt tokens only; this effect is small.
- FX 95 is an assumption.

## Corrections to carry into synthesis

- **C1 latency (claims 1 and 2).** State it as "first TTS byte at the VM, no telephone leg". Say 55 of 60 turns (92%) were answered within 1.2 s, not 95%.
- **C6 tail (claim 2).** Call it marginal: call-cluster p90 CIs overlap, turn-level Fisher p = 0.044.
- **C6-gated cost (claim 7).** Report ₹0.88-0.95 as a list-price floor. The OpenRouter ledger suggests about ₹0.91-0.99. Transcribe-live's gated and interim billing should be confirmed on a paid key with billing export before this goes into a price.
- **Elderly-pause cut-ins (claim 5).** Note that the gpt-oss cut-ins were two-word continue prompts, and the other LLMs answered substantively.
