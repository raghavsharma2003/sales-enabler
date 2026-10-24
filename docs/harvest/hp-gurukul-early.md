# Harvest: hp-gurukul-early (html-portfolio, Gurukul/Vyakti early workstream wave)

Repo: `/home/user/html-portfolio`. Read-only inspection via a detached worktree of `origin/claude/gurukul-platform`
plus `git log`/`git diff` across the stacked `gurukul-ws-*` branches. Nothing was pushed, committed or deployed; no
Azure/Neon/Vercel/Supabase resource was touched.

## Summary

This cluster is the 2026-08-26 "big day" wave of **Vyakti** (internal codename Gurukul): a self-serve platform where a
person feeds in their own context (files, links, a video, a call) and gets an AI clone of themselves (mind, voice,
relation, per-person memory) with a *measured* fidelity guarantee. Edtech (JEE teachers) is the first vertical. It is
built on the Meera companion engine (RelationalOS) and a Replica Lab voice-cloning studio.

The ten branches are one integration line (`claude/gurukul-platform`, PR #5) plus nine workstream (WS) branches that
were each cut from it, built in parallel by sub-agents, and merged back the same day. The workstreams in this cluster:

| WS | Branch | What it added |
|---|---|---|
| WS-V | `gurukul-ws-v` | **earbench**: blind ABX + rating listening bench with real statistics and blinding checks |
| WS-W | `gurukul-ws-w` | **Preview my voice** panel; cold-start-as-a-state (202 warming) for a scale-to-zero GPU; forget-follows-the-person |
| WS-X | `gurukul-ws-x` | **Mirror Call backend**: talk-to-your-clone calibration call; approval as one SQL clause; voice loop = selection not accumulation |
| WS-Y | `gurukul-ws-y` | **Mirror Call tab** (React): capture, captions, chip rail with per-minute budget, two labelled fidelity meters, fuzzed state machine |
| WS-Z | `gurukul-ws-z` | **Research sweep** on online mirroring/learning (research only; reshaped WS-X) |
| WS-AA | `gurukul-ws-aa` | **Journey + design system**: PRODUCT-JOURNEY audit (32 breaks), `tokens.css`, real landing page |
| WS-AB | `gurukul-ws-ab` | **Context Locker**: universal "bring your context" ingestion with provenance-checked mining |
| WS-AC | `gurukul-ws-ac` | **Clone reply lane**: Mirror Call turns generated through the one shared compile/gate path, TTS reused unforked |
| WS-AH | `gurukul-ws-ah` | **Processing sweep**: a cron that finally drains the enrollment queue; named capability-absence codes; also carries WS-AF Activity surface + WS-AG copy gate |
| tip | `claude/gurukul-platform` | 76 more commits to 2026-08-28: Azure Blob uploads, Hindi voice hardening, multi-model voice bake-off (IndicF5, VoxCPM2, ZONOS2, Qwen3-TTS, OpenVoice), **blinded model selection** via sealed exact-text packs |

For a sales/ops "company command centre", the high-value harvest is not the voice cloning per se. It is:
(1) the **honesty patterns** for async pipelines (named capability absence, activity surface with no fake
percentages, sweep-with-requeue), (2) **human-approval-as-a-SQL-predicate** for any AI that edits a live persona or
record, (3) **provenance-checked mining** of uploaded context (company brain ingestion), (4) the **blind evaluation
instrument** for choosing voice/agent models, and (5) a very large library of measured rejections.

## Branches covered (with dates and what differs)

All commits are 2026-08-26 unless noted. Ancestry (verified with `git merge-base --is-ancestor`):
`ws-v -> ws-w -> ws-x` are linear; `ws-y`, `ws-z`, `ws-aa` each branch off `ws-w + 1ffe46ec (Mirror Call spec)`;
`ws-ab` descends from `ws-aa` after merges of w/y/z/u; `ws-ac` = `ws-ab` + `ws-x` merge + reply lane; `ws-ah` = `ws-ab`
+ `ws-x` + WS-AF/AG/AH; `claude/gurukul-platform` contains all of them (`ws-ah` is an ancestor; 76 commits later).

- **gurukul-ws-v** (`68054494`, 12:51Z). Base is the integration line at 300 commits. Delta: `956b747d` earbench +
  `68054494` fail-legibly on synthesis error. Files: `scripts/earbench.mjs` (stimuli | listen | score | verify-trim |
  selftest), `evals/earbench/{lib,audio,server,page.html,run}.mjs`, `docs/gurukul/EARBENCH.md`. 85 mechanical checks.
  The commit itself states "NO HUMAN HAS LISTENED".
- **gurukul-ws-w** (`4328281a`, 13:34Z). +3 commits over ws-v. `1b2fc6e0` widens legacy forget to the person's device set
  (`api/memory.js` `personDeviceSet`, `evals/forget/crosssurface.mjs`, 39/39 live). `4328281a` adds
  `api/voice-preview.js`, `api/_voice/warmup.js` (warmth registry, unauthenticated wake, failure classifier, 280-char cap),
  `api/_voice/preview-panel.js` (DI handler), `src/studio/VoicePreviewPanel.tsx`, `evals/voicepanel.mjs` (85 checks).
  Not verified with a real synthesis; only an admission probe 250/253/334 ms (n=3).
- **gurukul-ws-x** (`a35327ab`, 14:19Z). +7 over ws-w (includes merges of ws-z and the spec and two context-only
  owner directives `owner-intent-is-the-spec`, `horizontal-platform-reweight`). Adds `api/mirror-call.js`,
  `api/_mirrorcall.js`, `api/_mirrorcall-store.js` (the nine-CTE `decideMirrorDelta`), `api/_mirrorcall-wire.js`,
  `api/_asr/providers/sarvam-sync.js`, migration `058_mirror_call.sql` (six tables; renumbered 059 on merge),
  `evals/mirrorcall.mjs` (452 checks). Offline only: migration unapplied at commit time.
- **gurukul-ws-y** (`b9966ca2`, 13:50Z). Sibling of ws-x (not ancestor). Client half: `MirrorCallStudio.tsx`,
  `mirrorCallMachine.ts` (pure state machine), `mirrorCallApi.ts` (the only file knowing routes/JSON keys),
  `callCapture.ts`, 63 offline checks. Never run against a real mic or backend.
- **gurukul-ws-z** (`3a80f20e`, 13:36Z). Research only: `docs/gurukul/research/mirror-learning.md` (673 lines) +
  `decisions.md#mirror-learning-is-selection-not-accumulation` with eight sub-decisions and adoption deltas A1-A7.
- **gurukul-ws-aa** (`03179bc6`, 13:56Z). `docs/gurukul/PRODUCT-JOURNEY.md` (28 teacher + 4 student breaks with
  file:line, target journey), `DESIGN-SYSTEM.md`, `UX-QUEUE.md`, `src/studio/design/tokens.css`, `site/vyakti.html`,
  `studioAuth.ts` fix (mode param lost through OAuth).
- **gurukul-ws-ab** (`1a254d3d`, 14:12Z). +14 over ws-aa (merges ws-u LoRA, ws-w, ws-y, ws-z). Own delta:
  `api/context-items.js`, `api/_context-locker.js`, `api/_context-mining.js`, `api/_context/{extract,pdf,docx,whatsapp,link,limits}.js`,
  migration `058_context_locker.sql`, `ContextLockerPanel.tsx`, `evals/contextlocker.mjs` (77 checks). Also via the
  merged WS-U: `services/voice-finetune/` (per-speaker LoRA for Chatterbox) and `services/open-voice-runtime/lora.py`.
- **gurukul-ws-ac** (`91bc4c78`, 14:55Z). = ws-ab + merge ws-x + `api/_mirrorcall-reply.js`, migration
  `060_mirror_call_turn.sql`, `evals/mirrorcallreply.mjs` (110 checks), `MirrorCallVoiceWarming` client state.
- **gurukul-ws-ah** (`da5897a8`, 18:28Z). = ws-ab + ws-x + WS-AF (`3ac7e6b4` Activity surface: `api/_replica-activity.js`,
  `ActivityPanel.tsx`, migration `060_replica_activity.sql`, 221 checks) + WS-AG (`9f5b5ee5` DESIGN-LAW, `9e7c66ce`
  copy gate `scripts/check-copy.mjs` with 14 self-test fixtures) + `95796836` three-step-wizard decision + WS-AH
  (`api/replica-processing-sweep.js`, `api/_replica-processing/{sweep,composition,native-tools,capability-codes}.js`,
  `evals/processing-sweep/run.mjs` 41 checks).
- **claude/gurukul-platform** (`771feef9`, 2026-08-28). 76 commits after ws-ah, 375 files / +56k lines. Merges WS-AD
  (video-link enrollment with best-window ranking; YouTube blocked from Azure IP), WS-AE (three-step wizard,
  `wizardModel.ts` pure readiness function fuzzed over 6,912 inputs), WS-AK/AN/AO/AR/AS (evidence GPU round trip,
  Sarvam ASR, windowed separation, 24 kHz reference fix), Azure Blob uploads (2026-08-27), Hindi conditioning pack,
  and the 2026-08-28 voice bake-off: `services/{indicf5,voxcpm2,zonos2,qwen3-tts,moss-tts,openvoice-converter}-runtime`,
  `evals/voice-matched-pack/` + `scripts/voice-matched-pack.mjs` (sealed exact-text packs), `VoiceExperimentPanel.tsx` +
  `voiceExperiment.ts` (in-studio blind listening with RSA-signed reveal).

## Product

What it is, as of the tip: a studio (`vyakti-replica-lab.vercel.app`) organised as **Feed it / Meet it / Deploy it**.
Feed = consent + material (enrollment upload, Context Locker, video link, channel watcher, Activity). Meet = hear the
clone (Preview my voice), talk to it (Mirror Call), correct it (delta chips, "I'd say it like this"), identity and
liveness. Deploy = disclosure card, runtime gates, channels, erasure.

Real state (from `context/STATE.md` and `AGENTS.md`, 2026-08-27/28):
- **Live and verified**: Neon migrations through 063 applied (125 tables); Supabase auth (Google OAuth + email OTP);
  the enrollment processing queue drained by a Container Apps Job every 5 min on the owner's real 822.7 s upload (all
  eight DAG steps complete); a real preview returns watermarked audio with the spoken disclosure; journey score 15/15;
  16/16 release gates.
- **Built, offline-gated, live status partial**: Mirror Call backend + tab + reply lane (migrations applied later, but
  "no clone has ever spoken a Mirror Call turn aloud" at WS-AC time); Context Locker (mounting queued in UX-QUEUE at
  WS-AB time, mounted later by WS-AE); Activity surface.
- **The open problem**: the clone does not sound like the owner ("not even 0.05% similar"; base voice "very western
  and not indian"). The blinded bake-off at the tip has measured ECAPA mean 0.6656 (fails the 0.70 provisional floor)
  and Hindi WER 26% vs English 2.9% on a sealed six-clip pack, with zero listeners. No model has qualified.

## Architecture & stack

- **Frontend**: React 19 + TypeScript + Vite; studio under `src/studio/` with `design/tokens.css`; landing in
  `site/vyakti.html` (self-contained). Capacitor Android exists for the older Meera app.
- **API**: Vercel serverless functions in `api/*.js` (plain JS ESM), private helpers prefixed `_`. Each route is a thin
  shell (`requireUser`, rate buckets) over a handler with every collaborator injected so evals can drive it without a DB.
- **DB**: Neon Postgres via SQL-over-HTTP (one statement per request, so migrations are idempotent, no DO blocks,
  explicit `::uuid` casts). Ownership is a SQL predicate in every statement (`owner_user_id = $n::uuid` bound from
  `requireUser()`, never request JSON). Erasure cascade + `scripts/relcheck.mjs` owner-lane reach walk.
- **Storage**: Supabase private bucket initially, moved to Azure Blob on 2026-08-27 (`d137607f`).
- **Voice/GPU** (Azure RG `vyakti-voice`, Central India): Chatterbox Multilingual GPU runtime (T4) behind a CPU
  admission broker with HMAC request signing, scale-to-zero; `voice-evidence` (ECAPA, diarization, Sepformer,
  DeepFilterNet3) with internal-only ingress; `media-extract` (yt-dlp); `replica-processing-worker` (ClamAV, ffprobe)
  as a Container Apps Job; candidate runtimes for the bake-off; images built by ACR tasks pinned by digest.
- **ASR**: Sarvam (Saaras batch + sync) by owner directive; Azure Speech used for objective WER scoring in the sealed pack.
- **Engine**: Meera's `engine.compile` + `gatedReply` single door; persona assembled from a "TeacherSheet" via
  `sheetToModule`.
- **Context memory**: `context/{STATE,decisions,measurements,rejected,architecture}.md` + `graph.json` with
  `scripts/context.mjs --check`; `AGENTS.md` as tool-neutral entry.

## Reusable assets

| asset | paths | maturity | reuse for | effort |
|---|---|---|---|---|
| Human-approval-as-one-SQL-clause (CTE ordering: write upstream of state flip; negative control strikes the clause) | `api/_mirrorcall-store.js` (`decideMirrorDelta`), `db/migrations/059_mirror_call.sql`, `evals/mirrorcall.mjs` | tested (offline 452 checks; migrations later applied live) | crm, erp, company-brain, safety, orchestration | adapt |
| Mirror Call: talk-to-your-agent calibration loop with proposed-delta chips, per-minute chip budget, deferred review queue, evidence counts, PII scrub | `api/mirror-call.js`, `api/_mirrorcall*.js`, `src/studio/MirrorCallStudio.tsx`, `mirrorCallMachine.ts`, `mirrorCallApi.ts`, `docs/gurukul/MIRROR-CALL-SPEC.md` | prototype (offline-gated, never run end to end with real audio at WS time) | voice-agent, chat-agent, memory-learning | adapt |
| Clone reply lane through one shared compile/gate door, no fallback persona, draft-vs-published `sheet_source` on every payload, TTS text bound to a DB row not the query string | `api/_mirrorcall-reply.js`, `db/migrations/060_mirror_call_turn.sql`, `evals/mirrorcallreply.mjs` | tested (110 checks offline) | voice-agent, chat-agent, safety | adapt |
| Context Locker: multi-file/multi-link ingestion with magic-byte sniffing, named refusals stored as rows, per-owner quotas, authorship/speaker as required inputs, span-verified citations before storage | `api/context-items.js`, `api/_context-locker.js`, `api/_context-mining.js`, `api/_context/{extract,pdf,docx,whatsapp,link,limits}.js`, `docs/gurukul/context-locker.md`, `evals/contextlocker.mjs` | tested (77 checks; dependency-light extractors) | company-brain, omnichannel, lead-gen | adapt |
| Activity surface: one normalised job shape across seven async lanes, no fake percentages, undeployed lane as a named state, backoff polling that stops when nothing is in flight | `api/_replica-activity.js`, `api/replica-activity.js`, `src/studio/ActivityPanel.tsx`, `activityApi.ts`, `activity.css`, `db/migrations/060_replica_activity.sql`, `evals/replicaactivity.mjs` | tested (221 checks) | orchestration, analytics, design-ui, campaigns | adapt |
| Processing sweep + capability-absence codes (every step always has an adapter; absent capability = stub that throws a named code; auto-requeue when capability lands; "blocked (on us)" vs "failed (your bytes)") | `api/replica-processing-sweep.js`, `api/_replica-processing/{sweep,composition,native-tools,capability-codes}.js`, `services/replica-processing-worker/`, `evals/processing-sweep/run.mjs` | production (live as Container Apps Job, every 5 min) | orchestration, infra-ops, campaigns | adapt |
| Cold-start-as-a-state for scale-to-zero services (202 warming + ETA + Retry-After; wake THEN sign; waking clears warm belief; do not abort the wake request) | `api/_voice/warmup.js`, `api/_voice/preview-panel.js`, `api/voice-preview.js`, `src/studio/VoicePreviewPanel.tsx`, `evals/voicepanel.mjs` | tested (later proven live) | voice-agent, infra-ops | adapt |
| earbench: blind ABX + 3-axis ratings (accent as its own axis), four-cell counterbalance, catch trials, binomial/Wilson stats, three verdicts incl. under-powered, verify-trim of the disclosure | `scripts/earbench.mjs`, `evals/earbench/{lib,audio,server,run,cfg-conditioning}.mjs`, `evals/earbench/page.html`, `docs/gurukul/EARBENCH.md` | tested (85+ checks; never used by a human at WS-V) | eval-quality, voice-agent | drop-in |
| Sealed exact-text matched pack + in-studio blind listening with RSA-signed reveal (opaque ids, hidden repeats, attention checks, model map sealed until ratings lock) | `evals/voice-matched-pack/{pack,contract,run}.mjs`, `scripts/voice-matched-pack.mjs`, `src/studio/VoiceExperimentPanel.tsx`, `src/studio/voiceExperiment.ts`, `docs/gurukul/VOICE-EXACT-TEXT-MATCHED-PACK.md` | tested (real r2 pack exported; zero listeners) | eval-quality, voice-agent | adapt |
| Voice bake-off plan (Hindi/Hinglish/English prompts, three fixed seeds, receipts, rejection thresholds) | `docs/gurukul/research/VOICE-BAKEOFF-HINDI-ENGLISH-2026-08-28.md`, `evals/voice-bakeoff/prompts.v1.json` | prototype | voice-agent, eval-quality | idea-only |
| Per-speaker LoRA (one adapter per expert, composed at load, adapter inside signed body, private RNG for init, synthesis_commitment hash) | `services/voice-finetune/`, `services/open-voice-runtime/lora.py`, `app.py` | tested (one real 71 s smoke test) | voice-agent | idea-only |
| Wizard readiness as a pure function (null = unknown, at most one active step, unknown blocker codes rendered) | `src/studio/wizardModel.ts`, `src/studio/WizardRail.tsx`, `evals/studiowizard.mjs` | tested (6,912 fuzzed inputs) | design-ui, crm | adapt |
| DESIGN-LAW + copy gate (em-dash/AI-tell bans scoped to proven-visible strings, self-test fixtures, self-expiring waivers) | `docs/gurukul/DESIGN-LAW.md`, `scripts/check-copy.mjs`, `scripts/check-contrast.mjs`, `scripts/check-motion.mjs` | production (CI gate) | design-ui, content-gen | drop-in |
| Design tokens (type/space/radius/motion/focus/4 status states; contrast-fixed ink) | `src/studio/design/tokens.css`, `docs/gurukul/DESIGN-SYSTEM.md` | production | design-ui | adapt |
| Product journey audit method (break list with file:line, every wait/error/consent moment designed) | `docs/gurukul/PRODUCT-JOURNEY.md`, `docs/gurukul/UX-QUEUE.md` | production (doc) | design-ui | idea-only |
| Forget-follows-the-person (erasure across all surfaces of one human, fail closed to the asking device, live negative controls) | `api/memory.js` (`personDeviceSet`, `opForget`), `evals/forget/crosssurface.mjs` | production (39/39 live) | crm, safety, auth-tenancy | adapt |
| Context-memory system for long agent projects (decisions with reversal conditions, measurements with n/method/date, rejections, graph + checker, AGENTS.md door, append-only session log at file bottom) | `context/*`, `scripts/context.mjs`, `AGENTS.md` | production | orchestration, company-brain | drop-in |
| Statement-shape fake DB for offline SQL evals (most-specific-first, throws on unknown statement) | `evals/mirrorcall.mjs`, `evals/sqlcast/surface.mjs` | tested | eval-quality | adapt |
| Azure GPU deploy runbooks (scale-to-zero A100 in West US 3, regional ACR import, digest pinning, platform-aware `az` launcher) | `services/*/infra/main.bicep`, `services/openvoice-converter/remote-build.mjs`, `docs/gurukul/AZURE-DEPLOY-STATE.md` | tested | infra-ops | adapt |

## Measured lessons

- **Reference window choice beats fine-tuning** (`measurements.md#reference-window-beats-the-finetune`, 2026-08-26):
  which 10 s of reference you pass spans ECAPA 0.7433-0.8058 (0.0625), three times the 71 s LoRA delta
  (0.7753 -> 0.7959, n=2). Passing the full 71 s is worse than the best 10 s.
- **LoRA cost** (`lora-vs-zero-shot-71s`): adapter closes 18.4% of the gap to the 0.8869 self-vs-self ceiling but costs
  ~26% synthesis speed (RTF 0.79 -> 0.99). n=1 speaker, 62 s of speech. Smoke test only.
- **Chatterbox truncates reference to 10 s (S3Gen) / 6 s (T3)** (WS-Z primary code read): accumulating more reference
  audio cannot change synthesis.
- **Scale-to-zero GPU cold start** (AZURE-DEPLOY-STATE §8 + STATE): runtime ready 161 s after wake; cold has exceeded
  200 s; warm ~54 s; request signatures lived 60 s, so every cold request failed until "wake, then sign".
- **Admission probe** (`voice-panel-admission-probe`): 250/253/334 ms warm, n=3; says nothing about the GPU.
- **Owner upload stuck then drained** (`owner-upload-stuck-and-drained`): 32.9 MB upload sat at integrity/queued,
  attempt=0, from 15:28:50Z because no caller existed; exactly one job row in the table.
- **Enrollment reference bandwidth** (STATE 2026-08-27): reference was 8 kHz content labelled 24 kHz (0.000458% energy
  above 8 kHz); fixed to 0.0224% (~49x). Owner ear n=1 confirms direction, both still unacceptable.
- **Contrast** (`ink-faint-fails-aa`): `#7a7e74` measured 3.67:1 / 4.11:1, under WCAG AA; replaced with `#676b62`
  (4.82 / 5.39).
- **Copy gate** (`copy-law-violations-before-after`): 120 violations found, 117 fixed, waivers self-expire.
- **Sealed pack objective** (2026-08-28, n=6 unique clips, 0 listeners): ECAPA mean 0.665601, p10 0.585457 (fails
  provisional 0.70 floor); Azure Speech WER en-IN 2.90% vs hi-IN 26.19%.
- **OpenVoice tone-colour conversion regressed** (n=2): ECAPA 0.7267 -> 0.6810, script-aware WER 0.304 -> 0.375.
- **ZONOS2 on ACA A100**: 22 GiB image did not pull from Central India within 1,216 s (~USD 2.15 burned); regional
  ACR import pulled in 194 s, then `torch.cuda.is_available()` was false. Consumption A100 price measured USD 6.354/hr
  (West US 3).
- **Azure TTS vs Chatterbox for Meera** (older, `rejected.md#azure-tts`): Azure won every measured axis (Hindi words
  15/15 vs 11/15, first audio 255 ms vs 4.9-12.7 s, 5x cheaper) and the owner's ear rejected it: accent identity was
  never measured.
- **YouTube from Azure egress** (WS-AD): `/v1/enumerate` works (200 in 13.9 s); `/v1/extract` blocked with
  `extractor_bot_check` on all ten player clients.

## Rejected/failed approaches

| tried | broke |
|---|---|
| Mirror Call voice loop as written: accumulate call audio into the reference set and re-embed (`mirror-reference-accumulation-was-inert`) | Chatterbox slices the reference to 10 s/6 s; pipeline would return rising ECAPA numbers while synthesis could not change. Replaced by candidate pool + selection + two labelled meters |
| "Mine everything you are handed" in the Context Locker | Chat export's majority speaker is often not the owner; uploaded docs may not be the uploader's writing; article links never are. Produces well-cited, wrong phrase banks. Authorship/speaker now required inputs, default mines nothing |
| Naive PDF Tj/TJ extraction (`pdf-text-is-whatever-the-bytes-decode-to`) | Subset/CID fonts decode to glyph-index noise that repeats more regularly than language and clears frequency thresholds. Added `assertReadable` structural gate |
| Wiring owner-keyed tables into PERSON_TABLES for erasure | Would delete pointer rows before object-storage cleanup, stranding data while the receipt said "gone". Delete by name, child before parent |
| Building only adapters whose credentials exist (`a-scan-we-did-not-run-must-never-say-clean`) | Collapses five absences into one generic code; a "graceful" malware scan degrades into claiming clean |
| A complete producer + complete runner with no caller (`a-runner-nobody-runs`) | Queue never drained; every screen animated progress. Fix: a cron sweep; "name the line that calls it and the schedule that calls that" |
| `touchWatch()` writing `last_checked_at = now()` on failure (`a-fresh-timestamp-is-what-success-looks-like`) | A week of bot-check failures looked like a week of quiet checks. Added named sweep-state CHECK constraint |
| Dropping the video title, keeping only the id (`a-video-id-is-not-a-name`) | Owner could not tell what was processing |
| Broker `/healthz` as readiness check | It reports the CPU broker only; cannot see the private GPU app. Cold runtime is a timeout, not a 401 |
| Racing a wake against a timer and aborting | Abort cancels the request so the GPU is never scheduled |
| Warmth as two independent timestamps (`warming-that-does-not-clear-warm`) | After a 504 the state still read warm and the next click hung four minutes. `waking` now clears `lastReadyAt` |
| Blind bench with opaque filenames only (`disclosure-announces-the-clone`) | Every clip speaks "This is an AI-generated voice replica"; trimmed, and verify-trim checks only the removed prefixes so the sole listener is not unblinded |
| Alternating counterbalance (`alternating-is-not-counterbalanced`) | 10 correct-A vs 8 correct-B over 18 trials; replaced with four-cell cycle |
| LoRA init from global torch RNG (`adapter-init-stole-the-sampling-seed`) | Shifted the sampling stream so the adapted arm's delta was partly noise. Private generator |
| Fake DB routing by statement shape in written order (`mirror-fake-db-matched-a-session-instead-of-a-decision`) | Big CTE contained the small statement's discriminators; returned a plausible wrong-shape row. Most-specific-first + throw on unknown |
| Scanning a Base64 audio bundle for provider-name substrings (`base64-audio-is-not-searchable-model-metadata`) | Random Base64 contains short provider substrings; false leak. Scan structured metadata only |
| Run-id + sealed-key-hash as report authenticity | Both values were public; a forged report could reveal chosen labels. RSA-signed report with private key outside the bundle |
| Treating self-test account attestation as speaker consent to train on a 109-min third-party lecture | Account bypass is not consent from the person speaking; dominant diarization cluster had neutral target likelihood. Stopped before any GPU spend |
| One aggregate objective score to pick a winner | Hides a 2.9% vs 26.2% language gap and double-counts repeats |
| IndicF5 -> OpenVoice V2 tone-colour conversion | Valid receipts, but ECAPA and WER both regressed |
| Research-rejected for the learning loop: mid-call fine-tuning; unattended self-critique; DPO/RLHF on sparse feedback (log KTO-shaped instead); denoising accumulated audio (raised MOS, lowered speaker similarity 0.35 -> 0.28); persona vectors; multi-reference conditioning; seed-vc (GPL) / WeClone (AGPL) code | See `docs/gurukul/research/mirror-learning.md` section 5 |

## Risks/landmines

- **Most WS deliverables were verified offline only at merge time.** Commit messages are explicit ("NOT LIVE",
  "migration unapplied", "no clone has ever spoken a Mirror Call turn aloud", "NO HUMAN HAS LISTENED"). Later sessions
  applied migrations and drove some paths live, but Mirror Call end-to-end with real audio is not evidenced.
- **Voice likeness is unsolved.** No candidate model has qualified; the bake-off spans Hugging Face open models with
  gated licences (IndicF5) and vendor anchors (ElevenLabs, MiniMax, Fish, Sarvam) that the Azure-only constraint forbids.
- **Non-Azure dependencies throughout**: Vercel hosting, Supabase auth/storage, Sarvam ASR/TTS (Sarvam returned HTTP 402
  billing), yt-dlp against YouTube. A rebuild would need Azure equivalents (Azure Speech STT, Entra/own auth, Blob).
- **Migration numbering collisions**: two different `058_*` and `060_*` files were authored in parallel and renumbered
  at merge; parallel workstreams also collided on the same live Container Apps Job image (STATE logs an overwrite).
- **Data disappearance incident** (STATE): production processing rows were cleared by an unidentified concurrent
  session; unexplained.
- **Secrets hygiene**: `api/_config.js` gitignored but deployed in the Vercel payload; STATE lists keys and an ACR
  password fragment pasted into chat as needing rotation; `REPLICA_SELF_TEST_MODE` consent rows must be revoked.
- **Scale-to-zero GPU UX**: 180 s client timeout equals the top of the advertised 2-3 minute ETA.
- **Preview ledger structural bug**: preview `voice_profile_id` NULL vs NOT NULL column means the ledger cannot open
  without an active capability.
- **Size and coupling**: `context/decisions.md` 443 KB, `measurements.md` 397 KB, `rejected.md` 333 KB; the code is
  coupled to the Meera engine (`engine.compile`, TeacherSheet) and Neon SQL-over-HTTP conventions.
- **Prose density**: modules carry long essay comments; reuse should lift patterns, not files wholesale.

## Azure dependencies

Names only (no secrets): resource group `vyakti-voice` (Central India); Container Apps `vyakti-open-voice` (GPU,
minReplicas=0), the admission broker, `vyakti-voice-evidence` (internal ingress), `vyakti-media-extract`,
`vyakti-replica-processing` (Container Apps Job, 5-min cron), `audio-protection` service; candidate apps/gates for
IndicF5, VoxCPM2, Qwen3-TTS, ZONOS2 (dedicated West US 3 `Consumption-GPU-NC24-A100` environment, torn down), OpenVoice
converter; Azure Container Registry (Central India + a West US 3 Basic ACR for regional import); Azure Blob Storage for
replica media (`services/replica-processing-worker/infra/replica-storage.bicep`); Azure Speech (short-audio STT for
WER scoring; also the earlier Azure TTS / Personal Voice comparisons in `docs/AZURE-PERSONAL-VOICE.md`); Log Analytics.
Non-Azure in use: Neon Postgres, Supabase, Vercel, Sarvam, Hugging Face model downloads.

## Recommendation for sales-enabler

1. **Lift the honesty substrate first; it is domain-agnostic and the most production-proven part.** Port the
   capability-absence code set + "every step always has an adapter" composition + cron sweep with requeue
   (`api/_replica-processing/*`) as the backbone of the command centre's orchestration layer (campaign sends, lead
   enrichment, CRM syncs, call jobs). Pair it with the Activity read model (`api/_replica-activity.js`): one job shape
   across all async lanes, no fake percentages, "waiting on you" vs "waiting on us". This is the operator's view of an
   AI-run company.
2. **Make every AI-proposed change to a record or persona an approval chip enforced by SQL.** The `decideMirrorDelta`
   pattern (write upstream of state flip, state predicate in the same statement, eval that strikes the clause and
   must see the leak) is directly reusable for CRM field updates, ERP entries, campaign copy edits and agent-persona
   updates proposed by the company brain. Keep "mined-from-behaviour" and "accepted-from-judgement" in separate columns
   to measure sycophancy drift.
3. **Build the company-brain ingestion on the Context Locker's rules**: magic-byte sniffing, stored named refusals,
   per-tenant quotas, authorship/speaker as required inputs, span-verified citations before storage. Replace the
   regex PDF extractor with Azure AI Document Intelligence (Azure-only), but keep `assertReadable` as a gate on its
   output.
4. **For the voice agent, take the Mirror Call shape, not the cloning stack.** A "calibration call with your own agent"
   where the owner corrects it live and approves deltas is an excellent onboarding for sales voice agents. Use Azure
   Voice Live / Azure Speech TTS for the agent voice (no per-person cloning needed for a sales agent), and reuse the
   cold-start-as-a-state contract for any scale-to-zero component.
5. **Adopt earbench/sealed-pack methodology for every voice and agent model choice.** The `azure-tts` lesson (all
   metrics said switch, the ear said no, accent identity was unmeasured) is the single most important warning for an
   Azure-only Indian-market voice agent: run blinded, counterbalanced listener tests with accent as its own axis before
   choosing an Azure neural voice, and never report a proxy metric as quality.
6. **Adopt the context/ memory discipline and the copy/contrast gates verbatim** (`scripts/context.mjs`,
   `scripts/check-copy.mjs`, DESIGN-LAW, tokens). They are cheap and pay off immediately in multi-agent builds.
7. **Do not port**: the Chatterbox/LoRA/IndicF5/ZONOS2 GPU runtimes (likeness unsolved, licence-gated, heavy),
   Supabase/Vercel/Sarvam wiring, the Meera engine coupling, or the YouTube extraction lane.
