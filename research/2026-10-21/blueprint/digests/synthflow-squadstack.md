# Synthflow and SquadStack dossier (public material only: no account, no call, no walkthrough)

Grades: O observed, I inferred, V vendor-claimed, U unknown. Paths relative to /home/user/sales-enabler; S = research/2026-10-20/teardown/synthflow/, Q = .../squadstack/, T = research/2026-10-20/teardown/, W = research/2026-10-21/walkthroughs/, A = research/2026-10-20/account-phase/. Ids (SYN-nn, SQS-nn) are in each claims.json.

**Read:** S/report.md, verify.md, claims.json, pricing.json, parity-delta.csv, predictions.json; Q/report.md (with its verification section), verify.md, cogs.csv, claims.json, predictions.json; T/radar/report.md; vendor rows of T/SYNTHESIS.md and T/predictions.md; A/SYNTHESIS.md and W/SYNTHESIS.md (neither vendor has an account-phase lane or walkthrough); l4a report and complaints.csv; r2-untouched-raw/findings.md; five Synthflow docs pages; the saved login and app captures of both.

**Reading rule:** verifiers downgraded or partly refuted 34 of 309 claims (server framework read from client code, analogue margins, bundle-constant defaults; T/SYNTHESIS.md 1.2). Corrected text wins.

## 1. What it is, who buys it, how it makes money

| | Synthflow | SquadStack |
|---|---|---|
| What | Berlin no-code voice and chat agent platform, founded 2023; $20M Series A (Accel, 2025-06), about $30M total (V: SYN-54). | Noida, 2015. Managed human plus AI telecalling, now sold as voice AI with human hand-off; own ASR "Arth" (V). $24.6M raised; FY24 revenue INR 26.5 Cr, half of FY23; loss 46.3 Cr (l4a, secondary). |
| Buyer | Enterprise inbound customer service and contact centres (O: SYN-51); formerly agencies and SMB. Claims 1,000+ customers (V). | Indian enterprises, BFSI-weighted (Kotak, AngelOne, IIFL, TATA AIG, Flipkart; V). Strongest in pre-sale conversion. |
| Motion | Sales-led: sign-up "may be reviewed"; Pro, Growth, Agency "no longer sold" (O: SYN-03/04). | "Book a Demo" everywhere; staff create campaigns; Pilot (90 days), Scale, Strategic (O: SQS-01/34). 10 of 22 open roles are sales or marketing (O: SQS-45). |
| Money | Enterprise from $30,000 a year (INR 28.5 lakh), per-minute rate unpublished (O: SYN-40). Path: $29-1,400 plans plus $0.13 overage (2024-12) -> PAYG $0.15-0.24 (2026-03) -> enterprise-only (2026-09) (l4a). In-product reselling ended 2026-09-15 (O: SYN-44). | Per second of live conversation, "typically INR 2-5/min" incl. telephony (V: SQS-35), plus a setup fee per use case; an SEO page says "$0 setup" (O: SQS-38). BFSI revenue-linked pricing from 2026-09-14: low base plus success fee (V: SQS-36). |
| Direction | Up-market and in-housing: own TTS (2026-05-13), own LLM forced on non-enterprise agents (2026-08-25), own STT (O). | Self-serve behind a gate: ai-platform.squadstack.ai and Osno (app.osno.ai), both allowlisted (O: SQS-04/68/70); 3 of 4 product roles are for a self-serve "Voice AI platform" (O: SQS-45). |

Neither lets an Indian buyer start in an afternoon.

## 2. Product model and architecture

**Synthflow (O: SYN-01/02/06/08).** Public OpenAPI: 69 paths, 110 operations, three regional bases. Objects: Agent (Prompt Builder or node-based Flow Designer) -> Actions (booking, TEL/SIP/dynamic/phone-book transfer, HTTP, in-call SMS/WhatsApp, MCP) -> Knowledge base -> Memory group -> Test Center suite -> version and deploy -> number or channel -> Campaign -> Workflow -> Call. The Call object is telephony-first: 14 statuses, 10 end reasons, ring and connect times, per-leg RTT, jitter, loss, MOS, action timeline. A Contact is name, phone, email, company: no consent, DND or timezone field and no suppression endpoint in 110 operations.

**Synthflow lifecycle and stack.** Own signalling and media (I: SYN-22; Kamailio, RTPEngine, FreeSWITCH job post and fork) -> STT (Deepgram, Nova-3, Synthflow STT, Soniox) -> LLM (Synthflow LLM; OpenAI on Enterprise) -> TTS (ElevenLabs default, Aura-2, Synthflow TTS) -> post-call judge fields, extractors, signed webhooks (O: SYN-27/29/30). Browser audio via Janus; custom clients via a WebSocket media API (SYN-23/24). GCP us-east1, europe-west3, LATAM; no India (SYN-20/21). Orchestrator probably Python, in-house or framework unknown (I: SYN-26).

**What stored config really does.** Synthflow had no account phase (A/SYNTHESIS.md 222). The one public case: on non-enterprise plans a request setting llm to a GPT value is accepted, looks normal, and the agent stays on Synthflow LLM with no signal (O: SYN-09). The four vendors that were read back all drifted from their docs (T/SYNTHESIS.md W10); Synthflow fits the pattern but was not measured.

**SquadStack (O: SQS-03/13/14/15/16).** Portal: a 61-route Next.js manifest: campaigns (blocks Voice Bot, Lead Router, human Call, IVR, SMS with Sender ID and DLT Entity ID, Email), leads, prioritisation rules, call details, observability, billing, human-telecaller "players". The root object is campaign and lead, not agent: judgement, bucket-to-outcome map, redial count (I). Public API: a 2024 Postman collection for lead ingestion only (100 requests a minute, mandatory IP whitelist) plus per-customer disposition webhooks. No developer docs, changelog or status page (SQS-12/43).

**SquadStack AI-platform agent (O: SQS-16/72/73).** Temperature 0.5, max tokens 100, session cap 240 s, idle 10 s x 3, deterministic language switching, summarise after 5 turns; LLM and STT routers with fallback and hot-swap; TTS speed, volume, emotion, default ElevenLabs Flash v2.5 (the "Multilingual v2 default" was refuted, SQS-21); closing tools transfer_call, send_link, hangup_call, dnd_request, schedule_callback; test call and chat. Stack: Pipecat client and Daily transport in the SDK (server side inferred, SQS-23); Exotel, Ozonetel, Plivo; AWS Mumbai origins; OpenAI and Plivo are US subprocessors; ElevenLabs, Cartesia, Sarvam, Daily, OpenRouter are missing from its subprocessor list (SQS-24/52). "Owned, not orchestrated" is contradicted; only Arth ASR is plausibly in-house (V). Memory in code is intra-call only (SQS-74).

## 3. Builder and UX end to end

**Evidence limit.** No screenshot of either builder's interior exists. Synthflow's app capture is a loading spinner (data/teardown/synthflow/capture/app.png); its login page shows 4.4/200+ and G2 4.5/1,000+ against 4.1/215 on Trustpilot (login.png; G2 unverified, SYN-73). SquadStack's AI platform shows a login: "Build, deploy, and optimize personalized AI voice agents in minutes" (data/teardown/squadstack/har/ai-platform.png). The Instinct walkthroughs covered six other vendors. No time-and-motion data exists.

**Best moments.**
- Synthflow names the product after a loop (Build, Evaluate, Launch, Learn) and offers "describe the agent to Aurora and it builds v1" (docs-md/getting-started.md). Aurora reads your real agents, logs, KBs and simulations and edits them, with inline call cards and version diffs; same tool set as the MCP server and the Claude, ChatGPT and Codex connectors; Enterprise-only (docs-md/aurora.md; SYN-15/16).
- Test Center: generated suites per agent, parallel, rerun after every change (docs-md/simulations.md).
- Engineer-grade call detail: SIP ladder, PCAP, live listen-in, per-leg RTT/jitter/MOS, transfer failure reasons (SYN-08).
- SquadStack: one canvas mixing bot, human caller, IVR, SMS with DLT fields and email; lead router and prioritisation (SQS-03/05); closing tools as triggers including dnd_request and schedule_callback (SQS-72); Lift's locked sections and staged rollout (SQS-64, V, no screen seen).

**Worst moments.**
- Synthflow: review-gated sign-up, $30k floor, a legacy Bubble shell for auth and settings beside the React app (SYN-04/14/40). Campaigns API-only and Enterprise-only, 7-day auto-cancel, no retry, window not editable and cannot cross midnight, clashing agent hours fail recipients at once, no per-campaign webhook (SYN-05). A GPT value silently ignored (SYN-09); failure labels that are raw Python exceptions and internal URLs (SYN-71); an open 60-flag snapshot that leaks roadmap (SYN-33); half the platform gated to Enterprise (SYN-03).
- SquadStack: no developer docs or status page; call search spans 10 days and shows an outcome label; STT/LLM/TTS failures only as aggregate counts (SQS-12/18/28). ROI calculator is three fixed multipliers; its own claims disagree (SQS-39/60). Sign-in: "temporarily disabled for external users" (SQS-70).

## 4. Conversation quality and voice

We measured nothing on either: no call placed (Synthflow's demo needs Turnstile plus an email code; SquadStack's builders are allowlisted). Predictions below are pre-registered and unscored.
- **Latency.** Synthflow docs: in-region RTT under 100 ms, MOS above 4.2, Synthflow TTS 100-200 ms first audio (V). Its call-quality card (turn latency p50/p95) is behind flags off for every workspace (O: SYN-13). SquadStack claims median reply 0.8 s or less and Arth 67 ms finalize (V). Our predictions for the Indian handset: Synthflow p50 at least 1.6 s (SYN-P09, p=0.6); SquadStack 1.0-1.6 s (SQS-P10, p=0.75).
- **Turn-taking.** Synthflow endpointing modes speculative, faster, high_accuracy plus an eager-end option (O: SYN-27). SquadStack: idle and session caps only.
- **Hindi and Hinglish.** Synthflow: Hindi is the only Indic language, no en-IN, "Multilingual" is Deepgram's ten-language set with English-biased Synthflow TTS (O/I: SYN-28/65); predicted English answers with Hindi words on 30% or more of Hinglish turns (SYN-P10, p=0.55). SquadStack: 9 Indian languages (V), in-house STT started with Hindi, English, Hinglish (V: SQS-20); predicted 90% or more Hindi/Hinglish hold (SQS-P11, p=0.8).
- **Expressiveness.** Synthflow: ElevenLabs audio tags, cloned voices (O). SquadStack: speed, volume, emotion fields; its naturalness proof is an "Abruptly Disconnected Rate" (about 10% vs 40%, V) and a "Turing test" scoring a listener who picked at least one of two AI clips as human (O: SQS-58/59).
- **Disclosure.** Synthflow: a consent toggle and an example text, none by default (O: SYN-62). SquadStack: "configurable" (V: SQS-46); its market rewards passing as human (risk.2026-10-20.squadstack-humanlike-norm).

## 5. Campaigns, telephony and India readiness

- **Campaigns.** Synthflow: list through API, 1-10,000 recipients a request, 1,000,000 a campaign, no CSV upload documented (O: SYN-05). SquadStack: CSV with a failed-rows file, per-campaign lead API, disposition and redial logic (O/I: SQS-13/15).
- **Numbers.** Synthflow sells US, Canada, Australia only; its custom providers include no Indian carrier (O: SYN-43; I: SYN-61). SquadStack rides Exotel, Ozonetel, Plivo; no 140, 160 or 1600 mention anywhere; it sells "spam number rotation" (O: SQS-48).
- **Compliance.** Synthflow: 0 India mentions in 370 docs pages (no TRAI, DLT, NCPR, DPDP); opt-out only as a post-call judge flag that did not run for 2 h 50 m on 2026-08-07 while webhooks still fired empty (O: SYN-60/07; I: SYN-66). SquadStack: DNC blacklist marked "verified DND by scrubbing", in-call dnd_request, DLT fields (O: SQS-47/72); a 23:00-09:00 pause in code, wider than the marketed 9:30-20:30, enforcement unseen (O: SQS-71); buyer warrants consent; no DPDP notice to people called (O: SQS-50/51).
- **Region.** Synthflow: EU/US/Global clusters fixed at creation, no India, PII redaction without Aadhaar or PAN (O: SYN-21/64). SquadStack: Mumbai origins, US subprocessors, SOC 2 Type II and ISO 27001 listed (O/I: SQS-52/54).
- **Voicemail and transfer.** Synthflow: voicemail end reasons, Indian operator announcements untested; warm transfers consume attempt capacity (O: SYN-11). SquadStack: voicemail classified after the call from transcript keywords, 0 AMD matches in the editor (O: SQS-11); transfer_call() exists, destination unseen (O: SQS-10).
- Synthflow's India routes: a PoP "on request" (V) or a buyer-built bridge from an Indian CPaaS stream (I: SYN-61); lawfulness for 140/1600 not established.

## 6. Analytics, QA, memory and learning

- **Analytics.** Synthflow: logs, per-call quality metrics, CSV export, post-call judge fields (persona, steps, objections, goal, opted_in, no_opt_out) (O: SYN-13/82). SquadStack: reports, downloads, charts by provider (O).
- **QA.** Test Center and custom evaluations; agent evals and QA config at SquadStack (O: SQS-65). Simulation is parity at 6 vendors (RAD-52).
- **Memory.** Synthflow: per-contact summaries (questions, solutions, preferences) injected at call start, keyed by phone, shared across voice, SMS, WhatsApp (O: SYN-80). SquadStack: Persistent Memory marketed (up to 20 extraction points, Refresh or Rolling History, stale flag) but code shows intra-call memory only (V/O: SQS-62/74).
- **Learning.** Synthflow's loop is manual despite "agents improve continuously"; no A/B or fine-tuning documented (O: SYN-81). SquadStack: Lift (V) and Optimize 80/20 splits with a significance flag (V/O), no screens in bundles. Learning is human-gated everywhere (T/SYNTHESIS.md 4).

## 7. Pricing, cost of goods, unit economics (FX 95, ex GST)

| | Synthflow (I) | SquadStack (V/I) |
|---|---|---|
| List | Enterprise from $30k a year; last public PAYG $0.11-0.14 platform, "typically $0.15-0.24" (2026-03/06). | INR 2-5 a live minute incl. telephony; Osno advertises $0.04-0.08 (V: SQS-40). |
| All-in Indian minute | INR 15.2-25.6 via BYO Twilio. If $30k is a usage commitment: INR 47.5 a minute at 5,000 min/month, 23.75 at 10,000, not binding above about 9,000-16,000. If a fee on top, add 47.5 / 23.75 / 9.5 at 5k / 10k / 25k. About 2-7x Indian list of INR 3.5-7. | 2-5 (vendor statement). |
| COGS | $0.034-0.085 (INR 3.2-8.1) at Vapi's pass-through rates; own-infra line is an unsourced placeholder; margin 39-69%. | ElevenLabs Flash v2.5 INR 1.95-3.58: margin -15% to -36% at INR 2, 23-34% at INR 3.5; Cartesia mid 2.2, Sarvam mid 1.6, self-hosted TTS mid 1.1 (Q/cogs.csv; LLM line a proxy). |
| Billing | Per second, aggregated to whole minutes; no-answer and voicemail flat 5 s; failed and cancelled free; thresholds invoice and do not cap (O: SYN-10). | Per second of live conversation; setup fee 50% of first month on human-caller Plug-N-Play (O: SQS-76). |

SquadStack is profitable at INR 3.5 on Flash, so VP cannot rest on it being underwater; its "50 lakh calls a day" must count dial attempts (I: SQS-42). Price is not a wedge (rejected.2026-10-17.parity-undercut; TS-20).

## 8. What customers complain about, and why they churn

**Synthflow (O: SYN-70/72).** Trustpilot 4.1 over 215; 21 one- and two-star product reviews 2024-05 to 2026-05, coded SUPPORT 19, BILLING 11, RELIABILITY 9, PLAN_GATING 4, TELEPHONY 3. Examples: billed months after cancelling; "half the platform is crippled unless you're on enterprise"; a breaking API change with no notice. Status: 2026-08-17 calls failed 9-12 minutes. Churn reads as price-up-market plus support and billing trust, not voice quality (text is WebFetch extraction; G2, Capterra, Reddit blocked).

**SquadStack (O/I: SQS-55/56/57).** No buyer-side corpus: Capterra 0 reviews, G2 and Trustpilot 403, our one VoC row is a worker. The public failure record is supply-side: partner app com.squad.run, 15,007 ratings at 3.85, payouts stuck for months, no work for 6 months, deactivated accounts, a stated hiring pause, copy-pasted replies. Its human hand-off rests on a shrinking gig pool (I); buyer churn cannot be stated.

## 9. Velocity and likely next moves

**Synthflow (O: SYN-50/51).** 106 dated changelog entries (2025-01-05 to 2026-10-20), 67 in six months, 8-12 a month since 2026-03 against 1-4 in 2025 (Feb-Jul 2025 empty, so the speed-up is overstated). Themes: contact-centre integrations, React rebuild (default 2026-10-14), in-house TTS and LLM, Campaigns (2026-08-18), EU region (2026-05-01), MCP connectors, Test Center (2026-09-23). **SquadStack (O: SQS-44).** No changelog. Dated: .ai domain 2026-05-15; revenue-linked pricing 2026-09-14; SDK rebuilt 2026-10-06; Arth V2 2026-10-13; portal and AI platform redeployed 2026-10-19.

**Pre-registered predictions (T/predictions.md TP-071..097) test account-phase behaviour, not strategy; none is scorable without access:** SYN-P01 workspace not usable same day (0.65); SYN-P12 no India control on any screen (0.9); SYN-P13 floor at least $30k (0.6; needs an owner-approved sales contact); SQS-P01 at least 10 business days to first call (0.85); SQS-P02 external sign-up fails (about 0.95, from the bundle); SQS-P06 no real-time AMD (0.7); SQS-P14 rotated 10-digit CLI (0.7); SQS-P03/P05/P07 rest on refuted premises.

**Likely next moves (I, ours):** Synthflow turns on its call-quality and voice-UX flags, finishes the Memory Service, adds Campaign UI and retries; an India PoP only if an enterprise asks (LATAM pattern, SYN-21b). SquadStack opens AI-platform and Osno self-serve ("a flag flip, not a build", risk.2026-10-20.squadstack-self-serve-entry), ships memory and Lift screens, pushes outcome-priced BFSI deals. Radar: Gupshup Voice AI replaces Synthflow in the account-phase deep set (decision.2026-10-20.radar-deep-set-swap, proposed); also name Ringg (INR 6 all-in), Smallest, Desible, Navana, Gnani (BFSI renewals), MyOperator (human "AI Agent Manager"), Caller.digital (itemised INR 10.15 a minute), Tata/TTBS Commotion.

## 10. Adopt and 11. Beat

Eleven adopt patterns and twelve testable beats, each with evidence and pass bar, are in the adopt and beat fields. In short. Adopt: a loop-shaped product with chat over the same tool set as API and MCP; per-call telephony observability with normalised reasons; generated regression suites; cross-channel memory with typed slots; Lift's locked sections and staged rollout on sequential statistics; typed closing tools with in-call DND; one campaign canvas; routers with logged fallback; per-second metering; region-pinned workspaces; a public changelog. Beat: India CLI first ring in minutes; suppression at dial time; campaign robustness; failed-call reason in under 60 s; real-time AMD; Hinglish hold (proven against Synthflow only on paper, against SquadStack unproven); disclosure without hang-up cost; config equals running config; India residency; published all-in INR with no floor or setup fee; support in Indian hours; self-serve before SquadStack opens.

## 12. Always learn

| Watch | Signal | Cadence |
|---|---|---|
| Synthflow changelog, llms.txt, pricing page, OpenAPI | Entries (about 10 a month); India, DND, consent, region words; $30k floor, per-minute list; retry and webhook fields | Weekly normalised-text diff |
| Synthflow flag snapshot, status feed | Flags flipped on (call quality, CSAT, voice-UX, memory); incidents | Weekly while open |
| SquadStack ai-platform and Osno sign-in | Allowlist flag, "external users" text, open sign-up | Weekly; re-triage on any change |
| SquadStack build manifest, blog, pricing, trust centre, roles | New routes (memory, Lift), window constants, price, 1600/140 wording, subprocessors, PM hires | Fortnightly |
| Radar watchlist (67 URLs, T/radar/watchlist.json) | Gupshup, Ringg, Smallest, Desible, Navana, Gnani, Tata/TTBS | Per triggers: round of $5M or more, all-in INR 4 or less, new Indian telephony, self-serve launch |
| Buyer interviews | Ask about both by name plus Desible, Navana, Gnani | In the 10-15 interviews |

Boundaries: no account under another identity; no bypassing the allowlist (decision.2026-10-20.teardown-lines). Needs access: Synthflow's base models (SYN-30), India PoP terms, SquadStack's real quote, failure reasons, handset latency.
