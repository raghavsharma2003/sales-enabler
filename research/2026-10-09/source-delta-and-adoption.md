# Source branch delta and adoption audit — 2026-10-09

Scope: read-only refresh of the three owned source clones already present under
`C:\Users\raghav.s\Documents\ChatGPT\company orchestration system\research-sources`,
comparison of every named remote head with `research/branch-inventory.json` and
the 2026-10-01 delta audit, and targeted content inspection of each moved ref.
The current inventory is `research/2026-10-09/branch-inventory.json`.

I ran `git ls-remote --heads origin` and then `git fetch --prune origin` in each
existing clone. No source checkout, merge, reset, edit, build, test, install,
provider call, Docker command, deployment, or cloud mutation was performed.

## Result

All 56 remote heads were hash-compared. There are no new or missing heads since
the 2026-10-01 audit and three existing heads moved. All three `Vyakti-GroupAI`
heads, including `codex/relational-core`, are byte-identical at their tips to the
prior audit.

| Repository | Heads on 2026-10-09 | New | Moved | Missing |
| --- | ---: | ---: | ---: | ---: |
| `raghavsharma2003/command_centre` | 21 | 0 | 1 | 0 |
| `raghavsharma2003/html-portfolio` | 32 | 0 | 2 | 0 |
| `raghavsharma2003/Vyakti-GroupAI` | 3 | 0 | 0 | 0 |
| **Total** | **56** | **0** | **3** | **0** |

Moved refs:

| Repository / branch | Previous audited tip | Current tip | Delta |
| --- | --- | --- | --- |
| `command_centre` / `claude/knl-deal-negotiation-tr6zdw` | `05ca8db19bfaf147a0e16e6ebd7565bafc2fec35` | `9890a4e10c23e3f6a3cfe0b890832a0f6c2daf36` | 12 commits; 859 → 866 tracked paths; 12 changed paths |
| `html-portfolio` / `claude/ai-companion-app-rkt1lv` | `f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21` | `11f213ae734e93527a5626a255e1b95cbc2064f9` | 2 commits; 1,128 → 1,134 tracked paths; 38 changed paths |
| `html-portfolio` / `codex/multimodal-layer-20260927` | `3e036e7db552b1cc802c2a42451787fc5791d4a` | `b514595f080d63cf5d252b85d2580d8e176c5d2b` | 10 commits; 3,221 → 3,243 tracked paths; 47 changed paths |

The unchanged 53 heads were ref-verified and inventoried, not re-reviewed. Their
content coverage remains the 2026-09-21 inventory and later dated audits.

## Adoption decisions

| Candidate | Evidence in moved ref | Current v7 comparison | Decision |
| --- | --- | --- | --- |
| Source-preserving attributed GroupAI history | `api/_group-recall/selection.js` emits exact human text with source, episode, speaker and order IDs; it keeps the current turn exactly once, separates stable speaker identity from the current display label, rejects malformed/oversized inputs, and binds the complete admitted pool rather than only selected rows. | `lib/platform/groups.ts` already filters approved evidence by every room participant and issues a snapshot. `lib/platform/group-turns.ts` rechecks that snapshot before commit and restricts history to the same audience epoch, but its model history contains participant/reply pairs without immutable source-turn IDs. | **Adopt the behavior selectively.** Add source-turn IDs and exact attribution to the existing GroupAI DTO, keeping the current snapshot and transaction fences. Do not add a parallel authorization system or copy the private package wholesale. |
| Whole-input byte budget | The group branch measures the serialized source packet in UTF-8 bytes, refuses required-context truncation, then checks the actual provider-relevant `core + tail + turns` envelope and provider segment caps immediately before dispatch. | Current GroupAI limits are 8,000/11,500 JavaScript characters and the capsule budget is 12,000 characters. Channel generation similarly checks character lengths. Hindi, escaped JSON and other multibyte input can therefore consume more transport bytes than the nominal limit. | **Highest-value near-term port.** Add a provider-neutral UTF-8 byte measurement around the already-authorized GroupAI and channel prompt envelopes. Preserve all safety text and refuse before provider slicing. Keep the existing smaller product limits unless measured usage justifies changing them. |
| Older-source lexical recall | Optional mode reads up to 160 candidates, keeps the latest 20, and adds up to 12 older lexical matches within a 32 KiB source-turn budget. | The branch's frozen comparison recovered 27/54 ordinary older targets but missed the older target in all 24 adversarial cases and selected 288 distractors. Current Company Brain already uses bounded RRF with exact citations; GroupAI uses recent same-snapshot turns. | **Do not enable or port the scorer.** Keep recency for room turns. If older GroupAI recall becomes necessary, evaluate it against correction/revocation and adversarial distractors using the current product corpus; Company Brain remains the grounded long-horizon route. |
| Group event-time admission | `api/_group-source-event.js`, `api/tg.js`, `_room.js`, and `_surface.js` capture original sent time before awaits, reject edited/ambiguous group event kinds, require the event to be strictly later than every current recipient's known consent/link boundary, and repeat the timestamp fence in SQL. | Current `lib/channel-agents/telegram.ts` deliberately accepts only private chats. `lib/channel-agents/service.ts` preserves provider time, authorization version and idempotent event identity, but has no real group-audience contract because group Telegram is unsupported. | **Required before enabling real channel groups.** Port the admission invariant only with verified platform identity, historical audience limitations stated, dedupe, erasure, and current deployment/connection fences. It is not needed for today's private Telegram path. |
| Confirmed external delivery receipt | The moved group branch validates all fragments before the first send and treats any missing adapter `ok:true` receipt as `unknown`, never replay-safe. | Current Telegram accepts only a matching message/chat receipt; WhatsApp/Telegram failures become `rejected` or `uncertain`; channel jobs in `sending` or `uncertain` are never automatically retried. Current sends are single-message, so fragment prevalidation is not yet relevant. | **Equivalent behavior is already present.** Retain current durable states. Reuse the fragment preflight only if multi-part channel rendering is introduced. |
| Raw-human text separation for relational/emotional logic | Group source JSON is model context, while `humanSourceTexts` separately feeds vocabulary/honesty checks; metadata, labels and IDs cannot masquerade as a person's words. | Current channel relational state is compiled from explicit user/assistant transcript fields. GroupAI does not yet feed source packets into the RelationalOS/EmotionalOS path. | **Adopt as a boundary rule.** If GroupAI sources later drive relational or emotional cues, pass exact authorized human text separately from metadata and model packets. Never infer a speaker's emotion, vocabulary, consent or commitment from source labels or JSON keys. |
| Central companion entry gate | `src/engine/gate.ts` and `api/_gate.js` add a shared entry-word token across the companion's browser/API surfaces. | v7 already has accountable user authentication, organization membership, same-origin mutation checks and deployment authorization. A shared word would weaken attribution. | **Reject for v7.** |
| Memory-consent writer seam and deletion-intent guard | `src/engine/memory.ts` centralizes durable memory-write refusal; `src/engine/brain.ts` verifies a model-produced forget marker against recent user words before deletion and removes any false deletion claim. | v7 learning creates review proposals and cannot automatically approve memory or delete it. No model-produced forget marker reaches a destructive memory action. Customer/contact consent is rechecked at action boundaries. | Keep the **principle**, with no current code port. If natural-language deletion is added, require deterministic user-intent evidence, a scoped preview/receipt and an explicit destructive boundary; never authorize deletion from model output alone. |
| Generic manual data-request workbook | `scripts/generate-knl-cbam-workbook.py` demonstrates progressive monthly collection, explicit “who fills” ownership, protected formula cells, validation lists, examples, document status and clarification sheets. | Current ingestion accepts bounded documents/CSV and requires exact-quote review. It does not generate a domain-specific data-request workbook, and active data-intake work in the shared worktree was outside this audit. | **Product-pattern candidate only.** A future configurable intake-template export could reuse the ownership, validation, example and completeness cues. Do not copy client/CBAM fields, embedded identities, formulas, or private artifacts into the general product. Imported results must still pass the existing immutable-source, identity-column and exact-quote review. |

## Maya, Meera, RelationalOS and EmotionalOS

The moved `claude/ai-companion-app-rkt1lv` ref is mainly an access gate plus a
memory-consent and false-forget repair. It does not add a better provider,
voice engine, emotional model or relational state machine. Its only relevant
relational change makes time-dependent rendering accept the compiler's pinned
clock so fixtures do not change as wall time advances. The v7 relational port
does not render those companion age labels and already uses deterministic
inputs in its ported hysteresis checks, so there is no missing runtime feature
to copy.

The useful cross-cutting lesson is destructive authority: a model marker must
never delete memory, and a generated claim must never say deletion happened,
unless user intent and the resulting receipt are independently established.
This remains a future requirement rather than a present v7 gap.

No `Vyakti-GroupAI` tip moved. The existing pinned `codex/relational-core` tip
remains `4bae159631ca3f18da0ede48596f593a55b6728c`; the local GroupAI capsule and
turn service already adapt its audience, snapshot and durable request patterns.
The new multimodal branch builds on that foundation but does not supersede it.

## Ingestion and learning comparison

No moved source branch adds a new general ingestion or reviewed-learning
engine. The CommandCentre delta adds a client-specific workbook generator; it
is a collection UX reference, not an ingestion authority or learning system.

Current `lib/ingestion/engine.ts` already provides the stronger reusable
boundary: immutable source digest, stable blocks, exact quote and absolute span,
bounded untrusted-data extraction, personal-record scope guard, operator review,
catalog concurrency fence, and transactional source recheck. Current
`lib/learning/engine.ts` binds analysis to a saved tenant session, exact caller
quote and digest; `lib/learning-jobs/engine.ts` freezes deployment opt-in and
rechecks owner, release, source and claim authority around metered inference.
Neither path automatically approves memory, sends a follow-up, changes a prompt
or turns anonymous/channel evidence into private customer memory.

The source-selection branch matters only if a future group conversation becomes
an input to learning. At that point the learning job should bind the full
authorized candidate pool and selected source IDs, keep raw human text separate
from attribution metadata, and cancel on audience/source changes. It should not
treat selection as a citation, consensus, current truth or permission to promote
memory.

## Exact inspection boundary

Source ref ranges were enumerated with commit log, diff stat and
`git diff --name-status` across each moved range. Content inspection then used
the following exact paths at the stated current tips:

- `command_centre@9890a4e10c23e3f6a3cfe0b890832a0f6c2daf36`:
  `scripts/generate-knl-cbam-workbook.py`, `scripts/render-invoice.py`,
  `scripts/render-invoice-compact.py`, and `docs/invoice/README.md`.
  The workbook binary, client requirements note, supplier profile, signature
  asset and session-log content were excluded from substantive review.
- `html-portfolio@11f213ae734e93527a5626a255e1b95cbc2064f9`:
  `src/engine/gate.ts`, `api/_gate.js`, `src/engine/memory.ts`,
  `src/engine/brain.ts`, `api/memory.js`, `src/engine/compiler.ts`,
  `src/engine/relstate.ts`, `evals/forget/intent.mjs`, and `evals/gate.mjs`.
- `html-portfolio@b514595f080d63cf5d252b85d2580d8e176c5d2b`:
  `api/_group-recall/README.md`, `api/_group-recall/selection.js`,
  `api/_group-source-event.js`, `api/_room.js`, `api/_surface.js`, `api/tg.js`,
  `docs/gurukul/research/GROUP-SOURCE-RECALL-IMPLEMENTATION-20261001.md`, and
  `docs/gurukul/research/GROUP-SOURCE-EVENT-BOUNDARY-20261001.md`.

The adoption comparison was pinned to sales-enabler HEAD
`b459624e4b9a2c7b2462747404fae27fb3e2bb91` and these current files:
`lib/platform/groups.ts`, `lib/platform/group-turns.ts`,
`lib/channel-agents/telegram.ts`, `lib/channel-agents/service.ts`,
`lib/brain/retrieval.ts`, `lib/brain/answer.ts`, `lib/ingestion/engine.ts`,
`lib/learning/engine.ts`, `lib/learning-jobs/engine.ts`,
`lib/voice/relational-runtime/relstate.ts`,
`lib/voice/relational-runtime/index.ts`, `lib/voice/emotional.ts`, and their
dated source-port documentation. The shared worktree acquired unrelated active
changes during this audit; those changes were preserved and were not treated as
source-adoption evidence.

## Coverage gaps

- Source test bodies were not exhaustively reviewed and no source or current
  test/build was run. Hosted results quoted by branch documentation were not
  independently verified.
- The group source boundary establishes admission after known consent times,
  not historical membership, authenticated event time, concurrent erasure,
  atomic external delivery, answer correctness or live usefulness.
- The selector is owner-controlled private code marked `UNLICENSED`; this audit
  recommends behavioral adaptation inside the owner's product, not publication
  or redistribution of the package.
- No binary workbook, private customer artifact, credential, environment value,
  provider payload, live database, remote endpoint response or raw transcript
  was used as adoption evidence.
- Remote state may change after the 2026-10-09 `ls-remote` snapshot. The new
  inventory records exact tips, trees and tracked-path counts for repeatable
  comparison.

## Recommended order

1. Add UTF-8 byte accounting for the existing GroupAI and channel provider
   envelopes, with tests for Hindi and JSON escaping and without changing the
   current authority model.
2. Enrich GroupAI history with immutable turn/source IDs and explicit speaker
   attribution while keeping snapshot, audience epoch and commit rechecks.
3. Record the group event-time/consent rule as a launch gate for any future
   Telegram/WhatsApp group support; do not broaden today's private-chat parser.
4. Keep lexical older-source recall disabled. Evaluate a correction-aware,
   cited alternative only when real GroupAI tasks require long-horizon recall.
5. Treat the CommandCentre workbook as a future configurable intake-template
   pattern, downstream of the active data-intake work and upstream of the
   existing reviewed ingestion boundary.
