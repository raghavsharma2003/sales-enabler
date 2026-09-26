# Reuse provenance: Maya, Meera, RelationalOS and voice

## Second-pass correction and branch selection

The first inventory understated the implemented companion runtime. The [second-pass caller-to-playback trace](../research/html-second-pass.md) and [31-head capability ledger](../research/html-capability-coverage.json) supplement and take precedence over broad maturity descriptions below. All tips were refreshed and compared; shared inherited code is deduplicated rather than described as new implementation on every branch. Source code and stored measurements are evidence, not a fresh runtime evaluation.

| Proposed product layer | Strongest relevant source lane | What to extract or adapt after product approval |
|---|---|---|
| Relational browser conversation | `html-portfolio`, `claude/ai-companion-app-rkt1lv` at `f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21` | Trace `useCallEngine` → memory recall → `compiler.compile` → relational/persona bundle → `liveCall` or cascade speech. Preserve exclusive audio ownership, interruption/reconnect behaviour and source-aware context; replace the companion identity and dyadic account assumptions. |
| Hinglish and speech delivery | Companion lane plus `claude/gurukul-platform` at `771feef9c124184a56abaea662bc16a079069ee1` | Separate language/register policy, pronunciation/text frontend, synthesis selection and audio playback. Reuse the evaluation methodology; rerun on real business names, numbers, accents and the chosen providers. |
| Source-backed memory correction | `claude/vyakti-cloning-platform-aq05n4` at `6d7d9bcd4f9c4c793e8db34b70ac03d874fe8d4a` | Experience compiler, accepted decisions, source/span/citation checks, owner/room authority and correction/erasure contracts. This branch's runtime/live SQL validation remains pending. |
| Optional authorized replica and calibration | Gurukul studio plus specific `gurukul-ws-*` slices below | Enrollment, source/consent lineage, Mirror Call, provider adapters, preview/readiness and evaluation harnesses. Preserve optionality; a source adapter is not proof of live voice quality. |
| Company brain and group coordination | `Vyakti-GroupAI`, `codex/relational-core` at `4bae159631ca3f18da0ede48596f593a55b6728c` | Evidence scope, context capsules, privacy boundaries, delivery ledger and coordination contracts. Adapt to company membership, customer cases, team tasks and business actions. |
| Sales command centre | `command_centre`, main plus hardening branch documented below | Import reconciliation, personal previews, campaign queues, replies, suppression, health, journeys and owner tasks. Rebuild the tenant/auth boundary and unify action execution. |
| New product work | `sales-enabler` | Founder onboarding, common campaign model across sales and feedback, cross-company configuration, feedback-to-improvement loop, shared API/automation entry points and grounded company summaries. These are not established by the source apps. |

The earlier product concept demonstrated these behaviours using fictional local state. **No source branch has been wholesale-merged into this SaaS.** Since implementation resumed, reviewed selective adaptations of the Maya voice frontend, the relational runtime and the GroupAI room-turn boundary are integrated locally; their current evidence and limits are recorded below.

## Current selective ports and live evidence

- **Maya voice source port:** The pinned upstream port uses Gemini Live 3.1 with the source project's Despina preset. Maya's explicitly selected original profile was active through a privately recovered free-pool path that produced one real synthetic Live response (236162 PCM bytes, 4.92 seconds) and a separate TTS render (193920 bytes, 4.04 seconds). `MAYA_GOOGLE_ACTIVE_LABELS` is the selected verified label. The latest bounded Listen & type browser call ran for 107 seconds across five entries, followed a feedback brief and returned Hinglish responses. Earlier browser evidence exposed opening/brief quality follow-up; no broad voice-quality claim follows. Azure Realtime remains the default and only paid inference path.
- **Relational runtime:** The source-derived runtime is integrated into the live call path and saved by the server. Repair hysteresis, language, honorific, pacing and quoted-evidence handling are carried through bounded state and instructions. Browser inspection observed `open` → `repairing` → `repaired` across distinct confirmations, and saved preview Conversations confirm four server-recomputed state changes including Hinglish and repaired state. It remains a business adaptation, not a transplant of the companion identity or full companion runtime.
- **GroupAI room turn:** A browser check produced a real Azure reply using permitted fictional memory. The path is an internal operator simulation; it does not verify participant identity and does not deliver to an external chat channel.
- **Azure Personal Voice:** Consent/profile APIs and a bounded preview are implemented. East US 2 is privately verified; the configured key can reach project creation and the Personal Voices route, while the catalog route returns 403. No consent recording, target sample, clone or `cloneVoiceLive` adapter has been completed.
- **Verification boundary:** Final verification reports 105 tests passed with 0 failures, build and typecheck passed, and the production server renders Agents. Responsive checks at 1280, 611 and 390 pixels show no horizontal overflow. Fresh visual review remains pending, so these checks do not support a ship or competitor-superiority conclusion.

The original audit date was 21 September 2026. That historical audit is a
read-only provenance map for product alignment; the current selective-port
addendum above records later implementation evidence. The source repository is the `html-portfolio` clone at
`research-sources/html-portfolio`. At that historical audit point, no application
code, provider, database, test, or build was executed. The complete 31-tip SHA ledger is in
[`voice-relational-audit-branches.json`](../research/voice-relational-audit-branches.json);
the later Claude/Codex source review is in
[`voice-branch-supplement.md`](../research/voice-branch-supplement.md).

## What Maya and Meera mean in the tree

The user-facing product identity is **Maya**; the stable internal agent and
database identity is **Meera**. This is an explicit rename seam, not two
independent personalities:

| Evidence | Branch tip SHA | Exact path and blob | What it proves |
|---|---|---|---|
| Extracted character sheet | `main` `3a9217981b27636745fc70ac490aacf9ef3f392d` | `src/engine/agents/characters/maya.ts`, blob `af23a0abbeeee47b0876bdf0789e9ef3eb2b5b3c` | `MAYA` has `name: "Maya"`, but `slug: "meera"` and `version: "meera-1"`; the file says the sheet is the person while the Relational Core is the behavior. |
| Stable adapter and registry | same | `src/engine/agents/meera.ts`, blob `e27d8c70ff5b9c85ca76a916493ee818888f0637`; `src/engine/agents/registry.ts`, blob `59fa50556659987f68ed64b84d2350e974d7552e` | `meera.ts` re-exports the shared prompt builders; the registry maps `meera` to a fixed `MEERA_AGENT_ID`. |
| Shared behavior | same | `src/engine/persona.ts`, blob `ec7116ba7f14a9b827e8ba56d20e1e1df749d436` | Prompt, crisis, speech-style, disclosure and interaction rules are shared behavior parameterized by `MAYA`, rather than a second Meera prompt. |
| Named relationship layer | same | `docs/RELATIONALOS.md`, blob `239aa0fcf8ca9634b11e544bce3c58a787081f43`; `src/engine/relstate.ts`, blob `e176a1ade2fcf00833b9f10c042ee9f57572f67c` | The repository explicitly separates reusable relationship state from personality and surface. |

Two replica-oriented branch trees do not contain the extracted character
paths: `claude/vyakti-cloning-platform-aq05n4` (`6d7d9bcd4f9c4c793e8db34b70ac03d874fe8d4a`)
and `codex/private-voice-requests25`
(`f02469564fb10a082bf34a94ff8619626f683879`) have `src/engine/persona.ts`
only. That older persona is explicitly a caller-supplied shared builder and
uses Meera in its database/agent comments; it is not evidence of a separate
Maya implementation. Their trees do contain `docs/RELATIONALOS.md`,
`api/_relational-core.js`, and Meera-scoped voice/room infrastructure.

The all-ref Maya path check produced these dispositions. Identical blobs are
grouped to make the provenance legible; every named remote tip was checked.

| Tree group | Remote refs (all refs in group) | Tip SHA(s) and Maya result |
|---|---|---|
| Current split | `main`; `voice-cloning` | `main` `3a9217981b27636745fc70ac490aacf9ef3f392d`; `voice-cloning` `a7bdcaa4879698fab941d1ac19b0ca9a9099dc4c`. Both have the `maya.ts`/`meera.ts` paths and the `af23…`/`e27d…` blobs above. |
| Same split, companion tip | `claude/ai-companion-app-rkt1lv` | `f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21`; same paths, with `maya.ts` blob `fadf88cedf27f5903604a882541cb12a621603b5`, `meera.ts` `e27d8c70ff5b9c85ca76a916493ee818888f0637`. |
| Same split, Gurukul/hand-off family | `claude/gurukul-platform`; `codex/handoff-history-20260909`; `codex/handoff-processing204`; `codex/handoff-voice-comparison106`; `codex/handoff206`; `codex/vyakti-completion`; `gurukul-ws-v`; `gurukul-ws-w`; `gurukul-ws-x`; `gurukul-ws-y`; `gurukul-ws-z`; `gurukul-ws-aa`; `gurukul-ws-ab`; `gurukul-ws-ac`; `gurukul-ws-ah`; `gurukul-ws-ai`; `gurukul-ws-aj`; `gurukul-ws-ak`; `gurukul-ws-al`; `gurukul-ws-am`; `gurukul-ws-an`; `gurukul-ws-ao`; `gurukul-ws-ap`; `gurukul-ws-aq`; `gurukul-ws-ar`; `gurukul-ws-as` | All retain `maya.ts` blob `fadf88cedf27f5903604a882541cb12a621603b5` and `meera.ts` blob `e27d8c70ff5b9c85ca76a916493ee818888f0637`. Their full tip SHAs are in the linked JSON ledger; representative tips: Gurukul `771feef9c124184a56abaea662bc16a079069ee1`, Mirror Call `a35327ab9c7aa4e80f371e4d0156ea7b61cc76f3`, Context Locker `1a254d3dff3585ecc68b2e8bd67f6bfa7b38cd5f`, reply lane `91bc4c78b45c0f73eb7db242bb40d7c5c38ad053`. |
| Persona-only trees | `claude/vyakti-cloning-platform-aq05n4`; `codex/private-voice-requests25` | Tips `6d7d9bcd4f9c4c793e8db34b70ac03d874fe8d4a` and `f02469564fb10a082bf34a94ff8619626f683879`; no `src/engine/agents/characters/maya.ts` or `src/engine/agents/meera.ts`. |

Therefore the strongest reusable material is the parameterized relationship,
memory, disclosure and voice control plane. Copying Maya's personal sheet or
her Hinglish examples into a B2B agent would be a product and data-boundary
mistake; use a new tenant/persona sheet against the shared contracts.

## Proposed selective reuse map

These entries mix selective adaptations that are now integrated with candidates
for future extraction or reimplementation. The current status is stated in the
selective-port addendum above; no source branch is treated as a drop-in import.

| Capability | Project / branch / tip SHA | Exact source paths | Existing mechanism | Adaptation for company brain + CRM + voice | Limits and maturity |
|---|---|---|---|---|---|
| RelationalOS state | html-portfolio / `main` / `3a9217981b27636745fc70ac490aacf9ef3f392d` | `src/engine/relstate.ts`; `docs/RELATIONALOS.md` | Typed `honorific`, `trust`, `rupture`, `repair`, `code_switch` dimensions; hysteresis, rate limits, deterministic replay and surface-independent boundary. | Make dimensions tenant/case/participant scoped; store observations and review state; expose only policy-approved interaction guidance to the agent. | Valuable kernel, but no B2B org membership, CRM case model or proof that inferred emotion is true. |
| Evidence-grounded memory and disclosure | same | `api/memory.js`; `api/_disclosure.js`; `api/consolidate.js`; `api/_surface.js` | Person/agent scoped retrieval, episodes, citations, forget, disclosure predicates, negative-affect safeguards, and affect consolidation with non-model-only acceptance. | Map to organization, account/contact/case, source event, audience and retention policy. Keep customer-stated facts separate from hypotheses and internal notes. | Existing schema is companion-oriented and needs tenant authorization, lifecycle enforcement, retention and subject access/deletion review. |
| Meera/Maya persona seam | same | `src/engine/agents/characters/maya.ts`; `src/engine/agents/meera.ts`; `src/engine/persona.ts` | A leaf character sheet feeds shared builders; stable internal slug/id survives a display rename; persona invariants were authored around byte identity. | Create tenant-configurable agent sheets and a typed voice/style contract. Keep business policies and action permissions outside prose. | Maya's identity, examples and crisis text are not reusable customer data. No generic sales CRM behavior is present. |
| Browser/live voice | html-portfolio / `main` / `3a9217981b27636745fc70ac490aacf9ef3f392d` | `src/voice/liveCall.ts`; `src/voice/speech.ts`; `src/voice/spokenText.ts`; `api/speech.js` | PCM capture, websocket streaming, callbacks, barge-in/playback interruption, TTS, spoken-text sanitization and explicit disclosure/voice headers. | Bind a live turn to authenticated tenant, contact, case and action scope; add reconnect resume, human transfer, quiet hours, opt-out and server-authoritative tool proposals. | No end-to-end commercial telephony proof; socket rotation needs context resume; latency, language quality and provider costs need device/field evaluation. |
| Voice replica consent/evidence | html-portfolio / `voice-cloning` / `a7bdcaa4879698fab941d1ac19b0ca9a9099dc4c` | `api/_replica-consent.js`; `api/_replica-source.js`; `api/_replica-provenance.js`; `api/_replica-full-erasure.js`; `api/_replica-processing/*`; `db/migrations/015_replica_core.sql`–`050_replica_voice_delivery_holdout.sql`; `docs/SPEC-REPLICA-PLATFORM.md` | Owner-scoped consent, source/artifact/evidence lineage, review and activation states, provider budgets, frozen activation and erasure. | Treat employee/brand voice as an optional capability with explicit speaker authorization, customer disclosure and revocation. Reuse contracts, not a raw clone pipeline. | Offline/control-plane maturity exceeds demonstrated voice likeness. No production watermark/HSM, complete liveness anchor, human ABX result or provider deployment is established. |
| Consent-bound Mirror Call learning | html-portfolio / `gurukul-ws-x` / `a35327ab9c7aa4e80f371e4d0156ea7b61cc76f3`; reply lane `gurukul-ws-ac` / `91bc4c78b45c0f73eb7db242bb40d7c5c38ad053` | `api/_mirrorcall.js`; `api/_mirrorcall-store.js`; `api/_mirrorcall-wire.js`; `api/mirror-call.js`; `api/_mirrorcall-reply.js`; `db/migrations/058_mirror_call.sql`; `db/migrations/060_mirror_call_turn.sql` | Owner-only consented sessions, source windows, speaker admission, conditioning selection, delta mining and explicit `spoken/warming/refused` reply states. | Use for supervised agent calibration and human-approved account/case playbooks; represent changes as reviewable proposals. | Personal-owner semantics do not establish customer/employee consent, quality, or safe autonomous learning. |
| Context Locker ingestion | html-portfolio / `gurukul-ws-ab` / `1a254d3dff3585ecc68b2e8bd67f6bfa7b38cd5f` | `api/_context-locker.js`; `api/_context-mining.js`; `api/context-items.js`; `db/migrations/058_context_locker.sql` | Hashing, quotas, ownership, provenance, speaker attribution and extraction/link paths for WhatsApp/PDF/DOCX. | Ingest company knowledge and customer documents as source items with owner, case, audience, expiry and extraction confidence. | Quotas and hashes do not replace malware scanning, DLP, tenant isolation, document classification or freshness verification. |
| Honest warmup and provider processing | html-portfolio / `gurukul-ws-w` `4328281a6be941ac8dad6691d4242dd9ef50ea3e`; `gurukul-ws-aj` `98efb8deb873b6f91c89d3195ad114a089dead11`; `gurukul-ws-ah` `da5897a8ac883f03713c99175dc069866ffb722b`; `gurukul-ws-ao` `f444d3282c43a431a415677ddf90dc1f12c9ee3d` | `api/_voice/preview-panel.js`; `api/_voice/warmup.js`; `api/_replica-processing/*`; `services/voice-evidence`; Sarvam ASR and provider readiness gates. | Make readiness, processing, stale evidence and refusal visible in the command centre; keep provider adapters replaceable and budgeted. | Several paths are mocked or deployment-dependent; a warm status is plumbing evidence, not quality or identity proof. |
| Evidence/context privacy runtime | Vyakti-GroupAI / `codex/relational-core` / `4bae159631ca3f18da0ede48596f593a55b6728c` | `packages/relational-core/src/memory.ts`; `privacy.ts`; `packages/context-capsule`; `packages/postgres-runtime/src/world-scope.ts`; `packages/delivery-runtime/src/runtime.ts` | Source lineage, observed/reported/inferred status, audience epochs, disclosure authorization, context manifests, idempotency, lease/fence and ambiguous-delivery reconciliation. | Strong candidate for the company brain foundation: organization/case scopes, evidence citations, model context authorization and one action ledger across email/WhatsApp/voice. | Kernel/reference adapters, not a finished SaaS; existing orchestrator supports silent/reply more than booking/CRM/phone actions. Authenticated memberships and real transports remain required. |
| Sales operations and command centre | CommandCentre / `origin/main` / `c8fd321407d7b628b7e79d105887b6a182760100` | `lib/cold-email/sequence-engine.ts`; `lib/cold-email/webhooks.ts`; `lib/outreach-lead-sync.ts`; `app/api/leads/[leadId]/call-outcome/route.ts`; `supabase/migrations/20260715_critical_tables_audit_trigger.sql` | Stages, outreach leases, suppression/rate limits, replies/bounces, persisted deliveries, lead sync and audit history. | Adapt as tenant-scoped CRM adapters and command-centre projections; put every action behind the shared evidence/policy/idempotency runtime. | Shared-password auth and one-company assumptions; legacy send/retry paths can duplicate after ambiguous acceptance. Extract mechanics, not a drop-in runtime. |

## GroupAI and CC product alignment

### Follow-up branches to compare before any port

- **CommandCentre hardening:** `claude/context-project-review-0x0i6g` at `d288e75c14dce50150f9787149a79e5fe4bd271c` adds signed team-session, webhook and send-policy hardening. Compare its fixes when extracting main's CRM mechanics; do not carry over the shared-password assumptions.
- **GroupAI SQL fixes:** `claude/vyakti-cloning-platform-aq05n4` at `451de5a6a7017dc76eaac69fe551203dc94753d2` builds on the relational-core lineage with follow-up changes including SQL migration fixes. Port with the corresponding migrations and tests, rather than copying only TypeScript helpers.
- **Later html-portfolio memory authority:** `codex/private-voice-requests25` at `f02469564fb10a082bf34a94ff8619626f683879` contains `api/_room-memory-authority.js` and `api/_owner-memory-drain.js`: exact-quote grounding, source-scope revalidation, atomic consolidation and corrected/retracted fact handling. Evaluate those mechanisms separately from its incomplete private-voice feature. The later `claude/vyakti-cloning-platform-aq05n4` branch is a parallel lineage, so newest date alone is not a selection rule.

The existing product direction correctly treats these as complementary layers:
GroupAI is the privacy/evidence/action kernel, CC is the sales-operations and
operator surface, and html-portfolio is a source of relationship/voice
interaction primitives. The intended flow is therefore:

`company and case evidence → relationship/disclosure decision → proposed voice or CRM action → human/policy approval → durable dispatch → provider receipt and outcome → command-centre projection`.

This lets a study-abroad consultancy start with enquiry qualification,
counselling booking, document-chase and approved follow-up while retaining the
same core for another industry. CC's lead stages and outreach mechanics should
be adapted into this action ledger; GroupAI's world/permission model should
be adapted into real organizations, staff memberships and student/parent case
access. Neither existing repository supplies that complete SaaS boundary.

## Imported code versus proposed reuse

No source branch has been wholesale-merged. The local foundation includes
reviewed, selective adaptations of the Maya spoken-text/voice seam, the
relational runtime and the GroupAI room-turn boundary; it does not copy the
companion identity or claim a complete provider runtime. The sample-data
prototype remains a separate historical product concept. “Reuse” above means a
selective port or clean reimplementation after dependency, security, tenant and
runtime review. The remaining safe order is:

1. establish organization, principal, case, contact and audience scopes;
2. extend evidence/disclosure and relationship state with deletion and review;
3. add the action ledger and CC-derived CRM adapters;
4. extend browser voice and later telephone voice with explicit consent, takeover and receipts;
5. consider optional voice persona or replica features only after quality and
   customer-value evidence.

The principal limits are unchanged by these selective ports: bounded synthetic
and internal browser checks do not prove production readiness; emotion signals
do not prove inner emotion; voice similarity and low latency are unproven at
product scale; and the repositories do not contain a complete multi-tenant CRM,
authenticated staff authorization model, commercial telephony operation or
cross-provider evaluation suite.

