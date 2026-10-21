# Dashboard walkthroughs: cross-vendor synthesis (2026-10-21)

**Scope.** Six vendor dashboards captured by Instinct on 2026-10-21 on the team@vyakti.ai trial accounts: Vapi, Retell, Bolna, ElevenLabs, Sarvam, Exotel. No live call was placed, no number was bought, no campaign was launched, no CSV was uploaded. Inputs: the six vendor analyses, the screen notes in `data/walkthroughs/<vendor>/screens/`, `research/2026-10-20/teardown/SYNTHESIS.md` (W1-W10, 21 must-be items) and `research/2026-10-20/account-phase/SYNTHESIS.md`. This lane re-opened **84 screenshots** (listed in the appendix), checked every best-in-class and worst-in-class call below against the pixels, and corrected nine analyst claims (section 6 and appendix). No vendor site or API was touched.

**Main-loop check (2026-10-21, after this lane).** Three decision-critical claims were re-opened against the pixels by the main loop:
- **Holds:** Retell's batch window defaults to "00:00-23:59, Mon-Sun" (retell 25-calls-can-run-shot). The same form also defaults to Send Now, has no agent selector, and leaves Send disabled with no reason.
- **Holds:** Bolna's pricing table is 3.5 + 0.5 + 2 = 6 cents with a 30 s pulse on every line, and concurrency is 2 (bolna 34-account).
- **Holds, with a caveat this lane did not state:** ElevenLabs shows "0 active tools" with all 9 system tools off (elevenlabs 42-agent-tools). That agent is the pre-existing "[Eval] Synthetic Clinic Demo", made during account setup by an unknown path; the 2026-10-20 API lane only read it. So "End conversation and Voicemail detection off" is the state of that agent, not a proven default for every dashboard-created agent. It has the same status as Bolna's saved agent below. Must-be item C (bounded defaults) does not depend on it.

**Grades used in this file**

| Tag | Meaning |
|---|---|
| [O] | Observed in a screenshot this synthesis opened |
| [Ot] | Observed in a text capture, as read by the vendor analyst. The text captures for Vapi, Retell, Bolna and ElevenLabs are on Drive only, so this lane did not re-read them |
| [N] | Instinct's notes only (no screenshot or text capture) |
| [D] | A number the vendor displays; not measured by us |
| [API] | 2026-10-20 API read-back of the same agent |
| [I] | Inferred from cited observations |
| [U] | Unknown |

File references are `vendor file.png`; Sarvam files drop the `sarvam-` prefix only where unambiguous. Phone numbers and emails other than team@vyakti.ai are written [phone redacted] / [email redacted]; secrets as [secret redacted].

---

## 1. Headline: what the dashboards add to the public and API phases

1. **Compliance is absent at the point of dialling in 6 of 6 dashboards.** No campaign or batch form has a consent source, DND/NCPR scrub or DLT field [O] (vapi 83-campaign-create, retell 24/25, bolna 22, elevenlabs 33/35, sarvam 25/26 step 1, exotel-10). Window defaults: Retell 00:00-23:59 Mon-Sun [O retell 25]; Bolna 09:00-21:00 set per agent in whole hours [Ot]; ElevenLabs a start time and timezone only [O elevenlabs 35]. The only call-category field anywhere is Exotel's Transactional vs Promotional call type, and it is notes-only [N]. This is the incumbent side of W1, now seen at the point of use, not only in docs and APIs.
2. **No dashboard shows a reply gap.** Turn-taking units differ: seconds (Vapi End-of-Turn Wait 1.5 s, range 0-3 s [O vapi 80]), milliseconds with no sum (Bolna 500 + 900 ms [O bolna 16]), an enum (ElevenLabs Eagerness Normal [Ot]), an added-wait slider whose handle sits at the far right beside "0ms" (Retell [O retell 09]), or nothing visible (Sarvam, Exotel). 0 of 6 ship an editable Hindi or Hinglish backchannel or interruption list; Vapi labels smart endpointing English-only [Ot]. The Hinglish turn-taking beat stays a hypothesis (risk.2026-10-20.acct-synthesis-turn-taking-beat-unproven).
3. **Headline numbers are component sums that leave out telephony and the turn wait.** Vapi ~1,530 ms = 410 + 690 + 430 and ~USD 0.09 = 0.05 hosting + components [O vapi 33, I]; our measured Vapi demo-agent clean-turn p50 was 2,319 ms (2026-10-17, different agent). Retell USD 0.134 = 0.055 + 0.015 + 0.064 [O retell 09, I]. Per-option metrics exist only at Vapi (latency, cost, score) and ElevenLabs (latency range, USD/min, USD/msg); Retell shows price only; Bolna, Sarvam and Exotel show nothing per option [O].
4. **No walkthrough reached a ring on an Indian line; each stopped at a different gate** [O]: Vapi US-only, inbound-only free numbers (vapi 06c); Retell Persona identity check before any country or price (retell 30); ElevenLabs import-only with Region defaulting to Singapore under +91 (elevenlabs 34); Bolna compliance application plus Vobiz KYC, which accepts persons (bolna 25, 36-account-Vobiz-KYC); Sarvam rent via Vobiz or bring-your-own with 7 providers, flows unopened (sarvam 23); Exotel KYC plus payment behind GST details (exotel-01, [N]). W7 is untested on both sides.
5. **0 of 6 offer Hinglish or code-mixed as a language option.** Indic depth varies from Sarvam (11 Indic languages with native-script glyphs, Indic number reading, 199+ named voices [O sarvam 08, Ot]) and Bolna (22 add-language options plus Hindi [O bolna 20]) to Retell (63 locales, 0 Indian voices, accent filter American/British/Mexican only [O retell 10]) and Vapi (5 Indian languages plus Nepali in the picker against 12 Indic codes in its API [Ot]).
6. **Several defaults hold lines open or raise spend without a buyer choice.** Retell burst ON (+USD 0.10/min) [O retell 5x-settings], silence hang-up 10 min and max call 1 h [Ot], data "Everything, Keep forever" [O retell 13]. ElevenLabs: all 9 system tools OFF including End conversation and Voicemail detection [O elevenlabs 42], silence end-call Disabled [Ot], bursting on [API]. Exotel max duration off [N]. No spend cap was seen in any dashboard (Retell's Budget Setting was not opened).
7. **Dashboards write state on a click or hide it.** Vapi published a Transfer Call tool on a menu click and autosaved a draft on a dropdown choice [O vapi 57, 80]; Bolna has no unsaved marker [Ot bolna 21]; Sarvam has no save control [O sarvam 03]. Vapi Next and Retell Send are disabled with no reason [O vapi 83, retell 24]; Sarvam's inline "Commit version" gate [O sarvam 26] and Bolna's "Create one" link [O bolna 25] are the counter-pattern.
8. **A chat assistant ships in 5 of 6 dashboards**: Vapi Composer, Retell Conductor (30 free credits per day [O retell 71]), ElevenLabs Architect (Alpha, "free to use during the alpha, through October 2026" [O elevenlabs 8-architect]), Sarvam Genie, Bolna Ask Bolna (reads and acts [O bolna 38]). None was exercised. Chat setup is parity, as the public phase said.
9. **Cross-call memory is visible on two dashboards.** Retell: "Use contact's memory" ON by default, "Save conversation to memory" OFF at USD 0.005 per run [O retell 09, 76]. ElevenLabs: a Memory (Alpha) tab on the knowledge base [O elevenlabs 7-knowledge-base], where the API returned 403 on 2026-10-20. The v2 bar is a per-contact text brief.
10. **Prior claims change** (section 6): Bolna's 6 cents already includes the 2-cent platform line with a 30 s pulse on all three lines [O bolna 34]; Bolna number KYC accepts persons; Retell shows fixed roles on a free trial and defaults batch schedules to Asia/Calcutta; ElevenLabs' dashboard default LLM is DeepSeek Flash 4.1, not gemini-2.5-flash; Sarvam's Business plan is purchasable; Vapi's dashboard Indic list is narrower than its API.

---

## 2. Dimension-by-dimension UX benchmark

Each section gives the best competitor with evidence, where each falls short, VP's design, and where VP's own layer sits (emotional voice, memory, personalisation, later self-learning). "Steps" are inferred from the captures, not timed with a human.

### 2.1 First run and onboarding

**Best: Retell for guidance; Sarvam for India relevance.**
- Retell [O retell 71]: a 7-step "Getting started" checklist (Build your first agent, Run a test call, View transcript and analysis, Add a phone number, Make your first real call, Invite a teammate, Try advanced functions) with dependent steps locked and a preview per step ("Make a test call in your browser to hear your agent in action"); Conductor chat with chips Build agents / Test & debug / Analyze calls / QnA. The browser test needs no number [O retell 09: Test Audio / Test LLM, Run Test].
- Sarvam [O sarvam 02]: the Agents page hero is a prompt box "What should your voice agent do?", with filter chips All / Collections / Reminder / Recovery / Lead qualification and templates Appointment, Sales discovery, EMI Collection.

**Steps to a browser-testable agent [I]:** Vapi 3 steps + 1 required field; Retell about 4 clicks, 0 required fields; ElevenLabs 4 clicks, 1 field; Sarvam 3 actions, 1 field; Bolna 5-7 steps and a verified phone (its test is a phone call); Exotel ships a pre-provisioned demo agent but its test needs a phone and Web Call is "Coming soon" [O exotel-02].

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Vapi | Welcome form reappears until saved; nine captures (20-28) show this wall instead of the named page; seeded demo agent is a US clinic scheduler | [O] vapi 01, 24-billing |
| Retell | Tour "Wait for the test panel to finish loading" sits on every page; the checklist overlays the flow-builder palette and the workflow canvas; Create defaults to Conversational flow although Single prompt is labelled "Easy to start" | [O] retell 41, 43, 76, 80, 03 |
| Bolna | No checklist; two banners take about 90 px of 720; test only to verified numbers | [O] bolna 01 |
| ElevenLabs | Publish greyed with no reason; template library US-shaped (FDCPA, 401k) | [O] elevenlabs 44, 61; [Ot] |
| Sarvam | First screen is a what's-new modal over a blurred page | [O] sarvam 01 |
| Exotel | Activation guidance is one green banner sentence with five linked steps; product spans three shells | [O] exotel-01, exotel-02, [Ot] |

**VP design.** First screen is the chat: pick a post-sale job (renewal reminder, pre-due EMI, appointment reminder, onboarding follow-up), a language mode and a voice; within the same screen a browser call starts in that language. The checklist lives in a collapsible rail and never overlays content; tours belong to one page. Any step that needs KYC states documents, time and cost before it starts. Target to measure: sign-up to a Hinglish browser call in under 3 minutes for a first-time user (5-user sessions).

**VP layer.** Emotional voice is the first-run moment: the user hears 2-3 Hinglish voices before choosing (directive.2026-10-19.hear-before-choose). Personalisation: business name and product pre-fill the brief. Memory and self-learning: none at first run; the first test transcript seeds the first test case.

### 2.2 Agent creation (form vs chat vs copilot)

| Vendor | Describe/chat | Templates | Blank | Copilot after creation | Evidence |
|---|---|---|---|---|---|
| Vapi | Describe box + Inbound/Outbound/Support cards | 4 (Create Assistant menu) | yes | Composer in every header (Build/Debug/Analyze/Test modes, "Ask for approval") | [O] vapi 02; [Ot] |
| Retell | "Generate from prompt" (Suggested) | 28 in 10 tabs | Build from scratch | Conductor, "Build with AI" button | [O] retell 03, 09 |
| Bolna | none seen (Auto Build not visible) | none seen | draft preloaded | Ask Bolna (read and act; not seen building) | [O] bolna 01, 38 |
| ElevenLabs | Create with Architect (Beta) | 45+ with a live workflow preview | Blank Agent (1 field) | Architect (Alpha) with a 10-item go-live checklist | [O] elevenlabs 36, 02, 8-architect |
| Sarvam | Prompt box as page hero | 3+ India vertical | Create from scratch | Genie docked in the builder; Review agent; Improve with Genie | [O] sarvam 02, 03, 08 |
| Exotel | not captured | not captured | not captured | none | [Ot] |

**Best: Sarvam for chat-first creation** (the prompt box is the primary action and Genie stays docked beside every builder tab [O sarvam 03]); **ElevenLabs for templates** (a graph preview with node prompts and branch conditions before "Use template" [O elevenlabs 02]). Output quality of every copilot is [U]: none was run.

**Where they fall short.** ElevenLabs' template nodes carry sentence-shaped opening lines ("Open warmly: 'Hey, this is Jamie from support...'") [O elevenlabs 02]; our inherited law says sentence-shaped prompt text gets recited. Bolna shows no describe path. Exotel's creation path was not captured. Vapi's and Retell's template sets are US-shaped [Ot].

**VP design.** One creation path: a chat that takes the job, a sample CSV header and the agenda, then writes a structured brief (section 2.3) and shows it as a diff with a one-line reason per section. Templates are starting chats with India post-sale jobs, not forms. Every copilot action exists on API and MCP (W10). The wedge must be measured, not claimed: a copilot-built agent passes the standard test suite on first build.

**VP layer.** The copilot asks for the emotional register (warm, respectful, elderly-paced) and picks voice style from it; asks which contact fields personalise the call; asks what she should remember across calls (memory slot, v2); later proposes edits from failed calls (self-learning, v2).

### 2.3 Instructions and prompt editing

**Best: Sarvam** [O sarvam 03]: Greeting separate from Instructions, a Translations button, "/" commands and "@" mentions for variables and tools, a "Review agent" pill and Genie. Sarvam's own template prompt, legible in the first-run modal [O sarvam 01], uses Persona / Environment & Situation / Objective / Speaking Style with "Under 25 words per turn; one question at a time" and an AI line ("If asked whether you are AI: say you are a virtual assistant"); this matches what VP measured with brief v2 (33 to 20 words per turn). **Runner-up: Bolna** [O bolna 20]: a sectioned Canvas, per-language prompt chips with Add Language, token counter, AI Edit (Beta), Browse Modules.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Vapi | Visual/Code/Normal modes, Generate and a token counter, but no budget against a cap | [O] vapi 51; [Ot] |
| Retell | Empty prompt with placeholder only; 814 tokens used before any text [D] | [O] retell 09 |
| ElevenLabs | Plain textarea with "You are a helpful assistant." | [O] elevenlabs 61 |
| Bolna | Per-language prompts, but no lint or budget | [O] bolna 20 |
| Sarvam | No save control or unsaved marker; only "v1 · Draft" | [O] sarvam 03 |
| Exotel | System prompt locked behind one sentence about "strict guardrails"; the editable instruction is raw markdown in a nested scroll box on a sub-agent named "tool Calling Agent" | [O] exotel-15, exotel-16 |

**VP design.** A structured brief editor: identity with a locked disclosure line; situation; an agenda ledger (must ask / nice to know / never say); speaking-style limits (words per turn, question endings). A token budget bar against the compile cap that blocks publish on overflow (inherited law: truncation is silent). Must-fire rules placed last by the compiler and shown as such (position is mechanism). A lint that flags quoted lines the agent could recite. Per-language variants with Hinglish as default. A "hear it" button that speaks the greeting in the chosen voice. Copilot edits appear as diffs.

**VP layer.** Speaking style maps to voice expressiveness; `{{contact.*}}` variables are validated against the CSV contract (personalisation); `{{memory.*}}` slots are visible but disabled in v1; v2 suggestions from evals appear with their evidence.

### 2.4 Model, voice and transcriber choice, and trade-off display

**Best: Vapi** [O vapi 33, 51; Ot 52, 53]: three pipeline cards (Transcriber, Model, Voice) each showing latency, cost and one quality score (WER, Intelligence, Humanness); a searchable list per stage with the same three numbers on every row; four presets (Balanced, High Intelligence, Ultra Fast, Cost Saver); headline cost and latency bars coloured by stage. **Runner-up: ElevenLabs** [O elevenlabs 61]: LLM rows grouped by provider with a latency range, USD/min and USD/msg, and a "Detailed costs" footer.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Vapi | Headline excludes the 1.5 s wait and telephony [I]; scores have no scale; newer rows lack metrics (Sonic 3.6 rows show price only); GPT-4.1 shows 690 ms against our India first-token median of 1,765 ms | [O] vapi 33, 51; [Ot] |
| ElevenLabs | Latency ranges up to about 10x (Claude Sonnet 5.5 "844ms - 8.93s", Haiku 5.5 "476ms - 8.66s"); per-minute price 1.7-2.3x below its own API calculator, assumption unstated [I]; ASR locked to Scribe v2 Realtime by Turn V3; voices show no price or latency | [O] elevenlabs 61, 44 |
| Retell | Price per model row only; no latency or quality; voices and languages carry neither | [O] retell 09, 10 |
| Bolna | Names only in every select; one header number ($0.060) | [O] bolna 14, 01 |
| Sarvam | No LLM or ASR choice; temperature "Balanced" with no number | [O] sarvam 07 (per analyst), 03 |
| Exotel | Collapsed rows showing the current name only | [O] exotel-15 |

**VP design.** Every row shows India-measured p50 and p90 (with n and date), INR per minute, Indian languages supported and a 5-second Hinglish sample. Presets named by job outcome. The agent header shows an all-in INR per connected minute that includes telephony, pulse rounding and the turn wait; any vendor-displayed number is labelled as such. The combination that actually ran is stored per call (no mid-call swap; asset.voicelab combination identity).

**VP layer.** The voice is chosen by ear here: cards play the same Hinglish line in 3 emotional registers. Personalisation: voice and pace per segment (for example slower for elderly customers). Self-learning (v2): voice-by-segment comparisons against outcomes.

### 2.5 Indian languages and Indic voices

**Best: Sarvam** [O sarvam 08]: 11 Indic languages with native-script glyphs in the picker, Hindi locked as starting language, "Switch language during call" ON, "Output numbers in Indic" ("'500' → 'paanch sau'"); voice catalogue of 199+ distinct names with gender, model and 11 language filters and job tags [Ot voices.txt]. **Runner-up: Bolna** [O bolna 20, 14]: 22 add-language options (Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Urdu, India Multilingual and others) with per-language chips for prompt, voice and transcriber.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| All 6 | No Hinglish or code-mixed language option | [O]/[Ot] |
| Sarvam | Odia in the filter with 0 voices; Malayalam only as a Hindi mix; Hindi and English hold 137 of 196 parsed voices; "AI Companion", "Warm Night Companion" and "Therapist Voice" in a business catalogue | [Ot]; voices.txt checked locally |
| Bolna | "India Multilingual" listed beside single languages with no explanation; voice list under the Hindi chip not filtered by language and has no language field; two romance-register voices | [O] bolna 20, 19; [Ot] |
| ElevenLabs | 88 languages incl. 14 South Asian, but the visible library voices are English; the API's hinglish_mode has no visible control | [Ot] |
| Retell | 63 locales, Hindi at #13, no Telugu, Bengali, Gujarati, Malayalam, Punjabi; 21 platform voices, none Indian | [O] retell 10; [Ot] |
| Vapi | English chip by default; 5 Indian languages + Nepali in the Soniox picker; 12 stock voices, 2 "Indian American" | [O] vapi 80; [Ot] |
| Exotel | Demo agent English + Hindi; 183 ElevenLabs voices (notes) | [N] |

**VP design.** A language-mode selector: Hinglish (code-mixed, default for the Hindi belt), Hindi, Indian English, regional language plus English. Per-language voice counts shown before purchase. Voices filtered by language and register; no companion or romance voices in the business catalogue. Number, date and amount reading rules per language. Per-contact language from a CSV column. Language hold reported per agent from real calls.

**VP layer.** This is where emotional voice lives: expressive Hinglish voices with prosody control. Personalisation: preferred language and formality (aap/tum) per contact in v1. Memory (v2): language preference remembered. Self-learning (v2): switch thresholds tuned per segment.

### 2.6 Conversation-control defaults

**Best for exposure: Vapi** [O vapi 80; Ot 34-builder-Advanced]: End-of-Turn Wait slider with "0 sec / 3 sec" ends and a one-line explanation; Intelligent Turn-Taking with its own explanation ("Off: the assistant waits a fixed silence delay instead"); start- and stop-speaking plans with ranges; idle messages; silence timeout 5-3,600 s; max duration 10-43,200 s. **Best for explanation: ElevenLabs** [O elevenlabs 44]: every setting has a 1-2 sentence description including cost impact, and a lock is explained ("This ASR setting is locked because Turn V3 requires Scribe v2 Realtime").

**Where all fall short.** None sums its settings into a predicted reply gap; none ships Hindi lexicons; values sit below the fold or are not captured at Vapi (Wait Seconds, interruption values). Bolna's 500 and 900 ms sliders have no sum [O bolna 16] (and the saved agent's creation path is unknown). Retell's added-wait slider shows its handle at the far right beside "0ms" [O retell 09]. Sarvam's Listening section was not screenshotted [U]. Exotel shows no endpointing or interruption control [N]. Full defaults are in section 3.

**VP design.** All timings in milliseconds with ranges; a predicted reply gap (endpoint + hold + model + TTS first audio) next to the measured India p50 for the preset; three named presets; Hindi and Hinglish backchannel, stop and acknowledgement lists shipped as editable defaults; short replies classified, never discarded; listening on during the opening line; a silence ladder (nudge in the caller's language, then a polite close); voicemail detection tuned on Indian operator announcements; she ends the call herself with the hang-up guard (directive.2026-10-20.agent-hangup). Defaults come from VP's battery (open.2026-10-19.turn-taking).

**VP layer.** Emotional voice: the agent's own backchannels ("haan ji", "achha") are part of turn-taking. Personalisation: an elderly preset tolerates a 2.4 s pause. Memory (v2): per-contact pace. Self-learning (v2): endpointing tuned per segment from cut-in rates.

### 2.7 Tools and integrations

**Best catalogue: Vapi** [O vapi 56]: Create Tool menu grouped as Phone call tools (Transfer Call, Hang Up, Leave Voicemail, DTMF, Send Text, SIP Request), Assistant tools (Handoff, Query) and Integrations (API Request, MCP and others); 15 types [Ot]. **Best transfer: Retell** [O retell 08]: Cold / Warm ("AI gives a one-way brief to the agent") / Agentic Warm ("AI has a 2-way conversation with agent, then bridges"), SIP INVITE or REFER, displayed caller ID, ring duration 30 s, talk-while-waiting (the form is pre-filled with a +1 destination, [phone redacted]). **Best API-tool authoring: Sarvam** [O sarvam 06]: run timing (call start / during / end), method + URL + Send, Path/Params/Headers/Auth/Body tabs, "Paste it to auto-fill the form" for cURL, "@" mapping of response fields.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Vapi | Clicking a tool type creates and publishes it ("Success! Your tool has been created successfully.", status Published) | [O] vapi 57 |
| ElevenLabs | 9 system tools, all OFF ("0 active tools"); integrations library of 4 cards, none Indian | [O] elevenlabs 42; [Ot] |
| Retell | CRM list US-shaped (HubSpot, Salesforce, Dynamics, GoHighLevel, Zoho, Zendesk, Calendly, Cal.com); no WhatsApp | [Ot] |
| Bolna | 4 presets + custom function; AiSensy WhatsApp only as a workflow node; no CRM card | [Ot] |
| Sarvam | No DTMF or SMS tool seen; integrations via MCP and recipe cards | [O] sarvam 05; [Ot] |
| Exotel | Custom API integration only (name, description, base domain, method GET) | [O] exotel-17 |

**VP design.** Vapi's grouped catalogue, but nothing exists until Save. Retell's three transfer modes, with the warm brief spoken to the human in Hindi or English. Sarvam's API-tool flow plus a test against a synthetic CSV row and a mock mode. WhatsApp follow-up through an Indian BSP as a first-class tool. Every tool on API and MCP.

**VP layer.** Talk-while-waiting fillers in the caller's language and register (emotional voice); tool results may write consented facts to the contact (memory, v2); tools receive contact variables (personalisation); tool failure rates feed evals (self-learning, v2).

### 2.8 Knowledge

**Best: Retell** [O retell 74]: Add Web pages, Upload files (up to 50 MB), Add text, Connect Google Drive, Microsoft OneDrive, Notion; first 10 knowledge bases included [Ot]. **Runner-up: ElevenLabs** [O elevenlabs 7-knowledge-base]: Sources / Memory (Alpha) / Retrieval tabs, "Test retrieval", an empty state with a CTA.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Bolna | PDF only ("Only .pdf files are supported"), Language Support English (Default), no name field or size limit, Upload enabled with no file | [O] bolna 39 |
| Sarvam | Table shows Name, Uploaded by, Uploaded at only: no status, size or source type | [O] sarvam 28 |
| ElevenLabs | Free RAG cap 1.0 MB | [Ot] |
| Vapi | Files page and a Query tool; no retrieval settings seen | [Ot] |
| Exotel | Corpus table with no add button in view | [Ot] |

**VP design.** Files (PDF, DOCX, XLSX price lists), URLs, text and Google Drive; per-document status (indexed, chunks, language); "Test retrieval" with a Hinglish question against English documents; citations in the transcript; per-agent scoping; a "never say" list.

**VP layer.** Contact facts (policy number, due date) come from the contact record, not the knowledge base (personalisation). Memory (v2) is separate from the KB. Unanswered questions are surfaced as KB gaps (self-learning input; Retell's QA "Top Questions from User" [O retell 46] shows the pattern, on sample data).

### 2.9 Flows and workflows

**Best: Retell** [O retell 76, 80]: a lifecycle view per agent (Pre-call functions → Call started → Agent → Call ended → Post Call Extraction, Save conversation to memory, Post-call functions, with Knowledge base and Webhook nodes), plus a Conversation Flow canvas with Global and Node settings. **Runner-up: Bolna** [O bolna 23]: workflow nodes whose descriptions state their contract ("Retry ... Loops back to an earlier node once per configured attempt"; "Callback: pauses the journey until your system calls this node's URL"; "Condition: Branch on a text expression").

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Bolna | A campaign needs a published workflow; canvas opens at 175% with the Inspector clipping Start | [O] bolna 22, 23 |
| Sarvam | Workflows page renders blank (no empty, loading or upsell state) | [O] sarvam 27 |
| ElevenLabs | Workflow is an empty canvas that needs an entry node; Procedures empty | [Ot] |
| Exotel | Flows live in App Bazaar, a separate shell | [Ot] |
| Vapi | Squads editor not opened | [Ot] |
| Retell | Checklist and tour overlay the node palette and canvas | [O] retell 80, 76 |

**VP design.** One lifecycle view per agent (Retell's shape) with VP's slots: pre-call lookup, call, post-call extraction, follow-up (WhatsApp, SMS, callback, retry). The multi-attempt journey lives on the campaign, not in a separate workflow product. The conversation itself is driven by the brief and agenda ledger (LLM-native), not by a node graph.

**VP layer.** A memory read before the call and a consented write after it (v2). Pre-call lookup fills personalisation variables. Post-call judges feed the improvement loop (v2).

### 2.10 Testing, simulation and evals

**Best for the build loop: Sarvam** [O sarvam 10]: a Test Agent panel docked beside the editor with Voice / Phone / Chat and a Setup row summarising language and variables; an Automated tests tab ("Create test cases or let AI generate them"); the price of a simulated run shown, Rs 2 [O sarvam 22]. **Best for QA depth: Vapi** [O vapi 69, 34-Analysis, 71]: Evals, Simulation suites ("repeatable scenarios"), Structured Outputs, Scorecards ("Grade calls automatically using boolean or number structured outputs") and Monitors. **Retell** [O retell 77, 09]: Test Audio / Test LLM, Simulation Testing with Test Case / User Prompt / Success Criteria, Batch Testing History.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Exotel | Web Call "Coming soon"; the Phone Call card shows no input field; a "Talk to Agent" header button was not exercised | [O] exotel-02 |
| Bolna | Test is a phone call to a verified number; no simulation or eval surface in the nav | [O] bolna 01; [Ot] |
| ElevenLabs | Tests page empty; simulation UI not seen (only an Architect checklist item) | [Ot] |
| Retell | AI QA shows 240 calls dated 2025 while Call History has 0, with no Sample label | [O] retell 46, 41 |
| All | No test or simulation was run, so result quality is [U] | |

**VP design.** A docked test panel (browser voice, chat, phone). One-click Hinglish caller personas as simulations (busy, skeptical, elderly with a 2.4 s pause, noisy street). Test suites can gate publish (W10). Each failed case links to the turn and proposes a brief edit as a diff. Cost per simulated run shown. Each run reports reply gap, cut-ins and language hold.

**VP layer.** Simulations score warmth and naturalness (judge plus periodic human listening); multi-call simulations test recall (memory, v2); simulations run with synthetic rows shaped like the customer's CSV (personalisation); failing cases seed the improvement loop (self-learning, v2).

### 2.11 Debugging and observability

**Best: Vapi** [O vapi 71; Ot 20-logs]: Logs with Calls, Chat, Sessions, Webhooks and API tabs, filters and Export All; Monitoring Issues with Critical and Warning counts, MTTR, Calls Impacted (1h/24h/7d) and categories Infrastructure, Technical, Effectiveness, Compliance. **Runner-up: Retell** [O retell 41]: Call History with 13 columns including Cost, End Reason, Session Status, User Sentiment, Session Outcome and End to End Latency; Live Monitoring; Alerting; a page-aware "Summarize call patterns" chip.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Vapi | Ended reason shown as a raw code ("call.start.error-get-assista..."); "Great news! There are no active issues" with no monitors configured | [O] vapi 71; [Ot] |
| Retell | Sample QA data unlabelled; tiles show 0, 0s, 0ms on empty data | [O] retell 46, 43 |
| Bolna | Debugging is a search box for an execution ID; call-record fields not visible on an empty table | [Ot] |
| Sarvam | A wavy line drawn behind "No data available"; "Latency 0 ms" with no calls | [O] sarvam 29 |
| Exotel | Analytics renders a grey broken-frame panel with no message | [O] exotel-23 |
| ElevenLabs | Triage board and "Flag issue for review" tool exist; history shows "No results" when empty | [Ot] |

**VP design.** A failed-call finder: per call, the customer-owned business outcome, the engineering reason, the carrier code and the action ("row 12: number invalid, fix in CSV"). A per-turn timeline with latency segments (STT, LLM, TTS first audio, network) and the combination that ran. Issues grouped by cause with counts and MTTR, and no "all good" message unless monitors are configured. Export with extracted fields.

**VP layer.** Per-call naturalness signals (talk ratio, interruptions, sentiment trajectory); a contact timeline across calls (memory, v2); issue clusters that propose fixes (self-learning, v2).

### 2.12 Telephony and India numbers

**Best: Sarvam** [O sarvam 23]: "Take your agent live" with Rent from Sarvam (add or release anytime, billed through credits, "Set up fully managed telephony infra in 2 minutes" [D], "Powered by Vobiz") beside Bring your own telephony with 7 providers (Exotel, Smartflo, Pulse, InTalk, Vobiz, Twilio, Plivo). **Runner-up: Bolna** [O bolna 25]: India in the buy dialog with Plivo or Vobiz, an inline "No compliance applications found. Create one" row with a help icon; per-number "Verify on Truecaller" and SIP-trunk health columns [Ot].

| Vendor | Where it falls short | Evidence |
|---|---|---|
| All 6 | No Indian number price before purchase; 140/1600/1601 series not visible | [O]/[Ot] |
| Vapi | Free numbers "Only US area codes", "Inbound only" for new accounts; outbound needs Twilio, Vonage, Telnyx or SIP | [O] vapi 06c |
| Retell | "Identity Verification Required ... Powered by Persona" before any country or price | [O] retell 30 |
| ElevenLabs | Import only; Exotel import needs Label, number, Account SID, API Key, API Token, Region, Voicebot Applet ID; Region defaults to Singapore under +91 | [O] elevenlabs 34 |
| Bolna | US helper text ("For US numbers starting with 615") in an India flow; the compliance gate appears only after India is chosen | [O] bolna 25 |
| Sarvam | Rent flow, KYC and price not opened | [O] sarvam 23 |
| Exotel | KYC, verify number, payment with GST and an ExoPhone before campaigns | [O] exotel-01; [N] |

**VP design.** A number step that states, before any credential: number types (10-digit, 140 for promotional, 1600 for regulated BFSI senders, 1601 for utilities), KYC documents, expected time, monthly rent and INR per minute. Bring-your-own Plivo, Exotel or Vobiz through a guided form with "where to find this" per field and a test call. Trials run browser calls and calls to verified numbers. India call path by default.

**VP layer.** Caller ID and brand per campaign (personalisation). Pickup rate by number and hour feeds scheduling (self-learning, v2).

### 2.13 Campaigns, scheduling and compliance

**No single best; four partial patterns:**
- ElevenLabs batch [O elevenlabs 33]: the CSV contract before upload (required `phone_number`; optional `prompt`, `first_message`, `voice_id`, `language`; "Any other column can be referenced as a dynamic variable"; CSV or XLS, max 25.0 MB), an agent selector, ringing timeout 60 s, a Test call button.
- Retell batch [O retell 25, 24]: a time-range popover with "+ Add" for more ranges and Days of Week; "Concurrency allocated to batch calling: 15" after 5 reserved; "$0.005 per dial" [D].
- Sarvam wizard [O sarvam 26]: Agent → Recipients → Schedule → Review & Launch, with an inline "This version is not committed ... Commit version" gate.
- Bolna [O bolna 22]: dependent fields greyed with placeholders ("Pick a workflow and version first"), CSV or JSON up to 32 MB and 150,000 rows.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| All 6 | No consent, DND/NCPR or DLT field on the creation surface | [O] |
| Vapi | Blocked at step 1; Next disabled with no reason; Campaigns marked Beta | [O] vapi 83 |
| Retell | No agent selector; window default 00:00-23:59 Mon-Sun with no legal-hours note; Send disabled with no reason; no retries | [O] retell 24, 25 |
| ElevenLabs | Start time + timezone only; no window, retries or scrub; the reason for the disabled Submit is in the phone field placeholder with no link to fix | [O] elevenlabs 33, 35 |
| Bolna | Campaign requires a published workflow; window is per agent in whole hours (09:00-21:00); Campaigns marked Beta | [O] bolna 22; [Ot] |
| Sarvam | Steps 2-4 not reached; DND appears only as an API recipe card | [O] sarvam 25, 26, 33 |
| Exotel | "Unable to load Caller ID's" and "Unable to load Lists" toasts; call type Transactional vs Promotional, retries 0-3 with backoff, throttle, duplicates toggle per notes | [O] exotel-10; [N] |

**VP design.** The call category comes first (service, transactional, promotional) and drives the allowed window and number series. Consent source, DND/NCPR scrub status, retries by outcome, an attempt cap and a per-contact local-time window are fields with defaults on. The CSV contract shows before upload; after upload, a row preview with the normalised number and a reason per rejected row; cross-format dedupe; +91 as default. A test call to one row. Opt-out carried across campaigns. An A2P CLI declaration export (due around 2026-11-18). A disabled Launch names the blocking item and links to it.

**VP layer.** Per-row language, voice and variables (personalisation); the last call's summary prefixes the next attempt (memory, v2); best time to call per segment (self-learning, v2).

### 2.14 Analytics and reporting

**Best: ElevenLabs** [O elevenlabs 7-analytics]: 12 tabs (General, Evaluation, Data Collection, Workflow, Audio, Queue, Tools, LLMs, Topics, Knowledge Base, Advanced, Testing); Create view; date with "UTC+5:30"; granularity; Agent, Branch and Group by chips; Total cost, Average cost, Total LLM cost; "---" and "No data has been collected" on empty data. **Runner-up: Retell** [O retell 43]: Call and Chat dashboards, "+" for custom dashboards, Filter, Breakdown, Add Chart, and widgets including Call Picked Up Rate, Call Transfer Rate and Concurrency Used.

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Retell | Tiles show 0, 0s, 0ms on empty data | [O] retell 43 |
| Sarvam | Fake line on empty data; "0 ms" | [O] sarvam 29 |
| Exotel | Blank frame | [O] exotel-23 |
| Bolna | Metabase iframe; chart titles Daily Call Volume by Status and two hangup charts; no cost or latency chart title | [Ot] |
| Vapi | Boards plus a legacy Metrics page covering similar ground | [Ot] |
| All | No cost grouped by campaign or contact seen (0 of 5 by API on 2026-10-20) | [Ot]/prior |

**VP design.** A campaign funnel (rows → valid → dialled → connected → agenda completed → outcome) with reasons at each drop; INR cost per campaign, per contact and per outcome; reply gap, cut-in rate and language hold per agent version; disclosure and opt-out counts; distinct empty, zero, loading and failed states.

**VP layer.** Sentiment trajectory and naturalness per call (emotional voice); contact-level history (memory, v2); version comparisons with outcome deltas (self-learning, v2).

### 2.15 Billing and price transparency

**Best: Bolna** [O bolna 34, 40, 01]: a Pricing Information table (component, price in cents, pulse in seconds, per-minute) that sums to 6 cents with "Show models" for the included models; a recharge dialog with INR equivalents, bonus percentages and computed minutes ("~₹5.72/min" at $0.060); a persistent cost bar in the builder. **Runner-up: Sarvam** [O sarvam 22]: INR rate tables per plan with units (Simulate Test Runs Rs 2 per run; Voice Agent (60s) Rs 3.5 / 3.25 / 3.15 / 3 per minute; Call forwarding to PSTN Rs 0.4 per 30 s pulse). **Retell** shows prices at the toggle [O retell 5x-settings: burst $0.10/min; 76: $0.005 per memory run; 24: $0.005 per dial].

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Bolna | Bills in USD with an approximate INR overlay; cents, dollars and rupees mixed across pages | [Ot]; [O] bolna 34, 40 |
| Sarvam | Balance -36.58 shown in normal type with no overdrawn state; voice-agent pulse 60 s | [O] sarvam 20, 22 |
| Retell | USD only; burst ON by default | [O] retell 5x-settings |
| ElevenLabs | USD only; LLM and telephony rows say "Based on usage and varies by model"; plan price / included minutes = $0.08 on every tier [I] | [O] elevenlabs 51 |
| Vapi | USD only; headline excludes telephony; no per-number price | [O] vapi 33; [Ot] |
| Exotel | No rate visible; payment behind GST details; concurrency increase by email, "subject to monthly charges" | [O] exotel-25; [N] |

**VP design.** INR everywhere with GST; per-second billing or a short stated pulse; Sarvam's rate table plus Bolna's component bar; an all-in INR per connected minute; a cost estimate per campaign before launch; spend caps per workspace and per API key; burst opt-in; low-balance and overdrawn states; invoices broken down by campaign.

**VP layer.** Learning agents and deep personalisation are higher tiers (DIRECTION.md); the per-contact cost of memory is shown at its toggle (Retell's pattern).

### 2.16 Team, security and governance

**Best: ElevenLabs** [O elevenlabs 54]: per-agent "Enable authentication"; an allowlist with a red box ("No allowlist specified. Any host will be able to connect to this agent."); 17 override toggles; privacy settings (zero retention mode, store call audio, retention period) [Ot]. **Runner-up: Retell** [O retell 6z-roles, 13]: fixed roles Admin, Developer, Member with plain descriptions ("Read-only access ... scrubbed history") on a free trial; data storage choices (Everything / Everything except PII / Basic Attributes Only) with retention; PII redaction (14 categories) and 10 guardrails [Ot].

| Vendor | Where it falls short | Evidence |
|---|---|---|
| Bolna | Team Members: "This is a paid feature. Please schedule a call ..." ([email redacted]) while Invite Member looks active | [O] bolna 36-account-Team-Members |
| Sarvam | Invite fixes the role to "Member with Editor access" | [Ot] |
| Vapi | Public key defaults: all origins, all assistants, transient assistants allowed, no warning; RBAC on Pro; Recording Consent Plan Enterprise-only | [O] vapi 62, 34-builder-Advanced |
| Retell | Defaults "Everything" and "Keep forever"; PII list has no Aadhaar or PAN; DNC handling off | [O] retell 13; [Ot] |
| ElevenLabs | Allowlist open by default (warned); retention Unlimited | [O] elevenlabs 54; [Ot] |
| Exotel | Admin / Supervisor / Agent named, no matrix; PII masking off | [Ot]; [N] |
| All | No SSO, audit log or India residency selector seen on these accounts | [O]/[Ot] |

**VP design.** Fixed roles (Owner, Builder, Operator, Viewer with PII scrubbed) on every plan including trial; retention chosen at onboarding, never indefinite by default; PII redaction with Aadhaar, PAN, bank and card numbers on by default; an audit log of config changes and publishes; API keys with scopes, expiry and last-used; widget keys closed by default; AI disclosure non-removable; crisis lines kept.

**VP layer.** Memory governance (v2): consented, viewable, editable and deletable per contact (DPDP). Self-learning changes (v2) logged, reviewable and reversible.

---

## 3. Cross-vendor defaults as captured

Defaults on trial accounts as left by the vendor; nothing below was exercised on a call. Bolna values are from a saved agent of unknown creation path (its New Agent draft's Engine tab was not opened). ElevenLabs [API] values come from the 2026-10-20 read-back of the same agent where the dashboard showed only a label.

| Setting | Vapi | Retell | Bolna | ElevenLabs | Sarvam | Exotel |
|---|---|---|---|---|---|---|
| Who speaks first | Assistant speaks first [O vapi 55 per analyst; Ot] | User speaks first ("AI starts speaking after silence") [Ot] | Welcome "Hello from Bolna" [O bolna 01] | "Hello! How can I help you today?", no disclosure [O elevenlabs 61] | "Hi, I am Shubh calling from Sarvam, how can I help you today?" [O sarvam 03] | Greeting disabled [N] |
| Speech during opening | not captured | not captured | "Ignore user speech before welcome" OFF; delay 0 ms [O bolna 01] | First message Interruptible ON [O elevenlabs 61] | [U] | [U] |
| End of turn | End-of-Turn Wait 1.5 s (0-3 s); Intelligent Turn-Taking Off [O vapi 80] | Response Wait 0 ms added; "Dynamically adjust" unchecked [O retell 09] | Endpointing 500 ms + Linear delay 900 ms; Response Rate "Custom" [O bolna 16] | Eagerness Normal (enum); Turn V3; take turn after silence 7 s [Ot; API] | not visible [U] | VAD Configuration empty [N] |
| Interruption | words / voice s / back-off s not captured; ranges 0-10 / 0-0.5 s / 0-10 s [Ot] | Sensitivity 0.9 (0-1) [O retell 09] | 1 word before interrupting [O bolna 16] | Ignore-terms list empty [API] | [U] | none seen [N] |
| Smart endpointing | Off or LiveKit (English only) [Ot] | n/a | n/a | ASR locked to Scribe v2 Realtime by Turn V3 [O elevenlabs 44] | n/a | n/a |
| Silence nudge | Idle messages none (max 1-10, timeout 5-60 s) [Ot] | Reminder 10 s, 1 time [O retell 09] | Check-in after 10 s; text is the English line under the Hindi chip [N; Ot] | Soft timeout Disabled [Ot] | "Hey, are you still on the call?" after 5 s [O sarvam 07b] | after 7 s, up to 3 times [N] |
| Hang up on silence | not captured (5-3,600 s) [Ot] | 10.0 min [Ot] | 20 s [N] | Disabled (-1) [Ot; API] | ON after unanswered nudges; count not shown [O sarvam 07b] | after the 3rd nudge [N] |
| Max call length | not captured (API 600 s; 10-43,200 s) [Ot] | 1.00 h [Ot] | 90 s total timeout [N] | 600 s [API] | 15 min (up to 60) [O sarvam 07b] | Disabled [N] |
| Voicemail | Detection provider Off [Ot] | state not visible; hang up or leave message [Ot] | OFF; 2.5 s when on [O bolna 15/21 per analyst] | Voicemail detection tool OFF [O elevenlabs 42] | ON, message names no company [O sarvam 07b] | App Bazaar applet, not in builder [N] |
| DTMF | state not captured; timeout 0-10 s [Ot] | timeout 2.5 s; state not visible [Ot] | Keypad input OFF [O bolna 15 per analyst] | DTMF input OFF; out-of-band only [O elevenlabs 44] | no tool seen [O sarvam 05] | not seen |
| End-call tool | Hang Up type exists, not attached [O vapi 56] | end_call attached [O retell 09] | "Hangup using a prompt", state unknown [Ot] | End conversation OFF [O elevenlabs 42] | End Interaction ON [O sarvam 05 per analyst] | not seen |
| Noise | Background Denoising appears Off [O vapi 80] | Remove noise [O retell 09] | Noise cancellation OFF (85% when on) [Ot] | Filter background speech OFF [O elevenlabs 44] | not seen | Denoiser ON, 0.8 [N] |
| Added ambience | Default (office on phone calls) [O vapi 51] | None [O retell 09] | None [Ot] | n/a | Quiet office ON [O sarvam 08] | n/a |
| Ring timeout | not captured | 30 s (5-300 s); transfer ring 30 s [Ot; O retell 08] | not captured | Batch ringing timeout 60 s [O elevenlabs 33] | not captured | not captured |
| Retries | none on step 1 [O vapi 83] | none on batch form [O retell 24] | Workflow Retry node only; Auto reschedule OFF [O bolna 23; Ot] | none on batch form [O elevenlabs 33] | steps 2-4 unseen [U] | 0-3 with backoff [N] |
| Calling window | none seen; steps 2-3 unseen | 00:00-23:59, Mon-Sun [O retell 25] | 09:00-21:00 per agent, whole hours; enforcement default unseen [Ot] | start time + timezone only [O elevenlabs 35] | [U] | Now or Later [N] |
| Schedule timezone | n/a | Asia/Calcutta [Ot] | Asia/Kolkata (test variables) [Ot] | Asia/Calcutta [O elevenlabs 35] | n/a | n/a |
| Concurrency | 4 (campaign 4/4) [O vapi 83] | 20; batch 15 = 20 - 5 reserved [O retell 5x-settings, 24] | 2 [O bolna 34] | Free plan 4 [D elevenlabs 51]; batch Auto [O elevenlabs 33] | not shown | 5 [O exotel-25] |
| Burst | n/a | ON, up to 3x, +USD 0.10/min [O retell 5x-settings] | n/a | ON, 2x price [API] | n/a | n/a |
| Temperature | 0.5 [Ot] | not shown | 0.1 [Ot] | 0.0 [API] | "Balanced", no number [Ot] | n/a |
| Max tokens per reply | 250 [Ot] | n/a | 100 [Ot] | -1 (no limit) [API] | n/a | n/a |
| Post-call analysis | none attached [O vapi 34-Analysis] | Call Summary, Call Successful, User Sentiment on GPT-5.6 Terra [O retell 76] | Call Summary listed [Ot] | Topic discovery and sentiment ON; Gemini 2.5 Flash [Ot] | call_summary output variable [Ot] | 3 intents [N] |
| Memory | none | read ON; save OFF at USD 0.005/run [O retell 09, 76] | none | Memory (Alpha) tab, state [U] [O elevenlabs 7-knowledge-base] | none | none |
| Retention | 14 days history on plan [Ot] | Everything, Keep forever [O retell 13] | not seen | Unlimited [Ot] | not seen | not seen |
| PII redaction | HIPAA add-on only | none of 14 selected [Ot] | n/a | off [API] | n/a | Mask Sensitive Data off [N] |
| In-call opt-out | n/a | DNC handling OFF [O retell 13] | n/a | n/a | n/a | n/a |

**Reading [I].** Retell sits at the reactive end (0 ms added wait, 0.9 interruption) with long line-holding limits (10 min silence, 1 h); Bolna's saved agent sits at a slow floor (about 1.4 s) with short limits (20 s, 90 s); ElevenLabs and Sarvam express turn-taking as enums or nothing. None of these is measured on a Hinglish call.

---

## 4. Pattern library

### 4.1 Patterns to adopt

| Pattern | Vendor that shows it best | Evidence |
|---|---|---|
| Latency, cost and a quality score on every picker row; one-click presets | Vapi | [O] vapi 33, 51 |
| Latency range plus per-minute and per-message price per LLM row; detailed costs footer | ElevenLabs | [O] elevenlabs 61 |
| Persistent per-minute cost header with a component bar on every builder tab | Bolna | [O] bolna 01, 16 |
| Price at the point of the toggle | Retell; Sarvam (Rs 2 per simulated run) | [O] retell 5x-settings, 76, 24; sarvam 22 |
| One-to-two sentence description under every setting, including cost impact; locks explained | ElevenLabs | [O] elevenlabs 44 |
| Docked test panel with voice, phone and chat | Sarvam | [O] sarvam 10 |
| Gate shown inline with the fix in the same place | Sarvam ("Commit version"); Bolna ("Create one") | [O] sarvam 26; bolna 25 |
| Dependent fields greyed with a placeholder that says what unlocks them | Bolna; Sarvam | [O] bolna 22; sarvam 25 |
| CSV contract (required, optional, custom columns) before upload | ElevenLabs | [O] elevenlabs 33 |
| Multiple time ranges plus days of week; reserved-concurrency readout | Retell | [O] retell 25, 24 |
| Transfer modes explained in plain words | Retell | [O] retell 08 |
| API tool with cURL paste, inline Send, run timing and "@" response mapping | Sarvam | [O] sarvam 06 |
| Lifecycle view of an agent (pre-call to post-call) | Retell | [O] retell 76 |
| Node descriptions that state their contract | Bolna | [O] bolna 23 |
| Template preview as a graph before use | ElevenLabs | [O] elevenlabs 02 |
| Honest empty state ("---", "No data has been collected") | ElevenLabs | [O] elevenlabs 7-analytics |
| Empty state that explains the concept and offers one action | Vapi; ElevenLabs | [O] vapi 69; elevenlabs 7-knowledge-base |
| Issues with severity, MTTR and categories including Compliance | Vapi | [O] vapi 71 |
| Red warning when a key or agent is open to any host | ElevenLabs | [O] elevenlabs 54 |
| Fixed roles with plain-language descriptions on a trial | Retell | [O] retell 6z-roles |
| Native-script glyphs in the language picker; Indic number reading | Sarvam | [O] sarvam 08 |
| Per-language prompt, voice and transcriber chips | Bolna | [O] bolna 14, 20 |
| Live concurrency meter with last-updated time | Exotel | [O] exotel-25 |
| INR equivalents and minutes on recharge tiers | Bolna | [O] bolna 40 |
| Rent and bring-your-own numbers side by side, with provider logos | Sarvam | [O] sarvam 23 |
| Page-aware assistant chips ("Summarize call patterns", "Explain access controls") | Retell | [O] retell 41, 5x-settings |
| Version pill (Stable, Live) with "Test this version" | Exotel | [O] exotel-04-rollout |

### 4.2 Anti-patterns to avoid

| Anti-pattern | Where seen | Evidence |
|---|---|---|
| A menu click creates and publishes an object; a dropdown autosaves a draft | Vapi | [O] vapi 57, 80 |
| Primary button disabled with no reason | Vapi Next; Retell Send | [O] vapi 83; retell 24 |
| Generic load errors that name no cause | Exotel | [O] exotel-10 |
| Sample data shown as real | Retell AI QA | [O] retell 46 |
| Chart drawn on no data; "0 ms" latency on empty data | Sarvam; Retell | [O] sarvam 29; retell 43 |
| A tour stuck on every page; a checklist that covers working canvas | Retell | [O] retell 41, 43, 76, 80 |
| Blank page with no empty, loading or error state | Sarvam Workflows | [O] sarvam 27 |
| Onboarding wall that repeats until saved | Vapi | [O] vapi 01, 24-billing |
| Headline latency or cost that leaves out telephony and the turn wait | Vapi; Retell | [O] vapi 33; retell 09 |
| Quality scores with no scale; latency ranges spanning about 10x | Vapi; ElevenLabs | [O] vapi 51; elevenlabs 61 |
| Sliders with inverted or missing units | Retell (handle at far right beside "0ms"); Sarvam ("Balanced") | [O] retell 09; sarvam 07 per analyst |
| Two turn-taking sliders with no sum | Bolna | [O] bolna 16 |
| Spend or line-holding defaults on (burst, 10-min silence, keep forever) | Retell | [O] retell 5x-settings, 13; [Ot] |
| End-call and voicemail tools off by default | ElevenLabs | [O] elevenlabs 42 |
| First message without disclosure; greeting that names the vendor; added office ambience on | ElevenLabs; Sarvam | [O] elevenlabs 61; sarvam 03, 08 |
| Companion, therapist or romance voices in a business catalogue | Sarvam; Bolna | voices.txt (local); [Ot] |
| US defaults on an India path (US area codes, "615" helper, Singapore region under +91) | Vapi; Bolna; ElevenLabs | [O] vapi 06c; bolna 25; elevenlabs 34 |
| Compliance revealed only after the country is chosen | Bolna | [O] bolna 25 |
| Team management as a sales-gated feature behind an active-looking button | Bolna | [O] bolna 36-account-Team-Members |
| Two permanent banners taking about 90 px of a 720 px screen | Bolna | [O] bolna 01 |
| Three shells, three design languages, three contact stores | Exotel | [O] exotel-01, exotel-02; [Ot] |
| "No Results Found / Please try refining your search" on a list that is simply empty | Exotel | [O] exotel-09 |
| Core outbound feature labelled Beta | Vapi; Bolna | [O] vapi 83; bolna 22 |
| Public keys open to all origins and assistants with no warning | Vapi | [O] vapi 62 |

---

## 5. Changes to VP's v1 must-be list (against the 21 items)

The 21 from the teardown Kano table: test call from builder; list/CSV campaign with per-row variables; recurring window with days; retries by outcome; inbound number-to-agent with caller lookup; transfer to a human; voicemail/IVR detection; DTMF; knowledge base; HTTP tools in-call; post-call judge with typed extraction; post-call webhook (full record); call log with recording, transcript, cost and reason; export with extracted fields; agent versions and publish; Indian CLI path; Hindi/Hinglish plus major Indic; suppression/DNC on every outbound path; INR billing with GST; team roles; India data residency option. Plus AI disclosure as a VP rule.

### Additions

| # | Item | Evidence |
|---|---|---|
| A | **Price and India-measured latency at every stack choice, and an all-in INR per-minute headline** that includes telephony, pulse and the turn wait | Inline metrics at Vapi and ElevenLabs, price-only at Retell, none at Bolna, Sarvam, Exotel [O vapi 51, elevenlabs 61, retell 09, bolna 14, exotel-15]; headlines exclude telephony and wait [O vapi 33, retell 09]. The stack is a user choice in VP (decision.2026-10-20.product-stack-selectable), so a self-serve buyer needs this to choose. |
| B | **Contacts** with India-default E.164, DND status and attempt history (memory slot reserved for v2) | Retell ships Contacts with a Do Not Call column and contact memory [Ot retell 42; O retell 09]; ElevenLabs identifies callers by a user-ID string [Ot]; Vapi and Bolna have no contact object. Item 18 (suppression) cannot hold across campaigns without it. |
| C | **Bounded call and spend defaults**: end-call on, silence hang-up on with a bounded value, max duration set, burst opt-in, spend cap per workspace and API key | Retell burst ON, 10 min silence, 1 h max [O retell 5x-settings; Ot]; ElevenLabs end tool off and silence end-call disabled [O elevenlabs 42; Ot]; Exotel max duration off [N]; no spend cap seen in 6 dashboards. |
| D | **State integrity**: no click creates or publishes; an unsaved marker; a reason and fix link beside every disabled primary action; distinct empty, zero, loading and failed states | Vapi click-to-publish and autosave [O vapi 57, 80]; no unsaved state at Bolna and Sarvam [Ot bolna 21; O sarvam 03]; silent disabled buttons [O vapi 83, retell 24]; fake or zero data on empty pages [O sarvam 29, retell 43]. |

### Promotion

- **AI disclosure moves from "VP rule" to a must-be on every creation path, templates and copilot output included.** No dashboard enforces it: ElevenLabs' default first message has none, with a "Disclosure Requirements" link beside it [O elevenlabs 61]; Sarvam's disclosure is a prompt line in its template [O sarvam 01]; Retell's Agent Handbook (where its preset lives) was not opened [U].

### Sharpened items

| Item | Sharpened to | Evidence |
|---|---|---|
| 1 Test call from builder | Browser voice and text test with no phone number and no KYC, docked beside the editor | Exotel web call "Coming soon" [O exotel-02]; Bolna phone-only to verified numbers [O bolna 01]; Sarvam, Retell, ElevenLabs browser tests [O sarvam 10, retell 09, elevenlabs 61] |
| 2 CSV campaign | CSV contract shown before upload; per-row overrides (language, voice, first message); row preview with reasons; cross-format dedupe | [O elevenlabs 33]; Retell recipients preview pane [O retell 24] |
| 3 Recurring window | Window derived from call category; never 00:00-23:59 by default | [O retell 25]; Bolna 09:00-21:00 per agent [Ot] |
| 4 Retries by outcome | On the campaign form, not a separate workflow product | Bolna's Retry node is "the only retry mechanism" and campaigns need a published workflow [O bolna 23, 22]; Retell and ElevenLabs forms have none [O] |
| 15 Versions and publish | Explicit publish with a diff; version shown in the call log | Sarvam commit gate [O sarvam 26]; Exotel version pill and log column [O exotel-04-rollout; Ot] |
| 16 Indian CLI path | Number types, KYC documents, time and price stated before any credential is asked | Gates at all six [O vapi 06c, retell 30, elevenlabs 34, bolna 25, sarvam 23, exotel-01] |
| 17 Hindi/Hinglish + Indic | An explicit Hinglish (code-mixed) mode; voices filterable by language with counts | 0 of 6 have a Hinglish option; voice language filters missing at Retell and Bolna [O retell 10, bolna 19] |
| 18 Suppression/DNC | One DNC list honoured on batch, campaign, API and single call; in-call opt-out capture on by default | Retell's toggle is in-call capture and off [O retell 13]; Sarvam DND only as an API recipe card [O sarvam 33] |
| 13 Call log | Business outcome beside engineering reason; cost; end-to-end latency; version | Vapi raw codes [Ot]; Retell columns [O retell 41] |
| 19 INR billing | INR rate table with pulse units; pulse at most 30 s and stated | Sarvam table and 60 s pulse [O sarvam 22]; Bolna 30 s pulse, USD invoices [O bolna 34; Ot] |
| 20 Team roles | Fixed roles on every plan including trial | Retell trial roles [O retell 6z-roles]; Bolna paid feature [O bolna 36-account-Team-Members]; Sarvam fixed Editor [Ot] |
| 11 Post-call judge | Visible, editable defaults (summary, success, sentiment) | Retell defaults [O retell 76]; Bolna's auto judges hidden (prior ACB) |

### Moved out of the self-serve UI floor

- **21 India data residency option** becomes an architecture and contract item (India call path by default; residency terms in the BFSI contract), not a self-serve setting. No dashboard exposes residency or region for data (0 of 6) [O/Ot]; Exotel's account region reads Singapore in notes [N]. It stays must-be for BFSI deals.

### Unchanged (confirmed by the dashboards)

Transfer, voicemail/IVR, DTMF, knowledge base, HTTP tools, webhook, export, inbound. Chat/copilot setup stays parity (5 of 6 dashboards), not a wedge (open.2026-10-20.parity-floor-vs-wedge).

---

## 6. Contradictions with prior research and what they change

| Prior claim (source) | Dashboard shows | What it changes |
|---|---|---|
| Bolna "Telephony is billed per minute, rounded up" (account-phase report §8) | 30 s pulse on voice agent, telephony and platform [O bolna 34] | Matches the teardown's "30 s pulses"; the account-phase line is wrong. Short-call cost at Bolna is lower than a per-minute model gives. |
| Bolna PAYG all-in INR 6.1 (fee included) or 8.0 (added) (BOL-36) | 3.5 + 0.5 + 2 = 6 cents; recharge shows "~₹5.72/min" [O bolna 34, 40] | Supports the "included" branch; Bolna's PAYG band narrows toward INR 5.7-6.1 until an invoice confirms it. VP's INR 2 ambition faces a lower Bolna anchor. |
| Bolna "Number KYC needs a CIN and accepts Pvt Ltd only" (BOL-45) | "PAN + Aadhaar (persons) or PAN + GSTIN (companies)" [O per analyst, bolna 36-account-Vobiz-KYC] | Individuals can reach an Indian number at Bolna; W7's kill bar ("Bolna or Sarvam in 20 min or less") becomes more plausible. |
| Bolna "Everything said while the welcome plays is dropped" (account-phase headline 3) | An "Ignore user speech before welcome message" toggle, OFF by default [O bolna 01] | W4's welcome-drop evidence needs a condition; test both states on a call. |
| Retell "RBAC and SSO are Enterprise-only" (RET-09) | Admin, Developer, Member system roles on a free trial; Add Role greyed [O retell 6z-roles] | Kano "Team roles" for Retell moves from P to Y for fixed roles. |
| Retell "US defaults: America/Los_Angeles timezone" (RET-17) | Batch Schedule defaults to Asia/Calcutta [Ot] | The API default and the dashboard default differ; W1 evidence should say "API defaults to LA". |
| Retell DNC toggle copy "skips DNC contacts in outbound calls" (Retell analyst, text capture) | Pixels read "Confirm a request to stop calling, end the call, and mark the contact as do-not-call", OFF [O retell 13] | The toggle is in-call opt-out capture; RET-43 ("batch calls ignore DNC") is not refuted. |
| Retell "a separate Campaigns object is referenced" (RET-06) | No Campaigns entry in the nav [O retell 41] | Retell outbound is the batch form only. |
| Vapi Indic STT "12 codes" (API phase) | 5 Indian languages + Nepali in the dashboard picker [Ot] | A dashboard buyer sees less than the API offers; Kano Hindi/Indic for Vapi stays P. |
| Vapi "22 stock voices, 3 Indian American" | 12 voices, 2 Indian American in the library grid [Ot] | Unreconciled (pagination possible); re-check in pass 2. |
| Vapi "every PATCH publishes an immutable version" (API phase) | Draft then explicit Publish in the dashboard [O vapi 80] | Two semantics: API writes publish, dashboard writes draft. |
| Vapi "2 concurrent simulations" | "Concurrent simulations 1" [Ot] | Re-check. |
| ElevenLabs "Defaults: LLM gemini-2.5-flash ... speculative turn off" (teardown architecture table) | DeepSeek Flash 4.1 as default LLM [O elevenlabs 61]; speculative turn on [API] | Any ElevenLabs cost model built on the gemini default is stale. |
| ElevenLabs "INR and UPI checkout (vendor-claimed)" | USD only on the subscription page [O elevenlabs 51]; billing portal not opened | Kano INR billing for ElevenLabs stays P:v at best. |
| ElevenLabs memory "built but gated (403)" | A Memory (Alpha) tab is visible [O elevenlabs 7-knowledge-base] | Memory is moving into the ElevenLabs UI; v2 timing risk rises. |
| Sarvam Business plan "coming soon" (SAR-36) | "Upgrade to Business" at Rs 1,99,999 [Ot] | Sarvam's Rs 3 per minute tier is purchasable. |
| Sarvam "an org-wide DND suppression list (manual, bulk CSV or API)" (SAR-44) | Only a "DND lists" API recipe card [O sarvam 33] | Kano suppression for Sarvam: Y in API, not seen in UI. |
| Sarvam "member invites with roles" (SAR-10) | Invite fixes "Member with Editor access" [Ot] | Kano team roles for Sarvam moves from Y to P. |
| Sarvam "Agent Analytics with 8 tabs, Log Analyser" (SAR-02) | 7 tabs; no Log Analyser [O sarvam 29] | Minor. |
| Exotel "Testing means placing a real phone call" | Rollout has "Test this version" and Test Threads (0); a "Talk to Agent" header button [O exotel-04-rollout, exotel-02] | A non-phone test path probably exists; untested. |
| Exotel A/B traffic split "Y" (Kano) | Text "Create a version to test a change on part of your traffic"; no split control visible [O exotel-04-rollout] | Downgrade to P until seen. |
| Exotel trial credits 500 vs 1,000 (public phase) | 150 credits [O exotel-01] | Correct the trial figure. |
| Teardown "0/8 ship category-aware calling windows" (TS, W1) | Exotel's form has a Transactional vs Promotional call type, not shown driving a window [N] | Still 0 category-driven windows; one category field exists. |
| Kano "Simulated-caller tests / evals" Bolna P | No simulation or eval surface in the Bolna nav [Ot] | Bolna moves to N in the dashboard. |

**Pixel corrections to the vendor analyses (this lane).**
1. Retell DNC copy (above) [O retell 13].
2. ElevenLabs batch: the reason for the disabled Submit is stated in the phone field ("Please add a phone number to start batch calling"), with no link to fix it [O elevenlabs 33]. The analyst said "no stated reason".
3. Exotel Campaigns: a "+ CREATE NEW" button sits above the empty table; only the empty-state body lacks an action [O exotel-09].
4. Exotel testing: "Talk to Agent" is a primary header button on every agent page; "phone-only" is unproven [O exotel-02].
5. Exotel traffic split is described in text, with no control visible [O exotel-04-rollout].
6. Bolna's India compliance row includes a "Create one" link and a help icon; it names the fix, and the defect is its timing [O bolna 25].
7. Retell analytics tiles show 0, 0s and 0ms on empty data, the same conflation flagged at Sarvam [O retell 43].
8. Retell's checklist, listed as a strength, also overlays the flow-builder palette and workflow canvas [O retell 80, 76].
9. ElevenLabs' LLM picker, listed as excellent, shows latency ranges up to about 10x (for example 844 ms to 8.93 s), which limits its use for choosing [O elevenlabs 61].

**Effect on W1-W10 (incumbent side only).** W1 compliance: strengthened (6 of 6 forms). W2 CSV: untested (no upload). W3 reply gap and W4 Hinglish turn-taking: untested; the dashboards make the defaults readable for Vapi, Retell and Bolna only. W5 language hold: catalogue evidence only. W6 failure explainability: raw codes (Vapi) and silent disabled buttons (Vapi, Retell) on the incumbent side; Sarvam and Bolna show inline fixes for one gate each. W7 first Indian ring: untested; Bolna person-KYC raises its odds. W8 billing: strengthened (Sarvam 60 s pulse, Retell and ElevenLabs burst on, no spend caps seen). W9 support: not touched. W10 stored config is what runs: strengthened (Vapi autosave and click-to-publish, no unsaved state at Bolna and Sarvam).

---

## 7. What still needs live calls or screen recordings (ordered)

1. **Second dashboard pass, no calls, no spend.** Capture below the fold and from text, never click Create-type menus. Screens: Bolna New Agent draft Engine, Calling and Intelligence tabs (the dashboard-created defaults); Vapi Advanced slider values; Sarvam Listening section; Retell call settings toggles and Agent Handbook (disclosure preset state); ElevenLabs Agent behavior drawer (hinglish_mode) and voice Language filter; Exotel create-agent form and "Talk to Agent"; re-checks of Vapi voices (12 vs 22), concurrent simulations (1 vs 2) and ZDR wording.
2. **Messy 50-row CSV** into draft or paused campaigns where a number is not required (Bolna Batches with an agent selected; others after step 3), using the fail-closed renderer and Delhi 11-series numbers (risk.2026-10-20.synthesis-test-list-dials-strangers). Score out of 50 and rings on N2.
3. **Screen-recorded T0** per vendor with owner-approved KYC and numbers: minutes and clicks from sign-up to a ring on our Plivo line, the CLI series shown, and every gate's stated time and cost.
4. **Stereo Hinglish call battery**, Bolna first (code predicts a 1.4 s floor), on dashboard-created default agents: reply gap p50/p90 (n of 30 or more clean turns), cut-ins at the 2.4 s pause, short replies over the agent, speech during the opening (Bolna toggle off and on), voicemail on Indian operator announcements, silence handling against the captured defaults, and T9c disclosure on default templates.
5. **T7 billing audit**: 10 calls each at 30, 45 and 90 s per vendor; compare invoice lines with the displayed headlines (Vapi USD 0.09, Retell USD 0.134, Bolna USD 0.060, Sarvam Rs 3.5) and the pulses (Bolna 30 s, Sarvam 60 s).
6. **5-user human usability sessions** on the same tasks (create agent, test, number, campaign, find a failed call), because Instinct measured an agent's path, not a buyer's.

---

## Appendix: screenshots re-opened by this synthesis (84)

- **Vapi (15):** 01-welcome-dialog, 02-agent-builder-landing, 06c-free-vapi-number, 24-billing, 33-riley-assistant, 34-builder-Advanced, 34-builder-Analysis, 51-voice-model-dropdown, 56-create-tool-types, 57-transfer-call-tool-form, 62-api-keys, 69-sim-suites, 71-mon-issues, 80-transcriber-languages, 83-campaign-create.
- **Retell (18):** 03-create-agent-dialog, 08-call-transfer-form, 09-model-dropdown, 10-voice-picker, 13-security-shot, 24-batch-create-shot, 25-calls-can-run-shot, 30-buy-number-shot, 41-call-history, 43-analytics, 46-quality-assurance, 5x-settings, 6z-roles, 71-home-onboarding-conductor, 74-kb-add-types, 76-workflow-tab, 77-simulation-tab, 80-conv-flow-builder.
- **Bolna (13):** 01-dashboard-agent-studio, 14-builder-Languages, 16-builder-Engine, 19-voice-library, 20-add-language, 22-new-campaign-dialog, 23-workflow-builder, 25-india-number-options-plivo, 34-account, 36-account-Team-Members, 38-ask-bolna, 39-add-knowledge-base, 40-recharge-dialog.
- **ElevenLabs (14):** 02-after-login, 33-batch-telephony-form, 34-phone-exotel-form, 35-batch-schedule, 36-new-agent, 42-agent-tools, 44-agent-settings, 51-subscription, 54-agent-security, 61-llm-list, 7-analytics, 7-knowledge-base, 8-architect, 9-preview.
- **Sarvam (14):** 01, 02, 03, 06, 07b, 08, 10, 20, 22, 23, 26, 27, 28, 29.
- **Exotel (10):** exotel-01, 02, 04-rollout, 09, 10, 15, 16, 17, 23, 25.

Local text checked: `data/walkthroughs/sarvam/zip/x/sarvam/voices.txt` (companion and Hinglish-named voices; Odia appears once) and `data/walkthroughs/exotel/zip/x/exotel/notes.md` (call type, retries, throttle, nudges, denoiser, account region). Hygiene: retell 08-call-transfer-form.png holds a full +1 number in clear and Exotel 11/12 hold the owner's phone; none is transcribed here (risk.2026-10-21.wt-synthesis-capture-hygiene).

**Graph proposals:** `context/inbox/walkthrough-synthesis.json`, 15 nodes and 40 edges, validated against `scripts/lib/context-schema.mjs` with 0 problems. Every node's `path` is `research/2026-10-21/walkthroughs/SYNTHESIS.md`, which `npm run context:check` will require to exist after the merge, so save this report there first.
