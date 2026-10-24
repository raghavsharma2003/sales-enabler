> **Note (main loop, 2026-10-20):** several claim ids cited in this report text are shifted against `claims.json` (for example the text's RAP-35 is claims RAP-34, and RAP-43 is RAP-40). Treat `claims.json` as authoritative; see synthesis claim XS-04.

# Retell AI: account-phase teardown (authorized surface), 2026-10-20

NOTE TO PARENT: report.md was NOT written to disk because this subagent harness forbids report files. This summary field IS the report body; please save it as /home/user/sales-enabler/research/2026-10-20/account-phase/retell/report.md. claims.json, manifest.csv and the inbox file are written. Claim ids (RAP-nn) refer to claims.json.

## 0. Scope and conduct

- Authorized access only: our API key (name vp-teardown, org Vyakti) on api.retellai.com, the public OpenAPI at docs.retellai.com, and the published packages retell-sdk 6.2.8 (npm and PyPI), @retell-ai/mcp-server 6.2.8, retell-client-js-sdk 3.0.2 (npm pack / pip download, extracted, never installed or run). REA 6.7.0 `analyze-javascript-application` ran on the web client SDK only.
- About 100 requests at roughly 1 per 1.2 to 1.5 s against limits of 30 per 10 s (list routes) and 100 per 10 s (others). No login automation, no token or key printed (a grep of every saved file for the key value found nothing).
- No call, web call, chat, batch, number purchase or import, knowledge base, voice clone, playground completion, simulation run or other billable action. The $10 trial credit cannot be read with an API key, so "no spend" rests on the rate card (RAP-52).
- Created and read back: one LLM engine, two agents (one deleted at once), agent v0 published and v1 draft, one conversation flow (deleted), one test-case definition (deleted), six synthetic contacts (deleted). One synthetic agent and engine are left on purpose (risk node in the inbox).
- Sibling teardown (public phase) at research/2026-10-20/teardown/retell/ was extended, not repeated. Grades: observed = we called the API or read the package; inferred = reasoned from cited observation; unknown = not determinable here.

## 1. What the API tells us that the public pages did not

1. The API and SDK are one surface. TypeScript SDK 6.2.8 has 109 method+path operations; the live OpenAPI (revision 2026-10-19-becf7f8, sha-identical to the public-phase copy) has the same 109. No hidden routes (RAP-03). The server is not perfectly in step with the spec: the live validator still lists language "multi" which the 6.2.8 changelog says was removed (RAP-09).
2. Two documented routes are not callable with an API key: upload-contact-import-file and get-contact-import return 401 "Unauthorized: Invalid JWT". create-contact-import validates but needs an upload id only the upload route mints. CSV import with column mapping is dashboard-only in practice (RAP-01, RAP-02).
3. There is no route for billing, balance, usage, spend cap, members, workspaces, aggregate analytics, batch list/get/cancel, or export creation (RAP-06, RAP-38, RAP-39).
4. API-created and dashboard-created agents differ. The dashboard-seeded default agent has handbook_config {ai_disclosure:true, default_personality:true}, interruption_sensitivity 0.9, voicemail action hangup, tags prod and staging. An agent created with only response_engine and voice_id has no handbook_config, no timezone, language en-US, empty PII categories (RAP-19). The docs promise AI Disclosure When Asked on by default; that is true only on the dashboard path. Inferred: API-built agents run without the preset unless the caller sets it. Not tested on a call.
5. CRM contact create does no Indian-number handling (RAP-35): 9000000001 became +19000000001; 09000000003 and 12345 stored verbatim; +919000000003 and 09000000003 coexisted; only an identical string was refused as a duplicate.
6. "Platform Voices" look like re-listed third-party voices (RAP-33, inferred from preview file names only).
7. Real mid-call control plane: update-live-call can inject context and force a regenerate (RAP-43).
8. The org-level default contact-memory prompt text is readable at GET /get-crm-config (RAP-31).
9. The web client SDK 3.0.2 signals through api.retellai.com/webrtc-proxy/<call_id>/v1/webrtc/sessions with identity "client", then sends media straight to the gateway address in the SDP answer (RAP-46).

## 2. Data model and object graph

```
org (Vyakti)
 |- agent (voice) ----------------+- response_engine -> retell-llm {llm_id, version}
 |    versions v0..vn (+tags)     |                  -> conversation-flow {id, version}
 |    assigned_tags: prod|staging |                  -> custom-llm (llm_websocket_url)
 |- chat-agent (same engines)     '- agent and engine are versioned TOGETHER
 |- phone-number {type retell-twilio|retell-telnyx|custom, inbound/outbound/SMS agent lists (weights sum 1),
 |                inbound_webhook_url, fallback_number, allowed_in/outbound_country_list}
 |- call {phone|web} / chat   (agent_id+version+frozen tag, cost, latency, analysis, recordings)
 |- batch-call (create only) -> tasks[] -> calls (read via list-calls batch_call_id)
 |- contact (CRM; phone key, memory text, custom_fields, tags, do_not_call) + crm-config + sync jobs
 |- knowledge-base, app (integration connection), mcp tool server, asset, voice (clone/community)
 |- test-case-definition -> batch-test -> test-run ; export-request (list only) ; concurrency
 '- (not in API) workspace, member, billing, campaign, DNC list, consent, calling policy
```
Evidence: RAP-12 to RAP-17, derived/endpoint-matrix.csv.

Versioning (observed, RAP-13): publish-agent-version freezes in place. PATCH /update-agent on a published version returns 422 "Cannot update published agent other than version title". create-agent-version(base_version) returns a draft (base_version recorded) and the engine is cloned with it (agent v1 pointed at llm v1; get-retell-llm then returned version 1). PATCH ?version=1 edits the draft. Editing never publishes. Calls freeze the agent tag used.

Conversation flow (RAP-14, RAP-15): 15 node types (conversation, subagent, end, function, code, transfer_call, press_digit, branch, sms, extract_dynamic_variables, agent_swap, mcp, component, bridge_transfer, cancel_transfer). Edges carry prompt or equation conditions. Global nodes have condition, cool_down, go_back_conditions. Per-node overrides: stt_mode, boosted_keywords, voice_speed, responsiveness, interruption_sensitivity, reminders, model_choice, skippable (skip when already answered in conversation or saved contact memory), finetune examples. The server filled skippable:false and kb_config {top_k 3, filter_score 0.6}.

Tools (RAP-16): end_call, transfer_call (cold, warm, agentic warm), agent_swap (mid-call hand-off with keep_current_voice/language and its own webhook and analysis settings), press_digit, send_sms, custom HTTP (url, method, headers, query_params, timeout_ms, max_retry, args_at_root, response_variables, speak during/after), code (JavaScript), extract_dynamic_variable, bridge_transfer, cancel_transfer, mcp, integration_app. pre_session_tools (about 1 min, before first message) and post_session_tools (5 min, after analysis) run as a dependency graph (RAP-17).

## 3. Endpoint and SDK surface (109 operations; full table in derived/endpoint-matrix.csv)

| Group | Operations (what comes back) | Executed here |
|---|---|---|
| Identity and limits | get-api-key-info {org_id, org_name, api_key_name}; get-concurrency {base 20, limit 20, purchased 0, purchase limit 180, burst enabled, burst limit 60, reserved_inbound} | yes |
| Agents | create/get/update/delete, v2/list-agents (POST, filters), list/create/publish/delete versions, repair-agent | create, get, update (422 and 200), list, versions, publish, delete |
| Engines | retell-llm CRUD + list; conversation-flow and component CRUD + list | LLM create/get/list; flow create/list/delete |
| Calls | v2/create-phone-call, v3/create-web-call, v2/register-phone-call, get-call, v3/list-calls, update-call, delete-call, stop-call, listen-live, take-over, update-live-call, rerun-call-analysis | list-calls only (empty) |
| Batch | create-batch-call (only) | no (billable) |
| Chat | create/get/list/end/update chat, create-chat-completion, create-sms-chat, chat-agent CRUD | list only |
| Numbers | create (US/CA), import (BYO SIP), get/list/update/delete | list (empty) |
| Voices | list-voices (300), get-voice, search-community-voice, add-community-voice, clone-voice | list, get, 5 searches |
| Knowledge base | create/get/list/delete, add and delete sources | list (empty); creation avoided: KB beyond 10 free is $8/month |
| Contacts/CRM | create/get/get-by-phone/update/delete/list, list-contact-conversations, import (upload, create, status), get-crm-config/schema, update-crm-config, run-sync-job, status, backfill-contact-analysis-data | create/get/delete/list; config read |
| Apps/MCP | create/get/update/delete/list app, usages, test-auth, tool schema, get-mcp-tools | list (empty) |
| Testing | test-case-definition CRUD, create-batch-test, get/list batch tests, get/list runs, agent-playground-completion | definition create/list/delete; runs avoided (billed) |
| Assets/exports | create-asset (image or audio, 10 MB, 210 s), list-export-requests | list (empty) |

Auth sweep (RAP-01): all 38 GET operations called with invalid probe ids: 36 answer to the API key (200, 400 missing query, or 404), 2 return 401 Invalid JWT. Rate limits seen in headers: ratelimit-policy 100;w=10 and 30;w=10 for lists (RAP-04). MCP server: two tools, search_docs and execute (TypeScript run against the SDK in a sandbox) (RAP-07). SDK and spec are generated by Stainless from one backend spec; the changelog shows API changes on 10-08, 10-09, 10-13, 10-15, 10-17 (RAP-08).

## 4. Config knobs (RAP-18 to RAP-30)

Voice and turn-taking, all accepted in one create call: voice_id, voice_model (20 values across ElevenLabs, Cartesia, OpenAI, MiniMax, Fish, Inworld; mismatch gives a clear 400), voice_speed 0.5-2, voice_temperature 0-2, volume 0-2, enable_dynamic_voice_speed, enable_backchannel with backchannel_frequency 0-1 and backchannel_words, responsiveness 0-1, interruption_sensitivity 0-1, enable_dynamic_responsiveness, reminder_trigger_ms and reminder_max_count, begin_message_delay_ms 0-5000, end_call_after_silence_ms (min 10 s), max_call_duration_ms (1 min to 2 h, enforced), ring_duration_ms 5-300 s, ambient_sound (6 presets) with volume, denoising_mode (3) with enhancement level, stt_mode fast|accurate|custom (custom_stt_config provider azure|deepgram|soniox|assemblyai|muse plus endpointing_ms), DTMF options, fallback_voice_ids (cross-provider TTS failover), expressive mode with emotion tags and custom prompt, boosted_keywords (accept {{variables}}), pronunciation_dictionary (alphabet ipa|cmu|pinyin|jyutping only).

Brain: 32 cascading models (OpenAI gpt-4.1 to gpt-6.1-sol, Claude 4.5-haiku to 5.5-opus, Gemini 3.0-flash to gemini-4-argon) or 6 gpt-realtime speech-to-speech; model_temperature; model_high_priority; model_ultrafast (gpt-6.1-sol only). No open-weight or Indian-lab model.

Personality: Agent Handbook presets as booleans (ai_disclosure, default_personality, conversational_personality, natural_filler_words, high_empathy, echo_verification, nato_phonetic_alphabet, speech_normalization, scope_boundaries, smart_matching); fixed text, token cost added to every turn.

Safety: guardrail_config (input: platform_integrity_jailbreaking; output: harassment, self_harm, sexual_exploitation, violence, defense_and_national_security, illicit_and_harmful_activity, gambling, regulated_professional_advice, child_safety_and_exploitation); enable_dnc_detection (fixed confirm script); voicemail_option (prompt | static_text | hangup | bridge_transfer, detection_prompt); ivr_option (hangup only); call_screening_option.

Data: data_storage_setting (everything | everything_except_pii | basic_attributes_only), retention 1-730 days, signed URLs (24 h), pii_config (14 categories, post_call only; no Indian IDs).

Memory: contact_memory_config {enable_read, enable_update}; the default API-created agent reads and does not update. Default update prompt (observed text): rewrite one running brief, keep only what changes what an agent says or does, drop resolved items, no sentiment or personality guess, plain prose, under 2000 characters, treat transcript as data (RAP-31, RAP-32). It is memory-as-summary, not retrieval over history.

Language: agent-level locale or array (["hi-IN","en-IN"] accepted); 63 locales; India: en-IN, hi-IN, kn-IN, mr-IN, ta-IN, ur-IN; te-IN rejected (RAP-27).

Validation behaviour: unknown request fields silently ignored; two error shapes; bad voice_id gives a bare 404 (RAP-11).

## 5. Call lifecycle and state machine (from typed spec; no call placed)

```
create-phone-call / batch task / inbound
   -> registered --(5 min, phone)--> error: registered_call_timeout
   -> not_connected (dial_busy, dial_no_answer, dial_failed, invalid_destination, user_declined,
                     marked_as_spam, network_blocked, telephony_provider_*, sip_routing_error)
   -> ongoing --+- ended: user_hangup | agent_hangup | user_requested_dnc | user_requested_callback
                |          | call_transfer | transfer_bridged/cancelled | voicemail_reached | ivr_reached
                |          | inactivity | max_duration_reached | no_concurrency_fallback | manual_stopped | call_take_over
                '- error: concurrency_limit_reached | no_valid_payment | credit_exhausted | budget_reached
                          | scam_detected | error_llm_websocket_* | error_no_audio_received | error_asr
                          | error_retell | error_user_not_joined | error_unknown
   -> post-call analysis (separate model, rerunnable) -> call_analyzed
```
call_status has 5 values, disconnection_reason 39 (RAP-36). These are engineering codes; the business outcome is a custom post-call field (string/enum/boolean/number with conditional_prompt). The call object (RAP-37) carries transcript variants (plain, word-timestamped, with tool calls, scrubbed), recordings (plain, multichannel, scrubbed), public_log_url, call_analysis {call_successful, call_summary, in_voicemail, user_sentiment, custom_analysis_data}, call_cost, latency {asr, e2e, knowledge_base, llm, llm_websocket_network_rtt, s2s, tts}, llm_token_usage, collected_dynamic_variables, metadata, telephony_identifier {twilio_call_sid only}.

Outbound create (RAP-40): from_number, to_number (Retell-purchased numbers: US destinations only per SDK text), override_agent_id/version, agent_override (agent | retell_llm | conversation_flow subsets), retell_llm_dynamic_variables, metadata, custom_sip_headers, ignore_e164_validation, idempotency_key (one hour), honor_internal_dnc (default false). Batch (RAP-41): from_number, tasks[] with per-task overrides, call_time_window {windows[], day[], timezone default America/Los_Angeles; no cross-midnight}, reserved_concurrency, trigger_timestamp; response has batch_call_id, scheduled_timestamp, total_task_count only: no status, retry or pacing field.

Live control (RAP-43): update-live-call {call_control: {additional_context -> transcript role "injected", trigger_response}, fields_to_override: {metadata, override_dynamic_variables, data_storage_setting}}; listen-live returns a subscribe-only JWT, participant_id, room_name, ICE servers (transport livekit or gateway); take-over upgrades the listener and permanently stops the agent (409 during a PCI session).

## 6. Webhook and event payloads (RAP-44, RAP-45, RAP-47)

- Per-agent webhook_events (default call_started, call_ended, call_analyzed): call_started, call_ended, call_analyzed, transcript_updated, transfer_started, transfer_bridged, transfer_cancelled, transfer_ended. Chats: chat_started/ended/analyzed.
- Envelope: {"event":"call_ended","call":{...call object...}}; call_started is basic; call_ended has everything except call_analysis; call_analyzed has all; transfer events add transfer_destination and transfer_option. Not sent for calls that never connected (call_started), but call_ended and call_analyzed still fire.
- Signature header x-retell-signature = "v=<ms>,d=<hex>", d = HMAC-SHA256(rawBody + timestamp) keyed with the API key that carries the webhook badge, 5-minute tolerance (from the SDK source). 10 s timeout, up to 3 retries, single published egress IP, private and metadata addresses blocked, {{variable}} templating in the URL.
- Inbound hook is per phone number: Retell POSTs {event:"call_inbound", call_inbound:{call_id, agent_id, agent_version, from_number, to_number, custom_sip_headers}} before the call exists; the reply under call_inbound can reject or override agent, variables, metadata.
- Custom-LLM WebSocket protocol: events config, call_details, update_only, response_required, reminder_required, ping_pong; Retell keeps telephony, ASR, TTS and turn-taking, the buyer owns only the brain.
- We registered only an example.invalid URL; no delivery was observed. Payload shapes are from the typed spec and docs.

## 7. How billing is metered (RAP-51, RAP-52; rate card is in the public-phase report)

- Observed in types: call_cost.product_costs[] = {product, unit_price (cents per second), cost (cents), is_transfer_leg_cost}; total_duration_seconds; total_duration_unit_price; combined_cost (cents). Chats have chat_cost. llm_token_usage (average, num_requests, values[]) supplies the token counts that the docs use to scale billed duration for prompts over 4,000 tokens. Costs appear only after the call ends.
- Not observed: a real product list, per-second prices or the scaling, because no call was placed. Open question for the call-battery phase.
- Subscription items (numbers, KBs beyond 10 free, CPS, purchased concurrency) bill to the card monthly, usage deducts prepaid credits in real time (public docs). The balance, budget and invoices are not in the API.
- Concurrency: base 20, up to 180 purchasable, burst to 60 is on for our org (burst bills +$0.10/min for the whole call per the public rate card).

## 8. Cross-check against the public-phase teardown

- Confirmed: Indian locale list (RET-16), US defaults (RET-17), DNC flag off by default on create-phone-call (RET-43), batch has no retry or status (RET-05), US/CA numbers only (RET-45), no TRAI/DLT/NCPR objects (RET-42), webhook mechanics.
- Refined: RET-23 web SDK transport now has exact paths (webrtc-proxy, identity "client", STUN stun.l.google.com, unused "control" data channel). RET-14 object list confirmed against 109 operations.
- Corrected: RET-P03 said no disclosure control is documented. The control exists (handbook_config.ai_disclosure) and is on for the dashboard default; API-created agents lack it (RAP-19, RAP-53).
- Partially scored: RET-P04 (b) Indian 10-digit numbers are misparsed to +1, and (a) duplicates are not merged across formats, on the CRM path (RAP-54). RET-P05: window timezone default and no-cross-midnight are in the typed spec; agent timezone is normalised server-side (Asia/Kolkata came back as Asia/Calcutta) (RAP-55).
- Newly graded inference: Platform Voices are mostly re-listed MiniMax/Fish/Cartesia voices (RAP-33), so the vendor claim of in-house fine-tuned voices (RET-28) is unproven.
- Untested: P01, P02, P06 to P12 (need the dashboard or calls).

## 9. For VP's product

Match (Retell does these well and an Indian enterprise team will expect them):
1. Draft and publish with the engine cloned per version, tags (prod/staging) frozen on each call, and edits that never publish.
2. Per-call override of agent, variables and metadata, with an idempotency key on call creation.
3. A pre-answer inbound hook that can reject, reroute or add context.
4. A live control plane: inject context, interrupt and regenerate, listen, take over.
5. Typed per-product per-second cost and per-component latency on every call record.
6. Simulation tests with a simulated caller, free-text pass criteria and mocked tools, pinned to an engine version.
7. Rich per-node and per-agent turn-taking knobs (backchannel, dynamic responsiveness, per-node STT mode), and cross-provider TTS fallback.
8. agent_swap mid-call hand-off and post-call analysis with custom typed fields.

Beat (each is a gap visible in Retell's own typed API and matches the Indian complaint classes):
1. One contact object that normalises to E.164 with India as the default country, de-duplicates across number formats, and refuses or flags impossible numbers (Retell silently makes +1 numbers).
2. AI disclosure default-on on every creation path including the API, with the preset visible in the agent record.
3. DNC, consent, calling-window (09:00-21:00 category rules), DLT/header and NCPR fields as first-class objects, checked by default before an outbound call (Retell: honor_internal_dnc false by default, no India objects).
4. Business-outcome codes (agreed, call back, refused, wrong number, DND) beside the engineering disconnection reason.
5. Hindi-first voice catalogue with language tags (Retell: 6 of 300 voices Indian-accent, none labelled Hindi), Indic-script pronunciation, Indian ID types in PII scrubbing.
6. Everything a dashboard can do is also an API/MCP operation under the same auth: bulk import with mapping, export creation, batch status/cancel/retry/pacing, billing and spend caps, aggregate analytics and funnels. This is the LLM-native setup requirement; Retell's MCP can only do what the SDK can, and import and export are JWT-only or missing.
7. Per-lead calling windows, retries and attempt budgets (Retell batch has one window per batch, no retries).
8. Show the effective configuration of an agent (what will run), because a bare API agent stores almost nothing and the runtime defaults are invisible.

## 10. What still needs the dashboard (only-with-login)

Credit balance, invoices, budget, auto-recharge; workspaces, members, RBAC, SSO, KYC and Persona flow; CSV contact import (JWT-only); creating exports; aggregate analytics, dashboards, alerts, AI QA and Conductor; account-level webhook URL and the webhook-badge key; phone-number purchase and Indian SIP-trunk setup UX plus onboarding time-and-motion; the undocumented "Campaigns" object; integration OAuth and voice cloning UX; live monitoring UI; real call_cost lines and the 4,000-token scaling (need a call).

## 11. Not verified (explicit)

No call was placed, so: runtime disclosure behaviour, billed product list and scaling, real latency, Hinglish language hold, voicemail/IVR accuracy, webhook delivery and signature in practice, and batch dedupe/DNC behaviour are all untested. The preview-file-name inference about Platform Voices is not an audio or traffic fingerprint. Voice search counts are what was returned and may be capped (100, 99, 20, 6, 3). Account balance unchanged is inferred, not read.

## 12. Files

Claims: /home/user/sales-enabler/research/2026-10-20/account-phase/retell/claims.json (55: 51 observed, 4 inferred). Manifest: .../manifest.csv (218 rows with sha256). Inbox: /home/user/sales-enabler/context/inbox/account-retell.json (14 nodes, 26 edges, 1 event; validated by a dry-run merge into a copy of the graph, not merged). Raw artifacts: /home/user/sales-enabler/data/account-phase/retell/ (api-reads, api-writes with request-bodies, auth-sweep, openapi, sdk, rea, derived, imports). Scripts: .../retell/code/ and build_claims.py, build_inbox.py.

---

## Structured result (from the workflow run wf_36b25033-85c)

### Data model

Org holds: agent (voice) and chat-agent, each pointing at ONE response engine (retell-llm id+version | conversation-flow id+version | custom-LLM WebSocket). Agent and engine are versioned together (publish freezes in place; create-agent-version clones agent AND engine into a draft). phone-number holds weighted inbound/outbound/SMS agent lists plus inbound webhook and fallback number. call/chat records hang off agent+version+tag. contact (CRM: phone-keyed, memory text, custom fields, tags, do_not_call), batch-call (create only), knowledge-base, app (integration connection), mcp, test-case-definition > batch-test > test-run, asset, export-request (list only), concurrency. No campaign, DNC-list, consent, calling-policy, billing, workspace or member object in the API.

### Key findings

- API and SDK are one surface: retell-sdk 6.2.8 (npm and PyPI) has 109 operations, identical to the live OpenAPI (rev 2026-10-19-becf7f8, byte-identical to the public-phase copy). No hidden routes, unlike Vapi's web SDK. But 2 CSV-import routes (upload-contact-import-file, get-contact-import) answer 401 'Invalid JWT' to an API key, and there is no billing, balance, member, workspace, aggregate-analytics, batch status/cancel, or export-create route. A chat-driven operator cannot do those things through Retell's API or its 2-tool MCP server.
- India defaults are US-first: CRM contact create stored '9000000001' as +19000000001 with no warning, stored '09000000003' and '12345' verbatim, and let +919000000003 and 09000000003 coexist (dedupe is exact-string only). Live validator accepts 63 locales but only 6 are Indian (te-IN rejected); 6 of 300 voices have Indian accent and none is labelled Hindi; pronunciation alphabets are ipa/cmu/pinyin/jyutping only; PII categories have no Indian ID ('aadhaar' rejected).
- AI-disclosure default depends on creation path: the dashboard-seeded agent has handbook_config.ai_disclosure true; an API-created agent (response_engine + voice_id only) has NO handbook_config. The docs say new agents get AI Disclosure When Asked by default. Corrects public-phase prediction RET-P03 ('no disclosure control'): the control exists, but API-built agents do not get it unless set. Runtime behaviour untested (needs a call).
- Version model is clean and engine-coupled: publish freezes in place; PATCH on a published version returns 422; create-agent-version clones agent AND response engine into a draft; draft edits never publish; calls freeze the agent tag. Contrast Vapi where every PATCH publishes. Worth matching.
- Platform Voices look re-listed: of 21 retell-* platform voices, 15 preview files are named minimax-*, 2 fish_audio-*, 1 cartesia-*, only 3 carry no provider tag (Cartesia previews in a folder named cartesia-sonic-3.6-2026-09-08). Inference from file names only; does not prove the runtime provider, but weakens the 'self-hosted voice models' claim (RET-28).
- Control plane worth copying: update-live-call injects additional_context into a running call (transcript role 'injected') and can interrupt/regenerate; listen-live gives a subscribe-only token; take-over permanently stops the agent. Also idempotency_key on create-phone-call, per-call agent_override, a pre-answer inbound webhook that can reject/reroute, and agent_swap mid-call hand-off.
- Metering shape is observed from types, not from a call: call_cost.product_costs[] = {product, unit_price in cents per second, cost in cents}, total_duration_seconds, combined_cost; llm_token_usage {average, num_requests, values[]} feeds the documented 4,000-token billed-duration scaling. No real product list or scaling seen because no call was placed.
- Compliance primitives are thin and default-off: honor_internal_dnc defaults false on create-phone-call; no DLT/NCPR/consent/TRAI-window object in 109 ops; batch call has only one call_time_window (default America/Los_Angeles, no cross-midnight), reserved_concurrency, trigger_timestamp, and no retry/pacing/status field. Phone purchase is country_code US|CA only; import-phone-number defaults ignore_e164_validation true.
- Brain menu is wide but India-agnostic: 32 cascading LLMs (OpenAI gpt-4.1..gpt-6.1-sol, Claude 4.5-haiku..5.5-opus, Gemini 3.0..gemini-4-argon) + 6 gpt-realtime S2S, with high_priority and ultrafast tiers; STT custom providers azure/deepgram/soniox/assemblyai/muse (no Indian vendor); TTS models from ElevenLabs, Cartesia, OpenAI, MiniMax, Fish, Inworld. Server validator still accepts language 'multi' that the 6.2.8 changelog says was removed (spec/server drift); API surface changes every 2-3 days in October.
- Validation behaviour for our own product design: unknown request fields are silently ignored (201); errors have two shapes ({error_message} schema vs {status,message} business rule); a bad voice_id gives a bare 404; max_call_duration enforced 1 min..2 h; voice_model/provider mismatch returns a clear 400.

### Only learnable with a dashboard login

- Credit balance, invoices, monthly budget, auto-recharge, subscription items (no billing route in the 109 ops)
- Workspaces, members, roles (RBAC), SSO, KYC status and Persona flow
- Contact CSV import (upload and status routes answer 401 Invalid JWT with an API key)
- Creating a call/chat history export (API can only list export requests)
- Aggregate analytics, dashboards, alerts (14 metrics), AI QA cohorts and Conductor copilot
- Account-level webhook URL and the key 'webhook badge' that signs webhooks
- Phone-number purchase and the Indian SIP-trunk setup UX, plus the time-and-motion and error-message quality of onboarding
- Whatever the undocumented 'Campaigns' object does (no route in the API)
- Integration OAuth (HubSpot, Salesforce, Zendesk, Cal.com) and voice cloning UX
- Live monitoring UI and the dashboard Agent Handbook ordering and defaults beyond what the API echoes
- Real call_cost lines and the 4,000-token billed-duration scaling (need a placed call, call-battery phase)

### Run facts

- API key worked: True
- Endpoints documented: 109
- REA used: True
- Spend: None observed. About 100 API requests: reads plus free CRUD (LLM engine, agents, versions, one conversation flow, one test definition, six contacts, voice searches). No call, web call, chat, batch, number purchase or import, knowledge base, voice clone, playground completion or test run. The $10 trial credit balance cannot be read with an API key, so "unchanged" is inferred from the rate card, not observed. Cleanup: the stray agent, flow, test definition and all contacts were deleted. One synthetic agent and its engine (VP-SYNTHETIC-teardown-renewal-hinglish, llm_38f8..., v0 published, v1 draft) remain on purpose.

### Files written by the lane

- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/claims.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/manifest.csv`
- `/home/user/sales-enabler/context/inbox/account-retell.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/build_claims.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/build_inbox.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/code/rt.sh`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/code/build_manifest.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/code/sdkops.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/code/cmpops.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/code/tsprops2.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/retell/code/matrix.py`
- `/home/user/sales-enabler/data/account-phase/retell/derived/endpoint-matrix.csv`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-vs-openapi.json`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-AgentResponse-props.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-LlmResponse-props.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-ConversationFlowResponse-props.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-flow-nodes-props.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-PhoneCallResponse-props.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-call-subobjects.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-create-phone-call-params.txt`
- `/home/user/sales-enabler/data/account-phase/retell/derived/sdk-batch-phone.txt`
- `/home/user/sales-enabler/data/account-phase/retell/api-reads/`
- `/home/user/sales-enabler/data/account-phase/retell/api-writes/`
- `/home/user/sales-enabler/data/account-phase/retell/auth-sweep/summary.tsv`
- `/home/user/sales-enabler/data/account-phase/retell/openapi/openapi.yaml`
- `/home/user/sales-enabler/data/account-phase/retell/sdk/`
- `/home/user/sales-enabler/data/account-phase/retell/rea/client-js-analyze.json.gz`
