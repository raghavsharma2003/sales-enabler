# Public voice response evidence — 1 October 2026

The public Azure WebSocket gateway now retains bounded server observations alongside its canonical conversation record. This is the first implementation adopted from the fresh turn-taking research: make measurable claims possible before changing models or claiming better audio.

## What is recorded

For at most forty response ordinals, the server can record request, provider-response creation, first nonempty accepted audio and terminal-event offsets. The named latency is **response requested → first audio received by the server**. It uses a monotonic clock, not wall-clock differences. Invalid clock samples leave offsets absent. Token usage comes only from the existing sanitized provider terminal summary; unknown counters stay absent.

A local cancellation request has its own boolean and optional timestamp. `cancelled` and terminal status require an observed provider terminal event. A late terminal receipt belongs to the original response ordinal and cannot alter the newer active response. Late discarded audio remains excluded. Audio bytes mean audio accepted by the gateway before discard, not sound heard by the visitor or total billed generation.

The evidence DTO contains no transcript, audio data, provider/item IDs, endpoints, credentials or customer identifiers. It is labelled `basis: server_transport` and `capture: best_effort`. It is not an acoustic, microphone, browser-playback, full-duplex or user-perceived latency measurement.

## Persistence and failure behavior

Observations stay in memory during live turns. They do not add telemetry writes ahead of user turns or transcript operations. Finalization attempts a separate sequential flush with a total wait bounded to 200 ms, then finishes the conversation. A callback that rejects or never settles cannot trigger provider retries or indefinitely delay finalization. Missing or partial capture is an expected outcome of storage failure, a slow flush or process loss; consumers must not turn missing observations into zero or silently include incomplete records in performance comparisons.

Persistence requires the active, claimed server voice conversation and uses compare-and-set updates and turn identity checks. Late callbacks after finalization cannot change its canonical session. Browser-submitted session creation drops forged `voiceEvidence` and `serverCaptured` fields. Existing public inference, owner/source revocation, playback and delivery authority rules are unchanged.

This slice covers the **public WebSocket voice route**. Private builder/WebRTC and Maya evaluation diagnostics are not automatically upgraded by it. There is no new comparison dashboard or competitor ranking in this change.

## Verification

The final full suite passed **559/559** tests. The focused new evidence plus existing gateway/service suites passed **30/30**; standalone typecheck, production build and private-artifact package validation passed. Tests cover exact offsets, unavailable clock samples, nonempty audio, cancelled-response correlation, token redaction, never-settling telemetry, idempotent persistence, finalization fencing and forged browser evidence.

There was no successful live model inference in this October 1 pass because Azure data-plane connections were intermittent. These tests establish implementation contracts, not a measured voice-speed or naturalness improvement. The September 27 four-response native and browser-call evidence remains separately dated.

Next evaluation: first-party consented English/Hindi/Hinglish scenarios with synchronized browser/playback observations, explicit interruption categories and human listening ratings. See `research/2026-10-01/voice-research-adoption.md`; do not import noncommercial benchmark recordings into a commercial evaluation.
