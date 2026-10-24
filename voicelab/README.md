# VP voice lab

A test-call bench for the owner to talk to every candidate voice stack before choosing the product's voice
(owner directive 2026-10-19: "I wanna have convo with all these, then I decide").

- **URL:** https://vp-voicelab-1019.centralindia.cloudapp.azure.com (passcode from the owner's chat; never committed)
- **Host:** Azure VM `vl-vm-cin` (Standard_D2as_v5, Central India) in `vp-research-rg`, Caddy (Let's Encrypt) in front of
  the Python server on 127.0.0.1:8080, systemd units `voicelab` and `caddy`.
- **Models:** AI account `vp-lab-ai-sin` (South India) for GPT-4.1 / 4.1-mini (India-resident Standard) / gpt-chat-latest /
  Llama 4 Maverick / Mistral Medium 3.5 / gpt-oss-120b / gpt-realtime-mini / gpt-4o(-mini)-transcribe; Kimi K2.6 on
  `vp-research-ai-sea`; Speech account `vp-lab-speech-cin` (Central India); Gemini on Vertex AI only (project `vp-voice`,
  called only from India; decision.2026-10-21.gemini-vertex-only, no Gemini API keys, no Gemini via OpenRouter);
  OpenRouter for non-Gemini brains (gpt-oss-120b on Groq, the report's base brain; GPT-6 / 5.6 pinned to OpenAI).

## What a call does

- **Browser:** mic → AudioWorklet → 16 kHz PCM over a websocket; the agent's 24 kHz PCM plays through a worklet queue
  tagged by reply id, so an interruption flushes exactly the reply that was cut. Optional phone-line simulation
  (300–3400 Hz band-pass plus a G.711 mu-law round trip, both directions). "Headphones on" disables browser echo
  cancellation, because double-talk suppression otherwise hides the caller's barge-in (found in testing 2026-10-19).
- **Cascade stacks** (`server/calls.py` `CascadeCall`): Silero VAD (MIT, `server/models/silero_vad.onnx`) on the server
  → recogniser (Gemini transcribe-live, Azure Speech hi-IN, or gpt-4o-transcribe realtime like Taxila's Asha; optional
  VAD gate) → brain (any OpenAI-compatible Azure deployment, Gemini, OpenRouter) streamed into clauses → voice (Azure
  neural / DragonHD / MAI-Voice-2.1 with emotion styles, or Gemini TTS) → audio held until the turn is released.
- **Turn-taking:** a reply is triggered only when the final for the caller's latest speech segment has arrived, held
  1.4 s if the caller trailed off on a continuation word ("aur", "matlab", "ki"…), withdrawn if the caller resumes
  before it is audible, interrupted (flush + history truncated to what was heard) if the caller talks over it with
  words; words heard over her without a barge-in are logged as backchannels and not answered.
- **Speech-to-speech stacks:** Gemini Live 3.1 / 3.8 (`GeminiLiveCall`) and Azure gpt-realtime-mini (`AzureRealtimeCall`)
  get the same compiled brief (`server/persona.py`) and the same server VAD for measurement.
- **Every call stores** a stereo WAV (left caller, right agent on the playback clock), per-reply latency (server: caller
  end of speech → first audio sent; client: last speech sample captured → first sample played, incl. output latency),
  talk-overs, barge-ins, metered cost per component (₹ at 95/$), transcript, and an event trace.
- **Real phone** (`server/phone.py`, Plivo India, number +91 80 6549 4553 on the `vp-voicelab` sub-account): each
  tester adds their own mobile on the page and proves it with a missed call to the lab number from that phone (caller
  ID; the call is rejected unanswered, so it is free), so the lab never rings a number its owner didn't ask for. "Call
  me" then rings that phone (max 20 calls per number per day); "I'll dial in" arms the lab number for a call from it.
  Unknown callers are rejected unanswered. Numbers live only in the VM's data directory and are shown masked. Plivo's Answer XML opens a bidirectional `<Stream>` (G.711 mu-law, 8 kHz: what the phone
  network carries anyway, and unambiguous where Plivo's L16 byte order is undocumented) to `/plivo/stream/<token>`;
  `PlivoLine` stands in for the browser websocket so every stack runs unchanged (24 kHz agent audio → 95-tap low-pass
  → 8 kHz; caller 8 kHz → 16 kHz; a barge-in flush becomes `clearAudio`). The page polls `/api/phone/events` for the
  same captions/state/cost a browser call gets. Webhooks use a path secret derived from the auth token; the server
  points the number at itself via Plivo's Application API at startup. Plivo minutes (₹0.376 in / ₹0.38 out, 60 s pulse)
  appear as the `phone` cost part but are not added to the lab's AI spend cap. `tests/plivo_sim.py` plays Plivo's side
  (webhook → XML → mu-law websocket) to test everything but the PSTN leg.
- **Conversation v2 (round 2, 2026-10-20):** `server/persona_v2.py` is the brief for the `v2-*` stacks: Meera/Maya's
  laws (shapes not lines, counts and goal check last, empathy by reacting) plus an agenda ledger computed from the
  transcript each turn and her own hang-up. `evals/convo_bench.py` is the text bake-off (simulated callers, measured
  repetition/agenda/question/script metrics, blind pairwise judges); `tests/voice_bench.py` measures brain and voice
  latency from the VM. Review and numbers: `research/2026-10-20/voicelab/round1-review-and-v2.md`.
- **Memory:** after each call a cheap model extracts durable facts about the caller per scenario; the next call's brief
  includes them ("Open chat, she remembers you").

## Run / deploy

```
python ops/lab_ops.py ai|speech|keys|vm      # one-time Azure setup (vp-research-rg only)
ops/deploy.sh                                # bundle server+web -> blob -> vm_setup.sh via Run Command
python ops/lab_ops.py run smokeN ops/smoke.sh 3000 --async   # headless caller on every stack, from the VM
python tests/sim_caller.py URL PASSCODE PRESET --turns 3     # one headless call from anywhere
```

Keys live only in the scratchpad env files and in `/opt/voicelab/.env` (mode 600) on the VM. Budget guards: $15/day
across the lab, 20 minutes per call, Vertex spend capped by `VERTEX_CAP_USD` (ledger `data/vertex-spend.jsonl`) and
stopped after `VERTEX_LAST_DAY`.

### Environment for Gemini (names only; values never committed)

Gemini (Live ears, brains, voices, Live speech-to-speech) runs only on Vertex AI. `GEMINI_TEST_KEY`,
`GEMINI_PAID_KEY` and `GEMINI_PAID_REMAINING_USD` are gone. A stack Vertex cannot serve shows as unavailable with the
reason on the page and is refused before the call; it is never rerouted.

- `VERTEX_SA_FILE`: service-account JSON. Required for any Gemini stack.
- `VP_REGION`: must name an Indian region (`centralindia` on the VM; `vm_setup.sh` writes it). Anything else: no Gemini.
- `VERTEX_OFF`: `1` switches Vertex (so every Gemini stack) off. `vm_setup.sh` defaults it to `1`.
- `VERTEX_PROJECT` (default `vp-voice`), `VERTEX_LOCATION`: text and TTS location (default `global`).
- `VERTEX_LIVE_LOCATION`: regional location for the Live websocket. No default; unset = the Gemini Live ears and Gemini
  Live speech-to-speech stacks are unavailable.
- `VERTEX_MODEL_MAP`: JSON `{our id: Vertex id or null}` merged over the default map in `server/providers.py`.
- `VERTEX_LIVE_AUDIO`: `mediaChunks` (default) or `audio`, the Live audio-chunk field.
- `VERTEX_CAP_USD`, `VERTEX_LAST_DAY`: the lab's own Vertex spend cap and last day.
- Test hooks: `LAB_TEST_503=model:N` fails that model's Vertex requests after N; `LAB_TEST_BLOCK_MODELS=a,b` drops
  models from the Vertex map.

Tests (no network): `cd server && python3 -m unittest discover -s ../tests -p 'test_vertex*.py'`.

## Not built yet

An LLM "is the caller done?" turn classifier; an end-to-end reply gap measured on the handset for phone calls (the
page shows the server's gap; the phone network's own delay is not measured yet). Inworld and AWS are out of
scope by owner decision (2026-10-19). Sarvam (Saaras STT, Bulbul v4 Flash, Sarvam-105B) runs on the owner's key.
