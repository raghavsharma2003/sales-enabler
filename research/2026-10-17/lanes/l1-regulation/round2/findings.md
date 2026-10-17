<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

# Round 2, package r2-regulation-insurance: the insurance-intermediary regulatory layer

Date: 2026-10-17 (Saturday). Critic items covered: A1, A2 (a-e), A9 (adversarial pass on the beachhead's regulatory
claims) and A16.

- **Spend:** INR 0. No Azure calls.
- **Web searches:** 6, used sparingly.
- **Status:** research, not legal advice. Every legal reading below is the desk reading of primary text and needs
  counsel (§7).

Files in this folder (`lanes/l1-regulation/round2/`):

| file | contents |
|---|---|
| `findings.md` | this note. The harness refused the Write call, so this text exists only in the structured output; restore it from there |
| `usecase-map-insurance.csv` | six U6-INS rows, same 22 columns as `../usecase-map.csv` |
| `sources.csv` | R01-R43 plus one blocked host (B01) |
| `primary-excerpts.txt` | verbatim passages of every primary text relied on, so a lawyer or verifier can check them without re-downloading. Personal contact details in annexures were not copied |

**Source tags.** `[Rxx]` is a round-2 source and `[Sxx]` a round-1 source (`../sources.csv`). Raw downloads are in
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/r2-reg-ins/`.

---

## 0. What changes, in one screen

1. **1600 is mandatory for intermediaries. IRDAI said so itself.**
   - IRDAI Circular IRDAI/PP&GR/CIR/MISC/02/01/2026 of **6 January 2026** is addressed to "**All Insurers and Insurance
     Intermediaries**". It requires 1600 "for all service and transactional voice calls" by 2026-02-15.
   - After that date no such call may come from any other number "irrespective of explicit or inferred customer
     consent" [R03].
   - The TRAI direction says "all entities regulated by IRDAI", with no carve-out. The SEBI direction, by contrast,
     made other intermediaries' adoption voluntary [R01, R02].
   - Open question 1 is **closed: mandatory**. A renewal desk calling from 10-digit or personal mobiles has been
     non-compliant since 2026-02-15 under both TRAI and IRDAI.
2. **1600 is obtainable on paper; price and AI streaming are unpublished.**
   - IRDAI's circular annexes nodal officers at 8 access providers: QTL, Tata Teleservices, Vi, Airtel, RCOM, Satzilio
     Telecom, Jio and BSNL [R03].
   - CPaaS documentation describes the path [R09, R11]:
     - eligibility: a regulator licence or registration;
     - a DLT Principal Entity (PE) registration;
     - the regulator certificate uploaded at voice-header registration;
     - about 7-12 business days.
   - No vendor publishes a 1600 price.
   - No vendor states plainly that WebSocket or SIP media streaming to a third-party AI works on 1600 lines. Exotel
     claims it in marketing copy that also contains factual errors [R13, R14].
3. **The biggest new finding: TRAI and IRDAI classify the same renewal call differently.**
   - Under TRAI's TCCCPR, a renewal or expiry reminder with no offer can be a *service* call [R35 (bh)(i)].
   - Under IRDAI's 2024 policyholder regulations, "**Solicitation**" means approaching "a prospect or a policyholder
     ... with a view to persuading ... to purchase **or to renew** an insurance policy" [R23 reg 3(13)].
   - Telephonic solicitation by intermediaries is reserved for **certified humans**: Broker Qualified Persons,
     Specified Persons, Authorised Verifiers, ISPs and PoSPs. It also requires:
     - insurer-approved scripts;
     - recording notices;
     - a telemarketer that holds an **IRDAI certificate** [R19, R20, R21, R22].
   - **IMFs may not use telemarketers at all.** Their distance marketing must go "only through ISPs" and needs
     IRDAI's prior approval [R21 reg 3(d)].
4. **Intermediary records must stay in India.** Under IRDAI's 2025 Maintenance of Information Regulations, an
   intermediary keeps all required records at its principal place of business in India, at branches, or "in data
   centres located and maintained in India", for **at least 10 years** [R27 reg 13, 16]. "Required records" include:
   - renewal-business records;
   - telecaller, AV and telemarketer names;
   - "all phone numbers used for solicitation";
   - under the CA telemarketing schedule, call recordings [R19 Sch VII].

   Storing recordings, transcripts and policy data outside India is therefore out for the beachhead itself, not only
   for alternate 2. Whether *transient inference* outside India is allowed is a lawyer question.
5. **Commission is the insurer's policy; regulation fixes no rates.**
   - Since 2023, and from 2024-04-01 under the EoM (Expenses of Management)-including-commission regulations, no
     product-wise caps remain. Each insurer pays commission under a board-approved policy within overall EoM caps:
     30% of gross written premium (general) and 35% (standalone health) [R31, R32, R33].
   - Commission is paid "for soliciting or procuring or transacting insurance business" [R31].
   - No regulation found entitles an intermediary to commission when a general or health policy renews directly with
     the insurer. That is insurer policy, so the interviews must ask it.
6. **ACS: no action.** Microsoft's own FAQ says phone-number capability is "intentionally disabled" for ACS resources
   created after the 2026-09-23 announcement. India is not among the 44 countries and regions on ACS's list [R39, R40].
7. **Product consequence.**
   - VP should be **software operated by the intermediary**, not a "managed telemarketer". The intermediary is the
     DLT PE, owns the 1600 CLI and, ideally, is also its own telemarketer (TM) on DLT ("self-managed").
   - The AI does **neutral reminders plus same-insurer payment links**. Persuasion, re-quotes and advice go to a
     certified human.
   - This tightens SYNTHESIS's "never promote in the call" rule into "never *solicit* in the call". It also makes
     **IMFs the riskiest stratum**, and IMFs dominate the in-reach pool.
8. **Dates.**
   - The 7-day inquiry window starts on **Monday 2026-10-19**, the first interview day, on a strict reading of "after
     thirty days" from a 2026-09-18 Gazette.
   - A2P pre-declaration starts on **2026-11-18**.
   - Every broker, corporate agent (CA), IMF and web aggregator (WA) must apply for a **fresh Certificate of
     Registration (CoR) by 2027-01-31**.
   - **Salesperson tagging** of every policy starts **2027-01-01** [R18, R35].

---

## 1. A1: 1600 scope and obtainability

### 1.1 What the primary texts require

**TRAI Direction, 16-12-2025.** Re-fetched today; byte-identical to the round-1 copy (sha256 `7c4e3fca…ab71`). The
direction tells access providers to ensure the following [R01, para 9]:

- (i) "adoption of the 1600-numbering series by all entities regulated by IRDAI is completed by 15th February 2026";
- (ii) on a UCC (unsolicited commercial communication) complaint against an IRDAI entity that has not subscribed to
  1600, "the action is taken as per regulatory provisions applicable to unregistered telemarketers";
- (iii) "entities regulated by IRDAI are not permitted to initiate any service or transactional voice calls, even with
  the explicit or inferred consent of customers, from numbers other than those allocated under the 1600-series, after
  the 15th February 2026".

The IRDAI direction has **no annexure and no phasing**. The RBI/SEBI/PFRDA direction of 19-11-2025 [R02] works
differently:

- it lists categories;
- it leaves "SEBI-registered intermediaries, other than those mentioned above" to "Voluntary adoption for time being";
- it covers only CRAs and PFM-PoPs for PFRDA.

The difference supports the plain reading that *all* IRDAI-regulated entities are covered.

**IRDAI Circular, 6-1-2026** (IRDAI/PP&GR/CIR/MISC/02/01/2026; PDF created 2026-01-07) [R03]:

- addressed "To: All Insurers and Insurance Intermediaries";
- para 2(i): "Adoption of the 1600-series for all service and transactional voice calls is completed on or before 15th
  February, 2026";
- para 2(ii): "No service or transactional voice calls are initiated from any number other than those allocated under
  the 1600-series after the aforesaid date, irrespective of explicit or inferred customer consent";
- para 2(iii): non-compliance attracts TRAI's unregistered-telemarketer action "in addition to any action as may be
  considered appropriate by the Authority" (IRDAI);
- para 3: "Insurers and Insurance Intermediaries may coordinate with their respective Telecom Service Providers (TSPs)
  for timely allocation, activation and operationalization of the 1600-series numbers". Annexure-I lists nodal
  officers at 8 access providers.

**TRAI PR 91/2026** adds that 1600 is for service calls "to their existing customers" and that "any tagging, blocking
or filtering of the calls originating from 1600 series numbers is not permitted" [R06].

### 1.2 Coverage by buyer type

| buyer | regulated by IRDAI as | 1600 mandatory? | basis | confidence |
|---|---|---|---|---|
| Insurance broker (direct, composite) | intermediary, holds CoR | **Yes** | R03 addressee; R01 "all entities" | high |
| Corporate agent (bank, NBFC, other) | intermediary, holds CoR | **Yes**. Bank CAs are also caught by the RBI phase (2026-01-01) | R03; R02 | high |
| IMF | intermediary, holds CoR | **Yes** | R03 | high |
| Web aggregator | intermediary, holds CoR | **Yes** | R03 | high |
| PoSP platform (legally a broker, CA or IMF) | as its registration | **Yes** for calls the platform places | R03 | high |
| PoSP calling its own book from a personal mobile | individual engaged by an insurer or intermediary that is "responsible for the conduct" of the PoSP [R34] | **Unclear.** The circular names entities, not individuals. Calls made *for* the intermediary are arguably its calls | R01; R03; R34 | low |
| Individual insurance agent | appointed by an insurer | **Unclear**, as for PoSPs | R01; R03 | low |

### 1.3 Obtainability

**TRAI's 31-12-2024 letter.** Both 1600 directions say that "DoT, vide its letter dated the 23rd December 2024,
conveyed its decision to allocate ... '1600', exclusively for Government ... and BFSI ... entities" and that TRAI "vide
its letter dated the 31st December 2024, directed all Access Providers to initiate allocation of the said numbering
series to eligible entities" [R01, R02]. The letter itself is **not published**: it is not in TRAI's directions list
(checked), and DoT pages were blocked in round 1. "Eligible entities" is defined nowhere in public. In practice it means
regulator-registered BFSI entities: PR 135/2025 says other SEBI intermediaries "may voluntarily migrate ... after
verification of their registration details" [R04], and the vendor documentation says the same (table below).

**Adoption so far.**

| date | entities on 1600 | numbers | source |
|---|---|---|---|
| 2025-11-19 | about 485 | over 2,800 | R04 |
| 2025-12-17 | about 570 | over 3,000 | R05 |
| Q1 FY27 | not stated | 1.15 bn calls originated from 1600 numbers | R07 |

The counts cover all of BFSI plus government. IRDAI alone registers more than 2,500 intermediaries, plus 62 insurers
[l3]. No later entity count was found. In December 2025 the long tail of intermediaries had almost certainly not
migrated (inference from the counts).

**Telco and CPaaS 1600 onboarding, as published** (all vendor material, read 2026-10-17):

| provider | who it says is eligible | documents named | is an IRDAI CoR enough? | cost | media streaming to a third-party AI on 1600 | constraints | source |
|---|---|---|---|---|---|---|---|
| **Plivo** (VNO) | "BFSI ... entities that hold a valid licence or registration from a recognized financial regulator", declared on a BFSI Customer Application Form. Examples include "mutual fund distributors" (SEBI intermediaries) | PE registration on Tata DLT; BFSI form (regulator, licence number, DLT ID); Aggregator Telemarketer Declaration (TM's PAN, CIN, DLT TM ID); "business-category certificate from the governing regulator" plus Plivo NOC at voice-header registration | **Yes as the regulator certificate**, alongside DLT PE registration and the TM declaration | not published | Plivo's `<Stream>` gives bidirectional WebSocket (L16 8/16/24 kHz, mu-law). The 160-series page does not mention streaming, so availability on 160 is **inference** (same account) | Tata DLT only; **TM must be registered in Mumbai or Karnataka**; one NOC per number; about 7-12 business days (2-3 DLT, 1-2 NOC, 3-5 header, 1-2 template) | R09, R10 |
| **Vobiz** | "160 Series ... BFSI sector only" | Scenario 2 (Vobiz acquires): LOI, GST, PAN, signatory KYC, Tata DLT ID. Scenario 1: the entity gets the number from any operator, delivered to Vobiz's IP and data centre and assigned to Vobiz's DLT ID | regulator certificate **not listed** (it is probably asked at DLT header stage; unverified) | not published; "routing charges ... billed separately per minute"; 140/160 CPS and concurrency "purchased separately" | Vobiz is an AI-voice-oriented SIP/WebSocket platform, and the number is used "on the Vobiz platform" after tests. Explicit 160 streaming: **not stated** | "**Outbound only.** Neither 140 nor 160 numbers support inbound calls", so callbacks need a DID | R11, R12 |
| **Tata Tele Business Services** (operator) | "1600 series can only be issued to the entities regulated by RBI, IRDAI, SEBI, and PFRDA" | DLT header and template registration mandatory; no list | not stated | not published | "Delivered via SIP Trunk, PRI, or Internet Telephony"; nothing on AI or streaming | "pan-India with circle-wise allocation" | R08 |
| **Jio** (operator) | BFSI | not stated | not stated | not published | standalone SIP trunk to an "existing PBX or dialler", or Jio's cloud option. A SIP-to-gateway leg is plausible (inference) | none stated | R15 |
| **Exotel** (UL-VNO) | "Only entities regulated by RBI, SEBI, IRDAI, or PFRDA, or government bodies" | DLT entity and headers | not stated | not published | claims its BFSI onboarding provisions 1600 and DLT "under 48 hours" and runs a gen-AI voicebot over AgentStream | one number per circle. **Unreliable:** the same pages call 1601 the BFSI series, which contradicts TRAI's 1601 direction [S08] | R13, R14 |
| Airtel IQ, Vi, Knowlarity, Ozonetel | no public 1600 onboarding page found; Ozonetel only mentions the mandate | n/a | n/a | n/a | n/a | assets.airtel.in reset the connection (blocked) | R16, R17 |

### 1.4 Reading for VP

- **The legal path exists.**
  - The intermediary registers on DLT as PE and gets 1600 CLIs per telecom circle from a TSP or VNO.
  - It registers each 1600 number as a voice header (uploading its IRDAI CoR) and service templates.
  - The placing entity is the TM: either the CPaaS, which Plivo calls "Partner-Managed", or the intermediary itself
    ("Self-Managed").
- **VP should not be the TM.** If VP signs the Aggregator Telemarketer Declaration, it becomes the telemarketer in
  TRAI's sense. That puts VP inside two regimes:
  - IRDAI's "Telemarketer" definition (TRAI-registered **and** "holding a certificate issued by the Authority") [R19 def
    (q)];
  - TRAI's sender-liability regime [S03].

  The cleanest structure is the self-managed one: the intermediary is PE and TM on its own CPaaS account, and VP is
  software driving the media stream.
- **Unknowns that block a quote:**
  - per-number, per-circle and per-minute price;
  - whether a small IMF or broker gets served at all (Plivo's TM-location rule excludes TMs registered outside Mumbai
    and Karnataka);
  - whether WebSocket streaming is enabled on 160 lines.

  These are owner questions for the telephony quotes (B8), worded in §8.

---

## 2. A2: the IRDAI layer, items (a) to (e)

### (a) Does the IRDAI telemarketer regime survive, and would VP need to register?

**It survives, and it was re-written as recently as July 2026.**

- **Corporate agents.** Telemarketing sits in IRDAI (Registration of Corporate Agents) Regulations 2015, reg 25 and
  Schedule VII [R19]:
  - "Telemarketer" means an entity registered with TRAI "and holding a certificate issued by the Authority";
  - an "Authorized Verifier" is "a person employed by a Telemarketer for the purpose of solicitation or sale over
    telephonic mode";
  - the CA needs IRDAI's prior approval to telemarket;
  - IRDAI issues certificates to the telemarketer and to each AV;
  - "No corporate agent or its telemarketer shall make outbound calls to any person unless he or she has shown
    interest in buying an insurance policy by making enquiries to that effect" (reg 25(2)(vii), renumbered (vi) by the
    2026 amendment);
  - a telemarketer may serve at most three insurers or insurance entities;
  - Schedule VII: "Telemarketers shall employ authorized Verifiers, who alone are permitted for soliciting and
    concluding the sale of insurance products".
- **The 2026 amendment** (Gazette 30-07-2026) keeps this regime [R18]:
  - AVs "shall be employees of the Telemarketer";
  - AVs now get a "Letter of Enrollment ... for servicing, procuring or soliciting insurance business";
  - AVs must pass a pre-recruitment test.
- **Web aggregators** may register as telemarketers and use AVs, but only for leads from their own website [R22 reg
  29, Form V(g)].
- **Brokers** "can undertake outsourcing activities only to the extent of tele-calling as allowed under" the WA
  regulations [R20 regs 45-46].
- **IMFs** must do distance marketing "without engaging tele-marketer(s)", "only through ISPs", with prior approval
  [R21 reg 3(d)].
- **The IRDAI register** shows 38 telemarketer CoRs, each paired with one corporate agent (mostly banks). All listed
  validities ended between 2020 and 2023 [R43]. The register is stale, or the route is little used.
- **The 2011 Distance Marketing Guidelines** are still published [R26]. They are **not** in the repeal lists of the
  2024 policyholder-protection (PPHI) master circular (30 items) or the 2024 Operations master circular (11 items)
  [R24, R25]. The live rules for intermediaries are the regulation schedules above.

**Would VP need to register?**

| how VP is set up | consequence | status |
|---|---|---|
| VP's calls are **solicitation** (persuading renewal) **and** VP acts as the intermediary's telemarketer | VP needs TRAI TM registration **and** an IRDAI telemarketer certificate, and only human AVs may solicit and conclude sales. **An AI cannot be an AV** | desk reading of R19, R22 |
| For an **IMF** | not permitted at all | R21 |
| The intermediary is the Sender (and TM), VP is software the intermediary operates, and the calls are neutral service reminders | VP is probably not a "telemarketer" in IRDAI's sense | **open: lawyer Q3** |

### (b) Is a motor or health renewal reminder a service call or a solicitation, and who may solicit?

| regime | text | what it means for a renewal call |
|---|---|---|
| **TRAI TCCCPR** (as replaced by the Third Amendment) | "(bh) 'Service message or Service Call' means a message sent or voice call made by a Sender to (i) its Customer to provide information pertaining to a product or service procured by such customer ... and such messages or voice calls are not promotional in nature and do not require Explicit Consent" [R35]. Mixed content makes the whole call promotional [R36 def (av)]. Memo para 39 treats EMI reminders as service messages on inferred consent "for the duration/ discharge of the contract" [R36] | A **neutral** reminder (expiry date, the insurer's renewal premium, a link to pay the same insurer) fits (bh)(i). A **re-quote from another insurer, an add-on or sum-insured upsell, or a discount pitch** is promotional, so it moves to 140xx, is scrubbed, and **cannot be on 1600** |
| **IRDAI PPHI Regs 2024** | "Solicitation means the act of approaching a prospect or a policyholder ... with a view to persuading the prospect or a policyholder to purchase **or to renew** an insurance policy" [R23 reg 3(13)] | A call **meant to get the renewal** is solicitation in IRDAI's terms, whatever TRAI calls it |
| **IRDAI Maintenance of Information Regs 2025, Sch II** | intermediaries keep "A record of policies **solicited with respect to renewal business**", with the due date and the "date of renewal intimation sent by the intermediary" [R27] | IRDAI's own records treat renewals as solicited business |
| **IRDAI Broker Regs 2018, code of conduct 6** | brokers must "ensure that its client is aware of the expiry date" and "receives the insurer's renewal notice well in time" [R20] | A neutral reminder is also a **servicing duty**. This is the best textual support for "reminder = service" |

**Who may solicit by phone:**

- brokers: Broker Qualified Persons, or AVs (via telemarketing);
- corporate agents: Specified Persons, or a telemarketer's AVs;
- IMFs: ISPs;
- web aggregators: AVs;
- PoSPs: pre-underwritten motor, PA, travel and home products [R18, R19, R20, R21, R22, R34].

All are trained and examined humans with IRDAI enrolment or certification.

From **2027-01-01** each policy must carry "the name and functional identity of the [salesperson] who sold the
policy". For **CAs and brokers only**, there is a proviso: "where a policy is solicited directly through the digital
platform of the [CA / broker], without the involvement of a [salesperson] ... [documents] shall disclose the telephone
number and email address of the Principal Officer" [R18]. Whether an AI voice agent run by a broker counts as its
"digital platform" is untested and is the most interesting lawyer question (Q2). **IMFs get no such proviso.**

Telephonic solicitation under CA Schedule VII also requires [R19]:

- insurer-approved standardised scripts filed with IRDAI;
- explicit consent to continue;
- a language choice, with the call continuing only in that language;
- disclosure of the AV's name and certificate number;
- a recording notice and the right to a voice copy;
- recordings forwarded to the insurer.

**Answer to (b).**

- A renewal **reminder** can be a TRAI service call on 1600, if it has no offer.
- Under IRDAI, a call **meant to secure the renewal** is solicitation, which must be done by a certified human, or
  possibly through a broker's or CA's "digital platform".
- Re-quoting across insurers is both promotional (TRAI) and solicitation plus advice (IRDAI). For a broker, advice and
  quotation are also non-outsourceable core functions; see (c).
- SYNTHESIS's "never promote in the call" rule is therefore **not strict enough**. The safe line for the AI is
  "**inform, confirm, hand off**":
  - state the expiry date and the insurer's renewal premium as data;
  - send the same-insurer payment or autopay link;
  - answer factual questions from policy data;
  - route anything about switching, price objections, cover changes or advice to a certified person.

### (c) Which intermediary functions may or may not be outsourced to a technology vendor?

| intermediary | rule | consequence for VP |
|---|---|---|
| **Broker** | Reg 36: outsourcing as per Schedule II Form X under a board-approved policy. Form X 1(a): "The Insurance broker shall not outsource any of the following activities in any manner whatsoever: (i) the functions of the direct/ reinsurance/ composite broker as given in Schedule I – Form A". Those functions include "(c) Rendering advice on appropriate insurance cover and terms", "(e) Submitting quotation received from insurer/s for consideration of a client" and "(h) Assisting clients in paying premium under section 64VB". Outsourced providers are bound by the Insurance Act; the broker stays fully accountable; no whole or substantial sub-contracting; confidentiality; regulator access. Regs 45-46: tele-calling outsourcing only as the WA regs allow [R20] | A **"managed" AI service** that gives advice, presents re-quotes or "assists in paying premium" looks like outsourcing core functions. A **tool the broker operates** (the broker's 1600, scripts, supervision and data) is the safer characterisation. Neither is settled (lawyer Q5) |
| **Corporate agent** | reg 25 and Schedule VII: distance marketing only through its own Specified Persons or a certified telemarketer's AVs; CA "responsible for all acts of commission and omission" of persons deployed [R19] | no general outsourcing schedule found in the CA regulations. Telemarketing is the only named third-party route, and it requires humans |
| **IMF** | reg 3(d): no telemarketers; only ISPs; prior IRDAI approval. Reg 3(b): IMFs may themselves do insurers' outsourceable servicing activities for tied insurers [R21] | no third-party calling route at all for solicitation |
| **Web aggregator** | Form U: insurers may outsource to WAs "through the tele-marketing and distance marketing modes" [R22] | the WA is itself an outsourcing vendor to insurers |
| *Insurers (context)* | outsourcing now sits in PPHI Regs 2024 ch 3 (the 2017 Outsourcing Regs were repealed) and the Operations master circular ch III. Prohibited: investment, fund management, AML/KYC compliance, and decision-making on products, underwriting, claims and grievances. 17.2 says these provisions "shall not apply to the activities permitted to be carried out by ... intermediaries" [R23, R25] | renewal reminders are not on the insurers' prohibited list, so selling to insurers' renewal desks later is not blocked by outsourcing rules |

### (d) Where must policyholder data and call recordings be stored and processed?

| obligation | holder | text | source |
|---|---|---|---|
| Records in India | **every intermediary** | maintain "at their principal place of business in India" all records required under the Act, rules, regulations, guidelines, circulars or directions, or at branches, "or in data centres located and maintained in India" | R27 reg 13 |
| Retention | insurers and intermediaries | "minimum period of 10 years or as per the extant legal requirements ... whichever is later", from the last transaction or policy expiry | R27 reg 16 |
| What intermediaries must keep (extract) | intermediaries | renewal-business records (due date, renewal intimation date); for new business, the "name of the telecaller", the "name of authorized verifier", the "name of the telemarketer"; "A record of all phone numbers used for solicitation of insurance business along with the bills" | R27 Sch II |
| Call recordings | CAs (and their telemarketers) | the telemarketer preserves "recordings of all the calls" and forwards them to the CA, which forwards a copy to the insurer; the recordings of each call that becomes a policy go to the insurer within 30 days | R19 Sch VII 4(i), 8(vi) |
| Policy and claim records in India "only" | insurers | "held in data centres located and maintained in India only" | R27 reg 9(iii) (was R28) |
| Offshore outsourcing | insurers | "All original policyholder records continue to be maintained in India" | R23 reg 53(2) |
| ICT logs | insurers and **all intermediaries** | "ICT infrastructure logs shall be maintained for a rolling period of 180 days and within the Indian jurisdiction" | R29 (2023). The 2026 revision applies from this financial year [R30], but its annexure was **not retrieved** |
| DPDP | all | no localisation in the Act; cross-border transfer is allowed except to notified countries | S16 |

**Reading.**

- Recordings, transcripts, the due list and outcome records that an intermediary must keep belong in **India-region
  storage**: Azure centralindia or southindia storage, or the intermediary's own systems. VP's harvest Neon database
  has no India region [hv], so it cannot hold these records.
- Whether **transient inference outside India** is allowed is not answered by any text found. The data would be held
  briefly by a sub-processor in DZ-EU or Global Standard for STT, LLM and TTS while the stored record stays in India.
  "Maintain" points at storage, but insurers' outsourcing clauses and the unread 2026 cyber guidelines may say more.
  This is lawyer Q6.
- It now bears on the beachhead, not only on alternate 2. On round-1 numbers, India-only inference costs latency:
  DeepSeek in SEA took 2.58 s against 1.11 s in DZ-EU [l8v].

### (e) Who earns renewal commission, and how are rates set now?

- **Rates are not set by regulation.**
  - The Payment of Commission Regulations 2023 (in force 2023-04-01) replaced product-wise caps with "a written policy
    for payment of commission ... approved by the Board of the insurer" within EoM limits [R32].
  - They were repealed and folded into the **IRDAI (Expenses of Management, including Commission, of Insurers)
    Regulations 2024**, in force 2024-04-01. These set overall caps of 30% of gross written premium for general
    insurers and 35% for standalone health insurers, with a formula for life [R31].
  - The 2024 master circular requires commission "commensurate with the efforts required to acquire and sustain that
    type of business", and "Any new commission structure shall not apply to already sold policies" [R33].
- **Who earns it.**
  - Commission is defined as compensation paid to an agent or intermediary "for soliciting or procuring or transacting
    insurance business" [R31].
  - For **life** (multi-year premium contracts), renewal commission follows the policy's agent or intermediary of
    record under the insurer's policy. For orphaned policies, "Renewal commission, as per the Board approved policy,
    may be paid to the allotted insurance agent or direct sales staff, as long as the policy is inforce" [R25 ch IX
    46].
  - For **annual motor and health** policies, each renewal is a new annual contract. No regulation found guarantees the
    previous intermediary a commission if the customer renews **directly** with the insurer, through its portal, app or
    its own renewal call. That is decided by the insurer's commission policy and by which channel is coded on the
    renewal (inference; confirm in interviews and with counsel, Q8).
- **For kill criterion 3:** the interview has to establish, per line, what share of the book renews "around" the
  intermediary and whether commission survives it. Commission **rates by line** are being gathered by the r2-economics
  package; nothing here duplicates that.
- **The Sabka Bima Sabki Raksha (SBSR) Act 2025** amended Insurance Act s.42D: CoRs are now perpetual subject to an
  annual fee, from 2026-02-05 [R41]. Whether it also touched s.40 (commission) or s.44 (renewal commission after
  agency termination) was **not checked**, because India Code was blocked in round 1.

---

## 3. A9: refutation pass on the beachhead's regulatory claims

| # | claim as used in SYNTHESIS | verdict | primary evidence | correction |
|---|---|---|---|---|
| 1 | "A renewal reminder is a service call" (§1.1 item 1, §6 item 12) | **Weakened (conditional)** | (bh)(i) as replaced by the Third Amendment: information on a product "procured by such customer ... not promotional" [R35]; memo para 39, EMI-reminder analogy [R36]; PR 91: 1600 is for calls "to their existing customers" [R06] | True for a **neutral** reminder to a policyholder whose policy is in force. False the moment the call re-quotes another insurer, upsells or discounts: the whole call becomes promotional [R36 (av)]. **IRDAI separately calls persuading renewal "solicitation"** [R23 3(13)], which triggers certified-person and script rules. Post-expiry "lapse revival" for motor and health may not be "its Customer ... procured" (inference) |
| 2 | 1600 coverage of intermediaries "unverified" (§1.1 item 1, open question 1, kill 5, risk 2) | **Refuted (it is mandatory)** | IRDAI circular of 2026-01-06 to "All Insurers and Insurance Intermediaries" [R03]; TRAI 16-12-2025 [R01] | mandatory since 2026-02-15. What stays open is obtainability, cost and streaming (§1.3), plus PoSPs and individual agents |
| 3 | 7-day digital-inquiry window "from about 2026-10-18" (§2 alt 1, §6 item 5) | **Confirmed in substance; date weakened by one day** | "These regulations shall come into force **after thirty days** from the date of their publication in the Official Gazette" [R35 cl. 1(3)]; relationship (ii): inquiry "within seven days immediately preceding", "in writing or through digital means ... maintained in a verifiable form" [R35] | the notification is dated 2026-09-18, but the Gazette date is unconfirmed (egazette blocked, B01). On a strict reading ("after thirty days", with General Clauses Act s.9 excluding the first day), it is in force from **2026-10-19** if published 2026-09-18, and later if published later. Use "on or after 2026-10-19" |
| 4 | A2P pre-declaration "from about 2026-11-17" and a termination charge "up to ₹0.05/min" (§6 items 2-3, appendix) | **Confirmed text; date weakened by one day** | reg 4 (substituted): every Sender "shall declare to the Originating Access Provider ... in advance, about the use of ... (A2P) calls, along with ... CLI ranges"; an undeclared call "shall be treated as Unsolicited commercial communication". Reg 35A: the terminating operator "may charge" the originating operator "upto Rs. 0.05" per minute, but "there shall be no such charge on ... A2P calls made using number resources assigned from 140xx, 1600xx, 1601xx". Both start "after sixty days" [R35] | in force from **2026-11-18** on a strict reading. For a 1600 caller the **declaration applies and the charge does not**. The charge runs between operators; any pass-through is commercial. A2P is defined as "initiated by an application, software system, or automated platform without direct human dialling ... including ... artificial voice", so an AI caller is A2P |
| 5 | RBI recovery rules from 2027-01-01: 08:00-19:00, recording kept 6 months, agency definition (§2 alt 2, §6) | **Confirmed** (primary, re-read today) | RBI/2026-27/230 (6 Aug 2026): "These Directions shall come into effect from January 1, 2027"; 100Y(4) contact "only between 08:00 hours and 19:00 hours"; 100P recording "preserved for a period of six months"; recovery agency = "an entity or individual (other than NBFC's own employees)". No mention of AI or automated calls [R37] | none. Round-1 verifier caveats stand: contact outside hours on the borrower's request; NBFC carve-outs |
| 6 | DPDP core obligations about 2027-05-13; consent managers about 2026-11-13 (§6 item 5) | **Not refuted; day uncertain** | primary blocked (egazette, MeitY). Round-1 S17 (PIB): notified 14 Nov 2025, 18-month phase-in; S18 (dcomply): G.S.R. 846(E) dated 13 Nov 2025, Rule 4 from 14 Nov 2026, core rules from 14 May 2027. Search summaries (R42) describe a 12-month compression as discussed, not notified, as of May 2026 | use "13/14 May 2027 (core) and 13/14 Nov 2026 (Rule 4) unless compressed". Re-check monthly. A compression to November 2026 would hit cross-sell and the consent ledger, not the neutral-reminder lane |
| 7 | IRDAI recording duty rests on the 2011 guidelines, "applicability unverified" (§6 item 7) | **Superseded, upward** | CA Regs Sch VII (in force, kept by the 2026 amendment): the AV "shall inform Prospects that the call is being recorded" and that the prospect is entitled to a voice copy; telemarketers preserve all recordings [R19, R18]. The 2011 guidelines are still published and unrepealed [R24, R25, R26] | the recording notice and voice copy apply to telephonic solicitation by intermediaries now. Records are kept in India for 10+ years [R27] |
| 8 | Tie-breaker "lower 12-month regulatory risk" for insurance over real estate (§1.1 item 3, §1.3) | **Weakened** | items (a)-(d) above; IMF reg 3(d) [R21]; fresh CoR by 2027-01-31 [R18]; tagging from 2027-01-01 [R18] | at intermediary level the risk is *different*, not obviously lower: a solicitation boundary, a telemarketer regime that needs humans, an IMF ban on telemarketers, India-held records and a re-registration cycle. The tie-break against real estate needs re-argument |
| 9 | "Cross-sell needs a separate 140xx call" (§1 table, §6 item 2) | **Confirmed and strengthened** | def (av) proviso [R36]; memo para 37 ("No cross-sell, upsell ... permitted as a service message") [R36]; IRDAI: cross-sell is solicitation and needs a certified person [R23, R19] | the separate call must also be made by a certified human, or via a broker's or CA's "digital platform" if counsel agrees |

---

## 4. A16: ACS question

From Microsoft's own page, "Azure Communication Services retirement and breaking changes guide" (ms.date 2026-08-18,
updated_at 2026-10-08), which carries the FAQ [R39]:

- "**for new ACS resources created after the announcement, phone number capabilities are intentionally disabled** as
  part of the ACS telephony retirement process";
- "New Tenants: While resource creation remains possible during the retirement period, **tenants that have not
  received phone numbers before October 23, 2026 will not be able to purchase new phone numbers**";
- "After the September 2026 announcement, customers who do not have existing ACS phone numbers will no longer be able
  to acquire new phone numbers";
- "Only tenants with existing ACS resources can acquire new phone numbers for PSTN calling scenarios".

The ACS country list of telephone-number availability (updated 2026-09-23) names 44 countries and regions. **India is
not one of them** [R40].

Creating an ACS resource now would therefore preserve nothing. A resource created after 2026-09-23 has phone numbers
disabled, the cut-off is about holding numbers before 10-23 and not about holding a resource, and India was never
offered. ACS also offers nothing for 1600.

**Recommendation for the owner (B6):** take **no action** on ACS before 2026-10-23. Build the Indian PSTN leg on an
Indian TSP or CPaaS 1600 line held by each tenant [R39, R40].

---

## 5. Edits SYNTHESIS needs (for the main loop)

| SYNTHESIS location | current text | change to |
|---|---|---|
| §1.1 item 1, third bullet | "Whether this covers the intermediaries we would sell to is unverified (open question 1)" | "IRDAI's circular of 2026-01-06 applies 1600 to all insurers and insurance intermediaries [R03]; non-1600 service calls have been non-compliant since 2026-02-15" |
| §1.1 item 1, first bullet; §6 item 12 | "A renewal or expiry reminder is a service call" | "A neutral reminder is a TRAI service call; under IRDAI, persuading renewal is solicitation [R23], so the AI informs, confirms and hands off" |
| §1.2 kill criterion 5 | "Counsel finds that intermediaries must use 1600xx but cannot obtain them ..." | "(a) The buyer cannot get a 1600 CLI on a CPaaS that streams to our gateway within 4 weeks at an acceptable price; or (b) counsel holds that an AI renewal call is solicitation needing a certified person on every call, with no 'digital platform' route" |
| §1.3, §1.1 item 3 | tie-break on "lower regulatory risk" | mark it unverified at intermediary level (A9 row 8) |
| §0 and §3 "managed, compliance-carrying renewal caller" | "managed" | "software operated by the intermediary (its 1600, its DLT PE/TM, its certified people), with VP support". "Managed" invites outsourcing and telemarketer characterisation [R19, R20] |
| §3 build item 2 (compliance router) | blocks promotional drift | also blocks **solicitation drift**: no price comparison, no advice, no persuasion scripts; mandatory hand-off to a certified human; disclosure of the intermediary's name and CoR number |
| §6 item 7 (recording) | 2011 guidelines, applicability unverified | CA Sch VII recording notice and voice copy; records in India for 10+ years [R19, R27] |
| §6 item 11 (residency) | "decide before alternate 2" | applies to the **beachhead**: intermediary records in India [R27 reg 13]; transient processing abroad is an open question (lawyer Q6) |
| §6 item 2 table, §6 item 5, appendix | 2026-10-18; 2026-11-17 | "on or after 2026-10-19"; "on or after 2026-11-18" (strict reading, Gazette unconfirmed) |
| §9 risk 2 | "If IRDAI's 1600 mandate covers intermediaries ... If it does not ..." | "It does. Each tenant needs 1600 CLIs per circle; time-to-first-call is gated by DLT plus 1600 provisioning (vendor estimate about 7-12 business days)" |
| §1 table, §1.1 item 4 (pool) | in-reach pool led by 940 IMFs | add an IMF-excluded sensitivity: IMFs face reg 3(d) (no telemarketers; ISPs only) [R21] |
| new dated items | none | fresh CoR for every broker, CA, IMF and WA by **2027-01-31**; salesperson tagging **2027-01-01** [R18]. These are a compliance load on the buyer, and possibly a buying moment for "tagging-ready" call records |

---

## 6. Interview changes for Monday 2026-10-19

Add to `founder-kit/interview-guide.md`. These are behaviour questions, not opinions. Score each one.

1. **Number.** "What number do your renewal calls go out from today: a 1600 number, a 10-digit landline, staff
   mobiles?"
   - A 10-digit or personal mobile means non-compliant since 2026-02-15 under TRAI **and** IRDAI [R01, R03].
   - Score both "buying trigger" and "not enforced".
   - Follow-ups: "Do you have a 1600 number? From which operator or CPaaS? How long did it take, what did it cost,
     what documents did they ask for? Are you a PE on DLT, on which DLT? Has your TSP or IRDAI asked you for a
     status report?"
2. **Who talks.** "Who on the renewal desk is certified (BQP, SP, ISP, PoSP, AV)? Do uncertified telecallers make
   renewal calls?" This tests the solicitation boundary in practice.
3. **Re-quote share.**
   - "On a motor renewal call, how often do you quote another insurer? What share of renewals switch insurer? Who
     decides the quote?"
   - If most of the value is re-quotes, the AI's role shrinks to reminders (A2 b).
4. **Commission on direct renewals.** "When your customer renews on the insurer's website or app, or after the
   insurer's own reminder, do you still get the commission? By line?" This is kill criterion 3.
5. **Distance-marketing approval.**
   - "Do you have IRDAI approval for telemarketing or distance marketing? Do you use an outside telemarketer?"
   - IMFs: "Do your ISPs make the renewal calls themselves?"
6. **Recordings.** "Do you record renewal calls? Where are the recordings stored, for how long? Does your insurer ask
   for them?" This tests data location and retention [R19, R27].
7. **Fraud fear (critic §6 item 3).** "Do customers refuse to pay over links because of fake renewal calls? Does a
   1600 number change pickup?" [R06: 1600 calls may not be tagged or blocked.]
8. **Regulatory calendar.** "Have you applied for the fresh CoR (due 2027-01-31)? Are you ready for salesperson
   tagging from 2027-01-01?" Use this as a rapport question and a pain probe [R18].

---

## 7. Questions for the lawyer, sharpened (send with `usecase-map-insurance.csv` and `primary-excerpts.txt`)

**Insurance (IRDAI)**

1. **Q1. Service or solicitation.** Is a call by a broker, CA, IMF or WA to its own policyholder **solicitation** under
   PPHI Regs 2024 reg 3(13) ("persuading ... to renew"), or **servicing** under the broker code of conduct 6? Assume the
   call states the expiry date and the insurer's renewal premium and offers a same-insurer payment link, with no advice
   and no comparison. Does adding "would you like to renew now?" change the answer?
2. **Q2. AI as "digital platform".** May an AI voice agent operated by a **broker or CA** be "the digital platform" of
   that intermediary under the 2026 tagging proviso [R18]? Could a renewal concluded on such a call then be tagged to
   the Principal Officer rather than to a certified person? If not, may an AI perform *any* part of telephonic
   solicitation, given that only AVs, SPs and BQPs "alone are permitted for soliciting and concluding the sale"
   [R19 Sch VII 5(i)]?
3. **Q3. Is VP a "telemarketer"?** VP's software places calls through a CPaaS on a CA's, WA's or broker's 1600 CLI. Is
   VP then a "Telemarketer" needing an IRDAI certificate [R19 def (q); R22 def (n)]? Does it matter whether the
   intermediary is registered as both PE and TM on DLT (self-managed) or the CPaaS is the TM?
4. **Q4. IMFs.** Does IMF reg 3(d) ("without engaging tele-marketer(s)", "only through ISPs", prior approval) bar an IMF
   from using an automated voice agent:
   - (a) for neutral renewal reminders;
   - (b) for any renewal call?

   Is a neutral reminder "distance marketing" at all?
5. **Q5. Outsourcing.** Is an AI calling service "outsourcing" of a broker's core functions [R20 Sch II Form X 1(a)]:
   advice, submitting insurer quotations, or "assisting clients in paying premium" via a payment link? Or is it
   technology procurement? Which contract terms keep it on the right side (control, scripts, data ownership, a
   human-in-the-loop, no autonomous advice)?
6. **Q6. Data location.** Does "maintain ... in data centres located and maintained in India" [R27 reg 13] cover:
   - call audio;
   - transcripts;
   - extracted outcomes;
   - policy data a vendor processes?

   Is transient STT/LLM/TTS processing in an Azure EU or Global region lawful if stored records stay in India? What do
   the IRDAI Information and Cyber Security Guidelines 2026 (annexure not retrieved) [R30] require of intermediaries'
   cloud vendors?
7. **Q7. Recording.** For a non-solicitation service call by an intermediary, is recording plus notice required or only
   prudent? How do the 10-year minimum retention [R27 reg 16] and DPDP storage limitation fit together, and do
   policyholders have a voice-copy right [R19 Sch VII 7.3(iv)]?
8. **Q8. Commission.** Does any provision entitle an intermediary of record to commission when an annual motor or
   health policy renews directly with the insurer? Did the SBSR Act 2025 amend Insurance Act s.40 or s.44?
9. **Q9. CA outbound restriction.** Does CA reg 25(2)(vii) (renumbered (vi) in 2026: "No corporate agent or its
   telemarketer shall make outbound calls to any person unless he or she has shown interest ... by making enquiries")
   bar a CA's outbound renewal calls to existing policyholders, or only outbound sales calls?

**Telecom (TRAI)**

10. **Q10. PoSPs and agents.** Are renewal calls that PoSPs or individual agents place from personal mobiles "service ...
    calls" by "entities regulated by IRDAI" [R01, R03]? Is the platform or insurer that engaged them liable [R34]?
11. **Q11. Lapsed customers.** After a motor or health policy expires, is the former policyholder still "its Customer"
    for "a product ... procured" under (bh)(i) [R35]? Or must lapse-revival calls go on 140xx with consent and
    scrubbing?
12. **Q12. CPaaS reseller liability (carried from round 1, sharpened).** If the CPaaS is the TM on the intermediary's
    1600 CLI, and VP is a software layer with no DLT role, can any TRAI action reach VP's own resources?

**Carried from round 1** (`../report.md` §8): the IT Rules 2026 synthetic-audio duty for a B2B voice SaaS; the DPDP
processor contract and cross-border transfer; and, for alternate 2, whether a vendor-run AI is a "recovery agency".

---

## 8. Owner actions (no research substitute)

1. **Telephony quotes (B8).** Ask Plivo, Vobiz, Exotel and Tata (and Jio if reachable) the same questions, in writing.
   Answers should be dated and logged to `context/`.
   - "Will you provision 1600 numbers for an IRDAI-registered **broker / IMF** as Principal Entity? Is our IRDAI CoR
     the regulator certificate you need?"
   - "Self-managed (PE = TM) or partner-managed? Which DLT? Any restriction on where the TM is registered?"
   - "Price per 1600 number per circle per month, per-minute outbound rate, pulse, dedicated CPS and concurrency
     price?"
   - "Is **bidirectional WebSocket or SIP media streaming** to our gateway (Azure southeastasia or centralindia)
     supported on 1600 lines, today, for an AI voice agent? Codec and sample rate?"
   - "How do you handle the A2P pre-declaration of 1600 CLI ranges from 2026-11-18?"
   - "Inbound: which DID do you pair for callbacks?"
2. **Lawyer (B2).** Send Q1-Q12 with the two attachments. Q1, Q2, Q4 and Q6 decide the product shape. Ask for them
   first.
3. **ACS (B6).** No action (§4).
4. **Interviews (B1).** Use §6. Keep the IMF stratum in the sample: it is the stratum most likely to be blocked by reg
   3(d), and the one that most needs testing.
5. **Positioning and residency.** Decide that VP is software the intermediary operates, not a managed telemarketer.
   Keep any pilot's recordings and transcripts in India-region storage until counsel answers Q6.

---

## 9. Gaps, contradictions and blocked hosts

**Not retrieved**

- The **IRDAI Information and Cyber Security Guidelines 2026** themselves. The guidelines listing links only the
  2-page cover circular [R30], so the data-location answer uses the 2023 text [R29].
- The **TRAI 31-12-2024 and DoT 23-12-2024 letters**, which are not published.
- **Telco 1600 pages** for Airtel, Vi and Knowlarity. assets.airtel.in reset the connection.
- **egazette.gov.in** is still TLS-blocked via the proxy (B01), so the Third Amendment and DPDP Rules Gazette dates
  are unconfirmed.
- **India Code** (round 1, 504), so the SBSR Act's changes to s.40 and s.44 were not checked.

**Contradictions on file**

- **Exotel vs TRAI.** Exotel's blogs call 1600 the government series and 1601 the BFSI series [R13, R14]. TRAI says
  1600 is BFSI plus government and 1601 is non-BFSI service [R06, S08]. Primary wins, and Exotel's other 1600 claims
  are treated as low confidence.
- **Vobiz's description of 160.** Vobiz says "DND bypass: Allowed for pre-consented transactions" and "24 × 7" [R11].
  TRAI's rule is that service and transactional calls are not subject to preference blocking and have no time band
  [S01, S03]. Same effect, different framing. Vobiz also states 140 hours as 9 AM-9 PM, against TRAI's 10:00-21:00
  default [S01].
- **Plivo vs Vobiz on documents.** Plivo lists a regulator certificate [R09]; Vobiz's list does not [R11].
- **Commencement days.** Round 1 used publication plus 30, 60 and 90 days (2026-10-18, 11-17, 12-17). The strict
  reading of "after thirty/sixty/ninety days" gives 10-19, 11-18 and 12-18. Both depend on an unconfirmed Gazette
  date.

**Method notes**

- The Operations master circular (R25) is scanned. Its outsourcing, orphan-policy commission and repeal pages were read
  from page images at 85 dpi. The excerpts in `primary-excerpts.txt` for R25 are this package's own transcription.
- The CA Regulations Schedule VII text layer is column-scrambled for clauses 7.3 and 8. Those clauses were read from
  the scrambled text, and the excerpt file paraphrases them, marked as such.
- Search budget used: 6 queries. All conclusions rest on fetched primary text except R42 (DPDP compression), which is
  search-summary only and marked low confidence.
