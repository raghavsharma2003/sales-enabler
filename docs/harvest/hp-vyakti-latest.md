# Harvest: hp-vyakti-latest (html-portfolio, Vyakti cloning platform, Oct 10-11 2026)

Repo: `/home/user/html-portfolio`
Branches: `origin/claude/vyakti-cloning-platform-aq05n4` (canonical), `origin/codex/vyakti-azure-authmail-oct10` (isolated WIP)
Inspected read-only via detached worktrees on 2026-10-15. No remote state touched, no secrets copied.

## Summary

This is the most complete Vyakti tree: an "AI version of an expert/creator" platform built on top of the
Meera companion codebase. A creator signs in, feeds it material (text, documents, audio, YouTube, WhatsApp
exports), meets it (private text rehearsal, Mirror Call voice loop, a private Hindi voice test), and deploys it
(a public text publication with per-visitor memory, quotas, and as of Oct 10 one-use access passes; a follower
"Room" at `/r/<slug>` across web, Telegram, Discord and WhatsApp adapters).

The scale is very large: 349 files under `api/`, 165 SQL migrations, 525 eval entries, 19 `services/`
(Azure Container Apps GPU/CPU workers and evaluation runtimes), and a `context/` memory of about 7 MB
(1,033 rejection entries, 1,257 decisions, 1,046 measurements). The engineering discipline is unusually strong
and well documented: durable ledgers, HMAC service boundaries, SQL-predicate privacy, fail-closed provider
registries, and receipts for every live action. The product itself is mostly **unproven with real users**.
The only deployed web release is the Oct 9 protected Vercel preview. No real human sign-in, arbitrary-email
delivery, paid conversion, voice likeness or competitor result is measured. Production migration 173 failed
its in-transaction catalog assertion and rolled back (Oct 10-11).

For the command-centre, the value here is **patterns and infrastructure, not the product**. The best pieces
are the Azure Communication Services email outbox, the reserve/settle provider-budget ledger, the four-function
omnichannel surface contract, the Azure-only serving origin policy, the Vercel-to-Azure Container Apps hosting
adapter (with cron-to-ACA-jobs), the scale-to-zero GPU broker pattern and its lessons, and the eval and release-gate
culture. The persona/voice-cloning work is mostly specific to Vyakti.

## Branches covered

| branch | head | date | what it is |
|---|---|---|---|
| `claude/vyakti-cloning-platform-aq05n4` | `22267cd3` | 2026-10-11 | Canonical. About 1,402 commits since 2026-08-22, with the busiest days Sept 8 (106) and Sept 14 (123). Accepted application source is `32340565` (Node22 and Node24 each 25/25 release gates, Android passed). The last two commits are docs only (STATE, STOP-HERE handoff). |
| `codex/vyakti-azure-authmail-oct10` | `f7781cc3` | 2026-10-11 | Branched from merge-base `03c285b0` (Oct 10). It adds 4 commits: the durable Vyakti Azure auth email lane (migration 174), auth email preview/dispatch recovery hardening, a WIP recovery checkpoint (`9a8ac6b3`), and the bilingual (EN/HI) access-pass publication UI. It is **not merged, not deployed, and dark behind a server flag**. |

How they differ since `03c285b0`:
- **claude branch (+12 files, docs/tests only):** context entries for the access-pass Postgres proof, release 323 and the CPU voice image, the migration-173 production catalog mismatch, and the no-blind-retry decision. It also has fixes to test fixtures (`evals/first-five-minutes`, `evals/rehearsal/personal.mjs`) so they follow the optional email-code disclosure, plus a transaction-PID race-test fix and `docs/research/2026-10-10-access-pass-postgres.json`.
- **codex branch (+49 files, about 2k lines):** `api/_auth-email{,-azure,-crypto,-store}.js`, `api/auth-email-sweep.js`, `db/migrations/174_vyakti_auth_email_outbox.sql`, `evals/auth-email/run.mjs` (327 lines), `scripts/auth-email174-development.mjs`, auth-gate UI copy changes (an optional 6-digit code alongside the magic link), `MaterialSharePanel.tsx` / `PublicationApp.tsx` bilingual copy tables, `vercel.json` (+1 cron), and `docs/handoff/2026-10-11/AUTHMAIL-WIP.md`.

Neither branch contains the other's tip. A future merge needs codex's 4 commits replayed on top of `22267cd3`.

## Product

Read from `PRODUCT.md`, `CLAUDE.md`, `context/STATE.md`, `docs/handoff/2026-10-11/STOP-HERE.md`, and the code.

- **Journey:** Sign in, then "Feed it", then "Meet it", then "Deploy it". Studio at `/studio`, landing at `/`, follower Room at `/r/<slug>`. Capacitor wraps it for Android.
- **Feed:** sources (text, docx/pdf/image/link/WhatsApp export via `api/_context/*`), signed direct upload to a private Supabase bucket with ClamAV quarantine, YouTube audio extraction gated on owned-channel attestation (`services/media-extract`), voice enrollment (24 kHz PCM16 capture), and Azure Speech / Sarvam ASR adapters.
- **Person model:** cited, owner-reviewed claims become a versioned "Person Model" / "teacher sheet" (identity, speech, values, boundaries, never-say rules, language/register). There is explicit human approval before any persona update, and nothing mutates automatically.
- **Meet:** private text rehearsal in English, Hindi and Hinglish (Azure Foundry structured output, encrypted at rest). Mirror Call is a voice loop where the owner talks to their clone, sees fidelity meters and accepts or rejects learned "deltas". The private Hindi voice test runs Chatterbox on a private GPU.
- **Deploy:** text publication of chosen material plus a profile, with per-visitor memory opt-in, question quotas, retention terms, a USD budget cap, and **one-use access passes** (migration 173, up to 100 per publication, hash-only storage, claim binds one visitor, revoke refuses rejoin). The Room also exists for followers, with Telegram/Discord/WhatsApp adapters, payments (Razorpay adapter), push, check-ins and handoff.
- **Auth:** Supabase (Google plus email magic link). The Oct 10 WIP adds a Vyakti-only email lane that generates the Supabase admin magic link plus OTP and sends it via **Azure Communication Services Email**, because Supabase default SMTP only serves project-team addresses and the shared Supabase project's SMTP/hooks must not change.

**Real state (Oct 11):**
- **Verified:** release gates 25/25 on two Node versions. The private CPU voice image was updated and health returned 200. Migration 173 is applied and race-proven **in the dev DB only**. Earlier Oct 9 live evidence covers 8 invented questions, median 2,376 ms, recorded cost 23,186 microUSD. ACS Email and Communication resources exist and are linked.
- **Not done:** production migration 173 (rolled back). No Oct 10/11 deploy. The auth email lane has no key binding and has never sent an email. Human sign-in, voice likeness, paid conversion and PMF are unmeasured. The global DB check still shows 36 legacy Meera pointers.

## Architecture & stack

- **Frontend:** React 19, TypeScript and Vite. Multi-entry (`studio.html`, `room.html`, landing in `site/`). Capacitor 8 for Android. There are two studio trees: `src/studio/` (current personal studio) and `src/creatorStudio/` (the older creator/teacher studio). EN/HI copy registries are key-parity tested. A copy gate (`scripts/check-copy.mjs`) bans em/en dashes, AI-tell phrases and a "Room vocabulary" (clone, model, training, embedding...) in user-visible surfaces.
- **API:** plain Node ESM serverless handlers in `api/*.js` (Vercel functions). Underscore files are shared modules. Provider registries live under `api/_<domain>/{contracts,registry}.js` with `providers/*` and a `fake.js` that production refuses.
- **DB:** Neon Postgres via SQL-over-HTTP (`api/_db.js`). The schema is mirrored in `db/schema.sql`, which a gate checks. Migrations follow strict rules: idempotent, one statement per request, no DO blocks, explicit `::uuid` casts, and wired into erasure and relational checks.
- **Prompt engine:** `src/engine/compiler.ts` (2,076 lines) is the single `compile()` for every lane, taking an injected `AgentModule` with no persona fallback. `scripts/build-engine-bundle.mjs` bundles it to `api/_engine.gen.js`, and a gate checks the bundle is fresh. `honesty.ts`, `shapelint.ts` (it lints prompts for recitable sentences) and `scripts/check-prompt-budget.mjs` add a throw-on-truncation budget.
- **Reply door:** `api/_surface.js` `gatedReply()` is "the one door". Every reply passes the honesty gate and the owner's never-say predicate (`_never-rules.js`, which deliberately imports nothing). Retrieval privacy is SQL (`api/_disclosure.js`, `_room-memory-authority.js`).
- **Model serving:** Azure AI Foundry. `api/_dialogue/providers/azure-foundry.js` uses `/models/chat/completions` with structured output, a bounded streaming JSON reader, deadlines, and a provider-revision binding. `api/_azure.js` is an OpenAI-v1-compatible Foundry fallback lane. `api/_model-serving-policy.js` enforces an Azure host allowlist when `VYAKTI_MODEL_SERVING=azure_only`. Paired bake-offs used gpt-4.1-mini and Mistral-Large-3. Embeddings (`text-embedding-3-small`) are deployed but not bound, so current retrieval is **lexical**.
- **Voice / GPU:** Azure Container Apps, with T4 GPU apps scaled to zero behind a small public CPU **admission broker** that checks HMAC, nonce and timestamp before waking the private GPU. Pieces: `services/open-voice-runtime` (Chatterbox Multilingual), `voice-evidence` (ECAPA/x-vector, SepFormer, DeepFilterNet), `audio-protection` (AudioSeal watermark plus C2PA signed by a Key Vault key), `replica-processing-worker` (an ACA **Job**, run-to-completion), `internal-voice` and `private-voice` (CPU lane), `voice-finetune` (LoRA). There are also isolated bake-off runtimes for IndicF5, MOSS-TTS, VoxCPM2, ZONOS2, Qwen3-TTS and OpenVoice.
- **Hosting:** Vercel today (24 cron entries in `vercel.json`, with Git auto-deploy disabled and CLI releases only). `services/azure-web` is a **non-deployed** Azure Container Apps adapter that serves the same Vite build and `api/*` handlers, compiles the Vercel rewrites and headers, and turns the `vercel.json` crons into ACA Jobs via Bicep (`enableSchedules=false` until cutover).
- **Ops discipline:** "intents" are single-use consumed authorizations for live actions, with root-owned JSON receipts, guarded operators, and independent read-only observers after every write.

## Reusable assets

| asset | paths | maturity | reuse for | effort |
|---|---|---|---|---|
| ACS Email durable outbox (sends a magic link or any transactional mail via native Azure Communication Services REST with HMAC-SHA256 signing, no SDK; a stable Operation-Id/Repeatability-Request-ID; state machine admitted, preparing, prepared, dispatching, pending, then succeeded/failed/reconcile_required/expired; payload envelope-encrypted with AES-256-GCM plus a KEK with AAD binding; payload erased at terminal state; a sweep cron for reconciliation; a sequence-capped pilot slot) | `api/_auth-email.js`, `api/_auth-email-azure.js`, `api/_auth-email-crypto.js`, `api/_auth-email-store.js`, `api/auth-email-sweep.js`, `db/migrations/174_vyakti_auth_email_outbox.sql`, `evals/auth-email/run.mjs` (codex branch) | tested (offline plus dev script; **never sent a real email**) | campaigns, omnichannel, auth-tenancy, infra-ops | adapt |
| Provider budget ledger (reserve, then begin, then settle/release/uncertain; conservative token estimate; one atomic CTE that both checks the limit and inserts an idempotent reservation keyed by request hash; meters for Foundry tokens, Azure Speech audio-hours, Personal Voice chars, vendor voice) | `api/_provider-budget.js`, `evals/provider-budget/run.mjs`, `vy_provider_budget`/`vy_provider_spend` in `db/schema.sql` | production (live receipts on Azure calls) | orchestration, analytics, voice-agent, chat-agent, infra-ops | drop-in |
| Azure-only serving origin policy (host allowlist for openai/services.ai/cognitiveservices/containerapps/speech; refuses non-Azure providers when the flag is set) | `api/_model-serving-policy.js` | production | orchestration, infra-ops, safety | drop-in |
| Azure Foundry structured-output dialogue adapter (bounded streaming reader, deadline/abort composition, retryable error taxonomy, provider-revision binding, budget meter) | `api/_dialogue/providers/azure-foundry.js`, `api/_dialogue/contracts.js`, `api/_dialogue/registry.js`, `api/_azure-surface-reply.js` | production | chat-agent, company-brain, voice-agent | adapt |
| Omnichannel surface contract (an adapter implements only verify/parse/send/render; identity, room, recall, compile, gate and logging are shared once; memory is never keyed by surface) | `api/_surface.js`, `api/tg.js`, `api/discord.js`, `api/whatsapp.js` (WhatsApp Cloud API: X-Hub-Signature-256, 24h window refusal, not live-wired), `docs/SURFACES.md`, `docs/SPEC-AGENT-LAYER.md` | tested (Telegram live earlier; WhatsApp offline only) | omnichannel, chat-agent, crm | adapt |
| Structural disclosure / SQL-predicate privacy (retrieval ACL as WHERE clauses rather than prompt rules) | `api/_disclosure.js`, `api/_room-memory-authority.js`, `evals/room-leak/run.mjs` (367 checks), `evals/mp/gate0.mjs` | production | company-brain, auth-tenancy, safety | idea-only / adapt |
| One-use access pass / invite code pattern (hash-only codes, mint cap via counter plus check, claim binds one user with a partial unique index, revoke refuses rejoin, race-proven with blocked concurrent transactions) | `db/migrations/173_text_publication_access_pass.sql`, `api/_text-publication-store.js`, `evals/text-publication-access-pass/{run,live-race}.mjs`, `docs/research/2026-10-10-access-pass-postgres.json` | tested (dev DB race proof; prod migration failed) | auth-tenancy, campaigns, lead-gen | adapt |
| Published-material assistant runtime (owner publishes material plus profile; visitor quotas, retention, budget, per-visitor memory opt-in, bounded long-source excerpt retrieval) | `api/_text-publication-runtime.js`, `api/_text-publication-store.js`, `api/_text-publication-source.js`, `api/_text-publication-memory.js`, `src/engine/publishedMaterialAssistant.ts`, `src/studio/publication/*` | tested | chat-agent, lead-gen, company-brain | adapt |
| Vercel-to-Azure Container Apps hosting adapter (serves Vite static plus Node handlers, parity routing/headers from vercel.json, crons to ACA Jobs in Bicep, source-commitment manifest, runtime config regeneration from env/Key Vault, host pinning) | `services/azure-web/*` (`server.mjs`, `routing.mjs`, `cron-runner.mjs`, `prepare.mjs`, `infra/main.bicep`), `evals/azure-build-config/run.mjs` | prototype (not deployed) | infra-ops | adapt |
| Scale-to-zero GPU behind an HMAC admission broker (a public CPU broker validates body HMAC/nonce/replay, warms the private GPU via /healthz, then re-signs with a fresh internal timestamp; a 202 "warming" state contract) | `services/open-voice-runtime/broker.py`, `services/*/infra/*.bicep`, `api/_voice/warmup.js`, `api/_voice/preview-panel.js` | production (deployed for voice) | voice-agent, infra-ops | adapt |
| ACA Job run-to-completion worker (leases N DB jobs, settles, exits, zero idle cost; ClamAV scan) | `services/replica-processing-worker/*`, `api/_replica-processing/{queue,worker,sweep}.js` | production | orchestration, infra-ops | adapt |
| Audio provenance (AudioSeal watermark, C2PA sidecar, Key Vault ES256 signing, audible AI disclosure prefix, ledger) | `services/audio-protection/*`, `api/_provenance/*` | tested | voice-agent, safety | adapt |
| Azure Speech ASR adapters plus Sarvam (sync/batch), byte-canonical seam | `api/_asr/providers/azure-speech-short.js`, `api/_asr/registry.js`, `api/_asr/contracts.js` | tested | voice-agent, omnichannel | adapt |
| Context ingest extractors (docx, pdf, image, link, WhatsApp export) | `api/_context/*.js`, `api/_context-locker.js` | tested | company-brain, crm | adapt |
| Prompt compiler with injected agent module, budget gate and shape lint (no fallback persona; throws on truncation; lints recitable sentences) | `src/engine/compiler.ts`, `src/engine/shapelint.ts`, `scripts/check-prompt-budget.mjs`, `scripts/build-engine-bundle.mjs` | production | chat-agent, voice-agent, orchestration | rewrite (port the pattern) |
| Release gate runner (typecheck, prompt budget, schema mirror, copy, contrast, layout, a11y, perf, headers, eval suite, relational orphan sweep, Node22/24 CI) | `scripts/verify-release.mjs`, `scripts/check-*.mjs`, `evals/run.mjs`, `scripts/relcheck.mjs` | production | eval-quality, infra-ops | adapt |
| Context memory system (graph.json plus decisions with reversal conditions, measurements with n/method/date, rejections; checker) | `context/*`, `scripts/context.mjs` | production | memory-learning, eval-quality | drop-in |
| Rate limiter, idempotent receipts, incident logging | `api/_rate-limit.js`, `api/_ratelimit.js`, `api/_receipt.js`, `api/_incidents.js`, `api/_obs.js` | production | infra-ops | adapt |
| Razorpay payments adapter (webhook verify, payouts) | `api/_payments/providers/razorpay.js`, `api/payments-webhook.js`, `api/payout-webhook.js` | tested | erp | adapt |
| Bilingual EN/HI copy registries with parity tests | `src/studio/*Copy*.ts`, `src/studio/publication/MaterialSharePanel.tsx` (codex), `evals/studio-locale*/` | production | design-ui | adapt |
| Mirror Call reducer (a pure phase machine for a live voice session with honest dropped-window states; fuzz-tested) | `src/studio/mirrorCallMachine.ts`, `src/studio/callCapture.ts`, `api/mirror-call.js`, `evals/mirrorcall.mjs` | tested | voice-agent | idea-only |

## Measured lessons

- **ACS email facts (2026-10-10, docs plus ARM reads):** ACS returns async 202 plus operation polling, honours Retry-After, and tracks repeatability for **5 minutes** only, with identical payload required. Supabase default SMTP refuses non-team recipients, and its default template has no numeric OTP. Resources `vyakti-auth-email-service` and `vyakti-auth-email-acs` reached Succeeded. Data location is US. Startup-grant eligibility for the email meter was **not verified**. (`context/measurements.md#vyakti-auth-email-*`)
- **Access-pass races (2026-10-10, dev DB, n=2 real blocked transactions):** a 99-to-100 mint cap had exactly one winner, and one pass bound to exactly one of two competing visitors. All 29 SQL shapes EXPLAINed. On pooled Neon, a PID read before BEGIN is not the transaction's backend.
- **Release 323 (2026-10-10):** 25/25 gates on Node22 and on Node24 (n=2) plus Android. This is not product proof.
- **Live answers (Oct 9):** 8 invented questions, median **2,376 ms**, cost **23,186 microUSD** total, all checked manually.
- **Paired Azure models (2026-09-07, n=12 calls):** gpt-4.1-mini against Mistral-Large-3, total about USD 0.0137 (GPT 5,777 and Mistral 7,954 microUSD).
- **Private rehearsal across 3 languages (2026-09-07):** real Azure, English, Hindi and Hinglish answers matched the requested script and order. 3 calls cost 1,475 microUSD, and reads/replays added 0 model calls.
- **Zero-shot voice clone fidelity (2026-08-26, n=2 runs):** ECAPA clone-vs-owner **0.7753** against a self-vs-self ceiling of **0.8869**. The verdict was "warn" (below the 0.78 band). x-vector gave 0.997, which is useless as a discriminator. This measures similarity, not how it sounds.
- **Hindi one-pass TTS (2026-09-02, n=2):** token-fragmented synthesis gave 25.98 s with 65% silence and ECAPA 0.434. One-pass gave 7.72 s with 25% silence and ECAPA 0.825. Never stitch per-token or per-language clips.
- **GPU cold start:** 161 s (runtime) and 176 s (evidence) from zero replicas. Warm Chatterbox is about 1 cent per 30 s of speech, while a cold request costs about 23 to 35 cents. Always-warm costs hundreds of dollars per month.
- **Azure realtime (`gpt-realtime-2.1-mini`) for calls:** barge-in median 271 ms (good). Vision was 5/5 with 0 fabricated. First audio was 1,458 to 1,497 ms, against 1,370 ms for the incumbent. **Register failed:** 41 to 53 words per turn against 20.5, with 14 s spoken turns. No Azure stock voice was plausible for the persona.
- **Structural disclosure:** prompt-instructed refusal while holding private data still leaks **9 to 90%**. Only retrieval exclusion is safe.
- **Prompt position:** a rule mid-brief fired 0 of 8 times, and the same rule placed last fired 8 of 8. Example quotes were recited 4 of 5 times, and 0 after removal (inherited Meera law).

## Rejected/failed approaches

- **Enabling global Supabase SMTP or an Auth Send-Email hook on a shared project.** This changes auth for every other product. It was replaced by a per-app ACS lane.
- **Copying the broad subscription-Contributor service principal into Vercel for mail.** This would turn a mail feature into broad Azure authority. Use a narrow per-resource key.
- **A stateless "generate link, then send" mail handler.** It loses the provider acknowledgement. A retry regenerates the token, which invalidates the mailed link and can send two emails. ACS repeatability (5 min, identical payload) cannot repair this. Returning 200 on ACS 202 also claims delivery falsely. The replacement is a durable encrypted outbox with stable operation IDs and reconciliation after the retry horizon.
- **Blind retry of a production migration.** Migration 173's guarded apply ran all 10 DDL statements, failed the in-transaction catalog assertion, and rolled back. The rule is diagnose, write a new operator, take fresh receipts. Never relax the assertion.
- **Room payment authority as publication access.** Payment is not access. A pass is a separate credential, not a payment record.
- **Demo or test pass treated as sellability.** Green gates and fixtures are not a user journey. The owner rejected the "complete" mobile recorder UI on 2026-09-14 despite passing gates.
- **Readiness probe only on a slow GPU app.** ACA injected a default liveness probe and crash-looped. Use an explicit Startup probe with a generous budget.
- **HMAC timestamp window shorter than cold start.** The waking request always fails as a "signature invalid" 401 and is marked non-retryable. Fix: warm via an unauthenticated /healthz first, and have the broker re-sign with a fresh internal timestamp.
- **Settling cold-GPU wakes as failed generations.** All 45 "failed" rows were normal scale-to-zero lifecycle events. They polluted alerts and taught the owner to retry.
- **One flat per-minute voice price.** It hides cold-GPU cost and PSTN carrier cost. Price rows separately.
- **OpenVoice tone-color conversion after IndicF5.** ECAPA dropped from 0.727 to 0.681 and WER worsened from 0.30 to 0.375.
- **A fine-tune queue row without a runner.** It looks like progress and is dead.
- **A replica-wide queue before speaker attestation.** Decisions about different sessions collided.
- **Azure realtime mini as the call brain.** See measurements (register and monologue).
- **`.gitignore` treated as a Vercel payload boundary.** A gitignored `_config.js` was uploaded and hit a revoked key. You need `.vercelignore`.
- **Seven agents in one working tree.** A `git reset --hard` from one agent wiped the others. Agents are now forbidden git state mutation, and the coordinator commits.
- **A single Vite build as a gate.** It exits 0 with type errors.

## Risks/landmines

- **Scale and entanglement.** 349 API files and 165 migrations carry Meera/Room legacy (`MEERA_AGENT_ID`, `meera_*` tables, 36 legacy DB pointers). Lifting modules wholesale drags the relational/persona web along. Port patterns, not trees.
- **Two studio trees** (`src/studio` and `src/creatorStudio`) duplicate much code. Pick neither as a base for command-centre UI.
- **Unproven product:** no real-user sign-in, email delivery, paying customer or likeness result exists. Treat every feature as "built and tested offline", not "works".
- **Production migration 173 is not applied** and its root cause is undiagnosed. Codex's migration 174 is unproven in dev.
- **The ACS email lane is US data-location** and has 50-message pilot caps baked into the SQL sequence (`maxvalue 50 no cycle`). Raise or replace these before reuse. The HTML template is minimal.
- **Supabase dependency** for auth and storage. An Azure-only command-centre must either keep Supabase (it is not Azure, and not covered by the constraint as stated) or reimplement auth (for example Entra External ID). Neon is allowed.
- **Secrets pattern:** `api/_config.js` is generated from env and is gitignored. The Vercel payload leak shows the risk. Never copy this pattern without `.vercelignore` or a container build allowlist.
- **Voice cloning ethics/compliance surface** (consent, liveness, watermark) is heavy and specific to cloning. Do not import it for ordinary voice agents.
- **Retrieval is lexical**, so there is no semantic or cross-language memory yet despite the docs.
- **Ceremony cost:** the receipt/intent/observer process is excellent for safety but very slow. Adopt it selectively for money and outbound sends.

## Azure dependencies

- **Azure AI Foundry** (`*.services.ai.azure.com` `/models/chat/completions`, plus OpenAI-v1-compatible `/openai/v1`): dialogue model (env `AZURE_FOUNDRY_DIALOGUE_MODEL`). Deployments named in repo: `grok-4-20-non-reasoning`, `grok-4-1-fast-reasoning` (memory extraction), gpt-4.1-mini, Mistral-Large-3, `text-embedding-3-small` (unbound), `gpt-5.6-luna/terra`, `gpt-realtime-2.1-mini` (rejected), `gpt-4o-mini-tts`.
- **Azure Speech:** fast transcription / short ASR; Personal Voice adapter (Limited Access, **never called**).
- **Azure Communication Services Email:** `vyakti-auth-email-service` (Email, Azure-managed domain) and `vyakti-auth-email-acs` (Communication), both in resource group `vyakti-voice`.
- **Azure Container Apps:** GPU T4 runtime apps, CPU admission brokers, the `internal-voice` CPU app, the replica-processing ACA Job, evaluation runtimes, and the `azure-web` package (not deployed).
- **Azure Container Registry:** `vyaktivoiceacr` (image `vyakti/internal-voice@sha256:d6ba0f1e...`).
- **Azure Key Vault:** C2PA ES256 signing key and the eval HMAC secret (`services/voice-eval-security`).
- **Bicep** templates under `services/*/infra/`.
- **Non-Azure in use:** Neon (allowed), Supabase auth/storage, Vercel hosting, OpenRouter/Google (legacy Meera lanes), Sarvam (ASR/TTS adapters), Razorpay.

## Recommendation for sales-enabler

1. **Lift outright (drop-in or near):** `_provider-budget.js` with its two tables, as the central metering for every AI call in the command-centre (orchestration and analytics need exactly this). Also `_model-serving-policy.js` for the Azure-only constraint, and the `context/` system with `scripts/context.mjs` for project memory.
2. **Adapt the ACS email outbox** into a general **outbound email service** for campaigns and transactional mail. Keep the durable outbox, stable Operation-Id, encrypted payload and reconcile sweep. Remove the 50-slot pilot sequence and the Supabase link coupling. Add templates, suppression lists and engagement tracking where campaigns need them (this lane disables tracking on purpose). This is the closest existing Azure-native code to the command-centre's email channel.
3. **Adopt the four-function surface contract** for omnichannel (email, WhatsApp, web chat, voice, and later telephony): one shared pipeline (identity, recall, compile, gate, log) with thin transport adapters. Start from `api/whatsapp.js`, whose Meta signature and window logic is documented against Meta docs, and `api/_surface.js`'s shape, rewriting without the Meera/Room coupling.
4. **Use `services/azure-web` as the blueprint** for hosting sales-enabler on Azure Container Apps: the Vite plus Node handler server, crons to ACA Jobs, and immutable digest deploys. For queue workers use the ACA Job run-to-completion pattern from `replica-processing-worker`.
5. **For voice agents,** reuse the *lessons* (Startup probe, HMAC-vs-cold-start, warming as a state not an error, separate cold/warm/carrier pricing, and that the realtime model's register can fail even when latency passes), not the cloning stack. Measure Azure Voice Live / realtime against a persona register bar the way `realtime-azure` did.
6. **Port the eval and gate culture:** a `verify-release` runner, schema mirror, prompt-budget throw, copy gate and negative controls in every suite. Also follow the rule that a capability without a caller is dead.
7. **Do not port:** the person-model/cloning pipeline, the dual studio UIs, Room/Meera relational tables or the cloning consent and liveness stack. The access-pass pattern is worth re-implementing for gated lead magnets and partner portals, but production migration 173 never applied, so re-prove it on Neon first.
