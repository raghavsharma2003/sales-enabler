RETELL AI TEARDOWN, ACCOUNT-FREE PHASE (2026-10-20). The harness refused the report.md write ("subagents should return findings as text"), as it did for the sarvam lane, so the full report is here. Claims (with evidence paths), predictions, pricing scenarios and the sha256 manifest are on disk. Grades: O = observed, I = inferred, V = vendor-claimed; IDs refer to claims.json.

CHANGES VERSUS 2026-10-17
- whatsapp unknown → NO. The docs say: "Retell has no built-in integrations with third-party chat platforms such as WhatsApp" (O, RET-10).
- on_prem_india_residency unknown → US-WEST ONLY (O, RET-25 staff quote + RET-20 DNS). Marketing still claims "Enterprise On-prem" and ISO 27001; the compliance doc lists neither (O, RET-47).
- multilingual_indic partial → confirmed and specific: 6 Indian locales (en-IN, hi, kn, mr, ta, ur). No Telugu, Bengali, Gujarati, Malayalam, Punjabi or Odia, and no Sarvam (O, RET-16).
- compliance partial → confirmed. TRAI, DLT, NCPR and DPDP appear 0 times in 338 docs pages, and batch calls skip the internal DNC flag (O, RET-42, RET-43).
- memory → narrower than marketed: a rewritten brief of at most 2,000 characters per phone number (O, RET-57).
- Headline price USD 0.07-0.31 → unchanged (O, RET-33). The page's own fast-tier and S2S rows go above 0.31, and hidden multipliers matter more (O, RET-34).
- Financials: ARR moves from 50-60M to USD 80M, with 50 staff and a valuation over 1.5B (V, RET-30, job posts dated 10-14).

1. PRODUCT SURFACE
- Docs: 356 pages (O, RET-01).
- Build: single-prompt, multi-prompt (retiring 2026-12-15) and conversation-flow agents with about 12 node types, subflows and Flex Mode. Tools: transfer (cold, warm, agentic-warm), SMS, DTMF, HTTP/JS, MCP and CRM tools. Testing: simulation tests (O, RET-02).
- Conductor copilot (launched 07-02): edits are diffs a human accepts; credits are 30/user/day free, then USD 0.20 each (O, RET-03).
- Built-in CRM (06-19): contacts keyed by phone, DNC flag, two-way Salesforce/HubSpot sync. The CSV contact import defaults to country US (O, RET-04).
- Batch calls: CSV with dynamic-variable columns, time windows and reserved concurrency. No pacing, no documented retries, no DNC check; the API can only create a batch (O, RET-05).
- A separate "Campaigns" object (attempts, DNC settings) is referenced but undocumented and has no endpoint (I, RET-06).
- Operations: live listen and take-over (O, RET-07); A/B testing is fixed weights with no statistics (O, RET-08).
- Accounts: RBAC and SSO are Enterprise-only (O, RET-09). KYC is required before outbound: Persona ID, one person per account (O, RET-12).
- Naturalness: Conversational Mode, a "Colloquial Model" wording rewrite (about 50 ms, per the vendor) and Expressive Mode (O, RET-11).
- Maturity: the core is 2+ years old. CRM, live monitoring, Conductor, Workflows and campaigns are 1-4 months old; the browser media transport was replaced in September (O, RET-41).
- Not inspectable without an account: the dashboard sits behind Auth0 and reCAPTCHA and serves no bundle before login (O, RET-26).

2. API AND DOCS
- OpenAPI 3.0.3, revision 2026-10-19: 109 operations, 319 schemas, Stainless-generated SDKs (O, RET-13).
- The data model has agent, response engine, versions, calls, chats, numbers, KB, voices, batch, contacts, apps, CRM sync, tests and exports. There is NO campaign, consent, DNC-list or calling-policy object (O, RET-14).
- Diagnostics: 39 disconnection reasons, per-call cost line items, per-component latency (O, RET-15).
- US defaults: America/Los_Angeles timezone, en-US language, US contact country (O, RET-17).
- Contradiction: the spec says Retell numbers call only US destinations, while the docs list India at USD 0.15/min (O, RET-18).
- Developer extras: custom-LLM WebSocket, MCP server, CLI, ChatGPT app (O, RET-19).

3. ARCHITECTURE
- Region: US-West only. Staff wrote: "Retell infrastructure is only in US(west) region. We don't have any other PoP at the moment" (O, RET-25). sip.retellai.com is AWS us-west-2; api.retellai.com is on AWS Global Accelerator; mcp is an ELB in us-west-2; dashboard and docs on Vercel; site on Webflow; login on Auth0 (O, RET-20).
- Orchestration is Retell's own (queues and workers, per the postmortems). No Pipecat or Vocode traces (I, RET-24).
- Browser media: the web SDK 3.0 (2026-09-08) moved from LiveKit Cloud (wss://retell-ai-4ihahnq7.livekit.cloud) to Retell's own WHIP-style WebRTC gateway at api.retellai.com/webrtc-proxy/{call_id}/v1/webrtc/sessions (O, RET-23).
- SIP media: the SIP allowlist includes 3 LiveKit Inc. IP blocks, so some PSTN media likely runs on LiveKit Cloud (O RET-21 / I RET-22).
- Speech stack: STT is Azure, Deepgram (the default in Hindi threads), Soniox and AssemblyAI, plus "Muse", which appears only in the spec and detects turn ends itself (O, RET-29). TTS is ElevenLabs, Cartesia, MiniMax, Fish, OpenAI, Inworld and "Platform". There are 32 LLMs, plus the gpt-realtime family for speech-to-speech (O, RET-16).
- Turn-taking, latency and self-hosting claims are unverified: "proprietary turn-taking", "~600 ms", "self-hosted models" (V, RET-28).
- Homepage demo: it calls create-phone-call from the browser with an embedded bearer credential (redacted in our copies, not used). Its parser makes any 10-digit number +1, so an Indian visitor who omits +91 never gets the call (O, RET-27).

4. PRICING NOW, AND COGS
Rate card (O, RET-32):
- infra USD 0.055/min;
- TTS 0.015-0.10;
- LLM 0.0016-0.64;
- S2S 0.07-0.38;
- telephony: India 0.15 (Twilio) or 0.25 (Telnyx); custom SIP free;
- add-ons: KB, denoise, guardrails +0.005; PII +0.01; QA 0.10; batch +0.005/dial;
- concurrency: 20 slots free, then USD 8/slot/month.

Multipliers the headline hides (O, RET-34):
- prompts over 4,000 tokens (transcript, tool output and KB count toward this) scale billed duration;
- a 10-second minimum on a dynamic opener;
- burst +0.10/min for the whole call;
- prepaid USD credits; calls stop at a zero balance.

All-in INR per connected minute for an Indian outbound call (I, RET-35; pricing-allin.csv). Ex GST, FX 95, 60-s call, Platform voice. The three figures are GPT-5 mini / calculator-default LLM / GPT-5.6 Terra ("recommended"):

| Path | INR/min |
|---|---|
| BYO Indian SIP trunk (INR 0.43/min, 30-s pulses), prompt up to 4k tokens | 8.3 / 11.4 / 13.6 |
| Same, 6k-token prompt, LLM line scaled only | 8.7 / 13.3 / 16.7 |
| Same, 6k-token prompt, whole duration scaled | 12.0 / 16.6 / 20.0 |
| Retell US number via Twilio | 22.1 / 25.2 / 27.5 |
| Retell US number via Telnyx | 31.6 / 34.7 / 37.0 |

For comparison: Indian vendors list INR 3.5-7 (ECO-15) and VP targets INR 2-3. Retell is 2-4x the Indian list price on its cheapest realistic path (I, RET-37). Its forum answer to "Pricing for India" quotes the international route (O, RET-55).

COGS against the g4 2026-10-18 list prices (I, RET-36):

| Line | Retell price | Reconstructed cost | Implied margin |
|---|---|---|---|
| Infra | USD 0.055 | STT 0.006-0.009 + compute | about 75-85% |
| Platform voice | 0.015 | 0.013-0.021 (list) | about break-even |
| ElevenLabs Flash | 0.04 | 0.014 | about 65% |
| ElevenLabs v3 | 0.10 | 0.028 | about 72% |
| Calculator default (whole call) | 0.11 | 0.03-0.05 | about 55-70% |

5. VELOCITY (O, RET-38 to RET-41)
- Releases: marketing changelog posts on 05-27, 06-19 (launch week: CRM, live monitoring, dashboards, Colloquial, Expressive), 07-02 (Conductor) and 08-24 (Workflows), none since. 16 deprecation notices dated 2026-04 to 2026-12. 80 retell-sdk npm releases in 6 months. Spec revised 2026-10-19.
- Status page: 12 incidents in 6 months, 6 of them major.
  - 09-05: a custom-LLM race stalled the fleet. About 6 h passed between onset and the first status post (I, RET-39).
  - 09-16: a deploy double-assigned calls, and about 22% of calls failed for 43 minutes.

6. INDIA PLUMBING: WHAT RETELL DOES AND WHAT IT LEAVES TO THE BUYER
- Numbers: US and Canada only; caller-ID trust services are US-only. An Indian CLI means a BYO SIP trunk, with forum friction: Plivo inbound "user busy", Plivo India numbers only on request, partners recommending Vobiz, a TRAI India-SBC claim, Twilio refusing India-to-India transfer (O, RET-45).
- DLT, consent, NCPR, DPDP, residency: nothing, with 0 doc mentions (O, RET-42).
- DNC: off by default. Honoured by single calls only with honor_internal_dnc=true; batch calls ignore it (O, RET-43).
- Calling windows: generic, default LA timezone, no TRAI window or warning (O, RET-44).
- PII categories are US-centric (no Aadhaar or PAN); US-West only (O, RET-47).
- Billing is Stripe USD; a user's UPI default payment did not work for a number purchase (O, RET-49).
- Active support is 9 AM-9 PM PST, which is 21:30-09:30 IST (O, RET-48).
- Net: the buyer owns all TRAI and DPDP work, brings its own trunk and sets IST by hand (I, RET-46).

7. FAILURE MODES, TRACED TO RAW THREADS (all on community.retellai.com, read 2026-10-20)
Base rates from the 10-17 coding: TELEPHONY 232, TOOLS 103, ACCOUNT_UI 99, BILLING 69, RELIABILITY 61, ASR 37, LANGUAGE 25 (O, RET-50).
- t/1949: "A subset of users in India cannot connect ... 'user not join'". Staff: US-West only, no other PoP.
- t/2713: "Agent is not able to identify छह". Staff: the ASR provider is at fault (Deepgram default); try Soniox.
- t/2502 (330 views): "only that statement was in Marathi, rest agent continued talking in English"; "Nicco Super Bowl" heard as "Niku super board".
- t/1645: Telugu and Bengali are not supported; staff: "try the GPT Realtime".
- t/2856, t/2866: Sarvam STT/TTS requests, no reply.
- t/2363: transfer to +91 fails; Twilio does not allow India-to-India with caller-ID override.
- t/3145: Plivo India setup failed; "Try vobiz".
- t/758: Plivo inbound "user busy".
- t/3723: UPI default payment not accepted.
- t/384: a Hindi agent drifts into another language; staff: "prompt it to only speak Hindi".
Support pattern: an auto-ack, then templated, citation-style answers (O, RET-48). Trustpilot returned 403 and we did not work around it (RET-56).

8. V2 NOTES (record only)
- Memory: a rewritten brief of at most 2,000 characters per phone number, after phone or SMS calls; saving is off by default. Marketing ("resume where the last call left off") outruns the docs, consistent with CMP-01 (O, RET-57).
- Learning: Conductor turns failed calls into simulation tests and proposes fixes a human approves; AI QA cohorts; fixed A/B weights; no autonomous optimisation (O, RET-58).
- Personalisation: dynamic variables, CRM fields read in, post-call analysis written back to contact attributes with backfill (O, RET-59).

WHAT THIS MEANS FOR THE THREE DECISIONS
(1) Pre-sale vs post-sale.
- Retell gives no help with Indian promotional-call compliance, and its DNC is skipped by batch calls. A pre-sale campaign on Retell leaves the buyer carrying the compliance risk.
- A post-sale service call (REG-35) avoids most of that, but still needs a BYO Indian trunk and manual IST windows.
- So VP wins post-sale first on "works in India by default" (Indian CLI; IST and TRAI windows; DNC and NCPR on every path). The compliance layer becomes a pre-sale moat once 140-series and DLT plumbing exist.

(2) v1 parity floor.
- Must-be:
  - an agent builder with versions and a staging/production split;
  - cold and warm transfer, with a whisper;
  - voicemail and IVR detection;
  - CSV campaigns with variables, windows and concurrency;
  - a call log with a specific failure reason, recording, transcript and per-call cost;
  - webhooks and an API;
  - KB and post-call extraction;
  - DNC on every path.
- Performance: simulation tests, live listen and take-over, CRM sync, dashboards and alerts.
- In our market these are must-be, though Retell lacks them: IST and TRAI defaults, Indian numbers, INR and UPI billing.
- Not needed for v1: MCP/ChatGPT apps, agency features.

(3) Where VP is measurably better, with the task that proves each:
- (a) Reply gap on Indian PSTN: Retell's audio crosses India and US-West twice. Task: handset stereo recording, n≥30 (RET-P09).
- (b) Hinglish and Indic language hold, and Hindi digits (RET-P10).
- (c) Minutes from sign-up to the first call on an Indian handset (RET-P01).
- (d) Compliance by default: the messy CSV's opt-out row is predicted to be dialled (RET-P04e), and 07:00-23:00 IST is accepted (RET-P05).
- (e) Price: INR 8-14 versus VP's 2-3.

TOOLS
REA worked on HAR analysis once the HAR was slimmed, and on the pricing page's JS bundle. Playwright captured the dashboard login HAR. The SDKs were read via npm pack and pip download, not installed.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Hosting is US-West only. Retell support (community t/1949, 2026-03-25): 'Retell infrastructure is only in US(west) region. We don't have any other PoP.' DNS agrees: sip.retellai.com is AWS us-west-2, api.retellai.com is on AWS Global Accelerator, mcp is an ELB in us-west-2. Indian calls cross India and US-West twice per turn (observed).
- Media stack. Orchestration is Retell's own. The web SDK 3.0 (2026-09-08) moved browser media from LiveKit Cloud (wss://retell-ai-4ihahnq7.livekit.cloud) to Retell's own WHIP-style WebRTC gateway. The SIP allowlist still includes 3 LiveKit Inc.-registered IP blocks, so some PSTN media is likely on LiveKit Cloud (observed, plus inferred).
- Indian all-in price, ex GST, FX 95, 60-s call: INR 8.3-13.6/min on a BYO Indian SIP trunk; INR 22-37/min via Retell's US numbers at international rates (USD 0.15 Twilio / 0.25 Telnyx). Prompts over 4,000 tokens (transcript and KB count toward this) scale billed duration, pushing a BYO trunk to 16.7-20.0. That is 2-4x Indian list prices (3.5-7) and 3-6x VP's INR 2-3 target (computed from the observed rate card).
- Reconstructed COGS: about 75-85% gross margin on the USD 0.055 infra line and about 55-70% on the USD 0.11 calculator default. Platform voices at USD 0.015 are about break-even against Cartesia/MiniMax list prices, so they need volume rates or their own TTS (inferred).
- Zero Indian compliance. The 338 docs pages mention TRAI, DLT, NCPR, DPDP and data residency 0 times. Numbers are US/CA only; caller-ID trust is US-only; windows default to America/Los_Angeles with no TRAI warning. The internal DNC flag is off by default and 'Batch calls and inbound calls don't check do_not_call'. PII categories are US-centric (no Aadhaar or PAN) (observed).
- Thin Indic coverage: 6 Indian locales (en-IN, hi, kn, mr, ta, ur); no Telugu, Bengali, Gujarati, Malayalam, Punjabi, Odia or Sarvam. Forum threads show Hindi digits mis-transcribed with the blame put on Deepgram (t/2713), Marathi/Hindi drift back to English (t/2502, 330 views), 'try GPT Realtime' for Telugu (t/1645) and Sarvam requests unanswered (observed).
- There is no campaign, consent or calling-policy object among 109 API operations (spec revision 2026-10-19). Batch calls have no per-call pacing, no documented retries and a create-only API. A 'Campaigns' object with attempts and DNC settings is referenced but undocumented (observed, plus inferred). Diagnostics are strong: 39 disconnection reasons, per-call cost lines, PCAP download.
- Velocity and reliability over 6 months: 80 SDK releases, 16 deprecation notices, 12 status incidents (6 major). 2026-09-05: a fleet stall with about 6 h between onset and the first status post. 2026-09-16: about 22% of calls failed for 43 min. Vendor claims USD 80M ARR with 50 staff and a valuation over USD 1.5B (up from 60M in the July posts).
- Support and billing are hostile to India-hours buyers: active support 9 AM-9 PM PST (21:30-09:30 IST); KYC by a Persona government ID with one person per account; prepaid USD Stripe credits that stop calls at zero; a user's UPI default payment failed for a number purchase (t/3723) (observed).
- v2: contact memory is one rewritten brief of at most 2,000 characters per phone number, saving off by default; marketing overstates it as 'resume where the last call left off' (consistent with CMP-01). Conductor turns failed calls into simulation tests and proposes fixes a human approves; A/B uses fixed weights with no statistics (observed).
- Decision implications. Post-sale first: Retell leaves Indian promotional compliance entirely to the buyer, and even service calls need a BYO trunk and manual IST. Places VP can prove a win: handset reply gap on Indian PSTN, Hinglish language hold and Hindi digits, minutes to the first Indian-handset call, compliance-by-default on the messy CSV (the opt-out row is predicted to be dialled), and price.

### Pre-registered predictions for the account phase

- RET-P01: Sign-up to first browser test call takes 10 min or less, but more than 30 min to a call on our Indian handset. KYC plus payment is needed for the Retell-US-number path; a BYO Plivo/Vobiz trunk takes 45-120 min with at least one SIP error (0.6).
- RET-P02: The team@vyakti.ai workspace is not auto-verified for KYC; a named person must pass Persona ID (0.7).
- RET-P03: Conductor builds the standard agent in 20 min or less, but adds no AI-disclosure rule unless asked and leaves the language at en-US (0.6).
- RET-P04: Messy CSV as a batch call: duplicates dialled twice (0.7); 10-digit Indian numbers without +91 rejected or misparsed (0.75); Devanagari survives (0.8) but is mispronounced (0.5); empty columns pass silently (0.6); the opt-out row is dialled (0.85).
- RET-P05: The window defaults to LA time; 07:00-23:00 IST is accepted with no TRAI warning; cross-midnight is rejected; batch calls have no retries (0.8).
- RET-P06: Voicemail/IVR detection misclassifies at least 1 of 3 Indian operator announcements (0.55); warm transfer to an Indian number works on a BYO trunk (0.6) but fails from a Retell-Twilio number with caller-ID override (0.6).
- RET-P07: A failed call and its reason are found in 3 min or less (0.75), but Indian SIP failures surface only as generic reasons that need PCAP (0.6).
- RET-P08: Export is an asynchronous CSV, ready in 10 min or less for under 100 calls, with Devanagari preserved and cost columns included (0.6).
- RET-P09: Handset reply gap on Indian PSTN via a BYO trunk to US-West: p50 1.6-2.4 s, p90 above 2.8 s; via a Retell US number, +0.1-0.3 s (0.6).
- RET-P10: With hi-IN + en-IN, at least 1 in 8 Hinglish turns is in the wrong language or script, and Hindi digits are mis-transcribed in at least 1 of 5 number turns (0.55).
- RET-P11: A 6k-token prompt triggers the 4,000-token rule at about 1.5x (0.7); the scaling hits the LLM line only (0.5).
- RET-P12: With a neutral prompt the agent admits being an AI in at least 7 of 8 'aap AI ho?' calls; Retell adds no platform disclosure (0.7).

### Needs a trial account to learn

- Dashboard surface map (screens, clicks), including whether a Campaigns screen exists and what retry, pacing and DNC settings it has. The app bundle is not served before Auth0 login.
- KYC path and time for the team@vyakti.ai workspace. Persona needs a real person's government ID, and one ID verifies only one account. Instinct reported the account ready with USD 10 credit and TOTP on every login.
- Whether an Indian card or UPI is accepted for credits and number purchase.
- Minutes and clicks from sign-up to (a) a web test call and (b) a live call on our Indian handset, via a Retell US number dialling India and via a BYO Plivo/Vobiz SIP trunk, with SIP errors and PCAP captured.
- Handset-side reply gap, cut-ins, language hold and disclosure on Indian PSTN with the l4b battery, stereo-recorded, n of 30 or more.
- Which ASR the presets route hi-IN + en-IN to (Provider Config), whether 'Muse' appears, and Hindi digit accuracy.
- Platform voice identity by speaker-embedding fingerprint against Cartesia, MiniMax and Inworld.
- Messy 50-row CSV through batch calls (dedupe, E.164, Devanagari, empty columns, opt-out row) and through contact import with default_country IN.
- Whether the 4,000-token rule scales only the LLM line or the whole duration (compare cost line items for 2k vs 6k prompts).
- Voicemail and IVR detection on Indian operator announcements; warm and agentic transfer India-to-India on a BYO trunk vs a Retell-Twilio number.
- Export format, encoding and cost columns; finding a failed call and its reason.
- Concurrency and CPS behaviour on a custom Indian trunk; live-monitor and take-over latency from India; support response time to an India-hours ticket.
- Retell's terms of service were not reviewed (per the Instinct report); check them for anti-benchmarking or reverse-engineering clauses before the account phase.

### Run facts

- Claims: 60 {"observed": 49, "inferred": 8, "vendor_claimed": 3, "unknown": 0}
- REA used: True
- REA notes: REA 6.7.0, run with 'npx -y rea-agents@latest'.
- rea doctor: healthy for Node 22.22. The native engines (Hopper, Ghidra, IDA, JADX, Kuna) are missing; web work does not need them.
- inspect-web-network-capture on the full 15.5 MB Playwright HAR of the dashboard login redirect (embedded bodies, including a 6.9 MB PNG) FAILED: execution_failure, decoder phase, 'Capture decoder failed unexpectedly (RangeError)'. With bodies and cookies stripped (120 KB) it decoded all 36 records cleanly. Logged as rejected.2026-10-20.retell-rea-full-har; workaround: slim every HAR before REA.
- analyze-web-bundle against a local headless Chromium over CDP (port 9333, through the agent proxy, NO_PROXY for 127.0.0.1) on www.retellai.com/pricing succeeded: 40 scripts, 0 parse failures. It surfaced the one real API call, api.retellai.com/v2/create-phone-call, made by the homepage demo form with an embedded bearer credential, which we redacted and did not use. Its other 'endpoint candidates' were low-value UTM parameter reads.
- No Cloudflare challenge on Retell's Webflow site, unlike Sarvam.
- The dashboard app bundle could not be analysed because Auth0 redirects before any JS chunk loads.
- No APK exists for Retell.
- Playwright (capture.mjs) supplied the HAR. SDK source came from npm pack and pip download without installing.
