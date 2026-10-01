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

Overview is a company-readiness and continuation surface, not an aggregate dashboard. It shows the saved company state, one evidence-based next action, current unresolved attention, recent agents and conversations, and a supporting workspace journey. A later passing retest supersedes an older failed configuration run; historical failures do not remain open attention. Active or running campaign work takes priority over optional public-channel setup. Missing or failed readiness requests stay explicit rather than being interpreted as an empty workspace.

Agents is one continuous build–test–publish workspace. A compact agent picker and persistent Save draft / Test agent toolbar sit above a wide six-section editor and a continuously mounted test dock. New agents begin in Setup with required name, role, and purpose fields plus task presets. Prompt authoring appears only in Conversation. Publish captures and checks an exact saved version, keeps publication explicit, and only then hands a prefilled approved release to Channels; channel publication remains a separate owner action.

The reviewed reset evidence is deliberately scoped. The initial three Overview findings—readiness truth, unresolved-test attention, and active-campaign priority—were corrected, and the focused reviewer marked those three findings resolved with a SHIP verdict. The required desktop/mobile captures cover Overview, Agents, Publish, mobile navigation, and new-agent setup. This is not a whole-product usability or production-readiness claim, and it does not complete the deeper Campaign, intake, or transcript-to-regression redesign.

**Key Characteristics:**

- Five task-oriented areas with preserved deep routes
- One company-derived next action
- Wide editor with continuous testing context
- Exact-version readiness and explicit publication
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

Overview uses a responsive `1.72fr / minmax(300px, .72fr)` layout: next action, attention, and recents form the primary column while the journey remains a sticky supporting rail. It becomes one column at 900px. Recent agents and conversations form two columns until 1180px, then stack. The recommendation is an emphasized lilac surface; attention and recent work use flat divided rows.

Agents uses a compact picker inside a sticky toolbar and a `minmax(0, 1fr) / 330–370px` editor/test grid. The test dock remains mounted while the operator changes among Setup, Conversation, Voice & language, Knowledge, Behaviour & actions, and Publish. The grid becomes one column at 1080px without unmounting the tester. At 620px, the toolbar, field pairs, and tabs stack into touch-safe layouts; the test dock follows the editor in the same reading flow.

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

### Publish panel

Publish is an ordered three-step panel. Readiness first captures the saved revision when needed, runs configuration checks against that exact immutable version, and verifies the returned agent/version relationship. The latest exact-version result determines readiness; changed knowledge or draft revisions make prior checks outdated. Publication is a separate action and rechecks knowledge. Only an active release enables Set up channels, which opens a prefilled Channel draft; it does not activate or publish the channel.

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
- **Do** preserve role limits, consent controls, explicit AI identity, anonymous/unverified participant labels, and human-review boundaries.

### Don't:

- **Don't** restore the former 18 peer destinations or a three-column agent workbench.
- **Don't** treat all historical failed checks as open attention or let an optional deployment displace running campaign work.
- **Don't** repeat prompt fields across sections, unmount the tester during section changes, or hide the artifact targeted by Save, Test, Publish, or Channel setup.
- **Don't** let a draft test, configuration check, release, or prefilled Channel draft imply public activation, live delivery, voice quality, identity verification, or business value.
- **Don't** bypass the dirty guard for Back, Forward, hash links, search, agent switching, or contextual navigation.
- **Don't** present the focused review verdict as a whole-product usability, production, hosted-channel, or competitor-superiority claim.
