# Bolna dashboard walkthrough: end-to-end product analysis (2026-10-21)

Source: Instinct's walk of the Bolna dashboard on our trial account (team@vyakti.ai), 2026-10-21. No live calls were placed, the account is empty, and every latency, cost and price shown is vendor-displayed, not measured by us. Claim ids [NN] refer to `research/2026-10-21/walkthroughs/bolna/claims.json` (wt-bolna-NN).

Grades used: **observed** (seen in a screenshot or text capture), **displayed-by-vendor** (a number the product shows), **inferred** (reasoned from cited observations), **unknown**.

---

## 0. Coverage: what was captured and what was not

**Read for this analysis:** 43 text captures (all), Instinct's notes, the Bolna section of the cross-vendor report, and the two prior Bolna reports plus the SYNTHESIS dashboard section. 28 of the 44 PNGs were opened directly (the ones behind the main claims); the other 16 were covered by the calibrated screen notes and their text captures. File number 11 is missing from both the PNG and text sets. [01]

**What the account looked like:** trial plan, $5.00 wallet, 83 minutes, concurrency 2, one saved agent (`VP-teardown-synthetic-minimal-DO-NOT-CALL`, Hindi) plus an untouched `New Agent` draft, one `Untitled workflow` draft made during the walk, one API key, zero everything else. Every list page is an empty state. [03]

**Mislabelled or misleading captures (do not over-read):**

| File | What it actually is |
|---|---|
| 00-login-landing | The logged-in Agent Studio mid-load (grey skeleton editor). Not a login page. |
| 29-billing, 30-team, 31-settings | All three are the Agent Studio New Agent draft. 29 is the cost-still-loading state; 30 and 31 are identical. No billing, team or settings content. |
| 33-org-switcher | Analytics with the user switcher focused. No org menu is open. |
| 21-calling-toggles-on-unsaved | Calling tab with toggles on. No unsaved marker is visible; the footer still says "Updated 5 minutes ago". |
| 40-recharge-dialog | The Add Funds modal over Analytics. |
| 07-analytics | Spinner state; the chart titles come from the text capture and from 32 and 33. |
| 32-user-menu | Analytics with the account popover open (useful). |

Real billing, account, team and compliance content is in 34, 35 and the 36-account-* set. [02]

**Known only from Instinct's notes (no screenshot or text capture holds it):** the open option lists for LLM, STT and TTS providers; the full OpenAI model list; the Voice engine options (Cascaded or Realtime Beta); the Engine tail values (check-in 10 s, hangup on silence 20 s, total timeout 90 s); the batch/campaign template column; sign-in methods; load timings. These are flagged "(notes)" below. [04]

**Not captured at all (contents unknown):** Graph Agent; the Organisation page; Documentation; the Import dialog; the Get-a-call-from-agent dropdown; the agent history and duplicate icons; Browse Modules; AI Edit output; Add Section; Hangup-using-a-prompt; Upload Batch dialog; Verify phone number dialog; Create trunk dialog; the Create compliance application form; Generate report dialog; Analytics Top Agents tab; Campaigns Executions tab; the Pilot tab; Add URL tab of the knowledge-base modal; Auto Build; the org switcher options; any real call record. [05]

**Never opened by design:** KYC (off-limits), card, number purchase, invites, calls.

---

## 1. Information architecture

```
Workspace switcher: "bolna.ai / Active"        (options not captured)
Header (every page): wallet chip $ + add-funds "+", sparkle (AI) button, help (?) ; on saved-agent pages also a red minutes chip (83)
Floating Bolna bubble bottom-right (help/chat; contents not captured)

Ask Bolna (Beta)                  chat assistant over agents/calls/batches/numbers; can act
BUILD
  Agent Studio                    /dashboard   master-detail; 7 tabs (section 3)
  Graph Agent                     NOT CAPTURED
  Workflows (Beta)                list -> canvas builder (Start, Inspector of node types)
  Knowledge Base                  /knowledgebase  (API, MCP, Add Knowledge Base)
DEPLOY
  Campaigns (Beta)                /campaigns  tabs: Campaigns | Executions; New campaign modal
  Batches                         /batches    agent-scoped CSV upload (API, MCP, template link)
  My Numbers                      /phone-numbers  (API, MCP, Buy Phone Number)
  SIP Trunks                      /trunks
MONITOR
  Call History                    /agent-executions, titled "Agent Conversations"
  Analytics                       /analytics  Metabase iframe
  Reports                         /reports    async export jobs
  Debugging                       /debugging  search by execution ID
DEVELOPERS
  API Keys                        /developers, titled "Developers"
  Documentation                   external
SETTINGS
  Integrations                    /providers  18 provider cards
  Organisation                    NOT CAPTURED (relation to /account unknown)
User popover (bottom-left)
  theme toggle | Recharge account (modal: Add Funds | Pilot[New]) | Account (0/2 ongoing calls)
  | Verified numbers (/verified-phone-numbers) | Log out
Account = "Workplace settings" (/account) tabs:
  Account Information | Team Members | Compliance Settings | Invoices | Violations | Vobiz KYC
```

[06] [07]

**One line per surface**

| Surface | What it does |
|---|---|
| Ask Bolna | Plain-language assistant over your account; suggested prompts mix reads (last batch status, configured dispositions, campaign performance) and a write (create a SIP trunk for Twilio). [41] |
| Agent Studio | Build, tune and test one agent; always shows cost per minute. |
| Workflows | Canvas that chains agent calls, extractions, waits, retries, branches, HTTP calls, callbacks, WhatsApp. |
| Knowledge Base | PDF or URL sources for retrieval, attached per agent. |
| Campaigns | Run a published workflow against a contact list; stat strip of campaigns, active, contacts, still to dial. |
| Batches | Upload a CSV against one agent. |
| My Numbers / SIP Trunks | Buy a number; or connect your own carrier with a trunk that shows Health, Numbers, Active calls, Last call. |
| Call History / Debugging / Reports / Analytics | List and export calls; look one up by execution ID; async big exports; Metabase charts. |
| Integrations | Connect provider keys (BYOK) and tools. |
| Account tabs | Pricing and concurrency, team (gated), compliance applications, invoices, carrier violations, Vobiz KYC. |

**Beta, gated or Enterprise:** Beta on Ask Bolna, Workflows, Campaigns and on AI Edit; a "New" badge on the Pilot tab; Team Members is "a paid feature" routed to a sales call; the trial banner limits outbound calls to verified numbers; concurrency is 2. Note that Campaigns, the core outbound feature, is itself Beta. [08]

**Layout cost:** two stacked banners (trial, non-dismissible; promo, dismissible) take about 90 px of 720 px on every screen, and the sidebar is clipped after Analytics at 1280x720, so Reports, Debugging, Developers and Settings need a sidebar scroll. [06]

---

## 2. First run

What a new user sees (observed): the app opens directly on Agent Studio with a draft `My New Agent` already selected, welcome message `Hello from Bolna`, engine Cascaded, Hindi default, a cost bar of `$0.060`, wallet `$5.00`. No tour, checklist or wizard appears in any capture. The cost header first renders as `Cost per min (approx): ~ $` over an empty bar and then jumps about 24 px when the bar arrives (29 vs 30). [09] [11]

**Steps to a first working agent (inferred, [10]):**

1. Sign in (email plus password; GitHub/Google SSO per notes). Sign-up itself was not re-run.
2. Type a prompt into the Canvas. This is the only truly empty required-looking field; name, welcome message, engine, model, voice, transcriber and telephony arrive pre-set (on the saved agent; the draft's other tabs were not opened).
3. Optionally edit the pre-filled welcome message.
4. Save agent.
5. Verify your own phone number (user popover > Verified numbers > Verify phone number), because the trial only dials verified numbers.
6. Get a call from agent.

That is about 5 to 7 steps and 1 required typed field, plus one phone number. What Save validates, and whether Auto Build exists in the UI, is unknown: Auto Build (prior reports) was not visible in any capture. [58]

**Steps to a first campaign (inferred, [47]):** create agent, create workflow with an Agent node, publish it, verify a phone number, New campaign (name, workflow, version, contacts). That is 5 to 7 steps before any dialling, and the trial rule still limits who can be called.

---

## 3. Agent builder end to end

**Frame** [12]: left list (Import, New Agent, search); right header with editable name, Voice engine select, duplicate icon, history icon, cost bar; seven tabs; sticky footer with `Updated N minutes ago`, `Save agent`, and a `Get a call from agent` split button. The cost header stays on every tab (observed).

**Agent tab** [13]: welcome message with `{{variable}}` hint; toggle "Ignore user speech before welcome message" (off); welcome delay slider (0 ms); Canvas prompt editor. The new-agent Canvas is a five-section skeleton (Identity and Demeanour, Conversation Starter, Conversation Flow, Closing, Frequently Asked Questions), shows a token counter (24 tokens in the draft, 27 for the saved agent's one-line prompt), accepts `{{` for variables, `@` for modules/functions/variables, `#` for sections, `-` for lists. Controls: language chips with Add Language, AI Edit (Beta), Browse Modules, Add Section, test-variable block with `Asia/Kolkata UTC+05:30`, "Hangup using a prompt". The prompt is per language (chip row on the Canvas). (20-add-language.png, 01-dashboard-agent-studio.txt)

**Intelligence** [14]: provider `openai`, model `gpt-4.1-mini`, tokens per output 100, temperature 0.1, multi-select Knowledge Base. (13)

**Languages** [15]: "Settings for" chip row (Hindi Default). Voice: ElevenLabs / Eleven Turbo v2.5 / Tripti - Calm and Clear, with preview and an Advanced settings accordion (closed, contents unseen). Transcription: deepgram / nova-3 / Keywords / Context. (14, 19)

**Calling** [16]: Telephony Provider Plivo, Ambient Noise None (with add and preview buttons). Four toggles, all off: Noise Cancellation (in %), Voicemail Detection (in s), Keypad Input (DTMF), Auto Reschedule. Turning them on reveals values (85 and 2.5). Inbound Calling card: inbound number select; "Database for inbound phone numbers" (match incoming calls to users and preload their data; allow calls only from the chosen database); Spam Prevention (maximum calls per number; always-allow list). "Outbound call timing restrictions" with Allowed Time Window Start 9:00 AM, End 9:00 PM. (15, 21)

**Engine** [17]: Response Rate preset (`Custom`), Endpointing, Linear delay, words before interrupting; below the fold User Online Detection, Final Call Message, Allow interruption, Call Management (hangup on silence, total timeout). (16)

**Tools** [18]: Calendar Availability, Book Appointment, Transfer Call ("Route call to human"), Web Search, plus a Custom Function (write manually or generate from cURL). Nothing added. (17)

**Extractions** [18]: webhook URL, headers toggle, trigger statuses (default All), Send test; an Extraction Library with one entry, Call Summary ("Generate a call summary after each call"), and New Category; a Test button. (18) The tab is named Extractions but the visible content is mostly the webhook.

**Save model** [19]: no unsaved marker; Save is always enabled; the only state cue is `Updated N minutes ago`. (21, 12)

### Every setting, default as captured, range or options, screenshot

Slider ranges are not labelled. Where a range is given it is estimated from thumb position (marked "est.") and assumes minimum 0 unless stated; treat as low confidence.

| Tab | Setting | Default as captured | Range / options | Screenshot |
|---|---|---|---|---|
| Header | Agent name | `My New Agent` (draft) | free text; truncates long names | 01 |
| Header | Voice engine | Cascaded | Cascaded or Realtime (Beta) (notes only; select not opened) | 01, 12 |
| Header | Cost per minute | `$0.060` (shows `~ $` while loading) | derived; not editable | 01, 29, 30 |
| Agent | Welcome message | `Hello from Bolna` (draft); `Namaste, yeh ek synthetic test agent hai.` (saved agent) | free text with `{{vars}}` | 01, 12 |
| Agent | Ignore user speech before welcome | OFF | on/off | 01, 12 |
| Agent | Welcome message delay | 0 ms | slider + number; unlabelled | 12 |
| Agent | Canvas prompt (new draft) | 5-section empty skeleton, 24 tokens | free text, add sections, modules | 01 (txt) |
| Agent | Prompt language | Hindi (Default) | 22 more: see section 4 | 20 |
| Agent | Test-variable timezone | Asia/Kolkata UTC+05:30 | not opened | 01 (txt) |
| Agent | Hangup using a prompt | present, state not captured | unknown | 01 (txt) |
| Intelligence | LLM provider | openai | azure, openai, google, openrouter, deepseek, anthropic, custom (notes only) | 13 |
| Intelligence | LLM model | gpt-4.1-mini | per provider; list not captured (notes: about 21 OpenAI rows) | 13 |
| Intelligence | Tokens per LLM output | 100 | slider; est. 0 to about 4,000 | 13 |
| Intelligence | Temperature | 0.1 | slider; est. 0 to 1 (field clipped by chat bubble) | 13 |
| Intelligence | Knowledge base | none selected | multi-select | 13 (txt) |
| Languages | Voice provider | ElevenLabs | Cartesia, ElevenLabs, Maya, Sarvam, Azuretts, Smallest, Kalpa, Soniox (notes only) | 14 |
| Languages | Voice model | Eleven Turbo v2.5 | ElevenLabs: Multilingual v2, Flash v2.5, Turbo v2.5, v4 Turbo (Beta), v3 Conversational (notes only) | 14 |
| Languages | Voice | Tripti - Calm and Clear (female) | about 100 voices; All/Male/Female/Neutral; preview | 14, 19 |
| Languages | Voice advanced settings | collapsed | not captured | 14 |
| Languages | Transcriber provider | deepgram | assembly, azure, deepgram, elevenlabs, gemini, gladia, google, openai, sarvam, smallest, soniox (notes only) | 19 |
| Languages | Transcriber model | nova-3 | Deepgram nova-3, nova-2, Flux Multilingual (notes only) | 19 |
| Languages | Keywords / Context | empty | free text | 19 |
| Calling | Telephony provider | Plivo | Twilio, Exotel, Vobiz connectable in Integrations (notes) | 15 |
| Calling | Ambient noise | None | select with add and preview; options not captured | 15 |
| Calling | Noise cancellation | OFF; 85 % when on | slider; thumb fits 60 to 100 (matches the code finding) | 15, 21 |
| Calling | Voicemail detection | OFF; 2.5 s when on | slider; value field greyed; range unlabelled | 15, 21 |
| Calling | Keypad input (DTMF) | OFF | on/off | 15, 21 |
| Calling | Auto reschedule | OFF | on/off | 15, 21 |
| Calling | Inbound calling | OFF; no number; no data source | number select; data-source select | 21 |
| Calling | Spam prevention | max calls per number and always-allow list present; values not captured | unknown | 21 (txt) |
| Calling | Outbound timing window | 9:00 AM to 9:00 PM; enforcement default not seen | whole-hour start and end selectors | 21 (txt) |
| Engine | Response rate | Custom | preset select; options not captured | 16 |
| Engine | Endpointing | 500 ms | slider; est. 0 to about 5,000 ms | 16 |
| Engine | Linear delay | 900 ms | slider; est. 0 to about 2,500 ms | 16 |
| Engine | Words before interrupting | 1 | integer slider; est. 0 to about 10 | 16 |
| Engine | User-online message | Hindi, 24 chars (notes: "Hey, are you still there") | per language | 16 (txt) |
| Engine | Invoke message after | 10 s (notes) | seconds | 16 (txt) |
| Engine | Final call message | Hindi, 0 chars (empty) | per language | 16 (txt) |
| Engine | Allow interruption | present; state not captured | toggle | 16 (txt) |
| Engine | Hangup on user silence | 20 s (notes) | seconds | 16 (txt) |
| Engine | Total call timeout | 90 s (notes) | seconds | 16 (txt) |
| Tools | Tools added | none | 4 presets + custom function | 17 |
| Extractions | Webhook URL | empty (placeholder `https://your-endpoint.com/webhook`) | URL | 18 |
| Extractions | Add headers | OFF | toggle | 18 |
| Extractions | Trigger on statuses | All statuses (default) | options not captured | 18 |
| Extractions | Extraction library | Call Summary listed; on/off not captured | New Category | 18 (txt) |

Other defaults (knowledge base, campaigns, history, analytics, recharge, number purchase, workflows, account) are in the structured `defaults` list.

---

## 4. Model, voice, transcriber and language choice

**How choice is presented.** Each component is a plain select (provider, then model, then voice), and the header carries one number: cost per minute. There is no per-option price, latency or quality score anywhere in the captured Bolna UI, including the open voice picker; the cross-vendor report says Vapi, Retell and ElevenLabs show those inline. The only trade-off cue is the "Preferred Price" badge, with no tooltip text, and a "Show models" link on the Account page. [20] [25]

**Catalogue sizes**

| Item | Size | Source |
|---|---|---|
| ASR models inside the flat price | 9 chips: nova-2, nova-3, saarika:v2.5, saaras:v2.5, saaras:v3, saaras:v4, stt-rt-v5, azure, scribe_v2_realtime | 35 |
| LLM models inside the flat price | 13 chips: gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.4-mini, gpt-5-nano, gpt-5.4-nano, gpt-5.6-luna, gpt-6-luna, plus 5 azure/ variants | 35 |
| TTS models inside the flat price | 16 chips: bulbul v2/v3/v4-flash; 7 ElevenLabs; sonic-english, sonic-3, 3.5, 3.6; neural; maya | 35 |
| LLM / STT / TTS providers in the agent selects | 6 + custom / 11 / 8 | notes only |
| Voices in the Hindi voice picker | about 100 (counted from the text capture) | 19 |
| Add-language options | 22, plus Hindi default | 20 |
| Integration cards | 18 | 26 |

Models outside the 38 chips (for example Anthropic LLMs, and Kalpa, Smallest or Soniox TTS, per the notes) have no chip; the earlier code finding is that non-preferred models bill at base usage rates. Nothing in the picker warns you of that when you select one. (inferred) [21] [24]

**Indian languages and voices.** The 22 add-language options include English, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Urdu and `India Multilingual`, plus nine foreign languages (Spanish, Arabic, Burmese, Dutch, French, German, Indonesian, Italian, Malay). There is no Hinglish or Bhojpuri entry, and `India Multilingual` is listed beside single languages with no explanation. [23] Settings are per language: each chip carries its own prompt, voice and transcriber. [15]

The voice picker (ElevenLabs library) shows name, gender and one category tag: about 85 of about 100 are `conversational`; others are advertisement, social_media, characters_animation, informative_educational, narrative_story, entertainment_tv. Indic coverage by name: many Hindi voices; Marathi (Anika, Kalyani, Shrey, Vinayak, Swapnil), Gujarati (Chinmay, Leela Ben, Mitali Ben, Muskaan), Bengali (Niharika), Kannada (Subbanna). No Tamil, Telugu, Malayalam, Punjabi or Odia voice name appears. The list opened under the Hindi chip is not filtered by language: it also holds an Omani Arabic voice and an American English voice, and the rows carry no language field. Two rows are romance-register voices ("Girlfriend Voice, Feels Romantic", "Sweet Romantic AI Girlfriend") in a business-calling catalogue. BFSI-flavoured named voices exist ("Realistic BFSI Customer Care", "Senior Recovery Specialist"). [22]

**Prior comparison:** the API lane found 1,280 ElevenLabs Hindi voices and 16 TTS providers; the dashboard picker shows about 100 and 8 providers (notes), so the dashboard exposes a curated slice of the API catalogue. (inferred)

---

## 5. Conversation control

| Control | Dashboard default and unit | What the UI tells the user |
|---|---|---|
| Endpointing | 500 ms | one slider, no explanation text visible [17] |
| Linear delay | 900 ms | one slider; no sum with endpointing [32] |
| Response rate | `Custom` (preset select) | presets exist; options unseen |
| Words before interrupting | 1 | one integer, not language-aware [35] |
| Allow interruption | present; state not captured | toggle |
| User online detection | per-language message, "Hindi 24 chars", after 10 s (notes) | message length is the English line's [33] |
| Hangup on user silence | 20 s (notes) | seconds |
| Total call timeout | 90 s (notes) | seconds |
| Final call message | empty (0 chars) | per language, off by default [33] |
| Welcome: ignore speech / delay | OFF / 0 ms | toggle and slider [36] |
| Voicemail detection | OFF; 2.5 s when on | one seconds value; no message or Hindi-operator handling [34] |
| DTMF | OFF | bare toggle [34] |
| Noise | cancellation OFF, 85 % when on; ambient None | slider and select [34] |
| Hangup by prompt | "Hangup using a prompt" control on Agent tab | content not captured |

**Relation to prior research**

- **Reply floor.** Prior: "500 ms ... then the engine holds the reply's audio until 900 ms have passed since that final ... a floor of about 1.4 s." The dashboard shows exactly those knobs and values (Endpointing 500, Linear delay 900), labelled differently from the API's `incremental_delay` (the mapping is inferred from the matching value). It confirms the knobs are user-visible and mostly invisible in consequence: the two sliders sit under "Response Latency" with no sum and no predicted reply gap. Slider thumbs imply linear delay can go to about 2.5 s and endpointing to about 5 s. [31] [32]
- **Caveat that matters.** This agent's creation path is unknown. Its name and prompt follow the teardown's synthetic-agent convention, which would explain why its values equal the API-stored ones, and `Custom` as the Response Rate would also fit an API-written agent. The New Agent draft's Engine tab was never opened, so the claim "dashboard users get a 900 ms hold" is not proven. It needs one dashboard-created agent. [31]
- **English-tuned turn-taking.** Prior: finals at or under the word threshold are discarded unless on an English-only stop list, so "nahi", "haan", "ruko" and "bas" never reach the LLM. The dashboard offers one integer (1) and no language-aware setting, so a Hindi builder cannot see or fix it. Unmeasured on a call. [35]
- **Check-in language.** Prior: a Hindi agent's check-in defaults to the English "Hey, are you still there". The per-language field reads "Hindi, 24 chars", and the English line is 24 characters long. Consistent. [33]
- **Speech over the welcome.** Prior: everything said while the welcome plays is dropped. The dashboard exposes "Ignore user speech before welcome message" and it is OFF by default, so the earlier claim needs a condition. Unresolved without a call. [36]
- **Voicemail.** Prior: detection waits for 7 or more words, checks every 7 s up to 30 s, 2.5 s detection time. The dashboard exposes only the 2.5 s value. [34]
- **Calibration note.** It claimed hosted dashboard defaults of 300 ms / 2 words / 300 s. This agent shows 900 / 1 / 90 (notes), the open-source values; consistent with the API lane, not with that note, subject to the origin caveat. [55]

---

## 6. Tools, knowledge base, integrations, workflows

- **Tools** [18]: four presets and a custom function (manual or from cURL). No warm/cold transfer option is visible on the card; transfer configuration was not opened, so the prior "transfers are cold" claim is untested here. Knowledge bases attach on the Intelligence tab, not here.
- **Knowledge base** [37]: modal with Upload PDF (`.pdf` only) or Add URL, drop zone, Language Support (English default), one button. No name field, no stated size or page limit; the Upload PDF button looks enabled with no file. The table exposes `RAG ID`, Source, Type, Created, Status (async ingestion), Delete. API and MCP buttons beside Add. 
- **Integrations** [38]: 18 cards. Telephony: Exotel, Plivo, Twilio, Vobiz. LLM: Azure OpenAI, OpenAI, OpenRouter, Perplexity, Custom LLM. TTS: Cartesia, ElevenLabs, Rime, Sarvam, Custom TTS. STT: Deepgram, Sarvam. Tools: Ai Sensy, Cal.com. Plus an AWS Marketplace listing ("draw down your AWS committed spend"). No CRM, Sheets or Zoho card; no connected-status badge; most cards have no description. Confirms the prior "no native CRM".
- **Workflows** [39]: canvas with a Start node (one "Next" output), an Inspector, and a toolbar (Add node, magic wand, undo, redo, search, history, settings, validate, Publish). Nodes: CORE Agent ("places an outbound voice call ... and waits for its outcome"), Extraction ("must sit immediately after the call it reads"), Wait, Retry ("the only node allowed to close a cycle, and the only retry mechanism"), Condition ("branch on a text expression"); EXTERNAL API request, Callback ("pauses the journey until your system calls this node's URL, or the wait times out"), AiSensy WhatsApp; FLOW End ("its label becomes the termination reason"). Matches the API node catalogue (Wait is the API `time` node). Condition on "a text expression" suggests no visual rule builder (inferred). The canvas opens at 175 % zoom and the Inspector clips the Start node.
- **Custom function and web search:** unconfigured; no secrets or endpoints captured.

---

## 7. Testing and quality

Seen: `Get a call from agent` (phone call; on trial only to a verified number; dropdown options unseen), `Send test` for the webhook, a `Test` button in the Extraction Library, the Debugging page (execution ID only), Call History (agent and batch scoped), Reports. **Not seen:** any simulation, eval, test-suite, scorecard or QA surface in the sidebar; no in-builder chat test; no web-call button (prior reports found a web-call SDK, but the dashboard's test path is the phone call). Graph Agent was not captured, so a hidden surface there is possible. The prior reports say Bolna is hiring for LLM-as-judge QA, and the cross-vendor report says Vapi has 51 of 143 operations on evals/simulations and Retell has built-in AI QA, so Bolna is thinnest here of the three. [40]

Ask Bolna is the only assistant: read and act over the account, history rail, four suggested prompts, header sparkle duplicate. It is not seen building an agent end to end. [41]

---

## 8. Telephony and numbers

- **My Numbers** [42]: nine columns including monthly rent, unlink, and **Verify on Truecaller** per number. No price anywhere before Subscribe. No import-number control (BYO numbers arrive through Integrations and SIP trunks).
- **Buy dialog** [42] [43]: country, optional digit pattern, phone-number select, Subscribe. Helper text and placeholder are US examples (615 / 1615XXXXXX). Selecting India inserts a red "No compliance applications found. Create one" row and a provider select showing Plivo (Vobiz is the other, per notes and the Vobiz KYC tab); Subscribe stays disabled with no tooltip. The India gate appears only after the country is picked, as an error, not a checklist. Number-series choice (140/160) is not visible; whether the pattern field accepts it is unknown.
- **Vobiz KYC** [44]: "Required to purchase VoBiz phone numbers in India. Verifies PAN + Aadhaar (persons) or PAN + GSTIN (companies)"; Start KYC redirects to a VoBiz-hosted page; no stages or timeline. **Compliance Settings**: Application Name, First Name, Last Name, Company Name, Tax ID Number, Status, Date added, Delete.
- **SIP Trunks** [45]: Trunk, Carrier IPs, Health, Numbers, Active calls, Last call; empty state explains purpose; Ask Bolna offers "Create a SIP trunk for Twilio". Trunk create dialog not captured; no carrier IPs or credentials captured.
- **Verified numbers** [45]: Phone Number, Status, Created, Remove; the trial banner links here; the verification method (OTP or call) was not captured.

---

## 9. Campaigns and batches

**Campaigns** (Beta) [46]: two tabs (Campaigns, Executions); filters All workflows / Any status / Any kind; stat strip (Campaigns, Active, Contacts, Still to dial). **New campaign** is a single modal, not a stepped wizard, with 3 inputs: Campaign name; Workflow plus Version (Version stays disabled until a workflow is chosen); Contacts upload (CSV or JSON, up to 32 MB, 150,000 rows, a Column template link). Dependent fields are greyed with explanatory placeholders ("Pick a workflow and version first"). No Create or Cancel button is visible in the initial state.

**Batches** [47]: pick an agent first (Upload Batch is disabled until then, with no tooltip); template-sheet link; API and MCP buttons. The Upload Batch dialog, schedule and retry fields were not captured.

**Scheduling and retries:** not in the campaign modal. They live in workflow nodes (Wait, Retry, Condition), in agent-level Auto Reschedule and the 9:00 AM to 9:00 PM window, and in the batch API (prior). 

**Compliance fields (consent, DND, DLT, calling windows)** [48] [49]: **none in the campaign modal.** The notes record no consent or DND column in the template (the template column itself is notes-only and it is unclear whether it is the batch or campaign one). The only calling-window control is per agent, with whole-hour start/end selectors, defaulting to 9:00 AM to 9:00 PM; whether enforcement is on by default was not seen. This default matches Bolna's docs (9 to 21) rather than ledger CMP-27 (10 to 21). Compliance is otherwise account-level: compliance applications, Vobiz KYC, and a **Violations** tab ("Reports forwarded from telephony providers regarding call violation"; User Email, Execution ID, Agent ID, Sub Account, Reported Date, From, To, Call Date, Status, Actions). That is reactive.

**Where it was blocked:** (1) Campaigns needs a published workflow, none existed; (2) trial dials verified numbers only; (3) Upload Batch needs an agent selected and was not exercised. No contact upload was done. [47]

---

## 10. Analytics, call history, reporting

- **Analytics** [50]: Metabase iframe. Selects: Main Dashboard, All agents. Tabs Calls, Top Agents (second tab uncaptured). Date chip defaults to "Previous 7 days". Chart titles in the Calls tab: Daily Call Volume by Status, Completed Calls by Hangup Initiator, Completed Calls by Hangup Reason (all "No results"). No cost, latency or outcome chart title appears. Download icon. Nested scrollbars.
- **Call History** [50]: agent and batch selects, Refresh, Stop Queued Calls, Download Records, search by Execution ID (field-type select, options unseen), 20 rows per page. Table headers are blank when empty, so the call-record fields are not visible. Batch control (Stop Queued Calls) lives here.
- **Reports** [50]: async job table (Triggered, Entity, Filters, Rows, Status, Requested by, Size, Actions); "Large agent and batch reports will appear here."
- **Debugging**: execution ID only; no recent list.
- **Not seen:** transcripts, recordings, per-call cost breakdown, raw logs, progression/latency per turn (prior reports say these exist in the API). Whether the dashboard shows them is unknown.

---

## 11. Billing, credits, plans, price display

- **Header** [25]: `$0.060/min` plus a three-segment bar whose proportions match the Account table (3.5 : 0.5 : 2 of 6). No per-segment dollar value.
- **Account > Pricing Information** [26]: Voice agent cost 3.5, Telephony 0.5, Bolna Platform 2, Total 6 cents per minute, pulse 30 s on each; the "Price" and "per minute" columns are identical. "Show models" expands the 38 included model chips. Concurrency: 0 ongoing / 2 total, with a "concurrency tiers" link and no upgrade control.
- **Recharge dialog** [28] [29]: tiers $15, $60, $150 (pre-selected), $300 (+10 %), $600 (+15 %: 11,500 min, ~Rs 4.98 = $0.052), $1,500 (+20 %: 30,000 min, ~Rs 4.77 = $0.050), $3,000 (+33 %: 66,500 min, ~Rs 4.30 = $0.045), custom $10 to 5,000. For $150: base and effective both $0.060 (~Rs 5.72), 2,500 minutes. Only the top three tiers show minutes and rate. A "Pilot" tab (New) and an Enterprise "Book Meeting" card; Stripe. Recomputing shows the bonus is extra credit at the flat rate ($600 x 1.15 / 0.06 = 11,500 etc.); the implied rupee overlay is about Rs 95.3 per dollar. Billing currency is USD (Invoices: "Total amount (USD)").
- **Trial** [30]: $5.00 = 83 minutes (5 / 0.06); the red minutes chip appears on saved-agent pages only.
- **Invoices** [51]: filters (ID, status, item type, date), eight columns, empty. No auto-recharge, spend cap or alert setting was seen.

**Implication for the prior open question:** the displayed 6 cents already includes the 2 cent platform line, so the PAYG all-in is about Rs 5.72, not Rs 8.0; unverified until an invoice. [27] **The 30 s pulse** (telephony and platform, not only voice) means a short call or voicemail costs at least half a minute's rate (about 3 cents, about Rs 2.9 at the displayed rate; inferred), which matters for no-answer and voicemail-heavy telecalling. [52]

---

## 12. Team, org, security, API keys, compliance settings

- **Team Members** [51]: "This is a paid feature. Please schedule a call ... or email us at [email redacted]." Invite Member looks active; no member list (even the owner is absent). Sales-led, not self-serve.
- **API Keys** [51]: one key, identifier `vp-teardown`, value [secret redacted], created by team@vyakti.ai, Last Accessed `20th Oct, 2026`, Created `2 hours ago`, a delete icon. No scopes, no copy or reveal control, no expiry. (The last-accessed date is consistent with the earlier API lane's use of this key.)
- **Org** : workspace switcher reads `bolna.ai / Active` for our account (cause unknown: a default tenant name or a vendor-labelled workspace); options not captured. The Violations table has a `Sub Account` column, so sub-accounts exist (Enterprise-only per prior).
- **Compliance Settings**: telephony KYC applications, not content guardrails; none in the builder (notes: no content-guardrail section found).
- **Not seen:** SSO or SAML, audit log, data-residency control, retention setting, webhook signing. The "India routing" label on every agent has an unread tooltip. [57]
- **Theme:** dark-mode toggle (state unknown).

---

## 13. UX quality ledger

**Excellent (VP must match or beat)**

| Item | Screenshot | One-line evidence |
|---|---|---|
| Persistent cost-per-minute header with a component bar, visible on every tab | 16 | Cost bar stays above the tab strip while Engine is open |
| Transparent price table with pulse and included models | 35 | 3.5 + 0.5 + 2 = 6, 30 s pulse, 38 model chips |
| Per-language settings and prompt chips | 14 | "Settings for" chip row; same chips on the Canvas (20) |
| Voice picker with search, gender chips, preview, "Add new voice" | 19 | ~100 rows with play buttons |
| Dependent fields disabled with explanatory placeholder text | 22 | "Pick a workflow and version first" in the dropzone |
| Best empty state: icon, definition, CTA | 10 | "A workflow chains calls, extractions and follow-up actions ..." |
| SIP trunk empty state and health columns | 05 | Health, Active calls, Last call |
| API and MCP buttons beside list pages | 09 | Same pair on Batches, My Numbers, Knowledge Base |
| Workflow node descriptions state the contract | 23 | "Retry ... the only retry mechanism" |
| Recharge with INR equivalent, bonus badges, one-click default | 40 | $150 pre-selected, "~Rs 5.72/min", Stripe |
| Vobiz KYC states document needs before the click | 36-account-Vobiz-KYC | "PAN + Aadhaar (persons) or PAN + GSTIN (companies)" |
| Ask Bolna with read and write prompts | 38 | "Create a SIP trunk for Twilio" |
| Webhook Send test beside the config | 18 | Send test button in the card |

**Clunky**

| Item | Screenshot | One-line evidence |
|---|---|---|
| Two banners eat about 90 px and the sidebar clips | 00 | Trial and promo banners above the title; scrollbar in the sidebar |
| No latency or per-option price in pickers | 14 | Provider, model, voice selects show names only |
| Reply controls without consequence | 16 | Endpointing and Linear delay with no sum or text |
| Floating bubble covers fields | 13 | Temperature value clipped; also hides Send test (18) |
| Voice popup anchored to viewport top over the header | 19 | Popup sits above the wallet chip, not by the select |
| Truncated names | 12 | Agent name "VP-teardown-synthetic-minima"; voice "Tripti - Calm and ..." (14) |
| Unit mixing (cents, dollars, approximate rupees) | 34 | Cents table, dollar header, rupee dialog (40) |
| Compliance surfaces only after an error | 25 | Red "No compliance applications found" appears after choosing India |
| US-centric buy dialog | 24 | Placeholder "Pattern: 615" |
| No price before Subscribe | 24 | No rent or setup fee in the dialog |
| Inconsistent empty-state wording | 02 | "No campaigns match." vs "No data available." (04) vs "No records found" (06) |
| Core feature labelled Beta | 02 | Campaigns badge |
| Invite Member looks active but is gated | 36-account-Team-Members | Wall appears as text in a box |
| Upload PDF enabled with no file | 39 | Blue primary with empty drop zone |
| Mixed date formats | 28 | "2 hours ago" beside "20th Oct, 2026" |
| Name and capitalisation drift | 36-account-Vobiz-KYC | Tab "Vobiz KYC", title "VoBiz KYC"; Call History titled "Agent Conversations" (06) |
| Unlabelled red minutes chip, only on some pages | 12 | "83" with a clock icon, absent on 02 |
| Workflow opens at 175 % with Inspector clipping Start | 23 | Start node cut at the panel edge |

**Broken or transient**

| Item | Screenshot | One-line evidence |
|---|---|---|
| Cost header renders `~ $` and an empty bar, then jumps | 29 | Loading state; Welcome Message Delay input missing |
| Agent editor shows grey skeleton with no spinner | 00 | Skeleton only, no text |
| No unsaved-state indicator | 21 | Toggles on; "Updated 5 minutes ago"; no draft marker |
| Analytics seen only as a spinner or "No results" | 07 | Capture state; no data to judge |

---

## 14. What the dashboard adds to prior research

**Confirmations** [56]: top-up floor 4.51 cents (3,000 / 66,500); AWS Marketplace listing; Truecaller verification per number; Metabase analytics; workflow nodes match the API catalogue (Wait = `time`, API request = `api`, plus AiSensy WhatsApp and End); no CRM card; Ask Bolna, Workflows, Campaigns Beta; 500 / 900 / 1 stored defaults; the English-length Hindi check-in; Extraction Library shows only Call Summary, so the auto-generated Call Success / Call Completion judges remain hidden from the builder (Ask Bolna's prompt "What dispositions are configured on my calls?" implies they exist).

**Contradictions (prior claim quoted)**

| Prior claim | Dashboard shows | Claim |
|---|---|---|
| "Telephony is billed per minute, rounded up. The platform fee is charged per minute of call duration." (account-phase report, section 8) | 30 s pulse on telephony and platform alike | [52] |
| "Number KYC needs a CIN and accepts Pvt Ltd companies only." (BOL-45 / structured result) | Vobiz KYC verifies PAN + Aadhaar (persons) or PAN + GSTIN (companies); table has Tax ID Number, no CIN column | [53] |
| "telephony: Vobiz; LLM: Azure gpt-4.1-mini; office ambient noise." (BOL-25) | Plivo; provider openai gpt-4.1-mini; Ambient Noise None (STT and TTS match) | [54] |
| "the open-source defaults differ from the hosted dashboard defaults (call_terminate 90 vs 300 s, incremental_delay 900 vs 300 ms, interruption words 1 vs 2)" (calibration note) | 900 ms, 1 word, 90 s (notes) | [55] |
| "all-in ... PAYG: INR 6.1 if the fee is included, 8.0 if added" (BOL-36) | Displayed 6 cents includes the 2 cent platform line, supporting the "included" branch | [27] |
| "Everything said while the welcome message plays is also dropped" (account-phase headline 3) | Dashboard exposes an "ignore speech before welcome" toggle, OFF by default | [36] |

The last three carry the caveat that the saved agent's creation path is unknown.

**Only the dashboard showed:** the cost bar proportions and the 30 s pulse on all three lines; the "83 minutes" trial conversion; the 22 add-language options and the absence of Hinglish; the voice picker's contents (romance-register voices, mixed-language names, no language column); the 38 included-model chips; the workflow node contracts (Retry is the only retry mechanism, Condition is a text expression, Extraction must follow its call); the campaign modal limits and its three inputs; the Buy dialog flow and its India compliance row; Vobiz KYC wording; the Team paywall; the recharge bonus structure; the PDF-only knowledge modal; the absence of any displayed latency; per-page API/MCP buttons.

**Still unknown after the dashboard:** the draft agent's own defaults; Auto Build; Graph Agent; "India routing"; whether the timing window is enforced by default; anything inside a call record. [57] [58]

---

## 15. For VP

### Match (parity floor)

1. Persistent per-minute cost header with a component bar on every builder tab.
2. A price table with pulse, components and included models.
3. Per-language prompt, voice and transcriber settings.
4. Searchable voice picker with gender filter and preview.
5. Tool presets plus custom function from cURL; webhook with Send test and status filter.
6. Workflow canvas with Wait, Retry, Condition, API, Callback, WhatsApp and End nodes.
7. An assistant that reads and acts over the account (Ask Bolna is parity for the LLM-native directive, not a wedge).
8. API and MCP shortcuts on list pages.
9. Async report export, SIP-trunk health columns, per-number Truecaller verification, invoices, recharge with INR equivalents.

### Beat (specific design)

1. **Show the reply gap.** Next to the turn-taking controls, show the predicted gap (endpoint + hold + model) and offer plain-language presets, since Bolna's 500 + 900 ms is invisible. Task: time to a configuration with a p50 reply gap under target.
2. **Put compliance in the campaign.** Consent source, DND/NCPR status, calling window and retries as first-class fields on the contact and the campaign, on by default; Bolna keeps them at account (reactive) and agent level.
3. **One outbound system.** A campaign from a contact list and an agent, with no mandatory workflow and no Beta label; Bolna needs publish-a-workflow first.
4. **Show latency and price in every picker.** Per-option measured p50 first-audio from India and a rupee cost; mark any option that leaves the flat price.
5. **Bill in INR with GST** and show the number price and series before purchase; show per-component rupees on the bar, not cents/dollars/rupees mixed. Context: the ambition is about Rs 2 per minute (directive.2026-10-17.price-target) against Bolna's displayed Rs 5.72 PAYG and Rs 4.30 best tier.
6. **Visible, editable outcome judges**, set up by chat, feeding the v2 learning loop.
7. **Unsaved-state and version visibility**, plus a built-in test and simulation surface (Bolna shows none).
8. **A language-aware voice picker**: filter by language and register, no romance voices in business catalogues, a language column, and a code-mixed Hinglish option instead of an unexplained "India Multilingual".
9. **Fix the short-call economics**: a pulse shorter than 30 s, or a visible minimum-charge note, for voicemail and no-answer calls.

### Avoid

Two permanent banners; a vendor-named tenant; US defaults in an India dialog; compliance revealed only as an error; USD-only invoicing for Indian buyers; unlabelled chips and badges ("Preferred Price", "India routing", the red 83); a floating help bubble over inputs; core outbound marked Beta; a gated button that looks active; an upload button enabled with no file.

### Open questions only live calls (or one more dashboard pass) can answer

Live calls:
- Default reply gap p50 and p90 on an Indian handset, against the 1.4 s floor.
- Whether short Hindi replies ("haan", "nahi", "ruko", "bas") said over the agent are dropped.
- What happens to speech during the welcome with the toggle off and on.
- Voicemail detection time and accuracy on Indian operator messages.
- Language hold with `India Multilingual` and with per-language chips.
- What the Realtime engine option does to cost and gap.
- Billed cost for a 20 s and a 40 s call under the 30 s pulse, and whether the platform line appears separately on an invoice.
- What a failed call shows in Debugging and Call History.
- What the transfer sends to the human, and the webhook payload.

One more dashboard pass (no live call needed):
- The New Agent draft's Engine, Intelligence, Languages and Calling defaults.
- The Response Rate preset options and the Voice engine options.
- The Get-a-call dropdown, Graph Agent, Auto Build and Organisation pages.
- The "India routing" and "Preferred Price" tooltips.
- The Upload Batch, Create trunk, Verify phone and compliance-application dialogs.
- The Pilot tab and Top Agents tab.
