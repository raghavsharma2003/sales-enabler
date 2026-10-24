# VP voice-stack synthesis: can a human-like Indian voice agent be sold at ₹2 a minute?

Date: 2026-10-19. Author: modelling and synthesis lead. Brief: `voice-stack-brief.md` (owner directive 2026-10-18).
Scope: pricing and latency only. Nothing was built.

## How to read the tags

| tag | file |
|---|---|
| `[g1:x]` | `lanes/g1-gemini-desk/x` (Gemini prices, billing rules, lifecycle, Meera archaeology) |
| `[g2:x]` | `lanes/g2-gemini-live-measured/results/x` (Gemini Live on the free test key, sandbox and India VM) |
| `[g3:x]` | `lanes/g3-cascade-measured/results/x` (cascades measured from the India VM) |
| `[g4:x]` | `lanes/g4-market-selfhost/x` (desk prices for other vendors and self-hosting; no measurements) |
| `[g5:x]` | `lanes/g5-gemini-paid/results/x` (Gemini Live and TTS on the owner's paid key) |
| `[m:x]` | `model/results/x` (this lane: `model/pricing_model.py`, seed 20261019, n = 20,000) |
| `[v:lane]` | that lane's `verify.md`. Where a verifier corrected its lane, the verifier wins. |
| `[10-17]` | `research/2026-10-17/SYNTHESIS-v2.md` |

**Units.** All figures are ₹ per connected minute, ex-GST, at list price, FX ₹95/$ (Monte Carlo range 90-100), with
2026 prices unless stated.
- **"AI"** means speech-to-text, the LLM and text-to-speech, or one speech-to-speech model.
- **"COGS"** is AI plus telephony (₹0.38-0.48 per minute on 30-second pulses) plus ₹0.03 of orchestration
  infrastructure (an assumption).

**Latency vantage.** "India VM" is a Central India Azure VM with no telephone leg. "Sandbox" is US-East through the
egress proxy. Latency always means caller end-of-speech to the first agent audio byte at the VM.

**Biggest limit.** No stack has been heard by a human rater. "Human-like" is untested everywhere in this document.

---

## 0. The answer

1. **₹2 a minute all-in cannot be met at a 40-60% gross margin by any stack we measured end to end.**
   - **Budget.** At ₹2 ex-GST, the allowed AI cost is ₹0.34-0.74 a minute (₹0.54 at 50% margin). If the ₹2 includes
     GST, it is ₹0.22-0.56 [m:ai_budget_inr2.csv].
   - **Cheapest measured stack: C6g**, which is VAD-gated gemini-3.5-transcribe-live, then gpt-oss-120b on Groq, then
     an Azure neural voice.
     - At the reference workload it costs ₹0.94 a minute. The Monte Carlo puts it at ₹1.07 at 3 minutes (p10-p90
       0.91-1.22) [m:deterministic_by_stack_length.csv, m:mc_by_stack_length.csv].
     - That is about twice the budget. At ₹2, C6g earns 28% gross margin at the reference workload. With a realistic
       persona, light memory and short calls it earns 14% [m:tiers.csv].
2. **What price works.**
   - **The cheapest measured stack.** C6g with a stock neural voice needs ₹2.86 a minute for 40% margin and ₹3.43 for
     50%, on the Monte Carlo with persona and memory [m:tiers.csv].
   - **An expressive Azure voice.** With DragonHD it needs ₹3.77 for 40% and ₹4.52 for 50%.
   - **Gemini 3.8 Live.** A 3-minute call needs ₹10.4 for 40% and ₹12.4 for 50%, on the paid meter at a lean persona
     [m:deterministic_by_stack_length.csv from g5].
   - **The structure nearest ₹2.** ₹2.25 a minute for the agent, with telephony passed through at cost (about
     ₹0.40-0.48), keeps a 44% margin on C6g. At ₹2.00 plus telephony the margin is 37% [m:tiers.csv].
3. **Recommended offer (§5). Base ₹2.99 a minute ex-GST (₹3.53 including GST).**
   - At that price base earns a 43% margin on the Monte Carlo and 49% at the reference workload.
   - It undercuts Sarvam Samvaad Growth, which is ₹3.15 plus ₹0.40 telephony
     [g4:prices.csv; 2026-10-17 l2 `vendor-and-telephony-prices.csv`].
   - **Plus is ₹3.99 and premium is ₹6.49**, plus ₹3.5 lakh a month for each dedicated voice.
   - **Base drops to ₹2.49, or ₹2.00 at scale,** only when one of the two cheap paths in point 6 passes the listener
     panel and the India latency test.
4. **Gemini Live does not fit any tier on cost, timing or residency.**
   - **Cost on the paid meter.** Gemini Live costs:
     - ₹2.47-3.34 a minute at 1 minute;
     - ₹4.19-5.72 at 3 minutes;
     - ₹6.38-12.70 at 10 minutes [g5:cost_per_minute_summary.csv].
   - **Why it grows.** Every turn re-bills the whole audio context, about 70% of the cost [g5, g1:verify.md #2].
   - **Persona size.** A Meera-size persona of about 13k tokens raises a 3-minute call to ₹8.2 a minute on 3.1 and ₹11.6
     on 3.8 [m:sensitivity_3min.csv].
   - **Other failures.** Gemini Live has no India region [v:g1 #7]. 3.8 talks over the caller on 42% of turns [g5].
     3.1, Meera's model, shuts down 2026-11-17 [v:g1 #6].
5. **Latency is not the bottleneck. Turn-taking is.**
   - **Speed.** From the India VM:
     - the fast cascades reach first audio at p50 989-1,044 ms (C1, C1g, C3, C6, C6g) [g3:rederived_latency.csv];
     - 3.8 Live reaches it at 1,006 ms [g5:latency_summary.csv].
   - **Interruptions.** Every one of them cuts in on 15-42% of turns. Every one starts talking in the elderly caller's
     2.4-second pause, 100% of the time [g3:rederived_pause_cutins.csv, g5:quality_elderly_pause_cutins.csv].
   - **Verdict.** No stack passes V4, which needs p50 ≤ 1.2 s and cut-ins ≤ 5%.
6. **₹2 becomes reachable only through paths nobody has heard or timed yet.**
   - **Inworld all-in** (STT-1, Gemma 4 26B and TTS-2 Flash) costs ₹0.53 a minute on desk prices, once volume uses up
     its $1,500-a-month Growth credits, at about 250k minutes a month [m:volume_curve.csv; g4].
   - **Self-hosting** IndicConformer and Veena on Indian GPU clouds costs ₹0.43-0.51 a minute from about 2.5M minutes a
     month. That rests on vendor-claim throughput [m:volume_curve.csv; g4:selfhost.csv].
   - Either one would make ₹2 a 48-50% margin price, but only after it passes the listener panel and the India
     latency battery.
7. **Meera's "~₹1.3 a minute" was never a measured cost (§6).**
   - Meera's own model costs 2-4x that on the paid meter at a persona 1/15 of Meera's: ₹2.47 at 1 minute and ₹4.19-4.71
     at 3 minutes [g5].
   - The figure most likely restates a computed $0.0142 a minute from 2026-08-23. That calculation billed the system
     prompt once per connection and ignored per-turn re-billing [v:g1 #5].

---

## 1. The allowed AI budget at a ₹2 price

**Formula.** Allowed AI = net price × (1 − gross margin) − telephony − infrastructure.

**GST.**
- **Ex-GST.** For a B2B self-serve platform the usual quote is ex-GST: the customer pays ₹2 plus 18% GST and the net is
  ₹2.00.
- **GST-inclusive.** If ₹2 includes GST, the net is ₹1.695.
- **Inputs.** GST paid on inputs, including IGST paid under reverse charge on imported services (Google, Groq,
  OpenRouter, Inworld), is recoverable as input tax credit. So COGS are modelled ex-GST. This is an assumption for a CA to
  confirm.

| ₹2 treated as | margin | telephony ₹0.38 | ₹0.43 | ₹0.48 | 1600 at ₹0.60 | 1600 at ₹0.80 |
|---|---|---|---|---|---|---|
| ex-GST (net ₹2.00) | 40% | 0.79 | **0.74** | 0.69 | 0.57 | 0.37 |
| ex-GST | 50% | 0.59 | **0.54** | 0.49 | 0.37 | 0.17 |
| ex-GST | 60% | 0.39 | **0.34** | 0.29 | 0.17 | -0.03 |
| GST-inclusive (net ₹1.695) | 40% | 0.61 | 0.56 | 0.51 | 0.39 | 0.19 |
| GST-inclusive | 50% | 0.44 | 0.39 | 0.34 | 0.22 | 0.02 |
| GST-inclusive | 60% | 0.27 | 0.22 | 0.17 | 0.05 | -0.15 |

All values include ₹0.03 of infrastructure [m:ai_budget_inr2.csv; the formula is live in `pricing-model.xlsx` Budget].

**Notes.**
- **Agreement with the lanes.** Without infrastructure this reproduces the lanes' ₹0.20-0.82 range (central ₹0.57)
  [v:g2 #8; g3:ai_budget.csv; g4:summary.json].
- **Pulse rounding.** 30-second telephony pulses add about 15 seconds per call. That is +₹0.11 a minute on a 1-minute
  call, +₹0.04 at 3 minutes and +₹0.01 at 10 minutes. The tier figures include it [m:tiers_by_length_deterministic.csv].
- **Telephony sources.** Plivo charges ₹0.38 a minute on 30-second pulses and Sarvam/Vobiz ₹0.40. Tata Smartflo
  concurrency plans work out to about ₹0.22 a minute at full use, which is a lever. Twilio India, at ₹4.7-6.6, is not
  viable (2026-10-17 l2 `vendor-and-telephony-prices.csv`).
- **1600-series numbers.** The per-minute price is published nowhere [10-17 §3.1, REG-24]. The ₹0.60 and ₹0.80 columns
  are sensitivities, not quotes. At ₹0.80, base drops from a 49% to a 35% margin at 3 minutes
  [m:tiers_by_length_deterministic.csv].
- **Not modelled.** Card or UPI gateway fees on self-serve top-ups (often about 2%) and platform R&D. The margin is
  gross margin.

---

## 2. Cost by stack and call length

**What the deterministic columns assume.** The reference workload is the one g3 used and its verifier confirmed: 5
exchanges a minute, with the agent speaking 24 s and the caller 24 s per minute.

**What the Monte Carlo varies** (common random numbers across stacks):
- exchanges a minute, triangular 3-5-7;
- agent speech, 15-24-40 s;
- caller speech, 12-22-32 s;
- FX, 90-100;
- the gated-STT ratio;
- the OpenRouter ledger factor, 1.0-1.45 [v:g3 #7];
- cache shares;
- the transcribe-live text billing (from measured 14.6 tokens per utterance up to Google's 175 tokens a minute);
- voice speaking rates;
- Live invocations per exchange, untyped tokens and listening-time billing;
- the soft compression trigger.

**Corrections applied to the lane figures.**
- **OpenRouter-routed LLMs** now include OpenRouter's 5.5% credit fee and the verifier's 1.2x ledger factor. This lifts
  g3's C6g from ₹0.893 to ₹0.941.
- **Gemini Live** is modelled per invocation and calibrated against g5's paid meter. The median absolute error is 4.5%
  across 24 calls, excluding the tight window, which the model overstates by 19-33% [m:live_calibration_vs_g5.csv].

### 2.1 AI cost per connected minute (₹), with COGS and margin at ₹2

| stack | evidence | 1 min | 3 min | 5 min | 10 min | MC 3-min p10-p90 | per 3-min call (AI) | COGS at 3 min | margin at ₹2 |
|---|---|---|---|---|---|---|---|---|---|
| **C6g** gated transcribe-live + gpt-oss@Groq + Azure neural | measured end-to-end [g3] | 0.92 | **0.94** | 0.96 | 1.01 | 0.91-1.22 | 2.82 | 1.44 | 28% |
| C6 same, STT ungated | measured [g3] | 1.21 | 1.24 | 1.27 | 1.35 | 1.21-1.52 | 3.72 | 1.74 | 13% |
| C1g Azure STT gated + gpt-4.1-mini + Azure neural (all-Azure) | measured, 1 pass [g3] | 1.33 | 1.36 | 1.38 | 1.46 | 1.15-1.57 | 4.07 | 1.85 | 7% |
| C1 Azure STT + gpt-4.1-mini + Azure neural (all-Azure, round-2 baseline) | measured [g3] | 2.16 | 2.19 | 2.22 | 2.29 | 2.08-2.37 | 6.56 | 2.68 | -34% |
| C6g-HD C6g with Azure DragonHD | computed from measured parts | 1.45 | 1.47 | 1.49 | 1.54 | 1.35-1.87 | 4.42 | 1.97 | 2% |
| C2 / C3 Azure STT + 4.1-mini or gpt-oss + DragonHD | measured [g3] | 2.67 | 2.70 | 2.73 | 2.81 | 2.48-3.01 | 8.1 | 3.19-3.20 | -60% |
| C8 transcribe-live + gemini-3.5-flash-lite + neural | measured, free tier [g3] | 1.49 | 1.53 | 1.58 | 1.70 | 1.25-1.74 | 4.60 | 2.03 | -2% |
| G-A all-Gemini (transcribe-live + flash-lite + 3.8-flash-lite-tts), 2026 / 2027 | computed composite [g3, g5] | 1.51 / 1.88 | 1.56 / 1.92 | 1.60 / 1.97 | 1.72 / 2.09 | 1.62-2.22 (2027) | 4.67 / 5.77 | 2.05 / 2.42 | -3% / -21% |
| G-E gated transcribe-live + gpt-oss + 3.8-flash-lite-tts, 2026 / 2027 | computed composite | 0.96 / 1.32 | 0.98 / 1.34 | 1.00 / 1.36 | 1.04 / 1.41 | 1.28-1.73 (2027) | 2.93 / 4.03 | 1.47 / 1.84 | 26% / 8% |
| Sarvam STT gated + gpt-oss + Bulbul V4 Flash (Growth) | desk [g4] | 1.01 | 1.04 | 1.07 | 1.15 | 0.87-1.29 | 3.12 | 1.54 | 23% |
| Inworld all-in, Growth credits | desk [g4] | 0.51 | **0.53** | 0.54 | 0.58 | 0.46-0.63 | 1.58 | 1.02 | 49% |
| Self-host IndicConformer + gpt-oss@Groq + Veena, E2E at 50% utilisation | desk, vendor-claim throughput [g4] | 0.40 | **0.43** | 0.46 | 0.54 | 0.36-0.55 | 1.30 | 0.93 | 54% |
| gpt-realtime-2.1-mini, prefix caching | desk [g4] | 1.81 | 1.91 | 2.02 | 2.29 | 1.75-2.64 (no cache: 6.93) | 5.73 | 2.41 | -20% |
| **Gemini 3.1 flash live**, paid meter, off / 6k compression | measured [g5] | 2.47 / 2.55 | 4.71 / 4.19 | 6.85 / 5.34 | 10.74 / 6.38 | 3.22-5.24 (model) | 14.1 / 12.6 | 5.21 / 4.69 | -160% / -134% |
| **Gemini 3.8 Live**, paid meter, off / 6k compression | measured [g5] | 3.31 / 3.34 | 5.72 / 5.72 | 8.05 / 7.94 | 12.70 / 9.05 | 4.61-7.40 (model) | 17.2 / 17.2 | 6.22 | -211% |

Sources: [m:deterministic_by_stack_length.csv, m:mc_by_stack_length.csv]. Live rows are g5's measured means, at n = 1-2
calls per cell [g5:cost_per_minute_summary.csv].

### 2.2 What moves the number

- **Cascade cost per minute is flat with call length.** The 10-minute figure is 1.05-1.15x the 1-minute figure
  [m:deterministic_by_stack_length.csv]. Gemini Live is 3.8-4.4x uncompressed [g5].
- **Persona and memory size: the variable that matters for plus and premium** [m:sensitivity_3min.csv, 3-minute call].

  | extra prompt tokens | C6g | 3.1 Live | 3.8 Live |
  |---|---|---|---|
  | 0 | 0.94 | 4.15 | 5.71 |
  | +4k | 1.31 | 5.38 | 7.52 |
  | +13k | 2.15 | 8.16 | 11.58 |

  - In cascades, prompt caching softens the effect, and part of the C6g increase comes from the harness's 1.8x
    speculative-request waste factor.
  - Live has no caching: cached tokens were 0 on every event [g5].
- **Call-length mix** (Monte Carlo, minute-weighted; the mixes are assumptions):

  | mix | C6g | 3.8 Live | 3.8 Live with 6k compression |
  |---|---|---|---|
  | short calls (median 2.5 min) | 1.09 | 9.2 | 7.4 |
  | companion calls (median 8 min) | 1.17 | 19.1 | 9.9 |

  Long relational calls are exactly where Live's cost explodes [m:mc_by_stack_length.csv].
- **The 2027-01-01 Gemini change.** 3.8 TTS and 3.x Flash text double in price; Live and 3.5-flash-lite do not change
  [g1:prices.json]. This adds ₹0.37 a minute to any stack using 3.8-flash-lite-tts and ₹0.55 with 3.8-flash-tts
  [m:deterministic].
- **Where the C6g rupee goes.**

  | component | ₹/min | share | caveat |
  |---|---|---|---|
  | transcribe-live STT | 0.38 | 41% | billing assumed proportional to gated audio, not verified |
  | LLM | 0.23 | 24% | |
  | Azure neural TTS | 0.33 | 35% | |

  [m:deterministic] [v:g3 #7]
- **FX.** ±5% across 90-100 moves C6g by ±₹0.05 [m:sensitivity_3min.csv].

---

## 3. Latency from India

| stack | p50 ms (95% CI) | p90 ms | n turns (calls) | cut-ins / talk-over | source |
|---|---|---|---|---|---|
| C1g Azure STT gated + gpt-4.1-mini + neural | 989 (967-994) | 1,072 | 28 (3) | 9/30; elderly pause 6/6 | [g3:rederived_latency.csv] |
| C1 Azure STT + gpt-4.1-mini + neural | 1,026 (1,017-1,035) | 1,143 | 58 (6) | 16/60 (27%); pause 12/12 | [g3] |
| C6 transcribe-live + gpt-oss + neural | 1,031 (1,010-1,052) | 1,404 | 60 (6) | 19/60 (32%); 12/12 | [g3] |
| C6g gated version (cheapest measured) | 1,038 (990-1,163) | 1,453 | 30 (3) | 7/30 (23%); 6/6 | [g3] |
| C3 Azure STT + gpt-oss + DragonHD | 1,044 (1,029-1,077) | 1,230 | 57 (6) | 16/60 (27%); 12/12 | [g3] |
| C2 Azure STT + gpt-4.1-mini + DragonHD | 1,133 (1,118-1,140) | 1,231 | 58 (6) | 9/60 (15%); 12/12 | [g3] |
| C7 / C8 with gemini-3.5-flash-lite (free tier) | 1,568 / 1,688 | 1,790 / 1,789 | 56 / 59 | 2/60; 12/12 | [g3] |
| Gemini-TTS cascades G-D / G-E / G-A (computed) | 1,842 / 1,978 / 2,532 | 2,180 / 2,405 / 2,722 | 57-60 × 40 TTS samples | n/a | [g3:composite_gemini_tts_latency.csv] |
| Round-2 config A (Azure, say-first) | 1,004 (989-1,017) | 1,105 | 48 clean | 18-50% by config; 12/12 | [10-17 §5] |
| **Gemini 3.8 Live, paid key** | 1,006 (950-1,253) | 1,524 | 30 (6) | 22/53 talk-over (42%); 8/8 pause | [g5:latency_summary.csv] |
| Gemini 3.8 Live + thinkingBudget:0, free key | 819 (784-847) | 1,514 | 26 (4) | 52% of spoken turns | [g2:latency_summary.csv] |
| Gemini 3.1 flash live, paid key | 1,950 (1,705-2,125) | 5,299 | 33 (6) | 4/37; 6/6 pause | [g5] |
| Gemini 3.8 Live, paid key, sandbox US-East | 1,382 (1,164-1,572) | 1,815 | 43 (6) | 11/54 | [g5] |

**Findings.**
- **Speed is available.** Four cascades and 3.8 Live sit at about 1.0 s p50 from India. The component floor is the
  LLM's first token: 253 ms for gpt-oss on Groq, 526 ms for gpt-4.1-mini, 783 ms for flash-lite (free tier)
  [g3:llm_india_summary.csv].
- **Gemini TTS is too slow for a reply path.** First byte is 857 ms p50 for flash-lite-tts and 1,094 ms for flash-tts on
  the paid key, plus 0.14-0.36 s of leading silence [g5:tts_summary.csv].
- **Turn-taking fails everywhere.** Cut-ins fall only on clips with internal pauses of 0.72 s or more [v:g3 #6].
  - The cause is the 500 ms end-of-turn rule in cascades and the 300 ms Meera VAD in Live.
  - What the agent says into the pause depends on the LLM. gpt-oss says only "please go on" (12/12). gpt-4.1-mini and
    flash-lite answer the half-finished question (12/12) [v:g3 #5].
- **Paid and free keys show no reliable latency difference from India.** The one exception is 3.8 from the sandbox,
  where paid was 278 ms faster [g5].
- **These are server-side figures.** The telephone leg adds an estimated 0.25-0.45 s [10-17 §5, LAT-13]. Turns are
  counted as answered turns: C1 answered 55 of 60 turns within 1.2 s, not 95% [v:g3 #1].

---

## 4. Where volume moves the cost

Reference workload, 3-minute call [m:volume_curve.csv; chart `model/charts/ai_cost_vs_volume.png`]:

| minutes / month | C6g pay-as-you-go | Azure STT gated + neural with commitment tiers, gpt-oss | Inworld all-in (desk) | self-host on E2E (desk) |
|---|---|---|---|---|
| 100k | 0.94 | 1.32 | 0.87 (on-demand is cheaper below the credit floor) | 6.50 (2-GPU fleet floor) |
| 250k | 0.94 | 1.18 | 0.57 | 2.75 |
| 1M | 0.94 | 1.17 | 0.53 | 0.87 |
| 2.5M | 0.94 (0.83 with an Azure TTS commitment) | 0.94 | 0.53 | 0.51 |
| 10M | 0.94 (0.78) | 0.78 | 0.53 | 0.43 |

**Findings.**
- **Azure commitment tiers do not reach the budget.** The 100K-hour STT and 2,000M-character TTS tiers are scale
  levers, and even at 10M minutes they leave the Azure path at ₹0.78.
- **Inworld becomes the cheapest managed path** once Growth credits are used, at about 250k minutes a month. Its Hindi
  quality, its India latency and its residency (India residency only on Enterprise) are all unverified [g4:vendor-risk.csv].
- **Self-hosting beats everything from about 2.5M minutes a month.** It rests on vendor-claim throughput and 50%
  utilisation. The cheapest decisive test is a few hours of IndicConformer on one E2E L4 and Veena on one H100, about
  ₹1-2k [g4].

---

## 5. The three-tier offer

**How it is priced.**
- Prices are ex-GST per connected minute, with telephony included.
- COGS is the Monte Carlo minute-weighted value over the short-call mix, including a persona and memory range for each
  tier.
- "Ref" is the deterministic 3-minute case. Formulas are live in `pricing-model.xlsx` (Calc and Tiers) [m:tiers.csv,
  m:tiers_by_length_deterministic.csv].
- **No tier promises "exactly human".** Each must pass the listener panel's human-likeness bar against a human reference
  before it is sold as such.

| tier | stack | price (incl. GST) | per call, 3 / 10 min | AI | COGS (p10-p90) | gross margin | P(call margin ≥ 40%) |
|---|---|---|---|---|---|---|---|
| **Base**: human-like, emotional and relational voice | C6g pipeline: VAD-gated gemini-3.5-transcribe-live, gpt-oss-120b on Groq, stock Azure neural voice (or whichever stock voice the panel picks at equal cost); persona plus light memory (0-3k tokens) | **₹2.99** (₹3.53) | ₹8.97 / ₹29.90 | ₹1.22 (ref 1.03) | ₹1.72 (1.51-1.93) | **43%** (ref 49%) | 0.70 |
| *Base, if the panel rejects the neural voice* | same with Azure DragonHD | ₹3.49 needs to rise to ₹3.77 for 40% | | ₹1.76 | ₹2.26 (1.97-2.56) | 35% (ref 41%) | 0.24 |
| **Plus**: learning agents | base plus learned memory in context (2-8k tokens) plus a post-call learning pass on gpt-4.1-mini (South India) | **₹3.99** (₹4.71) | ₹11.97 / ₹39.90 | ₹1.65 (ref 1.41) | ₹2.14 (1.87-2.59) | **46%** (ref 52%) | 0.77 |
| **Premium**: deep personalisation and a dedicated voice | India-processed: Azure STT gated (Central India), gpt-4.1-mini (South India), Azure Custom Neural Voice; 5-16k tokens of personal memory | **₹6.49** (₹7.66), plus ₹3.5 lakh a month per dedicated voice | ₹19.47 / ₹64.90 | ₹3.02 (ref 2.88) | ₹3.52 (3.00-4.30) | **46%** (ref 48%) | 0.73 |

**Why each tier is built this way.**
- **Base.** C6g is the cheapest stack measured end to end, and it is fast: 1,038 ms p50 from India [g3].
  - Its text exists before speech, so the code gate (law 25) works unchanged.
  - Customer data leaves India: Groq runs in the US and the Gemini API offers no residency [g4:vendor-risk.csv, v:g1 #8].
  - An all-Azure base (C1g) would cost ₹1.36 for AI and needs ₹3.09 for 40% margin [m:deterministic]. The
    sales-enabler `AGENTS.md` still names Azure as the only approved paid inference provider for the product, so using
    Google and Groq in production is an owner decision.
- **Plus.** Learning adds prompt tokens, not a new pipeline. A larger in-context memory costs about ₹0.09 a minute per
  extra 1k tokens on gpt-oss with caching [m:sensitivity_3min.csv]. The post-call pass costs ₹0.04-0.29 a minute,
  depending on call length [m:tiers_by_length_deterministic.csv].
- **Premium.** The whole call is processed in India: Azure Speech in Central India and gpt-4.1-mini in South India
  [g4:vendor-risk.csv]. That is the configuration a regulated buyer can accept.
  - The dedicated voice costs $24 per 1M characters plus $4.032 an hour of model hosting, which is ₹2.80 lakh a month
    per voice (Azure Retail Prices API, centralindia, read 2026-10-19,
    `model/inputs/azure_custom_voice_centralindia_2026-10-19.json`).
  - The monthly voice fee of ₹3.5 lakh covers that hosting at a 20% margin. It is enterprise-sized, not self-serve.

**Positioning.** Indian market prices for context:
- Sarvam Samvaad: ₹3.00-3.50 a minute plus ₹0.40 telephony [g4].
- Ringg: ₹6 all-in.
- Bolna: 6¢ a minute, about ₹5.5. An unverified secondary source quotes Bolna enterprise commitments at ₹1.75-2.
- SquadStack: ₹2-5 (2026-10-17 l2 data).

₹2.99 all-in is below every verified Indian list price we hold.

### Kill criteria (pre-registered, dated 2026-10-19)

**Base**
1. **Human-likeness.** The listener panel rates the base voice's human-likeness and warmth below the A/A noise floor of
   the best-rated candidate. The candidates include a human reference, DragonHD, Inworld TTS-2 and Bulbul V4.
   - Then switch the voice and re-price: DragonHD means ₹3.77 or more for 40% margin.
2. **Billing.** Reconciled provider billing over at least 1,000 real minutes shows base AI cost above ₹1.25 a minute at
   the 3-minute median, which is 20% above the model.
   - Then re-price, or move STT from transcribe-live to Azure gated (+₹0.37).
3. **Timing.** After the pause-aware release policy, base fails either check on the elderly or Hinglish persona over a
   real Indian phone line: p50 above 1.2 s, or cut-ins above 5%. This is V4.
4. **Margin.** Gross margin stays below 40% for two consecutive months at list price.
5. **STT metering.** Google meters transcribe-live by wall-clock session time rather than gated audio. That would add
   ₹0.26-0.50 a minute.
   - Then use Azure gated STT and re-price.

**Plus**
1. **Recall.** Recall accuracy across repeat calls falls below 95%, or stored preferences are ignored more than 1 time in
   20 (V6).
2. **Latency.** The memory prompt pushes p50 above 1.2 s.
3. **Value.** Customers do not pay the ₹1 premium. Plus attach is below a threshold the owner sets before launch.

**Premium**
1. **Voice.** In the blind panel, the dedicated voice does not beat the base voice by more than the noise floor.
2. **Licensing.** Microsoft's limited-access approval for Custom Neural Voice is refused or delayed past launch. This is
   not verified in this programme.
3. **Model successor.** No India-region successor to gpt-4.1-mini, which retires 2027-04-14, is announced by
   2027-02-01 (KC10 in [10-17 §5]).
4. **Consent.** Voice-talent consent and rights cannot be contracted.

**Price moves**
- **Base down to ₹2.49.** When Inworld all-in or self-host passes the panel and the India battery, and billing
  reconciles within 10%.
- **Base down to ₹2.00.** When self-host carries at least 2.5M minutes a month at 50% utilisation and above.
- **Base up to ₹3.49.** Before the 2027-01-01 Gemini TTS doubling only if Gemini TTS is the chosen voice. It is not in
  the recommended stack.

---

## 6. Verdict on the owner's "~₹1.3 a minute" for Maya

**Not reproduced. The number was a computation, never a measurement, and it is 2-8x too low.**

**What the ₹1.3 most likely is.**
- Meera's `callcost-2026-08-23` entry gives $0.0142 per typical minute.
- It was computed from code constants at list price, with the system prompt billed once per goAway rotation and no
  per-turn re-billing.
- The product itself ran on a free key pool at $0 [v:g1 #5].
- At Meera's own FX of about ₹85-86 to the dollar that is ₹1.21-1.22, and at ₹95 it is ₹1.35.
- **Other candidates.**
  - `watchcost-measured` gives ₹1.1-1.6, but from 25 sessions of 80 seconds each with the persona amortised.
  - `cache-plateau` gives about $0.013 a minute.
  - None is a full call measured under per-turn re-billing.
- **Confidence.** The identification is inferred, not recorded [v:g1 #5].

**The rule that breaks it was public before the estimate.** Per-turn context re-billing was already on Google's
best-practices page in a 2026-07-19 capture [v:g1 #2]. Live prices have not changed since August, and no change is
announced [v:g1 #1]. Nothing changed; the arithmetic left the rule out.

**What it costs on the paid meter today** (same model, gemini-3.1-flash-live-preview, Meera's voice and VAD, a persona of
869 text tokens) [g5:cost_per_minute_summary.csv]:

| call length | ₹ per minute |
|---|---|
| 1 min | 2.47 |
| 3 min | 4.19-4.71 |
| 5 min | 5.34-6.85 |
| 10 min | 6.38-10.74 |

- **At Meera's own persona** of about 12-14k tokens, a 3-minute call is ₹8.2 a minute [m:sensitivity_3min.csv]. g1
  computed ₹9.1 [g1:live_cost_model.csv].
- **It is also too high for the budget.** Even at face value, ₹1.3 is above the ₹0.34-0.74 AI budget a ₹2 price
  allows (§1).
- **The model is going away.** It shuts down 2026-11-17, and the replacement, 3.8 Live, costs 18-34% more per minute
  [g5].

---

## 7. Predictions scored

The full scoring is appended to `predictions.md`; the table there is unchanged. **5 of 9 held.** Brier score 0.215,
against 0.25 for chance.

| id | prediction (short) | score |
|---|---|---|
| V1a | 3-min 3.1 Live > ₹1.3 | 1 |
| V1b | 10-min ≥ 1.5x 1-min, no compression | 1 |
| V1c | compression brings it within 1.3x | 0 |
| V2a | cheapest Gemini path ≤ ₹1.0 | 0 |
| V4a | Live p50 ≤ 1.2 s from India | 1 (3.8 only) |
| V4b | Live faster than the 1.0 s cascade | 0 (a tie) |
| V3a | transcript arrives after audio | 0 |
| V5a | a non-Gemini stack is cheaper | 1 |
| V7a | preview or recent, no guarantee beyond 12 months | 1 |

**V3a was the most confident miss.** On Gemini Live the transcript arrives with the first audio on 1,041 of 1,041
turns [g5:gate_lag_summary.csv]. Speech-to-speech is gateable by text. What rules Live out is cost, talk-over and
residency.

---

## 8. Risks

1. **No invoice reconciled.** Every ₹ figure is usage × list price.
   - **OpenRouter.** The ledger ran 1.2-1.77x per-response cost [v:g3 #7].
   - **Transcribe-live.** Gated and interim billing is unverified, and STT is 41% of base COGS.
   - **Gemini Live.** Proactive listening time, untyped tokens and prompt-only events may bill differently from the
     meter [v:g2].
2. **Human-likeness is unmeasured on every stack.** The base price assumes a stock neural voice passes. If DragonHD is
   needed, base must rise about ₹0.78.
3. **Turn-taking.** Cut-ins run at 15-42% on every stack, and every stack takes the elderly caller's pause [g3, g5].
   - A fix that waits longer can push p50 past 1.2 s.
   - The phone leg is unmeasured: +0.25-0.45 s [10-17].
4. **Lifecycle.**

   | model or vendor | event | date or source |
   |---|---|---|
   | 3.1 flash live and 3.1 flash TTS | shut down | 2026-11-17 [v:g1 #6] |
   | Hume TTS and EVI | end | 2026-11-13 [g4] |
   | Gemini 3.8 TTS and 3.x Flash | double in price | 2027-01-01 [g1:prices.json] |
   | gpt-4.1-mini (premium) | retires | 2027-04-14 [g3:cost_inputs.csv] |
   | Deepgram streaming prices | promotional | [g4] |
5. **Data and terms.**
   - **Base processes customer audio outside India**: Groq and OpenRouter in the US, the Gemini API with no residency
     [g4, v:g1 #8].
   - **Default training.** Sarvam, ElevenLabs, Cartesia and Deepgram train on content by default unless we opt out [g4].
   - **Gemini API age terms.** They bar API clients "likely to be accessed by individuals under the age of 18", a live
     risk for the study-abroad configuration [v:g1 #8].
6. **1600-series telephony is unpriced.** At ₹0.60-0.80 a minute, base margin falls to 35-43% at 3 minutes [m].
7. **Provider policy.** Base needs owner approval for Google and Groq/OpenRouter as paid production providers, because
   sales-enabler `AGENTS.md` names Azure only.
8. **The cheap paths are desk numbers.** Inworld's credit floor and self-host fleet utilisation make ₹2 a volume bet,
   not a launch price [m:volume_curve.csv].
9. **Free-tier-only measurements.** Some figures exist only from the free tier: flash-lite TTFT and transcribe-live
   latency [g3]. Paid and free metered identical token counts on Live [g5], but paid latency for those components is
   not measured.

---

## 9. Next tests, in order

| # | test | what it settles | cost |
|---|---|---|---|
| 1 | Listener panel on g3's 27 matched expressive samples plus g5's Live samples, against a human reference. The owner recruits raters. | Base voice choice; V2; whether DragonHD is needed (+₹0.78 on price) | owner time |
| 2 | Paid-key billing reconciliation: about 20 C6g calls of known length on transcribe-live, OpenRouter/Groq and Azure, against the billing export, within 10% | Kill criterion base-2; the transcribe-live gating assumption | about ₹300 |
| 3 | Inworld all-in from the India VM on the battery, Hindi and Hinglish: latency, cut-ins and samples for the panel | Whether ₹2.49 → ₹2.00 is reachable without self-hosting | about ₹500 plus Inworld credit |
| 4 | Self-host throughput: IndicConformer on one E2E L4, Veena on one H100 | The ₹0.43-0.51 path at ≥ 2.5M minutes a month | about ₹1-2k [g4] |
| 5 | Pause-aware release policy on C6g, re-running the 4-persona battery | V4 cut-in ≤ 5% with p50 ≤ 1.2 s | about ₹200 Azure |
| 6 | CPaaS trial number: battery from an Indian handset, plus a 1600-series quote | Phone-leg latency and telephony price | owner action |
| 7 | Plus/premium memory prompts (4-16k tokens): TTFT for gpt-oss@Groq and gpt-4.1-mini from India | Plus kill criterion 2 | about ₹100 |
| 8 | Only if test 1 shows Live winning human-likeness beyond the noise floor: 3.8 Live at production persona size, at least 3 calls per cell, plus a billing export | Whether a Live premium tier can exist (needs ₹10.4 or more a minute at 3 minutes) | about $10 |

---

## 10. What this synthesis does not establish

- **Callers.** All are synthetic Azure voices.
- **Phone line.** No call crossed an Indian telephone network.
- **Conditions.** All runs were outside Indian business hours.
- **Raters.** No human rater heard anything.
- **Verification.** g4 had no adversarial verifier. Its numbers are desk prices.
- **Sample sizes.** g5 cost cells are n = 1-2 calls. The gated cascade runs are 1 pass, 30 turns.
- **Model choices.** The Monte Carlo ranges for workload, call mix, persona size, infrastructure and the 1600 telephony
  price are modelling assumptions. They are labelled "assumption" in `model/results/inputs.csv`.
- **Spend.** This lane spent ₹0, $0 OpenRouter and $0 Gemini. It created no Azure resources. Its only network call was
  a free, unauthenticated read of the Azure Retail Prices API.
- **Programme spend.** The Azure ledger (`vp-spend.jsonl`, all lanes since 2026-10-17) estimates ₹4,218. g5 spent $14.88
  of the $20 Gemini prepaid credit.

## Files

| path | contents |
|---|---|
| `model/pricing_model.py` | the model; run with `python3 pricing_model.py` |
| `model/build_xlsx.py` | builds the workbook; `--check` verifies the formulas against Python (76 rows, worst difference 0.000000) |
| `model/pricing-model.xlsx` | live formulas in Params, Budget, Calc and Tiers; values in Live_g5, MC, Volume, Sensitivity, Latency and Calibration |
| `model/results/*.csv` | `deterministic_by_stack_length`, `mc_by_stack_length`, `ai_budget_inr2`, `tiers`, `tiers_by_length_deterministic`, `volume_curve`, `sensitivity_3min`, `live_calibration_vs_g5`, `latency_by_stack`, `inputs`; plus `summary.json` |
| `model/charts/ai_cost_by_stack_3min.png` | AI cost by stack at a 3-minute call, against the budget band |
| `model/charts/ai_cost_vs_volume.png` | AI cost by monthly volume, against the budget band |
| `model/inputs/azure_custom_voice_centralindia_2026-10-19.json` | primary price read for Azure Custom Neural Voice |
