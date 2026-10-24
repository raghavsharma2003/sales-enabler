<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused the file write). -->

# g1-gemini-desk: Gemini prices, Live billing mechanics, lifecycle and the Meera ₹1.3/min claim

Lane g1-gemini-desk (V1 desk side and V7). Date: 2026-10-18.

- **Method.** Every price, limit, date and term was read from primary pages fetched today. All cost per minute figures
  are **computed**, not measured.
- **Spend.** Nothing paid. One free `models.list` call (no generation, no tokens) was made with GEMINI_TEST_KEY. No Azure
  or OpenRouter use. Nothing was logged to vp-spend.jsonl, because nothing was spent.
- **FX.** ₹95 to the dollar.

**Lane files** (all under `/home/user/sales-enabler/research/2026-10-18/lanes/g1-gemini-desk/`):

| file | contents |
|---|---|
| `prices.json` | 264 machine-usable price rows plus metadata on announced changes and the free tier |
| `live-billing-mechanics.md` | the Live billing and session rules, with quotes |
| `meera-gemini-archaeology.md` | how Meera used Gemini, and where ₹1.3 came from |
| `live_cost_model.py` and `live_cost_model.csv` | the cost model (720 rows, reproducible) |
| `models-visible-to-test-key.json` | API response from `models.list`; contains no key |

`findings.md` is not on disk: the harness refused to write it (subagents may not write report files), so this markdown
is the write-up. Raw page copies are in `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw-1018/g1-gemini-desk/`.

## 0. Headlines

1. **Live audio list prices are unchanged since August, and no change is announced.**
   - The rates apply to `gemini-3.8-live`, `gemini-3.8-live-extended-thinking` and `gemini-3.1-flash-live-preview`.
   - Per 1M tokens: audio in $3.00, audio out $12.00, text in $0.75, text out $4.50, image or video in $1.00.
   - Audio is 25 tokens a second. The page's own per-minute equivalents are $0.005 in and $0.018 out.
   - The Agent Platform (formerly Vertex AI) charges the same for `gemini-3.8-live`.
2. **Google documents that every Live turn re-bills the whole session context** (system instruction plus all past
   audio, at the audio input rate), with no caching. Cost per minute therefore rises with call length.
   - Computed for a lean 1.5k-token prompt at 6 turns a minute: **₹2.7 a minute for a 1-minute call, ₹4.6 at 3 minutes,
     ₹11.3 at 10 minutes.**
   - Computed for a Meera-size 12k-token prompt: **₹7.2, ₹9.1 and ₹15.8** at the same lengths.
   - This is a computation from the documented rule. Lane g2's per-turn `usageMetadata` is the test of whether the meter
     really behaves this way.
3. **`slidingWindow: {}` with defaults does not cap cost in normal calls.** The default `triggerTokens` is 80% of the
   131,072-token window, about 104.9k tokens. A 10-minute call reaches only about 14-22k tokens. To cap cost,
   `triggerTokens` must be set explicitly, for example S+4k with a target of S+2k. Even then, 10 minutes comes to about
   ₹6.0 a minute with a lean prompt.
4. **The owner's "~₹1.3 per minute" is Meera's $0.0142 per minute from 2026-08-23.**
   - It was *computed* at **paid list price**; the product actually ran on a free key pool and cost $0.
   - It was **not measured** from per-turn usage.
   - It billed the system instruction once per connection and did **not** model per-turn re-billing.
   - Even at face value it is above the AI budget that a ₹2 price allows (§4).
5. **Lifecycle (V7).** Meera's live model `gemini-3.1-flash-live-preview` and TTS model `gemini-3.1-flash-tts-preview`
   have an announced earliest shutdown of **2026-11-17**, 30 days away. So do `gemini-2.5-flash-native-audio-preview-12-2025`
   and both 2.5 preview TTS models. The replacement, `gemini-3.8-live`, is GA (2026-09-15). On the Gemini API it has "no
   shutdown date announced", which is not a guarantee; on the Agent Platform its retirement is listed as "2027-09-25 or
   later".
6. **India residency (V7). The Agent Platform does not offer `gemini-3.8-live` in Mumbai (asia-south1) or Delhi
   (asia-south2).**
   - It is available only in the us and eu multi-regions and us-central1, with ML processing in us and eu.
   - The Gemini API offers no residency at all: data "may be stored transiently or cached in any country".
   - Only the 3.5 Flash and 3.5 Flash-Lite text models (and 2.5 Flash ML processing) list asia-south1, and only through
     Provisioned Throughput. Standard pay-as-you-go is global, us or eu only.
7. **Announced price rises.**
   - On **2027-01-01**: `gemini-3.8-flash`, `gemini-3.7-flash` and `gemini-3.6-flash` double, from $0.75/$3.75 to
     $1.50/$7.50. Both 3.8 TTS models double: Flash-Lite TTS audio out goes from $6 to $12, and Flash TTS from $9 to $18.
   - On 2026-12-01: `gemini-4-argon` doubles.
   - Since 2026-07-01: Agent Platform non-global endpoints cost 10% more.
   - The Live audio rates show no announced change.

## 1. Paid prices (Standard tier, USD per 1M tokens; source <https://ai.google.dev/gemini-api/docs/pricing>, read 2026-10-18)

### Live and native-audio models

| model | text in | audio in | image/video in | text out (incl. thinking) | audio out | caching | free tier |
|---|---|---|---|---|---|---|---|
| gemini-3.8-live / -extended-thinking | 0.75 | 3.00 ($0.005/min) | 1.00 ($0.002/min) | 4.50 | 12.00 ($0.018/min) | not supported | free; data used to improve |
| gemini-3.1-flash-live-preview | 0.75 | 3.00 | 1.00 | 4.50 | 12.00 | not supported | same |
| gemini-2.5-flash-native-audio-preview-12-2025 | 0.50 | 3.00 (audio/video) | 3.00 | 2.00 | 12.00 | n/a | same |
| gemini-3.5-live-translate-preview | n/a | 3.50 | n/a | n/a | 21.00 | n/a | same |

### Transcription

| model | audio in | text out | blended (Google's estimate: 25 tok/s in, 175 tok/min out) |
|---|---|---|---|
| gemini-3.5-transcribe-live | 3.50 | 21.00 | ~$0.009 per audio-minute (Agent Platform: $0.008925) |
| gemini-3.5-transcribe (non-streaming) | 2.00 | 12.00 | ~$0.005 per minute (Agent Platform: $0.0051) |

### TTS (audio out at 25 tok/s)

| model | text in | audio out to 2026-12-31 | audio out from 2027-01-01 | per minute of speech (now → 2027) | status |
|---|---|---|---|---|---|
| gemini-3.8-flash-lite-tts | 0.50 → 1.00 | 6.00 | 12.00 | $0.009 → $0.018 | GA (Gemini API, 2026-09-22); Preview on Agent Platform |
| gemini-3.8-flash-tts | 0.50 → 1.00 | 9.00 | 18.00 | $0.0135 → $0.027 | same |
| gemini-3.1-flash-tts-preview | 1.00 | 20.00 | n/a | $0.030 | preview; shutdown 2026-11-17 |
| gemini-2.5-flash-preview-tts | 0.50 | 10.00 | n/a | $0.015 | preview; shutdown 2026-11-17 |
| gemini-2.5-pro-preview-tts | 1.00 | 20.00 | n/a | $0.030 | preview; paid only; shutdown 2026-11-17 |

Batch and Flex are half of Standard; Priority is 1.8x. All tiers are in `prices.json`.

### Text models usable in a cascade

| model | input | cached input | output | change | status |
|---|---|---|---|---|---|
| gemini-3.8-flash | 0.75 → 1.50 | 0.075 → 0.15 | 3.75 → 7.50 | doubles 2027-01-01 | GA 2026-09-02 |
| gemini-3.7-flash | routes to 3.8 Flash | n/a | n/a | deprecated 2026-10-08 | n/a |
| gemini-3.6-flash | 0.75 → 1.50 | 0.075 → 0.15 | 3.75 → 7.50 | doubles 2027-01-01 | GA 2026-07-21 |
| gemini-3.5-flash | routes to 3.6 Flash | n/a | n/a | deprecated 2026-10-08 | n/a |
| gemini-3.5-flash-lite | 0.30 (all modalities) | 0.03 | 2.50 | none announced | GA 2026-07-21 |
| gemini-3.1-flash-lite | 0.25 text, 0.50 audio | 0.025 / 0.05 | 1.50 | none announced | GA; earliest shutdown 2027-05-07 |
| gemini-2.5-flash-lite | 0.10 text, 0.30 audio | 0.01 / 0.03 | 0.40 | none announced | GA; access limited to prior users since 2026-09-18 |

**Agent Platform (Vertex) prices.**

- Global endpoints cost the same as the Gemini API.
- Non-global (regional) endpoints cost +10%. For example, 3.5 Flash-Lite is $0.33/$2.75 and 3.8 Flash is $0.825/$4.125.
- The promotional 3.6/3.7/3.8 Flash price is delivered as a 50% credit back.

**Provisioned Throughput,** per GSU-hour: 1 week $7.14, 1 month $3.70, 3 months $3.29, 1 year $2.74 (global). Non-global
is +10%. Agent Platform also gives a 50% credit on Provisioned Throughput spend for 3.6/3.7/3.8 Flash from 2026-08-13 to
2026-12-31.

**OpenRouter** (public `/api/v1/models`, 2026-10-18):

- Gemini is sold **text-output only**: no Live and no Gemini TTS.
- `google/gemini-3.8-flash` is $0.825/$4.125, which matches the Agent Platform non-global price.
- 3.5 Flash-Lite is $0.30/$2.50.

## 2. Live billing mechanics (full detail and quotes in `live-billing-mechanics.md`)

**What gets billed:**

- **Every turn bills all tokens in the context window.** That is the system instruction plus all retained history. Past
  audio is kept as audio tokens and re-billed at $3 per 1M on every turn.
- **Transcription is billed at the text output rate.**
- **3.8 Live bills listening time.** Proactive audio is permanently on, so input is billed for all listening time.
- **3.1 bills only streamed audio**, and by default its turns exclude silence.
- **Declaring a voice adds a constant** (Meera-measured): voiceConfig adds 201 audio prompt tokens to every turn.

**Context-window compression:**

- Sliding window.
- The default trigger is 80% of the window, about 104.9k tokens, and the default target is half of that.
- The system instruction is always kept.
- Each compression adds a temporary latency increase.

**Session limits:**

- 15 minutes for audio-only sessions without compression; 2 minutes for audio + video.
- Connections last about 10 minutes, and `goAway` gives `timeLeft` before one ends.
- Resumption handles are valid for 2 hours. The Agent Platform says resumption caches data for up to 24 hours.
- Ephemeral tokens default to 1 minute to start a session and 30 minutes to expire, single-use.

**Audio formats.** Input is 16-bit PCM, natively 16 kHz. Output is 24 kHz PCM.

**Native-audio models answer in AUDIO only.**

- A text reply is available only as the output transcript.
- So "Live in text mode, then TTS" (a V3 hybrid) cannot run on 3.8 or 3.1 Live.
- The half-cascade Live models that could reply in text were shut down on 2025-12-09.

**Features:**

- **Affective dialog.**
  - Not supported on 3.1.
  - On 3.8 the Gemini API says it was "removed from the API", but the Agent Platform overview lists it for 3.8 Live.
    **The two sources conflict.**
- **Proactive audio.** Not supported on 3.1; always on for 3.8.
- **Async function calls.** The default on 3.8; not supported on 3.1.
- **Thinking.**
  - 3.1 takes `thinkingLevel` and defaults to minimal.
  - 3.8 Live accepts no `thinkingLevel`.
  - 3.8 Extended Thinking takes low, medium or high.

**A metadata quirk.** `models.list` (API response, 2026-10-18) reports `gemini-3.8-live` with
`version: "3.1-flash-live-03-2026"`, the same version string as 3.1 Flash Live Preview. This is unexplained and worth a
quick A/B test by g2.

## 3. Cost per minute (computed; `live_cost_model.py`)

**Assumptions:**

- 6 turns a minute.
- User speaks 35% of the time; agent speaks 40%.
- 25 audio tokens a second, and 175 transcript tokens per speech-minute.
- Per-turn voiceConfig constant of 201 tokens.
- Standard paid prices.

**₹ per minute of AI cost only** (telephony and hosting excluded):

| stack | 1 min | 3 min | 5 min | 10 min |
|---|---|---|---|---|
| Live (3.1 or 3.8, speech-only billing), lean 1.5k prompt, default or no compression | 2.68 | 4.60 | 6.52 | 11.33 |
| same, explicit history cap of 4k tokens (trigger S+4k, target S+2k) | 2.68 | 4.60 | 5.47 | 6.04 |
| Live, Meera-size 12k prompt, Meera's setting (`slidingWindow:{}`) | 7.17 | 9.09 | 11.01 | 15.82 |
| Live 3.8, listening billed (proactive) | 2.78 | 4.71 | 6.63 | 11.44 |
| Live 3.8, listening kept in context (upper bound) | 3.05 | 5.62 | 8.18 | 14.59 |
| Live 2.5 native audio, lean | 2.43 | 4.36 | 6.28 | 11.09 |
| *For reference: Meera-style non-compounding arithmetic (our reconstruction)* | 1.27 | 1.27 | 1.27 | 1.27 |
| Gemini-only cascade: 3.5-transcribe-live + 3.5-flash-lite + 3.8-flash-lite-tts, 2026 prices | 1.33 | 1.34 | 1.35 | 1.38 |
| same cascade, 2027 prices (TTS doubled) | 1.68 | 1.69 | 1.70 | 1.72 |
| same with 3.1-flash-lite as the LLM, 2026 prices / 2027 prices | 1.30 / 1.65 | 1.31 / 1.66 | 1.32 / 1.67 | 1.34 / 1.69 |

**Sensitivity of the lean Live row:**

- **Turn rate.** At 4 turns a minute it runs from 2.03 to 7.80; at 10 turns a minute, from 3.97 to 18.40.
- **Talk share.** From 2.09-7.86 when both parties speak 25% of the time, up to 3.03-12.84 when the agent speaks 55%.

**Where the Gemini-only cascade's cost sits** (3-minute call, 2026 prices):

- Speech-to-text is 63% of the cost: 3.5 Transcribe Live streamed for the whole call, about ₹0.85 a minute.
- TTS is 26%.
- The LLM is 11%.

**TTS alone,** for an agent speaking 40% of the time, using 3.8 Flash-Lite TTS: ₹0.34 a minute now and **₹0.68 a minute
from 2027-01-01**. Using 3.8 Flash TTS: ₹0.51 now and ₹1.03 from 2027.

## 4. The AI budget a ₹2 price allows (computed, brief §1)

AI budget = ₹2 net of GST × (1 − margin) − telephony (₹0.38-0.48).

| GST treatment | 40% margin | 50% margin | 60% margin |
|---|---|---|---|
| ₹2 excludes GST | ₹0.72-0.82 | ₹0.52-0.62 | ₹0.32-0.42 |
| ₹2 includes 18% GST (net ₹1.695) | ₹0.54-0.64 | ₹0.37-0.47 | ₹0.20-0.30 |

These figures exclude hosting and orchestration, so the true budget is slightly lower. **Allowed AI cost is about
₹0.2-0.8 a minute.**

**Implications:**

- **Gemini Live fails the budget on either billing reading.** Its 5-minute computed cost is ₹5.5-11 a minute under the
  documented per-turn rule, and about ₹1.27 a minute under flat arithmetic. **V1's kill condition is met on the desk
  numbers**, pending g2's measurement.
- **No all-Gemini path fits either.** The cheapest Gemini-only cascade is about ₹1.3 a minute now and ₹1.7 in 2027.
- **TTS alone uses most of the budget.** At 2027 prices, 3.8 Flash-Lite TTS by itself takes ₹0.68 a minute.

## 5. Agent Platform (Vertex) against the Gemini API: regions, data use, residency

| item | Gemini API (ai.google.dev) | Agent Platform (ex-Vertex) |
|---|---|---|
| 3.8 Live regions | no regional choice | us and eu multi-region, us-central1. **No asia-south1 or asia-south2.** ML processing us/eu (model page, read 2026-10-18) |
| 2.5 Flash Live (native audio) | n/a | us-* and europe-* regions only; GA, retirement 2026-12-13 |
| 3.1 Flash Live Preview | yes | not offered |
| text models in India | n/a | 3.5 Flash and 3.5 Flash-Lite list asia-south1 for availability, ML processing and Provisioned Throughput, but Standard PayGo is global/us/eu only. 2.5 Flash ML processing includes asia-south1 (retirement 2026-10-20). 3.6, 3.7 and 3.8 Flash and 3.1 Flash-Lite are global/us/eu only. **No asia-south2 entries for Google models** |
| TTS / transcription | global | 3.8 Flash and Flash-Lite TTS: **global only, Preview** (released 2026-09-28). 3.5 Transcribe (Live): global only |
| paid data use | not used to improve products. Prompts logged "for a limited period" for abuse detection; "may be stored transiently or cached in any country" | training restriction: never used to train without permission. Abuse-monitoring logging can be waived on request (zero data retention). Implicit cache up to 24 h, regional if a regional endpoint is used. Live session resumption caches audio, text and video up to 24 h; leave it off for zero data retention |
| free-tier data use | "Unpaid Services": content used to improve products; human reviewers may read it; "Do not submit sensitive, confidential, or personal information". Outside EEA/CH/UK | n/a (no free tier) |
| other terms | 18+ only; not for "API Clients … likely to be accessed by individuals under the age of 18"; "for professional or business purposes, not for consumer use" | Cloud terms and data processing addendum |
| Provisioned Throughput | Enterprise tier "optional access" | GSU per hour (§1); 3.8 Live supports it in us/eu |
| model lifecycle | "No shutdown date announced" ≠ guarantee | explicit retirement dates: 3.8 Live 2027-09-25 or later; **3.6 Flash 2026-11-19**; 3.7 Flash 2027-01-28; **2.5 Flash and Flash-Lite 2026-10-20**; 3.5 Flash-Lite 2027-07-21 or later |

**V7 reading.**

- **No India data residency for any Gemini speech-to-speech model.**
- **Training is excluded only on paid tiers.** Paid-tier and Agent Platform terms exclude training on customer data. The
  free tier does not.
- **Free-tier keys must never carry customer audio.** This matches the brief's "no free-tier key rotation" rule. The
  sales-enabler Maya profile still rotates a free key pool, which is a product risk.
- **Counsel needs to rule** on whether processing in us or eu (Agent Platform) or anywhere (Gemini API) is acceptable for
  DPDP and IRDAI records-in-India.

## 6. Lifecycle (<https://ai.google.dev/gemini-api/docs/deprecations>, read 2026-10-18)

| model | released | earliest shutdown / retirement | replacement |
|---|---|---|---|
| gemini-3.1-flash-live-preview (Meera) | 2026-03-11 | **2026-11-17** | gemini-3.8-live |
| gemini-2.5-flash-native-audio-preview-12-2025 | 2025-12-12 | **2026-11-17** | gemini-3.8-live |
| gemini-3.8-live, -extended-thinking | 2026-09-15 (GA) | none announced (Gemini API); 2027-09-25 or later (Agent Platform) | n/a |
| gemini-3.1-flash-tts-preview (Meera fallback) | 2026-02-26 | **2026-11-17** | 3.8 Flash or Flash-Lite TTS |
| gemini-2.5-flash/pro-preview-tts | 2025-05-20 | **2026-11-17** | 3.8 Flash or Flash-Lite TTS |
| gemini-3.8-flash-tts, -flash-lite-tts | 2026-09-22 (GA on the API; Preview on Agent Platform) | none announced | n/a |
| gemini-3.5-transcribe(-live) | Aug 2026 | none announced | n/a |
| gemini-3.8-flash | 2026-09-02 | none (API); 2027-09-02 or later (Agent Platform) | n/a |
| gemini-3.6-flash | 2026-07-21 | none (API); **2026-11-19 (Agent Platform)** | n/a |
| gemini-3.5-flash-lite | 2026-07-21 | none (API); 2027-07-21 or later (Agent Platform) | n/a |
| gemini-3.1-flash-lite | 2026-05-07 | 2027-05-07 | 3.5-flash-lite |
| gemini-3.7-flash / 3.5-flash | n/a | deprecated 2026-10-08; requests auto-route to 3.8 and 3.6 Flash | n/a |

**Google's churn pattern.** Preview Live models have lived about 8-11 months:

- 2.0-flash-live-001 lasted from 2025-04 to 2025-12.
- live-2.5-flash-preview lasted from 2025-06 to 2025-12.
- 3.1 Flash Live Preview runs from 2026-03 to 2026-11, about 8 months.

## 7. Free tier (what the owner's free keys can and cannot tell us)

**What the free tier offers:**

- **Cost.** Free of charge for every Live, TTS, Transcribe and cascade text model above. The exceptions are 2.5 Pro TTS
  and Gemini 4 Argon.
- **Data use.** Content may be used to improve Google products, and human review is possible.

**Rate limits:**

- Per-model RPM, TPM and RPD are **no longer published in the docs**. They appear only on the AI Studio rate-limit page,
  which needs a login.
- Limits apply per project, not per key. RPD resets at midnight Pacific.
- The spend-based limits by tier (Tier 1: $10 per 10 minutes; Tier 2: $50; Tier 3: $200) apply to paid tiers only.

**What Meera observed** (2026-08): the free TTS limit was a **daily** budget. The whole pool returned 429 together after
a few dozen calls, a ceiling of about 75 calls a day across the pool.

**What follows:**

- Free keys can be used to measure tokens per turn and latency on synthetic audio.
- Free keys cannot show paid-tier quotas, paid-tier latency, or billing as invoiced.
- **The brief's "provider billing reconciles within 10%" proof needs a paid key** (only the owner can provide one).

## 8. Meera archaeology (detail in `meera-gemini-archaeology.md`)

**Meera's live setup** (`src/voice/liveCall.ts` and `api/live-token.js`, identical on main, Maya and codex branches):

- Model `gemini-3.1-flash-live-preview`, AUDIO only, thinkingBudget 0.
- Voice Despina, languageCode hi-IN; persona about 44.8k characters in a roughly 70 KB setup frame.
- Input and output transcription on.
- VAD: END_SENSITIVITY_HIGH, silence 300 ms, prefix padding 60 ms.
- Compression `slidingWindow:{}` with defaults; no resumption. On goAway the client rotates to a fresh session with no
  recap, up to 6 times.
- Ephemeral tokens; a free key pool of about 48-51 AI Studio keys. The paid lane exists but is OFF.

**The sales-enabler port** (`lib/voice/server.ts`) differs:

- Default model is 3.8 Live; the Maya profile uses 3.1 Flash Live with Despina.
- No languageCode, no compression, no resumption.
- The token expires after 11 minutes.
- The Maya profile rotates a free key pool.

**The ₹1.3 trail:**

- `callcost-2026-08-23` gives $0.0142 a minute: list-price arithmetic, 0 calls, talk-share bands, system instruction
  billed per rotation.
- `market-sweep-2026-08` (2026-08-25 11:56 UTC) restates "₹1.3/min COGS" with no derivation of its own.
- `watchcost-measured` (2026-08-25 12:20 UTC, about 25 paid sessions) measured screen-share mode at ₹1.1-1.6 a minute
  and found the +201-token constant. It noted "persona text amortized, not live-probed".

**Inherited latency** (code comment; vantage and date not recorded):

| model | median, end of speech to first audio | n |
|---|---|---|
| 3.1 Flash Live | 1,550 ms | 16 |
| 2.5 native audio 09-2025 | 2,536 ms | 21 |
| 2.5 native audio 12-2025 | 3,298 ms | 8 |

## 9. Predictions touched

| prediction | outcome | evidence |
|---|---|---|
| V7a: Gemini Live and TTS models used here are preview or recent, with no deprecation-free guarantee beyond 12 months | **held** | 3.1 Flash Live and 3.1 TTS are preview, with shutdown 2026-11-17. 3.8 Live has been GA for 33 days, with "no shutdown date announced" on the API and Agent Platform retirement "2027-09-25 or later", about 11 months away. 3.8 TTS is Preview on the Agent Platform |
| V1a: 3-minute Live costs more than ₹1.3 a minute at paid list price | not-tested (desk computation supports it) | computed ₹4.3-9.1 a minute at 3 minutes under the documented per-turn rule; needs g2's per-turn usageMetadata |
| V1b: 10-minute call costs at least 1.5x per minute of a 1-minute call without compression | not-tested (desk computation supports it) | computed 4.2x (lean) and 2.2x (Meera-size) |
| V1c: with compression on, 10 minutes is within 1.3x of 1 minute | not-tested (desk computation says it fails) | default `slidingWindow:{}` never triggers before about 104.9k tokens, so 4.2x. An explicit 4k history cap still gives 2.25x |
| V2a: the cheapest Gemini path fits ₹1.0 a minute at 3 minutes | not-tested (desk computation says it fails) | Gemini-only cascade ₹1.31-1.34 now and ₹1.66-1.69 in 2027; Live ₹4.6. Speech-to-text is 63% of the cascade |

## 10. Blocked or not done

- **Wayback Machine and Common Crawl were blocked** by the sandbox proxy (connection reset). So we have no archived copy
  showing whether the August 2026 pricing page also said Live prices would double, or whether the per-turn re-billing
  text existed then. Meera's 2026-08-23 entry says prices "DOUBLE on 2027-01-01 per the page" without naming models.
- **The Agent Platform locations page renders its availability ticks with client-side code,** so the static HTML is
  empty. Regions were taken from each model's page instead.
- **Free-tier per-model limits are not public;** reading them needs an AI Studio login.
- **No live Gemini traffic was sent by this lane.** That avoids competing with g2 for the single free key's quota. g2
  owns the measurement of per-turn usage, latency and gate lag.
- **The Meera Neon aggregate query was not run,** because the owner has not consented (brief §4).
- **There is no Google Cloud Billing Catalog SKU pull.** It needs authenticated access; the Agent Platform pricing page
  was used instead.
- **`findings.md` could not be written:** the harness refuses report files from subagents, so this markdown is the
  write-up.

## Sources (all read 2026-10-18 unless noted)

**Gemini API docs:**

- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://ai.google.dev/gemini-api/docs/live-api/best-practices#pricing-and-billing>
- <https://ai.google.dev/gemini-api/docs/live-api/session-management>
- <https://ai.google.dev/gemini-api/docs/live-api/capabilities>
- <https://ai.google.dev/api/live>
- <https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live>
- <https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview>
- <https://ai.google.dev/gemini-api/docs/deprecations>
- <https://ai.google.dev/gemini-api/docs/changelog>
- <https://ai.google.dev/gemini-api/docs/rate-limits>
- <https://ai.google.dev/gemini-api/terms> (effective 2026-03-23)
- <https://ai.google.dev/gemini-api/docs/logs-policy>
- <https://ai.google.dev/gemini-api/docs/ephemeral-tokens>
- <https://ai.google.dev/gemini-api/docs/tokens>

**Agent Platform (ex-Vertex) docs:**

- <https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing>
- <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-live> and the sibling model pages
  (3-5-flash-lite, 3-5-flash, 3-6-flash, 3-7-flash, 3-8-flash, 3-1-flash-lite, 2-5-flash, 2-5-flash-lite,
  2-5-flash-live-api, 3-8-flash-tts, 3-8-flash-lite-tts, 3-5-transcribe)
- <https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention>
- <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api>

**API responses:**

- `GET generativelanguage.googleapis.com/v1beta/models` (GEMINI_TEST_KEY)
- `GET https://openrouter.ai/api/v1/models`

**html-portfolio** (git show; branches main, origin/claude/ai-companion-app-rkt1lv, origin/codex/meera-forget-integrity-oct09):

- `context/measurements.md` entries `callcost-2026-08-23`, `cache-plateau`, `market-sweep-2026-08`, `watchcost-measured`
- `context/decisions.md` (paid lane, cost-frontier-map)
- `context/rejected.md` (realtime-azure)
- `api/live-token.js`
- `src/voice/liveCall.ts`
- `docs/research/market-sweep-2026-08-25.md`

**sales-enabler:** `lib/voice/maya/*` and `lib/voice/server.ts`.
