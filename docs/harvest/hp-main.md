# Harvest: hp-main — html-portfolio (Meera / "Maya" core + RelationalOS)

Cluster `hp-main`. Repo `/home/user/html-portfolio`. Inspected read-only through a detached worktree at
`origin/main` (3a921798). Harvested 2026-10-15.

---

## 1. Summary

html-portfolio is the most heavily measured codebase in the sibling set. On the surface it is **Meera (display
name "Maya")**, a Hinglish AI companion with text chat, a realtime voice call, screen-watch during the call, a
memory graph, games, and an Android APK. Underneath, it has turned into a reusable **"RelationalOS"**: one
prompt compiler shared by every lane, personas as injected modules (a second persona, Kabir, passes the full
invariant suite), a surface adapter contract (Telegram live; Discord and WhatsApp code-complete) keyed on
person × agent × surface, safety enforced as predicates on output bytes, a turn-trace spine, a resilient
multi-key/multi-provider failure ladder, and an evidence system (`context/`) holding 277 nodes and 275 edges
of decisions, measurements and rejections, validated in CI.

For sales-enabler, the persona and companion parts are not directly reusable. Five things are worth more
than any single file:

1. **The `context/` memory system.** It includes `scripts/context.mjs --check`, the "decision must have a
   reversal condition" rule, and roughly 70 rejection entries.
2. **The compiler pattern.** One `compile()` for every lane, a CORE/TAIL split, whole-block drop order, a
   prompt-budget gate that throws, and rules that must fire placed last.
3. **Safety and honesty by predicate.** Provenance allowlists, and disclosure handled as a SQL WHERE clause
   rather than a prompt rule.
4. **The surface contract.** Four functions per channel, and memory is never keyed by surface. This maps
   directly onto omnichannel.
5. **The voice lessons.** Client-side floor control, the echo simulator, and why Azure realtime and Azure
   TTS were rejected for this persona.

The code is mostly not Azure-native: the brain and live voice run on Google Gemini through OpenRouter or
Google direct. The patterns port; the provider wiring has to be rewritten.

---

## 2. Branches covered

| branch | head | date | notes |
|---|---|---|---|
| `origin/main` | `3a921798` "Merge Maya: world layer, RelationalOS split, resilience stack, launch fixes (PR #3)" | 2026-08-25 | 99 commits, earliest 2026-08-22 (history was squashed or merged in) |
| `origin/claude/serene-franklin-9w7f1v` | `3a921798` | 2026-08-25 | **Identical to main.** Merge-base equals both heads; `git log main..branch` and `branch..main` are both empty. Nothing differs. |

The Meera development history (for example `claude/ai-companion-app-rkt1lv`, which `context/` mentions as 252
commits ahead of main at one point) is not in this cluster. Main already contains its result.

---

## 3. Product

- **Web app** at `meera-silk.vercel.app`: landing at `/`, app at `/chat`. React 19, Vite 8, TypeScript 6.
- **Android APK** via Capacitor 8 (`capacitor.config.ts`, app id `app.meera.companion`). It has native Java
  twins of the voice and watch engines (`LiveWatchEngine.java`, `MediaAudioCapture.java`,
  `CallMicPlugin.java`, `BubbleService.java`), plus a **signed OTA web-bundle updater**
  (`OtaUpdater.java`, `scripts/ota-bundle.mjs`). The manifest sits outside the zip so the phone can reject a
  bundle before opening it, and the update origin is compiled into the APK.
- **Lanes:**
  - Text chat, with a burst/pacing engine (`src/engine/burst.ts`).
  - Realtime voice call on the Gemini Live preview (`src/voice/liveCall.ts`, 3.4k lines).
  - A cascade fallback STT → LLM → TTS (`src/voice/speech.ts`, `api/speech.js`).
  - Screen share and co-watch (`src/watch/scene.ts`, pure geometry wake detection).
  - Web search (`api/search.js`).
  - Games: chess, tic-tac-toe, would-you-rather, run through one generic "activity" seam.
  - Notifications and push.
  - Telegram, Discord and WhatsApp surfaces (`api/tg.js`, `api/discord.js`, `api/whatsapp.js` on top of
    `api/_surface.js`).
- **Memory:**
  - `api/memory.js` (4.4k lines) with ops `log`, `recall`, `remember`, `forget`, `upload_photo`,
    `describe`, `activity`, `seed_currency`.
  - `api/consolidate.js` (2.9k lines), a nightly finalize: episodes, then cited facts, then rel-events,
    patterns and phrases.
  - Neon Postgres with `halfvec(1536)` embeddings and a person-filtered exact scan (no HNSW).
- **State as of 2026-08-25:**
  - Shipped and used by the owner and a first external tester.
  - The derived relational layer only began to have rows from 2026-08-20/21 (see `never-scheduled`).
  - Several lanes are "wired, gated, not yet measured live", for example Azure-first attachments: the
    `served_by:"azure"` value had never appeared in a real trace.
  - The research arm (the "swap test": can identity survive a model swap?) is blocked on judge
    qualification. Every zero-cash judge failed.

---

## 4. Architecture and stack

**Lanes and models (`context/architecture.md`, as of 2026-08-11, updated by later decisions):**

| lane | model | provider |
|---|---|---|
| chat and call brain | `google/gemini-3.6-flash` | Gemini free pool (around 48 labelled keys), then OpenRouter, then **Azure** (`api/_lanes.js`) |
| attachments (images, docs) | `grok-4-20-non-reasoning` on Foundry | **Azure first** (owner directive 2026-08-24) |
| live voice | `gemini-3.1-flash-live-preview` | Google direct, ephemeral token from `api/live-token.js` |
| TTS fallback | Gemini TTS (voice "Despina") | Google, then OpenRouter |
| memory extraction | `grok-4-1-fast-reasoning` | **Azure** credits, with OpenRouter fallback |
| embeddings | `text-embedding-3-small` | **Azure** |

**Layers (as `docs/RELATIONALOS.md` draws them):**

- **Persona.** `src/engine/persona.ts` holds about 45k characters of product, delivered as an `AgentModule`
  through `src/engine/agents/{types,registry,meera,kabir}.ts`. A persona is a 29-field CharacterSheet
  interpolated into a shared Relational Core.
- **Compiler.** `src/engine/compiler.ts`:
  - CORE has a 40k target and a 64k operational cap.
  - TAIL slots T1–T16 plus `mp.roster` and `mp.bridge`, each with a byte budget and a `dropPriority`.
  - `applyDropOrder` removes whole blocks in priority order and never slices one ("a sliced block is a lie").
  - `SEARCH_DECISION` and `FORGET_DECISION` are appended last. `shapelint.checkAppendedLastExactlyTwo`
    enforces that exactly those two hold the last position.
  - `AGE_TIER_SAFETY_OVERRIDE` sits at the end of CORE.
  - `hashCore` and byte-identity fixtures in `src/engine/__fixtures__/` protect the provider prefix cache.
- **Brain.** `src/engine/brain.ts` runs client-side, with `api/chat.js` as a thin proxy. `api/_engine.gen.js`
  is an esbuild bundle of `src/engine` so server surfaces run the same compiler and gate.
  `build-engine-bundle.mjs --check` detects drift between them.
- **Output gate.** `src/engine/honesty.ts` (2.2k lines) runs `parseBubbles`, then `stripTextingDashes`,
  then `guardReply`. `api/_surface.js` `gatedReply()` is the single reply site for every non-web surface and
  fails closed.
- **Disclosure.** `api/_disclosure.js` and `api/_room.js` implement privacy as SQL predicates over episode
  participants.
- **Tenancy:**
  - `vy_person` and `vy_person_device` hold identity.
  - `vy_agent` (migration 009) scopes the relationship.
  - `vy_surface_identity` has no `agent_id`, deliberately.
  - Every agent-scoped read goes through `api/_agentscope.js`.
- **Data.** Neon over SQL-over-HTTP (`api/_db.js`, one statement per request, no transactions). Schema is in
  `db/schema.sql` (about 40 tables: `meera_*` legacy plus `vy_*` relational) and 15 numbered migrations.
  Supabase is used only for auth and photo storage.
- **Trace.** Defined by `src/engine/trace.ts`, `api/_trace.js`, `api/trace.js` and `docs/TRACE.md`:
  - Seven legs per turn (ingress, retrieval, interior, assembly, model, egress, consolidation).
  - Stored as a `meera_turn` spine plus append-only `meera_turn_leg` rows.
  - The client is the only writer. Server legs ride back on the response and are posted later, so nothing
    writes on the reply path.
  - It stores references (ids, byte counts, hashes), never content.
- **Jobs.** GitHub Actions cron: `consolidate.yml`, `culture.yml`, `drift.yml`, plus `build-apk.yml` and
  `deploy-web.yml`. Deploy target is Vercel serverless (`vercel.json`, `api/*.js`).
- **Gates:**
  - `scripts/verify-release.mjs` runs tsc, prompt budget, workflow lint, motion lint, contrast, the voice
    guard, `evals/run.mjs` (which re-bundles from source on every run), echosim and more. `--live` adds paid
    probes.
  - CI runs the eval suite on push, using `write-config.mjs --stub` so the gitignored config does not break
    the checkout.

---

## 5. Reusable assets

| asset | paths | maturity | reuse for | effort |
|---|---|---|---|---|
| **Context memory system** (graph, decisions, measurements, rejected, architecture, with a bidirectional validator) | `context/*`, `scripts/context.mjs` | production (CI-validated, 277 nodes) | company-brain, orchestration, eval-quality | drop-in |
| **Prompt compiler** (CORE/TAIL, budgets, drop order, appended-last law, byte-identity hashing) | `src/engine/compiler.ts`, `src/engine/shapelint.ts`, `src/engine/__fixtures__/` | production | chat-agent, voice-agent, orchestration | adapt |
| **Prompt-budget gate** (throws on silent truncation; runs fixtures through the real compiler) | `scripts/check-prompt-budget.mjs` | production | chat-agent, voice-agent, safety | adapt |
| **AgentModule / persona registry** (persona as an injected module; CharacterSheet) | `src/engine/agents/*` | tested (412/412 invariants across 2 agents) | voice-agent, chat-agent (per-brand or per-SDR personas) | adapt |
| **Honesty gate** (provenance allowlist: an identifier not in the input counts as invented; receipt and presupposition families; content-preservation controls) | `src/engine/honesty.ts`, `evals/honesty/*` | production (289 checks) | safety, chat-agent, campaigns (no invented prices, emails or claims) | adapt |
| **Surface adapter contract** (verify/parse/send/render; one `gatedReply`; fail-closed) | `api/_surface.js`, `api/tg.js`, `api/discord.js`, `api/whatsapp.js`, `docs/SURFACES.md`, `evals/surface*` | production for Telegram; code-complete for Discord and WhatsApp | omnichannel, chat-agent | adapt |
| **Person × Agent × Surface tenancy model** | `db/migrations/009_agents.sql`, `010_agent_strict.sql`, `013_surface_room_binding.sql`, `api/_agentscope.js` | production | auth-tenancy, crm, omnichannel | adapt |
| **Structural disclosure** (privacy as a WHERE clause; withdraw-not-delete) | `api/_disclosure.js`, `api/_room.js`, `db/migrations/008*` | tested (0 leaks in 31,122 checks) | crm, company-brain, auth-tenancy | adapt |
| **Upstream failure ladder** (quota / deterministic / transient classifier; wall-clock deadline; same-key retry; family cooling; two-phase fuse) | `api/_lanes.js`, `api/_gkeys.js`, `api/speech.js`, `evals/resilience/run.mjs` | production | infra-ops, orchestration, voice-agent | adapt |
| **Azure OpenAI v1 lane** (deployment-name defaults; skips cleanly when unconfigured) | `api/_azure.js`, `api/_embed.js` | tested (not measured live) | infra-ops, chat-agent | drop-in |
| **Turn trace** (7-leg spine plus legs, off-path writes, converging upserts, references not copies) | `src/engine/trace.ts`, `api/_trace.js`, `api/trace.js`, `db/migrations/012_turn_trace.sql`, `scripts/trace.mjs`, `scripts/pull-trace.mjs`, `docs/TRACE.md` | production | analytics, eval-quality, orchestration | adapt |
| **Memory graph and episodic consolidation** (episodes as citation ground truth; index-only citations; 5% second-family entailment audit that halts on refutation above 2%; contradictions as new rows; hard-delete forget plus forget-word suppression) | `api/memory.js`, `api/consolidate.js`, `api/consolidate-sweep.js`, `db/schema.sql` (`vy_episode`, `vy_fact`, `vy_embedding`, `meera_forget`) | production | company-brain, memory-learning, crm | rewrite (big, persona-entangled; take the design) |
| **Semantic recall on Neon** (`halfvec(1536)` person-filtered exact scan, run concurrently with keyword search) | `api/_embed.js`, `api/memory.js` opRecall, migration 004 | production | company-brain, memory-learning | adapt |
| **Client-side voice floor** (hold ring, echo coefficient κ, LISTEN/BARGE bars, silence heartbeat, stuck-endpoint watchdog) | `src/voice/liveCall.ts`, `src/voice/level.ts`, `LiveWatchEngine.java` | production (Gemini Live) | voice-agent | rewrite (port to Azure Voice Live / gpt-realtime; the protocol differs) |
| **Echosim** (transpiles the real `liveCall.ts` standalone and drives it through a room impulse response; 80-call floor table, stucksim, rotatesim) | `evals/echosim/*` | tested | voice-agent, eval-quality | adapt |
| **Voice-identity guard** (asserts every lane names the same voice and model) | `scripts/verify-voice.mjs` | production | voice-agent | adapt |
| **Spoken-text sanitiser** with content-preservation tests | `src/voice/spokenText.ts` | production | voice-agent | adapt |
| **Lifecycle matrix as code** (events × contexts; each cell names its carrier plus a why; a dead `direct` cell fails the build) | `src/voice/callHistory.ts` (`LIFECYCLE_MATRIX`), `evals/lifecycle/run.mjs` | production | orchestration, voice-agent | idea-only/adapt |
| **Scene wake detector** (wakes on the hold, not the change; pure geometry; no taste in code) | `src/watch/scene.ts`, `SceneReader.java` | production | voice-agent (screen-aware sales demo/assist) | idea-only |
| **verify-release harness** (one command, all gates, failures printed together; `--live` opt-in because it costs money) | `scripts/verify-release.mjs`, `scripts/check-workflows.mjs`, `scripts/write-config.mjs --stub` | production | infra-ops, eval-quality | drop-in |
| **Workflow linter** (illegal contexts in a job-level `if:`) | `scripts/check-workflows.mjs` | production | infra-ops | drop-in |
| **Capacitor OTA updater** (zip plus external sha256 manifest, origin pinned in the APK) | `scripts/ota-bundle.mjs`, `android/.../Ota*.java` | production | infra-ops (field-sales mobile app) | adapt |
| **Judge harness and qualification method** (both orders judged, test-retest ceiling, position-bias detection) | `scripts/derive-adapter.mjs`, `evals/dbattery`, `evals/candidate`, `docs/SWAP-TEST-PREREG.md`, `docs/paper/` | tested | eval-quality | adapt |
| **Labelled key pool** (one-way key→label for root-cause analysis) | `api/_gkeys.js`, `scripts/keyring.mjs`, `docs/KEYRING.md` | production | infra-ops | idea-only (Azure uses one key per resource) |
| **Sound and haptic vocabulary** (closed cue set plus a REFUSED table; one gated engine) | `src/sound/*` | production | design-ui | idea-only |
| **Taste table and "write shapes, not lines"** (telegraphic notes consulted deterministically) | `src/engine/inner.ts` (TASTE, `tasteNote`) | production | content-gen, chat-agent | idea-only |

---

## 6. Measured lessons

All of these are from `context/measurements.md` and `context/decisions.md`, with n and method recorded there.

- **Prompt position is mechanism.** The same rule fired 0/8 when buried mid-brief and 8/8 when appended
  last. The last position is a capped resource (exactly two rules).
- **Sentence-shaped prompt text gets recited.** Example quotes were recited verbatim on 4 of 5 turns, and
  0 after removal (n=84). Taste written as polished English was echoed verbatim and defected register on
  13/96 turns. Rewritten as telegraphic notes: 1/32 and 0/32. Short structured tags do not recite (n=84).
- **Behavioural rules leak; predicates do not.** Privacy written as prompt instructions leaked on 57.1% of
  naturalistic and 98.1% of adversarial scenarios. The SQL predicate leaked 0 of 31,122 checks (494
  scenarios, with a negative control that caught 162 violations). An honesty instruction still produced a
  fabricated "your resume arrived" in 1 of 8 attempts (n=31).
- **The prompt sets a ceiling; the model decides how close you get.**
  - grok-4-20 lost 38–2 to the incumbent on a byte-identical prompt (48 units, both orders, blind judge).
  - Azure `gpt-realtime-2.1-mini` ran 41–53 words per turn against 20.5, with a median spoken turn of 14 s.
- **Prompt caching matters about 9× more than list price.** Cost per turn $0.0017 cached vs $0.0160
  uncached. A model with no prefix cache that is 5× cheaper per token costs more. The byte-identity of CORE
  is therefore a cost invariant.
- **Reasoning splits by emotional weight.** It helps light beats (74–21) and hurts heavy ones (29–3 against,
  helplines over-triggered on 16.7% of turns). First token takes 5.2 s vs 0.63 s. Do not route by beat: you
  would have to classify before generating, so a misclassification puts reasoning on the crisis turn.
- **Realtime voice has a latency floor.** About 1,370 ms median, of which 720 ms is the text prefill of a
  48k system instruction. `silenceDurationMs` at 150, 300 or 500 lands within 50 ms of each other. The win
  available is variance, not median.
- **Azure realtime protocol facts.** Input audio must be 24 kHz or higher (16 kHz is refused). There is no
  continuous image or video buffer, so frames go in as `conversation.item.create` items. Barge-in is a VAD
  onset (`speech_started`), not a semantic `interrupted`.
  - Working handshake: `/openai/v1/realtime?api-version=preview&model=<deployment>` with the nested GA
    session schema.
  - Node WebSockets need `NODE_USE_ENV_PROXY=1` behind a proxy.
  - Azure mini barge-in measured a 271 ms median.
- **Vision fabrication.** grok-4-20-non-reasoning made 0/32 fabrications at the app's real 355×768 q68
  frame shape, with a 428 ms median. gpt-5.6-luna and terra read a third of a thread and asserted the rest.
  Scene-change gating takes vision cost from about $25/h to about $2.66/h.
- **Fabrication noise floor.** In the replay harness, any fabrication claim below n=300 is noise: a 13.6 pp
  spread on byte-identical inputs.
- **Judges fail.** DeepSeek-V4-Flash scored 27–28% agreement, gpt-5.6-terra 52–54% (it misreads Hinglish
  teasing as dismissive), and grok-4.3 34%. All had 58–81% slot-A bias. The trusted judge agrees with itself
  only 77.1%, so any qualification bar must sit relative to the test-retest ceiling.
- **Semantic recall.** The DB scan takes 40 ms at p50 and the embed call 305 ms, so run semantic and
  keyword recall in parallel. Recall@8 went from 73.9% to 95.7% after the memory wave. Consolidation costs
  about $0.0007 per person per night.
- **Trace overhead is zero.** It adds no SQL statements on the reply path, about 4 µs per turn on the
  client, and about 4.4 KB stored per turn.
- **Resilience latency.** A 6.7 s 502 now lands on Azure 257 ms after the deadline instead of returning a
  canned line. A wall-clock deadline of 4,000 ms holds even when every key is slow.
- **Call cost per minute.** Live voice $0.014, cascade $0.029, live plus screen share $0.037, cascade plus
  share $0.109. Video frames are 47–65% of a share minute.
- **Free tiers.** Free TTS is a DAILY budget: all keys returned 429 together after a few dozen calls. The
  free pool's real ceiling is about 75 calls per day. OpenRouter's `stream:true` on TTS is a no-op.
- **Barge-in tuning.** `ONSET_DUTY` 0.6 is one step from a cliff. Gating the soft path took a quiet talker
  from 7/8 to 1/8 and was thrown away.

---

## 7. Rejected and failed approaches (highest value)

**Voice and models:**

- **Backchannel while the user speaks.** The mic hold needed to protect it from echo is digital silence, and
  the server reads silence as end of turn, so the protection and the damage are the same act. The fix was an
  acknowledgement in the gap about 420 ms after the user stops. A synthesised "mm" was rejected by ear: not
  her timbre.
- **Azure TTS (coral).** It won every measured axis (15/15 pronunciation, 255 ms, 5× cheaper) and was
  rejected by ear as "not human and not Indian". Pronunciation is not accent identity. Pitch in Hz is
  unreliable as a screen.
- **Azure `gpt-realtime-2.1-mini` for voice.** Barge-in and vision were good. It was rejected on register:
  41–53 words per turn, 14 s monologues, weak Hinglish, no voice near target, no frame channel. The reversal
  conditions are written down.
- **Gemini alternatives for live voice.** They reject video and miss the 600 ms barge-in watchdog.
- **Faster screen frame cadence** gave 0 ms gain on 18/18 stops. **Shorter VAD silence** gave nothing.
  **Loosening wake dedupe** was wrong: the "duplicates" are the same screen.
- **Speaker ID** was deliberately not built. A 95%-accurate gate turns a 100%-reliable floor into a
  95%-reliable one for the owner.
- **Open-weight and Indic models** showed 63–99.8% register defection and no prompt caching. Claude is
  excluded from Azure credits and bills the card.
- **Bracketed stage directions in TTS** get performed as words ("[laughs softly]" was spoken as "Softly").
- **Immediate rotation on `goAway`** cuts her off mid-word. The `timeLeft` duration is in seconds; stripping
  the unit gave a 1000× error.

**Safety and honesty:**

- **Honesty by instruction:** the rule existed and she broke it twice. Replaced by an output predicate.
- **A pattern blocklist for identifiers** would have deleted the crisis helpline. Replaced by a provenance
  allowlist.
- **Co-occurrence detectors without a distance bound** fail in SOV Hinglish.
- **A sanitiser regex deleted the bold word** she was emphasising. The rule now: every text transform needs a
  content-preservation control, not only a markup-absence control.

**Architecture:**

- **Second prompt assemblers:**
  - The realtime lane had its own concatenation and silently lost `AGE_TIER_SAFETY_OVERRIDE` and
    `FORGET_DECISION`.
  - It also read recall from a ref in the same tick the promise was created, so recall was always empty.
  - Telegram got the raw model string with no gates.
  - The rule since: exactly one assembler and one gate, and surfaces route to it rather than copy it.
- **Recall through a consume-once return value**, with three compile sites and no shared call frame.
  Replaced by a device-keyed holder.
- **Per-listener agent self-facts** let two users be told contradictory lives. The rule: agent state is
  agent-scoped, and only relationship state is person-scoped.
- **Changing a primary key** silently broke 10 `ON CONFLICT` upserts, 7 of them inside `.catch()` swallows.
- **UPDATE-only writers with no INSERT owner** left `vy_rel_state` with zero rows for every user.
- **A rupture flag with no time-based close** became a permanent grudge. The record now stays permanent
  while the stance lapses.
- **Last-message-wins across tabs** resolved multi-field conflicts by one field's recency, which erased data.

**Process and ops (the "artefact exists, nothing observes it" family):**

- **Dead writers.** Correct code with no caller; enum values never produced.
- **Cron on a non-default branch** never fires: zero scheduled runs ever.
- **Secrets in a job-level `if:`.** It invalidates the whole workflow, giving zero jobs for 9 days, and the
  reporter job died with it.
- **Gates living in the scratchpad.** They verified a frozen bundle.
- **An engine-bundle drift check that nothing ran.**
- **`sourceStatus: "wired"` manifest fields set by hand.** These are anti-signals.
- **Prose entries with no graph node.** The validator checked only one direction.
- **`--dry-run` that still called the paid model.**
- **Resumable state that recorded attempts rather than outcomes.** It reported COMPLETE at 37% coverage.
- **Research and production sharing one key or quota.** Production chat went down because evals spent the
  day's budget, twice.
- **5xx folded into "deterministic"** aborted a healthy 9-key pool on one 502.
- **A fixed 1,400 ms fuse on a variable upstream** turned a slow night into a silent one.
- **Live clock or calendar inside byte-identity gates** caused 1.7%-odds flakes.
- **Seven agents in one working tree** led to a reset that destroyed work. The structural fix is worktrees.
- **CI deploy without a pinned project** shipped to the wrong site.
- **Comparing a fully-judged arm to a partially-judged arm**, and **row count taken as diversity**.
- **Sound gate "proved" by silence.** It was an assertion that could not fail.

---

## 8. Risks and landmines

- **Not Azure-native.** The brain, live voice and TTS are Google Gemini (free pool, OpenRouter, Google
  direct). The repo itself measured that Azure realtime and Azure TTS do not meet *this persona's* bar.
  Sales-enabler's Azure-only constraint means re-running those bake-offs for a business register, where the
  bar is different: a sales or support agent is not judged on being a Bangalore girl. Do not import the
  rejection verdicts blindly; import the method and the protocol facts.
- **`liveCall.ts` is Gemini-Live-protocol specific.** It uses 16 kHz uplink, `serverContent.interrupted` and
  `goAway` rotation. Azure Voice Live / realtime needs 24 kHz and VAD-onset barge-in. The floor logic ports;
  the socket code does not. It must import only `./level` and `../engine/diag` to stay simulatable.
- **Client-side brain.** `brain.ts` compiles in the browser, which is wrong for a multi-tenant SaaS with
  secrets and tenant data. Move compilation server-side; the `_engine.gen.js` bundle shows the path.
- **Device-keyed identity.** `vy_person_device` and the device-keyed holders mean identity is a device. The
  Taxila law says identity must be an authenticated id, never a device. A SaaS needs real auth and tenancy
  (org → user → agent).
- **Vercel serverless constraints shaped the design.** These include no `waitUntil`, one SQL statement per
  request, and no transactions. On Container Apps these constraints lift, so do not cargo-cult off-path
  tracing contortions where a background queue would do.
- **Size and entanglement.** `api/memory.js` (4.4k lines), `api/consolidate.js` (2.9k), `honesty.ts` (2.2k)
  and `brain.ts` (2k) are full of Hinglish and Meera specifics. Take the designs and the tests, not the files.
- **Secrets in a gitignored `api/_config.js`** that deploys inside the Vercel payload. Do not copy this
  pattern; use Azure Key Vault and Container Apps secrets.
- **Unqualified judges.** Any LLM-judged eval in the new product needs a qualified judge with a measured
  test-retest ceiling and position-bias check. All Azure-credit judges failed here (on Hinglish charm, which
  may not transfer to business tasks).
- **Preview model churn.** A Foundry deployment's behaviour drifted within 4 days (`vision-drift-4day`).
  Grok on Foundry was a beta build. Pin, monitor drift, and keep same-model twins (`model-twins-pinned`).

---

## 9. Azure dependencies (in this repo)

- Azure OpenAI / Foundry resource in East US 2, configured through `AZURE_ENDPOINT` (`/openai/v1` base) and
  `AZURE_KEY` / `AZURE_API_KEY`.
- Deployments in use:
  - `grok-4-1-fast-reasoning` for memory extraction.
  - `text-embedding-3-small` for embeddings.
  - `grok-4-20-non-reasoning` as the Azure chat last resort and the first lane for attachments.
- Deployed and evaluated, but not wired: `gpt-5.6-luna`, `gpt-5.6-terra`, `grok-4.3`, `grok-4-20-reasoning`,
  `gpt-4o-mini-tts`, `gpt-realtime-2.1-mini`, DeepSeek-V4-Flash, Mistral-Large-3, Cohere command-a-plus
  (the last three as judges).
- No Azure Speech, ACS, Container Apps or Key Vault usage. Hosting is Vercel, the database is Neon, and auth
  and storage are on Supabase.

---

## 10. Recommendation for sales-enabler

**Adopt now (mostly drop-in):**

- The **`context/` system plus `scripts/context.mjs --check`** as the command centre's own engineering
  memory: decisions with reversal conditions, measurements with n/method/date, rejections first, and the
  bidirectional check.
- The idea behind the **`verify-release.mjs`** pattern, plus **`check-workflows.mjs`** and the
  **`write-config --stub`** CI trick.

**Build the agent core on these patterns (adapt):**

- **One compiler for every agent and lane.** Use a CORE (stable, cacheable, byte-identical per agent
  version) plus TAIL (per-turn context slots with byte budgets and whole-block drop priority) layout. Keep
  must-fire rules last, and have a budget gate that throws. This is directly what the voice agent, chat
  agent and campaign generator need, and it protects Azure prompt caching, which is about 9× on cost.
- **AgentModule / CharacterSheet** for per-tenant or per-brand agents (SDR, support, collections). A new
  agent is a registry row, never a fork of the assembler.
- **Surface contract plus person × agent × surface tenancy** as the omnichannel spine: email (ACS),
  WhatsApp, Telegram, web chat and voice are each four functions. Memory hangs off (agent, contact) and never
  off the channel. Add `org_id` above everything.
- **Safety by predicate.** Take the provenance allowlist (no invented prices, discount codes, emails, phone
  numbers or case numbers in outbound copy or agent speech), structural disclosure (tenant and contact
  privacy as SQL, not prompt), and a single fail-closed `gatedReply` for every outbound channel. That matters
  even more for campaigns that send at scale.
- **Turn trace** as the observability spine for every agent turn and campaign send. It doubles as the
  analytics substrate.
- **The failure ladder** (`_lanes.js`) for Azure deployments across regions or models. Use the
  quota / deterministic / transient classification and a wall-clock deadline, and never fold 5xx into a
  pool abort.

**Company brain:** take the design of episodes as citation ground truth (index-only citations, a sampled
second-family entailment audit, contradictions stored as new rows, hard-delete forget with suppression) and
pgvector `halfvec` on Neon, with person- or tenant-filtered exact scan and semantic and keyword recall run in
parallel. Rewrite the code against a CRM data model.

**Voice agent:** start from Azure Voice Live / gpt-realtime using the recorded protocol facts. Port the
**client-side floor** concepts: a hold ring, a silence heartbeat (never shed silence to zero), a
stuck-endpoint watchdog, and boundary-seeking `goAway` rotation. Port **echosim** as the regression harness
before tuning anything. Re-run the bake-off with a business-register rubric (words per turn, barge-in inside
the watchdog, accent fit for Indian callers) and an **ear test**, because `azure-tts` shows metrics alone
picked the wrong voice.

**Process rules to adopt:**

- Separate research and production Azure deployments and quotas, with a balance alarm.
- A dry run must spend nothing.
- Resumable state records outcomes.
- Every scheduled job needs an output-side proof (a row count or completed-run check).
- Every table has one named first-row owner.
- Agents work in worktrees.
- Pin deploy targets.

**Skip:** persona content, Hinglish companion register, games, the sky/theme world layer, the sound
vocabulary, and the Gemini key-pool machinery (Azure uses one key per resource).
