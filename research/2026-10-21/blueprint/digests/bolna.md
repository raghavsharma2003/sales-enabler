# BOLNA DOSSIER (id: bolna), consolidated 2026-10-21

Grades: [o] observed (capture, our API read-back, code) / [m] measured by us with n and method / [v] vendor-claimed / [i] inferred / [u] unknown. No call was placed in any pass (spend 0; wallet 500 cents before and after), so every latency, price and default below comes from code, API, docs or the dashboard, never from a Bolna call.
Path keys: TD = research/2026-10-20/teardown/bolna/ (report.md, calibration.md/.json, claims.json BOL-xx, predictions.json); AP = research/2026-10-20/account-phase/bolna/ (report.md, claims.json ACB-xx, blind-scoring.json); WT = research/2026-10-21/walkthroughs/bolna/ (report.md, claims.json as [NN], defaults.json; screenshot numbers are WT numbering); L4A = research/2026-10-17/lanes/l4a-competitors/report.md; R2 = research/2026-10-17/lanes/r2-untouched-raw/findings.md; TS / AS / WS = SYNTHESIS.md under teardown, account-phase, walkthroughs; PR = teardown/predictions.md (TP-001..022).
Read in full: TD report + calibration.md, AP report, WT report, TD predictions.json, DIRECTION.md. Read by section or grep: L4A, R2, TS, AS, WS, PR. The claims.json files were spot-read by id. There is no teardown/bolna/verify.md; calibration.md is its equivalent. OSS clone: data/account-phase/bolna/code (bc59921).

## 1. What it is, who buys it, how it makes money

- Developer-first voice-agent orchestration on an MIT open-source core (Python, 43,962 source lines, 120 files, 2,072 test functions [o AP s0, TD calibration]) plus a closed hosted platform. Bengaluru, YC F2025, seed USD 6.3M (General Catalyst, 2026-01-20), 1,050+ paying customers (~75% self-serve), ~INR 50 lakh/month revenue [v L4A s3; ledger CMP-19: ~INR 4,900/month per customer]. Scale claims contradict (400k calls/month vs 200k/day; team ~25 vs 51) [v BOL-42]: unverified.
- Buyer: builders and ops teams at Indian SMB, mid-market and BFSI who bring their own prompt, integrations and compliance. Self-serve PAYG and Pilot packs; Enterprise adds India residency, on-prem images, sub-accounts, AWS Marketplace (since 2026-09-02), forward-deployed engineers [v BOL-08]. Hiring is GTM-heavy: BFSI enterprise sales (2026-10-15), enterprise lead, 2 marketing, growth, an LLM-as-judge QA annotator; no core-engineering role [o BOL-43]. Direction: up-market into BFSI post-sale [i].
- Money: prepaid USD wallet (Stripe). The flat 6.0 cents/min covers "preferred models" only; any other model bills at base usage (STT/s, LLM/token, TTS/char with a cost multiplier) [o AP s8, WT [26]]. Revenue is minutes, not seats; Team Members is a sales-gated paid feature.

## 2. Product model and architecture

**Objects (AP s3, ACB-21) [o].** Org (wallet in cents, concurrency, BYOK keys, custom LLM/TTS endpoints, Enterprise sub-accounts) > Agent (tasks[] with toolchain, tools_config, ~35 task_config knobs; calling_guardrails; dispositions; extractions) > Batch (CSV + retry + webhook) or Workflow > Campaign (pins a version; entries keyed by reference_id) > Execution (one call: status, transcript, cost_breakdown{llm, network, platform, synthesizer, transcriber} in cents, telephony_data with hangup reason and provider code, recording, summary, extractions, raw component log). **There is no contact, lead, consent, DND or memory object** (ACB-21, BOL-60); the only cross-call state is a workflow execution's state.* (ACB-18). Two overlapping outbound systems: Batches report only valid/total counts; Workflow campaigns give row codes (invalid_phone, missing_required_value, duplicate_reference_id, empty_row), allow corrective re-upload, default numbers to +91, and dedupe on reference_id, not phone (ACB-19/20).
**Lifecycle (AP s5-6) [o code].** Provider REST dial, answer URL returns Plivo XML/TwiML, WebSocket /chat/v1/{agent_id}; Vobiz speaks the Plivo protocol; web calls and v2 SIP trunks go SIP.js 0.21 > Kamailio > FreeSWITCH (mod_audio_stream fork); legacy trunks use Asterisk. Telephony STT is 8 kHz. Asyncio loops joined by queues; an output gate returns SEND/BLOCK/WAIT per chunk; marks confirm what played and history commits only heard audio. LLM text reaches TTS at a 40-char buffer cut at the last space, not at sentence ends. Status: scheduled > queued > initiated > ringing > in-progress > call-disconnected > completed; terminals busy, no-answer, failed, canceled, stopped, error, balance-low; plus `rescheduled` and an undocumented `prepared`. 12 hangup_detail codes (llm_prompted_hangup, voicemail_detected, inactivity_timeout, max_duration_reached, component errors, client_disconnected).
**Stack [o].** Saved dashboard agent: Plivo, Deepgram nova-3 hi, OpenAI gpt-4.1-mini, ElevenLabs Turbo v2.5 "Tripti", ambient None (WT [54] corrects BOL-25's "Vobiz / Azure / office noise"). STT 11-13 providers incl. a self-hosted `bolna` (nemotron-asr-hi); TTS 16; LLM native OpenAI/Azure (PTU overflow)/Gemini, LiteLLM only for a long tail of 12 (BI-06); speech-to-speech via OpenAI Realtime and Gemini Live. 38 models sit inside the flat price (9 ASR, 13 LLM, 16 TTS) [WT [35]]. Hosting: AWS ap-south-1 plus a us-east-1 ws cluster [o BOL-17]; docs say US default, infra says Mumbai (BOL-18; TP-018 open).
**What the stored config really does [o AP s1.6].** An API-created agent stores the OSS Pydantic defaults, not the documented ones:
| Setting | Docs | Stored | Dashboard saved agent |
|---|---|---|---|
| words before interrupt | 2 | 1 | 1 |
| incremental_delay | 400 ms | 900 ms | "Linear delay" 900 |
| endpointing | n/a | 500 ms | 500 |
| hangup_after_silence | 10 s | 20 s | 20 (notes) |
| call_terminate | 300 s | 90 s | 90 (notes) |
| TTS stream / buffer | true / 250 | false / 40 | n/a |
Unknown fields: 201 and silently dropped; documented `llm_agent.routes` accepted, not persisted. Caveat: the dashboard agent's creation path is unknown (synthetic-named, maybe API-written), so "dashboard users get a 900 ms hold" is unproven (WT s5). Hosted can lead OSS by hours (BOLNA-2967 forces streaming despite stream:false; ACB-57).
**Hidden machinery.** (a) Language switch: a pre-warmed STT socket per language, an unbiased Sarvam saaras:v3 language-ID stream, a claude-haiku-4-5 judge with ~15 Indic rules (duplicate request at 1.8 s, give-up 6 s, code comment p50 ~1.4 s), then an atomic swap of STT+TTS+prompt with a handoff clip. Their strongest piece, but a whole-stack swap, not one code-mixed register. (b) Auto-judges: 5 s and 25 s after agent creation Bolna writes "Call Success" and "Call Completion" gpt-4.1-mini dispositions rewritten from our prompt, Hinglish-aware, free, hidden from list endpoints (ACB-12/13; risk.2026-10-20.acct-vendor-prompt-processing). (c) Failover covers the LLM only (Azure provisioned > pay-as-you-go overflow on 429/5xx); STT/TTS only reconnect; circuit breaker in shadow mode; one carrier per agent. (d) Graph agents add a serial forced-tool routing LLM hop per reply unless a deterministic edge matches.
**API [o].** 128 operations / 96 paths / 183 schemas rebuilt from doc fragments; openapi.yml 404s. Bearer `bn-` keys; a Z-timestamp returns HTTP 500; schedules round up to 10 min; webhooks unsigned (IP allowlist only) [BOL-14, AP s7].
**Method accuracy.** Blind inference vs code, 20 checkable uncontaminated rows: 16 correct/4 partly/0 wrong lenient (0.90, Brier 0.089), strict 10/10; second rater 14/6/0 (0.85) [m n=20, TD calibration.md]. Docs-based rows 13/14; mechanisms read from bundle flags 1 of 4; every timing constant and 16 code features were missed.

## 3. Builder and UX end to end (WT report)

IA: Ask Bolna (Beta) / Agent Studio, Graph Agent, Workflows (Beta), Knowledge Base / Campaigns (Beta), Batches, My Numbers, SIP Trunks / Call History, Analytics (Metabase), Reports, Debugging. Agent Studio = master-detail with 7 tabs (Agent, Intelligence, Languages, Engine, Calling, Tools, Extractions) and a sticky footer with Save and "Get a call from agent".
**Best moments.** Persistent cost-per-minute header with a component bar on every tab (01, 16); transparent price table, 3.5 + 0.5 + 2 = 6 cents, 30 s pulse, "Show models" (34/35); per-language chips each carrying prompt, voice and transcriber (14, 20); sectioned Canvas prompt with token counter and `{{ }}` / `@` / `#` (20); voice picker with search, gender chips, preview (19); dependent fields greyed with reasons ("Pick a workflow and version first", 22); workflow node descriptions that state their contract (23); SIP trunk Health / Active calls / Last call columns (05); API and MCP buttons on every list page (09); recharge with INR equivalents (40); Vobiz KYC lists documents before the click (36-account-Vobiz-KYC); Ask Bolna reads and writes (38); webhook Send test (18).
**Worst moments.** Campaigns, the core outbound feature, is Beta and needs a published workflow, with batches a separate agent-scoped path (46, 47). Endpointing 500 + Linear delay 900 sliders with no sum, no text, no predicted reply gap (16). No unsaved marker; Save always on (21). No price or latency per option; non-preferred models silently leave the flat price [i] (14). The Hindi voice list is not language-filtered, has no language field, and includes an Omani Arabic voice and romance-register voices ("Girlfriend Voice") in a business catalogue (19, 22); 22 add-language options, no Hinglish, "India Multilingual" unexplained (20). India compliance appears only as a red error after choosing India in a US-defaulted buy dialog ("615" helper, Subscribe disabled with no tooltip, no price before Subscribe) (24, 25). Two banners eat ~90 of 720 px; clipped sidebar; a floating bubble hides fields; workflow canvas opens at 175% (00, 13, 18, 23). Invite Member looks active but is gated; USD invoices with cents, dollars and rupees mixed (34, 40). Test = a phone call to a verified number; no in-builder chat, web-call button, simulation or eval surface seen [o WT [40]]. First working agent is ~5-7 steps, one required field, plus phone verification [i, [10]]. Auto Build and Graph Agent were never captured [u].

## 4. Conversation quality and voice (nothing measured on a call)

| Item | Finding | Grade |
|---|---|---|
| Reply-gap floor | 500 ms endpointing, then the output gate holds audio until 900 ms after the final (from the 3rd history entry); LLM/TTS run inside the hold; plus frame buffering and transport. Floor ~1.4 s | [i] code + stored defaults (AP s1.2; spot-checked in AS); TP-016 p=0.7 for p50 1.3-2.2 s, open |
| Vendor / user latency | Vendor "<300 ms"; issue #235 "4 s"; a competitor-run blind test (Tough Tongue AI, n=150) 1.5-2.0 s, English replies to Hindi, context restarts | [v] / hypothesis only (conflicted source) |
| Short Hindi replies | While the agent speaks, a final of 1 word or fewer is discarded unless it exactly matches an English stop list: "nahi/haan/ruko/bas" never reach the LLM. Stop and filler lists are English-only | [o code]; unmeasured on a call |
| Speech over welcome | Dropped (voicemail evidence only); dashboard toggle "Ignore user speech before welcome" is OFF by default, so the claim needs a condition | [o code] vs [o UI], open |
| Barge-in recovery | History trimmed to heard text; unheard user turns merged and regenerated (0.7 s settle); duplicate reply blocked; barge-in deferred during tool calls; Flux eager end-of-turn | [o code]; well engineered |
| Code-switching | Judge machinery (s2), whole-stack swap, extra judge latency, no Hinglish option | [o] |
| Hindi check-in | English "Hey, are you still there" (24 chars) in a Hindi agent | [o code + UI [33]] |
| Voicemail | gpt-4.1-mini transcript classifier; waits for 7+ words, checks every 7 s up to 30 s, billed meanwhile; "haan bolo" = human; no Hindi or regional operator messages | [o] ACB-41; TP-011 open |
| Expressiveness | No expressive control surfaced; ElevenLabs Turbo default; 40-char chunks likely hurt prosody | [o]/[i] |
| AI disclosure | No setting seen; TP-021 (admits AI when asked) open | [u] |
Read: interruption engineering is mature; defaults are English-tuned and slow, and the customer can neither see nor fix that. Voice naturalness is unproven, not proven good.

## 5. Campaigns, telephony and India readiness

- Outbound: single-call API; Batches (CSV, schedule rounds up to 10 min, retry up to 3 with intervals); Workflow campaigns (CSV or JSON up to 32 MB / 150,000 rows, funnel and termination-reason reports, pause/resume/abort) [o WT [46]]. Nodes: agent, extraction, api, callback, wait, retry, condition, aisensy_whatsapp, end; the `notify` effect has "no executor yet". Inbound: number > agent, caller lookup (API/CSV/Sheet), spam caps, allowlist.
- Telephony: hosted India numbers (Plivo/Vobiz) after a compliance application; BYO Twilio, Plivo, Exotel, Vobiz; SIP trunks v2; Truecaller verify per number. Transfer POSTs no summary after a fixed 2 s sleep, so it is effectively cold (ACB). DTMF off by default. Concurrency: trial 2, Pilot 25.
- Compliance is reactive [o]: guardrails off on create, whole hours, recipient timezone, bypass flag; OSS default timezone America/Los_Angeles; dashboard window 09:00-21:00 per agent, enforcement default unseen. TCCCPR primary text gives 10:00-21:00 for promotional calls, so 9-21 is wrong (TS s184). No NCPR/DND scrub though the security page claims DNC integration (BOL-46); consent = upload proof after a provider violation report; DLT/PE left to the buyer (INR 5,900; 140 via Vobiz, 160 needs an RBI/SEBI certificate; BOL-44). Zero India compliance lines in the engine (calibration). Number KYC accepts PAN+Aadhaar (persons) or PAN+GSTIN (companies) [o WT [53]], correcting "CIN, Pvt Ltd only" (BOL-45).
- Residency: Enterprise only, Plivo + Azure OpenAI, no BYOK (own key silently routes via US) [o BOL-49]. "DPDP certification" is AWS listing copy [v].
- Reliability: 18 de-duplicated status incidents in 6 months: 9 upstream Indian telephony, 3 model-provider, 2 latency, 2 queue (incl. 2026-10-13 India scheduled calls not placed), 1 webhook [o BOL-40]; issues #614 (no audio on a Vobiz route), #1092. We never reached a ring on an Indian line (WS finding 4); W7 is untested.

## 6. Analytics, QA, memory and learning

- Per call: transcript, recording, cost lines, raw log, per-turn progression, summary, extractions with confidence and reasoning, dispositions, ratings and feedback tags [o API]. Dashboard analytics is a Metabase iframe: volume by status, hangup initiator and reason; no cost, latency or outcome chart title [o WT s10]. Debugging is execution-ID search only. Whether the UI shows transcripts, cost cards or per-turn latency is [u].
- Outcome analytics: auto-judges exist but are hidden and vendor-owned; the Extraction Library shows only Call Summary [o].
- QA/simulation: none in the nav; an LLM-as-judge QA pipeline with annotators is being built (job post 2026-08-18) [o BOL-43/61]. Thinnest of Vapi, Retell and Bolna here [WT s7].
- Memory: none. Per-call variables and inbound lookup only; issue #1078 "MemCode recall" is open [o BOL-60, L4A]. Learning: no experiments or traffic split (docs say clone an agent and compare recordings); the raw signals exist but no loop is productised [i BOL-62]. Learning loops are human-gated at every vendor (AS).

## 7. Pricing, COGS and unit economics

- List [o BOL-33, WT [26][28]]: PAYG 6.0 cents = 3.5 voice + 0.5 telephony + 2.0 platform, 30 s pulse on all three; $5 trial = 83 min. Top-ups with bonus: $600 > 11,500 min (~INR 4.98); $1,500 > 30,000 (~4.77); $3,000 > 66,500 (4.51 cents, ~INR 4.30). Pilot $300/6,500 min (~4.6c) or $500/12,000 (~4.2c), 25 concurrent. AWS tiers ~5c to ~4c annual [v BOL-34]. Billed in USD; INR is an overlay (~95.3/USD).
- The dashboard puts the 2-cent platform line inside the 6, supporting "included": PAYG all-in ~INR 5.72 [o display; unverified until an invoice]; the earlier 6.1-8.0 range (BOL-36) narrows to ~5.7-6.1 [i]. Volume plans INR 4.2-6.6 [i].
- Short calls: the 30 s pulse makes a voicemail or no-answer cost at least ~3 cents (~INR 2.9) [i WT [52]]; AP s8 "rounded up per minute" is wrong.
- COGS of the default stack INR 2.0-3.8 per connected minute (mid 2.8): Deepgram 0.55-0.87, gpt-4.1-mini 0.38-0.89, ElevenLabs 0.67-1.34, telephony 0.38-0.48, infra 0.05-0.2 [i BOL-37]; gross margin 46-72% PAYG, 22-60% Pilot, 18-58% AWS annual [i BOL-38]. A reported enterprise INR 1.75-2 [v, low] sits at or below that COGS, implying cheaper or self-hosted models (they run their own ASR/LLM provider types). Margins let Bolna follow a cut [i TS s6]. Price history: $0.10 > $0.05 (2025-12) > monthly plans > PAYG 6c with tiers to 4.5c, -40% at entry in 6 months [o L4A].
- VP's ~INR 2 ambition is under Bolna's displayed floor (INR 4.30) and near its COGS: VP wins on a cheaper stack, not a discount on the same one (rejected.2026-10-17.parity-undercut).

## 8. Complaints and churn

- Trustpilot (re-read 2026-10-20): 4 reviews, 2.6, all 1 star, Jan-May 2026: repeated demo bookings with no callback; paid for a pilot then refused; refund unanswered for months; "terrible" support [o TD s7; R2 s3.2: BILLING 4, SUPPORT 3, SALES_DELIVERY 2]. n=4: a signal, not a rate. Reddit 2026-02-02: wants an alternative that works on Indian numbers; "problem is the price and not much configuration" [o].
- GitHub (125 issue titles, L4A): questions 35, tools/integration 25, reliability 15, turn-taking 14, ASR 14, TTS 13, telephony 10; e.g. #614, #1092, #896 swallowed exceptions, #902 graph silently falls back to OpenAI. Half of recent incidents are upstream Indian telephony with no carrier failover.
- Churn drivers are [i] (no churn data exists): trust loss from sales, support and refund non-response; wallet and fee/pulse surprises; Indian PSTN, KYC and DIY compliance friction; paying per minute for a reply gap and short-reply handling nobody can see or tune.

## 9. Velocity and likely next moves

- Changelog 72 entries May-Oct 2026 (13/10/8/14/15/12 per month) vs 36 in Nov 2025-Apr 2026 [o BOL-39]; ~696 OSS commits since 2026-01-02 [o L4A]. Skew: models/providers, developer tooling (MCP as a Claude connector 2026-10-09, CLI beta, 20 Skills, edit-prompt-by-chat), graph agents, SIP trunks (2026-10-15), compliance-application API (2026-10-12); little on campaign ops or India compliance. Peers: ElevenLabs 195 items, Vapi 82, Synthflow 67, Sarvam 58 (TS s4).
- Likely next [i, from BOL-43/61/62, ACB-19, TP-017/018]: (1) BFSI enterprise post-sale, AWS Marketplace, residency; (2) Workflows/Campaigns leave Beta and the two outbound systems merge; (3) compliance becomes a feature once a BFSI buyer asks (NCPR claim and Violations tab already exist); (4) productised QA/judges from the LLM-as-judge hire; (5) a contact/memory object when #1078 lands; (6) more Realtime (dashboard "Cascaded or Realtime Beta"); (7) price steps toward the INR 1.75-2 enterprise tier.
- Prediction status (PR TP-001..022): TP-001 trial-verified-numbers clause observed; TP-006 weakened (+91 default); TP-002 premise weakened (person KYC); TP-003, 011-016, 021, 022 and the CSV items open until calls and a real upload. Also entering the lane: ElevenLabs lead-level campaigns (in bundle), SquadStack and Gupshup self-serve (TS s4).

## 10. Adopt
See the adopt field (12 patterns).

## 11. Beat
See the beat field (12 testable places); pass/kill bars follow W1-W10 in TS.

## 12. Always learn
| Signal | Source | Frequency |
|---|---|---|
| OSS HEAD diff vs bc59921 (turn-taking, constants, prompts, India code, dead code going live) | github.com/bolna-ai/bolna | weekly; at once on any turn-taking commit |
| Changelog, classified (model, India, ops, QA, memory) | bolna.ai changelog | weekly (~3/week) |
| Docs dump hash (llms-full.txt, ~1.9 MB) and rebuilt OpenAPI diff | docs hosts | weekly |
| Pricing page, recharge tiers, platform-fee line, AWS listing | pricing + dashboard Account | weekly (price moved 4 times in 10 months) |
| Status RSS by upstream | status.bolna.ai | weekly count; same day for India telephony |
| Dashboard walk: Auto Build, Graph Agent, fresh draft-agent defaults, Campaigns GA, auto-judges exposed | trial account | monthly and on any dashboard changelog entry |
| Job posts, funding, headcount | Ashby, Inc42 | every 2 weeks |
| Trustpilot, Reddit, GitHub issues; SDK and bundle diff | public; npm @bolna/web-call | monthly |
Tripwires that change our plan: a contact/consent/DND object or NCPR scrub; semantic turn detection or a Hindi stop list; a code-mixed Hinglish option; carrier failover; webhook HMAC; experiments or a learning loop; memory (#1078); public INR 1.75-2; a predicted reply gap in the UI; docs/server drift fixed. On any tripwire, re-run the call battery (open.2026-10-20.acct-bolna-battery-items).
