# Voice platform blueprint — replacing the campaign-demo model

22 September 2026. Proposed product definition following the user's rejection of `/prototype`. This document supersedes version 2 as the design direction; implementation was subsequently authorized by the user on the same date. “GroupID” was clarified to mean the existing **GroupAI mechanism**, not a new identifier or customer-segmentation feature.

## The product

A voice-agent platform for Indian businesses, with a company operating workspace around it. A business can create its representative, teach it, test its behaviour, release a version, run customer work, supervise conversations and improve the next interaction. RelationalOS and GroupAI connect conversations across time and appropriate audiences. The command centre makes commitments, failures and outcomes visible.

The main promise to validate: **a representative that listens naturally, remembers appropriately, coordinates the right people and follows through reliably.** This is broader than a dialler or prompt editor and more specific than “AI runs your entire company.” The long-term company scope is preserved, with sales and customer management as the first operating surface.

There are two complementary product experiences:

- **Business workspace:** founder, sales lead, counsellor and service operator. Their actions are launch a motion, supervise exceptions, open a customer, resolve a promise, review feedback and understand outcomes.
- **Agent workspace:** agent builder or operations lead. Their actions are configure behaviour, ground answers, authorize tools, compare voice settings, run tests, release versions and diagnose failures.

These share the same records and history. An operator should not need to understand endpointing to launch an approved campaign; a builder must be able to inspect endpointing when a customer gets interrupted.

## What the research changes

| Evidence | Design consequence |
|---|---|
| Vapi documents assistant versions, voice-pipeline controls, tools, Squads, distinct evaluation modes and call artifacts. | An agent is a versioned executable configuration with a test/release lifecycle, not a scripted conversation card. [Vapi research](../research/2026-09-22/vapi-product.md) |
| ElevenLabs documents expressive delivery, workflow tools, reusable tests, post-call analysis and traffic-version controls. | Natural voice and emotional expression are competitive requirements. We need scenario-level voice QA and controlled releases, not a “human” slider. [ElevenLabs research](../research/2026-09-22/elevenlabs-product.md) |
| Bolna documents per-language pipelines, conservative language switching, India telephony, batch operations and beta cross-channel workflows. | India readiness includes language mechanics and operational conditions; Hindi support alone is insufficient. [Bolna research](../research/2026-09-22/bolna-product.md) |
| Retell documents simulation/QA/live monitoring; LiveKit exposes detailed turn and runtime traces; Sarvam supplies relevant language components. | Compare products and layers separately. Provider selection stays open; build a common evaluation and observability contract. [Alternatives](../research/2026-09-22/voice-alternatives.md) |
| Our mock lacks configurable agents, meaningful test failures, release history, conversation traces and usable GroupAI surfaces. | Rework the interaction model before another visual reskin. Browser-clickable scripted campaigns do not demonstrate a voice platform. [UX diagnosis](../research/2026-09-22/prototype-ux-gaps.md) |

No research reviewed here establishes that competitors cannot build relationship memory or business workflows. Differentiation must come from the complete experience and measured results, not an unsupported absence claim.

## Navigation and screen contract

Organize navigation by work, with detailed settings inside their owning record. Every screen must answer a question and support a meaningful next action.

| Area / screen | Primary view | Required interactions and states |
|---|---|---|
| **Operate — Command centre** | Decision queue, active work, unresolved commitments, quality exceptions and outcome trends | Filter by owner/severity; inspect source; assign, review, take over, pause or reconcile. Completing a decision changes the owning record. No generic AI summary without evidence. |
| **Operate — Campaigns** | Drafts, approved motions and immutable run history | Audience table with inclusion/exclusion reasons; individual content; agent version; schedule, budget, capacity, retry/stop rules; preflight, launch, pause/cancel and per-recipient results. |
| **Operate — Conversations** | Searchable call/session list and split-pane detail | Transcript/audio when available; turn events; context sources; tool inputs/results; memory proposals; handoff and disposition; create a regression case from a failure. Never mix a text simulation with a real call recording. |
| **Operate — Customers & cases** | Person/account record, cases, commitments and channel history | Identity reconciliation, source-owned fields, owner/stage edits, correction/revocation, appointments/offers and service follow-through. A requested booking stays distinct from a confirmed one. |
| **Operate — GroupAI spaces** | Existing world/conversation structure presented as people, rooms, audience and shared work | Inspect participants, actual current audience, what an agent may use, private/shared evidence and pending intervention. Audience changes invalidate inappropriate context. Cohorts remain in Campaigns. |
| **Build — Agents** | Agent library and editor with persistent test panel | Create/duplicate agent; goal, role, disclosure, conversation behaviour, language/voice, memory behaviour, knowledge, tools, escalation; draft/version diff; save and open Test Lab. |
| **Build — Test Lab** | Scenario suite, candidate version, run results and trace detail | Choose text-decision, synthetic voice or controlled live test; mock tools; compare versions/providers; open failed turn; replay input; record human audio ratings. Critical failures block release. No invented live results. |
| **Build — Company brain** | Sources, claims, services/offers, conflicts and agent usage | Import/map/reconcile, inspect excerpts, edit extraction, approve/reject, expire/correct, manage source permission and refresh status. Ask a grounded question and inspect retrieved evidence. |
| **Build — Tools & integrations** | Connection health plus versioned action contracts | Connect or preview an integration; map field ownership; inspect scopes, test reads/actions, replay safe failures, reconcile uncertain writes. Connector status is separate from permission to execute a tool. |
| **Build — Releases & channels** | Agent versions, test evidence, deployment bindings and rollback history | Publish reviewed version to sandbox; choose channel; inspect release gate, rollback or stop. Browser first. Phone onboarding/provisioning is represented as later work, not a fake connected number. |
| **Improve — Quality & insights** | Segmented conversation quality, customer themes and business outcomes | Drill down from metric to calls; distinguish facts from hypotheses; dispute a score; create regression tests and experiments; compare language/task/cohort/version. |
| **Improve — Team & commitments** | Owned action queue and evidence-linked collaboration | Assign/accept/amend/complete a commitment; inspect receipt; separately notify the customer; track feedback improvements. Agents and people see only permitted context. |

Settings contain company/team access, usage/budgets, model/provider connections and retention. Global search should resolve an agent, person, case, campaign, conversation or source; it should not be a decorative search icon.

## Four decisive screen layouts

### Agent editor

**Top:** agent name, role, draft/version state, last saved, version history, Test, release eligibility.

**Left:** purposeful configuration sections: Objective; Conversation; Languages & voice; Relationship; Knowledge; Tools; Handoff; Advanced runtime.

**Centre:** the selected section's editable settings with examples and consequences. In Languages & voice, show a primary language, allowed switches, code-mixed examples, pronunciation entries and voice provenance. In Relationship, show allowed memory types, visibility, correction and unresolved-commitment handling.

**Right:** test panel pinned to the exact draft. Pick an example customer/case, inspect permitted context and choose a scenario. Results show what changed and why. Provider controls remain available in Advanced; business language is the default.

### Test Lab / conversation review

**Left:** suite or session list with explicit status, version, language and failure category.

**Centre:** turns and time-aligned audio/runtime events. Select an interruption, retrieval or tool event. A failed call must be intelligible at the exact failure point.

**Right:** evidence for the selected event: active audience, authorized sources, expected versus actual tool arguments, memory proposal, evaluator rule and human review. “Save as regression case” preserves the scenario and originating version.

### Command centre

**First view:** actions needing a person, ordered by urgency and consequence: handoff requested, unsupported promise, uncertain send, source conflict, negative service feedback, failed release gate. Each row shows owner, affected customer/workflow, reason and a direct action.

**Second view:** active campaigns/conversations and grounded outcome reporting. Distinguish reachable customers, completed conversations, requested appointments, confirmed appointments and realized business outcomes. AI narrative is a cited interpretation of these records.

### GroupAI customer space

**Top:** purpose, relevant case and current participants.

**Centre:** rooms/conversations and shared work. Private customer interaction and family/team discussion remain separate rooms, even when participants share a world.

**Right:** “What can this agent use?” with source excerpts and audience. A participant joining changes the allowed view. Show when the agent should remain silent, reply or seek authorization. Do not turn GroupAI into a visually decorative relationship graph.

### Customer-facing browser conversation

The customer needs a designed experience of their own: company and AI identity, purpose, language choice, clear recording/data notice where applicable, and Start. Show microphone permission denial with a recovery path; connecting, listening, speaking, interrupted, reconnecting/fallback and ended states; mute/end and human-help controls. The customer can correct a name, number, language or preference without restarting the journey. The ending shows agreed next steps and what remains unconfirmed. A participant joining invokes GroupAI audience review rather than silently exposing the previous private context.

Implementation now targets these states. Live audio validation requires provider credentials and real measurements; configuration checks remain separately labelled.

## The complete user journey

1. **Establish the company.** Register, describe the business and goals, choose an optional industry template, invite the responsible operator. Founder questions supplement the description; they are not mandatory.
2. **Bring company knowledge and customer data.** Connect the minimum sources for the chosen workflow, inspect mapping/duplicates, designate authoritative fields, and review extracted services, answers and unknowns. Connections report their real state.
3. **Create the representative.** Choose a role/template; configure voice behaviour, languages, pronunciation, relationship scope, knowledge, tools and human escalation. Preserve an understandable business view and an advanced engineering view.
4. **Rehearse the actual work.** Run representative scenarios with a selected draft and controlled tools. Inspect failures, change the relevant configuration and compare again. A demonstration transcript cannot stand in for audio quality.
5. **Release a version.** Capture the tested bundle and intended channel. Required failures or missing authority block release; approval is inspectable later. Changing a tool or knowledge dependency can require new testing.
6. **Start or receive customer work.** A campaign, inbound event, founder goal or API request creates the same governed workflow. Preview exactly what a recipient will receive and what the agent knows. Dispatch rechecks consent, context, capacity and action authority.
7. **Converse and coordinate.** The representative handles language changes, pauses, interruptions and corrections. GroupAI contributes audience-aware context and participation. Specialists operate under scoped instructions; the speaking experience remains coherent. Human takeover gets a useful permitted brief.
8. **Finish the work.** Review customer statements, inferred interpretations, memories, promises and action receipts. Apply corrections to the appropriate records. Uncertain execution goes to reconciliation rather than a blind resend.
9. **Improve the next interaction.** Feed evidence into quality review, a new test, a service improvement or a reviewed agent revision. Do not silently retrain or rewrite business rules from every customer conversation.

## Natural, relational and emotionally responsive — separate mechanisms

| Layer | Concrete behaviour | What proves it |
|---|---|---|
| Speech and timing | Natural prosody, clear names/numbers, sensible pauses/backchannels, stop-on-interruption, clean recovery and stable audio | Recorded device/channel tests and blind listening; latency distributions and interruption error rates |
| Language/register | Indian English and chosen regional languages, intra-sentence code-switching, honorifics, local abbreviations, dates and rupees | Entity accuracy and human review by relevant speakers, not a language-count badge |
| Emotional response | Acknowledge an expressed concern, shorten or slow an explanation, tolerate uncertainty, avoid pressure and escalate appropriately | Scenario rubric and customer/human review; uncertain affect is not stored as an objective diagnosis |
| Relational continuity | Permitted recall, current preferences, corrected facts, boundaries, unfinished promises and repair after a missed commitment | Repeat-conversation tests, source citations, correction/revocation and disclosure tests |
| GroupAI coordination | Correct participant/audience context, appropriate participation, scoped specialist information and private/shared boundaries | Audience-change, wrong-recipient and silent/reply tests, plus new business-action tests |
| Business completion | Accurate tools, clear ownership, delivery receipts, confirmed outcomes and reliable recovery | Auditable task results and cost per useful outcome |

Avoid a single “emotion level,” “trust score” or “humanity” slider. Useful controls are response length, language/register, pacing preferences, escalation, pronunciation, memory scope and observable turn behaviour. Introduce the representative as AI. Humanlike interaction does not require fabricated identity, lived experience or feelings.

## GroupAI and source reuse

Use existing GroupAI person/verified identity, social-world, conversation/audience-epoch, disclosure, context-capsule and delivery contracts. A campaign segment is not a GroupAI world; membership is not blanket memory access. Organization tenancy, business cases and business actions are additional target-product work.

The audited GroupAI orchestrator currently executes silent/reply; other intervention outcomes return `action_not_implemented`. This is a valuable core and a real implementation boundary, not a completed multi-agent business execution platform. Maya/Meera's strongest reusable work includes context compilation, memory/relational bundles, register handling and live/cascade audio ownership. Later branches contribute source-grounded correction and voice/processing contracts. All extraction remains proposed; no source merge is implied.

Detailed branch/path mapping and behaviour design: [existing GroupAI and relational architecture](../research/2026-09-22/relational-group-product.md), [reuse provenance](reuse-provenance.md), [31-head runtime review](../research/html-second-pass.md).

## What could be a breakthrough

The product hypothesis is a **permission-aware conversation-to-outcome loop**. The same representative can resume the correct relationship, handle a changing audience, use source-grounded business context, keep a commitment and recover from a mistake. GroupAI, RelationalOS, speech quality and operations contribute together.

Three experiments matter more than adding many modules:

1. **Repeat conversation:** a customer changes a preference and returns later. The agent recalls the correction, not a stale value, and completes the agreed next step.
2. **Shared relationship:** student, parent and counsellor move between private and shared interactions. The agent remains useful without leaking private evidence or forgetting authorized shared commitments.
3. **Service recovery:** a missed promise or feedback complaint becomes an acknowledged issue, an owned resolution, a customer update and a better next interaction.

This may outperform competitors on these jobs; no current evidence establishes that it does. Naturalness, language quality, task reliability and cost need separate comparisons. A model-level TTS breakthrough is a separate research programme, not a consequence of building a superior orchestration UI. Benchmark proprietary/adapted speech approaches against replaceable providers before committing to that investment.

## Delivery sequence without shrinking the vision

**Design acceptance:** show the agent editor, Test Lab, conversation trace, command centre and GroupAI context boundary as connected objects. Retain campaign/customer flows, but move from fixed scripts to branchable fixtures and inspectable records. This is the next prototype's contract.

**First credible working release after alignment:** company setup/knowledge, agent versions and browser calls, evaluated language/voice pipeline, scoped memory, tools/action ledger, human escalation, conversation review, two end-to-end operating loops and usable team access. The loops are enquiry-to-confirmed-next-step and service-feedback-to-closed-improvement.

**Expand distribution:** telephone provisioning and carrier tests, WhatsApp/email delivery, production CRM/calendar adapters, higher concurrency and operational controls. Preserve the user's decision to integrate telephone numbers later.

**Expand departments and voice research:** renewals, hiring, deeper market research, additional sector packs, authorized brand voices and custom speech models where evaluation justifies them. These reuse the product's records and controls rather than becoming unrelated apps.

## Acceptance bar for the next prototype

The next mock is not accepted because every button clicks. It must demonstrate:

- An editable agent draft whose saved settings survive navigation and produce a visible version diff.
- At least three selectable scenarios with different turn/tool/memory outcomes; each outcome links to its originating configuration and evidence.
- Required India scenarios include intra-sentence Hindi-English mixing plus an interruption, and correction of an Indian name/rupee amount/date. Preserve the corrected entity through the tool arguments, memory proposal and next interaction. Authored fixture behaviour is not proof of ASR/TTS quality.
- A customer-facing browser-call surface with language choice, permission denial/recovery, interruption, connection failure/recovery, human help and a truthful end-of-conversation summary.
- A real failing fixture and a release gate that remains blocked until the relevant draft/test changes. Clearly label fixture results; show live audio metrics as not measured.
- A conversation detail that links transcript, context, tools, memory decisions, case and quality issue.
- Existing GroupAI concepts represented correctly, with a private/shared audience change and an explicit permitted-context preview.
- A decision queue whose actions update campaign, customer, task and event records consistently.
- A feedback interview becoming an evidence-linked owned improvement and a separate customer notification.
- Integration and tool failures, stale knowledge, opt-outs, uncertain delivery and human takeover as inspectable states.
- Desktop and mobile usability, accessible controls and purposeful motion. Use a dense, legible operating interface comparable in clarity to the reviewed platforms; replace the rejected decorative dashboard treatment.

Provider selection, live sound quality, authenticated competitor dashboards, production integrations and legal/telephony eligibility remain unverified. The old prototype remains historical design evidence, not an approved product baseline.
