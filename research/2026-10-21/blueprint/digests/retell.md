# Retell AI dossier (id: retell)

Grades: M measured by us, O observed (capture or our API read-back), D shown by the vendor's own UI, V vendor-claimed, I inferred, U unknown. Path shorthand: T = research/2026-10-20/teardown/retell/ (report.md, verify.md, claims.json RET-nn, predictions.json RET-Pnn, pricing-allin.csv); A = research/2026-10-20/account-phase/retell/ (report.md, claims.json RAP-nn; the report text cites shifted ids, so claims.json is authoritative); W = research/2026-10-21/walkthroughs/retell/ (report.md, claims.json wt-retell-nn, defaults.json); png = data/walkthroughs/retell/png/ (gitignored). Also read: research/2026-10-17/lanes/l4a-competitors/report.md (complaint coding; r2-untouched-raw/findings.md has no Retell content), the Retell rows of the three SYNTHESIS.md files and teardown/predictions.md, radar/watchlist.json, context nodes evidence.2026-10-20.retell-*.

Bottom line: Retell is the best-run US build-and-ship platform in the set. Its builder, versioning, live-call control and per-call cost/latency data are the benchmark. Its India layer is nearly empty. We never placed a call on it, so every claim about how it sounds is U. VP wins where Retell is structurally absent (India compliance, Indian numbers, INR price, Hinglish) and must match it everywhere else.

## 1. What it is, who buys it, how it makes money

- Developer-first voice-agent platform for US businesses: receptionist, appointment booking, lead qualification, outbound reactivation, support/after-hours, debt collection, IVR automation (28 templates in 10 tabs, W 03/06, O).
- Scale (V): USD 80M ARR with 50 staff, valuation over USD 1.5B (job post 2026-10-14; a July post said 60M). 27 open roles, nearly all Redwood City; language roles are Mandarin and Spanish only, one Singapore FDE, none India (O, RET-31).
- Money is usage plus meters (O, RET-32/34): infra USD 0.055/min, plus TTS 0.015-0.10, LLM 0.0016-0.384 (fast tier 0.64), S2S 0.07-0.38, telephony (US 0.015; India 0.15 Twilio / 0.25 Telnyx; custom SIP free). Add-ons: KB/denoise/guardrails +0.005, PII +0.01, AI QA 0.10/min, batch 0.005/dial, branded call 0.10, Conductor credits 0.20 after 30/user/day. Subscriptions: numbers 2/mo, concurrency 20 free then 8/slot, KB 10 free then 8. Enterprise gates RBAC/SSO/volume terms. Since 2026-09-30 prepaid USD credits via Stripe; calls stop at zero balance. Burst concurrency (+0.10/min for the whole call) is ON by default (O, W 5x-settings).
- Every meter is a margin line: infra margin 72-86% (I, RET-36; compute is an unmeasured assumption).

## 2. Product model and architecture

Objects (O, A section 2, RAP-11..17): org > agent (voice) / chat-agent, each pointing at ONE response engine: retell-llm, conversation-flow, or custom-LLM WebSocket. Agent and engine version together. phone-number (type retell-twilio | retell-telnyx | custom SIP; weighted inbound/outbound/SMS agent lists; inbound webhook; fallback number), call/chat, batch-call (create-only), contact (phone-keyed, memory text, custom fields, DNC flag), knowledge-base, app, MCP, test-case > batch-test > test-run, concurrency. Absent from 109 API operations: campaign, consent, DNC list, calling policy, billing, workspace, member (O). The OpenAPI DashboardSource enum lists "campaign" (O, RET-06) but the dashboard has no Campaigns entry (O, wt-retell-03): hidden or unreleased.

Versioning (O, RAP-12): publish freezes in place; PATCH on a published version returns 422; create-agent-version clones agent AND engine into a draft; edits never publish; each call freezes the agent and tag (prod/staging). Conversation flow: 15 node types, edges with prompt or equation conditions, global nodes, per-node overrides (STT mode, voice speed, responsiveness, interruption, model, skippable-if-answered-or-in-memory). Tools: end_call, cold/warm/agentic-warm transfer, agent_swap, DTMF, SMS, HTTP, JS code, extract variable, MCP, CRM apps.

Call lifecycle (O, typed spec, A section 5; no call placed): registered > not_connected (dial_busy, no_answer, invalid_destination, marked_as_spam...) > ongoing > ended/error > post-call analysis (separate, rerunnable model) > call_analyzed. 39 disconnection reasons, all engineering codes; business outcome is only a custom post-call field. Call object: transcript variants, recordings, per-product cost lines (cents per second), per-component latency (asr, llm, tts, e2e, kb, s2s), token usage, PCAP.

Voice stack (O, RET-16/29; I for what runs where): own orchestration (queues/workers, per postmortems, V); STT Azure/Deepgram/Soniox/AssemblyAI/"Muse" (spec only), default Deepgram in Hindi threads; TTS ElevenLabs, Cartesia, MiniMax, Fish, OpenAI, Inworld, "Platform"; 33 cascaded LLMs (OpenAI, Claude, Gemini; no open-weight or Indian lab) plus 6 gpt-realtime S2S. Platform Voices look re-listed: 15 of 21 preview files named minimax-, 2 fish, 1 cartesia (I, RAP-31; names repeat under three providers in the picker, W 10). That weakens the "fine-tuned, self-hosted models" claim (V, RET-28). Hosting: Retell-operated hosts are US-West (sip us-west-2; api behind Global Accelerator); staff said "only US(west)... no other PoP" (O, RET-25, 2026-03-25). But the legacy LiveKit Cloud web host geo-routes Indian clients to a Hyderabad /24, and LiveKit Inc. blocks in the SIP allowlist include Mumbai/Hyderabad (O, RET-21/61). Web SDK 3.0 (2026-09-08) moved to Retell's own WHIP-style gateway (O, RET-23). Where Indian PSTN media actually lands is U until a PCAP.

What the stored config really does (account phase, O): an API-created agent (engine + voice_id only) stores almost nothing: no handbook_config, no timezone, language en-US, empty PII list; the dashboard agent is seeded with handbook_config {ai_disclosure, default_personality}, interruption 0.9, voicemail hangup, prod/staging tags (RAP-19/20). So the AI-disclosure default holds only on the dashboard path (O; runtime behaviour U). Unknown request fields are silently ignored; 63 locales accepted though the changelog says "multi" was removed (spec/server drift, RAP-09). An empty dashboard prompt already shows 814 tokens against the 4,000-token billing threshold (D, wt-retell-10).

## 3. Builder and UX end to end

Shape (O, W section 1): 15 destinations in 5 groups (Build: Agents, KB; Deploy: Numbers, Batch; Data: Calls, Chat, Contacts; Monitor: Analytics, Live, AI QA, Alerting; System: Integrations, Billing, Settings), Conductor chat on Home and floating on every page. About 4 clicks and 0 required fields to a browser-testable agent (I, wt-retell-05). Builder: agent bar with Test, Build with AI, Publish; model/voice/language selectors; prompt; 10 accordions; test panel (Test Audio / Test LLM).

Best moments (VP must match or beat):
- Price on every model row and a live Cost/Latency/Tokens strip: USD 0.134/min = 0.055 + 0.015 + 0.064 (D+I; png/09-model-dropdown.png, 04-agent-builder-top.png).
- Price at the toggle: memory USD 0.005/run (png/76-workflow-tab.png), burst 0.10 (png/5x-settings.png), batch 0.005/dial (png/24-batch-create-shot.png).
- Lifecycle Workflow canvas: pre-call functions > call > post-call extraction > memory > post-call functions (png/76).
- Transfer form with plain-language modes: "AI has a 2-way conversation with agent, then bridges" (png/08-call-transfer-form.png).
- 7-step Getting-started checklist with locked steps and previews, and page-aware Conductor chips (png/71-home-onboarding-conductor.png, 41-call-history.png).
- Reserved-concurrency readout "allocated to batch calling: 15" and multi-range windows with days of week (png/24, 25).
- Conductor proposes edits as per-setting diffs a human accepts (O, RET-03); simulation tests from failed calls (RET-58).

Worst moments:
- Create defaults to Conversational flow while Single prompt is labelled "Easy to start"; empty prompt with placeholder only (png/03, 04).
- Stale tour "Wait for the test panel to finish loading" on every non-builder page; layout overflow clips the primary button at 1280 px (png/21, 5x-billing, 02).
- Send disabled with no reason on the batch form (png/24).
- AI QA shows 240 calls dated a year ago with no "Sample" label while Call History is empty; Alerting rows have mismatched titles (png/46, 47); empty tables with no CTA (png/41, 42, 43).
- Voice picker: accent filter offers only American/British/Mexican; zero Indian voices; no price or latency on voices/languages (png/10-voice-picker.png, 11).
- Ten accordions in a long column with Call settings buried; 14 PII boxes ticked one by one (png/14-state.png).
- Persona identity wall at Buy New Number before any country or price (png/30-buy-number-shot.png).

## 4. Conversation quality and voice

We have NOT measured Retell on a call (U). Evidence is design and complaints.
- Latency: vendor says "~600 ms" (V, RET-28); a community thread reports 3,000 ms (t/591, l4a); our predicted handset reply gap is p50 1.6-2.4 s, p90 over 2.8 s (RET-P09, p=0.6, unscored). Per-component latency is exposed after each call (O).
- Turn-taking: defaults sit at the reactive extreme: 0 ms added wait, interruption 0.9, reminder 10 s once (O, wt-retell-26..31); real endpointing unknown. Rich knobs exist: backchannel, dynamic responsiveness, per-node overrides, fallback TTS (O, RAP-18..30). Our own lab saw 15-42% cut-ins on every stack, so an English-tuned default may over-cut Hinglish.
- Naturalness: Conversational Mode, "Colloquial Model" rewrite (about 50 ms, V), Expressive Mode, natural fillers, dynamic voice speed (O, RET-11). Whether any sounds human is U.
- Hindi/Hinglish: 6 Indian locales (en-IN, hi, kn, mr, ta, ur); no Telugu, Bengali, Gujarati, Malayalam, Punjabi, Odia; no Hinglish/code-switch option; "Multiselect" language effect U (O). Threads: Hindi digits not recognised, staff blames Deepgram, try Soniox (t/2713); Marathi reply drifts to English (t/2502, 330 views); Telugu/Bengali unsupported, "try GPT Realtime" (t/1645); Sarvam STT/TTS requests unanswered (t/2856, 2866); Hindi agent drifts language (t/384) (O).
- Disclosure: platform preset "AI Disclosure When Asked" on for dashboard agents, absent for API agents (O).
- Voicemail/IVR: options exist (prompt/static/hangup/bridge; IVR hangup only); Indian operator announcements untested (RET-P06, U).

## 5. Campaigns, telephony, India readiness

- Batch call (O, W section 9; RET-05; RAP-41): one page form: CSV up to 50 MB with dynamic-variable columns, Send Now or Schedule (timezone defaulted to Asia/Calcutta in the dashboard vs America/Los_Angeles in the API), one window (00:00-23:59 default, ranges + days), reserved concurrency, USD 0.005 per dial. Absent: consent/DND/NCPR/DLT fields, retries, pacing, per-lead windows, agent selector, a reason when Send is disabled. API response has batch_call_id only (no status, cancel or retry). CSV contact import needs a dashboard JWT (401 to API key, rejected.2026-10-20.acct-retell-csv-import-by-api-key).
- DNC: honor_internal_dnc defaults false; docs say batch and inbound calls do not check do_not_call; dashboard copy says DNC handling skips DNC contacts (unresolved, wt-retell-54). Contact create turned "9000000001" into +19000000001, stored "09000000003" and "12345" verbatim, dedupes exact strings only (O, RAP-34).
- Numbers: Retell-bought numbers US/CA only; Persona government-ID KYC (one person per account) before outbound; Indian CLI means a BYO SIP trunk, with forum friction (Plivo "user busy" t/758, "Try vobiz" t/3145, India-to-India transfer refused t/2363) (O, RET-12/45). Retell's own answer for India pricing quotes international routes (t/3428).
- Compliance: TRAI, DLT, NCPR, DPDP, residency appear 0 times in 338 docs pages (O, RET-42); PII categories exclude Aadhaar/PAN; BFSI service calls must come from 1600-series numbers (ledger REG-10/20), which Retell cannot supply (I, RET-64).
- Support/billing: active support 9 AM-9 PM PST = 21:30-09:30 IST (22:30-10:30 after 2026-11-01); USD-only Stripe; no INR, UPI or GST field; one UPI payment failed (t/3723, unresolved).

## 6. Analytics, QA, memory, learning

- Analytics (O, W section 10): Call and Chat dashboards, custom dashboards, 15 default widgets with breakdowns. Call History has 13 columns (cost, end reason, sentiment, Session Outcome, e2e latency). Live monitoring with take-over; alerting (14 metrics) by email/webhook; export is dashboard-only.
- AI QA: cohort scoring on audio quality, hallucination, resolution, transfer success, top questions; USD 0.10/min, first 100 min free (O, RET-58).
- Control plane (O, RAP-40): update-live-call injects context (role "injected") and forces a regenerate; listen-live subscribe-only token; take-over permanently stops the agent.
- Memory: read ON, update OFF by default at USD 0.005/run; a rewritten brief under 2,000 characters per phone number; prompt says drop resolved items, no sentiment or personality guess (O, RAP-32, RET-57). Marketing ("resume where the last call left off") outruns this.
- Learning: Conductor turns failed calls into simulation tests and proposes diffs a human approves; A/B is fixed weights, no statistics, no auto-promotion (O, RET-08, RET-58); no bandit or self-optimisation is documented. Personalisation: dynamic variables, CRM fields, post-call analysis written back to contacts with backfill (O, RET-59).

## 7. Pricing, COGS, unit economics

- Dashboard cost for the default agent: USD 0.134/min = INR 12.7 at FX 95, before telephony (D+I, wt-retell-09). Calculator default 0.11.
- All-in INR per connected Indian minute, computed not billed (I, T pricing-allin.csv, RET-35): BYO Indian trunk with a prompt up to 4k tokens 8.3 / 11.4 / 13.6 (GPT-5 mini / calculator default / GPT-5.6 Terra); 6k prompt with LLM line scaled 8.7-16.7; whole duration scaled 12.0-20.0; Retell US number via Twilio 22.1-27.5; via Telnyx 31.6-37.0. Caveats: transcript counts toward the 4,000 tokens; the 4k rule scaling is untested on a real invoice; a BYO Indian trunk reaching a US SIP edge at domestic rates is unverified.
- Hidden multipliers (O): over-4,000-token prompts scale billed duration by tokens/4000; 10 s minimum on dynamic openers; burst +0.10; "no minimums" marketing contradicts the 10 s rule. Runaway exposure: 10 min silence limit and 1 h cap at 0.134/min = USD 1.34 / 8.04 per runaway call (I, wt-retell-29).
- The infra line alone (USD 0.055 = INR 5.2) is above VP's INR 2-3 target; Retell is 1.2-3.8x Indian list prices of 3.55-7 and 2.8-6.8x VP's target (I, RET-37 corrected), but inside the 8-18 band other Indian vendors post. Hosting location does not change the rate card.
- COGS (I, RET-36): infra margin 72-86%; Platform voice at 0.015 is about break-even; calculator-default margin U. Retell can follow a price cut on the infra line; it cannot cheaply fix India telephony.

## 8. Complaints and churn

- 688 Retell support titles (M, l4a, 82% agreement with hand coding on n=40): telephony 226 (33%), tools 103, account/UI 99, billing 67, agent behaviour 61, reliability 59, ASR 36, TTS 31, turn-taking 27, language 22, support 20, latency 14, voicemail/IVR 17, compliance 7. Pain is plumbing, not naturalness.
- India-specific: Indian numbers and CLI, +91 transfers, Hindi digits, language hold, Sarvam requests, UPI payment, support hours (O, RET-50).
- Reliability (O, RET-38/39): 12 incidents in 6 months, 6 major. 2026-09-05 custom-LLM race stalled the fleet: about 6 h of undetected degradation, public post 39 min after fleet failure. 2026-09-16 a deploy double-assigned calls; about 22% of calls failed for 43 min.
- Support: auto-ack, then templated citation-style answers (O, RET-48). Churn drivers are inferred, not observed (no cohort data): India buyers hit KYC, trunk, language and price walls early; US buyers meet multipliers and 16 deprecation notices (multi-prompt retires 2026-12-15).

## 9. Velocity and likely next moves

- Pace (O, RET-40/41): 80 retell-sdk releases in 6 months; API changes every 2-3 days in October; spec revised 2026-10-19; launches 05-27 (versioning 2.0, staging/prod), 06-19 (CRM, live monitoring, dashboards, Colloquial, Expressive), 07-02 (Conductor), 08-24 (Workflows, GPT-5.6, Realtime 2.1), September (credit billing, own WebRTC gateway). No marketing changelog since 08-24.
- Likely next (I; none was pre-registered as a roadmap prediction): a Campaigns product (enum exists, 0 nav); more Conductor autonomy (vendor says it handles 70% of their own simulation testing, V); deeper own media gateway; billing refinements. India depth is unlikely near term (no India roles, USD-only billing, US-West staffing).
- Pre-registered predictions that test the weak spots (T predictions.json; TP-047..058 in predictions.md; all unscored): RET-P01 sign-up to first Indian-handset call over 30 min (0.6); P02 Persona ID needed (0.7); P04 duplicates dialled twice (0.7), 10-digit numbers misparsed (0.75), opt-out row dialled (0.85); P05 LA default, no TRAI warning (0.8); P06 voicemail misclassifies 1 of 3 operator announcements (0.55); P09 reply gap above; P10 Hinglish wrong-language at least 1 in 8 turns (0.55); P11 4k rule scales ~1.5x (0.7); P12 disclosure admitted in 7 of 8 (0.7). REG-P1 (TP-112): at least 5 of 6 platforms, Retell included, start a promotional call at 09:30 IST by default.

## 10. Adopt

See the adopt field (14 patterns, each with evidence).

## 11. Beat

See the beat field (testable rows; most need a live call or an Indian number, open.2026-10-21.wt-synthesis-evidence-plan). Two honest limits: Retell can match a price cut on its 72-86% infra margin, and a reply-gap win is unproven because Retell's legacy web edge reaches Hyderabad (RET-61); measure from PCAP first.

## 12. Always learn

Baselines are in data/teardown/radar/_watchlist-baseline/ (retell__* files, fetched 2026-10-20) with diff methods in research/2026-10-20/teardown/radar/watchlist.json.

| Source | What to diff | Cadence |
|---|---|---|
| status.retellai.com incidents.json and history.rss | new incidents by component; time to first post | daily (alert on major) |
| npm retell-sdk and OpenAPI revision | new versions, operations, enum values (Language, DashboardSource, voice_model) | daily; weekly full spec diff |
| docs llms.txt | added/removed doc URLs (features appear here first) | weekly |
| retellai.com/changelog and sitemap | new dated posts, new /pricing /product paths | weekly |
| retellai.com/pricing | any number with /min, $, %, plan name; the 4,000-token and burst rules | weekly; re-run pricing_allin.py on change |
| community.retellai.com latest.json | re-code with taxonomy.py; India threads (telephony, Hindi, UPI) | monthly |
| job board | ARR, headcount, India or Hindi roles, FDE locations | monthly |
| dashboard re-walk by Instinct | Campaigns screen, Agent Handbook, publish, call detail, export, SIP form (unopened list in W section 0) | quarterly and on any launch |
| live-call battery on a trial account | reply gap, language hold, disclosure, 4k scaling, batch with messy CSV | once phone and KYC allow, then each major release |

Red-flag signals (escalate the same day): Indian PoP or region; INR/UPI/GST billing; TRAI, DLT, NCPR or DPDP in docs; a Campaigns object with DNC or attempts; Sarvam or any Indic STT/TTS; Indian-accent or Hindi-tagged voices; 1600/140 series; India hires; infra price change; Hinglish language option; autonomous optimisation or bandit A/B. Dates: 2026-11-01 (US DST ends, support window shifts), 2026-12-15 (multi-prompt retired).
