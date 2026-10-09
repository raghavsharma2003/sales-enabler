# Voice-product delta: Vapi, Retell, ElevenLabs Agents, and Bolna

**Research date:** 2026-10-09
**Scope:** Changes since the 2026-10-01 Relay research, using official public docs and dated official changelogs only. No accounts, calls, purchases, uploads, or live dashboards were used. An official description proves the documented product contract, not voice quality, reliability, Indian-language accuracy, or business results.

## Top three actions for Relay

1. **Add a version-bound voice evidence gate.** A candidate release should carry reusable scenarios plus measured turn/model/voice latency, named-term recognition, barge-in, short-answer, number-reading, silence, and noisy-line results for each supported language/channel profile. Vapi's 5 October simulation limits are the clearest new implementation reference: a required threshold can fail a voice run, while an optional threshold records evidence without blocking it. Store the aggregation, sample count, measured value, test mode, exact agent version, and audio/runtime profile; never let a text run satisfy an acoustic gate.
2. **Make extracted outcomes typed, source-linked, and correctable.** Adopt Bolna's 8 October per-value definitions and allowed values as a schema-authoring pattern, then go further: every result must say whether it was customer-stated, tool-confirmed, AI-inferred, operator-reviewed, conflicting, or unknown. Link the exact transcript turn/tool receipt, preserve correction history, and keep `qualified` or `booked` from becoming truth merely because an evaluator emitted the label.
3. **Turn “Prepare to publish” into one review packet.** Adapt ElevenLabs' 5 October merge proposal into founder language: purpose, before/after fields, originating conversation or ticket, affected knowledge/actions, regression and voice results, target channels, privacy changes, reviewer decision, rollout, and rollback. Keep Relay's immutable version/release/deployment objects underneath; do not import branches, rebases, or merge conflicts into the default founder flow.

## What actually changed after 1 October

### Vapi — dated 5 October 2026

**Documented facts.** Vapi added latency expectations to voice simulations. A simulation can apply up to 20 limits across turn, model-first-token, and voice-first-audio latency, aggregate by median, mean, P95, or maximum, and mark a limit required or informational. Required failure affects the scenario result. Chat runs skip these checks; GPT-Live targets currently skip per-turn latency; unmeasurable metrics in a voice run fail rather than silently pass. Results include threshold, actual milliseconds, sample count, pass state, and skip reason. [Official 5 October update](https://docs.vapi.ai/whats-new) · [Simulation latency documentation](https://docs.vapi.ai/observability/simulations-advanced#set-latency-limits)

Vapi also added a Soniox low-confidence filter. It discards an entire final transcript below a configured 0–1 threshold, calculated as the mean of per-token scores. The same page documents automatic multilingual transcription and code-switching when no language restriction is supplied. These are configuration contracts, not evidence of Hindi/Hinglish accuracy. [Soniox configuration](https://docs.vapi.ai/providers/transcriber/soniox#low-confidence-filter)

New model availability included ElevenLabs v4 Turbo, GPT-6 Luna, and Deepgram Nova-3 Pharma. This is inventory churn, not a Relay roadmap reason. Relay's only paid inference route remains Azure. [Official 5 October update](https://docs.vapi.ai/whats-new)

**Adopt/adapt/reject.** Adopt measured latency criteria and explicit skipped/unmeasurable states. Adapt them into task profiles rather than one global budget: an interrupted qualification call and a slow evidence-heavy answer have different acceptable distributions. Adapt confidence filtering only behind language/profile-specific tests; record dropped utterances and false rejection, because suppressing uncertain speech can hide customer intent. Reject provider/model picker expansion and unverified “faster” or “better voice” labels.

### Retell — no dated post-baseline release found

Retell's official changelog still lists **24 August 2026** as its newest entry as of 9 October. Current docs continue to describe the already-reviewed testing ladder, Conductor, environment tags, contact memory, session history, AI QA, and custom dashboards; they do not provide a dated post-1 October delta that this report can safely attribute. [Official changelog](https://www.retellai.com/changelog) · [Testing overview](https://docs.retellai.com/test/test-overview) · [Agent versions and tags](https://docs.retellai.com/agent/version) · [Contact memory](https://docs.retellai.com/features/contact-memory)

**Decision.** Keep the 1 October recommendations: staged text/simulation/web-audio/phone evidence, conversation-to-regression, and environment-tagged release bindings remain useful references. Do not report contact memory or current dashboard pages as newly shipped in October without a dated first-party release record. Retell's QA outputs remain automated judgments that need transcript/tool evidence and operator correction.

### ElevenLabs Agents — dated 5 October 2026

**Documented facts.** ElevenLabs launched merge proposals in alpha. A proposal connects a source and target agent branch, configuration changes, test-run pass rates, recent conversations, review comments, approval or changes-requested verdicts, and the final merge. At least one non-author approval is normally required and unresolved changes-requested verdicts block merging; an admin can bypass the approval. Architect can draft and test a change and open a proposal, but cannot review, approve, merge, or close it. Required pre-merge tests and named reviewer requests are explicitly described as planned, not present. [Official 5 October changelog](https://elevenlabs.io/docs/changelog#october-5-2026) · [Merge proposals](https://elevenlabs.io/docs/eleven-agents/operate/merge-proposals)

The same release added deployment-history retrieval, cancellation for running test invocations, triage priorities/sorting, and a batch-result preview limit. It also added privacy controls to omit transcripts from post-call transcription webhooks and preserve selected collected values while redacting their rationales. Structured procedures now compile and validate on save/publish, returning per-procedure errors; the separate compile endpoint became legacy. Eleven v4 Turbo became the default conversational TTS model in the API schema. These are documented contracts; the voice-quality and latency descriptions remain vendor claims until Relay runs perceptual/device tests. [Official 5 October changelog](https://elevenlabs.io/docs/changelog#october-5-2026)

**Adopt/adapt/reject.** Adapt proposals into Relay's publish packet and preserve separation of author, reviewer, and publisher for high-impact deployments. Adopt cancelable test runs, deployment history, and prioritized review queues. Adapt transcript omission and selective retention as explicit deployment-level privacy choices with visible downstream consequences. Reject alpha Git workflow vocabulary for the default UI, automatic model-default changes, and any admin bypass that becomes invisible in the audit trail.

### Bolna — dated 2, 7, and 8 October 2026

**Documented facts.** Bolna's October changelog adds:

- **2 October:** Sarvam `saaras:v4` keyword biasing, with up to 50 terms of 64 characters; older models do not use it. [October changelog](https://www.bolna.ai/docs/changelog/october-2026) · [Sarvam transcriber](https://www.bolna.ai/docs/sarvam-transcriber)
- **7 October:** AssemblyAI session controls for silence, interruption delay, VAD threshold, and voice focus. Bolna automatically supplies the last agent utterance as recognition context, limited after barge-in to what the caller heard. It also documents longer non-Latin context support. [October changelog](https://www.bolna.ai/docs/changelog/october-2026) · [AssemblyAI](https://www.bolna.ai/docs/assemblyai)
- **8 October:** graph-edge extraction fields gained descriptions and allowed values; latest collected values can appear as `node_extracted_data` on executions and webhooks, with reserved-name validation. [October changelog](https://www.bolna.ai/docs/changelog/october-2026) · [Inline extraction](https://www.bolna.ai/docs/graph-agent/edges-and-routing#inline-data-extraction)
- **8 October:** a live-call web-search tool with OpenAI, Exa, Firecrawl, or Parallel, a pre-tool message, and result-count control. [October changelog](https://www.bolna.ai/docs/changelog/october-2026) · [Web search](https://www.bolna.ai/docs/tool-calling/web-search)

**Adopt/adapt/reject.** During onboarding, derive a reviewed pronunciation/recognition glossary from approved company sources and task fields; bind it to the exact language/transcriber profile and include those terms in voice regressions. Adapt agent-utterance context and pause/VAD controls as test dimensions, especially for names, OTPs, addresses, short yes/no answers, and barge-in. Adopt typed extraction definitions but retain Relay's result-column review, evidence states, and correction path.

Reject general web search as default company grounding. If added later, treat it as a separately authorized tool with an allowlist, source/time citation, prompt-injection boundary, failure/timeout state, and no automatic conversion into Company Brain or customer memory. Bolna's listed providers also conflict with Relay's Azure-only paid route; no new paid provider should be enabled to copy this feature.

## Relay decision matrix

| Area | Adopt now | Adapt carefully | Reject/defer |
| --- | --- | --- | --- |
| Onboarding/data grounding | Reviewed task glossary; typed result schema | Temporary web evidence as a separately scoped tool | Open web as company truth; provider-led setup |
| Voice tests | Required and informational latency limits; explicit skipped states | Per-language named-term, barge-in, noise, short-answer and number suites | One global confidence/latency score; text-as-audio proof |
| Conversation evaluation | Evidence-linked outcome values; correction history; prioritized exceptions | AI graders as triage with `unknown` and evaluator-dispute paths | Evaluator label as ground truth |
| Deployment controls | Immutable candidate, test packet, human review, deployment history, rollback | Transcript/webhook retention choices per channel and purpose | Silent admin bypass; automatic model-default adoption; alpha Git UX |

## Evidence boundary

This delta verifies official descriptions and dates only. It does not establish signed-in UI parity, plan availability, service reliability, call quality, latency on Relay's devices/network, Hindi or code-switch accuracy, evaluator validity, legal compliance, or production readiness. Retell has no attributable post-1 October dated release in its official changelog. Relay should validate every adopted voice behavior using its Azure-bound stack and real microphone/device evidence before changing a readiness claim.
