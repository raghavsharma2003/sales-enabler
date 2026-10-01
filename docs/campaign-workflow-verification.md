# Campaign workflow and private turn-control verification

**Checkpoint:** 2 October 2026  
**Status:** scoped canonical workflow verified and independently reviewed **SHIP**; broader customer-pilot and production gates remain open

## Scope

This increment implements the contract audited in `docs/campaign-workflow-contract-audit.md`: one durable campaign record moves through `Intent → Audience → Agent & content → Review → Run → Results`. It also closes the previously identified private-browser current-turn ordering gap by waiting for the provider to acknowledge the exact staged instructions before response generation.

This record is deliberately bounded. It does not establish hosted production readiness, external delivery, physical-microphone behavior, real acoustic interruption, perceptual voice quality or provider superiority.

## Implemented campaign contract

- `campaign.setup.create` derives a tenant-scoped deterministic campaign ID from a stable request ID. Identical replay returns the existing record; a different payload for the same request conflicts.
- `campaign.setup.update` requires the displayed revision, applies an allowlisted bounded patch, carries an explicit editable phase, and compare-and-set fences the exact setup preimage plus current operator membership and referenced tenant objects.
- `campaign.setup.finalize` revalidates readiness and current authority, stamps reviewed intent on the server, and changes the same record from `setup` to the existing complete `draft` campaign shape. It preserves the original owner rather than replacing the creator with the final editor.
- AI planning remains a subordinate immutable proposal receipt. A targeted reviewed plan applies to the existing setup campaign instead of inserting another campaign; exact replay returns the same plan/campaign binding. Applied plan provenance and content remain immutable. Selecting a runtime release or mailbox can change without discarding the accepted plan.
- The manual route has first-class authority. Preflight, launch, browser voice context, voice tools and connected email all revalidate the direct reviewed intent against the canonical campaign.
- Existing draft preflight, explicit launch, one active run, immutable campaign snapshot, queued-recipient transitions and bound result extraction remain intact.
- Legacy complete campaigns, legacy plan generation/apply behavior and previous campaign navigation aliases remain available.

The shared setup parser rejects unknown fields, prototype-shaped review-column keys, duplicate review keys, invalid enum definitions, oversized arrays/text and unsafe type coercion. The desired-outcome label accepts at most 240 characters and each evidence item at most 400 characters. Final readiness reports phase-specific blockers rather than inserting placeholder business meaning.

## Workspace behavior

Campaigns now opens one workspace with six URL-addressable phases:

1. **Intent** records the campaign kind, goal, reviewed offering, desired outcome, evidence requirements, signals and result columns.
2. **Audience** records selected contacts and an evidence-based audience rationale.
3. **Agent & content** records channel, exact active release or mailbox binding, opening copy and bounded call/email material.
4. **Review** converts the same setup record to a complete draft and displays the existing preflight checks.
5. **Run** requires explicit launch and operates against the immutable run snapshot.
6. **Results** displays recipient progress and bound reviewed outcomes.

Manual authoring and AI assistance are methods inside the same campaign. AI brief `Use suggestions` copies only allowlisted values into local fields; the operator must still Save them to the current setup revision. Full AI content-plan apply is a separate server action that requires the exact campaign revision and targets the same campaign. Neither path creates or silently mutates a second campaign. Existing `Manage`, `Plan with AI` and `Write manually` destinations resolve into the unified workspace so saved links and historical records remain usable.

Partial setups and complete drafts can be reopened safely by their canonical ID. AI brief assistance presents bounded suggestions that still require explicit operator selection and save. The run surface derives a controlled recipient projection from the immutable run snapshot and current result state; it does not treat an excluded or ineligible contact as an actionable call target.

## Private WebRTC ordering

The private browser path now uses a dedicated scheduler with these invariants:

- Each typed or ASR turn stages the current-turn instructions before sending a provider update.
- Response creation waits for the unique matching `session.updated` acknowledgement and rejects stale or mismatched acknowledgements.
- Typed turns, ASR completion, interruption, provider cancellation and tool activity are serialized so one active reply cannot be mistaken for another.
- Provider VAD uses `interrupt_response: true` for normal cancellation and WebRTC conversation-history truncation. The client explicitly cancels and clears output only for the late-response race; this code does not measure playback progress.
- Tool completion stages fresh guidance and uses the same acknowledgement gate before continuing generation.
- Explicit end and error paths preserve already captured ASR text without generating another reply. Component unmount only tears down resources and does not manufacture a transcript turn.
- Existing Gemini behavior remains unchanged.

Independent review found five private-voice defects and two campaign parser defects. Regressions now cover the corrected acknowledgement correlation, busy/tool ordering, teardown transcript capture, enum coercion, duplicate/prototype review keys and evidence-item length handling.

## Verification record

Terminal integrated verification passed:

- **690/690 integrated tests**
- final production build
- final packaged-artifact check
- packaged readiness HTTP 200

The core campaign and turn implementation is committed locally as `32e0cd7`; final code is committed as `2d874ec`. Retained terminal logs are `data/campaign-workflow-tests-ratings.log` and `data/campaign-workflow-build-ratings.log`. The spoken-rating service has 24 focused proof tests. One read-only existing-receipt check covered all four fields, and Recheck did not purchase another extraction.

Authenticated browser verification in a fictional workspace has proved the canonical flow through launch:

- Created a partial campaign, saved it, reloaded it and retained the same campaign ID.
- Selected two fictional contacts, finalized the same ID to a draft, and observed preflight block one contact that lacked consent.
- Reopened the same draft safely, removed the ineligible contact and saved the correction.
- Generated a live Azure content proposal whose opening read like an email letter. It was valid and saved under the old rules, but the operator did not apply it. The tightened browser-focused spoken-opening validator now rejects that letter style.
- Generated a second live Azure content proposal with a short AI-disclosed spoken opening, one spoken opening question and zero missing inputs, reviewed it explicitly and applied it to the same campaign ID.
- Observed one-of-one ready preflight, then launched explicitly. The immutable run became active with one queued controlled recipient. Launch did not automatically send an email or start a call.

The browser exercise used existing local HTTP APIs. It did not provision cloud resources, use real customers, activate telephony or deliver real email.

AI brief assistance received a separate live quality check. The first receipt exposed twelve questions, eight evidence items and eight missing-context prompts. It was valid under the old rules, and the operator deliberately chose Use and Save in the fictional workspace to test the local-edit/persistence boundary before judging the result unusable. The tightened generation guard then produced four goal-aligned questions, including one numeric question, four evidence items and zero missing-context prompts. Choosing Use replaced the local fields and an explicit Save persisted the selected values. The earlier receipt was superseded by operator action rather than mechanically rejected.

The recovered private live Azure proof contains five entries: the AI greeting, two typed user turns and two assistant replies. The call stayed live while the operator navigated from Run to Results, then ended manually and saved. The exact saved fictional conversation was selected, its evidence was reviewed, and the explicit completion action moved the run to one-of-one complete. This is live Listen & type and persistence/navigation evidence, not physical-microphone, acoustic interruption or perceptual-quality evidence.

A second fictional campaign exercised the complete Results path. Four typed result fields were saved before applying the guarded brief and content plan. After preflight and explicit launch, a five-entry live Azure Listen & type call produced exact direct-self-report and brevity evidence plus a bounded pacing brief. The call stayed active across Run → Results; Results kept the call mounted but hidden, and Return to call restored it. Manual End saved the exact conversation, Mark completed bound it to the one-of-one recipient, and Azure extraction returned four fields. Three text fields carried exact quotes and were operator-accepted.

The spoken rating initially remained unknown even though the caller gave an explicit four-of-five answer. The corrected bounded validator accepts explicit first-person evidence whose value matches the stated scale, including five- and ten-point scales, and rejects negation, hypotheticals, third-party statements, contradictions and wrong denominators. Recheck reused the existing completed receipt without another model call; the pending value remained review-controlled.

In the final browser pass, Recheck recovered the four-of-five rating and preserved the three previously accepted text fields. The operator explicitly accepted the recovered fourth field, producing four-of-four reviewed results. Final desktop and mobile Results captures are valid, the 375 px mobile document has equal client and scroll widths, and the browser warning/error lists are empty. A campaign with no result fields displays “No result fields planned” without error and does not expose extraction.

The first generic provider failure accompanied a newly added optional typed item ID. Recovery restored the previously working payload by omitting that optional field. The exact raw provider error remains unknown, so the earlier failure remains bounded historical evidence rather than a diagnosed provider claim.

Review hardening is complete:

- Durable email receipts settle recipient delivery as `delivery_settled` with accepted, rejected or uncertain operational state. That state does not imply business success.
- Results show conversation evidence separately while retaining the mounted call component, hidden when appropriate, so an active call survives phase navigation.
- A previously ready preflight invalidates when authority refresh changes its basis or launch fails.
- A campaign with no result fields shows a valid empty Results state; extraction remains unavailable.

A related cue-handling correction passed 66 focused checks. Pacing adapts when the person either directly reports being overwhelmed or explicitly requests shorter replies. Negated statements and reports about third parties do not trigger that adaptation. This is bounded conversational pacing, not emotion diagnosis, an inner-state claim or inferred trust.

One live quality observation remains open for customer-pilot calibration: the test agent verbally denied an ability to record feedback even though operator-side save was available. This does not negate the transport, persistence or reviewed-evidence proof. It does prevent an overall perceptual-quality or product-truthfulness pass; action and capture language should be calibrated before a customer pilot. A separate concise four-question boolean brief was fully generated, explicitly used and saved into an intentionally editable fictional campaign that remains in partial `setup`; it is not a failed generation.

Provider event identifiers remain internal correlation values. The product does not present them as meaningful campaign context outside the existing technical inspector.

## Open gates and claim boundaries

- The recovered five-entry live Azure Listen & type call passes the bounded scheduler ordering, persistence and phase-navigation gate. It does not verify physical-microphone capture, actual acoustic interruption, perceived latency or audio quality.
- Waiting for exact acknowledgement may add turn latency. Live acknowledgement timing and its perceptual effect remain unmeasured.
- A physical microphone, real ASR timing, acoustic barge-in/truncation, device/browser variance and human-rated output quality remain unverified.
- No external email was sent. Existing uncertain-outcome behavior still forbids automatic resend.
- No cloud resource, hosted application, public channel, telephone route or OAuth connection was created or activated in this increment.
- Azure remains the only approved paid inference route and must stay inside the selected grant. Gemini remains the explicitly bounded existing evaluation path, unchanged by this work.
- The employer-laptop prohibition on local Docker remains in force.

## Finish-review disposition

Independent review returned **SHIP** for the canonical campaign workflow described here; see `docs/campaign-workflow-finish-review.md`. This closes the scoped increment at code commit `2d874ec`.

Physical microphone, acoustic truncation, acknowledgement latency, perceptual quality, action-wording calibration, real external channels, hosted operation and benchmarks remain separate open gates. The scoped verdict is not whole-product approval or customer-pilot readiness.
