# Vapi and Retell AI product/UX research for Relay

**Research date:** 2026-10-01  
**Purpose:** Inform a redesign of Relay as a founder/operator workspace for Indian businesses, with voice at the centre but company knowledge, campaigns, customers, conversations, and follow-through kept in one operating loop.  
**Method:** Public official documentation, official product updates/tutorials, and a small number of public walkthroughs. No authenticated Vapi or Retell workspace was used. No calls, accounts, purchases, API requests, or provider actions were made.

## Executive conclusion

Vapi and Retell are useful references because they make an agent's lifecycle legible. The strongest shared pattern is not the number of features. It is that the user can stay anchored to an **agent** while moving from draft, to test, to a named immutable version, to a live binding, and then back from a failed call to the exact configuration that handled it.

Relay currently makes the same lifecycle feel like separate products: edit an agent, capture a version, leave for Test Lab, leave again for Releases, then separately manage Deployments. Company Brain, Campaigns, Conversations, Quality, and GroupAI are also primarily global destinations. The result is accurate but cognitively expensive: the founder must remember how the objects relate.

The redesign should make three changes first:

1. **Make the agent a continuous workspace.** Draft, test evidence, version diff, active channels, campaign use, recent conversations, and improvement history should be sections of one agent workspace. Keep Relay's immutable gates under the surface, but turn them into one visible readiness sequence.
2. **Use a test ladder that says what each test proves.** Retell explicitly moves from turn-level text debugging, to saved graded simulations, to web audio, to a real phone path. Vapi separates text/model Evals, complete-conversation Simulations, and controlled calls. Relay should use a smaller founder-oriented ladder: quick scenario, representative voice call, then channel preflight. Each result should state its evidence boundary and cost.
3. **Close the evidence-to-improvement loop in context.** A call detail should lead directly from transcript/audio, business outcome, failure, cost, and source evidence to a reviewable agent change, a rerun of the relevant scenario, and publication. Retell's Conductor is a strong interaction reference because it proposes field-level changes and requires explicit accept/reject review. Relay should adapt this review pattern without copying an omnipresent copilot or a large QA product.

Retell is the stronger reference for operational UX: staged testing, environment tags, editable batch drafts, persistent history filters, version comparison, and evidence-to-change assistance. Vapi is the stronger reference for a compact assistant primitive, curated voice-stack presets, publish-time diffs, detailed per-call cost/latency decomposition, and a clean campaign progression. Relay should combine those interaction ideas with its own advantages: reviewed company facts, relationship memory, customer journeys, consent, explicit uncertainty, owned follow-through, and source-backed learning.

## Evidence labels and limits

- **[DOC] Documented UI/behaviour:** Current official documentation explicitly describes the control, navigation, state, or workflow.
- **[UPDATE] Official product update/tutorial:** Official vendor material that describes a current product flow, but may be selective or promotional.
- **[MKT] Marketing claim:** A vendor claim about quality, speed, reliability, or results. It is not treated as independently verified.
- **[WALK] Public walkthrough:** A third-party or older public tour used only as supporting visual/navigation evidence.
- **[INFERENCE] Relay recommendation:** A design conclusion drawn from the evidence and Relay's current implementation.

Documentation can lag or lead tenant-specific UI, and features may depend on plan, region, beta access, or workspace state. Screenshots embedded in the docs are evidence of the documented interface, not evidence that this research accessed the live dashboard.

## Relay baseline used for comparison

The user-supplied baseline was spot-checked against the local code on 2026-10-01:

- The sidebar lists 18 primary destinations across Operate, Build, Improve, and Workspace, plus search/account/header surfaces. It is experienced as roughly 20 flat destinations.
- The agent screen is a three-column workbench: agent library and task presets; a long editor with prompt/opening plus six settings tabs; and a persistent browser test panel.
- The lifecycle is split across `Capture version` in Agents, exact-version checks in Test Lab, Browser releases, and a separate Deployments destination.
- Company Brain, Campaigns, Conversations, Quality, Customers, and GroupAI are global destinations. Cross-links exist, but the navigation still makes the user assemble the mental model.
- Relay already has stronger review and evidence boundaries than the competitors in several places: approved company sources, explicit AI disclosure, reviewed customer memory, uncertain delivery states, human-controlled follow-up proposals, and honest voice-evidence limits.

This research therefore does not recommend adding a large inventory of Vapi/Retell features. It recommends using their lifecycle and evidence presentation patterns to reveal relationships Relay already implements.

## Vapi: documented end-to-end flow

### 1. Signup and first assistant

**[DOC]** Vapi's assistant quickstart begins with an account, then sends the user to **Assistants → Create Assistant**. A blank assistant is the primary action; templates are behind the arrow beside Create Assistant. New assistants receive a **Balanced** preset for transcriber, model, and voice. The visible initial configuration is deliberately small: **First Message** and **System Prompt**. The user then selects **Publish**, reviews changes, optionally uses **Quick Publish**, and selects **Talk** for a browser call. [Assistants quickstart](https://docs.vapi.ai/assistants/quickstart)

Interaction pattern:

- One obvious object: Assistant.
- A safe default stack exists before the user understands providers.
- Templates are available without making the first decision a large gallery.
- The first useful result is a conversation, not a completed configuration form.

Relay implication: keep Relay's task presets, but start the founder with a task and company context, generate a usable draft, and place the first representative test before the full settings tour.

### 2. Prompt, voice, and advanced configuration

**[DOC]** Vapi's Model Intelligence gives four curated combinations: **Balanced, High Intelligence, Ultra Fast, and Cost Saver**. Component selectors show latency, cost, and quality metrics. Changing one component moves the assistant to **Customized** while preserving the other preset values. [Model Intelligence overview](https://docs.vapi.ai/assistants/model-intelligence/overview)

This is useful progressive disclosure. The default is an outcome label, while provider/model choice remains available for experts. The component-level metrics also connect an advanced choice to an operational consequence.

**[INFERENCE]** Relay should not expose Azure/Gemini/provider terminology as the main voice-profile decision for a founder. Use outcome-facing defaults such as **Recommended**, **Fast responses**, and **Lower cost**, with the actual provider and technical settings in an expandable implementation panel. Relay must preserve its provider constraints internally and must not imply measured audio quality where none exists.

### 3. Knowledge and data

**[DOC]** Vapi knowledge is a two-object workflow. The user uploads material under **Build → Files**, then opens an assistant and selects those files in its Files/Knowledge Base section. Publishing the assistant creates a query tool with the selected files. The docs explicitly tell the user to add prompt guidance for when to use the knowledge base. Supported dashboard uploads include text, PDF, DOCX, CSV, Markdown, JSON, XML, and other text-bearing formats. [Knowledge bases](https://docs.vapi.ai/knowledge-base)

Strengths:

- Files are reusable across assistants.
- Attachment is visible on the assistant.
- Publishing captures the knowledge selection with the assistant configuration.

Weakness for Relay's audience:

- The workflow is document/tool-centric rather than company-understanding-centric.
- The docs describe user-controlled files but not Relay-style review of extracted facts, conflicts, identity columns, source authority, or correction/revocation.

Relay implication: preserve Company Brain's reviewed evidence model, but surface a compact **What this agent knows** section inside the agent and campaign. A founder should be able to open a source, see freshness/approval, and fix it without losing the agent or campaign context.

### 4. Draft, test, and publish semantics

**[DOC]** Vapi auto-saves editor changes as a draft. Published versions are immutable. Publish opens a change comparison, supports a version name and optional description, and makes the new version current. Version history shows number, name, description, publication time, change comparison, JSON export, and restore. Restore creates a new current version from the earlier configuration. [Versioning with assistants](https://docs.vapi.ai/assistants/versioning/versioning-assistants)

One nuance matters: the versioning page explicitly documents **Chat** from the arrow beside Talk as using the unsaved editor configuration. The general quickstart places **Talk** after Publish. This research therefore does **not** claim that Talk always tests an unsaved draft. Relay should make its own target explicit on every test: `Draft r12`, `Version 4`, or `Live version 3`.

**[DOC]** Vapi has two deeper test surfaces:

- **Evals** check the model's next decision against a supplied mock conversation. Judges include exact match, regex, AI judging, and tool-call arguments. The docs clearly state that Evals do not test ASR, audio, or turn-taking and that saved Evals are not a native suite. [Evals quickstart](https://docs.vapi.ai/observability/evals-quickstart)
- **Simulations** run reusable complete-conversation scenarios in chat or voice, with an AI tester, success criteria, iterations, variables, and tool mocks. Results pair criteria with transcript, offer rerun, and warn that mocked tool success does not prove a real external action. [Simulations quickstart](https://docs.vapi.ai/observability/simulations-quickstart), [Simulations advanced](https://docs.vapi.ai/observability/simulations-advanced)

Interaction pattern: test modes are separated by evidence type, not just by UI location.

Relay implication: Relay's current Test Lab checks only configuration/authority, but its name suggests behavioural testing. Either rename the existing check to **Preflight** or add a small staged test runner. The UI must say what passed: configuration, conversation behaviour, browser audio, or real channel delivery.

### 5. Inbound, single outbound, and campaign publication

**[DOC]** For inbound, the user creates or imports a phone number, opens it, selects an assistant under Inbound Settings, and saves. For a single outbound call, the user opens a phone number, selects Test, chooses Single Number, enters the destination, chooses an assistant, and either calls now or schedules. Free Vapi numbers are US-only in the documented flow. [Assistants quickstart](https://docs.vapi.ai/assistants/quickstart)

**[DOC]** Campaign creation is a short wizard:

1. Prepare and publish an assistant.
2. Open **Campaigns → Create campaign**.
3. Choose name, phone number, caller/assistant, and maximum concurrency. Optional webhook settings stay collapsed.
4. Upload a CSV or manually add recipients; preview name and number while retaining extra columns as dynamic variables.
5. Choose send now or a calling window/time zone.
6. Review and launch.
7. Monitor audience, remaining calls, connected calls, pickup rate, and per-contact terminal state.

A contact row exposes call ID, ended reason, start time, duration, and cost, and links to the call record. The campaign is read-only after creation and can only be duplicated; the docs state that it cannot be saved as a draft. [Campaigns quickstart](https://docs.vapi.ai/outbound-campaigns/quickstart), [Campaigns overview](https://docs.vapi.ai/outbound-campaigns/overview)

The compact progression is excellent. The inability to save a draft is inappropriate for Relay. Relay's operator-reviewed audience, consent, purpose, result columns, scheduling, and budget deserve an editable draft and an explicit preflight.

### 6. Review a call

**[DOC]** **Logs → Calls** lists recent calls with assistant/squad, version, phone numbers, type, ended reason, time, duration, and cost. A call detail can show a recording waveform and tabs for **Transcripts, Logs, Analysis, Structured Outputs, Messages, Call Cost, and Latency Summary**. Transcript lines have wall-clock time and offset and can seek the recording. Call Cost can separate STT, LLM, TTS, platform, transport, analysis, voicemail detection, and knowledge-base usage. Latency Summary separates transcriber, endpointing, LLM, voice, and transport by turn. [Call logs](https://docs.vapi.ai/observability/logs/call-logs)

This is one of Vapi's best patterns: the transcript is not expected to answer every debugging question. Conversation, execution, cost, and latency each get the representation they need.

**[DOC]** Vapi also documents precise end reasons for billing, fraud, concurrency, provider, assistant, transport, voicemail, and normal termination conditions. Its troubleshooting page translates symptoms such as “phone never rang,” “assistant went silent,” and “transfer failed” into dashboard evidence and next checks. [Call ended reasons](https://docs.vapi.ai/calls/call-ended-reason), [Troubleshoot call errors](https://docs.vapi.ai/calls/troubleshoot-call-errors)

Relay implication: put the business view first, then make diagnostics one disclosure away. A founder should see **Reached / No answer / Voicemail / Failed / Needs review**, with provider codes in details and a specific next action.

### 7. Improve and monitor

**[DOC]** Vapi supports publish-time diffs, immutable version history, restore-as-new-version, and a beta traffic-splitting flow. The beta can publish at 100%, publish parked at 0%, or split traffic across versions, but the docs explicitly say it lacks native per-version metrics, side-by-side performance, and a dashboard history of past splits. [Traffic splitting](https://docs.vapi.ai/assistants/versioning/traffic-splitting)

**[DOC]** Boards support custom charts and formula metrics; Monitoring applies thresholded queries to call data and creates issues/notifications. The monitoring docs warn that monitors only detect configured conditions and recommend sampling unflagged calls. [Boards quickstart](https://docs.vapi.ai/observability/boards-quickstart), [Monitoring quickstart](https://docs.vapi.ai/observability/monitoring-quickstart)

**[DOC]** Structured outputs and scorecards are AI-derived. Vapi's scorecard docs explicitly warn that AI-generated inputs can be wrong and should be calibrated against reviewer-agreed calls. [Structured outputs quickstart](https://docs.vapi.ai/assistants/structured-outputs-quickstart), [Scorecard quickstart](https://docs.vapi.ai/observability/scorecard-quickstart)

This is a valuable boundary for Relay: an AI success score is not a verified business outcome and should never be styled as confidence.

## Retell AI: documented end-to-end flow

### 1. Signup and first agent

**[DOC]** Retell's current quickstart says a new account begins with trial credits and no payment method. In **Agents**, Create an agent asks for an agent type and starting method. Retell recommends **Single prompt** for the first version; **Conversation flow** is for tighter execution control or less context per node. Starting options are **Build from scratch**, a ready-made template, or **Generate from prompt**, marked Suggested. A Test button opens a browser web call against the draft, with no phone number required. [Build your first phone agent](https://docs.retellai.com/get-started/quick-start)

There is a documentation inconsistency around cost. The quickstart calls this test step “free,” while Retell's dedicated current testing-pricing page says web-call tests are billed at production voice rates and that there is no separate free sandbox. The safer product conclusion is only that no phone number/telephony charge is required; Relay should show the applicable test charge or trial-credit use before Run. [Testing pricing](https://docs.retellai.com/test/testing-pricing)

This is a better first-run choice architecture than a blank technical editor. The user decides how much help they want, not which provider pipeline they understand.

Relay implication: ask for a business task in plain language, offer two or three task templates, and let advanced operators open the full editor. Do not expose “single prompt vs flow” because Relay's buyer is a founder/operator, not an agent-platform engineer.

### 2. Prompt, model, voice, and progressive disclosure

**[DOC]** Retell keeps the most frequent technical choices in the agent toolbar:

- Model options are grouped by “versatile and highly intelligent,” “fast and cost-efficient,” and speech-to-speech, with per-minute price and a Suggested marker.
- The voice picker uses searchable/filterable cards, a preview button, and visible accent, age, provider, and voice ID.
- Voice speed defaults to 1.0x; an optional setting can adapt speed to the caller.
- Welcome Message makes the opening model explicit: user speaks first, or AI speaks first with a dynamic or fixed message and optional pause before speaking.

[Configure basic settings](https://docs.retellai.com/build/single-multi-prompt/configure-basic-settings)

**[DOC]** Advanced LLM settings such as temperature, structured output, fast tier, retries, and timeouts are documented separately. [Configure LLM options](https://docs.retellai.com/build/llm-options)

**[DOC]** The agent header also shows estimated latency with a TTS/LLM/transcription breakdown, and settings that increase latency receive a turtle icon. This is an estimate, not measured call latency. [Check estimated latency](https://docs.retellai.com/reliability/check-estimated-latency)

Relay implication: show a compact consequence summary beside advanced changes: expected latency direction, expected cost direction, and which existing tests should be rerun. Avoid a fake precise estimate unless Relay can support its provenance.

### 3. Knowledge and context

**[DOC]** Retell's global **Knowledge Base** tab creates a reusable knowledge base from URLs, uploaded files, custom text, Google Drive, OneDrive, or Notion. URLs and supported connected sources can auto-refresh daily; URL paths can auto-crawl. The user then opens **Knowledge base & memory** inside an agent and attaches one or more bases. Default advanced retrieval is three chunks with a 0.60 similarity threshold. Retell says the agent tries retrieval before every response and lets users inspect knowledge-base retrievals in the session transcript. [Knowledge base setup and retrieval tuning](https://docs.retellai.com/build/knowledge-base), [Call & chat history](https://docs.retellai.com/features/session-history)

The 0.60 similarity threshold is a retrieval control, not a calibrated truth/confidence score. Retell's post-call fields and sentiment are also LLM inferences.

Relay implication: Company Brain should remain more than a document store. Retell's useful pattern is attachment and retrieval visibility: show the founder which reviewed sources are active, what was retrieved for a specific answer, freshness, and whether a source failed to sync. Do not replace Relay's fact review with automatic ingestion.

### 4. Test ladder

**[DOC]** Retell documents four distinct test methods and tells the user to pick the lightest method that covers the risk:

1. **LLM Playground:** manual or simulated text chat with tool calls and transitions visible turn by turn.
2. **Simulation testing:** saved scenarios with success criteria, run alone or in batches, with pass/fail grading.
3. **Web call:** real voice, latency, and interruption behaviour without a phone number.
4. **Phone call:** carrier audio, DTMF, voicemail, transfer, and telephony.

Only simulations grade a run. The docs explicitly say the Playground's AI user does not score the conversation. [Testing overview](https://docs.retellai.com/test/test-overview)

**[DOC]** Turn-level debugging starts from the exact response, transition, or tool call. The user can regenerate once or ten times to see result frequency after a change. [Debug your agent response](https://docs.retellai.com/test/llm-playground-debug)

**[DOC]** Batch Testing History shows each run's case count, timestamp, pass rate, error count, exact agent version, written grader explanation, transcript, transitions, and tool calls. A failed row can reopen in the Playground with its transcript loaded. [Batch test your agent](https://docs.retellai.com/test/batch-test-simulation)

**[DOC]** Testing is billed: text tests per message, voice tests at production voice rates, phone tests with added telephony, and batch grading as an additional analysis unit. Retell recommends using text for most iteration and reserving voice/phone for final validation. [Testing pricing](https://docs.retellai.com/test/testing-pricing)

This is the clearest model for Relay's redesign. Relay needs fewer modes, but it should copy the honesty: purpose, target version, evidence type, cost, and pass/fail boundary must be visible before Run.

### 5. Versions, environments, and deployment

**[DOC]** Retell versions start as editable/testable drafts. Publishing makes the same numbered version read-only. Users can create several drafts from any earlier version. The version panel lives in the upper-right of the agent page and groups Draft and Published versions. [Agent versions and tags](https://docs.retellai.com/agent/version)

**[DOC]** Version comparison is available from history or the Publish modal and offers a full JSON split diff or a semantic diff with additions, removals, modifications, field paths, expandable values, and word-level changes. [Compare agent versions](https://docs.retellai.com/agent/version-comparison)

**[DOC]** Each agent starts with `prod` and `staging` environment tags. Phone numbers can bind to a tag rather than a fixed version, so moving the tag changes the live version without editing every number. Dynamic variables can vary by tag. [Agent versions and tags](https://docs.retellai.com/agent/version)

Relay implication: keep founder language. Replace separate Capture/Test/Release/Deployment pages with one **Readiness & channels** panel. Internally retain immutable versions, test-run IDs, release records, and deployment authority. If Relay later needs environments, label them **Internal preview** and **Customer live**, not staging/prod.

### 6. Inbound and outbound campaigns

**[DOC]** Retell's quickstart buys a number from **Phone Numbers**, then binds an inbound and/or outbound agent in that number's configuration. Retell-managed numbers are documented as US/Canada; other countries use custom telephony. [Build your first phone agent](https://docs.retellai.com/get-started/quick-start)

**[DOC]** Batch calling is a campaign-like workflow:

1. Open **Batch Call → Create Batch Call**.
2. Name it and choose the from-number, already bound to agents.
3. Upload a CSV, with extra columns becoming dynamic variables and optional per-row agent/version overrides and metadata.
4. Configure the calling window.
5. Reserve some concurrency for other calls; the UI shows the capacity allocated to the batch.
6. **Save as Draft**, Send Now, or Schedule.
7. Monitor Draft, Planned, Ongoing, and Sent states plus Sent, Picked Up, and Successful counts.
8. Open the history icon for individual calls.

[Create and schedule batch calls](https://docs.retellai.com/deploy/make-batch-call)

Retell's draft state is the right baseline for Relay. Its workflow is still telephony-led and treats “Successful” as a configured criterion rather than Relay's richer customer/business outcome.

### 7. Review, diagnose, and improve

**[DOC]** Call History rows can show time, cost, session ID, status, sentiment, numbers, agent/version, duration, channel, direction, end reason, outcome, and end-to-end latency. Filters include batch ID, version, outcome, disconnection reason, cost, analysis fields, dynamic variables, metadata, and more. Filters persist per workspace and in the URL; column visibility/order is customizable. [Call & chat history](https://docs.retellai.com/features/session-history)

**[DOC]** A call detail can include Conversation Analysis, summary, transcript, tool calls/results, state transitions, SMS, knowledge retrievals, dynamic variables, contact and current memory, recording, latency, detailed execution logs, and PCAP. A transcript timestamp seeks the recording; an error reason can link to the exact detail log. Analysis can be rerun after changing extraction configuration, with an additional analysis cost and without resending webhooks. [Call & chat history](https://docs.retellai.com/features/session-history)

**[DOC]** Post Call Extraction generates summary, user sentiment, success, voicemail state, and custom boolean/text/number/selector fields. The docs explicitly state that transcript sentiment does not use tone or pitch and that no custom fields are populated for unconnected/no-conversation calls. [Post Call Extraction](https://docs.retellai.com/features/post-call-analysis-overview)

**[DOC]** Retell's Analytics dashboard can chart success, latency, cost, concurrency, and custom post-call fields, filtered/broken down by agent or version. Alert rules can trigger on success rate, cost, latency, volume, API errors, negative sentiment, or QA failures. [Analytics dashboard](https://docs.retellai.com/features/analytics-dashboard), [Alert rules](https://docs.retellai.com/features/alerting-overview)

**[DOC]** AI QA samples cohorts and reports aggregate and call-level findings such as resolution, hallucination, knowledge accuracy, overlap, sentiment, latency, and tool use with transcript evidence. These are automated evaluations, not ground truth. [AI Quality Assurance](https://docs.retellai.com/ai-qa/overview)

### 8. Helpful automation: Conductor

**[DOC]** Retell's Conductor can propose prompt/settings/flow edits from plain-language instructions. Each proposal appears against the affected setting or node with current/proposed values, text or JSON diff, per-change accept/reject, undo, revision feedback, and explicit Submit. It does not silently apply all changes. [Build and refine agents](https://docs.retellai.com/conductor/build-and-refine)

**[DOC]** It can begin from unsuccessful calls, suggest edge cases, run simulations, inspect results, and repeat a make-test-refine loop. [Test and improve agents](https://docs.retellai.com/conductor/test-and-improve)

**[UPDATE]** Retell's 2026 product update says Conductor is available across pages, can retain attached context while navigating, apply filters, create approved analytics charts, and show highlighted walkthroughs and navigation cards. These are official product claims/updates, not observations from a signed-in workspace. [Conductor is Everywhere](https://www.retellai.com/blog/conductor-is-everywhere)

Relay implication: adapt the proposal review and context retention, not the omnipresent chat metaphor. Relay already has reviewable agent revision proposals. Move that capability next to the source call and the agent diff, then generate a matching regression scenario before publication.

## Cross-product interaction patterns that matter

| Need | Vapi | Retell | Relay design lesson |
|---|---|---|---|
| First useful agent | Blank/template, Balanced stack, first message + prompt | Single prompt recommended, build/template/generate from prompt | Ask for the business job and give a ready default; do not begin with provider selection. |
| Default vs advanced | Outcome-labelled stack presets; component metrics; Customized state | Suggested models, per-minute prices, voice cards; advanced settings lower in editor | Show a clear recommended path and reveal technical controls with consequences. |
| Knowledge | Reusable Files attached to assistant and captured on publish | Reusable KBs attached in agent; sync/crawl and advanced retrieval | Keep reusable company knowledge, but surface attachment, freshness, retrieval, and approval inside the work item. |
| Fast test | Chat explicitly tests unsaved Vapi editor config; Talk follows publish in quickstart | Playground and web call can test draft | Always display the exact target: current draft, saved version, or live version. |
| Regression test | Evals for decisions; Simulations for conversations | Saved scenarios, batch history, pass rate by version | Make scenarios first-class evidence attached to agent versions. |
| Publication | Publish diff, name/description, immutable current version | Draft/published panel, semantic diff, tags | Put review, test evidence, and activation in one readiness panel. |
| Outbound | Short campaign wizard; no draft; read-only after launch | Batch draft, schedule, concurrency reserve, per-recipient variables | Use Retell's editable draft and Vapi's compact review/monitor sequence. |
| Call review | Recording + distinct transcript/log/analysis/cost/latency views | Rich session detail plus contact/memory, KB retrieval, exact logs | Present business outcome and customer first, diagnostics second, all on the same record. |
| Improve | Restore, simulations, boards, monitors, beta traffic split | Failed call → proposal → simulation → reviewed change; version analytics | Close the loop from evidence to reviewed change to targeted rerun. |
| Failure display | Precise ended reasons and symptom-led troubleshooting | Status/outcome/disconnection reason, linked detail logs, alert rules | Translate provider failures to operator language but retain the raw receipt in details. |
| Cost display | Per-call category breakdown; model component estimates | Per-minute model labels, test pricing, cost in history and analytics | Show an estimate at preflight, accrued amount during operation, and actual breakdown afterward. |
| “Confidence” | No documented calibrated answer-confidence; AI outputs/scorecards can be wrong | Similarity threshold controls retrieval; analysis/QA is inferred | Use provenance and evidence state, not an unexplained confidence percentage. |

## Prioritized adopt / adapt / reject matrix

| Priority | Decision | Pattern | Concrete Relay change | Why / evidence |
|---|---|---|---|---|
| P0 | **Adopt** | One agent workspace with a visible lifecycle | Replace the route sequence `Agents → Capture version → Test Lab → Releases → Deployments` with an agent-level **Readiness** rail: Draft → Tested → Published version → Active channels. Each step opens inline or in a drawer and preserves the current immutable backend objects. | Both vendors keep versions and publication anchored to the agent. Vapi's publish diff and Retell's version panel make state visible without asking the user to reconstruct it. |
| P0 | **Adopt** | Explicit test target and evidence boundary | Every Run action names its target (`Draft r12`, `Version 4`, `Live v3`) and labels what it can prove: conversation behaviour, browser audio, configuration, or external channel. | Vapi explicitly limits Evals; Retell's test overview maps each test to the risk it covers. This also corrects Relay's Test Lab name/expectation mismatch. |
| P0 | **Adapt** | Staged test ladder | Inside the agent, offer **Try a scenario** (text, low cost), **Talk to the draft** (voice), and **Run channel preflight** (exact immutable version). Show recommended next test, estimated charge/budget source, and previous result. | Retell's sequence is clear and cost-aware; Vapi separates decision and conversation testing. Relay does not need every vendor mode. |
| P0 | **Adopt** | Publish-time semantic diff | Publish shows human-readable changed fields, knowledge changes/freshness, actions/tools, prompt word diff, version name/reason, test evidence, and affected live channels/campaigns. | Vapi and Retell both place comparison inside Publish. Relay's current history only lists version number/time/status and a field-name summary. |
| P0 | **Adapt** | Business-first call detail with diagnostic depth | Top: person, campaign, intended outcome, result, consent, follow-up, exact agent/version, and evidence status. Below: recording/transcript synchronized with events; expandable knowledge retrieval, actions, latency, provider receipt, and cost. | Vapi's distinct evidence tabs and Retell's session/contact view are strong. Relay should lead with customer journey and owned action. |
| P0 | **Adopt** | Editable outbound draft and compact preflight | Campaign flow: Goal → Audience → Journey & message → Representative preview → Schedule/budget/consent → Launch. Keep Save draft; show exclusions and sampled recipients; freeze the launched run while allowing duplicate/revise. | Retell supports drafts; Vapi's compact wizard and per-contact states are easy to understand. Vapi's no-draft constraint should not be copied. |
| P0 | **Adapt** | Contextual company knowledge | Keep Company Knowledge as a reusable company asset, but show **Used by this agent/campaign**, approval, source, last refresh, conflicts, and a retrieval preview in place. Offer “Fix source” as a contextual route back to the same object. | Both vendors attach reusable knowledge in the agent. Relay's reviewed facts are stronger but currently feel isolated in Company Brain. |
| P0 | **Reject** | Roughly 20 equal sidebar destinations | Reduce primary navigation to outcome-oriented destinations such as **Today, Customers, Campaigns, Agents, Activity**. Put Company setup/knowledge, channels/integrations, team/security, and technical evidence in contextual secondary navigation/settings. | Vendor dashboards can tolerate platform-object navigation for developers; Relay's founder audience should not have to know the internal object graph. |
| P1 | **Adapt** | Evidence-to-change assistance | From one or several calls: “Propose improvement” creates a bounded field-level diff linked to source turns and affected agent. User accepts/rejects fields, runs a generated scenario, then publishes. | Retell Conductor's review controls are strong. Relay already has revision proposals and source-backed learning; connect them rather than add another chat destination. |
| P1 | **Adopt** | Persistent, shareable operational views | Save filters/views for campaign, agent version, outcome, failure, cost, language, and owner. Make a filtered view linkable inside the workspace. | Retell persists filters in the URL and supports customizable columns; this reduces repeated setup during review. |
| P1 | **Adapt** | Cost at three moments | Preflight: expected range and budget cap. Running: accrued amount and remaining cap. Review: actual total plus voice/model/transport/analysis categories when available, with missing/partial usage marked. | Vapi has the clearest per-call breakdown; Retell exposes model/test price and history cost. Relay already records bounded provider usage and should keep missing data honest. |
| P1 | **Adopt** | Operator-facing failure states | Normalize to a small state set: Not started, Calling, Connected, Completed, No answer, Voicemail, Skipped, Failed, Uncertain. Each state has “What happened,” “What was charged,” and “Safe next action”; raw provider evidence remains expandable. | Vapi's ended-reason reference and symptom-led troubleshooting are precise; Retell links disconnection reasons to logs. |
| P1 | **Reject** | Numeric confidence without calibration | Do not show “87% confidence” for a transcript-derived outcome, sentiment, memory, or answer. Show **Verified by tool/result**, **Customer stated**, **AI inferred**, **Operator reviewed**, **Conflicting evidence**, or **Unknown**. | Neither vendor documents a calibrated general confidence signal. Retell's similarity threshold is a retrieval setting; both vendors' analysis outputs are AI-derived. |
| P1 | **Adapt** | Outcome schema attached to the campaign | Ask the founder what a successful conversation means and which result fields matter before launch. After calls, show required fields, missing fields, source turns, and review state. | Vapi structured outputs and Retell Post Call Extraction make outcomes filterable, but Relay should preserve reviewed result columns and distinguish inference from verified action. |
| P2 | **Adapt later** | Safe live version movement | For meaningful traffic, add **Internal preview** and **Customer live** pointers, with one-click rollback to a tested version. Add percentage experiments only after exposure assignment and business outcomes are reliable. | Retell tags make deployment legible. Vapi traffic split is beta and explicitly lacks integrated comparison metrics. Relay should not add A/B controls before measurement integrity. |
| P2 | **Adapt later** | Monitoring and alerts | Start with a few founder-relevant alerts: campaign paused by failures, spend near cap, success/result completion drop, provider/channel unavailable, unresolved customer commitments. | Vapi Monitoring and Retell Alerting are strong at volume. A general rule builder and dozens of infrastructure metrics would be premature for Relay. |
| P2 | **Reject for founder default** | Node graph / provider marketplace / raw JSON as primary UI | Keep these behind an expert/implementation mode. Do not make founders assemble STT + LLM + TTS or conversation nodes before a first test. | Vapi and Retell expose platform complexity because developers are core users. Relay's differentiator is translating company goals and evidence into safe operations. |
| P2 | **Reject** | Separate omnipresent AI copilot destination | Use contextual suggestions and reviewed proposals. If a helper persists across pages, it should carry explicit attached evidence and never mutate state without a review step. | Retell's review mechanics are valuable; copying the whole Conductor surface would add another global object and compete with Relay's GroupAI/Company Brain concepts. |

## Proposed object model and information architecture

The redesign should make these relationships visible in every relevant header and detail page:

```text
Company
├── reviewed knowledge and sources
├── customers and consent
├── agents
│   ├── editable draft
│   ├── immutable versions + test evidence
│   └── active channel bindings
├── campaigns
│   ├── goal + offering + audience + result fields
│   ├── exact agent version + schedule + budget
│   └── recipient journeys
└── conversations
    ├── customer/campaign/version/source evidence
    ├── outcome + cost + failure/latency evidence
    └── reviewed improvement or follow-up
```

Recommended primary navigation:

- **Today:** readiness, exceptions, owned work, campaign health, and suggested next action.
- **Customers:** people, consent, relationship memory, journeys, commitments.
- **Campaigns:** sales and service-feedback work from draft through results.
- **Agents:** draft, test, publish, active channels, and improvement history in one place.
- **Activity:** conversations, inbox/channel events, call review, and operational evidence.

Contextual/secondary locations:

- **Company knowledge** lives in Company setup and appears contextually in agents/campaigns/calls.
- **Channels & integrations** live in Company settings and in each agent's Activate step.
- **Team & access / Account security** live under the company/workspace switcher.
- **Quality** becomes views inside Agents, Campaigns, and Activity, with an optional cross-company report later.
- **GroupAI** should be presented by its user job: a team review room, customer/audience deliberation, or evidence discussion. It should not remain an unexplained global product noun beside Campaigns and Customers.

This does not require deleting the underlying routes immediately. The first implementation can add object-scoped panels and links, then demote redundant global destinations once the continuous paths work.

## Adaptation for an Indian founder/operator

The vendors' first-run paths are phone-platform paths. Vapi's documented free-number flow is US-only, and Retell's managed-number quickstart is US/Canada; both point international users toward imported/custom telephony. Relay should not let a foreign phone-number purchase become the activation moment for an Indian business.

For Relay, the default activation order should be:

1. internal browser text/voice preview;
2. a bounded public web experience;
3. WhatsApp or Telegram when the business has authorized and configured the channel;
4. outbound campaigns over currently supported reviewed channels;
5. telephone only when the later integration and India-specific operational/compliance path are ready.

The interface should default to IST and show dates, calling windows, budgets, and phone formats in locally familiar terms. Language configuration should start from the company's actual customer languages and speech vocabulary, with a representative test phrase for names, places, offerings, and English/Hindi or other mixed-language usage. A multilingual label alone must not imply measured recognition or voice quality.

Founder-facing copy should use business outcomes: **new enquiry follow-up**, **customer service feedback**, **appointment confirmed**, **human follow-up needed**, **payment or delivery unresolved**. Terms such as response engine, SIP, concurrency, similarity threshold, agent version tag, and structured output belong in expert details. When a technical limit affects a decision, translate it: “Keep 2 call slots available for incoming customers,” rather than “Reserved concurrency: 2.”

Trust controls should stay in the main path. The representative identifies itself as AI; audience review shows consent/contactability; a customer correction remains visible; private customer memory is separate from company knowledge; and an external action without a conclusive receipt is **uncertain**, not automatically retried. These are Relay differentiators, not friction to remove in pursuit of the competitors' speed-to-first-call.

## One ideal founder flow

The following flow keeps the founder oriented around a business goal while preserving Relay's existing review and safety boundaries.

### 1. Create the workspace

The founder enters company name, business type, what they sell, customer type, city/time zone, and preferred languages. Relay asks for a short plain-language description, not an agent prompt. The first screen ends with one action: **Add what your team already knows**.

### 2. Add and review company material

The founder pastes text or uploads a small source. Relay extracts proposed offerings, facts, identity columns, result fields, and conflicts. The founder reviews them. Applied items become Company Knowledge with source, quote, status, and freshness. The UI says that this information can be reused by agents and campaigns.

### 3. Choose a business job from Today

The home screen asks: **What do you want to do next?** Examples:

- Follow up with new enquiries.
- Learn from customers after service.
- Answer website questions.
- Help the team review a difficult customer situation.

Selecting “Follow up with new enquiries” opens a campaign draft, not a generic agent editor.

### 4. Define the campaign outcome and audience

Relay asks for the offering, desired next step, who should be included, consent/contactability rules, and result fields. It shows why people are included or excluded and highlights uncertain mappings. The founder reviews a small recipient sample. This preserves Relay's stronger audience and evidence model.

### 5. Prepare the representative in context

Relay proposes an existing suitable agent or creates a task-based draft. The compact card shows identity/disclosure, objective, language, voice sample/profile, attached reviewed knowledge, allowed actions, escalation, and customer-memory scope. A founder can edit in plain language; **Advanced settings** exposes the full prompt and provider/voice controls.

The right side is no longer a permanently competing test column. A sticky bottom bar says:

`Draft saved · 2 readiness steps remaining`  **Try scenario**  **Talk to draft**  **Review & publish**

### 6. Test with the right evidence

Relay recommends a short scenario generated from the campaign goal and company facts. The founder can type as the customer or run a bounded simulated caller. The result shows:

- exact draft/version tested;
- transcript and cited company sources;
- actions requested and their mocked/real status;
- required result fields captured or missed;
- behavioural checks with reasons;
- evidence boundary: “Text behaviour only; voice and channel not tested”;
- actual or estimated test cost.

If it passes, the next recommended step is a browser voice call. The founder hears the representative, interrupts it, and checks pronunciation. Relay records browser-observed timing separately from provider/server receipts and makes no unsupported acoustic claim.

### 7. Review and publish once

**Review & publish** opens one modal/drawer:

- human-readable diff from the current live version;
- knowledge sources and freshness changes;
- result fields and allowed actions;
- recent scenario/voice/preflight evidence, with untested items explicit;
- version name and reason;
- affected channels/campaigns;
- cost/budget and limits;
- destination: Internal preview or Customer live.

Publication creates the immutable agent version and campaign/run binding in one user-visible action, while Relay can retain separate backend release/deployment records.

### 8. Launch the campaign

Final preflight shows audience count, exclusions, sample personalization, schedule/time zone, channel availability, exact agent version, concurrency/budget, stop-on-reply/opt-out rules, and what requires human review. The campaign remains an editable draft until Launch. Once launched, the run is immutable; the founder can pause, stop, or duplicate/revise.

### 9. Operate by exceptions

Today and the campaign page show a compact funnel and an exception queue:

- Eligible → Queued → Attempted → Connected → Result recorded → Human follow-up.
- No answer, voicemail, failed, skipped, and uncertain remain separate.
- Cost to date and budget remaining are visible.
- Each recipient opens their journey, not a raw call object.

### 10. Review one conversation and improve

The call opens with the customer, campaign goal, exact version, outcome/result fields, follow-up owner, and evidence state. The founder can play the recording and select transcript turns. Diagnostics and costs are expandable.

If the representative made a mistake, **Propose agent improvement** produces a field-level diff linked to the source turn. The founder accepts/rejects the changes, Relay generates or updates one regression scenario, reruns it against the draft, and offers **Publish improvement** with the same diff/evidence modal. If the conversation revealed a customer preference or company fact, it remains a separate reviewed memory/knowledge proposal with provenance.

The loop ends at accountable work: the customer follow-up, company change, or agent change has an owner and status. This is the part Relay should retain as its core advantage over a voice-agent builder.

## Failure, cost, and confidence presentation for Relay

### Failures

Use a two-layer pattern:

1. **Operator language:** “Not enough calling capacity,” “Provider could not start the call,” “Customer did not answer,” “Voicemail reached,” “Call disconnected,” “Action outcome uncertain.”
2. **Technical evidence:** provider code, request/receipt times, exact version/channel, retry eligibility, and raw bounded log reference.

Never merge no-answer, voicemail, provider failure, customer hang-up, assistant-ended, and uncertain external action into “Failed.” The next safe action differs.

### Cost

Show cost in the decision context:

- Agent model/voice choices: direction or range, with source and date.
- Test action: expected billing unit and upper bound before Run.
- Campaign preflight: budget cap and rough range based on audience and maximum duration, clearly labelled an estimate.
- Live campaign: accrued known cost, missing/partial usage warning, and remaining cap.
- Call detail: actual total and component breakdown when the provider reports it.

Do not imply that token usage covers voice, telephony, analysis, or provider costs when those are absent.

### Confidence and evidence

Avoid a single confidence percentage. Use an evidence vocabulary:

| Label | Meaning |
|---|---|
| **Verified action** | A named tool/service returned a successful result and Relay reconciled it. |
| **Customer stated** | A source turn contains the statement; it may still be incomplete or incorrect. |
| **Source-backed company fact** | An approved company source supports it. |
| **AI inferred** | A model classified, summarized, or extracted it from available evidence. |
| **Operator reviewed** | A workspace member accepted or corrected the item. |
| **Conflicting evidence** | Sources disagree or a later correction exists. |
| **Unknown / unavailable** | Relay lacks enough evidence or the receipt is missing. |

For retrieval, show the matched source excerpts and retrieval context; do not display the similarity threshold as truth confidence. For outcomes, show the transcript/tool evidence used by the extractor and let the operator correct the result.

## Visual references in the official documentation

These pages contain screenshots that are especially useful for a redesign review. The captions below are from the documented pages; they were not captured from a signed-in research session.

### Vapi

- [Assistant quickstart](https://docs.vapi.ai/assistants/quickstart): assistant editor with First Message/System Prompt; Create Phone Number dialog; outbound Test panel.
- [Assistant versioning](https://docs.vapi.ai/assistants/versioning/versioning-assistants): draft/current Publish diff, version name/description, version history, restore confirmation.
- [Campaign quickstart](https://docs.vapi.ai/outbound-campaigns/quickstart): campaign details, contacts CSV preview, schedule/review sequence.
- [Call logs](https://docs.vapi.ai/observability/logs/call-logs): call list and call detail with recording plus Transcript, Logs, Analysis, Structured Outputs, Messages, Call Cost, and Latency Summary tabs.
- [Simulations quickstart](https://docs.vapi.ai/observability/simulations-quickstart): suite creation and criteria beside transcript.
- [Model Intelligence](https://docs.vapi.ai/assistants/model-intelligence/overview): curated preset/component selection and performance metrics.

### Retell

- [First phone agent](https://docs.retellai.com/get-started/quick-start): Create Agent choice between agent types/start modes; Test Audio panel; number binding selectors.
- [Basic settings](https://docs.retellai.com/build/single-multi-prompt/configure-basic-settings): model dropdown with Suggested/per-minute price; toolbar; searchable voice-card dialog with previews.
- [Knowledge base](https://docs.retellai.com/build/knowledge-base): Knowledge Base tab, Add menu, crawl selection, agent attachment, retrieval controls.
- [Versions and tags](https://docs.retellai.com/agent/version): Draft/Published panel, Publish action, environment tag configuration.
- [Version comparison](https://docs.retellai.com/agent/version-comparison): full JSON split diff and semantic field/word-level diff.
- [Batch calls](https://docs.retellai.com/deploy/make-batch-call): batch list, CSV editor, calling window, status/metric table, per-call history.
- [Call history](https://docs.retellai.com/features/session-history): filter/customize controls and call detail with analysis, transcript, recording, contact memory, logs, and PCAP.
- [Analytics](https://docs.retellai.com/features/analytics-dashboard): call dashboard with success, latency, concurrency, sentiment, and direction charts.
- [Conductor build/refine](https://docs.retellai.com/conductor/build-and-refine): starter suggestions, inline proposed edit, JSON diff, per-change review controls.

## Source quality and public walkthroughs

Primary evidence is the official documentation linked throughout. More than five specific current primary pages were used for each company; the most decision-relevant pages are listed below.

### Vapi primary pages

1. [Assistants quickstart](https://docs.vapi.ai/assistants/quickstart)
2. [Model Intelligence overview](https://docs.vapi.ai/assistants/model-intelligence/overview)
3. [Knowledge bases](https://docs.vapi.ai/knowledge-base)
4. [Assistant versioning](https://docs.vapi.ai/assistants/versioning/versioning-assistants)
5. [Evals quickstart](https://docs.vapi.ai/observability/evals-quickstart)
6. [Simulations quickstart](https://docs.vapi.ai/observability/simulations-quickstart)
7. [Campaign quickstart](https://docs.vapi.ai/outbound-campaigns/quickstart)
8. [Call logs](https://docs.vapi.ai/observability/logs/call-logs)
9. [Traffic splitting](https://docs.vapi.ai/assistants/versioning/traffic-splitting)
10. [Monitoring quickstart](https://docs.vapi.ai/observability/monitoring-quickstart)

### Retell primary pages

1. [Build your first phone agent](https://docs.retellai.com/get-started/quick-start)
2. [Build overview](https://docs.retellai.com/build/overview)
3. [Configure basic settings](https://docs.retellai.com/build/single-multi-prompt/configure-basic-settings)
4. [Knowledge base setup](https://docs.retellai.com/build/knowledge-base)
5. [Testing overview](https://docs.retellai.com/test/test-overview)
6. [Batch simulation testing](https://docs.retellai.com/test/batch-test-simulation)
7. [Agent versions and tags](https://docs.retellai.com/agent/version)
8. [Compare agent versions](https://docs.retellai.com/agent/version-comparison)
9. [Create and schedule batch calls](https://docs.retellai.com/deploy/make-batch-call)
10. [Call and chat history](https://docs.retellai.com/features/session-history)
11. [Analytics dashboard](https://docs.retellai.com/features/analytics-dashboard)
12. [Post Call Extraction](https://docs.retellai.com/features/post-call-analysis-overview)
13. [Build and refine with Conductor](https://docs.retellai.com/conductor/build-and-refine)
14. [AI Quality Assurance](https://docs.retellai.com/ai-qa/overview)

Supplementary public material:

- **[UPDATE]** Retell's [How to build an AI voice agent in under 30 minutes](https://www.retellai.com/blog/how-to-build-ai-voice-agent-less-than-30-minutes) is an official walkthrough that reinforces prompt → functions → web test → simulation test, but its performance anecdotes are promotional and not used as product proof.
- **[UPDATE]** Retell's [Conductor is Everywhere](https://www.retellai.com/blog/conductor-is-everywhere) documents the September 2026 cross-page assistant update. Its feature descriptions are treated as an official update, not an observed workspace.
- **[WALK]** [Vapi Dashboard Guide](https://vapi.health/learn/vapi-dashboard-guide) is a September 2026 third-party walkthrough. It broadly corroborates the Assistants / Phone Numbers / Logs / Tools and Files / Account mental model and the use of latency waterfalls. It is not a Vapi primary source and is not used where official docs provide stronger evidence.
- **[WALK]** The older [Vapi dashboard quickstart](https://vapi.mintlify.app/quickstart/dashboard) provides historical screenshots of the assistant, dashboard call, and number provisioning flow. It may not match the 2026 UI and is included only as visual lineage.

## Research limitations

- No signed-in product access was used, so this report does not claim direct observation of onboarding, live navigation order, empty states, entitlements, keyboard behaviour, loading states, or responsive behaviour.
- Official documentation may describe features not enabled for every account. Vapi traffic splitting is explicitly beta; some observability features can require access or retained data. Retell features can vary by agent type and workspace/account state.
- Prices, credits, included allowances, available models, phone-number geography, and vendor feature names are time-sensitive. They are included only where they explain an interaction pattern and should be rechecked before implementation copy is written.
- Marketing claims such as sub-second latency, human-likeness, uptime, ROI, and production readiness were not independently tested and are not recommendations for Relay claims.
- Neither documentation set establishes a calibrated general confidence measure for an answer, outcome, sentiment, or extraction. Relay should prefer provenance and review state.
- This report does not evaluate actual voice naturalness, ASR accuracy for Indian languages/accents, interruption quality, carrier delivery in India, compliance coverage, or provider reliability. Those require comparable scripted tests, real devices/networks, representative speakers, and permissioned calls.
- The recommendation is intentionally bounded. It does not propose copying multi-agent graphs, broad integration marketplaces, complex QA cohorts, monitoring rule builders, or provider-specific configuration into Relay's founder default.
