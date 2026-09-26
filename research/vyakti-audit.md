# Vyakti-GroupAI branch audit

Audit date: 2026-09-21 (Asia/Calcutta)

Repository: `https://github.com/raghavsharma2003/Vyakti-GroupAI.git`

Clone used for this audit: `research-sources/Vyakti-GroupAI`

## Scope and method

I cloned the repository with Git authentication, fetched/pruned remote refs, and
audited the complete remote branch set visible at that point. There was no
`AGENTS.md` in the workspace or repository. I did not install dependencies, run
scripts, run tests, start the application, start PostgreSQL/Docker, or contact a
provider. This is a static source and documentation audit.

I first compared branch histories and tip trees, then deduplicated by Git blob
SHA. I read the substantive TypeScript packages, SQL migrations and verifies,
README/package documentation, architecture and pilot documents, and context
briefs/journals. Identical generated/configuration blobs were counted once.

## Remote refs and unique deltas

There are four remote refs but three unique branch tips. `origin/HEAD` is a
symbolic ref to `origin/main`, so it is not a fourth implementation.

| Remote ref | Tip SHA | Tip commit | Disposition |
| --- | --- | --- | --- |
| `origin/main` | `d06efdcd42c2ee08b7c9c2221c5e1029ad6dd7c7` | `feat: add durable cloud relational runtime` (2026-08-30) | Baseline foundation; retained as the main-line snapshot. |
| `origin/HEAD` | `d06efdcd42c2ee08b7c9c2221c5e1029ad6dd7c7` | same object as `origin/main` | Alias only; no unique code. |
| `origin/codex/relational-core` | `4bae159631ca3f18da0ede48596f593a55b6728c` | `fix: bound shadow verifier parameter match` (2026-09-04) | Most complete pre-provider implementation branch; contains main plus 37 commits. |
| `origin/claude/vyakti-cloning-platform-aq05n4` | `451de5a6a7017dc76eaac69fe551203dc94753d2` | merge of the same shadow-verifier fix (2026-09-04) | Newest branch; codex tip is its merge parent, with three additional commits and a 15-path delta. |

`origin/main` has three commits. `origin/codex/relational-core` is 37 commits
ahead of main and changes 479 paths (68,335 insertions and 307 deletions).
The Claude tip is 40 commits ahead of main and changes 489 paths (68,735
insertions and 307 deletions). The Claude tip is three commits ahead of the
codex tip and changes only 15 paths: migration 019, its database/development
documentation, and context graph/journal/handoff records. The substantive
implementation in those two branches is therefore the same migration 001–019
system, with Claude carrying the final parameter-shadowing repair and hosted
proof record.

At the merged tip there are 601 tracked files. 112 files retain the exact main
blob; 489 paths are additions or modifications relative to main. Cross-path
duplicate blobs are limited to shared package `tsconfig.json` files, shared
Vitest config files, and two tiny package `index.ts` files. The substantive
package/SQL implementations are not duplicated under alternate names. Branch
comparisons therefore use the codex branch as the implementation representative
and record Claude's 15-path delta separately.

## What is implemented

The repository is a privacy and relational-runtime foundation for a “common
friend” AI. It is substantially more than a landing-page claim or a toy
chatbot, but it stops at tested kernels and database boundaries rather than a
shippable product.

### Domain and privacy kernel

`packages/relational-core` contains Zod-validated, channel-neutral contracts for
social worlds, agents, people and verified surface identity links, conversations,
audience epochs, immutable events, typed memories, relationships, disclosure
policies, consent grants, disclosure acts, and derivation. `authorizeDisclosure`
is deterministic and takes exact purpose, action, source audience, recipient set,
destination, sensitivity, time and consent evidence. Derived policies intersect
readers/allowed scope and union denials, so derivation cannot widen access.
`InMemoryEventStore` and `InMemoryIdentityDirectory` are reference/test stores,
not a deployment database.

`packages/context-capsule` turns already-authorized memory and current-turn event
items into a canonical, budgeted, audience/request-bound manifest with citations,
integrity hashing and content-free audit entries. It does not perform the
underlying identity, consent or source verification itself.

`packages/intervention-policy` is a deterministic policy engine with typed
outcomes for `silent`, `react`, `reply`, `ask_permission`, `move_to_dm`, and
`perform_action`, with evidence and trace codes. The current production
orchestrator intentionally executes only `silent` and `reply`; unsupported action
types become auditable no-output outcomes.

### Durable execution and model boundary

`packages/model-gateway` defines provider capability contracts, canonical request
keys, tokenizer/context verification, structured-output validation, usage/cost
accounting, safe retry rules, redacted audits, durable request-ledger
coordination, ambiguity states, and a recovery-only reconciliation seam. It
explicitly refuses to treat an unknown post-dispatch result as safe to retry.
The provider and ledger interfaces plus fake implementations are test seams; no
OpenAI/Anthropic/etc. adapter or production credential path is present.

`packages/delivery-runtime` defines lane ordering, idempotency keys, lease/fence
ownership, final privacy revalidation, send/reconcile/cancel cycles, ambiguity
handling and provider capability checks. Its repository and fake transport are
in-memory/reference implementations. The actual transport integration and
worker composition are absent.

`packages/agent-orchestrator` composes a claimed turn, intervention decision,
authorized preparation, model request binding, privacy barrier, encrypted output
record and reply commit. The path is coherent for silent/reply turns and has
crash/recovery checks, but it is an application composition boundary rather than
a gateway, webhook server, UI, or deployable service.

### PostgreSQL runtime

`packages/postgres-runtime` contains substantial adapters over an abstract
PostgreSQL client for ordered turn processing, world scoping, privacy barriers,
disclosure repositories, immutable context-event citation provenance, model
request ledgers, model-result key-erasure lifecycle, delivery repositories,
follow-through persistence, recovery workers, and shadow-pilot persistence. The
runtime code performs extensive row/result validation and fail-closed stale,
scope, fence and authorization checks.

Migrations `001`–`019` form the database side of that design:

* `001`–`005`: event/policy/disclosure foundations and aggregate constraints;
* `006`–`007`: privacy session barriers, durable delivery/outbox state, leases,
  fences and reconciliation;
* `008`–`013`: model request/result ledgers, dispatch binding, ordered sequence
  claims, model-result erasure and exact turn-context provenance/consent-time
  revalidation;
* `014`–`016`: consent-first shared commitments, human attestation recovery,
  private reminder routes, checkpoints, and a fenced recovery scheduler;
* `017`: forced-RLS, one-world, no-delivery shadow runtime;
* `018`: objective disposition and recovery of expired shadow `model_pending`
  work through provider reconciliation only, with exact result-key lineage and
  erasure expansion;
* `019`: append-only, forced-RLS pre-provider provenance tables and validators
  binding people, source events and disclosure witnesses to a shadow turn before
  egress.

The SQL is substantive and includes append-only triggers, constraints,
`SECURITY DEFINER` validation, forced RLS, world scoping and least-privilege
role checks. It is not a CRM schema and it does not create an HTTP/webhook
service, migrations deployment system, worker fleet or production role/secret
provisioning.

### Shared follow-through

`packages/follow-through-core` is a large pure deterministic reducer for
human-authored shared commitments: exact source witnesses, authenticated command
contexts, aggregate versions/fences, independent opt-ins, participant-scoped
reminder consent and private destinations, correction/dispute/withdrawal,
unanimous completion, replay checkpoints, and content-free outcome telemetry.
The package README is explicit that its in-memory source-consumption port is a
reference implementation and that production must claim a globally unique source
in the same PostgreSQL transaction as event/head/outbox writes. The Postgres
adapters implement much of this boundary, but there is no end-user commitment UI
or provider delivery deployment.

### Pilot telemetry and shadow evaluation

`packages/pilot-telemetry` verifies exact campaign manifests, predeclared metrics,
authoritative consent evidence and authoritative event time, contiguous replay,
withdrawal/deletion ordering, cohort assignment, SLA breakers and permanent
circuit-breaker behavior. It records derived ratios and bounded counters, not
raw content or participant identities.

`packages/shadow-pilot-core` is a strict Campaign 1 state machine. It enforces
adult-eligibility/onboarding timing, independent per-member scope consent,
audience epochs, immutable cohort membership after start, source-observation and
candidate caps, hidden encrypted-object metadata, all-member ratings, private
vetoes, permanent incident breakers and content-free aggregate reports. It has
no database, KMS, queue, model, transport, identity, UI or production
composition.

`packages/shadow-pilot-orchestrator` composes that policy with a dedicated shadow
turn, context capsule, durable model ledger, encrypted hidden candidate and
content-free failure. It has no destination, outbox, reply, reminder or external
action. Its recovery path is intentionally separate, reconciles only exact
ambiguous work, never calls ordinary model execution, and never dispatches when
the provider result is absent or pending.

`packages/simulator` provides provider-neutral two-DM/one-room worlds and
deterministic synthetic Campaigns 0, 0B and 0C covering privacy/audience,
consent/revocation/replay and cross-surface identity continuity. These are
valuable executable negative/positive controls, not evidence from human groups.

## Documentation, research and claims

`docs/architecture/ARCHITECTURE.md` documents a useful event-ledger → policy →
context-capsule → model-ledger → encrypted result → outbox/delivery shape. It
explicitly treats search, embeddings, summaries and relationship scores as
derived projections that cannot widen authorization. `docs/pilots/PILOT-PROGRAM.md`
defines synthetic gates and a staged Campaign 1–6 ladder: shadow judgment,
mention-only recall, permissioned bridge, facilitator/planner, cross-surface
continuity, and separately gated agency/voice.

The context graph is a versioned decision/evidence record, not executable product
logic: at the Claude tip it contains one normalized product brief, 27 artifacts,
32 decisions, 16 experiments, 48 failure nodes, 21 risks, 6 results, 5
requirements, 212 edges, and four journals. Research files separate evidence,
inference, decisions and falsifiers; they include the Maya reference audit and
landscape/competitor/platform research. Research claims should be treated as
dated repository notes, not independently verified market facts.

The README records hosted CI runs such as `33758157417` (migrations/verifies
001–019 and four PostgreSQL integration files) and `33545202883` (001–018), plus
local source-gate counts. Those are useful provenance claims, but I did not rerun
them. The same README and `db/README.md` say a disposable Neon attempt expired
after only verify 001 and is not Neon proof. Synthetic zero-violation claims and
hosted CI claims must not be presented as production or human-pilot outcomes.

## Product relevance and reuse

| Target capability | Relevance | Reuse | Rebuild required |
| --- | --- | --- | --- |
| Company brain / organizational memory | High for the safety kernel | World/tenant isolation, identity links, provenance-bearing event/memory records, disclosure policy, audience epochs, context capsules, model/result ledger, erasure lineage, audit and delivery semantics | Organization/project/case/document schemas, connectors and indexing, search UX, auth/admin, KMS, retention jobs, role/permission UX, deployable APIs/workers |
| Group agent / common-friend agent | High conceptually | Relational core, intervention policy, simulator, campaign telemetry, shadow-only evaluation, follow-through and privacy barrier | Platform adapters, webhook verification, participant sessions, UI, provider integration, production composition, incident operations and real pilot controls |
| Student–parent–counsellor product | High after domain translation | `social_world` can become a case/organization boundary; person/identity links and exact audience epochs fit student, parent and counsellor scopes; disclosure acts and private-veto semantics fit consented case updates; follow-through fits agreed actions | Student/application/case/consent/meeting/assignment entities; role-based organizational access and safeguarding; school/agency connectors; case timeline, approvals and review UI; notifications and accountable human escalation. Avoid importing “friend” assumptions or using inferred relationship scores for high-stakes decisions |
| CRM / sales enablement | Medium for primitives, low for product completeness | Event ledger, contact identity, provenance, scoped context, action authorization, model request idempotency and outbox patterns can protect account/customer memory and outbound actions | Lead/account/opportunity/activity/territory/owner/stage/forecast schemas; CRM/email/calendar connectors; dedupe/import; pipeline UI; sales permissions, approvals, SLA queues, reporting and integrations. Nothing in this repo is a CRM |
| Customer service | Medium for privacy/reliability patterns, low for ready use | Conversation sequence, source citations, disclosure policy, durable delivery/reconciliation, deletion and audit are reusable | Ticket/case/queue/priority/SLA/escalation/knowledge-base models, agent console, channel adapters, attachments, human handoff, PII redaction and support operations |
| Voice agent | Low today | Voice appears as a channel enum and identity fixture; architecture is channel-neutral; Campaign 6 lists voice requirements | Telephony/WebRTC, STT/TTS, diarization, speaker identity, barge-in/interruptibility, turn timing, recording/retention, consent and provider adapters. The repo has no voice runtime |

The strongest reuse is the authorization and reliability substrate, especially
for a student-parent-counsellor “company brain” where the same fact may have
different visibility for a student, parent, counsellor and institution. The
product/domain layer should be designed separately: a sales or support system
needs accountable business records and workflows, while this repository models
social worlds and relational disclosure. Treat it as a kernel to adapt, not as a
ready-made application to extend with labels.

## Production and product gaps

The repository itself calls out the following blockers:

* no real AEAD/KMS adapter, key rotation/destruction worker or authenticated
  deletion receipts;
* no current-authority reviewer boundary and no participant withdrawal,
  revocation and deletion control plane across all projections/providers;
* no durable preparation/decryption adapter or trusted production composition
  root;
* no reviewed provider retention/training terms or real provider implementation;
* no deployed recovery scheduler/worker, wake mechanism, metrics, alerts,
  retention/partitioning plan, load evidence or complete race/transition matrix;
* no platform webhook/identity adapters for Telegram, Discord, WhatsApp or
  first-party surfaces, and no UI for consent, review, rating, correction,
  withdrawal or deletion status;
* no CRM, sales, service, calendar, booking, payment or agency domain;
* no voice processing, telephony, STT/TTS or diarization;
* proposed human campaigns remain unlaunched and hard-gated on adult cohorts,
  credentials, incident ownership and safety review.

`agent-orchestrator` currently supports only `silent` and `reply`; permission,
DM movement and external actions are deliberate no-output boundaries. The
shadow path has hidden candidate persistence but no review/decryption product.
The SQL proves invariants under specified identities and cloud CI scenarios; it
does not prove availability, scale, provider behavior, key destruction or human
value.

## Recommended disposition for the sales-enabler program

Reuse the following as a reviewed library or design reference: canonical IDs and
event envelopes, world/tenant scope, verified identity links, audience epochs,
source-bearing context capsules, deterministic disclosure decisions, model and
delivery idempotency/ambiguity ledgers, erasure lineage, and the follow-through
state/recovery patterns. Preserve the separation between model proposal and
application authorization.

Build a new application layer around a configurable organization/case model.
For the first student–parent–counsellor or sales-enablement vertical, introduce
role-aware case/workspace membership, consent and safeguarding rules, CRM/helpdesk
objects, connector adapters, review/approval UI, audit views, real KMS, worker
operations, and end-to-end deployment. Keep the “world” abstraction only where
it improves tenant and relationship isolation; do not carry over friend-specific
assumptions, pilot thresholds or synthetic campaign claims.

## Coverage limits

This audit covers the four remote refs returned by `git fetch --all --prune` on
2026-09-21 and their reachable history at the stated tip SHAs. It does not cover
deleted/unadvertised refs, forks, tags omitted by the clone, local branches from
other checkouts, GitHub Actions artifacts beyond what the repository documents,
or external dependency source.

I did not execute TypeScript, SQL, tests, CI workflows, provider calls or the
application. Therefore statements about correctness, hosted runs, test totals,
security and production behavior are either static observations or clearly
identified repository claims. Static inspection cannot establish that the code
builds with current dependencies, that SQL runs on a clean PostgreSQL instance,
that RLS is correctly deployed, or that any human pilot has occurred.

