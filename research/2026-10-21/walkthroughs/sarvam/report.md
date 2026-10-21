# Sarvam (Samvaad Voice Agents): dashboard walkthrough analysis

Captured 2026-10-21 by Instinct on trial account team@vyakti.ai. No live call, no purchase, no campaign. Latency and cost figures are vendor-displayed. Claim ids `wt-sarvam-NN` (56 claims, file `research/2026-10-21/walkthroughs/sarvam/claims.json`). Screenshot names are shortened to their number, e.g. `07` = `sarvam-07-settings-speaking.png`.

## 0. Coverage: read this before quoting anything

**Evidence base.** 33 PNGs (all opened and read by me), 2 text captures (`voices.txt` and `voices-raw.json`, which are the same 439-line dump), Instinct's notes (local and Drive copies agree), the cross-vendor report, and the two earlier Sarvam reports. There are no per-page text captures, so below-the-fold content exists only where a screenshot happened to be scrolled.

| Area | Captured | Not captured |
|---|---|---|
| Home, Agents, first-run | 01, 02, 36 | Fresh sign-up (account dates from 26 Aug 2026), "Know more" destination, rest of template list |
| Builder: Instructions, Variables, Tools, Settings top and bottom, Automated tests | 03, 04, 04b, 05, 05b, 06, 06b, 07, 07b, 08, 09 | **Listening section**, knowledge-base attach row, Custom tools tab, Data Validator/Verifier/Mock API forms, Translations dialog, version dropdown, overflow menu, Review agent output, Set call goal form |
| Voice picker | Text dump only (`voices.txt`) | Any screenshot of the picker |
| Test panel | 10, 10b (idle) | Setup details, Chat mode, any running call |
| Telephony | 23 (chooser) | "Get started"/"Connect" flows, KYC, number price, Inbound calls page |
| Campaigns | 24, 25, 26 (step 1 only) | Steps 2, 3, 4 |
| Analytics | 29, 30 (both empty) | Connectivity, Engagement, Tools, Goals, Group by tabs, Boards, Workflow Analytics, sidebar Call logs |
| Billing, plans | 20, 21, 22 | Billing details tab, Usage page, Enterprise card (`21b` missing), Business card end |
| Org, team, security | 31, 34, 35 | Policy, General, API Key tab, Members list (blurred behind modal) |
| Integrations | 32 (MCP), 33 (Deploy with code) | Recipe pages, integrations list |

**Gaps in the set.** Files 11 to 19 and `21b` do not exist. Instinct's notes cite them.

**Blank, loading or mislabelled captures**
- `27` (Workflows) is a fully blank panel: no header, empty state, spinner or upsell. Instinct's notes call it "GATED, Enterprise-only, explicit upsell message [27]". The PNG does not show that message. I grade the gating **unknown from capture** (earlier docs research said Enterprise).
- `31` (Settings, Secrets) is blank below the tab switch. Empty, loading and failed are indistinguishable.
- `30` Ask Genie lacks its orb icon (still loading when captured).
- Notes cite `[23]` for "Rs 59 per number, 11/79/80 series". `23` shows only "Usage-based pricing - View details".
- Notes cite `[07b]` for Listening settings. `07b` is the call-actions screen.
- Notes cite `[36]` for six template names. `36` shows Recents and no templates. Only three templates are visible (`02`).
- Notes say the account holds a pre-existing "Conversation Agent 9010" (visible in the blurred `01` preview, tiny text). `36` Recents lists only the evaluation's agent, clipped at the bottom.
- `29` breadcrumb scope is "v2v", not the workspace's name (`35`). What it scopes is unknown.

**Account state.** Balance -36.58 credits pre-existing (shown as -37 in the header pill, `21`/`22`). Draft agent, API tool and knowledge base left on the account. Nothing was committed or deployed. Everything below that depends on a call, a payment or KYC is untested.

## 1. Information architecture

**Outer rail (six unlabelled icons).** The six products are inferred from the workspace row (`35`): Code, Content Studio, Cowork, Doc Agents, Sarvam API, Voice Agents. Voice Agents is the third icon, highlighted. One account, one workspace, six products (wt-sarvam-02).

**Voice Agents sidebar** (`02`, `22`, `27`, `28`; wt-sarvam-01):

| Group | Item | What it does | Flags |
|---|---|---|---|
| top | Search (Ctrl+K), Home | Prompt box to create an agent; Recents | |
| Build | Agents | Prompt box, Create from scratch, filter chips, templates | |
| Build | Workflows | Blank in capture (`27`) | Enterprise-only per notes and docs, **not shown in capture** |
| Build | Knowledge base | Searchable table of KBs, Create knowledge base (`28`) | |
| Deploy | Phone numbers | Rent vs bring-your-own chooser (`23`) | |
| Deploy | Inbound calls | Not captured | |
| Deploy | Outbound campaigns | Empty state, 4-step wizard (`24`-`26`) | WhatsApp campaigns Enterprise-only per notes (not captured) |
| Deploy | Deploy with code | API keys, 6 API recipe cards (`33`) | |
| Monitor | Agent analytics | 7 tabs, all empty (`29`) | |
| Monitor | Workflow Analytics, Boards, Call logs | Items only, pages not captured (`22`) | |
| footer | What's new [New], Settings, MCP [New], Usage, Pricing, Documentation | Changelog modal (`37`); API Key and Secrets (`31`); MCP install (`32`); rates (`22`) | Two green "New" badges |

The sidebar is a scroll container. At 720 px height Inbound calls fades under a double chevron (`02`) and Outbound campaigns is half-clipped (`27`); `22` shows the scrolled state. Home, Build and Deploy are never in view together with Monitor.

**Agent builder tabs** (wt-sarvam-03): Instructions, Variables, Tools, Settings, Automated tests. Header: version selector "v1 · Draft", Improve with Genie, Test agent, overflow menu.

**Organisation settings** (`34`, `35`): General, Members, Workspaces, Policy; Billing & usage: Plans & pricing, Billing, Usage; Support, Terms, Privacy. Policy and General were not opened.

**Beta, Enterprise or gated.** Nothing in the captures carries a Beta or Experimental badge. The Add-a-tool cards have no badges (`05b`). The only gate actually seen is the uncommitted-version gate (`26`). Workflows and WhatsApp gating rests on notes and docs.

## 2. First run

**What a new user sees** (on an existing account; wt-sarvam-05): a modal "Meet Bulbul V4 Voices" with three one-line bullets, "Know more" (black) and "Not now" (grey), over a blurred Agents page (`01`). It is a what's-new splash, not a checklist. The page behind is unusable until it is dismissed. No role, product or volume question was captured (earlier research says sign-up asks role, product, then welcome).

**Steps to a first working agent** (inferred from `02`, `03`, `10`, `26`, plus notes):

| Goal | Steps | Required fields visible |
|---|---|---|
| Browser-testable agent | **3 actions**: Create from scratch (or type a sentence in the prompt box), name it (40-character limit per notes), write instructions; then Test agent, Voice, Start Call | 1 (name). Instructions carries no asterisk and an empty draft was saved (`03`), so a blank prompt is accepted |
| Phone-live agent | **about 8**: the 3 above; commit the version (`26` shows the gate only in the campaign modal); rent a number (KYC unseen) or connect one of 7 providers (forms unseen); create an inbound deployment (unseen) or a campaign (4 steps) | Campaign step 1 alone has 3 asterisked fields: campaign name, agent, connections. Steps 2 to 4 unknown |

Instinct timed the builder opening at about 6 s and page-to-page navigation at 2 to 4 s (notes, evaluator-reported). Sarvam's "set up telephony in 2 minutes" claim (`23`) is vendor-displayed and untested (wt-sarvam-39).

**Template prompt preview** (wt-sarvam-07, `01`, read from tiny pixels): Greeting with variable chips ("Hi [userName], this is Aarti from [serviceProviderName]. Is this a good time to talk?"), then Persona, Environment & Situation, Objective, Speaking Style. Legible fragments: "If asked whether you are AI: say you are a virtual assistant from the..." and "Under 25 words per turn; one question at a time; wait for respo...". That is Sarvam's own prompt craft, and it agrees with what VP found (brief v2 cut words per turn from 33 to 20).

## 3. Agent builder end to end

### Instructions (`03`)
Greeting (default text names the voice and the vendor: "Hi, I am Shubh calling from Sarvam, how can I help you today?"), a Translations button, an empty Instructions editor ("Type / for commands, @ to mention variables or tools"), a floating "Review agent" pill, and a Genie panel with three suggestions. There is no save or publish control and no unsaved indicator on any tab; the only state is the label "v1 · Draft" (wt-sarvam-10). Version history, diff and where to commit are unknown (dropdown never opened).

### Variables (`04`, `04b`)
- Input variables: Variable name, Default value. One row, user_name = "Manan".
- Output variables: Variable name, Data type, Extraction prompt. One row, call_summary, string, "A short 1-2 line description of what happened on the call". Notes add that data type is String or Enum only.
- "When does a call count as a win?" card with "Set call goal" appears only on the Output tab. No goal set.
- Whether user_name and call_summary are platform defaults or evaluator-created is not shown. The Test panel Setup row reads "{ } 1/1".

### Tools (`05`, `05b`, `06`, `06b`)
- System tools (5, all "During call", "Built-in"): End Interaction on; Query Knowledge Base **Off** ("Enable a knowledge base to turn on this tool"); Call Transfer **Off** ("Enable Call forwarding to turn on this tool"); Handle Voicemail on; Change Output Language on.
- Custom tools, 4 types: API Tool, Data Validator, Data Verifier, Mock API.
- API Tool is a 3-step slide-over: (1) name (snake_case), required description with a greyed "Improve", run timing (call starts, **during the conversation** [pre-selected], call ends); (2) method, URL, inline Send, tabs Path, Params, Headers, Auth, Body, cURL paste; (3) response fields into the agent's reply with "@".
- No DTMF, SMS or hang-up-with-reason tool in any captured Tools surface (bounded negative; wt-sarvam-15).

### Settings (`07`, `07b`, `08`) in on-page order
Speaking, Thinking & knowledge, Listening (not captured), Environment, Language personalisation, in-call actions. Every setting I could read is in the table below.

### Settings table (defaults as captured)

| Setting | Default as captured | Range or options | Screenshot |
|---|---|---|---|
| Voice | Shubh | 199+ names in the picker (see section 4) | `07` |
| Per-language voices | OFF (badge "Overrides default voice") | toggle | `07` |
| Speaking speed | 1.15 x | not shown (no end labels) | `07` |
| Pitch | 0.00 | not shown; no unit | `07` |
| Volume | 1.0 | not shown on slider; What's new says "from 0.7..." | `07`, `37` |
| Pronunciation dictionary | none uploaded (badge "Advanced") | upload only | `07` |
| Model temperature | "Balanced" (middle of 5 ticks), no number | 5 ticks; earlier docs: 0.1-0.9, default 0.3 | `07` |
| LLM, ASR choice | none visible | no picker in captures | `07`, notes |
| Knowledge base attach | not captured | | |
| Listening: barge-in, eagerness, volume threshold | not captured (named in notes only) | unknown | notes |
| Background sound | Quiet office (with play preview) | select; other options not opened | `08` |
| Background volume | slider about one third along, no number | not shown | `08` |
| Switch language during call | ON | toggle | `08` |
| Languages allowed | 11 selected (Hindi, Bengali, +9) | multi-select; options seen: Bengali, English, Gujarati, Hindi | `08` |
| Starting language | Hindi (locked in dropdown; Test Setup says Hindi) | select | `08`, `10` |
| Auto-detected language switch | hidden behind dropdown | unknown | `08` |
| Switch after | hidden behind dropdown | unknown | `08` |
| Output numbers in Indic | appears ON (partly hidden); "500" becomes "paanch sau" | toggle | `08` |
| Idle nudge, message 1 | "Hey, are you still on the call?" after 5 seconds | text; delay stepper; "Add More" for more nudges | `07b` |
| Hang up after unanswered nudges | ON | toggle; nudge count not shown | `07b` |
| Voicemail | ON | toggle | `07b` |
| Voicemail message | "Hey, seems like I have reached your voicemail. I shall call you back at a later time" | free text | `07b` |
| Call forwarding | OFF, greyed ("Only supported for Vobiz...") | toggle | `07b` |
| Max call length | 15 (minutes, per helper) | up to 60 | `07b` |
| Greeting | "Hi, I am Shubh calling from Sarvam, how can I help you today?" | free text, Translations | `03` |
| Instructions | empty | free text, "/" commands, "@" mentions | `03` |
| Version | v1 · Draft | dropdown not opened | `03` |
| Input variable | user_name = Manan (origin unknown) | name, default value | `04b` |
| Output variable | call_summary, string, extraction prompt shown | String or Enum per notes | `04` |
| Call goal | not set | one output variable | `04` |
| API tool run timing | During the conversation | 3 options | `06`, `06b` |
| API tool method | POST (as captured; may be evaluator-set) | select | `06` |
| Test Agent mode | Voice | Voice, Phone, Chat | `10` |
| Test Setup language, variables | Hindi, "{ } 1/1" | | `10`, `10b` |
| Campaign Phone numbers selector | By number | By number, By group | `25` |
| Analytics date range, campaign, view, granularity | Oct 15-21 2026, All Campaigns, "#", Day | | `29` |
| Call Logs filter | Connected | Connected, All | `30` |

## 4. Model, voice, transcriber and language choice

**How choice is presented.**
- **LLM and ASR:** not a choice. Only a temperature slider appears under Thinking & knowledge (wt-sarvam-18). The voice minute is a single bundled rate, so there is no per-component price to compare (wt-sarvam-49).
- **TTS voice:** a picker (text capture only, no screenshot) with filters Genders, Models (Bulbul v4, v3) and 11 language chips, a "Great for X" tag per language, a preview box with a "n / 500" character counter, and Cancel / "Use <voice>". Notes add natural-language search ("hindi collections") that the dump does not contain (wt-sarvam-22).

**Catalogue size and make-up** (my parse of the dump; wt-sarvam-19 to 21; lower bound because the dump keeps unique lines of a lazy list; Instinct reported about 222):
- 199 distinct names: 176 role-named ("Ritu - Hindi Support Agent") and 23 plain names ("Shubh", "Aayan") with a generic "warm and natural tone" description, which sit under a "Bulbul v3" marker.
- Gender among 196 parseable: 119 female, 77 male.
- Job tags: conversational 30, customer support 18, narration 13, e-learning 8, collections 8, outbound sales 7, BFSI 6, then insurance, healthcare, e-commerce, KYC, feedback survey, interview screening. Names also include "AI Companion", "Warm Night Companion" and "Therapist Voice".

**Indian languages and Indic voices.**

| Language | Voices in capture |
|---|---|
| Hindi | 83 |
| English | 43 |
| English + Hindi ("Hinglish" appears only inside 3 voice names) | 11 |
| Marathi | 9 |
| Kannada, Punjabi, Telugu | 4 each |
| Tamil, Gujarati | 3 each |
| Bengali, Assamese | 2 each |
| Hindi + Kannada / Malayalam / Telugu mixes | 1 each |
| **Odia** | **0** (it is in the filter) |
| **Malayalam** | only the Hindi+Malayalam mix narrator |

The agent language list is 11 (Hindi, Bengali, English, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu), all selected by default (`08`). Assamese has 2 voices but is not in the 11. Hindi and English hold 137 of 196 voices; every other language is single digits.

**Language switching** (`08`): "Switch language during call" ON; Hindi is the locked starting language; "Output numbers in Indic" reads numbers out in Hinglish-style words. The Change Output Language system tool exists (`05`).

**Version risk.** The default chip says plain "Shubh", which matches a plain-name (v3-style) entry, while the changelog says the V4 voice was renamed "Shubh - Hinglish Ad Voice". Bulbul V3 reaches end of life on Voice Agents on **10 Nov 2026** (`37`). So a new agent may default to a voice that is about to be retired. Inferred; the alternative is that the chip is a short alias (wt-sarvam-23, 24).

**Trade-offs.** None are shown at the point of choice: no per-voice latency, cost or quality, no per-model price, no latency line in the Test panel. The only latency numbers in the product are the "up to 40% faster than Bulbul V3" modal claim (vendor-displayed, baseline unstated) and the empty "Latency 0 ms" analytics KPI (wt-sarvam-06, 25, 44). Vapi and ElevenLabs show inline per-option latency and cost (cross-vendor report).

## 5. Conversation control

| Control | What the dashboard shows | Unit | Default |
|---|---|---|---|
| Turn-taking: interruption, eagerness, volume threshold | Reported by the evaluator only; no screenshot | none seen | unknown |
| Idle nudge | Text plus delay, multiple nudges | seconds | "Hey, are you still on the call?" after 5 |
| Hang-up on silence | "Hang up after unanswered nudges" | count not shown | ON |
| Voicemail | Handle Voicemail tool **and** a Voicemail toggle with message | n/a | tool on, toggle ON, default message |
| Max call length | Stepper | minutes (helper text only) | 15, up to 60 |
| Call transfer | Tool Off until Call forwarding is on; forwarding "Only supported for Vobiz..." | n/a | OFF |
| DTMF | No tool or setting seen | n/a | none (earlier docs: "planned") |
| Noise | "Background sound" adds ambience to the agent; no caller-noise setting seen | volume slider, no number | Quiet office |

**What this means against prior research.**
- **No numbers to tune.** No millisecond value appears anywhere in the captured builder (wt-sarvam-31). Bolna's UI exposes endpointing 500 ms and linear delay 900 ms, whose sum gives the about 1.4 s reply floor that its own builder never adds up. Sarvam hides the floor completely: the earlier account-phase read of three coarse controls (interrupt on/off, sound sensitivity Low/Medium/High, eagerness Patient/Normal/Eager) sits over ten frame-level VAD parameters. The Listening section was not screenshotted, so those labels are unverified.
- **Whether it is English-tuned for Hindi is unknowable here.** The only evidence is behavioural: Sarvam's own EMI demo cut into a 2.4 s elderly pause 2 of 2 and went silent under babble 2 of 2 (earlier measured claims SAR-53). That is a live-call question (section 15).
- **Voicemail.** A tool plus a setting for one function, and a default message that names no company or purpose, so a recipient hears an unexplained "I shall call you back". No operator-announcement test was possible.
- **Interruption of the opening line.** Unknown. Not shown anywhere.
- **Default ambience.** "Quiet office" ON at about one third volume is mimicry by default. It may also reduce the clarity of the agent's own audio on a phone line; unmeasured.

## 6. Tools, knowledge base, integrations, workflows

- **Tools:** section 3. Strengths: cURL paste, inline Send, `@` response mapping, Mock API for pre-API testing, Data Verifier for "last 4 digits" checks. Missing in capture: DTMF, SMS, calendar, CRM, any mid-call webhook.
- **Knowledge base** (`28`): a table (Name, Uploaded by, Uploaded at "Now") with no status, size, source type or document count. Whether "eval_synth_faq" was indexed is invisible. Notes say upload took a few seconds with no training wait. The Query Knowledge Base tool stays Off until a KB is enabled (`05`).
- **Integrations:** a hosted MCP server (`32`, two steps: paste `mcp.json` with server "sarvam-voice-agents" at host `mcp.sarvam.ai`, or "Add to Cursor" / "Add to Claude", then ask the client "List my voice agents"); no auth step shown. Notes add Zapier, Make, HubSpot, n8n and MoEngage recipes, not captured.
- **Deploy with code** (`33`): "Generate API key", "Set up for AI coding tool", six recipes: Instant outbound, Batch outbound calling, Inbound deployments, Data fetch, Agents SDK, DND lists. **No create-agent recipe**, consistent with authoring through dashboard, Genie and MCP only.
- **Workflows:** blank (`27`). Not evidenced.

## 7. Testing and quality

- **Test Agent panel** (`10`, `10b`), docked beside the editor: Voice (browser), Phone (outbound to your number) and Chat. Setup row summarises language and variables. "Start Call" is enabled; Phone's "Place Call" is disabled until a number is typed; no country-code control; nothing about cost or latency. Not started, so nothing about what happens on a negative balance.
- **Automated tests** (`09`): an empty state promising user-written or AI-generated cases and "exactly what passed, what failed, and why". No result, case or run was seen. A simulated run costs **Rs 2** (`22`).
- **Review agent** and **Improve with Genie** are AI reviewers; outputs not captured. Notes say Genie flagged the tool as "an order status lookup tool" during side-effect verification.
- **Logs:** Call Logs inside Agent Analytics (`30`) and a sidebar Call logs item. Both empty. Columns unseen.
- **Debugging surface:** analytics has "Top failure reasons" and "Call outcomes" cards (`29`), cut off.

## 8. Telephony and numbers

`23` is the first-run chooser (no numbers connected):
- **Rent from Sarvam:** "Add or release numbers anytime", "billed through Sarvam Credits", "Set up fully managed telephony infra in 2 minutes", "Usage-based pricing - View details", footer "Powered by Vobiz". No rate, series or KYC text on the page.
- **Bring your own telephony:** "Works with 7 leading providers": Exotel, Smartflo, Pulse, InTalk, Vobiz, Twilio, Plivo (five India-based or India-first, two global). "Keep your current numbers and rates".

The India path from earlier research (11/79/80 geographic series at Rs 59 per number per 30 days, KYC with PAN and Aadhaar, 10-digit CLIs only, no 140xx or 1600xx) is **not on any captured screen** (wt-sarvam-43). The rented line is white-labelled Vobiz, so Sarvam's number health and carrier incidents are Vobiz's. Inbound calls page: not captured.

## 9. Campaigns and batches

- **Empty state** (`24`): "Reach thousands of customers by phone. Upload a contact list, pick an agent, and launch automated outbound calls." Buttons: Create campaign, Build with API. No compliance mention.
- **Wizard** (`25`): modal "Schedule campaign", four unnumbered segments **Agent, Recipients, Schedule, Review & Launch**, "Step 1 of 4".
- **Step 1 fields:** Campaign name*, Select agent*, Version, Connections* (Connection select; Phone numbers select, disabled until a connection is chosen, with By number / By group). In the empty form Next is black and looks enabled.
- **Where it was blocked** (`26`): picking "v1 (Draft)" raises "This version is not committed - Switch to a committed version or commit this version before deploying" with an inline **Commit version** button; Next goes grey. Connection is also empty, so the cause of the disabled Next is ambiguous. The campaign was named "DO NOT LAUNCH" and nothing was created.
- **Not seen:** steps 2 to 4 (upload and validation, scheduling window, retries, review). Earlier API research said a campaign has retry policy per outcome, phone rotation, allowed days and window; none of it is visible in the UI.
- **Compliance fields (consent, DND, DLT, calling windows):** none on the empty state or step 1. DND is only an API recipe card "DND lists" (`33`). No DND screen in the sidebar. Unknown for steps 2 to 4.

## 10. Analytics, call history and reporting

- **Agent Analytics** (`29`): breadcrumb "v2v / All Agents"; filters "All Campaigns" chip, date range (Oct 15-21, 2026), Add filter; tabs Overview, Connectivity, Engagement, Tools, Goals, Group by, Call Logs; "#" / "%" toggle; six KPI tiles (Calls attempted, Connected call, Latency, Avg call duration [label truncated], Total minutes, Short calls); Day granularity; cards "Call outcomes", "Top failure reasons". All zero.
- **Call Logs** (`30`): default Connected filter (a user with only failed calls sees "No call logs" until All is chosen); column, download, overflow buttons; empty-state action is "Go to My Agents".
- **Other:** Boards and Workflow Analytics exist in the nav but were not opened. Dual-channel (stereo) recordings shipped on 16 Oct (`37`).
- Latency shows "0 ms" with zero calls and a decorative wavy line is drawn behind "No data available": zero and no-data are conflated.

## 11. Billing, credits, plans and price display in-product

- **Billing** (`20`): badge "Pay as you go"; **credits left -36.58** in the same dark type as a positive number, no overdrawn state; cards View plans, Add credits, "Set up auto top-up"; tabs Payment history ("No payments yet") and Billing details. The header pills on `21`/`22` read "-37 Credits": two roundings of one balance.
- **Plans** (`21`, vendor-displayed): PAYG no monthly fee; Pro Rs 9,999/month with 9,999 credits ("Most popular"); Growth Rs 49,999 with 49,999 credits ("Best value"); Business Rs 1,99,999 with 1,99,999 credits. Tiers are described qualitatively ("Lower rates", "Higher rate limits", "Our best public rates"); no rate-limit numbers. A notice: "Complete your billing details so we can work out the tax. Nothing is charged until then."
- **Rates** (`22`, vendor-displayed): Voice Agent (60s) Rs 3.5 / 3.25 / 3.15 / 3 per minute (Pay As You Go / Pro / Growth / Business), headed "Usage (Actual Minutes)"; Simulate Test Runs Rs 2 per run at every tier; Call forwarding to PSTN Rs 0.4 per 30 s pulse at every tier. A 60-second pulse and a 30-second pulse share one page. No STT, LLM or TTS breakdown.
- Against VP's Rs 2 per minute ambition, Sarvam's displayed headline is 3 to 3.5 for the voice minute before telephony (`directive.2026-10-17.price-target`); earlier research computed 4.40 to 7.40 effective for 30 to 90 second calls from the pulse rules.

## 12. Team, org, security, API keys, compliance settings

- **Members** (`34`): "Add User" takes only an email and a workspace and states the invitee becomes "a Member with Editor access". No role selector. The Invite button is grey until both are filled (no explicit message).
- **Workspaces** (`35`): one workspace carries all six products; Add Workspace exists.
- **API keys and secrets:** Settings has API Key and Secrets tabs (`31`); Secrets is blank. "Generate API key" and "API keys" live on Deploy with code (`33`). No key was created.
- **Policy, General, SSO, 2FA, audit log, data retention, BYOK:** not captured. Notes say sign-in needed no OTP.
- **Compliance settings:** none visible beyond the DND recipe card.

## 13. UX quality ledger

**Excellent (VP must match or beat)**

| Item | Screenshot | Evidence |
|---|---|---|
| Settings rows: label left, plain-language helper, control right | `07` | "Who your agent sounds like", "How fast the agent talks" |
| Slider paired with a typed number | `07` | 1.15 x, 0.00, 1.0 |
| Disabled tools say what unlocks them | `05` | "Enable a knowledge base to turn on this tool" |
| Inline gate with the fix in the same step | `26` | "This version is not committed" + Commit version |
| Placeholders that model good input | `06b` | snake_case example, one-sentence description example |
| cURL paste and inline Send test | `06` | "Paste it to auto-fill the form" |
| Test panel docked beside the editor, three modes | `10` | Voice, Phone, Chat |
| Genie everywhere plus a prompt-box agent creator | `02`, `03`, `36` | Ask Genie on every page; "Create a voice agent" |
| Empty states with a clear first action | `09`, `24` | "Know if your agent works"; Create campaign / Build with API |
| One-click MCP install and verify prompt | `32` | Add to Cursor, Add to Claude, "List my voice agents" |
| API recipe cards and AI-tool setup | `33` | six cards, "Set up for AI coding tool" |
| INR plan and per-pulse rate tables with units | `22` | "per minute", "per pulse" under each service |
| Native-script glyphs in the language picker | `08` | script glyph beside each language |
| Job-tagged, filterable voice catalogue | `voices.txt` | "Best for collections and payment recovery calls" |

**Clunky**

| Item | Screenshot | Evidence |
|---|---|---|
| No save or unsaved state, only "Draft" | `03` | no control anywhere in header |
| Commit gate found only at deploy time | `26` | not visible in builder tabs |
| Temperature has a label but no number | `07` | "Balanced" |
| Sliders without ends or units | `07` | pitch 0.00 has no unit |
| Two voicemail controls | `05`, `07b` | tool plus toggle |
| Max call length stepper unit only in helper | `07b` | "(up to 60)" |
| Negative balance in normal type, two roundings | `20`, `21` | -36.58 vs -37 |
| Next looks enabled with empty required fields | `25` | black Next, no validation |
| Two entry points to create an agent | `02` | prompt box and Create from scratch |
| Truncated text everywhere | `05`, `06`, `07b`, `29` | "Avg call duratio", "Only supported for Vobiz..." |
| "Add tool" grey on System tab, black behind the modal | `05`, `05b` | inconsistent state |
| Mixed date formats, deprecation styled as news | `37` | "5 days ago" vs "14 Oct"; V3 end of life with no warning style |
| Default "Connected" filter hides failed calls | `30` | toggle default |
| Dependent selects greyed with no reason | `25` | "Select a connection first" (this one is fine) |
| Sidebar clipped at 720 px | `02`, `27` | Outbound campaigns half-cut |
| Plan cards clip the Business card | `21` | button cut at the edge |

**Broken**

| Item | Screenshot | Evidence |
|---|---|---|
| Workflows renders nothing | `27` | blank main panel, no state |
| Secrets renders nothing | `31` | blank below the tab switch |
| Analytics draws a fake wavy line on empty data | `29` | line behind "No data available" |
| Latency "0 ms" with no calls | `29` | zero conflated with no data |
| Possible default to a retiring voice | `07`, `37` | plain "Shubh" vs V3 end of life 10 Nov (inferred) |

## 14. What the dashboard adds to prior research

**Confirmations.** Bulbul V3 end of life 10 Nov (SAR-41, `37`). Seven BYO providers identical (SAR-27, `23`). Rates Rs 3.5/3.25/3.15/3, simulate Rs 2, PSTN forwarding Rs 0.4 per 30 s (SAR-36, `22`). Template trio Appointment, Sales discovery, EMI Collection (SAR-61, `02`). MCP and API-keys surfaces (SAR-15, `32`, `33`). 176 role-named voices equals the 176 the docs reported. Stereo recordings 16 Oct and volume 14 Oct dates (SAR-42, `37`). No create-agent API recipe (account-phase finding, `33`).

**Contradictions or corrections (prior claim quoted)**
1. SAR-02: "Monitor (Agent Analytics with 8 tabs, Log Analyser, SQL Boards)". The dashboard shows **7** tabs in Agent Analytics, a sidebar of Agent analytics, Workflow Analytics, Boards and Call logs, and nothing called "Log Analyser" (`29`, `22`).
2. SAR-36: Business "3.00 (coming soon)". The dashboard shows a live "Upgrade to Business" button at Rs 1,99,999 (`21`, `22`). Docs said Rs 2,00,000.
3. SAR-37: marketing "Pro INR 2,000, Growth 10,000, Business 50,000". The dashboard sides with the docs (9,999 / 49,999 / 1,99,999) (`21`).
4. SAR-10: "member invites with workspace grants and roles". The invite dialog has no role choice; it fixes "Member with Editor access" (`34`). Partial.
5. SAR-12: "only temperature 0.1-0.9, default 0.3". The slider shows "Balanced" at the middle tick with no number; the mapping to 0.3 is not shown and a linear mid-point would be 0.5 (`07`). Unresolved.
6. SAR-19: plan rate limits "PAYG 4/20, Pro 10/50...". No numeric limits appear on the plan cards (`21`).
7. SAR-44: "an org-wide DND suppression list (manual, bulk CSV or API)". The dashboard shows no DND screen, only an API recipe card (`33`). The UI may exist elsewhere; unknown.
8. SAR-54: "no AI-disclosure setting or non-removable guardrail appears in conversation settings". Still true on captured screens, with one addition: Sarvam's own template prompt preview tells the agent to say it is a virtual assistant when asked (`01`). Disclosure is a prompt line, not an enforced control, which fits the EMI demo claiming to be human 6 of 6 (SAR-53).
9. The voice-count mix: earlier "176 voices (docs), 222 v4-flash slugs, 266 enum slugs". The picker dump holds 176 role-named plus 23 plain names; Instinct's 222 is not reconciled.
10. Instinct's own notes versus pixels: Workflows upsell, Rs 59, Listening, Home templates (section 0).

**Only the dashboard showed**
- The defaults table in section 3 (speed 1.15, volume 1.0, nudge 5 s, max call 15, "Quiet office" ON, 11 languages preselected, voicemail ON with a company-less message).
- The default greeting names the vendor and the voice.
- The draft-commit gate and its inline fix.
- The picker's facets, the "n / 500" preview counter and the voice-name changes tied to the V3 retirement.
- Sarvam's own prompt template (Persona, Environment & Situation, Objective, Speaking Style, "under 25 words per turn").
- A negative balance is displayed with no state change; the plans page says "Nothing is charged until then".
- Blank Workflows and Secrets panels; the "v2v" scope; Call Logs defaulting to Connected.
- Companion, "Warm Night Companion" and "Therapist Voice" voices in a business catalogue.

## 15. For VP

**Match (parity floor, not a wedge: `rejected.2026-10-17.parity-undercut`)**
- Prompt-box agent creation plus India-vertical templates (collections, EMI, appointments, lead qualification, cart recovery).
- A copilot that builds, reviews and improves.
- A docked Voice/Phone/Chat test panel and an automated-tests tab with simulated runs.
- Input and output variables with natural-language extraction prompts and a goal.
- API tool with cURL import, inline Send, `@` mapping; Mock API; validators and verifiers.
- Per-language voices, pronunciation dictionary, Indic number reading, mid-call language switching.
- Nudges, hang-up on silence, voicemail, max call length, transfer.
- A four-step campaign wizard with a version gate; Call Logs with failure reasons; an INR plan table with per-pulse rates; an MCP install page; API recipe cards; a changelog modal.

**Beat (specific ways)**
1. Show the predicted reply gap, per-component cost and latency beside every turn-taking, model and voice choice. Sarvam shows none, and offers no LLM or ASR choice (wt-sarvam-25, 31). This fits `decision.2026-10-20.product-stack-selectable`.
2. Turn-taking presets with visible milliseconds and a sum, tuned and tested on Hindi and Hinglish, and a "Listening" panel that says what it does.
3. Put consent, DND, calling-window and attempt-cap fields in the campaign steps with sensible category defaults (Sarvam's step 1 has none; its DND is an API card).
4. A persistent preflight checklist (committed version, connection, number, balance) instead of a gate found at step 1 of the deploy wizard.
5. Non-removable AI disclosure and no default fake ambience; no companion or therapist voices in a business catalogue.
6. Honest voice catalogue per language with counts, so Odia, Malayalam and Assamese gaps are visible before purchase; warn when a voice's model is retiring.
7. Explicit empty, loading and error states (Workflows and Secrets blank), a clear overdrawn state, one rounding for the balance.
8. A visible save, version and diff model.
9. Memory and personalisation as first-class: contact memory behind input variables, not only a default value.
10. A voicemail design that names the company and purpose by default, one control for one function.

**Avoid:** unitless sliders, hidden floors, a bundled price with no breakdown, mixed date formats, truncated helper text on the very limits that matter ("Only supported for Vobiz..."), default ambience that mimics a person, and a default voice that is about to be retired.

**Open questions only live calls can answer**
- Handset reply gap and cut-in rate under Sarvam's defaults, on Hindi and Hinglish, with short replies ("haan", "nahi") and a 2.4 s pause.
- Whether "Quiet office" at its default volume harms barge-in or recognition.
- Which Bulbul version the default Shubh runs, and its first-audio time; whether V4 is "up to 40% faster" against which V3 baseline.
- Whether a negative balance blocks Test agent calls, and what a call is debited (pulse rounding).
- Whether the default voicemail message is spoken correctly on Indian operator voicemail and announcements.
- Warm versus blind transfer on a non-Vobiz connection.
- Campaign steps 2 to 4: upload validation, window enforcement (for example 07:00-23:00), retries, DND handling, attempt caps.
- What Rent from Sarvam costs and requires (KYC), and whether 140xx or 1600xx numbers can be obtained.
- What Genie builds from a one-line prompt, and whether it adds disclosure.
- Whether the Listening defaults are tuned for Hindi.
