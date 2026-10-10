# Taxila-style live voice plan — 10 October 2026

## Decision

Implement an **evaluation-only Azure Voice Live adapter** first, using the exact Azure standard HD voice names `en-IN-Diya:DragonHDLatestNeural` and `en-IN-Arjun:DragonHDLatestNeural`. Keep Azure OpenAI Realtime with its current built-in voice as the control and default. Do not silently fall back between engines or publish a Taxila voice from audition evidence.

Voice Live is the minimum robust path because it retains one real-time conversation session, response events, function calling and streamed audio while replacing the output voice with Azure Speech. An application-owned cascade would require a second authoritative turn engine across STT, text generation, tool continuation and TTS. Build that only if Voice Live rejects the exact voices, fails the quality gate, or the product later requires exact SSML/phoneme control.

| Decision axis | Azure Voice Live | Application-owned cascade |
|---|---|---|
| Exact Diya/Arjun identity | Documented `azure-standard` HD names; live availability still needs a handshake | Already accepted by standalone Speech audition for Diya; Arjun remains unprobed |
| SSML control | Structured voice/rate; no reliance on the current Taxila SSML envelope | Exact committed text can use `compileTaxilaSpeech` and later reviewed SSML controls |
| Brain and tools | Realtime-compatible instructions, responses and function calls | A new text turn/tool orchestrator must duplicate current Realtime authority |
| First-audio path | One managed live session | Sequential final STT → text model/tool loop → TTS unless unsafe speculation is introduced |
| Product risk | New server gateway/event adapter | New gateway plus a second conversation engine and streaming synthesizer |

Voice Live therefore wins on minimum surface area and expected latency. Cascade wins only when exact text-to-SSML control is a product requirement.

## Current evidence and exact product boundary

- Commit `cbe5f49` ports only the narrow, attributed Taxila SSML compiler and Diya/Arjun preset allowlist. The compiler preserves entered text and marks existing Devanagari runs; it does not port Taxila's educational renderer, transliterator, style markers, spoken ACKs, custom WebSocket stack or duplex engine.
- One Diya audition returned a valid 5.150-second private WAV through standalone Azure Speech. That proves the configured Speech resource accepted that preset for one synthesis. Live calls still use Azure OpenAI Realtime and its configured built-in voice.
- EmotionalOS and RelationalOS compile final, caller-authored evidence into bounded next-turn instructions. GroupAI/company context, relationship sources, tools and release authority are compiled before provider access. None may move into a client-side voice selector.
- The current continuous Speech sidecar has a bounded server gateway, 20 ms PCM, interim/final revisions, single-use authority, capacity, backpressure and revocation. Interim text is observational only; committed final conversation text remains authoritative.

## What Azure currently documents

Microsoft's current Speech catalog lists both exact DragonHD names. Voice Live accepts an Azure voice object with `type: "azure-standard"`, supports HD voices, and documents `rate` from 0.5–1.5 plus word timestamps. `gpt-realtime-2.1-mini` is a Voice Live Standard-tier model with Azure Speech output; the current region table lists it for East US 2, presently as a preview model. Standard HD voices are available across listed Voice Live resource regions. Voice Live is fully managed and selects a service model in its WebSocket URL; the existing Azure OpenAI deployment name is not automatically a valid Voice Live model or access proof. These are documentation facts, not proof of access on this account. [Voice Live guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to), [Voice Live overview and pricing tiers](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live), [Speech voice catalog](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts), [region support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions?tabs=voice-live).

Do not substitute Voice Live's `azure-realtime-native` voice named `diya`. That is a different native voice contract, and its catalog does not supply a matching Arjun arm. A faithful Taxila-preset evaluation uses the full `azure-standard` DragonHD names. Even then, Voice Live output is not the same path as standalone `speakSsmlAsync`; the 5.150-second audition is neither a latency baseline nor an acoustic-parity reference.

## Versioned selection contract

Add a new field rather than overloading `voiceProfile`:

```ts
type LiveVoiceProfile = {
  version: 1;
  engine: 'azure-openai-realtime' | 'azure-voice-live';
  preset: 'provider-default' | 'taxila-diya' | 'taxila-arjun';
};
```

Validation allows Taxila presets only with `azure-voice-live`. Legacy versions without the field remain Azure OpenAI Realtime. Freeze this object into agent versions, releases, call authority and proof manifests. Map the presets server-side to the two exact voice names and `type: "azure-standard"`; never accept an arbitrary voice string. Omit HD `temperature` initially. Map the existing speech-delivery decision from numeric `1 | 0.9` to Voice Live's string `voice.rate` only between responses. An exact provider ACK proves configuration acceptance, not heard rate or voice quality.

## Live session and transport

Use a server-to-server Voice Live WebSocket. API keys never enter the browser; hosted operation should prefer managed identity. Start with the documented `2026-04-10` API surface, `gpt-realtime-2.1-mini`, PCM16 input at 16 kHz, PCM16 output, and direct model mode rather than a Foundry Agent. Direct mode preserves the app's versioned instructions and tools; agent mode would create a second prompt authority.

The session builder should send:

- the same compiled identity, Company Brain/GroupAI, channel privacy, approved relationship and action rules used today;
- the exact provider-owned tool definitions only after call authority is claimed;
- the selected Azure standard voice and mapped rate;
- the existing reviewed transcription vocabulary;
- `create_response: false`, `interrupt_response: false`, and `auto_truncate: false` so application authority still decides when a final turn may answer and how much output was heard; and
- bounded noise reduction/echo cancellation only after device evaluation. Server echo reference assumes prompt playback; do not enable it while the browser can queue more than two seconds of audio.

Voice Live uses mostly Realtime-compatible events, including `session.updated`, `response.create`, `response.cancel`, streamed audio/transcript events and function-call arguments. Its `output_audio_buffer.clear` is currently avatar-only. Browser playback interruption must therefore clear the app queue, cancel the response, and send `conversation.item.truncate` with the ledger's actually played milliseconds. [Voice Live API reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-api-reference-2026-04-10), [interruption history](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-voice-live-auto-truncation).

Use one browser-to-app WebSocket carrying bounded binary 16 kHz microphone frames and framed output PCM. The gateway can tee the same input frames to the existing continuous Speech provider for early floor evidence and Voice Live for the actual conversation. Sidecar interim/final text may drive `continue_listening | possible_takeover | uncertain`; it must not enter transcript history, memory, tools, EmotionalOS, RelationalOS or GroupAI. The Voice Live conversation-item final remains the user-turn authority.

## Turn, ACK and action invariants

1. Claim the immutable call ticket, voice attempt, agent/release/config digests and enabled-tool authority before opening Voice Live.
2. Send the initial session tuple and wait for an exact normalized `session.updated` projection: model, instructions revision, voice type/name/rate, transcription model, VAD settings and tool digest. A stale or partial ACK cannot release an opening or response.
3. Sidecar partials can pause local playback while the floor decision is unresolved. Only a committed Voice Live final plus provider configuration ACK can compile the next EmotionalOS/RelationalOS decision and authorize `response.create`.
4. Execute tools through the existing server authority and return function outputs with the original call ID. Tool results do not bypass the response generation gate. Cancellation invalidates late tool continuations.
5. On interruption, stop browser playback first, retain played samples, send `response.cancel` and the matching history truncation, discard late audio by response ID, then wait for the terminal event. A backchannel decision may resume only audio still owned by the same response and session epoch.
6. End, revocation, membership change, release/source change, slow client, provider error and deadline close both Voice Live and the sidecar once. There is no automatic reconnect or engine fallback. A new engine requires a new explicit call attempt.

Taxila's spoken ACK is not adopted. In Taxila it is a graded-answer cue with lesson-specific timing and correctness guards. Here, “ACK” means an exact provider configuration acknowledgement; ordinary spoken acknowledgements remain model output after final-turn authority.

## Cost and evidence

Reserve the existing per-user/per-organization slot and full maximum seconds before opening either upstream. Add purpose `voice_live` and bind the owned WebSocket session to the call record. A pre-handshake rejection can release capacity; timeout or ambiguous allocation remains uncertain. No fallback call may reuse the reservation.

Persist sanitized `response.done` text/audio token quantities, Speech output duration/bytes when reported, model tier, voice name, API version and a dated rate-card reference. Voice Live pricing can include its model tier and Azure Speech output; absent components keep estimated cost **Unknown**. Admission seconds remain a safety allowance, not an invoice.

Extend the voice evidence manifest with engine, model, API version, exact voice object, rate decision and source turn, session tuple digest/ACK, sidecar version, first server audio, first browser playout, played samples, cancellation/truncation result, token quantities and terminal state. Capture assistant output for the existing blind A/B workflow. Compare current Realtime against Voice Live Diya and Arjun on matched English/Hindi/Hinglish fixtures; do not infer a winner from duration.

## Implementation map

- `lib/voice/live-voice.ts`: strict profile parser and Taxila preset → Voice Live voice mapping.
- `lib/platform/agents.ts` and editor controls: version, display and freeze the selection; label it evaluation-only.
- `lib/voice/voice-live-session.ts`: provider-specific session/ACK projection and event normalization.
- `lib/voice/voice-live-authority.ts`: single-use ticket bound to agent/release/context/tool/attempt digests.
- `lib/voice/voice-live-gateway.ts`: upstream WebSocket, PCM fan-out, tool loop, turn scheduler, backpressure, cancellation and durable finalization.
- `lib/voice/voice-live-browser.ts`: 16 kHz capture, framed PCM playback and played-sample ledger. Reuse pure capture/playback pieces from `continuous-speech-browser.ts` and `public-agent/browser.ts`; do not fork authority logic into React.
- `lib/voice/diagnostics.ts`, `lib/public-agent/evidence.ts`, evaluation audio manifests and Usage service: add engine-specific evidence and accounting without raw provider payloads.
- `app/api/voice/connect`, voice gateway routing and `components/voice-studio.tsx`: issue the selected transport and show requested versus provider-acknowledged voice. Public deployment support follows private proof and uses the same adapter.

## Required tests and rollout gates

Offline tests must cover strict legacy-compatible parsing; exact Diya/Arjun mapping; Voice Live session schema; rate mapping; no native-`diya` substitution; exact tuple ACK; final-versus-sidecar authority; GroupAI/relationship/tool fences; reordered and duplicate events; frame/output/backpressure limits; stop before/during allocation; late audio/tool discard; played-ms truncation; usage unknowns; revocation; and absence of silent fallback.

Then run bounded evidence in order:

1. configuration-only Voice Live handshake for each exact voice, with no response;
2. Listen & type opening and one reply, verifying tuple ACK, tools disabled/enabled as expected, artifact and close;
3. matched prerecorded English/Hindi/Hinglish microphone fixtures with interruption and names/numbers;
4. physical-device calls with sidecar floor decisions and browser playback evidence; and
5. concealed human listening against current Realtime and the standalone audition.

Only after these pass may a reviewed agent version select Voice Live for internal preview. Public release additionally needs hosted WSS, managed identity, capacity/load, retention, cost and rollback gates. No result may be described as Taxila parity, a preferred voice, native Hinglish, emotional understanding or production readiness without the matched listening and behavior evidence.

## Cascade contingency

If the exact DragonHD names are unavailable in Voice Live or controlled listening rejects that path, build an explicit cascade session: current continuous Speech final → server-owned Azure text turn/tool loop → committed reply text → `compileTaxilaSpeech` → streaming Speech SDK PCM → browser ledger. Store the reply before synthesis and never speak speculative/tool markup. Use SDK synthesis callbacks/output streams with byte and time caps; the current audition buffers a complete WAV and is not a live adapter.

Cascade gives exact SSML, Devanagari spans and deterministic text/audio pairing, but adds sequential endpointing, text-model and TTS latency. Clause prewarm can reduce delay only after authoritative text exists; synthesizing speculative clauses risks speaking words later revoked by safety or tools. It also duplicates the Realtime conversation/tool state machine. Treat it as a measured alternative, not an automatic fallback.

## Source and license boundary

Taxila is user-owned but the audited tree has no repository license and its package is private. Retain commit-pinned attribution for the small compiler/preset port and obtain explicit ownership/licensing confirmation before broader distribution. Do not copy its educational lexicons, transliterator, WebSocket protocol, child models, ACK assets or corpus. Azure voice/model availability and commercial use remain governed by Microsoft service terms. Selecting the same documented voice name does not establish acoustic, behavioral or product parity with Taxila.
