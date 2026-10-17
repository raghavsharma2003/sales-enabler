# l2-economics: adversarial verification

Verifier pass, 2026-10-17. I re-ran `cost-model.py` in the scratchpad. It is deterministic and its JSON is
byte-identical to the lane's. I recalculated `cost-model.xlsx` in LibreOffice, and the Model sheet equals Python in
every scenario column. I re-queried the Azure Retail Prices API live, re-opened the vendor and telephony pages and
re-read the Apna data. I did not edit the lane's other files and made no commit.

Limits of this pass:
- The web-search budget for this turn was exhausted, so independent sources came from direct fetches of primary
  pages and APIs.
- AmbitionBox, Indeed India and Glassdoor returned HTTP 403, so the salary figures could not be cross-checked
  against an aggregator.
- `report.md` is not on disk (the harness blocked it), so I checked only the claims and the files.

## Verdict table

| # | Claim (short) | Verdict | Corrected statement |
|---|---|---|---|
| 1 | Managed Azure "at the measured quality bar" ₹4.53/min at 100k min/month | **weakened** | The central estimate is **₹5.9/min** (MC p50; p10–p90 ₹5.0–7.0). ₹4.53 is the all-modes base case and sits **below the MC p10**. The stack has **not** met the latency bar. |
| 2 | Managed sol-class floors at ~₹2.3 and never reaches ₹2 up to 50M min/month | **confirmed** (refined) | The floor is ₹2.1–2.3 once volume commitment tiers are applied. P(≤₹2) is ≈ 0.01 even then. With the faster 6-sol model it is ₹2.5 at 1M min/month. |
| 3 | Three paths to ≤ ₹2 | **weakened** | Each single path reaches ₹2 only in its base case. MC medians: (a) ₹2.12, (b) ₹2.39, (c) ₹2.09; P(≤₹2) 0.29 / 0.05 / 0.36. Only (a)+(c) clears ₹2 robustly (MC p50 ₹1.16). The NVIDIA AI Enterprise (NVAIE) licence is omitted. |
| 4 | Top movers: LLM tier, ear billing, volume | **confirmed** | Reproduces. LLM tier and ear billing are tied in scenario B (range ₹0.874 vs ₹0.871). The ranges are mostly assumptions. |
| 5 | Indian list prices cluster at ₹3–6/min | **confirmed** (minor corrections) | The cluster holds. SquadStack's ₹2–5 is a generic statement on its FAQ, not its rate card. Bolna's 6¢ excludes telephony and its platform fee. Effective prices at volume are probably ₹2–2.5 (secondary sources, unverified). |
| 6 | Apna telecaller pay: median ₹17,000 (n=1,234) | **confirmed** | Reproduces exactly, and a live spot-check matches. Caveats: 27 city slugs, not 28; about 14 distinct metro areas have n ≥ 15; some cities have small n. |
| 7 | In-house telecaller ₹8.9 per productive connected minute | **weakened** | The model reproduces, but ₹8.9 is high-side. All three of the lane's own cross-checks are lower (₹5–8, ₹5.14, ₹7–8). At their basis of ~200 talk-min/day the same model gives ~₹6.3. A defensible central range is ₹6–9. |
| 8 | Per-outcome AI vs human comparison and break-evens | **weakened** | Figures are 1.5–2% off the JSON. Outcome parity between AI and human is assumed. If the human cost is ~₹6.3/min, lead qualification at ₹3.5/min and 2.5 min per call is **not cheaper** than a human. |

## Claim-by-claim reasoning

### 1. Scenario A: ₹4.53 per connected minute

**What checks out**

Unit prices, re-queried live from the Retail Prices API on 2026-10-17:

| meter | price |
|---|---|
| Voice Live Std speech audio input, centralindia | $0.015 per 1K tokens |
| Voice Live BYO speech audio input | $0.0125 per 1K tokens |
| Neural HD TTS | $22 per 1M characters (effective 2026-03-01) |
| S1 STT | $1.00 per hour |
| 6-sol Global Standard (eastus2): input / cached / cache-write / output | $2.00 / $0.20 / $2.50 / $10 per 1M tokens |

Other checks:
- Plivo India is ₹0.38/min with a 30 s pulse and ₹200/month per number (plivo.com/voice/pricing/in, read 2026-10-17).
- FX ₹95 is right. ECB reference rates were 94.96–95.78 on 12–16 Oct 2026; open.er-api gave 95.11 on 17 Oct.
- The components recompute to these values:

| line | ₹/min | how it is made up |
|---|---|---|
| telephony | 0.477 | 0.38 × 1.125 pulse loss + 200/4000 |
| ASR | 0.855 | |
| LLM | 1.297 | |
| TTS | 0.92 | |
| infra, storage, observability | 0.075 | |
| fixed platform | 0.76 | $800 × 95 / 100k |
| support | 0.15 | |

- A0 is ₹5.33.
- $0.027 × 95 = ₹2.57.
- The Voice Live rate of 10 tokens/s traces to Taxila `docs/research/duplex-2026-10/BAKEOFF.md`: "9 audio tokens for 0.97 s". That is a single measurement, and it is not in `docs/harvest/` as the code comment implies.

**What does not hold**
- **The headline is the optimistic case.** The Monte Carlo uses triangular ranges skewed to the right:

  | input | low / mode / high |
  |---|---|
  | fixed platform | $300 / 800 / 2500 |
  | echo-reference factor | 1 / 1 / 2 |
  | recording MB | 0.12 / 0.24 / 1.92 |
  | cache hit | 0.60 / 0.85 / 0.92 |

  The base takes every mode, so it lands below the MC p10 (4.53 < 5.00). The decision-relevant number is the p50 of
  ₹5.88. At the mean fixed cost of $1,200/month, the fixed line alone is ₹1.14, not ₹0.76.
- **"At the measured quality bar" overstates.** The harvest's D5 stack (Voice Live as the ear) failed end-of-turn
  latency: p50 1480 ms against a 900 ms bar. Voice Live also returned **empty transcripts on 5 of 14 short answers**
  ("हाँ"). The harvest recommends a second ear for short bursts, and the model does not cost it. See
  `docs/harvest/tx-voice.md` §6.2 and §8.

### 2. Managed floor ≈ ₹2.3; never ≤ ₹2

**Reproduced**
- Volume curve: ₹9.97 / 3.08 / 2.39 / 2.32 at 10k / 100k / 1M / 10M min/month.
- No ₹2 crossing up to 50M.
- MC p50 ₹3.06 and P = 0.00 at 1M min/month.
- B-HD: ₹2.77.

**Stress tests**
- **Commitment tiers.** The volume curve keeps the 400M-character TTS commitment at every volume. Meanwhile:
  - At 1M min/month only ~330M characters are used, so the 400M tier is under-filled (about +₹0.07).
  - At 10M min/month and above, the 4000M tier ($6 per 1M) applies.
  - The Speech-to-Text 100K-hour commitment ($0.40/hour, ₹0.63/min) is cheaper than Voice Live BYO (₹0.71).

  With both changes, the base is ₹2.12 at 10M and ₹2.12 at 50M. The MC at 10M gives p50 ₹2.49 and P(≤₹2) = 0.011.
  So the floor is ₹2.1–2.3 and the conclusion stands.
- **6.1-sol latency.** The harvest's own bake-off measured 6.1-sol at 3294 / 9461 ms (p50 / p95) to the first
  speakable clause, against 1475 / 2416 ms for 6-sol (n = 30 each; `tx-voice.md` §6.1). At the latency bar the
  speaking model should be 6-sol, which gives B ₹2.50 at 1M min/month.
- **Not tested.** Provisioned throughput (PTU) for the LLM is not modelled. It is the one lever that could still move
  the managed floor at 10M+ min/month.

### 3. Three ≤ ₹2 paths

**Reproduced**

Base values and crossing volumes:

| path | base ₹/min | MC p50 | P(≤₹2) | first reaches ₹2 at |
|---|---|---|---|---|
| (a) B-luna | 1.691 | 2.12 | 0.29 | 199k min/month |
| (b) C | 1.966 | 2.39 | 0.05 | 912k min/month |
| (c) D | 1.708 | 2.09 | 0.36 | 2.95M min/month |
| (a)+(c) D-lite | 1.010 | 1.16 | 1.00 | 1.47M min/month |

Vendor capacity figures, re-checked:
- NVIDIA Riva 2.15.0 Hindi Conformer-CTC, streaming low-latency, 160 ms chunk with an n-gram LM: maximum effective
  streams are T4 50, A10 116, A100 233, H100 366. I parsed the tabbed tables from the live Riva performance page.
- Magpie TTS Multilingual (HF blog, 2026-08-10) lists Hindi. On H100 it serves 64 streams at time-to-first-audio
  275 ms and RTFX 290.79. It publishes **no Hindi quality metric**.

**What does not hold**
- **Probability.** By the lane's own MC, each single path is more likely than not to land **above** ₹2.
- **NVAIE licence omitted.**
  - `P["nvaie_per_gpu_hr"]` is defined in the code but never used.
  - The lane's own `gpu-throughput.csv` notes that "production needs NVAIE licence for Riva".
  - NVIDIA's NIM page says self-hosting is for "development and testing" and "when ready for production … NVIDIA
    AI Enterprise".
  - The stream counts are Riva/NIM-stack benchmarks, so either the licence applies or a non-NIM stack's throughput
    has to be measured.

  Adding $4,500 per GPU-year gives:

  | path | base ₹/min | crossing volume |
  |---|---|---|
  | C | 2.06 at 1M | 1.23M |
  | D | 1.74 | 3.14M |
  | D-lite | 1.04 | 1.58M |

- **3-year reservations.** D's ₹1.71 assumes 3-year reserved instances on 4× H100 NVL. That is a commitment of about
  **$565k** for a company that has no customers yet. With other terms:

  | GPU term | D base ₹/min | crossing volume |
  |---|---|---|
  | 3-year reserved (lane) | 1.71 | 2.95M |
  | 1-year reserved | 1.82 | 3.72M |
  | on demand | 1.95 | 4.66M |

### 4. Sensitivity

The tornado and lever-swap figures in `tornado.png` and the JSON reproduce:
- Swapping the LLM moves B from ₹1.69 to ₹2.565.
- The ear ranges ₹0.71–0.86 on Voice Live, ₹1.58 on S1 STT and ₹0.04 self-hosted on T4.
- Billing the echo-reference channel adds ₹0.71.
- HD TTS adds ₹0.38; the telephony plan moves cost by about ₹0.2.

Three nuances:
- The ear-billing range in B (₹2.389 → 3.26, a span of 0.871) ties the LLM-tier range (0.874). Ranks 1 and 2 are a
  tie, not an ordering.
- The echo-reference billing is marked unknown [U] in BAKEOFF §5b.
- A's top driver, fixed platform cost, is a pure assumption (300–2500 USD/month).

### 5. Vendor list prices

All pages were re-opened on 2026-10-17.

| vendor | what the page says | finding |
|---|---|---|
| Sarvam | ₹3.50 / 3.25 / 3.15 / 3.00 per min, 60 s pulse | ✓. Business tier is "coming soon"; telephony ₹0.20 per 30 s pulse = ₹0.40/min; prices exclude GST |
| Ringg | ₹6 per connected minute | ✓. Includes telephony, STT, TTS and LLM; monthly minimum unstated; number ₹499/month |
| Bolna | 6¢ (₹5.52) standard; about 4.5¢ (₹4.15) on larger top-ups; pilot $500 for 12,000 min | ✓, but the page says **telephony and the platform fee are extra**, so this is not all-in |
| SquadStack | "Voice AI in India is priced … typically between ₹2 and ₹5 a minute"; dialler and telephony bundled | The quote is a **market statement in an FAQ**, not SquadStack's rate card |
| Ravan | Lite $0.10 (≈ ₹9.5) down to Scale $0.04; enterprise $0.02–0.04 | ✓ |
| Retell | $0.07–0.31 | ✓ |
| Vapi | hosting $0.05/min | ✓ |
| Smallest | $0.09–0.21 | ✓. The lane's CSV note "hosting 0.05" is wrong: PAYG hosting is $0.01/min, and $0.05 is the enterprise all-in "as low as" figure |

The secondary newsletter (indiafintech substack, 2026-10-06) gives Bolna enterprise at ₹1.75–2 and "voice AI at
scale" at ₹2.5. Neither figure is traceable to a primary source. Two consequences:
- The **effective** competitive price at volume may sit well below the ₹3–6 list cluster.
- Vendors bill in 60 s pulses, which inflates the price per actual minute by about 25% on 2-minute calls. That has to
  be accounted for before comparing their price with our cost per exact minute.

### 6. Apna salaries

**Reproduced from `data/apna-telecaller-jobs.jsonl`**
- 2,420 cards deduplicate to 1,234 unique postings.
- Band mid-points: p10 ₹12,000, p50 ₹17,000, p90 ₹22,500.
- Tier-1 metros n = 855 (median ₹17,500); tier-2/3 n = 368 (median ₹14,000).
- The city medians match the claim.
- The live apna.co Mumbai page 1 on 2026-10-17 shows the same first 10 cards in the same order as the saved data
  (Candidate Express ₹15–25k, Lifecare ₹15–25k, …). This is a genuine measurement.

**Caveats**
- There are 27 city slugs, not 28.
- City pages are heavily cross-listed: about half the cards are located outside the city the page is for. For
  example, the Nagpur pages hold 136 cards, of which 6 are in Nagpur. The lane handled this correctly by assigning
  each posting to the city in its locality.
- "20+ cities" counts overlapping sub-areas: Mumbai/Bombay, Mumbai Metropolitan, Thane and Navi Mumbai; New Delhi,
  Delhi-NCR, Noida and Gurgaon. That leaves about 14 distinct metro areas with n ≥ 15.
- Small n: Bhopal 15, Thane 15, Gurgaon 15, Lucknow 27.
- 79 part-time cards are included.
- The deduplication key includes salary, so one employer can appear several times. Candidate Express, a staffing
  agency, has 19 postings.
- Bands are advertised, and their upper ends often include incentives.
- The xlsx Telecaller sheet uses ₹18,000, labelled as the "median of band mid-points". The measured median is ₹17,000.

### 7. Telecaller cost per minute

The MC reproduces: p50 8.86 (p10–p90 6.60–12.15), ₹14.17 per call, and ₹66.96 per qualified lead (43.96–106.25).

**But the central value is above every independent figure the lane cites.**
- The 2026-10-06 newsletter derives ₹5–8 per connected minute, using ₹6 as its working figure and about 200
  talk-minutes per day.
- MarketMapMondays gives ₹5.14 for a ₹13k caller.
- Inc42 is cited at ₹7–8.

The lane's talk-time mode is 150 min/day (2.5 h). At 200 min/day, the lane's own medians give
₹30,310 / 4,800 ≈ **₹6.3/min**.

**Other inputs lean high for an SMB buyer**
- 13% statutory loading (informal SMBs pay about 0).
- A ₹5,000 seat.
- A dialler licence for every caller.

**Weak sources**
- The per-call figure rests on Callyzer's 1.6-minute average. That is a vendor blog (published 2023, updated
  2026-08-10, "5 crore telecalls across 12,000+ numbers"), and the brief disallows vendor blogs as primary evidence.
- The 10–35% qualified share is an assumption.

### 8. Per-outcome comparison

**Figures differ from the JSON** (`buyer_outcome_compare`) by 1.5–2%:

| | claim | JSON |
|---|---|---|
| human ₹ per outcome: lead / EMI / appointment / COD | 72 / 41 / 12.8 / 7.9 | 70.8 / 40.5 / 12.65 / 7.81 |
| break-even ₹/min | 4.8 / 7.2 / 9.0 / 6.7 | 4.72 / 7.08 / 8.86 / 6.64 |

The ₹72 per lead also conflicts with claim 7's ₹67 per qualified lead.

**The comparison assumes the AI achieves the same outcome share as a human.** That is unmeasured, and every
break-even scales linearly with it.

**Re-run at a human cost of ~₹6.3/min:**

| call type | human ₹ per outcome | AI break-even ₹/min |
|---|---|---|
| lead qualification | 50 | 3.4 |
| EMI reminder | 29 | 5.0 |
| COD confirmation | 5.6 | 4.7 |
| appointment reminder | 9.0 | 6.3 |

On that basis, lead qualification at ₹3.5/min with 2.5-minute calls costs ₹52.5 per lead, more than the ~₹50 human
cost. The "2.1–2.6× cheaper" claim needs AI calls to be 1.6 minutes long **and** to qualify at the human rate.

## Lane quality notes

1. **The base case is presented as the headline.** With right-skewed triangular inputs, the base sits below the MC p10
   in A, and every single ₹2 path has its MC median above ₹2. Headlines should quote the MC p50.
2. **The NVAIE licence is omitted** for the Riva/NIM-based self-host paths, although the lane's own data note flags
   it.
3. **Commitment tiers are not stepped with volume.**
   - TTS: the 400M tier is under-filled at 1M min/month, and the 4000M tier is ignored at 10M+.
   - STT: the 100K-hour commitment is ignored.
   - LLM: PTU is not evaluated.
4. **Scenario B's speaking model was chosen for cache price** (6.1-sol), although the harvest measured it as much
   slower than 6-sol.
5. **Data residency is unpriced.** The Retail API on 2026-10-17 has no centralindia regional meter for the GPT-6
   family, so inference runs Global Standard or in an EU/US Data Zone. That matters for RBI-regulated lending.
6. **Number-series compliance is unpriced.** The cost of 140/160-series (BFSI 1600-series) numbers is not modelled. The
   Tata Smartflo page does not say whether AI or bulk outbound is allowed on the unlimited FUP plan.
7. **Thin TTS measurements.** TTS characters per minute were measured once per voice, on one passage. DragonHD had a
   time-to-first-byte of 20–23 s over non-streaming REST.
8. **Missing comparison: what COD and reminder calls are actually replaced by.** IVR and WhatsApp automation is not
   costed, so telecallers may be the wrong baseline for those two call types.
9. **Smaller items**
   - Vendor prices exclude 18% GST.
   - Vendor 60 s pulses are not normalised when comparing their price with our cost.
   - The 3-year GPU commitments in D need about $565k of reserved capacity, which is a financing question.
10. **No fabricated numbers found.**
    - Every Azure, GPU, telephony, vendor and FX figure I re-checked matches its source.
    - The Apna data matches the live page.
    - The xlsx recalculates in LibreOffice to the Python values.
    - The only untraceable inputs are the secondary Bolna ₹1.75–2 (already flagged by the lane) and Inc42 "as cited".

## Sources re-opened by this pass (2026-10-17)

- Azure Retail Prices API (`prices.azure.com/api/retail/prices`): Voice Live, Speech, GPT-6 family and GPU VM meters,
  re-queried live.
- NVIDIA Riva ASR performance page, Riva 2.15.0 Hindi Conformer tables:
  https://docs.nvidia.com/deeplearning/riva/user-guide/docs/asr/asr-performance.html
- NVIDIA NIM page, development vs production licensing: https://developer.nvidia.com/nim
- Magpie TTS Multilingual blog: https://huggingface.co/blog/nvidia/magpie-tts-multilingual-voice-agents
- https://www.plivo.com/voice/pricing/in/
- https://www.tatatelebusiness.com/cloud-and-saas/smartflo/
- Vendor pricing pages: https://www.sarvam.ai/products/voice-agents/pricing, https://www.ringg.ai/pricing.md,
  https://www.bolna.ai/pricing, https://www.squadstack.ai/fully-managed-telecalling-for-sales-operations-teams,
  https://www.ravan.ai/pricing, https://www.retellai.com/pricing, https://vapi.ai/pricing, https://smallest.ai/pricing
- https://indiafintech.substack.com/p/the-hundred-buyer-problem-the-complete (2026-10-06)
- https://callyzer.co/blog/the-ultimate-list-of-cold-calling-statistics-in-india/ (updated 2026-08-10)
- https://apna.co/jobs/telecaller-jobs-in-mumbai (live spot-check)
- FX: ECB reference rates via api.frankfurter.dev; open.er-api.com
- Local files:
  - `/home/user/sales-enabler/docs/harvest/tx-voice.md`
  - `/home/user/Taxila/docs/research/duplex-2026-10/BAKEOFF.md` §5b
