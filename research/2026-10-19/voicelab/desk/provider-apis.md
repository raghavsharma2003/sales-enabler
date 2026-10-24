# Voice-lab provider API desk research (adapter prep)

Date: 2026-10-19. Method: desk research only, using primary vendor docs (mostly fetched as raw Markdown or the vendor's own pricing feeds). No sign-ups, no spend, no live calls.

Target: a Python asyncio (aiohttp) lab server on an Azure VM in Central India. Caller audio comes in as **16 kHz PCM16 mono**. Agent audio goes out as **PCM16 at 16 or 24 kHz**. Languages: Hindi, Hinglish, Indian English.

**Legend:**
- **[V]**: verified in a primary doc or vendor pricing feed (URL given).
- **[UNVERIFIED]**: not confirmed in a primary doc. The reason is given each time.
- **[INFERRED]**: derived by analogy from documented behaviour. Test it before relying on it.
- Field names are copied exactly from the docs. Where the docs disagree with each other, both spellings are shown and the conflict is flagged.

---

## 0. Summary matrix

| Provider / component | Endpoint (streaming) | Auth | Audio in | Audio out | Hindi / Hinglish | Nearest region to Central India | List price (headline) |
|---|---|---|---|---|---|---|---|
| Inworld STT `inworld/inworld-stt-1` | `wss://api.inworld.ai/stt/v1/transcribe:streamBidirectional` | `Authorization: Basic <base64 key>` | LINEAR16 only; 16 kHz recommended; binary frames supported | JSON transcripts (interim and final) | `hi` is 1 of 30 languages | US (default). India region `api.in.inworld.ai` is Enterprise-only and has **no STT** | $0.15/hr On-Demand; $0.10/hr paid plans |
| Inworld TTS `inworld-tts-2` / `inworld-tts-2-flash` | `wss://api.inworld.ai/tts/v1/voice:streamBidirectional` | Basic | text | `PCM` (raw s16le), 8–48 kHz selectable | Hindi is **Tier 1**; `en-IN` locale; inline `<lang>` tags | US. India region is Enterprise-only (TTS is available there) | TTS-2 $25→$12.50 per 1M chars; Flash $15→$7 per 1M chars |
| Inworld Realtime (STT+LLM+TTS, OpenAI-Realtime-compatible) | `wss://api.inworld.ai/api/v1/realtime/session?key=<session-id>&protocol=realtime` | Basic | `audio/pcm` with `rate` (any; server resamples to 16k) | `audio/pcm` with `rate` (default 24k) | as STT and TTS above | US only (Realtime is not in EU/India regions) | sum of STT + LLM + TTS usage; no per-minute fee |
| Inworld Inference (router) | `POST https://api.inworld.ai/v1/chat/completions` (SSE) | Basic | – | – | model-dependent | US | Gemma 4 26B A4B: $0.07 in / $0.34 out per 1M tokens |
| Sarvam STT `saaras:v3-realtime` / `saaras:v4` | `wss://api.sarvam.ai/speech-to-text-realtime/ws?...` | `Api-Subscription-Key` header | `linear16` 16k or 8k (only those two) | JSON partial and final | Native. `hi-IN`, `en-IN`, `auto`; `mode=codemix` | India-hosted (vendor claim) | ₹30/hr (REST/STT list); website shows ₹0.49/min PAYG |
| Sarvam TTS `bulbul:v4-flash` / `bulbul:v3` | `wss://api.sarvam.ai/text-to-speech/ws?model=...` | `Api-Subscription-Key` | text | 8k/16k/22.05k/24k; codec conflict (see 2.3) | Native. 116 Hindi + 13 `enhi` personas | India-hosted (vendor claim) | v3 ₹30 per 10K chars; v4-flash ₹20 per 10K chars (website) |
| Sarvam LLM `sarvam-105b-conversations` | `POST https://api.sarvam.ai/v1/chat/completions` | `api-subscription-key` or `Authorization: Bearer` | – | – | Indic-native | India | ₹15 in / ₹60 out per 1M tokens |
| AWS Nova 2 Sonic (S2S) | Bedrock `InvokeModelWithBidirectionalStream` (HTTP/2, SigV4) | SigV4 | LPCM 8/16/24 kHz | LPCM 8/16/24 kHz | Hindi `hi-IN` (voices kiara, arjun), `en-IN` | **Not in ap-south-1.** Available in us-east-1, us-west-2, eu-north-1, ap-northeast-1 | speech in $3 / out $12 per 1M tokens (us-east-1) |
| AWS Transcribe streaming | `wss://transcribestreaming.ap-south-1.amazonaws.com:8443/stream-transcription-websocket` (presigned) | SigV4 presign | `pcm` 8k–48k (event-stream framed) | event-stream JSON | `hi-IN` and `en-IN` streaming; multi-language ID | ap-south-1 | $0.0001667/s (about $0.01/min) |
| AWS Polly | `SynthesizeSpeech` (streamed HTTP body) | SigV4 | text | `pcm` 8k/16k only | Kajal (neural; hi-IN and en-IN bilingual) | ap-south-1 (neural only) | Neural $16 per 1M chars (Mumbai) |
| Google Gemini Live `gemini-3.8-live` | `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=...` | API key | PCM16 (16k native; any rate via MIME) | PCM16 **24 kHz fixed** | `hi` in the 99 Live languages; auto-detect; no `languageCode` | Developer API: global, no residency. **Vertex: not in asia-south1** | audio in $0.005/min, audio out $0.018/min |
| Google Gemini TTS `gemini-3.8-flash-tts` / `-flash-lite-tts` | `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `"stream": true` (SSE) | `x-goog-api-key` | text | `audio/l16` 24k default; `sample_rate` 24000/16000/8000 | Hindi supported by both | Developer API global. **Vertex: not in asia-south1** | Flash $9; Flash-Lite $6 per 1M audio tokens (through 2026-12-31) |
| Azure OpenAI realtime `gpt-realtime-2.1` / `-mini` etc. | `wss://<res>.openai.azure.com/openai/v1/realtime?model=<deployment>` | `api-key` header or Entra `Bearer` | **24 kHz PCM only** (or G.711) | **24 kHz PCM only** (or G.711) | No Azure Hindi quality statement | Global Standard incl. **South India**; no Central India; no regional or Data Zone in India | 2.1: audio $32 in / $64 out per 1M; 2.1-mini: $10 / $20 |

### Lab-fit notes

These notes come from the docs above. Nothing here was measured.

- **Resampling.** The only hard incompatibility with 16 kHz in is OpenAI/Azure realtime. Its `audio/pcm` is documented as "Only a 24kHz sample rate is supported", so you need a 16k→24k upsampler on input. Gemini Live output is fixed at 24 kHz. Inworld and Sarvam TTS can emit 16k directly. Nova 2 Sonic can emit 16k or 24k.
- **Region and latency.**
  - Only Sarvam (India-hosted per vendor) and AWS Transcribe and Polly (ap-south-1) are in India for a non-Enterprise account.
  - Inworld's India region is Enterprise-only and does not carry STT, Realtime or Inference.
  - Nova 2 Sonic's nearest region is Tokyo.
  - Azure realtime's nearest Global Standard region is South India, but Global Standard may process data in any Azure region.
  - Gemini (Developer API) has no region pinning, and Vertex does not offer Live or TTS in asia-south1.
- **Barge-in primitives differ.**
  - Gemini: `serverContent.interrupted`.
  - Nova Sonic: `contentEnd.stopReason: "INTERRUPTED"`.
  - OpenAI/Azure and Inworld Realtime: `input_audio_buffer.speech_started`, then client-side `conversation.item.truncate`.
  - Sarvam TTS: no cancel message. Close the socket.
  - Inworld TTS WebSocket: close or abandon the context (see 1.3).

---

## 1. Inworld AI

Docs index: https://docs.inworld.ai/llms.txt. Every page is also available as Markdown by appending `.md`.

### 1.1 Auth, regions, release state

- **Auth [V].** Base URL `https://api.inworld.ai`. Send the Base64 credential (`base64(key_id:secret)`) exactly as copied, in `Authorization: Basic <base64-credential>`. Do not re-encode it. Browsers use one-time tokens. Source: https://docs.inworld.ai/llms.txt
- **Regions [V].**
  - US is the default. EU (`api.eu.inworld.ai`) and India (`api.in.inworld.ai`) are **Enterprise only and provisioned per organization**.
  - Keys are region-specific.
  - **India region product availability:** TTS ✔, Instant Voice Cloning ✔, Voice Design ✔ (with limits). **STT ✘, Text inference ✘, Realtime API ✘.**
  - Source: https://docs.inworld.ai/portal/regions.md
- **Data residency [V].** The pricing page lists "EU & India data residency" only under Enterprise. Source: https://inworld.ai/pricing
- **STT release stage.** The search snippet of the STT overview called `inworld-stt-1` "Experimental". The raw overview page did not repeat this, so treat the label as possibly stale.

### 1.2 STT: `inworld/inworld-stt-1` (WebSocket) [V]

Source: https://docs.inworld.ai/api-reference/sttAPI/speechtotext/transcribe-stream-websocket.md

- **Connection.** `wss://api.inworld.ai/stt/v1/transcribe:streamBidirectional` with header `Authorization: Basic <key>`. Browsers use the subprotocol `bearer_<token>`.
- **First message.** Must be `transcribeConfig`. An unwrapped config closes the socket.
- **Audio.**
  - **LINEAR16 only** for streaming (MP3, OGG_OPUS and FLAC are sync-only).
  - 16 kHz mono recommended. 48 kHz is resampled by the service.
  - Example chunk size is 100 ms (3,200 bytes at 16k).
  - Send base64 in `{"audioChunk":{"content":...}}`, or raw **binary frames** if the first message carries `"audioProtocol":"BINARY"`.
  - Messages are limited to 32 MiB.
- **Results.**
  - `{"result":{"transcription":{"transcript":..., "isFinal":false|true, "wordTimestamps":[...], "voiceProfile":..., "silenceDurationMs":...}}}`.
  - An interim result **replaces** the previous interim. It is not a delta.
  - VAD events: `result.speechStarted{startTimeMs,confidence}` and `result.speechStopped{silenceDurationMs}`.
  - Final usage arrives in `result.usage{transcribedAudioMs, modelId}` after `closeStream`.
- **Client control messages.** `{"endTurn":{}}` and `{"closeStream":{}}`.
- **Turn detection** (https://docs.inworld.ai/stt/turn-detection.md):
  - `endOfTurnConfidenceThreshold` (default 0.4).
  - `inworldSttV1Config.minEndOfTurnSilenceWhenConfident` (20–5000 ms).
  - `inworldSttV1Config.maxTurnSilence` (default 768 ms).
  - `inworldSttV1Config.vadThreshold` (default 0.05; set it to `0` for manual turns).
  - Silence is quantised in 96 ms steps.
  - In manual mode a single turn is capped at about 30 s.
- **Other options.** `prompts` (custom vocabulary, at most 100), `includeWordTimestamps`, `enableSpeakerDiarization` (experimental), `voiceProfileConfig`. `inactivityTimeoutSeconds` is **not applied** by stt-1.
- **Languages** (https://docs.inworld.ai/stt/languages.md):
  - 30 languages including Hindi (`hi`). The `language` field is a hint.
  - **Setting `language` constrains the output script for Hindi** (and for English, Chinese and others).
  - To let detection follow mid-stream language switches, leave `language` empty. For Hinglish, A/B test `language:"hi"` against an empty hint.

Minimal session:

```json
{"transcribeConfig":{"modelId":"inworld/inworld-stt-1","audioEncoding":"LINEAR16","sampleRateHertz":16000,"numberOfChannels":1,"language":"hi","endOfTurnConfidenceThreshold":0.7,"inworldSttV1Config":{"minEndOfTurnSilenceWhenConfident":300,"maxTurnSilence":1200}},"audioProtocol":"BINARY"}
```

The client then sends raw PCM binary frames and finishes with `{"closeStream":{}}`.

### 1.3 TTS: `inworld-tts-2` and `inworld-tts-2-flash` [V]

Sources:
- https://docs.inworld.ai/tts/tts-models.md
- https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-websocket.md
- https://docs.inworld.ai/tts/synthesize-speech-websocket.md

**Models**

| Model | Latency (P90 TTFB, server-side) | Notes |
|---|---|---|
| `inworld-tts-2` | 100 ms | Supports steering, `deliveryMode` (`STABLE`/`BALANCED`/`CREATIVE`) and professional voice cloning |
| `inworld-tts-2-flash` | 20 ms | No steering; non-verbal tags such as `[laugh]` still work (Realtime docs) |

TTS-1.5 is deprecated. `inworld-tts-1` and `-1-max` were discontinued on 2026-06-15.

**WebSocket endpoint**

- Channel: `wss://api.inworld.ai/tts/v1/voice:streamBidirectional` (Basic auth).
- The llms.txt index lists a different path, "WebSocket /v1/tts/synthesize:websocket", but the API reference page gives the channel above. Use the reference value. **[conflict in vendor docs]**
- One connection can hold multiple contexts.
- The session auto-closes after 10 minutes of inactivity.

**Client messages**

- `create` fields: `voiceId`, `modelId`, `audioConfig{audioEncoding, sampleRateHertz, bitRate, speakingRate}`, `language` (BCP-47), `deliveryMode`, `temperature` (ignored on TTS-2), `timestampType`, `timestampTransportStrategy`, `applyTextNormalization` (`ON`/`OFF`), `autoMode`, `autoModeStrategy` (`CLIENT_SEGMENTED` | `SENTENCE_BOUNDARY` [Preview]), `maxBufferDelayMs`, `bufferCharThreshold`, `lipsyncConfig`.
- The guide uses camelCase message keys: `sendText`, `flushContext`, `closeContext`.
- The API reference schema uses snake_case keys: `send_text`, `flush_context`, `close_context`.
- Both forms appear in primary docs. Probably both are accepted (protobuf-JSON), but test it **[UNVERIFIED which is canonical]**.
- `sendText` carries at most 2,000 UTF-16 units.

**Audio**

- `audioEncoding:"PCM"` gives raw s16le with no header, which is what the lab wants.
- `sampleRateHertz` can be anything in 8000–48000. Without it the default is 48 kHz, capped at the model's native rate.
- `LINEAR16` puts a WAV header in **every** chunk. Avoid it.

**Server messages**

- `result.contextCreated`.
- `result.audioChunk.audioContent` (base64), with `usage.processedCharactersCount` and optional `timestampInfo`.
- `result.flushCompleted`.
- `result.contextClosed`.
- `status{code,message}` in gRPC codes.

**LLM token streaming**

Use `autoMode:true`, `autoModeStrategy:"SENTENCE_BOUNDARY"` and send tokens as they arrive. You must send `closeContext` (or `flushContext`) at the end to release the tail. Do not wait for `contextCreated` before sending text.

**Barge-in**

The reference defines no "cancel" message. `closeContext` *synthesizes* the remaining buffered text. Inworld's GitHub `websocket_guides` cover interruptions, but they were not read here **[UNVERIFIED]**. Practical approach: stop playback, discard chunks for that `contextId`, and open a new context. Billing counts text when synthesis starts.

**Other channels**

- HTTP streaming: `POST https://api.inworld.ai/tts/v1/voice:stream` returns NDJSON lines `{"result":{"audioContent":"<b64>",...}}`, up to 4,000 characters per request. Source: https://docs.inworld.ai/tts/synthesize-speech-streaming.md
- OpenAI-compatible: `POST /v1/audio/speech`.

**Expressiveness**

- TTS-2 steering uses square-bracket natural-language instructions such as `[whisper]`, `[laugh]`, `[sigh]`. Source: https://docs.inworld.ai/tts/capabilities/steering.md
- A tag stays in force for the rest of the context, so send it once.
- `synthesisContext` passes earlier turns' text and is not billed.

**Language** (https://docs.inworld.ai/tts/capabilities/multilingual.md)

- **Hindi (`hi` → `hi-IN`) is Tier 1**, the most extensively evaluated tier. `en-IN` is an accepted English locale.
- Cross-lingual synthesis is supported.
- For mid-sentence switches use `<lang lang="hi-IN">…</lang>` tags (TTS-2, every endpoint). Tags are billed as characters. Source: https://docs.inworld.ai/tts/capabilities/language-tags.md

Minimal WebSocket exchange (camelCase as in the guide):

```json
{"contextId":"t1","create":{"voiceId":"<HINDI_VOICE_ID>","modelId":"inworld-tts-2-flash","audioConfig":{"audioEncoding":"PCM","sampleRateHertz":16000},"language":"hi-IN","autoMode":true,"autoModeStrategy":"SENTENCE_BOUNDARY","applyTextNormalization":"OFF"}}
{"contextId":"t1","sendText":{"text":"अरे यार, "}}
{"contextId":"t1","sendText":{"text":"aaj ka plan kya hai?"}}
{"contextId":"t1","closeContext":{}}
```

The server replies with `{"result":{"contextId":"t1","audioChunk":{"audioContent":"<b64 PCM>", ...}}}` frames, then `{"result":{"contextId":"t1","contextClosed":{}}}`.

**Hindi voices**

- The docs list no Hindi voice IDs.
- Use `GET https://api.inworld.ai/voices/v1/voices?filter=lang_code="hi"&pageSize=200`. `lang_code` matches the voice's primary language. Source: https://docs.inworld.ai/api-reference/voiceAPI/voiceservice/list-voices.md
- The legacy `GET /tts/v1/voices?filter=language=hi` is deprecated.
- A third-party aggregator (famulor.io) lists Inworld Hindi voices named Riya, Meher, Seema, Aanya, Shreya, Manoj and Aarav **[UNVERIFIED: not from Inworld docs; display names are not voiceIds]**.
- Inworld's own advice is to clone or design a voice in the target language for best similarity. Voice localization currently works only for English-origin voices.

### 1.4 Realtime API (speech-to-speech, OpenAI-Realtime-compatible) [V]

Sources:
- https://docs.inworld.ai/realtime/connect/websocket.md
- https://docs.inworld.ai/realtime/usage/using-realtime-models.md
- https://docs.inworld.ai/realtime/provider-data.md

**Connection**

- `wss://api.inworld.ai/api/v1/realtime/session?key=<session-id>&protocol=realtime`.
- **`key` is your own session ID, not the API key.**
- Server-side auth: `Authorization: Basic <api-key>`.
- Flow: `session.created` → client `session.update` → `input_audio_buffer.append` → events.

**Session fields**

- `type:"realtime"`, `model` (`provider/model`, a router `inworld/<routerId>`, or Inworld-hosted `inworld/models/<model>`), `instructions`, `output_modalities`, `temperature`, `max_output_tokens`, `tools`.
- `audio.input.transcription{model:"inworld/inworld-stt-1", prompts:[...], language}`.
- `audio.input.turn_detection`, either:
  - `{type:"semantic_vad", eagerness:"low"|"medium"|"high", create_response, interrupt_response}`, or
  - `{type:"server_vad", threshold, prefix_padding_ms, silence_duration_ms, idle_timeout_ms, ...}`.
- `audio.output{voice, model:"inworld-tts-2"|"inworld-tts-2-flash", speed, format}`.
- `providerData{stt, tts, memory, backchannel, responsiveness, caching, ...}`.
- The default LLM if omitted is `google-ai-studio/gemini-2.5-flash`. The default voice is `Dennis`.

**semantic_vad eagerness mapping [V]**

| eagerness | end-of-turn confidence | VAD threshold | min silence | max silence |
|---|---|---|---|---|
| low | 0.90 | 0.15 | 320 ms | 1500 ms |
| medium | 0.75 | 0.25 | 160 ms | 900 ms |
| high | 0.65 | 0.30 | 30 ms | 450 ms |

Explicit `providerData.stt.*` values override these: `end_of_turn_confidence_threshold`, `vad_threshold`, `min_end_of_turn_silence`, `max_turn_silence`.

**Audio formats [V]**

- `audio.input.format` / `audio.output.format` = `{type:"audio/pcm", rate:<n>}` (default 24000), `audio/pcmu`, `audio/pcma`, or `audio/float32`.
- The server resamples input to 16k for STT and resamples TTS to the requested output rate.
- So `{type:"audio/pcm", rate:16000}` both ways fits the lab.
- Recommended chunk size is 60–100 ms.

**Events**

- Standard OpenAI Realtime names: `input_audio_buffer.speech_started` / `speech_stopped`, `conversation.item.input_audio_transcription.delta` / `.completed`, `response.output_audio.delta`, `response.output_audio_transcript.delta`, `response.done`, `conversation.item.truncate{item_id, content_index, audio_end_ms}`.
- Inworld extras: `input_audio_buffer.turn_suggestion` / `turn_suggestion_revoked` / `timeout_triggered`, `response.backchannel.audio.delta`, `response.speak` (speak exact text without the LLM), and `response.speak.acknowledged`.

**TTS-2 options inside Realtime**

- `providerData.tts{segmenter_strategy, steering_handling:"emit_once", language, delivery_mode, conversational, timestamp_type}`.
- `conversational:true` conditions TTS-2 on the audio of prior turns. It is locked at session open.
- Back-channel ("uh-huh") and responsiveness fillers are opt-in.

Minimal `session.update`. The `inworld/models/gemma-4-26b-a4b-it` model string is **[INFERRED]** from the documented `inworld/models/<model>` form used in Inworld's Twilio Realtime guide.

```json
{"type":"session.update","session":{"type":"realtime","model":"inworld/models/gemma-4-26b-a4b-it","instructions":"…","output_modalities":["audio","text"],
 "audio":{"input":{"format":{"type":"audio/pcm","rate":16000},"transcription":{"model":"inworld/inworld-stt-1"},"turn_detection":{"type":"semantic_vad","eagerness":"medium","create_response":true,"interrupt_response":true}},
          "output":{"format":{"type":"audio/pcm","rate":24000},"voice":"<VOICE_ID>","model":"inworld-tts-2"}},
 "providerData":{"tts":{"language":"hi-IN","steering_handling":"emit_once"}}}}
```

### 1.5 Inference (LLM router) [V]

Sources:
- https://docs.inworld.ai/router/openai-compatibility.md
- https://inworld.ai/models

**Endpoint and auth**

- OpenAI-compatible `POST https://api.inworld.ai/v1/chat/completions` (`stream:true` gives SSE).
- Base URL `https://api.inworld.ai/v1`, with a Basic `Authorization` header.
- The Anthropic-compatible `/v1/messages` is also offered.

**Model naming**

- `provider/model` (for example `openai/gpt-5.4`), `auto`, or a router `inworld/<id>`.
- Inworld-hosted models: `inworld/models/<model>`.
- `reasoning_effort` ranges from `none` to `max`.

**Inworld-hosted open models** (TTFT = "best hour in the 7 days to 13 Oct 2026", server-side median per the models page)

| Model ID | TTFT | Speed | Price per 1M tokens (in / out) | Context |
|---|---|---|---|---|
| `inworld/models/gemma-4-26b-a4b-it` | <0.15 s | 237 tok/s | $0.07 / $0.34 | 262K |
| `inworld/models/gemma-4-31b-it` | <0.23 s | – | $0.13 / $0.38 | – |
| `inworld/models/GLM-5.3-Flash` | <0.36 s | – | $0.15 / $0.50 | – |
| `inworld/models/deepseek-v4.1-flash` | <0.84 s | – | $0.30 / $1.20 | – |
| `inworld/models/mimo-v2.6-pro` | <0.18 s | – | $0.43 / $0.87 | – |

Third-party LLMs are billed "at cost (no markup)".

### 1.6 Pricing, credits, limits [V]

Sources:
- https://inworld.ai/pricing (raw HTML read)
- https://docs.inworld.ai/portal/billing.md

**Plans** (monthly fee = monthly credits; credits roll over 3 months)

| Plan | Monthly fee |
|---|---|
| On-Demand | $0 |
| Creator | $25 |
| Builder | $100 |
| Developer | $300 |
| Growth | $1,500 (includes $1,500 credits/month) |
| Enterprise | custom |

**Free usage.** On-Demand includes "up to 70 minutes of TTS or 400 minutes of STT for free".

**Rates by plan** (On-Demand / Creator / Builder / Developer / Growth / Enterprise)

| Product | On-Demand | Creator | Builder | Developer | Growth | Enterprise |
|---|---|---|---|---|---|---|
| TTS-2 per 1M chars | $25 | $20 | $17.50 | $15 | $12.50 | "as low as $5" |
| TTS-2 Flash per 1M chars | $15 | $10 | $9 | $8 | $7 | "sub-$5" |
| STT-1 per hour | $0.15 | $0.10 | $0.10 | $0.10 | $0.10 | custom |

- Inworld estimates about 1,000 TTS characters per audio minute, which makes Flash about $0.007–0.015/min and TTS-2 about $0.0125–0.025/min. This is Inworld's English-centric estimate; Hindi chars/min is **[UNVERIFIED]**.
- STT is billed per second, rounded up per stream. It counts all audio sent, including silence.
- Realtime has no per-minute fee: you pay for the underlying STT + LLM + TTS. Interrupted-but-already-sent TTS segments are billed.

**Concurrency limits**

| Limit | On-Demand | Creator | Builder | Developer | Growth |
|---|---|---|---|---|---|
| TTS concurrent generations | 5 | 10 | 50 | 150 | 500 |
| TTS WebSocket connections | 50 | 100 | 500 | 1,500 | 5,000 |
| STT streaming concurrency | 10 | 20 | 100 | 300 | 1,000 |
| Realtime concurrent sessions | 10 | 20 | 100 | 300 | 1,000 |
| Router concurrent generations | free 2 / paid 5 | 10 | 50 | 150 | 500 |
| Router RPS | 10 | 10 | 15 | 30 | 50 |

Above the limit you get HTTP 429. Back off exponentially with jitter. Source: https://docs.inworld.ai/resources/rate-limits.md

### 1.7 Inworld gaps

- Hindi voice IDs: enumerate them via the API (see 1.3).
- TTS WebSocket barge-in semantics and binary TTS output (`responseProtocol` is mentioned only in passing in the STT docs): **[UNVERIFIED]**.
- `inworld-stt-1` Hinglish/code-mix accuracy: no vendor claim found.

---

## 2. Sarvam AI

Docs index: https://docs.sarvam.ai/llms.txt. Every page is also available as `.md`.

### 2.1 Auth, credits, residency

- **Auth [V].** `api-subscription-key: <key>` header on REST, or `Api-Subscription-Key` on the WebSocket upgrade. Browsers use the WebSocket subprotocol `api-subscription-key.<key>` (realtime STT). Chat also accepts `Authorization: Bearer <key>`.
- **Free credits [V].** ₹100 at sign-up. Credits are universal and never expire. Source: https://docs.sarvam.ai/api/getting-started/ratelimits.md
- **Residency [UNVERIFIED from technical docs].**
  - Sarvam's developer marketing page says data stays and is processed in India, with no cross-border transfer.
  - The technical docs read here contain no residency statement.
  - Get this into the contract or DPA.

### 2.2 STT: Realtime Streaming (`saaras:v3-realtime` default, `saaras:v4`) [V]

Sources:
- https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming.md
- https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md (AsyncAPI)

**Connection**

- Endpoint: `wss://api.sarvam.ai/speech-to-text-realtime/ws`.
- **All configuration goes in the query string:**
  - `language_code` (**required**): `hi-IN`, `en-IN`, …, or `auto`.
  - `model`.
  - `stream_type`: `fast` | `balanced` | `simulated`.
  - `mode`: `transcribe` | `translate` | `verbatim` | `translit` | `codemix`. Applies to the **final** only.
  - `endpointing`: `vad` | `manual`.
  - `encoding`: `linear16` | `linear32` | `mulaw` | `alaw` (mono).
  - `sample_rate`: **`16000` or `8000` only**. Anything else closes with code 4000.
  - `threshold` (0.3).
  - `silence_duration_ms` (500).
  - `min_speech_duration_ms` (250).
  - `prefix_padding_ms` (300; present in the AsyncAPI schema).
  - `return_timestamps`.
  - `prompt`.
  - `keyterms` (v4 only; a JSON array of up to 50).

**Client messages**

- `{"event":"audio_input","audio":"<b64>"}`.
- `{"event":"speech_start"}`, `{"event":"speech_end"}`, `{"event":"flush"}` (manual mode).
- `{"event":"config.update", ...}` (mid-call: language, prompt, mode and stream_type apply at the next utterance; VAD knobs apply immediately).
- `{"event":"end"}`.
- `{"event":"ping"}`.

**Server messages**

- `session.begin{request_id, config}`.
- `vad.speech_start` / `vad.speech_end{utterance_idx, confidence}`.
- `transcript.partial{utterance_idx, text, language?}`.
- `transcript.final{utterance_idx, text, language?, language_confidence?, start_s?, end_s?}`.
- `config.updated{applied}`.
- `pong`.
- `session.end{request_id, total_duration_s, total_utterances, audio_duration_s}`.
- `error{code, is_fatal, message, status_code?}`.

**Close codes**

| Code | Meaning |
|---|---|
| 1003 | rate limit, quota or bad key |
| 1008 | inactivity (send `ping`) |
| 1011 | server error |
| 4000 | invalid parameter, beta denied, or account not enabled |

**Status.**
- The legacy Streaming page calls `saaras:v3-realtime` "beta".
- The 4000 close code mentions "beta denied" and "account not enabled". Access may need enabling **[UNVERIFIED whether a default key works]**.
- The legacy GA WebSocket is `wss://api.sarvam.ai/speech-to-text/ws` (`saaras:v3`). It has no partials; audio goes as `{"audio":{"data":..., "sample_rate":..., "encoding":...}}`.

**Hinglish.**
- `mode=codemix` returns "English words in English, Indic words in native script", for example `मेरा phone number है 9840950950`.
- Partials are always plain transcription in the sticky language.
- Source: https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/select-output-mode.md

**Barge-in.** Drive it from `vad.speech_start` or early partials, not finals (vendor advice).

Minimal session:

```text
GET wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=hi-IN&model=saaras:v4&stream_type=fast&mode=codemix&encoding=linear16&sample_rate=16000&silence_duration_ms=500
Api-Subscription-Key: <key>
```

```json
{"event":"audio_input","audio":"<base64 100ms PCM16>"}
{"event":"end"}
```

### 2.3 TTS: Bulbul (`bulbul:v4-flash` latest, `bulbul:v3` API default, `bulbul:v2` legacy) [V]

Sources:
- https://docs.sarvam.ai/api/getting-started/models/bulbul.md
- https://docs.sarvam.ai/api-reference/text-to-speech/stream.md (AsyncAPI)
- https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/streaming-api/web-socket.md
- https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/best-practices.md

**Connection**

- WebSocket: `wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash&send_completion_event=true`.
- The query `model` defaults to `bulbul:v2` in the AsyncAPI binding, so always set it.

**Client messages**

- The first message must be config: `{"type":"config","data":{...}}`.
- `data` fields: `model`, `language_code` (required), `speaker` (required, lowercase), `pitch`, `pace`, `loudness`, `temperature` (v3 and v4-flash, 0.01–1.0, default 0.6), `speech_sample_rate` (8000 | 16000 | 22050 | 24000; default 22050), `enable_preprocessing` (always on for v3 and v4-flash), `output_audio_codec`, `output_audio_bitrate`, `dict_id`, `min_buffer_size` (30–200, default 50), `max_chunk_length` (50–500, default 150).
- Text: `{"type":"text","data":{"text":"..."}}` (1–2,500 chars; under 500 recommended).
- Flush: `{"type":"flush"}`.
- Ping: `{"type":"ping"}`. The socket idles out after about 1 minute.
- A new `config` message flushes the buffer and then applies.

**Server messages**

- `{"type":"audio","data":{"content_type":...,"audio":"<b64>","request_id":...}}`.
- `{"type":"event","data":{"event_type":"final",...}}` (when `send_completion_event`).
- `{"type":"error","data":{"message":...,"code"?,...}}`.

**Output codec conflict [conflict in vendor docs; test]**

| Source | What it says |
|---|---|
| AsyncAPI enum | lists `linear16, mulaw, alaw, opus, flac, aac, wav, mp3` |
| AsyncAPI description | "currently supports MP3 only" |
| WebSocket guide | lists all codecs incl. `linear16` |
| Bulbul v4 best-practices | "`wav`, `mp3` on WebSocket" |

Try `linear16` first. Fall back to `wav` and strip the header. HTTP streaming (`POST https://api.sarvam.ai/text-to-speech/stream`) lists `linear16` and `wav` among its allowed codecs.

**Pitch and loudness conflict.** The WebSocket schema says pitch and loudness are not supported on v3 or v4-flash. The v4-flash best-practices page lists `pitch` (−0.5–0.5) and `loudness` (0.1–2.5) as v4 parameters. **[conflict]**

**Barge-in [V].** There is no cancel or clear message. Stop playback locally, close the TTS socket, and open a fresh one for the next reply.

**Text rules [V].**
- Write Hindi in Devanagari and English in Latin script. Romanised Hindi "significantly reduces output quality".
- No SSML.
- For mixed copy, set `language_code` to the language whose number and entity conventions you want.

**Voices (v4-flash, 222 IDs, pattern `<name>_<lang>_<style>`) [V]**

- **Hindi–English code-mixed (`enhi`), 13 voices:** `ishita_enhi_companion`, `ishita_enhi_customer`, `ishita_enhi_customer_expressive`, `sanchita_enhi_companion`, `shalini_enhi_companion`, `shalini_enhi_customer`, `shubh_enhi_companion`, `shubh_enhi_ads` (default if `speaker` omitted), `shubh_enhi_banking`, `simran_enhi_companion`, `simran_enhi_customer`, `simran_enhi_banking_expressive`, `sunny_enhi_customer`.
  - Use `_enhi_` "when copy is genuinely mixed English–Hindi in one utterance".
- **Hindi (116 IDs).** Conversational and companion-style examples: `roopa_hi_companion`, `shalini_hi_companion`, `suman_hi_companion`, `ritu_hi_conversation`, `simran_hi_conversation`, `kavya_hi_conversational`, `shreya_hi_conversational`, `ratan_hi_latenight_warm`, `sanchita_hi_romantic`, `ritu_hi_social_lively`. Vendor "expert picks" for Hindi customer care: `aparna_hi_customer`, `aarti_hi_customer`; male: `shubh_hi_customer`, `ratan_hi_customer_expressive`.
- **English (`en-IN`, 62 IDs)**, for example `aparna_en_companion`, `sanchita_en_companion`, `shalini_en_companion`, `simran_en_therapist`.
- **v3 speakers (lowercase):** shubh (default), aditya, ritu, priya, neha, rahul, pooja, rohan, simran, kavya, amit, dev, ishita, shreya, ratan, varun, manan, sumit, roopa, kabir, aayan, ashutosh, advait, anand, tanya, tarun, sunny, mani, gokul, vijay, shruti, suhani, mohit, kavitha, rehan, soham, rupali.
- Sarvam Voice Agents (not the API) retires Bulbul v3 on 2026-11-10. The v3 API stays.

Minimal session:

```json
{"type":"config","data":{"language_code":"hi-IN","speaker":"simran_enhi_companion","speech_sample_rate":16000,"output_audio_codec":"linear16","pace":1.0,"min_buffer_size":50,"max_chunk_length":150}}
{"type":"text","data":{"text":"अरे वाह, आज का plan तो बहुत cool है!"}}
{"type":"flush"}
```

`speech_sample_rate` is typed as a string enum (`"16000"`) in the AsyncAPI schema, while REST examples use integers. Test both.

### 2.4 LLM [V]

Sources:
- https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview.md
- https://docs.sarvam.ai/api-reference/beta-apis.md

**V1 endpoint**

- `POST https://api.sarvam.ai/v1/chat/completions` (OpenAI-shaped, `stream:true` gives SSE).
- Serves `sarvam-105b` (128K context) and `sarvam-105b-conversations` (32K context, "post-trained for real-time dialogue and voice agents").
- Thinking is **on by default** (`reasoning_effort` default `low`). Disable it with `reasoning_effort: null` (the docs show Python `None`) for latency.

**V2 endpoint (beta)**

- `POST https://api.sarvam.ai/v2/chat/completions` serves `sarvam-105b`, `gemma4` (Gemma 4 31B), `glm5.3` and `deepseekv4.1-flash`.
- Access is **whitelisted per API key**. Without it the call fails with `400 invalid_request_error`.
- `x-session-affinity` header for prompt-cache reuse on `gemma4`.

**Deprecated:** Sarvam-M (24B) and Sarvam-30B.

### 2.5 Pricing (INR) and rate limits [V]

Sources:
- https://docs.sarvam.ai/api/getting-started/pricing.md
- https://www.sarvam.ai/api-pricing (via summariser)

**Docs pricing page**

| Item | Price |
|---|---|
| STT | ₹30/hr (₹45/hr with diarization), billed per second |
| TTS Bulbul v3 | ₹30 per 10K chars |
| sarvam-105b / -conversations (per 1M tokens) | ₹15 in / ₹5 cached / ₹60 out |
| gemma4 (per 1M tokens) | ₹35 / ₹10 / ₹90 |
| deepseekv4.1-flash (per 1M tokens) | ₹25 / ₹0.5 / ₹105 |
| glm5.3 (per 1M tokens) | ₹126 / ₹20 / ₹390 |

The docs pricing page has **no Bulbul v4-flash row**.

**Website (sarvam.ai/api-pricing)**

| Item | Pay-as-you-go | Pro | Growth | Business |
|---|---|---|---|---|
| Plan fee per month | ₹0 | ₹2,000 | ₹10,000 | ₹50,000 |
| Real-time STT per min | ₹0.49 | ₹0.45 | ₹0.41 | ₹0.41 |
| Bulbul v4 Flash per 10K chars | ₹20 | ₹18.5 | ₹17 | ₹17 |

The website figures were read via a summarising fetcher. Re-check them on the page **[V-secondary]**.

**Rate limits** (Starter / Pro / Business)

| API | Starter | Pro | Business |
|---|---|---|---|
| STT WebSocket concurrent | 20 | 100 | 100 |
| TTS WebSocket concurrent | 60 (bulbul:v3 Starter: 30) | 200 | 1,000 |
| Chat (default models) per min | 60 | 200 | 1,000 |
| Sarvam-105B per min | 40 | 60 | 120 |

Bursty WebSocket opens can be rejected (close 1003) below the ceiling. Space opens about 300 ms apart (vendor guidance).

---

## 3. AWS (target ap-south-1, Mumbai)

### 3.1 Amazon Nova 2 Sonic (speech-to-speech) [V]

Sources:
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.md
- …/sonic-language-support.md
- …/sonic-input-events.md
- …/sonic-output-events.md
- …/sonic-turn-taking.md
- …/sonic-system-prompts.md
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.md
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithBidirectionalStream.md

**Model and regions**

- Model ID `amazon.nova-2-sonic-v1:0`. In-Region only; no Geo or Global inference profiles.
- **Regions: us-east-1, us-west-2, eu-north-1, ap-northeast-1. Not ap-south-1 or ap-south-2.** Source: https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.md

**Transport**

- `POST /model/{modelId}/invoke-with-bidirectional-stream` on `https://bedrock-runtime.{region}.amazonaws.com`. HTTP/2 event stream, SigV4.
- Each input chunk is `{"chunk":{"bytes":<JSON event utf-8>}}`.
- The stream stays open **8 minutes**. AWS samples show session continuation.
- Python: the AWS sample uses `aws_sdk_bedrock_runtime` (`BedrockRuntimeClient`, `InvokeModelWithBidirectionalStreamOperationInput`, `InvokeModelWithBidirectionalStreamInputChunk`, `BidirectionalInputPayloadPart`). This is not boto3.

**Input event sequence (JSON, all wrapped in `{"event":{...}}`)**

1. `sessionStart{inferenceConfiguration{maxTokens, topP, temperature}, turnDetectionConfiguration{endpointingSensitivity:"HIGH"|"MEDIUM"|"LOW"}}`
2. `promptStart{promptName, textOutputConfiguration{mediaType:"text/plain"}, audioOutputConfiguration{mediaType:"audio/lpcm", sampleRateHertz:8000|16000|24000, sampleSizeBits:16, channelCount:1, voiceId, encoding:"base64", audioType:"SPEECH"}, toolConfiguration?}`
3. `contentStart{promptName, contentName, type:"TEXT", interactive:false, role:"SYSTEM", textInputConfiguration{mediaType:"text/plain"}}` → `textInput{promptName, contentName, content}` → `contentEnd{promptName, contentName}`
4. Optional `SYSTEM_SPEECH` content (Hindi script control, below). It must come **after** the system prompt.
5. `contentStart{..., type:"AUDIO", interactive:true, role:"USER", audioInputConfiguration{mediaType:"audio/lpcm", sampleRateHertz:16000, sampleSizeBits:16, channelCount:1, audioType:"SPEECH", encoding:"base64"}}` → repeated `audioInput{promptName, contentName, content:<b64>}` → `contentEnd`
6. `promptEnd{promptName}` → `sessionEnd{}`

**Output events**

- `completionStart`, then `contentStart` / `textOutput` / `audioOutput{content:<b64>}` / `contentEnd{stopReason:"PARTIAL_TURN"|"END_TURN"|"INTERRUPTED"}`, `toolUse`, `usageEvent`, `completionEnd`.
- User ASR arrives as role USER with `additionalModelFields:"{\"generationStage\":\"FINAL\"}"`.
- Assistant preview text arrives with `SPECULATIVE`. The post-speech transcript arrives with `FINAL`.

**Barge-in.** The server stops generating and signals the interruption (text `contentEnd.stopReason:"INTERRUPTED"`). The client must flush its playback queue.

**Turn-taking [V].** `endpointingSensitivity` pause durations: HIGH = 1.5 s, MEDIUM = 1.75 s, LOW ≈ 2.0 s. Even HIGH waits 1.5 s, which is very slow for natural chit-chat. There is no ms-level knob in the docs.

**Languages and voices [V]**

| Locale | Feminine | Masculine |
|---|---|---|
| `hi-IN` | `kiara` | `arjun` |
| `en-IN` | `kiara` | `arjun` |

- `tiffany` and `matthew` are polyglot voices covering EN, FR, IT, DE, ES, PT and **Hindi**.
- Code-switching within a sentence is supported.
- **Hindi Speech Prompt:** a `contentStart` with `role:"SYSTEM_SPEECH"`, using one of three fixed strings exactly as documented. It selects Latin, Devanagari or mixed script for transcription and response. Mixed-script string: "If the input audio/speech contains hindi, then the transcription and response can mix Latin and Devanagari scripts naturally for code-switching."
- For Hindi, put the assistant's gender in the system prompt for verb agreement ("female AI assistant" for kiara).

**Price (Bedrock pricing feed, per 1K tokens) [V]**

| Region | Speech in | Speech out | Text in | Text out |
|---|---|---|---|---|
| us-east-1 | $0.0030 | $0.0120 | $0.00033 | $0.00275 |
| ap-northeast-1 | $0.00363 | $0.01452 | – | – |

- The feed is the one behind https://aws.amazon.com/bedrock/pricing/ (`b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrock/USD/current/bedrock.json`).
- Speech tokens per second are not documented in the pages read, so there is no primary per-minute figure. Secondary sources say about $0.015/min **[UNVERIFIED]**.
- **"Amazon Nova 2.5 Sonic"** appears in the same pricing feed (same 4 regions, similar rates), but there is no model card, model ID or docs page **[UNVERIFIED: likely just launched; check the console]**.

**Quotas.** Concurrent-stream quotas were not checked **[UNVERIFIED]**.

### 3.2 Amazon Transcribe streaming (hi-IN / en-IN) [V]

Sources:
- https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.md
- …/lang-id-stream.md
- …/streaming-setting-up.md
- …/streaming-partial-results.md
- https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_StartStreamTranscription.md

**Languages.** `hi-IN` and `en-IN` both support **batch and streaming**, with no regional streaming exclusion. ap-south-1 is priced in the AWS feed.

**Code-switching.** Use multi-language identification: `identify-multiple-languages=true` plus `language-options=en-IN,hi-IN` (at least 2, one dialect per language), and optional `preferred-language`.
- The doc's example is "a bilingual speaker alternating between US English (en-US) and Hindi (hi-IN)".
- **PCM only** for multi-language ID.
- It cannot be combined with custom language models or redaction.
- It needs at least about 1 s of speech to identify the language.

**WebSocket**

- Presigned `GET wss://transcribestreaming.ap-south-1.amazonaws.com:8443/stream-transcription-websocket?X-Amz-...&language-code=hi-IN&media-encoding=pcm&sample-rate=16000`. `X-Amz-Expires` is at most 300.
- One stream per WebSocket.
- Audio frames are **AWS event-stream binary encoded**, with headers `:content-type: application/octet-stream`, `:event-type: AudioEvent`, `:message-type: event`.
- End with an empty AudioEvent.
- Responses are event-stream frames with JSON `TranscriptEvent`.
- Error frames: `BadRequestException`, `LimitExceededException`, and others.
- `media-encoding`: `pcm | ogg-opus | flac`. `sample-rate`: 8000–48000.

**Results.**
- `Transcript.Results[]{ResultId, StartTime, EndTime, IsPartial, Alternatives[]{Transcript, Items[]}}`.
- Partial-results stabilization: headers `x-amzn-transcribe-enable-partial-results-stabilization` and `x-amzn-transcribe-partial-results-stability: high|medium|low`. Items carry `Stable`.
- The WebSocket query-param spelling `enable-partial-results-stabilization` / `partial-results-stability` is **[INFERRED]** from the header names.

**Python.** `amazon-transcribe-streaming-sdk` handles the event-stream framing.

**Price [V].** AWS pricing feed, Mumbai = US East: "Streaming Stream to Text" $0.0001667 per second (about $0.010/min). Verify on https://aws.amazon.com/transcribe/pricing/.

### 3.3 Amazon Polly (Hindi / Indian English) [V]

Sources:
- https://docs.aws.amazon.com/polly/latest/dg/available-voices.md
- …/generative-voices.md
- …/neural-voices.md
- …/bilingual-voices.md
- …/API_SynthesizeSpeech.md
- …/API_StartSpeechSynthesisStream.md

**Voices and engines**

| Voice | Locale | Engines |
|---|---|---|
| **Kajal** | en-IN | Neural ✔, **Generative ✔ (en-IN only)**, Long-form ✘, Standard ✘ |
| **Kajal** | hi-IN | Neural ✔ only |
| **Aditi** | en-IN, hi-IN | Standard only |
| **Raveena** | en-IN | Standard only |

- No male Hindi or Indian-English voice exists.
- Aditi and Kajal are "fully bilingual" (en-IN and hi-IN). They accept Devanagari, Romanagari, and mixed text in one sentence.

**Regions**

- **Neural is available in ap-south-1. Generative is not** (generative regions: us-east-1, eu-central-1, us-west-2, ap-northeast-1, ap-northeast-2, ap-southeast-1, ap-southeast-2, eu-west-2, ca-central-1, eu-central-2).

**Streaming**

- `SynthesizeSpeech` streams the audio body back over HTTP.
- `pcm` supports only **8000 or 16000** (default 16000).
- The bidirectional `StartSpeechSynthesisStream` (text-in/audio-out streaming) supports **generative engine only** and is not offered in Mumbai.

**Price [V].** AWS pricing feed, Mumbai: Neural $0.000016/char ($16 per 1M), Standard $4 per 1M. Mumbai has no Generative or Long-form rows. US East Generative is $30 per 1M.

### 3.4 Bedrock LLM "brains" usable from ap-south-1 [V]

Sources:
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.md
- model cards
- the pricing feed

**Access paths**

- `bedrock-runtime.ap-south-1.amazonaws.com` with Converse/ConverseStream (SigV4).
- OpenAI-compatible `https://bedrock-runtime.ap-south-1.amazonaws.com/openai/v1/chat/completions` (Bedrock API key as `Authorization: Bearer`, or SigV4).
- `bedrock-mantle.ap-south-1.api.aws/v1` (OpenAI/Anthropic-compatible; in-region only, no cross-region profiles).

**In-Region in Mumbai** (on-demand price per 1M tokens in/out from the AWS feed; only where a row was found)

| Family | Models | Price (in / out per 1M) |
|---|---|---|
| OpenAI open-weight | `openai.gpt-oss-120b-1:0` | $0.18 / $0.71 |
| OpenAI open-weight | `gpt-oss-20b` | $0.08 / $0.35 |
| Qwen3 | `qwen.qwen3-235b-a22b-2507-v1:0` | $0.26 / $1.04 |
| Qwen3 | Qwen3 32B | $0.18 / $0.71 |
| Qwen3 | Qwen3 Next 80B A3B, Qwen3 Coder 480B, Qwen3-Coder-30B | – |
| DeepSeek | `deepseek.v3.2` | – |
| DeepSeek | DeepSeek-V3.1 | $0.68 / $1.98 |
| Mistral | `mistral.mistral-large-3-675b-instruct`, Ministral 14B / 8B / 3B, Magistral Small 2509, Voxtral Mini / Small | – |
| Moonshot | **Kimi K2.5** | – |
| Z.AI | GLM 5, GLM 4.7, GLM 4.7 Flash | – |
| MiniMax | M2, M2.1, M2.5 | – |
| Google | Gemma 3 27B / 12B / 4B | – |
| NVIDIA | Nemotron Nano 3 30B | – |
| Meta | Llama 3 70B / 8B | – |
| Anthropic (also present) | Claude Opus 5, Claude Sonnet 5 (In-Region via the `bedrock-mantle` endpoint only; `bedrock-runtime` reaches them via Geo or Global profiles) | – |

**Geo profiles from Mumbai**

- **India geo (`in.` prefix, routes only between Mumbai and Hyderabad):** Kimi K3 (`in.moonshotai.kimi-k3`).
- **APAC geo:** Nova Pro / Lite / Micro (`apac.amazon.nova-pro-v1:0`, …). Mumbai prices from the feed: Nova Pro $0.94 / $3.76, Nova Lite $0.071 / $0.284, Nova Micro $0.041 / $0.164.

**Global-only from Mumbai** (data can leave India): Nova 2 Lite (`global.amazon.nova-2-lite-v1:0`, $0.35 / $2.95), GLM 5.3, Grok 4.6 / 4.7, OpenAI GPT-6 / GPT-5.6 family, most Claude models.

**Not available from Mumbai:** Llama 4 Maverick and Scout (US Geo only), Nova 2 Sonic.

**TTFT.** The AWS pages consulted publish no TTFT figures for these models. **[UNVERIFIED; measure in the lab]**.

---

## 4. Google Gemini

Docs index: https://ai.google.dev/gemini-api/docs/llms.txt. Pages are available as `.md.txt`.

### 4(a) Voices

**Prebuilt voices** (30; same set for Gemini 3.8 TTS and, per the Live docs, Live native-audio models) [V]

Zephyr (Bright), Puck (Upbeat), Charon (Informative), Kore (Firm), Fenrir (Excitable), Leda (Youthful), Orus (Firm), Aoede (Breezy), Callirrhoe (Easy-going), Autonoe (Bright), Enceladus (Breathy), Iapetus (Clear), Umbriel (Easy-going), Algieba (Smooth), Despina (Smooth), Erinome (Clear), Algenib (Gravelly), Rasalgethi (Informative), Laomedeia (Upbeat), Achernar (Soft), Alnilam (Firm), Schedar (Even), Gacrux (Mature), Pulcherrima (Forward), Achird (Friendly), Zubenelgenubi (Casual), Vindemiatrix (Gentle), Sadachbia (Lively), Sadaltager (Knowledgeable), Sulafat (Warm).

Sources:
- https://ai.google.dev/gemini-api/docs/speech-generation.md.txt
- https://ai.google.dev/gemini-api/docs/live-api/capabilities.md.txt ("Native audio output models support any of the voices available for our TTS models").

**Live voice config.** `generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` (the JS field names from the Live doc).

**TTS-only extras [V]**

- The Extended Voice Library ("hundreds" of voices) via `GET https://generativelanguage.googleapis.com/v1beta/voices?language_code=hi-IN&...`. Filters: `language_code`, `region_code`, `accent`, `gender`, `pitch`, `persona`, `context`, `type`, `search`, `page_size`.
- Voice design and voice replication (`voice_...` IDs, 200 per project).

**Hindi guidance**

- The docs name **no specific voice as recommended for Hindi** **[UNVERIFIED / not documented]**.
- Documented guidance:
  - For TTS, query the Extended Voice Library with `language_code=hi-IN` or `region_code=IN`, or design a voice.
  - Don't put accent changes in `style`.
  - For Live, say in the system instructions which language (and, if wanted, which accent) to use: "RESPOND IN {OUTPUT_LANGUAGE}. YOU MUST RESPOND UNMISTAKABLY IN {OUTPUT_LANGUAGE}." Source: live-api/best-practices.
- Whether Extended Voice Library or custom `voice_...` IDs work in **Live** sessions: **[UNVERIFIED]**.

### 4(b) Live API on current models [V]

Sources:
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live.md.txt
- …/models/gemini-3.8-live-extended-thinking.md.txt
- …/live-api/capabilities.md.txt
- …/live-api/session-management.md.txt
- https://ai.google.dev/api/live.md.txt

**Models**

| Model | Status | Notes |
|---|---|---|
| `gemini-3.8-live` | stable, Sept 2026 | "default option for most low-latency voice agent experiences" |
| `gemini-3.8-live-extended-thinking` | stable | background reasoning |
| `gemini-3.1-flash-live-preview` | legacy | – |
| `gemini-2.5-flash-native-audio-preview-12-2025` | older | – |

Token limits: 131,072 in / 65,536 out.

**Connection**

- `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=API_KEY`.
- Ephemeral tokens: `...BidiGenerateContentConstrained?access_token=...`.
- The first message is `setup` (`BidiGenerateContentSetup`). Wait for `setupComplete`.

**Audio**

- In: raw PCM16 LE, natively 16 kHz. Any rate is accepted if you declare it in the MIME type: `{"realtimeInput":{"audio":{"data":"<b64>","mimeType":"audio/pcm;rate=16000"}}}`.
- Out: PCM16 at **24 kHz, always**, in `serverContent.modelTurn.parts[].inlineData.data`.
- Send `realtimeInput.audioStreamEnd` when the mic pauses for more than 1 s. It is also used for "hybrid VAD" finalisation.

**Feature matrix**

| Feature | `gemini-3.8-live` | `-3.8-live-extended-thinking` | `gemini-3.1-flash-live-preview` | 2.5 native audio |
|---|---|---|---|---|
| Thinking | interleaved; **`thinkingLevel` not supported (omit)** | `thinkingLevel` low / medium / high (not minimal) | `thinkingLevel` minimal (default) to high | (thinkingBudget) |
| Affective dialog | **removed** (remove `enable_affective_dialog`) | – | not supported | v1beta `enable_affective_dialog: true` |
| Proactive audio | **permanently on** (`proactive_audio:false` errors) | permanently on | not supported | v1beta `proactivity.proactiveAudio` |
| Async function calls | default `NON_BLOCKING`; scheduling `SILENT` / `WHEN_IDLE` / `INTERRUPTED` | NON_BLOCKING only | sync only | – |
| `turnComplete` semantics | – | not idle; use `interactionStatus` IN_PROGRESS / IDLE | – | – |
| Response modality | AUDIO (enable `outputAudioTranscription` for text) | AUDIO | – | – |
| Turn coverage default | `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` | – | same | – |

**`realtimeInputConfig.automaticActivityDetection` [V]**

| Field | Values / notes |
|---|---|
| `disabled` | default false |
| `startOfSpeechSensitivity` | `START_SENSITIVITY_HIGH` (default) or `_LOW` |
| `endOfSpeechSensitivity` | `END_SENSITIVITY_HIGH` (default) or `_LOW` |
| `prefixPaddingMs` | ms |
| `silenceDurationMs` | recommended 500–800; the server default is about 800 ms; 100–200 fragments utterances |

- `realtimeInputConfig` also has `activityHandling`, `turnCoverage` and `interimTranscriptTimestampEnabled`.
- Manual VAD: send `activityStart` / `activityEnd`, with at least 500 ms end-silence on the client.

**Language**

- Native-audio models "automatically choose the appropriate language and **don't support explicitly setting the language code**".
- The Live list has 99 languages, including Hindi (`hi`).
- Transcription hints: `inputAudioTranscription{languageCodes[], customVocabulary[], wordTimestamp, diarization, mode: VERBATIM|SMART}`.
- Server fields: `serverContent.inputTranscription{text, languageCode}`, `interimInputTranscription` (low-latency partials), `outputTranscription`.

**Interruption.** On barge-in the server sends `serverContent.interrupted: true` (cancelled tool calls are listed). Clear the playback queue. Other signals: `generationComplete`, `turnComplete`, `waitingForInput`, `voiceActivity`, `usageMetadata`.

**Sessions**

- Audio-only sessions last 15 min without compression. A connection lasts about 10 min (a `goAway{timeLeft}` warning is sent).
- `contextWindowCompression{slidingWindow{targetTokens}, triggerTokens}` gives unlimited session length.
- `sessionResumption{handle}`, then `sessionResumptionUpdate{newHandle, resumable}`. Handles are valid 2 h.
- `historyConfig.initialHistoryInClientContent` seeds history.

**Price (paid tier, per 1M tokens; covers 3.8 Live, Extended Thinking and 3.1 preview) [V]**

| Direction | Text | Audio | Image/video |
|---|---|---|---|
| Input | $0.75 | $3.00 ("or $0.005/min") | $1.00 ("or $0.002/min") |
| Output | $4.50 | $12.00 ("or $0.018/min") | – |

- The free tier is "Free of charge", but "Used to improve our products: Yes".
- Source: https://ai.google.dev/gemini-api/docs/pricing.md.txt

**Rate limits.** The Live concurrent-session limits are not in the rate-limits page **[UNVERIFIED; check AI Studio]**.

Minimal setup (field names from the API reference).

**[conflict in vendor docs]** The WebSocket getting-started example puts `"responseModalities"` directly under `setup`. The API reference nests generation parameters, including `speechConfig`, under `setup.generationConfig`. The example below follows the reference. Test both placements.

```json
{"setup":{"model":"models/gemini-3.8-live",
  "generationConfig":{"responseModalities":["AUDIO"],"speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":"Aoede"}}}},
  "systemInstruction":{"parts":[{"text":"…Hinglish persona…"}]},
  "realtimeInputConfig":{"automaticActivityDetection":{"startOfSpeechSensitivity":"START_SENSITIVITY_HIGH","endOfSpeechSensitivity":"END_SENSITIVITY_HIGH","prefixPaddingMs":200,"silenceDurationMs":600}},
  "inputAudioTranscription":{"languageCodes":["hi-IN","en-IN"]},
  "outputAudioTranscription":{},
  "contextWindowCompression":{"slidingWindow":{}},
  "sessionResumption":{}}}
```

### 4(c) Gemini TTS (streaming and director prompting) [V]

Source: https://ai.google.dev/gemini-api/docs/speech-generation.md.txt

**Models.** `gemini-3.8-flash-tts` (130+ languages; fidelity, acting, dialects) and `gemini-3.8-flash-lite-tts` (100+ languages; "conversational voice agent cascades"). Both support Hindi. `gemini-3.1-flash-tts-preview` is legacy.

**API**

- The Interactions API: `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`.
- Fields: `input[{type:"user_input", content[{type:"text", text, annotations[{type:"speech_metadata", style, speaker?}]}]}]`, `response_format{type:"audio", mime_type, sample_rate}`, `generation_config.speech_config[{voice}]`, `stream:true`.
- Also available via legacy `generateContent` (`AUDIO_L16`).

**Streaming.**
- SSE events: `interaction.created`, then `step.start{type:"model_output"}`, `step.delta{delta{type:"audio", data:<b64>}}`, …, `step.stop`, `interaction.completed`.
- Streaming default is **headerless `audio/l16` 24 kHz mono**. `sample_rate` accepts 24000 / 16000 / 8000. `audio/mulaw` and `audio/alaw` are also available.
- Unary requests default to WAV.
- Source for event names: https://ai.google.dev/gemini-api/docs/streaming.md.txt

**Director prompting (3.8)**

- `text` is a **verbatim transcript**. Sustained delivery goes in `speech_metadata.style`, for example "warm and enthusiastic" or "speaking rapidly".
- Point-in-time events use angle-bracket inline tags: `<laugh>`, `<sigh>`, `<breath>`, `<short pause>`, `<long pause>`, `<chuckle>`, `<gasp>`, `<whispers>`, and others. "If your transcript is in a non-English language, continue to use English inline tags."
- CAPS give emphasis. `|reaction|` gives back-channels in multi-speaker turns.
- For voice agents: one TTS call per turn; an empty or constant short `style`; carry identity in the voice ID. Old long "Director's Notes" / "Audio Profile" blocks cause drift; design a voice instead.

**Price (paid Standard, per 1M tokens; 25 audio tokens/s)**

| Model | Text in | Audio out | Per 10 s audio |
|---|---|---|---|
| Flash TTS (through 2026-12-31) | $0.50 | $9.00 | $0.00225 |
| Flash TTS (from 2027-01-01) | $1.00 | $18.00 | – |
| Flash-Lite TTS (through 2026-12-31) | $0.50 | $6.00 | $0.0015 |
| Flash-Lite TTS (from 2027-01-01) | doubles | doubles | – |

A Priority tier costs more.

Minimal streaming request:

```json
{"model":"gemini-3.8-flash-lite-tts",
 "input":[{"type":"user_input","content":[{"type":"text","text":"अरे यार <chuckle> that's so cute!","annotations":[{"type":"speech_metadata","style":"casual, friendly"}]}]}],
 "response_format":{"type":"audio","mime_type":"audio/l16","sample_rate":16000},
 "generation_config":{"speech_config":[{"voice":"Sulafat"}]},
 "stream":true}
```

### 4(d) Vertex AI regions (asia-south1 / asia-south2) [V]

Source: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations (HTML parsed for `compare-yes` cells)

| Model | Vertex availability |
|---|---|
| `gemini-3.8-live` | `us` and `eu` multi-regions and us-central1 only. **Not asia-south1.** Not on the global endpoint either. |
| `gemini-live-2.5-flash-native-audio` | US and EU regions only |
| `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` | **global endpoint only** |
| Gemini 2.5 Pro / Flash TTS | US / Montréal / EU regions plus global. **None in asia-south1.** |

- asia-south1 does carry Gemini 3.5 Flash, Gemini 3.5 Flash-Lite and Gemini 2.5 Flash (text models usable as an India-resident brain).
- **asia-south2 (Delhi) does not appear on the page at all.**

**Conclusion: no Vertex Live API or Gemini-TTS in Mumbai or Delhi as of this page.**

---

## 5. Azure OpenAI realtime (GA)

Sources:
- https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio
- …/how-to/realtime-audio-websockets
- …/foundry-models/concepts/models-sold-directly-by-azure-region-availability?pivots=standard
- …/openai/quotas-limits

Azure defers the schema to the OpenAI reference: https://developers.openai.com/api/reference/resources/realtime (Markdown at `.md`).

**Models on Azure [V]**

| Model | Version | Notes |
|---|---|---|
| `gpt-realtime` | 2025-08-28 | – |
| `gpt-realtime-mini` | 2025-10-06, 2025-12-15 | – |
| `gpt-realtime-1.5` | 2026-02-23 | – |
| `gpt-realtime-2` | 2026-05-07 | – |
| `gpt-realtime-2.1` | 2026-07-07 | "improved silence and noise handling" |
| `gpt-realtime-2.1-mini` | 2026-07-07 | – |
| `gpt-realtime-translate` | 2026-05-06 | – |
| `gpt-realtime-whisper` | 2026-05-06 | – |
| `gpt-live-transcribe` | 2026-07-29 | "current recommended" realtime STT |
| `gpt-4o(-mini)-realtime-preview` | – | legacy |

Limits: 32K input / 4,096 output tokens.

**Regions [V]**

- Global Standard deployments of the gpt-realtime family are listed in **canadacentral, centralus, eastus2, francecentral, swedencentral, southindia**.
- There is no Central India, no Data Zone in India, and no Standard (regional) deployment of realtime.
- Global Standard "can process prompts and responses in any Azure region".
- The websockets page text still says "East US 2 and Sweden Central". The region table is newer and more complete.

**Endpoint and auth [V]**

- `wss://<resource>.openai.azure.com/openai/v1/realtime?model=<deployment-name>`. Do not add `api-version`; mixing in preview params gives a 404.
- Auth: the `api-key` header (or an `api-key` query param), or Entra `Authorization: Bearer <token>`.

**GA `session.update` shape** (OpenAI reference plus Azure sample) [V]

- `type:"realtime"`, `instructions`, `output_modalities:["audio"]`.
- `audio.input`:
  - `format{type:"audio/pcm", rate:24000}` (or `audio/pcmu`, `audio/pcma`).
  - `noise_reduction{type:"near_field"|"far_field"}` or `null`.
  - `transcription{model, language (ISO-639-1), languages[], prompt, keywords, delay}`.
  - `turn_detection`, either:
    - `{type:"semantic_vad", eagerness:"low"|"medium"|"high"|"auto", create_response, interrupt_response}`, or
    - `{type:"server_vad", threshold, prefix_padding_ms, silence_duration_ms, idle_timeout_ms, create_response, interrupt_response}`, or
    - `null`.
- `audio.output{format, voice, speed}`.
- `reasoning{effort: minimal|low|medium|high|xhigh}` for reasoning-capable models such as gpt-realtime-2.
- `tools`, `tool_choice`, `max_output_tokens`.

**Audio format.** **"The PCM audio format. Only a 24kHz sample rate is supported."** This applies to input and output. **The lab must upsample 16 kHz caller audio to 24 kHz** (or use G.711 at 8 kHz).

**Transcription model (Azure deviation) [V]**

- `audio.input.transcription.model` must be **your Azure deployment name** of the transcription model, not the OpenAI model name.
- OpenAI enum: `whisper-1`, `gpt-transcribe`, `gpt-live-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-mini-transcribe-2025-12-15`, `gpt-4o-transcribe`, `gpt-4o-transcribe-diarize`, `gpt-realtime-whisper`.

**Voices [V per OpenAI ref]**

- `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, **`marin`**, **`cedar`**, or a custom `{id}`.
- OpenAI: "For best quality, we recommend using `marin` or `cedar`." The voice cannot change after audio is emitted.
- Azure's own pages only show `alloy`. **[UNVERIFIED that marin and cedar work on Azure; they likely do, since Azure "follows the OpenAI Realtime API specification"]**

**Events [V]**

- Client: `input_audio_buffer.append{audio}`, `input_audio_buffer.commit`, `input_audio_buffer.clear`, `conversation.item.create`, `response.create`, `response.cancel`, `conversation.item.truncate{item_id, content_index, audio_end_ms}`.
- Server: `session.created`, `session.updated`, `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`, `input_audio_buffer.committed`, `conversation.item.input_audio_transcription.delta`, `conversation.item.input_audio_transcription.completed`, `response.output_audio.delta{delta:<b64>}`, `response.output_audio_transcript.delta`, `response.output_audio.done`, `response.done`, `error`.

**Barge-in over WebSocket**

1. On `speech_started` the server auto-cancels the response.
2. The client stops playback.
3. The client sends `conversation.item.truncate` with the played ms.

Minimal `session.update`:

```json
{"type":"session.update","session":{"type":"realtime","instructions":"…","output_modalities":["audio"],
 "audio":{"input":{"format":{"type":"audio/pcm","rate":24000},"noise_reduction":{"type":"near_field"},
                   "transcription":{"model":"<your-gpt-4o-transcribe-deployment>","language":"hi"},
                   "turn_detection":{"type":"semantic_vad","eagerness":"medium","create_response":true,"interrupt_response":true}},
          "output":{"format":{"type":"audio/pcm","rate":24000},"voice":"marin"}}}}
```

**Hindi quality.** No Azure or OpenAI primary statement on realtime Hindi or Hinglish quality was found. Azure only says to pass an ISO-639-1 hint for transcription and to "validate your required languages with production-like audio" **[UNVERIFIED: measure]**.

**Price (Azure retail prices API, Global, South India = East US 2, USD per 1M tokens) [V]**

| Model | Audio in | Audio out | Text in | Text out | Cached audio in |
|---|---|---|---|---|---|
| gpt-realtime (0828), gpt-realtime-1.5 | $32 | $64 | $4 | $16 | $0.40 |
| gpt-realtime-2, gpt-realtime-2.1 | $32 | $64 | $4 | $24 | $0.40 |
| gpt-realtime-mini (1215), gpt-realtime-2.1-mini | $10 | $20 | $0.60 | $2.40 | $0.30 |

- Data Zone pricing (US/EU) is about 10% higher.
- Duration-billed models: gpt-realtime-whisper $1.02/hr, gpt-realtime-translate $2.04/hr.
- Source: `https://prices.azure.com/api/retail/prices` (meters "gpt rt …", "gpt-realtime-2.1 …").

**Per-minute estimate [INFERRED]**

- OpenAI's cost guide says user audio is 1 token per 100 ms (600 tokens/min) and assistant audio is 1 token per 50 ms (1,200 tokens/min). Source: https://developers.openai.com/api/docs/guides/realtime-costs
- gpt-realtime-2.1: about $0.019 per user-minute in plus $0.077 per agent-minute out.
- 2.1-mini: about $0.006 plus $0.024.
- Both figures exclude the full context being re-billed on every turn, which grows over a session. Cached-input rates soften that.
- The Azure token-per-ms ratio for gpt-realtime-2.x is **[UNVERIFIED]**.

**Quotas [V]**

- Tier 1 lists `gpt-realtime` GlobalStandard at 200 RPM / 100,000 TPM.
- The quota page also has a "GPT-Live concurrent session limits" table: Default 10, Tier 1 25, Tier 2 50, Tier 3 200, Tier 4 300, Tier 5 500 concurrent sessions per subscription.
- Whether "GPT-Live" means the realtime models is **[UNVERIFIED wording]**.

---

## 6. Adapter checklist for the lab

All items come from the docs above.

1. **Audio normalisation layer.**
   - Input 16k PCM16 passes through as-is to Inworld STT and Realtime, Sarvam STT, Nova Sonic, Gemini Live and Transcribe.
   - **Upsample to 24k for Azure/OpenAI realtime.**
   - Output: request 16k or 24k PCM from Inworld TTS (`PCM`), Sarvam TTS (`linear16` or `wav`, test which), Gemini TTS (`audio/l16` + `sample_rate`), Polly (`pcm` 16000 max) and Nova Sonic (`sampleRateHertz` 16000/24000).
   - Gemini Live and Azure realtime output **24k only**.
2. **Unified events.** Map vendor events to `speech_started`, `partial`, `final`, `agent_audio_chunk`, `agent_transcript`, `interrupted`, `turn_done`, using the event names in each section.
3. **Barge-in.**
   - Server-side cancel: Gemini, Nova Sonic, OpenAI-style (Azure, Inworld Realtime).
   - Client-side only: Sarvam TTS (close the socket) and Inworld TTS (abandon the context; semantics unverified).
   - Truncation message needed for OpenAI-style APIs.
4. **Session lifetimes.**
   - Nova Sonic: 8 min per stream.
   - Gemini Live: about 10 min per connection; use resumption plus compression.
   - Sarvam TTS: about 1 min idle; send ping.
   - Inworld TTS: 10 min idle.
   - Transcribe: the presign expiry is 5 min, but that is the URL expiry, not the stream length.
5. **Region and residency.**
   - Only Sarvam (vendor claim) and AWS Transcribe and Polly in ap-south-1 keep audio in India on a standard account.
   - Bedrock in-region LLMs in Mumbai (gpt-oss, Qwen3, DeepSeek, Mistral, Kimi K2.5, GLM) or `in.` geo (Kimi K3) keep the brain in India.
   - Everything else is US, global, Tokyo or South-India-Global-Standard.

---

## 7. Open items and unverified points

1. Inworld Hindi `voiceId`s. Only third-party names are known (Riya, Manoj, …). List them via the Voices API.
2. Inworld TTS WebSocket: canonical message key casing (camelCase vs snake_case), cancel or barge-in semantics, and binary output (`responseProtocol`).
3. Inworld STT "Experimental" label status, and Hinglish behaviour of the `language` hint (script constraint).
4. Sarvam: whether `saaras:v3-realtime` / `saaras:v4` realtime WebSocket needs beta enablement; the TTS WebSocket `output_audio_codec` support (`linear16` vs MP3-only); v4-flash pitch and loudness; v4-flash price (website only); India residency (contract).
5. AWS: Nova 2 Sonic speech-tokens-per-second (needed for per-minute cost); Nova Sonic concurrency quotas; "Nova 2.5 Sonic" (pricing feed only); the Transcribe WebSocket stabilization param spelling; TTFT for Mumbai LLMs.
6. Gemini: Live concurrent-session limits; whether Extended Voice Library or custom voices work in Live; no documented Hindi voice recommendation.
7. Azure: `marin`/`cedar` and `reasoning.effort` on Azure deployments; the realtime Hindi quality statement; the meaning of "GPT-Live concurrent session limits".

---

## Sources (primary unless noted)

**Inworld**
- https://docs.inworld.ai/llms.txt
- https://docs.inworld.ai/stt/overview.md
- https://docs.inworld.ai/stt/languages.md
- https://docs.inworld.ai/stt/audio-formats.md
- https://docs.inworld.ai/stt/turn-detection.md
- https://docs.inworld.ai/api-reference/sttAPI/speechtotext/transcribe-stream-websocket.md
- https://docs.inworld.ai/tts/tts-models.md
- https://docs.inworld.ai/tts/capabilities/generating-audio.md
- https://docs.inworld.ai/tts/capabilities/multilingual.md
- https://docs.inworld.ai/tts/capabilities/language-tags.md
- https://docs.inworld.ai/tts/synthesize-speech-websocket.md
- https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-websocket.md
- https://docs.inworld.ai/tts/synthesize-speech-streaming.md
- https://docs.inworld.ai/tts/best-practices/latency.md
- https://docs.inworld.ai/api-reference/voiceAPI/voiceservice/list-voices.md
- https://docs.inworld.ai/realtime/overview.md
- https://docs.inworld.ai/realtime/connect/websocket.md
- https://docs.inworld.ai/realtime/usage/using-realtime-models.md
- https://docs.inworld.ai/realtime/provider-data.md
- https://docs.inworld.ai/api-reference/realtimeAPI/realtime/realtime-websocket.md
- https://docs.inworld.ai/models.md
- https://docs.inworld.ai/portal/billing.md
- https://docs.inworld.ai/portal/regions.md
- https://docs.inworld.ai/resources/rate-limits.md
- https://inworld.ai/pricing
- https://inworld.ai/models
- Secondary, for the Hindi voice names only: https://www.famulor.io/fr/voices/inworld/languages/hi/accents/indian

**Sarvam**
- https://docs.sarvam.ai/llms.txt
- https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming.md
- https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md
- https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/select-output-mode.md
- https://docs.sarvam.ai/api/getting-started/models/saaras.md
- https://docs.sarvam.ai/api/getting-started/models/bulbul.md
- https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices.md
- https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/best-practices.md
- https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/streaming-api/web-socket.md
- https://docs.sarvam.ai/api-reference/text-to-speech/stream.md
- https://docs.sarvam.ai/api-reference/text-to-speech/convert-stream.md
- https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview.md
- https://docs.sarvam.ai/api/getting-started/models/sarvam-105b.md
- https://docs.sarvam.ai/api-reference/beta-apis.md
- https://docs.sarvam.ai/api/getting-started/pricing.md
- https://docs.sarvam.ai/api/getting-started/ratelimits.md
- https://docs.sarvam.ai/changelog/2026/10/14.md
- https://www.sarvam.ai/api-pricing
- https://sarvam.ai/developers (marketing; residency claim)

**AWS**
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-output-events.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-turn-taking.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-barge-in.md
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-system-prompts.md
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithBidirectionalStream.md
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.md
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.md
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.md
- https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.md
- https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.md
- https://aws.amazon.com/bedrock/pricing/ (and its JSON feed, b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrock/USD/current/bedrock.json)
- https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.md
- https://docs.aws.amazon.com/transcribe/latest/dg/lang-id-stream.md
- https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.md
- https://docs.aws.amazon.com/transcribe/latest/dg/streaming-partial-results.md
- https://docs.aws.amazon.com/transcribe/latest/dg/how-input.md
- https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_StartStreamTranscription.md
- https://docs.aws.amazon.com/polly/latest/dg/available-voices.md
- https://docs.aws.amazon.com/polly/latest/dg/generative-voices.md
- https://docs.aws.amazon.com/polly/latest/dg/neural-voices.md
- https://docs.aws.amazon.com/polly/latest/dg/bilingual-voices.md
- https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.md
- https://docs.aws.amazon.com/polly/latest/dg/API_StartSpeechSynthesisStream.md
- AWS pricing JSON feeds for transcribe and polly
- Secondary, Nova Sonic per-minute only: https://www.techplained.com/amazon-nova-2, https://rywalker.com/research/aws-nova-2-sonic

**Google**
- https://ai.google.dev/gemini-api/docs/llms.txt
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live.md.txt
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live-extended-thinking.md.txt
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview.md.txt
- https://ai.google.dev/gemini-api/docs/live-api/capabilities.md.txt
- https://ai.google.dev/gemini-api/docs/live-api/best-practices.md.txt
- https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket.md.txt
- https://ai.google.dev/gemini-api/docs/live-api/session-management.md.txt
- https://ai.google.dev/api/live.md.txt
- https://ai.google.dev/gemini-api/docs/speech-generation.md.txt
- https://ai.google.dev/gemini-api/docs/streaming.md.txt
- https://ai.google.dev/gemini-api/docs/pricing.md.txt
- https://ai.google.dev/gemini-api/docs/rate-limits.md.txt
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations

**Azure / OpenAI**
- https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio
- https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio-websockets
- https://learn.microsoft.com/en-us/azure/foundry/openai/realtime-audio-reference
- https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
- https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability?pivots=standard
- https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits
- https://prices.azure.com/api/retail/prices
- https://developers.openai.com/api/reference/resources/realtime
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://developers.openai.com/api/docs/guides/realtime-transcription
- https://developers.openai.com/api/docs/guides/realtime-costs
