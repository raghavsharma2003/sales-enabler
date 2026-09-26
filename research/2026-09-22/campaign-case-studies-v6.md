# Voice campaign case studies v6: the governed multi-product journey

**Research date:** 2026-09-22 (Asia/Kolkata)  
**Scope:** current public first-party documentation for Vapi, ElevenLabs Agents, Bolna and Retell. This is a workflow case study, not a feature catalogue. No account, authenticated dashboard, phone number, upload, live call or provider credential was used.

## Evidence boundary

Every statement is tagged:

- **[D] Documented:** the cited public page specifies the operator action, object, field or state.
- **[I] Inferred:** a practical operating consequence of documented behavior; it is not a vendor promise.
- **[U] Unknown:** the reviewed public pages do not establish the behavior. Unknown does not mean the product cannot do it.

## One case used across all four products

Northstar is a B2B software company with three products:

1. **Northstar Core** — CRM and account records.
2. **Northstar Pulse** — customer analytics and reporting.
3. **Northstar Flow** — workflow automation.

The Customer Success team wants a quarterly voice campaign to 600 accounts. The call has two linked goals: (a) collect product feedback on the product the contact actually uses and (b) qualify interest in a paid expansion. It must be relational: acknowledge the account history, ask which of Core, Pulse and Flow matter to the contact, follow the answer, and offer a human follow-up when the contact reports a severe issue or buying intent.

The upstream organization data is deliberately messy: CRM account/contact rows, ERP subscription and renewal rows, LMS training completion, email summaries, product-usage exports, and a manually maintained account-owner sheet. The desired internal path is:

`raw sources → normalized signals/columns → identity review → explicit product + goal → audience eligibility → natural voice campaign → per-contact outcomes/retries/stop → product and customer analytics → tested approval → agent learning`

The four vendors document the voice runtime and parts of campaign control. The end-to-end raw-source-to-reviewed-audience path is **[U]** for all four in the pages reviewed. Treat the scenario below as an operator walkthrough grounded in the documented campaign primitives, with the missing organization-control steps called out explicitly.

## Cross-product journey table

| Journey stage and required artifact | Vapi | ElevenLabs Agents | Bolna | Retell |
|---|---|---|---|---|
| Raw LMS/ERP/CRM/email/manual data becomes reviewed signals and columns | **[U]** Public campaign pages document CSV rows and dynamic variables, not ingestion or identity resolution. | **[U]** Batch pages document CSV/XLS recipients and dynamic variables, not organization-source ingestion. | **[U]** Batch pages document a CSV and pass-through variables, not source joining. | **[U]** Batch pages document CSV variables; Contacts can hold fields, but source reconciliation is not established. |
| Choose product and goal explicitly | **[D]** Select one assistant or squad; pass `product`, `goal`, `account_tier`, `renewal_date` as variables. **[I]** Product/goal review must happen in Northstar before launch because Vapi accepts arbitrary variables. | **[D]** Select an agent; dynamic variables and per-recipient overrides can carry product and goal. **[I]** Build separate agent branch/configuration when product logic materially differs. | **[D]** Select an agent; custom CSV columns become context. **[I]** Graph/router nodes can branch by product, but product validity must be enforced upstream. | **[D]** Select agent/version and pass dynamic variables or metadata. **[I]** Contact fields can persist product context between calls, but the batch itself does not document product-goal review. |
| Eligibility and consent review | **[D]** Optional blocking pre-dial eligibility webhook; schedule has timezone and calling window. **[I]** Use it for consent, suppression, stale renewal and owner checks. | **[D]** Docs warn about TCPA/state compliance; no campaign pre-dial eligibility object in the reviewed pages. **[I]** Enforce consent in Northstar before submitting the batch. | **[D]** Call settings document timing restrictions; CSV validates only the phone column and passes other fields through. **[I]** Consent/DNC must be a Northstar gate. | **[D]** Contacts expose a Do Not Call field and batch has a time window. **[I]** Treat DNC as a hard eligibility filter and retain evidence outside the batch. |
| Configure a natural relational voice flow | **[D]** Assistant/squad prompt, dynamic variables, knowledge and handoff/transfer tools. | **[D]** Agent workflow, tools, knowledge, transfer and first-message settings; agent version captures the bundle. | **[D]** Agent/graph, node-level prompts/tools/RAG, transfer and multilingual call settings. | **[D]** Single/multi-prompt or flow agent, dynamic variables, tools, transfer and contact context. |
| Review data and test before launch | **[D]** Campaign preview shows name/phone; extra columns still reach the assistant; campaign can be monitored after launch. Evals/simulations exist but are outside selected campaign pages. **[I]** Need an external reviewed-column artifact. | **[D]** Single-recipient test call before batch; simulation/next-reply/tool tests and versioning. | **[D]** Batch preview reports parsed/valid phone rows; graph save is blocked on structural errors; extraction templates can be tested. | **[D]** Draft batch is editable; LLM Playground, simulation, web and phone tests cover different layers. |
| Launch/schedule/capacity | **[D]** Send now or schedule up to seven days; max concurrency shares org capacity; no saved draft. | **[D]** Immediate or scheduled batch; a target concurrency limit can be supplied; docs describe workspace/agent capacity limits. | **[D]** Run now or schedule; dashboard/API creates a batch; concurrency/telephony are provider-dependent. | **[D]** Save as draft, send now or schedule; reserve capacity for other calls; batch allocation is visible. |
| Per-contact artifact and live state | **[D]** Each row has pending/dispatched/completed/failed/skipped/pre-dial-failed and call ID, ended reason, duration, cost when dialed. | **[D]** Batch object returns counts/status and recipient records; post-call webhook includes transcript, analysis, metadata, dynamic variables and version ID. | **[D]** Webhook/execution data includes status, transcript, extracted data and cost; list executions is available. | **[D]** Batch metrics and individual call IDs/details; metadata can correlate to CRM; contact timeline persists conversations. |
| Failure, retry, pause/stop | **[D]** Calling window ends retries; cancel removes calls not started; in-progress calls finish; duplicate to rerun. **[U]** No pause state. | **[D]** Cancel sets recipients cancelled; retry targets failed/no-response recipients; webhook retries and auto-disable are documented. **[U]** No documented pause state or campaign-level deduplication. | **[D]** Auto-retry can target no-answer, busy, failed, error or voicemail, up to three attempts; Stop is a dashboard action. **[U]** Pause semantics and deduplication are not established. | **[D]** Draft is editable; live call can be taken over or ended. **[U]** Batch pause, batch retry policy and batch cancel behavior are not established in the reviewed page. |
| Product/customer analytics | **[D]** Campaign result, transcript, recording, analysis and cost; external webhooks can feed analytics. | **[D]** Analysis supports success evaluation, data collection and sentiment; post-call webhooks carry the evidence. | **[D]** Extraction categories support handover, lead qualification and sentiment; webhook carries execution/cost. | **[D]** Contacts, post-call fields, batch metrics, live trace, analytics and AI QA; A/B results filter by agent/version. |
| Tested approval and learning loop | **[D]** Separate eval/simulation/scorecard surfaces exist. **[I]** Northstar needs a release gate tying campaign cohort, prompt/knowledge version and reviewer approval together. | **[D]** Tests can be created from failed conversations; branches/versions and traffic splits support experiments; analysis feeds post-call data. | **[D]** Graph validation blocks structural errors; extraction tests exist. **[U]** Public pages do not establish a full regression suite or approval gate. | **[D]** Simulation batch tests, web/phone audio tests, A/B tests and AI QA; live takeover creates a reviewable incident. |

## Case study 1 — Vapi: explicit campaign objects and pre-dial control

### Operator walkthrough for Northstar

1. **Prepare the reviewed audience outside Vapi [I].** Northstar joins the CRM, ERP, LMS, email and manual owner data into one row per person. The review artifact must contain `customer_id`, normalized phone, consent basis/expiry, product (`core|pulse|flow`), campaign goal (`feedback_and_expansion`), account owner, renewal date, last product signal, language, timezone and suppression reason. Vapi’s public pages establish the row/variable mechanism, not this upstream join.
2. **Create the caller [D].** In Vapi, choose one assistant or Squad, outbound-capable phone number, and voicemail behavior. The campaign overview says the four parts are caller, phone number, contacts and schedule; the campaign can use an assistant or squad. [Campaigns overview](https://docs.vapi.ai/outbound-campaigns/overview)
3. **Encode the relational flow [I].** The system prompt can use `{{name}}`, `{{product}}`, `{{renewal_date}}` and `{{account_owner}}`; the assistant should open with the product-specific history, ask whether the stated product is still the priority, and hand off if the contact requests a specialist. This is a design inference from documented dynamic variables and handoff tools, not a claim that Vapi generates the relationship logic for Northstar.
4. **Upload and inspect contacts [D].** The required lowercase `number` column, optional `name`, and additional columns become dynamic variables. Vapi documents up to 10,000 rows and a 5 MB Dashboard CSV limit. Empty cells are omitted, headers are case-sensitive, and combined variables must stay below 100,000 characters per contact. [Campaign contact data](https://docs.vapi.ai/outbound-campaigns/contact-data)
5. **Run eligibility immediately before dialing [D/I].** Configure the optional blocking `campaign.predial` check to verify Northstar consent, DNC, timezone, stale identity and product/goal completeness. Vapi documents pre-dial failure as a contact state, but the reviewed pages do not define Northstar’s payload schema or identity policy. The exact suppression reason should remain in Northstar even when Vapi only records `pre-dial failed`.
6. **Schedule and launch [D].** Choose Send now or a timezone-aware window (up to seven days ahead), set max concurrency, review and launch. Vapi has no saved campaign draft: creation immediately launches or schedules, and the configuration becomes read-only. [Campaign scheduling and lifecycle](https://docs.vapi.ai/outbound-campaigns/scheduling-and-lifecycle)
7. **Handle voicemail and monitor [D].** Configure either the assistant-driven voicemail tool or provider-based automatic detection, not both. The result table exposes each contact’s state, call ID, end reason, duration and cost; call records expose transcript, recording and analysis. [Campaign voicemail and call screening](https://docs.vapi.ai/outbound-campaigns/voicemail-and-call-screening)
8. **Stop or rerun [D].** Cancel removes calls that have not started; in-progress calls finish. A changed audience, prompt or schedule requires duplicating the campaign, reviewing the copied rows and launching the duplicate. There is no documented pause state, and no public campaign deduplication rule; Northstar should therefore issue an idempotency key and block a second active campaign for the same cohort [I].

### What the artifact looks like

`Campaign C-2026-Q3-feedback` → assistant/squad ID + published version, phone number, schedule/timezone, max concurrency, CSV hash, cohort query/hash, pre-dial policy version, consent evidence location, and per-row terminal state. The Vapi row is useful for telephony state; Northstar still owns source lineage, identity decision, consent basis, product/goal choice and reviewer approval [I].

### Edge cases in this case

| Edge case | Vapi-supported handling | Evidence status |
|---|---|---|
| Missing goal | Campaign can carry a blank/missing dynamic variable; the public pages do not document a goal-required validator. Block in Northstar or route to review. | **[U]/[I]** |
| Multiple products | Pass product columns; use assistant/Squad logic and handoffs. No documented multi-product audience resolver. | **[D]/[I]** |
| Invalid data | CSV validates/normalizes phone formatting and enforces header/size rules; other business fields are not semantically validated. | **[D]** |
| No consent | Pre-dial webhook can block the contact, but consent data model is external. | **[D]/[I]** |
| No answer / telephony failure | Per-contact failed or pre-dial-failed states and call end reason are visible; retry behavior is bounded by the calling window. | **[D]** |
| Voicemail | Use exactly one documented voicemail approach; ambiguous transcript cues can leave the assistant waiting until timeout. | **[D]** |
| Duplicate call | Duplicate campaign is the documented rerun mechanism; duplicate-row suppression is not documented. | **[D]/[U]** |
| Interruption | Runtime agent settings can handle voice behavior, but selected campaign pages do not establish a campaign interruption test. | **[U]** |
| A/B test | Campaign pages do not establish a campaign-level traffic split. Use Northstar cohort assignment or separate campaigns with an external assignment ledger. | **[U]/[I]** |
| Evaluation | Vapi has separate Evals/simulations/scorecards in its docs, but they are not part of the campaign object. Store test and approval IDs in Northstar. | **[D]/[I]** |

## Case study 2 — ElevenLabs Agents: batch calls plus versioned experiments

### Operator walkthrough for Northstar

1. **Prepare the same reviewed audience [I].** Use a CSV/XLS with `phone_number`, `customer_id`, `product`, `goal`, `name`, `renewal_date`, `account_owner` and a consent decision. The batch page documents recipient files and dynamic variables, not Northstar’s source merge or consent registry.
2. **Build and version the agent [D].** Create the relational agent with prompt, knowledge, tools, first message, language and turn behavior. Enable versioning only after the team accepts that it cannot be disabled; versions are immutable snapshots containing conversation configuration, platform settings and workflow. [Agent versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning)
3. **Test the product branches [D].** Write simulation tests for Core, Pulse and Flow; add a missing-product case, a severe-feedback escalation case and a duplicate-product-history case. ElevenLabs supports Simulation, Next Reply and Tool Call tests; simulations can inject dynamic variables, use partial chat history, and mock selected tools, but system/workflow tools are never mocked. [Agent testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing)
4. **Test one recipient and submit the batch [D].** The Batch Calling page documents CSV/XLS upload, dynamic variables, optional language/first-message/system-prompt/voice overrides, a single-recipient Test call, immediate or scheduled send, and per-recipient monitoring. Overrides fail if the agent’s security settings do not allow them. [Batch calling](https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls)
5. **Control capacity [D].** The API supports `target_concurrency_limit`; the batch result tracks dispatched, scheduled and finished counts. Northstar should reserve a capacity budget and keep the cohort small until the relational flow passes tests [I].
6. **Run a controlled experiment [D].** Versioned branches can split traffic by percentage; traffic percentages must total 100% and are deterministically routed by conversation ID. Experiments can compare prompts, workflows, voice, tools, knowledge, LLM or evaluation criteria. [Experiments](https://elevenlabs.io/docs/eleven-agents/operate/experiments)
7. **Capture outcomes [D].** Configure success evaluation, data collection and sentiment. Post-call transcription webhooks include transcript, analysis, metadata, dynamic variables and `version_id`; call-initiation-failure webhooks expose `busy`, `no-answer` or `unknown`. Webhooks can be retried and auto-disable after repeated failures, so Northstar must alert on delivery health. [Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)
8. **Cancel/retry [D].** Cancel sets all recipients to cancelled; retry calls failed and no-response recipients again. The selected pages do not establish deduplication, consent preflight, pause, or a retry-attempt cap for the batch. Northstar should keep an attempt ledger and only resubmit eligible rows [I].

### Edge cases in this case

| Edge case | ElevenLabs-supported handling | Evidence status |
|---|---|---|
| Missing goal | A dynamic variable can be omitted, but required-field behavior for `goal` is not documented. Gate in Northstar or fail the row before submit. | **[U]/[I]** |
| Multiple products | One agent can use a product variable; branches can change workflow/knowledge. No documented product-specific audience resolver. | **[D]/[I]** |
| Invalid data | `phone_number` is mandatory; override columns can cause batch failure if not allowed. Other semantic data validation is not established. | **[D]/[U]** |
| No consent | Docs warn operators to comply with TCPA/state laws; no reviewed batch page provides consent suppression/preflight. | **[D]/[U]** |
| No answer / failure | Failure webhook provides busy/no-answer/unknown; retry endpoint targets failed/no-response recipients. | **[D]** |
| Voicemail | Batch API exposes telephony machine-detection configuration; the reviewed batch page does not specify a Northstar voicemail disposition. | **[D]/[U]** |
| Duplicate call | Retry is a provider batch action, but duplicate-row or idempotency semantics are not documented. | **[U]** |
| Interruption | Agent configuration includes interruption settings and audio testing is documented elsewhere; selected pages do not prove quality for Northstar’s language/cohort. | **[D]/[U]** |
| A/B test | Version branches and deterministic traffic split are documented; batch-level randomization and cross-product cohort balance are not. | **[D]/[I]** |
| Evaluation | Simulation/Next Reply/Tool Call tests, success evaluation, data collection and version IDs provide a documented test-to-outcome chain. | **[D]** |

## Case study 3 — Bolna: batch retries, graph validation and extraction

### Operator walkthrough for Northstar

1. **Prepare the reviewed audience [I].** Create one CSV row per identity with `contact_number`, `customer_id`, `product`, `goal`, consent status, preferred language and relevant account signals. Bolna validates the phone column; every other column passes through without validation, so the review gate cannot be delegated to the upload.
2. **Build a graph agent [D].** Use a graph with a product router, product-specific feedback nodes, expansion qualification, human transfer and end node. Graph validation blocks no nodes, missing/duplicate IDs, missing start, missing transition targets, unreachable tools and malformed conditions; warnings such as empty prompts or unreachable nodes can be acknowledged. [Graph validation](https://www.bolna.ai/docs/graph-agent/validation)
3. **Configure voice behavior [D].** Bolna’s call settings document voicemail detection, auto-reschedule, DTMF, timeouts and outbound timing restrictions. Product/goal values should enter as variables, while node prompts ask follow-up questions naturally [I].
4. **Upload and schedule [D].** The dashboard supports CSV upload, phone-number selection, Run Now/Schedule, webhook URL and Auto-retry. The CSV requires E.164 `contact_number`; custom variables are passed as-is. [Batch calling](https://www.bolna.ai/docs/outbound/batch-calling)
5. **Set retry rules [D].** Auto-retry can target No Answer, Busy, Failed, Error or Voicemail, with up to three attempts and increasing intervals. The dashboard exposes Run Now, Stop, Download and Delete. Whether Stop is a hard pause or only a stop for pending work is not documented; Northstar should model the provider result as “stop requested” until confirmed [I].
6. **Stream results and extract product signals [D].** Webhooks carry status, transcript, extracted data and cost; the Extractions tab supports categories such as Agent Handover, Lead Qualification and Customer Sentiment, with free-text or predefined answer types and tests against sample/real transcripts. [Analytics/extractions](https://www.bolna.ai/docs/agent-setup/analytics-tab) · [Webhooks](https://www.bolna.ai/docs/post-call/polling-call-status-webhooks)
7. **Approve learning [I].** Use graph validation as a structural gate, extraction tests as a field-quality gate, and a Northstar reviewer as the business-quality gate. Public pages do not establish an automated regression suite, branch-level A/B experiment or approval workflow.

### Edge cases in this case

| Edge case | Bolna-supported handling | Evidence status |
|---|---|---|
| Missing goal | Custom fields pass through without validation; graph conditions can branch but no required goal validator is documented. | **[D]/[U]** |
| Multiple products | Graph nodes/router and node-scoped tools/RAG can represent product paths; source-level product resolution is external. | **[D]/[I]** |
| Invalid data | `contact_number` is validated for correctness; other columns are not. Graph structural errors block save. | **[D]** |
| No consent | Timing restrictions are documented; a consent/DNC registry and pre-dial suppression check are not established in selected pages. | **[D]/[U]** |
| No answer / failure | Auto-retry can target no answer, busy, failed and error, up to three attempts. | **[D]** |
| Voicemail | Auto-retry can target voicemail; call settings also document voicemail detection. | **[D]** |
| Duplicate call | No deduplication key or idempotency behavior is documented for batch rows. | **[U]** |
| Interruption | Current docs mention engine/interruption configuration, but the selected batch/graph pages do not establish a repeatable interruption test result. | **[U]** |
| A/B test | No campaign-level A/B split is established in selected official pages. Use separate reviewed cohorts if testing externally [I]. | **[U]/[I]** |
| Evaluation | Graph validation and extraction tests are documented; full end-to-end release approval/regression is not. | **[D]/[U]** |

## Case study 4 — Retell: editable batch drafts, contacts, live rescue and A/B analytics

### Operator walkthrough for Northstar

1. **Create the identity layer [D/I].** Retell Contacts are keyed by phone number, can carry custom fields, expose a Do Not Call flag and can sync CRM fields. A contact panel shows related conversations. Web calls/chats do not create phone-keyed contacts, so Northstar must preserve its own customer ID for non-phone interactions [I]. [Contacts](https://docs.retellai.com/features/contacts)
2. **Prepare a reviewed batch [I].** Upload a CSV with phone number, `customer_id`, `product`, `goal`, consent decision, account owner and metadata. Retell accepts arbitrary dynamic-variable columns, optional agent/version overrides and metadata stored verbatim on calls. The documented phone-key key is useful for correlation but does not replace Northstar identity review.
3. **Save and inspect a draft [D].** Create a batch, choose a bound From Number and upload CSV. Configure a time window and reserve concurrency for other/inbound calls. Save as Draft to revisit; only Send starts or schedules calls. Once planned, it cannot be edited. [Batch calls](https://docs.retellai.com/deploy/make-batch-call)
4. **Test in layers [D].** Use LLM Playground for turn/tool debugging; simulation tests for pass/fail and regression batches; web calls for voice, latency and interruption; phone calls for transfers, DTMF and carrier audio. Custom LLM and speech-to-speech agents are audio-only and cannot use simulation/batch testing. [Testing overview](https://docs.retellai.com/test/test-overview)
5. **Run the relational campaign [I].** The prompt can use the product and goal variables, while contact fields feed later calls. For a severe Pulse outage, the agent should transfer or ask for a specialist; this is a flow design inference from documented transfer/tools and contact continuity.
6. **Supervise and rescue [D].** Live Monitoring exposes transcript turns, tool calls, node transitions and DTMF. A permitted operator can listen, take over (which permanently stops the agent and pauses transcription) or end the call. [Live monitoring](https://docs.retellai.com/features/live-monitoring)
7. **Run A/B and analyze [D].** Bind multiple agents to the outbound number, set weights totaling 100%, and compare metrics by agent/version in Analytics. The documented split is traffic-based; it does not create Northstar’s consent or identity cohort. [A/B Testing](https://docs.retellai.com/deploy/ab-testing)
8. **Close the loop [D/I].** Use batch metrics, contact history and post-call extraction/AI QA for product/customer outcomes. The reviewed batch page does not establish batch retry policy, pause or cancel semantics; Northstar must retain an external attempt ledger and stop gate.

### Edge cases in this case

| Edge case | Retell-supported handling | Evidence status |
|---|---|---|
| Missing goal | Dynamic variables can carry goal, but a required goal validator is not documented. Block at Northstar draft review. | **[U]/[I]** |
| Multiple products | Product fields, agent/version overrides and contact custom fields support routing context; no source-level product resolver is documented. | **[D]/[I]** |
| Invalid data | E.164 is required by default; custom fields are type-checked; metadata is stored verbatim. | **[D]** |
| No consent | Do Not Call is a documented contact field; consent capture and batch preflight semantics are not established. | **[D]/[U]** |
| No answer / failure | Batch metrics expose sent/picked-up/successful; failure taxonomy and automatic retry are not established in the selected batch page. | **[D]/[U]** |
| Voicemail | The reviewed batch page does not establish a voicemail disposition. Test phone/carrier behavior separately before scaling. | **[U]** |
| Duplicate call | Existing phone-keyed contacts reject duplicate contact creation, but duplicate batch rows/calls are not documented as deduplicated. | **[D]/[U]** |
| Interruption | Web-call testing explicitly covers interruptions; live takeover is documented. | **[D]** |
| A/B test | Outbound phone traffic splits by percentage; Analytics filters by agent/version and compares success, duration and latency. | **[D]** |
| Evaluation | Simulation tests grade runs; post-call AI QA and analytics cover production calls. | **[D]** |

## Failure matrix across the journey

The important comparison is where the provider’s primitive ends and Northstar’s operating contract must begin.

| Failure or decision | Vapi | ElevenLabs Agents | Bolna | Retell | Northstar control to add |
|---|---|---|---|---|---|
| Missing goal | No documented required goal | No documented required goal | Pass-through custom data | No documented required goal | Block launch; show a reason and owner |
| Multiple products | Variables + assistant/Squad | Variables + versioned workflow | Graph/router | Variables + agent/version override | Product enum, source evidence, per-product success criteria |
| Invalid data | Phone/CSV limits; business fields are flexible | Phone required; override permissions can fail | Phone validated, other columns pass through | E.164/type checks, metadata verbatim | Schema, null policy, field-level provenance |
| No consent | Pre-dial check can block | Compliance warning; no reviewed preflight | Timing restriction; no selected consent gate | DNC field; preflight not established | Consent ledger with expiry, lawful basis and suppression reason |
| No answer | Contact failure/status; window-bounded retry | Failure webhook + batch retry | Configurable retry up to 3 | Metrics only in selected batch page | Attempt state machine and retry budget |
| Voicemail | Tool or automatic detection, one only | Machine-detection config; no selected disposition | Detection + retry target | Unknown in selected page | Explicit voicemail branch and follow-up policy |
| Provider failure | Failed/pre-dial-failed states | Failure reason webhook and webhook retry | Failed/error retry | Unknown batch retry semantics | Provider-neutral failure taxonomy and idempotent event ingestion |
| Duplicate call | Duplicate campaign is rerun pattern; dedup unknown | Retry/dedup unknown | Dedup unknown | Contact creation is phone-unique; batch dedup unknown | Cohort fingerprint + per-person idempotency key |
| Interruption | Not established in campaign pages | Config exists; test evidence must be collected | Not established in selected pages | Web tests and live takeover documented | Audio test case with pause/interrupt acceptance threshold |
| Pause/stop | Cancel queued/not-started, in-flight finish | Cancel batch documented; pause unknown | Stop documented, exact semantics unclear | Live end-call documented; batch pause/cancel unknown | Pending/active/stopped ledger and provider acknowledgement |
| A/B test | Not established in campaign object | Branch traffic split, deterministic by conversation ID | Not established in selected pages | Outbound traffic split and version analytics | Randomization unit, balance checks, exposure log, stopping rule |
| Evaluation | Separate eval/simulation/scorecard | Tests + analysis + version ID | Validation/extraction tests; regression unknown | Simulation + audio + AI QA | Required test set, reviewer sign-off, version pin |

## Implications for Northstar’s product

The providers show a consistent boundary: they are increasingly good at executing an already specified call, while the hard organization problem is deciding **who** should be called, **why**, **with which product evidence**, and **what counts as a safe/valuable result**.

1. **Make the campaign a governed object.** Store source snapshot/hash, identity-match decision, product and goal, consent evidence, eligibility rules, cohort fingerprint, agent/version, schedule, capacity, retry policy and reviewer approval. A provider batch ID is only one external execution reference [I].
2. **Make columns reviewable.** Every variable shown to the agent needs source, freshness, authority, confidence, null state and reviewer decision. Vapi, ElevenLabs and Bolna all permit flexible variables; that flexibility makes semantic validation our responsibility [I].
3. **Use explicit states instead of “failed.”** Separate `invalid_data`, `missing_goal`, `no_consent`, `suppressed`, `duplicate`, `no_answer`, `voicemail`, `provider_failure`, `interrupted`, `human_takeover`, `completed` and `needs_review`. Keep attempts append-only and idempotent [I].
4. **Separate test evidence from production outcome.** A test pass is not a live pickup or a business result. Store scenario/test version, audio/turn evidence, product, language, reviewer, provider call ID, transcript, extraction confidence and business disposition [I].
5. **Close the learning loop through reviewed changes.** Convert a failed call into a regression case, propose a prompt/knowledge/eligibility change, run the required suite, show the diff and require approval before rollout. ElevenLabs and Retell document useful pieces; Bolna and Vapi expose other pieces, but none of the reviewed campaign pages establishes Northstar’s full approval contract [I].

## Five highest-impact gaps/actions

1. **Ship the reviewed audience ledger first:** identity, product, goal, consent, suppression and field provenance per person.
2. **Add a provider-neutral attempt state machine:** idempotency key, retry budget, stop/pause acknowledgement and immutable event log.
3. **Build a Test Lab release gate:** missing-goal, multi-product, invalid-data, no-answer, voicemail, interruption, escalation and duplicate-call cases tied to agent/version.
4. **Add a natural-language campaign intent diff:** show the exact audience, product, goal, evidence, exclusions, script behavior and expected outcome before launch.
5. **Make outcome analytics relational:** product × customer segment × cohort × language × agent version × attempt outcome, with transcript/extraction evidence and reviewer disagreement visible.

## Official sources consulted (19 pages; all public and first-party)

### Vapi

1. [Campaigns overview](https://docs.vapi.ai/outbound-campaigns/overview)
2. [Campaign contact data](https://docs.vapi.ai/outbound-campaigns/contact-data)
3. [Campaign scheduling and lifecycle](https://docs.vapi.ai/outbound-campaigns/scheduling-and-lifecycle)
4. [Campaign voicemail and call screening](https://docs.vapi.ai/outbound-campaigns/voicemail-and-call-screening)

### ElevenLabs Agents

5. [Batch calling](https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls)
6. [Agent testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing)
7. [Agent versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning)
8. [Experiments](https://elevenlabs.io/docs/eleven-agents/operate/experiments)
9. [Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)

### Bolna

10. [Batch calling](https://www.bolna.ai/docs/outbound/batch-calling)
11. [Graph validation](https://www.bolna.ai/docs/graph-agent/validation)
12. [Call settings](https://www.bolna.ai/docs/agent-setup/call-tab)
13. [Extractions and analytics](https://www.bolna.ai/docs/agent-setup/analytics-tab)
14. [Status webhooks](https://www.bolna.ai/docs/post-call/polling-call-status-webhooks)

### Retell

15. [Batch calls](https://docs.retellai.com/deploy/make-batch-call)
16. [Contacts](https://docs.retellai.com/features/contacts)
17. [Testing overview](https://docs.retellai.com/test/test-overview)
18. [Live monitoring](https://docs.retellai.com/features/live-monitoring)
19. [A/B testing](https://docs.retellai.com/deploy/ab-testing)
