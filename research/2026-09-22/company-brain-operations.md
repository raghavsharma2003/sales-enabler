# Company-brain operations: Glean, HubSpot Breeze and Attio

**Research date:** 22 September 2026  
**Scope:** a bounded companion to [`product-flow-benchmarks.md`](../product-flow-benchmarks.md). I verified nine current primary product/help pages: Glean's [data-source setup](https://docs.glean.com/get-started/setup/connect-data-sources), [connector model](https://docs.glean.com/connectors/about) and [citations](https://docs.glean.com/user-guide/assistant/glean-chat/glean-chat-citations/glean-citations); HubSpot's [Breeze Assistant](https://knowledge.hubspot.com/ai/use-breeze-assistant?promo=hubspot-website-banner), [Breeze workflow actions](https://knowledge.hubspot.com/workflows/use-ai-to-manage-data-in-workflows?app=1) and [approvals](https://knowledge.hubspot.com/account-management/overview-of-approvals-in-hubspot); and Attio's [data model](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model), [record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) and [workflow blocks](https://attio.com/help/reference/automations/workflows/workflows-block-library). These are documented product workflows, not adoption, quality or superiority claims.

## Revised voice-platform baseline

The target remains a company brain plus command centre for **VyaktiGroupAI**: capture customer voice, preserve relationship context, turn evidence into owned work, and keep the founder moving through a small operator queue. The core job is not “run a CRM.” It is:

`served-customer cohort -> consent/invite -> booked/completed voice conversation -> transcript/evidence -> reviewed insight -> owned work item -> customer follow-up -> outcome`

The company brain should answer “what do we know, who said it, when, under what permission, and what changed because of it?” The command centre should answer “what needs attention today?” A canonical customer/company record, linked conversations and transcripts, cited facts, insight decisions and work-item states make that loop inspectable. Keep the existing `VyaktiGroupAI` group context; do not create a new group identifier.

## What the three products actually show

### Glean: permission and freshness are operating states

Glean's documented setup is Admin Console -> add app -> validate OAuth/API permissions -> optionally restrict the crawl -> start crawl -> monitor **Crawling** and **Indexing**. The source page exposes items synced and change rate; it says status metrics refresh hourly and that a typical initial crawl can take three to ten days depending on source size and rate limits. This is a useful knowledge-currentness pattern: “connected” is not the same as “ready.” ([Connect Data Sources](https://docs.glean.com/get-started/setup/connect-data-sources))

Connectors fetch content, activity metadata and the source permission map. Glean says results follow source ACLs, while its citation UI points to the document or passage and never grants new access. A custom/push connector can ingest proprietary data, but still needs metadata and permissions to preserve the model. ([About connectors](https://docs.glean.com/connectors/about); [Citations](https://docs.glean.com/user-guide/assistant/glean-chat/glean-chat-citations/glean-citations))

Borrow: source cards with owner, scope, permission status, last successful sync, crawl/index state, item count, change rate, failure reason and freshness warning; every brain claim gets a source pointer and access-aware preview. For a small voice product, use this for transcripts, CRM notes and interview artifacts rather than building an enterprise connector catalog.

### HubSpot Breeze: context becomes workflow data, with explicit approvals

Breeze Assistant supports connected apps, files, projects, memories and citations. The current page (last updated 21 September 2026) tells operators to inspect the context used by a response and the sources it cited. User permissions and AI settings control what actions are available. ([Use Breeze Assistant](https://knowledge.hubspot.com/ai/use-breeze-assistant?promo=hubspot-website-banner))

Breeze workflow actions make the operator loop concrete: enroll a record, run Research or Custom prompt against selected property data or the five most recent call transcripts, test the action on a specific record, then branch, update a record, or draft an email. The custom-prompt model is documented as not internet-connected, and insufficient credits can produce null output. ([Use Breeze to manage data in workflows](https://knowledge.hubspot.com/workflows/use-ai-to-manage-data-in-workflows?app=1))

HubSpot approvals cover content, exports, deals and quotes, with permission/plan constraints. ([Overview of approvals](https://knowledge.hubspot.com/account-management/overview-of-approvals-in-hubspot)) Borrow: make AI extraction a proposed field or insight with selected inputs, test result, output type, source citation and accept/edit/reject; put external sends, CRM writes and roadmap commitments behind one approval queue. Treat each run as a log containing actor, input record/version, model action, output, side effect, timestamp and failure reason.

### Attio: relational records plus record-level operator actions

Attio models objects, attributes, records and lists; relationship attributes connect records bidirectionally. A record page unifies activity, notes, emails, files, calls, tasks and related records. It exposes actions such as add to list, run workflow, create task and enroll in sequence, and supports edit history plus a `Created by` attribute that identifies a user, integration or workflow automation. ([Understanding Attio's data model](https://attio.com/help/reference/attio-101/attios-data-model); [Create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records))

Attio workflows can be triggered by a record/list action, record creation/update, schedule or webhook. The trigger output includes record data, actor and trigger time; AI/agent outputs are not silently stored and must be mapped into an attribute or list entry. ([Workflows block library](https://attio.com/help/reference/automations/workflows/workflows-block-library)) Borrow: canonical `company`, `person`, `conversation`, `transcript`, `insight` and `work_item` objects with explicit relationships; list membership for a particular feedback cohort; per-record “run now”; and an automation history that records trigger, actor, inputs, outputs, writes and retries. This is the closest useful pattern for operator queue design.

## Baseline implications for VyaktiGroupAI

The first command-centre queue should show only actionable exceptions: consent or source permission missing, stale transcript, failed extraction, insight awaiting evidence review, positive customer reply awaiting owner, overdue interview, blocked work item or customer follow-up due. Each row links to the canonical record and evidence, shows the next owner and SLA, and offers a bounded action.

Knowledge currentness needs two clocks: source freshness (last sync/transcript/import) and claim freshness (when a fact or insight was last reviewed). A narrative insight must render as **claim -> supporting transcript passage/events -> cohort/time window -> missing or counter evidence -> confidence/coverage -> proposed action -> approval -> measured result**. Theme frequency or sentiment is descriptive; prioritisation is a team decision unless an experiment supplies impact evidence.

CRM canonical data ownership should be explicit. The voice platform owns conversation, transcript, consent, evidence, insight review and feedback-loop state. A connected CRM may remain canonical for company/person identity, lifecycle and sales ownership. Writes across that boundary are proposed changes with source, field, actor, timestamp and approval, never an untraceable overwrite. Use Attio-style relationships and Glean-style permission provenance without inheriting a large CRM schema.

## Borrow versus keep out of scope

Borrow the small, high-value patterns: Glean's crawl/index/freshness states and permission-aware citations; Breeze's selected-context extraction, test-before-write, typed outputs and approvals; Attio's relational records, list-scoped process state, record actions, actor/timestamp traces and explicit AI-output persistence. These directly support concrete jobs: prepare for a customer conversation, find the latest evidence, review a proposed insight, assign work and close the loop.

Keep the huge CRM surface out of the first product: broad pipeline administration, quote/deal approvals, marketing content libraries, enterprise-wide connector catalogs, generic world-knowledge chat, arbitrary custom-object configuration and bulk automation builders. The reviewed pages do not establish a single end-to-end voice-feedback system. They document powerful slices; the combined relational memory from voice evidence to validated insight to owned customer outcome remains VyaktiGroupAI's product hypothesis and must be piloted with a small served-customer cohort.

