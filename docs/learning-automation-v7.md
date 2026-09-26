# Opt-in post-conversation learning proposals

Owner-created deployments may explicitly enable `autoLearning`; the default is false. This setting is frozen with the issued conversation/job revision. Completed server-captured public voice/chat and Telegram/WhatsApp exchanges can then create a durable learning job. Existing conversations are never scanned or backfilled, and enabling a setting later does not opt an older conversation in.

The worker generates exact-quote feedback proposals using the existing `analyzeConversation` function and the Azure `feedback` task. It does not approve memory, publish company knowledge, change agent prompts, release a version, execute a follow-up, send a message, or retrain a model. The existing Conversations review surface displays ready analyses. Deployment job status is available through the tenant-scoped `GET /api/learning-jobs?deploymentId=...` endpoint; active viewers can inspect it. There is no public or private HTTP enqueue endpoint.

## Explicit operation

Set `LEARNING_WORKER_ENABLED=1` in the server and worker environment, and explicitly opt in the deployment. Run:

```text
node --env-file=.env.local --import tsx scripts/learning-worker.ts --once
node --env-file=.env.local --import tsx scripts/learning-worker.ts
```

The persistent worker polls every 15 seconds and accepts only `--once`. Configuration and credentials belong in the environment, never arguments. Logs contain status counts and no transcript, identity, credential, or provider exception text. With the flag absent or not `1`, enqueue and worker processing return before database access; the script writes no heartbeat. A running worker records `service_heartbeats` service `learning-worker`, ID `learning:<random UUID>`, status `running` at startup and after each pass, then `stopped` on clean exit. A long inference can make a 120-second readiness probe stale; this does not authorize replay.

## Source, authority and limits

`enqueueLearningForServerSession({ organizationId, sessionId, issuedDeployment: { id, revision, autoLearning } })` is internal to canonical writers. It requires the canonical session's deterministic ID and transcript to match the private `public:conversation` or `channel:job` receipt, including frozen opt-in and deployment revision. Public request bodies and ordinary session metadata cannot assert this provenance.

Jobs are stable per organization, session and raw source digest. Each enqueue and each inference reservation has a durable daily cap: 25 per deployment and 100 per workspace. Worker passes claim at most 10 jobs (default 5). The existing analysis further limits selected turns, input characters and output to 1,600 tokens; Azure task routing retains its own idempotent request/usage receipt and configured token budget. These are bounded usage controls, not a currency or billing promise.

Before claiming, immediately before inference reservation, and before committing ready evidence, the engine rechecks the current publisher's owner membership/authorization version, exact deployment revision and opt-in, current published release/test/source dependencies, the canonical source bytes and the job claim. Transactional compare-and-set fences reject concurrent revocation or mutation. Paused/stopped deployments, revoked owners, changed sources, disabled opt-in or changed revisions cancel work that has not begun inference.

Anonymous public visitors and unverified channel accounts have no canonical customer binding. Their analysis is `feedbackOnly`, including a manually requested analysis of the same saved channel source. Candidate type, exact quote, original destination and automatic `anonymous_feedback_only` route are retained; an audit event records the routing rule. Operator review can keep these as conversation feedback but cannot turn them into customer memory or a follow-up action. Identified private conversations retain their existing reviewed proposal workflow and explicit negative-follow-up guard.

## Outcomes and recovery

| State | Meaning |
| --- | --- |
| queued | Eligible immutable conversation awaits a worker. |
| claimed | One durable worker claim owns preparation. |
| inference | The paid inference boundary was reserved; provider work may have begun. |
| ready | Saved quote-grounded analysis is available for operator review. |
| cancelled | Authorization, source, claim or budget prevented inference. |
| uncertain | Inference may have started or its claim expired; retain receipts and review. |

Claims expire after ten minutes. Expired preparation becomes cancelled; expired inference becomes uncertain. Neither is automatically reclaimed or paid-retried. Errors after the inference boundary conservatively become uncertain even when the provider may have rejected the request. The AI router independently uses a stable request ID and never retries a pending/uncertain receipt as a new request. Late results cannot overwrite expired claims. No general retry endpoint is provided.

Canonical history is saved first. Enqueue failure must not change delivery status, lose transcript evidence, reopen a public session, or duplicate an accepted channel reply. Queueing occurs only after a newly written canonical session; replaying a completion does not backfill old sessions. The status endpoint returns at most 100 matches from the most recent 500 workspace jobs, without source text or claim secrets.

## Verification boundary

Offline tests cover disabled no-write behavior, frozen opt-in, server receipt/tenant checks, concurrent duplicate claims, bounded enqueue limits, source/owner/deployment withdrawal, pause between claim and inference, withdrawal during inference, uncertain/expired claims and late responses, quote preservation, unsupported quote rejection, anonymous feedback-only manual and automated analysis, and absence of released memory/actions. Public/channel writer integration tests exercise the enqueue hooks separately. No paid provider call, real external channel delivery, full production build or live worker deployment is claimed by this implementation.
