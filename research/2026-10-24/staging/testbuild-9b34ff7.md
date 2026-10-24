# Staging test build at 9b34ff7: test credit on, buyer journey smoked, owner's account made, judge latency measured (2026-10-24)

**What was asked.** Give the owner a staging build to test end to end:
- redeploy the private staging on `vl-vm-cin` to the green head 9b34ff7;
- switch on a staging-only test credit for new workspaces;
- prove a brand-new buyer gets through the product, through its own API only;
- create the owner's account from protected parameters;
- run the judge-latency measurement for the safety builder.

**Short answer.**
1. **Staging runs 9b34ff7** (9b34ff78930d5fc77e846b540d4c87dfdb47d313), deployed 09:32:30 UTC. It replaced 6b0d859.
   - "done (9 new)" migrations; 59 recorded.
   - Both units restarted and Caddy was reloaded.
   - The lab (`voicelab`) was not touched. Its `/api/ping` answered 200 locally and on the public URL before, during and after.
2. **Every env flag the contract forbids is unset**, in `.env` and in both running processes.
3. **The test credit is on, on `vp_stage` only**: `trial_credit_inr_milli` went from 0 to 5,000,000 (INR 5,000). The code default stays 0.
4. **The smoke passed 41 of 46 checks**, in one new workspace with one browser test call.
   - Passed: sign-up, the wallet credit, the agent from a template, knowledge, the import, the campaign up to its launch
     card (not approved), the test call and its transcript and cost, the settings reads, and the :8443 checks.
   - **The 5 failures are two staging configuration gaps, not deploy faults:**
     - no control-plane model is configured (`VP_LLM_*` unset), so the practice caller, the typed test chat, the
       Operator and call analysis all answer "no model is configured";
     - no recordings (`VP_RECORDINGS_DIR` and `VP_RUNTIME_PUBLIC_URL` unset).
   - The test call also showed **two product defects in the safety door**, n = 1 call, reproduced offline:
     - RD1 missed her own disclosure, so she disclosed twice;
     - RD6 let an invented premium through ("27,500" with no currency word).
5. **The owner's workspace is `fb5d0663-3726-4eac-bda4-8bc7a99107e1`** ("Vyakti Test Workspace"). Sign-up answered 201,
   `/v1/me` works, the wallet holds INR 5,000, and it holds no agents, contacts, campaigns or calls.
6. **Judge latency** (Gemini 3.5 Flash-Lite on Vertex from the VM, n = 300 DEV lines at 1 req/s):
   - p50 1,021 ms, p90 1,353, p95 1,619, p99 3,159, max 6,435;
   - 4 of 300 gave no answer within the 10 s cap;
   - unavailable at the contract's 1,500 ms timeout: **8.0%**.
7. **Spend: INR 10.89 in all, against a cap of INR 80.**
   - The test call: INR 2.23, read from the DB.
   - The judge run: about INR 8.66, estimated (the script records no tokens).
   - No other model spend.

## Deploy

- **Pre-flight** (`ops/preflight8.sh`, Run Command `vps8-preflight`, 09:29:53 UTC):
  - 6b0d859 was deployed, with no active staging call and no live conversation;
  - the five units were active, and the lab had 0 restarts since 06:25:49;
  - migration 0109 needs `VP_SECRET_KEY` only for plaintext intake hook secrets, and there were 0 such rows, so
    `stage_setup.sh` could run verbatim.
- **Bundle.** 6b0d859's recipe, unchanged:
  - a `git archive` at 9b34ff7 of `product/`, the root `package.json` and `package-lock.json`,
    `voicelab/server/models/silero_vad.onnx` and the 49 caller clips, plus `BUNDLE_SHA` (`9b34ff7`);
  - 743 files, sha256_16 `9657ec1d40e3fded`, 31.0 MB;
  - against 6b0d859's bundle it adds 77 files, all under `product/`, and removes none.

  The tools archive in blob was reused. It is still sha256_16 `f52a0fdcced618cd`, and its six files match `ops/tools/`
  (`cmp`).
- **Run Command `vps8-deploy-9b34ff7`, 09:31:54–09:32:47 UTC.** It was one script in four parts:
  - `ops/deploy_pre.sh`;
  - `../../2026-10-23/staging/ops/stage_setup.sh`, verbatim (unchanged since 6d8ea61);
  - `ops/deploy_post.sh`;
  - `ops/deploy_post7.sh`.

  `VERTEX_OFF_WANT=0`. The assembled script is byte-identical to the one 6b0d859's deploy sent (`cmp`).
- **What it did:**
  - The lockfile was unchanged, so `node_modules` was kept. The web app was rebuilt, and pip found nothing to change.
  - Migrations: "done (9 new)", namely 0107_intake_crm, 0109_intake_hook_secret_vault.mjs, 0206_agents_test_chat,
    0304_campaigns_inbound, 0704_attempt_callback, 0908_money_carrier_pulse, 0909_money_in_flight_and_campaign_burst,
    1030_workspace_notifications and 1040_workspace_duty_roster.
    - `schema_migrations` holds 59.
    - `deploy_post.sh` prints "58 in tree" because it counts `*.sql` only; 0109 is `.mjs`.
  - Both units restarted at 09:32:30. Both had 0 restarts at the end of the job (10:02).
  - The Caddy site was rewritten and gracefully reloaded ("caddy reloaded"); the lab's site was untouched.
  - The seed said "already seeded".
  - Runtime health: every stack is available except `sarvam-india` (no key).
  - Turn-taking defaults are unchanged from 6b0d859, with 0 overrides.
  - The judge has no model on staging (0 `VP_LLM_SAFETY_JUDGE_*` lines).
  - needrestart is still in list-only mode (`l`).
- **The lab was untouched.** `voicelab` was active since 06:25:49 with 0 restarts throughout. Its `/api/ping` answered
  200 locally and on the public URL before and after the deploy and at 10:02 (public 28 ms). Its journal has 0 error
  lines since the job began.

## The env contract (names only, never values)

Read from `/opt/vp-stage/.env` and from `/proc/<pid>/environ` of both running units, before the deploy (09:29) and
after it (`vps8-envcheck-after`, 10:03).

| Name | Before | After |
|---|---|---|
| `VP_DEV_AUTH` | unset | unset |
| `VP_LLM_FAKE` | unset | unset |
| `VP_WEBHOOK_ALLOW_*` | unset | unset |
| `VP_DEVSIM*` | unset | unset |
| `VP_PAYMENTS` | unset | unset |
| `VP_TELEPHONY_LIVE` (and `PLIVO_*`) | unset | unset |
| `VP_LLM_*` (any control-plane model, the judge included) | unset | unset |
| `VP_RECORDINGS_DIR`, `VP_RUNTIME_PUBLIC_URL` | unset | unset |
| `VP_OPERATOR_BRAINS`, `VP_ANALYSIS_MODELS`, `VP_SAFETY_JUDGE_*` | unset | unset |

The `.env` names are the same 28 before and after: the ones `stage_setup.sh` writes.

## The test credit (`vp_stage` only)

Run Command `vps8-credit` at 09:33:51 UTC (`ops/credit8.sh`) ran
`UPDATE money_config SET trial_credit_inr_milli = 5000000, updated_at = now()` (UPDATE 1).

| | `trial_credit_inr_milli` | `updated_at` |
|---|---|---|
| Before | 0 | 2026-10-24 02:31:54 UTC (migration 0906) |
| After | **5,000,000** (INR 5,000) | 2026-10-24 09:33:51 UTC |

- The table has one row.
- The `wallet_a_trial` trigger is present.
- `0906_money_trial_staff.sql` still declares `DEFAULT 0`.

This is a staging test allowance, not the customer trial amount (`open.2026-10-22.trial-credit-amount` stays the
owner's decision). Each of the two new workspaces got exactly one `trial_credit` top-up of 5,000,000 and one
`money_trial_grant` row.

## The buyer-journey smoke

**Method.**
- `ops/smoke8.py` ran on the VM, in Run Command `vps8-smoke`, 09:43:40–09:45:36 UTC.
- It used the product's own API against `127.0.0.1:8091` only: `/v1/signup`, `/v1/login`, `/v1/me`, `/v1/tools`,
  `/v1/tools/:name`, `/v1/actions`, `/v1/actions/:id/decide` and the Operator's `/v1/operator/threads` routes.
- Tool names and inputs came from `GET /v1/tools` (241 tools) and from the modules' STATUS.json and code at 9b34ff7.
- One new workspace, synthetic data only:
  - workspace "Smoke Test Co", member "Smoke Tester", email `smoke+<unix ts at 09:43:40 UTC>@example.com` (the DB
    read-back confirms that shape);
  - a random password made inside the VM process and never printed or stored.
- Approvals: only `version.publish` was approved (publishing dials nothing). **The campaign launch was proposed, its
  card read, and not approved.**
- Before the VM run, the script was dry-run against a local control plane and devsim runtime on a scratch database.

**The script stopped one read early.** `smoke8.py` crashed at its very last tool read, `usage.get` (an extra read, not in
the brief). That tool answers a list, and the script expected an object.
- So it wrote no JSON and never reached the :8443 checks.
- Every step before the crash was already printed, with its status, in the Run Command's output.
- The :8443 checks ran with curl in Run Command `vps8-smoke8b` (09:48:19, no sign-in, no workspace). The same command
  read the smoke workspace back from the DB, read-only.
- **The smoke was not re-run**, so there is still one smoke workspace and one test call.
- The local dry run with a devsim call had hit the same crash. It was missed because that output was filtered.
- The script in `ops/` is fixed. The fix was re-checked on the local dry run: 47 steps, no crash.

| Step | Pass | Status | Note |
|---|---|---|---|
| `POST /v1/signup` | pass | 201 | workspace `6d74ea36-e34e-4c38-98bd-4ea5943e1e1d` |
| `POST /v1/login` | pass | 200 | fresh session cookie |
| `GET /v1/me` | pass | 200 | "Smoke Test Co", plan base, active; "Smoke Tester", owner |
| `GET /v1/tools` | pass | 200 | 241 tools; all 20 this smoke uses are listed, `test.chat` included |
| `wallet.get` | pass | 200 | balance 5,000,000 milli (INR 5,000), state `ok` (not blocked) |
| `invoice.get` (statement) | pass | 200 | money in: "Trial credit ₹5,000.00"; cost ₹0.00 |
| Wallet caps | pass | 200 | the product's own defaults: workspace daily cap ₹5,000, in-flight limit ₹2,000 |
| Guided start | pass | 200 ×4 | There is no onboarding tool at 9b34ff7. `web/src/pages/start.tsx` builds the guided start from `agent.list`, `call.search`, `contact.list` and `campaign.list`; all four were empty. |
| `brief.today` (Today) | pass | 200 | read |
| `template.list` | pass | 200 | 16 templates; used `insurance-renewal` (the verify_calls template) |
| `agent.create` (template) | pass | 200 | draft compiles, lint 0, stack chosen; review "AI-honesty review: rules only (no model configured)" |
| `brief.edit` (business name, as the web does after "Create draft") | pass | 200 | 0 changes (the template had already taken the workspace name) |
| `agent.get` (read back) | pass | 200 | stack `v2-flashlite` (the default), compiles, brief 8,424 bytes, lint 0 |
| `brief.compile` | pass | 200 | hash `c105b9c5bd71…` |
| `voice.set` | pass | 200 | `Despina`, the default stack's default voice (the template leaves it empty; `verify_calls.agent_for` does the same) |
| `knowledge.ingest` + `knowledge.span.approve` | pass | 200 / 200 | one synthetic note, 1 passage, approved |
| `test.simulate` (practice caller `default:busy_20s`) | **fail** | 409 | "no model is configured for simulate on this server"; 0 turns |
| `test.chat` (one exchange; it is in the tool list) | **fail** | 409 | "no model is configured for simulate on this server" |
| `source.upload` | pass | 200 | 3-row CSV, made-up names, +91 90000 00021–23 |
| `source.map` (preview) | pass | 200 | 3 rows, 3 phones OK, 0 rejected; columns name, phone, language, attribute |
| `source.commit` | pass | 200 | ran at once: its risk is `draft`, so there is no approval card. 3 new; audience "Smoke 3" |
| `contact.list` | pass | 200 | 3 contacts, +919000000021/22/23 |
| `version.publish` | pass | 202 → 200 | card: "Publish Smoke Agent, version 1 … No practice call has been run. … AI-honesty review: rules only (no model configured)." Approved |
| `campaign.draft` | pass | 200 | Mon–Sat 10:00–18:00; retries `standard` (3 calls, 2 h then 1 day apart); cap INR 500; concurrency 1 |
| `campaign.get` | pass | 200 | draft. 2 launch blockers: "You need a 1600-series number…" and "Nobody on this list has values for renewal due, premium…" |
| `campaign.estimate` | pass | 200 | ₹6.60 to ₹16.49 (incl. GST), ₹2.26 a connected minute |
| `campaign.launch` | pass | **202** | **card: "Launch the campaign Smoke campaign: dial its audience under the approved policy and agent version"** (risk external). Not approved |
| `GET /v1/actions` | pass | 200 | the launch card waits: 1 proposed |
| `campaign.get` again | pass | 200 | still `draft`; 0 attempts in the workspace, so nothing is queued to dial |
| Operator: "What does this workspace have so far?" | **fail** | 200 | no answer. Frames: message, error, done. Error: "The assistant's brain did not answer (no model is configured for operator on this server). Nothing was changed by this message…" **0 tools called** |
| Browser test call (see below) | pass | 200 | 111 s, ended `caller_hung_up`, 7 agent / 7 caller turns |
| Call log: transcript | pass | 200 | 13 transcript lines |
| Call log: recording link through :8443 | **fail** | — | no link: "No recording was made on this call." |
| Call log: analysis and outcome | **fail** | 200 | analysis `not_configured` ("no model is configured for analysis"); outcome empty; reason code `END_HUNG_UP_MID` |
| Call log: cost | pass | 200 | INR 2.23 in 20 lines: brain 0.57, ears 0.71, voice 0.94 |
| Settings: team and roles (`member.list`) | pass | 200 | 1: Smoke Tester (owner) |
| Settings: API keys (`apikey.list`) | pass | 200 | 0 |
| Settings: webhooks (`webhook.list`) | pass | 200 | 0 |
| Settings: integrations (`integration.list`) | pass | 200 | 0 |
| Settings: billing statement (`invoice.get`) | pass | 200 | 3 components (the test call) |
| :8443 `/` without auth | pass | 401 | `vps8-smoke8b` |
| :8443 `/` with auth | pass | 200 | title "Vyakti · व्यक्ति" |
| :8443 JS and CSS | pass | 200 / 200 | `main-HCMNWGW2.js` (215,372 bytes) and `main-XJNCFNIC.css` (40,362 bytes) |
| :8443 `/v1/health` | pass | 200 | it answers 401 without auth |
| :8443 `/rt/v1/health` | pass | 200 | |

**41 of 46 pass.** No request answered 5xx: 0 runtime tracebacks, 0 runtime 5xx lines, 0 refused event batches. The
control plane logged 0 errors and 2 warning lines, both one pg deprecation warning (finding 5).

**The browser test call** (n = 1, `83e5fd2e-de83-4e01-b903-3dc9b9a95803`).
- **Method.** Made the way `ops/tools/verify_calls.py` makes one: its `replygap.one_call`, run unchanged.
  - `test.browser_call` with `useDraft`, which never dials a phone.
  - Persona P1's six synthetic clips, played in real time into the runtime's browser media socket.
  - A hang-up after the last clip.
- **It ran in the smoke workspace, not in verify_calls' own.** `verify_calls.py` signs in with the seed account, whose
  workspace had spent INR 150.18 of its INR 200 daily test budget today (59 calls), so no call can start there until
  18:30 UTC. The smoke workspace's budget was honoured, not bypassed: the call went through `test.browser_call`, which
  enforces it. Spent today: INR 2.23 of 200.
- **What ran:**
  - stack `v2-flashlite`: `v2|azure+gemini-3.5-flash-lite+gemini-lite~Despina`;
  - status `done`, 111 s.
- **Reply gaps**, from `turn.latency.latencyMs` for 6 replies: 2,150, 1,924, 611, 2,162, 2,227 and 2,407 ms, median
  2,156. That is one call, so it is not a re-measure of `reply-gap.md`.
- **The wallet was not debited.** It stayed at 5,000,000 after the call, because test calls are filed as tests.

## The owner's account

- **How it ran.** Run Command `vps8-owner`, 09:52:00 UTC (`ops/owner8.sh` + `ops/owner8.py`).
  - `VP_OWNER_EMAIL` and `VP_OWNER_PASSWORD` were read from the scratchpad's `vp-owner.env`. They were passed only as
    protected parameters: `ops/ops8.py` with `OPS8_OWNER=1`, the one extension of `ops9.py` (below).
  - Neither appears in any output.
- **Result:**
  - `POST /v1/signup` "Vyakti Test Workspace" / "Owner" answered **201**: workspace
    **`fb5d0663-3726-4eac-bda4-8bc7a99107e1`**.
  - `GET /v1/me` with that session answered 200: "Vyakti Test Workspace", member "Owner", role owner.
  - `wallet.get`: 5,000,000 milli (₹5,000.00), state `ok`.
  - `agent.list`, `contact.list`, `campaign.list` and `audience.list` were all empty.
  - In the DB: 1 member (owner), 0 agents, 0 contacts, 0 campaigns, 0 calls; one `trial_credit` top-up of 5,000,000 and
    one trial grant.
  - Nothing else was done in it: reads only after sign-up.

Note for the owner: in their workspace, as in the smoke's, these features answer "no model is configured" until a
control-plane model is set:
- the Operator;
- the practice caller;
- the typed test chat;
- call analysis.

Test calls have no recordings until recordings are set up.

## Judge latency (for the safety builder)

- **How it ran.** Run Command `vps8-judgelat`, 09:53:17–09:59:42 UTC (`ops/judgelat8.sh`), from the deployed tree
  `/opt/vp-stage/app` at 9b34ff7:
  `node product/scripts/judge-latency.mjs --source dev-7,optout-dev --limit 300 --rps 1 --out-dir research/2026-10-24/judge-latency`.
  - **Route.** The script's header says it needs a judge model configured, and `judgeConfigured()` wants URL, KEY and
    MODEL. So BLIND 10/11's judge route was used:
    - Gemini 3.5 Flash-Lite (`google/gemini-3.5-flash-lite`) on the Vertex global OpenAI-compatible endpoint;
    - a token minted on the VM from the lab's service-account file with the voice runtime's `VertexToken`, passed as
      `VP_LLM_SAFETY_JUDGE_KEY`;
    - `VP_REGION=centralindia`, with `VERTEX_OFF` and `VP_LLM_DEFAULT_*` unset.

    These variables existed only in that process. Staging's `.env` still has 0 judge lines.
  - **Guards.** The lab had been idle on Vertex for over 2 days, and staging had no active call.
  - **Provenance** (sha256_16):
    - `judge-latency.mjs` `6019839135b7543f`;
    - `judge.json` `e026612886608365` (system prompt `c8b4789f49c8198e`, `timeout_ms` 1,500, `hedge_after_ms` null,
      `max_tokens` 80, temperature 0);
    - `cases.json` `cd2a957d77cb24cf`.
  - **What was sent.** dev-7 + optout-dev hold 450 lines. The first 300 in file order were sent: 40 dev-7 and 260
    optout-dev.
  - **After the run.** The out-dir was uploaded and fetched into `../judge-latency/`, then removed from the deployed tree.

**Result:** 296 answered, 4 errors. The 4 errors are "aborted due to timeout": no answer within the 10 s cap.

| p50 | p75 | p90 | p95 | p98 | p99 | max |
|---|---|---|---|---|---|---|
| 1,021 ms | 1,149 | 1,353 | 1,619 | 2,678 | 3,159 | 6,435 |

| Timeout | Share of answers slower (n = 296) | Unavailable, the 4 no-answers included (as the script prints it) |
|---|---|---|
| 1,000 ms | 56.4% | 57.0% |
| 1,200 ms | 17.6% | 18.7% |
| **1,500 ms (the contract)** | **6.8%** | **8.0%** |
| 1,800 ms | 3.4% | 4.7% |
| 2,000 ms | 3.0% | 4.3% |
| 2,500 ms | 2.4% | 3.7% |
| 3,000 ms | 1.0% | 2.3% |

- `summary.md` also prints the simulated hedge table. For example:
  - hedge after 1,200 ms, timeout 2,500 ms: 0.5% unavailable, with 17.6% extra requests;
  - hedge after 1,000 ms, timeout 2,500 ms: 0.3%, with 56.4% extra.

  These are a simulation from these samples (independent draws), not measured hedges.
- For comparison, judge.json's BLIND 7 figure is p50 961 ms and p95 1,126 ms. That was a different run, different lines
  and an earlier day. Here p95 is 1,619 ms.
- Not interpreted further here: choosing the timeout and hedge is the safety builder's.

## Spend

The job cap was INR 80. The DB was read before and after each step. Nothing came near the cap, so nothing was stopped.

| What | INR | How known |
|---|---|---|
| The browser test call | 2.23 (brain 0.57, ears 0.71, voice 0.94) | `conversation.cost_inr_milli` and `cost_line`: 2,225 milli, the only call since the job began |
| Operator, practice caller, typed chat, analysis | 0 | 0 cost lines without a call and 0 `agent_test_run` rows since the job began: no model is configured, so none was called |
| Judge latency, 300 Flash-Lite requests | ~8.66 (estimate) | 300 × BLIND 11's measured INR 28.85 per 1,000 requests (same request shape and model). The script records no tokens and the DB does not see it |
| **Total** | **~10.89** | |

The product's per-workspace test budget was never bypassed:
- the smoke workspace spent INR 2.23 of INR 200 on the IST day;
- the seed workspace stayed at INR 150.18 and was not used.

## Failures and findings, with evidence

1. **No control-plane model on staging. This is configuration, not code.**
   - **Evidence:**
     - 0 `VP_LLM_*` names in `.env` and in the control process (table above);
     - `test.simulate` and `test.chat` answered 409 "no model is configured for simulate on this server";
     - the Operator's stream carried an error frame, "…no model is configured for operator on this server…";
     - analysis was `not_configured`;
     - the control journal says "setup: no model for simulate / operator".
   - **Why.** `stage_setup.sh` never writes a `VP_LLM_*` line. The 23 Oct README says choosing the Operator's model and
     its spend is left to the owner.
   - **To test these features**, the owner (or the integrator, on the owner's go) picks a model and its price env:
     - `VP_LLM_DEFAULT_*`, or per purpose `OPERATOR`, `SIMULATE`, `ANALYSIS`, `COMPILE`;
     - `VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN` / `_OUT`.

     `stage_setup.sh` would then write those lines. Nothing was changed here.
2. **No recordings. A gap in `stage_setup.sh` against `product/ops/STAGING.md`.**
   - **Evidence.** The call row has `recording_uri` null, and `call.get` says "No recording was made on this call."
     `VP_RECORDINGS_DIR` and `VP_RUNTIME_PUBLIC_URL` are both unset.
   - **What STAGING.md says:**
     - an unset `VP_RECORDINGS_DIR` means no recordings;
     - on staging, `VP_RUNTIME_PUBLIC_URL` must be the Caddy address on :8443.

     Without that address, a link would fall back to `VP_RUNTIME_URL` (`127.0.0.1:8090`), which no browser can reach.
   - **The fix is two env lines in the staging setup**, for example `VP_RECORDINGS_DIR=/opt/vp-stage/data/recordings` and
     `VP_RUNTIME_PUBLIC_URL=https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443/rt`. Then a redeploy. Not done
     here: the brief fixed the recipe.
3. **Product: RD1 missed her own disclosure, so she disclosed twice** (n = 1 call).
   - **What she said.** The first agent turn was:
     "मैं Smoke Test Co की AI असिस्टेंट हूँ। नमस्ते स्मोके, मैं रिया हूँ Smoke Test Co से आपकी AI assistant... कॉल रिकॉर्ड हो रही है, …".
     The `call_safety_event` row is RD1 `replaced`, "the first breath carries the AI disclosure".
   - **Reproduced offline** with the deployed `vpvoice.safety.affirms_ai`:

     | Phrase | `affirms_ai` |
     |---|---|
     | "मैं रिया हूँ Smoke Test Co से आपकी AI assistant" | False |
     | "मैं रिया हूँ Saanjh Services से आपकी AI assistant" | False |
     | "मैं रिया हूँ Smoke Test Co से आपकी AI असिस्टेंट" (Devanagari) | True |
     | "मैं रिया हूँ, आपकी AI assistant" | True |
     | "I am Riya, an AI assistant from Smoke Test Co" | False |

     So the lexicon misses "<brand> से आपकी AI assistant" with "assistant" in Latin script. `opening_discloses` then
     found no disclosure and RD1 prefixed the fixed line.
   - **Impact.** It errs safe: she discloses, twice. But it is the 23 Oct double disclosure back by another road
     (`rejected.2026-10-23.rd1-first-sentence-window-double-disclosure`). Not patched.
4. **Product: RD6 let an invented rupee amount through when it has no currency word** (n = 1 call).
   - **What she said.** Agent turn 15: "इस बार ये 27,500 रहेगा स्मोके, क्योंकि eldest member अगले age band में चले गए हैं।"
     No RD6 row was written for this call. The only safety rows are RD1 and RD2. On 24 Oct, RD6 had blocked the same
     invented 27,500 premium (`redeploy-e9fdde3.md`).
   - **Reproduced offline** with the deployed `vpvoice.rules.reply_door` and no facts:

     | Phrase | Door |
     |---|---|
     | "इस बार ये 27,500 रहेगा।" | pass |
     | "इस बार ये ₹27,500 रहेगा।" | block |
     | "… 27,500 रुपये …" | block |
     | "Premium 27,500 rupaye rahega." | block |

     So `amount_not_in_facts` needs a currency marker, and a bare number reaches the caller.
   - **Impact.** An invented premium was spoken on a test call. Not patched.
5. **Product: `brief.today` runs its 8 queries concurrently on one transaction client.**
   - **Evidence.**
     - The staging control journal at 09:43:40 logged "DeprecationWarning: Calling client.query() when the client is
       already executing a query is deprecated and will be removed in pg@9.0".
     - A local run with `--trace-deprecation` puts it at `server/modules/operator/tools.ts` `briefToday`: a
       `Promise.all` of 8 `many`/`one` calls on `ctx.q`, which `server/tools.ts:298` runs inside `tx`.
   - **Impact.** It works on pg 8, which queues the queries. It will break on pg@9. `call.get` already avoids the
     pattern ("One after another…"). Not patched.
6. **Observations, not counted:**
   - Agent turn 8 contains "<chuckle>" in the brain's text. Whether the voice spoke it was not checked.
   - She called the tester "स्मोके", from the synthetic name "Smoke".
   - `shared/safety/judge.ts` `judgeConfigured()` ignores `VP_LLM_SAFETY_JUDGE_AUTH=vertex`, while `server/llm.ts`
     honours it. The latency run therefore used a minted token as the KEY.
7. **This job's own failure**: `smoke8.py` crashed on `usage.get`, as described above. Fixed in `ops/smoke8.py`. The
   :8443 checks were completed by `vps8-smoke8b`, and the smoke was not re-run.

## Left in place

- **The smoke workspace, "Smoke Test Co"** (`6d74ea36-e34e-4c38-98bd-4ea5943e1e1d`). It is a test fixture, not the
  owner's.
  - It holds 1 member, "Smoke Agent" (version 1 published), 1 knowledge note, 3 synthetic contacts, audience "Smoke 3",
    and one draft campaign, "Smoke campaign".
  - It has one test call and **one `campaign.launch` card still proposed**.
  - No one holds its password: it lived only in the VM process. So the card cannot be approved.
  - Even if approved, the launch would be refused: no 1600 number, unmapped per-contact facts, and telephony off.
  - 0 attempts exist, and the card expires by itself.
- **The owner's workspace** (`fb5d0663-…`), empty apart from the credit.
- **The seed workspace**, "Saanjh Services", unchanged.
- Staging holds these 3 workspaces and nothing else.
- `money_config` stays at 5,000,000. Set it back to 0 when the staging test allowance should end.

## Not verified

- The UI. Everything here went through the API, and no page was rendered in a browser.
- A real phone line. No phone was dialled and `VP_TELEPHONY_LIVE` stayed off.
- The practice caller's turns and outcome, the typed chat, the Operator's answer, call analysis and recordings. All are
  blocked by the two configuration gaps above.
- The judge-latency spend. It is an estimate, not metered.

## Files

- `testbuild-9b34ff7.md`: this file.
- `testbuild-9b34ff7-smoke.json`: the 46 checks as recorded, with their Run Command.
- `testbuild-9b34ff7-runlogs.txt`: the outputs of every Run Command, `vps8-preflight` to `vps8-envcheck-after`. No
  secrets; scanned.
- `../judge-latency/report.json`, `../judge-latency/summary.md`: the judge-latency script's own outputs.
- `ops/`:
  - `drive8.sh`, the driver;
  - `ops8.py`, which is `../../judge-blind9/ops/ops9.py` plus one opt-in: `OPS8_OWNER=1` adds `vp-owner.env`'s two
    names to the protected parameters. `ops9.py` cannot pass a second protected env file, so this copy extends it;
  - `preflight8.sh`, `credit8.sh`, `smoke8.sh` + `smoke8.py`, `smoke8b.sh`, `owner8.sh` + `owner8.py`, `judgelat8.sh`,
    `final8.sh`;
  - `secret_scan8.py`, which is `../../judge-blind9/ops/secret_scan.py` plus the owner's login file.

  The deploy reused `deploy_pre.sh`, `deploy_post.sh`, `deploy_post7.sh` and `../../2026-10-23/staging/ops/stage_setup.sh`
  unchanged.
