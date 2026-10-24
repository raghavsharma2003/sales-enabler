# Research brief: Vyakti Platform (VP). Choose the wedge, with evidence

Status: draft for owner approval, 2026-10-17. Rewritten from the owner's research request so the task goes deeper
rather than wider.

## 0. Context (fixed facts, do not re-derive)

- VP ("Vyakti Platform", working name; it collides with the cloning product in html-portfolio, so rename later) is a
  **new venture**. It has no customers and no product yet. It will offer Indian voice-AI agents that are human-like,
  emotional, relational, self-improving and hyper-personalised, sitting inside an AI command centre for the whole
  company (CRM, ERP, campaigns, WhatsApp, email, lead generation, scraping, SEO/AEO, analytics).
- **CarbonSettle is an unrelated carbon-compliance business.** Its `command_centre` repo is a reference only, for what a
  daily-use company operating product feels like. It is not a market, an ICP, a data source or a buyer hypothesis.
- Build constraints: Azure-only for AI and compute when we build (research may cite and benchmark other vendors for
  comparison). The owner prefers in-house components to push cost down. Neon Postgres is allowed. Never touch Taxila
  or Vyakti Azure resources.
- Inherited evidence lives in `docs/harvest/` and `context/graph.json`: Taxila voice latency and cost, Meera realism
  findings, CommandCentre outbound lessons, and the 38 inherited laws. Use it and cite it; do not re-measure what is
  already measured unless the claim is load-bearing.
- Out of scope as large consumer internet: Blinkit, Swiggy, Zepto, Zomato and similar companies with in-house teams.

## 1. The decision this research must support

Choose **one beachhead**: industry × use case × call direction (inbound / outbound-consented / outbound-cold) × buyer
role × pricing unit. Add **two ranked alternates**, and a **product thesis** for the beachhead that says which of the
owner's ideas matter there and which do not.

The research is finished when that choice can be defended from evidence, every recommendation carries a written kill
criterion, and the claims have passed the external checks in section 6. "A survey of the whole market" is not the
goal; it is an input.

Not acceptable as primary evidence: paid market-size reports (Grand View, Mordor and similar), vendor blog
listicles, "top 10 voice AI" articles, and any claim without a date. They may appear only as a cross-check.

## 2. Hypotheses. Each gets a prediction written before work, a test, and a kill condition

**H1. Regulation decides the map.** Which combinations of pre-sales / post-sales × inbound / outbound × consented /
cold are lawful for an AI caller in India today and in 12 months?
- Sources: TRAI TCCCPR 2018 and every amendment, DLT header and template registration, the 140 and 160 number series,
  DND/NCPR, any AI-specific calling rule (verify the claim in the harvest that one has applied since 2026-03-10),
  the DPDP Act and Rules with their phase-in dates, RBI recovery and fair-practice rules (calling hours), and
  IRDAI and SEBI telemarketing rules.
- Kill: any use case that needs consent the buyer cannot realistically produce.

**H2. Unit economics: an all-in cost below ₹2 per connected minute is reachable at our quality bar on Azure.**
- Baseline: Taxila's measured cascade AI cost is about $0.027/min (≈ ₹2.4 at ₹88/$), before telephony.
- Build the full cost stack (telephony, ASR, LLM, TTS, realtime infra, storage, support, margin) from the Azure
  Retail Prices API, measured tokens and audio seconds per minute, and CPaaS/telco rate cards. Compare managed Azure
  models against self-hosted open models on Azure GPUs. Run a sensitivity analysis: which three inputs move ₹/min most?
- Also answer: what does the buyer actually compare us against? The likely answer is a telecaller's cost per outcome.
  Which pricing unit wins: per minute, per call, per outcome (lead qualified, rupee collected, booking) or per seat?
- Kill: no architecture reaches the target without failing the latency or realism bar. Then the target or the
  pricing unit changes, not the quality.

**H3. Some segment has acute pain, real current spend and a short path to buy.** Score candidate segments; the seed
list can be extended and nothing on it is assumed:
- lending and collections (NBFC, MFI, BNPL), insurance renewals and claims
- edtech and coaching admissions
- real-estate lead qualification
- D2C and e-commerce: COD confirmation, NDR (failed delivery), reviews and repeat purchase
- healthcare and diagnostics appointments and reminders
- auto dealers: test drives and service reminders
- travel and hospitality
- telecom and ISP retention
- consumer fintech and SaaS app onboarding

For each segment, score: pain intensity, current spend (telecaller headcount × salary from job-post data), call
volume, regulatory risk (from H1), integration difficulty, sales cycle, payment behaviour and willingness to pay.
Size each segment **bottom-up** (count of firms from MCA/GST/Udyam data by sector × seats × minutes × price) as a
range from a Monte Carlo model, then reconcile it against top-down figures.

**H4. Incumbents fail Indian buyers in ways we can measure.**
- Measure, don't read. Build the same agent on Bolna, Vapi, Retell, ElevenLabs Agents, Sarvam, Smallest.ai, Ringg,
  Ravan.ai, Gnani and Synthflow (extend the list). Run one scripted test battery covering:
  - Hinglish, Bhojpuri-Hindi and Tamil-English callers
  - short answers ("haan", "ok", "hmm")
  - interruptions, background noise, silence, and Indian numbers and dates
- Record p50/p95 response latency, barge-in correctness, word error rate, recovery, monologue length and the cost on
  the actual invoice.
- Build a feature parity matrix against the owner's idea 6: everything the leaders offer.
- Cover the adjacent incumbents that matter for idea 7, because these are the real competition for a company
  command centre: Zoho (CRM + Zia), LeadSquared, Kylas, Freshworks, Exotel / Ozonetel / Knowlarity, Gupshup / Interakt
  / AiSensy / WATI, Squadstack (human plus AI telecalling sold per outcome), Convin and Observe.ai.
- For each, record funding, revenue from MCA filings where available, pricing history from Wayback snapshots, open
  source code (Bolna's repository is public) and complaints mined from G2, Reddit, LinkedIn, X and app stores.
- Kill: if the best incumbent already passes our battery at ≤ our target price for the beachhead, the wedge must
  move.

**H5. Human-likeness and emotional or relational behaviour lift a business outcome, not just likability, in at least
one segment.**
- Find the evidence: published studies, the owner's Meera measurements, competitor case studies with numbers.
- Name where warmth hurts, for example collections, deception risk, and AI-disclosure rules.
- Kill: no outcome evidence and no way to test it cheaply.

**H6. Dialect and accent matching is preferred and producible.**
- Run a blind preference test with listeners from at least three regions (for example Bihar, Tamil Nadu,
  Maharashtra). Compare a matched accent and dialect mix against neutral Hinglish, scored on trust, comprehension
  and patronising-ness.
- Check whether Azure voices or in-house TTS (for example AI4Bharat models fine-tuned on Azure GPUs) can produce the
  matched voice acceptably.
- Check how a region can be inferred lawfully and accurately: number series by telecom circle break under number
  portability; CRM fields; language detection in the first turn.
- Kill: listeners do not prefer it, or we cannot produce it at our quality bar.

**H7. Self-learning is feasible at the call volumes real buyers have.**
- Run a power analysis: how many calls are needed to detect a given change in drop-off or conversion? With 100
  calls, the 95% interval on a 50% rate is roughly ±10 points.
- Simulate bandit-based script learning against an A/A noise floor.
- Separate what can learn per contact (memory, preferences) from per cohort (script lines) and per segment
  (playbooks).
- Collect evidence of production systems that do this, and how they guard against learning the wrong thing.
- Kill: the volume needed exceeds what the beachhead's buyers place in a month.

**H8. Company context and the command centre are a wedge, not a delay.**
- Does richer context (CRM, order data, WhatsApp history, company knowledge) measurably improve call outcomes?
- How did Indian SMBs adopt suites before (Zoho, Tally, LeadSquared, Odoo)?
- Does a whole-company command centre help win the first customer, or does it delay it?
- Kill: buyers in the beachhead want a point tool that plugs into what they already have.

**H9. The technology frontier, as dated curves rather than slogans.**
- What is in production now versus coming: full-duplex speech-to-speech, turn-taking models, Indic ASR and TTS,
  voice cloning and consent, on-device inference.
- Fit cost per million tokens and per audio minute over time from archived price pages, and forecast ₹/min with
  dates and confidence ("voice AI cost goes to zero" becomes a curve).
- Benchmark the top candidates ourselves on Indic data (IndicVoices, Kathbath, Vistaar), on Azure where possible:
  word error rate, latency and blind listening.
- Kill: any architecture claim that our own benchmark contradicts.

**H10. Distribution: we can reach the beachhead's buyers at an acceptable cost.**
- How do they buy telephony and software (CPaaS resellers, WhatsApp BSPs, Zoho/Tally partner networks, direct)?
- Typical ticket size, payment terms, sales-cycle length, churn, and any evidence on cost to acquire a customer.

## 3. Raw material to start from

- **Buyers themselves.** 25–40 discovery conversations with people who run telecalling or CX today, and their
  artefacts: call scripts, disposition sheets, dialler reports, telecaller pay and attrition, CRM exports. The owner
  runs these; the research prepares the target list, outreach and guide.
- **Real Indian call audio.** Public corpora (AI4Bharat IndicVoices, Kathbath, Shrutilipi, Vistaar), competitor demo
  calls we record ourselves, and anonymised recordings shared by interviewees.
- **Primary regulatory text.** TRAI regulations and gazette amendments, DoT orders, the DPDP Act and Rules, RBI,
  IRDAI and SEBI circulars, and stakeholder responses to TRAI consultations (they expose industry economics).
- **Money trails.** MCA/ROC filings for revenue (Exotel, Ozonetel, Knowlarity, Squadstack, Gnani, Haptik,
  LeadSquared and others), funding rounds, GeM tenders.
- **Demand signals.** Telecaller job postings by city and industry on Naukri, Apna and WorkIndia: volume and salary
  bands, which together are the spend we would replace.
- **Price history.** Competitor pricing pages over time (Wayback CDX), the Azure Retail Prices API, CPaaS and telco
  rate cards.
- **Tech primaries.** Papers, model weights and cards, open-source code (Bolna, Pipecat, LiveKit Agents),
  leaderboards, and our own benchmark runs.
- **Voice of the customer.** Complaints about existing voice bots and telecalling vendors.
- **Our own measured history.** `docs/harvest/*` and `context/graph.json`.

## 4. Methods and tools

- Market sizing: bottom-up counts reconciled with top-down figures, as Monte Carlo ranges, never a single point.
- Customer discovery: Mom-Test / jobs-to-be-done interviews about past behaviour, not opinions. Van Westendorp and
  Gabor-Granger questions for price. A segment scorecard with weights fixed before scoring.
- Competitor measurement: one scripted battery. Callers are sim-lab personas rendered as audio and fed to browser
  demos through Chromium's fake-microphone input in Playwright, or to phone demos the owner dials. Output is
  recorded and scored.
- Review mining: scrape complaints and code them into a taxonomy.
- Economics: a spreadsheet cost model fed by the Azure Retail Prices API and measured usage, with a sensitivity
  (tornado) chart; managed versus self-hosted.
- Technology: a benchmark harness on Azure (sales-enabler resources only), earbench-style blind ABX listening, and
  cost-curve fitting (log-linear / Wright's law).
- Statistics: power analysis and a Thompson-sampling simulation for H7.
- Discipline: a prediction register written before each study and scored after; an evidence ledger in which every
  claim carries source, date, method and confidence; an adversarial pass on each load-bearing claim that tries to
  refute it.

## 5. Deliverables

1. Evidence ledger (`research/2026-10-17/ledger.json` plus a readable version), merged into `context/graph.json`.
2. Regulatory use-case map (H1).
3. Unit-economics model with sensitivity analysis (H2).
4. Segment scorecard with bottom-up size ranges (H3).
5. Competitor bench (recordings, measurements, invoices, parity matrix) and teardowns (H4).
6. Evidence notes for H5 and H7, including the power analysis and simulation.
7. Listener-panel protocol for H5 and H6, ready to run.
8. Tech radar with our own benchmark numbers and dated cost-curve forecasts (H9).
9. Distribution note (H10).
10. Founder interview kit: a target list of 60 companies across the top three segments, outreach copy, interview
    guide, pricing questions and a note template.
11. Final visual report: the wedge recommendation plus two alternates, each with kill criteria; a gap map of what
    nobody serves well; and which of the owner's eight ideas matter for the wedge, which later, and which not at all.

## 6. What counts as proof (other than the researcher or the owner)

- **Buyers' money.** Paid pilots or signed LOIs at a stated price from the chosen segment, for example at least 3 of 15
  qualified prospects. Stated interest does not count.
- **A blind listener panel** from target regions rating our demo against competitors (ABX/MOS), recruited from
  outside the team.
- **Competitors' own invoices and measured latencies** on identical test calls.
- **Regulator text,** and ideally a review of the use-case map by a telecom/DPDP compliance lawyer.
- **Independent reconciliation.** Bottom-up sizing within a stated factor of independent signals (job-post volume,
  incumbent revenues).
- **Pre-registered predictions** scored after the fact, including the ones we got wrong.
- **Outside domain reviewers:** a telecalling operations head, an ex-employee of a voice-AI company, a CPaaS
  salesperson.
- **Finally, a concierge pilot:** one real, consented campaign for one business, compared with its human baseline.

## 7. Execution

- Run as parallel lanes: regulation; economics; segments and demand; competitors (measured); technology frontier and
  benchmarks; learning statistics; distribution. Each lane ends with an adversarial verification pass, then one
  synthesis.
- Only the owner can do: discovery interviews; competitor sign-ups that need a phone OTP or payment; placing calls to
  phone-only demos; recruiting listeners; paid pilots. Prepare these, list them, and do everything else.
- Azure spend: benchmarks only, inside sales-enabler resources, within a budget the owner sets.
- Log every phase to `context/` (ledger, decisions with reversal conditions, measurements with n, method and date,
  rejections) before starting the next.
