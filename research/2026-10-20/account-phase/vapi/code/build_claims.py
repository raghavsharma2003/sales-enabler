#!/usr/bin/env python3
"""Build claims.json for the Vapi account-phase lane. Evidence paths are relative to /home/user/sales-enabler."""
import json, os, sys

ROOT = "/home/user/sales-enabler"
AP = "data/account-phase/vapi"
OA = f"{AP}/openapi/api-json.json"
WH = f"{AP}/docs-openapi/docs.vapi.ai_openapi_webhooks.json"
DIG = f"{AP}/derived/webhook-messages-digest.txt"
WEBAPI = f"{AP}/sdk-npm-web/x/package/api.ts"
WEBVAPI = f"{AP}/sdk-npm-web/x/package/vapi.ts"
SRV = f"{AP}/sdk-npm-server/x/package"
DOC = "data/teardown/vapi/docs-md"
DATE = "2026-10-20"

C = []


def add(id_, area, claim, grade, evidence):
    assert grade in ("observed", "inferred", "vendor-claimed", "unknown")
    C.append({"id": id_, "area": area, "claim": claim, "grade": grade, "evidence": evidence, "date": DATE})


# ---------------- authorized surface ----------------
add("AP-01", "surface",
    "Our key is a Vapi private bearer token on api.vapi.ai. The org lists three tokens (a default private, a default public, and the private one we use, tagged by name). /org and /org/feature-flag answer 401 'Invalid Key. Hot tip, you may be using the private key instead of the public key' to an API key, so org settings, members, billing and limits are reachable only from a dashboard login session.",
    "observed", [f"{AP}/api-reads2/token-list.json", f"{AP}/api-reads2/org.json", f"{AP}/api-reads2/org-feature-flag.json"])
add("AP-02", "surface",
    "Errors are uniform and strict: missing header gives 401 'Missing Authorization Header'; a malformed id gives 400 'id must be a valid UUID.'; an unknown id gives 404 {message:'Not Found'}; body validation returns an array of messages and rejects unknown properties ('property unknownKnob should not exist'). Bounds are enforced server-side (voice.speed <= 2, maxDurationSeconds >= 10, startSpeakingPlan.waitSeconds <= 5).",
    "observed", [f"{AP}/api-writes/noauth-response.txt", f"{AP}/api-writes/baduuid-response.json", f"{AP}/api-writes/notfound-response.json", f"{AP}/api-writes/invalid-response.json", f"{AP}/api-writes/invalid2-response.json"])
add("AP-03", "surface",
    "A fresh org is seeded: one sample assistant 'Riley' (a clinic-scheduling prompt on gpt-4.1 with Vapi voice 'Elliot' v2), seven shared simulation personalities dated 2025-12-04, a default 'Metrics Overview' board (6 widgets bound to system-keyed insights: call volume, total minutes, concurrency chart, reason call ended, failed-calls list, average-cost breakdown), 22 stock Vapi voices and three API tokens. Everything else (calls, campaigns, phone numbers, tools, files, knowledge bases, structured outputs, scorecards, evals, sessions, chats, squads) lists empty.",
    "observed", [f"{AP}/api-reads/assistant-list.json", f"{AP}/api-reads/sim-personality-list.json", f"{AP}/api-reads/board-default-metrics.json", f"{AP}/api-reads/sdkop-voice-library-vapi.json", f"{AP}/api-reads/call-list.json", f"{AP}/api-reads/campaign-list.json"])
add("AP-04", "surface",
    "Responses come from Express behind Cloudflare (server: cloudflare, x-powered-by: Express, cf-ray IAD, access-control-allow-origin: *). No x-ratelimit or Retry-After headers appear on success. The spec describes API rate limiting only as a per-region tumbling one-minute counter (OrgApiLimitsDTO: rateLimitUsage, rateLimitMax) with 'no reset header'; the value of rateLimitMax is not readable with an API key (unknown).",
    "observed", [f"{AP}/api-reads2/assistant-limit1.headers.txt", OA])
add("AP-05", "surface",
    "The account-phase copies of the OpenAPI (74 paths, 1,018 component schemas), the docs API reference and the webhooks spec are byte-identical (same sha256) to the public-phase copies, so nothing in the documented spec is gated behind the key: the extra surface is in the web SDK, not in the spec.",
    "observed", [OA, "data/teardown/vapi/openapi/api.vapi.ai_api-json", f"{AP}/docs-openapi/docs.vapi.ai_openapi_api-reference.json"])
add("AP-06", "surface",
    "The public npm package @vapi-ai/web 3.0.0 ships a complete generated REST client (api.ts, 61,107 lines): 246 method+path operations over 137 unique paths, 68 of them absent from the 74-path public OpenAPI (org/*, credential, token, template, test-suite, workflow, v2/call, v2/assistant, voice-library, assistant drafts/versions/restore, tool drafts/versions, call/web, call/phone, chat/web, knowledge-base v1, provider search/voice-add). Five public paths are not in it.",
    "observed", [WEBAPI, f"{AP}/derived/web-sdk-ops.json"])
add("AP-07", "surface",
    "Of the web-SDK-only routes, our private key was accepted (HTTP 200) on assistant versions (list and by label), assistant drafts (create, list, delete), voice-library/vapi, voice-library/vapi/accents, token, credential, template, test-suite, workflow, knowledge-base v1, v2/assistant, v2/call and v2/call/metadata. template/pinned returned 404; /org and /org/feature-flag returned 401.",
    "observed", [f"{AP}/api-reads/sdkop-assistant-versions.json", f"{AP}/api-reads/sdkop-v2-assistant.json", f"{AP}/api-reads/sdkop-voice-library-vapi.json", f"{AP}/api-reads/sdkop-credential.json", f"{AP}/api-reads/sdkop-test-suite.json", f"{AP}/api-reads2/assistant-version-singular.json", f"{AP}/api-reads2/template-pinned.json", f"{AP}/api-writes2/draft-create.json"])
add("AP-08", "sdk",
    "Server SDKs (@vapi-ai/server-sdk 3.0.0 TypeScript and vapi-server-sdk 3.0.0 Python, both Fern-generated) expose 143 methods over 23 resource groups (assistants, squads, calls, chats, campaigns, sessions, trafficAllocations, phoneNumbers, tools, files, knowledgeBasesV2, structuredOutputs, simulation*, insight, board, eval, observabilityScorecard, providerResources, analytics). They omit versions/drafts, credentials, tokens, templates, test suites, workflows, voice library and org, which exist only in the web SDK client.",
    "observed", [f"{SRV}/reference.md", f"{AP}/sdk-pypi-server/x/vapi/client.py", f"{AP}/derived/web-sdk-ops.json"])
add("AP-09", "sdk",
    "SDK transport defaults: single base URL https://api.vapi.ai (no region argument), Bearer auth, 2 retries on 408/429/5xx with exponential backoff (1 s base, 60 s cap, 20% jitter, Retry-After honoured). The Python SDK mirrors this (base_max_retries=2) on httpx with pydantic models and a documented 60 s default timeout; the TypeScript default timeout was not found in the fetcher (unknown).",
    "observed", [f"{SRV}/dist/esm/core/fetcher/requestWithRetries.mjs", f"{SRV}/dist/esm/environments.mjs", f"{AP}/sdk-pypi-server/x/vapi/core/http_client.py"])
add("AP-10", "sdk",
    "The MCP server package (@vapi-ai/mcp-server 0.0.11) exposes only four tool families: assistants (create/get/list/update), tools (create/get/list/update), calls (create/get/list) and phone numbers (get/list). The CLI package (@vapi-ai/cli 0.2.1) is a 2.4 kB npm wrapper whose installer downloads a platform binary from GitHub releases; the binary was not fetched or inspected (unknown).",
    "observed", [f"{AP}/sdk-npm-cli/mcp-server/x/package/dist/tools/assistant.js", f"{AP}/sdk-npm-cli/mcp-server/x/package/dist/tools/call.js", f"{AP}/sdk-npm-cli/cli/x/package/install.js"])
add("AP-11", "sdk",
    "The web SDK is the browser call client on Daily WebRTC. start() emits call-start-progress through named stages (input-validation, initialization, web-call-creation, daily-call-object-creation, daily-call-join, audio-processing-setup, mobile-permissions, video-recording-setup, reconnect); client-to-server messages are add-message, control (mute-assistant, unmute-assistant, say-first-message), say and end-call; REA found 36 event names and 3 coerce/parse boundaries in the dist.",
    "observed", [WEBVAPI, f"{AP}/derived/rea-web-sdk-events.json", f"{AP}/rea/web-sdk-dist.analysis.json"])

# ---------------- data model ----------------
add("AP-12", "data-model",
    "There is still no contact or customer resource. A customer is an inline CreateCustomerDTO on a call, campaign row, session or override (number 3-40 chars, sipUri, name/email/externalId <= 40, extension <= 10, numberE164CheckEnabled default true, plus per-customer assistantOverrides and squadOverrides). Consent, suppression and history are the buyer's problem. Confirms VAP-02 with field-level detail.",
    "observed", [OA, "research/2026-10-20/teardown/vapi/claims.json"])
add("AP-13", "data-model",
    "A call targets exactly one of assistantId (optionally pinned with assistantVersion), a transient inline assistant, squadId/squad or workflowId/workflow, with assistantOverrides carrying variableValues (LiquidJS templating, reserved 'customer' object). POST /call with nothing returns 400 'Couldn't Get Assistant. Need Either `assistant`, `assistantId`, `squad`, Or `squadId`.' (workflow is omitted from that message).",
    "observed", [OA, f"{AP}/api-writes2/call-invalid-empty.json"])
add("AP-14", "data-model",
    "Squads are an ordered member list; each member is an assistantId (with optional version pin) or inline assistant, plus assistantDestinations (transfer or handoff to a named assistant with a spoken message and description). The first member starts the call. A two-member squad (our probe assistant handing to the seeded Riley) was created and read back with latestVersion v1.",
    "observed", [f"{AP}/api-writes2/squad-create.json", OA])
add("AP-15", "data-model",
    "Tools are a first-class versioned resource: 26 Create*ToolDTO types (apiRequest, function, code, bash, computer, textEditor, mcp, query/knowledge-base, dtmf, endCall, voicemail, transferCall, handoff, sms, sipRequest, output, Make, 5 GoHighLevel, 2 Google Calendar, Sheets, Slack). An apiRequest tool read back with latestVersion v1, spoken request-start messages, timeoutSeconds 1-300 (default 20), backoffPlan, variableExtractionPlan and rejectionPlan available; toolIds and version-pinned toolRefs both attach tools to a model.",
    "observed", [f"{AP}/api-writes2/tool-create.json", OA])
add("AP-16", "data-model",
    "Resource chain for QA: structuredOutput (type ai|regex, JSON-schema, gating conditions minMessages/minCallDuration/endedReason, linked assistantIds) feeds scorecards (metrics of structuredOutputId + comparator conditions with points) and simulation scenarios (evaluations of structuredOutputId + comparator + value + required flag, optional latencyExpectations of metric turn|model|voice x aggregation mean|median|p95|max x thresholdMs 1-60000). All three were created and read back.",
    "observed", [f"{AP}/api-writes2/so-create.json", f"{AP}/api-writes2/sc-create.json", f"{AP}/api-writes2/scen-create.json"])
add("AP-17", "data-model",
    "Simulation model: personality (a full assistant config that plays the tester) x scenario (instructions up to 10,000 chars, evaluations, toolMocks, hooks, targetOverrides) = simulation; suites group them; a run executes simulations or suites against an assistant or squad target with 1-10 iterations. Each run item stores evaluations, latencyMetrics and AI 'improvements' (analysis, systemPromptSuggestions, toolSuggestions, scenarioSuggestions, suggestedSystemPrompt). Our org's simulation concurrency limit is 2. No simulation was run (billable).",
    "observed", [OA, f"{AP}/api-reads/sim-concurrency.json", f"{AP}/api-reads/sim-personality-list.json"])
add("AP-18", "data-model",
    "Assistants are stored sparsely. A create with only a name returned a record with no model, voice, transcriber or turn-taking fields (only analysisPlan summary/successEvaluation disabled, latestVersion v1); runtime defaults are applied at call time and are not materialised in the API. The full probe config, by contrast, gained an injected transcriber.fallbackPlan.autoFallback.enabled=true.",
    "observed", [f"{AP}/api-writes2/min-assistant-create.json", f"{AP}/api-writes/create-assistant-response.json"])

# ---------------- versioning / learning ----------------
add("AP-19", "versioning",
    "Every PATCH on an assistant publishes a new immutable numbered version: create gave v1; changing maxDurationSeconds from 300 to 240 produced v2 with parentVersion v1 and a different configHash (sha256), listed under /assistant/{id}/versions. There is no draft step on the normal PATCH path; the assistant record carries latestVersion.",
    "observed", [f"{AP}/api-reads/sdkop-assistant-versions.json", f"{AP}/api-writes/patch-assistant-response.json"])
add("AP-20", "versioning",
    "Drafts are separate sparse records: POST /assistant/{id}/draft stored only the fields sent plus baseVersion (the assistant's latestVersion, v2). Two drafts could coexist for one assistant (both returned 201 and both listed), even though the SDK types define an AssistantDraftConflictResponseDTO with existingDraftId. Drafts and tool drafts exist only in the web SDK and API, not the server SDK.",
    "observed", [f"{AP}/api-writes2/draft-create.json", f"{AP}/api-writes2/draft-create-2.json", f"{AP}/api-writes2/draft-list.json", WEBAPI])
add("AP-21", "learning",
    "Traffic splitting is an append-only routing ledger. We POSTed an explicit 80/20 split of v1/v2 and read it back via /latest; the history showed three rows, two of them written by actorType 'system' as follow-latest at the instants v1 and v2 were published, ours as actorType 'api-key' with the key id. Rows survived deletion of the assistant. Percentages are 0-100, targets must total 100, stickiness and the 5-version cap are documented, not observed.",
    "observed", [f"{AP}/api-writes2/ta-create.json", f"{AP}/api-writes2/ta-latest.json", f"{AP}/api-reads2/ta-after-delete.json", f"{DOC}/assistants__versioning__traffic-splitting.md"])
add("AP-22", "learning",
    "Nothing in the API selects a winner or edits an assistant by itself: scorecards and evals score, simulations return improvement suggestions (text), traffic allocation moves a percentage only when a human or key calls it. The optimisation loop is tooling with a human in it, consistent with VAP-61.",
    "inferred", [OA, "research/2026-10-20/teardown/vapi/claims.json"])

# ---------------- lifecycle ----------------
add("AP-23", "lifecycle",
    "Call.status is scheduled | queued | ringing | in-progress | forwarding | ended (plus not-found, deletion-failed); Call.type is inboundPhoneCall | outboundPhoneCall | webCall | vapi.websocketCall; transport is a union of Twilio, Vonage, Telnyx, Vapi SIP, Vapi web-call and Vapi websocket; phoneCallTransport is sip or pstn. A status-update webhook fires on every status change.",
    "observed", [OA, DIG])
add("AP-24", "lifecycle",
    "Call.endedReason has 638 values: 300 call.in-progress.error-*, 270 pipeline-error-* (one per provider failure mode), 20 call.start.error-*, 5 call.ringing.error-*, 2 call.forwarding.*, 2 other call.*, and 39 plain reasons (customer-busy, customer-did-not-answer, customer-ended-call, assistant-ended-call, assistant-said-end-call-phrase, voicemail, silence-timed-out, exceeded-max-duration, twilio-failed-to-connect-call, sip-outbound-unallocated-number, manually-canceled and others). Failure reasons are engineering codes keyed to a provider; none is phrased for a business user.",
    "observed", [f"{AP}/derived/ended-reasons.json", OA])
add("AP-25", "lifecycle",
    "Before dialing, a failed POST /call still returns the live capacity block: {concurrencyBlocked:false, concurrencyLimit:4, remainingConcurrentCalls:3}. Our concurrency limit is 4 (the Usage-only plan), and the docs say remainingConcurrentCalls reserves the slot for the new call.",
    "observed", [f"{AP}/api-writes2/call-invalid-empty.json", f"{DOC}/calls__call-concurrency.md"])
add("AP-26", "lifecycle",
    "The v2 call list defaults to a window from 15 days ago (createdAtGe 2026-10-05) to 165 days ahead (createdAtLe 2027-04-03), i.e. it is built to include scheduled future calls; Call has a schedulePlan {earliestAt, latestAt} for one-off scheduling.",
    "inferred", [f"{AP}/api-reads/sdkop-v2-call.json", f"{AP}/api-reads2/v2-call-metadata.json"])
add("AP-27", "lifecycle",
    "Campaigns exist in two generations in the spec and the live API (/campaign and /v2/campaign with /v2/campaign/{id}/contacts). Campaign.status is scheduled | in-progress | ended | cancelled | archived; counters are callsCounterScheduled/Queued/InProgress/Ended/EndedVoicemail; the only time control is schedulePlan {earliestAt, latestAt}; maxConcurrency 1-500; up to 10,000 customers inline. Both lists returned empty on our org. Confirms VAP-03 and VAP-46.",
    "observed", [OA, f"{AP}/api-reads/campaign-list.json", f"{AP}/api-reads/v2-campaign-list.json"])

# ---------------- webhooks ----------------
add("AP-28", "webhooks",
    "The server-message union has 29 types: assistant-request, conversation-update, end-of-call-report, handoff-destination-request, hang, knowledge-base-request, model-output, phone-call-control, speech-update, status-update, tool-calls, transfer-destination-request, transfer-update, transcript, user-interrupted, language-change-detected, voice-input, assistant.speech, voice-request, call.endpointing.request, chat.created/deleted, session.created/updated/deleted, call.deleted, call.delete.failed, call.artifact.upload and campaign.predial. There are 8 response schemas (assistant-request, handoff-destination-request, knowledge-base-request, tool-calls, transfer-destination-request, voice-request, call.endpointing.request, campaign.predial) although the spec text says only three messages expect a reply.",
    "observed", [f"{AP}/derived/server-message-union.json", WH, DIG])
add("AP-29", "webhooks",
    "Every webhook message shares an optional envelope: phoneNumber, assistantVersion (nullable label), timestamp, a live artifact, the full assistant config (CreateAssistantDTO), customer, the full Call object and chat. So every event can carry the whole prompt and call record, which is convenient for stateless handlers but means prompts and PII travel on every event unless trimmed by the receiver. Actual payload sizes were not measured (no calls).",
    "observed", [DIG, WH])
add("AP-30", "webhooks",
    "Reply shapes: assistant-request returns an assistantId or inline assistant/squad/workflow with overrides (per-call personalisation) or a destination to forward; tool-calls returns results[] or error; call.endpointing.request returns {timeoutSeconds}; campaign.predial returns {eligible:boolean} and anything else (missing, non-boolean, error, unreachable, timeout) records a pre-dial failure and places no call; voice-request is answered with raw audio; knowledge-base-request returns documents.",
    "observed", [DIG, OA])
add("AP-31", "webhooks",
    "Delivery config (Server object): url, timeoutSeconds 1-300 (default 20), headers, credentialId, staticIpAddressesEnabled, encryptedPaths, backoffPlan {fixed|exponential, maxRetries 0-10, baseDelaySeconds 0-10, excludedStatusCodes}. Default is no retries. Precedence is assistant.server, then phoneNumber server, then org server. Webhook credentials support OAuth2 (RFC 6749), bearer, HMAC (sha256/sha512/sha1, default header x-signature, timestamp header x-timestamp, default payload '{timestamp}.{body}', optional svix-id) and AWS IAM/STS.",
    "observed", [OA, f"{AP}/api-writes/create-assistant-response.json"])
add("AP-32", "webhooks",
    "Campaign events are a separate server-message set: campaign.started, cancelled, ended, archived, unarchived, contact.dispatched, completed, failed, skipped, predial-failed and campaign.job.continued. A blocking predial webhook lets the buyer veto each contact just before dialing (the natural hook for DND/consent), but Vapi supplies no scrub list itself.",
    "observed", [OA, f"{DOC}/outbound-campaigns__webhooks.md"])
add("AP-33", "webhooks",
    "end-of-call-report carries cost, costs[], endedReason, destination, the artifact (messages, OpenAI-formatted messages, transcript, recording/stereo/customer/assistant/pcap/log URLs with presigned variants and expiry, performanceMetrics, structuredOutputs, scorecards, transfers, nodes, assistantActivations, variableValues) and analysis (summary, structuredData, structuredDataMulti, successEvaluation).",
    "observed", [DIG, OA])
add("AP-34", "observability",
    "Per-call latency is exposed as data: PerformanceMetrics holds turnLatencies[] (modelLatency, voiceLatency, transcriberLatency, endpointingLatency, turnLatency per turn), averages of each, fromTransport/toTransport latency averages, and numUserInterrupted/numAssistantInterrupted counts. This is vendor-measured on Vapi's side, not handset-side, so it cannot show the delay the caller hears (unknown how it relates; needs the call-battery phase).",
    "observed", [OA])

# ---------------- billing ----------------
add("AP-35", "billing",
    "Billing is metered as typed cost lines in USD on each call: transport (provider daily|vapi.websocket|twilio|vonage|telnyx|vapi.sip, minutes), transcriber (minutes), model (prompt, completion, cached and reasoning tokens; seconds for GPT-Live; OpenAI service-tier breakdown; usageComplete flag), voice (characters), vapi (minutes, subType normal|overage), voicemail-detection (text and audio tokens), analysis (summary|structuredData|successEvaluation|structuredOutput, tokens) and knowledge-base (tokens). costBreakdown aggregates transport, stt, llm, tts, vapi, chat, total plus token and character counts.",
    "observed", [OA])
add("AP-36", "billing",
    "Units: STT per audio minute (the docs' estimate counts both channels), LLM per token, TTS per character, Vapi hosting per call minute (VapiCost.minutes = endedAt - startedAt), post-call analysis and structured outputs as separate LLM-token lines, voicemail detection as audio/text tokens. The docs' cost estimator assumes 5 model requests per turn, 150 output tokens per minute and a 50% cache-hit rate where caching exists; long calls cost more than the estimate because history is resent.",
    "vendor-claimed", [f"{DOC}/assistants__model-intelligence__understanding-cost.md", "https://docs.vapi.ai/assistants/model-intelligence/understanding-cost"])
add("AP-37", "billing",
    "/analytics queries tables call and subscription, group by type, assistantId, endedReason, analysis.successEvaluation or status, and aggregate sum/avg/count/min/max/history over cost, costBreakdown.{llm,stt,tts,vapi,transport,analysis,ttsCharacters,llmPromptTokens,llmCompletionTokens,llmCachedPromptTokens}, duration, concurrency and minutesUsed. A two-query request we sent returned 200 with empty results; there is no per-contact or per-campaign cost group.",
    "observed", [f"{AP}/api-writes/analytics-request.json", f"{AP}/api-reads/analytics-response.json", OA])
add("AP-38", "billing",
    "Spend controls live on the Org object: billingLimit (max USD 1,000/month; above that 'contact us'), concurrencyLimit (deprecated, max 10), plus Stripe subscription fields and minutesUsed. They are not settable or readable with an API key (the /org routes 401), so spend caps are a dashboard feature.",
    "observed", [OA, f"{AP}/api-reads2/org.json"])
add("AP-39", "billing",
    "Actual billed numbers (invoice lines, real per-minute totals, balance, free-credit remainder, wallet, auto-reload) were not observable: no billable call was placed and the billing routes need a dashboard session. The public pricing figures (USD 0.05/min hosting plus pass-through) stand as vendor-claimed and are unchanged by this phase.",
    "unknown", ["research/2026-10-20/teardown/vapi/pricing.json", f"{AP}/api-reads2/org.json"])

# ---------------- knobs ----------------
add("AP-40", "knobs",
    "CreateAssistantDTO has 31 top-level properties: transcriber (14 provider variants), model (17), voice (20), firstMessage, firstMessageMode (speaks-first | model-generated | waits-for-user), firstMessageInterruptionsEnabled, voicemailDetection, clientMessages (19 types), serverMessages (28 types), maxDurationSeconds (10-43,200; default 600), backgroundSound (off|office|URL), modelOutputInMessagesEnabled, transportConfigurations, observabilityPlan (Langfuse), credentials/credentialIds, hooks, name (<= 40), voicemailMessage and endCallMessage (<= 1,000), endCallPhrases, compliancePlan, metadata, backgroundSpeechDenoisingPlan, analysisPlan (deprecated), artifactPlan, startSpeakingPlan, stopSpeakingPlan, monitorPlan, server, keypadInputPlan.",
    "observed", [OA])
add("AP-41", "knobs",
    "The model union names 17 providers (Anthropic, Anthropic-on-Bedrock, Anyscale, Cerebras, custom LLM, DeepInfra, DeepSeek, Google, Groq, Inflection, Minimax, OpenAI, OpenRouter, Perplexity, Together, xAI, and a Vapi-managed model). OpenAI knobs: model enum led by gpt-6-luna and the gpt-5.6 family plus realtime models, fallbackModels[], reasoningEffort, serviceTier (auto|default|fast|priority), temperature 0-2, maxTokens 50-10,000, promptCacheRetention in_memory|24h, promptCacheKey, numFastTurns, emotionRecognitionEnabled (default false), speaker/reasoner pair for GPT-Live.",
    "observed", [OA])
add("AP-42", "knobs",
    "Vapi also sells a 'white-label' stack where it, not the buyer, picks the engines: Vapi model and Vapi transcriber are selected by version (latest|1), the Vapi transcriber has turnTaking intelligent|manual and auto-detects language when none is set, and Vapi voice v2 'can use xAI-backed voices' (cloned voice ids go with v2). The Vapi voice schema has no fallbackPlan (other voice providers do).",
    "observed", [OA])
add("AP-43", "india-language",
    "Indic speech-to-text coverage, from the spec enums: Deepgram lists hi and hi-Latn (romanised Hinglish) plus bn, kn, mr, ta, te, ur and en-IN; ElevenLabs Scribe, Cartesia, Soniox and the Vapi transcriber list the 12 codes as, bn, gu, hi, kn, ml, mr, or, pa, ta, te, ur; Azure lists 11 Indian locales; Gladia 11; Google only Hindi and Bengali; OpenAI hi, kn, mr, ta, ur; Speechmatics bn, hi, mr, ta, ur; xAI only hi; AssemblyAI none (en, multi). Saved as a matrix.",
    "observed", [f"{AP}/derived/transcriber-indic-language-matrix.json", OA])
add("AP-44", "india-language",
    "The live API is stricter than the spec on language: transcriber {provider deepgram, model nova-3, language 'hi-Latn'} was rejected with 'language must be one of ... for nova-3 model: en, en-IN, ..., hi, ..., multi' (hi-Latn absent), so romanised Hinglish needs multi or hi on nova-3. A Vapi voice language 'xx' was rejected with separate v1 (40 codes, Indic only hi and ta) and v2 (adds bn, gu, kn, ml, mr, pa, te; plus 'auto') lists.",
    "observed", [f"{AP}/api-writes/invalid2-response.json"])
add("AP-45", "india-language",
    "No Indian speech vendor is a provider: the spec has zero mentions of Sarvam, AI4Bharat, Bhashini or Gnani, and none of the 14 STT, 20 TTS or 17 LLM variants is an Indian speech vendor (Smallest AI appears only as a voice). An Indian engine can be attached only through custom-transcriber, custom-voice (webhook voice-request) or custom-llm. The 22 stock Vapi voices are all labelled English with American, Canadian, British, Latin American or 'Indian American' accents (Sagar, Rohan, Naina); none is Hindi.",
    "observed", [OA, f"{AP}/api-reads/sdkop-voice-library-vapi.json", f"{AP}/api-reads2/voice-accents.json"])
add("AP-46", "turn-taking",
    "Turn-taking knobs: startSpeakingPlan.waitSeconds 0-5 (default 0.4); smartEndpointingPlan of vapi, livekit (waitFunction expression; documented English-only) or custom-endpointing-model (a call.endpointing.request webhook returning timeoutSeconds); customEndpointingRules (regex on the customer's or assistant's last words); transcriptionEndpointingPlan onPunctuation 0.1 s, onNoPunctuation 1.5 s, onNumber 0.4 s (each 0-3 s). stopSpeakingPlan numWords 0-10, voiceSeconds 0-0.5, backoffSeconds 0-10 (default 1). Accepted values were read back on our assistant.",
    "observed", [OA, f"{AP}/api-writes/readback-assistant.json"])
add("AP-47", "turn-taking",
    "The stopSpeakingPlan defaults are English word lists: 22 acknowledgementPhrases that never interrupt ('okay', 'yeah', 'right', 'uh-huh', 'mm-hmm' ...) and 20 interruptionPhrases that always interrupt ('stop', 'no', 'wait', 'but', 'actually', 'nope' ...). Nothing in the defaults covers Hindi backchannels or objections (haan, achha, theek hai, nahi, ruko), so a Hindi call must override both lists; whether the stock lists mis-fire on Hindi is inferred, not tested.",
    "inferred", [OA])
add("AP-48", "turn-taking",
    "Other call-behaviour knobs: backgroundSpeechDenoisingPlan (Krisp smart denoising, experimental Fourier), voicemailDetection by google | openai | twilio | vapi | off with a backoff plan (startAtSeconds, frequencySeconds, maxRetries), keypadInputPlan (enabled, timeoutSeconds 0-10, delimiters # or *), hooks on call.ending, assistant.speech.interrupted, customer.speech.interrupted, customer.speech.timeout (timeoutSeconds, triggerMaxCount) and session.created with actions say, tool call or message.add, and monitorPlan (listen/control URLs, optional bearer auth).",
    "observed", [OA, f"{AP}/api-writes/readback-assistant.json"])
add("AP-49", "turn-taking",
    "monitorPlan is documented to default to listenEnabled=true and controlEnabled=true, which would expose a live-listen URL and a live-control URL per call unless authentication flags are set. We always sent false, and a bare assistant stores no monitorPlan, so the default was not observed in a call (vendor-claimed).",
    "vendor-claimed", [OA, f"{AP}/api-writes2/min-assistant-create.json"])
add("AP-50", "voice",
    "Voice config is per provider: 20 variants, e.g. ElevenLabs (stability, similarityBoost, style, speed, optimizeStreamingLatency, SSML, pronunciation dictionaries, model, language), Cartesia (model, language, generationConfig, pronunciationDictId), Azure (voiceId, speed), Deepgram (model, expressivity), OpenAI (model, instructions), Smallest AI, Rime, Inworld, Minimax (emotion, languageBoost), Microsoft (style, styleDegree, role), Hume, Neuphonic and others. Common to all: cachingEnabled (default true), chunkPlan (how model output is chunked before TTS) and a fallbackPlan (except Vapi voices).",
    "observed", [OA])
add("AP-51", "memory",
    "No cross-call memory resource exists: the spec contains no 'memory' field (all 4 hits are 'in_memory' prompt-cache retention), and the customer is inline. Continuity primitives are Session (messages[], status active|completed, expirationSeconds 60 s to 30 days, default 24 h, customer, assistant), Chat (sessionId or previousChatId, mutually exclusive), variableValues, the assistant-request webhook, per-customer overrides and best-effort sticky version routing by caller number. Anything longer-lived must be built by the buyer from the end-of-call artifact.",
    "observed", [OA, f"{DOC}/assistants__personalization.md"])
add("AP-52", "knowledge",
    "Knowledge is attachable three ways: v2 knowledge bases with files and retry (list returned empty), a query tool bound to a knowledge base, and a bring-your-own custom knowledge base reached by a knowledge-base-request webhook that must reply with documents. Knowledge-base token use is billed as its own cost line.",
    "observed", [OA, f"{AP}/api-reads/sdkop-knowledge-base.json", f"{AP}/api-reads/v2-knowledge-base-list.json"])
add("AP-53", "telephony",
    "Phone-number objects come in five provider types only: byo-phone-number (SIP trunk credential), twilio, vonage, vapi (free/US numbers with a sipUri) and telnyx; each has fallbackDestination, hooks, a server override and an assistant/squad/workflow binding. There is no Indian carrier type (no Plivo, Exotel, Ozonetel, Tata or Airtel); an Indian carrier can be attached only as a BYO SIP trunk. Our org holds none (list empty).",
    "observed", [OA, f"{AP}/api-reads/phone-number-list.json", f"{AP}/api-reads/v2-phone-number-list.json"])

# ---------------- cross-check ----------------
add("AP-54", "cross-check",
    "Cross-check of the public phase: VAP-11 (74 paths, 1,018 schemas), VAP-13 (638 endedReason values) and VAP-14 (29 server-message types) are reproduced exactly from the account-phase copy of the spec. VAP-30 is refined: the spec names 14 STT, 17 LLM and 20 voice variants (including custom and Vapi-managed ones), not 11/18/15. VAP-12 (dashboard uses about twice as many paths as the public spec) is explained: the public web SDK ships 137 paths.",
    "observed", [OA, f"{AP}/derived/server-message-union.json", f"{AP}/derived/web-sdk-ops.json", "research/2026-10-20/teardown/vapi/claims.json"])
add("AP-55", "cross-check",
    "VAP-42 (no Indian termination) cannot be re-tested without buying or importing a number, but the API schema is consistent with it: the only phone-number providers are byo-phone-number, twilio, vonage, vapi and telnyx, and there is a free-number inbound-only rule in the docs. The BYO-SIP route is the single way an Indian carrier could be attached, and the Plivo guide says Vapi does not support Indian-server termination.",
    "inferred", [OA, f"{DOC}/advanced__sip__plivo.md"])
add("AP-56", "cross-check",
    "VAP-60 (no memory) is confirmed at the schema level (see AP-51). VAP-58 (draft agent does not hold the prompt) now has a mechanism: draft and publish are separate objects, PATCH publishes immediately, and drafts are sparse diffs on a base version; this reads as a design that can lose or bypass edits, but no draft-loss was reproduced (unknown).",
    "inferred", [f"{AP}/api-writes2/draft-create.json", f"{AP}/api-reads/sdkop-assistant-versions.json", "research/2026-10-20/teardown/vapi/claims.json"])
add("AP-57", "cross-check",
    "Limits and pre-registered prediction VAP-P10 inputs: our subscription concurrency is 4, simulation concurrency 2; no real invoice exists yet, so VAP-P10 (INR 12-18 per connected minute) stays untested, as do VAP-P01 to P09 (they need the dashboard, a number and calls).",
    "observed", [f"{AP}/api-writes2/call-invalid-empty.json", f"{AP}/api-reads/sim-concurrency.json", "research/2026-10-20/teardown/vapi/predictions.json"])
add("AP-58", "compliance",
    "The API offers compliance toggles but no India compliance objects: hipaaEnabled, pciEnabled, securityFilterPlan, recordingConsentPlan (stay-on-line or verbal), per-assistant recording/logging switches and custom S3/GCP storage for recordings, logs and pcaps. There is no DND/NCPR, DLT, consent ledger, suppression list, calling-window or retry-policy object anywhere in the 1,018 schemas.",
    "observed", [OA])
add("AP-59", "hygiene",
    "All probe objects we created (two assistants, a squad, a tool, a structured output, a scorecard, a simulation scenario, two drafts) were deleted; each DELETE returned 200 with the object. Not removable via the API: traffic-allocation rows (no delete route) and any version history. Remaining seeded objects are untouched. No call, campaign, number, simulation run or chat was created; no credit was spent.",
    "observed", [f"{AP}/cleanup/del-assistant.json", f"{AP}/cleanup/del-min-assistant.json", f"{AP}/api-reads2/post-cleanup-assistant-list.json", f"{AP}/api-reads2/ta-after-delete.json"])

add("AP-60", "surface",
    "The chat-driven builder (Composer) has no API surface: across the 74 paths and 1,018 schemas its only trace is a file purpose value 'composer-attachment' on /file. Setup by chat is therefore a dashboard feature, not something a buyer's own agent or an LLM client can drive through the REST API (the MCP server package covers only assistants, tools, calls and phone numbers).",
    "observed", [OA, f"{AP}/sdk-npm-cli/mcp-server/x/package/dist/tools/assistant.js"])
add("AP-61", "surface",
    "Config-as-code is built into the schema: simulation scenarios, personalities and simulations carry an optional 'path' field (up to 3 folder levels, regex-restricted) documented as mapping to a GitOps resource folder structure, i.e. the dashboard objects are meant to round-trip to files in a repo.",
    "observed", [OA, f"{AP}/api-writes2/scen-create.json"])

# ---------------- validation ----------------
paths = set()
bad = []
for c in C:
    for e in c["evidence"]:
        if e.startswith("http"):
            continue
        p = os.path.join(ROOT, e)
        if not os.path.exists(p):
            bad.append((c["id"], e))
if bad:
    print("MISSING EVIDENCE", bad)
    sys.exit(1)
out = os.path.join(ROOT, "research/2026-10-20/account-phase/vapi/claims.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(C, open(out, "w"), indent=1, ensure_ascii=False)
import collections
print(len(C), collections.Counter(c["grade"] for c in C))
