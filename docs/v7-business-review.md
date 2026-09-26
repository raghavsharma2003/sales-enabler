# Independent v7 business security and data-integrity review

Reviewed 27 September 2026. Scope: Telegram and WhatsApp automatic reply authority, Telegram activation, account recovery/verification, company settings, table intake, typed campaign answers, and the public/server conversation provenance boundary. Fixtures are fictional and SQLite is in memory. No live provider call, secret-value inspection, production build, or deployment was performed.

## Reproduced findings

1. **P1 — human off-ramp lost while deployment is paused.** `enqueueChannelIncoming` persisted a participant stop before resolving a published deployment, but did not persist an authenticated `/human` request at the same point. Reproduction: enqueue a normal message, pause, receive `/human`, republish, receive `Are you there?`, process the new job. Before correction, the new job made one mocked AI send. The channel owner fixed persistence of the human off-ramp; the independent regression now passes. The owned channel suite additionally covers explicit operator resume and replay behavior.

2. **P2 — unrelated negation reverses a boolean answer.** With an `Interested` boolean column and caller text `I am interested, but not ready.`, `supportedValue` used any negation anywhere in the quote to support `false`. Automatic extraction proposed false and `reviewCampaignResult` accepted it into a reviewed result. The typed-answer owner corrected predicate and clause validation; the independent regression now passes.

3. **P2 — numeric evidence can belong to another field.** With a `Budget` number column and caller text `I am 35 years old.`, automatic extraction proposed 35 and review accepted it. Matching one literal number establishes its spelling, not the field it answers. The review test exercises the full extraction/review path. The typed-answer owner added explicit field or question-context binding; the independent regression now passes.

4. **P2 — trailing uncertainty can be clipped away.** The full caller turn `My budget is 2500, maybe.` permitted the exact excerpt `My budget is 2500`, because `locateSource` checked omitted preceding modifiers only. `supportedValue` then accepted 2500 as definite. The typed-answer owner added full-turn validation; the independent regression now passes.

## Independent guards exercised

`tests/v7-business-review.test.ts` adds deterministic probes beyond ordinary happy-path tests:

- Completed Telegram human takeover, owner revocation, and participant stop immediately **before** the final send reservation each prevent provider dispatch.
- WhatsApp consent revocation immediately before that reservation prevents AI dispatch, including when the customer profile is first created by the revocation.
- A customer profile identity change between table preview validation and final commit rolls back every new intake row. This supplements existing manual-create and actor-revocation races.
- Client session creation rejects `channel_chat`, `public_chat`, and `public_voice` source claims.
- Auth mail/token/account namespace sentinels do not appear in workspace or platform projections.
- Another person's explicit budget cannot become the caller's accepted budget, and an omitted contradictory scalar answer blocks acceptance of the model's selected earlier answer. These two follow-up probes were added after the owner tightened the scalar rules and passed on first execution.

The final durable send reservation is the authorization linearization point. A change completed after that reservation, with no later awaited unchecked gate before dispatch, is an in-flight limitation rather than a new authorization defect. An initial test which injected revocation after the reservation was deliberately replaced with the meaningful pre-reservation test.

Static inspection found no additional concrete defect in reset-token hashing, encrypted mail storage, generic account responses, development-only private outbox use, owner-fenced company settings, source-backed table row application, or selected-public-knowledge channel grounding. This is bounded review evidence, not a claim of exhaustive security coverage. Existing recovery/company/intake tests passed in the scoped run; tests alone do not prove all potential failures absent.

## Verification record

Before fixes, the independent test file reproduced four material failures (the paused human off-ramp and three typed-meaning cases). The scoped command including auth lifecycle, company settings/logo, table intake, and the four v5 authority regressions produced **57 passing / 4 failing** tests; failures were exactly those four new reproductions. After corrections and adding the WhatsApp consent and two scalar follow-up probes, the final combined review command passed **22/22**: **13/13** independent v7 probes and **9/9** historical v5 authority/execution adversarial regressions. Command: `node --import tsx --test tests/v7-business-review.test.ts tests/v5-review-authority.test.ts tests/v5-review-execution.test.ts`. Root owns the final integrated gate and typecheck.

All application changes are owned by their implementing agents; this review added only its new test file and this report.
