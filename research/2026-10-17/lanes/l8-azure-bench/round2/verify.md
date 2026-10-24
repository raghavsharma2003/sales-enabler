# Verification of r2-latency-india (round 2): adversarial pass

Verifier pass on 2026-10-17. Scope: the 8 load-bearing findings of package `r2-latency-india`. Method:

- I recomputed every headline statistic from the raw rows with my own code (numpy percentiles and a fresh bootstrap), not with `analyze_r2.py`.
- I re-derived the pause classes from the 8 kHz audio. There were 0 mismatches against `clip_pauses.csv`.
- I re-read the cited Microsoft pages.
- I re-ran the ARM Models API read for `southindia` (read-only GET, this session).
- I tested the speculation matcher from `harness/cascade.py`.

Nothing else in the package was edited.

## Verdicts at a glance

| # | Finding | Verdict | One-line reason |
|---|---|---|---|
| 1 | Config A: p50 1,004 ms, 58/58 ≤ 1.5 s | **weakened** | The numbers reproduce, but "58/58" hides 2 unanswered elderly turns. A's 25-27% collision rate fails another part of kill criterion 6. |
| 2 | Speculation (E): p50 823 ms, paired −224 ms | **confirmed** | The numbers reproduce. There is an extra hazard that wasn't priced in: the release matcher accepts truncated and negated transcripts. |
| 3 | B, D and F fail 1.5 s | **weakened** | B does not fail: p50 1,348 and p90 1,454, with 56/57 ≤ 1.5 s. "6-sol only off the critical path" is extrapolated from one segmentation setting. |
| 4 | LLM TTFT from Central India | **confirmed** | All 11 arms reproduce (n=33 each). The data come from one 8-minute window on a Saturday night. |
| 5 | gpt-4.1-mini lifecycle: Legacy, 2027-04-14 | **weakened** | The API says Legacy, but Microsoft's retirement schedule says **Deprecated**, which blocks new subscriptions. Microsoft does state that the auto-upgrade adds the replacement to the SKU. |
| 6 | STT endpointing | **weakened** | The latencies reproduce. "6/10 finals inside 0.7-0.9 s pauses" is miscounted: the true figure is 3/10 below the timeout. |
| 7 | Voice Live and residency options | **confirmed** | The regions page, the deployment-types page and a live API read all match. |
| 8 | Turn-taking buckets | **confirmed** | The buckets reproduce. 6-sol gave "go on" prompts 12/12 by my reading (the package says 11/12). The counter misses a few talk-overs, and the proposed kill-criterion change is a relaxation. |

---

## 1. Config A, India-hosted cascade: weakened

**Reproduced exactly from `cascade_main_turns_s1.csv` and `s7.csv`** (60 main turns: P1, P2, P4 × 10 clips × 2 passes):

| Statistic | Value |
|---|---|
| p50, all turns | 1,004 ms (bootstrap 983-1,017) |
| Session-cluster CI | 979-1,030 |
| p90 | 1,100 ms |
| Clean turns (say/short) | n=48, p50 1,004, CI 989-1,017, p90 1,105 |
| Elderly persona (P4) | p50 1,009 ms, n=18 |
| Clip-cluster bootstrap (my addition) | p50 986-1,027, p90 1,068-1,171 |

The configuration described in the claim matches `cascade.py`, `r2common.py` and `resources-created.csv`:

- STT: Central India, hi-IN, 500 ms segmentation.
- LLM: gpt-4.1-mini on a South India Standard deployment with the async filter.
- TTS: hi-IN-SwaraNeural at 8 kHz mu-law.

**Problems:**

1. **"58/58 at or under 1.5 s" excludes 2 of 60 turns that got no reply at all.** Both are the elderly clip `P4_t08` ("हम्म…", 0.45 s), in both passes. Azure STT produced no transcript for it in any STT arm or any cascade configuration, so the agent stayed silent until the 12 s deadline. The honest statement is: **58/60 turns answered, all 58 within 1.5 s; the elderly persona was answered on 18/20 turns.**
2. **The cited CI (984-1,017), session-cluster CI and p90 (1,100) are all-turn statistics, not clean-turn ones.** The clean-turn values are CI 989-1,017 and p90 1,105. This is immaterial to the conclusion.
3. **What is timed is mostly a 1-2 word acknowledgement.** 48 of the 58 first clauses are one or two words, such as "जी हाँ,", "धन्यवाद," and "ठीक है,". Two things were not measured:
   - how long it takes to reach substantive content;
   - whether there is a gap between the first clause and the second.
4. **"Clean" means turn type, not an uncontaminated turn.** 14 of the 50 say/short turns had agent audio released while the caller was still speaking.
5. **The callers are Azure Neural TTS voices, not people** (`battery.json`):
   - P1 is hi-IN-KavyaNeural.
   - P2 is hi-IN-MadhurNeural with a market noise bed.
   - P4 "elderly" is hi-IN-AartiNeural at −28% rate and −6% pitch.

   Azure STT transcribing Azure TTS is a best case for both recognition and endpoint regularity.
6. **The proposed synthesis change overreaches.** Kill criterion 6 (SYNTHESIS §1.2) is "clean-turn p50 ≤ 1.5 s, **collisions ≤ 5%**, …". Config A had premature cut-ins on 15/60 turns (25%, CI 16-37%), or 16/60 (27%) under l4b's collision definition. The latency part of the criterion is met server-side. Criterion 6 as written is **not** met by A, nor by any configuration tested (18-50%).

**Correct wording:** "Latency part of kill criterion 6 met server-side from India (clean p50 1.0 s, no telephone leg, synthetic callers). Collision part failed: 25% of turns."

## 2. Speculation (config E): confirmed, with an uncosted hazard

**Reproduced:**

| Statistic | Value |
|---|---|
| p50 | 823 ms (my CI 729-865; the package's is 733-865) |
| p90 | 1,029 ms |
| Paired against A on the same (clip, pass) | median −224 ms (CI −259 to −149), n=58, E faster on 52/58 |
| Clip-cluster paired CI | −264 to −142 |
| Responses per turn | 3.65 (E) vs 1.87 (A) |
| Cut-ins on pauses of 0.5-1.3 s | 10/10 + 18/18 = 28/28 |
| Cut-ins on the ≥ 2 s pause | 12/12 |

`SPEC_MS` was not overridden in the job scripts, so the default of 250 ms applied.

**Not priced in by the claim:**

- **Truncated transcripts can pass the release check.** The audio-release check `similar()` (SequenceMatcher ratio ≥ 0.85 plus equal digits) accepted speculative replies built on truncated transcripts on 3/58 of E's used turns. Examples are P2_t01 and P4_t01 ×2, where the reply was generated without the last 1-2 words.
- **The matcher also accepts negation flips.** I passed four constructed Hindi pairs through the verbatim function, e.g. "मुझे renewal करना है" vs "मुझे renewal नहीं करना है". It returned "similar" on 4/4, with ratios 0.87-0.93. Hindi is verb-final, so a negation often arrives in the last word. A held reply for "I want to renew" can therefore be released after a final that says "I don't want to renew".
- **Speculation roughly doubles LLM token use, so rate limits bind sooner.** An earlier run of the same deployment with about 3 concurrent sessions hit `429 … exceeded token rate limit` on 25-61 responses per stream (`cascade_v2rl429_*`).

**Design rule should read:** pause-aware release **and** a negation/semantic-aware match, never a string-similarity threshold alone.

## 3. "Configs that fail 1.5 s": weakened

| Config | Measured | Verdict on the claim |
|---|---|---|
| D | p50 1,546, clean p50 1,591, 26/58 ≤ 1.5 s | Reproduced; fails at p50 |
| F | p50 1,360, p90 1,631, 41/59 ≤ 1.5 s | Reproduced; passes the p50 bar, fails at p90 |
| B | p50 1,348, p90 1,454, clean p50 1,344, 56/57 ≤ 1.5 s | **Does not fail**, server-side at p50 or p90 |

B has only about 150 ms of headroom at p90, so it would probably fail once a telephone leg is added. That is not what the claim says.

**"6-sol only fits off the critical path" is extrapolated.** D was tested only with 800 ms segmentation plus speculation. Moving from 800 ms to 500 ms with speculation (C to E) measured a paired −250 ms. Applied to D, that gives roughly 1.3 s p50: an untested arm that might pass the p50 bar.

Much of D's gap is the EU route: TCP connect to France Central was 124 ms from the India VM, against 26 ms to South India. gpt-6-sol has no DataZoneStandard SKU in South India per today's API read. 5.6-sol and 6.1-sol do, and 6.1-sol measured a 1,814 ms TTFT with reasoning effort 'low'.

## 4. LLM TTFT from Central India: confirmed

All 11 arms reproduce from `llm_india.csv`:

- n=33 each, 0 errors.
- Median prompt length 1,643-1,668 tokens.
- `x-ms-region` matches the claim for every arm. The sin-gs nano arm was served from South India.
- Timestamps 17:08:16-17:16:27 UTC = 22:38-22:46 IST. 2026-10-17 is a Saturday.

| Arm | p50 TTFT (ms) | CI | p90 |
|---|---|---|---|
| sin-std gpt-4.1-mini | 304 | 298-322 | 387 |
| sea-gs gpt-5.4-nano | 577 | | |
| sin-gs gpt-5.4-nano | 745 | | |
| sea-gs gpt-5.4-mini | 773 | | |
| sea-gs gpt-4.1-mini | 774 | | |
| sea-dzapac gpt-5.4-mini | 784 | | |
| frc-dzeu DeepSeek-V4-Flash | 816 | | |
| frc-dzeu gpt-6-luna | 883 | | |
| frc-dzeu gpt-6-sol | 1,005 | | |
| sea-dzapac gpt-6.1-sol | 1,814 | | |

The gpt-6.1-sol smoke test returned a 400 error: "reasoning_effort does not support 'none' … Supported values are: 'low', 'medium', 'high', and 'xhigh'", so 'minimal' is excluded as well.

**Caveats:**

- This is one 8-minute window, off-peak.
- The Standard SKU is best-effort ("throughput might be limited", per the deployment-types page), and it rate-limited at about 3 concurrent sessions earlier that evening.
- The reversal "India-only costs latency" holds for this window only. It needs a weekday-peak repeat.

## 5. gpt-4.1-mini lifecycle: weakened

**My own read of the Models API today agrees with the package** (`southindia`, api-version 2024-10-01). gpt-4.1-mini 2025-04-14 shows `lifecycleStatus: "Legacy"`, with Standard SKU `deprecationDate` 2027-04-14T00:00:00Z.

**But Microsoft's Model retirement schedule disagrees** (learn.microsoft.com, ms.date 2026-09-21). It lists gpt-4.1-mini 2025-04-14 as **"Deprecated"**, retirement 2027-04-14, replacement "—".

The lifecycle page (ms.date 2026-07-24) defines Deprecated as "No longer available to new customers … determined at the subscription level: whether that Azure subscription has ever deployed the specific model version". So:

- **New subscriptions may be blocked.** If the schedule is right, a production subscription that has never deployed gpt-4.1-mini, such as a fresh grant subscription, may be unable to create this deployment. The research subscription had used 4.1-mini before.
- **The upgrade wording is half right.** The lifecycle page says auto-upgrades "can occur even if the new model version isn't yet separately available in that region, or for that SKU — the upgrade process will make it available". So Microsoft does say a replacement will be placed on the Standard SKU. What is unstated is *which* model it will be, and its latency.
- **India has no later-dated fallback.** The only Standard (India-geography) chat models in South India are gpt-4.1-mini 2025-04-14 and gpt-4o 2024-11-20. Both are Legacy and both retire 2027-04-14.

The re-benchmark trigger of 2027-01-14 (90 days before retirement) is sensible. Add a check that the production subscription can still deploy the model at all.

## 6. STT endpointing: weakened

**Reproduced from `stt_india.csv`:**

| Arm | Final after speech end, p50 (ms) | CI | p90 |
|---|---|---|---|
| Central India, 300 ms | 450 | | |
| Central India, 500 ms | 622 | 608-632 | |
| Central India, 800 ms | 985 | | |
| Central India, Semantic | 848 | | 1,609 |
| Southeast Asia, 500 ms | 677 | | |

The first partial arrived 924-926 ms after speech start in Central India.

The finals are computed over n=29, not 30: P4_t08 produced no final in any arm.

**The "6/10 clips with finals inside 0.7-0.9 s elderly pauses" is miscounted.** At 800 ms, 6/10 P4 clips had a mid-turn final, but:

- 3 of those 6 clips had a pause at or above 0.9 s, where an 800 ms timeout is expected to fire: P4_t03 (2.42 s), P4_t04 (0.92 s) and P4_t09 (0.90 s).
- Finals inside pauses shorter than the timeout occurred on **3/10** clips: P4_t01 (longest pause 740 ms), P4_t05 (780) and P4_t11 (720).

Pause lengths come from an energy VAD set 35 dB below the clip's peak. The doc defines the timeout as how much "nonspeech audio" is allowed and says it "generally" works, so some of these finals may reflect Azure's non-speech differing from the energy VAD. The conclusion that the timeout is not a guarantee still holds, on 3/10 clips.

Microsoft's how-to page also says Semantic segmentation "shouldn't be used in … interactive scenarios".

## 7. Voice Live and residency: confirmed

**Speech regions page** (ms.date 2026-10-08), Voice Live tab, row `centralindia`:

- HD voices: Regional.
- mai-transcribe-2: Global.
- mai-transcribe-2-streaming: "-".
- gpt-4o, gpt-4.1-mini, gpt-realtime-regional and gpt-realtime-2.1-regional: Regional.

Row `southindia` lists mai-transcribe-2-streaming as Global. It is also offered in several US and EU regions, so "only in South India" means only among Indian regions.

**Deployment types page** (ms.date 2026-08-06):

- Data Zone covers "US, EU, or Asia Pacific (APAC)".
- Standard: "processed within the customer-specified Azure geography".

**Live API read:** DataZoneStandard SKUs exist in South India for gpt-5.4-mini and gpt-6.1-sol. Standard SKUs exist for gpt-4.1-mini and gpt-4o (2024-11-20 only).

## 8. Turn-taking: confirmed, with caveats

**Every bucket reproduces from the raw rows and the re-derived pause classes:**

| Bucket | Result |
|---|---|
| No pause ≥ 0.5 s | 0/30 in every config |
| Pause 0.9-1.3 s | A 13/18, B 3/18, C 14/18, D 4/18, E 18/18, F 4/18 |
| Elderly 2.4 s pause | 12/12 in every config |

**Replies in the 2.4 s pause.** All 12 gpt-6-sol replies were continuation prompts by my reading, e.g. "जी, बोलिए।", "जी, आपकी policy, आगे बताइए?" and "जी, आपकी policy?". So 12/12, not 11/12. gpt-4.1-mini (configs A, B, C, E) and gpt-5.4-nano (config F) gave content replies on 12/12.

**Caveats:**

- **The cut-in counter misses some talk-overs.** It counts agent audio only when the caller resumes afterwards. Audio released during the caller's last speech segment, never cancelled and not counted, was found in 7 turns, all P4_t01 or P4_t05:

  | Config | Uncounted talk-overs | Corrected 0.5-0.9 s bucket |
  |---|---|---|
  | A | 1 | 1/10 (not 0/10) |
  | B | 2 | 6/10 |
  | C | 2 | 6/10 |
  | F | 2 | 8/10 |

- **The proposed "companion" is a relaxation.** Kill criterion 6 already contains "collisions ≤ 5%". The proposal (≤ 10% on mid-turn pauses) loosens it and narrows its scope; it does not add a new test.
- **Collision rates by l4b's definition** (spoke during the clip, or replied in under 250 ms), main turns:

  | Config | Collisions |
  |---|---|
  | A | 16/60 (27%) |
  | B | 11/60 (18%) |
  | C | 22/60 (37%) |
  | D | 13/60 (22%) |
  | E | 30/60 (50%) |
  | F | 14/60 (23%) |

- The callers are synthetic TTS voices, as noted in finding 1.

## Files and commands used

**Package results** (`/home/user/sales-enabler/research/2026-10-17/lanes/l8-azure-bench/round2/results/`):

- `cascade_main_turns_s1..s7.csv`
- `cascade_main_resp_s1..s7.csv`
- `cascade_main_summary.csv`, `cascade_main_paired.csv`, `cascade_main_by_persona.csv`, `cascade_main_cutins_by_pause.csv`
- `clip_pauses.csv`
- `stt_india.csv`
- `llm_india.csv`, `llm_smoke.csv`
- `cascade_v2rl429_resp_s*.csv`

**Package harness** (`…/round2/harness/`): `cascade.py`, `stt_bench_india.py`, `llm_bench_india.py`, `r2common.py`, `vadutil.py`, `gate.py`, `battery.json`.

**Run scripts:** `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/r2lat/job_main.sh` and `job_main2.sh` (checked for env overrides and concurrency).

**Verifier scripts** (`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/verify/`):

- `recompute.py`
- `cut.py`
- `sim.py`
- `models_read.py`, `std_read.py` (read-only ARM GET)

**Web sources:**

- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/model-retirements (ms.date 2026-07-24)
- https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule (ms.date 2026-09-21)
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions (ms.date 2026-10-08)
- https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types (ms.date 2026-08-06)
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-recognize-speech?pivots=programming-language-python (ms.date 2026-01-30)
