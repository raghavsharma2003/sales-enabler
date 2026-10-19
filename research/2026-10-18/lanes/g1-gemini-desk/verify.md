# Adversarial verification: lane g1-gemini-desk

Second, independent verifier pass, run 2026-10-19 against the lane's 2026-10-18 outputs. This file replaces the first
pass, which is preserved in git at da58e01. Where the two passes agree, this one adds new evidence. Where they differ, the
difference is stated.

## Method

**Pages.** Every cited Google page was downloaded again with `curl` and searched as raw text. Copies are in
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/verify-g1b/raw/`. That folder is ephemeral,
so the URLs below are the durable sources.

**Page history from Common Crawl.** Three older captures were fetched by byte range from `data.commoncrawl.org`:

| page | crawl | capture | WARC offset / length |
|---|---|---|---|
| pricing | CC-MAIN-2026-34 | 2026-08-07 22:45 | 60083182 / 31120 |
| pricing | CC-MAIN-2026-34 | 2026-08-13 21:29 | 61005035 / 31433 |
| live-api/best-practices | CC-MAIN-2026-30 | 2026-07-19 19:35 | 58401334 / 23135 |

**Cost model.** `live_cost_model.py` was copied to the scratchpad and re-run there. The lane's own CSV was not
overwritten. The lean rows were then checked by hand.

**Back-test.** The model was compared with lane g5's paid-key meter, using each call's raw per-turn rows
(`lanes/g5-gemini-paid/results/token_growth_per_turn.csv` and `sessions.csv`; vantage `sandbox-us-east-proxy`). It was
also compared with lane g2's free-key rows.

**Meera history.** Read with `git show` and `git log -S` on `/home/user/html-portfolio`. `api/_gkeys.js` was not opened,
because it holds keys.

**Limits.** No paid calls were made. Nothing was committed.

## Verdicts

| # | claim | verdict |
|---|---|---|
| 1 | Live list prices for 3.8 Live, 3.8 Live Extended Thinking and 3.1 Flash Live Preview; no price change announced | **confirmed** |
| 2 | Each turn re-bills the whole context, with past audio billed at the audio input rate | **confirmed**; 2.5-native-audio-latest is an exception |
| 3 | `slidingWindow:{}` defaults are too high to cap cost | **confirmed**; explicit triggers are soft |
| 4 | Computed ₹ per minute grid | **weakened**: the arithmetic is exact, but the grid runs low for 3.8 and for capped calls |
| 5 | ~₹1.3/min is Meera's `callcost-2026-08-23`: computed, not measured, with no per-turn re-billing | **weakened**: the facts about the entry hold; the identification is inferred |
| 6 | Earliest shutdown 2026-11-17 for Meera's live and TTS models | **confirmed**; two wording fixes |
| 7 | No India region for Live on Agent Platform | **confirmed**, with a stronger source |
| 8 | Gemini API terms: data use, residency, age | **confirmed**; two paraphrases are wrong |

## 1. Live list prices: confirmed

The pricing page (last updated 2026-10-16) has one Standard table for `gemini-3.8-live`,
`gemini-3.8-live-extended-thinking` and `gemini-3.1-flash-live-preview`. It reads verbatim:

| tier | input | output (including thinking tokens) |
|---|---|---|
| free | "Free of charge" | "Free of charge" |
| paid, per 1M tokens (USD) | "$0.75 (text)"; "$3.00 or $0.005/min (audio)"; "$1.00 or $0.002/min (image/video)" | "$4.50 (text)"; "$12.00 or $0.018/min (audio)" |

The Agent Platform pricing page lists the same 3.8 Live rates, as Non-global. It adds video (avatar) output at $1.00.

**No price change is announced.**
- The Live rows carry no "through" or "starting" dates.
- The Gemini API changelog (last entry October 13, 2026) has no Live price entry.

**Price history (new).**
- The 2026-08-07 and 2026-08-13 Common Crawl captures (page last updated 2026-08-05 and 2026-08-13) show
  `gemini-3.1-flash-live-preview` at identical rates, with no dated change.
- In those captures the 2027-01-01 doubling sits only under `gemini-3.6-flash` and `gemini-3.7-flash`.
- So Meera's note "they DOUBLE on 2027-01-01 per the page" did not cover the Live row. The lane left this open in
  `prices.json`; it can now be closed.
- The terms add that price changes take effect "30 days after they are posted unless otherwise specified".

**Unit checks.**
- At 25 tokens per second, $3 per 1M is $0.0045 a minute, which Google rounds to $0.005.
- $12 per 1M is exactly $0.018 a minute.
- $0.002 a minute for video at $1 per 1M implies about 33 tokens per second. That matches Meera's measured ~30 tokens a
  frame at about 1 fps. It does not match the Agent Platform's 258 tokens per image.

## 2. Per-turn context re-billing: confirmed

**The documentation.**
- The best-practices page (last updated 2026-09-15) says, verbatim:
  - "The API charges you per turn for all tokens present in the session context window."
  - "Past tokens are re-processed and accounted for in each new turn, up to your configured context window size."
  - "The API bills you for the accumulated native audio tokens at the standard audio input rate on every turn."
- The Agent Platform pricing page prints the same rule twice: "Tokens from past turns are re-processed and billed in
  every new turn".

**New: the rule predates Meera's estimate.** The 2026-07-19 capture of the best-practices page (page last updated
2026-06-01) already carries the same three sentences. So the rule was published before Meera's 2026-08-23 estimate. The
lane's archaeology §5 says this could not be checked; it can now be answered.

**The paid meter agrees.** Lane g5 recorded 1,093 paid usage events across 55 paid sessions (26 cost calls and 29
latency calls).
- `prompt_text` never fell below the system-instruction size: 868 tokens on 3.1 and 1,029 on 3.8. So the system
  instruction is billed on every turn.
- `prompt_audio` grows turn over turn.
- `cached` was 0 on every event.

**Corrections.**
- **2.5 native audio is an exception.** On `gemini-2.5-flash-native-audio-latest` (g2, free key, 10 minutes), history
  is metered as text:

  | | text | audio |
  |---|---|---|
  | first turn | 1,207 | 1 |
  | last turn | 14,246 | 574 |

  This contradicts "retains conversational history as raw audio tokens" for 2.5. It also means g1's 2.5 sensitivity row
  overstates 2.5's cost, because it bills that history at the audio rate.
- **No invoice yet.** `usageMetadata` is the meter, not an invoice, and no Google invoice has been reconciled.

## 3. Compression defaults: confirmed

The API reference (last updated 2026-10-09) says, verbatim:
- triggerTokens: "If not set, the default is 80% of the model's context window limit."
- targetTokens: "The default value is trigger_tokens/2."
- "System instructions and any BidiGenerateContentSetup.prefixTurns will always remain."

`models.list` gives `inputTokenLimit` 131072 for all three Live models. 80% of that is 104,857.6.

**Measured 10-minute contexts with compression off.**
- g2: 14.5k-15.6k tokens.
- g5 (paid): 15.9k-17.1k tokens.
- Both had a persona of about 1.2k tokens.

**Meera-size prompts do not change the conclusion.**
- With a Meera-size prompt of 14k-21k tokens, the model reaches about 25k-28k tokens at 10 minutes.
- Even a 17k prompt reaches only about 96k after 70 minutes.
- Meera also rotates to a fresh session at `goAway`.
- So the default never fires.

**Qualifier.** The quoted "14-22k at 10 minutes" applies to the lean prompt only.

**New caveat: explicit triggers are soft** (g5 paid raw rows).

| trigger / target | prompt reached before first eviction |
|---|---|
| 6000 / 3000 | 8.2k-9.9k |
| 2500 / 1500 | 3.1k-3.5k |

A 5-minute 3.8 call reached 8,659 tokens and never compressed.

## 4. Computed ₹ per minute: weakened

**The arithmetic is exact.**
- The re-run CSV is byte-identical: 720 rows (576 live, 144 cascade).
- Hand calculation, lean profile:
  - 1 minute: $0.02817, or ₹2.676;
  - 10 minutes: $0.1193 a minute, or ₹11.333.
- Every quoted value matches the CSV:
  - lean: 2.676 / 4.600 / 6.524 / 11.333;
  - Meera 12k: 7.17 / 9.09 / 11.01 / 15.82;
  - 4k cap: 2.68 / 4.60 / 5.47 / 6.04.
- Prices are paid Standard list. FX ₹95 is an assumption shared across lanes, not sourced.

**Against g5's paid meter** (₹ per minute; n = 1-2 calls per cell; US-East sandbox):

| | 1 min | 3 min | 5 min | 10 min |
|---|---|---|---|---|
| g1 lean, no compression | 2.68 | 4.60 | 6.52 | 11.33 |
| g5 3.1, off | 2.47 | 4.71 | 6.85 | 10.74 |
| g1 vs 3.1 | +9% | -2% | -5% | +5% |
| g5 3.8, off | 3.31 | 5.72 | 8.05 | 12.70 |
| g1 vs 3.8 | -19% | -20% | -19% | -11% |
| g1 "history ≤ 4k" | 2.68 | 4.60 | 5.47 | 6.04 |
| g5 3.1, trigger 6000 | 2.55 | 4.19 | 5.34 | 6.38 |
| g5 3.8, trigger 6000 | 3.34 | 5.72 | 7.94 | 9.05 |
| g1 cap vs 3.8 | -20% | -20% | -31% | -33% |

**Back-test with each call's own parameters.** Fed each g5 call's measured turns per minute, talk shares, system
instruction and first-turn audio, the model returns 70-95% of the measured cost (26 calls).

What the model leaves out:
- text-history growth of about 184 tokens per minute;
- 3.8's interleaved thinking, about 64 tokens per invocation (about ₹0.15 a minute);
- the soft trigger: it assumes compression fires exactly at the trigger.

**The 3.1 headline match is a coincidence.** The model assumes 6 turns a minute against 3.7-4.9 measured on 3.1, and
that offsets the omissions above. g5's "within about 8%" holds for 3.1 only.

**The Meera-size row is low.**
- Meera's live setup frame is about 70 KB (`liveCall.ts:3044`): the persona plus a live tail of about 21k bytes.
- At 3.4-4.05 bytes per token, that is 17k-21k tokens. The 3.4 is g5's persona, 2,956 B for 869 tokens; the 4.05 is
  Meera's `cache-plateau`.
- At 17k tokens the row becomes ₹9.30 / 11.23 / 13.15 / 17.96.

**Use g5's measured table, not this grid, as the cost figure.** The grid stays useful for sensitivity.

## 5. Origin of ~₹1.3 per minute: weakened

**The entry says what the lane says.** Read from `origin/claude/ai-companion-app-rkt1lv:context/measurements.md`, head
f4f78ade, 2026-10-14. `callcost-2026-08-23` says:
- "live voice $0.0142" per typical minute;
- computed from "lane constants read from the shipping code" and prices fetched 2026-08-23;
- "Today-cost $0 until the free pool's daily budget exhausts";
- the system instruction is "billed per cascade TURN and per goAway rotation (~$0.0105/rotation)";
- "real usageMetadata per call" heads the list of things still unmeasured.

`decisions.md` confirms "Live calls = gemini-3.1-flash-live-preview (free pool mint…)" and `paid-lane-off-by-default`
(2026-08-25). The reconstruction gives $0.01336, which is -5.9% from $0.0142: consistent, but not proof.

**Why the identification is only inferred.**
- **The only "₹1.3" anywhere** on main, the Maya branch and the oct09 branch is `market-sweep-2026-08`: "vs our
  ₹1.3/min COGS". It gives no derivation.
- **The arithmetic does not reach ₹1.3 at Meera's own FX.**
  - Her two conversions imply ₹85.8 to the dollar (Rs 1,096 for $12.78) and ₹85.0 (Rs 2,210 for $26.01).
  - At those rates $0.0142 is ₹1.21-1.22.
  - ₹1.3 needs about ₹92.
- **Other candidates exist.**
  - `cache-plateau`: "live 10-min call ≈ $0.13", or $0.013 a minute.
  - `watchcost-measured`: ₹1.1-1.6 a minute, from real `usageMetadata` on the paid key. That was about 25 sessions of 80 s
    each, with "persona text amortized, not live-probed". It was committed at 12:20Z (360cd190), 24 minutes after the
    sweep entry at 11:56Z (0657e21b).

**The conclusion holds either way.** Every candidate is either non-compounding list-price arithmetic or a short session
with the persona amortized. None is a measured full call under per-turn re-billing. The measured paid cost is ₹2.5-3.3 a
minute at 1 minute and ₹6.4-12.7 at 10 minutes (g5).

**Wording fix.** Replace "is Meera's callcost figure" with "most likely restates callcost's $0.0142; no derivation is
recorded".

## 6. Shutdowns: confirmed

The deprecations page (last updated 2026-10-12) lists "November 17, 2026" for each of these:

| model | recommended replacement |
|---|---|
| `gemini-3.1-flash-live-preview` | `gemini-3.8-live` |
| `gemini-2.5-flash-native-audio-preview-12-2025` | `gemini-3.8-live` |
| `gemini-3.1-flash-tts-preview` | `gemini-3.8-flash-tts` or `gemini-3.8-flash-lite-tts` |
| `gemini-2.5-flash-preview-tts` | same as above |
| `gemini-2.5-pro-preview-tts` | same as above |

`gemini-3.8-live`, `gemini-3.8-live-extended-thinking` and both 3.8 TTS models have "No shutdown date announced".

**Fixes.**
- **The dates are not fixed.** The page calls them "the earliest possible dates", with the exact date communicated "with
  advance notice". The date is 29 days from today, 2026-10-19.
- **Only two of the five are Meera's.**

  | model | used by |
  |---|---|
  | `gemini-3.1-flash-live-preview` | Meera `api/live-token.js` `LIVE_MODEL`; Maya `lib/voice/maya/profile.ts` |
  | `gemini-3.1-flash-tts-preview` | Meera `api/speech.js` `MODEL` and `FREE_MODEL`; Maya `lib/voice/maya/profile.ts` |
  | `gemini-2.5-flash-native-audio-preview-12-2025` | only a latency comment in `live-token.js` |
  | the 2.5 TTS models | "was here briefly", per a `speech.js` comment |

- **One more retirement.** On the Agent Platform, `gemini-live-2.5-flash-native-audio` retires 2026-12-13.

## 7. No India region: confirmed

**Model pages.**
- `gemini-3.8-live` (last updated 2026-10-16):
  - availability, Standard PayGo and Provisioned Throughput: "Multi-region: us, eu" plus `us-central1`;
  - ML processing: "Multi-region: us, eu";
  - GA September 24, 2026; retirement "September 25, 2027 or later".
- `gemini-live-2.5-flash-native-audio`: seven us-* and six europe-* regions.

**New, stronger source: the Agent Platform locations page.**
- `docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations`, last updated 2026-10-15.
- Its Mumbai (`asia-south1`) column supports only:
  - `gemini-3.5-flash-lite`;
  - `gemini-3.5-flash`;
  - `gemini-2.5-flash`;
  - `gemini-embedding-001` and the text and multimodal embeddings.
- No Live, Transcribe Live or Live Translate model has a Mumbai cell.
- `asia-south2` (Delhi) is not a column at all.

**Effect on V4.** V4's Vertex Mumbai/Delhi arm can exist only for cascade text models, not for Live.

## 8. Terms: confirmed

The terms page shows "Effective March 23, 2026" and was last updated 2026-04-28.

- **Paid:** Google "doesn't use your prompts … or responses to improve our products". Prompts are logged "for a limited
  period of time" for abuse detection. Data "may be stored transiently or cached in any country in which Google or its
  agents maintain facilities".
- **Unpaid:** content is used to "provide, improve, and develop Google products"; "human reviewers may read, annotate,
  and process"; "Do not submit sensitive, confidential, or personal information".

**Corrections.**
- **The age rule is broader than the lane's paraphrase.**
  - The terms say "You must be 18 years of age or older to use the APIs". They also bar any API client "that is directed
    towards or is likely to be accessed by individuals under the age of 18".
  - That covers every API client, not "professional use directed at minors".
  - It is a live V7 risk for the study-abroad configuration, whose callers can be school students under 18.
- **"Not for consumer use" restricts the developer, not the end product.** The text is: "for developers building with
  Google AI models for professional or business purposes, not for consumer use". The same section allows making "API
  Clients available to users".

**Additions.**
- "Paid" applies "only when accessing the API through a Cloud Project associated with an active billing account".
- Only Paid Services may serve users in the EEA, Switzerland and the UK.
- India is on the available-regions list (last updated 2026-04-28).

## Housekeeping

- **Missing file.** `meera-gemini-archaeology.md` §5 cites `findings.md`, which does not exist in this lane directory.
- **Ephemeral raw copies.** g1's raw copies are in the scratchpad (`research-raw-1018/g1-gemini-desk/`), so they are
  ephemeral.
- **Not verified.** Latency figures inherited in the archaeology were not checked. They are not load-bearing here, and
  their vantage is unrecorded: 1,550 ms (n=16), 2,536 ms (n=21) and 3,298 ms (n=8).
