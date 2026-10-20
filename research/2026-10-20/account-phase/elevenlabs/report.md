ELEVENLABS AUTHORIZED-SURFACE REPORT (2026-10-20). Method: about 110 authorized requests with our own free-tier xi-api-key at about 1 per second; the live OpenAPI (420 operations, 64 exercised); six published packages read without installing (JS SDK 2.74.0, Python SDK 2.74.1, @elevenlabs/client 1.29.0, @elevenlabs/types 0.25.0, @elevenlabs/react 1.19.0, CLI 1.7.0); one REA run on the client dist. No call, number, batch, simulation, test run, webhook or WebSocket session. No credits spent (character_count 0/10,000 before and after). Synthetic probes were created, read back and deleted. report.md was NOT written because the subagent contract forbids report files, so this text is the report; the structured files are claims.json (54 claims), manifest.csv (3,252 files), predictions-scored.json, and context/inbox/account-elevenlabs.json (13 nodes, 27 edges; dry-run merged in a scratch copy, accepted).

1. DATA MODEL AND OBJECT GRAPH. Agent = {conversation_config (asr, turn, tts, conversation, language_presets, vad, realtime_model, agent.prompt), platform_settings (evaluation, data_collection/analysis_items, overrides, widget, guardrails, privacy, call_limits, queueing, analysis_llm, topic_discovery, sentiment_analysis, simulation_library, alerting), workflow graph, tags, access_permissions (65 strings)}. Agent -> branches -> immutable versions (every PATCH, even a no-op, commits a version). Workspace objects referenced by id: tools (webhook, client; system tools inline), knowledge-base docs (+RAG index), MCP servers, secrets, environment variables and environments, pronunciation dictionaries, tests, tags, triage tickets, speech engines. Conversation records reference agent, branch, version, user_id (a string, not a contact object), tag_ids; batch calls reference agent, branch, environment, phone number. Create returns only ids; config needs a second GET. 313 non-widget leaf settings read back from one new agent.

2. SURFACE. 420 operations in 322 paths; 200 under /v1/convai or /v1/speech-engine. Whole convai read surface and most writes work on a free key (agents, branches, merge proposals, tools, tests, tags, KB, env vars). Refused: user memory (403 feature_not_available), key management (401, needs dashboard session). Not called on purpose: 326 dashboard-bundle routes absent from the public spec (campaigns, automations, memories, templates), because this phase is documented routes only. Phone numbers are import-only (no buy route). Speech Engine = bring-your-own-brain over a WebSocket. SDKs are Fern-generated (same modules in JS and Python: agents, batch_calls, conversations, tools, tests, sip_trunk, twilio, exotel, whatsapp, llm_usage, realtime...). CLI is a Rust binary behind an npm launcher with agents-as-code push/pull and residency switch (global, us, eu, in, sg). Python SDK has an on-prem enclave mode.

3. LIFECYCLE / STATE MACHINE. Conversation status initiated -> in-progress -> processing (analysis) -> done|failed; call_result answered|voicemail|busy|no_answer|failed; batch pending -> in_progress -> completed|failed|cancelled with recipient states incl. dispatched, initiated, voicemail; call_initiation_failure is a separate webhook. Transitions are read from schema and docs, not observed live (no call). Workflow graph nodes: start, end, phone_number transfer, override_agent subagent, standalone_agent transfer, tool; edges conditional on unconditional|llm|result|expression.

4. WEBHOOK AND EVENT SHAPES. Post-call: post_call_transcription (full conversation record + event_timestamp), post_call_audio (base64 mp3), call_initiation_failure (reason + Twilio body or SIP status); HMAC ElevenLabs-Signature; auto-disable after 10+ consecutive failures. Pre-call hook for inbound Twilio: POST {caller_id, agent_id, called_number, call_sid, conversation_id} returns dynamic variables and overrides. WebSocket: about 40 typed events (contextual_update, user_activity, tentative_user_transcript, conversation_history + persistent_session_token for resume, context_usage, ping_ms, vad_score, guardrail_triggered, internal_turn_probability, 26 error types).

5. BILLING METERING. Each conversation record carries charging: is_burst, tier, dev_discount, free minutes and free LLM dollars consumed, platform_usage/price/charge, llm_usage split into irreversible_generation vs initiated_generation (speculative generations metered apart, inference), llm_price/charge, call_charge, tts_usage (characters, audio seconds, per-voice), asr_usage, analysis charging, voice_surcharge_charge; cost in integer credits and cost_fiat. Free calculator prices 111 LLMs per minute at 5.27 messages per minute: gemini-2.5-flash USD 0.0054, server-default deepseek-v41-flash USD 0.0130 (2.4x; about INR 1.23 vs 0.51 at FX 95), gpt-4 USD 0.48. Burst on by default (2x price, 3x concurrency, deprioritised). Voice owners are paid per use (voice_rewards).

6. CONFIG KNOBS (full list in derived/agent-config-knobs.csv). Voice: model, voice, multi-voice, expressive_mode (auto-flips off on flash v2.5), stability, speed, similarity, audio tags, pronunciation dictionaries, phoneme tags, latency tier. Turn: turn_eagerness patient|normal|eager, turn_timeout 1-300, speculative_turn, turn_model v2|v3, mode turn|silence, interruption_ignore_terms per language, soft-timeout fillers (LLM-generated option), noisy-environment detection, background voice detection. Tools: pre-tool speech, sounds, interruption mode, assignments, mocks, execution mode, mTLS. Memory: privacy.user_memory {enabled, scale minimal|balanced|maximum} gated by workspace flag. Overrides: 23 fields overridable per call, off by default per field.

7. WHAT THE API REVEALED THAT PUBLIC PAGES DID NOT. (a) New-agent defaults differ from schema defaults (LLM, speculative_turn, bursting). (b) Unknown properties are silently ignored. (c) hinglish_mode flag exists in the API, not in the 258 docs pages. (d) Default voice is American English and is accepted on a Hindi agent. (e) Memory is built and gated (upgrades the public-phase 'in development'). (f) Model deprecation fallback (warning 90d, 25% fallback at 60d, complete at 20d) can reroute an agent's LLM silently. (g) No env-var delete; agent delete leaves tool/KB dependencies until force. (h) 4 hidden system-tool slots (update_state, memory_entry_search, run_subagent, flag_issue_for_review). (i) Control plane is us-central1.

8. FOR VP'S PRODUCT. Match (floor): version per write with branch/merge/traffic split; three test types incl. simulated personas; post-call criteria and typed data fields; per-turn timers and call-result enum; fine-grained permissions; config-as-code CLI; signed webhooks plus pre-call personalisation hook; typed event taxonomy including mid-call context injection. Beat: India operator layer absent from batch/call objects (window, DND scrub, consent, suppression, India failure reason); safe defaults (reject unknown fields, voice-language cross-check, model-in-effect recorded per call, no silent reroute, retention/redaction chosen at onboarding, burst opt-in); first-class contact object; clean deletion; a measured, documented Hinglish setting instead of a boolean. Watch: memory arriving from the leader; Speech Engine lets anyone put a brain on its voices (open question whether VP should offer one).

9. PREDICTIONS (pre-registered in the public phase): 1 hit, 3 partially supported, 8 not testable without a call or upload.

---

## Structured result (from the workflow run wf_36b25033-85c)

### Data model

Agent {conversation_config{asr,turn,tts,conversation,language_presets,vad,realtime_model,agent.prompt}, platform_settings{evaluation,data_collection,analysis_items,overrides,widget,guardrails,privacy,call_limits,queueing,analysis_llm,topic_discovery,sentiment_analysis,simulation_library,alerting}, workflow{nodes,edges}, tags, access_permissions[65]} -> Branch -> immutable Version (parents, merged_from, rebased_from); MergeProposal(source,target,reviewers,triage ticket); Deployment(percentage by branch). Workspace objects by id: Tool(webhook|client; system tools inline), KnowledgeBase doc(+RAG index), MCPServer, Secret, EnvironmentVariable(+Environment), PronunciationDictionary, Test(llm|tool|simulation)+Folder+Invocation, Tag, TriageTicket, SpeechEngine, Webhook, PhoneNumber(import only), BatchCall(recipients), WhatsApp account. Conversation{status, metadata{charging, phone_call, batch_call.campaign, features_usage}, transcript[turn metrics, tool_calls], analysis{criteria, data_collection}, tag_ids, otlp_traces} keyed by agent_id/branch_id/version_id/user_id string (no contact object).

### Key findings

- Our free-tier ElevenLabs key works on the whole documented /v1/convai surface: reads, plus creating and deleting agents, branches, merge proposals, tools, tests, tags and KB docs. About 110 requests at 1/s, no 429, no rate-limit headers, no credits spent (character_count 0 before and after).
- Server defaults differ from the OpenAPI defaults: a new agent gets LLM deepseek-v41-flash (schema says gemini-2.5-flash), speculative_turn true (schema false), bursting on (excess calls at 2x price), a 180 s queue, and a US-English default voice. The default LLM costs 2.4x gemini-2.5-flash per the free calculator (USD 0.0130 vs 0.0054 per minute, about INR 1.23 vs 0.51).
- Unknown fields are silently ignored (HTTP 200) and still commit a new version, so config typos vanish. Every PATCH is an immutable version with parent links; Main is 'protected' but an admin can still PATCH it.
- hinglish_mode is a boolean on the agent object that exists in the API but in none of 258 saved docs pages; the server persists it even on a language=en agent. A Hindi agent can keep the default American voice (Eric, verified for de/en/es/fr/pt/sk only) without any validation error.
- User memory is built but gated by a workspace flag (403 'User memories are not available for this workspace'); knob scale is minimal|balanced|maximum, plus memory_entry_search tool slot and view/edit memories permissions. Upgrades public-phase 'in development' to 'present, flag-gated'.
- Batch calling has no calling-window, DND/NCPR, consent, suppression, dedupe or retry-policy field (only scheduled_time_unix and timezone); the hidden campaigns routes were not probed because they are undocumented. Phone numbers are import-only, no buy route.
- LLM catalogue is 111 models, 43 deprecated or in warning, with a built-in fallback policy (warning 90 d, 25% fallback from 60 d, complete at 20 d) that can silently reroute an agent's model; flagged as a risk for VP test integrity.
- Billing is metered per conversation (platform, LLM split into initiated vs irreversible generations, call, TTS, ASR, analysis, voice surcharge, is_burst); voice owners are paid per use via voice_rewards.
- Wire protocol read from @elevenlabs/types 0.25.0: about 40 events including contextual_update (mid-call context push), user_activity, conversation_history resume token, context_usage and 26 error types; Speech Engine lets a customer bring its own brain over a WebSocket.
- Cleanup: all probe objects deleted except one environment variable (no DELETE route); agent deletion leaves tool and KB dependencies until force=true. Pre-existing agent '[Eval] Synthetic Clinic Demo' was only read.

### Only learnable with a dashboard login

- Dashboard UX itself: onboarding flow, agent builder, workflow canvas, widget customisation, Architect, Spotlight, real-time monitoring, alerts, experiments UI
- API key management, seats and invites, SSO, audit logs, invoices, plan changes and credit purchase (key listing returned 401 with an API key)
- Unpublished product areas seen only in the signed-out bundle: outbound campaigns, automations, task agents, templates gallery, company-oracle, memories (undocumented routes not probed)
- Whether the outbound campaigns product or user memory is enabled on a paid workspace
- Phone-number import flows (Twilio, Exotel Voicebot applet gating, SIP trunk) and batch-calling CSV upload validation (both need credentials or place calls)
- Enterprise India residency environment (separate workspace and key)
- Live behaviour needing a call or billed minutes: hinglish_mode effect, Hindi on default voice, handset reply gap, speculative_turn cost, webhook delivery and retries, silent LLM fallback, API rate limits

### Run facts

- API key worked: True
- Endpoints documented: 420
- REA used: True
- Spend: $0. Free-tier workspace; character_count 0 of 10,000 before and after; no calls, numbers, batches, simulations, test runs or webhooks; the LLM usage calculator is free. Sarvam keys were not touched (not part of this lane's work).

### Files written by the lane

- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/claims.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/manifest.csv`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/predictions-scored.json`
- `/home/user/sales-enabler/context/inbox/account-elevenlabs.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/code/el_probe.sh`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/code/build_claims.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/code/build_inbox.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/code/build_manifest.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/code/derive_knobs.py`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/elevenlabs/code/derive_surface.py`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/derived/agent-config-knobs.csv`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/derived/endpoint-surface.csv`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/derived/llm-cost-4k.csv`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/derived/llm-list-summary.json`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/api-reads`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/api-writes`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/cleanup`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/openapi/openapi-live.json`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/sdk`
- `/home/user/sales-enabler/data/account-phase/elevenlabs/rea/client-sdk-dist.analysis.json`
