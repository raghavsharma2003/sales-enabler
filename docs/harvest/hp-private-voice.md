# Harvest: hp-private-voice (html-portfolio, `codex/private-voice-requests25`)

Inspected 2026-10-15 via a detached worktree at `origin/codex/private-voice-requests25` (HEAD `f0246956`, 2026-09-21). Read-only; nothing was pushed, deployed or called. One offline test suite was executed locally (`node --test evals/private-voice/run.test.mjs` -> 13/13 pass, ~0.2 s, synthetic SQL only). No secrets are reproduced here.

## Summary

This branch is the tip of the "Vyakti" (person-replica / voice-clone) platform line inside `html-portfolio`: 1,262 commits ahead of `origin/main` (0 behind), 2,661 files changed, mostly authored 2026-08-24 to 2026-09-14 by Codex agents. The *named* focus of this cluster is only the last commit, "WIP: checkpoint private voice requests; runtime and live SQL validation pending" (17 files, +643 lines): a per-account private "test your own cloned voice" request table, store, handler and tests. But the branch also carries the whole **self-hosted open-weight TTS-on-Azure stack** that lane depends on, and that is the real harvest value:

- Six pinned, offline, HMAC-gated GPU runtimes on **Azure Container Apps serverless T4** (`Consumption-GPU-NC8as-T4`): Chatterbox Multilingual V3 (`open-voice-runtime`, the only one ever used in production), IndicF5 (Hindi), VoxCPM2 (multilingual), Qwen3-TTS (English only), OpenVoice V2 tone converter, plus Zonos2/MOSS attempts that failed on capacity/packaging.
- A **public CPU admission broker -> private GPU runtime** pattern that keeps random traffic from waking paid GPUs and solves the "signature expires during cold start" problem.
- A **supervised GPU controller** (ARM REST, revision activate/deactivate, durable lifecycle store, 30 s heartbeat lease, 420 s dispatch deadline, 900 s envelope) plus a **SQL GPU budget meter** (reserve/begin/settle in microUSD with advisory locks).
- Measurement harnesses: ECAPA speaker-similarity service (`voice-evidence`), Azure Speech WER/CER intelligibility scoring, a sealed blind listening-pack builder.
- An enormous `context/` (5.8 MB of decisions/measurements/rejections) whose voice-infra rejections are the most valuable thing in the branch.

State: the infrastructure was genuinely deployed and measured in Aug 2026 (cold starts, RTF, ECAPA, WER, $ per window all recorded). The private-voice-request batch itself is **persistence-only**: no public route, no queue consumer, no GPU call, migration 171 not applied live, SQL never parsed by Postgres. No human listening result exists for any candidate model; no model was declared a quality winner.

## Branches covered

| Branch | Tip | Dates | What it is |
|---|---|---|---|
| `codex/private-voice-requests25` | `f0246956` 2026-09-21 | commits 2026-08-24 .. 2026-09-21 (bulk 08-24..09-14) | Vyakti platform tip + private voice request batch 171. Strict superset of `origin/main` (0 commits behind). |

Relationship to siblings: this branch contains the Vyakti Studio, Room, Mirror Call, processing worker, Azure web hosting etc. Those are presumably harvested by other clusters (`vyakti-*`, `handoff-*`). This report deliberately restricts itself to the voice-serving / GPU-control / private-voice slice. The last ~40 commits (2026-09-14) are Studio recorder/upload fixes, CSP for Azure Blob audio playback, an "internal owner voice" caller, and finally batch 171.

## Product

What a user would experience (as designed): a signed-in account owner records/uploads their own voice in "Studio"; the processing pipeline produces an enhanced WAV artefact; the owner can then ask for a **private sample of their cloned voice** saying one fixed Hindi sentence, attest "this is my own voice, for private use", and later play it back and rate it (likeness, naturalness, Indian accent, pronunciation, 1-5). The output is watermarked (PerTh in-runtime; AudioSeal/C2PA planned in app plane), carries a spoken AI disclosure, and is never release-eligible, training-eligible or identity-claiming.

Real state:
- **Internal owner voice** (`services/internal-voice/`, `/api/internal-voice`): single hard-coded owner + replica, Blob-stored authorization JSON, one attempt max. CPU service deployed 2026-09-14 (healthz 200, `gpu_probed:false`); no synthesis run recorded on the branch.
- **Account-private voice request (batch 171)**: table + store + handler + 13 offline tests. Not wired, not migrated, not parsed. Next batch (CPU adapter doing lease/activation/child claim SQL) never written.
- **Ordinary voice preview** (`api/voice-preview.js` -> `api/_voice/providers/open-chatterbox-preview.js` -> broker -> Chatterbox T4) was live in production in late Aug 2026 and produced protected audio; a cold first press returned "warming" and needed ~291-293 s.

## Architecture & stack

```
Browser (React/Vite Studio)
  -> Vercel/Azure-web API (plain JS ESM handlers, Supabase session verify, Postgres via SQL constants)
      -> provider leaf (open-chatterbox-preview.js): canonical JSON body, HMAC(protocol, method, path, ts, nonce, sha256(body))
          -> PUBLIC CPU admission broker (FastAPI, services/*/broker.py): verify HMAC + skew + nonce replay + size
               - probe private runtime readiness; if cold -> signed 503 "open_voice_runtime_warming"
               - when ready -> re-sign admitted body with FRESH internal ts/nonce, forward
          -> PRIVATE GPU runtime (Container App, internal ingress, min 0 / max 1, T4 workload profile)
               - pinned model weights baked in image, HF offline, startup manifest hash check
               - refuses unless: spoken disclosure prefix, content-addressed 3-15 s 24 kHz reference,
                 consent receipt hash, transcript hash, HMAC
               - returns raw PCM + signed receipt (model commitment, reference hash, text hash, PerTh score)
  -> Supervisor (independent CPU process / manual ACA Job): heartbeat lease every 5 s (30 s expiry),
     deactivates exact GPU revision at 420 s dispatch deadline via ARM; durable lifecycle rows
  -> SQL GPU meter (vy_provider_budget, vy_gpu_allocation_window): reserve -> in_flight -> accounting_pending/uncertain -> release
```

Stack: Node 24 ESM (no framework) for API/controllers; Python FastAPI + PyTorch CUDA for runtimes; Bicep for every Container App / Job; Azure Container Registry remote builds only (`az acr build` / `az acr run`, never local Docker); Key Vault references read by a dedicated user-assigned identity for HMAC secrets; Azure Blob for audio; Postgres (Supabase on this branch) for state; node:test + bespoke `evals/*/run.mjs` harnesses.

### Batch 171 private voice request (the named focus)

- `db/migrations/171_private_voice_request.sql`: one table `vy_private_voice_run`. Composite FKs to replica/source/artifact by `(id, owner_user_id)` tuples so cross-owner references are structurally impossible; CHECK constraints pin the receipt scope (`private_voice_test`, `private-own-voice/v1`, `account_attestation`) and force `identity_claim_allowed/release_eligible/training_allowed = false`; output path is a CHECK-computed deterministic string `<owner>/<replica>/<source>/derived/private-voice/<run>.wav` reserved at admission so erasure can find it even if upload result is lost; `state` enum `queued|claimed|running|ready|failed|unknown|revoked`; `ready` requires output hash + receipt; partial index for the queue.
- `api/_private-voice-store.js` (191 lines): server-fixed sample config (text, seed 31001, style, model arm `hindi_v3`, model commitment) hashed and frozen into the row; candidate CTEs lock source then replica `FOR UPDATE NOWAIT`, re-derive consent (capture + latest storage consent), require completed processing job, build a snapshot JSON and compare its hash at admission (TOCTOU guard); idempotent replay on client-supplied run UUID; revoke closes the lifecycle window and keeps output locators for the erasure worker.
- `api/_private-voice-handler.js`: GET candidates/status, POST generate/revoke; requires `VYAKTI_INTERNAL_VOICE_MODE=account-private` and `VYAKTI_MODEL_SERVING=azure_only`; request JSON never carries owner authority, extra fields rejected.
- `api/_replica-source-erasure.js`, `_replica-full-erasure.js`, `_private-voice-erasure.js`: erasure now includes reserved private-voice paths and waits for active leases/writes/GPU windows.
- `scripts/private-voice-sql-packet.mjs`: emits four `EXPLAIN` statements with synthetic params for a human/root to parse against live schema (never ANALYZE).
- Contract doc: `docs/handoff/2026-09-14/PRIVATE-VOICE-REQUEST-CONTRACT.md`.

## Reusable assets

| Asset | Paths | Maturity | Reuse for | Effort |
|---|---|---|---|---|
| CPU admission broker -> private GPU runtime pattern (HMAC, nonce replay, warming response, fresh internal re-sign after cold start) | `services/open-voice-runtime/broker.py`, `services/openvoice-converter/broker.py`, `services/*/infra/main.bicep` | production (Chatterbox lane served real users Aug 2026) | voice-agent, infra-ops, safety | adapt |
| Supervised Container Apps revision controller (ARM activate/deactivate, drift/ownership checks, durable at-most-once close, never replays unknown mutations) | `services/azure-voice-app/controller.mjs` (+ `controller.test.mjs`), `services/azure-voice-app/supervisor-job.bicep` | tested (offline synthetic ARM) | infra-ops, voice-agent, orchestration | adapt |
| Azure GPU Job controller + supervisor (ACA Jobs execution start/observe/stop bound to SQL window) | `services/azure-gpu-job/controller.mjs`, `services/azure-gpu-job/supervisor.mjs` | tested (one real failed execution observed + 27 synthetic controls) | infra-ops, memory-learning (fine-tune jobs) | adapt |
| SQL GPU / provider budget meter (reserve with advisory lock, begin, settle, uncertain, release only after observed terminal zero replicas) | `api/_gpu-allocation-budget.js`, `evals/gpu-allocation-budget/` | tested | infra-ops, analytics (cost), orchestration | adapt |
| Per-request "private grant" table pattern: tuple FKs, CHECK-pinned scope receipts, server-frozen config hash, snapshot-hash TOCTOU, deterministic reserved output path, idempotent client UUID | `db/migrations/171_private_voice_request.sql`, `api/_private-voice-store.js`, `api/_private-voice-handler.js`, `evals/private-voice/run.test.mjs` | prototype (13/13 offline; never migrated/parsed live) | auth-tenancy, safety, voice-agent | idea-only / adapt |
| Pinned offline open-weight TTS runtimes on ACA T4 (Chatterbox V3 + Hindi pack, IndicF5, VoxCPM2, Qwen3-TTS EN, OpenVoice V2) with baked weights, manifest commitments, PerTh watermark verify | `services/open-voice-runtime/`, `services/indicf5-runtime/`, `services/voxcpm2-runtime/`, `services/qwen3-tts-runtime/`, `services/openvoice-converter/` | tested (each built, deployed, synthesised in isolation 2026-08-27/28) | voice-agent, content-gen | adapt |
| IndicF5 Devanagari duration fix + deterministic pronunciation normalizer with receipts | `services/indicf5-runtime/duration_control.py`, `pronunciation_normalizer.py`, `evals/indicf5-pronunciation/` | tested | voice-agent (Hindi) | drop-in (if IndicF5 used) |
| ACR remote-build wrapper (manifest of exact copied files, Windows az.cmd quoting, never local Docker) + ACR BuildKit secret mount for gated HF weights | `services/openvoice-converter/remote-build.mjs`, `services/*/acr-task.yaml` | tested | infra-ops | adapt |
| Voice-evidence service (ECAPA + x-vector embeddings, SepFormer, Silero VAD, DeepFilterNet3; HMAC both ways) | `services/voice-evidence/` | production (used for every ECAPA number) | eval-quality, voice-agent | adapt |
| Objective intelligibility scorer via Azure Speech (script-aware WER/CER) | `scripts/indicf5-objective-intelligibility.mjs` | tested | eval-quality | adapt |
| Sealed blind listening pack (opaque IDs, sealed key, repeat/attention controls, 4 rating axes) | `evals/voice-matched-pack/`, `evals/voice-listening-benchmark/`, `scripts/voice-listening-benchmark.mjs` | tested | eval-quality | adapt |
| Internal owner-voice CPU service (HTTP + independent supervisor, Blob store, lifecycle) | `services/internal-voice/` | prototype (deployed CPU, no synthesis) | voice-agent | idea-only |
| Azure Personal Voice provider (first-party Azure custom neural voice) | `api/_voice/providers/azure-personal-voice.js` | prototype | voice-agent | adapt |
| Azure-only serving audit method (caller x provider matrix, every non-Azure fallback named) | `docs/gurukul/research/AZURE-ONLY-SERVING-AUDIT-20260907.md` | n/a (doc) | infra-ops, safety | idea-only |
| Cost model separating cold GPU, warm marginal, fixed infra, carrier | `context/rejected.md#one-flat-voice-price-cannot-hide-cold-gpu-and-carrier-cost` | n/a | analytics, voice-agent | idea-only |

## Measured lessons

All from `context/measurements.md` / `context/rejected.md` on this branch.

- **Serverless T4 cold start is minutes, not seconds.** Chatterbox private T4 went cold -> warm in 291 s (n=1 production canary, 2026-08-29); Hindi arm cold end-to-end ~293 s (2026-08-27); voice-evidence 161-176 s; IndicF5 needed seven readiness checks. The 9.7-11.6 GB CUDA images make image pull dominate. Container Apps ingress kills the waking request at 240 s. Consequence: scale-to-zero GPU TTS cannot serve a live phone call's first turn; it needs either an always-warm replica (hundreds of USD/month) or a non-GPU first-party voice.
- **Warm RTF on T4:** Chatterbox zero-shot 0.79, with LoRA adapter 0.99-1.01 (+~26% latency); IndicF5 mean RTF 2.87 (range 2.13-4.16, n=6); VoxCPM2 RTF 2.1-3.9 (n=3); Qwen3-TTS mean 2.21 (n=6). Only Chatterbox is faster than real time on T4; the frontier candidates are 2-4x slower than real time, disqualifying them for streaming voice agents on T4.
- **Cost per experiment window:** VoxCPM2 T4 allocation 750.7 s ~ USD 0.35; Qwen window 799 s ~ USD 0.37 at USD 1.6632/h T4 list; one cold request costs ~23-35 cents of startup+cooldown vs ~1 cent for 30 s of warm Chatterbox speech. Azure Cost Management lagged/429'd, so all are estimates.
- **Speaker similarity (ECAPA cosine, provisional rails pass>=0.78ish, target 0.85; owner-vs-owner ceiling 0.887):** Chatterbox zero-shot 0.775; Chatterbox + 71 s LoRA 60 epochs 0.796 (closes 18.4% of gap, p10 worsens with more epochs; 140 s of T4 to train); IndicF5 0.825 (n=6, pass); VoxCPM2 0.766 (n=3, warn); a later exact-text matched pack 0.666 (fail). n tiny; ECAPA explicitly not a listening result.
- **Intelligibility (Azure Speech hi-IN, n=6 IndicF5 clips):** WER 0.33 overall; Devanagari 0.20, mixed-script Hinglish 0.45. Hinglish is much worse than pure Hindi for every candidate measured.
- **OpenVoice tone conversion hurts:** ECAPA 0.727 -> 0.681 and WER 0.30 -> 0.375 (n=2). Rejected as a path.
- **False failure rate:** all 45 "failed" voice rows in one window were normal cold-start/warming lifecycle responses; reclassified as aborted.
- **Browser retries duplicate GPU work:** six different WAV hashes for one text+seed in production before an owner-scoped intent + execution lease was added.
- **Private voice batch 171:** 13/13 offline node:test cases (re-run today, pass); no live SQL parse, no GPU call.

## Rejected / failed approaches

Highest-value section. Each is from `context/rejected.md` on this branch.

1. **Readiness probe only on a slow GPU app** -> ACA installs a default liveness probe that kills the container ~3 s before model load completes; permanent crash loop with no app error. Use an explicit Startup probe with a large failure budget (`readiness-probe-only-is-fatal`).
2. **HTTP startup probe as the only routing gate** -> ACA recorded blank-status startup failure even though the app was up; delayed TCP probe on 8080 fixed it (`gpu-http-startup-probe-cannot-be-the-only-routing-gate`).
3. **`gpu: 1` in container resources / 240 s initialDelaySeconds** -> ARM rejects both; GPU is selected by `workloadProfileName`, probe delay max 60 s; use repeated bounded probes (~555 s budget) (`aca-gpu-member-and-long-probe-delay-are-invalid`).
4. **Reading `Microsoft.App/.../usages` for GPU quota** -> reports 0/0 dedicated A100 everywhere and says nothing about Consumption-GPU T4, which worked. Only scheduling a replica proves quota (`gpu-usages-api-says-nothing-about-serverless`). Similarly, unrestricted Compute SKU listings were not provisionable: 26 A100 + 4 H100 validations hit quota (`compute-sku-visibility-is-not-large-gpu-provisionability`).
5. **Signing a request then letting it wake a scale-to-zero service** -> guaranteed 401 because 60 s HMAC skew < 161-176 s cold start; the obvious "rotate the secret" fix would have destroyed a working key (`hmac-skew-shorter-than-cold-start`, `signing-before-a-cold-start-cannot-authenticate`). Broker forwarding the caller's original signature fails the same way (`a-cold-broker-cannot-forward-the-original-expiring-signature`). Fix: broker probes readiness, returns signed "warming", then re-signs with a fresh internal timestamp/nonce.
6. **Broker `/healthz` as GPU readiness** -> it only reports the CPU broker; nothing but a real synthesis wakes the private GPU (`broker-healthz-is-a-front-door-not-a-readiness-check`).
7. **Keeping the 9.7 GB CUDA base image on a scale-to-zero service behind a user button** -> first press always dies at the 240 s ingress timeout (`a-cuda-base-image-is-not-free-on-a-scale-to-zero-service`).
8. **Picking "the first Container Apps environment"** -> got one without a T4 workload profile; resolve environment from the live named app (`the-first-container-app-environment-is-not-a-safe-gpu-selector`).
9. **Counting cold/warming responses as model failures** and **treating browser retry as permission for another synthesis** (see Measured lessons).
10. **One flat per-minute voice price** -> hides cold GPU vs warm vs reserved vs PSTN carrier cost.
11. **Model-specific packaging failures:** IndicF5 gated weights cannot be fetched anonymously and an unpinned vocoder breaks offline runtime; IndicF5 estimates duration from UTF-8 bytes so Devanagari runs ~3x long and overruns the broker bound; old setuptools cannot parse VoxCPM2's PEP 639 license; recursive `chown` duplicates multi-GB model layers (VoxCPM2 11.6 GB -> 7.7 GB once removed); Zonos2 needs nvcc, its offline API does not freeze assets, A10 blocked by regional spot quota, regional A100 lacked visible CUDA; MOSS v1.5 does not fit a T4.
12. **OpenVoice V2 tone-color conversion** regressed both identity and intelligibility.
13. **PhoneLLM (B200 benchmarks) as a call brain** -> English text model, 63 GB, no Hindi; vendor benchmarks do not predict a low-utilization T4.
14. **Making the single-owner internal runtime generic by removing its owner check** -> its Blob state holds one budget reserve and GPU exclusion; per-account copies multiply the budget and allow concurrent activation. Hence batch 171's separate request table (`private-voice-static-grant-expansion`).
15. **`connect-src` assumed to cover audio playback** -> media elements need `media-src` for signed Azure Blob URLs (`wave26-connect-src-does-not-authorize-saved-audio`).

## Risks / landmines

- **Extreme process overhead.** 1,262 commits, 5.8 MB of context logs, hundreds of eval suites; full release gate took ~48 min under load. The code is defensively correct but very dense (minified-style one-liners, e.g. `api/_gpu-allocation-budget.js`, `controller.mjs`). Lifting it requires reading carefully, not copy-paste.
- **Supabase/Vercel-coupled.** Auth is Supabase session verification; hosting on this branch is still Vercel plus an `azure-web` Container App. Schema dependencies (`vy_replica`, `vy_replica_source`, consent, processing artifacts, `vy_voice_app_lifecycle`, `vy_gpu_allocation_window`, `vy_provider_budget`) are Vyakti-specific.
- **Batch 171 is unvalidated:** never migrated, SQL never parsed (a draft already had a `USING` duplicate-column bug caught by review), effective Hindi CFG silently 0 for unknown reference language while 0.78 is "requested".
- **Non-Azure paths still present** in this branch: OpenRouter fallbacks for replies/embeddings/extraction, Sarvam ASR, ElevenLabs PVC provider (`api/_voice/providers/elevenlabs-pvc.js`, `sarvam-bulbul.js`). The audit doc lists them; do not import those providers.
- **Licensing/gating:** IndicF5 weights are gated (contact-sharing acceptance) and the README notes a Hugging Face credential was once shared in chat; treat as rotated/unsafe. Chatterbox MIT, VoxCPM2/Qwen3 Apache-2.0.
- **Voice cloning is a legal/safety surface.** Everything here assumes consented self-voice, spoken AI disclosure and watermarking. A sales voice agent using a cloned human voice would need the same (or stronger) consent machinery.
- **No quality verdict exists.** Every candidate's human listening is `not_started`; do not read ECAPA numbers as "sounds like".

## Azure dependencies

Container Apps (managed environment `vyakti-voice-env` with `Consumption-GPU-NC8as-T4` workload profile; a separate `vyakti-ctrl-env`), Container Apps Jobs (GPU fine-tune job, manual CPU watchdog job), Azure Container Registry (`vyaktivoiceacr`, ACR Tasks/BuildKit secrets), Key Vault (versioned HMAC secrets, access-policy vault) with a dedicated user-assigned managed identity, Azure Blob Storage (replica audio, private-voice outputs), Azure Resource Manager REST (`Microsoft.App` api 2025-07-01) for revision activate/deactivate, Azure Speech (short-audio ASR, Fast Transcription, used for intelligibility scoring and Mirror Call ASR), Azure AI Foundry (reply/dialogue/claims models, embeddings), Azure Personal Voice (provider exists), Azure Face (liveness, gated). Regions seen: Central India (GPU meter), eastus2 (Speech).

## Recommendation for sales-enabler

1. **Do not adopt self-hosted open-weight TTS on serverless T4 for the voice agent's live calls.** The branch's own numbers kill it: ~5 min cold start, 2-4x slower-than-real-time for the better Hindi models, and an always-warm T4 is a fixed monthly cost. For a sales/command-centre voice agent, start with first-party **Azure Speech neural voices / Azure AI Voice Live** (stock Indian-English and Hindi voices, streaming, no GPU fleet). Revisit Azure Personal Voice only if a branded/cloned voice becomes a requirement, and only with explicit consent capture.
2. **Do lift the infrastructure patterns, rewritten small:**
   - Public CPU broker -> private internal-ingress GPU app with HMAC + nonce + re-sign after cold start, for any future self-hosted model (embeddings, rerankers, ASR) we put on ACA GPU.
   - The ACA probe recipe (explicit Startup probe with big failure budget, TCP probe, no `gpu:` member, environment resolved from a named app).
   - The supervisor/deadline/heartbeat idea and the **SQL budget meter** (reserve -> in_flight -> settle/uncertain, release only after observed zero replicas) as the basis for a command-centre **cost governor** across all AI calls (Foundry tokens, Speech minutes, ACS email, GPU seconds). Treat Azure Cost Management as lagging, never as the guard.
   - Idempotent client-UUID requests, observer-only retries, "warming is not failure" status taxonomy, and never auto-replaying an uncertain cloud mutation.
3. **Reuse the per-request grant table pattern** (tuple FKs carrying tenant/owner id, CHECK-pinned scope receipts, server-frozen config hash, snapshot-hash TOCTOU, deterministic reserved storage path for erasure) for multi-tenant CRM/ERP actions that need auditable authority, e.g. "send campaign", "place call", "use this contact's data".
4. **Reuse the evaluation discipline**, not necessarily the code: sealed blind A/B packs with opaque IDs and attention/repeat controls; Azure Speech WER as an objective intelligibility check for any voice we pick; failures stay in denominators; separate English / Hindi / Hinglish cells (Hinglish WER was 2x pure Hindi).
5. **Avoid** importing the Vyakti schema, Supabase auth, the 5.8 MB context style, or any of the non-Azure provider leaves. Port the ideas into a much leaner codebase with Neon Postgres and Container Apps from day one.
