# Architecture and reuse review

Date: 21 September 2026. Scope: read-only source inspection for planning a general company brain, CRM, command centre and voice-assisted customer operations SaaS. First customer: an Indian study-abroad consultancy. This report proposes architecture; it does not claim the product has been built or validated.

## Main finding

There are three complementary assets, but no evidence that stitching the repositories together yields the proposed SaaS:

1. **CommandCentre contains substantial sales operations code**: contact and stage updates, outreach queues, mailboxes, reply and bounce handling, sending limits, suppression, proposal engagement and operational audit history. Its current identity and data access model is for one company.
2. **Vyakti-GroupAI's relational-core branch contains the most distinctive reusable architecture**: evidence-bearing memory, multi-party disclosure policy, audience membership epochs, model context authorization, durable execution and delivery reconciliation. This is a set of useful foundations, not a complete customer operations product.
3. **html-portfolio contains real voice, ingestion, consent and memory work**, including provider abstractions, runtime gating, browser audio interaction, source-grounded memory consolidation and private voice admission. Its companion/creator/replica domains do not automatically map to business cases or commercial phone agents.

The product opportunity is a system that understands each company's cases and relationships, knows what it may say to each participant, and reliably carries work through to a verifiable outcome. A personable voice and a familiar CRM screen support that system; they do not substitute for it.

## Evidence and limits

Inspected files with `git show`; used ref discovery and targeted diffs to select branches. These are pinned observations, not README claims or live deployment verification:

| Label | Repository and ref | Commit |
|---|---|---|
| CC | command_centre, origin/main | c8fd321407d7b628b7e79d105887b6a182760100 |
| RC | Vyakti-GroupAI, origin/codex/relational-core | 4bae159631ca3f18da0ede48596f593a55b6728c |
| HP-H | html-portfolio, origin/codex/handoff-history-20260909 | 7a8ad90dd63fd30ea5a1a64bde4cf8dc016b3fb4 |
| HP-V | html-portfolio, origin/codex/private-voice-requests25 | f02469564fb10a082bf34a94ff8619626f683879 |

Paths below are repository-relative to these labels. Other agents own the complete branch inventory. No application, test suite, deployment, external provider or customer contact was executed in this review. Existing test files establish that tests were authored, not that they pass now. Source comments describing past live measurements are not treated as independently verified measurements. The CC AGENTS/context instructions were read; source clones were left unchanged as requested, including their session logs.

## Code-inspected findings

### 1. Identity and tenancy must become a real product boundary

CC `lib/app-auth.ts` signs an expiry timestamp with one `CC_APP_PASSWORD`, and `proxy.ts` accepts the shared cookie across protected routes. The cookie lasts 180 days and carries no individual identity or organization membership. `lib/supabase/server.ts` uses a singleton service-role client, with an anon-key fallback. `supabase/migrations/20260714_lockdown_rls_anon.sql` closes anon access; that is valuable hardening, but service-role bypass is not per-tenant isolation. The inspected call-outcome route accepts `performedBy` from request JSON. That label is not an authenticated audit principal.

RC has a better base: `db/migrations/001_foundation.sql` uses world-qualified primary and foreign keys for people, identities, conversations, policies, memories and events. Identity bindings include surface, integration and external user identifiers. RLS policies compare `world_id` with `vyakti.current_world_id()`. `packages/postgres-runtime/src/world-scope.ts` requires trusted-server authorization and provides an exact-world guard. These are actual modules to evaluate for reuse.

**Limit:** a world scope supplied by a caller is not itself authenticated tenant membership. The SaaS still needs organizations, verified staff and customer identities, memberships, role/case access, connector ownership and appropriately restricted DB credentials. Table owner/service-role privilege must not silently defeat the design. Student-parent association should be a verified relationship with explicit access, not inferred from a shared surname or telephone number.

HP-H `api/_auth.js` verifies bearer tokens through Supabase and derives the user from the response. That is stronger ownership proof than CC's shared gate, but owner/replica/dyad authorization is not a complete B2B organization and staff permission model.

### 2. The best company brain is evidence and permission aware

RC `packages/relational-core/src/memory.ts` represents episodic, semantic, preference, relationship and commitment memories with source event IDs, lineage, confidence, observed/reported/inferred/hypothesis status, temporal validity and lifecycle fields. `privacy.ts` checks world, agent, recipients, conversation, purpose, disclosure act, expiry, explicit denials, attribution restrictions and owner consent. Derived policies intersect permissions, retain restrictions and require all owners; they cannot freely combine private memories into public summaries.

`context-assembler.ts` filters candidates through disclosure authorization before adding their content to context, records authorization decisions and applies a context budget. `packages/agent-orchestrator/src/orchestrator.ts` verifies a context capsule and matches disclosure witnesses to its included policy decisions. Source provenance follows included model input, rather than every candidate retrieved.

This is a stronger differentiator than merely adding vector search to CRM notes. For a consultancy, a student's private concerns, a parent's funding statements, a counsellor's internal assessment and a jointly agreed document deadline are distinct facts with distinct audiences.

**Limit:** representational fields are not proof every caller enforces them. The inspected standalone context assembler calls policy authorization but does not itself evaluate memory lifecycle expiry. Lifecycle/tombstone enforcement must be established along the complete retrieval and authorization path. Do not expose this helper as a universally safe retrieval API without that audit.

HP-V adds valuable applied memory patterns in `api/_room-memory-authority.js`: source membership/epoch scoping; exact quote grounding; no assistant source supplied to extraction; locked source revalidation; and a single SQL statement committing episode, facts, observations and consumed cursor. Recall excludes retracted/superseded facts. Its correction path records a new statement instead of simply replacing history. `api/_owner-memory-drain.js` binds work to the authenticated owner's requested replica and dyad, uses deterministic request IDs, and reports pending when provider-spend reconciliation is required.

**Reuse:** preserve the source/claim/review/correction mechanism and deterministic communication preferences. Replace the learner/Room-specific schema where business meaning differs. Company policies, offers, pricing, deadlines and approved claims should be versioned knowledge with owners, effective dates and citations. Customer facts and internal speculation belong in different evidence classes. Fine-tuning is not the default way to load or update a company.

### 3. Reliable actions are a separate layer from intelligent replies

RC `packages/delivery-runtime/src/runtime.ts` claims work, recovers expired claims, revalidates under a dispatch barrier, sends an idempotency key and records provider outcomes. A thrown transport call is **ambiguous**, not automatically safe to resend. Reconciliation is a separate operation, governed by transport capability. Cancellation has a separate path. `packages/postgres-runtime/src/privacy-barrier.ts` holds a shared privacy barrier around an external disclosure, checks world authorization, resets session state and destroys a connection if cleanup becomes uncertain.

RC `packages/agent-orchestrator/src/orchestrator.ts` distinguishes generation from delivery, validates lease margins, persists model binding and encrypted output, and can recommit delivery without generating again. This is useful code to extract with its database contracts and tests.

**Material readiness limit:** this orchestrator currently implements reply/silent; other intervention actions return `action_not_implemented`. Targeted TypeScript search located a fake delivery transport and orchestrator/runtime construction in tests, not proof of deployed commercial adapters. A durable model reply is not yet a booking, CRM update, WhatsApp send, payment follow-up or phone call.

CC's newer cold sequence engine is more robust than its older generic batch worker. `lib/cold-email/sequence-engine.ts` atomically moves a due enrollment into a ten-minute lease, rechecks suppression and inserts an attempt before SMTP. `20260607_double_send_guard.sql` adds a unique live enrollment/step index. These deserve reuse as operational lessons and domain adapters.

However, the index only guards recorded `sent`/`retrying` attempts; it cannot prove an SMTP request was not accepted when the network failed. The same source classifies connection timeouts/resets as transient, marks the attempt failed and rearms. **Inference from that control flow:** duplicate external delivery remains possible after an ambiguous SMTP acceptance. RC's explicit ambiguity/reconciliation model is preferable.

CC `lib/email-jobs.ts` also wraps the external send and later lead synchronization in one try/catch, and its retry calls `sendEmail` again. `lib/outreach-lead-sync.ts` can throw after the provider accepted the email. **Concrete code-level risk:** a failed post-send lead write can trigger another external send. The batch worker skips a batch already marked processing and shows no lease-expiry recovery in that path. Multi-step batch creation uses separate writes, so partial creation is possible. Do not transplant this worker as the SaaS execution core.

CC `lib/cold-email/webhooks.ts` does provide persisted deliveries, timestamped HMAC signatures, delivery IDs, timeouts and bounded backoff. The inspected selection/send path does not atomically claim a delivery before posting; repeated delivery is something consumers must tolerate. Keep the adapter contract, add shared runtime guarantees.

### 4. Customer lifecycle is more than lead stage

CC `lib/outreach-lead-sync.ts` updates last contact and maps proposal requests to channel-specific stages; `app/api/leads/[leadId]/call-outcome/route.ts` delegates an entered outcome to workflow logic. This is useful CRM behavior, but call-outcome capture does not establish an automated telephony system. `sequence-engine.ts` embeds CBAM-specific disqualification and audience routing. Follow-up behavior includes business-specific first-touch-only rules and dedicated campaign modules. Extract the mechanics, not these business decisions.

CC's audit migration `20260715_critical_tables_audit_trigger.sql` records old/new rows and changed fields for critical mutations. It aids forensics, but a mutation log does not by itself encode the business reason, policy version, authoritative actor, request deduplication or completed outcome. Separate user-facing history from internal action attempts and sensitive forensic data.

RC `packages/follow-through-core/src/state-machine.ts` supplies a replayable commitment model with opt-in, revocation, corrections, disputes, reminders and participant completion attestations. These concepts are useful for promised follow-ups. Its multiparty/social completion semantics are not a drop-in customer case lifecycle: a document can be received but unverified; a task can be assigned but uncompleted; a case can have several simultaneous applications. Configure explicit completion evidence for each action and case transition.

### 5. Voice components are real, but voice product readiness is a different claim

HP-H `src/voice/liveCall.ts` contains actual microphone PCM capture, WebSocket streaming, transcription callbacks, adaptive listening/barge-in thresholds, echo handling, playback interruption, backlog management, token minting and socket rotation. This is meaningful browser voice engineering. The replacement socket setup does not restore the prior transcript in this module; its own comments acknowledge a fresh session on rotation. Call continuity needs an explicit server-side case/context resume contract.

HP-H `api/_voice/contracts.js` defines provider methods, audio format, idempotency requirements and synthetic audio disclosure. It hides provider details from the client. `api/_mirrorcall-runtime.js` measures readiness through the provider before advertising warmth. These patterns are worth adapting.

HP-V `api/_private-voice-store.js` adds real source/owner binding, integrity and processing-evidence checks, snapshot/config/receipt hashes, repeat-request handling, revocation and 24-hour expiry. It deliberately sets `release_eligible:false`, `identity_claim_allowed:false` and `training_allowed:false`, with a fixed private Hindi sample. `api/_private-voice-handler.js` exposes an integration seam that admits a request; it explicitly defers route registration until a real CPU consumer is deployed. This code is **not evidence of a released customer calling service**.

A commercial voice layer additionally needs verified transport integration, call authorization, contact identity, opt-out/quiet-time policy, transfer and human takeover, server-side tool permissions, interruption-safe actions, real provider receipts, cost/latency budgets and evaluated language performance. These are proposed requirements, not claims that every repository lacks every component. Select an appropriate voice provider for the first pilot; do not make voice cloning or model hosting a prerequisite to validating customer value.

### 6. Emotion-aware should mean careful adaptation, not mind-reading

HP-H `api/_experience-compiler/expression-observation.js` has a closed set of measurable interaction features such as speech rate and pause ratio. It validates producer/epistemic status, scope and confidence and explicitly sets `may_claim_inner_emotion:false`. This is an unusually useful product boundary: a signal can suggest speaking more slowly or asking if clarification is needed, without declaring that a student is anxious or a parent is distrustful.

Use explicit statements and preferences first: language, brevity, repeat requests, confusion expressed in words, desired contact schedule and human handoff. Treat acoustic signals as uncertain, local to the interaction and short lived. Never let a guessed emotional label independently authorize disclosure, change pricing, make promises or decide customer eligibility. Evaluate comfort, interruption handling, useful clarification and successful handoff rather than claiming accurate inner-emotion detection.

### 7. Similar names do not mean the systems are already integrated

HP-H `api/_relational-core.js` is a narrower dependency-free hand port: one from/to/scope/policy-version grant evaluator. It does not contain RC's complete multi-owner policy, derived policy or audience epoch implementation. HP-H `api/_private-dialogue-continuity.js` uses at most three exact prior exchanges and requires active private sessions within 12 hours, excludes owner-rejected replies, and warns the model that past AI replies are not established facts. This is useful continuity, not an unrestricted lifelong company memory.

HP-V's separate scoped consolidation shows that more durable memory exists in later work. Neither fact justifies flattening every memory path into one global store. Resolve identity, source lineage, policy and lifecycle semantics before integrating; avoid permanent parallel copies of policy evaluators that drift.

## Recommended general SaaS boundary

This is a proposed design informed by the inspection, not an existing assembled implementation.

| Stable platform core | Company configuration | Study-abroad industry pack example |
|---|---|---|
| Organization, principals, roles, case access, relationship permissions | Teams, branches, assignments, escalation owners | Student, parent/sponsor, counsellor, admissions team |
| Contact identities, cases, related opportunities, documents, tasks, commitments | Required fields, stage definitions, transition evidence, service levels | Enquiry, counselling, shortlist, application, offer, visa preparation, departure; concurrent applications |
| Versioned evidence/knowledge with source lineage and access | Approved offers, FAQs, prices, tone, languages, business hours | University/course facts, intake deadlines and document requirements with freshness/source metadata |
| Workflow triggers and durable action intents | Which actions may run, approval thresholds, fallback rules | Book counselling, collect missing documents, remind about a verified deadline, route exceptions |
| Channel adapters and shared interaction history | Connected inboxes/numbers/calendars, provider budgets | WhatsApp follow-up, phone qualification, email documents, counselling calendar |
| Case projections, action receipts, human work queue | Dashboard goals and operational ownership | Unanswered enquiries, unverified documents, blocked applications, overdue promised callbacks |

A versioned industry pack should configure the platform; it should not fork the core or execute arbitrary tenant-authored code. Preserve a typed action registry and explicit preconditions. Every action should carry tenant, case, actor, policy version, evidence, idempotency key and expected outcome, with states such as proposed/authorized/queued/dispatched/confirmed/ambiguous/failed/cancelled.

The command centre should answer: **What needs attention, why, who owns it, what has been attempted, and what evidence says it is complete?** For the first pilot, a practical end-to-end case is a new enquiry → qualified facts → counselling booking → approved follow-up → document checklist → missing-item chase → escalation, with student/parent permissions throughout. It should remain configurable for another industry with a different case lifecycle.

## Reuse decision

| Asset | Reuse decision | Required adaptation |
|---|---|---|
| RC relational-core, context-capsule, delivery-runtime, postgres-runtime | Best candidates for actual library extraction, together with database contracts and meaningful tests | Authenticated SaaS tenancy; business purposes/actions; retrieval lifecycle audit; real adapters; performance/operational validation |
| RC follow-through-core | Reuse event/recovery/attestation concepts; selected reducers where semantics fit | Case/task completion evidence rather than mandatory social-participant agreement |
| CC cold-email adapters, reply/suppression/rate-limit mechanics, operational UI patterns | Selectively extract/refactor | Tenant scoping; shared action ledger; remove CBAM assumptions; reconcile ambiguous sends; authenticated actors |
| CC shared auth and legacy email batch runtime | Redesign | Individual identity, memberships, tenant enforcement and safe recovery |
| HP source-grounded consolidation, correction, voice contracts and consent receipts | Reuse selected implementations and contracts | Business/case scope; unified policy authority; verified provider operations; appropriate disclosure UX |
| HP live browser voice engine | Prototype accelerator, benchmark against first-customer devices and languages | Call resume, transport needs, tool execution, human transfer, maintainability and cost |
| Companion personality, creator publication, replica training pipeline | Optional product-specific concepts, not core dependencies | Include only when demonstrated company/customer value requires them |

## What would establish real readiness later

Planning should reserve explicit proof for cross-tenant isolation, student/parent disclosure changes, retrieval after correction/deletion, crash after provider acceptance, duplicate/out-of-order callbacks, human takeover during an action, call reconnection, stale knowledge rejection and per-case cost. Those scenarios test the proposed advantage. Synthetic leak counts, authored tests, architecture diagrams and provider directories cannot substitute for that end-to-end evidence.

The defensible upper hand is **a company-configurable, relationship-aware system that finishes customer work and can explain its evidence and actions**. The repositories offer a credible head start on several difficult pieces. Integration, customer lifecycle modelling, operational reliability and real-world voice evaluation remain substantial product work.
