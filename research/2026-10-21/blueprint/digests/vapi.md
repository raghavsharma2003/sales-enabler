# Vapi dossier (consolidated 2026-10-21)

**Grades:** M measured by us (n, method) | O observed (capture, our API read-back, code) | VC vendor-claimed or vendor-displayed | I inferred | U unknown. Ids: `VAP-nn` = research/2026-10-20/teardown/vapi/claims.json (public pass, 63 claims, 49 re-checked by adversarial verifier, 4 downgraded, 2 refuted in part); `AP-nn` = research/2026-10-20/account-phase/vapi/claims.json (our key, ~87 authorised requests, 61 claims); `wt-vapi-nn` = research/2026-10-21/walkthroughs/vapi/claims.json (Instinct's dashboard walk, 60 claims; no call, no number, no spend).

**Read for this dossier:** teardown/vapi/{report.md, verify.md, claims.json, pricing.json, predictions.json, bundle-findings.json}; account-phase/vapi/{report.md, claims.json}; walkthroughs/vapi/{report.md, claims.json, defaults.json}; 2026-10-17 l4a-competitors/{report.md, complaints.csv, pricing-history.json}; l4b-measured/report.md; r2-untouched-raw/findings.md (no Vapi content: its VoC is Indian vendors only, so Vapi VoC comes from l4a, which also carries r1 data); vendor sections of the teardown, account-phase and walkthrough SYNTHESIS files and teardown/predictions.md; DIRECTION.md. **Not available:** any call placed on a Vapi stack with our spec, any invoice, the screenshots (Drive and gitignored data/walkthroughs/vapi; the 12 PNGs the walkthrough analyst opened are cited by filename), support.vapi.ai, G2, Reddit (403/429, not bypassed).

## 1. What it is, who buys it, how it makes money

- **A developer infrastructure layer for voice agents**, not an operator product. Configuration store plus call runtime plus event bus (AP report s1). The buyer brings telephony, contacts, consent, retries, windows and business outcomes; the docs say so in words: "The organization running the campaigns owns the approved contacts, the recurring schedule, the daily attempt budgets, the retry rules" (VAP-47, O).
- **Buyers (I):** developers, startups and US enterprises. The Org.channel enum has dedicated clusters `intuit` and `hcs` (VAP-15 O, VAP-16 I). Job posts: 8 open, all San Francisco, a 5-person infra team, a 4-person trust-and-safety team, no India role (VAP-27 VC). India is usage, not a market: one +91 number in a docs example, 3 "Indian American" voices (VAP-50 O).
- **Money (O/VC):** USD 0.05/min hosting, unchanged since 2024-06, 28 months (VAP-33 O; l4a pricing-history.json). Models, transcribers and voices "pass-through at cost" (VC). Tier fees: Usage-only USD 0 (4 lines, 14-day retention, no SLA); Core USD 29/mo (10 lines); Pro max(USD 999, 10% of hosting) (30 lines, RBAC, 99% SLA); Premier custom; extra line USD 10/mo, extra org USD 20/mo, HIPAA USD 2,000/mo (pricing.json; wt-vapi-46). Older bundled plans still sit in dashboard code (VAP-34 O).
- **Scale and funding (secondary press, medium):** Series B USD 50M led by Peak XV, May 2026, about USD 500M valuation reported, "1B calls" (l4a report, TechCrunch 2026-05-12). Rated 2.5/5 on 16 Trustpilot reviews (VAP-51 O).

## 2. Product model and architecture

**Core objects (AP report s"Data model", O).** Org (dashboard session only) owns tokens, credentials, phone numbers (5 types: byo-phone-number, twilio, vonage, vapi, telnyx; no Indian carrier type, AP-53), assistants (immutable versions v1..vn with configHash and parentVersion; separate sparse drafts), squads (ordered members plus transfer or handoff destinations), tools (26 types, versioned), knowledge bases, structured outputs, scorecards, simulations, evals, insights and boards, campaigns (v1 and v2), sessions and chats. **There is no contact or customer resource:** the customer is an inline DTO on every call, campaign row and session (AP-12, VAP-02, O). 1,018 schemas hold no consent, DND, DLT, window or retry object (AP-58, O).

**Call lifecycle (AP-23, O).** POST /call, campaign dispatch, inbound ring or web call; start checks (assistant, number, customer, subscription, credits, fraud, concurrency; each failure is a `call.start.error-*` reason); scheduled, queued, ringing, in-progress, forwarding, ended. endedReason has 638 values: 300 in-progress errors, 270 pipeline errors per provider, 20 start errors, 39 plain (customer-busy, voicemail, silence-timed-out...). All are engineering codes; none is a business outcome (VAP-13, AP-24, O). A blocking `campaign.predial` webhook can veto each dial; errors or timeouts mean no call (AP-27, O).

**Voice stack.**
- Orchestration is Vapi's own streaming pipeline (VC, VAP-24): a 4-state VAD in a separate process (about 200 ms to start, about 800 ms silence to stop), an end-of-turn model that predicts and cancels LLM calls, latency-routed Azure OpenAI deployments, fallback OpenAI to Azure to Bedrock (VAP-26 VC). No Pipecat or LiveKit Agents code visible (VAP-25 I); LiveKit is an English-only end-of-turn option.
- Media (O, our HAR): browser calls on Daily WebRTC, a mediasoup SFU on Oracle Kubernetes in US-Ashburn, Cloudflare and Twilio TURN (VAP-18/19). Orchestration websocket in AWS us-west-2 (VAP-20). Own SIP SBCs on AWS us-west-2 and eu-central-1 (VAP-22). Regions: US default, EU on Premier only, Australia; **no India region** (VAP-48).
- Edge: Express behind Cloudflare, Fern-generated SDKs, dashboard a 561-file Vite SPA with no source maps (VAP-21/28/17). Neon primary DB with Aurora fallback (VC); the 2026-05-21 outage looks like Neon (VAP-55 I).
- Catalogue, not a stack: assistants choose from 14 transcriber, 17 LLM, 20 voice variants (AP-40/41/50 O); no Indian speech vendor (Sarvam, AI4Bharat, Bhashini, Gnani: zero mentions in 1,018 schemas, AP-45 O). Vapi also sells a white-label model, transcriber and voice (AP-42). GPT-Live (beta): OpenAI full-duplex speaker plus a separate reasoner (VAP-63).

**What the stored config really does (account phase).**
- A name-only assistant stores no model, voice or turn-taking field; runtime defaults are not materialised, so the record does not show what will run (AP-18 O).
- Every PATCH on the API publishes an immutable version; drafts are separate records; two drafts coexisted (AP-19/20 O). The dashboard instead uses Draft then explicit Publish (wt-vapi-10; walkthrough "Contradictions"). Two semantics for one object.
- Traffic splits are an append-only ledger with actor type and key id, system rows written at each publish, rows survive assistant deletion, no delete route (AP-21 O).
- The live API is stricter than the spec: Deepgram nova-3 rejected `hi-Latn` although the enum lists it (AP-44 O). A failed POST /call still returns the live capacity block `concurrencyLimit 4, remaining 3` (AP-25 O).
- The web SDK ships a 61k-line REST client with 137 paths (246 operations), 68 more than the 74-path public OpenAPI; our key worked on those read routes (AP-06/07 O). Dashboard code holds about 142 paths (VAP-12). Composer (the chat builder) has no REST surface; the MCP server covers 4 resource families (AP-10/60 O).
- Webhooks: 29 server-message types, each can carry the full assistant config and the full call; 8 response schemas change the call; default delivery has no retry; HMAC, OAuth2, bearer, AWS auth available (AP-28 to AP-31 O).

## 3. Builder and UX end to end

**Path (wt-vapi-05/07/08, O):** password plus emailed 6-digit code, Welcome form (1 required field, reappears until saved), /agent-builder (pick Inbound/Outbound/Support or type a description), dashboard with a seeded assistant "Riley" (US clinic scheduler). 3 steps and 1 required field to a testable agent; time unmeasured (VAP-P01 plausible, unscored).

**Best moments (wt report s13; files in data/walkthroughs/vapi/):**
- Every picker row shows latency, USD/min and one quality score (WER, Intelligence, Humanness): `51-voice-model-dropdown.png`, `33-riley-assistant.png`.
- Cost and latency headline bars coloured per stage, tied to the card dots; four one-click presets (Balanced, High Intelligence, Ultra Fast, Cost Saver): `33-riley-assistant.png`.
- Describe-or-pick creation on one screen: `02-agent-builder-landing.png`. A Composer entry (Build/Debug/Analyze/Test, "Ask for approval") in every header: `03-assistants.png`.
- Section cards with one-line purpose and gated features shown in place: `34-builder-Advanced.png`. Empty states that teach (`04-squads.png`, `40-evals.png`). Free default monitors offered up front (`72-mon-monitors.png`). Spam-flagging advice where the number is chosen (`83-campaign-create.png`).

**Worst moments:**
- **State integrity broken (O):** a Create Tool click created and published `transfer_call_tool` at once (wt-vapi-31, `57-transfer-call-tool-form.png`); a dropdown pick autosaved a server draft and the header kept saying Draft after Discard (wt-vapi-55, `80-transcriber-languages.png`).
- **Silent dead ends:** Campaign "Next" disabled with no reason (`83-campaign-create.png`; wt-vapi-44), so steps 2-3 of the campaign wizard were never seen. Enterprise crown card for Recording Consent with no action (wt-vapi-52).
- **Trust gaps:** headline numbers are component sums: 1,530 ms = 410 + 690 + 430 and USD 0.09 = 0.05 + 0.004 + 0.02 + 0.02, leaving out the 1.5 s wait, the phone leg and telephony (wt-vapi-12/13 I). Scores have no scale (wt-vapi-17). ZDR described inconsistently (wt-vapi-49).
- **Clunk:** banner X overlaps text, OBSERVE group clipped, duplicate create CTAs, Speed field clips its digit (`03`, `33`, `04/05`, `50-edit-Voice.png`). Nine captures (20-28) show the Welcome wall instead of the named page; guessed URLs 404 (wt-vapi-01/02).
- **Settings depth:** the Advanced tab exposes Start and Stop Speaking Plans, idle messages, silence timeout 5-3,600 s, max duration 10-43,200 s, keypad input, voicemail provider, but **no phrase lists**; Hindi "haan/achha/ruko" cannot be set from the dashboard (I, wt report s5).

## 4. Conversation quality and voice

| Finding | Value | Grade |
|---|---|---|
| Clean-turn reply gap, homepage demo agent, US-East vantage via proxy | p50 2.32 s (90% CI 2.12-2.50), p90 3.82, p95 4.24; n=40 turns (Ultravox 1.54 s n=52; ElevenLabs 3.75 s n=63) | M, 2026-10-17, l4b report; demo agent not our spec |
| Collisions (agent talks over caller) | 25 of 72 caller turns (35%); Ultravox 18%, ElevenLabs 3% | M |
| Barge-in handled | 2 of 8 (stop 1.1-5.0 s); Ultravox 6/6 | M |
| Cut-in during elderly caller's 1.6 s pause | 2 of 2 calls (5 of 6 across vendors) | M |
| Reply language to Hinglish caller (auto-detect on) | Gujarati on 17 of 18 turns; elderly Hindi caller answered in Punjabi-inflected Hindi on 2 of 2 calls | M (machine ID plus manual reading), may be a configuration artefact |
| AI disclosure when asked | 1 clear, 3 hedged, 4 talked over | M |
| Dashboard-displayed latency vs reality | "575-1000 ms" shown, "3-4 s, sometimes 6-7 s" live; "4x of the estimated" (forum, via search snippets) | O (snippets) |
| Displayed LLM latency vs our India first-token medians | gpt-oss 500 vs 535 ms, GPT-4.1 Mini 600 vs 567, GPT-5.4 Mini 720 vs 960, Gemini 3.8 Flash 1,500 vs 1,991, GPT-4.1 690 vs 1,765 (n=5-6) | I (wt-vapi-19): displayed = US best case |
| Defaults | End-of-Turn Wait 1.5 s (0-3), Intelligent Turn-Taking Off, API startSpeaking waitSeconds 0.4, onNoPunctuation 1.5 s, stopSpeaking numWords/voiceSeconds/backoff; 22 English acknowledgement and 20 English interruption phrases | O/I (AP-46/47, wt-vapi-27) |
| Expressiveness | Voice v2 shows USD 0.02, 430 ms, Humanness 92; Eleven v3 (Experimental) 850 ms, 95; Inworld, Cartesia, Sonic options. Pronunciation dictionaries shipped 2026-06-01. No expressive or relational feature (emotionRecognitionEnabled exists, default false) | VC/O |
| Hindi voices | 12 stock voices in the library grid, 2 "Indian American" (22 and 3 in the API read: unreconciled) | O |

Not measured on any Vapi stack of ours: Hinglish with explicit hi-IN, the reply gap on an Indian line, voicemail on Indian network announcements, +91 transfer, DTMF. All open (wt-vapi-60). **The Hinglish turn-taking beat is still a hypothesis**: VP's own lab stacks show 15-42% cut-ins (risk.2026-10-20.acct-synthesis-turn-taking-beat-unproven).

## 5. Campaigns, telephony and India readiness

- **Campaign engine (O):** up to 10,000 inline customers; CSV at most 5 MB, lowercase `number` header required, other columns become variables; maxConcurrency up to 500 inside the plan limit; one absolute window per campaign (earliestAt, latestAt; dashboard: at most 7 days ahead, 15-minute steps, one time zone); no recurring daily window, no per-contact timezone, no retry policy (the only retry is waiting up to 1 hour for a free line); contacts not dispatched by latestAt are dropped; no draft, read-only after launch; Campaigns UI shipped 2026-08-31 and is labelled Beta (VAP-03/04/46, wt-vapi-42).
- **CSV hygiene (O, client-side code only):** the normaliser strips punctuation and prepends "+", so a 10-digit mobile `98xxxxxxxx` becomes `+98...` (Iran) and `0xxxxxxxxxx` becomes `+0...`; one empty number rejects the whole file; no dedupe; no opt-out column (VAP-49). Server behaviour is **U**: `numberE164CheckEnabled` defaults true, so the API may reject rather than dial.
- **Reliability of campaigns:** in the 4 h 07 min US outage of 2026-05-21, campaign calls "did not run and were not retried automatically" (VAP-54 O, Vapi's own RCA).
- **Telephony and India (O/I):** Vapi's Plivo guide: Indian numbers cannot be used "due to TRAI regulations ... SIP termination to occur via an Indian server, which Vapi does not currently support" (VAP-42 O). Twilio allows outbound to India only from non-Indian numbers (VAP-43 I for the Vapi consequence, rescoped to native telephony). Result: no 140xx or 1600xx or declared Indian CLI, no DLT or A2P path on native telephony (VAP-44 I). Bridging an Indian CPaaS into the WebSocket transport is documented and a reseller claims +91 inbound works (VC, unverified). Free Vapi number: US area codes, inbound-only for new accounts, cannot launch campaigns (VAP-09, `06c-free-vapi-number.png`). No per-number price, no KYC walkthrough, USD only, no GST field (wt-vapi-41/45).
- **Compliance posture:** US-shaped (TCPA guide, recording-consent plans stay-on-line or verbal, HIPAA, PCI, ZDR, SOC2) (VAP-45 O). 0 hits for DND, NCPR, DLT in the 307-page docs index. 64 text captures show no consent, DND, DLT, window, retry or contact field (wt-vapi-43 O). Residency: US, EU (Premier), AUS; no selector in the dashboard (wt report s12).

## 6. Analytics, QA, memory and learning

- **Observability is the strongest layer (O):** Logs (Calls, Chat, Sessions, Webhooks, API tabs; filters; Export All; 25 rows/page; 14 days on the free plan); Boards ("Metrics Overview" with 6 widgets, Create Insight); legacy Metrics; Monitoring (Alpha: Issues with Critical/Warning, MTTR, Calls Impacted, categories Infrastructure/Technical/Effectiveness/Compliance; Monitors; Notifiers); `/analytics` over call and subscription tables, group by type, assistantId, endedReason, successEvaluation, status, **no group-by campaign or contact** (AP-37). Per-turn latency (model, voice, transcriber, endpointing, turn) in `performanceMetrics`, server-side clocks (AP-34). 8 typed USD cost lines per call (AP-35). "Great news! no active issues" shows with no monitors configured (wt-vapi-37).
- **QA stack (O):** structured outputs (ai or regex, JSON-schema, gating) feeding scorecards (metric comparators with points); simulations (a personality assistant x scenario with evaluations, latency expectations by turn/model/voice at mean/median/p95/max, tool mocks) grouped into suites; evals on mock conversations; config-as-code `path` fields for GitOps (AP-16/17/61). 51 of 143 public operations are QA-related (account SYNTHESIS XS-37). Empty and not exercised in the walkthrough.
- **Memory: none for voice (I, bounded).** No memory resource; CreateCallDTO has no session or previous-call field (AP-51, VAP-60). Continuity primitives only: `variableValues` (LiquidJS), per-customer overrides, the `assistant-request` webhook, chat Sessions (60 s to 30 d, default 24 h) and best-effort sticky version routing by caller number (VC).
- **Learning is a human-started loop (O):** monitors, issues, evals, simulations (return improvement text), manual percentage splits with no statistics (LRN-09). Composer can fix, test and publish once started, under "Bypass approvals" (VAP-61 corrected; so "Vapi cannot auto-improve" must **not** be claimed). Flag-gated and unannounced: Mission Control (live listen, live control "Ask agent to respond now"), Call Health scans, an "Improve the assistant" Composer kickoff (VAP-06 O, not visible in the dashboard nav, wt report s14). monitorPlan documents listen/control default ON (AP-49 VC).

## 7. Pricing, cost of goods and unit economics

| Item | Value | Grade |
|---|---|---|
| Hosting fee | USD 0.05/min = INR 4.75 at FX 95; flat 28 months | O |
| Twilio to Indian mobile | USD 0.0496/min = INR 4.71 | O |
| Floor before any AI (hosting + telephony) | INR 9.46/min | O (arithmetic) |
| All-in INR per Indian outbound minute (calculator components: Deepgram 0.0095-0.0099, OpenAI LLM 0.0077-0.0452, ElevenLabs voice 0.0146-0.0238) | USD 0.1314-0.1785 = INR 12.48-16.96; hosting share 28-38% | I (VAP-35; only Twilio route priced) |
| Dashboard builder headline | about USD 0.09/min, no telephony | O (wt-vapi-13) |
| Concurrency | 4 lines free; 30 lines = Core + 20 add-ons = USD 229/mo, or Pro USD 999 | O (VAP-37) |
| Vapi-side COGS and hosting margin | est. USD 0.001-0.005/min, margin 90-98% | **U** (downgraded in verification, VAP-36); an HN claim "60-70% of spend was the platform fee" is an interested competitor's (VC, VAP-53) |
| Real invoice per connected minute | not observed (no billable call) | U (AP-39; VAP-P10 predicts INR 12-18, unscored) |

Context: human telecaller median INR 8.86 per connected minute (l2, n=1,234 postings); Indian all-in list prices INR 3.5-7/min; VP target about INR 2/min (directive.2026-10-17.price-target). Vapi on Indian lines costs more than a human minute, so it loses Indian B2C on price. **Price is not the wedge** (rejected.2026-10-17.parity-undercut); do not argue from Vapi's margin.

## 8. What customers complain about, and why they churn

Sample is small and skewed to developers (VAP-59). l4a complaints.csv holds 15 Vapi rows (10 Trustpilot, 3 forum titles, 2 HN; 8 one-star, 2 two-star); multi-label codes: BILLING 6, LATENCY 4, RELIABILITY 4, ACCOUNT_UI 3, SUPPORT 2, DTMF 1, TELEPHONY 1. Trustpilot 2.5/5 on 16 (VAP-51).
- **Latency vs promise:** "the latency of the models is bad" (2026-03-25), "lags a lot" (2026-03-28); dashboard 575-1,000 ms vs 3-4 s live (VAP-52).
- **Billing:** "Hidden charges" (2025-12-09); HIPAA "$1000" (2026-04-01); the fixed USD 0.05 on top of pass-through; two clocks (platform and carrier) so the invoice is never one number.
- **Reliability vs 99.99% claim:** 33 incidents and 18 maintenances in 6 months; 4 h 07 min US outage 2026-05-21; about 2 h of US call failures 2026-08-19; 3 SIP incidents in October; one reviewer claims "$50k in damages" (VAP-41/54).
- **Support:** "expect to be waiting a week"; no SLA below Core (2 business days), 1-hour P0 only at Premier (VAP-56).
- **UI and state:** "Your draft agent doesn't hold the prompt"; "extensive GUI driven experience" (VAP-58); the click-to-publish and autosave hazards in section 3 are the same family.
- **Telephony and DTMF:** DTMF tones failing in testing; Indian numbers unsupported.
- **Churn reasons (I):** cost at scale, India unfit (international leg, CLI, no DLT), reliability, and support price-gating. 0 of the threads we could read is a churn survey.

## 9. Velocity and likely next moves

- **Cadence (O):** 25 weekly changelog entries with 82 items from 2026-04-13 to 2026-10-12 (about 3.3 a week); October 2025 to March 2026 published only as one retroactive summary (29 items); SDK gaps over the same winter (web 2.5.2 to 2.6.1: 2025-12-01 to 2026-07-07), then both jumped to 3.0.0 in October 2026 (VAP-38/39). Shipped: Monitoring GA 04-13, Deepgram Flux multilingual 04-27, Composer onboarding 05-18, pronunciation dictionaries 06-01, Azure region pinning for GPT-5 08-17, Workflows retired 08-18, Campaigns UI 08-31, simulation upgrades 08-10/09-07/09-14/10-12, eval run history 09-28, GPT-Live tools and keypad 10-12. **Nothing India-specific** (VAP-40).
- **Likely next moves (I, ours, not Vapi statements):** (1) Mission Control and Call Health leave their flags (VAP-06); (2) Composer's improve loop becomes a default, closing the manual loop (VAP-61); (3) GPT-Live and the full-duplex harness graduate from beta (VAP-63; flags enable-full-duplex-harness, enable-multi-harness); (4) campaigns mature: per-contact tracking exists, retries and recurring windows are the obvious gap; (5) enterprise: SSO, audit logs, auth migration to WorkOS (VAP-07/28); (6) a native India region or Indian carrier type is **unlikely near-term**: no India role, nothing shipped, a hard TRAI constraint (I).
- **Predictions (pre-registered 2026-10-20, all unscored, need calls or a number):** VAP-P01 browser test call within 10 min (0.75; dashboard path supports it); P02 no Indian ring without a second vendor and a +1 CLI, at least 45 min (0.85; walkthrough stopped at the same gate, `06c`); P05 3-day schedule needs 3 campaigns (0.85; consistent with VAP-46); P07 failure reason found in 5 min but only a code (0.7; consistent with wt-vapi-39 and `71-mon-issues`); P09 handset reply gap p50 2.4-3.4 s, p90 at least 4.0 s (0.65; l4b demo 2.32 s from US-East lends support); P10 invoice INR 12-18 (0.75; marginal on the costlier stack). Verifier advice: score P02, P03, P04 on the stricter rules in verify.md.
- **Competitive signal:** hosting fee flat for 28 months while Bolna fell 40% and Sarvam sits at INR 3-3.5; Vapi is not racing on price (l4a).

## 10. Adopt (detail in the adopt field)

Inline latency, cost and quality per picker row with presets; draft then publish with versions and a traffic split (but one publish path); typed per-component cost lines and a query endpoint; per-turn latency in the call record; the webhook envelope with call-changing replies (assistant-request, tool-calls, transfer, predial); structured outputs, scorecards, simulations with latency assertions; Monitoring issue model with severity, MTTR and a Compliance category; grouped tool catalogue; describe-or-pick creation; config-as-code; TS/Python SDKs and MCP; free default monitors; Composer-style entry in every header.

## 11. Beat (detail in the beat field)

1) Contact object with consent, DND and history, predial veto on by default. 2) Indian CLI and DLT path plus per-contact windows and retries. 3) Hinglish defaults: lexicons, language lock, Indic completeness. 4) All-in INR headline with measured India p50/p90. 5) Business-language outcomes beside raw codes. 6) One publish path, nothing saved by a click. 7) Cost per contact and campaign. 8) Chat-driven setup exposed as an API. 9) Slim, signed, replayable webhooks. 10) v2: per-customer memory and guarded self-learning.

## 12. Always learn: what to watch and how often

Baselines were captured 2026-10-20 in data/teardown/radar/_watchlist-baseline/ (listed in research/2026-10-20/teardown/radar/watchlist.json). Diff against them.

| Signal | URL or file | Cadence | Alarm if |
|---|---|---|---|
| Changelog | docs.vapi.ai/changelog | weekly (they post weekly) | anything India, contacts, retries, memory, Mission Control, Composer API |
| Docs index | docs.vapi.ai/llms.txt (86 KB baseline) | weekly diff | new pages for memory, contacts, DLT, India region |
| OpenAPI and SDKs | api.vapi.ai/api-json (74 paths, 1,018 schemas, sha256 in manifest); npm @vapi-ai/web, vapi-server-sdk | weekly | new paths (the web SDK shows 68 hidden ones), new phone-number provider types, a contact resource |
| Pricing | vapi.ai/pricing (JS-rendered; use browser capture) | weekly | hosting fee off USD 0.05, INR billing, India line |
| Status and incidents | status.vapi.ai feed.rss | daily | RCA posts, India or SIP changes |
| Dashboard bundle flags | 561 public JS chunks, org feature-flag names | every 2 weeks | Mission Control, Call Health, new-publish-flow flipping on |
| Walkthrough re-check | Instinct pass 2 (Advanced slider values, voices 12 vs 22, simulations 1 vs 2, ZDR wording, campaign steps 2-3) | once, then monthly | defaults change |
| Customers | Trustpilot, HN, support forum (blocked; use search snippets) | monthly | rating or theme shift |
| Hiring and funding | careers page, press | monthly | an India role or office |
| Our own calls | one stereo-recorded Hinglish battery on Vapi with our spec (open.2026-10-21 wt-synthesis-evidence-plan) | once, then quarterly | gap changes |

Also keep a standing rule: any reading of Vapi's strengths goes through the same eval we run on VP, because the only comparison that counts is a measured one.
