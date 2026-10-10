# Speech delivery and paired comparison verification — 10 October 2026

Status: **terminally verified within bounded local implementation scope**. Checkpoints `cbe5f49`, `77495cc`, `596b890` and `a64b4c9`. The pre-ownership integrated suite passes 1,054/1,054; the final ownership delta passes 118/118 plus independent 8/8, TypeScript and build/package/readiness. Provider evidence, Taxila audit/audition, comparison transport/mobile behavior and scoped UI review pass. Comparison 1 remains 0/4 with no reveal or preference verdict. The duplicate-opening cause remains unproven; hardening covers identified paths without claiming retroactive elimination.

## Research decision

The research packet supports one bounded Azure experiment: keep the current provider, model and voice as control, and compare `audio.output.speed` 1.0 with 0.9. These are experimental conditions, not a proven optimum. A slower accepted session value does not establish warmth, empathy, intelligibility, pronunciation, Hindi/Hinglish quality or perceived pace.

Relevant sources are `research/2026-10-10/voice-research-adoption.md`, `research/2026-10-10/voice-product-delta.md` and `docs/voice-delivery-adoption-oct10.md`. CtrlSpeech and current Kyutai RL weights carry noncommercial restrictions and are rejected for product deployment. Tavus Griffin has no verified Azure-only integration or deployable artifact. No model download, GPU, Docker or provider migration belongs to this increment.

## DeliveryProfile authority boundary

`SpeechDeliveryProfile` v1 is evaluation-only. An operator selects the frozen base profile:

- `standard` requests speed `1.0`;
- `unhurried` requests speed `0.9`;
- when adaptation is enabled, only an explicit final caller request can change that base intent during a call;
- the last explicit committed request wins;
- brevity remains a content-length preference and does not imply faster speech; and
- inferred emotion, interim/sidecar/assistant text, quoted/negated/hypothetical/third-party wording and prompt-injection text cannot change acoustic speed.

The agent version/profile is frozen into private voice, public voice and Voice Proof Run manifests. Historical versions without a profile preserve their prior wire/config digest and make no speed claim.

When a profile is configured, one exact acknowledgement gate owns `session.type`, the complete revision-tagged instructions and `audio.output.speed`. Updates occur only between responses. A stale, partial, reordered or mismatched ACK cannot release `response.create`; newer committed speech invalidates the older candidate. The proof path requires the same initial/final exact acknowledgement rather than translating provider success into acoustic evidence.

## Matched paired comparison

The comparison API/UI creates an A/B pair matched on the same fixture, prompt, model, Azure resource, voice, known runtime and configuration. Only delivery profile/speed may differ. Endpoint/configuration digests are part of pair identity without exposing endpoints.

Reviewer assignment is stable per reviewer and hides which side is standard/unhurried until four append-only ratings are submitted. The implemented paired-perceptual rubric covers pace fit, intelligibility, naturalness and warmth, matching the requested delivery/emotional-quality question. A rating cannot be replaced silently. Expired pairs, missing endpoints and reversed assignment remain recoverable without creating an unreviewable dead end.

Critical-content correctness is a separate future regression/release gate. It is not one of the four preference ratings and cannot be inferred from A/B preference, warmth, duration or reveal. A later correctness gate must bind exact content criteria to the same artifacts without retroactively changing this rubric.

The comparison records evidence; it cannot publish an agent, change a release, choose a winner automatically or claim provider/product superiority. Duration or server-delta timing alone cannot decide the comparison.

Browser QA saved agent revision 2 with standard 1.0/no adaptation and a Passed captured configuration version 2, then revision 3 with unhurried 0.9/no adaptation and Passed captured configuration version 3. Active release v1 remained unchanged; neither candidate was published.

## Focused evidence and reviews

Independent review found and owners fixed:

- a public-path cancel-before-terminal race; the independent rerun passes **14/14** under `npm` with the correct test environment; and
- three comparison P2 findings covering expiry, endpoint digest and reversed-pair recovery; all rechecks are closed, including the final expiry fence.

One scoped UI detector pass is clean. The initial integrated run passed 1,025/1,027 with two WebSocket timeouts under shared-laptop load; the isolated public suite passed 12/12. Capping test workers at four produced 1,042/1,042. After shutdown fixes, final automation passes **1,054/1,054**, zero skipped, in 391.818 seconds; shutdown checks pass **94** plus independent **32/32** with no P1/P2. Retained test log is `data/oct10-final-integration-tests.log`.

The first production build failed because private Taxila audit snippets under `data/source-audits` entered TypeScript; `tsconfig` now excludes `data` while app/tests remain included. A later final build failed Windows `EBUSY` because the running standalone preview held `.next/standalone`. Both failures are retained. Corrected rebuild/typecheck/postbuild package passes with **1,207 entries** and readiness HTTP 200; retained log is `data/oct10-delivery-final-rebuild.log`.

## Requested Hinglish teacher sample

Exactly two paid Azure Speech TTS attempts occurred in this turn:

1. The first long fictional Hinglish input returned an invalid WAV with unknown duration. Validation failed and its producer closed. It is retained as a failed attempt.
2. One explicitly shortened-input retry succeeded at `data/samples/hinglish-teacher-baseline.wav`: 9.338 seconds using Azure Speech `hi-IN-Swara` with fictional teacher content.

The sample is not derived from Taxila, does not use native Azure Realtime, is not one half of the matched delivery comparison and contains no customer material. It establishes only that this bounded cascade-TTS sample was generated and validated. It does not establish pronunciation accuracy, teacher realism, emotional quality, microphone behavior, playback perception, speed preference or commercial superiority. No other paid provider call occurred before this checkpoint.

## Taxila source audit and bounded adoption

One current public GitHub remote head is verified: branch `claude/blissful-mayer-icwe2j` at commit prefix `00aab4bd`. The ignored 3.76 GiB bare mirror is complete. The audit spans **389 commits and 24,110 files**; reports include `research/2026-10-10/taxila-adoption.md`, `taxila-branch-inventory.json`, `taxila-teacher-voice.md` and a **33-file hash manifest** in `taxila-teacher-voice-files.json`.

No YCA or product Gemini key pool exists in the current tree. The bounded adoption is deterministic and provider-separated: pure XML/Devanagari span preparation preserves words and numbers; Diya/Arjun auditions use zero source audio; a lazy Agent Studio panel sits under details; daily admission and private artifacts expire after seven days. It does not change the live Realtime voice or create automatic fallback. **14 focused checks** pass, including actual SDK localhost transport and real budget guards.

Azure regional voice-catalog GET returned HTTP 200 and verified both HD/GA Hindi voice lists without inference. The bounded Diya UI audition/artifact described below exists; the earlier Swara Hinglish sample remains independent of Taxila and must not be relabelled as a Taxila result.

Before any Diya/Arjun call, QA found that the UI promised seven-day text handling while raw audition text metadata would persist. The backend now stores no raw audition text, only fingerprint, count and history. The UI now states that audio expires after seven days while fingerprint/history remain. The same **14 focused checks** repass. Retention build/TypeScript/postbuild package passes across 1,207 entries; Node preview readiness returns HTTP 200 and the compiled gateway runs. Retained log is `data/oct10-delivery-retention-build.log`.

One actual opt-in UI audition succeeded using preset `DiyaHD` and compiler `Taxila-safe-ssml-v1`. It produced a 5.150-second, 247,244-byte private artifact. Database inspection verified `rawTextStored:false`. The exported hash matched `data/samples/taxila-diya-hinglish-1e311d4059e5.wav`. Final browser playback on that unchanged artifact completed with currentTime/duration 5.15, ended true, error null and empty console warning/error lists. No new generation occurred. This verifies bounded audition/artifact/playback plumbing, not pronunciation, naturalness, teacher identity, comparative preference or live Realtime voice.

## Existing operational boundary

Azure remains the only authorized paid route. The prior packet’s historical uncertain attempt and this packet’s prepatch uncertain attempt retain their slots. A temporary ignored local three-slot override allowed the single post-fix proof; hosted/default concurrency remains one. Do not disclose private environment values in documentation.

No cloud mutation, hosted deployment or Docker action occurred. The prior sellability verdict and its broader microphone, listening, hosted, channel, credit and customer-value gaps remain unchanged.

## Matched live provider evidence

Exactly two Azure Realtime proof runs used the same existing 6.9375-second fixture. The standard 1.0 run produced a 16.750-second artifact; the unhurried 0.9 run produced a 14.081-second artifact. Both completed and closed, and both manifests record true initial and final numeric rate acknowledgements. Sanitized metadata is retained in `data/oct10-delivery-live-metadata.log`.

The model produced different wording across the two runs. Therefore artifact duration cannot establish pace fit, actual acoustic speed, naturalness, intelligibility or a winner. The UI identified two eligible rows and created one concealed matched pair. Comparison 1 opens with stable masked A/B, 0/4 append-only reviews and no reveal/attestation. Active release v1 remains unchanged and unpublished candidates remain candidates.

Before the transport fix, both masked artifacts played to completion but reported Infinity before download. After checkpoint `77495cc`, browser proof shows readyState 4/no error and finite pre-play durations: A 14.0805 seconds and B 16.75 seconds. The pair remains 0/4 with no attestation or reveal.

Paid provider activity for this turn totals seven attempts. Six are closed: the first invalid Swara TTS failure plus five successful attempts (shortened Swara, two Realtime proofs, Diya HD audition and the final post-fix control call). One prepatch 87-second private call remains uncertain after HTTP 404 `provider_unconfirmed`. The prior packet's historical uncertain attempt remains separate and was not reset.

The 87-second call used fictional Feedback revision 4 with standard 1.0/request adaptation. It demonstrated explicit slower 0.9 then normal 1.0 request handling, with two ACK→first-output samples supporting gated continuation only. A single 12-second post-fix call then completed and saved; read-only supervisor evidence shows state closed, `closedAt` present, one stop attempt, confirmed reason, HTTP 200 and retained handle/binding.

The 12-second call stored two identical assistant opening entries and zero user entries. Entry IDs were not persisted, so exact cause cannot be reconstructed. Same-item replay is unlikely because the reducer upserts IDs. Checkpoint `a64b4c9` hardens the identified paths with one-shot opening and response ownership based on existing `activeResponse`/`finishedResponses`; only recognized active/finished response IDs can supply assistant finals. Legitimate multi-item, cancelled late-final and tool-continuation behavior is preserved. The existing 450-turn-aligned cap limits responses to 450 per session and close clears history. This ownership patch added no separate ID store, raw-text deduplication, prompt change, diagnostic-schema change or inference call; earlier `596b890` added bounded stop-diagnostic fields. Focused tests pass **118/118**; independent new tests pass **8/8** with no P1/P2; TypeScript passes. This does not prove the historical duplicate's exact cause or retroactive elimination.

Updated preview runs `a64b4c9` and readiness returns HTTP 200. Supervisor runs current shutdown/diagnostic code. Automatic approval review rejected restarting the public gateway as “blocked by policy.” Its running 171.3 KB `cbe5f49` bundle already includes public speech-delivery, exact ACK and cancellation fixes. The unloaded 171.5 KB delta is mainly PostgreSQL-pool and shared usage/stop diagnostics; ownership/shutdown hardening is in private browser/control/supervisor paths. This is not final-bundle public-runtime proof, but it does not mean the public delivery feature is absent.

`docs/taxila-live-voice-plan-oct10.md` is a completed research/evaluation plan for a possible Voice Live arm. It is not implementation, provider execution or evidence that Taxila teacher/live voice has been ported.

Viewport screenshot thumbnails were recovered using the documented scroll/viewport clip. Final evidence covers delivery controls, audition and comparison at desktop/mobile. Checkpoint `77495cc` implements 2×2 mobile Quality tabs; final proof shows 44 px targets and clientWidth equal to scrollWidth at 390. Independent scoped UI review returns **SHIP**; see `docs/speech-delivery-finish-review-oct10.md`.

A draft concern that opening/receiving a pair resets saved reviews is not reproduced in source: `review()` writes the packet directly, while reset occurs only when `open` receives a new pair. The pair remains intentionally ungraded.

Infrastructure/routing research checkpoint `f6fc173` includes Azure remote-only supervisor packaging, bounded PostgreSQL pools and read-only ARM verification. The Inspector compatibility P2 is resolved. Global Container Apps environment quota and Owner-only role-assignment/lock operations remain external blockers beyond current Contributor access. No remote push, Docker execution, Azure deployment or cloud write occurred.

Final current-source verification after hardening:

- ownership focused checks: **118/118**;
- independent ownership review: **8/8**, no P1/P2;
- production build/TypeScript/postbuild package: **1,207 entries**;
- updated packaged preview readiness: HTTP 200.

Retained final log: `data/oct10-response-ownership-build.log`. No additional provider call followed the confirmed 12-second call.

## Remaining evidence and external gates

- keep the pair at 0/4 unless a person actually submits all ratings; no reveal, attestation, preferred speed or winner claim exists;
- restart/reverify the public gateway only when policy permits before claiming final-bundle public-runtime proof;
- obtain listener evidence before any acoustic, warmth, naturalness or audio-release claim; and
- resolve hosted quota, Owner-role/lock, database, identity, worker and channel gates before deployment.

Keep credentials, endpoints, resource IDs, customer material, transcripts and raw provider payloads out of continuity. Do not claim a preferred speed, winner, acoustic improvement, a port of the whole Taxila teacher/live stack, an audio release pass or full-duplex advance. A bounded deterministic SSML/audition port exists; it is not the full product.
