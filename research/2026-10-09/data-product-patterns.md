# Data-product patterns for messy enterprise data → reviewed campaigns

**Research date:** 9 October 2026  
**Scope:** Current official documentation only. Recommendations target Relay’s existing CSV/JSON intake workbench and its Company Brain → Campaign flow. No logged-in product trials were performed.

## Product judgment

Relay already has the right safety primitives: explicit column mapping, exact source evidence, create/link/skip decisions, opt-out preservation, a digest-bound preview, and an atomic receipt. The main weakness is workload shape. Every unknown column blocks preview, and every row in each 200-row batch needs a decision. A 1,000-row messy file therefore becomes a manual approval exercise instead of a review of consequential uncertainty.

The best combined pattern is: **profile the source → review mappings and identity rules → auto-stage safe rows → resolve exceptions → apply a versioned import → promote reviewed facts/audience eligibility separately**. Imported customer data, accepted company knowledge, and campaign-ready recipients must remain distinct states.

## Recommended flow

### 1. Create a durable import job before mapping

After upload, open an import record with source name, format, row/column counts, owner, created time, source digest, and stages: `Profiling`, `Needs mapping`, `Matching`, `Needs review`, `Applying`, `Complete`, `Partial`, or `Failed`. Save mapping, exclusions, cursor, counts, and receipts to that job so closing the page never loses work.

Attio allows mapping while upload continues, autosaves drafts, resumes from import history, runs in the background, and exposes per-record `Planned`, `Completed`, and `Failed` states ([CSV import](https://attio.com/help/reference/imports-exports/csv-imports/import-data-into-attio-via-csv)). Airbyte similarly separates connection health, stream status, last loaded record, and sync history ([connection status](https://docs.airbyte.com/platform/cloud/managing-airbyte-cloud/review-connection-status)). Relay should show operator-facing stages, not a generic busy string.

Use checkpointed, idempotent application: the source digest + mapping version + row number identify an attempt; rerunning resumes after the last committed batch and never silently reapplies it. Airbyte’s protocol treats state as the basis for resumable syncs, while warning that at-least-once delivery can repeat records ([protocol](https://docs.airbyte.com/platform/understanding-airbyte/airbyte-protocol), [incremental dedupe](https://docs.airbyte.com/platform/using-airbyte/core-concepts/sync-modes/incremental-append-deduped)). Relay’s receipt/hash model is a good foundation; expose it as recovery behavior.

### 2. Make mapping a data-profile review

Each column row should show its proposed target, confidence (`High`, `Needs review`, `No suggestion`), reason, inferred type, 5–10 representative values, blank/valid/unique counts, and affected-row count. Let optional unmapped columns default to `Keep as context` or `Skip`; block only missing requirements such as no usable identity field. Add a full-width sample table that previews the interpreted record, not only raw cells hidden in disclosures.

Attio previews up to 100 rows, then reviews raw versus mapped values grouped by unique value and frequency; one correction applies to every matching occurrence ([CSV import](https://attio.com/help/reference/imports-exports/csv-imports/import-data-into-attio-via-csv)). HubSpot reports mapping errors with affected columns and rows and can edit errored values in the importer ([import errors](https://knowledge.hubspot.com/import-and-export/troubleshoot-import-errors)). Relay should therefore fix a repeated invalid stage/date/boolean once at the value level, while preserving the original cell as evidence.

AI suggestions must stay advisory. Show why a mapping was proposed and the exact examples behind it. Never let confidence stand in for source evidence. Azure remains the only paid inference path; profiling and validation should be deterministic wherever possible.

### 3. Separate identity match from field reconciliation

Ask the operator to choose the identity policy before preview: for example `Exact normalized email`, `Exact E.164 phone`, or `Email OR phone`; show projected creates, exact links, ambiguous conflicts, and rows with no usable identifier. Exact unique matches can be staged automatically. Multiple candidates, contradictory identifiers, and same-file duplicates enter a conflict queue with side-by-side source and existing-record values.

Salesforce separates **match rules** (which profiles link) from **reconciliation rules** (which value represents a unified field) and retains source profiles rather than modifying them ([identity rulesets](https://help.salesforce.com/s/articleView?id=000394625&language=en_US&type=1)). Attio warns when no unique attribute is mapped, and notes that its preview checks against existing records but estimates can double-count duplicates within the incoming file ([CSV import](https://attio.com/help/reference/imports-exports/csv-imports/import-data-into-attio-via-csv)). Relay should explicitly check both workspace matches and within-file collisions before apply.

For a link, default to preserving the canonical customer value, as the current workbench does. Let the operator choose per conflicting field: `Keep existing`, `Use source`, or `Store as alternate/context`. Apply that choice to repeated values when safe. Never fuzzy-merge automatically; show any fuzzy candidate as `Possible match` with the contributing fields.

### 4. Review exceptions, not every row

Replace the mandatory 200-row decision list with summary cards and filters: `Ready to create`, `Ready to link`, `Identity conflicts`, `Invalid values`, `Restricted/opted out`, `Duplicate in file`, `Previously applied`, and `Skipped`. The primary action should read exactly what happens: **Apply 742 ready rows**. Exceptions remain unapplied until resolved or explicitly skipped. Offer bulk actions only within one reason group, with an undoable draft before apply.

Clay’s run progress breaks rows into successful, running, and failed states and keeps totals independent of current filters ([run progress](https://university.clay.com/docs/run-progress)); its Audience search lands new and existing records side by side in draft for qualification before sync ([Search](https://university.clay.com/docs/search)). HubSpot distinguishes a rejected row from a rejected property value and provides downloadable rows/errors ([import errors](https://knowledge.hubspot.com/import-and-export/troubleshoot-import-errors)). Relay should likewise permit a valid identity row to import while omitting one invalid optional value, but reject a row when identity, permission, or object rules fail.

Persist rejected rows with stable reason codes, original values, suggested remedy, and retry eligibility. Provide `Download rejected rows` and `Retry corrected rows` against the same import job. Do not force users to reconstruct failures from transient messages.

### 5. Keep imported data, company knowledge, and campaign eligibility separate

Completing intake should create/link customer records and attach source evidence. It should not approve Company Brain facts or make anyone campaign-eligible. After apply, offer two explicit next steps:

1. **Review proposed company knowledge** — extracted claims grouped by topic, each with source location, exact quote/value, confidence, contradiction state, and `Approve`, `Correct`, or `Reject`.
2. **Build an audience from eligible customers** — require contact permission, a valid channel, no opt-out/block, resolved identity, and the campaign’s evidence-based criteria.

Intercom keeps synced content read-only at the origin, records last sync and usage, and allows content to be enabled separately for AI surfaces and audiences ([website sync](https://www.intercom.com/help/en/articles/9357945-sync-and-manage-websites)). Its sync history includes synced, excluded, and failed pages. Relay should carry that model down to every fact: source, extraction/import run, last seen, reviewer, approval state, contradiction links, and campaigns/conversations that used it. Imported copies must be visibly detached from future source updates; Intercom documents that converting synced content to imported content severs the source connection ([internal sources](https://www.intercom.com/help/en/articles/9454619-sync-or-import-internal-articles-from-external-sources)).

Campaign review should freeze a manifest: audience rule/version, included recipient IDs, exclusion counts/reasons, approved knowledge set/version, offering, intended outcome, and unresolved warnings. A later source refresh creates a reviewable diff; it must not silently change a launched run.

## Known limits

- Documentation describes product behavior; it does not establish usability, latency, or reliability in live accounts.
- Attio and HubSpot are CRM importers, Clay is a data workflow/campaign product, Intercom is support knowledge, Salesforce Data Cloud is enterprise identity infrastructure, and Airbyte is replication infrastructure. Their controls should be adapted to Relay’s smaller operator workflow, not copied wholesale.
- Plan, beta, and cloud-only features vary. Airbyte’s patterns are an architectural reference only; this research does not recommend Docker or a new paid provider. Relay’s approved paid inference boundary remains Azure.
