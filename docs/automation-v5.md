# Local campaign email schedules

Implemented 2026-09-22. This is an opt-in local worker, with one future schedule per already launched connected-email campaign run. Installing the app, starting Next.js, or opening Automations never enables or dispatches a job. Existing records are never scheduled automatically. Integration sync scheduling and telephone calls remain deferred.

## Operator flow

1. Connect and check Gmail or Microsoft Mail with send permission. Record current customer email consent.
2. Review and launch the email campaign through the existing Campaigns flow. The launched run freezes the campaign content, audience, mailbox authorization and applied-source references.
3. In Automations, choose the run and select **Review recipients**. The screen lists each recipient, current eligibility/exclusion reason and the exact launched message template. Only currently eligible, unsent recipients enter the schedule; excluded recipients are never added later automatically. At most 100 recipients are supported per schedule.
4. Choose a future local date/time. The UI identifies the browser's IANA timezone and confirms the interpreted time. The server stores both the exact UTC instant and the timezone. The date must be more than five seconds ahead and within one year. Check the authorization acknowledgement and select **Enable schedule**.
5. Run the local worker against the same database and connector configuration. It rechecks authority immediately before each recipient's provider request. Provider acceptance means the provider accepted the request, not inbox delivery.

Only the operator who launched the run may authorize it. Only its authorizing operator may control the schedule. Current team membership must remain active and owner/operator at enable, resume and execution. Viewers can inspect schedule history and worker status but have no mutation controls. Pause or cancellation prevents remaining dispatches; an already authorized provider request may finish and its receipt remains visible.

## Start and stop

The package script should be:

```json
"automation:worker": "node --env-file=.env.local --import tsx scripts/automation-worker.ts"
```

Leave `AUTOMATION_WORKER_ENABLED` unset for the default off state. To intentionally run schedules locally in PowerShell:

```powershell
$env:AUTOMATION_WORKER_ENABLED = '1'
npm run automation:worker
```

Stop with Ctrl+C. To run one bounded pass:

```powershell
$env:AUTOMATION_WORKER_ENABLED = '1'
npm run automation:worker -- --once
```

The worker checks every 15 seconds in continuous mode. A pass claims at most five recipients total, at most one per schedule, and dispatches sequentially. Multiple workers compete through exact-record compare-and-set claims. No provider retry loop exists. Logs contain event/count fields only, never destination, message content, keys or provider error bodies. A fatal worker error emits a fixed safe message.

The UI polls every 15 seconds. A running heartbeat less than 90 seconds old means a worker reported recently; this is not a guarantee of future uptime or precise delivery time. Heartbeats are global infrastructure records in the same database, written at the start of every enabled pass even when there are no schedules or users. Empty workspaces therefore see real worker availability. A one-pass invocation reports stopped on completion; shutting down one worker does not hide another recent running worker. An enabled schedule whose time has passed shows overdue while waiting for a worker. Restarting the local worker processes overdue, still-authorized schedules. Running only the web server never dispatches schedules. No Vercel cron, Azure service, paid inference, background OS service, or production deployment is created.

## Durable states and recovery

The existing relational `entities` store holds `platform:automation_schedule` records. The minimal `service_heartbeats` infrastructure table holds worker ID, service name, running/stopped state and update time; it contains no tenant, operator, customer or credential data. The dashboard exposes only availability, last report time and an explanation, never worker IDs. Historical tenant heartbeat rows are ignored. The schema is created on database initialization, so existing worker processes must restart after this migration. The schedule keeps author, reviewed immutable run digest, due instant, timezone, stable per-recipient request IDs, bounded history and a per-recipient claim with a random fencing token and two-minute expiry.

The claim starts in `preparing`. The worker performs the canonical `sendCampaignEmail` operation with its stable request ID. The delivery engine owns the durable email intent, current mailbox credentials and provider receipt. Both manual and scheduled sends validate the exact captured run, contact, consent profile, mailbox, plan and source rows, together with an exact operator-membership fence and any business-intent fences returned by plan verification. The engine repeats validation after creating the intent. It then atomically records `dispatchAuthorizedAt` with all current authority fences. The scheduler contributes only its current state, unexpired claim token and reviewed run digest through an additional gate; that gate's transition to `egress` commits in the same transaction. There is no duplicate scheduler-owned authority validator and no asynchronous operation between this transaction and the provider callback. Pause/cancel that wins before this boundary prevents the request. After this boundary a provider request can no longer be recalled; later cancellation is preserved while its outcome is saved. Enable, resume, control and initial worker claims also fence operator membership in their own transactions.

Known acceptance/rejection is copied from the existing delivery receipt. The schedule never invents its own email executor or second delivery intent. Timeouts and lost provider-result writes become uncertain; no automatic retry is permitted. Compare-and-set result persistence preserves concurrent pause/cancel actions. An expired claim is recovered from durable provider state where available:

| Evidence | Schedule recipient result | Next action |
|---|---|---|
| Durable accepted/rejected receipt | Known accepted/rejected | Preserve receipt, never resend |
| Expired `preparing` claim without a known result | Interrupted before provider dispatch | Operator review; no automatic resend |
| Expired `egress` claim without a known result | Uncertain | Inspect connected mailbox; no automatic resend |
| Current authority fails before a send intent | Blocked | Fix authority and review a new campaign if this recipient needs another attempt |

The delivery engine may independently classify its stale `sending` intent as uncertain even when the schedule knows its claim had not reached egress. The schedule retains the more specific interrupted-before-dispatch explanation; neither record is deleted, reset or resent. A failed final authorization before the provider callback records a known rejection, while provider-call exceptions remain uncertain.

Any rejected, blocked, interrupted or uncertain recipient stops the schedule in **Needs review**. Untouched pending recipients may continue only after the operator pauses, previews current eligibility and explicitly enables a new future time. Resume preserves the original recipient subset and request IDs. It never requeues a non-pending recipient. Cancellation and completion are terminal. One deterministic schedule ID per tenant/run prevents duplicate creation; a new campaign/run is a separate explicit reviewed decision, never an automatic retry.

## HTTP and integration contract

`GET /api/automations` requires the authenticated workspace session and returns `AutomationDashboard`: `canManage`, `schedules`, eligible run summaries and `worker: {running,lastSeenAt?,explanation}`. Each schedule includes its own `canManage` and computed `overdue`. No tokens, sealed credentials or private integration settings are returned.

`POST /api/automations` requires same-origin JSON and an authenticated operator:

| Action | Required fields | Result |
|---|---|---|
| `preview` | `runId` | Current eligibility, blockers, template and `reviewToken` |
| `enable` | `runId`, `reviewToken`, `scheduledAt` (ISO instant), `timezone` (IANA name) | Persisted enabled schedule; HTTP 201 |
| `pause` / `cancel` | `id` | Updated durable schedule |
| `resume` | `id`, fresh `reviewToken`, future `scheduledAt`, `timezone` | Explicitly rescheduled pending subset |

The review token is a freshness digest, not an authentication credential. Enable recomputes it and fences the reviewed authority records in the insertion transaction. Only launched active connected-email runs are accepted. There is intentionally no public dispatch endpoint.

Mount `AutomationsView` from `components/platform/automations-view.tsx` under Operate. It takes no props, loads the API, imports its scoped `app/automations.css`, and uses the existing DM Sans/indigo workspace design. Server engine imports stay out of the client dependency graph through type-only `lib/automation/contracts.ts` imports.

## Source reuse and verification scope

This selectively adapts the already audited Vyakti GroupAI delivery runtime's intent, authority-fence and ambiguous-outcome contracts (`origin/claude/vyakti-cloning-platform-aq05n4`, pinned `451de5a…`, `packages/delivery-runtime/src/{types,runtime,repository}.ts` and the Postgres follow-through recovery worker/scheduler). The CommandCentre cold-email sequence engine (`main`, pinned `c8fd321…`, `lib/cold-email/sequence-engine.ts`) informed due-time, timezone, conditional-claim and suppression checks. Exact source pins remain in the existing source audit ledgers. This is a selective behavioral adaptation on the canonical local database/delivery engine, not a wholesale source merge or a claim that those upstream runtimes execute here.

Focused tests use isolated in-memory SQLite, fictional recipients, offline connector tokens and injected dispatch functions. They cover default-off and no implicit schedules, stale review/future-time guards, concurrent claims and one provider attempt, tenant/author bounds, current consent/mailbox/team permission, race pause/cancel and post-intent authority revocation, cancellation during a provider request, ambiguous outcomes, result-write failure, lease expiry and unexpired-lease fencing, resume review and truthful worker/overdue reporting. No real email, OAuth connection, paid inference or external integration call is made. PostgreSQL execution and hosted/process-supervised uptime remain unverified. Root owns the integrated browser review and full application verification.
