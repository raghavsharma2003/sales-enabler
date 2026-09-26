# Company operating model v6

22 September 2026. Design and implementation contract; not a claim that the proposed v6 behavior is already implemented. This document supersedes v4's flow direction where the latest user clarification is more specific. Existing source, consent, release, provider and execution authority remains binding.

## Product job and evidence boundary

A founder brings the company's scattered material into one workspace. AI organizes it into reviewable company knowledge, products/services, customer records and business signals. The founder resolves consequential ambiguity. A campaign explicitly chooses the offering and desired outcome, explains its audience using evidence, reviews the information it will collect, tests the representative, and starts supported work. Results stay attached to the campaign, offering and individual customer; approved learning changes future behavior through a tested revision.

The company is the organizing unit. Voice is a central way the company interacts with customers. Agents, sources, inboxes and automations are supporting workspaces in that operating flow. Study abroad supplies examples, not the core schema. Android browser is the current mobile target; a native Android application is outside this slice. GroupAI means the existing world/room/audience mechanism, not another name for campaign cohorts.

Evidence vocabulary used here:

- **Observed**: a dated local verification record documents the actual bounded behavior.
- **Implemented**: code exists; this does not establish a successful full user journey or live external delivery.
- **Pending verification**: recent v5 implementation is present but root's complete verification has not been recorded at the time of this architecture pass.
- **Proposed**: v6 contract or later work, not a shipped capability.

The v4 local loop has bounded evidence in [operating-flow-verification-v4.md](operating-flow-verification-v4.md): ingestion, reviewed facts, grounded answers, campaign planning, exact release, a campaign-bound Listen & type session and reviewed learning. Existing planner input permits up to three approved brain sources and 500 selected contacts. It accepts `browser` and `manual_email`; the campaign executor also supports `email`. A source's existence or an exact quote proves provenance, not semantic truth.

Recent v5 in-call retrieval/follow-up tools, roles/invitations, WhatsApp inbox and durable email scheduling are implemented and pending complete root verification. Do not repeat the older statement that WhatsApp is only an account check as if it describes current code. Equally, do not claim a real WhatsApp exchange, external email delivery, hosted durable worker or microphone-device evaluation without new evidence. Current runtime-quality and product-workflow evidence must be reported separately.

## The continuous journey

1. **Bring company material.** Connect supported systems, upload supported files or paste notes. Retain source identity, digest, capture time, scope, parser result and omissions. Let the founder start manually without connecting an account. Failed or partial imports retain successful inputs and an explicit retry target.
2. **Understand and clarify.** Show extracted facts, possible offerings, customer matches, conflicts and signals in source context. Distinguish observed information, AI interpretation, unresolved identity and a proposed action. Ask a short founder question when the answer affects what is sold, to whom, at what terms or with which permission. Save the answer as attributable founder evidence; do not silently settle a conflicting price or merge a shared family email.
3. **Confirm what the company offers.** Give every actionable product/service a canonical identity. Review its name, kind, description, intended audience, supporting evidence and unresolved questions. Prices and eligibility remain sourced claims; this slice does not introduce an unsourced pricing engine. Show retired offerings and historical use without allowing new launch against retired terms.
4. **Choose useful work.** Start from an approved offering, a reviewed signal or a founder goal. Explicitly select the offering and outcome. Distinguish sales, qualification and service-feedback purposes without inventing unsupported runtime modes. A service-feedback campaign targets reviewed service recipients; missing service-history evidence is a question, not permission to include everyone.
5. **Review audience and information.** Show selected customers, why each belongs, missing data, ambiguous identity and channel exclusions. Review collection/result columns before composing the representative: labels, types, allowed answers and what counts as evidence. Unknown values remain unknown. Audience relevance and contact permission are separate decisions.
6. **Prepare and test.** AI drafts the message/interview brief from approved evidence and the reviewed intent. Existing agent controls remain available; plain English produces a reviewable draft diff. Test the exact draft against named or synthetic person scenarios and inspect what context was used. Preview tests never become campaign outcomes.
7. **Launch and supervise.** Review the exact offering, outcome, audience, message, agent release, channel, timing and eligibility. Browser execution is an operator queue. Manual email is an operator task. Connected email requires the actual delivery and scheduler gates. Pause blocks future dispatch; stop cancels pending work; neither retracts a provider-accepted message. Show the worker state and outcome uncertainty.
8. **See what happened.** Show outcome counts with denominators, exclusions, attempts, failures and unknowns. From any result open the customer journey, source evidence and offering. A conversation completed, a follow-up requested, a confirmed appointment and revenue received are different events.
9. **Improve deliberately.** Convert evidence into proposed customer memory, company corrections, owned service improvements or agent changes. Review scope and source, apply the change, test a new version and release it explicitly. Completion of a commitment and communication of its completion remain separate receipts.

## Minimum coherent implementation slice

Deliver **reviewed company offering → reviewed signal/clarification → explicit campaign intent → existing plan/test/run → attached results**, plus the plain-English draft-agent revision needed to tune that representative. Do not add another top-level tab for each noun.

Use only two new canonical business record kinds: `offering` and `business_signal`. Embed `CampaignIntentV1` in the existing `campaign_plan`, resulting `campaign` and immutable run snapshot. One additional `agent_change_proposal` record provides saved before/after review for natural-language changes; avoid a general-purpose patch framework in this slice. Founder clarification answers reuse `brain_source`, with explicit author/origin and the existing review machinery.

The implementation may also retain a `business_discovery` receipt containing request digest, generated record IDs, questions, AI run/model and usage. This is a durable idempotent batch receipt, not another canonical business entity or navigation destination.

This closes a real product gap: today an `offer` extraction becomes company knowledge, while the campaign goal is free text and sources are selected directly. The new path makes it impossible for the guided flow to quietly campaign for the wrong product and makes the intended outcome inspectable later. It does not require replacing ingestion, customer identity, learning, scheduling or release engines.

### Additive contracts

These are recommended interfaces. Implementers may adapt naming while preserving the fields and invariants. Existing platform records already provide ID, organization scoping, status, revision and timestamps; do not duplicate those fields in every data payload.

```ts
type EvidenceAnchorV1 = {
  sourceId: string; revision: number; digest: string;
  start: number; end: number; quote: string;
}; // Exact end-exclusive span in retained approved brain-source content.

type OfferingV1 = {
  schemaVersion: 1;
  name: string;
  kind: 'product' | 'service';
  summary: string;
  audienceDescription: string;
  sourceRefs: EvidenceAnchorV1[];
  openQuestions: string[];
  createdBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
}; // Platform status: draft | approved | retired.

type BusinessSignalV1 = {
  schemaVersion: 1;
  title: string;
  observation: string;
  interpretation?: string;
  offeringId?: string;
  contactId?: string; // Absent means unbound, never a guessed identity.
  sourceRefs: EvidenceAnchorV1[];
  uncertainty: string[];
  suggestedAction?: string;
  createdBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
}; // Platform status: proposed | approved | dismissed | superseded.

type CampaignIntentV1 = {
  schemaVersion: 1;
  offering: { id: string; revision: number; digest: string };
  outcome: { label: string; evidenceRequired: string[] };
  signalAnchors: { id: string; revision: number; digest: string }[];
  audienceRationale: string;
  reviewColumns: {
    key: string; label: string;
    type: 'text' | 'boolean' | 'number' | 'date' | 'enum';
    options?: string[];
  }[];
  reviewedBy: string;
  reviewedAt: string;
};

type AgentChangeProposalV1 = {
  schemaVersion: 1;
  agentId: string;
  baseRevision: number;
  baseDigest: string;
  instruction: string;
  changes: {
    field: string; // Allowlist of existing draft behavior fields only.
    before: unknown; after: unknown; reason: string;
  }[];
  questions: string[];
  model: string;
  aiRunId: string;
  requestId: string;
  appliedRevision?: number;
}; // Platform status: proposed | applied | rejected | stale.
```

For the initial slice, anchors reference approved `brain_source` records. Their ingestion provenance links to original input; do not widen company knowledge to raw customer transcripts to obtain convenient signal evidence. Customer-specific signals needing private evidence require a scope-aware evidence union in a later extension, or remain visible only in existing customer learning. Never copy private data into a shared source just to satisfy this interface. A manually authored founder source may be approved by an authorized operator; preserve it as a founder assertion rather than suggesting it was independently verified.

Use conservative explicit limits consistently in server and UI: offering name 160 characters, summary/audience 2,000 each, up to eight open questions, up to twelve source refs; signal title 160 and observation/interpretation 2,000 each; campaign at most twelve result columns and twelve signal anchors. These are proposed slice limits. Keep existing planner's three-source cap unless a bounded evidence-selection change is implemented and tested in the same pass. Show selected sources and omissions. A future evidence pack can retrieve bounded excerpts across more sources without pretending the entire company dump entered one prompt.

Result columns are a reviewed schema, not completed values. Save actual values only with conversation/receipt provenance and an unknown/observed/operator-confirmed distinction. In the first slice, render planned columns and existing evidence-linked results without claiming automatic field extraction. A subsequent implementation must carry `schemaVersion`, field key, source session/receipt, value and reviewed status for each extracted cell.

### Service and API seams

Business-context implementation owns `lib/business/contracts.ts` and `engine.ts`, offering/signal validation, scoped generation, review, clarification and the Brain UI. Campaign integration owns the existing planner plus intent snapshot and launch validation. Agent change implementation owns a bounded proposal service and an inline Agents review surface. Share contracts rather than duplicating validators. The nested `intent.offering` anchor and array of `outcome.evidenceRequired` values reflect the implementation agents' agreed contract.

```ts
listBusinessContext(user)
proposeBusinessContext(user, { sourceIds, requestId })
saveOfferingDraft(user, { id?, revision?, ...editableOfferingFields })
reviewOffering(user, { id, revision, action: 'approve' | 'retire' })
reviewSignal(user, { id, revision, action: 'approve' | 'dismiss', offeringId?, contactId? })
recordFounderClarification(user, { question, answer, relatedRecordId, requestId })
createCampaignIntent(user, submittedIntent, contactIds) // Server derives reviewers/digests.
assertBusinessIntentCurrent(user, savedIntent) // Returns transaction fences.
proposeAgentChange(user, { agentId, revision, instruction, requestId })
applyAgentChange(user, { proposalId, revision })
```

Expose a purpose-built `/api/business-context` GET/POST and `/api/agent-changes` GET/POST/PATCH, or route the same explicit allowlisted actions through existing API conventions. The important boundary is that generic `createRecord` does not become a client-controlled arbitrary entity writer. Server resolves authenticated organization and actor, referenced records, current source revisions and digest inputs. Changes use existing database compare-and-set and audit transactions. AI proposes content; application code owns identities, revisions, review attribution and executable authority.

Clarification submission first creates a source proposal; approving the answer and updating the dependent offering must either be atomic or expose the intermediate state honestly. A saved unanswered question blocks approval only when material to the specific campaign; an optional stylistic question need not block all company work. Mark material blocking questions explicitly in implementation rather than inferring them from prose. The minimal alternative is to keep an offering draft until its openQuestions list is resolved.

### Compatibility and invariants

- `intent` is optional on old plan/campaign/run payloads. Show “Offering not recorded” on legacy work; never guess a mapping. Existing manual flows continue. Guided v6 creation requires explicit intent, and legacy users may attach a reviewed intent only to an editable draft.
- An intent is resolved server-side from approved offering and signal records. Validate every reference in the tenant, evidence authority, revision and digest. Contact IDs remain in existing plan fields; signal approval never grants consent, creates identity verification or silently expands an audience.
- Generation/apply/preflight/launch/dispatch recheck the relevant evidence. Snapshot offering name/kind/summary and outcome at run creation for historical display, alongside identity/revision/digest. Subsequent source changes invalidate new use where applicable but never rewrite old results. Revocation makes evidence unavailable to new calls.
- Existing `campaign.update` reconstructs a limited campaign payload. Preserve validated intent through that path; do not silently drop it on a name edit or allow an unrelated source/goal change to keep a stale review. Editing selected offering, outcome, audience, columns or source basis clears the intent review and requires re-review.
- Add offering/signal authority to the transactional launch anchors and to durable email rechecks; adding fields only to the planner UI is insufficient. Preserve existing source/consent/mailbox/release safety gates.
- The planner currently distinguishes `manual_email` from executor `email`. Do not silently convert channels. If automated email planning is added, extend the input enum, prompt truth, apply validator and UI together and require an explicit authorized mailbox.
- Natural-language changes may alter allowed draft prompt/opening/language/behavior fields supported by current agent validation. They cannot change organization, provider billing route, consent, tools, release status or access scope. Requests needing such changes return a concrete question or unsupported-field explanation. Apply produces a draft revision, invalidates dependent preview assumptions and requires a fresh test/version/release. It never updates model weights; call it “Tune behavior” or “Revise agent.”
- Repeated apply requests return the original application receipt. Concurrent source, offering, signal or agent edits produce a 409 re-review state. Do not regenerate paid inference on reload or duplicate clicks. Retain source/prompt/model versions and usage receipts; unavailable price remains unknown.

## Screen and interaction contract

Keep the incumbent Operate layout, navigation and record language. The change is continuity and decision hierarchy, not a new visual identity.

| Existing surface | Addition and primary action | Detail and recovery |
|---|---|---|
| Command centre | Resume the next unresolved company decision or selected campaign | Show actual counts and one resumable record; no generic onboarding reset after reload |
| Company brain | Sources → review company understanding, with offering and signal rows inside the current workbench | Selected row opens evidence, observation/interpretation, conflicts and founder question; primary action is Review or Answer, then Approve |
| Company brain offering detail | Inspect approved description, evidence and related campaigns | “Create campaign for this offering” carries identity into Campaigns; retired item offers historical results |
| Campaign planner | Guided offering/outcome, audience/columns, plan, test, launch review | Keep a persistent campaign summary; back preserves choices; no external action from Generate or Apply plan |
| Agents editor | “Describe the change” input beside existing draft controls | Saved before/after diff and questions; Apply to draft then Test this revision; never fine-tune-weights language |
| Campaign results | Offering, desired outcome, recipient rows and evidence links | Clear queued/completed/failed/unknown denominators; planned fields visibly lack values until evidence exists |
| Customer detail | Related offering, campaign, conversations and owned follow-up | Identity uncertainty and private scope remain visible; historical data retains the tested/run version |

At desktop use a list/table plus a selected evidence panel. At Android widths stack the summary, selection and evidence with a persistent return path. Avoid horizontal workflow timelines that require reading off-screen. Keep selected record, unsaved edits and submission errors across navigation. Label controls, announce asynchronous failures, preserve keyboard focus and make the primary action reachable without tiny icon-only targets.

Signals should read as useful decisions: “Three reviewed interviews mention slow appointment follow-up,” followed by the actual denominator, source links, interpretation and a proposed next step. Do not display a numeric aggregate unless a deterministic computation can reproduce its numerator, denominator and deduplication rule. For the minimal slice use individual supported observations rather than fabricated trend counts. “High potential customer” without evidence and a defined meaning is not a useful signal.

## Failure and recovery contract

| Condition | Required behavior |
|---|---|
| Sources identify multiple possible offerings | Show separate proposals; require explicit campaign offering selection |
| Conflicting product name, fee or eligibility | Side-by-side evidence and founder clarification; no silent newest-wins rule |
| Founder does not know | Preserve unknown; allow unrelated work; block only dependent approval/action |
| Signal names someone but identity is ambiguous | Keep unbound; review possible matches; no customer memory merge or outreach |
| Model fails, emits invalid fields or cites the wrong span | Save failure and inputs; explicit bounded retry; manual review remains available |
| Source/offer changes after review | Show what changed; require refreshed evidence and re-review; preserve historical snapshot |
| No approved offerings | Offer review of extracted candidates or manual founder source; do not open an unexplained empty selector |
| No customers or no eligible channel | Permit planning/testing; explain missing audience or permission at launch |
| Natural-language request changes the wrong agent or conflicts with source truth | Show selected agent/base revision and the exact conflict; ask a focused clarification before creating an executable diff |
| Pause races with dispatch | Preserve provider outcome; stop future claims/dispatch; uncertain action stays held |
| Browser reload or worker downtime | Restore persisted draft/proposal/schedule and show genuine worker liveness |
| Results have no evidence | Show unknown or requested; do not turn a generated summary into achieved outcome |

## Measurable acceptance

The slice is accepted only when one fictional workspace completes both a sales case and a service-feedback case through the same surfaces, with a shared offering and customer journey visible after reload:

1. Import material describing two offerings and a contradictory fact; review at least two source-backed offering proposals and one signal. Ask and save a founder clarification with provenance. The unconfirmed offering cannot enter the guided launch path.
2. Choose one approved offering and an explicit outcome; inspect source/signals, selected customers, rationale and at least three typed result columns. An unresolved identity is excluded until explicit review; importing or approving a signal grants zero channel permissions.
3. Generate and apply the existing campaign plan. Reload restores the selected offering, outcome, columns and sources. Editing the offering/evidence after review causes a visible stale-state conflict, with no silent relaunch.
4. Request a plain-English agent change, inspect exact before/after values, apply once, and test the resulting draft. A second apply produces no duplicate revision. A competing edit returns a conflict. No release or external execution occurs merely from applying the diff.
5. Pass existing preflight and queue a permitted browser run. Save a properly bound session and record a supported result. Result and customer views show the same offering, intent and historical snapshot. Do not require a real customer call for acceptance.
6. Analyze a saved conversation, review a proposal and create an owned follow-up using existing learning. Show how the next draft uses approved knowledge; retain the prior conversation and version.
7. Exercise desktop and Android-width navigation, reload, an AI error, a stale review, empty audience and keyboard operation. Confirm no horizontal document overflow in the checked states. Android microphone/background behavior still requires actual device evidence.
8. Tests cover tenant isolation, forged reviewer/ID/digest, exact quote mismatch, stale evidence, replay idempotency, campaign-update preservation, launch and dispatch rechecks, and unchanged legacy records. Report new verification separately from historical counts.

## Subsequent complete-product work

After this slice, implement private customer-scoped signal evidence and deduplicated cross-source themes; extraction into reviewed result columns; product/customer analytics with drill-down; saved person scenario suites; persisted experiment assignment and A/B outcomes; additional executable journey steps; production connector/scheduler operations and actual-device voice evaluation. These remain part of the intended product, not optional ideas hidden by an MVP label.

An A/B experiment needs a stable assignment unit, exact variants, exposure records, a primary outcome, comparable observation windows and sample counts. Person-wise manual comparisons are useful tests but are not randomized experiments. Signal discovery and workflow completion do not establish naturalness, latency, emotional responsiveness or commercial lift. Those need independent runtime-quality and outcome evidence.

## Research synthesis and selective reuse

The following is inference from documented workflows and static source audits, not competitive runtime evidence:

- [Company data workflow cases](../research/2026-09-22/company-data-workflow-cases-v6.md) supports guided source mapping, sparse-record tests, uncertain identity, permission/currentness and human-approved changes. Clay's guided enrichment and Salesforce's distinction between unified profiles and source records reinforce the review boundary. Glean's connector currentness/permission model reinforces that “connected” is not “all evidence ready.” Our campaign must keep product relationship, customer role, contact point and permission together rather than combining unrelated facts into a plausible person.
- [Campaign case studies](../research/2026-09-22/campaign-case-studies-v6.md) compares Vapi, ElevenLabs, Bolna and Retell using one concrete workflow. The reviewed batch interfaces commonly accept flexible business variables; they do not establish correct product selection, identity or business-goal semantics. That is why the next slice adds reviewed intent upstream of execution. Documented batch scheduling, per-contact outcomes, testing and experiments inform subsequent implementation; telephone-specific no-answer/voicemail cases remain deferred with telephone integration.
- [Product signal reuse audit](../research/2026-09-22/product-signal-reuse-v6.md) identifies source mechanisms worth adapting: Command Centre's reviewed import patches and event/sequence boundaries, html-portfolio's append-only evidence/consolidation separation, and GroupAI's deterministic permission/decision traces. Preserve source pins and provenance from that audit. Do not import its source-specific authentication, phone normalization, industry ontology, private identity assumptions or provider routing.
- The reuse audit describes a richer eventual ontology including journey stages, clarifying questions and feedback themes. This slice deliberately represents clarification through existing source review and intent inside the existing plan. Promote those concepts into independent records when lifecycle/query requirements justify them; do not erase their user-visible behavior merely to keep the schema small.

See [use-case-coverage-v6.md](use-case-coverage-v6.md) for concrete cases and the evidence required to close each gap.
