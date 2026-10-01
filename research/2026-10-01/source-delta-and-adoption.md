# Source branch delta and adoption audit — 2026-10-01

Scope: read-only refresh of the three previously audited local source clones in
`research-sources`, followed by inspection of only the changed branch tips.
No source clone was checked out, reset, merged, edited, built, tested, or
connected to a provider. No secret, endpoint, customer record, or provider
configuration value was read or reproduced.

## Ref delta since the 2026-09-21 inventory

I ran `git fetch --prune origin` in each existing owned clone on 2026-10-01 and
compared named `origin/*` tips (excluding symbolic `origin/HEAD`) with
`research/branch-inventory.json` (`snapshot_date: 2026-09-21`).

| Repository | Current named heads | New heads | Moved existing heads | Missing heads |
| --- | ---: | ---: | ---: | ---: |
| `raghavsharma2003/command_centre` | 21 | 0 | 0 | 0 |
| `raghavsharma2003/html-portfolio` | 32 | 1 | 1 | 0 |
| `raghavsharma2003/Vyakti-GroupAI` | 3 | 0 | 0 | 0 |
| **Total** | **56** | **1** | **1** | **0** |

Changed refs:

* New `html-portfolio` branch `origin/codex/multimodal-layer-20260927` now
  points to `3e036e7db552b1cc802c2a42451787fc5791d4a` (2026-10-01,
  “feat: extract portable turn checkpoints with scoped runtime integration”).
* Existing `html-portfolio` branch
  `origin/claude/vyakti-cloning-platform-aq05n4` moved from the audited
  `6d7d9bcd4f9c4c793e8db34b70ac03d874fe8d4a` to
  `ebe16cc061f1db02b2ba2922a96e3dc3e033d07f` (2026-09-30). Its delta includes
  a private-voice runtime, source/consent snapshots, lease and allocation SQL,
  protected-output provenance, erasure cleanup, and a large browser/evaluation
  packet. The highest-value bounded candidates are inspected below.

The 2026-09-27 refresh had zero changed heads. This refresh therefore adds one
new branch head and one moved head, while preserving the prior 55 audited
heads. No changed command-centre or Vyakti branch requires re-audit.

## Targeted inspection of the new relevant branch

The new branch's tip commit adds a portable module at
`api/_group-runtime/checkpoints.js`, declarations, a local package manifest,
README, and deterministic `evals/turn-checkpoints/run.mjs` coverage. The module
is dependency-free and host-adapter based; it does not import a chat platform,
model provider, database, framework, or Vyakti configuration.

The reusable contract is an immutable, per-operation checkpoint around
source-backed effects:

1. Detach and freeze a nonempty operation scope and policy version before the
   first await.
2. Read validated authority, bind one detached source snapshot, and re-read in
   the order authority → sources → authority → sources immediately before an
   effect.
3. Canonicalize bounded JSON-like receipts so object-key order does not create
   false changes; reject accessors, cycles, unsupported values, oversized DTOs,
   and malformed snapshots.
4. Permanently invalidate the turn on any reader failure, authority/source
   mismatch, second source bind, missing source bind, or pending-check limit.
5. Return a deliberately limited `checkpointed` guarantee. The module does not
   claim a transaction, durable delivery ledger, exactly-once effect, atomic
   external send, or idempotency.

The branch README explicitly leaves policy freshness, tenant isolation, source
lineage/erasure, deadlines, persistence, and atomic commit fencing to the host.
The branch’s own research also specifies a future durable transport-event
contract (`prepared`, `executing`, `confirmed`, `not_executed`, `unknown`, and
`cancelled`) but does not implement it in this module.

## Moved cloning branch: bounded candidate ports

The moved branch is owner-controlled private code. Its branch pin is
`ebe16cc061f1db02b2ba2922a96e3dc3e033d07f`; the comparison base is the audited
`6d7d9bcd4f9c4c793e8db34b70ac03d874fe8d4a`. The branch contains no root
`LICENSE`/`COPYING` grant in the inspected lineage, and its private-voice
package is explicitly owner/internal. These are selective behavioral references,
not merge candidates.

| Candidate and pinned files | Evidence observed | v7 fit and decision |
| --- | --- | --- |
| Source/consent snapshot admission and authority recheck — `api/_private-voice-store.js`, `services/private-voice/store.mjs` | Candidate SQL locks source → replica → run, captures source/artifact/config/consent digests, rejects stale snapshots, requires active unexpired consent, and rechecks the same authority before run stages. Lease token, expiry and state are compare-and-set guarded. | Strong fit for a future durable Personal Voice/clone job because current `lib/voice/cloning/service.ts` persists enrollment status and checks provider bindings but has no queued synthesis run or staged output lease. **Port behavior selectively after Azure Personal Voice eligibility and a real SQL migration are proven; do not copy self-attestation/private schema.** |
| Multi-stage private voice worker — `services/private-voice/runtime.mjs` | Validates the source WAV hash/size/duration, rechecks run authority around provider work, binds model/reference/disclosure receipts, fences protected output, and settles only after sealed provenance and write-time authority. Failures after an external boundary become `unknown`; no automatic uncertain replay. | Useful lifecycle shape for cloned-voice synthesis and future Maya/Meera voice experiments. Current v7 public voice uses stock Azure/Gemini adapters and explicitly has no in-call cloned-voice adapter. **Defer runtime port until the provider path, consent, audio corpus and hosted worker are independently admitted.** |
| Allocation/supervisor child fence — `services/private-voice/lifecycle.mjs` | SQL binds a reserved allocation to one run, fixed plan/config/template/contract/source commitments, one-use child IDs and dispatch deadline; supervisor heartbeat and lease expiry gate consumption. `runTransaction` marks uncertain reservations rather than refunding an ambiguous started operation. | This is stronger than a generic in-memory checkpoint for provider cost and worker control, but current v7 already has deployment activation/session fences and metered Azure task reservations. **Reuse the one-use child/uncertain reservation pattern only where a new voice worker needs it; do not port Azure/private origins or plan defaults.** |
| Protected output provenance and erasure — `api/_provenance/private-voice-ledger.js`, `api/_private-voice-erasure.js`, `db/migrations/172_private_voice_run.sql` | Segmented output receipts are opened, appended, manifested, sealed or aborted under the same run authority. Cleanup requires terminal observation/resource release; migration uses deferred `NO ACTION` relationships so parent deletion cannot erase the cleanup ledger. | Directly relevant to biometric/audio retention and source revocation. Current v7 clone revocation deletes local bytes before provider deletion and records `revocation_pending`, but does not have this staged artifact ledger. **Port the retention/erasure invariants into the existing clone records only after schema and deletion proof; never transplant tables wholesale.** |
| Race/effect evaluation harness — `services/private-voice/runtime.test.mjs`, `evals/private-voice-test27/run.mjs`, `evals/private-voice-runtime.mjs` | Synthetic loopback tests cover provider failure, lost blob acknowledgement, ARM uncertainty, protection failure, source withdrawal before child consumption, lease replacement, grant expiry, replay refusal, cleanup and no automatic retry. They explicitly label results as synthetic, not voice-quality evidence. | High-value test design for v7’s Azure voice gateway and relational context effect boundary. **Adapt scenarios and assertions to current adapters; do not treat the branch’s `hindi_v3`/private provider receipts as current Azure evidence.** |

## Adoption decision for v7

The new portable checkpoint is a useful previously unported *generic* contract,
but the current v7 already has substantial SQL fencing. The relational port
(`docs/relational-source-port.md`) is a server-replayed, current-call derived
ledger: it accepts only approved relationship context, cites source IDs, and
rebuilds after edits or revocation. `lib/voice/tools/authority.ts` reloads and
checks contact-scoped memory/source status before context tools. Public voice
deployment code binds deployment revision, source digests, release/test state,
origin and connection authorization, and rechecks authority while a provider
connection is open (`docs/agent-deployments-v7.md`). `lib/delivery/engine.ts`
and `docs/integration-contracts.md` already provide durable idempotency,
compare-and-set reservation and `uncertain` outcomes for external delivery.

The moved cloning branch therefore does **not** establish that v7 lacks a
generic fence. Its stronger contribution is a specialized staged audio-run
fence: source/artifact/consent snapshot, worker lease, one-use provider child,
protected-output receipt and erasure horizon. The portable checkpoint can still
be considered for a small provider-neutral wrapper, but it must be reconciled
with these existing SQL fences rather than introduced as a parallel authority
system.

Recommended selective adaptation, subject to the v7 host’s actual SQL proof:

* Define a tenant/company/call scope and explicit policy revision in the shared
  conversation contract; pass only detached, bounded authority and source
  receipts into the checkpoint adapter.
* Re-read approved Company Brain and relationship-source revisions at the
  existing v7 provider/tool boundaries. For public voice, preserve deployment
  and session nonce fences; for private customer voice, preserve the issued
  relationship snapshot and current source checks; for delivery, preserve the
  durable intent and `uncertain` state machine.
* Preserve source IDs, speaker/addressee provenance, revocation state and the
  relational runtime’s current-call boundary in the host DTO. Do not copy the
  companion’s personal schema, identity model, or provider-specific fields.
* Keep the module’s `checkpointed` wording. For email, Telegram, WhatsApp, or
  other external effects, add the existing v7 storage authority’s own scoped
  idempotency and uncertain-outcome state before any delivery claim.

This is a contract-shape recommendation, not evidence of Azure endpoint
behavior, hosted authorization, production database fencing, external delivery,
or cloned-voice quality. The moved branch’s synthetic tests are useful for race
and cleanup behavior but were not run in this audit. The module remains
owner-controlled private code; the branch README states that
`private: true`/`UNLICENSED` does not grant an external license or publication
right.

## Port boundary and next action

Adopt only the small checkpoint kernel’s behavior and tests after comparing its
DTO limits, policy naming, and failure mapping with v7’s existing contracts.
Do not merge either changed branch. For the moved branch, the next useful port
is the bounded source/consent snapshot plus staged unknown/erasure test shape
around the existing Personal Voice record path; it must use v7’s organization
and owner fences and remain disabled until provider eligibility is confirmed.
For the new branch, wrap one review-first Company Brain or relational-voice
effect only if a concrete race remains after the existing SQL fences are
exercised. This audit does not port provider-specific runtimes, deployment
defaults or entire schemas; it identifies focused candidates for implementation.
