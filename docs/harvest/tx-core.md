# Harvest: tx-core (Taxila core, latest integration branch)

Repo: `/home/user/Taxila` (GitHub `raghavsharma2003/Taxila`). Read-only inspection on 2026-10-15 using a detached worktree of `origin/int/r5-rel142` and `git show` on the other branches. Nothing was pushed, deployed, or changed on any remote, and no Azure, Neon or Vercel resource was touched.

---

## 1. Summary

Taxila is an AI voice tutor for Indian children in classes 1-9. For a command centre it is the most production-hardened codebase among the siblings. It runs live on Azure Container Apps (`taxila-web` plus a `taxila-worker`), backed by Neon Postgres and Azure AI Foundry Direct models. It already does several things the command centre needs:

- **One model gateway** (`server/azure.js` + `server/endpoints.js` + `server/lanes.js`). It handles per-lane accounts, hot and background quota isolation, hedged requests, 429 overflow to a twin account, content-filter classification, and cost and token accounting on every call.
- **A durable, event-sourced actor runtime on Postgres** (the Conductor, `server/conductor/*`, `db/migrations/004_conductor.sql`, `server/worker.mjs`). It has an idempotent event log per actor, a dirty-set fold, SKIP LOCKED job lanes, wakeups/timers, a leader ticker via advisory lock, and a measured lock order. This maps almost directly onto "orchestration of a whole company".
- **An LLM agent loop wrapped in a code harness** (`server/agent/*`, round 5). One strong model per turn returns streamed speech plus strict-schema actions. Code runs the actions, verifies them and reports back "screen truth". Safety, grading and budgets stay in code, and a deterministic "Director" lane takes over on any failure. In a paired n=64 simulation it beat the deterministic lane on 57/64 cards. It is still OFF in production because it is slow (p50 5.9 s per turn non-streamed; streaming work brought the first clause to about 1.5-2.6 s).
- **A pure, deterministic arbitration kernel** (`server/brain/kernel.js`). Proposals from many components are ranked by a strict authority order, with vetoes and per-turn budgets. This is a clean pattern for a multi-agent command centre.
- **One prompt assembler with a budget gate that throws** (`server/compiler/compile.js`), plus a frozen safety floor and predicate-based safety (`server/director/safety.js`, `server/compiler/gates.js`, `floor.js`).
- **Fact-grounded reporting** (`server/reports/*`). Each claim cites the DB rows behind it. A ban-list and overclaim gate throws instead of trimming, and an independent checker re-derives every claim from the DB without importing the generator. This is the right shape for command-centre analytics and executive digests.
- **Gated, canaried Azure deploys plus observability** (`scripts/deploy-azure.mjs`, `infra/gate.mjs`, `infra/azure.mjs`, `infra/eyes.mjs`, `infra/probes/*`, `.github/workflows/gates.yml`). Every step uses raw ARM REST with a service principal: no az CLI, multi-revision canary, smoke on the canary URL, one-PATCH rollback, a migrations gate, Log Analytics alerts from structured access logs, and a flight recorder (`server/trace/*`).
- **A "project memory" system** (`context/graph.json`, now 3017 nodes and 2551 edges; 668 of the nodes are rejections), with `scripts/context.mjs --check` and `scripts/merge-inbox.mjs`. This is the discipline that kept a very fast, multi-agent build coherent.

The domain parts (BKT/FSRS learner model, kits, Forge games, stagecraft, avatar) are not reusable as-is for a sales/ERP product. The infrastructure, harness patterns and measured lessons are reusable.

---

## 2. Branches covered

| branch | head | date (UTC) | relation |
|---|---|---|---|
| `int/r5-rel142` | `a978ae27` | 2026-10-15 08:57 | **Latest integration head (release 14.2).** Superset of all the others. |
| `claude/blissful-mayer-icwe2j` | `a978ae27` | 2026-10-15 08:57 | **Identical** to `int/r5-rel142` (0/0 commits apart). |
| `int/r5-rel141` | `838efda3` | 2026-10-15 06:03 | Release 14.1, **live in production** (image `1138550`, revision `taxila-web--s1138550-lauy`). Ancestor of rel142. |
| `claude/serene-franklin-9w7f1v` | `838efda3` | 2026-10-15 06:03 | **Identical** to `int/r5-rel141`. 36 commits behind rel142. This is what `/home/user/Taxila` has checked out. |
| `int/r5-rel14` | `21a9d822` | 2026-10-14 18:47 | Release 14. Ancestor of rel141. |

What differs:
- **rel14 → rel141** (about 100 commits, 2026-10-14 evening to 10-15 morning). Round 5 "agent lane" iterations driven by the sim lab:
  - "understood is earned" in code
  - praise held to the verified grade
  - mastery claims stripped
  - board and picture tools with ScreenTruth
  - the game-promise guard
  - streamed agent speech (`agentTurn({ onSay })`)
  - the spoken-Hindi-number reader (`server/grading/spoken-number.js`)
  - QA passes for resume and Continue
  - the content-filter category split
- **rel141 → rel142** (36 commits, 10-15):
  - 429 overflow to a southindia twin account (`overflowFor`, `dc-r142-chat-429-overflow`, refined after adversarial review)
  - the label-block two-step for content-filter blocks on the classifier
  - "khud" / "chhota" safety-predicate false-positive fixes
  - the continuer (backchannel) positive gate
  - a calm check-in after a safeguarding incident
  - em/en-dash "art" stripped from speech
  - merges of streams `claude/r4-latency`, `r4-conversation`, `r4-content`, `r5-qa`
- Total diff from rel14 to rel142 is 280 files and +113k lines, mostly eval result JSON (`evals/comprehension-r5/results/**`, `docs/design/round5/content/runs/**`).

The sim lab itself (`evals/simlab/**`) lives on `claude/r5-simlab`, which is **not** in this cluster. Its results are recorded in `context/`.

---

## 3. Product (real state)

A child talks to a Hindi-English AI teacher by voice or text. The flow, in order:
1. A turn loop perceives: STT, then a classifier against a verified answer key, the safety predicate, and speculative replies.
2. It updates an interpretable learner model: BKT-R plus θ plus FSRS, with misconception flags.
3. It decides the next move. The default is the deterministic Director; the agent lane is optional.
4. It writes the reply through `compile()` and guards.
5. It speaks via TTS (gpt-4o-mini-tts or DragonHD).

Around the turn loop:
- A whiteboard and Studio draw boards, pictures and games ("Forge"/"forge3" with offline certification of library pieces).
- A Conductor plans the child's day and runs background jobs.
- Parents get gated, fact-cited reports.
- A flight recorder (rrweb plus server events) allows replay.

**Live state (14.1, 2026-10-15):**
- Director lane in production; agent lane OFF; continuer OFF.
- Pictures on only for the owner cohort.
- D5 duplex (Voice Live as the ear) OFF pending fixes from the adversarial review.
- Live traffic is owner and test accounts only. There are no real children yet: the real-child audio and DPDP items are still open.

**Quality, measured by the sim lab on the Director lane** (n=32 lessons, `ms-r5-simlab-baseline-director`):
- Coherence 3.7/5. Understanding read 66% correct against hidden truth.
- Repeats an explanation in 29 of 32 lessons. Turn p50 is 2.96 s.

This is why the owner ordered the agent rewrite (`dc-r5-llm-orchestrated-teacher`).

---

## 4. Architecture and stack

- **Runtime:** Node 22 ESM, plain JS server (no framework). `server/serve.mjs` serves `server/router.js`, one route table that other modules extend via `register()` from `server/routes/*.js`. `api/[...route].js` is a Vercel shim kept for history.
- **Client:** React 19 + TS + Vite 8 (`src/`, about 78k lines). Capacitor/WebView target. three.js puppet face.
- **DB:** Neon Postgres (`@neondatabase/serverless` HTTP driver for web, `pg` direct for the worker). 29 SQL migrations in `db/migrations/`, applied by `scripts/migrate.mjs`. The deploy refuses if migrations are not applied.
- **AI:** Azure AI Foundry Direct, OpenAI-compatible v1 surface. Deployments are named per role through env vars (`DEPLOY_FAST`, `DEPLOY_CLASSIFY`, `DEPLOY_BRAIN`, …), so a role moves to a bake-off winner without touching call sites. Measured routing is in `docs/ops/MODEL-STACK.md`:
  - reply: `taxila-fast` = gpt-5.6-luna
  - classify: grok-4-1-fast-non-reasoning
  - grade: DeepSeek-V4-Pro
  - reports/brain: gpt-5.6-sol
  - agent teacher: `taxila-gpt6` = gpt-6-sol
  - Studio races: gpt-6 / terra / gpt-6-luna
  - images: gpt-image-2.5-flare low
  - STT: gpt-live-transcribe / MAI-Transcribe-2-Streaming
  - TTS: gpt-4o-mini-tts / DragonHD
- **Hosting:** ACA `taxila-env` (eastus2):
  - `taxila-web`: multi-revision, canary label, sticky sessions
  - `taxila-worker`: min 1, no ingress, Conductor host
  - jobs: `forge-g2-runner` in an untrusted env, and probe jobs in eastus2 and centralindia
- **Shared services:** ACR `taxilacr` (builds from GitHub). Storage `taxilaforge`. Log Analytics `taxila-logs` with 5 alert rules and the `taxila-owner` action group. The India move plan is in `docs/ops/INDIA-MOVE.md` (southindia account, Azure PG Flexible as the target DB).

**Per-turn server flow** (`server/brain/turn.js`, 1674 lines):
1. **Perceive**, in parallel: `classifyFast` (pure code), `classify` (model, against the key), `scanSafety` (predicate), speculative replies.
2. **Fold**: evidence goes to the learner ledger (pure).
3. **Propose**: Director `step()`, comprehension, relational, studio and conductor proposals.
4. **Arbitrate**: `brain/kernel.js`.
5. **Word**: `compile()` then the reply model then guards (floor violations, screen claims, praise, mastery, type-vs-speak).
6. **Commit**: one transaction, plus `ingestStmt` LAST for the Conductor.

On the agent lane, step 3 is replaced by `server/agent/agent.js`, and the Director's move stays as the fallback.

**Agent lane** (`server/agent/{agent,prompt,tools,flags}.js`, `docs/design/round5/AGENT.md`):
- One strict-JSON-schema call per event. `say` is the first field so it can stream to TTS (`sayDeltasOf`), with a per-clause gate (`clauseGate`).
- Tools are board.show/clear, screen.now and picture.get (`server/studio/tools.js`). Each returns `ScreenTruth` computed from what actually mounted.
- `pose_item` must be one of the OFFERED ITEMS. The grade is a fact the agent is given, never one it is asked for.
- Budgets per turn and per lesson throw. The lane is pinned at lesson start; cohorts are chosen by env (`TAXILA_TEACHER`, `TAXILA_TEACHER_AGENT_FOR` with sha256 emails).

**Context system:**
- `context/graph.json` has kinds decision, measurement, rejection, component, constraint, open, finding, and relations supersedes, measured_by, constrains, part_of, caused_by, blocks, inherits.
- The markdown files (`decisions.md` 933 KB, `measurements.md` 698 KB, `rejected.md` 343 KB, `architecture.md`, `open.md`) are append-only.
- Workflows write `context/inbox/*.json`, and the main loop runs `scripts/merge-inbox.mjs` then `scripts/context.mjs --check`. The check passed on rel142.

---

## 5. Reusable assets

| asset | paths (on int/r5-rel142) | maturity | reuse for | effort |
|---|---|---|---|---|
| Azure model gateway: per-call timeout and one retry, hedged requests, 429 overflow to a twin account, content-filter detection and category parsing (`filterCategories`, `nonHarmFilter`), usage/cost accounting, model-call trace | `server/azure.js`, `server/endpoints.js`, `server/trace/model.js` | production | orchestration, voice-agent, chat-agent, infra-ops, safety | adapt (strip child-specific comments; keep lanes) |
| Quota lanes: hot vs background TPM isolation, sliding-minute 30% cap only on shared-hot deployments, pause on hot 429 | `server/lanes.js` | production (sim-tested with a fake clock) | orchestration, campaigns, infra-ops | drop-in |
| Per-lane endpoint resolver (CHAT, REALTIME, TRANSCRIBE, TTS, IMAGE, RESPONSES, SAFETY, OVERFLOW), which refuses to send account A's key to account B | `server/endpoints.js` | production | infra-ops, voice-agent | drop-in |
| Conductor: event-sourced actor per entity on Postgres (`ingest_event` idempotent append, `student_event` log, `conductor_state` fold, `decision_log`, `job` + `complete_job` attempt fencing, `wakeup` + `fire_wakeups` SKIP LOCKED, `notification`/`notify_slot`, `rate_bucket`), with a documented lock order | `server/conductor/*`, `db/migrations/004_conductor*.sql`, `server/worker.mjs` | production (deployed worker; DB tests gated on a test branch) | orchestration, company-brain, campaigns, crm, erp | adapt (rename child → entity/account; keep SQL functions and lock order) |
| Worker host: leader ticker via `pg_try_advisory_lock` on a direct (non-pooler) URL, dirty-set loop, fast/slow job lanes, watchdog, graceful SIGTERM, refuses to start with unapplied migrations | `server/worker.mjs`, `server/conductor/{jobs,timers,step,backoff,migrations}.js` | production | orchestration, infra-ops | adapt |
| Agent-in-harness pattern: strict JSON schema with `say` first for streaming, tools return verified truth, code invariants (safety before and after, grade as a fact, offered items only, budgets throw, deterministic fallback lane, env cohort switch pinned per session) | `server/agent/agent.js`, `server/agent/prompt.js`, `server/agent/flags.js`, `server/agent/tools.js`, `server/studio/tools.js`, `docs/design/round5/AGENT.md` | tested (sim lab n=64; off in prod) | voice-agent, chat-agent, orchestration, safety | adapt (pattern plus code; the domain tools are rewritten) |
| Streamed structured output: `sayDeltasOf` extracts the `say` field from a streaming JSON object; `speakStreamed` with a per-clause gate | `server/latency/speech-stream.js`, `server/agent/agent.js` | tested | voice-agent, chat-agent | drop-in |
| Arbitration kernel: pure, deterministic proposals ranked by authority, vetoes, conflict table, per-turn budgets (attention, test weight, novelty, usd, latency) | `server/brain/kernel.js`, `shared/brain.ts` | production | orchestration, company-brain | adapt (redefine authorities, e.g. compliance > customer opt-out > budget > campaign goals) |
| `compile()`: one prompt assembler for every lane, section caps, drop priorities, BudgetError throws, must-fire rules last | `server/compiler/compile.js`, `scripts/check-prompt-budget.mjs` | production | voice-agent, chat-agent, content-gen | adapt |
| Restrict-only gate ratchet (`gatesFor`, `saferGates`, `assertMinorGates`) | `server/compiler/gates.js`, `server/compiler/floor.js` | production | safety, auth-tenancy | idea-only (rebuild for brand and compliance policy) |
| Never-rules matcher over the bot's own words (`floorViolations`, `neverRuleHits`), PII scrub (`scrubPii`), Hinglish/Devanagari normalisation and fuzzy lexicon | `server/director/safety.js`, `server/safety/{normalize,fuzzy,lexicon,known-words}.js` | production | safety, voice-agent, chat-agent, eval-quality | adapt (swap families for sales compliance: no fabricated claims, opt-out, DND) |
| Fact-cited report pipeline: facts, then claims citing row ids, then a deterministic render (en/hinglish/hi), then a gate that throws, then optional LLM ordering only, then the gate again; plus an independent re-deriving checker | `server/reports/*` (`claims.js`, `gate.js`, `check.js`, `truth.js`, `writer.js`, `render.js`) | production | analytics, company-brain, campaigns, crm | adapt (the pattern is the asset) |
| "One truth" module: one claim source every surface reads (no two dashboards disagreeing) | `server/reports/truth.js` | production | analytics, crm, erp | idea-only |
| Gated canary deploy to ACA over raw ARM REST: gate stamp per sha or GitHub `gates` run, migrations gate on the target DB, ACR build from GitHub, multi-revision canary with labels, smoke on the canary URL, 100% shift, one-PATCH rollback, `--profile` region presets, secrets as Container App secrets | `scripts/deploy-azure.mjs`, `infra/gate.mjs`, `infra/azure.mjs`, `scripts/deploy-worker.mjs`, `Dockerfile`, `Dockerfile.worker` | production | infra-ops | adapt (rename app, RG, registry) |
| Observability: JSON access log per request (route template, status, ms, revision, hashed id, error class only), scrubbed client-error beacon with rate limits, Log Analytics workspace, KQL alert rules (5xx%, p90, worker heartbeat, restarts, job failures), action group | `server/router.js`, `infra/eyes.mjs`, `src/app/beacon.ts` | production | infra-ops, analytics | drop-in |
| Probe fleet: ACA scheduled jobs in a target region that run synthetic requests (incl. WAV audio) against prod | `infra/probes/*`, `scripts/live-probes.mjs`, `scripts/prod-smoke.mjs`, `tests/prod/w0-smoke.mjs` | production | infra-ops, voice-agent, eval-quality | adapt |
| Backups and restore drill | `infra/backups.mjs`, `infra/restore-drill.mjs` | tested | infra-ops | adapt |
| Flight recorder: buffered async multi-row inserts, masking, drop-and-count under DB slowness, request-scoped trace context, rrweb client replay, replay scripts | `server/trace/*`, `db/migrations/029_trace.sql`, `scripts/trace.mjs`, `scripts/trace-replay.mjs`, `src/trace` | production | analytics, eval-quality, voice-agent, chat-agent | adapt |
| Health endpoints: shallow liveness, `?ready=1` DB readiness cached 5 s, keyed fresh DB probe | `server/router.js` | production | infra-ops | drop-in |
| Auth: guardian email/password scrypt, httpOnly session cookie, session-hash identity; test accounts `@taxila.test` with clock offset; consent per purpose | `server/auth.js`, `server/routes/account.js`, `server/comprehension/testclock.js`, `db/migrations/001_core.sql` | production | auth-tenancy | adapt (needs org/tenant layer) |
| Voice pipeline pieces: Azure Speech DragonHD TTS over a dependency-free websocket with visemes, streamed PCM/ADPCM, prewarm, STT session config (VAD 0.6 / 900 ms / 300 ms prefix), Voice Live relay as "ear only" with Live-Reference AEC (D5, off) | `server/voice/{azureTts,azureTtsWs,stt,prewarm,adpcm,sentences}.js`, `server/duplex/voicelive.js`, `server/latency/*` | production (D4 cascade) / prototype (D5) | voice-agent | adapt |
| Uptake-echo acknowledgement (say the user's own key token back while thinking; no canned fillers) behind a positive gate | `server/latency/ack.js`, `server/latency/routes.js` | tested (off in prod) | voice-agent | idea-only |
| Spoken-number reader for Hindi/Hinglish ASR output (Devanagari 1-99, fused hundreds, lakh/hazaar, working-aloud separation of operands vs results) | `server/grading/spoken-number.js` | production | voice-agent, crm (spoken amounts, phone numbers) | drop-in |
| Release gate runner: every failure printed together, skips are red unless named | `scripts/verify-release.mjs`, `.github/workflows/gates.yml` | production | infra-ops, eval-quality | drop-in |
| Project memory system: graph + md + inbox merge + validator | `context/*`, `scripts/context.mjs`, `scripts/merge-inbox.mjs`, `scripts/context-writeup-missing.mjs` | production | company-brain, orchestration | drop-in |
| Model bake-off and refresh harnesses (latency/accuracy per deployment, price pull from prices.azure.com, n and CIs) | `evals/model-bakeoff.mjs`, `evals/model-refresh-2026-10-04/**`, `evals/latency/agent-models.mjs` (in `docs/design/round5` results), `docs/ops/MODEL-STACK.md` | tested | eval-quality, orchestration | adapt |
| Sim-lab method: AI user with a hidden-state persona card against the real server; cross-family judges; code-scored facts against the hidden state; paired arms; void runs over 2% infra errors | context entries `dc-r5-simlab-is-the-gate`, `ms-r5-simlab-baseline-director`, `r5a-ms-agent-vs-director-571b301` (code on `claude/r5-simlab`, not this cluster) | tested | eval-quality, voice-agent, chat-agent, campaigns | idea-only here (code on another branch) |
| Studio router: deterministic library vs live-build vs fallback with reason codes; live build race of 3 model arms | `server/studio/router.js`, `server/studio/build.js`, `server/studio/library.js` | tested | content-gen, campaigns (asset generation) | adapt |
| Offline render certification of generated UI pieces at device sizes | `server/forge3/certify.js`, `server/forge3/qa/*` | tested | content-gen, design-ui | idea-only |
| Image lane policy: flare-low default, fallback chain on 429/filter, no curriculum fact baked into pixels | `server/azure.js` `IMAGE`, `server/studio/picture.js` | production | content-gen | adapt |

---

## 6. Measured lessons (selected; all from `context/graph.json` at rel142)

- **An LLM agent in a code harness beat the deterministic state machine on conversation quality.**
  - Run: `r5a-ms-agent-vs-director-571b301`, n=64 cards per arm, paired, two cross-family judges. The agent won 57/64 cards.
  - Judge means moved from Director to agent: coherence 3.17→4.27, follows_child 2.89→3.64, adapts 2.28→3.70, topic_jump 14→2.
  - Its costs:
    - turn p50 5.9 s vs 2.9 s
    - 20 timeouts that fell back to the Director
    - 61/164 overclaimed skill reads
    - boards drawn 2 vs 164
    - $0.070 per lesson
- **A model as the full decision layer, without a harness, was rejected earlier.**
  - Rejection: `model-full-orchestrator`, 2026-10-04.
  - grok and DeepSeek broke hard rules in 15/72 runs: built with consent missing, ran past the parent's limit, released after distress without a check-in.
  - It cost +1.4-1.7 s per decision and gave no accuracy gain over code.
  - A hybrid of code filter plus model choice removed the breaks but added no gain.
  - The round-5 reversal kept every hard rule in code. That is the transferable lesson: **the model chooses, code enforces.**
- **Overclaiming is structural.**
  - The agent claimed "understood" on unsupported evidence 61/164 times.
  - The fix was to earn the state in code (`r5a-dc-understood-is-earned`): it needs a right answer on a deep item plus another right answer, and nothing missed after.
  - Applies directly to CRM lead scoring and "deal is qualified" claims.
- **Agent latency** (`ms-r5-lat-agent-models-2026-10-14`, n=30 each, first speakable clause p50/p90):
  - gpt-6-sol (chat, effort none): 1475/2416 ms
  - taxila-fast (gpt-5.6-luna): 1726/2552 ms
  - gpt-6.1-sol (responses API, effort low): 3294/9461 ms
  - grok-4.1-fast spoke in only 9/30 calls; it returned tool calls only.
  - gpt-6.1-sol and gpt-6-astra reject function tools with reasoning on `/chat/completions`; they need `/v1/responses`.
- **Streaming the `say` field** (`e2f33f59`, n=20/16): first clause p50 2651 ms at effort low vs 1695 ms at effort none. Reasoning effort is the latency lever.
- **Shared quota is a live outage source** (`ms-r142-429-contention`). Production taxila-fast had 51/361 calls (14.1%) throttled during the hour a TEST harness pushed 1.7M input tokens through the same deployment.
- **Overflow arm** (`ms-r142-overflow-arm`, n=20/arm, bootstrap CI):
  - Throttled replies took +988 ms [636, 1323] and all 20/20 were answered, instead of 20/20 fallback lines.
  - On the agent lane the first clause took +319 ms.
- **Background share as a token bucket was wrong.** A full bucket let background spend about 2x its share in the first minute and caused 28 hot 429s in simulation (`rj-w2e-token-bucket-burst`). Use a sliding window.
- **Content-filter false alarms.** Azure prompt filters flagged a maths answer as "jailbreak", a Bollywood song mention as "hate", and a history line as "hate". This caused false helpline scripts in 4/32 sim lessons (`dc-r141-content-filter-by-category`, `ms-r142-kala-chashma`, `ms-r142-p26-history-block`). The fix was to split filter categories (harm vs non-harm) and re-probe the user's words alone under a neutral brief. False safeguards went to 0/32 (`ms-r142-c61f728-text-baseline`).
- **The model-routing table with prices and latencies** is in `docs/ops/MODEL-STACK.md`. Examples:
  - classify on grok-4-1-fast-non-reasoning: 726/914 ms, about $0.0002 per call
  - reply on gpt-5.6-luna: TTFT 712/889 ms, about $0.00023-0.00034
  - DragonHD TTS first byte: 228/287 ms vs gpt-4o-mini-tts 688/931 ms
  - gpt-image-2.5-flare low: 15.1 s, $0.0066
  - the flare image model is 4 RPM subscription-wide
- **Region matters, and not where you would guess.** Chat lanes on the southindia account were slower from Chennai than eastus2 GlobalStandard (TTFT 1227 vs 878 ms; turn 2046 vs 1562 ms, n=60) (`rj-southindia-account-chat-lanes`). MAI-Transcribe-2-Streaming in southindia gave final text in 68 ms vs 753 ms from Chennai.
- **Code beats a model for the turn decision kernel**: 23/24 correct, ≤10 ms, reproducible. The best model scored 69/72 and added 1.4 s.
- **Position is mechanism, carried over from Meera.** Brevity asked for mid-brief gave 64 words per turn; appended last it gave 25. Quoted floor phrases were recited in 22/33 replies.
- **Speech numbers.** Helpline digits written as numerals were voiced as cardinals in Hindi mode (0/4 digit-exact). Pre-rendered digit words gave 11/12.

---

## 7. Rejected and failed approaches (highest value)

| tried | what broke (id) |
|---|---|
| A model as the app's full decision layer | hard-rule breaks in 15/72 (grok, ds41), +1.4-1.7 s per decision, non-reproducible, no accuracy gain (`model-full-orchestrator`) |
| An LLM choosing the beat or build on the live path | latency and no gain (`llm-beat-proposer-live`) |
| Azure AI Content Safety as the sole safety gate | severity 0 on clear violations; harm models not trained on Hindi (`content-safety-sole-gate`) |
| Treating every Azure filter block as distress (fail closed) | false helpline scripts on maths and history answers; replaced by the category split plus neutral re-probe (`dc-r141-content-filter-by-category`, `dc-r142-label-block-two-step`) |
| Adding a "not for being tired" clause to the distress prompt | no recall gain and one new false alarm; reverted (`rj-r142-distress-tired-clause`) |
| gpt-4o(-mini)-transcribe / gpt-transcribe as live or grading STT | fluent invented sentences on noise and non-speech (`gpt4o-transcribe-fabricates-noise`, `gpt-transcribe-fabricates-nonspeech`) |
| Vocabulary lists in the ASR prompt | fabricated answers from near-silence (`asr-vocab-in-prompt`) |
| Amazon Transcribe, Nemotron hi-IN, Voxtral, Qwen3-ASR forced Hindi, zero-stt-hinglish | worse CER or numbers, or invents text on non-speech (`rj-aws-transcribe-*`, `rj-nemotron-*`, `rj-voxtral-realtime-hinglish`, `rj-forced-hindi-llm-asr`, `rj-zero-stt-hinglish-nonspeech`) |
| Realtime speech-to-speech as the default lane | quota (capacity 10, 66/168 rate-limited at 3-wide), cost (hour-for-hour impossible at the price point), monologues (`rj-realtime-default-at-current-quota`, `rj-hour-for-hour-realtime`, `meera-realtime-azure`) |
| A native full-duplex speech model as the agent | content quality 0.564/5, takes over in 38% of natural pauses (`rj-native-duplex-teacher-2026-10-04`) |
| Barge-in that kills the reply on any speech_started | coughs, TV and its own echo killed questions (`cascade-barge-all-or-nothing`) |
| A canned filler list at 2 s | becomes a tic; replaced with an uptake echo (`rj-static-filler-list`) |
| Streaming the reply to start TTS early (2026-10-02, before structured streaming) | Azure filtered-text blocks arrive almost whole, so no gain (`reply-streaming-no-gain`); later superseded by streaming the `say` field of a JSON stream |
| Two parallel reply drafts | worse p90 and doubled cost (`reply-two-drafts`); replaced by a hedge at p95 (`dec-r5-lat-reply-hedge`) |
| A prompt note "own your mistakes" | false confessions (`own-mistake-note-false-confession`) |
| SSML or square brackets in model text for voice | spoken literally (`rj-ssml-in-voice-live-text`, `voice-prompt-labels-and-brackets`) |
| A holistic 1-10 LLM/VLM judge as a promotion gate | unreliable; replaced by checks against keys (`rj-holistic-model-judge-gate`) |
| A single LLM judge for grade levels; gpt-audio and realtime as voice judges; mistral as a Hinglish judge | bias and low agreement (`rj-llm-grade-judge-alone`, `gpt-audio-not-a-judge`, `rj-realtime-judge-hinglish-delivery`, `rj-conv2-mistral-hinglish-judge`) |
| Confidence-based escalation from a cheap model to a strong one | the cheap model is overconfident and escalated 3% of turns (`rj-conv2-confidence-escalation`) |
| ds41 (DeepSeek-V4.1-Flash) and grok-4.6 in live or safety lanes | hangs 20-90 s on distress content; TTFT 16-21 s (`ds41-hangs-on-distress`, `grok46-not-live`) |
| Conductor commit taking the per-entity lock first | deadlocks 5/5 (`conductor-commit-child-seq-first`) |
| Encryption key stored in the same PITR'd DB | a restore resurrects it, so crypto-shred fails (`dek-in-pitr-database`) |
| Worker image without migrations or scripts in its context | the image could never boot (`w1d-worker-image-never-bootable`, `w1d-nightly-sweep-not-in-image`, `forge-g2-runner-image-closure`) |
| Deploy treating latestReadyRevision as the serving revision | pinned 100% to a rolled-back revision (`w1d-deploy-pinned-latest-not-serving`) |
| A dirty-tree gate stamp keyed to the clean sha | blocked deploys (`w1d-dirty-stamp-poisoned-sha`) |
| Top-level test hooks that stub fetch/env | broke other files in the one-process test run (`rj-r142-toplevel-test-hooks`) |
| Running real-model repro scripts with `.env.local` as-is | wrote rows into the PRODUCTION trace (`rj-r142-repro-with-prod-env`) |
| Neon for India data residency | no India region, not on the Azure grant, cannot be VNet-private (`rj-neon-india-region`) |
| FLUX.2 pro/flex, MAI-Image flash for labelled diagrams | wrong labels and over-blocking prompts (`rj-flux2-*`, `rj-mai-image-flash-for-labels`) |
| Fireworks-hosted Foundry models, MAI-Code | not deployable on the subscription without a quota tier (`fw-partner-models-gated`, `mai-code-quota-tier`) |

---

## 8. Risks and landmines

- **Shared Azure account across products and environments.** The eastus2 Foundry account `raghavsharma1729-compan-resource` hosts projects `taxila`, `raghavsharma1729-companion` **and `sales-enabler`** (INDIA-MOVE §1.2), and TEST traffic already throttled prod (`open-r142-test-traffic-shares-prod-quota`). A command centre on the same account will contend for TPM with Taxila's live lessons, so it needs its own deployments or account from day one.
- **The agent lane is not production-proven.** It is OFF in prod. Latency (5.9 s p50 per turn) and tool use (2 boards in 64 lessons before the tool fixes) were the blockers. The streaming and tools work since then is measured only in small smokes.
- **Very large, dense files.** `server/director/state.js` is 144 KB, `server/brain/turn.js` 143 KB, and `context/decisions.md` 933 KB. Lifting code means lifting coupling. Take patterns and small modules, not the turn path.
- **Child-specific semantics are woven through the generic pieces.** Examples: `child_seq` in the Conductor, minor gates, Hinglish safety lexicons. Renames are needed.
- **The architecture doc is stale.** `docs/ARCHITECTURE.md` (draft v0, Vercel + gpt-realtime) does not match reality (ACA, cascade, agent lane). Use `context/` and code.
- **Several "built" components are not wired.** Examples: `server/duplex/index.js` says "NOT WIRED"; D5 is off; reply, classify and distress model fallbacks were noted as intention-only on 2026-10-04 (partly addressed later by the hedge, overflow and `distressAcross`). Verify before claiming.
- **The `@taxila.test` test-account bypasses** (clock offsets, forced 500 with operator key) are designed carefully. Copying them without the three locks would be unsafe.
- **The repo history appears shallow from 2026-10-10** (316 commits visible). Older provenance lives only in `context/`.

---

## 9. Azure dependencies (names only)

- **Foundry accounts:**
  - `raghavsharma1729-compan-resource` (eastus2, 49 deployments; also hosts a `sales-enabler` project)
  - `taxila-ai-southindia` (MAI-Transcribe-2-Streaming, MAI-Image-2.6; overflow twins)
  - `taxila-ai-centralindia` (Azure Speech incl. DragonHD, Voice Live)
- **Deployments used:**
  - `taxila-fast`, `taxila-fast-bg`, `taxila-brain`, `grok-4-1-fast-non-reasoning`, `DeepSeek-V4-Pro`
  - `taxila-gpt6`, `taxila-gpt6-luna`, `taxila-gpt61-sol`, `gpt-5.6-terra`, `taxila-codex`
  - `taxila-realtime`, `gpt-realtime-2.1-mini`
  - `taxila-transcribe`, `taxila-live-transcribe`, `taxila-mai-tx2-stream`
  - `gpt-4o-mini-tts`, `taxila-image25-flare`, `taxila-image`, `taxila-studio-sol`
- **Compute:**
  - ACA env `taxila-env` (eastus2), apps `taxila-web` and `taxila-worker`
  - env `taxila-forge-untrusted` with job `forge-g2-runner`
  - probe jobs `taxila-probe-eus2`, `taxila-probe-adhoc`, `taxila-probe-ci` (centralindia env `taxila-probes-ci`)
  - planned: `taxila-sin-env`
- **Registry, storage, monitoring:**
  - ACR `taxilacr` (Basic); Storage `taxilaforge`
  - Log Analytics `taxila-logs`; alerts `taxila-web-5xx`, `taxila-turn-p90`, `taxila-worker-liveness`, `taxila-job-failures`, `taxila-replica-restarts`; action group `taxila-owner`
- **Resource group and data:** `rg-raghavsharma1729-7190`. Neon (prod plus TEST branches). Azure PG Flexible (southindia) is the planned target.

---

## 10. Recommendation for sales-enabler

1. **Adopt Taxila's platform spine as the command centre's foundation, not its domain code.** Concretely:
   - Port the model gateway `server/azure.js` + `server/endpoints.js` + `server/lanes.js` nearly as-is. Rename env vars, keep hot/background lanes, the hedge, overflow, filter categories and cost accounting, and add a per-tenant cost ledger.
   - Generalise the Conductor (`server/conductor/*`, `004_conductor.sql`, `server/worker.mjs`) into the orchestration substrate:
     - `child_seq/student_event` becomes `entity_seq/entity_event`, keyed by tenant and entity (lead, account, campaign, deal).
     - Keep `ingest_event` idempotency, the lock order, `job`/`complete_job` fencing and `wakeup`/`fire_wakeups`.
     - This gives durable multi-agent workflows (sequences, follow-up timers, campaign steps, retries) without a new queue product. It fits the Azure-only constraint: ACA worker plus Postgres.
   - Port `scripts/deploy-azure.mjs`, `infra/gate.mjs`, `infra/azure.mjs`, `infra/eyes.mjs` and `infra/probes/*` for the deploy and observability story. Use a **separate** ACA environment, ACR repository, Log Analytics workspace and Foundry deployments so command-centre load cannot throttle Taxila.
2. **Build the AI agents (chat, voice SDR, campaign brain) on the round-5 agent-in-harness pattern:**
   - one strong model per event
   - strict JSON with the `say`/`message` field first, streamed
   - tools that return verified truth (CRM write results, send results, calendar truth)
   - code-held invariants: compliance and opt-out predicates before and after the model, consent checks, a never-rules filter on outbound text, budgets that throw, and a deterministic fallback path
   - **Never let the model grade or assert state.** "Lead qualified" and "deal won" must be earned in code from evidence, as `understood` is.
3. **Use the arbitration kernel (`server/brain/kernel.js`)** as the command-centre "who decides" layer when several agents propose actions on one entity. An example authority order: legal/compliance > customer opt-out > tenant policy caps > cost governor > plan > agent proposals > optimisation suggestions.
4. **Use the reports pattern for every executive or analytics surface:**
   - facts, then claims citing row ids, then a deterministic render, then a throwing gate, then optional LLM wording, then the gate again, plus an independent checker
   - and a single "truth" module per metric
   This directly prevents dashboards that disagree and LLM-fabricated numbers.
5. **Voice agents:**
   - Start from Taxila's cascade (STT, text LLM, DragonHD TTS via `azureTtsWs.js`, streamed), plus the Voice Live "ear-only" relay idea for echo cancellation.
   - Do not default to realtime speech-to-speech: quota, cost and monologues are all measured against it.
   - Do not use gpt-4o/gpt-transcribe for anything graded: they fabricate on silence.
   - Reuse `spoken-number.js` for Hindi amounts and numbers.
   - The telephony decision is open: ACS Call Automation fits Azure-only, but Taxila has no telephony code.
6. **Copy the discipline:**
   - the `context/` graph with inbox merge and a validator
   - `verify-release` where skips are red
   - prompt budget gates that throw
   - a sim-lab-style gate: an AI customer persona with a hidden state against the real server, cross-family judges, and code-scored facts
   - running real-model scripts with an empty `DATABASE_URL`
   - per-environment deployments
7. **Do not lift:** the Director (`server/director/*`), learner KT, kits, Forge/forge3, stagecraft, avatar and relational modules. They are education-specific and heavily coupled.
