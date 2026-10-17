<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

# r2-untouched-raw: the raw materials round 1 never touched

Date: 2026-10-17. Package: CRITIC §5 and item A19, plus the ops head's questions 3 and 4 in CRITIC §6. Azure spend: INR 0
(no paid calls). Web searches used: 11. Everything below cites a row in `sources.csv` (R01-R28) or a lane file.

> The harness refused to write `findings.md` ("subagents should return findings as text"), so this text exists only
> here. All CSVs, raw texts and code were written to `lanes/r2-untouched-raw/`.

**What was read.**
- **TRAI consultation responses.** 68 stakeholder PDFs from the two consultations behind the current rules. The 2024 review
  of TCCCPR 2018 [R01] had 36; the 2026 draft Third Amendment [R02] had 32. Five were scanned images, and I read
  selected pages of three of them as images. I also read TRAI's own summary of the comments and its rulings in the
  Explanatory Memorandum to the final amendment of 18-09-2026 [R04].
- **Tenders.** 8 public procurement documents. The GeM portal itself was blocked (see §7).
- **Voice of the customer.** 877 Indian voice, telephony and telecalling items: 642 Google Play reviews across 11 apps,
  Trustpilot pages for 24 vendor domains, 59 Reddit threads and 5 Capterra.in reviews. Of these, 459 were coded as
  complaints using the round-1 taxonomy.
- **Fraud, trust and CNAP.** Primary documents from DoT, TRAI, IRDAI and PIB, plus news reports and Reddit threads.

---

## 0. What changes for Monday's interviews

These seven questions replace or sharpen questions in `founder-kit/interview-guide.md`. Each answers a gap that desk
sources could not close.

1. **"Did you move renewal calls to 1600 numbers? When? What happened to your connect rate before and after?"** Ask
   for the dialler report. No public source measures how often 1600 calls are answered compared with known mobiles
   (§4.3). Buyers who migrated after 2026-02-15 hold the only real before/after data. Score "never migrated" as a
   compliance gap (A1).
2. **"How often do customers ask whether your renewal call is a fraud? What do you tell them?"** Also ask what share of
   renewals is paid through your link and what share through the insurer's own app or portal. Fake renewal and
   lapsed-policy calls that use correct policy data are a documented pattern (§4.1). The lapse-revival scam script is
   the same shape as our lapse-revival call.
3. **"How many attempts do you make per policy? Have telcos ever warned you, blocked a number or disconnected a line,
   or have customers filed DND complaints?"** TRAI acts on 5 complaints in 10 days. Telecallers report that 80-98% of
   complaints against enterprise callers are service dissatisfaction rather than spam (§1.4). Renewal reminders are
   already resented as "relentless" cold calls (§4.1).
4. **"Do you hold a registered trademark or a GST trade name, and are your lines registered as business or bulk
   connections?"** From 2026-11-01, only that route lets your name appear on the customer's screen under CNAP (§4.2).
5. **"When a customer renews directly with the insurer, or through another channel, do you still earn the renewal
   commission?"** PoSP agents' app reviews complain that renewal commission is withheld and that direct renewals are not
   credited (§3.3). This goes to kill criterion 3 and critic item A2(e).
6. **For PoSP platforms and large brokers: "Can your vendors process policyholder calls on cloud AI models hosted
   outside India, or be foreign-owned?"** LIC's AI-voice RFP bars both (§2.1).
7. **"What do you pay per seat-month for in-house or outsourced telecallers?"** Government call-centre estimates run
   ₹36.7k-47.3k per seat-month (§2.2). That is a benchmark for the human cost line.

---

## 1. TRAI stakeholder responses: industry positions and economics

Full table: `trai-stakeholder-positions.csv` (27 rows).

### 1.1 AI calls are A2P. TRAI rejected every carve-out.

- **What the industry asked for.**
  - **CPaaS firms.** Exotel, VNOAI, MyOperator and Tata Teleservices asked that calls with a live human
    ("human-assisted API calls") be excluded from the A2P definition [R02].
  - **MyOperator went further** with a four-part AI-agent framework [R02, row 22]:
    - AI-answered inbound calls fall outside A2P;
    - consented outbound AI service calls stay "service/transactional" and are not escalated to bulk A2P "solely on
      account of the use of AI voice technology";
    - non-consented outbound AI calls are fully A2P;
    - TRAI should write a dedicated AI-communications framework.
- **What TRAI ruled.** It adopted none of this [R04, EM §5 D]:
  - It is "technically not feasible" for operators to tell whether a human is on the call.
  - The A2P definition keeps "autodialling, robo-calls and/or pre-recorded/artificial voice technologies".
  - The regulations apply to all A2P calls, commercial or not. Otherwise there would be "regulatory arbitrage".
- **For VP.**
  - Every AI renewal call is A2P.
  - Regulation 4 requires *every sender* to pre-declare A2P use and its CLI ranges, which are recorded on the DLT
    platform, whatever the number series. An undeclared A2P call found on inspection counts as UCC. On the text this
    applies on 1600 too; only the termination charge is waived there (read-primary of reg 4; my interpretation, for the
    lawyer).
  - The industry asked for an AI-specific consent framework and did not get one. It may come later.
- **History.** The 2024 position of Exotel (Veeno) is the opposite of its 2026 stance. In 2024 it argued that, because
  "Gen AI [is] capable of handling large number of calls without the need for a human agent", explicit consent should
  not be mandatory and "robo calling cannot be avoided". It also proposed capping robo-calls at 2 attempts per consumer
  per week, followed by a 3-month gap [R01; scanned, pp.2-3 viewed].

### 1.2 The A2P charge is small today, and telcos want ten times more

- **The rule.** TRAI fixed a ceiling of ₹0.05/min (per-minute pulse) on A2P termination, "analogous to commercial SMS"
  [R04].
  - This is "the first time" and "the effectiveness... will be reviewed".
  - Calls from 140xx, 1600xx and 1601xx are exempt.
- **What telcos asked for.**
  - Airtel and Jio asked for at least ₹0.50/min on *all* commercial calls, including service and transactional calls.
  - Airtel also wanted ₹0.05 per call *attempt*.
  - Vodafone Idea wanted charging on attempts rather than answered calls, and 15-30-second pulses [R02].
- **What senders asked for.** PhonePe, Amazon and IAMAI asked for exemptions for service and transactional calls
  [R02].
- **For VP (computed).**
  - At ₹0.05/min the charge is under 1% of a ₹6-8/min effective yield.
  - At the telcos' ₹0.50/min it would be about 6-8% of yield.
  - An attempt-based charge would also tax every unanswered retry. That is exactly the cost the per-renewal model
    (A4) must carry.
  - VP's intermediaries on 1600 are exempt today. Tenants that call from declared 10-digit numbers (alternate 1 is on
    140xx, which is exempt; healthcare and others are not) are not exempt.

### 1.3 1600 brings regulatory protections that 10-digit numbers lack

From the final regulations [R04]:
- **Reg 21A proviso.** CLIs from 140xx, 1600xx and 1601xx "shall not be flagged as 'Suspected UCC/spam'" by operators'
  AI systems.
- **Reg 34A.** Call-management apps (Truecaller and phone diallers) may not tag, block or filter calls from designated
  series. Individual users may still block numbers themselves.
- **No A2P termination charge.**

Exotel, asking TRAI to extend 1600 beyond BFSI, describes this as "protection from AI flagging, app-based suppression,
and A2P termination charges" [R02]. TRAI declined to extend 1600 and issued 1601 for other sectors instead.

**New on the A1 question (this changes the A1 rewrite):**
- TRAI writes that "even within BFSI sector, it may not be desirable to mandate 1600 series numbers for all the
  entities... small players... may be exempted from mandatorily using 1600 series numbers... [and] permitted to
  optionally use 1600" [R04, EM §B iii].
- A new proviso to reg 3(1) lets TRAI classify senders and exempt classes of them.
- No such exemption direction was found as of 2026-10-17.
- So the mandate is in force for IRDAI entities (16-12-2025 direction), **and** TRAI has said publicly that small
  BFSI players, which describes many of the 940 IMFs, may be exempted later. Both facts go to the lawyer (B2).

### 1.4 Stated economics (stakeholder claims, not measurements)

| item | figure | source |
|---|---|---|
| DLT ecosystem | ~2,80,000 principal entities, 30 lakh active headers, ~60 lakh templates, ~16,000 registered telemarketers | TRAI CP 2024 ¶2.1 [R01] |
| UCC complaints, 2023 | 1,39,886 against registered telemarketers vs 12,22,946 against unregistered ones | TRAI CP 2024 Table 2.1 |
| Calling behaviour of ordinary SIMs (Q4 FY24) | 85.31% make ≤10 outgoing calls/day; about 0.13% make >50 | TRAI CP 2024 Table 2.3 |
| DLT registration | ₹5,000 + GST per operator per year | MyOperator 2024 |
| Consent acquisition | ₹3 per user (MyOperator). ₹2.5 per consent; at 5% opt-in on a 1-crore base, ₹50 per acquired consent (Shivtel's arithmetic) | 2024 responses |
| SMS termination today | ₹0.07 (₹0.02 interconnect + ₹0.05 TCCCPR) | Airtel 2026 |
| Voice charging today | "around ₹0.02/minute" | Vodafone Idea 2026 |
| OTT promotional message | ₹0.7-0.9 | Vodafone Idea 2026 |
| Bulk SMS wholesale | ₹0.0085-0.04 per SMS (quoting a VAS executive) | MediaNama 2024 (low confidence) |
| Complaint validity | Exotel and VNOAI: 80-85% of complaints against enterprise clients are service dissatisfaction, disposed invalid. Tata Teleservices: 95-98% are "customer-perceived". MyOperator: 11.4% closed on "CDR mismatch" (Aug-Nov 2025) | 2026 responses |
| Spam vs genuine calls | Airtel: spam numbers make 1,400 calls/day against 40 for genuine numbers. Average duration 35 s vs 57 s. Under 10 s: 43% of spam calls, 25% of genuine. Over 60 s: 12% of spam, 20% of genuine | Airtel 2026 |
| Telco AI blocking | Airtel: 82.5 bn spam calls and 3.4 bn spam SMS blocked in 1.5 years | Airtel 2026 |
| A2P share of enforcement | April 2026: 15,736 of 20,591 UCC disconnections (~75%) were SIP/PRI lines (already in l1) | TRAI EM [R04] |

**Two implications.**
- **Personal-SIM desks are flagging targets (computed).** A renewal telecaller dialling 80-150 due-list numbers a day
  from a personal SIM sits in the top ~0.13% of SIMs. They also match both behavioural flags TRAI proposed: over 60%
  unique recipients a day and over 50% unanswered a day. "Our customers know my agents' mobiles" (ops head Q4) is
  therefore fragile. Those SIMs are exactly what UCC_Detect flags, and 1600 CLIs are exempt from that flagging.
- **The spam-flag gap-map row should narrow.** The SYNTHESIS §4 row "Spam-flag hygiene and number health" applies
  only to senders on declared 10-digit CLIs. 140xx, 1600xx and 1601xx cannot be AI-flagged or app-tagged. Airtel's own
  numbers also weaken the "fewer sub-10-s hang-ups means fewer flags" link: 25% of genuine calls already last under
  10 s.

---

## 2. Tenders: what government and PSU buyers buy

Full table: `tenders.csv` (9 rows, including the blocked GeM search).

### 2.1 LIC's AI-voice RFP, 2025-11-04 [R05, R06]

India's largest life insurer is buying exactly our call class.

- **Scope.** Track 1 is an "Agentic Voice AI Platform", outbound and inbound, for "customer servicing, renewal
  reminders, lead engagement, and grievance acknowledgment".
- **Pricing unit.** Per minute with a per-second pulse, all-inclusive: voicebot, dialer, telephony and hosting.
  - The estimate is 24,00,000 minutes a year.
  - At Indian list prices of ₹3.5-7/min [l4av] that is about ₹0.8-1.7 Cr a year (computed). A large insurer's AI-voice
    line is modest.
  - **The insurer buyer prices per minute, not per renewal.**
- **Hard requirements.**
  - Self-hosted in India, on the bidder's infrastructure or a MeitY-empanelled cloud.
  - "Open-source or indigenous" LLMs and speech models only. The RFP names GPT-4, GPT-4o, Claude and Gemini as not
    permitted, and its evaluation text adds Llama and DeepSeek.
  - "No data shall leave the premises or be transmitted to external public cloud APIs."
  - More than 50% Indian ownership; a Class-I local supplier.
  - IRDAI cyber-security guidelines, DPDPA, ISO 27001 and CERT-In VAPT.
- **What is evaluated.** "Human-likeness", "empathy and tone modulation", interruptions, accents, Hindi/English/Hinglish
  code-switching, background noise, "telephone audio quality", latency and escalation to humans. Initial languages are
  English, Hindi and Hinglish (pre-bid reply).
- **Telephony.** The bidder must supply telephony and dialer. LIC declined to offer its own 1400/1600 numbers.
- **The Azure question.** A bidder asked whether Indian regions of AWS, Azure or GCP count as "foreign-hosted". LIC's
  answer was only "be guided by the RFP and corrigendum".
- **Implications for VP.**
  - The expansion path to "insurers' renewal desks" (A14) may be closed to an Azure OpenAI GPT stack, and possibly to
    any hyperscaler LLM, at least at LIC. Private insurers are unknown. This bears on owner decision B5.
  - Buyers do ask for human-likeness and empathy as procurement criteria. That is buyer demand, not outcome evidence;
    SYNTHESIS idea 1 is unchanged.

### 2.2 Other tenders

- **Rajasthan Gramin Bank** [R07, 2026-06-06]. An RFP for 2,500 numbers on the 1600 series over SIP trunks, extendable
  to 5,000, for outbound customer calling over 5 years.
  - Awarded to L1 and L2 on different telcos, 60:40, by reverse auction.
  - Telco or telco-backed bidders only; EMD ₹5 lakh.
  - Regulated banks procure 1600 straight from telcos. This is evidence that 1600 can be obtained by RBI entities, not
    by IRDAI intermediaries.
- **GeM call-centre bids (estimated bid values, not awards; computed per seat-month)** [R08-R10]:
  - FSSAI, 24 cloud seats × 36 months: about ₹47,300;
  - Gujarat, 240 seats × 36 months: about ₹46,300;
  - Powergrid Teleservices: about ₹36,700 per seat-shift-month.
  - At an assumed 200 talk-minutes a day and 26 days a month, ₹46-47k a seat-month is about ₹9 per talk-minute. That is
    the top of l2v's human ₹6-9 per connected minute.
- **MPSEDC** [R12]. An AI voice bot for the CM Helpline 181, published 2026-07-23 with an EMD of ₹1 lakh. The documents
  need registration, which was not attempted.
- **Tele-MANAS IVR (2022)** [R13]. The buyer accepts per-call, per-call-per-year or per-call-minute pricing. About 25% of
  inbound calls trigger an outbound call, averaging about 15 minutes.
- **New India Assurance SMS award** [R11]. 8 of the bidders were disqualified technically. No prices were published.
- **No awarded voicebot price was found anywhere.**

---

## 3. Voice of the customer for Indian vendors

Files: `voc-indian-complaints.csv` (459 coded items), `voc-indian-vendor-counts.csv` and
`data/voc-handcoded-items.csv`. The method is in `code/code_voc.py`:
- the round-1 rules (`l4a/code/taxonomy.py`), plus a documented India supplement;
- Play and Trustpilot items count as complaints at 3 stars or below.

**Spot-check.** In a random sample of 40 rule-coded items, 29 were coded exactly right. The other 11 had one spurious or
missing code, mostly a spurious TELEPHONY or SALES_DELIVERY on support or payout complaints. The primary code was right
on about 37 of 40.

### 3.1 Counts

| vendor | items fetched | complaints coded | top codes |
|---|---|---|---|
| MyOperator (3 Play apps) | 130 | 72 | OTHER 37, SUPPORT 13, BILLING 12, ACCOUNT_UI 12, TELEPHONY 6 |
| Exotel / Ameyo agent app | 103 | 51 | OTHER 27, RELIABILITY 12, ACCOUNT_UI 9, TELEPHONY 4 |
| Callyzer | 94 | 39 | OTHER 23, RELIABILITY 11 |
| Tata Tele Business (Smartflo) | 61 | 31 | OTHER 17, SUPPORT 5, RELIABILITY 5, SALES_DELIVERY 4 |
| Servetel | 53 | 28 | BILLING 8, SUPPORT 7, RELIABILITY 6 |
| TeleCRM | 47 | 23 | ACCOUNT_UI 10, RELIABILITY 6 |
| Exotel (Trustpilot, Capterra, Reddit) | 12 | 12 | TELEPHONY 6, SUPPORT 4, ACCOUNT_UI 4 |
| Plivo (Indian reviewers and Reddit) | 87 | 9 | TELEPHONY 4, ACCOUNT_UI 4 (KYC refusals) |
| Bolna | 5 | 5 | BILLING 4, SUPPORT 3, SALES_DELIVERY 2 |
| Sarvam (Reddit, builders) | 5 | 5 | VOICE_TTS 3, ASR 2, LATENCY 2, TURN_TAKING 1 |
| Vobiz, Ozonetel, Yellow.ai, Haptik, Knowlarity, Smallest.ai, SquadStack, telcos, a bank voicebot | 1-19 each | 17 | — |
| **All except the PoSP app** | 637 | **292** | **OTHER 43%, ACCOUNT_UI 18%, RELIABILITY 17%, SUPPORT 15%, BILLING 12%, TELEPHONY 10%** |
| TurtlemintPro (PoSP agents; buyer side) | 240 | 167 | BILLING 72, SUPPORT 71, ACCOUNT_UI 47 |

### 3.2 What it says

1. **Indian voice-AI vendors have almost no public end-customer review footprint.**
   - Sarvam, Gnani, Ringg and bolna.dev have no Trustpilot page or 0 reviews.
   - Bolna has 4 reviews, all 1-star, about support, refunds, a pilot refused after payment and demos never called
     back.
   - SquadStack's only review is a gig-telecaller complaint.
   - Critic A19's "Indian vendors thin" is therefore a property of the market, not of round 1's search. Their customers
     are enterprises that do not post reviews.
2. **At the telephony and telecalling layer, complaints are about service, not features.** Support, billing,
   onboarding and reliability dominate, which matches l4c's "68% support". The voice-specific codes (ASR, TTS,
   turn-taking, latency, language) appear only in builders' Reddit posts about Sarvam:
   - Bulbul TTS over 1 s against 150-250 ms for Deepgram and Cartesia, with the handshake alone about 1 s;
   - inconsistent STT and TTS quality;
   - no word-level timestamps on websocket STT, which hurts turn detection;
   - "switched to Deepgram".

   These are 5 items from builders, so treat them as directional only.
3. **For builders, the pain is the Indian PSTN path.** Builders report:
   - Plivo refusing accounts or KYC;
   - Vobiz call-quality issues and DID costs ("500 for a DID, 700 for releasing");
   - Exotel requiring a registered company and KYC before even a demo;
   - Jio and Airtel restricting forwarding from a business's published number to an AI-agent number;
   - Exotel's codec compression changing how TTS sounds.

   This supports the gap-map row "an Indian PSTN path into Azure" and the managed-service wedge.
4. **Consumers dislike bank voicebots they cannot get past.** One example is an ICICI customer-care thread. The
   human-escalation requirement is consumer-visible.

### 3.3 PoSP agents' own pain (TurtlemintPro, 167 low-star reviews)

- **Payout and commission.** 56 of 167 mention payout or commission delays.
- **Renewals.** 9 of 167 mention renewal failures:
  - "Reminders will be notified for renewals but it will always be wrong";
  - the renewal page broken after an update;
  - "not giving the renewal commission of life and health insurance in many instances";
  - a customer's renewal with the insurer not credited to the agent.
- **Privacy.** One reviewer reports 25-30 spam calls a day after installing the app.
- **What it shows.** Renewal commission leakage and broken renewal flows are real complaints at the PoSP-agent level.
  That supports critic item A2(e) and kill criterion 3 as live questions. It is evidence about a platform failing its
  agents, not about demand for calling.

### 3.4 Correction to round 1

The round-1 LATENCY regex contains `stall`, which matches "install". 2 of round 1's 25 LATENCY items are false: both
are Bolna GitHub titles about installing. `code_voc.py` neutralises this. `l4a/complaint-taxonomy.csv` LATENCY should
read 23, not 25. The file has not been edited.

---

## 4. Fraud and trust (ops head Q3 and Q4)

File: `trust-fraud-evidence.csv` (18 rows); `data/reddit-1600-cnap-threads.csv` (17 threads).

### 4.1 Fake renewal and lapse-revival calls are a documented pattern

- **Police cases.**
  - Navi Mumbai cyber police raided a fake vehicle-insurance renewal call centre: 32 telecallers, SIMs linked to 145
    NCRP complaints, at least ₹14.08 lakh. A second modus: a genuine policy was issued, then cancelled and the refund
    diverted [R20, 2026-07-19].
  - Delhi Police: a call centre bought vehicle-owner data at **₹5 per record** to target "policies... nearing expiry"
    [R21, 2025-11-22].
- **The regulator.** IRDAI calls spurious calls impersonating insurers, IRDAI and Bima Bharosa "a significant threat".
  It runs public notices, TV and newspaper adverts and directions to insurers [R17, ¶I.6.1.6]. In other words, the
  regulator is training policyholders to distrust exactly this kind of call.
- **Data leaks.** Star Health: an attacker claimed 7.24 TB on 31 million customers via Telegram bots, including
  policies, phone numbers and addresses [R22, 2024; attacker's claim].
- **Grievance base rate.** Bima Bharosa 2024-25 logged 2,57,790 grievances. Life "unfair business practices"
  (mis-selling) rose from 23,335 to 26,667, i.e. from 19.33% to 22.14% of life grievances [R17]. **No count of
  spurious-call complaints is published.**
- **Macro.** NCRP recorded more than 65.9 lakh financial-fraud complaints and more than ₹55,050 crore reported in
  2021-2025 [R18]. These are not insurance-specific.
- **Consumers (Reddit, 2026; individually unverified).** Posts describe callers who know the expiry date, age and
  premium:
  - a fake Niva Bupa caller quoting a ₹71,000 premium;
  - Care porting calls citing the policy details;
  - an organised Noida floor of 60-70 callers;
  - a fake ICICI Prudential **"lapsed policy, now worth ₹1.6 lakh, pay to revive"** script.

  The advice that circulates is "you don't need another person to initiate your renewal". A separate r/india thread
  calls ordinary renewal calls "relentless".

**Design consequences for the wedge** (proposed; untested by any panel):
- No payment is taken on the call.
- Payment goes only through the insurer's own portal, its app, or a link on the insurer's domain.
- The customer is offered a callback on the intermediary's published number.
- The customer is told how to verify independently: the insurer app and the policy number they already hold.
- The call never uses "fund value", "bonus" or "refund" framing.
- Attempts are capped per policy, and opt-outs are honoured immediately.
- Add a scam-perception stimulus to the listener panel (A13).

### 4.2 CNAP: dated, but it does not obviously help 1600 or personal-SIM desks

- **The rule.** DoT Circular 01/Licensing Policy/2026, dated 2026-10-13, orders all access providers to introduce CNAP
  "across all service areas with effect from **1.11.2026**" [R14].
  - It covers 4G-and-above wireless networks. **2G/3G and PSTN are "considered separately"**.
  - A name saved in the callee's contacts takes precedence. Otherwise the KYC name is shown.
  - Business or bulk connections may show a TSP-verified **"preferred name"**: a registered trademark or a GST trade
    name.
  - Users with CLIR (calling line identification restriction) are not shown.
- **Earlier steps.** A trial (DoT letter of 27-10-2025) and KYC instructions (21-11-2025) [R15, R16].
- **On the ground.** Reddit users report KYC names already showing in many circles for months.
- **Consequences.**
  - (a) A telecaller on a personal SIM will display *the telecaller's own name*, not the firm's, to anyone who has not
    saved the number.
  - (b) It is **not stated** whether 1600 CLIs on SIP/PRI, which are wireline, get any name at launch. TTL asked TRAI to
    extend CNAP to "wireline enterprise operators" [R02]. **Unconfirmed; ask the telcos (B8).**
  - (c) The intermediary's own name appears only with a trademark or GST trade name on a business connection.
  - CRITIC §6 Q3's hope that "CNAP and 1600 may help" is unproven.

### 4.3 How often 1600 calls are answered: no measurement exists

- **The only number.** Truecaller's CEO, citing internal data: its users **ignored 79% of 1600-series calls** and 81% of
  140-series calls over the eight months to July 2026. They manually blocked 74 million calls from the two series, and
  daily blocking of 1600 numbers "more than tripled since October 2025" [R19].
  - This comes from an interested party in a dispute with TRAI.
  - There is no method and no baseline for ordinary calls.
- **Mechanism.** Truecaller removed spam and fraud labels from all 140xx and 1600xx numbers after TRAI's letter of
  12-09-2025 [R02, Truecaller p.2].
- **Industry claims, unquantified.**
  - IAMAI (2024, 2026): 140/160 calls get "poor pick-up rates" because customers don't recognise the prefix.
  - AACSPAI (2024): "negative biases, reducing customer pickup rates".
  - SquadStack (2024): 140 numbers are flagged and blocked. Its example is an insurer's term-plan follow-up being
    ignored.
  - ICICI Prudential AMC (2024): "Response rate of 140 calls is very low".
- **Vendor claims, unquantified or unsourced.** Tata says 1600 increases "probability of pickup". Exotel claims
  Truecaller-verified dialing gives a "40-60% improvement in call pickup rates" [R27].
- **Consumers (12 Reddit threads on 1600).**
  - 9 report banks, fintechs and aggregators using 1600 for upsell: IndusInd, Axis, HDFC RMs, Kotak, Cred insurance,
    Paisabazaar.
  - 2 describe ignoring or blocking 1600 calls.
  - 1 treats 1600 as the anchor of trust for genuine bank calls.
  - Banks themselves tell customers "Important service... calls may come from phone numbers starting with 1600. Please
    do not miss these calls" (HDFC Bank email footer [R02]).
- **Net.**
  - The direction is plausibly negative for designated series against a known agent mobile. The magnitude is unknown.
  - The trust of 1600 is being eroded by BFSI upsell, and an insurance renewal on 1600 inherits that.
  - Comparing 1600 with mobiles is not lawful for IRDAI entities (mandatory 1600), so the evidence must come from buyers'
    own before/after-migration dialler data (interview question 1) and from pilot measurements.

---

## 5. What this changes in SYNTHESIS and CRITIC

| place | change |
|---|---|
| A1 rewrite, open question 1, kill criterion 5 | Keep "mandatory today". Add: TRAI has said that small BFSI players "may be exempted" from mandatory 1600 and may use it optionally (reg 3(1) proviso, sender classes; no direction yet). Add: banks procure 1600 straight from telcos (RGB tender). Kill criterion 5 gets a third branch: "or an exemption leaves intermediaries on 10-digit CLIs, which are exposed to AI flagging and app tagging" |
| §6 items 2-3 | AI calls are A2P by definition, with no AI or human-agent carve-out. Pre-declaration applies to every sender on every series. The ₹0.05/min charge is under review, with telcos asking ₹0.50/min plus ₹0.05 per attempt. Add to §9 risks: "A2P charge ×10 or attempt-based" |
| §4 gap-map row "Spam-flag hygiene" | Narrow it to tenants on declared 10-digit CLIs. Designated series cannot be AI-flagged (21A) or app-tagged (34A). Airtel's data shows 25% of genuine calls last under 10 s, which weakens the hang-up-to-flag link (A17) |
| §3 thesis (d) and the PSTN gap row | Indian VoC supports it: complaints at the telephony and CPaaS layer are about support, billing, onboarding and reliability, and builders' main pain is the Indian PSTN path |
| A14 expansion path and B5 | LIC buys AI renewal reminders per minute (2.4M min/yr) and bars GPT, Claude, Gemini, foreign-hosted APIs and non-Indian-owned bidders. The insurer step of the expansion path needs a self-hosted open-model option or must be dropped |
| A12 interview kit | Add the 7 questions in §0 |
| A13 listener panel | Add a fraud-perception stimulus: a renewal call with a payment link, rated for "would you trust/pay". Elderly first |
| CRITIC §6 Q3 and Q4 | Evidence assembled (§4). Q4's pickup comparison is unmeasurable from desk; it moves to interviews and the pilot |
| A19 (VoC) | Indian vendors added (459 coded items). Their public footprint is near zero, so further mining has low yield. Round-1 LATENCY count corrected from 25 to 23 |

## 6. Contradictions kept

- **Pickup on designated series.** Industry bodies say 140/160 lowers pickup. Vendors say 1600 raises it. Truecaller says
  79% of 1600 calls are ignored. Some consumers trust 1600 more than Truecaller. There is no neutral data.
- **Exotel's own position.** In 2024 Exotel argued against mandatory consent for AI robo-calls. In 2026 it argued for a
  human-agent carve-out and for extending 1600.
- **Sarvam's TTS.** One builder calls it "better for Hindi"; another compares it to "WaveNet-2 (2022)".
- **Complaints.** Operators and CPaaS firms say 80-98% of complaints against enterprises are not genuine UCC. TRAI
  nonetheless lowered action thresholds when calls are AI-flagged.

## 7. Limits and blocked sources (`blocked-sources.csv`)

- **Tenders.**
  - GeM and bidplus reset the connection from this vantage point.
  - CPPP's keyword search needs an image CAPTCHA, which was not bypassed. The unfiltered listing (39,000 bids, 3,899
    pages) was not crawled.
  - Aggregators returned 403, were refused by the proxy, or have an expired certificate.
  - No awarded voicebot price was found.
- **Reviews.** G2 returned 403. Reddit's API returned 403/429, so threads were fetched as HTML at 20-s spacing; 2 failed.
  Capterra.in pagination is JS-only (5 reviews). LinkedIn and X were not mined.
- **Scanned TRAI PDFs.** No OCR engine was available. I read selected pages as images: Exotel 2024 pp.2-3, SquadStack
  pp.1,2,4,6 and Truecaller 2026 p.2. Tanla 2024 and Go2market 2026 were not read.
- **Not searched.** RBI and CERT-In advisories (RBI was CAPTCHA-blocked in round 1). Reuters is not reachable by the
  search tool, so its reporting was taken from syndicated copies.
- **Bias.** Reddit and app-store items are self-selected and skew negative. Several Reddit comments are vendor
  self-promotion (FreJun, Pulsy, Neyox and others), flagged in the hand-coded notes. Treat code shares as a taxonomy, not
  as rates.
- **Personal data.** Personal names, emails and phone numbers were not copied into outputs. The copied raw texts have
  emails and mobile numbers redacted.

## 8. Files

All files are in `lanes/r2-untouched-raw/`:
- `trai-stakeholder-positions.csv`, `tenders.csv`, `trust-fraud-evidence.csv`;
- `voc-indian-complaints.csv`, `voc-indian-vendor-counts.csv`;
- `sources.csv`, `blocked-sources.csv`;
- `data/voc-handcoded-items.csv`, `data/reddit-1600-cnap-threads.csv`;
- `data/raw/`: TRAI response texts, tender, DoT and IRDAI texts, Reddit, Trustpilot and Play JSON;
- `code/`: `code_voc.py`, scrapers and CSV writers.

To reproduce the coding:

```
python3 -I code/code_voc.py <raw_voc_dir> lanes/r2-untouched-raw
```

where `<raw_voc_dir>` holds `tp/`, `play_reviews2.json` and `threads/`. The copies are in `data/raw/voc/`; the Play file
there is named `play_reviews.json`.
