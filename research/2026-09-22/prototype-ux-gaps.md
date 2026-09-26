# Prototype UX gaps — 22 September 2026

## Verdict

`/prototype` is a clear, honest sample walkthrough for two campaigns, and it protects important product truths: opt-outs stop outreach, feedback is not a sales pitch, statements are distinct from inferences, and memory can be reviewed. It is not yet a command centre for an Indian business voice platform. The user can only advance a single pre-authored path with **Simulate next event**; they cannot inspect the operating objects, change an operating decision, test an agent, or diagnose an exception. A toast confirms mutations but does not make their consequence legible. This is the central usability blocker, not the visual treatment.

The product flow describes shared records and a separate execution boundary. The prototype renders eight destinations as mostly independent pages around one scripted sample. It needs a small relational operating model before more surfaces or metric cards.

## What is missing in the current interaction model

1. **The command centre has no actionable “now”.** Overview reduces work to four counters and a generic next step. An operator cannot see the actual decision queue: pending launch review, a reply needing an owner, an uncertain delivery, a proposed memory, a conversation asking for handoff, or an improvement blocked on evidence. Campaign controls provide pause/resume but no reason, scope, affected people, or undo/review state.

2. **Campaign creation is a form, not a controlled deployment.** The five-step builder hides the real objects behind fixed counts and a canned preview. There is no editable cohort table, overlap/conflict explanation, per-person inclusion reason, stopping-rule test, version diff, capacity/cost consequence, or launch summary that can be reopened. “Simulate launch” immediately changes status; it gives no deploy record or reviewable boundary.

3. **Conversation is a screenplay, not a voice product test.** The agent page only reveals fixed lines one at a time. It cannot select a scenario, vary language/pronunciation, interrupt/correct the agent, inspect retrieved company/customer context, change a tool/hand-off result, or compare candidate behaviour. Thus it cannot demonstrate the promised RelationalOS or EmotionalOS: consented relationship facts, stated concern versus uncertain interpretation, appropriate repair, and safe commitment handling.

4. **Company Brain is a document wizard, not the shared company model.** It maps three headings and publishes them without showing relationships among offering, audience, customer stage, campaign rule, agent instruction, source, owner, validity, and conflict. The existing GroupAI mechanism is not visible as an operating context: users cannot open its room/world, inspect which participants and turns are in scope, or see the memory boundary and linked conversation. Campaign cohorts are separate targeting records. The current customer page is a simple list and does not prove the “one customer, one history” claim across records.

5. **There is no test/evaluation or observability loop.** “Model roles & budget” is copy. No datasets, test cases, evaluator rubric, replay, result, release gate, provider/agent version, or failure drill-down exists. Insights derives one fixed quote only after a scripted event; it does not let a team review a conversation, label evidence, disagree, or link a pattern to a campaign cohort and a corrective action. Integrations are text in Setup, not an inspectable connection/sync/permission state. Tools are not configurable or auditable.

## Minimum coherent navigation

Use a stable left rail with three groups; each surface keeps a record-focused detail pane and links, rather than routing to isolated “modules”.

| Group | Destinations | Primary job |
|---|---|---|
| **Operate** | Now, Campaigns, Conversations | Triage decisions, deploy/pause work, review a live or simulated interaction |
| **Build** | Company Brain, Agents & Test Lab | Curate company truth; configure, test, evaluate and release an agent |
| **Records** | People, Campaign cohorts, Improvements | Follow one relationship, one targeting cohort, or one evidence-backed follow-through item |
| **System** | Integrations & Tools, Team | Inspect data/permissions/tool authority and ownership |

“Now” is a decision queue, not eight dashboard cards. Each row shows object, why it needs attention, affected cohort/person, safe next action, and a link to the underlying record. Global search may resolve people, cohorts, campaigns, sources, GroupAI contexts and conversations.

## Two primary journeys and progressive complexity

**Business operator — sales campaign.** From Now, choose “Review a proposed consultation campaign.” Inspect cohort `New enquiries / Sep intake`: each person’s inclusion/exclusion reason and contact permission. Open two personalized previews, inspect the agent/version and stop rules, then run a preflight. Deploy the simulated campaign. The campaign page changes to an event ledger; a reply opens the person and conversation with “assign Neha”, “pause campaign”, and “review proposed memory” as concrete actions. Advanced controls (channel routing, capacity, budget and version diff) stay under Preflight.

**Builder / operations lead — relational agent release.** From Agents & Test Lab, duplicate Maya’s draft, select a scenario dataset (cost concern, Hinglish correction, reschedule, human handoff), examine retrieved Company Brain claims plus the relevant GroupAI room/world, turn participants and scoped memory, then run a deterministic text simulation. The test transcript exposes every retrieval, proposed memory, tool call, refusal/hand-off, and evaluator result. The lead fixes an instruction/tool authority, re-runs, compares results, and marks the version “approved for simulated campaigns”. Provider/realtime settings remain a secondary deployment panel.

The operator should never configure an evaluator to launch a campaign. The builder should not need to edit a customer record to test an agent.

## Next-mock acceptance criteria

Build these as connected simulated records; do not represent them with toasts alone.

- A campaign cohort detail page has a stable ID, purpose, 3–5 members, membership reason, permission status, exclusions, linked campaign(s), and event history. Selecting a member preserves the campaign context.
- A GroupAI context view exposes the existing room/world, participating agents or people, turn history, scoped-memory entries with provenance, and the linked conversation or campaign. It does not present GroupAI as a second CRM, customer identity, or targeting cohort.
- A campaign draft has editable intent, cohort, journey, agent version, schedule, stop rules and owner. Preflight blocks deploy until each is visible; deploy creates a dated simulated deployment/version ledger entry. Pause produces a visible state/reason and affected-member count.
- A conversation detail supports at least four selectable branches (cost concern, correction, consented memory, handoff). It labels stated fact, inference, proposed memory, source, scope, and reviewer. Approve/revoke visibly changes the related person timeline.
- Test Lab runs at least three named cases from one dataset against one agent version. Each result shows pass/fail against a rubric (AI disclosure, language correction, no pressure, consent before memory, handoff); a failed required case blocks simulated release.
- Company Brain lets users open a claim and see source excerpt, approval/currentness, linked agent instruction, campaign/cohort usage, related GroupAI context, and a conflict/unknown state.
- Integrations & Tools shows at least CRM and calendar as simulated connections with source owner, fields/permissions, last-sync state, and a bounded tool action with its authorization/result ledger.
- Now contains at least five concrete decision rows sourced from those records. Completing one changes that row and its owning record in place; no action relies only on a success toast.

## Intentionally simulated in this next mock

Keep actual calling, audio latency/prosody, provider performance, sending, CRM/calendar writes, syncing, costs, and model calls simulated. Show their intended boundary: a realistic input, deterministic outcome, status, and audit record. Do simulate branchable conversation behaviour, record links, versioning, preflight gates, evaluator failures, ownership, and reversible internal decisions. Those interactions are the evidence needed to judge the product; live-provider plumbing is not.
