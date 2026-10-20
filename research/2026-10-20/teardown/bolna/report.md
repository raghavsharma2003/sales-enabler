NOTE: the subagent harness refused to write research/2026-10-20/teardown/bolna/report.md ("Subagents should return findings as text"). The full report is below, ready for the orchestrator to save at that path. The other outputs were written: blind-inferences.json (frozen first), claims.json, predictions.json, manifest.csv and the inbox proposal.

# Bolna teardown: blind lane (account-free), 2026-10-20

The lane has two jobs:
- tear Bolna down from public material only;
- infer its architecture blind, so the inference method can be calibrated against Bolna's open-source code.

**Blind protocol**
- The blind inferences were frozen in `blind-inferences.json` (35 statements, each with a confidence) before anything else was written.
- Not opened: github.com/bolna-ai, Bolna npm/PyPI package source, research/2026-09-22/bolna-product.md, research/voice-competition-implementation.md, and the GitHub-issue text in l4a (only its code counts were used).

**Contamination**
- The brief's own input, l4a parity.csv, quotes Bolna's OSS code in four rows: voicemail_handler.py, the dtmf_enabled flag, prompts.py and the memory module.
- The inferences on those four topics are flagged contamination=yes and must be left out of the hit rate.
- Lesson for future blind lanes: build a pre-filtered input pack first.

**Grades:** observed, inferred, vendor-claimed, unknown.
- Claim ids (BOL-xx) point to claims.json.
- Raw files sit under data/teardown/bolna/ and are hashed in manifest.csv (346 files).

## 1. Product surface map

- **Building an agent** (BOL-01, BOL-09):
  - Studio Auto Build from a brief (Jun 2026);
  - the 7-tab builder (Agent, Intelligence, Languages, Engine, Calling, Tools, Extractions);
  - graph agents with a visual editor (May–Jun 2026);
  - workflows (beta);
  - REST API, CLI (beta, Jul 2026), MCP server;
  - also: templates, clone/import links (/a/<uuid>), agent versions, per-language prompt translations, and a Single Prompt view (beta, being A/B tested).
- **Chat/copilot setup already ships** (BOL-02): Ask Bolna in the dashboard, edit-prompt-by-chat (Sep 2026), the MCP server as a Claude connector (9 Oct 2026), 20 Bolna Skills, AGENTS.md and llms.txt.
- **Calling** (BOL-03, BOL-07):
  - single calls;
  - batches: CSV, schedule, auto-retry up to 3 with intervals;
  - workflow campaigns (pause/resume/abort, report);
  - inbound: number→agent, caller lookup from API/CSV/Sheet, spam caps, blocklist;
  - live-calls view, warm/cold transfer with pre-transfer webhooks, DTMF/IVR, voicemail detection;
  - calling guardrails, web calls (SDK v2), speech-to-speech agents (OpenAI Realtime, Gemini Live).
- **No native CRM or contact object** (BOL-04): integration is through webhooks, Zapier, Make, n8n, viaSocket and Sheets. Confirms l4a crm_integrations=partial.
- **WhatsApp:** an AiSensy node inside workflows (beta) and a /whatsapp/campaigns API (BOL-03). Extends l4a whatsapp=partial.
- **Post-call** (BOL-06):
  - executions with cost, transcript, recording, raw logs, progression and audio insights;
  - extractions with confidence and reasoning;
  - dispositions with a test API;
  - ratings and feedback tags, async CSV reports, per-status webhooks.
- **Telephony** (BOL-07, BOL-51):
  - Bolna-hosted Indian numbers via Vobiz/Plivo, gated by a compliance application and Vobiz KYC;
  - BYO Twilio, Plivo, Exotel or Vobiz;
  - new SIP trunks (15 Oct 2026); legacy SIP on Asterisk;
  - Truecaller verification.
- **Billing:** prepaid wallet via Stripe, pilots, invoices, AWS Marketplace (BOL-33, BOL-34).
- **Team and enterprise** (BOL-05, BOL-08):
  - only Admin and Member roles (Enterprise);
  - sub-accounts with usage data and a concurrency pool (agency model);
  - no white-label/rebrand;
  - India residency, on-prem (Docker/Kubernetes), VAPT claim.
- **Compliance UI:** compliance applications (CIN for Pvt Ltd only, plus GST), Vobiz KYC, violations (consent-proof upload), guardrails off by default (BOL-45, BOL-47, BOL-48).

## 2. Docs and API

- **Objects** at api.bolna.ai, Bearer auth (BOL-10):
  - agent v2: tasks[] → toolchain.pipelines, tools_config, task_config, agent_prompts, calling_guardrails, ingest_source_config, versions;
  - execution, with raw logs; batch;
  - knowledge base, voice, disposition, extraction category;
  - phone number, compliance application, inbound link;
  - SIP trunk (gateways, carrier IPs, numbers, pop), violation;
  - workflow, workflow campaign, workflow execution;
  - user (custom LLMs and TTS), provider credentials, sub-account.
- **OpenAPI file:** the openapi.yml that llms.txt references returned 404 on both docs hosts (BOL-11).
- **Data model (inferred, BOL-12):** call-centric. There is no person, consent or do-not-call object, so memory, consent ledgers and DND suppression have nowhere to live without new objects.
- **Integrator gotchas (BOL-14):**
  - a Z timestamp returns HTTP 500;
  - schedules round up to the next 10 minutes;
  - status codes are inconsistent (201 vs 200);
  - webhooks are not HMAC-signed (IP allowlist only).
- **Backend:** FastAPI/Pydantic error shapes (inferred, BOL-15).

## 3. Architecture

Details and confidences are in blind-inferences.json.

- **Hosting, observed via DNS and AWS ip-ranges (BOL-17):**
  - api, ws and ts ALBs (bolna-*-prod-ingress-alb) in AWS ap-south-1;
  - a us.ws ALB in us-east-1;
  - every backend IP matches AWS ip-ranges;
  - EKS is inferred from the naming (0.75).
- **Docs vs infra mismatch (BOL-18):** docs say processing defaults to the US (us-east-1), but the control plane is in Mumbai. Unresolved.
- **Orchestration** is Bolna's own Python asyncio framework, not Pipecat, LiveKit or Vocode (inferred 0.85, BOL-21). Services: api/ws/telephone servers, RabbitMQ q_manager/q_worker, arq on Redis, Postgres 16, S3.
- **LLM routing** goes through LiteLLM, which the docs state (vendor-claimed, BOL-22).
- **Turn-taking** (inferred 0.7, BOL-23):
  - end of turn from STT endpointing (Deepgram, 200 ms default) or provider-native end of turn (Flux, AssemblyAI, Soniox);
  - then a fixed delay;
  - barge-in after 2 transcript words, or a stopword;
  - no semantic turn-detection model.
- **Extra LLM calls** for hangup, voicemail and language detection; the hangup prompt is in the bundle (observed, BOL-24).
- **Web calls** (observed, BOL-19): SIP.js 0.21 over WSS to FreeSWITCH (fs.bolna.ai), via a minted single-use session (/web-call/freeswitch-session), Google STUN. No LiveKit or Daily.
- **SIP** (observed, BOL-20):
  - legacy trunks: Asterisk PJSIP;
  - new trunk edge: UDP/TCP only, G.711, RTP 30000–40000, 488 for delayed offer;
  - FreeSWITCH as the new trunk edge is inferred (0.45).
- **Default stack** (observed in bundle, BOL-25):
  - telephony: Vobiz;
  - STT: Deepgram nova-3 hi;
  - LLM: Azure gpt-4.1-mini;
  - TTS: ElevenLabs Turbo v2.5 "Tripti", cached;
  - office ambient noise.
- **Critical upstreams** monitored on the status page: OpenAI, ElevenLabs, Azure, Deepgram, Cartesia, Sarvam, Plivo, Vobiz (BOL-26).
- **RAG:** LanceDB, all-mpnet-base-v2 embeddings, ONNX reranker, Unsiloed/LlamaParse (BOL-27).
- **SaaS layer:** Vercel, Supabase Auth, hCaptcha, Stripe, PostHog, Sentry, Intercom/Plain, Better Stack, customer.io, Metabase, Grafana (BOL-28).
- **Certificate transparency:** named stacks apollo/ares/topaz; fs, webcall and annotate hosts; inference-mumbai and deepgram.bolna.ai, pointing to self-hosted inference (inferred 0.45, BOL-29, BOL-30).
- **Hygiene:** workflows.bolna.ai resolves to private 172.32.x addresses (BOL-31).
- **Unknown:** the noise-cancellation engine, and exactly where FreeSWITCH forks audio into the pipeline (0.6).

## 4. Pricing and COGS (FX 95)

- **List prices unchanged since the l4a 2026-10-17 live row** (BOL-33): PAYG 6¢, top-ups down to 4.51¢, Pilot $300/6,500 min or $500/12,000 min, 30-s pulses.
- **New:** AWS Marketplace tiers from ~5¢ down to ~4¢/min annual (vendor-claimed, BOL-34).
- **Platform fee** ($0.02/min) on bundled plans is ambiguous (BOL-35).
- **All-in for an Indian outbound call (inferred, BOL-36):**
  - PAYG: INR 6.1 if the fee is included, 8.0 if added;
  - best top-up: INR 4.7–6.6;
  - Pilot: INR 4.4–6.3;
  - AWS annual: INR 4.2–6.1;
  - extends ledger ECO-15.
- **COGS of the default stack (inferred, BOL-37):**
  - Deepgram INR 0.55–0.87;
  - gpt-4.1-mini INR 0.38–0.89;
  - ElevenLabs INR 0.67–1.34;
  - telephony INR 0.38–0.48;
  - infra INR 0.05–0.2;
  - total ≈ INR 2.0–3.8 (mid 2.8).
- **Voice-bundle gross margin (BOL-38):** 46–72% at PAYG, 22–60% at Pilot, 18–58% at AWS annual.
- **Implication:** an enterprise rate of INR 1.75–2 is at or below default-stack COGS, which implies cheaper models or self-hosting.

## 5. Velocity

- **Changelog:** 72 entries May–Oct 2026 against 36 in Nov 2025–Apr 2026 (BOL-39). It is accelerating, but dominated by models and providers, developer tooling, graph agents and SIP; almost nothing on campaign operations or India compliance.
- **Status page:** 18 de-duplicated incidents in 6 months (BOL-40).
  - 9 are upstream Indian telephony (Plivo/Vobiz/carrier).
  - 3 model-provider, 2 latency, 2 queue/scheduling (including 13 Oct: India scheduled calls not placed), 1 webhook delay.
  - Earlier: 37 "is down" alerts between Nov 2024 and Feb 2026 (BOL-41).
- **Team:** about 25 per the job posts, against 51 per Inc42. The scale claims contradict each other: 400k calls/month vs 200k/day (BOL-42).
- **Hiring** is go-to-market (GTM)-heavy: BFSI enterprise sales (15 Oct) and an LLM-as-judge QA annotator (BOL-43).

## 6. India plumbing

- **DLT/PE registration** is left to the buyer: Tata portal, ₹5,900. 140-series goes through Vobiz; 160-series through Plivo and needs an RBI/SEBI certificate. Confirms ledger CMP-27 (BOL-44).
- **Number KYC** needs a CIN (Pvt Ltd only) and GST, plus Vobiz KYC (BOL-45).
- **No NCPR/DND scrub.** The security page claims "do-not-call list integration" but only an inbound blocklist exists, so marketing and docs disagree (BOL-46).
- **Consent is reactive.** The buyer must "upload proof of opt-in" after a provider violation report, escalating to a final notice (BOL-47).
- **Calling windows** (BOL-48): guardrails are off by default, whole-hour only, in the recipient's timezone, with a bypass flag. Docs say 9–21 for India; ledger CMP-27 says 10–21. The regulation lane must settle it.
- **India residency** is Enterprise-only and needs Plivo + Azure OpenAI with no BYOK (BOL-49).
- **"DPDP certification"** appears in the AWS listing copy (vendor-claimed, BOL-50).
- **Truecaller verification** is offered (BOL-51). No disclosure setting exists (inferred, BOL-52).

## 7. Failure modes

1. Trustpilot 2026-05-25, 1★, SUPPORT: "Their customer support is absolutely terrible and the service quality is even worse."
2. Trustpilot 2026-03-25, 1★, SALES_DELIVERY/BILLING: "We chased them for so many days, made payment and now they are denying to move forward and run pilot for us."
3. Trustpilot 2026-02-25, 1★, BILLING/SUPPORT: "Been trying to reach them for months regarding a refund, but there has been absolutely no response."
4. Trustpilot 2026-01-23, 1★, SALES_DELIVERY: "Booked Demo many times since last 1 month, but not callback, no response". Source: https://www.trustpilot.com/review/bolna.ai, re-read 2026-10-20: TrustScore 2.6, 4 reviews, all 1★.
5. Reddit r/AIVoice_Agents 2026-02-02 (https://www.reddit.com/r/AIVoice_Agents/comments/1qtqcdc/): "Looking for an alternative to Bolna that works on Indian numbers: the problem is the price and not much configuration available."
6. status.bolna.ai 2026-09-16: "Elevated outbound call failures via upstream telephony provider (Vobiz)". 9 of 18 incidents are of this type.
7. status.bolna.ai 2026-10-13: "Some scheduled calls were not placed (India region)".
8. A competitor-run blind test (Tough Tongue AI, n=150, 2026-07-08): perceived latency 1.5–2.0 s, English replies to Hindi, "frequently restarted its context window". The source is conflicted, so this is a hypothesis only.

Coverage notes:
- **GitHub issue titles** (from l4a, codes only): questions 35, tools/integration 25, reliability 15, turn-taking 14, ASR 14, TTS 13, telephony 10.
- **Blocked sources:** G2, Product Hunt and Reddit returned 403/429 and were not bypassed.

**Read:**
- Buyers hurt on support, billing and sales follow-through.
- Operations hurt on upstream telephony.
- Builders hurt on integration questions.
- Voice quality is unproven, so our PSTN battery has to test it.

## 8. v2 notes (record only)

- **Memory:** no cross-call memory and no contact entity; marketing does not claim memory (BOL-60).
- **Optimisation:** no experiment or traffic-split feature (the docs say to clone agents by hand). Ratings and feedback exist, and an internal LLM-as-judge QA pipeline with annotators is being built (BOL-61).
- **The gap:** Bolna has the raw signals but no customer-facing learning loop (BOL-62).

## 9. Predictions

22 rows are in predictions.json; key ones are in the predictions field.

## What this means for the three decisions

1. **Pre-sale or post-sale first.**
   - Bolna's compliance is reactive, so promotional pre-sale calling on Bolna puts the risk on the buyer.
   - Bolna's own use cases lean post-sale/neutral, and it is now hiring BFSI enterprise sales.
   - Nobody owns compliance-native post-sale: 160-series provisioning done for the buyer, consent ledger, DND suppression, calling windows on by default.
   - **This supports decision.2026-10-17.beachhead-v2**, provided compliance is built as a product.
2. **The v1 parity floor (Kano).**
   - **Must-be:**
     - outbound single calls and CSV batches with variables;
     - scheduling with a calling window and auto-retry;
     - inbound with caller lookup;
     - transfer, voicemail, DTMF;
     - Hindi/Hinglish plus ~10 Indian languages;
     - Vobiz/Plivo numbers and BYO Exotel/Twilio;
     - extraction, webhooks, call history with transcript/recording/cost;
     - API, sub-accounts, prepaid INR wallet.
   - **Performance:** reply gap, naturalness, concurrency, price.
   - **Bolna already ships** chat-driven building, graph agents and Truecaller. So LLM-native setup is parity, not a wedge.
3. **Where we can be measurably better**, each with a task that shows it:
   - **(a) Compliance by default.** Task: a messy CSV with an opt-out row and a DND number.
   - **(b) CSV hygiene:** dedupe, E.164 normalisation, per-row reasons.
   - **(c) Carrier failover and failure explainability.** Half of Bolna's incidents are upstream telephony. Task: "find the failed call and its reason".
   - **(d) Semantic turn-taking** against endpointing plus a 2-word rule. Task: PSTN reply gap and cut-ins.
   - **(e) Support responsiveness and one transparent fee line.**
   - Also: HMAC-signed webhooks.

## Method notes

- **REA** (rea-agents 6.7.0). These worked: list-browser-targets, inspect-web-page --include-script-sources, export-web-scripts, inspect-web-network-capture. analyze-web-bundle hung twice.
- **Source maps:** none are served.
- **Web-call widget:** there is no public one; the homepage offers phone numbers and recorded demos.
- **Login** is behind hCaptcha; we stopped there.
- **Publishable keys** seen in bundles were not reproduced.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Hosting (observed): Bolna's control plane is on AWS ap-south-1. api/ws/ts.bolna.ai resolve to ALBs named bolna-*-prod-ingress-alb in Mumbai, and us.ws.bolna.ai is a us-east-1 ALB; every backend IP matches AWS ip-ranges. The docs say processing defaults to the US, which contradicts this.
- Web calls (observed in the public bundle): SIP.js 0.21 over WSS to FreeSWITCH (fs.bolna.ai), using a backend-minted single-use session from /web-call/freeswitch-session. No LiveKit, Daily or Twilio Voice SDK. Legacy SIP trunks run on Asterisk PJSIP (sip.bolna.ai); the new SIP-trunk edge launched 2026-10-15.
- Default dashboard stack (observed): Vobiz telephony, Deepgram nova-3 hi with 200 ms endpointing, Azure gpt-4.1-mini, ElevenLabs Turbo v2.5 'Tripti' with caching, office ambient noise. Hangup, voicemail and language detection are extra LLM calls. Barge-in fires after 2 transcript words; there is no semantic turn-detection model (inferred).
- Pricing: list prices unchanged since 2026-10-17 (6¢ PAYG, top-ups to 4.51¢, Pilot ~4.2-4.6¢); AWS Marketplace tiers added (~4-5¢). All-in for an Indian call is INR 4.2-8.0/min at FX 95; the range turns on whether the $0.02 platform fee sits on top (unresolved). Reconstructed default-stack COGS is INR 2.0-3.8/min, giving a 46-72% voice-bundle margin at PAYG and 18-58% at the AWS annual rate.
- India plumbing is reactive. There is no NCPR/DND scrub, although the security page claims do-not-call integration. Consent is only proof uploaded after a telephony-provider violation report. Guardrails are off by default and whole-hour only, with a bypass flag. DLT registration and the 160-series RBI/SEBI certificate are left to the buyer. Number KYC needs a CIN and accepts Pvt Ltd companies only. India residency is Enterprise-only, on Plivo + Azure OpenAI with no BYOK.
- Bolna already ships LLM-native setup: Studio Auto Build, Ask Bolna, edit-prompt-by-chat, an MCP server listed as a Claude connector, and 20 Skills. So VP's chat-driven setup is parity, not a wedge. Bolna has no contact/CRM object, no cross-call memory and no customer-facing learning loop.
- Reliability: 18 status incidents in the last 6 months, 9 of them upstream Indian telephony (Plivo/Vobiz/carrier), with no documented carrier failover. Buyer complaints (Trustpilot 2.6, 4 reviews, all 1-star) are about support, refunds and pilots, not voice quality.
- Velocity: 72 changelog entries May-Oct 2026 vs 36 in the previous six months, dominated by model/provider additions and developer tooling. Hiring is go-to-market (GTM)-heavy, including BFSI enterprise sales posted 2026-10-15. Bolna is moving into BFSI post-sale.
- Where VP can be measurably better, each with a task: compliance by default (opt-out row and DND number in a messy CSV), CSV hygiene, carrier failover and failure explainability, semantic turn-taking (PSTN reply gap), support and billing transparency, HMAC-signed webhooks.
- Method calibration: the blind protocol was contaminated by its own input. Four l4a parity.csv rows quote Bolna OSS code; those topics are flagged and excluded from the hit rate. REA analyze-web-bundle hung twice; inspect-web-page + export-web-scripts worked. No source maps are served. There is no public web-call widget, so no signalling capture was possible.

### Pre-registered predictions for the account phase

- P01 Sign-up to first live call on our verified Indian handset takes 12-25 min (p50 ~15), on a Bolna-provided number; the trial is limited to verified numbers and 2 concurrent calls (p=0.75).
- P02 Buying an Indian DID is blocked on trial until the compliance application (CIN Pvt Ltd + GST) and Vobiz KYC are approved, so not the same day (p=0.85).
- P03 Auto Build gives a working agent in <=10 min on the default stack: Vobiz, Deepgram nova-3 hi, Azure gpt-4.1-mini, ElevenLabs Turbo v2.5 Tripti (p=0.8).
- P04 Messy CSV: duplicates not de-duplicated (p=0.75); invalid numbers skipped without per-row reasons (p=0.7); 10-digit numbers without +91 rejected, not normalised (p=0.65); the opt-out row is dialled (p=0.85); Devanagari names pass through intact (p=0.8); empty columns produce awkward prompts (p=0.6).
- P05 Guardrails start off; windows are whole-hour only; no day-of-week, holiday or per-number caps; batch start rounds up to the next 10 minutes (p=0.75).
- P06 Voicemail detection misclassifies >=1 of 5 Indian operator/IVR messages (p=0.6); cold transfer works on Plivo/Vobiz (p=0.75); warm transfer passes context to the human (p=0.5).
- P07 'failed' carries error_message, but 'stopped' and provider-side failures give no actionable reason (p=0.7).
- P08 Async CSV export of 50 rows arrives in <5 min with extracted fields as columns (p=0.75).
- P09 Handset reply gap on Indian PSTN with the default stack: p50 1.3-2.2 s, p90 >= 2.5 s (p=0.7). With the India-residency config: p50 1.1-1.7 s (p=0.5).
- P10 A default Vobiz call to an Indian number is processed on the ap-south-1 ws cluster, despite the docs saying US is the default (p=0.6).
- P11 The agent holds the caller's language on >=80% of Hinglish turns (p=0.55); after a full switch to Hindi, >=1 in 5 replies come back in English (p=0.5).
- P12 An Auto-Built agent with no explicit disclosure rule admits being an AI when asked 'are you a bot?' (p=0.7).
- P13 First human reply to a trial email ticket takes >24 h (p=0.6).

### Needs a trial account to learn

- Time and motion: minutes and clicks for sign-up (hCaptcha + email), verifying our handset, the first live call, Auto Build, and the full fixed task list, each run twice.
- Billing truth: whether the $0.02/min platform fee is added on top of the bundled 6-cent rate; the telephony per-minute rate on Bolna-hosted Indian numbers; 30-second pulse rounding; what an invoice shows (closes open.2026-10-20.bolna-blind-platform-fee).
- Compliance and KYC: the actual compliance-application and Vobiz KYC forms, approval time, whether a trial account can buy an Indian DID, and what the violations page shows.
- Messy 50-row CSV behaviour: duplicates, non-E.164 Indian numbers, the opt-out row, Devanagari names, empty columns; record the dashboard's 'valid contacts' count and any per-row errors.
- Processing region of a default Vobiz call to an Indian number (raw logs or latency, US vs India config), plus Bolna's own per-component latency breakdown.
- PSTN battery on our Plivo number in stereo: handset reply gap, cut-ins, language hold for Hinglish and Hindi switches, the 'are you a bot?' disclosure, task success.
- Voicemail and IVR classification on Indian operator messages; cold and warm transfer, and what context reaches the human.
- Live web-call capture in our own logged-in browser: confirm SIP.js to FreeSWITCH signalling, TURN use and the returned ice_servers (scores BI-20/BI-21).
- TTS fingerprint: record the default 'Tripti' voice for a speaker-embedding match against the ElevenLabs library.
- Failed-call diagnosis: find a forced failed call and its reason; check error_message coverage for 'stopped' and provider-side failures.
- Export: async CSV report contents and timing; extraction columns.
- Support: first human response time to a trial ticket.
- Verifier lane only (not account): score blind-inferences.json against the OSS repo at a recorded commit SHA, using the pre-registered rule in that file.

### Run facts

- Claims: 66 {"observed": 48, "inferred": 12, "vendor_claimed": 6, "unknown": 0}
- REA used: True
- REA notes: REA is rea-agents 6.7.0 via npx on Node 22.22. `doctor` reports no native analysis engines (Hopper, Ghidra, IDA, JADX, Kuna) and a missing skill registration. `rea setup` was NOT run, because it would modify /root/.claude.json.

Worked:
- list-browser-targets against a headless Chromium CDP endpoint (port 9222, through the agent proxy);
- inspect-web-page with --include-script-sources --include-json-body-shapes --include-websocket-shapes --include-storage-keys, which captured 111 retained scripts from platform.bolna.ai/login in about 7 s;
- export-web-scripts, which wrote the verified scripts plus a manifest;
- inspect-web-network-capture on a Playwright HAR (143 records).

Failed: analyze-web-bundle hung until timeout with empty output, twice:
- 300 s with --fetch-source-maps;
- 200 s without it, with NODE_USE_ENV_PROXY=1 and NODE_EXTRA_CA_CERTS set.

Fallback: Playwright HAR captures of 5 pages, plus REA export, plus curl of the 145 lazy chunks named in the main bundle (256 bundles in total). No source maps exist: none of the bundles carries a sourceMappingURL, main-*.js.map returns the SPA HTML, and the Next.js map returns 404. REA's inspect-web-page is passive, so the HAR covered the network side.

Other findings:
- There is no public web-call widget, so no WebRTC signalling capture was possible. The web-call stack (SIP.js to FreeSWITCH) came from strings in the public bundle.
- Login is behind hCaptcha; we stopped there.
- Trustpilot, G2, Product Hunt and Reddit returned 403/429 to curl and were not bypassed. Trustpilot did come back through WebFetch.
