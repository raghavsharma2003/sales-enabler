# Emerging voice projects and products: a Relay UX architecture

**Research date:** 2026-10-01  
**Scope:** first-party public documentation, product pages, and official GitHub repositories for LiveKit Agents, Pipecat/Daily, Dialflo, and Alchemic. This was static research only: no account, demo workspace, provider call, deployment, purchase, or end-user trial was used. Vendor language, volume, speed, quality, and outcome statements remain vendor claims unless the text below identifies a directly documented interface or API behavior.

## The useful distinction: builder technology versus founder SaaS

The four references occupy different layers. Treating them as interchangeable “voice-agent products” would lead Relay toward the wrong UX.

| Reference | Primary user and durable object | What the public evidence actually shows | Relay interpretation |
| --- | --- | --- | --- |
| **LiveKit Agents** | Developer; agent code, deployment, session | Browser prototype builder, Python/Node runtime, workflows, unit tests, cloud simulations, deployment management, session traces and recordings | A useful execution and engineering-quality reference. It does not supply Relay's company, customer, campaign, consent, evidence-review, or decision workflow. |
| **Pipecat + Daily** | Developer; pipeline/flow, agent image, session | Open-source media/AI pipeline, declarative or Python flows, local behavioral evals, metrics/observers, Daily transport, managed or self-hosted runtime choices | A useful reference for portable flow definitions, executable evaluations, and explicit operations. Its YAML, traces, transport, and hosting choices belong behind Relay's product UX. |
| **Dialflo** | Operator/integrator; agent plus **docket** (business task) | Agent configuration, API-triggered outbound calls, per-task context, attempts, completion state, structured call insight, recording/transcript references, webhooks | The useful idea is the business task around the call. Public material does not establish a complete prompt test lab, version comparison, governed knowledge workspace, or inspectable dashboard flow. |
| **Alchemic** | Research/founder team; study and research history | Study brief, guide, screener, quotas, language routing, own list or panel, fielding across phone/web/WhatsApp, live themes, and theme-to-audio evidence drill-down | A directly relevant founder-facing project journey. It shows why the top-level object should be a business question and respondent cohort rather than an agent configuration. |

Relay should therefore use **Project** as the business container and **Agent version** as one implementation inside it. A founder starts with “learn why served customers abandon onboarding” or “qualify this week's applicants,” while an engineer can still open the exact prompt, flow, models, tools, traces, and deployment revision that executed the work.

## The project spine Relay should expose

```text
Project brief
  -> people/cohort + consent/suppression
  -> conversation plan + outcome schema
  -> reviewed knowledge snapshot + allowed tools
  -> agent version
  -> evaluation suite and release decision
  -> channel deployment(s)
  -> sessions / call attempts / traces
  -> reviewed findings and structured outcomes
  -> owner decision / next action / measured follow-up
```

This spine combines the relevant documented patterns without copying a developer console into a founder product.

| Relay object | What it must answer | Evidence pattern informing it |
| --- | --- | --- |
| `project` | What decision or operational result is this work meant to produce? Who owns it? | Alchemic starts with an objective and study; Dialflo calls a docket a business task. |
| `cohort_revision` | Who is eligible, excluded, suppressed, sampled, or still unresolved, and why? | Alchemic exposes own-list versus panel, screeners and quotas. |
| `conversation_revision` | What must be disclosed, asked, extracted, escalated, and stopped? | Alchemic discussion guide; Pipecat Flow nodes; LiveKit agent/task/tool boundaries. |
| `knowledge_snapshot` | Which reviewed sources and facts were usable for this release, with what permissions and effective dates? | LiveKit and Pipecat let developers inject context, but leave corpus governance to the application; Alchemic presents cumulative research history. |
| `agent_version` | Which prompt/flow, models, voice, tools, variables, turn policy and schemas ran? | LiveKit code/config and Dialflo's documented prompt, voice, welcome text, tools and version fields. |
| `eval_suite` / `eval_run` | Which scenarios must pass, in text and audio, before this version can serve people? | LiveKit unit tests and simulations; Pipecat scripted and simulated scenarios. |
| `deployment_binding` | Which approved version is on web, phone, WhatsApp or another channel, in what environment and region? | LiveKit deployment/version operations; Pipecat agent images and region-specific deployment. |
| `session` / `attempt` | What happened on each contact attempt, including no answer, retries, failures and the exact version used? | Dialflo docket attempts and closure state; LiveKit/Pipecat session IDs and traces. |
| `evidence_item` / `finding` | Which transcript span, audio moment, tool receipt and denominator support an interpretation? | Alchemic's theme → respondent → quote → audio path; LiveKit's unified session timeline. |
| `decision` / `follow_up` | What did a human approve, who owns it, and what later result will confirm or refute the finding? | A Relay requirement; none of the reviewed sources proves this complete loop. |

### Project states

Use a small state model shared across feedback, qualification, support and operations projects:

`draft -> needs setup -> ready to test -> testing -> needs review -> approved -> scheduled/active -> paused -> completed -> archived`

Keep exceptions as reasons rather than extra lifecycle states: `identity conflict`, `consent missing`, `knowledge stale`, `eval failed`, `deployment unhealthy`, `provider failure`, `no answer`, `human needed`, or `finding disputed`. Every transition needs actor, timestamp, reason, source version and next owner.

## LiveKit Agents: the engineering lifecycle worth translating

### Documented journey

LiveKit's browser [Agent Builder](https://docs.livekit.io/agents/start/builder/) supports a simple prototype with instructions, greeting, models, actions, variables/metadata, secrets, data collection and call-ending behavior. The operator can talk to a live preview, deploy it to LiveKit Cloud, open a generated test frontend, inspect production sessions in Agent Insights, or download a complete Python project and continue in code. The same page explicitly says Builder does not currently cover workflows/handoffs/tasks, realtime models, virtual avatars, vision, or tests. Preview conversations also do not appear in project observability.

That produces a useful two-stage authoring pattern:

1. **Shape the simplest working conversation in a guided form.** Show goal, greeting/disclosure, information to collect, permitted actions, ending conditions and representative variables.
2. **Escalate complexity to a versioned engineering surface.** Handoffs, task groups, retrieval hooks, dynamic tools, custom turn policy and tests belong in code or advanced configuration. Builder's download-to-code transition is a useful escape hatch, but Relay should retain one version lineage rather than leaving a second deployed prototype behind.

LiveKit's [workflow model](https://docs.livekit.io/agents/logic/workflows/) is also a sound internal vocabulary: an agent owns sustained conversational control; a task is short-lived and returns a typed result; tools read or change external systems; task groups encode ordered multi-step work and allow correction. Distinct agents are appropriate for different permissions or reasoning behavior, such as general inquiry versus payment. Relay can translate these into **phase**, **form-like task**, **approved action**, and **handoff** so a founder does not have to reason about multi-agent topology.

### Testing and failure-to-regression loop

LiveKit's [testing lifecycle](https://docs.livekit.io/testing/) separates four jobs:

- Agent Console for a human to debug by voice or typing while building;
- unit tests for turn-level messages, tool calls, state and handoffs;
- Agent Simulations for a goal-driven conversation judged end-to-end;
- production Agent Insights for real sessions.

[Agent Simulations](https://docs.livekit.io/testing/simulations/) support text or end-to-end audio, transcript verdicts, parallel runs, and degraded audio conditions including background noise, a low-quality microphone and packet loss. The docs recommend deriving a new scenario from a failed recorded session. Relay should adopt that loop: every reviewed production failure should offer **Save as regression case**, prefilled with the originating version, transcript/audio evidence, expected behavior and failure reason. Text checks can run frequently; audio, noisy-line, code-switch and telephony-path checks belong in a pre-release tier.

### Tracing, deployment and knowledge

LiveKit [Agent Insights](https://docs.livekit.io/testing/observability/insights/) puts transcript turns, tool calls, handoffs, traces, logs, audio clips and metrics on one session timeline. Its [observability overview](https://docs.livekit.io/testing/observability/) and [build-your-own guidance](https://docs.livekit.io/testing/observability/build/) distinguish conversation data from service/runtime logs and support data hooks plus OpenTelemetry export. Built-in observability is a LiveKit Cloud capability; it is not available for an entirely self-hosted media and agent deployment. Relay therefore needs its own stable trace and evidence schema even if LiveKit provides the initial viewer.

The [deployment documentation](https://docs.livekit.io/deploy/agents/) covers cloud builds, secrets, versions, rollback, cold starts, runtime/build/session logs and external log drains. Relay should surface only product decisions—approved version, channel, environment, region, health, traffic and rollback—while retaining the provider build and replica details in an engineering drawer.

LiveKit's [external data and RAG guide](https://docs.livekit.io/agents/logic/external-data/) shows loading user/task context before a session, retrieving context on each user turn, or exposing retrieval and actions as tools. It does not provide a governed end-user knowledge product by itself. Relay must own source ingestion, access scope, effective dates, review, retrieval evidence, correction/revocation and the immutable snapshot associated with an agent release.

## Pipecat and Daily: open workflows and executable quality specifications

### Authoring model

Pipecat is an open-source Python pipeline, not a ready-made founder workspace. [Pipecat Flows](https://docs.pipecat.ai/pipecat/flows/introduction) adds a graph of focused conversational nodes on top of the speech pipeline. A flow can be declarative YAML/JSON—node prompts, available tools, transitions, and pre/post actions—or programmatic Python when schemas, dynamic nodes or transport events require code. A declarative flow can be loaded from a file, database or CMS, so non-engineering changes need not require a deployment.

This is a useful internal format for Relay's conversation revisions, with two important adaptations:

- Render a guided phase/branch editor for founders and store a validated flow beneath it; do not expose raw YAML as the main product.
- Use explicit nodes for deterministic stages and permission changes. Keep ordinary conversation within a focused phase instead of turning every utterance into a flowchart edge.

Pipecat documents an architectural constraint worth preserving in the UI: Flows depends on a cascaded STT → text LLM → TTS pipeline with function calling, because it changes context and tools between nodes. It does not support the listed speech-to-speech realtime models for this flow mechanism. Relay's agent version must therefore show when a workflow feature constrains model/runtime choices, rather than silently swapping the architecture.

[State management](https://docs.pipecat.ai/pipecat/flows/state-management) provides per-session cross-node state and fails when a referenced prompt placeholder is missing. Relay should go further: classify state as `session input`, `verified company fact`, `customer-provided claim`, `tool result`, or `model interpretation`; attach provenance; and prevent a conversational placeholder from becoming durable company knowledge without review.

### Evaluation model

[Pipecat Evals](https://docs.pipecat.ai/pipecat/evals/overview) runs scripted turns and simulated callers against the same agent pipeline used for deployment. Scripted scenarios can check response content, exclusions, function calls and latency budgets; simulations give a persona and goal to an LLM caller and judge the whole result. The [evaluation lifecycle](https://docs.pipecat.ai/pipecat/evals/lifecycle) recommends keeping small executable specifications in the repository and running them in CI, with audio mode covering VAD, STT, TTS, turn-taking and transcription.

The same lifecycle is unusually candid about its boundary: local eval transport does not prove the deployed WebSocket/SIP/telephony path, local simulations do not supply population-scale variation or load, transcripts hide some audio artifacts and internal tool failures, and YAML/CI logs are not an operations review queue. Relay should combine the executable cases with a product-level evaluation workspace:

`scenario library -> selected agent version -> runs by text/audio/channel -> failures grouped by cause -> human review -> release decision -> production monitoring -> regression case`

### Tracing and deployment

Pipecat's [metrics documentation](https://docs.pipecat.ai/pipecat/fundamentals/metrics) exposes TTFB, time to first audio, time to first answer token, processing time, sentence aggregation, turn-completion metrics, model usage and structured observers; some metrics attach to OpenTelemetry spans. These are engineering signals. Relay should translate them into perceptible/product signals—silence before reply, premature cutoff, false interruption, tool wait, time to outcome—while retaining the raw stage breakdown for diagnosis.

The [deployment overview](https://docs.pipecat.ai/pipecat/deployment/overview) separates local execution from the production concerns of dispatch, per-session processes, transport and lifecycle. The [production guide](https://docs.pipecat.ai/pipecat/deployment/running-bots-in-production) warns that the development runner is unauthenticated, lacks rate limiting/backpressure and lifecycle management, and should not be exposed as production. It also names the work self-hosting creates: authentication, secret delivery, warm capacity, graceful draining, crash behavior, region placement, quotas, session-ID correlation and observable dispatch.

[Pipecat Cloud](https://docs.pipecat.ai/pipecat-cloud/introduction) is Daily's managed runtime for agent images, session starts, scaling and observability; Pipecat Enterprise places agents in a Kubernetes cluster in the buyer's VPC while Daily retains the control plane. Daily is therefore a transport/runtime option in this research, not a founder-facing telephony product recommendation. Relay should keep WebRTC, WebSocket, SIP/phone and agent runtime as replaceable deployment bindings under the Project.

Knowledge is deliberately application-owned in Pipecat: context aggregation, state, processors, function calls and external services provide building blocks, while no reviewed first-party page establishes a complete governed knowledge-base UI. Relay should not mistake an LLM context buffer or Flow state dictionary for company knowledge.

## Dialflo: turn the call into a business task

Dialflo's [Quickstart](https://docs.dialflo.ai/quickstart) documents a compact journey: obtain an organization token; configure an agent through onboarding/dashboard or API; initiate an outbound call with customer-specific `call_context`; keep the returned task ID; then fetch call status, duration, timestamps, extracted variables and optional recording/transcript references. The documented agent payload includes a prompt, agent name/number, voice ID, version, welcome text, tools, enabled/stats flags, environment-like `server_type`, and call type.

The more valuable product object appears in [Dockets V2](https://docs.dialflo.ai/api-reference/dockets-v2): a docket is a **business task** that may need multiple communications. A client can create without calling, trigger later, create-and-trigger, or bulk create; each docket keeps an external CRM ID and call context, moves through open/in-progress/completed behavior, records attempts and closure reason, and returns structured call disposition/metadata when complete. That maps closely to Relay's need for a durable customer journey rather than a row of disconnected recordings.

Relay should adapt the docket pattern as:

`work item -> contact plan -> authorized attempts -> each provider receipt -> final outcome -> next owner/action`

Add the controls the public API does not establish: idempotency key, consent/suppression revision, retry budget and time window, immutable agent/knowledge version, outcome review, external-write receipt and uncertain-result reconciliation.

Dialflo's [webhook example](https://docs.dialflo.ai/api-reference/webhook) returns extracted metadata, an interest status with confidence and reasoning, next action, recording URL, timing, status and generated call-quality scores. Treat each generated field as a proposal tied to the transcript/audio, not as ground truth. A claim such as satisfaction cannot be inferred safely merely because a person cooperated with questions. Relay should ask a reviewer to accept/correct consequential dispositions and keep carrier facts separate from model interpretations.

The public docs recommend testing voices, networks, response latency, fallbacks, outcomes and gradual concurrency, but no reviewed page exposes a reproducible scenario suite, version comparison, trace timeline or governed knowledge-base workflow. Those are gaps, not evidence that the capabilities do not exist privately.

## Alchemic: a founder-facing project from question to evidence

Alchemic's public [AI Phone Research](https://thealchemic.com/ai-phone-research/) flow is **brief -> calls -> live themes**:

1. The builder captures a discussion guide, screener, quotas and language routing.
2. Calls go to respondents, the AI introduces the study and captures consent, then conducts the interview.
3. Themes, sentiment, quotes and segment/time cuts update as calls complete.
4. A finding drills from theme to respondent to quote to the exact audio moment.
5. Prior studies, themes and brand context form a knowledge base used across waves.

Its [MCP product page](https://thealchemic.com/alchemic-mcp/) adds a useful distribution model: describe an objective from another tool, select a customer list or recruited panel, launch fielding, and receive cited themes, quotes, segments and respondent counts back where the question started. The page names screening, quotas, incentives, dropout detection and response-quality flags as operations the product absorbs.

The Relay lesson is to organize the product around the founder's decision. The founder should not assemble STT, TTS, telephony, runtime and analysis modules. They should create a Project with a question, audience, evidence standard, approved contact policy and decision owner; Relay should compile that into an agent, evaluation suite and deployment.

Several Alchemic claims require care. Its statements about native language quality, code-mixing, research-grade probing, emotion/hesitation detection, scale and faster insight are vendor positioning, not independently reproduced evidence. “Knowledge that compounds” is useful UX language but unsafe as an opaque memory mechanism. Relay should show exactly which prior reviewed findings and source revisions a new project inherits, allow exclusions, and never let an unreviewed model theme silently become future interview context.

For a general company-operations product, also adapt rather than copy the research-only object model. A founder project may be customer feedback, recruiting, support recovery, renewal, collections or logistics. The common contract is **cohort + authorized conversation + structured outcome + evidence + owner action**, while guides, quotas and theme analysis appear only when the project type needs them.

## Cross-product journey and gap map

| Journey stage | Relevant public pattern | Relay should adopt or adapt | Gap Relay must fill |
| --- | --- | --- | --- |
| Start | Alchemic objective/study; Dialflo business-task docket | Start from a decision or operational outcome, with owner and success rule | Prevent a generic “create agent” screen from becoming the home page |
| Select people | Alchemic own list/panel, screener, quotas | Cohort revision with eligibility, identity, consent, exclusions and denominator | CRM identity conflicts, suppression, retry policy and per-channel permission |
| Author | LiveKit guided prototype; Pipecat declarative flows; Alchemic guide | Guided brief and conversation phases, with an advanced implementation view | Immutable revisions, approvals, product/offering binding and AI disclosure |
| Add knowledge | LiveKit context/RAG hooks; Alchemic prior-research context | Reviewed source set and release snapshot with citations and effective dates | Permission-aware ingestion, conflict review, correction, deletion and stale-source handling |
| Test | LiveKit unit tests/simulations; Pipecat scripted/simulated evals | Scenario library, text/audio tiers, exact tool checks and human review | Real channel, noisy Indian-language/code-switch, concurrency and perceptual review |
| Release | LiveKit deployment versions; Pipecat image/runtime/region choices | Version approval, channel bindings, health and rollback | Separate paid-provider authorization, cost guardrails and in-flight-call drain state |
| Run | Dialflo docket attempts; Pipecat/LiveKit session IDs | Per-person journey with attempts, receipts, explicit stop/pause and next action | Idempotency, uncertain external outcomes, provider reconciliation and consent withdrawal |
| Diagnose | LiveKit unified timeline; Pipecat metrics/OTel | Transcript + heard audio + tool receipts + stage latency + version on one timeline | Role-based redaction/retention and business-readable failure causes |
| Learn | Alchemic evidence drill-down; failure-to-regression in LiveKit/Pipecat | Finding with cohort/denominator, quote/audio evidence and reviewer status; save failures as tests | Counter-evidence, model extraction versus accepted interpretation, bias/missingness |
| Act | Dialflo structured next action; Alchemic exports/webhooks | Human-owned decision or bounded authorized action linked to evidence | Approval, idempotency, completion receipt, later outcome measurement and revocation |

## Adopt, adapt, reject

### Adopt

- **A durable Project above the agent.** It connects the business question, people, knowledge, agent release, deployments, sessions, findings and decisions.
- **A business work item around every call.** Keep planned attempts, customer/context binding, final outcome and next owner together, following Dialflo's docket concept.
- **Executable scenario assets.** Store scripted and simulated cases beside each agent version; add audio/channel tiers and convert reviewed failures into regressions.
- **One evidence timeline.** Align what the caller said, what they heard, tool inputs/outputs, handoffs, latency, errors and the exact deployed version.
- **Finding-to-source drill-down.** Let a user traverse theme/outcome -> affected people -> exact quote -> audio moment -> full session, with access controls.
- **Deployment as an explicit binding.** A version is approved separately from its web, phone or messaging channel activation.

### Adapt

- **LiveKit Builder's guided-to-code path:** keep a simple founder authoring surface and an engineering escape hatch, but preserve one Relay lineage and release record.
- **Pipecat Flows:** compile guided phases to a declarative graph where deterministic routing helps; use code for dynamic or transport-driven behavior.
- **Pipecat/LiveKit metrics:** translate stage metrics into perceptible conversation failures and business outcomes without discarding raw traces.
- **Alchemic's cumulative knowledge:** inherit only reviewed, source-backed findings selected for the new project; show their age, cohort and conflicts.
- **Alchemic's automated study:** add launch review for the audience, consent, guide, cost/attempt budget and consequential downstream actions.
- **Dialflo's structured insight:** store generated dispositions, confidence and reasoning as reviewable model output with direct evidence.

### Reject for Relay's founder UX

- A home screen organized around providers, API keys, pipelines, transports or phone numbers.
- A single long prompt presented as the whole agent; prompt, flow, knowledge, tools, turn policy, evaluation and deployment must version together.
- Raw YAML, Python, traces or latency acronyms as the only operating interface.
- A visual graph for ordinary conversational nuance; use it for deterministic phases, permission changes and handoffs.
- “Passed simulation” as proof of live phone quality, Indian-language quality or business impact.
- Auto-promoting a generated theme, sentiment, satisfaction score or “emotion” inference into durable company knowledge.
- Opaque “learning from every call.” Learning should create a source-backed proposal, evaluation change or reviewed finding, never an unreviewed behavior update.
- Public exposure of Pipecat's development runner or any equivalent prototype endpoint.

## Suggested Relay screen hierarchy

1. **Projects** — cards or table grouped by `Needs attention`, `Active`, `Testing`, and `Completed`; each shows decision/outcome, owner, cohort progress, current approved version, channel health and the one next action.
2. **Project overview** — brief, people/cohort, progress funnel, exceptions, latest findings and decisions. This is the founder's main workspace.
3. **Conversation** — guide/phases, disclosure, outcome fields, escalation, stop rules, tools and representative previews. Advanced view reveals compiled flow and provider settings.
4. **Knowledge** — sources, permissions, freshness/conflicts, reviewed facts, inherited findings and the immutable snapshot chosen for the release.
5. **Evaluate** — scenario library, text/audio/channel runs, pass distributions, human reviews, regression cases and release gate.
6. **Deployments** — approved version by channel/environment/region, traffic, cost guardrails, health, rollback and drain status.
7. **Sessions** — searchable journeys and attempts; open one to see aligned audio/transcript/tools/traces/outcome evidence.
8. **Findings & decisions** — themes and structured outcomes with denominator, missingness, counter-evidence, reviewer status, owner action and follow-up measurement.

The founder can complete the common path without leaving the first four concepts: **goal, people, conversation, evidence**. Runtime choices appear only when they block release, spend or quality.

## Name check: “Dalio/Dall-E”

No new primary source establishes a single feedback startup whose identity can be inferred safely from the pronunciation alone. The existing first-party review in [`feedback-product-cases.md`](../../2026-09-27/feedback-product-cases.md) keeps Dialogue, Dilog, Dailo and other phonetic candidates separate; Dialogue is the closest functional match but remains unconfirmed. This memo therefore does not treat any of them as the user's intended product. A URL, logo or exact spelling is still required.

## Access and evidence boundaries

- LiveKit and Pipecat documentation and their linked official GitHub material were publicly readable. No source repository was cloned or executed.
- Dialflo's public documentation was readable, including Quickstart, Dockets V2, Agents and Webhooks. Its marketing site is a client-rendered application, and the public dashboard registration page did not return inspectable content through the research browser. No dashboard or account flow was accessed. The `/pricing` page also did not return readable page content through that browser, so this memo makes no pricing claim.
- Alchemic's public AI Phone Research and MCP pages were readable. No public product dashboard, technical API specification, trace schema, evaluation suite, security/trust detail, or account trial was inspected. Product-screen examples and performance statements are treated as vendor presentations.
- No reviewed source proves competitor superiority, Indian-language quality, empathy, production reliability, a particular buyer's legal compliance, or Relay parity. These patterns define what to prototype and evaluate.

## Primary sources

### LiveKit

1. [Agents introduction](https://docs.livekit.io/agents/)
2. [Agent Builder](https://docs.livekit.io/agents/start/builder/)
3. [Workflows](https://docs.livekit.io/agents/logic/workflows/)
4. [Testing lifecycle](https://docs.livekit.io/testing/)
5. [Unit tests](https://docs.livekit.io/testing/unit-tests/)
6. [Agent Simulations](https://docs.livekit.io/testing/simulations/)
7. [Agent Insights](https://docs.livekit.io/testing/observability/insights/)
8. [Observability overview](https://docs.livekit.io/testing/observability/)
9. [Deployment overview](https://docs.livekit.io/deploy/agents/)
10. [External data and RAG](https://docs.livekit.io/agents/logic/external-data/)

### Pipecat and Daily

11. [Pipecat Flows](https://docs.pipecat.ai/pipecat/flows/introduction)
12. [Flow state management](https://docs.pipecat.ai/pipecat/flows/state-management)
13. [Pipecat Evals](https://docs.pipecat.ai/pipecat/evals/overview)
14. [Evals lifecycle and limitations](https://docs.pipecat.ai/pipecat/evals/lifecycle)
15. [Metrics](https://docs.pipecat.ai/pipecat/fundamentals/metrics)
16. [Deployment overview](https://docs.pipecat.ai/pipecat/deployment/overview)
17. [Running bots in production](https://docs.pipecat.ai/pipecat/deployment/running-bots-in-production)
18. [Pipecat Cloud and Enterprise](https://docs.pipecat.ai/pipecat-cloud/introduction)
19. [Pipecat repository](https://github.com/pipecat-ai/pipecat)
20. [Flows examples and eval notes](https://github.com/pipecat-ai/pipecat/blob/main/examples/flows/README.md)

### Founder/operator products

21. [Dialflo introduction](https://docs.dialflo.ai/)
22. [Dialflo Quickstart](https://docs.dialflo.ai/quickstart)
23. [Dialflo Dockets V2](https://docs.dialflo.ai/api-reference/dockets-v2)
24. [Dialflo Agents](https://docs.dialflo.ai/api-reference/agents)
25. [Dialflo Webhooks](https://docs.dialflo.ai/api-reference/webhook)
26. [Dialflo voice-call optimization](https://docs.dialflo.ai/voice_call)
27. [Alchemic AI Phone Research](https://thealchemic.com/ai-phone-research/)
28. [Alchemic MCP](https://thealchemic.com/alchemic-mcp/)
