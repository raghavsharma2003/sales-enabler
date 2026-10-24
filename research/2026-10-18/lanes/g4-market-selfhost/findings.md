<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused the file write). -->

# g4-market-selfhost: published prices, self-hosting estimates and vendor risk

> The harness refused to let the lane write `findings.md`. The coordinator should save this text as
> `research/2026-10-18/lanes/g4-market-selfhost/findings.md`.

Lane g4-market-selfhost (V5 desk, V7 for non-Gemini providers). Desk work only. This lane spent nothing on OpenRouter,
Gemini or Azure. Prices were read from primary pages on 2026-10-18 (the raw pages are saved in the scratchpad at
`research-raw-1018/g4-market-selfhost/`). The model was recomputed on 2026-10-19 with the workload matched to g3's
measurements.

**Conventions.**
- ₹95 per US dollar.
- Every ₹ figure excludes GST. It is AI cost per **connected minute** at list price for a 3-minute call, unless a row
  says otherwise.
- "Measured" appears only where another lane measured the number (g3, g5). This lane measured nothing.
- Every self-hosting throughput figure is a vendor claim, a third-party benchmark or our own assumption. None of them
  is measured.

Files in `research/2026-10-18/lanes/g4-market-selfhost/`:

| file | contents |
|---|---|
| `prices.csv` | 67 component and all-in rows, each with unit price, ₹/min, workload basis, source URL, date read, method and confidence |
| `selfhost.csv` | 231 rows: model × GPU × provider × term, at 30/50/70% utilisation, plus the 2-GPU fleet floor and ₹/min at 100k, 1M and 5M min/month |
| `vendor-risk.csv` | 21 providers |
| `summary.json` | budget grid, stack totals, break-evens |
| `compute.py` | regenerates everything above |

## 1. Answer first

1. **The budget.** A price of ₹2.00 per minute, GST extra, leaves **₹0.42-0.82 per minute for AI**. That assumes
   ₹0.38-0.48 telephony and a 40-60% gross margin. If the ₹2.00 includes GST, the budget falls to ₹0.20-0.64.
2. **No managed stack fits at list price, except one cheap plan with untested Hindi.**
   - The cheapest managed Indian-vendor cascade is Sarvam STT + gpt-oss-120b on Groq + Bulbul V4 Flash. It costs
     **₹1.19** a minute on Growth plans, or **₹0.99** with VAD-gated STT.
   - Inworld's all-in stack is **₹0.54** on its $1,500/month Growth plan and **₹0.88** on demand. That is the only
     managed stack inside the budget, and its Hindi has not been listened to.
   - g3's measured India cascade (C6 gated) costs **₹0.85**, with Azure neural, not expressive, TTS.
   - Every all-in agent platform and speech-to-speech API costs **₹1.9-7.8** a minute.
   - Sarvam's own retail all-in price (₹3.00-3.50) is above our target price.
3. **TTS is the largest line in every Indian cascade, and STT is second.** With Sarvam components, TTS is ₹0.60, STT
   ₹0.41 (or ₹0.21 if gated) and the LLM ₹0.19. Fast LLM serving is already cheap.
   - gpt-oss-120b on Groq with caching: ₹0.19. g3 measured ₹0.187-0.189 for the same model.
   - gpt-6-luna with caching: ₹0.07.
4. **Self-hosting reaches the budget on paper, but rests on throughput nobody has measured.**
   - Open Indic STT plus open Indic TTS on Indian GPU clouds comes to **₹0.37-0.47** a minute with Groq as the LLM.
     The inputs are IndicConformer on an L4 at ₹0.05 a minute and Veena on an H100 at ₹0.10-0.23.
   - That holds only at 50% average utilisation and at volume. A 2×H100 Veena fleet costs ₹3.9-5.5 lakh a month. It
     beats Bulbul V4 Flash only above about 0.66-0.93 million connected minutes a month.
   - Neither IndicConformer streaming nor Veena's concurrency has been benchmarked.
   - Veena's Hugging Face card was last modified 2025-10-05 and shows 3,948 downloads.
5. **Azure GPUs are expensive at list price.** Central India list prices are 2.4-2.6× E2E Networks for H100 and A100.
   The founder grant makes them free for now. On 3-year reserved prices, the grant-funded self-hosted stack models at
   **₹0.30**.
6. **Vendor risk changes the shortlist.**
   - **Hume is dead**: its TTS and EVI APIs end on 2026-11-13.
   - Sarvam, ElevenLabs, Cartesia and Deepgram all **train on customer content by default** unless we opt out.
   - India-region *processing* exists only for:
     - Azure Speech and Azure regional text models;
     - our own models on E2E, Yotta or Jarvislabs;
     - Yotta Shakti Studio's hosted gpt-oss-120b (price unit ambiguous, see §4).
   - Inworld and ElevenLabs offer India residency only on Enterprise plans, and ElevenLabs' covers storage only.
   - OpenAI's India endpoint stores data in India but does not process it there.
   - Gemini has no India region for Live.

## 2. Workload and budget assumptions (state these whenever a number is quoted)

The workload matches g3's reference shape: 5 exchanges a minute, agent 40% and caller 40% of talk time
(`g3-cascade-measured/results/analysis_output.txt`).

| quantity per connected minute | value | basis |
|---|---|---|
| agent speech | 24 s (26.4 s synthesised, ×1.10 waste) | g3 reference shape; l2 waste |
| TTS characters | **352** (alt 440) | 800 characters per agent-minute ×1.10. g3 measured 10.0 (neural) to 17.5 (HD) characters per agent-second including wasted responses, so 241-420 a minute. The alternative, 440, is the vendors' "1,000 characters ≈ 1 minute" rule. |
| STT audio billed | **60 s** streamed (alt 30 s VAD-gated) | streaming bills the whole call. The gated figure is caller share ×1.25, as in g3. |
| LLM input tokens | **19,688** | 5 × 2,140 × 1.84. Measured in g3 (C3/C6, gpt-oss-120b@Groq, n=60 exchanges each): prompt base about 1,730 tokens growing about 55-61 per exchange, a waste factor of 1.84 (1.85-1.9 responses per turn), cached share 0.82-0.83. |
| LLM output tokens | **396** | 5 × 43 × 1.84 (g3: 76-85 completion tokens per exchange, including waste) |
| prompt cache share | **0.83** where the provider caches | the no-cache column in prices.csv applies otherwise |
| Gemini TTS audio tokens | 25 per second | g1; g3 measured 24.8 |
| Realtime S2S (OpenAI-style) | user audio 10 tokens/s, assistant 20 tokens/s; context re-sent every turn; 2k-token system prompt | the rates are read-primary from developers.openai.com/api/docs/guides/realtime-costs ("1 token per 100 ms … 1 token per 50 ms"); the cache-hit pattern is an assumption |

Recomputing from the earlier l2-style workload (15,000 input tokens, 70% cached) to this g3-matched one moved stack
totals by no more than ₹0.04 a minute.

**Price to AI budget** (`summary.json` → budget):

AI budget = net price × (1 − margin) − telephony.

| ₹2.00 is… | telephony | 40% margin | 50% | 60% |
|---|---|---|---|---|
| GST-exclusive (net ₹2.00) | ₹0.38 | **0.82** | **0.62** | **0.42** |
| GST-exclusive | ₹0.48 | 0.72 | 0.52 | 0.32 |
| GST-inclusive (net ₹1.695) | ₹0.38 | 0.64 | 0.47 | 0.30 |
| GST-inclusive | ₹0.48 | 0.54 | 0.37 | 0.20 |

Telephony cross-check (read-primary): Sarvam's own Vobiz telephony costs ₹0.20 per 30-second pulse, which is ₹0.40 a
minute (sarvam.ai/products/voice-agents/pricing, read 2026-10-18).

## 3. Whole-stack AI cost per connected minute (3-minute call, list price, ₹ excl. GST)

Sorted cheapest first. Totals computed from the components in §4 (`summary.json` → stacks), except rows marked
measured.

| ₹/min | stack | fits ₹0.42-0.82? | caveat |
|---|---|---|---|
| 0.30 | Self-hosted on the Azure grant, 3-year RI: IndicConformer on T4, Veena on H100 NVL, gpt-6-luna cached | yes | throughput assumed; 50% utilisation; grant-funded; not India-processed for the LLM |
| 0.37 | Self-hosted on E2E: IndicConformer on L4, Veena on H100 on demand, gpt-oss-120b@Groq | yes | throughput assumed; 50% utilisation; needs about 1M min/month to fill the fleet floor |
| 0.47 | same, Veena at its low capacity (24 streams per H100) | yes | |
| 0.54 | **Inworld all-in, Growth ($1,500/month)**: STT-1 $0.10/h, Gemma 4 26B $0.07/$0.34, TTS-2 Flash $7/1M characters | yes | Hindi is "Tier 1" for TTS by vendor claim; STT Hindi not verified; no listening test |
| 0.83 | Self-hosted IndicConformer + Groq + Bulbul V4 Flash Growth | 40% margin only | |
| 0.85 | **g3 measured, C6 gated**: Gemini transcribe-live + gpt-oss-120b@Groq via OpenRouter + Azure neural | 40% margin only | measured usage × list price; Azure neural is not an expressive voice |
| 0.88 | Inworld all-in, on demand | no | |
| 0.99 | Sarvam STT Growth, VAD-gated, + Groq + Bulbul V4 Flash Growth | no | needs our own VAD gate (g3 validated gating on Azure and Gemini STT, not Sarvam) |
| 1.01 | Gemini transcribe-live, gated, + Groq + Gemini 3.8 Flash-Lite TTS (2026 price) | no | Gemini TTS price doubles on 2027-01-01 |
| 1.02 | Azure grant at commitment-tier scale, VAD-gated STT | no | 100K-hour STT and 400M-character TTS commitments |
| 1.15 | Smallest Pulse + Groq + Lightning V3.1 | no | |
| 1.19 | **Sarvam STT Growth (streamed) + gpt-oss-120b@Groq + Bulbul V4 Flash Growth** | no | INR-billed; trains on content by default |
| 1.24 | g3 measured, C1 gated: Azure STT + gpt-4.1-mini + Azure neural | no | |
| 1.34 | Azure at commitment scale (streamed STT) | no | |
| 1.38 | Sarvam pay-as-you-go cascade | no | |
| 1.48 | India-processed managed: Sarvam STT + **Yotta Shakti gpt-oss-120b** + Bulbul | no | Yotta's ₹23.50/1M is applied to both input and output (low confidence) |
| 1.62 | Gemini transcribe + 3.1 Flash-Lite (cached) + 3.8 Flash TTS | no | g3 saw no implicit cache hits on Gemini |
| 1.91 | **gpt-realtime-2.1-mini** (OpenAI direct or Azure Global, grant) | no | ₹1.50 if the previous reply is also cache-served; **₹6.93 if caching fails**; the gate problem remains (law 25) |
| 1.99 | Deepgram Nova-3 (promotional) + Groq + Cartesia Sonic Scale | no | |
| 2.14 | ElevenLabs Scribe Realtime + Groq + Flash/v3 Conversational | no | ₹2.20 after the TTS price change |
| 2.70 | Azure pay-as-you-go: S1 STT + gpt-4.1-mini + DragonHD (g3 config A shape) | no | |
| 3.15 | Sarvam Samvaad Growth, retail all-in | no | this is a competitor's retail price, not a component |
| 3.48 | ElevenLabs Scribe + Groq + v4/v3 expressive | no | |
| 4.71 | Gemini 3.1 Flash Live, measured (g5, n=2 calls) | no | 10.74 at 10 minutes; earliest shutdown 2026-11-17 |
| 4.75 | Ultravox pay-as-you-go ($0.05/min) | no | |
| 4.82 | GPT-Live-1 ($0.05 per session minute, billed through silence) + gpt-6-luna | no | |
| 5.70 | Cartesia Managed Agents ($0.06/min) | no | |
| 5.72 | Gemini 3.8 Live, measured (g5, n=2) | no | 12.70 at 10 minutes |
| 7.12 | Deepgram Voice Agent Standard ($0.075/min) | no | |
| 7.79 | ElevenLabs Agents ($0.08/min) + Groq LLM | no | ₹15.2 at burst pricing |

**OpenAI realtime by call length** (computed): gpt-realtime-2.1-mini costs ₹1.81, 1.91, 2.02 and 2.29 a minute at 1,
3, 5 and 10 minutes with prefix caching. The full gpt-realtime-2.1 costs ₹6.75, 6.64, 6.73 and 7.05. With no cache
hits, mini costs ₹3.28, 6.93, 10.58 and 19.70. The realtime-costs page calls caching "best-effort and not guaranteed".
Measure the cache rate before pricing on it.

## 4. Component prices (read 2026-10-18 from the primary page; ₹/connected min at the §2 workload)

**TTS** (352 chars/min; the alternative is 440):

| vendor / product | list price | ₹/min | source |
|---|---|---|---|
| Inworld Realtime TTS-2 Flash: Growth / On-Demand / Enterprise | $7 / $15 / "sub-$5" per 1M characters | 0.23 / 0.50 | inworld.ai/pricing |
| Inworld Realtime TTS-2 (expressive, "steering"): Growth / On-Demand | $12.50 / $25 | 0.42 / 0.84 | inworld.ai/pricing |
| Azure Neural TTS 400M-character commitment (grant) | $9.75/1M overage | 0.33 | Azure Retail Prices API, centralindia |
| Gemini 3.8 Flash-Lite TTS / Flash TTS (to 2026-12-31) | $6 / $9 per 1M audio tokens | 0.38 / 0.57 (×2 from 2027) | ai.google.dev pricing; g5 measured ₹0.86 / ₹1.29 per *spoken* minute |
| Azure S1 Neural / DragonHD (grant) | $15 / $22 per 1M | 0.50 / 0.74 | Retail API |
| Smallest Lightning V3.1 / Pro | $0.175 / $0.195 per 10K | 0.59 / 0.65 | smallest.ai/pricing/models |
| **Sarvam Bulbul V4 Flash**: Growth / Pro / pay-as-you-go | **₹1.70 / ₹1.85 / ₹2.00 per 1K** | **0.60 / 0.65 / 0.70** | sarvam.ai/api-pricing |
| Groq Orpheus V1 (English only, preview) | $22/1M | 0.74 | console.groq.com/docs/models |
| Deepgram Aura-2 | $30/1M | 1.00 | deepgram.com/pricing |
| Sarvam Bulbul V3, pay-as-you-go | ₹3.00/1K | 1.06 | sarvam.ai |
| Cartesia Sonic-3.6, Scale ($299 for 8M credits) / Pro overage | $37.4 / $65 per 1M | 1.25 / 2.17 | cartesia.ai/pricing |
| ElevenLabs v4 Turbo / v3 Conversational / Flash | $0.04/1K | 1.34 | elevenlabs.io/pricing/api |
| MiniMax speech-2.8-turbo / hd | $60 / $100 per 1M | 2.01 / 3.34 | platform.minimax.io |
| ElevenLabs v4 / v3 / v2 Multilingual | $0.08/1K | 2.68 | elevenlabs.io |
| Hume Octave 2 | - | **sunset 2026-11-13** | dev.hume.ai TTS overview |

**STT** (60 s streamed; the alternative is 30 s gated):

| vendor / product | list price | ₹/min streamed / gated | source |
|---|---|---|---|
| Groq Whisper-large-v3-turbo (batch only, not streaming) | $0.04/h | 0.06 / 0.03 | Groq models page |
| Inworld STT-1: paid plans / on demand | $0.10 / $0.15 per h | 0.16 / 0.08; 0.24 / 0.12 | inworld.ai |
| Smallest Pulse realtime | ~$0.004/min | 0.38 / 0.19 | smallest.ai |
| **Sarvam STT real-time**: Growth / pay-as-you-go | **₹0.41 / ₹0.49 per min** | 0.41 / 0.21; 0.49 / 0.25 | sarvam.ai |
| Deepgram Nova-3 Multilingual: promotional / regular | $0.0058 / $0.0092 per min | 0.55 / 0.28; 0.87 / 0.44 | deepgram.com ("Limited-time promotional rates") |
| MiniMax / Cartesia Ink-2 / ElevenLabs Scribe v2 Realtime | $0.38-0.39 per h | about 0.61 / 0.31 | vendor pages |
| Azure STT 100K-hour commitment / S1 pay-as-you-go (grant) | $0.40 / $1.00 per h | 0.63 / 0.32; 1.58 / 0.79 | Retail API |
| Deepgram Flux Multilingual (turn detection built in) | $0.0078/min | 0.74 / 0.37 | deepgram.com |
| Gemini 3.5 transcribe-live | $3.50 audio in, $21 text out per 1M (about $0.009/min) | 0.88 / 0.44 | ai.google.dev |
| OpenAI gpt-live-transcribe / realtime-whisper (Azure meter the same) | $0.017/min | 1.62 / 0.81 | OpenAI pricing |

**LLM** (19,688 input + 396 output tokens a minute):

| provider / model | $ per 1M (in / cached / out) | ₹/min, no cache / 83% cached | note |
|---|---|---|---|
| DeepSeek v4.1-flash (cheapest OpenRouter endpoint) | 0.04 / 0.0016 / 0.144 | 0.09 / 0.02 | g3 measured TTFT p50 1,258 ms for v4-flash@deepinfra: too slow |
| gpt-6-luna (OpenAI; Azure Global the same) | 0.10 / 0.01 / 0.50 | 0.21 / **0.07** | TTFT not benchmarked by g3 |
| Groq gpt-oss-20b | 0.075 / 0.0375 / 0.30 | 0.15 / 0.09 | g3 measured TTFT p50 558 ms |
| Inworld Gemma 4 26B-A4B | 0.07 / - / 0.34 | 0.14 | vendor TTFT 0.23 s |
| Sarvam 105B | ₹15 / ₹5 / ₹60 | 0.32 / 0.16 | INR |
| **Groq gpt-oss-120b** (OpenRouter adds 5.5%) | 0.15 / 0.075 / 0.60 | 0.30 / **0.19** | g3 measured TTFT p50 253 ms from India |
| Gemini 3.1 Flash-Lite | 0.25 / 0.025 / 1.50 | 0.52 / 0.18 | g3 saw no cache hits; TTFT about 743-885 ms |
| Azure gpt-4.1-mini, South India regional (grant) | 0.44 / 0.11 / 1.76 | 0.89 / 0.38 | Legacy; retires 2027-04-14 (l8) |
| Yotta Shakti Studio OpenAI OSS 120B (India) | ₹23.50 per 1M | 0.47 | the page's input/output toggle is ambiguous |
| Cerebras gpt-oss-120b | 0.35 / - / 0.75 | 0.68 | g3 TTFT p50 642 ms |
| Groq Llama 3.3 70B (via OpenRouter) | 0.59 / 0.295 / 0.79 | 1.20 / 0.71 | Groq direct now "Enterprise / Contact Sales" |

**Speech-to-speech and all-in agents**, list price:

| product | price |
|---|---|
| OpenAI gpt-realtime-2.1-mini | audio $10 in / $0.30 cached / $20 out; text $0.60 / $0.06 / $2.40 per 1M |
| OpenAI gpt-realtime-2.1 | audio $32 / $0.40 / $64; text $4 / $0.40 / $24 |
| Azure (grant) | identical Global meters (southindia lists only "Gl" meters); Data Zone is US/EU only at +10% |
| GPT-Live-1 | $0.05 per session minute, per second, silence billed |
| Ultravox | $0.05/min; 5 concurrent calls on pay-as-you-go; acquired by Inworld |
| ElevenAgents / Speech Engine | $0.08/min, $0.16 burst |
| Cartesia Managed Agents | $0.06/min, plus $0.014 telephony |
| Deepgram Voice Agent | $0.075 Standard, $0.050 custom, $0.163 Advanced |
| Smallest Atoms | $0.09-0.21/min |
| Sarvam Samvaad | ₹3.50 / 3.25 / 3.15 / 3.00 per 60-second pulse, excluding telephony; Business "coming soon" |
| Inworld speech-to-speech | the component rates, with "no S2S fee on top" |
| Hume EVI | sunset 2026-11-13 |

## 5. Self-hosting estimate (open expressive and Indic models)

### GPU price lists (read 2026-10-18, ₹ per GPU-hour, excl. GST)

| provider | T4 | L4 | L40S | A100 80GB | H100 |
|---|---|---|---|---|---|
| E2E Networks (INR is authoritative; +18% GST) | 30 | 49 | 102 | 189 | **379.05** on demand, 347.70 committed, 70 spot |
| Yotta Shakti Cloud | - | - | 137 on demand; 80,221/month (= 109.9/h) | - | SXM **356** on demand; 1,96,113/month (= **268.6/h**) |
| Jarvislabs (USD list ×95; the India INR toggle is not machine-readable) | - | 41.8 ($0.44) | - | 141.6 ($1.49) | SXM 331.6 ($3.49) |
| Azure Central India, on demand | 55 ($0.579) | - | - | 488.5 ($5.142) | NVL 928.3 ($9.772) |
| Azure Central India, 3-year RI | 20.9 | - | - | 181.3 | 510.6 |

- Azure's A10 option is NV36ads_A10_v5 at $4.48/h on demand (₹425.6), and ₹187.3/h on a 3-year RI.
- Azure on demand is about 2.45× E2E for H100, 2.6× for A100 and 1.8× for T4 (computed).
- Sources:
  - e2enetworks.com/pricing;
  - shakticloud.ai/pricing;
  - jarvislabs.ai/pricing;
  - Azure Retail Prices API (Virtual Machines, centralindia, Linux).

### Capacity per GPU (real-time streams at interactive latency): none of this is measured by us

| model | licence / Hindi | capacity basis (method) | H100 streams (low / base / high) | confidence |
|---|---|---|---|---|
| Maya Research Veena 3.78B (Llama + SNAC) | Apache-2.0; Hindi, English, code-mixed | Card claims (vendor): <80 ms on H100, about 120 ms on A100-40GB, RTF 0.05, about 170k tokens/s on 8×H100. Same architecture as Orpheus, so by analogy: Baseten (vendor) gets 16 real-time streams (variable traffic) or 24 (consistent) per **H100 MIG 40GB**; SAIL (third-party) gets 24 per H100 at baseline and 216 optimised. | 24 / 40 / 120 | low-medium |
| Canopy Orpheus 3B | Apache-2.0 (English fine-tune); the Hindi pretrain is a llama3.2 research release | same | 24 / 40 / 120 | medium on H100 |
| AI4Bharat Indic Parler-TTS 938M | Apache-2.0 (gated); 21 languages | assumed Orpheus-class density, ×0.5-3; no throughput published | 20 / 40 / 120 | low |
| AI4Bharat IndicF5 351M | MIT (gated); 11 languages | F5-TTS TRT-LLM on L20: RTF 0.039 at concurrency 2 (vendor). **Owner-measured RTF 2.87 on T4 (n=6)**, so not real-time on T4 | 18 / 35 / 70 | low |
| Resemble Chatterbox Multilingual + Hindi pack | MIT | owner-measured warm RTF 0.79 on a T4, single stream (prior project) + assumed scale | 12 / 24 / 48 | low |
| Kokoro-82M | Apache-2.0; Hindi graded C | Kokoro-FastAPI 35-100× real time on an RTX 4060 Ti (third-party) | 60 / 100 / 200 | low; not expressive |
| Kyutai TTS 1.6B | CC-BY-4.0; no Hindi | vendor batching claim; Kyutai STT 400 streams on H100 | 32 / 64 / 128 | low; not a fit |
| Sesame CSM-1B | Apache-2.0; English only | no throughput published | - | not estimable; not a fit |
| NVIDIA Magpie TTS Multilingual 357M (reference) | NVIDIA; NIM needs an NVAIE licence | 64 streams on H100 at TTFA 275 ms (vendor, via l2) | 32 / 64 / 80 | medium |
| AI4Bharat IndicConformer 600M (ASR) | MIT (gated); 22 languages | **assumed** 0.15 / 0.3 / 0.5 × Riva Conformer-CTC Hindi maximum streams (NVIDIA Riva 2.15 table: T4 50, L4/A10 116, A100 233, H100 366); no streaming throughput published | 55 / 110 / 183; L4 17 / 35 / 58 | low |
| Whisper-large-v3-turbo (ASR) | MIT | faster-whisper batch speed (third-party) ÷4 for re-decoding streaming | 15 / 30 / 60 | low |

- GPUs other than the H100 use an assumed memory-bandwidth scale for the 3B LLM-style TTS models: A100 ×0.6,
  L40S ×0.45, A10 ×0.2, L4 ×0.15.
- Streams are converted to cost with 0.44 TTS stream-minutes per connected minute (26.4 s synthesised) and 1.0 ASR
  stream-minute (the whole call is streamed).

### ₹ per connected minute at 30 / 50 / 70% average utilisation (`selfhost.csv`, base capacity)

| model × GPU | E2E on demand | Yotta (dedicated monthly) | Jarvislabs | Azure on demand | Azure 3-year RI |
|---|---|---|---|---|---|
| Veena on H100 | 0.23 / **0.14** / 0.10 | 0.16 / **0.10** / 0.07 | 0.20 / 0.12 / 0.09 | 0.57 / 0.34 / 0.24 | 0.31 / 0.19 / 0.13 |
| Veena, low capacity (24/H100), 50% | 0.23 | 0.16 | 0.20 | 0.57 | 0.31 |
| Indic Parler on H100 | 0.23 / 0.14 / 0.10 | 0.16 / 0.10 / 0.07 | 0.20 / 0.12 / 0.09 | 0.57 / 0.34 / 0.24 | 0.31 / 0.19 / 0.13 |
| IndicF5 on L40S (E2E/Yotta) or A100 (Azure) | 0.10 / 0.06 / 0.04 | 0.11 / 0.06 / 0.05 | - | 0.48 / 0.29 / 0.20 | 0.18 / 0.11 / 0.08 |
| Chatterbox on L40S (Azure A100) | 0.21 / 0.12 / 0.09 | 0.22 / 0.13 / 0.10 | - | - | 0.22 / 0.13 / 0.09 (A100) |
| Kokoro on L4 (Azure T4) | 0.03 / 0.02 / 0.01 | - | - | 0.07 / 0.04 / 0.03 | 0.03 / 0.02 / 0.01 |
| IndicConformer on L4 (Azure T4) | 0.08 / **0.05** / 0.03 | 0.07 / 0.04 / 0.03 (L40S) | 0.07 / 0.04 / 0.03 | 0.20 / 0.12 / 0.09 | 0.08 / **0.05** / 0.03 |
| Whisper-turbo on L4 (Azure T4) | 0.45 / 0.27 / 0.19 | 0.41 / 0.24 / 0.17 (L40S) | 0.39 / 0.23 / 0.17 | 1.53 / 0.92 / 0.65 | 0.58 / 0.35 / 0.25 |
| Riva Conformer Hindi on L4, with NVAIE $4,500/GPU-year | 0.09 / 0.06 / 0.04 | - | 0.09 / 0.05 / 0.04 | - | - |

**The fleet floor and break-even** (`summary.json` → breakeven). Two GPUs is the minimum for redundancy. Above the
break-even volume, the fleet costs less than the managed per-minute price.

| self-hosted fleet | cost per month | compared with | break-even (connected min/month) |
|---|---|---|---|
| Veena on 2×H100, E2E on demand | ₹5.53 lakh | Bulbul V4 Flash Growth (₹0.598) | **0.93M** |
| same | ₹5.53 lakh | Inworld TTS-2 Flash Growth (₹0.234) | 2.37M |
| same | ₹5.53 lakh | ElevenLabs Flash/v3 Conversational (₹1.338) | 0.41M |
| Veena on 2×H100, Yotta monthly | ₹3.92 lakh | Bulbul V4 Flash Growth | 0.66M |
| IndicConformer on 2×L4, E2E | ₹71,540 | Sarvam STT Growth streamed (₹0.41) | **0.17M** |
| same | ₹71,540 | Inworld STT-1 (₹0.158) | 0.45M |
| IndicConformer on 2×T4, Azure 3-year RI | ₹30,495 | Azure STT pay-as-you-go (₹1.58) | 19k |

**Caveats that move these numbers.**
1. **The calling window caps utilisation.** Commercial calls in India run in a daytime window. A fleet that is always
   on averages roughly 50% even if the daytime hours are full, so 30% is the realistic planning figure.
2. **Not counted:** operations engineering, GPU spares, autoscaling headroom and the cost of a bad week for quality.
3. **Concurrency is unproven.** Veena's concurrency, IndicConformer streaming and Indic Parler's voice consistency
   are unmeasured. Measuring them on one rented L4 plus one H100 for a few hours is the cheapest decisive test
   (roughly ₹1-2k at E2E on-demand rates).
4. **Quality is unproven.** No open Indic TTS has passed an owner likeness or listener test. The owner's IndicF5
   bake-off left likeness unsolved; Chatterbox was the only open model run in production (Aug 2026).

## 6. Vendor risk (`vendor-risk.csv`, terms read 2026-10-18)

| provider | trains on our data? | India processing? | lifecycle / price risk | limits | ₹ billing |
|---|---|---|---|---|---|
| **Hume** | - | - | **SUNSET: TTS and EVI access ends 2026-11-13; account data deleted after.** KILL | - | - |
| Google Gemini API / Vertex | paid: no; free tier: yes, with human review | **no**; 3.8 Live on Vertex is us/eu only | 3.1-flash-live-preview and 3.1-flash-tts-preview: earliest shutdown 2026-11-17; 3.8 Live Vertex retirement "2027-09-25 or later"; TTS price doubles 2027-01-01 (g1) | per project; one 429 at about 10-12 RPM on TTS (g5) | USD |
| OpenAI direct | no, unless opted in | storage in India (in.api.openai.com), **processing not in India**; +10% uplift | realtime-2.1 released 2026-07-07; deprecations page not read | usage tiers (not read) | USD |
| Azure OpenAI / Foundry (grant) | no | regional text deployments yes; **realtime only Global or Data Zone (US/EU)** | GA models retire about 18 months after launch → realtime-2.1-mini about 2028-01 (computed); gpt-4.1-mini retires 2027-04-14 | TPM quota; GPU quota hard (harvest) | grant |
| Azure Speech (grant) | no | **yes**, Central India; real-time STT kept in memory, not at rest | GA | per resource | grant |
| Inworld (and Ultravox) | no, on non-public materials | **Enterprise only** (EU and India) | TTS-2 new; Ultravox acquired | concurrency 5 → 500 by plan; Ultravox pay-as-you-go 5 calls | USD |
| Sarvam | **yes by default** (policy "Default Policy: Opt-In": content used to train unless you opt out) | Indian company, but the policy allows transfer to US clouds and EU model providers | Bulbul V4 Flash new; Business plan "coming soon" | agents 4 / 10 / 30 / 120 concurrent | **INR**, prepaid, non-refundable |
| ElevenLabs | **yes by default**, opt out under "Data use" | India storage only, Enterprise only; "processing may occur outside" | v4 just launched | agents 4-40 concurrent; burst at 2× | USD |
| Cartesia | **yes**, opt out by form | **no**; privacy policy: "designed for users in the United States only" | - | TTS 2-15 concurrent | USD |
| Deepgram | **yes by default** (Model Improvement Program); `mip_opt_out=true` per request | no; EU endpoint only | streaming prices are a limited-time promotion | 150 / 225 STT WebSockets | USD |
| Smallest.ai | no | not stated; on-prem on Enterprise | - | 100 STT / 15 TTS streams | USD |
| MiniMax | not verified (policy page JS-rendered) | no (secondary source) | - | RPM 10-500 | USD |
| Groq | no retention by default; ZDR toggle | no (US) | Llama 3.3 70B moved to Enterprise; preview models "may be discontinued at short notice" | 250K TPM / 1K RPM on gpt-oss-120b | USD |
| Cerebras | no | no (US) | only 2 shared models | 1M TPM / 1K RPM | USD |
| OpenRouter | depends on provider; can be filtered | no; in-region routing is EU/US only | - | passed through | USD; 5.5% fee |
| E2E, Yotta, Jarvislabs | not applicable (our own models) | **yes** (Indian data centres) | - | capacity | **INR** (E2E +18% GST; Jarvislabs INR for Indian customers) |
| Open weights | not applicable | yes, if hosted in India | Veena card last modified 2025-10-05 (3,948 downloads); community models have no SLA | - | - |

Licences checked via the Hugging Face API `cardData.license`:
- Apache-2.0: Veena, Indic Parler (gated), Orpheus fine-tune (gated), CSM-1B (gated), Kokoro, maya1.
- MIT: IndicF5 (gated), IndicConformer (gated), Chatterbox, Whisper-turbo.
- CC-BY-4.0: Kyutai.
- llama3.2: the Orpheus Hindi pretrain.

## 7. Latency (vendor claims only; this lane measured none)

No vendor latency here was measured from India. g3 has the measured cascade numbers: caller end of speech to first
audio p50 is about 1.0-1.1 s for the C1/C3/C6 cascades from the Central India VM, with cut-ins on 9-19 of 60 turns.
g5 has Gemini Live: 3.8-live p50 about 1.0 s from India, 3.1 about 1.95 s.

Vendor claims:
- **Inworld speech-to-speech:** first audio a median **462 ms** after the turn closed (n=17). Its semantic VAD closed
  the turn a median **954 ms** after the user's last word. So the vendor's own data implies about **1.4 s** from last
  word to first audio.
- **TTS time to first audio:**
  - Inworld TTS-2 Flash: "as low as 50 ms";
  - ElevenLabs Flash: about 75 ms; v4 Turbo: about 100 ms; v3 Conversational: about 280 ms;
  - Smallest Lightning: under 100 ms;
  - Veena: <80 ms on H100, about 120 ms on A100;
  - Orpheus: about 200 ms streaming;
  - Magpie: 275 ms TTFA on H100;
  - Indic Parler: <500 ms;
  - Kokoro-FastAPI: about 300 ms.
- **STT:** ElevenLabs Scribe v2 Realtime about 150 ms; Inworld STT-1 final transcript under 70 ms.

## 8. What would change these conclusions

- **A Hindi listening result** that puts Inworld TTS-2 Flash or Smallest Lightning within the noise floor of Bulbul
  V4 or ElevenLabs. Then the ₹0.54-0.88 Inworld stack becomes the base tier, subject to an Enterprise India-residency
  contract.
- **A measured Veena or Indic Parler density** under 15 streams per H100, or IndicConformer under 10 streams per L4.
  Either moves self-hosting to about ₹0.6+ a minute and kills it at our volume.
- **A written Sarvam no-training, India-only processing addendum,** plus Business-plan pricing, would make Sarvam
  the residency-safe managed default. As things stand, its default-on training is a blocker for regulated buyers.
- **The OpenAI realtime-mini cache rate measured on real calls.** At 80% or more, it is a ₹1.9 speech-to-speech
  option on the Azure grant. At 0%, it costs ₹6.9.

## 9. Not covered or not verified

- Not read: the OpenAI deprecations page and OpenAI rate-limit tiers.
- MiniMax terms: the page is JS-rendered, so the training claim is unverified.
- Jarvislabs' INR rates.
- Yotta Shakti Studio: which side of the input/output toggle the ₹23.50 applies to.
- Sarvam STT Hindi-English accuracy against the others.
- Concurrency of any open model.
- Price history: the l7 lane covers it; no archive pages were read here.
- No paid API call was made, and no Azure resource was created.
