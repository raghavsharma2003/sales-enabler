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

Live understanding is an optional Azure microphone-call aid inside the existing Voice Studio. It defaults off and requires its own checkbox plus the explicit speech-processing consent before a call starts. The call freezes that choice: the mode cannot silently switch, Listen & type remains unavailable while the option is selected, and the same microphone stream feeds both paths. Its dedicated inspector shows temporary current words that replace on each revision, never transcript turns, alongside tentative communication cues for language, pace, and a possible pause request. Those cues guide response preparation; they are not emotion truth, diagnosis, confidence, or permission to reply.

Campaigns is one durable record across Intent, Audience, Agent & content, Review, Run, and Results. Setup can be saved while incomplete without inventing placeholder truth. AI brief suggestions are copied into local fields only when the operator chooses Use, then require an explicit save. Full content proposals apply through separate receipts bound to the exact campaign revision and reviewed sources. Review checks current authority and eligibility; launch separately freezes the run snapshot. Run owns recipient-level execution and the mounted browser call. Results is a distinct evidence surface for exact conversations, completion evidence, planned-field review, and truthful empty states.

Campaign agent preparation extends that same record into Agents without creating a parallel workflow. The handoff carries the saved campaign revision and offering/goal context, can seed an editable starting draft, and returns only an exact active release. Returning binds that release to the campaign and restores the same campaign in Review so current eligibility and the complete brief remain the launch authority.

Usage & services is an operational ledger inside Settings. It separates AI and voice admission allowances from background-service reports and saved queues. Counts name attempts, reserved duration, occupied connection slots, and token evidence precisely; they are not invoices, provider billing, throughput, or quality measures. Service freshness remains a bounded process report with direct links to the owning work surface.

Quality adds Audio proof as an exact-run evidence surface beside text evaluation. One stored fictional caller fixture can be replayed against one immutable agent version with tools, customer memory, and business actions disabled. Input bytes, every failed or completed attempt, captured AI output, transcripts, playback state, and human reviews stay distinct. Starting or completing browser playback is never converted into a listening verdict; each criterion requires a separate reviewer attestation and remains independent from the text-release gate.

Voice & language includes an optional Azure-only speech-delivery profile. Workspace default saves no override; Standard requests `1×`; Unhurried requests `0.9×`; and an additional opt-in may follow a finite set of explicit final caller requests to slow down or return to normal. These are versioned requested settings. They do not infer emotion, change answer length, or establish perceived pace, warmth, naturalness, pronunciation, or a preferred voice.

Teacher voice auditions are a lazy, bounded evaluation workbench inside Agent Studio. An operator chooses the Taxila-source Diya or Arjun preset, reviews the exact Hinglish or English text, consents to one Azure Speech call, and keeps failed, uncertain, generated, expired, and unavailable-artifact outcomes in one history. Audio is private and expires after seven days; durable history keeps only a text fingerprint and counts. An audition never changes the agent draft, published version, or live Realtime voice.

Listening comparisons reuse two stored Audio proof recordings only after the server verifies matched caller input and configuration, with the declared comparison type naming either a delivery difference or an identical repeat. The reviewer receives a stable masked A/B order, listens through native controls, attests to both complete recordings, and saves append-only assessments for Naturalness, Pacing, Clarity, and Professional warmth. Source labels appear only after all four assessments. The screen states that prior familiarity and different generated wording prevent it from being a controlled blind study or a correctness test.

The latest finish review in `docs/duplex-finish-review-oct09.md` returned SHIP for this scoped increment after the nine `duplex-{release,home,timing}-{desktop,mobile,user674}.png` captures covering release review, Overview continuation, and client timing evidence. Its focused suite passed 39/39; the final frozen source separately passed 804/804 root terminal tests. After one unused test-only `@ts-expect-error` annotation was removed, the corrected terminal production build completed with exit 0, including TypeScript and the postbuild package check across 1,104 entries; that correction did not change runtime or UI behavior. The release decision bar and rollback candidate were source- and test-reviewed but are not visually established by those captures. This evidence covers only the implemented interface and its recorded states; it does not establish auditory quality, end-to-end or acoustic latency, microphone/device behavior, hosted-channel outcomes, external delivery, competitor superiority, or whole-product readiness. The shipped extension adds no new asset or motion obligation.

The later finish review in `docs/continuous-speech-finish-review-oct09.md` returned SHIP for the four continuous-understanding captures at the supplied desktop and mobile client areas. Filled-speech, unavailable, mute, and ended behavior is supported by source and focused tests rather than those images. The bounded record reports 39/39 focused checks, 900/900 root tests, standalone typecheck, the Next 16.4 production build and 1,113-entry package check, plus app, gateway, and worklet HTTP 200 checks. One isolated Azure SDK server probe produced four interim revisions and one sidecar final from synthetic audio; no browser microphone call was run in this pass. This evidence does not establish recognition accuracy, physical-device behavior, perceptual voice quality, acoustic or end-to-end latency, full duplex, hosted operation, competitor superiority, or whole-product readiness. No new imagery or motion is required.

The 10 October scoped finish review returned SHIP for campaign-to-agent return, Usage & services, and Audio proof after eight original passing captures, corrected desktop/mobile Usage recaptures, and one supplemental scrolled mobile slot capture. The frozen source passed 983/983 tests and a Next 16.4 production build with TypeScript and the 1,179-entry package check. One 6.9375-second fictional fixture produced a retained failed attempt followed by a 9.7-second captured AI output from the same bytes, and browser playback completed; no human listening verdict was supplied. A separate 29-second, three-turn private Azure Listen & type call ended through the UI, confirmed provider hangup, and saved its preview. These are bounded workflow and artifact results, not physical-microphone, human-listening, perceptual-quality, full-duplex, hosted-operation, competitor, billing, or whole-product evidence. The extension adds no new image or motion requirement.

The later `docs/speech-delivery-finish-review-oct10.md` returned SHIP for speech-delivery controls, bounded Taxila auditions, and masked listening comparisons after the final 1280×900 and 390×844 capture set. The mobile Quality destinations form a verified 2×2 grid with 177×44px tabs, 12px labels, and no horizontal overflow. Frozen source passed 1,054/1,054 tests, TypeScript, the Next 16.4 production build, the 1,207-entry package check, and packaged readiness HTTP 200. Matched artifacts A and B reported finite 14.0805-second and 16.75-second durations at media ready state 4 before playback. The saved pair remains 0/4 ratings with no reveal, attestation, or human preference. A separate post-fix private call closure remains operational evidence only. None of this establishes a perceptual win, pronunciation quality, preferred speed, live Taxila migration, publication approval, provider superiority, hosted readiness, or whole-product quality. No new imagery or motion obligation follows.

**Key Characteristics:**

- Five task-oriented areas with preserved deep routes
- One company-derived next action
- Wide editor with continuous testing context
- One durable six-phase campaign record
- Durable import–map–review–apply customer intake
- Reviewed redacted text rehearsals against exact agent versions
- Exact-server-reviewed release decisions with visible candidate and active versions
- Independent client timing intervals with explicit sample sufficiency
- Default-off, consented Live understanding with temporary replace-in-place speech evidence
- Exact-release return from agent preparation to the same campaign Review
- Operational allowances, occupied slots, service freshness, and saved-work status
- Version-bound synthetic Audio proof with separate playback and human review
- Versioned Azure speech-delivery choices with explicit-request adaptation
- Private, expiring Taxila-source teacher voice auditions that never change live voice
- Matched-input masked A/B listening with four append-only human criteria
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

Campaign-driven agent preparation adds one flat context panel above the existing agent toolbar. Campaign identity, offering, goal, return link, active version, and the exact-return action stay together without replacing the editor. The two horizontal rows wrap naturally on wide screens and become a single reading column on compact screens; the primary return action follows its version explanation.

Campaigns uses a persistent record picker and a six-step bar above one work surface capped at 1120px. The steps form six columns on wide screens, three below 1000px, and two below 620px. Intent, Audience, Agent & content, and Review reuse the same revisioned setup record; Run and Results read its fixed launch snapshot. The browser call desk remains mounted while moving between Run and Results, with a sticky call-in-progress return bar. Results uses a recipient list beside evidence detail and stacks to one column below 760px; result tables become labelled blocks below 650px.

Customer table intake is a four-stage Import table → Map columns → Review rows → Applied flow within Company. Import and mapping use balanced columns on wide screens. Review rows use identity, evidence, and decision columns; evidence spans the row below 820px and all review content becomes one column below 580px. Whole-source counts, batch navigation, global source-row exclusions, exception filters, and the prepared decision summary stay visible in the reading flow. Bulk controls prepare decisions only; the separate Apply reviewed batch action remains the sole customer-write boundary.

Text rehearsal uses one sequential column capped at 960px. The same reading flow moves from reviewed redacted checkpoint and criteria authoring to exact-version candidate generation, saved-attempt history, quoted judgments, operator review, and required-suite status. At 620px, paired fields, run controls, attempt history, verdict choices, and headings stack; controls reach 44px and editable type rises to 16px. The final 1265px, 659px, and 375px captures confirm readable, horizontally contained behavior across the shipped widths.

Client timing evidence stays compact and display-only inside live and saved call surfaces. Each stage is an independent browser event interval with its own Samples, Latest, P50, and P95 columns; the rows must never be visually summed into an end-to-end number. Metrics collapse to one column when their container is narrower than 560px, while observations become a simple vertical list.

Voice Studio keeps Live understanding beside input mode and consent, then exposes it as a dedicated tab in the existing Call inspector. The tab order remains keyboard-operable with roving focus, arrows, Home, and End. Status, current words, tentative cues, recognition counts, and the unsaved-data boundary descend in that order. On narrow screens the five inspector tabs form a stable two-column control set; the cue fields stack below 420px without changing their meaning.

Usage & services uses a `minmax(0, 1.35fr) / minmax(320px, .8fr)` operational split: allowances and attempt status lead, while service freshness and saved queues form the supporting column. It becomes one column below 1040px. Below 620px the page header, status rows, quota rows, and saved-work rows stack; essential labels and explanations stay at 11–12px or above, measures use tabular numerals, and occupied slots remain named separately from completed or currently live calls.

Audio proof keeps preparation in one full-width panel, then uses a `minmax(250px, .68fr) / minmax(0, 1.7fr)` evidence split for saved attempts and the selected run. At 900px the run detail follows the attempt list, which becomes two columns, and below 620px attempts, transcripts, review forms, and metadata become one column with touch-safe controls. Native audio controls stay native; copy beside them carries the playback and listening boundary.

Speech delivery is a three-column radio group within Voice & language: Workspace default, Standard, and Unhurried. The explicit-request checkbox and evidence link follow the group in the same reading order. Below 620px the choices become one column, while an unsupported Maya selection exposes a flat recovery message and Reset speech delivery action rather than hiding the saved incompatible state.

Teacher voice auditions open beneath one 44px disclosure. The workbench keeps source context, form, outcome messages, and saved attempts in one sequential column. At 620px its intro, history heading, request action, and load recovery stack; example-script buttons wrap to touch-safe widths; and each native audio player keeps duration beside the control without inventing a custom waveform.

Quality uses four keyboard-operated tabs. Below 580px they form a stable 2×2 grid with 44px minimum height rather than wrapping 3+1. Matched-comparison setup uses two recording selectors until 900px, then one column. Masked A/B players follow the same breakpoint; below 620px the page header, actions, saved comparison rows, reveal rows, and rating controls become one touch-safe column.

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

### Speech delivery controls

Speech delivery belongs to the versioned agent draft beside voice profile, languages, and vocabulary. Workspace default omits a stored override; Standard and Unhurried save the closed v1 profile at `1×` and `0.9×`. The adaptation checkbox is available only after an explicit rate is selected and names its narrow authority: direct final caller requests in English, Hindi, or Hinglish. It does not respond to inferred emotion, brevity, tentative recognition, or arbitrary requested rates.

Maya keeps its provider-specific delivery and cannot save this Azure profile. When a draft already carries the profile and the operator selects Maya, the interface preserves the conflict, blocks save with an accessible error, and offers Reset speech delivery. The footer calls the rates experimental and sends operators to saved Quality evidence; provider acknowledgement remains configuration acceptance, not perceived delivery proof.

### Teacher voice auditions

Teacher voice auditions load only when their disclosure opens. Diya and Arjun remain source-labelled Azure Speech presets, separate from the configured Realtime voice. Exact text, character count, selected preset, and private-processing consent form one explicit attempt. Example Hinglish and English scripts replace only the editable audition text and reset consent. Each generated result keeps a stable reference, preset, time, character count, outcome, validated native audio when available, and expiry state.

Only audio persists for up to seven days; durable history retains a fingerprint and outcome rather than raw text. Failed and uncertain attempts remain visible, timeouts never auto-retry, and a new attempt requires fresh consent. Viewer access remains playback-only. A successful source-preset artifact establishes bounded provider acceptance and storage, never teacher identity, pronunciation quality, naturalness, a preferred voice, or migration of the live agent.

### Campaign agent preparation and return

Agent & content hands an exact saved campaign revision into the existing Agents workspace. The context panel names the campaign, offering, and goal; Return to campaign restores Agent & content without changing the draft. A new-agent template may copy the campaign objective and opening into local editable fields, but it does not save, publish, or bind anything.

Returning requires a clean saved agent and an exact active release. The action rechecks the campaign revision and release authority, writes the binding to that campaign, and returns to the same campaign in Review. Stale, unavailable, unpublished, viewer-only, or dirty states remain blocked with a direct recovery path. The handoff never substitutes a different release, creates a second campaign, launches, or contacts anyone.

### Release review and history

Publish and release history use the same review component for a new release or rollback. The identity block keeps Purpose, Candidate, Active now, and Decision together so an older active version is never confused with the candidate. `Review current evidence` requests a fresh server packet bound to the exact agent version, operation, and configuration run; a changed selection or evidence context invalidates the packet.

The proof list separates Configuration, required Conversation cases, and Voice and device. Configuration and required text cases use semantic pass, wait, and fail states with direct repair actions. Voice and device remains neutral even when the other rows pass, stating that audio, latency, interruption, and microphone behavior are unproven. Only a current publishable packet enables the explicit Publish or Roll back action. Release history remains inspectable, and an active release reveals a visually separate Channel handoff; neither publication nor handoff activates a public or messaging channel.

### Client timing evidence

Timing evidence reports independent browser event intervals from the persisted diagnostics allowlist. Every row shows its own sample count and Latest value. P50 appears only from 3 samples and P95 only from 20; unavailable percentiles render as an em dash with accessible minimum-sample text, while a measured zero remains `0 ms`. Each stage retains at most 20 samples. Typed calls name microphone-only rows and counters as `Not observed in this typed call` rather than displaying zero. The scope copy states that the intervals exclude audible playback and do not measure acoustic or end-to-end latency.

### Live understanding opt-in and inspector

The checkbox appears only for Azure and is enabled only when continuous recognition is configured and Microphone is selected. It defaults off. Selecting it disables Listen & type and extends the adjacent consent sentence to name the Azure Speech recognition path. Starting the call copies the selection into an immutable call-scoped choice; later form state cannot silently add or remove processing from the active call.

The inspector always names its operational state: ready for the next call, off for this call, connecting recognition, listening, understanding current speech, preparing tentative guidance, waiting for the final transcript, paused while muted, recognition unavailable, or recognition ended. Unavailable copy keeps the voice call and the recognition sidecar distinct. Current words replace in place on every accepted revision and never append transcript turns. A sidecar final remains a recognizer draft; only the authoritative native final can add the person’s turn and permit a response.

Language, pace, and pause-request cues remain visibly tentative. They describe communication guidance only and never claim emotion, intent, identity, confidence, or understanding. Revision, recognizer-final, and discarded counts are metadata, not quality scores. Mute, end, native final, discontinuity, and unavailable/invalid input clear temporary words and cues; unmute begins from fresh speech. The boundary copy states that temporary words are unsaved.

### Usage & services

The left column is a workspace-scoped allowance record. Activation state distinguishes local, test, and hosted modes without turning local enablement into hosted proof. Voice rows name reserved attempts, reserved seconds, and occupied connection slots; pending and unresolved attempts can occupy a slot, so this value is never relabelled as live calls. AI rows keep admission budget, pending/uncertain reservations, and provider-reported completed tokens separate. UTC windows, limits, accounting boundaries, and recent attempt states remain visible, while unknown values render as Unknown rather than zero.

The right column reports recent service heartbeats and saved work. Fresh, stale, disabled, and unknown states describe process reporting only: they do not establish audio connection, provider acceptance, message delivery, or applied learning. Queue counts omit recipients and payloads and link to their owning surface. Independent requests settle separately, prior data may remain visible beside a refresh error, 12-second timeouts recover through Refresh, and polling runs only while relevant work is active and the page is visible.

### Audio proof

Audio proof is a frozen evidence chain: one fictional synthetic scenario, one stored input artifact, one immutable saved agent version, and one explicit run consent. Tools, customer memory, and business actions remain disabled. The selected fixture exposes its duration, format, expiry, and integrity reference; every run keeps its own status and stable reference so a failed first attempt remains visible beside a later captured output from the same bytes.

The selected run separates captured audio, recognized caller text, assistant transcript, and human listening criteria. Transcript text does not establish sound. Playback started and playback completed are browser events only; the review form remains disabled until playback starts, then requires a separate `I listened to this captured output` attestation per criterion. Reviews append to the exact output hash and run record, while text rehearsal and release evidence remain separate gates. Expired or failed playback disables new attestations without erasing prior records.

### Matched-input listening comparisons

Comparison setup exposes only complete retained Audio proof runs with current comparison metadata. The server, not the selector copy, verifies the same fixture audio, instructions, knowledge basis, model, Azure resource, voice, and known runtime; it permits either a declared delivery-profile difference or an intentional identical-settings repeat. A mismatch blocks creation. Preparing a comparison reuses stored artifacts and never starts another AI call.

Opening a saved pair assigns a stable reviewer-specific A/B order and hides source labels. Both native players must start, then the reviewer explicitly attests to hearing both complete recordings before saving a criterion. Naturalness, Pacing, Clarity, and Professional warmth each require A, B, No preference, or Neither works plus a written reason. Saved assessments are append-only; unsaved drafts for other criteria stay in place. Reveal occurs only after all four are saved and still does not select, publish, or recommend a version.

The boundary copy states that this is not a controlled blind study: the reviewer may know the clips and generated wording may differ. Duration, provider acknowledgement, transcript text, playback events, and masked preference remain separate evidence. Critical-content correctness needs its own exact-artifact regression and cannot be inferred from these four preference ratings.

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

Viewer access keeps records readable while disabling editing, testing, publication, generation, rating, and sending. Agent introduction must identify the representative as AI before customer conversation. Test and public call surfaces keep consent, stop-for-human, participant scope, provider state, and source boundaries visible. Live understanding adds explicit Azure Speech processing consent and never turns temporary recognition into transcript or response authority. Taxila auditions require explicit text-processing consent and never change the live voice. Listening reviews require separate complete-listening attestations and never publish. A configured provider, passing check, release, channel draft, requested delivery rate, recognition state, playback event, or communication cue never proves delivery, identity, emotion, audible quality, recognition accuracy, or customer intent.

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
- **Do** keep Live understanding default off, Azure microphone-only, explicitly consented, frozen per call, and visibly separate from the transcript and native final-turn authority.
- **Do** replace temporary current words per revision, clear words and cues on mute, end, final, or failure, and treat recognition counts as metadata only.
- **Do** keep Intent, Audience, Agent & content, Review, Run, and Results on one durable campaign ID with partial saves and exact revision checks.
- **Do** carry campaign context into the existing agent workspace, bind only an exact active release, and return to the same campaign Review for current eligibility.
- **Do** keep AI suggestions and proposals as attributable receipts until an operator explicitly uses or applies them, and invalidate stale readiness when authority changes.
- **Do** keep customer intake resumable per actor, preserve exact source evidence, reconcile whole-source counts, and separate prepared decisions from atomic Apply.
- **Do** keep source-wide exclusions, exception filters, saved revision conflicts, timeouts, and uncertain apply outcomes visible with direct recovery actions.
- **Do** preserve imported customer fields through the canonical handoff while keeping source do-not-contact restrictions and channel permission separate.
- **Do** build Text rehearsal from a reviewed redacted checkpoint, generate a new reply from one exact agent version, preserve failed attempts, and require explicit operator verdicts over exact quotes.
- **Do** bind required-suite truth to the latest attempt, current case set, runtime/configuration, knowledge authority, and blocking reviews while keeping older attempts inspectable.
- **Do** keep allowance reservations, occupied connection slots, provider-reported usage, service heartbeats, and saved queue counts as separate operational evidence.
- **Do** bind Audio proof to one immutable version and exact fixture bytes, retain failed attempts, and keep playback events, transcripts, and human listening reviews separate.
- **Do** keep speech-delivery choices versioned, Azure-only, finite, and separate from response length, inferred emotion, and perceptual claims.
- **Do** keep teacher auditions consented, private, expiring, provider-separated, and visibly independent from the agent draft and live Realtime voice.
- **Do** match comparison inputs on the server, mask A/B until four append-only ratings, and preserve No preference, Neither works, and written reasons.
- **Do** keep Results separate from Run and distinguish provider acceptance, reviewed evidence, and business outcome.
- **Do** preserve role limits, consent controls, explicit AI identity, anonymous/unverified participant labels, and human-review boundaries.

### Don't:

- **Don't** restore the former 18 peer destinations or a three-column agent workbench.
- **Don't** treat all historical failed checks as open attention or let an optional deployment displace running campaign work.
- **Don't** repeat prompt fields across sections, unmount the tester during section changes, or hide the artifact targeted by Save, Test, Publish, or Channel setup.
- **Don't** let a draft test, configuration check, release, or prefilled Channel draft imply public activation, live delivery, voice quality, identity verification, or business value.
- **Don't** add independent client timing rows into a synthetic latency total or treat browser-event timing as audible, acoustic, or end-to-end evidence.
- **Don't** treat tentative words or communication cues as a saved transcript, emotion truth, confidence score, recognition-quality result, or permission for the agent to reply.
- **Don't** bypass the dirty guard for Back, Forward, hash links, search, agent switching, or contextual navigation.
- **Don't** turn a phase change, partial save, AI suggestion, content proposal, preflight, or provider receipt into implied approval, launch, delivery, or success.
- **Don't** let campaign-to-agent navigation bind a draft, unpublished version, stale release, or different campaign, or bypass the return-to-Review check.
- **Don't** let AI mapping, bulk preparation, a saved intake review, or a source handoff silently change customers, grant contact permission, or clear an imported restriction.
- **Don't** hide skipped, excluded, blocked, pending, stale, or historically failed evidence behind a completed batch or passing latest result.
- **Don't** treat a Text rehearsal judgment or passing required suite as publication approval, a Realtime/audio benchmark, a live-channel result, or a production claim.
- **Don't** present allowances as invoices, reserved duration as measured billing, occupied slots as completed or live calls, or a heartbeat as service success.
- **Don't** treat synthetic fixture playback, a browser playback event, recognized text, or an unreviewed AI output as human listening, microphone, perceptual-quality, full-duplex, or competitor evidence.
- **Don't** translate `0.9×`, an exact provider acknowledgement, output duration, or an explicit pace request into proof of perceived slowness, warmth, naturalness, or improvement.
- **Don't** present a Diya/Arjun audition as teacher identity, pronunciation validation, the agent's live voice, or a full Taxila migration.
- **Don't** reveal comparison sources before all four ratings, overwrite a saved assessment, infer correctness from preference, or let a pair auto-select or publish a version.
- **Don't** duplicate the execution workbench in Results, hide empty result-field states, or collapse recipient evidence into campaign-level claims.
- **Don't** present a focused review verdict as whole-product usability, production, hosted-channel, voice-quality, billing, or competitor-superiority evidence.
