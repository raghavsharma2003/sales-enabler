# ElevenLabs Agents (ElevenAgents): consolidated dossier, 2026-10-21

**Paths.** T=research/2026-10-20/teardown/elevenlabs/ · A=research/2026-10-20/account-phase/elevenlabs/ · W=research/2026-10-21/walkthroughs/elevenlabs/ (screenshots `NN-name.png` cited from W/report.md) · TS/AS/WS=SYNTHESIS.md of each pass · TP=teardown/predictions.md · L4B=research/2026-10-17/lanes/l4b-measured/report.md · L4A=research/2026-10-17/lanes/l4a-competitors/report.md.
**Grades.** [m] measured by us · [o] observed (capture, API read-back) · [d] number displayed by the vendor product · [v] vendor-claimed · [i] inferred · [u] unknown.
**Evidence limits.** Three passes, $0 spend, no call placed, no number imported, no CSV uploaded (W §0). Live-behaviour data is only the 2026-10-17 homepage-demo battery (L4B): a demo forced to `language: "en"`, from US-East through a proxy (rejected.2026-10-17.ohio-latency: such numbers overstate latency 2-5x). Teardown verification re-checked 37 of 56 claims; EL-21 and EL-33 went to unknown, EL-23 part refuted (T/verify.md). Dashboards were empty free-tier workspaces.

## 1. What it is, who buys it, how it makes money
- **What.** Agent platform of the largest voice-AI vendor. It owns the speech stack (Scribe v2 Realtime ASR, Eleven v4 Turbo TTS, turn_v3 turn model, two first-party speech-to-speech "Realtime" models) and rents the LLM (111-value enum) [o] (T/report.md EL-13/14/15/23).
- **Scale.** Series D USD 500M at USD 11B (Feb 2026), ARR above USD 500M (Apr 2026): secondary-read company claims [v] (L4A line 142).
- **Who buys.** Developers and product teams self-serve (free 15 min); enterprises on Enterprise (DPA/SLA, HIPAA BAA, SSO, residency, private "enclave") [o] (W §11). India page cites Meesho, Cars24, TVS and forward-deployed engineers, no benchmark [v] EL-42.
- **Money.** USD 0.08 per call minute on every plan; plan price / included minutes = 0.08 on all six tiers, so tiers sell concurrency (4 to 40), seats and features, not a lower rate [i] (W §11, EL-29). LLM passed through, no telephony fee, burst USD 0.16. The platform pulls through its speech business; voice owners are paid per use [i] (A §5).

## 2. Product model and architecture
**Objects** [o] (A report §1; AS-EL claims): Agent {conversation_config, platform_settings (evaluation, data_collection, overrides, privacy, call_limits, queueing, alerting...), workflow graph, 65 permission strings} -> Branch -> immutable Version (every PATCH, even a no-op, commits one) -> MergeProposal -> Deployment (traffic % by branch). Workspace objects by id: Tool, KB doc, MCP server, Secret, Environment, Test, Tag, Triage ticket, PhoneNumber (import-only), BatchCall. 313 non-widget settings on one new agent [m] (measure.2026-10-20.acct-elevenlabs-config-surface-size). **No contact/lead object**: the person is a `user_id` string, which on the widget defaults to a FingerprintJS browser id [o] EL-10, EL-26.
**Lifecycle** (schema and docs, not observed live): initiated -> in-progress -> processing -> done|failed; call_result answered|voicemail|busy|no_answer|failed [o] (A §3). About 40 typed WebSocket events incl. contextual_update (mid-call context push), agent_response_correction, interrupted flag, resume token, vad_score, 26 error types [o] (A §4).
**Voice stack.** Browser voice is WebRTC to a self-hosted LiveKit on GCP (livekit-server 401, `via: 1.1 google`); text, Exotel and Twilio use WebSocket [o] EL-16..19. No geo-DNS: Jio, Airtel and Azure Central India resolvers all get the us-central1 SIP signalling IP; India-residency SIP is asia-south1 [o] EL-20. Where media is anchored, and the claimed ~200-250 ms per-turn India penalty, are **unknown** (EL-21). RAG embeddings are open-weight E5, not first-party (EL-23).
**What the stored config really does** (account phase):
- A new agent gets LLM deepseek-v41-flash (schema says gemini-2.5-flash), speculative_turn ON (schema OFF), bursting ON (2x price), a 180 s queue, and the American voice "Eric", accepted on a Hindi agent with no error [o] (evidence.2026-10-20.acct-elevenlabs-defaults-diverge-from-schema; dashboard confirms DeepSeek Flash 4.1, W 61).
- Unknown fields return 200, are dropped and still commit a version [o]; 3 of 4 writable vendors do this (AS XS-07/08).
- LLM deprecation fallback (warning 90 d, 25% of traffic rerouted from 60 d, complete at 20 d) can change the running model silently; a backup-LLM cascade is on by default [o] (risk.2026-10-20.acct-elevenlabs-silent-model-fallback).
- `hinglish_mode` boolean exists in the API (mixes English into Hindi, Malayalam, Telugu, Kannada replies), absent from 258 docs pages and every dashboard capture; effect unmeasured [o/u].
- Memory: `privacy.user_memory {enabled, scale minimal|balanced|maximum}` returned 403 "not available for this workspace"; a Memory (Alpha) tab now shows in the KB (W 7-knowledge-base) [o]. Key management and billing return 401 to an API key [o].

## 3. Builder and UX end to end
**IA** (02-after-login, 8-architect): Home/Architect/Triage; Configure; Monitor; Deploy; agent tabs Agent, Procedures, Workflow, Version Control, Analysis, Tools, Guardrails, Settings; Alpha on Architect, KB Memory, Alerting, 5 channels.
**First run.** Lands on a gallery of 45+ templates with flow preview; blank path is 4 clicks and 1 required field; result is a working agent with the prompt "You are a helpful assistant." and a first message with **no AI disclosure** (36-new-agent, 37-blank-step1, 38-agent-builder) [o]. A first phone call is unreachable from the dashboard alone.
**Best moments (match or beat)**
- LLM picker: grouped, searchable, latency range, $/min and $/msg on every row, "Detailed costs" footer (61-llm-list) [d].
- A 1-2 sentence description under every setting incl. billing impact; locks explained ("locked because Turn V3 requires Scribe v2 Realtime") (44-agent-settings).
- Template graph preview (02); docked test panel with mock tools (38, 9-preview); CSV contract shown before upload (33-batch-telephony-form); branches with Live badge and traffic split (8-branches); Architect go-live checklist "0 of 10 ready" (8-architect); analytics toolbar with honest `---` empties (7-analytics); red box "Any host will be able to connect" on an open allowlist (54-agent-security).
**Worst moments**
- Publish greyed without a reason (38); Submit disabled with the reason only in a placeholder and no link to import a number (33); Exotel import has 7 fields, no help for SID/token/Applet ID, Region defaults to Singapore under +91, empty Import looks enabled (34-phone-exotel-form).
- Red unlabelled alert on every orb (9-preview); 17 undescribed override toggles (54); Stability/Similarity sliders without numbers (63-voice-picker); LLM latency ranges up to 10x (844 ms-8.93 s) and a dashboard $/min 1.7-2.3x below its own API calculator, prompt size unstated (61) [d/i]; US-shaped templates (FDCPA, 401k, none for India) (02); "No results" on an empty history (16).

## 4. Conversation quality and voice
| What | Result | Grade |
|---|---|---|
| Clean-turn reply gap, demo, US-East via proxy | p50 3.75 s, n=63 (call-clustered 90% CI 3.47-4.04 s); per persona p50 3.71-4.62 s | [m] L4B; measure.2026-10-17.demo-agent-clean-turn-p50-ultravox-vapi-elevenlabs |
| Transcript / agent_response / first audio after caller stops | p50 2.65 / 2.77 / 3.06 s, n=72 turns | [m] L4B |
| Backchannels | "haan"/"hmm" answered "Are you still there?" on 4 of 16 short turns (ignore-terms list empty by default, W 44) | [m] L4B |
| Barge-in / collisions / babble | handled 3 of 7; collisions 3% of turns (Vapi 35%); babble slowed a session to 8 s and dropped it | [m] small n |
| Hindi/Hinglish language hold | Hindi callers got English, but the demo forces `en`: **withdrawn** | [u] EL-54 |
| Handset gap on Indian PSTN, standard plan | predicted p50 2.0-3.2 s (EL-P08), untested | [u] |
- **Turn controls** are enums and whole seconds (eagerness patient|normal|eager, turn_timeout 7 s, speculative turn, spelling patience, ignore terms, soft-timeout filler); no millisecond knob and no visible floor; Turn V3 locks ASR to Scribe v2 Realtime, so no Indic ASR pairing [o] (W §5).
- **Expressiveness.** Expressive mode ON, 10 audio-tag chips, stability 0.5 / similarity 0.75, pronunciation dictionaries, phoneme tags [o]. Their strength; no Hinglish listening test of it from us [u]; not a wedge (TS "Not wedges").
- **Languages.** 88 listed incl. 14 South Asian; no Hinglish row; language-detection tool OFF; library voices seen are all English (62-language-list, 15-voice-library) [o]. Marketing claims Hinglish tuning; docs have zero "Hinglish" in 258 bodies and 804 titles [v/o] EL-40/54.
- **Ending a call.** End-conversation tool OFF, silence end-call disabled, max 600 s (on a pre-existing template agent, not a proven default for all) [o] (WS caveat).

## 5. Campaigns, telephony and India readiness
- **Public outbound is Batch Calling only** [o] EL-05, W 33/35: one page, 7 inputs (name, number, ring timeout 60 s, concurrency, agent, recipients, timing). CSV/XLS up to 25 MB; `phone_number` required; `prompt`, `first_message`, `voice_id`, `language` optional; other columns become variables. One start time + timezone. **No** calling window, retry rule, DND/NCPR scrub, consent, DLT, dedupe, +91 normalisation or cost estimate. Per-recipient status, one retry endpoint, export; Zero Retention Mode cannot be combined with batch.
- **Hidden campaign product** [o]: 16 unpublished `/v1/convai/outbound-campaigns` paths (18 operations: submit, pause, resume, stop, progress, leads with suppressLead, attention queue with resolve/retry, workspace config, pre-revoke-status), a dashboard route, and `campaign_id`, `campaign_lead_id`, `cold_attempt`, `conversation_type` already on conversation records; not visible in a new Free workspace (W §9). Counts corrected from "23 routes / 326 of 568" (double-counted) to 204 of 335 unique unpublished convai paths (T/verify.md; A report still carries 326).
- **Telephony.** Import only (Twilio, SIP, Exotel); sells no numbers; no KYC or price step [o] (31-phone-import). Exotel native since 2026-06-01 (WebSocket, 8 kHz PCM, Mumbai or Singapore); the Voicebot applet is gated by Exotel support (1-2 business days) and transfer needs a chained Connect applet [o/v] EL-38. Twilio regions only us1/ie1/au1 [o] EL-43. WhatsApp and SMS are native.
- **India.** Residency is Enterprise-only (separate workspace; storage in India, processing "may occur outside"; Realtime Max not offered) [o/v] EL-39. Zero mentions of TRAI, DLT, NCPR/DND, 140/160 series or IST hours in 258 pages; disclosure and recording consent are the buyer's contract duty and phone calls inject nothing [o] EL-40/41. None of the 6 vendor dashboards reached a ring on an Indian line; this one stopped at import-only numbers (WS finding 4).
- **Failure reasons.** Per call: termination_reason, error {code, reason}, call_result (5 values), SIP messages, queue_wait_secs, 40 filters; no India-specific reason (DND, CLI/DLT, operator announcement) [o] EL-12. Voicemail detection is a system tool (OFF); Twilio AMD is ignored on non-Twilio providers; Indian operator announcements untested [o/u].

## 6. Analytics, QA, memory and learning
- **Analytics.** 12 dashboard tabs (General, Evaluation, Data Collection, Workflow, Audio, Queue, Tools, LLMs, Topics, KB, Advanced, Testing); success rate, CSAT (needs widget feedback), response time, total and average LLM cost (7-analytics). Post-call: evaluation criteria with numeric scoring, typed data-collection fields, topic discovery, sentiment (with Acknowledge notice), auto-translate (41-agent-analysis) [o]. All empty.
- **QA.** llm, tool and simulation tests (personas, success conditions, repeat runs), Spotlight, Triage board, "Flag issue for review" tool, Alerting (Alpha), OTLP traces, Debugger [o]; none exercised.
- **Architect** (Alpha, "free through October 2026", no later price): investigates, edits on a branch, writes and runs tests, opens a merge proposal; a person merges; no scheduled work [o] EL-03, 8-architect.
- **Memory and personalisation.** Built, gated, Alpha tab; widget memory would key to a browser fingerprint. Personalisation today is per call: dynamic variables, per-call overrides, pre-call initiation webhook [o] EL-51/52.
- **Learning is human-gated**: experiments split deterministically, winners promoted by hand, no significance test documented [o] EL-53, ledger.LRN-09. Automations and architect-dispatches sit in the bundle [o] EL-08.
- **Metering.** Per-conversation charging block splits platform, LLM (irreversible vs initiated/speculative), TTS, ASR, analysis, is_burst, cost_fiat [o] (A §5).

## 7. Pricing, cost of goods and unit economics
| Item | Value | Grade |
|---|---|---|
| Platform fee | USD 0.08/min = INR 7.60 at FX 95 (INR 7.04 at FX 88); USD unchanged since 2026-06 | [o] EL-29 |
| Burst | USD 0.16 = INR 15.2; ON by default, 3x concurrency, deprioritised | [o] |
| Silent stretches | billed at 5% | [v] EL-30 |
| Default LLM per minute | USD 0.0078 on dashboard, USD 0.0130 on API calculator (INR 0.74 vs 1.23); gemini-2.5-flash USD 0.0054 | [d]/[o] |
| All-in Indian outbound minute | INR 8.17-8.92 via Exotel/Plivo; 15.8-16.5 burst; 12.5-15.0 via Twilio | [i] EL-31 (Exotel rate assumed = Plivo) |
| vs Sarvam INR 3.4-3.9 | 2.1-2.6x | [i] |
| Fee vs ElevenLabs' own API ASR+TTS (USD 0.0206/min) | 3.3-3.9x | [i] EL-32 |
| Gross margin | **unknown**; the 82-97% was an analogue and was withdrawn | [u] EL-33 |
| INR/UPI checkout | claimed on the pricing page; subscription tab shows USD only | [v]/[o] EL-34 |
Lesson: list price is a lever only if VP's own COGS allows it (rejected.2026-10-17.parity-undercut, rejected.2026-10-17.per-minute-launch); an incumbent with unknown but plausibly high margin can follow a cut.

## 8. Customer complaints and churn drivers
There is **no churn data**; this is complaint evidence (T/report.md §7, EL-45..50). Reddit and G2 returned 403 and were not bypassed; Trustpilot and GitHub came through a model summary, so quotes may be paraphrased. r2-untouched-raw/findings.md holds no ElevenLabs content.
| Code | Evidence | Grade |
|---|---|---|
| SUPPORT | Trustpilot 3.0 from 1,192 reviews: "routes to an AI agent that cannot resolve billing matters and does not transfer to a person" (2026-06-11); "Non-existent" (2025-12); WhatsApp failing, "emailing support 4 times" (2026-01) | [o] EL-46 |
| DOCS/UX | "brute force an agent at the dashboard and API to figure it out" (2026-10-06) | [o] EL-46 |
| RELIABILITY | "call unexpectedly drops ... no record of the previous conversation" (2026-06-17); packages #635 agent does not speak, #257, #336; 25 status incidents in 75 days, 9 Agents/SIP/Twilio/batch/history, 4 SIP/Twilio, 0 India | [o] EL-37/47 |
| BILLING | "charging me credits for the AI agent's mistakes" (2026-07-24); Retell threads on v3 billing | [o] EL-48 |
| SALES QUALITY | HN 48088509: its own sales-outreach agent "completely incapable" | [o] EL-49 |
| INDIA FIT | r/StartUpIndia 2025-08: "better grip on english ... not so much with hindi"; a 2026-02 commenter wants ElevenLabs but "can import numbers by a sip trunk and don't know what it is" (single comments; r2 reddit-threads/1mo4dz6.json, 1qtqcdc.json) | [o] low weight |
Likely reasons to leave [i]: AI-only support at a billing dispute; surprise spend (burst, speculative generations, a default LLM 2.4x gemini-2.5-flash); an India path of seven provider fields with no compliance; a reply gap above 3 s on the demo.

## 9. Velocity and likely next moves
- **Pace.** 32 weekly changelog entries (2026-04-01 to 10-12), 296 headline items, 195 for ElevenAgents, median 6 per entry; Vapi 82 in a similar window [o] EL-35 (not re-verified). Includes Exotel 06-01, memory tool types 06-15, backchannel flag 07-13, wait queues 08-17, alerting 09-21.
- **Predictions (TP 59-70).** EL-P12 memory off by default: HIT (403). EL-P04, P09, P10: partly supported. P01-03, 05-08, 11: not testable without calls or uploads (A predictions-scored.json). P08 (handset p50 2.0-3.2 s) is the key unproven one.
| Likely move | Evidence | Horizon | Grade |
|---|---|---|---|
| Lead-level campaigns go public (retries, suppression, attention queue) | 16 hidden paths, fields on records | by 2027-01-31 | [i] EL-07 |
| Cross-call memory leaves flag/Alpha | 403 gate, Memory Alpha tab | 1-2 quarters | [i] |
| Architect priced or leaves alpha | "free through October 2026" | now | [o] |
| More India plumbing | Exotel, residency, India hires (AE, Account Manager, Deployment Strategist Lead) | ongoing | [i] |
| India compliance controls | no signal in docs, API, dashboard, bundle | unlikely soon | [i] |
Reliability risk: 4 SIP/Twilio incidents in 75 days at about 6 agent items a week.

## 10. Adopt
14 patterns, each with the fix for its failure mode, are in the `adopt` field.

## 11. Beat
12 testable wedges are in the `beat` field. **Honesty check:** our lab shows 15-42% cut-ins on every stack and reply gaps of 0.8-4.2 s (DIRECTION.md) against ElevenLabs' 3% collisions and 3.75 s demo gap: VP does not yet beat it on collisions, and W3/W4 stay hypotheses until a same-handset battery.

## 12. Always learn
| Signal | Source | Cadence | Alarm |
|---|---|---|---|
| Changelog (Agents section) | ElevenLabs docs changelog, weekly entries | weekly | campaigns, memory GA, India, compliance, price |
| Pricing pages | diff against T/pricing-allin.json | weekly; daily once Architect alpha ends | USD 0.08 or burst change, INR checkout, Architect price |
| OpenAPI diff | public openapi.json (322 paths, 1,644 schemas baseline) | weekly | `outbound-campaigns` or `memories` published; window, DND or consent fields on batch |
| Signed-out dashboard bundle | HAR export; bundle_endpoints.py fixed to dedupe by normalised path | fortnightly | unpublished-path count (204) changes |
| Docs index | llms.txt (804 pages); grep TRAI, DLT, NCPR, DND, 140, Hinglish (all zero) | weekly | first hit |
| Status | incident.io RSS (25 per 75 d baseline) | daily | India-residency or SIP incident |
| SDK/types releases | npm, PyPI (client 1.29.0, types 0.25.0, JS 2.74) | weekly | new events, hinglish_mode documented |
| Trial dashboard re-walk | same 14 key screens | monthly and on any alarm | Memory unlocked, Outbound visible, Hinglish row |
| Reviews, HN, GitHub, Reddit; jobs (157 baseline); funding | authorised routes only | monthly / quarterly | support or billing regression; India GM hire |
| Live battery on defaults | 30+ clean turns on our own handset, haan/hmm, barge-in, hang-up, disclosure | after each alarm and quarterly | settles W3/W4/EL-P08 |
Each observation is logged with grade and date; a vendor claim never enters the graph as observed.
