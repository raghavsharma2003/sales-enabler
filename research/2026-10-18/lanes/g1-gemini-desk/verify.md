# Adversarial verification: lane g1-gemini-desk (2026-10-18)

Verifier read the lane files, re-opened every cited Google page on 2026-10-18 (WebFetch plus raw `curl` copies saved in
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/verify-g1/raw/`), re-ran the cost model, and
cross-checked it against lane g2's measured per-invocation `usageMetadata`
(`lanes/g2-gemini-live-measured/results/token_growth.csv`, `calls_cost.csv`, `cost_fit_params.csv`). No paid calls were
made. Nothing was committed.

## Verdicts

| # | claim | verdict |
|---|---|---|
| 1 | Live list prices (3.8 Live, 3.8 Live Extended Thinking, 3.1 Flash Live Preview) | confirmed |
| 2 | Each turn re-bills the whole context, with past audio billed at the audio input rate | confirmed (one exception on 2.5) |
| 3 | `slidingWindow:{}` defaults never fire in normal calls | confirmed |
| 4 | Computed ₹/min grid | weakened (arithmetic is right; the cap rows and the Meera row are optimistic) |
| 5 | ~₹1.3/min is Meera's computed `callcost-2026-08-23`, not measured, with no per-turn re-billing | confirmed (the attribution is inferred) |
| 6 | Meera's live and TTS models have an earliest shutdown of 2026-11-17 | confirmed |
| 7 | No India region for Live on Agent Platform | confirmed |
| 8 | Gemini API terms: data use, residency, age | confirmed (two paraphrases need fixing) |

## 1. Live list prices: confirmed

The pricing page was re-read with "Last updated 2026-10-16 UTC". It has one shared Standard table for `gemini-3.8-live`,
`gemini-3.8-live-extended-thinking` and `gemini-3.1-flash-live-preview`, and the paid figures quoted below appear
verbatim on it.

| tier | input | output |
|---|---|---|
| free | "Free of charge" | "Free of charge" |
| paid, per 1M tokens | "$0.75 (text)", "$3.00 or $0.005/min (audio)", "$1.00 or $0.002/min (image/video)" | "$4.50 (text)", "$12.00 or $0.018/min (audio)" |

- **No dated price change.** The Live rows carry no "through" or "starting" dates. The page does date changes for
  3.6/3.7/3.8 Flash (2027-01-01) and for Gemini 4 Argon (2026-12-01).
- **Agent Platform matches.** It lists the same 3.8 Live figures, Non-global.

Unit notes:
- $3/1M at 25 tok/s is $0.0045 a minute. The page rounds it up to $0.005.
- $12/1M at 25 tok/s is exactly $0.018 a minute.
- The $4.50 text output rate includes thinking tokens.
- Only a Standard tier exists for Live: no Batch, Flex or Priority.

## 2. Per-turn context re-billing: confirmed

The best-practices page (last updated 2026-09-15) says, verbatim:

- "The API charges you per turn for all tokens present in the session context window."
- "Past tokens are re-processed and accounted for in each new turn, up to your configured context window size."
- "The API bills you for the accumulated native audio tokens at the standard audio input rate on every turn."

The Agent Platform pricing page prints the same rule: "Tokens from past turns are re-processed and billed in every new
turn, up to the configured context window size limit." It also states the 25 tokens per second audio rate.

**The meter agrees.** g2's real usageMetadata for 3.1 and 3.8 shows:
- `prompt_audio` grows by about 1,157-1,234 tokens per minute;
- a text intercept of about 869-1,029 tokens (the persona) is present on every invocation.

So the system instruction really is billed every turn, even though the billing section never names it.

Corrections:
- **2.5 native audio is an exception.** On `gemini-2.5-flash-native-audio-latest`, history is metered as text, not
  audio: about 1,338 text tokens per minute of growth against 59 audio. That contradicts the doc's "retains
  conversational history as raw audio tokens" for 2.5.
- **No invoice check yet.** usageMetadata is the meter, not an invoice, and no paid invoice has been reconciled.

## 3. Compression defaults: confirmed

The API reference says, verbatim:

- triggerTokens: "If not set, the default is 80% of the model's context window limit."
- targetTokens: "The default value is trigger_tokens/2."
- "System instructions and any `BidiGenerateContentSetup.prefixTurns` will always remain."

`models.list` gives `inputTokenLimit` 131072 for all three Live models. 80% of that is 104,858.

g2 measured final contexts of 14.5k-15.6k tokens at 10 minutes, consistent with g1's 13k-23k computed range. That is far
below the trigger.

Caveat for the recommendation "set triggerTokens explicitly": g2's explicit trigger 6,000 / target 3,000 did not hold.
Compression fired only after the prompt reached 8,630-10,091 tokens, and it landed at 3,852-4,431. The cap is soft.

## 4. Computed ₹ per minute: weakened

**The arithmetic is right.**
- Re-running `live_cost_model.py` gives a byte-identical CSV of 720 rows (576 live, 144 cascade).
- All quoted values match the CSV:
  - lean: 2.676 / 4.600 / 6.524 / 11.333
  - Meera 12k: 7.165 / 9.089 / 11.013 / 15.822
  - 4k cap: 2.676 / 4.600 / 5.466 / 6.043
- A hand calculation of the lean 1-minute row also gives $0.02817, or ₹2.676.
- Prices are paid list. FX ₹95 is an assumption, not sourced.

**Back-test against g2 measurements.** I fed g1's model each g2 call's own measured inputs: call length, persona size,
invocations per minute, and talk shares.

| setup | model as % of measured cost |
|---|---|
| no compression, 3.8 | 87-94% (₹2.66 vs 2.83 at 1 min; ₹10.87 vs 11.53 at 10 min) |
| no compression, 3.1 | 85-92% (₹6.63 vs 7.45 at 10 min) |
| compression 6k/3k, 3.8, 10 min | 72% (₹6.42 vs 8.98) |
| compression 6k/3k, 3.1, 10 min | 84% (₹4.66 vs 5.57) |

The uncompressed shortfall is mostly text-history growth, about 184 tokens per minute, which the model does not include.

Corrections:
- **The history-cap rows are optimistic.** The "≤4k history" figures (5.47 / 6.04, and 9.95 / 10.53 for Meera) are too
  low, because real compression fires well above triggerTokens. At 10 minutes the measured cap saved 22% (3.8:
  11.53 to 8.98) and 25% (3.1: 7.45 to 5.57). The model implies 47%.
- **The "Meera-size 12k" profile is low.**
  - Meera's own "$0.0105 per rotation" implies 14k text tokens (14,000 × $0.75/1M). At 14k the row becomes ₹8.02 /
    9.94 / 11.87 / 16.68.
  - Her live setup frame is about 70 KB (`liveCall.ts` comment). At the 4.03-4.07 bytes per token measured in
    `cache-plateau`, that is about 16-18k tokens. At 17k the row becomes ₹9.30 / 11.23 / 13.15 / 17.96.
- **Turn rate.** 6 turns a minute matches 3.8 (g2 measured 4.7-6.1). 3.1 measured only 3.6-3.9, so the 4-turns-a-minute
  sensitivity row (2.03 to 7.80) is the better 3.1 analogue.

## 5. Origin of ~₹1.3 per minute: confirmed

Read with `git show origin/claude/ai-companion-app-rkt1lv:context/measurements.md` (head f4f78ade, 2026-10-14).

The `callcost-2026-08-23` entry says:
- "live voice $0.0142" per typical minute, computed from prices fetched 2026-08-23, with "lane constants read from the
  shipping code";
- "Today-cost $0 until the free pool's daily budget exhausts";
- the system instruction is "billed per cascade TURN and per goAway rotation (~$0.0105/rotation)";
- "real usageMetadata per call" is ranked first among the things still unmeasured.

It also gives "30 min/day month: live $13 (Rs.1,096)", which implies about ₹84-86 to the dollar. $0.0142 is ₹1.22 at
₹86 and ₹1.35 at ₹95.

Corrections:
- **The attribution is inferred, not documented.**
  - The only "₹1.3" string on that branch is `market-sweep-2026-08`: "vs our ₹1.3/min COGS". It gives no derivation,
    and "COGS" does not appear in `docs/research/market-sweep-2026-08-25.md`.
  - Commit 0657e21b (2026-08-25T11:56Z) predates `watchcost-measured` (360cd190, 12:20Z), so the measured ₹1.1-1.6
    watch figure is not its source.
  - `cache-plateau`'s "live 10-min call ≈ $0.13" is a second non-compounding list-price candidate.
  - The conclusion is the same either way.
- **The "within 6%" reconstruction shows consistency, not identification.** With talk share 0.39 it gives $0.0129-0.0149
  for any prompt size from 12k to 17k and any rotation interval from 5 to 15 minutes. It also bills 60 s of continuous
  input audio, which 3.1 does not.

## 6. Shutdowns: confirmed

The deprecations page lists "Shutdown date (earliest)" November 17, 2026 for each of these:

| model | recommended replacement |
|---|---|
| `gemini-3.1-flash-live-preview` | `gemini-3.8-live` |
| `gemini-2.5-flash-native-audio-preview-12-2025` | `gemini-3.8-live` |
| `gemini-3.1-flash-tts-preview` | `gemini-3.8-flash-tts` or `gemini-3.8-flash-lite-tts` |
| `gemini-2.5-flash-preview-tts` | same as above |
| `gemini-2.5-pro-preview-tts` | same as above |

- That date is 30 days after 2026-10-18.
- Meera's code pins `LIVE_MODEL = "models/gemini-3.1-flash-live-preview"` (`api/live-token.js`) and TTS
  `gemini-3.1-flash-tts-preview` (`api/speech.js`).

Corrections:
- **The dates are earliest possible, not fixed.** The page says these are "the earliest possible dates", and the exact
  dates will be communicated with advance notice. "Shut down soon" overstates that certainty.
- **3.8 Live is safe.** `gemini-3.8-live` has "No shutdown date announced".
- **One more retirement.** On the Agent Platform, `gemini-live-2.5-flash-native-audio` retires on 2026-12-13.

## 7. No India region: confirmed

**`gemini-3.8-live`** (Agent Platform model page):
- model availability, Standard PayGo and Provisioned Throughput: "Multi-region: `us`, `eu`" plus "United States:
  `us-central1`";
- ML processing: "Multi-region: `us`, `eu`";
- GA September 24, 2026; retirement "September 25, 2027 or later".

**`gemini-live-2.5-flash-native-audio`:** seven us-* and six europe-* regions.

No asia-south1, asia-south2 or any other asia-* region appears on either page.

## 8. Terms: confirmed

The terms page shows "Effective March 23, 2026" and "Last updated 2026-04-28".

- **Paid:** "Google doesn't use your prompts ... or responses to improve our products". Prompts are logged "for a limited
  period of time" for abuse detection, and "may be stored transiently or cached in any country".
- **Unpaid:** content is used to "provide, improve, and develop Google products"; "human reviewers may read"; "Do not
  submit sensitive, confidential, or personal information".

Corrections:
- **The under-18 restriction is broader than the lane's paraphrase.** The terms say: "You must be 18 years of age or
  older" and "will not use the Services as part of a website, application, or other service ... that is directed
  towards or is likely to be accessed by individuals under the age of 18". This applies to any API client, not to
  "professional use directed at minors". It would bar a children's product outright.
- **"Not for consumer use" restricts the developer, not the product.** It describes who uses AI Studio and the API:
  "developers building with Google AI models for professional or business purposes". The same section contemplates
  making "API Clients available to users". It does not ban consumer-facing apps.
- **What counts as Paid.** The API counts as Paid "only when accessing the API through a Cloud Project associated with
  an active billing account".
- **EEA, Switzerland and UK.** Paid-tier data terms apply to all usage from these regions, and only Paid Services may
  serve users there.

## Housekeeping

- **Missing file.** `meera-gemini-archaeology.md` §5 cites "computed in `findings.md`" for the AI budget, but no
  `findings.md` exists in this lane directory. The matching numbers are in `lanes/g2-gemini-live-measured/results/ai_budget.csv`.
- **Ephemeral raw copies.** g1's raw page copies live in the session scratchpad, so they are ephemeral. The Google URLs
  above are the durable sources.
