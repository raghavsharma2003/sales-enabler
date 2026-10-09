# October 9 workflow verification

Status: **terminally verified within the October 9 scope**. Reviewed automation/build, live text-regression proof, scoped UI review, typed-input Realtime calibration, packaged readiness and browser-log checks pass. This is not a whole-product, hosted-operation, customer-pilot or voice-quality verdict.

## Implemented boundary

Data intake now persists a digest-bound review workspace with revision compare-and-set updates, explicit mapping decisions, idempotent new-attempt/retry behavior, row decisions and an exception queue. AI mapping proposals remain advisory until the operator explicitly uses and saves them. Apply preserves create/link/skip outcomes and imported opt-out restrictions. Source handoff now uses a source-prefix table so a parent source routes to its exact Customer table. The intake, exact UTF-8 GroupAI/channel input/output accounting, customer fallback and source-handoff work is committed locally as `70c35d1`.

Private voice capture wording now describes bounded operator-side capture capability accurately. Research plus this prompt correction is committed locally as `291fc8e`.

The surrogate text-regression path creates a reviewed case, runs one exact candidate and requires manual human review. Its `runtimeInstructionDigest` binds the exact system instruction plus serialized candidate input; prompt or emotional-policy changes stale prior runs, reviews and suite status. It has no release gate and cannot publish an agent automatically. This is a text rehearsal, not Azure Realtime, audio, microphone, latency, interruption or perceptual evidence.

## Automated evidence

- Combined intake and capture checks passed 53/53: 13 backend workspace, 22 legacy, five adversarial, five UI-helper and eight new private-capture checks.
- Exact UTF-8 GroupAI/channel provider accounting passed 30 focused checks plus typecheck.
- The first integrated baseline passed 731/731 tests, production build and postbuild package check. Retained baseline logs are `data/oct09-tests.log` and `data/oct09-build.log`.
- Independent regression review closed 16/16 focused checks, including eight adversarial checks, after strengthening runtime-instruction invalidation. Source is frozen for the current terminal run.
- Reviewed code `7cbdebe` passed 746/746 tests plus production build and postbuild package check. Retained logs are `data/oct09-tests-reviewed.log` and `data/oct09-build-reviewed.log`.
- Tightened capture guidance passed 36 combined voice/scheduler checks, including nine capture-prompt checks. Rehearsal UI fixes pass typecheck.

## Browser evidence

Authenticated local QA used a fictional six-row CSV. It proved:

- partial name-only mapping save and resume;
- an actual Azure AI proposal did not overwrite mapping before explicit **Use** and **Save**;
- duplicate-email handling through global row-two exclusion and refresh;
- explicit bulk decisions of two creates, one exact existing-record link and three skips, with all six decisions saved;
- leaving through Business model and returning to the same six saved decisions;
- apply persisted two created, one linked, three skipped and zero pending; and
- imported opt-out restrictions remained in force.

The corrected Customer handoff visually showed the prefilled email, stage and do-not-contact notice. Exact row-five **Open source** navigation returned to the saved applied intake review with the correct source selected. First-round intake and customer captures are valid at three viewport widths.

The unsaved-leave cancel scenario is not passed. A native JavaScript confirm dialog was hidden from the CUA automation surface and stalled that tab. QA recovered in a fresh tab and resumed the saved review. This is a tooling limitation; it does not prove success or an application defect.

Live **text** rehearsal selected a bounded redacted four-turn prefix from a saved fictional call, created one case with two blocking criteria and explicit confirmation, generated a new Azure text reply and obtained model grades. Operator review marked one criterion met and one not met because the reply omitted the capture-to-review/save explanation. Read-only storage inspection confirmed one case, one complete run and two reviews before refresh; Refresh saved rehearsals reconciled delayed UI responses. The suite correctly showed **Blocked**, one required case **Failed** and two-of-two blocking criteria reviewed. This failed-behavior record is retained. No transcript text or identifier is recorded here.

The prompt now requires the explicit record/save/remember path before questions. UI fixes cover one-column authoring, case cancellation, reference suffixes, bounded 65-second timeouts and response sequencing.

After the runtime-policy change, the original run correctly became **Stale** while retaining its Met/Not Met reviews and blocked history. Exactly one explicit retry was made, for exactly two candidate attempts total. The new real-Azure text candidate received Met/Met model judgments, and the operator explicitly reviewed both Met. Read-only inspection confirmed that it explains capture, team review and the save path without claiming persistence is already confirmed. The Reviewed suite now shows **Passed**, one required case and two-of-two blocking criteria reviewed. The original failed attempt remains visible as separate history; the suite uses the latest attempt without erasing the failure. This was not repeated sampling until pass.

Final corrected-layout and verdict-tone captures are valid at three widths. One black mobile capture was discarded and superseded by valid mobile captures showing the old failed history and current passed state; it is not evidence. A draft revision was prepared and then explicitly Discarded without creating version two, leaving zero author drafts.

The independent scoped UI finish review returned **SHIP** in `docs/oct09-workflow-finish-review.md`. All five findings are resolved across author/result widths, verdict-specific tones, references and history/recovery. Its evidence appendix records the valid alternative capture and excludes the malformed unused mobile file. This verdict applies to the scoped October 9 workflow only.

## Realtime wording calibration

One actual Azure Realtime WebRTC internal-draft preview used the Feedback flow with unlinked Company Knowledge and **Listen & type**. It completed a greeting, one typed user turn and one assistant reply, for three entries. The response explicitly offered to capture the feedback for team review/save, did not claim it had already been sent or saved, and asked one question. EmotionalOS UI showed exact evidence for a direct overwhelm self-report plus an explicit brevity request and produced a bounded pacing brief. Manual End saved the internal preview and UI confirmed **Saved**.

This was the only real Realtime call in the pass. It did not use a physical microphone and establishes no acoustic, perceptual, latency, device or general voice-quality result.

Final packaged readiness returned HTTP 200. Browser warning/error logs were empty after the ended and saved Realtime call; the viewport was reset and the final deliverable remained on local Test Lab. No source changed after reviewed code `7cbdebe`.

The native confirm-dismiss interaction remains explicitly unverified because the automation surface did not expose the dialog. This bounded tooling gap does not prove success or an application defect. Release-gate wiring, hosted operation, real external channels, physical-microphone evaluation and acoustic/latency/device benchmarks remain open beyond this increment. No external connection was added. Azure remains the only authorized paid inference route. No customer transcript, credential, endpoint, resource identifier or PII is recorded here. Scoped implementation commits are `291fc8e`, `70c35d1` and `7cbdebe`.
