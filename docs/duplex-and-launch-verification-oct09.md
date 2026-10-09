# Duplex and launch verification — 9 October 2026

Status: **terminally verified within the scoped increment**. Frozen-source tests, corrected build/package, focused checks, readiness, bounded Azure probes, browser behavior and independent UI SHIP pass. This record does not upgrade the earlier voice verdict or claim full-duplex voice.

## Proven baseline before this increment

Clean commit `7622cf2` retains the completed October 9 local packet: 746/746 integrated tests, production build, postbuild package check, readiness HTTP 200, reviewed text-regression evidence, scoped UI SHIP, and one saved Azure Realtime Listen & type wording calibration. `docs/oct09-workflow-verification.md` is the detailed evidence record. That calibration did not use a physical microphone and provides no acoustic, listening-quality, end-to-end latency or device result.

## Implemented release and product-flow boundary

The implementation:

- apply the same server-side current-evidence decision to publish and rollback, so an entry point cannot bypass stale, missing, failed or unreviewed required text cases;
- present that decision through one shared review component in Agent Publish and Release history;
- keep legacy releases honest when they have no modern evidence receipt; and
- make Outcome/Home the primary continuation after release while keeping campaign binding, campaign preflight and campaign launch as separate explicit actions.

A passing build or UI state alone would not prove the authority boundary. The terminal proof includes focused service tests for both publish and rollback, UI tests for both entry points and the outcome continuation, the integrated suite, typecheck/build/package, final-diff review and separately reported browser proof.

## Implemented private-turn preparation boundary

The implementation moves only an exact instruction acknowledgement out of the post-utterance critical path:

1. After speech starts and prior cancellation/tool work is clear, the scheduler may send one uniquely revisioned candidate derived from the approved baseline and current bounded behavior.
2. A matching `session.updated` while the caller is speaking marks only that candidate as acknowledged. It cannot call `response.create`.
3. Committed utterances still require final transcripts. They are published in speech order and synchronously compile the authoritative current-turn behavior.
4. The acknowledged candidate may be reused only when generation, baseline/context and the full compiled behavior match exactly. Otherwise the scheduler sends and waits for a fresh final update.
5. Existing generation fences, interruption settling, tool serialization, timeout/fail-closed behavior and response authorization remain in force.

The associated diagnostics may retain bounded metadata-only counts and client-event durations for speech stop → final ASR, final ASR → guidance ACK, guidance ACK → first generated output, response request → first generated output, pre-ACK hit/miss and the observed placement of ASR delta events. They must not persist transcript deltas, instructions, raw audio, provider payloads or provider identifiers.

## What this increment cannot establish

Pre-ACK overlap is not Tavus Griffin-style full duplex. It does not reason from partial semantic speech, choose learned hold/yield/backchannel actions, stream revised semantic content during user speech, prove continued listening during output, or maintain word-aligned heard/cancelled history. Observing a provider transcription delta does not show that usable pre-commit text exists, and the current design does not consume delta text for behavior, tools, memory or response eligibility.

No new Azure Speech/Voice Live resource, Tavus account, Griffin/Griffin-Lite entitlement, API or adapter has been configured. The bounded provider/browser traces below prove one exact pre-ACK reuse and partial-before-complete capability, but no physical-microphone, acoustic, human-listening, overlap, barge-in-recovery, p50/p95 end-to-end latency or Hindi/Hinglish quality result. Tavus Griffin remains the architectural priority; current EmotionalOS/RelationalOS behavior remains bounded to observable cues and reviewed relationship evidence rather than an emotion diagnosis or continuous multimodal controller.

## Focused automated evidence received

Private preparation now passes **60/60 focused tests** plus `tsc --noEmit`, including the 24 ordering permutations and five diagnostic-reentrancy regressions. These checks cover preparation only after response/cancellation/tool work drains; final committed ASR publication in speech order; exact final baseline/behavior reconciliation; fresh serialized acknowledgement after a context or generation change; no response authorization from partial transcription; reentrant close/new-speech safety; and bounded numeric diagnostics with legacy persistence compatibility. This is deterministic code evidence. No browser, provider, build, acoustic, perceptual, speed or native-full-duplex result follows from it.

An independent final bounded architecture recheck passes **24/24 preparation tests** plus both original inline reentrancy probes. It confirms the close/new-speech observer fence and reports no remaining finding within the audited `releaseEligible` scope. This is scoped scheduler evidence, not a whole-runtime or provider-quality review.

Release authority and its shared UI pass **36/36 focused checks** plus TypeScript. Outcome/Home routing passes **14/14**. Exact case/version selection and route helpers pass **9/9**, including fail-closed manual recovery, and timing UI passes **9/9** plus TypeScript. Frozen-source terminal automation passes **804/804** in 84.68 seconds. The first paired terminal build compiled application source but failed TypeScript on an unused test-only `@ts-expect-error`; that failure is retained in `data/oct09-duplex-terminal-build.log`. The annotation was removed, its focused pacing test passed 1/1 without a runtime change, and the corrected production build/postbuild standalone-package check passed with `ok: true` across 1,104 inspected entries. Retained terminal evidence is `data/oct09-duplex-terminal-tests.log` and `data/oct09-duplex-corrected-build.log`. Packaged readiness returned HTTP 200.

One explicitly authorized Azure WebSocket probe completed against the changed protocol. The sanitized ignored report records a 9,591 ms paced synthetic run with exactly one response, one final ASR and one speculative candidate reused. The matching acknowledgement arrived while input was still being paced; final ASR followed speech stop, and response request → first generated transcript was 1,148 ms. All 18 observed ASR deltas arrived after commit, with zero before commit or during speech. This confirms exact pre-ACK wire reuse for one synthetic turn. It does not prove pre-end incremental ASR, WebRTC, microphone behavior, acoustic output, human-perceived latency, interruption recovery, full duplex or production readiness. No retry or additional provider sample was used for this result.

Three Azure Speech SDK experiments were tracked separately: file input; an intermediate paced attempt whose report was lost and is therefore inconclusive; and one corrected paced validation. The corrected run observed the first partial at 2,162 ms, before input completed at 6,552 ms, then the final at 6,901 ms with eight partial revisions, one final result and the expected end-of-stream event. The source audio was 4.2 seconds but required 6.55 seconds of wall-clock input because of pacing/jitter on a contended host. This establishes partial-before-complete capability in that synthetic SDK path. It is not calibrated realtime, browser/WebRTC, microphone, acoustic, end-to-end latency or full-duplex evidence.

Local browser verification shows the shared Release review on a current existing release with its required case passed, while a legacy release accurately reports that no modern evidence receipt exists. Home resumes an actual saved campaign at its exact Audience phase.

A new actual Azure WebRTC **Listen & type** private preview connected, completed three entries (greeting, one fictional typed user turn, one assistant response), ended after 33 seconds and saved. Reopening the conversation preserved the timing diagnostics: 3,669 ms client-observed connect, 1,743 ms accepted typed turn → first generated output, and 862 ms response request/ACK → first generated output. Microphone stages correctly showed **Not observed**. This verifies the browser instrumentation and persistence path for one typed preview. It used no physical microphone, acoustic listening or tool receipts, so it establishes no acoustic, microphone, interruption or end-to-end voice result.

The preview also exposed a bounded relational defect: an explicit request to keep the conversation brief produced zero expected state transitions. That saved call remains historical failure evidence. The regex correction now passes **30/30 deterministic checks** across three test groups. No additional provider call was used or needed to prove this cue-recognition rule.

Browser error recovery also shows that invalid case/version focus renders a visible error without falling through to an unrelated candidate or run. Refresh preserves the boundary, while explicit case selection recovers candidate v1 and the intended historical attempt without a provider call. The independent reviewer returned **SHIP** for nine release, Home and timing captures across desktop, user-width and mobile plus 39 focused checks. See `docs/duplex-finish-review-oct09.md`.

## Broader evidence still required

- a continuous floor-control path that can evaluate hold/yield/backchannel behavior from authorized pre-end observations rather than only prepare an instruction acknowledgement;
- browser integration and causal evaluation for any future Azure Speech sidecar before its file/paced capability result becomes a product feature;
- recorded-audio, physical-microphone, interruption and blinded listening work under `docs/voice-quality-program-oct09.md` before any acoustic, low-latency or full-duplex claim; and
- hosted operation, real external-channel, customer-pilot and production-readiness evidence.

Future changes must preserve the proven current-evidence publish/rollback authority and the scheduler's exact-match, fail-closed boundaries. Keep secrets, IDs, transcripts, raw audio and provider payloads out of this record.
