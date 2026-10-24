# economics-platform: what VP costs, how fast and reliable it is, how others build on it, how it keeps learning from the market

**Status.** Proposed module design for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`).

**Grades.** [M] measured by us (n, method) · [C] computed · [O] observed · [V] vendor-claimed · [I] inferred · [U] unknown.

**Where things are.**
- Defaults as data: `data/blueprint/economics-platform-defaults.json`.
- Paths are under `/home/user/sales-enabler/`.
- Short tags:
  - SY18 = `research/2026-10-18/SYNTHESIS.md`;
  - COR = `research/2026-10-17/lanes/CORRECTIONS-round2.md`;
  - L8 = `research/2026-10-17/lanes/l8-azure-bench/round2/findings.md`;
  - TS, AS, WT and HV as in the spine.

**Three honest headlines.**
1. **VP cannot launch at INR 2/min without trading the voice or the brain.**
   - Every stack that reaches INR 2 with a margin uses either a voice humans rated 1.5-4.5/10 or gpt-oss as the brain (SY18 §2.1 [M]).
   - The owner ranked voice above margin (req-02) and asked for a better brain than gpt-oss (req-08).
   - So Base launches at **INR 3.49 + GST, billed per second, telephony included**.
   - INR 2 becomes a scale target with pre-registered triggers (§3). req-41 is therefore not met at launch.
2. **VP still costs the buyer less per real call.**
   - Indian reminder calls mostly run under 90 s.
   - Per-second billing at INR 3.49 beats Sarvam's 60-s pulses (4.4-7.4 effective), Bolna's 30-s pulses (5.7-7.6) and every global platform (8-37) on 30-90 s calls. These are computed from rate cards; no invoice has been read [C].
   - Price is still not the wedge, because incumbents can follow a cut (`rejected.2026-10-17.parity-undercut`). The wedge is the honest unit, the caps, and a bill equal to the meter (W8).
3. **Speed and reliability are targets, not claims.**
   - No VP call has crossed an Indian line.
   - Every VP stack cuts in on 15-42% of turns (`open.2026-10-19.turn-taking`).

## 0. Owner requirements

| req | How it is honoured, or why not |
|---|---|
| req-41: about INR 2, missing nothing | **Not at launch.** The cheapest measured stack (C6g, INR 0.94 AI) fails req-02 and req-08. The ladder in §3 reaches INR 2 at about 1.6-2.5M min/month. |
| req-43: cheaper and better | Cheaper per effective minute on 30-90 s calls than every published self-serve price. The exception is SquadStack's "INR 2-5" [V], which cannot be verified. Quality: the price is set after the ear picks the voice. |
| req-44: charging clear in-product | One rate card, a per-second meter, cost lines on every call, an estimate before launch, caps and wallet states (§2). |
| req-42: in-house; no self-hosting until volume | Meter, dialer, router, registry, turn-taking, `compile()` and billing are built in-house. Self-hosted speech waits for the §3 volume triggers. |
| req-11: fast | Per-segment budgets measured at the handset; the opening is synthesised during the ring; warm pools (§4-5). |
| req-08: better brain than gpt-oss | gpt-oss is no default. Its premium (about INR 0.6/min for Flash-Lite, C8 vs C6g in SY18) is priced in. Scout tracks new models. |
| req-50/51/52: self-serve; parity floor; pick the stack | The stack picker shows INR and India-measured latency per row. The presets come from the voice module. |
| req-54: provider-open; Inworld avoided; AWS deferred | The registry is provider-neutral. Inworld, the cheapest desk path at 250k min/month, is excluded unless the owner reverses. v1 has no AWS dependency. |
| req-58: frontier | Measured adapter registry, a predicted reply gap, speculative release behind a negation-aware matcher (v2), and Live behind a gate. |
| req-59/60/61: learn always, store everything | Scout (§9) writes graph inbox entries. |

## 1. Benchmark: the best competitor per sub-area, and where each falls short

| Sub-area | Best today | Where every incumbent falls short |
|---|---|---|
| Price at the choice | **Retell**: price at the toggle (memory USD 0.005/run, burst 0.10, batch 0.005/dial) and per-second cost lines (WT retell png/76; RAP-36/51 [O]). **Bolna**: a persistent cost header and a price table with pulse (3.5+0.5+2 cents, 30 s) [O] | Vapi's headline (1,530 ms; USD 0.09) leaves out telephony and the turn wait (wt-vapi-12/13). Retell's 4,000-token multiplier and default-on burst (RET-34). Bolna's off-list models silently leave the flat price. ElevenLabs' dashboard $/min is 1.7-2.3x below its own API calculator |
| INR billing | **Sarvam**: INR credits, Razorpay, GST split, UPI autopay; unanswered calls free (SAR-09/36 [O]) | 60-s pulses: a 30-s call costs 7.40/min (SAR-38). Numbers are released when the wallet empties. A negative balance shows in normal type (sarvam-20). No cost API. The others bill in USD |
| Spend control | None good. Synthflow's thresholds invoice rather than cap (SYN-10). Retell stops calls at zero balance | **0 of 5** cap spend by API key or group cost by campaign or contact (AS XS-27/28 [O]) |
| Cost analytics | **Vapi**: 8 typed cost lines plus `/analytics` (AP-35/37 [O]) | No group-by campaign or contact. Sarvam has no per-call cost field |
| Speed | Demos measured from US-East: Ultravox p50 1.54 s; ElevenLabs collisions 3% (L4B [M]). Bolna's code floor is about 1.4 s [I] | **0 of 6** show a predicted reply gap. Vapi shows the US best case (wt-vapi-19). Sarvam's demo measured 3.1 s [M] |
| Residency | **Sarvam** (Azure Central India) and **Bolna** (AWS Mumbai) run calls in India (SAR-21, BOL-17) | 4 of 8 vendors run the call path in the US (TS §5). Sarvam's dashboard replays go to PostHog US (SAR-63) |
| Reliability | **Sarvam** publishes component uptime (99.94%, SAR-19). **Synthflow** runs incident.io write-ups | Vapi: a 4 h 07 min outage, and campaign calls "not retried" (VAP-54). Retell: about 6 h of unnoticed degradation and 39 min to the first post (RET-38/39). Bolna: 9 of 18 incidents upstream, no carrier failover (BOL-40). Exotel: no VoiceBot status component (EXO-41) |
| API, SDK, MCP | **Retell**: 109 operations, SDK and MCP from one spec, an idempotency key, 422 on a PATCH to a published version (RAP-03/07/12). **Vapi**: config as code and a predial veto (AP-27) | At 4 of 4 writable vendors, the stored config is not what runs; 3 of 4 silently drop unknown fields (XS-07/08). Retell's CSV import works only with a dashboard login (JWT). Vapi has 68 hidden paths. Bolna and Sarvam webhooks are unsigned |
| Concurrency | **Retell**: 20 free, then USD 8 per slot | Vapi charges USD 10 per line. Exotel raises limits "by email, chargeable" |
| Learning from the market | Nobody does this visibly | Changelog pace in 6 months: ElevenLabs 195 items, Vapi 82, Bolna 72 (TS §4) |

## 2. Pricing and billing

### 2.1 The unit
- **INR per connected second, quoted per minute.**
  - Includes telephony, AI, platform, default analysis (about INR 0.17 per 3-min call, `intelligence-module.json`) and recording.
  - **GST of 18% is shown beside every price.** For example: "INR 3.49/min + GST = INR 4.12".
- **Pulse: 1 s from carrier answer, no minimum.**
- **Not billed:** unanswered, busy and failed calls; attempts blocked at precheck; VP-fault calls (auto-credited with the reason); browser tests inside the daily test budget.
- **VP absorbs the carrier's pulse rounding.** This costs about INR 0.03-0.07/min on the reminder mix [C, EXO-35 corrected].
  - Plivo's pulse is 30 s in the l2 data but 60 s on the 2026-10-19 console read (`voicelab/server/phone.py` line 28). The first invoice settles which.
- **No setup, platform, seat, per-line, per-dial or burst fee.**
- **Pass-through lines at cost, each shown separately:**
  - A2P carrier charge: INR 0 on 140/1600/1601 numbers; up to 0.05/min on declared 10-digit numbers. Telcos are asking for 0.50/min plus 0.05 per attempt (r2-untouched-raw §1.2 [O]).
  - Number rental.
  - WhatsApp at Meta's rate (utility INR 0.115), with any BSP markup shown (about 26%).
  - DLT SMS.
- **Bring-your-own carrier.** Numbers sit in the tenant's name (RS §2.11).
  - The all-in headline still includes telephony, metered from carrier records and labelled "paid to your carrier".
  - Whether VP may re-bill telephony at cost on one invoice is a counsel question (sender or aggregator, RS §2.5 Q4).

### 2.2 Tiers, re-priced after the default stack (`open.2026-10-20.reprice-tiers`)

The rule: **Base = the lowest of 2.99, 3.49 or 3.99 that keeps p50 gross margin at 30% or more at 2026 prices, and 25% or more after known 2027 price moves, after a 2% payment fee. Never reached by downgrading the voice.**

COGS = AI + telephony 0.38-0.48 + pulse 0.03-0.07 + infra 0.03 + analysis 0.06.

| Winning default | AI INR/min | COGS | Base | Margin |
|---|---|---|---|---|
| Indic: all-Sarvam | 1.39-1.51 [M meter, n=9 replies] | 1.93-2.05 | 2.99 | 29-33% |
| Natural: Gemini cascade (G-A) | 1.56; **1.92 from 2027-01-01** [I] | 2.10; 2.46 | **3.49** | 38%; 28% |
| Fast: Azure STT CI + gpt-4.1-mini SI + MAI-Voice | 1.36-2.70 (MAI meter unread [U]) | 1.90-3.24 | 3.49 (3.99 if MAI bills like HD) | 5-44% |
| C6g (reference only; fails the ear and req-08) | 0.94 [M, n=30 turns] | 1.48 | not offered | n/a |

**The proposed card** assumes Natural, the owner's leaning. It is final after round 2.

| Tier | Adds | Price + GST | Margin |
|---|---|---|---|
| **Base: human voice** | The ear-picked default stack, brief v2 + ledger, turn presets, reply door, analysis, 90-day recordings, preference memory (late v1), 10 concurrent calls, unlimited members | **INR 3.49** (4.12 incl.) | 38%; 28% in 2027 |
| **Plus: memory + learning inbox** | Relational memory brief (1,200-byte cap), commitments, Coach proposals, fixed-horizon tests, 1-year retention, 25 concurrent | **INR 3.99** (4.71) | 37-44%; 28-35% in 2027 (adds 0.06-0.34/min) |
| **Premium: personalisation + dedicated voice** | India-resident stack option, deep personalisation, a dedicated voice at INR 3.5 lakh/month (covers about 2.80 lakh of Azure CNV hosting; approval unverified), SSO, 99.9% SLO with credits, named IST support, 100 concurrent | **INR 6.49** (7.66) | 44% (India-resident COGS 3.52, SY18). gpt-4.1-mini retires 2027-04-14 |
| Premium Live | Gemini 3.8 Live, text-gated | Not offered until the 200+ attack-turn gate passes. If it passes: COGS / 0.65, with a 5-minute cap | COGS 4.7-6.2 at 3 min, growing with length (`rejected.2026-10-19.gemini-live-at-rs2`) |

**Other pricing rules.**
- **Volume:** VP passes on 50% of the unit savings that volume actually unlocks, never below 25% margin.
- **Operator brain (req-16):** the default brain is included (fair use 200 turns/day). Premium brains are billed at cost per turn (INR 0.48-2.96), with an INR 500/day cap.
- **Per-outcome pricing is only for managed design partners:**
  - the card: INR 50 per car, 15 per health or life, 20 per two-wheeler; an INR 15k minimum credited against it; a 10% holdout that is never billed (SY2 §4);
  - self-serve never prices per outcome, because the holdouts take months to years;
  - IRDAI's commission-cap consultation (comments due 2026-10-25) could cut value per save to 0.33-0.49x.

### 2.3 Effective price per connected minute (ex-GST)

Computed from rate cards, dated 2026-10-21; no invoice read [C].

| Call | VP Base | Sarvam PAYG | Bolna PAYG | ElevenLabs | Retell BYO | Vapi |
|---|---|---|---|---|---|---|
| 30 s | 3.49 | 7.40 | 5.72 | 8.2+ | 8.3+ | 12.5+ |
| 45 s | 3.49 | 5.20 | 7.63 | 8.2+ | 8.3+ | 12.5+ |
| 90 s | 3.49 | 5.07 | 5.72 | 8.2+ | 8.3+ | 12.5+ |

- On whole-minute calls, Sarvam Business (3.00 + 0.40 telephony) is INR 0.09 cheaper.
- W8 ("lowest at 30-90 s versus at least 5 of 7 incumbents") holds on paper. Only the T7 invoice audit proves it.

### 2.4 Wallet, invoice, GST, TDS
- **Prepaid INR wallet:**
  - UPI QR or VPA, UPI Autopay, card or netbanking, through a Razorpay seam (reuse `asset.hp-vyakti-completion.payment-provider-seam-ledger`).
  - Auto-recharge stays within the RBI e-mandate cap of **INR 15,000 per debit** (L4C §3c [O]).
- **Invoice mode** applies above INR 15,000 a month, or on request:
  - monthly GST invoice, with the PO number;
  - payment by NEFT/RTGS into a per-tenant virtual account;
  - credit limit = one month prepaid, or a deposit.
- **GST:**
  - CGST+SGST or IGST from the GSTIN and place of supply;
  - reuse `asset.cc-branches.gst-invoice-pipeline`;
  - GST timing on wallet top-ups and the e-invoicing threshold are questions for a CA.
- **TDS:** the buyer may deduct it on invoices; uploading Form 16A credits the amount. The section and rate are for a CA.

### 2.5 Wallet states

| State | Trigger | Behaviour |
|---|---|---|
| Healthy | runway ≥ 3 days at the last 7 days' pace | balance, runway and in-flight reservations shown |
| Low | runway < 3 days, or under INR 1,000 available | banner; Treasurer drafts a 7-day top-up card; the owner is notified (consented WhatsApp or email) |
| Critical | runway < 12 h | new launches blocked, with the reason; running campaigns continue |
| Exhausted | balance minus reservations ≤ 0 | no new attempts; **live calls always finish**; scheduled attempts deferred, not cancelled |
| Overdrawn | balance < 0 | overshoot bounded by reservations (10 × 8 min × 3.49 = INR 279 at most); **shown in red**; settles on the next top-up; **numbers kept 30 days** |

**Reserve before I/O** (HV law 24; `asset.hp-voice-cloning.atomic-paid-provider-spend-ledger`). Each attempt reserves rate × max duration (480 s = INR 27.92) before dialling and releases the rest at hang-up.

### 2.6 Caps, estimates, refunds
- **Caps:**
  - workspace monthly cap: required before the first launch; default 1.2 × the first campaign's p90;
  - campaign budget: required; default p90 rounded up;
  - API keys: daily and monthly caps; a new run-scoped key defaults to INR 2,000/day and 20,000/month;
  - test budget: INR 200/day.
- **Cap behaviour:**
  - at 80%, VP notifies;
  - at 100%, the Treasurer stops at the next call boundary (A3);
  - raising a cap is A2, with re-authentication above 2×.
- **Estimate** (the campaigns module's formula):
  - p10-p90 including GST;
  - priors are labelled "assumption" until 50 calls, then the campaign's own rates are used, with n;
  - target: the actual lands inside p10-p90 for at least 80% of campaigns.
- **Refunds:**
  - unused paid balance is refundable any time, to source, with no fee, within 7 working days (refused refunds recur in Indian complaints, L4C);
  - promotional credit is not refundable;
  - VP-fault calls are never billed;
  - every call has "Dispute this charge"; a human decides within 2 business days from the run manifest and cost lines, and a credit note carries the GST adjustment.

## 3. The INR 2 path

**The AI budget at INR 2 ex-GST is INR 0.54/min at 50% margin** (0.34-0.74 across 60-40% margin; SY18 §1 [C]).

AI cost per minute on a 3-minute call:

| Stack | AI INR/min | Grade and caveat |
|---|---|---|
| C6g | 0.94 | [M]; fails the ear and req-08 |
| G-E (gpt-oss + Gemini TTS) | 0.98; 1.34 in 2027 | [I]; gpt-oss brain |
| All-Sarvam | 1.39-1.51 | [M] |
| G-A | 1.56; 1.92 in 2027 | [I] |
| Live | 4.2-5.7 at 3 min; 6.4-12.7 at 10 min | [M]; n = 1-2 calls per cell |
| Inworld | 0.53 at about 250k min/month | [V]; excluded (req-54) |
| Self-hosted Indic speech | 0.43-0.51 from about 2.5M min/month | [V]; INR 6.50 at 100k (2-GPU floor) |
| D-lite | reaches INR 2 from about 1.6M min/month | [I], COR §2 |

**The ladder, pre-registered.**
- Base drops when the measured COGS p50 stays at or below the trigger for 2 consecutive months. The meter must reconcile to vendor invoices within 5%, and the default voice must pass the listener panel at or above the launch default.
- The triggers:

  | New Base price | COGS trigger |
  |---|---|
  | **INR 2.99** | 1.94 or less |
  | **INR 2.49** | 1.62 or less |
  | **INR 1.99** | 1.29 or less (35% margin each step) |

**Levers, in order of evidence:**
1. VAD-gated ears (measured 1.24 → 0.94).
2. A byte-stable cached core (HV law 6).
3. Telephony concurrency plans at about 250k min/month (Tata Smartflo about INR 0.22 vs 0.38-0.48 [O]).
4. Speech commitment tiers. Azure still costs 0.78 at 10M min/month, so this is a lever, not a path.
5. Self-hosted Indic speech on an always-on GPU fleet, at 1.6-2.5M min/month sustained, after the ear test and the India battery.
   - Not on scale-to-zero machines: `rejected.harvest.11`; HV law 30 (161-176 s cold starts).

**Shocks:**
- **FX:** ±5% moves cost about INR 0.05. VP absorbs ±10%, then gives 30 days' notice.
- **Gemini TTS doubles on 2027-01-01:** +0.37/min. The Treasurer models it 60 days ahead.
- **A2P at INR 0.50:** 14% of Base. It is passed through, not absorbed.
- **1600 carriage price:** unpublished (REG-24). At INR 0.60-0.80 it costs about 14 margin points; the tenant's carrier bills it under BYO.

## 4. Architecture

The split is proposed (spine §11.5). It reverses if a TypeScript port matches battery latency with less operations work.

1. **voice-rt** is a Python 3.13 asyncio service in Azure Central India, ported from `voicelab/server` along its seams.
   - `calls.py` (807 lines) splits into Call base, Reply, CascadeCall and the S2S bridges.
   - The `providers.py` adapters become registry rows.
   - `phone.py` becomes carrier adapters: Plivo stream; Vobiz on the Plivo protocol; Exotel AgentStream on Pipecat's ExotelFrameSerializer pattern.
   - `audio.py` keeps VAD and Recorder. `Gate` and the meter (`add_cost`, `meter`, `cost_loop`) carry over.
   - Live media never scales to zero: at least 2 instances per region.
   - Each call carries a run manifest (`decision.2026-10-20.combo-identity`).
2. **The control plane** is TypeScript on Node 24 and Postgres, on Azure Container Apps.
   - **Production data must be India-resident.** Use Neon only if it offers an India region (unverified [U]); otherwise use Azure PostgreSQL in Central India.
   - Neon branches are for previews with synthetic data. Recordings live in Central India blob storage.
   - The processes: one API, one dialer, one analysis worker, one outbox and scheduled jobs. This replaces Relay's 7 processes and its JSON-blob table (`rejected.harvest.17`).
   - Every SQL statement is EXPLAINed on real Postgres (HV law 33).
3. **The seam between them.**
   - The control plane sends a signed **call ticket**: version, manifest, variables, memory brief, reservation id and deadlines.
   - voice-rt streams turns, per-second cost lines and the outcome into a Postgres outbox.
   - Every queue names its caller and its schedule (HV law 31).
4. **The adapter registry** is data, one row per kind × provider × model × region. Each row holds:
   - price lines, with source and date;
   - p50 and p90 first token or first audio, with n, date, vantage and method;
   - languages;
   - whether the provider trains on data by default;
   - a residency badge;
   - sunsets (Gemini 3.1 Live and 3.1 flash TTS on 2026-11-17; gpt-4.1-mini on 2027-04-14);
   - TPM needed per concurrent call;
   - health.

   A field with no writer reads "not measured", never 0 (HV law 21).
5. **Warm pools.**
   - Per-voice TTS sockets, extending the lab's `SynthPool`. A warm Azure socket gives first audio in 19-29 ms; a cold Bulbul socket took 4.3 s [M].
   - STT opens at "ringing", and the cached core is primed.
   - **The opening is synthesised during the ring.**
   - The precall hook and the memory brief are fetched during the ring.
6. **Quota per concurrent call.**
   - Each call needs 13-25k TPM. A 50k-TPM deployment returned 429 on 13/35 turns at 3 concurrent streams (L8 [M]). The Tier-1 cap silenced 6/12 calls (`rejected.2026-10-20.gemini-tier1-for-volume`).
   - The dialer reserves quota before dialling.
   - Hot and background lanes are separate; background is capped at 30% and pauses after a hot 429 (`asset.tx-core.quota-lanes-hot-vs-background-tpm-isolation`).
   - Evals never touch production keys (`rejected.harvest.14`).
7. **Failure handling.**
   - One upstream classifier sorts errors into quota, transient, deterministic and empty-200, with same-key retry inside wall-clock deadlines (HV law 32; `asset.hp-main.upstream-failure-ladder`).
   - Scale-to-zero workers wake, then sign (HV law 30).
8. **Residency.** The call path runs in India by default, and every stack row carries a badge.
   - Groq runs in the US, and the Gemini API has no India residency.
   - The India-resident preset is Azure STT CI + gpt-4.1-mini SI + MAI-Voice CI.

## 5. Speed budgets at the handset

| Segment | Budget p50 / p90 (ms) | Best measured | Lever |
|---|---|---|---|
| Endpoint | 450 / 800 | 450 at 300-ms segmentation; 622 at 500 ms [M, L8] | segmentation per preset; pause-aware release |
| Hold | 50 expected / 1,400 | 0; +1,400 only after a continuation cue | completeness cues |
| Brain first token | 350 / 700 | 304 gpt-4.1-mini SI (n=33); 535 gpt-oss@groq; 699 Flash-Lite [M] | region, no reasoning effort, cache, short first clause |
| Voice first audio | 350 / 600 | 95 Swara warm; 425 MAI; 624 Gemini Flash-Lite TTS + 140-360 leading silence [M] | warm pool, streaming; **VP trims leading silence** |
| Phone leg | 300 / 450 | 250-450, estimated, never measured [I] | India media edge |
| **Total** | **1,500 / 2,500**; cut-ins ≤ 5% | server 0.49-1.04 s on fast stacks; 1.6-2.2 s on the Gemini cascade [M] | |

Each turn stores its segments. A stereo battery calibrates the phone leg: at least 30 clean turns per stack per carrier.

**Predicted handset p50** [I]:

| Preset | Predicted p50 |
|---|---|
| Indic | 1.27-1.48 s |
| Fast | 1.48-1.75 s |
| Natural with gpt-4.1-mini | about 1.85 s |
| Natural with Flash-Lite | about 2.2 s |

The owner's Gemini-TTS leaning (req-53) therefore misses the speed budget (req-11) by 0.35-0.7 s today. The picker says so, and the ear decides.

## 6. Reliability

**Service levels (v1).**

| Measure | Target |
|---|---|
| Call-path availability | 99.5% a month: agent's first word within 3 s of answer, over answered attempts; carrier failures tracked separately |
| VP-caused mid-call failures | 0.5% of answered calls or fewer |
| Due attempts | 99% started within 5 min, inside the window |
| API | 99.9% |
| Webhooks | p95 first delivery within 10 s; retries for 72 h |
| Detection and notice | detect within 5 min; notify the client within 15; status post within 15 min, then every 30; RCA within 5 business days |

v2 raises call-path availability to 99.9%, with service credits on Premium.

**Synthetic Indian calls.**
- A 20-s echo-bot call every 5 min per carrier and default preset, plus component probes every minute.
- Passive monitors watch live error rates per component.
- Synthetic calls ride the production path on their own micro-quota and cap, and never count in client metrics.
- Cost: about INR 12k/month at v1 [C].

**Failover** (proposed answer to `open.2026-10-20.product-failover-policy`).
1. **Tests never fall back** (`rejected.2026-10-20.silent-fallback-in-tests`).
2. **At call start**, a red component routes the whole call to the tenant's declared alternate stack, one they heard and approved. The call is filed under what ran (`rejected.2026-10-20.preset-override-attribution`).
3. **Mid-call**, only a pre-declared same-voice, same-model fallback in another deployment is allowed (as Bolna does: `evidence.2026-10-20.acct-bolna-llm-overflow`). Otherwise she closes gracefully, one callback is scheduled, and the call is not billed.
4. **Carriers.**
   - Each tenant declares two carriers (Plivo, then Vobiz or their Exotel), each with its own A2P-declared CLI.
   - Failover triggers at 10% or more of dials failing in 15 min, over 20 or more dials (intelligence M07).
   - New attempts switch automatically if pre-approved (A3); otherwise the campaign pauses and a card goes up.
   - No incumbent shows carrier failover.
5. **Resume.**
   - Campaigns auto-resume after 10 min of green, inside the window.
   - Dials that never connected are re-queued without spending the attempt budget.
   - Answered calls VP cut get one callback and are not billed.
   - Unknown outcomes never count as success (HV law 17).

**An honest status page.**
- Monitors drive it, not people.
- Components: carriers, providers, dialer, API, dashboard, webhooks.
- Slow is a status of its own ("speed degraded").
- If the monitor is down, the page shows "status unknown", never green. Vapi showed "Great news! no active issues" with zero monitors (wt-vapi-37).
- In-app, "Your impact" lists affected campaigns, pauses, resumes and credits.

## 7. API, SDK and MCP: one spec, 1:1 with the dashboard (W10)

**One OpenAPI 3.1 spec** generates the validators, the TS and Python SDKs, the MCP tools, the Operator tool registry, the docs and the CLI. CI fails if any dashboard action lacks an operation.

**Request rules.**
- **422 on unknown fields**, with the field path and a suggestion.
- **An Idempotency-Key is required** on every create and dial (24 h). Dials are also unique on campaign + contact + attempt number.
- Versions use ETag and If-Match.
- `dry_run=true` on every write returns the plan, diff, cost and risk class.
- A dated `VP-Version` header is pinned per key, with 90 days' deprecation notice. Defaults never change silently.
- Resolved config can be read back.
- Errors carry `code`, `field`, `fix_url` and `request_id`. Rate limits are per key, with Retry-After.
- Billing, caps, keys, imports, exports and campaign status, cancel and retry are all on the API. Each of those is missing somewhere else.

**Keys.**
- Scopes: read, build, run and billing.
- Expiry, an optional IP allowlist, per-key daily and monthly INR caps, and a per-key concurrency limit.

**Cost endpoints.**
- `GET /usage?group_by=campaign|contact|agent|version|stack|day`
- Per-call cost lines, billed per second.
- `POST /campaigns/{id}/estimate`
- Balance and caps.

**Hooks.**
- `predial` veto, 1,500 ms. **Fail-closed by default:** the attempt is skipped, with the reason.
- `precall` personalisation, 800 ms during the ring. If it times out, the call proceeds without it.
- Inbound pre-answer.
- In-call tools and post-call events.

**Webhooks.**
- Slim payloads: id, type, time, a reference and a summary.
- Signed: HMAC-SHA256 over timestamp + body, a 5-minute replay window, and secret rotation with overlap.
- Retries with exponential backoff for 72 h.
- A delivery log with replay, in the UI or by API.
- Auto-disabled after 50 consecutive failures over at least 24 h, with notice.

**MCP.**
- Every tool carries its risk class.
- External, spend, policy and destructive tools called from a client's own assistant return an approval-card URL. A human taps it in VP.
- A model-emitted "approved" means nothing (HV law 12).

## 8. Integrations

Memory-omni owns auth and mapping. This module owns the connector framework, health, rate limits and cost lines.

**v1 connectors.**
- Google Sheets: read, hourly sync, and write-back to a results tab.
- **Payment webhooks** (Razorpay, Cashfree, PayU) as outcome sources. They power cost per earned outcome.
- The first design partner's CRM: LeadSquared, Zoho, Kylas or Salesforce. Others follow when 2 paying customers need one (L4C).
- WhatsApp utility follow-ups via Cloud API or a BSP, with a cost line per message.
- Generic signed webhooks and REST.

**What each card shows:** connection, last sync, records, errors, rate-limit state and cost. Failures become issues (intelligence M17).

Relay had 19 adapters, and no tenant ever connected one (`docs/harvest/se-live.md`). So v1 ships few connectors, each proven with a partner.

## 9. Scout: learning from the market, always

**Inputs.**
- The 67-URL watchlist (`research/2026-10-20/teardown/radar/watchlist.json`).
  - Vendors: 8 deep-set vendors, plus Pipecat, LiveKit, Ultravox, Ringg, Smallest, Gupshup, Plivo and Bland.
  - Item types: 17 status, 15 pricing, 6 changelog, 10 docs, 8 SDK/release and 7 sitemap.
- A new-entrant sweep over HN Algolia and Inc42 RSS.

**Cadence.**

| What | How often |
|---|---|
| Status feeds | daily |
| Pricing, changelogs, docs indexes, OpenAPI and SDKs | weekly, Monday 06:00 IST, using each item's `diff_method` |
| New-entrant sweep | weekly |
| Dashboard re-walks | monthly, by a human on authorised trials (`decision.2026-10-20.teardown-lines`) |
| VP's own call battery, run against competitors | quarterly, and on any tripwire |

An alert fires on any number followed by /min, ₹, $, % or a plan name.

**Tripwires.** Each names the hypothesis it would weaken.

| Tripwire | Weakens |
|---|---|
| India region | W3 |
| INR, UPI or GST billing | W8 |
| TRAI, DLT, NCPR, A2P or 1600 in a competitor's docs | W1 |
| Hinglish mode | W4, W5 |
| Memory GA, or a campaigns object with DNC | W1, v2 |
| Spend caps by key, signed webhooks or carrier failover | W8, W10 |
| New Indian telephony integration | W7 |

Six more fire without a mapped hypothesis: an all-in price of INR 4 or less; funding of USD 5M or more; a named BFSI customer; a self-serve launch; a deep-set vendor going enterprise-only.

**Outputs.**
- `context/inbox/*.json` entries graded observed, with date and diff path.
- A threat score per vendor, from the triage rubric.
- A market price index. Bolna fell 40% in 6 months (L4A).
- A refreshed W1-W10 scoreboard.
- A weekly Scout card, and a monthly owner digest. Its adopt and beat proposals go into VP's backlog.
- Model releases and price changes, fed to the adapter registry (req-08).

**Rules.**
- Public pages only; Scout never logs in.
- About 1 request per second per host.
- A 403 or 429 means "unreachable", never "no change".
- Raw captures are dated under `data/teardown/radar/`.
- A vendor claim never enters the graph as observed.
- Cost: negligible [I].

## 10. VP's agents vs what the client sees and approves

| Agent | Does | Client sees | Client approves |
|---|---|---|---|
| Treasurer | Estimates, reservations, caps, runway, invoices, GST, TDS credits, 2027 shock models, ladder checks | The launch card money block, the wallet, the Today spend line | Top-ups and cap raises (A2). The Treasurer stops at caps on its own (A3) |
| Concierge | Explains any invoice line from cost lines and the manifest; drafts disputes; hands to a human in IST hours | An answer with play-from-here | The dispute |
| Operator | Answers "kitna kharcha hua is hafte?" from the page queries, with n | Chart cards with an as-of time | Nothing; read only |
| Line keeper | Carrier health, the secondary CLI, A2P declarations | The Numbers health strip | Rent, and pre-approval of failover |
| Supervisor | Ends runaway calls at max duration | Issues | Take-over, by a human |
| Scout (internal) | Diffs the market and drafts inbox entries | VP's owner gets the digest | VP's owner merges |

**Flow: first money.**
1. Sign-up gives INR 300 of trial credit, plus free browser tests up to INR 200/day. No card.
2. At the first ring, the wallet offers UPI.
3. At launch, the Treasurer sets the campaign budget (p90 INR 3,480 incl. GST) and the workspace cap (INR 4,200).
4. Spend ticks per second.
5. At under 3 days of runway, Today offers "INR 10,000 top-up, ya auto-recharge ON?" with a mandate under INR 15,000.

**Flow: incident.**
1. Plivo dial failures reach 18% for 15 min.
2. The Line keeper moves new attempts to the pre-approved Vobiz CLI.
3. Within 15 min the client gets a Today issue and a WhatsApp notice, and the status page reads "degraded".
4. Interrupted calls are credited.
5. The campaign resumes. The RCA follows within 5 days.

## 11. Beyond everyone
1. A speed-and-cost receipt on every call: per-segment ms and per-second INR that sum exactly to the bill.
2. A predicted reply gap and an all-in INR at every stack choice, with n and date. 0 of 6 dashboards show one.
3. Spend caps on every API key, reservation before dial, and a bounded overdraft. A live call is never cut for money.
4. Per-second billing to the client while carriers bill VP in 30-60 s pulses; VP absorbs the difference.
5. VP-fault calls auto-credited; refunds any time, to source.
6. The estimate as a tracked forecast, with its accuracy shown.
7. A price ladder tied to measured cost, never to a cheaper voice.
8. A status page driven by synthetic Indian calls, where slow is its own status.
9. Outage-aware campaigns: no double dials, and one callback for every call VP cut.
10. No per-line fee.
11. `dry_run` on every write, and approval-card URLs for MCP, so a client's own AI can drive VP safely.
12. A sunset and price-shock shield: migrations are drafted with an ear test 60 days ahead.
13. Scout.

## 12. Emotional voice, memory, personalisation and self-learning here
- **Voice.**
  - The price follows the ear (req-02); no price drop ships on a lower-rated voice.
  - Expressive styles and sound tags carry no surcharge.
  - Warm pools and an opening synthesised during the ring protect timing, which is part of sounding human.
- **Memory.** INR 0.06-0.15 per 3-min call (memory-omni), and the core of Plus. Forget and opt-out are never billed.
- **Personalisation.** An 800 ms precall budget during the ring, cost per contact, and an openly priced dedicated voice.
- **Self-learning.**
  - Coach simulations run on the test budget and test keys, with experiment cost shown. The learning module owns the statistics.
  - VP's own learning from the market is Scout.

## 13-15. Metrics, phasing, risks
Metrics, phases, risks and open questions are in the structured fields.

**Phasing.**
- **v1:** billing, caps and the registry; voice-rt in India; one spec; failover and status; Scout weekly.
  - Set by: W8 and W10 failing at every incumbent; 0 of 5 vendors capping spend by key; billing at 107 of 459 coded Indian complaints.
- **v2:** 99.9% availability, active-active India regions, declared mid-call fallback and safe speculation.
- **v3:** the INR 2.49 and 1.99 ladder on self-hosted speech at 1.6-2.5M min/month.
  - Set by: COR §2 and SY18 §4.

**Rejected ideas avoided.**
- On price and cost: `rejected.2026-10-17.parity-undercut`, `rejected.2026-10-17.per-minute-launch`, `rejected.2026-10-19.gemini-live-at-rs2`, `rejected.2026-10-19.maya-1p3` (always use the meter, never code constants).
- On keys and quota: `rejected.2026-10-20.gemini-tier1-for-volume`, `rejected.2026-10-20.free-key-rotation`, `rejected.2026-10-20.or-key-limit-as-balance`.
- On fallbacks and attribution: `rejected.2026-10-20.silent-fallback-in-tests`, `rejected.2026-10-20.preset-override-attribution`.
- From the harvest: `rejected.harvest.02` (no cheap-to-strong routing), .05, .11, .14, .16 and .17.
- On latency: `rejected.2026-10-17.speculative-release`, `rejected.2026-10-17.ohio-latency`.
- On telephony, learning and API scope: `rejected.2026-10-17.acs-direct-routing`, `rejected.2026-10-17.cross-tenant-pooling`, and `rejected.2026-10-20.acct-retell-csv-import-by-api-key` (the lesson: everything must work by API key).
