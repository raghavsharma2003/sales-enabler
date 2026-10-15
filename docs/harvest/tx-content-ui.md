# Harvest: tx-content-ui (Taxila: content, games, Volt design system, Asha avatar, Khand)

Repo: `/home/user/Taxila`. Branches read with `git show` and `git ls-tree` only. No worktree was kept, because a first worktree attempt filled the shared disk and was removed at once. Date of harvest: 2026-10-15.

## Summary

This cluster is Taxila's "what the child sees" layer:
- the live content pipeline (Forge G1, explainer templates, the Studio archetypes, the forge3 compose ladder and the tray certificate gate);
- the offline codegen pipeline (Forge G2, run as untrusted Azure Container Apps Jobs);
- the deterministic games stack (`src/play`: pure laws, server replay grading, the core3d three.js engines Antariksh and Khand);
- the "Kaksha / Volt night" design system (token-only, per-scope themes, lint-gated);
- the 2D painted-puppet avatar for the teacher, Asha (lamp1 and lamp2 rigs, both held as failed on blind judges).

The most valuable thing here for an AI company command centre is not the child-specific UI. It is three engineering principles that were measured repeatedly:
1. **Models choose data, code builds the thing.** Models pick closed enums, template ids and parameters. Geometry, numbers, labels and answer keys are always computed in code.
2. **One certificate gate before every pixel is revealed.** It is enforced by a test that scans the source for ungated producers.
3. **Grading by replaying signed raw acts on the server.** The client is never trusted.

The second half of the value is the rejections log. Free generation, generated media carrying facts, holistic LLM judges and mean check-pass as quality were all measured and all failed. These lessons transfer directly to AI-generated campaign assets, dashboards and agent outputs.

The Volt token system (`src/ui-v3/kaksha/*`, `src/styles/tokens.css`) is a reusable pattern: tokens only, one accent carrier per screen, contrast pairs checked at 5:1 or better in tests, and reduced motion stilling everything. The palette and the gamified chrome are child-specific and should not be copied as-is.

## Branches covered

| branch | last commit | relation to `int/r5-rel142` (newest integration) | what it holds |
|---|---|---|---|
| `claude/r4-content` | 2026-10-15 08:44 | ahead 12, behind 3. It is effectively the current tip plus the R5 board-sync work | Stream 2 "live content and the Desk": the tray gate, claims-board, fraction-of@1, early piece, the Kaksha tray skin. It also carries R5 board-sync fixes from 2026-10-14/15 (a board page must share a word or number with her line, and Hindi and English names are one word). It is the best single snapshot of the whole tree |
| `claude/r4-games-core` | 2026-10-11 08:16 | ahead 5, behind 233 | G1: the core3d API, Antariksh (3D number-line "aim → fire → decloak"), kon (angles), the dress delta, the economy lint. The 5 unmerged commits are: parent corner in Volt calm (`src/parent/parent.css` +124), `src/play/core/volt-art.ts` (r3 family games on the dark arts), and a parked ITEM-ARENA format-patch (docs only, about 120k lines) |
| `claude/r4-app-design` | 2026-10-11 08:11 | ahead 0, fully merged | Stream K / U1. Three offline HTML prototypes (Kaksha dark game client, Nagar isometric city, Chhaap riso print). Then the Kaksha shell and the futurist looks (Holo vs Volt). Release 11 "Volt everywhere" with versioned device keys |
| `claude/r4-asha` | 2026-10-11 07:53 | ahead 0, fully merged | Stream 5. Single teacher (Asha for classes 1-9, Arjun and Uma parked), look switch r8/lamp1, journey AUDIT, set-up and sign-in in Volt night |
| `claude/r4-asha-rig2` | 2026-10-10 12:05 | **no merge base**: rewritten history, 432 own commits | lamp2 painted-key rig (`src/face-puppet/rig-keys/`), RESEARCH/RESULTS, 17 gpt-image-2 keys, judge tallies. HELD: it fails the premium gate |
| `claude/r4-khand` | 2026-10-10 23:46 | ahead 1, behind 268 | G2 Khand (voxel block world, Nazariya law). The 1 unmerged commit is a docs-only format-patch of the stopped "MEASURE" mode. The engine itself is merged (`src/play/engines/khand/`) |

How the branches differ: app-design, asha and most of khand and games-core are already in the integration line that r4-content tracks. Only rig2 (lamp2, held) and small slices of games-core and khand (parked patches, parent Volt calm) are unique.

## Product

Taxila is an AI Hindi-English tutor for Indian children in classes 1-9. This cluster built the following, with state for each.

**Live visuals during a lesson.** The teacher's line is accompanied by a board or piece in the child's "tray".
- **Built and verified** on adult-scripted batteries:
  - owner-5: 14/14 slots became an artifact;
  - 51 boards with 0 contradictions and 0 illegible at 360 px;
  - a 200-lesson simulation: 93.0% right-artifact-ready.
- **Not met:** request → piece in ≤ 3 s at p90. Measured p90 was 5.5 s, n = 22.

**Games.** Seven deterministic "families": nishana (number line), todo-jodo, taraazu, nazariya, kyun-lab, kon, plus the 3D engines Antariksh and Khand.
- Levels are code-generated and solver-checked.
- The server replays the signed raw acts and folds evidence into the learner model with `via:"game"` at half weight.
- Batteries: 0 wrong grades over ≥ 5,000 random acts per mode, 145/145 skill runs into the ledger, the forge3 visual cert at 3 viewports.
- Unmet in both engines: game offered unprompted at the practice beat (C9b, 0/3 in every run), and real-phone fps (C10). Software-GL proxy only.

**Design system.** "Kaksha + Volt night" is the default child app for every account since release 11 (2026-10-11).
- Certificates: 120 real pages with 0 lint findings, 72/72 parity for non-cohort users, 6 palettes × 21 pairs all ≥ 5:1 contrast.
- The public landing site uses the same tokens through K's scope, enforced by a test.

**Asha avatar.**
- r8 is the live face.
- lamp1 failed the blind "uncanny" gate: 4, 5, 3 and 4 of 5 judges against a bar of ≤ 1/5.
- lamp2 passes uncanny (v3 pooled 2/15) but fails "premium": 2.6-2.8 vs r8's 3.0-3.4 in the same runs. It is held.

No child has used any of it. Every result is adult-scripted, simulated or proxy.

## Architecture & stack

- **Client:** React 19 + TypeScript + Vite.
  - three.js, tree-shaken to about 99 KB br, is the only 3D stack. Babylon, PlayCanvas and Phaser were rejected.
  - Canvas 2D for the puppet rig. SVG and DOM for boards.
  - Fonts: Bricolage Grotesque, Atkinson Hyperlegible Next, Geist Mono, Mukta (for Devanagari) and Space Grotesk, all self-hosted.
- **Server:** plain JS ESM with one router and `routes/*.js` tables. Key modules:
  - `server/forge/` (G1 live fill, explainer templates, scene@1 DSL, G2 codegen);
  - `server/forge3/` (compose ladder, certify, tray gate, visual QA in Chromium);
  - `server/studio/` (12 archetypes + whiteboard, QA players, request/seam);
  - `server/play/` (start/act/replay/dress/evidence, coverage rules per family).
- **Contracts:** `shared/play.ts`, `shared/studio.ts`, `shared/contracts.ts`, and `src/play/engines/core3d/api.ts` (core3d@1: `create(core, deps) → EngineView`).
- **Data:** Neon Postgres. Tables include `kt_evidence`, `kt_skill_state`, `kt_misconception`, `play_build` (migration 026), `forge_gap` and the fill cache.
- **Blob:** Azure Storage holds the G2 run containers, the review queue and the catalogue.
- **Compute:**
  - Azure Container Apps hosts `taxila-web` and the worker.
  - The ACA Job `forge-g2-runner` runs in a separate environment, `taxila-forge-untrusted`, with a per-build SAS on that build's own run container only.
- **Flow (live content):**
  1. Director turn.
  2. `forge3/compose.js` runs a ladder: play level → engine → template board → skeleton. It is pure code, under 1 ms.
  3. G1 `requestFill`: plan (code) → cache (memory → Neon) → optional taxila-fast flavour pick (enums only, ≤ 3.5 s) → build (code) → gate (code) → mount.
  4. `forge3/tray-gate.js certifyForTray`, at the device's reported box.
  5. Reveal on the Studio stream.
- **Flow (games):**
  - `POST /api/play/start` returns a signed session.
  - The client `PlayController` runs the pure law (≤ 100 ms) and records the raw act envelopes.
  - `POST /api/play/act`: the server regenerates the level from the signed session, replays the acts (`gradeLevel` in `src/play/core/replay.ts`, the same code on the client), and writes `kt_evidence`.
  - The "dress" (theme, music, pace) is one taxila-fast call with a strict closed-enum schema, validated field by field, with a 1.9 s deadline. Otherwise the base dress is used.

## Reusable assets

| asset | paths (on `origin/claude/r4-content` unless noted) | maturity | reuse for | effort |
|---|---|---|---|---|
| **Certificate gate + producer-scan test.** Every path that reveals UI asks one gate; a test fails when a new producer is added without the gate call | `server/forge3/tray-gate.js`, `tests/r4-content-tray-gate.test.mjs` | tested | safety, eval-quality, campaigns (gate every outbound asset/message) | adapt |
| **Visual QA in Chromium.** Measures rendered text size, clipping, overlap and canvas `fillText` via an init script, at named viewports | `server/forge3/qa/measure.js`, `qa/render.js`, `qa/viewports.js`, `qa/checks.js` | tested | design-ui, eval-quality, content-gen (email/landing QA at 360/412/1366) | adapt |
| **"Model picks enums, code builds" dress pattern.** Strict schema, field-by-field validation, deadline fallback to a base | `server/play/dress.js`, `src/play/engines/core3d/api.ts` (`validateDelta`, `DRESS_ENUMS`) | tested | campaigns, content-gen, chat-agent, orchestration | drop-in pattern |
| **G1 live fill pipeline.** plan → cache keyed by canonical-JSON sha of (versions + model + kit + item + skin) → optional model flavour → code build → gate → dead-key memo | `server/forge/index.js`, `planner.js`, `generator.js`, `gate.js`, `cache.js` | production (in release) | content-gen, campaigns (personalised asset fills with cache identity) | adapt |
| **Explainer templates.** A data call → a timed whiteboard script; every number and position computed in code; strict lint (inside board, no overlap) | `server/forge/explainer/templates.js`, `pick.js`, `truth.js`, `guard.js`; `shared/whiteboard.js` | production | content-gen (chart/diagram generation for reports), analytics | adapt |
| **scene@1 DSL.** A zod schema as the single source → JSON Schema + strict wire schema for Azure structured outputs; expression language, layout pass, lint S1-S7, autofix; no eval | `server/forge/scene/dsl.mjs` (vendored from `docs/research/content/genui-scene-dsl.mjs`) | tested | design-ui (generative UI under schema), content-gen | adapt |
| **Studio archetype library.** JSON archetypes with params schema, truth rules, string keys, budgets, anti-patterns; prompt builder with rules last; QA players per archetype | `server/studio/archetypes/*.json`, `archetypes/index.js`, `server/studio/qa/players/*` | tested | content-gen, campaigns (archetype = campaign template with gates) | adapt |
| **Forge G2 untrusted codegen pipeline.** Design → mechanic → lint → headless QA (opaque iframe, hash CSP, dead proxy) → mutant bots → critic → human review queue; runs as an ACA Job with a per-build SAS; import-closure check on the runner image | `server/forge/g2/*` (`run-build.js`, `azure-job.js`, `store.js`, `lint.js`, `qa.js`, `review.js`, `kit/KIT.md`, `kit/runtime.js`), `scripts/forge-g2-deploy.mjs`, `infra/forge-runner/` | tested (Azure builds run) | orchestration, infra-ops, safety (sandboxed agent-code execution on ACA) | adapt |
| **Sandboxed mechanic API (tgk-lite@2).** Opaque refs that cannot name the key; no Math.random, Date or DOM; the kit draws the targets and values | `server/forge/g2/kit/KIT.md`, `kit/runtime.js`, `lint.js` | tested | safety, design-ui (constrained agent-authored widgets) | idea-only/adapt |
| **Signed-session + server-replay grading.** Raw acts are replayed by the same pure law; forged, tampered and replayed acts are refused; first-committed-act evidence rule | `src/play/core/replay.ts`, `controller.ts`, `server/play/session.js`, `start.js`, `routes.js`, `evidence.js` | production | eval-quality, crm (trustworthy event-sourced scoring), analytics | adapt |
| **Economy lint.** No persisted counters, no wall clock or RNG in progress code, every progress write traced, banned vocabulary | `tests/r4-games-core-economy.test.mjs`, `tests/play-style-lint.test.mjs` | tested | safety (dark-pattern lint for engagement features) | idea-only |
| **Juice limits module.** Effects are caused and proportional; hit-stop ≤ 80 ms, shake ≤ 6 px, ≤ 90 particles; reduced motion | `src/play/core/juice.ts` | production | design-ui | drop-in |
| **core3d engine contract + 3D stage.** DOM labels with floors, frame governor (DPR ratchet), context loss → 2D twin, audio bus with voice duck, tier rule | `src/play/engines/core3d/*`, `docs/design/round4/build/games-core/CORE-API.md` | tested (proxy fps only) | design-ui (3D dashboards/visualisations) | adapt |
| **Khand greedy voxel mesher in a Web Worker** | `src/play/engines/khand/mesher.ts`, `mesher.worker.ts`, `meshClient.ts` | tested | design-ui (only if 3D is ever needed) | drop-in |
| **Kaksha / Volt design tokens + scoped themes.** `.kx[data-klook][data-ktheme]`, one-accent ("volt") law, chamfer/HUD components, reduced motion; token-only with a lint that bans colour literals | `src/ui-v3/kaksha/{futurist.css,kaksha.css,childshell.css,look.ts,flag.ts,shell-attrs.ts}`, `src/styles/tokens.css`, `src/app/landing/Site.tsx` (`VOLT_NIGHT`), `tests/r4-kaksha-lint.test.mjs`, `tests/r11-site-volt.test.mjs` | production | design-ui | adapt (re-palette for B2B) |
| **Re-pointing legacy tokens to a new scope with var() only** (migrate a whole app's look without touching components) | `src/ui-v3/kaksha/childshell.css`, `src/parent/parent.css` (games-core branch), `src/onboarding/volt.css` | production | design-ui | idea-only |
| **Parity harness.** Proves non-cohort users are byte- and pixel-unchanged by a flag-gated redesign | `tests/prod/r4-kaksha-parity.mjs` | tested | design-ui, infra-ops (safe redesign rollout) | adapt |
| **Prototype + lint + judge harness for design directions.** Self-contained HTML, 12 states × 2 viewports × 3 languages; lint for text px, Devanagari px, target px and contrast | `docs/design/round4/app/_src/{build,shoot,lint,judge}.mjs` | prototype | design-ui | adapt |
| **Product-capture pipeline for the marketing site.** The site only shows screens the app draws | `tests/prod/r11-site-captures.mjs`, `public/site/` | production | design-ui, campaigns (landing pages from real captures) | adapt |
| **Puppet driver.** Visemes from TTS on the player clock → mouth shapes; acting policy (verdict-neutral, safety calm face); blink and gaze schedules | `src/face-puppet/driver.ts`, `ttsBridge.ts`, `track.ts`, `policy.ts`, `visemes.ts`, `src/avatar/{behaviour,lip,compositor}.ts` | production (r8 live) | voice-agent (talking-head for a voice agent) | adapt |
| **KeyRig painted-key 2D rig.** At most 7 blits per frame, 30 ms crossfade, 70 ms hold, bilabial seal rule | `src/face-puppet/rig-keys/{keyrig,schedule}.ts` (on `claude/r4-asha-rig2`) | prototype (held) | voice-agent | idea-only |
| **Image-key registration pipeline.** gpt-image-2 edits of one front, registered with ORB + RANSAC / ECC, composited only inside the region, with a cost ledger | `scripts/character/puppet2d/lamp2/*` (rig2 branch) | prototype | content-gen (consistent brand-character variants) | idea-only |
| **Blind model-judge panel protocol.** Cross-family judges, n = 5, calibration arm in the same run, binary atomic questions | `scripts/character/puppet2d/lamp2/jobs.mjs`, lamp1 `judge-live.mjs`, `docs/design/round4/asha/rig2/RESULTS.md` | tested | eval-quality | adapt |
| **Talk-gate.** Measures a persona change by the simulated user's talk share vs a same-harness baseline | `scripts/talk-gate.mjs`, `evals/director-sim.mjs` | tested | chat-agent, voice-agent, eval-quality | adapt |
| **Claims-board.** The visual drawn must match exactly what the agent's line claims, re-gated; mask the answer with "?" instead of dropping | `server/stagecraft/claims-board.js`, `server/studio/request.js` (`unpointGently`) | tested | voice-agent / chat-agent (screen-share claims consistency) | idea-only |

## Measured lessons

- **Free generation is too slow and too wrong for live use** (2026-10-02, genui benches):
  - free scenes: 11.9-18.2 s p50 per call, 0/8 to 3/8 lint-clean on the first call;
  - `json_object` output: 7/8 schema-invalid, and one repair fixed 0/7;
  - templates and engines live is what works (`context/rejected.md#live-free-generation`).
- **Generated pixels cannot carry facts** (2026-10-02):
  - gpt-image-2 Hindi labels on the wrong part 5/32; fully correct images EN 4/6, HI 1/6;
  - Sora 2 drew 3+3 apples under "3 + 4 = 7";
  - a VLM OCR spelling gate false-passed a corrupted glyph (it reads what it expects).
- **Azure Content Safety is not a sole gate** (2026-10-02, n = 13 images): every image scored severity 0, including a near-facsimile ₹50 note. The harm models are not trained on Hindi.
- **Gate before the model call, plus a dead-key memo** (2026-10-03):
  - memory-hit p95 went from 987 ms to ≤ 1 ms;
  - repeated gaps went to 45 ms.
- **Holistic judge and mean pass-rate fail as quality signals** (literature):
  - a holistic VLM judge correlated with humans at r = -0.17;
  - GameASG: 93.2% mean check pass, but only 55.3% of tasks pass every check;
  - use strict all-checks pass rate plus binary atomic checks.
- **Model-judge noise is large at n = 5** (2026-10-10): the identical images scored uncanny 0/5 and then 2/5 on a rerun. Always include a calibration arm in the same run (r8 itself ranged 3.0-3.6 on premium).
- **Persona notes move user talk share, not the name or voice** (2026-10-10, director-sim, n = 6-9 per arm):
  - adding warmth/humour notes dropped child talk by 16% (rejected);
  - "never babyish" + "ask more than tell" dropped it by 9.4%;
  - competence notes verbatim gave +2.5%.
- **Legibility must be measured at the real box** (2026-10-09/10):
  - a fixed 1000 × 625 world in the phone tray rendered labels at 6.9 px;
  - a 0.75 fit floor gave 0/15 engines passing at 360;
  - a per-engine floor (never below 14/16 px words or 44 px targets, else scroll) passed all.
- **Twin-first loading** (Khand, 2026-10-10, proxy): a 2D twin playable in 0.88-2.2 s vs 3D-only first frame at 1.5-4.4 s. Same controller, so acts carry over.
- **Worker meshing:** 0.1-0.2 ms p50 off the main thread, vs 8.2/19.1 ms p50/p95 on the main thread.
- **Voice duck:** music under her voice cut from 5.1% to 1.7-1.9% of the bed (τ 30 ms), n = 3.
- **Lazy loading:** the play chunk went from 231 to 127 KB br. Engine 8.9 KB br, stage + three 108.9 KB br, on demand only.
- **Wall-clock gates on a shared host measure the neighbours.** Gate CPU time and print wall time (rj-r3p-picker-wall-clock-gate).
- **Lip sync:** wawa-lipsync lags 217-233 ms. A 120 ms viseme hold drops r from 0.43 to 0.16. TTS visemes + RMS jaw is the right structure. lamp2's bilabial text rule: 132/132 sealed vs Azure visemes alone 81/132.

## Rejected/failed approaches

| tried | what broke |
|---|---|
| Free scene, explainer and SVG generation in the live loop | 12-30 s latency; 0-3/8 valid; silently wrong geometry (`live-free-generation`) |
| Generated images/video carrying labels or counts | Wrong labels and counts that no gate catches; Sora $0.10/s at 49-118 s per clip (`generated-media-carries-facts`, `sora-for-curriculum`) |
| Content Safety as the only gate | Scores harm, not IP, emblems or text in pixels; no Hindi (`content-safety-sole-gate`) |
| Live codegen racing a lesson deadline | Human review is required, so it can never deliver; 166-223 s and about $0.20 per G2 build (`forge-live-codegen-race`, `r4g-rj-free-codegen-live-games`) |
| "All 18 code gates green" for generated games | Drew pictures teaching wrong quantities; visual checks are needed (`forge-g2-code-gates-miss-pictures`) |
| Full safety check only after the build | 2/8 paid builds rejected for benign words ("Partner", "Belongs"); moved to the design stage (`forge-g2-q8-after-build`) |
| Whole-container SAS for the untrusted runner | Runner could write the approval catalogue; fixed with a per-build run container (`forge-g2-whole-container-sas`) |
| Opaque refs that leaked `slot: "key"` | Generated code could highlight the answer and pass every gate (`forge-g2-refs-carry-slot`) |
| A 2-hour stale-takeover single-flight guard | Duplicate builds every night (`forge-g2-inflight-stale-takeover`) |
| Overwriting the day manifest on delivery | Only the last module survived (`forge-g2-deliver-overwrite`) |
| Hand-listed Docker context | ERR_MODULE_NOT_FOUND at boot; added an import-closure walk (`forge-g2-runner-image-closure`) |
| Single blocklist over all strings | Rejected 11 verified curriculum strings ("fat", "kill snakes"); now a severity tier with a per-topic allowance (`forge-g1-single-tier-blocklist`) |
| Child name check memoised in a child-free cache | One child disabled an activity for all children (`forge-g1-child-name-in-cached-gate`) |
| A model turn per game event | 1.5-2.3 s Director stage; reaction lands after the next act. Replaced by a pre-synthesised reaction bank (`rj-r3g-model-turn-per-play-event`) |
| Per-family reaction lines without conditions | Said the wrong mode's lines; shapes now carry `{?why=}{?mal=}` conditions (`rj-r3p-unconditioned-reaction-shapes`) |
| Admission by topic tag | Mounted a game exercising a different skill; admission is now by skill (`rj-r3g-topic-tag-admission`) |
| Keyword coverage estimates | "Covered" 385/385; coverage must be certified pairs, 83/2497 (`rj-r3-keyword-topic-coverage`) |
| Shrinking a board into the box | 381/382 boards under 14 px at 360 (`rj-r3f-shrink-board-into-box`) |
| DOM-only visual QA | Missed overlapping canvas labels; canvas `fillText` probe added (`rj-r3f-qa-dom-only`) |
| Measuring from a shared working tree | Six other streams' edits contaminated the result; build from `git archive` HEAD (`rj-r3f-contaminated-measurement-tree`) |
| Gate tests on the checkout, not the image | `.dockerignore` dropped `docs/` and the tray gate refused everything in prod (`rj-r4-gate-tests-checkout-not-image`) |
| Claim check before the piece lands | Visual requests fell from 11/12 to 7/12 (`rj-r13-claim-check-before-the-piece`) |
| Word overlap of agent line vs board as a hard gate | 69/234 false flags across Hindi and English (`rj-r3f-w14-hard`, `rj-r13-word-overlap-after-board`) |
| Stripping whole "look at the screen" sentences | Removed the explanation with the pointing (`rj-r5-strip-whole-pointing-sentences`) |
| World models (Genie 3, Muse) for live games | Not on Azure Direct; pixels cannot carry an answer key (`r4g-rj-world-models-live`) |
| A second 3D stack (Babylon, PlayCanvas, Phaser) or noa-engine | 5-13× the bundle, a second renderer to certify (`r4g-rj-second-3d-stack`, `r4g-rj-noa-engine`) |
| "Shoot the answer" game design | A pick-from-a-list in costume (`r4g-rj-shoot-the-answer`) |
| lamp1 mesh-warp puppet | Uncanny 3-5/5 against a ≤ 1/5 bar (`rj-r4-lamp1-mesh-warp-uncanny`) |
| lamp2 painted keys | Premium below r8 in every run. Turn keys re-drew the whole head (two bindis); auto-flattened vector rig looked posterised |
| Earlier avatar routes | Lip-sync on wav2vec on the phone, MakeHuman, MetaHuman, LAM/Arc2Avatar, Rocketbox (`avatar-*-dead-ends`, `rj-metahuman-asset`, `rocketbox-as-premium-face`) |
| Headless recordVideo as motion evidence | Half of each clip black (`r4u-rj-headless-video-capture`) |
| Lime brand mark plus lime CTA | Broke the one-volt law (`rj-r11-site-lime-brand`) |
| `?look`/`?ui` device keys not versioned | Old devices kept classic after the flip; fixed with versioned keys (r4-app-design 8a752b9) |
| Static filler-word lists and symbolic "thinking" badges while waiting | Becomes a tic; users look away from the agent (`rj-static-filler-list`, `rj-symbolic-wait-indicator`) |

## Risks/landmines

- **Disk:** a full Taxila worktree is over 10 GB (PCM clips under `docs/research/voice/`) and filled the shared disk. Read with `git show`, or a sparse checkout.
- **`claude/r4-asha-rig2` has no merge base** with the integration branches: its history was rewritten. Do not try to merge it. Cherry-pick files only.
- **The repo is very large** (decisions.md 929 KB, rejected.md 342 KB, measurements.md 695 KB) and deeply coupled to K-12 concepts:
  - kits, misconceptions and the Director;
  - Hinglish lexicons;
  - NCERT topic ids.
  Almost nothing is drop-in for B2B. The value is in patterns and gates.
- **Every frame-rate number is a SwiftShader proxy.** Real-device performance was never measured (C10 open).
- **No real user has used any of this.** Batteries are adult-scripted or LLM-simulated children.
- **Several in-repo files are vendored copies** guarded by diff tests (`server/forge/scene/dsl.mjs`). Copying one without its source breaks the provenance check.
- **The test environment is fragile.** Playwright 1.63 expects chromium 1243 but the container has 1194 (symlink workaround). There are 60 known environment-only `engines-browser` failures.
- **`.env.local` test DB URLs leaked** into a local task file once (deleted). Never echo connection strings in harness output.
- **Hardcoded Azure names in G2:** `rg-raghavsharma1729-7190`, `taxila-forge-untrusted`, eastus2. Do not reuse them, and do not touch those resources.
- **The design-system gamification is child-specific.** No coins or streaks by policy; the Debrief "earned moment" is tied to ledger state. A B2B command centre needs a different palette and density. Kaksha's chrome (HUD grid, chamfers) may tire users in long sessions, which the README itself flags.

## Azure dependencies

- **Azure OpenAI / Foundry Direct:**
  - `taxila-fast` (G1 flavour pick, play dress delta);
  - brain/sol models (G2 design and critic);
  - `grok-4-1-fast-non-reasoning` (`DEPLOY_CLASSIFY` in batteries);
  - gpt-5.6-sol + Kimi K2.6 (blind judge panels);
  - gpt-image-2 (`DEPLOY_IMAGE`, lamp2 keys: 32 calls, USD 7.09);
  - Sora 2 (probed, rejected).
- **Azure Speech TTS:** viseme events (Diya voice) framed beside the PCM drive the puppet mouth.
- **Azure Container Apps:** `taxila-web` + worker; the ACA Job `forge-g2-runner` in a separate untrusted environment (2 CPU / 4 Gi, `replicaRetryLimit 0`).
- **Azure Container Registry:** image builds from GitHub.
- **Azure Blob Storage:** G2 private queue and catalogue, per-build run containers with 2-hour SAS, public origin for approved modules.
- **Azure AI Content Safety:** one layer of the Q8 ladder, never the sole gate.
- **Neon Postgres** (allowed): learner tables, `play_build`, fill cache, `forge_gap`.

## Recommendation for sales-enabler

1. **Adopt the core content architecture: "model picks, code builds, one gate reveals".** Do this for every AI-generated customer-facing asset (campaign emails, landing variants, report charts, agent screen-shares). Pieces to reuse:
   - the `dress.js` closed-enum + field-validation + deadline-fallback pattern;
   - the G1 cache identity (canonical-JSON sha over versions + model + inputs);
   - the dead-key memo.
2. **Port the certificate-gate discipline:**
   - one `certify*()` function per output kind;
   - a test that scans the server source for producers that bypass it;
   - checks measured on the rendered artifact at real viewports (`forge3/qa/measure.js`), never a model opinion;
   - judges stay advisory: binary atomic checks, cross-family, a calibration arm in the same run, strict all-checks pass rate.
3. **For agent-authored code (custom dashboards, automations), copy the G2 isolation model:**
   - an ACA Job per build;
   - a per-build storage container with a short SAS;
   - trusted ingest pins the bundle sha;
   - code runs only in an opaque-origin iframe with hash CSP;
   - an import-closure check on the runner image;
   - a human review queue before promotion;
   - design-stage safety checks.
4. **Use event-sourced, replayed scoring for anything the CRM/ERP "grades"** (lead scores, agent QA, campaign attribution). Store raw signed events and recompute with the same pure function on server and client.
5. **Design system:**
   - take the mechanism of Kaksha tokens, not the look: `.scope[data-look][data-theme]`, raw hex only in one tokens file, lint against colour literals, contrast pairs ≥ 5:1 in CI, a one-accent "your move" law, reduced motion, the parity harness for flag-gated redesigns, and real-capture marketing pages;
   - define a new B2B palette (Volt night's carbon + lime could inspire a "command centre" dark mode, but needs density and long-session calm).
6. **Voice agent face:** skip the avatar work unless a visible face is a requirement. Taxila spent multiple rounds and every premium attempt failed blind judges. If one is needed, reuse the r8 puppet driver's TTS-viseme → mouth path and the acting-policy (calm/safety) idea; do not start from lamp1 or lamp2.
7. **Ignore** the K-12 games (nishana, Khand, Antariksh) except as reference for three.js lazy loading, twin-first fallback and worker meshing, should 3D visualisation ever be wanted.
