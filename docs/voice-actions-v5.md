# Bounded in-call tools

Implemented 22 September 2026. These tools serve **operator-authenticated internal browser calls**. Selecting a customer provides a scoped record binding; it does not verify the identity of a person speaking or typing. Telephone calls, public customer authentication, external notifications, booking and live human transfer are not implemented by these tools.

## Tools and outcomes

`lib/voice/tools/contracts.ts` exports the same provider-neutral names and JSON schemas for Azure and Gemini. Configuration defaults to no enabled tools. The server accepts only the configured subset captured when the call was issued.

| Tool | Model arguments | Result |
| --- | --- | --- |
| `search_company_knowledge` | `query`, 1–500 characters | `available` with at most three exact, offset-cited source excerpts, or `not_available` |
| `recall_customer_context` | Empty object | `available` with approved, scoped relationship cues/open commitments, or `not_available` |
| `request_follow_up` | `kind`: `follow_up` or `human_handoff`; `summary`, 1–1,000 characters | `awaiting_review` with a durable internal action ID |

Unknown properties are rejected. Models cannot supply customer IDs, destinations, URLs, consent, releases, source IDs or tool permissions. Source content and model arguments remain untrusted data. Search is bounded lexical retrieval over selected call sources, not a claim to have searched every company record. Long company sources return excerpts that may omit conditions; the result explicitly warns against inferring a complete policy. Relationship recall returns complete small approved entries and skips oversized entries.

`awaiting_review` means a proposal is saved. It never means a booking, notification, message, call transfer or external operation succeeded. An unknown customer can have an internal operator proposal; no customer record is inferred. Draft proposals have a “Draft test” title and `internal_draft_test` provenance.

## Connection integration

The connect route must call `buildVoiceToolAuthority(user, compiledContext, contactId)` after validating the draft or released context and before provisioning the provider. It stores the returned value as `toolAuthority` in the server-created `voice_preview` or `voice_connection` record, alongside `requestedBy`, `contactId`, `contextDigest` and existing context fields. The browser receives only the issued ID and `enabledTools`, not authority supplied by the model. Legacy connections without this object cannot use tools.

The helper freezes enabled tools, approved source IDs and source fingerprints, memory scope, customer binding and a thirty-minute expiry. Source anchors include only the selected knowledge and relationship sources in the compiled call context. Source content is retrieved from the workspace database, never from caller-provided URLs.

`POST /api/voice/tools` accepts exactly one of `connectionId` or `previewId`, plus `requestId`, `name` and `arguments`. The runtime generates a stable request ID for each provider tool call and reuses it on retry. Valid IDs contain 1–180 ASCII letters, numbers, underscores, dots, colons or hyphens and begin with a letter or number. The provider's model arguments are never allowed to set the issued connection ID.

The route requires the current authenticated operator, the same workspace and the same origin. Every invocation, including a cached result, checks the issuing operator, enabled tool, expiry, call end marker, active release, current customer opt-out state, current browser-voice consent, source fingerprints and (when present) active campaign recipient. If a customer is bound, missing or withdrawn `browser_voice` consent returns `not_available`, even in a draft test. Calls without a customer can search their selected company sources but cannot recall a customer's context.

Operator authority is re-read from persisted active workspace membership rather than a request-start role snapshot. Its exact database row is fenced first in the transaction before releasing retrieved or cached data, writing a proposal, returning receipt summaries, or inspecting/converting/replaying an action review. An operator demotion or removal that completes while one of these requests is in flight invalidates the transaction and prevents the protected result or write.

Campaign-bound tools also revalidate the applied plan and its reviewed offering, signals and cited sources on every invocation, including replay. The run's explicit product/outcome intent must match the applied plan. The verifier's exact source and business-record fences join the tool transaction, so a mid-call change or revocation yields `not_available` and cannot create a follow-up proposal. Legacy campaigns without explicit intent retain their existing call behavior; applied legacy plans still recheck their source anchors.

The runtime ends tool authority using `POST /api/voice/tools` with `{action:"end", connectionId}` or `{action:"end", previewId}`. This idempotently stores `toolEndedAt` without changing the connection's `connection_issued` state, so the existing conversation save path remains compatible. The fixed expiry remains the fallback if a browser disappears without ending the call. Ending these tools does not itself terminate a remote provider session.

## Persistence and review

Each successful authorized invocation has a durable `platform:voice_tool_invocation` receipt, scoped by tenant, issued call and stable request ID. Request hashing rejects reuse with different arguments or a different tool. Replays recheck current permissions before disclosing cached results. A transaction fences the exact source, consent, customer, release, campaign and connection rows. Call usage counters and the receipt commit with any proposed action; concurrent duplicates cannot create a second action.

Each call allows at most 40 committed invocations: at most 30 searches, 20 recalls and 8 follow-up proposals. Replays do not consume another allowance. Expired, disabled, revoked and otherwise unauthorized requests do not create a proposal. Database write conflicts retry up to four times, without provider or external calls.

Follow-ups use the existing `action` store with `proposed` status and manual execution. Their provenance links the issued call, context digest and durable tool receipt. The review endpoint checks the receipt's action ID, request hash, caller-selected customer binding, operator and context against those original records. Both receipt and call are fenced inside the review transaction. A changed description or mismatched receipt cannot be converted into a commitment. The review screen labels the evidence as a model-generated proposal, not staff-authored prose or a verified caller quote. Existing exact-quote checks for post-call learning remain unchanged. Accepting ownership creates an open internal commitment; it does not perform external work.

`listVoiceToolReceipts(user, {connectionId?, previewId?})` returns a bounded server-authoritative summary for saved conversations:

```ts
{ id, name, status, message, createdAt, actionId? }[]
```

It authenticates the issued call and returns no model arguments or private source text. Save handlers should use these summaries rather than accepting client-submitted tool results as evidence.

## Provenance and verification

This is a new implementation of the audited scope, source-revalidation, durable idempotency and reviewed-action principles, not a copied upstream tool runtime. Relevant audited predecessors are recorded in `docs/reuse-provenance.md`: html-portfolio `codex/private-voice-requests25` (`f02469564fb10a082bf34a94ff8619626f683879`) source-scope/quote authority and Vyakti-GroupAI `codex/relational-core` (`4bae159631ca3f18da0ede48596f593a55b6728c`) audience authority and action-ledger fences. The existing source-derived relationship compiler supplies the approved relationship cue IDs; companion identity and dyadic trust assumptions are not adopted.

Focused tests cover tenant and operator boundaries, exact citation offsets, unapproved scope expansion, alternate customer/URL arguments, changed-argument replay, source and memory revocation, consent withdrawal, unknown customer context, concurrent duplicate mutation, disabled/legacy/expired/ended calls, stopped releases, proposal limits, a source revocation racing an action write, same-origin/authentication, server receipt summaries, review conversion, provenance tampering and a receipt change racing review.

The focused command is `node --import tsx --test tests/voice-actions.test.ts tests/action-review.test.ts`. These tests use an isolated in-memory database and no provider calls. They do not prove microphone quality, live provider tool dispatch, external delivery, verified customer identity or production readiness.
