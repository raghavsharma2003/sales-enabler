# Caller-crisis judge: DEV, then BLIND 8 once, Flash-Lite on Vertex from the India VM (2026-10-24)

**Question.** The judge is now non-blocking, with a 1,500 ms window and Flash-Lite recommended (0f8f965). At a
threshold chosen on DEV by a rule written down first, what do the judge and the floor give on the unread BLIND 8?
- recall;
- false positives on benign look-alikes;
- latency;
- cost.

**Short answer.**
- **The pre-registered rule chose 0.9** (`PREREG.md`). On DEV it was the only threshold with judge FP ≤ 5%: 0/90,
  against 6/90 at 0.85. Judge recall there is 60/100.
- **BLIND 8 at 0.9:**
  - judge-alone recall 73/100, FP 0/100;
  - floor or judge recall 75/100, FP 9/100;
  - the floor alone: 26/100 recall and 9/100 FP.
- So at this threshold the judge adds no false positives. The combined FP is the floor's own.
- **The threshold cost recall.** On the BLIND 8 sweep (information only, not used to choose), the contract's 0.5
  gives judge recall 93/100 with judge FP 1/100. The DEV rule traded about 20 points of blind recall for one false
  positive.
- **At 1,500 ms, about 2% of verdicts time out:** 3/200 on BLIND 8; 5/190 and 7/260 on DEV.

## Results (BLIND 8, scored once, threshold 0.9)

| Run | BLIND 8 recall: floor | Recall: judge | Recall: floor or judge | Benign FP: floor | Benign FP: judge | Benign FP: floor or judge | p50 / p95 (answered) | Unavailable | ₹ per 1k turns |
|---|---|---|---|---|---|---|---|---|---|
| `flashlite-blind8-t090`: Gemini 3.5 Flash-Lite, Vertex global, 1,500 ms (contract), threshold **0.9** (`PREREG.md`), 1 req/s | 26/100, 26.0% (18.4–35.4) | 73/100, 73.0% (63.6–80.7) | **75/100, 75.0% (65.7–82.5)** | 9/100, 9.0% (4.8–16.2) | 0/100, 0.0% (0.0–3.7) | **9/100, 9.0% (4.8–16.2)** | 1,006 / 1,270 ms | 3/200 (3 timeouts) | 29.21 |

For comparison, BLIND 7's Flash-Lite run (`../../2026-10-23/judge-eval-blind7`): threshold 0.5, 3,000 ms timeout.
- judge recall 99/100, floor or judge 99/100;
- judge FP 8/100, floor or judge 10/100;
- floor 37/100 recall, 3/100 FP.

Different set, threshold and timeout, so it is not a like-for-like comparison.

**Per language, BLIND 8** (the writer's tags; Wilson 95%):

| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: floor | FP: judge | FP: floor or judge |
|---|---|---|---|---|---|---|
| bn-en | 4/18 (22.2%, 9.0–45.2) | 15/18 (83.3%, 60.8–94.2) | 15/18 (83.3%) | 2/17 (11.8%, 3.3–34.3) | 0/17 | 2/17 (11.8%) |
| gu-en | 1/18 (5.6%, 1.0–25.8) | 11/18 (61.1%, 38.6–79.7) | **11/18 (61.1%)** | 1/17 (5.9%) | 0/17 | 1/17 |
| hi-deva | 2/4 (50.0%) | 4/4 (100%) | 4/4 | 0/5 | 0/5 | 0/5 |
| hinglish | 4/6 (66.7%) | 6/6 (100%) | 6/6 | 1/10 (10.0%) | 0/10 | 1/10 |
| mr-en | 2/18 (11.1%, 3.1–32.8) | 13/18 (72.2%, 49.1–87.5) | 13/18 (72.2%) | 1/17 (5.9%) | 0/17 | 1/17 |
| ta-en | 8/18 (44.4%, 24.6–66.3) | 14/18 (77.8%, 54.8–91.0) | 15/18 (83.3%) | **3/17 (17.6%, 6.2–41.0)** | 0/17 | 3/17 (17.6%) |
| te-en | 5/18 (27.8%, 12.5–50.9) | **10/18 (55.6%, 33.7–75.4)** | **11/18 (61.1%)** | 1/17 (5.9%) | 0/17 | 1/17 |

Weak spots:
- Recall: te-en (judge 10/18; floor or judge 11/18), gu-en (11/18) and mr-en (13/18).
- FP: the floor on ta-en (3/17) and bn-en (2/17). The judge has 0 FP in every language at 0.9.
- 25 crisis lines were missed by both floor and judge. Their ids are in `report.json` → `misses`. The lines were not
  read.

**The BLIND 8 sweep, for information only.** It is not used for choosing: the threshold was fixed on DEV before this
run, and nothing will be changed on the basis of this table.

| Threshold | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |
|---|---|---|---|---|
| 0.3–0.8 (each) | 93/100 (93.0%, 86.3–96.6) | 93/100 (93.0%) | 1/100 (1.0%, 0.2–5.4) | 10/100 (10.0%, 5.5–17.4) |
| 0.85 | 91/100 (91.0%, 83.8–95.2) | 92/100 (92.0%) | 0/100 (0.0%, 0.0–3.7) | 9/100 (9.0%) |
| 0.9 (the pre-registered one) | 73/100 (73.0%, 63.6–80.7) | 75/100 (75.0%) | 0/100 (0.0%, 0.0–3.7) | 9/100 (9.0%) |

## DEV runs

| Run | Set and task | Recall: floor / judge / floor or judge | FP: floor / judge / floor or judge | p50 / p95 | Unavailable | ₹ (₹ per 1k) |
|---|---|---|---|---|---|---|
| `dev/flashlite-dev7-crisis` (contract 0.5) | dev-7, crisis: 100 crisis / 90 not | 100/100 (in-sample) / 88/100 (80.2–93.0) / 100/100 | 0/90 / 8/90 (8.9%, 4.6–16.6) / 8/90 | 1,001 / 1,212 ms | 5/190, all timeouts, all on crisis lines | 5.35 (28.14) |
| `dev/flashlite-optoutdev` (contract `opt_out_threshold` 0.6) | optout-dev, opt-out: 150 requests / 110 look-alikes | 150/150 (in-sample) / 144/150 (96.0%, 91.5–98.2) / 150/150 | 0/110 / 14/110 (12.7%, 7.7–20.2) / 14/110 | 966 / 1,160 ms | 7/260, all timeouts | 7.34 (28.24) |

- The DEV crisis sweep that chose the threshold, and its confidence steps, are in `PREREG.md` part 2.
- Opt-out sweep (information only; the opt-out threshold was not in question):
  - 0.3–0.85: judge recall 144/150, FP 14/110;
  - 0.9: 144/150, FP 9/110.

## Read this with care

- **The rule did what it said, and that cost blind recall.**
  - On DEV, every one of Flash-Lite's 8 benign false positives came at a confidence of 0.85 or below (6 of them at
    exactly 0.85). 28 of its 88 true crisis verdicts did too.
  - Its confidences come in steps (0.85, 0.95, 1.0), so the only threshold under 5% FP was 0.9. It cuts both groups.
  - On BLIND 8 the judge raised only 1 false positive at any threshold, and none at 0.85. So the threshold mainly
    removed true positives: 93 → 73.
  - **A future rule should allow for step-quantised confidences.** One option is to choose by recall at an FP
    bound, with a CI. That is a lesson for the next pre-registration, not a reason to re-score BLIND 8 here.
- **The combined FP is the floor's.** The floor flags 9/100 of BLIND 8's benign look-alikes (BLIND 7: 3/100), and the
  judge adds 0. So the decision bar for `decision.2026-10-23.judge-model-shadow` cannot be met by any judge threshold
  while the floor flags these:

  | Measure | BLIND 8 | Bar |
  |---|---|---|
  | Judge-alone FP | 0/100, upper CI bound 3.7% | 1%, with the upper bound at or below 2% |
  | Floor-or-judge FP | 9/100 | the same bar |

  The floor is in-sample on DEV (100% recall, 0 FP there) and out-of-sample here (26/100 recall, 9/100 FP).
- **Timeouts at the contract's 1,500 ms.** 3/200 on BLIND 8, 5/190 and 7/260 on DEV; p95 1,160–1,270 ms, max
  1,514 ms. About 1 verdict in 50 never arrives. In the runtime a timeout leaves the floor's verdict, so a crisis line
  then depends on the floor alone.
- **How often a verdict lands before her first sentence is in `../staging/reply-gap.md`.** It is estimated from these
  latencies, because the staging call batch was blocked by the product's daily test budget.
- n is one run per set. BLIND 8 has 200 caller lines (100 crisis, 100 benign look-alikes) and no agent lines. No
  other set was added. Language slices have 4–18 lines each, so their CIs are wide.
- The builder of this report did not read BLIND 8's lines. Only the tool's aggregate output and line ids were used;
  `results.json` (which holds the lines) stayed on the VM and in blob, and was not downloaded.

## Method

- **Where.** On `vl-vm-cin` (Central India), through Run Command, sequentially:

  | Run | Time, 2026-10-24 (UTC) |
  |---|---|
  | prep | 01:53 |
  | DEV crisis | 01:54–01:57 |
  | DEV opt-out | 01:58–02:03 |
  | BLIND 8 | 02:04–02:07 |

- **Tree.** The staging copy at e9fdde3 already holds `judge-eval.mjs` with the sweep, dev-7, optout-dev and
  `sets/heldout-8.json`. So no overlay was needed.
  - `ops/prep.sh` built a VM-only copy in `/tmp/je8`, with the contract `judge.json`. It checked the four files
    `PREREG.md` names by sha256 (all matched), and ran no-network dry runs on the DEV sets only, never on BLIND 8.
  - `ops/mk_je8t.sh` built `/tmp/je8t` = `/tmp/je8` with only the crisis threshold set to 0.9. It checked that every
    other field of `judge.json` is identical.
  - The running staging services were not touched by these runs.
- **Judge.** The `judge.json` contract: `timeout_ms` 1,500, `max_tokens` 80, temperature 0, opt-out threshold 0.6.
  The crisis threshold was 0.5 for DEV and 0.9 for BLIND 8. The judge was asked on every line.
- **Command** (`ops/judge8.tmpl.sh`). The Vertex token was minted on the VM from its service account file and never
  sent from or printed to the sandbox.

  ```
  node product/scripts/judge-eval.mjs <--task crisis --source dev-7 | --task opt_out --source optout-dev |
    --task crisis --set product/shared/safety/sets/heldout-8.json> --rps 1 --concurrency 1 \
    --price-in 28.5 --price-out 237.5 --max-cost-inr 30 --max-requests <250|300> --label <label> --out-dir /tmp/judge-eval/<label>
  ```

  - Model `google/gemini-3.5-flash-lite` on the Vertex global OpenAI-compatible endpoint.
  - Prices: `prices.ts` $0.30 / $2.50 per 1M tokens × 95.
  - Each run waited while the lab had used Vertex in the last 180 s, and while staging had active calls. Vertex was
    used only from the VM, at most 1 request per second, one at a time.
- **Intervals.** Wilson 95%.

## Spend for this job (metered)

| Item | ₹ |
|---|---|
| 6 opening calls (`../staging/redeploy-e9fdde3.md`) | 18.84 |
| 21 reply-gap calls, arms A and B (`../staging/reply-gap.md`) | 60.65 |
| Judge DEV crisis | 5.35 |
| Judge DEV opt-out | 7.34 |
| Judge BLIND 8 | 5.84 |
| **Total metered** | **98.02** (cap ₹200) |

Not metered:
- the 15 judge requests that timed out (each could be billed; about ₹0.03 each);
- the brain requests the runtime cancelled before response headers (191 in the reply-gap calls, plus the openings'),
  if Vertex bills them. The upper bound, if each were billed like a completed brain request (about ₹0.085), is about
  ₹25;
- the warm HEADs carry no model and no token, so no billing is expected.

Worst case is about ₹124. No new resource was created and no deployment was changed. The judge-shadow call batch was
not run (the test budget), so it cost nothing.

## Health

- The lab `voicelab` stayed active, with 0 restarts since 2026-10-22 06:48 UTC.
- `/api/ping` returned 200 locally and on the public URL before and after every run.
- 0 lab journal error lines since 00:40 UTC.
- Staging was left as deployed (`../staging/ops/final_health.sh`, 02:09 UTC):
  - e9fdde3, `VERTEX_OFF=0`;
  - no runtime drop-ins, no judge env file, no judge model or latency-flag override in the runtime process;
  - 401 without auth and 200 with it;
  - ports 8090, 8091 and 5432 on 127.0.0.1 only.
- 12 Run Command records on the VM (under 25), none active.

## Files

- `PREREG.md`: the rule, written at 00:31:38Z before any request. The DEV numbers and the chosen threshold were added
  at 01:58:23Z, before BLIND 8, with one wording correction at 01:59:08Z.
- `dev/flashlite-dev7-crisis/` and `dev/flashlite-optoutdev/`: `report.json` and `summary.md` (the DEV sweeps).
  `dev/prereg_apply.out` is the rule applied.
- `flashlite-blind8-t090/`: `report.json` (every slice with k, n, rate and Wilson CI, the sweep, latency, tokens, cost,
  and the ids of misses and false alarms) and `summary.md`.
- `ops/prep.sh`, `ops/mk_je8t.sh`, `ops/judge8.tmpl.sh` and `ops/prereg_apply.py`.
