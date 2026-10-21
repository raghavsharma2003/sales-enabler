# Exotel (voicebot / AI agents): dashboard walkthrough analysis, 2026-10-21

Source: Instinct's walk of the trial account (team@vyakti.ai) on 2026-10-21, 24 screenshots, Instinct's notes (local file and Drive copy are the same size, 15,922 bytes), the cross-vendor report section, and the prior Exotel teardown. Nothing here was measured on a call. Latency, cost and limit figures are what the product displays. Grades: observed, displayed-by-vendor, inferred, unknown. Claims marked [notes-only] rest on Instinct's notes with no screenshot in the folder. Claim ids are wt-exotel-01 to wt-exotel-55 (claims.json).

## 0. Coverage: what was captured and what was not

| Item | State |
|---|---|
| Screenshots | 24 PNGs. I opened 23 directly. exotel-03-voicebot-activity was read from the screen notes only. |
| Per-page text captures | None exist for Exotel. The Drive folder holds the 24 PNGs, the notes file and a zip. Below-the-fold content (full option lists, long forms) therefore rests on Instinct's notes, not on text. |
| Account state | Unverified (KYC pending), 150 credits, 0 min used, no calls, no numbers bought, no campaign, no keys created. |
| Pre-existing objects | Agent "Exotel-Voicebot" v1 (Stable, Live), two App Bazaar flows, two named API keys, groups Sales and Support, one address-book contact. Not created by the evaluation. |
| Gated | Payment page (needs GST details), campaigns (Caller IDs and Lists failed to load; Engage says "Complete KYC to use campaigns"), ExoPhone purchase (not clicked), Web Call test ("Coming soon"). |
| Blurred or loading | exotel-03-voicebot-workflow is a blurred overlay with no readable settings. The readable builder views are 05, 15 and 16. |
| Mislabelled | 02-voicebot-home is the agent Test tab. 08-integrations is Integrations > Database with the theme menu open. 23-analytics holds no analytics (a blank broken-frame panel). |
| Not opened by Instinct | Create-agent form, Create Version, Templates, LLM and voice dropdown contents, Report Type options, Type filter options on Model Configuration, number purchase, KYC, SIP, Access Control, Heartbeat, Audio Library. |
| Sensitive captures | exotel-11 and exotel-12 show the owner's phone number in clear. exotel-13's black box leaves the top of the trial-number digits partly visible. Do not publish or commit these three files. |

Read this before using the report: the whole outbound path, the full builder settings list and the model catalogues were seen only through notes or not at all. Where I say "no X exists" I mean "none was captured".

## 1. Information architecture

Three separate shells make up the product (wt-exotel-03).

**A. Classic console, "Obelix by Exotel, Built in Bengaluru" (my.exotel.com tenant).** Blue sidebar, uppercase buttons.
- Top bar: CALL, SMS, API Credentials link, an unlabelled OFF toggle, Credits 150, help, avatar menu. Green five-step verification banner.
- CALLS: Inbox (voicemail and message search, transcription, archive, assign to user; empty), Sales, Support, Call Settings (external).
- HOUSE OF AI [NEW]: AI Voice Agents (external link, opens shell B).
- SMS: Outbox, SMS Stats [BETA], Upload Templates [BETA], SMS Settings (DLT-style templates with 0/1000 quota, template-match tester, Sender ID, RCS upsell) [notes-only].
- TOOLS: RCS (external), ExoVerify (external), Campaigns, Engage (external, shell C).
  - Campaigns tabs: Campaigns, Lists, Contacts, Settings. Sub-tabs: Call, SMS, WhatsApp, Dialer.
- MANAGE [notes-only, below fold in screenshots]: Address book, Co-workers and Groups, Talk to our Telephony Expert, App Bazaar, ExoPhones.
- MY ACCOUNT [notes-only]: Personal Info, Impersonation, Company Info, Notifications, Make a Payment.
- MONITOR [notes-only]: Co-worker Activity Log, Analytics, Reports, Developer (API Settings).
- Also named but not drilled: Access Control, Heartbeat, Audio Library.

**B. Voice Agents app (voicebot.in host).** White sidebar, indigo buttons.
- BUILD: Agents; Integrations > Tools, Database.
- MONITOR: Interactions, Analytics, Reports.
- MANAGE: Account, Model Configuration.
- Credit Usage card at the bottom; avatar menu has Theme (Light, Dark, Match Browser) and Logout.
- Agent detail tabs: Workflow, Rollout, Knowledge Base, Database, Activity, Test. Header actions: Freeze Agent, Talk to Agent, Edit Agent.

**C. Engage (SMS and WhatsApp campaigns).** Sidebar: Campaigns (SMS, WhatsApp), Contacts, List, Customise Sidebar.

| Surface | What it does |
|---|---|
| Classic Inbox | Voicemail and message triage with transcription (empty, exotel-01) |
| Campaigns | List-based outbound for Call, SMS, WhatsApp, Dialer (exotel-09, 10) |
| Address Book | Contacts and lists with an export-permission toggle (exotel-12) |
| Co-workers and Groups | Users, roles, groups (exotel-11) |
| App Bazaar | Call-flow apps and the trial-to-paid funnel (exotel-13) |
| Agents | List of voice agents, Active or Archived (exotel-06) |
| Integrations > Tools | Custom API tools (exotel-17) |
| Integrations > Database | Account-level lookup tables (exotel-08) |
| Interactions | Call logs (exotel-22) |
| Analytics | Embedded view, rendered blank (exotel-23) |
| Reports | Emailed exports (exotel-24) |
| Account | Concurrency limit only (exotel-25) |
| Model Configuration | Account-level model rules, empty (exotel-26) |

Badges: NEW (House of AI), BETA (SMS Stats, Upload Templates), "Coming soon" (Web Call). KYC-gated: campaigns (Engage text, exotel-14), numbers. GST-gated: payment [notes-only]. Concurrency increase is chargeable. No Enterprise-only badge appears anywhere.

## 2. First run

- A new user lands in the classic console with an empty Inbox and a 9-10 px green banner: Verify Number, Complete KYC, make a payment, Get an ExoPhone, done. Five steps in one sentence, no progress indicator (exotel-01).
- The Voice Agents app already holds a demo agent, "Exotel-Voicebot", created 20 Oct with a flow app "voicebot-mum-prod-default-flow". I infer both were auto-provisioned at sign-up (wt-exotel-06). So a first call does not need a build; it needs a verified number to call.
- Steps to a first working agent of your own, as far as visible: Create (form not captured) > edit identity and sub-agent Instruction > pick language, voice, model > Save and Rollout > Go Live (create appflow in App Bazaar) > attach an ExoPhone > test by phone. That is at least 6 in-app steps after the 5 banner steps, across 3 surfaces.
- Required fields seen: Agent Name and Description (Edit view, exotel-05), sub-agent Instruction (exotel-16). Tool form: name, description, base domain (3, exotel-17). Campaign: name and at least one list (exotel-10). The create-agent form's required fields are unknown.
- Test path: the Test tab offers only "Add a phone number to test your agent" (no visible field) and a disabled Web Call tagged "Coming soon" (exotel-02).
- Evaluator timings, cloud browser, one run each: classic page about 4.7 s, cold Voice Agents load 12-15 s, SSO hop about 12 s [notes-only].

## 3. Agent builder end to end

**Workflow tab.** Linear graph Bot > "tool Calling Agent" (label Supervisor agent, "Invokes the tool call and returns the response") > End, with zoom, fit and a 3D toggle. Right panel "Bot Details": Agent Identity, Sub-Agents (1), General Settings, Languages, LLM Model, Speech to Text, Text to Speech, Webhooks, System Prompt, Version Information, Specialization Prompts, Denoiser, VAD Configuration, Conversation Nudges, Intents, Automated Call Intents, Query Definition, Go Live (the full list is [notes-only]; only Speech to Text, Text to Speech, Webhooks, System Prompt and Version Information are in pixels, exotel-15).
- System Prompt: locked. One sentence about "strict guardrails"; text not shown, no editor in view or edit mode (exotel-15, notes DOM check).
- Sub-agent Instruction: free-form monospace markdown, "## Identity" then "## Objective" (demo persona "Exo"), nested scroll box (exotel-16).

**Edit Agent.** Same editor. Discard and "Save and Rollout" (disabled until a change), version select (v1 Stable Live), amber overwrite warning (exotel-05). Save and deploy are a single action.

**Rollout.** Versions with a traffic split; v1 serves 100%; "Test this version"; Test Threads (0) (exotel-04-rollout). No visible Create-version button.

**Test.** Phone call or Web Call (coming soon) (exotel-02).

**Knowledge Base.** Corpus table, empty, no add button visible (exotel-04-knowledge-base).

**Database.** Attach account tables; create them elsewhere (exotel-03-voicebot-database, exotel-08).

**Activity.** "No activity yet", no filters (exotel-03-voicebot-activity, screen notes).

Settings table. "Source" says whether the default is in pixels or in notes only.

| Setting | Default as captured | Range or options | Source file |
|---|---|---|---|
| Agent status | Active | Active, Archived (list toggle) | exotel-06; notes |
| Active version | v1 Stable, Live | Versions with traffic split | exotel-04-rollout.png |
| Traffic on current version | 100% | Split across versions (control not seen) | exotel-04-rollout.png |
| Languages | English, Hindi | Picker contents unknown | exotel-06.png (chips) |
| Greeting | Disabled | Toggle; text not seen | notes.md |
| Mask Sensitive Data | Disabled | Toggle (PII masking) | notes.md |
| Max Call Duration | Disabled | Toggle; value not seen | notes.md |
| LLM provider | Google IN | Not enumerated | notes.md |
| LLM model | Gemini 3 Flash (config string "gemini-2.5-flash-with-thinking") | Not enumerated | notes.md |
| LLM input / output type | Voice / Text | Not enumerated | notes.md |
| Speech to Text | "azure" in Bot Details; Deepgram India configuration rule in Edit | STT Engine field; list not seen | exotel-15.png; notes.md |
| Text to Speech | ElevenLabs, voice Clyde (en) | 183 voices with tags | exotel-15.png; notes.md |
| Webhooks | None configured | List | exotel-15.png |
| System Prompt | Platform guardrail text, locked | None | exotel-15.png |
| Sub-agent Instruction | Exo demo persona, markdown | Free text | exotel-16.png |
| Specialization Prompts | None | List | notes.md |
| Denoiser | ON, enhancement 0.8 | Level (range not seen) | notes.md |
| VAD Configuration | None | Contents unknown | notes.md |
| Conversation Nudges | Default wording; after 7 s; up to 3 times; then end call | Not seen | notes.md |
| Intents | 3: Pricing, BotCapabilities, TechnicalDetails | Name plus description | notes.md |
| Automated Call Intents | None | | notes.md |
| Query Definition | None | | notes.md |
| Go Live | Create appflow or Use existing appflow | Two paths | notes.md |
| Version description | "Initial version" | Text | exotel-15.png |
| Knowledge Base filters | Active; Date Any; Status Any; 10 rows | Active or Archived | exotel-04-knowledge-base.png |
| Interactions filters | Interaction ID; Oct 14 to Oct 21 (7 days); Agent Any; 20 rows | | exotel-22.png |
| Reports | Type Interactions; Oct 01 to Oct 21; 10 rows | Other types not seen | exotel-24.png |
| Model Configuration filters | Oct 21 minus 30 days (Sep 21 to Oct 21); Type All; 20 rows | | exotel-26.png |
| Concurrency limit | 5 | Email request, chargeable | exotel-25.png |
| Custom tool HTTP method | GET | Other methods not seen | exotel-17.png |
| Campaign audience | Static | Static, Dynamic, Dynamic with CSV | exotel-10.png |
| Campaign lists | none selected | up to 5 | exotel-10.png |
| Campaign schedule, retries, throttle | not captured in pixels; notes list Now or Later, 0 to 3 retries, Auto or Custom CPM | see section 9 | notes.md |
| Address Book export permission | ON | Toggle | exotel-12.png |
| Theme | Light Mode | Light, Dark, Match Browser | exotel-08.png |

## 4. Model, voice, transcriber and language choice

- Presentation: each of Speech to Text, Text to Speech and LLM is a collapsed accordion row showing only the current name (exotel-15). No latency, price, quality or language information appears beside any choice (wt-exotel-14, 35). Compare Vapi and ElevenLabs, which show latency and cost inline in the pickers.
- Catalogue sizes seen: TTS 183 voices, all ElevenLabs, with descriptive tags. LLM and STT catalogue sizes unknown (dropdowns never opened) [notes-only].
- Indic voices: Hindi entries are positioned for BFSI and collections, for example "Shanaya - Soft Collections Hinglish Agent", "Aakash Aryan - Famous Hindi Customer Care", "Aarush - Confident Sales Agent for Banks & NBFCs" [notes-only]. The one agent in the account carries English and Hindi only. No other Indian language was seen.
- LLM: Google India region, Gemini 3 Flash, with a "gemini-2.5-flash-with-thinking" config string (a label inconsistency I cannot resolve) [notes-only].
- STT conflict: Bot Details says azure, Edit mode says Deepgram India rule, Model Configuration lists no rules in the window. Which serves a call is unknown (wt-exotel-16).
- Trade-offs are not shown at all. The only cost surface is the Credit Usage meter.

## 5. Conversation control

Seen: Denoiser ON at 0.8, VAD Configuration empty, Nudges at 7 s times 3 then end the call, Max Call Duration off, Greeting off [notes-only]. Not seen: endpointing, interruption, backchannel, reply delay, DTMF, voicemail and AMD controls, hang-up phrases. Transfer and voicemail are App Bazaar applets around the bot (wt-exotel-25).

Relation to prior research:
- Bolna exposes endpointing 500 ms and linear delay 900 ms and hangup-on-silence 20 s, which sum to the roughly 1.4 s reply floor traced in its code. Exotel exposes no such numbers, so the buyer cannot tune or even read its turn-taking from the dashboard. Whether the defaults are English-tuned is unknown. The prior report says Exotel "has never measured a natural turn".
- Exotel's nudge-then-end at 7 s times 3 is the same order as Bolna's 20 s silence hang-up (at least 21 s if repeated at 7 s; the interval between nudges is not shown) (wt-exotel-37).
- The prior teardown said the ClearStream denoiser was "targeted for end-October 2026". A Denoiser at 0.8 is already in the builder; whether it is the same component is unknown.
- open.2026-10-19.turn-taking (15-42% cut-ins across stacks) cannot be settled from a dashboard; this needs the call battery.

## 6. Tools, knowledge base, integrations, workflows

- Tools: "Create Custom API Integration" only. Name, description ("Helps AI understand when to use this integration"), base domain, method (GET default), URL path, then a separate Test tab; headers and parameters per notes. No built-in tool catalogue (no transfer, SMS or calendar tool) (exotel-17).
- Knowledge Base: RAG-style corpus model with training status; empty, no create button in view (exotel-04-knowledge-base).
- Database: account-level tables attached per agent; two-place flow; empty (exotel-03-voicebot-database, exotel-08). The empty-state copy says "this agent" on an account-level page.
- Workflow: a sub-agent graph, not a branching flow builder. Sub-agent called "Supervisor agent".
- Webhooks: panel exists, none configured (exotel-15).
- Intents: the post-call classification, three defined on the demo agent [notes-only]. Interactions shows an Intents column [notes-only].
- Flows live in App Bazaar (flow apps, applets for forwarding and voicemail) (exotel-13). Go Live creates one.
- Integrations has two children only: Tools and Database. No CRM, calendar or MCP integration is visible.

## 7. Testing and quality

- Test tab: phone call or web call; web call is "Coming soon" and disabled (exotel-02).
- Rollout: "Test this version" and Test Threads (0). Likely text sessions (inferred; the earlier bundle teardown found text-session endpoints).
- No simulation, eval suite, scripted scenarios or AI QA scoring in the Voice Agents app (inferred absence, wt-exotel-21).
- Logs: Interactions with Interaction ID, Customer Number, Agent Name, Version, Date & Time, Duration, plus Completion Source and Intents [notes-only]. Version column ties each call to a version. Default window is 7 days, so an empty list is ambiguous (exotel-22).
- Activity tab per agent: empty, no columns visible.
- Co-worker Activity Log exists in the classic console [notes-only].

## 8. Telephony and numbers

- Trial ExoPhone assigned to "vyakti1 Landing Flow" (type "Not set"); tip to demo by calling it from a non-registered number [notes-only]. App Bazaar labels it TRIAL NUMBER (exotel-13). The digits are not transcribed here.
- Purchase: a NEW EXOPHONE path exists, not clicked; the ExoPhones page shows an account PIN so the screenshot was withheld [notes-only]. Truecaller or Google verified calling option [notes-only].
- Bot attach: Go Live creates an appflow with the Voicebot applet; the flow "voicebot-mum-prod-default-flow" shows ExoPhones: None (exotel-13).
- SIP trunking and number import: not captured. Unknown.
- India path: banner requires Verify Number, KYC, payment, ExoPhone. Payment needs GST details [notes-only]. Phone on the co-worker card is flagged UNVERIFIED (exotel-11).
- Account region recorded as Singapore with api.exotel.com while the voicebot app is on an India host: unresolved and notes-only (open.2026-10-21.wt-exotel-account-region).

## 9. Campaigns and batches

- Entry: classic Tools > Campaigns (exotel-09). Empty state reads "No Results Found / Please try refining your search" with no create prompt. Engage handles SMS and WhatsApp separately (exotel-14).
- Create Call Campaign (exotel-10): single long form with blue dot section markers, not a numbered wizard. Seen: Campaign Name (required), audience Static, Dynamic or Dynamic with CSV Upload, Contact List select up to 5, a note that later list edits do not change the campaign.
- Below the fold [notes-only]: content (Read out via Text, Select a Flow, Create an IVR, Upload Audio), Caller ID, Call Type Transactional vs Promotional, Schedule Now or Later, retries 0 to 3 with interval, exponential backoff, retry on Busy, No Answer, Failed, Call Duplicate Numbers toggle, throttle Auto or Custom CPM, Campaign Status and Call Status callback URLs.
- Compliance fields: TRAI call type is present. No consent, DND or NCPR scrub, or daily calling-window control is in the enumerated list (inferred, wt-exotel-42). Export permission is ON by default in the Address Book (exotel-12).
- Where blocked: two toasts on load, "Unable to load Caller ID's" and "Unable to load Lists". The Address Book also has no lists. Cause (KYC gate or loader fault) is unverified. Engage says KYC is mandatory (exotel-14).
- Three contact surfaces (Address Book, Campaigns Lists and Contacts, Engage Contacts and List). Same store or not is unknown (wt-exotel-44).

## 10. Analytics, call history and reporting

- Interactions: described in section 7 (exotel-22).
- Analytics: blank grey panel with a broken-frame icon, no text or retry (exotel-23). Likely an embedded third-party dashboard (inferred). Notes call it "dashboard page exists (no data)", which the pixels do not support.
- Reports: Report Type (Interactions), date range, comma-separated emails, Send; async with a requests table (Report, Requested, Status); freshness lag "up to 30 mins" (exotel-24).
- No per-call transcript, recording or cost view could be seen (no calls).
- Credit Usage in minutes is a sidebar card only.

## 11. Billing, credits, plans and price display

- Credits 150 (classic) and Credit Usage 0 min (Voice Agents). Units are not reconciled (wt-exotel-33).
- Concurrency 5, increase "subject to monthly charges", by email, no price (exotel-25).
- Make a Payment is gated behind GST details [notes-only]. No plan table, per-minute rate or number rent is visible in the account.
- Prior public research found published plans (Dabbler, Believer, Influencer) and no VoiceBot per-minute price. The dashboard adds nothing to resolve the price.

## 12. Team, org, security, API keys, compliance settings

- Co-workers and Groups: one Admin, INVITE, groups Sales and Support, drag to assign (exotel-11).
- Roles named in UI: Admin, Supervisor, Agent (Supervisor and Agent from the export-permission text, exotel-12).
- API Settings (notes-only): Account SID, two named keys with masked tokens, create-key button, Postman and API docs links. Not captured as a screenshot.
- Security features seen: Impersonation (listed), Mask Sensitive Data toggle (off), Address Book export control. No SSO, MFA, audit-log or permission matrix visible.
- Compliance settings: DLT templates and Sender ID for SMS, TRAI call type for campaigns, KYC gates. None for DND or consent.

## 13. UX quality ledger

**Excellent (VP must match or beat)**
- Versions with live traffic split and a Stable and Live pill, visible on the agent (exotel-04-rollout).
- Version column in the call log, tying each call to a version (exotel-22 and notes).
- Live concurrency meter with last-updated time (exotel-25).
- Reports with an explicit freshness note (exotel-24).
- Theme menu with thumbnails (exotel-08).
- Save-conflict warning that names the exact risk (exotel-05), even if wordy.

**Clunky**
- Three shells and three design languages (exotel-11, 02, 14).
- 9-10 px five-step banner as the only activation guidance (exotel-01).
- Test tab: phone card has no visible input; web call disabled (exotel-02).
- Empty states with no action: Activity (exotel-03-voicebot-activity), Knowledge Base blank table (exotel-04-knowledge-base), Campaigns reading as a failed search (exotel-09).
- Raw markdown in a nested scroll box for the prompt (exotel-16).
- Database attach is a two-place flow (exotel-03-voicebot-database).
- Agents list: horizontal scrollbar overlaps the only row, columns cut off (exotel-06).
- Inconsistent default date windows: 7 days, month to date, 30 days (exotel-22, 24, 26).
- Theme menu clips the page subtitle (exotel-08).
- KYC gate hidden in an empty state while the Create button looks live (exotel-14).
- Slow loads: 12-15 s cold start [notes-only].

**Broken**
- Analytics renders a blank frame with no message (exotel-23).
- Campaign form: Caller IDs and Lists fail to load with generic toasts (exotel-10).
- Redaction in exotel-13 is partial; two other captures hold the owner phone in clear (exotel-11, 12).
- Blurred Workflow view with no spinner (exotel-03-voicebot-workflow).

## 14. What the dashboard adds to prior research

**Confirms**
- Intents as the extraction mechanism ("Intents are the extraction/classification mechanism"): three defined, an Intents column in logs.
- Versions with traffic allocation, test threads (Rollout).
- A dp-endpoint pattern and a two-console flow for campaigns: Go Live in the voicebot app, flow in App Bazaar, list and schedule in Campaigns.
- No contact, campaign or memory object in the voicebot app.
- Campaign form fields: 0 to 3 retries, throttle, duplicate toggle.
- "Templates, Enhance Prompt and Web Call are all marked 'Coming Soon'": Web Call is shown as Coming soon.
- KYC gates numbers and campaigns.

**Contradicts**
- Prior: "Testing means placing a real phone call." The Rollout tab has "Test this version" and "Test Threads (0)", so a non-phone path exists (probably text).
- Prior: "LLM: Gemma." Dashboard shows Google IN, Gemini 3 Flash (notes-only). The prior stack was the documented certified one, this is a demo agent.
- Prior: "TTS: Smallest or ElevenLabs, default voice 'Avni'" and "STT: Deepgram or ElevenLabs." Dashboard shows ElevenLabs Clyde and "azure" (plus a Deepgram India rule).
- Prior: "ClearStream denoiser ... targeted for end-October 2026." A Denoiser at 0.8 is already configured.
- Prior: "trial credits: 500 versus 1,000." Dashboard displays 150 credits.
- Prior setup checklist: "choose the INDIA region (the region cannot be changed later)." Notes record account region Singapore (notes-only).
- Instinct cross-vendor report: "the account-level Model Configuration rules page references a Deepgram India rule." Screenshot 26 shows no rules (30-day filter). The Deepgram India rule is in the Edit view of the agent, per notes.
- Instinct notes: "Analytics: dashboard page exists (no data)." The pixels show a failed frame.

**Only the dashboard showed**
- Locked guardrail system prompt and a sub-agent Instruction as the real prompt.
- Auto-provisioned demo agent and flow.
- 183 ElevenLabs voices with BFSI and collections tags; Gemini 3 Flash via Google India.
- Nudges 7 s times 3, denoiser 0.8, PII masking off by default, greeting off, max duration off.
- Account page: concurrency 0/5, chargeable increase; 150 credits.
- Reports emailed with a 30-minute lag; Interactions columns including Completion Source and Intents.
- Account-level Database tables attachable to agents; Model Configuration rules page.
- Three shells, and the three-surface campaign path.
- Instinct's page-load timings.

## 15. For VP

**Match (parity floor)**
- Versions with a traffic split, Stable and Live states, and a Test Threads area.
- Knowledge-base corpora with training status and Active or Archived.
- Account-level data tables attachable per agent.
- Custom-API tools with a test step and a model-facing description.
- Intents as post-call outcomes shown in the log.
- Interactions log with a version column and emailed reports with a stated freshness.
- Visible concurrency meter and a locked platform safety layer (VP keeps its own: crisis lines, AI disclosure).
- Per-agent webhooks, PII masking toggle, max call duration and silence nudges with an end-call.

**Beat (each testable on task failure, not feature count)**
- One shell and one contact store from list to first call. Task: time from sign-up to a first verified-number call, and number of surfaces touched (Exotel: 3 shells, 3 contact surfaces).
- Gate messages that name the cause and the fix instead of "Unable to load". Task: a user can say why a campaign is blocked within one screen.
- Browser test call plus text simulation before any phone call (Exotel: phone only, web call "Coming soon"). Task: iterations per minute during build.
- Visible, tunable Hinglish turn-taking presets with the reply-gap sum shown. Task: cut-in rate and reply gap on the Hinglish battery (see open.2026-10-19.turn-taking).
- Calling window, DND and consent enforced by default, with a reason when a contact is skipped (Exotel: none in the enumerated fields).
- Model, voice and transcriber pickers that show latency, price and Indic coverage inline (Exotel shows none).
- Analytics that renders or says why it cannot.
- The prompt as a structured editor with a rendered view, plus emotional voice, memory and later self-learning (v2) on top.

**Avoid**
- Three design languages and three contact stores.
- A tiny five-step banner as the only onboarding.
- Empty states with no action, and "No Results Found" on an empty list.
- Gating the Test button behind a number.
- Hiding limits and prices behind GST and email.
- Treating the vendor's parity as the wedge (open.2026-10-20.parity-floor-vs-wedge).

**Open questions only live calls or a verified account can answer**
- Reply gap, cut-ins and language hold on Indian PSTN with this stack; whether the defaults are English-tuned.
- DTMF, voicemail and transfer behaviour through App Bazaar flows around the bot.
- Whether KYC clears the Caller ID and Lists errors, and what the full wizard review step shows.
- Which STT serves a call, the create-agent form, Templates and the LLM and voice dropdowns.
- Test Threads behaviour, and what Analytics shows when it loads.
- Real per-minute price after GST, and the account region.
