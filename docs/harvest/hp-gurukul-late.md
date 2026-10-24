# Harvest: hp-gurukul-late (html-portfolio, gurukul-ws-ai .. gurukul-ws-as)

## Summary

This cluster covers the late wave of the Gurukul / Vyakti "replica" work: a pipeline that clones a teacher (voice first) from material they upload. All eleven branches were committed on 2026-08-26/27 by parallel Claude workstreams. Each one was cut from `claude/gurukul-platform` and then merged back. They are **not a strict linear stack**: `gurukul-ws-aj`'s diff against `ws-ai` shows ws-ai's files as deletions, because they are siblings. **`origin/gurukul-ws-as` (298c1599) contains every other branch in the cluster** (I checked with `git merge-base --is-ancestor` for all ten), so it is the one tree to read. Later handoff branches (`codex/*`, `claude/vyakti-cloning-platform-*`) also contain it.

The things worth carrying into the command centre are **patterns and harnesses, not product features**:

1. An **eight-step durable processing DAG** on Postgres, with leases, retries, a single atomic commit statement, artifact and evidence manifests, and capability-named failures. It runs as an Azure Container Apps **Job**.
2. A **"wake, then sign"** HMAC transport for private scale-to-zero GPU services on Azure Container Apps.
3. A **you/us blocker-class type** for honest status UX ("waiting on you" vs "waiting on us"). It is checked by a property eval over 27,648 inputs with negative controls.
4. A **layout gate** that mounts the real signed-in app against fixtures and needs no secrets.
5. A **route-table seam** for third-party extraction. It has named refusals, provenance echo and no silent fallback.
6. **Error-mapping rules**: a 4xx keeps its status, and a configuration absence returns 503 by shape.
7. A long list of **measured rejections**, which are the highest-value part of this cluster.

The audio-specific engines (diarize, separate, enhance, watermark) only matter if the command centre's voice agent ever clones a voice. The infrastructure lessons around them apply to any GPU or AI microservice on Azure.

## Branches covered

| branch | tip | date | what it adds |
|---|---|---|---|
| gurukul-ws-ai | fcc2a38e | 2026-08-26 | YouTube extraction route table `api/_channel/extract-routes.js` (direct / pot / proxy / cookies / provider, selected by `MEDIA_EXTRACT_ROUTE`). Transcript and audio routes are chosen separately. PO-token and public-frontend measurements. Proxy costing (IPRoyal $7/GB PAYG recommended, not bought). `evals/extractroutes.mjs` has 81 checks. |
| gurukul-ws-aj | 98efb8de | 2026-08-26 | Studio "honesty split": `src/studio/blockerClass.ts` (you/us type plus blame and opaque-count detectors), `wizardModel.ts` blockers carry `cls`, `BlockerNotice`/`DisabledAction`. Mobile layout stated positively in `design/mobile.css` with `useCompact.ts`. `evals/studiowizard.mjs` grows from 44 to 80 checks. |
| gurukul-ws-ak | 5fdeaa4d (plus 280d811b, c8c6513f, 23dafa19) | 2026-08-26 | Deploys `services/replica-processing-worker` as an ACA **Job**, with ClamAV and ffprobe fixes. Fixes the data-modifying-CTE commit bug. First-ever round trip to the GPU evidence service. Wake-then-sign. Duration cap raised from 600 s to 1200 s. diarize completes: 278 segments. |
| gurukul-ws-al | c28f0f31 | 2026-08-26 | `services/audio-protection` (AudioSeal watermark, C2PA manifest, Key Vault sign) deployed on **CPU**. Image went from about 9.7 GB to 424.7 MB. `NO_TORCH_COMPILE=1`. Build-time model exercise in `bake_models.py`. Data-free `_diagnostic()`. Also two API error-mapping commits (08b00fc0, bcd4668a). |
| gurukul-ws-am | f3fceac2 | 2026-08-26 | Layout repair: nine grid rules reserved a column for a missing child. `auto-fit`/`min()` replaced 14 media queries. Cascade `@layer` order is declared in the HTML head. `scripts/check-layout.mjs` and `studio-layout-fixture.html`/`src/studio/layoutFixture.tsx` judge 264 prose blocks. |
| gurukul-ws-an | a9149e82 | 2026-08-26 | `transcribe` is routed through **Sarvam** (`providers/sarvam-transcription.js`) on owner directive, because the subscription had zero Cognitive Services accounts. Confidence is reported as 0 and never fabricated. |
| gurukul-ws-ao | f444d328 | 2026-08-26 | `api/_replica-processing/reference-window.js`: `separate` gets only the best ~10 s window of the owner's own diarized cluster, and `transcribe` keeps the full source. The owner's 822 s file now passes separate and enhance. |
| gurukul-ws-ap | 32815ced (plus 079fc25e, d3148bc7, 1ddcd22e) | 2026-08-26 | Sticky pager deleted. One honest next action, which lives in the rail. `PlatformWorkBanner`. `voicePreviewBlockReason` as the one decision point. Voice-preview refusal now names its first unmet precondition instead of "not authorized". Fixed a misnamed `SUPABASE_SERVICE_KEY` env requirement. |
| gurukul-ws-aq | 65f36fec | 2026-08-26 | `REPLICA_SELF_TEST_MODE`: a self-only bypass for identity, liveness, consent and review during internal testing. Every row it writes is tagged `metadata.self_test_mode`. Migration 063 and `scripts/revoke-self-test-grants.mjs` reverse it in one statement. |
| gurukul-ws-ar | 235c1855 (plus 8f70c83f, a696339d) | 2026-08-27 | Enrollment sample-rate bug: enhance emitted 48 kHz while `probeEnrollmentWav` required 24 kHz. Now resampled inside enhance, `transform_version` bumped, and `scripts/check-enrollment-sample-rate.mjs` cross-file agreement gate added. First real 200 plus audio bytes from Preview. |
| gurukul-ws-as | 298c1599 | 2026-08-27 | Skip 16 kHz Sepformer when one diarized speaker holds 90% or more of the speech. The delivered window is cut at 24 kHz from the original file. `scripts/check-enrollment-bandwidth.mjs` is a real FFT gate (energy above 8 kHz went from 0.000458% to 0.0224%, about 49x). |

## Product

Gurukul/Vyakti lets a teacher upload a recording, or link their own YouTube channel, and get a consented, watermarked voice clone ("Preview my voice", "Meet it") inside a three-step studio wizard (Feed, Meet, Deploy).

State at ws-as:
- The **upload-to-preview path works end to end for n=1**: the owner's real 822.72 s MP3 produced a real 200 with audio bytes on 2026-08-27. Getting there took fixing **five stacked layers**: a queue with no consumer, the CTE commit bug, cold-start signing, the duration cap and separate's whole-file forward pass, and the 48/24 kHz mismatch.
- **YouTube audio extraction does not work from any datacenter IP.** The seam is shipped. The route that would make it work, a residential proxy, was never bought.
- **voice_quality is left failing** on the owner's replica. It sees eight artifacts across revisions and the cap is four.
- The **production preview ledger cannot open** a preview for a non-activated replica. This is either a NULL-unsafe equality or a design contradiction; it was found but not fixed.
- No endpoint can **approve a voice genome**.
- Identity and liveness are dark, which is why the self-test bypass exists.
- **DeepFilterNet3 on vs off is not measured.**

## Architecture & stack

- **Front end.** React + TypeScript studio (`src/studio/*`) served by Vite on Vercel (`vyakti-replica-lab`). The pure model modules have no React dependency: `wizardModel.ts`, `blockerClass.ts`, `errorCopy.ts`.
- **API.** Plain JS ESM serverless handlers in `api/`, on Vercel. The replica domain lives in `api/_replica-*.js`. The processing DAG lives in `api/_replica-processing/`:
  - `pipeline.js`: DAG, retry backoff with deterministic jitter, failure classification.
  - `contracts.js`: canonical JSON, sha256, stage vocabulary.
  - `queue.js` / `repository.js`: lease plus one-statement atomic commit.
  - `runtime.js`: `runNextProcessingJob`.
  - `worker.js`, `composition.js`: adapter map, where every step always has an adapter.
  - `capability-codes.js`
  - `native-tools.js`: clamdscan, ffprobe and ffmpeg through temp files.
  - `reference-window.js`
  - `providers/`: azure-voice-evidence, azure-fast-transcription, sarvam-transcription, native-media, fake.
- **Database.** Postgres. Neon in production, with Supabase for auth and storage. Migrations are in `db/migrations/` and `db/schema.sql`. Tables include `vy_replica_processing_job`, `_attempt`, `_artifact`, `_evidence`, `vy_replica_source`, `vy_replica_model_build`, `vy_replica_generation` and `vy_replica_runtime_capability`.
- **Azure Container Apps**, environment `vyakti-voice` / `vyakti-voice-env` in Central India:
  - `vyakti-replica-processing`: an ACA **Job** on a `*/5` cron, 1 vCPU / 2 Gi, replicaTimeout 900. Node, ClamAV and ffmpeg, from `services/replica-processing-worker/` (`run-once.js`, `clamav.js`, `db.js`, `infra/main.bicep`).
  - `vyakti-voice-evidence`: a private FastAPI app on a serverless T4 GPU, scale-to-zero, internal ingress only. One endpoint, `/v1/analyze`, does diarize (silero VAD plus ECAPA clustering), separate (Sepformer WHAMR 16k), enhance (DeepFilterNet3, 48 kHz resampled to 24 kHz) and measure (ECAPA/x-vector embeddings). HMAC with a 60 s skew. Source is `services/voice-evidence/app.py`.
  - `vyakti-audio-protection`: CPU FastAPI. `/v1/watermark` (AudioSeal streaming, with self-verification), `/v1/sign` (Key Vault `vyakti-protect-kv`, identity `vyakti-protect-id`) and `/v1/c2pa`. Source is `services/audio-protection/`.
  - `vyakti-media-extract`: CPU yt-dlp extraction, gated on channel-ownership attestation. Source is `services/media-extract/`.
  - `vyakti-open-voice` and `vyakti-open-voice-admission`: the T4 synthesis app and its CPU broker, from earlier waves.
- **Images** are built with ACR Quick Tasks (`vyaktivoiceacr`). Logs go to Log Analytics (`vyakti-voice-law`).
- **Gates.** `scripts/verify-release.mjs` reached 16 checks at ws-as. It includes check-layout, check-enrollment-sample-rate, check-enrollment-bandwidth, copy and motion lint, tsc and the build. The evals are `evals/studiowizard.mjs`, `extractroutes.mjs`, `voice-evidence/run.mjs`, `processing-worker/run.mjs`, `replica-processing/run.mjs` and `production-protection/run.mjs`.
- **Project memory** is in `context/` (decisions, measurements and rejected, plus graph.json with 519 nodes and 592 edges at aq) and `context/STATE.md`. Deployment truth is in `docs/gurukul/AZURE-DEPLOY-STATE.md` and `docs/gurukul/ENV-MANIFEST.md`.

## Reusable assets

| asset | paths (on origin/gurukul-ws-as) | maturity | reuse for | effort |
|---|---|---|---|---|
| Durable step DAG on Postgres (lease, retry with stable jitter, failure classification, one-statement atomic commit, artifact/evidence manifests, capability-named failures) | `api/_replica-processing/{pipeline,contracts,queue,repository,runtime,worker,composition,capability-codes,sweep}.js`, `evals/replica-processing/run.mjs` | production (deployed, n=1 real upload end to end) | orchestration, company-brain (ingestion), campaigns (async jobs) | adapt: generalise the step vocabulary beyond audio |
| ACA scheduled Job worker template (run-to-completion queue consumer, REQUIRED_STEPS capability self-assertion at startup, SQLSTATE-carrying db errors, bicep) | `services/replica-processing-worker/{run-once.js,db.js,Dockerfile,infra/main.bicep,README.md}` | production | infra-ops, orchestration | adapt |
| Wake-then-sign HMAC client for private scale-to-zero services (poll `/healthz` until 200, then timestamp, nonce and sign; request and response signatures; bytes-only, never a URL) | `api/_replica-processing/providers/azure-voice-evidence.js`, server side in `services/voice-evidence/app.py` (`_verified_json`), `evals/voice-evidence/run.mjs` | production | voice-agent, infra-ops, safety | drop-in pattern |
| Signed FastAPI microservice skeleton (HMAC request/response signing, nonce cache, Key Vault CryptographyClient signing, data-free `_diagnostic()` exception logging, build-time model exercise) | `services/audio-protection/{app.py,bake_models.py,Dockerfile}` | production (CPU, measured) | voice-agent (watermark/C2PA on AI audio), safety, infra-ops | adapt |
| Speech evidence service: VAD, ECAPA diarization clusters, Sepformer separation, DeepFilterNet3 enhance with anti-aliased resampling, embeddings | `services/voice-evidence/{app.py,fetch_models.py,Dockerfile}` | tested (deployed T4; separate whole-file OOM avoided by windowing) | voice-agent (call diarization/analytics, speaker ID), analytics | adapt |
| Best-window reference selection plus dominant-speaker skip rule | `api/_replica-processing/reference-window.js`, `native-tools.js` (`extractWindow` with a rate option) | tested (n=1 real) | voice-agent (call recording analysis) | adapt |
| Route-table seam for paid/third-party data acquisition (one env var picks a route, named refusal per missing credential, provenance echo verified, no silent fallback, separate halves) | `api/_channel/extract-routes.js`, `evals/extractroutes.mjs` | tested (81 checks; no paid route live) | lead-gen (scraper/enrichment vendors), omnichannel | adapt: the pattern is the value |
| you/us blocker-class type with blame and opaque-count detectors | `src/studio/blockerClass.ts`, `src/studio/wizardModel.ts`, `src/studio/BlockerNotice.tsx`, `evals/studiowizard.mjs` §8/§10 | tested (property eval, 27,648 inputs, negative controls) | design-ui, orchestration (status of AI work), crm | drop-in |
| Precondition-naming refusal (on an empty eligibility CTE, a diagnostic query names the first unmet precondition in human order, scoped to the same owner) | `api/_replica-voice-preview.js`, `api/voice-preview.js`, `src/studio/errorCopy.ts` | production | auth-tenancy, crm, erp (every permission/eligibility check) | adapt |
| API error-mapping rule (4xx keeps its status with a fallback code; `*_origin_required` / `*_secret_required` / `*_not_configured` map to 503 by shape; always log the code) | `api/voice-preview.js`, `api/_replica.js` | production | infra-ops, all APIs | drop-in |
| Signed-in layout gate without secrets (real App mounted in a fixture HTML with stubbed fetch; measures chars per line, font floor, track/child mismatch, contrast; negative controls) | `scripts/check-layout.mjs`, `studio-layout-fixture.html`, `src/studio/layoutFixture.tsx`, `vite.config.ts` entry | tested | design-ui, eval-quality | adapt |
| Cross-file constant agreement gate | `scripts/check-enrollment-sample-rate.mjs` | tested | eval-quality | drop-in pattern |
| Dependency-free FFT spectral gate (energy above N kHz, real-file thresholds) | `scripts/check-enrollment-bandwidth.mjs` | tested | voice-agent (TTS/telephony audio QA), eval-quality | adapt |
| Self-test bypass flag with tagged writes and a one-statement revoke | `api/_replica-processing/self-test.js`, `db/migrations/063_replica_self_test_mode.sql`, `scripts/revoke-self-test-grants.mjs`, `docs/gurukul/REPLICA-SELF-TEST-MODE.md` | tested (live, both directions) | auth-tenancy, safety, infra-ops (internal test modes) | adapt |
| Phone layout stated positively plus a container-query grid rule | `src/studio/design/mobile.css`, `src/studio/useCompact.ts`, `src/studio/design/honesty.css` | tested | design-ui | adapt |
| Sarvam batch ASR adapter behind the DAG contract (confidence 0, never fabricated) | `api/_replica-processing/providers/sarvam-transcription.js` | production | idea-only for us (violates Azure-only; mirror the shape with Azure Speech batch / Fast Transcription — `providers/azure-fast-transcription.js` already exists) | rewrite |
| Azure deploy state doc with GPU traps, cold-start numbers and cost per hour | `docs/gurukul/AZURE-DEPLOY-STATE.md` (§5, §8, §9, §14) | production knowledge | infra-ops | idea-only |

## Measured lessons

All of these come from `context/measurements.md` / `rejected.md` on ws-as and from the commit messages.

- **Cold GPU start on ACA serverless T4:** about 100 to 161 s to be ready. With a ~9.7 GB image, the triggering request died at the 240 s ingress timeout (n=1, WS-L/WS-AL, AZURE-DEPLOY-STATE §8).
- **CPU AudioSeal image** on python:3.11-slim with CPU torch is 424.7 MB (23x smaller). Pull takes 9.73 s, and a cold start from zero takes 35.6 s with the triggering request returning 200. Watermark RTF is 0.91 warm. Independent detection gave confidence 1.000000 against a negative control at 0.000000 (n=5 signed requests, 2026-08-26).
- **Wake-then-sign:** four consecutive cold attempts failed with sign-then-wait. Wake-then-sign on a COLD service completed in 50 s (n=1 plus n=4 failures, 2026-08-26, WS-AK).
- **First diarize output:** 278 speaker_segment rows, mean confidence 0.877, dominant cluster 663.5 s of 822.7 s. target_likelihood is a deliberate 0.500 because there was no enrolled anchor.
- **ffprobe on an MP3:** via `pipe:0` it returns `format: {}` with no duration; via a file path it returns 822.72 s (same binary, n=1).
- **Worker idle execution:** 23 s when ClamAV only starts if a scan step is queued, against 33 s otherwise. At 288 runs a day that difference matters.
- **Attempt-table timings are inflated after a requeue:** malware_scan read 783 s for a roughly 1.4 s scan.
- **YouTube from a datacenter IP (GCP Ohio):** PO-token provider metadata succeeded 5/6 vs 1/6 while the IP was warm, then 0/4 vs 0/4 after about 40 requests. Audio bytes: 0/12. Seven public Invidious/Piped instances were dead, timedtext returned 429, and InnerTube returned LOGIN_REQUIRED. Only the sanctioned Data API answers, and it gives manual captions only.
- **Proxy costing:** IPRoyal $7/GB PAYG works out to about $0.077 per 15-minute lecture. Evomi is $0.49/GB behind a $49.99/month floor. Not bought or tested.
- **Studio layout before the fix:** content column 67px at tablet, 8 to 9px body text, longest line 216 characters, every primary CTA at 1.73:1 contrast. The CTA contrast came from LightningCSS stripping a standalone `@layer` order statement.
- **Bandwidth:** the energy fraction at or above 8 kHz in the reference went from 0.000458% to 0.0224% (~49x) once Sepformer was skipped and the window was cut at 24 kHz. Real lecture speech sits around 0.02 to 0.05%, so the intuitive 1.5% threshold was wrong by about 70x.
- **The reference conditions synthesis:** same seed and text with three references gave three different outputs (byte length and hash). n=1. There is no ECAPA fidelity number.
- **Self-test mode:** proven against the live DB in both directions. Flag off left 8 blockers and a 409. Flag on queued a draft build. The revoke restored the original state.
- **GPU env creation:** a Consumption GPU workload profile adds about 45 minutes to ACA environment creation. The usages API shows no serverless GPU row, which is not proof there is no quota.

## Rejected/failed approaches

These are the highest-value entries. Each says what was tried and what broke.

- **A runner nobody runs.** Producer, runner and adapters were each correct and each tested, but nothing called the runner (no cron, worker not deployed). The single uploaded job sat at `integrity/queued` with attempt 0. **Rule:** for every queue, name the line that calls the consumer and the schedule that calls that line.
- **Building only the adapters whose credentials exist.** This collapses three different absences into one code. Worse, a degraded scanner produces a fabricated "clean" verdict. **Rule:** every step always has an adapter, and an absent capability throws its own named code. A safety fallback is always an exception, never a verdict.
- **Data-modifying CTE that audits its own inserts.** All CTEs in a statement share one snapshot, so the re-read never sees the insert. The `1/0` guard always fired, and **zero artifact or evidence rows had ever been committed**. This was hidden behind the undeployed worker. **Fix:** a desired row counts as valid if it is in the `inserted_*` CTE or an identical row already exists.
- **Sign, then wait for a cold start.** A correct key produced a 401 because the 60 s anti-replay window is shorter than the 161 s wake. Rotating secrets or widening the window were both rejected, because the window is the replay protection.
- **`--no-install-recommends` ClamAV.** `clamdscan` is only a Recommended package, so the image shipped a daemon with no client. It was caught by a startup capability assertion.
- **ffprobe or ffmpeg through pipes.** A pipe cannot be seeked, so an MP3 has no duration. WAV output gets a 0xFFFFFFFF data size and a LIST chunk at byte 78 instead of 44. **Use temp files.**
- **Trusting green build plus green healthz for an ML model.** AudioSeal's `torch.compile` needed g++ on the first call, so every request returned 503 while the build and `/healthz` were green. **Fix:** run real inference at build time.
- **Keeping the 9.7 GB CUDA base image on a scale-to-zero, user-facing path.** The first press always failed. On ACA with min replicas 0, **image size is a correctness property**.
- **Banning all log output to protect privacy.** This made failures undiagnosable. It was replaced by a data-free diagnostic plus an eval that enumerates output statements.
- **Reusing the ASR registry selection inside the DAG.** That selection can hand back a signed pull URL, which would break the DAG's bytes-only invariant whenever an unrelated env var is set. Reuse the protocol, not the selection.
- **Windowing before diarize.** This would destroy the third-party-speaker evidence that consent rests on. Window at `separate`, not earlier.
- **Raising the duration cap as the fix.** That only moved the failure from diarize to separate. The real fix is chunked analysis or windowing. The cap is hard-coded at 1200 s in `app.py`.
- **PO-token provider as a YouTube route.** It works only on a warm IP. **General lesson:** when measuring consumes the resource (IP reputation, rate budget, free tier, cache), measure late as well as early.
- **"Just get the transcript instead."** Unauthenticated transcript access goes through the same player API, so the same IP reputation blocks it.
- **Mapping errors by an enumerated code list.** Uncoded 4xx responses and undeployed services both became 500s with no log.
- **Playwright against production from the sandbox.** The browser's HTTPS CONNECT was reset. A loopback bridge (node fetch relays real production bytes on 127.0.0.1) worked instead.
- **A layout gate pointed at a signed-out page.** It measured sign-in copy and passed. Minting a real session needs the service-role key, so the gate could never run in CI. **Fix:** a fixture-mounted real app.
- **Viewport media queries for content inside a narrower container.** No breakpoint value fixes this. Use `repeat(auto-fit, minmax(min(100%, N), 1fr))`.
- **Fixing copy while keeping a two-valued `owner` field.** Owner of a gate is not the same as whose turn it is. Needed a separate `cls` field.
- **Loosening the "your turn" detector to admit a nicer sentence.** Change the copy, not the lint.
- **Shrinking or rewording the sticky pager.** Two correct fixes drew the same complaint, so the element itself was the bug and it was deleted. **Rule:** after two fixes and one repeated complaint, ask whether the element should exist.
- **A panel hard-coding its own blocker class.** It drifted from the rail. Route every surface through one function.
- **Hand-writing `source_set_hash` to bypass review.** The builder refused with `model_build_source_set_changed`. Shortcuts must call the real queue functions.
- **A partial DAG rerun via a single job at a new revision.** Dependencies are checked per revision. There is no "reprocess from step X" primitive.
- **Revision-agnostic input queries.** `voice_quality` collected eight historical artifacts against a cap of four. The old artifacts could not be deleted because of an ON DELETE CASCADE into the audit trail of failed previews.
- **A spectral threshold set by intuition** (1.5%). It failed the very fix it was meant to confirm. Calibrate on real bytes.
- **Misnamed env var requirement** (`SUPABASE_SERVICE_KEY` vs `_ROLE_KEY`). The lane said "not connected" forever.

## Risks/landmines

- **Azure-only violation.** `transcribe` uses **Sarvam**, a third-party AI API, and the ws-an commit says Azure Speech was avoided because the subscription had zero Cognitive Services accounts. Media extraction recommends IPRoyal or other residential proxies. Neither is allowed under the command-centre constraint. Use Azure AI Speech batch/Fast Transcription (`providers/azure-fast-transcription.js` already exists), and treat YouTube extraction as out of scope or legal-review-gated.
- **Self-test mode** bypasses identity, liveness, consent and evidence review. It must be revoked before any non-owner user exists. Do not port it without the tagged-write and revoke pattern.
- **Preview ledger NULL equality** (`neon-ledger.js` `open()` against a NOT NULL capability column). It is unresolved, so studio preview may be structurally impossible before activation.
- **Requeue timing corruption** in the attempt table. Any analytics on step latency built on it will be wrong.
- **Hard 1200 s duration ceiling** in `voice-evidence/app.py`. A 30-minute call or lecture fails, and chunked analysis is not built.
- **Revision semantics.** There is no partial rerun, and revision-agnostic input queries accumulate artifacts.
- **The deployed worker lagged the branch.** The ws-as `api/` fix was not rebuilt into ACR. "Merged" and "deployed" are independent facts, as `the-mission-brief-said-the-sweep-was-already-merged` records.
- **YouTube ToS exposure** is argued in `services/media-extract/README.md`: copyright via attestation, but a ToS breach remains.
- **Secrets.** Commits reference a local handover file (`.sec/an-sarvam-key-handover.txt`, now gitignored) and HMAC/Key Vault keys. Do not copy anything from `.sec/` or `api/_config.js`.
- **The verify-release baseline had two environmental failures** (missing `api/_config.js`, unbuilt echosim) for most of the wave. Passing counts like "14/14" depended on `NEON_URL` being set.
- **Everything is n=1** on the owner's single recording. Fidelity (ECAPA cosine) and the DeepFilterNet on/off effect are unmeasured.

## Azure dependencies

- Azure Container Apps environment `vyakti-voice-env` (Consumption plus a serverless T4 GPU workload profile) and `vyakti-ctrl-env` (a control, deletable).
- ACA Job `vyakti-replica-processing`.
- ACA Apps:
  - `vyakti-voice-evidence` (GPU, internal ingress)
  - `vyakti-audio-protection` (CPU, external ingress)
  - `vyakti-media-extract`
  - `vyakti-open-voice` and `vyakti-open-voice-admission`
- Azure Container Registry `vyaktivoiceacr` (Basic), using ACR Quick Tasks.
- Key Vault `vyakti-protect-kv` with managed identity `vyakti-protect-id`, for C2PA/signature keys.
- Log Analytics `vyakti-voice-law`.
- Non-Azure, used here: Neon Postgres (allowed), Supabase auth and storage, Vercel hosting, and Sarvam ASR (not allowed for the command centre).

## Recommendation for sales-enabler

1. **Lift the DAG and Job-worker pattern as the orchestration backbone.** This means a Postgres job table with an atomic lease, deterministic-jitter retries, one-statement commits, named capability failures and an ACA scheduled Job with a startup capability self-check. Generalise the step vocabulary for jobs like enrich lead, send campaign batch, transcribe call, summarise into company brain, and sync ERP. Port the CTE-visibility fix and the requeue-timing caveat with it.
2. **Adopt wake-then-sign** for every private scale-to-zero AI service (Voice Live gateways, GPU embedders). Keep request and response HMAC with a short skew. Prefer a CPU, slim-image service where possible, because image size is a correctness property on cold paths.
3. **Make the you/us blocker class a platform-wide type** for the command centre's activity and status surfaces. Every automated agent action that is waiting should say plainly whether it waits on the human or on the platform, with the blame/opaque-count property eval. Pair it with the precondition-naming refusal pattern for permissions and eligibility (tenancy, CRM ownership, campaign approvals).
4. **Adopt the API error-mapping rule and the fixture-mounted layout gate** from day one.
5. **Use the route-table seam** for every third-party data acquisition in lead-gen (enrichment vendors, scrapers): one env var, named refusals, provenance echo and no silent fallback. Stay Azure-only for the AI parts.
6. **For call recordings in the voice agent**, the `voice-evidence` service (silero VAD plus ECAPA diarization) and `reference-window.js` are reusable for speaker diarization and analytics. Rebuild ASR on Azure Speech, not Sarvam. Design chunked analysis up front instead of a duration cap.
7. **Do not port** the self-test bypass, the YouTube extraction route or the Sarvam adapter as-is. Port the rejected.md lessons into sales-enabler's own `context/rejected.md` so they are not re-learned.
