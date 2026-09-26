# Company data workflow cases v6: from guided discovery to reviewed voice learning

**Research date:** 22 September 2026  
**Scope:** primary product/help/developer documentation for Clay, Salesforce Data 360 + Agentforce, Glean, HubSpot Breeze and Intercom Fin.  
**Purpose:** add concrete end-to-end workflow cases to the existing v4 depth memo, with particular attention to messy multi-source data, identity, product mapping, permission/currentness, consent and revocation, customer journeys, and a small founder-operated voice loop.

This is desk research from public first-party documentation. It is not a runtime test, security audit, implementation, or claim that all competitors were reviewed. “Observed” means the cited documentation explicitly describes the behavior. “Inferred” means a design implication for VyaktiGroupAI. Vendor claims are labelled when a page describes a result without independent measurement.

## The operating problem in plain English

The desired experience is a founder saying, “Help me understand this company, what they buy or use, which customers can tell us what is missing, and prepare the smallest useful conversation.” The product should ask only the questions needed to resolve ambiguity, connect the available evidence, and show the founder what it knows before it acts.

The end-to-end loop is:

```mermaid
flowchart LR
  A[Founder describes company and goal] --> B[AI asks a few clarifying questions]
  B --> C[Connect ERP / LMS / CRM / email / files]
  C --> D[Ingest: OAuth, API, webhook, CSV or manual file]
  D --> E[Normalize products, people, accounts and events]
  E --> F[Match identities and show conflicts]
  F --> G[Map products/services to customer journey]
  G --> H[Build eligible cohort and consent check]
  H --> I[Product-linked voice campaign]
  I --> J[Transcript + evidence + outcome ledger]
  J --> K[AI proposes themes and product signals]
  K --> L[Founder reviews evidence and asks follow-ups]
  L --> M[Approved learning / change proposal]
  M --> N[Test, release, measure and roll back]
  N -. new signal .-> D
```

The experience should make the following visible at every step:

| Question | Minimum evidence shown to the founder |
|---|---|
| What did we connect? | Source name, connection method, owner, scope, permission result, last successful sync and currentness |
| What does this record represent? | Source IDs, matching keys, candidate duplicates, confidence, conflicting values and linked company/person/product records |
| Why did the system say this? | Source excerpt or field, source revision/timestamp, access decision, model/action version and a link to the underlying record |
| Can we contact this person? | Consent basis, channel, audience rule, unsubscribe/blocklist state, revocation time and the reason for any exclusion |
| What will happen next? | Proposed action, audience, product/journey step, side effect, estimated cost, owner, stop rule and approval state |
| What changed after feedback? | Reviewed evidence, decision, approved change, version diff, release result and measured follow-up |

This is deliberately a small operator surface: a source health view, entity/conflict review, customer journey ledger, evidence review and one approval queue. The evidence below does not support a large generic CRM setup or a manual form maze.

## Three deep reference cases

### 1. Clay: a guided source-to-account-intelligence-to-campaign loop

Clay is the closest documented pattern for a lightweight operator who needs to start with existing messy records, enrich them, maintain account context and trigger outreach with explicit eligibility and unsubscribe state. It is a bounded reference for orchestration and data hygiene; it is not evidence of a permission-aware enterprise knowledge graph or a voice-feedback system.

#### Concrete documented flow

1. **Import the available data.** Clay Audiences accepts Salesforce, HubSpot, Snowflake, BigQuery, Databricks, CSV and Clay’s own people/company database. The import wizard maps fields and asks for a unique identifier. A company ID can also link people to the company; blank cells are skipped by default so an empty incoming field does not clear an existing value. CRM or warehouse connections require workspace-admin access, while CSV and Clay-table imports are available to workspace members. ([Audiences](https://university.clay.com/docs/audiences))
2. **Resolve records with an explicit matching rule.** Clay documents automatic cross-source deduplication using professional profile URL and email, plus configurable import matching on an alias such as email, domain or external record ID. It warns that any records sharing the chosen identifier will be merged, including duplicates inside one source. Salesforce Lead-to-Contact conversion is automatically merged in Audiences, with historical data preserved. ([Audiences FAQ and best practices](https://university.clay.com/docs/audiences-faqs-and-best-practices))
3. **Build a live segment.** Audiences segments are filters over the persistent profile rather than copied lists. The docs say segments change as records enter or leave the filter; refresh cadence depends on plan (for example, daily on Growth and 15 minutes on Enterprise for CRM/warehouse sync). ([Audiences](https://university.clay.com/docs/audiences), [Audiences FAQ and best practices](https://university.clay.com/docs/audiences-faqs-and-best-practices))
4. **Enrich a small test set, then scale.** The guided enrichment flow starts with `Source`, `Enrich segment`, `Map fields`, and `Review & run`. It lets the operator test individual rows, deliberately include sparse records, inspect every intermediate step, and see why a row returned nothing. The final step can publish only, test on the selected rows, or publish and run across the segment with a credit estimate. It supports auto-enriching new records and recurring re-enrichment; otherwise an enriched field remains a point-in-time result. ([Enrichment in Workflows](https://university.clay.com/docs/enrichment-in-workflows))
5. **Run an always-on account researcher.** Account Research Agents run over an Audience segment and synthesize CRM data, Gong transcripts and signals into typed, agent-managed fields such as closed-lost reason, engagement summary, usage/expansion signal and account health. Clay documents a setup sequence of connect sources → define a segment → describe the agent in plain language → test sample accounts and inspect cost → run. Each field carries the agent’s reasoning; sync back to CRM or a data warehouse is human-approved. ([Account Research Agents](https://university.clay.com/docs/account-research-agents))
6. **Keep the account state current.** An Account Research Agent re-runs on a schedule or trigger, picks up new signals, and maintains persistent per-account context. The docs say a one-time enrichment goes stale, while the agent can update when a Gong transcript, role change or usage event arrives. This is a useful example of incremental reasoning, but it remains a vendor-documented product behavior rather than an independently validated accuracy claim. ([Account Research Agents](https://university.clay.com/docs/account-research-agents))
7. **Enroll only eligible records into a campaign.** Clay’s sequence-readiness page says copy is generated from the Audience data at enrollment and then frozen. The campaign checks segment membership, exclusions and required fields each enrollment run. Workflow enrollment uses a stable Audiences Entity ID; the campaign must be live before an enroll node can queue a lead. ([Get leads ready to sequence](https://university.clay.com/docs/get-leads-ready-to-sequence))
8. **Treat campaign events as data.** Each send, reply, open, click, bounce, unsubscribe and campaign status change becomes a row in a Campaign events table. The event table can trigger a CRM write, enrichment, a reply, a blocklist action or a pause. For example, a positive-reply filter can write only those leads to the CRM; a lead leaving the segment can pause automatically when that setting is enabled. ([Automate campaign events](https://university.clay.com/docs/automate-campaign-events))
9. **Honor opt-out and source revocation.** Clay’s sequence documentation says an unsubscribe link adds the address to the workspace-wide blocklist; plaintext campaigns use the events-table blocklist action or the Blocklist tab. Clay’s Audiences destination docs also state that synced ad audiences add and remove members as the segment changes, and that opt-outs are managed at the source or through an opt-out field in the segment definition. ([Sequencer FAQs](https://university.clay.com/docs/sequencer-faqs-and-best-practices), [Clay Ads](https://university.clay.com/docs/clay-ads))
10. **Control connected-account permissions.** Clay’s Connections view exposes provider, account, status, resources, sharing and owner. OAuth optional scopes allow read-only operation by disabling write scopes, and connection access settings let admins require approval or limit who can configure workflows using a connection. A documented caveat is that these controls apply at configuration time; users may still run already-built workflows. ([Connections](https://university.clay.com/docs/connections), [OAuth optional scopes](https://university.clay.com/docs/oauth-optional-scopes), [Connection access settings](https://university.clay.com/docs/access-settings-for-connections))

#### What is observed, what is inferred

**Observed:** Clay has an unusually clear “import → match → segment → enrich → test → map → run → sync → event/pause/blocklist” path. It distinguishes source-level unique identifiers from cross-source alias matching, makes sparse-record testing explicit, exposes per-row runs and reasoning, and preserves an event table for campaign state. It also documents incremental refresh and human-approved CRM/warehouse write-back.

**Observed:** the matching behavior is deterministic around selected aliases and can merge records on a shared value. The docs warn about the risk of a non-unique identifier. Automatic deduplication and Salesforce Lead-to-Contact merging are product behaviors, not proof that every company/person relationship is correct.

**Observed:** Clay’s event and blocklist mechanisms cover email sequence control. The cited pages do not describe a voice campaign, transcript consent capture, product/service ontology governance, LMS/ERP-specific canonicalization, source-level field ownership conflict UI, or right-to-be-forgotten propagation across every destination.

**Inferred for VyaktiGroupAI:** adopt Clay’s visible lifecycle while keeping identity review stricter for a customer voice cohort. Use a candidate match queue with `accept`, `split`, `defer`, `correct` and `revoke`; never turn an email/domain match into durable reviewed learning without an evidence receipt. Treat a product mapping as a claim with source records and confidence, not as a free-text tag.

#### Strong design implications

- **A founder prompt should produce a data plan.** From “prepare feedback calls for our active LMS customers,” the assistant should propose the likely sources, ask which status means active, ask whether parents and learners are separate people, and explain what it cannot infer before it asks for credentials.
- **Sparse data is a first-class case.** Show the exact missing fields that block matching, product mapping or contact, then suggest a low-cost next step (CSV import, one record review, or a read-only connector).
- **Keep a product/journey map separate from campaign copy.** A customer may use several products, plans or modules; the voice brief should show which product relationship and journey event motivated the invitation, plus evidence.
- **Freeze the invitation snapshot but keep the source current.** Copy may use the enrollment snapshot, while the campaign ledger should still check revocation, unsubscribe, customer status and channel eligibility immediately before any send or call.
- **Make write-back a proposal.** Clay’s own recommendation to leave mapped fields on `Never write` until data quality is validated is a useful default for reviewed learning and CRM updates. ([Audiences](https://university.clay.com/docs/audiences))

### 2. Salesforce Data 360 + Agentforce: identity, reconciliation, consent and grounded release

Salesforce documents the deepest end-to-end data-governance pattern in this set. It is a powerful enterprise reference and a warning: a unified profile is explicitly not a “golden record,” and Salesforce documents that careless contact-point activation can message the wrong person.

#### Concrete documented flow

1. **Ingest either streaming changes or periodic files.** Salesforce’s Ingestion API supports a streaming pattern for incremental updates and a bulk pattern for periodic CSV files; the same data stream can accept both. The streaming API is asynchronous and supports insert/update and delete operations. ([Create an Ingestion API Connection](https://help.salesforce.com/s/articleView?id=xcloud.pfs_ingest_api.htm&language=en_US&type=5), [Streaming Ingestion API](https://developer.salesforce.com/docs/data/data-cloud-int/references/data-cloud-ingestionapi-ref/c360-a-api-streaming-ingestion.html))
2. **Map source records into a common data model.** Data Cloud data streams map external objects into Data Model Objects. Data Libraries automate parts of ingestion, mapping, indexing and retriever creation for knowledge grounding, and expose a status card with links to the underlying Data Cloud objects. ([What Are Data Libraries?](https://help.salesforce.com/s/articleView?id=data_library_concept.htm&language=en_US&type=5))
3. **Build an identity ruleset.** Match rules link source profiles into unified profiles; reconciliation rules select summary values for fields. Salesforce describes unified profiles as a key ring pointing back to source records, rather than a record that overwrites the source systems. Ruleset processing can occur from every 60 minutes to 24 hours depending on source and changes. ([About Identity Resolution](https://help.salesforce.com/s/articleView?id=data.c360_a_identity_resolution.htm&language=en_US&type=5), [Identity Resolution Terminology](https://help.salesforce.com/s/articleView?id=data.c360_a_identity_resolution_terms.htm&language=en_US&type=5))
4. **Keep conflicts and source precedence explicit.** Reconciliation supports `Source Priority`, `Last Updated` and `Most Frequent`, with field-level overrides. Salesforce states that reconciliation does not modify source profiles or tell a team which source to use in every application; it selects the value shown in the unified profile. Contact points are preserved rather than reconciled away. ([Identity Resolution Reconciliation Rules](https://help.salesforce.com/s/articleView?id=sf.c360_a_reconciliation_rules.htm&language=en_US&type=5))
5. **Map the customer journey to contact points and consent.** Data Cloud activation supports filters and sort order on contact-point and consent DMOs. Salesforce gives examples of sending email only to an address with consent, or SMS only to customers with a phone number and consent. ([Add Filters to Contact Points in Activation](https://help.salesforce.com/s/articleView?id=sf.c360_a_contact_point_filtering.htm&language=en_US&type=5), [Contact Point and Activation Membership Filtering](https://help.salesforce.com/s/articleView?id=sf.c360_a_activation_filtering_main.htm&language=en_US&type=5))
6. **Treat unified-individual activation as risky.** Salesforce’s omnichannel guidance warns that unified profiles can change as newly imported data or identity rules change, and can select contact points from different systems or brands. It explicitly says customers are responsible for activating contact points and obtaining consent. ([Omnichannel Considerations and Best Practices](https://help.salesforce.com/s/articleView?id=data.c360_a_omni_best_practices.htm&language=en_US&type=5))
7. **Ground an agent in scoped evidence.** Data Libraries chunk and index documents, fields, transcripts or web content; the runtime query uses a retriever, adds relevant chunks to the prompt, and can produce inline citations. A website grounding guide describes a step sequence of plan ingestion → verify content → create index/retriever → build/test prompt → implement the action in the agent. ([What Are Data Libraries?](https://help.salesforce.com/s/articleView?id=data_library_concept.htm&language=en_US&type=5), [Ground Agentforce on Your Own Website](https://developer.salesforce.com/docs/ai/ground-agentforce-on-website/guide/aes-ground-agentforce-on-website.html))
8. **Test and activate as a versioned change.** The Agentforce documentation in the v4 memo separates simulation from live tests and makes traces, citations, action sequences and latency inspectable. The Data Cloud migration guide also tells operators to create a new agent version, compare conversation-preview answers, activate the new version and then delete the old source only after the migration is confirmed. ([Migrate from Unified Knowledge to a Data Cloud Connector for Agentforce Grounding](https://help.salesforce.com/s/articleView?id=005101390&language=en_US&type=1))

#### What is observed, what is inferred

**Observed:** Salesforce combines source ingestion, data-model mapping, identity matching, field reconciliation, contact-point consent filters, grounded retrieval, citations, versioned agents and source deletion. It documents both streaming and CSV ingestion, which is a useful reminder that a source adapter should not assume one transport format.

**Observed:** the product does not claim that the unified profile is a golden record. Source links remain available, and reconciliation is a summarized view. Salesforce also documents the failure mode in which a unified individual can change and an activation can pick the wrong contact point or context. This is unusually direct evidence that identity and consent must be checked at activation time.

**Observed:** the cited Salesforce pages establish email/SMS/mobile-push activation and Agentforce grounding. They do not establish a product-linked customer voice interview flow, browser voice testing for the target product, an LMS/ERP canonical product ontology, or automatic propagation of a voice participant’s withdrawal through every downstream artifact.

**Inferred for VyaktiGroupAI:** retain source-specific records and immutable links under every canonical customer, product and journey object. A “unified customer” should be a navigational view with match evidence, not a destructive merge. A campaign must re-evaluate consent and revocation on the exact contact point immediately before invitation and before call start. Product mapping should use a source-priority rule only for display; the evidence drawer should show all contributing records and conflicting values.

#### Strong design implications

- **Show a key ring, not a single golden card.** The founder should see “these three records may be the same person,” with the match rule, source IDs and what would change if accepted.
- **Keep contact point and person context coupled.** If a work email came from the CRM but the preferred name came from an LMS, make that combination visible before a voice invite. The system should refuse to silently blend brand, role, product and consent contexts.
- **Consent is a run-time gate.** A source record saying `opted in` is not sufficient if a later revocation event has not been ingested. Show last consent event, source, channel, freshness and revocation lag.
- **Use typed journey events.** `enrolled`, `invited`, `booked`, `completed`, `declined`, `revoked`, `transcript_available`, `insight_reviewed`, `change_approved` and `released` should be separate events. Do not collapse a phone disconnect, answer, handoff or sentiment score into “feedback received.”
- **Borrow the migration pattern.** Every approved learning change should produce a new agent/product voice version, a test set and a compare view before release; the previous version remains rollbackable.

### 3. Glean: permission-aware company knowledge with incremental currentness

Glean is the strongest reference for turning many sources into a permission-aware company brain. It is not a documented customer-feedback campaign tool. Its value here is the operating model for source scope, identity/permissions, incremental changes, deletions and evidence links.

#### Concrete documented flow

1. **Connect the source and validate permissions.** Glean’s setup begins in Admin Console → Data sources → Add app. Connector setup is typically OAuth or an app-store installation; credentials and permissions are validated. For each asset Glean crawls content, access permissions and activity metadata. The docs warn that missing API permissions can cause a crawl failure or missing data. ([Connect Data Sources](https://docs.glean.com/get-started/setup/connect-data-sources))
2. **Crawl, index and monitor.** Glean’s crawling strategy separates full content crawls, incremental crawls, identity crawls and activity crawls. It monitors create, update, delete and permission-change events, using webhooks where available and polling where necessary. The page documents that deletion notifications remove content immediately when the source provides them; otherwise full-crawl cleanup removes stale content. ([Crawling Strategy](https://docs.glean.com/connectors/crawling-frequency))
3. **Keep source permissions attached.** The HubSpot connector documents incremental updates and create/update/delete/restore/association webhooks, object-level permissions and identity metadata. The Salesforce connector mirrors record-level sharing, role hierarchy, sharing rules and manual shares; it also notes that some deleted share records require a regular full scan because the Salesforce API does not expose them incrementally. ([Glean HubSpot connector](https://docs.glean.com/connectors/native/hubspot/home), [Glean Salesforce connector](https://docs.glean.com/connectors/native/salesforce/about))
4. **Handle source-specific revocation lag.** Glean’s SharePoint permissions docs say permission-only events may be near real time when elevated scopes are available, but can fall back to a 24-hour incremental crawl without them. This is a useful real-world example that an integration can be connected and healthy while access revocation remains delayed. ([About SharePoint connector permissions](https://docs.glean.com/connectors/native/sharepoint/security/permissions))
5. **Add proprietary data through a custom connector.** Glean custom connectors can push documents, metadata and permissions through the indexing API, and can support APIs, file types, permission models, incremental updates, scheduling, error handling and logging. This is the closest official example to bringing a manual messy export or a niche ERP/LMS into a governed index, but it requires connector engineering and careful permission metadata. ([Custom data sources](https://docs.glean.com/connectors/custom/about))
6. **Retrieve with citations and access checks.** Glean’s documented Chat/Assistant model uses indexed, live or hybrid retrieval, and citations/deep links can show the source passage. Citations do not grant access; retrieval is filtered by the signed-in user’s source permissions. ([How connectors power the Glean experience](https://docs.glean.com/connectors/connectors-power-glean), [Glean citations](https://docs.glean.com/user-guide/assistant/glean-chat/glean-chat-citations/glean-citations))
7. **Operate the connector as a product object.** Glean exposes items synced, crawl/change rates, test visibility and health/alerts. Its FAQ describes change rate as a heartbeat that includes edits, permission changes and deletes, and warns that a flatline can indicate webhook/auth/scope problems before item counts change. ([Crawling FAQ](https://docs.glean.com/connectors/crawling-faq))

#### What is observed, what is inferred

**Observed:** Glean treats source currentness and permissions as operational state. It has distinct content, identity, activity and permission paths; supports webhooks/polling/incremental/full crawls; and has documented deletion and revocation limitations. Its permission-aware citations and custom connector model are directly relevant to a company brain.

**Observed:** Glean’s docs describe identity alignment and permission mapping but do not establish a universally correct entity-resolution algorithm, a founder interview workflow, product-to-journey mapping, campaign unsubscribe logic or a voice feedback loop. The source itself can be fresh while a particular claim remains stale or inaccessible after a permission change.

**Inferred for VyaktiGroupAI:** every evidence claim should retain `source_id`, source revision, retrieved-at time, ACL decision, freshness threshold and deletion/revocation state. The app should let a founder see “this source is connected but this claim is stale” and should block an action when source permissions or deletion propagation are unknown.

#### Strong design implications

- **Use a source state machine.** `discovered → permission_requested → connected → crawling → indexing → test-visible → ready → stale → revoked/error` is more honest than `Connected`.
- **Make revocation observable.** Display “source says deleted at 14:02; local claim purge pending” and suppress the claim from new answers immediately when required by policy.
- **Keep ACL evidence with the citation.** A citation drawer should say why the founder is allowed to see this source and what audience may use it in a campaign.
- **Use source heartbeat metrics.** Counts, change rate, error rate and permission-check time are visual evidence that the brain is alive; they are not a quality score.
- **Use custom connectors only when the mapping contract is clear.** An ERP/LMS adapter must send product identifiers, customer/person IDs, event timestamps and permission/consent metadata, not only a text blob.

## Bounded supporting cases

### HubSpot Breeze: context selection, typed extraction and a useful “test one record” control

HubSpot is a strong reference for minimal operator work inside a CRM, especially where the founder wants to ask a question in plain language and then turn the result into a typed workflow field.

**Documented flow:**

1. Breeze Assistant can use HubSpot records, connected apps, files and saved memories, and can show citations that link to the source record/app/memory. User permissions determine available actions. ([Use Breeze Assistant](https://knowledge.hubspot.com/ai/use-breeze-assistant?promo=hubspot-website-banner))
2. Connected apps are installed and permissioned separately. HubSpot documents an explicit connect → sign in → review permissions → allow flow, and says uninstalling an app prevents Breeze from using it. ([Connect apps to Breeze Assistant](https://knowledge.hubspot.com/integrations/connect-apps-to-breeze-assistant), [Search connected apps](https://knowledge.hubspot.com/ai-tools/use-breeze-assistant-with-connected-apps?app=1))
3. In a workflow, Data Agent Custom prompt requires the operator to select the properties/associated-record fields to include; it does not automatically include the whole record timeline or emails. Data Agent Research can use property data or the five most recent associated call transcripts and returns a String, Number or Boolean. ([Use Breeze to manage data in workflows](https://knowledge.hubspot.com/workflows/use-ai-to-manage-data-in-workflows?app=1))
4. The action can be tested on a selected record, branched on, written to an enrolled/associated record, or used in an email token. Insufficient credits can fail the action and produce null values. The docs also say the Custom prompt model is not internet-connected. ([Use Breeze to manage data in workflows](https://knowledge.hubspot.com/workflows/use-ai-to-manage-data-in-workflows))
5. Breeze Assistant can create a custom agent from a natural-language goal, propose tools and knowledge sources, and ask clarifying questions before handing the configuration to Agent Builder for review/testing. ([Build agents with Breeze Assistant](https://knowledge.hubspot.com/ai/create-agents-with-breeze-assistant))

**Inferred product use:** borrow the “selected context → test selected customer → typed result → branch/propose write” shape. It is a good antidote to hidden context and manual setup. A VyaktiGroupAI founder prompt should show the planned input fields and ask a question when a product, customer status or consent field is missing. The product should preserve the context receipt so the founder can see that a transcript was excluded because it was not selected or not permitted.

**Boundaries:** the cited Breeze material does not establish a cross-system canonical identity model, source-owned field conflict resolution, ERP/LMS-specific data adapters, an unsubscribe/revocation contract across channels, or a product-linked voice feedback loop.

### Intercom Fin: AI-drafted procedures, audience-scoped connectors and voice testing

Intercom is the best supporting reference for turning a plain-English customer process into a controlled procedure and for connecting that procedure to a phone workflow. It is a support-agent pattern; the docs do not establish an independent product-learning system.

**Documented flow:**

1. Fin can generate a Procedure draft from a natural-language description using help-center content, data connectors and historical conversations. The operator reviews and iterates; the page describes clarifying questions during draft creation. ([Quick start: Create a Fin Procedure](https://www.intercom.com/help/en/articles/12599391-quick-start-create-a-fin-procedure))
2. Data connectors can be automatically triggered or manually invoked from a workflow/procedure/macro. They can be restricted to a Fin audience, including a verified-email or plan-based audience, and can be enabled for the founder or teammates first using audience rules. A connector’s live behavior stays on the prior version until the draft is published. ([Set up Data connectors](https://www.intercom.com/help/en/articles/9916497-how-to-set-up-data-connectors))
3. Fin audiences can constrain content, guidance, escalation, data connectors, tasks and workflows. Batch testing can test as a chosen audience. ([Manage audiences for Fin and Copilot](https://www.intercom.com/help/en/articles/9357948-manage-audiences-for-fin-and-copilot))
4. Fin Voice can be tested in a browser and deployed to a phone line or workflow. Live calls appear in the Inbox with transcripts; monitoring exposes resolution, involvement and call duration. ([Deploy Fin Voice](https://www.intercom.com/help/en/articles/10697275-deploy-fin-voice))
5. The Voice Playground intentionally ignores audience rules, while live calls enforce them. Preview conversations do not create billable outcomes, but a Voice Outcome is defined as a person asking a question, receiving at least one answer and then disconnecting; that is a billing definition, not proof of learning or customer success. ([Fin Voice FAQs](https://www.intercom.com/help/en/articles/16248514-fin-voice-faqs))
6. Voice Procedures in closed beta support a plain-English outcome, collected information and end condition, then preview, simulations and a real call. The docs recommend isolating the procedure with audience rules to avoid overlapping procedures. ([Use Procedures over Fin Voice](https://www.intercom.com/help/en/articles/16527239-use-procedures-over-fin-voice-beta))

**Inferred product use:** borrow “describe outcome → AI drafts procedure → founder reviews → audience-limited test → real conversation → transcript → reviewed change.” Make the test context warning impossible to miss: a playground that ignores audience restrictions must not be presented as production evidence. Preserve a separate business-outcome ledger so `answered`, `handoff`, `completed interview`, `insight accepted` and `product change approved` do not become a single “resolution” metric.

**Boundaries:** the cited Intercom pages establish audience and runtime identity context, but not a canonical multi-system person/company merge, source-field ownership, ERP/LMS ingestion, or a reviewed product ontology. Voice availability is also region/plan/beta constrained in the docs.

## What the cases say about ERP, LMS, CRM, email and messy manual data

The products use different transport and governance models. A robust company workflow should therefore ask “what can this source export and what permissions can it prove?” rather than assume one integration shape.

| Source situation | Documented reference pattern | Design implication |
|---|---|---|
| CRM with OAuth/API and webhooks | HubSpot connected apps; Clay Salesforce/HubSpot Audiences; Glean HubSpot connector | Show requested scopes, connection owner, write/read split, webhook health and object/association coverage. |
| ERP or LMS with a REST API | Salesforce streaming Ingestion API; Glean custom connector model | Require a mapping contract for people/accounts, products/services, enrollment/order/subscription events, timestamps, source IDs and deletion/permission events. |
| Periodic exports | Salesforce bulk/CSV ingestion; Clay CSV import; Glean custom/push connector | Make file provenance, import date, schema/version, duplicate handling and replace-vs-merge behavior explicit. A CSV is a source snapshot, not a live truth. |
| Email and calendar | Breeze connected apps; Glean connectors; product-specific source permissions | Treat message bodies, headers, participants and attachments as separate sensitive classes. Use source ACL and founder-approved scope; do not infer consent from a sent email. |
| Manual spreadsheet or messy upload | Clay field mapping and sparse-record testing; custom connector/indexing pattern | Offer an AI-assisted mapping preview with a few sample rows, unresolved columns, data-quality warnings and a reversible import. |
| Deleted or revoked source data | Glean deletion and permission-change crawls; Salesforce delete ingestion; Clay blocklist/source segment changes | Track revocation events and propagation status; suppress affected claims and campaign actions while purge/access reconciliation is pending. |

**Observed:** these products document OAuth, APIs, webhooks, incremental streams, periodic CSV/bulk loads and manual mapping in different combinations.  
**Inferred:** VyaktiGroupAI should support those shapes behind one plain-English import task, with the same normalized review artifacts. It should not force a founder to understand every adapter’s schema before seeing a useful preview.

## Cross-product task benchmarks

These are design benchmarks derived from the documented workflows, not claims that any product passes them in all tenants.

| Task benchmark | Evidence to render | Pass condition for the target product |
|---|---|---|
| Guided company discovery | Founder goal, proposed sources, clarifying questions, unanswered assumptions | A useful first plan appears without requiring a 30-field setup form; ambiguity is explicit. |
| Source connection | OAuth/API/file method, scopes, owner, source object coverage and last sync | Founder can see what is connected, what is unavailable and why. |
| Messy import | Sample rows, mapped fields, missing IDs, duplicate candidates, schema/version | No record is silently merged or overwritten without a visible rule and undo/review path. |
| Entity resolution | Source IDs, match key, confidence, conflicts, accepted/rejected history | Ambiguous person/company/product joins become review work, not hidden durable memory. |
| Product/service mapping | Product identifier, plan/module/order/enrollment source, journey event, evidence | Voice invitation names the product relationship that the source actually supports. |
| Incremental updates | Last successful event, source revision, freshness threshold, deletion/revocation lag | A stale or revoked source cannot quietly qualify a person for outreach. |
| Consent and unsubscribe | Contact point, consent record, channel, audience, opt-out source/time, blocklist state | Opt-out stops future actions across campaign paths; a later source update cannot accidentally re-enable it. |
| Voice campaign | Cohort rule, consent, invitation snapshot, product context, booking/call status | Founder can preview exactly who will be contacted and why, then pause or revoke. |
| Feedback evidence | Transcript excerpt, speaker/customer, timestamp, product/journey link, counter-evidence | Every proposed theme has inspectable support and an uncertainty state. |
| Reviewed learning | Founder decision, accepted/edit/rejected claim, reviewer, source revision | Learning becomes durable only after a human decision with a receipt. |
| Approved evolution | Change proposal, version diff, test fixtures, estimated cost, rollback | New voice/product behavior is a versioned release with a measurable follow-up. |

## Failure matrix

| Failure | How the cited products expose it | Product behavior to adopt |
|---|---|---|
| Duplicate person merged on a shared email/domain | Clay warns that a chosen identifier merges all matching records; Salesforce warns unified-individual context can change | Show match rule and all source records; require review for ambiguous or high-impact joins; support split/revoke. |
| Source connected but crawl/index incomplete | Glean separates crawling/indexing and exposes item/change rates; HubSpot app must be installed and permissioned | Use `connected`, `syncing`, `ready`, `stale`, `error`, `revoked` states with owner and next action. |
| Permission revocation delayed | Glean documents connector-specific deletion/permission lag; Salesforce share records may require full scans | Attach access decision and revocation deadline to each claim; suppress on uncertain access. |
| Source value conflicts with CRM/ERP/LMS value | Salesforce reconciliation offers source priority/last-updated/most-frequent but says it is not a universal winning value; Clay warns about CRM overwrite | Preserve source values and field ownership; proposed canonical display value must show rule and alternatives. |
| CSV snapshot is mistaken for current truth | Salesforce distinguishes bulk periodic files from streaming; Clay recurring enrichment is needed for freshness | Show snapshot timestamp and freshness expiry; ask whether the file replaces, upserts or appends. |
| Enrichment runs on sparse records and returns generic output | Clay guided workflow explicitly recommends testing thin records and shows why a step returned nothing; Clay account-agent docs warn thin account records produce generic output | Render missing prerequisites before spending credits; allow single-record test and no-op outcome. |
| Voice playground leaks audience-ineligible content | Intercom says Voice Playground ignores audience rules | Label test context loudly and require production-audience simulation before release. |
| Unsubscribe or withdrawal is missed | Clay workspace blocklist/event model; Salesforce contact-point consent filtering | Check revocation at enrollment, send/call start and handoff; maintain one durable opt-out ledger with source/time. |
| “Resolution” is treated as customer learning | Intercom defines Voice Outcome as answer + disconnect; campaign metrics elsewhere include sends/replies/unsubscribes | Keep operational/billing outcome, conversation outcome, insight review and business impact as separate events. |
| Agent uses hidden context or wrong record slice | HubSpot Custom prompt only includes selected properties; Research uses five latest call transcripts | Render exact selected context, exclusions and source versions before run. |
| Change proposal writes too early | HubSpot can branch/update records; Clay recommends `Never write` until quality is validated; Salesforce separates simulation/live | Default to propose/test/approve; use idempotency and reversible writes. |
| Product map overfits a free-text mention | None of the reviewed products establishes a universal product ontology | Keep product/service IDs and aliases with evidence; ask the founder when a mention could refer to multiple offerings. |
| Context mixes brands or customer roles | Salesforce omnichannel guidance documents contact points and attributes coming from different systems/brands | Bind product, brand, role, contact point, consent and journey to the same campaign context; flag cross-brand blends. |

## Minimal operator UX for the target product

The research points to five screens or drawers, each with a visual proof of state. They can sit inside the current Build / Operate / Improve surfaces; there is no need to add a second generic CRM navigation.

1. **Company discovery brief.** The founder types the outcome in plain English. The assistant responds with a one-screen plan: likely sources, entities, products/journeys, missing decisions and a short list of clarifying questions. Each question has a reason (“needed to distinguish learner from billing contact”) and a suggested answer, with `skip` available.
2. **Source health and import preview.** A source card shows OAuth/API/file/webhook, owner, scopes, object/column coverage, sample records, last update, item/change count, errors, deletion/revocation status and a visual freshness bar. A CSV card says “snapshot from 22 Sep, 09:30” instead of pretending it is live.
3. **Entity and product review drawer.** For every proposed person/company/product/journey link, show source IDs, matching keys, conflicting fields, last-seen times, audience/permission scope and merge consequences. Actions are accept, split, defer, correct and revoke. Product mapping includes a product/service identifier, plan/module/order/enrollment evidence and customer journey event.
4. **Journey and voice campaign ledger.** A compact flow displays `eligible → consent checked → invited → booked → completed → transcript → insight review → change proposal → customer follow-up`. Each customer row opens the evidence and shows product context, channel, owner, stop reason, unsubscribe/revocation and agent/version. Before launch, display the exact cohort, invitation snapshot, cost estimate and stop rules.
5. **Evidence-to-evolution review.** The founder sees a proposed claim or theme beside transcript excerpts, source metadata, coverage, counter-evidence and affected products. `Accept`, `edit`, `reject`, `ask follow-up`, `create work item` and `propose product/voice change` are explicit decisions. A release drawer compares old/new instructions, test conversations, consent coverage, budget and rollback target.

## What should remain explicit or out of scope

- This research does not establish a universal canonical identity merge algorithm. The safest target is source-linked identity with reviewable match evidence.
- It does not establish that any competitor turns LMS/ERP/CRM/email/manual data into a correct product ontology without configuration. Support those sources through adapters and an import contract.
- It does not establish that the reviewed products deliver a complete voice-feedback-to-approved-product-evolution loop. Clay and Glean have no cited voice loop; HubSpot’s cited workflow is record/transcript based; Intercom’s voice flow is support-oriented; Salesforce’s cited voice evidence is limited or evolving.
- It does not establish independent quality, recall, precision, sentiment accuracy, entity-match accuracy, business impact or cost efficiency for any vendor.
- Voice and external customer delivery remain gated by consent, source permissions, channel availability, capacity, spend limits and explicit founder approval.

The smallest credible pilot is one served-customer cohort, one reviewed product relationship per customer, one consented browser voice conversation, one transcript with source evidence, one founder-reviewed insight, one owned change proposal, one separately approved customer follow-up and one measured post-change outcome. The product should make that proof visible from the first connection to the final release.

