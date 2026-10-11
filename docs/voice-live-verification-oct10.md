# Private Azure Voice Live adapter verification — 10 October 2026

Status: **post-fix implementation/build pass; post-9c live/UI proof and hosted readiness remain open**. Adapter checkpoint is `8e408fa`; post-fix checkpoint is `9c90644`. Focused/independent review and build pass. The successful actual preview predates `9c90644`; no post-9c live call occurred. This does not establish dynamic-rate success or voice quality.

## Objective and non-goals

Implement one opt-in, application-authorized private Azure Voice Live path for the already reviewed Diya/Arjun teacher-voice direction. Preserve the current provider-neutral authority, relationship behavior, delivery profile, call admission, cancellation, tool and evidence boundaries.

This is not a provider migration, automatic fallback, Tavus/Griffin integration, telephone channel, cloned voice, public deployment or claim of better Hindi/Hinglish quality. The existing Azure OpenAI Realtime route remains available and unchanged unless an operator explicitly selects the supported new adapter.

## Shared delivery contract

`docs/speech-delivery-contract-oct10.md` remains authoritative. An operator freezes an agent base profile at standard 1.0 or unhurried 0.9. When adaptation is enabled, only explicit committed final caller requests can change pace during a call. Interim ASR, tentative sidecar text, assistant text, inferred emotion, brevity, quotation, negation, third-party and ambiguous language cannot change speed.

Voice Live has a different wire/configuration contract from Azure OpenAI Realtime, Speech SSML and any Taxila/Chatterbox source. Adapter code must expose unsupported controls rather than translating fields silently. A provider acceptance or echoed configuration is protocol evidence only, not proof of perceived pace, pronunciation, naturalness or emotional quality.

## Composition and admission authority

Before any provider contact, the application must issue a one-use, expiring, origin/user/organization-bound composition ticket for an authorized private call. Issuance requires current membership, explicit consent, admitted-pilot entitlement, finite allowance and an available durable voice-attempt slot. Claim must be atomic and replay-safe.

Azure credentials and provider tokens remain server-side. The ticket carries no secret. Provider create/start, uncertain create, cancellation and terminal settlement bind to the exact reserved attempt and configuration fingerprint. Revocation, membership loss, expiry, duplicate claim, disconnect and shutdown fail closed. A timeout or missing provider acknowledgement retains uncertainty rather than fabricating success or closure.

## Provider configuration and handshake

Pure provider configuration freezes:

- agent and version identifiers;
- supported Diya/Arjun voice selection;
- approved language and disclosure instructions;
- versioned delivery profile and current explicit decision;
- model/API version and provider location reference;
- VAD/cancellation settings and capability map; and
- a configuration digest that excludes secrets and raw customer text.

Handshake validation must check the exact expected session/protocol shape and acknowledged supported controls. Provider event IDs, session IDs and audio are runtime-private. Missing, partial, stale or mismatched acknowledgement cannot authorize response generation or a persisted pass.

Four real configuration-only WSS checks occurred. The first Diya and Arjun checks accepted voice, 16 kHz PCM input, 24 kHz output, transcription, VAD and tools disabled; ACK observations were 1,771 and 1,565 ms. A third check with populated tools failed because a function definition omitted required `type`. After the documented fix, exactly one new post-fix check passed exact ACK at 2,196 ms with three tools and a bilingual prompt. The mini model normalized to the provider global-standard name and modalities used provider order.

Every check sent configuration only: zero `response.create`, response audio, conversation items or current-turn inference. ACK times are handshake observations, not response/acoustic/end-to-end latency.

Existing Azure catalog GETs, Speech TTS samples, Realtime proof runs and source research remain separate evidence.

## Private gateway lifecycle

The private gateway owns ticket authentication, provider allocation, bounded media/control forwarding, reauthorization, backpressure, deadlines and cleanup. It must enforce one start, one owned provider session, bounded bytes/duration/callbacks, no reconnect loop and idempotent close. Late authorization, provider and socket callbacks cannot resurrect a closed generation.

Public voice and the existing private Realtime/Speech sidecar protocols remain separate. The historical running public gateway process is not evidence for Voice Live. No query-string credentials or client-held provider keys are allowed.

## Browser lifecycle

The browser explicitly opts in, reuses the already-authorized microphone stream and never requests a second microphone. It must maintain native mute/end authority, stop capture immediately on End, send one idempotent control request, render connecting/ready/unavailable/uncertain/ended states truthfully and isolate adapter failure from saved evidence.

Only owned response/session events may create assistant transcript or audio state. Existing one-shot opening and response-ownership guards remain mandatory. Unmount, route changes, rapid retry, stale async callbacks and page close need deterministic cleanup.

## Agent Studio UI

Agent Studio may expose the supported adapter and Diya/Arjun choices under Voice & language/Teacher voice, with clear experimental/private labels and provider capability limits. Saving creates a new immutable candidate version; it cannot mutate an active release. Current checks, audio proof and explicit publish boundaries still apply.

The UI must not imply that a catalog voice has been auditioned, that an adapter is connected, or that production voice quality passed. Unsupported regions/voices/configuration show unavailable rather than silently reverting to another paid path.

## Evidence at this checkpoint

- Clean baseline: `848e166`; adapter source is committed as `8e408fa` (35 files, 3,362 lines).
- Pure provider configuration: **7 tests plus TypeScript**.
- Live-voice contract: **7 tests**, plus **38** snapshot/deny/wrong-engine guards.
- Composition/authority: **10 tests**; usage/admission: **19 tests**.
- Local Voice Live host: **15 tests**, including actual local WebSocket transport.
- Private gateway: **14 tests** plus **55 legacy** voice-gateway checks.
- Root routes: **6 tests**.
- Post-suite exact-engine route delta: **8/8**.
- Agent UI selectors: implemented, detector clean, TypeScript passing.
- Browser lifecycle: **9 tests**, including queue/cancel behavior.
- Seven configuration-only checks are bounded here; one tool-schema failure and one in-session rate mismatch remain retained.
- No Voice Live generation/inference, response audio, conversation item, browser call, audio artifact or human listening result exists.
- No cloud mutation, deployment, Docker action or new provider has occurred.

Independent authority review reports no P1/P2. Causality review found and owners fixed four defects: grant TTL stopping a live call at 60 seconds, tool-continuation audio overlap, a ready callback after End, and regressing played watermark after barge-in.

Initial full automation passed **1,133/1,134**. The sole failure asserted old “evaluation-only” UI copy after the canonical private-only blocker changed. Corrected automation passes **1,134/1,134** in 210.389 seconds; retained log is `data/oct10-voice-live-corrected-tests.log`.

Final production build/typecheck/postbuild package passes with **1,212 entries**; retained log is `data/oct10-voice-live-final-build.log`. Packaged web and the newly compiled private Voice Live gateway both return readiness HTTP 200. Existing public gateway remains untouched. A dedicated Voice Live host and remote-only Dockerfile target exist; no Docker execution occurred.

Packaged Agent UI selected Diya Live, Hinglish/Hindi/English, retained 1× with explicit-request adaptation, and Company Knowledge backed by one approved fictional source. Save created Feedback draft revision 5; active published v1 stayed unchanged.

The first actual Voice Live UI attempt failed before ready with `invalid data`. UI evidence reports zero live seconds and zero transcript; no generated audio was observed. The durable Voice Live attempt closed with zero stop attempts; ticket failure and tool-ended evidence were persisted. Provider egress counts were not captured, so this record does not assert that no inference occurred.

Exactly one configuration-only check against the same failed frozen profile reproduced the mismatch: all fields matched except omitted prompt versus Azure `null`, with ACK at 2,019 ms. The matcher now normalizes only undefined/null prompt equivalence; populated prompt comparison stays strict with **7 tests**. Browser pre-ready masking passes **10**, host bounded phase diagnostics **18**, and combined startup-focused checks **57/57**. The corrected private gateway bundle is 270.6 KB and is running; the older private process was stopped. Public gateway remains untouched.

A sixth configuration-only sequential-rate check acknowledged initial 1.0, then echoed an in-session 0.9 request as 1.0. A seventh check configured initial Diya 0.9 and received exact ACK in 1,969 ms with one tool, absent-prompt/null normalization and zero audio/items/`response.create`. Initial 1.0 and initial 0.9 are accepted; in-session 1→0.9 is not established. None of these timings are acoustic or response latency evidence.

The second actual Diya preview connected and delivered a Hindi opening. A typed Roman-Hinglish company question caused one `search_company_knowledge` request, one available result and a grounded answer. Repeated AI introductions and an answer around 90 words were undesirable. A typed explicit Hindi slower request selected 0.9, but exact ACK timed out and ended the call after roughly 2:11 with five entries.

Host summary reports ready true, closure/settlement true, four session updates, four ACKs, three exact matches and 133,408 ms elapsed. Both Voice Live attempts are closed; two historical native-Realtime uncertain attempts remain untouched. This establishes connectivity and bounded company-tool grounding, not successful adaptive rate, concise behavior, pronunciation, naturalness, perceptual quality or whole-flow readiness.

A phase-aware prompt, fixed-rate capability/UI and frozen voice/language header are committed in `9c90644`. Combined focused checks pass **83/83** and independent scoped audit reports no P1/P2. Production build/typecheck/postbuild package passes with **1,212 entries**; retained log is `data/oct10-fixed-live-build.log`.

The successful second actual preview occurred after the null-prompt startup fix but before the `9c90644` phase-prompt, fixed-rate and frozen-header changes. It used the correct Azure engine, saved five entries with one available tool receipt and closed. It establishes startup routing, saved evidence and bounded tool availability only. No third or post-`9c90644` call occurred, so the later prompt/rate/header changes have offline/build evidence but no live wording or rate result. Two historical native-Realtime uncertain attempts remain separate and untouched.

On October 11, browser reload stalled after a host interruption. CUA inventory contained no browser surfaces and creating the in-app browser returned unavailable. No third Voice Live call, post-fix live wording/listening check or desktop/mobile visual QA occurred. Packaged app and private gateway remain running; app readiness returns HTTP 200. This environment failure is not an application verdict.

## Terminal gates

- complete packaged browser/UI finish review and optional listening evidence; do not infer perceptual quality from the closed preview;
- rerun browser/visual verification only after an available browser surface returns;
- browser-verify explicit opt-in, unavailable/configuration errors, ready/live/mute/end/uncertain/save paths and immutable candidate behavior at representative widths;
- keep any further bounded Azure tests deliberate with no automatic retries or fallback, and preserve every failed/uncertain attempt; and
- require captured audio plus explicit human listening before any pronunciation, naturalness, emotion, latency or quality claim.

Keep credentials, endpoints, resource IDs, session IDs, tickets, call IDs, fingerprints, customer material, transcripts, raw audio and provider payloads out of continuity. Azure remains the only authorized paid provider. Do not use Docker on this laptop.

## Hosting continuation boundary

Microsoft.Web provider registration was authorized earlier. A partial apply created a B2 plan, three empty apps, VNet/DNS, logging and budget; PostgreSQL failed on the East US 2 subscription restriction and was never created. No source was deployed.

Cleanup is complete for the exact seven approved owned targets: B2 plan, three apps, DNS link, VNet and DNS zone all return 404. Budget remains HTTP 200, and audited shared-inventory counts are unchanged. The first deletion timeout and temporary DNS 409 remain in the owner record; eventual exact readbacks confirm removal. No role or unrelated workload changed. Incurred usage is not refunded, but ongoing dedicated-plan billing ended.

Hosted readiness remains false. The reviewed PostgreSQL smoke script remains unrun because no database exists. Supported-region read-only checks are next. Voice-settings bounded fetch/retry and audio-table readiness source are frozen with final verification pending. Private alert parameters remain excluded.

Frozen continuation automation passes **1,153/1,153**, zero failed or skipped, in 321.972 seconds. It includes async config-loader coverage, real-PostgreSQL-smoke refusal guards, missing audio-table/byte readiness regressions and prior Voice Live contracts. Retained log is `data/oct11-continuation-tests.log`.

Production build is running to `data/oct11-continuation-build.log`. The web preview stopped for the build; the private Voice Live gateway remains running. No browser check or new provider call occurred during this verification.
