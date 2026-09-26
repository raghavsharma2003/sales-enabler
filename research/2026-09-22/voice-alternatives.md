# Voice platform alternatives for an India-first relational voice layer

**Research date:** 2026-09-22. **Scope:** Retell AI, LiveKit Agents, and Sarvam AI. These are complementary alternatives at different layers: Retell is a hosted voice-agent workspace and contact-center control plane; LiveKit is an open realtime transport/orchestration runtime; Sarvam is speech/translation/LLM/TTS technology optimized for Indian languages. That distinction matters for a platform that promises interchangeable providers: a provider adapter should not be confused with replacing the call-control, evaluation, and operator workspace.

## What each product actually lets a team do

### Retell: hosted orchestration plus business workspace

Retell’s documented workflow is unusually close to a deployable contact-center product. A team creates either a free-form single-prompt agent or a deterministic conversation-flow agent, starts from a template or a plain-English Conductor draft, runs free browser calls, then assigns the agent to a phone number for inbound/outbound traffic. Retell-managed numbers are documented as US/Canada only; Indian deployments therefore need imported numbers or SIP/custom telephony. [Quick start](https://docs.retellai.com/get-started/quick-start) (documented).

Its testing loop spans layers: LLM Playground for turn-by-turn tool/transition debugging; saved, graded simulation cases and batch regression runs; browser calls for real audio, latency, and interruption behavior; and phone calls for carrier audio, DTMF, and transfers. Custom-LLM and speech-to-speech agents are audio-only for testing, a material limitation when designing a provider-neutral abstraction. [Testing overview](https://docs.retellai.com/test/test-overview) (documented).

Retell also has a post-deployment quality loop: AI QA samples calls into cohorts, applies resolution criteria and metric thresholds, and exposes transcript evidence for hallucination, knowledge-base recall, latency, sentiment, overlapping speech, WER, tool-call accuracy, transition accuracy, and natural tonality. [AI QA](https://docs.retellai.com/ai-qa/overview) (documented). This is a strong blueprint for a platform-level eval contract, but these metrics are vendor-generated evaluations, not an independent benchmark.

For live operations, supervisors can follow a streaming transcript, inspect tool calls/node transitions/DTMF, silently listen, take over, steer with injected context, or end a call. Access is role-gated; takeover permanently stops the agent for that call. [Live Monitoring](https://docs.retellai.com/features/live-monitoring) (documented). This is the clearest business-workspace feature among the three sources, and a likely adoption wedge for Indian support teams.

Retell’s multilingual design is pragmatic rather than magical: choose an exact supported language set; ASR detects among that set, TTS selects matching pronunciation, and the agent replies in a selected language. The docs warn that cross-family multilingual recognition loses accuracy versus single-language routing, and recommend routing to a language-specific agent when the language is known. [Multilingual agents](https://docs.retellai.com/agent/multilingual) and [provider language matrix](https://docs.retellai.com/build/language-support) (documented). The matrix makes the portability boundary explicit: every language must be covered by both ASR and TTS, and combinations are constrained by model/provider support.

### LiveKit Agents: provider-neutral realtime runtime

LiveKit’s documented abstraction is a Python/Node.js agent joining a realtime room, with pluggable STT, LLM, TTS, realtime models, tools, handoffs, and RAG. Agents can run on LiveKit Cloud or self-hosted infrastructure; plugins and “Inference” provide multiple model-provider paths. It also includes WebRTC frontends and SIP telephony, so the same runtime can serve app, browser, and phone channels. [Agents introduction](https://docs.livekit.io/agents/) (documented).

The runtime exposes turn-taking as a first-class, swappable policy: context-aware turn detector, VAD, STT endpointing, realtime-LLM detection, or manual boundaries. Endpointing has configurable minimum/maximum delays, dynamic mode, interruption controls, and preemptive generation. The framework interrupts agent speech and truncates history to the audio the user actually heard. [Turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning/) (documented). This is valuable for a “relational” product because turn policy can be evaluated independently of the speech vendor.

For contact-center plumbing, LiveKit maps phone calls to SIP participants and routes them with trunks and dispatch rules; it supports DTMF, cold/warm transfer, secure trunking, region pinning, noise cancellation, and third-party SIP. The docs list Twilio, Telnyx, Plivo, Wavix, Sinch, didlogic, and Exotel as tested providers but explicitly limit that statement to compatibility testing. [Telephony introduction](https://docs.livekit.io/telephony/) (documented). Its documented telephony workflow also exposes the practical debug checkpoints a platform should implement: worker health, trunk credentials, dispatch-rule/agent-name matching, SIP participant attributes, room creation, and agent response, with provider and LiveKit logs when a call fails.

LiveKit’s observability is developer-facing rather than a turnkey supervisor console. Agent Insights combines transcript, tool calls, handoffs, traces, runtime logs, and recordings; session reports are available for self-hosted deployments. Per-turn metrics include transcription delay, end-of-turn delay, LLM TTFT, TTS TTFB, and end-to-end latency, with per-plugin usage/latency metrics and OpenTelemetry support. [Data hooks](https://docs.livekit.io/agents/ops/logging/) (documented). This is a strong substrate for building a vendor-neutral eval and operator product, but the business UI must be built.

### Sarvam AI: India-first speech technology, not the control plane

Sarvam’s documented model stack covers speech-to-text, speech translation, text translation, and TTS for Indian languages. Saaras is documented for 23 languages (22 Indian plus English), including transcribe, translate, verbatim, translit, and code-mix modes; it is positioned for 8 kHz telephony, accents, key-term prompting, and diarization. Bulbul supplies multilingual voices; the API supports language auto-detection and speaker choice. [Models](https://docs.sarvam.ai/api/getting-started/models) (documented; vendor claims, not independently measured).

The official LiveKit integration shows the intended workflow: install the Sarvam plugin, set `language="unknown"` or an Indic code, choose `transcribe` or speech-to-English `translate`, select Bulbul TTS, run locally in `dev`, and test with `console`. For turn-taking, Sarvam recommends `flush_signal=True`, `turn_detection="stt"`, and a documented `min_endpointing_delay=0.07`; it says the plugin handles VAD internally. The same page includes Hindi, Tamil, auto-detect, code-mix, troubleshooting, and production caveats. [Build a voice agent with LiveKit](https://docs.sarvam.ai/api/integration/build-voice-agent-with-live-kit) (documented; the ~70 ms value is a provider-documented approximation, not an independent measurement).

## Fit for the proposed platform

Adopt a layered architecture: keep conversation state, business tools, identity, policy, language routing, evaluation schemas, and operator actions in the platform; treat ASR, TTS, LLM, VAD/turn detector, telephony, and even orchestration runtime as adapters. Retell can be the rapid pilot/workspace path. LiveKit is the strongest long-term control point when custom turn-taking, multi-agent handoffs, SIP/Exotel, self-hosting, and provider swaps matter. Sarvam is a high-value Indian-language adapter to benchmark alongside at least one global ASR/TTS stack.

The first customer-facing workflow should be: language-aware inbound routing → short consent/context capture → relational agent with tool calls → deterministic escalation → warm human handoff → transcript, outcome, latency, and language-specific QA. Borrow Retell’s cohort QA and live takeover semantics even if the runtime is LiveKit. Build one shared eval suite: Hindi/Hinglish/Tamil code-mix, names/numbers, noisy 8 kHz audio, interruption/barge-in, silence, IVR/DTMF, transfer failure, and hallucinated policy answers.

## Pitfalls to validate before adoption

- “Multilingual” can lower ASR accuracy and misroute closely related languages; test per-language agents and explicit language selection against auto-detect.
- A provider switch changes endpointing, interim transcripts, pronunciation, barge-in, and latency distributions even when the LLM prompt is unchanged. Store raw audio/transcript/timing events for replay.
- Retell’s hosted workspace is operationally rich but its managed numbers are US/Canada only; Indian numbering, consent, recording retention, and carrier/SIP behavior need a real Exotel or local-carrier pilot.
- LiveKit gives control and portability but shifts supervisor UX, QA calibration, data retention, PII redaction, and incident tooling to the platform team.
- Sarvam’s language coverage is compelling, yet its docs do not establish independent WER, end-to-end latency, or human-likeness results for the target business domain. Measure these on representative Indian calls.

## Source level and evidence boundary

All claims above are **documented** from the official pages below. No authenticated product session, customer call, or independent benchmark was run, so **observed = none** and **measured = none independently**. Any number shown is labeled as a provider-documented value/claim.

Sources (14 official substantive pages):

1. Retell quick start — https://docs.retellai.com/get-started/quick-start
2. Retell testing overview — https://docs.retellai.com/test/test-overview
3. Retell multilingual agents — https://docs.retellai.com/agent/multilingual
4. Retell provider language matrix — https://docs.retellai.com/build/language-support
5. Retell AI QA overview — https://docs.retellai.com/ai-qa/overview
6. Retell live monitoring — https://docs.retellai.com/features/live-monitoring
7. LiveKit Agents introduction — https://docs.livekit.io/agents/
8. LiveKit turn-taking tuning — https://docs.livekit.io/agents/logic/turns/tuning/
9. LiveKit telephony — https://docs.livekit.io/telephony/
10. LiveKit data hooks/metrics — https://docs.livekit.io/agents/ops/logging/
11. Sarvam models — https://docs.sarvam.ai/api/getting-started/models
12. Sarvam + LiveKit voice-agent guide — https://docs.sarvam.ai/api/integration/build-voice-agent-with-live-kit
