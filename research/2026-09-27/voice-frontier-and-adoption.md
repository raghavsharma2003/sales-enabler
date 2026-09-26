# Voice frontier and adoption — Indian voice agents

**Research date:** 2026-09-27 (Asia/Kolkata)  
**Scope:** Current first-party documentation, primary repositories and primary model papers for Azure Voice Live/Foundry audio, Sarvam, Fish Speech, Cartesia, Deepgram, Pipecat, LiveKit and a small set of licensed open speech components. No account, provider key, dependency install, live call or model invocation was used.

## Decision boundary

The product may use **Azure as the only paid AI provider**. The existing free Maya profile is already proven for bounded evaluation. It must remain an explicitly selected evaluation profile; it is not a paid fallback. No Sarvam, Fish, Cartesia, Deepgram or LiveKit Cloud call should be added to the product’s runtime without a new budget and provider-approval decision. This memo uses those products to identify adapter contracts and testable capabilities only.

The Azure account’s actually deployable models, regions, quotas, grant coverage and current deployment names are **unknown until the root agent inspects the signed-in Azure/Foundry resources**. Public catalog availability is not evidence that this workspace can deploy a model.

## What changed in the frontier

The most useful distinction remains **native realtime audio** versus **a streaming cascade**:

| Shape | Audio path | What the foundation owns | What the application still owns |
|---|---|---|---|
| Native realtime | Audio → one realtime model → audio | Audio understanding, response generation, speech output, often server-side turn detection | Tool contract, transcript/evidence capture, interruption reconciliation, business state, consent, QA, provider/version pinning |
| Azure half-cascade | Audio → Azure STT/turn signals → Azure text/tool model → Azure TTS | Azure speech recognition, text reasoning and speech synthesis, with explicit boundaries | Same application controls plus stage timing and transcript checks |
| Provider-neutral cascade | VAD/turn model → STT → text model/tools → TTS | Each acoustic and language model’s learned behavior | Cancellation, buffering, script normalization, entity correctness, state and replay |

“Realtime” means an open bidirectional stream and early partial output; it does not guarantee a short end-to-end response. “Streaming” means incremental chunks; a stream can still wait too long for endpointing, model generation or playback buffering. No vendor latency slogan is accepted as a product claim here. Every candidate must be measured on the same Indian/telephony corpus for first audio, first usable word, completed-turn response, p50/p95 endpointing, interruption cutoff and task correctness.

## Azure: the only approved paid route

### Voice Live and Azure realtime audio

Microsoft’s Voice Live API is a WebSocket interface over Foundry Tools. It requires a Microsoft Foundry resource or Azure Speech in Foundry Tools resource; Microsoft recommends Foundry for full feature availability. Entra authentication is recommended, with `Cognitive Services User` and `Foundry User` RBAC roles and an `https://ai.azure.com/.default` token. API-key authentication is also documented. The how-to currently shows `wss://<resource>.services.ai.azure.com/voice-live/realtime?api-version=2026-04-10` (older resource hostname also documented); Microsoft’s release notes say Voice Live API `2026-07-15` is generally available and is the default service version used by SDKs, so the root agent must verify the version supported by the actual resource. [Voice Live how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to) · [Speech release notes](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/releasenotes)

Publicly listed Voice Live models include `gpt-realtime-2.1`/`gpt-realtime-2.1-datazone` (preview), `gpt-realtime`, `gpt-realtime-datazone`, `gpt-realtime-1.5`, `gpt-realtime-1.5-datazone`, `gpt-4o`, `gpt-4.1`, GPT-5 family models, `gpt-5.6-terra`, `gpt-5.6-luna`, `phi4-mm-realtime` (preview), and `azure-realtime`. Models are fully managed by Microsoft in Voice Live; there are no weights to host. `gpt-5.5`, `gpt-5.4-mini` and `gpt-5.4-nano` are documented as tested but not pre-deployed and require BYOM deployment in the Foundry resource. [Voice Live overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live)

The Azure Realtime API page gives named releases: `gpt-realtime` (`2025-08-28`), `gpt-realtime-mini` (`2025-10-06`/`2025-12-15`), `gpt-realtime-1.5` (`2026-02-23`), `gpt-realtime-2` (`2026-05-07`), `gpt-realtime-translate` (`2026-05-06`), `gpt-realtime-whisper` (`2026-05-06`) and `gpt-live-transcribe` (`2026-07-29`). These use the GA `/openai/v1` endpoint and can be accessed over WebSocket, WebRTC or SIP after a model deployment. [GPT Realtime audio](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio)

For Indian language work, Microsoft lists Hindi, Kannada, Marathi, Tamil and Urdu among the supported `gpt-realtime`/`gpt-realtime-mini` languages, while warning that unlisted languages may return low-quality results. Voice Live’s `azure_semantic_vad_multilingual` supports English, Spanish, French, Italian, German, Japanese, Portuguese, Chinese, Korean and Hindi for filler-word handling. Azure documents `interrupt_response` and optional `auto_truncate`; semantic VAD can reduce false barge-in from fillers, but that must be verified for Hinglish, overlap and telephony noise. [Voice Live language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-language-support) · [Voice Live how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to)

The `azure-realtime` model uses dedicated native voices. The documentation names `aarti` as an `en-IN` Indian-accented English voice; the September 2026 release notes say 12 native voices are now available, including Aarti, Andrew, Ava, Denise, Diya, Elsa, Florian, Francisca, Meera, Xiaoxiao, Ximena and Yunxi. This establishes an available voice identifier, not a Hinglish naturalness result. [Voice Live how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to) · [Speech release notes](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/releasenotes)

Voice Live also exposes a cascaded mode: non-multimodal models use Azure Speech-to-Text input and Azure Text-to-Speech output by default, with `azure-speech` or preview `mai-transcribe-2` available for transcription. This gives the application a transcript and tool boundary while retaining one Azure bill and deployment policy. Azure lists Voice Live pricing by model tier and approximate audio-token accounting (~10 input audio tokens/second and ~20 output audio tokens/second for Azure OpenAI families), but the exact resource rate and grant coverage must be checked in the account. [Voice Live overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live)

### Azure open and native-audio models

`phi4-mm-realtime` is a managed Voice Live preview model with Azure TTS output. The documented supported languages are Chinese, English, French, German, Italian, Japanese, Portuguese and Spanish; **Hindi is not listed**. It supports only `azure-speech` for input transcription. Therefore it is not an Indian-language first choice without a controlled test. [Voice Live language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-language-support)

`Phi-4-multimodal-instruct` is an open Microsoft model in the Foundry catalog with text, image and audio input and text output, and its public model card states an MIT license. It is not a speech-in/speech-out realtime agent by itself; application code must provide streaming audio handling and speech output. The catalog lists 24 supported languages but does not establish Hindi quality or code-switched turn behavior. Treat the MIT model license as applying to the model card’s model, while checking the exact Azure service terms and any third-party components before shipping. [Foundry model catalog](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure?view=azureml-api-2) · [Phi-4 multimodal model card/license](https://huggingface.co/microsoft/Phi-4-multimodal-instruct)

`gpt-realtime-*`, `gpt-realtime-translate`, `gpt-realtime-whisper` and `gpt-live-transcribe` are hosted proprietary Azure services, not open weights. Their access is deployment- and resource-permission-dependent. The project should record the exact model ID/version, deployment type, region, API version, voice, VAD settings and billable usage receipt at session start; never infer availability from Microsoft’s global catalog.

## Indian-language and vendor speech foundations (reference only)

### Sarvam — strongest Indian-language cascade reference

Current Saaras IDs are `saaras:v3` (default/recommended) and `saaras:v4` (latest). Both support transcription, translation, verbatim, transliteration and code-mixed output across 22 Indian languages plus English. v4 adds Global English and up to 50 keyterms on REST/Batch; the streaming endpoint does not accept v4 keyterms. Sarvam documents WebSocket streaming, 8 kHz and 16 kHz inputs, language hints, speech-start/end events and manual flush. A separate beta `saaras:v3-realtime` is described as superseding the legacy streaming endpoint for true partial transcripts and mid-call reconfiguration. [Saaras model page](https://docs.sarvam.ai/api/getting-started/models/saaras) · [Sarvam streaming STT](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api)

Sarvam’s streaming docs provide an actionable interruption contract: `vad_signals=true` emits `START_SPEECH`/`END_SPEECH`; the app should stop TTS immediately on `START_SPEECH`. The high-sensitivity preset is documented as approximately a 64 ms silence boundary at 16 kHz, but that is a configuration description, not an end-to-end measured latency result. The application must measure false barge-ins and missed starts on Indian telephony audio.

Bulbul v3 (`bulbul:v3`) is the current managed TTS model: 30+ voices, 11 languages (10 Indian plus Indian English), REST/HTTP streaming/WebSocket, 8/16/22.05/24 kHz output and 0.5–2.0 pace. Sarvam explicitly warns that Romanized Indic input degrades quality and recommends native script for Indic words; v3 has no SSML, and pitch/loudness controls are v2-only. This is an important application opportunity: normalize Hinglish into mixed native/Latin text before TTS and keep pronunciation dictionaries/business names separate from the model’s language choice. [Bulbul model page](https://docs.sarvam.ai/api/getting-started/models/bulbul)

Managed Sarvam requires an API key and sends audio to Sarvam over HTTPS. Self-hosted Saaras/Bulbul is an AWS SageMaker subscription and customer VPC deployment, with instance-hour, software and autoscaling obligations; it is not an open-weight license claim. Sarvam’s commercial licensing page says generated output is production-licensed when generated on an account with credits, while models, voices and software remain Sarvam-controlled. [Managed vs self-hosted](https://docs.sarvam.ai/api/self-hosted/hosted-vs-self-hosted) · [Commercial licensing](https://docs.sarvam.ai/api/getting-started/commercial-licensing)

### Cartesia — current TTS and turn-aware STT reference

Sonic 3.6 (`sonic-3.6`) became generally available with a dated stable snapshot `sonic-3.6-2026-08-27`. Cartesia lists 44 languages including English, Hindi and other Indian languages, and explicitly documents Hinglish support for Hindi transcripts in Latin script. The API supports a floating stable alias, a dated immutable snapshot, or a preview alias; production evaluation should use the dated snapshot. This is a vendor capability statement, not an independent Hinglish score. [Sonic 3.6 model page](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)

Cartesia’s TTS WebSocket is genuinely incremental: send text with a context ID and receive audio chunks, flush/done events and optional word/phoneme timestamps; a context can be canceled on interruption. It requires an API key or short-lived access token and a pinned API version. [Cartesia TTS WebSocket](https://docs.cartesia.ai/api-reference/tts/websocket)

Ink 2 (`ink-2`) is a stable streaming STT model released 2026-09-17. Cartesia documents English, French, Hindi, Japanese and Spanish, with model-native turn events `turn.start`, `turn.update`, `turn.eager_end`, `turn.resume` and `turn.end`. The manual STT WebSocket accepts small audio chunks (for example 100 ms) but has no turn detection; use the turn-aware endpoint for agents. These events are a useful adapter contract, but no public India/Hinglish WER or p95 interruption measurement was found. [Ink 2 model page](https://docs.cartesia.ai/build-with-cartesia/stt/latest) · [Cartesia realtime STT](https://docs.cartesia.ai/api-reference/stt/websocket)

### Deepgram — explicit endpointing and hosted/self-hosted choice

Flux Multilingual (`flux-general-multi`) is a single streaming STT model for English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian and Dutch. It supports language hints, automatic detection, code-switching and model-integrated turn signals; configurable `eot_threshold`, `eager_eot_threshold`, `eot_timeout_ms` and force-end-turn controls are documented. The hosted API uses the normal API key and WebSocket; an EU endpoint is listed. [Flux Multilingual language prompting](https://developers.deepgram.com/docs/flux/language-prompting) · [Flux feature overview](https://developers.deepgram.com/docs/flux/feature-overview)

Deepgram documents a self-hosted `flux-general-multi` release, but access is enterprise-gated: contact Deepgram to receive model files and authorize container downloads. Flux STT needs a dedicated Ampere-or-newer NVIDIA GPU (A10/L4/L40S/A100/H100/Blackwell); it cannot share an Engine node with Nova or TTS. A license server or license proxy remains required. This is licensed commercial software, not an open model. [Flux self-hosted](https://developers.deepgram.com/docs/flux-self-hosted) · [Self-hosted deployment environments](https://developers.deepgram.com/docs/self-hosted-deployment-environments)

Deepgram’s TTS side is separate: Flux TTS is English-only, while Aura-2 covers seven non-Hindi languages. Thus Deepgram’s current evidence is most relevant to Hindi/English **input and turn detection**, with Azure or another approved output layer required for Hindi TTS. [Deepgram TTS models and languages](https://developers.deepgram.com/docs/tts-models-languages-overview)

### Fish Speech — impressive research/runtime, unsuitable for unlicensed production

The current repository identifies Fish Audio S2 Pro as a 4B multilingual TTS model, with Hindi among a long language list, multi-speaker/multi-turn generation and inline prosody/emotion tags. The repo reports RTF and TTFA on one H200 setup, but those are model authors’ measurements and must not be transferred to API p95, India network, telephony or perceived turn latency. Self-hosting requires downloading weights and at least 24 GB VRAM in the official inference guide. [Fish Speech repository](https://github.com/fishaudio/fish-speech) · [Fish inference guide](https://github.com/fishaudio/fish-speech/blob/main/docs/en/inference.md) · [S2 technical report](https://arxiv.org/abs/2603.08823)

The decisive license constraint is the **Fish Audio Research License**, last updated 2026-03-07: research and non-commercial use is royalty-free, but any commercial use—including a paid product, hosted service, API or internal business operation—requires a separate written Fish license. Outputs are not a substitute for that permission. Do not place Fish S2 weights or the Fish runtime in a sellable product unless legal obtains the commercial license. [Fish Audio Research License](https://github.com/fishaudio/fish-speech/blob/main/LICENSE)

## Pipecat, LiveKit and licensed open components

Pipecat is a provider-neutral voice-agent framework under BSD-2-Clause. Its current code documents interruptible frames, explicit interruption broadcast, transport adapters and provider integrations. It is a runtime/control-plane option, not a speech foundation. [Pipecat repository/license](https://github.com/pipecat-ai/pipecat)

Pipecat’s Smart Turn v3.2 is an open BSD-2-Clause native-audio turn detector. It is designed to run after a lightweight VAD such as Silero, using up to roughly the latest 8 seconds of a turn; the repository says datasets, training scripts and weights are open. Pipecat documents 23-language support and local CPU inference. This is a credible local endpointing control for an Azure STT/TTS cascade, subject to measuring Hindi/Hinglish and telephony performance. [Smart Turn repository](https://github.com/pipecat-ai/smart-turn) · [Smart Turn docs](https://github.com/pipecat-ai/docs/blob/main/api-reference/server/utilities/turn-detection/smart-turn-overview.mdx)

LiveKit server and Agents SDK are Apache-2.0; LiveKit provides WebRTC, SIP, streaming pipelines, provider plugins, interruption controls, a local `v1-mini` turn detector and a hosted `v1` detector. Its default tuning exposes endpoint min/max delay, adaptive versus VAD interruption, false-interruption recovery and optional preemptive generation. LiveKit’s `v1` inference is a LiveKit Cloud service; its model materials carry a separate LiveKit Model License that restricts standalone use to LiveKit Agents. Use LiveKit OSS as transport/orchestration if desired, and review model-license terms before relying on hosted or bundled turn models. [LiveKit Agents turn tuning](https://docs.livekit.io/agents/logic/turns/tuning/) · [LiveKit turn detector](https://docs.livekit.io/agents/logic/turns/turn-detector/) · [LiveKit server license](https://github.com/livekit/livekit) · [LiveKit model license](https://github.com/livekit/agents/blob/main/MODEL_LICENSE)

For minimal local acoustic control, OpenAI Whisper’s code and model weights are MIT, multilingual and suitable for batch or chunked streaming wrappers, but the official implementation processes sliding 30-second windows and does not provide turn-taking semantics. Silero VAD is MIT, supports streaming and 8/16 kHz ONNX models, and has no key or registration requirement. These components can improve local segmentation and offline transcript fixtures; they do not prove Indian code-switch accuracy or replace a production STT. [Whisper repository](https://github.com/openai/whisper) · [Silero VAD repository](https://github.com/snakers4/silero-vad)

Piper is not a clean default for a sellable route. The archived Rhasspy repository lists Hindi voices, but voice model licenses differ and public discussions identify licensing ambiguity around some voice/data lineage. Treat individual voice cards and upstream phonemizer licenses as required legal review; do not infer commercial permission from the Piper runtime’s MIT label. [Piper voice list](https://github.com/rhasspy/piper/blob/master/VOICES.md) · [Piper licensing discussion](https://github.com/rhasspy/piper/discussions/271)

## Where the application can improve versus the foundation

The following are application-level improvements that remain valuable even when the speech foundation changes:

1. **Hinglish normalization:** retain raw audio and raw transcript, detect language/script, preserve entity spans, normalize native/Latin Hindi for the LLM, and synthesize Indic words in native script where the selected TTS requires it. Never use translation as the authoritative value for rupees, dates, phone numbers, product names or account IDs.
2. **Keyterm and pronunciation control:** maintain per-campaign keyterms (company, product, person, place, plan, rupee amount) and provider-specific pronunciation dictionaries. Compare entity accuracy separately from aggregate WER.
3. **Turn state machine:** distinguish `speech_start`, `eager_end`, `final_end`, `turn_resumed`, `barge_in`, `tts_cancel`, `audio_heard` and `audio_remaining`. Cancel speculative LLM/TTS work on interruption and commit only the words the caller actually heard.
4. **Grounded relational behavior:** bind each call to an approved identity, product, goal, consent record, source evidence, timezone and escalation policy. Speech quality cannot repair a wrong customer-to-product join or an unsupported claim.
5. **Evidence and evaluation:** store model/provider/API versions, audio codec, VAD parameters, transcript variants, tool calls, timing marks, human review and business outcome. Convert a failure into a regression test before changing prompts or routing.
6. **Delivery controls versus emotional inference:** pace, pause, voice, volume and emotion tags are delivery controls. They do not establish that the caller is angry, anxious or comforted. Use caller words, explicit correction and human escalation for sensitive cases.

Foundational limits require model or provider changes: base ASR errors in noisy 8 kHz Hindi, unsupported language coverage, missing prosodic cues, poor pronunciation priors, model-native endpointing errors and generation artifacts. Prompts, RAG and UI can reduce the impact but cannot claim to fix the acoustic model.

## Three implementation choices within the existing provider-neutral stack

### 1. Azure Voice Live native audio — primary paid implementation

Use the current Voice Live adapter with a root-approved `gpt-realtime*` deployment or `azure-realtime`, `azure_semantic_vad_multilingual`, `interrupt_response=true`, and `auto_truncate=true` after verifying semantics. Keep application-side transcript capture because Azure notes input transcription may be asynchronous and can differ from the realtime model’s audio interpretation. Record every session’s deployment/version/region and usage receipt. This is the smallest architectural move and the only native-audio route consistent with the present paid-provider rule.

### 2. Azure half-cascade — explicit speech/tool/evidence boundary

Use Azure Speech or MAI Transcribe for input, an Azure text model for tools and business logic, and Azure TTS or a Voice Live non-multimodal configuration for output. Put endpointing and interruption events behind the existing provider-neutral adapter. This increases stage count but makes transcript review, entity correction, tool auditing, replay and provider-version pinning easier. Use the same Indian corpus to compare `azure-speech` versus `mai-transcribe-2` and native audio; do not infer quality from model names.

### 3. Azure text + local licensed control components — bounded control experiment

Keep Azure as the only paid inference provider while running Silero VAD and/or Pipecat Smart Turn locally under their MIT/BSD licenses. Feed finalized turns to Azure STT/text/TTS or Azure Voice Live where suitable. This isolates endpointing and interruption experiments from Azure’s server VAD and avoids adding a paid non-Azure fallback. It adds CPU operations, packaging and license tracking, and must be evaluated for Hinglish pauses, backchannels, 8 kHz telephony and overlap before any default routing.

None of these choices authorizes Fish, Sarvam, Cartesia, Deepgram or LiveKit Cloud runtime spend. They only define the interfaces that a later approved provider adapter would need to satisfy.

## Required measurement gate

For a fixed script, knowledge snapshot, codec, network region and model/version, report:

- first audio byte and first usable word;
- p50/p95 end-of-turn delay and premature/late endpoint rates;
- p50/p95 barge-in detection and playback cut-off;
- transcript WER/CER plus language-switch-point WER;
- entity accuracy for names, places, products, rupees, dates, IDs and phone numbers;
- `audio_heard`/`audio_remaining` reconciliation after interruption;
- task completion, escalation correctness, repair success and human naturalness ratings;
- per-call Azure usage and cost, with no fallback spend hidden in the aggregate.

Do not publish “sub-100 ms,” “human-like,” “native Hinglish,” “emotion-aware” or “lower cost” as product claims until this gate passes on a consented Indian/telephony corpus. Vendor-published latency, quality and case-study numbers remain claims tied to their own setup.

## Source set (18 primary sources checked 2026-09-27)

1. [Microsoft Voice Live API overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live)
2. [Microsoft Voice Live API how-to and authentication](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to)
3. [Microsoft Voice Live language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-language-support)
4. [Microsoft Azure GPT Realtime audio models](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio)
5. [Sarvam Saaras model page](https://docs.sarvam.ai/api/getting-started/models/saaras)
6. [Sarvam streaming STT and barge-in guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api)
7. [Sarvam Bulbul model page](https://docs.sarvam.ai/api/getting-started/models/bulbul)
8. [Sarvam managed versus self-hosted](https://docs.sarvam.ai/api/self-hosted/hosted-vs-self-hosted)
9. [Cartesia Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)
10. [Cartesia Ink 2](https://docs.cartesia.ai/build-with-cartesia/stt/latest)
11. [Deepgram Flux Multilingual language prompting](https://developers.deepgram.com/docs/flux/language-prompting)
12. [Deepgram Flux self-hosted deployment](https://developers.deepgram.com/docs/flux-self-hosted)
13. [Fish Speech S2 repository and inference guide](https://github.com/fishaudio/fish-speech)
14. [Fish Audio Research License](https://github.com/fishaudio/fish-speech/blob/main/LICENSE)
15. [Pipecat Smart Turn v3.2](https://github.com/pipecat-ai/smart-turn)
16. [LiveKit turn detection and interruption tuning](https://docs.livekit.io/agents/logic/turns/tuning/)
17. [OpenAI Whisper MIT repository](https://github.com/openai/whisper)
18. [Silero VAD MIT repository](https://github.com/snakers4/silero-vad)

The memo deliberately avoids the larger vendor/case-study source set in the 2026-09-22 notes.

## Dated workflow-product delta — Vapi, ElevenLabs Agents and Bolna

**Refresh date:** 2026-09-27. **Cutoff:** compared with the 2026-09-22 workflow research. **Evidence rule:** the entries below are current first-party pages. A changelog date before 2026-09-22 is recorded as an existing current capability, not as a post-cutoff release. No account, API key, paid call or authenticated dashboard was used.

### Vapi

Vapi’s current “What’s New” page has no dated Vapi entry after September 21, 2026. The September 21 entry documents OpenAI `serviceTier: fast` for GPT-5.6/GPT-5.5 and provider request IDs in logs for BYOK models. Those are documented capabilities, but neither changes this product’s Azure-only paid-provider rule nor proves an Azure deployment is available in the account. **[D, current page; no post-2026-09-22 Vapi release established]** [Vapi What’s New](https://docs.vapi.ai/whats-new)

The same current page documents the immediately preceding workflow primitives: Composer-created simulations (September 14); chat tests against unsaved drafts, duplicate simulation suites and model-retirement notices (September 7); outbound campaigns (August 31); draft/publish assistant and tool version snapshots with rollback, artifact-upload webhooks and Azure region pinning (August 17); and VAD transition timing in call logs (July 13). These improve deploy/review/evidence handling and expose useful adapter concepts, but the dates predate the cutoff and therefore are not new findings for a strict post-September-22 delta. **[D, current page; pre-cutoff dates]** [Vapi What’s New](https://docs.vapi.ai/whats-new)

Vapi’s current page does not establish durable cross-call memory semantics, a provider-neutral feedback/extraction schema, a new interruption policy, or a new public all-in cost after September 22. Simulation results, VAD transitions, artifact callbacks and request IDs remain useful fields to mirror in the product’s own evidence ledger; Vapi’s “Model Intelligence” cost/latency/quality comparisons are vendor telemetry, not a substitute for the project’s same-corpus measurement. **[U]**

### ElevenLabs Agents

The current changelog has no dated ElevenAgents release after September 21, 2026; the September 23 entry is Image & Video only. September 21 documents parallel tool calls (`enable_parallel_tool_calls`, default `true`), Slack alerting, and cursor-paginated phone-number search. September 14 documents queueing at an agent’s concurrency limit with custom hold audio, `queue_status` events and test-result metadata identifying the agent version and whether draft changes were included. **[D, current pages; no post-2026-09-22 ElevenAgents release established]** [September 21 changelog](https://elevenlabs.io/docs/changelog/2026/9/21) · [September 14 changelog](https://elevenlabs.io/docs/changelog/2026/9/14)

The September 7 entry documents workspace-wide conversation triage tickets, repeatable dynamic-variable filters for conversation search, and Twilio answering-machine detection (`enable` for an early verdict or `detect_message_end` to wait for the greeting). This is useful for campaign feedback routing, personalization filters and voicemail disposition, but it does not define consent policy, batch deduplication, or Hindi/Hinglish accuracy. **[D, current page; dated pre-cutoff]** [September 7 changelog](https://elevenlabs.io/docs/changelog/2026/9/7)

The current August 24 changelog entry documents the CLI for agents-as-code, file synchronization, branch management and test execution; Procedures are generally available for free-form or structured task guidance; triage tickets support QA comments and turn comments; and `context_usage` reports prompt tokens and model context limits after turns. These are strong deploy/share/evaluation and context-observability primitives, while the pages reviewed do not establish an application-controlled durable customer memory store or a release approval policy equivalent to the product’s own ledger. **[D for primitives; U for durable memory and our approval contract]** [August 24 changelog](https://elevenlabs.io/docs/changelog/2026/8/24)

ElevenLabs Guardrails 2.0 is documented as Alpha. Built-in Focus, Manipulation and Content guardrails are included; custom guardrails run a lightweight model per agent response and add usage-based LLM cost. Streaming mode can start output before the guardrail result; blocking mode is documented as typically adding about 200–500 ms, and retry can perform up to three extra generations/evaluations. These are vendor-documented execution and cost rules, not a measured product latency result. **[D; cost/latency claim tied to vendor docs]** [ElevenLabs Guardrails](https://elevenlabs.io/docs/eleven-agents/best-practices/guardrails)

### Bolna

Bolna’s September 2026 changelog is the only reviewed page with several dated changes after the previous workflow note. On September 23, `interruptible_hangup_message` lets a caller interrupt an agent’s goodbye, cancel the hangup and ask another question; it is off by default and applies only when the agent ends through the hangup prompt, not timeout, transfer or voicemail hangups. This is a concrete turn-management edge case to include in a provider-neutral contract. **[D, release dated 2026-09-23]** [Bolna September 2026 changelog](https://www.bolna.ai/docs/changelog/september-2026)

The same changelog documents Soniox `tts-rt-v2` over a persistent WebSocket, `keywords` support across seven transcriber providers, `context` support for AssemblyAI/Soniox/Sarvam, AssemblyAI Universal-3 models, first-class extraction-category APIs with category-level model selection, an agent-level `call_summary_enabled` toggle, a migration away from legacy extraction fields (retirement dated September 18), and more conservative mid-call language switching. These are provider/configuration and post-call evidence improvements; Soniox’s language and streaming descriptions are vendor claims and do not establish Indian naturalness or end-to-end latency. **[D, dated where stated; U for quality]** [Bolna September 2026 changelog](https://www.bolna.ai/docs/changelog/september-2026)

Bolna’s current Extractions page documents real-time execution webhooks, status filters, call summaries, categorical or free-text extraction templates, category-level model selection, reusable extraction templates, and testing against sample or real transcripts. One category runs its extractions in one LLM pass according to the page. This helps feedback extraction and CRM sync, but the page does not establish an end-to-end regression suite, reviewer approval, durable cross-call memory, source provenance or extraction accuracy. **[D for primitives; U for release governance, memory and quality]** [Bolna Extractions and webhooks](https://www.bolna.ai/docs/agent-setup/analytics-tab)

Bolna’s current public pricing docs describe three meters: provider speech/LLM/TTS usage, telephony minutes, and a flat $0.02/minute Bolna platform fee; connected provider accounts remove Bolna’s charge for that component. The page says exact costs are visible in execution history and volume pricing is negotiated. It does not provide a single all-in Indian per-minute guarantee, and the product’s Azure-only paid rule means this is reference evidence only. **[D for pricing decomposition; U for a forecast without the selected providers, ratios and plan]** [Bolna usage pricing](https://docs.bolna.ai/pricing)

Bolna’s September changelog also lists AWS Marketplace procurement tiers, but that documents procurement/billing access rather than a customer-operated runtime or a version-sharing model. The reviewed pages do not establish deploy/share semantics that would replace the product’s own approved-audience, version, attempt and reviewer ledgers. **[D for marketplace listing; U for self-hosted deploy/share and durable memory]** [Bolna September 2026 changelog](https://www.bolna.ai/docs/changelog/september-2026)

### Delta implications for this build

The refresh adds three testable contract ideas to the existing provider-neutral stack:

1. Preserve a version and draft identity on every test, publish, call and extraction result; where a vendor exposes a version ID, draft flag, branch or campaign ID, store it as an external reference rather than treating it as the product’s approval record.
2. Represent endpoint/termination events separately: speech start, eager/final end, goodbye interruption, answering-machine result, canceled hangup and actual call end. A provider’s “interruption enabled” setting does not imply the same behavior for goodbye, voicemail, transfer or timeout paths.
3. Treat summaries, sentiment, tickets and extractions as derived evidence. Retain the raw transcript/audio reference, source fields and reviewer decision; no reviewed Vapi, ElevenLabs or Bolna page establishes durable customer memory or validates extraction quality for Indian business calls.

These vendors remain comparators only. No new paid provider route, fallback, account or dependency is authorized by this refresh.

**Additional sources consulted (9 authoritative pages, checked 2026-09-27):** [Vapi What’s New](https://docs.vapi.ai/whats-new); [ElevenLabs September 21 changelog](https://elevenlabs.io/docs/changelog/2026/9/21); [ElevenLabs September 14 changelog](https://elevenlabs.io/docs/changelog/2026/9/14); [ElevenLabs September 7 changelog](https://elevenlabs.io/docs/changelog/2026/9/7); [ElevenLabs August 24 changelog](https://elevenlabs.io/docs/changelog/2026/8/24); [ElevenLabs Guardrails](https://elevenlabs.io/docs/eleven-agents/best-practices/guardrails); [Bolna September 2026 changelog](https://www.bolna.ai/docs/changelog/september-2026); [Bolna Extractions and webhooks](https://www.bolna.ai/docs/agent-setup/analytics-tab); [Bolna usage pricing](https://docs.bolna.ai/pricing).
