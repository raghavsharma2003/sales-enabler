# Speech delivery and paired comparison verification — 10 October 2026

Status: **matched provider pair complete; blinded review and Taxila audition pending**. Frozen automation passes 1,042/1,042 with zero skipped; reviews and Taxila audit are closed. Browser profile checks and two matched Azure Realtime proof runs pass exact ACK requirements, and one concealed pair exists. No human ratings/reveal or actual Diya/Arjun audition exists. A retention-fix build is running.

## Research decision

The research packet supports one bounded Azure experiment: keep the current provider, model and voice as control, and compare `audio.output.speed` 1.0 with 0.9. These are experimental conditions, not a proven optimum. A slower accepted session value does not establish warmth, empathy, intelligibility, pronunciation, Hindi/Hinglish quality or perceived pace.

Relevant sources are `research/2026-10-10/voice-research-adoption.md`, `research/2026-10-10/voice-product-delta.md` and `docs/voice-delivery-adoption-oct10.md`. CtrlSpeech and current Kyutai RL weights carry noncommercial restrictions and are rejected for product deployment. Tavus Griffin has no verified Azure-only integration or deployable artifact. No model download, GPU, Docker or provider migration belongs to this increment.

## DeliveryProfile authority boundary

`SpeechDeliveryProfile` v1 is evaluation-only:

- `standard` requests speed `1.0`;
- `unhurried` requests speed `0.9`;
- only an explicit final caller request can change the current intent;
- the last explicit committed request wins;
- brevity remains a content-length preference and does not imply faster speech; and
- inferred emotion, interim/sidecar/assistant text, quoted/negated/hypothetical/third-party wording and prompt-injection text cannot change acoustic speed.

The agent version/profile is frozen into private voice, public voice and Voice Proof Run manifests. Historical versions without a profile preserve their prior wire/config digest and make no speed claim.

When a profile is configured, one exact acknowledgement gate owns `session.type`, the complete revision-tagged instructions and `audio.output.speed`. Updates occur only between responses. A stale, partial, reordered or mismatched ACK cannot release `response.create`; newer committed speech invalidates the older candidate. The proof path requires the same initial/final exact acknowledgement rather than translating provider success into acoustic evidence.

## Matched paired comparison

The comparison API/UI creates an A/B pair matched on the same fixture, prompt, model, Azure resource, voice, known runtime and configuration. Only delivery profile/speed may differ. Endpoint/configuration digests are part of pair identity without exposing endpoints.

Reviewer assignment is stable per reviewer and hides which side is standard/unhurried until four append-only ratings are submitted. Ratings cover pace fit, intelligibility, naturalness and critical-content preservation. A rating cannot be replaced silently. Expired pairs, missing endpoints and reversed assignment remain recoverable without creating an unreviewable dead end.

The comparison records evidence; it cannot publish an agent, change a release, choose a winner automatically or claim provider/product superiority. Duration or server-delta timing alone cannot decide the comparison.

Browser QA saved agent revision 2 with standard 1.0/no adaptation and a Passed captured configuration version 2, then revision 3 with unhurried 0.9/no adaptation and Passed captured configuration version 3. Active release v1 remained unchanged; neither candidate was published.

## Focused evidence and reviews

Independent review found and owners fixed:

- a public-path cancel-before-terminal race; the independent rerun passes **14/14** under `npm` with the correct test environment; and
- three comparison P2 findings covering expiry, endpoint digest and reversed-pair recovery; all rechecks are closed, including the final expiry fence.

One scoped UI detector pass is clean. The initial integrated run passed 1,025/1,027 with two WebSocket timeouts under shared-laptop load; the isolated public suite passed 12/12. Capping test workers at four produced the frozen **1,042/1,042** pass with zero skipped. Final TypeScript passes. The first production build failed because private Taxila audit snippets under `data/source-audits` entered the TypeScript program; `tsconfig` now excludes `data` while application and tests remain included. The corrected production build, TypeScript and postbuild package check pass with **1,207 inspected entries**. Retained logs are `data/oct10-delivery-terminal-tests.log` and `data/oct10-delivery-corrected-build.log`. Browser workflow and matched provider evidence remain open.

## Requested Hinglish teacher sample

Exactly two paid Azure Speech TTS attempts occurred in this turn:

1. The first long fictional Hinglish input returned an invalid WAV with unknown duration. Validation failed and its producer closed. It is retained as a failed attempt.
2. One explicitly shortened-input retry succeeded at `data/samples/hinglish-teacher-baseline.wav`: 9.338 seconds using Azure Speech `hi-IN-Swara` with fictional teacher content.

The sample is not derived from Taxila, does not use native Azure Realtime, is not one half of the matched delivery comparison and contains no customer material. It establishes only that this bounded cascade-TTS sample was generated and validated. It does not establish pronunciation accuracy, teacher realism, emotional quality, microphone behavior, playback perception, speed preference or commercial superiority. No other paid provider call occurred before this checkpoint.

## Taxila source audit and bounded adoption

One current public GitHub remote head is verified: branch `claude/blissful-mayer-icwe2j` at commit prefix `00aab4bd`. The ignored 3.76 GiB bare mirror is complete. The audit spans **389 commits and 24,110 files**; reports include `research/2026-10-10/taxila-adoption.md`, `taxila-branch-inventory.json`, `taxila-teacher-voice.md` and a **33-file hash manifest** in `taxila-teacher-voice-files.json`.

No YCA or product Gemini key pool exists in the current tree. The bounded adoption is deterministic and provider-separated: pure XML/Devanagari span preparation preserves words and numbers; Diya/Arjun auditions use zero source audio; a lazy Agent Studio panel sits under details; daily admission and private artifacts expire after seven days. It does not change the live Realtime voice or create automatic fallback. **14 focused checks** pass, including actual SDK localhost transport and real budget guards.

Azure regional voice-catalog GET returned HTTP 200 and verified both HD/GA Hindi voice lists without inference. No actual Diya UI audition or provider-delivery artifact exists yet. The current Swara Hinglish sample is independent of Taxila and must not be relabelled as a Taxila result.

Before any Diya/Arjun call, QA found that the UI promised seven-day text handling while raw audition text metadata would persist. The backend now stores no raw audition text, only fingerprint, count and history. The UI now states that audio expires after seven days while fingerprint/history remain. The same **14 focused checks** repass. The retention-fix build is running to `data/oct10-delivery-retention-build.log`.

## Existing operational boundary

Azure remains the only authorized paid route. The prior packet’s historical uncertain live attempt still conservatively occupies one local slot, and the ignored local two-slot override remains necessary for bounded testing beside it. Hosted/default concurrency remains one. Do not change or disclose private environment values in documentation.

No cloud mutation, hosted deployment or Docker action occurred. The prior sellability verdict and its broader microphone, listening, hosted, channel, credit and customer-value gaps remain unchanged.

## Matched live provider evidence

Exactly two Azure Realtime proof runs used the same existing 6.9375-second fixture. The standard 1.0 run produced a 16.750-second artifact; the unhurried 0.9 run produced a 14.081-second artifact. Both completed and closed, and both manifests record true initial and final numeric rate acknowledgements. Sanitized metadata is retained in `data/oct10-delivery-live-metadata.log`.

The model produced different wording across the two runs. Therefore artifact duration cannot establish pace fit, actual acoustic speed, naturalness, intelligibility or a winner. The UI identified two eligible rows and created one concealed matched pair. No human rating has been submitted and profile identity has not been revealed. Active release v1 remains unchanged and unpublished candidates remain candidates.

Paid provider activity for this turn is exactly four attempts: two Swara TTS attempts and these two Realtime proof runs. Three completed successfully and the first invalid TTS attempt closed as failed. No Diya/Arjun call occurred. The earlier historical uncertain lease from the prior packet remains separate and was not reset.

## Terminal gates

- verify packaged readiness and the current preview on frozen source;
- complete the running retention-fix build and packaged readiness;
- browser-verify the concealed pair through four append-only ratings, reveal and expiry/recovery at representative widths without publishing or claiming a winner; and
- run and review the opt-in Diya/Arjun Agent Studio audition before making any delivery or product claim from the bounded Taxila adoption.

Keep credentials, endpoints, resource IDs, customer material, transcripts and raw provider payloads out of continuity. Do not claim a preferred speed, winner, acoustic improvement, Taxila port, audio release pass or full-duplex advance from the current focused checks or single Hinglish sample.
