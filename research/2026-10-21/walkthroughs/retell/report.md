# Retell AI: dashboard walkthrough analysis (trial account, 2026-10-21)

Grades used throughout: **[O]** observed (screenshot or text capture), **[D]** displayed-by-vendor (a number the product shows; not measured by us), **[I]** inferred (reasoned from cited observations), **[U]** unknown. Claim ids (wt-retell-NN) are in `research/2026-10-21/walkthroughs/retell/claims.json`. Screenshot names are in `data/walkthroughs/retell/png/`; "text" means the combined capture `99-all-page-text.txt` (section name in brackets).

## 0. Coverage: what was captured and what was not

**What exists.** 51 PNGs and one combined text file holding 69 captures. I read all 69 text captures (each repeats the sidebar, so I de-duplicated lines across captures and read every distinct line) and opened 24 screenshots directly to check the claims below. `00-NOTES-AND-COVERAGE.md` is empty, so Instinct's final report is the only narrative. [O] wt-retell-01

**Account state.** Free trial, $10.00 credit, concurrency 0/20, workspace "Vyakti", one member. Two agents (an API-created `VP-SYNTHETIC-teardown-renewal-hinglish` from the earlier phase with voice Saanvi, and the dashboard "Single-Prompt Agent"), plus a Conversation Flow agent. No phone number, KB, contact, batch, call or chat exists. So every runtime behaviour is unobserved: no call, no KYC, no batch send, no KB upload, no simulation, no QA report.

**Mislabelled or partial captures (do not over-read).** [O] wt-retell-02
- `06-Functions.png` shows ALL accordions collapsed plus an AI-QA feature preview; the open Functions list is in the text capture `06-functions` and in `09-model-dropdown.png`.
- `78-create-dialog-again.png` is the Create an Agent dropdown (Voice Agent / Chat Agent), not the dialog; the dialog is `79-voice-agent-options.png`.
- `10c-custom-providers-shot.png` is the MiniMax tab; the text `10d-accent-minimax` actually holds the Cartesia list. Fish Audio, Inworld and ElevenLabs voice tabs were never opened.
- 18 text captures have no PNG, among them the whole **Call settings** panel (`05-all-settings-expanded`), the function-add menu, the Accent dropdown and the From-number dropdown. Call settings values are therefore text-only and toggle states (voicemail, IVR hangup, DTMF) are not visible.
- Sample or seeded data: the AI QA page shows 68 of 240 calls dated 09/01/2025 to 10/01/2025 while Call History and Analytics show 0 calls, so those figures are sample data [I]; the four Alerting rows have titles that do not match their metrics and are probably templates [I].
- Never opened: Agent Handbook (so the AI-disclosure preset state on a dashboard agent is unseen), V0 version menu, Publish, Build with AI, Generate from prompt, Expressive mode and More Settings in the voice modal, the Gender filter options, Budget Setting, Auto recharge, Usage tab, Folders, Import, Chat Agent creation, Test LLM, call detail pages, export, Integrations Available tab, Contacts Actions menu, SIP-trunk form.

**Corrections to the screen notes (the text capture shows more than the pixels).** Hindi (India) IS in the language list at position 13 (the screenshot shows only the first 10 rows); the model list has 39 rows (screenshot shows 18); the default Analytics dashboard has 15 widgets (not 13); the free-trial panel in the sidebar reads Remaining $10.00 and Concurrency 0/20 with an Add Payment button; slider end labels exist as words (More waiting / Less waiting; blocks interruption / stops immediately); the Transfer Ring Duration scale ends at 90s.

## 1. Information architecture

Sidebar (15 destinations, 5 groups) [O] wt-retell-03:

| Group | Surface | What it does |
|---|---|---|
| (top) | Home | Conductor AI chat with history, quick actions, big Getting started card |
| BUILD | Agents | Agent list with folders, Import, Create an Agent (Voice or Chat) |
| BUILD | Knowledge Base | Master/detail list; + opens Add Knowledge Base |
| DEPLOY | Phone Numbers | List + search; + = Buy New Number or Connect via SIP trunking |
| DEPLOY | Batch Call | Batch list; Create a batch call full-page form |
| DATA | Call History | 13-column session table with filters, Actions |
| DATA | Chat History | 7-column session table for chat agents |
| DATA | Contacts | CRM-style table with Do Not Call column; CRM sync banner (New) |
| MONITOR | Analytics | Call Dashboard and Chat Dashboard tabs; custom dashboards; Add Chart |
| MONITOR | Live Monitoring | Ongoing calls table (empty) |
| MONITOR | AI Quality Assurance | Hero plus QA overview; Create QA; Configure QA Settings |
| MONITOR | Alerting | Alert rules list and Alert history |
| SYSTEM | Integrations | Connected / Available tabs; Request integration |
| SYSTEM | Billing | Credits, Billing History, Usage |
| SYSTEM | Settings | Sub-nav: Limits, Reliability, API Keys (API Keys / Public Keys), Webhooks, Workspace (General, Users, Roles) |

Inside an agent: left rail Agent / Workflow / Simulation; settings accordions (section 3). Persistent chrome: workspace switcher, Getting started checklist, Free trial panel, account switcher, Help, Updates (red dot), floating "Ask Conductor".

**Gated, beta or enterprise markers.** No Beta or Enterprise badge is visible anywhere in the captures. Gating that IS visible: Persona identity verification before buying a number; "+ Add Role" greyed out (reason not stated); "Multi-Prompt (Deprecated)" greyed out; checklist steps locked until earlier steps are done. **There is no Campaigns entry in the navigation** (earlier research inferred a server-side Campaigns object). [O]

## 2. First run

A new user lands on All Agents with an empty table (columns Agent Name, Agent Type, Voice, Phone, Edited by), a 0/7 Getting started checklist (Build your first agent; Run a test call; View transcript and analysis; Add a phone number; Make your first real call; Invite a teammate; Try advanced functions) with three steps locked, and the free-trial panel ($10.00, 0/20). [O] wt-retell-04

Path to a first working agent: **Create an Agent (dropdown: Voice Agent / Chat Agent) -> Create agent dialog (type cards, templates) -> builder -> Run Test.** About 4 clicks and 0 required fields: Conversational flow is pre-selected, the Create agent button is enabled with no template chosen, and the builder opens with a default model (GPT 5.6 Terra), voice (Cimo) and language (English US) already set and an empty prompt. A browser test needs no phone number. [I] wt-retell-05

Dialog contents: type cards (Single prompt "Easy to start", Conversational flow "Production-ready, deterministic"), Other options (Custom LLM; Multi-Prompt deprecated and greyed), 10 template tabs (All, Receptionist, Outbound Sales & Reactivation, Appointment Booking, Lead Qualification, Customer Support & After-Hours, Back-Office Task Automation, Debt Collection, IVR & DTMF Automation, Real-Time Translation), 28 template cards plus Build from scratch and Generate from prompt (Suggested). Templates are US-centric (Insurance Verification, Mortgage Follow-Up, Pharmacy Refill, Legal Intake, Medical Receptionist); the nearest Indian fits are Payment Reminder, Payment Collection, Win-Back and Reminder & No-Show Reducer; there is no renewal template. [O] wt-retell-06

Friction: the default leans to the harder type (Conversational flow) although Single prompt is called easy; the primary button is clipped at 1280 px; the tour tooltip claims the test panel is "loading" on pages with no test panel (wt-retell-56).

## 3. Agent builder end to end

Anatomy [O] wt-retell-07: top bar (agent name, Environment tag, "...", share, V0 version, Test, Build with AI, Publish); strip "Agent Details" with Cost / Latency / Tokens [D] wt-retell-08; selectors (model + gear, voice, language) and Agent Handbook; Welcome Message row (shows "User speaks first", hint "AI starts speaking after silence"); the prompt editor (placeholder only, no template or example); ten accordions; right test panel (Test Audio / Test LLM, `{ }`, Run Test).

- Cost reconciliation [I] wt-retell-09: $0.134/min = $0.055 infra + $0.015 platform voice + $0.064 model (the Terra row in the picker), using the rate card from the earlier public phase. Telephony is not in the strip.
- Tokens [D/I] wt-retell-10: 814 with an empty prompt (834 on a Conversation Flow agent) means about 20% of the 4,000-token billing threshold from earlier research is used by built-in text before the user writes anything.

### Settings table (default as captured; range or options; file)

| Section / setting | Default as captured | Range or options | File |
|---|---|---|---|
| Agent type | Conversational flow pre-selected in dialog | Single prompt, Conversational flow; Custom LLM; Multi-Prompt (deprecated) | 03, 03b |
| Model | GPT 5.6 Terra ($0.064/min) | 39 models, 3 groups | 04, 09 |
| Voice | Cimo (retell-Cimo, American, Middle Aged) | 21 platform voices; 5 custom providers | 04, 10 |
| Language | English (US) | 63 locales; Multiselect | 04, 11 |
| Welcome Message | User speaks first | options not visible | 75, text 04 |
| Prompt | empty | placeholder: role, style, objective; "/" functions, "{{" variables | 04 |
| Version / environment | V0; Environment tag | not opened | 04 |
| Functions | one function, end_call | End Call, Call Transfer, Agent Transfer, Press Digit, In-Call SMS, Extract Dynamic Variable, Code, Custom Function + 8 integrations | 09, text 07 |
| Knowledge base | none (Advanced Settings collapsed) | Add: web pages, files (50MB), text, Drive, OneDrive, Notion | 05, 74 |
| Use contact's memory | ON | toggle | 05, 07 |
| Background Sound | None | select + gear | 05 |
| Response Wait time | 0ms (handle far right; ends More waiting / Less waiting) | slider, ms | 05 |
| Dynamically adjust on user input | unchecked | checkbox | 05 |
| Interruption Sensitivity | 0.9 (ends blocks interruption / stops immediately) | slider 0 to 1 (scale from API) | 05 |
| Reminder Message Frequency | 10 seconds, 1 times | two numbers | 05 |
| Pronunciation | empty | IPA and CMU for the selected voice | 05 |
| Denoising Mode | Remove noise | Remove noise; Remove noise + background speech; No denoising | 05 |
| Transcription Mode | selected option not visible | Optimize for speed / accuracy (Provider Config) | 05 |
| Vocabulary Specialization | not visible | General; Medical | text 05 |
| Boosted Keywords | empty | free list | text 05 |
| Voicemail Detection | toggle state not visible | Hang up / Leave a message | text 05 |
| Call Screen Handling (iOS/Android) | state not visible | predefined message | text 05 |
| IVR Hangup | state not visible | on/off | text 05 |
| User Keypad Input | state not visible; timeout 2.5 s | timeout, termination key (0-9, #, *), digit limit | text 05 |
| End Call on Silence | 10.0 m | slider with Min/Max | text 05 |
| Max Call Duration | 1.00 h | slider with Min/Max | text 05 |
| Ring Duration | 30 s | 5s to 300s | text 05 |
| Data Storage | Everything, Retention: Keep forever | Everything; Everything except PII; Basic Attributes Only | 13 |
| PII Redaction | none selected | 14 categories in 6 groups | 14 |
| Safety Guardrails | none selected | 1 input + 9 output | 14b |
| Do-not-contact Handling | OFF | toggle | 13 |
| Opt In Secure URLs | OFF (24 h expiry) | toggle | 13 |
| Fallback Voice ID | Automatic fallback | or select a voice | 13 |
| Default Dynamic Variables | none | Set Up | 13 |
| Post call extraction | Call Summary, Call Successful, User Sentiment; model GPT-5.6 Terra | add fields | 12 |
| Save conversation to memory | OFF ($0.005 per run) | toggle | 76, text 05 |
| Agent webhook URL | empty | URL; Test button | 12 |
| Webhook Timeout | 5 s | slider from 1s | 12 |
| Webhook Events | not configured | Set Up | 12 |
| MCPs | none | Add MCP | 12 |
| Transfer (form) | cold, SIP INVITE, caller ID = Retell number, ring 30s, talk-while-waiting checked | see section 6 | 08 |

[O] for all rows; call settings rows are text-only. wt-retell-24..32.

## 4. Model, voice, transcriber and language choice

**Models** [O] wt-retell-16/17/18/19: 39 entries: 21 "Versatile and highly intelligent", 12 "Fast and cost-efficient", 6 "Speech to speech". Every row carries a per-minute price [D]: cascaded from $0.0016 (GPT 5 nano) to $0.32 (GPT 6 Astra); S2S from $0.07 to $0.38. Four "Suggested" badges (GPT 5.6 Terra $0.064, GPT 5.5 $0.16, GPT 5.4 $0.08, Claude 5 Sonnet $0.064), so the badge does not signal price. Not sorted by price. GPT rows have submenu chevrons (unopened). No latency, quality or context-window column; only an external "Model leaderboard" link. No Indian-lab or open-weight model. The earlier API read counted 32 LLM enum values; the dashboard shows 33 cascaded rows (unexplained).

**Voices** [O] wt-retell-20/21/22/23: Platform Voices = 21 cards (15 American, 2 British, 4 Mexican). The Accent filter offers only American, British and Mexican. Cards show name, accent, age band, provider tag, ID and a play button: no price, language list or latency. Custom Providers: MiniMax, Cartesia, Fish Audio, Inworld, ElevenLabs; at least 39 MiniMax rows and 85 Cartesia rows in the text (Cartesia list truncated mid-row), traits American, Southern American, British, Mexican, French, German, Spanish, Brazilian, Chinese, Japanese; **none Indian**. The same persona names appear under retell-, minimax- and cartesia- IDs with a Retell or Provider tag, which supports the earlier "Platform Voices are re-listed" inference [I]. The API-created agent in the list uses a voice (Saanvi) that the picker does not surface [U: accent unknown].

**Language** [O] wt-retell-24/25: 63 locales, searchable, Multiselect toggle inside the dropdown. India: English (India) #4, Hindi (India) #13, Kannada, Marathi, Tamil, Urdu (all India), plus Nepali. Missing: Telugu, Bengali, Gujarati, Malayalam, Punjabi, Odia, and any Hinglish or code-switch option. What Multiselect does is unknown [U] wt-retell-25. Regional variants are separate rows, not grouped; order is not alphabetical.

**Transcriber.** Not chosen as a named provider on the default panel: "Transcription Mode" offers Optimize for speed / accuracy with "(Provider Config)" links (selected option not visible); Vocabulary Specialization offers General or Medical only (no Indic set); Boosted Keywords. The earlier research found Azure, Deepgram, Soniox, AssemblyAI and Muse behind this; the dashboard hides the choice behind the two radios. [O/I]

**Trade-off display.** Strong: price at every model row and one Cost / Latency / Tokens strip (vendor-displayed, hover content not captured [U]). Weak: voices and languages carry no price or latency; cost is not itemised on screen.

## 5. Conversation control

| Control | Retell default (dashboard) | Units / range | Note |
|---|---|---|---|
| Response Wait time | 0ms | ms, slider with word ends | added hold before replying; most reactive end |
| Dynamic adjust | off | checkbox | |
| Interruption Sensitivity | 0.9 | 0 to 1 | near "stops immediately" |
| Reminder | 10 s, 1 time | seconds, count | one nudge on silence |
| End Call on Silence | 10.0 min | min to max slider | |
| Max Call Duration | 1.00 h | slider | |
| Ring Duration | 30 s | 5 to 300 s | outbound and transfer |
| Voicemail | detection with hang up or leave message | | |
| IVR | hang up if IVR detected | | |
| DTMF | listen; timeout 2.5 s; termination key; digit limit | | |
| Denoising | Remove noise | 3 modes | |
| Background sound | None | select | |

[O] wt-retell-26/27/28/29/30. Interpretation [I]: Retell defaults sit at the reactive extreme (0 ms added wait, 0.9 interruption), and no endpointing silence in ms is on the default panel.

**Relation to prior research.** Instinct's Bolna capture: endpointing 500 ms, linear delay 900 ms, hangup-on-silence 20 s, call timeout 90 s; our code-based inference gives Bolna a reply floor of about 1.4 s (evidence.2026-10-20.acct-bolna-reply-floor, not yet measured on a call). Retell is the opposite end: 0 ms added wait but unknown provider endpointing. Our lab stacks cut in on 15-42% of turns and all took the 2.4 s elderly pause (open.2026-10-19.turn-taking), so an aggressive English-tuned default can be as harmful as Bolna's slow one in Hinglish. This is a hypothesis; only a call battery can score it [I] wt-retell-31. Retell's 10-minute silence hang-up and 1-hour cap are about 30x and 40x Bolna's 20 s and 90 s; at $0.134/min that is $1.34 and $8.04 of exposure per runaway call [I] wt-retell-29.

## 6. Tools, knowledge base, integrations, workflows

- **Functions** [O] wt-retell-33: end_call present by default; add menu = End Call, Call Transfer, Agent Transfer, Press Digit (IVR Navigation), In-Call SMS, Extract Dynamic Variable, Code, Custom Function, plus HubSpot, Salesforce, Microsoft Dynamics 365, GoHighLevel, Zoho CRM, Zendesk, Calendly, Cal.com. No WhatsApp or Indian CRM.
- **Call Transfer form** [O] wt-retell-34: Static or Dynamic routing, E.164, extension; Cold / Warm (one-way brief) / Agentic Warm (two-way then bridge); SIP INVITE or REFER; displayed caller ID = Retell number or user's number; Transfer Ring Duration 30s (scale to 90s); custom SIP headers; Talk while waiting checked with Prompt or Static Sentence; destination pre-filled with a +1 number [phone redacted].
- **Knowledge base** [O] wt-retell-35: name + documents from Add Web pages, Upload files (50MB), Add text, Connect Google Drive, Microsoft OneDrive, Notion; first 10 KBs free. No per-source limits shown. Empty page has no CTA button.
- **Memory** [D] wt-retell-36: read ON, update OFF at $0.005 per run.
- **Workflow tab** [O] wt-retell-37: lifecycle canvas (Pre-call functions, Call started, Agent, Call ended, Post Call Extraction, Save conversation to memory, Post-call functions; KB and Webhook nodes with counts).
- **Conversation Flow builder** [O] wt-retell-38: node canvas; palette Conversation, Subagent, Function, Call Transfer, Press Digit, Logic Split, Agent Transfer, In-Call SMS, Extract Variable, Code, MCP, Ending, Note; Subflows; Global / Node settings; Transition Flexibility Flex or Rigid; 50% zoom, minimap. No Functions or MCPs accordion (they are nodes).
- **MCPs, webhooks, Integrations** [O] wt-retell-39/48: Add MCP; agent webhook URL with test; Integrations page empty with Add integration and Request integration.

## 7. Testing and quality

[O] wt-retell-40: Test Audio / Test LLM with Run Test (browser; not run); Simulation tab with Test Cases (Test Case, User Prompt, Success Criteria, Edited by) and Batch Testing History, empty, with Import; Conductor suggestions "Improve using failures" and "Suggest edge case tests"; checklist items "Use simulation testing" and "Run AI quality assurance"; Call History with End Reason, Session Status, User Sentiment, Session Outcome, End to End Latency columns; Live Monitoring table.

**AI QA** [O/I] wt-retell-41: promotes audio quality (overlapping speech, tone, WER), hallucinations, resolution accuracy, sentiment, transfer success and wait time, top questions; "First 100 minutes of analysis is free". The displayed numbers (87.00, 75.00%, 70%) are sample data [I]. **Alerting** [I] wt-retell-42: four rows with mismatched titles and metrics, Edit buttons, email or webhook delivery; no thresholds in the list.

Not seen: a transcript or call detail page, recordings, logs, PCAP, per-call cost lines, test-case creation, or what a simulation result looks like.

## 8. Telephony and numbers

The + menu has two options: **Buy New Number** and **Connect to your number via SIP trunking** (no prices in the menu). Buy New Number opens "Identity Verification Required ... Powered by Persona" before any country, number or price; verification was not started. [O] wt-retell-43. No India or country choice is visible on this path; earlier research found Retell-bought numbers are US/Canada only and Indian numbers need custom telephony [carried from prior, not re-observed]. Limits page shows CPS 1 for Telnyx, Twilio and Custom Telephony (adjustable); SIP-trunk form, import UX, and KYC time or cost are unseen [U].

## 9. Campaigns and batches

Single-page form, not a wizard [O] wt-retell-44: Batch Call Name; From number (empty list); Upload Recipients (template download; CSV up to 50 MB; Recipients preview pane "Please upload recipients first"); When to send the calls (Send Now default, or Schedule with Select date and timezone **Asia/Calcutta**); When Calls Can Run (default 00:00-23:59 Mon-Sun; popover with start, end, "+ Add" for more ranges, Days of Week); Reserved Concurrency for Other Calls (5; "allocated to batch calling: 15" = 20 - 5 [I]); implicit terms sentence; Save as draft; Send (disabled with no reason). Price: "Batch call cost $0.005 per dial" (small grey subtitle) [D].

**Absent** [O] wt-retell-45: consent, DND or NCPR scrub, DLT or sender header, retries or attempt budget, pacing, per-lead windows, agent selector (presumably bound to the From number [I]), legal-hours warning. The timezone default differs from the earlier API default of America/Los_Angeles; the dashboard value is probably browser- or workspace-derived [O/I] wt-retell-46. **Blocked** at From number (no number; KYC wall), so CSV template columns, preview, dedupe, +91 handling and DNC behaviour were not seen [O] wt-retell-47. The dashboard DNC toggle copy says it will "skip DNC contacts in outbound calls" but the earlier docs say batch calls do not check do_not_call [U] wt-retell-54.

## 10. Analytics, call history and reporting

[O] wt-retell-49/50/51/52: Analytics = Call Dashboard and Chat Dashboard tabs, "+" for more dashboards, default range 28 days, Filter, Breakdown, Add Chart, 15 default widgets (Call Counts tile and chart, Call Duration, Call Latency, Concurrency Used, Call Successful, Disconnection Reason, User Sentiment, Phone inbound/outbound, Call Picked Up Rate, Call Successful Rate, Call Transfer Rate, Voicemail Rate, Average call duration, Average Latency); empty widgets are blank with no message. Call History = 13 columns, filters, three icon buttons, Actions, 50 per page; "Session" vocabulary. Contacts = 9 columns incl. Do Not Call and External ID, CRM banner. Live Monitoring = 6 columns; take-over controls only hinted by Conductor chips. Export not visible (Actions menu unopened).

## 11. Billing, credits, plans and price display

[O/D] wt-retell-53/57/58: Free trial with $10.00 credit; Billing = Credits Balance, Buy credits, Auto recharge, Budget Setting (unopened), "Enable auto-recharge" banner, Change payment methods and Manage billing info (external), Billing History with one Upcoming Invoice $0.00 Ongoing, Usage tab (uncaptured). All USD; no INR, UPI or GST field. Where prices appear in-product:

| Price shown | Where | File |
|---|---|---|
| $0.134/min total | builder strip | 04 |
| $0.0016 to $0.32/min LLM; $0.07 to $0.38 S2S | model picker rows | 09 |
| $0.005 per dial | batch form subtitle | 24 |
| $0.005 per memory run | memory toggle and Workflow node | 76 |
| $0.10/min burst (up to 3x, max 300 extra calls) | Limits (toggle ON) | 5x-settings |
| $0.02/min stable server | Reliability (toggle OFF) | 6x-settings_reliability |
| first 10 KBs free; QA first 100 min free; 30 Conductor credits per day | KB dialog, QA hero, Limits | 73, 46, 5x-settings |
| number price, concurrency price, Conductor price after free | not shown | 29, 24, 5x-settings |

The Limits page also shows Concurrent Calls Limit 20, Reserve Inbound Capacity Not Set, LLM Token Limit 32768, CPS 1 per provider, and a Concurrency and CPS calculator. Burst is ON by default (consistent with the earlier API read), so metered surcharge exposure exists on a trial [O/I].

## 12. Team, org, security, API keys, compliance

[O] wt-retell-55/59/60/61: Users: one member (you), role badge, Invite a member. Roles: Admin, Developer, Member (System roles described in prose; Member is read-only with "scrubbed history"); Add Role greyed. No SSO or audit page in Settings. API Keys tab (two keys, fully masked [secret redacted], Name / Key Value / Created at only; one key marked "Webhook") and Public Keys tab; account Webhooks (URL, Test, Timeout 5s); Workspace General (name, read-only ID). Security & fallback: store Everything / Keep forever; 14 PII categories none selected and none India-specific; 10 guardrails none selected; DNC off; Secure URLs off; automatic fallback voice. Nothing is pre-enabled for privacy or compliance.

## 13. UX quality ledger

**Excellent (VP must match or beat)**
- Price on every model row (`09-model-dropdown.png`: "($0.064/min)" beside each name) and a live Cost / Latency / Tokens strip (`04-agent-builder-top.png`).
- Price at the point of the toggle: $0.005 per memory run (`76-workflow-tab.png`), $0.10 burst (`5x-settings.png`), $0.02 stable server (`6x-settings_reliability.png`).
- Plain-language transfer modes with parentheticals (`08-call-transfer-form.png`: "AI has a 2-way conversation with agent, then bridges").
- Every setting has a one-to-two-line description (`05-settings-state.png`).
- Lifecycle Workflow canvas with pre- and post-call slots (`76-workflow-tab.png`).
- Page-aware Conductor suggestions on every page (`22-phoneNumbers.png` "Reduce spam labeling"; `41-call-history.png` "Filter failed calls").
- Sectioned navigation and a persistent, stepped checklist with previews (`71-home-onboarding-conductor.png`).
- Reserved-concurrency control with an allocation readout (`24-batch-create-shot.png`).

**Clunky**
- Create defaults to Conversational flow while Single prompt is "Easy to start" (`03-create-agent-dialog.png`).
- Empty prompt with placeholder only, no starter (`04-agent-builder-top.png`).
- Ten collapsed accordions in one long column; Call settings hides voicemail, DTMF and silence limits (`04`, text `05`).
- Setting-heavy modals: transfer form about 12 inputs (`08-call-transfer-form.png`).
- Voice and language pickers show no price or latency; Platform voices cannot be filtered by language (`10-voice-picker.png`).
- PII: 14 boxes ticked one by one, no select all (`14-state.png`).
- Auto-recharge offered in three places on one page (`5x-billing.png`).
- Slider ends labelled in words only; far-right handle beside "0ms" reads inverted (`05-settings-state.png`).

**Broken**
- Stale tour "Wait for the test panel to finish loading" on every non-builder page (`21-knowledgeBase.png`, `5x-billing.png`).
- Layout overflows at 1280 px; primary button clipped (`02-agents-empty.png`, `75-agent-page.png`).
- Send disabled with no reason (`24-batch-create-shot.png`).
- Sample data (QA 240 calls dated a year ago; Alerting rows with mismatched metrics) shown without a Sample label (`46-quality-assurance.png`, `47-alerting.png`).
- Empty tables with no empty-state message or CTA (`41-call-history.png`, `43-analytics.png`, `42-contacts.png`).

## 14. What the dashboard adds to prior research

**Confirmed.** Contact memory read ON / update OFF (RAP: "the default API-created agent reads and does not update"); burst enabled; Persona KYC before outbound ("KYC is required before outbound: Persona ID, one person per account (O, RET-12)"); first 10 KBs free; US-centric PII categories with no Aadhaar or PAN; "Batch calls ... No pacing, no documented retries, no DNC check" (RET-05) matches a form with no retry, pacing or DNC field; Platform Voices re-listed (names repeat under three providers); Indic coverage "6 Indian locales (en-IN, hi, kn, mr, ta, ur)"; Conductor 30 free credits per day; interruption 0.9 default (matches the dashboard-seeded agent in RAP-19).

**Contradicted or refined.**
- "Accounts: RBAC and SSO are Enterprise-only (O, RET-09)": the free trial shows three fixed System roles; only custom roles (greyed) and SSO (no page) look gated.
- "US defaults: America/Los_Angeles timezone ... (O, RET-17)" and the batch window default: the dashboard batch Schedule form defaults to Asia/Calcutta.
- "There are 32 LLMs, plus the gpt-realtime family ... (O, RET-16)": the picker has 33 cascaded rows and 6 S2S.
- "Batch calls and inbound calls don't check do_not_call": the dashboard copy says DNC handling skips DNC contacts in outbound calls; unresolved.
- "A separate 'Campaigns' object ... is referenced but undocumented (I, RET-06)": no Campaigns surface in the navigation.
- "6 of 300 voices have Indian accent and none is labelled Hindi" (account phase): the dashboard picker surfaces none of them (accent filter has 3 options); Hindi exists only as a language, not as a voice tag.
- Screen-note claim "no Hindi option": wrong; Hindi (India) is #13.

**Only the dashboard showed.** Navigation and onboarding structure; the 39-row model catalogue with prices and groups; the Cost strip and its 0.134 reconciliation; 15 analytics widgets; Call History columns including Session Outcome; 28 templates; concurrency 15 = 20 - 5 in the batch form; Persona wall at Buy New Number; Call settings defaults (10 min silence, 1 h cap, 2.5 s DTMF); fixed roles; sample-data QA and Alerting; the 10-source KB menu; transfer-form options.

## 15. For VP

**Match (parity floor).** Per-row price in the model picker plus a cost / latency / token strip; browser test panel with Test LLM; Simulation tab with success criteria; lifecycle Workflow view; post-call extraction defaults (summary, success, sentiment); cold, warm and agentic-warm transfer with plain-language explanations; KB sources (web, files, text, Drive, OneDrive, Notion); per-feature prices at the toggle; live monitoring, alerts, dashboards with breakdown, AI QA, call history with cost and latency columns; limits and concurrency page; API keys with a webhook-signing badge; fixed roles.

**Beat (specifically).**
1. Batch form that is India-correct by default: consent and DND/NCPR scrub, 09:00-21:00 IST windows with a legal-hours warning, retries and per-lead windows, an agent selector, a stated reason when Send is disabled.
2. Indic discoverability: language filter and Indian-accent and Hinglish tags on voices, Hindi vocabulary sets, a visible language-hold control (Retell has Hindi as a language but no Hindi voice tags).
3. Aadhaar and PAN in PII; privacy-first defaults.
4. Conservative silence and duration defaults with a spend cap; surcharges off until chosen.
5. An itemised cost strip including telephony.
6. Empty states with a CTA, Sample labels, tours scoped to their page.
7. Turn-taking in ms with Hindi-aware labels (hypothesis until measured).
8. A number path that states KYC time and cost before commitment.

**Avoid.** Opt-out surcharges (burst ON by default); defaults that hold a live line for 10 minutes; sample data without a label; a stuck global tour; US-only templates and PII lists; hiding the transcriber choice behind two radios.

**Open questions only live calls (or a purchased number) can answer.**
1. Does Retell's 0 ms wait plus 0.9 interruption over-cut Hinglish, and what is its real endpointing?
2. What does Multiselect Hindi + English do to language and script hold?
3. Does the DNC toggle skip a flagged row in a batch?
4. Is the AI-disclosure preset on for a dashboard-created agent (Agent Handbook never opened)?
5. What do Cost lines look like after a call, and does the 4,000-token rule scale the whole duration?
6. Are the voicemail and IVR defaults on, and how do they handle Indian operator announcements?
7. What does Session Outcome contain?
8. What happens in a batch with a messy CSV (+91, duplicates, empty variables)?
9. What are KYC time, number price and India options after Persona?
10. What do the Fish Audio, Inworld and ElevenLabs tabs and the voice Expressive mode offer, and which providers serve Platform voices at runtime?
