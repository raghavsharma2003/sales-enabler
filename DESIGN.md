---
name: Relay workspace platform
description: A quiet, record-first company workspace for reviewing context, planning campaigns, and operating AI representatives.
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
  operational: {fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", fontSize: "12px", fontWeight: 400, lineHeight: 1.5}
rounded: {sm: "6px", md: "9px", pill: "20px"}
spacing: {page: "34px 36px 40px", panel: "22px", workbench-gap: "14px"}
components:
  button-primary: {backgroundColor: "{colors.accent}", textColor: "{colors.surface}", rounded: "{rounded.sm}", padding: "8px 12px", height: "34px"}
  panel: {backgroundColor: "{colors.surface}", rounded: "{rounded.md}", padding: "{spacing.panel}"}
  selected-row: {backgroundColor: "{colors.wash}", textColor: "{colors.accent}", rounded: "{rounded.sm}", padding: "11px 9px"}
---

# Design System: Relay workspace platform

## Overview

**Creative North Star: “The Quiet Operations Desk”**

The v7 composition puts Company identity first on mobile: name, owner-authored description, and public brand copy precede the operating records. Deployment is a three-step owner flow (agent/knowledge, immutable public identity, then limits and publish). Public Share and Open assistant states expose anonymous identity, company-only scope, explicit session/turn limits, and a Start action before an empty transcript.

Relay is an Operate product: a compact, record-first workspace where company material becomes reviewable context, campaign intent, browser conversations, and accountable follow-through. The visual system stays quiet so the current record, its evidence, and the next operator decision remain easy to scan. DM Sans, white and cool lilac-gray surfaces, indigo state emphasis, and Lucide icons are the incumbent identity.

The v7 surfaces extend that same desk across the complete loop. Company identity is first in the mobile composition: name, owner-authored description, and public brand copy establish the workspace before the rest of the workbench. Company brain has Business model, Source intake, and Ask company brain tabs. The business-model workbench keeps offerings and signals separate, shows exact source quotes, preserves approved clarification history, and counts only unanswered founder questions. Campaign briefing proceeds in a visible order: approved offering, campaign description and goal, purpose and channel, selected audience, explicit AI assistance, then typed answer review and receipt recheck before a plan is generated. The plan describes planned fields; collected answers and quotes live in campaign conversations and offering results.

Deployment is a deliberate three-step owner flow: choose the agent and approved knowledge, author the public identity and optional brand accent, then review limits and publish an immutable snapshot. Public Share and Open assistant entry points expose the selected voice or chat mode and explicit session/turn limits. The public voice and chat surfaces begin with a Start action; an empty transcript is not presented as an active call. Anonymous identity, company-only scope, and source-backed cues remain visible throughout.

The agent and conversation surfaces keep control and evidence explicit. In-call Actions, natural-language revision proposals with before/after diffs, and viewer read-only states sit beside the voice workbench. Language settings include a small, versioned speech-vocabulary editor for recognition hints; its terms remain hints rather than instructions or company facts. Saved public-voice Conversations expose validated server-transport evidence in a disclosure, alongside server action receipts, browser-only diagnostics, refusal and uncertainty guards, transcript-before-learning, and source-linked learning. A completed post-call learning job points to the exact conversation and opens its review action; proposals never apply automatically. Team, invitation, recovery, and account-security states, Join workspace account mismatch, WhatsApp setup and Inbox scope, and Automations' local worker heartbeat all use the same candid operational language. These are extensions of the existing world, not a new visual concept.

**Key Characteristics:**

- Quiet tonal surfaces
- Readable 12–13px operational type
- Indigo for location and action
- Source-backed status and cues
- Visible human control
- Anonymous public identity

## Colors

The v7 deployment and account surfaces retain the same cool-neutral and indigo world. Account recovery/security uses the account tokens in the frontmatter; public brand accents remain optional owner configuration.

Neutral surfaces, borders, and muted text carry most screens. Relay indigo marks navigation, selection, focus, links, and committed actions; lilac wash groups selected or reviewable records. Green and rose surfaces communicate operational outcomes without implying success beyond the record.

### Primary

- **Relay indigo** (#5148ce): primary buttons, active tabs, selected rows, evidence links, focus rings, and the next actionable step.

### Neutral

- **Ink** (#242634): headings, record values, transcript text, and form content.
- **Muted slate** (#626779): descriptions, labels, timestamps, receipt notes, and secondary state explanation.
- **Cool line** (#e5e7ed): panel edges, dividers, table rules, and tab baselines.
- **Cool canvas** (#fbfbfd) and **surface white** (#ffffff): the page field and record containers.
- **Lilac wash** (#efedff) and **quiet hover** (#f4f4fa): selected navigation, selected records, open review states, and hover feedback.
- **Success surface / ink** (#e9f6ef / #246448): approved evidence, current source state, and provider-accepted records.
- **Danger surface / ink** (#fff3f4 / #9b3547): blocked, revoked, rejected, uncertain, and needs-review states.

### Named Rules

**The State Before Decoration Rule.** Use indigo, green, rose, and small motion to explain location, action, or record state. Do not introduce color as a quality claim.

## Typography

**Display Font:** DM Sans (with -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif fallbacks)
**Body Font:** DM Sans (with the same system fallbacks)
**Label/Mono Font:** DM Sans; compact metadata remains sans-serif rather than introducing a second visual voice.

**Character:** restrained, legible, and operational. Weight and spacing create hierarchy; type never competes with evidence or controls.

### Hierarchy

- **Page title** (650, 27px, 1.2): primary workspace headings; 25px on compact screens.
- **Workbench heading** (650, 17–19px, 1.3–1.4): company model, campaign, voice, and evidence sections.
- **Section title** (650, 13–15px, 1.4): panels, subsections, and decision groups.
- **Body** (400, 13px, 1.5): records, transcripts, and explanatory copy.
- **Label** (550–650, 10–12px, 1.4–1.55): form labels, tabs, badges, timestamps, and operational metadata.

### Named Rules

**The Record Readability Rule.** Keep operational copy at 12–13px with 1.5 line height; use smaller type for metadata only when its supporting label remains clear.

## Layout

The platform uses a fixed navigation rail and a centered page frame. The sidebar is 234px by default, 250px above 1500px, and 210px below 1100px. Pages use a 1600px maximum width with `34px 36px 40px` padding; at 1100px the frame uses `28px 24px`, at 820px the rail becomes a drawer and pages use `26px 20px`, and at 580px pages use `22px 16px 30px`. Automations uses this same `.pc-page` frame, including the 16px compact gutter.

Company brain keeps three keyboard-operable tabs: Business model, Source intake, and Ask company brain. Source intake uses a 246px source rail, compresses at 1180px, stacks at 820px, and becomes a single-column review at 620px. The business-model workbench uses a 210–260px library beside the detail panel with a 14px gap; its path becomes two columns at 900px and its library/detail stack becomes one column at 650px. Offering results remain collapsed inside the offering record until the operator chooses View.

Campaign planning is a single review column capped at 850px for the intent and plan surfaces. The general campaign workspace stacks at 800px and its compact mode controls become a full-width row at 520px. The brief keeps offering → goal/description → purpose/channel → audience → AI suggestion → review and desired outcome/evidence before plan generation. Agent workbench controls stack at 820px; its editor tabs become a 3-column grid and inspector tabs a 2-column grid at 580px. The selected editor tab keeps its indigo-on-lilac contrast during hover. Saved Conversations use a split list/detail view and stack at 580px; server-evidence coverage, turn metrics, event offsets, and optional usage collapse to one column at the same compact breakpoint.

Inbox switches from a 270–360px thread list plus detail pane to one column at 850px and keeps its message and composer padding readable at 540px. Team invitation and member rows wrap at 650px. Automations keeps the common page gutter while its picker, recipient review, and execution history stack at 600px. Final reviewed mobile states use a 375px document inside a 390px viewport; controls and tables remain inside that frame.

## Elevation & Depth

Depth is primarily tonal: white panels on a cool canvas, quiet borders, selected lilac washes, and status surfaces. Resting records are flat. The search popover uses `0 9px 30px #22243c24`; Inbox message bubbles use only a faint `0 2px 8px #1c234008`. The call-stage ring is state-driven while connecting or speaking and disappears under reduced-motion preferences. There is no decorative shadow stack.

### Named Rules

**The Flat-By-Default Rule.** Keep containers flat at rest. Use a border, wash, or one small transient shadow to establish hierarchy; never use elevation to imply confidence or model quality.

## Shapes

Inputs, buttons, and action controls use gently rounded 6px corners. Panels and workbench containers use 9–10px corners; fieldsets and evidence groups use 7–8px. Badges and state pills use 4px or a 20px pill when they represent a compact status. Tables, transcript rows, and source lists rely on dividers and whitespace rather than enclosing every line. Focus-visible controls use a 2px indigo outline with a 2–3px offset.

Disclosure surfaces are part of the shape language: source text, campaign results, execution details, version history, personal voice enrollment, action diagnostics, and full prompt diffs open from a quiet summary row. Mobile preserves those disclosures rather than forcing dense horizontal tabs.

## Components

### v7 deployments and public assistant

Owner-only deployment creation selects the agent and approved knowledge, authors immutable public identity/branding, then reviews channel, limits, origins, and learning scope before publish. Public brand accents and logos are optional user configuration. Share/Open assistant leads to public voice or chat with anonymous identity, source-backed disclosure, explicit session/turn limits, and Start-before-transcript behavior. Paused/local-only scope remains visible; configured settings never imply delivery, cloud execution, or audio quality.

### Navigation and tabs

Operate, Build, and Improve navigation uses compact 7px rows, a lilac active wash, and indigo text. The Company brain tablist uses the same small tab treatment and supports arrow-key movement. At 820px the sidebar becomes a drawer with backdrop, close, Escape, and focus return.

### Company brain, source intake, and Q&A

The Company brain is a three-tab record surface. Source intake pairs a source rail and five-step path with import/paste, processing, candidate review, exact quotes, uncertainty, approve/reject controls, and an approved-source list. Ask company brain presents grounded answers with exact citations and a clear cached/current source state. Viewer access shows approved sources and inspected model context while keeping answer and mutation controls read-only.

### Company model and evidence

The model library separates Offerings and Business signals. Offering and signal detail keeps source facts, interpretations, uncertainty, and review links visibly distinct. Every proposal carries an exact supporting quote and source revision. Founder clarification history is expandable: an approved answer is labelled `Approved answer`, and the headline badge reports the unanswered count rather than treating approved history as open work. Approved offerings expose a compact `Campaign results and reviewed feedback` disclosure; detailed date filters, totals, activity tables, receipts, and caller observations appear only after View.

### Campaign brief and planned fields

The campaign brief begins with an approved Product or service and then collects the plain-English campaign description, Campaign purpose, Working channel, and selected audience. `Draft the brief with AI` is an explicit action. Its suggestions appear before the fields they populate, remain editable, identify missing context, and are followed by review of desired outcome, evidence required, audience rationale, reviewed signals, and information to collect. Planned columns are labelled with `Field format` or `Planned information to collect`; they are schema intent. Collected answers and exact quotes are linked from campaign conversations and offering results. Applying a plan opens the campaign record and never suggests that the plan itself contains live results.

### Agent workbench, actions, and revision

The agent editor uses labelled sections for Conversation, Objective, Language, Relationship, Knowledge, and Actions, with save/capture/version history below. Language includes an optional speech-vocabulary field with one term per line and a maximum of 32 terms. The editor preserves the operator's raw line breaks and incomplete editing state; normalization happens at validation and save. The first invalid save keeps the draft intact, moves focus to the field, and associates its inline `role="alert"` message through `aria-invalid` and `aria-describedby`. Vocabulary is saved with the agent version and public voice release as transcription spelling hints only; it never adds facts, instructions, or a voice-quality claim. In-call Actions are opt-in cards with clear descriptions and a human-review footnote. Natural-language revision shows the saved instruction, explanation, full before/proposed values, and an apply action that creates a draft revision rather than a release. Viewer access leaves the editor controls and action controls read-only and replaces testing with an operator-access message.

### Voice tester and conversation evidence

The browser tester identifies provider, language, release/draft, input mode, consent, and call state. It supports Microphone or Listen & type, stop-for-human, save/download/discard, and a four-tab inspector for Transcript, EmotionalOS, RelationalOS, and Context. Saved Conversations render the server-voice disclosure only for `public_voice` sessions. A missing or invalid evidence envelope is labelled not captured, with absent measurements treated as unknown rather than zero. Valid evidence separates cancellation requested from provider-confirmed cancellation, defines request-to-first-server-audio as server transport timing rather than audible latency, and shows timestamps and provider-reported token usage only when present. Other saved conversation sections show server action receipts, browser-only diagnostics, refusal and uncertainty guards, and source-linked learning. Proposed memories and follow-ups remain pending human approval. These surfaces never imply audible latency, identity verification, completed handoff, or automatic customer truth.

### Team, invitations, and Join workspace

Team & access explains owner/operator/viewer roles, one-use invitation expiry, and manual invitation sharing. Member rows and role controls remain explicit. Join workspace states show the signed-in account, block mismatched accounts, and offer sign-out or return to the workspace. Viewer states preserve readable records while disabling mutation, testing, approvals, and sending.

### WhatsApp Inbox and setup

Inbox uses a thread list plus detail conversation, setup notice, search/filter controls, message receipts, and a composer. The setup state says when Meta/WhatsApp credentials and webhook checks are still needed; an empty inbox does not look connected. Read and reply scope stays visible: replies require a linked customer, recorded permission, and an open service window. No templates, campaigns, or outbound delivery are implied.

### Automations

Automations sits inside the shared page gutter and opens with a `Worker recently reported` or `No running worker reported` heartbeat card, report time, and honest local-worker explanation. The flow is review recipients → inspect blockers and message → set exact local time → acknowledge one send per eligible recipient → enable. Schedule states include waiting, paused, cancelled, provider accepted, needs review, blocked, uncertain, and interrupted; execution history and delivery receipts remain expandable. Pausing or cancelling does not recall an already-sent request, and uncertain attempts are never resent automatically.

## Do's and Don'ts

The v7 guardrails keep CSV mapping collapsed before row review, recheck typed campaign answers against their receipt, and link each post-call learning job to the exact saved conversation. Transcript review precedes learning proposals; no proposal applies automatically. Recovery/security states explain the next action with account-safe copy.

### Do:

- **Do** keep Company brain tabs, source quotes, offering/signal status, approved clarification history, and unanswered counts visible where the decision is made.
- **Do** make AI assistance an explicit step and place its suggestions before the fields they populate; require review before a plan or revision is applied.
- **Do** label plan fields as planned schema and link collected evidence to conversations or offering results.
- **Do** show server receipts, browser-only diagnostics, refusal guards, worker heartbeat, team access state, and connection scope in plain language.
- **Do** keep speech vocabulary to one term per line, cap it at 32 terms, preserve raw editing buffers, and focus the field with an associated inline error on the first invalid save.
- **Do** gate server voice evidence to validated `public_voice` records; keep missing fields unknown, cancellation request and confirmation distinct, and timestamps or token usage optional.
- **Do** preserve the shared page frame, DM Sans hierarchy, indigo state language, and the 820px drawer / 580px compact behavior.

### Don't:

- **Don't** present an approved clarification as an unanswered founder task.
- **Don't** place the full offering evidence table ahead of the company decision path; keep it behind the collapsed results disclosure.
- **Don't** render `Not collected` as a live status in a planned campaign schema.
- **Don't** treat available integrations, WhatsApp setup, worker heartbeat, provider acceptance, browser receipt time, or selected contact context as proof of connection, delivery, audible latency, identity, or customer intent.
- **Don't** present speech-vocabulary terms as instructions, company facts, or evidence that recognition or audio quality improved.
- **Don't** convert server request-to-first-audio timing into browser playback or audible-response latency, or render missing measurements as zero.
- **Don't** allow viewer accounts to mutate, approve, revise, test, send, or create actions; keep their records readable and their limitations explicit.
- **Don't** turn version history, action diagnostics, prompt diffs, execution history, or Personal Voice enrollment into competing editor columns. Keep them collapsible and attributable.
