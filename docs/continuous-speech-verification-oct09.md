# Continuous speech verification — 9 October 2026

Status: **terminally verified within scope**. Independent authority, causality and UI reviews, typecheck, 900-test suite, production build/package, readiness, gateway startup, one bounded actual Azure lifecycle probe and scoped no-microphone browser interaction pass.

Implementation checkpoints: `62a715e` pins and hardens the dependency boundary; `66e44e0` contains the continuous-recognition/preparation feature, runtime, tests and bounded smoke harness. Documentation/continuity follows separately.

## Verified baseline

Clean commit `201f70a` contains the terminally scoped duplex/launch increment: 804/804 tests, corrected production build and standalone-package check, packaged readiness HTTP 200, browser/UI SHIP, one typed WebRTC timing-persistence preview, and bounded Azure WebSocket/Speech SDK capability probes. Its exact evidence and exclusions remain in `docs/duplex-and-launch-verification-oct09.md`. The continuous-speech increment earned its separate scoped verdict through the evidence below.

## Implemented authority boundary

Continuous recognition is opt-in and private. The application issues a single-use, origin-bound ticket only for an authorized live private Azure microphone call after explicit consent. A durable lease limits active recognition per user. The gateway claims the ticket before allocating provider resources and rechecks authority before recognition starts and periodically while it runs. `POST` starts the grant and `DELETE` revokes it. Expiry, revocation, duplicate start, invalid input, disconnect, provider failure or shutdown closes the sidecar and its resources.

Azure Speech credentials remain on the server. The browser receives neither the subscription key nor a provider bearer token, and credentials are not accepted in query parameters. The private `/private-speech` protocol is separate from the existing public `/voice` gateway. Local insecure transport is disabled unless an explicit loopback-only flag is set; the private URL and flag require later local configuration without storing values here.

## Implemented media and lifecycle boundary

The browser reuses the same already-authorized call microphone; the sidecar does not request or own another stream. An AudioWorklet produces 16 kHz mono signed PCM16 in exact 20 ms, 640-byte frames. Its anti-aliased FIR/resampler preserves state across render quanta. Muting advances the same sample clock with zero-filled frames, clears partial/filter history and prevents delayed pre-mute audio from surfacing after an epoch change.

The bounded browser client performs one authenticated start, streams binary frames, and closes without automatic reconnect. The gateway caps authentication/input-idle/startup time, session duration, submitted PCM bytes, concurrent transports, per-user recognition, message size, callback rate and output backpressure. Late asynchronous authorization or allocation cannot restart a closed session. Sidecar failure does not end the native Azure Realtime call.

The installed production dependency is pinned to `microsoft-cognitiveservices-speech-sdk` 1.52.0. A narrow version-specific push-buffer guard fails closed when the expected SDK structure is unavailable. The gateway disables SDK telemetry and provider reconnect. Any SDK upgrade must revalidate buffering, startup and cleanup before changing the pin. Current dependency corrections include Next 16.4.0, sharp 0.35.5 and source-map-js 1.2.2. `npm audit` retains one three-package moderate chain from the Mammoth CLI path through argparse/sprintf-js; the reviewed incompatible override was rejected, the chain is not loaded by the product API, and ingestion checks pass 12/12. This does not waive future dependency remediation.

## Implemented causal boundary

Each hypothesis belongs to a sidecar epoch, internal segment and monotonic revision, with bounded sample offsets on the sidecar's submitted PCM timeline. A native-call generation guard rejects stale observations. Partials replace the current hypothesis; they do not append transcript turns or become relationship memory.

The ephemeral controller may compile tentative response hints only after two consecutive revisions produce equal compiler output. Its `prepareBehavior` path is separate from authoritative `behavior`. Hints may prepare an instruction candidate, but cannot persist facts, execute tools or actions, call `response.create`, or override the native call transcript. The scheduler still waits for committed native final transcripts, publishes them in speech order, runs authoritative compilation and requires exact final reconciliation before response creation.

The opt-in UI labels words and response cues as tentative, replaces them as revisions change, clears them on mute/end, and states that they are not saved. Persisted diagnostics are allowlisted metadata only: bounded counts, durations, byte totals and closure reasons. They exclude audio, hypotheses, transcript text, instructions, tickets, credentials, provider identifiers and payloads.

## Focused and independent-review evidence

- PCM capture and worklet, including requested 16 kHz and 63-tap FIR fallback: **15/15**.
- Independent provider/gateway authority review after abort/claim, buffering and Node 24 compatibility fixes: **21/21**.
- Application authority, ticket and lease review after CAS fixes: **15/15**.
- Real controller/scheduler/browser-wrapper causal integration after generation and post-end observer fixes: **12/12**.
- Private preparation ordering: **6/6**.
- Diagnostic normalization and legacy compatibility: **36/36**.

The independent reviewers report no remaining P1/P2 finding within their bounded authority and causal scopes. Root typecheck passes and the full suite passes **900/900** in 79.18 seconds. The Next 16.4 production build exits zero and the postbuild standalone-package check passes with 1,113 inspected entries. Packaged app readiness returns HTTP 200. A compiled 161.8 KB Node gateway bundle starts locally; loopback health returns HTTP 200 with private speech reported as application-authorized, and the public worklet asset returns HTTP 200. Retained logs are `data/continuous-final-typecheck.log`, `data/continuous-integrated-tests.log` and `data/continuous-build.log`.

## Claims explicitly not established

The three earlier Azure Speech experiments—file input, an inconclusive paced attempt with a lost report, and one corrected paced SDK validation—remain capability evidence for the prior increment.

One explicitly bounded actual Azure feature probe completed once with no retry. It used isolated in-memory fictional authorization, a synthetic issued private preview, the production POST grant, actual WSS gateway, Azure SDK and 270 worklet-generated PCM frames. It produced four interim revisions and one sidecar final, rejected a duplicate claim, then DELETE revoked the grant and the ticket/lease closed. The gateway became ready at 1,083 ms; first interim arrived at 5,464 ms; SDK final at 6,305 ms; input completed at 6,519 ms; DELETE followed at 6,520 ms; terminal/lease/server closure completed by 7,129 ms. A watchdog-harness cleanup correction followed the attempt without a retry and TypeScript still passes.

This single probe verifies the integrated grant/gateway/provider/revocation lifecycle with synthetic audio. It is not a browser-microphone, native-Realtime, recognition-accuracy, Hindi/Hinglish, acoustic, perceptual, interruption, end-to-end or low-latency result. Its timestamps must not be generalized as product latency.

On the packaged browser build, the private configuration reports the feature available. Explicit opt-in updates consent and disables Listen & type; turning it off and using typed input disables the feature; returning to microphone mode restores availability. The inspector reports available, ready and off states truthfully. Root reviewed four captures across 1280 × 720 and 390 × 844. No browser microphone permission was granted, no call was started, and tentative/capture-filled states were not visually exercised. The bounded live lifecycle probe above remains the only current feature provider evidence.

The independent finish reviewer returned **SHIP** for all four captures plus source review and **39/39** focused checks, with no material P0–P2 finding. See `docs/continuous-speech-finish-review-oct09.md`. This verdict covers the available/off/ready and consent interaction only; it does not fill the untested microphone/capture states.

This source is not Tavus Griffin or a native continuous conversational model. It does not select learned hold/yield/backchannel intent, generate a response from pre-final speech, prove simultaneous listening during output, maintain word-aligned heard history, or provide physical-microphone, acoustic, perceptual, interruption, Hindi/Hinglish, p50/p95 latency, hosted-operation or production evidence. Tentative recognition can be wrong and must never be described as final understanding.

## Broader evidence still required

- browser-verify same-stream physical-microphone capture, mute/unmute clearing, tentative replacement, native-final response authority, sidecar failure isolation, cleanup and metadata-only saved diagnostics;
- evaluate recognition accuracy, Hindi/Hinglish behavior, acoustic quality, interruption behavior and p50/p95 end-to-end latency with recorded and live microphone evidence;
- build continuous floor-intent selection and streamed revision only if it can preserve the proven native-final authority boundary; and
- establish hosted WSS operation, real external-channel behavior, customer-pilot value and production readiness separately.

Preserve the single bounded live feature probe as lifecycle evidence only. Any repeat or browser-microphone probe requires separate authorization and must report event order separately from acoustic or end-to-end latency.

Keep credentials, endpoints, tickets, identifiers, audio, hypotheses, transcripts and provider payloads out of this record. No Docker, hosted deployment or new provider is part of this increment.
