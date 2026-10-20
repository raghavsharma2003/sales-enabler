What was written to disk:
- Data files in /home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/: claims.json (37 claims), data-model-matrix.csv, api-surface-matrix.csv, vp-v1-schema.json, lane-spotcheck.json and dashboard-walkthrough.json.
- The inbox file /home/user/sales-enabler/context/inbox/account-synthesis.json: 12 nodes, 31 edges and 1 event. It passes the project schema check (0 problems) and every edge points to an id already in graph.json or in this file.

Also: when you save the Retell lane's report.md, fix or annotate its claim ids. Several are shifted against its own claims.json. For example, the report's RAP-35 is claims RAP-34 and the report's RAP-43 is claims RAP-40 (details in XS-04).

# Authorized-surface phase: cross-vendor synthesis (2026-10-20)

**Inputs**
- The five account-phase lanes: Bolna (open-source code plus our API key), Vapi, Retell and ElevenLabs (our API keys), and Sarvam (Model API key only; Voice Agents refused it).
- The public-phase claims.json files and Sarvam's public-phase report.md. That is the only public-phase report.md on disk.
- This lane made no API calls.

**Grades:** observed, inferred, vendor-claimed or unknown.

**Claim ids**
- XS-nn: this synthesis (synthesis/claims.json).
- Account-phase lanes: ACB (Bolna), AP (Vapi), RAP (Retell), AP-EL (ElevenLabs), SAC (Sarvam).
- Public phase: BOL, VAP, RET, EL, SAR.

## 0. The short version

1. **Convergent shape.** All five APIs are built the same way:
   - one agent document holds voice, brain, turn-taking, tools and analysis;
   - one record per call carries typed costs;
   - an LLM judge runs after the call.

   None of them models the person being called or the policy for calling them. That is where VP's data model should differ (XS-05, XS-09, XS-11, XS-13).
2. **The stored record is not what runs.** At all 4 vendors we could write to, an API-created agent stores or runs defaults that differ from the docs or the dashboard. 3 of those 4 silently drop unknown fields (XS-07, XS-08). VP can close this gap cheaply.
3. **Turn-taking defaults are English** wherever we could read them. Bolna's code throws away short replies spoken while the agent talks and holds each reply for about 1.4 s. But VP's own lab has not solved turn-taking either, so this advantage is unproven until both sides are measured on the same battery (XS-21, XS-22, XS-33).
4. **The parity floor is long but well defined:** 12 items that 4 or 5 of the 5 APIs ship (XS-31). It is a floor, not a wedge (XS-34).
5. **No incumbent lets an API key do everything the dashboard can.** Because VP's setup is chat-driven, matching the dashboard in the API and MCP server is a real differentiator (XS-16).
6. **Model-tier check.** The Sonnet-tier lanes held up: 19 of 20 re-checked claims were confirmed in full, 1 was confirmed in part, and none was contradicted. The mixed-tier decision stands (XS-02).

## 1. Method and lane quality

**Coverage**
- 282 lane claims: Bolna 57, Vapi 61, Retell 55, ElevenLabs 54, Sarvam 55.
- Grades: 242 observed, 23 inferred, 12 vendor-claimed, 5 unknown.
- Every claim has evidence, and every local path it cites exists (XS-01).

**Re-checking the Sonnet lanes.** decision.2026-10-20.account-mixed-tiers says to rerun on Opus if the Sonnet lanes turn out materially weaker. So I re-read the saved raw response, spec or code behind 20 decision-critical Sonnet claims, plus 3 Bolna claims (lane-spotcheck.json).
- **Results:** 19 confirmed and 1 confirmed in part. That one is Retell RAP-10: the 201 response was saved but the request body with the unknown field was not. Nothing was contradicted.
- **Bolna's ~1.4 s reply floor, traced in the code:**
  - The final transcript arrives after 500 ms of endpointing.
  - `utterance_end_time` is set when that final arrives.
  - `get_audio_send_status` then returns WAIT until 900 ms have passed (from the third history entry on).
- **Bookkeeping defects (not substance):**
  - 6 Sarvam claims graded observed rest only on vendor docs (SAC-20, 22, 29, 45, 47, 49). I read them as vendor-claimed (XS-03).
  - Retell's report text cites shifted claim ids (XS-04).
- **Verdict.** The differences between lanes come from access (Bolna had source code; Sarvam's key class was refused), not from model tier. No Sonnet lane needs a rerun on Opus.

## 2. Cross-vendor data model (full table: synthesis/data-model-matrix.csv)

| Object | Bolna | Vapi | Retell | ElevenLabs | Sarvam |
|---|---|---|---|---|---|
| Agent | agent with tasks[] and about 35 task knobs; prompt stored in S3 | assistant with 31 top-level properties, stored sparsely | agent pointing at a Retell LLM, a conversation flow or a custom LLM | one JSON document; 313 settings read back | app inside a workspace; no REST authoring |
| Versioning | none for agents; workflows have drafts and published versions | every PATCH publishes vN (hash and parent); drafts are separate | draft, then publish (frozen; edits refused with 422) | a version on every write, in branches with merge | draft, committed, deployed |
| Call record | execution: 5 cost lines in cents, hangup fields | call: 638 end reasons, 8 cost lines in USD | call: 5 statuses, 39 reasons, per-second costs, latency | conversation: 5 statuses, charging block, per-turn timers | attempt plus interaction |
| Dial vs conversation | one record | one record | one record | one record (plus an initiation-failure webhook) | **separate attempt record** |
| Campaign | batches plus workflow campaigns | campaign v1 and v2; earliest/latest window only | batch: create only; one window, Los Angeles default | batch: one start time | campaign with a retry ladder by outcome class, number rotation, pause/resume |
| Contact | none | none (customer inline on each call) | CRM contact (exact-string key; 10-digit Indian number becomes +1) | none (a user_id string) | cohorts plus an org-wide DND list |
| Consent, DND, DLT | number-compliance application only | toggles only | do_not_call flag, off unless the caller sets honor_internal_dnc | none | DND list (docs); no DLT field |
| Memory | none (per-journey state.* only) | none (sessions up to 30 days) | per-contact text brief | built, but behind a flag (403 for us) | per-call variables |
| Judges | 2 auto-created, hidden from list views | structured outputs, scorecards | custom typed fields | criteria plus data collection, on by default | output variables plus goals |
| Tests | disposition test only | scenarios, personalities, suites | test definitions, batch tests | LLM, tool and simulation tests | suites with an AI judge |

**What the convergent shape says to build**
- Keep the agent document and the call record, because buyers expect them. But make the stored record equal to what runs.
- The unique Indian need sits on the person and the policy. VP v1 should make these first-class (vp-v1-schema.json):
  - **Contact:** E.164 with India as the default country, de-duplicated across formats, with a consent ledger, DND/NCPR status, attempt history and a memory slot for v2.
  - **Campaign:** the call's category drives the calling window; plus a retry ladder by outcome, attempt budgets, pacing, a caller-ID pool and a built-in pre-dial check.
  - **Attempt and Conversation as separate records** (Sarvam's pattern), with the carrier and its code kept.
  - **Outcome definitions the customer owns.**

## 3. Cross-vendor API surface (full table: synthesis/api-surface-matrix.csv)

| Vendor | Agent-platform operations | Richest at | Thinnest at |
|---|---|---|---|
| Bolna | 128 operations over 96 paths, rebuilt from doc fragments (no spec file) | Indian telephony (trunks, compliance application, Vobiz/Plivo/Exotel); workflow journeys with WhatsApp | no agent versioning; unsigned execution webhooks; silent field drops |
| Vapi | 143 operations over 74 public paths; the web SDK client has 246 over 137 | QA: 51 of the 143 public operations are evals, simulations, scorecards or structured outputs (XS-37). Also events: 29 webhook message types, 8 of which change the call | org, billing and spend cap need a dashboard session (401); the chat builder has no API; no contacts |
| Retell | 109 operations (SDK identical to spec) | live call control (inject context, listen, take over); contacts with memory; machine-readable rate limits | CSV import needs a dashboard session token; no export creation; batches are create-only; no billing route |
| ElevenLabs | 200 of 420 operations are agent-platform | breadth of config (313 settings), branches and merges, 65 permissions, typed WebSocket events | key management and billing need a session (401); India layer absent; defaults differ from the schema |
| Sarvam | 68 Voice Agents operations plus 53 Model API operations | campaign operations: retry ladder, rejected-records file, attempt records, SQL boards | no agent, telephony or knowledge-base authoring by REST; unsigned webhooks; no usage or cost route |

**Capability counts across the five**

| Coverage | Capabilities |
|---|---|
| 5 of 5 | per-call overrides; a pre-call hook (in some form); HTTP tools, transfer and end-call; post-call webhook; post-call judge; campaign create; knowledge base; number/SIP import |
| 4 of 5 | typed per-call cost; simulated-caller tests; MCP server |
| 3 of 5 | version and publish by API; traffic split; per-turn latency in the record; signed webhooks |
| 2 of 5 | retry ladder by outcome; row-level import rejects; balance readable by API key (partly); India-default number normalisation |
| 1 of 5 | pre-dial veto per contact (Vapi); live cross-call memory (Retell); strict unknown-field rejection (1 of the 4 we could test) |
| 0 of 5 | spend cap by API key; cost grouped by campaign or contact; consent or DLT objects; calling windows that follow the call's category |

**What Bolna's code shows that closed vendors probably do the same way.** These are inferences, weighted by Bolna's 0.85 blind-calibration hit rate (XS-18):
- trimming the assistant's history to what the caller actually heard: ElevenLabs' `agent_response_correction` event and per-turn `interrupted` flag point the same way;
- speculative LLM generation at an early end of turn: ElevenLabs has `speculative_turn` and meters "initiated" separately from "irreversible" generations;
- a cheap, separate model for post-call judges;
- voicemail detection as an LLM classification of transcript text;
- failover that covers only some components (LLM at Bolna, TTS at Retell, STT/LLM at Vapi, a scheduled model reroute at ElevenLabs). No vendor shows carrier failover.

The calibration also showed that timing constants cannot be inferred from outside. They have to be measured in the call battery.

## 4. Call lifecycle, config knobs, and the v1 config schema

**Common state machine.** Every vendor has a processing phase between "ended" and the final record (XS-19):

| Phase | Bolna | Vapi | Retell | ElevenLabs | Sarvam |
|---|---|---|---|---|---|
| Queued | scheduled, queued (plus undocumented prepared), rescheduled | scheduled, queued | registered | initiated (batch: pending) | campaign scheduled; attempt created |
| Ringing | initiated, ringing | ringing | (registered) | initiated | connectivity_status |
| Not connected | busy, no-answer, failed, canceled, balance-low, error | ended, with the reason in endedReason | not_connected or error, with 39 reasons | failed, plus call_result and the initiation-failure webhook | busy, no_answer or failed, plus failure_reason |
| Live | in-progress | in-progress, forwarding | ongoing | in-progress | interaction |
| Ended | call-disconnected | ended | ended | processing | — |
| Analysed | completed | end-of-call-report | call_analyzed | done | post-call webhook |

**End reasons.** Every taxonomy is engineering codes keyed to providers: Vapi 638, Retell 39, ElevenLabs 5 call results, Bolna 12, Sarvam ended_by plus failure_reason. None has a business outcome as its own field (XS-20).

**Config knobs**

| Area | Who offers what |
|---|---|
| Turn-taking depth | Fine-grained at Vapi (wait time, three endpointing plans including a webhook, word/voice/backoff interruption controls), ElevenLabs (eagerness, timeouts, speculative turn, per-language ignore terms) and Retell (responsiveness, interruption sensitivity, backchannel, per-node overrides). Middling at Bolna. Coarse at Sarvam (three builder settings over ten underlying STT VAD parameters) (XS-23). |
| Hindi/Hinglish lexicon | No vendor ships one. Vapi's defaults are 22 English acknowledgement and 20 English interruption phrases. Bolna's stop list is English, and its Hindi agent gets an English check-in line. ElevenLabs needs the ignore-terms list filled in by hand (XS-21). |
| Opening line | Bolna drops whatever the caller says during the welcome (ACB-35). |
| Voicemail | LLM-based everywhere visible. Bolna's prompt has no Hindi or regional operator messages (ACB-41). |
| Memory | Live only at Retell (one text brief per contact, update off by default) (XS-12). |
| Voice and brain | Large catalogues everywhere. The gap is guided defaults: ElevenLabs accepts its English default voice on a Hindi agent, Retell has 6 of 300 voices with an Indian accent, and Vapi's stock voices are all English (XS-24). |

**VP v1 config schema (proposed; full version in synthesis/vp-v1-schema.json)**
- **languages:** primary, allowed, and a mode of code-mixed, locked or switch-on-request.
- **voice:** a curated user choice, validated against the agent's language; per-language lexicon including Devanagari; clause-aware chunking; fallback per open.2026-10-20.product-failover-policy.
- **brain:** a dated model id, pinned and never rerouted without the owner; max reply words.
- **opening:** speaks first, waits or dynamic; listens and is interruptible during the opening line.
- **turn_taking:**
  - end of turn: pause-aware by default;
  - barge-in: minimum words, voice duration and backoff; acknowledgement and stop terms per language, with Hindi/Hinglish defaults shipped; short replies are classified (acknowledgement, objection, stop, answer) and never discarded;
  - backchannel terms per language;
  - silence check-ins per language.
- **call_control:** the agent ends the call itself; voicemail detection uses an Indian operator-message lexicon with early exit; DTMF.
- **transfer:** cold, or warm with a summary.
- **analysis:** customer-defined business outcomes; visible, editable judges; typed extraction fields.
- **compliance:**
  - AI disclosure on by default on every creation path, including the API (Retell is the counterexample);
  - recording consent;
  - crisis lines kept;
  - call category (service, transactional or promotional), which drives the calling window.
- **privacy:** retention chosen at onboarding (never indefinite by default); redaction covers Aadhaar and PAN.
- **validation:** 422 on unknown fields; cross-checks of voice against language, model against feature, and window against category.
- **Timing defaults** (silence and hold values) are set by VP's own battery (open.2026-10-19.turn-taking), not by this document.

## 5. Pricing and billing mechanics, from the API vs the public phase

| Vendor | What the call record meters | Balance and spend cap by API key | Defaults that raise cost | Public list price | All-in INR per connected minute (public phase, FX 95) | Margin (public phase, inferred) |
|---|---|---|---|---|---|---|
| Bolna | 5 lines in cents (llm, network, platform, synthesizer, transcriber); the engine meters STT seconds, characters and tokens, and meters overflow turns apart | wallet and concurrency readable | flat rate only for "preferred models"; on Basic, one BYOK component drops the call to base rates (vendor-claimed); USD 0.02 platform fee unresolved | 6.0 cents/min PAYG | 6.1–8.0 | 46–72% |
| Vapi | 8 typed USD lines; costBreakdown; /analytics groups by assistant, type, reason or status | no (401); spend cap at most USD 1,000/month, dashboard only | analysis and voicemail detection billed as token lines | USD 0.05/min plus pass-through | 12.5–17.0 via Twilio | hosting 90–98% (grade unknown) |
| Retell | per-product lines in cents per second, plus token usage | concurrency only | burst on by default (+USD 0.10/min for the whole call); prompts over 4,000 tokens scale billed duration | USD 0.055 infra plus components | 8.3–13.6 on a BYO trunk; 22–37 on Retell numbers | infra line 75–85% |
| ElevenLabs | charging block: burst, tier, free minutes, platform/LLM/TTS/ASR/analysis, with speculative ("initiated") LLM generations metered apart from irreversible ones | character usage only | bursting on (2x price); default LLM costs 2.4x its schema default (INR 1.23 vs 0.51 per minute); retention indefinite | USD 0.08/min plus LLM | 8.2–8.9 via Exotel/Plivo; 15.8–16.5 in burst | 82–97% |
| Sarvam | nothing | nothing | 60-second agent pulses (a 30 s call costs INR 7.40 per connected minute); numbers auto-renew and are released with no grace | INR 3.00–3.50 | 3.9–7.4, by call length | list price 2.3–3.0x its own API cost |

Evidence: XS-26 to XS-30. This phase placed no billable call, so no real invoice line was read and none of the all-in figures changed.

**For VP**
- Expose these on the API and in the chat builder:
  - INR cost lines, including the named carrier;
  - per-second billing, or a short pulse;
  - balance, spend cap and concurrency;
  - cost and funnel grouped by campaign and by contact.
- Make burst opt-in.
- Show speculative-generation cost.

Every incumbent has the margin to follow a price cut, which matches rejected.2026-10-17.parity-undercut. Re-pricing waits for the default stack (open.2026-10-20.reprice-tiers).

## 6. For VP: the spec to match and the places to beat

**Parity floor.** Each item is confirmed from 4 or 5 of the 5 APIs, not from marketing. The Kano labels are my proposal and need the buyer interviews to confirm.

| Kano class | Items |
|---|---|
| Must-be | agent versions with pinning and rollback; per-call variables and overrides; HTTP tools, transfer and end-call; post-call webhook with the full record (signed); post-call judge with typed extraction; campaign create/status/cancel; knowledge base; number and SIP import |
| Performance | pre-call decision hook; typed per-call cost; simulated-caller tests that can gate publish; live context injection; per-turn latency in the record; MCP server and a config-as-code CLI |

These are parity, not a wedge (XS-34).

**Five places to beat.** Each is a gap in every incumbent's own API, and each comes with a task we can run (XS-32).

1. **Contact-and-compliance layer, on by default.**
   - Incumbent gaps:
     - none of the five has consent or DLT objects;
     - none derives windows from the call category;
     - Retell turns 10-digit Indian numbers into +1 numbers;
     - Bolna's guardrails are null on create, with a Los Angeles default time zone;
     - Vapi's pre-dial veto needs the buyer's own scrub list.
   - Task: the messy 50-row CSV plus the calling-window battery.
2. **Hinglish turn-taking that never discards a short reply and listens during the opening.**
   - Incumbent gaps: Bolna's short-final drop, welcome drop and ~1.4 s hold; English default lexicons at Vapi, Bolna and ElevenLabs; Sarvam's coarse settings.
   - Task: "nahi", "haan", "ruko" and "bas" said over the agent, the 2.4 s elderly pause, and the reply gap.
   - **Caveat:** this is unproven. VP's own stacks still cut in on 15–42% of turns (risk node).
3. **The stored config is what runs.** Defaults materialised on create, unknown fields refused, voice-language checks, the model actually used recorded per call, and AI disclosure on every creation path.
   - Incumbent gaps: XS-07 and XS-08, plus ElevenLabs' silent model reroute (AP-EL-25).
   - Task: create an agent by API, read it back, place a call, compare. This also protects the no-mid-call-swap test rule.
4. **Outcomes and economics the customer owns.** A business outcome beside the engineering code; judges the customer can see and edit (Bolna hides its auto-created ones); cost and funnel by campaign and contact; per-second billing.
   - Task: find a failed call and its reason; cost one campaign.
5. **Everything the dashboard does, on the API and MCP**, including import, export, balance and spend cap, for chat-driven setup (directive.2026-10-20.llm-native).
   - Incumbent gaps: Vapi's chat builder (Composer) and org routes; Retell's import and export; ElevenLabs' keys and billing; Sarvam's authoring.
   - Task: the chat builder sets up and runs a campaign end to end without the dashboard.

**Where VP's own features sit**
- **Emotional voice:** the curated voice choice plus expressiveness.
- **Memory (v2):** the slot on Contact; consented and editable. Retell's single text brief is the bar to beat.
- **Self-learning (v2):** owned judges feed simulated tests and the propose, probe, compose loop. No incumbent automates this loop (XS-13).

## 7. Still needs the dashboard (full list: synthesis/dashboard-walkthrough.json)

**Logins needed**
- Vapi: an email code at each login.
- Retell: TOTP at every login.
- Sarvam: a dashboard session or a Voice Agents workspace key.
- Synthflow and SquadStack are sales-only, and Exotel's voicebot access is unconfirmed.

**Dashboard items, by theme**
- **Billing and spend caps, at all five:**
  - Bolna: does the USD 0.02 platform fee apply on the bundled plan?
  - Vapi: billingLimit.
  - Retell: credits and auto-recharge.
  - ElevenLabs: invoices.
  - Sarvam: ledger lines.
- **Defaults written by each builder:**
  - Bolna: dashboard agent's incremental_delay and interrupt words (docs say 400 / 2).
  - Vapi: Composer.
  - Retell: Conductor (disclosure, language).
  - ElevenLabs: template agent (voice, language, hinglish_mode).
  - Sarvam: full agent config JSON and Genie.
- **Messy-CSV import:**
  - Bolna: batches and campaign entries.
  - Vapi: campaigns.
  - Retell: contact import (dashboard-token only).
  - ElevenLabs: batches and the hidden campaigns product.
  - Sarvam: cohorts and the rejected-records file.
- **Scheduling and compliance screens:** whole-hour windows, a 07:00–23:00 IST window, the DND UI.
- **Indian SIP and number setup:** KYC, CLI shown to the callee, Exotel import.
- **Failed calls and export:** finding a failed call and its reason at all vendors; Retell export creation; Sarvam boards.
- **Team and settings:** roles, SSO, webhook settings and secrets; ElevenLabs' memory flag.
- **Whole surface:** Synthflow, SquadStack and Exotel.

**Held for the call battery (billable)**
- reply gap, including Bolna against its ~1.4 s floor;
- short Hindi replies said over the agent;
- caller speech during the opening line;
- cut-ins at the 2.4 s pause;
- Hindi and regional operator messages;
- language hold, including ElevenLabs' hinglish_mode;
- AI disclosure on API-built vs dashboard-built agents;
- real cost lines: Retell's 4,000-token rule, ElevenLabs' speculative generations, Sarvam's pulse debits, the Vapi plus carrier invoice;
- webhook delivery, signing and retries;
- warm transfer.

**Leftovers in vendor accounts**
- Retell: one synthetic agent and its engine, kept on purpose.
- ElevenLabs: one environment variable that cannot be deleted.
- Vapi: traffic-split rows and version history, which cannot be deleted by API (XS-36).

## 8. Limits

- **No call placed.** Every latency, turn-taking and behaviour claim is from code, schema or docs.
- **Sarvam Voice Agents** objects were unreachable with our key class.
- **Not called on purpose:** ElevenLabs' 326 dashboard-bundle routes and Vapi's dashboard-only org routes, since this phase covers documented routes only.
- **Synthflow, SquadStack and Exotel** have no account-phase lane.
- **Bolna's hosted platform** may lead or lag its open-source code by hours (ACB-57).
- **Operation counts by family** are shown only where the path prefix is unambiguous; keyword binning was too noisy to report.

---

## Structured result (from the workflow run wf_36b25033-85c)

### Data model

Convergent across the five vendors: an agent document (versioned at 4 of 5, with three different semantics), one call record per dial with typed costs and engineering end codes, and a post-call LLM judge. No contact that owns consent and history, no consent/DLT objects, and calling windows that never follow the call's category. Proposed for VP v1: Org/Workspace (wallet, spend cap, concurrency on the API); Agent (draft/publish, a stored resolved config); Deployment; Contact (India-default E.164 with cross-format dedupe, consent ledger, DND/NCPR status, memory slot for v2); Campaign as a policy (category-driven window, retry ladder by outcome, attempt budget, pacing, caller-ID pool, pre-dial check); Attempt separate from Conversation; customer-owned Outcome/Judge definitions; signed webhooks; INR cost lines.

### Key findings

- Convergent shape across the five APIs: one agent document, one record per call with typed costs, and an LLM judge after the call. None models the person called or the calling policy: none has consent or DLT objects, none derives calling windows from the call category, and 2 of 5 default window time zones to Los Angeles (XS-05, XS-09, XS-11).
- At all 4 vendors we could write to, an API-created agent stores or runs defaults that differ from the docs or the dashboard (Bolna 900 ms hold vs 400 in its docs; Retell API agents lack the disclosure preset; ElevenLabs' default LLM and speculative_turn differ from its schema; Vapi stores a name-only assistant). 3 of 4 silently drop unknown fields; only Vapi rejects them (XS-07, XS-08).
- Only Sarvam keeps the dial attempt separate from the conversation, and only Sarvam (and Bolna's batches) have a retry ladder. VP v1 should adopt the attempt/conversation split and keep the carrier code, which Sarvam always leaves null (XS-10).
- Parity floor confirmed by 4 or 5 of 5 APIs: versioned agents with pinning, per-call overrides, pre-call hook, HTTP/transfer/end-call tools, full-record post-call webhook, typed per-call cost, post-call judge with typed extraction, simulated tests, campaign create/status/cancel, knowledge base, SIP/number import, MCP. Parity, not a wedge (XS-31, XS-34).
- Five places to beat, each with a runnable task: (1) a contact-and-compliance layer on by default; (2) Hinglish turn-taking that never discards short replies and listens during the opening; (3) the stored config is what runs; (4) business outcomes the customer owns, plus cost and funnel by campaign and contact; (5) everything the dashboard does, on the API and MCP, for chat-driven setup (XS-32).
- Beat (2) is unproven: VP's own lab stacks still cut in on 15-42% of turns. It is an advantage only after VP and the incumbents are scored on the same battery (XS-33; a risk node is proposed).
- No vendor lets an API key do everything the dashboard can: Vapi's org/billing routes return 401 and its chat builder (Composer) has no API; Retell's CSV import needs a dashboard session and export creation is dashboard-only; ElevenLabs' key management and billing return 401; Sarvam has no agent authoring by REST (XS-16).
- Billing: typed per-call cost at 4 of 5 (not Sarvam). Balance readable by API key at 2 of 5, and only partly. Spend cap by API key at 0 of 5. Cost by campaign or contact at 0 of 5. Silent cost raisers: ElevenLabs bursting on and a 2.4x-cost default LLM, Retell burst on, Sarvam's 60-second pulses (a 30 s call works out to INR 7.40/min) (XS-26 to XS-28).
- Public-phase all-in INR per connected Indian minute is unchanged: Sarvam 3.9-7.4, Bolna 6.1-8.0, ElevenLabs 8.2-8.9, Retell 8.3-13.6 on a BYO trunk, Vapi 12.5-17.0. Inferred margins (46-98%) mean incumbents can follow a price cut (XS-29, XS-30).
- Sonnet-lane quality check: 19 of 20 decision-critical claims confirmed against raw artifacts, 1 confirmed in part, 0 contradicted. decision.2026-10-20.account-mixed-tiers stands. Defects are bookkeeping only: 6 Sarvam claims graded observed rest on docs, and the Retell report text cites shifted claim ids (XS-02 to XS-04).

### Only learnable with a dashboard login

- Billing, invoices and spend caps at all five vendors (Bolna: whether the USD 0.02 platform fee applies; Vapi: billingLimit; Retell: credits and auto-recharge; ElevenLabs: billing portal; Sarvam: ledger lines)
- Defaults written by each dashboard builder: Bolna dashboard agent (incremental_delay and interrupt words) and Auto Build; Vapi Composer; Retell Conductor (disclosure, language); ElevenLabs template agent; Sarvam Genie and an agent's full config JSON
- Messy 50-row synthetic CSV import: Bolna batches and campaign entries, Vapi campaigns, Retell contact import (dashboard session only), ElevenLabs batches and the hidden campaigns product, Sarvam cohorts and the rejected-records file
- Scheduling and compliance screens: Bolna whole-hour guardrails and compliance application; Vapi 3-day IST schedule; Retell Campaigns screen and a 07:00-23:00 IST window; ElevenLabs daily window; Sarvam window refusal and the DND list UI
- Indian SIP trunk and number setup: Vapi byo-phone-number and the CLI shown to callees; Retell trunk import and Persona KYC; ElevenLabs Exotel/SIP import and residency; Sarvam telephony objects and number KYC
- Finding a failed call and its reason, and exporting results with extracted fields, at all vendors; Retell export creation, dashboards, alerts and AI QA; Sarvam boards and query-schema; whether Bolna's hidden auto-judges are shown anywhere
- Team and settings: Retell workspaces, RBAC, SSO and the webhook-badge key; ElevenLabs memory flag and webhook settings; Sarvam roles and webhook signing; Bolna sub-accounts (Enterprise only)
- A Sarvam Voice Agents workspace key (Settings > API Key) for everything behind it
- Whole product surface of Synthflow and SquadStack (sales-only) and Exotel's voicebot/AgentStream (access and price unpublished)
- Call battery (billable): reply gap (Bolna vs its ~1.4 s floor), short Hindi replies said over the agent, speech during the opening line, cut-ins at the 2.4 s pause, Hindi/regional operator messages, language hold incl. ElevenLabs hinglish_mode, AI disclosure on API- vs dashboard-built agents, real cost lines, webhook delivery and retries, warm transfer

### Run facts

- API key worked: False
- Endpoints documented: 648
- REA used: False
- Spend: None. This lane made no API calls and used no vendor key. It only read saved lane outputs, specs and code locally.

### Files written by the lane

- `/home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/claims.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/data-model-matrix.csv`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/api-surface-matrix.csv`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/vp-v1-schema.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/lane-spotcheck.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/synthesis/dashboard-walkthrough.json`
- `/home/user/sales-enabler/context/inbox/account-synthesis.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/SYNTHESIS.md (not written: the full text is in summary, for the main loop to save)`
