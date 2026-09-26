# Integration execution contracts

This layer is a boundary for future Gmail, CRM, calendar, document, and telephone adapters. It does not connect to any provider today. The registry describes Gmail, CRM, and telephone as `planned`; the only supplied connector is a test stub and is explicitly `test-only`.

## Execution flow

1. A user, automation, or browser-voice interaction creates an `IntegrationAction`. Voice produces an unapproved `VoiceToolProposal`; it cannot call a connector directly.
2. An operator (or a separately defined approval authority) explicitly approves the exact action. Approval records an approver and timestamp.
3. The executor loads the connection and runs the provider-neutral preflight: tenant match, matching connector identity, active connection, granted and unrevoked consent, declared and granted capability, a required and allowed channel for send/schedule actions, explicit approval, and a bounded idempotency key.
4. The execution store atomically writes `accepted` under a unique `(tenantId, integrationId, idempotencyKey)` key before any provider dispatch.
5. A connector reports `confirmed`, `failed`, or `uncertain`. Only valid transitions are `accepted` to one of those final states.

An existing idempotency claim is returned without dispatching again. In particular, `uncertain` is never automatically retried: a timeout or broken provider response does not tell us whether the external action happened. Reconciliation should query an eventual provider-specific reference or be resolved by an operator; any resend must be a separately approved action with a new idempotency key.

## Storage requirement

`IntegrationExecutionStore` is an interface, not a production implementation. A production adapter must use durable transactional storage and enforce the idempotency key with a database uniqueness constraint. `InMemoryExecutionStoreForTests` exists only to exercise the contract and must not be configured for a server process.

## Authority and freshness

Every imported or written business field should carry a `DataAuthorityClaim`: tenant, record type, field, source, authority rank, observation time, optional source update time, explicit expiry or source-specific maximum age, and version. `assessFreshness` marks malformed or future provenance as unknown, values past their maximum age as stale, and expired values as expired. `decideConflict` accepts a fresh, higher-authority incoming claim; it keeps an existing fresh higher-authority claim; equal-authority differing versions require review. It never silently combines two competing values.

Provider adapters must preserve this provenance when proposing writes back into company memory or a CRM. A connector's read result is evidence, not automatic authority over reviewed company data.

## Future voice tools

Voice tools should expose proposal creation and status lookup only. A conversation can say “I can prepare that follow-up” and produce a `VoiceToolProposal` with a conversation and turn reference. The command centre then renders the pending action, its channel, consent and evidence, and asks for explicit approval. Only the server-side executor may perform the preflight and dispatch after that approval. This preserves the same tenant, consent, idempotency, and uncertain-outcome guarantees for browser voice now and telephone adapters later.
