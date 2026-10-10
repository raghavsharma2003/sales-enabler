# PostgreSQL compatibility audit — 10 October 2026

## Scope and result

This was a source-only audit of the `codex/product-discovery` checkout for the proposed App Service plus private Azure PostgreSQL deployment. It did not connect to PostgreSQL, Azure, Docker, or any secret-bearing configuration.

**No current SQL statement in the requested operational paths is a confirmed PostgreSQL syntax failure.** The application uses `TEXT` for its serialized JSON and ISO timestamps, portable `ON CONFLICT` forms, `LIMIT`, `EXISTS`, `||`, and positional parameters. PostgreSQL supports those constructs. `BYTEA` in the evaluation-audio table is PostgreSQL-native; SQLite accepts the declared type by affinity, so local SQLite success does not exercise that column's PostgreSQL behavior.

The hosted PostgreSQL path is nevertheless unproved. The test suite overwhelmingly forces SQLite: 68 test files explicitly delete `DATABASE_URL` (audit count on 10 October). The sole PostgreSQL construction test replaces `Pool.prototype.query`, so it opens no server connection and executes no PostgreSQL statement ([tests/database-pool.test.ts](../tests/database-pool.test.ts#L15)).

## Confirmed source findings

| Priority | Finding | Affected behavior | Evidence and smallest fix |
| --- | --- | --- |
| Resolved source P1 | Readiness now rejects a legacy schema that lacks evaluation-audio storage or a column required for binary artifact operations. | Evaluation audio artifact save/read/comparison is included in the schema-readiness contract. Index availability remains outside that contract: missing indexes affect bounded-purge performance, not table/column availability. | The read-only zero-row query now selects the required audio table columns, including `bytes`, expiry and metadata ([lib/server/health.ts](../lib/server/health.ts#L75)). Focused regressions prove it rejects both an absent table and a table without `bytes`, without creating either ([tests/readiness-database.test.ts](../tests/readiness-database.test.ts#L45)). PostgreSQL execution remains unproved. |
| P1 | Hosted behavior has no real PostgreSQL execution proof, including the transaction adapter that protects the high-contention voice and queue flows. | A production-only parameter conversion, `BYTEA` binding/result, transaction error, pool/TLS, or PostgreSQL concurrency behavior can still prevent a requested workflow. | `db()` selects a `pg` pool and translates placeholders ([lib/server/db.ts](../lib/server/db.ts#L42)); its only current PostgreSQL test stubs every query. Add a disposable-PostgreSQL integration lane before deployment; do not treat the existing SQLite suite as this evidence. |
| P2 | SQL placeholder conversion is a blind `/\?/g` replacement. | No present query is broken: the audit found no SQL literal or PostgreSQL operator containing `?`. A future JSON-key/operator query (`data ? 'key'`, `?|`, `?&`) or literal question mark would be rewritten as a parameter token and fail. | [lib/server/db.ts](../lib/server/db.ts#L44) rewrites every question mark without SQL parsing. Make the database interface accept native `$n` PostgreSQL SQL, or use a tokenizer/parameter builder that only replaces bind markers. Add a unit test covering quoted `?` and PostgreSQL JSON operators when changing it. |

`PRAGMA`, `BEGIN IMMEDIATE`, and `julianday` were the only SQLite-specific SQL constructs found. They are confined to the SQLite adapter or snapshot script ([lib/server/db.ts](../lib/server/db.ts#L68), [lib/server/db.ts](../lib/server/db.ts#L75), [scripts/sqlite-snapshot.mjs](../scripts/sqlite-snapshot.mjs#L20)). The one runtime date expression selects PostgreSQL's `clock_timestamp()` when `database.dialect === 'postgres'` and SQLite's `julianday` otherwise ([lib/evaluations/audio-comparison.ts](../lib/evaluations/audio-comparison.ts#L86)); that branch is source-compatible.

## Requested-flow trace

| Flow | PostgreSQL source assessment | Transaction/concurrency observation |
| --- | --- | --- |
| Sign-up and tenant records | Compatible: inserts organization, user, owner/account records in one `batch`; unique-email conflict is converted into the expected 409 path ([lib/server/auth.ts](../lib/server/auth.ts#L70)). | PostgreSQL `BEGIN` plus the unique `users.email` constraint preserves the duplicate-registration fence; unproved against a real server. |
| Company settings and Company Brain | Compatible: organization/profile and Brain-source writes use `TEXT` JSON plus exact-value update fences ([lib/company/service.ts](../lib/company/service.ts#L64)). | Every source/profile guard is an `UPDATE ... data=data ... expectedChanges: 1`; the caller converts a mismatch to a conflict. |
| Usage admission and Voice Live/speech grants | Compatible: capacity/budget and attempt writes are exact-preimage updates inside one batch ([lib/usage/service.ts](../lib/usage/service.ts#L96)); Voice Live tickets use the same form ([lib/voice/voice-live-authority.ts](../lib/voice/voice-live-authority.ts#L68)). | This is optimistic concurrency, not a reliance on SQLite's global writer lock. A simultaneous real-PG admission test is still required because the implementation uses PostgreSQL's default `READ COMMITTED`, unlike SQLite's `BEGIN IMMEDIATE` ([lib/server/db.ts](../lib/server/db.ts#L53), [lib/server/db.ts](../lib/server/db.ts#L75)). |
| Session save | Compatible: session/agent state is serialized into `entities.data TEXT`, with a primary-key upsert where needed ([lib/server/store.ts](../lib/server/store.ts#L153)). | Expected-change fences protect mutable session/memory state ([lib/server/store.ts](../lib/server/store.ts#L199)). |
| Source intake and Company Brain publishing | Compatible: approved Brain source records, review updates, and audits use portable inserts/conditional updates ([lib/ingestion/engine.ts](../lib/ingestion/engine.ts#L256)). | The catalog and source preimages are fenced in the same batch; duplicate/unique errors are handled as review conflicts ([lib/ingestion/engine.ts](../lib/ingestion/engine.ts#L270)). |
| Campaign plans and delivery/automation queues | Compatible: plans and campaigns use portable statements and preimage fences ([lib/campaign-planning/engine.ts](../lib/campaign-planning/engine.ts#L283)); the worker claims an exact schedule revision before external dispatch ([lib/automation/engine.ts](../lib/automation/engine.ts#L204)). | The database transaction stops two workers from both winning the same exact claim, but this needs a two-worker PostgreSQL test. |

## Migration and bootstrap boundary

The application has **additive bootstrap, not versioned migrations**. `db()` executes `CREATE TABLE/INDEX IF NOT EXISTS` on each newly initialized process ([lib/server/db.ts](../lib/server/db.ts#L45)); `npm run db:bootstrap` merely opens that same adapter and runs `SELECT 1` ([scripts/bootstrap-db.ts](../scripts/bootstrap-db.ts#L4)). There is no migration ledger, schema version, migration lock, downgrade, or restore verification in this code path.

This is not a PostgreSQL dialect error today, but it is a confirmed hosting boundary: App Service roles may concurrently initialize an empty or newly changed database. Before schema-changing releases, introduce a one-shot, versioned migration command with a PostgreSQL advisory lock (or run it as a single controlled deployment step), record applied versions, and keep readiness read-only. Do not rely on concurrent application startup to serialize DDL.

## Minimal proof plan before hosting

1. Create an empty disposable PostgreSQL database reachable through the intended private App Service networking and use a non-production `DATABASE_URL` with TLS verification. Run `npm run db:bootstrap`, then `npm run readiness`. This proves connection parsing, TLS, schema creation, and the read-only probe; it is not a customer-data migration.
2. Add a PostgreSQL-only integration test setup that never deletes `DATABASE_URL`. Execute sign-up/login/session establishment; Company profile plus Brain-source save; one source-intake review; one session save; one campaign plan/apply plus one automation claim; one voice admission followed by Voice Live/speech-ticket issuance and redemption. Use stubbed AI/provider calls but the real database adapter.
3. In that lane, issue two concurrent calls for the same voice request/capacity and two concurrent worker ticks for the same schedule. Assert one durable reservation/claim and a safe replay or conflict for the other caller.
4. Add an evaluation-audio contract: write/read a `BYTEA` artifact, run the PostgreSQL `clock_timestamp()` guard, purge a bounded expired row, and verify that readiness fails when the table is missing. This closes the P1 readiness gap.
5. Before the first schema change after launch, replace additive bootstrap with the versioned migration step described above; test restore into a new PostgreSQL database and rerun readiness plus the PostgreSQL integration lane.

## Explicit non-findings

No unguarded SQLite `json_*`, `strftime`, `datetime`, `last_insert_rowid`, `INSERT OR`, `REPLACE`, `AUTOINCREMENT`, `COLLATE NOCASE`, `GLOB`, `MATCH`, `ROWID`, `ATTACH`, `VACUUM`, or SQLite-only DDL was found in application runtime SQL. This is a static conclusion only; it does not establish Azure private-DNS routing, credentials, TLS trust, server capacity, or production readiness.
