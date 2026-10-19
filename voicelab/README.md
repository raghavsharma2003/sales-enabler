# VP voice lab

A test-call bench for the owner to talk to every candidate voice stack before choosing the product's voice
(owner directive 2026-10-19: "I wanna have convo with all these, then I decide").

- **URL:** https://vp-voicelab-1019.centralindia.cloudapp.azure.com (passcode from the owner's chat; never committed)
- **Host:** Azure VM `vl-vm-cin` (Standard_D2as_v5, Central India) in `vp-research-rg`, Caddy (Let's Encrypt) in front of
  the Python server on 127.0.0.1:8080, systemd units `voicelab` and `caddy`.
- **Models:** AI account `vp-lab-ai-sin` (South India) for GPT-4.1 / 4.1-mini (India-resident Standard) / gpt-chat-latest /
  Llama 4 Maverick / Mistral Medium 3.5 / gpt-oss-120b / gpt-realtime-mini / gpt-4o(-mini)-transcribe; Kimi K2.6 on
  `vp-research-ai-sea`; Speech account `vp-lab-speech-cin` (Central India); Gemini API (owner's free key first, paid key
  capped); OpenRouter (gpt-oss-120b on Groq, the report's base brain).

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
across the lab, 20 minutes per call, Gemini paid key capped at what is left of the owner's $30 (topped up $10 on 2026-10-19).

## Not built yet

A real phone leg (owner is setting up Plivo), an LLM "is the caller done?" turn classifier. Inworld and AWS are out of
scope by owner decision (2026-10-19). Sarvam (Saaras STT, Bulbul v4 Flash, Sarvam-105B) runs on the owner's key.
