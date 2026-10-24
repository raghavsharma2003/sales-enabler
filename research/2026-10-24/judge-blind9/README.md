# Caller-crisis judge: PREREG-9 DEV for two prompts, then BLIND 9 once, Flash-Lite on Vertex from the India VM (2026-10-24)

**Question.** The rule was written down first (`../judge-prereg9/PREREG.md`, 2bd4daf). It picks a prompt (A, the
current judge.json, or B, an anchored 0–100 risk score) and a threshold on pooled DEV. At that pair, what do the judge
and the floor give on the unread BLIND 9?
- recall;
- false positives on benign look-alikes;
- latency;
- cost.

**Short answer.**
- **The rule chose prompt B at threshold 0.4** (`../judge-prereg9/CHOICE.md`, written 04:42:07Z, before any BLIND 9
  request).
  - On pooled DEV (175 crisis, 240 benign), every pair was admissible (judge FP ≤ 10%).
  - B at 0.30, 0.35 and 0.40 had the highest judge recall: 167/175 (95.4%), with FP 5/240 (2.1%).
  - The tie went to the higher threshold. A's best was 165/175.
- **BLIND 9 at B, 0.4:**
  - judge alone: recall **97/100**, FP **2/100**;
  - floor or judge: recall **97/100**, FP **8/100**;
  - the floor alone: 27/100 recall and 6/100 FP.
- **The owner's bar is not met.** The bar is floor-or-judge recall ≥ 90/100 with benign FP ≤ 2/100. Recall passes
  (97/100). FP fails (8/100).
  - 6 of the 8 false positives are the floor's own.
  - The judge's 2 are on different lines.
  - No judge threshold can bring floor or judge below the floor's 6/100.
- **Latency and timeouts:** 0/200 timeouts at the contract's 1,500 ms; p50 988 ms, p95 1,258 ms, max 1,468 ms.
- **Cost:** ₹33.61 per 1,000 turns. B's longer prompt costs about 15% more than A.

## Results (BLIND 9, scored once, prompt B, threshold 0.4)

| Run | BLIND 9 recall: floor | Recall: judge | Recall: floor or judge | Benign FP: floor | Benign FP: judge | Benign FP: floor or judge | p50 / p95 (answered) | Unavailable | ₹ per 1k turns |
|---|---|---|---|---|---|---|---|---|---|
| `flashlite-blind9-B-t04`: Gemini 3.5 Flash-Lite, Vertex global, 1,500 ms (contract), prompt **B** (`prompts/caller_crisis.risk100.txt`, sha256_16 `ed63058d5526890a`), threshold **0.4** (`CHOICE.md`), 1 req/s | 27/100, 27.0% (19.3–36.4) | 97/100, 97.0% (91.5–99.0) | **97/100, 97.0% (91.5–99.0)** | 6/100, 6.0% (2.8–12.5) | 2/100, 2.0% (0.6–7.0) | **8/100, 8.0% (4.1–15.0)** | 988 / 1,258 ms (max 1,468) | 0/200 | 33.61 |

For comparison, BLIND 8's run (`../judge-blind8`) used prompt A, threshold 0.9 and 1,500 ms. Different set, prompt and
threshold, so it is not a like-for-like comparison:

| | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge | Floor |
|---|---|---|---|---|---|
| BLIND 8 | 73/100 | 75/100 | 0/100 | 9/100 | 26/100 recall, 9/100 FP |

**The owner's bar for raise mode with the gentle check-in** (`open.2026-10-23.judge-raise-soft-checkin`):

| Measure | BLIND 9 | Bar | Met? |
|---|---|---|---|
| Floor-or-judge recall | 97/100 (91.5–99.0) | ≥ 90/100 | yes, and the lower CI bound is above 90% |
| Floor-or-judge benign FP | 8/100 (4.1–15.0) | ≤ 2/100 | **no**: 6 floor + 2 judge, on different lines |
| (judge alone, for reference) | recall 97/100; FP 2/100 (0.6–7.0) | the same bar | at the point estimates only; the upper FP bound is 7.0% |

**Per language, BLIND 9** (the writer's tags; Wilson 95%):

| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: floor | FP: judge | FP: floor or judge |
|---|---|---|---|---|---|---|
| bn-en | 6/18 (33.3%, 16.3–56.3) | 17/18 (94.4%, 74.2–99.0) | 17/18 (94.4%) | 1/17 (5.9%, 1.0–27.0) | 1/17 (5.9%, 1.0–27.0) | 2/17 (11.8%, 3.3–34.3) |
| gu-en | 3/18 (16.7%, 5.8–39.2) | 18/18 (100%, 82.4–100) | 18/18 | 1/17 (5.9%) | 0/17 | 1/17 |
| hi-deva | 2/4 (50.0%) | 4/4 (100%) | 4/4 | 0/5 | 0/5 | 0/5 |
| hinglish | 5/6 (83.3%) | 6/6 (100%) | 6/6 | 1/10 (10.0%) | 0/10 | 1/10 |
| mr-en | 1/18 (5.6%, 1.0–25.8) | 18/18 (100%, 82.4–100) | 18/18 | 1/17 (5.9%) | 0/17 | 1/17 |
| ta-en | 6/18 (33.3%, 16.3–56.3) | 17/18 (94.4%, 74.2–99.0) | 17/18 (94.4%) | 0/17 | 0/17 | 0/17 |
| te-en | 4/18 (22.2%, 9.0–45.2) | 17/18 (94.4%, 74.2–99.0) | 17/18 (94.4%) | **2/17 (11.8%, 3.3–34.3)** | 1/17 (5.9%, 1.0–27.0) | **3/17 (17.6%, 6.2–41.0)** |

Weak spots:
- **Recall:** bn-en, ta-en and te-en each miss one line (17/18). gu-en, mr-en, hi-deva and hinglish miss none.
  - BLIND 8's weak recall spots were te-en, gu-en and mr-en (11/18, 11/18 and 13/18). Here they are 17/18, 18/18 and
    18/18. That is a different set and prompt, so it is not a like-for-like comparison.
- **FP:**
  - te-en 3/17: floor 2, judge 1;
  - bn-en 2/17: floor 1, judge 1;
  - the floor alone, 1 each, in gu-en, hinglish and mr-en.

  The judge's 2 false alarms are in bn-en and te-en.
- **Line ids.** 3 crisis lines were missed by both floor and judge. Their ids are in `report.json` → `misses`; the 2
  judge false alarms are in `false_alarms`. The lines were not read.

**The BLIND 9 sweep, for information only.** It is not used for choosing. The pair was fixed on DEV and written to
`CHOICE.md` before this run, and nothing will be changed on the basis of this table.

| Threshold | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |
|---|---|---|---|---|
| 0.3–0.45 (each; 0.4 is the pre-registered one) | 97/100 (97.0%, 91.5–99.0) | 97/100 | 2/100 (2.0%, 0.6–7.0) | 8/100 (8.0%, 4.1–15.0) |
| 0.5–0.75 (each) | 97/100 (97.0%, 91.5–99.0) | 97/100 | 1/100 (1.0%, 0.2–5.4) | 7/100 (7.0%, 3.4–13.7) |
| 0.8 | 96/100 (96.0%, 90.2–98.4) | 96/100 | 0/100 (0.0%, 0.0–3.7) | 6/100 (6.0%, 2.8–12.5) |
| 0.85 | 95/100 (95.0%, 88.8–97.8) | 95/100 | 0/100 | 6/100 |
| 0.9 | 91/100 (91.0%, 83.8–95.2) | 93/100 | 0/100 | 6/100 |
| 0.95 | 79/100 (79.0%, 70.0–85.8) | 85/100 | 0/100 | 6/100 |

Floor-or-judge FP never falls below 6/100 at any threshold, because that is the floor's own FP.

## DEV runs (PREREG-9; the choice is in `../judge-prereg9/CHOICE.md`)

| Run | Set and task | Recall: floor / judge / floor or judge (contract 0.5) | FP: floor / judge / floor or judge (0.5) | p50 / p95 | Unavailable | ₹ (₹ per 1k) |
|---|---|---|---|---|---|---|
| `dev/flashlite-dev7-A` | dev-7, crisis: 100 crisis / 90 not | 100/100 (in-sample) / 92/100 (85.0–95.9) / 100/100 | 0/90 / 7/90 (7.8%, 3.8–15.2) / 7/90 | 963 / 1,319 ms | 3/190 (3 timeouts) | 5.41 (28.48) |
| `dev/flashlite-dlk9-A` | dev-lookalike-9, crisis: 75 crisis / 150 not | 30/75 (in-sample) / 73/75 (90.8–99.3) / 74/75 | 0/150 / 2/150 (1.3%, 0.4–4.7) / 2/150 | 973 / 1,177 ms | 2/225 (2 timeouts) | 6.58 (29.25) |
| `dev/flashlite-dev7-B` | dev-7 (prompt B) | 100/100 / 90/100 (82.6–94.5) / 100/100 | 0/90 / 3/90 (3.3%, 1.1–9.3) / 3/90 | 977 / 1,132 ms | 1/190 (1 timeout) | 6.24 (32.85) |
| `dev/flashlite-dlk9-B` | dev-lookalike-9 (prompt B) | 30/75 / 72/75 (88.9–98.6) / 72/75 | 0/150 / 0/150 (0.0–2.5) / 0/150 | 991 / 1,222 ms | 2/225 (2 timeouts) | 7.46 (33.18) |

**Pooled DEV (175 crisis / 240 benign), judge alone.** This is what the rule reads; the full sweep is in
`dev/prereg_apply9.out`.

| Prompt | Best admissible point | At the contract 0.5 | At 0.9 | Unavailable (pooled) |
|---|---|---|---|---|
| A (judge.json) | 165/175 (94.3%), FP 8/240 at 0.75–0.8 (9/240 at 0.3–0.7) | 165/175, FP 9/240 (3.8%) | 133/175, FP 0/240 | 5/415 (all timeouts) |
| **B (risk 0–100)** | **167/175 (95.4%), FP 5/240 (2.1%) at 0.3–0.4: chosen 0.4** | 162/175, FP 3/240 (1.2%) | 114/175, FP 2/240 | 3/415 (all timeouts) |

Floor-or-judge FP on DEV equals the judge's FP. The floor is in-sample there and flags 0 of the 240 benign lines.

## Read this with care

- **What blocks the bar is the floor, not the judge.**
  - The floor flags 6/100 of BLIND 9's benign look-alikes. On DEV look-alikes it flags 0/150, after 2bd4daf's
    exemptions, which were tuned on that set.
  - So the DEV fix did not carry to blind look-alikes. (BLIND 8 had 9/100 on an older floor and a different set, so
    that is not a like-for-like comparison.)
  - The judge adds 2 false alarms on other lines. Floor or judge = 8/100.
  - Because the system is raise-only, no judge threshold or prompt can take the combined FP below the floor's.
  - Meeting the bar needs one of two things:
    - floor false positives on look-alikes down to about 0–2 per 100, measured on a fresh blind set;
    - or a design where a floor-only crisis on a look-alike also gets the gentle check-in, not the full script. That
      is an owner/product question, not measured here.
- **The judge alone is at the bar's edge, and only at the point estimate.** FP is 2/100, upper Wilson bound 7.0%;
  recall is 97/100 (91.5–99.0). `decision.2026-10-23.judge-model-shadow`'s bar is 1% with an upper bound at or below
  2%. Neither the judge alone nor floor or judge meets it.
- **Rule 9 fixed the problem rule 8 had** (`rejected.2026-10-24.prereg-lowest-threshold-fp5-quantised`).
  - It allowed a low threshold, and B's risk scale spreads the confidences.
  - DEV recall at the chosen pair was 167/175, against 133/175 for A at 0.9.
  - On BLIND 9 the chosen pair gave judge recall 97/100.
  - The tie at 0.30/0.35/0.40 is structural. B's own text sets crisis true at risk ≥ 40, and the harness counts a
    flag only when kind ≠ none. So a B verdict that follows its own scale cannot count below 0.4. On DEV and BLIND 9,
    the counts at 0.30, 0.35 and 0.40 are identical.
- **Prompt B is not yet in judge.json.** PREREG-9 says the chosen t becomes judge.json `threshold` and B's text becomes
  `system_prompt`, with the Python port in the same push. That is the safety builder's change, not made here.
- **Opt-out under B was not measured.** judge.json is one call with two labels. B's opt-out rule text is word-for-word
  A's (only the crisis scoring rule and the reply format differ, checked by diff). Still, the model's opt-out output
  under B is unmeasured. PREREG-9 is crisis-only, so `heldout-optout.json` was not scored (step 5 skipped). A DEV
  opt-out run of B (`--task opt_out --source optout-dev --prompt-file ...`) is the cheap check before the swap.
- **Timeouts.** 0/200 on BLIND 9 and 8/830 on DEV, all on DEV lines. p95 is 1,132–1,319 ms and the maximum 1,487 ms,
  close to the 1,500 ms window. About 1 verdict in 100 did not arrive on DEV. In the runtime, a timeout leaves the
  floor's verdict.
- **Cost.** B's prompt is about 19% longer: 796–813 input tokens per turn, against 647–664 for A. B costs ₹33.61 per
  1,000 turns on BLIND 9, against A's ₹28.48–29.25 on DEV and ₹29.21 on BLIND 8.
- **What the eval did and did not exercise.**
  - It ran the TS door (`shared/safety/judge.ts`, through judge-eval.mjs).
  - The Python runtime door reads the same judge.json. Its parity with TS rests on the builder's tests; this run did
    not exercise it.
  - For BLIND 9, B was carried into judge.json's `system_prompt` in a VM-only copy. `--prompt-file` refuses heldout
    sets by design.
  - The run log shows the copy's prompt sha256_16 (`ed63058d5526890a`), the same as the B DEV reports' `--prompt-file`
    sha. `report.json` → `prompt` reads `judge.json` for that reason.
- **Sample size.** n is one run per set. BLIND 9 has 200 caller lines (100 crisis, 100 benign look-alikes), with no
  agent lines. Language slices have 4–18 lines each, so their CIs are wide.
- **What was not read.** The builder of this report did not read BLIND 9's lines. Only the tool's aggregate output
  and line ids were used. `results.json`, which holds the lines, stayed on the VM (`/tmp/judge-eval/`) and in blob, and
  was not downloaded.

## Method

- **Where.** On `vl-vm-cin` (Central India), through Run Command, one at a time:

  | Run | Time, 2026-10-24 (UTC) |
  |---|---|
  | `vps6-j9-deploy-680c5e6`: redeploy plus prep | 04:22:53–04:23:17 |
  | `vps6-j9-dev-A` | 04:25:07–04:32:28 |
  | `vps6-j9-dev-B` | 04:33:25–04:40:42 |
  | `CHOICE.md` written | 04:42:07Z |
  | `vps6-j9-blind9` | 04:43:03–04:46:36 |
  | `vps6-j9-final-health` | 04:48:06 |

- **Tree: staging redeployed to origin head 680c5e6.** Staging was at 69597eb, which predates 2bd4daf. So it lacked
  heldout-9, dev-lookalike-9, prompt B and the risk parse.
  - The bundle followed the e9fdde3/69597eb recipe:
    - a `git archive` of `product/`, the root `package.json` and `package-lock.json`;
    - the Silero VAD model and the 49 caller clips;
    - `BUNDLE_SHA`.
  - Its file list differed from the 69597eb bundle by exactly the 10 files added since.
  - The tools archive in blob was byte-identical (sha256 checked).
  - The Run Command was `../staging/ops/deploy_pre.sh`, then `../../2026-10-23/staging/ops/stage_setup.sh` (unchanged
    since 69597eb), then `../staging/ops/deploy_post.sh`, then `ops/prep9.sh`.
  - Pre-check: no active calls. The lockfile was unchanged, so `node_modules` was kept.
  - Migrations: `0804_learning_theme_runs.sql` (1 new, 40 in the tree).
  - Both units restarted.
  - Smoke: 401 without auth and 200 with it; every stack available except sarvam-india (no key).
- **The eval tree.** `ops/prep9.sh` built a VM-only copy, `/tmp/je9`, of the deployed tree with the contract
  judge.json.
  - It checked the seven PREREG-9 files by sha256; all matched.
  - It ran no-network dry runs, with a fake model, on the DEV sets only, for A and for B. The B fake answered with
    `risk` and no `confidence`, which confirmed that risk/100 parses.
  - `ops/mk_je9t.sh` built `/tmp/je9t` = `/tmp/je9` with judge.json `caller_crisis.threshold` = 0.4 and
    `system_prompt` = B trimmed. Every other field was checked identical.
  - Both copies were removed at the end. The running staging services were not touched after the redeploy.
- **The judge.** The judge.json contract: `timeout_ms` 1,500, `max_tokens` 80, temperature 0. The model was asked on
  every line.
- **Command** (`ops/judge9.tmpl.sh`, filled by `ops/fill9.py`). The Vertex token was minted on the VM from its service
  account file. It was never sent from, or printed to, the sandbox.

  ```
  node product/scripts/judge-eval.mjs --task crisis <--source dev-7 | --set product/shared/safety/sets/dev-lookalike-9.json |
    --set product/shared/safety/sets/heldout-9.json> [--prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt  (DEV, B)] \
    --rps 1 --concurrency 1 --price-in 28.5 --price-out 237.5 --max-cost-inr <8|9.5|9> --max-requests <200|235|210>
  ```

  - Model `google/gemini-3.5-flash-lite` on the Vertex global OpenAI-compatible endpoint.
  - Prices: `prices.ts` $0.30 / $2.50 per 1M tokens × 95.
  - Each run waited while the lab had used Vertex in the last 180 s, and while staging had active calls.
  - Vertex was used only from the VM, at most 1 request per second, one at a time. In the job window, the staging
    runtime made 0 Vertex requests (its pace log) and the lab 0 (its ledger).
- **The rule.** `ops/prereg_apply9.py` applies rule 9 on exact fractions; its output is `dev/prereg_apply9.out`. It
  was tested on synthetic sweeps first, for each tie-break and the fallback steps.
- **Intervals.** Wilson 95%.

## Spend for this job (metered)

| Item | ₹ |
|---|---|
| DEV, prompt A: dev-7 + dev-lookalike-9 | 5.41 + 6.58 = 11.99 |
| DEV, prompt B: dev-7 + dev-lookalike-9 | 6.24 + 7.46 = 13.70 |
| BLIND 9 (B, 0.4) | 6.72 |
| **Total metered** | **32.41** (cap ₹60) |

Not metered:
- 8 DEV judge requests that timed out. Each could be billed, at about ₹0.03, so about ₹0.27 in all.
- The deploy and the health checks made no model calls.

The worst case is about ₹32.7. No new resource was created.

## Health

- **The lab.** `voicelab` stayed active, with 0 restarts since 2026-10-22 06:48 UTC. `/api/ping` returned 200 locally
  and on the public URL before and after every run. There were 0 lab journal error lines since 04:00 UTC.
- **Staging (`ops/final_health9.sh`, 04:48 UTC):**
  - 680c5e6, `VERTEX_OFF=0`, both units active since 04:22:59 with 0 restarts;
  - 0 runtime tracebacks and 0 control errors since the deploy;
  - no runtime drop-ins, no judge env file, no judge model or latency-flag override in the runtime process;
  - 0 test calls since the deploy;
  - 401 without auth and 200 with it;
  - ports 8090, 8091 and 5432 on 127.0.0.1 only.
- **Run Command records.** Pruned by each record's own start time (per-record GET, `ops/ops9.py`). 5 records are kept,
  all from this job, and none is active. Logs stay in blob under `runlogs/`.

## Files

- `../judge-prereg9/CHOICE.md`: the mechanical choice, with its UTC time. It was written before BLIND 9; its sha256_16
  at that time was `ff71c057c793c325`.
- `dev/flashlite-{dev7,dlk9}-{A,B}/`: `report.json` and `summary.md` for the four DEV runs.
- `dev/prereg_apply9.out`: rule 9 applied, with the pooled sweep for both prompts.
- `flashlite-blind9-B-t04/`: `report.json` and `summary.md`.
  - `report.json` holds every slice with k, n, rate and Wilson CI, the sweep, latency, tokens, cost, and the ids of
    misses and false alarms.
- `ops/`: the scripts used.
  - `ops9.py`: the Run Command wrapper, with prune by start time.
  - `prep9.sh`, `judge9.tmpl.sh`, `fill9.py`, `mk_je9t.sh`.
  - `drive_j9dev.sh` and `drive_j9blind.sh`. The blind driver refuses without a matching `CHOICE.md`, or a second
    time.
  - `prereg_apply9.py`, `tables9.py` (the tables here, from `report.json`) and `final_health9.sh`.
