---
name: Relay workspace platform
description: A quiet company operations workspace that moves reviewed context into bounded agents, campaigns, conversations, and accountable follow-through.
colors:
  ink: "#242634"
  muted: "#626779"
  line: "#e5e7ed"
  accent: "#5148ce"
  hover: "#f4f4fa"
  canvas: "#fbfbfd"
  wash: "#efedff"
  surface: "#ffffff"
  success-surface: "#e9f6ef"
  success-ink: "#246448"
  danger-surface: "#fff3f4"
  danger-ink: "#9b3547"
  account-canvas: "#f7f8fc"
  account-ink: "#192234"
  account-muted: "#586277"
  account-line: "#dfe3ed"
  account-accent: "#4e46bc"
  account-focus: "#a9a7eb"
typography:
  body: {fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", fontSize: "13px", fontWeight: 400, lineHeight: 1.5}
  page-title: {fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", fontSize: "27px", fontWeight: 650, lineHeight: 1.2}
  overview-title: {fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", fontSize: "clamp(30px, 3vw, 38px)", fontWeight: 680, lineHeight: 1.08, letterSpacing: "-0.035em"}
  operational: {fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", fontSize: "12px", fontWeight: 400, lineHeight: 1.5}
rounded: {sm: "6px", md: "9px", lg: "12px", pill: "20px"}
spacing: {page: "34px 36px 40px", panel: "22px", workbench-gap: "18px"}
components:
  button-primary: {backgroundColor: "{colors.accent}", textColor: "{colors.surface}", rounded: "{rounded.sm}", padding: "8px 12px", height: "34px"}
  panel: {backgroundColor: "{colors.surface}", rounded: "{rounded.md}", padding: "{spacing.panel}"}
  selected-row: {backgroundColor: "{colors.wash}", textColor: "{colors.accent}", rounded: "{rounded.sm}", padding: "11px 9px"}
---

# Design System: Relay workspace platform

## Overview

**Creative North Star: “The Quiet Operations Desk”**

Relay is an Operate product: reviewed company context becomes a bounded representative and campaign, and each customer attempt becomes an attributable conversation, commitment, or proposed improvement. The interface gives the operator one clear place and next action while preserving the records underneath. DM Sans, cool white and lilac-gray surfaces, indigo emphasis, restrained status color, and Lucide icons remain the visual identity; this reset changes workflow composition, not the brand world.

The primary shell has five working areas—Overview, Company, Agents, Campaigns, and Activity—with Settings kept separate. Inactive areas keep their context groups collapsed. The former 18 destinations remain reachable through route aliases, contextual links, workspace search, and record anchors, so simplification must not erase artifact ownership or deep navigation.

Overview is a company-readiness and continuation surface, not an aggregate dashboard. It shows the saved company state, one evidence-based next action, current unresolved attention, campaigns in progress, recent agents and conversations, and a supporting workspace journey. Campaigns in progress use flat rows that name the saved goal, offering, exact phase, and next action on the same durable campaign. A later passing retest supersedes an older failed configuration run; historical failures do not remain open attention. Continuing an active run or saved campaign phase takes priority over optional public-channel setup. Missing or failed readiness requests stay explicit rather than being interpreted as an empty workspace.

Agents is one continuous build–test–publish workspace. A compact agent picker and persistent Save draft / Test agent toolbar sit above a wide six-section editor and a continuously mounted test dock. New agents begin in Setup with required name, role, and purpose fields plus task presets. Prompt authoring appears only in Conversation. Publish and release history share one release-review pattern: candidate and active versions stay visible together, the server reviews the exact saved version against current configuration and required text evidence, and voice/device evidence remains neutral and explicitly unproven. Publication is a separate decision, followed by a separate channel handoff.

Campaigns is one durable record across Intent, Audience, Agent & content, Review, Run, and Results. Setup can be saved while incomplete without inventing placeholder truth. AI brief suggestions are copied into local fields only when the operator chooses Use, then require an explicit save. Full content proposals apply through separate receipts bound to the exact campaign revision and reviewed sources. Review checks current authority and eligibility; launch separately freezes the run snapshot. Run owns recipient-level execution and the mounted browser call. Results is a distinct evidence surface for exact conversations, completion evidence, planned-field review, and truthful empty states.

The latest finish review in `docs/duplex-finish-review-oct09.md` returned SHIP for this scoped increment after the nine `duplex-{release,home,timing}-{desktop,mobile,user674}.png` captures covering release review, Overview continuation, and client timing evidence. Its focused suite passed 39/39; the final frozen source separately passed 804/804 root terminal tests. After one unused test-only `@ts-expect-error` annotation was removed, the corrected terminal production build completed with exit 0, including TypeScript and the postbuild package check across 1,104 entries; that correction did not change runtime or UI behavior. The release decision bar and rollback candidate were source- and test-reviewed but are not visually established by those captures. This evidence covers only the implemented interface and its recorded states; it does not establish auditory quality, end-to-end or acoustic latency, microphone/device behavior, hosted-channel outcomes, external delivery, competitor superiority, or whole-product readiness. The shipped extension adds no new asset or motion obligation.

**Key Characteristics:**

- Five task-oriented areas with preserved deep routes
- One company-derived next action
- Wide editor with continuous testing context
- One durable six-phase campaign record
- Durable import–map–review–apply customer intake
- Reviewed redacted text rehearsals against exact agent versions
- Exact-server-reviewed release decisions with visible candidate and active versions
- Independent client timing intervals with explicit sample sufficiency
- Quiet tonal surfaces with indigo state emphasis
- Visible roles, consent, AI identity, and artifact ownership

## Colors

The reset keeps the incumbent cool-neutral and indigo palette. White and cool canvas carry the work; lilac indicates selection and review context; green and rose communicate recorded state without implying broader success or quality.

### Primary

- **Relay indigo** (#5148ce): selected navigation, primary actions, links, focus rings, active tabs, and the current journey step.

### Neutral

- **Ink** (#242634): headings, form values, records, and transcripts.
- **Muted slate** (#626779): explanations, labels, timestamps, and secondary state.
- **Cool line** (#e5e7ed): dividers, panel edges, table rules, and tab baselines.
- **Cool canvas** (#fbfbfd) and **surface white** (#ffffff): page and work surfaces.
- **Lilac wash** (#efedff) and **quiet hover** (#f4f4fa): active navigation, selected records, review context, and hover feedback.
- **Success surface / ink** (#e9f6ef / #246448): passed checks, approved evidence, and current records.
- **Danger surface / ink** (#fff3f4 / #9b3547): current blockers, failed latest checks, paused work, and needs-review states.

### Named Rules

**The State Before Decoration Rule.** Use accent and semantic color to explain location, action, or saved state. Color never stands in for evidence or a quality claim.

## Typography

**Display Font:** DM Sans (with -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif fallbacks)

**Body Font:** DM Sans (with the same system fallbacks)

**Label/Mono Font:** DM Sans; operational metadata does not introduce a second visual voice.

**Character:** restrained, legible, and operational. The reset increases working-surface copy and controls to 13–14px while preserving smaller metadata where its label and context remain clear.

### Hierarchy

- **Overview title** (680, clamp 30–38px, 1.08): the orientation point for the workspace home.
- **Page title** (650, 27px, 1.2; 25px compact): primary working-area headings.
- **Workbench heading** (650–660, 17–20px, 1.3–1.4): recommendation, editor, publish, and journey sections.
- **Body** (400, 13–14px, 1.5–1.6): records, forms, guidance, and transcripts.
- **Label** (550–650, 10–13px, 1.4–1.55): form labels, statuses, timestamps, and operational metadata.

### Named Rules

**The Record Readability Rule.** Keep working copy and controls at 13–14px. Reserve 10–12px type for supporting metadata, never for a required decision or action.

## Layout

The shell uses a fixed rail and centered page frame. The rail is 234px by default, 250px above 1500px, and 210px below 1100px. Pages use a 1600px maximum width with `34px 36px 40px` padding; at 1100px the frame tightens, at 820px the rail becomes an accessible drawer, and at 580–620px pages use a 16px side gutter and 44px minimum interactive targets. The top bar keeps a breadcrumb and workspace search whose results preserve record ownership and focus anchors.

Navigation shows Overview directly, then Company, Agents, Campaigns, Activity, and Settings. Each grouped area exposes its context destinations only when expanded; the active destination remains named in the breadcrumb. Back, Forward, native hash navigation, search results, sidebar links, and contextual links all pass through the same unsaved-work guard. A cancelled history traversal restores the accepted route and draft; a confirmed traversal loads the destination record.

Overview uses a responsive `1.72fr / minmax(300px, .72fr)` layout: next action, campaigns in progress, attention, and recents form the primary column while the journey remains a sticky supporting rail. It becomes one column at 900px. Campaign continuation is a flat divided list rather than a card grid; each row keeps the campaign identity and goal left, exact phase and next action right, then stacks that metadata below the campaign copy on mobile. Recent agents and conversations form two columns until 1180px, then stack. The recommendation is an emphasized lilac surface; attention and recent work also use flat divided rows.

Agents uses a compact picker inside a sticky toolbar and a `minmax(0, 1fr) / 330–370px` editor/test grid. The test dock remains mounted while the operator changes among Setup, Conversation, Voice & language, Knowledge, Behaviour & actions, and Publish. The grid becomes one column at 1080px without unmounting the tester. At 620px, the toolbar, field pairs, and tabs stack into touch-safe layouts; the test dock follows the editor in the same reading flow.

Campaigns uses a persistent record picker and a six-step bar above one work surface capped at 1120px. The steps form six columns on wide screens, three below 1000px, and two below 620px. Intent, Audience, Agent & content, and Review reuse the same revisioned setup record; Run and Results read its fixed launch snapshot. The browser call desk remains mounted while moving between Run and Results, with a sticky call-in-progress return bar. Results uses a recipient list beside evidence detail and stacks to one column below 760px; result tables become labelled blocks below 650px.

Customer table intake is a four-stage Import table → Map columns → Review rows → Applied flow within Company. Import and mapping use balanced columns on wide screens. Review rows use identity, evidence, and decision columns; evidence spans the row below 820px and all review content becomes one column below 580px. Whole-source counts, batch navigation, global source-row exclusions, exception filters, and the prepared decision summary stay visible in the reading flow. Bulk controls prepare decisions only; the separate Apply reviewed batch action remains the sole customer-write boundary.

Text rehearsal uses one sequential column capped at 960px. The same reading flow moves from reviewed redacted checkpoint and criteria authoring to exact-version candidate generation, saved-attempt history, quoted judgments, operator review, and required-suite status. At 620px, paired fields, run controls, attempt history, verdict choices, and headings stack; controls reach 44px and editable type rises to 16px. The final 1265px, 659px, and 375px captures confirm readable, horizontally contained behavior across the shipped widths.

Client timing evidence stays compact and display-only inside live and saved call surfaces. Each stage is an independent browser event interval with its own Samples, Latest, P50, and P95 columns; the rows must never be visually summed into an end-to-end number. Metrics collapse to one column when their container is narrower than 560px, while observations become a simple vertical list.

## Elevation & Depth

Depth is tonal. White panels sit on a cool canvas with quiet borders, lilac selection, and semantic status surfaces. Resting work surfaces remain flat; the search result popover uses the existing small ambient shadow, and transient voice state can use the established call ring. Reduced-motion preferences remove nonessential animation.

### Named Rules

**The Flat-By-Default Rule.** Use borders, washes, and spacing to establish hierarchy. Reserve shadow or motion for a temporary overlay or live state.

## Shapes

Inputs, buttons, and action controls use 5–7px corners. Editor and workbench panels use 9px corners; Overview company and action containers use 10–12px. Small state badges use 4px corners, while circular journey markers identify ordered progress. Tables, record lists, and attention rows rely on dividers and whitespace rather than boxed cards. Focus-visible controls use a 2px indigo outline with a clear offset.

## Components

### Workspace navigation and search

The rail presents task areas rather than implementation objects. Group headers have 44px mobile targets, lilac active state, and independently operable disclosure controls. Context destinations remain real links. Search covers pages and saved artifacts including agent versions, test runs, releases, deployments, campaigns, and conversations; selecting a result opens its owning surface and focused record.

### Overview recommendation and attention

The recommendation is the strongest object after the page title: one title, reason, evidence label, primary action, and a few contextual alternatives. Company readiness is shown beside the heading. Attention rows require a saved reason and owning record. They include unresolved follow-ups, the latest still-failing readiness state, open commitments, paused campaign runs, and pending memories. Passing retests and superseded failures remain history rather than current attention. Recent agents and conversations show saved time, scoped state, and direct record navigation.

### Agent toolbar and picker

The toolbar persists agent identity, saved/dirty status, direct Test agent focus, and Save draft. The compact picker changes the selected record only after the dirty guard allows it. New agent starts Setup and focuses the name field; the Feedback interviewer and Customer support presets seed task language without bypassing required fields or AI disclosure.

### Agent editor and test dock

Six keyboard-operable sections replace simultaneous editor columns. Setup owns required name, role, and purpose. Conversation owns system prompt, opening message, AI introduction, and style; prompts are not repeated above unrelated sections. Voice & language preserves raw comma/newline editing buffers until validation and save. Knowledge attaches approved sources. Behaviour & actions keeps memory, human handoff, and bounded in-call actions explicit. The test dock remains mounted so draft test state survives section changes; Test agent moves focus to it, and Back to editor returns focus without changing routes.

### Release review and history

Publish and release history use the same review component for a new release or rollback. The identity block keeps Purpose, Candidate, Active now, and Decision together so an older active version is never confused with the candidate. `Review current evidence` requests a fresh server packet bound to the exact agent version, operation, and configuration run; a changed selection or evidence context invalidates the packet.

The proof list separates Configuration, required Conversation cases, and Voice and device. Configuration and required text cases use semantic pass, wait, and fail states with direct repair actions. Voice and device remains neutral even when the other rows pass, stating that audio, latency, interruption, and microphone behavior are unproven. Only a current publishable packet enables the explicit Publish or Roll back action. Release history remains inspectable, and an active release reveals a visually separate Channel handoff; neither publication nor handoff activates a public or messaging channel.

### Client timing evidence

Timing evidence reports independent browser event intervals from the persisted diagnostics allowlist. Every row shows its own sample count and Latest value. P50 appears only from 3 samples and P95 only from 20; unavailable percentiles render as an em dash with accessible minimum-sample text, while a measured zero remains `0 ms`. Each stage retains at most 20 samples. Typed calls name microphone-only rows and counters as `Not observed in this typed call` rather than displaying zero. The scope copy states that the intervals exclude audible playback and do not measure acoustic or end-to-end latency.

### Customer table intake

Intake is one durable Import table → Map columns → Review rows → Applied record. A review is scoped to the organization and actor, names its saved revision, preserves local unsaved state, and can be reopened from the same source. Timeout, interruption, stale-preview, concurrent-revision, and surrounding-list refresh failures retain the operator's choices or the saved apply receipt and offer an explicit reload/check path. Switching sources or batches guards unsaved work; discarding a local draft never removes saved progress.

AI mapping is advisory. Suggestions appear in a lilac proposal with target, reason, and alternatives; the current mapping and row decisions remain unchanged until the operator chooses `Use these suggestions`. Use still does not save, prepare rows, or apply customers. Every column must resolve to a field or Skip before preview, and a changed mapping invalidates prior apply authority.

Review keeps whole-source truth beside batch detail. Created, linked, skipped, and pending counts reconcile to the source total after reload. Filters expose exceptions, valid new customers, safe exact matches, and undecided rows. Global source-row exclusions can address later batches before the current batch is applied. Bulk actions prepare eligible creates, exact-match links, or skips; they never apply. The final action summarizes creates, links, and skips, saves the review revision, and applies the batch atomically. Applied receipts keep replay, next-batch, skipped-row revisit, and prior-decision views available.

The customer handoff opens canonical customer records using recognized imported fields with a saved-source fallback when needed. A source do-not-contact or opt-out flag remains a visible restriction and still blocks campaign contact; import and handoff do not grant consent, verify identity, approve company knowledge, infer an offering, launch a campaign, or contact anyone.

### Text rehearsal

Text rehearsal is a bounded, review-first evidence workspace. The operator selects one exact person trigger with the minimum saved context, prepares a redacted derivative, reviews every turn and detector finding, and explicitly confirms that identifiers were replaced before creating a case. Draft discard is explicit. Approved cases bind source lineage, a versioned rubric, observable text criteria, and required or optional suite membership without retaining raw selected values in the reusable checkpoint.

The run step selects an immutable version of the same agent and generates a new text reply. Saved attempts remain selectable and carry stable suffix references; opening an older failed attempt changes the evidence on screen but does not replace the latest attempt used by suite status. Each judgment keeps the AI verdict, rationale, and exact quoted reply evidence separate from the operator's required Met, Not met, or Uncertain verdict and reason. Met uses green with a check; Not met uses rose with an X; uncertain and incomplete states remain neutral or blocked rather than inheriting success tone.

Required-suite status checks the latest saved attempt for every required case against the current case set, runtime/configuration digest, knowledge authority, and latest blocking operator reviews. Missing, invalid, stale, uncertain, or unreviewed evidence blocks the suite, while historical failed attempts remain inspectable. Bounded request timeout, guarded refresh and selection changes, draft discard, and retry preserve a recoverable path. This suite supplies surrogate text evidence only: it does not publish an agent and does not measure Realtime audio, pronunciation, prosody, latency, interruption handling, microphone behavior, or voice quality.

### Canonical Campaign workflow

Intent binds a reviewed offering, goal, measurable outcome, and required evidence. Audience selects named recipients and explains why they belong; selection never grants consent or contact permission. Agent & content chooses the channel, exact active release or mailbox, opening content, supporting approved sources, and planned result fields. Inline blockers explain what remains while allowing a partial draft to be saved. Review summarizes the fixed brief, then runs a separate current preflight before launch. A changed campaign revision, customer/evidence authority, or failed launch invalidates the prior readiness result.

AI brief assistance proposes outcome, evidence, audience rationale, and typed questions beside the saved local draft. `Use these suggestions` changes only the local editable fields and does not save or launch. AI content planning compares the saved draft with a source-disclosed proposal, retains exact quotes and an Open source path, and requires explicit Apply. Apply updates the same campaign record; it does not create a parallel campaign, launch, or contact anyone. Stale proposal evidence blocks application, and a draft can be safely reopened for editing before a run exists.

Run owns pause, cancel, controlled recipient selection, manual completion evidence, exact-session selection, connected-email status, and the browser call desk. Email accepted, rejected, and uncertain terminal states settle operational queue progress without proving delivery, customer response, or business success; uncertain outcomes are never resent automatically. Results stays visually and semantically separate from execution. It shows per-recipient completion, saved-conversation navigation, caller excerpts, operator-reviewed planned fields, extraction receipts, and `Recheck saved reply · no AI call`. Accepted fields do not establish the campaign outcome. When no result fields were planned, the surface says so and keeps manual evidence and saved conversations available.

### Dirty navigation and history

Raw field buffers and unsaved draft values remain mounted until save, discard, or confirmed navigation. Agent changes, Create agent, sidebar navigation, search, contextual links, Back, Forward, and hash changes share the guard. Cancel restores the accepted URL/history position; confirm performs the intended navigation once without a second prompt.

### Roles, consent, and AI identity

Viewer access keeps records readable while disabling editing, testing, publication, and sending. Agent introduction must identify the representative as AI before customer conversation. Test and public call surfaces keep consent, stop-for-human, participant scope, provider state, and source boundaries visible. A configured provider, passing check, release, or channel draft never proves delivery, identity, audible quality, or customer intent.

## Do's and Don'ts

### Do:

- **Do** organize new destinations under Overview, Company, Agents, Campaigns, Activity, or Settings and preserve a clear owner for every saved artifact.
- **Do** keep inactive navigation groups collapsed while retaining direct links, search, aliases, and anchors for all former destinations.
- **Do** derive Overview from saved company readiness and current records, and present one next action with its evidence.
- **Do** prefer active campaign work over optional channel setup and treat only the latest unresolved exact-version failure as attention.
- **Do** keep the agent picker compact, editor spacious, tester continuously mounted, and Save draft / Test agent available from the toolbar.
- **Do** preserve raw editing buffers, focus the first invalid field, and guard all route and history exits when the draft is dirty.
- **Do** run checks against an exact saved version, publish explicitly, then pass the active release into a separate Channel draft.
- **Do** keep candidate, active version, exact server review, configuration proof, required text proof, and unproven voice/device evidence distinct throughout release and rollback decisions.
- **Do** show timing intervals independently with sample counts, minimums of 3 for P50 and 20 for P95, a 20-sample cap, and unknown or typed-microphone-absent states that never masquerade as zero.
- **Do** keep Intent, Audience, Agent & content, Review, Run, and Results on one durable campaign ID with partial saves and exact revision checks.
- **Do** keep AI suggestions and proposals as attributable receipts until an operator explicitly uses or applies them, and invalidate stale readiness when authority changes.
- **Do** keep customer intake resumable per actor, preserve exact source evidence, reconcile whole-source counts, and separate prepared decisions from atomic Apply.
- **Do** keep source-wide exclusions, exception filters, saved revision conflicts, timeouts, and uncertain apply outcomes visible with direct recovery actions.
- **Do** preserve imported customer fields through the canonical handoff while keeping source do-not-contact restrictions and channel permission separate.
- **Do** build Text rehearsal from a reviewed redacted checkpoint, generate a new reply from one exact agent version, preserve failed attempts, and require explicit operator verdicts over exact quotes.
- **Do** bind required-suite truth to the latest attempt, current case set, runtime/configuration, knowledge authority, and blocking reviews while keeping older attempts inspectable.
- **Do** keep Results separate from Run and distinguish provider acceptance, reviewed evidence, and business outcome.
- **Do** preserve role limits, consent controls, explicit AI identity, anonymous/unverified participant labels, and human-review boundaries.

### Don't:

- **Don't** restore the former 18 peer destinations or a three-column agent workbench.
- **Don't** treat all historical failed checks as open attention or let an optional deployment displace running campaign work.
- **Don't** repeat prompt fields across sections, unmount the tester during section changes, or hide the artifact targeted by Save, Test, Publish, or Channel setup.
- **Don't** let a draft test, configuration check, release, or prefilled Channel draft imply public activation, live delivery, voice quality, identity verification, or business value.
- **Don't** add independent client timing rows into a synthetic latency total or treat browser-event timing as audible, acoustic, or end-to-end evidence.
- **Don't** bypass the dirty guard for Back, Forward, hash links, search, agent switching, or contextual navigation.
- **Don't** turn a phase change, partial save, AI suggestion, content proposal, preflight, or provider receipt into implied approval, launch, delivery, or success.
- **Don't** let AI mapping, bulk preparation, a saved intake review, or a source handoff silently change customers, grant contact permission, or clear an imported restriction.
- **Don't** hide skipped, excluded, blocked, pending, stale, or historically failed evidence behind a completed batch or passing latest result.
- **Don't** treat a Text rehearsal judgment or passing required suite as a publication gate, Realtime/audio benchmark, live-channel result, or production claim.
- **Don't** duplicate the execution workbench in Results, hide empty result-field states, or collapse recipient evidence into campaign-level claims.
- **Don't** present the focused review verdict as a whole-product usability, production, hosted-channel, or competitor-superiority claim.
