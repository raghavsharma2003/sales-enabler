# Opt-out judge under prompt B, DEV (optout-dev), Flash-Lite on Vertex from the India VM (2026-10-24)

**Question.** PREREG-9 chose prompt B (risk 0–100) for the crisis label. judge.json is one call with two labels, so
B also changes the opt-out label. `decision.2026-10-24.judge-prompt-b-ships-after-optout-dev` lets B ship only if one
opt-out DEV run under B is no worse than A. The bounds were fixed before the run in `RULE.md` (05:00:11Z): judge-alone
recall at least 141/150 and FP at most 17/110, at the shipped `opt_out_threshold` 0.6.

**Short answer: B is outside both bounds.**

| At 0.6, judge alone | A (`measure.2026-10-24.judge-optoutdev-flashlite-1500`) | **B (this run)** | Bound | Met? |
|---|---|---|---|---|
| Recall on 150 opt-out requests | 144/150 (96.0%, 91.5–98.2) | **138/150 (92.0%, 86.5–95.4)** | ≥ 141/150 | **no** |
| FP on 110 look-alikes | 14/110 (12.7%, 7.7–20.2) | **18/110 (16.4%, 10.6–24.4)** | ≤ 17/110 | **no** |
| Timeouts (1,500 ms) | 7/260 (2.7%) | **20/260 (7.7%, 5.0–11.6)** | – | – |
| p50 / p95 / max, answered | 966 / 1,160 / 1,364 ms | 978 / 1,304 / 1,419 ms | – | – |
| Tokens per turn (in / out) | 641 / 42.0 | 740 / 40.3 | – | – |
| ₹ per 1,000 turns | 28.24 | 30.65 | – | – |

The floor is in-sample on this set: 150/150 recall and 0/110 FP under both runs, so floor-or-judge recall is 150/150
and floor-or-judge FP equals the judge's.

## What the two misses are made of (exploratory; `ops/compare_ab.py`, line by line on the same 260 lines)

- **The recall gap is timeouts.** B timed out on 11 of the 150 opt-out lines (A: 5). Of the 139 it answered, B flagged
  138 (A: 144 of 145). On the 135 opt-out lines both prompts answered, both flag 134.
- **The FP gap is the model.** B answered 101 of the 110 look-alikes and flagged 18 of them (A: 14 of 108). On the 99
  look-alikes both answered, B flags 18 and A 13.
  - 10 false alarms are shared. 8 are B's only (ml-en 3; bn-en, kn-en, mr-en, ta-en and te-en 1 each), and A answered
    all 8. 4 are A's only, and B timed out on 1 of those.
- **Timeouts.** Only 1 line timed out under both prompts, so they are not tied to particular lines. B's prompt is about
  100 input tokens longer. One run per prompt cannot separate that from Vertex load at the time of each run. B's crisis
  DEV runs in judge-blind9 had 1–2 timeouts per 190–225 lines.
- These splits do not change the result. `RULE.md` counts a timeout as "not flagged", as the harness does, and point
  estimates decide.

## Per language, judge alone (the writer's tags)

| Lang | Recall A | Recall B | FP A | FP B |
|---|---|---|---|---|
| bn-en | 16/16 | 15/16 | 2/11 | 3/11 |
| en | 12/12 | 12/12 | 0/14 | 0/14 |
| gu-en | 14/16 | 14/16 | 3/11 | 2/11 |
| hi-deva | 6/6 | 6/6 | 0/8 | 0/8 |
| hinglish | 19/20 | 18/20 | 0/11 | 0/11 |
| kn-en | 16/16 | 14/16 | 2/11 | 3/11 |
| ml-en | 15/16 | 14/16 | 1/11 | 3/11 |
| mr-en | 16/16 | 15/16 | 1/11 | 2/11 |
| ta-en | 14/16 | 14/16 | 4/11 | 3/11 |
| te-en | 16/16 | 16/16 | 1/11 | 2/11 |

Slices are 6–20 lines, so their intervals are wide (`report.json` has each one with its Wilson CI).

## Sweep (information only; not used for the bounds)

B's opt-out confidences are nearly binary: answered opt-out lines are at 1.0 (132) or 0.95 (6), and B's false alarms
sit at 0.9–1.0, except one at 0.3. Judge recall is 138/150 at every threshold from 0.3 to 0.95. FP is 19/110 at 0.3,
18/110 from 0.35 to 0.9, and 9/110 at 0.95. No threshold in the grid reaches both bounds: recall stays at 138.

## Read this with care

- **This is a DEV set, and the floor and A's prompt shapes were tuned on it.** It is the check the decision named,
  not a blind score.
- **n is one run per prompt.** The two runs were about three hours apart (A 01:58–02:03, B 05:03–05:08 UTC), with the
  same model, endpoint, timeout and harness. The tree differs: A ran from `/tmp/je8`, B from 7c17724. The opt-out path
  (judge.json, judge.ts, cases.json and judge-eval's opt-out scoring) is what both read. B's opt-out rule text is
  word-for-word A's; only the crisis scoring rule and the reply format differ.
- **What was exercised:** the TS door (`shared/safety/judge.ts`, through judge-eval). The Python runtime door was not
  exercised.
- **The decision's reverse_if names this case** ("the opt-out DEV run under B falls below the stated bounds"). What to
  do is the integrator's and the owner's call. The options include keeping A, giving opt-out its own prompt (the
  open question's other way to close), or a B variant measured again on DEV.

## Method

- **Tree:** origin head 7c17724 (7c1772489be8be10fecd662efd517e60b0f81a0b, contains 3515b53). `git archive` of
  `product/`, `package.json` and `package-lock.json`, plus `BUNDLE_SHA`, as blob `vm10-je10-bundle.tgz` (sha256
  `1ae2468b…dce8`), unpacked on `vl-vm-cin` into a VM-only `/tmp/je10`.
  - `package.json` and the lockfile are byte-identical to staging's (680c5e6), so staging's `node_modules` was
    symlinked.
  - Staging was not redeployed or touched.
- **Prep (`ops/prep10.sh`, no model traffic).** It checked 13 files by sha256 (all matched): judge.json `1d467ad8ee1ad73e`, prompt B
  `14fcc3ac8fcb181a` (trimmed `ed63058d5526890a`), rules.json `846bab6697b31ad2`, cases.json `714e3158a49d088e`,
  judge-eval.mjs `a790b0a86d705963`, judge.ts `fdce56943ff4a6f5`, llm.ts `e3288671a3428d41`. Then dry runs with a fake
  model, on DEV sets only.
- **Command** (`ops/judge10.tmpl.sh`, filled by `ops/fill10.py`; the exact Run Command is `ops/vm10-optout.sh`):

  ```
  node product/scripts/judge-eval.mjs --task opt_out --source optout-dev \
    --prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt \
    --rps 1 --concurrency 1 --price-in 28.5 --price-out 237.5 --max-cost-inr 15 --max-requests 270
  ```

  - `--source optout-dev` is what A's run used. Its 260 lines are the same as `sets/optout-dev.json`'s (260/260 texts).
  - Model `google/gemini-3.5-flash-lite` on the Vertex global OpenAI-compatible endpoint. The token was minted on the
    VM from the service account file and never left it.
  - Env: `VP_LLM_SAFETY_JUDGE_URL`, `_KEY`, `_MODEL`; no `_KEY_HEADER`; `VP_LLM_DEFAULT_*` unset.
  - judge.json contract: `timeout_ms` 1,500, `max_tokens` 80, temperature 0, `opt_out_threshold` 0.6. The run log
    shows judge.json's own prompt sha (`c8b4789f49c8198e`, A); `--prompt-file` replaced it in the process, and
    `report.json` → `prompt` records B's `ed63058d5526890a`.
  - The run waited while the lab had used Vertex in the last 180 s, and while staging had active calls (neither did).
  - 260/260 judged, no early stop, 284 s wall.
- **Intervals:** Wilson 95%.

| Run Command | Time, 2026-10-24 (UTC) |
|---|---|
| `RULE.md` written | 05:00:11Z |
| `vm10-prep` | 05:02:47–05:02:51 |
| `vm10-optout-b` | 05:03:30–05:08:16 |
| `vm10-brief-blind` (`../brief-review-blind/flashlite`) | 05:09:39–05:12:46 |
| `vm10-final-health` | 05:13:28–05:13:29 |

## Spend (this job, both evals)

| Item | ₹ |
|---|---|
| This run, metered | 7.97 (cap 15) |
| Brief-review blind run, metered (`../brief-review-blind/flashlite`) | 5.41 (cap 15) |
| **Total metered** | **13.38** (job cap 40) |

Not metered: the 20 timed-out requests here. Each could be billed, at about ₹0.03, so about ₹0.6 in all. The worst
case is about ₹14.0. No new resource was created. The bundle blob stays in the transfer container, like earlier
bundles.

## Health (before: `vm10-prep`; after: `vm10-final-health`)

- **Lab.** `voicelab` active, with 0 restarts since 2026-10-22 06:48:39 UTC. `/api/ping` returned 200 locally and on
  the public URL before and after each run. 0 lab journal error lines since 04:00 UTC. 0 lab Vertex ledger rows since
  the job start (05:02:29).
- **Staging.**
  - 680c5e6, `VERTEX_OFF=0`, both units active since 04:22:59 with 0 restarts, before and after;
  - 0 runtime tracebacks and 0 control errors since the deploy;
  - no runtime drop-ins, no judge env file, no judge env vars and no latency-flag overrides in the runtime;
  - 0 active calls and 0 test calls;
  - 401 without auth and 200 with it;
  - 0 staging-runtime Vertex requests since the job start;
  - ports 8080, 8090, 8091 and 5432 on 127.0.0.1 only.
- **Cleanup.** `/tmp/je10` and this job's two output folders in `/tmp/judge-eval/` were removed after their files were
  uploaded to blob (`runlogs/vm10-*`). Other jobs' folders were left as they were.
- **Run Command records:** 9, all Succeeded, none active (5 from judge9, 4 from this job). The cap is 25, so none was
  pruned.

## Files

- `RULE.md`: the bounds, written before the run.
- `report.json`, `summary.md`: the harness's output for this run.
- `ops/`:
  - `prep10.sh`, `judge10.tmpl.sh`, `fill10.py`, `final_health10.sh`, `drive10.sh`: the job's scripts, used by both
    evals;
  - `vm10-optout.sh`: the exact Run Command for this run;
  - `compare_ab.py`: the line-by-line A/B split above.

  The Run Command wrapper is `../judge-blind9/ops/ops9.py`, unchanged.
