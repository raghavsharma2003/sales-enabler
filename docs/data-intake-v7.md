# Reviewed customer table intake

This is a bounded CSV/JSON customer intake workflow, not a universal ERP importer. It reuses immutable `ingestion_source` records and the existing ingestion upload endpoint. Source tables remain private source material; neither importing nor mapping creates approved Company brain knowledge.

The workbench lives inside Company brain → Source intake. Owners and operators can import a UTF-8 CSV or a flat JSON array, inspect headers and examples, ask Azure for a mapping proposal, review mappings, inspect normalized rows and source evidence, and explicitly create/link/skip each row. Viewers get a read-only explanation. AI assistance uses the existing metered Azure `extraction` task router with stable request IDs. Ten columns per request, up to five requests, keep model input/output bounded. It uses three bounded sample rows. There are no paid-provider fallbacks or automatic identity decisions.

## Limits and review

- Existing upload/request limit: 512 KB (multipart envelope counts toward the request cap), plus the immutable-source limit of 240,000 text characters.
- One source contains at most 1,000 data rows, 50 unique nonempty headers and 10,000 characters per cell. Oversized, malformed, nested JSON and non-UTF-8 inputs are rejected, never silently truncated.
- Each preview covers at most 200 source rows. The cursor advances by 200 and reports the remaining rows. Larger files require separate sources; a completed batch does not claim the entire source is imported.
- CSV quoted commas, escaped quotes, embedded newlines, CRLF and a leading BOM are supported. JSON fields must be scalar; missing/null fields become empty strings.
- Every column needs an explicit known mapping, customer-context mapping, or skip. Multiple AI candidate name/email/phone columns stay unresolved. Exactly one name column is required; at most one email, phone, stage or notes column is allowed.
- Normalization collapses name whitespace and applies NFKC; email uses NFKC and lowercase. Phones require an explicit international country code through the existing phone validator. Dates must be actual YYYY-MM-DD dates. No dates, country codes or identities are guessed.
- Missing names, invalid emails/phones/dates, overly long identity fields and duplicate emails are flagged. Duplicate email checks cover the whole source, including later batches; explicit row exclusions let the operator resolve those conflicts before creating a new preview.
- Source headers `doNotContact`, `optOut`, `optedOut`, `unsubscribed` (case/separator insensitive), and manually mapped restriction columns preserve true/yes/1/y as a deny flag even when a recognized column is skipped. No imported value grants consent or verifies identity.

## Matching and commits

Exact name, email and normalized international-phone matches are listed with the reason. Active profile values override base contact values using nullish semantics, so an explicitly cleared profile field never falls back to stale contact data. There is no fuzzy merge. Competing exact matches require the reviewer to choose a listed record or skip. A create is blocked if any current exact match exists. Duplicate selected identities within a batch are blocked before commit.

Linking adds reviewed source references and retains a detailed `data_intake_row` receipt containing mapped context, evidence, row number and reviewer. It preserves the existing identity/profile, stage and notes. Explicit source deny flags are added to the contact and never cleared. Creating a customer retains mapped notes/context and raw source-cell evidence directly on the contact as well as in its row receipt.

Previews bind source ID/digest, actor ID, normalized mappings, sorted exclusions, cursor, source-derived rows and effective directory hash. All create/link writes, per-row receipts, batch receipt and audit event commit in one `Database.batch`. The batch includes the shared customer-directory CAS guard, exact immutable-source bytes/status, exact preview bytes, and the active operator membership fence. Linked contacts also compare their original bytes. Concurrent source removal, permission revocation or customer writes roll back the whole batch.

Batch receipt IDs derive from the preview; retries with identical decisions return that receipt. Changed decisions are rejected. Per-row receipt IDs bind organization, original source digest and source row number, preventing remapping or reuploading identical bytes from applying that row again. Skipped rows are recorded in the batch receipt but can be reviewed again in a new preview. Source deletion or revoked access also prevents replay. No internal receipt writes authorize external messages or campaign execution.

## Interface and API

`DataIntakeWorkbench` accepts optional `onApplied` and `sourceId` props plus `canWrite` (default false), and imports its scoped stylesheet. Source examples, AI reasons, row issues, match reasons and exact cell evidence are shown alongside review controls. Rows display in groups of 20 within a 200-row review batch. Exclusion changes require a refreshed preview. Applying stays disabled until each row has a decision. An explicit “Skip undecided rows” action is available; create and link are per-row choices.

`POST /api/data-intake` uses the existing session/origin guard and supports `inspect`, `suggest`, `preview`, and `apply`. It stores `platform:data_intake_preview`, `platform:data_intake_row`, and `platform:data_intake_batch` entities, without schema changes or a separate customer database.

## Verification and boundaries

The focused suite (`node --import tsx --test tests/data-intake.test.ts`) passes 22 tests. It exercises CSV quoting/newlines/BOM and UTF-8 upload validation, flat JSON and bounds, invalid mappings and data, source prompt injection, cross-chunk AI ambiguity, exact and ambiguous customer matches, nullish profiles, opt-outs, per-row review, atomic rollback, directory races, source-deletion races, membership-revocation races, replay, duplicate reuploads and staged batches. AI replies are synthetic fixtures; no live model or external-channel calls are made by these tests.

Optional offering relationship mapping and purchase/history inference are deliberately absent. Context remains customer-specific evidence; a product-looking source value does not assert a purchase or relationship. Browser visual verification belongs to the integrated Company brain surface and must be reported separately from these service tests.
