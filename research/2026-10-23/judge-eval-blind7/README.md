# Caller-crisis judge on BLIND set 7, from the India VM (2026-10-23)

**Question.** Does the model judge lift crisis recall on the code-mixed blind set above the regex floor's 37/100? What
does it cost in false positives on benign look-alikes?

**Short answer.**
- **Yes on recall.** The judge reads the code-mixed paraphrase that the floor misses.
- **No on false positives.** On the benign look-alikes ("kaam kari kari ne mari gayo", nominee questions, idioms of
  dying from heat or traffic) both models raise far more than the decision's bar (FP at or below 1%, with an upper CI
  bound at or below 2%).

## Results

| Run | Blind 7 recall: floor | Blind 7 recall: judge | Blind 7 recall: floor or judge | Blind 7 benign FP: judge | Blind 7 benign FP: floor or judge | p50 / p95 (answered) | Unavailable (all 320) | ₹ per 1k turns |
|---|---|---|---|---|---|---|---|---|
| `azure-41mini-in`: GPT-4.1 mini, South India regional deployment, 800 ms contract, 0.75 req/s | 37/100, 37.0% (28.2–46.8) | 86/100, 86.0% (77.9–91.5) | **87/100, 87.0% (79.0–92.2)** | 21/100, 21.0% (14.2–30.0) | **23/100, 23.0% (15.8–32.2)** | 390 / 447 ms | 1/320 (1 error) | 22.07 |
| `vertex-flashlite-t3000`: Gemini 3.5 Flash-Lite, Vertex global, **3,000 ms** (VM-only judge.json copy), 1 req/s | 37/100 (28.2–46.8) | 99/100, 99.0% (94.6–99.8) | **99/100, 99.0% (94.6–99.8)** | 8/100, 8.0% (4.1–15.0) | **10/100, 10.0% (5.5–17.4)** | 961 / 1,126 ms | 0/320 | 17.65 |
| `azure-41mini-in-rps1`: the first GPT-4.1 mini run at 1 req/s (record; see below) | 37/100 | 83/100 (74.5–89.1) | 85/100 (76.7–90.7) | 16/100 (10.1–24.4), 24 benign lines unanswered | 18/100 (11.7–26.7) | 381 / 435 ms | 30/320 (28 HTTP 429, 2 timeouts) | 20.06 |

All 320 lines (130 crisis, 190 non-crisis), the same two runs:

| Run | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge | heldout-6 judge recall / FP |
|---|---|---|---|---|---|
| `azure-41mini-in` | 115/130, 88.5% (81.8–92.9) | 117/130, 90.0% (83.6–94.1) | 25/190, 13.2% (9.1–18.7) | 27/190, 14.2% (10.0–19.9) | 29/30, 4/90 (same as the 120-line run earlier today) |
| `vertex-flashlite-t3000` | 129/130, 99.2% (95.8–99.9) | 129/130, 99.2% (95.8–99.9) | 10/190, 5.3% (2.9–9.4) | 12/190, 6.3% (3.6–10.7) | 30/30, 2/90 (1/90 earlier today) |

Per-language slices of blind 7 for each run are at the end of each `<label>/summary.md`. Worst slices:
- GPT-4.1 mini, recall: te-en 14/18.
- GPT-4.1 mini, FP: bn-en 5/17; mr-en, te-en and gu-en 4/17 each.
- Flash-Lite, recall: gu-en 17/18.
- Flash-Lite, FP: mr-en 3/17.

## Read this with care

- **Floor or judge lifts recall well above the floor's 37/100 for both models, but neither run meets the reversal
  bar for `decision.2026-10-23.judge-model-shadow`.** The bar is FP at or below 1% with an upper bound at or below 2%.
  The only model inside the 800 ms budget flags 21/100 benign look-alikes. That is about 1 in 5 turns that sound like
  distress but are not, and its lower CI bound (14.2%) is far above 1%.
- **Flash-Lite is the better classifier, and it does not fit the contract timeout.**
  - Only 13 of its 320 answers came back within 800 ms. At the contract it adds nothing (see `../judge-eval`:
    120/120 timeouts).
  - Its row is supplementary: it is a quality measurement apart from latency, not something the runtime can use
    today.
- Four benign blind-7 lines were flagged by both models: benign.11, .48, .49 and .59.
- The floor's numbers reproduce the recorded blind score exactly (37/100 crisis, 3/100 benign). This was checked by a
  no-network dry run in the sandbox and on the VM before any paid request.
- **No threshold sweep was done on purpose.** Choosing a threshold on blind 7 would be tuning on it. A threshold or
  prompt change needs a DEV set and a fresh blind set.
- n is one run per configuration. Blind 7 gives 200 caller lines: 100 crisis and 100 benign look-alikes.
  - Its other 120 lines are agent-side lines (paraphrased AI denials and honest agent lines), which the caller-crisis
    judge does not score.
  - To reach n ≥ 300, each run added heldout-6 (120 caller lines), as the 44778df commit prescribes. The
    blind-7 rows above are that source's slice.
- Cost counts tokens on answered requests at list price × 95.

## The 1 req/s run hit the deployment's request limit

`lab-gpt41mini-in` (Standard, capacity 50) allows **50 requests per 60 s**, per its `rateLimits` read from ARM.
- `--rps 1` sends 60 per minute. The burst allowance hid this for about 4 minutes. From about line 239, Azure returned
  HTTP 429 to 2 of every 6 requests: 28 errors, all fast (about 80 ms).
- The account's request metrics show 429s only in those minutes and no other client on the deployment.
- The run is kept as `azure-41mini-in-rps1`. Its unanswered lines count as judge misses there, so its recall and FP
  are not comparable.
- The headline row re-ran the same 320 lines at 0.75 req/s (45 per minute) and got 1 error in 320.

**Product consequence (not measured beyond this):** at capacity 50, this deployment can judge at most 50 caller turns a
minute across all calls, before anything else shares it.

## Method

- **Where.** On `vl-vm-cin` (Central India), through Run Command, sequentially, one model per run. Dates and times
  (UTC):

  | Run | Date | Time (UTC) |
  |---|---|---|
  | prep | 2026-10-23 | 22:04 |
  | `azure-41mini-in-rps1` | 2026-10-23 | 22:05–22:10 |
  | `azure-41mini-in` | 2026-10-23 | 22:13–22:20 |
  | `vertex-flashlite-t3000` | 2026-10-23 | 22:21–22:27 |

- **Code.**
  - The staging copy (`/opt/vp-stage/app`, 46dbbe7) predates blind set 7, so `ops/prep.sh` built VM-only trees in
    `/tmp/je7` and `/tmp/je7v`.
  - Four files were laid over them from branch head 160ec8a: `product/scripts/judge-eval.mjs` (`--set`),
    `shared/safety/rules.json` (the floor that scored 37/100), `cases.json` and `sets/heldout-7.json`.
  - Every other file the harness imports (`judge.ts`, `judge.json`, `index.ts`, `server/llm.ts`) is byte-identical
    to the head, checked by sha256.
  - The running staging services were not touched by these runs.
- **Judge.**
  - `judge.json` contract: threshold 0.5, `max_tokens` 60, temperature 0, 800 ms timeout.
  - `/tmp/je7v` sets `timeout_ms` to 3000 for the Flash-Lite run only.
  - The judge was asked on every line (the harness turns off `skip_when_floor_fires`), so judge-alone recall is
    measured on all lines.
- **Command** (from `ops/judge7.tmpl.sh`; keys come from the VM's own env file or a Vertex token minted on the VM from
  its service account file, never sent from the sandbox):

  ```
  node product/scripts/judge-eval.mjs --source heldout-6 --set product/shared/safety/sets/heldout-7.json \
    --rps <1 | 0.75> --concurrency 1 --price-in <INR/1M> --price-out <INR/1M> --max-cost-inr 120 \
    --max-requests 400 --label <label> --out-dir /tmp/judge-eval/<label>
  ```

  - GPT-4.1 mini: deployment `lab-gpt41mini-in`, ₹41.8 in / ₹167.2 out per 1M tokens.
  - Flash-Lite: model `google/gemini-3.5-flash-lite` on the Vertex global OpenAI-compatible endpoint, ₹28.5 / ₹237.5
    per 1M tokens.
  - Prices are `server/modules/money/prices.ts` × 95.
  - Vertex was used only from the VM, sequentially, at no more than 1 request per second. It waited while the lab had
    used Vertex in the last 180 s, and while staging had active calls.
- **Intervals.** Wilson 95%. `ops/b7slice.py` computes the blind-7-only slices from each run's `results.json`, which
  stays in the scratchpad (line text and verdicts; no keys).

## Spend

| Run | Metered spend |
|---|---|
| `azure-41mini-in-rps1` | ₹6.42 |
| `azure-41mini-in` | ₹7.06 |
| `vertex-flashlite-t3000` | ₹5.65 |
| **Total** | **₹19.13** |

- Not metered: the 2 timed-out requests (each could be billed) and the 28 requests refused with 429 (not billed).
- No new resource was created. No deployment was changed.

## Health

The lab `voicelab` stayed active, with 0 restarts since 2026-10-22 06:48 UTC. `/api/ping` returned 200 locally and on
the public URL before and after every run. Staging stayed active and answered 401 without auth and 200 with it before
the runs.

## Files

- `<label>/report.json`: the harness report: all slices with k, n, rate and Wilson CI, latency, tokens, cost, and the
  ids of misses and false alarms.
- `<label>/summary.md`: the harness table plus a blind-7-only per-language table.
- `ops/prep.sh`: health check, VM-only trees and the no-network dry run.
- `ops/judge7.tmpl.sh`: one model per run.
- `ops/b7slice.py`: the blind-7-only slices.
