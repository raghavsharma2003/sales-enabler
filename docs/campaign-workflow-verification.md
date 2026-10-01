# Campaign workflow and private turn-control verification

**Checkpoint:** 2 October 2026  
**Status:** canonical fictional-workspace flow verified through explicit launch; final post-fix automation, browser review and private live scheduler verification remain in progress

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

Manual authoring and AI assistance are methods inside the same campaign. Applying an AI brief suggestion is an explicit operator action against the current setup revision. It does not create or silently mutate a second campaign. Existing `Manage`, `Plan with AI` and `Write manually` destinations resolve into the unified workspace so saved links and historical records remain usable.

Partial setups and complete drafts can be reopened safely by their canonical ID. AI brief assistance presents bounded suggestions that still require explicit operator selection and save. The run surface derives a controlled recipient projection from the immutable run snapshot and current result state; it does not treat an excluded or ineligible contact as an actionable call target.

## Private WebRTC ordering

The private browser path now uses a dedicated scheduler with these invariants:

- Each typed or ASR turn stages the current-turn instructions before sending a provider update.
- Response creation waits for the unique matching `session.updated` acknowledgement and rejects stale or mismatched acknowledgements.
- Typed turns, ASR completion, interruption, provider cancellation and tool activity are serialized so one active reply cannot be mistaken for another.
- Provider speech start cancels an in-flight response once, and audio truncation remains bound to observed playback progress.
- Tool completion stages fresh guidance and uses the same acknowledgement gate before continuing generation.
- Explicit end and error paths preserve already captured ASR text without generating another reply. Component unmount only tears down resources and does not manufacture a transcript turn.
- Existing Gemini behavior remains unchanged.

Independent review found five private-voice defects and two campaign parser defects. Regressions now cover the corrected acknowledgement correlation, busy/tool ordering, teardown transcript capture, enum coercion, duplicate/prototype review keys and evidence-item length handling.

## Verification record

The latest completed integrated checkpoint passed:

- **671/671 integrated tests**
- a second production build
- a second packaged-artifact check

A controlled-recipient projection fix and one additional regression were added after that checkpoint. A fresh integrated suite and production build/package check are therefore still required before this document can record final acceptance.

Authenticated browser verification in a fictional workspace has proved the canonical flow through launch:

- Created a partial campaign, saved it, reloaded it and retained the same campaign ID.
- Selected two fictional contacts, finalized the same ID to a draft, and observed preflight block one contact that lacked consent.
- Reopened the same draft safely, removed the ineligible contact and saved the correction.
- Generated a live Azure content proposal whose opening read like an email letter. Browser-focused spoken-opening validation rejected it, so it was not applied.
- Generated a second live Azure proposal with a short AI-disclosed spoken opening and no questions, reviewed it explicitly and applied it to the same campaign ID.
- Observed one-of-one ready preflight, then launched explicitly. The immutable run became active with one queued controlled recipient. Launch did not automatically send an email or start a call.

The browser exercise used existing local HTTP APIs. It did not provision cloud resources, use real customers, activate telephony or deliver real email.

## Open gates and claim boundaries

- A private live Azure attempt after the acknowledgement gate reached the AI greeting. The first typed reply then produced a generic provider error, and the failed transcript was preserved. This attempt does not pass the scheduler's live gate; investigation remains active. The earlier private typed three-turn Azure evidence from the 614-test structural pass is historical and does not verify this scheduler.
- Waiting for exact acknowledgement may add turn latency. Live acknowledgement timing and its perceptual effect remain unmeasured.
- A physical microphone, real ASR timing, acoustic barge-in/truncation, device/browser variance and human-rated output quality remain unverified.
- No external email was sent. Existing uncertain-outcome behavior still forbids automatic resend.
- No cloud resource, hosted application, public channel, telephone route or OAuth connection was created or activated in this increment.
- Azure remains the only approved paid inference route and must stay inside the selected grant. Gemini remains the explicitly bounded existing evaluation path, unchanged by this work.
- The employer-laptop prohibition on local Docker remains in force.

## Finalization checklist

Before changing this checkpoint to complete, record the final post-projection integrated test count, fresh production build/package result, remaining authenticated desktop/mobile browser results, console state and independent review. A successful greeting followed by a provider error is not a live scheduler pass; keep the acknowledgement latency, microphone, truncation and perceptual gates open until separately verified.
