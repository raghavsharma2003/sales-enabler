SquadStack teardown, account-free phase, read 2026-10-20. The harness refused the report.md write, so the report is this text. Every claim has a grade and an evidence path in research/2026-10-20/teardown/squadstack/claims.json (SQS-01..69). Grades: O observed, I inferred, V vendor-claimed, U unknown.

HEADLINE
SquadStack sells a managed, outcome-priced engagement and markets a speech stack that is "owned, not orchestrated". Its own public code shows something else (O: SQS-19..SQS-32):
- Orchestration is Pipecat. The in-app SDK bundles @pipecat-ai/client-js 1.13.1 and daily-transport 1.6.9 with daily-js 0.90.0 and opens sessions with POST /bot/connect.
- TTS providers: ElevenLabs is the default (eleven_multilingual_v2, called on ElevenLabs' India-residency endpoint). Cartesia Sonic 3.5/3.6 and Sarvam are also listed.
- STT providers: sarvam, cartesia, squadstack_ws and arc_stt, with fallback, best-latency or load-balance routing.
- Post-call entity extraction runs on OpenRouter google/gemini-2.5-flash.
- Its Vanta trust centre lists these subprocessors: Exotel, Ozonetel, Plivo (USA), OpenAI (USA), Google Gemini, Infobip, Gupshup and AWS. ElevenLabs, Cartesia, Sarvam, Daily, OpenRouter and its telemetry vendors are missing from the list.
- Every origin is in AWS ap-south-1. The backend is Django, DRF, Celery and Postgres, deployed with Terraform on AWS.
- Only the ASR (Arth V2) is plausibly in-house. Its claims are 67 ms finalize-to-response and 8.85% semantic WER; the benchmark on Hugging Face is gated (V: SQS-31).

1. PRODUCT SURFACE
Public sales path (O: SQS-01, SQS-34):
- Every call to action is Book a Demo; SquadStack's staff create the campaigns.
- Engagements are Pilot (90-day commitment), Scale and Strategic.

The customer portal's public Next.js build manifest exposes 61 routes (O: SQS-03, SQS-05):
- Campaigns: a workflow builder with Voice Bot, Lead Router, human Call, multi-level IVR, SMS (Sender ID plus DLT Entity ID) and Email blocks.
- Lead tools: leads, lead journey, import history, lead prioritisation rules plus a data-science rule miner.
- Call tools: call details, observability, realtime logs, reports, downloads.
- Account: billing, integrations, teams, human-telecaller hiring ("players").
- A customer-specific route.

Plug-N-Play, a self-serve flow for small businesses, already exists in code (O: SQS-06, SQS-37):
- Shopify and Shiprocket leads, auto-generated scripts that wait for approval, and human callers chosen by CEFR language level.
- Billing: a per-minute package, wallet top-ups and GSTIN checks.
- Setup fee: "50% of the first month's billing" goes to one-time platform setup and caller training.

A new AI agent builder at ai-platform.squadstack.ai is not linked from the marketing site (O: SQS-04, SQS-16, SQS-17):
- Pitch: "Build, deploy, and optimize personalized AI voice agents in minutes", with email or Google sign-in.
- Sections: agents, call details, agent evals, QA config, knowledge base on Qdrant, a voice library, observability, prompt versions and credits usage.

Osno AI (app.osno.ai) is very likely SquadStack's own self-serve brand (I: SQS-68):
- It uses the same Firebase project (squadstack-ai-paas).
- SquadStack's code special-cases its host and calls a create/osno-user endpoint.
- SquadStack's own cost comparison lists Osno as a competitor.

Hiring points the same way: three of 22 open roles are product managers for a "Voice AI platform" with self-serve onboarding, APIs and SDKs (O: SQS-45).

Voicemail is classified after the call, from transcript keywords; no media-level AMD setting is visible (O: SQS-11). This fills the l4a parity row voicemail_amd: unknown.

Transfer exists only as a managed hand-off to SquadStack's human advisors pod. The page the l4a warm_transfer: yes row cited now 301-redirects (I: SQS-10).

2. DOCS AND API
- No developer docs exist. docs.squadstack.ai and status.squadstack.ai are CNAMEs to ACM validation targets with no address, which explains the 502 seen on 2026-10-17 (O: SQS-12).
- The only public API is a Postman collection published 2024-05-31, covering lead ingestion (O: SQS-13):
  - per-campaign endpoints to create, update, upsert, convert, disable and delete leads, single or bulk (100 leads per request);
  - basic auth, 100 requests/min by default, mandatory IP whitelisting.
- Outbound data is per-customer disposition webhooks (O: SQS-14):
  - a call event with outcome, recording URL and attempt number;
  - a "judgement" event when the lead's journey ends;
  - an S3 drop or self-hosted Airbyte as alternatives.
- The data model is a BPO model extended to bots: judgement, bucket-to-outcome mapping, redial count and a sales-executive transcript. The agent is not the root object (I: SQS-15).
- The AI-platform agent object (O: SQS-16):
  - LLM: temperature 0.5, max tokens 100, and a router with region, hedging, cross-model fallback and hot-swap after N turns;
  - TTS: speed 0.6-1.5, volume, emotion;
  - call config: max session 240 s, deterministic language switching, user idle 10 s x 3;
  - context summarisation after 5 turns, keeping the last 3;
  - entity extraction, word replacements, RAG toggle.
- Call search in the portal spans at most 10 days and shows an outcome label per call. STT, LLM and TTS failures appear only as aggregate counts and latency charts (O: SQS-18).

3. ARCHITECTURE
Evidence is listed in the headline above.
- Telephony: Exotel, Ozonetel and Plivo; web calls run over Daily (O: SQS-23, SQS-25).
- Lens, the internal call observability tool: per-call spans and latency by provider and model, with retention of 90 days for aggregates, 30 for spans, 7 for extraction logs and 4 for trace logs. Its MCP server is public (squadrun/lens-mcp) (O: SQS-28).
- Auth: Cognito and OTP in the portal; Firebase in the AI platform.
- Telemetry: Sentry, Datadog RUM, Mixpanel, Clarity and PostHog (US) (O: SQS-29).
- Security note: the public AI-platform bundle embeds a static key for an internal service and a demo key. Neither value was reproduced or used (O: SQS-30).
- Method: Playwright HAR captures plus the 98 public portal chunks listed in the build manifest, DoH lookups, AWS IP ranges and the GitHub organisation listing. REA failed on both paths, so its output was not used (O: SQS-33).

4. PRICING
- /pricing still publishes no rate. Billing is per second of live conversation, plus a setup fee per use case (O: SQS-34).
- The pilot terms still contradict each other: a 90-day commitment versus "3-8 weeks".
- The homepage FAQ still says "typically INR 2-5/min" with telephony included, which confirms the 2026-10-17 verify.md correction (O: SQS-35).
- Revenue-linked pricing for BFSI started 2026-09-14: a low base plus a success fee per outcome (V: SQS-36).
- The "$0 setup fee" on its own SEO page contradicts /pricing (O: SQS-38).
- The ROI calculator is three hard-coded multipliers whatever the inputs: conversions x1.4, CAC /3 and 90% connectivity (O: SQS-39).
- An all-in INR/min is not derivable from public material. The only figure is INR 2-5 per live minute, about USD 0.021-0.053 (I: SQS-40).
- Reconstructed COGS per connected minute (cogs.csv, desk computation over 15 stack combinations, I: SQS-41):

  | TTS | COGS INR/min | Margin at INR 2 / 3.5 / 5 |
  |---|---|---|
  | ElevenLabs Multilingual v2 at PAYG (the bundle default) | 3.3-4.7, mid 3.6 | -82% / -4% / 27% |
  | Cartesia Sonic-3.6 | mid 2.2 | -10% / 37% / 56% |
  | Sarvam Bulbul | mid 1.6 | 22% / 56% / 69% |
  | Self-hosted TTS | mid 1.1 | 45% / 69% / 78% |

  The INR 2 floor needs SquadStack's own or Sarvam TTS, or a deep ElevenLabs discount.
- Volume cross-check (I: SQS-42). Arth's "1 crore minutes in 2 months" at an 80% share means about 2 lakh AI minutes a day. That is INR 15-37 Cr a year at INR 2-5, the same order as FY24 revenue of INR 26.5 Cr. "50 lakh+ calls a day" then means about 0.04 minutes per call, so the "calls" must be dial attempts.

5. VELOCITY
- There is no changelog and no public status page; status.squadstack.com resolves to private IPs (O: SQS-43).
- Blog dates cannot be trusted: about 13 launch posts share the sitemap lastmod 2026-09-22.
- Dated events (O: SQS-44):
  - 2026-05-15: domain moved from .com to .ai;
  - May to July: platform PM roles and a forward-deployed engineer role opened;
  - 2026-09-14: revenue-linked pricing;
  - 2026-10-06: in-app SDK rebuilt;
  - 2026-10-09: eight competitor comparison pages updated and the ASR benchmark dataset created;
  - 2026-10-13: Arth V2;
  - 2026-10-19: portal and AI platform redeployed.
- Hiring: 10 of 22 open roles are in sales or marketing, and 1 is in engineering (O: SQS-45).

6. INDIA PLUMBING
- Claimed (V: SQS-46): TRAI DND scrubbing, a hard 9:30-20:30 calling window, consent gating, opt-out and "configurable AI disclosure".
- Observed (O: SQS-47): a business-wide DNC blacklist marked "verified DND by scrubbing", 10-digit number validation, and the customer's own SMS Sender ID and DLT Entity ID.
- 140, 160 and 1600-series numbers are not mentioned anywhere. The marketing sells "spam number rotation" instead, and its 2024 TRAI filing opposed the 140 series for opt-in calls (O: SQS-48).
- No per-campaign calling window was found (I: SQS-49).
- The Terms make the buyer warrant consent to record calls and to train on the voice data, and disclaim regulatory fitness (O: SQS-50).
- The privacy policy is the legacy gig-worker notice, borrows CCPA wording, and gives no DPDP notice to the people called (O: SQS-51).
- "All data within India" covers storage only: OpenAI and Plivo are US subprocessors, and model calls route through OpenRouter (I: SQS-52).
- The trust centre lists RBI and SEBI audits, VAPT reports, SOC 2 Type II and ISO 27001/27701 (O: SQS-54).

7. FAILURE MODES
- There is no public buyer-side complaint corpus (O: SQS-55):
  - Capterra has 0 reviews;
  - G2, Trustpilot and SourceForge returned 403 and were not bypassed;
  - the 2026-10-17 VoC file holds 1 item, from a worker.
- The buyer-side complaint codes in l4a therefore cannot be confirmed or refuted for SquadStack.
- The supply side, its human telecallers, does show failures. Partner app com.squad.run, 15,007 ratings, 3.85 stars (O: SQS-56):
  - "Not able to transfer redeem since 3 month" (2026-07-15);
  - "for the last 6 months I haven't received any work opportunities" (2026-07-10);
  - "My account was suddenly deactivated ... My money has been stuck in the app for months" (2026-06-10);
  - SquadStack's own replies say it is "not doing any new hiring right now";
  - "delay salary payments significantly";
  - "the exact same copy-pasted, robotic response".
- The human fallback in the managed model therefore rests on a shrinking gig pool (I: SQS-57).
- The "Turing test" counts a listener who picked at least one of two AI recordings as human, and it is dated September, October or November 2025 on different pages (O: SQS-59).
- The marketing's numbers contradict each other: 600M vs 900M vs 3B training units, and 20+ vs 1,000+ voices (O: SQS-60).

8. V2 NOTES
- Persistent Memory (V: SQS-62): memory per lead and campaign, up to 20 extraction points, Refresh or Rolling History mode, and a summarised briefing before each call.
- Lift (V: SQS-64): one human-reviewed prompt edit at a time, locked sections for compliance, pricing and identity, and a staged rollout from a small slice to 1/4, 1/2 and all traffic. This is the pattern for VP's v2 to beat.
- Optimize (V: SQS-65): 80/20 splits with a significance flag.
- Visible in code (O: SQS-63, SQS-65): context summarisation, hot-swap, agent evals and prompt versions. No memory or Lift screen appears in the public bundles, which partly confirms ledger.CMP-01.

9. PREDICTIONS
Fourteen predictions are pre-registered in predictions.json; the main ones are in the predictions field.

WHAT THIS MEANS FOR THE THREE DECISIONS
1. Pre-sale vs post-sale. SquadStack is strongest in pre-sale BFSI conversion: the logos, success fees and head-to-head wins. It reaches promotional calling through number rotation rather than the 140/1600 series. Neutral post-sale service calls on the intermediary's own 1600 number, with compliance by construction, stay uncontested by SquadStack. That supports beachhead-v2 over a head-on pre-sale BFSI entry.
2. Parity floor. Enterprise must-haves seen on SquadStack's surface:
   - lead ingestion API and webhooks;
   - CSV import with a failed-rows file;
   - DNC blacklist and DND scrub;
   - calling-window enforcement;
   - outcome and judgement mapping;
   - recordings and transcripts with PII masking;
   - CSV export and scheduled reports;
   - knowledge base / RAG;
   - latency observability;
   - multilingual support;
   - Exotel, Ozonetel or Plivo routing;
   - prompt versions.
   Performance features: lead prioritisation, A/B testing, memory. Delighters: vision context and the in-app SDK.
3. Where VP can be measurably better:
   - minutes to the first live call;
   - a technical failure reason for each call, kept longer than 10 days;
   - real-time AMD;
   - 1600/140 routing, consent capture and a fixed AI disclosure (test whether the disclosure costs hang-ups);
   - published pricing with no setup fee.
   Risk: SquadStack is building self-serve, through the AI platform and Osno, so this window may close.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- The 'owned, not orchestrated' claim is contradicted by SquadStack's own public code. Orchestration is Pipecat with Daily WebRTC (in-app SDK: @pipecat-ai/client-js 1.13.1, daily-transport 1.6.9). TTS options are ElevenLabs (the default, on its India-residency endpoint), Cartesia and Sarvam. STT options are sarvam, cartesia, squadstack_ws and arc_stt. Post-call extraction runs on OpenRouter Gemini 2.5 Flash. Subprocessors are Exotel, Ozonetel, Plivo (USA), OpenAI (USA) and Google Gemini. Only the ASR (Arth) is plausibly in-house. (O: SQS-21..SQS-25)
- SquadStack is building self-serve in VP's lane. An unlinked builder runs at ai-platform.squadstack.ai ('Build, deploy, and optimize personalized AI voice agents in minutes', Google sign-in). Osno AI (app.osno.ai) shares its Firebase project and is special-cased in its code. Three platform PM roles specify self-serve onboarding, APIs and SDKs. A Plug-N-Play SME flow with wallet top-ups already exists in the portal. (O/I: SQS-04, SQS-06, SQS-45, SQS-68)
- The public API is lead ingestion only: a 2024 Postman collection with per-campaign endpoints, basic auth, 100 requests/min, mandatory IP whitelisting, and disposition webhooks out. SquadStack creates the campaign. There are no developer docs, no changelog and no public status page. The portal's 61-route build manifest and the AI-platform agent object (temperature 0.5, max_tokens 100, max session 240 s, idle 10 s x 3, summarisation after 5 turns) give a concrete parity reference. (O: SQS-03, SQS-12..SQS-18)
- Voicemail is detected after the call from transcript keywords; no AMD setting is visible. Transfer exists only as a managed hand-off to its human advisors. A failed call shows an outcome label, with search limited to 10 days; STT/LLM/TTS failures appear only as aggregate counts. Each gap is a task where VP can be measurably better. (O/I: SQS-10, SQS-11, SQS-18)
- India plumbing. The DNC blacklist, DND-scrub marks and DLT Sender ID/Entity ID fields are real. There are zero mentions of 140, 160 or 1600-series numbers, and the marketing sells 'spam number rotation'. The Terms make the buyer warrant consent to record and to train on voice data. The privacy policy is a legacy gig-worker notice with no DPDP notice for the people called. OpenAI and Plivo are US subprocessors despite 'all data within India'. (O/I: SQS-47..SQS-52)
- Pricing. No public rate. The INR 2-5/min homepage FAQ is unchanged, which confirms the 10-17 correction. There is a setup fee per use case, while its SEO page says $0. Pilot terms still conflict: a 90-day commitment against '3-8 weeks'. Plug-N-Play charges 50% of the first month as a setup fee. Revenue-linked BFSI pricing started 2026-09-14. The ROI calculator is three hard-coded multipliers. (O/V: SQS-34..SQS-39)
- COGS inference (cogs.csv). With ElevenLabs Multilingual v2 at PAYG, the bundle default, COGS is about INR 3.6 per connected minute: a loss at INR 2 and roughly break-even at 3.5. With Cartesia it is 2.2, with Sarvam TTS 1.6, with self-hosted TTS 1.1. The INR 2 floor needs SquadStack's own or Sarvam TTS. Volume cross-check: Arth's '1 crore min in 2 months' implies '50 lakh calls/day' counts dial attempts, and INR 15-37 Cr/yr of AI revenue, consistent with FY24 INR 26.5 Cr. (I: SQS-41, SQS-42)
- There is no public buyer-side complaint corpus: Capterra has 0 reviews and G2/Trustpilot returned 403. The public failure record is supply-side. The partner app (15,007 ratings, 3.85 stars) shows payouts stuck for months, no work for 6 months, a stated hiring pause and templated replies. The managed human fallback rests on a shrinking gig pool. (O/I: SQS-55..SQS-57)
- SquadStack's naturalness KPI and its 'Turing test' reward being mistaken for a human, and its AI disclosure is 'configurable'. VP's never-deny rule is a differentiator only if disclosure does not raise hang-ups, so this must be measured in the listener panel and pilot. (V/O: SQS-46, SQS-58, SQS-59)
- Its Terms bar 'competitive purposes', 'automated means' on the Platform (including the website) and misrepresenting affiliation. No SquadStack or Osno account should be created for the teardown without written consent; buyer interviews are the fallback. (O: SQS-67)
- REA failed on SquadStack. 'inspect' on the Playwright HAR returned 'unsupported binary format'; 'analyze-web-bundle' over CDP produced no output before the 280 s timeout; 'rea doctor' reports healthy:false. Fallback was the Next.js _buildManifest route map plus direct download of the public chunks, and HAR body extraction. (O: SQS-33)

### Pre-registered predictions for the account phase

- SQS-P01 (0.85): via the sales path, first live call to our phone takes 10 or more business days.
- SQS-P02 (0.70): a fresh team@vyakti.ai sign-up on ai-platform.squadstack.ai or app.osno.ai does not reach a live PSTN call within 60 min (access-denied, approval, onboarding or a sales-provisioned number).
- SQS-P03 (0.80): if an AI-platform account works, the agent editor shows the bundle's fields: STT sarvam/cartesia/squadstack_ws/arc_stt with fallback routing, TTS ElevenLabs (default)/Cartesia/Sarvam, temperature 0.5, max_tokens 100, 240 s session, idle 10 s x 3.
- SQS-P04 (0.70): messy 50-row CSV succeeds with errors. +91, spaces and 11-digit numbers go to the failed-imports file; duplicate lead_ids are rejected; Devanagari names import; the opt-out row is dialled unless separately blacklisted.
- SQS-P05 (0.65): there is no per-campaign calling-window field; one 9:30-20:30 window applies and a 20:45 IST test schedule is refused or deferred.
- SQS-P06 (0.70): there is no real-time AMD. On voicemail the agent speaks for 10 s or more on at least half the hits; 'Voicemail' is labelled only after the call.
- SQS-P07 (0.60): self-serve has no configurable transfer to an arbitrary PSTN number; transfer is a managed human hand-off only.
- SQS-P08 (0.75): a failed call is found by outcome filter within 10 days, but its reason is an outcome label, not a technical cause.
- SQS-P09 (0.70): CSV export with outcome and recording URL takes under 3 min.
- SQS-P10 (0.75): the median handset reply gap on Indian PSTN (our battery, n of 30 or more turns) is 1.0-1.6 s, not the claimed 0.8 s or less.
- SQS-P11 (0.80): with a Hinglish caller the agent holds Hindi/Hinglish on at least 90% of turns.
- SQS-P12 (0.50): asked 'are you a bot?' 3 times, a default-configured agent deflects or claims to be human at least once.
- SQS-P13 (0.65): a written quote comes in at INR 2.5-5 per live minute plus a setup fee per use case (or base plus success fee) with a 90-day minimum.
- SQS-P14 (0.70): calls reach our handset from rotated 10-digit numbers, not the 140 or 1600 series.

### Needs a trial account to learn

- Boundary first. SquadStack's Terms prohibit 'competitive purposes', 'automated means ... bots or scrapers' on the Platform (which includes the website) and misrepresenting affiliation. Instinct must not create a SquadStack or Osno account under a pretext or a non-VP identity. An evaluation account needs SquadStack's written consent; otherwise this vendor's account phase runs through buyer interviews.
- Whether self-serve sign-up at ai-platform.squadstack.ai or app.osno.ai is open to an unknown business, and the minutes and clicks to a first PSTN call.
- The number series and caller ID seen on our handset (140, 1600 or rotated 10-digit), and whether the buyer can choose it.
- Calling-window controls per campaign; consent capture fields; the default AI-disclosure behaviour and whether it is configurable per agent.
- Real-time AMD or voicemail handling, and transfer to an arbitrary number (warm or cold).
- What a failed call shows the customer (outcome label or technical cause), and for how long.
- Export contents (outcome, recording URL, transcript, entities), and webhook payloads for our test campaign.
- Handset-side reply gap, cut-ins and language hold on Indian PSTN using the l4b battery, recorded in stereo.
- The real per-minute rate, setup fee, minimum commitment and the success-fee structure for one Hindi-English renewal or lead-qualification use case.
- Retention and purge controls (the trust centre mentions a delete API and a contract TTL), and where LLM processing actually happens for Indian campaigns (OpenAI and Plivo are US subprocessors).
- Depth, quality and latency of the human-advisor hand-off, given the shrinking gig pool.
- Gated public items, if pursued legitimately: the Hugging Face ASR benchmark (login plus terms) and the trust-centre documents (SOC 2 report, data-flow diagram, RBI/SEBI audits; request access).

### Run facts

- Claims: 69 {"observed": 45, "inferred": 11, "vendor_claimed": 12, "unknown": 1}
- REA used: True
- REA notes: REA (rea-agents@latest, rea 6.7.0) ran but produced no usable evidence. (1) 'npx -y rea-agents@latest inspect data/teardown/squadstack/har/ai-platform.har --format json' returned {code: target_unavailable, message: 'Cannot open artifact: unsupported binary format', constraint: file_format_rejected} on a Playwright 1.56 HAR with embedded content. (2) 'analyze-web-bundle http://127.0.0.1:9334 <targetId> --observation-ms 6000 --fetch-source-maps --format json' against headless Chromium 141 over CDP, on https://ai-platform.squadstack.ai/auth, printed nothing to stdout or stderr and was killed by the 280 s timeout. This matches the synthflow lane's timeout. (3) 'rea doctor' reports healthy:false: Hopper, Ghidra, IDA, jadx and kuna engines are missing; node 22.22.0 is OK. Fallbacks that worked: Playwright HAR plus request logs for the portal login, the AI-platform auth page, the homepage and the Vanta trust centre (including its GraphQL responses); the Next.js _buildManifest.js giving a 61-route map and 98 public chunks downloaded directly; JS bodies extracted from the HAR; string and endpoint extraction with python3 -I. No APK was analysed: the only Android app is the gig-worker app com.squad.run, and downloading it needs Google credentials. Status is recorded in data/teardown/squadstack/rea/rea-status.json and rea-doctor.json.

---

## Verification (adversarial verifier, 2026-10-20)

Scope: I re-checked 36 claims. These were every observed or inferred claim on architecture, pricing, India plumbing or v2 (29), plus 7 surface or account-phase claims that feed inbox nodes (SQS-04, 10, 11, 16, 18, 68, 69). For each I re-opened the cited file or URL and re-ran string extraction with python3 -I; no downloaded code was run. I also made fresh public captures, with no login and no form, stored under data/teardown/squadstack/verify-*/ and listed in manifest.csv:
- the app.osno.ai build (28 chunks);
- the ai-platform route shells /ai-agents/new, /observability and /call-details (the server sends them before the client-side auth redirect), plus 20 chunks the lane had not captured, including the 518 KB agent-editor page chunk;
- redirect headers for 4 URLs;
- the GitHub org and lens-mcp pages, via WebFetch.

The full log, with before and after text, is verification.json. claims.json carries a `verification` object on every re-checked claim. verify.md was not written because of the harness rule against report .md files; verification.json replaces it.

Result:
- 19 confirmed, 9 corrected in wording, 5 refuted in part, 2 downgraded, 1 upgraded, 7 claims added.
- Grades before: 45 observed, 11 inferred, 12 vendor-claimed, 1 unknown (69 claims).
- Grades after: 50 observed, 14 inferred, 12 vendor-claimed, 0 unknown (76 claims).

### Refuted in part (corrected in claims.json)
- **SQS-21, the TTS default and the STT list.** `h=["eleven_multilingual_v2"]` is a hide-list: the editor hides that model unless an agent already uses it. It is not the default. The TTS module's default-model constant is `eleven_flash_v2_5`. The array [sarvam, cartesia, squadstack_ws, arc_stt] is not an enumeration of STT providers. It is an internal-only filter, applied in both the TTS and STT pickers to users without `view_internal_voice_options`. arc_stt is an STT router: only its params carry fallback / best-latency / load-balance, fallback_chain, strict and weights. Provider option lists come from the server.
- **SQS-33, REA.** analyze-web-bundle did produce output. rea-ai-platform-web-bundle.json was written at 18:32:51Z, 28 s after the 280 s timeout fired, by the orphaned child process. It is complete: 34 scripts parsed, 0 failures. Its evidence value is near zero: framework fingerprints, 1 route, 1 endpoint, and source maps "not_requested" despite --fetch-source-maps.
- **SQS-41, the COGS headline.** The arithmetic reproduces on all 15 rows. The frame does not: Multilingual v2 is hidden legacy, not "the bundle default". On ElevenLabs Flash v2.5, COGS is INR 1.95-3.58 (mid 2.30-2.71). That is a 15-36% loss at INR 2 and a 23-34% margin at INR 3.5, not break-even. The in-call LLM line is a proxy: the editor names OpenAI, SimpliSmart, AWS Bedrock and OpenRouter as providers, so that line is unverified.
- **SQS-49, the calling window.** Two layout chunks show a daily calling pause from 23:00 to 09:00: static_chunks_app_layout-d48c9dd2f46b1a7e.js, which the lane had downloaded, and the Osno layout. The window in code is therefore 09:00-23:00. That is wider than the marketed 9:30-20:30 and than the 10:00-21:00 default promotional band. Server enforcement was not observed.
- **SQS-10, transfer.** The editor's call-closing scenarios trigger `transfer_call()`, and there is a "Live Seller Transfer" custom-scenario placeholder. So an agent-level transfer tool exists; its destination is not visible. The 301 on the old page was re-confirmed.

### Downgraded (observed to inferred)
- **SQS-23.** The SDK facts are observed. That the server is Pipecat is inferred from the client protocol; no server-side artifact was seen.
- **SQS-27.** The GitHub listing has no saved copy; I re-read it with WebFetch: 82 repos, including django-*, DRF, celery-beat, pghero, terraform-aws-* and label-studio copies. The portal uses `csrftoken` / `x-csrftoken`. Together these support a Django backend but do not prove it.

### Upgraded
- **SQS-69, unknown to inferred.** Both builds ship `ENABLE_EMAIL_DOMAIN_RESTRICTION: true`. Sign-in passes only for squadstack.ai/.com addresses or allowlisted emails. Everyone else gets "Sign in is temporarily disabled for external users." Osno also needs a provisioned user with an expiry date. The gate is client-side, so the claim stays inferred.

### Corrected in wording (substance holds)
- **SQS-22:** the extraction model is the editor's default, not what production is known to run.
- **SQS-24:** removed the unverified "Ozonetel serializer" claim. Plivo's trust-centre purpose is "to build Human-like Voice AI Agents".
- **SQS-32:** "owned at most for ASR" overreached. An LLM hosted on SimpliSmart or Bedrock is possible; no in-house TTS constant was found.
- **SQS-40:** added SquadStack's own Osno price ($0.04-0.08/min advertised).
- **SQS-42:** added a ramp caveat. The "dial attempts" conclusion survives a 5x error.
- **SQS-47:** the 10-digit rule applies to the DNC paste field. Lead-import validation was not seen.
- **SQS-52:** "LLM calls route via OpenRouter" generalised from one default. Also, the trust centre says OpenAI and Gemini data is "stored exclusively in India".
- **SQS-65:** the editor does have intra-call memory (state management with stages and memory_keys; "In-Call Memory"). There is no cross-call memory or Lift screen.
- **SQS-68:** Osno is a second brand on the same code, and it is gated, not self-serve.

### Confirmed
SQS-04, 11 (strengthened: 0 AMD or voicemail matches in the editor chunk), 16, 18, 25, 26, 28, 29, 30, 34, 35, 37, 38, 39, 48, 50, 51, 54, 63.

### Added (observed)
- **SQS-70:** the allowlisted sign-in on both builds.
- **SQS-71:** the 23:00-09:00 calling-pause notice.
- **SQS-72:** call-closing tools: transfer_call, send_link, hangup_call, dnd_request, schedule_callback. The editor also has test call and chat, and inbound-number generation.
- **SQS-73:** in-call LLM providers OpenAI, SimpliSmart, AWS Bedrock and OpenRouter. Summariser gpt-4o-mini by default; RAG on Gemini or SquadStack/Qdrant.
- **SQS-74:** memory in code is intra-call only.
- **SQS-75:** docs.squadstack.com 301-redirects to apidocs.squadstack.com.
- **SQS-76:** Plug-N-Play, the only wallet flow, sells human tele-callers, not AI agents.

### Text above that is now wrong
- **HEADLINE:** read the TTS default, the STT list, "Orchestration is Pipecat" (inferred server-side) and "The backend is Django" (inferred) per the corrections above.
- **Section 1:** "Plug-N-Play, a self-serve flow" sells human tele-callers. "Osno ... self-serve brand" is gated. "Transfer exists only as a managed hand-off" is refuted in part.
- **Section 3:** "REA failed on both paths" is wrong: the CDP path finished late with near-empty output.
- **Section 4:** the COGS table's first row label is wrong: Multilingual v2 is not the default. Add a Flash v2.5 row: INR 1.95-3.58, mid margin -15% to -36% at INR 2 and 23% to 34% at INR 3.5.
- **Section 6:** "10-digit number validation" applies to the DNC field. Add the 23:00-09:00 pause and the in-call `dnd_request()`.
- **Section 8:** "No memory screen" should read "intra-call memory exists; no cross-call memory".
- **Decision 3:** add that SquadStack's builders are closed today, and that transfer belongs on the parity floor, not on VP's edge list.

### Predictions
All 14 are falsifiable. I left the pre-registered text unchanged.
- P03, P05 and P07 rest on premises corrected above:
  - P03: field list;
  - P05: 9:30-20:30, whereas code shows 09:00-23:00, so as written P05 will probably score false;
  - P07: a transfer tool exists, so p=0.6 is too high.
- P02's premise is now observed, so p of about 0.95. It also cannot be run without breaching the Terms; score it from the bundle.
- P12 (p=0.5, weak basis) and P13 (a three-way OR) carry little information. Tighten P13 to one price structure before scoring.
- P10's basis cites "Gemini Flash TTFT", but the in-call LLM was not observed.

### Effect on the three decisions
- **Pre-sale vs post-sale:** the compliance wedge is stronger. SquadStack has no 140/1600, and its window leaves 21:00-23:00 and 09:00-10:00 open for promotional calls. But SquadStack does capture in-call DND.
- **Parity floor:** add an agent transfer tool, call-closing triggers, in-call DND, callback scheduling, multi-stage state, STT fallback routing, LLM hot-swap and fallback, and test call/chat with inbound test numbers.
- **Where VP wins:** "minutes to first live call" and "real-time AMD" are stronger. Drop "transfer". On Flash TTS, SquadStack can price at INR 3.5 with a healthy margin, so VP's case cannot rest on SquadStack being underwater at INR 2-3.5.

### Hygiene
- The Osno chunk hard-codes 15 external email addresses. They stay in the gitignored raw file only and are not reproduced anywhere.
- The Lens key was not reproduced or used.
- Terms are not the constraint: the owner overrode vendor terms (directive.2026-10-20.terms-override). The kept line that matters is "no bypassing authentication" (decision.2026-10-20.teardown-lines). The sign-in allowlist (SQS-70) is therefore a hard stop: a team@vyakti.ai account will not get in unless SquadStack provisions access under VP's real identity. Leave SquadStack and Osno off the Instinct account-setup list unless the owner approves a sales/demo request. SQS-67 and the account-phase open question were annotated to match.
