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
