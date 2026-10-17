# Verification of lane l4a-competitors

Verifier: adversarial pass, 2026-10-17. I re-opened the cited pages live with WebFetch and curl. I re-pulled Common Crawl WARC records with the lane's own `code/cc_history.py`, writing to scratch and not to the lane folder. I also recomputed the complaint and parity tables from the lane's CSVs and checked the vendor `llms.txt` indexes myself.

The WebSearch budget ran out at my first search, so every independent check below comes from primary pages, Common Crawl, Discourse JSON or sibling-lane data. I edited none of the lane's other files and made no commit.

## Verdicts

| # | Claim (short) | Verdict | One-line reason |
|---|---|---|---|
| 1 | Posted Indian prices sit at ₹3.4–6/min | **weakened** | Sarvam, Ringg and Bolna check out live. MyOperator's ₹10,000 plan is gone from the live page; it came from a Jun-2026 capture that the lane's own Sep-2026 capture had already superseded. SquadStack's ₹2–5 is not on `/pricing`. Other Indian vendors post ₹8–18. |
| 2 | Indian self-serve prices fell sharply; US prices stayed flat | **weakened** | All the data points reproduce. The 66% Ringg figure mixes a USD-to-INR re-denomination with a price cut (USD list stayed $0.10 from Mar to Oct 2026). Bolna's floor barely moved (5¢ to 4.2¢). VoiceGenie's "flat" rests on two points. |
| 3 | Human ₹8.86/min; Indian AI is 38–68% of human; US platforms over Twilio cost ₹8–17 | **weakened** | The l2 verifier already moved the human figure to ₹6–9 (₹6.3 at 200 talk-min/day). Vapi plus Twilio India works out to ₹11.6–17.5, not ₹8–17. ₹8 is reachable only with Indian SIP. |
| 4 | Self-serve platforms leave India compliance to the buyer; only Sarvam's index mentions DND/DLT | **weakened** | Every cited page says what is claimed. But "only Sarvam" is an artefact of scanning titles only (Bolna's pages do document DLT), and Ravan (self-serve) claims DND-registry scrubbing. |
| 5 | None of 12 documents auto-learning or dialect selection; 3 US vendors have memory; Ringg is the only Indian vendor with A/B | **weakened** | True at the docs-index level. Indian vendors' marketing contradicts it: SquadStack claims "Continuous A/B testing", Ringg and Exotel claim memory, and MyOperator claims self-learning. Vapi documents an "Improvement Suggestions" API that the matrix missed. |
| 6 | Production complaints are plumbing and service, not voice quality | **weakened** | Every count reproduces. But a help forum carries questions, not complaints. The hand-coded set is 36/56 Trustpilot. Bolna's GitHub issues and the India-relevant subset tilt towards speech and language. |
| 7 | Vendors claim 200–600 ms; users report multi-second turns | **confirmed** (fix the examples) | All 8 vendor claims are on the live pages. The l4b lane measured multi-second turns. The cited Retell "3,000 ms" thread is mostly the user's own `endpointing_ms=3000` setting. |
| 8 | Mid-market falls between enterprise floors and build-it-yourself PAYG | **weakened** | All four facts check out. But MyOperator now sells a managed "AI Team" plan to SMBs with an agent manager and engineers who build the agents, and Sarvam's own tiers span 4k–2 lakh min/month. |

## Reasoning per claim

### 1. Posted Indian prices at ₹3.4–6 per connected minute: weakened

Re-opened live on 2026-10-17:

- **Sarvam (confirmed, with caveats).** PAYG is ₹3.50 below 1,000 min. Pro is ₹3.25, Growth ₹3.15, and Business ₹3.00, but **Business is marked "coming soon"**. Billing is in 60-s pulses. Vobiz telephony is ₹0.20 per 30-s pulse (= ₹0.40/min), and forwarding costs ₹0.40 per pulse (= ₹0.80/min). All prices exclude GST.
  - The lowest rate available today is ₹3.15 + ₹0.40 = **₹3.55**, not ₹3.40.
  - With 60-s pulses, short calls (COD confirmation, reminders) cost noticeably more per real minute.
- **Ringg (confirmed).** ₹6 per connected minute, with STT, TTS, LLM and telephony included. There is an unstated monthly minimum commitment and a ₹499/month number.
- **Bolna (confirmed).** 6.00¢ (₹5.52). The page's own INR figure implies about ₹92/$, while the lane's JSON uses ₹88. "Telephony and the platform fee are added per minute." Bolna's docs give the platform fee as $0.02/min under BYOK. **The all-in price is therefore probably above ₹6**, so the top of the range is not an all-in number.
- **MyOperator (refuted as a live price).** The live `/pricing` page shows the AI plan only as "AI Team — Custom", with no voice per-minute rate.
  - The ₹10,000/month, 2,000-min, ₹8/conversation-overage, annual-billing plan comes from the **2026-06-17 Common Crawl capture**. I re-pulled that capture and the numbers match.
  - The lane's own index also holds a **2026-09-12 capture**. I re-pulled it: the plan was already replaced by "AI Team: Custom … Managed Services: AI Agent Manager, FDE for agent building". The lane did not use it.
- **SquadStack (mis-sourced).** `/pricing` and its FAQ JSON-LD say: "Why isn't pricing listed publicly? … rather than publishing a number that applies to nobody."
  - The ₹2–5 appears on the **homepage** FAQ instead, as a generic market statement: "Voice AI in India is priced per minute … typically between ₹2 and ₹5". Schema markup on the same page gives minPrice 2 / maxPrice 5. The same answer says SquadStack includes dialer and telephony.
  - On top of that, SquadStack charges a setup fee per use case.
- **Indian-origin vendors left out of the range** (from the lane's own `pricing-history.json`, re-checked live):
  - Smallest Atoms: $0.09–0.21 all-in, about ₹7.9–18.5.
  - Ravan: $0.10 Lite down to $0.04 Scale, plus plan fees of $29–497/month.
  - VoiceGenie: $0.20, about ₹17.6.

**Corrected statement.** The cheapest Indian self-serve list prices cluster at about ₹3.5–7 per connected minute all-in: Sarvam ₹3.55–3.90 with its telephony, Ringg ₹6, Bolna about ₹6–7 once telephony and platform fee are added. Other Indian-origin vendors post ₹8–18. SquadStack's "₹2–5" is a generic FAQ statement, not a rate card. MyOperator no longer publishes an AI voice price.

### 2. Indian self-serve price decline vs flat US prices: weakened

I re-pulled these Common Crawl WARCs and they reproduce:

| Vendor | Capture | What the capture shows |
|---|---|---|
| Ringg | 2025-09-08 | "$0.20 / Minute Per Connected Call" |
| Ringg | 2026-03-14 | "$0.10 / Minute" |
| Ringg | 2026-09-05 | "₹6 /connected minute / $0.10 /connected minute" |
| Bolna | 2025-12-08 | Starter $0.100/min, Pilot $0.050, "as low as 5c (INR 4)" |
| Bolna | 2026-03-13 | 7¢ / 6¢ / 5¢ monthly plans, Pilot 5¢ |
| Vapi docs | 2024-06-23 | "flat 5¢/min" |
| Retell | 2024-12-06 | "$0.07-$0.31 /min" (still the headline live today) |

The capture index holds 92 rows with a capture timestamp across 12 crawls (2023-50 to 2026-39), as claimed.

Where the claim overstates:

- **Ringg's "66%" mixes two things.** The USD list fell 50% ($0.20 to $0.10) and then stayed at $0.10 from Mar 2026 to Oct 2026.
  - The Mar-2026 page already had a USD/INR toggle whose INR value is client-rendered and not in the capture. So the INR price before Sep 2026 is unknown.
  - ₹6 against ₹17.6 compares a regional INR price with a converted USD price.
- **Bolna's entry price fell** from 10¢ (the Starter *bundle*, not PAYG) to 6¢. Its floor moved only from 5¢ to about 4.2¢ (pilot), which is not sharp. Bolna is also not all-in.
- **VoiceGenie's "flat" rests on two observations** (2024-06 and live). The 2025-09 capture shows only "Loading pricing plans…".
- **Coverage before 2025 is thin.** Ringg has captures only from 2025-09, Bolna from 2025-12, and Sarvam's voice-agent page has none.

**Corrected statement.** In USD, Ringg's list price halved between Sep 2025 and Mar 2026 and has since been flat. It now also posts ₹6 in INR, but the earlier INR price is unknown. Bolna's entry price fell from 10¢ to 6¢ while its floor stayed at about 4–5¢. Vapi's $0.05 platform fee and Retell's $0.07–0.31 headline did not change.

### 3. Human cost and price ratios: weakened

- **Twilio India rates are confirmed:** $0.0496/min mobile, $0.0699/min landline. Vapi's calculator also confirms $0.082–0.129/min.
- **The arithmetic does not give ₹8.** $0.082–0.129 + $0.0496–0.0699 = $0.132–0.199/min, which is **₹11.6–17.5 at ₹88**. The low end of "₹8" needs Indian SIP or BYOC (about ₹7.2 + ₹0.4–0.8), not Twilio.
- **The human anchor is high.** The ₹8.86 median comes from l2. The l2 verifier (`lanes/l2-economics/verify.md`, claim 7) weakened it: all three of the lane's own cross-checks come out lower, and at about 200 talk-min/day the same model gives about ₹6.3. A defensible range is ₹6–9.
- **Recomputed ratios.** At ₹6.3, Indian list prices are 56–95% of a human minute (₹3.55–6), not 38–68%. US platforms over Twilio cost 1.8–2.8× a human minute.
- **Not examined by the lane:** whether international caller IDs (Twilio US numbers calling Indian mobiles) are commercially workable under DoT and TRAI spam controls.

### 4. Compliance left to the buyer: weakened

**Confirmed on the cited pages:**

- **Sarvam DND page:** an org-wide suppression list (manual, bulk or API), and the warning "Calling compliance is your responsibility … Make sure you have consent". It does not name TRAI, NCPR or DLT.
- **Bolna regulated numbers page:** the customer registers on the TATA Teleservices DLT portal as a Principal Entity, and "a payment link for ₹5,900 will be generated". 140-series numbers are for promotional calls, 160-series for transactional calls.
- **Bolna guardrails page:** "It is off by default."

**Where it overreaches:**

- **The "only Sarvam" count is a scanning artefact.** `parity_scan.py` matches only page titles and the first 200 characters of each description. Bolna's DLT page is titled "Obtaining regulated phone numbers", so the scan missed it even though its body covers DLT.
  - The index counts reproduce. I count about 3,200 entries across 12 indexes I re-downloaded, which fits "~3,500 across 16".
- **Counter-examples to the generalisation:**
  - **Ringg's docs** have calling windows (default IST) and per-person call caps.
  - **Ravan's homepage** (self-serve, $29+/month) claims lists are "scrubbed against DND registries before a single dial goes out". It also claims regulator-aligned windows and DPDP consent trails. These are vendor claims and unverified.

**Corrected statement.** Most self-serve platforms make the buyer responsible for DLT and Principal Entity registration, consent and NCPR scrubbing (Sarvam, Bolna, Vapi, Retell and others). At least one Indian self-serve vendor (Ravan) markets DND scrubbing, and Ringg ships calling windows. Docs coverage of these controls is thin, not absent.

### 5. Parity: no auto-learning or dialect selection; memory only at 3 US vendors; Ringg the only Indian A/B: weakened

- **`parity-wide.csv` reproduces the counts:**
  - A/B "yes": Ringg, Vapi, Retell, Bland, ElevenLabs.
  - Memory "yes": Retell, Bland, Synthflow.
  - No "yes" for auto-learning or dialects.
- **I re-confirmed these in the live `llms.txt` files:**
  - Retell: "A/B Testing" and "Contact memory".
  - Bland: "Create Experiment" and the Contact Memory API.
  - Synthflow: "Memory of Past Calls".
  - Vapi: "Traffic splitting".
  - ElevenLabs: "Experiments".
  - Ringg: "split call traffic for A/B".
- **Contradicting evidence:**
  - **SquadStack** (Indian, one of the 12 read in depth): its live pricing page lists "ROI Engine — Continuous A/B testing on prompts and flows". Its ROI calculator says results compound "at 15% as the system learns your customer base". This is managed-service marketing, not docs, but it breaks "Ringg is the only Indian one".
  - **Memory claims from Indian vendors:**
    - Ringg's homepage says agents "remember all your conversations across channels".
    - Exotel has a "Persistent Memory Layer".
    - Ravan lists "agent memory" on its Scale plan.
    - None of these is in the docs.
  - **Vapi's docs** include "Generate Improvement Suggestions" (simulation runs), yet the matrix codes Vapi auto-optimisation as unknown. Retell has "apply suggested fixes" and Gnani has "Validate Prompt … optimization recommendations". These are assisted rather than automatic, so "no automatic learning" survives, but the matrix under-codes them.
  - **MyOperator** (not in the 12) advertised "Self-learning from call data" in Jun 2026.
- **Dialect:** ElevenLabs and Smallest offer *accent* selection or filtering on voices. No vendor offers Indic *dialect* selection, so that part holds.

### 6. Complaints dominated by plumbing and service: weakened

- **The counts reproduce exactly from `complaints.csv`:**
  - Retell, 688 titles: TELEPHONY 226 (32.8%), TOOLS 103, ACCOUNT_UI 99, BILLING 67.
  - ASR 36 + TTS 31 + TURN_TAKING 27 + LATENCY 14 = 108.
  - Hand-coded, 56 items across 8 vendors: SUPPORT 18, BILLING 13.
- **My blind spot-check** of 40 random Retell titles agreed with the auto-code on about 34–35. That fits the stated 33/40, but the lane's 40-item sample is not saved anywhere, so 33/40 itself is not reproducible.
- **The first bucket is uncategorised.** The second-largest Retell bucket overall is OTHER_QUESTION (125), and the claim omits it.
- **Framing problems:**
  1. A "Support Help" forum holds setup and how-to *questions*, such as country whitelisting, SIP IP ranges and transfer configuration. These are not production complaints, and telephony configuration naturally dominates such a channel.
  2. 36 of 56 hand-coded items are Trustpilot reviews. That channel skews towards billing and support disputes, and 10 Exotel items date from 2019–2023.
  3. The Indian sources tilt the other way. In Bolna's GitHub issues (n=125), ASR 14 + TTS 13 + TURN_TAKING 14 + LATENCY 5 = 46 (37%), against TELEPHONY 10. In the India-relevant subset (n=36), LANGUAGE (9) is second after TELEPHONY (12).
- **Smaller issues:**
  - The CSV dates for the Retell titles run 2025-12-09 to 2026-10-15, not 2025-08 to 2026-10. The docstring says topics were "active" from 2025-08.
  - One Vapi Trustpilot row (2024-07-26) appears twice with identical text.

**Corrected statement.** In US-centric support-forum questions, telephony and integration plumbing dominate. In review sites, support and billing dominate. In Indian developer issues and India-relevant items, speech and language problems are about as common as plumbing.

### 7. Latency: vendor claims vs user reports: confirmed (fix the examples)

- **Every vendor claim is on the live page today:**
  - Gnani: "<200ms P95"
  - Bolna: "<300ms latency"
  - Ravan: "Sub-300ms"
  - Exotel: "sub-300 ms voice latency"
  - Ringg: "less than 400 ms"
  - Sarvam: "<500ms"
  - Vapi: "<500ms average latency"
  - Retell: "~600ms latency"
- **Independent support from l4b.** The `lanes/l4b-measured/data/measurements.csv` browser-demo harness shows:
  - Vapi: p50 2,298 ms, p90 3,252 ms (n=61 turns).
  - ElevenLabs: p50 3,758 ms (n=72).
  - Harness calibration baseline: about 1.1 s.
  - So "none of these are our measurements" is out of date: our own data back up the claim.
- **Fixes to the examples:**
  - **Retell "3,000 ms"** (community t/3416): staff traced the residual to the user's own `endpointing_ms=3000`. With 500 ms endpointing the average was 1,800 ms. A better Retell example is t/3539 (2026-08-25): "overall e2e time is ~4.2 sec" on the first response.
  - **Bolna #235** ("for every sentence I say it takes exactly 4 secs") was opened 2025-07-23. The lane's TSV date, 2025-09-03, is the close date.
  - **Vapi support thread 23432400** returned HTTP 429 when I re-opened it. The lane itself marks the quote as a search-result excerpt.

### 8. The mid-market gap: weakened

- **Confirmed:**
  - Sarvam Enterprise starts "From 2 lakh minutes a month".
  - Synthflow lists only "Enterprise contracts start at $30,000 annually", both live and in the 2026-09-10 capture. The 2026-06-16 capture still had PAYG.
  - SquadStack charges "a one-time setup fee … for each use-case".
  - Gnani's `/pricing` redirects to `/book-demo`.
  - Bolna's Trustpilot shows 4 reviews, all 1-star (TrustScore 2.6), covering an undelivered pilot, unanswered refund requests, demo no-shows and poor support.
  - The live Bolna page says "You build your own agent in Agent Studio".
- **Caveats:**
  - ₹6 lakh is an upper bound. Sarvam's Enterprise rate is custom and probably below ₹3.
  - The Bolna sample is n=4.
  - **Counter-evidence:**
    1. **MyOperator**, an SMB CPaaS with 12,000+ businesses, now sells "Business AI Operator — CPaaS + AI Agents + Managed Services". The plan includes a dedicated AI Agent Manager, "FDE for agent building" and "Agent performance optimization" (live page and Sep-2026 capture). That is a managed mid-market offer, with custom pricing.
    2. **Sarvam's self-serve tiers** run from Growth (4,000+ min, 30 concurrent calls) to Business (16k–2 lakh min, ₹50,000/month in credits). That range is the mid-market by volume, though the buyer still builds.

**Corrected statement.** Enterprise-led vendors set high floors and self-serve platforms expect the buyer to build. But CPaaS incumbents (MyOperator, and probably Exotel) are moving into managed AI agents for SMBs. The gap is narrowing rather than empty.

## Sources I opened

- Live pages:
  - Pricing: sarvam.ai/products/voice-agents/pricing, ringg.ai/pricing, bolna.ai/pricing, myoperator.com/pricing, squadstack.ai/pricing, synthflow.ai/pricing, vapi.ai/pricing, retellai.com/pricing, smallest.ai/pricing, ravan.ai/pricing, twilio.com/en-us/voice/pricing/in.
  - Homepages and pages: squadstack.ai (homepage), gnani.ai, bolna.ai, ringg.ai, vapi.ai, retellai.com, sarvam.ai/products/voice-agents, exotel.com, ravan.ai, gnani.ai/pricing (redirects to book-demo).
  - Docs: docs.sarvam.ai/voice-agents/deploy/campaigns/dnd, bolna.ai/docs/obtaining-regulated-phone-numbers, bolna.ai/docs/outbound/calling-guardrails.
  - Reviews and threads: trustpilot.com/review/bolna.ai, github.com/bolna-ai/bolna/issues/235, community.retellai.com/t/3416.json, /t/3539.json.
- `llms.txt` docs indexes for Smallest, Sarvam (main and voice-agents), Bolna, Gnani, Ringg, Ravan, Retell, Bland, Synthflow, Vapi and ElevenLabs.
- Common Crawl WARCs re-pulled from data.commoncrawl.org:

  | Site | Captures |
  |---|---|
  | Ringg | 2025-38, 2026-12, 2026-39 |
  | Bolna | 2025-51, 2026-12 |
  | Vapi docs | 2024-26 |
  | VoiceGenie | 2025-38 |
  | Retell | 2024-51 |
  | Synthflow | 2026-25, 2026-39 |
  | MyOperator | 2026-25, 2026-39 |

- Sibling lanes: `lanes/l2-economics/verify.md` and `cost-model.json`, `lanes/l4b-measured/data/measurements.csv`.
