# Voice quality program — 9 October 2026

## Decision and top three gaps

The product has a credible conversation-policy layer, but it does not yet have acoustic proof. The October 9 Azure Listen & type call proves a real Realtime reply and correct transcript behavior. It does not prove microphone recognition, Hindi/Hinglish delivery, pronunciation, interruption quality, audible latency, emotional delivery, or human preference.

The three highest-value gaps are:

1. **The runtime is barge-in turn-taking, not selective full duplex.** The private scheduler treats `speech_started` as an interruption, waits for committed audio plus `input_audio_transcription.completed`, then compiles guidance and requests the next response. The public gateway also interrupts an active response on any speech start. Partial ASR is neither consumed nor exposed. The agent can receive audio while speaking, but it cannot use an evolving utterance to keep talking through `haan/hmm`, yield to a takeover, or shorten its current sentence causally. Implement a provider-neutral duplex decision contract before claiming simultaneous listen-and-speak behavior.
2. **No replayable audio is bound to causal timing or a rating.** `VoiceEvidenceLab` stores a 1–5 score and an operator checkbox saying audio was heard, but no immutable clip, hash, capture boundary, turn trace, profile version, or randomized assignment. Implement evaluation-only assistant-output capture with a shared monotonic timeline. Until then, the lab is a transcript evaluator with unanchored listening notes.
3. **Relationship and emotion change text, not a measured acoustic control.** `emotional.ts`, `relational-runtime`, and Maya compile explicit wording into instructions such as brief, unhurried, acknowledge, Hindi/Hinglish, or a punctuation pause. The current Azure session sends `audio.output: { voice }`; it does not set the documented Realtime `speed`, nor expose pitch, phoneme, style, or per-turn prosody controls. Implement a versioned delivery profile, initially mapping only `brief | normal | unhurried` to a declared `audio.output.speed` between turns, and evaluate it before changing the default.

## What exists versus what is proved

| Area | Current mechanism | Evidence boundary |
|---|---|---|
| Emotion/relationship | Explicit transcript cues; cited repair, pace, language, honorific and approved-memory state; next-turn instructions | Proves deterministic text-policy selection, not that speech sounded calm, warm, brief, or repaired a relationship |
| Maya delivery | Despina profile; spoken-text cleanup; punctuation and natural-speech prompt | Prompted delivery only; no retained output audio or human comparison for this product |
| Hindi/Hinglish | Allowed-language and explicit-switch handling; Devanagari/Roman patterns; input transcription vocabulary prompt | No code-switch ASR, output-pronunciation, switch-point, accent, or listening result |
| Pronunciation | Reviewed vocabulary biases `gpt-4o-mini-transcribe` input | Input spelling hint only. Current native Realtime output has no exact phoneme/lexicon contract |
| Turn taking | Low-eagerness semantic VAD, manual response creation after final ASR and instruction acknowledgement, provider interruption | Any speech start can stop output; no partial-word policy or backchannel/takeover decision exists |
| Latency | Browser event interval and public request-to-first-server-audio interval | Correctly bounded transport observations; neither is audible end-to-end latency |
| Cost | Some public provider token counters | No private-call usage receipt, dated rate-card reference, currency estimate, or cost per valid completed scenario |

Microsoft now documents structured Realtime output speed from 0.25–1.5 and says audio-behavior instructions are guidance, not guaranteed behavior. [Azure Realtime reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/realtime). Azure Voice Live is a separate server-to-server candidate with Azure standard/custom voices, rate control, HD-voice variability, word timestamps, multilingual semantic VAD including Hindi, interruption settings, and noise/echo processing. Availability and quality on this project are unproved. [Voice Live guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to). Exact phoneme and custom-lexicon control belongs to Azure Speech SSML and would be a cascade arm, not a claimed feature of the present native Realtime route. [Azure Speech pronunciation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation).

## Smallest deliverable: Duplex Proof Packet v1

Build one operator-only evaluation surface around the existing Azure WebRTC path. Do not change the customer default or pretend to solve duplex behavior in the first increment. The deliverable makes the present floor measurable and provides the evidence contract for a later Griffin/Tavus-style policy.

**1. Capture the sound that is judged.** Record only the remote assistant `MediaStreamTrack`, never the microphone, using browser `MediaRecorder` as WebM/Opus. Upload after explicit evaluation consent to a tenant-private artifact store. Save `artifactId`, SHA-256, MIME type, bytes, duration, channel count, capture start/end, redaction status, retention expiry, and capture implementation version. A failed or unsupported capture produces `artifactStatus: unavailable` and cannot receive an acoustic rating. Transcript text is a separate artifact and cannot substitute for audio.

**2. Freeze the generating configuration.** Each run manifest binds scenario/corpus version, provider, model/deployment reference, API surface, voice, delivery-profile version and values, VAD configuration, transcription model, vocabulary digest, agent/release version, prompt/runtime-policy digest, knowledge digest, browser/device/network declaration, locale, input mode, and timestamp. Store references and digests, not credentials, endpoints, raw provider payloads, or customer identifiers.

**3. Retain a sequenced duplex trace.** Every event has `sequence`, `turnId`, optional bounded `itemId/responseId`, `kind`, and monotonic `atMs` from capture start. Minimum kinds are local input energy start/stop, provider speech start/stop/commit, partial transcript observed/revised, transcript final, guidance acknowledged, response requested/created/done, first generated audio, remote track playing, captured output energy start/stop, cancel requested/confirmed, playback cleared, and failure. The current adapter will leave partial-transcript events absent; that absence is a measured capability gap. Missing events remain absent. Derived values name both endpoints, for example `localInputEnergyStart→capturedOutputEnergyStop`. Never display an absent value as zero.

Add a reviewed decision record at each overlap: `continue_speaking | yield | cancel_and_repair | uncertain`, with `evidenceBasis: fixture_label | human_review | runtime_signal`. VAD or energy alone can establish overlap, never intent. A partial transcript may inform a runtime policy later, but it is revisable and cannot by itself prove that `haan` was a backchannel or that a correction was complete.

**4. Add blind A/B listening.** The reviewer sees randomized `sample A/B`, scenario purpose, and the target spelling only when rating pronunciation. Hide provider, model, voice, profile, transcript, run order, and hypothesis. Require three Hindi/Hinglish-capable raters per pair, balanced order, tie allowed, one replay count, and separate 1–5 ratings for intelligibility, critical-token pronunciation, natural pacing/prosody, professional warmth/respect, delivery fit to the caller's explicit request, and relationship behavior. “Delivery fit” judges observable output; it must not infer a caller's hidden emotion.

The first packet is 12 matched scenarios: English, Hindi, and intra-sentence Hinglish variants of (a) short `haan/hmm` while the agent should continue, (b) corrective takeover while the agent should yield and repair, (c) explicit stop requiring immediate cutoff, and (d) hesitation or self-repair where the agent should keep listening. Add unfamiliar Indian names, company/product terms, rupees, dates, and phone digits inside those turns. Use consented first-party recorded human input for repeatable causal timing, plus three separately labelled exploratory live calls for spontaneous pauses and overlap. Compare the frozen current policy with exactly one candidate policy. A Voice Live or Griffin-style arm can be added later under the same contract; neither is a prerequisite.

The UI should lead with a three-lane causal timeline: **caller acoustic activity**, **provider/runtime decisions**, and **assistant generated versus captured output**. Selecting an overlap shows the waveform, the exact decision evidence, transcript revisions, and the resulting recovery turn. Put aggregate ratings below this trace. This makes a false stop, late yield, or stale word audible and attributable instead of reducing it to a generic MOS score.

## Metrics and release rule

Report raw denominators and distributions by language and scenario, never one “human” score:

- pronunciation: exact critical-token correctness plus blinded 1–5 pronunciation rating;
- code-switch: switch-point/entity errors and bilingual listener preference;
- duplex behavior: continue-through-backchannel accuracy, yield-to-takeover accuracy, premature stop rate, missed takeover rate, overlap duration, stale words after takeover, and corrected-intent recovery;
- latency: user acoustic onset to provider detection and output cutoff; user acoustic stop to provider stop, response request, first server audio where available, first captured output energy, and complete reply; p50/p90 with `N`;
- relationship: correct honorific/register, specific acknowledgment, use of explicit correction, no invented memory, and caller-confirmed repair kept distinct from fluent delivery;
- cost: provider-reported input/output text/audio quantities plus a dated rate-card ID and currency. Compute estimated cost per valid completed scenario only when every billed component is present; otherwise show **Unknown** and list missing components.

An acoustic gate can pass only when every scored item has a playable hash-matched artifact, exact manifest, complete reviewer assignment, and no unresolved critical failure. The small packet may select a profile for a larger pilot; it cannot support “best voice,” “native Hinglish,” “emotion-aware,” competitor-superiority, or production-readiness claims. Preserve the existing transcript-only `uncertain` rule for acoustic criteria and keep audio evidence outside the text-regression release gate until this contract is implemented and reviewed.
