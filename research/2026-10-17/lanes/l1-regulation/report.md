<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l1-regulation (H1): where an Indian AI voice, WhatsApp and email agent can operate lawfully

Date: 2026-10-17. Lane spend: INR 0 (no Azure calls). Status: research output, not legal advice. It needs the
telecom and DPDP lawyer review listed under Owner actions before anyone relies on it commercially.

Data files in this folder:

- `usecase-map.csv`: 11 use cases × 11 regulatory dimensions, plus status today, status in 12 months, verdicts and
  sources. Each cell starts with one of these tokens: LAWFUL, LWC (lawful with the named conditions), NOT-VIABLE,
  N/A, UNCLEAR, or INFO (enforcement facts).
- `usecase-map-long.csv`: the same map in long format, one row per cell.
- `sources.csv`: 39 sources with dates, method and confidence.
- `blocked-sources.csv`: hosts that refused us.
- `timeline.csv`: 25 dated rule events, from 2024 to May 2027.
- `enforcement-stats.csv`: TRAI enforcement numbers.
- `whatsapp-india-rates.csv`: parsed from Meta's 2026-10-01 rate card.
- `build_map.py`: regenerates all of the CSVs.

Raw downloads (the regulation PDFs and the text extracted from them) are in
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l1-regulation/`.

---

## 1. Answer to the hypothesis

**H1, "regulation decides the map", holds. The map differs from the prediction in four ways that matter for the
wedge.**

1. **Cold promotional calling is lawful today, through one narrow door, and loses most of its legal basis in May
   2027.**
   - India's telecom rules work on opt-out. TRAI says calls from 140xx numbers to people who have not registered a
     Do-Not-Disturb preference carry "deemed" consent. That covers 1.12 billion of 1.348 billion subscribers; only
     224 million (16%) have registered a preference [S11, S03 memo, S13].
   - So a *registered* sender may make AI promotional calls today, under five conditions:
     - from 140xx numbers;
     - scrubbed against DND;
     - between 10:00 and 21:00, the default for promotional calls [S01];
     - after declaring the A2P (automated) calling to its telecom operator, which is required from 2026-11-17 [S03];
     - to non-DND numbers only.
   - What kills cold calling is not TRAI. It is the DPDP Act from about 2027-05-13. Calling a purchased or scraped
     list of individuals needs consent or one of the narrow "legitimate uses", and DPDP has no legitimate-interest
     ground [S16 s.4, s.6, s.7; S17; S18].
   - The exception is a number the person published themselves, such as a business owner's own listing. It falls
     outside the Act entirely [S16 s.3(c)(ii)].
   - Verdict: lawful-with-conditions today, not viable within the 12-month horizon for business-to-consumer (B2C)
     bought lists, and a thin lawful niche for B2B self-published numbers.
2. **The "160 series" is not a general home for service calls.**
   - 1600xx is mandatory, and exclusive, for service and transactional calls by entities regulated by RBI, SEBI,
     IRDAI and PFRDA. The deadlines ran from 2026-01-01 to 2026-03-15 [S06, S07].
   - 1601xx exists only for utilities and logistics/courier firms in Phase I, with migration due by about 2026-11-08
     [S08].
   - Everyone else has no designated series yet. That includes D2C brands, clinics, edtech, real estate and auto
     dealers. They make service calls from 10-digit numbers that must be declared as A2P from 2026-11-17, and that
     can carry a termination charge of up to ₹0.05 per minute [S03 reg 4, reg 35A].
   - Those numbers are also exactly the calling pattern that telecom operators' AI spam detectors flag: many distinct
     recipients, short calls, few incoming calls [S02 Sch-IV]. Five flagged numbers in 10 days triggers KYC
     re-verification, then barring [S03 reg 21A; S10].
3. **A lead follow-up call is promotional, not a service call.**
   - Any promotional content in a call makes the whole call promotional [S02 def (av)]. So a speed-to-lead call must
     come from a 140xx number, not 160.
   - It has a legal anchor in two places. TRAI's Third Amendment (in force about 2026-10-18) permits communications
     for **7 days** after a written or digital inquiry that the sender keeps in verifiable form [S03 def (bb)(ii);
     S04]. DPDP s.7(a) covers data that was voluntarily provided for a stated purpose; the Act's own illustration is
     a renter messaging a real-estate broker [S16].
   - Leads who have registered DND need explicit consent recorded in the operators' Consent Register. Uploading
     consents collected elsewhere has so far been piloted only with 11 banks [S03 memo; S09].
4. **No TRAI rule requires an AI to tell the person it is AI.**
   - The harvest's claim that TRAI outbound-AI rules have applied since 2026-03-10 is **not supported by any primary
     source**. It traces to a vendor blog that cites no TRAI document [S36]. TRAI's lists of directions and
     regulations contain no instrument dated 2026-03-10 [S15], and there is no TRAI consultation on AI disclosure
     [S14].
   - The real AI-relevant rules are these:
     - **TRAI's Third Amendment** (notified 2026-09-18) defines "A2P calls" to include artificial voice. It makes
       senders pre-declare them to their operator, from about 2026-11-17. That is a disclosure to the telecom
       operator, not to the person called [S03].
     - **MeitY's IT Rules amendment** (in force 2026-02-20) requires intermediaries that offer tools for creating
       synthetic audio to ensure a "prominently prefixed audio disclosure" plus provenance metadata [S20]. Whether
       a B2B voice-agent SaaS counts as such an intermediary is unclear.
     - **TCCCPR's deception clause.** A call made "to deceive or attempt to deceive" is treated as unsolicited
       commercial communication (UCC) [S02]. An agent that denies being AI is therefore a telecom-law risk, not just
       an ethics issue.
   - The safe product rule: say it is AI at the start of every call, and never deny it.

**Pre-sales versus post-sales.** Post-sales has less regulatory friction, with two exceptions.

- Service and transactional calls are not blocked by DND or by the promotional time bands [S03 Sch-II notes; S01].
- **Exception 1: collections.** It carries the heaviest conduct regime of any lane:
  - RBI amendments effective 2027-01-01 [S22] limit contact to 08:00–19:00;
  - every recovery call must be recorded in both directions, with the borrower told, and kept for 6 months;
  - the lender must keep agency lists and a grievance officer;
  - it is unclear whether a vendor-run AI counts as a "recovery agency".
- **Exception 2: cross-sell.** Cross-sell is promotional. It cannot ride inside a 1600 or 1601 service call; that
  draws strict action [S02; S08 para 7].
- **WhatsApp** is clean for user-initiated chats. Business-initiated messages need opt-in [S29], so cold WhatsApp is
  not viable [S29; S37].
- **New finding for H7 (learning).** Meta's terms bar using WhatsApp Platform Data to train or improve AI models,
  except one model for a single business's exclusive use [S30 s.4.7]. Cross-tenant pooled learning from WhatsApp
  conversations is contractually prohibited.

**Telephony licensing for idea 5 ("build in-house").** A SaaS cannot legally connect its own calls to the Indian
public phone network (PSTN). Numbering resources and PSTN interconnect belong to authorised operators. Using a
telecom service that has no authorisation carries a civil penalty of up to ₹10 lakh [S25 Third Schedule item 2].

The realistic options, from lightest to heaviest:

- **(a) Bring-your-own-carrier (recommended).** VP's in-house AI and media stack connects over SIP to trunks and
  numbers held **in each tenant's own name**, from a licensed operator or a VNO. This keeps every TRAI action,
  including bars, blacklists and complaints, attached to the tenant's resources and not to VP's.
- **(b) VP buys trunks itself and resells them as a cloud-communications platform (CPaaS).** TRAI treats such a
  platform as a *Sender/aggregator* using its own telecom resources [S03 memo para 26, para vi]. One abusive tenant
  could get **all of VP's numbers and trunks barred for 15 days across every operator, or disconnected for a year**
  [S03 reg 25(6)].
- **(c) VP obtains a VNO Access Service authorisation** under the 2026 authorisation rules. Sources report ₹12.5 lakh
  per service area, 8% of adjusted gross revenue (AGR) as a licence fee, and a parent network operator. VP would
  also take on Access Provider duties on TRAI's DLT platform [S26 secondary; S03 reg 13]. Exotel took this path in
  2022 [S27]. It costs money and compliance staff, and it does not remove the dependence on a parent operator.

The only regulatory cost lever is the number series. Calls from 140, 1600 and 1601 are exempt from the new A2P
termination charge and are never spam-flagged [S03 reg 21A, reg 35A]. So "control" in the near term means owning
the AI stack, not the numbers.

---

## 2. Prediction check against predictions.md (H1, prior 0.80)

Prediction: *"AI calling without consent for promotion, to numbers that never opted in, is not viable in India: the
140 series, DLT registration, DND scrubbing and disconnection penalties make it a losing game. Lead follow-up with
consent, inbound calls, and service/transactional calls (160 series) are viable. Post-sales has less regulatory
friction than pre-sales."*

| Part of the prediction | Outcome | Why |
|---|---|---|
| Cold promotional calling is not viable | **Refuted for today, supported for 12 months (B2C)** | Under TCCCPR it is lawful for registered senders on 140xx numbers to non-DND numbers, which TRAI describes as deemed consent [S13; S03 memo]. Disconnection penalties land mostly on *unregistered* senders: about 85% of complaints [S10]. The real blocker is the DPDP Act from about 2027-05-13 for bought or scraped lists [S16; S18]. Whether 140 calls convert is an economic question, not a regulatory one. |
| Lead follow-up with consent is viable | **Supported, with a correction** | It is viable, but on **140xx** (because the call is promotional), inside a **7-day** inquiry window with digital evidence. DND leads need consent registered in the Consent Register [S02; S03]. |
| Inbound is viable | **Supported** | No TCCCPR exposure on the inbound leg. DPDP s.7(a) covers the call's purpose [S16]. |
| Service/transactional on the "160 series" is viable | **Supported, but "160" applies only to BFSI and government (1600) and to utilities and logistics (1601 Phase I)** | Other sectors use declared 10-digit numbers, with a termination charge and spam-flag risk [S03; S06–S08]. |
| Post-sales has less friction | **Mostly supported** | It holds for service, renewal reminders, feedback and inbound. It is reversed for collections (RBI 2027 regime) and for cross-sell (promotional) [S22; S02]. |

**Overall: mixed.** The direction was right; the mechanism was wrong. At a 12-month horizon, the binding constraint
on cold outreach is the DPDP Act, not TRAI. The constraint on service calls is the number series and spam-flagging,
not consent.

---

## 3. Evidence

Methods: "read" means the primary text was read by us. "Read (2nd)" means a secondary summary was used because the
primary was blocked. "Computed" means the date arithmetic or ratio was done by us. Full URLs are in `sources.csv`.

| # | Claim | Source | Date | Method | Confidence |
|---|---|---|---|---|---|
| 1 | Promotional voice calls may only come from 140xx numbers of registered senders. 10-digit, 1600 and 1601 numbers may not carry promotion. | TRAI TCCCPR 2nd Amdt reg 3 [S02]; TRAI PR 91/2026 [S13]; 1601 direction para 7 [S08] | 2025-02-12; 2026-07-10; 2026-08-10 | read | high |
| 2 | Customers with no DND preference are "accessible for all commercial communications" from registered senders; TRAI treats 140-call consent as deemed. 224M of 1.348B (16%) have preferences. | TRAI PR 111/2026 [S11]; 3rd Amdt memo [S03] | 2026-08-04; 2026-09-18 | read | high |
| 3 | Promotional default window is effectively 10:00–21:00 (bands 00–06, 06–08, 08–10 and 21–24 are default off). **Contradiction:** Exotel's FAQ says 09:00–21:00. | TCCCPR 2018 Sch-II item 3 Note-1 [S01]; Exotel [S28] | 2018-07-19; 2026 | read; vendor claim | high (primary) |
| 4 | "A2P call" includes calls via "pre-recorded/artificial voice technologies". Senders must pre-declare A2P use and CLI ranges to their operator, recorded on DLT; undeclared A2P calls are UCC. In force 60 days after publication, about 2026-11-17. | 3rd Amdt reg 2(ea), reg 4, commencement clause [S03]; PIB [S04] | 2026-09-18 | read; date computed | high (text); medium (exact day) |
| 5 | Terminating operators may charge up to ₹0.05/min for A2P calls. Calls from 140xx, 1600xx, 1601xx and other designated series are exempt. | 3rd Amdt reg 35A [S03] | 2026-09-18 | read | high |
| 6 | Communications based on a customer inquiry are allowed for 7 days. The inquiry must be written or digital and kept in verifiable form. Applications allow 3 months. In force about 2026-10-18. | 3rd Amdt def (bb) [S03]; PIB [S04] | 2026-09-18 | read | high |
| 7 | Consent captured outside the Consent Register counts as Explicit Consent once registered there. The upload mechanism has been piloted only with 11 banks (direction of 2025-12-10). | 3rd Amdt def (y) and memo [S03]; CRF pilot direction [S09] | 2026-09-18; 2025-06-13 | read | high |
| 8 | Any promotional content mixed into a call makes it a promotional call. Promotional calls reach DND-blocked recipients only with Explicit Consent. | 2nd Amdt def (av) [S02] | 2025-02-12 | read | high |
| 9 | BFSI entities must make service and transactional calls only from 1600xx, "even with the explicit or inferred consent of customers", after these dates: banks 2026-01-01; large NBFCs, payments banks and SFBs 2026-02-01; other NBFCs, co-operative banks and RRBs 2026-03-01; IRDAI 2026-02-15; SEBI MFs/AMCs 2026-02-15 and QSBs 2026-03-15; PFRDA 2026-02-15. | TRAI directions [S06, S07] | 2025-11-19; 2025-12-16 | read | high |
| 10 | 1601xx is allotted for non-BFSI service and transactional calls. Phase I covers utilities and logistics/courier, with migration within 90 days (about 2026-11-08). More sectors will be notified later. | TRAI direction [S08] | 2026-08-10 | read; date computed | high |
| 11 | Operators' AI spam detection signals are recipient diversity, short average call duration and a low incoming:outgoing ratio. 5 flagged CLIs in 10 days leads to KYC re-verification, then a 15-day bar, then 1-year disconnection. 140, 1600 and 1601 are never flagged. | 2nd Amdt Sch-IV [S02]; 3rd Amdt reg 21A [S03]; direction [S10] | 2025-02-12; 2026-09-18; 2026-02-27 | read | high |
| 12 | Sanctions on senders: first proven violation is a 15-day bar on all resources at all operators; repeat violations bring 1-year disconnection, blacklisting and device blocking. For unregistered senders, the trigger is 3 complaints plus an AI flag, or 5 complaints, within 10 days. | 3rd Amdt reg 25 [S03] | 2026-09-18 | read | high |
| 13 | A cloud-communications platform is treated as a Sender/aggregator using its own telecom resources, not as an Access Provider. Intermediaries whose CLIs are misused by a client face action on their own resources. | 3rd Amdt memo para 26 and para 5.vi [S03] | 2026-09-18 | read | high |
| 14 | Telecom Act s.28 (specified messages, DND register). Civil penalty: up to ₹50,000 for a first offence; up to ₹2 lakh per later instance, or suspension. Using an unauthorised telecom service: up to ₹10 lakh. | Telecom Bill 2023 Third Schedule (PRS copy) [S25] | 2023-12-18 | read (Bill text; enacted Act blocked) | medium |
| 15 | DPDP: processing needs consent or a s.7 legitimate use. s.7(a) covers data voluntarily provided for a specified purpose until the person objects. Data the person made public is excluded. Children's data needs verifiable parental consent, and targeted advertising to children is barred. | DPDP Act [S16] | 2023-08-11 | read | high |
| 16 | DPDP Rules notified 14 Nov 2025. Consent managers apply from about 2026-11-13; core obligations from about 2027-05-13 (some sources say the 14th). The 12-month compression proposal had not been notified; the 2026-10-05 Removal of Difficulties Order made only textual fixes. | PIB [S17]; Bar & Bench / dcomply [S18]; SCC Online [S19] | 2025-11-17; 2026-10-15 | read; read (2nd) | medium-high |
| 17 | Penalties under DPDP: up to ₹250 cr (security safeguards), ₹200 cr (breach notice, children), ₹50 cr (other). | PIB [S17] | 2025-11-17 | read | high |
| 18 | IT Rules amendment (in force 2026-02-20): synthetic content includes audio. Intermediaries offering tools that create it must ensure a prominently prefixed audio disclosure and embedded provenance metadata. | AMS Shardul; Hogan Lovells [S20] | 2026-02-10 | read (2nd) | medium-high |
| 19 | The harvest claim of "TRAI outbound-AI rules in force since 2026-03-10" traces to a vendor page (qcall.ai) with no TRAI citation. No TRAI instrument has that date. The only AI-specific TRAI rule is A2P pre-declaration, from about 2026-11-17. | html-portfolio 0657e21b [S36]; TRAI lists [S14, S15]; [S03] | 2026-08-25; 2026-10-17 | read | high |
| 20 | RBI recovery rules for all regulated entities, in force 2027-01-01: contact only 08:00–19:00; bi-directional call recording kept 6 months; the borrower is told about recording. Recovery agency is defined as any entity other than the lender's own employees. | RBI/2026-27/223–231 via corplawupdates [S22] (rbidocs blocked) | 2026-08-06 | read (2nd) | medium |
| 21 | IRDAI tele-callers must say the call is recorded and that the client may get a copy. Call hours follow TRAI/DoT. | IRDAI 2011 guidelines [S24] | 2011-04-05 | read | medium (current applicability unverified) |
| 22 | WhatsApp: a business may contact people only after they give their number *and* opt in. Automation needs human escalation paths. | WhatsApp Business Messaging Policy [S29] | 2026-09-23 | read | high |
| 23 | WhatsApp terms s.4.7: general-purpose AI as the primary product is prohibited. Platform Data may not train or improve AI models, except a model for one business's exclusive use. | Meta WhatsApp Business Platform terms [S30] | 2026-09-23 | read | high |
| 24 | WhatsApp India per-message rates from 2026-10-01: marketing ₹0.8631; utility ₹0.115; authentication ₹0.115; authentication-international ₹2.4971. | Meta INR rate card [S31] | 2026-10-01 | measured (parsed the xlsx) | high |
| 25 | WhatsApp per-user marketing caps are dynamic and apply to India (error 131049). The owner's CommandCentre saw cold marketing templates dropped with 131049. | Meta docs [S32]; harvest cc-branches [S37] | 2026; 2026-10-15 | read; measured (owner) | high; medium |
| 26 | WhatsApp business-initiated calls are available in India and need the user's call permission (permanent permission since 2025-11-03). | Meta Calling API docs [S33] | 2026 | read | high |
| 27 | Gmail bulk senders need SPF, DKIM and DMARC, one-click unsubscribe, and a spam rate below 0.30%. | Google [S34] | 2024-02-01 | read | high |
| 28 | CNAP (caller-name display) rolls out from 2026-11-01. Enterprise display names must be a registered trademark or GST trade name. | Inc42 / Telangana Today [S35] | 2026-10-15 | read (2nd) | medium |
| 29 | Under the 2026 authorisation rules, VNO categories collapse to 5. Access Service entry fee is reported at ₹12.5 lakh per service area; licence fee 8% of AGR. | Whitewater [S26] (DoT e-services 403) | 2026-06-23 | read (2nd) | medium |
| 30 | Exotel holds a pan-India UL-VNO Access Service licence and relies on partner networks. | Exotel press release [S27] | 2022-11-10 | vendor claim | medium |

Contradictions kept on file:

- **Promotional hours.** Primary text gives 10:00–21:00 by default; Exotel says 09:00–21:00.
- **DPDP day of month.** Sources split between the 13th and 14th, for both November 2026 and May 2027.
- **SEBI deadline.** One broker's page conflates SEBI's deadline with the IRDAI direction date. The primary TRAI
  direction has SEBI QSBs at 2026-03-15.
- **Penalty figures.** The vendor claim of a "₹10 lakh fine for businesses" is actually TRAI's financial disincentive
  on *telecom operators* for misreporting (₹2 lakh, then ₹5 lakh, then ₹10 lakh) [S02 reg 27(1)(d)]. It is not a
  fine on senders.

---

## 4. Measurements

This lane is regulatory, so it has no audio or latency measurements. What we measured or computed:

| Measurement | n | Method | Date | Result |
|---|---|---|---|---|
| WhatsApp India rate card | 1 rate card (INR and USD sheets) | Downloaded Meta's linked xlsx files and parsed the India row | 2026-10-17 | INR: marketing 0.8631, utility 0.115, authentication 0.115, authentication-international 2.4971, "service" column 0.115. USD: 0.0118 / 0.0014 / 0.0014 / 0.0304. Also lists "Meta Business Agent $2.00 / 1M tokens". |
| Share of 140 calls blocked by DND | 1 quarter (Q1 FY27) | 1.48B ÷ 13.16B from TRAI PR 111/2026 | 2026-10-17 | 11.2% |
| Share of incoming calls AI-flagged as suspected spam | 1 quarter | 22.99B ÷ 721.79B | 2026-10-17 | 3.2% |
| A2P / SIP-PRI share of UCC disconnections | 1 month (April 2026) | 15,736 ÷ 20,591, as stated in the TRAI memo | 2026-10-17 | 76% (TRAI says "approximately 75%") |
| Effective dates of the Third Amendment | 3 commencement buckets | Publication 2026-09-18 plus 30, 60 and 90 days | 2026-10-17 | 2026-10-18; 2026-11-17; 2026-12-17. These assume Gazette publication on the notification date; the Gazette host was blocked. |

---

## 5. Use-case map, summary

The full cell text, conditions and sources are in `usecase-map.csv`. Status today is as of 2026-10-17; the 12-month
column runs to 2027-10.

| Use case | Status today | Status in 12 months | Pre-sales verdict | Post-sales verdict |
|---|---|---|---|---|
| U1 Cold promotional, B2C bought/scraped list | LWC (140, registered, non-DND, 10–21h, A2P declared) | NOT-VIABLE after about 2027-05-13 (DPDP) | Avoid as a wedge | n/a |
| U1b Cold B2B to self-published numbers | LWC | LWC, with proof of where each number came from | Niche only | n/a |
| U2 Consented lead follow-up | LWC | LWC | **Best pre-sales lane** (140; 7-day window; DND leads need registered consent; minors need parental consent from 2027-05) | n/a |
| U3 Inbound | LAWFUL | LAWFUL | Viable | **Viable, lowest friction** |
| U4 Transactional/service outbound (COD, NDR, reminders, KYC) | LWC | LWC | n/a | **Viable**: series by sector, A2P declared, zero promotion; risk of spam flags on 10-digit numbers |
| U5 Feedback/NPS | LWC | LWC | n/a | Viable: no offers in the call; feedback named as a purpose in the notice |
| U6 Renewals / cross-sell | Renewal LWC; cross-sell LWC (constrained) | Cross-sell needs consent (DND, DPDP) | n/a | Renewal viable; cross-sell only as a separate 140 call |
| U7 Collections | LWC | LWC, stricter from 2027-01-01 | n/a | Viable, but the heaviest conduct regime; open question on AI as a recovery agency |
| U8a WhatsApp, user-initiated | LAWFUL | LAWFUL | Viable | Viable (no cross-tenant training on WhatsApp data) |
| U8b WhatsApp, business-initiated | LWC with opt-in; NOT-VIABLE cold | Same | Opted-in only | Viable (utility templates ₹0.115) |
| U9 Email | LWC (deliverability rules) | LWC if consented or self-published; NOT-VIABLE for bought B2C lists | Consented nurture | Viable |

**H1 kill check.** H1's kill condition is "any use case that needs consent the buyer cannot realistically produce".
It is triggered for:

- U1, the B2C cold list: explicit consent registered in the Consent Register today for DND numbers, and DPDP consent
  from May 2027 for everyone;
- U1, U2 and U6 for DND-registered recipients, until uploading outside consents to the Consent Register opens beyond
  the banks;
- U8b sent cold (WhatsApp opt-in);
- U2 for edtech or coaching leads under 18, from 2027-05 (verifiable parental consent).

---

## 6. Gaps in the market

These are regulation-created needs that we have **not** seen addressed in primary vendor material. Whether
competitors already cover them is a question for lane l4; treat each as a hypothesis.

1. **Compliance-native call routing.** Classify every call's content as service, transactional or promotional, then
   choose the legal number series per tenant sector: 140, 1600, 1601, or a declared 10-digit number.
   - The guard is real-time: it stops the agent drifting into an offer during a service call. One offer line turns
     a 1600 or 1601 call into misuse of the series [S02; S08].
   - This is the regulatory twin of the harvest's "safety by predicate" law: an output fence for promotional
     content.
2. **A consent evidence ledger built for TRAI's tests and DPDP at once.** It would:
   - capture the inquiry with digital proof;
   - enforce the 7-day and 3-month windows;
   - produce evidence that "on its face appears genuine to an objective, reasonable observer", which is what
     operators must check on a complaint [S03 memo];
   - export legacy consents to the Consent Register when TRAI opens uploads to non-banks;
   - generate DPDP Rule 3 notices.

   The harvest already has an append-only consent ledger (hp-maya-latest migration 016) and a temporal consent fence
   (hp-multimodal-groupai) to adapt.
3. **Spam-flag hygiene as a product.** Monitor "Suspected UCC CLI" notifications and pace calls against the three
   signals operators watch (recipient diversity, short calls, few incoming calls). Steer tenants onto designated
   series where their sector allows. The scale of the problem: 22.99B calls flagged in one quarter, and 243k warnings
   issued in the first week [S11].
4. **A dated buying trigger in collections.** All RBI-regulated lenders must comply by 2027-01-01 with:
   - 08:00–19:00 contact limits enforced by the system;
   - recording of every call, with 6-month retention and the borrower told;
   - call count and time logs;
   - a grievance officer named on every communication [S22].

   An AI dialler that does all of this by construction is a compliance sale with a deadline. It needs a lawyer's
   opinion on the recovery-agency question first.
5. **A dated buying trigger in logistics and utilities.** 1601 migration is due by about 2026-11-08 [S08]. Couriers
   and 3PLs re-platform their NDR and delivery calling onto new numbers; that is a natural switching moment.
6. **Demand shifts after DPDP.** From May 2027, outreach that relies on bought lists loses its legal basis. Demand
   moves to inbound, click-to-WhatsApp, lead-form speed-to-lead and first-party reactivation. That favours VP's
   consented and post-sales lanes over "AI cold caller" positioning.
7. **WhatsApp economics favour service flows.**
   - Utility templates cost ₹0.115, a seventh of marketing at ₹0.8631.
   - Utility templates are free inside the 24-hour window.
   - Click-to-WhatsApp entry opens a 72-hour free window [S31].
   - Marketing messages are throttled per user [S32].

   An agent that works the service window well has structurally lower messaging costs.

---

## 7. What would kill this (the lane's conclusions)

- **TRAI or DoT designate AI calls to a series, or ban AI promotional calls.** This could come through a new
  consultation. None was listed on 2026-10-17 [S14]. It would mainly hit U1 and U2.
- **A lawyer finds non-designated 10-digit service calls by non-BFSI sectors breach reg 3.** Reg 3 says commercial
  communication may use only registered headers or special series. If service calls count, D2C, health and edtech
  transactional calling waits for 1601 to expand. That would demote U4 for those sectors.
- **A lawyer or RBI treats a vendor-run AI as a "recovery agency".** Then IIBF certification and agency obligations
  would apply to VP. This could make U7 impractical for a startup vendor.
- **MeitY guidance classes B2B voice-agent platforms as intermediaries for synthetic content.** That is not a kill.
  It is a condition: a mandatory audible disclosure plus watermarking. The harvest's audio-provenance service
  (AudioSeal + C2PA) already covers it.
- **CRF uploads stay closed to non-banks.** DND-registered leads (16% of subscribers) would stay unreachable for
  promotional follow-up.
- **DPDP's timeline is compressed to November 2026.** The proposal had not been notified as of 2026-10-15 [S18; S19].
  If notified, the U1 and U9 cut-offs move six months earlier.

---

## 8. Owner actions

1. **Get the map reviewed by a telecom and data-protection lawyer.** Pick an Indian firm that publishes on both
   TCCCPR and DPDP. Send `usecase-map.csv` and these questions:
   - (a) Can a non-BFSI, non-utility sender make AI service calls from declared 10-digit numbers under reg 3?
   - (b) Does an informational reply to a digital inquiry within 7 days count as a service call, so that it may reach
     DND numbers?
   - (c) Is a feedback or NPS call a service call?
   - (d) Is VP an "intermediary offering SGI tools" under the IT Rules 2026?
   - (e) Is a vendor-run AI a "recovery agency" under RBI's 2026 amendments?
   - (f) Where does the DPDP public-data exclusion stop for business owners' numbers on marketplaces?
   - (g) Does recording a call as a participant need anything beyond notice?

   Budget is the owner's decision. This is the external proof required by brief §6.
2. **Ask three providers about telephony.** Owner to ask Exotel, Ozonetel and Tata Teleservices (or Airtel IQ), by
   phone or sales form, which we cannot submit:
   - Will you allot 140xx, 1600xx (BFSI tenants) and 1601xx (logistics tenants) numbers in the *tenant's* name?
   - Do you support SIP bring-your-own-carrier to a media server on Azure southeastasia or centralindia?
   - How do you handle A2P pre-declaration of CLI ranges on DLT from 2026-11-17?
   - What A2P termination charge do you pass through?
   - Would you classify VP as an aggregator or sender if VP holds the trunks?

   Record answers, with dates, in `context/`.
3. **Ask one operator's enterprise desk about consent uploads.** Can a non-bank Principal Entity register consent
   templates and upload legacy consents to the Consent Registration Function today, and if so, by what procedure?
4. **Product rules to adopt now, owner decision:**
   - disclose AI at the start of every call and never deny it;
   - keep zero promotional content on any service call (fenced in code);
   - promotional calls only on 140 numbers;
   - store inquiry evidence with a 7-day expiry;
   - the RBI 08:00–19:00 window and recording for any lending tenant;
   - no training across tenants on WhatsApp data.
5. **Recheck TRAI's consultation and direction pages monthly.** The next likely instruments are further 1601 sector
   phases, a non-bank Consent Register procedure, and A2P implementation details.

---

## 9. Open questions

- What was actually published in the eGazette for the Third Amendment, the DPDP Rules and the Telecom Act? The host
  was TLS-blocked, so the publication-date-based effective dates (and the 13 vs 14 November/May split) are unconfirmed.
- Exact wording of RBI/2026-27/223–231 on calling hours, recording and any mention of automated or AI calls. rbidocs
  was CAPTCHA-blocked, so we rely on one law-firm summary.
- Have IRDAI's 2011 distance-marketing guidelines been subsumed by its 2024 consolidation? Which recording and
  script duties apply to AI tele-sales of insurance today?
- Has any class of Significant Data Fiduciary been notified? We found none, but did not verify.
- Can outsourced recovery agencies and telemarketers acting for BFSI principals use the principal's 1600 numbers?
- Do the Telecom Act's authorisation rules cover WhatsApp voice calls? We treat them as outside TCCCPR, at medium
  confidence.
- Does CNAP display improve answer rates for 140 or 1600 calls? This is measurable once the rollout starts on
  2026-11-01. It is an economics question for lanes l2 and l3.
- Blocked hosts, recorded and not guessed: egazette.gov.in (TLS chain failure via proxy), meity.gov.in (Akamai
  access denied), rbi.org.in / rbidocs (CAPTCHA), eservices.dot.gov.in (403), indiacode.nic.in (504),
  dot.gov.in (document not found).
