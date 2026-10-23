# Product-runtime reply gap, India VM (2026-10-23, 20:00–21:31 UTC)

**What was measured.** The PRODUCT voice runtime (`product/voice`, staging copy at 46dbbe7), not the lab's. Each call
was placed through the product: sign-in to the staging control plane, `test.browser_call` on an agent made from the
`insurance-renewal` template with the stack set by `stack.set` (never dials a phone), then the runtime's browser media
socket. A headless caller on the VM (`ops/tools/replygap.py`) played synthetic caller clips from the 2026-10-18 battery
(`audio_phone16k`, personas P1 urban Hinglish and P4 elderly slow Hindi, six caller turns per call) in real time at
16 kHz, with silence in between, and simulated playback of her audio before speaking again. Calls ran one at a time.

**The number.** Reply gap = caller end of speech (the runtime's VAD) to the first agent audio frame sent, as the
runtime itself computes it (`reply.latencyMs` on the socket; the same value lands in the control plane's
`turn.latency`). Openings have no gap and are excluded. Median 95% CI: bootstrap, 10,000 resamples, seed 20261023.
Per-reply rows: `reply-gap.csv`. Cost per minute: the control plane's cost lines for those calls ÷ their duration.

**Vertex pacing.** Every Vertex request started at least 1.0 s after the previous one (`ops/tools/pace.py`); measured
minimum spacing over all 379 Vertex request starts: 1.000 s. The pacer delayed 19 starts, all on v2-flashlite, at most
336 ms. On v2-flashlite the first voice request often started exactly 1.0 s after the brain request, so the pacer sat
on the critical path there: the `gap_minus_pacing_ms` column subtracts the pacing wait inside each gap (an estimate; the
wait is an upper bound on what pacing cost that reply).

## Results (run r2: the headless caller as fixed after run r1)

| Stack | n replies (calls) | p50 | p90 | min | max | Median 95% CI | p50 less pacing | ₹/min (cost lines) | Errors | "AI" in first reply |
|---|---|---|---|---|---|---|---|---|---|---|
| v2-flashlite (default) | 21 (4) | 2,464 ms | 2,715 ms | 653 | 2,910 | 2,329–2,593 | 2,421 ms | 1.26 | 0 | 4/4 calls |
| v2-mai | 24 (5) | 2,213 ms | 2,744 ms | 590 | 4,146 | 1,978–2,382 | 2,213 ms (not paced) | 1.56 | 0 call errors; 2 event batches lost (below) | 5/5 |
| v2-54mini | 23 (4) | 3,009 ms | 3,558 ms | 1,577 | 6,833 | 2,763–3,128 | 3,009 ms (not paced) | 1.31 | 0 | 4/4 |
| v2-38flash | **7 (8)** | 6,613 ms | 15,370 ms | 2,927 | 24,934 | 4,148–8,994 | same | n/a | **8/8 calls ended in error** | 5/8 (3 calls never spoke) |

The fast replies near 0.6–0.8 s are door replacements with no brain call (the honest reply to "are you AI?").

Where the time goes (medians from the passive Vertex timing, r2): on v2-flashlite the brain request starts 598 ms after
end of speech (ears final + turn-taking), its first streamed data arrives 905 ms later, the first voice request starts
1,666 ms after end of speech, and the voice's first data takes 731 ms. On v2-mai the brain is the same (start 603 ms,
first data 1,108 ms) and the voice is Azure MAI. On v2-54mini the brain is Azure, and the first voice request starts
2,229 ms after end of speech (voice first data 715 ms).

## What broke or needs a decision

1. **v2-38flash does not work from India today.** All 8 calls ended in error, `SocketTimeoutError` (the runtime's
   30 s read timeout on the brain stream); 3 of the second batch's 4 calls failed on the opening itself. Answered
   brain requests took 1.2 to 23 s to first data. Two direct streaming requests to the same model on Vertex global
   (the runtime's request shape, thinking level low, 60 s timeout, 21:33 UTC) got no response headers within 60 s. So
   the failure is on the Vertex side for this model and project at this hour, not the product runtime or the pacer
   (0 pacing waits on this stack). n = 7 replies is below the 20 asked for; more calls would only have repeated the
   failure. Not verified: whether it is regional capacity, quota, or the model itself, and whether the lab's own
   38flash preset fails the same way now (not re-run, to spare Vertex traffic).
2. **Every opening speaks an English instruction fragment.** The templates set `opening.disclosureClause` to
   `that you are its AI assistant, mentioned in passing` (`server/modules/agents/templates.ts`, `AI_PASSING`), and the
   runtime's RD1 prefixes that clause verbatim when the first sentence lacks an AI affirmation. In r2, 17 of the 18
   calls that spoke began "that you are its AI assistant, mentioned in passing, नमस्ते, मैं रिया हूँ — सुरक्षा हेल्थ
   की AI असिस्टेंट…": the instruction is read aloud, and on the Gemini-brain stacks the brain's own disclosure follows
   it in the same breath. (It also happened in the three r1 transcripts read.) So "AI" was said in the first reply of
   every call that spoke, but mostly through this bug. One v2-54mini call disclosed naturally ("Riya, Suraksha Health
   ki AI assistant bol rahi hoon"). Fix belongs to the templates/brief compiler and the RD1 lexicon, not to ops.
3. **Runtime event batches rejected by the control plane (422).** On v2-mai, 2 batches of 4 events (one agent turn plus
   other events each) were dropped after retries, so the call record lacks those turns (the turn table has 22 of 24
   gaps). The likely cause, inferred and not proven: the runtime accepts a `[tone: …]` note of up to 80 characters
   (`brief.py` `TONE`), and ingest allows `tone` up to 50 (`calls/ingest.ts`); stored tones max out at 44 characters.
   The same mismatch would explain the one missing turn in the Azure-only dry run.
4. **Test calls have no contact name.** `test.browser_call` sends `displayName: ''`, and the brief asks for the person
   by name, so she says "क्या मैं ___ से बात कर रही हूँ?" with a hole (seen on v2-54mini and v2-38flash).
5. **Slow elderly Hindi loses words in the ears.** In r1, P4 segments such as "पच्चीस हज़ार… नहीं नहीं, चौबीस हज़ार
   पाँच सौ भरे थे" produced no new caller text (the caller turn repeated the earlier text four times). Seen in one call's
   transcript; not measured.

## Run r1 (superseded, kept for the record)

The first v2-flashlite batch (20:00–20:10 UTC, before the passive Vertex timing): n = 22, p50 3,042 ms, p90 9,377 ms,
max 15,380 ms, median CI 2,796–5,313 ms, ₹1.05/min. Four of its replies took 7–15 s because the brain's first sentence
arrived late (the first voice request started 7–15 s after the brain request); two openings started 15–18 s after the
call was placed for the same reason. The caller's fixed 25 s wait for the opening then talked over two late openings,
which changed those conversations, so the caller was fixed (wait up to 60 s for the opening; 45 s after each clip) and
the stack re-run as r2. In r2 no v2-flashlite reply exceeded 2.9 s. Whether r1's stalls were a Vertex-side spike in that
window is not verified. Rows for r1 are in `reply-gap.csv` with `run = r1`.

## Spend for this job (metered)

Reply-gap calls ₹50.83 (control plane cost lines: v2-flashlite r1 9.59, r2 9.04; v2-mai 14.60; v2-54mini 11.15;
v2-38flash 6.45), the Azure-only dry run ₹3.23, the judge evals ₹25.39. Total ₹79.45 metered against the ₹1,500 cap.
Not metered: 5 direct probe requests and the judge requests that timed out (152); an estimate of at most ₹5. No new
Azure resource; the NSG rule is free.
