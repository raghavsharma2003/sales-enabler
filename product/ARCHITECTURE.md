# Vyakti Platform (VP) — build architecture

The product lives under `product/`, built fresh. The Relay-era `app/`, `lib/`, `components/`
are stale (`directive.2026-10-15.codex-baseline-stale`) and are reference only; the voice lab
(`voicelab/`) is the call-engine reference we port and generalise.

Decisions for this build (each logged in the graph):
- **Control plane:** TypeScript, run with `tsx` on Node 22, no web framework — a small typed
  router on `node:http`. Postgres via `pg`. Reuses the repo's installed deps; no new packages.
- **Voice runtime:** Python (ported from `voicelab/`), generalised from four hard-coded scenarios
  to per-agent configuration, behind the same adapter registry. Runs the finalised stacks; the
  user picks the stack, no default yet (`decision.2026-10-21.stack-choice-no-default`).
- **Database:** Postgres (Neon-compatible). Tenant-aware from the first table; `workspace_id` on
  every row; migrations in `db/migrations/NNNN_*.sql` applied by `scripts/migrate.mjs`.
- **Market:** horizontal — industry-neutral job presets, sector packs add rules
  (`decision.2026-10-21.horizontal-enterprises`).
- **Pricing:** metered in INR per second, no rate card fixed yet (`decision.2026-10-21.pricing-deferred`).
- **Safety by construction:** disclosure, crisis lines, no-OTP/payment, DND and window checks are
  code predicates at one dial gate and one reply door — not prompt text. Every call carries a run
  manifest; approvals that reach a person, spend, publish or change policy are hash-bound (A0-A3).
- **Self-learning:** harness2-style propose/probe/compose, per-tenant, with fixed-horizon tests and
  guardrails; no cross-tenant pooling.

Layout:
- `db/migrations/` schema · `shared/` contracts (TS types + validation + tool registry)
- `server/` control plane (router, modules, tools) · `voice/` Python voice runtime
- `web/` UI · `scripts/` migrate + test runners · `tests/` node:test suites

## Building a module (the contract every parallel builder follows)

- **Where:** `server/modules/<name>/` (code), `tests/<name>.test.ts` (tests), `db/migrations/<range>_<name>*.sql`.
  Migration ranges: intake 01xx, agents 02xx, campaigns 03xx, safety 04xx, operator 05xx, calls 06xx, memory 07xx,
  learning 08xx, money 09xx, workspace 10xx. Never edit 0001-0008 or another module's files; ALTER in your own range.
  Cross-module triggers (owners, note them): workspace's 1020 puts AFTER triggers on `campaign` (state change),
  `suppression` (insert) and `hand_off` (insert), and 1030 one on `wallet` (state into low, empty or overdrawn). They write
  `webhook_outbox` for webhooks and notifications. Renaming those tables or columns breaks the triggers; tell workspace.
- **Shape:** `server/modules/<name>/index.ts` exports `module: Module` (see `server/app.ts`). `register(registry)` adds
  tools with `tool(validator, def)` from `server/tools.ts`. Raw routes only for webhooks, uploads or streams.
- **Tools are the API.** Tool names come from `research/2026-10-21/blueprint/data/workspace-tool-registry.json` (80 ids)
  plus the reads a page needs (`<object>.list`, `<object>.get`). Risk class from that file. A2 tools add `describe()` and,
  when an approval is about a versioned object, `version()`.
- **Kernel pieces to use, not re-invent:** `server/db.ts` (tx/one/many), `server/audit.ts` (the registry audits tool runs;
  call appendAudit yourself only for non-tool writes), `server/ledger.ts` (reserve/settle/release before any paid I/O),
  `server/llm.ts` (the one LLM door; tests use `setFakeLlm`), `shared/safety` (reply door, caller signals, lints),
  `shared/stacks.ts` (no default stack), `shared/agent-config.ts`, `shared/runtime-protocol.ts`, `shared/money.ts`,
  `shared/phone.ts`, `shared/validate.ts`.
- **Tenancy:** every query filters by `workspace_id = ctx.workspaceId`. A test must show another workspace cannot read
  or change your rows.
- **Industry-neutral:** no insurance assumptions in code. Sector rules live in sector packs.
- **Gates:** `npx tsc -p tsconfig.json` clean, `node --import tsx --test tests/<name>.test.ts` green against your own
  database (`vp_mod_<name>` on the throwaway cluster).
- **Tests share one database in CI, four files at a time.** A test that drives a worker or a job body (the dispatcher
  `tick()`, `claimNext`, a sweep) passes its own `workspaceId`. An unscoped call claims other files' rows. That was
  the 2f32449 campaigns/e2e failure, and it looked like load.
- **Cross-module calls go through the registry by tool name** (`registry.execute(pool, 'memory.brief', ...)` with a
  `system` actor), never by importing another module's files. If the tool is not registered (a sibling is not merged
  yet), degrade the way the blueprint says (e.g. memory `not_loaded`), never crash. Shared conventions:
  - `agent_version.config` holds `{ agent: AgentConfig, brief: { text, hash, bytes } }`: the brief is compiled once at
    publish; tickets copy it.
  - `memory.brief` (read, memory module): `{ contactId, agentId }` -> `{ text, status }`, text <= 1200 bytes.
  - `money.estimate` (read, money module): `{ stackId, minutes, calls }` -> `{ perMinuteInrMilli, totalInrMilli, basis }`.
  - `safety.check` (read, safety module): `{ text, ctx }` -> DoorVerdict, for previews.
  - Runtime seam: `server/runtime-client.ts` (`runtime()`, `sign`, `verify`; FakeRuntime when VP_RUNTIME_URL is unset).
- **Background work:** a module returns jobs from `jobs(deps)` (`server/jobs.ts`): `{ name, everyMs | dailyAtIst: 'HH:MM', run }`.
  Jobs never overlap themselves and hold an advisory lock per name, so replicas are safe. main.ts runs them; `VP_JOBS=0`
  makes an API-only replica.
- **Streaming:** a handler may return `{ stream: async (write, closed) => ... }` for Server-Sent Events; `server/llm.ts`
  has `stream(req, onDelta)` and a per-request `model` override.
- **Slow work outside transactions:** a tool that calls an LLM or a provider puts that call in `prepare(ctx, input)`
  (runs first, outside any transaction, reads through `ctx.pool`) and does its writes in `run(ctx, input, prepared)`.
  `redactResult(out)` keeps one-time secrets out of the stored action result. API-key scopes narrow tools by prefix.
