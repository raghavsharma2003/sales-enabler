# Product/UX reset synthesis — 1 October 2026

## Method and evidence boundary

This synthesis combines two independent Relay assessments: **Assessment A — `oct01_ux_code_audit`**, a first-hand review of the authenticated fictional workspace plus source/handler tracing; and **Assessment B — `oct01_ux_evidence_audit`**, an isolated deterministic scan and browser measurement. It also compares current public first-party material for voice-agent, CRM/campaign, research, and runtime products. Competitor findings below are **documented UI or vendor claims**, not first-hand signed-in trials: no competitor account, call, purchase, upload, or deployment was used.

Assessment A's Nielsen baseline was **19/40 (0–4 scale)**. This is a subjective expert assessment, independent of Assessment B, and **not a user test**. Assessment B's scoped CLI scan was clean (zero findings); at a 1280×720 browser viewport it still measured **44 work-area controls in Agents across three simultaneous panes** and a 1,622 px document. The two results are compatible: component hygiene is respectable, while task composition and product structure remain difficult.

## Product conclusion

Relay's strongest product is not a generic voice-agent builder. It is a governed company-to-customer operating loop: reviewed company evidence becomes a bounded representative and campaign; each customer attempt produces an attributable outcome, commitment, or proposed improvement. The product lost that loop by presenting its implementation records as peers.

The current reset is the correct first correction. The visible shell becomes five working areas—**Overview, Company, Agents, Campaigns, Activity**, plus Settings—while all old section hashes remain resolvable. Overview derives one real next action from readiness and shows `Needs review` and recent work. Agent editing becomes a compact picker, spacious editor, and persistently mounted test dock; six task sections begin with Setup, unsaved navigation is guarded, and prompts are no longer repeated above every section. Agent-local Publish captures a saved version, runs checks against that exact version, and requires an explicit publish before channel handoff. Search and deep anchors now include versions, checks, releases, deployments, and sessions. Campaigns receives the missing main landmark and source-audit fixes.

These changes reduce navigation and lifecycle reconstruction; they do not complete the deeper campaign, source-intake, or learning redesign. They also do not establish hosted deployment, live external channels, telephone readiness, or competitor superiority.

## Five causes of the usability failure

1. **The shell exposed the storage model.** Eighteen peer destinations forced founders to learn sources, versions, checks, releases, deployments, sessions, and reviews before completing a customer job.
2. **Relay showed two disconnected lifecycles.** Agent work used `draft → version → check → release → deployment`; campaign work used `plan → draft → preflight → run → conversation → learning`. No parent object explained why both existed.
3. **Home confused an empty queue with readiness.** `0 needing review` and `No open decisions` could coexist with 0/5 company readiness, leaving a first-time founder without a truthful next step.
4. **Artifact scope was invisible.** Save, test, check, publish, and deploy were each technically careful, but the interface did not consistently name whether an action targeted the working draft, an immutable version, the active release, or a channel snapshot.
5. **Evidence did not become reusable quality work.** Conversations, result extraction, reviewed learning, tests, and revisions existed, but a bad transcript turn could not yet become a regression case, proposed fix, rerun, and publish decision in one traceable path.

## What the market evidence actually supports

| Reference | Documented pattern | Relay decision |
| --- | --- | --- |
| Vapi | Agent-local draft/publish diff, immutable versions, simulations, and detailed call evidence ([versioning](https://docs.vapi.ai/assistants/versioning/versioning-assistants), [simulations](https://docs.vapi.ai/observability/simulations-quickstart), [call logs](https://docs.vapi.ai/observability/logs/call-logs)) | Keep immutable records, but gather readiness and publication around the agent. |
| Retell | Draft/published versions with semantic comparison; saved scenarios and exact-version batch results ([versions](https://docs.retellai.com/agent/version), [comparison](https://docs.retellai.com/agent/version-comparison), [batch tests](https://docs.retellai.com/test/batch-test-simulation)) | Name the test target and bring checks, diff, and explicit publish into one panel. |
| ElevenLabs | Conversation-to-test, probabilistic reruns, version branches, and controlled deployment evidence ([agent testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing), [versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning)) | Turn reviewed failures into regressions; defer traffic experiments until assignment and outcome evidence are sound. |
| Bolna | Business-language Auto Build, persistent editor tests, per-language configuration, and explicit batch recipient inputs ([Auto Build](https://www.bolna.ai/docs/agent-setup/studio), [Agent Studio](https://www.bolna.ai/docs/agent-setup/overview), [batch calling](https://www.bolna.ai/docs/outbound/batch-calling)) | Adapt the short brief and explicit mappings; require Relay's source, consent, and review boundaries. |
| Intercom Fin | Train/test/deploy lifecycle, source governance, previews, and evidence-linked recommendations ([knowledge sources](https://www.intercom.com/help/en/articles/9440354-knowledge-sources-to-power-ai-agents-and-self-serve-support), [test modes](https://www.intercom.com/help/en/articles/14077180-simulations-vs-batch-tests-vs-previews)) | Make activation governed and improvements attributable; do not inherit support resolution as the universal outcome. |
| Attio and Clay | Durable records plus workflow-specific state; visible audience readiness, exclusions, immutable enrollment data, and event histories ([Attio data model](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model), [Clay lead readiness](https://university.clay.com/docs/get-leads-ready-to-sequence), [campaign events](https://university.clay.com/docs/automate-campaign-events)) | Separate company/customer truth from campaign participation; preview mappings and exclusions before spend or contact. |
| Dialflo and Alchemic | A business-task docket around attempts; a research brief that drills from finding to quote/audio ([Dialflo Dockets V2](https://docs.dialflo.ai/api-reference/dockets-v2), [Alchemic AI Phone Research](https://thealchemic.com/ai-phone-research/)) | Put a business project above the call and preserve finding-to-evidence traversal. Public material is limited and no dashboard was inspected. |

LiveKit and Pipecat are builder/runtime references, not demonstrated end-user competitors. Their useful patterns are executable scenarios, exact-version traces, deployment bindings, and failure-to-regression loops ([LiveKit testing](https://docs.livekit.io/testing/), [Pipecat evals](https://docs.pipecat.ai/pipecat/evals/overview)). Relay should translate these into founder language and keep provider/runtime controls behind the product workflow. The user's “Dalio” reference remains unresolved; Dialogue, Dilog, Dailo, and other phonetic candidates must not be merged without an exact name or URL.

## Target product model and its boundaries (proposed)

- **Company** owns identity, people, offerings, reviewed facts, sources, permissions, and freshness. It does not own one campaign's transient choices.
- **Project** is the durable business question or job: desired decision/result, owner, cohort policy, evidence standard, budget, and completion rule. `Campaign` is its scheduled execution for now; this parent concept prevents the agent from becoming the product.
- **Audience revision** records eligibility, exclusions, identity resolution, consent/contactability, language/timezone, denominator, and the reason each person is included. Launch freezes the selected revision.
- **Representative version** freezes instructions, disclosure, voice/language behavior, tools, knowledge scope, escalation, stop rules, and test evidence. A saved draft is mutable; a version is not live by itself.
- **Deployment binding** says which approved version may serve which channel, environment, origin, and limits. Publication and channel activation remain separate, explicit acts.
- **Customer work item** surrounds all attempts for one person and purpose: planned contact, receipts, uncertain states, final outcome, commitment, and next owner. A conversation is one immutable attempt, not the customer journey.
- **Finding/review item** is a proposed interpretation or mutation tied to transcript/audio/tool/source evidence. Acceptance changes a named object/version; raw model inference never silently becomes company truth.

## Target founder and customer-feedback flow

This is the target journey; the complete flow is not implemented in this pass. A founder chooses **Learn why recently served customers needed repeated follow-up**. Relay asks for one source: a customer CSV or connected table. Intake shows upload/processing progress, proposes the unique customer identifier and result columns, separates valid, unresolved, and rejected rows, and asks the founder to confirm one mapping rather than configure the whole Brain.

Relay creates one Project with a feedback objective, owner, completion rule, and reviewed Offering. The founder reviews the proposed audience, exclusions, consent/contactability, language and calling window, then samples a few people with an explanation of why each is included. Relay proposes the representative's disclosure, interview phases, approved knowledge, prohibited claims, escalation, outcome fields, and close. The founder tests a scenario against the draft, captures the exact version, runs release checks, reviews the diff and evidence, publishes it, and activates only an available authorized channel. Telephone never appears as ready merely because a provider could support it.

For each customer, Relay opens one work item and records every attempt separately. The customer hears that the representative is AI, can stop, correct context, or ask for a person. The resulting record separates `customer stated`, `AI inferred`, `operator reviewed`, and `verified action`; a promised follow-up receives an owner and due state. A weak question or unsupported answer can be selected in the transcript and saved as a regression with the originating version, evidence, expected behavior, and failure cause. Relay proposes a bounded agent or source change, reruns the affected case, and requires an explicit publish. The Project reports people reached separately from attempts, shows missingness and counter-evidence, and ends with a reviewed finding and owned business action—not merely a call count or sentiment score.

## Adopt, adapt, defer, reject

- **Adopt:** one visible lifecycle per representative; exact test targets; semantic publish diff; audience exclusion preview; attempt-versus-person reporting; transcript-to-regression; evidence labels and operator correction.
- **Adapt:** a Project above Campaign; business-language brief with advanced controls; reusable Company knowledge shown contextually with dependency impact; compact campaign preflight with Relay's consent, authority, immutable snapshots, and uncertain-outcome handling.
- **Defer:** telephone/India operational readiness, live traffic splitting, broad alert builders, workflow graph editing, cross-channel orchestration, and generalized AI copilot behavior until real usage and evidence justify them.
- **Reject:** provider-first onboarding, an unlimited blank-canvas builder, raw prompt/JSON/YAML as the founder path, numeric confidence without calibration, autonomous learning or publish, and any claim that a configured runtime proves live quality or business value.

## Ranked P1 work after the current pass

1. **Make Campaign one object.** Replace Plan/Manage/Write branches with durable phases: Intent → Audience → Representative → Review → Run → Results. AI and manual authoring become assistance methods inside Intent; the proposal remains attributable behind the campaign.
2. **Make data intake show progress and decisions.** One intake job should expose processing state, identity/result mapping, valid/unresolved/rejected counts, conflicts, and the exact blocker. Confirming import must not imply that extracted claims are approved facts.
3. **Build transcript-to-regression.** From an exact turn/audio/tool event, create a reusable case bound to the originating version, expected behavior, evidence and failure cause; run it against the draft, review the proposed change, and carry the result into Publish.

Questions skipped: founder/use-case/provider constraints and authorization to improve are already established.
