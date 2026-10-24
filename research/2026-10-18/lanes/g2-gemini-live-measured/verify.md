# Verification: lane g2-gemini-live-measured

Adversarial check of the lane's 8 load-bearing findings, run 2026-10-19 (lane date 2026-10-18). No paid calls were made.

**What I checked against:**
- the raw per-call logs (`results/calls/*/meta.json`, `usage.jsonl`, `turns.jsonl`, 54 calls, 1,096 usage events);
- the lane's harness (`harness/analyze.py`, `cost_model.py`);
- the sibling lanes g1 (desk research) and g5 (paid-key rerun);
- the public Google pages, re-read today.

**Recompute scripts.** These are mine, written without reusing `analyze.py`, in
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/g2verify2/`:
- `rc.py`: cost per call, the 2-3 minute pools, the untyped prompt tokens and compression events;
- `ctx.py`: what the audio context is made of;
- `comp.py`: the cost components and the 2.5 sensitivity.

An earlier `verify.md` in this folder (2026-10-18 20:10) is replaced by this file. My independent numbers agree with it.

## Verdicts

| # | Claim | Verdict |
|---|---|---|
| 1 | 3.1 Flash Live cost per minute by call length ("Meera's config") | **weakened** |
| 2 | 3.8 Live cost per minute by call length | **weakened** |
| 3 | 2.5 native audio cost per minute by call length | **weakened** |
| 4 | Median cost per minute of all 2-3 minute calls | **confirmed** (as metered usage; it is a lower bound on the bill) |
| 5 | Whole context re-billed; context audio = (VAD speech + agent audio) x 25; no listening time | **weakened** |
| 6 | Cost components of a 10-minute call | **confirmed** |
| 7 | Cost floor with perfect compression | **confirmed** (for the harness's ~0.9-1.2k-token persona) |
| 8 | AI budget left by a ₹2 price | **confirmed** (arithmetic; telephony and margin are the brief's inputs) |

Every ₹/min figure in claims 1-4, 6 and 7 rebuilds exactly from the raw usage rows. I priced them at the list prices
below, at ₹95/$, plus the lane's transcript-token estimate. All 54 calls match `cost_by_length.csv` to three
decimals. The problems are in what the meter-based numbers mean, not in the arithmetic.

## Prices, units and dates re-read today

- **Pricing page** (ai.google.dev/gemini-api/docs/pricing). `gemini-3.8-live`, `-extended-thinking` and
  `gemini-3.1-flash-live-preview` share one table. Prices are USD per 1M tokens:

  | | text | audio | image/video |
  |---|---|---|---|
  | input | $0.75 | $3.00 ($0.005/min) | $1.00 |
  | output | $4.50 (includes thinking) | $12.00 ($0.018/min) | — |

  - `gemini-2.5-flash-native-audio-preview-12-2025`: text in $0.50, audio/video in $3.00, text out $2.00, audio out
    $12.00.
  - There is no caching row and no announced price change for any Live model.
  - There is no row for `gemini-2.5-flash-native-audio-latest`. The lane prices it as preview-12-2025, which is an
    inference.
  - These prices match `cost_model.py`, `analyze.py` and g1 `prices.json`.
- **Best-practices page** (ai.google.dev/gemini-api/docs/live-api/best-practices):
  - "The API charges you per turn for all tokens present in the session context window."
  - History is kept "as raw audio tokens" and billed "at the standard audio input rate on every turn".
  - Audio runs at about 25 tokens per second.
  - Transcription text is billed at the text output rate.
  - With proactive audio, "the API charges for input tokens the entire time the Live API is listening".
  - "Proactive audio is permanently enabled in `gemini-3.8-live`."
  - For 3.1 Flash Live, "the API bills only for audio when you actively stream input".
- **Deprecations page.** `gemini-3.1-flash-live-preview` and `gemini-2.5-flash-native-audio-preview-12-2025` both shut
  down on **2026-11-17**, and both are to be replaced by `gemini-3.8-live`. 3.8 Live (released 2026-09-15) has no
  shutdown date.
- **Models page.**
  - 3.1 is "Legacy ... We recommend updating to Gemini 3.8 Live".
  - Access to 2.5 is limited to "users who have actively used them in the past".
  - No `-latest` alias is listed for the Live models.
- **Exchange rate.** Pluang mid-market shows 1 USD = ₹94.95 (updated 2026-10-19, previous close 94.95). The lane's
  ₹95 is within 0.1%.

## Cross-cutting defects

1. **Untyped prompt tokens are not priced.** On 3.1 and 3.8, part of `promptTokenCount` has no modality in
   `promptTokensDetails`. `analyze.py` prices only the typed part.
   - Size: 6.2-10.7% of prompt tokens on 3.1 and 4.0-7.4% on 3.8. On 2.5 it is 0.
   - It grows over the call. In `us_g31_10m_off` it is 27 tokens at the first invocation and 1,681 at the last
     (prompt 15,104 = TEXT 2,446 + AUDIO 10,977 + 1,681).
   - Priced at the text-in rate it adds ₹0.03-0.23/min; at the audio-in rate, ₹0.10-0.97/min. g5 prices it at the
     audio rate.
2. **The meter is not the invoice.** No Cloud Billing export has been reconciled. g1 and g5 say the same.
   - **Proactive listening.** The docs say proactive audio, always on for 3.8 and turned on in the 2.5 runs, bills input
     for all listening time. `usageMetadata` shows none.
   - **What that could cost.** Billed once at $3/1M, listening time could add ₹0.10-0.43/min: ₹0.10 if only time with
     no speech counts, ₹0.43 if the whole call does. It would be more if it were carried in the context and billed
     again each turn.
   - **3.1.** The harness streamed audio continuously, about 50 frames a second including silence. The docs bill 3.1
     for "audio when you actively stream input".
   - **The other direction.** 82 of 1,096 usage events report a prompt but no response, mostly interrupted
     generations. They are 0-22% of a call's prompt cost. Whether Google bills them under its "per turn" rule is
     undocumented, so the meter could also overstate the bill.
3. **Most "compression on" cells never compressed.** I looked for drops in `promptTokenCount`. Compression fired only
   in these calls:
   - 3.1 10 min, at 5.0 and 8.26 min;
   - 3.1 5 min, once at 4.78 min;
   - 3.8 10 min, at 5.92 and 9.97 min;
   - 2.5 10 min, at 5.79 and 8.91 min.

   Each time it fired at 8.4-10.1k tokens, not at the 6,000 trigger, and cut to 3.9-5.2k, not to the 3,000 target.

   The 1- and 3-minute "on" cells, plus 3.8 and 2.5 at 5 minutes, are repeat runs of an uncompressed configuration.
   Their gap from "off" is run-to-run noise. On 3.8 at 3 minutes, "off" is ₹4.04 and "on" is ₹5.20, with no
   compression event in either.

   `cost_model.project()` assumes the cut happens exactly at trigger and target, so its projected compression savings
   are optimistic.
4. **One call per cell, sensitive to pacing, low against the paid rerun.** g5 reran the same matrix on a paid key.
   - Its figures are higher at 3-10 minutes, even after the untyped tokens are added at the audio rate:

     | call | g2 + untyped tokens | g5 |
     |---|---|---|
     | 3.1, 10 min | ₹8.37 | ₹9.95-11.54 |
     | 3.8, 3 min | ₹4.29 | ₹5.72 |

   - g5's turn rate was higher: 6.79 turns/min against 4.65 on 3.8 at 3 minutes. Cost per minute scales with turns
     per minute, so the harness's pacing moves the result.
   - Treat any single g2 cell as about ±30%.
5. **Free-tier key.** g2 metered on a free test key (`GEMINI_TEST_KEY`). The 3.1 10-minute call died on close code
   1011, "You exceeded your current quota".
   - The prices applied are paid list prices, which is correct.
   - g5 found that paid and free meter the same way: first prompt 1,211/1,313 tokens on both, with the same structure.
   - Still, no g2 number comes from a paid-tier session.

## Per-claim notes

### 1. 3.1 Flash Live by call length: weakened
- **Reproduced exactly.**
  - Off: 2.498 / 3.842 / 5.002 / 7.449.
  - On6k: 2.436 / 3.477 / 4.914 / 5.574.
  - 69 invocations across the four "off" calls.
  - The 10-minute call ended at 549 s (9.15 min) on the free-tier quota error.
- **"Meera's config" is only partly true.**
  - These match Meera: the model, Despina with hi-IN, thinkingBudget 0, and the VAD (HIGH end sensitivity, 300 ms
    silence, 60 ms prefix).
  - **The persona does not match.** The harness persona is 2,955 characters (869 text tokens). Meera's system
    instruction is about 44.8k characters, an estimated 12-14k tokens (g1 archaeology).
  - The lane's own projection for a 13k-token persona, compression off, is ₹5.98 / 6.75 / 8.48 / 11.53.
  - **Session handling also differs.** Meera sets no session resumption and rotates to a fresh session on goAway,
    which resets the context. The harness resumed the session and carried the context over.
- **Adding the untyped tokens:** 10 min becomes ₹7.68 at the text rate, or ₹8.37 at the audio rate.
- **g5 paid rerun:**
  - off: 2.47 / 4.33-5.08 / 6.85 / 9.95-11.54;
  - on6k: 2.55 / 4.14-4.24 / 5.34 / 6.15-6.62.
- **Lifecycle:** the model shuts down on 2026-11-17.

### 2. 3.8 Live by call length: weakened
- **Reproduced exactly.**
  - Off: 2.826 / 4.042 / 6.884 / 11.525.
  - On6k: 3.061 / 5.201 / 6.664 / 8.976.
- **The 3-minute "off" figure (₹4.04) is the lowest** of the 3.8 3-minute P1 calls. The others:
  - the sandbox on6k call, which never compressed: ₹5.20;
  - India P1a, P1b and P1c: ₹5.52-5.79;
  - g5 paid: ₹5.72.
- **Compression:** only the 10-minute "on" call compressed.
- **Untyped tokens:** 4-7% of prompt tokens, adding ₹0.03-0.24/min at the text rate or ₹0.13-0.97 at the audio rate.
- **Listening time:** 3.8 always runs proactive audio, so the docs' listening-time charge applies. It could add about
  ₹0.10-0.43/min, unmetered.
- **g5 paid rerun:**
  - off: 3.31 / 5.72 / 8.05 / 12.55-12.85;
  - on6k: 3.34 / 5.67-5.78 / 7.94 / 8.94-9.17.

### 3. 2.5 native audio by call length: weakened
- **Reproduced exactly.**
  - Off: 1.678 / 1.713 / 2.104 / 3.738.
  - On6k: 1.791 / 1.717 / 1.999 / 2.871.
  - History re-priced as audio input: 2.481 / 3.611 / 6.184 / 14.107.
- **What drives the low figure.** `usageMetadata` labels the growing history TEXT, about 1,338 tokens/min, roughly an
  audio-like count. That makes it cheap at $0.50/1M. The best-practices page says Live keeps history "as raw audio
  tokens" billed at the audio input rate on every turn, and g1 flagged the same contradiction. Until an invoice shows
  otherwise, the docs-consistent figures are ₹2.5 / 3.6 / 6.2 / 14.1.
- **Other caveats.**
  - The `-latest` alias has no price row of its own.
  - Proactive and affective were on, so the listening-time caveat applies.
  - Compression fired only at 10 minutes.
- **Availability.** preview-12-2025 shuts down on 2026-11-17. The models page also limits 2.5 to past users, while
  saying it is "not deprecated". Either way, the ₹1.7 path is not open to a new product.

### 4. Median of all 2-3 minute calls: confirmed (as metered)

| model | n | p50 | range | p90 | p50 + untyped tokens at text rate | p50 + untyped tokens at audio rate |
|---|---|---|---|---|---|---|
| 3.1 | 9 | ₹3.75 | 3.15-4.75 | ₹4.72 | ₹3.83 | ₹4.08 |
| 3.8 | 18 | ₹5.35 | 4.04-8.51 | ₹6.65 | ₹5.45 | ₹5.75 |
| 2.5 | 9 | ₹1.72 | 1.34-2.69 | ₹2.66 | ₹1.72 | ₹1.72 |

- **n and pool membership verified** (calls of 2.1-3.3 minutes). The vantage is stated per row in the CSV.
- **The pools are mixed.** They combine:
  - scripts W, PAUSE, P1 and P4;
  - tuned and server VAD;
  - thinking none and budget 0;
  - an on6k call that never compressed;
  - one 2.5 call with no flags set.
- **Vantage changes the 3.8 median:** India p50 is ₹5.78 (n=12), the sandbox ₹4.60 (n=6). This is mostly a script and
  turn-rate difference.
- **2.5 under the docs' reading** (history billed as audio): the 2-3 minute median is about ₹3.92, not ₹1.72.

### 5. Re-billing and context composition: weakened
- **Confirmed on the meter.**
  - `promptTokenCount` grows monotonically and carries the whole context on every invocation, which matches the docs.
  - The key `cachedContentTokenCount` appears in 0 of 1,096 usage events.
  - Silence outside the server-VAD segments is not in context. In `us_g31_10m_off`, 549 s were streamed, but only
    162 s were VAD speech plus 292 s of agent audio, and the context holds 10,977 audio tokens.
- **The 25 tok/s match is about ±4%, slightly wider than claimed.** I compared the audio in the last invocation with
  (VAD speech + agent audio) x 25:

  | call | match |
  |---|---|
  | 3.1, 10 min | 96.6% |
  | 3.1, 5 min | 100.3% |
  | 3.8, 5 min | 104.1% |
  | 3.8, 10 min | 102.6% |

  - The claim says 96-103%. The 3.8 5-minute call is outside that.
  - There is also a fixed offset at invocation 0 of about 190-260 audio tokens (257 tokens at t = 2.9 s on 3.8). Meera
    measured that voiceConfig adds about 201 audio prompt tokens per turn, which fits.
- **The composition leaves out the untyped 4-11% of prompt tokens.**
- **"No listening time" is true of `usageMetadata` only.** The docs say the opposite for proactive audio, which is
  always on for 3.8. It cannot be read as "listening is free" until a billing export is reconciled.

### 6. Cost components: confirmed
- **Reproduced:**
  - 3.1, 10 min: context audio ₹5.985 of ₹7.449/min;
  - 3.8, 10 min: context audio ₹9.662 of ₹11.525/min;
  - all 24 sandbox matrix rows.
- **Output audio** on the 3.x calls is ₹0.78-1.09/min with compression off, and up to ₹1.19 with on6k. On 2.5 it is
  ₹0.66-1.13. "Roughly ₹0.8-1.1" is fair.
- **Per minute of agent speech:** $12/1M x 25 tok/s x 60 s x 95 = ₹1.71, which equals the published $0.018/min.
- **Measured output rate:** 25.3-26.4 tok/s on 3.x and 25.8-28.0 on 2.5. So a real minute of agent speech costs
  ₹1.73-1.92, which is 1-12% above ₹1.71.

### 7. Floor with perfect compression: confirmed (for a ~1k-token persona)
- **Rebuilt from raw rows.** The fit parameters match: inv/min 3.717 / 5.709 / 5.699, with 285 invocations across 12
  calls.
  - 3.1: ₹1.62;
  - 3.8: ₹1.90, or ₹1.75 without thoughts tokens;
  - 2.5: ₹1.13.
- **The floor depends on persona size.**

  | model | 4k-token persona | 13k-token (Meera-size) persona |
  |---|---|---|
  | 3.1 | ₹2.45 | ₹4.83 |
  | 3.8 | ₹3.11 | ₹6.77 |
  | 2.5 | ₹1.88 | ₹4.32 |

- **The floor leaves out** the untyped tokens and any listening-time charge, so the real floor is no lower.
- **The conclusion (above budget) is robust.** At 20-41 s of agent speech per minute, output audio alone is
  ₹0.57-1.17/min. g5's tightest paid run (trigger 2,500, target 1,500, 10 minutes) cost ₹2.85 on 3.1 and ₹3.68 on 3.8.

### 8. AI budget: confirmed
- **₹2 including 18% GST** leaves ₹1.695 net:
  - 1.695 x 0.6 - 0.38 = ₹0.637;
  - 1.695 x 0.4 - 0.48 = ₹0.198.
- **GST on top:**
  - 2 x 0.6 - 0.38 = ₹0.82;
  - 2 x 0.4 - 0.48 = ₹0.32.
- **The formula** AI = net x (1 - margin) - telephony is the right inversion of gross margin.
- **Not verified here:** telephony ₹0.38-0.48 and margins 40-60% are the brief's assumptions. Whether telephony is
  quoted net of GST was not checked either. Platform and hosting overhead are left out, as stated.
- **The budget is below the brief's guess:** ₹0.20-0.82 against the brief's ₹0.5-1.0.

## What would settle the open points

- **A paid-project Cloud Billing export at SKU level** for a few calls of known length, reconciled against
  `usageMetadata`. It settles four things at once:
  - whether the untyped prompt tokens are billed, and at what rate;
  - whether listening time is billed on 3.8 (and on proactive 2.5);
  - whether 2.5's TEXT-labelled history is billed as text;
  - whether prompt-only usage events are billed.
- **At least three calls per cell on `gemini-3.8-live`**, the only Live model that survives 2026-11-17. Use the
  production-size persona and a compression trigger low enough to fire in short calls.
