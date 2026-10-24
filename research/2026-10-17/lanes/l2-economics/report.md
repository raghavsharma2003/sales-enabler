<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l2-economics: unit economics per connected minute, and the buyer's baseline (H2, H2b)

Date: 2026-10-17. Lane spend: about INR 12 of Azure (one batch of TTS synthesis plus Fast Transcription checks). The estimate
lines in `vp-spend.jsonl` total INR 19; the cap was INR 300.
Files: `cost-model.py` (this produces everything below), `cost-model.xlsx` (formula model; LibreOffice recalculated it to the
same values Python gives), `cost-model.json`, `tornado.png`, `data/` (price extracts, TTS measurements, 2,420 scraped job
cards), `code/` (fetch and measure scripts). Bulky raw downloads are in the scratchpad
(`research-raw/l2-economics/`).

Conventions:
- **"Connected minute"** is a minute in which a person is on the line with the agent. Ringing and unanswered dials are excluded.
- **COGS** covers telephony, ASR, LLM, TTS, realtime infra, storage, observability, amortised fixed platform cost and
  support. **Price** is COGS ÷ (1 − gross margin), with 60 % gross margin as the base case.
- **FX** is **₹95/USD**. Three feeds read 2026-10-16/17 gave 94.93, 94.96 and 95.11. The brief's ₹88 understates every
  USD-priced line by 8 %, so ₹88 is kept only as a sensitivity.
- **Base vs Monte Carlo.** "Base" uses the most-likely (mode) value of every input. The Monte Carlo (n = 20,000,
  triangular) gives p10/p50/p90. Most input ranges are skewed upward, so **MC p50 sits above base**. Read the MC p50 as the
  central estimate.

---

## 1. Answer to the hypothesis

**H2 (all-in cost below ₹2 per connected minute at our quality bar, on Azure): reachable on paper, not proven, and not with
the configuration whose quality is already measured.**

1. **The stack whose quality was measured cannot get below ₹2.** That stack is Taxila's D5: Voice Live as the ear, a
   GPT-6-sol-class speaking model and DragonHD or neural TTS. On fully managed Azure it costs:
   - **₹4.5/connected min** at 100k min/month (MC p50 ₹5.9). Fixed platform cost alone is ₹0.76/min at that volume.
   - **₹2.4/min** at 1M min/month with every managed optimisation applied: an unlimited-concurrency Indian SIP plan, Voice
     Live BYO ear, GPT-6.1-sol, a neural-TTS commitment tier and a phrase cache. The MC p50 is ₹3.1 and P(COGS ≤ ₹2) is 0.00.
   - **The floor is about ₹2.3** at any volume, because the variable lines alone exceed ₹2: sol-class LLM ₹0.79, ear
     ₹0.71, TTS ₹0.31, telephony ₹0.28 and support ₹0.15.
2. **Three paths reach ₹2 or less. Each rests on a quality claim that has not been measured.**

   | path | COGS | volume needed | the unmeasured quality claim |
   |---|---|---|---|
   | (a) swap the speaking model to GPT-6-luna (8× cheaper per token) | ₹1.69 base, MC p50 ₹2.12 | ≥ 0.2M min/month | luna holds a Hinglish sales conversation at the bar sol set in Taxila |
   | (b) self-host the ASR on T4 (Hindi Conformer-class) | ₹1.97 base, MC p50 ₹2.39 | ≥ 0.9M min/month | open Hindi/Hinglish ASR passes phone audio, short answers ("haan") and the non-speech hallucination probe |
   | (c) self-host ASR and TTS on H100 | ₹1.71 base, MC p50 ₹2.09 | ≥ 2.9M min/month | an open Hindi TTS such as Magpie Multilingual passes a blind ear test; no Hindi quality data is published |

   Combining (a) and (c) gives about **₹1.0/min** at 5M min/month.
3. **The three inputs that move ₹/min most are:**
   1. **the speaking-LLM tier:** ₹0.10 to ₹0.79/min (luna vs sol), and up to ₹1.30 with a larger prompt, lower cache hit
      and prefetch duplication;
   2. **how the ear is billed:** Voice Live per streamed minute is ₹0.71–0.86. It doubles if the echo-reference channel is
      billed, a point the harvest marks as unverified. S1 STT is ₹1.58. Self-hosted on T4 it is ₹0.04;
   3. **monthly volume, through fixed costs and the minimum GPU fleet:** at 100k min/month fixed cost alone is ₹0.76/min,
      and the self-hosted fleet does not amortise below about 3M min/month.

   TTS voice tier is next: HD ₹0.69 vs neural commitment ₹0.31. Telephony plan is about ₹0.2.
4. **Indian list prices are already lower than predicted, and lower than our managed COGS at quality bar.**
   - Sarvam Voice Agents charges **₹3.00–3.50/min**, plus ₹0.40/min telephony.
   - SquadStack says **₹2–5/min**, telephony bundled.
   - Bolna charges **₹4.15–5.52/min**.
   - Ringg charges **₹6/min**, all-in.
   - Ravan.ai charges **$0.02–0.10/min**.

   At ₹2.4–3.1 COGS, a per-minute price of ₹3.5 leaves 10–30 % gross margin. **The ₹2 target is not a stretch goal. It is
   the cost at which a per-minute business works at all**, and even then only at about 45 % gross margin against a ₹3.5
   market.

**H2b (buyers compare against a telecaller's cost per outcome): the computed baseline supports it, but there is no buyer
evidence yet.**

- **Cost of an in-house telecaller.**
  - Salaries come from **1,234 unique Apna job posts** in 20+ cities. The median band mid-point is **₹17,000/month**:
    Tier-1 metros ₹17,500, Tier-2/3 ₹14,000.
  - Fully loaded (statutory, seat, dialler, supervision, attrition) and divided by productive talk time, that is about
    **₹8.9 per connected minute** (p10–p90 ₹6.6–12.2), **₹14 per connected call** and **₹67 per qualified lead**
    (₹44–106).
- **AI per outcome against that baseline.**
  - Reminders, confirmations and appointments: at ₹3.5/min, AI is **2–4× cheaper** per outcome.
  - Lead qualification: only **about 1.4× cheaper**, because an AI qualification call runs longer (2.5 min assumed vs a
    1.6 min human average). At ₹5/min it is at parity.
  - So per-minute pricing undersells reminders and oversells lead qualification. The pricing unit should follow the
    segment (section 7).
- **What vendors do today.** Per-minute billing dominates. SquadStack, the human-plus-AI vendor that sells on outcomes,
  now bills per live-call minute and argues on cost per outcome. Whether buyers prefer outcome or seat pricing can only
  be settled in the discovery interviews (Owner actions).

---

## 2. Prediction check vs predictions.md

| prediction (H2, prior 0.60) | outcome | why |
|---|---|---|
| A fully managed Azure cascade cannot reach < ₹2/connected min at our quality bar today | **supported, with a caveat** | At the measured quality bar (sol-class speaking model, Voice Live ear, neural/HD TTS) the managed floor is ₹2.3 base, and MC p10 is ₹2.67 even at 1M min/month. The caveat: managed **does** reach ₹1.7 if a luna-class model meets the bar. That is untested, so the prediction stands only while the bar requires sol. |
| Self-hosted ASR+TTS plus a small LLM on Azure GPUs at high utilisation reaches about ₹1.2–2.0 | **supported on paper** | Self-hosted ASR+TTS on H100 (3-yr RI, 35 % utilisation) with a sol-class LLM: ₹1.71 base (MC ₹1.80–2.45). With luna: ₹1.01 (MC ₹1.04–1.30), below the predicted range. Needs ≥ 1.5–3M min/month and unproven Hindi quality. |
| Indian voice-AI list prices cluster around ₹4–10/min | **refuted (lower)** | Observed list prices cluster at **₹3–6/min**: Sarvam ₹3.00–3.50 + ₹0.40 telephony, SquadStack ₹2–5, Bolna ₹4.15–5.52, Ringg ₹6 all-in, Ravan ₹1.9–9.5. A secondary source claims Bolna enterprise at ₹1.75–2 (unverified). |
| **H2 overall** | **mixed** | |
| H2b (prior 0.65): buyers compare against a telecaller's cost per outcome; at least one strong segment prefers per-outcome or per-seat | **untestable yet** | The computed telecaller baseline makes outcome or seat-equivalent pricing the larger value capture for collections and lead qualification. No buyer data exists yet, and the visible market bills per minute. |

---

## 3. The cost stack and how each line was built

| line | how it is computed | base input and source |
|---|---|---|
| **Telephony** | per-minute rate × pulse rounding (half a pulse lost per call ÷ average call length) + number rental ÷ minutes per number; or an unlimited plan's ₹/concurrency ÷ FUP minutes used | Plivo India ₹0.38/min, 30 s pulse, number ₹200/month [read]. Tata Smartflo Voice Streaming Unlimited ₹1,100/concurrency/month, FUP 5,000 min/user pooled, one-time ₹20,000 [read]. Average call 2.0 min (range 1.0–3.5); Callyzer's human average is 1.6 min [vendor data]. |
| **ASR ("ear")** | audio tokens/s × 60 × price per 1K × stream factor (×2 if the echo-reference channel is billed) | Voice Live Std speech audio input $0.015/1K and BYO $0.0125/1K [Retail API]. About 10 tok/s (harvest measured 9 tokens in 0.97 s). S1 STT $1/h. Commitment tiers fall to $0.40/h at 100K h/month. |
| **LLM** | turns/min × call multiplier × [input tokens × (hit × cached price + miss × max(input, cache-write)) + output × output price] + a per-turn guard on 6-luna + post-call summary/QA on 6-luna | 6-sol $2.00 / $0.20 cached / $2.50 cache-write / $10 out per 1M; 6.1-sol cached $0.10; 6-luna $0.10 / $0.01 / $0.125 / $0.50 [Retail API, effective 2026-09/10]. **Volumes [E]:** 4 turns/min (3–6); system prompt 2–3k tokens; history 400; context 300; 70 output tokens/turn (≈ 25 spoken words × **1.41 o200k tokens per Hinglish word, measured**); cache hit 0.85–0.90; multiplier 1.2 for prefetch on partials and hedges (both used in Taxila). |
| **TTS** | agent talk share × characters per agent-speech minute × waste × (1 − phrase-cache share) × price | **Characters per minute measured by this lane: 612 / 803 / 1,038** (section 5). Neural $15/1M, HD $22/1M, neural commitment tiers $12 → $6/1M; no HD commitment tier is listed [Retail API]. Talk share 0.5 (0.35–0.65). |
| **Realtime infra** | vCPU and GiB per concurrent call × ACA consumption price × headroom | 0.25 vCPU (0.1–0.5) and 0.5 GiB per call. LiveKit's documented baseline is 4 cores / 8 GB for 10–25 concurrent jobs, i.e. 0.16–0.4 vCPU per call [read]. ACA centralindia $0.000024/vCPU-s [Retail API]. |
| **Storage** | MB/min × Hot LRS price × retention months | Opus stereo 0.24 MB/min, 12 months, $0.02/GB-month: about ₹0.005/min. |
| **Observability** | KB/min × Log Analytics ingestion | 20 KB/min × $3.22/GB: about ₹0.006/min. |
| **Fixed platform** | USD/month ÷ volume, plus GPU ops staff for self-host | $800/month base (ACA environment $0.14/h, Neon, monitoring); GPU ops ₹2.5–5 L/month [E]. |
| **Self-hosted GPU** | $/h ÷ (vendor streams × derate) ÷ 60 ÷ utilisation, never below a 2-GPU N+1 minimum fleet | **GPU prices (centralindia, $/h): on-demand / 1-yr RI / 3-yr RI** [Retail API]: T4 NC4as_T4_v3 0.579 / 0.340 / 0.220; A10 NV36ads 4.48 / 2.87 / 1.97; A100 NC24ads 5.14 / 3.36 / 1.91; H100 NC40ads 9.77 / 7.33 / 5.37. **Capacity:** Riva 2.15 Hindi Conformer-CTC, streaming: T4 50, A10 116, A100 233, H100 366 streams [vendor docs, parsed]. Magpie TTS Multilingual (includes Hindi): H100 64 streams at 275 ms TTFA, RTFX 291 [vendor blog], which this lane derives as about 580 calls per H100 throughput-bound. Derate 0.5, utilisation 0.35. |
| **Support / ops** | ₹/min | ₹0.15 (0.05–0.40) [E] |

**Reconciliation with the brief's baseline.** Run with Taxila §5b's own assumptions, the model reproduces **$0.027/min AI
only**. That is ₹2.57 at ₹95, not the brief's ₹2.4 at ₹88. Scenario A's AI-only lines (ASR + LLM + TTS) come to ₹3.07. The
difference is a larger sales prompt (3k + history + context vs 2k), a 1.2× prefetch/hedge multiplier, the per-turn guard and
post-call QA.

---

## 4. Results

### 4.1 Scenarios (INR per connected minute)

| scenario | volume min/mo | tel. | ASR | LLM | TTS | infra+stor+obs | fixed/vol | support | **COGS base** | MC p10 / p50 / p90 | P(≤₹2) | price @60 % GM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A. Managed today (quality bar): Plivo, Voice Live Std, 6-sol, HD | 100,000 | 0.48 | 0.85 | 1.30 | 0.92 | 0.08 | 0.76 | 0.15 | **4.53** | 5.00 / 5.88 / 6.96 | 0.00 | 11.34 |
| A0. Plain cascade (S1 STT + 5.6 terra + HD) | 100,000 | 0.48 | 1.58 | 1.36 | 0.92 | 0.08 | 0.76 | 0.15 | **5.33** | 5.51 / 6.36 / 7.40 | 0.00 | 13.32 |
| B. Managed optimised: Tata unlimited, VL BYO, 6.1-sol, neural commitment + cache | 1,000,000 | 0.28 | 0.71 | 0.79 | 0.31 | 0.08 | 0.08 | 0.15 | **2.39** | 2.67 / 3.06 / 3.51 | 0.00 | 5.97 |
| B-HD. As B with DragonHD | 1,000,000 | 0.28 | 0.71 | 0.79 | 0.69 | 0.08 | 0.08 | 0.15 | **2.77** | 3.05 / 3.46 / 3.93 | 0.00 | 6.93 |
| B-luna. As B with 6-luna speaking | 1,000,000 | 0.28 | 0.71 | 0.10 | 0.31 | 0.08 | 0.08 | 0.15 | **1.69** | 1.87 / 2.12 / 2.43 | 0.29 | 4.23 |
| C. Hybrid: self-hosted ASR on T4, managed LLM + TTS | 1,000,000 | 0.28 | 0.04 | 0.79 | 0.31 | 0.08 | 0.33 | 0.15 | **1.97** | 2.07 / 2.39 / 2.77 | 0.05 | 4.92 |
| D. Self-hosted at scale: ASR + TTS on H100, 6.1-sol | 5,000,000 | 0.28 | 0.15 | 0.79 | 0.15 | 0.08 | 0.12 | 0.15 | **1.71** | 1.80 / 2.09 / 2.45 | 0.36 | 4.27 |
| D-lite. As D with 6-luna | 5,000,000 | 0.28 | 0.15 | 0.10 | 0.15 | 0.08 | 0.12 | 0.15 | **1.01** | 1.04 / 1.16 / 1.30 | 1.00 | 2.52 |

At ₹88/USD the base values fall by 4–7 %: A 4.25, B 2.24, C 1.87, D 1.62, B-luna 1.60.

**Volume at which base COGS first reaches ₹2:**
- never, at any volume up to 50M min/month, for A, A0, B and B-HD;
- **0.20M** min/month for B-luna;
- **0.91M** for C;
- **1.47M** for D-lite;
- **2.95M** for D.

**Volume curves:**

| scenario | 10k | 50k | 100k | 300k | 1M | 3M | 5M | 10M | 30M |
|---|---|---|---|---|---|---|---|---|---|
| B (min/month → ₹/min) | 9.97 | 3.84 | 3.08 | 2.57 | 2.39 | 2.34 | | 2.32 | |
| D (min/month → ₹/min) | | | 21.97 | 8.19 | 3.36 | 1.98 | 1.71 | 1.57 | 1.53 |

Self-hosting is a liability below about 1.5M min/month.

### 4.2 Sensitivity (tornado.png)

**Architecture levers, swapped one at a time on B (base ₹2.39):**

| lever | cheapest option | dearest option |
|---|---|---|
| speaking LLM | 6-luna **1.69** (4.1-nano 1.70, DeepSeek-V4-Flash 1.72, 5.4-nano 1.74, 4.1-mini 1.86) | 6.1-sol 2.39, 6-sol 2.50, 5.6-terra 2.56 |
| ASR | Voice Live BYO 2.39 | Voice Live Std 2.53, **S1 STT 3.26** |
| TTS | neural commitment 400M 2.39 | neural list 2.55, **HD 2.77** |
| telephony | Tata unlimited 2.39 | Plivo 30 s pulse 2.59 |

**Continuous inputs on B, by swing:**
1. ear stream factor (if the reference channel is billed): +₹0.71;
2. turns/min (3–6): ₹2.20–2.77;
3. cache hit (0.8–0.95): ₹2.69–2.24;
4. LLM call multiplier: ₹2.26–2.65;
5. support/min: ₹2.29–2.64;
6. output tokens/turn, then system prompt size.

**On A** (100k min/month), fixed platform cost and volume lead (₹4.06–6.15), then cache hit, turns, ear factor and prompt
size.

**On D,** volume dominates (₹1.55–2.53 for 1.7M–15M min/month), then the same LLM-token inputs.

### 4.3 Self-hosting break-even (GPU only, 3-yr RI, derate 0.5)

| role | GPU | ₹/min at 100 % utilisation | managed comparator | break-even utilisation |
|---|---|---|---|---|
| ASR | T4 | **0.014** | Voice Live BYO ₹0.71/min | **2 %** |
| ASR | H100 | 0.047 | Voice Live BYO ₹0.71/min | 6.5 % |
| TTS | H100 | 0.029 | neural commitment ₹0.31/min | 9.6 % |
| TTS | H100 | 0.029 | HD ₹0.69/min | 3.2 % |

**GPU hours are not what decides self-hosting.** The deciding costs are:
- the people to run the fleet;
- the N+1 minimum fleet in an Indian region. Indian carriers require media anchoring in India (Plivo documents that both
  legs must be in India). The harvest also notes A100/H100 quota failures and rejected spot GPUs because a reclaim drops
  64–128 streams at once;
- rebuilding what Voice Live provides today: echo cancellation, noise suppression, semantic VAD.

**Licensing:** NIM/Riva production needs NVIDIA AI Enterprise, about $4,500 per GPU per year (secondary source). That
adds about 10 % on an H100 and can be avoided with open NeMo weights. **Self-hosting the LLM is never worth it for cost:**
managed 6-luna costs about ₹0.10/min.

---

## 5. Measurements (this lane)

| measurement | n | result | method, date |
|---|---|---|---|
| **TTS characters per spoken minute**, Hinglish (Devanagari Hindi + Latin English loanwords; 174-word home-loan qualification monologue; 867 code points) | 3 voices, 1 run each | hi-IN-SwaraNeural 85.0 s → **612 chars/min (123 wpm)**; hi-IN-Kavya:MAI-Voice-2.1-Flash (preview) 64.8 s → **803 chars/min (161 wpm)**; en-IN-Aarti:DragonHDLatestNeural 50.1 s → **1,038 chars/min (208 wpm)** | Azure Speech REST, southeastasia, vp account, riff-24khz PCM; duration from the WAV header; 2026-10-17 |
| Same text **romanised** | 1 | 996 chars (+15 %) → DragonHD 45.2 s → **1,322 chars/min** | same |
| **Tamil-English** mix (same content, 950 code points) | 1 | ta-IN-PallaviNeural 75.4 s → **756 chars/min (95 wpm)** | same |
| Completeness check of all 5 clips | 5 | transcript words 172/174, 172/174, 175/174, 171/174, 116/119: nothing dropped. DragonHD's 208 wpm is genuinely fast speech. | Azure Fast Transcription, hi-IN / ta-IN, 2026-10-17 |
| **Tokens per Hinglish word** (o200k_base, used by the GPT-4o/4.1/5/6 families) | 1 passage | Devanagari mix **1.41 tokens/word** (245 tokens / 174 words); romanised 1.74 (+23 %); Tamil mix 2.62 | tiktoken 0.14, offline |
| Synthesis latency (not representative) | 5 | Neural TTFB 2.1–4.7 s and DragonHD 20.8–22.6 s for an 870–1,000 character single request from a US sandbox | Only shows that long single requests are slow; production synthesises clause by clause (harvest: DragonHD TTFB ≈ 220 ms per clause) |
| **Telecaller salaries** | 1,234 unique postings (2,420 cards scraped) | band mid-points: p10 ₹12,000, p25 ₹13,500, **p50 ₹17,000**, p75 ₹20,000, p90 ₹22,500. Tier-1 metros: median ₹17,500 (n = 855). Tier-2/3: median ₹14,000 (n = 368). City medians: Bengaluru 19,000, Chandigarh 19,500, Delhi-NCR 17,500–18,500, Mumbai 17,500, Chennai/Hyderabad 17,500, Indore 17,000, Pune 16,500, Ahmedabad 16,500, Surat 15,500, Kolkata 14,000, Jaipur 14,000, Lucknow 12,500, Bhopal 11,000 | Playwright as an anonymous visitor, apna.co "telecaller jobs in <city>" pages 1–8 for 28 city slugs; deduplicated; each posting assigned to the city in its locality; 2026-10-17 |
| xlsx formula check | 8 scenarios | The LibreOffice-recalculated COGS equals the Python base to 3 decimals | soffice headless CSV export |

**Caveats.**
- Each voice was measured once on one passage, so the ±range is between voices, not within one.
- Speaking rate is controllable (SSML prosody). The cost-relevant constant is **about 5.0 characters per word**
  (Devanagari mix) × the words per minute you choose. A human-paced 150–160 wpm gives about 750–800 characters per minute.
- Apna bands are what employers advertise. They often fold in incentives, and Apna skews towards SMB employers.

---

## 6. Buyer baseline

### 6.1 In-house telecaller

**Model.** Formula version: `Telecaller` sheet. Monte Carlo: `telecaller_model()`.

- **Monthly cost** = salary × (1 + statutory) + seat + dialler + team-lead share + attrition × cost per hire.
- **Productive connected minutes** = talk hours/day × 60 × working days.

| input | base (range) | source |
|---|---|---|
| salary | resampled from the 1,234 Apna mid-points | measured |
| statutory loading | 13 % (0–22 %) | Labour-code wage definition, PF, 3.25 % ESI under ₹21k, bonus, gratuity. Informal SMBs pay close to 0. The PF ceiling is reported both as ₹15k and as ₹25k from 2026-09-17 (unresolved, secondary sources). |
| seat | ₹5,000 (2,500–10,000) | assumption |
| dialler | ₹1,250 (950–3,000) | Tata Smartflo Lite/Pro licence ₹950–1,250 with unlimited calling, read |
| team lead | 10 % (6–15 %) of ₹38k | assumption |
| attrition | 7 %/month (4–12 %) × ₹15k per hire | assumption |
| talk time | **2.5 h/day (1.5–3.5)** | vendor claims of 2–3 h (RMDialer); Callyzer's 46–48 % connect rate and 1.6 min average are consistent with it |
| working days | 24 (22–26) | assumption |

**Result (n = 20,000):**

| metric | p10 | p50 | p90 |
|---|---|---|---|
| ₹ per connected minute | 6.6 | **8.9** | 12.2 |
| ₹ per connected call | 10.6 | **14.2** | 19.4 |
| ₹ per qualified lead (qualified = 10–35 % of connects, mode 20 %) | 44 | **67** | 106 |

**Cross-checks** (secondary, dated 2026): ₹5–8/connected minute (Hundred-Buyer Problem newsletter); ₹5.14/min for a ₹13k
caller (MarketMapMondays, Sep 2026); ₹7–8/min (Inc42, Jul 2026, as cited). Our p50 is higher because it includes seat,
supervision and attrition. At ₹13k salary, 3 h of talk a day and minimal overheads, the formula gives about ₹5.

**Outsourced telecalling / BPO.** No primary rupee rate was found.
- GeM bid pages give SLAs, not prices.
- Offshore-for-US guides quote **$6–14 per agent-hour** for India voice, or $1,200–2,400 per seat-month. Those are not
  domestic rates.
- SquadStack, the human-plus-AI managed provider, now publishes "₹2–5 a minute" for Voice AI, telephony bundled.
- **A gap for the owner:** a domestic BPO quote per seat-hour and per outcome.

### 6.2 What Indian and US voice-AI vendors charge (read 2026-10-17; detail in `data/vendor-and-telephony-prices.csv`)

| vendor | price | unit and terms | source |
|---|---|---|---|
| Sarvam Voice Agents | ₹3.50 / 3.25 / 3.15 / 3.00 | per min (PAYG → Business), 60 s pulse. Telephony ₹0.40/min; number ₹59/month; Enterprise from 2 lakh min/month | price page |
| Ringg AI | ₹6 | per connected min, all-in (STT, TTS, LLM, telephony); number ₹499/month | price page |
| Bolna | 6.0¢ (₹5.52) → about 4.5¢ (₹4.15) | per min, bundled models; pilot $500 for 12,000 min | price page |
| Bolna enterprise | ₹1.75–2 | per min, committed volume | secondary, unverified |
| SquadStack | ₹2–5 | per min of live conversation; dialler and telephony bundled; setup fee per use case | vendor pages |
| Ravan.ai | $0.10 → $0.04 (and $0.02–0.04 at scale) | per min | price page |
| VoiceGenie | about $0.20 | per min | price page |
| Retell (US) | $0.07–0.31 | per min (infra alone $0.055) | price page |
| Vapi (US) | about $0.05 platform | per min + models + telephony | price page |
| Smallest.ai | $0.09–0.21 | per min, all-in cascading | price page |

**Reading.** Indian list prices sit at ₹3–6/min. A vendor blog claims "₹3–6 most common; ₹6–9 effective once telephony,
platform fees and connect losses are added" (Caller Digital, cross-check only). US list prices are $0.07–0.31
(₹6.7–29).

### 6.3 AI vs human per outcome (computed; `BuyerOutcome` sheet)

Human cost is the p50 telecaller (₹8.86/min).

| call type | assumptions | human ₹/outcome | AI ₹/outcome @ ₹2 / 3.5 / 5 / 6 per min | AI break-even ₹/min |
|---|---|---|---|---|
| Lead qualification (speed-to-lead) | AI call 2.5 min (billed 3 at 60 s pulse), human 1.6 min, 20 % qualify | **72** | 30 / 52.5 / 75 / 90 | **4.8** |
| COD confirmation / NDR | 0.75 min (billed 1), 85 % resolved | **7.9** | 2.4 / 4.1 / 5.9 / 7.1 | 6.7 |
| EMI reminder, early bucket | 1.5 min (billed 2), 35 % promise-to-pay | **41** | 11 / 20 / 29 / 34 | 7.2 |
| Appointment reminder | 1.0 min, 70 % confirmed | **12.8** | 2.9 / 5.0 / 7.1 / 8.6 | 9.0 |

**What follows:**
- **The cost case for AI is strong for short, high-volume, low-judgement calls** (2–4× cheaper even at ₹3.5) and **thin
  for lead qualification.** There the case must come from speed-to-lead (dialling in under a minute, 24×7) and conversion
  lift, which belongs to H5, not cost.
- **The AI call-length assumption is load-bearing.** If AI qualification calls run 1.6 min like a human's, AI costs ₹28 per
  qualified lead at ₹3.5/min, which is 2.6× cheaper.
- **For COD confirmation the real comparator is not a telecaller.** It is a WhatsApp utility message (about $0.0015, Vobiz
  page, US rates) and IVR/OBD.

---

## 7. Which pricing unit fits which segment

These are computed recommendations. Buyer validation is outstanding.

| segment / call type | recommended unit | why |
|---|---|---|
| D2C COD confirmation, NDR, reorder nudges | **per connected call** (₹2–4), or a per-confirmed-order fee with a floor | Calls run under a minute, so 60 s per-minute pulses add 25–30 %. The buyer benchmarks against WhatsApp/IVR at well under ₹1 per contact, so price must stay below the telecaller's ₹8 per outcome and close to automation alternatives. |
| Lending / EMI reminders, early-bucket collections | **hybrid:** per minute (₹3–4) plus a success fee per promise-to-pay or per rupee collected | AI is 2–4× cheaper per outcome even at list prices. Agencies are already paid on collections, so outcome pricing is native. Attribution and RBI conduct risk (lane l1) argue for keeping a per-minute base. |
| Real-estate / edtech lead qualification | **per qualified lead with a floor**, or a "digital telecaller" seat (₹/month for N connected minutes) | Per minute AI is barely cheaper than a human, so selling per minute invites a race to ₹3. Per qualified lead (anchor ₹45–70) or a seat-equivalent captures speed-to-lead value. |
| Healthcare / diagnostics appointment reminders | **per call** or per confirmed appointment | Short calls; WhatsApp is the substitute; low judgement. |
| Inbound support / overflow, SMB | **seat-equivalent subscription with a minutes FUP** | Buyers already buy seats: Smartflo ₹950–1,250 per licence with a 5,000-min FUP. One AI "seat" delivering a telecaller's 3,600 connected min/month costs us about ₹8.6k in COGS at scenario B, so ₹18–22k/month (against a ₹31k fully loaded human) gives 50–60 % gross margin. |
| Enterprise (BFSI, large D2C) | **per connected minute, committed volume** | It is how they buy CPaaS and voice AI today (Sarvam enterprise from 2 lakh min/month). The price point will be ₹2–3.5, so only a ≤ ₹1.5 COGS stack earns ≥ 50 % gross margin there. |

**Is ≤ ₹2/min all-in reachable, at what volume, by when?**
- **COGS ≤ ₹2:**
  - *Today, on managed Azure:* only with a luna-class speaking model, from about 0.2M connected min/month. Otherwise at
    ≥ 0.9M min/month with self-hosted T4 ASR, or ≥ 3M min/month with self-hosted ASR and TTS. Each path first has to pass a
    quality gate.
  - *With the measured quality configuration:* not before sol-class token prices or the Voice Live audio-in price fall by
    roughly 40–50 %. In GPT-6 → 6.1-sol, a single month (Sept → Oct 2026) halved the cached-input price but left output
    unchanged. A year, to Q4 2027, is a plausible but **low-confidence** horizon; lane H9 owns the dated curve.
- **Price ≤ ₹2/min all-in (with margin):** not reachable at 60 % gross margin in any scenario except D-lite at ≥ 5M
  min/month (₹2.5). **Do not compete for per-minute enterprise deals at ₹2.**

---

## 8. Evidence

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| 1 | Voice Live Std/Lite "Standard Speech Audio Input" $0.015/1K tokens; BYO $0.0125/1K; Pro $0.017/1K | prices.azure.com, Foundry Tools, centralindia | read 2026-10-17 (effective 2025-10 / 2025-11) | read-primary | high |
| 2 | Voice Live audio input ≈ 9.3–10 tokens/s, so about $0.009/streamed min | docs/harvest/tx-voice.md §6.7; Taxila BAKEOFF §5b | measured 2026-10-11 | read-primary (own measurement) | medium |
| 3 | Whether the stereo echo reference and idle audio are billed in ear-only mode is unverified | tx-voice.md risk 3 | 2026-10-15 | read-primary | high (that it is unknown) |
| 4 | S1 STT $1/h; commitment tiers 2K h → $0.80, 10K → $0.65, 50K → $0.50, 100K → $0.40/h; Fast Transcription $0.36/h (promo $0.10/h from 2026-09-01); batch $0.18/h | prices.azure.com | 2026-10-17 | read-primary | high |
| 5 | Neural TTS $15/1M; Neural HD $22/1M (eff. 2026-03-01); neural commitment overage $12 / 9.75 / 7.5 / 6 per 1M at 80M / 400M / 2,000M / 4,000M chars/month; no HD commitment tier listed | prices.azure.com | 2026-10-17 | read-primary | high |
| 6 | GPT-6-sol $2 in / $0.20 cached / $2.50 cache-write / $10 out per 1M; 6.1-sol cached $0.10; 6-luna $0.10 / 0.01 / 0.125 / 0.50; 6-astra $10 / 1 / 12.5 / 50; Flex tiers about half | prices.azure.com, "Azure OpenAI GPT6" | eff. 2026-09-01 / 2026-10-01 | read-primary | high |
| 7 | Other LLMs per 1M (in / out): 4.1-mini 0.40/1.60; 4.1-nano 0.10/0.40; 5.4-nano 0.20/1.25; 5.6-luna 0.20/1.20; DeepSeek V4 Flash 0.19/0.51; Grok 4.1 0.20/0.50; gpt-oss-120B 0.15/0.60; Llama 3.3 70B 0.71/0.71 | prices.azure.com | 2026-10-17 | read-primary | high |
| 8 | GPU VMs, centralindia: T4 $0.579/h on-demand ($0.164 spot; 3-yr RI $0.220/h); A10 $4.48; A100 $5.14; H100 $9.77 (3-yr RI $5.37/h); India regions 25–40 % dearer than eastus2 for A10/A100/H100 | prices.azure.com | 2026-10-17 | read-primary | high |
| 9 | ACA serverless GPU: T4 $0.000102/s (centralindia) vs $0.000073/s (eastus2); A100 $0.000741/s vs $0.000529/s | prices.azure.com | 2026-10-17 | read-primary | high |
| 10 | Plivo India domestic ₹0.38/min, 30 s pulse; number ₹200/month; streaming included; Indian entity + KYC; media anchoring in India; 140 series promotional only, 160 series BFSI service/transactional | plivo.com pricing + docs | 2026-10-17 | read-primary | high |
| 11 | Tata Smartflo Voice Streaming Unlimited ₹1,100/concurrency/month, FUP 5,000 min/user pooled, one-time ₹20,000; licences ₹950–1,250 | tatatelebusiness.com | 2026-10-17 | read-primary | high |
| 12 | Exotel, Ozonetel, Knowlarity, Airtel IQ and Vobiz-India publish no per-minute rates (quote or lead-form gated); Twilio India $0.0496–0.0699/min | vendor pages, search | 2026-10-17 | read-primary | high |
| 13 | Measured Hinglish TTS 612–1,038 chars per spoken minute; romanised +15 % characters; Tamil mix 756/min | this lane, `data/tts/` | 2026-10-17 | measured | high (n small) |
| 14 | Hinglish 1.41 o200k tokens/word (Devanagari mix) vs 1.74 romanised | this lane | 2026-10-17 | measured | high |
| 15 | Riva 2.15 Hindi Conformer-CTC streaming capacity: T4 50, A10 116, A100 233, H100 366 streams | docs.nvidia.com Riva ASR performance | read 2026-10-17 | read-primary (vendor benchmark) | medium |
| 16 | Magpie TTS Multilingual (Hindi included): H100 64 streams at TTFA 275 ms, RTFX 291; A100 395 ms, 197; no Hindi quality metric | huggingface.co/blog/nvidia | 2026-08-10 | vendor-claim | medium |
| 17 | Open Hindi TTS on T4: IndicF5 RTF 2.87 (n = 6); Chatterbox RTF 0.79; serverless T4 cold start ≈ 5 min | docs/harvest/hp-private-voice.md | Aug 2026 | read-primary (own measurement) | high |
| 18 | Sarvam Voice Agents ₹3.00–3.50/min (60 s pulse) + telephony ₹0.40/min; Sarvam API STT ₹24.6–29.4/h, Bulbul V4 Flash ₹1.7–2.0 per 1k chars | sarvam.ai pricing | 2026-10-17 | read-primary | high |
| 19 | Ringg ₹6/connected min all-in; Bolna 6¢ → 4.5¢/min; SquadStack ₹2–5/min; Ravan $0.02–0.10; Retell $0.07–0.31; Vapi about $0.05 platform; Smallest $0.09–0.21 | vendor pages | 2026-10-17 | read-primary | high (list), low (what customers actually pay) |
| 20 | Bolna enterprise ₹1.75–2/min | indiafintech substack citing TechCrunch | 2026 | read-secondary | low |
| 21 | Telecaller posted salary median ₹17,000 (n = 1,234); Tier-2/3 ₹14,000 | Apna, this lane | 2026-10-17 | measured | medium (band mid-points, SMB skew) |
| 22 | Telecaller connected talk 2–3 h/day | RMDialer glossary (vendor) | 2026 | vendor-claim | low–medium |
| 23 | Indian telecalling connect rate 46–48 %, average connected outgoing call 1.6 min, 5 crore calls / 12,000 numbers | callyzer.co (updated 2026-08-10) | 2026-08-10 | vendor-claim (large n) | medium |
| 24 | Delhi minimum wage (1 Apr 2025 order still in force): semi-skilled ₹20,371, skilled ₹22,411/month | search summary of labour-department order | 2026-10 | read-secondary | medium |
| 25 | NVIDIA AI Enterprise about $4,500/GPU/year (≈ $1/GPU-h in cloud) for NIM in production | secondary sources quoting the NVIDIA FAQ | 2026-09 | read-secondary | medium |
| 26 | LiveKit baseline 4 cores / 8 GB per worker for 10–25 concurrent voice jobs | docs.livekit.io (via search) | 2026 | read-secondary | medium |
| 27 | USD/INR 94.93–95.11 | open.er-api.com, frankfurter.dev, floatrates | 2026-10-16/17 | measured (API) | high |
| 28 | Domestic termination charge for wireless-to-wireless calls has been zero since 2021-01-01 (bill and keep) | TRAI IUC amendments as reported (news) | 2019–2021 | read-secondary | medium |

**Contradictions kept.**
- **Plivo's India price** appears as ₹0.38 on its page and ₹0.60 in a competitor comparison (Aug 2026). The page is used.
- **Vobiz India** is quoted in blogs at ₹0.38–0.45, but its own page is lead-gated.
- **Caller Digital** says a "TRAI-regulated termination rate ≈ ₹0.25–0.50/min"; TRAI moved domestic mobile termination to
  zero in 2021. Retail CPaaS rates are commercial margins, not regulated charges.
- **SquadStack's billing unit is inconsistent across sources.** Third-party directories say per lead (about ₹14.95), the
  pricing page says per live minute, and the blog says "outcome-driven".
- **The EPF wage ceiling** is reported as both ₹15k and ₹25k.

**Blocked sources:**
- web.archive.org: connection reset, and WebFetch refused it, so there is **no Wayback price history** in this lane.
- in.indeed.com: 403.
- ambitionbox.com: upstream failure.
- vobiz.ai India rates: lead form, not submitted.
- Exotel and Airtel IQ rates: sales only.

---

## 9. Gaps in the market found

1. **Price compression without a quality story.**
   - Indian voice-AI list prices (₹3–6) sit at or below what a measured-quality managed Azure stack costs at 1M min/month
     (COGS ₹2.4–3.5).
   - The incumbents must therefore run thin margins or cheaper stacks; Sarvam owns its models.
   - A "human-like" entrant cannot win a per-minute bake-off on price. It needs a unit that pays for quality: outcome or
     seat-equivalent.
2. **Transparent outcome pricing is rare.**
   - A vendor blog says fewer than five Indian vendors offer it.
   - SquadStack, the best-known outcome-flavoured provider, publishes per-minute billing.
   - A transparent "per qualified lead" or "per promise-to-pay, with a floor" offer is an open position.
3. **Short-call use cases are overcharged by 60-second pulses.**
   - Sarvam meters 60 s pulses, and the average telecalling connect is 1.6 min.
   - COD and appointment calls pay a 25–30 % rounding tax.
   - A per-call price for D2C confirmations is a gap. It competes with WhatsApp/IVR, not telecallers.
4. **"Digital telecaller" seat pricing aligned with how SMBs already buy.**
   - Tata Smartflo sells ₹950–1,250 per licence with a 5,000-min FUP; nobody we found sells an AI seat on that model.
   - At scenario-B COGS, an AI seat delivering 3,600 connected min/month costs about ₹8.6k to serve, against a ₹31k fully
     loaded human.
5. **Opaque Indian telephony.**
   - Only Plivo and Sarvam (Vobiz) publish INR per-minute rates. Exotel, Ozonetel, Knowlarity and Airtel IQ do not.
   - A bundled, published all-in price (telephony included) is itself a differentiator for SMB buyers.

---

## 10. What would kill this

- **Quality gates fail on every cheap path.**
  - 6-luna (or a peer) fails the Hinglish sales-conversation battery.
  - Self-hosted Indic ASR fails phone Hinglish WER, short answers or the non-speech hallucination probe.
  - Open Hindi TTS loses a blind ear test.

  Then managed COGS stays at ₹2.3–3.5 and per-minute selling at ₹3–4 is a sub-40 % gross-margin business. **Response:**
  change the pricing unit (outcome or seat), not the quality bar, as H2's own kill rule says.
- **Voice Live bills the reference channel or idle audio.** The ear then costs ₹1.4/min and B rises to about ₹3.1. This is
  testable in an hour (Owner actions).
- **Buyers anchor on vendor per-minute quotes (₹3–3.5), not on telecaller cost per outcome.** H2b fails, and only a
  ≤ ₹1.5 COGS stack (D-lite) is a business.
- **Lead-qualification calls run 2.5+ minutes without a conversion lift over humans.** AI is at cost parity at ₹5/min, so
  the per-minute value proposition fails in that segment.
- **No GPU quota for an India-anchored self-hosted fleet.** The harvest recorded A100/H100 quota failures; Indian telephony
  requires media in India. That closes the D and D-lite paths.

---

## 11. Owner actions

1. **Voice Live ear-only billing test** (about ₹100–200; needs Cost Management access).
   - Run one 60-minute ear-only session on the vp account (create_response:false, hi-IN/en-IN, semantic VAD) with a
     recorded call played in. Run it once with the stereo reference channel and once without, a day apart.
   - After 48 h, read Cost Management meter quantities for "Standard Speech Audio Input Tokens".
   - This settles the ear stream factor, the largest single tornado swing on B.
2. **Telephony quotes, as a buyer** (forms need the owner's identity). Ask for an INR/min rate, pulse length, DID rental,
   concurrency fee, streaming fee and minimum commitment at 100k and 1M min/month, from:
   - Exotel (Voice Streaming / AgentStream);
   - Tata Tele (Smartflo API C2C / OBD per-minute; confirm the Voice Streaming Unlimited FUP for AI traffic);
   - Airtel IQ, Ozonetel, Knowlarity;
   - Vobiz (India form).
3. **Vendor quotes at volume.** Ask Sarvam, Bolna, Ringg and SquadStack for 1M min/month enterprise pricing, including
   whether outcome pricing is offered. Use the owner's company identity and do not misrepresent intent.
4. **Discovery interviews** (H2b and the telecaller baseline). Collect from 5+ teams:
   - dialler reports: talk time per agent per day, connects/day, average handle time;
   - fully loaded telecaller cost;
   - cost per qualified lead / promise-to-pay / confirmed order;
   - the unit they would prefer to pay in (Van Westendorp + Gabor-Granger on per minute vs per outcome vs per seat).
5. **Quality gates that unlock the cheap paths** (lanes l5/H9 or the next phase):
   - (a) blind battery of 6-luna vs 6.1-sol as the speaking model on 30 Hinglish sales scenarios;
   - (b) earbench with an accent axis: neural vs DragonHD vs MAI-Voice-2.1-Flash vs Magpie Multilingual (Hindi);
   - (c) self-hosted Indic ASR (IndicConformer / Riva Hindi) on phone-band Hinglish, with the short-answer and silence
     probes.
6. **Ask Microsoft (account team or Founders Hub):**
   - the MAI-Voice-2/2.1 price (preview; not in the Retail API on 2026-10-17);
   - the MAI-Transcribe-2 streaming price (not in the Retail API);
   - whether HD voices have a commitment tier;
   - H100/A100 quota in centralindia and southindia for the vp subscription.
7. **A domestic BPO quote:** INR per seat-hour and per outcome from 2 domestic telecalling BPOs. No primary figure exists.

---

## 12. Open questions

- Real turns per minute, words per turn and call length for AI sales calls. Every LLM line scales with turns/min, and the
  lead-qualification verdict hinges on call length. Measure them in the concierge pilot.
- Is the 5,000-min FUP on Tata's "unlimited" streaming plan practical for AI outbound at 70–80 % utilisation, and are
  140/160 series numbers available on it (lane l1)?
- DPDP/sectoral localisation: must LLM inference use Data Zone or regional deployments (+10 % on the meter) rather than
  Global Standard?
- How much does support/ops cost per minute in the first year? At low volume it is fixed, not per-minute.
- Collections fee norms (agency percentage of amount collected) to anchor a success fee. No primary source was found in
  this lane.
- Do incumbents at ₹3–3.5/min run a cheaper stack (own models) or sell at near-zero margin? The l4a invoices and teardowns
  should settle this.
