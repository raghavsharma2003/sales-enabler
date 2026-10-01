# Voice research and adoption — relational Indian business conversation

**Research date:** 2026-10-01 (Asia/Kolkata)  
**Decision boundary:** Azure is the only approved paid inference route. The existing free Maya profile remains a separately selected evaluation profile. This review made no provider call, used no credential, installed no dependency, cloned no repository and changed no cloud resource.

## Decision

The next gain should come from making turn behavior and Indian business speech measurable, not from replacing the current Azure Realtime model with an open full-duplex model.

Ranked adoption candidates:

1. **Add an evidence-grade turn timeline and a small Indian interruption benchmark around the existing Azure WebRTC route.** This is the highest-value, lowest-dependency change. The runtime currently records a coarse `listening | thinking | speaking` activity and one “user transcript received to first generated event” interval. It does not retain speech start/end, response start, first audible output, overlap, interruption, playback stop or response completion as one correlated turn. Full-Duplex-Bench and the 2026 full-duplex survey show why pause handling, listener backchannels, user interruption, side speech and real overlap must be scored separately.
2. **Add an operator-reviewed speech lexicon and evaluate Azure input-transcription prompts with native- and Latin-script entities.** The current Azure session sets only `transcription: { model: "gpt-4o-mini-transcribe" }`. Azure supports a transcription `prompt`, while IndicContextEval shows that domain descriptions and entity lists, including native-script forms, must be evaluated independently and against an adversarial irrelevant-entity condition. This is a direct route to fewer errors on company names, products, places, rupees and dates without adding a paid provider.
3. **Turn approved relationship memory into an evidence-tested claim lifecycle.** The current code is already safer than common “agent memory” designs: it scopes memories to the selected contact, requires approval, retains source IDs and exact source text, treats commitments as pending, and rebuilds current-call relationship state from the transcript. The missing gate is systematic testing of updates, temporal questions, multi-session evidence and abstention. LongMemEval’s task taxonomy is reusable under MIT without adopting a memory framework or importing its synthetic customer histories into production.

The open full-duplex models are useful architecture references, but none is a deployable product candidate under the present constraints. Moshi and PersonaPlex require a separately hosted local/model runtime; MaAI requires local inference and does not list Hindi; Full-Duplex-Bench data and code are CC BY-NC 4.0. Azure remains the only runtime to test.

## Current implementation compared with the research

The product has a sound relational core:

- `lib/voice/emotional.ts` reacts only to explicit caller wording such as confusion, frustration, time pressure, correction and pause. It intentionally avoids emotion diagnosis from voice.
- `lib/voice/relational-runtime/index.ts` replays finalized turns, retains evidence spans, handles caller-led rupture/repair, language, honorific, formality and pace, and never turns these observations into identity, permission or permanent customer facts.
- `lib/voice/relationship.ts` admits only approved contact-scoped preferences and open commitments, preserves source IDs/text/timestamps and uses whole-block budgeting.
- `lib/voice/server.ts` configures Azure/OpenAI Realtime with low-eagerness semantic VAD, automatic response creation and interruption. It has no transcription prompt or campaign lexicon.
- `lib/voice/client-adapters.ts` collapses provider events into transcript/item/activity/error. `input_audio_buffer.speech_started` and `speech_stopped` are used only to change the UI activity; their audio timestamps and item IDs are discarded. There is no provider-neutral interruption, dual-talk or playback-stop event.
- `lib/voice/diagnostics.ts` measures connect time and transcript-receipt-to-first-generated-event time. The code correctly labels these as browser event observations rather than acoustic latency, but it cannot compute endpointing, cutoff, overlap or premature-turn metrics.

This means the code can adapt after it receives a finalized transcript, but it cannot yet prove that it let the caller finish, distinguished “haan/hmm” from a takeover, stopped promptly on a correction, or spoke with the requested Indian business delivery. Those are the material gaps.

## Strongest primary sources and reusable ideas

All sources below were checked on 2026-10-01. Published results are author-reported unless explicitly described as a product measurement.

| Source | What is established | Reusable idea for this code | License and deployment boundary |
|---|---|---|---|
| [Microsoft Voice Live how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to), [Voice Live 2026-07-15 reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-api-reference-2026-07-15), and [Azure Realtime audio guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio) | Azure exposes speech-start/stop, response lifecycle and audio-buffer events. Voice Live adds multilingual Azure semantic VAD, configurable minimum speech/silence/prefix values, filler handling, `interrupt_response`, `auto_truncate`, and input-transcription prompts. Hindi is listed for multilingual semantic VAD; that does not establish Hinglish quality. | Preserve the event timeline already arriving in the browser. Add a reviewed entity prompt. If the project later uses Voice Live, map its richer VAD into the same contract instead of building a second UX. | Managed proprietary Azure service. Feasibility depends on the actual project, region, deployment and quota. This is the only approved paid route, but project creation alone does not prove model availability or grant coverage. |
| [Speaking While Listening / DuplexSurvey](https://github.com/MM-Speech/DuplexSurvey) (preprint June 2026; EMNLP 2026 acceptance August 2026) | “Full duplex” covers materially different architectures. The paper separates architecture levels, interaction as temporal relation × user intent × system response, and five momentary states: Idle, Listen, Speak, Wait and Dual. | Replace the overloaded three-state activity trace with an internal state reducer that can represent `dual` and distinguish a deliberate wait from model latency. Store the triggering event, item/response ID and monotonic offset for every transition. | No root license file was visible in the reviewed repository. Cite the paper and reimplement the general state-machine idea; do not copy repository assets or code without a verified license. No runtime component is needed. |
| [Full-Duplex-Bench v1–v3](https://github.com/DanielLin94144/Full-Duplex-Bench) (v2 framework February 2026; v3 code/data May 2026) | v1 evaluates pause handling, backchanneling, smooth turn-taking and interruption; v1.5 adds listener backchannel, side conversation and ambient speech; v2 adds live WebRTC/WebSocket interaction; v3 adds real disfluencies and chained tool use. | Use its category separation, not its leaderboard, to build first-party Hindi/Hinglish/English business fixtures. Score backchannel false interruption separately from a corrective takeover and from a hard stop. Include tool calls after false starts and self-corrections. | Repository license is **CC BY-NC 4.0**. Do not copy its data/code into a commercial product or commercial launch evaluation. A clean internal harness with newly recorded, consented fixtures can implement the same kinds of scenarios. |
| [MaAI](https://github.com/MaAI-Kyoto/MaAI) and its [multilingual VAP paper](https://aclanthology.org/2024.lrec-main.1036/) | Voice Activity Projection predicts who is likely to speak next; MaAI also separates backchannel timing/detection from turn-taking and added single-channel turn-taking on 2026-08-30. The repository lists English, Chinese and Japanese, not Hindi. | The conceptual split is valuable: `speech_detected` is not the same as `takeover_intent`. Introduce a provider-neutral decision record with `continue_listening`, `backchannel`, `yield`, `interrupt`, and `uncertain`, even if Azure initially supplies only the lower-level events and the benchmark supplies expected labels. | Source code is MIT. Trained-model licenses vary; the newer path uses CC BY 4.0 Mimi and other variants have their own dependencies. It requires local model installation/inference and has no listed Hindi model, so it is not a runtime candidate now. |
| [Moshi](https://github.com/kyutai-labs/moshi) and [PersonaPlex](https://github.com/NVIDIA/personaplex) ([2026 paper](https://arxiv.org/abs/2602.06053)) | Moshi is a streaming speech-text full-duplex architecture. PersonaPlex adds separate text role prompts and audio voice conditioning, with customer-service prompt examples and Full-Duplex-Bench evaluation. | Keep role/knowledge/relationship behavior separate from voice identity and delivery. The product already follows this in its invariant prompt, Maya delivery instructions and optional clone profile; retain that separation instead of encoding “warmth” as a customer trait or voice clone. | Moshi code carries Apache-2.0/MIT components and its listed models are CC BY 4.0. PersonaPlex code is MIT; weights use the NVIDIA Open Model License and require accepting the model terms. Both require a separate Python/model server and local/hosted compute. No reviewed source establishes Hindi/Hinglish performance. They are research references, not deployment candidates. |
| [AI4Bharat IndicContextEval](https://github.com/AI4Bharat/IndicContextEval) (Interspeech 2026) | 56 hours of natural speech from 555 speakers across 8 Indian languages and 23 professional domains; seven prompt levels range from no hint through language/domain descriptions and English/native-script entity lists to irrelevant adversarial entities. It reports clamped WER and named-entity error rate (NEER), and shows model behavior changes with context. Evaluation scripts were still marked “coming soon.” | Add a bounded, reviewed speech lexicon and test three variants on exactly the same audio: current configuration, Latin/native entity hints, and an irrelevant-entity control. Report WER/CER, NEER and exact accuracy for rupees, dates, phone numbers and product/place/person names. Never use the hinted transcript as authoritative structured data. | Repository/data state CC BY 4.0. It can inform evaluation and potentially supply attributed research fixtures, but its script release is incomplete. No local model is needed for the proposed product test; the target remains Azure. |
| [IndicEmo](https://github.com/ira-rumik/IndicEmo) (repository checked 2026-10-01) | An Apache-2.0 benchmark design for emotional/professional delivery in utterances that switch among English and six Indian languages. The published experiment has 100 tasks and 500 matched recordings; recordings are not bundled, and its main score is expression quality, not code-switch correctness, accent accuracy or general TTS quality. | Borrow the separation of delivery dimensions: professional style, requested pace and proportionate expression should be rated separately from transcript correctness. For this business product, use “calm professional,” “brief under time pressure,” “acknowledge correction,” and “proportionate good-news response”; do not ask a model to infer a caller’s hidden emotion. | Repository code/tasks are Apache-2.0. Generated recordings and judge free-text are absent. New generation/judging needs provider access, so near-term use should be an internal human listening rubric over the existing Azure output, not its paid multi-judge pipeline. This is a small, emerging benchmark and not independent proof of any vendor’s quality. |
| [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025; cleaned histories September 2025; V2 announced May 2026) | 500 questions cover extraction, multi-session reasoning, knowledge updates, temporal reasoning and abstention. Evidence session/turn labels make retrieval failures separable from answer failures. | Create product-owned synthetic cases with expected memory/source IDs: remembered preference, corrected preference, open versus completed commitment, two-session synthesis, no-evidence abstention and wrong-contact isolation. Score evidence recall and answer correctness separately. | MIT repository/dataset. The official full pipeline expects Python and, for some baselines, CUDA or a paid judge. Reuse the taxonomy and JSON shape in TypeScript; do not add its runtime dependencies or treat its synthetic histories as Indian business evidence. |

## Ranked adoption details

### 1. Turn timeline and interruption benchmark

Add a bounded `VoiceTurnTrace` beside the existing diagnostics. Each event should contain only:

```text
kind: speech_started | speech_stopped | response_created | first_output |
      output_started | output_stopped | response_done | transcript_done |
      interruption | truncation
atMs: monotonic milliseconds from session-ready
itemId?: bounded provider item ID
responseId?: bounded provider response ID
providerAudioMs?: audio_start_ms or audio_end_ms when supplied
reason?: explicit_stop | correction | backchannel | side_speech | unknown
```

Do not store raw provider events, audio, prompts or transcript text in this trace. Correlate by item/response IDs and retain the existing warning that client receipt time is not acoustic truth. For controlled fixtures, the harness knows the injected waveform timestamp, so it can compute actual detection and cutoff intervals; ordinary calls can only report event intervals.

Map events through a pure reducer to `idle | listen | wait | speak | dual`. `dual` begins when user speech starts while output is active. It ends as `yield` when output stops/cancels, as `backchannel` when output continues and the utterance is labelled non-takeover in a reviewed fixture, or as `uncertain` in unlabelled production calls. The runtime must not infer intent or emotion from energy alone.

This fits the present architecture: `browser-session.ts` already sees the raw data-channel events, `client-adapters.ts` already knows the provider naming differences, and the diagnostics persistence path already bounds client observations. It requires no provider change and no local model.

### 2. Reviewed entity prompting and Indian speech metrics

Add an optional release-scoped `speechLexicon` compiled only from operator-reviewed entries. Each entry should carry `display`, `spokenVariants`, `script`, `sourceId`, `sourceRevision` and an entity class. Cap entry count and total characters, keep whole entries, and bind the lexicon digest to the released agent/campaign.

Pass a short transcription prompt such as an “expected terminology” list only when the selected Azure API/model supports it. Keep that prompt separate from behavioral instructions. A name in the lexicon is pronunciation/context assistance; it is not verified caller identity or an answer. The raw transcript remains visible, and structured rupee/date/phone fields still require the existing quote-based review path.

Evaluate identical consented audio with:

- A: current no-lexicon configuration;
- B: reviewed Latin-script business terms plus a short domain description;
- C: the same terms in the native script used by the speaker;
- D: a deliberately irrelevant, same-size entity list.

Variant B or C is adoptable only if it improves the intended entities over A and does not start hallucinating D’s entities. Report both whole-transcript WER/CER and NEER; WER alone can hide the business failure.

### 3. Evidence-tested relationship memory

Keep the present approval and contact boundary. Extend the memory record only where needed to express correction explicitly: `sourceSessionId`, `sourceTurnId`, exact `sourceQuote`, `assertedAt`, optional `supersedesMemoryId`, review receipt and revocation status. Retrieval should return the active claim plus evidence, not a blended summary.

Add deterministic test cases for:

- latest approved language/address/formality preference wins and cites its source;
- an explicit correction supersedes an older claim without deleting history;
- an open commitment is never described as completed;
- a completed/revoked commitment is no longer recalled as open;
- multi-session answers list every required evidence source;
- no evidence produces “not available,” not a plausible guess;
- selecting another contact never retrieves the first contact’s memory;
- current-call corrections affect this call but remain a review proposal afterward.

This candidate strengthens the existing design rather than importing Mem0, Letta or another general memory layer. LongMemEval supplies a useful coverage taxonomy, not a product architecture or proof of relational quality.

## One concrete near-term implementation and evaluation

Build **Voice Turn Evidence v1** before changing the speech model or default VAD settings.

1. Add the bounded timeline and pure `idle/listen/wait/speak/dual` reducer. Unit-test reordered, duplicated and missing provider events, because transcription can complete after response creation.
2. Add a local TypeScript replay harness that accepts a JSON event trace and produces per-scenario metrics. It requires no Python, Docker or model install.
3. Record a first-party, consented 36-case fixture set: six interaction types × English/Hindi/Hinglish × clean and simulated call/noise conditions. The six types are short hesitation, filler while holding the turn, listener backchannel (`hmm/haan`), corrective takeover, explicit stop, and side speech/ambient interruption. Include named products, Indian place/person names, rupees, dates and phone digits.
4. When the Azure project/deployment and a bounded test budget are separately confirmed, run the same fixtures against the current Azure configuration and the reviewed-lexicon variant. Save model/deployment/API version, voice, VAD settings, fixture digest and usage receipt with the result. Do not run a non-Azure paid comparator.
5. Have two Hindi/Hinglish-capable reviewers listen blind to paired outputs and rate: understood words, professional naturalness, pace fit, proportionate acknowledgment, interruption appropriateness and whether the reply addressed the corrected meaning. Reviewers should mark observable behavior; they should not assign hidden emotion labels to the caller.

Report, per language and condition:

- speech-start detection and speech-end/commit event intervals;
- first generated event and first audible-output interval;
- corrective/stop barge-in detection and playback cutoff;
- premature response rate on hesitation/filler;
- false interruption rate on backchannels and side speech;
- response correctness after self-correction;
- WER/CER, switch-point errors, NEER and exact digit/rupee/date accuracy;
- memory/source correctness and abstention for the relationship cases;
- human paired preference with raw counts and disagreements;
- Azure usage and cost for the bounded run.

Provisional engineering gates, explicitly product choices rather than literature claims:

- zero wrong-contact memory disclosure, invented completed commitment or ignored explicit stop;
- the lexicon variant reduces NEER by at least 10% relative on the fixed set, with no more than 5% relative WER or p95 first-audible regression;
- fewer premature turns and false backchannel interruptions than the frozen current configuration;
- every reported latency has a named start/end event and missing measurements remain missing;
- no “emotion-aware,” “native Hinglish,” “human-like” or latency claim is published from this small fixture set.

If Azure Voice Live becomes available in the new project, run it through the same trace and fixture contract. Its multilingual semantic VAD is then an A/B candidate, not an automatic upgrade. The event/evidence layer should land first so the comparison is inspectable.

## Findings not adopted

- **Do not add a local VAP/MaAI model now.** Its state vocabulary is useful, but its published languages omit Hindi and the task forbids local installation/runtime work.
- **Do not self-host Moshi or PersonaPlex.** They add a model server, weight license and compute path outside the Azure-only paid architecture, with no reviewed Hinglish evidence.
- **Do not copy Full-Duplex-Bench fixtures or code into the product.** Its CC BY-NC 4.0 license conflicts with commercial reuse. Recreate the scenario taxonomy with first-party consented audio.
- **Do not add voice-emotion classification.** The current explicit-wording approach is safer and more actionable. IndicEmo supports evaluating requested output delivery; it does not justify inferring a customer’s emotion, trust or intent from prosody.
- **Do not replace the approved-memory model with an off-the-shelf memory service.** The code already has the right provenance and audience controls. The needed improvement is a correction/temporal/abstention evaluation gate and explicit supersession, not broader automatic retention.

## Source record

Primary sources checked on 2026-10-01:

1. Microsoft, [Voice Live how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to), [Voice Live API reference 2026-07-15](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-api-reference-2026-07-15), [Azure Realtime audio](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio).
2. Lu et al., [Speaking While Listening: A Survey and Empirical Audit of Full-Duplex Spoken Dialogue Systems](https://github.com/MM-Speech/DuplexSurvey), EMNLP 2026.
3. Lin et al., [Full-Duplex-Bench v1–v3 repository](https://github.com/DanielLin94144/Full-Duplex-Bench), releases through 2026-05-20.
4. Inoue et al., [MaAI real-time turn-taking/backchannel project](https://github.com/MaAI-Kyoto/MaAI) and [Multilingual Turn-taking Prediction Using VAP](https://aclanthology.org/2024.lrec-main.1036/).
5. Défossez et al., [Moshi](https://github.com/kyutai-labs/moshi), 2024; Roy et al., [PersonaPlex](https://github.com/NVIDIA/personaplex), 2026.
6. Joshi et al., [IndicContextEval](https://github.com/AI4Bharat/IndicContextEval), Interspeech 2026.
7. [IndicEmo](https://github.com/ira-rumik/IndicEmo), code-switched Indian expressive-TTS benchmark repository.
8. Wu et al., [LongMemEval](https://github.com/xiaowu0162/LongMemEval), ICLR 2025, current repository through the May 2026 V2 announcement.

