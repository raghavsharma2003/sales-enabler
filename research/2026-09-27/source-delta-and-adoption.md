# Source branch delta and adoption audit — 2026-09-27

Scope: a fresh read-only ref refresh of the three local source clones, followed by a targeted inspection of reusable contracts for the current v7 work: public deployment/session budget/proxy controls, channel-scoped memory, structured feedback and CSV mapping, compaction corrections, and voice endpointing. No source clone was checked out, merged, edited, built, tested, deployed, or connected to a provider. No key, secret, endpoint value, customer record, or provider configuration value is reproduced here.

## Ref delta since the 2026-09-21 inventory

I ran `git fetch --prune origin` in each source clone on 2026-09-27 and compared every named `origin/*` tip with `sales-enabler/research/branch-inventory.json` (`snapshot_date: 2026-09-21`). The symbolic `origin/HEAD` ref remains excluded.

| Repository | Current named heads | New heads | Moved existing heads | Current refs with a tip after the snapshot |
|---|---:|---:|---:|---:|
| `raghavsharma2003/command_centre` | 21 | 0 | 0 | 0 |
| `raghavsharma2003/html-portfolio` | 31 | 0 | 0 | 0 |
| `raghavsharma2003/Vyakti-GroupAI` | 3 | 0 | 0 | 0 |
| **Total** | **55** | **0** | **0** | **0** |

The two html tips dated 2026-09-21 (`origin/claude/vyakti-cloning-platform-aq05n4` at `6d7d9bcd4f9c4c793e8db34b70ac03d874fe8d4a` and `origin/codex/private-voice-requests25` at `f02469564fb10a082bf34a94ff8619626f683879`) were already present in the 2026-09-21 inventory. The source set therefore contributes **zero new branch heads and zero new branch-tip mechanism deltas** in this refresh. The adoption notes below point to existing best code that is directly useful to v7; they are not presented as newly discovered commits.

Reference anchors used below:

* command centre `origin/main` — `c8fd321407d7b628b7e79d105887b6a182760100`; security hardening comparison branch `origin/claude/context-project-review-0x0i6g` — `d288e75c14dce50150f9787149a79e5fe4bd271c`.
* html portfolio `origin/main` — `3a9217981b27636745fc70ac490aacf9ef3f392d`; recent private voice checkpoint `origin/codex/private-voice-requests25` — `f02469564fb10a082bf34a94ff8619626f683879`.
* Vyakti-GroupAI `origin/codex/relational-core` — `4bae159631ca3f18da0ede48596f593a55b6728c`; consolidated clone branch `origin/claude/vyakti-cloning-platform-aq05n4` — `451de5a6a7017dc76eaac69fe551203dc94753d2`.

## Three adoptable findings for v7

### 1. Make public deployment, route auth, and context budgets one observable contract

The command centre `origin/main` proxy is a useful public/private boundary: `proxy.ts:20-39` defines the small public path set, `proxy.ts:41-53` hides the private CRM on PDF-only hosts, and `proxy.ts:75-92` requires the app cookie for non-public production paths while returning JSON 401s for API requests. `lib/required-env.ts:17-27` centralizes required deployment inputs, and `lib/required-env.ts:47-79` reports presence, length and a short fingerprint for secrets without returning their values. These are concrete patterns for the v7 public Azure voice WebSocket, Telegram, WhatsApp, and typed-answer routes: public callbacks should have a narrow allowlist, private surfaces should fail closed, and deployment readiness should be read back as redacted status rather than inferred from a local `.env`.

The unmerged context-review tip contains one security correction worth porting by capability: its `proxy.ts` uses an exact `localhost`/`127.0.0.1` host regex and explicitly allows the provider-webhook prefix only because the webhook route verifies its own provider secret. The audited `origin/main` version uses `host.startsWith("localhost")` / `host.startsWith("127.")`; do not copy those loose checks into a public deployment. The branch is a broad operational/archive diff, so it is **not** a merge target.

The html portfolio has the complementary session-budget mechanism. At `api/chat.js:62-64`, the server proxy has a 64,000-character operational core cap; at `api/chat.js:153-200` it records core/tail byte counts, marks truncation, logs the condition, keeps the uncached tail bounded at 24,000, and rejects oversized message payloads. `scripts/check-prompt-budget.mjs:103-123` checks that the plain-JS proxy caps equal the compiler’s caps; the fixture checks at `scripts/check-prompt-budget.mjs:138-166` fail when a compiled prompt exceeds an operational cap or loses required blocks. This is a stronger contract for the current v7 session budget than a single model `max_tokens` value: carry a per-session budget, expose used/remaining/truncated state, and make server guard and compiler constants fail when they drift.

**Adoption:** extract the boundary shape (route allowlist, exact local-host check, redacted env readiness, session budget receipt and guard/compiler parity) into v7. Adapt names and tenant/session semantics. Do not copy the companion’s model ladder, deployment defaults, or provider URLs. No provider value was read or ported.

### 2. Preserve channel provenance and turn human review into typed evidence

The best existing channel-memory seam is html `origin/main` `src/engine/memory.ts:22-40`, where `wireChannel` maps a turn to `chat`, `call`, or `watch`, and `src/engine/memory.ts:91-121`, where `rememberFrom` sends role, channel and content together. The server enforces the same small enum at `api/memory.js:130-169`. This fixes a subtle but material failure mode: a watch/share turn silently becoming chat memory. More importantly for v7, `api/memory.js:1623-1649` keeps nodes derived only from ungated spoken turns out of durable memory when gated typed evidence also exists; the routine is immutable and fail-soft for old callers. Port the idea as a per-channel conversation key and provenance predicate, not as a personal-assistant memory schema: Telegram, WhatsApp, web, and voice should remain distinguishable until a reviewed merge policy says otherwise.

For structured CSV feedback, command centre `origin/main` already has the most immediately portable contract. `lib/import-reconciliation.ts:3-18` types candidate matches and the `new`/`ambiguous`/matched outcomes; `lib/import-reconciliation.ts:76-147` normalizes company/domain/phone, emits ranked candidates, and refuses to select a lead when the top two scores are too close. `lib/import-review.ts:4-17` constrains reviewable update fields; `lib/import-review.ts:66-121` sanitizes and allowlists inserts; `lib/import-review.ts:124-153` builds a patch only from reviewed fields. The route at `app/api/import-review/route.ts:196-310` records the resolution, updates the audit row, closes its review task, and adjusts run counters. This is a useful mapped-CSV shape for importing applicants, sponsors, or company contacts: raw row, normalized row, candidate set, reviewer decision, field-level patch, actor, and audit receipt.

Vyakti-GroupAI adds a typed decision/evidence contract that should sit around v7 feedback and tool actions. At `packages/intervention-policy/src/types.ts:57-67`, identity, addressee, privacy, trigger, conversation, and a deterministic proposal are separate evidence fields. `types.ts:169-183` returns an ordered `DecisionTraceStep[]` with rule, outcome, code, and evidence. `policy.ts:127-165` fails closed on invalid identity/privacy; `policy.ts:232-251` requires requester identity and explicit authorization for actions. The Context Capsule schema at `packages/context-capsule/src/schema.ts:49-63` requires at least one source citation, while `schema.ts:116-141` makes budget and dropped-block reasons explicit. This maps cleanly to structured feedback: a human correction should carry source turn, field, old/new value, reviewer identity, authorization, and a deterministic outcome code; a model suggestion should not become durable memory just because it scored highly.

**Adoption:** use the channel contract and review/audit objects as v7 database/API types. Use the Vyakti decision trace for typed answer approval, outbound message approval, and memory correction. Keep customer/tenant/case identifiers in every key. Do not wholesale transplant `meera_log`, the personal relationship tables, or the companion’s phone-specific fields.

### 3. Use whole-block compaction and a real uplink endpointing harness

The html compiler records the correction that matters for automatic compaction. `src/engine/compiler.ts:1188-1225` models each context block with an id, priority and text, keeps `priority: "never"` blocks even when over cap, and removes complete lower-priority blocks one at a time. It never slices a block to fit. The companion’s row-level version at `src/engine/compiler.ts:366-390` drops oldest complete commitment rows. `evals/chattail/run.mjs:310-340` tests that rows remain intact under the worst-case budget, and `scripts/check-prompt-budget.mjs:103-166` checks proxy/compiler parity and required blocks. The consolidation reader at `api/consolidate.js:1597-1610` also excludes `superseded_by` episodes, so a compacted summary cannot be treated as fresh ground truth.

For v7, the portable contract is an included/dropped manifest with block id, priority, token/byte count, source hash, and a reason such as `insufficient_remaining_budget`; never truncate a JSON schema, authorization clause, tool contract, or user correction in the middle. Keep a separate “superseded” state for replaced context, and exclude it from retrieval unless an audit view explicitly asks for history. The Vyakti capsule’s `DroppedBlockReason` and `CapsuleManifest` (`packages/context-capsule/src/schema.ts:124-173`) are a good typed shape for this receipt.

The strongest existing voice endpointing harness is html `origin/main` `evals/echosim/stucksim.mjs:16-119`. It drives the real `src/voice/liveCall.ts` through `evals/echosim/run.mjs`, measures `uplinkTrace` bytes observed at the socket, reproduces a loud-room failure, requires a watchdog to force real silence, then runs a quiet-room false-positive arm. `evals/echosim/endpoint.mjs:1-31` is a useful measurement sweep for maximum frame gaps under backlog/coupling, but it only prints a table and is not a release gate. The production mechanism exposes the relevant constants in `src/voice/liveCall.ts:160-204` and emits a `stuck_endpoint` event around `src/voice/liveCall.ts:1814-1826`.

**Adoption:** build an Azure WebSocket equivalent of the stuck-room test before claiming endpointing is handled. Assert bytes on the actual uplink, turn-end/forced-silence events, no forced endpoint in a quiet control, barge-in interruption latency, and behavior under backlog. Treat the existing echosim as a harness pattern; it is not evidence for Azure, telephony, Hindi/Hinglish, or WhatsApp audio until the adapter and corpus are changed.

## What remains unported or unsuitable for direct lift

* The ref refresh found no new heads or new tip mechanisms. The recent voice branches are already represented in the September 21 ledgers; repeating their larger voice-cloning claims would add no delta.
* None of these source observations proves a current public deployment, live database schema, provider quota, Azure model availability, endpoint latency, Indian-language quality, or production security posture. Existing authored tests show test intent and contract shape; they were not run in this audit.
* `claude/context-project-review-0x0i6g` has useful security corrections but also broad archival/deletion and documentation changes. Port small functions and tests only after comparing them to v7’s auth model.
* The html voice harness is coupled to a Google live-call implementation and synthetic audio. It does not establish Azure Voice Live behavior, telephony 8 kHz behavior, or a production endpointing SLO.
* The source clones contain no root `LICENSE` or `COPYING` file (all three package manifests are private/internal). Treat these code and docs as owner-controlled material pending explicit reuse permission. Preserve any third-party notices when copying a dependency-derived snippet; no third-party dependency license was assessed here.
* No source secrets, provider keys, deployment names, or configuration values were read into this memo. The only deployment material recommended is the contract shape: redacted readiness, narrow public routes, bounded session budgets, provenance, and auditable decisions.

## Recommended port order for the current v7 agents

1. Add the exact-host proxy check, public route allowlist, and redacted deployment-readiness receipt before exposing the public Azure WebSocket and messaging callbacks.
2. Add per-channel message provenance and the session budget/compaction manifest to the shared conversation contract; make the compiler and server guard share an asserted cap.
3. Add the mapped-CSV review/audit schema and typed decision traces before durable feedback or memory correction.
4. Adapt `stucksim.mjs` to Azure WebSocket frames and run it as a deterministic no-provider unit harness before relying on endpointing in a live call.
