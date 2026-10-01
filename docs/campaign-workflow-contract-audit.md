# Campaign workflow contract audit

**Scope:** read-only contract audit for replacing Campaigns' `Manage / Plan with AI / Write manually` branches with one durable `Intent → Audience → Agent & content → Review → Run → Results` workflow. This document describes the smallest safe backend contract for the next implementation. It does not change product code.

## Decision

Use one `platform:campaign` record from the first save. Give an incomplete record status `setup`, keep its partial fields in a versioned setup envelope, and convert that same record to the existing complete `Campaign` shape with status `draft` at the Review boundary. `draft` then continues through the existing preflight, launch, run, voice, delivery, and result paths.

Do not introduce a long-lived `platform:new_campaign_setup` entity beside `platform:campaign`. That would create the second business object the reset is trying to remove. Conversion would need a second insert, a linkage, duplicate prevention after uncertain responses, navigation remapping, and cleanup rules. A `setup` status on the canonical campaign needs no SQL migration because entities already store arbitrary kind, status, and JSON data (`lib/server/db.ts:18-25`). It also preserves the campaign ID across every visible step.

AI and manual entry should be assistance methods inside this record. Saved `campaign_brief_proposal`, `campaign_plan`, and `ai:run` rows may remain as provenance receipts. They are subordinate artifacts, not alternate campaigns.

## Current contracts that can be reused

### Canonical execution records

- `Campaign` already owns name, motion, objective, channel, mailbox/release binding, message, audience, owner, optional applied-plan provenance, reviewed intent, offering labels, source anchors, call brief, success criteria, journey, and citations (`lib/platform/campaigns.ts:11`).
- `Run` freezes `campaignId`, the exact campaign revision, a structured clone of the full campaign, recipients, launcher, and launch time (`lib/platform/campaigns.ts:13`, `lib/platform/campaigns.ts:112-115`).
- Launch changes the campaign from `draft` to `launched` and inserts one active `campaign_run` in one compare-and-set transaction (`lib/platform/campaigns.ts:116-128`). The run snapshot should remain the execution boundary.
- Result updates are per recipient, only while a run is active and the recipient is still queued (`lib/platform/campaigns.ts:130-161`). Browser completion requires a saved session bound to the same contact, run, release, and release version (`lib/platform/campaigns.ts:153-159`).

### Reviewed intent and evidence

- `CampaignIntentInput` contains offering ID, outcome plus required evidence, signals, audience rationale, and typed review columns. `CampaignIntent` replaces IDs with revision/digest anchors and adds `reviewedAt` and `reviewedBy` (`lib/business/contracts.ts:12-20`).
- `createCampaignIntent` validates the selected contacts, requires a reviewed offering and reviewed signals, checks signal-to-offering and signal-to-selected-contact associations, and creates immutable anchors (`lib/business/engine.ts:221-250`).
- `getBusinessIntentEvidence` rejects stale offering, signal, and source anchors. `assertBusinessIntentCurrent` returns the compare-and-set fences intended to be included in the write transaction (`lib/business/engine.ts:252-274`).
- A generated `CampaignPlan` already contains the input goal/motion/channel/audience, immutable reviewed intent, source anchors, AI draft, model/run/usage/cost receipt, creator, and eventual campaign link (`lib/campaign-planning/engine.ts:12-19`).
- Plan output validation is reusable. It allowlists fields, bounds all text/lists, restricts template variables, derives citation offsets from approved source text, and requires at least one exact source citation for the plan basis (`lib/campaign-planning/engine.ts:21-55`).
- Evidence selection preserves complete reviewed quotes and explicitly reports omitted optional sources rather than silently truncating required evidence (`lib/campaign-planning/engine.ts:78-107`).

### AI proposal receipts

- Campaign brief suggestions are bounded to outcome, required evidence, audience rationale, questions to collect, and missing-context questions (`lib/campaign-brief/contracts.ts:4-30`). The parser rejects extra fields, personal identifiers, and unsupported claims that selected people used, bought, consented to, or were eligible for the offering (`lib/campaign-brief/service.ts:34-75`).
- Brief creation persists a deterministic, tenant-scoped pending claim before inference, stores the request hash, and refuses automatic retry while the outcome is pending or uncertain (`lib/campaign-brief/service.ts:117-151`). It sends the model a selected-contact count rather than identities and preserves exact offering quotes (`lib/campaign-brief/service.ts:153-166`). Completion changes the proposal to `ready` or `invalid` while retaining the AI run receipt (`lib/campaign-brief/service.ts:162-181`).
- Brief recheck reuses the saved completed receipt and does not purchase a second inference (`lib/campaign-brief/service.ts:184-216`). Tests prove tenant isolation, request replay, request-hash conflict, stale offering/contact fences, and that a brief creates no campaign or plan (`tests/campaign-brief.test.ts:46-68`, `tests/campaign-brief.test.ts:96-123`).
- Plan generation uses a deterministic `campaign-plan:<org, requestId digest>` ID and a request digest. Same input/request returns the saved plan; different input with the same request ID conflicts (`lib/campaign-planning/engine.ts:110-121`). It fences membership, reviewed business objects, sources, and their exact bytes around inference and insert (`lib/campaign-planning/engine.ts:122-169`).
- Plan apply is revision checked, changes only `proposed → applied`, fences membership, intent, source, contacts, and optional release, and creates the campaign atomically (`lib/campaign-planning/engine.ts:197-247`). Replay of the just-applied revision returns the same plan and campaign (`lib/campaign-planning/engine.ts:201-205`, `tests/campaign-planning.test.ts:54-64`).
- There is no general plan-update API. The route surface is list/generate plus apply (`app/api/campaign-plans/route.ts:7-17`, `app/api/campaign-plans/[id]/route.ts:7-13`). Existing plan records are therefore suitable immutable proposal/provenance artifacts, not mutable partial drafts.

### Review, runtime, and result guards

- Preflight recomputes contact existence, corrected profile identity, opt-out, channel consent, email availability, unresolved variables, mailbox authorization, and active release. It revalidates an applied plan's sources (`lib/platform/campaigns.ts:43-86`).
- Launch captures authority rows before preflight and compare-and-set fences the contacts/profiles, release, sources, plan, mailbox, and campaign preimage in the launch transaction (`lib/platform/campaigns.ts:98-127`).
- Campaign browser context requires an active run, exact release, queued recipient, current opt-out state, and current browser voice consent (`lib/voice/context.ts:64-75`). For a planned campaign it rechecks the applied plan, intent, sources, objective, message, call brief, and citations before building a campaign digest (`lib/voice/context.ts:79-107`). Voice connection checks that digest before and after provider connection and stores the authoritative campaign binding on the issued connection (`app/api/voice/connect/route.ts:31-48`, `app/api/voice/connect/route.ts:64-70`).
- Result extraction binds session, run, campaign, contact, offering, schema, campaign basis, release, and exact agent version with digests (`lib/campaign-results/contracts.ts:10-20`, `lib/campaign-results/service.ts:30-57`). Extraction uses a source-derived stable ID, preserves the complete transcript, persists `processing` before inference, and never automatically buys another extraction (`lib/campaign-results/service.ts:90-118`). Accepted fields require exact caller evidence and operator review; contradictory caller evidence cannot become an accepted fact (`lib/campaign-results/service.ts:121-155`).
- Connected-email delivery is one durable intent per tenant/run/contact, with a stable idempotency key and uncertain-send handling (`lib/delivery/engine.ts:31-34`, `lib/delivery/engine.ts:152-207`). It revalidates active run, original launcher, snapshot mailbox, queued recipient, current consent, destination, authorization version, plan/intent/source authority, and payload digest immediately before dispatch (`lib/delivery/engine.ts:97-149`).

## Why current persistence is insufficient

`campaign.create` cannot save an early step. Its parser requires a valid motion and channel plus nonempty name, objective, and message; only release and subject are optional (`lib/platform/campaigns.ts:19-27`). The create action immediately writes the fully shaped campaign (`lib/platform/campaigns.ts:89-90`). Saving semantic placeholders such as "Untitled" or "Draft objective" would make missing decisions look real and could leak into preflight, preview, or execution.

`campaign.update` is also a complete replacement, not a partial patch. It reparses the complete body, only permits status `draft`, and preserves hidden plan/intent fields server-side (`lib/platform/campaigns.ts:91-96`). It does not accept a caller revision, so its internal compare-and-set protects overlapping server writes but cannot deliberately reject a stale browser edit against the revision the browser displayed. The generic record update does compare the current database preimage and increments revision atomically (`lib/platform/records.ts:33-47`).

The planner's unsaved input lives only in React state. Only generated plans are durable (`components/campaign-planner.tsx:21-68`, `components/campaign-planner.tsx:114-150`). The present screen explicitly forks among `manage`, `plan`, and `manual`, with separate creation behavior (`components/platform/campaigns-view.tsx:12-20`, `components/platform/campaigns-view.tsx:51-70`).

The brief proposal is not a suitable partial campaign. It intentionally contains only an AI suggestion and has no channel, agent, content, review, launch, or result state. Its test explicitly verifies that no plan or campaign is created (`tests/campaign-brief.test.ts:119-124`).

The plan is not suitable either. It is an immutable proposal that becomes `applied`; applying it currently inserts a new campaign (`lib/campaign-planning/engine.ts:227-240`). Making the plan itself the campaign draft would mix proposal receipt, mutable operator work, and runtime authority.

## Minimum data-model change

Add a browser-safe pure contract module at `lib/platform/campaign-workflow.ts`. It should not read the database or call AI. It should export the following types and pure helpers.

```ts
export type CampaignPhase =
  | 'intent'
  | 'audience'
  | 'agent_content'
  | 'review'
  | 'run'
  | 'results';

export type CampaignSetupPhase = Extract<
  CampaignPhase,
  'intent' | 'audience' | 'agent_content'
>;

export type CampaignSetupFields = {
  name?: string;
  kind?: 'sales' | 'feedback';
  goal?: string;
  offeringId?: string;
  outcome?: { label: string; evidenceRequired: string[] };
  signalIds?: string[];
  audienceRationale?: string;
  reviewColumns?: ReviewColumn[];
  contactIds?: string[];
  channel?: 'browser' | 'manual_email' | 'email';
  emailConnectionId?: string;
  agentReleaseId?: string;
  subject?: string;
  message?: string;
  objective?: string;
  callBrief?: string;
  successCriteria?: string;
  journeySteps?: string[];
};

export type AcceptedCampaignPlan = {
  planId: string;
  planRevision: number;
  requestDigest: string;
  runId: string;
  explicitIntentV1: CampaignIntent;
  sourceAnchors: Omit<SourceAnchor, 'content'>[];
  citations: PlanCitation[];
  acceptedAt: string;
  acceptedBy: string;
};

export type CampaignSetupData = {
  schemaVersion: 1;
  phase: CampaignSetupPhase;
  fields: CampaignSetupFields;
  ownerId: string;
  briefProposalId?: string;
  acceptedPlan?: AcceptedCampaignPlan;
};
```

The phase is navigation state, not authority. A caller may move backward. Pure readiness helpers derive which later step is available from actual fields; changing `phase` must never make an incomplete setup launchable.

Recommended exports are `isCampaignSetup`, `parseCampaignSetupPatch`, `mergeCampaignSetup`, `campaignSetupReadiness`, `campaignDisplayName`, and `toCampaignDraftInput`. `campaignSetupReadiness` should return field-specific blockers for Intent, Audience, Agent & content, and finalization. `toCampaignDraftInput` should be the only pure conversion to the current complete `Campaign` input shape.

Keep `Campaign` as the complete launchable type and change `Run.snapshot` to that explicit complete type. Do not make every existing `Campaign` property optional globally; use the status/discriminated data shape so execution code cannot accidentally accept partial data.

No database migration is required. Legacy `draft` and `launched` campaigns remain unchanged. UI readers must branch on `record.status === 'setup'` before casting `record.data` to `Campaign`.

## Exact action payloads for the frontend

Keep these actions in the existing authenticated `/api/platform` dispatcher so the shell's `act()` refresh behavior continues to work (`app/api/platform/route.ts:15-28`, `app/page.tsx:123-126`).

### `campaign.setup.create`

```json
{
  "action": "campaign.setup.create",
  "requestId": "UUID or bounded stable browser request ID",
  "fields": {
    "name": "optional early name",
    "kind": "feedback",
    "goal": "optional initial goal",
    "offeringId": "optional approved offering ID"
  }
}
```

Response: `PlatformRecord<CampaignSetupData>` with kind `campaign`, status `setup`, revision `1`, phase `intent`, server-owned `ownerId`, and only the allowlisted initial fields.

The ID must be deterministic from `[organizationId, requestId]`, or creation must use an equivalent unique request claim. Store an input digest and return the existing record on exact replay; return 409 if the same request ID is reused with different initial fields. Current `createRecord` always uses a random UUID and is not creation-idempotent (`lib/platform/records.ts:24-31`), so it should not be called directly for this action.

### `campaign.setup.update`

```json
{
  "action": "campaign.setup.update",
  "id": "campaign ID",
  "revision": 3,
  "phase": "audience",
  "patch": {
    "contactIds": ["contact ID"],
    "audienceRationale": "Why the selected people are relevant"
  }
}
```

Response: the same campaign record with status `setup` and revision incremented once.

Requirements:

- Require the exact caller revision and compare the exact stored preimage in the write transaction.
- Strictly allowlist patch keys and validate only supplied values, then merge server-side.
- Never accept `schemaVersion`, `ownerId`, `briefProposalId`, `acceptedPlan`, `explicitIntentV1`, anchors, citations, reviewer identity, timestamps, model, AI run, or usage from this payload.
- Validate all contact, offering, signal, release, and mailbox IDs in the authenticated organization when supplied. Do not infer that selection grants consent.
- If a changed field is already covered by `acceptedPlan`, reject with 409 and require a new proposal/apply action. Do not silently clear provenance.
- Include `operatorMembershipFence` in the same batch as the write. Route-level viewer rejection is useful but is not a substitute for transaction-time role authority.

### AI brief assistance

Extend `POST /api/campaign-brief` with this preferred input:

```json
{
  "campaignId": "campaign ID",
  "campaignRevision": 3,
  "requestId": "stable paid-attempt ID"
}
```

The service loads the `setup` record and derives offering revision, goal, and audience from it. Do not accept duplicate authoritative fields when `campaignId` is supplied. The proposal remains separate and attributable. It must not mutate the campaign automatically. An explicit operator action applies selected suggestion fields through `campaign.setup.update`, optionally recording `briefProposalId` server-side after verifying the proposal basis still matches the campaign revision.

The current brief prompt assumes an operator-selected audience, and its request hash binds `contactIds` (`lib/campaign-brief/service.ts:124-140`). Therefore the unchanged service is safe only after Audience is saved. If the UI places assistance in Intent before audience selection, revise the brief prompt/contract to be audience-agnostic; do not tell the model an audience was selected when it was not.

### AI plan generation and apply

Preferred generation payload:

```json
{
  "campaignId": "campaign ID",
  "campaignRevision": 4,
  "requestId": "stable paid-attempt ID"
}
```

The server derives goal, kind, channel, contacts, source selection, and intent input from the exact setup preimage. Existing legacy generate payloads can remain supported for older clients. A generated plan stores its target `campaignId` and `campaignRevision` in its request digest.

Preferred apply payload to `POST /api/campaign-plans/:id`:

```json
{
  "action": "apply",
  "revision": 1,
  "campaignId": "same campaign ID",
  "campaignRevision": 4,
  "agentReleaseId": "optional exact active browser release"
}
```

For a targeted setup plan, apply must update that same `platform:campaign` row. It must not insert another campaign. In one transaction it fences operator membership, the exact setup preimage/revision, reviewed intent, sources, contacts, optional release, and proposed plan preimage; then it changes the plan to `applied` and writes generated content plus the `acceptedPlan` snapshot to the setup. Exact replay returns the already-applied plan and same campaign. A changed setup revision returns 409.

Applying another proposal while status remains `setup` may replace the current accepted plan, but the previous plan row remains immutable and audited. Generic patch cannot rewrite accepted plan output or provenance.

### `campaign.setup.finalize`

```json
{
  "action": "campaign.setup.finalize",
  "id": "campaign ID",
  "revision": 5
}
```

Response: the same ID as `PlatformRecord<Campaign>` with status `draft` and revision incremented once. Review is then durable through the existing draft plus preflight result fetched on demand.

Finalization must:

1. Re-read and compare the exact setup revision/preimage and membership in one transaction.
2. Require complete Intent, Audience, and Agent & content fields; return field-specific 409 blockers rather than semantic placeholders.
3. Build `CampaignIntent` on the server from the saved intent fields and current reviewed offering/signals/contacts. The client must never supply `reviewedBy`, `reviewedAt`, revision, or digest anchors.
4. Copy AI provenance only from an applied plan whose target and basis still equal this campaign. Copy manual values only from the allowlisted setup fields.
5. Normalize to the existing complete `Campaign` shape and atomically change `setup → draft`.
6. Audit the finalization and retain `ownerId` as the creator; do not replace it with the last editor.

If the first increment does not add a first-class manual intent authority path, require `acceptedPlan` at finalization. Storing `explicitIntentV1` without a plan is currently inconsistent: result extraction does revalidate direct intent, but voice only builds product context inside the `planId` branch (`lib/voice/context.ts:79-97`), and connected delivery rejects intent/source authority without a plan (`lib/delivery/engine.ts:128-143`).

If manual authoring must ship in the same increment, finalization may create reviewed `explicitIntentV1` without AI, but preflight, launch, voice context, voice tools, and delivery must all call `assertBusinessIntentCurrent` for direct intent. That is a larger runtime change than requiring an accepted plan, but it preserves the promise that AI is optional without weakening review.

## Field ownership and locks

| Field group | Setup patch | AI apply | Finalize | Draft edit | After launch |
| --- | --- | --- | --- | --- | --- |
| `name`, `kind`, `goal` | Operator | May propose name/content | Validated | Manual campaign only; planned kind/name should be locked | Frozen in run snapshot |
| Offering, outcome, evidence, signals, rationale, review columns | Operator draft | Server creates anchored `CampaignIntent` | Anchors/reviewer identity server-owned | Locked; revise through a new reviewed intent/plan | Frozen and revalidated |
| `contactIds` | Operator | Bound into reviewed intent/plan | Must exist in tenant | Locked once explicit intent is accepted | Frozen; consent still checked live |
| Channel, release/mailbox | Operator | Plan may bind channel; release remains an exact selectable deployment | Completeness/currentness checked | Release/mailbox may change before Review rerun; planned channel must be locked | Frozen; authority rechecked live |
| Subject/message/objective/call brief/success/journey | Operator for manual path | AI proposal, explicitly accepted | Bounded and normalized | Manual campaign may edit. Planned content must not use generic update. | Frozen |
| Plan IDs, source anchors, citations, model/run/usage/cost | Never | Server only | Copied only from exact applied proposal | Immutable | Frozen and fenced |
| Owner/reviewer/timestamps/revisions | Never | Server only | Server only | Server only | Immutable/audited |

The planned-content lock is required by existing runtime behavior. `campaign.update` currently preserves plan metadata and intent but allows edited objective, channel, subject, and message (`lib/platform/campaigns.ts:91-96`). Browser voice later rejects a planned campaign if objective, message, call brief, or citations differ from the applied plan (`lib/voice/context.ts:82-86`). Connected email validates plan intent/sources but does not make the same text equality check (`lib/delivery/engine.ts:128-149`). The unified flow should remove this channel-dependent inconsistency: either lock all accepted plan-derived content/channel/kind or create and accept a new immutable plan revision before changing them. The minimum safe choice is locking.

Once finalized, the existing audience lock should remain: changing contacts on a campaign with `explicitIntentV1` is rejected and the backend preserves the original reviewed intent (`lib/platform/campaigns.ts:91-96`; covered by `tests/campaign-intent-v6.test.ts:48-54`). Any later “Edit intent/audience” feature should create a new reviewed proposal and explicitly supersede the active binding; it must not mutate an existing `CampaignIntent` or `CampaignPlan`.

## Idempotency and concurrency requirements

- Setup creation needs a stable request ID and input digest because existing campaign creation is random and can duplicate after an uncertain response (`lib/platform/records.ts:24-31`). Use the browser request helper's stable-ID behavior or an equivalent server claim; it intentionally reuses the same ID for the same scope/input across reloads and creates a new ID only for an explicit new attempt (`lib/client/ai-request.ts:30-50`).
- Setup patch and finalize must require the revision the browser displayed. Generic record writes already use an exact stored preimage and status CAS (`lib/platform/records.ts:33-47`); the new service should add caller-revision comparison and the membership fence to that transaction.
- AI brief and plan requests should retain current request-hash/digest behavior. A timeout reconciles by GET; it must never automatically choose a new paid request ID (`components/campaign-planner.tsx:85-103`, `components/campaign-planner.tsx:114-137`).
- Plan apply should preserve current replay semantics while targeting the same campaign (`lib/campaign-planning/engine.ts:201-205`).
- Launch should preserve the existing single-run guarantee. Concurrent launches are already covered: one succeeds and one run exists (`tests/platform-review.test.ts:28-31`).
- Email dispatch must keep its one-intent-per-run/contact key and must never resend an uncertain outcome (`lib/delivery/engine.ts:152-207`).
- Campaign answer extraction must retain its binding-derived result ID and processing receipt so reloads/workers cannot purchase a duplicate inference (`lib/campaign-results/service.ts:90-118`).

## Tenant, viewer, and actor constraints

- API access starts with the authenticated user's organization. `requireUser` resolves active membership, blocks unverified accounts, and rejects every non-GET workspace request for viewers (`lib/server/auth.ts:38-46`). Mutating routes also enforce same origin, including platform, brief, plan, result, delivery, and voice-connect routes (`app/api/platform/route.ts:15-20`, `app/api/campaign-brief/route.ts:14-20`, `app/api/campaign-plans/route.ts:12-17`).
- Record helpers always query by `organization_id`, kind, and ID, producing tenant-scoped not-found behavior (`lib/platform/records.ts:13-22`). New setup reads and writes must do the same; never fetch a setup by ID alone.
- Route-level viewer blocking is insufficient for a long AI request or a race with membership removal. `operatorMembershipFence` captures the exact active member bytes and allowed owner/operator role for inclusion in the same transaction (`lib/team/service.ts:39-58`). Campaign-plan generation already demonstrates this pattern and rejects role removal during inference (`tests/campaign-intent-v6.test.ts:140-149`). Setup create/update/finalize and plan-to-setup apply should use it.
- `ownerId`, `acceptedBy`, and reviewed identity always come from `user.id`. A collaborator may edit the same setup, but cannot impersonate its creator or reviewer through payload fields.
- `campaign.setup.update` may accept tenant IDs only after type/length/deduplication checks and tenant-scoped lookups. Offering/signal status and source anchors must be checked again at finalization/apply, contacts and consent again at preflight/launch, and consent again at actual voice/email dispatch. Selection is never permission.

## Backend ownership

Use three layers:

1. `lib/platform/campaign-workflow.ts`: browser-safe types, parsing, merge, display, readiness, and normalization helpers. No database or AI imports.
2. `lib/platform/campaign-workflow-service.ts`: tenant reads, deterministic setup creation, revision-CAS patch, finalize, plan-to-setup application, audit events, and membership/business/source fences.
3. `lib/platform/campaigns.ts`: keep current complete campaign preflight, launch, run transitions, and result actions; delegate `campaign.setup.*` actions to the workflow service.

`lib/campaign-planning/engine.ts` should continue owning AI plan generation and immutable plan receipts. For targeted plans it should pass a normalized applied-plan payload into the workflow service rather than inserting a campaign itself. This avoids making the pure shared module depend on the planner and avoids a runtime import cycle.

The first frontend implementation can depend on these stable facts:

- A new campaign immediately has one durable campaign ID and status `setup`.
- Intent, Audience, and Agent & content save through the same revisioned record.
- AI suggestions never create a second campaign and never silently overwrite the setup.
- Continue to Review calls finalize; the returned same-ID record is status `draft` and can use existing preflight/launch actions.
- Review, Run, and Results are derived from the draft campaign, its immutable run snapshot, and bound result records; no additional mutable phase object is needed.

