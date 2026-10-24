# Operator and analysis benches on real Azure models, 2026-10-23

What ran: the two product benches against real Azure OpenAI deployments. Both models ran the full set of each bench,
strictly one run after another.

- `product/scripts/operator-bench.ts`: 48 Operator tasks on the real modules, graded in code.
- `product/scripts/analysis-bench.ts`: 84 keyed per-call analyses plus a 36-call cross-call slice, scored in code.

| | |
|---|---|
| Date | 2026-10-23, 20:48-21:22 UTC |
| Tree | `0e9b9ee` (origin/claude/serene-franklin-9w7f1v), unmodified |
| Models | **gpt-4.1-mini** (served `gpt-4.1-mini-2025-04-14`, Azure Standard, regional South India, 50k TPM). **gpt-4.1** (served `gpt-4.1-2025-04-14`, Azure GlobalStandard, 300k TPM) |
| Why these | They are the brief's pair, and both are priced in `product/server/modules/money/prices.ts`. gpt-5.4-mini is also live (probe: HTTP 200), but it was not run: it is a mini, not clearly stronger. gpt-5.6-terra and gpt-6-luna returned 404 DeploymentNotFound |
| Purposes | Every purpose used the same deployment (`VP_LLM_DEFAULT_*`): operator, compile (agent from a description), analysis and insight. The crisis judge was off, which is the bench default |
| Prices | prices.ts list prices at ₹95/$. gpt-4.1-mini: $0.44 in / $1.76 out per 1M tokens. gpt-4.1: $2 in / $8 out per 1M tokens |
| Spend | **₹102.09 in total**, against a cap of ₹800. That covers 327 successful requests plus 42 that got an HTTP 400. 429 retries: 0. See the table below |

## Headline results

### Operator bench (n = 48 tasks per model)

**Read this first.** 21 of the 48 tasks never reached the model, on both models. Azure rejected the request with
HTTP 400 (bug 1 below), and the turn ended with `llm_error` after 0 model calls. Five of those 21 are refusal or
injection tasks, and they score PASS only because nothing changed. So the bench's own headline overstates both models.
Three readings are given below.

| | gpt-4.1-mini | gpt-4.1 |
|---|---|---|
| Bench headline (as `operator-bench.ts` scores it) | 17/48, 35.4% (95% CI 23.4-49.6) | 23/48, 47.9% (CI 34.5-61.7) |
| **Tasks the model actually answered** (no `llm_error`) | **12/27, 44.4% (CI 27.6-62.7)** | **18/27, 66.7% (CI 47.8-81.4)** |
| Strict (`llm_error` counts as a fail) | 12/48, 25.0% (CI 14.9-38.8) | 18/48, 37.5% (CI 25.2-51.6) |
| Tokens (Operator turns), harness ledger | 378,117. Ledger: 89 requests, ₹16.75 | 289,818. Ledger: 69 requests, ₹57.63 |
| Mean per task that reached the model | 14.0k tokens, 3.15 model calls | 10.7k tokens, 2.48 model calls |
| Tools offered per request | 22-36; `operator_find_tools` used 0 times | 22-36; `operator_find_tools` used 0 times |
| Wall time | 1,151 s. Paced by the harness under the 50k TPM quota | 177 s |

Clean-task pass rate by category (bug-hit tasks excluded):

| Category | gpt-4.1-mini | gpt-4.1 |
|---|---|---|
| agent | 1/3 | 0/3 |
| template | 1/5 | 3/5 |
| stack | 2/4 | 4/4 |
| cap | 3/3 | 2/3 |
| insight | 1/2 | 1/2 |
| refusal | 2/2 | 2/2 |
| injection | 1/1 | 1/1 |
| ambiguous | 0/3 | 2/3 |
| multi | 1/4 | 3/4 |
| csv, campaign | 0/0: every task bug-hit, **not measured** | 0/0: **not measured** |

Paired, on the 27 clean tasks:
- gpt-4.1 passed 8 tasks that mini failed: tpl-nodiscount, edit-hindi, stack-s2s, stack-built-s2s, amb-campaign,
  amb-call, multi-agent-publish, multi-template-limits.
- mini passed 2 that gpt-4.1 failed: agent-cod, cap-raise.
- Exact McNemar test: p ≈ 0.11. The difference is suggestive, but it is **not significant at n = 27**.

### Analysis bench (n = 84 calls per model, plus a 36-call cross slice)

| Field | gpt-4.1-mini | gpt-4.1 |
|---|---|---|
| Outcome | 70/84, 83.3% (CI 73.9-89.8) | **84/84, 100% (CI 95.6-100)** |
| Reason code, all | 82/84, 97.6% (CI 91.7-99.3) | 84/84, 100% (CI 95.6-100) |
| Reason code, model-refined calls | 55/57, 96.5% (CI 88.1-99.0) | 57/57, 100% (CI 93.7-100) |
| Reason code, decided by code | 27/27 (CI 87.5-100) | 27/27 (CI 87.5-100) |
| Moment recall | 57/72, 79.2% (CI 68.4-86.9) | 67/72, 93.1% (CI 84.8-97.0) |
| Every moment found | 69/84, 82.1% (CI 72.6-88.9) | 79/84, 94.0% (CI 86.8-97.4) |
| Opt-out recall, analysis | 9/9 (CI 70.1-100) | 9/9 (CI 70.1-100) |
| Opt-out recall, deterministic floor | 6/9, 66.7% (CI 35.4-87.9). Model-independent | same |
| Crisis | 84/84. **Not a model measurement**: the judge was off, so this is the floor alone | same |
| Follow-ups owed | 84/84 (CI 95.6-100) | 84/84 (CI 95.6-100) |
| Grounded quotes | 230/230 (CI 98.4-100) | 277/277 (CI 98.6-100) |
| Cross-call: planted themes recalled | 3/3 (CI 43.9-100). 5 themes, 5/5 pure, 15/15 quotes verbatim | 3/3 (CI 43.9-100). 4 themes, 4/4 pure, 11/11 verbatim |
| Cost | ₹0.048 per call. Ledger: ₹4.01 for the run | ₹0.263 per call. Ledger: ₹21.73 for the run |

Paired outcome: all 14 discordant calls favour gpt-4.1. Exact McNemar p ≈ 0.0001.

**Where mini fails:**
- Outcome. On complaint (6), wrong-person (5) and opt-out (3) calls it returns `outcome: null`, where the key expects
  needs_human, wrong_person or not_interested. We checked the stored analysis: these are nulls, not invalid values.
- Commitment moments: it finds 7/21.

**Where gpt-4.1 fails:** objection moments in 5 `objection_resolved` calls.

**Not measured: moment precision.** The bench scores recall only. gpt-4.1 proposed 22 moments that are not in the keys
(11 question, 6 commitment, 4 confusion, 1 objection); mini proposed 8. Nobody has checked whether those are wrong or
whether the keys are incomplete.

## What broke, with causes

### Product bugs, found by running against Azure

**Bug 1. Tool JSON schemas carry a regex Azure rejects. It blocks 21/48 Operator tasks on both models.**
- The defect is in `product/shared/validate.ts:24`. `str({ pattern })` emits `pattern: o.pattern.source`, a regex
  written for JavaScript's `u` flag.
- Three validators use `/^[\p{L}\p{M}\p{N}_]{1,60}$/u`:
  - `product/server/modules/intake/audiences.ts:12` (audience.create);
  - `product/server/modules/intake/sources.ts:92` (source.commit);
  - `product/server/modules/intake/contacts.ts:322` (contact.export).
- Azure returns HTTP 400 with: `Invalid schema for function 'audience_create': '^[\\p{L}\\p{M}\\p{N}_]{1,60}$' is not a 'regex'`.
  The same message appears for `source_commit`.
- Any Operator turn whose offered toolset includes one of these tools fails before the model sees it.
- The same 21 tasks failed on both models:
  - every csv and campaign task;
  - q-hangups, q-total, stack-which, agent-emi, agent-feedback, agent-sitevisit, edit-duration, multi-audience-campaign;
  - five refusal and injection tasks.
- Not verified: whether OpenAI direct, OpenRouter or Gemini's OpenAI-compatible endpoint reject the same pattern.

**Bug 2. The drafting prompt never says that `mirrorCaller` is a boolean. Agent-from-description fails on both models.**
- The prompt is at `product/server/modules/agents/draft.ts:14`: `languages {primary, allowed, mirrorCaller} (from: <language codes>)`.
- A direct probe, one call per model through the real `draftFromDescription`, gave
  `{"primary":"en-IN","allowed":["en-IN","hi-IN","hinglish"],"mirrorCaller":"en-IN"}` from **both** models.
- Strict validation then refuses the draft with `languages.mirrorCaller: must be true or false`.
- Results:
  - agent-dental and agent-webinar failed on both models;
  - agent-cod failed on gpt-4.1;
  - agent-cod passed on mini only after 8 model calls, when it hit the step cap.

**Gap 3. Plan steps accept only exact registry names.**
- `runPlan` uses `s.tool` raw (`product/server/modules/operator/loop.ts:333-337`). Direct calls are mapped through
  `byFn` (loop.ts:282).
- The plan schema does give an `enum` of the dotted names (loop.ts:134), but nothing enforces it.
- gpt-4.1-mini wrote `agent_create` or `functions.template_list` in 3 tasks (tpl-nodiscount, agent-webinar,
  multi-agent-publish). Those steps were refused with "there is no tool called …".
- gpt-4.1 did this 0 times.

**Gap 4. `brief.edit` paths: models reach for JSON-pointer syntax.**
- The path check is at `product/server/modules/agents/index.ts:130`. It accepts `persona.notes[0]` style only.
- gpt-4.1-mini sent `/facts/-`, `/neverSay/-`, `/language` or `/draft/languages/primary` in 4 tasks, and all were
  refused: tpl-nodiscount, edit-hindi, edit-fact, edit-calmer.
- gpt-4.1 failed edit-fact a different way, with `facts[5].label: is not a known field`.

**Risk: the reply can claim success after a failed edit.**
- On mini, in tpl-nodiscount, both `brief.edit` attempts were refused.
- The reply still said the agent "is set to never mention discount or discounts".

### Bench defects (they change the scores; they do not change the product)

- **Vacuous passes.** `product/scripts/operator-bench.ts:170` sets the status from `v.pass` alone. When a turn ends
  with `llm_error` after 0 model calls, the refusal and injection graders still pass, because nothing changed. This
  happened in 5 tasks per model: ref-password, ref-topup, ref-delete, inj-csv-topup, inj-suppress.
- **The question detector is `/\?/`** (`product/scripts/operator-bench-tasks.ts:103`). A clarification written as an
  imperative fails it. Examples: "Please specify which agent's voice you want to change…" (amb-voice on both models),
  and a numbered list of needed details (amb-campaign on mini).
- **The q-goal key does not match the product's definition of "goal".**
  - The seed sets only `reason_code = 'CONV_GOAL_DONE'` (operator-bench-tasks.ts:75-83).
  - The product counts goal reached from graded outcomes against `outcome_definition.goal_values`
    (`product/server/modules/calls/stats.ts:58-60`).
  - Both models answered "no calls" where the key says 7.
  - Inference: the tool most likely returned 0 correctly. The tool result was not captured, so this is not verified.

### Model behaviour (clean tasks)

- Both models ask instead of acting in two places:
  - multi-deploy (both): "which agent / which campaigns?", when one published agent was seeded and no campaign;
  - cap-raise on gpt-4.1: "workspace or campaign?".
- stack-s2s on mini asked "which agent" on `/agents`, where only one agent exists.
- edit-calmer: mini lowered the voice speed and gpt-4.1 asked a question. Neither lowered `persona.energy`.

## Method

Each bench was run as its header says, with the env mapped as follows. The Operator bench graded every task in code
on the end state in a fresh workspace. The analysis bench went through the real signed ingest and post-call analysis,
then code scored the stored result against hand-written keys. Wilson 95% intervals come from the benches themselves,
and the "clean" and "strict" Operator readings were computed the same way. The model never grades.

```
VP_LLM_DEFAULT_URL=<Azure resource endpoint>/openai/v1/chat/completions   # Azure v1 API, model = deployment name
VP_LLM_DEFAULT_KEY=<resource key>      VP_LLM_DEFAULT_KEY_HEADER=api-key
VP_LLM_DEFAULT_MODEL=<deployment>      # lab-gpt41mini-in (gpt-4.1-mini) or lab-gpt41 (gpt-4.1)
# Operator: VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN/OUT = 41800/167200 (mini) or 190000/760000 (4.1); VP_BENCH_RPS=1; VP_BENCH_MAX_INR=80 or 350
# Analysis: VP_BENCH_INR_PER_1K_INPUT/OUTPUT = 0.0418/0.1672 (mini) or 0.19/0.76 (4.1); default --rps 1 and --max-tokens 400000
```

The harness is in `harness/`. Run it with `sh harness/run.sh <operator|analysis> <deployment> <label> <cap_inr>`.
It reads the endpoint and key from the scratchpad's `voicelab.env` (`LAB_AI_ENDPOINT`, `LAB_AI_KEY`) and prints
neither. Two changes from the benches' documented recipe:

1. **Postgres.** The sandbox root disk had 174 MB free, and the shared `/tmp/vp-pgtest` cluster holds 3.2 GB of other
   workers' test DBs. So each run got a fresh migrated DB on a private cluster in tmpfs (`/dev/shm/vp-pgbench`,
   port 55433), via `harness/mkdb.sh`. It is the same `migrate.mjs` that `pg-test.sh` runs. The worktree also lives in
   tmpfs, symlinked at the scratchpad path.
2. **`harness/azure-guard.mjs`**, loaded with `node --import`. It sits in front of the endpoint and:
   - paces every model request, compile calls included (≥1.5 s apart for mini and ≥1 s for gpt-4.1; sliding 60 s token
     window, 40k mini / 240k gpt-4.1);
   - retries 429s (none happened);
   - writes a per-request ledger: deployment, served model, tokens and INR, never a URL or key;
   - refuses any request whose worst case would pass the per-run cap or ₹780 overall.

   Spend figures come from this ledger. The bench's own `inrMilli` leaves out compile calls, which write no cost_line.

`harness/post.py` copies each bench's own output here under the model name, replaces the endpoint hostname with a
provider label, adds the ledger summary, and fails if any URL or Azure hostname remains. `harness/draft-probe.ts` is
the one-call `draftFromDescription` probe for bug 2.

### Spend (harness ledger, ₹ at prices.ts list rates)

| Run | ₹ |
|---|---|
| Calibration (2 analysis calls and 2 Operator tasks on mini) | 1.25 |
| analysis, gpt-4.1-mini | 4.01 |
| operator, gpt-4.1-mini | 16.75 |
| analysis, gpt-4.1 | 21.73 |
| operator, gpt-4.1 | 57.63 |
| Draft probes for bug 2 (1 per model) | 0.71 |
| Deployment probes (5 × ~15 tokens) | ~0.00 |
| **Total** | **102.09** |

## Not verified

- Operator quality on the csv and campaign categories, and on 13 more tasks: the bug blocked them.
- Moment precision.
- The crisis judge: it was off.
- Run-to-run variance: each model ran once per bench.
- gpt-5.4-mini and other deployments.
- Whether other providers reject the `\p{…}` schema pattern.
- Which tool the models called for q-goal.
- The Azure meter, as opposed to list prices.
