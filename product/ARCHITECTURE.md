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
