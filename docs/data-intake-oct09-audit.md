# Customer intake audit and implementation contract — 9 October 2026

Scope: the customer-table path in Company → Source intake, `components/data-intake-workbench.tsx`, `components/platform/brain-view.tsx`, `lib/data-intake/*`, the intake and ingestion routes, and existing service tests. This is an independent code audit of the pre-increment implementation, with one synthetic in-memory reproduction. No browser, build, provider call, private database, credential inspection, deployment or application change was performed. The reported 690-test baseline belongs to the prior checkpoint and was not rerun for this audit.

The atomic customer-write boundary is strong. Preserve source-byte/status, operator membership, preview bytes, directory CAS and linked-contact preimage fences; exact-match review; digest/row deduplication; restriction propagation; and the absence of consent or identity verification from imports. The main missing piece is a durable, recoverable operator workflow around that boundary.

## Five priority gaps

### 1. Review work disappears on ordinary navigation; saved previews are not resumable drafts (P1)

Evidence: workbench lines 20–27 keep mapping, suggestions, decisions, exclusions, batch and receipt in React state. `inspect()` resets all of it at line 34. BrainView lines 21, 27 and 46 use local mode and conditionally unmount the workbench; a focus target forces company mode. The intake API has only inspect/suggest/preview/apply, with no draft or history lookup. Preview refresh also replaces all decisions at workbench line 58.

Reproduction by code path: map a table, make several row decisions, switch to Business model or Company material, return and reopen the table. Mapping becomes unknown and review must begin again. A directory-conflict response correctly blocks stale writes, but the necessary refresh discards even unaffected decisions.

Contract: introduce an organization- and actor-scoped saved review draft with revision CAS, immutable source ID/digest, mapping, exclusions, cursor and row decisions. Expose saved/unsaved/conflict states and a direct intake URL. Save explicitly before leaving, or use a reliable autosave with an unsaved-navigation guard. Resume is restoration of intent, never restoration of apply authority: revalidate membership/source and build a fresh preview; retain decisions only for rows whose normalized evidence and exact-match choices remain unchanged. Surface invalidated decisions with reasons. Concurrent tabs cannot silently overwrite one another. Returning from a stale response must offer refresh/review without losing the draft.

### 2. Skipped or blocked rows cannot reliably be recovered, especially across batches (P1)

Evidence: `previewIntake()` deterministically hashes source/mapping/directory/rows and returns an old preview when its ID exists. `applyIntake()` binds one immutable batch receipt to that preview and rejects changed decisions. Skips do not create row receipts or mutate the directory. The UI has no batch selector or source-wide issue list; its exclusions exist only on the 20 visible rows within the current 200-row preview. Yet duplicate-email checks span the whole source (`normalizeIntakeRows()`), including later rows.

Executed reproduction: create a one-row fictional source in `SQLITE_PATH=:memory:`, preview it, apply `skip`, request another identical preview, then select `create`. Output was `samePreview: true`, followed by HTTP-equivalent 409, `This batch was already applied with different decisions.` This contradicts the documented ability to revisit skipped rows through a new preview unless the operator makes an unrelated change. The reproduction used inline Node/tsx and left no test file or database.

A second code-proven dead end: rows 1 and 201 have the same email. The existing test successfully excludes row 201 by calling the API directly, but batch-one UI cannot reach that exclusion until applying/skipping batch one. It does not show which later row caused the conflict.

Contract: separate a new explicit review attempt from retrying an already applied attempt. Identical apply retries return the same immutable receipt; deliberately reopening skipped rows creates new review authority. Keep digest + original row uniqueness for successful create/link so reopening cannot duplicate customers. Provide source-wide issue groups with conflicting row numbers, batch navigation independent of applying, explicit exclusion reasons and visible revisit actions. Preserve all raw cells. Invalid values need a specific remedy: remap as context where appropriate, create a linked corrected source, or explicitly exclude/skip with a reason. If inline corrections are implemented, store an audited overlay against immutable source cells rather than rewriting evidence. Never auto-fix a country code, name, date or consent.

Acceptance: all-skip → reopen → create succeeds exactly once; replay of each attempt remains stable; duplicate rows 1/201 can be resolved before batch one is applied; rejected/invalid/skipped rows remain discoverable after reload.

### 3. Asking for AI advice silently replaces the current mapping (P1)

Evidence: workbench line 92 assigns suggestions and immediately calls `setMapping(result.suggestions.map(...))`, clearing the preview and decisions. The control says “Suggest mapping with AI”; there is no separate Use/Accept action. Server output sanitization catches competing identity fields, but that is not operator acceptance.

Contract: store a pending proposal separately from the current mapping. Show target, reason, uncertainty and changed columns. Use per-column acceptance or one clearly labeled “Use suggested mappings” action; offer dismiss and preserve manual edits until acceptance. Acceptance creates a new mapping revision, invalidates apply authority and records proposal/source provenance. Unknown targets remain unresolved. A suggestion or acceptance never applies rows. Late responses must be bound to the source/draft revision that requested them and cannot overwrite a newer source or manual edit.

Acceptance: requesting/dismissing AI changes neither mappings nor row decisions; accepted changes are explicit; stale AI responses are ignored or shown as outdated; review remains required.

### 4. Progress describes the current batch, without a durable whole-source accounting (P2)

Evidence: `stage` at workbench line 67 is inferred solely from currently mounted inspection/preview/receipt. Line 78 shows current-batch counts and “last source batch,” then offers Choose another table. There is no aggregate source summary or visible remaining skipped/blocked work. The UI does truthfully say “Batch applied”; the gap is source-level completion and recoverability, not a claim that this label itself promises all rows were imported. Busy text is one generic phase, including a potentially five-call AI mapping operation.

Contract: show a server-derived source summary whose disjoint row categories reconcile to total rows: applied create/link (count each source row once), explicitly skipped/excluded, unresolved or not yet reviewed. Separate “all rows accounted for” from “all rows imported,” and give attention actions for skipped or blocked rows. Keep per-batch receipts and source-wide progress available after reload. Explain already-applied duplicate reuploads without counting them as new customer creation. Progress during work should identify actual stages; only show numeric percentages when measured. If customer writes succeeded but the workspace refresh fails, keep the successful receipt visible and label the refresh failure separately.

Acceptance: 201+ row sources, a mixture of creates/links/skips, duplicate reuploads and page reloads retain correct totals. A last batch with skipped rows never hides those rows behind an apparent finished state. No progress percentage is invented from elapsed time.

### 5. Applying customers has no accountable handoff into the canonical campaign flow (P2)

Evidence: DataIntakeWorkbench accepts only `onApplied`, `sourceId` and `canWrite`; BrainView supplies a workspace refresh. The only receipt actions are Next batch/Choose another table. By contrast the company-material path has Agents/Campaigns navigation. The canonical campaign setup already supports explicit `contactIds`, idempotent request IDs and reference fences (`lib/platform/campaign-setup.ts`, lines 26 and 61–74).

Contract: expose Review imported customers and an explicit “Use these customers in a campaign” action from durable receipts/source summary. Resolve eligible handoff IDs server-side from successful create/link receipts, scoped to the current workspace, deduplicate IDs, and validate current existence/access. Allow explicit subset selection. Create one canonical `setup` campaign through the existing setup contract and navigate to Audience or Intent with receipt provenance. Repeated handoff retries must reopen the same campaign, not create duplicates. Never include skips or unresolved rows; never infer a product relationship, grant consent, approve company knowledge, finalize or launch. A table can contain 1,000 rows while campaign setup accepts 500 contacts: display the limit and require an explicit subset or separate campaigns, never truncate.

Acceptance: handoff survives reload, duplicates one linked customer only once, excludes skipped rows, checks changed permissions/deleted contacts, and visibly lands in the same partial campaign on retry. Existing campaign preflight and explicit launch remain mandatory.

## Delivery order and verification contract

Implement durable draft/review-attempt contracts and source summary first; then connect the workbench and explicit AI proposal acceptance; then issue navigation/recovery; then receipt-backed campaign handoff. Keep the existing ingestion-source abstraction and atomic customer transaction, rather than creating a second customer store.

Add service/API tests for fresh versus replayed attempts, draft revision collisions, cross-actor/cross-tenant resume, source removal and membership revocation during save/resume/apply, stale directory refresh, source-wide counts and handoff limits/idempotency. Existing tests cover atomic rollback, reupload dedupe and source/directory/membership fences but do not prove these workflow contracts. Use the real route layer for new request validation and origin/authorization cases, in addition to pure helper tests.

Browser verification should exercise a fictional 201-row source with a cross-batch duplicate, one missing name, one invalid phone, an opt-out and an exact existing-customer match. Demonstrate proposal → explicit acceptance, partial decision save/reload, mode-switch return, conflict recovery, explicit skips with revisit, all-batch accounting and same-ID campaign handoff. Capture desktop/mobile completion and error states. No provider quality, consent, external delivery, live-call quality or production readiness follows from this increment.

## Secondary observations

- A malformed customer table is saved by the generic source upload before `inspect()` parses it; failed inspection leaves an opaque saved source rather than a row-level repair view. Preserve that source but show its parse failure and a clear replace/correct action.
- The paste textarea uses `maxLength={240000}`. Over-limit paste may be clipped by the browser before server validation, while the API correctly rejects over-limit text. Validate paste input before replacement if “never silently truncate” includes this entry point.
- Source listing currently fetches all ingestion sources including raw text for a simple dropdown; a metadata-only endpoint is an appropriate follow-up if source volume makes this expensive.
- Same-batch create collision checks include name/phone as well as email, but only email duplicates are reported during normalization. Surface name/phone conflicts before Apply so reviewers do not discover them only through an atomic failure. Preserve the current exact-match policy unless product semantics are explicitly changed.

This audit is a scoped implementation contract, not a whole-product usability verdict. No application files or existing tests were edited by this auditor.

## Independent implementation follow-up

The backend owner added explicit new review attempts and durable review contracts after the initial audit. The independent file `tests/data-intake-review-oct09.test.ts` now passes **5/5** using `node --import tsx --test tests/data-intake-review-oct09.test.ts` against the updated implementation. It verifies all-skip → deliberate reopen → create, preservation/replay of both immutable receipts, no repeat creation of successful source rows, and source removal blocking receipt replay.

Follow-up code review also identified two new draft-boundary defects: coercing a phase array to a valid string before storing its original value, and making draft-revision validation optional even when a saved draft had superseded the preview. The backend owner corrected both; the remaining two independent regressions verify phase-array rejection without saving malformed state and rejection of an omitted revision when a newer mapping draft invalidates the old preview. Legacy receipt replay remains an observation of the original transaction, not new apply authority.

This test result establishes those five backend properties only. The UI, campaign handoff, larger integrated suite and browser flow remain the responsibility of their implementation/verification owners; the five original workflow findings are not all closed by these service tests.
