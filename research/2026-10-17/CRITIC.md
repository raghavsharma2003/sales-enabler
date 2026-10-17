# VP research: completeness critique

Date: 2026-10-17. Role: completeness critic, a workflow step after synthesis. Not committed.

**Inputs read in full:**
- `vp-research-brief.md` (sections 2-6), `predictions.md` and `SYNTHESIS.md`.
- Every `lanes/*/verify.md` (l2, l3, l4a, l4b, l4c, l5, l6, l7, l8).
- The l1 primary outputs (`usecase-map.csv`, `sources.csv`, `timeline.csv`, `enforcement-stats.csv`, `blocked-sources.csv`).
- The founder kit (`targets.csv`, `plan.md`, `interview-guide.md`), the listener panel (`stimuli-qa.csv`, `plans/balance.txt`, `app.js`).
- `context/graph.json` and `context/events.jsonl`.

**Two facts about the inputs themselves:**
- **No `lanes/*/report.md` exists.** No lane wrote one; the harness blocked them. I checked the git history as well.
- **l1 has no `verify.md` on disk.** SYNTHESIS says its verification "is in the workflow digest". l1 is the only lane whose adversarial pass cannot be audited, and it is the lane the beachhead's regulatory argument rests on.

Where I checked something myself, I say so. Everything else points to the lane or verifier file that holds the evidence.

---

## 0. Bottom line

The synthesis is unusually honest about its limits, and most lanes are reproducible. Four problems still undercut the
decision as written. Each can be fixed, and three can be fixed without the owner.

1. **The product thesis claims measurements it does not have.** §3 says incumbents "fail in four places, all of which we
   measured". The evidence is the homepage demo agents of three US platforms (Vapi, ElevenLabs, Ultravox):
   - each demo had its own prompt and settings, and Vapi's relied on automatic language detection;
   - every call went through a US proxy;
   - no Indian vendor was measured.

   The H4 kill test (our renewal agent spec built on each platform) was not run. Sarvam's anonymous live widget could be
   measured today without the owner [l4bv §1].
2. **The beachhead's own quality kill criterion is already tripped, or untested, on our own numbers.** Kill criterion 6
   requires a clean-turn p50 of 1.5 s or less. Our measured paths are:
   - Voice Live: 2.27-2.63 s;
   - our own cascade: an estimated 2.2-4 s;
   - the inherited stack: 4.0-4.8 s end to end.

   The only Azure path under 1.5 s is azure-realtime (1.44 s). The synthesis rules that path out because it cannot be
   gated, and it answered in English on 6/16 turns [l8, l8v, hv]. The synthesis lists these numbers under risks (§9 item 3)
   but never sets them against its own kill criterion.
3. **l1 never researched the regulatory questions specific to the buyer the synthesis chose.** The use-case map has no
   row for insurance intermediaries. Its only IRDAI source is the 2011 distance-marketing guidelines, whose current
   applicability is unverified. Brokers, IMFs, corporate agents and PoSPs appear nowhere in l1.
   - One question the synthesis sends to a lawyer can be answered from text l1 already downloaded. The TRAI Direction of
     16-12-2025 says "all entities regulated by IRDAI" may make service calls only from 1600xx numbers, "even with the
     explicit or inferred consent of customers" (item A1).
   - Others were never asked: IRDAI telemarketer registration, whether a motor "renewal" is a sale, intermediary
     outsourcing rules, and where policyholder data may be processed (item A2).
4. **The buyer that was sized is not the buyer the interview kit samples.**
   - The in-reach pool (mode about 1,300 firms) draws on 940 IMFs, which l3 describes as "district-level small
     distributors", plus retail brokers and non-bank corporate agents.
   - The 20 insurance targets are 13 brokers, 4 PoSP platforms, 2 corporate agents and 1 IMF.
   - Kill criterion 1 ("≥5 of 15 run ≥3 renewal telecallers") will therefore be biased upward (item A12).

Missing deliverables:
- **Deliverable 1, the evidence ledger, does not exist.** Nothing from this research has been merged into `context/`. The
  last event is `vp_research_launched`, and the graph holds only 3 VP nodes, all written before the lanes ran.
- **Deliverable 11 is a text document, not a visual report.**
- **Verifier corrections were applied in the synthesis prose but not in the model files.** The l2 spreadsheet still
  shows ₹4.53, NVAIE is still unused, and l8 still uses ₹88/$.

---

## 1. Prioritised actions

### A. Fix now by research (no owner action needed), in order of decision impact

Items marked **[before Mon 10-19]** should land before the first discovery interview, because they change what the
founder asks.

**A1. Settle the 1600 scope from the primary text, and narrow the open question. [before Mon 10-19]**
- **What the text says.** TRAI Direction 16-12-2025 (`research-raw/l1-regulation/Direction_16122025.txt`, l1 S07):
  - cl. (i): "adoption of the 1600-numbering series by all entities regulated by IRDAI is completed by 15th February 2026";
  - cl. (iii): those entities "are not permitted to initiate any service or transactional voice calls, even with the
    explicit or inferred consent of customers, from numbers other than those allocated under the 1600-series".
- **Why it covers the buyer.** IRDAI registers brokers, corporate agents, IMFs and web aggregators, and each holds an
  IRDAI certificate of registration. On a plain reading they are covered.
- **Rewrite** SYNTHESIS §1.1 item 1, open question 1, kill criterion 5 and risk 2. The default is now **mandatory**. What
  remains open:
  - whether intermediaries can actually obtain 1600 numbers (TRAI's 31-12-2024 letter allocates to "eligible entities");
  - at what cost;
  - whether a CPaaS will carry 1600 with media streaming to an Azure gateway;
  - whether PoSPs and individual agents are covered.
- **Check now:** the 1600 onboarding pages of telcos and CPaaS vendors (Tata, Airtel IQ, Jio, Exotel, Vobiz). Which
  documents do they accept? Is an IRDAI CoR enough?
- **Change the interview question.** "What number do you call renewals from today?" becomes a compliance probe. Answers
  of personal or 10-digit mobiles mean the firm has been non-compliant since 2026-02-15. That is either a buying trigger
  or evidence the rule is not enforced. Score it either way.

**A2. Add the insurance-intermediary regulatory layer that l1 never covered.** Add a "U6-INS" row to `usecase-map.csv`.
Each item below is a question to research, not a finding.
- **(a) IRDAI telemarketer registration.**
  - l3 found an IRDAI register of 38 "registered telemarketers" (certificates valid 2019-22; `firm-counts.csv`).
  - Does the regime survive IRDAI's 2024 consolidation?
  - Would VP calling on an intermediary's behalf need to register?
  - The synthesis never mentions it.
- **(b) Is a motor or health "renewal" a service call or a solicitation?**
  - Brokers often re-quote across insurers at renewal (NCB and IDV change; switching insurer means a new policy).
  - If that counts as solicitation, the call moves to 140xx, distance-marketing scripts apply, and the person soliciting
    may need to be a certified Specified Person or Authorised Verifier. An AI is neither.
  - The wedge's "never promote in the call" rule may not fit how brokers actually win renewals.
- **(c) Intermediary outsourcing rules.** Which activities are "core" and cannot be outsourced to a vendor?
- **(d) Data location.**
  - What do IRDAI's information and cyber-security guidelines and the records rules require about where policyholder
    data and call recordings are stored and processed?
  - The synthesis raises residency only for RBI and for insurer outsourcing clauses. Yet GPT-6 has no centralindia
    meter, and the fastest measured LLMs ran in DZ-EU [l2v, l8v].
- **(e) Who earns the renewal commission** on motor and health: the broker or agent of record, or nobody once the
  customer renews directly with the insurer? Check IRDAI (Payment of Commission) Regulations 2023 and expense-of-management
  rules. This bears directly on kill criterion 3.

**A3. Measure pain at the actual buyer, as far as desk sources allow. [before Mon 10-19]** The pain number in the
synthesis is LIC life persistency. l3v says that is the wrong buyer and the wrong line. Gather:
- motor lapse signals: the uninsured share of vehicles on the road, renewal ratios by insurer where disclosed;
- health renewal ratios across insurers, beyond Star Health's 94-98%;
- **commission per renewal by line** (2W motor, 4W motor, health, life years 2+).

The current value gate (`value-gate.csv`, ₹1,000-30,000 per save) mixes the intermediary's commission (₹10k-40k premium
× 5-7.5%, assumed) with the insurer's retained premium. Only the commission is the intermediary's value. This decides
whether the ₹150-per-save floor in kill criterion 2 is realistic for each line.

**A4. Build the per-renewal unit economics. [before Mon 10-19]**
- **The gap.** The beachhead's pricing unit (a fee per renewal collected, plus a monthly minimum) is modelled nowhere.
  `cost-model.json` has only ₹ per connected minute and ₹ per connected call. It has no connect rate, attempts per
  contact, retries, ring time, WhatsApp follow-ups, human-escalation load or holdout cost.
- **The model to build:** due list → attempts → right-party connects → minutes → renewals (baseline vs AI) → fee per
  renewal → buyer cost against commission earned → VP gross margin. Use Monte Carlo ranges.
- **The problem it must show.** A buyer whose health book renews at 94-98% without calling would pay "per renewal
  collected" mostly for renewals that would have happened anyway. Charging only for incremental saves makes revenue tiny.
  The model has to show where per-renewal pricing works, line by line.
- **Why before the interviews.** The synthesis prices as "₹6-8 per AI-connected minute effective yield". The concept
  test in `interview-guide.md` §13 offers a per-renewal fee but has no number to put in front of the buyer.

**A5. Measure at least one Indian incumbent now, and restate the thesis to match the evidence.**
- Run the l4b battery against Sarvam's anonymous widget (`sarvam.ai/products/voice-agents`; l4bv found no login in the
  code path).
- Then try the six "undetermined" demos: Smallest, Cartesia, Caller.digital, Millis, Deepgram playground and Sesame.
- If a transport needs UDP, it moves to runbook Mode A: the owner's laptop, no account needed.
- Until then, write "the homepage demos of three US platforms" in §3, the gap map and §1.1 item 9, not "incumbents".
  Also carry these caveats:
  - the Gujarati replies came from Vapi's demo auto-detect, not from a pinned hi-IN agent [l4bv §4];
  - the elderly "cut-in" happened after about 2.4 s of silence, where many humans would also take the turn [l4bv §5];
  - babble is confounded with dialect, at n=2 calls per vendor [l4bv §7].

**A6. Hold our own stack to kill criterion 6.**
- Add a line to §1.2 and §9 stating that, on current measurements, no gateable Azure path meets clean-turn p50 ≤ 1.5 s.
  All of those measurements were taken from Ohio through a proxy; India-hosted latency is unmeasured.
- Name the architecture expected to pass, with a dated test. That test needs the owner's benchmark budget (B3).
- Note that 1.5 s is roughly Ultravox's demo median. It is a parity bar, not a human bar: human turn gaps are about
  0.2 s [l8v].

**A7. Redo "competition is thin at this buyer".** Two of the three tie-breakers that put insurance above real estate are
"lower regulatory risk" and "thinner competition". At the intermediary level both are unverified (see A1, A2 and this
item), so the tie-break currently rests on unverified claims. Scan for:
- **Arrowhead.** It sells BFSI sales voice agents and claims +45% conversion in health-insurance sales. It is in
  `l4a/data/company-financials.csv` but absent from SYNTHESIS.
- **Insurers' own renewal operations**, in-house or outsourced to BPOs. The intermediary competes with the insurer for
  the same renewal.
- **Aggregators'** renewal flows.
- **PoSP platforms building in-house**, already noted.
- **SquadStack and Gnani** insurance renewal offers.
- **LeadSquared plus Invorto's** claimed +10% renewal ratio.

**A8. Build deliverable 1, the evidence ledger, and log to `context/`.**
- Write `ledger.json` plus a readable version from the synthesis's `[lX]`/`[lXv]` tags. Each claim carries source, date,
  method, confidence and verifier verdict.
- Merge into `context/graph.json` and `events.jsonl`:
  - decisions with reversal conditions: beachhead, alternates, "not per-minute", "no self-hosting yet";
  - measurements with n, method and date;
  - rejections: the ACS Direct Routing leg, study abroad as beachhead, D2C per-minute, dialect TTS for the wedge,
    cross-tenant pooling.
- Then run `npm run context:check`. AGENTS.md requires this logging at milestones, and none has happened since launch.

**A9. Run l1's adversarial pass on disk, and write the two missing notes.**
- Write `lanes/l1-regulation/verify.md`, a real refutation pass. Its top targets are the claims the beachhead depends on:
  - "a renewal reminder is a service call";
  - the 7-day inquiry window;
  - the A2P pre-declaration date;
  - the IRDAI layer from A2.
- Write deliverable 6 (H5 and H7 evidence notes) and deliverable 9 (the distribution note). Today they exist only as CSVs,
  code and verifier files.

**A10. Apply the verifier corrections to the model files, not only to the prose.** Otherwise anyone who opens the
spreadsheet sees the uncorrected numbers.

| file | correction |
|---|---|
| `l2/cost-model.py`, `.xlsx`, `.json` | Use NVAIE (`nvaie_per_gpu_hr` is defined but unused); step commitment tiers with volume; use 6-sol as the speaking model; quote the MC p50 as the headline, not the ₹4.53 base |
| `l8/cost-inputs.json` | FX from ₹88 to about ₹95; MAI-Transcribe-2 at $0.10/h (promo); France Central RTT 135 ms |
| `l5/code/job_lang.py` | Fix the "Tamil Nadu" regex artefact |
| `l6/data/power-n-per-arm.csv` | The Cohen's h column is half the correct per-arm n |
| `l7/prices.csv` | Add GPT-5.1 and GPT-5.2; publish the LLM-flat forecast alongside the cut-process one |
| `l3` | Re-run the scorecard with `post_sales_share`=0 and with a symmetric price gate |

**A11. Copy the raw provenance files out of the ephemeral scratchpad today.** None of these is in the lane folders yet
(I checked):
- 32 Vapi `*.ws.jsonl` dumps;
- the earlier Vapi test runs;
- `sarvam-va.html`;
- `l3-segments/apna/apna_jobs.jsonl`, which the founder kit's targets also depend on.

Copy the named files, not whole directories: the l4b raw folder is 628 MB, and the scratchpad also holds `azure.env`,
which must never be copied into the repo.

**A12. Re-balance the founder kit. [before Mon 10-19]**
- **Sampling.** Either re-stratify the 20 insurance targets to mirror the in-reach pool (for example 6-8 IMFs, more
  non-bank corporate agents), or define kill criteria 1-3 per stratum and size the pool per stratum. Big brokers and
  PoSP platforms will over-state how common renewal desks are.
- **Missing probes** (`interview-guide.md` has zero hits for several):
  - telecaller **attrition** (the brief names it explicitly);
  - connect rate and attempts per renewal;
  - the competing insurer-direct and aggregator renewals;
  - customers' fear of **fake renewal calls and payment links**;
  - who answers an escalation at 8 pm;
  - where the premium figure comes from (insurer portal quote vs the list);
  - seasonality of the due list;
  - whether they will accept a holdout that forgoes commission.
- **The concept test** needs a per-renewal number from A4.

**A13. Re-target the listener panel before anyone spends ₹77.5k.**
- **Scenario.** Only 1 of the 6 stimulus turns is a renewal (T6). The rest are car EMI, COD and NDR.
- **Unchecked audio.** 95 of 102 clips are "unchecked" and none has been heard by a person; 7 are excluded.
- **Missing arms.** There is no competitor arm, although the brief (§6) asks for our demo rated against competitors.
  There are also no human reference recordings.
- **Age.** The age quota is a third aged 45+, with no 60+ stratum, yet the synthesis now ranks elderly comprehension and
  trust first.
- **Pre-registration.** The protocol requires panel predictions in `predictions.md` before recruitment. They are not there.
- **What research can do now:** re-write and re-render the renewal-centred stimuli, add an elderly stratum and write the
  panel predictions. The ear check and recruitment are owner items (B10).

**A14. Size the expansion path.** That decides whether the beachhead leads anywhere venture-scale.
- The in-reach pool is about ₹76-96 Cr a year.
- The expansion path is asserted but not sized: mid-size insurers' renewal desks, then other BFSI 1600 service calls,
  then the rest of the post-sales book. TRAI's 1.15 bn 1600 calls a quarter is a usable top-down anchor.

**A15. Do the incumbent-revenue reconciliation the brief requires (§6).** l3v says it was not done.
`company-financials.csv` already holds the inputs: Exotel about ₹490 Cr, Gnani about ₹57 Cr, Sarvam ₹29 Cr, SquadStack
₹26.5 Cr (FY24), Yellow.ai, Haptik. The TRAI comparison also needs reframing: it compares a subset with a total, in the
wrong direction [l3v §7].

**A16. Settle the ACS question so the owner is not asked something moot.**
- l7v quotes the Microsoft FAQ: "for new ACS resources created after the announcement [2026-09-23], phone number
  capabilities are intentionally disabled". ACS also never sold Indian numbers.
- Creating a resource before 2026-10-23 therefore probably buys nothing.
- Confirm from the FAQ text and recommend "no action" with the citation (B6).

**A17. Source or relabel the unsourced load-bearing lines in SYNTHESIS:**
- "Policyholders skew older and Hindi-belt" (§1.1 item 9). It justifies the elderly-first priority and has no citation.
- "Renewal lists come as spreadsheets" (already flagged).
- The ₹150-per-save floor (the basis traces to the assumption-heavy value gate).
- "4-10 weeks to first paid customer" (an estimate).
- The spam-flag gap-map row says "fewer sub-10-s hang-ups means fewer flags". It rests on the naturalness-to-hang-up link
  that §7 itself calls weak: AI calls were not hung up on more often within 10 s [l5v].

**A18. Add reversal conditions where they are missing.** Brief §1 requires a written kill criterion on every
recommendation. The build list in §3 and several idea verdicts in §3.1 have none, for example:
- the compliance router;
- the competence layer;
- "do not build self-hosted ASR/TTS";
- idea 1 (emotional, relational voice);
- idea 3 (hyper-personalisation).

**A19. Lower priority.**
- Score `predictions.md` in place. Keep the original text and add an outcome column or link, plus a simple calibration
  score.
- Mine complaints from the channels the brief named (G2, Reddit, LinkedIn, X, app stores). 688 of the 869 items are
  Retell forum titles, and Indian vendors are thin.
- Read TRAI consultation stakeholder responses and GeM tenders (see section 5).
- Package deliverable 11 as a visual report once A1-A7 are folded in.

### B. Needs the owner, in order (dates where they bind)

1. **Run the discovery interviews,** 15 intermediaries first, from Mon 2026-10-19, with the IMF stratum from A12. This is
   the only route to kill criteria 1-3 and to H2b (how buyers compare price), and the only route to buyer artefacts:
   scripts, disposition sheets, dialler reports.
2. **Commission a lawyer review** (telecom, DPDP and insurance), using the sharper questions from A1 and A2:
   - can intermediaries obtain 1600 numbers, and may a vendor operate calls on them;
   - IRDAI telemarketer registration;
   - is a motor re-quote a solicitation, and must the solicitor be certified;
   - intermediary outsourcing;
   - where data must be located;
   - whether the IT Rules' synthetic-audio duty applies to us;
   - the recording notice;
   - the DPDP processor contract;
   - for alternate 2: is a vendor-run AI a recovery agent?
3. **Approve the Azure benchmark budget.** It pays for:
   - an India-hosted latency probe (kill criterion 6);
   - our cascade on the renewal battery, 6-sol against 6-luna;
   - LLM tokens per minute measured on renewal-style transcripts;
   - which fast models can be deployed in an India or SEA region.

   Also reconcile the invoice on or after 2026-10-18 against the ~₹1,070 estimate.
4. **Do the competitor sign-ups and phone-only demos** (runbook Mode B): Bolna's ungated dial-in +91 22 6953 9260;
   Ravan's +91 11 4056 6600 (name and phone required); Gnani's call-back; Ringg, Smallest and Retell configured with the
   renewal agent spec. Capture invoices, from an Indian network. This is the real H4 kill test.
5. **Rule on the Azure-only directive for telephony and residency.** VP cannot connect to the Indian network itself, and
   ACS has no Indian numbers, so the media leg must come from an Indian CPaaS (Exotel, Ozonetel, Vobiz, Plivo or Tata). Is
   that allowed? And is processing Indian policyholder data in Global Standard or DZ-EU acceptable, or must it run in
   India? India-only has a measured latency cost: DeepSeek in SEA took 2.58 s against 1.11 s in DZ-EU [l8v].
6. **ACS, by 2026-10-23:** confirm "no action" after A16.
7. **Decide on launch margin.** At managed COGS of ₹5.88 a minute, a ₹6-8 yield gives about 2-26% gross margin. Either
   accept that deliberately as a bet on about 1M aggregate minutes a month, or set a price floor.
8. **Get telephony quotes** from Exotel AgentStream, Ozonetel SIP, Vobiz, Plivo and Tata. Confirm 1600 carriage,
   streaming into an Azure gateway and latency from India. Exotel, Ozonetel, Knowlarity and Airtel do not publish
   per-minute rates.
9. **Find outside reviewers** (brief §6): an insurance renewal-ops head, an ex-employee of a voice-AI company and a CPaaS
   salesperson. None has been consulted.
10. **Fund the listener panel,** but only after A13: ₹77.5k plus ₹30-50k for coordinators, voice talent for the human
    references, a native Bhojpuri reviewer, a decision on the competitor arm, and the page's configuration placeholders.
    The page refuses to start without them.
11. **Sign up for gated data** only if a later test needs it: IndicVoices and the AI4Bharat models on Hugging Face (terms
    acceptance), plus per-dialect sets.
12. **Run the concierge pilot and seek paid LOIs** (the final proof in brief §6), after items 1-4.

### C. Acceptable gaps (state them and move on)

- **The web-search budget ran out.** Verifiers re-opened primaries instead, which is the stronger check. The cost is
  "nobody does X" claims, which stay only partly tested. Keep those hedges.
- **RBI (CAPTCHA), egazette (TLS) and MeitY (bot block)** forced secondary sources for alternate 2 and the DPDP dates.
  That is acceptable while alternate 2 is not the beachhead; the lawyer covers it.
- **H7 is simulation-only.** That is right for a statistics question. The residual gaps (no mSPRT simulation, no prior on
  real effect sizes, outcome delay not tied to each segment's lag) matter only once there is call volume.
- **H6 dialect preference is untested.** That is acceptable because dialect is deferred for the wedge. Do not spend on
  Bhojpuri preference before elderly comprehension and language matching.
- **Self-hosted ASR/TTS and the GPU paths are unmeasured.** They are explicitly deferred to about 1.5M minutes a month,
  with NVAIE.
- **H9 cost forecasts** have already been corrected to the ₹2.7-3.0 current regime. Planning on flat curves is the right
  posture.
- **Wayback was blocked,** so Common Crawl was used. Coverage before 2025 is thin, which is acceptable for the decision.
- **H8's context evidence is non-voice** (field experiments). That is acceptable because the wedge uses narrow policy
  context; the pilot tests it.
- **D2C was rejected on a post-hoc gate.** The synthesis states this, and "no margin per minute at managed COGS" holds on
  its own.

---

## 2. Hypotheses: where primary evidence is missing

| H | Primary evidence in hand | Primary evidence missing | Status |
|---|---|---|---|
| H1 regulation | TRAI regulations, directions and PRs read in full (S01-S13); DPDP Act text | DPDP Rules (secondary; gazette blocked); RBI (secondary; CAPTCHA); **IRDAI: only the 2011 guidelines, applicability unverified; no intermediary, telemarketer, outsourcing or data rules**; SEBI (secondary); no lawyer review; no l1 verify.md | Strong on telecom, thin exactly where the beachhead sits |
| H2 economics | Azure Retail API (re-queried), vendor and telco rate cards, Apna pay (n=1,234), own l8 benchmarks | Tokens per minute on renewal transcripts; TTS characters per minute measured once on one passage; **no per-renewal model**; Exotel, Ozonetel and Airtel rates unpublished; **H2b has no buyer data at all** | Cost side good; buyer side zero |
| H3 segments | IRDAI registers and Handbook tables; Apna crawl; TRAI series volumes | **Pain at intermediaries** (measured at insurers, mostly LIC life); seats per firm, phone share and automatable share all assumed; MCA, GST and Udyam counts not used; incumbent-revenue reconciliation not done | Beachhead pain unproven |
| H4 incumbents | 24 recorded calls on 3 US homepage demos; docs-level parity matrix; complaints | **The brief's test**: the same agent on about 10 platforms, any Indian vendor, invoices, competitor WER, an Indian vantage point | Kill test not run |
| H5 human-likeness | NBER w33669 and Luo 2019 (PDFs); Habel 2026 abstract via Crossref; Meera harvest | Any Indian outcome evidence; any test on renewals; the panel has not run | Literature only, Chinese fintech plus one working paper |
| H6 dialect | Azure locale tables; Apna language mentions (corrected); TRAI MNP | **Listener preference** (panel not run); in-house TTS (IndicF5, Parler) not tested; gpt-realtime not tried for Bhojpuri; native review of the Bhojpuri text | Untested |
| H7 learning | Reproducible simulations; vendor docs | An empirical prior on effect sizes; LLM outcome-extraction accuracy; real outcome lags | Adequate for now |
| H8 context and command centre | Non-voice field experiments; Zoho and LSQ figures | Indian SMB suite-adoption data; an AI-voice-plus-context test; buyer interviews | Desk only |
| H9 frontier | Azure meters, llm-prices commits, HF cards, own ASR/TTS/LLM benchmarks | **Real Indian telephone audio** (Kathbath is read speech with a simulated phone band; callers are Azure TTS); blind listening; India-hosted latency | Partly |
| H10 distribution | Vendor pages, press, ARPA arithmetic | **CAC, churn, observed payment terms**; any conversation with a channel partner or CPaaS seller | No primary evidence |

---

## 3. Deliverables (brief §5)

| # | Deliverable | Status | Gap |
|---|---|---|---|
| 1 | Evidence ledger (`ledger.json` plus a readable version), merged into `context/graph.json` | **Missing** | No file. Nothing merged (graph has 3 VP nodes, all from before the lanes) (A8) |
| 2 | Regulatory use-case map (H1) | Present, **thin for the beachhead** | 11 use cases, 39 sources; no insurance-intermediary row; no verify.md; no lawyer review (A1, A2, A9) |
| 3 | Unit-economics model and sensitivity | Present, **stale** | Verifier fixes not applied (A10); **no per-renewal or per-outcome model with connect rates** (A4); IVR and WhatsApp automation not costed as the baseline for reminder calls (l2v note 8) |
| 4 | Segment scorecard with bottom-up ranges | Present | MCA/GST/Udyam not used; not re-run under verifier fixes; brief §6 reconciliation fails (A10, A15) |
| 5 | Competitor bench and teardowns | **Thin** | Recordings and measurements for 3 US demos only; **no invoices**; parity matrix present; no Bolna code teardown on disk (only its GitHub issues were mined) (A5, B4) |
| 6 | Evidence notes for H5 and H7 | **Thin** | Code, CSVs and verifier files only; no readable note (A9) |
| 7 | Listener-panel protocol, ready to run | Built, **not ready** | Owner configuration; 95/102 clips unchecked; LLM-written Bhojpuri unreviewed; no human references; no competitor arm; panel predictions not registered; scenarios not the beachhead (A13, B10) |
| 8 | Tech radar with own numbers and dated forecasts | Present | No blind listening; the optimistic forecast is still the headline in `fit-results.json` (A10) |
| 9 | Distribution note (H10) | **Thin** | `channels.csv` and verify only; no CAC or churn (A9) |
| 10 | Founder interview kit | **Present, solid** | 60 targets (20/20/20), outreach, guide with Van Westendorp and Gabor-Granger, note template, pre-registered scoring. Gaps: IMF under-sampled; missing probes; no per-renewal price (A4, A12) |
| 11 | Final visual report | **Thin** | `SYNTHESIS.md` is text; the gap map and idea triage are present; no visual report published (A19) |

---

## 4. Load-bearing claims that were refuted or unverifiable, and where the synthesis still leans on them

| # | Claim | Status after verification | Where SYNTHESIS still relies on it | Handling |
|---|---|---|---|---|
| 1 | "Incumbents fail in four places, all of which we measured" | Three US homepage demos, each a different agent; Vapi used auto language detection; elderly pause about 2.4 s, not 1.6 s; babble confounded with dialect (n=2); no Indian vendor [l4bv] | §0 wedge definition, §3 thesis (a), gap-map row 2, §1.1 item 9 | A5; reword |
| 2 | Our agent can meet kill criterion 6 | Every gateable Azure path measured or estimated at 2.2-4.8 s against a 1.5 s bar [l8, l8v, hv] | Kill criterion 6 is presented as a future test only | A6, B3 |
| 3 | Whether the 1600 mandate covers intermediaries is unknown | The primary text says "all entities regulated by IRDAI" (checked) | Open question 1, kill criterion 5, risk 2 treat it as 50/50 | A1 |
| 4 | Tie-breakers: lower regulatory risk and thinner competition | Neither is verified at the intermediary level; Arrowhead and insurer-direct renewals were omitted | §1.1 item 3, §1.3 ("survives because…") | A2, A7 |
| 5 | Pain (LIC 64.1% 13th-month persistency) | The number is right but belongs to the wrong buyer and line [l3v] | Conceded in §1.3; still a key number in the appendix | A3 |
| 6 | 9,440 calls a month per buyer | Assumption-driven, "probably high" [l3v, l6v] | Revenue per buyer (₹1.1-1.5 lakh a month); "about 50 buyers to reach 1M minutes"; 63% and 22% learning feasibility | A4; interviews |
| 7 | ₹6-8 yield per minute and the ₹150-per-save floor | Value range mixes commission with the insurer's premium; no per-renewal model | §0 price, §1 table, kill criterion 2 | A3, A4 |
| 8 | "Policyholders skew older and Hindi-belt" | **No source** | §1.1 item 9; the elderly-first panel priority | A17 |
| 9 | "Renewal lists come as spreadsheets" | No source [l3v] | integration_ease 4; "thin console" | Interviews (flagged) |
| 10 | Naturalness reduces hang-ups and therefore spam flags | Link weak; AI not hung up more within 10 s [l5v] | Gap-map row "spam-flag hygiene" | A17 |
| 11 | ASR fabrication and number misreads as incumbent gaps | Evidence comes from open models, unpinned gpt-4o and one preview Azure voice. Azure real-time and fast transcription fabricated on 0/49. Generative vs neural misreads: p = 0.25 [l7v, l8v] | Thesis (b); gap map "nobody documents it" | Keep as a design rule, not a claim about competitors |
| 12 | Disclosure no longer cuts conversion (Habel 2026) | Abstract only; setting and country unknown | Idea 1 triage | Keep the hedge |
| 13 | Effective competitor price ₹2-2.5 at volume | Secondary and untraceable [l2v] | Risk 4 | Keep flagged |
| 14 | An ACS resource before 10-23 preserves number eligibility | The FAQ suggests resources created after the announcement are already disabled [l7v] | Owner item 3 | A16 |

---

## 5. Raw materials in brief §3 that were never touched, or only partly

| Raw material | Status |
|---|---|
| Buyers and their artefacts (scripts, disposition sheets, dialler reports, pay, attrition, CRM exports) | **Not touched** (owner-gated); the kit is ready |
| Public corpora | Partly: Kathbath (read speech), MUCS, NPTEL, FLEURS. **IndicVoices gated; Shrutilipi and Vistaar never touched**; no conversational telephone audio anywhere |
| Competitor demo calls recorded ourselves | 3 US demos (24 calls); **no Indian vendor** |
| Anonymised recordings from interviewees | **Not touched** |
| TRAI regulations and gazette amendments | Read primary |
| DoT orders | Blocked (403/404) |
| DPDP Act and Rules | Act primary; Rules secondary |
| RBI, IRDAI and SEBI circulars | RBI secondary; **IRDAI: only the 2011 guidelines**; SEBI secondary |
| Stakeholder responses to TRAI consultations | **Never touched** (the brief notes they expose industry economics) |
| MCA/ROC filings | **Only via Inc42 and Entrackr**; no filing read directly |
| Funding rounds | Covered (press) |
| GeM tenders | **Never touched** |
| Job postings | Apna crawled (one month, 3,855 unique); Naukri blocked; WorkIndia count only |
| Competitor pricing over time | Common Crawl (Wayback blocked); thin before 2025 |
| Azure Retail Prices API | Covered |
| CPaaS and telco rate cards | Plivo, Tata, Sarvam/Vobiz, Twilio; Exotel, Ozonetel, Knowlarity and Airtel not published |
| Tech primaries | Papers and cards covered; own benchmarks; Pipecat and LiveKit only on the radar; **no Bolna code teardown on disk** |
| Voice of the customer | 869 items, 688 of them Retell forum titles; **G2, Reddit, LinkedIn, X and app stores barely mined**; Indian vendors thin |
| Our own measured history | Covered |

---

## 6. What an Indian telecalling operations head would ask first

1. **"What is your connect rate, and how many attempts per renewal?"** The economics use connected minutes only. Outbound
   connect rates, retries, best time to call and "call me later" handling are not modelled or asked (A4, A12).
2. **"Who answers when your bot transfers at 8 pm?"** The escalation path assumes the buyer staffs a human queue. Its
   cost and timing are absent.
3. **"Customers think renewal calls with payment links are scams."** Fake insurance-renewal calls are a known fraud
   pattern, and older customers are told not to click links. An AI voice plus a WhatsApp payment link looks like that
   pattern. CNAP caller-name display (from about 2026-11-01) and 1600 numbers may help, but the research has not looked
   at it, and the panel does not test it (A12, A13).
4. **"What number do we call from? Our customers know my agents' mobiles."** If 1600 is mandatory (A1), switching to it
   changes pickup rates. Nobody has measured how often 1600 calls are answered compared with known mobiles.
5. **"Where does the premium figure come from?"** Motor renewal premiums change with NCB and IDV, and quotes come from
   each insurer's portal. A stale premium is a mis-selling risk. "Integration ease 4" is unsourced (A12).
6. **"My best telecaller converts X%. Beat that."** Ops heads compare outcomes, not ₹ per minute. AI-human outcome parity
   is assumed throughout [l2v], and no human renewal-desk conversion baseline has been collected.
7. **"I'm not holding out 15% of my book."** A holdout costs commission. The pilot design needs a holdout the buyer will
   accept, or a quasi-experimental fallback.
8. **"Attrition is my real problem."** The brief names it, and the interview guide never asks (A12).
9. **"Due lists are seasonal."** Monthly minimum fees collide with renewal seasonality. That has not been examined.
10. **"How do you do QA, and what happens on a Bima Bharosa complaint?"** Recording retention, call sampling, dispute
    handling and grievance routing for an AI call are not in the product thesis.
11. **"Motor renewals are re-quotes. My team sells at renewal."** The wedge's "never promote in the call" rule may make
    the product useless for how brokers actually retain motor business (A2 b).

## 7. What a voice-AI investor would ask first

1. **"₹83 Cr is a feature, not a market."** The expansion path is asserted, not sized (A14).
2. **"Your launch gross margin is 2-26%."** Margin reaches 49-62% only at about 1M aggregate minutes a month, with
   dollar-priced inputs and the rupee weakening from ₹88 to ₹95 in a year (B7).
3. **"You haven't measured Sarvam, Gnani or SquadStack, and they have money and distribution."** The "incumbents fail"
   thesis rests on three US demos (A5, B4). Sarvam has raised about $275M, and LeadSquared already sells insurance CRM
   plus voice.
4. **"Your own stack misses your own latency bar."** That is kill criterion 6 (A6).
5. **"What is the moat?"** The compliance router and competence layer can be copied. Cross-tenant learning is barred or
   weak, so there is no data network effect. The answer probably lies in measured outcome performance plus a
   compliance-carrying service, and nothing has measured either yet.
6. **"Why handicap yourself with Azure-only?"** It means no India-region GPT-6, higher STT cost than Indian stacks and an
   unresolved telephony leg. The owner must own this choice explicitly (B5).
7. **"A managed service is a services multiple."** Per-renewal pricing plus attribution disputes plus seasonality make
   revenue lumpy.
8. **"Show me CAC."** There are no CAC or churn data, and the only inherited outbound measurement is 8,784 emails →
   3 meetings → 0 deals [l4c, hv].
9. **"Zero buyer conversations."** Every buyer-side conclusion is desk evidence (B1).
10. **"What if IRDAI or TRAI moves?"** The whole wedge depends on two regulators' current text and on 1600 obtainability
    (A1, A2, B2).
