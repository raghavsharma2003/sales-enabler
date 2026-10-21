# ElevenLabs Agents: dashboard walkthrough analysis (2026-10-21)

Grades used: **observed** (seen in a screenshot or text capture), **displayed-by-vendor** (a number the product shows, not measured by us), **inferred** (reasoned from cited observations), **unknown**. Screenshot names are in backticks. "API read-back" means the 2026-10-20 account-phase read of the same dashboard-created agent (`data/account-phase/elevenlabs/api-reads/agent-existing.json`), used only to fill values the dashboard text shows as a label. Machine-readable claims: `research/2026-10-21/walkthroughs/elevenlabs/claims.json` (53 claims, ids `wt-elevenlabs-01..53`). Proposed graph nodes: `context/inbox/walkthrough-elevenlabs.json` (10 nodes, not merged).

## 0. Coverage: what was captured and what was not

- **Held:** 40 PNGs on disk, 2 not on disk (`01-landing`, `37-blank-step1`, read as OCR), one combined text capture with 41 page captures, Instinct's notes and cross-vendor report. All text was read; 21 PNGs were opened directly (02, 15, 23, 33, 34, 35, 36, 38, 42, 44, 45, 51, 53, 54, 61, 62, 63, 7-analytics, 8-architect, 8-branches, 9-preview); the rest rest on the calibrated screen notes plus the text capture.
- **The text beats the pixels** for anything below the fold: the whole Settings/Advanced page (conversational behaviour, alerting, privacy), Security limits, the full LLM and language lists, the Architect deployment checklist, the 45-entry template list.
- **Mislabelled or odd:** `02-after-login.png` is the template gallery, not an agents list. `63-voice-picker.png` is the "Agent voice" settings drawer, not a voice list. `38-agent-builder.png` caught the voice row on "Loading". `12-knowledge-base.png` is the workspace KB; `7-knowledge-base.png` the agent KB. Text captures carry hCaptcha/Stripe/Cookiebot noise and the template list is cut mid-sentence.
- **Nothing was exercised.** Every data surface is empty (history, users, tests, KB, tools, numbers, batches, WhatsApp, analytics shows `---`). No call or chat was started, no number imported, no CSV uploaded, no batch submitted. So conversation records, history columns, test runs, simulations, invoices, Spotlight, Realtime mode and the Agent-behaviour drawer were never seen. Latency and cost figures below are vendor-displayed.
- **Secrets:** the one API key is shown masked; it is not transcribed here ([secret redacted]).

## 1. Information architecture

**Workspace sidebar** (`02-after-login.png`): Home, Architect, Triage; Agents (+ Create agent); Configure: Knowledge Base, Tools, Integrations, Voices; Monitor: Conversations, Users, Tests; Deploy: Channels, Phone Numbers, WhatsApp, Outbound; Settings; Developers; Upgrade; "Invite team members" card; "Search & create" (Cmd K). Collapses to an unlabelled icon rail (`11-agents.png`).

**Agent sidebar** (`8-architect.png`, `8-branches.png`): Overview: Spotlight, Dashboards, Architect [Alpha], Triage. Configure: Agent, Procedures, Workflow, Version Control, Knowledge Base, Analysis, Tools, Guardrails, Settings. Monitor: Conversations, Tests, Users. Deploy: Channels, Outbound. Developers.

| Surface | What it does | Status |
|---|---|---|
| Home / templates | 45+ templates with flow preview, "Use template" | observed |
| Architect | chat assistant that builds, tests, fixes agents | Alpha, free "through October 2026" |
| Triage | ticket board: Pending / In progress / Resolved / Cancelled, columns Agent, Creator, Assignee, Created | all 0 |
| Knowledge Base (workspace) | URL, files, text, folder, sync; RAG storage 0 B / 1.0 MB | Free cap |
| Tools | webhook, client, integration tools | empty |
| Integrations | custom MCP servers + 4-card library (Cursor, HubSpot, ServiceNow, Zendesk) | empty |
| Voices | library (Explore / My Voices), Create Voice, Earnings | content |
| Conversations / Users / Tests | history, end-user IDs, tests | empty |
| Channels | 10 rows: Telephony, WhatsApp, Widget (dimmed), Zendesk, Genesys, Intercom, Slack, Freshdesk, Telegram, Custom Channel | 5 are Alpha |
| Phone Numbers | import only: Twilio, SIP Trunk, Exotel | empty |
| WhatsApp | account import | empty |
| Outbound | page titled "Batch Calling"; create menu Telephony / WhatsApp | empty |
| Settings | workspace webhooks, secrets, auth connections | empty |
| Developers | 7 tabs: Overview, API Keys, Webhooks, Analytics, Request Log, Alerts, Environment variables | 1 key |
| Subscription | tabs ElevenCreative / ElevenAgents / ElevenAPI | Free plan |
| Agent: Dashboards | 12 tabs, Spotlight button | empty |
| Agent: Version Control | Branches / Proposals / Contributors, Graph, Traffic split | Main only |
| Agent: Procedures, Workflow, Guardrails, Analysis, Settings | see section 3 | |

Maturity labels in the UI: Alpha (Architect, KB Memory tab, Alerting, "Transcribe user speech on disabled interruptions", 5 channels), Beta ("Create with Architect"), "Now GA" (Realtime voice mode), New / Improved promos. Enterprise-gated items are named only on the plan cards (SSO, BAA, DPA/SLA); no gated page was hit.

## 2. First run

- Landing after login is the template gallery (`02-after-login.png`): at least 45 templates (text cut), node-graph preview, "Use template" one click away, "Create Blank Agent" above the grid. Cards show a description and "N integrations / N tools / ElevenLabs"; no price, voice or language. The list is US-shaped (a collections template is "FDCPA compliant", a benefits template names 401k, HVAC) and has no India template; outbound templates exist (Renewal & Expansion, Accounts Receivable, Outbound Dialer with Voicemail Handling, Outbound Sales Rep, Appointment Reminder).
- "New agent" chooser (`36-new-agent.png`): five paths: Create with Architect (Beta, focused), Browse Templates, Personal Assistant, Business Agent (Improved), Blank Agent. Template types are shown by sample chat, not description. Three pagination dots appear with no visible next control.
- Blank path (`37-blank-step1`): **one required field** (Agent Name, 50 chars, placeholder "[Tag] Agent name"), a "Chat only" checkbox, "Create Agent".
- Result (`38-agent-builder.png`): a working default agent with system prompt "You are a helpful assistant." Publish is greyed with no explanation.
- **Steps to a first browser test (inferred):** sign-in, New agent, Blank Agent, name, Create Agent, then type or speak in the docked panel: 4 clicks, 1 required field. Sign-in took about 15 s with no OTP and pages 4-5 s (Instinct).
- **A first phone call is not reachable from the dashboard alone:** it needs an imported number (Exotel: 7 fields; Twilio or SIP credentials) and an agent-to-number link that was never seen. Steps: unknown.

## 3. Agent builder end to end

**Agent tab** (`38-agent-builder.png`): system prompt (wand, expand, `{{` variables, timezone chip), first message with Interruptible toggle and a "Disclosure Requirements" link, Voice mode Realtime | Custom, Voices (primary + additional), Language (default + additional), LLM, Agent behavior (personality, channel reply behaviour; not opened). A test panel (Inline | Widget, Mock tools, debug, expand, chat/mic) is docked on every agent page.

**Procedures** (`8-procedures.png`): empty; "Teach your agent to handle a specific task in natural language"; "New procedure" has a dropdown (options not seen).
**Workflow** (`45-agent-workflow.png`): empty canvas with a Start node, 10-icon toolbar (Templates has a green dot), Global settings: "Prevent infinite loops" OFF, banner "To enable a workflow, connect the start node to an entry node". Template workflows show named nodes with opening-line prompts, English-language conditional edges and tool badges (`02-after-login.png`).
**Version Control** (`8-branches.png`): Main 100% Live, 0 conversations in 7 days, creator team@vyakti.ai, table scrolls sideways (hidden columns).
**Knowledge Base** (`7-knowledge-base.png`): tabs Sources, Memory (Alpha), Retrieval; Test retrieval; table Name, Created by, Last updated.
**Analysis** (`41-agent-analysis.png`): default analysis model Gemini 2.5 Flash; Topic discovery and Sentiment analysis ON (with an "Acknowledge" notice that only text is analysed); Analysis Language Auto; Auto-translate OFF; Source Attribution ON; Evaluation criteria 0; Data collection 0.
**Tools** (`42-agent-tools.png`): Tools | MCP tabs; nine system tools, all OFF.
**Guardrails** (`43-agent-guardrails.png`): Focus, Manipulation, Content, Custom, each "Not enabled"; rows give no sub-description.
**Settings** (`44-agent-settings.png`, text): Advanced then Security then Architect tabs; sections in section 5, 8 and 12.

### Settings table (default as captured, range or options, screenshot)

"API" in the default column means the value is the 2026-10-20 read-back of this same agent because the dashboard text shows only a label.

| Setting | Default | Range / options | File |
|---|---|---|---|
| System prompt | "You are a helpful assistant." | free text, `{{` variables | 38-agent-builder.png |
| First message | "Hello! How can I help you today?" (no AI disclosure) | free text; empty = agent waits | 38-agent-builder.png |
| Interruptible (first message) | ON | toggle | 38-agent-builder.png |
| Voice mode | Custom | Realtime, Custom ("Now GA") | 38-agent-builder.png |
| Primary voice | Eric - Smooth, Trustworthy | library / additional voices | 61-llm-list.png |
| Default language | English (US flag) | 88 listed under "Compatible with agent config" | 62-language-list.png |
| LLM | DeepSeek Flash 4.1 (230 ms-1.85 s, ~$0.0078/min) | 45 models + Custom | 61-llm-list.png |
| Agent behavior | Default personality off | drawer not opened | 38-agent-builder.png |
| Timezone chip | Asia/Calcutta | not opened | 38-agent-builder.png |
| TTS model family | V4 Turbo ("Fastest") | dropdown not opened | 63-voice-picker.png |
| Expressive mode | ON | toggle | 63-voice-picker.png |
| Stability | about 50% (API 0.5) | More expressive to More consistent, no number shown | 63-voice-picker.png |
| Similarity | about 74% (API 0.75) | Low to High, no number | 63-voice-picker.png |
| Suggested audio tags | 10 chips shown | + Add custom | 63-voice-picker.png |
| Backup LLM configuration | not captured (API: default) | Default, Custom, Disabled | 61-llm-list.txt |
| Temperature | not captured (API 0.0) | deterministic to expressive; "Don't send temperature" | 61-llm-list.txt |
| Reasoning effort | not captured (API null) | Default, High, Max (more not captured) | 61-llm-list.txt |
| Limit token usage | not captured (API -1) | -1 = no limit | 61-llm-list.txt |
| Soft timeout (LLM filler) | Disabled (API -1) | seconds | 61-llm-list.txt |
| Parallel tool calling | not captured (API on) | toggle | 61-llm-list.txt |
| Enable chat mode | OFF | toggle | 44-agent-settings.png |
| Allow file attachments | ON | toggle | 44-agent-settings.png |
| Files kept in memory | 10 | max 10 | 44-agent-settings.png |
| Max files per conversation | 10 | -1 = no limit, else >= files kept | 44-agent-settings.png |
| Enable DTMF input | OFF | out-of-band tones via Telephony, Twilio, Genesys only | 44-agent-settings.png |
| ASR model | Scribe v2 Realtime (locked) | locked by Turn V3 | 44-agent-settings.png |
| Filter background speech | OFF | toggle | 44-agent-settings.png |
| User input audio format | PCM 16000 Hz (Recommended) | dropdown | 44-agent-settings.png |
| Keywords | 0 / 50 | up to 50 | 44-agent-settings.png |
| Eagerness | Normal | levels not listed (API schema: patient, normal, eager) | 44-agent-settings.txt |
| Spelling patience | Auto | not listed | 44-agent-settings.txt |
| Interruption ignore terms | not captured (API empty) | term list; toggle "seeds defaults for the agent's languages" | 44-agent-settings.txt |
| Speculative turn | not captured (API on) | toggle; "may increase LLM costs" | 44-agent-settings.txt |
| Re-transcribe on turn timeout | not captured (API off) | toggle; disables silence-discount billing | 44-agent-settings.txt |
| Transcribe on disabled interruptions (Alpha) | not captured (API off) | toggle | 44-agent-settings.txt |
| Turn model | Turn V3 | options not listed | 44-agent-settings.txt |
| Take turn after silence | seconds, not captured (API 7.0) | -1 = wait indefinitely | 44-agent-settings.txt |
| End conversation after silence | Disabled (API -1) | seconds | 44-agent-settings.txt |
| Max conversation duration | seconds, not captured (API 600) | seconds | 44-agent-settings.txt |
| LLM cascade timeout | seconds, not captured (API 4.0) | schema 2-15 s | 44-agent-settings.txt |
| Client events | audio, interruption, user_transcript, agent_response, agent_response_correction | Add event | 44-agent-settings.txt |
| Alerting (Alpha) | no destinations, thresholds unset | webhooks, thresholds | 44-agent-settings.txt |
| Zero Retention Mode | not captured (API off) | toggle | 44-agent-settings.txt |
| Store Call Audio | not captured (API on) | toggle | 44-agent-settings.txt |
| Conversations Retention Period | Unlimited | days; -1 unlimited | 44-agent-settings.txt |
| Default analysis model | Gemini 2.5 Flash | per-criterion override | 41-agent-analysis.png |
| Topic discovery / Sentiment / Source attribution | ON / ON / ON | toggles | 41-agent-analysis.png |
| Auto-translate transcript | OFF | toggle | 41-agent-analysis.png |
| Guardrails (4 categories) | all Not enabled | contents unseen | 43-agent-guardrails.png |
| System tools (9) | all OFF, "0 active tools" | toggles | 42-agent-tools.png |
| Enable authentication | OFF | toggle | 54-agent-security.png |
| Allowlist | empty (red warning) | hosts | 54-agent-security.png |
| Overrides (17) | all OFF except Text only | toggles | 54-agent-security.png |
| Concurrent call limit | Using subscription limit | number | 54-agent-security.txt |
| Enable bursting | not captured (API on) | up to 3x, 2x price | 54-agent-security.txt |
| Call queuing / Max queue wait | not captured (API on, 180 s) | seconds | 54-agent-security.txt |
| Daily call limit | not captured (API 100000) | calls per day | 54-agent-security.txt |
| Custom hold audio | Default hold tone (0:15) | MP3 or WAV, up to 40 MB, max 3 min | 54-agent-security.txt |
| Workflow: Prevent infinite loops | OFF | toggle | 45-agent-workflow.png |
| Mock tools | Off | pill | 38-agent-builder.png |

## 4. Model, voice, transcriber and language choice

- **LLM** (`61-llm-list.png`): a side drawer with search only, grouped Hosted by ElevenLabs (5: DeepSeek Flash 4.1, GLM 5.2, Nemotron 3.5 Super VL, Qwen3.5-397B-A17B, Qwen3.6-35B-A3B), Anthropic (11), Google (8), OpenAI (21), Custom. 45 models plus Custom. Each row shows latency (range on most, single "~" on eight rows) and "~$/min · $/msg" (displayed-by-vendor). Range $0.0004 (GPT-5 Nano) to $0.0750/min (GPT-6 Astra). The default, DeepSeek Flash 4.1, carries a "New" badge and the line "Low latency, precise tool-calling and procedures". "Detailed costs" is pinned in the footer (not opened). No Indian or Indic-tuned provider.
- **Trade-offs are shown inline** (speed and price on every row, which is excellent) but not like-for-like: no percentile, region or prompt size is stated, and the dashboard's $/min is 1.7x-2.3x lower than the API calculator we read on 2026-10-20 at the same implied ~5.2 messages per minute (DeepSeek $0.0078 vs $0.0130; Sonnet 4.5 $0.0248 vs $0.0558; GPT-4o $0.0180 vs $0.0415). The assumption is not stated (inferred).
- **Transcriber:** no picker. ASR is "Scribe v2 Realtime", locked because Turn V3 requires it (`44-agent-settings.png`). Only audio format (PCM 16000 Hz) and a 50-keyword list are adjustable. So there is no catalogue to compare and no Indic ASR choice.
- **Voice** (`63-voice-picker.png`, `15-voice-library.png`): a collapsed voice row, TTS family V4 Turbo with a "Fastest" badge (the only speed cue), Expressive mode, 10 audio-tag chips, Stability and Similarity sliders without numbers. The library has category chips, use-case cards, celebrity "Iconic Voices" and per-voice stats; every visible voice is English (US, UK, AU). The Language filter was not opened, so Indic voice count is unknown. No voice price.
- **Realtime vs Custom** (`38-agent-builder.png`): a two-way switch with "Now GA"; no description of the difference, cost or languages; not switched.
- **Languages** (`62-language-list.png`): 88 listed under "Compatible with agent config" ("All languages" not captured). South Asian: Assamese, Bengali, Gujarati, Hindi, Kannada, Malayalam, Marathi, Nepali, Odia, Punjabi, Sindhi, Tamil, Telugu, Urdu (14). **No Hinglish row.** No quality tier, latency or price per language. "Hinglish" appears nowhere on the captured pages except the name of our own second agent. The API-only `hinglish_mode` flag has no visible control (the Agent behaviour drawer was not opened).

## 5. Conversation control

Controls (labels from text; values from the Normal/Auto/Turn V3/Disabled shown, else the API read-back of this agent):

| Control | Default | Unit | Note |
|---|---|---|---|
| Eagerness | Normal | enum | "high = responds quickly, low = waits longer" |
| Turn model | Turn V3 | enum | locks ASR to Scribe v2 Realtime |
| Take turn after silence | 7 s (API) | seconds | -1 waits indefinitely |
| Speculative turn | on (API) | toggle | generates during silence; may raise LLM cost |
| Re-transcribe on timeout | off (API) | toggle | turns off the silence discount |
| Interruption ignore terms | empty (API) | list | English examples; "seeds safe defaults for the agent's languages" |
| Interruptible (first message) | ON | toggle | |
| Transcribe on disabled interruptions (Alpha) | off (API) | toggle | |
| Spelling patience | Auto | enum | for numbers and names |
| End conversation after silence | Disabled | seconds | no silence hang-up by default |
| Max conversation duration | 600 s (API) | seconds | plus a spoken message |
| Filter background speech | OFF | toggle | far-field voices |
| LLM cascade timeout | 4 s (API) | seconds | backup LLM |
| Soft timeout filler | Disabled | seconds | |
| Enable DTMF input | OFF | toggle | out-of-band only |
| Voicemail detection / End conversation / Play keypad tone | tools OFF | toggle | no hang-up, voicemail or DTMF by default |

**Findings.**
- **Units.** Everything is an enum or whole seconds; there is no millisecond endpointing or reply-delay knob. Where Bolna's code shows a ~1.4 s floor (500 ms endpointing plus 900 ms linear delay) and drops short replies spoken while the agent talks, ElevenLabs exposes no constants, so the buyer cannot see or tune its floor (inferred).
- **Coupling.** Turn V3 forces Scribe v2 Realtime (observed banner). A buyer cannot pair ElevenLabs' turn model with an Indic ASR.
- **Back-channel.** The one visible lever for "haan"/"hmm" is the ignore-terms list, empty by default for this English agent. Our 2026-10-17 demo measurement (4 of 16 short turns answered "Are you still there?", barge-in handled 3 of 7, clean-turn p50 3.75 s) is consistent with that default but the demo page forced language `en`, so the link is untested (inferred, open).
- **Silence and hang-up.** Silence end-call is Disabled and the End conversation tool is off, so a default agent has no built-in way to end a call except the max duration. Relevant to the owner's agent-hangup directive.
- **Noise.** The API's noisy-environment detection has no control in the captured page; only "Filter background speech" (OFF).
- **Not visible:** voicemail behaviour beyond the off tool, per-language presets, any ms timing, any Hindi-specific tuning.

## 6. Tools, knowledge base, integrations, workflows

- **Tools** (`13-tools.png`, `42-agent-tools.png`): workspace tiles for webhook, client and Integration tools; per-agent Tools | MCP; nine system tools (End conversation, Detect language, Skip turn, Update state, Transfer to agent, Transfer to number, Play keypad touch tone, Voicemail detection, Flag issue for review), all OFF, names dotted-underlined for tooltips.
- **Integrations** (`14-integrations.png`): custom MCP server plus four library cards; nothing Indian (no CRM, payments, WhatsApp BSP, telephony).
- **Knowledge base** (`12-knowledge-base.png`, `7-knowledge-base.png`): five ingestion tiles, 1.0 MB RAG cap on Free, Test retrieval, and a **Memory (Alpha)** tab. That tab is the first dashboard sign that cross-call memory exists; its content and availability were not seen.
- **Workflows and procedures:** node-graph workflows (empty), free-form Procedures (empty), Architect checklist items "Procedures guiding key flows".

## 7. Testing and quality

- **Preview** (`9-preview.png`): History, Debugger, Voice settings, Vars, Mock tools (Off), Mute, chat, orb. "Eleven v4 is here" promo banner on top. No Start-call label in the idle state; a red unlabelled alert button sits on the orb on every panel (cause unknown).
- **Tests** (`7-tests.png`): Attached Tests, Past Test Runs, "Add test", "Learn how". Empty. The Architect checklist lists "Simulation tests covering scenarios" but no simulation UI was captured.
- **Quality:** evaluation criteria and data collection (both 0), sentiment notice, topic discovery, success-rate and CSAT cards (CSAT needs widget feedback), Triage board, "Flag issue for review" tool, Alerting (Alpha), Debugger.
- **Logs:** Conversations page (empty), Developers > Request Log tab (not captured).

## 8. Telephony and numbers

- Import only (`31-phone-import.png`): From Twilio, From SIP Trunk, From Exotel. No buy option, country picker, price or KYC step.
- Exotel panel (`34-phone-exotel-form.png`): Label (0/50), phone number (+91 default), Account SID, API Key, API Token (masked), Region, Voicebot Applet ID. **Region defaults to Singapore (api.exotel.com); Mumbai (api.in.exotel.com) is the other option.** No guidance on finding the SID, token or Applet ID beyond a placeholder; Import looks enabled with every field empty.
- India path: Exotel is the only India-specific option. No TRAI, DLT, KYC, 140/160 series or INR text anywhere in the captures. WhatsApp is a separate account import. SIP media region is not shown (the earlier "us-central1 signalling address" finding stands unverified).

## 9. Campaigns and batches

- Create menu (`32-batch-create.png`): Telephony | WhatsApp first. Form (`33-batch-telephony-form.png`) is **one page, 7 inputs, no wizard**: Batch name (Untitled Batch), Phone Number (disabled: "Please add a phone number to start batch calling"), Ringing timeout 60 s, Concurrency limit (optional, Auto), Select Agent, Recipients, Timing.
- CSV contract is shown before upload: CSV or XLS, max 25.0 MB; required `phone_number`; optional `prompt`, `first_message`, `voice_id`, `language`; any other column is a dynamic variable. Per-row overrides are first-class.
- Scheduling (`35-batch-schedule.png`): a start date-time (default "Today, 12:44 AM") and a timezone (default Asia/Calcutta). The default time looks like "now" (inferred from the session clock).
- **Not on the form or anywhere captured:** calling window, daily hours, retry rule, DND/NCPR scrub, consent, DLT, cost estimate, dedupe or number-format rules. The hidden lead-level campaigns product from the signed-out bundle is not visible in a new Free workspace.
- **Blocked where:** Phone Number select disabled (no imported number), so Test call and Submit stay disabled with no stated reason and no link to import. Steps after upload (recipient preview, validation, export) were never seen.

## 10. Analytics, call history and reporting

- Dashboards (`7-analytics.png`): 12 tabs (General, Evaluation, Data Collection, Workflow, Audio, Queue, Tools, LLMs, Topics, Knowledge Base, Advanced, Testing), toolbar (Create view, "Last 7 days UTC+5:30", Granularity Hourly, Agent chip, Branch, Group by, Stacked view), six metric tabs including **Total LLM cost** and **Average LLM cost**, and cards for success rate, CSAT, agent response time, total duration. All `---`.
- History (`16-history.png`): search, +Agent chip, Filters, Customize table; default columns unseen. Empty copy says "No results", which reads like a filter miss.
- Users (`25-users.png`): "Search users by ID"; filters Date After, Date Before, Agent, Branch. The caller is an ID string, not a contact object (observed from the search box).

## 11. Billing, credits, plans, price display

`51-subscription.png` (USD only; displayed-by-vendor):

| Plan | Price | Included min | Concurrent | Other |
|---|---|---|---|---|
| Free | $0 | 15 (10,000 credits) | 4 | Realtime configs, API |
| Starter | $6 (first month $1) | 75 | 6 | text, commercial license |
| Creator | $22 (first month $11) | 275 | 10 | Popular |
| Pro | $99 | 1,238 | 20 | |
| Scale | $299 | 3,738 | 30 | 3 workspace seats |
| Business | $990 | 12,375 | 40 | 10 seats, 10 voice clones (text capture) |
| Enterprise | custom | | elevated | DPA/SLA, HIPAA BAA, custom SSO |

Calls $0.08/min on every plan, text $0.0030/message, burst $0.16/min, additional minutes $0.08/min; LLM and telephony rows say "Based on usage and varies by model". **Plan price divided by included minutes is $0.08 on every tier (inferred arithmetic)**: included minutes are prepaid platform fee; tiers buy concurrency, seats and features, not a lower rate. At the default LLM a minute is about $0.0878 (about INR 8.3 at FX 95) before telephony and the 5% silence rate; burst about INR 15.9. No INR or UPI is visible, and the FAQ mentions Alabama tax. The Billing portal was not opened.

## 12. Team, org, security, API keys, compliance settings

- Workspace Settings (`52-workspace-settings.png`): Conversation Initiation Client Data Webhook, Workspace Secrets, Auth Connections, Post-Call Webhook (all empty). Per-agent overrides are mentioned by prose only.
- Developers (`53-api-keys.png`): 7 tabs; one user key (name vp-teardown, [secret redacted]), created Oct 20, expires Never, enabled toggle, red warning triangle with no tooltip. Service Accounts are elsewhere.
- Team: "Invite team members" card; seats only on Scale (3) and Business (10); SSO on Enterprise. Roles, audit log and invoices not captured.
- Agent security (`54-agent-security.png`): authentication OFF; empty allowlist with a red box "Any host will be able to connect"; 17 override toggles, all OFF except Text only; limits (daily, concurrent, bursting, queue, hold audio).
- Privacy: Zero Retention Mode, Store Call Audio, retention (Unlimited); per the API read-back audio is stored and redaction is off.
- Compliance: no DPDP, TRAI or consent settings captured. The AI-disclosure link ("Disclosure Requirements") sits beside the first message, but the default first message does not disclose.

## 13. UX quality ledger

**Excellent (VP must match or beat)**
- LLM picker with latency and cost per row, grouped and searchable: `61-llm-list.png`, "230ms - 1.85s ~$0.0078/min $0.0015/msg" on each row.
- Every setting has a one-to-two-sentence description including billing impact: `44-agent-settings.png`, "Each upload is billed, so this helps control cost".
- A lock is explained, not hidden: `44-agent-settings.png`, "locked because Turn V3 requires Scribe v2 Realtime".
- Template gallery with a live flow preview and one-click use: `02-after-login.png`.
- Test panel docked on every config page with Mock tools: `38-agent-builder.png`.
- CSV contract (required, optional, custom columns) shown before upload: `33-batch-telephony-form.png`.
- Branches with traffic split and a Live badge: `8-branches.png`.
- Go-live checklist in the assistant: `8-architect.png` text, "0 of 10 ready before going live".
- Sentiment disclosure with an explicit Acknowledge: `41-agent-analysis.png`.
- Analytics toolbar with date, granularity, group-by, branch: `7-analytics.png`.

**Clunky**
- Red unlabelled alert button on every orb: `9-preview.png`.
- Submit disabled with no reason and no link to import a number: `33-batch-telephony-form.png`.
- Exotel panel: misaligned phone row, no help for SID/token/Applet ID, Singapore region under +91, empty Import looks enabled: `34-phone-exotel-form.png`.
- Same CTA twice (header and empty card): `21-phone-numbers.png`, `7-tests.png`.
- "No results" for an empty history: `16-history.png`.
- Stability and Similarity have no numbers: `63-voice-picker.png`.
- Publish greyed with no hint why: `38-agent-builder.png`.
- Override list is 17 flat toggles with no descriptions: `54-agent-security.png`.
- Plan carousel clips Scale and Business: `51-subscription.png`; "Telephony provider: varies by model" is a copy slip.
- Widget channel dimmed with no reason: `23-channels.png`.
- Free RAG cap of 1.0 MB: `12-knowledge-base.png`.

**Broken or unexplained**
- Voice row stuck on "Loading": `38-agent-builder.png` (may be a capture timing).
- Red warning triangle on the API key row, no tooltip: `53-api-keys.png`.
- Unexplained greyed "Inbox" tab and greyed Branch chip: `8-architect.png`, `25-users.png`.

## 14. What the dashboard adds to prior research

**Confirmations**
- Phone numbers import-only with Twilio, SIP, Exotel (teardown: "Phone numbers are import-only. TelephonyProvider = twilio, sip_trunk, exotel"): `31-phone-import.png`.
- Public outbound is batch only with one start time plus a timezone (teardown EL-05): `35-batch-schedule.png`.
- $0.08/min on every plan, burst $0.16: `51-subscription.png`.
- No Indian compliance controls (teardown: "The batch API has no window, DNC or consent field"): zero hits for DND, DLT, TRAI, NCPR, consent, retry in any capture.
- Language detection off by default (teardown: "The language-detection tool is off by default"): `42-agent-tools.png`.
- Silence discount exists (teardown: "Silent stretches billed at 5% (vendor-claimed)"): the "re-transcribe" help text says it disables the silence discount.
- Memory exists (account phase: "built but gated"): a Memory (Alpha) tab is visible.
- Architect is Alpha and gated by a person at merge (teardown): Proposals tab and alpha note.

**Contradictions**
- Teardown "Defaults: LLM gemini-2.5-flash ... speculative turn off": a dashboard-created agent runs DeepSeek Flash 4.1 with speculative_turn on (`61-llm-list.png`, API read-back).
- Teardown "INR and UPI checkout (vendor-claimed)": none visible on the subscription tab (`51-subscription.png`); billing portal not opened, so unresolved.
- Account-phase LLM calculator vs dashboard per-minute costs differ 1.7x-2.3x (section 4); the earlier "default LLM costs 2.4x gemini-2.5-flash" cannot be restated from the dashboard, which does not list gemini-2.5-flash.
- The earlier knobs CSV reads `turn_timeout 10`, `silence_end_call 20`, `eagerness patient`: those came from our customised probe agent, not defaults; the dashboard agent reads 7, -1 and normal.

**Only the dashboard showed**
- 45 templates with flow previews, the Exotel form (7 fields, Mumbai region option), the batch CSV contract and two scheduling fields, the 10-item Architect checklist, the labelled turn controls (ignore terms, spelling patience, re-transcribe), the Turn V3 to Scribe lock, the Memory tab, per-row LLM latency and cost, plan concurrency and seats, and that the hidden campaigns surface is not exposed to a new Free workspace.

## 15. For VP

**Match (parity floor)**
- Per-row model latency and cost with a detailed-costs panel; descriptions with billing impact under every setting; explained locks.
- Docked test panel with mock tools; templates with flow preview; branches with traffic split; inline CSV contract with per-row overrides; analytics with date, granularity, group-by, branch; per-agent allowlist, authentication and overrides; a go-live checklist in the chat assistant.

**Beat (specifically how)**
1. **Outbound that is India-aware:** consent, DND/NCPR scrub, category-driven IST windows, retries, cost estimate and a stated reason when Submit is disabled.
2. **Number path:** buy or port India numbers with KYC time and cost stated up front instead of seven provider fields.
3. **Turn-taking in milliseconds** with Hindi and Hinglish back-channel lists on by default and the floor visible.
4. **Safe defaults:** end-call tool on, silence hang-up on, burst opt-in, AI disclosure in the first message, no open allowlist.
5. **Language:** a Hinglish option and Indic voice filters; Indic ASR choice not locked to a turn model.
6. **Honest cost strip:** state the prompt-size assumption, itemise telephony, show INR.
7. **Contacts:** a first-class contact object, not a user-ID string.
8. **Chat-first setup:** ElevenLabs' Architect is free only "through October 2026" and has no post-alpha price; VP's LLM-native setup is the direct counter.

**Avoid**
- Import-only numbers behind provider credentials; a US-shaped template library (FDCPA, 401k); sliders and settings with no numbers; unlabelled error-looking buttons; a Free RAG cap so small it blocks a trial; competing on price (a $0.08 platform fee is the same on every plan and the earlier margin estimate stands).

**Open questions only live calls can answer**
- What a default agent does on a live Indian-handset call: hang up, burst to 2x, treat "haan"/"hmm" as interruptions, hold Hindi or Hinglish, disclose it is an AI.
- Whether Hindi presets exist for interruption ignore terms; what `hinglish_mode` does and where it lives.
- What Realtime mode changes in latency, cost and language support.
- What the batch export, failure reasons and call-history columns contain.
- Which prompt size the dashboard LLM price assumes.
