# Harvest: hp-maya-latest (html-portfolio, the latest Meera/Maya line)

Repo: `/home/user/html-portfolio`. Read-only inspection through a detached worktree at `origin/codex/meera-forget-integrity-oct09`; the other two branches were compared with `git log` and `git diff`.

## Summary

These three branches are the newest Meera/Maya work. Maya is a Hinglish AI companion with chat, live voice calls and screen watching, served at maya.vyakti.ai and meera-silk.vercel.app. All three sit 37 or 38 commits ahead of `origin/main` (3a921798, 2026-08-25, "Merge Maya: world layer, RelationalOS split, resilience stack, launch fixes (PR #3)") and 0 behind it. So the world layer, the RelationalOS split and the resilience ladder (`api/_lanes.js`) are already on main. This cluster adds work on top of them:

1. **The 2026-08-25 hardening wave**:
   - RelationalOS R3, which brought the character residue in the core to 0
   - the never-internals safety floor, plus a deterministic output fence for it (`internalsFence.ts`)
   - a 208-attack behavioral battery with predicate graders and severity tiers
   - a repeat/loop fence
   - chess "gamefeel" fixes: board-truth fence, adaptive strength, weighted opening variety
   - WS-COST: explicit Google `cachedContents`, measured at -77%, plus a flag-gated paid lane
   - the WS-OBS ops event stream, and the story of how it was found dead
   - a DPDP memory-consent screen with an append-only consent ledger
   - Play Store pack, market research, and an owner strategy reweight
2. **The 2026-10-04/05 incident response**:
   - a shared-password server gate (HMAC token) in front of the cost-bearing endpoints
   - "forget requires asking": after a model-emitted `[forget]` marker irrecoverably deleted 44 rows of a call, the engine now checks the user's own words in code
   - a fix for a clock leak in the compiler
3. **2026-10-09 (codex branch only)**: a partial-forget episode-integrity SQL repair, backported from Vyakti commit `ecc8b6a2`.
4. **2026-10-14 (claude branches only)**: canonical and og tags now point at maya.vyakti.ai.

For a command-centre product, the most valuable material here is the patterns, not the companion features:

- safety by predicate, not by prompt instruction
- a classifier-driven upstream failure ladder
- a per-lane caching cost model
- an observability path that does not count as proven until a row is read back
- an LLM-triggered destructive action that requires verifying the human's ask
- an append-only consent ledger
- an attack battery with severity tiers
- a CharacterSheet/OS split, which is directly analogous to multi-agent personas for voice and chat sales agents

## Branches covered

| branch | tip | date | relation |
|---|---|---|---|
| `claude/zen-keller-dydb02` | f630bd87 | 2026-10-14 | 37 over main. Ends with "previews: canonicals and og tags name maya.vyakti.ai". This is the PR #9 source. |
| `claude/ai-companion-app-rkt1lv` | f4f78ade | 2026-10-14 | Same tree as zen-keller plus the merge commit "Merge PR #9". `git log zen..ai` shows only the merge. Functionally identical. |
| `codex/meera-forget-integrity-oct09` | 32f15233 | 2026-10-09 | Forks at 11f213ae (the commit production runs), then adds `ade274cb` "Fix Meera partial-forget episode integrity" and `32f15233` "Record Meera integrity branch gate". It does NOT have the previews commit, and the claude branches do NOT have the forget-integrity fix. **These two lines diverge and need merging.** |

Differences codex vs claude (`git diff --stat`): `api/memory.js` (+26, the `purgeRelational` CTEs), new `evals/forget/episode-integrity.mjs` (98 lines, 5 assertions including 4 negative controls), `evals/run.mjs` registration, context entries; and on the claude side, `index.html`, `site/index.html`, `site/privacy.html` and `site/delete-account.html` changed host strings only. Functional BASE URLs, auth redirect, Capacitor and the OTA manifest deliberately still point at meera-silk.vercel.app, because anonymous users' state lives in that origin's storage.

Shared 36 commits (main..11f213ae), all on 2026-08-25 except the last two (2026-10-04/05). Totals main→codex: 114 files, +15,367/−4,433. Most of that is context, evals and `evals/dbattery/judges.json`.

## Product

Maya is a premium Hinglish companion:

- **Channels.** Texting with burst pacing; Gemini Live speech-to-speech calls, with a cascade fallback; screen watching during calls.
- **Shared activities.** Chess, tic-tac-toe and would-you-rather.
- **Memory.** A memory graph with episodes, relationship state and disclosure.
- **The world layer.** A painted sky driven by the IST clock.
- **Surfaces.** Web plus a Capacitor Android APK. Telegram adapter is live; WhatsApp and Discord adapters are code-complete.

State on these branches:

- **Production.** Runs 11f213ae. The password gate is live (`ACCESS_PASSWORD` set 2026-10-05).
- **Play Store.** Explicitly DEFERRED by the owner (`session-2026-08-25-close`). The submission pack is ready in `docs/playstore/`.
- **Memory consent.** Shipped client-side. Migration 016 was awaiting owner apply.
- **Paid lane.** Built but OFF. Flipping it is gated on an equivalence run that the judge saga has blocked: all 8 judge families fail the 0.80 bar.
- **Forget-retention policy** ("new session, keep everything"). Owner chose it; it is OPEN and not built.
- **Partial-forget episode fix.** Exists only on the codex branch. It passed Linux CI run 37915705076 on `ade274cb`, with no deploy and no DB mutation.

Strategy notes (`owned-product-first`): the NRI elder companion is the cost-justified wedge, plus global diaspora pricing. B2B is to be done "only opportunistically, to non-tech businesses". The market sweep (`docs/research/market-sweep-2026-08-25.md`) found:

- Indian B2B voice-agent pricing is ₹3–65/min, against ₹1.3/min COGS.
- TRAI outbound-AI rules have been in force since 2026-03-10.
- DPDP takes full effect on 2027-05-14.

All three are directly relevant to sales-enabler's voice-calling and lead-gen plans.

## Architecture & stack

- **Client.** React + TS (Vite), Capacitor Android. `src/engine/` holds the RelationalOS engine (compiler, memory, honesty gates, fences, activities), bundled into `api/_engine.gen.js` for server reuse.
- **Server.** Vercel serverless functions in plain JS ESM under `api/`. `_`-prefixed files are libraries.
- **Data.** Neon Postgres over SQL-over-HTTP (`api/_db.js`, no transactions, so each statement must leave a consistent state). Supabase handles auth and photo storage only.
- **Model lanes** (`api/_lanes.js`):
  - text order: `gemini-free` (labeled pool of ~51 free AI Studio keys) → [`gemini-paid`, flag] → `openrouter` → `azure` (grant: `grok-4-20-non-reasoning`)
  - attachments: Azure FIRST, because Foundry multimodal measured 5/5 correct with 0 fabricated
- **Live voice.** `gemini-3.1-flash-live-preview`. TTS is `gemini-3.1-flash-tts-preview`. Memory extraction runs on Azure `grok-4-1-fast-reasoning`.
- **Prompt architecture.** `compile()` is one assembler for every lane. Its output is a byte-stable CORE (about 48.7 KB, never truncated, holding the safety floors: AI-honesty, crisis, never-internals) plus a volatile TAIL. The CORE is the cache unit; the prompt budget gate throws on overflow. The persona is a CharacterSheet (about 60 typed string fields, `src/engine/agents/characters/types.ts`) interpolated into a character-agnostic Relational Core. Kabir, a second persona, passed 412/412 invariants with zero engine changes.
- **Output path** (the same on every surface):
  1. `parseBubbles`
  2. `stripTextingDashes`
  3. `guardReply` (honesty families 1–4)
  4. the internals fence and the loop fence, each allowed one unstreamed re-draft; on streamed lanes they arm the next turn instead
- **Context system.** `context/{decisions,rejected,measurements,architecture}.md` + `graph.json`, validated by `scripts/context.mjs --check`. At this point it holds 115 decisions, 94 rejections and 104 measurements.

## Reusable assets

| asset | paths | maturity | reuse for | effort |
|---|---|---|---|---|
| Upstream failure ladder (single classifier: quota/transient/deterministic/empty_200; same-key retry with a wall-clock deadline; lane order as visible constants; flag-off returns the frozen array by identity) | `api/_lanes.js`, `api/_gkeys.js`, `evals/resilience/run.mjs` | tested (fake clock and fake upstream eval; latency measured) | orchestration, voice-agent, chat-agent, infra-ops | adapt (swap Gemini pool for Azure deployments/regions) |
| Labeled key pool with family cooling and two-phase fuse (fast fuse, then one long fuse before the paid lane) | `api/_gkeys.js`, `api/speech.js`, `docs/KEYRING.md` | production | infra-ops, voice-agent | adapt |
| Explicit prompt-cache manager (SHA-256 of core bytes as key, TTL as GC, at most one PATCH per minute, dead-name→recreate→fallback) | `api/_gcache.js`, `api/_gnative.js`, `evals/resilience/paid-cache.mjs` | tested (live-verified −77%) | chat-agent, orchestration, company-brain | idea-only/adapt (Google-specific API; the pattern maps to Azure OpenAI prompt caching, which is automatic: measure, don't assume) |
| Internals fence: deterministic output predicate for vendor/model/architecture disclosure, three severe shapes (confirmation/volunteered/claim) with documented non-fire cases | `src/engine/internalsFence.ts`, `evals/behavioral/fence.mjs` | tested (2/2 severe caught, 0/205 false positives offline) | safety, voice-agent, chat-agent | adapt (Hinglish lexicon) |
| Loop/repeat fence + `rel.raised` (pure function of transcript; who-uses-it discriminator, no stoplist; Jaccard 0.8 self-repeat detector) | `src/engine/repeat.ts`, `evals/repeat.mjs` | tested | chat-agent, voice-agent | drop-in |
| Behavioral attack battery (208 turns, Hinglish twins, predicate graders with severity tiers, cash cap enforced before each call, `--dry` makes zero calls, gate-shaped exit codes) | `evals/behavioral/{run,grade,attacks.data,fence}.mjs` | tested | eval-quality, safety | adapt (rewrite corpus for sales agents) |
| Forget-intent verification (destructive action from a model marker requires the human's ask in code; 90s burst window; Latin+Devanagari; claims-deletion scrub) | `src/engine/memory.ts` (`userAskedToForget`, `claimsDeletion`), `evals/forget/intent.mjs` | production (44 checks) | safety, crm, orchestration | adapt; the pattern applies to any agent tool that deletes, sends, or spends |
| Partial-forget episode integrity (single-statement CTE: unlink survivors, insert content-free provisional wake episodes, delete) | `api/memory.js` `purgeRelational()`, `evals/forget/episode-integrity.mjs` (codex branch only) | tested (CI green, not deployed) | company-brain, memory-learning | idea-only |
| Server password gate (HMAC token derived from a shared word; off when unset; rotation = revoke; one fetch wrapper; eval asserts protected/open lists) | `api/_gate.js`, `src/engine/gate.ts`, `src/components/GateScreen.tsx`, `evals/gate.mjs` | production | auth-tenancy (pre-accounts beta gating) | drop-in |
| Ops event stream (counts/labels/decisions only, never text; never throws; best-effort variant) | `api/_obs.js` | production (after the bug fix) | analytics, infra-ops | drop-in |
| Append-only consent ledger (no update path; newest row = current answer; content-free columns) + consent UI | `db/migrations/016_memory_consent.sql`, `src/components/MemoryConsent.tsx` | tested (migration pending apply) | crm, auth-tenancy, omnichannel (DPDP/TRAI consent for leads) | adapt |
| CharacterSheet / Relational Core split (typed persona fragments, byte-identity gate, residue-leak ratchet pinned at 0) | `src/engine/agents/characters/*.ts`, `src/engine/agents/registry`, `evals/relational/leak.mjs`, `docs/RELATIONALOS.md` | production | voice-agent, chat-agent (one OS, many agent personas/brands) | adapt |
| Single prompt compiler with CORE/TAIL split + budget gate that throws | `src/engine/compiler.ts`, `scripts/check-prompt-budget.mjs` | production | orchestration, chat-agent, voice-agent | adapt |
| Surface adapter with a single gated reply call site (static eval proves no ungated path) | `api/_surface.js`, `evals/surface.mjs`, `docs/SURFACES.md` | production (Telegram live) | omnichannel | adapt |
| Context memory system (decisions with reversal conditions, measurements with n/method/date, rejections, graph checker) | `context/*`, `scripts/context.mjs` | production | orchestration (agent dev process), company-brain (decision log model) | drop-in |
| Adaptive chess strength (material-record EMA, no search on hot path) | `src/engine/chess/adapt.ts` | tested | idea-only (lead/user skill estimation pattern) | idea-only |
| Play Store pack (data safety, permissions, content rating, checklist) | `docs/playstore/*` | prototype | infra-ops (if sales-enabler ships an APK) | adapt |
| Market sweep (Indian voice-agent pricing, TRAI/RBI/IRDAI/DPDP constraints, 43 sources) | `docs/research/market-sweep-2026-08-25.md` | n/a (research) | voice-agent, lead-gen, campaigns | drop-in (as reading) |

## Measured lessons

All of these are from `context/measurements.md` on the codex branch, with n and method recorded there.

- **Cache plateau (2026-08-25)** (13.4k-token prompt, gemini-3.6-flash):
  - Google's implicit cache plateaus at 60.7% of input (n=20, 84% hit rate).
  - `cache_control{ephemeral}` is a no-op on Google (n=4).
  - Explicit cachedContents caches 99.9% of the full system prompt, or 90.0% for core-only (4/4).
  - Per-turn cost: −45.7% with implicit caching, −79.2% with explicit (including storage).
  - −90% or better is not reachable by caching alone.
  - Clock sweep (n=121): the mean stable prefix is 94.78%, and every first difference falls in the RIGHT NOW block. **Put the volatile time line last.**
- **Explicit cache live (n=9 billed)**: 9/9 hits and a 76.5–77% saving. `thinkingBudget:0` is rejected with a 400 by gemini-3.6-flash. Effort must pass as `thinkingLevel`; a fixed budget field causes a full-lane outage. No thinking config costs about 193 hidden tokens per call, roughly 7× the output bill.
- **Watch-mode cost (about 25 live sessions)**:
  - Video costs about 30 tokens/frame, and burst frames under 1s apart collapse to one frame's cost.
  - Declaring `speechConfig.voiceConfig` bills +201 audio prompt tokens on every live turn (n=3).
  - Watch mode totals ₹1.1–1.6/min, and the estimate was 2–3× high.
  - Cascade calls are about 69% cacheable; live calls about 8%.
- **Resilience latency (2026-08-24, mocked upstream)**:
  - A fast 502 followed by a same-key retry adds about 700ms.
  - With every key slow, the 4000ms deadline held.
  - The production failure shape (a 6.7s 502) now lands on Azure 257ms later instead of returning the canned line.
- **Internals hardening (n=208)**: persona hardening did NOT reduce raw lexicon hits (22 vs 13–27 baseline). It reduced the SEVERE class (volunteered vendor names 5–10 → 1). The remaining 18 hits were register echoes inside correct refusals. A lexicon grader without severity tiers misreads this.
- **Internals fence verdict**: offline it caught 2/2 severe cases with 0/19 echo trips and 0/186 clean trips. Live (n=144) it saw 0 severe.
- **Tail-role differential (150 pairs, $1.75)**: moving the volatile tail from a system block to a leading user-role message (forced by Google's native cache surface) caused:
  - Hinglish register drift of −6pp
  - one crisis pair where the user-role arm dropped the helpline
  - **Wire shape is not behaviorally free**, even with byte-identical text.
- **Judge saga**: claude-opus-5's 17/17 agreement was survivor bias. A 120-token cap emptied 65% of replies; the fixed re-run scored 63/91 = 69.2%. Selection bias was 37.3pp. All 8 judge families fail 0.80, and the measured ground-truth ceiling is about 77%.
- **RelationalOS**: residues went 95 → 64 → 27 → 0 with Maya byte-identical (83/83). Kabir passed 412/412.
- **Partial-forget gate**: 5/5 focused assertions; Linux CI green in 165s.
- **Market**: Indian B2B voice agents sell at ₹3–65/min. Companion-category paid ads are policy-closed. Monthly-plan 12-month retention is 6.1%.

## Rejected and failed approaches

These are the highest-value entries.

- **`cache-control-on-google`**: A code comment credited cache_control with −85%, but that figure came from a different provider lane. **Caching claims are per provider, and a comment quoting a measurement must name the lane it was measured on.**
- **`obs-stream-dead-on-arrival`**: `obs()` passed 7 spread args to `q(query, params, timeoutMs)`, and its own catch swallowed every rejection. Every ops row since ship was lost while the stream looked healthy. **An observability path is not live until one row has been read back.**
- **`parse-survivor-bias`**: Units that survive a truncation failure are the easy units. **An invalid run's agreement number is biased upward, not a lower bound.**
- **`corpus-manifest-stale`**: A frozen eval corpus needs the persona and compiler version stamped beside it.
- **`unrecoverable-delete` (2026-10-04)**: A model emitted `[forget: call]` after a caller read out digits, and 44 rows were deleted. Neon PITR retention was 1 day against a deletion about 32h old; there were no snapshots; pageinspect was denied; derived stores had no text. **A destructive path triggered by model output needs the human's ask verified in code, and a retention policy decided before shipping.** The prompt line "only for an actual ask" was not enough.
- **`clock-leak-in-compiler`**: A renderer took `now` from the wall clock, so a fixture rotted after 43 days and the gate went red with no code change. **Pass the caller's clock everywhere.**
- **`meera-windows-gate-root-path`**: `new URL("..", import.meta.url).pathname` on Windows produces `C:\C:\...`, so all 11 subprocess gates "failed" without executing. **Do not count gate output whose bodies never ran.**
- **ws-gamefeel learnings**:
  - A uniform random draw among near-best moves produced alien-looking play; variety must be weighted by the engine's flavour score.
  - A streamed line cannot be un-said, so on streaming lanes repetition fences pay their cost on the next turn.
- **Inherited from main, still relevant**:
  - `realtime-azure`: Azure `gpt-realtime-2.1-mini` passed barge-in (271ms) and vision (5/5), but turns ran 14s / 41–53 words, a monologue that broke the persona. Declined.
  - `live-model-swap`.
  - `honesty-by-instruction`: a prompt instruction leaked 57–98% of the time, while the SQL predicate leaked 0 in 31,122.

## Risks and landmines

- **Divergent branches.** The codex forget-integrity fix is not on the claude/previews line, and vice versa. Whatever runs in production lacks one of them.
- **Destructive memory ops are hard deletes** with 1-day PITR, and the retention policy is OPEN. Any CRM or brain rebuild must decide retention and soft delete before shipping an LLM-reachable delete.
- **The password gate is a shared word.** It is off when the env var is missing (a silently open door), and its rate limit is in-memory per lambda. It is not auth.
- **Secrets hygiene.**
  - The free-pool keyring and paid key were each printed once into session transcripts, and rotation was recommended (owner action, status unknown).
  - `api/_config.js` holds every key and is deployed in the payload.
  - Do not copy any `_config` into sales-enabler.
- **Non-Azure dependencies are everywhere**: Gemini free pool (51 personal AI Studio keys), the Gemini Live API, OpenRouter, Supabase auth, Vercel hosting. The core voice lane (Gemini Live) has no Azure equivalent that preserved persona quality (`realtime-azure` rejected). Sales-enabler cannot inherit the voice stack as-is.
- **The live voice lane has no post-generation gate.** Safety there relies only on input-side fences; any realtime surface inherits this asymmetry.
- **The judge infrastructure is unqualified** (all families below 0.80), so quality claims depend on deterministic graders and owner felt-tests.
- **`api/_engine.gen.js`** is a 4.9k-line generated bundle that is committed. Drift between it and `src/engine` is a known hazard.
- **Context volume.** `decisions.md` alone is over 2.4k lines, and 94 rejections are Maya-specific. Mine them selectively; do not import them wholesale.

## Azure dependencies

- **Azure OpenAI / Foundry (Microsoft-for-Startups credits).**
  - `grok-4-20-non-reasoning` is the last-resort text lane and the FIRST attachment/vision lane (`api/_azure.js`, `api/_lanes.js`).
  - `grok-4-1-fast-reasoning` handles memory extraction (`api/memory.js`).
  - `text-embedding-3-small` serves embeddings (`api/_embed.js`).
  - Consolidation uses it (`api/consolidate*.js`).
- **Deployed but unwired** (per architecture.md): gpt-5.6-luna/terra, grok-4.3, gpt-4o-mini-tts, and others. gpt-5.6-terra is qualified as a research judge only.
- **Region**: East US 2.
- **Evaluated and rejected for voice**: `gpt-realtime-2.1-mini` (persona register failure, not latency).
- **Everything else is non-Azure**: Gemini (free and paid), OpenRouter, Neon (allowed), Supabase, Vercel.

## Recommendation for sales-enabler

1. **Adopt the patterns, not the product code.** Port these into the command-centre orchestration layer:
   - the failure ladder (`_lanes.js`), rewritten so its lanes are Azure deployments and regions
   - the `_obs.js` ops stream, with the rule that a row must be read back
   - the password gate, as an interim beta door before real tenancy
   Each is small, dependency-free and tested.
2. **Make "LLM-triggered side effects require verified human intent in code" a platform law.** This is the forget-requires-asking pattern. It applies to sending campaigns, deleting CRM records, placing calls and spending credits. Pair it with soft delete and retention (the lesson from the unrecoverable delete) and an append-only consent ledger modelled on migration 016. For India outbound voice and email, DPDP and TRAI consent evidence is a hard requirement, not a nice-to-have.
3. **Agent personas as CharacterSheets over one OS.** The sales voice and chat agents (per brand, per tenant) should be typed sheets interpolated into a single compiler with:
   - a never-truncated core holding the safety floors (never deny being an AI, never-internals)
   - a byte-identity regression gate
   - a residue-leak ratchet
4. **Output-side predicate fences** (`internalsFence.ts` and `repeat.ts`, one re-draft) for disclosure and loops in chat agents. Remember that a streamed or realtime voice output cannot be fenced after the fact.
5. **Measure caching per provider before trusting it.** Azure OpenAI prompt caching is automatic and prefix-based. Use the Maya method: check prefix stability, keep the volatile time and state lines last, read cached-token counts off real responses. Also re-measure whether the role in which the volatile tail travels changes behavior.
6. **Eval harness template.** Clone the behavioral battery's skeleton for sales agents (objection handling, compliance phrases, disclosure attempts, loops):
   - cash cap enforced before each call
   - `--dry` with zero calls
   - predicate graders with severity tiers
   - gate exit codes
   Do not rely on LLM judges without a pre-registered agreement backtest. Maya found every family below 0.80.
7. **Voice.** Do not inherit Maya's Gemini Live stack (it is non-Azure). Start from Azure Voice Live / GPT-realtime, but heed `realtime-azure`: measure words per turn and turn length against a register target, not just latency and barge-in.
8. **Process.** Copy the `context/` memory discipline (reversal conditions, n/method/date, rejections first, graph check) into sales-enabler from day one.
