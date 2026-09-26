# Voice frontier and cost depth v4 — Indian business conversations

**Research date:** 2026-09-22. **Scope:** Fish Audio, Cartesia, Deepgram, Sarvam AI, Dialflo, Alchemic (`thealchemic.com`), and LiveKit, with Azure Realtime/Voice Live as the current paid-route baseline. This note extends the existing `voice-alternatives.md`, `voice-quality-benchmark.md`, and product-state constraints; it does not replace them.

**Evidence rule.** Technical behavior below is taken from first-party documentation or a primary paper. Vendor-reported quality, latency, language coverage, and case-study outcomes are labeled as claims. No competitor was called, no live audio was captured, and no independent benchmark was run. The product cannot claim better naturalness, Hinglish handling, interruption recovery, or cost until the same corpus and conditions are measured. All URLs were checked on 2026-09-22; page publication dates are included where the source exposes one.

## The architecture question

There are three useful families, and they answer different product needs.

| Family | Audio path | Strength | Cost and risk shape |
|---|---|---|---|
| Native realtime audio | Audio → one integrated realtime model → audio | Fewer application-level hops; the model can condition directly on audio and manage turn-taking internally | Billing may be audio tokens plus text/context; transcripts can be a separate asynchronous view; tools, deterministic auditing, voice/provider swaps, and replay can be less explicit |
| Cascaded streaming | VAD/turn detector → STT → text LLM/tools → TTS | Explicit transcript, tool boundary, provider adapters, text evals, and replaceable voices; each stage can stream | More hops and buffering; interruption must cancel STT/LLM/TTS and reconcile exactly what was heard; cost has several meters |
| Half-cascade | Realtime speech understanding → text/tool decision → separate TTS | Keeps some native listening/turn behavior while making output voice controllable | Loses some latency advantage and adds a TTS meter/handoff; state between native audio and external TTS must be defined |

LiveKit’s model documentation explicitly presents both an STT–LLM–TTS pipeline and direct speech-to-speech models. Its latency guidance says realtime models can need fewer calls and sound more realistic, while a well-tuned pipeline can be competitive; it also calls out less flexibility and less reliable tool calling as possible realtime trade-offs. A half-cascade preserves output control but gives back some latency advantage. These are architecture trade-offs, not proof that one family is better for this product. [LiveKit models overview](https://docs.livekit.io/agents/models/) (accessed 2026-09-22); [LiveKit latency guidance](https://livekit.com/blog/understand-and-improve-agent-latency) (accessed 2026-09-22).

An independent 2026 tutorial reports a similar engineering result in one implementation: native Qwen2.5-Omni had approximately 13 seconds time-to-first-audio in its local setup, while a streaming Deepgram–LLM–ElevenLabs cascade measured P50 time-to-first-audio of 947 ms (best case 729 ms). Those numbers are measurements of that paper’s models, hardware, network, prompts, and implementation—not general vendor benchmarks and not evidence against current native APIs. The useful conclusion is that streaming and pipelining dominate perceived responsiveness; a future comparison should record first audio, first usable word, end-of-turn, and interruption cut-off under identical conditions. [Qiu et al., *Building Enterprise Realtime Voice Agents from Scratch*, arXiv:2603.05413, 2026-03-05](https://arxiv.org/abs/2603.05413).

## Vendor depth

### Fish Audio — expressive TTS and an inexpensive/free evaluation lane

Fish’s streaming guide documents WebSocket TTS, dynamic voice switching, emotion injection by text annotation, speaking-speed control, and a `prosody` object with speed and volume. It recommends sending initial text promptly, reducing chunk size, using connection pooling, and buffering enough chunks to avoid gaps. These controls are useful for a cascade’s output layer, but the examples are controls/API patterns, not evidence that “happy,” “calm,” or “empathetic” acoustic output is perceived correctly by Indian callers. [Fish real-time streaming guide](https://docs.fish.audio/developer-guide/best-practices/real-time-streaming) (accessed 2026-09-22).

Fish’s June 23, 2026 announcement says S2.1 Pro is available as `s2.1-pro-free`, supports 83 languages, and is unlimited under a Fair Use Policy. The same announcement says this free lane has no SLA or latency guarantee, requests may be retained for model improvement, and some commercial cases (including products above $1M ARR) require contacting Fish. Treat it as a bounded prototype/evaluation lane, not a production cost guarantee. [Fish S2.1 Pro free API announcement](https://fish.audio/es/blog/s2-1-pro-free-api/?articleLocale=en) (published 2026-06-23; accessed 2026-09-22).

The published API price page sells credits rather than giving a single currency-per-minute rate: $9.99 for 40,000 credits, $29.99 for 150,000, $79.99 for 500,000, and $149.99 for 1,000,000. TTS is billed by effective character starting at one credit, with model multipliers possible; STT is 200 credits per audio minute and partial minutes round up; voice cloning is 2,000 credits per successful voice. The exact S2.1 multiplier, streaming behavior under concurrency, regional egress, retention, and commercial terms must be confirmed before using this in a cost forecast. [Fish Audio API pricing](https://fishaudio.org/en/pricing?product=api) (accessed 2026-09-22).

Fish’s S2 technical report is a primary research artifact, not a service SLA. It describes instruction-following, multi-speaker/multi-turn generation, a production-oriented streaming engine, reported RTF 0.195, and time-to-first-audio below 100 ms in its reported setup. Fish’s later S2.1 announcement reports a different approximately 70–90 ms TTFA claim. Keep those measurements tied to the named model/report and do not transfer them to API p95, India network latency, telephony, Hinglish, or user-perceived turn latency. [Fish Audio S2 technical report, arXiv:2603.08823](https://arxiv.org/abs/2603.08823) (accessed 2026-09-22); [S2.1 Pro announcement](https://fish.audio/es/blog/s2-1-pro-free-api/?articleLocale=en) (published 2026-06-23).

**Indian-business implication:** Fish can be an experimental TTS/control adapter, with text normalization and pronunciation fixtures for Hindi–English mixed text. Public material reviewed here does not establish Fish STT quality for Hinglish, Indian phone audio, names, rupees, or regional accents. Do not route the product to it by default; compare it only after collecting the same audio and transcript evidence used for Azure.

### Cartesia — fast, controllable TTS plus a managed-agent surface

Cartesia’s official pricing page lists Sonic-3.6 TTS, Ink-2 STT, and managed voice agents. Current public plans show Free at $0/month with 20K credits, Pro at $5/month with 100K credits, Startup at $49/month with 1.25M credits, and Scale at $299/month with 8M credits. Managed voice-agent call duration is listed at $0.06/minute, and Cartesia-provided phone telephony at $0.014/minute; UI-created-agent LLM usage and evaluations are described as free for a limited time. These prices are public reference points, not approved spend under the project’s Azure-only paid constraint. [Cartesia pricing](https://www.cartesia.ai/pricing) (accessed 2026-09-22).

The official LiveKit Cartesia integration page exposes the relevant controls: Sonic models accept `emotion`, speed, volume, target duration, buffer delay, word/phoneme timestamps, pronunciation dictionaries, and connection pooling. It lists Sonic 3.6 support for Hindi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi, Odia, and other languages, with dated model IDs including `sonic-3.6-2026-08-27`. This establishes API language/model availability in that integration. It does not establish natural code-switching or accent quality: “Hindi supported” is not a Hinglish WER or human-preference result. The same page says persistent WebSocket reuse avoids repeating handshakes after the first turn, which is an architecture lever to measure rather than a guaranteed end-to-end latency. [LiveKit Cartesia TTS integration](https://docs.livekit.io/agents/models/tts/cartesia/) (accessed 2026-09-22).

**Indian-business implication:** Cartesia is a strong output-side experiment for voice consistency, pronunciation dictionaries, and controlled expressiveness. The public materials reviewed here do not establish Ink-2’s Hinglish performance or Cartesia’s ability to infer emotional state. Test native-script versus Romanized Hindi, mixed names/places/amounts, and whether emotion controls improve task completion without becoming over-animated.

### Deepgram — explicit turn-taking and a complete voice-agent API

Deepgram documents three useful layers. Flux STT is a streaming voice-agent recognizer with model-integrated turn signals; Aura and Flux TTS stream output; the Voice Agent API combines listening, thinking, and speaking, with configurable provider models. Flux’s official interruption protocol stops local playback immediately, sends an `Interrupt` with the playback offset, and returns `text_spoken`/`text_remaining` so the LLM context can match what the caller actually heard. This is a concrete barge-in reconciliation contract worth adopting in the platform adapter interface. [Flux TTS overview](https://developers.deepgram.com/docs/flux-tts/overview) (accessed 2026-09-22); [Deepgram interruption handling](https://developers.deepgram.com/docs/flux-tts/interrupt-handling) (accessed 2026-09-22).

Flux STT exposes `StartOfTurn`, `EagerEndOfTurn`, `EndOfTurn`, and `TurnResumed` patterns. Deepgram recommends using the high-confidence `EndOfTurn` to commit a turn, while optionally preparing a response from `EagerEndOfTurn` and cancelling it on `TurnResumed`. The docs explicitly warn that echo/background noise can create false start-of-turn events. This gives a measurable latency/false-barge-in trade-off, not a free “natural interruption” claim. [Build a Flux voice agent](https://developers.deepgram.com/docs/flux/agent) (accessed 2026-09-22); [Eager end of turn](https://developers.deepgram.com/docs/flux/voice-agent-eager-eot) (accessed 2026-09-22); [Audio preprocessing and barge-in](https://developers.deepgram.com/voice-agent/optimize/audio-preprocessing-barge-in) (accessed 2026-09-22).

Current public Pay-As-You-Go prices are listed as Flux English $0.0065/minute, Flux Multilingual $0.0078/minute, Nova-3 Monolingual $0.0048/minute, and Nova-3 Multilingual $0.0058/minute for streaming STT. TTS is character-based: Flux TTS $0.045/1,000 characters, Aura-2 $0.030/1,000, Aura-1 $0.015/1,000. The Voice Agent API is listed at $0.075/minute Standard, $0.050/minute Custom with BYO LLM and TTS, and $0.163/minute Advanced (Growth rates differ). Deepgram also lists paid add-ons such as keyterm prompting, redaction, entity detection, and diarization. These are current public list prices as observed 2026-09-22, not an expected bill for our product. [Deepgram pricing](https://deepgram.com/pricing) (accessed 2026-09-22).

**Indian-business implication:** Deepgram’s explicit turn/interruption events and keyterm prompting fit names, institutions, dates, rupees, and escalation terms. Public pricing and docs alone do not prove Hindi–English or Indian-accent quality; choose Flux Multilingual/Nova-3 Multilingual only as a measured comparison arm. Its India endpoint and concurrency limits should be checked against the required region and load before any pilot. [Deepgram API rate limits](https://developers.deepgram.com/reference/api-rate-limits) (accessed 2026-09-22).

### Sarvam — Indian-language speech components, with explicit TTS limits

Sarvam documents Saaras v3 STT for realtime/batch transcription and translation across regional and code-mixed speech, plus Bulbul v3 TTS for Indian languages. Those are vendor capability statements; they do not substitute for a domain corpus. Existing project research already records the official Sarvam–LiveKit guide and its code-mix/telephony positioning.

Sarvam’s current API price table bills STT at ₹30/hour, or ₹45/hour with diarization; STT+translate is ₹30/hour and STT+translate+diarization ₹45/hour. Bulbul v3 TTS is ₹30 per 10,000 characters. The API says speech billing is per second and TTS is rounded to the nearest character. [Sarvam pricing](https://docs.sarvam.ai/api/getting-started/pricing) (accessed 2026-09-22).

Bulbul’s WebSocket reference makes a material expressiveness distinction: Bulbul v2 supports pitch, loudness, and pace; Bulbul v3 supports temperature and pace 0.5–2.0 but does **not** support pitch/loudness, with 24 kHz as the default sample rate and preprocessing always enabled. The docs also expose a flush/completion streaming protocol. This means “newer” is not equivalent to “more controllable”; run the same emotion/prosody rubric against v2 and v3 if either is considered. [Sarvam TTS WebSocket](https://docs.sarvam.ai/api-reference/text-to-speech/stream) (accessed 2026-09-22); [Bulbul model page](https://docs.sarvam.ai/api/getting-started/models/bulbul) (accessed 2026-09-22).

**Indian-business implication:** Sarvam is the most direct candidate for an Indic STT/TTS adapter and language-aware routing experiment. The public docs do not provide an independently measured WER, entity accuracy, interruption rate, or human naturalness result for our business domain. Validate code-switch point errors, native/Latin script normalization, names and rupee amounts, noisy 8 kHz audio, and whether the caller can repair a wrong language route without restarting the call.

### Dialflo — India-oriented application/operator packaging

Dialflo’s public product pages position it around recruitment, logistics, and D2C voice agents, with multilingual outreach, integrations, and no-code configuration. The official pricing page currently offers 100 free recruitment calls with no credit card and says custom pricing depends on recruitment volume and requirements. No public API rate card was found. [Dialflo recruitment pricing](https://dialflo.ai/pricing) (accessed 2026-09-22).

Dialflo’s own November 5, 2025 case-study post reports a SmartStaff deployment of approximately 20,000 calls, 10,789 answered, and 2,300 qualified; it says calls averaged two minutes and cost about ₹10 each. These are vendor case-study claims with an unspecified component breakdown, contract terms, carrier mix, language mix, and denominator definitions. They cannot be used as our unit cost or conversion benchmark. [Dialflo SmartStaff case study](https://blog.dialflo.ai/2025/11/the-future-of-recruitment-is-voice-ai.html) (published 2025-11-05; accessed 2026-09-22).

Dialflo’s public material says agents handle interruptions/clarifications and dozens of languages, while its own recruitment guidance also describes messy emotional conversations, language switching, indirect answers, and judgment as failure pressure. The latter is a useful vendor admission, not a quantified limitation. Ask for raw turn events, endpointing policy, transcript correction path, carrier/8 kHz conditions, pricing inclusions, recording/retention, and Hindi–English examples before treating it as a technical benchmark.

**Indian-business implication:** Dialflo is most relevant as an application/operations comparator: local outreach, campaign volume, recruiter or logistics workflow, and outcome reporting. It is not enough evidence for a provider-neutral speech adapter. Keep its case metrics in a “vendor claim” column and require a controlled, consented test before any cost or ROI statement.

### Alchemic (`thealchemic.com`) — research workflow and channel reach, not a speech runtime

Alchemic presents AI-moderated research over WhatsApp, web, and phone, with guide creation, screening/quotas, fielding, cited findings, and human-verified research services. Its MCP page says a study can be triggered from an MCP client and that findings drill from themes to verbatims and respondent counts. This is a workflow/insight layer; the public material does not identify its STT, TTS, telephony, endpointing, or model providers, so it should not be treated as a low-level voice competitor. [Alchemic MCP](https://thealchemic.com/alchemic-mcp/) (accessed 2026-09-22).

Alchemic states that pricing is per study, driven by sample size and source; bringing one’s own list costs less than panel recruitment, and it asks buyers to request a scoped quote. No public per-minute voice price was found. [Alchemic MCP FAQ](https://thealchemic.com/alchemic-mcp/) (accessed 2026-09-22). The site’s “57+ languages,” native moderation, real interviews, and emotional analysis are vendor claims. Its public reach research correctly highlights a key evaluation issue: language counts do not establish native quality, so buyers should request an unedited target-language transcript and native-speaker review. [Alchemic vendor-reach guidance](https://thealchemic.com/feeds/vendor-questions-respondent-reach) (accessed 2026-09-22).

**Indian-business implication:** Alchemic is a useful comparator for a feedback-campaign workflow: consented respondent source, channel choice, quota/quality checks, cited transcript evidence, and action-ready findings. The product should borrow that evidence chain without implying that its hidden speech stack or emotional labels are validated for Indian callers.

### LiveKit — provider-neutral realtime runtime and transparent cost decomposition

LiveKit Agents is an orchestration/runtime layer. Official docs describe realtime rooms and WebRTC transport, pluggable STT, LLM, TTS, realtime models, tools, handoffs, telephony/SIP, and turn handling. The model overview supports either a specialized STT–LLM–TTS pipeline or a realtime model, and LiveKit Inference can provide managed model access while open-source plugins let a team own provider accounts and billing. [LiveKit Agents](https://docs.livekit.io/agents/) (accessed 2026-09-22); [LiveKit models](https://docs.livekit.io/agents/models/) (accessed 2026-09-22).

LiveKit’s official turn-taking docs make endpointing and interruption first-class configuration, while the cloud pricing page breaks an example voice-agent estimate into agent session ($0.0100/min), telephony ($0.0100/min in its selected example), LLM ($0.0014/min example), STT ($0.0058/min example), TTS ($0.0300/min example), and observability ($0.0100/min), for a displayed total of $0.0672/min. The page also lists Build at $0/month, Ship from $50/month, and Scale from $500/month, with included minutes/credits and overages. These are LiveKit’s selected calculator example and plan prices, not a universal rate or an approved spend path. [LiveKit pricing](https://livekit.com/pricing) (accessed 2026-09-22).

**Indian-business implication:** LiveKit is the strongest architectural reference for retaining control over turn policy, provider adapters, SIP/telephony, traces, and replay. It shifts supervisor UX, QA calibration, privacy/retention, and spend reconciliation to the product team. A self-hosted option removes LiveKit Cloud usage fees but adds media, compute, autoscaling, regional egress, and operations costs; those unknowns must be measured.

## Azure and the current product constraint

The existing product uses Azure Realtime as its only approved paid inference path. Microsoft’s Realtime/Voice Live documentation supports server VAD and semantic VAD, configurable silence duration/eagerness, interruption, and auto-truncation so session history can represent what the caller actually heard. Microsoft also notes that input transcription can be asynchronous and may diverge from the realtime model’s audio interpretation. [Azure Realtime audio reference](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/realtime-audio-reference-ga) (accessed 2026-09-22); [Azure Voice Live guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to) (accessed 2026-09-22); [Azure Voice Live overview and pricing model](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live) (last updated 2026-09-16; accessed 2026-09-22).

Microsoft’s public Voice Live page describes tiered pricing by generative model, approximate audio-token accounting (~10 input audio tokens/second and ~20 output audio tokens/second for Azure OpenAI model families), and separate charges for cached audio/text context and custom voice training/hosting. The current Azure Founders Hub grant’s balance, rate card, region/model eligibility, and coverage of custom voice hosting are not established in this research. Do not turn public list prices or the grant ceiling into a per-minute product promise.

The existing free Gemini Maya/Despina route remains a separately validated free-pool path for bounded evaluation, not a paid fallback and not default routing. Fish’s free S2.1 offer is a vendor trial with Fair Use/no SLA, not an authorization to add a second production route.

## Three costable architecture alternatives

Use the following as a spreadsheet schema. Inputs are intentionally symbolic; no benchmark volume or hidden rate is invented.

### A. Azure native realtime audio (approved paid path)

**Meter formula:**

`monthly cost = (input audio seconds × Azure input-audio rate or token rate) + (output audio seconds × Azure output-audio rate or token rate) + (text input/output/cache tokens × model rates) + optional custom voice training/hosting + transport/observability/storage`

**Unknown inputs:** exact deployment/model and region; grant eligibility and remaining balance; billable audio-token definitions; average and p95 user/agent speech seconds; prompt/context cache reuse; tool-call text tokens; concurrency; recording/transcript retention; custom-voice status. Measure response TTFA, first usable word, end-of-turn, barge-in cut-off, auto-truncation correctness, transcript divergence, and per-session usage receipts.

**Why consider it:** one integrated audio model and current implementation continuity. **Risk:** less provider interchangeability and a separate transcript/evidence path; native audio quality or responsiveness is not proven better here.

### B. Cascaded streaming adapter (Azure text model + external STT/TTS benchmark)

**Meter formula:**

`monthly cost = (STT audio minutes × STT rate) + (TTS output characters × TTS rate) + (LLM input/cache/output tokens × Azure text rates) + VAD/turn service + transport + logs/recordings + retries/re-synthesis`

For a public reference only, Deepgram lists Flux Multilingual at $0.0078/STT minute, Flux TTS at $0.045/1,000 characters, and its Voice Agent API at $0.075/min Standard; Sarvam lists STT at ₹30/hour and Bulbul v3 at ₹30/10,000 characters; Fish lists credit-based TTS/STT; Cartesia lists plan credits and managed-agent call minutes. These rates cannot be combined into a forecast without character density, speech ratio, currency/tax, plan, concurrency, and approved-spend decisions.

**Unknown inputs:** caller/agent talk-time split; partial transcript billing; TTS characters per response; endpoint false positives and repeated generation; multilingual model choice; network/media relay; turn detector hosting; cache hit rate; failed-call/retry policy; tool latency; regional endpoint. Measure stage-by-stage p50/p95, interruption cancellation, transcript-to-audio reconciliation, entity correctness, and cost per completed business outcome.

**Why consider it:** explicit text/tool/eval surfaces, replaceable STT/TTS, and easier Hinglish-specific normalization/keyterm tests. **Risk:** more component failures and more opportunities for silence, overlap, duplicated text, or inconsistent prosody.

### C. Self-hosted/open runtime + Azure text model (benchmark-only)

**Meter formula:**

`monthly cost = Azure text-token spend + GPU-hours for STT/TTS/VAD/turn services + CPU/worker hours + storage + media egress + WebRTC/SIP/telephony + engineering/on-call + model license/commercial compliance`

Fish Speech S2’s paper/code and LiveKit’s open-source runtime make this technically plausible, while public Deepgram materials mention self-hosted enterprise deployment. This is a design option, not an instruction to deploy or purchase. **Unknown inputs:** GPU type/region and utilization; cold-start/warm-pool policy; concurrency; quantization quality; Indian-language checkpoints; licensing; maintenance; failover; observability; egress; human review. Measure GPU cost per generated audio minute, first-audio under cold/warm load, memory pressure, transcript/entity quality, and operational incidents.

**Why consider it:** data/control and provider independence at scale. **Risk:** high engineering and quality-validation burden; free/open weights do not mean zero cost or production readiness.

## Hinglish, interruptions, expressiveness, and emotion: what to measure

### Hinglish and code-switching

Code-switching is a known ASR difficulty because acoustic and lexical information is language-specific and open data is scarce. A primary Indic code-switching paper reports Hindi–English WER of 21.77 in its proposed system; this is a research result on a particular corpus/model, not a vendor baseline. A separate 2024 VITB-HEBiC paper describes a 7.5-hour, 3,590-utterance Hindi–English corpus across speakers from 27 Indian states and notes that monolingual systems struggle when code-switching is substantial. [Chadha et al., *Code Switched and Code Mixed Speech Recognition for Indic languages*, arXiv:2203.16578, 2022-03-30](https://arxiv.org/abs/2203.16578); [Jain & Bhowmick, VITB-HEBiC, *Applied Acoustics*, 2024](https://www.sciencedirect.com/science/article/pii/S0003682X24002706).

The product’s corpus should score more than aggregate WER: switch-point WER/CER, language-ID errors, name/place/institution entity hit rate, rupee/date/phone/email accuracy, native-script versus Romanized input, repair success after a wrong transcription, and task completion after an interruption. Keep raw transcript and normalized business value separate so a fluent-looking translation cannot hide a wrong amount or identifier.

### Endpointing and interruption recovery

Measure silence-to-response delay, premature endpoint rate, late endpoint rate, false barge-in from echo/noise, cut-off-to-next-response time, and “what the caller actually heard” reconciliation. Deepgram’s `text_spoken`/`text_remaining`, Azure’s `auto_truncate`, and LiveKit’s turn policy demonstrate useful adapter contracts. They do not establish equal behavior across providers or codecs.

### Expressiveness controls versus emotional inference

TTS controls such as emotion tags, speed, volume, pitch, temperature, pause/phrase breaks, and voice choice are **delivery controls**. They do not prove that the system correctly inferred the caller’s emotion, selected a culturally appropriate response, or produced empathy. Keep “observed caller words/cues” separate from “model-selected delivery style”; require human review for sensitive escalation.

Prosody research supports this caution. Liu et al. show that emotional state and phrase breaks interact and evaluate an emotion-aware phrasing method with both objective and subjective tests, while noting that phrasing errors propagate into unnatural speech. The study uses English/Chinese emotion datasets and a small listening panel; it does not establish Indian-language or business-call validity. [Liu et al., *Emotion-Aware Prosodic Phrasing for Expressive Text-to-Speech*, arXiv:2309.11724, 2023-09-21](https://arxiv.org/abs/2309.11724).

Speech-emotion-recognition reviews also identify speaker, sentence, speaking style/rate, culture, dialect, and environment as confounds. Acoustic cues can be useful evidence but are not a reliable ground truth for a person’s internal state. Use explicit caller words, consent, correction, and human escalation as the safety boundary; never label a voice as “angry,” “depressed,” or “empathetic” without qualification. [Swain et al., *Speech emotion recognition using machine learning — A systematic review*, Information Systems with Applications, 2023](https://doi.org/10.1016/j.iswa.2023.200266); [multi-cultural speech-emotion recognition discussion](https://www.sciencedirect.com/science/article/pii/S174680942300112X).

## Practical decision and differentiation gate

Keep Azure native realtime as the only paid implementation path under the current authorization. Use existing free Gemini Maya/Despina evidence and provider documentation as bounded references. Do not add Fish, Cartesia, Deepgram, Sarvam, LiveKit Cloud, Dialflo, or Alchemic spend to the product without a new explicit budget decision. For research, an adapter-neutral test lab can compare:

1. Azure native audio, with its transcript and audio-event caveats.
2. A cascaded reference using one STT, Azure text model, and one TTS, with all timing events preserved.
3. A provider-specific/managed control arm only when it is legally and financially authorized, with public prices recorded separately from the product’s approved route.

The measurable differentiation opportunity is the evidence loop: versioned agent/prompt/provider settings; Indian-language corpus; stage timing; word/entity correctness; interruption transcript reconciliation; explicit AI disclosure and consent; source-grounded business actions; reviewed relational memory; and cost per completed, correct outcome. Naturalness or “emotion” scores alone are insufficient. A claim gate should require a pre-registered corpus, same script/tool/knowledge conditions where possible, blind human ratings, p50/p95 latency, interruption and endpoint metrics, and business-task correctness. Until that test is run, use “vendor-documented capability,” “internal bounded evidence,” and “unknown” as the only valid labels.

## Sources and access dates

- Fish Audio, [real-time streaming guide](https://docs.fish.audio/developer-guide/best-practices/real-time-streaming), accessed 2026-09-22.
- Fish Audio, [S2.1 Pro free API announcement](https://fish.audio/es/blog/s2-1-pro-free-api/?articleLocale=en), published 2026-06-23, accessed 2026-09-22.
- Fish Audio, [API pricing](https://fishaudio.org/en/pricing?product=api), accessed 2026-09-22.
- Fish Audio, [S2 technical report](https://arxiv.org/abs/2603.08823), accessed 2026-09-22.
- Cartesia, [pricing](https://www.cartesia.ai/pricing), accessed 2026-09-22.
- LiveKit, [Cartesia TTS integration](https://docs.livekit.io/agents/models/tts/cartesia/), accessed 2026-09-22.
- Deepgram, [Flux TTS overview](https://developers.deepgram.com/docs/flux-tts/overview), accessed 2026-09-22.
- Deepgram, [interruption handling](https://developers.deepgram.com/docs/flux-tts/interrupt-handling), accessed 2026-09-22.
- Deepgram, [Flux agent](https://developers.deepgram.com/docs/flux/agent), accessed 2026-09-22.
- Deepgram, [eager end of turn](https://developers.deepgram.com/docs/flux/voice-agent-eager-eot), accessed 2026-09-22.
- Deepgram, [audio preprocessing and barge-in](https://developers.deepgram.com/voice-agent/optimize/audio-preprocessing-barge-in), accessed 2026-09-22.
- Deepgram, [pricing](https://deepgram.com/pricing), accessed 2026-09-22.
- Deepgram, [API rate limits](https://developers.deepgram.com/reference/api-rate-limits), accessed 2026-09-22.
- Sarvam, [pricing](https://docs.sarvam.ai/api/getting-started/pricing), accessed 2026-09-22.
- Sarvam, [TTS WebSocket reference](https://docs.sarvam.ai/api-reference/text-to-speech/stream), accessed 2026-09-22.
- Sarvam, [Bulbul model page](https://docs.sarvam.ai/api/getting-started/models/bulbul), accessed 2026-09-22.
- Dialflo, [recruitment pricing](https://dialflo.ai/pricing), accessed 2026-09-22.
- Dialflo, [SmartStaff case study](https://blog.dialflo.ai/2025/11/the-future-of-recruitment-is-voice-ai.html), published 2025-11-05, accessed 2026-09-22.
- Alchemic, [MCP workflow and FAQ](https://thealchemic.com/alchemic-mcp/), accessed 2026-09-22.
- Alchemic, [vendor-reach guidance](https://thealchemic.com/feeds/vendor-questions-respondent-reach), accessed 2026-09-22.
- LiveKit, [Agents](https://docs.livekit.io/agents/), accessed 2026-09-22.
- LiveKit, [models](https://docs.livekit.io/agents/models/), accessed 2026-09-22.
- LiveKit, [latency guidance](https://livekit.com/blog/understand-and-improve-agent-latency), accessed 2026-09-22.
- LiveKit, [pricing](https://livekit.com/pricing), accessed 2026-09-22.
- Microsoft, [Azure Realtime audio reference](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/realtime-audio-reference-ga), accessed 2026-09-22.
- Microsoft, [Azure Voice Live how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to), accessed 2026-09-22.
- Microsoft, [Azure Voice Live overview/pricing model](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live), last updated 2026-09-16, accessed 2026-09-22.
- Qiu et al., [Building Enterprise Realtime Voice Agents from Scratch](https://arxiv.org/abs/2603.05413), published 2026-03-05, accessed 2026-09-22.
- Chadha et al., [Code Switched and Code Mixed Speech Recognition for Indic languages](https://arxiv.org/abs/2203.16578), published 2022-03-30, accessed 2026-09-22.
- Jain & Bhowmick, [VITB-HEBiC](https://www.sciencedirect.com/science/article/pii/S0003682X24002706), published 2024-09-05, accessed 2026-09-22.
- Liu et al., [Emotion-Aware Prosodic Phrasing for Expressive TTS](https://arxiv.org/abs/2309.11724), published 2023-09-21, accessed 2026-09-22.
- Swain et al., [Speech emotion recognition systematic review](https://doi.org/10.1016/j.iswa.2023.200266), published 2023, accessed 2026-09-22.
