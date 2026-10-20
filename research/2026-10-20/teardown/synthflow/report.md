REPORT: Synthflow teardown, account-free phase, 2026-10-20. I did not write report.md because the subagent harness forbids report .md files. This text is the report. Every claim carries an ID, a grade and evidence in research/2026-10-20/teardown/synthflow/claims.json.

HEADLINE: the "no-code UX reference" is no longer self-serve. Synthflow is now a sales-led enterprise CX vendor:
- Pricing starts at $30k/yr. The old plans are "no longer sold" and new sign-ups "may be reviewed" (SYN-03, 04, 40).
- It has no India footprint at all: no region, no Indian numbers, and no mention of TRAI, DLT, NCPR or DPDP (SYN-20, 21, 60, 61).
- Its outbound tooling is thin and leaves compliance to the buyer (SYN-05 to 07, 71).

1. PRODUCT SURFACE (observed)
- **Docs and API:** 371 docs pages and an OpenAPI spec with 69 paths and 110 operations.
- **Builder:** Prompt Builder plus Flow Designer.
- **Aurora copilot:** Enterprise-only. A public flag shows it routes between Claude Sonnet and Haiku.
- **Actions:** booking, transfers (TEL, SIP, dynamic, phone books), HTTP, in-call SMS and WhatsApp, post-call SMS and email, extractors, evaluations, MCP.
- **Other features:** knowledge base, Memory groups, Test Center simulations, version control, WhatsApp calling, WebSocket media, chat, Workflows (embedded Activepieces Cloud), SIP ladder and PCAP download, live listen-in, analytics, CSV export, signed webhooks, agency subaccounts, 3 roles, SSO and 2FA.
- **Enterprise-only:** Campaigns, SIP and custom numbers, GPT models, BYOK, the fallback voice and scheduled exports.
- **Campaigns** (shipped 2026-08-18):
  - created through the API only, 10k recipients per request;
  - cancelled automatically after 7 days;
  - failed recipients are not retried, and there is no campaign webhook;
  - de-duplication works only if the caller supplies an id;
  - the calling window cannot cross midnight or be edited, and agent hours that conflict with it make recipients fail.
- **Contacts:** only name, phone, email and company. There are no consent, opt-out or DND fields and no suppression endpoint. Opt-out exists only as a post-call LLM-judge flag (no_opt_out).
- **Call object:** telephony-first, with 14 statuses, 10 end reasons, and RTCP RTT, jitter, loss and MOS per leg.
- **Silent API behaviour:** sending a GPT value for the model on a non-enterprise plan is accepted, then ignored without any signal.
- **Dashboard:** the Bubble app at fine-tuner.ai is moving to a React app (default since 2026-10-14). Auth and Settings are still on Bubble, and public flags show the /v2/subaccounts API was served by Bubble until recently.

2. ARCHITECTURE (graded)
- **Hosting:**
  - GCP (observed): every SIP, media and egress IP maps to us-east1, europe-west3 or northamerica-south1 (LATAM), using Google's cloud.json. One US signalling IP is in a Microsoft range.
  - api.us and api.eu sit on GCP anycast load balancers; app and api (Global) sit behind Cloudflare.
  - The subprocessor list says GCP, OpenAI, Deepgram, ElevenLabs, Bubble.io and Twilio (vendor-claimed).
- **Telephony:**
  - They run their own SBCs on ports 32681 and 32682 (observed).
  - A job post names Kamailio, RTPEngine and FreeSWITCH on GCP and Kubernetes (vendor-claimed). A public FreeSWITCH fork "for image builds" is observed on GitHub.
  - No India PoP. A regional PoP is offered on request: their LATAM case went from 191 to 99.5 ms RTT.
- **WebRTC:** browser calls go through a Janus gateway (janode and AudioBridge, TURN relay forced) (observed in the bundle). Custom web integration uses raw WebSocket media (observed).
- **Frameworks:** LiveKit appears only as a 2024 dev Egress service account (inferred: not current). No Pipecat or Vocode markers. Orchestration looks like in-house Python/aiohttp, judging by error strings (inferred).
- **STT:** Deepgram, plus Soniox in the frontend enum, plus "Synthflow STT" (observed). Their "Multilingual" list matches Deepgram Nova-3 multi word for word (inferred). Eager end-of-turn and speculative endpointing are present (observed).
- **TTS:** ElevenLabs Flash by default, up to v4 Turbo, plus Deepgram Aura-2 and their own "Synthflow TTS" with 200 voices, shipped 2026-05 (observed). The sub-200 ms claim is vendor-claimed.
- **LLM:** OpenAI-only (GPT-4o to GPT-6 Luna) plus "Synthflow LLM" and "Advanced Synthflow LLM". The base model is not public (unknown).
- **Homepage demo:** a separate "Conductor" widget on Fly.io streams raw PCM over WebSocket and is gated by Turnstile and an email OTP. It maps to speech-to-speech models (gpt-realtime-2, gemini-3.8-live), so the demo is not the product's cascade (observed). I did not exercise it because of the OTP and bot-protection boundary. This corrects l4b 2026-10-17, which said "recorded samples only".
- **Exposed flags:** flipt.synthflow.ai serves 60 feature flags, descriptions included, to unauthenticated visitors (observed). The flags show the roadmap: a voice-UX evaluator, predicted CSAT, a call-quality card, a Memory Service migration, and a Soniox voice for one customer.
- **Source maps and SDKs:** source maps are referenced but not served. There is no official SDK; the GitHub org has 6 repos.

3. PRICING (FX 95)
- **Now:** Enterprise from $30k/yr (INR 28.5 lakh), with no per-minute list price. This confirms pricing-history.json and ledger CMP-18 (observed).
- **India all-in estimate:** INR 15.2-18.0/min (inferred). That is the H1-2026 platform rate ($0.11-0.14) plus BYO Twilio to an Indian mobile ($0.0496). On top of the floor, the effective rate is INR 47.5/min at 5k min/month and INR 23.75 at 10k. That is 3-5x Indian list prices.
- **COGS reconstruction:** on a third-party stack, $0.034-0.085/min (INR 3.2-8.1), a 39-69% gross margin (inferred). Moving STT, LLM and TTS in-house fits margin defence.
- **Other:** numbers are US/CA/AU only at $1.50/mo. In-product reselling ended 2026-09-15, which supersedes the parity cell "$2,000/mo reseller toolkit".

4. VELOCITY (observed)
- 106 dated changelog entries, 67 of them in the last 6 months (10-12 a month since March, against 1-5 a month in 2025). The weight is on enterprise contact-centre integrations: Zoom, RingCX, 8x8 and Five9.
- The new incident.io status page (history only from 2026-07-16) shows 3 incidents:
  - 2026-08-07: post-call AI outputs were empty for 2 h 50 m while webhooks still fired. The cause was a model-restriction config, which lines up with the LLM lock-down (inferred).
  - 2026-08-17: calls were down 9-12 min and warm transfers failed for 3 h 42 m.
  - 2026-09-07: white-label logins failed.

5. INDIA PLUMBING
- **Absent:** zero docs pages mention India, TRAI, DLT, NCPR/DND, 140/160 or DPDP (observed).
- **No compliant Indian CLI path** without a custom PoP (inferred). They sell no Indian numbers, SIP is Enterprise-only, Indian trunks need media anchored in India, and Twilio dials India only from foreign numbers.
- **Consent:** a recording-consent toggle and an example AI disclosure. Everything else is the buyer's job (observed; confirms ledger CMP-27).
- **Calling windows:** exist per campaign and per agent, with no jurisdiction presets.
- **Residency:** data sits in the EU or US, and the cluster is permanent. PII redaction covers US-centric types only.
- **Languages:** Hindi is the only Indic language. There is no en-IN accent, and Multilingual delivery is "biased toward English" (observed).

6. FAILURE MODES
- **Trustpilot:** TrustScore 4.1 over 215 reviews, unchanged. I coded 21 one- and two-star product reviews: SUPPORT 19, BILLING 11, RELIABILITY 9, PLAN_GATING 4, TELEPHONY 3. That is the same order as the 2026-10-17 VoC and extends the 11 rows in complaints.csv. Quotes:
  - "the technology to be fundamentally unreliable for professional use" (2026-05-04)
  - "continue to get billed each month" (2026-04-11)
  - "locked behind their absurdly overpriced enterprise plan" (2025-08-18)
  - "Their bot is suddenly just disconnecting calls." (2025-03-25)
  - "because their batch calling didn't work I couldn't use any of it." (2024-12-06)
  - "Bot fails to make calls with no explanation" (2024-07-17)
  - "they will not inform if there's a major change." (2025-02-04)
- **Feedback board:**
  - an agency asks for Slack support because email went unanswered (5 days ago);
  - "Don't make breaking changes to the Assistants API endpoints";
  - there is no fallback when Synthflow errors on the V2 SIP path.
- **Failure-reason taxonomy:** the dashboard's end-reason map keys on raw Python exceptions and internal orchestrator URLs (observed).
- **Blocked, not bypassed:** G2, Capterra, Reddit and security.synthflow.ai.

7. v2 NOTES
- **Memory groups:** per-contact summaries injected at call start, matched by phone number, shared across voice, SMS and WhatsApp (observed).
- **Learning is marketing-only:** the site promises "agents improve continuously" and "Data Fine-Tuning" in the future tense. The docs' Learn step is analytics, logs and export plus Aurora prompt review. There is no automated optimisation and no A/B testing. This is the marketing-vs-docs gap pattern.

WHAT THIS MEANS FOR THE THREE DECISIONS
1. **Pre-sale or post-sale first:**
   - The global no-code leader went up-market into inbound and post-sale CX, with 13+ contact-centre integrations, while its outbound tooling stays API-only and compliance-free.
   - Indian promotional outbound needs NCPR, DLT, 140-series and consent plumbing that Synthflow does not have.
   - That supports starting post-sale with neutral service calls (beachhead-v2, REG-35), with compliance built in as the hedge for pre-sale.
2. **v1 parity floor:** Synthflow's table stakes are:
   - Must-be: KB, transfers (warm, with outcome states), voicemail handling, post-call extraction and judge, signed webhooks, call logs with recordings and reasons, CSV export, roles, PII and retention toggles.
   - Performance: simulations, version control, memory, campaign pacing and windows, call-quality telemetry.
   - Delighter: an MCP/Claude/ChatGPT builder copilot.
3. **Where VP is measurably better.** Each point comes with the task that proves it:
   - **Self-serve to first Indian handset call** in under 15 min, against a review gate plus $30k (SYN-P01).
   - **The messy-CSV campaign:** upload, validation, de-duplication, opt-out suppression and retries, against API-only campaigns with no retry (SYN-P04).
   - **Compliance as product:** NCPR scrub, a consent ledger, 140/160 numbers and IST windows with presets, against none (SYN-P05, P12).
   - **Normalised failure reasons** an operator can act on, against raw exceptions (SYN-P07).
   - **Indian PSTN reply gap and Hinglish language hold** from an India region, against us-east1 or Frankfurt media (SYN-P09, P10).

ACCOUNT PHASE: see account_phase_needs. The trial may be unobtainable; open.2026-10-20.synthflow-account-phase records this.

Tool: REA 6.7.0 ran inspect-web-network-capture in 3.7 s, but it only re-wraps the HAR. analyze-web-bundle hung for 300 s, so the findings came from Playwright plus my own parsing.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Self-serve is closed: Synthflow is Enterprise-only from $30k/yr (INR 28.5 lakh), the old plans are 'no longer sold' and new sign-ups 'may be reviewed'. Campaigns, SIP/custom numbers, Aurora, GPT models, BYOK, SSO, the fallback voice and scheduled exports are all Enterprise-gated (SYN-03, 04, 40; observed).
- No India footprint: every SIP, media and egress IP maps to GCP us-east1, europe-west3 or northamerica-south1; the clusters are Global/US/EU only; numbers are US/CA/AU only; the docs never mention TRAI, DLT, NCPR/DND, 140/160 or DPDP. Inferred: without a custom PoP there is no compliant Indian CLI path (SYN-20, 21, 60, 61).
- Campaigns (since 2026-08-18) are created through the API only, cancelled after 7 days, never retry failed recipients, cannot cross midnight or be edited, and fail recipients outright when agent hours conflict. Contacts have no consent, opt-out or DND fields and there is no suppression list; opt-out is only a post-call LLM-judge flag (SYN-05, 06, 07; observed).
- Stack: their own SBCs (Kamailio, RTPEngine and FreeSWITCH per a job post, plus a public FreeSWITCH fork); a Janus WebRTC gateway with forced TURN relay for browser calls; raw WebSocket media for integrations; Deepgram (their 'Multilingual' list matches Nova-3 multi word for word), Soniox and 'Synthflow STT'; ElevenLabs, Aura-2 and 'Synthflow TTS'; OpenAI-only LLMs plus an undisclosed 'Synthflow LLM'. LiveKit appears only as a 2024 dev Egress account (SYN-22 to 30).
- Non-enterprise agents were forced onto 'Synthflow LLM' on 2026-08-25, and API requests that set a GPT model are silently ignored. A post-call outage on 2026-08-07, caused by a model-restriction config, lines up with that rollout (SYN-09, 52, 53).
- Estimated India all-in cost is INR 15.2-18.0/min (last public platform rate plus Twilio to an Indian mobile) on top of the $30k floor: INR 47.5/min effective at 5k min/month. Reconstructed third-party COGS is INR 3.2-8.1/min, a 39-69% gross margin (SYN-41, 42; inferred).
- The failure-reason taxonomy is unnormalised: the dashboard's end-reason map keys on raw Python exceptions and internal orchestrator URLs. Trustpilot low-star codes (n=21) are SUPPORT 19, BILLING 11, RELIABILITY 9, PLAN_GATING 4, TELEPHONY 3, the same order as the 2026-10-17 VoC (SYN-70, 71).
- flipt.synthflow.ai serves 60 feature flags with descriptions to unauthenticated visitors. They expose the roadmap: a voice-UX evaluator, predicted CSAT, a call-quality card, the Memory Service migration, the Bubble-to-React migration, and Claude Sonnet/Haiku routing for the Aurora copilot (SYN-13, 16, 33). This is a pattern for VP to avoid.
- Correction to l4b 2026-10-17: a live homepage demo now exists. It is a 'Conductor' widget on Fly.io, gated by Turnstile and an email OTP, and its agent table maps to speech-to-speech models (gpt-realtime-2, gemini-3.8-live), not the product cascade. It was not exercised because of the OTP boundary (SYN-31).
- Velocity: 67 changelog entries in 6 months (10-12 a month since March), weighted towards enterprise contact-centre integrations (Zoom, RingCX, 8x8, Five9). Learning is marketing-only ('Data Fine-Tuning' in the future tense); the docs document no automated optimisation and no A/B testing (SYN-50, 51, 81).

### Pre-registered predictions for the account phase

- SYN-P01 (p=0.65): a team@vyakti.ai sign-up lands on the 'under review' holding page; first live call to our Indian handset comes >24 h after sign-up. If access is granted, the first web call comes within 10 min of access.
- SYN-P02 (0.6): the Indian handset is reachable only through our own Twilio account (US caller ID, geo-permission on). The path takes >=30 min and fails at least once with a Twilio-side 403 or 'No International Permission'.
- SYN-P03 (0.85): the standard agent builds in <=20 min. Only Synthflow LLM is selectable, an API llm=gpt-* is silently ignored, and there is no en-IN or Hinglish option.
- SYN-P04 (0.75): the messy 50-row CSV fails or is awkward. There is no CSV campaign upload (API-only); duplicates are skipped only with ids; bad numbers fail at dial time; the opt-out row gets dialled.
- SYN-P05 (0.8): Indian calling hours must be hand-built. Agent hours plus a campaign window make at least one recipient fail with 'outside the configured working hours'.
- SYN-P06 (0.6): Indian operator announcements or caller tunes are misclassified at least once in 3 tries. A warm transfer adds >=3 s before the human's first audio.
- SYN-P07 (0.6): a failed call is found in <3 min, but at least one reason string is raw or unnormalised. Failed recipients are never retried.
- SYN-P08 (0.85): manual CSV export works in <2 min. Scheduled exports need an account manager.
- SYN-P09 (0.6): handset reply gap on Indian PSTN is p50 >=1.6 s and p95 >=2.5 s for English, and Hindi/multi is >=0.3 s slower. The vendor's in-app latency reads lower than the handset measurement.
- SYN-P10 (0.55): on 'multi', a Hinglish caller gets English replies in >=30% of turns; on 'hi', English product terms are mangled in >=2 of 10 turns.
- SYN-P11 (0.6): a default agent does not disclose that it is an AI unprompted, but answers 'are you a bot?' honestly in >=4 of 5 calls.
- SYN-P12 (0.9): no screen offers NCPR/DND, DLT, 140/160, a consent ledger or an India region.
- SYN-P13 (0.6): a sales quote has a floor >=$30k/yr and >=$0.10/min before telephony, and an India deployment needs a custom PoP or a partner carrier.

### Needs a trial account to learn

- Access itself is the first measurement. Sign up with team@vyakti.ai using email/password (not Google), and record whether a holding or review page appears and how long approval takes. Do not book a sales call or demo without the owner's go; if approval requires one, log that as the onboarding result.
- Credentials go only into a scratchpad env file (mode 600), never into chat. Add no payment method without an owner-set spend cap. Any workspace is non-enterprise, so expect Synthflow LLM only and no Campaigns or SIP.
- Telephony to an Indian handset needs our own Twilio account connected (Account SID and Auth Token) with India geo-permission. Synthflow can buy only US/CA/AU numbers, and SIP or custom numbers are Enterprise-only. Calls go only to our own verified Plivo or test numbers.
- Run the fixed task list and score success, time and errors: build the standard agent; the messy 50-row CSV (expect an API-only path); calling hours (window vs business-hours conflict); voicemail and Indian operator announcements; warm transfer; find a failed call and its reason; CSV export.
- Run the l4b caller battery on Indian PSTN in stereo: handset reply gap p50/p95 (n>=30 turns), cut-ins, Hinglish language hold on 'multi' vs 'hi', the 'are you a bot?' disclosure probe. Compare with Synthflow's own per-call RTT, MOS and turn-latency fields.
- Fingerprint what 'Synthflow LLM', 'Synthflow STT' and 'Synthflow TTS' are: STT error patterns on the fixed utterance set (Deepgram vs Soniox), TTS speaker-embedding similarity against ElevenLabs, Aura-2 and Soniox voices, and LLM style and latency signatures.
- Capture the dashboard HAR after login (own account only, slimmed before REA): the BFF API surface, the Janus /webrtc/ice-servers flow for Web Call, the TURN provider and region, and the WebSocket media node SNI for India-originated sessions.
- Check every account screen for compliance controls (DND/NCPR, DLT, 140/160, consent records, India region) and screenshot the AI Model, language and voice selectors and the Usage/Cost-by-Provider breakdown, which may reveal the provider split.
- If the owner approves a sales conversation: get the per-minute enterprise rate, the included minutes under the $30k floor, India PoP availability and cost, and whether an Indian carrier (Plivo, Exotel, Tata) over SIP is supported, to score SYN-P13.

### Run facts

- Claims: 55 {"observed": 46, "inferred": 7, "vendor_claimed": 1, "unknown": 1}
- REA used: True
- REA notes: REA 6.7.0 ran via npx -y rea-agents@latest. Two commands were tried.

1. inspect-web-network-capture <app.har> har --format json worked. It took 3.7 s on a 10 MB Playwright HAR and returned a lossless 10 MB evidence envelope with an evidence_id and sha256. It gave no analytic summary, so it adds provenance but no insight. Adding --token-limit was refused with UNSUPPORTED_OUTPUT_COMBINATION.

2. analyze-web-bundle http://127.0.0.1:9333 <targetId> --observation-ms 5000 --fetch-source-maps was run against a headless Chromium CDP target on app.synthflow.ai. It produced no stdout and no stderr and was killed at the 300 s timeout. That matches the vapi lane's result.

Fallback: Playwright passive HAR captures (synthflow.ai, fine-tuner.ai/auth, app.synthflow.ai), then my own Python -I extraction of response bodies, bundle string search and flag-snapshot parsing. Source maps are referenced but not served: the .map URLs return the SPA's HTML. The REA outputs and the timeout record are in data/teardown/synthflow/rea/, and a rejection node is proposed in the inbox.
