# Harvest: hp-handoffs (html-portfolio, Vyakti 9-Sept-2026 handoff family)

Repo: `/home/user/html-portfolio` (GitHub `raghavsharma2003/html-portfolio`)
Branches: `codex/handoff206`, `codex/handoff-history-20260909`, `codex/handoff-voice-comparison106`, `codex/handoff-processing204`
Inspected read-only via detached worktree at `origin/codex/handoff206` plus `git diff`/`git show` on the others. Harvested 2026-10-15.

## Summary

These four branches are a single **handover snapshot of "Vyakti"**, an expert/creator "AI replica" product that grew out of the Meera companion codebase. Vyakti's goal was "Feed it -> Meet it -> Deploy it": an expert uploads their knowledge and voice, gets an editable AI persona with their voice, personality and scoped per-learner memory, and deploys it to consumers. It ran Azure-only (Foundry models, Azure Speech, Container Apps serverless T4 GPU jobs), Neon Postgres and Supabase auth. Hindi, Hinglish and English were the target languages.

All four branches share merge-base `3a921798` (2026-08-25, the Meera "Maya" merge) and are about 1,030 commits / ~560-620k inserted lines ahead of it. That diff is the whole Vyakti platform (`src/studio/**`, `src/room/**`, `api/_replica-*`, `services/**`, `db/migrations` up to ~162, hundreds of evals). The four branches differ from each other by only 4-20 commits:

- `handoff206` is the **product handover**: integrated source plus the `docs/handoff/2026-09-09/` pack (START-HERE, NEXT-AGENT, LOCAL-CONFIG, evidence, a listening page, and a full `context-root/` snapshot of the canonical coordinator context, ~2.5 MB with 558 rejected entries).
- `handoff-processing204` holds 4 commits that bind uploaded-source GPU processing to a shared Azure GPU allocation authority (migration 161) plus a scoped "stock speech canary".
- `handoff-voice-comparison106` holds 1 commit that prepares a fixed **synthetic voice bake-off** (Chatterbox vs VoxCPM2 as Azure Container Apps Manual GPU Jobs) with supervised capture through Log Analytics.
- `handoff-history-20260909` is an **archive-only octopus merge** whose tree equals `handoff206@31833cdf`. It exists only to keep historical Git objects reachable for tests. It is not for merging.

The handover's own verdict, which is honest: **"Not ready for production."** The components are real and the infrastructure is very defensive, but the two acceptance outcomes the owner cared about were never verified: a real signed-in end-to-end journey, and convincing owner-voice quality. NEXT-AGENT.md says plainly that too much coordination, re-freezing of source, defensive test infrastructure and handoff bookkeeping piled up before anyone ran a single real user journey. **For sales-enabler, that meta-lesson is worth more than most of the code.**

## Branches covered

| Branch | Head | Date | Relationship / what differs |
|---|---|---|---|
| `codex/handoff-processing204` | `e913ffcb` | 2026-09-09 | Off integrated base `57eda53a`. +4 commits: `6f8e6f16` binds uploaded-source processing to shared GPU allocation authority; `230af0f7` pins Azure app and active-revision metadata independently; `7889c366` leaves the planned scale-down tail after dispatch closes; `e913ffcb` allows short-lived pinned metadata for a scoped stock-speech canary. Files: `api/_replica-processing/{gpu-admission,gpu-observer,canary-observer,source-scope}.js`, `db/migrations/161_processing_gpu_authority.sql`, `scripts/check-processing-*.mjs`, `scripts/azure-processing-gpu-observe.mjs`, `services/replica-processing-worker/{run-once.js,PROCESSING203-HANDOFF.md,*.json}`. Net 28 files, +774/-34. |
| `codex/handoff-voice-comparison106` | `0b47b2b8` | 2026-09-09 | Off `57eda53a`. +8 commits: 7 are UI/eval integrations (Account page memory correction, permission reset, refresh diagnostics). The key one, `0b47b2b8`, adds `services/voice-stock-comparison/{README.md,job-plan.mjs,entrypoint.py,capture.mjs,collect.py,observer.mjs}`, `evals/voice-stock-comparison/{plan.mjs,prompts.v1.json,run.mjs,runtime-controls.py}` and `scripts/{prepare-stock-jobs106,prepare-voice-comparison106,stock-jobs106,stock-jobs106-observer}.mjs`. |
| `codex/handoff206` | `20263775` | 2026-09-09 | Descends from `7bfa08d4` (voice-comparison's parent, so it **excludes** the voice-comparison service files, which appear as deletions in `V..H`). It carries the processing204 content (gpu-admission, migration 161, etc.) by integration, plus communication memory backend (migration 162, `src/engine/learnerCommunication.ts`), expert text compiler fixes (scientific bracket/dash preservation), a dev launcher fix (`scripts/dev-expert.mjs`), and the full `docs/handoff/2026-09-09/` pack. The last 4 commits add handover docs and 3 decisions, 3 measurements and 3 rejections to `context/`. |
| `codex/handoff-history-20260909` | `7a8ad90d` | 2026-09-09 | A 14-parent octopus "archive: preserve handoff history objects (not product merge)". Its tree = `handoff206@31833cdf`. It lacks handoff206's last 4 doc commits (`git diff H Y` = −209 lines of docs/context only). It keeps the policy, auth and dash fix commits plus historical `git show` targets reachable. **Never merge.** |

Bottom line on duplication: **read `handoff206` for product and docs, `handoff-voice-comparison106@0b47b2b8` for the GPU-job bake-off harness, and `handoff-processing204` only for the 4 GPU-admission commits** (already integrated into handoff206). The history branch adds nothing except reachable Git objects.

## Product (state as of 2026-09-09, from START-HERE.md table)

| Area | Actually evidenced | Not done |
|---|---|---|
| Processing (upload -> voice reference) | A synthetic upload completed all 8 Azure processing stages. The selected reference was 10 s mono 24 kHz, and object, hash and native WAV checks passed. Hindi ASR retained all lexical items after 3 orthographic equivalences (58/58 normalized, 54/58 exact). | No real owner enrollment. Ordered transcript-to-claims extraction not trialled end to end. |
| Memory (per-learner) | "Actual213": 7 real model calls. Saved Roman Hinglish preference worked, correction stored Hindi/Devanagari/detailed, and forget cleared recalled facts and prompt context. Cost 25,595 microUSD. | **The corrected-language reply was entirely English**, which failed Hindi adherence. The fix (removing conflicting teacher language defaults) has only offline tests. |
| Text correctness | Scientific concentration brackets survive delivery. Unicode dashes map to ASCII hyphens instead of being erased (which had deleted chemical bonds, minus signs and ranges). | No fresh end-to-end trial after the punctuation fix. |
| Voice | Two Azure GPU Manual Jobs succeeded and produced 12 integrity-verified clips: Chatterbox and VoxCPM2 × (2 Hindi, 2 Hinglish, 2 English), same Azure-TTS stock reference. | **0 human ratings**, no owner likeness, no perceptual winner, no intelligibility screen. |
| Login | A local account handler failed because a gitignored config module was missing. After repair, the Google URL returned HTTP 200. | Real OAuth, OTP delivery, owner session and authenticated journey unverified. |
| Release | Integrated205 TypeScript passed, as did focused checks (64 offline). The last full release ran 23/24 gates. | Full gate not run on the final candidate. Nothing deployed as a release. |

## Architecture & stack

- **Client**: React + TS (Vite). `src/studio/**` (creator studio: wizard, voice experiment panel, WAV capture, SHA-256 web worker, teacher sheet editor, publication) and `src/room/**` (consumer "Meet" room, Account page with memory correction/forget UI).
- **API**: Vercel-style Node ESM handlers in `api/` (`_replica-*`, `_room-*`, `_gpu-allocation-budget.js`, `_model-serving-policy.js` with `assertAzureServingOrigin`, `_provenance/contracts.js` with canonicalJson/sha256).
- **Processing worker**: `api/_replica-processing/*` with a leased job queue (`queue.js`, lease token hashes), pipeline stages (diarize, separate, enhance, voice_quality on GPU; transcription on Azure Fast Transcription `2025-10-15` with `en-IN`/`hi-IN` locales), and providers (`azure-fast-transcription.js`, `azure-voice-evidence.js`, `native-media.js`, `fake.js`). Runner: `services/replica-processing-worker/run-once.js`.
- **GPU**: Azure Container Apps **Consumption-GPU-NC8as-T4** workload profile in `centralindia`. Two patterns:
  1. A long-lived internal GPU app (`vyakti-voice-evidence`) behind a CPU broker, admitted per source via `gpu-admission.js`.
  2. **Isolated Manual Jobs** (`services/azure-gpu-job/controller.mjs` + `supervisor.mjs`) with an immutable image digest, no ingress, retry 0, fixed command, and outputs streamed as hashed, chunked JSONL through stdout and retrieved from Log Analytics (`ContainerAppConsoleLogs_CL`).
- **Money ledger in Postgres**: `vy_gpu_allocation_window` (migration 147/149/150) holds a reservation/in-flight/accounting state machine, with CAS updates keyed by `request_sha256`. Migration 161 adds `vy_processing_gpu_lifecycle/authority/child` so every GPU stage call is bound to a current owner lease, capture+storage consent, purpose and source hash. A text-model ledger (`expert-development-*`) holds microUSD limits.
- **DB**: Neon Postgres (HTTP driver; params arrive as TEXT and need `::uuid` casts). Auth via Supabase. Storage via Azure Blob or Supabase.
- **Context system**: the same `context/` graph as Meera (decisions, measurements, rejected, STATE), validated by `node scripts/context.mjs --check`.

## Reusable assets

| Asset | Paths (on `handoff206` unless noted) | Maturity | Reuse for | Effort |
|---|---|---|---|---|
| Azure Container Apps isolated GPU Manual Job controller + supervisor (immutable digest, no ingress, retry 0, ARM PUT/start/observe/cancel, durable start-claim/unknown/recover states) | `services/azure-gpu-job/controller.mjs`, `services/azure-gpu-job/supervisor.mjs` | tested (real T4 jobs ran successfully) | infra-ops, voice-agent, orchestration | adapt |
| GPU allocation budget meter: Postgres reservation/in-flight/held-pending-usage ledger with CAS | `api/_gpu-allocation-budget.js`, `db/migrations/147*`,`149*`,`150*` | tested | infra-ops, analytics (cost governance) | adapt |
| Per-source GPU admission (lease + consent + purpose + hash re-authorized at every boundary, deadline-bounded AbortSignal, natural-zero release) | `api/_replica-processing/gpu-admission.js`, `gpu-observer.js`, `db/migrations/161_processing_gpu_authority.sql` (processing204) | prototype (source + synthetic SQL; real parser proof pending) | orchestration, safety, infra-ops | idea-only (heavy) |
| Log-Analytics capture of job outputs (bounded KQL, chunked hashed JSONL artifacts, fail-closed collector) | `services/voice-stock-comparison/{capture.mjs,collect.py,entrypoint.py}` (voice-comparison106) | tested (12/12 artifacts verified first read) | infra-ops, eval-quality | adapt |
| Synthetic voice bake-off plan: 6 held-out prompts (2 hi / 2 Hinglish with language spans / 2 en), critical units, meaning checks, blind scoring manifest (naturalness, Indian accent, pronunciation; owner likeness excluded) | `evals/voice-stock-comparison/{plan.mjs,prompts.v1.json}` (voice-comparison106) | tested | voice-agent, eval-quality | drop-in (pattern) |
| Azure Fast Transcription provider (hi-IN/en-IN, size/duration caps, Azure origin assertion) | `api/_replica-processing/providers/azure-fast-transcription.js` | tested (real run) | voice-agent, omnichannel (call transcripts), company-brain | adapt |
| Azure-only model serving policy guard | `api/_model-serving-policy.js` (`assertAzureServingOrigin`, `isAzureOnlyServing`), `scripts/dev-expert.mjs` | tested | infra-ops, safety | drop-in |
| Dev launcher that asserts an isolated DB (`current_database()`), Azure-only model destinations, and creates an inert config from template without secrets | `scripts/dev-expert.mjs`, `api/_config.example.js`, `docs/handoff/2026-09-09/LOCAL-CONFIG.md` | tested | infra-ops | adapt |
| Per-learner communication memory (language/script/detail preferences, correction, forget, reclassification) | `src/engine/learnerCommunication.ts`, `api/_room-memory-consolidation.js`, `api/_room-memory-reclassification.js`, migration 162 | prototype (live trial failed Hindi adherence) | memory-learning, chat-agent, crm (contact preferences) | adapt |
| Expert text compiler (scientific notation, bracket/dash preservation, scoped preference compile) | `src/engine/expertTextCompiler.ts`, `evals/expert-text-compiler.mjs`, `evals/room-expert-answer-math.mjs` | tested (offline, 31+14 checks) | content-gen, chat-agent | adapt |
| Blind listening pack (opaque IDs, private mapping outside served dir, range-request audio) | `docs/handoff/2026-09-09/listening/`, `evidence/voice-listening106-template.html` | prototype | eval-quality, voice-agent | adapt |
| Handover discipline (START-HERE + NEXT-AGENT, "consumed identities do not replay", money snapshot, remote-recovery check from empty bare clone) | `docs/handoff/2026-09-09/*.md` | production (as process) | orchestration, company-brain | idea-only |
| Studio UI pieces (WAV capture, SHA-256 worker, voice panel warm-state machine) | `src/studio/wavCapture.ts`, `sha256.worker.ts`, `sha256Core.ts`, `voicePanelApi.ts`, `voicePreviewApi.ts` | tested | design-ui, voice-agent | adapt |

## Measured lessons

- **Batch GPU TTS on Azure serverless T4 is far from realtime.** In the voice jobs106 receipts (2026-09-09, n=6 per arm, one T4 NC8as, Manual Job), Chatterbox took 7.6-9.5 s of wall time per clip for 9.6-12.5 s of audio (warm RTF ~0.75; first clip 22.5 s including warm-up). VoxCPM2 took 20-36 s per clip for 9.3-12.3 s of audio (RTF ~2-3). Neither is usable for a live call lane without streaming. (`evidence/voice-jobs106-receipts/stock106-artifacts/*.json`)
- **Azure GPU price used for planning**: a retail query (2026-09-09 04:54 UTC) gave 462 microUSD per allocation-second for Consumption T4. A 1260 s reservation (900 s timeout + 360 s headroom) costs 582,120 microUSD per job. (`evidence/VOICE-JOBS106-HANDOFF.md`)
- **Memory trial "semantic213"** (n=7 real calls, 25,595 microUSD) saved a Roman-Hinglish preference correctly, but **after a correction to Hindi the model replied entirely in English**. A structurally correct prompt does not mean the model adheres to the language. (`START-HERE.md`, `evidence/room-semantic213-actual-dialogue-review.json`)
- **Azure Fast Transcription on synthetic Hindi** (n=1 source, 58 words) gave 54/58 exact-token recall, which becomes 58/58 after normalizing nukta, chandrabindu and reduplication-joining variants. A raw WER of 46.6% was an artifact of span ordering (spans were read in UUID order, not audio offset). **Order transcript spans by offset.** (`evidence/PROCESSING204-TRANSCRIPT-ASSESSMENT.md`)
- **Azure stock voice reference**: one `hi-IN-AnanyaNeural` synthesis (299 chars) produced 26.6125 s of 24 kHz mono, with 1.93% energy above 8 kHz. It is synthetic and is not owner likeness. (`PROCESSING203-HANDOFF.md`)
- Remote recovery check: an empty bare clone verified 55 evidence files / 19.8 MB by SHA and size, plus 33 historical lookups. (`context/measurements.md#handoff206-remote-recovery-measured`)
- From the inherited context-root (2026-08-26): attaching a GPU workload profile adds about 45 min to Container Apps environment creation (57 min vs 12 min for non-GPU). The voice-evidence GPU service takes 176-194 s to cold start from zero.

## Rejected / failed approaches (highest value)

From the handoff docs and the archived `context-root/rejected.md` (558 entries; only those relevant to the command centre are listed):

1. **Process failure: building infrastructure before the user journey.** The overnight effort produced ledgers, observers, frozen packets, receipts and handoff bookkeeping, but never one real signed-in journey or one owner listening result. Successful jobs, artifact integrity and offline tests were mistaken for progress. (`NEXT-AGENT.md`)
2. **`azure-tts` (moving Meera's voice to Azure)**: Azure scored better on every measured axis (Hindi pronunciation 15/15 vs 11/15, first audio 255 ms vs 4.9-12.7 s, about 1/5 the cost). The owner rejected it as "not human and not Indian". Pronunciation is not accent identity. **Any voice bake-off must score accent authenticity as a first-class axis.** This applies directly to an Azure-only voice agent.
3. **`realtime-azure` (gpt-realtime mini for the call lane)**: barge-in passed (median 271 ms) and vision was good, but turns grew to 41-53 words and a median of 14 s each, giving a monologue instead of a call. Questions came on 13/24 turns, and the Hinglish was poor. "The prompt sets a ceiling, the model decides how close you get." Measure words per turn and turn length for any Azure realtime agent.
4. **`readiness-probe-only-is-fatal`**: declaring only a Readiness probe on a slow-booting GPU Container App caused a permanent crash-loop, because ACA injects a default liveness probe. Use an explicit Startup probe with a generous failure budget. (`gpu: 1` / `initialDelaySeconds: 240` in bicep is rejected by ARM.)
5. **`gpu-usages-api-says-nothing-about-serverless`**: the `Microsoft.App/locations/*/usages` value 0/0 describes only dedicated A100 capacity. For serverless T4, the only real quota probe is scheduling a replica.
6. **`hmac-skew-shorter-than-cold-start`**: a request signed before a scale-from-zero wake failed as a 401 because cold start (176 s) exceeded the 60 s skew window, so the first request after idle always fails and looks like a wrong key. Fix: wake on the unauthenticated `/healthz`, then sign. Do not widen the skew.
7. **`broker-healthz-is-a-front-door-not-a-readiness-check`**: a CPU broker's `/healthz` says nothing about the private GPU runtime behind it. Aborting a "wake" request on a timer cancels the wake itself.
8. **`warming-that-does-not-clear-warm`**: separate `lastReadyAt` and `lastWakeAt` timestamps let a 504 leave the UI believing the service was warm. Waking must clear ready. Test transition *sequences*, not just states.
9. **`offline-mocks-cannot-type-check-sql`**: 5,161 green checks with a mocked DB, then the first real click returned 500 (`uuid = text`). Neon HTTP binds params as text, so cast `::uuid`. Smoke-test against real Postgres before calling anything done. The handover repeated this caveat for migration 161 ("no local mocks validate SQL types").
10. **`disclosure-announces-the-clone`**: the mandatory spoken AI disclosure ("This is an AI-generated voice replica.") unblinds any listening bench. Trim it identically on all arms, and do not let the operator, who is also the listener, verify the trim by ear.
11. **`romanised-lexicon-meets-devanagari-asr`**: the tokenizer dropped Devanagari matras (`\p{M}`), and a romanised Hinglish lexicon measured 0.000 code-switch on Devanagari ASR output. Keep `\p{M}` and decide on transliteration before measuring.
12. **`handoff206-local-objects-not-remote-proof`**: tests that passed in a multi-worktree repo depended on unpublished Git objects. Only a fresh remote fetch proves recoverability.
13. **`handoff208-openrouter-required-comment`**: a stale template comment ("OPENROUTER_KEY required") sent agents after unneeded credentials on an Azure-only stack. Stale config comments are landmines.
14. A **missing gitignored config module** (a static import) produced a misleading "Google sign-in unavailable" error. Diagnose import failures separately from provider failures. HTTP 200 HTML from Vite does not prove the API imports work.

## Risks / landmines

- **Hard-coded Azure resource identifiers** (subscription ID, resource group `vyakti-voice`, ACR `vyaktivoiceacr`, internal ACA FQDN, Log Analytics workspace ID) appear in `gpu-admission.js`, `job-plan.mjs` and the evidence JSON. They are not secrets, but sales-enabler must parameterize them and must not reuse the resources (they belong to another project, so do not touch them).
- **The blind A/B mapping is committed**: `evidence/voice-listening106-public.private.json` sits in the same Git tree as the public listening page. Anyone with the repo is unblinded. Treat any future rating from it as compromised unless the listener had no repo access.
- Enormous complexity relative to the verified value: about 600k lines and 162 migrations, with many SQL CAS state machines whose real-Postgres parse proofs were still pending (migration 161). Lifting `gpu-admission.js` wholesale imports that unverified surface.
- Open money liabilities: GPU ledger reservations (970,200 + 2 × 582,120 microUSD) stayed "held pending attributable usage" because nothing reconciled them against the actual Azure invoice. The design is a planning reserve, **not an invoice cap**, which is honestly stated.
- RBAC gap: unattended processing needs Reader on the exact ACA resource for its managed identity. The operator lacked `Microsoft.Authorization/*/Write`. Plan RBAC up front.
- Windows-specific paths (`C:/Users/...`) and machine-bound credential helpers mean that none of the local launch commands are portable as-is.
- Owner consent: earlier voice grants were revoked and must not be reused. Any voice cloning in sales-enabler (for example a sales-rep voice) needs a fresh consent and receipt model.
- Chatterbox/VoxCPM2 are open models in self-built images on ACA GPU. That is Azure compute, but **not Azure Foundry direct models**. Under a strict reading of "Azure-only AI", that is a policy question to settle explicitly.

## Azure dependencies

- Azure Container Apps: environment `vyakti-voice-env`, workload profile `Consumption-GPU-NC8as-T4`, `centralindia`; internal GPU app `vyakti-voice-evidence`; Manual Jobs `vyakti-stock106-chatterbox` and `vyakti-stock106-voxcpm2`.
- Azure Container Registry `vyaktivoiceacr` (open-voice-runtime and voxcpm2-eval images pinned by digest).
- Azure Monitor Log Analytics (`ContainerAppConsoleLogs_CL`) as the job-output transport; ARM REST API `2025-07-01` with a bearer token; Log Analytics audience token.
- Azure AI Speech: Fast Transcription API `2025-10-15` (hi-IN/en-IN); neural TTS `hi-IN-AnanyaNeural` for stock reference.
- Azure AI Foundry (text models for the expert room, via `_model-serving-policy.js`; ledger `expert-development-20260906`).
- Azure Blob Storage (private replica storage); managed identity for the worker.
- Non-Azure: Neon Postgres (allowed), Supabase auth/storage (sales-enabler would need to replace this or confirm it is allowed), and a legacy Sarvam transcription provider (third-party; must not be used).

## Recommendation for sales-enabler

1. **Adopt the lesson before the code.** Define the command centre's first end-to-end user journey (for example: sign in -> import leads -> launch campaign -> agent call/chat -> CRM update -> dashboard) and get it working on real infrastructure before building ledgers, observers or receipts. Vyakti's failure was ordering, not capability.
2. **Voice agent**: use Azure Speech / Voice Live / gpt-realtime for live calls, and set up the bake-off harness pattern (`evals/voice-stock-comparison/plan.mjs` + `prompts.v1.json`) with axes for **accent authenticity, naturalness, pronunciation of critical units (numbers, names, negations), words per turn and turn length**, scored blind with the mapping kept out of the repo. Do not use self-hosted GPU TTS for live calls: measured RTF is 0.75-3 with no streaming.
3. **Lift with adaptation**: `services/azure-gpu-job/controller.mjs` + `supervisor.mjs` + the capture/collect pattern, if sales-enabler ever needs batch GPU work (bulk call-recording diarization or enhancement). Use the GPU budget meter as a design reference for per-tenant AI spend governance (reserve, then in-flight, then held-pending-usage, with CAS), but simplify it: one table, real-Postgres tests first.
4. **Lift nearly as-is**: `azure-fast-transcription.js` (call-recording transcription for omnichannel and company brain), `_model-serving-policy.js` (enforce Azure-only at the code level), and the isolated-DB dev launcher idea.
5. **Memory and learner communication** maps to CRM contact preferences (language, script, detail level, corrections, forget). Reuse the data model ideas, but plan a live adherence test from day one, because the model ignored stored language preferences in the only real trial.
6. **Operational rules to bake into infra scripts**: use a Startup probe on any slow container; wake before signing HMAC requests; probe GPU quota by scheduling a replica; cast `::uuid` on Neon HTTP; order transcript segments by offset; keep `\p{M}` in Indic tokenizers.
7. **Handover practice worth keeping**: one START-HERE page with an "actual evidence vs remaining work" table, a list of consumed run IDs that must not be replayed, and a money snapshot that must be re-read before use. Keep it to one page. Vyakti's 2.5 MB context-root shows the cost of letting bookkeeping grow unchecked.
8. Ignore `codex/handoff-history-20260909` entirely. Ignore most of `src/studio` CSS (8k+ lines) unless the creator-studio UX becomes relevant.
