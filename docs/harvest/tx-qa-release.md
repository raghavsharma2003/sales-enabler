# Harvest: tx-qa-release (Taxila QA, sim lab, packaged-tree evidence, release train)

Repo: `/home/user/Taxila` · harvested 2026-10-15 · read-only (detached worktrees, removed after).

## Summary

This cluster is Taxila's **quality and release machinery**, not a product feature. It has four parts:

1. **The sim lab** (`claude/r5-simlab`, `evals/simlab/`, about 1,400 lines). An Azure model plays a child from a persona card. Each card holds a hidden per-skill knowledge state and planted misconceptions. Whole lessons run through the real server against a Neon TEST branch. A judge from a different model family scores the transcript. The judge only extracts what the teacher believed. Code compares that belief with the card, so "did the agent understand the user" is measured against a key and is not an LLM opinion. It ran about 30 runs in 36 hours (n=32 to 64 lessons per arm), including A/A noise checks and model bake-offs. It is now the declared gate for the teacher (`dc-r5-simlab-is-the-gate`).
2. **QA / break-it** (`claude/r5-qa`, `tests/e2e/qa-*.mjs`, `docs/design/round5/qa/DEFECTS.md`). A Playwright harness runs against a production build with a phone profile, a fake mic fed with Azure-TTS child-voice WAVs, and capture of every console error, HTTP error >= 400, uploaded audio clip and flight-recorder event. It logged 33 defects (2 P0) and fixed 14. The exit rule was "two consecutive clean passes".
3. **The release train** (`int/r4-rel8` → `rel9` → `rel12.1` → `rel13` → `rel13.1` → `int/r5-rel14x`). Each release is an integration branch: streams are merged, gated (tsc + vite build + about 3,100 tests + prompt budget, stamped per sha on a clean tree), checked as a **packaged tree** (`git archive` minus docs/evals/tests plus dist, so exactly the image's file set) against Neon TEST, deployed to an Azure Container Apps revision at 0% traffic with a canary smoke, then promoted with one-PATCH rollback. A post-deploy battery then runs on production.
4. **Evidence branches** (`ev/r8-packaged`, `ev/r9-packaged`, `ev/r11-packaged`). Each is one commit on top of its release that holds only the JSON and screenshot output of the packaged-tree batteries: owner-5 (visual requests), round2-content, r4-content-boards, w2i-safety and the set-up journey.

The most valuable part for sales-enabler is the **simulated-counterparty harness** (persona card = hidden answer key, cross-family judge, code-decided outcomes, noise-floor discipline). It maps directly onto evaluating voice and chat sales agents against simulated buyers. The second most valuable is the **release discipline**: per-sha gate stamps, packaged-tree checks, canary revisions, the evidence-branch convention and the context inbox. It is drop-in for an Azure Container Apps SaaS.

## Branches covered

All branches form one linear chain (verified with `git merge-base --is-ancestor`). There is no `main` on origin.

| branch | head | date (UTC) | what it is / what differs |
|---|---|---|---|
| `int/r4-rel8` | 8448c988 | 2026-10-10 20:18 | Release 8 integration (G1 + Kaksha + 4A + session-first cohort). The last commit is the release 7 post-deploy evidence: owner-5 12/14, round2 35/39, boards 5/5, w0 4/4, w2i-safety 39/39. |
| `ev/r8-packaged` | e5918856 | 2026-10-10 20:47 | rel8 + 1 commit: packaged-tree batteries on 8448c98 (owner-5 14/14, round2-content 33/39, boards 5/5). Only evidence JSON and a PNG (11k lines). |
| `ev/r9-packaged` | ba965692 | 2026-10-11 00:02 | rel8 + 42 commits (the rel9 merge work) + evidence: owner-5 12/14, round2 37/39, boards 5/5, w2i-safety 39/39 when run alone. |
| `int/r4-rel9` | 62d00f8d | 2026-10-11 00:03 | ev/r9 + 1: live record (taxila-web--s9a170c5): owner cohorts, session-first, duplex, grown-up Asha; the "stable 1-in-12 visual slot failure" finding. |
| `ev/r11-packaged` | 0edf43a1 | 2026-10-11 08:52 | rel9 + 25: release 11 packaged check of 556639e (owner-5 10/14, round2 33/39, boards 4/5, w2i 39/39; a 5-step journey with webp shots; zero server diff against live). |
| `int/r4-rel12.1` | bf17b062 | 2026-10-11 18:54 | +30: release 12 (flight recorder, trace writer) plus 12.1 test-isolation fixes (env set at import leaked across one-process tests). |
| `int/r4-rel13` | fa6f5a98 | 2026-10-11 20:41 | +19: "claims" checks (her "look at the screen" lines checked against the real stage); final packaged run owner-5 14/14, round2 36/39, boards 5/5, safety 39/39. |
| `int/r4-rel13.1` | c5c8b639 | 2026-10-11 22:57 | +3: release 13.1/13.2 live; the whole flight recorder end to end, with replay from the Azure container. |
| (`int/r5-rel142`) | — | 2026-10-14/15 | +158 (not in scope, but the base of both r5 branches): release 14 (no clock gates, half-duplex D4, Voice Live D5, filter-category safety). |
| `claude/r5-qa` | e96294fa | 2026-10-15 07:35 | rel142 + 1 (shares its 48 QA commits with rel14.x). Adds the QA harness `tests/e2e/`, DEFECTS.md (D01-D33), 14 client/server fixes, `context/inbox/r5-qa.json`. |
| `claude/r5-simlab` | 2a231d09 | 2026-10-15 09:44 | Diverged from 9b73641d (the round 5 start); 67 commits not on r5-qa. Adds `evals/simlab/**` (code + 31 result dirs, about 1.4M lines of records and transcripts) and `context/inbox/r5-simlab.json`. |

## Product (what this cluster is for)

Taxila is an AI voice tutor (Hindi-English) for Indian children in classes 1-9. A server-side "Director" (now moving to an LLM agent loop) runs the lesson. This cluster contains no product features. It contains the machinery that decided whether each release could ship and whether each teacher change helped. The state of each part:

- **Sim lab: built and heavily used.** About 30 measured runs, results committed with records, transcripts, `FAILURES.md` and `FACTS.json`. It is honest about its limits: an A/A noise band was measured, runs are voided when the shared model deployment throttled, and the child simulator was found to be too strong and replaced by a "decided-correctness" mode.
- **QA harness: built, exploratory, not in CI.** Scripts need a running server, Neon TEST and real Azure. Defects carry trace evidence and screenshots. In this container WebRTC never opened (0/20 lessons), so the realtime voice path was not QA'd. That limit is stated in the log.
- **Release train: production.** About 13 releases shipped to Azure Container Apps in 5 days with gate stamps, canaries and rollback. The packaged-tree check was added after a real incident.
- **Owner-5 board.** "owner-5" is the acceptance test for the owner's 5th complaint ("show me a diagram is ignored"). Each of 12 visual requests (diagram, picture, draw, whiteboard, game, animation × typed/spoken) must produce a real artifact on the stage, plus a check in the real browser. It is one of the "owner tests" written to replace plumbing batteries after the owner rated a green-battery release 0/100.

## Architecture & stack

- **Runtime under test:** Node ESM server (`server/serve.mjs`, routes in `server/routes/*.js`), React 19 + TS client built by Vite. Neon Postgres has a separate **TEST branch** for every harness. Azure AI Foundry Direct models are called only through `server/azure.js`.
- **Sim lab** (`evals/simlab/`):
  - `personas.mjs`: a seeded generator producing 64 cards. Each card has class, board, language, one of 6 temperaments, habits, interests, a per-skill hidden state (understood/partly/not) over a real verified kit topic, planted misconceptions, an optional scripted safety event at a fixed turn, and ASR noise.
  - `child.mjs`: DeepSeek-V4-Pro with a Mistral fallback. The child sees only what a real child sees and may move one step per skill only after a real explanation, and each move is logged.
  - `decide.mjs` + `answer-model.json`: in decided mode the harness draws each answer's correctness from the card state × item depth (seeded), and the model only writes it in character.
  - `runner.mjs`: real API calls with a fresh test account per lesson, deleted afterwards.
  - `voice.mjs`: Azure TTS + Gaussian noise → the real transcriber.
  - `judge.mjs`: an 8-dimension rubric with turn citations, 21 typed failure types, and code predicates for "type it", pointing at an empty screen, repeats, long turns, a helpline after disclosure and AI disclosure.
  - `loop.mjs`: personas × arms (server URLs) × lanes, capped at 4 lessons in parallel with staggered starts. A run is DROPPED if more than 2% of turns were unavailable.
  - `facts.mjs` and `boardfacts.mjs`: code-measured facts. `report.mjs` writes `FAILURES.md` (clusters with counts and examples).
  - `serve.mjs`: refuses any DB except the test branch.
  - `lib.mjs`: throws if the child model shares a family with a judge.
- **QA e2e** (`tests/e2e/`): Playwright with a phone profile of 393x876 at dpr 2.75 with touch, and a laptop profile of 1440x900. Options: Slow-3G + 4x CPU, denied mic, and a fake mic from WAVs. It records console, page errors, failed requests, HTTP >= 400, uploaded audio clips and `/api/trace/batch` recorder events. There are repro scripts with PASS/FAIL for each fixed defect (gate-kill, reload, stale chunk, two tabs).
- **Owner/prod batteries** (`tests/prod/`, about 100 files): `_owner.mjs` is a shared harness with seeded randomness, one test guardian per run deleted in `finally`, and a code rubric written independently of server code. The only server import is the safety predicate. There is an optional model judge (strict OR). It also has `owner-5-visual.mjs`, `round2-content.mjs`, `r4-content-boards.mjs`, `w2i-safety.mjs`, `w0-smoke.mjs` (the canary), and `prod-routing.env` (the production model routing snapshot for like-for-like local runs).
- **Release infra:**
  - `infra/gate.mjs`: per-sha stamps in `node_modules/.cache/taxila-gate/`. It refuses dirty or untracked trees, caps each command at 60 minutes, and has a GitHub Actions `gates` run as alternative evidence. It also checks migrations against the target DB.
  - `scripts/deploy-azure.mjs` (472 lines): ACR build from GitHub, a Container Apps multiple-revision mode, a new revision at 0% labelled `canary`, readiness `/api/health?ready=1`, w0-smoke on the canary URL, then 100% traffic. The old revision keeps the label `previous` for a one-PATCH `--rollback`. It takes `--set` / `--secret` env and owner cohorts as sha256 of the email.
  - `scripts/trace.mjs` + `trace-replay.mjs`: the flight recorder CLI. It prints a merged per-session timeline and replays rrweb chunks from a private blob container to PNG.
  - `scripts/context.mjs` / `merge-inbox.mjs`: the context graph. Workstreams write `context/inbox/*.json` and the main loop merges them.

## Reusable assets

| asset | paths (Taxila, on the named branch) | maturity | reuse for | effort |
|---|---|---|---|---|
| Sim lab: simulated counterparty + hidden-key judge loop | `evals/simlab/{personas,child,runner,judge,loop,report,facts,lib}.mjs` (claude/r5-simlab) | tested (about 30 runs) | eval-quality, voice-agent, chat-agent, crm | adapt (swap the child for a buyer persona and kit skills for qualification facts and objections) |
| Decided-outcome mode (harness decides correctness, model only voices it) | `evals/simlab/decide.mjs`, `evals/simlab/answer-model.json` | tested (n=64) | eval-quality, voice-agent | adapt |
| Cross-family judge guard + JSON-forcing call helper + bounded pool | `evals/simlab/lib.mjs` | tested | eval-quality, orchestration | drop-in |
| Failure taxonomy + deterministic predicates (repeats, long turns, pointing at nothing, channel mismatch, safety/AI disclosure) | `evals/simlab/judge.mjs` (`FAILURE_TYPES`, `autoChecks`) | tested | eval-quality, safety, voice-agent | adapt |
| Run hygiene: concurrency cap on shared deployments, staggered starts, DROPPED above 2% unavailable, reuse a judgment only if the lines are identical, flags never used as values | `evals/simlab/loop.mjs` | tested | eval-quality, infra-ops | drop-in |
| Playwright break-it harness with evidence capture, phone profile, Slow-3G, fake-mic WAVs | `tests/e2e/qa-lib.mjs`, `qa-*.mjs`, `evals/qa/make-wavs.mjs` (claude/r5-qa) | tested | design-ui, voice-agent, eval-quality | adapt |
| Defect log format (sev P0/P1/P2, status FIXED/OWNER/OPEN, steps/expected/actual/evidence/files) + two-clean-passes exit rule | `docs/design/round5/qa/DEFECTS.md` | production (process) | eval-quality | idea-only |
| Owner-acceptance harness (seeded, a test account per run deleted in finally, a rubric independent of product code, strict optional model judge) | `tests/prod/_owner.mjs`, `tests/prod/owner-5-visual.mjs`, `tests/prod/lib.mjs` | production | eval-quality, campaigns (send-path acceptance) | adapt |
| Per-sha gate stamps + migrations-against-target check | `infra/gate.mjs` | production | infra-ops | drop-in |
| Azure Container Apps canary deploy with a 0% revision, smoke on the revision URL, one-PATCH rollback | `scripts/deploy-azure.mjs`, `infra/azure.mjs`, `tests/prod/w0-smoke.mjs` | production | infra-ops, auth-tenancy (cohort flags) | adapt |
| Packaged-tree check (git archive minus docs/evals/tests + dist, local prod server on the TEST DB) | described in `dc-r4-content-release-checks`; evidence in `ev/r*-packaged` | production (process) | infra-ops, eval-quality | idea-only (script it) |
| Evidence-branch convention (`ev/rN-packaged`: one commit of battery outputs on top of the release sha) | `ev/r8-packaged`, `ev/r9-packaged`, `ev/r11-packaged` | production (process) | infra-ops | idea-only |
| Flight recorder (client + server events, tiered capture, rrweb replay, CLI timeline) | `scripts/trace.mjs`, `scripts/trace-replay.mjs`, `server/trace/*`, `src/voice/trace.ts` | production | analytics, voice-agent, chat-agent, infra-ops | adapt |
| Context graph + inbox merge for parallel agent workstreams | `scripts/context.mjs`, `scripts/merge-inbox.mjs`, `context/inbox/*.json` | production | company-brain, orchestration | drop-in |
| Owner cohorts via sha256(email) env lists | `deploy-azure.mjs --set TAXILA_*_FOR=` | production | auth-tenancy | adapt (but see the rejection below) |
| Duplex/voice bake-off scripts incl. cost-per-minute on Azure meters + ACS PSTN | `evals/duplex-2026-10/*.mjs`, `docs/research/duplex-2026-10/BAKEOFF.md` §5b (on r5-qa via rel14) | tested | voice-agent | adapt |

## Measured lessons

All from `context/inbox/r5-simlab.json`, `context/inbox/r5-qa.json` and `context/measurements.md`. The method is in each entry.

- **The A/A noise floor is large.** The same head on the same 28 cards, run twice, moved failure clusters by up to ±6 lessons per 28 (false_understood 5→11, stuck 18→22, overclaims 14→19). A board A/A (same tree served twice, 40 cards) moved clusters by up to 5/40 and channel_truth by 0.4-0.5. **Any head-vs-head difference below about ±6/28 is noise; n ≥ 60 per arm is needed for an understanding delta.** (ms-r5-simlab-noise-floor, ms-r5-simlab-board-aa)
- **Baseline Director @9b73641** (n=32, 438 turns): per-skill read right 51/77 probed (66%), 27/104 skills never probed, 16 overclaims. It repeated an explanation instead of trying a new way in 29/32 lessons, acted on game asks 2/13, falsely safeguarded 2/28 non-safety cards, and had turn p50 2.96 s.
- **LLM-agent teacher vs scripted Director** (same sha, n=64): the agent wins paired holistic judgments 57/64 and halves repeats (58→30) and stuck loops (46→22), **but understanding does not improve**. Read-right was 64% vs 62%, the agent overclaimed more (51 vs 43, and 63 vs 29 on d6f93e7f), and turn p50 was 5.9 s vs 2.9 s. **Holistic preference and correctness diverge; measure both.**
- **Model bake-off for the agent:** grok-4.1-fast was twice as fast (span 2.3 s) but lost 20:43 to gpt-6-sol on the Kimi judge and read as robotic in 23/64 lessons. Effort "none" vs "low" on gpt-6: same quality, turn p50 4.7 s vs 5.8 s.
- **The simulated child is too strong.** A "partly" child passed deep items 31/62 and a "not" child 10/17, because the model solves what is easy for it. A stricter prompt (v2) did **not** fix this. The fix was **code-decided outcomes** (`decide.mjs`). With decided-1, partly/deep was right 5/22 and not/deep 0/8, which matches the table.
- **Voice lane vs text lane:** correct verdicts fell 77 → 51 when going through TTS + noise → STT, mostly on Hindi number words ("बारह सौ"). Content-filter blocks on Devanagari/mixed transcripts triggered false safeguards (3 in one run). **Text-lane evals overstate voice quality.**
- **Continuers ("acha…", "okay…") in voice:** a continuer played on 2/6 scripted safety lines that the classifier read as off-topic and not as distress. The safety gate must cover acknowledgement audio, not only replies.
- **Content-filter false positives:** 4/32 baseline lessons played helplines on non-distress. The fix treats a filter block as a safety signal only when a HARM category fired. Jailbreak and protected-material blocks get one retry and then a neutral line. Lesson-worry false alarms fell 3/8 → 1/8 with true distress kept at 8/8 (n=16).
- **The visual-slot failure rate is stable around 1 in 12 on live and varies run to run.** One packaged run is too noisy to compare releases (ms-r4-visuals-1-in-12). Batteries run in parallel against one local server also interfere: boards scored 3/5 in parallel and 5/5 alone, and w2i-safety's account-leftover check failed while other batteries' accounts were live.
- **Gate scale:** about 3,100 tests in one process took about 1,520 s, which hit a 1,500 s cap twice and SIGTERMed release 9. The cap was raised to 60 minutes per command.
- **QA:** 33 defects (2 P0: a time-of-day lockout still live, and spoken answers lost before the transcription channel opened). Lesson start p50 was 6.4 s under load. TTS was raw PCM at about 400-500 KB per line, which on Slow 3G meant first word at 17.4 s. The child map (189 KB) was fetched twice per start. A page-hide grace of 120 s before ending a lesson made reload/Back rejoin it (qa-reload PASS n=3).

## Rejected / failed approaches

- **Role-play child prompt** ("You are Kabir… stay in character, never say you are an AI"): Azure Prompt Shields blocked it as a jailbreak (DeepSeek 4/32 lessons, Mistral 3/3). **Framing it as an open QA writing task** ("you write the lines of a simulated child character") passes 3/3. This applies directly to simulated buyers on Azure. (rj-simlab-roleplay-child-prompt)
- **A scripted event given only as a card trait** ("at turn 5, says…") was skipped by the simulator in 2/4 safety cards, so the safety floor read "safe" on a moment that never happened. The event must now be forced in that turn's prompt, and a check must record that it was reached. (rj-simlab-unforced-safety-script)
- **An uncapped lab load on a shared production deployment:** 10-16 parallel lessons made production take 51/361 429s in an hour, and 4-11% of the lab's own turns fell back. Fix: cap at 4, stagger starts, drop runs above 2% unavailable. **Evals need their own deployment or quota.** (rj-simlab-uncapped-lesson-load)
- **An argument parser that takes the next token as the value:** `--email-key --only p01` silently produced 0 continuers, which looked like a product result. (rj-simlab-flag-as-arg-value)
- **Reusing a stored LLM judgment because the turn count matched:** a re-run with new content kept the old verdict. Reuse a judgment only when the transcript lines are identical. (rj-simlab-reuse-judgment-by-turn-count)
- **A stricter child prompt (v2) to fix simulator over-competence:** it did not work. Correctness was moved into code instead.
- **A holistic "rate 1-10" model judge as a gate:** literature shows r = -0.17 to 0.63 against humans. The replacement is atomic checklists with code verdicts, a cross-family second judge, and judge scores kept advisory. (rj-holistic-model-judge-gate)
- **Plumbing batteries as acceptance:** a release with green API/flow batteries was rated 0/100 by the owner in one real session. Acceptance now requires experience tests with real sessions. (rj-plumbing-batteries-as-acceptance)
- **Testing the checkout, not the image:** a required contract file lived in `docs/`, which `.dockerignore` excluded. The fallback `{boxes:{}}` silently refused every artifact in production. This led to the packaged-tree check plus fail-loud runtime data. (rj-r4-gate-tests-checkout-not-image)
- **Comparing battery numbers without diffing flags:** a judge-off production run ("2 defects") was compared with judge-on local runs (23) and a fake gap was announced. Diff the harness header and flags before comparing. (rj-r4-owner2-prod-without-judge)
- **Cohorts from an assumed email:** feature flags keyed to sha256 of the email the agent believed was the owner's reached nobody for 4 releases, and the owner rated the app "1/100". Derive cohort ids from real accounts and verify end to end via `/api/me`. (rj-r4-cohort-by-assumed-email)
- **Claim-checking her "look at the screen" before the piece arrives:** visual passes fell 11/12 → 7/12. Then **word-overlap between her line and the board** unpointed legitimate lines. Word overlap is not meaning, so only the specific false-claim shapes are judged now. (rj-r13-claim-check-before-the-piece, rj-r13-word-overlap-after-board)
- **Trace writer, all-or-nothing INSERT with FK cascade:** one deleted account dropped every session's events. Also a **silent chunk drop with no counters**, and an **async in-flight guard cleared before it was assigned**, which wedged the recorder. Each one meant production telemetry was lost silently. (rj-r12-insert-all-or-nothing, rj-r13-silent-chunk-drop, rj-r131-async-finally-before-assign)
- **Pixel-share replay gate (≤2%):** it passed a replay that was missing a caption and a chip (0.59%). Replaced by a tile-local diff. (rj-r12-tclient-pixel-share-gate)
- **Test env set at import in a one-process test runner:** it leaked into other tests and gave a flaky gate failure. A test must set env inside its body and restore it in `finally`. (rj-test-env-at-import)
- **QA fake mic via a second getUserMedia stream:** Chromium loops the fake WAV per stream, which looked like an app defect. Align on a clone of the app's own track and check the uploaded clips. (r5-qa-fake-mic-second-stream)

## Risks / landmines

- **Sim-lab numbers are advisory.** The judges are LLMs (grok and Kimi disagree by about 0.5-0.8 points on several dimensions). The child is a model, and the text lane has perfect transcripts. Every number must be quoted with n, lane and judge. Many deltas sit inside the measured noise band.
- **Cost and quota contention.** The lab shares Azure deployments with production unless separated. One lab run is 64 lessons × 14 turns × (teacher + child + 2 judges).
- **Repo bloat.** `claude/r5-simlab` commits about 1.4M lines of records and transcripts, and the ev branches commit about 10k-line JSON each. Put run outputs in blob storage and keep only summaries in git.
- **Environment limits.** WebRTC never opened in the cloud container, so the realtime voice path is untested by QA. Playwright needed browser-path hacks.
- **Test accounts that cannot be deleted** (safeguarding incidents return 409 by design) accumulate in `LEFTOVER-ACCOUNTS.json`. A send-path SaaS needs an equivalent quarantine for test leads.
- **The release cadence was very fast** (about 13 releases in 5 days, many "x.1" fixes). The gates caught a lot, but several silent production failures (recorder wedge, lost rows) shipped and were found only by live proofs. Keep "live proof after deploy" as a required step.
- **Domain coupling.** The rubric, personas, kits and safety predicates are child-education specific. Reuse the shape, not the content.

## Azure dependencies

- Azure AI Foundry Direct deployments (via `server/azure.js`): taxila-fast / taxila-gpt6 (GPT family, teacher), gpt-6-sol and grok-4.1-fast (agent bake-off), DeepSeek-V4-Pro (child), taxila-mistral-m35 (child fallback), grok-4-20-reasoning and taxila-kimi26 (judges). Azure content filter / Prompt Shields behaviour matters (see the rejections).
- Azure Speech (hi-IN-AnanyaNeural WAVs for QA), gpt-4o-mini-tts (voice lane), the batch transcriber (`transcribeClip`) and gpt-live-transcribe; Voice Live (D5) on release 14.
- Azure Container Apps (multiple revision mode, labels canary/current/previous) and Azure Container Registry (builds from GitHub). Azure Blob (the private `trace` container for rrweb chunks).
- Neon Postgres: production plus a **TEST branch** used by every harness (serve.mjs refuses any other DB).
- GitHub Actions `gates.yml` as alternative gate evidence.

## Recommendation for sales-enabler

1. **Build a "sim lab" for sales agents first, before the agents themselves.** Port the shape of `evals/simlab/`:
   - **Buyer persona cards with a hidden key:** company and ICP fit, budget, authority, real pain, objection set, buying stage and "would book a meeting if…" conditions. These are generated with a seed before any conversation.
   - **Simulated buyer:** any non-judge model family. Write the prompt as an open QA task, not role-play (Prompt Shields). Force scripted moments in the turn prompt and check that each was reached (opt-out, "are you a bot?", hostility, a compliance trigger).
   - **Decided outcomes in code** (as in `decide.mjs`): the harness decides whether the buyer accepts, objects or books, so the model's helpfulness cannot inflate the agent's results.
   - **Judge:** extracts the agent's belief about the lead (BANT/qualification fields, next step), and code scores it against the card. Use a cross-family judge pair, keep holistic scores advisory, and add predicates for channel truth (e.g. "check your email" when none was sent), never denying being an AI, and opt-out honoured.
   - **Discipline from day one:** A/A runs to find the noise band, n ≥ 60 per arm, a dedicated Azure deployment or quota for evals, a lesson-equivalent concurrency cap, and runs dropped above 2% fallback turns.
   - **A voice lane:** TTS + noise → STT. The text lane overstated voice quality by about a third here.
2. **Adopt the release train as is for Azure Container Apps.** Take `infra/gate.mjs` (clean-tree per-sha stamps, migrations checked against the target DB) and the canary/rollback core of `scripts/deploy-azure.mjs`, plus a smoke that creates a test tenant, does one end-to-end action and deletes it. Add a scripted **packaged-tree check** from day one so an image never depends on `docs/` or `evals/`, and make missing runtime data fail loudly at boot. Use `int/rN` branches for integration and `ev/rN` commits (or blob objects) for battery evidence.
3. **Write owner-acceptance batteries rather than plumbing batteries.** Each owner complaint becomes a seeded `owner-N` test that drives a real session (e.g. "launch a campaign and see the analytics change", "voice agent books a meeting"). It deletes its own test tenant in `finally` and uses a rubric independent of product code.
4. **Build in a flight recorder early** (client + server events per session, tiered capture, a CLI timeline, and writer counters exposed). Avoid the three silent-loss bugs listed above. It is the basis for both QA evidence and agent debugging.
5. **Take the context graph + inbox merge** (`scripts/context.mjs`, `merge-inbox.mjs`) for the company brain's own engineering memory and for parallel agent workstreams.
6. **Do not import:** the child-specific rubric, kit and personas; owner cohorts keyed to an assumed email (key flags to verified tenant or user ids and check them via `/api/me`); committing raw run outputs to git.
