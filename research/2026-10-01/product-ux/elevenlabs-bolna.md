# ElevenLabs Agents and Bolna: current product/UX research for Relay

**Research date:** 1 October 2026

**Scope:** Public first-party product pages, documentation, screenshots embedded in official documentation, and official public walkthroughs. No competitor account was created, no signed-in dashboard was inspected, and no real call, purchase, upload, or deployment was attempted.

**Relay baseline:** Current local UI/code and the existing product blueprint were inspected read-only. No implementation work is part of this report.

## Evidence labels

- **Documented UI** means the vendor's current official documentation names the navigation, control, screen, state, or interaction, often with a current screenshot or screenshot description.
- **Vendor claim** means the vendor says a capability, quality, timing, scale, or outcome exists. It was not independently tested here.
- **Inference** means a product recommendation derived from the documented flow. It is not a claim that the competitor implements the recommendation exactly.
- **Relay observation** means it is present in the checked local code or current project documentation.

Public documentation can lag or lead production. Where two current pages disagree, this report records the tension rather than choosing the more flattering interpretation.

## Executive decision

Relay should keep its review-first data model, immutable agent versions, explicit release gate, and separate deployment snapshots. It should stop exposing those objects as a founder's primary navigation model.

The user described Relay as having 20 flat navigation items. The checked current code has **18 named page buttons** across Operate, Build, Improve, and Workspace, plus global search and the Provider setup shortcut. The usability conclusion is the same: a new founder sees nearly the full internal object model at once. The local agent page is already a credible three-column workbench—agent/task presets on the left, prompt and settings in the centre, live draft tester on the right—but its normal path then asks the user to understand **Save changes → Capture version → Test Lab → Releases → Deployments** as separate concepts and destinations.

The strongest competitor lesson is not “copy their dashboard.” It is this:

> Keep the quick build-test loop beside the thing being edited, progressively reveal technical controls, and turn production proof into a connected lifecycle rather than five disconnected modules.

ElevenLabs is the better reference for reusable tests, conversation-to-regression, version branches, controlled traffic, and analysis that links back to a version. Bolna is the better reference for a non-technical India-first setup brief, per-language prompt/voice/transcriber configuration, phone test options, batch recipient mechanics, Indian number compliance, and operational call history. Relay's stronger contribution is reviewed company knowledge, explicit source authority, safe natural-language revision, customer/result-column semantics, and release/deployment immutability. The redesigned flow should combine these strengths without importing either vendor's control sprawl.

## The two product models

### ElevenLabs: agent-centric configure → deploy → monitor

**Documented UI.** The public docs use three top-level conceptual groups: **Configure**, **Deploy**, and **Monitor**. Within an agent, the dashboard includes Agent, Voice, Knowledge Base, Analysis, Widget, Tests, and version/branch surfaces. A quick draft conversation is launched with **Test AI agent** from the agent dashboard. Reusable automated QA lives in the agent's **Tests** tab. Deployment surfaces include widget, SDKs, telephony, WhatsApp, and batch calls. Analytics and conversation review are workspace-level monitoring surfaces.

This is a mature expert model. It treats an agent as a configurable executable with tests, analysis rules, versions, branches, traffic allocation, and conversation evidence. The risk for Relay is copying its depth before Relay has enough production volume or team roles to justify every peer surface.

### Bolna: Build → Deploy → Monitor with an agent studio inside Build

**Documented UI.** Bolna's current Agent Studio screenshot and guide explicitly show a product rail organized as **Build, Deploy, Monitor**. Inside Build → Agent Studio, the screen has an agent list, an agent header, seven configuration tabs, and a persistent bottom-right action bar. The seven cascaded-agent tabs are **Agent, Intelligence, Languages, Calling, Engine, Tools, Extractions**. The header exposes editable name, voice engine, agent ID, call history, estimated cost/minute, and routing region. The action bar keeps **Save agent**, **Get a call from agent**, and a dropdown for **Chat with agent** and **Web Call (Beta)** in the editor.

This is operationally legible: the user stays with one agent while moving from prompt to voice to a test. It also exposes provider and telephony complexity early. Relay should borrow the locality of the loop, not the expectation that a founder must understand seven technical tabs.

## End-to-end journey comparison

### 1. Sign up and first orientation

#### ElevenLabs

- **Documented UI.** The public sign-up screen offers Google or email/password, with sign-in as the alternate path. The account guide says email sign-ups require verification; the general account journey lands on Speech Synthesis, not specifically ElevenAgents. The Agents quickstart then tells the user to sign in, create a new assistant, name it, and choose **Blank template**.
- **Documented UI / public walkthrough.** A newer official beginner guide describes a plus icon beside Agents and an optional setup flow that can ask for agent type, industry, tools/knowledge, use case, main goal, and name. It also describes Personal Assistant, Business Agent, Blank Agent, and a library of 60 templates. Because this is a public guide rather than a signed-in observation, treat the exact template count and questions as documented vendor material, not independently verified current UI.
- **UX read.** Account creation is generic to the broader ElevenLabs suite. The Agents quickstart assumes the user can translate “assistant,” “system prompt,” and “knowledge base” into a business outcome.

Primary evidence: [Sign up](https://elevenlabs.io/app/sign-up), [account setup](https://elevenlabs.io/docs/overview/administration/account), [Agents quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart/), [beginner guide](https://elevenlabs.io/blog/building-your-first-conversational-ai-agent-a-beginners-guide).

#### Bolna

- **Documented UI.** The public platform route currently presents “Welcome back” and sign-in. The docs begin after login at Build → Agent Studio and require a valid account for API work. Public docs reviewed here do not document the account-creation, verification, workspace naming, or first-login flow.
- **Boundary.** No claim can be made here about Bolna's signed-out onboarding beyond the public sign-in page.
- **UX read.** Once inside Agent Studio, orientation is clearer than ElevenLabs for a calling use case because the page immediately presents “Your Agents,” New Agent, Import, the chosen agent, cost/routing, configuration tabs, save, and test actions.

Primary evidence: [Bolna platform sign-in](https://platform.bolna.ai/), [Agent Studio overview](https://www.bolna.ai/docs/agent-setup/overview), [API introduction](https://docs.bolna.ai/api-reference/introduction).

#### Relay implication

**Adopt:** Relay's current company-name/work-email/password registration already orients around a company rather than a generic audio account. Preserve it.

**Adapt:** After registration, do not drop the founder into Command centre with an empty 18-page rail. Start a five-step “Get Relay ready” home:

1. Describe the company and choose the first job.
2. Add the minimum knowledge/customer data for that job.
3. Review the proposed representative.
4. Try one browser conversation.
5. Review and publish the first web deployment.

Show progress and allow exit, but make the next incomplete task dominant. Invite teammates, advanced providers, automations, GroupAI, and cross-channel setup after the first useful loop.

### 2. Turn a business goal into an agent

#### ElevenLabs

- **Documented UI.** The basic quickstart starts from Blank template, then asks for a first message and system prompt in the Agent tab. The official beginner guide says templates can prefill a prompt and workflow for customer support, education, receptionist, sales, and outreach.
- **Documented UI.** **Architect** is now available as a floating/sidebar helper across the app and as a full-screen tab inside a specific agent, opened through “Discuss,” “Improve,” or “Make with Architect.” It can read and edit configuration, workflow, procedures, tools, tests, and knowledge base, but stages changes as unpublished drafts and requires a publish review.
- **Important nuance.** Architect's own documentation describes its primary job as improving an agent already built: inspect real conversations and triage tickets, understand what went wrong, and turn that into a prompt/workflow/tool/test/knowledge change. It is more than first-run goal authoring.
- **Defaults versus advanced.** The blank quickstart exposes first message and system prompt first. Models, workflow, turn behavior, tools, guardrails, versions, and environment controls are deeper configuration. This is appropriate progressive disclosure.

Primary evidence: [quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart/), [beginner guide](https://elevenlabs.io/blog/building-your-first-conversational-ai-agent-a-beginners-guide), [Architect overview](https://elevenlabs.io/docs/eleven-agents/operate/architect), [how Architect works](https://elevenlabs.io/docs/eleven-agents/operate/architect/how-it-works), [Architect approvals and drafts](https://elevenlabs.io/docs/eleven-agents/operate/architect/authentication).

#### Bolna

- **Documented UI.** New Agent offers **Auto Build, Start from Template, or from scratch**. New agents remain draft until saved.
- **Documented UI.** Auto Build is a three-step form:
  1. **Identity & Goal:** agent name, industry, designation, company, optional description, one or more languages with a primary, gender, tone, and a one-to-two-sentence call outcome.
  2. **Conversation:** welcome message, hard guardrails, numbered conversation flow.
  3. **Closing:** final line and optional hangup prompt.
- **Documented UI.** A PDF, DOCX, TXT, or CSV brief may prefill the fields; the user can add manual detail. Bolna says generation takes 5–8 minutes, the user may navigate away, a voice is auto-selected, and the prompt remains editable afterward.
- **Vendor claim.** “Production-grade” and “call-ready” in 5–8 minutes are vendor claims. The generated agent still needs human review and tests; the same docs direct the user to edit voice/prompt and test it.
- **Documented UI.** In the prompt Canvas, each language has a prompt tab, token count, variables, **Browse Modules**, and **AI Edit**. AI Edit moves the rest of the tab aside, presents line additions/removals as a diff, and requires Approve or Discard before the next request. Approval saves the prompt, but **Save agent** is still required for calls to use it.

Primary evidence: [Agent Studio Auto Build](https://www.bolna.ai/docs/agent-setup/studio), [Agent Studio layout](https://www.bolna.ai/docs/agent-setup/overview), [Agent tab and AI Edit](https://www.bolna.ai/docs/agent-setup/agent-tab).

#### Relay implication

Relay already has stronger safe-edit mechanics than a naive “build with AI” flow:

- **Relay observation.** “Start from a task” presets create a draft.
- **Relay observation.** Natural-language AgentRevision can edit only five allowlisted fields; it saves an instruction, explanation, before/proposed values, detects stale revisions, and requires explicit apply to the saved draft. Applying creates neither a version nor a release.

**Adopt from Bolna:** a business brief with **role, job, desired outcome, prohibited claims/actions, language, opening, close, and human escalation**. Let approved company sources prefill suggestions, with every generated value reviewable.

**Adapt from Architect:** add context-aware improvement entry points from a failed test, conversation turn, knowledge gap, or action failure. Pre-fill the proposed instruction with the cited evidence. Keep Relay's allowlisted field edits and before/after review. Expand editable scope only when each new field has a comprehensible authority model and side-effect preview.

**Reject:** a free-floating global AI builder that can silently change tools, knowledge, releases, or channel bindings. Architect itself stages drafts and publish review; Relay should remain at least that strict.

### 3. Add company data and knowledge

#### ElevenLabs

- **Documented UI.** Documents may be added from the knowledge-base dashboard or directly from an agent. Sources include files, URLs, and plain text. Supported uploads include PDF, TXT, DOCX, HTML, EPUB, and Markdown up to 20 MB.
- **Documented UI.** URL import can take one page, crawl linked pages, or use a sitemap. Documents can be organized into folders and attached in bulk.
- **Documented UI.** Document detail exposes a **Dependent agents** tab. A document cannot be deleted while an agent depends on it unless forced deletion detaches dependents.
- **Documented default.** Usage mode `auto` uses RAG if RAG is enabled and the document is indexed; otherwise it uses full context. Folders always require RAG.
- **UX strength.** Shared source maintenance and dependency visibility are stronger than uploading the same file separately inside every agent.

Primary evidence: [knowledge base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base), [manage documents](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/manage-documents).

#### Bolna

- **Documented UI.** Knowledge is a distinct Build → Knowledge Base page with API, MCP, and Add Knowledge Base controls, plus a table of RAG ID, source, type, created date, processing status, and delete.
- **Documented UI.** The dashboard flow supports PDF upload or URL. PDF upload is currently documented as PDF-only even though Auto Build accepts PDF/DOCX/TXT/CSV as a brief. Those are two different ingestion jobs and should not be conflated.
- **Documented UI.** At creation the operator chooses **English (Default)** or **Multilingual (Hindi, Tamil, etc.)**. Cross-lingual retrieval requires Multilingual at creation. Existing default/English KBs cannot simply be toggled to multilingual; a new multilingual knowledge base is required.
- **Documented UI.** A processed KB is then attached to the agent from the Intelligence tab.
- **UX weakness.** The user must understand that an Auto Build brief, a platform KB, processing status, and agent attachment are separate states.

Primary evidence: [Bolna knowledge base](https://www.bolna.ai/docs/knowledge-base), [Intelligence/LLM tab](https://www.bolna.ai/docs/agent-setup/llm-tab), [Auto Build](https://www.bolna.ai/docs/agent-setup/studio).

#### Relay implication

**Adopt from ElevenLabs:** dependency visibility—“used by 3 agents / 2 releases / 1 campaign”—before correction, expiry, or deletion.

**Keep from Relay:** source-backed proposals, reviewed mappings, identity/result-column review, approved-source attachment, and recheck on version/release. Neither competitor's public workflow gives the same prominence to authoritative fields, conflicting claims, or operator-reviewed company truth.

**Adapt:** onboarding should ask for the minimum source needed for the selected job, then show three result buckets: **ready to use**, **needs your review**, and **still unknown**. The founder should not have to visit Company brain, Customers, and Agents independently to infer whether the first representative is grounded.

### 4. Choose voice, language, and Indian operating behavior

#### ElevenLabs

- **Documented default.** A new agent starts with English, Flash v2 for fast English-only responses, and a default first message. Additional languages move non-English output to the v2.5 multilingual model; English remains on v2.
- **Documented UI.** Additional Languages sits in the Agent tab. The first message is automatically translated and should be reviewed/customized. A language-specific voice can be selected. The widget can ask for preferred language before starting.
- **Documentation tension.** The language page says the language-detection tool can automatically switch to the user's preferred language, but the same current page says the selected language is fixed for the duration of the call. This does not support a confident claim of live intra-call Hindi-English switching from this page alone.
- **Documented advanced controls.** Voice customization includes voice choice, speed from 0.7× to 1.2×, pronunciation dictionaries, language-specific voices, multi-voice, Expressive Mode, and audio environment. The docs advise starting at speed 1.0 and testing business-specific terms.
- **UX read.** ElevenLabs makes a quick English voice easy, with richer voice craft available later. The “All languages” control and auto-translation can create false confidence unless the UI makes human review and per-language proof visible.

Primary evidence: [language configuration](https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language), [voice customization](https://elevenlabs.io/docs/eleven-agents/customization/voice), [quickstart voice step](https://elevenlabs.io/docs/eleven-agents/quickstart/).

#### Bolna

- **Documented UI.** Language tabs are created in Agent; each language gets its own native-script prompt. A crown makes one language default. The default cannot be removed until another is promoted.
- **Documented UI.** The Languages tab then configures each existing language independently: voice provider/model/voice, transcription provider/model, hand-in behavior, keywords/context, and advanced tuning. The current documented provider selector includes AzureTTS, Cartesia, ElevenLabs, and Sarvam. Voice lists are searchable and filterable by gender, with per-voice previews and a welcome-message preview.
- **Documented default.** The switch condition defaults to **requested or auto detected**; it may instead require an explicit caller request. Bolna's switching guide says a full sentence can cause a switch, while a borrowed word, greeting, OTP, or order number should not. It describes a current-language recognizer plus a background language detector.
- **Documented UI.** Prompt variables automatically become fields in the testing section; the timezone is separately selectable, with Asia/Kolkata shown in the docs. JSON-valued variables receive a structured editor and syntax validation.
- **Documented advanced controls.** Voice buffer, speed, similarity, stability, style, custom voice import/clone, transcriber keywords/context, endpointing, interruption thresholds, precise transcript, silence checks, call timeout, voicemail, DTMF, noise cancellation, and calling-time restrictions are deeper surfaces.
- **Boundary.** Provider options and vendor descriptions do not establish Hindi/Hinglish accuracy, accent quality, latency, or consistent mid-sentence code-switch performance for a chosen carrier/model combination.

Primary evidence: [Agent prompt/language tabs](https://www.bolna.ai/docs/agent-setup/agent-tab), [Languages, voice, and transcription](https://www.bolna.ai/docs/agent-setup/audio-tab), [language switching behavior](https://www.bolna.ai/docs/customizations/language-switching-behavior), [engine/interruptions](https://www.bolna.ai/docs/agent-setup/engine-tab), [calling settings](https://www.bolna.ai/docs/agent-setup/call-tab).

#### Relay implication

Use a two-level language surface:

- **Default:** primary language, allowed switches, one recommended regional voice, reviewed opening/disclosure/close, and a short pronunciation list.
- **Advanced per language:** script-specific prompt additions, voice/STT model, switch policy, hand-in message, vocabulary/context, pacing, endpointing, and provider details.

Every added language should show a completion checklist: opening reviewed, AI disclosure reviewed, close reviewed, voice sampled, names/numbers/rupees tested, code-switch scenario tested, and real audio not yet/now human-rated. “Allowed language” must not read as “production quality proven.”

### 5. Test in the browser and on a real call

#### ElevenLabs

- **Documented UI.** **Test AI agent** is the quickest manual preview from the agent dashboard. The environment selector appears in the preview when multiple environments exist; one environment hides it.
- **Documented UI.** The Tests tab has three reusable test types:
  - **Simulation:** natural-language caller scenario, success condition, 1–50 turns, default 5; optional environment, prior chat history, dynamic variables, and tool mocking.
  - **Next Reply:** prior chat history, plain-language success criteria, success/failure examples, then LLM evaluation of the next reply.
  - **Tool Call:** expected tool and argument checks using exact match, regex, or LLM evaluation.
- **Documented UI.** Tests can be created from a failed real conversation: open call history, click **Create test from this conversation**, review prefilled context, define expected behavior, and add it to the suite.
- **Documented UI.** A user may run an individual test, selected tests, a folder, or Run All Tests. Split-run controls rerun tests 3×, 5×, or 15× in the documented current page; the API supports 2–20. Results show a pass rate and group failures by reason, with underlying transcripts and evaluator rationale.
- **UX strength.** Quick subjective tryout and reusable proof are separate but connected. Failure clusters answer “how does it fail?” instead of only “did it pass?”

Primary evidence: [Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing), [environment selection](https://elevenlabs.io/docs/eleven-agents/integrate/environment-variables), [quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart/).

#### Bolna

- **Documented UI.** The agent editor's test dropdown offers **Chat with agent**, **Web Call (Beta)**, and **Get a call from agent**. Bolna explicitly recommends chat for fast iteration, then a real phone call before deployment.
- **Documented UI.** Graph agents keep testing inside the right inspector. With nothing selected, the inspector tabs are Agent setup, Tools, and Test agent. Chat shows the active node; call mode takes an E.164 number and runs the full TTS/STT/telephony configuration.
- **Documented boundary.** Chat does not test TTS, STT, or audio latency. The real call consumes telephony/LLM credits and uses the latest saved agent, so the docs warn the user to save first.
- **Vendor claim / new surface.** A September 2026 official engineering post says customers can now put agents on their websites through a session API and browser SDK and receive the same recordings/analytics. The reviewed main documentation index does not yet expose an end-user web deployment guide comparable to ElevenLabs' Widget page. Treat availability and packaging as a vendor report, not a fully documented UI flow.

Primary evidence: [Agent Studio test options](https://www.bolna.ai/docs/agent-setup/overview), [graph-agent testing](https://www.bolna.ai/docs/graph-agent/testing), [browser-call engineering post](https://www.bolna.ai/blog/browser-calls-kamailio-freeswitch).

#### Relay implication

Relay's pinned browser tester is a strength and should remain inside the agent workspace. Change its framing:

- **Try draft**: quick text or Listen & type, explicitly exploratory and not release evidence.
- **Test scenario**: save the current setup plus caller context, inputs, expected behavior, and allowed tool results as a reusable case.
- **Verify voice**: real browser microphone/device or controlled audio; acoustic metrics and human rating remain separate.
- **Phone test**: only after telephone integration exists; no placeholder connected-number UI.

Add **Save as regression** to saved conversations and failed turns. Let the builder re-run that case against the current draft from the same right-hand panel. The full Test Lab remains useful for suite management, cross-version comparison, and trace inspection; it should not be mandatory for every draft iteration.

### 6. Version, release, and controlled rollout

#### ElevenLabs

- **Documented UI.** Versioning is opt-in and permanent once enabled. Enabling it adds a Main branch and a Versioning/Branches surface. Saving a versioned agent creates an immutable version; unsaved changes are per-user, per-branch drafts.
- **Documented UI.** Users create branches from any version, edit and save to create new versions, preview merges/rebases, and allocate live traffic by percentage. Percentages must total 100%; routing is deterministic by conversation ID.
- **Documented UI.** The experiment path is explicit: **Create branch → Edit traffic split → See analytics → increase traffic or merge winner**. The agent configuration links directly to branch-filtered analytics.
- **UX strength.** Configuration, exposure, and observed results share the same branch identity.
- **Risk.** Git terminology, branch conflicts, rebase, merge proposal, and traffic math are appropriate for mature teams but excessive for a founder's first release.

Primary evidence: [versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning), [experiments](https://elevenlabs.io/docs/eleven-agents/operate/experiments), [analytics](https://elevenlabs.io/docs/eleven-agents/dashboard).

#### Bolna

- **Documented UI.** Conventional agents are drafts until saved; changes take effect after Save agent. The reviewed current guide does not describe a separate publish/release gate for ordinary prompt agents.
- **Documented UI.** Graph agents create a version snapshot on every save. Version history opens as a right-side sheet over the canvas and lists version number, saved time, Current, and Restore. Restore creates a new save and preserves history, but discards current unsaved work.
- **Documented UI.** Graph editor Validate is distinct from Save. Validation shows blocking errors and non-blocking warnings; toolbar state indicates unsaved changes and last saved time.
- **UX strength.** Version history is close to the editor and rollback is understandable. It is much lighter than a branch/traffic model.
- **Weakness for Relay's needs.** A save-history model does not establish a reviewed release artifact, test evidence, dependency digest, or channel-specific deployment authority.

Primary evidence: [graph editor](https://www.bolna.ai/docs/graph-agent/using-the-editor), [version history](https://www.bolna.ai/docs/graph-agent/version-history), [validation](https://www.bolna.ai/docs/graph-agent/validation), [Agent Studio save behavior](https://www.bolna.ai/docs/agent-setup/overview).

#### Relay implication

Keep the data separation, simplify the presentation:

| Relay object | Keep? | Founder-facing wording |
| --- | --- | --- |
| Saved draft | Yes | “Working copy” |
| Immutable agent version | Yes | “Tested snapshot” after the user chooses Capture/Prepare release |
| Test run | Yes | “Checks” and “scenario results,” with honest scope |
| Release | Yes | “Approved version” bound to channels |
| Deployment snapshot | Yes | “Where customers can use it,” including identity, limits, origins, and channel status |

Provide one contextual **Prepare to publish** action from the agent. It opens a review sheet that:

1. Captures the current saved draft if needed.
2. Runs required configuration checks.
3. Lists reusable scenario/audio evidence and unresolved critical failures.
4. Shows the exact knowledge/tool/provider dependencies.
5. Chooses an existing/new channel deployment.
6. Presents one final publish diff and authority acknowledgment.

Test Lab, Releases, and Deployments remain reachable to advanced operators and from deep links, but no longer act as three mandatory navigation hops for the founder.

### 7. Deploy on web, phone, and batch/campaign channels

#### ElevenLabs

- **Documented UI.** The Widget tab customizes modality, appearance, avatar, display text, terms, language, muting, feedback, and a shareable page. Voice-only is the documented default; voice + text and chat mode can be enabled. The embed requires a public agent with authentication disabled; allowed domains are configured in Security.
- **Documented UI.** Phone Numbers imports/assigns numbers and can send a single test outbound call. Purchased Twilio numbers support inbound/outbound; verified caller IDs are outbound only and cannot be assigned for inbound.
- **Documented UI.** Batch Calling asks for batch name, source number, agent, recipient CSV/XLS, and send-now or schedule with timezone. `phone_number` is mandatory. Other columns become dynamic variables. `language`, `first_message`, `system_prompt`, and `voice_id` are privileged per-recipient overrides and cause failure unless explicitly allowed in agent security. A single-recipient Test call is available before submit.
- **Documented UI.** Integrate also includes web/mobile SDKs, SIP, Twilio, WebSocket, WhatsApp, and batch calls.

Primary evidence: [widget](https://elevenlabs.io/docs/eleven-agents/customization/widget), [integration overview](https://elevenlabs.io/docs/eleven-agents/integrate/overview), [Twilio phone-number flow](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration/), [batch calling](https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls).

#### Bolna

- **Documented UI.** Deploy → My Numbers buys US or Indian numbers and shows number, assigned agent, carrier, purchase/renewal, rent, unlink, Truecaller, transfer, and delete. India numbers are offered through Plivo or Vobiz; compliance approval is required before purchase.
- **Documented UI.** Inbound assignment now lives inside the agent's Calling tab. Caller data can be looked up from CSV, Google Sheets, or an API and inserted as call context.
- **Documented UI.** Deploy → Batches first selects an agent, then lists batch ID, file, uploaded contacts, execution/batch status, workflow, created time, and actions for run, stop, download, delete, and call log. Upload parses row/valid-number counts, selects a source number, runs now or schedules, configures webhook and outcome-specific retries.
- **Documented recipient contract.** The phone column must be `contact_number` in E.164. Other columns pass through without validation. `agent_language` selects a configured starting language per row; blank uses the default, and an unsupported row is marked error while the rest continue. Excel can misread `+` as a formula, so the docs warn users to prefix with an apostrophe.
- **Documented UI.** Retry can be limited by outcome (no answer, busy, failed, error, voicemail), up to three attempts, with increasing intervals and optional priority ahead of first attempts.
- **India compliance.** Bolna documents a one-time company compliance application before number purchase. It separately documents 140-series for promotional/telemarketing use and 160-series for transactional/service use, DLT registration, KYC, and further provisioning. These pages are vendor guidance and need legal/provider confirmation for a specific launch, but they prove the UX cannot truthfully treat Indian phone setup as one click.

Primary evidence: [phone purchase](https://www.bolna.ai/docs/buying-phone-numbers), [batch calling](https://www.bolna.ai/docs/outbound/batch-calling), [inbound caller matching](https://www.bolna.ai/docs/agent-setup/inbound-tab), [India compliance](https://www.bolna.ai/docs/compliance-application/introduction), [140/160-series guide](https://www.bolna.ai/docs/obtaining-regulated-phone-numbers).

#### Recipient mapping recommendation for Relay

Relay should not copy either vendor's raw-column pass-through. Campaign import should have a durable mapping review before launch:

1. Identify the recipient/contact column and normalize country/phone without erasing the raw source.
2. Reconcile rows with existing customers; show duplicate, unknown, opt-out, and conflicting identity states.
3. Map prompt variables, per-recipient language, timezone, and desired result columns explicitly.
4. Validate type/enum/date and allowed-language constraints for every row.
5. Preview the rendered opening, relevant context, and intended data collection for a few representative rows.
6. Separate **invalid rows**, **policy-blocked rows**, and **ready rows**. Allow a clean partial run only after the operator understands exclusions.
7. Require calling hours, retry outcomes, retry cap, consent/DNC basis, capacity, and stop conditions.
8. Bind every recipient attempt to the exact agent version, campaign brief, source snapshot, language/voice setup, and approved result schema.

This adapts Bolna's useful row-level language and partial-row error behavior while preserving Relay's stronger identity/result review and authority controls.

### 8. Review conversations, analytics, and improve the agent

#### ElevenLabs

- **Documented UI.** Conversation history carries transcript, evaluation results, collected fields, rating/feedback, tools, language, dynamic variables, branch/version context, and keyword or semantic search. Keyword mode is the default; search mode is stored in the URL.
- **Documented UI.** Analysis rules are authored in the agent's Analysis tab. Success evaluation returns success/failure/unknown with rationale. Data collection extracts typed strings, booleans, integers, or numbers. Results appear in conversation history.
- **Documented UI.** Analytics supports workspace or agent scope, date range, agent, branch, call type, language, source, LLM/TTS/ASR model, tool/error type, and evaluation criteria. Users can group metrics and drill from workflow node analytics to conversations.
- **Documented UI.** Triage tickets can come from a live agent's **Flag issue for review** tool, manual creation, or transcript review. They link to conversations, accept turn comments, assignment and status, and may be grouped by root cause. Architect can summarize the issue, suggest a fix, edit the draft, run tests, and leave publishing to the user.
- **UX strength.** A production failure can become a ticket, test, config change, branch, measured traffic experiment, and merge decision without losing the originating conversation.

Primary evidence: [conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis), [searching conversations](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/smart-search), [analytics](https://elevenlabs.io/docs/eleven-agents/dashboard), [triage](https://elevenlabs.io/docs/eleven-agents/operate/triage), [flag issue for review](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/flag-issue-for-review).

#### Bolna

- **Documented UI.** Monitor → Call History can also be reached from the selected agent's clock icon. Its first view combines agent/batch/date filters, execution/cost/duration cards, status chips, queued-call stop, CSV export, and a call table.
- **Documented UI.** Call detail is a side panel with waveform/download, transcript, summary, and extractions. Logs open a separate page with timestamp in IST, request/response, component, provider/model, and latency. Raw opens searchable/downloadable JSON.
- **Documented UI.** Calls can be rated; text chat is logged as `websocket outbound` with transcript but no recording. This distinction is useful and candid.
- **Documented UI.** Monitor → Analytics counts phone calls only, not browser tests. It separates **All Calls** from **Unique Numbers** and provides a five-step funnel: dialed, connected, person on line, two-way conversation, qualified conversation (30s+). Day/hour heatmaps use IST and hide cells with insufficient volume.
- **Important limitation.** The documented analytics focus on reachability and engagement operations. They do not provide ElevenLabs-style branch comparison, reusable automated tests, or an explicit conversation-to-agent-revision path.

Primary evidence: [call history](https://www.bolna.ai/docs/agent-setup/call-history), [call analytics](https://www.bolna.ai/docs/agent-setup/call-analytics), [extractions/webhooks](https://www.bolna.ai/docs/agent-setup/analytics-tab).

#### Relay implication

Unify improvement around the conversation, without merging evidence types:

- A conversation detail should expose transcript/audio availability, caller/customer linkage confidence, agent version, language/voice/provider, sources retrieved, tools/actions/receipts, proposed memories, commitments, collected result fields, evaluations, and human review.
- Any failed turn or disputed extraction should offer **Create regression case**, **Propose agent change**, **Correct company knowledge**, or **Create owned follow-up**.
- An improvement proposal must retain the originating conversation/turn, reviewer, exact before/after config, tests run, released version, and later outcome evidence.
- Analytics should start with business questions: people reached, meaningful conversations, requested versus confirmed next steps, unresolved commitments, failures needing review, and cost per useful outcome. Technical latency/model/tool charts sit behind those questions.
- Keep `unknown`, `not captured`, `browser-only`, `text simulation`, and `real audio` visually distinct. Neither vendor fully solves this evidence boundary; Relay already has the right conceptual discipline.

## Navigation: what Relay should change

### Current problem

**Relay observation.** The current rail exposes:

- Operate: Command centre, Campaigns, Automations, Inbox, Conversations, Customers, GroupAI.
- Build: Agents, Test lab, Company brain, Integrations, Releases, Deployments.
- Improve: Quality, Commitments.
- Workspace: Company, Team & access, Account security.

This is an accurate inventory, but it asks a first-time founder to learn Relay's ontology before achieving one outcome. Search and provider setup add more global affordances. The system has few obviously wrong individual screens; it has too many first-class starting points.

### Recommended primary navigation

Use five stable destinations for the default owner/operator mode:

1. **Home** — setup progress, decisions, failures, owned work, and the next useful action.
2. **Customer work** — campaigns, inbox, conversations, customers, commitments, and GroupAI as contextual tabs/deep links around shared records.
3. **Representatives** — agent library; each agent owns Setup, Try, Tests, Versions, Channels, Conversations, and Improve.
4. **Company knowledge** — sources, business model, offers/signals, mappings, integrations, and grounded Q&A.
5. **Insights** — outcome funnel, quality, topics, costs, experiments, and drill-down.

Put Company, Team & access, Account security, provider connections, retention, and billing in a workspace menu. Keep global search. Advanced users may opt into an “All tools” menu or keyboard command palette; do not make all internal resources permanent rail peers.

### Agent workspace recommendation

Preserve the current three-column layout on wide screens, but make the columns lifecycle-aware:

- **Left:** agents, status, task template, and compact lifecycle (“Draft → tested → live on web”).
- **Centre:** business-first sections: Purpose, Conversation, Language & voice, Knowledge, Actions, Escalation. Advanced runtime remains collapsed.
- **Right:** a persistent Try/Test panel bound to the current draft or selected version, with the evidence level named.
- **Header:** Save status, current live version/channel, last result, and one contextual action: **Try**, **Fix test**, or **Prepare to publish**.

Do not place Capture version as a routine sibling of Save. Capture happens when the user chooses to preserve a candidate or prepare it for release. Version history stays accessible but secondary.

## Adopt / adapt / reject

| Priority | Pattern | Decision | Relay application |
| --- | --- | --- | --- |
| P0 | Bolna's three-step Identity/Goal → Conversation → Closing brief | **Adopt** | First-agent wizard using plain business language and reviewed prefill from company data. |
| P0 | Quick draft test inside the agent editor | **Adopt** | Keep the right-hand tester; add text, controlled scenario, and evidence labels. |
| P0 | One contextual path from draft through checks to publish | **Adapt** | Preserve immutable versions/releases/deployments underneath one Prepare to publish sheet. |
| P0 | Per-language prompt/voice/STT configuration | **Adapt** | Simple default checklist plus advanced per-language settings; require India-specific test evidence. |
| P0 | Conversation failure → regression → proposed fix | **Adopt** | Create regression and AgentRevision actions from an exact turn with source evidence. |
| P0 | Batch recipient preview and explicit column mapping | **Adapt** | Add identity, consent, language, timezone, prompt-variable and result-column validation before launch. |
| P1 | ElevenLabs simulation/next-reply/tool tests and probabilistic reruns | **Adopt** | Add reusable test types, run counts, pass rates, and failure buckets; preserve real-audio distinction. |
| P1 | ElevenLabs dependency and branch analytics | **Adapt** | Show tested snapshot → exposure → outcome delta; defer Git language and traffic splitting until actual A/B traffic exists. |
| P1 | Bolna All Calls versus Unique Numbers and operational funnel | **Adopt** | Separate attempts from people and show reachability before business outcomes. |
| P1 | Bolna chat/web/phone test selector | **Adapt** | Show only channels actually available; telephone remains absent until integrated. |
| P1 | Architect contextual natural-language improvement | **Adapt** | Extend Relay's allowlisted reviewed revisions with failed-test/conversation context; no autonomous publish. |
| P2 | ElevenLabs shared KB folders and dependent-agent view | **Adopt** | Add dependency impact before correction/removal; preserve source authority and approved facts. |
| P2 | Bolna graph editor's inspector, Validate, Save state, and restore sheet | **Adapt** | Useful when Relay adds workflows; maintain keyboard/undo/dirty-state clarity. |
| P2 | Template libraries | **Adapt** | Curate a few job packs with visible assumptions and required company inputs; avoid a large undifferentiated gallery. |
| — | Approximately 20 permanent rail items | **Reject** | Progressive navigation and record-scoped tabs/deep links. |
| — | Raw prompt as the first onboarding question | **Reject** | Ask role, job, outcome, boundaries, language, escalation, then show the generated prompt for review. |
| — | Raw recipient columns passed through without review | **Reject** | Typed, source-owned mapping with preview and row-level exclusions. |
| — | “All languages,” “human-like,” or “production-ready” as readiness | **Reject** | Language/channel-specific evidence checklist and human/audio gates. |
| — | Every save creating a deployable version | **Reject** | Working-copy saves remain cheap; candidate capture and release remain explicit. |
| — | Natural-language assistant editing arbitrary high-impact settings | **Reject** | Allowlisted changes, side-effect preview, role authority, explicit apply, test, and publish. |

## Prioritized founder flow

This is the recommended default path for the general Indian-company buyer who rejected the current product's usability.

### P0: first useful browser representative

1. **Create workspace.** Company name, owner identity, and short business description. Show empty-state progress rather than the full operating rail.
2. **Choose the first job.** Examples: qualify enquiries, answer service questions, collect feedback, follow up on an application. Explain what data and actions the job needs.
3. **Bring minimum context.** Upload/paste/connect the smallest relevant source and optional customer table. Relay proposes company facts, identity mapping, audience fields, language, and result fields; founder reviews only exceptions and unknowns.
4. **Review the representative brief.** Name/AI disclosure, role, objective, opening, behavior, primary/allowed languages, knowledge, allowed actions, escalation, and desired outcome. Show recommended defaults; tuck providers/runtime under Advanced.
5. **Try it immediately.** Text or Listen & type in the right panel. Choose a sample/fictional customer or a permitted real contact. Label draft test, context scope, and absence of acoustic proof.
6. **Fix in context.** From a bad reply, request a reviewed natural-language change or correct the source. Show before/after and re-run the same case.
7. **Prepare to publish.** Relay captures a tested snapshot, runs deterministic checks, lists scenario evidence and open gaps, and creates or updates the web deployment with public identity, origins, limits, and knowledge.
8. **Open/share the web experience.** Customer sees company and AI identity, purpose, language, notice, Start, controls, and clear end state.

### P1: first campaign

9. **Choose audience and purpose from the company job.** Do not restart from an empty campaign form.
10. **Map recipients and results.** Reconcile identity, contact channel, consent, language, timezone, prompt variables, and typed desired results. Show excluded rows and why.
11. **Preview representative recipients.** Render opening, permitted context, questions, actions, and stop/retry rules for a few rows. Start with browser/manual work while telephone is unintegrated.
12. **Run and supervise.** One place for readiness, capacity, pause/stop, per-recipient status, uncertain actions, and human intervention.

### P1: improve from evidence

13. **Review conversations by exception.** Surface failed criteria, unsupported promises, wrong language/register, bad extraction, tool failure, negative feedback, and unresolved commitment.
14. **Take a specific improvement action.** Correct data, create regression, propose agent change, assign follow-up, or mark evaluator wrong.
15. **Publish the next snapshot.** Re-run affected cases, compare evidence, publish, and retain rollback. Add live traffic experiments only when Relay can record assignment, exposure, sample size, and business outcome without ambiguity.

### P2: telephone and cross-channel expansion

16. **Treat phone readiness as a project.** Provider/account, India business verification, number series/use, DLT/KYC/provider state, caller identity, recording/consent policy, calling hours, concurrency, cost, test calls, and rollback.
17. **Only then expose phone/batch launch.** Never let a configured provider or purchased number imply compliant campaign authority.

## Source register

These are the most decision-useful primary pages; inline links above provide the larger supporting set.

### ElevenLabs — five primary pages

1. [Agents quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart/) — blank-agent path, Agent/Voice/Analysis/Call history, dashboard test, widget.
2. [Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing) — three test types, conversation-to-test, mocks, probabilistic runs and failure buckets.
3. [Agent versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning) — drafts, immutable versions, branches, traffic, merges and versioned fields.
4. [Batch calling](https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls) — recipient file contract, per-row variables/overrides, scheduling and test call.
5. [Analytics](https://elevenlabs.io/docs/eleven-agents/dashboard) — workspace/agent metrics, branch/language/model/tool filters and experiment path.

Additional high-value pages: [Architect](https://elevenlabs.io/docs/eleven-agents/operate/architect), [Architect approvals/drafts](https://elevenlabs.io/docs/eleven-agents/operate/architect/authentication), [triage](https://elevenlabs.io/docs/eleven-agents/operate/triage), [knowledge base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base), [manage documents](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/manage-documents), [language](https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language), [widget](https://elevenlabs.io/docs/eleven-agents/customization/widget), [conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis).

### Bolna — five primary pages

1. [Agent Studio overview](https://www.bolna.ai/docs/agent-setup/overview) — Build/Deploy/Monitor frame, agent list/header, seven tabs, save and three test options.
2. [Auto Build](https://www.bolna.ai/docs/agent-setup/studio) — Identity & Goal, Conversation, Closing, document prefill, defaults and post-generation path.
3. [Agent tab](https://www.bolna.ai/docs/agent-setup/agent-tab) — per-language prompts, variables/test fields, modules, AI Edit diff and save semantics.
4. [Languages, voice and transcription](https://www.bolna.ai/docs/agent-setup/audio-tab) — per-language providers/voices/STT, preview, defaults and advanced tuning.
5. [Batch calling](https://www.bolna.ai/docs/outbound/batch-calling) — Deploy → Batches, CSV contract, `agent_language`, retries, scheduling, webhook and monitoring.

Additional high-value pages: [knowledge base](https://www.bolna.ai/docs/knowledge-base), [call history](https://www.bolna.ai/docs/agent-setup/call-history), [call analytics](https://www.bolna.ai/docs/agent-setup/call-analytics), [graph editor](https://www.bolna.ai/docs/graph-agent/using-the-editor), [graph testing](https://www.bolna.ai/docs/graph-agent/testing), [graph version history](https://www.bolna.ai/docs/graph-agent/version-history), [India phone compliance](https://www.bolna.ai/docs/compliance-application/introduction), [140/160-series numbers](https://www.bolna.ai/docs/obtaining-regulated-phone-numbers), [phone purchase](https://www.bolna.ai/docs/buying-phone-numbers).

## Verification boundary

This research establishes what current official public material documents or claims. It does not establish signed-in navigation parity, feature entitlement by plan, service uptime, provider/carrier eligibility, production voice quality, Indian-language accuracy, code-switch accuracy, legal compliance for a particular campaign, or any competitor superiority. Relay recommendations are product inferences anchored to those sources and the checked local implementation.
