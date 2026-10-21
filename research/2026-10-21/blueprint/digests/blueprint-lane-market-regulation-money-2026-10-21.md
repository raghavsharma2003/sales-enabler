# Market, regulation and money VP must fit

Date 2026-10-21. Lane: market, regulation, money. Grades: **M** measured by us (n and method named), **O** observed (primary text, page, capture or API read-back we saved), **V** vendor-claimed, **I** inferred, **U** unknown. Paths are relative to `/home/user/sales-enabler/`. Short tags: SY2 = `research/2026-10-17/SYNTHESIS-v2.md`; SY18 = `research/2026-10-18/SYNTHESIS.md`; RS = `research/2026-10-20/teardown/regulation-segment/report.md`; TS = `research/2026-10-20/teardown/SYNTHESIS.md`; WT = `research/2026-10-21/walkthroughs/SYNTHESIS.md`; L1 = `research/2026-10-17/lanes/l1-regulation/report.md`; L3 = `lanes/l3-segments/report.md`; L4C = `lanes/l4c-incumbents-distribution/report.md`; R2R = `lanes/r2-untouched-raw/findings.md`; COR = `lanes/CORRECTIONS-round2.md` (all lanes under `research/2026-10-17/`); RAD = `research/2026-10-20/teardown/radar/report.md`.

No buyer interview result is in the repo (`data/discovery/` does not exist). No call has crossed an Indian phone line (DIRECTION.md). No vendor invoice has been read. Every rupee figure below is rate card x usage unless stated.

---

## 0. The answer in twelve lines

1. **Post-sale first is a regulatory fact, not a taste.** A neutral service call needs no explicit consent, is not blocked by DND, and has no TRAI calling band. A promotional call needs 140xx, the 10:00-21:00 window, DND-scrubbed numbers and, for DND-registered people, consent in a register that only 11 pilot banks can upload to (O; RS section 0, RS-03/04/07/10/12/13/15).
2. **The paying jobs, in order:** due-date reminders (renewal, pre-due EMI or payment, service appointment), then onboarding and application follow-up. Consented inbound-lead follow-up is wave 2. Cold outbound, surveys and default-stage collections are out of v1 (RS section 4; `rejected.2026-10-20.regulation-segment-cold-outbound-lead`).
3. **Only one segment is robust: insurance renewals through intermediaries, and it is small** (S0 about INR 107 Cr a year at the price card, 58 Cr without the big platforms). It is a door, not a market. The venture case needs other BFSI 1600 service calls (INR 166 Cr) and non-BFSI post-sale (INR 1,980 Cr, weakest evidence) (SY2 section 7).
4. **Insurance is also the most contested and most regulated variant of the lightest job family.** At least 10 Indian offers already sell insurance renewal calling; funded specialists (Desible, Navana, Gnani) are concentrating there; IRDAI adds 1600, solicitation, telemarketer, 10-year India-records rules (SY2 section 6; RAD).
5. **Every AI call is A2P.** TRAI refused every AI carve-out. Every sender must pre-declare A2P use and CLI ranges on DLT from about 2026-11-17/18 on every number series. No Indian vendor documents this. VP can ship the export (O; R2R 1.1; RS-08/26).
6. **Compliance is a floor, not the wedge.** 0 of 6 dashboards put consent, DND or DLT on the campaign form; compliance is 1.3% of 459 coded Indian complaints (O; WT section 1; RS-45). It matters because it fails suddenly: numbers are barred at every operator.
7. **Price benchmarks:** Indian self-serve lists sit at INR 3.0-6 per minute (Sarvam 3.00-3.50 + 0.40 telephony; Gupshup "from 3.50"; Ringg 6; Bolna about 5.7-6.1). Global platforms land at INR 8-37 per Indian minute. Short calls make pulse length matter as much as rate: Sarvam's 3.50 becomes 7.40 on a 30 s call (O/I; TS section 6).
8. **VP cost of goods:** the cheapest measured cascade costs INR 0.94 AI-only and about 1.44 all-in per minute at 3-minute calls (M, single pass, n=30 turns; SY18 section 2). That is 28% gross margin at INR 2. A realistic persona-and-memory mix gives 14%.
9. **INR 2 per minute at 40-60% margin is not reached by any stack we measured end to end.** It needs the unheard Inworld path (desk INR 0.53 AI-only, at about 250k min/month) or self-hosting (desk INR 0.43-0.51, from about 2.5M min/month). Managed Azure never reaches 2 (floor INR 2.31 at 50M min/month) (SY18 section 0; COR section 2).
10. **The Base-tier price (INR 2.99) was built on a stock Azure neural voice, which round 1 rated 1.5-4.5 of 10 by ear.** The tiers must be re-priced once the default voice is chosen (`open.2026-10-20.reprice-tiers`; DIRECTION.md). The owner accepts lower margin but not a worse voice (`directive.2026-10-19.hear-before-choose`).
11. **Per-minute pricing loses money at launch for a managed per-renewal service** (gross margin -47% to +1% at INR 6-8; SY2 section 4). Under the owner's self-serve framing that finding applies differently: the buyer staffs escalations. Re-run it before the blueprint fixes the pricing unit.
12. **Distribution evidence says sales-led.** Self-serve voice AI averages about INR 4,900 per customer per month (Bolna, computed); the owner's INR 25k-2 lakh band is where sales-led vendors sit. Tickets above INR 15,000 per debit cannot ride UPI or card auto-debit (L4C section 1).

---

## 1. Segments and the jobs that pay

### 1.1 The TRAI service-call asymmetry (O, primary text re-fetched 2026-10-20; RS section 2, TS section 2.2)

| | Neutral service call (3rd Amendment def (bh)(i)) | Promotional call |
|---|---|---|
| Consent | none explicit; inferred consent lasts the contract (memo para 39). (bh)(ii) "facilitating an ongoing purchase" needs explicit consent valid 7 days | explicit; CRF-registered for DND numbers; CRF upload piloted with 11 banks only |
| DND | not blocked; FULLY BLOCK migrates to BLOCK PROMO about 2026-11-03 | blocked without registered consent. 224M of 1.348bn subscribers (16%) hold a preference |
| Window | no TRAI band (RBI 08:00-19:00 for lender recovery from 2027-01-01) | 10:00-21:00 default |
| Series | 1600xx for RBI, SEBI, IRDAI, PFRDA entities "even with consent"; 1601xx utilities and logistics; declared 10-digit otherwise | 140xx only |
| DPDP | s.7(a) covers calling a customer about what she bought | bought lists lose their basis about 2027-05-13 |
| Evidence to keep | relationship only | inquiry gives 7 days; application 3 months; the 12-month post-purchase limb is gone |

- **One promotional line makes the whole call promotional** (2nd Amendment def (av)). No cross-sell, upsell or offer may ride a service message (memo para 37). The regulatory unit is the content of each call, not the campaign type, so an in-call category fence is the core compliance primitive (I).
- **Counterweight (O):** Q1 FY27 140-series volume was 13.16bn calls against 1.15bn on 1600 (about 11x). Post-sale first trades market size for lower friction and risk (RS-46).
- **Pre-sale is not viable as the lead** because it needs infrastructure nobody can buy: CRF upload for non-banks, 140xx provisioning in the tenant's name, and a decaying DPDP basis for bought lists (RS section 0).

### 1.2 Segment scorecard and pools (L3; M for counts and crawl, I for sizing)

Frozen weights, 19 segments, 10,000 Dirichlet draws. **Only insurance renewals is robust** (rank 1, P(top 3) = 1.00; ties real estate at 3.722 when post-sales share is set to 0). Positions 2-6 are close. Apna crawl n = 3,855 unique phone-role posts; classifier 49/60 = 81.7% out of sample.

| Segment | Score | Triangulated pool, INR Cr/yr (range) | Ticket p50, INR/month | Why it pays or does not |
|---|---|---|---|---|
| Insurance renewals (via intermediaries) | 3.85 | 94 (18-1,118) | about 1.0 lakh | persistency pain is primary (LIC 13th month 64.1%, private median 77%); 874 brokers, 689 corporate agents, 940 IMFs, 23 web aggregators on the register |
| Real-estate inquiry qualification | 3.45 | 830 | about 64k | largest pool; pre-sales, so consented inquiries only; Sell.Do, LeadSquared bundle voice |
| D2C post-purchase (COD, NDR) | 3.40 | 88 | about 19k | fails a price floor: Shopify apps at INR 2.375-3.3; value per call INR 10-75; `rejected.2026-10-17.d2c-per-minute` |
| Lending early-bucket and collections | 3.35 | 473 | about 2.1 lakh | heaviest conduct regime; 8-19 window and recording from 2027-01-01; "recovery agency" question open; warmth reads as manipulation |
| Fintech and app onboarding | 3.35 | 124 | n/a | post-sale; no KYC data by voice |
| Hospitals and clinics | 3.25 | 643 | about 52k | thin pain evidence; about a third of postings are acquisition |
| Edtech admissions | 3.15 | 505 | about 59k | pay risk; minors need parental consent from 2027-05 |

- Sum of triangulated centrals about INR 4,150 Cr; the firm-based method gives INR 9,618 Cr and overstates auto, diagnostics, D2C and solar by 3-17x against event-based checks (L3 section 5).
- Implied Indian voice-agent revenue today is about INR 148 Cr, roughly 1.5% of the L3 serviceable pool (I; SY2 section 7, SEG-13).
- **B2B SMB telesales is 22-28% of phone-role postings** and out of scope in L3. It is the largest telecalling pool and was never researched as a VP segment (U).
- Human baseline: telecaller fixed pay median INR 17,000-20,000 a month (M, Apna n = 1,234 and 3,811); government call-centre seat bids INR 36.7k-47.3k a seat-month (O, R2R section 2.2). Defensible human cost INR 6-9 per connected minute (I; COR section 2).

### 1.3 Job matrix (RS section 3, `research/2026-10-20/teardown/regulation-segment/job-matrix.csv`; all rows I)

| Job | Category and series | Modules needed | Verdict |
|---|---|---|---|
| Renewal reminder | service if neutral and before expiry; 1600 for BFSI, 1601 or declared 10-digit otherwise | M1, M2, M4, M6 (+M7 insurance) | **LEAD** |
| Pre-due payment or EMI reminder | service (memo para 39); lender 08-19 likely from 2027 | M1-M4, M6, light M7 | **LEAD** |
| Onboarding, documents pending, application follow-up | service (bh)(i); applicants (bb)(iii) | M1, M2, M4, M5, M6 | **LEAD** |
| Service-appointment reminder | service | light | rides the reminder template |
| Feedback or NPS | category open; use 10-21 conservatively | light | add-on after counsel |
| Customer-success check-in | service only while purely informational | light-medium | after the fence is proven |
| Lead qualification (consented inquiry) | promotional, 140xx, 7-day window | M1-M6, M8 | wave 2 |
| Collections in default | service on 1600 plus RBI regime | M1-M4, M6, M7 | phase 2, trigger 2027-01-01, after counsel |
| Cold outbound, win-back, surveys | promotional or unclear; DPDP-decaying | heavy | avoid |

Modules: M1 category classifier and promotion fence; M2 series and CLI routing, A2P export, number health; M3 window engine; M4 suppression, opt-out, attempt caps; M5 consent and inquiry ledger; M6 DPDP notice, recording, retention, residency; M7 sector packs (RBI, IRDAI); M8 dependencies VP cannot control (operator scrub, CRF).

### 1.4 Beachhead v2 and the self-serve tension

- **Beachhead v2** (`decision.2026-10-17.beachhead-v2`, SY2 section 0): renewal service calls for retail insurance intermediaries, 4W motor first, health second, "inform, confirm, hand off", VP as software on the intermediary's own 1600 number, price per renewal collected.
- Under the self-serve framing (`directive.2026-10-18.self-serve`, `directive.2026-10-20.product-brief`) RS section 5 proposes it become the **first vertical preset and design-partner set on a shared post-sale core**, with presets for insurance renewal (IRDAI pack), lending pre-due (RBI window and logs), and subscriptions or utilities (1601 or declared numbers). Managed per-renewal pricing conflicts with self-serve (red-team N1, N4).
- Buyer facts that bite (SY2 section 12): IMFs average about 64-75 health and 36-42 life policies a year (M/computed from IRDAI Handbook); the INR 15k monthly minimum prices out firms below about 935 due renewals a month; a 3-seat desk is about 6,800 due renewals a month; revenue for a 1,500-due mixed broker is about INR 24k a month. Small and mid intermediaries are unserved partly because they are small.
- **Dated risk:** IRDAI's 2026-09-23 consultation proposes commission caps (health renewal 5%, old-vehicle motor OD 10% and TP 2.5%, life renewal 2-3%). Comments close 2026-10-25. Value per save falls to 0.33-0.49x (model); the car fee window against a working desk nearly closes (about INR 27-32 ceiling against a INR 28 floor) (SY2 section 2, KC9).

### 1.5 Who already sells the job (do not repeat "thin competition")

`rejected.2026-10-17.thin-competition` stands. At least 10 Indian offers sell insurance renewal calling; insurers and aggregators automate renewals in-house at roughly 80% contribution margin (CMP-17, REN-22). Funded entrants: Desible (INR 32 Cr, 2026-10-07, lists a "Policy Renewal Agent"), Navana (INR 40 Cr, claims 100M+ BFSI minutes), Gnani (claims 12M+ renewals), Ringg (USD 10M; Policybazaar named as a client for lead qualification) (V; RAD RAD-42/43/49). What is unoffered is narrow: a managed per-renewal service for small and mid intermediaries, and that gap may exist because the segment is hard to serve profitably (SY2 section 6).

---

## 2. Regulation as product requirements

Status: desk reading of primary text, **not legal advice**. All legal readings need counsel (lawyer brief: SY2 section 3.7; RS section 9).

### 2.1 Requirement table

| # | Rule (fact, grade, source) | Product requirement |
|---|---|---|
| R1 | Call category decides everything; one offer line makes a call promotional (O; RS-01/02) | **M1**: per-call category set on the campaign and enforced in the conversation by a code gate (promotion, solicitation, discount and alternative-plan fence; safety by predicate, not instruction) |
| R2 | 140xx promotional only; 1600xx mandatory for RBI, SEBI, IRDAI, PFRDA entities for service calls from 2026-01-01 to 2026-03-15; 1601xx utilities and logistics (migration about 2026-11-08); everyone else declared 10-digit (O; RS-07) | **M2**: number step that states series, KYC documents, time and price before any credential; series chosen from sector and category; tenant-held numbers |
| R3 | 140, 1600, 1601 cannot be AI-flagged as spam or app-tagged and are exempt from the A2P charge; declared 10-digit numbers get neither (O; RS-09, R2R 1.3). Operators flag by recipient diversity, short calls, low incoming:outgoing ratio; 5 flagged CLIs in 10 days leads to KYC re-verification then barring (O; L1 claim 11) | **Number health**: pacing against the three signals, "Suspected UCC" monitoring, steering tenants to designated series |
| R4 | Every AI call is A2P (3rd Amendment def (ea)); senders pre-declare A2P use and CLI ranges to their operator on DLT, due about 2026-11-17/18 (60-day bucket; Gazette date unconfirmed); undeclared calls are UCC (O; RS-08, R2R 1.1) | **A2P CLI-range declaration export**, ready before 2026-11-18; dated must-be; 0 of 8 vendors have it (TS section 3) |
| R5 | A2P termination charge up to INR 0.05/min, 140/1600/1601 exempt; Airtel and Jio asked for INR 0.50/min on all commercial calls and Airtel for INR 0.05 per attempt (O; R2R 1.2) | Cost meter carries a per-attempt A2P line; price card has a pass-through clause (reversal R5 in RS) |
| R6 | Promotional window 10:00-21:00; no band for service calls; RBI 08:00-19:00 recovery from 2027-01-01 and a borrower's time request is honoured (O; RS-15/36) | **M3**: window derived from category x sector x recipient request, in the recipient's local time; never 00:00-23:59 by default (Retell's default); a humane service window is a product choice |
| R7 | BLOCK PROMO never blocks service calls; Schedule II changes not in the 90-day annexure; scrubbing is the operator's job (O/I; RS-10/11) | **M4**: tenant-wide suppression list, in-call opt-out ("dobara call mat karna") captured by default, carried across campaigns and API calls, attempt caps. Never market NCPR scrubbing |
| R8 | Inquiry gives 7 days, application 3 months; evidence must "on its face appear genuine to an objective, reasonable observer"; Third Amendment 30-day bucket already in force from about 2026-10-18 (O; RS-12/13) | **M5** consent and inquiry ledger with expiry, evidence export within the operator's 3-business-day verification clock; wave 2 |
| R9 | From the 90-day bucket (about 2026-12-17/18) a template in the wrong category is blacklisted; five blacklistings in 90 days suspend the sender for a month (O; RS-06) | Category-correct templates; WhatsApp utility versus marketing separation in the same agent |
| R10 | Sanctions land on telecom resources: first proven violation bars all resources at all operators for 15 days, repeat brings one-year disconnection and blacklisting. Q1 FY27: 137,053 resources barred, 46,786 disconnected, 263 senders blacklisted; about 75% of April 2026 disconnections were SIP/PRI (O; RS-39/43) | **Bring-your-own-carrier, numbers in the tenant's name** so bars attach to the tenant (recommended option (a), L1 section 1). If VP resells trunks it counts as sender or aggregator and one abusive tenant can bar all VP numbers |
| R11 | No TRAI duty to disclose AI to the callee; but a deceptive call is UCC (2nd Amendment (bw)); RBI harsh practices include misleading statements and anonymous calls; Retell's terms require business name and purpose at call start; IT Rules 2026 synthetic-audio disclosure may or may not reach a B2B platform (O/V; RS-33/34/35, L1) | **Non-removable AI disclosure and business name and purpose on every creation path**, templates and copilot output included, disclosed once and lightly, never denied (also owner rule `req-47`). 0 of 8 vendors make disclosure non-removable; Sarvam's template claims to be a "virtual assistant", Sarvam's demo persona claimed human 6/6 (O/M; WT section 5, SY2 CMP-07) |
| R12 | DPDP Rules gazetted 2025-11-13: Rule 4 (consent managers) about 2026-11-13, core duties about 2027-05-13. Rule 3 notice must be self-contained with a withdrawal link; Rule 6 requires one-year logs and processor-contract safeguards; no general localisation; penalties up to INR 250 Cr (O; RS-27 to 32) | **M6**: recording announcement, one-sentence purpose, Rule 3 link by SMS or WhatsApp after the call, India-region storage by default, retention chosen at onboarding (never indefinite), PII redaction on by default (Aadhaar, PAN, bank, card), processor contract and audit trail as product artefacts |
| R13 | TCCCPR exempts nobody from DPDP; the regimes stack (O; RS-14). Meta bars using WhatsApp Platform Data to train models except one model for a single business (O; L1 claim 23) | No cross-tenant pooled learning (`rejected.2026-10-17.cross-tenant-pooling`); memory is per tenant and per contact, consented, viewable, editable, deletable |
| R14 | IRDAI: 1600 mandatory from 2026-02-15 "irrespective of consent" (O; REG-20); persuading renewal is solicitation at medium confidence and only certified humans with approved scripts may solicit in the telemarketing channel (REG-26/27); IMFs may not use telemarketers (REG-29); brokers' core functions cannot be outsourced (REG-30); intermediary records including call records in India at least 10 years, ICT logs 180 days (REG-31/32); tele-callers announce recording (REG-21 of 2011 guideline, applicability unverified) | **M7 IRDAI pack**: "inform, confirm, hand off"; code gate routes persuasion, re-quote, alternatives and discounts to a named certified human; India storage; recording notice; VP is a processor, software the intermediary operates |
| R15 | TRAI wrote that small BFSI players "may be exempted" from mandatory 1600 and may use it optionally; the reg 3(1) proviso lets TRAI classify senders; no direction found by 2026-10-17 (O; R2R 1.3) | Number router must support a 1600-optional path and a 10-digit fallback; flag exposure to AI flagging on the fallback |
| R16 | RBI/2026-27/230 from 2027-01-01: 08:00-19:00; call time and count logs; two-way recordings kept 6 months with notice; grievance officer on every recovery communication; IIBF-certified recovery agents; explicit TCCCPR compliance (100AB). 100A/100Y wording likely extends the window to pre-due calls; a vendor running recovery as a managed service is plausibly a "recovery agency" (O/I; RS-36 to 38) | **M7 RBI pack**: window and logs enforced by construction; collections in default stays phase 2 until counsel answers |
| R17 | SEBI MF/AMC entities 2026-02-15, QSBs 2026-03-15; PFRDA 2026-02-15, all via TRAI's 1600 direction (O; L1 claim 9). RBI KYC rules and the sibling directions 223-229, 231 not read (U) | Sector presets for banks, NBFC, MF, pension; read the unread RBI directions before the lending preset |
| R18 | CNAP from 2026-11-01 on 4G-and-above; business or bulk connections may show a verified preferred name (registered trademark or GST trade name); SIP/PRI 1600 behaviour unstated (O/I; R2R 4.2) | Onboarding captures trademark or GST trade name for the CNAP preferred name; measure display and pickup once live |
| R19 | The call has the shape of a known scam: fake renewal and "lapsed, pay to revive" calls with correct policy data; Navi Mumbai raid, 32 telecallers, at least INR 14.08 lakh; IRDAI itself warns policyholders (O; R2R 4.1) | **Trust design**: no payment on the call; payment only via the insurer portal, app or a link on its domain, or an autopay option; verifiable callback on the published number; never "fund value", "bonus", "refund" framing; attempt caps |
| R20 | WhatsApp: business-initiated needs opt-in; utility INR 0.115, marketing INR 0.8631 per message; permission-based calling, 7-day temporary permission, 100 connected calls a day per number; cold marketing templates dropped with error 131049 (O; L1 claims 22-26, L4C 3a) | Same agent follows up on WhatsApp with utility templates in the 24-hour window; no cold WhatsApp marketing |
| R21 | RBI e-mandate framework 2026-04-21: AFA-free recurring debit up to INR 15,000 (INR 1 lakh for insurance premiums, mutual funds, credit cards) (O; L4C 3c) | Billing: UPI or card prepaid wallet for small tickets; invoice, NEFT, annual or quarterly prepay with GST and TDS handling above about INR 15k a month; autopay ask for customers' premiums |
| R22 | Residency: LIC's AI-voice RFP bars foreign-hosted APIs, GPT, Claude, Gemini; self-hosted in India, open or indigenous models, over 50% Indian ownership, 24 lakh minutes a year priced per minute with per-second pulse (O; R2R 2.1). Only 4 of 8 incumbents run the call path in India by default (TS section 5) | India call path by default; residency as architecture and contract item for BFSI; a self-hosted open-model option is the price of the insurer step (S1) |

### 2.2 Compliance calendar (dates the blueprint must respect)

| Date | Event | Source |
|---|---|---|
| in force (about 2026-10-18) | 7-day inquiry and 3-month application limbs (30-day bucket) | RS-12 |
| 2026-10-25 | IRDAI distribution consultation comments due | SY2 3.6 |
| 2026-11-01 | CNAP on 4G+ | R2R 4.2 |
| about 2026-11-03 | FULLY BLOCK migrates to BLOCK PROMO | RS-10 |
| about 2026-11-08 | 1601 migration for utilities and logistics | L1 claim 10 |
| about 2026-11-13 | DPDP Rule 4 (consent managers); IRDAI answer from counsel requested | RS-27, SY2 |
| 2026-11-17 | Gemini 3.1 Live and 3.1 flash TTS shut down; Hume ends 11-13 | SY18 section 8 |
| 2026-11-17/18 | A2P pre-declaration; 60-day bucket | RS-08, REG-36 |
| about 2026-12-17/18 | 90-day bucket: wrong-category template blacklisting | RS-06 |
| 2027-01-01 | RBI recovery conduct; IRDAI policy tagging; Gemini TTS 3.x doubles in price | RS-36, REG-38, SY18 |
| 2027-01-31 | Fresh CoR applications for existing intermediaries | REG-38 |
| 2027-04-14 | gpt-4.1-mini and gpt-4o (India Standard) retire | LAT-08 |
| about 2027-05-13 | DPDP core obligations | RS-27 |

### 2.3 What competitors leave to the buyer (O; RS section 2.12, WT section 1)

- **Bolna:** optional calling window (off by default, bypass flag); 0 strings for DND, consent, DLT, A2P, opt-out or AI disclosure in 257 dashboard chunks; customer "solely responsible".
- **Sarvam:** org DND list in API only (recipe card in UI); "calling compliance is your responsibility"; 10-digit rented numbers only.
- **Exotel:** says voice needs no DLT (contradicted by primary text), gives 9-21 hours, presents a telco disincentive as a sender fine, claims an NDNC check.
- **Retell:** batch calls ignore DNC; window default 00:00-23:59 Mon-Sun; US-law clause only. **Vapi, ElevenLabs, Synthflow:** nothing for India.
- **SquadStack (V):** claims DNC scrub, 9:30-20:30 window, consent gating; sells "spam number rotation".
- Pre-registered predictions to score on the account phase: REG-P1 to P8 (RS section 9; `research/2026-10-20/teardown/synthesis/predictions-consolidated.json`).

### 2.4 Operating model and liability (I; RS section 2.11)

- Tenant is the TCCCPR Sender, the DPDP Data Fiduciary and the regulated entity. A CPaaS or telemarketer lending CLIs is a sender or aggregator. VP as bring-your-own-carrier software is probably not a sender, but "caused the call to be made" (def (bf)(iii)) is a counsel question. VP is a DPDP processor (s.8(2)). VP could be a recovery agency or telemarketer if it runs calls as a managed service.
- VP cannot legally connect its own calls to the PSTN; unauthorised telecom service carries a penalty up to INR 10 lakh (Bill text, medium). Becoming a VNO is reported at INR 12.5 lakh per service area plus 8% of AGR (secondary) and still depends on a parent network.

### 2.5 Open legal questions, in priority order

1. Is a neutral renewal reminder by software on the intermediary's 1600 number "solicitation" or does VP become a telemarketer? 2. May an IMF use AI software at all (reg 3(d))? 3. Managed AI calling: outsourcing or buying technology? 4. Is bring-your-own-carrier software a Sender under (bf)(iii)? 5. Is a feedback or NPS call commercial? 6. Does RBI 100Y bind pre-due reminders and is a lender-supervised AI a recovery agency? 7. May inference run outside India while records stay in India? 8. Who earns commission when the customer renews directly with the insurer? 9. Lapse revival after expiry. 10. IT Rules 2026 audio-disclosure duty for a B2B platform. 11. Do small IRDAI intermediaries fall in a sender-class 1600 exemption, and does A2P pre-declaration apply on 1600? (SY2 3.7; RS 9)

---

## 3. Price benchmarks, INR per connected minute (FX INR 95 per USD, ex-GST)

Economics file: `research/2026-10-20/teardown/synthesis/economics.csv`. Telephony and rate cards: `research/2026-10-17/lanes/l2-economics/data/vendor-and-telephony-prices.csv`. **All-in figures are computed from rate cards; no invoice has been read** (TS section 9).

| Vendor | List | All-in INR per Indian connected minute | Pulse and traps | Margin read |
|---|---|---|---|---|
| Sarvam | INR 3.50 PAYG, 3.25, 3.15, 3.00 Business (Business plan INR 1,99,999, purchasable [Ot]) | 3.4-3.9 whole-minute; 4.4-7.4 on 30-90 s calls; plus INR 0.40/min telephony | 60 s agent pulse; telephony INR 0.20 per 30 s; simulated run INR 2 | list is 2.3-3.0x its own API cost (INR 1.16-1.33 at API list) (I) |
| Gupshup Voice AI | "from INR 3.50" (USD 0.035), 100 free minutes; launched 2026-09-04 | unknown; prediction is at least 4.50 all-in (pre-registered) | telephony inclusion not stated | unknown (V) |
| Ringg | INR 6 all-in; number INR 499/month | 6 | minimum not in rendered page today (U) | unknown |
| Bolna | USD 0.06 (3.5 voice + 0.5 telephony + 2 platform, 30 s pulse); top-ups to 0.045; pilot USD 500 per 12,000 min | 5.7-6.1 PAYG (dashboard shows about INR 5.72); 4.2-6.6 on volume; secondary claim INR 1.75-2 enterprise unverified | 30 s pulse; USD billing | 46-72% PAYG (I) |
| ElevenLabs | USD 0.08/min all plans; burst 2x; LLM extra; no numbers sold | 8.2-8.9 via Exotel or Plivo; 12.5-15 via Twilio; 15.8-16.5 in burst | dashboard default LLM costs 2.4x the schema default | unknown (analogue refuted) |
| Retell | USD 0.055 infra + voice + LLM (USD 0.07-0.31); burst +USD 0.10/min on by default; prompts over 4k tokens scale billed time | 8.3-13.6 BYO trunk; 16.7-20 with a 6k prompt; 22-37 on Retell numbers | USD only; identity check before any country | infra 72-86% (I) |
| Vapi | USD 0.05 hosting + pass-through; Twilio-only outbound for India | 12.5-17.0 (about INR 9.46 before any AI) | headline excludes telephony and turn wait | unknown |
| Synthflow | enterprise only from USD 30k a year | 15.2-25.6 estimate (INR 47.5 at 5k min/month if the floor is usage) | review-gated | 39-69% (I) |
| SquadStack | "typically INR 2-5/min" incl. telephony (V); per-use-case setup fee; BFSI success fees; "Two rupees a minute is a trap" | 2-5 | live-conversation billing | at INR 2 negative on ElevenLabs Flash (-15 to -36%), 23-34% at INR 3.5 (I) |
| Exotel | plans published; VoiceBot and AgentStream unpublished; PSTN INR 0.80-1.00 | quote-gated | 60 s pulse | VoiceBot COGS INR 1.42 / 1.95 / 3.60 (lo/mid/hi) |
| Caller.digital | INR 10.15 itemised (carrier 1.04, STT 0.73, LLM 0.62, TTS 1.68, server 0.84, LiveKit 0.14, support 2.10, platform 3.00); BYOK 9.42 | 10.15 | support plus platform about half the price | AI layers INR 3.02 (O) |
| MyOperator | INR 10,000 for 2,000 min (INR 5) withdrawn; now custom plan with a human "AI Agent Manager" | n/a | sells the operation, not the tool | n/a |
| Smallest Atoms | USD 0.09-0.21 | 8.6-20 | | |
| Others (USD) | Ultravox 0.05 incl. TTS; Bland 0.14 (no Indic); Cartesia 0.06 + 0.014; Deepgram agent 0.041-0.163; OpenAI GPT-Live-1 0.05 flat; PolyAI 0.02 + tokens; Ravan 0.02-0.10; VoiceGenie 0.20 | 2.0-19 | | |
| Scalysis (Shopify D2C app) | INR 2.375-3.3 | 2.4-3.3 | | |
| Human telecaller | n/a | INR 6-9 per connected minute | | seat-month INR 17-47k |

**Reading (TS-19/20).**
- Pulse length is as important as rate for Indian reminder calls, which are mostly under 90 s.
- The global platforms are 2-7x the Indian band on any realistic Indian path.
- Every incumbent whose cost can be rebuilt keeps enough margin to follow a price cut (`rejected.2026-10-17.parity-undercut`); price alone is not a wedge, per-second billing and one fee line can be (W8).
- Telephony: Plivo INR 0.38/min on 30 s pulses (number INR 200/month); Sarvam/Vobiz INR 0.40 (number INR 59 per 30 days); Tata Smartflo about INR 0.22 at full FUP; Twilio INR 4.7-6.6 (not viable); Exotel INR 0.80-1.00 on 60 s pulses. **1600 per-minute price is published nowhere** (REG-24); sensitivities INR 0.60 and 0.80 cut Base margin from 49% to 35% at 3 minutes.
- WhatsApp BSP markup about 26% over Meta (AiSensy utility INR 0.145 against 0.115).
- Self-serve complaints: support, billing and refund disputes dominate (111 low-star reviews: support 68%, billing 27%, implementation 23%; 459 coded Indian items: support 114, billing 107, account/UI 99, reliability 71); compliance 6 of 459.

---

## 4. VP cost of goods, by stack, and the path to INR 2

### 4.1 Budget arithmetic (SY18 section 1, M model, n = 20,000, seed 20261019)

Allowed AI cost = net price x (1 - margin) - telephony - INR 0.03 infrastructure. At INR 2 ex-GST: INR 0.34-0.74 AI budget (INR 0.54 at 50% margin). If INR 2 includes GST it is INR 0.22-0.56. With 1600 at INR 0.80 a minute, the 60% row goes negative.

### 4.2 AI cost per connected minute by stack (3-minute call; INR; M unless stated)

| Stack | AI | COGS (incl. telephony) | Margin at INR 2 | Evidence and caveat |
|---|---|---|---|---|
| **C6g**: gated transcribe-live + gpt-oss-120b (Groq) + Azure neural | 0.94 (MC 0.91-1.22) | 1.44 | 28% (14% with realistic persona and memory) | measured end to end, 1 pass, 30 turns; sends audio outside India; STT billing unverified (41% of cost) |
| C6 same, ungated STT | 1.24 | 1.74 | 13% | measured |
| C1g all-Azure gated + gpt-4.1-mini | 1.36 | 1.85 | 7% | 1 pass |
| C1 all-Azure ungated | 2.19 | 2.68 | -34% | measured |
| DragonHD variants (C2/C3) | 2.70 | 3.20 | -60% | measured |
| G-E gated STT + gpt-oss + Gemini 3.8 Flash-Lite TTS | 0.98 (1.34 in 2027) | 1.47 (1.84) | 26% (8%) | computed composite from measured parts |
| G-A all-Gemini (flash-lite) | 1.56 (1.92) | 2.05 (2.42) | -3% (-21%) | computed composite |
| Sarvam STT + gpt-oss + Bulbul V4 Flash | 1.04 | 1.54 | 23% | desk |
| Inworld all-in (STT-1, Gemma 4 26B, TTS-2 Flash), Growth credits | 0.53 | 1.02 | 49% | desk; needs about 250k min/month; Hindi quality, India latency, residency unverified |
| Self-host IndicConformer + gpt-oss + Veena, 50% utilisation | 0.43 (from 2.5M min/month) | 0.93 | 54% | desk, vendor-claim throughput; 2-GPU floor makes it INR 6.50 at 100k min/month |
| gpt-realtime-2.1-mini with prefix cache | 1.91 | 2.41 | -20% | desk; ungated audio, rejected as speaker (`rejected.harvest.01`) |
| Gemini 3.1 Live / 3.8 Live (paid meter, n = 1-2 per cell) | 4.2-5.7 at 3 min; 6.4-12.7 at 10 min | 4.7-6.2 | -134% to -211% | every turn re-bills the audio context; 3.8 talks over the caller on 42% of turns; no India region; 3.1 shuts 2026-11-17 (`rejected.2026-10-19.gemini-live-at-rs2`) |

- **Sensitivities:** persona and memory +13k tokens takes C6g from 0.94 to 2.15 at 3 minutes; call-length mix, FX +-5% (+-INR 0.05); the 2027-01-01 Gemini TTS doubling adds INR 0.37/min (3.8 Flash-Lite TTS) or 0.55 (3.8 Flash TTS). Cascade cost is flat with call length (10-minute is 1.05-1.15x 1-minute); Live is 3.8-4.4x.
- **Meera's "about INR 1.3 a minute" was a code-constant estimate, never a measurement** (`rejected.2026-10-19.maya-1p3`): the paid meter gives INR 2.47 at 1 minute on her own model.
- **Round-1 conflict:** human ratings put Azure-voice stacks at 1.5-4.5 of 10 and Gemini 3.1 Live at 7.0; every stack's content was robotic, a brief problem fixed by brief v2 (words per turn 33 to 20) but not yet re-rated by humans (DIRECTION.md). The cheap C6g voice is therefore the stock Azure neural voice that was rated worst. Reply gaps from India: 3.8 Live 0.8-1.6 s; Flash-Lite cascade 1.6-2.2 s; 3.8 Flash cascade 2.9-4.2 s; first audio MAI-Voice 2.1 Flash 425 ms, Gemini 3.8 Flash-Lite TTS 624 ms, Flash TTS 772 ms. Turn-taking cuts in on 15-42% of turns on every stack.

### 4.3 Earlier managed-service COGS (different scope; do not mix)

`lanes/l2-economics` (COR section 2): managed Azure COGS INR 5.88 at 100k min/month (p10-p90 5.00-6.96), 3.23 at 1M (2.84-3.70), floor INR 2.31 at 50M. That model includes Voice Live, VP-borne escalation, WhatsApp and 1600 carriage (all-in INR 7.9-8.8 per AI minute at launch). Hybrid with ASR on T4: 2.65 at 1M. Self-hosted at scale: 2.25 at 5M (P(<=2) 0.15). **D-lite (GPT-6 luna plus self-hosted speech): INR 1.19 at 5M, reaching INR 2 from about 1.6M min/month.** The two COGS families differ because SY18 prices a pure self-serve platform on cheaper cross-provider parts while SY2 prices a managed service. The blueprint must pick the scope.

### 4.4 The path to INR 2 per minute (owner ambition, `directive.2026-10-17.price-target`)

1. **Today:** no measured stack gives 40-60% margin at INR 2. Closest: INR 2.25 for the agent plus telephony passed through at cost (about INR 0.40-0.48) keeps 44% on C6g; INR 2.00 plus telephony gives 37% (SY18 section 0).
2. **Cheap paths needing proof** (each must pass the listener panel and India latency battery first): Inworld all-in (about 250k min/month), self-host (about 2.5M min/month), D-lite (about 1.6M min/month). Drop Base to INR 2.49 when one passes and billing reconciles within 10%; to INR 2.00 when self-host carries at least 2.5M min/month at 50% utilisation.
3. **Component levers:** Azure commitment tiers still leave the Azure path at INR 0.78 at 10M min/month; Tata concurrency plans make telephony about INR 0.22; per-second billing; prompt caching; gating STT on voice activity.
4. **Forecast (I):** managed-stack end-2027 P50 INR 2.98 with LLM prices flat, INR 1.89 in the optimistic cut process; first frontier price rise (GPT-5.2) already happened; FX held flat so forecasts lean optimistic (COR section 6).
5. **Reversal:** if live meters put the managed stack at or below INR 2.5/min at 1M min/month, plan on the cut process (check quarterly; next 2027-01-15).
6. **Owner guidance:** margin may be compromised, voice may not; no self-hosting until volume (`req-02`, `req-42`). INR 2 is a scale-stage COGS target, not a launch price and not a launch prerequisite (SY2 section 4.4).
7. **Unknowns that move it:** 1600 carriage price, A2P charge direction (INR 0.05 now, telcos want 0.50 and per attempt), GST treatment (ex-GST assumed; input credit for imported services a CA question), card/UPI fees (about 2%, unmodelled), reconciled invoices (Google transcribe-live gating, OpenRouter ledger 1.2-1.77x).

---

## 5. Tiers and pricing structures

### 5.1 Proposed 2026-10-19 tiers (SY18 section 5, `research/2026-10-18/model/results/tiers.csv`; ex-GST per connected minute, telephony included)

| Tier | Stack | Price (incl. GST) | COGS (p10-p90) | Gross margin | Status |
|---|---|---|---|---|---|
| Base: human-like emotional voice | C6g + stock Azure neural + persona and light memory | **INR 2.99** (3.53) | 1.72 (1.51-1.93) | 43% (49% at reference) | **stale**: voice assumption contradicted by round 1; needs INR 2.86 for 40% |
| Base-HD fallback | DragonHD voice | 3.49 | 2.26 | 35%; INR 3.77 needed for 40%, 4.52 for 50% | |
| Plus: learning agents | Base + 2-8k tokens learned memory + post-call pass (gpt-4.1-mini, South India) | **INR 3.99** (4.71) | 2.14 | 46% | learning adds prompt tokens, about INR 0.09/min per 1k tokens; pass INR 0.04-0.29 |
| Premium: deep personalisation, dedicated voice | Azure STT + gpt-4.1-mini (India) + Custom Neural Voice | **INR 6.49** (7.66) + INR 3.5 lakh/month per voice | 3.52 | 46% | Custom Neural Voice limited-access approval unverified; gpt-4.1-mini retires 2027-04-14 |

Kill criteria for tiers are in SY18 section 5 (human-likeness against A/A noise floor; billing above INR 1.25 AI at 3 minutes; p50 above 1.2 s or cut-ins above 5% on a real line; margin below 40% two months running; STT metering). Owner direction: human voice is in the base; learning and deep personalisation are higher tiers (`req-36`); each tier must pass the listener panel before it is sold as "exactly human".

### 5.2 Per-outcome card for a managed insurance service (SY2 section 4; pre-registered, not changed on calls)

INR 50 per car renewal, INR 15 per health, INR 15 life, INR 20 two-wheeler, collected on the AI-worked list; INR 15,000 monthly minimum credited against usage; 10% holdout never billed. Launch gross margin 66.5% car, 45.3% health, 33% life, 12.7% 2W; the 40%-margin floors are 28 / 14 / 17 / 29. Fees equal INR 10-23 per AI minute. Two definitions move margin most: which renewals count as "collected" (19-29% arrive before the first AI attempt) and who staffs escalations (7-21 points). Pilot and LOI asks: car and health only. A quarterly holdout report is noise for health and life below about 25k due a month.

### 5.3 Pricing-unit decision the blueprint must make

| Unit | Evidence for | Evidence against |
|---|---|---|
| Per connected minute, self-serve | Matches all Indian incumbents, LIC's RFP unit, and the owner brief | Loses money at launch on a managed service (-47% to +1% at INR 6-8); incumbents can follow cuts |
| Per outcome (renewal collected, EMI paid, site visit) | Buyers think in outcomes; Tata/TTBS, Caller.digital and SquadStack price this way; RAD predicts more by 2026-11-20 | Needs attribution; holdouts take months (motor) or years (health, life); conflicts with self-serve |
| Hybrid: minute floor plus outcome kicker | not yet modelled | U |

Wallet and billing design points: INR with GST, 30 s pulse at most, one fee line, per-campaign estimate before launch, spend caps by workspace and API key (0 of 5 API-tested vendors have one), burst opt-in, low-balance and overdrawn states (W8; WT section 2.15).

---

## 6. Distribution channels (L4C section 3c, `lanes/l4c-incumbents-distribution/channels.csv`)

| Channel | Fit and economics | Conflict |
|---|---|---|
| **Founder-led sale to an enumerable list** (IRDAI register about 2,500 intermediaries; about 1,300 in reach) as an outcome-linked concierge pilot | high fit for insurance renewals; pilots 2-8 weeks, BFSI production 8-12+ weeks, 90-day commitments; Bolna enterprise deals use forward-deployed engineers | none; the only measured cold funnel (a different ICP) was 0 wins in 8,784 sends (M, inherited), so use named lists and warm intros |
| CPaaS bring-your-own-bot (Exotel AgentStream, Ozonetel SIP, Vobiz, Plivo, Tata) | needed for numbers and 1600; Vobiz takes about 70% of revenue from AI voice startups; Exotel via AgentStream costs INR 0.46-0.69/min more than Plivo (EXO-37) | HIGH: Exotel, Ozonetel, Gupshup/Knowlarity, MyOperator, TTBS all sell their own bots, so they are infrastructure and rivals, not resellers |
| PoSP and insurtech platforms (Turtlemint 550,000+ PoSPs, 46 insurers; RenewBuy; InsuranceDekho) | one signature can reach thousands of agent books | may build in-house |
| CRM connectors (LeadSquared 1,600+ customers, Zoho 1M+ customers, Kylas flat INR 12,999/month) | build only when two paying customers need it | LeadSquared ships Invorto; Sell.Do ships a voice agent; Zoho has Hindi ASR, agents and MCP and may ship a calling agent in 6-12 months |
| WhatsApp BSP networks (AiSensy 5,000+ partners, 20% recurring affiliate; WATI; Interakt) | voice follow-up add-on on opt-ins; Meta calling permission caps fit consented service calls | BSPs add text agents; none ships AI voice yet |
| Self-serve product-led (card or UPI sign-up) | Bolna 75% of revenue self-serve, about 1,050 customers, about INR 4,900 per customer-month, pilots rose USD 100 to 500 | low ticket; "not sticky, always a price game" (Ringg founder, TechCrunch 2026-08-25) |
| Shopify App Store | cheapest D2C channel (no fee on first USD 1M) | crowded; low ticket |
| Telco SMB resellers (TTBS, 60M+ SMB claim) | | HIGH: sells its own agent |
| Associations (IBAI), CA networks, SIs | medium for insurance | |

Ticket (computed, claims are floors): Bolna about INR 4.9k, Zoho about 5.9k, Ozonetel 26-37k, Exotel up to 49.5k, Gupshup up to 51k, LeadSquared about 1.7 lakh, Gnani 2.2-2.4 lakh per customer-month. Payment norms: annual or quarterly prepay plus 18% GST, often TDS (2% under 194J or 10%: ask a CA); refusal to refund unused prepaid credits recurs in complaints. Churn and CAC: no primary Indian data; Freshworks NDR 104% (Q2 2026).
**Inferred conflict:** the owner's self-serve framing and the INR 25k-2 lakh buyer band point at different channels. Self-serve earns about INR 5k a customer; the ticket band needs sales-led onboarding and invoice billing.

---

## 7. Competitive map

| Group | Players | Where they are strong | Where they leave room (evidence) |
|---|---|---|---|
| Global self-serve platforms | Vapi, Retell, ElevenLabs Agents, Synthflow | breadth, tooling, evals, copilots (chat setup ships at 5 of 6 dashboards, so it is parity) | US-anchored call path (4 of 8); US numbers and KYC gates; no India compliance; no Hinglish mode (0 of 6); INR 8-37 all-in; USD billing |
| Indian full-stack voice AI | Sarvam, Bolna, Ringg, Gupshup+Knowlarity, Smallest | Indic models, INR price, owned or BYO Indian numbers | compliance left to buyer; 60 s pulses; Bolna short replies discarded; no reply-gap display |
| Managed BFSI specialists | SquadStack, Gnani, Navana, Desible, Tata/TTBS Commotion, Samora | outcome pricing, human hand-off, enterprise BFSI logos | cannot be trialled; sold by sales; insurer-focused; Gnani and SquadStack sell to insurers, not small intermediaries |
| CPaaS and carriers moving up | Exotel (AgentStream, VoiceBot), Ozonetel, MyOperator, Gupshup, Tata | own numbers, 140/1600 provisioning, install base (Exotel 7,000+ enterprises) | quote-gated pricing; MyOperator now sells a human "AI Agent Manager"; Exotel docs stale |
| CRMs bundling voice | LeadSquared (Invorto, Pipecat), Sell.Do, Salesforce (Agentforce Voice in Hindi, 2026-05-19), Zoho (building blocks) | own the records | "good enough" bundled voice; VP must win on measured call quality, not suite size |
| Infrastructure and tools | LiveKit (India region, USD 0.01/min), Pipecat 1.13.0, Deepgram, Cartesia, PolyAI Dialog-RSN-1, OpenAI GPT-Live-1, Coval and Hamming (evals) | cheap brains and substrates | none sell to the Indian buyer |
| Exits | Air.ai exited (FTC suit Aug 2025) | | |

**Moving into VP's lane (timing risk, TS section 4):** ElevenLabs has an unreleased outbound-campaigns product in its dashboard bundle (leads, suppression, retry queue; EL-06..08; scoring horizon 2027-01-31) and a Memory (Alpha) tab; SquadStack opened a self-serve builder and a second brand (Osno), both gated; Gupshup launched self-serve; Tata/TTBS prices per outcome (re-triage 2026-11-20). Seven Indian voice-AI rounds in 2026-04..10: Vobiz USD 1M, Smallest USD 13M, Ringg USD 10M, Navana INR 40 Cr, Dialflo USD 180K, Desible INR 32 Cr, RevRag USD 2.5M (V). Changelog pace over six months: ElevenLabs 195 agent items, Vapi 82, Bolna 72, Synthflow 67, Sarvam 58, Retell 80 SDK releases.

**Where the evidence says VP can be measurably better (hypotheses W1-W10, TS section 4; none proven for VP itself):** compliance by default and CSV hygiene (W1, W2: 0 of 8 ship category-aware windows, in-call promotion fence, A2P export or consent ledger); failure explainability (W6); time to first Indian-CLI ring (W7); fair billing (W8); human support in IST (W9); API/MCP parity so chat can run a campaign end to end (W10). Reply gap and Hinglish turn-taking (W3, W4) are open for VP too (our stacks cut in on 15-42% of turns). Price is not a wedge. Voice quality against ElevenLabs is not a wedge. Language hold against Sarvam is not a wedge (Sarvam held 38 of 40 Hindi turns).

**What the first-person dashboards add (O; WT):** 0 of 6 predict a reply gap; headline latency and cost leave out telephony and the turn wait (Vapi about 1,530 ms displayed against 2,319 ms measured on a demo agent); no spend caps; several defaults hold lines open or raise spend (Retell burst on, 10-minute silence, 1-hour max, keep-forever data; ElevenLabs end-call tool off); no Indian number price shown before purchase at any vendor; none reached a ring on an Indian line. Memory is live at Retell (2,000-character brief per contact) and Synthflow; learning loops are human-gated everywhere.

**Learning from them always:** `research/2026-10-20/teardown/radar/watchlist.json` holds 67 URLs with baselines; re-triage triggers are a round of USD 5M or more, an all-in price of INR 4 or less, a new Indian telephony integration, a named BFSI customer, a self-serve launch, or a deep-set vendor going enterprise-only. Vendor terms bar competitive evaluation at 5 of 6 vendors (Vapi the exception); owner override `directive.2026-10-20.terms-override` with the kept lines in `decision.2026-10-20.teardown-lines`; opt out of training on our data before any trial call.

---

## 8. Corrections and conflicts the blueprint must carry

- **A2P date:** 2026-11-17 (L1, publication + 60 days) versus 2026-11-18 (RS, strict reading). Plan for the 17th; Gazette date unconfirmed.
- **Promotional hours:** primary text says 10:00-21:00; Bolna and Exotel publish 9-21.
- **TRAI AI rule:** "outbound-AI rules in force since 2026-03-10" is unsupported (`rejected.2026-10-17.harvest-trai-ai-rule`).
- **Exotel's INR 1,000 per complaint** is a telco disincentive, not a sender fine (RS-18).
- **Latency:** US-East numbers overstated India latency 2-5x (`rejected.2026-10-17.ohio-latency`); India server-side clean-turn p50 1.0 s, handset estimate 1.25-1.45 s unmeasured.
- **Bolna:** 6 cents includes the platform line with 30 s pulses (O, WT section 6); number KYC accepts individuals; so Bolna's anchor is lower than the earlier 6.1-8.0.
- **Round-1 versus round-2 COGS and tiers** conflict (section 4.3 and 5.1); Base INR 2.99 is stale.
- **KC9:** IRDAI commission proposal decides whether the car fee window survives.
- **Competition is not thin** at the job; the Policybazaar-as-Ringg-client fact is lead qualification, not renewals (RAD).
- **Pickup on 1600:** no neutral data; Truecaller's "79% of 1600 calls ignored" is an interested party with no baseline; industry says 140/160 lowers pickup, Tata and Exotel claim the opposite (R2R 4.3). Interviews and the pilot must measure it.

---

## 9. What the blueprint should therefore contain (market, regulation, money)

1. A **post-sale core** (reminders, onboarding follow-up) with M1-M7 as defaults that cannot be turned off, and AI disclosure non-removable.
2. A **number step** (series, KYC, time, price first), bring-your-own-carrier with Plivo primary, tenant-held numbers, A2P declaration export before 2026-11-18, CNAP name capture.
3. **Sector presets** (insurance IRDAI, lending RBI, utilities/logistics 1601, general declared numbers) over one core; insurance as the first design-partner set.
4. A **stack picker that shows India-measured p50 and p90, INR per minute and a Hinglish sample on every row**, and an all-in INR headline including telephony, pulse and turn wait (`decision.2026-10-21.wt-synthesis-stack-picker-all-in`).
5. **Billing**: INR and GST, wallet plus invoice, spend caps, per-campaign cost, A2P and WhatsApp lines, pulse stated.
6. **India call path and storage by default**; residency as contract term; self-hosted open-model option held back until volume (the LIC-type insurer step).
7. **Pricing**: re-price Base after the voice is chosen; decide the pricing unit (section 5.3); keep the per-renewal card for the managed insurance concierge pilot only.
8. **Trust and anti-scam design** on every renewal call; **honest attribution** (holdout never billed, report only when powered).
9. **Evidence plan**: buyer interviews (kill criteria KC1-KC4), counsel (KC5, KC8), handset battery (KC6), invoice reconciliation, 1600 quote and streaming test, pickup measurement.

## 10. Not established (carry into the blueprint as "unknown")

No buyer interview result. No call on an Indian line. No reconciled invoice. 1600 price and third-party AI streaming on 1600. Whether intermediary renewal reminders are solicitation (KC8). Whether bring-your-own-carrier software is a Sender. Pickup on 1600 versus mobiles. AI-versus-human outcome parity (assumed 0.5-1.05). Desk productivity (due renewals per telecaller). CAC, churn and SMB willingness to pay for voice (no primary data). Unread: RBI KYC rules, RBI directions 223-229 and 231, IRDAI cyber annexure, IT Rules primary text, the TRAI Tanla 2024 and Go2market 2026 responses. Weak evidence: policyholders skew older and Hindi-belt (unsourced assumption), renewal lists arrive as spreadsheets (weak vendor evidence), pool sizes for non-BFSI post-sale.
