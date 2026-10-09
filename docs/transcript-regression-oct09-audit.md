# Transcript-to-regression audit — 9 October 2026

## Top three findings

1. **Saved-call evaluation exists; reusable regression does not.** Evidence Lab can assess a tenant-scoped saved session against an immutable rubric, validate exact quotes, and preserve separate model and operator verdicts. Re-running it still judges the historical assistant output. It never runs an exact candidate agent version, so it cannot show whether an edit improved or regressed that conversation.
2. **The necessary bindings exist in separate records, but publish does not join them.** Browser sessions are saved with checked `agentId`/`agentVersionId`/`releaseId` bindings; assessments retain source ID, transcript digest through review, rubric snapshot, provider, input mode, and a config snapshot. Publish only accepts a passing configuration `test_run` for an exact version and rechecks knowledge. It neither requires nor records a conversation regression result.
3. **Current evaluation duplicates raw customer text and cannot measure acoustic voice quality.** An assessment copies the complete transcript into `eval:assessment` and sends it to the evaluation model. There is no customer-transcript redaction step, redacted derivative, or regression retention policy. Transcript criteria correctly refuse acoustic/timing claims. The separate 1–5 human rating records `heardAudio`, but is not bound to an audio artifact, candidate version, or regression execution.

## Current flow and what already works

`Conversation → Evidence Lab → assessment → operator review` is real and useful. Sessions and all evaluation entities are organization-scoped in storage and lookup. Rubric revisions are immutable; assessments store their rubric snapshot. Assessment request IDs are idempotent and input-bound. Model evidence must be an exact contiguous transcript quote, malformed evidence invalidates the result, and comparison uses the latest explicit human reviews rather than raw model verdicts. Review re-reads the source and rejects a changed transcript. Imported trials preserve their unverified status, declared conditions, and scenario version.

`Agent draft → immutable agent version → configuration test → explicit publish` is also real. Version capture includes configuration and knowledge digests. The release service accepts the exact passing configuration run, requires the latest version for normal publish, re-evaluates current knowledge authority, uses compare-and-set release state, and records the tested version in the release.

Conversation learning has a sound adjacent boundary. It extracts exact user quotes, preserves source spans and session digest, requires operator review, and creates only feedback or pending memory/action proposals. Anonymous or unverified participants remain feedback-only. It does not create evaluation cases or change an agent.

## Gaps in the end-to-end promise

- Evidence Lab has no `regression_case`, required-case set, candidate execution, or pass policy. Test Lab explicitly performs configuration checks only.
- An assessment does not carry authoritative `agentId`, originating `agentVersionId`, `releaseId`/preview ID, or a candidate version. `configSnapshot` is informative rather than a foreign-key binding.
- The saved-call selector hides those version/release distinctions. A legacy, preview, published, public, or channel session can look like equivalent evidence.
- Release records contain `testRunId` only. A later rubric/case change cannot stale a release gate because no such gate exists.
- Full historical transcripts are copied into assessments and raw model input. Names, contact details, identifiers, and unrelated turns are not minimized or redacted.
- Relationship behavior can be judged from text; pronunciation, prosody, naturalness, latency, overlap, and interruption handling cannot. Current human ratings do not make those measures reproducible or auditable.
- Learning findings may explain what should improve, but no reviewed action turns a selected conversation moment into a stable case. Automatic conversion would be unsafe because learning classifications and destinations are not test expectations.

## Smallest complete feature contract

Introduce one reviewed artifact and one execution artifact, then extend the existing publish receipt.

### 1. Reviewed regression case

From a saved Conversation, an operator chooses a **checkpoint**: a bounded redacted context prefix plus one exact customer trigger. A checkpoint avoids replaying later customer turns that may no longer make sense after the candidate responds. The case stores:

- organization ID by row ownership; `caseFamilyId`, immutable `caseVersion`, status, creator/reviewer and timestamps;
- authoritative source lineage: `sourceSessionId`, whole source transcript digest, source kind, originating `agentId`, `agentVersionId`, and `releaseId` or preview ID;
- a redacted context/trigger snapshot and its digest, never the raw selected text;
- rubric family/version/snapshot, blocking criterion IDs, and an optional redacted reference response;
- scope: transcript relationship, human-heard audio, or live-turn behavior. Transcript cases must reject acoustic/timing blocking criteria using the existing guard.

Creation is an explicit two-step review. The server first derives the selected turns from the same-tenant session. It replaces detected email, phone, address, account/order/application IDs and operator-marked names or free text with stable placeholders such as `[PERSON_1]`; it drops unrelated turns and timestamps. The review screen shows only the derivative and requires an operator to resolve every detector finding. Persist only placeholder category/position metadata and the source transcript digest—never original values or per-value hashes. Known high-risk patterns remaining in customer text block approval. Audit events contain IDs and digests only. If the source is later deleted, the approved redacted snapshot remains runnable but lineage displays “source unavailable.”

### 2. Candidate regression run

Test Lab runs every active required case for one exact `agentVersionId`. The server verifies case tenant, agent, versioned rubric, case digest, current knowledge digests, and operator-approved status. It invokes the candidate configuration with the redacted prefix and trigger, saves the generated response, then reuses the current exact-quote judgment validator and append-only operator review.

`regression_run` stores `agentId`, target `agentVersionId`, ordered `{caseId, caseVersion, caseDigest, rubricVersion}` set and a `caseSetDigest`, runtime/config digest, response and receipt IDs, judgments, reviews, and terminal status. A passing run requires every blocking transcript criterion to have a latest decisive operator review of `met`; missing, invalid, stale, or `uncertain` blocks. Nonblocking criteria remain visible.

For measured sound quality, the same run may play newly generated audio and accept a human rating bound to run, case, target version, criterion, operator, and `heardAudio=true`. Call this human-heard evidence, not reproducible acoustic proof. Latency/interruption criteria require a separately captured live-session case with timing evidence; a saved transcript can never satisfy them.

### 3. Reviewed publish gate

When an agent has active required cases, `release.publish` must receive both the current configuration `testRunId` and a passing `regressionRunId`. In one tenant-scoped transaction it verifies the run targets the exact latest version, its `caseSetDigest` equals the current required set, all blocking reviews pass, and existing knowledge/release compare-and-set checks still hold. The release records both run IDs and the case-set digest. Any case revision, requirement change, source-policy change, agent version, or knowledge change requires a new run. Agents with zero required cases remain explicitly labeled “configuration checks only”; they must not be presented as conversation-quality tested.

Conversation Learning may offer “Draft regression case” from an operator-reviewed quote, preselecting its session and turn. It must still go through redaction, rubric authoring, and explicit case approval; applying learning never changes the required suite or publishes an agent.

## Acceptance boundary

Focused tests should prove cross-tenant source/case/run rejection; exact source/version/release capture; immutable case revisions; deterministic placeholder reuse without retained originals; blocking of unredacted high-risk patterns; candidate output rather than historical output being judged; stale case-set/version/knowledge publish refusal; reviewed-pass publish success; source deletion with sanitized-case reuse; and transcript refusal for acoustic/timing gates. API/UI fixtures and logs must contain fictional data only.

This feature would establish reviewed text relationship regression and bounded human-heard voice evidence. It would not establish real-device, microphone, barge-in, latency, or general perceptual voice quality.
