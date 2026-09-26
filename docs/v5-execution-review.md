# V5 execution-boundary review

Date: 2026-09-22. Independent review of team/auth, scheduled and manual email dispatch, WhatsApp inbox/webhook delivery, voice tools, action review, and saved-call receipts. Application fixes belong to the implementation agents; this reviewer added only this report and `tests/v5-review-*.test.ts`.

All reproduction used in-memory SQLite, fictional identities and injected provider callbacks. No external provider requests, credentials, full build, or customer data were used.

## Confirmed findings

| ID | Priority | Finding and concrete evidence | Resolution at last check |
| --- | --- | --- | --- |
| EX-1 | P1 | WhatsApp dispatch used request-start role without checking persisted membership at egress. Removing the membership immediately after the durable intent claim still invoked the provider once. A second adversarial timing removed it after the new fresh-member read but during later customer reads; that still dispatched. | Final atomic egress reservation now fences membership, connection, claimed thread, customer directory and exact customer rows immediately before the callback. Both independent timing regressions pass. |
| EX-2 | P1 | WhatsApp's unresolved-send query was outside its transaction, and the thread fence did not change state. Two simultaneous distinct request IDs both reached provider dispatch and both ended uncertain. | Implementation agent added a per-thread active send claim. Independent regression passes. |
| EX-3 | P1 | WhatsApp checked a contact/profile, then fetched a separate raw row to fence. An opt-out applied between those reads became the accepted anchor, allowing a send against withdrawn permission. | Implementation agent now validates the captured rows. Independent regression passes. |
| EX-4 | P2 | `saveStatus` persisted a provider status before reconciliation. If reconciliation failed once, the duplicate-event branch returned without retrying it. A delivered receipt remained permanently accepted after the exact same event was retried. | Implementation agent retries reconciliation for duplicate events. Independent regression passes. |
| EX-5 | P1 | Ordinary `sendCampaignEmail` lacked the current-member check present in the automation callback. Demotion after the email intent claim still invoked the provider. | Delivery implementation changes applied. Independent regression passes. |
| EX-6 | P1 | Manual email validated contact permission before recapturing its anchor. Opt-out inserted between validation and capture still reached provider egress. The same capture-after-validation structure covers other campaign authority records. | Delivery implementation changes applied. Independent contact regression passes. |
| EX-7 | P2 | `executeVoiceTool` fenced call/source data but not actor membership. Demotion immediately before the mutation transaction still created an internal follow-up. | Fresh membership fencing added. Independent regression passes. |
| EX-8 | P2 | `reviewAction` fenced proposal/evidence but not actor membership. Demotion immediately before its transaction still converted the proposal to an owned commitment. | Fresh membership fencing added. Independent regression passes. |

EX-1, EX-5, EX-7 and EX-8 are in-flight request races, not a claim that a caller can directly populate the server's `AuthUser`. Routes resolve membership before consuming the request body. A revocation or demotion can win after that initial check; the eventual mutation/egress must use persisted authority. The tests inject that exact ordering at the transaction boundary.

For EX-3/EX-6, a compare-and-set only proves a row stayed equal to the captured value. It does not prove the captured value was the one whose permissions were checked. Read the raw anchor first and validate those exact bytes, or explicitly compare its decoded data with the validated snapshot. Bind the final provider authorization to the validated actor, recipient, mailbox, campaign and source records.

## Reproduction and verification

- `tsx --test tests/v5-review-execution.test.ts`: four offline safety regressions initially failed; implementation changes fixed them. A fifth, removing membership during the final customer reads, exposed an incomplete fix and passed after the final atomic egress reservation was added.
- `tsx --test tests/v5-review-execution.test.ts tests/v5-review-authority.test.ts`: final independent combined rerun **9 passed, 0 failed**. All eight confirmed findings have passing reproduction regressions, including both WhatsApp membership timings.
- Existing `team-access`, `automation-worker`, `voice-actions`, and `action-review` targeted suites: 45 passed, 0 failed before the new fixes. This shows the previously passing coverage did not exercise the newly demonstrated races.
- An intermediate combined rerun could not load `lib/business/engine` while other agents were editing shared files. The file was restored and the authority retest passed; this was a transient verification interruption, not an execution-boundary finding.
- `npm run context:check` passed during review (73 nodes, 73 edges, 36 events at that point). Root is coordinating the final continuity update and broader build gate.

## Inspected boundaries without a new confirmed finding

- Team invitations use a random 256-bit token, persist its hash, emit a fragment URL, remove the fragment from browser history on load, and inspect/accept over POST. Existing-account acceptance verifies the invited account; another tenant's account cannot move. Last-owner changes and invitation acceptance use the team epoch fence.
- Automation's final provider callback checks schedule status/claim, current actor role, mailbox authorization, campaign snapshot, recipient consent/destination and source authority before a compare-and-set to egress. Existing tests cover pause, cancellation, role withdrawal, concurrent workers, uncertain results and recovery. The bare manual email path was the exception described above.
- Voice tool bodies reject unsupported keys; issued scope and requesting account come from server records. Tool invocation IDs/digests make duplicate proposals durable and bounded. Source revocation is fenced, and saved sessions derive receipt summaries from the server ledger instead of accepting client-supplied tool results.
- Action review verifies a voice proposal's request digest, matching call/account/customer, action ID and server receipt before conversion. Ordinary action creation selects supported fields instead of preserving submitted provenance.
- WhatsApp validates the exact raw-body HMAC and configured business phone. A replacement business number cannot reuse another number's thread/window. Delivery/read progression is monotonic under normal replay/reordering. Provider status identifiers are scoped by tenant and inbox request IDs are not reused across tenants.

The native WhatsApp webhook has a one-megabyte request bound and per-array limits; it still permits many nested events and status reconciliation scans existing tenant receipts. No measured production-scale performance conclusion is claimed. Real Meta account reconnect delivery, live email/provider outcomes, PostgreSQL concurrency and public deployment behavior remain outside this offline review.
