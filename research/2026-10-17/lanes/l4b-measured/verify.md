# l4b-measured: adversarial verification

Verifier pass, 2026-10-17. Scope: the 7 load-bearing claims handed over by the workflow. Method: re-ran the lane's
own aggregation from `data/measurements.csv`, re-derived per-call numbers, re-read the battery audio, read the raw
run files that the lane left in the session scratchpad
(`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/`), and
re-fetched vendor pages on 2026-10-17. The web-search budget for this turn was exhausted before any third-party
latency benchmark could be searched, so no independent external latency figure was compared (see section 9).

## Verdict table

| # | claim (short) | verdict | one-line reason |
|---|---|---|---|
| 1 | 29 vendors; only 5 identity-free browser demos; Indian vendors gated | **weakened** | Sarvam's voice-agents page has an anonymous live web-call widget the lane missed (its own saved HTML contains it); Ravan's widget now shows a name + phone step; 6 vendors were "not reached", not "gated"; Bolna has an ungated dial-in AI line |
| 2 | median latency Ultravox 1,540 / Vapi 2,319 / ElevenLabs 3,749 ms | **weakened** | every number reproduces exactly, but the 90% CIs ignore clustering by call (wider when bootstrapped by call), these are homepage demo agents, not platforms, and all traffic went through an HTTPS proxy and TURN-over-TCP |
| 3 | harness bias at most ~60 ms; barge metric validated | **weakened** | n=14 and the 1,084-1,206 ms range reproduce, but the calibration agent ran locally with no proxy and no WebRTC path, and the barge rule has only a negative control. It was also re-tuned on that same agent |
| 4 | wrong-language replies (Vapi Gujarati/Punjabi; ElevenLabs English) | **weakened** (core confirmed, and strengthened) | Vapi's own transcript stream confirms Gujarati and shows the elderly-caller replies were Punjabi in Gurmukhi script, not "Punjabi-inflected Hindi"; "all 3 earlier test calls" is unsupported (1 of 3 aborted before any caller audio); the ElevenLabs "Hinglish callers" are 1 persona |
| 5 | collisions Vapi 25/72, Ultravox 13/72, ElevenLabs 2/72; 5 of 6 cut-ins at the 1.6 s pause | **weakened** | counts reproduce, but the rendered "1.6 s" pause is **about 2.4 s** of silence; 6 of Vapi's 25 collisions start less than 1.2 s into the caller clip, so they depend on the harness's 1.3 s quiet threshold |
| 6 | barge-in: Ultravox 6/6, ElevenLabs 3/7, Vapi 2/8 | **weakened** | numbers reproduce; 2 of Ultravox's 6 "yields" coincide with a complete short sentence ("Wow, 25,000. That's impressive."), and one ElevenLabs miss is 60 ms over the 1.5 s cut-off |
| 7 | babble broke or degraded all three agents | **weakened** (one sub-claim refuted) | Vapi collided on **4 of 9** turns in each call (8 of 18 across both), not 8 of 9 in one; Ultravox repeated its greeting 7 times, not 8; ElevenLabs' worst latency was 11.3 s, not 8.0 s; noise is confounded with dialect |

No number in claims 2, 5 and 6 looked fabricated: every one reproduces from `measurements.csv` with the lane's own
code. The errors are in claim 7's per-call attributions and in a few unverified details.

---

## 1. Demo inventory (claim 1): weakened

What holds:
- 29 vendor rows in `data/demo-inventory.csv`. Vapi, ElevenLabs Agents and Ultravox demos were demonstrably usable:
  24 recorded calls exist (run JSONs start at 2026-10-17T11:02-11:13Z). Vyora's gating after reuse is documented in
  the lane's probe.
- HuskyVoice: confirmed. `https://www.huskyvoice.ai/live-demo?country=India` says "No signup required" (re-fetched
  today). The lane's screenshot `shots/husky4-0.png` shows the studio page "Talk to FinPayment-Reminder-Demo-Deepika-IN"
  with "Enter your name / email / phone number" before "Start Call".
- Retell: confirmed. Its homepage form is "Get a call" with use case, name and phone number.
- Nurix/NuPlay: confirmed. A phone call-back ("Get the call"), with use case plus phone number.
- Ringg: the homepage has no live demo, only "Sign up". SubVerse: "Get started" / "Talk to sales" / "Book Demo" only.
- Gnani: a call-back form (name + phone), so it is gated, though by a call-back form rather than a sales form.

What breaks:
1. **Sarvam has a live, apparently anonymous browser demo.** `https://www.sarvam.ai/products/voice-agents`
   (re-fetched 2026-10-17) has "Experience a voice agent, live... Pick one and have the conversation yourself",
   with agents Cart Recovery Nudge, EMI Payment Reminder and Appointment Booking, and a button
   `aria-label="Start voice call with Simran"` / "Start Speaking". The component chain is
   `VoiceAgentsLiveExperience` -> `useVoiceAgent` -> `ProxiedVoiceAgent`. It requests the microphone, then calls
   `createProxiedVoiceAgent({config:{user_identifier_type:"custom", user_identifier:`web-demo-${Date.now()}`, org_id, workspace_id, app_id}})`
   through `/api/voice-agents/` to `https://apps.sarvam.ai/api/app-runtime/`. Nothing in the code asks for a login or a
   form. The lane's own saved copy (`research-raw/l4b-measured/sarvam-va.html`, 11:02Z) already contains "Start Speaking"
   and `VoiceAgentsLiveExperience`, yet the inventory records "no live agent demo found". I did not place a call, so
   the widget is "present, untested", but listing Sarvam among vendors that "gate any trial" is wrong.
2. **Ravan.ai is not shown to be identity-free.** The homepage widget reads "Try Agni live, no signup", but its
   `demoLeadOverlay` says "One quick step: Talk to Agni live. Leave your number so Agni can call you back if the
   line drops", with name and phone inputs and "Start the call". The lane's probe (`probe-ravan_hi.log`) clicked "Talk
   to Agni in Hindi" and failed at the LiveKit connection. The page never requested the microphone. So the claim that
   Ravan was "blocked only by our sandbox's lack of UDP" is unverified. The page also lists a dial-in number,
   +91 11 4056 6600, which the inventory does not record (it lists a US number).
3. **"Only 5" counts the unknowns as negatives.** The lane never reached 6 vendors: Smallest.ai, Cartesia, Caller.digital
   and Millis (click not interactable in headless), the Deepgram voice-agent playground (loads without login, not
   run) and Sesame (not run). They are undetermined, not gated.
4. **Bolna is not entirely gated.** Its web "Play Demo" pages do require sign-in ("Import your agent to Bolna"),
   but the homepage section "Talk to Bolna" invites visitors to call an AI agent on +91 22 6953 9260 with no form.
   The lane's own scan JSON captured this number. Vapi likewise offers 1-844-HEY-VAPI.

Corrected statement: of 29 vendors, at least 5 had a live browser demo that started with no identity in our
sandbox or code inspection: Vapi, ElevenLabs Agents, Ultravox, Vyora (until it gated) and Sarvam (widget present,
untested). Ravan's widget now asks for a name and phone number first. Six vendors were undetermined. Most other Indian
vendors (Ringg, Haptik, SubVerse, VoiceGenie, SquadStack, Yellow.ai, Skit.ai, Exotel, Ozonetel) show only sales forms or
sign-up. Gnani uses a call-back form, and Bolna gates its web demos but publishes an ungated dial-in AI line. The
HuskyVoice, Retell and Nurix findings stand.

## 2. Latency (claim 2): weakened

Reproduced exactly from `measurements.csv`: Ultravox p50 1,540.5 (n=52, p90 2,246, p95 2,347); Vapi 2,319
(n=40, p90 3,815, p95 4,235); ElevenLabs 3,749 (n=63, p90 5,197, p95 5,963). The definitions match `score.py`: the
first agent VAD segment of at least 400 ms after the clip end, clean turns only, and a 2,000-resample turn-level
bootstrap with seed 7.

Problems:
- **The CI is too narrow.** Turns are clustered in 8 calls per vendor. A bootstrap by call (4,000 resamples) gives
  Ultravox **1,324-1,737**, Vapi **2,111-2,609** and ElevenLabs **3,473-4,038**. Per-call medians span 1,060-1,817
  (Ultravox), 1,948-3,241 (Vapi) and 3,240-7,112 (ElevenLabs). The ranking survives; the stated precision does not.
- **Conditional on clean turns.** For Vapi, 40 of 72 non-barge turns qualify, because 25 collided and 5 had no
  segment of at least 400 ms. Latency on the turns where the agent behaved is not latency per turn.
- **Demo agents, not platforms, and not the same agent.** Each vendor runs a different homepage agent with its own
  LLM, prompt and turn-end settings. Vapi's demo itself changed mid-study: Vapi's own transcript stream shows "Vapi's
  lead qualification demo" in P1 r2, P2 r1/r2, P3 r1 and P4 r1, but "Vapi's customer support demo" in P3 r2 and P4 r2.
  The brief (H4) asked for the same agent built on each platform; this is not that.
- **Network path.** Every vendor call went through the sandbox's HTTPS proxy. The WebRTC vendors used TURN relay
  candidates (Vapi via a us-east-1 relay at 54.172.60.x to a Daily SFU in `iad`; Ultravox via LiveKit relay
  161.115.x), relayed over TCP. ElevenLabs' own WebSocket `ping_ms` had per-call medians of **235-401 ms**
  (`data/elevenlabs-ws-timing.csv`), far above a typical direct US-East round trip. "US-East" is supported by the
  `iad` SFU and the us-east-1 relay, but the absolute numbers include proxy overhead that neither a US nor an Indian user
  would see.
- Vendor marketing (Vapi: "<500ms average latency") measures the pipeline, not caller-end-to-speech, so it is not a
  refutation. ElevenLabs' slowness is mostly endpointing: its `user_transcript` event arrives a median 2,648 ms after
  the caller audio ends (n=72).

Corrected statement: the homepage demo agents of Ultravox, Vapi and ElevenLabs had median clean-turn reply
latencies of 1,540, 2,319 and 3,749 ms, measured through a proxied, TURN-over-TCP path with US-East egress (8 calls
each). The 90% CIs bootstrapped by call are 1,324-1,737, 2,111-2,609 and 3,473-4,038. These are demo configurations,
not platform capability.

## 3. Calibration (claim 3): weakened

Reproduced: 14 clean turns (calib 8, calib_long 6), range 1,084-1,206 ms, medians 1,126 and 1,159. The rule is 600 ms
of silence plus 500 ms delay plus up to one 20 ms frame, so the expected range is about 1,100-1,120 ms (the lane states
1,100-1,140). The largest deviation is +66 ms over the lane's upper bound, so "about 60 ms" is fair for what was tested.

But:
- `demos.json` marks both calibration demos `noProxy: True`, served from `127.0.0.1`, playing through an
  AudioContext. The calibration exercises neither the proxy, nor TURN-over-TCP, nor WebRTC jitter-buffer playout (Vapi,
  Ultravox), nor ElevenLabs' WebSocket audio player. "The harness adds at most ~60 ms" holds for the in-page capture
  chain only, not for the measured vendor paths.
- Barge-in: the calibration agents never yield (`busy=true` during playback). Three barge events across calib P1, calib
  P4 and calib_long all scored `barge_handled=0`. That is a negative control only; no agent that does yield was
  calibrated. The `score.py` comment also records that the previous rule (a 300 ms gap) scored this same agent as
  yielding at 268 ms, and the rule was changed. The calibration was therefore used to tune the rule, not to validate it
  independently.

Corrected statement: on a local, unproxied AudioContext path, the capture-and-scoring chain reproduced a known reply
rule within -16/+66 ms of the lane's expected 1.10-1.14 s window (n=14). The vendors' proxied WebRTC and WebSocket paths were not calibrated.
The barge rule correctly scored a never-yielding agent as not yielding (3 of 3 events, after being re-tuned on it), but
has no positive control.

## 4. Wrong-language replies (claim 4): weakened, core confirmed and strengthened

Independent check: the lane's raw Daily WebSocket dumps (scratchpad `runs/vapi__*.ws.jsonl`) contain Vapi's own
`transcript` messages (`transcriptType: final`) for 7 of the 8 scored calls; P1 r1's were truncated. They show the
mechanism directly:
- P1 r2 (Hinglish caller): Vapi's ASR rendered the caller in Gujarati script ("હા, હેલો?", "પ્રીમિયમ કિતના આયેગા ઇસ બાર?").
  The LLM replied "હા, બિલકુલ. આપણે ગુજરાતીમાં આગળ વાત કરીએ" ("yes, let's continue in Gujarati") and continued in Gujarati,
  including the AI disclosure "હું વાપી પર બનેલ એઆઈ એજન્ટ છું".
- P4 r1/r2 (elderly Hindi caller): Vapi's ASR rendered the caller in **Gurmukhi**, and the assistant replied in
  **Punjabi** ("ਤੁਸੀਂ ਕਿਸ ਤਰ੍ਹਾਂ ਦੀ ਵਾਇਸ ਏਆਈ ਬਣਾਉਣ ਦੀ ਸੋਚ ਰਹੇ ਹੋ", "ਮੈਂ ... ਖਾਣਾ ਤਾਂ ਨਹੀਂ ਖਾਂਦਾ"). The lane's "Punjabi-inflected
  Hindi" is an artefact of transcribing with hi-IN; pa-IN was not among the 5 LID locales. The replies were Punjabi.
- P2 (Bhojpuri-Hindi): Vapi's ASR also rendered the caller in Gujarati script (and once in Telugu).

Counts reproduce: Vapi P1 is gu-IN on 17 of 18 language-identified turns; ElevenLabs P1 is en-IN on 18 of 20; ElevenLabs
P3 is ta-IN on 20 of 20; Ultravox is hi-IN on 43 turns and P3 en-IN on 20. Corrections:
- "Gujarati also appeared in all 3 earlier P1 test calls" is **not supported** by retained files. `vapi__P1__test2`
  and `vapi__P1__wk1` do show Gujarati ("आपने गुजरातीमा बात करिए", "huii chu ... kevi riti ... kari shakeche"). But
  `vapi__P1__test1` aborted on a missing clip (`ENOENT P1_t07.wav`), recorded 0 turns and has no transcript. Supported
  wording: 2 of 2 completed earlier runs.
- ElevenLabs "Hinglish callers" is one persona (P1, 2 calls). In both calls the agent asked "would you like to
  continue in Hindi or English?". The scripted caller cannot answer, so part of the English-default is the battery's
  non-adaptive script.
- Turn-level LID errors run both ways. Ultravox P1 r1 t06 is Hindi ("नहीं मैं एक आई वौइस् असिस्टेंट हूँ") but labelled
  en-IN; ElevenLabs P4 r2 t01 is English written in Devanagari ("आई कैन स्पीक लाउडर") but labelled hi-IN. Treat counts as
  plus or minus 1-2 turns.
- Ultravox's 43 Hindi turns include 7 identical stuck greetings (P2 r1), so "answered Hindi in Hindi" overstates
  matched conversation.
- Scope: Vapi's homepage demo is an English lead-qualification bot with automatic language detection. This shows the
  demo's language auto-detect failing on Indian speech, not what a Vapi agent with a configured hi-IN transcriber does.

## 5. Turn-taking collisions (claim 5): weakened

Reproduced: Vapi 25 of 72 (34.7%), Ultravox 13 of 72 (18.1%) and ElevenLabs 2 of 72 (2.8%) non-barge, non-silence
turns. On the pause turn, 5 of 6 calls collided (Vapi 2/2, Ultravox 2/2, ElevenLabs 1/2).

Problems:
- **The pause is not 1.6 s.** An energy VAD on `battery/audio/P4_t03.wav` (10 ms frames, thresholds from -70 to
  -40 dBFS) finds one silence from **1.34 s to 3.75 s, about 2.4 s**: the SSML 1,600 ms break plus the pause Azure TTS
  inserts at "…". The agents began speaking 2.89-4.66 s into the clip; Ultravox did so about 1.5 s into the silence.
  Cutting in after 2.4 s of silence is a much weaker failure than cutting in at 1.6 s, because many humans would also
  take the turn.
- 6 of Vapi's 25 collisions have the agent onset 0.49-1.13 s after the caller clip starts (P2 t09 ×2, P4 t06 ×2,
  P4 t10, P3 t11). That is too early to be a reaction to the caller. These are the agent resuming its own reply after a
  pause of more than 1.3 s, which is the harness's `QUIET_MS`. The collision is real from the caller's side, but the
  count depends on that parameter.
- Callers are Azure neural TTS voices, not human speech.

Corrected statement: collisions (agent onset during the caller clip, or agent still talking at clip end) occurred on
25 of 72 (Vapi), 13 of 72 (Ultravox) and 2 of 72 (ElevenLabs) caller turns. Six of Vapi's 25 were the agent resuming its
own reply after more than 1.3 s of quiet. At the elderly caller's mid-sentence pause, rendered as about 2.4 s of silence
(scripted as 1.6 s), the agent started speaking before she finished on 5 of 6 calls.

## 6. Barge-in (claim 6): weakened

Reproduced. Ultravox handled 6 of 6 applied barges, with stops of 320, 449, 547, 561, 561 and 588 ms. ElevenLabs
handled 3 of 7 (stops 1,096-2,257 ms). Vapi handled 2 of 8 (stops 1,120-4,983 ms; over-talk up to 2.42 s).

Problems:
- The agent speech the barge interrupted was cut mid-sentence on 4 of Ultravox's 6 (for example "मुझे खुशी है कि आप
  प्रीमियम के बारे"). On P3 r1 and P3 r2 it was the complete sentence "Wow, 25,000. That's impressive.", so a yield cannot
  be told apart from a natural end of turn. Clear yields: **4 of 6, with 2 ambiguous**.
- Threshold sensitivity: ElevenLabs P4 r1 stopped at 1,560 ms with 0.04 s over-talk, and fails only because the cut-off
  is 1.5 s. At 1.6 s, ElevenLabs would be 4 of 7.
- The rule has no positive control (see section 3), and the wording "quiet for at least 1.0 s within 1.5 s" is the
  `score.py` condition `stop - c0 <= 1.5` (the start of a quiet stretch of at least 1.0 s) plus over-talk after 1.5 s of
  at most 0.5 s.

## 7. Babble noise (claim 7): weakened, with one sub-claim refuted

Per call, from `measurements.csv`:
- **Vapi: refuted as stated.** P2 r1 has 4 collisions in 9 non-barge turns (5 of 10 including the barge); P2 r2 has
  4 of 9. The "8" is the two-call total (8 of 18). That 44% rate is not clearly worse than Vapi's other personas (P1 22%,
  P3 11%, P4 61%). Vapi's own transcript shows its ASR writing the Bhojpuri caller in Gujarati script, which is a
  language-ID problem at least as much as a noise problem.
- **Ultravox:** in **both** calls the first 3 caller turns got no reply. In r1, every later reply was the identical
  greeting, **7 times** (agent STT shows "नमस्ते ... आपका नाम क्या है" at 88.7-160.2 s), not 8. In r2, 4 of 10 turns got no
  reply (t01-t03 and t05). Directionally confirmed.
- **ElevenLabs:** the P2 median of 4,621 ms (n=11) reproduces. The worst latency across those 11 turns is
  **11,291 ms** (r2 t02); 8,015 ms is the worst in r1 only. In r2 the WebSocket opened at 31.6 s and closed at 69.3 s on
  the harness clock (about 37.7 s), with 3 `agent_response` and 2 `user_transcript` events and no end event. The harness
  abort came later, at 165 s. "Closed by the server" is inferred: no close code was captured.
- **Confounding:** P2 is the only persona with babble and the only Bhojpuri persona. No clean-audio P2 and no noisy P1
  were run, so the failures cannot be attributed to noise rather than dialect. The noise is synthetic (TTS-persona babble
  plus pink noise, 15.1 dB SNR per `battery.json`), and n=2 calls per vendor.

Corrected statement: on the Bhojpuri-Hindi persona under synthetic market babble (15 dB SNR, 2 calls per vendor),
Ultravox ignored the first 3 turns of both calls, then answered every turn of one call with its greeting (7×) and
missed 4 of 10 turns in the other. ElevenLabs' median latency was 4.6 s (worst 11.3 s) and one session's WebSocket
closed about 38 s after opening without an end event. Vapi collided on 4 of 9 turns in each call, similar to its other
personas. Dialect and noise are confounded.

## 8. Lane-quality notes

- **The H4 design was not met.** The brief asks for the same agent built on Bolna, Vapi, Retell, ElevenLabs, Sarvam,
  Smallest, Ringg, Ravan, Gnani and Synthflow, with WER and invoice cost. The lane measured three US vendors' homepage
  demo agents, each with a different configuration, and no Indian vendor end to end. The runbook defers the rest to the
  owner. Any "incumbents fail Indian buyers" conclusion currently rests on Vapi, ElevenLabs and Ultravox demos alone.
- **Sarvam's live demo was missed**, even though the lane saved the HTML that contains it. It is the most relevant
  Indian target that could have gone through the harness without owner action.
- **Provenance risk.** The strongest evidence for claim 4 (Vapi's own ASR and LLM transcripts in the WebSocket dumps),
  the earlier Vapi test runs, and all raw WAVs and probe logs live only in the ephemeral session scratchpad, not in the
  lane folder. Copy `runs/vapi__*.ws.jsonl`, `runs/vapi__P1__test2.*`, `runs/vapi__P1__wk1.*` and `sarvam-va.html` into
  the lane before the container is recycled.
- The battery's "1.6 s" pause renders as about 2.4 s. The rendered audio was not measured against the script.
- The scenario mismatch (insurance-renewal caller against voice-AI sales demos) makes the content checks (regex
  pass rates) largely meaningless as quality signals. The lane mostly does not lean on them, which is right.
- Per-persona results (n=2 calls) are anecdotes. Only the vendor-level pooled numbers carry any statistical weight,
  and even those need call-level CIs.
- Latency is from a proxied US-East sandbox, not an Indian vantage. ElevenLabs' WebSocket ping of 235-401 ms shows the
  path is not representative.
- No sign of fabricated numbers. Claims 2, 5 and 6 match the data to the millisecond. Claim 7 has three attribution or
  arithmetic slips (8/9 vs 4/9, 8 vs 7 greetings, worst 8.0 vs 11.3 s), and claim 4 has one unsupported detail ("all 3
  earlier test calls").

## 9. What could not be checked

- Independent third-party latency benchmarks for Vapi, ElevenLabs Agents and Ultravox: the web-search budget for this
  turn was exhausted before the search ran, so external refutation of the absolute latencies was not attempted. Vendor
  pages were fetched directly. Vapi claims "<500ms average latency"; Ultravox and ElevenLabs give no numeric figure.
- Whether Sarvam's and Ravan's widgets actually connect without identity was not tested end to end, because no calls
  were placed.

## Sources re-opened (2026-10-17)

- https://www.huskyvoice.ai/live-demo?country=India ("No signup required"); lane screenshot `shots/husky4-0.png`
- https://www.retellai.com ("Get a call": name + phone)
- https://www.nuplay.ai/voice-ai-agents/demo ("Get the call": phone)
- https://www.sarvam.ai/products/voice-agents and its modules `/_astro/VoiceAgentsLiveExperience.DUk_U57w.js`,
  `/_astro/useVoiceAgent.CaLnDqrV.js`, `/_astro/ProxiedVoiceAgent.knvy8M56.js`
- https://ravan.ai (`demoLeadOverlay`, dial-in +91 11 4056 6600)
- https://www.bolna.ai ("Talk to Bolna", +91 22 6953 9260) and https://www.bolna.ai/a/88bb2f3c-cfc0-4f3d-b0a2-6ac962ba9737 (sign-in)
- https://www.ringg.ai, https://subverseai.com, https://www.gnani.ai, https://smallest.ai, https://vyora.ai
- https://vapi.ai ("Start call", "<500ms average latency", 1-844-HEY-VAPI), https://www.ultravox.ai, https://elevenlabs.io/conversational-ai
- Lane data: `data/measurements.csv`, `data/summary-by-vendor*.csv`, `data/calibration*.csv`, `data/manual-codes.csv`,
  `data/elevenlabs-ws-timing.csv`, `data/agent-stt/*.json`, `battery/battery.json`, `battery/audio/P4_t03.wav`,
  `harness/score.py`, `harness/analyze.py`, `harness/vp_harness.mjs`, `harness/calib.html`, `harness/demos.json`
- Scratchpad raw runs: `research-raw/l4b-measured/runs/*.json|*.ws.jsonl`, `probe-ravan_hi.log`, `sarvam-va.html`,
  `scan/scan-*.json`, `test1-vapi.log`
