# Staging redeployed to ead1bc8 for the owner's testing (2026-10-24)

**What was asked.**
- Redeploy the private staging to ead1bc8 (ead1bc880792b5659692914b0a4a2f714cd3106f, CI green). It carries today's
  features: company information, sample packs, memory review, the test budget as a cap, the call timeline, Operator
  set-up and diagnosis, the walkthrough-4 fixes, the runtime's telephony walls and WhatsApp (fake, live off).
- Use the same recipe as the config fix, with `stage_setup_v2.sh`.
- Check the result, and prove a browser call still works.

The recipe, the env contract and the config fix are in [testbuild-9b34ff7.md](testbuild-9b34ff7.md), sections "Deploy"
and "Config fix".

**Short answer.**
- **Deployed:** ead1bc8 at 10:46:32 UTC.
- **Migrations:** "done (9 new)"; 68 recorded.
- **Checks:** all 6 post-deploy checks pass, and 11 of 11 in a new workspace, "Config Check 2".
- **The owner's workspace** has no test-budget row yet, so its first Billing visit or test call creates one at INR
  2,000 a day.
- **Spend:** INR 2.39, against a cap of INR 30.

## Deploy

- **Bundle.** The same recipe at ead1bc8, with `BUNDLE_SHA` set to `ead1bc8`.
  - 828 files, sha256_16 `f65c0fb722b2877d`, 32 MB.
  - Against the 9b34ff7 bundle it adds 85 files and 1 directory, all under `product/`, and removes none.
  - The lockfile and `requirements.txt` are unchanged, so `node_modules` was kept.
- **Pre-checks.** 9 new migrations, all `.sql`, so `stage_setup_v2.sh`'s migrate needs no key. The runtime functions
  that the staging probes wrap keep their names and signatures at ead1bc8. The runtime launcher loads `probes.py` and
  `pace.py`, and they still match.
- **Run Command `vps10-deploy-ead1bc8`.** The script ran 10:46:25–10:46:51 UTC. It sent `deploy_pre.sh` +
  `ops/stage_setup_v2.sh` + `deploy_post.sh` + `deploy_post7.sh` + `deploy_post9.sh` + the new `ops/deploy_post10.sh`.
- **The Run Command reported "Failed", but the deploy finished.** Every deploy step and post-check through
  `deploy_post9.sh` completed. The new `deploy_post10.sh` stopped at its first zero count: stage_setup's `set -e` was
  still on, and a 0 there means "unset", the result wanted.
  - I fixed it (`|| true`) and re-ran it alone, read-only, as `vps10-post10` at 10:48:21.
  - Nothing was redeployed twice.

## Checks after the deploy

| Check | Result | Evidence |
|---|---|---|
| 1. Migrations applied | pass | "done (9 new)": 0108_intake_crm_budget, 0109_intake_test_contact, 0305_campaigns_plivo_nonce, 0609_call_trace, 0910_money_test_budget, 1050_workspace_script_slowed_alert, 1055_workspace_company_facts, 1101_channels, 1102_channels_templates_followthrough. `schema_migrations` holds 68; `conversation.trace` exists |
| 2. Both units restarted, the lab untouched | pass | Control and runtime restarted at 10:46:32, 0 restarts. The lab has been up since 06:25:49 with 0 restarts, and `/api/ping` answered 200 locally and publicly before and after. Caddy was reloaded; 0 runtime tracebacks and 0 control error lines |
| 3. The 13 config names in both processes | pass | All 13: `.env` = 1, control = 1, runtime = 1. `VP_LLM_SAFETY_JUDGE_*` 0/0/0; the runtime judge does not run (mode `off`); `VP_TEST_BUDGET_DEFAULT_INR` is now read (check 6) |
| 4. Through :8443: 401, then 200, plus assets | pass | Run Command `vps10-assets`, 10:55 UTC: `/` 401 without auth; 200 with it, title "Vyakti · व्यक्ति"; `/assets/main-PYHP7TWG.js` 200 (216,683 bytes, `text/javascript`) and `/assets/main-YNKFUTXI.css` 200 (42,246 bytes, `text/css`); `/v1/health` 200 (401 without auth); `/rt/v1/health` 200 |
| 5. No telephony env | pass | `VP_TELEPHONY_LIVE`, `PLIVO_*`, `VP_TELEPHONY_ALLOWED_TO`, `VP_TELEPHONY_ALLOWLIST`, `VP_TELEPHONY_WEBHOOK_SECRET` and `VP_WHATSAPP_LIVE` are all unset, in `.env` and in both processes. The runtime's phone wall (`transports.allowed_to`) has no Plivo route to guard |
| 5b. Browser call with the new allowlist code | pass | The call below. The walls are on the phone path only, and the browser path never passes them |

Migration note: 0109_intake_test_contact shares its number with the earlier 0109 `.mjs`. `migrate.mjs` keys on the
full filename, so both applied.

## In a new workspace: "Config Check 2"

**Why a new workspace.** "Config Check" cannot be signed into: its password lived only in the 10:29 Run Command's
process, by design. So the checks ran in a new workspace, "Config Check 2" (`6662e008-d64f-45a2-bede-a7a1c8a426be`),
whose password was made and kept only in the VM process.
- **Run Command:** `vps10-verify`, 10:50:13–10:52:09 UTC (`ops/verify10.sh` + `ops/verify10.py`).
- **Dry run first:** locally, against an ead1bc8 control plane, devsim and a `/rt` proxy.

| Check | Result | Status | Evidence |
|---|---|---|---|
| sign-up, wallet | pass | 201 / 200 | trial credit INR 5,000 |
| `money.test_budget`, first read in a new workspace | **pass** | 200 | **cap ₹2,000 a day** (2,000,000 milli), per call ₹50, spent ₹0: "₹0.00 of ₹2,000 used today on test calls; each test call holds up to ₹50." The row was created on that read, from `VP_TEST_BUDGET_DEFAULT_INR` |
| `agent.create` from `insurance-renewal` | pass | 200 | compiles. The brief review is on the model, with **0 findings this time**; the same template had 1 blocking finding at 10:29, so the review is not stable on it |
| `test.chat`, one exchange | pass | 200 / 200 | opening, then her reply "Main Riya hoon, Config Check 2 ki AI assistant, aapke Family Health Plus plan ke renewal ke liye call kar rahi hoon…" |
| Browser test call (synthetic clips P1, `test.browser_call`, never a phone) | pass | 200 | `efdbb101-f4f2-407f-bc0e-4005b331ade2`: `v2\|azure+gemini-3.5-flash-lite+gemini-lite~Despina`, 97 s, `caller_hung_up`, 7 / 7 turns, INR 2.02 |
| Transcript | pass | 200 | 13 lines |
| `call.get` → `trace` with per-turn gapMs | **pass** | 200 | `trace` schema 1, `v2-flashlite`: 14 turn rows, 7 of them agent turns. gapMs per agent turn: — (the opening has none), 2,676, 2,057, 639, 2,217, 2,399, 2,225. They equal the socket's reply gaps |
| Recording link through :8443 | **pass** | 200 | `audio/wav`, 6,188,844 bytes, RIFF/WAVE, about 96.7 s (the call's length) |
| The same link without auth | pass | 401 | |
| `money.test_budget` after the call | pass | 200 | ₹2.02 of ₹2,000 used; 1 call listed |

**Test-budget rows** (read-only SQL, scope `test`):
- Before: none.
- After: one, Config Check 2 at 2,000,000 / 50,000 milli.

The first "Config Check" never had a row: its only test call was at 9b34ff7, before the table held test caps. So no
₹200 row exists, and a separate "Budget Check" workspace was not needed. The one new workspace already reads ₹2,000.

**Also seen.**
- **The typed chat's opening disclosed twice again.** RD1 prefixed "Main Config Check 2 ki AI assistant hoon." before her
  own "…मैं Riya हूँ, Config Check 2 की AI assistant…". That is now n = 2 chats; see `testbuild-9b34ff7.md`, finding 3.
- The browser call's opening disclosed once, in Devanagari, with 0 safety rows and 0 judge events.

## The owner's workspace (`fb5d0663-3726-4eac-bda4-8bc7a99107e1`), read-only

- **Before and after:** 0 test-budget rows, 0 agents, 0 contacts, 0 campaigns, 0 calls, 1 audit row (its creation),
  wallet 5,000,000 milli.
- **No test-budget row yet**, so the owner's first Billing visit or first test call creates it from
  `VP_TEST_BUDGET_DEFAULT_INR`: ₹2,000 a day, ₹50 a call.
- **Note.** At ead1bc8, `STAGING.md` says staging's trial credit stays 0 until the owner sets a price, and that the
  owner's account gets money through `wallet.credit`. Staging still runs the INR 5,000 test allowance set earlier today,
  at the integrator's request. The owner's wallet holds it.

## Spend (cap INR 30)

| Source | INR |
|---|---|
| DB, before | 0 (since 10:45:46) |
| The call (`conversation.cost_inr_milli`) | 2.017 |
| The analysis cost line (1,257 tokens, op7's mini rate) | 0.105 |
| The typed chat (the API's usage: 4,606 / 138 tokens) | 0.216 |
| The brief review on `agent.create` | the DB does not meter it |
| **Azure Monitor**, 10:45–10:56, every request to the lab deployments | `lab-gpt41mini-in`: 4 requests (the review, 2 chat turns, the analysis), 6,582 / 560 tokens = INR 0.37; `lab-gpt41`: 0 |
| **Total** (the call + the Azure-counted model tokens) | **INR 2.39** |

## Files

- This file.
- `testbuild-ead1bc8.json`: the verification's own record.
- `testbuild-ead1bc8-runlogs.txt`: the outputs of `vps10-deploy-ead1bc8`, `vps10-post10`, `vps10-verify` and
  `vps10-assets`.
- `ops/deploy_post10.sh` (new), `ops/verify10.sh` + `ops/verify10.py` (from `verify9.*`), `ops/assets10.sh`.
- `ops/drive8.sh` gains `bundle10`, `deploy10`, `kit10` and `verify10`. The deploy used `ops/stage_setup_v2.sh`
  unchanged.
