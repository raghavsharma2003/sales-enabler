NOTE TO COORDINATOR: the harness refused the Write of /home/user/sales-enabler/research/2026-10-20/teardown/regulation-segment/report.md ("subagents should return findings as text"). The full report text follows. Please restore it to that path. claims.json, job-matrix.csv, manifest.csv and the inbox file were written.

# Teardown lane `regulation-segment`: pre-sale or post-sale first, and which job

Date: 2026-10-20 (account-free phase). Serves decision 1 (pre-sale or post-sale first, and which job). Also feeds decision 2 (the compliance features in the v1 floor) and decision 3 (where incumbents measurably fail).

Status: research, not legal advice. Every legal reading here is a desk reading of primary text. It needs the counsel review already listed in l1 §8 and round2 §7.

**Files.** All under `research/2026-10-20/teardown/regulation-segment/`:
- `claims.json`: RS-01 to RS-60. 40 observed, 17 inferred, 3 vendor-claimed.
- `job-matrix.csv`: 10 jobs × 14 columns.
- `manifest.csv`: 300 raw artifacts, 62.9 MB, under `data/teardown/regulation-segment/`.
- Graph proposals: `context/inbox/teardown-regulation-segment.json`.

**Tags.**
- `[RS-nn]` is a row in claims.json. `[REG/RAW/CMP/SEG-nn]` are rows in `research/2026-10-17/ledger.md`. `[parity]` is `l4a-competitors/parity.csv`.
- Grades:
  - observed: primary text, page or code read by us;
  - inferred: our reasoning, with its observations named;
  - vendor-claimed: vendor pages, or a secondary legal summary where the primary was unreachable;
  - unknown.

## 0. The answer

**Post-sale first.** Lead with two job families:
1. **Due-date reminders.** Renewal reminders and pre-due payment/EMI reminders, made before expiry or default. Service-appointment reminders are included.
2. **Onboarding and application follow-up.** Welcome and activation calls, documents pending, application incomplete. No KYC data is collected by voice.

**Pre-sale comes only as a second wave:** consented inbound-lead follow-up inside TRAI's 7-day inquiry window. **Never cold outbound.**

**Why.**
- **Service calls are lightly regulated.**
  - They need no explicit consent; inferred consent runs for the life of the contract [RS-03, RS-04, RS-12].
  - No DND preference blocks them once FULLY BLOCK migrates to BLOCK PROMO, around 2026-11-03 [RS-10].
  - They have no TRAI calling band [RS-15].
  - DPDP s.7(a) covers calling a customer about what she bought [RS-32].
  - A self-serve platform can therefore ship compliant post-sale calling with nothing outside its own control.
- **Pre-sale depends on infrastructure nobody can buy.**
  - Calls must come from 140xx [RS-07].
  - DND numbers are 16% of subscribers [REG-01]. They are reachable only with consent registered in the operators' Consent Register (CRF), and CRF upload is open only to 11 pilot banks [RS-13].
  - An inquiry gives 7 days, and the evidence must be kept [RS-12].
  - The default calling window is 10:00-21:00 [RS-15].
  - Bought lists of individuals lose their DPDP basis around 2027-05-13 [RS-27, RS-32].
- **Enforcement takes telecom resources, not money** [RS-39, RS-43].
  - Whoever holds the numbers carries the risk.
  - The 140, 1600 and 1601 series cannot be spam-flagged; declared 10-digit numbers can [RS-09].
  - So run on tenant-held numbers (bring-your-own-carrier, as in l1).
- **Every incumbent read leaves compliance to the buyer** [RS-21 to RS-24], and their guidance is stale or wrong (observed 2026-10-20):
  - Bolna and Exotel give 9 AM-9 PM as the TRAI window, against the primary 10:00 promotional start, and neither separates service calls, which have no window [RS-16].
  - Exotel says voice calls need no DLT registration [RS-17].
  - Exotel presents a financial disincentive on telcos as a penalty on senders [RS-18].
  - No Indian vendor mentions the A2P declaration due around 2026-11-18 [RS-26].
  - Bolna's shipped dashboard code has one compliance control: an optional calling window with a bypass flag [RS-20].
- **This is not the wedge.** Compliance is 1.3% of coded Indian buyer complaints [RS-45]. It is a Kano must-be: it fails suddenly, when numbers are barred at every operator. The wedge has to come from measured task failures (decision 3).
- **Counterweight.** In Q1 FY27, 140-series calls were about 11 times 1600-series calls (13.16 bn vs 1.15 bn) [RS-46]. Post-sale first is a friction and risk choice, not a market-size choice.

**Beachhead-v2** (`decision.2026-10-17.beachhead-v2`) matches on side and job family. It is, however, the heaviest regulated variant of that family:
- IRDAI's solicitation boundary;
- certified humans for persuasion;
- the IMF telemarketer ban;
- intermediary records kept in India for 10 years or more [REG-26, REG-27, REG-29, REG-31].

Under the owner's self-serve framing it should become the first vertical preset and design-partner set on a shared post-sale core, not the product boundary (§5).

## 1. What was read

**Primary texts re-fetched 2026-10-20**, each into its own directory under `data/teardown/regulation-segment/`:
- **TCCCPR 2018 and every amendment TRAI lists** [RS-41]:
  - the (Amendment) Regulations of 2018-12-21, which only set commencement dates, plus a corrigendum;
  - the Second Amendment of 2025-02-12;
  - the Third Amendment of 2026-09-18, including its Explanatory Memorandum.
- **TRAI directions:**
  - 1600 for RBI/SEBI/PFRDA entities (2025-11-19);
  - 1600 for IRDAI entities (2025-12-16);
  - 1601 (2026-08-10);
  - the CRF pilot (2025-06-13);
  - UCC_Detect (2026-02-27);
  - unregistered telemarketers on SIP/PRI (2024-08-13).
- **Press releases** PR 111/2026, 20/2026 and 91/2026, plus the live TRAI listings of directions, consultations, regulations and press releases.
- **DPDP Act** (TRAI-hosted Gazette copy) and **DPDP Rules 2025** from egazette.gov.in. The Rules had been blocked in both 2026-10-17 rounds.
- **RBI/2026-27/230** (NBFC Responsible Business Conduct Third Amendment Directions 2026), read in primary. rbi.org.in loaded without the CAPTCHA that blocked rbidocs.
- **Vendor public pages:**
  - Bolna: calling guardrails, regulated numbers, compliance application, llms.txt;
  - Sarvam: DND page, terms, llms.txt;
  - Exotel: calling-hours, TRAI, NDNC/DND, DLT, spam and data-privacy FAQs;
  - SquadStack: managed telecalling page;
  - Retell, Vapi and ElevenLabs: terms.
- **Bolna's public dashboard bundle:** 257 JS chunks reachable from platform.bolna.ai/login. Captured with REA and curl, then read statically. Nothing was executed.

**Byte-identity.** The fresh copies of TCCCPR 2018, the Second and Third Amendments, the 1601 direction, PR 111, PR 91 and the DPDP Act are sha256-identical to the 10-17 copies.

**Tool findings.**
- **TLS [RS-47].**
  - trai.gov.in serves an emSign chain whose root is not in the container's trust store.
  - egazette.gov.in omits the Let's Encrypt YR1 intermediate.
  - Both verify with Mozilla's root store (curl.se, dated 2026-10-20) plus the YR1 chain published on letsencrypt.org. Verification was never disabled.
  - This closes l1's "egazette TLS-blocked" gap.
- **REA 6.7.0 [RS-48].**
  - analyze-web-bundle produced no output and was killed at 300 s and again at 420 s.
  - capture-browser-scenario in launch mode has no proxy option, so navigation failed.
  - Connect mode to our own CDP Chromium worked and listed 115 script URLs.
  - Fallback: curl plus static grep.
  - Sarvam's dashboard answered with a Cloudflare challenge; not pursued.
- **Search.** About 8 web searches, used only to locate documents. Every conclusion rests on fetched text except the IT Rules 2026 duty [RS-35].

## 2. Findings by dimension

### 2.1 Call category is the whole game

All observed.

- **RS-01.** A commercial communication is a call whose primary purpose is to inform about, advertise or solicit business (TCCCPR 2018 reg 2).
- **RS-02.** One promotional line makes any commercial voice call promotional (2nd Amendment def (av)). Confirms REG-08.
- **RS-03.** Service call, 3rd Amendment (bh):
  - (bh)(i): information to *its Customer* on a product *procured by that customer* (warranty or service, recall, safety, balance, delivery, OTP). No explicit consent needed.
  - (bh)(ii): facilitating an ongoing purchase. Needs explicit consent, valid 7 days, renewable by the customer.
  - Confirms REG-35 and adds (ii).
- **RS-04.** No cross-sell, upsell or offer may go as a service message (memo para 37). EMI reminders run on inferred consent for the contract's duration (para 39).
- **RS-05.** TRAI said in 2018 that market surveys "may not be directly falling under" commercial communication. No later text classifies them. Exotel treats survey and feedback calls as UCC, 9-21. New.
- **RS-06.** From the 90-day bucket (on or after about 2026-12-18), a template registered in the wrong category is blacklisted. Five blacklistings in 90 days suspend the Sender for a month. New.

**Reading (inferred).** The regulatory unit is the content of each call, not the campaign type. An in-call category classifier with a promotion and solicitation fence is the core compliance primitive. Same as l1 gap 1.

### 2.2 Number series and A2P

All observed.

- **RS-07.** Series rules:
  - 140xx only for promotion;
  - 1600xx mandatory for service calls by RBI, SEBI, IRDAI and PFRDA entities "even with consent";
  - 1601xx for utilities and logistics, never for promotion.
  - Confirms REG-10, REG-20 and l1 S08.
- **RS-08.** Every AI call is A2P. Every Sender must declare its A2P use and CLI ranges to the originating operator, recorded on DLT. An undeclared call is UCC. Due on or after 2026-11-18 (strict reading). Confirms REG-07, REG-36 and RAW-01.
- **RS-09.** Designated series cannot be spam-flagged and are exempt from the A2P termination charge (up to ₹0.05 a minute). Declared 10-digit numbers get neither benefit.

**Reading (inferred).**
- BFSI tenants already hold a PE registration and 1600 CLIs, so their switching cost is low.
- Non-BFSI tenants outside 1601 run on declared 10-digit numbers:
  - they carry spam-flag exposure [REG-04, RAW-15, RAW-16];
  - telcos want the A2P charge raised to ₹0.50 a minute [RAW-02].
- Number-health monitoring therefore belongs in the post-sale core.

### 2.3 DLT, headers and templates

- **RS-17 (observed contradiction).** Exotel says "Voice calls do not require DLT templates or Entity IDs." The primary texts contradict this: PE registration, voice headers and 1600 templates, and A2P declarations recorded on DLT.
- **RS-19 (observed).** Bolna documents a buyer-side process:
  - PE registration on Tata DLT (₹5,900);
  - headers and templates;
  - PE and TM IDs for the 160-series via Plivo.
  - It names only an "RBI / SEBI certificate" (no IRDAI or PFRDA) and covers neither A2P nor 1601.
  - Extends CMP-27.

### 2.4 Consent

All observed.

- **RS-12.** Relationship (bb):
  - an inquiry gives 7 days;
  - an application gives 3 months;
  - the 12-month post-purchase limb is gone;
  - inferred consent from a transaction lasts for the contract.
  - Refines REG-09. The application limb is the legal home of applicant follow-up.
- **RS-13.** Explicit consent means CRF-registered, or legacy consent registered later. Upload has been piloted only with 11 banks. On a complaint, the consent must "on its face, appear genuine to an objective, reasonable observer".
- **RS-14.** TCCCPR exempts no one from DPDP (def (k), Explanation 3). The two regimes stack. New.

### 2.5 DND preferences and scrubbing

- **RS-10 (observed).** BLOCK PROMO never blocks service, transactional or government calls, in any time band. FULLY BLOCK migrates to BLOCK PROMO within 15 days of the 30-day commencement, so about 2026-11-03. The Schedule II changes are not in the 90-day Annexure.
- **RS-11 (inferred).** Scrubbing is a DLT-register comparison run by the operator. A platform can own only its suppression list, attempt caps and the handling of DND-blocked results.
- NCPR scrubbing marketed as a feature (SquadStack and Ravan claims [parity]) is mostly the operator's job.

### 2.6 Calling hours

- **RS-15 (observed).** Promotional: default 10:00-21:00. Service, transactional and government: no TRAI band.
- **RS-16 (observed).**
  - Bolna gives 9-21 for all outbound calls; its window is off by default and has a bypass flag.
  - Exotel gives 9-21 for promotional calls and does not enforce at the API.
  - Confirms l1 S28 and extends CMP-27 to Bolna.
- **RS-36 (observed).** RBI: 08:00-19:00 for recovery calls from 2027-01-01.
- **Reading (inferred).** The window engine should be keyed by category × sector × recipient request. For service calls, a humane window is a product choice, not law.

### 2.7 DPDP

All observed.

- **RS-27.** The Rules' Gazette is dated 2025-11-13. Rule 4 (consent managers) applies from about 2026-11-13; core obligations from about 2027-05-13. This resolves REG-05's "13 or 14" split in favour of the 13th.
- **RS-28.** Rule 3 notice must be self-contained and itemised, with a link to withdraw consent, exercise rights and complain. s.5 notice applies to consent under s.6, not to s.7 legitimate uses.
- **RS-29.** Rule 6: logs, one-year retention for breach investigation, and safeguards written into the processor contract.
- **RS-30.** No general localisation: s.16 negative list, Rule 15, Rule 13(4) for Significant Data Fiduciaries. Sector rules bind harder: IRDAI records stay in India for 10 years or more [REG-31].
- **RS-31.** Research exemption (s.17(2)(b) with Rule 16): applies only where the data is not used for a decision about a specific person. A possible basis for genuine surveys, not for brand surveys (inference). New.
- **RS-32.** s.7(a) covers calling a customer about what she bought. Bought lists need consent from about 2027-05-13. Confirms REG-05.

**Call audio (inferred).**
- A recording is personal data. Using it beyond the call's purpose needs a basis.
- Safe pattern:
  - announce the recording;
  - give the purpose in one sentence;
  - send the Rule 3 link by SMS or WhatsApp afterwards;
  - default to India-region storage.
- VP is a processor [RS-44]. Its contract and audit trail are part of the product.

### 2.8 AI disclosure

- **RS-33 (observed).** No TRAI duty to tell the callee it is an AI. Re-checked against TRAI's listings: directions to 2026-10-01, consultations to 2026-10-09. The only AI-specific duty is the A2P declaration to the operator. Confirms REG-06.
- **RS-34 (inferred).** A deceptive call is UCC [2nd Amendment (bw)]. RBI's harsh practices include misleading representations and anonymous calls [100Z]. Denying being an AI is exposed under both.
- **RS-35 (vendor-claimed, secondary only).** The IT Rules 2026 (G.S.R. 120(E)) impose a "prominently prefixed audio disclosure" duty. Whether it applies to VP is unresolved.
- **RS-24 (observed).** Retell's terms require the business name and purpose at call start, and AI disclosure when asked.
- **Reading.** VP's rule (disclose once, never deny) plus the business name and purpose should be a non-removable platform default. It is cheap and covers RS-34 and RS-35 either way.

### 2.9 Sector rules

**RBI (observed, primary) [RS-36, RS-37, RS-38].** From 2027-01-01:
- contact only 08:00-19:00, and the borrower's request to avoid a time is honoured;
- time and count of calls documented;
- two-way recordings kept 6 months, with the borrower told;
- harsh practices include excessive calling, calls outside the hours, threats, anonymous calls and misleading statements;
- the grievance officer's details on every recovery communication;
- a published list of recovery agencies;
- IIBF certification for recovery agents;
- explicit TCCCPR compliance (100AB).

Two inferences:
- 100A applies these rules to normal-course collection only "wherever explicitly specified", but 100Y says "collection / recovery". So pre-due EMI calls by an NBFC very likely fall under 08:00-19:00.
- A vendor running recovery calls as a managed service is plausibly a "recovery agency" whose agent cannot be certified [RS-38].

**IRDAI** (round 2, not re-read):
- 1600 mandatory [REG-20];
- persuading renewal is solicitation [REG-26];
- certified humans solicit [REG-27];
- IMF ban on telemarketers [REG-29];
- records in India for 10 years or more [REG-31];
- 2027 re-registration and tagging [REG-38].

**SEBI and PFRDA:** through TRAI's 1600 direction [RS-07]. **RBI KYC rules:** not read (unknown).

### 2.10 Enforcement

All observed.

- **RS-39.** Q1 FY27:
  - 137,053 resources barred;
  - 46,786 disconnected for a year;
  - 263 senders blacklisted;
  - about 75% of April 2026 disconnections were SIP/PRI (A2P) lines.
  - Sanctions take telecom resources. Confirms l1.
- **RS-43.** The ladder:
  - an unregistered sender's resources can be suspended;
  - a first violation bars all resources at all operators for 15 days;
  - a repeat brings one-year disconnection and blacklisting;
  - a CPaaS lending CLIs counts as the sender [REG-12].
- **RS-18.** Exotel's "₹1,000 per complaint per day" is the TCCCPR 2018 reg 27 disincentive on operators, not a penalty on senders. Second such misattribution on file.
- **RS-40.** As of 2026-10-20: no TCCCPR direction after 2026-10-01, no Q2 FY27 UCC release, no AI consultation.
- No published enforcement against an AI caller specifically was found. A LiveLaw opinion of 2026-08-31 calls for a disclosure rule and cites no case.

### 2.11 Liability

- **Enterprise (tenant).**
  - It is the TCCCPR Sender: it owns the CLI, causes the call, and its goods are offered (def (bf)) [RS-42].
  - Its resources are the ones barred [RS-43].
  - It is the DPDP Data Fiduciary, liable including for its processor [RS-44].
  - It is the regulated entity in its sector.
- **CPaaS or telemarketer holding the CLIs.** Sender or aggregator: one client's misuse can bar all its resources [REG-12]. Under IRDAI it falls in the telemarketer regime if it solicits [REG-27].
- **VP as bring-your-own-carrier software.** Probably not a Sender, but (bf)(iii) "caused … the call to be made" is a risk (inference, counsel). It is a processor under contract (s.8(2)). It could be a recovery agency or telemarketer if it runs calls as a managed service [RS-38].

### 2.12 What competitors leave to the buyer

- **Bolna (observed).** Confirms and extends [parity] `partial` and CMP-27.
  - Ships: an optional calling window (9-21, off by default, bypass flag), retries, a KYC "compliance application" and a DLT how-to.
  - Pilot terms: the customer is "solely responsible" for notices and consents for recording, data and use of AI.
  - No DND, consent, DLT, A2P, opt-out or disclosure code in 257 chunks [RS-16, RS-19, RS-20, RS-21].
- **Sarvam (observed).** Confirms [parity] `partial`.
  - An org-wide DND suppression list.
  - "Calling compliance is your responsibility" [RS-22].
- **Exotel (observed and vendor-claimed).** Contradicts and extends [parity] `unknown`.
  - Claims an automatic NDNC check on campaign uploads.
  - "Responsibility … lies with you."
  - Wrong hours, wrong DLT statement, misattributed penalty, survey and feedback treated as UCC [RS-05, RS-16, RS-17, RS-18, RS-23].
- **SquadStack (vendor-claimed).** Claims TRAI and DPDP compliance, anti-spam and an audit trail; earlier claims of DND scrub, a 9:30-20:30 window, consent gating and AI disclosure [RS-25].
- **Retell (observed).** A US-law telemarketing clause and contractual AI disclosure; no India clause.
- **Vapi (observed).** The customer is solely responsible; no India clause [RS-24].
- **ElevenLabs and Synthflow.** The parity rows stand; the Synthflow terms URL returned 404.

**Pattern (inferred).**
- Compliance is pushed onto the buyer by contract.
- The Indian vendors' docs predate the Third Amendment.
- Nobody ships a category fence, an A2P declaration, an inquiry/consent ledger with expiry, or sector presets.

## 3. Job matrix

Full cells are in `job-matrix.csv`; every row is inferred (RS-49 to RS-58).

**Baseline for every job:**
- PE registration on DLT;
- CLIs registered or declared;
- the A2P declaration, from about 2026-11-18;
- AI disclosure and a recording notice;
- optionally, a CNAP name from 2026-11-01 (needs a trademark or GST trade name) [RAW-08].

**Modules:**
- M1: category classifier plus promotion/solicitation fence.
- M2: series and CLI routing, A2P export and number health.
- M3: window engine.
- M4: suppression list, opt-out and attempt caps.
- M5: consent/inquiry ledger with 7-day, 3-month and contract expiry, plus CRF export.
- M6: DPDP notice, recording, retention, rights handling and residency.
- M7: sector packs (RBI, IRDAI).
- M8: things VP depends on but cannot control (operator scrub on 140, CRF upload).

**Pre-sale jobs**

- **Lead qualification.**
  - Category: promotional; series 140; window 10-21.
  - Needs inquiry evidence: 7 days for an inquiry, 3 months for an application. DND numbers need CRF consent.
  - Modules M1-M6 and M8: Heavy. Verdict: second wave.
- **Cold outbound and win-back.**
  - Category: promotional; series 140; window 10-21. Non-DND numbers only.
  - Needs DPDP consent from about 2027-05-13.
  - Heavy, with a decaying legal basis. Verdict: do not lead.
- **Market survey.**
  - Probably not commercial, but still A2P. Declared 10-digit numbers carry spam-flag risk.
  - The DPDP research exemption applies only to genuine research.
  - Modules M2, M3, M4, M6: Medium. Verdict: avoid.
- **Appointment setting.**
  - Sales appointments: promotional, like lead qualification.
  - Service appointments: service under (bh)(i), Light; they ride on the post-sale template.

**Post-sale jobs**

- **Renewal reminder.**
  - Service if neutral and before expiry. Series: 1600 for BFSI (including IRDAI intermediaries), declared numbers or 1601 otherwise. No TRAI window.
  - Zero promotion. Treat post-expiry lapse-revival as promotional until counsel says otherwise.
  - Modules M1, M2, M4, M6 (plus M7 for insurance): Light, or Medium-heavy for insurance. Verdict: **LEAD**.
- **Pre-due payment/EMI reminder.**
  - Service (memo para 39). Series: 1600 for regulated entities, 1601 for utilities, declared numbers otherwise. No TRAI window.
  - For lenders, 08-19 likely applies from 2027.
  - Modules M1-M4, M6 (plus a light M7): Medium. Verdict: **LEAD**.
- **Feedback/NPS.**
  - Category open; zero offers; use 10-21 conservatively.
  - Light. Verdict: add-on once counsel answers Q(c).
- **Onboarding/KYC/application follow-up.**
  - Service under (bh)(i); applicants under (bb)(iii). Series: 1600 for BFSI.
  - No KYC data by voice.
  - Modules M1, M2, M4, M5 (application evidence), M6: Medium. Verdict: **LEAD**.
- **CS check-in.**
  - Service only while purely informational. Needs a strict fence.
  - Light-Medium. Verdict: after the fence is proven.
- **Collections in default.**
  - Service on 1600, plus the RBI regime and the recovery-agency question. Window 08-19.
  - Modules M1-M4, M6, M7: Heavy, with a dated trigger (2027-01-01). Verdict: phase 2, after counsel.

**What the matrix shows (inferred).** M1, M2, M4 and M6 serve every job: that is the v1 core whichever side leads. Only pre-sale needs M8, plus M5 for inquiry evidence. Post-sale needs no consent infrastructure. Pre-sale needs consent infrastructure the regulator has not opened.

## 4. Recommendation and reversal

**Recommendation (inferred, RS-59).**
1. Post-sale first.
2. Family 1: due-date reminders, with service appointments included [RS-03, RS-04, RS-07, RS-10, RS-15].
3. Family 2: onboarding and application follow-up [RS-03, RS-12].
4. Second wave: inbound-lead follow-up within the 7-day window. Build M5 for it; treat CRF as an upgrade path, not a dependency.
5. Not in v1:
   - cold outbound;
   - surveys;
   - collections in default. Collections is a strong phase-2 vertical with a 2027-01-01 buying trigger.

**What would reverse it.**
- **R1.** Interviews show self-serve buyers' main job is inbound-lead follow-up. Then lead qualification moves into v1 with M5.
- **R2.** TRAI opens CRF legacy-consent upload to everyone, or DPDP consent managers ship working APIs. Then re-rank.
- **R3.** Counsel says non-BFSI, non-1601 senders may not make service calls from declared 10-digit numbers (l1 Q(a)). Then BFSI-only post-sale first.
- **R4.** TRAI adds an AI-specific consent rule or series for service calls [RAW-01].
- **R5.** The A2P charge rises toward ₹0.50 a minute or becomes per-attempt for declared numbers [RAW-02].
- **R6.** Counsel holds that intermediary renewal reminders are solicitation (KC8). Insurance drops; generic renewals are unaffected.
- **R7.** Measured pickup on 1600 or declared CLIs is too low for reminders to work. No neutral data exists yet [RAW-12, RAW-13].

## 5. Beachhead-v2 interaction

**Consistent.** It is the same job: a neutral renewal reminder, "inform, confirm, hand off", on the intermediary's own 1600, with VP as software [REG-35, REG-20].

**Under the self-serve, broad-enterprise framing** (`directive.2026-10-18.self-serve`, `directive.2026-10-20.product-brief`); all inferred:
- **Regulatory weight.** It is the heaviest variant of the lightest family. Generic reminders need only M1, M2, M4 and M6; insurance adds M7 [REG-26, REG-27, REG-29, REG-31, REG-38].
- **Operating model.** It is already the bring-your-own-carrier model that RS-43 recommends, and is not insurance-specific.
- **Pricing.** Managed per-renewal pricing conflicts with self-serve (red-team N1 and N4).

**Proposal.**
- Ship a shared post-sale core plus a due-date reminder template with presets:
  - insurance renewal (IRDAI pack; first design partners);
  - lending pre-due (RBI window and logs);
  - subscriptions and utilities (1601 or declared numbers).
- Beachhead-v2's interviews and kill criteria validate the insurance preset.
- Beachhead-v2 stays proposed; nothing here kills it. KC8 remains its main risk.

## 6. The three decisions

1. **Pre-sale or post-sale.** Post-sale: due-date reminders, then onboarding. Pre-sale only as consented inbound-lead follow-up. High confidence on the regulatory asymmetry; medium on the job choice, pending interviews.
2. **v1 floor (Kano).**
   - Must-be: M1, M2, M4, M6, and AI disclosure as a non-removable default.
   - Performance: M3 and number health.
   - BFSI delighter: sector presets.
   - Never market NCPR scrubbing [RS-11]. Compliance is a floor, not the wedge [RS-45].
3. **Where VP will be measurably better.** Three runnable tasks:
   - (a) a service script with an injected upsell must be fenced;
   - (b) a promotional campaign scheduled at 09:30 IST is refused, while a service campaign at 09:30 is allowed;
   - (c) the platform exports an A2P CLI-range declaration.
   - The docs predict incumbents fail (a) and (b) and lack (c) [RS-16, RS-17, RS-20, RS-26]. Score this as a prediction.

## 7. Account phase needs

See the `account_phase_needs` field.

## 8. Corrections on file

- **REG-05:** "13/14" becomes 2025-11-13. So Rule 4 applies from about 2026-11-13, and the core rules from about 2027-05-13.
- **REG-09:** add the 3-month application limb. The 12-month post-purchase limb is removed.
- **l1:** service calls are not DND-blocked. Confirmed, plus the FULLY BLOCK migration and no time band.
- **Surveys:** probably not commercial; Exotel says UCC.
- **Exotel "voice needs no DLT":** contradicted.
- **Exotel "₹1,000 per complaint":** actually a telco disincentive.
- **Bolna:** also states 9-21.
- **REG-13:** re-read in primary. Adds 100A (normal-course collection) and 100AB (TCCCPR).
- **egazette and TRAI:** now readable with verified TLS.

## 9. New lawyer questions

1. Is a feedback/NPS call service, commercial or neither? Is a third-party survey commercial?
2. Is bring-your-own-carrier software a Sender under (bf)(iii)?
3. Does 100Y bind pre-due reminders? Is a vendor AI that the lender configures and supervises a recovery agency?
4. Lapse revival after the contract ends (carried from round 2).
5. The IT Rules 2026 duty for a B2B voice platform (carried).

## 10. Limits

- No account, call or interview in this lane.
- Bundle evidence is client-side code only.
- IRDAI was not re-read.
- The RBI sibling directions for banks and other entities (223-229, 231) were not read.
- The IT Rules primary text was not fetched.
- The DoCA 2024 draft on unsolicited business communication: search found the draft only, no notification (unknown).
- Third Amendment commencement still rests on the notification date. The eGazette search is a form, and forms are not submitted under the lane boundaries.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Recommendation (inferred): post-sale first. Lead with due-date reminders (renewal and pre-due payment/EMI, service-appointment reminders included), then onboarding/application follow-up. Pre-sale enters only in a second wave, as consented inbound-lead follow-up in TRAI's 7-day inquiry window. Never cold outbound. Not in v1: surveys and collections in default.
- Asymmetry (observed): a service call (3rd Amdt def (bh)(i)) needs no explicit consent; inferred consent lasts for the contract's life (memo para 39). BLOCK PROMO never blocks service calls, and FULLY BLOCK migrates to BLOCK PROMO about 2026-11-03. TRAI sets no time band for service calls. DPDP s.7(a) covers calling a customer about what she bought. Pre-sale needs 140xx, a 10:00-21:00 window and 7-day inquiry evidence; DND numbers need CRF-registered consent, and only 11 pilot banks can upload consent today.
- Every AI call is A2P (3rd Amdt def (ea)). From about 2026-11-18, CLI ranges must be pre-declared to the operator on DLT on every number series; an undeclared call is UCC. None of the Indian vendor docs read (Bolna, Sarvam, Exotel) mention this, the Third Amendment or 1601.
- Vendor compliance docs are stale or wrong (observed 2026-10-20):
- Bolna and Exotel state TRAI hours as 9 AM-9 PM; the primary text gives a 10:00 promotional start and no band for service calls.
- Exotel says voice calls need no DLT registration.
- Exotel presents the reg 27 financial disincentive on telcos (INR 1,000 per count) as a sender penalty.
- Exotel treats survey and feedback calls as UCC, while TRAI's 2018 memo says surveys may fall outside commercial communication.
- Bolna's public dashboard code (257 chunks, 13.5 MB, captured via REA connect mode plus curl) has one compliance control: an optional calling window (off by default, with a bypass flag). It has 0 strings for DND, consent, DLT, A2P, opt-out or AI disclosure. Its pilot terms make the customer solely responsible for recording, data and AI consents. Sarvam, Exotel, Retell and Vapi likewise put compliance on the buyer.
- Shared v1 compliance core (Kano must-be): category classifier with an in-call promotion/solicitation fence, series/CLI routing with A2P declaration export and number health, tenant-wide suppression with attempt caps, a DPDP notice/recording/residency pack, and non-removable AI disclosure. Only pre-sale needs the modules that depend on CRF or operator scrubbing. Compliance is a floor, not the wedge: it is 1.3% (6/459) of coded Indian complaints.
- DPDP Rules, read in primary from eGazette (previously TLS-blocked): the Gazette is dated 2025-11-13, so Rule 4 applies from about 2026-11-13 and core obligations from about 2027-05-13 (resolves REG-05's 13/14 split). Rule 6 requires one-year log retention and processor-contract safeguards. There is no general localisation. s.17(2)(b) gives a research exemption, a possible basis for genuine surveys.
- RBI/2026-27/230, read in primary, applies from 2027-01-01:
- calls only 08:00-19:00;
- call time and count logs;
- two-way recordings kept 6 months, with notice;
- excessive or out-of-hours calling counts as harsh;
- grievance officer details on every recovery communication;
- IIBF-certified agents;
- explicit TCCCPR compliance (100AB).
The 100A/100Y wording likely extends the window to pre-due collection (inference). A vendor running recovery calls as a managed service is plausibly a 'recovery agency'.
- Beachhead-v2 (insurance renewals) matches on side and job family but is the heaviest regulated variant. Proposal: keep it as the first vertical preset and design-partner set on a shared post-sale due-date-reminder core (other presets: lending pre-due, subscriptions/utilities), not as the product boundary.
- Counterweight (observed): 140-series promotional volume was about 11x 1600 volume in Q1 FY27 (13.16 bn vs 1.15 bn). Post-sale first trades market size for lower friction and risk. Reversal conditions R1-R7 are listed: interviews favour lead follow-up, CRF opens to all senders, counsel rejects 10-digit service calls, AI-specific TRAI rules, A2P charge rises, KC8, low pickup.

### Pre-registered predictions for the account phase

- P1: at least 5 of 6 platforms (Bolna, Sarvam, Exotel, Vapi, Retell, Synthflow) let a promotional campaign start at 09:30 IST with default settings.
- P2: at most 1 of 6 platforms distinguishes service from promotional campaigns in a way that changes window, series or opt-out behaviour.
- P3: 0 of 6 platforms offer an A2P CLI-range declaration workflow or export by 2026-11-30.
- P4: an upsell line injected into a service script is spoken unblocked on 6 of 6 platforms (no in-call category fence).
- P5: a mid-call 'don't call me again' does not automatically add the number to a cross-campaign suppression list on at least 4 of 6 platforms.
- P6: the default agent template discloses AI at call start on at most 2 of 6 platforms.
- P7 (60%): Exotel's campaign upload flags our BLOCK-PROMO-registered test number as DND, so its vendor claim holds.
- P8: Sarvam's DND list, once a number is added via API, suppresses that number in every later campaign in the org.

### Needs a trial account to learn

- Window enforcement: on Bolna, Sarvam, Exotel, Vapi, Retell and Synthflow, schedule a promotional and a service campaign at 09:30 and at 21:30 IST. Record whether each is refused, warned, silently sent or bypassable.
- Category handling: can a campaign be tagged service vs promotional, and does that change series, window or opt-out behaviour? Inject an upsell line into a service script and check whether any in-call guard stops it.
- DND and suppression: upload a CSV containing our own test number set to BLOCK PROMO via 1909, and check what each platform reports (Exotel claims an automatic NDNC check; Sarvam has a DND list). Then say 'don't call me again' mid-call and check whether the number is suppressed across all campaigns.
- Attempt caps and retries: per-number daily and weekly caps, minimum intervals (Bolna's UI floor is 15 minutes), and whether the caps can be disabled.
- A2P readiness after 2026-11-18: does any dashboard, or the Plivo/Vobiz/Exotel provisioning flows inside Bolna and Exotel, collect or export CLI-range declarations?
- Number provisioning in practice: time and documents to a working 140, 1600 or 1601 CLI inside each platform; whether a non-BFSI declared-10-digit path is offered; whether media streams on 1600 lines (REG-25 is still unverified).
- Disclosure and recording defaults: does each default template disclose AI and recording, can a tenant remove the disclosure, and is there a recording-consent setting?
- Complaint evidence: can a tenant export the call record, consent or inquiry evidence and recording for one number within 3 business days, the operator's verification clock?
- Residency and retention: India-region options, retention controls and recording deletion.
- Consent capture: any consent widget, inquiry timestamping or CRF integration.

### Run facts

- Claims: 60 {"observed": 40, "inferred": 17, "vendor_claimed": 3, "unknown": 0}
- REA used: True
- REA notes: REA 6.7.0 (`npx -y rea-agents@latest`) installed and ran.

- `doctor`: unhealthy only for optional native engines (Ghidra, IDA, JADX, Hopper, Kuna), which this lane does not need.
- `analyze-web-bundle <CDP endpoint> <target>`: hung with no output twice, against a headless Chromium launched with `--proxy-server` and loopback CDP. Runs were killed at 300 s (`--observation-ms 6000`) and 420 s (`--allowed-origins https://platform.bolna.ai --observation-ms 3000`), rc=124.
- `capture-browser-scenario` in launch mode: failed with 'Scenario navigation failed before the initial state was captured'. The launch schema has no proxy option, so REA's own browser cannot reach the egress proxy.
- `capture-browser-scenario` in connect mode (`browser.mode=connect`, `cdp_endpoint` plus `target_id` of our own proxied Chromium): worked 2 of 2 times and captured network events, i.e. 115 script URLs for platform.bolna.ai/login.
- `list-browser-targets`: worked.
- Fallback: curl of the public assets (257 chunks after walking the chunk graph), then static grep. Nothing was executed.
- Sarvam's dashboard returned a Cloudflare 'Attention Required' challenge. It was closed and not bypassed.
- Evidence: `/home/user/sales-enabler/data/teardown/regulation-segment/rea-evidence/`.

Separate TLS finding (not REA):
- trai.gov.in serves an eMudhra emSign chain whose root is not in the container store.
- egazette.gov.in omits the Let's Encrypt YR1 intermediate.
- Both verified with Mozilla's root store (curl.se) plus the YR1 chain from letsencrypt.org, with no verification disabled. This unblocked the DPDP Rules primary text.

Gotcha: `pkill` or `pgrep -f` with the Chromium flag string matches the agent's own shell and kills it (exit 144). Use a bracket pattern such as `chrome-linux/chrom[e]`.
