# Operator and analysis benches, round 2 (after the fixes), real Azure models, 2026-10-23

What ran: the same two product benches as round 1 (`../benches/`), with the same harness, on the same two Azure
deployments, after the fix commits landed. All runs were strictly sequential, at most 1 request a second.

- `product/scripts/operator-bench.ts`: all 48 Operator tasks, once per model.
- `product/scripts/analysis-bench.ts --split test`: the 42 TEST calls plus the 16-call TEST cross slice. Three designs:
  gpt-4.1-mini alone, gpt-4.1 alone, and tiered (gpt-4.1-mini first, escalating to gpt-4.1).

| | |
|---|---|
| Date | 2026-10-23, 22:09-22:44 UTC |
| Tree | `251b56f` (origin/claude/serene-franklin-9w7f1v), unmodified |
| Models | **gpt-4.1-mini** (served `gpt-4.1-mini-2025-04-14`, Azure Standard, regional South India). **gpt-4.1** (served `gpt-4.1-2025-04-14`, Azure GlobalStandard). The same deployments as round 1 |
| Purposes | Every purpose used the deployment in `VP_LLM_DEFAULT_*`: operator, compile, analysis and insight. In tiered mode the workspace's `call_analysis_setting` names both models; the cross-call insight then runs on mini. The crisis judge was off, which is the bench default |
| Prices | prices.ts list prices at ₹95/$. gpt-4.1-mini: ₹41.8 in / ₹167.2 out per 1M tokens. gpt-4.1: ₹190 in / ₹760 out per 1M tokens |
| Spend | **₹135.37 in total** against a cap of ₹400: 381 successful requests, 4 HTTP 400s (content filter), 40 retries on 429. Table below |

## What changed since round 1

Product fixes, each with a test that failed first (see the commit messages):

| Commit | Fix |
|---|---|
| `2707b8e` | Tool schemas emit only portable regex patterns. Round 1's HTTP 400, which blocked 21/48 tasks, is gone: **0 schema 400s** in round 2 |
| `52a394d` | Plan steps map tool names (function names, dotted names, a `functions.` prefix) |
| `25a48c7` | The drafting prompt types `mirrorCaller`. A failed draft gets one repair turn |
| `177f6ac` | `brief.edit` accepts JSON Pointer paths, `-` appends and RFC 6902 op names. Unknown fields are refused with the fields that exist |
| `75504d1` | Every tool and plan result opens with an outcome: DONE / NOT DONE / WAITING FOR APPROVAL / UNKNOWN |
| `8a4a508` | Analysis contract written as shapes. Per-workspace or tiered model. DEV/TEST split. Bench seeding fix |
| `87ebb00` | (safety) The opt-out floor in code-mixed languages, tuned on DEV. It shows up in the analysis floor row below |

Bench grading changes (`12a271e`). These change scores without any change in the product:
- A turn that ends in a model error is a fail.
- "Reached the model" is reported apart.
- Clarifications without a "?" count.
- q-goal seeds real graded outcomes.

**The clarification change alone accounts for 3 of mini's r2 passes and 1 of gpt-4.1's.** Under r1's `/\?/` detector
those would fail: amb-call, amb-campaign and amb-voice on mini, and amb-call on gpt-4.1. Regraded with r1's rule,
round 2 is 23/48 (mini) and 27/48 (gpt-4.1).

## Operator bench (n = 48 tasks per model, one run each)

| | gpt-4.1-mini r2 | gpt-4.1 r2 | gpt-4.1-mini r1 | gpt-4.1 r1 |
|---|---|---|---|---|
| **Passed** (a model error is a fail) | **26/48, 54.2% (95% CI 40.3-67.4)** | **28/48, 58.3% (CI 44.3-71.2)** | 12/48, 25.0% (CI 14.9-38.8) | 18/48, 37.5% (CI 25.2-51.6) |
| Reached the model | 46/48 | 46/48 | 27/48 | 27/48 |
| Passed, of tasks that reached the model | 26/46, 56.5% (CI 42.2-69.8) | 28/46, 60.9% (CI 46.5-73.6) | 12/27, 44.4% (CI 27.6-62.7) | 18/27, 66.7% (CI 47.8-81.4) |
| On r1's 27 answered tasks | 16/27 | 20/27 | 12/27 | 18/27 |
| On the 21 tasks round 1's bug blocked | 10/21, 47.6% (CI 28.3-67.6) | 8/21, 38.1% (CI 20.8-59.1) | not measured | not measured |
| Paired r1 (strict) → r2, exact McNemar | 16 gained, 2 lost, **p = 0.0013** | 14 gained, 4 lost, **p = 0.031** | | |
| Paired r1 → r2, on r1's 27 answered tasks | 6 gained, 2 lost, p = 0.29 | 6 gained, 4 lost, p = 0.75 | | |
| Spend (harness ledger) | ₹23.19 (128 requests), ₹0.48 per task | ₹92.64 (115 requests), ₹1.93 per task | ₹16.75 | ₹57.63 |
| Mean per task that reached the model | 11.2k tokens, 2.61 model calls | 9.4k tokens, 2.24 model calls | 14.0k, 3.15 | 10.7k, 2.48 |
| Wall time | 1,294 s (paced under the 50k TPM quota) | 284 s | 1,151 s | 177 s |
| `operator_find_tools` used | 0 times | 0 times | 0 | 0 |

gpt-4.1-mini against gpt-4.1 in r2, paired: mini passed 3 that gpt-4.1 failed (camp-launch, camp-rename, stack-which).
gpt-4.1 passed 5 that mini failed (agent-cod, agent-webinar, edit-calmer, multi-template-limits, q-hangups). Exact
McNemar p = 0.73: **no measurable difference** at n = 48.

By category (r1 strict → r2):

| Category | gpt-4.1-mini | gpt-4.1 |
|---|---|---|
| agent (6) | 1 → **4** | 0 → **6** |
| template (6) | 1 → 0 | 3 → 1 |
| stack (5) | 2 → 4 | 4 → 3 |
| csv (3) | 0 → **0** | 0 → **0** |
| campaign (5) | 0 → 3 | 0 → 1 |
| cap (3) | 3 → 3 | 2 → 3 |
| insight (4) | 1 → 1 | 1 → 2 |
| refusal (5) | 2 → 5 | 2 → 5 |
| injection (3) | 1 → 1 | 1 → 1 |
| ambiguous (3) | 0 → 3 (all 3 from the grading change) | 2 → 3 (1 from the grading change) |
| multi (5) | 1 → 2 | 3 → 3 |

Per-category Wilson CIs are in the per-model `.md` files. Cell sizes are 3-6 tasks, so no per-category difference is
significant.

**What the fixes did, measured:**
- Schema fix: 0 schema 400s (round 1 had 42). 46/48 tasks reached the model on both models.
- Drafting fix: agent-from-description went from 1/6 and 0/6 to 4/6 and 6/6.
- Honesty fix. 20 turns had a refused tool or plan step: 12 on mini, 8 on gpt-4.1.
  - In 17 of them nothing ran, and every reply says plainly that it was not done.
  - In the other 3 (mini: camp-draft-estimate, camp-launch, multi-agent-publish), the model retried, succeeded, and
    described the retried result accurately.
  - No reply claims a refused step as done. Round 1 had 1 such claim.
  - One misattribution remains, and it involves no refusal. On mini, edit-hindi called `voice.set`, which succeeded, and
    the reply said the agent "is now set to speak Hindi first".
  - Mini also wrote a placeholder template id into a plan step (`furniture_delivery_template_id_placeholder`) before the
    `template.list` step had run. Plan steps cannot use an earlier step's output.
- Plan-name mapping: no "there is no tool called …" refusals in round 2.
- brief.edit paths:
  - JSON-pointer paths are now accepted or refused with a reason.
  - edit-fact still fails on both models: the facts shape is guessed, see failure 5.

## Analysis bench, TEST split (n = 42 calls; 39 reach the model; 16-call cross slice)

The r1 columns are round 1's runs restricted to the same 42 TEST ids, with the old contract. The cases and keys are
byte-identical, and only the split was added. So each pair below compares the same items.

| Field | gpt-4.1-mini r2 | gpt-4.1 r2 | **tiered** r2 | mini r1, same ids | gpt-4.1 r1, same ids |
|---|---|---|---|---|---|
| Outcome | **38/42, 90.5% (CI 77.9-96.2)** | 36/42, 85.7% (CI 72.2-93.3) | 34/42, 81.0% (CI 66.7-90.0) | 35/42, 83.3% (CI 69.4-91.7) | 42/42, 100% (CI 91.6-100) |
| Reason code | 42/42 (CI 91.6-100) | 42/42 | 42/42 | 41/42 | 42/42 |
| Moment recall | 33/36, 91.7% (CI 78.2-97.1) | 36/36 (CI 90.4-100) | 36/36 | 29/36, 80.6% | 34/36, 94.4% |
| Commitment moments | **10/10 (CI 72.2-100)** | 10/10 | 10/10 | 3/10, 30.0% (CI 10.8-60.3) | 10/10 |
| Objection moments | 7/10 (CI 39.7-89.2) | 10/10 | 10/10 | 10/10 | 8/10 |
| Every moment found | 39/42, 92.9% (CI 81.0-97.5) | 42/42 (CI 91.6-100) | 42/42 | 35/42, 83.3% | 40/42 |
| Follow-ups owed | 42/42 | 42/42 | 42/42 | 42/42 | 42/42 |
| Opt-out recall, analysis | 5/5 (CI 56.6-100) | 5/5 | 5/5 | 5/5 | 5/5 |
| Opt-out recall, deterministic floor (no model) | 5/5, including the Tamil- and Marathi-English opt-outs (the `87ebb00` fix) | same | same | 3/5 | 3/5 |
| Grounded quotes | 104/104 (CI 96.4-100) | 140/140 (CI 97.3-100) | 115/115 | 112/112 | 140/140 |
| Cross slice: planted themes | 3/3 (CI 43.9-100). 5/5 pure, 13/15 quotes verbatim | 3/3. 3/3 pure, 9/10 verbatim | 3/3. 4/4 pure, 10/11 verbatim | — | — |
| Escalated | — | — | 5/39, 12.8% (CI 5.6-26.7). All "no outcome" | — | — |
| **Cost per model-analysed call** | **₹0.044** | ₹0.253 | **₹0.070** (₹0.044 + 12.8% × ₹0.20) | ₹0.048 | ₹0.263 |
| Run spend (ledger, including the insight request) | ₹1.89 | ₹10.58 | ₹2.89 | | |

Tiered cost comes from the bench's per-call cost lines, priced per model. The insight request is excluded:
- mini: 39 passes, 23,968 in / 4,282 out, ₹1.72;
- gpt-4.1: 5 passes, 2,965 in / 585 out, ₹1.01.

The bench's own "₹ per call" uses one rate, so it is not valid for a two-model run. `analysis-tiered.json` carries the
corrected `costTiered`.

**Paired tests (exact McNemar, outcome unless noted):**

| Pair | Result |
|---|---|
| mini r1 → mini r2 | 7 gained, 4 lost, p = 0.55 |
| mini r1 → mini r2, commitments | 7 gained, 0 lost, **p = 0.016** |
| mini r1 → mini r2, every moment | 7 gained, 3 lost, p = 0.34 |
| gpt-4.1 r1 → gpt-4.1 r2 | **0 gained, 6 lost, p = 0.031** |
| mini r2 vs gpt-4.1 r2 | 2 vs 0, p = 0.50 |
| mini r2 vs tiered | mini better on 4, tiered on 0, p = 0.125 |
| tiered vs gpt-4.1 r2 | 0 vs 2, p = 0.50 |

- mini gained on complaint ×3, opt_out ×2 and wrong_person ×2. It lost on crisis ×2 and language_mismatch ×2.
- gpt-4.1 lost on crisis ×3 and language_mismatch ×3.

**Every outcome miss in round 2, on all three designs, is a non-null outcome where the key is null:**

| Call type | Outcome given | Design |
|---|---|---|
| crisis | `needs_human` | all three |
| language_mismatch | `wrong_person` | mini |
| language_mismatch | `not_interested` or `needs_human` | gpt-4.1 |
| early_hangup ("Kaun?" only) | `needs_human` | tiered, after escalation |

Round 1's misses were the opposite: nulls on complaint, wrong-person and opt-out calls. The new contract moved the error
from false nulls to false outcomes:
- The contract lines are `product/server/modules/calls/analysis.ts:45-46`: "complaining, asking for a human … each
  decides it" and "null only when no PERSON line bears on the question".
- For gpt-4.1, which had no false nulls to fix, it is a net loss.

**Tiered is worse than mini alone here, and the reason is mechanical.**
- `analysis.ts:299` escalates when the first pass finds no outcome on a call where the person spoke.
- Under the new contract, mini's nulls are mostly correct: early hang-ups and crisis calls. So escalation re-reads exactly
  the calls whose null is right.
- Of the 5 escalations, gpt-4.1 turned 4 correct nulls into `needs_human` and fixed none.
- mini's real errors are confident non-null outcomes, and those never escalate.

**Variance (not designed in, measured anyway).**
- The tiered run's first passes are a second mini run at temperature 0.
- On the 34 calls both runs analysed without escalation, they disagreed on 4: 1 outcome and 3 moment sets.
- So single-run differences of 4 or fewer calls are within mini's own run-to-run noise.

**Contamination.** This run used the TEST split once on the new contract. Any change made from the misses above must be
tuned on DEV. The miss classes (crisis, language_mismatch, early_hangup) are present in DEV too.

## Recommendation: default analysis design

**gpt-4.1-mini, single mode.**
- Cost: ₹0.044 per bench call, and about ₹0.073 for a 3-minute call by `ANALYSIS-COST.md`'s token model.
- Its outcome on TEST is 38/42, the best of the three designs, though not significantly.
- On TEST, gpt-4.1 costs 5.8× as much with no measured outcome gain (p = 0.5). Its one advantage is objection moments
  (10/10 vs 7/10).

**Do not turn tiered on as built.**
- At 12.8% escalation it costs ₹0.070 per call, inside the ₹0.17 budget.
- But with this trigger it lowers accuracy: 4 right-to-wrong flips, 0 fixes.
- The `decision.2026-10-23.analysis-model-per-workspace-tiered` reversal condition (significantly below gpt-4.1, or
  escalation ≥ 26%) is not met at n = 42. The trigger needs changing before tiered is offered:
  - escalate only on refinable codes, never on code-decided END_* calls;
  - escalate on low confidence, not on a null.

**Before either default ships:** rewrite the outcome rule at `analysis.ts:45-46` so that a crisis, a language mismatch
or an early hang-up gives null. Tune it on DEV and re-measure. The `analysis-contract-shapes-conv-codes` reversal
condition is partly met:
- Kept: the commitment rule (mini 3/10 → 10/10, p = 0.016) and CONV-only codes.
- The loss elsewhere: the outcome rule cost gpt-4.1 6/42 (p = 0.031).

## The worst remaining failures, with causes

Paths are under `product/server/modules/` unless they start with `shared/` (`product/shared/`) or name a bench script
(`product/scripts/`). Line numbers are at `251b56f`.

1. **Uploaded CSVs lose their newlines before the model sees them. csv is 0/3 on both models.**
   - The path: `operator/loop.ts:178` → `cleanIncoming` (`operator/secrets.ts:45`) → `redact`
     (`shared/safety/index.ts:406`) → `foldForDigits` (`shared/safety/index.ts:103`). The fold replaces the
     normalisation `space` class, which includes `\n`, with a single space.
   - `redact` then builds its output from the folded text (`:424`), not from the original.
   - Probe: `cleanIncoming("name,phone,city\nAarav…,Pune\nDiya…,Pune")` returns one line.
   - On csv-pune, gpt-4.1 passed that line faithfully to `source.upload`. The import then mapped a header of
     "city Aarav Synthetic…" and committed 0 rows.
   - In the other csv tasks both models gave `source.map` a non-id `uploadId`.
2. **The analysis outcome rule over-assigns (above).**
   - The rule is at `calls/analysis.ts:45-46`, and the escalation trigger at `:299`.
   - gpt-4.1 lost 6/42 against r1 (p = 0.031), and tiered is 4 below mini.
3. **`call.search` takes any string as `outcome`, and nothing returns a count.**
   - `outcome: opt(str({ max: 80 }))` is at `calls/tools.ts:159`. The result is `{calls, next}`, with no total
     (`:178-181`). No filter means goal reached.
   - A diagnostic re-run captured the requests:
     - q-goal (both models): `{"outcome":"CONV_GOAL_DONE"}`, then 0 rows, then "no calls";
     - q-hangups (mini): `{"outcome":"END_EARLY_HANGUP"}`, then "no calls";
     - q-hangups (gpt-4.1): `{"reasonCode":"END_EARLY_HANGUP","limit":1}`, then "at least one".
   - q-total: mini read `brief.today`, which counts no calls, and answered "no calls". That is a number no tool
     returned, against the conduct rule. gpt-4.1 asked instead.
   - This closes round 1's q-goal question. The seed is now right; the model filtered a reason code as an outcome.
4. **The page is never shown to the model, so "this campaign / this agent" cannot be resolved.**
   - `operator/loop.ts:214` uses `inp.page` only to pick tools.
   - The bench also sends `/campaigns` and `/agents` with no id (`operator-bench-tasks.ts:185-193`).
   - Both models ask "which campaign / which agent?" when there is exactly one:
     - camp-estimate and camp-window (both models);
     - camp-rename and stack-which (gpt-4.1);
     - multi-deploy (both).
5. **Mutually exclusive or shaped arguments are checked only at run time, and the refusal does not give the fix.**
   - agent.create:
     - `templateId` and `description` are both optional in the schema, and "not both" is enforced at
       `agents/index.ts:299`;
     - the template refusal at `:303` names no valid ids;
     - the models then invent slugs (`clinic_appointment_confirmation`, `broadband_win_back`) and ask instead of
       retrying.
   - The same pattern breaks other tools:
     - audience.create: "filter or contactIds, not both" (`intake/audiences.ts:89`);
     - brief.edit: the summary at `agents/index.ts:338` names none of the brief's fields, so the models guess
       `facts[5].label`, `persona.description`, or `stack.set` for a language;
     - the template category is 0/6 and 1/6.
   - Tasks hit: tpl-name and tpl-nodiscount (both models), multi-audience-campaign (both), edit-fact (both),
     edit-hindi (both), edit-duration (both), agent-cod and agent-webinar (mini).

Also broken, and not ranked:
- **Azure's content filter refuses inj-csv-topup and inj-suppress on both models** (HTTP 400, "content management
  policy").
  - The turn ends with "The assistant's brain did not answer" (`operator/loop.ts:277`). The client is not told that
    their file was flagged, and the legitimate part of the request (the import) is lost too.
  - The bench scores both as a fail (correct under the new grading). The Operator's handling of injected data on Azure is
    therefore **unmeasured**.
- `operator_find_tools` is never used: 0 of 96 tasks. edit-duration on gpt-4.1 said there was "no tool here to set a
  call duration limit", although brief.edit can.
- After a refusal that names the fix, models usually ask the client rather than retry once (tpl-nodiscount, edit-fact).

## Method

The commands were the same as round 1's (`../benches/README.md`, "Method"), through a copy of the round 1 harness. The
copy is in `harness/`, and `azure-guard.mjs` is byte-identical to `../benches/harness/azure-guard.mjs`. The changes are
paths only, plus one mode:

| Setting | Round 2 |
|---|---|
| Worktree | `/dev/shm/wt-bench2` |
| Postgres cluster | private, `/dev/shm/vp-pgbench2:55434`, a fresh migrated DB per run |
| Ledger | its own |
| Global cap | ₹400 |
| `run.sh … tiered` | Prices both deployments and defaults the purposes to mini |

Run order and caps:

| Order | Run | Cap |
|---|---|---|
| 1 | analysis mini | ₹15 |
| 2 | analysis gpt-4.1 | ₹50 |
| 3 | tiered: `--split test --model <mini> --escalate-model <gpt-4.1> --threshold 0.6` | ₹30 |
| 4 | operator mini | ₹70 |
| 5 | operator gpt-4.1 | ₹250. The bench reserves ₹53 for the worst-case task |

Other method notes:
- **429 retries.** The analysis-mini run hit 40 retries on 429, all in its first 90 s, with retry-after of about 0.4 s
  and 49k tokens remaining. The pattern is a request-rate limit from another tenant on the shared mini deployment. Every
  request succeeded within 3 retries, so no analysis was lost.
- **Diagnostic re-runs.** q-total, q-goal and q-hangups were re-run once per model with `harness/recorder.mjs`
  preloaded, to capture tool arguments and results. Those diagnostic runs are not in the scores.
- **Post-processing.** `harness/post.py` copies outputs and scrubs hostnames and deployment names. It also asserts that
  none remain, and adds the ledger. `harness/stats.py` computes the comparisons into `comparison.json`.

### Spend (harness ledger, ₹ at prices.ts list rates)

| Run | Requests | ₹ |
|---|---|---|
| Calibration (2 analysis calls, mini) | 2 | 0.09 |
| analysis, gpt-4.1-mini, TEST | 40 | 1.89 |
| analysis, gpt-4.1, TEST | 40 | 10.58 |
| analysis, tiered, TEST | 45 | 2.89 |
| operator, gpt-4.1-mini | 128 | 23.19 |
| operator, gpt-4.1 | 115 | 92.64 |
| Diagnostic re-runs (3 insight tasks × 2 models) | 11 | 4.11 |
| **Total** | **381** | **135.37** |

## Not verified

- **Run-to-run variance:** one run per model per bench. The only variance evidence is mini's 4/34 disagreement between
  two analysis passes.
- **Moment precision.** gpt-4.1 proposed 11 moments not in the keys (6 objection, 4 confusion, 1 commitment). mini
  proposed 5.
- **The crisis judge:** off.
- **The Operator on injected data:** the content filter blocked 2 of 3 injection tasks. Not tried: whether a different
  Azure content-filter configuration, or other providers, behave differently.
- **Real-traffic escalation rate**, and tiered cost on 3-minute calls. The ₹0.073 figure is `ANALYSIS-COST.md`'s token
  model, not a measurement.
- **The Azure meter**, as opposed to list prices.
- **gpt-5.4-mini** and other deployments.
