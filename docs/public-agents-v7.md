# Public company voice and chat — v7

The public page is `/talk/{publicId}`. It contains AI disclosure, the owner-authored brand and welcome message, a saved-transcript notice, text chat, and (for a `web_voice` deployment) microphone voice and **Listen & type**. It needs no workspace login. A visitor is always anonymous and unverified; typing a name does not match or grant access to a customer record.

Publication is explicit and disabled by default. The deployment registry owns tested release binding, current publishing-owner authority, exact allowed origins, acknowledgement of public knowledge selection, and daily/network/concurrency/duration/turn limits. Only selected approved company sources and the published tested task configuration enter inference. Customer records, private relationship memory, GroupAI, unselected sources and tool capabilities do not enter public context. The full prompt, source text and internal IDs are not returned by public metadata routes.

## Hosting

Run Next and a separate long-lived Node WebSocket gateway against the **same durable database**. Do not put the gateway in a short-lived request function. Production replicas should share PostgreSQL; separate SQLite files cannot coordinate capability or quota state. A single-host setup may share one persistent SQLite file with filesystem locking supported.

Gateway entry: `scripts/voice-gateway.ts`; production bundle uses the packaging voice-gateway Docker target. It listens on `PUBLIC_VOICE_GATEWAY_HOST` (default `0.0.0.0`) and `PUBLIC_VOICE_GATEWAY_PORT` (default `3001`). `GET /health` is a liveness response, **not** a provider access or DB readiness probe. WebSocket path: `/voice`. TLS ingress must support WebSocket upgrades. No Azure session starts at process startup or health checks.

Required server environment:

- `APP_URL`: the HTTPS Next application origin.
- `PUBLIC_SESSION_HASH_SECRET`: stable random secret of at least 32 characters for privacy-preserving network quota hashing. Do not expose it to browsers.
- `PUBLIC_VOICE_GATEWAY_URL`: externally reachable `wss://…/voice`. This is read at runtime by the bootstrap API; no `NEXT_PUBLIC_*` build setting is needed. Local testing accepts `ws://127.0.0.1:3001/voice` and localhost equivalents.
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`, optional `AZURE_OPENAI_REALTIME_VOICE` (default `marin`). Use the existing approved resource and deployment. `VOICE_PROVIDER=azure` is required by publication authority. Existing private WebRTC settings remain unchanged; this public gateway uses its own WebSocket transport.
- Azure text deployment variables already used by `runAiTask('answer')`, and optional `AI_DAILY_ORG_TOKEN_BUDGET`.
- `DATABASE_URL` or the shared persistent `SQLITE_PATH`.

`PUBLIC_TRUSTED_IP_HEADER` is optional. Set it only to a header that the trusted ingress removes and overwrites with the actual visitor address. Without it, all visitors share a conservative `unknown` network quota bucket. Never accept arbitrary client-supplied forwarded headers as verified identity.

For local startup with ignored development environment configuration: `node --env-file=.env.local --import tsx scripts/voice-gateway.ts`. Production injects environment at deployment. Do not print environment values or capability tokens in logs.

Embedding uses the public `/talk` URL in an iframe. Add `allow="microphone"` for microphone voice; Listen & type and chat do not request microphone permission. Scope `frame-ancestors` to the deployment’s allowed parent origins, while keeping workspace/admin pages unframeable. Inside an iframe, requests originate from the Next application origin, not the parent site. The deployment origin policy must admit the application origin as well as the intended embedding origins. The app proxy and hosting headers own framing policy.

## Runtime protocol and limits

1. `GET /api/public/agent/{publicId}` returns only sanitized metadata and gateway URL.
2. `POST …/session` with `{purpose: 'voice' | 'chat', requestId}` issues a short-lived opaque DB-backed capability and rotating nonce after publication, origin and quotas are checked. Duplicate issuance IDs fail without creating another capability. Tokens and nonces are held in browser memory, never in URLs/localStorage, and only hashes are stored in the registry.
3. Voice connects to `/voice`; its first JSON frame is `{type: 'authenticate', token, nonce, inputMode}`. No cookie is sent as public authority. The gateway consumes the purpose-bound nonce and claims one permanent voice activation per capability before opening Azure. Reconnect cannot reuse that activation.
4. Azure uses the existing GA protocol: `wss://{validated-Azure-host}/openai/v1/realtime?model={deployment}`, with the resource key in the **server-only** `api-key` header. Provider redirects are disabled. The session is `type: realtime`, 24 kHz mono PCM16, no tools, `max_output_tokens: 2048`. The gateway accepts both GA `response.output_audio.*` and older `response.audio.*` event names.
5. Browser messages are restricted to bounded PCM audio, visitor text with a request ID, interrupt with known item/playback offset, and stop. Raw provider messages, tools, system roles and session updates are rejected. Frames are capped at 32 KB, audio frames at 12 KB, client messages at 60/second, and both socket backpressure and aggregate audio are bounded.
6. VAD commits input without automatically generating a response. The server waits for the captured user transcript, compiles current-call relational behavior from explicit language/address/repair/pacing/pause statements using published language constraints and **no private relationship context**, updates provider instructions, rechecks authority and consumes a turn before requesting speech. Listen & type follows the same path. An untranscribed turn times out and ends visibly.
7. The gateway rechecks publishing authority/source/release/limits every two seconds and before billed responses. Duration expiry, stop, disconnect, revoked authority, quota, protocol error and uncertain provider outcome immediately terminate the upstream socket. There is no automatic paid reconnect or replay. Interrupt stops scheduled browser audio, cancels a response and truncates only the known provider item to the bounded played offset.
8. Text uses `POST …/chat` with capability, nonce, unique request ID and message. The server holds conversation history, uses `runAiTask('answer')` on Azure, serializes concurrent turns, and rechecks authority before delivery. Uncertain replies are saved as uncertain and cannot silently retry under a new ID in that conversation.

The greeting counts toward the voice turn cap. Each session is limited to the registry’s TTL (maximum 600 seconds). Browser mode switches explicitly start a new purpose-bound session and therefore consume a new session allocation. No automatic fallback silently starts paid inference.

The native voice ceiling is 2,048 tokens per response because one bounded live opening at the earlier 700-token ceiling returned `incomplete` / `max_output_tokens`, with 703 output tokens and zero output-audio tokens, before any speech or visitor audio. The higher ceiling leaves room for provider generation overhead; it does not request longer spoken replies. Voice instructions still ask for one or two short sentences, normally at most 45 spoken words and one question. Exact configured session duration and TTL guards remain unchanged (including the 180-second smoke deployment). Incomplete responses remain visible, retain captured evidence, end the session and never automatically retry. Text-chat output remains separately bounded at 700 tokens. No reasoning-effort parameter was added. This ceiling is not a cost estimate, cost saving, voice-quality claim or guarantee that every response will complete.

## Captured records and verification

Completed transcript events are durably saved under `public:conversation`, with anonymous/unverified identity, public channel and server-captured provenance. Voice end, explicit chat close and uncertain chat completion also create an immutable canonical `session` record for the existing Conversations/review/learning flow. It includes the frozen public configuration, selected source IDs, deployment/release binding, Azure provider, outcome, captured transcript, input mode and replayed relational evidence. It has no `contactId` or campaign binding. Publisher revocation stops new inference but does not prevent saving historical evidence already captured. A process crash may leave a durable public transcript without its final canonical projection; no external delivery is claimed for that outcome.

The conversation also freezes the issued deployment revision and explicit `autoLearning` opt-in. Only a newly saved canonical session can enqueue the opt-in learning job; the learning helper verifies its matching private server receipt and current authority. Existing conversations and historical sessions are not backfilled when opt-in or the worker flag later changes. Learning enqueue failure cannot discard the saved transcript or prevent session cleanup. Starting voice/chat never starts the learning worker.

Offline tests: `npx tsx --test tests/public-agent*.test.ts`. They use actual local WebSocket connections to a fake upstream and in-memory SQLite registry fixtures. Coverage includes protocol/origin/auth rejection, no raw provider passthrough, task configuration, selected-source isolation, PCM and truncation, hard duration, authority withdrawal, quota/failure/no-reconnect behavior, captured-transcript relational updates, server-held text history, historical projection after pause, and uncertain-request non-replay.

These offline tests invoke no paid inference and do not establish live Azure availability, browser microphone quality, human-rated speech quality, mobile-device compatibility or successful external deployment. The separately observed live opening failure above explains the bounded ceiling change; it is not evidence of a successful microphone call or improved audio quality.
