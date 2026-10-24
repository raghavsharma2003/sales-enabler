<!-- Saved by the coordinator from the g5 agent's final message (the harness refused the agent's own findings.md write). Content is the agent's, condensed only where marked. -->

# g5-gemini-paid: Gemini Live and Gemini TTS on the paid tier

All runs were 2026-10-18, 18:40-20:18 UTC (00:10-01:50 IST), outside Indian business hours.

## Summary
- **Cost.** At paid list price (₹95/$), Gemini Live costs far more than ₹1.3 a minute, and the cost grows with call length.
  - 3.1-flash-live (Meera's model): ₹2.5/min at 1 minute, ₹4.2-4.7 at 3 minutes, ₹6.4-10.7 at 10 minutes.
  - 3.8-live: ₹3.3, ₹5.7 and ₹9.1-12.7.
  - About 70% of the cost is past audio billed again on every turn, as Google documents. g1's computed figures match the measured meter within about 8%.
  - Every configuration is 3-16 times over a ₹0.2-1.0 AI budget.
- **Paid against free.** No reliable latency difference from India. The only clear gain was 3.8 from the sandbox: 278 ms faster (CI -337 to -92), and paid was faster in 6 of 6 rounds. Paid and free meter identical token counts.
- **Latency from India.**
  - 3.8-live p50 is about 1.0-1.1 s, level with the round-2 cascade's 1.0 s. But it starts talking while the caller is still speaking on about 40% of turns.
  - 3.1 p50 is about 1.95 s.
  - With Meera's VAD (300 ms of silence ends a turn), both models replied into the elderly caller's mid-sentence pause on 26 of 26 pause turns.
- **Gate lag.** The first output-transcription text arrived in the same server message as the first audio on all 1,041 turns. Audio arrives 2-3 times faster than real time, so a text gate stays ahead of playback.

## Latency: caller end of speech to first agent audio chunk (ms)
Paired 2-minute calls, 6 rounds per vantage. The sandbox is US-East via an egress proxy. Talk-over turns are excluded from p50/p90 and counted separately. Intervals are 95% call-clustered.

| model | key tier | vantage | p50 (CI) | p90 | n | talk-over |
|---|---|---|---|---|---|---|
| 3.1-flash-live | paid | India VM | 1,950 (1,705-2,125) | 5,299 | 33 | 4/37 |
| 3.1-flash-live | free | India VM | 1,974 (1,624-2,164) | 2,726 | 34 | 5/39 |
| 3.1-flash-live | paid | sandbox | 1,917 (1,452-2,058) | 2,727 | 35 | 5/42 |
| 3.1-flash-live | free | sandbox | 1,928 (1,630-2,233) | 4,533 | 37 | 3/40 |
| 3.8-live | paid | India VM | 1,006 (950-1,253) | 1,524 | 30 | 22/53 |
| 3.8-live | free | India VM | 1,089 (958-1,291) | 1,584 | 31 | 23/54 |
| 3.8-live | paid | sandbox | 1,382 (1,164-1,572) | 1,815 | 43 | 11/54 |
| 3.8-live | free | sandbox | 1,660 (1,385-1,684) | 1,967 | 43 | 9/52 |

- **Paid minus free p50:**

  | model | India | sandbox |
  |---|---|---|
  | 3.1 | -24 ms | -11 ms |
  | 3.8 | -82 ms | -278 ms |

  Only the 3.8 sandbox difference excludes zero.
- **3.8 talk-over.** 3.8's p50 counts only the turns where it waited. On non-pause turns from India it talked over the caller 20 of 51 times paid and 21 of 52 free, starting 1.4-4.2 s into the caller's clip.
- **Long tails** come mostly from very short caller turns ("ok", "hmm"): 38 of 225 waited more than 3 s.
- **Session setup** (open plus setup) took 0.7-1.0 s from India against 0.53-0.63 s from the sandbox.

## Cost per connected minute (₹, measured usage × paid list price, plus transcription text)

| model | compression | 1 min | 3 min | 5 min | 10 min | 10 min ÷ 1 min |
|---|---|---|---|---|---|---|
| 3.1-flash-live | off | 2.47 | 4.71 | 6.85 | 10.74 | 4.35x |
| 3.1-flash-live | on (trigger 6,000 / target 3,000) | 2.55 | 4.19 | 5.34 | 6.38 | 2.50x |
| 3.1-flash-live | tight (trigger 2,500 / target 1,500) | - | - | - | 2.85 | 1.14x |
| 3.8-live | off | 3.31 | 5.72 | 8.05 | 12.70 | 3.84x |
| 3.8-live | on (trigger 6,000 / target 3,000) | 3.34 | 5.72 | 7.94 | 9.05 | 2.71x |
| 3.8-live | tight (trigger 2,500 / target 1,500) | - | - | - | 3.68 | 1.11x |

- **Where the money goes.** Re-billed prompt audio is 68-73% of cost, the agent's own output audio 10-15%, and transcription under 1%. Cached tokens were 0 on every turn.
- **Token growth.** The first turn bills about 1,200-1,300 prompt tokens. Each later turn adds roughly the previous turn's audio, about 220-480 tokens per turn. With compression off, a 10-minute call reaches about 16k tokens per turn.
- **The compression trade-off.** A tight trigger keeps the cost flat, but only about 17-27 s of audio history survives, so the agent forgets the call.
- **Resumption.** Across the goAway at about 550 s, the billed context carried over unchanged.
- **Turn rate.** 3.7-4.9 billed turns a minute on 3.1 and 5.6-7.3 on 3.8.

## Gate lag
- **First text against first audio:** 0 ms at p50, p90 and max. On 1,041 of 1,041 turns the first transcript arrived at or before the first audio.
- **Hold needed.** For no word to play before its text has arrived, a 0 ms hold was enough on 749 of 753 single-response turns. The exceptions were 49, 101 and 219 ms, plus one 4.1 s transcript stall on a free 3.1 turn.
- **Audio ahead of text:** up to 0.4-0.9 s (p50) of audio arrives before the text that covers it. This costs buffer memory, not added latency.
- **Not measured:** whether the transcript matches the spoken words exactly, and the violation rate on an attack battery.

## Gemini TTS, paid tier, from the India VM (20 Hinglish lines, voice Despina)

| model | mode | first byte p50 / p90 | real-time factor p50 | ₹ per spoken minute now | from 2027-01-01 |
|---|---|---|---|---|---|
| 3.8-flash-lite-tts | stream (n=40) | 857 / 997 ms | 0.24 | 0.86 | 1.73 |
| 3.8-flash-tts | stream (n=40) | 1,094 / 1,280 ms | 0.36 | 1.29 | 2.58 |
| 3.8-flash-lite-tts | non-stream (n=20) | 3,422 ms | 0.38 | 0.86 | 1.73 |
| 3.8-flash-tts | non-stream (n=19) | 4,257 ms | 0.51 | 1.29 | 2.58 |

- **First audible speech.** The clips start with 0.14-0.36 s of silence, so audible speech begins about 1.0-1.4 s after the request.
- **Style prompts** set the pace and are not read aloud (checked by transcription).
- **Rate limit.** One 429 on the paid key, at about 10-12 requests a minute per model.

## Quality observations (factual; no rating of human-likeness)
- **Tamil.** 3.1 replied in Tamil to the Tamil-English caller 26 of 26 times. 3.8 never did (0 of 36).
- **AI disclosure.** Asked "are you a robot?", 3.1 named itself an AI 38 of 38 times and 3.8 65 of 67 times. No reply claimed to be human; the 21 deny-pattern hits were offers of a human advisor, checked by hand.
- **Unsupported claim.** In the worried-caller scene, both models said claims are covered during the grace period. That is not in the persona's facts, and it is the kind of statement a code gate exists to stop.
- **Not tested:** true barge-in over the agent's audio. One playback gap over 1 s occurred in about 750 turns.

## Predictions this lane bears on

| id | outcome | evidence |
|---|---|---|
| V1a | held | A 3-minute 3.1 call costs ₹4.1-5.1 per minute |
| V1b | held | 10 min ÷ 1 min is 4.35x on 3.1 and 3.84x on 3.8 |
| V1c | failed | 2.50x and 2.71x with a 6,000 trigger. Only the tight trigger meets 1.3x, and it loses the call's memory |
| V3a | failed | The transcript arrives with the first audio on every turn |
| V4a | held for 3.8, failed for 3.1 | But 3.8 talks over callers on about 42% of turns, which fails the V4 kill (more than 5%) |
| V4b | failed | 3.8 ties the cascade at about 1.0 s; 3.1 is slower |

## Spend
- **Gemini paid: $14.88** across 182 ledger lines. Live is $14.09 of that, transcription text about $0.19 (estimated) and TTS $0.21. This is our own list-price calculation, not Google's invoice. No 402 was received.
- **Azure: about ₹13.** One VM in centralindia for about 1.3 h, deleted and verified 404.

## Blocked
- Vertex AI in Mumbai or Delhi (no GCP project).
- A real telephone leg.
- Indian business-hours load.
- Reconciliation against Google's invoice.

## Files
- `harness/`, `results/` (`sessions.csv`, `turns.csv`, `latency_*`, `cost_per_minute*`, `token_growth_per_turn.csv`, `metering_paid_vs_free.csv`, `gate_lag_summary.csv`, `tts_*`, `quality_*`) and `samples/` (4 calls and 8 TTS clips).
- Raw session data is in the scratchpad `research-raw-1018/g5-gemini-paid/`.
