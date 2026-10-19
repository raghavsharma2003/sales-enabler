# Prediction register: voice-stack pricing and latency (written before any measurement, 2026-10-18)

Single-claim predictions, each scored 0 or 1 afterwards (the lesson from the 2026-10-17 register). Priors are the
researcher's confidence.

| id | prediction | prior |
|---|---|---|
| V1a | At paid list price, a 3-minute Gemini Live (3.1 flash live) call costs more than ₹1.3 per minute of AI cost. | 0.65 |
| V1b | Gemini Live cost per minute rises with call length: a 10-minute call costs at least 1.5x per minute what a 1-minute call costs, without context compression. | 0.70 |
| V1c | With context-window compression on, the 10-minute per-minute cost is within 1.3x of the 1-minute cost. | 0.55 |
| V2a | The cheapest Gemini path (Live or a flash-lite cascade with Gemini TTS) fits an AI budget of ₹1.0 per minute at 3-minute calls. | 0.55 |
| V4a | From a Central India VM, Gemini Live first-audio latency after caller end-of-speech has a p50 at or below 1.2 s. | 0.50 |
| V4b | Gemini Live's p50 first-audio latency is lower than our round-2 Azure cascade's 1.0 s. | 0.35 |
| V3a | Gemini Live's output transcript for a turn arrives after that turn's first audio chunk on most turns, so a text gate cannot stop the first words. | 0.75 |
| V5a | At least one non-Gemini stack measured or priced here costs less AI per minute than Gemini Live at equal call length. | 0.70 |
| V7a | Gemini's Live and TTS models used here are preview or recently released, with no published deprecation-free guarantee beyond 12 months. | 0.70 |

## Scored (synthesis lane, 2026-10-19)

The table above is unchanged. Each prediction is scored 0 or 1 against the lane files. g5 (paid key) is the primary
source for Gemini paid-tier cost and latency, g2 for free-tier measurements, g3 for cascades, and each lane's
`verify.md` corrections take precedence over the lane's own text. "India VM" means a Central India Azure VM with no
telephone leg; "sandbox" means US-East via the egress proxy.

| id | score | outcome | evidence (file) |
|---|---|---|---|
| V1a | 1 | held | 3-minute 3.1 flash live calls on the paid key cost ₹4.33 and ₹5.08 a minute with compression off and ₹4.14-4.24 with it on (4 calls, sandbox; `lanes/g5-gemini-paid/results/cost_per_minute.csv`). The free-key meter gives ₹3.48-3.84 (`lanes/g2-gemini-live-measured/results/cost_by_length.csv`). Every figure is above ₹1.3. |
| V1b | 1 | held | 10-minute ÷ 1-minute cost per minute with compression off: 4.35x on 3.1 and 3.84x on 3.8 (g5 `cost_per_minute_summary.csv`, 1-2 calls per cell). g2 measured 3.0x and 4.1x. |
| V1c | 0 | failed | With compression on (trigger 6,000 / target 3,000) the ratio is 2.50x on 3.1 and 2.71x on 3.8 (g5). Compression fires late, at 8.2-9.9k tokens (`lanes/g1-gemini-desk/verify.md` #3, `lanes/g2-gemini-live-measured/verify.md` #3). Only a tight 2,500/1,500 window reaches 1.14x and 1.11x, and it keeps just 17-27 s of audio, so the agent forgets the call. Meera's `slidingWindow:{}` default (~104.9k tokens) never fires in a normal call. |
| V2a | 0 | failed | The cheapest Gemini Live call on the paid meter at 3 minutes is 3.1 at ₹4.19-4.71 (it retires 2026-11-17), and 3.8 costs ₹5.72 (g5). The flash-lite cascade with Gemini TTS (G-A) costs ₹1.56 a minute at 2026 prices and ₹1.92 at 2027 prices (`model/results/deterministic_by_stack_length.csv`, matching `lanes/g3-cascade-measured/results/rederived_cost_per_min.csv`). Only unmeasured levers (gated STT plus at least 90% cache hits) bring it to ₹0.87, and only until 2026-12-31 (g3 `cost_levers.csv`). 2.5 native audio meters at ₹1.72, but ₹3.6 under the documented billing rule, and it is closed to new users. |
| V4a | 1 | held (3.8 only) | From the India VM on the paid key, 3.8 Live's p50 is 1,006 ms (CI 950-1,253, n=30 turns, 6 calls; g5 `latency_summary.csv`). With thinkingBudget:0 on the free key it is 819 ms (CI 784-847; g2 `latency_summary.csv`). Meera's model, 3.1, is at 1,950 ms and fails. The CI's upper bound crosses 1.2 s. 3.8 also talks over the caller on 42% of turns, which fails V4's cut-in clause even though this latency clause held. |
| V4b | 0 | failed | On the paid key, 3.8 Live (1,006 ms) ties the round-2 cascade (1,004 ms, SYNTHESIS-v2 §5) and g3's re-measured C1 (1,026 ms, CI 1,017-1,035), and the CIs overlap. The only faster configuration is 3.8 with thinkingBudget:0 (819 ms, free key, g2), which starts talking before the caller finishes on 52% of spoken turns. 3.1 is about 2x slower. g2 scored this held on the 819 ms figure. This scoring treats a tie as not lower and does not count speed won by interrupting the caller. |
| V3a | 0 | failed | The transcript arrived at or before the first audio chunk on 1,041 of 1,041 turns (g5 `gate_lag_summary.csv`) and on 892 of 892 responses (g2). A 0 ms hold covered 749 of 753 single-response turns. A text gate can therefore check the first clause before it plays. The violation rate on an attack battery was not measured. |
| V5a | 1 | held | At 3 minutes, all-Azure C1 costs ₹2.19, C6g ₹0.94 and Sarvam/Inworld (desk) ₹1.04/₹0.53, against Gemini Live at ₹4.19-5.72 (`model/results/deterministic_by_stack_length.csv`; g3; g4; g5). |
| V7a | 1 | held | gemini-3.1-flash-live-preview and gemini-3.1-flash-tts-preview have an earliest shutdown of 2026-11-17. gemini-3.8-live went GA on 2026-09-15, and its Agent Platform retirement is "2027-09-25 or later", about 11 months away. The 3.8 TTS models are GA on the Gemini API (2026-09-22) but Preview on the Agent Platform (`lanes/g1-gemini-desk/verify.md` #6, #7). |

**Tally.** 5 of 9 held. The Brier score is 0.215, against 0.25 for answering 0.5 on every prediction. The mean prior was
0.60 against a hit rate of 0.56.

**Biggest miss: V3a (prior 0.75).** We expected realtime speech-to-speech to be ungateable, which is law 25 from round 1.
Measured, the transcript arrives with the first audio, so a pre-speech text gate is feasible on Gemini Live. What still
rules Live out of the base tier is cost, talk-over and residency, not gate lag.
