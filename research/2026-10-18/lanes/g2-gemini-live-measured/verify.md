# Verification: lane g2-gemini-live-measured

Verifier: adversarial check of the lane's 8 load-bearing findings, 2026-10-18. No paid calls were made. The checks
used the lane's raw per-call logs (`results/calls/*/usage.jsonl`, `turns.jsonl`, `meta.json`), its result CSVs and
harness code, and public Google pages read today. Recompute script:
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/g2verify/recompute.py` (it is
independent of `analyze.py`).

## Summary

| # | Claim | Verdict |
|---|---|---|
| 1 | 3.1 Flash Live cost per minute by call length ("Meera's config") | weakened |
| 2 | 3.8 Live cost per minute by call length | weakened |
| 3 | 2.5 native audio cost per minute by call length | weakened |
| 4 | Median cost per minute, all 2-3 minute calls | confirmed (as a lower bound) |
| 5 | Whole context re-billed; context audio = (VAD speech + agent audio) x 25; no listening time | weakened |
| 6 | Cost components of a 10-minute call | confirmed |
| 7 | Cost floor with perfect compression | confirmed (for a ~1k-token persona) |
| 8 | AI budget left by a ₹2 price | confirmed (arithmetic; the inputs come from the brief) |

Every number in claims 1-4 and 6 can be rebuilt exactly from the raw `usage.jsonl` rows at the list prices below.
The problems are in what the numbers mean, not in the arithmetic.

## Prices and units, re-read today

- **Pricing page** (`ai.google.dev/gemini-api/docs/pricing`). `gemini-3.8-live` and `gemini-3.1-flash-live-preview`
  share one table:
  - text in $0.75, audio in $3.00 ($0.005/min), image/video in $1.00;
  - text out $4.50 (thinking included), audio out $12.00 ($0.018/min);
  - prices are per 1M tokens.

  `gemini-2.5-flash-native-audio-preview-12-2025` is listed at text in $0.50, audio/video in $3.00, text out $2.00
  and audio out $12.00. The page has no row for `-latest`, so the lane's alias to preview-12-2025 is an inference.
  The page shows no caching prices for Live models and no announced price change for them. These match
  `harness/cost_model.py`, `analyze.py` and g1 `prices.json`.
- **Best-practices page**, billing rules:
  - "The API charges you per turn for all tokens present in the session context window."
  - Audio accumulates at about 25 tokens per second.
  - Transcription text is billed at the text output rate.
  - **Proactive audio:** input is billed the whole time the model is listening, and proactive audio is
    *permanently enabled* for `gemini-3.8-live`.
  - 3.1 Flash Live "bills only for audio you actively stream".
- **Deprecations page:** `gemini-3.1-flash-live-preview` and `gemini-2.5-flash-native-audio-preview-12-2025` both
  shut down on **2026-11-17**, and both are to be replaced by `gemini-3.8-live`. 3.8 Live has no shutdown date.
- **Exchange rate:** ₹94.95 per USD on 2026-10-18 (Pluang mid-market rate). The lane's ₹95 is correct.
- **Measured output tokens per second of agent audio:** 25.3-26.0 on 3.1, 25.3-26.4 on 3.8 and 25.8-28.0 on 2.5. The
  25 tok/s rule is about 2-6% low. This does not affect the measured costs, which use actual token counts.

## Cross-cutting defects

1. **Unpriced prompt tokens.** On 3.1 and 3.8, part of `promptTokenCount` is not broken down by modality in
   `promptTokensDetails`. It is 6-11% of prompt tokens on 3.1 and 4-7% on 3.8. For example, in the last invocation
   of `us_g31_10m_off` the prompt is 15,104 tokens, but TEXT 2,446 + AUDIO 10,977 = 13,423, which leaves 1,681.
   `analyze.py` prices only the broken-down part. (It does price an unbroken *response* remainder, but there is
   none.) The paid sibling lane g5 prices this gap at the audio input rate.

   What the gap adds per minute:

   | gap priced at | 3.1 | 3.8 |
   |---|---|---|
   | text input rate | +₹0.03-0.23 | +₹0.03-0.24 |
   | audio input rate | +₹0.13-0.92 | +₹0.13-0.97 |

   On 2.5 the gap is 0.
2. **Listening time.** usageMetadata really does show no listening time. However, the docs say 3.8 Live always runs
   proactive audio, and that proactive audio bills input for the whole listening time. For 3.1, the docs say it bills
   for audio you actively stream, and the harness streamed continuously, sending silence frames between clips.

   The meter is not the invoice, and no invoice has been reconciled (g1 says the same). Suppose listening time is
   billed once at the audio input rate. That would add about ₹0.24-0.43 a minute, depending on whether the time the
   agent is speaking counts as listening.
3. **"Compression on" cells mostly never compressed.** I looked for drops in `promptTokenCount` in the 12 on6k calls.
   Compression fired only in these:
   - 3.1 10 min (at 5.0 and 8.26 min) and 3.1 5 min (at 4.78 min);
   - 3.8 10 min (at 5.9 and 9.97 min);
   - 2.5 10 min (at 5.8 and 8.9 min).

   Each time it fired at 8.4-10.1k tokens, not at the configured 6,000 trigger. The 1-minute and 3-minute "on"
   cells, plus 3.8 and 2.5 at 5 minutes, are uncompressed repeats. Their gap from "off" is run-to-run noise. For
   example, on 3.8 at 3 minutes, "off" cost ₹4.04 and "on" cost ₹5.20 with no compression event.
   `cost_model.project()` assumes the cut happens exactly at the trigger, so its compression savings are
   optimistic.
4. **One call per cell.** Calls with the same configuration differ by up to about 30% (see the 3.8 example above).

## Per-claim notes

### 1. 3.1 Flash Live by call length: weakened

- **Reproduced exactly:**
  - off: 2.498 / 3.842 / 5.002 / 7.449;
  - on: 2.436 / 3.477 / 4.914 / 5.574;
  - 69 invocations across the uncompressed calls.
- **Why the 10-minute call stopped at 9.15 minutes:** the free-tier quota ran out (close code 1011, "You exceeded
  your current quota").
- **Not Meera's config.** The model, VAD settings, thinkingBudget 0, voice and hi-IN match Meera. The persona does
  not: the harness persona is 2,955 characters (about 870 text tokens), while Meera's is about 44.8k characters
  (about 12-14k tokens, per g1's archaeology). The lane's own projection for a 13k-token persona, uncompressed, is
  ₹5.98 / ₹6.75 / ₹8.48 / ₹11.53.
- **Compression:** "on" at 1 and 3 minutes never compressed.
- **Unpriced gap:** adding it raises the 10-minute figure to ₹7.68 (text rate) or ₹8.37 (audio rate).
- **The paid-key lane g5 re-ran the same matrix and got higher figures:**
  - off: 2.47 / 4.33-5.08 / 6.85 / 9.95-11.54;
  - on: 2.55 / 4.14-4.24 / 5.34 / 6.15-6.62.
- **Lifecycle:** the model shuts down on 2026-11-17.

### 2. 3.8 Live by call length: weakened

- **Reproduced exactly:**
  - off: 2.826 / 4.042 / 6.884 / 11.525;
  - on: 3.061 / 5.201 / 6.664 / 8.976.
- **The 3-minute "off" figure (₹4.04) is the lowest** of the 8 comparable 3-minute P1 calls on 3.8. The others:
  - the sandbox on6k call, which never compressed: ₹5.20;
  - India P1a, P1b and P1c: ₹5.52-5.79;
  - g5 paid: ₹5.67-5.78.
- **Compression:** only the 10-minute "on" cell compressed.
- **Unpriced gap:** +₹0.03-0.24 a minute at the text rate, or +₹0.13-0.97 at the audio rate.
- **Listening time:** the docs' always-on proactive billing could add about ₹0.24-0.43 a minute.
- **g5 paid figures:**
  - off: 3.31 / 5.72 / 8.05 / 12.55-12.85;
  - on: 3.34 / 5.67-5.78 / 7.94 / 8.94-9.17.

### 3. 2.5 native audio by call length: weakened

- **Reproduced exactly:**
  - off: 1.678 / 1.713 / 2.104 / 3.738;
  - on: 1.791 / 1.717 / 1.999 / 2.871;
  - history billed as audio instead: 2.48 / 3.61 / 6.19 / 14.11.
- **The docs favour the higher figures.** The billing section says conversation history "is kept as native audio
  tokens, billed at the standard audio input rate on every turn". g1 also flagged the TEXT label as contradicting the
  docs. Until an invoice shows otherwise, plan on ₹2.5 / ₹3.6 / ₹6.2 / ₹14.1.
- **Other caveats:**
  - the `-latest` alias has no price row of its own;
  - proactive audio was on, so the listening-time caveat applies;
  - compression fired only at 10 minutes.
- **Lifecycle:** the deprecations page sets preview-12-2025's shutdown for 2026-11-17. The models page limits 2.5 to
  users who have used it before, but also says it is "not deprecated" and will be served "until further notice".
  The two pages conflict. Either way, the ₹1.7 figure is not available to a new product.

### 4. Median, all 2-3 minute calls: confirmed (as a lower bound)

| model | n | p50 | range | p90 | p50, gap at text rate | p50, gap at audio rate |
|---|---|---|---|---|---|---|
| 3.1 | 9 | ₹3.75 | 3.15-4.75 | ₹4.72 | ₹3.83 | ₹4.08 |
| 3.8 | 18 | ₹5.35 | 4.04-8.51 | ₹6.65 | ₹5.45 | ₹5.75 |
| 2.5 | 9 | ₹1.72 | 1.34-2.69 | ₹2.66 | ₹1.72 | ₹1.72 |

- **The pools are mixed.** They combine:
  - scripts W, PAUSE, P1 and P4;
  - tuned and server VAD;
  - thinking settings;
  - one compression-on call that never compressed;
  - one 2.5 call with no flags set.
- **Vantage changes the 3.8 median:** India p50 is ₹5.78 (n=12), the sandbox is ₹4.60 (n=6).

### 5. Re-billing and context composition: weakened

- **Confirmed:**
  - prompt tokens grow monotonically, which matches the per-turn re-billing in the docs;
  - none of the 1,096 invocations contains a `cachedContentTokenCount` key;
  - silence outside the server-VAD segments is not in context (for example, 549 s streamed but only 162 s of VAD
    speech).
- **The 25 tok/s match is looser than claimed.** I compared the audio in the last invocation with (server-VAD caller
  speech + agent audio) x 25. Results: 96.6% (3.1, 10 min), 100.3% (3.1, 5 min), 104.1% (3.8, 5 min) and
  102.6% (3.8, 10 min). If the response still in progress is left out, the range is 99.5-105.5%. So the match is
  about ±5%, not "within 4%".
- **There is also a fixed audio offset at invocation 0** of roughly 190-260 tokens. For example, 3.8 reports 257
  audio tokens at t = 2.8 s.
- **Unpriced gap:** 4-11% of prompt tokens have no modality breakdown.
- **"No listening time" holds for the metadata, not the bill.** The docs state the opposite for 3.8 Live (see
  cross-cutting defect 2). Listening time being free cannot be inferred from usageMetadata.

### 6. Cost components: confirmed

- **Reproduced:**
  - context audio is ₹5.99 of ₹7.45 a minute on 3.1, and ₹9.66 of ₹11.53 on 3.8;
  - $12/1M x 25 tok/s x 60 s x 95 = ₹1.71 per minute of agent speech, which matches the published $0.018/min;
  - 24 sandbox rows.
- **Output audio** on the 3.x calls is ₹0.78-1.09 a minute with compression off, and up to ₹1.19 with on6k. "Roughly
  ₹0.8-1.1" is fair.
- At the measured 25.3-26.4 tok/s, a minute of agent speech actually costs ₹1.73-1.81.

### 7. Cost floor: confirmed (for a ~1k-token persona)

- **Rebuilt from `cost_fit_params.csv`:**
  - 3.1: ₹1.62;
  - 3.8: ₹1.90, or ₹1.75 with thinkingBudget 0;
  - 2.5: ₹1.13.
- **The floor depends on persona size:**
  - a 4k-token persona adds about ₹0.83 a minute (3.1);
  - Meera's 13k-token persona adds about ₹3.2 a minute.
- **The floor leaves out** the unpriced prompt tokens and the docs' listening-time charge.
- **The conclusion (above the budget) is robust.** Output audio alone, at 20-41 s of agent speech a minute, costs
  ₹0.57-1.17. g5's tightest paid compression run (trigger 2,500, target 1,500, 10 minutes) cost ₹2.85 on 3.1 and ₹3.68
  on 3.8, which fits this being a floor.

### 8. AI budget: confirmed

- **Arithmetic:**
  - ₹2 including 18% GST leaves ₹1.695 net. Then 1.695 x 0.6 - 0.38 = ₹0.637, and 1.695 x 0.4 - 0.48 = ₹0.198.
  - With GST on top: 2 x 0.6 - 0.38 = ₹0.82, and 2 x 0.4 - 0.48 = ₹0.32.
- **Assumptions:**
  - telephony of ₹0.38-0.48 and margins of 40-60% are the brief's assumptions; they were not verified here;
  - platform and hosting overhead are left out, as stated.
- **The budget is lower than the brief's guess:** ₹0.20-0.82 against the brief's ₹0.5-1.0.

## What would settle the open points

- A paid-project Cloud Billing export (SKU-level) for a few calls of known length, reconciled against
  usageMetadata. This one check settles three things:
  - whether the undetailed prompt tokens are billed, and at which rate;
  - whether 3.8 Live bills listening time;
  - whether 2.5's TEXT-labelled history is billed as text.
- Three or more calls per cell on `gemini-3.8-live`, the only model that survives 2026-11-17. These should use the
  production-size persona and a compression trigger low enough to fire in short calls.
