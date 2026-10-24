# Bolna, authorized-surface teardown (open-source code + our own API key), 2026-10-20

Lane `bolna`, account phase. This builds on the public phase (`research/2026-10-20/teardown/bolna/`: 66 claims and 35 frozen blind inferences) and on l4a §4 (code read at 8e300d9). Claims are graded in `claims.json` (ACB-01..57). Raw artifacts and their hashes are in `manifest.csv` (598 files).

## What was done, and what was not

**(A) Code.** I read Bolna's open-source engine at HEAD `bc59921` (2026-10-20 14:43 IST, package 0.10.306, MIT).
- Size: 120 source files and 43,962 Python lines, plus 173 test files.
- Location: a shallow, read-only clone at `data/account-phase/bolna/code/`.
- Read directly: the orchestration loop, telephony adapters, provider registry, turn-taking, config schema and call lifecycle.
- Mapped with grep: everything else.
- The 9,772-line `task_manager.py` was read by section.

**(B) API, on our own account and key.**
- 57 requests between 18:49 and 18:55 UTC, far below the documented 1,000/min.
- Reads: every list endpoint, the TTS voice catalogue and the workflow node catalogue.
- Writes, all on one synthetic agent: create, read back (v1 and v2), PATCH, PUT, delete.
- One unknown-field validation probe accidentally created a second agent. It was read back and deleted 13 s later.
- One invalid-voice probe was rejected.
- Responses are redacted in `data/account-phase/bolna/api-live/`; the request log is `_requests.csv`.

**OpenAPI.** The spec was rebuilt from the 128 OpenAPI fragments embedded in the public docs pages: 96 paths, 183 schemas, 0 conflicts. The standalone `openapi.yml` still returns 404. The result is `data/account-phase/bolna/openapi/bolna-openapi-merged.json`, with `endpoints.csv` alongside.

**SDK.** I unpacked the public npm SDK `@bolna/web-call@3.0.1` without installing it.

**Not done:**
- no call placed;
- no number searched or bought;
- no batch, workflow or campaign created;
- no `dispositions/test` run, because it bills LLM tokens;
- no dashboard login;
- no undocumented endpoint called;
- REA was not needed.

**Spend: 0.** The wallet read 500.0 (cents) before and after. Concurrency is 2 and the account ends with 0 agents.

**Earlier run.** An earlier, interrupted run of this lane (18:24 to 18:30 UTC) left `data/account-phase/bolna/api/`. It had created and deleted agent cccdacc0. Those files are kept for provenance and listed in the manifest, but nothing in this report relies on them.

## 1. Headline findings

1. **Calibration.** I scored the 20 checkable, uncontaminated blind inferences against the code.
   - Result: 14 TRUE, 6 PARTLY, 0 FALSE. The hit rate is 0.85 and the Brier score is 0.086, against a mean stated confidence of 0.69 (`blind-scoring.json`). So the method gets the architecture right and was under-confident about it.
   - What it missed: every timing constant and policy that decides how a call feels.
   - For closed vendors, trust architecture inferred from outside at about 85%, and measure turn-taking in the call battery.
2. **Reply-gap floor of about 1.4 s (inferred from the code and our stored API defaults; not yet measured on a call).**
   - The STT waits for 500 ms of silence before it emits a final (endpointing 500).
   - From the third history entry on, the engine then holds the reply's audio until 900 ms have passed since that final (`incremental_delay` 900, the WAIT state in `InterruptionManager.get_audio_send_status`).
   - LLM and TTS run inside the hold. Transport and 100 to 200 ms of input frame buffering add on top.
   - This is a likely code-level cause of the reported 1.5 to 2.0 s perceived latency.
3. **Short replies are discarded by design.**
   - While the agent is speaking, a final transcript of N words or fewer (default N=1) is thrown away as a "false interruption" unless it exactly matches an entry on the stop list. That list (`ACCIDENTAL_INTERRUPTION_PHRASES`) is English-only.
   - So "nahi", "haan", "ruko" and "bas" never reach the LLM.
   - Everything said while the welcome message plays is also dropped; it is used only as voicemail evidence.
   - A Hindi agent's check-in defaults to the English "Hey, are you still there".
4. **Language switching is the most sophisticated part of the stack.**
   - One pre-warmed STT socket is kept per language, held open with silence keepalives every 4 s.
   - An "unbiased" Sarvam saaras:v3 language-ID stream runs beside the language-locked live recogniser.
   - A dedicated Switch LLM judges the matrix language under about 15 hand-written Indic rules. The default judge is claude-haiku-4-5, and its prompt is padded past Haiku's 4,096-token minimum for prompt caching.
   - The pool then swaps STT, TTS and prompt together, and plays a pre-rendered handoff clip.
   - Its limit: this swaps the whole stack, so it is not one code-mixed register.
5. **An LLM judge is written into every agent automatically.**
   - About 5 s and about 25 s after we created the agent, Bolna generated two dispositions, "Call Success" and "Call Completion".
   - Both are gpt-4.1-mini judges rewritten from our own prompt. They are Hinglish-aware: "dekhta hoon" and "baad mein" count as not-success.
   - They were free (the wallet did not move), they are hidden from the dispositions list endpoints, and they are deleted with the agent.
   - So Bolna already ships LLM-native outcome analytics by default.
6. **The API docs and the server disagree.**

   | Setting | Docs say | Server stored |
   |---|---|---|
   | Words to interrupt | 2 | 1 |
   | `incremental_delay` | 400 ms | 900 ms |
   | `hangup_after_silence` | 10 s | 20 s |
   | TTS `stream` | true | false |
   | TTS `buffer_size` | 250 | 40 |

   - The stored values are the open-source Pydantic defaults.
   - An unknown field was accepted (201) and silently dropped. This contradicts BOL-15 and BI-35.
   - The documented `llm_agent.routes` was accepted on PUT and not persisted.
   - The executions filter shows an undocumented `prepared` status.
7. **The data model is call-centric, with two overlapping outbound systems.**
   - The core record is the execution, which is one call. There is no contact, lead, consent or memory object.
   - Batches (the older system) report only valid and total counts.
   - Workflow campaigns (the newer system) validate row by row with codes (invalid_phone, missing_required_value, duplicate_reference_id, empty_row, invalid_field_type), allow corrective re-upload and default bare numbers to +91.
   - The only state that survives across calls is a workflow execution's `state.*`, scoped to one journey.
8. **Only the LLM fails over.**
   - Azure OpenAI runs on a provisioned deployment. A turn is re-issued on a pay-as-you-go overflow deployment on 429 or 5xx, or when the stream drops before the first token. Retries are off when an overflow exists, and overflow turns are metered separately.
   - STT and TTS only reconnect. The provider circuit breaker runs in shadow mode. Telephony is one provider per agent.
9. **Graph agents add a serial routing call per turn.**
   - Before each reply, a routing LLM runs as a forced tool call, unless a deterministic, event or unconditional edge matches.
   - Only then does the node's reply stream.
   - A separate fast routing provider (for example Groq) exists to cut this hop.
10. **Barge-in recovery is well engineered.**
    - After an interruption, the assistant's history is trimmed to what the caller actually heard, using mark/checkpoint echoes plus a proportional estimate.
    - A user turn that lands while the last reply is still unheard is merged with the previous one and regenerated, with a 0.7 s settle window.
    - A duplicate regenerated reply (similarity 0.9) is blocked.
    - Barge-in is deferred while a tool call is in flight.

## 2. Calibration (pre-registered rule)

| Set | n | TRUE / PARTLY / FALSE | Hit rate | Brier | Mean confidence |
|---|---|---|---|---|---|
| None or possible contamination | 20 | 14 / 6 / 0 | 0.85 | 0.086 | 0.69 |
| None only | 18 | 13 / 5 / 0 | 0.86 | 0.093 | 0.69 |

- **Scored PARTLY:**
  - BI-06: LiteLLM serves only the long tail; OpenAI, Azure and Google use native clients.
  - BI-15: no ambient-noise mixer in the open-source code.
  - BI-16: no "thinking" filler clips.
  - BI-17: the text cache is per call, and the welcome clip arrives preloaded from the closed platform.
  - BI-29: knowledge-base retrieval goes through a closed rag-proxy-server.
  - BI-35: unknown fields are accepted.
- **Excluded for contamination:** BI-13, 14, 18 and 19. All four are TRUE.
- **Bonus checks on rows that were marked not checkable:**
  - BI-20 is TRUE. The SDK uses SIP.js 0.21.2, mints sessions at `/web-call/freeswitch-session`, sends X-Agent-Id/X-Run-Id and uses Google STUN. It also shows something new: a Kamailio SIP edge in front of FreeSWITCH.
  - BI-22 is TRUE: Asterisk chan_websocket with ulaw.
  - BI-23 is PARTLY: trunk legs share the FreeSWITCH mod_audio_stream fork.

## 3. Data model and object graph

**Account**
- User/Org: wallet in cents, concurrency {max, current}. Sub-accounts are Enterprise-only (403 for us).
- Account-level resources:
  - provider BYOK credentials, custom LLM and TTS endpoints;
  - phone numbers, compliance applications (DLT/CIN/GST) and violations;
  - SIP trunks v2 (gateways, carrier-IP ACLs, numbers, presets for plivo, telnyx, twilio, exotel, vobiz, vonage and custom);
  - knowledge bases.

**Agent**
- `tasks[]`, each with:
  - `task_type`: conversation, extraction or summarization;
  - `toolchain`: execution plus pipelines;
  - `tools_config`: llm_agent, transcriber, synthesizer, input, output, api_tools, s2s, multilingual_config, web_search;
  - `task_config`: about 35 knobs (§9).
- Prompts, stored in S3 at `agent_data/{agent}/conversation_details.json`.
- `calling_guardrails`, `ingest_source_config`, webhook config and `call_summary_enabled`.
- `dispositions[]` (two are auto-created) and extraction categories.

**Outbound**
- Batch: CSV, `from_phone_numbers[]`, `retry_config` and a webhook, producing executions.
- Workflow: a CAS draft and published versions.
  - A campaign pins a version and holds entries (`reference_id`, `mobile_number`, `name`, `email`, `custom_fields`, with status pending, failed_validation, dispatched or completed).
  - Each entry becomes a workflow execution (node attempts, `state.*`), whose agent node produces an execution.

**Execution (one call)**
- `status`, `transcript`.
- `cost_breakdown {llm, network, platform, synthesizer, transcriber}`, in cents.
- `telephony_data`: to/from, recording_url, hangup_by, hangup_reason, hangup_provider_code, ring_duration, post_dial_delay, to_number_carrier, provider, call_type.
- `transfer_call_data`, `batch_run_details{retried}`, `extracted_data`, `node_extracted_data`, `summary`, `context_details`, `answered_by_voice_mail`.
- Raw log at `/executions/{id}/log`: request or response entries per component.

**Gaps and hidden detail**
- There is no contact, lead, consent, DND or memory entity anywhere.
- The engine's own per-call output is much richer than the documented execution. It includes progression_data (per-turn ASR, LLM and TTS latency and tokens), user_bot_latencies, interruption_stats, language-ID and switch events, DTMF, transfer and hangup-cancel events, blocked audio and TTS quality.

## 4. Endpoint surface

Base URL `https://api.bolna.ai`, Bearer key with the `bn-` prefix. 128 documented operations; the full table is in `endpoints.csv`.

| Area | What we called and what came back |
|---|---|
| Agents v2 (8 ops) | Create returns 201 `{agent_id, state}`. GET returns the full object plus 25 hosted-only fields. PATCH accepts only top-level fields; PUT replaces the whole agent; DELETE then GET returns 404. |
| Agents v1 (7 ops, deprecated) | GET is byte-identical to v2. |
| Calls (2 ops) | Not called. |
| Executions (4 ops) | Schema only. |
| Batches (6 ops) | List returned `[]`. |
| Workflows (17 ops) | Node catalogue: start, agent, extraction, api, callback, time, retry, aisensy_whatsapp, end. Effects: `set_value` works; `notify` has "no executor yet". |
| Campaigns and workflow executions (15 ops) | Not called. |
| Knowledge bases (4 ops) | Not called. |
| Voices (2 ops) | 16 TTS providers for Hindi, including inworld and styletts, which the open-source engine lacks. Per-model tier, concurrency group, control ranges and `character_cost_multiplier` (ElevenLabs Flash/Turbo 0.5, Multilingual v2 1.0). ElevenLabs Turbo has 1,280 Hindi voices; Sarvam bulbul:v3 has 16. |
| Dispositions and extractions (11 ops) | The list endpoints hide the auto-created dispositions. |
| Phone numbers (5 ops) | Not called. |
| Compliance and violations (6 ops) | Empty. |
| Inbound (2 ops) | Not called. |
| `/trunk` (13 ops) | `/trunk/pop` returns trunk.bolna.ai, 15.252.21.46 and 13.206.230.198, port 5060 UDP/TCP, RTP 30000 to 40000. |
| Legacy `/sip-trunks` (8 ops) | Not called. |
| User, providers, custom models (9 ops) | Wallet 500.0, concurrency 2. |
| Sub-accounts (7 ops) | 403. |

**Web call (from the SDK; not called).** `POST /web-call/freeswitch-session` mints a single-use session {run_id, agent_id, sip_username, sip_password, sip_domain, wss_url, sip_register, expires_in, ice_servers}. Capacity errors carry a scope: global, customer or not_enabled.

## 5. A call end to end, from the code

1. **Dial.** The telephony server places the call through the provider REST API. The answer URL returns Plivo XML (`<Stream bidirectional keepCallAlive>`) or TwiML pointing at the WebSocket `/chat/v1/{agent_id}`.
   - Vobiz speaks the Plivo protocol (callId/streamId, playAudio, checkpoint, clearAudio).
   - Web calls and v2 trunks go through SIP.js, then Kamailio, then FreeSWITCH, with a patched mod_audio_stream fork carrying L16 at 16 kHz.
   - Legacy trunks use Asterisk chan_websocket with ulaw.
   - STT on telephony runs at 8 kHz.
2. **Session.** `AssistantManager` runs one `TaskManager` per task, in sequence; extraction and summarisation tasks take the conversation's output.
3. **Concurrent asyncio loops, joined by queues:**
   - the input handler, which batches 10 media frames per STT send;
   - the transcriber listener and the transcriber socket;
   - the LLM task;
   - the synthesizer listener;
   - the output gate;
   - the completion watchdog;
   - optional backchannel, DTMF and graph-event loops.
4. **Welcome.** After the stream_sid arrives, plus an optional delay of 0 to 1000 ms, the preloaded welcome clip plays. Speech during it is dropped.
5. **Each turn.**
   - Interims drive barge-in.
   - The final transcript triggers the merge of unheard turns, then the LLM.
   - LLM text is pushed to TTS once the buffer reaches 40 characters, cut at the last space (not at sentence ends).
   - The output gate then decides SEND, BLOCK or WAIT for each chunk.
   - Mark echoes confirm what played, and history is committed only for audio actually sent.
   - Optional extra LLM calls follow: the hangup check, voicemail and the language-switch judge.
6. **Tools.**
   - HTTP tools pass an SSRF guard and can carry a pre_call_message and a pre-call webhook.
   - Transfer POSTs {call_sid, provider, stream_sid, from_number, execution_id, call_transfer_number} to a closed `/process_transfer` endpoint after a fixed 2 s sleep. No summary is passed, so transfers are cold.
7. **End.** Any of these ends the call:
   - the hangup-check LLM, or the end_call tool;
   - silence (`hangup_after_silence`, with the check-in at `trigger_user_online_message_after`);
   - `call_terminate` (default 90 s);
   - the 60 s stall backstop;
   - voicemail;
   - a component error;
   - the caller disconnecting.

   The engine then returns its payload. On the hosted side come costing, extractions, dispositions and summary, the move from `call-disconnected` to `completed`, and the webhook.

## 6. Lifecycle and state machines

**Execution status.**
- Main path: scheduled, queued, initiated, ringing, in-progress, call-disconnected, completed.
- `rescheduled`: the call fell outside the calling guardrails.
- Terminal: busy, no-answer, failed, canceled, stopped, error, balance-low.
- The live filter adds `prepared` and lists the providers web-call and websocket. The documented `telephony_data.provider` enum covers only twilio and plivo.

**hangup_detail values:** llm_prompted_hangup, end_call_tool, voicemail_detected, inactivity_timeout, max_duration_reached, web_call_max_duration_reached, transcriber_error, transcriber_connection_error, synthesizer_error, llm_error, s2s_error, client_disconnected.

**Audio gate.**
- Each reply carries a sequence id. An interruption invalidates all pending ids, so their audio is BLOCKed.
- WAIT applies while the caller is speaking, or until 900 ms after the final (from the third history entry on). It polls every 50 ms and self-releases after 2 s with no new speech.
- Otherwise the chunk is SENT.

**Flux.** End-of-turn confidence is 0.7 and the timeout is 500 ms. With eager end-of-turn enabled, a speculative LLM call starts early; it is reused at EndOfTurn or cancelled on TurnResumed.

## 7. Webhooks and events

- **Execution webhook.** Bolna POSTs the full GET-execution body on every status change.
  - Delivery can be limited to chosen statuses and can carry static headers.
  - Sources are 13.203.39.153, 13.126.9.249 and 13.202.133.53.
  - It is retried on non-2xx responses and carries no HMAC signature.
- **Batch webhook.** Fires when the batch is processed, and again when every call has reached a final state.
- **Pre-call webhooks.** Same shape, fired before a tool runs.
- **Workflow webhooks.** Header values are masked on read; there are test and resend endpoints. Callback nodes have an optional signing secret (with rotation) and match the contact with E.164 normalisation, defaulting to +91.
- **Live events into a running call.** `POST /v1/call/{run_id}/events` takes {event, properties, timestamp}. Graph agents can route on these through event edges, and the engine generates a proactive reply at a safe point.
- **Raw log entries.** {created_at, type, component, provider, data, reasoning_content}. Components are transcriber, llm, llm_hangup, llm_voicemail, llm_language_detection, llm_language_switch, function_call, graph_routing, synthesizer, s2s, error and warning.

## 8. Billing metering

**What the engine meters.**
- Billed STT audio seconds: provider-reported where available, and only for the active leg of a multilingual pool.
- Synthesised characters.
- Per-turn LLM input, output, cached and reasoning tokens, with overflow turns metered separately.
- Routing-LLM tokens.

**How the hosted platform prices it.**
- Usage is priced into `cost_breakdown`, in cents.
- The flat per-minute rate (6.0 cents PAYG) covers only "preferred models". Any other model bills that component at base rates: STT by the second, LLM by the token, TTS by the character, using `character_cost_multiplier`.
- Telephony is billed per minute, rounded up. The platform fee is charged per minute of call duration.
- On the Basic plan, a single BYOK component drops the whole call to base usage pricing. On other plans that happens only when all three components are BYOK.

**Open.** Whether the $0.02/min platform fee applies on the bundled plan is still unverified; it needs an invoice.

## 9. Configuration knobs

**TTS**
- 15 providers in the open-source engine and 16 hosted, all validated against the live catalogue.
- Per-model control ranges.
- `buffer_size` (default 40), `caching` and `stream`.

**STT**
- Providers: deepgram (nova-2/3, Flux), azure, sarvam, assembly, google, gladia, elevenlabs, smallest, openai, soniox, gemini, and a self-hosted "bolna" ASR.
- Settings: endpointing 500, keywords/keyterms, `context` biasing, language_hints, and a self-hosted Deepgram host override.

**LLM**
- Native clients: OpenAI, Azure (with the PTU overflow) and Gemini.
- Through LiteLLM: groq, anthropic, deepseek, openrouter and 8 more.
- OpenAI-compatible: custom (with extra_body), a Bolna-hosted LLM, and ola.
- Settings: max_tokens 100, temperature 0.1, reasoning_effort and verbosity, the Responses API, compact_threshold.
- Speech-to-speech: OpenAI Realtime (gpt-realtime-2.1, semantic_vad) or Gemini Live (gemini-3.1-flash-live-preview), behind a 1,500 ms gate on the welcome audio.

**Turn-taking**
- `number_of_words_for_interruption` (also settable per graph node), `incremental_delay`, `interruption_backoff_period`.
- `discard_pre_welcome_utterance`, `welcome_message_delay`.
- The user-online check-in: its message, its timing, and per-language maps.
- `hangup_after_silence`, `max_silence_repeats`, `call_terminate`.
- Backchanneling, `use_fillers`, `noise_cancellation_level` (60 to 100), ambient noise track.

**Call control**
- `hangup_after_LLMCall` (with a custom prompt) or `end_call_tool_mode`.
- `call_hangup_message` (can be a per-language map), interruptible goodbye.
- Voicemail: 30 s window, 7 s check interval, minimum 7 words, `detection_time` 2.5.
- DTMF, `auto_reschedule`, `inbound_limit`, allowlists, `disallow_unknown_numbers`.
- `calling_guardrails`: whole hours in the recipient's timezone, null (off) on create. The open-source default timezone is America/Los_Angeles.

**Tools**
- Custom HTTP tools, scoped to graph nodes if needed.
- transfer_call, end_call, web_search (openai, firecrawl, exa or parallel).
- RAG.

**Multilingual**
- A per-language transcriber, synthesizer, native-script prompt, handoff message and agent name.
- The server adds `language_switch_trigger` = "requested_or_auto_detected".

**Memory**
- Per-call variables only: user_data, context_data and recipient_data.
- Inbound caller lookup from an API, CSV or Google Sheet.

**Hosted-only fields seen on readback:** custom_analytics, gpt_assistants, inbound_phone_number, restricted, webhook_headers, webhook_config, sip_headers, sip_header_variables, ingest_lookup_key, creation_source, parent_agent_id, source_agent_id, created_by, agent_category, single_prompt_ui, composition_by_language, dispositions.

## 10. What the API and code showed that the public pages did not

- **From the API:**
  - the auto-generated judges;
  - the default drift between docs and server;
  - the silent drops of unknown fields and `routes`;
  - the `prepared` status and the wider provider list;
  - disposition list endpoints hiding the auto-created judges;
  - the 1,280-voice Hindi catalogue with cost multipliers;
  - the workflow node catalogue and `state.*`.
- **From the code:**
  - the 900 ms hold, the pre-welcome drop, the short-final drop and the 40-character chunking;
  - the Haiku language-switch judge with Sarvam language ID and STT pools;
  - the Azure overflow and the shadow circuit breaker;
  - the live-events API;
  - Bolna-hosted LLM and ASR providers.
- **From the SDK:** the Kamailio edge, the `bn-` key prefix and the capacity scopes.
- **From today's HEAD commit:** live calls are forced to stream even when an agent stores `stream:false` (BOLNA-2967), which is exactly what our API-created agent stored.

## 11. Bolna's whole offering

**Agents**
- Build paths: the 7-tab builder, Auto Build, graph agents, the single-prompt beta, the REST API, CLI, MCP and 20 Skills.
- Agent types: simple, knowledge base, graph and S2S.
- Auto judges, extractions and multilingual switching.

**Outbound**
- Batches: retries up to 3, starts rounded to 10 minutes, guardrails.
- Workflows: multi-step journeys with WhatsApp via AiSensy, API calls, callbacks, waits and retries.
- Campaigns: funnel and termination-reason reports.

**Inbound**
- Linking a number to an agent, IVR, limits and allowlists, caller lookup.

**Telephony**
- Hosted Plivo and Vobiz numbers in India, available after a compliance application.
- Bring-your-own Twilio, Plivo, Exotel or Vobiz.
- SIP trunks in two versions.
- Truecaller verification.

**Gaps and Enterprise tier**
- No native CRM: integration is through webhooks, Zapier, Make, n8n, viaSocket, Sheets and the workflow API node.
- White-label means Enterprise sub-accounts only, with no rebranding API.
- Enterprise adds India residency (Plivo plus Azure OpenAI only), on-prem images, an AWS Marketplace listing and forward-deployed engineers.

## 12. For VP's product (blueprint frame: what Bolna does best, where it falls short, VP's better design)

**Turn-taking**
- **Match:** the sequence-id audio gate, merging of unheard turns with a settle window, history trimmed to heard text, tool-call barge-in deferral, Flux eager end-of-turn.
- **Their gap:**
  - the fixed 900 ms hold puts a floor of about 1.4 s on replies;
  - short finals are dropped;
  - speech over the welcome is dropped;
  - the stop list is English-only and matched exactly.
- **VP's better design:**
  - pause-aware release instead of a fixed hold (open.2026-10-19.turn-taking);
  - a Hinglish backchannel and stop lexicon;
  - never discard a short reply: classify it as an acknowledgement, an objection or a stop;
  - listen during the welcome.

**Code-switching**
- **Match:** the dual-recogniser judge, pre-warmed per-language STT, atomic swap, handoff clips, the rule that a number readout never triggers a switch.
- **Their gap:** a judge LLM call per turn, N standby sockets, and a whole-stack swap rather than true intra-sentence Hinglish.
- **VP's better design:** one code-mixed register (code-mixed STT plus a TTS that speaks mixed script), with the judge used only when in doubt. Measure language hold.

**Voicemail and IVR**
- **Match:** LLM detection where "haan bolo" counts as a human.
- **Their gap:** no Hindi or regional carrier messages, and a 7-word / 30 s billed wait.
- **VP's better design:** an Indian operator-message lexicon in about 10 languages, with early exit and a reason code.

**Outcome analytics**
- **Match:** auto, prompt-tailored judges; categories; confidence and reasoning on extractions.
- **Their gap:** the judges are hidden, the definitions are owned by the vendor, and nothing loops back from a judgement to the prompt.
- **VP's better design:** judges the customer can see and edit, set up in chat (LLM-native), feeding the v2 learning loop.

**Campaigns and data import**
- **Match:** row-level failure codes, corrective re-upload, +91 default, funnel reports, retry and WhatsApp nodes.
- **Their gap:** two overlapping systems, de-duplication by reference_id rather than phone, no opt-out or DND semantics, no contact object.
- **VP's better design:** one contact-centric campaign that normalises and de-duplicates on E.164, with opt-out and DND as first-class fields and a consent ledger.

**Compliance**
- **Match:** guardrails in the recipient's timezone, a compliance application before numbers are issued, a violations workflow.
- **Their gap:** guardrails off by default and whole hours only; no NCPR scrub, consent capture or AI-disclosure setting; the code defaults to the Los Angeles timezone.
- **VP's better design:** compliance on by default, covering windows, days, holidays, NCPR, consent and disclosure.

**Reliability**
- **Match:** the LLM overflow, STT reconnect cap, stall backstops, and typed errors that hang up cleanly with a reason.
- **Their gap:** no STT or TTS fallback, a shadow-only circuit breaker, one carrier per agent; 9 of their last 18 incidents were telephony.
- **VP's better design:** a disclosed same-voice fallback (open.2026-10-20.product-failover-policy), dual-carrier routing and an active circuit breaker, with tests kept free of silent swaps.

**API**
- **Match:** full-object readback, CAS drafts, the events API, CLI and MCP.
- **Their gap:** docs and server drift, silent field drops, no webhook HMAC, no published OpenAPI file.
- **VP's better design:** a tested, spec-first API that returns 422 on unknown fields, signs webhooks and supports idempotency keys.

**Voice**
- **Match:** a huge catalogue with metadata, per-model ranges and cost multipliers.
- **Their gap:** choice without guidance, and 40-character word-boundary chunks that likely hurt prosody (inferred).
- **VP's better design:** a curated, measured default (round-2 ratings, Gemini TTS lean), sentence-aware chunking and expressive control.

**Memory (v2)**
- **Match:** per-call variables, inbound lookup, workflow `state.*`.
- **Their gap:** no persistent memory about a contact.
- **VP's better design:** consented, editable contact memory across calls, feeding the agenda ledger.

## 13. Only with login, or held for the call battery

The dashboard items and the billable items are listed in the `only_with_login` field. The battery must add these items:
- reply gap against the 1.4 s floor;
- "nahi", "haan", "ruko" and "bas" said over the agent;
- speech over the welcome message;
- Hindi operator messages;
- language hold;
- the stored defaults of a dashboard-created agent.

## 14. Method notes and limits

- The other provider classes and the tests were mapped with grep, not read line by line.
- The hosted platform may lead or lag the open-source code. Today's HEAD includes a fix committed 4 h before I read it, so every inferred latency claim needs the battery.
- Every response was redacted before it was written: user id, email, created_by and token-like strings.
- The key went only through a curl config on stdin, and the outputs were scanned for all 19 account secret values (0 hits).

---

## Structured result (from the workflow run wf_36b25033-85c)

### Data model

The model is call-centric. The core record is the execution, which is one call.

**Account level**
- User/Org: wallet in cents, concurrency, Enterprise-only sub-accounts.
- Attached to the account:
  - BYOK provider credentials;
  - custom LLM and TTS endpoints;
  - phone numbers and India compliance applications;
  - carrier violations;
  - v2 SIP trunks (gateways, IP ACLs, numbers);
  - knowledge bases.

**Agent**
- `tasks[]`, each holding:
  - a toolchain;
  - tools_config: llm_agent (simple, knowledge base or graph), transcriber, synthesizer, input/output telephony, api_tools, s2s, multilingual_config, web_search;
  - task_config, about 35 conversational knobs.
- Prompts, stored in S3.
- calling_guardrails, ingest_source_config (inbound lookup), webhook config and call_summary_enabled.
- dispositions[] (two LLM judges are auto-created) and extraction categories.

**Outbound**
- Batch: CSV, from numbers, retry_config and a webhook. It produces executions.
- Workflow: draft and published versions.
  - A campaign pins a version and holds entries: reference_id, mobile_number, name, email, custom_fields, and a status of pending, failed_validation, dispatched or completed.
  - Each entry becomes a workflow execution with node attempts and state.*. Its agent node produces an execution.

**Execution**
- status and transcript;
- cost_breakdown {llm, network, platform, synthesizer, transcriber} in cents;
- telephony_data (hangup_by/reason/provider_code, ring_duration, post_dial_delay, carrier, recording_url);
- transfer_call_data and batch_run_details;
- extracted_data, node_extracted_data, summary, context_details;
- a raw log per component.

**What does not exist:** no contact, lead, consent, DND or persistent memory entity.

### Key findings

- Calibration: blind black-box Bolna inferences scored against the code at bc59921: 14 TRUE / 6 PARTLY / 0 FALSE on 20 checkable uncontaminated rows. Hit rate 0.85, Brier 0.086, mean stated confidence 0.69. Architecture inference from outside is reliable at about 85%, but the method missed every timing constant and turn-taking policy, so measure those in the call battery.
- Inferred reply floor of about 1.4 s for Bolna's default cascade: 500 ms STT endpointing plus a fixed 900 ms incremental_delay audio hold after every final transcript (from turn 2 on). Our API-created agent stored exactly these values. Not yet measured on a call.
- Short replies are dropped by design: while the agent speaks, a final of 1 word or fewer that is not on the English-only exact-match stop list is discarded, so 'nahi', 'haan', 'ruko' and 'bas' never reach the LLM. All speech during the welcome is dropped too.
- Language switching is Bolna's strongest piece: pre-warmed per-language STT pool, an unbiased Sarvam saaras:v3 language-ID stream beside the locked live ASR, and a Claude Haiku 4.5 Switch-LLM judge with about 15 Indic rules. It is still a whole-stack swap, not one code-mixed register.
- Creating an agent makes Bolna auto-generate two prompt-tailored, Hinglish-aware gpt-4.1-mini judge dispositions ('Call Success', 'Call Completion') within about 25 s. They are free, hidden from the list endpoints and deleted with the agent: LLM-native outcome analytics by default.
- The server's stored defaults contradict the docs: words to interrupt 1 vs 2, incremental_delay 900 vs 400 ms, hangup_after_silence 20 vs 10 s, TTS stream false and 40-char buffer vs true and 250. Unknown fields are accepted with 201 and dropped, documented 'routes' are not persisted, and there is an undocumented 'prepared' status.
- The data model is call-centric, with no contact, consent or memory object, and two overlapping outbound systems: batches report only counts; workflow campaigns have row-level failure codes, de-dup by reference_id (not phone) and a +91 default. The only cross-call state is a workflow execution's state.*.
- Only the LLM fails over (Azure provisioned deployment to a pay-as-you-go overflow on 429/5xx or a pre-token stream drop). STT and TTS only reconnect, the circuit breaker runs in shadow, and each agent has one carrier.
- Graph agents add a serial forced-tool-call routing LLM hop before every reply unless a deterministic edge matches; a separate fast routing provider is the mitigation.
- Barge-in recovery worth matching: history trimmed to the heard text via mark echoes, unheard user turns merged and regenerated with a 0.7 s settle window, duplicate replies blocked, barge-in deferred during tool calls.
- Execution webhooks carry no HMAC signature and come from 3 fixed Mumbai IPs. Transfers are cold: no summary passed, and a fixed 2 s sleep. The voicemail prompt has no Hindi or regional carrier messages.
- The web-call SDK (npm @bolna/web-call 3.0.1) shows a Kamailio SIP edge in front of FreeSWITCH, the bn- key prefix and capacity scopes. LiteLLM serves only the long tail; OpenAI, Azure and Gemini use native clients, and Bolna has its own hosted LLM and ASR provider types.

### Only learnable with a dashboard login

- Auto Build: time from brief to agent, and the defaults it writes (prediction P03)
- Stored defaults of a dashboard-created agent (endpointing 200? incremental_delay?), to settle whether the 900 ms hold reaches dashboard users
- Ask Bolna copilot, edit-prompt-by-chat, Extraction Library and templates
- Batch CSV upload UI with the messy 50-row synthetic CSV: valid count, duplicates, +91 handling, opt-out row (P04a-f)
- Call History, the progression view, the raw-log viewer, async CSV report export (P08), and the cost cards
- Billing pages and invoices, to settle whether the $0.02/min platform fee applies on the bundled plan (BOL-35)
- Team roles, organisation settings, sub-accounts (Enterprise), the compliance application form and Vobiz KYC (P02)
- Webhook 'Trigger on statuses', the headers setting and 'Send test', to capture a real sample payload
- Dashboard web-call test (login sits behind hCaptcha)
- Billable, held for the call-battery phase: POST /call to our verified Plivo number for the standard battery, plus Bolna-specific items (reply gap vs the 1.4 s floor; 'nahi', 'haan', 'ruko', 'bas' over agent speech; speech over the welcome; Hindi operator messages; language hold; 'are you a bot?')
- Billable or state-changing, held: POST /v2/agent/{id}/dispositions/test (bills LLM tokens), POST /web-call/freeswitch-session, phone-number search/buy, compliance application, batch create and schedule, workflow publish/run and campaign start

### Run facts

- API key worked: True
- Endpoints documented: 128
- REA used: False
- Spend: 0. Wallet 500.0 (cents) before and after. No calls, number search or purchase, batch, workflow, campaign, web-call session or disposition test was made. 57 API requests in total.

### Files written by the lane

- `/home/user/sales-enabler/research/2026-10-20/account-phase/bolna/claims.json`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/bolna/manifest.csv`
- `/home/user/sales-enabler/research/2026-10-20/account-phase/bolna/blind-scoring.json`
- `/home/user/sales-enabler/context/inbox/account-bolna.json`
- `/home/user/sales-enabler/data/account-phase/bolna/openapi/bolna-openapi-merged.json`
- `/home/user/sales-enabler/data/account-phase/bolna/openapi/endpoints.csv`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/_requests.csv`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/agentA_readback_v2.json`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/agentA_after_put.json`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/disposition_default.json`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/disposition_after_put.json`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/workflow_node_types.json`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/voice_config_tts_hi.json`
- `/home/user/sales-enabler/data/account-phase/bolna/api-live/agentA_executions_v2.json`
- `/home/user/sales-enabler/data/account-phase/bolna/docs`
- `/home/user/sales-enabler/data/account-phase/bolna/code`
- `/home/user/sales-enabler/data/account-phase/bolna/pkg/npm-web-call/x/package/dist/index.d.ts`
