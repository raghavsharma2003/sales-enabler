# Adjacent product workflows for Relay: Intercom Fin, Attio, and Clay

**Research date:** 1 October 2026  
**Scope:** Product objects, navigation, onboarding, next-action design, source health and knowledge provenance, audience and offering intent, activation, outcomes, learning, and human review.  
**Source boundary:** Current official product and help documentation only. No logged-in product trial was performed, so screenshots and behaviors described in help articles are treated as documented product UI rather than independently observed runtime behavior.

## Reading the evidence

- **Documented** means the behavior or UI is stated in an official product/help page linked next to the claim.
- **Inference** means a design conclusion for Relay derived from the documented behavior. It is not a claim that the adjacent product works exactly this way in every account, plan, or rollout.
- Feature availability can vary by plan and beta status. This review only mentions availability where it materially changes the workflow.

## Executive judgment

Relay should not imitate any one of these products. It should combine three different product disciplines:

1. **Intercom Fin supplies the operating loop:** train → test → deploy → analyze → improve. It is the strongest model for separating preparation from activation, showing the agent's reasoning during preview, rolling out to a bounded audience, and turning weak outcomes into reviewable knowledge fixes.
2. **Attio supplies the business object model:** durable records, explicit relationships, workflow-specific lists, contextual actions, and human approval before AI-proposed record changes. It is the strongest model for making company knowledge feel like the working system of record rather than a disconnected AI library.
3. **Clay supplies the data-to-audience execution pipeline:** source → enrich → qualify → segment → campaign → event stream. It is the strongest model for visible data dependencies, per-row readiness, provider fallbacks, campaign eligibility, and turning every send/reply/bounce into automation input.

Relay's opportunity is the seam between them. An Indian founder should be able to bring a spreadsheet, connected source, or small manual data dump into a **Company Brain**, review what Relay thinks the business sells and who it serves, select one offering and one desired outcome, activate a bounded voice campaign, and return to a single review queue where conversation outcomes become proposed improvements. The product should feel like one guided operating loop, not a CRM, knowledge base, automation builder, sequencer, call recorder, and analytics package exposed as separate applications.

The recommended product spine is:

> **Company Brain → Campaign → Voice → Review → accepted learning back into Company Brain**

Only five primary destinations are needed:

- **Today** — setup progress, active work, exceptions, and the one most useful next action.
- **Company Brain** — sources, people/companies, offerings, verified facts, unresolved questions, and provenance.
- **Campaigns** — intent, audience, readiness, simulation, activation, and outcomes.
- **Conversations** — live/history views, transcripts, evidence used, commitments, escalation, and follow-up.
- **Review** — proposed corrections, new facts, outcome corrections, next actions, and agent changes awaiting a person.

Team, integrations, channels, billing, and policy settings belong under workspace settings, not as equal-level product destinations.

## The three products in one view

| Product | Core object model | Main operating loop | Strongest transferable lesson | Important limit for Relay |
|---|---|---|---|---|
| Intercom Fin | Knowledge sources, guidance, procedures/tasks, audiences, conversations, outcomes, recommendations | Train → test → deploy → analyze → optimize | Make activation a governed lifecycle with previews, event logs, staged rollout, and evidence-linked improvement work | Support resolution is its dominant intent; Relay must model commercial offering and campaign outcome explicitly |
| Attio | Objects, records, attributes, relationships, lists/list entries, views, workflows, sequences, tasks, calls | Capture → relate → work in context → automate → report | Keep durable business truth on records and workflow-specific state on a separate campaign/list entry; propose AI changes before applying them | Its broad sidebar and configurable primitives can leave a small founder deciding how to assemble the product |
| Clay | Workbooks/tables, People/Companies in Audiences, segments, enrichments, workflows, campaigns, events | Source → enrich → segment → sequence → inspect events → automate | Show readiness and data dependencies before spending or sending; keep an event-level feedback surface | Data and audience strength exceeds company-knowledge governance; offering intent is mainly embedded in filters and copy |

## Intercom Fin: the governed agent lifecycle

### The documented workflow and objects

Intercom describes Fin around four top-level verbs: **Train, Test, Deploy, Analyze**. The product's own explanation calls these the app layer of a continuous-improvement flywheel: add knowledge/policies/systems, test changes, deploy by channel and segment, analyze performance, and retrain. This is more useful than a feature inventory because the navigation encodes the lifecycle itself. ([Fin AI Agent explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained), [Our products explained](https://www.intercom.com/help/en/articles/591233-our-products-explained))

The practical flow documented for chat is:

1. Decide the audience or topics Fin should handle and choose a success metric.
2. Enable knowledge under `Fin AI Agent > Train > Content`.
3. Add natural-language guidance, optional attributes, escalation rules, and procedures.
4. Test actual or imported customer questions, rate answers Good/Poor, and inspect which source, guidance, or personality settings produced a poor answer.
5. Start with an internal audience, then deploy to selected audiences and channels.
6. Use Analyze dashboards and recommendations to decide what to change, then repeat the cycle. ([Deploy Fin over chat](https://www.intercom.com/help/en/articles/8286630-deploy-fin-ai-agent-over-chat))

That sequence is unusually strong onboarding. It asks the operator to define the job and the success measure before configuration, then places testing and bounded rollout between configuration and live traffic.

Fin's documented knowledge objects include public and internal articles, snippets, websites, documents, imported/synced external knowledge, and connected data. `Knowledge > Sources` gives a cross-channel overview, while `Fin AI Agent > Train > Content` manages what Fin can use. Source support differs by consumer: some content can serve Fin, Copilot, or the Help Center; conversation history is available to Copilot but not Fin. Native Intercom content is ingested almost immediately, while external public URLs are described as updating weekly. ([Knowledge sources](https://www.intercom.com/help/en/articles/9440354-knowledge-sources-to-power-ai-agents-and-self-serve-support))

On a synced webpage's details panel, Intercom documents the content type, language, creation date, last sync, Fin/Copilot enablement, public URL, conversations in which the source was involved or resolved, tags, and folder. Synced content is read-only and must be corrected at its origin. ([Sync and manage websites](https://www.intercom.com/help/en/articles/9357945-sync-and-manage-websites))

The testing model is also concrete. The Preview panel is available across Content, Guidance, Attributes, Escalation, Procedures, and Deploy. It can simulate a specific user, audience, brand, language, or channel, and separates **Customer view** from an **Event log** showing the content, data, guidance, tasks, and other configuration applied. Batch tests cover up to 50 questions; procedure simulations define success criteria and exercise branches; ratings are for review and root-cause analysis rather than direct model training. ([Use Fin previews](https://www.intercom.com/help/en/articles/12599471-use-fin-previews), [Simulations vs. Batch tests vs. Previews](https://www.intercom.com/help/en/articles/14077180-simulations-vs-batch-tests-vs-previews))

Deployment is an explicit object and step, not an accidental consequence of saving a prompt. For chat, Simple deploy asks who sees Fin, which channels apply, what Fin's introduction says, which sources it uses, and how handover/auto-close/ratings behave. The preview sits beside these controls. Intercom recommends deploying first to an internal or small customer audience and widening scope after reviewing results. ([Deploy Fin over chat](https://www.intercom.com/help/en/articles/8286630-deploy-fin-ai-agent-over-chat), [Live testing Fin](https://www.intercom.com/help/en/articles/7837527-live-testing-fin-with-your-team-or-customer-segments))

### Source health and knowledge provenance

Intercom's useful pattern is not merely “connect a source.” A source has a lifecycle and a usage trail:

- origin and content type;
- last update/sync;
- whether it is enabled for each AI or human surface;
- audience/brand eligibility;
- conversations where it was involved or contributed to resolution;
- edit location and, for native articles, version history and author/update metadata. ([Sync and manage websites](https://www.intercom.com/help/en/articles/9357945-sync-and-manage-websites), [Create and manage public articles](https://www.intercom.com/help/en/articles/9357931-create-and-manage-public-articles))

**Transfer to Relay:** every source should have a health card with `Connected`, `Needs mapping`, `Stale`, `Sync failed`, or `Disabled`; last successful sync; ownership; scope; and a count of facts and conversations that depend on it. Opening a fact should reveal the original source location and the specific extraction or row, not just the connector name.

Intercom also reveals a provenance limitation Relay should improve. Public, listed articles can be cited to customers, while unlisted articles and private sources can inform an answer without a source link. That separation may be appropriate for customer-facing support, but Relay's internal review surface should always retain source provenance even when the end user should not see it. ([Create and manage public articles](https://www.intercom.com/help/en/articles/9357931-create-and-manage-public-articles), [Upload and manage documents](https://www.intercom.com/help/en/articles/8124534-upload-and-manage-documents))

### Outcomes, feedback, and human review

Fin reporting distinguishes **confirmed resolved**, **assumed resolved**, **escalated**, and **abandoned**, and separately exposes pending reasons such as waiting for the customer or negative feedback. It also connects source performance to involved-versus-resolved conversations so an operator can find frequently used content that is not producing satisfactory answers. ([Fin AI Agent reporting](https://www.intercom.com/help/en/articles/7837533-fin-ai-agent-reporting))

The recommendations surface closes the loop more directly. It reviews unresolved conversations and groups gaps into:

- **content gaps** — missing, unclear, duplicated, or contradictory knowledge;
- **customer data gaps** — information needed from an external system;
- **action gaps** — an action Fin could not take in another system.

Recommendations show the underlying conversations, propose a fix, assign an impact score, and let authorized knowledge managers accept or reject content suggestions. They are generated from patterns rather than letting an operator manually promote any one conversation. ([Optimize Fin](https://www.intercom.com/help/en/articles/11390088-optimize-fin-instantly-with-the-help-of-ai), [Content recommendations](https://www.intercom.com/help/en/articles/11394959-use-ai-powered-content-recommendations-to-improve-fin))

Fin's handoff model has two important human states. A conversation may be escalated and routed to a team inbox, or, for email in the documented open beta, Fin may pause and **Ask a teammate** while retaining ownership. The teammate can guide Fin, approve the draft, or take over. A dedicated bot inbox keeps AI-active conversations away from teammate inboxes until human attention is required. ([Escalation guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules), [Bot inbox](https://www.intercom.com/help/en/articles/3722087-turn-on-the-bot-inbox))

**Transfer to Relay:** review should not be a single undifferentiated approval queue. At minimum it needs:

- **Agent asks for help** — immediate decision required to continue a live or pending interaction.
- **Conversation follow-up** — owner, due date, commitment, or handoff.
- **Outcome correction** — human corrects the inferred disposition or sentiment.
- **Brain proposal** — a new fact, contradiction, offering signal, or audience rule proposed from one or more interactions.
- **Agent change** — a proposed instruction, example, or policy adjustment that must be tested before publication.

### Adopt, adapt, reject

**Adopt**

- Lifecycle navigation that makes `Prepare → Test → Activate → Improve` visible.
- Customer view beside event/evidence view during simulation.
- Audience-bounded rollout and an internal-test audience.
- Separate “ask a person for input” from full handoff.
- Recommendations anchored in the conversations that caused them.
- Outcome labels that distinguish explicit success, inferred success, escalation, and abandonment.

**Adapt**

- Replace generic Train sections with a guided Company Brain readiness flow. Relay's founder should see missing business identity, offering, policy, and evidence as one checklist rather than visiting Content, Guidance, Attributes, Procedures, and Escalation independently.
- Replace support-only “resolution” with campaign-specific outcome definitions: qualified, meeting requested, callback requested, wrong person, not interested, do not contact, promise made, uncertain, and human review needed.
- Keep source use visible internally even when customer-facing citations are suppressed.
- Use recommendations only as proposals; accepted corrections update a new version of the Brain or agent and can be simulated before release.

**Reject**

- A growing set of equal-weight training subpages for every capability.
- Treating silent departure as equivalent to a confirmed commercial outcome.
- Opaque statements that the agent “learns” from successful conversations without showing exactly what changed. Intercom's FAQ says Fin can learn from successfully resolved interactions, while also saying direct answer feedback is not generally available in the UI; Relay should expose an auditable proposal and approval trail instead. ([Fin AI Agent FAQs](https://www.intercom.com/help/en/articles/7837535-fin-ai-agent-faqs))

## Attio: durable business objects and contextual action

### The documented workflow and objects

Attio's data model has four core primitives: **objects, records, attributes, and lists**. Objects define entity types such as People, Companies, Deals, Users, Workspaces, or custom objects. Records are instances. Object attributes apply everywhere; list attributes apply only within a workflow or project. Adding a record to a list creates a distinct list entry so workflow-specific state does not pollute the durable record. Views change presentation and filtering without changing the underlying object. ([Understanding Attio's data model](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model), [Define your data model](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views))

That distinction is highly relevant to Relay:

- “Priya Sharma,” “Acme Education,” and “Study Abroad Counselling” are durable records.
- “Wave 1 owner,” “voice status,” “attempt count,” and “campaign disposition” belong to the record's entry in a specific campaign.
- “Interested in UK masters” may start as a campaign observation and become durable company/customer knowledge only after review.

Attio's import flow preserves this model. The operator chooses an object or list, uploads a CSV, maps columns to existing or newly created attributes, reviews invalid values, previews proposed creates/updates, and only then starts the import. Companies use domain and people use email as unique identifiers for deduplication and enrichment. ([Introduction to data importing](https://attio.com/help/reference/attio-101/introduction-to-data-importing), [Import data via CSV](https://attio.com/help/reference/imports-exports/csv-imports/import-data-into-attio-via-csv))

Automatic enrichment is visibly different from operator-entered data: enriched cells are lilac and use a sparkle icon. Attio requires a company domain or person email, updates enriched attributes when it has new data, and lets manual values override enrichment without later being overwritten. It also states that coverage depends on provider availability and region. ([Enriched data](https://attio.com/help/reference/managing-your-data/enriched-data))

Record pages are the center of work. A record combines overview, activity timeline, email, files, notes, relationships, tasks, and calls. Actions such as compose email, add to list, create note/task, run workflow, or enroll a person in a sequence sit directly on the record. A preview panel lets the user inspect highlights and act without leaving a table or Kanban view. ([Create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records))

Attio's sidebar is broad—Home, Search, notifications, Tasks, Notes, Emails, Calls, Reports, Sequences, Workflows, Favorites, Records, Lists, and Ask Attio chats—but Home has a useful priority: upcoming meetings, due tasks, and contextual access to Ask Attio. Quick actions provide global search, record creation, email, tasks, and upcoming meetings. ([Navigating your workspace](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace), [Tasks](https://attio.com/help/reference/productivity-collaborating/tasks))

### From object to campaign and outcome

Lists represent workflows, projects, or a handpicked subset of records; list entries hold local status, stage, owner, priority, or any other process-specific field. Lists can start from a template, use table or Kanban views, and be restricted to selected members. ([Create lists](https://attio.com/help/reference/managing-your-data/lists/create-lists))

Workflows then turn record or list events into actions. A draft workflow can be assembled manually on a trigger/step canvas or generated by Ask Attio from a natural-language description. The user can inspect and edit every generated block before publishing. Published workflows have version history. ([Create a workflow](https://attio.com/help/reference/automations/workflows/create-a-workflow), [Manage workflows](https://attio.com/help/reference/automations/workflows/manage-workflows))

Sequences are explicit, versioned email campaign objects. They contain lead enrollment, multi-step messages, sender identity, timing, exit criteria, and unsubscribe behavior. Recipients can be enrolled from people records, related-record tabs, lists, or workflows. The enrollment screen previews merged recipient data. Once a revised sequence is published, new recipients get the new version while already enrolled recipients stay on the version active at enrollment. ([Create a sequence](https://attio.com/help/reference/automations/sequences/create-a-sequence))

Reporting remains attached to the same record/list model. Dashboards can use current-state, historical values, funnel, time-in-stage, and stage-change reports. The funnel documentation is careful about denominator and stage-skipping behavior and recommends a separate funnel for each terminal outcome. ([Create reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports), [Funnel report](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-funnel-report))

### Human review and contextual AI

Ask Attio is available from Home, global quick actions, and contextual surfaces. From a call recording it prioritizes that call; from a record it can use the record's data and activity. It can search and summarize calls, notes, emails, records, and web research; draft emails; create tasks; and propose record changes. Crucially, suggested note, record, and task changes require the user to approve the proposal. Denying or ignoring it leaves the workspace unchanged. ([Chat with Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio))

Call Intelligence links recordings automatically to person and company records using participant email/domain. A recording includes a transcript, speaker labels, chapters, summary, selectable insight templates, and a contextual Ask Attio entry point. Suggested next steps or deal updates can therefore be proposed from a specific evidence object instead of from an unscoped global chat. ([View and manage call recordings](https://attio.com/help/reference/productivity-collaborating/call-intelligence/view-and-manage-call-recordings))

For provenance, Attio distinguishes enriched values visually, lets the user inspect “who or what” changed an attribute through edit history on supported plans, and retains the underlying communications and recordings on the record. ([Create and manage attributes](https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes))

**Transfer to Relay:** a proposed Brain update should appear inside the relevant company/person/conversation context, show the source evidence, old and new values, and the agent/process that proposed it. Approval should be a semantic action—`Accept as verified fact`, `Keep as campaign-only signal`, `Correct`, or `Reject`—rather than a generic Yes/No.

### Adopt, adapt, reject

**Adopt**

- Durable objects and explicit relationships as the backbone of the Company Brain.
- A separate campaign entry for state that is only true in one outreach context.
- Import mapping, invalid-value review, and create/update preview before mutation.
- Visually distinguish provider-enriched data from operator-entered data.
- Put relevant actions on the record and conversation, rather than forcing a trip to a global automation area.
- AI proposes structured updates; a person approves before the record changes.
- Immutable enrollment/version association so an outcome can be attributed to the exact campaign and agent version.

**Adapt**

- Attio asks teams to decide which objects, lists, and attributes they need. Relay should preconfigure the opinionated minimum: Company, Person, Offering, Source, Campaign, Conversation, Review item, and Agent version.
- Use “saved audience” and “campaign” language rather than exposing lists/list entries to a founder.
- Keep relational records but make provenance richer than “who or what changed this”; show the source row, conversation turn, extraction, confidence, and review decision.
- Bring contextual Ask Attio behavior into fixed next-action buttons: `Prepare me`, `Draft follow-up`, `Propose Brain updates`, and `Explain why this person is in the audience`.

**Reject**

- A primary sidebar with separate Notes, Emails, Calls, Reports, Sequences, Workflows, Records, Lists, and AI chats for Relay's initial product. Those are useful capabilities but poor top-level destinations for a small team.
- Unlimited custom-object setup before the founder has completed one campaign.
- Treating AI chat history as an equal product destination. Preserve it as supporting context; surface durable outputs in records, campaigns, tasks, and review items.

## Clay: observable data readiness, audiences, and campaigns

### The documented workflow and objects

Clay's newer product spine is **Audiences + Workflows + Campaigns**, with workbooks/tables remaining the visible transformation surface.

Audiences is documented as a unified profile layer for People and Companies, combining CRM, warehouse, CSV, Clay search, and third-party enrichment. Its setup flow is import → create dynamic segments → enrich and monitor → write back. Segments can combine CRM fields, Clay enrichment, and signals with nested AND/OR logic. Each segment exposes actions such as send to workflow, add to workbook, sync to ads, or export to a campaign. ([Audiences](https://university.clay.com/docs/audiences))

Clay Search begins with People or Companies, accepts a plain-language ICP or explicit filters, shows the structured filter translation, and lets the operator save a one-time table or an always-on Audience. Audience matches land in a draft state with new and existing records side by side for qualification before sync, unless auto-save is enabled. ([Search](https://university.clay.com/docs/search))

This matters because Clay does not hide audience construction behind a prompt. The user can see and edit the actual criteria. **Relay should do the same:** a natural-language audience request may generate rules, but the rules and counts must remain visible, explainable, and saveable.

Clay enrichments are columns or workflow steps with explicit inputs, provider/account, outputs, auto-update behavior, `Only run if` conditions, delays, and cost. Waterfalls try providers in a chosen order and can output the successful provider. In audience workflows, the guided setup is `Source → Enrich segment → Map fields → Review & run`; it offers Publish without running, Test on selected rows, or Publish and run with a credit estimate. Status shows completed rows, errored rows, and spend; Manage runs opens history. ([Enrichments](https://university.clay.com/docs/enrichments), [Waterfalls](https://university.clay.com/docs/building-a-data-waterfall), [Enrichment in Workflows](https://university.clay.com/docs/enrichment-in-workflows))

Tables add useful operational transparency. Auto-run exists at table and column level, existing results can be retained, rows can update net-new or all records, and table history records who changed settings, columns, and enrichments with diffs. Graph view shows enrichment dependencies. ([Table management settings](https://university.clay.com/docs/table-management-settings))

### Audience and campaign readiness

Sequencer explicitly does not build or enrich the audience. A campaign points to a People segment or a table; upstream search/workflows/Audiences must supply a usable email and any personalization fields. `Lead setup` shows the segment and a readiness warning when fewer than 70% of eligible leads contain every field the sequence requires, with a field-by-field missingness report. Exclusion segments, cooldowns, and a workspace blocklist operate around the eligible audience. ([Get leads ready to sequence](https://university.clay.com/docs/get-leads-ready-to-sequence), [Using an Audience in a Campaign](https://university.clay.com/lessons/using-an-audience-in-a-campaign))

A campaign has four documented parts: **Leads, Sequence, Sender accounts, Settings**. Once it has leads, at least one message, and a sender, it can launch. Launch locks the shape of the sequence; pause allows copy/timing/settings edits; complete closes the run. At enrollment, Clay snapshots the lead data and renders all messages, so later enrichment changes do not rewrite already generated sends. ([Getting started with Sequencer](https://university.clay.com/docs/getting-started-with-sequencer), [Launch and manage a campaign](https://university.clay.com/docs/launch-and-manage-a-campaign))

Clay's strong readiness model is transferable beyond email:

- audience membership is dynamic until enrollment;
- activation depends on required fields;
- exclusions and blocklists are evaluated before action;
- the content and data used for one enrolled person are snapshotted;
- campaign edits apply prospectively, preserving attribution.

For Relay voice, the same contract should apply to `offering`, `desired outcome`, `person identity`, `consent/contact eligibility`, `language`, `timezone/contact window`, `agent version`, and the minimum evidence required for personalization. The founder should see exactly which contacts are Ready, Missing data, Excluded, Needs consent review, or Blocked—and be able to open the reason.

### Outcomes, correction, and event-level learning

Campaign analytics has three operational surfaces: **Analytics**, **Activity**, and **Replies**. Analytics shows lead state and sequence conversion; Activity is a per-lead event stream; Replies is the human inbox. Workspace-level analytics compares campaigns. Reply categories map to positive, neutral, and negative sentiment, and the user can correct the category from the reply menu; the correction flows through analytics. Clay explicitly recommends positive reply rate over raw reply rate because auto-replies and negative replies create activity without commercial value. ([Campaign analytics and replies](https://university.clay.com/docs/campaign-analytics-and-replies))

Every send, reply, bounce, unsubscribe, category update, and campaign status change is also written to a `Campaign events` table. That ordinary table can run formulas, AI, integrations, or actions. Clay's own examples include drafting a reply and posting it to Slack for approval before sending, forwarding a thread to the relationship owner, syncing only positive replies to CRM, and updating the blocklist from opt-outs. ([Automate campaign events](https://university.clay.com/docs/automate-campaign-events))

This is the cleanest adjacent example of outcomes becoming workflow input. It also exposes a key design choice for Relay: **the learning substrate should be an immutable event stream, while the founder works from a curated review queue.** Raw events are valuable for replay, reporting, and automation; they should not flood the primary UI.

### Source health and provenance

Clay is strongest at operational lineage rather than semantic knowledge provenance:

- each enrichment is a visible column or workflow step with mapped inputs/outputs;
- waterfalls can expose the provider that succeeded;
- completed/errored counts and run history are available;
- table history shows configuration changes;
- recurring enrichments distinguish a current result from a value captured on a past date;
- `Only run if` and required-input controls explain why a step ran or skipped. ([Waterfalls](https://university.clay.com/docs/building-a-data-waterfall), [Enrichment in Workflows](https://university.clay.com/docs/enrichment-in-workflows), [Table management settings](https://university.clay.com/docs/table-management-settings))

Clay's `Use AI` action lets the operator review the generated prompt, model, inputs, and output schema before running web research or content generation. It states that only selected row data is provided as context. The documentation does not establish a universal, first-class citation trail for every AI-derived cell, so Relay should not infer one. ([Use AI](https://university.clay.com/docs/use-ai-integration-overview), [AI in Clay](https://university.clay.com/docs/ai-in-clay))

### Adopt, adapt, reject

**Adopt**

- Dynamic audiences with visible structured criteria and exclusions.
- Data-readiness percentage and field-level missingness before activation.
- Enrichment test on a small sample before running the full audience.
- Provider fallback with the successful provider retained as lineage.
- Immutable per-recipient enrollment snapshot and prospective campaign versions.
- Per-interaction event stream feeding analytics, automation, and human review.
- Human correction of AI-inferred reply/outcome category.
- A workspace-wide do-not-contact blocklist applied before each campaign action.

**Adapt**

- Replace spreadsheet cells with founder-readable completeness: `Identity verified`, `Offering match supported`, `Contact allowed`, `Personalization evidence ready`, and `Language known`.
- Let advanced operators inspect the dependency graph, but keep the normal path as a guided readiness page.
- Make audience criteria explain commercial reasoning, not just filters: why this group fits this offering now, which signals support the choice, and which evidence is too weak.
- Extend reply correction into conversational outcome correction and evidence-backed Brain proposals.

**Reject**

- Campaign intent implicit only in audience filters and message copy. Relay must require a named offering, desired outcome, reason to contact, and prohibited claims before activation.
- Tables/workbooks as the main navigation metaphor for a founder-oriented product.
- Auto-running costly or external actions merely because a row appeared. Relay should default to review for first activation, ambiguous identity, policy changes, and external commitments.
- Treating open/click/activity volume as the primary business result.

## Transferable system design: adopt, adapt, reject

| Product problem | Adopt | Adapt for Relay | Reject |
|---|---|---|---|
| Data intake | Attio's mapping → invalid-value review → create/update preview | Show identity and result-column decisions in business language; suggest mappings but require confirmation | Silent ingestion that immediately becomes trusted knowledge |
| Company knowledge | Intercom source enablement and source-use reports; Attio record relationships; Clay run lineage | Every fact carries source, extraction location, freshness, confidence, scope, and review state | A flat document library called “the brain” |
| Navigation | Intercom lifecycle verbs and Attio contextual record actions | Five destinations with one persistent next action; capabilities appear inside the current object | Separate top-level pages for sources, tables, knowledge, agents, workflows, calls, sequences, analytics, experiments, tasks, and feedback |
| Audience | Clay dynamic segments, exclusions, readiness, and just-in-time eligibility | Add offering fit, reason-now evidence, consent/contact policy, and an explainable inclusion reason | An uploaded static list with no connection to intent or policy |
| Activation | Intercom test/internal rollout and Clay immutable enrollment snapshot | Simulate calls, approve a small cohort, and preserve agent/Brain/audience versions per person | “Save prompt” or “connect channel” implicitly goes live |
| Outcomes | Intercom explicit resolution states and Clay corrected reply categories/events | Campaign-specific disposition, confidence, evidence, and operator correction | One generic success metric or silent assumptions |
| Human review | Intercom Ask-a-teammate and Attio proposed mutations | Risk- and urgency-ranked review types with semantic actions | One inbox mixing live intervention, knowledge changes, follow-ups, and analytics anomalies |
| Learning | Intercom evidence-linked recommendations and Clay event automations | Propose a versioned Brain/agent change, test it, publish it, and keep rollback | Invisible autonomous “learning” from raw conversations |

## Recommended Relay object model

Relay can remain opinionated without becoming shallow if it exposes a small set of durable objects with clear ownership.

### 1. Source

Represents a CSV, spreadsheet, website, document, CRM/table, email/calendar connection, or manually entered evidence set.

Required visible fields:

- name and source type;
- owner and access scope;
- last successful sync and next expected refresh;
- row/item counts: imported, changed, rejected, unresolved;
- mapping version and identifier fields;
- health state and actionable reason;
- dependent facts, audiences, and active campaigns;
- disconnect/revoke behavior.

### 2. Company, Person, and Offering

These are durable Company Brain records. `Offering` must be first-class rather than a tag or a paragraph hidden in a prompt. It should contain:

- what is offered and to whom;
- supported claims and their evidence;
- price/range only when verified and allowed;
- eligibility, exclusions, and operational constraints;
- common questions and objections;
- owner and review status;
- source-backed revisions over time.

### 3. Fact

A fact is the smallest reviewable unit of knowledge. It should have:

- subject, predicate, and value;
- source and exact evidence location;
- observed/extracted date and freshness policy;
- confidence and conflict state;
- scope: internal only, agent usable, customer shareable;
- status: proposed, verified, disputed, superseded, revoked;
- reviewer and decision history.

This is the missing connective tissue between Attio's record fields, Intercom's knowledge sources, and Clay's enriched cells.

### 4. Audience

A saved, dynamic qualification definition linked to one or more offerings. It includes:

- plain-language purpose;
- visible structured rules and exclusions;
- evidence-based “why these people/companies” explanation;
- contact/consent policy;
- readiness counts by reason;
- refresh behavior;
- last human review and owner.

### 5. Campaign

The central execution object. It must require:

- selected offering;
- desired outcome and secondary acceptable outcomes;
- selected audience and its current count;
- reason to contact / reason now;
- channel and contact window;
- agent version, language/voice behavior, and disclosure;
- supported claims and prohibited claims;
- escalation and stop conditions;
- pilot size, owner, and budget/usage guard;
- success metric and review cadence.

### 6. Conversation

An immutable interaction record linked to the exact campaign, recipient snapshot, Brain version, and agent version. It includes transcript/audio pointers, evidence used, tool/action events, timing, human interventions, outcome, confidence, commitments, and privacy controls.

### 7. Review item

A proposed mutation or action, never just a notification. Types include live help, follow-up, outcome correction, Brain proposal, audience correction, and agent change. Every item must answer:

- What is being proposed?
- Why now?
- Which evidence supports it?
- What will change if accepted?
- Which active campaigns depend on it?
- Can it be tested or previewed first?
- Who owns the decision and when is it due?

### 8. Agent version

Contains the compiled behavior for a channel: instructions, voice/language settings, tools, disclosure, source scope, escalation policy, and test evidence. Publishing creates a new version; active recipients/conversations preserve their assigned version.

## The recommended end-to-end workflow

### Stage 1: Establish the Company Brain

The first-run experience should ask the founder to do one concrete thing: **“Bring one source that best explains your company or customers.”** Accept a website, CSV/spreadsheet, documents, or a connection. Do not begin with an integrations catalog.

After intake, Relay presents one review table:

- Who/what are the records?
- Which column uniquely identifies them?
- Which columns describe outcomes or status?
- Which proposed entities and relationships will be created?
- Which rows or claims are invalid, ambiguous, or conflicting?

The primary action is `Confirm import`. The secondary action is `Fix 6 issues`. Imported content enters as proposed or source-derived knowledge, not automatically verified truth.

The next screen is a **Brain readiness review**, not a dashboard. It shows:

- Company identity: ready / needs confirmation.
- Offerings: one confirmed / three proposed / missing evidence.
- Customers and relationships: count and identity health.
- Policies and constraints: ready / missing.
- Sources: healthy / stale / failing.
- Open questions: prioritized by whether they block the first campaign.

The primary action should name the actual blocker, such as `Confirm your first offering`, rather than `Continue setup`.

### Stage 2: Create a campaign from intent

`New campaign` opens a short brief with four required choices:

1. **What are you offering?** Select a reviewed Offering.
2. **What should this campaign achieve?** Choose or define the desired outcome.
3. **Who should the agent contact, and why?** Select/build an Audience; Relay explains inclusion signals and exclusions.
4. **What may the agent say and do?** Review evidence, prohibited claims, disclosure, tools, escalation, and stop rules.

Relay can propose the brief from the Company Brain, but the founder confirms each choice. The brief then becomes the stable campaign header visible throughout audience, voice, outcomes, and review.

### Stage 3: Show readiness before voice configuration

The Campaign page should have one vertical readiness path rather than many tabs:

1. **Intent** — offering and outcomes confirmed.
2. **Audience** — counts, exclusions, evidence, and missing fields.
3. **Voice agent** — agent version, language, disclosure, source scope, escalation.
4. **Simulation** — representative scenarios with customer view, transcript/audio, and an evidence/event log.
5. **Pilot** — exact recipients, schedule, budget, and stop conditions.

Each step has a status and opens inline. The sticky action at the bottom says the next executable step: `Review 12 contacts missing consent status`, `Run 5 simulations`, or `Activate pilot for 20 contacts`.

The simulation result should borrow Intercom's two-view model:

- **Experience:** what the customer hears/sees.
- **Evidence:** sources retrieved, facts used, tools called, policies applied, fallback/escalation decisions, and timing.

Failed simulations create review items linked to the exact agent or Brain component that needs work.

### Stage 4: Activate a bounded cohort

Activation creates immutable snapshots for campaign intent, audience eligibility, selected recipient fields, Brain version, agent version, and policy. New eligible audience members can join only if the campaign explicitly allows continuous enrollment. Edited configuration applies to future enrollments through a new version.

The campaign header while live should answer four questions without opening analytics:

- Is it running, paused, or stopped?
- Who is eligible, ready, queued, active, completed, or blocked?
- Is any quality or policy guard close to its threshold?
- What needs a human now?

Pause, stop, and emergency disable remain visible and unambiguous.

### Stage 5: Convert voice activity into outcomes

Every conversation produces an event trail and one current outcome state. The initial taxonomy should be compact and operational:

- Qualified / desired outcome achieved.
- Follow-up or callback requested.
- Needs human help.
- Wrong person or audience mismatch.
- Not interested.
- Do not contact.
- No answer / unreachable.
- Failed or interrupted.
- Uncertain — review required.

Separate explicit customer statements from inferred outcomes. Show confidence and the supporting turn. The human can correct the category, and reporting updates without rewriting the original event trail.

### Stage 6: One review queue, multiple review jobs

The Review destination is prioritized by urgency and consequence:

1. Live/pending agent asks.
2. Promised follow-ups and time-bound commitments.
3. Do-not-contact, consent, safety, and policy exceptions.
4. Uncertain outcomes and audience mismatches.
5. Proposed Company Brain changes.
6. Proposed agent/audience improvements.

Each item opens a split view: evidence on the left, proposed change and downstream impact on the right. Batch review is allowed only for homogeneous, low-risk proposals with the same evidence rule.

Acceptance options depend on type. For a new fact: `Verify`, `Keep as signal`, `Correct`, `Reject`. For an outcome: select the correct disposition and whether it reveals an audience or agent issue. For an agent change: `Create draft version`, then run affected simulations before `Publish`.

### Stage 7: Close the learning loop visibly

Relay should never say only “the agent learned.” After review, show a changelog entry such as:

> “Three conversations showed that applicants with only a conditional offer are not ready for the visa-support campaign. Raghav accepted a new audience exclusion. Campaign v4 will apply it to future enrollments; 11 currently queued contacts need review.”

This statement contains the source, decision, object changed, version boundary, future effect, and affected live work. It is the auditable synthesis missing when learning is either a generic analytics recommendation or an invisible model behavior.

## Navigation and next-action principles

### Use lifecycle status inside objects, not more destinations

Campaigns can contain intent, audience, voice, simulation, activation, analytics, and changes without seven primary pages. Company Brain can contain sources, offerings, people/companies, facts, and questions without five primary pages. Use sub-navigation inside the active object only when the object has enough depth to justify it.

### Make Today a decision surface

Today should prioritize:

- one blocking setup action;
- live exceptions that need immediate input;
- due follow-ups and commitments;
- campaign health changes;
- a short “since you last visited” change digest.

It should not be a generic KPI dashboard. Metrics belong beside the campaign or process they describe.

### Name actions by their outcome

Prefer:

- `Confirm 2 identifier mappings`
- `Review 18 audience exceptions`
- `Test the refund objection scenario`
- `Activate pilot for 20 people`
- `Approve 3 Brain corrections`

Avoid:

- `Continue`
- `Configure`
- `Manage`
- `Optimize`
- `Explore data`

### Preserve context across the loop

From a campaign result, the founder should be able to open the conversation, recipient snapshot, evidence used, relevant Company Brain fact, and proposed change without navigating back through global sections. Breadcrumbs and contextual side panels are more valuable here than more sidebar items.

## Design for an Indian founder-led SaaS

The adjacent products are sophisticated operator tools. Relay's initial customer may be a founder or small operating team with spreadsheets, partial CRM discipline, mixed English/Hindi terminology, and limited time to design a data model.

The product should therefore:

- accept a useful first source without requiring a CRM migration;
- teach through the customer's data, not through blank configuration pages;
- show rupee-denominated usage or limits where money is relevant, while keeping it out of the core workflow;
- support explicit language, honorific, pronunciation, and contact-window settings at campaign/recipient level;
- remain usable in a narrow Android browser viewport, with review actions and pause controls reachable without dense tables;
- make “who will be contacted and why” readable before activation;
- never imply a source connection, WhatsApp delivery, telephone capability, human identity, or autonomous learning that has not been established;
- use familiar business terms—company, customer, offering, campaign, conversation, follow-up—in place of enrichment, object schema, procedure, and orchestration unless the advanced view is opened.

## Recommended first redesign slice

The highest-leverage redesign is one complete loop, not a new shell around every current feature:

1. **Today:** a campaign/Brain readiness card and review count.
2. **Company Brain:** source health, offering confirmation, fact provenance, and open questions.
3. **Campaign brief:** offering + desired outcome + evidence-backed audience + allowed behavior.
4. **Readiness:** field/consent/evidence gaps, simulation, and bounded pilot activation.
5. **Conversation outcome:** transcript/evidence, disposition, follow-up, and proposal generation.
6. **Review:** accept/correct/reject with downstream impact and versioned publication.

If that path is coherent, the existing capabilities can be progressively placed behind it. If it is not coherent, polishing isolated source, agent, analytics, or deployment pages will deepen the feeling of twenty loosely connected features.

## Primary-source register

All pages below were accessed on 1 October 2026.

### Intercom

- [Fin AI Agent explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)
- [Deploy Fin AI Agent over chat](https://www.intercom.com/help/en/articles/8286630-deploy-fin-ai-agent-over-chat)
- [Knowledge sources to power AI, agents and self-serve support](https://www.intercom.com/help/en/articles/9440354-knowledge-sources-to-power-ai-agents-and-self-serve-support)
- [Sync and manage websites](https://www.intercom.com/help/en/articles/9357945-sync-and-manage-websites)
- [Use Fin previews](https://www.intercom.com/help/en/articles/12599471-use-fin-previews)
- [Simulations vs. Batch tests vs. Previews](https://www.intercom.com/help/en/articles/14077180-simulations-vs-batch-tests-vs-previews)
- [Fin AI Agent reporting](https://www.intercom.com/help/en/articles/7837533-fin-ai-agent-reporting)
- [Optimize Fin with AI recommendations](https://www.intercom.com/help/en/articles/11390088-optimize-fin-instantly-with-the-help-of-ai)
- [Manage escalation guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)
- [Turn on the bot inbox](https://www.intercom.com/help/en/articles/3722087-turn-on-the-bot-inbox)

### Attio

- [Understanding Attio's data model](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model)
- [Define your data model: objects, lists, and views](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views)
- [Introduction to data importing](https://attio.com/help/reference/attio-101/introduction-to-data-importing)
- [Enriched data](https://attio.com/help/reference/managing-your-data/enriched-data)
- [Create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- [Chat with Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio)
- [Create a workflow](https://attio.com/help/reference/automations/workflows/create-a-workflow)
- [Create a sequence](https://attio.com/help/reference/automations/sequences/create-a-sequence)
- [View and manage call recordings](https://attio.com/help/reference/productivity-collaborating/call-intelligence/view-and-manage-call-recordings)
- [Create reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports)

### Clay

- [Audiences](https://university.clay.com/docs/audiences)
- [Search](https://university.clay.com/docs/search)
- [Enrichments](https://university.clay.com/docs/enrichments)
- [Waterfalls](https://university.clay.com/docs/building-a-data-waterfall)
- [Enrichment in Workflows](https://university.clay.com/docs/enrichment-in-workflows)
- [Table management settings](https://university.clay.com/docs/table-management-settings)
- [Get leads ready to sequence](https://university.clay.com/docs/get-leads-ready-to-sequence)
- [Getting started with Sequencer](https://university.clay.com/docs/getting-started-with-sequencer)
- [Launch and manage a campaign](https://university.clay.com/docs/launch-and-manage-a-campaign)
- [Campaign analytics and replies](https://university.clay.com/docs/campaign-analytics-and-replies)
- [Automate campaign events](https://university.clay.com/docs/automate-campaign-events)

