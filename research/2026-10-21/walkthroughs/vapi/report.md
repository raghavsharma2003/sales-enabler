# Vapi dashboard walkthrough: end-to-end product analysis (2026-10-21)

Source: Instinct's walk of the Vapi dashboard on 2026-10-21 with the team@vyakti.ai trial org (no card, no number, no live call). All 64 text captures, Instinct's notes and cross-vendor report were read; 12 screenshots were opened directly (33, 34-Advanced, 50-edit-Transcriber, 50-edit-Voice, 52-model-advanced, 80, 06c, 24, 83, 62, 64, 65); the other 44 PNGs were read through the calibrated screen notes. Latency, cost and quality numbers below are **vendor-displayed**, not measured by us. Grades: observed / displayed-by-vendor / inferred / unknown; claim ids `wt-vapi-NN` are in claims.json.

## 0. Coverage: what was captured and what was not

| Item | Status |
|---|---|
| Files | 56 PNGs, 64 text captures (all read), notes file, cross-vendor report. No video. |
| **Mislabelled PNGs** | 20-logs, 21-metrics, 22-api-keys, 23-members, 24-billing, 25-org-settings, 26-members, 27-api-keys, 28-org-settings: all nine show the *Welcome to Vapi* onboarding wall, not the named page (wt-vapi-01). Do not cite them as evidence for those pages. |
| **Mislabelled / bad text captures** | 22-api-keys.txt is really the Integrations page (/settings/integrations). 23-members.txt, 25-org-settings.txt, 27-api-keys.txt are **404 pages** from guessed URLs. The real pages are in 26-members.txt (/settings/members), 28-org-settings.txt (/settings/organization), 62-api-keys (/org/api-keys), 24-billing.txt (/settings/billing) (wt-vapi-02). |
| Text only, no PNG | 32 (duplicate of 02), 54 (assistant tab, Normal-text mode), 56-create-tool-menu-items, 57-transfer-call-form-text, 73-mon-notifiers, 82-metrics-lower, 90-public-pricing-page, a duplicate 06b. |
| Loading / empty | 03-assistants.png right pane shows loading dots. Every list page (squads, tools, phone numbers, campaigns, evals, suites, monitors, files, structured outputs, boards) is an empty state; nothing was created by the walkthrough except what is in the side-effects list below. |
| Cut at the 720 px fold | Advanced tab and Voice/Transcriber panels were cut in screenshots; the text captures hold the full lists, but **current slider values were not captured** for Start/Stop Speaking Plan, Silence Timeout, Max Duration, Idle Messages. |
| Gated / blocked | Recording Consent Plan (Enterprise crown card), HIPAA and ZDR (billing). Free number is US-only, inbound-only. **Campaign steps 2 (Contacts) and 3 (Schedule) never reached**: Next is disabled without a phone number and none could be created in scope. Composer, create forms for structured output / monitor / notifier / eval / suite, Simulations Runs, Create Assistant template contents: not opened. No test call, no live call. |
| Account side effects (Instinct) | A stray voice click left a server-side Draft on Riley (header still shows Draft after Discard); a Create Tool click auto-created and published `transfer_call_tool` (deleted); welcome form completed four times. Nothing published, $5 credits unchanged. |
| Capture harness notes | Cloudflare and Stripe iframes sit on every capture; three captures note 'anti-bot solver ran'. Direct URL loads were often blank. |

Lesson for the next walkthrough: clicking dropdowns and menus **writes** (wt-vapi-55, wt-vapi-31).

## 1. Information architecture

Sidebar (observed, wt-vapi-03):

| Group | Surface | What it does | Status |
|---|---|---|---|
| VAPI LABS | Composer | Chat pane: Threads, modes Build / Debug / Analyze / Test, 'Ask for approval' control; also a Composer button in the header of most pages | no badge (earlier research called it alpha) |
| BUILD | Assistants | List + builder (single agent) | |
| | Squads | Several assistants cooperating, routed by conditions | empty |
| | Tools | Reusable tools (15 types) | |
| | Phone Numbers | Free Vapi number, free SIP URI, import Twilio/Vonage/Telnyx, BYO SIP | |
| | Campaigns | 3-step outbound wizard | **Beta** |
| | Resources | expandable: Voice library (12 voices), Files (knowledge files) | |
| TEST | Evals | Mock-conversation evaluations | empty |
| | Simulations | Suites (repeatable scenarios); Runs not captured | empty |
| OBSERVE | Logs | Calls, Chat, Sessions, Webhooks, API tabs; Export All | |
| | Boards | Insight boards ('Metrics Overview') | |
| | Structured Outputs | Typed post-call fields | empty |
| | Monitoring | Issues, Monitors, Notifiers | **Alpha** |
| | Metrics | Legacy metrics page (stat tiles, Call Analysis) | |
| INTEGRATIONS | API Keys | Private and public keys | |
| | Integrations | Provider credentials catalogue (52 tiles) | |
| MANAGE | Members, Organizations, Billing & Payment, Org Settings, Profile | | |
| Footer | 'No package', '5 Credits', Buy credits | always visible | |

Gated: Recording Consent Plan (Enterprise), RBAC (Pro), SSO and dedicated SIP (Premier), HIPAA (add-on), ZDR (see wt-vapi-49). Maturity badges: Beta (Campaigns), Alpha (Monitoring, Notifiers), Experimental (GPT Live, Eleven v3), Beta (Scribe v2). Unknown: other Resources sub-items, Simulations sub-items (a 'Test suites' label appears in 20-logs.txt).

## 2. First run

Observed path (wt-vapi-05, -07, -08):
1. Login: password plus an emailed 6-digit code (Instinct notes; sessions expired twice).
2. **Welcome to Vapi**: one required field (full name), two optional questions (8 source tiles; Personal / Small business / Enterprise). 'Start Building' sits below the fold; no step count. It reappeared on every load until saved.
3. **/agent-builder** (full screen, no sidebar): pick Inbound / Outbound / Support, **or** type a description. 'Skip to dashboard' leaves. What the generated agent looks like was not captured.
4. Dashboard: a seeded assistant **Riley** (v1, appointment scheduler for a fictional clinic) already exists (inferred, wt-vapi-08), so a first test agent needs 0 builder steps; the test call is the phone button in the assistant header (not pressed).

Count: **3 steps and 1 required field** to a generated or seeded agent after login; 2 clicks to a template via Create Assistant (4 templates). To make it phone-reachable add: Free Vapi number (area code, US, inbound only) or an import (Twilio 4 fields + SMS toggle ON by default; Vonage 4; Telnyx 3; BYO SIP 3 plus an existing credential; free SIP URI 2 required + 2 optional). Outbound adds the campaign wizard (5 fields on step 1, steps 2-3 unseen). Prior prediction P01 (sign-up to browser test call in 10 minutes or less, no card) is plausible from this; the time was not measured.

## 3. Agent builder end to end

Layout (wt-vapi-10): header with name, version pill, **Traffic** link (traffic split), truncated id, test-call split button, save/publish, kebab; tabs **Assistant | Logs | Tools | Analysis | Advanced**; Cost and Latency headline bars; Model Presets; pipeline cards Transcriber / Model / Voice (each opens a right-hand panel); System prompt (Visual / Code / Normal text, Generate, `{{` variables, token counter); First message; Files. Draft state: edits flip the label to orange **Draft** and the save button to an orange publish split-button (wt-vapi-54).

Sections by tab: **Assistant** (above). **Logs** (assistant-scoped logs, not captured). **Tools** (empty; Add tool popover). **Analysis** (Structured Outputs, Scorecard, Attached Monitors). **Advanced** (Fallbacks, Compliance, Webhook Server, Start Speaking Plan, Stop Speaking Plan, Voicemail Detection, Call Timeout, Keypad Input, Recording & Artifacts, Messaging, Deprecated).

### Settings, defaults and ranges (as captured)

| Setting | Default as captured | Range / options | File |
|---|---|---|---|
| Model Preset | Balanced | High Intelligence, Ultra Fast, Cost Saver | 33-riley-assistant.png |
| Transcriber model | STT RT v5 (Soniox) | 40 rows | 53-transcriber-model-dropdown.txt |
| Transcriber languages | English (chip) | 57 languages + Automatic | 80-transcriber-languages.png |
| Intelligent Turn-Taking | **Off** | toggle | 50-edit-Transcriber.png |
| End-of-Turn Wait | **1.5 s** | 0 to 3 s | 50-edit-Transcriber.png |
| Keywords | empty | free terms | 50-edit-Transcriber.png |
| Background Denoising | appears Off (clipped) | toggle | 53-transcriber-model-dropdown.png |
| LLM | GPT-4.1 (OpenAI) | about 92 rows | 52-model-dropdown.txt |
| Temperature | 0.5 | Precise to Creative (API 0-2) | 52-model-advanced.png |
| Max Tokens | 250 | numeric (API 50-10,000) | 52-model-advanced.png |
| Fast Turns | 0 | numeric | 52-model-advanced.txt |
| Priority processing | not captured | on = 1.75x token cost | 52-model-advanced.txt |
| Prompt cache retention | not captured | In memory / 24 hours | 52-model-advanced.txt |
| Prompt cache key | not captured | optional, max 64 chars | 52-model-advanced.txt |
| Tool strict compatibility | Off | Off + options | 52-model-advanced.txt |
| Voice model | Vapi Voices - Version 2 | 45 rows | 51-voice-model-dropdown.txt |
| Voice | Elliot (Natural, Male, Young, American, Calm) | library of 12 | 50-edit-Voice.png |
| Primary language | Automatic | not captured | 50-edit-Voice.png |
| Speed | about 1.1 (last digit clipped) | Slower to Faster | 50-edit-Voice.png |
| Background Sound | Default (phone calls office, web calls off) | Off, Office, Default, Custom | 50-edit-Voice.png |
| Pronunciation dictionaries | none | select dictionaries | 50-edit-Voice.txt |
| System prompt mode | Code | Visual, Code, Normal text | 54-assistant-tab-fulltext.txt |
| Prompt length | 1,890 tokens (one later capture shows ~1,690) | n/a | 33-riley-assistant.txt, 80-transcriber-languages.txt |
| First message mode | Assistant speaks first | + Assistant waits for user, Model generated | 55-first-message-modes.png |
| Files | none | Select Files | 55-first-message-modes.txt |
| Tools attached | none | 15 types | 34-builder-Tools.png |
| Structured outputs / scorecard / monitors | none | Add Field, New, Add Monitor | 34-builder-Analysis.txt |
| Fallback voices / transcriber | none | Add | 34-builder-Advanced.png |
| Recording Consent Plan | gated (Enterprise) | no control | 34-builder-Advanced.png |
| HIPAA / ZDR | add-on prompts | Go to Billing | 34-builder-Advanced.txt |
| Webhook server URL / timeout / auth / headers / static IPs | empty; Authorization 'No authentication'; static range 167.150.224.0/23 | timeout 1-300 s | 34-builder-Advanced.txt |
| Wait Seconds | value not captured | 0 to 5 s | 34-builder-Advanced.txt |
| Smart Endpointing | selection not captured | Off, LiveKit (English only) | 34-builder-Advanced.txt |
| On Punctuation / No Punctuation / Number seconds | values not captured | each 0 to 3 s | 34-builder-Advanced.txt |
| Number of Words / Voice Seconds / Back Off Seconds | values not captured | 0-10 / 0-0.5 s / 0-10 s | 34-builder-Advanced.txt |
| Voicemail Detection Provider | Off | Vapi, Google, OpenAI, Twilio (per help text) | 34-builder-Advanced.txt |
| Silence Timeout | not captured | 5 to 3600 s | 34-builder-Advanced.txt |
| Maximum Duration | not captured | 10 to 43,200 s | 34-builder-Advanced.txt |
| Keypad Input | not captured | timeout 0-10 s; delimiter # or * | 34-builder-Advanced.txt |
| Audio Recording / Logging / Transcript | toggle states not captured | on/off | 34-builder-Advanced.txt |
| Audio Recording Format | WAV | other formats not captured | 34-builder-Advanced.txt |
| Video Recording | not captured | toggle | 34-builder-Advanced.txt |
| Client Messages | conversation-update, function-call, hang + 10 more | multi-select | 34-builder-Advanced.txt |
| Server Messages | conversation-update, end-of-call-report, function-call + 8 more | multi-select | 34-builder-Advanced.txt |
| Idle Messages | none selected | max 1-10; timeout 5-60 s | 34-builder-Advanced.txt |
| End Call Phrases | not captured | comma-separated substrings | 34-builder-Advanced.txt |
| Auto Transcriber Fallback for New Assistants (org) | state not captured | toggle | 28-org-settings.txt |

Deprecated block: End Call Function, Dial Keypad, Forwarding Phone Number, Custom Functions ('will be removed').

## 4. Model, voice, transcriber and language choice

How choice is presented (wt-vapi-14, -20): three pipeline cards and one searchable list per stage. Each row carries **latency, $/min and one quality score** (Accuracy as WER for STT, Intelligence for LLM, Humanness for voice). Headline bars colour per stage. Four presets and an experimental speech-to-speech 'Try GPT Live'.

Catalogue sizes (wt-vapi-15, counted by us): LLM about 92 rows (about 14 repeats across provider groups, several flagged Deprecated), voice 45, transcriber 40, 57 transcriber languages, 12 stock voices, Integrations 52 tiles (voice 12, model 15, transcriber 7).

Displayed edges (displayed-by-vendor, wt-vapi-16): GPT-5.6 Luna $0.010 / 770 ms / 27; GPT-5.6 Sol $0.029 / 1,060 ms / 42; Claude Sonnet 5 2,000 ms $0.060 with no score; GPT Realtime 2 $0.645/min; Vapi Voices v2 $0.02 / 430 ms / 92 Humanness; Eleven v3 (Experimental) $0.036 / 850 ms / 95; Inworld TTS 1.5 Mini $0.003; Sonic 3.5 270 ms / 70; STT RT v5 1.8% WER $0.004; Universal 3.6 Pro 1.0% WER $0.015; Azure STT 750 ms $0.034.

Weaknesses: scores have no scale; metrics missing on newer rows (wt-vapi-17); about 30 LLM rows show an identical $0.010/min, probably a floor (wt-vapi-18); WER carries no language. **Our India first-token medians are at or above the displayed figures** (wt-vapi-19): gpt-oss 500 vs 535, GPT-4.1 Mini 600 vs 567, GPT-5.4 Mini 720 vs 960, Gemini 3.8 Flash 1,500 vs 1,991, GPT-4.1 690 vs 1,765. Treat displayed latency as a US best case.

Headline arithmetic (inferred, wt-vapi-12, -13): **1,530 ms = 410 + 690 + 430**, and **$0.09 = $0.05 hosting + $0.004 + $0.02 + $0.02**. The first leaves out the 1.5 s End-of-Turn Wait and the phone leg; the second leaves out telephony. Against our own measured Vapi demo-agent clean-turn p50 of 2,319 ms (2026-10-17, different agent), the displayed total understates by roughly 0.8 s.

India: Soniox picker offers Hindi, Tamil, Kannada, Marathi, Urdu (and Nepali) but not Bengali, Telugu, Gujarati, Malayalam, Punjabi, although the API enum lists 12 Indic codes (wt-vapi-21). No Indian vendor (Sarvam and others) in any picker or in Integrations (wt-vapi-22). Voice library: 12 voices, only Sagar and Naina Indian-accented, both 'INDIAN AMERICAN'; no language or latency on cards (wt-vapi-24). Instinct saw Indic-named Cartesia voices (wt-vapi-23, notes only). Default language handling: English chip with Automatic unchecked, voice language Automatic on an American voice (wt-vapi-25); our 2026-10-17 demo test saw Gujarati replies on 17 of 18 Hinglish turns.

## 5. Conversation control

| Control | Default as captured | Unit / range | Notes and link to prior research |
|---|---|---|---|
| Intelligent Turn-Taking | Off | toggle | 'waits a fixed silence delay instead' |
| End-of-Turn Wait | 1.5 | s, 0-3 | Same order as Bolna's inferred 500 ms + 900 ms hold = about 1.4 s reply floor (evidence.2026-10-20.acct-bolna-reply-floor); equals the API's onNoPunctuation 1.5 s but the mapping is unconfirmed (wt-vapi-27) |
| Wait Seconds (start speaking) | not captured (API 0.4) | s, 0-5 | |
| Smart Endpointing | not captured | Off / LiveKit (English only) | The API also offers a custom endpointing webhook; not shown |
| Punctuation waits | not captured (API 0.1 / 1.5 / 0.4) | s, 0-3 each | |
| Interruption: words / voice / back-off | not captured | 0-10 / 0-0.5 s / 0-10 s | **No phrase lists in the UI.** API defaults are English lists (22 acknowledgement, 20 interruption phrases); Hindi 'haan', 'achha', 'ruko' cannot be overridden from the dashboard (inferred) |
| Silence timeout / max duration | not captured | 5-3600 s / 10-43,200 s | Hang-up controls |
| End Call Phrases, End Call Message | not captured | text | Hang-up by substring of the bot's own transcript |
| Idle messages | none | max 1-10, timeout 5-60 s | |
| Voicemail detection | Off | provider select | Also a Leave Voicemail tool; no Indian-announcement handling visible |
| DTMF | state not captured | timeout 0-10 s, delimiter # or * | plus a DTMF tool |
| Background Denoising | appears Off | toggle | |
| Background Sound | Default | Off / Office / Default / Custom | |

What prior research found, and what this adds: Bolna drops a final of N words or fewer spoken over the agent (default N=1) unless on an English stop list, and holds audio 900 ms after a 500 ms endpoint (evidence.2026-10-20.bolna-check-turn-taking). Vapi's dashboard exposes more sliders, but its defaults are **English-tuned too** (English-only smart endpointing, English phrase lists in the API), and the one number a buyer sees, 1,530 ms, hides the wait. VP's own lab stacks still show 15-42% cut-ins (open.2026-10-19.turn-taking), so the turn-taking beat stays a hypothesis until one stereo-recorded Hinglish battery scores VP and Vapi side by side (risk.2026-10-20.acct-synthesis-turn-taking-beat-unproven). Unknown without calls: whether the 1.5 s adds to Wait Seconds, and the effect of the Intelligent Turn-Taking toggle.

## 6. Tools, knowledge base, integrations, workflows

- **Create Tool menu: 15 items** (wt-vapi-30): Phone call tools: Transfer Call, Hang Up, Leave Voicemail, DTMF, Send Text, SIP Request. Assistant tools: Handoff, Query. Integrations: API Request, MCP, Slack, Google Sheets, Google Calendar, GoHighLevel. Plus Function tool. Instinct's report says 16; the capture lists 15; the API has 26 types.
- **Auto-create hazard** (wt-vapi-31): clicking a type created and published `transfer_call_tool` at once (toast, status Published, v1). Transfer editor: Tool Settings (name, description 0/1000), Destinations (Phone Number or SIP), collapsed Messages.
- **Attach** (wt-vapi-32): Add tool popover searches existing tools; with none, a second click on '+ Add new tool'.
- **Knowledge base** (wt-vapi-33): Files page (upload, search by assistants), Select Files on the assistant, Query tool. No retrieval settings seen.
- **Squads** (wt-vapi-34): multi-assistant routing; empty, editor unseen. Legacy workflows not in the nav (API workflows were retired per earlier research).
- **Integrations** (wt-vapi-35): 52 provider credential tiles in 8 groups; PlayHT flagged Deprecated in its name only; no connected status; Twilio missing here but present in the phone dialog; one observability partner (Langfuse); cloud storage for recordings (S3, S3 STS, Azure Blob, GCS, R2, Supabase, S3-compatible).
- Webhook server config exists at both assistant and org level (timeout 1-300 s, credential, headers, static IPs).

## 7. Testing and quality

- Test call: split button in every assistant header (not pressed); Composer 'Test: Talk to my agent in the dashboard'.
- **Evals** (empty): mock conversations validated against criteria. **Simulations / Suites** (empty): repeatable scenarios for assistants or squads; 1 concurrent simulation on this plan (wt-vapi-45, but see wt-vapi-53).
- **Analysis tab**: Structured Outputs (Add Field), Scorecard ('grade calls automatically using boolean or number structured outputs'), Attached Monitors.
- **Monitoring (Alpha)**: Issues (Critical/Warning counts with MTTR, Calls Impacted 1h/24h/7d, categories Infrastructure, Technical, Effectiveness, Compliance), Monitors ('Enable default monitors for free'), Notifiers (email, Slack, webhook). Zero issues reads 'Great news!' even with no monitors configured (wt-vapi-37).
- Logs, Boards, Metrics, Composer 'Debug: Diagnose recent call failures'. A failed call start still appears as a call row (wt-vapi-39).
- Not seen: any create form for the above, any run result, any human-review or call-listening UI, live listen/control (the API-level monitorPlan and the alpha 'Mission Control' are not visible in the nav).

## 8. Telephony and numbers

Six options in one modal (wt-vapi-40): Free Vapi Number (US area codes, 0 of 1 used, **inbound only for new accounts**), Free Vapi SIP (sip:identifier@sip.vapi.ai, optional auth), Import Twilio (4 fields + SMS toggle on by default), Import Vonage (4), Import Telnyx (3), BYO SIP Trunk (number, 'Allow non-E164' unchecked, an existing SIP trunk credential, label). **India path** (wt-vapi-41): none in product. Country selector defaults to a US flag; no Indian carrier, no KYC step in Vapi (KYC would live at Twilio/Telnyx/Vonage or an Indian carrier on BYO SIP); no per-number price in phone pages, dialogs or billing. Earlier research: Vapi's own Plivo guide says Indian termination is unsupported, and Twilio allows outbound to India only from non-Indian numbers (evidence.2026-10-20.vapi-no-india-termination). Empty-state copy names only Twilio, vonage and a free number, narrower than the dialog.

## 9. Campaigns and batches

Wizard (wt-vapi-42): **3 steps** Campaign details, Contacts, Schedule. Step 1: campaign name, phone number (searchable; empty org shows only '+ Create phone number'), a 'Best Practices: avoid spam flagging' callout with link, Who makes the calls (Assistant | Squad plus a select), Max Concurrency (4 / 4, the plan cap), optional collapsed Webhook settings. 'Next' is disabled until a number is chosen; steps 2-3 are **blocked**, not seen (wt-vapi-44). Compliance fields (consent, DND/NCPR, DLT, calling windows, retries): **none seen** on step 1 or anywhere else in 64 captures (wt-vapi-43). Earlier code/API reading still stands unverified in UI: one absolute window per campaign (7 days ahead, 15-minute steps), no per-contact retry, a CSV normaliser that prefixes '+', up to 10,000 customers inline (evidence.2026-10-20.vapi-campaign-engine-limits).

## 10. Analytics, call history and reporting

Logs (wt-vapi-38): tabs Calls, Chat, Sessions, Webhooks, API; filters Time Range (Last 7 days default), Call ID, Assistants, Squads, Phone Numbers, Call Types, Customer Phone Number; columns include Version, Ended Reason, Start Time (GMT+5:30), Duration, Cost; Export All; 25 rows/page. Boards: default 'Metrics Overview' (Call Volume, Total Call Minutes, Concurrent Calls, Reason Call Ended, Unsuccessful Calls latest 5, Average Cost Breakdown per Minute), Create Insight, date range Last 30 Days, grouping Days, assistant filter, auto-refresh Off, drag-resizable cards. Metrics: Total Call Minutes, Number of Calls, Total Spent, Average Cost per Call, Reason Call Ended, Average Call Duration by Assistant, Cost Breakdown, Success Evaluation (Unknown / Unsuccessful), Concurrent Calls. All empty except one errored outbound call (1 call, 0.00 minutes, $0.00, ended reason shown as the code 'call.start.error-get-assista...', truncated). History retention 14 days on this plan.

## 11. Billing, credits, plans and price display

In product (wt-vapi-45): No package, $5 credit balance, monthly fees $0.00 on Nov 1 2026, Apply coupon, Add payment method; tabs Utilization / Payments / Packages; capacity 1/2 orgs, 0/1 Vapi numbers, 4 concurrent lines, 1 concurrent simulation, 200 requests/min, 14 days history. **USD only; no INR; no GST field; no per-number price.** The builder headline is a per-minute estimate (hosting + three components, no telephony). Public page (displayed-by-vendor, wt-vapi-46): $0.05/min hosting; Core 10 concurrent, 30 days; Pro '10% of hosting fee, $999/mo minimum'; Premier custom; provider costs pass through with no markup; HIPAA add-on. The '$82-$129/mo' figure is a calculator output whose attributes match the No-package tier, not Core (wt-vapi-47).

## 12. Team, org, security, API keys, compliance settings

Members: one Admin (Add Member exists; roles beyond Admin not seen). Organizations: capacity 1 of 2, a **Channel** select (Daily/Weekly, 'controls which cluster your org's API requests will be routed to'), contact email, created date. Org settings: HIPAA add-on, ZDR (described inconsistently, wt-vapi-49), transcriber fallback default for new assistants, org Server URL with credential, headers and static IPs (167.150.224.0/23), delete org by typing the name. Profile: name, read-only email, password change, delete account; no MFA or session list seen. API keys: 2 private (one is our teardown key) and 1 public with origin, assistant and transient restrictions; names only, no created or last-used columns (wt-vapi-51). Compliance: Recording Consent Plan is an Enterprise crown card with no button (wt-vapi-52); no region or residency selector; no India or DLT items.

## 13. UX quality ledger

**Excellent (VP must match or beat)**
- Inline latency, cost and quality on every picker row. 51-voice-model-dropdown.png, one line per model.
- Cost and latency headline with a stage-coloured bar tied to the card dots. 33-riley-assistant.png.
- Four one-click trade-off presets. 33-riley-assistant.png.
- Describe-or-pick agent creation on one screen. 02-agent-builder-landing.png.
- Section cards each with a one-line purpose; gated features shown in place. 34-builder-Advanced.png.
- Empty states that explain the concept (Squads, Evals, Suites). 04-squads.png, 40-evals.png.
- Free default monitors offered up front. 72-mon-monitors.png.
- Spam-flagging advice placed where the number is chosen. 83-campaign-create.png.
- Cmd+K search and a Composer entry in every header. 03-assistants.png.

**Clunky**
- Banner X overlaps the word 'Migration' on every page; two-line banner pushes the app down. 03-assistants.png.
- OBSERVE group clipped behind the credits card at 720 px. 33-riley-assistant.png.
- Duplicate create CTAs and inconsistent primary-button styling (outlined Create Tool vs solid New Squad). 05-tools.png, 04-squads.png.
- Open side panel squeezes header and tabs ('Traf', overflow chevron). 50-edit-Transcriber.png.
- Speed field clips its last digit; voice tag chips overflow. 50-edit-Voice.png.
- Scores without a scale; missing metrics on newer rows. 51-voice-model-dropdown.png.
- Max Tokens and Fast Turns render dim and look disabled. 52-model-advanced.png.
- Language helper says 'Automatic detects...' with English chosen. 80-transcriber-languages.png.
- Disabled-looking submit buttons on phone dialogs by low contrast. 06c-free-vapi-number.png.
- Zero shown as a number in one card and 'No data' in the next; overlapping axis labels. 64-metrics.png.
- Welcome page repeats until saved, CTA below the fold. 01-welcome-dialog.png.

**Broken or hazardous**
- Create Tool click auto-creates and publishes a tool. 57-transfer-call-tool-form.png.
- Dropdown selection autosaves a server draft; header can stay Draft after Discard (Instinct note). 80-transcriber-languages.png.
- Nine screenshots 20-28 show a wall instead of pages; guessed URLs 404. 20-logs.png, 23-members.txt.
- ZDR messaging contradicts itself; consent card has no action. 28-org-settings.txt, 34-builder-Advanced.png.
- Campaign Next is disabled with no message about why. 83-campaign-create.png.
- Phone empty-state copy omits Telnyx and SIP. 06-phone-numbers.png.

## 14. What the dashboard adds to prior research

**Confirmations**
- Plan facts: $0.05 hosting, $5 credits, 4 concurrent, 14 days, 2 orgs, 1 Vapi number match the pricing page and earlier reading (24-billing.txt, 90-public-pricing-page.txt).
- Five number types plus free SIP (AP-53) match the dialog; no Indian carrier type.
- Campaigns is Beta, consistent with 'the dashboard Campaigns UI only shipped on 2026-08-31'.
- No contact, consent, DND, DLT, window or retry object in the UI, matching 'no contact or CRM object' (evidence.2026-10-20.acct-vapi-no-india-objects).
- Composer approval mode ('Ask for approval') matches the Bypass approvals finding.
- Org Channel select upgrades the inferred 'release-channel clusters' to observed with Vapi's own wording.
- No region selector, matching 'no India region'.

**Contradictions or refinements (quoting prior text)**
- 'our Vapi org ... allows 4 concurrent calls and 2 concurrent simulations': billing shows **Concurrent simulations 1 max** (chat). Unreconciled.
- 'zero data retention is now included in every paid package': Org settings says ZDR is in Core and Pro; the Advanced tab says 'The ZDR add-on is required'.
- 'Indic speech-to-text coverage ... Soniox ... list the 12 codes': the dashboard picker lists five Indian languages plus Nepali.
- 'The 22 stock Vapi voices ... 3 Indian American (Sagar, Rohan, Naina)': the library grid shows 12 voices and two Indian-American (paginated or filtered, unknown).
- 'Every assistant PATCH publishes an immutable version': the dashboard uses drafts and an explicit publish.
- 'Composer (alpha chat builder)': no Alpha badge in the nav.
- 'Full Create Tool menu (16 types ...)' (Instinct): 15 in the capture; API 26.
- Prior 'Core ~$82-129/mo' (Instinct notes): the figure sits beside No-package attributes.
- 'Mission Control (alpha)' and monitorPlan live listen: not visible in the dashboard.

**Only the dashboard showed**: the model/voice/STT catalogues with displayed latency, price and scores; the headline arithmetic; presets; Draft/Publish UI; the Monitoring and Boards stack; Create Assistant templates; the 57-language picker; the plan-capacity panel; the free SIP URI form; auto-create/autosave behaviour; 404 URL traps.

## 15. For VP

**Match (parity floor)**
- Searchable pickers with latency, cost and a quality score on every row; one-click presets.
- Explicit Draft then Publish with versions and a traffic split.
- Starter templates plus describe-to-build; a Composer-style chat entry in every page.
- Tool menu: transfer, hang up, voicemail, DTMF, SMS, SIP, API, MCP, query.
- Structured outputs, scorecards, monitors, simulations, evals; logs with filters and export; boards.
- BYOK provider catalogue, assistant- and org-level webhook config with static IPs, fallback voice and transcriber.

**Beat (specifically)**
1. An **all-in headline**: endpointing wait + platform + telephony + models in INR, with measured p50/p90 from Indian lines beside any vendor-displayed number.
2. **Hinglish turn-taking controls in the UI**: editable backchannel and interruption lists, a language lock, defaults tuned for short Hindi replies; publish measured cut-in rates.
3. **Indic completeness**: all Indian languages in the picker, voices filtered by language and region (not 'Indian American'), WER per language.
4. **Number and compliance flow before the campaign wizard**: Indian number type, KYC walk-through, consent source, DND scrub, DLT, per-contact local-time windows, retries; a preview of how each CSV row will be normalised.
5. **Nothing is created or saved by a menu click**; Draft indicator that is always right; a reason shown beside every disabled Next.
6. Business-language outcomes beside raw ended-reason codes; cost per contact and campaign.
7. v2 on top: per-contact memory, personalisation and self-learning, which Vapi's dashboard does not show at all.

**Avoid**: duplicated CTAs and inconsistent button hierarchy; scores with no scale; a USD-only billing page; a seeded demo persona unrelated to the market (Riley for a US clinic); crown cards with no action; URL schemes that 404 on the obvious guess; a welcome page that repeats.

**Open questions only live calls can answer** (wt-vapi-60): the real reply gap on defaults and whether the 1.5 s wait adds to Wait Seconds; Hinglish language hold on Automatic; whether English phrase lists mis-fire on Hindi; effect of Intelligent Turn-Taking and denoising; voicemail detection on Indian network announcements; DTMF and +91 transfer; real cost per connected minute with telephony; Composer's output on a Hinglish brief; GPT Live in Hindi; campaign steps 2-3 with a messy CSV (open.2026-10-21.wt-vapi-campaign-steps-2-3).
