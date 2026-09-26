# Voice, relational state, and replica-platform audit

Audit date: 2026-09-21 (Asia/Calcutta)

Repository: `https://github.com/raghavsharma2003/html-portfolio.git`

Clone: `research-sources/html-portfolio`

The remote had 31 named branches when cloned. `origin/HEAD` is a symbolic ref and is excluded from the count. Every named branch tip SHA, tip subject, tip paths, and inspection disposition is in [voice-relational-audit-branches.json](./voice-relational-audit-branches.json). The branch refs were inspected without checking them out. I used Git object/tree/diff/log reads and text search only; I did not execute repository code, tests, build scripts, deployment commands, database migrations, or provider calls.

## Scope and evidence standard

The repository uses a disciplined distinction between an architectural contract, an offline structural evaluation, a mocked provider boundary, and a live measurement. I preserve that distinction here. A function, migration, container image, or green fixture suite is evidence that a control was authored. It is not evidence that a provider is deployed, a migration is applied, a browser path is reachable, or a human finds the output convincing.

Several branches contain `AGENTS.md`. I read the distinct versions present on `claude/gurukul-platform`, `claude/vyakti-cloning-platform-aq05n4`, `codex/*`, and `gurukul-ws-am..as`. Their repeated governing rules are themselves useful audit evidence: do not claim an unrun check; mocked SQL does not type-check a real database; a complete definition can still be dead without a caller; an honest blocker is preferable to a plausible value; consent must be a SQL predicate; generated audio must carry spoken disclosure and a PerTh watermark; and persona state must not self-update without an explicit human action. The later `AGENTS.md` variants also say plainly that the owner clone does not yet sound like the owner, despite the pipeline working.

The exact strings `VoiceAI`, `EmotionalOS`, and `emotionOS` do not occur in the inspected branch trees. Their closest implemented counterparts are:

* the Voice/Replica platform (`voice-cloning`, `voice-preview`, processing, VoiceGenome, provenance, Mirror Call and delivery lanes);
* the affect/relationship layer in Meera (`affect_tags`, episodes, trust, rupture/repair, honorific and code-switch state, memory retrieval and disclosure); and
* RelationalOS, explicitly named in `docs/RELATIONALOS.md`, which is a general agent/surface/memory/relationship substrate.

There is no conventional CRM or sales pipeline in these branches. There are strong customer/person relationship primitives, owner context ingestion, rooms/channels, activity records and auditable proposals. Leads, accounts, opportunities, stages, assignment, tasks, revenue attribution, SLA queues and sales analytics would still need to be designed above these primitives.

## Executive assessment

The strongest reusable material is the combination of five layers:

1. **RelationalOS substrate.** Main has agent-scoped memory, episodes, citations, disclosure predicates, deterministic prompt compilation, time/presence, trust/rupture/repair state and transport adapters. The key design insight is to keep safety and relationship state as typed, queryable predicates and pure replayable functions rather than trusting a prompt to enforce them.
2. **Replica control plane.** `voice-cloning` turns “clone me” into a self-only, adult-verified, identity/liveness-bound capability. It has typed consent receipts, immutable source/artifact/evidence lineage, owner-scoped SQL, review states, versioned Person Model and VoiceGenome drafts, qualification suites, provider budgets, activation freezing and erasure paths.
3. **Evidence and calibration loops.** The Gurukul branches add a quarantined audio DAG, selected reference windows, owner review, blinded candidate comparison, feedback datasets, Mirror Call proposals and Context Locker provenance. The repository repeatedly refuses to convert an unmeasured proxy into a quality claim.
4. **Honest product surfaces.** Studio branches expose “waiting on you” versus “waiting on us,” cold-start states, one next action, explicit routed/refused states, mobile layout fixtures and a private voice preview that discloses and watermarks every clip.
5. **Multichannel relationship architecture.** Main’s surface adapter plus the Rooms work in later branches establish a path for web, Telegram, WhatsApp, Discord and group/customer contexts. The privacy shape—creator material, follower-private memory and aggregate-only creator views—maps well to customer management if generalized beyond a single teacher/creator.

The decisive weakness is maturity at the product boundary. The repository has a substantial control plane and high-quality offline tests, but the self-replica quality claim is not yet established. The live deployment notes say the GPU pipeline has synthesized and measured a consented owner sample, while identity similarity and reference quality remain below activation or are only smoke-tested. The branch notes explicitly say a 71-second LoRA result is not evidence against the recommended 30-minute corpus, synthetic-buzz deployment proves plumbing rather than human quality, and live voice/relational SQL gates are skipped whenever the required environment is absent. A SaaS company can treat the control plane as a candidate for selective reuse pending business/runtime validation; it should initially sell workflow, context, relationship continuity and human-approved agent actions, while treating voice likeness and emotion inference as gated pilots.

## Main branch: RelationalOS and Meera baseline

Tip: `3a9217981b27636745fc70ac490aacf9ef3f392d` (`main`).

Main is an implemented companion-oriented foundation rather than a CRM. The important pieces are:

* `src/engine/compiler.ts`, `brain.ts`, `honesty.ts`, `memory.ts`, `relstate.ts`, the agent registry and generated server bundle form a deterministic prompt/runtime boundary. The compiler separates stable core from bounded tail state and tracks prompt budgets. The honesty path parses and gates model output rather than merely asking the model to be honest.
* `api/memory.js`, `api/consolidate.js`, `api/episodes.js`, `api/search.js` and the migrations implement conversation logs, graph memory, episodic summaries, facts/nodes/edges, semantic retrieval, citations, consolidation and forget flows. Memory is device/person/agent scoped rather than a single global chat transcript.
* `src/engine/relstate.ts` is a useful “emotion-aware” kernel even though it is not called EmotionalOS. It has typed `honorific`, `trust`, `rupture`, `repair` and `code_switch` dimensions; asymmetric hysteresis (slow earned familiarity, immediate regression on rupture); trust delta rate limiting; coarse rendering to avoid leaking internal numeric state; and deterministic replay from cited events. `api/consolidate.js` mirrors the pure logic at the server boundary and explicitly requires the other person’s repair signal rather than inferring repair from the assistant’s own words.
* `api/_disclosure.js` uses a SQL predicate for retrieval/disclosure boundaries. The code comments and `docs/RELATIONALOS.md` record the measured rationale: model instructions leaked sensitive facts far more often than a predicate. Room and surface reads are required to pass this predicate before ranking or response generation.
* `api/_surface.js`, `api/_room.js`, Telegram/Discord/WhatsApp adapters and surface identity tables are the beginning of a multichannel customer relationship layer. A surface may render or transport a response, but it may not weaken OS guarantees.
* `api/speech.js`, `src/voice/speech.ts`, `src/voice/liveCall.ts` and `src/voice/spokenText.ts` provide expressive TTS/realtime call lanes, speech-text sanitization, disclosure/crisis handling, voice selection and latency instrumentation. The source explicitly says realtime voice has no post-generation output gate, so live voice remains asymmetric with text.

The emotional behavior is partly structural and partly prompt/model-dependent. Affect tags and episodes are extracted by a model and then constrained by typed acceptance/state machinery. The compiled persona also contains extensive behavioral instructions (“match their emotional temperature,” voice cues, repair behavior), which are useful product knowledge but remain vulnerable to model drift and provider changes. The repository’s own research reports that emotional-heavy turns lag ordinary conversation in some model lanes; this is a reason to preserve the typed relationship state and add CRM-specific outcome evals rather than treating a mood classifier as the product.

What is missing for a SaaS brain/CRM product is explicit organization tenancy, contact/account/opportunity schemas, action authorization, operator queues, owner/team roles, consent for customer recordings, retention policy by organization, field-level audit, lead-source attribution, sales stage transitions, activity-to-revenue joins and enterprise export/retention controls. Main is a strong interpersonal kernel, not the business system around it.

## `voice-cloning`: the strongest reusable voice and safety architecture

Tip: `a7bdcaa4879698fab941d1ac19b0ca9a9099dc4c` (`voice-cloning`). Its substantive delta from main is the large Replica platform: API modules, migrations 015–050, provider-neutral voice/identity/provenance contracts, services, Studio enrollment/review surfaces and offline evaluation suites.

### Control plane and consent

`api/_replica-consent.js` defines account scopes (`capture`, `transcription`, `storage`), verified-model scopes (`training`, `inference`) and additional biometric/sharing/telephony/model-improvement scopes. It canonicalizes consent receipts with policy/version/nonce and SHA-256 hashes. Account attestations require self, adult, source rights and synthetic-disclosure understanding. Verified model consent requires a live-challenge basis, identity/age/liveness prerequisites and a complete statement set.

This is reusable as an organizational consent service, but the current policy is explicitly self-replica-only. A customer-support deployment needs distinct subject roles (agent, customer, bystander, employee), call-party consent, jurisdiction, recording purpose and retention; simply widening `subject_mode` would be unsafe.

### Identity and liveness

Identity evidence is designed to retain content-free scores/digests rather than identity documents in the application response. Identity and liveness providers are behind registries; their outputs are bound to verifier/version/input hashes and fail closed on malformed or mismatched evidence. The runtime requires adult tier, identity/liveness evidence, self account binding, live inference consent and non-expired evidence.

This is a good foundation for high-risk voice activation. It is not a completed anti-spoof system: `docs/REPLICA-PROCESSING.md` and `docs/REPLICA-LIVENESS.md` leave live replay/deepfake tests, a liveness-bound target-speaker anchor, overlap detection and independent verifier qualification as production work.

### Quarantined evidence processing

The processing DAG is explicit: integrity → malware scan → media probe → diarize → separate → enhance → transcribe → voice quality. Artifacts are create-only, source objects are immutable, paths are server-derived, all rows carry owner/replica/source/job/adapter/digest lineage, and composite ownership checks prevent cross-tenant joins. Leases are expiring and retry backoff is deterministic. Billing is reserved before paid provider calls and ambiguous provider outcomes are not automatically retried.

This is directly reusable for customer call ingestion, provided the data classification and consent scope become organization/customer-aware. Text/doc/image/third-party processing is intentionally blocked or routed until its own reviewed DAG exists. The docs explicitly say the Azure adapter has only mocked HTTP coverage at this branch point, and fake providers are structural fixtures, not quality evidence.

### Person Model, VoiceGenome and runtime capability

The Person Model stores owner-reviewed claims with exact evidence citations, statuses and deterministic profile rendering. The VoiceGenome keeps source/transform lineage, multiple embedding families, acoustic/prosodic/language distributions, code-switch observations, paralinguistic events, quality exclusions and calibration results. Provider voice handles stay server-side; clients submit only opaque replica/session identifiers. `api/_replica-runtime.js` activates one immutable capability binding exact profile/calibration/genome/voice-provider versions and qualification-suite commitments.

This “capability, not latest” rule is the best reusable boundary for a multi-tenant agent platform. It prevents a conversation from changing behavior halfway through a session and makes rollback/audit possible. The current qualification suites (`identity_fidelity`, `noisy_robustness`, `behavior`, `relationship`, `privacy`, `abuse`, `provenance`) are a strong starting taxonomy, but customer/sales deployments need task success, factuality, tool authorization, escalation, consent and business-policy suites.

### Provenance and output protection

The provenance path is designed to emit spoken disclosure, PerTh watermark, AudioSeal/C2PA-style artifacts, segment ledger rows and signed receipts. It is deliberately honest that no production watermark model, signing key, public verifier or live replica synthesis was connected at the `voice-cloning` tip. The protection adapter boundary is still valuable: generation authorization, segment ledger, disclosure and watermarking should remain one gate and be impossible for a client-selected provider to bypass.

### Dialogue and deletion

Replica dialogue is owner-only private self-conversation at this stage. It resolves a server-side capability, uses version-bound prompt compilation, binds text/TTS to the same capability and records owner feedback. Full erasure, source erasure, provider consent revocation and retention state are first-class APIs/migrations. The docs state that raw logs inherit operational database security and still require application-layer envelope encryption for a biometric/memory vault.

The deletion architecture is an asset: CRM systems need “delete this contact/customer and all derived voice/profile/memory artifacts” with a receipt, not a best-effort row delete. The missing enterprise layer is data inventory, legal hold, retention exceptions, processor deletion confirmations and tenant-level export proofs.

## Gurukul workstreams: branch-by-branch unique additions

The `gurukul-ws-*` refs are largely sibling worktrees built on a common Meera/Replica baseline and later merged into `claude/gurukul-platform`. Their repeated files (`context/STATE.md`, `context/decisions.md`, `context/measurements.md`, `context/rejected.md`, `context/graph.json`) are not independent product features; they are evidence/decision ledgers. The meaningful unique additions are below.

| Branch | Unique substantive delta | Evidence and maturity | SaaS reuse |
|---|---|---|---|
| `gurukul-ws-v` (`68054494cc9ff02e1cf59d3e9da4c04e415f86cd`) | Earbench/first-clone checks and listening-page failure handling. | Structural evaluation; useful because it refuses a successful synthesis response as proof that the owner heard usable audio. | Audio QA harness and “heard by user” completion evidence. |
| `gurukul-ws-w` (`4328281a6be941ac8dad6691d4242dd9ef50ea3e`) | Private “Preview my voice” API/UI, warmup registry, GPU admission health probe, explicit 202 `warming` state, retry UI and protected clip response. | Provider path includes disclosure and watermark; cold start measured as minutes and treated as a state. The UI is real code, but branch notes distinguish synthetic/mock checks from a browser/live proof. | Any expensive voice agent needs warm/cold/retrying states, bounded spend and no fake progress. |
| `gurukul-ws-x` (`a35327ab9c7aa4e80f371e4d0156ea7b61cc76f3`) | Mirror Call backend: owner-only sessions, source windows, speaker admission, conditioning-window selection, delta mining, budget, citations, review queue and SQL approval. | Strong offline state/eval contracts. Voice-loop similarity and training remain gated by consent and real evidence; the branch does not claim mid-call training. | Human-in-the-loop customer-agent calibration and feedback capture, with every change proposed and approved. |
| `gurukul-ws-y` (`b9966ca2b76efc0f7dddd8bb275e24150566a6ea`) | Mirror Call Studio tab, call capture, WAV capture, state machine and owner approval UX. | Product surface is substantial; inherited migration/live deployment status still controls whether requests work. | “Teach this agent” customer/agent correction workspace. |
| `gurukul-ws-z` (`3a80f20e69cca6122a85f658a2ac79c6e50901b0`) | Research sweep on online voice/persona learning. | Valuable research, not implementation. It finds Chatterbox conditioning truncation (~10s S3Gen/~6s T3), warns that accumulated embeddings can grow while next-turn synthesis cannot improve, rejects unattended self-critique and demands held-out/regression controls. | Prevent false learning dashboards; separate corpus coverage from current output quality. |
| `gurukul-ws-aa` (`03179bc6dac8698e2344151b66fe9532820da3e0`) | Feed/Meet/Deploy product journey, design tokens, landing and studio authentication shell. | UI/spec work; no claim of backend maturity. | Creator/admin onboarding and “one next action” setup flow. |
| `gurukul-ws-ab` (`1a254d3dff3585ecc68b2e8bd67f6bfa7b38cd5f`) | Context Locker for txt/md/pdf/docx/WhatsApp exports/links; SHA-256 content identity, quotas, extraction/refusal/routing, speaker attribution and cited proposals. | Strong data provenance and SSRF/PII controls. WhatsApp mining requires owner-speaker declaration and third-party acknowledgement. Articles never become style evidence. | Customer archive/context ingestion with provenance and review; immediately useful for sales/customer knowledge bases. |
| `gurukul-ws-ac` (`91bc4c78b45c0f73eb7db242bb40d7c5c38ad053`) | Mirror Call reply lane: ASR → relationship/agent compiler → TTS, turn persistence, `spoken/warming/refused` states and failure codes. | Reuses existing generation/protection path rather than forking it. Migration 060 and live SQL application are separate deployment prerequisites. | Controlled voice replies with auditable generation state and refusal semantics. |
| `gurukul-ws-ah` (`da5897a8ac883f03713c99175dc069866ffb722b`) | Enrollment processing sweep, capability codes, native tools, queue draining and activity surface. | Moves from “worker exists” toward a caller/cron. Later state notes identify prior dead-writer/commit visibility defects. | Worker orchestration, resumable jobs and operator activity. |
| `gurukul-ws-ai` (`fcc2a38e46cc3fd4f9b1a1485f2881e7f51c232d`) | YouTube/channel extraction route, env-selected extractor, route classification and media-extract service. | Real deployment notes say enumerate worked but extraction hit bot checks on all tested yt-dlp clients; cookies/proxy remained owner decisions. | Ingest customer/creator public channels, but retain route/refusal and legal posture. |
| `gurukul-ws-aj` (`98efb8deb873b6f91c89d3195ad114a089dead11`) | Honesty split types, blocker classifications, mobile layout and Wizard state model. | Offline/browser layout gate additions. This branch is UX hardening, not model evidence. | Reliable admin UX for “waiting on customer” versus “waiting on platform.” |
| `gurukul-ws-ak` (`5fdeaa4dc553faf70ffd75da1e41084cf5622fd5`) | Evidence-service wake-before-sign change and production HMAC/cold-start diagnostics. | Live notes record cold diarization returning 401 `transport_signature_invalid`, warm authentication in ~20s, identical secret digests. Exposes readiness/auth coupling. | Provider admission should warm/probe before signed expensive calls and distinguish auth from readiness. |
| `gurukul-ws-al` (`c28f0f31249d198af5f6ab64dd505ef21adce52e`) | Audio-protection service deployment/bake models, Bicep and production gate. | Deployment/plumbing proven; docs explicitly say synthetic buzz-tone proves pipeline only, not human voice quality; external Vercel reachability and Key Vault were open. | Protect customer audio with separate non-root service, but require real watermark survival tests and secrets architecture. |
| `gurukul-ws-am` (`f3fceac28bd9f3cf650c32c492e26a27d622fbcc`) | Studio layout fixtures, mobile CSS and layout readability checks. | Browser/layout gate; no voice or CRM behavior. | Admin reliability and accessibility/performance regression surface. |
| `gurukul-ws-an` (`a9149e82df9928ca986a4b761adfafd912e27e29`) | Sarvam ASR adapter replacing Azure Speech in processing worker, env/infra changes. | Contract and offline coverage; ASR quality, billing and production account state remain deployment-dependent. | Regional/language ASR adapter with provider-neutral contract. |
| `gurukul-ws-ao` (`f444d3282c43a431a415677ddf90dc1f12c9ee3d`) | Reference-window selection from owner’s diarized speech, native processing helpers and worker wiring. | Strong integrity fix. Later state records the original 8 kHz bytes labeled 24 kHz and the measured correction; similarity remains unproven. | Select customer voice evidence by quality/identity rather than blindly using the full upload. |
| `gurukul-ws-ap` (`32815cedcc1ec7d7774c5e7d24e44216dc85e6c2`) | “One honest next action” activity/studio model, runtime blockers, layout and voice/context panel polish. | State machine and offline eval; inherited deployments/migrations determine reachability. | Operator queue and customer-facing action guidance. |
| `gurukul-ws-aq` (`65f36fece24b8636ee9267e8a91d3cd6902523f8`) | Explicit `REPLICA_SELF_TEST_MODE`, internal-only identity/liveness bypass, metadata-tagged grants and revocation script. | Useful for controlled internal tests, high-risk if leaked. `AGENTS.md` says grants must be revoked before non-owner use. Never carry this mode into production customer paths. | Test harness only; production should use synthetic fixtures or real consented users with a separate tenant and kill switch. |
| `gurukul-ws-ar` (`235c18553e7a41e40637753679acec2cee03273b`) | Context/measurement record of enrollment sample-rate defect and fix. | It documents the defect/fix and end-to-end evidence rather than changing code in its tip. | Data-quality incident pattern; preserve measured input/output format checks. |
| `gurukul-ws-as` (`298c15992ee3ec50661daca1c76bd4dc66597bad`) | Skip 16kHz SepFormer when diarization shows one dominant speaker; select correct reference bandwidth and add release check. | Concrete sample-rate/quality protection; still not an identity or perceptual-quality result. | Avoid destructive “enhancement” when a single-speaker source is already usable. |

`claude/gurukul-platform` (`771feef9c124184a56abaea662bc16a079069ee1`) merges these Gurukul slices and adds a final voice-experiment/matched-text pack and `openvoice-converter` service. It is the best consolidated inspection point for the Gurukul feature graph. Its own context says the owner clone still does not sound like the owner, and that the reference-bandwidth correction had not yet been rebuilt into the processing job at the cited checkpoint.

## Claims versus implementation evidence

| Claim or capability | What the code actually provides | Evidence level | Boundary/gap |
|---|---|---|---|
| “Emotion-aware agent” | Affect-tagged episodes, mood/tone guidance, trust/rupture/repair state, relationship retrieval and disclosure restrictions | Mixed: typed/pure state is strong; extraction/model behavior is evaluated but provider-dependent | No named EmotionalOS package, no calibrated emotion ground truth, no explicit customer-outcome metric, no policy for inferring sensitive traits |
| “Remembers customers” | Graph/episodic memory, citations, per-agent/person scoping, consolidation and forget paths | Structural plus live measurements in some main contexts; DB checks are environment-dependent | Needs org/contact/account schema, retention/consent, field-level audit, export/legal hold and team access |
| “Voice clone” | Quarantined source processing, VoiceGenome/Person Model drafts, provider contracts, runtime capability, preview/reply surfaces | Plumbing and structural suites; selected live synth/RTF evidence in later context | Human similarity/ABX, held-out identity/accent/prosody, anti-spoof, noisy strata and end-to-end browser delivery remain incomplete or narrow |
| “Low-latency voice agent” | Main realtime lane, streaming TTS, warm/cold states, measured first-audio floors and provider cascade logic | Main contains measured live latency; private Replica lanes have explicit warmup and some live service measurements | Replica dialogue/protection remains deployment- and migration-gated; no stable SLA, regional routing, interruption quality or customer-call benchmark |
| “Learns from a call” | Mirror Call records owner-only windows, selects conditioning, mines cited deltas, budgets proposals and requires explicit accept/reject | Strong offline state/eval and research rationale | It does not train live model weights; reference selection may improve conditioning but fidelity meter cannot be treated as likeness; live migration/consent gates matter |
| “Ingests company/customer context” | Context Locker handles files/links/WhatsApp with hashing, quotas, extraction, refusal/routing and cited proposals | Strong structural evidence | No CRM object mapping, connectors/permissions beyond source lanes, chunk retrieval policy by customer/team, or enterprise DLP/encryption |
| “Safe synthetic media” | Consent receipts, owner-only capability, spoken disclosure, PerTh/watermark/C2PA interfaces, provenance ledger, erasure contracts | Architectural contracts and offline boundary tests; production protection is explicitly partial | Watermark/manifest public verification, key management/HSM, codec survival, disclosure red-team, real provider deployment and processor deletion proof |
| “Production-ready platform” | Many release gates, migrations, CI/verification conventions, queue/lease/billing controls | High engineering maturity in contracts and failure analysis | Branches repeatedly document unapplied migrations, skipped live SQL, stale deployment, cold-start auth coupling, missing credentials and unmeasured quality |

## Latency, evaluation and operational findings

Main’s context/measurement ledgers contain useful live numbers, but they belong to the exact date/provider/route that produced them. Examples recorded in the branch history include:

* text turns with no VAD wait around 720 ms in a controlled main-lane measurement;
* streamed free TTS first frames around 615–1051 ms for healthy keys and materially slower paid fallback;
* main realtime first-audio and barge-in measurements that led the project to retain the incumbent lane;
* private open-voice warm synthesis around 0.79 RTF in a warm GPU measurement, while cold starts can take minutes;
* an audio-evidence service cold-start/HMAC interaction where signing before readiness produced a 401, while a warm path authenticated in about 20 seconds;
* owner voice experiments where reference-window choice moved ECAPA proxy scores substantially more than a small fine-tune delta, but the repository warns that these are not human similarity scores;
* one live owner 71-second sample used for a zero-shot/LoRA smoke test, explicitly below a 30-minute recommendation and without held-out/ABX evidence.

The best evaluation patterns to reuse are:

* exact-text matched packs and blinded candidate selection;
* held-out prompts/text and separate calibration versus qualification;
* explicit sham/negative controls for disclosure, cross-tenant leakage, unapproved deltas, clone-turn contamination and fake providers;
* byte/hash commitments for source sets, manifests, prompt packs and generated artifacts;
* p50/p95 time-to-first-audio, RTF, WER/CER/MER, artifacts, identity drift, interruption and cost as separate axes;
* a release gate that fails if a claimed source/evidence/migration/worker is not reachable.

The biggest operational risk is not missing code; it is divergence between branch state, deployed state and live database. Several notes call out a route that looked complete but had no caller, an SQL data-modifying CTE that could not see its own writes, a migration absent from the active database, a provider endpoint unreachable from Vercel, and a cold runtime returning an auth error. A SaaS build should make deployment/readback/route probes part of the product readiness state and should store the exact capability/deployment/schema revision used by each conversation.

## Consent, privacy and security gaps to carry into a SaaS design

The existing control plane is unusually careful, but its scope is still “verified adult self replica.” For a sales/customer platform, the following changes are mandatory rather than optional extensions:

1. Model organization, workspace, user, agent, contact/customer, participant and bystander separately. A customer’s voice or transcript cannot be treated as the employee owner’s evidence merely because the employee initiated a call.
2. Make call-recording, transcription, biometric processing, voice synthesis, model improvement, outbound calling and human review separate purpose scopes with jurisdiction/expiry. Persist who consented, how, when, under which notice and what processor received data.
3. Keep raw recordings, transcripts, embeddings, derived claims and behavioral profiles in separate retention/encryption domains. The current docs say application-layer envelope encryption is still required for a production biometric/memory vault.
4. Add organization-level row policies and operator roles. The existing owner predicate is a good primitive but cannot by itself express team delegation, support access, legal hold or break-glass access with audit.
5. Do not infer sensitive emotion/personality traits as durable customer facts without explicit policy and correction. The main affect tags are useful for response adaptation, but a CRM should distinguish transient call affect, customer-declared preference, model hypothesis and approved account fact.
6. Require review/approval before profile, customer-facing policy, sales commitment, pricing, refund, credit, cancellation, OTP/payment or regulated advice actions. The Mirror Call approval pattern should generalize to tool/action plans.
7. Carry disclosure and provenance through every outbound channel. Main’s text gate and Replica’s planned spoken/watermark path do not automatically protect SMS, WhatsApp templates, call transfers, recordings, exported clips or human handoff summaries.
8. Treat self-test and fake-provider modes as isolated build/test tenants with an enforced expiry and kill switch. The `gurukul-ws-aq` mode is specifically the kind of bypass that must never share production credentials.
9. Add processor/subprocessor deletion confirmations, backup expiry, export manifests, legal-hold state and a public/customer-facing audit receipt. The existing source/full-erasure paths are a strong start but do not state all enterprise obligations.

## Recommended reusable architecture for a brain + CRM + voice-agent company

Reuse the repository in layers:

* **Brain/RelationalOS kernel:** agent registry, deterministic compiler, memory graph/episodes, typed relationship state, disclosure predicates, citations, forget and surface adapters.
* **CRM domain layer to add:** organization/workspace, account/contact, opportunity/case, activities, participants, ownership/assignment, stages, tasks, entitlements, tool/action policies and revenue/outcome links. Keep this layer separate from the person’s private relationship memory.
* **Voice/evidence plane:** source quarantine, consent receipts, processing DAG, artifact lineage, provider registry, runtime capability and provenance/protection gates. Add customer/bystander consent and jurisdiction to the existing self-replica policy.
* **Learning/calibration plane:** Context Locker, Mirror Call, candidate/eval/feedback datasets, blinded tests, held-out corpora and explicit human approval. Treat every learned item as a cited proposal until accepted.
* **Runtime plane:** one immutable capability per session; capability binds prompt/persona/relationship/voice/tool permissions and deployment/schema revisions. No client provider IDs or “latest” lookups.
* **Operations plane:** queue leases, budgets, warmup/readiness probes, deployment/schema readback, live route probes, model/provider health, cost and latency telemetry, incident state and erasure workflows.

The initial product wedge should be a human-approved, multilingual customer/lead agent with excellent context/provenance and relationship continuity. Voice can begin as disclosed, owner/customer-consented private call assistance, call summaries, retrieval and follow-up drafting. Outbound sales commitments, automatic stage changes and model improvement should require explicit policy/evaluation gates. Full self-voice replication and emotion-aware autonomous selling should be later capability tiers, activated only after the missing quality, consent, abuse, latency and deletion evidence exists.

## Branch coverage limits and disposition

All 31 refs were enumerated with full SHA and tip paths in the companion JSON. Main, `voice-cloning`, all 20 `gurukul-ws-*` refs, and the merged `claude/gurukul-platform` were deeply read at the architecture/code/documentation level described above. The `claude/ai-companion-app` branch was sampled as a Meera/RelationalOS context continuation. The nine later Claude/Codex targets have a selected-module supplement in [voice-branch-supplement.md](./voice-branch-supplement.md), including private-voice, Rooms/commercialization, processing/canary, synthetic voice-comparison and handoff deltas. Neither report claims line-by-line reading of every file in this large history. Shared blobs and merged ancestry were deduplicated by Git history and content role rather than re-read as independent implementations.

The branch tips are not all mutually exclusive products. `claude/gurukul-platform` contains the merged Gurukul workstreams; `claude/vyakti-cloning-platform-aq05n4` and `codex/vyakti-completion` contain much later unified Vyakti/Rooms evolution; handoff branches preserve subsets or operational checkpoints. Use the exact SHA ledger when deciding which implementation state to lift, and require a live deployment/schema probe before treating any branch claim as shipped behavior.
