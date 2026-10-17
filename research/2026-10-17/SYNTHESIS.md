# VP research synthesis: the wedge decision

Date: 2026-10-17. Author: synthesis lead (workflow step after lanes l1-l8 and their adversarial verification).
Inputs read in full: `vp-research-brief.md`, `predictions.md`, every `lanes/*/verify.md`, the l1 primary outputs
(`usecase-map.csv`, `timeline.csv`, `enforcement-stats.csv`, `sources.csv`; l1 has no verify.md on disk, its verification is
in the workflow digest), the lane data files cited below, and `docs/harvest/SYNTHESIS.md`.

**How to read the numbers.** Every number carries a source tag.
- `[l1]` … `[l8]`: the lane's figure, reproduced by its verifier.
- `[l2v]`, `[l3v]` and so on: the verifier's corrected figure. Where a verifier corrected a lane, this document uses the verifier's figure.
- `[hv]`: inherited harvest evidence (`docs/harvest/`).
- `[calc]`: arithmetic done here from tagged inputs.

"Assumption" marks modelled inputs that nobody observed.

**Limits that apply to everything below.**
- The shared web-search budget ran out before verification, so most refutation attempts used direct fetches of primary pages.
- No lane wrote a `report.md`.
- Some raw provenance files (for example Vapi's WebSocket dumps and the Sarvam demo HTML) sit only in the ephemeral session scratchpad and need copying into the lane folders.
- No buyer has been interviewed. No competitor was measured on our own agent spec. No listener has rated a clip.

The decision below is therefore the best choice the desk evidence supports. It is not proven.

---

## 0. The answer in one paragraph

**Beachhead: renewal and lapse-revival calls for retail insurance intermediaries.** IRDAI-registered insurance marketing
firms, retail-focused brokers, non-bank corporate agents, and the renewal books of PoSP/insurtech platforms call their
**own policyholders** about motor, health and life renewals.
- **Call direction:** outbound **service** calls to existing customers, plus inbound callbacks and WhatsApp utility follow-up. The agent never makes cold calls and never promotes or cross-sells inside a call.
- **Buyer:** the founder or principal officer, or the renewals/operations head.
- **Pricing unit:** a fee per renewal collected on the due list the AI works, with a monthly minimum. Incremental saves against a holdout are reported as the proof of value. The unit is **not** per minute.
- **Price:** an effective yield of ₹6-8 per AI-connected minute. That is about ₹1.1-1.5 lakh a month for a median modelled buyer, with pilots at ₹25-50k.

The **wedge** is a managed, compliance-carrying renewal caller. It must be competent on Indian phone calls: it locks to the
caller's language, handles elderly pauses and "haan"/"hmm" correctly, confirms numbers safely and keeps replies short. It
learns honestly, and it plugs into the spreadsheets and CRMs intermediaries already use. It is not a feature-parity
platform, not a cheaper per-minute API and not a command centre.

**Ranked alternates:**
1. Real-estate inquiry-to-site-visit qualification, priced per qualified site visit.
2. Lending pre-due and early-bucket reminders, sold on the RBI 2027-01-01 conduct deadline.

**Confidence is moderate to low.** The #1 rank is fragile (section 1.3). The pain evidence was measured at insurers, not at the
intermediaries we would sell to. The pool is small. Three gates decide it: owner interviews, a lawyer's answer on the
1600 number series, and our own agent passing the measured battery.

---

## 1. Beachhead decision

| dimension | decision | main evidence |
|---|---|---|
| Industry | Retail insurance distribution: IMFs (940), brokers (874, of which 791 are direct brokers, mostly commercial lines), corporate agents (689, mostly banks), web aggregators (23), plus PoSP platforms (Turtlemint 550,000+ PoSPs) [l3, l3v, l4c] | Enumerable regulator registers. In-reach firms: mode ~1,300, ~980 that phone [l3] |
| Use case | Renewal reminders (motor, health, life), lapse revival, premium-payment link and autopay set-up, callback handling | Renewal reminders are a service call [l1, TCCCPR def (bh)(i)] |
| Direction | Outbound-consented service to existing policyholders, plus inbound callbacks. No cold calls. No promotion or cross-sell in the call (a cross-sell needs a separate 140xx call with consent) [l1] | One offer line makes the whole call promotional [l1] |
| Buyer | Founder or principal officer of an IMF or retail broker; renewals/ops head at a PoSP platform or non-bank corporate agent | Founder-led direct sales channel [l4c] |
| Pricing unit | Per renewal collected on the AI-worked due list, earned in code from the payment record, plus a monthly minimum; a 10-20% holdout gives the incremental-lift report | Per-minute selling has no margin (section 5); H2's rule says change the unit, not the quality [brief] |
| Price point (to test) | Effective yield ≥ ₹6 and ≤ ₹8 per AI-connected minute; pilot ₹25-50k/month per renewal book; production ₹50k-1.5L/month; incremental value floor ≥ ₹150 per renewal saved against the holdout | l3 kill thresholds (₹6/min-equivalent, ₹150 per save) [l3]; human ₹6-9 per connected minute [l2v]; sales-led band ₹25k-2L [l4c] |

### 1.1 Evidence chain

1. **Regulation favours this call type.**
   - A renewal or expiry reminder is a service call [l1]. Inbound, service and renewal calling carry the least friction, while cold B2C calling to bought lists loses its legal basis when the DPDP core obligations start around 2027-05-13 [l1].
   - Renewals rest on the existing customer relationship and do not depend on that DPDP cliff. Cross-sell cannot ride inside a service call [l1].
   - IRDAI entities must make service calls only from 1600xx numbers since 2026-02-15, "even with consent" [l1, TRAI Direction 16-12-2025]. **Whether this covers the intermediaries we would sell to is unverified** (open question 1).
2. **Pain exists in the industry, but it was measured at insurers.**
   - 13th-month life persistency is 64.1% at LIC and a median of 77% at 21 private insurers; 61st-month persistency is about 50% [l3, confirmed by l3v from IRDAI Handbook 2024-25, Table 28].
   - LIC recorded 68.6 lakh lapses or forfeitures in FY25, a 2.55% lapse ratio on its in-force book [l3v].
   - **But** that is life persistency, mostly at LIC, which is excluded from in-reach. Life-renewal commission accrues to the original agent. In-reach intermediaries mostly renew motor and health, and Star Health's health renewal ratio is 94-98% by gross written premium [l3v].
   - Pain at the buyer we would actually sell to is therefore **unproven**. It is beachhead gate 1.
3. **The scorecard ranks it first, but only narrowly.**
   - #1 at 3.85/5 on weights frozen before data; P(top1) 0.92 and P(top3) 1.00 over 10,000 Dirichlet weightings [l3].
   - The whole 0.40 lead over real estate comes from the `post_sales_share` criterion, which the brief did not list. With that weight at zero the two tie at 3.72 [l3v].
   - It ranks #3 on the pre-registered multiplicative form S1, behind D2C and real estate [l3v].
   - The tie is broken here on evidence the scorecard does not weigh: lower 12-month regulatory risk (item 1), thinner competition (item 5) and an enumerable buyer list (item 6).
4. **The pool is small: a beachhead, not a market.**
   - In-reach pool about ₹76-96 Cr/yr, central about ₹83 Cr [l3v]. The lane said ₹94 Cr, range 18-1,118 [l3].
   - Modelled human spend p50 is ₹437 Cr/yr. That rests on assumptions about seats per firm, which the verifier judged probably high [l3, l3v].
   - The expansion path has to be stated up front: mid-size insurers' renewal desks, then other BFSI 1600 service calls (alternate 2), then the rest of the post-sales book.
5. **Competition is thin at this buyer.**
   - SquadStack and Gnani sell to insurers, not intermediaries [l3, l4c].
   - The closest offer is LeadSquared's insurance CRM plus Invorto voice AI. A vendor case study claims a +10% renewal ratio at Universal Sompo [l4c channels.csv; vendor claim].
   - Incumbents' complaints are 68% about support, not features [l4c].
6. **Distribution is cheap in cash.**
   - About 2,500 registered intermediaries [l4c]. Founder-led direct sales, with an estimated 4-10 weeks to the first paid customer (pilot 2-8 weeks plus paperwork) [l4c, estimate].
   - PoSP platforms are a higher-leverage, slower channel: listed-company procurement takes 3-9 months [l4c].
7. **The volume supports scoped learning, not outcome optimisation.**
   - The median modelled buyer would place 9,440 AI calls a month. That is assumption-driven and probably high [l6, l3v].
   - 63% of buyers clear a ~1,200-call local-metric test at an assumed 20% pilot volume. Only 22% can test a +10% relative renewal lift in month one [l6v].
8. **The call class favours AI on cost per outcome.**
   - For EMI reminders, the closest analogue we measured, the human cost is ₹29-40 per outcome and the AI break-even is ₹5.0-7.1/min [l2, l2v].
   - Renewal reminders are assumed to behave similarly. This is not measured.
9. **Quality differences are visible to this buyer.**
   - Policyholders skew older and Hindi-belt. Measured demo agents cut into an elderly caller's mid-sentence pause on 5 of 6 calls (about 2.4 s of silence, scripted as 1.6 s) [l4bv].
   - Vapi answered an elderly Hindi caller in Punjabi (Gurmukhi script) and a Hinglish caller in Gujarati on 17 of 18 turns [l4b, l4bv].
   - The buyer will hear these failures on its own customers.
10. **Payments support the use case.**
    - RBI's e-mandate framework (21 Apr 2026) allows recurring debits without additional authentication up to ₹1,00,000 for insurance premiums, against ₹15,000 generally [l4cv].
    - A renewal call that ends with an autopay mandate removes next year's lapse risk. This is a product feature and its lift is unmeasured.

### 1.2 Kill criteria (any one kills or moves the beachhead)

1. **Too few renewal desks.** Fewer than 5 of 15 qualified intermediaries run at least 3 renewal telecallers or a renewal desk [l3].
2. **Price too low.** The accepted price is below about ₹6/min-equivalent or below ₹150 per renewal saved [l3].
3. **No leakage.** The interviewees' own renewal ratio by line is already 90% or more without calling, or they lose no commission on lapses. This tests the pain mismatch in 1.1 item 2 [l3v].
4. **Channel fails.** After 60 targeted intermediaries, fewer than 10 take a discovery call or fewer than 3 accept a paid pilot within 10 weeks [l4c].
5. **No compliant number path.** Counsel finds that intermediaries must use 1600xx numbers but cannot obtain them, or that non-1600 service calls by IRDAI entities are unlawful, and no compliant path exists for the tenant [l1].
6. **Our quality fails.** Our agent misses the measured bar on the elderly and Hinglish personas (clean-turn p50 ≤ 1.5 s, collisions ≤ 5%, barge-in handled on ≥ 90%, correct language on ≥ 95% of turns, no loop or drop under babble). Separately, **if an incumbent at ≤ ₹4-6/min all-in passes all five**, the "incumbents fail measurably" part of the wedge moves [l4b].
7. **The concierge pilot underperforms.** The AI cohort's renewal rate is worse than the buyer's human baseline on a consented, holdout-controlled pilot (non-inferiority fails) [brief section 6].

**What would switch the decision to alternate 1 (real estate).** Criteria 1, 3 or 5 fire while real-estate interviews show
most leads are the developer's own digital inquiries and developers accept ₹300-500 per qualified site visit.

### 1.3 Why this is provisional, stated plainly

- The #1 rank depends on one added criterion (`post_sales_share`) [l3v].
- The headline pain number belongs to LIC, which is not a buyer [l3v].
- The pool is about ₹83 Cr/yr [l3v].
- "Renewal lists come as spreadsheets" has no source [l3v].
- Nobody has measured the AI renewal-save rate.

The choice survives because every alternative scores worse on regulatory risk, competition or path to buy. It does not
survive because its own evidence is strong.

---

## 2. Two ranked alternates

### Alternate 1: Real-estate inquiry-to-site-visit qualification

- **What.** Speed-to-lead calls to a developer's or channel partner's own digital inquiries (web, ad and portal forms), plus missed-call returns.
  - Calls go outbound from 140xx numbers within TRAI's 7-day digital-inquiry window, which runs from about 2026-10-18 [l1].
  - Inbound calls are also covered.
  - The buyer is the sales head at a mid-size developer or channel-partner firm, priced per qualified site visit booked (₹300-500) with a monthly floor [l3].
- **Why.**
  - It ties insurance renewals at 3.72 once the added criterion is removed, and ranks #2 on S1 [l3v].
  - It has the largest triangulated pool, about ₹830 Cr/yr; the two legs are not independent [l3, l3v]. Human spend p50 is ₹3,769 Cr [l3].
  - DPDP s.7(a)'s own illustration is a real-estate broker [l1, l3v].
  - Buyers think in cost per site visit, while vendors sell per minute [l3].
  - CREDAI lists 13,000+ developers [l3v].
- **Why it ranks second.**
  - Record-owning incumbents already ship voice: Sell.Do (1,500+ real-estate firms, "calls new leads in under 30 seconds"), LeadSquared Invorto, and Salesforce Agentforce Voice in Hindi (announced 2026-05-19) [l4cv].
  - It is pre-sales, so 140xx numbers, a 10:00-21:00 window, and DND leads (about 16% of subscribers) need explicit consent registered with operators, which only banks have piloted [l1].
  - At ₹3.5/min and 2.5-minute calls, lead qualification costs ₹52.5 per lead, against about ₹50 for a human at ₹6.3/min [l2v]. It is not cheaper per minute.
  - Only 3.5% of buyers can test a +10% outcome lift in month one [l6].
  - The value per visit (₹2k-50k) comes from vendor blogs [l3v].
  - The job-post snapshot fell in the festive real-estate month [l3v].
- **Kill criteria.**
  1. Most of the buyer's call volume comes from bought or cold lists rather than its own inquiries [l3].
  2. Developers will not pay ₹300-500 per qualified site visit [l3].
  3. A bundled incumbent (Sell.Do or LSQ Invorto) passes our battery at ≤ ₹4-6/min all-in [l4b thresholds].
  4. After 60 targeted firms, fewer than 10 discovery calls or fewer than 3 paid pilots within 10 weeks (mirrors l4c).
  5. The DND share of inquiry leads makes the 140xx-plus-consent path unworkable [l1].

### Alternate 2: Lending pre-due and early-bucket (DPD 0-30) reminders

- **What.** Reminders for base-layer NBFCs, MFIs and DRA collection agencies, sold as "compliance by construction" against the RBI rules that take effect on 2027-01-01 [l1, l1 verify upgraded to primary]:
  - contact only between 08:00 and 19:00;
  - every recovery call recorded, the borrower told, and recordings kept 6 months;
  - call logs, and a grievance officer named on every communication.

  Priced per promise-to-pay kept or per account cured.
- **Why.**
  - It has the highest per-buyer volume: p50 18,728 calls a month; 80% of buyers clear the local test and 36% can test a +10% outcome lift in month one [l6, l6v].
  - It has a dated buying trigger.
  - Its value gate passes at ₹200-5,000 per cured account [l3].
  - Human presence has its largest measured outcome value here. AI collectors gathered 9 percentage points less NPV at about one month (regression discontinuity) and 12 points less by day 5 (randomised), with 21 points fewer promises [l5, l5v; NBER w33669; scripted bot, China].
  - A competent AI can therefore win on outcomes rather than on price.
- **Why it ranks third.**
  - At least eight AI incumbents already sell into it (Saarthi, Gnani, Credgenics, DPDzero, RevRag, SquadStack, CredResolve, Exotel) [l3].
  - Whether a vendor-run AI counts as a "recovery agency" is unresolved [l1].
  - Warmth collides with RBI and CCPA conduct rules [l5]. RBI-regulated buyers are slow [l3].
  - Whether an outsourced agency may use the lender's 1600 numbers is unclear [l1].
  - Azure has no centralindia meter for the GPT-6 family, so data residency is unpriced [l2v].
  - It ranks #4 on the frozen scorecard and ties fintech onboarding at 3.35 only after the post-hoc D2C gate [l3v].
- **Kill criteria.**
  1. Counsel rules that an AI caller is a recovery agent needing certification, or that vendor-run AI is an agency with obligations we cannot meet [l1, l3].
  2. An incumbent at ≤ ₹3/min passes our battery [l3].
  3. Evidence that warmth or human-likeness hurts collection outcomes or draws conduct complaints [l3, l5].
  4. Agencies cannot lawfully call from the lender's 1600 numbers [l1].
  5. A residency requirement cannot be met on Azure [l2v].

### Segments considered and not chosen

| segment | verdict | reason |
|---|---|---|
| D2C post-purchase (COD, NDR) | Not a beachhead; revisit only if self-hosted COGS reaches ~₹2/min and passes the quality gates | Shopify apps sell at ₹2.375-3.3/min (about ₹2.2-2.6 effective). WhatsApp utility messages cost ₹0.115 [l3v]. Modelled ticket p50 is ₹19k/month [l3]. Short calls pay a 25-30% pulse tax on 60-s billing [l2]. Ringg's founder calls these use cases "always going to be a price game" [l4c]. The price gate was post hoc and asymmetric [l3v], but "no margin per minute at today's managed COGS" holds. Kill if pursued via Shopify: median merchant pays < ₹5,000/month after 90 days [l4c]. |
| Healthcare clinics (IVF, aesthetics, dental, hair) | Watch | The least-crowded large pool (₹643 Cr triangulated) [l3]. But the pain evidence is thin: no primary Indian no-show rate, and the value gate is MARGINAL at ₹300-1,500 per kept appointment [l3]. Service calls would go from declared 10-digit numbers with spam-flag risk and a termination charge [l1]. |
| Edtech and coaching admissions | Not now | Ranks #7 [l3]. Leads under 18 need verifiable parental consent from about 2027-05-13 [l1]. Payment risk after the 2023-25 downturn [l3]. |
| Study abroad (the current sales-enabler demo configuration) | Do not treat as the beachhead | Ranks #12 (3.0); pool about ₹80 Cr [l3]. Indian students going abroad fell from 9.08 lakh (2023) to 6.26 lakh (2025) [l3, secondary]. |
| B2B SMB telesales | Flag for later | 22-28% of phone-role postings, the largest telecalling pool, but outside H3's B2C scope [l3]. Cold calls to self-published numbers are lawful but DND-limited [l1 U1b]. |
| Logistics and utilities (1601xx migration) | Not now | Migration due by about 2026-11-08 [l1] creates a dated switching moment, but it is too soon for a team with no product. NDR economics match D2C. Utilities score 1/5 on integration and on sales cycle [l3]. |

---

## 3. Product thesis for the wedge

**Thesis.** The incumbents do not fail Indian buyers on headline features. 10-12 of 12 platforms document campaigns,
inbound, transfer, knowledge base, tools, extraction and analytics [l4a]. They fail in four places, all of which we measured.

**(a) Indian telephone conversation competence.**
- Language drift: Gujarati or Punjabi replies, and English answers to Hindi callers [l4b, l4bv]. Azure continuous language ID labelled Kathbath Hindi as Marathi, with 14/60 correct [l8].
- Endpointing: cut-ins at elderly pauses [l4bv].
- Backchannels: "hmm"/"haan" read as absence [l4b]. Voice Live missed "haan" 2/2 [l8] and returned empty transcripts on 5/14 short answers [hv].
- Monologues: 21-24% of Vapi and ElevenLabs turns ran over 40 words [l4b].
- Noise collapse: Ultravox looped its greeting 7 times under babble [l4bv].

**(b) Number and consent integrity.**
- ASR invents text on non-speech. Qwen3-ASR wrote "हाँ" (yes) on 24 of 25 silence or noise clips [l7v]. gpt-4o-transcribe invented words on 17/49 clips [l8v].
- Generative TTS misread ₹1,299 in 10/13 renders of one preview voice [l8, l8v].
- Inverse text normalisation invents digits ("bhej do" became "bhej 2") [l4b].

**(c) India compliance plumbing.** Most self-serve platforms leave DLT and principal-entity registration, consent and NCPR scrubbing to the buyer [l4av]. No vendor states the default promotional window correctly [l1].

**(d) Service for the mid-market.** Enterprise floors are high (Sarvam Enterprise from 2 lakh min/month; Synthflow from $30k/yr) [l4a]. PAYG platforms assume a builder [l4a]. Support is 68% of complaints [l4c].

The wedge is a **managed renewal-calling service** that is excellent at all four, priced against the buyer's renewal
economics rather than per minute.

**What we build for the wedge, in order.**
1. **Tenant-held telephony through BYO-bot paths.**
   - Exotel AgentStream WebSocket, Ozonetel SIP (ElevenLabs precedent) or Vobiz/Plivo into an Azure-hosted gateway [l4cv]. The harvest's ACS leg is dead: ACS resources created after about 2026-10-23 cannot get PSTN numbers, and standalone ACS retires on 2028-09-30 [l7v].
   - VP never holds numbers or acts as the sender. TRAI treats a CPaaS reseller as the liable sender, so one bad tenant could bar all of VP's resources [l1].
2. **A compliance router as a gate in code.**
   - Classify call content as service or promotional and route it to the legal series for the tenant's sector (1600, 1601, 140 or a declared 10-digit CLI).
   - Block promotional drift inside service calls, enforce calling windows, pre-declare A2P, and keep a consent ledger built to TRAI's "objective reasonable observer" test plus DPDP Rule 3 notices [l1].
   - Harvest assets: an append-only consent ledger and a temporal consent fence [hv].
3. **A competence layer.**
   - Pin the language from CRM fields or the first turn; never rely on continuous language ID [l8].
   - Endpointing tuned for pause-heavy elderly speech, a backchannel model, a short telephone register, and a number-confirmation step for premiums, dates and policy numbers.
   - Write prices out as words in code before TTS [l8]. Run a non-speech probe on every ASR before it writes to the CRM [hv law 27, l7].
   - **Never treat an ASR-only "yes" as consent.**
4. **Per-policy context and memory.**
   - Policy fields, due date, insurer, premium, language and last interaction, from a spreadsheet or CRM webhook with AI column mapping [hv].
   - Memory carries provenance and a live adherence test, because the harvest's only live trial failed (it stored a Hindi preference and replied in English) [hv].
5. **Payment hand-off.** A WhatsApp utility template (₹0.115) with a payment link, an autopay-mandate option, and a human escalation path [l1, l4cv].
6. **Honest attribution and scoped learning.**
   - A holdout control, line-level drop-off mining (500-1,000 calls), and fix confirmation on local metrics (~600 calls per arm) [l6v].
   - Always-valid sequential tests. A visible "under-powered" verdict. Winners expire.
   - No claim of autonomous outcome optimisation during pilots.
7. **A thin operator console.** Due list, outcomes, attribution and escalations. The full command centre waits (H8).

**What we explicitly do not build for the wedge:**
- feature parity with Vapi, Bolna or ElevenLabs;
- self-hosted ASR or TTS;
- dialect TTS;
- realtime speech-to-speech as the speaker;
- cross-tenant pooled learning;
- CRM or ERP modules;
- lead scraping.

### 3.1 Triage of the owner's eight ideas

| # | idea | verdict | why |
|---|---|---|---|
| 1 | Emotional, relational, extremely human-like voice agents | **reframe** | Make the agent human-*competent*: language lock, turn-taking, backchannels, short replies, safe numbers, and commitments that bind. That is core. "Emotional/relational" as a selling claim has no outcome evidence. In the AI-vs-human collections gap, AI was not hung up on more within 10 s; the gap came with fewer promises, and the paper says weaker promises only "may contribute" [l5v]. AI trails human sellers on sales-process discipline (n=366), and disclosure no longer cuts conversion (n=1,337) [l5v, Habel 2026 abstract]. Warmth backfires with angry customers and collides with collections conduct rules [l5]. Measure warmth in a pilot before claiming it. |
| 2 | Self-evolving agents that learn from every call ("fix the line where 90/100 dropped") | **reframe** | Scoped learning is core: per-contact memory (1 call), line mining (a line that doubles hang-ups is found 67% of the time at 500 calls and 76-94% at 1,000), and local-metric fixes (~1,200 calls) [l6v]. "90 of 100 dropped" cannot validate a line: at 100 calls per arm the minimum detectable drop is 13-19 points [l6]. Daily-checked dashboards with K=2 variants declare false winners in 52-62% of A/A runs by day 90 [l6v]. Outcome-level optimisation needs about 1,000 calls/day per script [l6]. |
| 3 | Hyper-personalisation: regional accent and dialect, per-person memory, cross-source data | **reframe** | **Core:** language matching (Tamil, Telugu, Kannada, Bengali, Marathi) and per-contact memory, which is parity in India, not a moat [l6]. **Later:** dialect, opt-in only. Employers ask for a dialect in 1 of 828 Hindi-belt postings [l5v]. Azure has Bhojpuri speech-to-text but no Hindi-belt dialect TTS [l5]. Automatic inference fails: a telecom circle mixes dialects and language ID cannot separate Bhojpuri from Hindi [l5v]. The panel has not run. **Drop:** pooling personal data across sources and tenants. DPDP s.8(2) contracts constrain it and WhatsApp data is barred [l1, l6]. |
| 4 | Company context ingested at onboarding | **core-for-wedge** (narrow form) | Field experiments show specific context beats generic: goal-specific reminders +16% saving while generic did nothing; a loan officer's name helped only repeat clients; a human two-way call raised on-time repayment by 34.4 pp (LATE; the average-borrower effect is 16.6-20.1 pp) [l4cv]. For the wedge, context means policy and customer fields plus a small approved fact base, not a whole company brain. No study tests AI voice with CRM context [l4c]. |
| 5 | Price under ₹2/min, components built in-house | **reframe** | Not reachable at the measured quality bar on managed Azure: the floor is ₹2.1-2.3 and MC p50 is ₹3.06 at 1M min/month [l2v]. Indian all-in list prices are ₹3.5-7 [l4av]. Per H2's own rule the **pricing unit** changes, not the quality. ₹2 becomes a scale-stage COGS target. Build in-house the layers that differentiate (compliance router, competence layer, attribution, memory), not commodity ASR or TTS: open ASR fabricates on silence [l7], and self-hosting needs NVAIE licences and about $565k of 3-year GPU commitments [l2v]. VP cannot connect its own calls to the Indian network, so telephony can never be in-house [l1]. |
| 6 | Feature parity with Bolna, Vapi, ElevenLabs and peers | **drop** (as a strategy) | Incumbents already ship 10-12 of 12 headline features [l4a]. Indian list prices fell to ₹3.5-7 [l4av], so a parity or undercut wedge is dead [l4a]. Build only the subset the renewal use case needs: campaigns, transfer, knowledge base, tools, extraction, analytics and memory. |
| 7 | Whole-company AI command centre | **later** | H8's kill condition (buyers want a point tool) is met on desk evidence [l4c]. No buyer was found switching CRM to get voice AI. Indian SMBs adopt point tools first (Zoho One is about 5% of 1M+ paying customers), although 24% of Zoho One buyers start on the suite [l4cv]. Revisit if 5 or more of the first 15 qualified prospects would buy voice only inside a replacement CRM [l4c]. |
| 8 | Voice AI will be a large future domain | **reframe** | Right as a direction, wrong as a bet on cost collapse. Managed AI cost fell only 1.7x in 24 months and has been flat at $0.033-0.039/min since 2025-09 [l7]. The end-2027 forecast P50 is ₹1.89 on the optimistic path and ₹2.7-3.0 if the current regime continues [l7v]. Full-duplex Indic speech-to-speech that can be gated does not exist [l7]. Plan on flattening curves. |

---

## 4. Gap map: what nobody serves well

| gap | evidence | who is closest |
|---|---|---|
| Compliance as product: series routing by sector and content, A2P pre-declaration, hours and DND enforcement, consent ledger, blocking promotional drift | Most self-serve platforms leave DLT and principal-entity registration, consent and NCPR to the buyer. Sarvam says compliance "is your responsibility" and Bolna has the buyer register on Tata's DLT portal [l4av]. Exotel states 09:00-21:00 against the primary 10:00-21:00 and does not enforce hours in its API [l1]. | SquadStack (managed enterprise); Ravan (claims DND scrubbing, unverified); Ringg (calling windows) [l4av] |
| Indian telephone conversation competence: Hindi-belt language lock, elderly endpointing, backchannels, babble robustness, short replies | Vapi answered in Gujarati on 17/18 turns and in Punjabi to an elderly Hindi caller. ElevenLabs answered Hindi callers in English. 5/6 calls cut into a ~2.4 s pause. Ultravox looped its greeting under babble [l4b, l4bv]. Azure language ID read Hindi as Marathi (14/60) [l8]. Hinglish short-answer recall has no public benchmark [l7]. | Ultravox on barge-in (4 clear yields of 6) [l4bv]; the Indian specialists are unmeasured (Sarvam has a live widget, untested) [l4bv] |
| Number and consent integrity end to end | Qwen3-ASR wrote "हाँ" on 24/25 non-speech clips and whisper wrote "झाल" on 22/25 [l7v]. gpt-4o-transcribe invented words on 17/49 [l8v]. Diya Dragon misread ₹1,299 in 10/13 renders [l8]. Agents rarely confirmed amounts they had heard correctly [l4b]. | Nobody documents it [l8, l4b] |
| A managed outcome service for mid-market B2C without engineers, priced per outcome | PAYG platforms assume a builder; enterprise floors are high [l4a]. Outcome pricing exists only at BFSI enterprise level [l4c], and fewer than five Indian vendors offer it (vendor blog) [l2]. | MyOperator "Business AI Operator" (managed, custom price) [l4av]; SquadStack (revenue-linked, with setup fees) [l4a, l4c] |
| Renewal calling for insurance intermediaries | Voice-AI incumbents sell to insurers, not to the roughly 2,500 intermediaries [l3, l4c]. | LeadSquared insurance CRM plus Invorto [l4c]; PoSP platforms building in-house [l4c] |
| Honest experimentation: power calculator, A/A by default, always-valid stopping, expiring winners | Retell, Vapi, ElevenLabs and Bland ship K=2 splits with no statistics [l6v]; those produce 52-62% false winners over 90 days of daily checking [l6v]. SquadStack markets continuous tuning without a documented mechanism [l6v]. | SquadStack (claims); Bland Tornado (test-driven, not outcome-driven) [l6v] |
| An Indian PSTN path into Azure | ACS never sold Indian numbers and is retiring; the harvest's Direct Routing plan is invalid [l7]. | Exotel AgentStream, Ozonetel SIP, Vobiz (70% of its business is AI-voice startups) [l4cv] |
| Spam-flag hygiene and number health | 22.99 bn calls flagged by telco AI as suspected spam in Q1 FY27; 243k warnings since 2026-06-23 [l1]. Fewer sub-10-s hang-ups means fewer flags, and no vendor frames realism this way [l5]. | Nobody found [l1, l5] |
| Dated buying triggers | RBI recovery conduct rules from 2027-01-01; 1601xx migration by about 2026-11-08 [l1]. | Collections incumbents [l3] |
| Dialect TTS and a Tamil normaliser | No Bhojpuri TTS on Azure, Sarvam, IndicF5 or Indic Parler. Azure has only 2 standard ta-IN voices (13 Tamil-capable counting secondary locales), and code-mixed Tamil-English text silently drops English words [l5, l5v]. | Open models (Indic Parler-TTS covers Maithili); Vaani data (Bhojpuri 489.9 h audio, 26.6 h transcribed) [l5v] |
| Per-call pricing for short calls | 60-s pulse billing adds a 25-30% tax on COD, NDR and reminder calls [l2]. | Scalysis (per-second billing) [l3v] |
| A self-serve "try it in your language" demo | Most Indian vendors gate their demos behind forms or OTP [l4bv]. | Sarvam widget, HuskyVoice, Vyora [l4bv] |
| An Indian-language calling agent that plugs into horizontal SMB CRMs | None found at Zoho, Kylas, Interakt, AiSensy, Bitrix24 or MSG91. LimeChat, WATI and HubSpot now market voice, with Indian-language support unstated [l4cv]. "Window closes in 6-12 months" is speculation [l4cv]. | Zoho (Hindi ASR, free agents, MCP server) [l4cv] |
| Gateable Indic full-duplex speech-to-speech | Open full-duplex models are English-only. Azure realtime cannot be gated before it speaks and answered in English on 6/16 Hinglish turns [l7, l8]. | Nobody; NVIDIA VoiceChat-11B is English-only [l7v] |

---

## 5. Economics verdict, including the ₹2/min target

**Verdict: ₹2 per connected minute all-in is not reachable today at the measured quality bar on managed Azure.**

**Managed Azure today**
- At 100k min/month, COGS MC p50 is ₹5.88 (p10-p90 ₹5.0-7.0). The ₹4.53 base sits below the MC p10 [l2v].
- At 1M min/month, fully optimised: ₹2.39 base, MC p50 ₹3.06 [l2].
- With commitment tiers stepped by volume, the floor is ₹2.1-2.3 and P(≤ ₹2) ≈ 0.01. With the faster 6-sol speaking model it is ₹2.50 [l2v].

**Our own benchmark** (list price, at the corrected rate of ₹94.96/$)
- AI-only cost is ₹1.94-2.74 per minute; streaming STT at ₹1.58 is 58-82% of it [l8v].
- Telephony adds ₹0.38-0.48 [l2, l7v].
- The LLM line is the least certain: ₹0.47 per minute for a sol-class model on a ~1.6k-token prompt [l8v], against ₹1.30 base and ₹1.87 MC p50 in l2's workload [l2]. It needs measuring on real renewal transcripts.

**Paths to ≤ ₹2, all gated on quality nobody has measured**

| path | base ₹/min | MC p50 | P(≤ ₹2) | needs |
|---|---|---|---|---|
| (a) 6-luna speaking model | 1.69 | 2.12 | 0.29 | ≥ 0.2M min/month [l2v] |
| (b) self-hosted ASR on T4 | 1.97 (2.06 with NVAIE) | 2.39 | 0.05 | ≥ 0.9M min/month [l2v] |
| (c) self-hosted ASR and TTS on H100 | 1.71 (1.95 on demand) | 2.09 | 0.36 | ≥ 2.95M min/month and about $565k of 3-year reservations [l2v] |
| (a)+(c) "D-lite" | 1.01 | 1.16 | 1.00 | ≥ 1.5M min/month; the only robust ≤ ₹2 path [l2v] |

Each path passes only if:
- 6-luna holds a Hinglish renewal conversation at the bar;
- self-hosted Indic ASR on phone audio passes a VAD-gated non-speech probe (open models fabricated on 30/30 clips [l7]);
- open Hindi TTS passes a blind ear test.

Cheaper recognition is the near-term lever:
- Standard STT commitment tiers cost $0.50-0.80/h, i.e. ₹0.79-1.27/min [l8v].
- MAI-Transcribe-2 is listed at $0.10/h as a promotion until 2026-12-31, but runs batch-only on our resources [l8v].

**The market**
- Indian all-in list prices run ₹3.5-7 per minute: Sarvam ₹3.55-3.90 with its telephony (60-s pulse, excluding GST); Ringg ₹6; Bolna about ₹6-7 once telephony and platform fee are added [l4av, l2v].
- Other Indian vendors post ₹8-18 [l4av].
- Effective prices at volume may be ₹2-2.5. That is a secondary source and unverified [l2v].
- US platforms over Twilio India cost ₹11.6-17.5 at ₹88/$ [l4av].

**What the buyer compares against**
- A telecaller costs ₹6-9 per connected minute; the lane's ₹8.86 is high-side and the figure is ₹6.3 at 200 talk-minutes a day [l2v].
- Median posted pay is ₹17,000/month (n=1,234 unique Apna postings) [l2].
- Reminder-class calls favour AI per outcome. Lead qualification does not, at ₹3.5/min and 2.5-minute calls [l2v].

**Consequences**
1. **Per-minute selling is dead for a quality entrant.** Selling at ₹3-4/min would run below 40% gross margin at managed COGS [l2], and a price-undercut wedge is dead [l4a].
2. **Sell the renewal, at a yield of ₹6-8 per AI-connected minute.** For a median modelled insurance buyer (9,440 calls/month at about 2 min each, both assumptions) that is ₹1.1-1.5 lakh/month revenue [calc]. Gross margin is about 2-26% at ₹5.88 COGS (launch-scale aggregate of 100k min/month) and about 49-62% at ₹3.06 (1M min/month aggregate, roughly 50 median buyers) [calc from l2]. **Economics depend on reaching about 1M aggregate minutes a month.** That is about 4% of the ~1,300 in-reach firms, more if per-buyer volume is lower than modelled [calc, l3v].
3. **₹2/min is a scale-stage COGS target, not a price and not a launch prerequisite.** The managed-stack forecast is P50 ₹1.89 at end-2027 only on the optimistic path; on the current regime it is ₹2.7-3.0 [l7v]. AI cost of ₹0.5/min by end-2027 has probability about 0 managed and is ₹0.49 self-hosted from vendor claims, below the quality bar [l7]. FX moved from ₹88 to ₹95 per dollar in a year [l2, l7v], and every Azure line is dollar-priced.
4. **Re-evaluate self-hosting only after the wedge is validated** and aggregate volume approaches 1.5M min/month (D-lite), with NVAIE priced in [l2v].

---

## 6. Regulatory constraints that shape the product

1. **VP is never the sender.**
   - Numbers, trunks and DLT principal-entity registration sit in each tenant's name. VP is the tenant's DPDP processor under an s.8(2) contract [l1].
   - TRAI treats a registered cloud-communications platform as a sender or aggregator, not an access provider, so a reseller model could get all of VP's resources barred for one tenant's misuse [l1, memo para 26.B.i].
2. **The number series follows sector and content.**

   | call type | series |
   |---|---|
   | Promotional | 140xx only [l1] |
   | BFSI service and transactional (RBI entities from Jan-Mar 2026; IRDAI entities from 2026-02-15) | 1600xx only, "even with consent" [l1] |
   | Utilities, logistics and courier | 1601xx (Phase I, migration by about 2026-11-08) [l1] |
   | All other sectors | Declared 10-digit A2P CLI, with a termination charge of up to ₹0.05/min from about 2026-11-17; designated series are exempt [l1, l7v] |

   One offer line turns a service call into a promotional call, so the content gate must block promotion inside service calls [l1].
3. **A2P pre-declaration from about 2026-11-17.** Automated or artificial-voice calls and their CLI ranges must be declared to the originating operator in advance. An undeclared A2P call is UCC [l1, verified on the text].
4. **Hours.**
   - The promotional default is 10:00-21:00, not 09:00 [l1].
   - RBI recovery contact is 08:00-19:00 from 2027-01-01 [l1].
   - Enforce both in the API, not in tenant settings.
5. **Consent.**
   - TRAI's 7-day window after a verifiable digital inquiry runs from about 2026-10-18 [l1].
   - DND recipients need explicit consent registered in the operators' Consent Register. Only 11 banks have piloted the upload [l1].
   - DPDP core obligations start about 2027-05-13. There is no legitimate-interest ground, so processing needs consent or a narrow s.7 legitimate use. Rule 3 notices are required, and leads under 18 need verifiable parental consent [l1].
   - DPDP Rule 4 (consent managers) applies from about 2026-11-13 [l1].
   - The ledger must satisfy TRAI's test that consent "on its face appears genuine to an objective, reasonable observer" [l1].
6. **AI disclosure.**
   - No TRAI rule requires telling the callee that the voice is AI. The harvest claim of TRAI outbound-AI rules since 2026-03-10 has no primary support [l1, weakened at verification].
   - A call made to deceive is UCC under TCCCPR.
   - MeitY's IT Rules (in force 2026-02-20) require an audio disclosure and provenance metadata from intermediaries offering synthetic-audio tools; whether a B2B voice SaaS counts is unclear [l1].
   - Product rule: disclose at the start of the call and never deny being AI.
7. **Recording.**
   - The IRDAI distance-marketing guidelines (2011) require telling the caller the call is recorded; their current applicability is unverified [l1].
   - RBI recovery calls must be recorded and kept 6 months [l1].
   - A recording is personal data under DPDP [l1].
8. **Spam flags.**
   - Regulation 21A lets operators act on AI-flagged CLIs.
   - Operators watch recipient diversity, short calls and the share of incoming calls [l1].
   - Pace calls and monitor "Suspected UCC CLI" notices.
9. **WhatsApp.**
   - Opt-in is required. Cold WhatsApp is not viable [l1].
   - Utility templates cost ₹0.115 against ₹0.8631 for marketing (rate card effective 2026-10-01). Messages inside the 24 h window are free, and click-to-WhatsApp gives a 72 h free window [l1].
   - Pooled learning across tenants from WhatsApp data is barred [l1].
   - Business-initiated WhatsApp calls run on a 7-day temporary permission and 100 connected calls a day per number [l4c].
10. **Payments.**
    - Card, PPI and UPI auto-debits skip additional authentication only up to ₹15,000 per debit (₹1 lakh for insurance premiums) [l4cv].
    - VP's mid-market billing therefore runs on invoice and bank transfer, e-NACH or prepay.
    - Policyholder premium autopay is a feature, not a barrier.
11. **Residency.**
    - Azure has no centralindia meter for the GPT-6 family, so inference runs Global Standard or in an EU/US Data Zone [l2v, l8v].
    - Neon has no India region [hv].
    - Price and decide this before alternate 2 (RBI) or any insurer contract with outsourcing clauses.
12. **Insurance specifics.**
    - A renewal reminder is a service call. Any new sale triggers the distance-marketing rules: interest confirmation, standard scripts and a recording notice [l1].
    - The agent must not quote or advise beyond the policy facts in data; the honesty-gate laws apply [hv].

---

## 7. Prediction register, scored

| H | prior | prediction (short) | outcome | note |
|---|---|---|---|---|
| H1 | 0.80 | Cold promotional AI calling is not viable; consented follow-up, inbound and service (160) are; post-sales has less friction | **mixed** | Right direction, wrong mechanism. Cold promotional calling **is lawful today** for registered senders from 140xx numbers to the 84% of 1.348 bn subscribers without a DND preference [l1]. It dies for bought B2C lists around 2027-05-13 because of **DPDP**, not TRAI. Lead follow-up runs on 140xx, not 160, inside the 7-day window. 1600/1601 apply only to BFSI, government, utilities and logistics; everyone else uses declared 10-digit CLIs. Post-sales has less friction except collections and cross-sell [l1]. |
| H2 | 0.60 | Managed Azure cannot reach < ₹2 at the bar; self-hosting can reach ₹1.2-2.0; Indian list prices ₹4-10 | **mixed** | Part 1 supported: floor ₹2.1-2.3, P(≤ ₹2) ≈ 0.01 [l2v]. Part 2 supported on paper only: the single paths' MC medians are ₹2.09-2.39 and only D-lite is robust at ₹1.16; NVAIE was omitted; quality is unmeasured [l2v]. Part 3 **refuted**: list prices are ₹3.5-7 all-in, lower than predicted [l4av]. |
| H2b | 0.65 | Buyers compare against telecaller cost per outcome; one strong segment prefers outcome or seat pricing | **untestable yet** | No buyer data. Desk evidence leans that way: telecaller ₹6-9/min [l2v], and per-minute selling leaves no margin. But the visible market bills per minute, and SquadStack now publishes per-live-minute billing [l2]. |
| H3 | 0.50 | Top 3 from real estate/edtech, D2C post-purchase and insurance renewals; collections highest spend but ranked lower | **mixed** | The predicted set is exactly the top 3 on the frozen scorecard and on S1 [l3]. Collections does rank lower. "Collections has the highest spend" is **refuted**: human spend is ₹3,769 Cr for real estate against ₹983 Cr for collections [l3]. Not anticipated: D2C fails a (post-hoc) price-floor gate, and insurance renewals' #1 rests on one added criterion [l3v]. |
| H4 | 0.60 | Incumbents ≥ 1.0 s p50 on Hinglish; mishandle short answers and interruptions; no dialect voices; US $0.07-0.15, India ₹3-8/min | **mixed** | Latency supported: no measured demo below 1.0 s; Hinglish p50 was 1.46-3.75 s, through a proxied US-East path [l4b, l4bv]. Short answers mostly supported. Interruptions mixed: Ultravox yielded 6/6 (4 clear), ElevenLabs 3/7, Vapi 2/8 [l4bv]. Dialect supported. US price **refuted**: Vapi plus Twilio India is $0.13-0.20, Retell $0.07-0.31 [l4av]. India price partly holds: the cheapest are ₹3.5-7, others ₹8-18 [l4av]. The kill test itself (our spec on each platform) was **not run**. |
| H5 | 0.65 | Little rigorous evidence that emotional voice lifts conversion; some that naturalness cuts early hang-ups; warmth risky in collections | **supported, with corrections** | No outcome evidence for "emotional/relational" voice. The naturalness-to-hang-up link is **weak**: AI was not hung up on more within 10 s, and TTS vendor choice moved hang-ups by at most 2.4 pp in a vendor-funded test [l5, l5v]. The disclosure penalty (purchases 0.237 to 0.048, 56.3% hung up within 5 s; Luo 2019) is reportedly gone in 2026 (n=1,337) [l5v]. Collections is both the warmth risk and the place where human presence has the largest measured outcome value [l5]. |
| H6 | 0.55 | Language matching strongly preferred; dialect matching weak or mixed with patronising risk; Azure cannot produce Bhojpuri-mix | **mixed / untestable yet** | Language screening is supported by hiring practice, though Tamil is named in 24-34% of Tamil Nadu postings, not 83-93%: the lane's regex matched "Tamil Nadu" in addresses [l5v]. Dialect preference is untested; the panel did not run [l5v]. "Azure cannot" is partly wrong: bho-IN speech-to-text exists and stock hi-IN voices render Bhojpuri marker words recovered at 8-10/13 strict and 11-12/13 lenient. There is no Bhojpuri TTS locale and accent is unrated [l5v]. |
| H7 | 0.80 | One line cannot be validated from 100 calls (needs 800+ per arm); memory feasible now; script learning only pooled | **mixed** | Supported: at 100 calls per arm the minimum detectable drop is 13-19 points [l6v]. "800+" is understated: a 5-point effect needs 906-3,554 calls per arm depending on the baseline [l6v]. Memory is statistically immediate, but the only live adherence trial failed [hv]. **Refuted:** "only pooled". Per-tenant learning works on local metrics from about 500-1,200 calls and on outcomes from about 1,000 calls/day. Pooling helps only when tenants are alike; when they differ it gave the wrong winner to 48-55% of tenants (under the lane's estimator) [l6v]. |
| H8 | 0.70 | Beachhead buyers want a point tool plugging into their CRM, telephony and WhatsApp; the command centre is expansion | **supported (desk only)** | Point-first adoption, incumbents bundling voice, no CRM switch for voice AI found, and context lifts outcomes in field experiments [l4c, l4cv]. Weakened in places: 24% of Zoho One buyers start on the suite, and LimeChat, WATI and HubSpot now market voice [l4cv]. Interviews are pending. |
| H9 | 0.50 | AI cost fell 5-10x in 2 years; full-duplex Indic not production-grade; AI cost about ₹0.5/min by end-2027 | **mixed (2 of 3 refuted)** | 5-10x **refuted**: 1.7x over 24 months; 17.5x needs 3.5 years [l7]. Full-duplex **supported** [l7]. ₹0.5 by end-2027 **refuted** for managed (P ≈ 0; P50 ₹1.89 optimistic, ₹2.7-3.0 on the current regime) [l7v]. Not predicted: the ACS retirement killed the harvest's telephony leg [l7]. |
| H10 | 0.50 | Mid-market buyers buy through founders or ops heads at ₹25k-2L/month on 2-8 week cycles; CPaaS and CRM partners are major channels | **mixed** | The ticket band holds for sales-led sellers (₹26k-2.4L, with pass-through caveats) but not self-serve (~₹4.9k) [l4cv]. The 2-8 week cycle holds for pilots; production takes 8-12+ weeks [l4c]. The buyer role is untested. "Partners are major channels" is **refuted**: CPaaS vendors sell their own bots, LeadSquared's channel revenue was high single-digit percent (2021), and Zoho's marketplace returns 737 telephony results [l4c]. No CAC or churn data exists [l4cv]. |

Of 11 predictions: 1 supported with corrections (H5), 1 supported on desk evidence only (H8), 8 mixed (H6 partly
untestable), and 1 untestable yet (H2b). No prediction held as written. The wrong parts concentrate on mechanisms (DPDP vs TRAI, 140 vs 160), magnitudes (cost curves, list
prices) and the "only pooled" learning claim.

---

## 8. What is still unproven and needs the owner, in priority order

1. **Discovery interviews: 15 qualified insurance intermediaries first.**
   - Who: IMFs, retail brokers, non-bank corporate agents, and 2-3 PoSP platforms.
   - Ask about past behaviour, not opinions:
     - renewal-desk size;
     - renewal ratio by line, and who earns the commission on a lapse;
     - what number they call from today;
     - the format of their renewal list;
     - telecaller pay and attrition;
     - price, using Van Westendorp and Gabor-Granger.
   - This tests kill criteria 1-3 and the H2b pricing unit.
   - Then 10 real-estate firms (alternate 1) and 5-10 lenders (alternate 2), 25-40 in total, with artefacts: scripts, disposition sheets, dialler reports.
2. **A telecom/DPDP/insurance lawyer reviews the l1 use-case map.** Priorities:
   - Must IRDAI intermediaries use 1600xx, and can they get it?
   - Does the tenant-held-number model avoid CPaaS-reseller liability?
   - Do the IT Rules 2026 synthetic-audio duties apply to a B2B voice SaaS?
   - What recording notice is required?
   - The DPDP processor contract.
   - For alternate 2: is a vendor-run AI a recovery agency?
3. **ACS decision, time-boxed, deadline 2026-10-23.** Decide whether to create an ACS resource to keep phone-number eligibility. The default is **no**: ACS never sold Indian numbers and Direct Routing is retired [l7v].
4. **Competitor sign-ups (runbook Mode B).**
   - Configure our renewal agent spec on Sarvam (its live widget is present but untested), Ringg, Bolna, Gnani, Smallest and Ravan.
   - Configure Vapi, Retell and ElevenLabs with a pinned hi-IN transcriber.
   - Capture invoices, and run from an Indian network if possible.
   - This is the actual H4 kill test [l4b, l4bv].
5. **Approve the Azure benchmark budget.**
   - An India-hosted latency probe: real-time outbound on Azure dies if p50 to first audio is over 3.5 s even with the async filter and a continuer [l8].
   - Our own cascade on the renewal battery, 6-sol against 6-luna, including elderly endpointing and number confirmation.
   - Reconcile the invoice on or after 2026-10-18; it should be within 25% of the ~₹1,070 estimate [l8].
6. **A concierge pilot.**
   - One consented renewal cohort for one intermediary, against its human baseline, with a holdout.
   - Proof is 3 paid pilots or signed LOIs at a stated price from 15 qualified prospects [brief section 6].
7. **Pick the telephony partner.** Get quotes from Exotel AgentStream, Ozonetel SIP, Vobiz and Plivo. Confirm 1600-series carriage, WebSocket or SIP into an Azure gateway, and latency from India.
8. **A listener panel**, about ₹77.5k plus ₹30-50k for coordinators [l5].
   - Run the 12-listener pilot first.
   - For the wedge, put **elderly comprehension and trust and regional-language matching** ahead of Bhojpuri dialect preference. The 102 blind stimuli are ready but unrated [l8].
9. **Outside reviewers** [brief section 6]: an insurance renewal-ops head, an ex-employee of a voice-AI company, and a CPaaS salesperson.
10. **Lower priority:** request the gated dialect datasets (per-dialect WER) and a native-speaker review of the LLM-written Bhojpuri stimulus. These matter only if dialect returns to the roadmap.

Not owner-only, but urgent for provenance: copy the l4b raw runs (`runs/vapi__*.ws.jsonl`, the earlier Vapi test runs,
`sarvam-va.html`) and the l5 raw Apna crawl out of the ephemeral scratchpad into the lane folders before the container is
recycled [l4bv].

---

## 9. Risks

1. **The beachhead is fragile.**
   - The #1 rank rests on one added criterion [l3v].
   - The pain was measured at insurers, mostly LIC, not at in-reach intermediaries, whose health renewals may barely leak (Star Health 94-98%) [l3v].
   - The pool is about ₹76-96 Cr/yr, so expansion must be planned from day one.
2. **The 1600 dependency.** If IRDAI's 1600 mandate covers intermediaries, each tenant needs 1600 numbers carried by its CPaaS. If it does not, calls go from declared 10-digit numbers facing termination charges and spam flags [l1]. Either way the telephony set-up gates time-to-first-call.
3. **Our own quality is unmeasured on real phones.**
   - Inherited: end-of-turn p50 was 1,480 ms against a 900 ms bar, Voice Live gave empty transcripts on 5/14 short answers, and the agent lane took 4.0-4.8 s p50 end to end [hv].
   - Azure Voice Live measured 2.27-2.63 s, and our own cascade is estimated at 2.2-4 s, against a human gap of about 0.2 s [l8v].
   - All caller audio so far is synthetic, and latency was measured from the US.
4. **Thin margins until scale.** At managed COGS of ₹5.88/min, a ₹6-8 yield earns about 2-26% gross margin [calc]. FX (₹88 to ₹95 in a year) and flat-to-rising LLM prices work against us [l7v]. Effective competitor prices at volume may be ₹2-2.5 [l2v, unverified].
5. **Incumbents can move down-market.**
   - LeadSquared (insurance CRM and Invorto), SquadStack, Gnani, MyOperator's managed AI Team, and TTBS with Tata Communications [l4cv].
   - Zoho has Hindi ASR, free agents and an MCP server [l4cv].
   - CPaaS partners are also competitors [l4c].
6. **Consent and data integrity.** ASR fabricates "haan" on silence [l7v], so a fabricated yes could become fake consent or a wrong CRM write. Number misreads could quote a wrong premium [l8]. Both need code gates; neither can be left to a prompt [hv laws 10, 27].
7. **Over-claiming learning or warmth.**
   - K=2 dashboards show false winners 52-62% of the time [l6v], and SquadStack markets self-tuning anyway [l6v].
   - Claiming "self-learning" or "emotional" without measurement is a trust and regulatory risk. The TCCCPR deception clause applies [l1].
8. **Elderly and vulnerable policyholders.** Warmth can read as manipulation, and any sale drifts into mis-selling rules [l1, l5]. The NEVER-MANIPULATE and never-deny-AI floors from the inherited laws apply.
9. **Telephony and infrastructure.** The ACS retirement removes the Azure-native path [l7]. A third-party CPaaS media leg must be squared with the Azure-only directive (open question). Number health is exposed to 22.99 bn quarterly spam flags [l1].
10. **Distribution is unproven.** There are no CAC or churn data [l4cv]. The only inherited outbound measurement (a different ICP) is 8,784 cold emails, 88 replies, 3 meetings and 0 deals won [l4c, hv].
11. **The evidence base itself.**
    - Several load-bearing inputs are assumptions: seats per firm, automatable share, AI-vs-human outcome parity [l2v, l3v].
    - The H5 literature is Chinese fintech plus one working paper [l5v].
    - Verification ran without web search.
    - Every lane was free of fabricated numbers, but several carried material errors that verifiers caught: the Tamil regex, the Ringg 66%, stale MyOperator pricing, ₹88 FX, and the omitted NVAIE licence.

---

## 10. Corrections applied: verifier over lane, and harvest claims superseded

- **l1.** The harvest's "TRAI outbound-AI rules in force since 2026-03-10" is unsupported; no TRAI rule requires AI disclosure. Real AI hooks: A2P pre-declaration, the MeitY synthetic-audio duty, and the TCCCPR deception clause [l1].
- **l2.**
  - Scenario A's decision value is MC p50 ₹5.88, not ₹4.53.
  - Telecaller cost is ₹6-9/min, not ₹8.9. At ₹6.3, lead qualification is not cheaper by AI.
  - The single ≤ ₹2 paths have MC medians above ₹2.
  - NVAIE added; GPU term sensitivity added [l2v].
- **l3.**
  - Insurance #1 depends on `post_sales_share`, and it is #3 on S1.
  - Pool corrected to ₹76-96 Cr.
  - Real estate's "largest employer" reverses in the full sample.
  - D2C's gate was post hoc.
  - Lending is #4 on the frozen scorecard.
  - The TRAI "reconciliation" compares a subset with a total [l3v].
- **l4a.**
  - All-in Indian prices are ₹3.5-7, not ₹3.4-6. MyOperator's ₹10k plan is stale. SquadStack's ₹2-5 is an FAQ market statement.
  - Ringg's 66% mixes FX re-denomination with a price cut.
  - "Only Sarvam mentions DND" is a scan artefact.
  - Complaint mix: India-relevant items tilt towards speech and language [l4av].
- **l4b.**
  - Sarvam has an anonymous live demo widget that was missed. Ravan now asks for a name and phone number.
  - Latency CIs must be clustered by call.
  - The "1.6 s" pause renders as about 2.4 s.
  - Vapi's elderly replies were Punjabi, not Punjabi-inflected Hindi.
  - The Vapi babble sub-claim is refuted [l4bv].
- **l4c.**
  - LimeChat, WATI and HubSpot market voice.
  - The ARPA gap is 5-50x, not 50x, and includes pass-through revenue.
  - e-NACH is outside the e-mandate cap.
  - The LeadSquared job-post date was misread, and "LSQ education ~40%" is unsourced [l4cv].
- **l5.**
  - Tamil requirement is 24-34%, not 83-93%. The dialect denominator is 828.
  - Bhojpuri marker recall is 8-10/13 strict.
  - MNP is mostly intra-circle [l5v].
- **l6.**
  - The A/A false-winner rate depends on K: 52-62% at K=2.
  - D2C clears the local test in only 31% of buyers.
  - The SquadStack and Bland counter-examples apply.
  - LLM-label noise was never measured for outcome extraction [l6v].
- **l7.**
  - The forecast P50 of ₹1.89 is optimistic; ₹2.7-3.0 on the current regime.
  - The frontier-tier floor was 2025-08, and the first rise was GPT-5.2.
  - Plivo carriage fell 21% like-for-like.
  - Whisper: 22/25, not 23/25 [l7v].
- **l8.**
  - FX corrected to ₹94.96: AI-only cost is ₹1.94-2.74 per minute.
  - MAI-Transcribe-2 is listed at $0.10/h (promo).
  - gpt-4o non-speech hits include sound labels: 17/49 are invented words.
  - Generative vs neural number misreads are not significant (p = 0.25) [l8v].
- **Harvest superseded.**
  - The "ACS Call Automation + Direct Routing" telephony leg is invalid [l7].
  - Study abroad should not be read as the beachhead [l3].

---

## Appendix: key numbers

| label | value | source |
|---|---|---|
| Subscribers / DND preferences | 1.348 bn / 224 M (16%) | l1 (TRAI PR 111/2026) |
| 140-series promotional calls, Q1 FY27 | 13.16 bn, of which 1.48 bn blocked | l1, l3v |
| 1600-series calls, Q1 FY27 | 1.15 bn | l1, l3v |
| Calls flagged as suspected spam by telco AI, Q1 FY27 | 22.99 bn of 721.79 bn | l1 |
| Share of UCC complaints against unregistered telemarketers | ~85% | l1 |
| DPDP core obligations | ~2027-05-13 | l1 |
| A2P pre-declaration and ₹0.05/min termination charge | ~2026-11-17 | l1, l7v |
| RBI recovery conduct (08:00-19:00, recording, 6-month retention) | 2027-01-01 | l1 |
| WhatsApp utility vs marketing message, India | ₹0.115 vs ₹0.8631 | l1, l3v |
| Managed Azure COGS at 100k min/month (MC p50) | ₹5.88 (p10-p90 5.0-7.0) | l2v |
| Managed optimised at 1M min/month: base / MC p50 | ₹2.39 / ₹3.06 | l2 |
| Managed floor with commitment tiers | ₹2.1-2.3; P(≤ ₹2) ≈ 0.01 | l2v |
| D-lite (6-luna + self-hosted ASR/TTS) MC p50 | ₹1.16 from ~1.5M min/month | l2v |
| AI-only cost, own benchmark, list price | ₹1.94-2.74/min (STT ₹1.58) | l8v |
| Indian all-in list prices | ₹3.5-7/min (others ₹8-18) | l4av |
| Telecaller median posted pay | ₹17,000/month (n=1,234) | l2 |
| Telecaller cost per connected minute | ₹6-9 (₹6.3 at 200 talk-min/day) | l2v |
| Managed AI cost history | $0.579 (2023-04) to $0.033 (2026-10); 1.7x in 24 months | l7 |
| Managed-stack forecast, end-2027 | P50 ₹1.89 (optimistic); ₹2.7-3.0 on the current regime | l7v |
| LIC / private-median 13th-month persistency | 64.1% / 77% (n=21) | l3, l3v |
| Insurance-renewal in-reach pool | ~₹76-96 Cr/yr | l3v |
| Real-estate triangulated pool / human spend | ₹830 Cr / ₹3,769 Cr | l3 |
| Insurance intermediaries | 874 brokers, 689 corporate agents, 940 IMFs, 23 web aggregators | l3 |
| Median modelled AI calls/month: insurance / collections / real estate | 9,440 / 18,728 / 6,089 (assumption-driven) | l6 |
| Buyers able to test a +10% outcome lift in month one: insurance / collections / real estate / D2C | 22% / 36% / 3.5% / 0.7% | l6 |
| A/A false winners with daily P(best) ≥ 0.95, K=2, by day 90 | 52-62% | l6v |
| Calls per arm for 50%→45% / 20%→15% | 1,565 / 906 | l6 |
| Demo-agent clean-turn p50: Ultravox / Vapi / ElevenLabs | 1,540 / 2,319 / 3,749 ms (call-clustered 90% CI 1,324-1,737 / 2,111-2,609 / 3,473-4,038) | l4b, l4bv |
| Vapi wrong-language replies (Hinglish caller) | Gujarati on 17/18 turns | l4b |
| Cut-ins at the elderly mid-sentence pause | 5/6 calls (pause ≈ 2.4 s) | l4bv |
| Open ASR on non-speech | 30/30 fabricated; Qwen "हाँ" on 24/25 | l7v |
| MAI-Transcribe-2 vs real-time, pooled Kathbath, phone band | 15.1% vs 18.1% WER | l8 |
| Azure continuous language ID on Hindi | 14/60 correct, read as Marathi | l8 |
| Collections, AI vs human NPV | -9 pp (~1 month, RD), -12 pp (day 5, randomised) | l5v |
| Human two-way collection call, on-time repayment | +34.4 pp LATE (ATE 16.6-20.1 pp) | l4cv |
| Self-serve vs sales-led revenue per customer | ~₹4.9k vs ₹26k-2.4L per month | l4cv |
| RBI e-mandate AFA-free cap | ₹15,000 (₹1 lakh for insurance premiums) | l4cv |
| ACS standalone retirement | announced 2026-09-23; effective 2028-09-30; no new PSTN numbers after ~2026-10-23 | l7v |
| Listener panel budget | ~₹77.5k plus ₹30-50k coordinators | l5 |
