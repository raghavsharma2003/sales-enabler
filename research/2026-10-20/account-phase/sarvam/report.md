SARVAM AUTHORIZED-SURFACE REPORT (2026-10-20). report.md was NOT written, because the subagent rule forbids report .md files, as in the Vapi lane. This text is the report. Structured tables are on disk.

ACCESS RESULT. Our two stored Sarvam keys (SARVAM2 and the exhausted team key) are Model API keys. They work on api.sarvam.ai (GET /v2/models returned 200 for both). Every Voice Agents route on apps.sarvam.ai refused them with 401 "Invalid API key format" or "Malformed token" (analytics, app-authoring and app-runtime signed-URL, tried with X-API-Key, Bearer and the Model API header, using zero-UUID scope). Voice Agents needs a separate workspace key made in the dashboard under Settings > API Key. So no agent, deployment, campaign or call log could be created or read, and no synthetic agent was created. Evidence: data/account-phase/sarvam/api-reads/va-*.body. The lane therefore used the live OpenAPI files, 52 re-fetched docs pages (identical to the public phase), four SDK packages and one REA run on the npm conv-ai SDK. 29 authorized requests were made at about 1 per second, plus 6 unauthenticated GETs of public MCP OAuth metadata. Spend was zero and nothing needs cleanup.

SURFACE (observed). The Voice Agents OpenAPI has 68 operations and 175 schemas: analytics 24 (attempts, interactions, recording, transcript, boards, query), scheduling 19 (campaigns, cohorts, webhook delivery lists and retries, including for deployments), evals 15, app-authoring 6 (deployment create, list, get, patch, delete, status), outbounds 1 and BYOK 3 (Sarvam calls the customer's /auth, /decrypt-key and /rotate-key). The Model API has 53 operations (STT sync, bulk and realtime WebSocket, TTS, voice cloning, pronunciation dictionaries, translate, transliterate, language ID, chat v1 and v2, responses, dubbing, Document AI). The Voice Agents spec has NO operations for creating or editing an agent, committing a version, telephony connections, numbers or groups, knowledge bases, voices, secrets, API keys or DND. Docs name a DND API the spec lacks. Agent authoring lives in the dashboard, Genie and the hosted MCP server (OAuth with PKCE, dynamic client registration, one org and workspace per login). Auth on the Voice Agents API is X-API-Key. Error envelopes differ by service ({"error":{...}} on app-authoring and app-runtime, {"detail":...} on analytics). Live /v2/models lists sarvam-105b, glm5.3-flash, glm5.3, gemma4 and deepseekv4.1-flash. glm5.3-flash is served but not in the documented chat enum, and sarvam-105b-conversations (the agent-tuned model) is not exposed.

DATA MODEL AND OBJECT GRAPH. org > workspace > app (agent, always app_type "agent", integer versions: draft, committed and immutable, deployed). A deployment (inbound, status active or paused, a daily window defaulting to 09:00-18:00 IST) or a campaign (outbound) pins (app_id, app_version). A campaign has attempts_per_second 0.1-500, retry_config (max 0-20, an interval or array, retry_on busy, failed, no_answer, short_duration with a 30 s default, provider_error and internal_error), phone_rotation per user, allowed_schedule {HH:MM start and end, days, timezone} and webhook_config {url, metadata}. Lifecycle: scheduled, active, ended, with paused and cancelled; editing only when paused or scheduled. Cohort: a CSV plus a mandatory JSON transformation file mapping columns to phone and variables, or a JSON stream of 1-1000 users; the result counts are total, valid and rejected, with a rejected_records download and no duplicate or DND-suppressed counter. Attempt (one dial, 30 fields: connectivity_status, failure_reason, ended_by, next_action_status, retry counters, is_debug_call and has_log_issues as the strings "0" and "1") links 0..1 to interaction (31 fields, ID "YYYYMMDD/id", transcript, stereo WAV recording, forwarded_calls with blind or warm status, destination and hangup source). channel_provider is deprecated and always null. Analytics return the full unmasked phone plus masked and hashed variants, with a 60 s cache. Boards are customer-facing SQL over a ClickHouse warehouse: one read-only SELECT per widget, filter tokens, 10 tabs by 20 widgets, cron deliveries to email or Slack. Evals: a suite with global guardrails, cases (scenario, expected behaviours, max 200 turns), runs with frequency up to 20, a simulated user and an AI judge giving a verdict plus reasoning per behaviour, 402 on no credits. Audit: created_by is an Actor {user or api_key, id}. See data/account-phase/sarvam/derived/data-model.json.

CALL LIFECYCLE AND STATE MACHINE. SDK path: GET app-runtime /orgs/{org}/workspaces/{ws}/apps/{app}/url?interaction_type=call|chat[&version] with X-API-Key returns {url, reference_id}. Then open a signed WebSocket and send client.action.interaction_start (agent_variables, initial language, bot message and state; Python adds speech_hotwords and a TTS override). The server answers server.action.interaction_connected {reference_id, interaction_id}, then streams base64 PCM16 audio chunks, transcription, user_interrupt and ping/pong, and ends with interaction_end. 16 server types and 10 client types are named, identical in the Python and npm SDKs, but only 8 server payloads are typed (speech start and end, variable_update, language_change, state_transition, kb_query and tool_call are unparsed, so their payloads are unknown). Campaign and attempt states are in the data model above.

WEBHOOKS (observed). Post-call only, in three shapes. Campaign: one per attempt, connected or not, about 22 fields including completion_status completed|partial|failed, connectivity_status, next_action_status, retry_attempt, initial, final and output variables, and an English-only transcript (en_text). Inbound deployment: 12 fields, interaction_id doubles as the delivery attempt_id, and the transcript adds indic_text. Instant outbound: status connected|no_answer|busy|failed plus channel_info and an echo of webhook_config. WebhookConfig is {url, metadata} only. There is no secret, signature or header field, and no HMAC mention anywhere in 52 docs pages. There is no mid-call callback to the customer. Delivery records run running, completed or failed, with re-delivery of up to 200 attempts. Retry and backoff policy is undocumented.

METERING AND BILLING (observed in docs). Agent minutes are 60 s pulses rounded up (PAYG 3.50, Pro 3.25, Growth 3.15, Business 3.00 coming, ex GST, models included). Telephony is separate in 30 s pulses (Vobiz 0.20; transfer to PSTN 0.40, to SIP 0.35; BYO telephony free). A forwarded leg bills as telephony only. A number costs INR 59 per 30 days, renews from the wallet, and is released with campaigns and deployments cancelled if credits are short, with no grace. A simulated test run costs INR 2. Plan ceilings (concurrent / starts per minute): PAYG 4/20, Pro 10/50, Growth 30/150, Business 120/600. Plan fees return as credits at INR 1 each. No usage, balance or invoice endpoint exists in either spec, so cost per call cannot be read back through any key.

CONFIG KNOBS (35 graded, in derived/config-knobs.json). Turn-taking in the builder is three coarse settings (interrupt on/off; sound sensitivity Low, Medium or High; eagerness Patient, Normal or Eager) plus an advanced end-of-speech switch and ordered nudges with optional hang-up. Underneath, the Model API realtime STT WebSocket exposes ten frame-level VAD parameters: thresholds, min speech frames, negative-frame window, interrupt frames, pre-speech pad and a dB volume gate. The mapping from builder sliders to them is inferred. Voice: Bulbul v3 or v4 (v3 ends 2026-11-10 on Voice Agents), per-language voices, speed, pitch, volume 0.7-2, pronunciation dictionary, background sound. The v4-flash catalogue is 222 job-tagged persona slugs (customer, recovery, banking, insurance, sales, companion), and the API enum has 266 slugs against 176 in the docs. LLM: no picker and no BYO, only temperature 0.1-0.9. Prompt: the greeting is played directly and translated per language; single-state or one-way multi-state; API tools with a 30 s cap; Python code tools whose context exposes secrets, state, language and end-call. Memory: per-call variables plus caller context pulled from the customer's systems (on-start hook, known-callers CSV). No cross-call memory store is documented. Learning: a manual loop with goal rules, Goals breakdowns (voice, intro message, hour) and evals; nothing self-optimises.

WHAT THE API REVEALED THAT THE PUBLIC PAGES DID NOT. (1) The two key classes, and the Voice Agents REST gap versus the MCP. (2) Webhooks are unsigned and post-call only, with English-only transcripts. (3) Attempt and interaction are separate records, and transfers are first-class. (4) The STT-server VAD knob set. (5) Voice personas are tagged by job. (6) 12 doc-versus-spec mismatches (derived/doc-vs-spec-mismatches.json), including a DND API missing from the spec, ConnectionConfig fields in docs that the schema lacks, and three different language lists across the OpenAPI, Python SDK and npm SDK. The npm SDK is 0.0.42 from March, with different sample rates and no hotword or TTS overrides. (7) The MCP OAuth metadata advertises refresh_token while the docs say none is issued.

FOR VP'S PRODUCT. MATCH (parity floor, at INR 3-3.5/min): failure-reason and ended-by on every attempt, cohort validation with a rejected-records file, a retry ladder by outcome class, per-user number rotation, transfer records, stereo recordings, post-call webhooks with re-delivery, an eval API with a judge, SQL analytics, SDKs and an MCP server. BEAT: user-visible model and voice choice; signed webhooks; mid-call function hooks; a usage and cost API; cross-call memory; consent, DND and category-aware calling-hour objects (Sarvam's window is free-form and compliance is "your responsibility"); an agent-authoring REST API as complete as the UI; native-script transcripts. Parity alone is not a wedge (rejected.2026-10-17.parity-undercut).

ONLY-WITH-LOGIN. A Voice Agents workspace key or dashboard session is needed for: an agent's full config JSON and version history; telephony connection and number objects; KB ingestion; Genie behaviour; real messy-CSV cohort validation (duplicates, bad numbers, opt-out row); whether the server rejects a 07:00-23:00 window; voicemail and transfer behaviour; call logs; the query-schema table list; ledger and invoice lines; org policy and roles; and webhook signing and retries. Pre-registered predictions SAR-P01 to P08 remain unscored.

REA. Ran analyze-javascript-application on the npm conv-ai SDK (110 files parsed; the maps carry no source text). Outputs are in data/account-phase/sarvam/rea. Nodes are proposed in context/inbox/account-sarvam.json (12 nodes, 18 edges, schema-checked with 0 problems).

---

## Structured result (from the workflow run wf_36b25033-85c)

### Data model

org > workspace > app (agent, versions draft/committed/deployed) > deployment (inbound) or campaign (outbound) > cohort > attempt (0..1) > interaction > transcript, stereo recording, forwarded_calls; plus boards/tabs/widgets/filters/notification rules, test suite > case > run > execution, telephony connection > number > group, knowledge bases, secrets, Actor audit (user or api_key). Full graph in data/account-phase/sarvam/derived/data-model.json.

### Key findings

- Both stored Sarvam keys are Model API keys. They work on api.sarvam.ai (GET /v2/models returned 200) but every Voice Agents route on apps.sarvam.ai answered 401 Invalid API key format (X-API-Key) or Malformed token (Bearer). Voice Agents needs a separate dashboard-made workspace key, so no agent, deployment or campaign could be created or read and nothing exists to clean up.
- The Voice Agents OpenAPI has 68 operations (analytics 24, scheduling 19, evals 15, app-authoring 6, outbounds 1, BYOK 3) and 175 schemas, plus a 53-operation Model API. It has no agent create/edit/commit, telephony, knowledge-base, voice, secrets, API-key or DND operations (docs name a DND API the spec lacks), so agent authoring is dashboard, Genie and MCP only.
- Webhooks are post-call only (campaign attempt, inbound call, instant outbound). WebhookConfig is {url, metadata}: no secret or signature field, no HMAC mention in 52 docs pages, no mid-call callback, English-only transcripts (en_text). Re-delivery of up to 200 attempts is supported.
- Data model: org > workspace > app > versions; deployments and campaigns pin (app_id, app_version); attempt (30 fields) links 0..1 to interaction (31 fields, YYYYMMDD/id). channel_provider is always null; transfers are first-class records (blind or warm, destination, hangup source, recording); Actor audit is user or api_key.
- Turn-taking sits in Sarvam's STT service: the realtime STT WebSocket exposes ten frame-level VAD parameters, while the builder offers only interrupt on/off, sound sensitivity (3 levels) and eagerness (3 levels) plus nudges. The mapping is inferred.
- No model picker and no BYO (temperature 0.1-0.9 only); the agent-tuned sarvam-105b-conversations is not in the public model list. Voices are sold as job-tagged personas: 222 v4-flash slugs (customer, recovery, banking, insurance, sales, companion); the docs say 176 voices but the API enum has 266 slugs.
- Memory is per-call variables plus caller context pulled from the customer (on-start hook, known-callers CSV); no cross-call store is documented. The learning loop is manual (goal rules, Goals breakdowns by voice, intro message and hour, evals at INR 2 per run).
- Billing: 60 s agent pulses and separate 30 s telephony pulses; forwarded legs bill as telephony only; number rental INR 59 per 30 days is released with campaigns and deployments cancelled if the wallet is short (no grace). No usage, balance or invoice endpoint exists in either spec.
- Doc, spec and SDK drift: 12 mismatches recorded, including three different language lists (OpenAPI, Python SDK, npm SDK) and an npm SDK (0.0.42) that lags Python (1.1.1) on sample rates and overrides. The MCP OAuth metadata advertises refresh_token while the docs say none is issued.
- Differentiation targets for VP: signed webhooks, mid-call function hooks, a usage and cost API, cross-call memory, category-aware calling-hour and consent objects, model and voice choice, and an agent-authoring REST API. The parity items are a floor, not a wedge.

### Only learnable with a dashboard login

- Create or read an agent's full config JSON and version history (needs a Voice Agents workspace key or dashboard session)
- Telephony connection, number and group objects; knowledge-base ingestion; Genie behaviour
- Messy 50-row CSV cohort validation (duplicates, bad numbers, opt-out row) and rejected-records file
- Whether the server rejects out-of-hours schedule windows (e.g. 07:00-23:00)
- Voicemail detection and call-transfer behaviour; webhook signing and retry behaviour; payloads of the 8 untyped WebSocket event types
- Call logs, boards, and the query-schema table list; ledger, balance and invoice lines; org policy and roles

### Run facts

- API key worked: False
- Endpoints documented: 121
- REA used: True
- Spend: None. 0 credits spent: 29 read-only or empty-body validation requests with our Model API keys, no inference, no call, number or other billable action. 6 further GETs were unauthenticated public MCP OAuth metadata.

### Files written by the lane

- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/claims.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/manifest.csv`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/code/derive.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/code/derive2.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/code/claims.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/code/inbox.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/code/manifest.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/sarvam/code/sv.sh`
- `/home/user/sales-enabler/context/inbox/account-sarvam.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/endpoints.csv`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/data-model.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/config-knobs.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/conv-ai-sdk-protocol.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/doc-vs-spec-mismatches.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/tts-voice-catalog-summary.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/voice-agents-schemas-readable.txt`
- `/home/user/sales-enabler/data/account-phase/sarvam/derived/voice-agents-ops-schema-graph.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/api-reads/`
- `/home/user/sales-enabler/data/account-phase/sarvam/openapi/voice-agents.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/openapi/apis.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/docs/`
- `/home/user/sales-enabler/data/account-phase/sarvam/sdk/`
- `/home/user/sales-enabler/data/account-phase/sarvam/rea/npm-conv-ai-analyze-js.json`
- `/home/user/sales-enabler/data/account-phase/sarvam/cleanup/NOTE.txt`
