# Browser voice adapters

Voice is disabled unless the server explicitly selects a provider. An API key alone never enables it. The installed browser adapters are OpenAI Realtime, Azure OpenAI Realtime and Gemini Live; the verified paid route uses the user's existing Azure resource with `gpt-realtime-2.1-mini` and `marin`. OpenAI and Gemini remain mocked/inactive alternatives, with no automatic fallback.

## Configuration

- `VOICE_PROVIDER=none` (or unset): disabled.
- `VOICE_PROVIDER=openai` and `OPENAI_API_KEY`: enable the reference adapter.
- `VOICE_PROVIDER=azure`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_REALTIME_DEPLOYMENT`: Azure OpenAI WebRTC. The endpoint accepts either the resource origin or its `/openai/v1` API base.
- `VOICE_PROVIDER=gemini` and `GEMINI_API_KEY`: Gemini Live native audio over a direct browser WebSocket.
- `VOICE_TRANSPORT=webrtc` for OpenAI/Azure or `websocket` for Gemini (or unset): browser audio. Other transports fail closed.
- `OPENAI_REALTIME_MODEL`: optional account-accessible model override; documented default `gpt-realtime-2.1`.
- `OPENAI_REALTIME_VOICE`: optional built-in voice; default `marin`.
- `AZURE_OPENAI_REALTIME_VOICE`: optional Azure Realtime voice; default `marin`.
- `GEMINI_LIVE_MODEL`: optional model override; default `gemini-3.8-live`. `GEMINI_LIVE_VOICE`: optional voice; default `Kore`.

The authenticated configuration endpoint reports only adapter availability and supported features. It does not probe account access or promise measured quality or latency. Interruption is a provider capability, not a verified quality benchmark. Azure Integrations **Check connection** only provisions and discards a short-lived token; it does not verify microphone audio.

For Azure, the Integrations page offers an explicit **Check connection** action. The authenticated same-origin `/api/voice/check` route requests a 10-second Realtime client secret for the configured deployment, verifies its presence, and discards it. The result reports provisioning readiness and the deployment name without any secret or upstream response body. It does not open a microphone or verify speech quality. An Azure 400/404 response asks the operator to confirm a supported Realtime deployment and region.

## Adapter boundary

`contracts.ts` owns provider-neutral capabilities, transcript and connection events. `server.ts` exchanges browser SDP for OpenAI using the server key. Azure first uses its server key to issue a short-lived Realtime client secret containing the session configuration, then POSTs raw SDP with that secret as a bearer token; neither credential reaches the browser. For Gemini it provisions a one-use token constrained to the model and session setup, with a one-minute new-session window; the long-lived key never reaches the browser. `client-adapters.ts` normalizes provider events. Unsupported provider and transport settings remain explicit errors; there is no silent fallback.

The browser talks to `/api/voice/connect` with a mode-specific authorized request. Authentication and same-origin validation occur before workspace context or provider access. WebRTC responses contain an SDP answer. Gemini responses contain a one-use, short-lived ephemeral token and constrained setup; no long-lived API key is returned. Provider HTTP errors are redacted.

## Operational boundaries

- This is an authenticated staff preview. Selecting a contact is not external customer identity verification. Do not expose this route as a customer-facing voice portal without separate identity and disclosure controls.
- Context is a start-of-session snapshot. Memory changes or revocations require ending and restarting the session; an active provider session cannot retroactively unreceive context.
- Transcripts are editable client-originated operator artifacts, not authenticated provider records or proof of authorization. Review them before relying on them. Saved sessions do not approve personal memories.
- Completed transcript events are ordered by provider item creation when available because transcription may arrive late. Downloaded times are local event receipt times, not speech timestamps or measured latency. Interrupted or unfinished speech may be absent.
- No provider tools execute actions. There is no telephony or live transfer. Human takeover closes the AI connection so staff can continue through their existing channel.
- Close, errors, denied microphone permission, expired connection setup and component unmount stop microphone tracks and close media/data connections. Pending permission prompts are guarded against late microphone activation. A disconnected WebRTC peer has an eight-second recovery window; after that the operator starts a new session. The UI retains the available transcript for review. Sessions have a 10-minute browser limit. Gemini uses 16 kHz PCM microphone frames and a 24 kHz speaker queue; provider interruption clears queued audio.
- Browser sessions also accept `inputMode: 'text'`. Azure/OpenAI create a recvonly audio transceiver and data channel; Gemini creates an output AudioContext and WebSocket. Neither path requests microphone permission. `sendText` queues typed utterances while a WebRTC response is active, then sends them one at a time after `response.done`, recording local transcript entries on delivery. It returns false when not live or when the bounded queue is full, so the editor can retain the unsent text. The provider's returned audio is played normally. This is an accessibility and testing mode, not evidence that microphone capture was verified.
- No raw audio recordings are persisted by this app. Audio is sent directly from the browser to the selected provider and is subject to that provider account's processing/retention settings.
- Production needs deployment-level provider spend controls, shared connection limits, and acceptance testing for real devices, accents, interruptions and noise. Browser control and session prompts are not a provider-enforced security boundary; no privileged tools are attached.

## Verified reference

Implementation checked against the official [OpenAI WebRTC unified interface](https://developers.openai.com/api/docs/guides/voice-webrtc), [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations), [Microsoft Foundry Realtime REST reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/realtime), [Gemini ephemeral token guide](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Gemini raw WebSocket guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket), and [Gemini Live API reference](https://ai.google.dev/api/live) on 2026-09-22.

`tests/voice.test.ts` and `tests/provider-voice.test.ts` use mocked transports and microphone APIs; they never make a paid provider call. Two completed browser Listen & type calls verified real Azure audio and saved draft-linked transcripts. The microphone request timed out before connecting, so microphone/STT/interruption behavior remains unverified. A separate bounded server WebSocket synthetic-audio smoke test produced `.impeccable/review/azure-voice-smoke.wav` and JSON. No grant-balance verification is performed.
