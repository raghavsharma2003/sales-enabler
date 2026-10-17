# Harvest: hp-vyakti-completion (html-portfolio, `codex/vyakti-completion`)

## Summary

`codex/vyakti-completion` is **not a separate product line**. It is the Vyakti "Rooms" mainline frozen at the end of the Claude-run build waves on 2026-09-06, with three small commits from Codex on top.

- The base is commit `61385c57`, the "wave twenty planned, not built" handover. That base already holds **590 commits** (451 non-merge) past `gurukul-ws-as`. `gurukul-ws-as` (`298c1599`, 2026-08-27) is a strict ancestor: `git log completion..ws-as` is empty.
- The diff from `gurukul-ws-as` is 782 files, +238,145/-4,820 lines. That covers the whole of waves one through nineteen of Vyakti Rooms (WS-R1 to WS-R140, 2026-09-03 to 2026-09-06) and migrations 071 to 136.
- The Codex part is three commits by `raghavsharma2003` on 2026-09-06: `974b847c`, `35f21efb` and `6260611e`. They add about 200 lines in total. They are a takeover and hardening pass, not new features:
  1. A product-boundary map in `docs/gurukul/CODEX-TAKEOVER.md`.
  2. Windows portability fixes: LF line endings in `.gitattributes`, npm's `.cmd` wrapper in `scripts/check-headers.mjs`, and `fileURLToPath`/`pathToFileURL` in the evals and `scripts/day-one.mjs`.
  3. A fix to fake payment-provider references: they are now keyed by the local subscription row, which closes the wave-19 rejection `ws-r132-fake-provider-deterministic-ref-collides-on-a-genuine-restart`.
  4. CI and Vercel branch filters that admit `codex/vyakti-*`.
  5. A libuv shutdown crash fix in the **first-room CLI** (`scripts/first-room.mjs`): `process.exit` became `process.exitCode`.
- **"Completion" was the intent, not the outcome.** The takeover doc says: "The ten wave-twenty briefs remain the application backlog; no wave is declared complete by these takeover fixes." Nothing from wave twenty (WS-R141 to R150) was built here.
- Later branches build on this tip and descend from it: `claude/vyakti-cloning-platform-aq05n4` (2026-10-11) and `codex/vyakti-azure-authmail-oct10`. For the command centre, this branch is best read as **the last verified snapshot of Rooms before the Azure re-platforming**.

For sales-enabler, the value is the mature **SaaS business plumbing** that Rooms built in 19 waves. It is mostly channel-, billing- and ops-shaped, which is close to what a command centre needs:

- a payment-provider seam with a single webhook door and a ledger that reconciles
- WhatsApp, Telegram and web-push channel transports over one conversation lane
- quiet-hours-aware proactive messaging (check-ins, renewals, dormancy, monthly notes)
- persistent rate limits written as SQL predicates
- an incident ledger with a `withDoor` wrapper
- an ops board, a self-check and a morning digest
- k-anonymous analytics (Pulse, n≥5)
- release-gate harnesses: a leak battery, door batteries, fuzzing, accessibility, performance, security headers and an eval registry worker pool

The rejections are again the highest-value material.

## Branches covered

| branch | tip | date | relation | what differs |
|---|---|---|---|---|
| `codex/vyakti-completion` | `6260611e` | 2026-09-06 | head | Three Codex commits over `61385c57`, described below |
| comparison: `gurukul-ws-as` | `298c1599` | 2026-08-27 | strict ancestor (merge-base = its tip) | Ends at "separate: skip 16kHz sepformer when diarize shows one dominant speaker", the replica/voice ingestion era. Covered in `docs/harvest/hp-gurukul-late.md` |

### `gurukul-ws-as` to `61385c57`: the Rooms waves (Claude main loop plus ten parallel workstreams per wave)

`git log --merges` shows roughly 140 merges from WS-R1 to WS-R140. The themes, in build order:

- **W1–W2 (09-03):**
  - the Room, follower side (R1)
  - readiness score plus a publish lock as an SQL predicate (R3)
  - review queue (R4)
  - interview / Mirror Call (R5)
  - vendor bench (R6)
  - publish (R7)
  - **leak battery: 16,080 cross-follower checks, 0 leaks** (R8)
  - drift watch (R9)
  - the Rooms vocabulary copy gate (R10)
  - **payments ledger behind a provider seam** (R11)
  - week-six retention cohorts (R12)
  - **the first-room CLI and the Phase 0 runbook** (R15)
- **W3–W4 (09-04):**
  - check-ins, follower-scheduled and "never on silence" (R16)
  - Pulse k-anonymous counts (R17, R35)
  - Telegram transport (R18)
  - fair-use ceilings as write predicates (R19)
  - Handoff v0 (R20)
  - ops board and sweep heartbeats (R21)
  - web push (R22)
  - creator applications and invites (R23)
  - Hindi (R24, R52, R61, R71, R82, R106)
  - forget receipts and an export-completeness gate (R27)
  - persistent abuse limits (R26, R32)
  - Suites, the B2B org with seats and billing (R28, R33, R48)
  - WhatsApp utility-template check-ins (R29)
  - payouts and statements (R36)
  - renewals (R37)
  - door battery (R38, R44, R51, R89, R120, R124, R140)
  - accessibility gate (R50)
  - performance budgets (R49)
  - money reconciliation (R42)
  - provider contracts checked against vendor documentation (R41, R60)
- **W5–W19 (09-05/06):**
  - incident ledger (R58)
  - security headers and supply-chain gate (R57)
  - live probe (R64)
  - UPI Autopay (R69, R73, R125, R132)
  - flag-this-reply (R67)
  - creator public page and SEO (R66, R90)
  - creator export (R70)
  - weekly push (R74)
  - self-check cron (R76)
  - dormancy (R75)
  - operator morning digest (R88)
  - Handoff v1 on the relational kernel (R87)
  - share kit and referrals (R85, R86, R130, R133)
  - adversarial follower and creator material batteries (R99, R105, R111, R121)
  - end-to-end rehearsals in real Chromium (R94, R95, R109, R119)
  - follower receipts (R100, R103)
  - the Room on WhatsApp (R104, R115, R126, R136)
  - recall run and scorer calibration (R101, R118)
  - eval registry worker pool (R128)
  - quiet hours on every channel (R129, R131)
  - monthly note (R137)
  - payout statement (R138)
  - lazy chunks (R139)
  - one comment-aware tokenizer for every source scanner (R134)

### The three Codex commits

| commit | what it changes |
|---|---|
| `974b847c` "preserve Vyakti branch setup and subscription restart references" | **Line endings:** `.gitattributes` forces LF for js/mjs/ts/tsx/css/json/html/md/yml. CRLF checkouts had broken the engine-bundle byte check and 6 of 26 monthly-note assertions. **npm on Windows:** `scripts/check-headers.mjs` gains `runNpm`, which invokes `npm-cli.js` through `process.execPath` because `execFile("npm")` cannot launch npm's `.cmd` wrapper on Windows; the old error was misreported as a registry failure. **Branch filters:** `scripts/vercel-build.sh` adds `codex/vyakti-*` to the platform-landing branch family, and the release-gate and APK workflows trigger on `codex/**`. **Payment references:** `api/_payments.js` passes `subscriptionId` on all three subscription lanes (follower, org/Suite, creator); `api/_payments/providers/fake.js` hashes it into the reference; the payments, org-billing and payments-reconcile evals now assert distinct references on restart. **Context:** new entries in `context/{STATE,decisions,measurements,rejected,graph}`, plus `docs/gurukul/CODEX-TAKEOVER.md`. |
| `35f21efb` "retain payment price witness and portable CLI paths" | The fake reference seed goes back to `label:ref:priceInr:subscriptionId`, because `evals/suites-self-serve` uses the hash as a *price witness* (it proves that seats × ₹2,999 reached the provider). `evals/handoff/run.mjs` uses `fileURLToPath`. The `scripts/day-one.mjs` entry guard uses `pathToFileURL(argv[1]).href`; on Windows the CLI had silently never run. `evals/first-room/run.mjs` prints child stderr when the happy path fails. |
| `6260611e` "let first-room CLI finish pending handles before exit" | `scripts/first-room.mjs` replaces the final `process.exit(code)` with `process.exitCode = code`. The forced exit crashed Node 24 on Windows with `UV_HANDLE_CLOSING` (exit 3221226505) while HTTP handles were still closing. After the change, n=5 consecutive runs passed 165/165. |

## Product

This is the state of Vyakti on 2026-09-06 according to `context/STATE.md` and `docs/gurukul/CODEX-TAKEOVER.md`.

**Vyakti** is the lab or company. Its external product is **Rooms**. A creator (the first wedge was JEE teachers) builds an AI replica of themselves from their own material and voice in a Studio. They publish it as a Room at `/r/<slug>`. Followers join through the web, an installable PWA, Telegram, WhatsApp or an embed on the creator's site. A follower pays ₹299–599 a month through Razorpay/UPI Autopay, and the platform keeps 25%.

Each follower gets a private, memory-bearing relationship with the replica. Follower data never flows to the creator or to other followers. The leak battery holds that boundary, and Pulse gives the creator only k-anonymous counts with n≥5.

The B2B unit is **Suites**: an organisation owns seats and billing for several Rooms, but never combines follower conversations.

The internal layers each have one owner:

- **RelationalOS** is the identity, memory and disclosure engine; Maya/Meera was its first implementation.
- **Replica Lab/Studio** handles evidence, voice and calibration.
- **GroupAI** owns the richer group kernel; Rooms Handoff is a flagged subset of it.

**What is actually built and verified (offline, by gates):**

- every wave's features listed above
- all 21 release-gate checks green at `77e0151`, as recorded in the wave-19 close paragraph of STATE.md
- migrations through 136 applied to live Neon, with every statement checked by EXPLAIN

**What is not live:**

- Both Vercel projects had `NEON_URL` and every key unset at the handover, so the application was not running for real users.
- Owner voice likeness is unproven. The takeover doc says the supplied handover "records missing application deployment configuration and unproven owner voice likeness".
- Razorpay "has never been called"; it is verified only against its documentation (`api/_payments.js` header).
- Wave twenty (R141–R150) exists only as briefs: fixtures that execute the real predicates, quiet-hours backfill, room budgets set from measurement, proactive messages in the recipient's language, a personal link on every channel, rate-limit coverage as a property, a flake ledger, the review queue at scale, Suite seat invites, and Handoff on Telegram.

**The first-room CLI** (`scripts/first-room.mjs`, 425 lines, from WS-R15) is the "Phase 0: hand-build one Room for one real creator" rehearsal. Given a consented owner's bearer token and a WAV file, it walks this chain against a live deployment:

probe → replica → consent → upload → processing DAG (polling at the server's own `next_poll_ms`) → readiness → review queue → room create → room publish → a second session as follower: open → join → say → history → forget

Its two laws:

1. **No step is ever skipped silently.** A missing env var is a printed SKIP row. A blocked step is a BLOCKED row that names each blocker and says whether it is waiting on you or on us.
2. **Nothing is invented.** A step counts as OK only after a real 2xx with a parseable body; a 200 with an empty body counts as a failure.

`evals/first-room/run.mjs` (33 checks) drives the CLI against fake JSON servers, including refusals and empty-body negative controls. Its sibling is `scripts/day-one.mjs` with `dayOneRunbook.mjs`: a 23-step table from stub config to the first published Room, which can be checked for free against a deployment.

## Architecture & stack

- **Runtime:** Vercel serverless, as plain JS ESM in `api/*.js` (251 files). The thin "doors" (`api/room.js`, `payments.js`, `org.js`, ...) dispatch an `op` to decision modules (`api/_room-surface.js` at 3,900 lines, `api/_payments.js` at 2,915, `_checkins.js`, `_pulse.js`, `_room-telegram.js`, `_room-whatsapp-chat.js`, `_org.js`, `_ops.js`, `_incidents.js`, `_rate-limit.js`, `_quiet-hours.js`, ...). The house rule is that "a decision in a handler is a decision no offline eval can reach", so every decision lives in a module the evals import directly.
- **Data:** Neon Postgres over SQL-over-HTTP (`api/_db.js`), with schema in `db/schema.sql` and `db/migrations/` (through 136). Supabase is used for auth (Google OAuth and email OTP) and private object storage. Replica media moved to Azure Blob in late August (`d137607f` and the commits around it).
- **AI:**
  - The Room reply lane compiles the persona through `src/engine` (`engine.compile()` and `buildSystemPromptParts`), passes it through `gatedReply` (the honesty gate plus never-rules), and calls **OpenRouter `google/gemini-3.6-flash`** (`api/_surface.js:297-313`).
  - Memory extraction uses Azure grok-4-1-fast (`context/architecture.md` model map).
  - Voice comes from a self-hosted stack on **Azure Container Apps serverless T4 GPU**: `services/open-voice-runtime` (chatterbox-multilingual, PerTh watermark) and `services/voice-evidence` (ECAPA/x-vector), reached through an HMAC admission broker. The processing worker runs as an ACA Job. Sarvam handles ASR.
- **Client:** React 19, TypeScript and Vite. Pages are `studio.html` and `room.html`, with fixture pages for the layout gate. The Android APK is built with Capacitor.
- **Gates:**
  - `node scripts/verify-release.mjs` runs 21 checks without `NEON_URL` and 23 with it: tsc, prompt budget, build, the eval registry (213 suites), the leak battery, export completeness, the door battery, layout, accessibility (axe WCAG 2.1 AA plus a keyboard walk), performance budgets (mid-range Android on slow 4G), security headers and supply chain, the engine-bundle freshness check, copy, mirrors and others.
  - CI runs the gate on Node 22 and 24 (`.github/workflows/release-gate.yml`).
- **Process:** about ten parallel agent workstreams per wave, each in its own worktree, with append-only shared files. Merges use `scripts/merge-tools/` (`context-union.mjs`, `graph-union.py`, `keep-both.py`, `keep-both-copy.py`, `gate-retry.sh`), and the full gate runs after every merge. Migrations are applied live one statement at a time, followed by a catalog read-back and an EXPLAIN of each new statement. `context/` is about 4.1 MB of decisions, measurements and rejections: 1,835 nodes and 2,077 edges.

## Reusable assets

| asset | paths | maturity | reuse for | effort |
|---|---|---|---|---|
| Payment provider seam (fake/razorpay twins, one HMAC webhook door, tier flip as an SQL predicate in the same statement as the webhook write, three subscription lanes) | `api/_payments.js`, `api/_payments/providers/{fake,razorpay}.js`, `evals/payments/`, `evals/payments-reconcile/`, `evals/org-billing/` | tested (offline; Razorpay never called live) | erp, crm | adapt |
| Fake-provider reference contract (same row → same reference; new row → new reference; unkeyed → random; seed still witnesses the price) | `api/_payments/providers/fake.js` (`35f21efb`) | tested | erp, eval-quality | drop-in |
| Persistent rate limit where one upsert *is* the check (a caller at the limit gets zero rows back, so it is race-safe) | `api/_rate-limit.js`, `evals/rate-limit/` | production-shaped, tested | safety, auth-tenancy, omnichannel | drop-in |
| Incident ledger plus `withDoor` wrapper (content-free daily counts per kind/door/status; never throws; alert on a new kind) | `api/_incidents.js`, `evals/incidents/` | tested | infra-ops, orchestration | drop-in |
| Ops board, self-check cron reading an env manifest, operator morning digest over Telegram | `api/_ops.js`, `scripts/build-env-manifest.mjs`, `scripts/envManifest.mjs`, `docs/gurukul/ENV-MANIFEST.md`, `evals/ops`, `evals/self-check`, `evals/operator-digest`, `evals/operator-telegram` | tested | infra-ops, analytics | adapt |
| Channel transports over one conversation lane (Telegram bot with voice notes; WhatsApp Cloud API with templates, 24-hour window, reply buttons ≤3, one-Room-per-phone pointer keyed by salted hash; web push; embed) | `api/_room-telegram.js`, `api/_room-whatsapp.js`, `api/_room-whatsapp-chat.js`, `api/_push.js`, `api/_room-push.js`, `api/_room-embed.js`, `api/_channel-secrets.js` | tested against fake provider servers; contracts checked against vendor docs | omnichannel, chat-agent | adapt |
| Proactive messaging with quiet hours (one shared SQL fragment used by every due-select; follower time zone; idempotency row per period; "never on silence") | `api/_checkins.js`, `api/_quiet-hours.js`, `api/_renewals.js`, `api/_dormancy.js`, `api/_room-month-note.js`, `api/_org-weekly-note.js` | tested | campaigns, omnichannel | adapt |
| Pulse: k-anonymous counts (never below 5, never verbatim) over an opt-in shared subgraph | `api/_pulse.js`, `evals/pulse/` | tested | analytics, company-brain, safety | adapt |
| Leak battery (scenario generator × real SQL predicate, row-by-scenario counts, negative controls that must fail; 16,080 checks, 0 leaks) | `evals/room-leak/run.mjs`, `evals/room/fixtures.mjs`, `evals/mp/gate0.mjs` | tested | auth-tenancy, safety, eval-quality | adapt |
| Door battery (doors and ops found by a bounded import walk; body-shape fuzzing with 1,440 op × class cases; time/order interleavings with 354 cases; SQL markers so a fake db detects whether the guard is present instead of re-implementing it) | `evals/room-doors/`, `evals/dbattery/` | tested | eval-quality, safety | adapt |
| Never-rules predicate at the single reply door (`compileNeverRules`, `gatedReply`, one shared reader for every lane) | `api/_never-rules.js`, `api/_review-queue.js`, `api/_surface.js`, `api/_room-surface.js::roomNeverRules` | tested | chat-agent, voice-agent, safety | adapt |
| Material block: creator-authored text compiled as delimited data plus an ingest-time instruction detector (41/41 hostile passages contained, 0/9 secret leaks) | `src/engine/persona.ts`, `src/engine/compiler.ts`, `evals/room-adversarial-creator/` | tested | company-brain, safety, chat-agent | adapt |
| Eval registry worker pool (port-free suites in a pool, fixed-port lane, `--serial` baseline, parity check) | `evals/run.mjs`, `evals/runner-lib.mjs`, `evals/registry-runner/` | tested | eval-quality | drop-in |
| Release gate composition (performance/a11y/headers/layout/copy/mirrors) | `scripts/verify-release.mjs`, `scripts/check-{accessibility,performance,headers,layout,copy,mirrors,motion,contrast}.mjs`, `.github/workflows/release-gate.yml` | production | infra-ops, design-ui, eval-quality | adapt |
| Comment-aware tokenizer for source scanners | WS-R134 (`scripts/`, `evals/source-scan/`) | tested | eval-quality | drop-in |
| First-room / day-one walk CLIs (stage table, SKIP/BLOCKED rows that name the blocker, a 2xx with an empty body counts as failure, report variables declared before the first throw) | `scripts/first-room.mjs`, `scripts/first-clone.mjs`, `scripts/day-one.mjs`, `scripts/dayOneRunbook.mjs`, `evals/first-room/`, `evals/day-one/` | tested (offline) | orchestration, infra-ops | adapt |
| Live probe of a deployment | `scripts/probe-live.mjs`, `scripts/probeLiveExpectations.mjs` | tested | infra-ops | adapt |
| Suites: B2B org, seats, seat-covers-tier, transparency page | `api/_org.js`, `api/_creator-tier.js`, `evals/suites-self-serve`, `evals/suites-about` | tested | auth-tenancy, erp, crm | adapt |
| Payouts, receipts numbered per financial year in one atomic claim, receipt backfill sweep, printable statements | `api/_payout-statement-readable.js`, payout sections of `api/_payments.js`, `api/_receipt.js`, `evals/room-receipt`, `evals/receipt-sweep`, `evals/payout-statement-readable` | tested | erp | adapt |
| Referral reward (decided inside the webhook's own statement family, capped by year, exactly one grant under a race) | `api/_payments.js` (R130/R133 sections), `evals/room-referrals` | tested | campaigns, crm | adapt |
| Funnel and retention cohorts (minutes to first Room, week-six cohorts as rows) | `api/_room-cohorts.js`, `evals/funnel`, `evals/room-cohorts` | tested | analytics | adapt |
| Bilingual copy table with copy gate and lazy locale chunks | `src/studio/copy.ts`, `scripts/check-copy.mjs`, `scripts/roomsVocabAllowlist.mjs` | production | design-ui | adapt |
| Context memory system (graph, decisions with reversal conditions, measurements with n/method/date, rejections) plus the merge tools for parallel agents | `context/`, `scripts/context.mjs`, `scripts/merge-tools/*` | production | orchestration, memory-learning | drop-in |
| Windows/CRLF portability fixes (`runNpm`, `pathToFileURL` entry guard, LF `.gitattributes`) | `scripts/check-headers.mjs`, `scripts/day-one.mjs`, `.gitattributes` | tested | infra-ops | drop-in |

## Measured lessons

All of these are cited from `context/measurements.md` and `context/rejected.md` at this tip.

- **Codex baseline:** n=1 untouched-tree release run on Windows with Node 24.13.0 at `61385c57`. **7 of 21 failed.** CRLF checkout was the cause of the engine-bundle and monthly-note failures; normalizing to LF changed monthly-note from 20/6 to 26/0 with no logic edit. Layout and performance reported "ok" while skipping internally for lack of Chromium (`codex-windows-untouched-baseline-2026-09-06`).
- **Reference fix:** payments 148/0, org-billing 69/0, payments-reconcile 52/0. These are offline fixture proofs, not SQL-parser or production evidence (`codex-subscription-reference-regression-2026-09-06`).
- **Windows full gate after the fixes:** 19/21. Remaining failures were performance (TBT above 300 ms on five targets; Studio LCP 2,572–2,580 ms against a 2,500 ms budget) and four eval suites. Hosted CI run 34029430576 at `974b847c` passed 20/21, failing only suites-self-serve. After `35f21efb` the registry failed only first-room. After `6260611e`, five consecutive runs passed 165/165.
- **Isolation as a SQL predicate versus a prompt instruction** (gate0, inherited): across 494 scenarios and 31,122 checks, the prompt-instruction arm leaked 57–98% and the SQL predicate leaked 0. The negative control caught 162. The Rooms leak battery: 16,080 cross-follower checks, 0 leaks.
- **Material block:** contained hostile passages went from 25/41 to 41/41, and secret-shaped leaks from 2/5 to 0/9, once creator fields compiled as delimited data (R111, R121). The ingest-time detector measured 100% recall with zero false positives on its set (R105).
- **Recall scorer calibration:** 49/60 to 60/60 on a 60-case keyed set after fixing a bug that stripped Devanagari matras (R118).
- **Door battery:** body-shape fuzzing ran 1,440 op × class cases (R124). The time/order pass ran 354 interleavings over four scenarios and found that a stale webhook could regress a subscription's state or period and that a reminder could go to a cancelled subscription; both were closed in SQL (R140).
- **Performance:** the Room's English JS went from 90.8 KB to 80.2 KB through its own chunks (R139). The Hindi chunk wait measured 870–879 ms against an 800 ms budget until the split; the sign-in screen then loaded 5.6 KB instead of the whole table (R106, R113).
- **GPU voice on ACA** (inherited from `docs/gurukul/AZURE-DEPLOY-STATE.md`):
  - Warm synthesis runs at real-time factor 0.79 on T4.
  - A cold start takes **161 s** (runtime) and **176 s** (evidence), which does not fit inside a request.
  - The HMAC window is 60 s, so a request that wakes the service fails as a signature error. Wake on `/healthz` first.

## Rejected/failed approaches

| tried | what broke |
|---|---|
| Deterministic fake-provider reference from `(label, ref, price)` (`ws-r132-...`) | A genuine restart after a halted mandate re-mints the same reference. The unique `(provider, provider_subscription_ref)` index would throw 23505 against a real staging DB. Codex keyed it by subscription row. |
| Keying the fake reference **only** by row id (Codex's first attempt, `974b847c`) | It erased the Suite eval's price witness, where the hash proved that seats × price reached the provider. It was reverted to `label:ref:price:rowId` in `35f21efb`. |
| Treating the outer runner's "ok" as browser evidence (`codex-windows-green-summary-is-not-browser-evidence`) | Layout and performance skipped with exit 0 for lack of Chromium, and the summary hid it. Separately, an npm `.cmd` launch failure was misread as a registry failure, and a CRLF mismatch was misread as a changed bundle. |
| `process.exit()` at the end of an HTTP CLI | Windows libuv crashed with `UV_HANDLE_CLOSING`. Set `process.exitCode` and let handles drain. |
| Never-rules carried as an optional argument that defaults to `[]` (`room-reply-lanes-carried-no-never-rules`) | For three days the follower `say`, `taste` and check-in lanes enforced no creator rules while every suite stayed green. Fixed with one reader shared by all lanes. Lesson: grep for the CALLER that passes the argument. |
| Creator material concatenated into instruction sentences (`ws-r105-no-material-instruction-boundary-in-the-compiler`) | There was no data/instruction boundary, so injected creator text acted as instructions. It was replaced by a delimited material block plus an ingest-time detector. |
| A fake DB that re-implements the guard it is testing (`ws-r140-fake-db-reimplemented-the-fix-instead-of-detecting-it`) | The battery passed 10/10 even with the fix reverted, which makes it a tautology. Replaced with SQL markers that the fake detects in the caller's SQL text, plus a frozen pre-fix negative control. |
| "Any write under a poisoned db is a finding" (`ws-r124-blanket-any-write-is-unsafe...`) | 103 false positives across 8 doors. A finding must compare what would be written against what the fuzzer injected. |
| New eval file without a registry entry (`ws-r98-unregistered-eval-suite-passes-silently`) | The gate said "ok" without ever running the file. Register a suite in the same edit that creates it. |
| `pkill` by pattern on a shared machine (`ws-r98-pkill-...`) | It killed a sibling agent's processes. |
| SQL-substring-matched fixtures (`ws-r95`, `ws-r100`, `ws-r104`, `ws-r138` collisions) | A more general matcher shadowed a more specific statement, or a list query was swallowed by a single-row matcher. This happened repeatedly, so fixtures need per-statement keys. |
| Backticks inside SQL comments in JS template literals (`ws-r112`, `ws-r130`, `ws-r122`, `ws-r135`) | They terminated the template literal or desynchronised source-scanning regexes. Fixed with one comment-aware tokenizer (R134). |
| A second CTE writing the same table in one statement (`ws-r125-mandate-state-as-a-second-cte-on-the-same-table`) | Postgres data-modifying CTEs on the same row are unsafe. Fold the write into the single UPDATE. |
| `Intl.supportedValuesOf('timeZone')` as a validator (`ws-r131`) | It rejects `Asia/Kolkata` in some runtimes. |
| Native `<input type=time>` (`ws-r131`) | It ate Tab stops in headless Chromium, which breaks the keyboard accessibility walk. |
| Silence-triggered proactive pings (STATE laws: `clone-initiative-record-has-no-absence`) | Banned on every surface. A clone speaks first only for a citable reason. |
| WhatsApp phone-number id used as a dialable number (`ws-r136`) | It is never dialable. Use the display number from an env var or a live read, and refuse it if it is not E.164. |
| Lossy Telegram voice transcode (`ws-r114`) | Not built, because the watermark's survival through lossy encoding is unproven. WAV is sent and flagged as non-conforming. |
| Unbounded transitive door discovery (`ws-r120`) | It exploded through hub modules. A bounded import walk is required. |

## Risks/landmines

- **The name overstates.** "Completion" completed nothing in the product backlog. Wave twenty is unbuilt, and the application was not configured live at handover (no `NEON_URL` or keys on Vercel).
- **Non-Azure AI and services:**
  - The Room reply LLM is OpenRouter Gemini (`api/_surface.js`).
  - ASR is Sarvam.
  - Auth and storage use Supabase.
  - Payments use Razorpay.
  - Messaging uses Meta WhatsApp and Telegram.

  For an Azure-only command centre, the LLM and ASR lanes must be swapped. The patterns survive; the provider calls do not.
- **Scale of context.** `context/` is more than 4 MB, and STATE.md alone is 808 KB. Codex itself notes that "graph validity proves links exist, not that every old status is current". Read the latest dated entry for any topic.
- **Offline proofs dominate.** Most evals use mocked databases. The repo's own law is that "a mock cannot tell you the statement parses", so EXPLAIN against a real database is required. Razorpay, WhatsApp and Telegram were only checked against vendor documentation and fake servers.
- **Coupling.** The Rooms modules lean on the RelationalOS engine (`src/engine/*`, persona compiler, `_surface.js` gate), whose companion origins (romance boundary, persona text) are not product-neutral.
- **Performance budgets are flaky under machine load.** This affects the Windows gate and is recorded in several rejections (R118, R121, R128, R139).
- **Scale-to-zero GPU cold start** (161–176 s) is unresolved for any synchronous voice path.
- **Branch-pattern deploy selection** (`vercel-build.sh` case on the branch name) is fragile. The repo's own law: "a feature branch must never match another product's deploy trigger."

## Azure dependencies

The Azure resources this tree references or created (names come from the docs; no resources were touched):

- **`vyakti-voice`**: resource group / Container Apps environment for the self-hosted voice stack. It holds the `open-voice-runtime` and `voice-evidence` Container Apps (serverless T4 GPU, internal ingress, HMAC admission broker), `replica-processing-worker` (an ACA Job), `audio-protection` (CPU), and a container registry for the images. Fine-tuning resources from WS-U also live here (`docs/gurukul/AZURE-DEPLOY-STATE.md` §13).
- **Azure Blob Storage** for replica media uploads (`d137607f`, with CRC64 headers encoded little-endian in `7d1c9e8d`), plus Key Vault signing for C2PA in `audio-protection`.
- **Azure OpenAI / Foundry (East US 2):** grok-4-1-fast-reasoning for memory extraction, and text-embedding-3-small (`api/_embed.js` is the OpenRouter/Azure embedding path).
- The **Codex commits add no Azure dependency**. They state: "No migration, paid provider call, GPU change, live configuration change or deployment has been performed here."

## Recommendation for sales-enabler

1. **Take the business-plumbing patterns, not the Rooms product.** The highest-value reusable code for a command centre:
   - the payment provider seam and ledger, for ERP billing and subscriptions
   - the persistent SQL-predicate rate limit
   - `withDoor` plus the incident ledger
   - the ops board, self-check, env manifest and morning digest, for orchestration and ops
   - the channel transports with quiet hours and template discipline (WhatsApp, Telegram, push), for omnichannel and campaigns, with ACS email as the Azure-native addition
   - Pulse k-anonymity, for analytics over customer data

   Port these as modules with the same "decision module, thin door" split, so that every decision stays reachable by offline evals.
2. **Adopt the test harness philosophy wholesale.** Specifically:
   - the leak battery (tenant isolation as an SQL predicate, with negative controls that must fail)
   - the door battery with bounded import-walk discovery and SQL-marker detection, never a fake db that re-implements the guard
   - the eval registry worker pool, with registration enforced in the same edit as the suite file
   - one comment-aware tokenizer for every source scanner

   Multi-tenant CRM/ERP data makes the leak battery directly applicable: tenant → workspace → contact.
3. **Carry the walk-CLI pattern** (`first-room.mjs`, `day-one.mjs`) as a "first tenant" and "first campaign" rehearsal. Print every stage with its real response, use named SKIP and BLOCKED rows, count an empty 2xx as a failure, declare report variables before the first throw, and finish with `process.exitCode` rather than `process.exit`. That last item is Codex's measured Windows crash fix.
4. **Swap providers for Azure:**
   - OpenRouter Gemini becomes Azure OpenAI/Foundry behind the same `gatedReply` and never-rules door.
   - Sarvam ASR becomes Azure Speech.
   - Supabase auth gets an Azure or Neon-compatible replacement.
   - Keep Razorpay only if Indian payments are in scope; it is not AI or compute, so the Azure-only rule does not bind it.
5. **Inherit the rejections list as a checklist.** In particular:
   - optional safety arguments defaulting to empty
   - creator or customer material concatenated into instruction text (needs a delimited material block plus an ingest detector, which matters for a company brain that ingests documents)
   - deterministic fake references that collide on restart
   - a CI "ok" that hides skipped browser gates
   - silence-triggered proactive outreach (relevant to campaign automation: outreach should need a citable reason)
6. **Do not inherit** the 4 MB monolithic context files or the branch-name deploy selection. Keep `context/` per-topic and dated from day one, and configure deploy targets explicitly per project.
