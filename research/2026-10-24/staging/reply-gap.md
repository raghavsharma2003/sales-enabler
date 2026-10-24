# Product-runtime reply gap at e9fdde3, India VM (2026-10-24, 00:59–01:52 UTC)

**What was asked.** The reply gap per stack on the new tree, the 23 Oct way
(`../../2026-10-23/staging/reply-gap.md`):
- v2-flashlite, v2-mai and v2-54mini;
- at least 20 measured replies each;
- median, p90 and n against 23 Oct;
- the gap broken down by the runtime's new per-stage timing;
- `partialLagMs`;
- with the judge in shadow, how often its verdict landed before her first sentence.

**Short answer.**

1. **On staging, the shipped latency defaults make the reply slower, not faster.** VP_SPECULATE_PARTIAL and
   VP_PREWARM are on by default. Staging's Vertex pacer (≥ 1.0 s between request starts, the appeal commitment) also
   paces the extra requests those features send:
   - discarded speculative brain requests;
   - warm HEADs.

   Her real brain request then queues behind them. The same-session A/B, with those two flags off:

   | Stack | Defaults | Flags off |
   |---|---|---|
   | v2-flashlite | 3,201 ms | 2,301 ms |
   | v2-mai | 2,658 ms | 2,054 ms |
2. **With the two flags off, flashlite and mai are on par with 23 Oct or a little faster:**

   | Stack | Flags off, today | 23 Oct |
   |---|---|---|
   | v2-flashlite | 2,301 ms | 2,464 ms |
   | v2-mai | 2,054 ms | 2,213 ms |

   v2-54mini, on the defaults, is much faster than 23 Oct: 2,128 against 3,009 ms. Its brain is on Azure and is not
   paced.
3. **partialLagMs ≈ 0.86 s** (median of 464 lags over 27 calls; 96% above 500 ms).
4. **The judge-in-shadow call batch did not run.** The product's own daily test budget refused further test calls
   (below), so the window was not measured on calls. An offline estimate is given, labelled as one.

## Results

Reply gap = caller end of speech (the runtime's VAD) to her first audio frame, as the runtime computes it
(`reply.latencyMs` on the socket; identical to `turn.latency` in the control plane, checked per reply). Openings are
excluded. Median CI: bootstrap, 10,000 resamples, seed 20261024.
- Arm **A** = the shipped defaults: VP_SPECULATE_PARTIAL on, VP_PREWARM on, VP_FIRST_CLAUSE off, VP_BARGE_NOD on.
- Arm **B** = VP_SPECULATE_PARTIAL=0 and VP_PREWARM=0, all else equal. A runtime-only systemd drop-in set them for
  that run and was removed after it.

| Stack | 23 Oct (46dbbe7) p50 / p90, n | A: p50 (CI), p90, n (calls) | B: p50 (CI), p90, n (calls) | min–max A / B | ₹/min A / B (23 Oct) | Call errors |
|---|---|---|---|---|---|---|
| v2-flashlite (default) | 2,464 / 2,715 ms, 21 | **3,201** (2,977–3,260), 3,277 ms, 22 (4) | **2,301** (2,199–2,501), 2,810 ms, 23 (4) | 641–3,621 / 629–2,925 | 1.26 / 1.25 (1.26) | 0 |
| v2-mai | 2,213 / 2,744 ms, 24 | **2,658** (2,500–2,832), 3,987 ms, 23 (4) | **2,054** (1,852–2,185), 2,413 ms, 22 (4) | 1,241–15,894 / 370–2,593 | 1.69 / 1.65 (1.56) | 0 |
| v2-54mini | 3,009 / 3,558 ms, 23 | **2,128** (1,903–2,368), 2,543 ms, 24 (4) | 2,257 (841–2,467), 2,435 ms, **5 (1)**: incomplete, see below | 487–2,829 / 841–2,467 | 1.56 / 1.35 (1.31) | 0 |

The replies near 0.4–0.8 s are door replacements with no brain call, as on 23 Oct.
- In all 24 calls: 0 call errors, 0 fallbacks, 0 refused event batches (0 non-2xx, 0 "gave up", 0 ` 422` since the
  deploy), 0 runtime tracebacks.
- Every call ended `caller_hung_up`, except one per arm on flashlite and mai, where she ended the call herself
  (`agent_ended`).
- Speculation kept its reply in 2 of 22, 2 of 23 and 2 of 24 arm-A replies. The other speculative starts were
  discarded unheard.

**The A/B is the comparison to trust.** Its arms ran back to back on the same stack within 20 minutes. The 23 Oct
comparison mixes the code change with a different day and hour on Vertex.

## Where the time goes: the runtime's own per-stage timing

From `GET /v1/calls/{id}` → `timing` on the runtime (signed on the VM), joined to each reply. These are medians, in
ms. Marks are times after end of speech; stages are the runtime's own names.
- `ears` = end of speech → final.
- `turn` = final → brain request.
- `brain` = brain request → first data. This includes any pacer wait.
- `sentence` = first data → first sentence.
- `voice` = voice request → first audio data.
- `hold` = voice first data → release. It is negative when the turn-taking release came first.
- `out` = release → first audio sent.

| Stack, arm | n | ears | turn | brain | sentence | voice | hold | out | Marks after EOS: final / brain req / brain first / sentence / voice req / voice first / release / audio |
|---|---|---|---|---|---|---|---|---|---|
| v2-flashlite A | 22 | 586 | 11 | **1,588** | 76 | 961 | −2,020 | 2,020 | 586 / 604 / 2,200 / 2,288 / 2,289 / 3,202 / 1,224 / 3,202 |
| v2-flashlite B | 23 | 600 | 14 | **798** | 88 | 803 | −1,227 | 1,227 | 600 / 613 / 1,415 / 1,524 / 1,524 / 2,301 / 1,226 / 2,301 |
| v2-mai A | 23 | 595 | 16 | **1,624** | 111 | 456 | −1,602 | 1,602 | 595 / 605 / 2,200 / 2,349 / 2,349 / 2,808 / 1,231 / 2,808 |
| v2-mai B | 22 | 610 | 12 | **969** | 100 | 386 | −936 | 936 | 610 / 614 / 1,582 / 1,658 / 1,660 / 2,075 / 1,226 / 2,075 |
| v2-54mini A | 24 | 578 | 20 | 886 | 2 | 654 | −1,117 | 1,117 | 578 / 594 / 1,425 / 1,428 / 1,428 / 2,187 / 1,232 / 2,187 |
| v2-54mini B | 5 | 575 | 21 | 1,096 | 3 | 679 | −1,223 | 1,223 | 575 / 606 / 1,702 / 1,704 / 1,704 / 2,387 / 1,222 / 2,387 |

**How to read it**
- The gap is about ears + turn + brain + sentence + voice. The flashlite A medians sum to 3,222 against a gap of
  3,201; B sums to 2,303 against 2,301.
- The turn-taking release (about 1.2 s after statements) comes before her voice's first data in the median reply. So
  `hold` is negative and costs nothing on the critical path. `out` is the time from that release to her first audio,
  not a separate cost.
- **The A − B difference is in `brain`.** flashlite: +790 ms; mai: +655 ms. On flashlite, the voice also queues
  (+158 ms).
- Ears (≈ 0.58–0.61 s) and turn (≈ 10–20 ms) are the same in both arms. They also match 23 Oct's 598 ms from end of
  speech to the brain start.
- v2-54mini's `sentence` is 2–3 ms, because its Azure brain's first data already holds a whole sentence.

**Why A is slower: the pacer** (`vertex-pace.jsonl`, kinds tagged by `ops/tools/pace.py`). Each paced request is
counted against the request just ahead of it, which held the pacer slot. Over the 4 calls of each arm, each call's
window runs from placing it to the next call:

| Stack, arm | Vertex requests: brain / voice / warm HEAD | Brain requests cancelled before headers | Pacer wait: brain behind brain | brain behind warm | voice behind brain |
|---|---|---|---|---|---|
| v2-flashlite A | 92 / 46 / 26 | 61 | 24 waits, 12.2 s | 14 waits, 4.7 s | 9 waits, 1.8 s |
| v2-flashlite B | 60 / 46 / 4 | 32 | 0 | 4 waits, 3.9 s (the 4 call-start HEADs, below) | 14 waits, 2.3 s |
| v2-mai A | 96 / 0 / 24 | 64 | 28 waits, 14.7 s | 10 waits, 1.9 s | n/a (Azure voice) |
| v2-mai B | 61 / 0 / 0 | 34 | 0 | 0 | n/a |
| v2-54mini A | 0 / 51 / 28 (Azure brain, not paced) | n/a | n/a | n/a | 7 waits in all, 1.05 s (voice and warm) |

- Speculation starts a brain request on the caller's partial at each pause. Under the pacer, each one holds the next
  request back by up to 1 s, so the confirmed request starts late.
- "Brain behind brain" exists only in arm A: 24 and 28 waits there, 0 in B.
- B still has about 8 cancelled brain requests per call. That is ordinary turn-taking: a reply withdrawn because the
  caller kept talking.
- Arm A sends 1.5× (flashlite: 164 against 110) to 2.0× (mai: 120 against 61) the Vertex requests of arm B, which
  also counts against the 1 request per second commitment.
- **The call-start HEAD.** Since d353282, `CascadeSession.start()` calls the Gemini voice's `warm()`, which now sends a
  HEAD. It is unconditional, and VP_PREWARM=0 does not stop it. So every v2-flashlite call's opening brain request
  waits about 1 s, in both arms. See `redeploy-e9fdde3.md`.
- **None of this happens without the pacer.** In production, the speculative and real requests would run in parallel,
  and the bench's gain (end of turn 998 → 750 ms after questions) would be the expected effect. That gain was not
  measured here.
- So the flags are not shown to be wrong. They are shown to be wrong on a 1 request per second Vertex budget.

**Outliers.**
- v2-mai A k1: one reply took 15,894 ms. Vertex took 13.7 s to send response headers for that brain request, and its
  pacer wait was only 568 ms. That is a Vertex-side tail, like 23 Oct r1's stalls.
- v2-mai A k2: one reply took 6,756 ms. It had three discarded speculative brain requests ahead of it, a 952 ms pacer
  wait, then 2.7 s to headers.

## partialLagMs (for VP_BARGE_LONG_MS=500)

`partialLagMs` is the time from speech onset (VAD) to the recogniser's first partial: Azure Speech, Central India, ears
the same on all three stacks. The figures below are the raw lags from the probe; each call's median is also in
`timing.partialLagMs`.

| Set | n lags (calls) | p50 | p90 | min–max |
|---|---|---|---|---|
| All 27 probed calls (6 openings + 21 reply-gap) | 464 (27) | **858 ms** (p25 722, p75 1,028) | 1,145 ms | 99–1,397 ms |
| flashlite A / B | 69 / 68 (4 / 4) | 920 / 879 | 1,172 / 1,149 | |
| mai A / B | 70 / 69 (4 / 4) | 900 / 937 | 1,133 / 1,176 | |
| 54mini A / B | 72 / 13 (4 / 1) | 894 / 707 | 1,233 / 823 | |

- Share of lags above 300 ms: 97.4%. Above 500 ms: **96.3%**. Above 700 ms: **81.9%**. Above 900 ms: 46.1%.
- **What this means for VP_BARGE_LONG_MS=500. This is an inference, not measured on staging.** The bench found 500
  safe on nods only while partials lag about 300 ms, and that it "stops her on most nods at a 500 ms lag"
  (`product/voice/bench/results/turn-2026-10-23-dev-barge-sweep.md`).
  - Here the lag is above 500 ms 96% of the time. Below about 860 ms of speech, the recogniser has usually not said
    yet whether it is a nod.
  - So 500 would most likely stop her on nods on this path.
  - Even the default 700 ms sits below 82% of the lags.
- Not verified: lags on a real phone line (the sim caller streams 16 kHz clips over the media socket on the same VM),
  and nod false stops on staging (no nod clips were played).

## The judge in shadow

**What was set up.** `ops/judge_shadow.sh` configures the runtime's judge in mode `shadow` on Gemini 3.5 Flash-Lite
through Vertex (`judge.json` `model_recommended`), with no new resource:
- the Vertex global OpenAI-compatible endpoint, model `google/gemini-3.5-flash-lite`;
- a token minted on the VM from the existing service account;
- prices for the meter;
- a runtime-only systemd drop-in, removed on exit.

The batch would have run 12 calls. 8 on the defaults (flashlite 4, mai 2, 54mini 2) and 4 on flashlite with the
flags off, to separate the judge's share of the pacer from the flags' share. The probes (`k=judge` against `k=reply`)
measure, per reply, whether the verdict was in before her first sentence.

**It did not run, and staging is left with the judge off.** Two reasons:
1. **The product's daily test budget refused further test calls.**
   - At 01:52 UTC, `test.browser_call` answered "today's test budget is used up; it resets at midnight IST".
   - The rule (`server/modules/calls/tools.ts`): ₹200 per workspace per IST day, with a ₹50 reservation per call.
   - The IST day began at 18:30 UTC on 23 Oct, so it also counts 23 Oct's reply-gap runs and the e95ebc2 checks. The
     DB: ₹150.18 over 59 test calls today, ₹79.50 of it this job's 27 calls.
   - It stopped 3 of the 4 v2-54mini B calls before any call was made, and the whole judge batch.
   - Getting around it would take a new workspace, a DB edit or a code change. That would undo a spend guard working
     as designed, so it is left for the integrator. `ops/judge_shadow.sh` is ready to run after 18:30 UTC (about 12
     calls, about ₹33).
2. **It cannot be left on cleanly.**
   - The runtime's judge takes a static key (`VP_LLM_SAFETY_JUDGE_KEY`). A Vertex token lasts about an hour, after
     which every judge call would fail as `judge_unavailable: error`.
   - The brain and voice mint their own token from the service account; the judge has no such path.
   - The change belongs to the voice runtime: let the judge use `GoogleRoute`'s `VertexToken` when its URL is on
     Vertex.

**The window, estimated offline (not measured on calls).** The judge starts on the final, in parallel with the brain.
Its verdict is "in" if it arrives before her first sentence. The estimate takes:
- each reply's measured slack: first sentence minus final, from the runtime's timing, with the judge off;
- the judge's own latency: Flash-Lite from the VM, the DEV runs of `../judge-blind8` (n = 450 requests, p50 976 ms,
  12 timeouts counted as never in).

It gives the expected share of verdicts in before her first sentence:

| Stack, arm | Replies | Slack p50 (min–max) | Expected share in before her first sentence |
|---|---|---|---|
| v2-flashlite A | 22 | 1,693 ms (481–1,933) | 84% |
| v2-flashlite B | 23 | 931 ms (708–1,622) | **49%** |
| v2-mai A | 23 | 1,761 ms (1,053–14,490) | 95% |
| v2-mai B | 22 | 1,070 ms (769–1,309) | **58%** |
| v2-54mini A | 24 | 866 ms (354–1,385) | **38%** |

- The faster her first sentence, the less often the verdict is in. Arm A's high shares come from slower replies, not
  from a better judge.
- Without the pacer, B-like timing (or faster) is the likely case. Then about half of verdicts arrive before her first
  sentence on the Gemini stacks, and fewer on 54mini. The rest act from her next sentence or turn, as 0f8f965 designs.
- **On staging, the judge would cost the reply.** This is an inference from the code and the pacer, not measured.
  - On a final, `cascade.py` starts the judge's task just before the reply's brain task. So under the pacer the
    judge's Vertex request takes the slot first.
  - On v2-flashlite and v2-mai, her brain request would then wait up to 1 s on every reply.
  - That is why the batch had an arm B. It is also why a shadow judge on staging's Vertex should not be compared with
    judge-off gaps.

## What broke or needs a decision

1. **The latency defaults on a paced Vertex.** On staging they add 0.6 to 0.9 s to every Gemini-brain reply: the
   median rises from 2,301 to 3,201 ms on flashlite and from 2,054 to 2,658 ms on mai. They also send 1.5 to 2.0 times
   the Vertex requests.
   - The voice owner's choices are any of these:
     - turn speculation and prewarm off when Vertex is paced (an env setting on staging);
     - make the speculative request skip the pacer queue;
     - for the integrator or owner: decide that a HEAD with no model does not count against the commitment.
2. **The call-start HEAD (d353282).** It costs every v2-flashlite opening about 1 s on staging. It is unconditional,
   not behind VP_PREWARM.
3. **The daily test budget.** It blocked the judge batch and 3 calls of 54mini B. The guard worked as designed. It
   counts the IST day, so an evening UTC run and the next morning's share one budget.
4. **The runtime judge cannot hold a Vertex token** (above).
5. **v2-54mini B is incomplete:** n = 5 from 1 call. Its p50 is not comparable.

## Method

- **Tree.** Staging at e9fdde3 (`redeploy-e9fdde3.md`).
- **Agents.** New, from the renewal template at this head: `Reply gap e9fdde3 <stack>`. The same agents served both
  arms.
- **Caller.** `ops/tools/replygap.py`, the 23 Oct caller unchanged in clips, waits and playback simulation:
  - personas P1 (urban Hinglish) and P4 (elderly slow Hindi), six caller turns per call;
  - `test.browser_call`, which never dials a phone;
  - one call at a time.

  It now also records the opening's time to first audio and reads the runtime's `timing` for each call.
- **Runs.** `ops/run_gap.tmpl.sh`, one Run Command per stack and arm, in this order:

  | Run | Time (UTC) |
  |---|---|
  | flashlite A | 00:59–01:08 |
  | flashlite B | 01:09–01:17 |
  | mai A | 01:18–01:28 |
  | mai B | 01:28–01:38 |
  | 54mini A | 01:38–01:48 |
  | 54mini B | 01:49–01:51 |

  Each run restarts the runtime first, waits while the lab has used Vertex in the last 180 s, and refuses to start
  while staging has active calls.
- **Pacing.** Every request to `*aiplatform.googleapis.com` started at least 1.0 s after the previous one. Over the 1,259
  request starts since the 23 Oct start of the log, the minimum spacing measured is 1.000 s.
- **Probes.** `ops/tools/probes.py`, measurement only, as described in `redeploy-e9fdde3.md`.
- **Analysis.** `ops/analyze.py`, which writes `reply-gap.csv` (one row per reply, stages and pacing included) and
  `reply-gap-summary.json`.

## Spend (metered, the control plane's cost lines)

Reply-gap calls ₹60.65:
- flashlite A ₹9.52, B ₹9.07;
- mai A ₹13.85, B ₹12.87;
- 54mini A ₹12.92, B ₹2.42.

The job's total, with the openings and the judge evals, is in `../judge-blind8/README.md`.

## Files

- `reply-gap.csv`: one row per reply (119 rows). It holds the runtime's stages and marks, pacing waits by kind, and gap
  minus pacing.
- `reply-gap-summary.json`: per stack and arm. It holds the stats, stage and mark medians, partial lag, request counts,
  contention and cost.
- `reply-gap-calls.jsonl`: one row per call (24, 3 of them refused by the budget). It holds the gaps, cost, the opening
  timing and the runtime's `timing` block.
- `ops/run_gap.tmpl.sh`, `ops/judge_shadow.sh`, `ops/analyze.py`, `ops/final_health.sh`, and `ops/tools/` (the caller,
  probes, pacer and launcher).
