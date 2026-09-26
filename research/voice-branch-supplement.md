# html-portfolio: Claude and Codex branch supplement

Date: 21 September 2026. This is a read-only branch audit for planning a configurable company brain, CRM and voice-assisted customer-operations SaaS. The first proposed customer is an Indian study-abroad consultancy, but conclusions are framed as reusable platform patterns. No repository scripts, app, tests, browser, deployment, database, provider or customer account was run. Existing test/evidence files show authored controls or historical claims; they do not establish current operational readiness.

This supplements, rather than repeats, [architecture-reuse.md](architecture-reuse.md). That review has the detailed code analysis for `codex/handoff-history-20260909` and `codex/private-voice-requests25`. The existing voice inventory owns `main`, `voice-cloning`, and the `gurukul-ws-*` worktree branches. Their results are cited where their work is merged into the branch tips below.

## Scope and lineage

All nine requested remote branches were inspected by SHA, merge-base, selected net diffs, commit history and targeted source paths. The lineage matters: it is a serial product history with a few preservation forks, not nine independent implementations.

| Branch | Tip SHA | Relevant base / relationship | Net finding |
|---|---|---|---|
| `claude/ai-companion-app-rkt1lv` | `f4d3fe4e` | `main` `3a921798`; ancestor of every other target | 34-commit companion baseline; its tip is chiefly a ledger closeout. |
| `claude/gurukul-platform` | `771feef9` | extends AI companion by 270 commits | Integrates the Gurukul Studio and voice/ingestion work. |
| `codex/vyakti-completion` | `6260611e` | extends Gurukul by 560 commits | Large Rooms/commercialization successor. |
| `codex/handoff-processing204` | `e913ffcb` | extends completion by 163 commits | Preserved processing/GPU-control successor. |
| `codex/handoff-history-20260909` | `7a8ad90d` | forked from `57eda53a`; 22 commits unique to its fork | Archive/preservation fork, reviewed in the main architecture report. |
| `codex/handoff-voice-comparison106` | `0b47b2b8` | forked from `57eda53a`; four commits unique to this experiment fork | Disabled synthetic comparison plan and capture machinery. |
| `codex/handoff206` | `20263775` | forked from history at `31833cdf`; four commits ahead | Handoff documentation, no new runtime capability in its tail. |
| `codex/private-voice-requests25` | `f0246956` | forked from `39a7ffc8`; one WIP commit ahead | Private voice request/store WIP, reviewed in the main architecture report. |
| `claude/vyakti-cloning-platform-aq05n4` | `6d7d9bcd` | parallel to private-voice WIP from `39a7ffc8`; eight commits ahead | Accepted text-first private-pilot repair branch; it intentionally excludes the WIP voice-request implementation. |

`AGENTS.md` was read from the relevant remote refs. Its applicable cautions are reflected here: do not claim unrun work, do not treat mocked checks as live SQL/provider proof, look for callers rather than definitions, and preserve consent, disclosure and erasure boundaries. No secrets, credentials, protected URLs, personal data, or old run identifiers are reproduced.

## Branch findings

### `claude/ai-companion-app-rkt1lv` — consent, privacy boundary, and operations baseline

This branch is fully inherited by the remaining targets. Its own 34 commits add an explicit memory-consent surface and ledger, a behavioral/internal-information fence, server-side operational event logging, Google prompt-cache handling, Android/release packaging, and authored evaluation suites.

`db/migrations/016_memory_consent.sql` models consent as append-only answers with a version and both device/filed timestamps; `src/components/MemoryConsent.tsx` renders a separate grant/decline choice. The consent ledger deliberately contains no conversation text. `api/_obs.js` scopes events to counters/labels/decisions and swallows logging failures so telemetry cannot block a customer interaction. `api/_gcache.js` keys an explicit provider cache by model plus a hash of exact stable prompt bytes, bounds its in-memory map and TTL, and falls back when cache work fails.

**Reusable capability:** consent receipts/versioning, data-minimal operational telemetry, and bounded cache behavior are good platform patterns. A consultancy can reuse the former for consent to retain applicant facts, share material with a sponsor, or make follow-up contact. Cache entries must be tenant and access-policy scoped before any business reuse.

**Maturity and limits:** these are single-product/device semantics, not an organization, staff-membership, case-access or CRM audit model. The migration and UI are evidence of implementation, not proof of a live consent workflow. The cache is a provider-cost optimization, not company knowledge storage or authorization.

### `claude/gurukul-platform` — integrated expert workspace, source ingestion and voice experiment

This is the first broad integration tip, 304 commits ahead of `main`. It includes the `gurukul-ws-*` workstreams already covered by the voice inventory, plus its final blinded voice-selection additions. The integrated source tree has a channel-ingestion boundary (`api/_channel-ingest.js` and `api/_channel/*`), bounded context/source handling (`api/_context-locker.js`, `api/_context-mining.js` and typed PDF/DOCX/link/WhatsApp extractors), a Studio journey, and Mirror Call storage/transport modules.

At the tip, `src/studio/VoiceExperimentPanel.tsx`, `scripts/voice-matched-pack.mjs`, `evals/voice-matched-pack/*`, and `services/openvoice-converter/*` form a blinded, exact-text comparison surface. The branch’s own context notes make the key limitation explicit: source-quality and likeness quality were unresolved, so generation/capture artifacts must not be translated into a claim that a voice resembles the owner.

**Reusable capability:** a source-ingestion contract that retains provenance and limits, a human-reviewable knowledge workspace, and a provider-neutral comparison/evaluation harness are relevant to a consultancy. Map them to authoritative university facts, source documents, counsellor-authored guidance and versioned approved answers. The strong product lesson is to show the next usable action and an honest blocker instead of presenting a false “ready” state.

**Maturity and limits:** this is creator/teacher and personal-replica software, not a multi-company CRM. The channel extractors do not establish approved business connector operations, document verification or a tenant-level knowledge policy. Voice and source processing require the separate inventory’s more detailed review; no live result was newly verified here.

### `codex/vyakti-completion` — commercial Rooms and preference-aware engagement

This 560-commit successor is the largest distinct expansion after Gurukul. Its net files add Rooms, followers/creator surfaces, subscriptions and receipts, payments provider adapters, check-ins/pulse, Telegram/WhatsApp channel surfaces, invitations, operational summaries and rate limits. These are adjacent to a CRM but encode a creator-follower product model.

The most reusable customer-operations detail is communication preference enforcement. `api/_quiet-hours.js` expresses local-time quiet windows with IANA time zones; `api/_checkins.js` validates and schedules time-zone-aware check-ins. Migrations `134_follower_time_zone.sql` and `135_subscription_restart.sql` make follower preferences durable and distinguish a halted/cancelled subscription from a new mandate. Migration `136_referral_rewards.sql` and `api/_payments.js` show idempotent, database-enforced reward issuance plus a zero-value receipt path. `api/_room-export-readable.js` includes readable export mappings.

**Reusable capability:** per-contact timezone, contact-channel quiet hours, notification consent, restartable service plans, durable receipts, rate limits and human-readable export are useful for study-abroad follow-ups. Apply them to applicant/parent preferences and engagement entitlements. A due follow-up should be suppressed or rerouted based on the recipient’s verified preference and local time.

**Maturity and limits:** a follower subscription/referral is not a lead, application, document or case. The code is useful as a design/reference for notifications and payment ledger idempotency, but needs a B2B tenant/principal model, case relationships, business-purpose policy, opt-out enforcement across all channels and reconciliation with real payments. No end-to-end provider execution was run in this audit.

### `codex/handoff-processing204` — expensive processing admission and accounting controls

This branch adds a substantive control plane over the prior processing pipeline. `api/_gpu-allocation-budget.js` atomically reserves a budget, permits one dispatch, records ambiguity separately, and only settles after an attributable closed-allocation usage verifier. `api/_replica-processing/gpu-admission.js` binds each processing child to an active owner/source/consent/lease/revision predicate and a bounded shared GPU allocation. Its source uses SQL locks and explicitly refuses a retry that could become a second dispatch. The tip also adds a canary observer and a one-shot processing worker entry point (`api/_replica-processing/canary-observer.js`, `services/replica-processing-worker/run-once.js`).

**Reusable capability:** this is a credible pattern for any metered, long-running company-brain job: document OCR, transcription, extraction or batch re-indexing. Reserve cost before dispatch; record the outcome as confirmed, ambiguous, or pending reconciliation; tie work to the source’s access grant and content hash; never silently re-run a costly external call after a lost acknowledgement.

**Maturity and limits:** resource names, provider contract shapes and lifecycle tables are product/Azure specific. The code does not make a general job platform by itself, and a reservation estimate is not a final invoice. It should be extracted only as an adapter-neutral action/runtime contract with verified production observers and support operations.

### `codex/handoff-history-20260909` — preserved product history, not a merge candidate

The branch has 22 unique commits after its fork point and carries substantial historical work, including the Room memory/private-dialogue/processing integration inspected in [architecture-reuse.md](architecture-reuse.md). Its own tip is explicitly an archive commit with no changed product paths. `docs/handoff/2026-09-09/START-HERE.md` describes it as a preservation snapshot and warns that it is not ready for production.

**Reuse decision:** use it as an evidence source for individual modules only, particularly the memory and authorization analysis already captured in the main architecture review. Do not treat the archive branch as a release or merge target. Its historical notes distinguish successful synthetic/artifact checks from a real signed-in journey and human voice evaluation; retain that distinction.

### `codex/handoff-voice-comparison106` — bounded synthetic voice experiment, deliberately disabled

This is a narrow fork with four unique commits. `evals/voice-stock-comparison/plan.mjs` builds a fixed two-arm, six-prompt-per-arm evaluation pack. It marks the source as synthetic, disables release/training/identity claims, sets `executionAllowed:false`, and excludes owner likeness as a scoring axis. `services/voice-stock-comparison/job-plan.mjs` requires an approved hash, durable admission, a single serial sequence, no automatic retries and verified terminal receipts. `services/voice-stock-comparison/capture.mjs` reads bounded logs and verifies artifacts before emitting a receipt.

**Reusable capability:** retain the experiment protocol, not the model comparison outcome. A commercial voice pilot can use fixed multilingual scripts, exact artifact/model/version commitments, blinded listening, explicit disclosures and no silent retries. For a consultancy, score intelligibility, interruption recovery, verified-fact delivery and successful transfer to a counsellor, separately by Hindi, English and ordinary Hinglish.

**Maturity and limits:** the plan is not an operational customer-call system. It used a non-owner synthetic reference and expressly makes no owner-likeness, general quality or competitor claim. It should not be used as evidence to sell cloned customer/counsellor voices.

### `codex/handoff206` — useful handoff judgement; no implementation delta

The four unique commits after `31833cdf` change configuration examples and handoff material, especially `docs/handoff/2026-09-09/NEXT-AGENT.md`, `COMBINED-OFFLINE-CHECKS.md` and `START-HERE.md`. The handoff correctly prioritizes a real authenticated user journey and listening to actual outputs before further frameworks, and warns that offline checks do not prove language adherence or voice quality.

**Reusable capability:** its strongest contribution is operating discipline: acceptance criteria should be a full customer case journey and human evaluation, with evidence about actual outcomes rather than a count of agents, commits or synthetic checks.

**Maturity and limits:** it is a documentation/recovery branch. It introduces no net CRM, memory, telephony or voice runtime capability in its unique tail.

### `codex/private-voice-requests25` — private voice admission WIP

This branch’s one unique WIP commit adds the private voice request store/handler/erasure path and migration 171. It is examined in detail in [architecture-reuse.md](architecture-reuse.md): it keeps a private request source/owner bound, uses integrity/policy hashes, supports revocation/expiry and intentionally refuses release, training and identity claims. The branch’s own tip labels runtime and live-SQL validation as pending.

**Reuse decision:** consider its admission receipt, expiry and erasure concepts for highly sensitive recorded calls only after a B2B policy design. It is not a calling feature, telephony adapter, inference worker or commercial voice-cloning release.

### `claude/vyakti-cloning-platform-aq05n4` — September 21 private pilot repair, text first

This branch shares `39a7ffc8` with the private-voice WIP but does not descend from its WIP tip. Its eight unique commits repair navigation, personal-profile save behaviour, notices, failed voice recovery copy and a text-first “Meet” route. The diff against the private-voice branch removes that branch’s WIP request/store/migration files and adds `docs/handoff/2026-09-21/WRAP-UP.md`, `evals/private-first-meet/*`, and scoped Studio changes.

`evals/private-first-meet/run.mjs` is particularly useful evidence of intended UI behavior: a saved personal sheet and text item can open a private draft; missing text material exposes an honest return-to-knowledge action; and a late save must not cross a replica/account scope switch. `src/studio/WorkspaceNotice.tsx` clears stale screen-scoped notices and preserves accessible status/error roles. The wrap-up document explicitly says the accepted private pilot is limited to sign-in, workspace, knowledge, profile, private text questions and correction; it excludes private voice generation and lacks a completed real signed-in journey in the recorded session.

**Reusable capability:** scoped UI state and account-switch fencing are directly relevant to a CRM console, where a late document save or action toast must never move across customer/case boundaries. A text-first private pilot is also the correct sequencing lesson: prove knowledge, correction, permissions and handoff before adding voice automation.

**Maturity and limits:** deployment/gate claims in branch documentation were not independently re-run here. The private-voice WIP is absent from this branch; do not describe its accepted pilot as a working voice product. This branch remains personal/creator domain code and requires organization tenancy, case authorization and business workflow adaptation.

## Implications for the general SaaS

The strongest complementary assets from these branches are not voice cloning. They are: (1) source-bound, permission-aware long-running work; (2) consent/version/erasure records; (3) contact-level channel preferences and quiet hours; (4) idempotent financial/action receipts; (5) exact, blinded evaluation methods; and (6) user-interface fences that prevent stale state crossing an identity/case boundary.

For the study-abroad pilot, use those patterns for: an applicant/parent/counsellor relationship graph; cited university facts and documents; timezone- and consent-aware reminders; a durable action ledger for booking, document chase and escalation; and text chat with a human takeover first. Treat speech as a channel adapter governed by the same action, privacy, opt-out and receipt policies. Do not make either custom voice likeness or generic model processing the first production dependency.

## Coverage limits

- This report covers all three `claude/*` and six `codex/*` target refs at the SHAs above. It does not repeat the separately assigned `main`, `voice-cloning` or `gurukul-ws-*` deep review.
- Inspection was source and Git-history based. I read selected modules and the applicable remote `AGENTS.md`; no code was executed and no historical live/run claim was independently validated.
- The high-volume common lineage was counted once. Branches that preserve an earlier snapshot are recorded for their genuinely unique deltas, rather than inflating the capability inventory by treating copied code as new work.
- “Reusable” means a candidate design/code pattern. It does not mean the module is portable, secure for B2B tenancy, legally approved, integrated with telephony/CRM, or production-ready.
