# Vyakti Platform (VP) — working notes for whoever picks this up next

VP is a self-serve, Vapi-like voice-agent platform for Indian businesses. The product is **emotional, relational,
exactly-human-sounding Hinglish voice** doing world-class telecalling:
- open with something useful;
- read the person;
- never waste their time;
- get the agenda done subtly.

This repo began as a Codex-built "Relay" studio (`app/`, `lib/`). The owner judged that baseline stale. The voice
research and test lab of 2026-10-18 → 20 live in `research/` and `voicelab/`.

## Read before changing anything

1. **`context/DIRECTION.md`**: the phase now, owner directives in force, standing rules, open threads. It is short.
   Read all of it.
2. **`npm run context -- --brief`**: newest open questions, recent events and **log debt**. A SessionStart hook runs
   this automatically.
3. **`context/PROTOCOL.md`**: how context is kept. That covers the node schema, logging as you go, the pre-compaction
   ritual, and subagent inbox merges.
4. **The graph.** Query `context/graph.json` with `npm run context -- --node <id>` or `npm run context -- --grep <re>`.
   Before proposing anything, check the `rejected.*` and `decision.*` nodes: several obvious ideas here were tried and
   measurably failed.

`AGENTS.md` and `context/STATE.md` are the older continuity record. Where they conflict with DIRECTION.md, the newer
directive wins. Example: Azure-only was superseded for the voice stack by `directive.2026-10-18.provider-open`.

## Context is not optional (owner directive 2026-10-20)

- **Log as you go.** Each owner directive, decision (`reverse_if`), measurement (n, method, date) and rejection
  (what broke) goes into the graph in the turn it happens. Then commit.
- **Before any compaction** (the owner says "compact", or context runs long), run the ritual in PROTOCOL.md:
  - capture every directive, decision, measurement and rejection;
  - add `supersedes` edges and open threads;
  - rewrite DIRECTION.md;
  - run `npm run context:check`;
  - push;
  - then tell the owner it is safe.
- **After a compaction,** clear any log debt the brief reports first. Mine the transcript if needed.

## Standing rules

- **Secrets:**
  - never in the repo, a commit, a log or the chat output;
  - they live only in scratchpad env files (mode 600) and on the lab VM (`/opt/voicelab/.env`);
  - the owner's test phone number stays out of commits.
- **Google credentials** are used only from the India lab VM, rate-limited. Never from the coding sandbox. Never rotate
  free keys across accounts.
- **Shared Azure subscription:**
  - create or modify only in `vp-research-rg`;
  - Taxila's resources and quota are read-only;
  - no paid upgrade without the owner's go.
- **Test integrity:** no model swaps mid-test-call. Results are filed under the combination that actually ran.
- **The agent never denies being an AI.** She discloses once, lightly. No manipulation. Crisis lines stay. Synthetic,
  fictional test data only.
- **Verification:** say "verified" only for what was measured, with n and method. Name what was not verified.
- **Commits and PRs:**
  - no model identifiers;
  - branch `claude/serene-franklin-9w7f1v`;
  - push before the container goes away.
