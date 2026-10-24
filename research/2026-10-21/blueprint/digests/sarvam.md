# Sarvam (Samvaad / Voice Agents): dossier

Grades: [M] measured (we ran it; n and method given), [O] observed (capture, spec, screenshot), [V] vendor-claimed, [I] inferred, [U] unknown. Paths are under /home/user/sales-enabler/research/. T = 2026-10-20/teardown/sarvam/report.md (claims SAR-nn, verified in verify.md); A = 2026-10-20/account-phase/sarvam/report.md; W = 2026-10-21/walkthroughs/sarvam/report.md (wt-sarvam-nn; screenshots "sarvam-NN"); R2 = 2026-10-17/lanes/l4b-measured/round2/findings.md.

Read: all of T, verify.md, claims.json, predictions.json, pricing-allin.csv; A; W with claims.json and defaults.json; l4a report and parity.csv; r2-untouched-raw findings and voc csv; R2; voicelab smoke-india-2026-10-19.md; the Sarvam rows of the three SYNTHESIS.md files and teardown/predictions.md; radar watchlist.json; graph nodes. Limits: our two Sarvam keys are Model API class and the Voice Agents control plane refused them (401), so no agent, call log or ledger was ever read; the walkthrough placed no call and never opened campaign steps 2-4, Listening, telephony forms, Boards or Policy; the 14 SAR-P predictions are unscored. Whatever needs a call or login is [U].

## 1. What it is, who buys it, how it makes money

- **Company** [O, medium, secondary]: Sarvam AI, Bengaluru, 2023, a full-stack Indian AI lab (own ASR Saaras v4, TTS Bulbul v3/v4, LLM sarvam-105b) that also sells apps. FY25 revenue INR 29.1 Cr, loss 102.4 Cr, 458 staff; Series B first close USD 234M of 300M at USD 1.5B (HCLTech 150M), June 2026 (l4a data/company-financials.csv, Inc42/MCA).
- **Voice Agents** (internally Samvaad; "Conversations" renamed 2026-08-18) shares one "Indus" account with Model APIs, Doc Agents, Content Studio, Cowork and a coding agent (SAR-01, wt-sarvam-02 [O]).
- **Buyers** [O/I]: enterprise BFSI (Tata Capital CDO testimonial, EMI collections showcase), self-serve Indian SMBs and developers on PAYG, and builders using only Model APIs. Menu spans pre-sale (cart recovery, lead qualification, pre-approved loans) and post-sale (EMI reminders, order status); tagline "Sales, collections, support, bookings" (SAR-61). Its one productised vertical, Cart Abandonment (Shopify, Razorpay, auto-rented number), is pre-sale (SAR-05).
- **Money** [O]: prepaid credits (1 = INR 1) via Razorpay with GST split, UPI autopay, auto top-up (SAR-09); per-minute voice rate by plan; telephony and forwarding pulses; INR 59 number rental; INR 2 per simulated test; Model API tokens; Enterprise postpaid from 2 lakh min/month (about INR 6 lakh/month at INR 3, I). Enterprise-gated: workflows, WhatsApp campaigns, custom tools, voice cloning, human handover, forward-deployed engineers (SAR-11).
- **Edge** [I]: it owns its models, so its price sits on its own cost base. "<500ms", "350M+ conversations", "<5 minutes to go live", ISO 27001 and SOC 2 Type II are [V] (SAR-13).

## 2. Product model and architecture

**Objects** [O; OpenAPI 3.1, 68 operations, 175 schemas]: org > workspace > app (agent; integer versions draft, committed and immutable, deployed) > deployment (inbound) or campaign (outbound), each pinning (app_id, app_version) > cohort (CSV to 100 MB or JSON stream of 1-1,000; valid/rejected counts and a rejected_records file; no duplicate or DND counter) > attempt (one dial, 30 fields: connectivity_status, failure_reason, ended_by, retry counters) > 0..1 interaction (31 fields: original and English transcripts, stereo recording, forwarded_calls blind/warm). Campaign: 0.1-500 attempts per second, retry ladder per outcome (busy, failed, no_answer, short_duration, provider_error, internal_error; max 0-20), per-user phone rotation, allowed_schedule {days, start, end, timezone}, webhook_config. Also boards, tests, BYOK, Actor audit (SAR-16; A).

**Call lifecycle and stack**: signed URL by GET (X-API-Key), then one JSON WebSocket to apps.sarvam.ai: 16 server and 10 client message types (only 8 server payloads typed in the SDKs; tool_call, kb_query, state_transition, language_change unparsed) and base64 headerless 16 kHz PCM, 100 ms chunks. 0 RTCPeerConnections in 8 widget calls, so not a LiveKit or Daily room; server framework [U] (SAR-25/26 [O/I]). Telephony: 7 BYO providers (Exotel, Twilio, Smartflo, Pulse, Intalk, Vobiz, Plivo) or rented numbers (white-label Vobiz) (SAR-27). Models [V]: self-hosted Saaras v4, Bulbul v3/v4 (v3 ends on Voice Agents 2026-11-10), an LLM "constellation" routed per request; no LLM/ASR picker, no BYO, temperature only; members of the constellation [U] (SAR-12/28/29). Hosting [O]: voice runtime and REST on Azure Central India; Model APIs and dashboard API base on AWS Mumbai; dashboard replay config sends sessions to PostHog US with unmasked inputs and network bodies (SAR-21/22/63; real PII leakage [I]).

**What the stored config really does** (mostly unverifiable; honest answer):
- The Voice Agents spec has no operation to create/edit/commit an agent, or for telephony, numbers, KBs, voices, secrets, API keys or DND; authoring is dashboard, Genie and a hosted MCP (OAuth, 24 h token) only (A; SAR-14/15). The "set by API, read back, run, compare" test (W10) cannot be run on Sarvam.
- Committed versions are immutable and deployments pin them [O, schema]; the UI refuses to deploy a draft (sarvam-26). Stored JSON equals running agent: [U].
- Turn-taking: builder shows 3 coarse settings (interrupt, sound sensitivity, eagerness); the STT API beneath exposes 10 frame-level VAD parameters; the mapping is [I]. Temperature slider reads "Balanced" with no number vs documented 0.1-0.9, default 0.3 (W §14.5).
- Drift [M; data/account-phase/sarvam/derived/doc-vs-spec-mismatches.json]: 12 doc-vs-spec mismatches (DND API in docs not spec; three language lists: OpenAPI 13 with Sanskrit, Python SDK 13 with Konkani, npm 11); npm SDK 0.0.42 from March lags Python 1.1.1; MCP metadata advertises refresh_token the docs deny; error envelopes differ per service; channel_provider always null.
- Webhooks [O]: post-call only; config is {url, metadata}; no secret or signature; English-only transcript on campaigns; re-delivery of up to 200 attempts; no mid-call callback.

## 3. Builder and UX end to end

**Best moments** (W §13):
| Moment | Ref |
|---|---|
| Agents hero is a prompt box "What should your voice agent do?", vertical chips, templates (Appointment, Sales discovery, EMI Collection); Genie docked beside every tab, Review agent | sarvam-02, 03 |
| Setting rows: label, plain helper, control; slider plus typed number; disabled tool says what unlocks it | sarvam-07, 05 |
| Inline gate with the fix ("This version is not committed" + Commit version) | sarvam-26 |
| API tool: cURL paste, inline Send, run timing, "@" response mapping, Mock API, Data Verifier | sarvam-06, 06b |
| Test panel docked, Voice/Phone/Chat; Automated tests; price of a test run (INR 2) shown | sarvam-10, 09, 22 |
| Indic: native-script glyphs, "Output numbers in Indic" ("500" to "paanch sau"), mid-call language switch, job-tagged 199-voice catalogue | sarvam-08, voices.txt |
| MCP one-click install with verify prompt; six API recipe cards | sarvam-32, 33 |
| Own prompt template: Persona, Environment, Objective, Speaking Style; "under 25 words per turn; one question at a time" (matches VP brief v2, 33 to 20 words) | sarvam-01 |

**Worst moments**:
| Moment | Ref |
|---|---|
| No save control or unsaved marker, only "v1 · Draft"; an empty draft is accepted | sarvam-03 |
| Commit gate appears only in the campaign modal; Next looks enabled with empty required fields | sarvam-25, 26 |
| Workflows and Secrets render blank; analytics draws a line on no data, Latency "0 ms"; Call Logs default hides failed calls; overdrawn balance (-36.58) in normal type | sarvam-27, 31, 29, 30, 20 |
| No milliseconds in the builder; no latency or price at voice/model choice; unitless pitch | sarvam-07 |
| Two voicemail controls; default voicemail names no company; "Quiet office" ambience ON by default; greeting names vendor | sarvam-05, 07b, 08, 03 |
| "Warm Night Companion" and "Therapist Voice" in a business catalogue; default voice may be the retiring v3 "Shubh" [I] | voices.txt, sarvam-37 |

Steps to a browser-testable agent: 3 actions, 1 required field [I]; phone-live about 8, KYC/BYO forms unseen (W §2). Sign-up to first ring on an Indian line [U].

## 4. Conversation quality and voice

All of the following is Sarvam's anonymous homepage EMI-reminder persona (vendor prompt and config, not a tuned buyer agent), 8 calls (2 per persona), 46 clean turns, from a US-East sandbox with synthetic callers, 2026-10-17 (R2 §1; ledger CMP-06..09, no independent verifier).
| Dimension | Result | Grade |
|---|---|---|
| Reply gap | clean-turn p50 3,116 ms (90% CI by call 2,717-3,400), p90 3,835; about 2.8 s from India (estimate); claim <500 ms | M, vantage-confounded |
| Same models in our India pipeline (Saaras v4, sarvam-105b, Bulbul v4 Flash) | reply gap 968-1,181 ms, first token about 100 ms, n=9 replies, 3 calls; a cold Bulbul socket took 4.3 s | M, smoke (smoke-india-2026-10-19.md) |
| Turn-taking | collisions 8/64 (12.5%); barge-in handled 3/6; cut into a 2.4 s elderly pause 2/2; silent after greeting under about 15 dB babble 2/2 (ASR heard Bhojpuri; the turn never closed) | M, small n |
| Short replies | 11 "haan/hmm/ok" taken as acknowledgement, 5 got no reply; never "are you still there?" | M |
| Language hold | Hindi/Hinglish 38/40 turns; Tamil-Tanglish 20/20 | M |
| Numbers and times | "saadhe teen baje" right 3/4; correction 25,000 to 24,500 missed 2/2; "Monday 3:30, call my son" ignored 2/2 | M |
| Disclosure | claimed to be human in 6/6 calls where asked (persona prompt, not proven platform inability) | M |
| Verbosity | median 24 words per turn; 6/60 over 40 | M |
| Human rating | Sarvam + gpt-oss + Bulbul 6.0/10 in VP lab round 1 (33 ratings, 4 testers; best 7.0) | M, weak |
| Expressiveness | Bulbul V4 "more expressive", "up to 40% faster than V3" (baseline unstated); no emotion feature found (l4a parity) | V / U |

Builder threads on the Model APIs (about 7) report STT/TTS inconsistency, Bulbul over 1 s vs 150-250 ms and Hindi gender confusion (O, anecdotal). Depth: Hindi 83 of 199 voices, English 43, "Hinglish" only inside 3 voice names, Odia 0 voices, Malayalam only a Hindi mix; no Hinglish option and no dialect selection (0 of 6 vendors; l4a). Expression controls are speed, pitch, volume and background sound, not emotion [O].

## 5. Campaigns, telephony and India readiness

- **Campaigns** [O]: 4-step wizard Agent, Recipients, Schedule, Review & Launch (steps 2-4 unseen); API has the best retry ladder in the set, number rotation, cohorts with rejected-records, 60-min max call (SAR-16/42).
- **Numbers** [O]: rented 11/79/80-series 10-digit, INR 59 per 30 days, PAN/Aadhaar KYC as person or company; no 140xx/1600xx (SAR-45). Wallet short means numbers released and campaigns cancelled, no grace (A). Vobiz incidents on three number series (Aug) and a KYC incident (09-20) land on Sarvam (SAR-43).
- **Compliance** [O]: org DND list via API (a "DND lists" recipe card; no DND screen seen); "Calling compliance is your responsibility"; 0 mentions of NCPR, DLT, 140x, 1601, A2P or DPDP over 162 docs pages; free-form window (09:00-18:00 example), no category-aware window, no consent field (SAR-44/49; wt-sarvam-43). Phone rotation "so a contact does not learn to ignore one number" stays on 10-digit CLIs the 2026 amendment does not protect (SAR-47/48 [I]); a promotional cart-recovery call needs 140xx, which it cannot rent (SAR-65 [I]).
- **Residency** [V] "all data including PII stays within India" vs PostHog US replay config (SAR-50/63).
- **Reliability** [O]: Jul-Oct 2026 uptime Voice Agents 99.94% (Calls 99.98%, Telephony 99.95%), APIs 99.57%; 19 incidents including a partial voice outage from model latency (09-24). Limits (concurrent / starts per min): PAYG 4/20, Pro 10/50, Growth 30/150, Business 120/600 (SAR-19, 43).

## 6. Analytics, QA, memory and learning

- **Analytics** [O]: Agent Analytics 7 tabs (the earlier "8 tabs, Log Analyser" was wrong), failure-reason and ended-by filters, Boards (read-only SQL on ClickHouse [V], AI-drafted queries, cron email/Slack), API with masked/hashed contact variants. No per-call cost field; no usage, balance or invoice endpoint (A).
- **QA** [O]: Tests with simulated user and AI judge (verdict plus reasoning per behaviour, up to 20 runs, INR 2 each); Goals as rules on output variables per connected call.
- **Disposition model** [O]: showcase EMI agent captures promised_to_pay, refused_to_pay_reason, willingness_to_pay, wrong_number, dispute, settlement, final_disposition plus self-QA flags bot_went_on_loop, is_hallucinating, language_switch_handling (SAR-60).
- **Memory** [O]: per-call variables, on-start hook for caller context, known-callers CSV, per-contact overrides; no cross-call store; "Memory: Private" in a privacy panel unexplained [U] (SAR-58).
- **Learning** [O]: manual loop (build, test, outcome variables, deploy, metrics, improve); Genie suggestion history; no auto-optimisation, A/B split or bandit (SAR-59).

## 7. Pricing, cost of goods and unit economics

| Item | Value | Grade |
|---|---|---|
| Voice minute (60-s pulse, ex GST, models included) | PAYG 3.50, Pro 3.25, Growth 3.15, Business 3.00 (buyable at INR 1,99,999, sarvam-21/22) | O |
| Plan fees | Pro 9,999, Growth 49,999, Business 1,99,999 /month, returned as credits (marketing page conflicts: 2,000 / 10,000 / 50,000) | O |
| Telephony | 0.20 per 30 s; forwarding 0.40 PSTN / 0.35 SIP per 30 s; number 59 per 30 days; BYO free | O |
| Free / billed | unanswered, busy, failed free; voicemail billed | O |
| All-in per connected minute, ex GST | 60 s 3.40-3.90; 30 s 6.40-7.40; 45 s 4.53-5.20; 90 s 4.40-5.07 (pricing-allin.csv, 36 rows recomputed) | I (not seen in billing; P13 unscored) |
| COGS at its own Growth API list | INR 1.16-1.33/min (STT 0.41, Bulbul V4 Flash 0.60, sarvam-105b 0.16-0.32); our lab 1.39-1.51 | I |
| Self-host cost, margin | unknown (89-93% claim withdrawn, SAR-39b) | U |
| List vs own API cost | 2.3-3.0x | I |

Cheapest self-serve Indian PAYG tracked (SquadStack INR 2-5 and Ravan.ai USD 0.02-0.04 go lower), yet short calls cost 4.4-7.4 effective. sarvam-105b was repriced twice in 8 weeks. VP's INR 2 aim is below its list but near its API-list COGS plus telephony, and Sarvam can follow a cut, so price alone is no wedge (rejected.2026-10-17.parity-undercut; SAR-40).

## 8. What customers complain about, and why they churn

- **Evidence is thin** [O]: no G2, Capterra or Trustpilot page; about 7 builder threads, all on Model APIs, none from platform buyers (SAR-56; r2-untouched-raw §3.2). Codes seen: LATENCY, ASR/TTS consistency, TELEPHONY (SAR-57). Support and billing pain (114 and 107 of 459 coded Indian complaints overall) is unmeasured for Sarvam, not absent.
- **Themes** [O]: "STT accuracy varies noticeably for the same speaker", "response time is too slow for real-time conversations" (r/LocalLLM 1s2cbss), "In Hindi, genders get confused" (r/AI_India 1wkv0jh), one builder moved to Deepgram after a week (r/SarvamAI 1tuj7io), TTS "very expensive" next to Cartesia (SAR-55).
- **Churn mechanisms** [I, no measured rate]: latency vs the <500 ms claim; 60-s pulse on short calls; Vobiz series incidents; forced Bulbul v3 to v4 move on 2026-11-10 and LLM reprices; wallet-empty release of numbers and negative balance shown as normal; unsigned, post-call-only, English-only webhooks and no cost API; Enterprise gates; the buyer carrying TRAI exposure; docs/SDK/spec drift.

## 9. Velocity and likely next moves

[O] 58 changelog entries in 6 months on 27 release days (none in July); Voice Agents 22 entries plus 1 shared between 2026-08-13 and 10-16 (analytics GA 08-13, code tools 08-15, rename 08-18, phone rotation 09-01, transfer, inbound webhooks and Saaras v4 09-02, retention 09-15, MCP and Boards API 09-16, Tests 09-17, Bulbul V4 10-06, volume 10-14, stereo recordings 10-16): about one feature a week since August [I]. sarvamai Python SDK 169 releases since 2025-03 (0.1.37 on 10-12); conv-ai npm SDK idle since 2026-03-30 (SAR-32, radar).
Likely next [I; the 14 SAR predictions test today's product, they do not forecast the roadmap]: DTMF (docs say "planned"); DND screen and agent-authoring REST; webhook signing; a lower PAYG floor (room 2.3-3.0x); 140xx/1600 or SIP partners as the A2P CLI declaration (about 2026-11-18, RS-08) lands; more vertical products like Cart Abandonment; WhatsApp out of Enterprise; a memory feature ("Memory: Private" hint, U).
Predictions that gate VP's Beat claims (teardown/predictions.md TP-023..036, all unscored): P14 (0.9) a "say you are human" prompt is accepted; P09 (0.75) handset p50 1.6-2.4 s, point 1.9, never <0.5 s; P10 (0.65) cut-in on half of elderly-pause trials at default; P05 (0.85) out-of-hours window accepted; P04e (0.85) opt-out row dialled unless added to DND; P13 (0.8) debits match the rate card.

## 10. Adopt
See the adopt array (13 patterns): attempt/interaction split, retry ladder, prompt-box creation with a docked copilot, docked test with simulated-user judge, API-tool authoring, job-tagged voices, gate-with-fix, INR rate table.

## 11. Beat
See the beat array (11 items): tasks Sarvam fails on its own demo or API (disclosure, regulated plumbing, short-call billing, visible reply gap, memory, signed hooks, cost API). Not claimable: list price, Indic language hold (Sarvam holds Hindi on 95% of turns; W5 kills if Sarvam is at or above VP), or "has a copilot".

## 12. Always learn
| Watch | Source | Cadence | Trigger |
|---|---|---|---|
| Pricing | /products/voice-agents/pricing, /api-pricing, docs /voice-agents/pricing (radar normalised diff) | weekly; daily while we set prices | any number or plan change; marketing vs docs conflict |
| Changelog, docs index | docs.sarvam.ai/changelog; llms.txt line-set diff | weekly (about one Voice Agents feature a week) | new entry or doc URL (features show in llms.txt first) |
| OpenAPI hash | Voice Agents spec (68 ops) | weekly | agent create/edit, usage/cost, DND, webhook signature appear |
| Status and RSS | status.sarvam.ai/feed.rss | daily, classified telephony / model / latency / scheduling | Vobiz or model-latency incidents |
| Models, voices, SDKs | /v2/models, Bulbul catalogue, sarvamai and conv-ai on PyPI/npm | weekly | EOL dates, reprices, new message types |
| Compliance and disclosure | docs for 140xx, 1600, NCPR, DLT, A2P, disclosure | monthly, and at 2026-11-18 | any appearance weakens Beat 3 and 4 |
| Complaints | r/SarvamAI, r/indianstartups, GitHub issues, G2/Capterra | monthly | first platform-buyer reviews |
| Account re-run | a Voice Agents workspace key and trial: score SAR-P01..P14, campaign steps 2-4, Listening, telephony, ledger (open.2026-10-20.acct-sarvam-workspace-key) | once the key exists | resolves every [U] |
