# Voice Quality Benchmark: Indian Business Conversations

**Purpose.** This is a repeatable evaluation design for a voice-first business assistant, not a claim that any provider or configuration is better today. It evaluates a disclosed AI that is helpful, natural and relationship-aware without impersonating a person. The product must say it is an AI at call start and offer text/captions and human help; “humanlike” here means conversational timing, clarity and respectful repair, never concealed identity.

## What is being compared

The unit is a versioned *run*: provider/adapter versions, STT, LLM, TTS voice and settings, prompt, knowledge snapshot, endpoint/interruption policy, network profile, scenario, and random seed. Preserve raw audio only under the test consent policy; store redacted audio hashes, transcripts, timing events, tool inputs/results, policy decisions, and trace IDs.

Run three arms, named accurately:

1. **Vapi pipeline** — Vapi's supplied turn-taking/orchestration path.
2. **Bolna pipeline** — Bolna's supplied path.
3. **ElevenLabs pipeline** — ElevenLabs Agents path.
4. **Reference orchestrator** — the product's provider-neutral orchestration using one selected STT/LLM/TTS stack.

The first three test integrated pipelines; the fourth tests our orchestration design. They are not interchangeable evidence. Where APIs permit, repeat a **controlled-components** slice with the same STT, LLM, system prompt, retrieval index, tool stubs, TTS text, region, browser, audio codec, concurrency, and call script. Also report a **native-best-practice** slice with each provider's documented configuration. Do not call one arm “better” solely because its bundled model, knowledge source, or geography differs. If equal components cannot be set, mark the comparison *not attributable* and compare only end-to-end user outcomes.

This separation matters: Vapi documents different smart/text endpointing paths and says smart endpointing is English-only; ElevenLabs exposes configurable turn eagerness and interruptions; OpenAI documents that an audio transcript can diverge from the model's audio interpretation. [Vapi voice pipeline](https://docs.vapi.ai/customization/voice-pipeline-configuration), [ElevenLabs conversation flow](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow), [OpenAI Realtime events](https://platform.openai.com/docs/api-reference/realtime-server-events/input_audio_buffer/committed?lang=node).

## Corpus and protocol

Start from `sales-enabler/evals/scenarios.json`; retain its 20 acceptance cases as non-negotiable contracts. Add a locked, versioned corpus of 240 scripted calls: 120 Hindi-English code-switched and 120 English, balanced across four Indian regions/accent groups, gender self-description where volunteered, quiet/café/office noise, headset and laptop microphones, and 8/16/32 kbps network profiles. Recruit adult consented speakers; use synthetic identities and fictional business records. Keep 20% hidden until release selection.

Each call has an authored goal, allowed facts, a tool-stub state machine, expected safety behavior, and timed audio marks. Include the existing cases for continuation pause, acknowledgements, correction during speech, background speech, Rohan Mehta/Mehra, spoken/spelled names, numbers, relationship memory, revocation, authorization, delayed/corrected writes, duplicate writes, absent knowledge, handoff, recording consent, thinking time, continuity, traceability and captions. Add counterbalanced variants for dates (`this/next Tuesday`), Indian phone/payment/reference formats, Roman Hindi plus Devanagari, names and places, switches within a sentence, spelling, and corrections.

Gold labels are semantic intent plus canonical entity/number forms; accept transliteration variants only when a bilingual adjudicator judges them equivalent. Report exact **critical-token accuracy** separately for names, numbers, dates and IDs, plus code-switch word/entity error rate after documented normalization. This avoids hiding a wrong account number inside a good aggregate transcript score; Hindi-English code-switching is a distinct ASR problem with speaker and accent variation. [Hindi-English corpus](https://arxiv.org/abs/1810.00662) and [code-switch metric study](https://arxiv.org/abs/2211.16319).

For each arm, run every fixed fixture three times on three days, randomized and blind to raters. Replay the same recorded user audio for comparable latency tests; separately run live-speaking sessions to expose echo and overlap. Do not use production customers or a live knowledge base. Tool stubs must return identical latency/error distributions; the knowledge snapshot and citations are identical and timestamped.

## Metrics (report distributions and denominators)

**Turn-taking and latency.** Record end-of-user-speech → VAD/endpoint, endpoint → response request, request → first audio byte, first byte → audible playback, and end-to-end audible response. Report p50/p90/p95/p99, median absolute deviation, and sample count by language, network, and scenario—not a single average. Measure premature endpoint rate (answer begins before a labelled continuation), missed/late endpoint rate, and silence-timeout appropriateness. These are observables, not borrowed “good” thresholds; vendor guidance itself describes a responsiveness/false-interruption trade-off. [OpenAI VAD](https://platform.openai.com/docs/api-reference/realtime?lang=javascript), [ElevenLabs latency concepts](https://elevenlabs.io/docs/eleven-api/concepts/latency).

**Barge-in.** For true interruptions, measure false-negative rate, time from user onset to playback mute, stale-audio leakage after interruption, cancellation of obsolete tool work, corrected-intent adoption, and recovery success (one concise acknowledgement then correct continuation). For backchannels/noise, measure false-positive interruption rate and unwanted restarts. Count both types; optimising only mute speed is unsafe.

**Grounded business execution.** Task-completion rate is completed goal / eligible calls, with separate “correctly declined or handed off” outcomes. Score factual grounding: every externally verifiable claim is supported by the supplied snapshot/citation, correctly expresses uncertainty, or is safely refused/escalated. Report unsupported-claim rate per 100 claims, fabricated action rate, and wrong-record disclosure rate. No hallucination measure may use the model as its sole judge.

**Relationship, memory and permissions.** On paired calls, score continuity only when it recalls the correct scoped, sourced fact; correction/revocation must supersede prior memory; and permission/identity gates must block disclosure/action until satisfied. Report precision/recall for allowed recall, stale-memory rate, correction persistence, unauthorized-disclosure rate, confirmation-before-write rate, idempotent-write rate, and handoff completion with a correct, minimum-necessary summary.

**Speech and preference.** Independently rate intelligibility, pronunciation of critical tokens, natural pacing/prosody, interruption response, warmth/respect, and whether the interaction feels easy—not whether raters believe it is human. Use 1–5 absolute-category ratings and randomized A/B preference (tie allowed) on matched clips and complete calls. Follow listener qualification, balanced presentation, reliability checks, and confidence intervals from [ITU-T P.808](https://www.itu.int/rec/T-REC-P.808-202106-I/en). Report by language/accent and device; a pooled MOS masks failures.

**Economics and reliability.** Attribute STT/LLM/TTS/platform/tool/network cost and compute cost per *correctly completed eligible outcome*, including retries, handoffs and failed calls. Publish the numerator, denominator, prices/date, duration distribution, error/reconnect rate and censoring rule. Never substitute cost per minute for this outcome metric.

## Human rating and adjudication

Use bilingual Hindi-English raters from the intended business audience, with no provider brand, voice name, transcript, or test hypothesis shown. Randomize arm/order, cap fatigue, include known-answer attention and audio-quality checks, and retain rater demographics only in aggregate. Three raters score every safety, factual, relationship and task label; a fourth bilingual adjudicator resolves disagreement using the gold scenario and trace, without seeing provider identity. Publish inter-rater agreement, exclusions, missing data and 95% bootstrap confidence intervals. Human preference is a complement to task and safety evidence, never a replacement for it.

## Gates for a defensible “better” claim

Release candidates first pass every deterministic scenario contract, have zero unresolved critical events (wrong-record disclosure, unauthorized write, fabricated commitment, failure to honor correction/revocation, or failed requested handoff), and expose a complete trace. Then define *before looking* at results: primary metric (correctly completed eligible outcome), non-inferiority margins for critical-token accuracy and p95 end-to-end latency, and superiority margin for blinded preference. Call an arm better only if it clears safety gates and its pre-registered primary comparison has a confidence interval beyond that margin under equal conditions. Otherwise say “no demonstrated difference,” “trade-off,” or “not comparable.” Re-run hidden fixtures before release and after any provider/model/prompt/knowledge/policy change.

## Test Lab UI requirements

The Test Lab is an evidence workspace, never a scoreboard of imaginary live results. Default state: **No live results yet**. It should let an operator select a locked benchmark version and arms, inspect the component/knowledge/provider-difference matrix, queue replay or consented live runs, and label run status (`queued`, `running`, `invalid`, `complete`, `needs adjudication`).

Each result view needs: distribution charts with N and confidence intervals; scenario/language/network filters; safety-gate failures first; paired A/B rater evidence; cost-outcome denominator; and “not attributable” badges. A trace view must show the timestamped audio/VAD/endpoint/playback/interruption events, transcript revisions, retrieved source IDs, memory provenance/scope/correction, policy decision, tool correlation/idempotency state, handoff packet, configuration hash and redaction status. Replay must reconstruct the event sequence with clearly synthetic/test data, not masquerade as a customer call. Export a signed run manifest and anonymized evidence bundle; raw audio remains permission-controlled.

## Source basis

The current design draws on the primary documentation and research linked above plus [Azure language identification](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-identification) (continuous LID has limits within a sentence), [Google STT language support](https://docs.cloud.google.com/speech-to-text/docs/v1/speech-to-text-supported-languages), and [ElevenLabs speech-engine interruption protocol](https://elevenlabs.io/docs/api-reference/speech-engine/speech-engine-upstream?explorer=true) (newer transcript event IDs supersede stale responses). These sources define available mechanisms and measurement cautions; none is evidence of a benchmark result.
