# Review: money, approvals and auth (2026-10-21)

**Status (2026-10-21):** all 10 findings are fixed.
- Kernel: MA-01, 03, 04, 05 and 06 (8b898c2), plus the prepare() action id and unknown-outcome rule for MA-08 (7057eb3).
- Workspace: MA-02, 07 and 10 (3cd38bd), and the invite throttle (cdb0f9b).
- Money: MA-08 and 09 (5f3aa23, 8394e4d).
- Operator: the flagged A0 secret leak is closed too (27b06f1).

The remaining tests in money-auth.test.ts are ordinary tests.

Adversarial review of the kernel (`server/{tools,auth,http,ledger,app,jobs,runtime-client,identity}.ts`,
`shared/approval.ts`), `modules/money/**`, `modules/workspace/**`, the `/v1/actions` approval path and the three
`/hooks/*` routes.

**Method.** Code read end to end. Each finding has a reproducing test in `money-auth.test.ts`, marked node:test `todo`.
All 10 were verified to FAIL on `bd7d8dd`: n = 1 run each, Postgres 16 throwaway DB, `node scripts/test.mjs
tests/review/money-auth.test.ts`. Every control assertion passed, so each test fails at the defect and not in its
setup. Without `DATABASE_URL`, 9 tests skip and MA-10 still runs. `tsc --noEmit` is clean.

`scripts/test.mjs` lists only `tests/*.test.ts`, so CI does not pick up this folder. Run the file by path.

**Counts:** 1 blocker, 5 major, 4 minor.

| id | severity | where | in one line |
|---|---|---|---|
| MA-01 | blocker | `server/tools.ts:130` | The Operator (an LLM agent acting for a member) runs `attempt.retry_per_ladder`, which re-dials a person, at once. A member asking directly gets a card. |
| MA-05 | major | `server/app.ts:70` | The login throttle is keyed on the client-supplied `x-forwarded-for`. Rotating it gives unlimited password guesses. |
| MA-07 | major | `modules/workspace/apikeys.ts:17` | An API key's `daily_cap_inr_milli` is stored and never enforced. No budget row is created, and no attempt records `api_key_id`. |
| MA-08 | major | `modules/money/index.ts:84` | `wallet.topup` charges the gateway inside `run()`. If the charge throws after capture, the action stays `proposed`. A second tap charges again under a fresh idempotency key. |
| MA-09 | major | `modules/campaigns/worker.ts:254`, `modules/money/money.ts:217` | A hold whose dial is `unknown` (never dispatched, or the runtime never reports) is never released. Reconcile skips it as "in flight", so wallet and caps leak forever. |
| MA-10 | major | `modules/workspace/webhooks.ts:20` | SSRF: `https://[::ffff:169.254.169.254]/` passes `checkUrlShape` and `assertPublic`. |
| MA-06 | minor | `server/app.ts:100` | `GET /v1/actions` ignores API-key scopes. A key scoped to `wallet.get` reads every action's args and results. |
| MA-02 | minor | `modules/workspace/members.ts:86` | `member.remove` has no `version()`. An approval shown for removing a builder still runs after that person was made an owner. |
| MA-03 | minor | `server/tools.ts:242`, `server/app.ts:108` | Decline has no role check. A viewer can cancel any pending action, including owner-only spend. |
| MA-04 | minor | `server/auth.ts:93` | The cookie "JSON only" check is `includes('application/json')`. `text/plain; charset=application/json` is CORS-safelisted, so it needs no preflight. |

## Findings

### MA-01 · blocker: the Operator bypasses the A2 card on `attempt.retry_per_ladder`

- **Where:** `server/tools.ts:130`
  `selfA3 = isA3(name) && (opts.actor.type === 'agent' || opts.actor.type === 'system' || name !== 'attempt.retry_per_ladder')`.
- **Root cause:** the Operator calls tools as `{ type: 'agent', id: 'operator:<member>', role }`
  (`modules/operator/loop.ts:134`). Any `agent` actor therefore gets A3 for the one verb the kernel holds back from
  members.
- **What reaches it:** `attempt.retry_per_ladder` is `external` and re-dials a person
  (`modules/campaigns/index.ts:581`). The caller picks `outcome` (e.g. `callback`) and `at`. The tool also overwrites
  the original attempt's `outcome_class`.
- **Failure path:**
  1. A builder or operator, or text injected into an upload or knowledge passage, asks the Operator to "retry" any old
     attempt in the workspace.
  2. A new dial is queued with no human tap.
  3. Only the dial gate (consent, DND, window, caps) stands between that request and a call.
- **Why blocker:** `shared/approval.ts` states that "no agent can talk its way past it", and the Operator plan view
  agrees (`loop.ts:294` marks it as no tap).
- **Test:** `MA-01: an Operator turn runs attempt.retry_per_ladder at once; a member asking directly gets an approval card`.
- **Fix:** tie A3 to the real principal, not the actor type. Exempt only `system`, and agents with no `role`; an agent
  carrying a member's role is held exactly as that member. For example: `const autonomous = opts.actor.type === 'system'
  || (opts.actor.type === 'agent' && !opts.actor.role)`.

### MA-05 · major: the login throttle is bypassed with `x-forwarded-for`

- **Where:** `server/app.ts:70` (the signup throttle at `:54` and the invite throttle at `workspace/index.ts:67` have
  the same root).
- **Root cause:** the key is `email + raw x-forwarded-for`, and the client controls that header. A proxy appends to it
  rather than replacing it, so a spoofed first hop still changes the key.
- **Failure path:** credential stuffing or password guessing against one account, with a new XFF value per request.
  The test sent 12 wrong passwords and got 12 × 401, with no 429.
- **Test:** `MA-05: login throttling is keyed on the client-supplied x-forwarded-for, so rotating it never throttles`.
- **Fix:**
  - throttle per account (email alone) as well as per client;
  - derive the client IP from the socket, or from the right-most hop the deployment's trusted proxy appended;
  - move the counters to Postgres before running more than one replica.

  The test helper `workspace-helpers.ts` sends a random XFF on every call; it will need a reset hook.

### MA-07 · major: an API key's spend cap is never enforced

- **Where:** `modules/workspace/apikeys.ts:17` stores `daily_cap_inr_milli` (default ₹2,000). `server/ledger.ts:51`
  checks only `budget` rows with `scope_type='api_key'`. Nothing creates such a row.
- **A second gap:** no attempt insert sets `attempt.api_key_id`. The only writer copies it on retry
  (`campaigns/index.ts:613`). Approved A2 calls run as the approver (`tools.ts:206`), so the key is lost before the
  insert. A manual `cap.raise` with `scope: api_key` would therefore never match either.
- **Failure path:**
  1. An owner approves a key with `dailyCapInrMilli: 1000`.
  2. A ₹50 hold with that `apiKeyId` passes.
  3. In production, attempts made through the key carry no `api_key_id`, so they are never checked against any key cap.
- **Test:** `MA-07: an API key's daily cap is stored but never enforced by the ledger`.
- **Fix:**
  - `apikey.create` inserts a `budget (scope_type 'api_key', scope_id key, period 'daily', cap = dailyCapInrMilli)` in
    the same transaction;
  - the proposer's `apiKeyId` is stored on the `action` row and handed to `run()` at approval, so attempt inserts can
    set `api_key_id`;
  - add a `daily_cap_inr_milli` CHECK, or drop the column, so there is one source of truth.

### MA-08 · major (latent blocker): a top-up can be charged twice

- **Where:** `modules/money/index.ts:83-84`. A fresh `randomUUID()` idempotency key is made per run, and
  `gw.charge(...)` is called inside `run()`, inside the approval transaction.
- **Failure path:**
  1. The gateway captures the charge, then the adapter throws (timeout, reset, a 5xx after capture).
  2. `approve()` treats a plain `Error` as not executed, and the transaction rolls back. The action stays `proposed`
     and no `wallet_topup` row exists.
  3. The owner taps approve again. A new idempotency key goes out, so there is a second real charge. The test saw 2
     charges for one action.
- A capture followed by any later DB error (the insert, the credit, the audit) also loses the record of the first
  charge.
- **Why latent:** the Razorpay adapter is disabled today (`gateway.ts:31`). This becomes a blocker the day a gateway
  is switched on.
- **Test:** `MA-08: a gateway error after capture leaves the top-up approvable again, so the customer is charged twice`.
- **Fix:**
  - make the idempotency key deterministic per action (e.g. the action id, passed through `ToolCtx`) and create the
    order in `prepare()`, outside the transaction;
  - map gateway transport errors to `UnknownOutcome`, so the action becomes `unknown` and is never re-approvable;
  - credit only from a signed gateway webhook or a capture-status poll, idempotent on `gateway_ref`.

### MA-09 · major: holds leak when a dial is never confirmed or never reported

- **Where:**
  - `modules/campaigns/worker.ts:254`: `reconcileStale` marks the attempt `unknown` (`dispatch_unconfirmed`).
  - `worker.ts:223`: when `runtime.start` throws, the comment says "Keep the hold (the calls module settles or releases
    it)".
  - `modules/money/money.ts:217`: reconcile skips any attempt with a held reservation.
  - Nothing else releases a `held` reservation. The only callers are `calls/ingest.ts:189-190` on `call.ended`,
    `worker.ts:243` and `gate.ts:325`.
- **Failure path:**
  1. A worker dies between claim and `runtime.start`, or the runtime accepts the ticket and never posts `call.ended`.
  2. The hold (the call's maximum cost, e.g. ₹600) stays counted against `balance - held` and against every tagged
     cap, forever. Daily caps carry it across every IST reset (`0901_money.sql` keeps holds counted by design).
  3. No drift issue is ever opened. A few such attempts stall a workspace's campaigns with `wallet_low` or
     `cap_reached`, while the wallet shows money the customer cannot use.
- **Test:** `MA-09: a hold whose dial was never confirmed is never released or flagged`.
- **Fix:** a money-side sweeper, owned by money or calls:
  - a hold on an attempt that is `unknown`, or `dialing` past `maxDurationS` plus a grace period, with no live
    conversation, is released;
  - for `dispatch_unconfirmed` it is released at once, since the runtime never had the ticket;
  - for a runtime that went silent it is released or settled from metered cost lines, plus a `money_drift` issue;
  - reconcile should flag held reservations older than the longest possible call instead of skipping them.

### MA-10 · major: webhook SSRF through IPv4-mapped IPv6

- **Where:** `modules/workspace/webhooks.ts:20`. `isPrivateAddress` strips only a dotted `::ffff:` prefix.
- **Root cause:** WHATWG `URL` rewrites `[::ffff:169.254.169.254]` to `[::ffff:a9fe:a9fe]`. That form is neither IPv4
  nor caught by the IPv6 rules, so `checkUrlShape` and `assertPublic` (which takes the same path for IP literals) both
  pass it. Verified with Node 22: `[::ffff:127.0.0.1]`, `[::127.0.0.1]` and `[64:ff9b::a9fe:a9fe]` (NAT64) all pass.
- **Failure path:**
  1. A builder, or a leaked builder key, proposes `webhook.create` to `https://[::ffff:169.254.169.254]/...`.
  2. The card reads "Send all events to [::ffff:a9fe:a9fe]" and is approved.
  3. On a dual-stack host, deliveries reach cloud metadata or loopback services.
  4. `webhook.deliveries` returns `response_status`, which works as a port and service oracle. `webhook.replay` makes
     it repeatable.
- **Test:** `MA-10: an IPv4-mapped IPv6 address passes the webhook private-network check` (no DB needed).
- **Fix:**
  - parse with `net.BlockList` or `ipaddr.js`;
  - treat IPv4-mapped, IPv4-compatible, NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`) and Teredo addresses by their
    embedded IPv4;
  - add `198.18.0.0/15` and `192.0.0.0/24`;
  - connect to the address that was checked (a custom `lookup` on the agent) rather than resolving twice (see
    "not reproduced": DNS rebinding).

### MA-06 · minor: `GET /v1/actions` ignores API-key scopes

- **Where:** `server/app.ts:100`. Every authenticated caller reads up to 100 actions with full `args` and `result`.
  Tool calls are scope-checked in `Registry.execute`; this route is not.
- **Failure path:** a key scoped to `wallet.get` (say, a billing dashboard) reads the workspace's proposals and
  receipts: invitee emails, contact ids, campaign args, plans. Secrets are kept out of action rows by design
  (`holdForReveal`), which is why this is graded minor.
- **Test:** `MA-06: GET /v1/actions ignores API-key scopes`.
- **Fix:** refuse API keys on `/v1/actions` unless a scope such as `action.list` is granted. Apply the same rule to
  `/v1/audit/verify`.

### MA-02 · minor: `member.remove` survives a change to its target

- **Where:** `modules/workspace/members.ts:86`. There is no `version()`, and `describe()` does not name the person.
- **Failure path:**
  1. An operator proposes removing builder B.
  2. An owner later makes B an owner.
  3. An owner taps the old card ("Remove a person from this workspace"), and an owner is removed. `ownerOnly` passes
     because the approver is an owner, and two owners exist.
- **Other tools with the same pattern:** `apikey.revoke`, `integration.disconnect` and `webhook.delete` also lack a
  `version()`. Their targets cannot change role, so the risk there is lower.
- **Test:** `MA-02: member.remove runs on a stale card after the target was made an owner`.
- **Fix:**
  - set `version: role || ':' || status` (as `member.role.set` does);
  - have `describe` name the person; it needs the email in args or a lookup at proposal.

### MA-03 · minor: a viewer can decline any pending action

- **Where:**
  - `server/app.ts:108`: any member session may post `{approve:false}`.
  - `server/tools.ts:242`: `decline()` checks neither role nor risk class.
- **Failure path:** a viewer, or a compromised low-privilege session, silently cancels owner-only spend and
  compliance-gated policy changes. That denies service to the approval queue. The audit row records it, but nothing
  stops it.
- **Test:** `MA-03: a viewer can cancel any pending approval, including an owner-only spend`.
- **Fix:** let `decline()` load the member and require `canApprove(role, risk)` or proposer == decliner.

### MA-04 · minor: the cookie JSON-only check accepts a text/plain body

- **Where:** `server/auth.ts:93`, which uses `includes('application/json')`. `http.ts:44` then parses the body as JSON
  on the same substring.
- **Failure path:**
  1. `fetch(url, {method:'POST', credentials:'include', headers:{'content-type':'text/plain; charset=application/json'},
     body: JSON.stringify(...)})` needs no preflight. The essence of that content type is `text/plain`, and it has no
     CORS-unsafe bytes.
  2. `SameSite=Lax` stops this cross-site. It does not stop it from a **same-site** origin (any sibling subdomain:
     marketing pages, a status page, a future customer-content host).
  3. From there it reaches every tool, A1 or proposal, and the Operator.
- **Test:** `MA-04: a session cookie accepts a CORS-safelisted text/plain body as JSON`.
- **Fix:** parse the media type and require the essence to equal `application/json`. Optionally also require a custom
  header (e.g. `x-vp-csrf: 1`) or check `Origin` / `Sec-Fetch-Site` on cookie mutations.

## Checked and found sound (no finding)

- **Approval replay.** The row is taken `FOR UPDATE`, its status goes `proposed` → `executed`, and
  `approval_token_once` is unique per action.
- **Approval binding.** The approval is bound to the args hash; the stored args are re-validated and re-hashed.
- **Approval timing.** Expiry is enforced. A member removed or demoted after proposing cannot approve: an active member
  is required, and the role is read live through the session join.
- **Who can approve.** API keys cannot approve (`human_only`). Approval runs `canApprove` on every held class.
- **Ledger.** `reserve` runs under a per-workspace advisory lock and checks wallet `balance - held` plus every cap with
  its tagged holds, so there is no overdraft or cap overrun under concurrency. Settling twice is a no-op. Release after
  settle is a no-op (`status='held'` guard). `settle` charges `min(actual, held)`, records the overrun, and never
  credits.
- **Wallet credit.** It needs the `vp_success` actor type: `roles: []` blocks members, and `run()` refuses any other
  type, agents included. No HTTP route mints a `vp_success` actor.
- **IST.** `money_roll_periods` and `setCap` take the IST date of a `timestamptz`. `cost_line.created_at` is
  `timestamptz`, so the `AT TIME ZONE` direction in `usage()` is right. `msUntilIst` is correct (IST has no DST).
- **Hooks.**
  - `/hooks/runtime` and `/hooks/telephony/kyc` verify the HMAC over the raw body string, with
    `timingSafeEqual` and a ±5 min window.
  - `/hooks/contacts/:id` signs the exact bytes, compares in constant time, uses a ±300 s window and dedups by
    `(source_id, event_id)`.
  - The KYC hook dedups by `(provider, eventId)`. `call.ended` never re-settles.
- **Share links.** The MAC is compared in constant time; the claims carry the workspace, and both expiry and revocation
  are checked.
- **Secrets.**
  - API keys, invites, webhook secrets and share links reach the approver only through `secret_box` (sealed, one read,
    15 min).
  - `integration.stage_secrets` is A1 and its args are never stored.
  - `action.result` holds only reveal ids.
  - The Operator cannot read a reveal: its actor id `operator:<id>` never matches `secret_box.member_id`.
- **`VP_DEV_AUTH`.** The Dockerfile sets `NODE_ENV=production`, and `resolveCaller` checks both values on every
  request.
- **Tenancy.** Every money and workspace query in scope filters by `workspace_id`, or reaches rows through an id
  already scoped that way. `cap.*` checks that a campaign or key `scopeId` belongs to the workspace.

## Discarded or not reproduced

- **DNS rebinding on webhook delivery.** `assertPublic` resolves the name, then `fetch` resolves it again, so a name
  with a 0-TTL can switch to a private address in between. This is a real TOCTOU, but it was not reproduced here: the
  sandbox has no controllable DNS. It is covered by the MA-10 fix (pin the checked address).
- **The G9 hold excludes the per-call carrier pulse and rounds the per-minute price.** `gate.ts:275-278` uses only
  `perMinuteInrMilli` from `money.estimate`. Whether the runtime meters a per-call cost line, and so whether this ever
  overruns, is not known from the code. The customer is protected anyway (`settle` charges `min`).
- **API-key prefix collisions.** Prefixes are 8 hex characters, with no unique index, so a collision makes one key fail
  with 401. The chance is negligible at realistic key counts.
- **The A0 Operator path storing `integration.stage_secrets` args in `action.args`.** At A0, `proposeA0` would store
  the plaintext secrets and show them in the card diff. Not filed: it is in the operator module, outside this scope.
  Flagged for the operator owner to confirm, and to add `integration.stage_secrets` to `A0_EXEMPT` or redact its args.
- **Invalid UTF-8 in hook bodies.** These are decoded before the HMAC, so a sender that signs non-UTF-8 bytes fails
  verification. That is not exploitable.
