<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l4b-measured: competitors measured, not read about (H4, measured side)

Date: 2026-10-17. Lane folder: `/home/user/sales-enabler/research/2026-10-17/lanes/l4b-measured/`.

Azure spend: about INR 186 actual (cap INR 500).
- Fast transcription: 5.79 audio-hours, USD 2.09.
- TTS: 1,667 characters, USD 0.03.
- Rate: INR 88/USD.

Every number below was measured by us in this session from a cloud sandbox in Columbus, Ohio, US, through an HTTPS proxy. No sign-up, no identity form, no phone call and no payment was used.

## 1. Answer to the hypothesis

H4 holds for the three incumbents we could reach without a sign-up: Vapi, ElevenLabs Agents and Ultravox. Each failed our battery, in ways that differ by vendor and are measurable. The failures sit in conversation mechanics more than raw speed:
- language choice
- turn-taking
- backchannels
- robustness to background speech
- reply length

| | Ultravox | Vapi | ElevenLabs Agents |
|---|---|---|---|
| clean-turn latency p50 (90% CI), n | **1.54 s** (1.36-1.68), 52 | 2.32 s (2.12-2.50), 40 | 3.75 s (3.63-3.84), 63 |
| latency p90 / p95 | 2.25 / 2.35 s | 3.82 / 4.24 s | 5.20 / 5.96 s |
| collisions (agent talks over the caller), of 72 caller turns | 13 (18%) | **25 (35%)** | **2 (3%)** |
| no reply | 7 (all under babble) | 2 | 3 (one session dropped) |
| barge-in handled / applied | **6/6** (stop 0.32-0.59 s) | 2/8 (1.1-5.0 s) | 3/7 (1.1-2.3 s) |
| cut in during the elderly caller's 1.6 s pause | 2/2 calls | 2/2 | 1/2 |
| words per turn: median, share > 40 | 19, 7% | 14, 21% | 27, 24% |
| reply language, Hinglish caller (P1) | Hindi 18/20 turns | **Gujarati 17/18** | **English 18/20** |
| reply language, elderly Hindi caller (P4) | Hindi 12/14 | Punjabi-inflected Hindi (2/2 calls) | English in 1 of 2 calls |
| reply language, Tamil-English caller (P3) | English 20/20 | English, or Tanglish | **Tamil 20/20** |
| market babble at ~15 dB SNR (P2) | looped greeting x8; 4/10 no reply | collided 8/9 turns (r1) | p50 4.6 s, worst 8.0 s; 1 session dropped |
| AI disclosure when asked | 4 clear, 1 incidental, 2 hedged, 1 unanswered | 1 clear, 3 hedged, 4 talked over | 7/7 clear |

Kill condition: not triggered, because no incumbent passed the battery. Two caveats:
1. These are the vendors' own demo agents and prompts, not our spec on their platforms. Vapi's Gujarati and ElevenLabs' English default may be configuration artefacts.
2. The Indian specialists were unreachable without sign-ups.

The runbook makes the proper kill test (Mode B) a 1.5-hour job per platform.

## 2. Prediction check against predictions.md

H4 prediction, prior 0.60: "p50 >= 1.0 s on Hinglish; mishandle short answers and interruptions; no dialect-matched voices beyond major languages; US platforms $0.07-0.15/min, Indian INR 3-8/min."

- **Latency >= 1.0 s: supported.** The P1 p50 was 1.46 s (Ultravox), 2.19 s (Vapi) and 3.75 s (ElevenLabs). No vendor was under 1.0 s on any persona.
- **Short answers mishandled: mostly supported.**
  - ElevenLabs answered "hmm"/"haan" with "Are you still there?" or "testing the connection?" in 4 of 16 short turns.
  - Vapi and Ultravox gave no reply or collided on 7 of 16 each.
  - ElevenLabs' short-answer median latency (4.19 s) was higher than on other turns (3.74 s).
- **Interruptions mishandled: mixed.** Ultravox's barge-in was excellent (6/6, under 0.6 s). ElevenLabs managed 3/7 and Vapi 2/8.
- **No dialect matching: supported as observed.** No demo replied in Bhojpuri, and Vapi mis-identified Hindi as Gujarati or Punjabi. Whether any platform can be configured for dialect is untestable without sign-ups.
- **Prices: not measured here.** The l4a lane holds list prices. Pages read here:
  - Ultravox: $0.05/min after 30 free minutes.
  - Vyora: 15 credits per minute, so INR 7.05/min on Builder and INR 6.47/min on Business (derived).
  - None of these is an invoice.
- **Overall: mixed.** The prediction under-weighted the actual failure modes: wrong-language replies, collisions at natural pauses, and collapse under background speech.

## 3. What was built

### 3.1 Caller battery (`battery/`)

Four personas, 11 turns each (10 spoken plus a 5-second silence), rendered with Azure neural TTS on vp-research-ai-sea (southeastasia).

| persona | voice | traps |
|---|---|---|
| P1 Neha, urban Hinglish | hi-IN-KavyaNeural | "hmm", "ok"; 25k premium; barge-in on a "one point five lakh" claim limit; "aap robot ho? AI ho?"; 5 s silence; "kal saadhe teen baje"; Delhi AQI (off-topic); WhatsApp request at 5 dB SNR traffic noise |
| P2 Ramesh, Bhojpuri-Hindi | hi-IN-MadhurNeural over a whole-call market-babble bed at ~15 dB SNR | "hँ", "theek ba"; father aged "sattar baris"; barge-in on "dedh lakh"; "pachees hajar"; "rauaa masin hain ki aadmi?"; "parson saadhe teen baje"; Siwan rain |
| P3 Karthik, Tamil-English | ta-IN-ValluvarNeural | "Ok", "mmm"; "twenty five thousand"; barge-in about adding his mother; "one point five lakh"; "Are you a robot? AI-ya real person-a?"; "naalaikku moonarai mani"; CSK playoffs |
| P4 Shanti Devi, elderly Hindi | hi-IN-AartiNeural at -28% rate | "haan", "hmm"; 1.6 s mid-sentence pause; "25,000, no, 24,500" self-correction; barge-in "beta ruko, dheere bolo"; "tum machine ho kya?"; "Somvar saadhe teen baje"; "khana kha liya?" |

Battery limits:
- The voices are synthetic.
- Bhojpuri is lexical and grammatical only; the accent is a standard Hindi TTS voice.
- The noise is synthetic: babble built from the other personas plus pink noise, and brown-noise traffic with horn bursts.

Intelligibility check: Azure recovered 44/46 key terms from the clean clips, and so did Gnani.

### 3.2 Harness (`harness/vp_harness.mjs`, `vp_init.js`)

Playwright Chromium with an init script that does four things:
- **Microphone.** It overrides `getUserMedia` so the page's microphone is a MediaStream from our AudioContext.
- **Agent audio taps.** It taps every route the agent's audio can take:
  - `RTCPeerConnection` track events
  - page AudioContexts connected to their destination
  - media-element `play()` calls, `srcObject` setters and autoplay
- **Recording.** An AudioWorklet records a 16 kHz stereo file: left channel = caller as fed to the page, right channel = agent as sent to the speaker. Every WebSocket frame is logged too, which captures vendor transcripts where a demo exposes them.
- **Turn driving.** A live energy VAD on the agent channel plays:
  - the next clip after 1.3 s of agent silence
  - a barge-in clip 1.5 s or more into a reply, at a moment the agent is audibly speaking
  - nothing for 5 s on a silence turn.

Scoring is offline in `score.py`:
- Clips are aligned by cross-correlation (r = 0.99).
- The agent channel is segmented by energy VAD.
- The agent channel is transcribed by Azure fast transcription: one pass per locale plus a five-locale language-ID pass.
- Vendor ASR text is extracted from the WebSocket logs.

Definitions:
- **Latency:** caller end to the first agent speech of at least 400 ms, on **clean** turns only. A clean turn is one where the agent was silent while the caller spoke and replied at least 250 ms after she stopped.
- **Collision:** the agent spoke during the caller's clip, or was still speaking at its end, or "replied" in under 250 ms (a continuation of its own earlier turn).
- **Barge-in handled:** the agent went quiet for at least 1 s within 1.5 s of the interruption, with no more than 0.5 s of over-talk.

### 3.3 Instrument validation

- **Latency bias.** A local calibration agent (`calib.html`) has a known reply rule: 600 ms of silence plus 500 ms, so 1,100-1,140 ms is expected. It measured 1,084-1,206 ms (n=14). Bias is within about 60 ms.
- **Barge-in metric.** A calibration agent that never yields scored barge_handled = 0 in both its calls. An earlier "first 300 ms gap" rule had been fooled by sentence pauses (268 ms), and was replaced.
- **Bugs fixed during the session.** Runs recorded before each fix were discarded or resampled.
  1. Four browsers in parallel garbled the audio, so calls now run one at a time.
  2. A main-thread ScriptProcessor dropped audio when page JavaScript was busy, so recording moved to an AudioWorklet.
  3. The downsampler drifted to 15,984 Hz; it was fixed, and older files are resampled by 1024/1023.
- **Vantage.** Egress is Columbus, Ohio (Google Cloud, AS396982). HTTPS round trips through the proxy took 76-430 ms. ElevenLabs' own ping was 235-401 ms. WebRTC ran over TURN-over-TCP through the proxy. India-vantage latency was not measured.

## 4. Which demos could be measured without a sign-up

Full table: `data/demo-inventory.csv` (29 vendors).

- **Measured end to end (8 calls each):**
  - Vapi: Daily WebRTC; an English "lead qualification" demo agent.
  - ElevenLabs Agents: a WebSocket to api.elevenlabs.io/v1/convai, after a click-through terms dialog (18+, consent to recording).
  - Ultravox: LiveKit Cloud WebRTC. Its homepage banner says it was acquired by Inworld.
- **Partial:** Vyora. Its demo is Google Gemini Live over a WebSocket. We got one clean turn (2,339 ms; server first audio at 2.06 s). After 2 anonymous sessions it demands a name plus a WhatsApp OTP.
- **Gnani:** no agent demo, but a public STT playground at gnani.ai/speech-to-text-api, measured as ASR only.
- **Reachable but blocked here:** Ravan.ai Agni Hindi. Its LiveKit server offers STUN only and the sandbox has no UDP. The owner can run it on a normal network.
- **Gated:**
  - HuskyVoice: an identity form despite its "No signup required" label.
  - Retell and Nurix: phone call-back forms.
  - Bland: Turnstile.
  - Hume: a contact form.
  - Smallest, Cartesia, Millis, Caller.digital: the button would not start in headless Chromium.
- **No public demo:** Bolna, Ringg, Sarvam Samvaad, Haptik, SubVerse, VoiceGenie, Yellow.ai, Skit.ai, Exotel, Ozonetel, SquadStack and Synthflow (recorded samples only).

## 5. Evidence

| claim | source | date | method | confidence |
|---|---|---|---|---|
| Only 5 of 29 vendors have a no-identity live browser demo; most Indian vendors gate theirs | data/demo-inventory.csv; vendor homepages | 2026-10-17 | measured | high |
| Clean-turn latency p50: Ultravox 1.54 s, Vapi 2.32 s, ElevenLabs 3.75 s (n 52 / 40 / 63) | data/measurements.csv, summary-by-vendor.csv | 2026-10-17 | measured | high |
| Harness bias within ~60 ms; barge-in metric validated | data/calibration.csv | 2026-10-17 | measured | high |
| Vapi answered Hinglish in Gujarati (17/18 turns), elderly Hindi in Punjabi-inflected Hindi; ElevenLabs answered Hindi callers in English; Tamil in Tamil | measurements.csv (agent_lang), manual-codes.csv, transcripts.md | 2026-10-17 | measured (machine language ID plus manual reading) | medium |
| Collisions: Vapi 35%, Ultravox 18%, ElevenLabs 3%; elderly-pause cut-in 5/6 calls | measurements.csv | 2026-10-17 | measured | high |
| Barge-in handled: Ultravox 6/6, ElevenLabs 3/7, Vapi 2/8 | measurements.csv | 2026-10-17 | measured | medium |
| Babble at ~15 dB SNR broke or degraded all three agents | manual-codes.csv, summary-by-vendor-persona.csv | 2026-10-17 | measured (synthetic noise, n=2 per vendor) | medium |
| ElevenLabs end-of-turn takes ~2.65 s p50; LLM and TTS add ~0.4 s | data/elevenlabs-ws-timing.csv | 2026-10-17 | measured | high |
| ElevenLabs ASR caught 39/46 key terms; its failures are downstream | data/stt-keyterms.csv | 2026-10-17 | measured | medium |
| Gnani STT 44/46 = Azure 44/46 on clean clips; both invent digits | data/stt-gnani-playground.json, stt-keyterms.csv | 2026-10-17 | measured | high |
| Words per turn: medians 14 / 19 / 27; 21% / 7% / 24% over 40 words; register target 20.5 | measurements.csv; docs/harvest/hp-main.md | 2026-10-17 | measured | medium |
| Nobody denied being AI; disclosure quality varies | manual-codes.csv | 2026-10-17 | measured | medium |
| Vyora runs on Gemini Live; ~INR 6.5-7.1/min derived from its credit price | WebSocket capture; https://vyora.ai/pricing | 2026-10-17 | measured / read-primary | medium |
| Ultravox: $0.05/min after 30 free minutes; homepage says acquired by Inworld | https://www.ultravox.ai/pricing; homepage banner | 2026-10-17 | vendor claim | medium |
| Taxila's own stack, for comparison: agent lane p50 4.8 s, cascade 3.7 s, Voice Live S2S ~1.9 s | docs/harvest/tx-voice.md | 2026-10-15 | measured (harvest) | high |

## 6. Measurements

- n = 24 vendor calls (3 vendors x 4 personas x 2 runs), 264 turns, 2026-10-17 10:35-12:34 UTC. Each call ran alone, one browser at a time.
- Per-turn rows: `data/measurements.csv`. Aggregates: `summary-by-vendor*.csv`. Codes: `manual-codes.csv`. Readable transcripts: `transcripts.md`. Recordings: `recordings/*.opus`, stereo, left = caller, right = agent, 8.6 MB.

### Per-persona clean-turn latency p50 / p90 (ms)

| | P1 Hinglish | P2 Bhojpuri + babble | P3 Tamil-English | P4 elderly Hindi |
|---|---|---|---|---|
| Ultravox | 1,462 / 1,894 | 1,812 / 2,309 (7 no-reply) | 1,074 / 1,424 | 1,598 / 2,260 (7 collisions) |
| Vapi | 2,186 / 2,776 | 2,745 / 3,847 (8 collisions) | 2,038 / 4,733 | 2,007 / 2,667 (11 collisions) |
| ElevenLabs | 3,753 / 4,412 | 4,621 / 8,015 | 3,788 / 4,865 | 3,711 / 4,685 |

### Other measurements

- **Silence.** No agent re-prompted within about 6-7 s of caller silence in 20 of 24 calls.
- **ElevenLabs timing**, from its WebSocket, n=72 turns:
  - user_transcript p50: 2,648 ms after the caller stopped
  - agent_response p50: 2,771 ms
  - first audio after the response p50: 3,062 ms
- **ASR on the 38 clean caller clips:**
  - Gnani: 44/46 key terms. It invented digits twice: "ek second" became "1 2", and "bhej do" became "bhej 2".
  - Azure: 44/46. It invented digits once: "saanch saanch" became "60 60".
  - Both missed "floater", and "AI" in the Tamil-English robot question.
  - Gnani returned text for 7/8 one-word answers; Azure for 4/8.
- **Vyora (n=1):** 2,339 ms.

## 7. Gaps in the market found

1. **Hindi-belt language ID and language locking.**
   - Hinglish was answered in Gujarati.
   - Elderly Hindi was answered in Punjabi-inflected Hindi.
   - Hindi callers got English by default.
2. **Endpointing for pause-heavy and elderly speech.** 5 of 6 calls cut into a 1.6 s pause, and Vapi collided on 35% of turns.
3. **Robustness to background speech.**
   - Ultravox looped its greeting or fell silent.
   - ElevenLabs slowed to 8 s and dropped a session.
4. **Backchannels.** "Hmm" and "haan" were treated as absence.
5. **Telephone-register brevity.** Over 20% of turns ran past 40 words for two of the three vendors.
6. **Number confirmation, and digits invented by ASR inverse text normalisation.** This feeds CRM fields.
7. **Self-serve evaluation in Indian languages.** It is mostly gated, which is an opening for an open demo.

## 8. What would kill this

H4's wedge dies if our spec, configured in owner runbook Mode B on any platform at or below about INR 4-6/min all-in, reaches all of these on the same battery:
- clean-turn p50 at or under 1.5 s
- collisions at or under 5%
- barge-in handled in at least 90% of interruptions
- correct language on at least 95% of turns
- no loop or drop under ~15 dB babble.

Vapi's Gujarati and ElevenLabs' English could disappear once the language is set explicitly. Endpointing at pauses, babble robustness and ElevenLabs' 2.6 s end-of-turn look structural, but are unproven until Mode B runs.

## 9. Owner actions

1. **Mode B bench.** Run it on Vapi, Retell, ElevenLabs, Bolna, Smallest Atoms, Ringg, Sarvam, Gnani Inya, Synthflow and Bland, with `runbook/agent-spec.md` and harness manual mode. Capture invoices.
2. **Mode A.** Run the Ravan Agni demo from a normal network.
3. **Gated demos.** Decide on HuskyVoice's identity form and Vyora's WhatsApp OTP.
4. **Mode C phone demos** with `harness/player.html`.
5. **India vantage.** Re-run the public demos from India.
6. **Listening check.** Listen to 2-3 recordings per vendor to confirm the machine codes.
7. **Real voices.** Record native-speaker versions of the battery.

Exact commands are in `runbook/owner-runbook.md`.

## 10. Open questions

- Are the language failures demo configuration or platform defaults?
- Do the Indian specialists do better on pauses, babble and backchannels?
- How much latency do India-based callers add for each vendor?
- What does a minute cost on a real invoice?
- Do human listeners rate any of these as human-like? (H5/H6 panel.)
- Does background speech in real Indian calls look like our synthetic babble?
