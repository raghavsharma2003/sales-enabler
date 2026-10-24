# Context protocol

This is a long, deep build. Every session runs out of context sooner or later. Compaction keeps only a summary, and
auto-compaction can happen with no warning. This file is how a fresh session knows what was already decided,
measured and tried, instead of paying to work it out again. Owner directive 2026-10-20
(`directive.2026-10-20.context-before-compact`). **If it isn't logged, it didn't happen.**

## The five layers

| Layer | File | What it holds | How it changes |
|---|---|---|---|
| Direction | `context/DIRECTION.md` | Where we are going right now: phase, owner directives in force, decisions in force, open threads, next step. At most ~150 lines. | **Rewritten** whenever the phase, a directive or the next step changes. |
| Index | `context/graph.json` | Every requirement, decision, measurement, rejection, risk, open question, component and asset, as typed nodes plus edges. | **Append-only.** Change a status or add a `supersedes` edge; never delete. |
| Timeline | `context/events.jsonl` | One dated line per thing that happened. | **Append-only.** |
| Corpora | `research/<date>/…`, `docs/…` | Full write-ups, tables and runbooks. Nodes point at them with `path`. | New files per phase. |
| History | `context/STATE.md` | Checkpoint narrative up to 2026-10-20 (legacy). | New checkpoints go to DIRECTION + events. Add a short dated section only at a phase boundary. |

Read in this order: **DIRECTION.md** → `npm run context -- --brief` → the nodes it names → the corpora they point at.

## Node schema

These rules apply to nodes dated 2026-10-20 or later. `npm run context:check` enforces them. Older nodes are left as
they were.

| type | required beyond id/type/title/status/date/source | rule |
|---|---|---|
| `requirement` | `source: "user"` when it is an owner directive | Paraphrase the directive faithfully. Add `quote` for the words that matter. |
| `decision` | `reverse_if` (+ `rationale`) | A decision with no reversal condition is dogma. It will outlive its reason. |
| `measurement` | `n`, `method` | The date and the n are what make it comparable to a later number. If the result is not in the title, give a `path`. |
| `rejection` | `broke` (+ `tried`) | Say what was tried and what specifically broke. This is the most valuable entry type, and the one most often skipped. |
| `risk` | `mitigation` | |
| `open-question` | `closes_when` | The evidence that would close it. |
| `component` | `path` if it is code | |
| `asset` | `paths`, `value`, `effort` | Something reusable, plus `reusable-for` edges. |

- **IDs:** `<kind>.<YYYY-MM-DD>.<slug>`. The kinds are `directive`, `decision`, `measure`, `rejected`, `risk`, `open`,
  `component`, `asset`, `evidence`.
- **Preferred relations:** `derived-from`, `implements`, `supports`, `challenges`, `supersedes`, `extends`, `informs`,
  `informed-by`, `constrains`, `requires`, `tests`, `leaves-open`, `part-of`, `lives-in`, `reusable-for`, `from`.
- **Superseding:** a superseded node keeps its id. It gets `status: "superseded"` plus a `supersedes` edge from its
  replacement. The history of a wrong turn is what stops it being taken twice.
- **Facts vs inference:** `source: "verified"` means measured or observed by us. `source: "model"` means reasoning. Say
  "inference" in the title when it is one.

## When to log: as you go, not at the end

| When this happens | Log this |
|---|---|
| The owner states a preference, correction or decision | A `directive.*` node and an event, **in the same turn**. |
| We choose something | A `decision.*` node with `reverse_if`. |
| A number is measured | A `measure.*` node with n, method and date. |
| Something fails or is abandoned | A `rejected.*` node with `broke`. |
| Code ships | The commit, plus an event that names what it verified and what it did not. |

**A milestone is a commit.** Logging happens at milestones, so auto-compaction can never lose more than the work since
the last commit.

## Pre-compaction ritual

Run this when the owner says "compact", when the context is long, or before a phase ends.

1. **Owner messages.** Scan the owner's messages since the last ritual. Every directive gets a node, including the
   ones that were acted on and then reversed.
2. **Decisions, measurements, rejections.** Every choice gets a decision node. Every number gets a measurement node.
   Every dead end gets a rejection node.
3. **Supersede, don't delete.** When something replaced something else, add the `supersedes` edge.
4. **Open threads.** Everything the next session must not drop gets an open-question node: pending owner actions,
   expiring credits, unverified claims.
5. **Rewrite `DIRECTION.md`.** Update phase, directives in force, next step and open threads.
6. **Corpora.** Long material (prompts given to the owner, appeal texts, runbooks, tables) goes into `research/` or
   `docs/`, with secrets removed.
7. **Validate and push.** Run `npm run context:check`, then commit and push. The container is ephemeral; anything not
   pushed is lost.
8. **Tell the owner it is safe to compact.**

## After compaction (or at session start)

- **The hook runs the brief.** A SessionStart hook (`.claude/settings.json`) runs `node scripts/context.mjs --brief`.
  It prints DIRECTION.md, the newest open questions and the **log debt**: commits since the last change to `context/`
  that did not touch it.
- **Clear any log debt first.** If the brief shows log debt, mine the full transcript before anything else. Its path
  is in the compaction summary (`~/.claude/projects/…/<session>.jsonl`). Log whatever it shows was missed.

## Subagents and workflows

- **Agents don't edit the graph.** An agent never edits `graph.json` directly. It writes proposals to
  `context/inbox/<name>.json`, shaped as `{"nodes": [...], "edges": [...], "events": [...]}`.
- **The main loop merges and checks them.** It runs `npm run context -- --merge context/inbox/<name>.json`, which
  validates against the schema, skips duplicate ids and appends. Then it runs `npm run context:check`.

## Never in context

- Credentials and keys, including key IDs where avoidable.
- Passwords and OTPs.
- Raw customer PII and phone numbers. Test numbers stay in env files.
- Call transcripts of real people.

Accounts may be named; their secrets may not.

## Tools

```
npm run context                      # summary: counts, directives in force, open questions
npm run context -- --brief           # what the SessionStart hook prints
npm run context -- --node <id>       # one node with its edges in and out
npm run context -- --type decision --since 2026-10-19
npm run context -- --grep vertex     # regex over ids and titles
npm run context -- --debt            # commits not yet reflected in context/
npm run context -- --merge <file>    # merge an inbox proposal
npm run context:check                # validate (CI-style)
```
