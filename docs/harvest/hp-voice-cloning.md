# Harvest: html-portfolio `voice-cloning` branch (cluster `hp-voice-cloning`)

Source repo: `/home/user/html-portfolio` (read-only; inspected through a detached worktree of `origin/voice-cloning`, since removed).
Harvested: 2026-10-15.

## Summary

The `voice-cloning` branch is not a voice-cloning demo. It is a large (342 files, ~50k added lines) **consented "self-replica" control plane** called *Vyakti Replica Lab*, mounted at `/studio` in the Meera repo but kept separate from Meera's chat and call lanes. Forty `replica:` commits on 2026-08-24/25 build: identity/age/liveness verification, provider-specific voice consent, private evidence upload and quarantine, a GPU evidence-processing plane (diarization, separation, enhancement, speaker embeddings, Azure Speech fast transcription), a provider-neutral VoiceGenome and PCM synthesis contract, two voice providers (Azure Personal Voice and self-hosted Chatterbox Multilingual), a blinded owner-preference voice curriculum (Bradley-Terry active learning), an immutable "Voice Delivery Genome", a held-out owner qualification gate (Wilson bound), an output-protection chain (audible disclosure + AudioSeal/PerTh watermark + signed segment hash chain + C2PA via Key Vault), a revocation-aware delivery fence, a full erasure state machine, and an atomic paid-provider spend ledger capped under the Azure grant.

**The honest status: everything is built and offline-tested, nothing is live-measured.** Every doc states it explicitly: no Azure Personal Voice request has ever been made (Limited Access not approved), no Azure Speech spend occurred, migration 028 (spend ledger) and the replica migrations are not applied to production, the GPU services are "deployable" (Bicep present) but there is no evidence they were deployed or run against real audio, and no voice-quality number exists for any cloning provider. I re-ran 16 of the offline eval suites on 2026-10-15 from a clean worktree with no `node_modules`; all passed (e.g. provider-budget 38/38, azure-personal-voice 27/27, voice-curriculum 25/25, voice-delivery-holdout 22/22, open-voice 35/35, voice-evidence 22/22, voice-enrollment 25/25, voice-erasure 18/18, source-erasure 23/23, provider-consent 28/28, replica-provenance 40/40, production-protection 31/31, replica-processing all passed). These are contract/protocol tests against mocks and fakes, not quality tests.

The **measured** voice knowledge that does exist is inherited from Meera on `main` (and merged into this branch): Azure TTS was rejected by ear despite winning every numeric axis, `gpt-realtime-2.1-mini` was rejected for the call lane on verbosity and voice, and the Azure realtime protocol has hard shape constraints. Those rejections are the highest-value items in this cluster for a sales-voice-agent product.

For sales-enabler (an AI company command centre with voice and chat agents), the cloning product itself is mostly out of scope, but four pieces are directly reusable: (1) the atomic **paid-provider spend ledger**, (2) the **provider-neutral voice contract + registry** pattern, (3) the **Azure Speech fast-transcription adapter** and the **blinded A/B + Bradley-Terry + Wilson-gate** evaluation machinery (perfect for voice-agent and campaign-copy bake-offs), and (4) the **Azure Container Apps Bicep patterns** (scale-to-zero GPU app behind an HMAC admission broker; event-driven Container Apps Job for queued processing).

## Branches covered

| branch | tip | dates | relation to main |
|---|---|---|---|
| `voice-cloning` | `a7bdcaa4` "merge: sync latest Meera foundation into voice-cloning" | 2026-08-24 to 2026-08-25 | Merge base is `origin/main` tip `3a921798` (Maya merge, PR #3). 41 commits ahead of main, 0 behind. 40 are `replica:` commits; one is `chore: keep Vercel project metadata local`; the tip merges main back in. |

What differs from main (`git diff --stat origin/main...origin/voice-cloning`): new `api/_replica-*.js` (≈30 modules), `api/_voice/`, `api/_replica-processing/`, `api/_provenance/`, `api/_identity/`, `api/_liveness/`, `api/_face-session/`, `api/_dialogue/`, `api/_claim-extraction/`, `api/_provider-budget.js`, ~30 `api/replica-*.js` route files; migrations `015`-`050`; `db/schema.sql`; five services under `services/` (azure-verifier, open-voice-runtime, voice-evidence, audio-protection, replica-processing-worker), each with Dockerfile and most with Bicep; `src/studio/` (Studio React app, ~25 components, `studio.css` 2.5k lines); ~20 docs (`docs/SPEC-REPLICA-PLATFORM.md`, `docs/AZURE-PERSONAL-VOICE.md`, `docs/AZURE-FOUNDRY-PLAN.md`, `docs/PROVIDER-BUDGET.md`, `docs/VOICE-CURRICULUM.md`, `docs/VOICE-DELIVERY-POLICY.md`, `docs/VOICE-DELIVERY-HOLDOUT.md`, `docs/REPLICA-*.md`, `docs/research/REPLICA-FRONTIER-2026.md`); ~35 new eval suites under `evals/`; five new decisions in `context/decisions.md` (`replica-self-only`, `replica-provider-portable`, `replica-preview-before-conversation`, `replica-evidence-private-capability`, `replica-azure-credit-is-an-eval-budget`). Small touches to Meera core: `src/engine/relstate.ts`, `src/engine/texture.ts`, `src/voice/speech.ts`, memory/consolidation APIs (agent-scoping).

Commit messages have no bodies; rationale lives in docs and `context/decisions.md`.

## Product

Vyakti Replica Lab lets a **verified living adult** build a private replica of themselves: enroll (identity document + Azure Face liveness via a separate verifier service), give granular consent, upload noisy historical audio/video/text directly to a private bucket, have it scanned/separated/transcribed into reviewable evidence, approve a draft VoiceGenome and an evidence-cited Person Model (biography, values, speech, relationship modes), calibrate behaviour through typed contrasts, then audition voice candidates blind and converge on a delivery policy. A private dialogue lane compiles the frozen Person Model into Azure Foundry structured output; cloned speech can only come out through the protected cascade with disclosure, watermarking and a signed provenance chain, and every segment rechecks that the replica capability has not been revoked. Erasure is a full, retrying state machine (provider voice -> source objects -> derived models).

Scope locks (decision `replica-self-only`): no public figures, minors, deceased or third parties; no public sharing, downloadable weights, bulk generation or outbound calls. Runtime activation is closed until Limited Access, production watermark/C2PA adapters and blind audio evaluation pass. None of those have passed.

## Architecture & stack

- **Web/API**: Vercel serverless JS (`api/*.js`), React 19 + TS + Vite Studio (`studio.html`, `src/studio/`). Auth: verified Supabase user via Bearer (`api/_auth.js`, `src/studio/studioAuth.ts`). Owner is always derived server-side; never from body/device id.
- **DB**: Postgres (Neon) via migrations `db/migrations/015-050`, tables prefixed `vy_replica_*`; append-only decision/attempt ledgers; immutable versioned artifacts (VoiceGenome, Person Model, calibration policy, Voice Delivery Genome).
- **Storage**: Supabase Storage private bucket with one-object, two-hour upload capabilities (`api/_replica-storage.js`, `api/_replica-source.js`); client SHA-256 in a worker (`src/studio/sha256.worker.ts`) is only a declaration, re-verified server/worker-side. Plan notes Azure Blob later.
- **Processing**: queue + lease DAG (`api/_replica-processing/queue.js`, `worker.js`, `pipeline.js`) executed by an Azure Container Apps **Job** (`services/replica-processing-worker/`, ClamAV + ffprobe) calling a private GPU **voice-evidence** service (`services/voice-evidence/app.py`: SpeechBrain ECAPA + x-vector, SepFormer WHAMR, Silero VAD, DeepFilterNet3) and **Azure Speech fast transcription** (`api/_replica-processing/providers/azure-fast-transcription.js`, api-version 2025-10-15).
- **Voice providers**: `api/_voice/contracts.js` (createVoice / getVoiceStatus / synthesizeStream / deleteVoice; 24 kHz s16le mono; mandatory disclosure prefix), `api/_voice/registry.js`, `providers/azure-personal-voice.js` (Custom Voice API 2026-01-01, consent -> profile -> SSML synth with pinned base model), `providers/open-chatterbox-preview.js` (HMAC client to `services/open-voice-runtime`, Chatterbox Multilingual V3 pinned by commit, GPU behind CPU admission broker), `providers/fake.js` (refused in production).
- **Protection/provenance**: `api/_provenance/` (contracts, delivery fence, Neon ledger, Azure protection adapter), `services/audio-protection/` (AudioSeal 0.2 + C2PA sidecar signed by non-exportable Azure Key Vault ES256 key).
- **Learning loop**: `api/_replica-voice-curriculum.js` (7 bounded Chatterbox conditions, BT-MAP active pair selection), `api/_replica-voice-preference.js`, `api/_replica-voice-delivery-policy.js` (immutable genome + 12-cell holdout, Wilson lower bound), `api/_replica-candidate-eval.js` / `_replica-candidate-qualification.js` (blinded paired candidate gate), `api/_replica-feedback*.js` (per-layer turn feedback with envelope encryption, leakage-safe dataset splits).
- **Spend**: `api/_provider-budget.js` + migration `028_provider_budget.sql`.
- **Infra-as-code**: Bicep for `vyakti-identity-verifier`, `vyakti-open-voice` + `vyakti-open-voice-admission`, `vyakti-voice-evidence`, `vyakti-replica-processing` (Central India), all scale-to-zero, private ingress, images by digest.

## Reusable assets

| asset | paths | maturity | reuse for | effort |
|---|---|---|---|---|
| Atomic paid-provider spend ledger (reserve before I/O, one-way begin, settle measured usage, lock ambiguous outcomes for reconciliation; Foundry tokens, Speech audio-seconds, TTS characters) | `api/_provider-budget.js`, `db/migrations/028_provider_budget.sql`, `docs/PROVIDER-BUDGET.md`, `evals/provider-budget/run.mjs` | tested (38 offline checks; never live) | infra-ops, orchestration, voice-agent, campaigns, analytics | adapt |
| Provider-neutral voice contract + registry (fixed 24k PCM, disclosure enforced in contract, provider ids never leave server, fake refused in prod) | `api/_voice/contracts.js`, `api/_voice/registry.js`, `api/_voice/providers/fake.js` | tested | voice-agent, safety | drop-in |
| Azure Personal Voice adapter (consent resource -> profile -> pinned-model SSML -> raw PCM; deterministic Operation-Ids; idempotent delete; WAV byte-probe) | `api/_voice/providers/azure-personal-voice.js`, `api/_audio/wav.js`, `docs/AZURE-PERSONAL-VOICE.md`, `evals/azure-personal-voice/run.mjs` | tested (mock only; Limited Access never approved) | voice-agent | adapt |
| Strict WAV/PCM byte prober (RIFF bounds, format, duration from PCM, clipping/DC/silence rejection) | `api/_audio/wav.js` | tested | voice-agent, omnichannel | drop-in |
| Azure Speech fast-transcription adapter (metered, Hinglish-oriented, content-free errors) | `api/_replica-processing/providers/azure-fast-transcription.js`, `docs/REPLICA-PROCESSING.md` | tested (mocked responses; no live quality data) | voice-agent, omnichannel, company-brain | adapt |
| Queue/lease DAG worker + Container Apps Job (lease, idempotent stage, create-only writes, rehash, content-free outcome codes) | `api/_replica-processing/queue.js`, `worker.js`, `pipeline.js`, `repository.js`, `services/replica-processing-worker/` (Dockerfile, `infra/main.bicep`, `run-once.js`) | tested (offline); deployable, not deployed | orchestration, infra-ops, company-brain | adapt |
| GPU service behind HMAC admission broker (CPU broker validates body HMAC/nonce/timestamp so random traffic cannot wake GPU; scale-to-zero; images by digest) | `services/open-voice-runtime/broker.py`, `app.py`, `infra/main.bicep`, `Dockerfile*` | prototype (offline compile checks) | infra-ops, voice-agent | adapt |
| Voice-evidence service (diarize/separate/enhance/dual-embedding, HMAC both ways, models baked in) | `services/voice-evidence/` | prototype | voice-agent (call QA, speaker attribution of recorded sales calls), company-brain | adapt |
| Blinded A/B + Bradley-Terry active curriculum (Fisher-info pair choice, repeat penalty, prompt-deck rotation, conservative convergence) | `api/_replica-voice-curriculum.js`, `api/_replica-voice-preference.js`, `docs/VOICE-CURRICULUM.md`, `evals/voice-curriculum/run.mjs` | tested | eval-quality, voice-agent, campaigns (copy/creative preference learning) | adapt |
| Held-out qualification gate (preregistered deck, 2 seeds per prompt, counterbalanced sides, rate >=0.75 AND Wilson lower >0.50, owner-pass cannot auto-promote) | `api/_replica-voice-delivery-policy.js` (`wilsonLower`, holdout issue/finalize), `db/migrations/049-050`, `docs/VOICE-DELIVERY-HOLDOUT.md` | tested | eval-quality | adapt |
| Blinded paired candidate promotion gate (target-layer improvement, cross-layer noninferiority, zero critical safety, bounded false memories) | `api/_replica-candidate-qualification.js`, `api/_replica-candidate-eval*.js`, `docs/CANDIDATE-QUALIFICATION.md`, `docs/CANDIDATE-EVALUATION.md` | tested | eval-quality, chat-agent, voice-agent | idea-only to adapt |
| Leakage-safe feedback dataset compiler (immutable train/dev/test by whole conversation, latest revision only, unsafe sessions forced to holdout) | `api/_replica-feedback-dataset.js`, `docs/FEEDBACK-DATASET.md` | tested | eval-quality, memory-learning | adapt |
| Per-layer turn feedback (wording / behaviour / relationship / memory / delivery / heard-voice graded separately, envelope-encrypted corrections as evidence not prompt mutation) | `api/_replica-feedback.js`, `api/_replica-feedback-crypto.js`, `docs/TURN-FEEDBACK.md` | tested | memory-learning, chat-agent, voice-agent | adapt |
| Cited claim extraction with identifier masking + Azure Foundry strict structured output + citation revalidation | `api/_claim-extraction/`, `api/_replica-claims.js`, `docs/CLAIM-EXTRACTION.md` | tested (protocol only) | company-brain, crm (account facts from calls/emails) | adapt |
| Azure Foundry structured-output dialogue adapter compiled from a frozen versioned profile | `api/_dialogue/providers/azure-foundry.js`, `api/_replica-dialogue.js`, `docs/REPLICA-DIALOGUE.md` | tested (offline) | chat-agent, voice-agent | adapt |
| Revocation-aware streaming delivery fence (re-check capability before releasing each signed 240 ms PCM segment) | `api/_provenance/delivery.js`, `api/_provenance/providers/neon-ledger.js`, `docs/REPLICA-PROVENANCE.md` | tested | safety, voice-agent | idea-only |
| Audio protection service (AudioSeal + C2PA signed by Key Vault non-exportable key) | `services/audio-protection/` | prototype | safety (AI-voice disclosure on outbound calls) | adapt |
| Erasure state machine with leased reconciler, exponential backoff, never "gave up" | `api/_replica-voice-erasure.js`, `_replica-source-erasure.js`, `_replica-full-erasure.js`, `api/replica-erasure-sweep.js`, `docs/REPLICA-ERASURE.md` | tested | crm (GDPR/DPDP lead deletion), auth-tenancy | adapt |
| Azure identity/liveness verifier service | `services/azure-verifier/` (node tests), `api/_identity/`, `api/_liveness/` | tested | auth-tenancy (only if KYC needed) | idea-only |
| Azure Foundry $2k grant allocation plan + model acceptance rule | `docs/AZURE-FOUNDRY-PLAN.md` | n/a (researched plan) | infra-ops, orchestration | idea-only |
| Open-model voice landscape with licence verdicts (adopt / route / benchmark-only) | `docs/research/REPLICA-FRONTIER-2026.md` section 2-3 | research | voice-agent | idea-only |

## Measured lessons

Nothing on this branch was measured live. The measured voice lessons below are Meera's (on `main`, carried on this branch) and are the reason the replica design looks the way it does.

1. **Numbers lied, ears decided (Azure TTS).** Azure "coral" beat the incumbent on Hindi word correctness 15/15 vs 11/15, first audio 255 ms vs 4.9-12.7 s, and cost $0.0029 vs $0.0148 per utterance, but was rejected by owner ear as "not human and not Indian". Pronunciation is not accent identity; any voice comparison must score accent authenticity as a first-class axis. (`context/rejected.md#azure-tts`, `context/measurements.md#voice-ears`, 2026-08-11, 9 lines x 4 arms, WAV blind listen.)
2. **ASR recall is not a quality ranking.** Coral ASR recall 0.93 vs control 0.71, because expressive delivery (laughing over words) lowers recall. (`voice-ears`, 2026-08-11.)
3. **`gpt-realtime-2.1-mini` on Azure: barge-in and vision pass, persona fails.** Barge-in VAD 6/6, median 271 ms vs incumbent 279 ms; vision 5/5 correct, 0 fabricated; first audio 1458-1497 ms vs 1370 ms (9 sessions / 72 turns). Disqualified: 41-53 words/turn vs 20.5, median 14.0 s spoken turns, 13/24 turns ending in questions, weak Hinglish, and its six voices measure 137-192 Hz vs 266 Hz anchor. "The prompt sets a ceiling, the model decides how close you get." (`context/rejected.md#realtime-azure`, 2026-08-11.)
4. **Azure realtime protocol shape.** Input audio below 24 kHz is refused (`integer_below_min_value`); no continuous image/video buffer, frames only as discrete `conversation.item.create`. (`context/measurements.md#azure-realtime-shape`, 2026-08-11.)
5. **Pitch anchors drift.** The paid Gemini TTS lane measured median f0 212/214 Hz over 2 runs x 5 lines vs the 266 Hz anchor used to judge vendors; Hz alone must be paired with an ear test. (`prosody-baseline-f0-gap`, 2026-08-15.)
6. **Hinglish TTS round-trip.** n=20: bare "hai" round-trips as English "hi"; "chhod" loses aspiration; STT orthographic normalisation causes most 0%-match rows, so STT round-trip overstates mispronunciation. (`hinglish-tts-l1`, 2026-08-22.)
7. **Fixed latency fuses break on variable upstreams.** Google TTS first frame degraded to 9.7-11.3 s (n=3) vs 615-1051 ms baseline; a fixed 1400 ms fuse cut every key; fix was a two-phase fuse (short hunt, then one 15 s attempt before paid). (`tts-first-frame-degraded`, `two-phase-fuse`, 2026-08-24.)
8. **Azure grant coverage.** Startup sponsorship covers Direct-from-Azure Foundry models only; Anthropic-on-Foundry and Marketplace/partner models are excluded ("card trap"). (`credits-partner`, `judge-grant-only`, `docs/AZURE-FOUNDRY-PLAN.md`.)
9. **Offline gate status, this harvest.** 16 voice/replica suites re-run 2026-10-15 from a clean worktree: all pass (counts in Summary). Method: `node evals/<suite>/run.mjs` directly, no network, no model calls.

## Rejected / failed approaches

- **Azure neural TTS as the persona voice** - better on every metric, rejected by ear as not Indian/not human (above).
- **`gpt-realtime-2.1-mini` as the voice call lane** - verbosity and voice range, not latency (above). Reverses only with <=20.5 words/turn at <=1370 ms, an Indian voice near 266 Hz, and frame streaming.
- **`gemini-2.5-flash-native-audio` live model** - 0/24 barge-in (`live-model-bake`, referenced in `docs/VOICE-LANE.md`).
- **Fixed 1400 ms TTS fuse** - killed every key during upstream degradation (`fixed-fuse-on-a-variable-upstream`).
- **Voice caches keyed without the voice name** - after a voice switch, IndexedDB caches kept serving the old voice (`cache-outlives-the-voice`); and re-deriving the TTS vendor per phrase spoke one reply in two vendors (`engine-per-phrase`). Lesson: one writer for voice identity, voice id in every cache key.
- **Professional Custom Neural Voice on the grant** - rejected by plan: managed training plus always-on hosting can consume the whole $2k grant before validation (`docs/AZURE-FOUNDRY-PLAN.md`).
- **Training a speech foundation model** - rejected (`replica-azure-credit-is-an-eval-budget`, `replica-provider-portable`): leaders use 10^5-10^6 hours; own the evaluation/data spine and route providers instead.
- **Licence-blocked open models as core** - Fish S2 weights (research licence), F5-TTS pretrained weights (non-commercial), IndexTTS 2.x (output-use restrictions), Seed-VC (archived/GPL), OpenVoice V2 (behind frontier) (`docs/research/REPLICA-FRONTIER-2026.md` section 2).
- **A second conversational agent on unscoped memory** - blocked (`replica-preview-before-conversation`, open node `replica-raw-memory-unscoped`): raw logs/nodes/edges/forget/watermarks were not agent-scoped; a prompt instruction cannot fix a storage isolation bug.
- **Modifying `liveCall.ts` / a second audio player for the clone** - rejected; Gemini Live generates native audio and cannot speak an external voice, so clones go cascade-only (`docs/SPEC-REPLICA-PLATFORM.md` call-lane boundary).
- **Single denoise pass / single speaker encoder as truth** - rejected by design: enhancement can change identity; keep raw, generate multiple candidates, use two embedding families (`docs/research/REPLICA-FRONTIER-2026.md` section 3).
- **Moving `Latest` TTS base model** - rejected; a pinned version is mandatory so a person's voice cannot silently change.

## Risks / landmines

- **Zero live evidence.** No cloning provider has produced audio that was measured. Treat every voice-quality and latency claim on this branch as unproven.
- **Personal Voice is Limited Access** and approved only for a specific business use case; an outbound sales voice agent cloning a rep is a different use case than "self-replica" and may not be approved. Requires recorded verbal consent per voice.
- **Over-engineering risk for sales-enabler.** The consent/liveness/C2PA/erasure apparatus is sized for biometric self-replication. A sales voice agent using stock Azure HD/neural voices needs only disclosure + spend + provider contract.
- **Storage and auth are Supabase**, not Azure Blob/Entra; reuse needs porting. Supabase is not on the sales-enabler allow-list.
- **Hosting is Vercel serverless**; the GPU/worker services target Container Apps but the control plane does not.
- **Unapplied migrations** (`015`-`050`) include `010_agent_strict.sql` modifications; copying schema means owning an untested migration chain.
- **Azure TTS voices were judged not Indian by ear.** If sales-enabler targets Indian prospects in Hinglish, stock Azure voices may fail the same test; budget an ear-judged blind deck before committing (and remember Azure-only constraint removes the Gemini incumbent).
- **Bicep resources named `vyakti-*`** in Central India; do not deploy them as-is.
- Owner self-evaluation (holdout) is explicitly not production qualification; do not mistake `owner_pass` for a quality gate.

## Azure dependencies

- Azure AI Speech: fast transcription (`speechtotext/transcriptions:transcribe`, api-version 2025-10-15), Personal Voice / Custom Voice API 2026-01-01 (Limited Access), TTS endpoint `https://<region>.tts.speech.microsoft.com`, raw-24khz-16bit-mono-pcm output.
- Azure AI Foundry Direct models: GPT-5.6 family (dialogue, claim extraction, structured output), `text-embedding-3-large`, `gpt-realtime-2.1-mini` (benchmark only).
- Azure AI Face liveness (model version 2025-05-20) and Document Intelligence (identity verifier).
- Azure Container Apps (apps + Jobs, GPU workload profiles, scale-to-zero), Azure Container Registry (digest-pinned images), Azure Key Vault (ES256 signing key, sign-only managed identity).
- Planned: Azure Blob (private endpoints), Azure AI Content Safety, budget alerts at $250/$750/$1,250/$1,600/$1,800.
- Non-Azure in this branch: Supabase (auth + storage), Neon (ledger, allowed), Vercel (hosting).

## Recommendation for sales-enabler

1. **Lift the spend ledger first.** Port `api/_provider-budget.js` + migration 028 into the command centre's orchestration layer as the single choke point for every paid Azure call (Foundry tokens, Speech seconds, TTS characters, ACS email/calls). Generalise `OPERATIONS` to campaign sends, lead enrichment, agent turns; keep reserve-before-I/O and the `reconcile_required` state. This is the most production-shaped, provider-agnostic asset in the cluster.
2. **Adopt the voice provider contract shape** (`api/_voice/contracts.js`): fixed PCM format, disclosure enforced in the contract, provider refs server-only, fake provider refused in production. Implement an Azure neural/HD TTS provider and an Azure Voice Live provider behind it, so the telephony provider decision stays open.
3. **Build the voice-agent bake-off on the curriculum + holdout machinery** rather than on numeric metrics alone: blinded A/B, prompt-deck rotation, Bradley-Terry convergence, preregistered held-out deck with Wilson lower bound. Add the Meera lesson explicitly: score accent authenticity and words-per-turn as first-class axes; ASR recall is not quality.
4. **Reuse the Container Apps patterns** (Job for queue processing; HMAC admission broker in front of any scale-to-zero GPU) for call-recording analysis, transcription and enrichment jobs. Reuse `services/voice-evidence` only if speaker attribution of recorded sales calls becomes a feature.
5. **Reuse cited claim extraction** (mask identifiers -> Foundry strict JSON -> revalidate citations) for the company brain and CRM: facts about accounts extracted from calls/emails must cite their source span.
6. **Do not port** the self-replica product, liveness/identity KYC, C2PA/AudioSeal, Personal Voice cloning, or the Studio UI unless a rep-voice-cloning feature is explicitly chosen; if it is, start from `docs/AZURE-PERSONAL-VOICE.md` and apply for Limited Access early, since approval is the gating dependency, not code.
7. **Carry the rejections into the sales-enabler context log**: `azure-tts` (by ear), `realtime-azure` (verbosity, voice range), `azure-realtime-shape` (24 kHz minimum, no frame stream), fixed-fuse, cache-keyed-without-voice, no Professional CNV on a grant.
