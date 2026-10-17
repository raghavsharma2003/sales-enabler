# Harvest: hp-multimodal-groupai (html-portfolio, `codex/multimodal-layer-20260927`)

## Summary

This branch is the last Codex-driven checkpoint of the **Vyakti** line inside `html-portfolio`. Vyakti is the "human clone / replica" platform that grew out of Meera. The branch makes two moves.

1. **Multimodal evidence into claim extraction (27 Sep).** Source modality, format and locator metadata now reach the existing Human Experience Compiler claim extractor. Before this, document timestamps were invented as `0` by `Number(null)`, and transcript or document provenance was lost.
2. **Group AI layer (29 Sep to 1 Oct).** The branch hardens the multi-party bot path (Telegram groups, plus Discord and WhatsApp adapters) that sits behind one AI persona:
   - a portable "turn checkpoint" kernel
   - a portable attributed source-turn selector, with a frozen 48-case recall experiment
   - truthful delivery receipts, so the bot never reports `said:true` after a failed send
   - admission of group sources only after known consent boundaries, using original platform sent-time against consent and link instants inside SQL
   - a 44 px touch-target fix for claim review

The engineering is very defensive and very well documented. Every claim is tied to a hosted CI run ID and a SHA. However, the **product value is narrow and unproven**:
- No live provider call, live Telegram trial, owner/human study or deployment happened.
- Durable idempotency is still open: duplicate events produce duplicate model calls, sends and logs.
- Recall quality is a documented failure under adversarial distractors.
- Native identity linking and group UI do not exist.

For the command centre, the reusable value is in **patterns and small dependency-free modules**, not the product:
- the checkpointed authority kernel
- the delivery-outcome taxonomy (`not_executed` / `unknown`, `retrySafe:false`)
- the attributed bounded context packet
- the temporal consent fence for inbound channel messages
- the evidence-with-locator projection
- the offline research-registry checker
- the preregistered frozen-eval methodology

The highest-value content is the rejection list.

Tip of branch: `b514595f` (2026-10-01 22:37 +0530, docs-only). Tested code hash: `808ad32f`.

## Branches covered

| Branch | Tip date | Relationship |
|---|---|---|
| `origin/codex/multimodal-layer-20260927` | 2026-10-01 | 1,062 commits ahead of `origin/main` (main tip 2026-08-25), 0 behind. It is **19 commits ahead** of `origin/codex/private-voice-requests25` and of `origin/codex/vyakti-azure-authmail-oct10` (those two are 219/260 commits ahead of it respectively, so they diverged later). It is also 19 ahead of `codex/handoff206` (its stated base `20263775`). |

The 19 unique commits fall into these groups:

- **`ba3169cb` to `54a4d795` (27–29 Sep):** multimodal claim evidence, a bounded research-cycle tool, and release-blocker repairs. The repairs are mostly eval fixtures: stale pins, a Node 24 `IncomingMessage.signal` behaviour change, a compiler host-clock bug, and a GPU export authority gap. They end with green 24/24 release checks on Node 22 and 24 at `4cc5e662`.
- **`6718bc24` (29 Sep):** Honcho adoption research (docs only).
- **`3510afa8` to `b514595f` (30 Sep to 1 Oct):** the Group AI layer:
  - authority and source review
  - portable checkpoints (`3e036e7d`)
  - attributed source selection with the recall experiment (`34da5259`)
  - confirmed adapter receipts (`35e9ee89`)
  - 44 px review targets (`8ad3af26`)
  - known-consent admission (`af17fbca`)
  - test synchronisation fixes
  - final docs

The diff against the base is 104 files, +21k/−7k. About 14k of the churn is `context/graph.json` and most of the rest is evals and docs. The application changes are concentrated in:

- `api/_surface.js` (+400)
- `api/_room.js` (+231)
- `api/tg.js` (+93)
- `api/_person-model.js` (+111)
- new `api/_group-*` modules
- `api/_experience-compiler/claim-evidence.js`
- `src/studio/sourceAwareReview.ts` and `PersonModelStudio.tsx`

## Product

Vyakti lets a creator build an AI replica of themselves from owned sources: text, documents, audio and video transcripts, and images that are stored but **not** interpreted. Claims are extracted with citations, the owner explicitly accepts, rejects or supersedes them, and the replica then serves:
- private "Rooms" (follower 1:1)
- "Meet"
- common-friend **groups** on Telegram, Discord and WhatsApp

Real state on this branch:

**Multimodal:** this is evidence-metadata plumbing only.
- Text and document evidence keep UTF-16 character coordinates, with `page_mapping: "unavailable"`.
- Audio and video carry transcript timings plus a `machine_transcription` limitation.
- Image geometry is refused as semantic evidence.
- Claim schema v2 is kept and the prompt moves to v3.
- The three owner-facing UX gaps were audited but only partly addressed: carrying Context Locker selection into Evolve, and showing modality/locator in claim preview. The branch adds `sourceAwareReview.ts` plus a CSS display projection.

**Group AI:** the software contract is accepted at automated scope: 24/24 CI, 50-group synthetic Postgres and APK all pass. The following remain explicitly open:
- durable transport dedup and effects
- dependency-safe forgetting
- explicit sharing grants
- native web-to-Telegram identity link
- native group UI
- group media
- any live consented group task

The owner never answered two questions: the replay/retention policy (24h or 48h) and the live trial budget.

## Architecture & stack

- **Server:** plain JS ESM under `api/` (Vercel functions).
  - `api/_surface.js` is the channel-agnostic surface dispatcher (`onGroupMessage`, `onDirectMessage`, `onCommand`, `deliver`, `makeCtx`).
  - The adapters `api/tg.js`, `api/discord.js` and `api/whatsapp.js` each export `render`, `send` and `parse`.
  - `api/_room.js` holds the SQL for group episodes, logs and membership.
  - `api/_group-audience.js` holds the Telegram audience witness.
- **Data:** Postgres (Neon, plus Supabase auth for web users). Tables: `vy_group`, `vy_group_member` (`linked_at`, `left_at`, quiet level), `vy_surface_identity`, `vy_account_person`, `meera_log`, episodes and participants.
- **Models:** Azure AI Foundry, through `api/_azure.js`, `api/_model-serving-policy.js` and `api/_provider-budget.js`. The provider budget uses `reserveFoundrySpend` / `beginFoundrySpend` / `markFoundrySpendUncertain` / `settleFoundrySpend`, which is a spend-reservation ledger around every paid call. Claim extraction (`api/_replica-claims.js`) goes through that budget path.
- **Client:** React and TypeScript Studio (`src/studio/*`), Capacitor Android APK.
- **CI:** `.github/workflows/release-gate.yml`, which runs 24 checks on Node 22 and 24: layout, performance, eval registry, Room doors, accessibility and security. The other workflows are:
  - `group-authority.yml` (keyless synthetic `postgres:16.15-bookworm` service running real SQL semantics)
  - `build-apk.yml`
  - `consolidate.yml`, `culture.yml`, `drift.yml` and `deploy-web.yml`
- **Evals:** `evals/run.mjs` is the registry runner, with a network-blocking preload; offline fixtures substitute the DB, model and transport.

## Reusable assets

| Asset | Paths | Maturity | Reuse for | Effort |
|---|---|---|---|---|
| Portable turn-checkpoint kernel: binds scope, policy version, authority snapshot and source snapshot, then re-reads authority→sources→authority→sources before each effect. Sticky invalidation, frozen canonical DTOs, no deps | `api/_group-runtime/checkpoints.js`, `checkpoints.d.ts`, `README.md`, `evals/turn-checkpoints/run.mjs` | tested (39 unit groups, 86 caller groups, hosted CI) | orchestration, safety, auth-tenancy, chat-agent | drop-in |
| Attributed source-turn selector: bounded context packet, latest 20 mandatory plus up to 12 older, 32 KiB serialized cap counted on actual UTF-8 after JSON escaping, exact text/span/speaker/episode preservation, content-free typed errors | `api/_group-recall/selection.js`, `.d.ts`, `README.md`, `evals/source-turn-selection/run.mjs` | tested (relevance is weak, see measurements) | chat-agent, company-brain, omnichannel, memory-learning | drop-in |
| Frozen preregistered recall eval: 48 cases = 8 families × EN/HI/code-switch × 2 variants, with corpus hash freeze before selector inspection and adversarial distractor variant | `evals/group-source-recall/cases.mjs`, `run.mjs`, `docs/gurukul/research/GROUP-SOURCE-RECALL-EVAL-20261001.md` | tested | eval-quality, company-brain | adapt |
| Truthful delivery outcome contract: `deliver()` pre-validates the whole render, requires an explicit `{ok:true}` adapter receipt per fragment, and stops at the first failure. Errors are typed `surface_delivery_unconfirmed` with `outcome: not_executed|unknown`, fragment counts and `retrySafe:false` | `api/_surface.js` (`deliver`, `sendAccepted`, `deliveryUnconfirmed`), `evals/surface-delivery/run.mjs` | tested (44 controls) | omnichannel, campaigns, voice-agent, chat-agent | adapt |
| Delivery-durability design: outbox and idempotent-consumer states `prepared/executing/confirmed/not_executed/unknown/cancelled`, plus the adapter receipt audit for Telegram, Discord and WhatsApp | `docs/gurukul/research/GROUP-DELIVERY-DURABILITY-20261001.md` | stub (design only) | omnichannel, campaigns, orchestration | idea-only |
| Known-consent temporal admission: an inbound message's platform sent-time must be strictly later than group consent and every recipient's link time. Checked in JS and repeated inside `INSERT ... SELECT` | `api/_group-source-event.js`, `api/_room.js` (`openOrExtendGroupEpisode`, `logRoomTurn`), `api/tg.js` `parse`, `evals/group-source-event/run.mjs`, `evals/group-sql-authority/*` | tested (synthetic PG, 50 groups) | omnichannel, safety, crm | adapt |
| Telegram group audience witness: bot/admin, private unlinked chats only, count plus per-member verification, revalidated before egress | `api/_group-audience.js`, `evals/group-audience/run.mjs` | tested | omnichannel, safety | adapt |
| Multimodal claim-evidence projection: normalises evidence rows (text, document, audio, video, image) with locators, transcript timing and limitations. Refuses image geometry as meaning, fails closed on partial metadata | `api/_experience-compiler/claim-evidence.js`, `evals/multimodal-claim-evidence/run.mjs` | tested (19 checks, offline) | company-brain, memory-learning, content-gen | adapt |
| Source-aware claim review display projection (TS): strict citation DTO validation and a modality-specific limitations list | `src/studio/sourceAwareReview.ts`, `src/studio/source-aware-review.css`, `evals/source-aware-review-ui/*` | tested (mounted UI, 44 px targets) | design-ui, company-brain | adapt |
| Offline research registry and review queue: sources and experiments with review intervals (docs 14d, papers 90d), separate state/outcome fields, display-only commands, no fetching | `scripts/research-cycle.mjs`, `docs/gurukul/research/registry.json`, `evals/research-cycle/run.mjs` | tested | eval-quality, orchestration | drop-in |
| Synthetic-Postgres CI job: keyless, GitHub-hosted, real SQL semantics without touching prod | `.github/workflows/group-authority.yml`, `evals/group-sql-authority/harness.mjs` | production (in CI) | infra-ops, eval-quality | adapt |
| Foundry spend-reservation ledger: reserve, begin, mark uncertain, settle or release around every paid call (pre-existing; used here) | `api/_provider-budget.js` | production | orchestration, infra-ops, analytics | adapt |
| Honcho / memory-system adoption analysis: observer-subject perspectives, explicit vs inferred facts, read-set receipts, dependency-aware retraction | `docs/gurukul/research/HONCHO-ADOPTION-20260929.md`, `PORTABLE-GROUP-LAYER-20261001.md` | stub (research) | company-brain, memory-learning | idea-only |

## Measured lessons

1. **Lexical recall fails under distractors.** Frozen 48-case offline selection, 2026-10-01, Node 24.13.0:
   - Recency recovers 0/54 older targets. Lexical-recency recovers 27/54.
   - All 27 hits are in the explicit-wording variant. **On all 24 adversarial cases lexical recovers 0/27 and picks 12 irrelevant catalogue entries per case (288 total).**
   - Both arms keep 960/960 mandatory recent sources and 3/3 corrections.
   - Packet size is 8.0–17.7 KB, well under the 32 KiB cap, so the misses come from rank, not budget.
   - Decision: keep recency as the default, with lexical behind a server-only `GROUP_SOURCE_RECALL_MODE` opt-in.
2. **Duplicate replay and false success were measured.** Baseline `34da5259`, actual production modules with I/O doubles:
   - Dispatching the same group event twice gave two model calls, two sends, two episodes and four logs.
   - A send returning `{ok:false}` still produced `said:true` and an assistant log.
   - A fragment-1 failure followed by a fragment-2 success returned `ok:true`.
   - The false-success cases are fixed in `35e9ee89`. Duplicate replay is **not fixed**.
3. **Prompt-segment truncation can hide inside a byte cap.** A 65,000-char ASCII core fits a 96 KiB complete-input limit but exceeds the real 64,000-char core slice. A per-segment refusal is required.
   - The opposite failure was also found: full compiler serialization double-counted unused system text (111,236 bytes against 55,541 bytes for the consumed envelope) and refused ordinary replies.
4. **A mutable destination after an await is a real defect.** Authorization captured one destination, but a later send could read a changed event, context, adapter or room. Fix: snapshot all inputs before the first await and freeze the default send method's receiver. Found by independent review on 2026-10-01.
5. **PostgreSQL timestamp wire formats differ.** A top-level timestamp can arrive as `+00` while nested JSON uses `+00:00`. A parser that accepted only colon offsets would reject legitimate values. Found by root review on 2026-10-01 and proved in synthetic PG case 31.
6. **Node 24.21 changed `IncomingMessage.signal`.** A completed request now stays live after message close. A fixture that assumed the old abort-on-close behaviour returned HTTP 500 and looked like a provider failure. Found 2026-09-27 by comparing Node source v24.18.1 with v24.21.0.
7. **Compiler host-clock bug.** The T2 stage ignored `input.nowMs`, so a replay silently aged "fresh" rupture labels. Fixed by passing one clock throughout.
8. **Touch targets.** The claim review actions measured about 27 px. After the fix, all eight synthetic viewport/action targets measure 44 px, and a regressed 27 px negative control is detected. This was hosted Playwright at 390 and 1440 px, 2026-10-01.
9. **CI went 55 → 3 → 0 failing suites** across `ba3169cb`, `0fdbf7d1` and `4cc5e662`. Nearly all failures were missing prerequisites (Chromium, built fixtures, historical git objects) or stale fixtures, not product regressions.

## Rejected/failed approaches

- **Porting the archived GroupAI runtime and its context graph wholesale.** It would duplicate authority while leaving the actual metadata loss unfixed. They chose an additive projection instead.
- **Bumping the claim schema version just to describe modality.** Version-based batch identity would requeue already consumed work. Only the prompt version moved (v3).
- **Treating image dimensions or regions as meaning.** Refused. Captions are not perception either.
- **Promoting lexical recall on a pooled gain.** It fails every adversarial case. Tuning weights against the frozen answers was explicitly forbidden; a new hypothesis must use fresh held-out cases.
- **Counting only text bytes, or only the inner object, for budget.** Metadata, JSON double escaping and wrappers must count. Silently dropping mandatory recent context to fit is rejected; refuse instead.
- **Reporting delivery success from an attempted send or a model response.** A throw, timeout or malformed receipt is `unknown`, never `not_executed`. No automatic retry after ambiguous dispatch.
- **Inventing mandatory remote message IDs.** Web collectors legitimately return only `{ok:true}`, and the observable concept is "adapter-reported acceptance".
- **Using arrival time or `edit_date` instead of the original sent time.** A delayed message could then look later than a consent boundary it predates. A JS check alone is also insufficient; the predicate must repeat inside the SQL write.
- **Using creator ownership or a private Room session as group-member authority.** A verified web account is not proof that it is linked to a Telegram account.
- **Honcho as a dependency.** Reasons:
  - The server is AGPL. The hosted privacy policy allows de-identified fine-tuning and does not guarantee Azure-only processing.
  - Session deletion leaves derived conclusions in place.
  - Retrieval scopes are not ACLs, and a quiet queue is not a freshness barrier.
  - Vendor benchmark numbers do not transfer.
- **Restate.** Its server licence is BSL 1.1. Temporal, SpiceDB and OpenFGA are cited as patterns only.
- **Green CI as product readiness.** Repeatedly rejected: skipped `NEON_URL` gates are not passes, an APK is not a deployment, and a docs-commit hash is not the tested hash.
- **Weakening failing tests or authority to get green.** No longer timeouts, token allowlists, deleted assertions or fetch monkeypatching. Each failure was diagnosed causally.

## Risks/landmines

- **Process overhead is extreme.** Codex spent most of 1 October on fixture races and receipt bookkeeping. `context/graph.json` is about 31k lines (14k changed). The docs are dense hedging prose. Do not import this governance style wholesale into sales-enabler: the evidence discipline is good, but the cost-to-feature ratio was poor.
- **The modules are marked `UNLICENSED` and private** (`@vyakti/turn-checkpoints`, `@vyakti/source-turn-selection`). The owner is the same person, so internal reuse is fine, but the manifests and names need changing.
- **Group AI has no idempotency.** Duplicate webhooks give duplicate LLM spend and duplicate sends. Any campaign or omnichannel engine built on this pattern must add the outbox and dedup first.
- **The checkpoint kernel is not atomic.** There is still a race window between `assertCurrent()` and an external send. It is fine for authorization hygiene, but it is not a transaction.
- **Ordering problem in command dispatch.** Group commands (`/chup`, `/bolo`) were dispatched before the turn guard in the audited source.
- **Supabase auth.** Web identity relies on Supabase auth (`api/_auth.js`). That conflicts with an Azure/Neon-only target and would need to move to Entra ID or Neon Auth.
- **Most evidence is offline or synthetic.** Nothing proves live Telegram behaviour, model quality or owner usefulness.

## Azure dependencies

- **Azure AI Foundry model serving.** Claim extraction runs through `api/_azure.js` and `api/_model-serving-policy.js`, with Foundry spend reservation in `api/_provider-budget.js`. On this branch it was exercised only with mocked responses.
- **Other Azure modules** exist in the tree: `api/_azure-surface-reply.js`, `api/_embed.js` and `api/_lanes.js`. Incident and observer code refers to ARM, but on this branch it is tested with doubles only.
- **Non-Azure dependencies on this branch:**
  - Telegram, Discord and WhatsApp Bot APIs
  - Supabase auth
  - Neon Postgres (allowed)
  - GitHub Actions synthetic Postgres
  - Vercel hosting

No Azure resources were touched by this harvest.

## Recommendation for sales-enabler

Reuse these first:

1. **Omnichannel outbound and inbound.** Take the `deliver()`/`sendAccepted` receipt contract (`not_executed` / `unknown`, `retrySafe:false`, stop at the first failed fragment). Implement the designed but unbuilt outbox state machine (`prepared → executing → confirmed | not_executed | unknown | cancelled`) keyed by an immutable transport-event ID plus payload hash. Do this before any campaign sender exists, because duplicate replay is the measured failure. Reuse the shared paragraph/line/space splitter used by adapter `render()`.
2. **Orchestration and safety.** Drop `checkpoints.js` in as the "authority re-check before effect" primitive for agent actions. Examples: before sending an email or WhatsApp, before writing CRM changes, before a voice agent discloses data. Keep tenant, policy and source binding per turn.
3. **Chat and voice agents, plus the company brain.** Use `selection.js` as the attributed bounded-context packager, with exact UTF-8 byte accounting and refusal rather than truncation. **Do not rely on its lexical mode for retrieval.** Pair it with a proper Azure embedding or semantic retriever and evaluate with a frozen, preregistered corpus modelled on `evals/group-source-recall`, including adversarial distractor variants.
4. **Inbound lead and conversation ingestion.** Port the temporal consent fence: compare platform sent-time with consent and opt-in instants, repeated inside the SQL write. It maps directly onto DPDP/GDPR-style opt-in for WhatsApp and email leads.
5. **Company brain.** Use the claim-evidence projection pattern: every fact carries source ID, modality, locator and limitations, and is explicitly accepted by a human before use. Also use the Honcho research takeaways: separate explicit from inferred facts, keep read-set receipts apart from citations, and make retraction dependency-aware.
6. **Eval and infrastructure.** Copy `scripts/research-cycle.mjs` (research registry with review cadence) and the keyless synthetic-Postgres CI job pattern.

Do **not** port the Vyakti group product, its context-graph bureaucracy or its Supabase auth. Rebuild on Azure Container Apps with Entra/Neon auth.
